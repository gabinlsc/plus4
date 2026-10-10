import { describe, expect, it } from 'vitest';
import {
  createRoomPayloadSchema,
  joinRoomPayloadSchema,
  normalizeRoomCode,
  parseGameIntent,
  playerNameSchema,
  ROOM_CODE_REGEX,
} from '../src';

describe('parseGameIntent', () => {
  it.each([
    { type: 'PLAY_CARD', cardIds: ['r-5-0'], expectedVersion: 3 },
    { type: 'PLAY_CARD', cardIds: ['w-0'], chosenColor: 'blue', expectedVersion: 0 },
    { type: 'JUMP_IN', cardId: 'r-5-1', expectedVersion: 12 },
    { type: 'DRAW', expectedVersion: 1 },
    { type: 'PASS', expectedVersion: 1 },
    { type: 'CHOOSE_COLOR', color: 'green', expectedVersion: 1 },
    { type: 'CHOOSE_SWAP_TARGET', targetId: 'p2', expectedVersion: 1 },
    { type: 'RESOLVE_CHALLENGE', challenge: true, expectedVersion: 1 },
    { type: 'CALL_UNO' },
    { type: 'CATCH_UNO', targetId: 'p2' },
  ])('accepts $type', (intent) => {
    expect(parseGameIntent(intent)).toEqual(intent);
  });

  it.each([
    ['null', null],
    ['unknown type', { type: 'WIN_NOW' }],
    ['missing version', { type: 'DRAW' }],
    ['negative version', { type: 'DRAW', expectedVersion: -1 }],
    ['empty card list', { type: 'PLAY_CARD', cardIds: [], expectedVersion: 0 }],
    ['invalid color', { type: 'CHOOSE_COLOR', color: 'purple', expectedVersion: 0 }],
    ['extra key', { type: 'DRAW', expectedVersion: 0, hand: [] }],
  ])('rejects %s', (_, input) => {
    expect(parseGameIntent(input)).toBeNull();
  });
});

describe('room codes', () => {
  it('normalizes user input', () => {
    expect(normalizeRoomCode(' uno-8f2a ')).toBe('UNO-8F2A');
    expect(normalizeRoomCode('8f2a')).toBe('UNO-8F2A');
  });

  it('rejects ambiguous characters', () => {
    expect(ROOM_CODE_REGEX.test('UNO-8F2A')).toBe(true);
    expect(ROOM_CODE_REGEX.test('UNO-O0I1')).toBe(false);
  });

  it('join payload normalizes the code', () => {
    expect(joinRoomPayloadSchema.parse({ code: 'abcd', playerName: 'Gabin' }).code).toBe(
      'UNO-ABCD',
    );
    expect(joinRoomPayloadSchema.safeParse({ code: 'xx', playerName: 'Gabin' }).success).toBe(
      false,
    );
  });
});

describe('player names', () => {
  it('trims and accepts accented names', () => {
    expect(playerNameSchema.parse('  Élodie ')).toBe('Élodie');
  });

  it.each(['', '   ', 'a'.repeat(17), '<script>'])('rejects %j', (name) => {
    expect(playerNameSchema.safeParse(name).success).toBe(false);
  });
});

describe('createRoomPayloadSchema', () => {
  it('requires 1-4 bots in solo', () => {
    expect(createRoomPayloadSchema.safeParse({ playerName: 'A', mode: 'solo' }).success).toBe(
      false,
    );
    const bots = (n: number) => Array.from({ length: n }, () => ({ difficulty: 'normal' }));
    expect(
      createRoomPayloadSchema.safeParse({ playerName: 'A', mode: 'solo', bots: bots(1) }).success,
    ).toBe(true);
    expect(
      createRoomPayloadSchema.safeParse({ playerName: 'A', mode: 'solo', bots: bots(4) }).success,
    ).toBe(true);
    expect(
      createRoomPayloadSchema.safeParse({ playerName: 'A', mode: 'solo', bots: bots(5) }).success,
    ).toBe(false);
  });

  it('accepts online rooms with partial settings', () => {
    const parsed = createRoomPayloadSchema.safeParse({
      playerName: 'A',
      mode: 'online',
      settings: { allowJumpIn: true },
    });
    expect(parsed.success).toBe(true);
  });
});
