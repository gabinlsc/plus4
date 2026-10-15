import type { Card, CardColor, CardValue } from '@uno/shared';

export const COLOR_LABEL: Record<CardColor, string> = {
  red: 'rouge',
  yellow: 'jaune',
  green: 'vert',
  blue: 'bleu',
};

export const COLOR_VAR: Record<CardColor, string> = {
  red: 'var(--uno-red)',
  yellow: 'var(--uno-yellow)',
  green: 'var(--uno-green)',
  blue: 'var(--uno-blue)',
};

export const COLOR_HEX: Record<CardColor, string> = {
  red: '#ff4f4f',
  yellow: '#ffc83d',
  green: '#22b573',
  blue: '#3d7bff',
};

const VALUE_LABEL: Record<Exclude<CardValue, number>, string> = {
  skip: 'Passe ton tour',
  reverse: 'Inversion',
  draw2: '+2',
  wild: 'Joker',
  wild_draw4: 'Joker +4',
};

export function valueLabel(value: CardValue): string {
  return typeof value === 'number' ? String(value) : VALUE_LABEL[value];
}

export function cardLabel(card: Card): string {
  return card.kind === 'wild'
    ? valueLabel(card.value)
    : `${valueLabel(card.value)} ${COLOR_LABEL[card.color]}`;
}

/** Stable sort for display: by color, then value. Wilds last. */
export function sortHand(cards: readonly Card[]): Card[] {
  const colorOrder: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3 };
  const valueOrder = (v: CardValue) =>
    typeof v === 'number' ? v : { skip: 10, reverse: 11, draw2: 12, wild: 13, wild_draw4: 14 }[v];
  return [...cards].sort((a, b) => {
    const ca = a.color ? (colorOrder[a.color] ?? 4) : 4;
    const cb = b.color ? (colorOrder[b.color] ?? 4) : 4;
    return ca - cb || valueOrder(a.value) - valueOrder(b.value) || a.id.localeCompare(b.id);
  });
}
