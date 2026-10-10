import { describe, expect, it } from 'vitest';
import { applyIntent } from '../src';
import { act, card, currentId, handOf, makeState, reject, wd4, wild } from './helpers';

const red5 = () => card('red', 5);

describe('basic play', () => {
  it('plays a card matching the color', () => {
    const r7 = card('red', 7);
    const state = makeState({
      hands: [[r7, card('blue', 1)], [card('green', 2)], [card('green', 3)]],
      top: red5(),
    });
    const { state: next, events } = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id] });
    expect(next.top.card).toEqual(r7);
    expect(next.top.activeColor).toBe('red');
    expect(next.discardPile.at(-1)).toEqual(r7);
    expect(handOf(next, 0)).toHaveLength(1);
    expect(currentId(next)).toBe('p1');
    expect(next.version).toBe(1);
    expect(events).toEqual([
      { type: 'CARD_PLAYED', playerId: 'p0', cards: [r7], jumpIn: false },
      { type: 'TURN_CHANGED', playerId: 'p1' },
    ]);
  });

  it('plays a card matching the value', () => {
    const b5 = card('blue', 5);
    const state = makeState({ hands: [[b5, card('blue', 1)], [card('green', 1)]], top: red5() });
    const next = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [b5.id] }).state;
    expect(next.top.activeColor).toBe('blue');
  });

  it('does not mutate the input state', () => {
    const r7 = card('red', 7);
    const state = makeState({ hands: [[r7, card('blue', 1)], [card('green', 2)]], top: red5() });
    const snapshot = structuredClone(state);
    act(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id] });
    expect(state).toEqual(snapshot);
  });

  it.each([
    ['an illegal card', 'p0', 'b7', 'ILLEGAL_CARD'],
    ['out of turn', 'p1', 'r9', 'NOT_YOUR_TURN'],
    ['a card not in hand', 'p0', 'r9', 'CARD_NOT_IN_HAND'],
    ['an unknown player', 'p9', 'b7', 'UNKNOWN_PLAYER'],
  ] as const)('rejects %s', (_, player, which, reason) => {
    const b7 = card('blue', 7);
    const r9 = card('red', 9);
    const state = makeState({ hands: [[b7, card('blue', 1)], [r9]], top: red5() });
    const cardId = which === 'b7' ? b7.id : r9.id;
    expect(reject(state, player, { type: 'PLAY_CARD', cardIds: [cardId] })).toBe(reason);
  });

  it('rejects a stale expectedVersion', () => {
    const r7 = card('red', 7);
    const state = {
      ...makeState({ hands: [[r7, card('blue', 1)], [card('green', 2)]], top: red5() }),
      version: 5,
    };
    const result = applyIntent(state, 'p0', {
      type: 'PLAY_CARD',
      cardIds: [r7.id],
      expectedVersion: 4,
    });
    expect(result).toEqual({ ok: false, reason: 'STALE_STATE' });
  });

  it('wraps around the table', () => {
    const r7 = card('red', 7);
    const state = makeState({
      hands: [[card('green', 1)], [card('green', 2)], [r7, card('blue', 1)]],
      top: red5(),
      current: 2,
    });
    expect(currentId(act(state, 'p2', { type: 'PLAY_CARD', cardIds: [r7.id] }).state)).toBe('p0');
  });
});

describe('wild cards', () => {
  it('requires a color and applies it', () => {
    const w = wild();
    const state = makeState({
      hands: [
        [w, card('blue', 1)],
        [card('red', 2), card('green', 2)],
      ],
      top: red5(),
    });
    expect(reject(state, 'p0', { type: 'PLAY_CARD', cardIds: [w.id] })).toBe('COLOR_REQUIRED');
    const { state: next, events } = act(state, 'p0', {
      type: 'PLAY_CARD',
      cardIds: [w.id],
      chosenColor: 'green',
    });
    expect(next.top.activeColor).toBe('green');
    expect(events).toContainEqual({ type: 'COLOR_CHOSEN', playerId: 'p0', color: 'green' });
    const red2 = handOf(next, 1)[0];
    expect(reject(next, 'p1', { type: 'PLAY_CARD', cardIds: [red2?.id ?? ''] })).toBe(
      'ILLEGAL_CARD',
    );
  });

  it('wild is playable on anything; colored cards follow the declared color', () => {
    const g4 = card('green', 4);
    const state = makeState({
      hands: [[g4, wild()], [card('red', 1)]],
      top: wild(),
      activeColor: 'green',
    });
    expect(act(state, 'p0', { type: 'PLAY_CARD', cardIds: [g4.id] }).state.top.card).toEqual(g4);
  });
});

describe('action cards', () => {
  it('skip: the next player is skipped', () => {
    const skip = card('red', 'skip');
    const state = makeState({
      hands: [[skip, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: red5(),
    });
    const { state: next, events } = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [skip.id] });
    expect(currentId(next)).toBe('p2');
    expect(events).toContainEqual({ type: 'TURN_SKIPPED', playerId: 'p1' });
  });

  it('reverse (3+ players): direction flips', () => {
    const rev = card('red', 'reverse');
    const state = makeState({
      hands: [[rev, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: red5(),
    });
    const { state: next, events } = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [rev.id] });
    expect(next.direction).toBe(-1);
    expect(currentId(next)).toBe('p2');
    expect(events).toContainEqual({ type: 'DIRECTION_CHANGED', direction: -1 });
  });

  it('reverse (2 players): acts as a skip', () => {
    const rev = card('red', 'reverse');
    const state = makeState({ hands: [[rev, card('blue', 1)], [card('green', 1)]], top: red5() });
    expect(currentId(act(state, 'p0', { type: 'PLAY_CARD', cardIds: [rev.id] }).state)).toBe('p0');
  });

  it('+2 (classic): next player draws 2 and loses their turn', () => {
    const d2 = card('red', 'draw2');
    const state = makeState({
      hands: [[d2, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: red5(),
    });
    const { state: next, events } = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [d2.id] });
    expect(handOf(next, 1)).toHaveLength(3);
    expect(currentId(next)).toBe('p2');
    expect(next.drawStack.total).toBe(0);
    expect(events).toContainEqual({
      type: 'CARDS_DRAWN',
      playerId: 'p1',
      count: 2,
      reason: 'penalty',
    });
  });

  it('+4 without challenge rule: next player draws 4 and loses their turn', () => {
    const plus4 = wd4();
    const state = makeState({
      hands: [[plus4, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: red5(),
      settings: { allowWildDraw4Challenge: false },
    });
    const next = act(state, 'p0', {
      type: 'PLAY_CARD',
      cardIds: [plus4.id],
      chosenColor: 'blue',
    }).state;
    expect(handOf(next, 1)).toHaveLength(5);
    expect(currentId(next)).toBe('p2');
    expect(next.top.activeColor).toBe('blue');
  });
});
