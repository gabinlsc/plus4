import {
  resolveSettings,
  type ActionValue,
  type Card,
  type CardColor,
  type ColoredCard,
  type Direction,
  type DrawStack,
  type GameIntent,
  type GamePhase,
  type GameSettings,
  type NumberValue,
  type PlayerId,
  type RuleViolation,
  type ServerGameState,
  type WildCard,
  type WildValue,
} from '@uno/shared';
import { applyIntent, type EngineSuccess } from '../src';

let seq = 0;

export function card(color: CardColor, value: NumberValue | ActionValue): ColoredCard {
  return { id: `t-${color}-${value}-${seq++}`, kind: 'colored', color, value };
}

export function wild(value: WildValue = 'wild'): WildCard {
  return { id: `t-${value}-${seq++}`, kind: 'wild', color: null, value };
}

export const wd4 = (): WildCard => wild('wild_draw4');

/** Cards that never match the red/blue/green tops used in tests. */
export function filler(count: number): Card[] {
  return Array.from({ length: count }, () => card('yellow', 9));
}

export interface MakeStateOptions {
  hands: Card[][];
  top: Card;
  activeColor?: CardColor;
  settings?: Partial<GameSettings>;
  current?: number;
  direction?: Direction;
  /** In draw order: first element is drawn first. */
  drawPile?: Card[];
  /** Cards under the top card, bottom first. */
  discardBelow?: Card[];
  phase?: GamePhase;
  drawStack?: DrawStack;
  scores?: number[];
}

export function makeState(o: MakeStateOptions): ServerGameState {
  const settings = resolveSettings(o.settings ?? {});
  return {
    version: 0,
    settings,
    players: o.hands.map((hand, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      isBot: false,
      connected: true,
      hand,
      score: o.scores?.[i] ?? 0,
      uno: { declared: false, vulnerable: false },
    })),
    phase: o.phase ?? { type: 'AWAITING_PLAY' },
    currentPlayerIndex: o.current ?? 0,
    direction: o.direction ?? 1,
    drawPile: [...(o.drawPile ?? filler(20))].reverse(),
    discardPile: [...(o.discardBelow ?? []), o.top],
    top: {
      card: o.top,
      activeColor: o.activeColor ?? (o.top.kind === 'colored' ? o.top.color : 'red'),
    },
    drawStack: o.drawStack ?? { total: 0, cardIds: [] },
    round: 1,
    dealerIndex: 0,
    rngState: 42,
  };
}

type WithoutVersion<I> = I extends { expectedVersion: number } ? Omit<I, 'expectedVersion'> : I;
export type LooseIntent = WithoutVersion<GameIntent>;

function withVersion(state: ServerGameState, intent: LooseIntent): GameIntent {
  return (
    'type' in intent && intent.type !== 'CALL_UNO' && intent.type !== 'CATCH_UNO'
      ? { ...intent, expectedVersion: state.version }
      : intent
  ) as GameIntent;
}

/** Applies an intent that must succeed. */
export function act(
  state: ServerGameState,
  playerId: PlayerId,
  intent: LooseIntent,
): EngineSuccess {
  const result = applyIntent(state, playerId, withVersion(state, intent));
  if (!result.ok)
    throw new Error(`Intent ${intent.type} by ${playerId} rejected: ${result.reason}`);
  return result;
}

/** Applies an intent that must fail, returns the violation. */
export function reject(
  state: ServerGameState,
  playerId: PlayerId,
  intent: LooseIntent,
): RuleViolation {
  const result = applyIntent(state, playerId, withVersion(state, intent));
  if (result.ok) throw new Error(`Intent ${intent.type} by ${playerId} unexpectedly accepted`);
  return result.reason;
}

export const handOf = (state: ServerGameState, index: number): readonly Card[] =>
  state.players[index]?.hand ?? [];

export const currentId = (state: ServerGameState): PlayerId | undefined =>
  state.players[state.currentPlayerIndex]?.id;

export const ids = (cards: readonly Card[]): string[] => cards.map((c) => c.id);

export function countAllCards(state: ServerGameState): number {
  return (
    state.drawPile.length +
    state.discardPile.length +
    state.players.reduce((n, p) => n + p.hand.length, 0)
  );
}
