import { describe, expect, it } from 'vitest';
import { act, card, handOf, makeState, reject } from './helpers';

function setup(settings = {}) {
  const r7 = card('red', 7);
  const state = makeState({
    hands: [
      [r7, card('blue', 3)],
      [card('green', 1), card('green', 2)],
      [card('green', 3), card('green', 4)],
    ],
    top: card('red', 5),
    settings,
  });
  return { r7, state };
}

describe('Uno call and catch', () => {
  it('reaching one card without calling makes the player vulnerable', () => {
    const { r7, state } = setup();
    const next = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id] }).state;
    expect(next.players[0]?.uno).toEqual({ declared: false, vulnerable: true });
  });

  it('an opponent catching a vulnerable player inflicts the penalty', () => {
    const { r7, state } = setup();
    const vulnerable = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id] }).state;
    const { state: next, events } = act(vulnerable, 'p2', { type: 'CATCH_UNO', targetId: 'p0' });
    expect(handOf(next, 0)).toHaveLength(3);
    expect(next.players[0]?.uno.vulnerable).toBe(false);
    expect(events).toEqual([
      { type: 'UNO_CAUGHT', by: 'p2', target: 'p0' },
      { type: 'CARDS_DRAWN', playerId: 'p0', count: 2, reason: 'uno_caught' },
    ]);
  });

  it('calling Uno before playing the penultimate card protects the player', () => {
    const { r7, state } = setup();
    const called = act(state, 'p0', { type: 'CALL_UNO' });
    expect(called.events).toEqual([{ type: 'UNO_CALLED', playerId: 'p0' }]);
    const next = act(called.state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id] }).state;
    expect(next.players[0]?.uno).toEqual({ declared: true, vulnerable: false });
    expect(reject(next, 'p2', { type: 'CATCH_UNO', targetId: 'p0' })).toBe('NOTHING_TO_CATCH');
  });

  it('calling Uno right after playing still protects the player', () => {
    const { r7, state } = setup();
    const vulnerable = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id] }).state;
    const next = act(vulnerable, 'p0', { type: 'CALL_UNO' }).state;
    expect(next.players[0]?.uno).toEqual({ declared: true, vulnerable: false });
  });

  it('the catch window closes once another player acts', () => {
    const { r7, state } = setup();
    const vulnerable = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id] }).state;
    const after = act(vulnerable, 'p1', { type: 'DRAW' }).state;
    expect(after.players[0]?.uno.vulnerable).toBe(false);
    expect(reject(after, 'p2', { type: 'CATCH_UNO', targetId: 'p0' })).toBe('NOTHING_TO_CATCH');
  });

  it('cannot catch oneself or an unknown player', () => {
    const { r7, state } = setup();
    const vulnerable = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id] }).state;
    expect(reject(vulnerable, 'p0', { type: 'CATCH_UNO', targetId: 'p0' })).toBe('INVALID_TARGET');
    expect(reject(vulnerable, 'p1', { type: 'CATCH_UNO', targetId: 'p9' })).toBe('INVALID_TARGET');
  });

  it('calling Uno with too many cards, or with two cards out of turn, is refused', () => {
    const state = makeState({
      hands: [
        [card('red', 1), card('red', 2), card('red', 3)],
        [card('green', 1), card('green', 2)],
      ],
      top: card('red', 5),
    });
    expect(reject(state, 'p0', { type: 'CALL_UNO' })).toBe('UNO_NOT_ALLOWED');
    expect(reject(state, 'p1', { type: 'CALL_UNO' })).toBe('UNO_NOT_ALLOWED');
  });

  it('drawing after a pre-call cancels the declaration', () => {
    const { state } = setup();
    const called = act(state, 'p0', { type: 'CALL_UNO' }).state;
    const next = act(called, 'p0', { type: 'DRAW' }).state;
    expect(next.players[0]?.uno.declared).toBe(false);
  });

  it('with the penalty disabled nobody is ever vulnerable', () => {
    const { r7, state } = setup({ unoPenalty: { enabled: false } });
    const next = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id] }).state;
    expect(next.players[0]?.uno.vulnerable).toBe(false);
    expect(reject(next, 'p1', { type: 'CATCH_UNO', targetId: 'p0' })).toBe('UNO_NOT_ALLOWED');
  });

  it('uses the configured penalty size', () => {
    const { r7, state } = setup({ unoPenalty: { cards: 4 } });
    const vulnerable = act(state, 'p0', { type: 'PLAY_CARD', cardIds: [r7.id] }).state;
    expect(
      handOf(act(vulnerable, 'p1', { type: 'CATCH_UNO', targetId: 'p0' }).state, 0),
    ).toHaveLength(5);
  });
});
