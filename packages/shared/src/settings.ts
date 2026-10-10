import { gameSettingsSchema, partialGameSettingsSchema } from './schemas';
import type { GameSettings } from './types/settings';

export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  allowJumpIn: false,
  allowStackingDrawCards: false,
  stackingRequiresColorMatch: false,
  sevenSwapHands: false,
  zeroRotateHands: false,
  drawUntilPlayable: false,
  allowPlayAfterDraw: true,
  allowWildDraw4Challenge: true,
  allowMultiplePlay: false,
  unoPenalty: Object.freeze({ enabled: true, cards: 2 }),
  initialHandSize: 7,
  turnTimeoutSec: null,
  scoring: Object.freeze({ mode: 'single_round' as const }),
});

export type SettingsPresetId = 'classic' | 'house' | 'chaos';

export interface SettingsPreset {
  readonly id: SettingsPresetId;
  readonly label: string;
  readonly description: string;
  readonly settings: Readonly<GameSettings>;
}

export const SETTINGS_PRESETS: readonly SettingsPreset[] = [
  {
    id: 'classic',
    label: 'Classique',
    description: 'Les règles officielles, sans variante.',
    settings: DEFAULT_SETTINGS,
  },
  {
    id: 'house',
    label: 'Maison',
    description: 'Interception et empilement des +2/+4 : les règles de comptoir.',
    settings: { ...DEFAULT_SETTINGS, allowJumpIn: true, allowStackingDrawCards: true },
  },
  {
    id: 'chaos',
    label: 'Chaos',
    description: 'Tout est activé : 7 échange, 0 rotation, poses multiples, pioche jusqu’à jouer.',
    settings: {
      ...DEFAULT_SETTINGS,
      allowJumpIn: true,
      allowStackingDrawCards: true,
      sevenSwapHands: true,
      zeroRotateHands: true,
      drawUntilPlayable: true,
      allowMultiplePlay: true,
    },
  },
];

/**
 * Merges untrusted partial settings over a base and validates the result.
 * Throws a ZodError on invalid input — callers at the network boundary should
 * use `safeResolveSettings`.
 */
export function resolveSettings(
  patch: unknown = {},
  base: Readonly<GameSettings> = DEFAULT_SETTINGS,
): GameSettings {
  const parsedPatch = partialGameSettingsSchema.parse(patch);
  return gameSettingsSchema.parse({
    ...base,
    ...parsedPatch,
    unoPenalty: { ...base.unoPenalty, ...parsedPatch.unoPenalty },
  });
}

export function safeResolveSettings(
  patch: unknown,
  base: Readonly<GameSettings> = DEFAULT_SETTINGS,
): { ok: true; value: GameSettings } | { ok: false; error: string } {
  try {
    return { ok: true, value: resolveSettings(patch, base) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
