import type { CardValue } from './types/card';

export const LIMITS = {
  /** Online rooms: total human seats. */
  minOnlinePlayers: 2,
  maxOnlinePlayers: 6,
  /** Solo games: bots alongside the single human. */
  minBots: 1,
  maxBots: 4,
  playerNameMaxLength: 16,
  initialHandSize: { min: 5, max: 10 },
  turnTimeoutSec: { min: 10, max: 120 },
  scoreTarget: { min: 100, max: 1000 },
  unoPenaltyCards: { min: 1, max: 4 },
} as const;

/** Official composition: one 0 and two of each 1-9/skip/reverse/+2 per color; four wild and four wild+4. */
export const DECK_COMPOSITION = {
  zeroPerColor: 1,
  otherColoredPerColor: 2,
  wildCount: 4,
  wildDraw4Count: 4,
  total: 108,
} as const;

export const DRAW_PENALTY = { draw2: 2, wild_draw4: 4 } as const;

/** Wild +4 challenge outcomes. */
export const CHALLENGE_PENALTY = {
  /** The accused bluffed: they draw instead of the challenger. */
  bluff: 4,
  /** The challenge failed: the challenger draws the penalty plus 2. */
  failedExtra: 2,
} as const;

/** Official scoring: winner earns the value of all cards left in opponents' hands. */
export function cardPoints(value: CardValue): number {
  if (typeof value === 'number') return value;
  if (value === 'wild' || value === 'wild_draw4') return 50;
  return 20;
}

export const ROOM_CODE_PREFIX = 'UNO-';
/** No 0/O/1/I to avoid ambiguity when read aloud. */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_REGEX = /^UNO-[2-9A-HJ-NP-Z]{4}$/;

export function normalizeRoomCode(input: string): string {
  const raw = input.trim().toUpperCase().replace(/\s+/g, '');
  return raw.startsWith(ROOM_CODE_PREFIX) ? raw : `${ROOM_CODE_PREFIX}${raw}`;
}
