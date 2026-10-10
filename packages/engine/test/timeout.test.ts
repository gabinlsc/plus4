import { describe, expect, it } from 'vitest';
import { resolveTimeout } from '../src';
import { act, card, currentId, handOf, makeState, wd4, wild } from './helpers';

function run(state: Parameters<typeof resolveTimeout>[0]) {
  const result = resolveTimeout(state);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe('resolveTimeout', () => {
  it('AWAITING_PLAY: the current player draws and the turn passes', () => {
    const state = makeState({
      hands: [[card('blue', 1)], [card('green', 1)]],
      top: card('red', 5),
      drawPile: [card('red', 8)],
    });
    const { state: next, events } = run(state);
    expect(handOf(next, 0)).toHaveLength(2);
    expect(currentId(next)).toBe('p1');
    expect(events).toContainEqual({
      type: 'CARDS_DRAWN',
      playerId: 'p0',
      count: 1,
      reason: 'timeout',
    });
  });

  it('with a pending stack: the current player takes the penalty', () => {
    const top = card('red', 'draw2');
    const state = makeState({
      hands: [[card('blue', 1)], [card('green', 1)]],
      top,
      drawStack: { total: 4, cardIds: ['a', top.id] },
      settings: { allowStackingDrawCards: true },
    });
    const next = run(state).state;
    expect(handOf(next, 0)).toHaveLength(5);
    expect(next.drawStack.total).toBe(0);
  });

  it('AWAITING_COLOR: picks the most frequent color in hand', () => {
    const w = wild();
    const state = makeState({
      hands: [[card('green', 1)], [card('blue', 1), card('blue', 2), card('red', 3)]],
      top: w,
      current: 1,
      phase: { type: 'AWAITING_COLOR', cardId: w.id },
    });
    const next = run(state).state;
    expect(next.top.activeColor).toBe('blue');
    expect(next.phase).toEqual({ type: 'AWAITING_PLAY' });
  });

  it('AWAITING_SWAP_TARGET: swaps with the opponent holding the fewest cards', () => {
    const state = makeState({
      hands: [
        [card('blue', 1), card('blue', 2)],
        [card('green', 1), card('green', 2)],
        [card('green', 3)],
      ],
      top: card('red', 7),
      phase: { type: 'AWAITING_SWAP_TARGET' },
    });
    const next = run(state).state;
    expect(handOf(next, 0)).toHaveLength(1);
    expect(currentId(next)).toBe('p1');
  });

  it('AWAITING_CHALLENGE: accepts the penalty', () => {
    const plus4 = wd4();
    const base = makeState({
      hands: [[plus4, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: card('red', 5),
    });
    const challenged = act(base, 'p0', {
      type: 'PLAY_CARD',
      cardIds: [plus4.id],
      chosenColor: 'blue',
    }).state;
    const next = run(challenged).state;
    expect(handOf(next, 1)).toHaveLength(5);
    expect(currentId(next)).toBe('p2');
  });

  it('AWAITING_PLAY_DRAWN: keeps the drawn card', () => {
    const state = makeState({
      hands: [[card('blue', 1), card('red', 8)], [card('green', 1)]],
      top: card('red', 5),
      phase: { type: 'AWAITING_PLAY_DRAWN', drawnCardId: 'x' },
    });
    expect(currentId(run(state).state)).toBe('p1');
  });

  it('is refused once the game is over', () => {
    const state = makeState({
      hands: [[card('blue', 1)], [card('green', 1)]],
      top: card('red', 5),
      phase: { type: 'GAME_OVER', winnerId: 'p0' },
    });
    expect(resolveTimeout(state)).toEqual({ ok: false, reason: 'GAME_NOT_RUNNING' });
  });
});
