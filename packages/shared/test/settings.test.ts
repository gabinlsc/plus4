import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_PRESETS,
  gameSettingsSchema,
  resolveSettings,
  safeResolveSettings,
} from '../src';

describe('DEFAULT_SETTINGS', () => {
  it('is a valid, frozen, classic configuration', () => {
    expect(gameSettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(DEFAULT_SETTINGS.allowJumpIn).toBe(false);
    expect(DEFAULT_SETTINGS.allowStackingDrawCards).toBe(false);
    expect(DEFAULT_SETTINGS.initialHandSize).toBe(7);
  });
});

describe('SETTINGS_PRESETS', () => {
  it.each(SETTINGS_PRESETS.map((p) => [p.id, p] as const))('%s preset is valid', (_, preset) => {
    expect(() => gameSettingsSchema.parse(preset.settings)).not.toThrow();
  });

  it('house preset enables both mandatory house rules', () => {
    const house = SETTINGS_PRESETS.find((p) => p.id === 'house');
    expect(house?.settings.allowJumpIn).toBe(true);
    expect(house?.settings.allowStackingDrawCards).toBe(true);
  });
});

describe('resolveSettings', () => {
  it('returns defaults for an empty patch', () => {
    expect(resolveSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a partial patch over the defaults', () => {
    const settings = resolveSettings({
      allowJumpIn: true,
      scoring: { mode: 'points', target: 500 },
    });
    expect(settings.allowJumpIn).toBe(true);
    expect(settings.scoring).toEqual({ mode: 'points', target: 500 });
    expect(settings.allowStackingDrawCards).toBe(false);
  });

  it('deep-merges the uno penalty', () => {
    const settings = resolveSettings({ unoPenalty: { cards: 4 } });
    expect(settings.unoPenalty).toEqual({ enabled: true, cards: 4 });
  });

  it('merges over a custom base', () => {
    const base = resolveSettings({ allowJumpIn: true });
    expect(resolveSettings({ sevenSwapHands: true }, base)).toMatchObject({
      allowJumpIn: true,
      sevenSwapHands: true,
    });
  });

  it.each([
    ['unknown key', { cheatMode: true }],
    ['hand size too small', { initialHandSize: 2 }],
    ['hand size too large', { initialHandSize: 30 }],
    ['non-integer hand size', { initialHandSize: 7.5 }],
    ['timer too short', { turnTimeoutSec: 3 }],
    ['score target out of range', { scoring: { mode: 'points', target: 5 } }],
    ['wrong type', { allowJumpIn: 'yes' }],
    ['not an object', 42],
  ])('rejects %s', (_, patch) => {
    expect(() => resolveSettings(patch)).toThrow();
    expect(safeResolveSettings(patch).ok).toBe(false);
  });

  it('accepts a null timer', () => {
    expect(resolveSettings({ turnTimeoutSec: null }).turnTimeoutSec).toBeNull();
  });
});
