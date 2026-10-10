export const CARD_COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type CardColor = (typeof CARD_COLORS)[number];

export const NUMBER_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type NumberValue = (typeof NUMBER_VALUES)[number];

export const ACTION_VALUES = ['skip', 'reverse', 'draw2'] as const;
export type ActionValue = (typeof ACTION_VALUES)[number];

export const WILD_VALUES = ['wild', 'wild_draw4'] as const;
export type WildValue = (typeof WILD_VALUES)[number];

export type CardValue = NumberValue | ActionValue | WildValue;

/** Stable unique id: used as React key and Framer Motion `layoutId`, never reused within a deck. */
export type CardId = string;

export interface ColoredCard {
  readonly id: CardId;
  readonly kind: 'colored';
  readonly color: CardColor;
  readonly value: NumberValue | ActionValue;
}

export interface WildCard {
  readonly id: CardId;
  readonly kind: 'wild';
  readonly color: null;
  readonly value: WildValue;
}

export type Card = ColoredCard | WildCard;

/**
 * Card on top of the discard pile. For a wild, `activeColor` is the declared
 * color. It is `null` only while a wild flipped at round start awaits the
 * first player's color choice (phase `AWAITING_COLOR`).
 */
export interface DiscardTop {
  readonly card: Card;
  readonly activeColor: CardColor | null;
}

export type DrawCardValue = Extract<CardValue, 'draw2' | 'wild_draw4'>;
