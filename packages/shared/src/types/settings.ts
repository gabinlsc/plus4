import type { PlayerId } from './state';

export type ScoringMode =
  { readonly mode: 'single_round' } | { readonly mode: 'points'; readonly target: number };

export interface UnoPenaltySettings {
  readonly enabled: boolean;
  /** Cards drawn by a player caught without having called "Uno". */
  readonly cards: number;
}

/**
 * Per-game rule configuration. Frozen once the game starts: the engine never
 * reads a rule from anywhere else.
 */
export interface GameSettings {
  // ── Mandatory house rules ─────────────────────────────────────────────
  /** Interception: play out of turn a card strictly identical (color AND value) to the top card. Wilds can never jump in. */
  readonly allowJumpIn: boolean;
  /** +2 and +4 stack on each other; the penalty accumulates until someone cannot stack. */
  readonly allowStackingDrawCards: boolean;
  /** When stacking, a +2 played on a +4 must match the declared color. */
  readonly stackingRequiresColorMatch: boolean;

  // ── Additional rules ──────────────────────────────────────────────────
  /** Playing a 7 swaps your hand with an opponent of your choice. */
  readonly sevenSwapHands: boolean;
  /** Playing a 0 rotates every hand one seat in the play direction. */
  readonly zeroRotateHands: boolean;
  /** Drawing keeps going until a playable card is drawn. */
  readonly drawUntilPlayable: boolean;
  /** After a voluntary draw, the drawn card may be played immediately if legal. */
  readonly allowPlayAfterDraw: boolean;
  /** The target of a +4 may challenge it (bluff check on the color active before the +4). */
  readonly allowWildDraw4Challenge: boolean;
  /** Several cards of the same value can be played at once (e.g. three 5s). */
  readonly allowMultiplePlay: boolean;
  /** Forgetting to call "Uno" can be punished by any opponent until the next action. */
  readonly unoPenalty: UnoPenaltySettings;

  // ── Game parameters ───────────────────────────────────────────────────
  readonly initialHandSize: number;
  /** `null` = no timer. Otherwise the current player auto-draws when it expires. */
  readonly turnTimeoutSec: number | null;
  readonly scoring: ScoringMode;
}

export type RoomMode = 'solo' | 'online';
export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface BotConfig {
  readonly id: PlayerId;
  readonly name: string;
  readonly difficulty: BotDifficulty;
}

export interface RoomSettings {
  /** Shareable code, format `P4-XXXX`. */
  readonly code: string;
  readonly mode: RoomMode;
  readonly hostId: PlayerId;
  /** Online: 2-6 seats. Solo: 1 human + 1-4 bots. */
  readonly maxPlayers: number;
  readonly bots: readonly BotConfig[];
  readonly game: GameSettings;
}
