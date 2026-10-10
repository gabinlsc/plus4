import {
  ACTION_VALUES,
  CARD_COLORS,
  DECK_COMPOSITION,
  NUMBER_VALUES,
  type Card,
} from '@uno/shared';

/** The 108-card official deck, in a fixed (unshuffled) order with stable ids. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of CARD_COLORS) {
    for (const value of [...NUMBER_VALUES, ...ACTION_VALUES]) {
      const copies =
        value === 0 ? DECK_COMPOSITION.zeroPerColor : DECK_COMPOSITION.otherColoredPerColor;
      for (let copy = 0; copy < copies; copy++) {
        deck.push({ id: `${color}-${value}-${copy}`, kind: 'colored', color, value });
      }
    }
  }
  for (let i = 0; i < DECK_COMPOSITION.wildCount; i++) {
    deck.push({ id: `wild-${i}`, kind: 'wild', color: null, value: 'wild' });
  }
  for (let i = 0; i < DECK_COMPOSITION.wildDraw4Count; i++) {
    deck.push({ id: `wild_draw4-${i}`, kind: 'wild', color: null, value: 'wild_draw4' });
  }
  return deck;
}
