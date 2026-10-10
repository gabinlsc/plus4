import { describe, expect, it } from 'vitest';
import { cardPoints } from '../src';

describe('cardPoints', () => {
  it('follows official scoring', () => {
    expect(cardPoints(0)).toBe(0);
    expect(cardPoints(9)).toBe(9);
    expect(cardPoints('skip')).toBe(20);
    expect(cardPoints('reverse')).toBe(20);
    expect(cardPoints('draw2')).toBe(20);
    expect(cardPoints('wild')).toBe(50);
    expect(cardPoints('wild_draw4')).toBe(50);
  });
});
