import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, resolveSettings, type GameSettings, type RoomMode } from '@uno/shared';
import type { GameRecord } from '../src/results';
import { Room, type RoomHooks } from '../src/room/Room';
import { FakeTransport, seededRandom } from './fakes';

function makeRoom(
  opts: {
    idleTimeoutMs?: number;
    mode?: RoomMode;
    bots?: ('easy' | 'normal' | 'hard')[];
    settings?: Partial<GameSettings>;
    hooks?: RoomHooks;
    hostPid?: string;
  } = {},
) {
  const transport = new FakeTransport();
  const room = new Room({
    code: 'P4-TEST',
    mode: opts.mode ?? 'online',
    hostName: 'Host',
    ...(opts.hostPid ? { hostPid: opts.hostPid } : {}),
    settings: resolveSettings(opts.settings ?? {}),
    bots: opts.bots ?? [],
    transport,
    random: seededRandom(7),
    timings: {
      roundBreakMs: 1000,
      disconnectGraceMs: 5000,
      idleTimeoutMs: opts.idleTimeoutMs ?? 60_000,
      emoteCooldownMs: 1000,
    },
    ...(opts.hooks ? { hooks: opts.hooks } : {}),
  });
  const host = room.hostPlayerId;
  room.connect(host);
  return { room, transport, host };
}

function joinGuest(room: Room, name = 'Guest') {
  const joined = room.join(name);
  if (!joined.ok) throw new Error(joined.reason);
  room.connect(joined.value);
  return joined.value;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('lobby', () => {
  it('broadcasts the lobby with the host seat', () => {
    const { transport, host } = makeRoom();
    const lobby = transport.lastLobby();
    expect(lobby.code).toBe('P4-TEST');
    expect(lobby.hostId).toBe(host);
    expect(lobby.seats).toHaveLength(1);
    expect(lobby.seats[0]).toMatchObject({ isHost: true, connected: true, isBot: false });
    expect(lobby.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('accepts up to 6 seats online and makes names unique', () => {
    const { room, transport } = makeRoom();
    for (let i = 0; i < 5; i++) joinGuest(room, 'Host');
    expect(room.join('Late')).toEqual({ ok: false, reason: 'ROOM_FULL' });
    expect(new Set(transport.lastLobby().seats.map((s) => s.name)).size).toBe(6);
  });

  it('solo rooms cannot be joined', () => {
    const { room } = makeRoom({ mode: 'solo', bots: ['easy'] });
    expect(room.join('Intruder')).toEqual({ ok: false, reason: 'ROOM_FULL' });
  });

  it('only the host can change settings, with validation', () => {
    const { room, host, transport } = makeRoom();
    const guest = joinGuest(room);
    expect(room.updateSettings(guest, { allowJumpIn: true })).toEqual({
      ok: false,
      reason: 'NOT_HOST',
    });
    expect(room.updateSettings(host, { initialHandSize: 99 })).toEqual({
      ok: false,
      reason: 'INVALID_PAYLOAD',
    });
    expect(room.updateSettings(host, { allowJumpIn: true })).toEqual({ ok: true, value: null });
    expect(transport.lastLobby().settings.allowJumpIn).toBe(true);
  });

  it('changing settings resets the ready flags', () => {
    const { room, host, transport } = makeRoom();
    const guest = joinGuest(room);
    room.setReady(guest, true);
    expect(transport.lastLobby().seats.find((s) => s.id === guest)?.ready).toBe(true);
    room.updateSettings(host, { allowJumpIn: true });
    expect(transport.lastLobby().seats.find((s) => s.id === guest)?.ready).toBe(false);
  });

  it('host manages bots within limits', () => {
    const { room, host, transport } = makeRoom({ mode: 'solo', bots: ['easy'] });
    for (let i = 0; i < 3; i++) expect(room.addBot(host, 'hard').ok).toBe(true);
    expect(room.addBot(host, 'hard')).toEqual({ ok: false, reason: 'ROOM_FULL' });
    const bots = transport.lastLobby().seats.filter((s) => s.isBot);
    expect(bots).toHaveLength(4);
    expect(new Set(bots.map((b) => b.name)).size).toBe(4);
    for (const bot of bots.slice(1)) expect(room.removeBot(host, bot.id).ok).toBe(true);
    expect(room.removeBot(host, bots[0]?.id ?? '')).toEqual({
      ok: false,
      reason: 'NOT_ENOUGH_PLAYERS',
    });
  });

  it('kicking removes the seat, notifies the target and revokes its session', () => {
    const removed: string[] = [];
    const { room, host, transport } = makeRoom({
      hooks: { onSeatRemoved: (id) => removed.push(id) },
    });
    const guest = joinGuest(room);
    expect(room.kick(guest, host)).toEqual({ ok: false, reason: 'NOT_HOST' });
    expect(room.kick(host, host)).toEqual({ ok: false, reason: 'INVALID_TARGET' });
    expect(room.kick(host, guest).ok).toBe(true);
    expect(transport.closures).toContainEqual({ playerId: guest, reason: 'kicked' });
    expect(removed).toEqual([guest]);
    expect(transport.lastLobby().seats).toHaveLength(1);
  });

  it('host leaving hands the room over; last human leaving disposes it', () => {
    const disposed = vi.fn();
    const { room, host, transport } = makeRoom({ hooks: { onDisposed: disposed } });
    const guest = joinGuest(room);
    room.leave(host);
    expect(transport.lastLobby().hostId).toBe(guest);
    room.leave(guest);
    expect(disposed).toHaveBeenCalledOnce();
    expect(room.isDisposed).toBe(true);
  });

  it('a lobby seat is freed after the disconnect grace period', () => {
    const { room, transport } = makeRoom();
    const guest = joinGuest(room);
    room.disconnect(guest);
    expect(transport.lastLobby().seats.find((s) => s.id === guest)?.connected).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(transport.lastLobby().seats.some((s) => s.id === guest)).toBe(false);
  });

  it('reconnecting within the grace period keeps the seat', () => {
    const { room, transport } = makeRoom();
    const guest = joinGuest(room);
    room.disconnect(guest);
    vi.advanceTimersByTime(3000);
    room.connect(guest);
    vi.advanceTimersByTime(5000);
    expect(transport.lastLobby().seats.find((s) => s.id === guest)?.connected).toBe(true);
  });

  it('rate-limits emotes', () => {
    const { room, host, transport } = makeRoom();
    expect(room.emote(host, '🔥').ok).toBe(true);
    expect(room.emote(host, '🔥')).toEqual({ ok: false, reason: 'RATE_LIMITED' });
    vi.advanceTimersByTime(1000);
    expect(room.emote(host, 'GG').ok).toBe(true);
    expect(transport.emotes).toHaveLength(2);
  });
});

describe('game', () => {
  it('requires the host and enough players', () => {
    const { room, host } = makeRoom();
    expect(room.start(host)).toEqual({ ok: false, reason: 'NOT_ENOUGH_PLAYERS' });
    const guest = joinGuest(room);
    expect(room.start(guest)).toEqual({ ok: false, reason: 'NOT_HOST' });
    expect(room.start(host).ok).toBe(true);
    expect(room.start(host)).toEqual({ ok: false, reason: 'GAME_IN_PROGRESS' });
    expect(room.join('Late')).toEqual({ ok: false, reason: 'GAME_IN_PROGRESS' });
  });

  it('sends each human a private projection', () => {
    const { room, host, transport } = makeRoom();
    const guest = joinGuest(room);
    room.start(host);
    const mine = transport.lastUpdate(host);
    const theirs = transport.lastUpdate(guest);
    expect(mine.view.me.id).toBe(host);
    expect(theirs.view.me.id).toBe(guest);
    expect(JSON.stringify(mine)).not.toContain(theirs.view.me.hand[0]?.id);
    expect(mine.events.map((e) => e.type)).toContain('CARDS_DEALT');
    expect(transport.lastLobby().inGame).toBe(true);
  });

  it('routes intents through the engine and reports violations', () => {
    const { room, host, transport } = makeRoom();
    const guest = joinGuest(room);
    room.start(host);
    const view = transport.lastUpdate(host).view;
    const idle = view.currentPlayerId === host ? guest : host;
    expect(room.intent(idle, { type: 'DRAW', expectedVersion: view.version })).toEqual({
      ok: false,
      reason: view.phase.type === 'AWAITING_PLAY' ? 'NOT_YOUR_TURN' : 'WRONG_PHASE',
    });
    expect(room.intent('stranger', { type: 'CALL_UNO' })).toEqual({
      ok: false,
      reason: 'NOT_IN_ROOM',
    });
  });

  it('solo: bots play on their own and the game reaches the human again', () => {
    const { room, host, transport } = makeRoom({ mode: 'solo', bots: ['hard', 'hard', 'hard'] });
    room.start(host);
    let guard = 0;
    while (transport.lastUpdate(host).view.currentPlayerId !== host && guard++ < 50) {
      vi.advanceTimersByTime(3000);
    }
    const view = transport.lastUpdate(host).view;
    expect(view.phase.type === 'GAME_OVER' || view.currentPlayerId === host).toBe(true);
  });

  it('solo: a full game can be played to the end with the human on autopilot', () => {
    const { room, host, transport } = makeRoom({
      mode: 'solo',
      bots: ['easy', 'normal', 'hard'],
      idleTimeoutMs: 10 ** 9,
    });
    room.start(host);
    room.disconnect(host);
    vi.advanceTimersByTime(5000);
    expect(transport.lastLobby().seats.find((s) => s.id === host)?.autopilot).toBe(true);
    for (let i = 0; i < 5000 && room.gameState()?.phase.type !== 'GAME_OVER'; i++) {
      vi.advanceTimersByTime(1000);
    }
    expect(room.gameState()?.phase.type).toBe('GAME_OVER');
    expect(transport.lastUpdate(host).events.map((e) => e.type)).toContain('GAME_ENDED');
  });

  describe('leaderboard record', () => {
    const playToEnd = (room: Room) => {
      for (let i = 0; i < 20_000 && room.gameState()?.phase.type !== 'GAME_OVER'; i++) {
        vi.advanceTimersByTime(1000);
      }
      expect(room.gameState()?.phase.type).toBe('GAME_OVER');
    };

    it('reports a finished game once, ranked, with the human still at the table', () => {
      const records: GameRecord[] = [];
      const { room, host } = makeRoom({
        mode: 'solo',
        bots: ['easy', 'normal', 'hard'],
        idleTimeoutMs: 10 ** 9,
        // The connected human never acts: the turn timer plays for them.
        settings: { turnTimeoutSec: 10, scoring: { mode: 'single_round' } },
        hooks: { onGameFinished: (r) => records.push(r) },
      });
      room.start(host);
      playToEnd(room);
      vi.advanceTimersByTime(60_000);

      expect(records).toHaveLength(1);
      const record = records[0];
      const state = room.gameState();
      if (!record || state?.phase.type !== 'GAME_OVER') throw new Error('no record');
      const winnerId = state.phase.winnerId;
      expect(record).toMatchObject({ v: 1, game: 'uno', mode: 'solo' });
      expect(record.players.map((p) => p.rank)).toEqual([1, 2, 3, 4]);
      expect(record.players.filter((p) => p.won)).toHaveLength(1);
      expect(record.players[0]).toMatchObject({
        won: true,
        name: state.players.find((p) => p.id === winnerId)?.name,
      });
      expect(record.players.filter((p) => !p.bot).map((p) => p.name)).toEqual(['Host']);
    });

    it('records the profile id of signed-in humans, and only theirs', () => {
      const records: GameRecord[] = [];
      const { room, host } = makeRoom({
        mode: 'solo',
        bots: ['easy', 'normal', 'hard'],
        idleTimeoutMs: 10 ** 9,
        settings: { turnTimeoutSec: 10, scoring: { mode: 'single_round' } },
        hooks: { onGameFinished: (r) => records.push(r) },
        hostPid: '0123456789abcdef',
      });
      room.start(host);
      playToEnd(room);
      vi.advanceTimersByTime(60_000);
      const players = records[0]?.players ?? [];
      expect(players.filter((p) => p.pid)).toEqual([
        expect.objectContaining({ name: 'Host', pid: '0123456789abcdef', bot: false }),
      ]);
    });

    it('leaves out a human on autopilot, and skips games with no human left', () => {
      const records: GameRecord[] = [];
      const { room, host } = makeRoom({
        mode: 'solo',
        bots: ['easy', 'normal'],
        idleTimeoutMs: 10 ** 9,
        settings: { scoring: { mode: 'single_round' } },
        hooks: { onGameFinished: (r) => records.push(r) },
      });
      room.start(host);
      room.disconnect(host);
      vi.advanceTimersByTime(5000);
      playToEnd(room);
      expect(records).toEqual([]);
    });
  });

  it('turn timer: an idle human is played for when the deadline passes', () => {
    const { room, host, transport } = makeRoom({ settings: { turnTimeoutSec: 10 } });
    const guest = joinGuest(room);
    room.start(host);
    const before = transport.lastUpdate(host);
    expect(before.turnDeadline).not.toBeNull();
    vi.advanceTimersByTime(10_000);
    const after = transport.lastUpdate(host);
    expect(after.view.version).toBeGreaterThan(before.view.version);
    expect(
      after.events.some(
        (e) => e.type === 'CARDS_DRAWN' || e.type === 'COLOR_CHOSEN' || e.type === 'TURN_CHANGED',
      ),
    ).toBe(true);
    expect(guest).toBeDefined();
  });

  it('a disconnected player is replaced by autopilot after the grace period, and gets the seat back', () => {
    const { room, host, transport } = makeRoom();
    const guest = joinGuest(room);
    room.start(host);
    room.disconnect(guest);
    vi.advanceTimersByTime(5000);
    expect(transport.lastLobby().seats.find((s) => s.id === guest)?.autopilot).toBe(true);
    room.connect(guest);
    expect(transport.lastLobby().seats.find((s) => s.id === guest)).toMatchObject({
      autopilot: false,
      connected: true,
    });
    expect(transport.lastUpdate(guest).events).toEqual([]);
  });

  it('a player leaving mid-game is played by a bot until the game ends', () => {
    const removed: string[] = [];
    const { room, host, transport } = makeRoom({
      hooks: { onSeatRemoved: (id) => removed.push(id) },
    });
    const guest = joinGuest(room);
    room.start(host);
    room.leave(guest);
    expect(removed).toEqual([guest]);
    expect(transport.lastLobby().seats.find((s) => s.id === guest)?.autopilot).toBe(true);
    expect(room.hasPlayer(guest)).toBe(false);
  });

  it('rematch is only possible after game over', () => {
    const { room, host } = makeRoom();
    joinGuest(room);
    room.start(host);
    expect(room.rematch(host)).toEqual({ ok: false, reason: 'GAME_IN_PROGRESS' });
  });

  it('an empty room is closed after the idle timeout', () => {
    const disposed = vi.fn();
    const { room, host } = makeRoom({ hooks: { onDisposed: disposed } });
    room.disconnect(host);
    vi.advanceTimersByTime(60_000);
    expect(disposed).toHaveBeenCalled();
  });
});
