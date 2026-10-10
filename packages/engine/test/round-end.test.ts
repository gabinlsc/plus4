import { describe, expect, it } from 'vitest';
import { startNextRound } from '../src';
import { act, card, currentId, handOf, makeState, reject, wild } from './helpers';

function setup(settings = {}, scores?: number[]) {
  const last = card('red', 7);
  const state = makeState({
    hands: [[last], [card('blue', 3), wild()], [card('green', 'skip')]],
    top: card('red', 5),
    settings,
    ...(scores ? { scores } : {}),
  });
  return { last, state };
}

describe('end of round', () => {
  it('single round: playing the last card ends the game and scores opponents’ hands', () => {
    const { last, state } = setup();
    const { state: next, events } = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [last.id] });
    expect(events).toContainEqual({ type: 'ROUND_ENDED', winnerId: 'p0', points: 73 });
    expect(events.at(-1)).toEqual({ type: 'GAME_ENDED', winnerId: 'p0' });
    expect(next.phase).toEqual({ type: 'GAME_OVER', winnerId: 'p0' });
    expect(next.players[0]?.score).toBe(73);
  });

  it('points mode below target: round over, then a new round can start', () => {
    const { last, state } = setup({ scoring: { mode: 'points', target: 500 } });
    const over = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [last.id] }).state;
    expect(over.phase).toEqual({ type: 'ROUND_OVER', winnerId: 'p0', points: 73 });
    expect(reject(over, 'p1', { type: 'DRAW' })).toBe('GAME_NOT_RUNNING');

    const result = startNextRound(over);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.state;
    expect(next.round).toBe(2);
    expect(next.dealerIndex).toBe(1);
    expect(next.version).toBe(over.version + 1);
    expect(next.players.map((p) => p.score)).toEqual([73, 0, 0]);
    expect(next.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(next.players.every((p) => !p.uno.declared && !p.uno.vulnerable)).toBe(true);
    expect(result.events[0]).toEqual({ type: 'ROUND_STARTED', round: 2, dealerId: 'p1' });
  });

  it('points mode reaching the target ends the game', () => {
    const { last, state } = setup({ scoring: { mode: 'points', target: 500 } }, [450, 100, 0]);
    const next = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [last.id] }).state;
    expect(next.phase).toEqual({ type: 'GAME_OVER', winnerId: 'p0' });
    expect(next.players[0]?.score).toBe(523);
  });

  it('startNextRound is refused outside ROUND_OVER', () => {
    const { state } = setup();
    expect(startNextRound(state)).toEqual({ ok: false, reason: 'WRONG_PHASE' });
  });

  it('a final +2 is drawn by the next player before scoring', () => {
    const d2 = card('red', 'draw2');
    const state = makeState({
      hands: [[d2], [card('blue', 3), wild()], [card('green', 'skip')]],
      top: card('red', 5),
      drawPile: [card('green', 4), card('green', 6)],
    });
    const next = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [d2.id] }).state;
    expect(handOf(next, 1)).toHaveLength(4);
    expect(next.phase.type).toBe('GAME_OVER');
    expect(next.players[0]?.score).toBe(3 + 50 + 4 + 6 + 20);
  });

  it('a final +2 on a pending stack makes the next player draw the whole stack', () => {
    const top = card('red', 'draw2');
    const d2 = card('red', 'draw2');
    const state = makeState({
      hands: [[d2], [card('blue', 3)], [card('green', 1)]],
      top,
      drawStack: { total: 2, cardIds: [top.id] },
      settings: { allowStackingDrawCards: true },
    });
    const next = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [d2.id] }).state;
    expect(handOf(next, 1)).toHaveLength(5);
  });

  it('game over refuses any further intent', () => {
    const { last, state } = setup();
    const over = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [last.id] }).state;
    expect(currentId(over)).toBeDefined();
    expect(reject(over, 'p1', { type: 'CALL_UNO' })).toBe('GAME_NOT_RUNNING');
  });
});
