import { describe, expect, it } from 'vitest';
import { applyIntent } from '../src';
import { act, card, currentId, handOf, makeState, reject, wild } from './helpers';

const settings = { allowJumpIn: true };

function table() {
  const top = card('red', 5);
  const twin = card('red', 5);
  const hands = [
    [card('blue', 1), card('blue', 2)],
    [card('green', 1), card('green', 2)],
    [twin, card('red', 6), card('blue', 5), card('yellow', 1)],
    [card('green', 3), card('green', 4)],
  ];
  return { top, twin, hands };
}

describe('jump-in (allowJumpIn)', () => {
  it('a player holding the exact same card can play out of turn; play resumes after them', () => {
    const { top, twin, hands } = table();
    const state = makeState({ hands, top, settings });
    const { state: next, events } = act(state, 'p2', { type: 'JUMP_IN', cardId: twin.id });
    expect(next.top.card).toEqual(twin);
    expect(handOf(next, 2)).toHaveLength(3);
    expect(currentId(next)).toBe('p3');
    expect(events[0]).toEqual({ type: 'CARD_PLAYED', playerId: 'p2', cards: [twin], jumpIn: true });
  });

  it('same color but different value is refused', () => {
    const { top, hands } = table();
    const state = makeState({ hands, top, settings });
    const red6 = handOf(state, 2)[1];
    expect(reject(state, 'p2', { type: 'JUMP_IN', cardId: red6?.id ?? '' })).toBe(
      'JUMP_IN_NOT_IDENTICAL',
    );
  });

  it('same value but different color is refused', () => {
    const { top, hands } = table();
    const state = makeState({ hands, top, settings });
    const blue5 = handOf(state, 2)[2];
    expect(reject(state, 'p2', { type: 'JUMP_IN', cardId: blue5?.id ?? '' })).toBe(
      'JUMP_IN_NOT_IDENTICAL',
    );
  });

  it('wilds can never jump in', () => {
    const w = wild();
    const state = makeState({
      hands: [[card('blue', 1)], [card('green', 1)], [w, card('yellow', 1)]],
      top: wild(),
      activeColor: 'red',
      settings,
    });
    expect(reject(state, 'p2', { type: 'JUMP_IN', cardId: w.id })).toBe('JUMP_IN_NOT_IDENTICAL');
  });

  it('is refused when the rule is disabled', () => {
    const { top, twin, hands } = table();
    const state = makeState({ hands, top });
    expect(reject(state, 'p2', { type: 'JUMP_IN', cardId: twin.id })).toBe('JUMP_IN_DISABLED');
  });

  it('a card not in hand is refused', () => {
    const { top, hands } = table();
    const state = makeState({ hands, top, settings });
    expect(reject(state, 'p1', { type: 'JUMP_IN', cardId: card('red', 5).id })).toBe(
      'CARD_NOT_IN_HAND',
    );
  });

  it('race: two simultaneous jump-ins on the same version, only the first wins', () => {
    const { top, twin, hands } = table();
    const otherTwin = card('red', 5);
    hands[3] = [otherTwin, card('green', 4)];
    const state = makeState({ hands, top, settings });
    const first = applyIntent(state, 'p2', {
      type: 'JUMP_IN',
      cardId: twin.id,
      expectedVersion: 0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyIntent(first.state, 'p3', {
      type: 'JUMP_IN',
      cardId: otherTwin.id,
      expectedVersion: 0,
    });
    expect(second).toEqual({ ok: false, reason: 'STALE_STATE' });
  });

  it('action effects apply from the jumper seat (skip)', () => {
    const top = card('red', 'skip');
    const twin = card('red', 'skip');
    const state = makeState({
      hands: [[card('blue', 1)], [card('green', 1)], [twin, card('blue', 2)], [card('green', 3)]],
      top,
      settings,
    });
    const { state: next, events } = act(state, 'p2', { type: 'JUMP_IN', cardId: twin.id });
    expect(events).toContainEqual({ type: 'TURN_SKIPPED', playerId: 'p3' });
    expect(currentId(next)).toBe('p0');
  });

  it('jumping in on a pending +2 adds to the stack; the next player after the jumper faces it', () => {
    const top = card('red', 'draw2');
    const twin = card('red', 'draw2');
    const state = makeState({
      hands: [[card('blue', 1)], [card('green', 1)], [card('green', 2)], [twin, card('blue', 2)]],
      top,
      current: 1,
      drawStack: { total: 2, cardIds: [top.id] },
      settings: { ...settings, allowStackingDrawCards: true },
    });
    const next = act(state, 'p3', { type: 'JUMP_IN', cardId: twin.id }).state;
    expect(next.drawStack.total).toBe(4);
    expect(currentId(next)).toBe('p0');
    expect(handOf(next, 1)).toHaveLength(1);
  });

  it('the current player may use JUMP_IN as a regular play', () => {
    const { top, hands } = table();
    const own = card('red', 5);
    hands[0] = [own, card('blue', 2)];
    const state = makeState({ hands, top, settings });
    expect(currentId(act(state, 'p0', { type: 'JUMP_IN', cardId: own.id }).state)).toBe('p1');
  });

  it('is refused during transient phases', () => {
    const { top, twin, hands } = table();
    for (const phase of [
      { type: 'AWAITING_SWAP_TARGET' as const },
      { type: 'AWAITING_PLAY_DRAWN' as const, drawnCardId: 'x' },
      { type: 'AWAITING_CHALLENGE' as const, accusedId: 'p3', previousColor: 'red' as const },
    ]) {
      const state = makeState({ hands, top, settings, phase });
      expect(reject(state, 'p2', { type: 'JUMP_IN', cardId: twin.id })).toBe('WRONG_PHASE');
    }
  });

  it('jumping in with the last card wins the round', () => {
    const { top, hands } = table();
    const last = card('red', 5);
    hands[3] = [last];
    const state = makeState({ hands, top, settings });
    const next = act(state, 'p3', { type: 'JUMP_IN', cardId: last.id }).state;
    expect(next.phase.type).toBe('GAME_OVER');
  });
});
