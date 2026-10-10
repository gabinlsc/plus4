import { describe, expect, it } from 'vitest';
import { getJumpInCardIds, getPlayableCardIds, projectForPlayer } from '../src';
import { card, makeState, wild } from './helpers';

function setup() {
  const r7 = card('red', 7);
  const b1 = card('blue', 1);
  const w = wild();
  const twin = card('red', 5);
  const secret = card('green', 2);
  const state = makeState({
    hands: [
      [r7, b1, w],
      [secret, card('green', 3)],
      [twin, card('yellow', 4)],
    ],
    top: card('red', 5),
    settings: { allowJumpIn: true },
  });
  return { r7, b1, w, twin, secret, state };
}

describe('projectForPlayer', () => {
  it('exposes my hand and only card counts for everyone', () => {
    const { state, r7 } = setup();
    const view = projectForPlayer(state, 'p0');
    expect(view.me.id).toBe('p0');
    expect(view.me.hand.map((c) => c.id)).toContain(r7.id);
    expect(view.seats.map((s) => [s.id, s.handCount])).toEqual([
      ['p0', 3],
      ['p1', 2],
      ['p2', 2],
    ]);
    expect(view.currentPlayerId).toBe('p0');
    expect(view.drawPileCount).toBe(state.drawPile.length);
    expect(view.version).toBe(state.version);
  });

  it('never leaks other hands or the draw pile', () => {
    const { state, secret } = setup();
    const serialized = JSON.stringify(projectForPlayer(state, 'p0'));
    expect(serialized).not.toContain(secret.id);
    for (const c of state.drawPile) expect(serialized).not.toContain(c.id);
    expect(serialized).not.toContain('rngState');
    expect(serialized).not.toContain('"hand":[{');
  });

  it('lists playable cards for the current player only', () => {
    const { state, r7, w } = setup();
    expect(new Set(projectForPlayer(state, 'p0').playableCardIds)).toEqual(new Set([r7.id, w.id]));
    expect(projectForPlayer(state, 'p1').playableCardIds).toEqual([]);
    expect(new Set(getPlayableCardIds(state, 'p0'))).toEqual(new Set([r7.id, w.id]));
  });

  it('lists jump-in candidates for any player', () => {
    const { state, twin } = setup();
    expect(projectForPlayer(state, 'p2').jumpInCardIds).toEqual([twin.id]);
    expect(getJumpInCardIds(state, 'p1')).toEqual([]);
  });

  it('throws for an unknown player', () => {
    const { state } = setup();
    expect(() => projectForPlayer(state, 'nobody')).toThrow();
  });
});
