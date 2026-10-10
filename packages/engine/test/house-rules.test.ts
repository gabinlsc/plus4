import { describe, expect, it } from 'vitest';
import { act, card, currentId, handOf, ids, makeState, reject } from './helpers';

describe('seven swaps hands (sevenSwapHands)', () => {
  const settings = { sevenSwapHands: true };

  function setup() {
    const seven = card('red', 7);
    const h0 = [seven, card('blue', 1), card('blue', 2)];
    const h1 = [card('green', 1)];
    const h2 = [card('green', 2), card('green', 3), card('green', 4), card('green', 5)];
    return {
      seven,
      h0,
      h1,
      h2,
      state: makeState({ hands: [h0, h1, h2], top: card('red', 5), settings }),
    };
  }

  it('playing a 7 asks the player to pick a target, then swaps hands', () => {
    const { seven, h0, h2, state } = setup();
    const awaiting = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [seven.id] }).state;
    expect(awaiting.phase).toEqual({ type: 'AWAITING_SWAP_TARGET' });
    expect(currentId(awaiting)).toBe('p0');
    expect(reject(awaiting, 'p0', { type: 'DRAW' })).toBe('WRONG_PHASE');
    expect(reject(awaiting, 'p0', { type: 'CHOOSE_SWAP_TARGET', targetId: 'p0' })).toBe(
      'INVALID_TARGET',
    );
    expect(reject(awaiting, 'p0', { type: 'CHOOSE_SWAP_TARGET', targetId: 'p9' })).toBe(
      'INVALID_TARGET',
    );
    expect(reject(awaiting, 'p1', { type: 'CHOOSE_SWAP_TARGET', targetId: 'p2' })).toBe(
      'NOT_YOUR_TURN',
    );

    const { state: next, events } = act(awaiting, 'p0', {
      type: 'CHOOSE_SWAP_TARGET',
      targetId: 'p2',
    });
    expect(ids(handOf(next, 0))).toEqual(ids(h2));
    expect(ids(handOf(next, 2))).toEqual(ids(h0.slice(1)));
    expect(currentId(next)).toBe('p1');
    expect(events).toContainEqual({ type: 'HANDS_SWAPPED', a: 'p0', b: 'p2' });
  });

  it('a 7 played as the last card wins without swapping', () => {
    const seven = card('red', 7);
    const state = makeState({
      hands: [[seven], [card('green', 1)]],
      top: card('red', 5),
      settings,
    });
    expect(act(state, 'p0', { type: 'PLAY_CARD', cardIds: [seven.id] }).state.phase.type).toBe(
      'GAME_OVER',
    );
  });

  it('a 7 is a plain card when the rule is off', () => {
    const { seven, h0, h1, h2 } = setup();
    const state = makeState({ hands: [h0, h1, h2], top: card('red', 5) });
    expect(currentId(act(state, 'p0', { type: 'PLAY_CARD', cardIds: [seven.id] }).state)).toBe(
      'p1',
    );
  });
});

describe('zero rotates hands (zeroRotateHands)', () => {
  function setup(direction: 1 | -1) {
    const zero = card('red', 0);
    const h0 = [zero, card('blue', 1)];
    const h1 = [card('green', 1), card('green', 2)];
    const h2 = [card('yellow', 1), card('yellow', 2), card('yellow', 3)];
    const state = makeState({
      hands: [h0, h1, h2],
      top: card('red', 5),
      direction,
      settings: { zeroRotateHands: true },
    });
    return { zero, h0, h1, h2, state };
  }

  it('every hand moves one seat in the play direction', () => {
    const { zero, h0, h1, h2, state } = setup(1);
    const { state: next, events } = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [zero.id] });
    expect(ids(handOf(next, 1))).toEqual(ids(h0.slice(1)));
    expect(ids(handOf(next, 2))).toEqual(ids(h1));
    expect(ids(handOf(next, 0))).toEqual(ids(h2));
    expect(currentId(next)).toBe('p1');
    expect(events).toContainEqual({ type: 'HANDS_ROTATED', direction: 1 });
  });

  it('follows a reversed direction', () => {
    const { zero, h0, h1, h2, state } = setup(-1);
    const next = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [zero.id] }).state;
    expect(ids(handOf(next, 2))).toEqual(ids(h0.slice(1)));
    expect(ids(handOf(next, 0))).toEqual(ids(h1));
    expect(ids(handOf(next, 1))).toEqual(ids(h2));
    expect(currentId(next)).toBe('p2');
  });
});

describe('multiple play (allowMultiplePlay)', () => {
  const settings = { allowMultiplePlay: true };

  it('plays several cards of the same value; the last one sets the color', () => {
    const r7 = card('red', 7);
    const b7 = card('blue', 7);
    const state = makeState({
      hands: [[r7, b7, card('green', 1)], [card('green', 2)]],
      top: card('red', 3),
      settings,
    });
    const { state: next, events } = act(state, 'p0', {
      type: 'PLAY_CARD',
      cardIds: [r7.id, b7.id],
    });
    expect(next.top.card).toEqual(b7);
    expect(next.top.activeColor).toBe('blue');
    expect(handOf(next, 0)).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'CARD_PLAYED',
      playerId: 'p0',
      cards: [r7, b7],
      jumpIn: false,
    });
  });

  it('is refused when disabled', () => {
    const r7 = card('red', 7);
    const b7 = card('blue', 7);
    const state = makeState({
      hands: [[r7, b7, card('green', 1)], [card('green', 2)]],
      top: card('red', 3),
    });
    expect(reject(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id, b7.id] })).toBe(
      'MULTIPLE_PLAY_DISABLED',
    );
  });

  it('refuses mismatched values and duplicate ids', () => {
    const r7 = card('red', 7);
    const r8 = card('red', 8);
    const state = makeState({
      hands: [[r7, r8, card('green', 1)], [card('green', 2)]],
      top: card('red', 3),
      settings,
    });
    expect(reject(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id, r8.id] })).toBe(
      'MULTIPLE_PLAY_MISMATCH',
    );
    expect(reject(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id, r7.id] })).toBe(
      'MULTIPLE_PLAY_MISMATCH',
    );
  });

  it('the first card must be legal', () => {
    const r7 = card('red', 7);
    const b7 = card('blue', 7);
    const state = makeState({
      hands: [[r7, b7, card('green', 1)], [card('green', 2)]],
      top: card('red', 3),
      settings,
    });
    expect(reject(state, 'p0', { type: 'PLAY_CARD', cardIds: [b7.id, r7.id] })).toBe(
      'ILLEGAL_CARD',
    );
  });

  it('two skips skip two players', () => {
    const s1 = card('red', 'skip');
    const s2 = card('green', 'skip');
    const state = makeState({
      hands: [
        [s1, s2, card('blue', 1)],
        [card('green', 1)],
        [card('green', 2)],
        [card('green', 3)],
      ],
      top: card('red', 3),
      settings,
    });
    expect(currentId(act(state, 'p0', { type: 'PLAY_CARD', cardIds: [s1.id, s2.id] }).state)).toBe(
      'p3',
    );
  });

  it('two +2 (classic) make the next player draw 4', () => {
    const d1 = card('red', 'draw2');
    const d2 = card('green', 'draw2');
    const state = makeState({
      hands: [[d1, d2, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: card('red', 3),
      settings,
    });
    const next = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [d1.id, d2.id] }).state;
    expect(handOf(next, 1)).toHaveLength(5);
    expect(currentId(next)).toBe('p2');
  });

  it('two +2 (stacking) add 4 to the pending penalty', () => {
    const d1 = card('red', 'draw2');
    const d2 = card('green', 'draw2');
    const state = makeState({
      hands: [[d1, d2, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: card('red', 3),
      settings: { ...settings, allowStackingDrawCards: true },
    });
    expect(
      act(state, 'p0', { type: 'PLAY_CARD', cardIds: [d1.id, d2.id] }).state.drawStack.total,
    ).toBe(4);
  });
});
