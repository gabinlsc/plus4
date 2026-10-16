import type { Card, CardColor, CardId } from './card';
import type { BotDifficulty, GameSettings, RoomMode } from './settings';
import type { ClientGameView, Direction, PlayerId } from './state';

// ── Game intents (client → server) ──────────────────────────────────────

export type GameIntent =
  | {
      readonly type: 'PLAY_CARD';
      /** One id, or several of the same value with `allowMultiplePlay`. First id is played first. */
      readonly cardIds: readonly CardId[];
      /** Mandatory when the last card played is a wild. */
      readonly chosenColor?: CardColor;
      readonly expectedVersion: number;
    }
  | { readonly type: 'JUMP_IN'; readonly cardId: CardId; readonly expectedVersion: number }
  | { readonly type: 'DRAW'; readonly expectedVersion: number }
  | { readonly type: 'PASS'; readonly expectedVersion: number }
  | { readonly type: 'CHOOSE_COLOR'; readonly color: CardColor; readonly expectedVersion: number }
  | {
      readonly type: 'CHOOSE_SWAP_TARGET';
      readonly targetId: PlayerId;
      readonly expectedVersion: number;
    }
  | {
      readonly type: 'RESOLVE_CHALLENGE';
      readonly challenge: boolean;
      readonly expectedVersion: number;
    }
  | { readonly type: 'CALL_UNO' }
  | { readonly type: 'CATCH_UNO'; readonly targetId: PlayerId };

export type GameIntentType = GameIntent['type'];

// ── Game events (server → client, drive animations) ─────────────────────

export type GameEvent =
  | { readonly type: 'ROUND_STARTED'; readonly round: number; readonly dealerId: PlayerId }
  | { readonly type: 'CARDS_DEALT'; readonly perPlayer: Readonly<Record<PlayerId, number>> }
  | { readonly type: 'FIRST_CARD_FLIPPED'; readonly card: Card }
  | {
      readonly type: 'CARD_PLAYED';
      readonly playerId: PlayerId;
      readonly cards: readonly Card[];
      readonly jumpIn: boolean;
    }
  | { readonly type: 'COLOR_CHOSEN'; readonly playerId: PlayerId; readonly color: CardColor }
  | {
      readonly type: 'CARDS_DRAWN';
      readonly playerId: PlayerId;
      readonly count: number;
      readonly reason: DrawReason;
    }
  | { readonly type: 'PENALTY_STACKED'; readonly total: number }
  | { readonly type: 'TURN_SKIPPED'; readonly playerId: PlayerId }
  | { readonly type: 'DIRECTION_CHANGED'; readonly direction: Direction }
  | { readonly type: 'TURN_CHANGED'; readonly playerId: PlayerId }
  | { readonly type: 'HANDS_SWAPPED'; readonly a: PlayerId; readonly b: PlayerId }
  | { readonly type: 'HANDS_ROTATED'; readonly direction: Direction }
  | {
      readonly type: 'CHALLENGE_RESOLVED';
      readonly challengerId: PlayerId;
      readonly accusedId: PlayerId;
      readonly bluff: boolean;
    }
  | { readonly type: 'UNO_CALLED'; readonly playerId: PlayerId }
  | { readonly type: 'UNO_CAUGHT'; readonly by: PlayerId; readonly target: PlayerId }
  | { readonly type: 'DECK_RESHUFFLED'; readonly drawPileCount: number }
  | { readonly type: 'ROUND_ENDED'; readonly winnerId: PlayerId; readonly points: number }
  | { readonly type: 'GAME_ENDED'; readonly winnerId: PlayerId };

export type DrawReason =
  'voluntary' | 'penalty' | 'uno_caught' | 'challenge_failed' | 'challenge_bluff' | 'timeout';

export type GameEventType = GameEvent['type'];

/** Why an intent was refused. The client reacts with a shake animation + toast. */
export const RULE_VIOLATIONS = [
  'GAME_NOT_RUNNING',
  'UNKNOWN_PLAYER',
  'NOT_YOUR_TURN',
  'WRONG_PHASE',
  'STALE_STATE',
  'CARD_NOT_IN_HAND',
  'ILLEGAL_CARD',
  'MUST_STACK_OR_DRAW',
  'COLOR_REQUIRED',
  'MULTIPLE_PLAY_DISABLED',
  'MULTIPLE_PLAY_MISMATCH',
  'JUMP_IN_DISABLED',
  'JUMP_IN_NOT_IDENTICAL',
  'CANNOT_PASS',
  'INVALID_TARGET',
  'UNO_NOT_ALLOWED',
  'NOTHING_TO_CATCH',
] as const;
export type RuleViolation = (typeof RULE_VIOLATIONS)[number];

export type IntentResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: RuleViolation };

// ── Lobby / room (Socket.IO payloads) ───────────────────────────────────

export interface LobbySeat {
  readonly id: PlayerId;
  readonly name: string;
  readonly isBot: boolean;
  readonly isHost: boolean;
  readonly connected: boolean;
  readonly ready: boolean;
  /** A disconnected human whose seat is temporarily played by a bot. */
  readonly autopilot: boolean;
  readonly botDifficulty?: BotDifficulty;
}

export interface LobbyState {
  readonly code: string;
  readonly mode: RoomMode;
  readonly hostId: PlayerId;
  readonly maxPlayers: number;
  readonly seats: readonly LobbySeat[];
  readonly settings: GameSettings;
  readonly inGame: boolean;
}

export interface CreateRoomPayload {
  readonly playerName: string;
  readonly mode: RoomMode;
  readonly settings?: Partial<GameSettings>;
  /** Solo only: 1-4 bots. */
  readonly bots?: readonly { readonly difficulty: BotDifficulty }[];
}

export interface JoinRoomPayload {
  readonly code: string;
  readonly playerName: string;
}

export interface SessionInfo {
  readonly playerId: PlayerId;
  /** Opaque token for reconnecting to the same seat after a disconnect. */
  readonly sessionToken: string;
  readonly code: string;
}

export interface GameUpdate {
  readonly view: ClientGameView;
  readonly events: readonly GameEvent[];
  /** Epoch ms at which the current turn times out, `null` without a turn timer. */
  readonly turnDeadline: number | null;
}

export type AckResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: RuleViolation | LobbyError };

export type Ack<T> = (result: AckResult<T>) => void;

export type LobbyError =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NOT_HOST'
  | 'INVALID_PAYLOAD'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_IN_ROOM'
  | 'INVALID_TARGET'
  | 'RATE_LIMITED'
  | 'SESSION_EXPIRED'
  | 'NAME_RESERVED';

export type RoomClosedReason = 'kicked' | 'idle' | 'left';

export const EMOTES = ['👏', '😂', '😱', '😡', '🔥', 'GG'] as const;
export type Emote = (typeof EMOTES)[number];

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: Ack<SessionInfo>) => void;
  'room:join': (payload: JoinRoomPayload, ack: Ack<SessionInfo>) => void;
  'room:resume': (payload: { sessionToken: string }, ack: Ack<SessionInfo>) => void;
  'room:leave': () => void;
  'room:update-settings': (settings: Partial<GameSettings>, ack: Ack<null>) => void;
  'room:set-ready': (ready: boolean) => void;
  'room:add-bot': (difficulty: BotDifficulty, ack: Ack<null>) => void;
  'room:remove-bot': (botId: PlayerId, ack: Ack<null>) => void;
  'room:kick': (playerId: PlayerId, ack: Ack<null>) => void;
  'game:start': (ack: Ack<null>) => void;
  'game:intent': (intent: GameIntent, ack: Ack<null>) => void;
  'game:rematch': (ack: Ack<null>) => void;
  'chat:emote': (emote: Emote) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: LobbyState) => void;
  'room:closed': (reason: RoomClosedReason) => void;
  /** Full authoritative view, sent after each transition alongside the events that produced it. */
  'game:update': (update: GameUpdate) => void;
  'chat:emote': (payload: { playerId: PlayerId; emote: Emote }) => void;
}
