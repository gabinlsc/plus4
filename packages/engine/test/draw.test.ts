import { describe, expect, it } from 'vitest';
import { act, card, currentId, handOf, makeState, reject } from './helpers';

const hands = () => [[card('blue', 3), card('green', 4)], [card('green', 1)], [card('green', 2)]];

describe('drawing', () => {
  it('draws one unplayable card and passes the turn', () => {
    const y9 = card('yellow', 9);
    const state = makeState({ hands: hands(), top: card('red', 5), drawPile: [y9] });
    const { state: next, events } = act(state, 'p0', { type: 'DRAW' });
    expect(handOf(next, 0).map((c) => c.id)).toContain(y9.id);
    expect(currentId(next)).toBe('p1');
    expect(events).toContainEqual({
      type: 'CARDS_DRAWN',
      playerId: 'p0',
      count: 1,
      reason: 'voluntary',
    });
  });

  it('a playable drawn card can be played immediately', () => {
    const r8 = card('red', 8);
    const r2 = card('red', 2);
    const state = makeState({
      hands: [[card('blue', 3), r2], [card('green', 1)]],
      top: card('red', 5),
      drawPile: [r8],
    });
    const drawn = act(state, 'p0', { type: 'DRAW' }).state;
    expect(drawn.phase).toEqual({ type: 'AWAITING_PLAY_DRAWN', drawnCardId: r8.id });
    expect(currentId(drawn)).toBe('p0');
    expect(reject(drawn, 'p0', { type: 'PLAY_CARD', cardIds: [r2.id] })).toBe('ILLEGAL_CARD');
    expect(reject(drawn, 'p0', { type: 'DRAW' })).toBe('WRONG_PHASE');

    const played = act(drawn, 'p0', { type: 'PLAY_CARD', cardIds: [r8.id] }).state;
    expect(played.top.card).toEqual(r8);
    expect(currentId(played)).toBe('p1');
  });

  it('or kept with PASS', () => {
    const r8 = card('red', 8);
    const state = makeState({ hands: hands(), top: card('red', 5), drawPile: [r8] });
    const drawn = act(state, 'p0', { type: 'DRAW' }).state;
    const passed = act(drawn, 'p0', { type: 'PASS' }).state;
    expect(currentId(passed)).toBe('p1');
    expect(passed.phase).toEqual({ type: 'AWAITING_PLAY' });
    expect(handOf(passed, 0).map((c) => c.id)).toContain(r8.id);
  });

  it('cannot PASS without drawing first', () => {
    const state = makeState({ hands: hands(), top: card('red', 5) });
    expect(reject(state, 'p0', { type: 'PASS' })).toBe('CANNOT_PASS');
  });

  it('allowPlayAfterDraw=false: the turn passes even if the drawn card is playable', () => {
    const state = makeState({
      hands: hands(),
      top: card('red', 5),
      drawPile: [card('red', 8)],
      settings: { allowPlayAfterDraw: false },
    });
    const next = act(state, 'p0', { type: 'DRAW' }).state;
    expect(currentId(next)).toBe('p1');
    expect(next.phase).toEqual({ type: 'AWAITING_PLAY' });
  });

  it('drawUntilPlayable: keeps drawing until a playable card shows up', () => {
    const r8 = card('red', 8);
    const state = makeState({
      hands: hands(),
      top: card('red', 5),
      drawPile: [card('yellow', 9), card('green', 2), r8, card('blue', 1)],
      settings: { drawUntilPlayable: true },
    });
    const { state: next, events } = act(state, 'p0', { type: 'DRAW' });
    expect(handOf(next, 0)).toHaveLength(5);
    expect(next.phase).toEqual({ type: 'AWAITING_PLAY_DRAWN', drawnCardId: r8.id });
    expect(events).toContainEqual({
      type: 'CARDS_DRAWN',
      playerId: 'p0',
      count: 3,
      reason: 'voluntary',
    });
  });

  it('reshuffles the discard pile (except the top card) when the draw pile is empty', () => {
    const under = [card('blue', 1), card('green', 7)];
    const top = card('red', 5);
    const state = makeState({ hands: hands(), top, drawPile: [], discardBelow: under });
    const { state: next, events } = act(state, 'p0', { type: 'DRAW' });
    expect(events).toContainEqual({ type: 'DECK_RESHUFFLED', drawPileCount: 2 });
    expect(next.discardPile).toEqual([top]);
    expect(next.drawPile).toHaveLength(1);
    expect(handOf(next, 0)).toHaveLength(3);
  });

  it('drawing with both piles empty draws nothing and passes the turn', () => {
    const state = makeState({ hands: hands(), top: card('red', 5), drawPile: [] });
    const next = act(state, 'p0', { type: 'DRAW' }).state;
    expect(handOf(next, 0)).toHaveLength(2);
    expect(currentId(next)).toBe('p1');
  });
});
