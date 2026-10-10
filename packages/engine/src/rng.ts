import type { Card } from '@uno/shared';

/**
 * Mulberry32: tiny, fast, good-enough PRNG. The state is a plain 32-bit
 * integer stored in the game state, so every shuffle is reproducible.
 */
export function nextRandom(state: number): [value: number, nextState: number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Integer in [0, maxExclusive). */
export function randomInt(state: number, maxExclusive: number): [value: number, nextState: number] {
  const [value, next] = nextRandom(state);
  return [Math.floor(value * maxExclusive), next];
}

/** Fisher-Yates shuffle. Returns a new array; the input is left untouched. */
export function shuffle(cards: readonly Card[], state: number): [cards: Card[], nextState: number] {
  const result = [...cards];
  let rng = state;
  for (let i = result.length - 1; i > 0; i--) {
    const [j, next] = randomInt(rng, i + 1);
    rng = next;
    const tmp = result[i] as Card;
    result[i] = result[j] as Card;
    result[j] = tmp;
  }
  return [result, rng];
}
