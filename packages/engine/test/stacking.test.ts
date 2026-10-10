import { describe, expect, it } from 'vitest';
import { act, card, currentId, handOf, makeState, reject, wd4, wild } from './helpers';

const settings = { allowStackingDrawCards: true, allowWildDraw4Challenge: false };

function table() {
  const cards = {
    p0d2: card('red', 'draw2'),
    p0plus4: wd4(),
    p1d2: card('blue', 'draw2'),
    p1plus4: wd4(),
    p1red2: card('red', 'draw2'),
    p2plus4: wd4(),
    p2g5: card('green', 5),
    p2wild: wild(),
    p3b3: card('blue', 3),
  };
  const hands = [
    [cards.p0d2, cards.p0plus4, card('yellow', 1)],
    [cards.p1d2, cards.p1plus4, cards.p1red2, card('yellow', 2)],
    [cards.p2plus4, cards.p2g5, cards.p2wild, card('yellow', 3)],
    [cards.p3b3, card('yellow', 4)],
  ];
  return { cards, hands };
}

describe('draw card stacking (allowStackingDrawCards)', () => {
  it('a +2 starts a pending penalty instead of drawing immediately', () => {
    const { cards, hands } = table();
    const state = makeState({ hands, top: card('red', 5), settings });
    const { state: next, events } = act(state, 'p0', {
      type: 'PLAY_CARD',
      cardIds: [cards.p0d2.id],
    });
    expect(next.drawStack).toEqual({ total: 2, cardIds: [cards.p0d2.id] });
    expect(currentId(next)).toBe('p1');
    expect(handOf(next, 1)).toHaveLength(4);
    expect(events).toContainEqual({ type: 'PENALTY_STACKED', total: 2 });
  });

  it('+2 on +2 (any color), then +4 on +2: penalty accumulates to 8', () => {
    const { cards, hands } = table();
    let state = makeState({ hands, top: card('red', 5), settings });
    state = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [cards.p0d2.id] }).state;
    state = act(state, 'p1', { type: 'PLAY_CARD', cardIds: [cards.p1d2.id] }).state;
    expect(state.drawStack.total).toBe(4);
    const { state: next, events } = act(state, 'p2', {
      type: 'PLAY_CARD',
      cardIds: [cards.p2plus4.id],
      chosenColor: 'green',
    });
    expect(next.drawStack.total).toBe(8);
    expect(currentId(next)).toBe('p3');
    expect(events).toContainEqual({ type: 'PENALTY_STACKED', total: 8 });
  });

  it('A plays +4, B answers +2: C faces +6', () => {
    const { cards, hands } = table();
    let state = makeState({ hands, top: card('red', 5), settings });
    state = act(state, 'p0', {
      type: 'PLAY_CARD',
      cardIds: [cards.p0plus4.id],
      chosenColor: 'red',
    }).state;
    expect(state.drawStack.total).toBe(4);
    state = act(state, 'p1', { type: 'PLAY_CARD', cardIds: [cards.p1d2.id] }).state;
    expect(state.drawStack.total).toBe(6);
    expect(currentId(state)).toBe('p2');
  });

  it('A plays +4, B answers +4: C faces +8', () => {
    const { cards, hands } = table();
    let state = makeState({ hands, top: card('red', 5), settings });
    state = act(state, 'p0', {
      type: 'PLAY_CARD',
      cardIds: [cards.p0plus4.id],
      chosenColor: 'red',
    }).state;
    state = act(state, 'p1', {
      type: 'PLAY_CARD',
      cardIds: [cards.p1plus4.id],
      chosenColor: 'blue',
    }).state;
    expect(state.drawStack.total).toBe(8);
    expect(state.top.activeColor).toBe('blue');
  });

  it('while a penalty is pending, only draw cards can be played', () => {
    const { cards, hands } = table();
    const state = makeState({
      hands,
      top: cards.p1d2,
      current: 2,
      drawStack: { total: 2, cardIds: [cards.p1d2.id] },
      settings,
    });
    expect(reject(state, 'p2', { type: 'PLAY_CARD', cardIds: [cards.p2g5.id] })).toBe(
      'MUST_STACK_OR_DRAW',
    );
    expect(
      reject(state, 'p2', { type: 'PLAY_CARD', cardIds: [cards.p2wild.id], chosenColor: 'red' }),
    ).toBe('MUST_STACK_OR_DRAW');
    expect(reject(state, 'p2', { type: 'PASS' })).toBe('CANNOT_PASS');
  });

  it('the player who cannot stack draws the whole penalty and loses their turn', () => {
    const { hands } = table();
    const top = card('blue', 'draw2');
    const state = makeState({
      hands,
      top,
      current: 2,
      drawStack: { total: 6, cardIds: ['x', 'y', top.id] },
      settings,
    });
    const { state: next, events } = act(state, 'p2', { type: 'DRAW' });
    expect(handOf(next, 2)).toHaveLength(10);
    expect(next.drawStack).toEqual({ total: 0, cardIds: [] });
    expect(currentId(next)).toBe('p3');
    expect(next.phase).toEqual({ type: 'AWAITING_PLAY' });
    expect(events).toContainEqual({
      type: 'CARDS_DRAWN',
      playerId: 'p2',
      count: 6,
      reason: 'penalty',
    });
  });

  it('after the penalty is resolved, play resumes on the top color', () => {
    const { cards, hands } = table();
    const top = card('blue', 'draw2');
    let state = makeState({
      hands,
      top,
      current: 2,
      drawStack: { total: 2, cardIds: [top.id] },
      settings,
    });
    state = act(state, 'p2', { type: 'DRAW' }).state;
    expect(
      act(state, 'p3', { type: 'PLAY_CARD', cardIds: [cards.p3b3.id] }).state.top.card,
    ).toEqual(cards.p3b3);
  });

  it('stackingRequiresColorMatch: a +2 on a +4 must follow the declared color', () => {
    const { cards, hands } = table();
    const top = wd4();
    const state = makeState({
      hands,
      top,
      activeColor: 'red',
      current: 1,
      drawStack: { total: 4, cardIds: [top.id] },
      settings: { ...settings, stackingRequiresColorMatch: true },
    });
    expect(reject(state, 'p1', { type: 'PLAY_CARD', cardIds: [cards.p1d2.id] })).toBe(
      'MUST_STACK_OR_DRAW',
    );
    expect(
      act(state, 'p1', { type: 'PLAY_CARD', cardIds: [cards.p1red2.id] }).state.drawStack.total,
    ).toBe(6);
  });

  it('a penalty larger than the draw pile triggers a reshuffle', () => {
    const { hands } = table();
    const top = card('blue', 'draw2');
    const state = makeState({
      hands,
      top,
      current: 2,
      drawPile: [card('yellow', 9)],
      discardBelow: [card('green', 1), card('green', 2), card('green', 3)],
      drawStack: { total: 4, cardIds: [top.id] },
      settings,
    });
    const { state: next, events } = act(state, 'p2', { type: 'DRAW' });
    expect(handOf(next, 2)).toHaveLength(8);
    expect(events.map((e) => e.type)).toContain('DECK_RESHUFFLED');
  });
});
