import { describe, expect, it } from 'vitest';
import { act, card, currentId, handOf, makeState, reject, wd4, wild } from './helpers';

function play(p0Hand: ReturnType<typeof card | typeof wild>[], extraSettings = {}) {
  const plus4 = wd4();
  const state = makeState({
    hands: [
      [plus4, ...p0Hand],
      [card('green', 1), card('blue', 'draw2'), wd4()],
      [card('green', 2)],
    ],
    top: card('red', 5),
    settings: { allowWildDraw4Challenge: true, ...extraSettings },
  });
  return act(state, 'p0', { type: 'PLAY_CARD', cardIds: [plus4.id], chosenColor: 'blue' });
}

describe('wild +4 challenge (allowWildDraw4Challenge)', () => {
  it('a +4 puts its target in AWAITING_CHALLENGE', () => {
    const { state } = play([card('red', 2), card('blue', 3)]);
    expect(state.phase).toEqual({
      type: 'AWAITING_CHALLENGE',
      accusedId: 'p0',
      previousColor: 'red',
    });
    expect(currentId(state)).toBe('p1');
    expect(state.drawStack.total).toBe(4);
    expect(state.top.activeColor).toBe('blue');
  });

  it('accepting: the target draws 4 and loses their turn', () => {
    const { state } = play([card('red', 2), card('blue', 3)]);
    const next = act(state, 'p1', { type: 'RESOLVE_CHALLENGE', challenge: false }).state;
    expect(handOf(next, 1)).toHaveLength(7);
    expect(currentId(next)).toBe('p2');
    expect(next.phase).toEqual({ type: 'AWAITING_PLAY' });
    expect(next.drawStack.total).toBe(0);
  });

  it('DRAW in the challenge phase is the same as accepting', () => {
    const { state } = play([card('red', 2), card('blue', 3)]);
    const next = act(state, 'p1', { type: 'DRAW' }).state;
    expect(handOf(next, 1)).toHaveLength(7);
    expect(currentId(next)).toBe('p2');
  });

  it('successful challenge (bluff): the accused draws 4, the challenger plays normally', () => {
    const { state } = play([card('red', 2), card('blue', 3)]);
    const { state: next, events } = act(state, 'p1', {
      type: 'RESOLVE_CHALLENGE',
      challenge: true,
    });
    expect(handOf(next, 0)).toHaveLength(6);
    expect(handOf(next, 1)).toHaveLength(3);
    expect(currentId(next)).toBe('p1');
    expect(next.phase).toEqual({ type: 'AWAITING_PLAY' });
    expect(next.top.activeColor).toBe('blue');
    expect(events).toContainEqual({
      type: 'CHALLENGE_RESOLVED',
      challengerId: 'p1',
      accusedId: 'p0',
      bluff: true,
    });
    expect(events).toContainEqual({
      type: 'CARDS_DRAWN',
      playerId: 'p0',
      count: 4,
      reason: 'challenge_bluff',
    });
  });

  it('failed challenge: the challenger draws 6 and loses their turn', () => {
    const { state } = play([card('blue', 3), card('green', 1)]);
    const { state: next, events } = act(state, 'p1', {
      type: 'RESOLVE_CHALLENGE',
      challenge: true,
    });
    expect(handOf(next, 1)).toHaveLength(9);
    expect(currentId(next)).toBe('p2');
    expect(events).toContainEqual({
      type: 'CARDS_DRAWN',
      playerId: 'p1',
      count: 6,
      reason: 'challenge_failed',
    });
  });

  it('only colored cards of the previous color make a bluff (wilds do not)', () => {
    const { state } = play([wild(), card('blue', 3)]);
    const { events } = act(state, 'p1', { type: 'RESOLVE_CHALLENGE', challenge: true });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'CHALLENGE_RESOLVED', bluff: false }),
    );
  });

  it('only the target can resolve, and only in this phase', () => {
    const { state } = play([card('red', 2), card('blue', 3)]);
    expect(reject(state, 'p2', { type: 'RESOLVE_CHALLENGE', challenge: true })).toBe(
      'NOT_YOUR_TURN',
    );
    const plain = makeState({ hands: [[card('red', 1)], [card('red', 2)]], top: card('red', 5) });
    expect(reject(plain, 'p0', { type: 'RESOLVE_CHALLENGE', challenge: true })).toBe('WRONG_PHASE');
  });

  it('a non-draw card cannot be played while the challenge is pending', () => {
    const { state } = play([card('red', 2), card('blue', 3)]);
    const green = handOf(state, 1)[0];
    expect(reject(state, 'p1', { type: 'PLAY_CARD', cardIds: [green?.id ?? ''] })).toBe(
      'MUST_STACK_OR_DRAW',
    );
  });

  describe('combined with stacking', () => {
    it('the target may stack a +2 instead of challenging', () => {
      const { state } = play([card('red', 2)], { allowStackingDrawCards: true });
      const blueD2 = handOf(state, 1)[1];
      const next = act(state, 'p1', { type: 'PLAY_CARD', cardIds: [blueD2?.id ?? ''] }).state;
      expect(next.drawStack.total).toBe(6);
      expect(currentId(next)).toBe('p2');
      expect(next.phase).toEqual({ type: 'AWAITING_PLAY' });
    });

    it('stacking a +4 opens a new challenge against the stacker', () => {
      const { state } = play([card('red', 2)], { allowStackingDrawCards: true });
      const plus4 = handOf(state, 1)[2];
      const next = act(state, 'p1', {
        type: 'PLAY_CARD',
        cardIds: [plus4?.id ?? ''],
        chosenColor: 'green',
      }).state;
      expect(next.drawStack.total).toBe(8);
      expect(next.phase).toEqual({
        type: 'AWAITING_CHALLENGE',
        accusedId: 'p1',
        previousColor: 'blue',
      });
      expect(currentId(next)).toBe('p2');
    });

    it('accepting a stacked penalty draws the whole stack', () => {
      const { state } = play([card('red', 2)], { allowStackingDrawCards: true });
      const plus4 = handOf(state, 1)[2];
      const stacked = act(state, 'p1', {
        type: 'PLAY_CARD',
        cardIds: [plus4?.id ?? ''],
        chosenColor: 'green',
      }).state;
      const next = act(stacked, 'p2', { type: 'RESOLVE_CHALLENGE', challenge: false }).state;
      expect(handOf(next, 2)).toHaveLength(9);
      expect(currentId(next)).toBe('p0');
    });
  });
});
