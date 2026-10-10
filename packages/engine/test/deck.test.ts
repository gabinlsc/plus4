import { describe, expect, it } from 'vitest';
import { DECK_COMPOSITION } from '@uno/shared';
import { createDeck, nextRandom, randomInt, shuffle } from '../src';

describe('createDeck', () => {
  const deck = createDeck();

  it('contains the 108 official cards with unique ids', () => {
    expect(deck).toHaveLength(DECK_COMPOSITION.total);
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
  });

  it('has one 0 and two of each other colored value per color', () => {
    for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
      const ofColor = deck.filter((c) => c.color === color);
      expect(ofColor).toHaveLength(25);
      expect(ofColor.filter((c) => c.value === 0)).toHaveLength(1);
      expect(ofColor.filter((c) => c.value === 7)).toHaveLength(2);
      expect(ofColor.filter((c) => c.value === 'draw2')).toHaveLength(2);
    }
  });

  it('has four wilds and four wild +4', () => {
    expect(deck.filter((c) => c.value === 'wild')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'wild_draw4')).toHaveLength(4);
    expect(deck.filter((c) => c.kind === 'wild').every((c) => c.color === null)).toBe(true);
  });
});

describe('seeded randomness', () => {
  it('is deterministic for a given state', () => {
    expect(nextRandom(123)).toEqual(nextRandom(123));
    expect(nextRandom(123)[0]).not.toBe(nextRandom(124)[0]);
  });

  it('produces values in [0, 1)', () => {
    let state = 1;
    for (let i = 0; i < 1000; i++) {
      const [value, next] = nextRandom(state);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      state = next;
    }
  });

  it('randomInt stays within bounds', () => {
    let state = 7;
    for (let i = 0; i < 500; i++) {
      const [value, next] = randomInt(state, 5);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
      state = next;
    }
  });

  it('shuffle is a deterministic permutation that does not mutate its input', () => {
    const deck = createDeck();
    const snapshot = deck.map((c) => c.id);
    const [a] = shuffle(deck, 99);
    const [b] = shuffle(deck, 99);
    const [c] = shuffle(deck, 100);
    expect(deck.map((x) => x.id)).toEqual(snapshot);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.map((x) => x.id)).not.toEqual(c.map((x) => x.id));
    expect([...a.map((x) => x.id)].sort()).toEqual([...snapshot].sort());
  });
});
