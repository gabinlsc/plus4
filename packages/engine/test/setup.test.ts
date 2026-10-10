import { describe, expect, it } from 'vitest';
import type { Card } from '@uno/shared';
import { createGame } from '../src';
import { act, card, countAllCards, currentId, filler, handOf, reject, wd4, wild } from './helpers';

const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: false }));

/** Deck in draw order: dealt hands first, then the given flip sequence, then filler. */
function stackedDeck(nPlayers: number, handSize: number, flips: Card[]): Card[] {
  return [...filler(nPlayers * handSize), ...flips, ...filler(30)];
}

describe('createGame', () => {
  it('deals the configured hand size to every player and flips one card', () => {
    const { state, events } = createGame({ players: players(4), seed: 1 });
    expect(state.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(state.discardPile).toHaveLength(1);
    expect(countAllCards(state)).toBe(108);
    expect(state.top.card.value).not.toBe('wild_draw4');
    expect(state.version).toBe(0);
    expect(state.round).toBe(1);
    expect(state.dealerIndex).toBe(0);
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['ROUND_STARTED', 'CARDS_DEALT', 'FIRST_CARD_FLIPPED']),
    );
  });

  it('is fully deterministic for a given seed', () => {
    const a = createGame({ players: players(3), seed: 42 }).state;
    const b = createGame({ players: players(3), seed: 42 }).state;
    const c = createGame({ players: players(3), seed: 43 }).state;
    expect(a).toEqual(b);
    expect(a.players[0]?.hand).not.toEqual(c.players[0]?.hand);
  });

  it('respects initialHandSize from settings', () => {
    const { state } = createGame({
      players: players(2),
      seed: 1,
      settings: { initialHandSize: 5 },
    });
    expect(state.players.every((p) => p.hand.length === 5)).toBe(true);
  });

  it('rejects invalid player counts and duplicate ids', () => {
    expect(() => createGame({ players: players(1), seed: 1 })).toThrow();
    expect(() => createGame({ players: players(11), seed: 1 })).toThrow();
    expect(() =>
      createGame({
        players: [
          { id: 'a', name: 'A' },
          { id: 'a', name: 'B' },
        ],
        seed: 1,
      }),
    ).toThrow();
  });

  it('starts with the player left of the dealer on a number card', () => {
    const { state } = createGame({
      players: players(3),
      seed: 1,
      deck: stackedDeck(3, 7, [card('red', 5)]),
    });
    expect(state.top.card.value).toBe(5);
    expect(state.top.activeColor).toBe('red');
    expect(currentId(state)).toBe('p1');
    expect(state.phase).toEqual({ type: 'AWAITING_PLAY' });
  });

  it('first card skip: the first player is skipped', () => {
    const { state } = createGame({
      players: players(3),
      seed: 1,
      deck: stackedDeck(3, 7, [card('red', 'skip')]),
    });
    expect(currentId(state)).toBe('p2');
  });

  it('first card reverse: direction flips and the dealer plays first', () => {
    const { state } = createGame({
      players: players(3),
      seed: 1,
      deck: stackedDeck(3, 7, [card('red', 'reverse')]),
    });
    expect(state.direction).toBe(-1);
    expect(currentId(state)).toBe('p0');
  });

  it('first card +2 (classic): the first player draws 2 and is skipped', () => {
    const { state } = createGame({
      players: players(3),
      seed: 1,
      deck: stackedDeck(3, 7, [card('red', 'draw2')]),
    });
    expect(handOf(state, 1)).toHaveLength(9);
    expect(currentId(state)).toBe('p2');
  });

  it('first card +2 (stacking): the first player may stack on it', () => {
    const { state } = createGame({
      players: players(3),
      seed: 1,
      settings: { allowStackingDrawCards: true },
      deck: stackedDeck(3, 7, [card('red', 'draw2')]),
    });
    expect(state.drawStack.total).toBe(2);
    expect(currentId(state)).toBe('p1');
    expect(handOf(state, 1)).toHaveLength(7);
  });

  it('first card wild: the first player declares the color, then plays', () => {
    const { state } = createGame({
      players: players(3),
      seed: 1,
      deck: stackedDeck(3, 7, [wild()]),
    });
    expect(state.phase.type).toBe('AWAITING_COLOR');
    expect(state.top.activeColor).toBeNull();
    expect(currentId(state)).toBe('p1');
    expect(reject(state, 'p0', { type: 'CHOOSE_COLOR', color: 'green' })).toBe('NOT_YOUR_TURN');
    expect(reject(state, 'p1', { type: 'DRAW' })).toBe('WRONG_PHASE');

    const next = act(state, 'p1', { type: 'CHOOSE_COLOR', color: 'green' }).state;
    expect(next.top.activeColor).toBe('green');
    expect(next.phase).toEqual({ type: 'AWAITING_PLAY' });
    expect(currentId(next)).toBe('p1');
  });

  it('first card wild +4 is returned to the pile and another card is flipped', () => {
    const plus4 = wd4();
    const { state } = createGame({
      players: players(3),
      seed: 1,
      deck: stackedDeck(3, 7, [plus4, card('blue', 3)]),
    });
    expect(state.top.card.value).toBe(3);
    expect(state.drawPile.some((c) => c.id === plus4.id)).toBe(true);
    expect(state.drawPile.at(-1)?.id).not.toBe(plus4.id);
  });
});
