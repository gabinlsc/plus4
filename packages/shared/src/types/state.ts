import type { Card, CardColor, CardId, DiscardTop } from './card';
import type { GameSettings } from './settings';

export type PlayerId = string;
/** 1 = clockwise (seat index increases), -1 = counter-clockwise. */
export type Direction = 1 | -1;

export interface UnoStatus {
  /** The player called "Uno" for their current single card. */
  readonly declared: boolean;
  /** One card left and not declared: any opponent may catch them until the next action. */
  readonly vulnerable: boolean;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly isBot: boolean;
  readonly connected: boolean;
  /** Server-side only. Never sent as-is to another player. */
  readonly hand: readonly Card[];
  readonly score: number;
  readonly uno: UnoStatus;
}

export type PublicPlayerState = Omit<PlayerState, 'hand'> & { readonly handCount: number };

/** Draw penalty being stacked. `total === 0` means no pending penalty. */
export interface DrawStack {
  readonly total: number;
  readonly cardIds: readonly CardId[];
}

/**
 * State machine. Invariant: the only player allowed to act in an `AWAITING_*`
 * phase is `players[currentPlayerIndex]` (out-of-turn actions — jump-in, Uno
 * call/catch — are handled separately and never in a transient phase).
 */
export type GamePhase =
  | { readonly type: 'AWAITING_PLAY' }
  | { readonly type: 'AWAITING_PLAY_DRAWN'; readonly drawnCardId: CardId }
  | { readonly type: 'AWAITING_COLOR'; readonly cardId: CardId }
  | { readonly type: 'AWAITING_SWAP_TARGET' }
  | {
      readonly type: 'AWAITING_CHALLENGE';
      readonly accusedId: PlayerId;
      /** Color that was active before the +4: the bluff is judged against it. */
      readonly previousColor: CardColor;
    }
  | { readonly type: 'ROUND_OVER'; readonly winnerId: PlayerId; readonly points: number }
  | { readonly type: 'GAME_OVER'; readonly winnerId: PlayerId };

export type GamePhaseType = GamePhase['type'];

export interface ServerGameState {
  /** Incremented on every transition — optimistic concurrency for out-of-turn intents. */
  readonly version: number;
  readonly settings: Readonly<GameSettings>;
  /** Seat order. */
  readonly players: readonly PlayerState[];
  readonly phase: GamePhase;
  readonly currentPlayerIndex: number;
  readonly direction: Direction;
  /** Last element = top of the draw pile. */
  readonly drawPile: readonly Card[];
  /** Last element = top card (mirrored by `top`). */
  readonly discardPile: readonly Card[];
  readonly top: DiscardTop;
  readonly drawStack: DrawStack;
  readonly round: number;
  /** Current PRNG state: shuffles are reproducible. */
  readonly rngState: number;
}

/** Per-player projection: own hand in clear, everything else reduced to what is public. */
export interface ClientGameView {
  readonly version: number;
  readonly settings: Readonly<GameSettings>;
  readonly me: PlayerState;
  /** Every seat, in order (including me), without hands. */
  readonly seats: readonly PublicPlayerState[];
  readonly phase: GamePhase;
  readonly currentPlayerId: PlayerId;
  readonly direction: Direction;
  readonly drawPileCount: number;
  readonly top: DiscardTop;
  readonly drawStack: DrawStack;
  readonly round: number;
  /** Computed server-side for highlighting; the server re-validates anyway. */
  readonly playableCardIds: readonly CardId[];
  readonly jumpInCardIds: readonly CardId[];
}
