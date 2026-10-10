import { z } from 'zod';
import { EMOTES } from './types/protocol';
import { CARD_COLORS } from './types/card';
import { LIMITS, ROOM_CODE_REGEX, normalizeRoomCode } from './constants';
import type { GameIntent } from './types/protocol';
import type { GameSettings } from './types/settings';

const { initialHandSize, turnTimeoutSec, scoreTarget, unoPenaltyCards } = LIMITS;

export const cardColorSchema = z.enum(CARD_COLORS);

const scoringSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('single_round') }).strict(),
  z
    .object({
      mode: z.literal('points'),
      target: z.number().int().min(scoreTarget.min).max(scoreTarget.max),
    })
    .strict(),
]);

const unoPenaltySchema = z
  .object({
    enabled: z.boolean(),
    cards: z.number().int().min(unoPenaltyCards.min).max(unoPenaltyCards.max),
  })
  .strict();

export const gameSettingsSchema = z
  .object({
    allowJumpIn: z.boolean(),
    allowStackingDrawCards: z.boolean(),
    stackingRequiresColorMatch: z.boolean(),
    sevenSwapHands: z.boolean(),
    zeroRotateHands: z.boolean(),
    drawUntilPlayable: z.boolean(),
    allowPlayAfterDraw: z.boolean(),
    allowWildDraw4Challenge: z.boolean(),
    allowMultiplePlay: z.boolean(),
    unoPenalty: unoPenaltySchema,
    initialHandSize: z.number().int().min(initialHandSize.min).max(initialHandSize.max),
    turnTimeoutSec: z.number().int().min(turnTimeoutSec.min).max(turnTimeoutSec.max).nullable(),
    scoring: scoringSchema,
  })
  .strict() satisfies z.ZodType<GameSettings>;

export const partialGameSettingsSchema = gameSettingsSchema
  .omit({ unoPenalty: true })
  .partial()
  .extend({ unoPenalty: unoPenaltySchema.partial().optional() })
  .strict();

const version = z.number().int().nonnegative();
const id = z.string().min(1).max(64);

export const gameIntentSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('PLAY_CARD'),
      cardIds: z.array(id).min(1).max(4),
      chosenColor: cardColorSchema.optional(),
      expectedVersion: version,
    })
    .strict(),
  z.object({ type: z.literal('JUMP_IN'), cardId: id, expectedVersion: version }).strict(),
  z.object({ type: z.literal('DRAW'), expectedVersion: version }).strict(),
  z.object({ type: z.literal('PASS'), expectedVersion: version }).strict(),
  z
    .object({ type: z.literal('CHOOSE_COLOR'), color: cardColorSchema, expectedVersion: version })
    .strict(),
  z
    .object({ type: z.literal('CHOOSE_SWAP_TARGET'), targetId: id, expectedVersion: version })
    .strict(),
  z
    .object({
      type: z.literal('RESOLVE_CHALLENGE'),
      challenge: z.boolean(),
      expectedVersion: version,
    })
    .strict(),
  z.object({ type: z.literal('CALL_UNO') }).strict(),
  z.object({ type: z.literal('CATCH_UNO'), targetId: id }).strict(),
]);

/** Parses an untrusted intent. Returns `null` on any malformed payload. */
export function parseGameIntent(input: unknown): GameIntent | null {
  const result = gameIntentSchema.safeParse(input);
  return result.success ? (result.data as GameIntent) : null;
}

export const playerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.playerNameMaxLength)
  .regex(/^[\p{L}\p{N} _.'-]+$/u, 'Caractères non autorisés');

export const roomCodeSchema = z
  .string()
  .transform(normalizeRoomCode)
  .refine((code) => ROOM_CODE_REGEX.test(code), 'Code de room invalide');

export const botDifficultySchema = z.enum(['easy', 'normal', 'hard']);

export const createRoomPayloadSchema = z
  .object({
    playerName: playerNameSchema,
    mode: z.enum(['solo', 'online']),
    settings: partialGameSettingsSchema.optional(),
    bots: z
      .array(z.object({ difficulty: botDifficultySchema }).strict())
      .max(LIMITS.maxBots)
      .optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const botCount = payload.bots?.length ?? 0;
    if (payload.mode === 'solo' && botCount < LIMITS.minBots) {
      ctx.addIssue({
        code: 'custom',
        message: 'Une partie solo exige au moins 1 bot',
        path: ['bots'],
      });
    }
    if (payload.mode === 'online' && botCount > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Les bots s’ajoutent depuis le lobby',
        path: ['bots'],
      });
    }
  });

export const joinRoomPayloadSchema = z
  .object({ code: roomCodeSchema, playerName: playerNameSchema })
  .strict();

export const emoteSchema = z.enum(EMOTES);
