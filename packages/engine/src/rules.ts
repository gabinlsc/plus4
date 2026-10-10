import {
  DRAW_PENALTY,
  type Card,
  type CardColor,
  type DiscardTop,
  type DrawCardValue,
  type GamePhase,
  type GameSettings,
} from '@uno/shared';

export function isDrawCard(card: Card): card is Card & { value: DrawCardValue } {
  return card.value === 'draw2' || card.value === 'wild_draw4';
}

export function penaltyOf(card: Card): number {
  return isDrawCard(card) ? DRAW_PENALTY[card.value] : 0;
}

/** Regular matching rule: same color, same value, or a wild. */
export function matchesTop(card: Card, top: DiscardTop): boolean {
  if (card.kind === 'wild') return true;
  if (card.color === top.activeColor) return true;
  return top.card.kind === 'colored' && top.card.value === card.value;
}

/** Can `card` be stacked on a pending draw penalty whose last card is `top`? */
export function canStack(card: Card, top: DiscardTop, settings: Readonly<GameSettings>): boolean {
  if (!settings.allowStackingDrawCards || !isDrawCard(card)) return false;
  if (card.value === 'wild_draw4') return true;
  if (top.card.value === 'draw2') return true;
  return !settings.stackingRequiresColorMatch || card.color === top.activeColor;
}

/** Strict identity used by jump-in: same color AND same value, never a wild. */
export function isIdenticalToTop(card: Card, top: DiscardTop): boolean {
  return (
    card.kind === 'colored' &&
    top.card.kind === 'colored' &&
    card.color === top.card.color &&
    card.value === top.card.value
  );
}

export interface PlayContext {
  readonly settings: Readonly<GameSettings>;
  readonly phase: GamePhase;
  readonly top: DiscardTop;
  readonly drawStack: { readonly total: number };
}

/** Whether the current player may lead with `card` in this context (ignores turn ownership). */
export function isCardPlayable(ctx: PlayContext, card: Card): boolean {
  switch (ctx.phase.type) {
    case 'AWAITING_PLAY':
      return ctx.drawStack.total > 0
        ? canStack(card, ctx.top, ctx.settings)
        : matchesTop(card, ctx.top);
    case 'AWAITING_PLAY_DRAWN':
      return card.id === ctx.phase.drawnCardId && matchesTop(card, ctx.top);
    case 'AWAITING_CHALLENGE':
      return canStack(card, ctx.top, ctx.settings);
    default:
      return false;
  }
}

export function hasColor(hand: readonly Card[], color: CardColor): boolean {
  return hand.some((c) => c.kind === 'colored' && c.color === color);
}
