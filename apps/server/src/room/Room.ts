import { randomUUID } from 'node:crypto';
import { PERSONALITIES, decideOutOfTurn, decideTurn, pickDelay } from '@uno/bot';
import {
  applyIntent,
  createGame,
  projectForPlayer,
  resolveTimeout,
  startNextRound,
  type EngineResult,
} from '@uno/engine';
import {
  LIMITS,
  safeResolveSettings,
  type AckResult,
  type BotDifficulty,
  type Emote,
  type GameEvent,
  type GameIntent,
  type GameSettings,
  type GameUpdate,
  type LobbyState,
  type PlayerId,
  type RoomClosedReason,
  type RoomMode,
  type ServerGameState,
} from '@uno/shared';
import { pickBotName, uniqueName } from './codes';
import type { GameRecord } from '../results';

export interface RoomTransport {
  lobby(state: LobbyState): void;
  game(playerId: PlayerId, update: GameUpdate): void;
  emote(playerId: PlayerId, emote: Emote): void;
  closed(playerId: PlayerId, reason: RoomClosedReason): void;
}

export interface RoomTimings {
  /** Pause between rounds in points mode. */
  readonly roundBreakMs: number;
  /** How long a disconnected human keeps their seat before a bot takes over (game) or the seat is freed (lobby). */
  readonly disconnectGraceMs: number;
  /** A room with no connected human is closed after this delay. */
  readonly idleTimeoutMs: number;
  readonly emoteCooldownMs: number;
}

export const DEFAULT_TIMINGS: RoomTimings = {
  roundBreakMs: 6000,
  disconnectGraceMs: 30_000,
  idleTimeoutMs: 5 * 60_000,
  emoteCooldownMs: 1500,
};

export interface RoomHooks {
  /** A seat was freed: its session must be revoked. */
  onSeatRemoved?(playerId: PlayerId): void;
  /** The room has no human left and has been disposed. */
  onDisposed?(): void;
  /** A game reached GAME_OVER with at least one human still at the table. */
  onGameFinished?(record: GameRecord): void;
}

export interface RoomOptions {
  readonly code: string;
  readonly mode: RoomMode;
  readonly hostName: string;
  readonly settings: GameSettings;
  readonly bots?: readonly BotDifficulty[];
  readonly transport: RoomTransport;
  readonly hooks?: RoomHooks;
  readonly random?: () => number;
  readonly now?: () => number;
  readonly timings?: Partial<RoomTimings>;
}

interface Seat {
  readonly id: PlayerId;
  readonly name: string;
  readonly isBot: boolean;
  readonly difficulty: BotDifficulty | null;
  connected: boolean;
  ready: boolean;
  /** Disconnected (or departed) human played by a bot. */
  autopilot: boolean;
  /** Human who left during a game: the seat stays until the game ends. */
  left: boolean;
  lastEmoteAt: number;
}

type Result<T = null> = AckResult<T>;
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (reason: Extract<Result, { ok: false }>['reason']): Result<never> => ({
  ok: false,
  reason,
});

const AUTOPILOT_DIFFICULTY: BotDifficulty = 'normal';

/**
 * One lobby + game. Owns the authoritative `ServerGameState`, serializes all
 * actions (Node runs each handler to completion, and the engine's version
 * check rejects stale out-of-turn intents), drives bots and timers, and
 * pushes a per-player projection after every transition.
 */
export class Room {
  readonly code: string;
  readonly mode: RoomMode;
  private settings: GameSettings;
  private readonly seats: Seat[] = [];
  private hostId: PlayerId;
  private game: ServerGameState | null = null;
  private turnDeadline: number | null = null;
  private disposed = false;

  private readonly transport: RoomTransport;
  private readonly hooks: RoomHooks;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly timings: RoomTimings;

  private automationTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly graceTimers = new Map<PlayerId, ReturnType<typeof setTimeout>>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RoomOptions) {
    this.code = options.code;
    this.mode = options.mode;
    this.settings = options.settings;
    this.transport = options.transport;
    this.hooks = options.hooks ?? {};
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };

    const host = this.createHumanSeat(options.hostName);
    this.hostId = host.id;
    for (const difficulty of options.bots ?? []) this.seats.push(this.createBotSeat(difficulty));
  }

  // ── Queries ────────────────────────────────────────────────────────────

  get hostPlayerId(): PlayerId {
    return this.hostId;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get maxPlayers(): number {
    return this.mode === 'solo' ? 1 + LIMITS.maxBots : LIMITS.maxOnlinePlayers;
  }

  hasPlayer(playerId: PlayerId): boolean {
    return this.seats.some((s) => s.id === playerId && !s.isBot && !s.left);
  }

  gameState(): ServerGameState | null {
    return this.game;
  }

  lobbyState(): LobbyState {
    return {
      code: this.code,
      mode: this.mode,
      hostId: this.hostId,
      maxPlayers: this.maxPlayers,
      settings: this.settings,
      inGame: this.game !== null,
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        isBot: s.isBot,
        isHost: s.id === this.hostId,
        connected: s.connected,
        ready: s.ready,
        autopilot: s.autopilot,
        ...(s.difficulty ? { botDifficulty: s.difficulty } : {}),
      })),
    };
  }

  // ── Lobby ──────────────────────────────────────────────────────────────

  /** Creates the host seat on construction, then other humans via `join`. */
  join(name: string): Result<PlayerId> {
    if (this.mode === 'solo') return fail('ROOM_FULL');
    if (this.game) return fail('GAME_IN_PROGRESS');
    if (this.seats.length >= this.maxPlayers) return fail('ROOM_FULL');
    const seat = this.createHumanSeat(name);
    this.broadcastLobby();
    return ok(seat.id);
  }

  updateSettings(by: PlayerId, patch: unknown): Result {
    const guard = this.requireHostInLobby(by);
    if (guard) return guard;
    const resolved = safeResolveSettings(patch, this.settings);
    if (!resolved.ok) return fail('INVALID_PAYLOAD');
    this.settings = resolved.value;
    this.seats.forEach((s) => (s.ready = s.isBot));
    this.broadcastLobby();
    return ok(null);
  }

  setReady(by: PlayerId, ready: boolean): Result {
    const seat = this.humanSeat(by);
    if (!seat) return fail('NOT_IN_ROOM');
    if (this.game) return fail('GAME_IN_PROGRESS');
    seat.ready = ready;
    this.broadcastLobby();
    return ok(null);
  }

  addBot(by: PlayerId, difficulty: BotDifficulty): Result {
    const guard = this.requireHostInLobby(by);
    if (guard) return guard;
    const bots = this.seats.filter((s) => s.isBot).length;
    if (this.seats.length >= this.maxPlayers || bots >= LIMITS.maxBots) return fail('ROOM_FULL');
    this.seats.push(this.createBotSeat(difficulty));
    this.broadcastLobby();
    return ok(null);
  }

  removeBot(by: PlayerId, botId: PlayerId): Result {
    const guard = this.requireHostInLobby(by);
    if (guard) return guard;
    const index = this.seats.findIndex((s) => s.id === botId && s.isBot);
    if (index === -1) return fail('INVALID_TARGET');
    const bots = this.seats.filter((s) => s.isBot).length;
    if (this.mode === 'solo' && bots <= LIMITS.minBots) return fail('NOT_ENOUGH_PLAYERS');
    this.seats.splice(index, 1);
    this.broadcastLobby();
    return ok(null);
  }

  kick(by: PlayerId, target: PlayerId): Result {
    const guard = this.requireHostInLobby(by);
    if (guard) return guard;
    if (target === by || !this.humanSeat(target)) return fail('INVALID_TARGET');
    this.removeSeat(target);
    this.transport.closed(target, 'kicked');
    this.broadcastLobby();
    return ok(null);
  }

  /** A human leaves voluntarily. */
  leave(playerId: PlayerId): void {
    const seat = this.humanSeat(playerId);
    if (!seat) return;
    this.clearGrace(playerId);
    if (this.game && this.game.phase.type !== 'GAME_OVER') {
      seat.left = true;
      seat.connected = false;
      seat.autopilot = true;
      this.hooks.onSeatRemoved?.(playerId);
    } else {
      this.removeSeat(playerId);
    }
    this.afterHumanChange();
  }

  connect(playerId: PlayerId): Result {
    const seat = this.humanSeat(playerId);
    if (!seat) return fail('SESSION_EXPIRED');
    this.clearGrace(playerId);
    seat.connected = true;
    seat.autopilot = false;
    this.clearIdle();
    this.broadcastLobby();
    if (this.game) {
      this.sendGame(seat.id, []);
      this.scheduleAutomation();
    }
    return ok(null);
  }

  disconnect(playerId: PlayerId): void {
    const seat = this.humanSeat(playerId);
    if (!seat || !seat.connected) return;
    seat.connected = false;
    this.clearGrace(playerId);
    this.graceTimers.set(
      playerId,
      setTimeout(() => this.onGraceExpired(playerId), this.timings.disconnectGraceMs),
    );
    this.broadcastLobby();
    this.armIdleIfEmpty();
  }

  emote(by: PlayerId, emote: Emote): Result {
    const seat = this.humanSeat(by);
    if (!seat) return fail('NOT_IN_ROOM');
    const t = this.now();
    if (t - seat.lastEmoteAt < this.timings.emoteCooldownMs) return fail('RATE_LIMITED');
    seat.lastEmoteAt = t;
    this.transport.emote(by, emote);
    return ok(null);
  }

  // ── Game ───────────────────────────────────────────────────────────────

  start(by: PlayerId): Result {
    if (by !== this.hostId) return fail('NOT_HOST');
    if (this.game) return fail('GAME_IN_PROGRESS');
    const minSeats = this.mode === 'solo' ? 1 + LIMITS.minBots : LIMITS.minOnlinePlayers;
    if (this.seats.length < minSeats) return fail('NOT_ENOUGH_PLAYERS');
    const { state, events } = createGame({
      players: this.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot })),
      settings: this.settings,
      seed: Math.floor(this.random() * 2 ** 31),
    });
    this.commit({ ok: true, state, events }, null);
    this.broadcastLobby();
    return ok(null);
  }

  intent(by: PlayerId, intent: GameIntent): Result {
    const seat = this.humanSeat(by);
    if (!seat) return fail('NOT_IN_ROOM');
    if (!this.game) return fail('GAME_NOT_RUNNING');
    const result = applyIntent(this.game, by, intent);
    if (!result.ok) return result;
    this.commit(result, by);
    return ok(null);
  }

  /** After a finished game: back to the lobby with the same table. */
  rematch(by: PlayerId): Result {
    if (by !== this.hostId) return fail('NOT_HOST');
    if (!this.game || this.game.phase.type !== 'GAME_OVER') return fail('GAME_IN_PROGRESS');
    this.endGame();
    this.broadcastLobby();
    return ok(null);
  }

  dispose(reason: RoomClosedReason = 'idle'): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearAutomation();
    this.graceTimers.forEach((t) => clearTimeout(t));
    this.graceTimers.clear();
    this.clearIdle();
    for (const s of this.seats) {
      if (!s.isBot && !s.left) this.transport.closed(s.id, reason);
    }
    this.hooks.onDisposed?.();
  }

  // ── Internals: seats ───────────────────────────────────────────────────

  private takenNames(): Set<string> {
    return new Set(this.seats.map((s) => s.name));
  }

  private createHumanSeat(name: string): Seat {
    const seat: Seat = {
      id: randomUUID(),
      name: uniqueName(name, this.takenNames()),
      isBot: false,
      difficulty: null,
      connected: false,
      ready: false,
      autopilot: false,
      left: false,
      lastEmoteAt: Number.NEGATIVE_INFINITY,
    };
    this.seats.push(seat);
    return seat;
  }

  private createBotSeat(difficulty: BotDifficulty): Seat {
    return {
      id: `bot-${randomUUID()}`,
      name: pickBotName(this.takenNames()),
      isBot: true,
      difficulty,
      connected: true,
      ready: true,
      autopilot: false,
      left: false,
      lastEmoteAt: Number.NEGATIVE_INFINITY,
    };
  }

  private humanSeat(playerId: PlayerId): Seat | undefined {
    return this.seats.find((s) => s.id === playerId && !s.isBot && !s.left);
  }

  private requireHostInLobby(by: PlayerId): Result | undefined {
    if (by !== this.hostId) return fail('NOT_HOST');
    if (this.game) return fail('GAME_IN_PROGRESS');
    return undefined;
  }

  private removeSeat(playerId: PlayerId): void {
    const index = this.seats.findIndex((s) => s.id === playerId);
    if (index === -1) return;
    this.seats.splice(index, 1);
    this.clearGrace(playerId);
    this.hooks.onSeatRemoved?.(playerId);
  }

  private activeHumans(): Seat[] {
    return this.seats.filter((s) => !s.isBot && !s.left);
  }

  /** Re-elects a host if needed and closes the room once no human remains. */
  private afterHumanChange(): void {
    const humans = this.activeHumans();
    if (humans.length === 0) {
      this.dispose('left');
      return;
    }
    if (!humans.some((s) => s.id === this.hostId)) {
      this.hostId = (humans.find((s) => s.connected) ?? humans[0])?.id ?? this.hostId;
    }
    this.broadcastLobby();
    if (this.game) this.scheduleAutomation();
    this.armIdleIfEmpty();
  }

  private onGraceExpired(playerId: PlayerId): void {
    this.graceTimers.delete(playerId);
    const seat = this.humanSeat(playerId);
    if (!seat || seat.connected || this.disposed) return;
    if (this.game) {
      seat.autopilot = true;
      this.broadcastLobby();
      this.scheduleAutomation();
    } else {
      this.removeSeat(playerId);
      this.afterHumanChange();
    }
  }

  private clearGrace(playerId: PlayerId): void {
    const timer = this.graceTimers.get(playerId);
    if (timer) clearTimeout(timer);
    this.graceTimers.delete(playerId);
  }

  private armIdleIfEmpty(): void {
    if (this.disposed || this.idleTimer) return;
    if (this.activeHumans().some((s) => s.connected)) return;
    this.idleTimer = setTimeout(() => this.dispose('idle'), this.timings.idleTimeoutMs);
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private endGame(): void {
    this.clearAutomation();
    this.game = null;
    this.turnDeadline = null;
    for (const s of [...this.seats]) {
      if (s.left) this.seats.splice(this.seats.indexOf(s), 1);
    }
    this.seats.forEach((s) => {
      s.ready = s.isBot;
      if (!s.isBot) s.autopilot = false;
    });
  }

  // ── Internals: game flow ───────────────────────────────────────────────

  private commit(result: Extract<EngineResult, { ok: true }>, actor: PlayerId | null): void {
    const previous = this.game;
    this.game = result.state;
    this.updateDeadline(previous, actor);
    for (const s of this.activeHumans()) this.sendGame(s.id, result.events);
    if (result.state.phase.type === 'GAME_OVER') {
      this.broadcastLobby();
      if (previous?.phase.type !== 'GAME_OVER') this.recordGame(result.state);
    }
    this.scheduleAutomation();
  }

  /**
   * Reports the finished game for the leaderboard. Humans who left or were on
   * autopilot at the end are left out: a bot played for them.
   */
  private recordGame(state: ServerGameState): void {
    if (!this.hooks.onGameFinished || state.phase.type !== 'GAME_OVER') return;
    const winnerId = state.phase.winnerId;
    const ranked = [...state.players].sort(
      (a, b) =>
        Number(b.id === winnerId) - Number(a.id === winnerId) ||
        b.score - a.score ||
        a.hand.length - b.hand.length,
    );
    const players = ranked.flatMap((p, i) => {
      const seat = this.seats.find((s) => s.id === p.id);
      if (!seat || (!seat.isBot && (seat.left || seat.autopilot))) return [];
      return [
        { name: p.name, bot: seat.isBot, rank: i + 1, won: p.id === winnerId, score: p.score },
      ];
    });
    if (!players.some((p) => !p.bot)) return;
    try {
      this.hooks.onGameFinished({
        v: 1,
        t: Math.floor(this.now() / 1000),
        game: 'uno',
        mode: this.mode,
        players,
      });
    } catch (e) {
      console.error('[uno] onGameFinished failed', e);
    }
  }

  /** The turn timer restarts only when the turn moves or its owner acts. */
  private updateDeadline(previous: ServerGameState | null, actor: PlayerId | null): void {
    const game = this.game;
    const timeout = this.settings.turnTimeoutSec;
    const current = game
      ? this.seats.find((s) => s.id === game.players[game.currentPlayerIndex]?.id)
      : undefined;
    const running = game && game.phase.type !== 'ROUND_OVER' && game.phase.type !== 'GAME_OVER';
    if (!game || !running || timeout === null || !current || this.isControlled(current)) {
      this.turnDeadline = null;
      return;
    }
    const turnMoved =
      !previous ||
      previous.currentPlayerIndex !== game.currentPlayerIndex ||
      previous.round !== game.round ||
      actor === current.id;
    if (turnMoved || this.turnDeadline === null) this.turnDeadline = this.now() + timeout * 1000;
  }

  private sendGame(playerId: PlayerId, events: readonly GameEvent[]): void {
    if (!this.game) return;
    this.transport.game(playerId, {
      view: projectForPlayer(this.game, playerId),
      events,
      turnDeadline: this.turnDeadline,
    });
  }

  private broadcastLobby(): void {
    if (!this.disposed) this.transport.lobby(this.lobbyState());
  }

  private isControlled(seat: Seat): boolean {
    return seat.isBot || seat.autopilot;
  }

  private clearAutomation(): void {
    this.automationTimers.forEach((t) => clearTimeout(t));
    this.automationTimers = [];
  }

  private schedule(delayMs: number, fn: () => void): void {
    this.automationTimers.push(
      setTimeout(
        () => {
          if (!this.disposed) fn();
        },
        Math.max(0, delayMs),
      ),
    );
  }

  /**
   * Re-plans every pending automatic action from the fresh state: bot turns,
   * bot reactions (jump-in, Uno), turn timeout, next round. Each planned
   * action is pinned to the current version and dropped if the state moved.
   */
  private scheduleAutomation(): void {
    this.clearAutomation();
    const game = this.game;
    if (!game || this.disposed) return;

    if (game.phase.type === 'ROUND_OVER') {
      this.schedule(this.timings.roundBreakMs, () => {
        if (this.game !== game) return;
        const next = startNextRound(game);
        if (next.ok) this.commit(next, null);
      });
      return;
    }
    if (game.phase.type === 'GAME_OVER') return;

    const version = game.version;
    const fire = (playerId: PlayerId, intent: GameIntent) => {
      if (!this.game || this.game.version !== version) return;
      const result = applyIntent(this.game, playerId, intent);
      if (result.ok) this.commit(result, playerId);
    };

    const currentId = game.players[game.currentPlayerIndex]?.id;
    for (const seat of this.seats) {
      if (!this.isControlled(seat)) continue;
      const difficulty = seat.difficulty ?? AUTOPILOT_DIFFICULTY;
      const persona = PERSONALITIES[difficulty];
      const view = projectForPlayer(game, seat.id);

      // Autopilot only plays its turn; real bots also react out of turn.
      const reaction = seat.isBot ? decideOutOfTurn(view, difficulty, this.random) : null;
      if (reaction) {
        this.schedule(pickDelay(persona.reactMs, this.random), () => fire(seat.id, reaction));
      }
      if (seat.id === currentId) {
        const turn = decideTurn(view, difficulty, this.random);
        if (turn) this.schedule(pickDelay(persona.thinkMs, this.random), () => fire(seat.id, turn));
      }
    }

    if (this.turnDeadline !== null) {
      this.schedule(this.turnDeadline - this.now(), () => {
        if (!this.game || this.game.version !== version) return;
        const result = resolveTimeout(this.game);
        if (result.ok) this.commit(result, null);
      });
    }
  }
}
