import {
  resolveSettings,
  type Card,
  type CardColor,
  type ClientGameView,
  type GamePhase,
  type GameSettings,
  type PublicPlayerState,
} from '@uno/shared';

let seq = 0;
export const card = (color: CardColor, value: Card['value']): Card =>
  typeof value === 'string' && (value === 'wild' || value === 'wild_draw4')
    ? { id: `b-${value}-${seq++}`, kind: 'wild', color: null, value }
    : ({ id: `b-${color}-${String(value)}-${seq++}`, kind: 'colored', color, value } as Card);
export const wild = (value: 'wild' | 'wild_draw4' = 'wild'): Card => card('red', value);

export interface ViewOptions {
  hand: Card[];
  top: Card;
  activeColor?: CardColor;
  /** Hand sizes of the other seats, in seat order after me. */
  opponents?: number[];
  current?: 'me' | number;
  phase?: GamePhase;
  drawStack?: number;
  settings?: Partial<GameSettings>;
  playable?: Card[];
  jumpIn?: Card[];
  vulnerable?: number[];
  direction?: 1 | -1;
}

/** Builds the bot's own view; the bot is always seat 0 ("me"). */
export function view(o: ViewOptions): ClientGameView {
  const opponents = o.opponents ?? [5, 5];
  const seats: PublicPlayerState[] = [
    {
      id: 'me',
      name: 'Bot',
      isBot: true,
      connected: true,
      score: 0,
      uno: { declared: false, vulnerable: false },
      handCount: o.hand.length,
    },
    ...opponents.map((count, i) => ({
      id: `o${i + 1}`,
      name: `O${i + 1}`,
      isBot: false,
      connected: true,
      score: 0,
      uno: { declared: false, vulnerable: o.vulnerable?.includes(i + 1) ?? false },
      handCount: count,
    })),
  ];
  const current = o.current === undefined || o.current === 'me' ? 'me' : `o${o.current}`;
  return {
    version: 3,
    settings: resolveSettings(o.settings ?? {}),
    me: {
      id: 'me',
      name: 'Bot',
      isBot: true,
      connected: true,
      hand: o.hand,
      score: 0,
      uno: { declared: false, vulnerable: false },
    },
    seats,
    phase: o.phase ?? { type: 'AWAITING_PLAY' },
    currentPlayerId: current,
    direction: o.direction ?? 1,
    drawPileCount: 40,
    top: {
      card: o.top,
      activeColor: o.activeColor ?? (o.top.kind === 'colored' ? o.top.color : 'red'),
    },
    drawStack: { total: o.drawStack ?? 0, cardIds: [] },
    round: 1,
    playableCardIds: (current === 'me' ? (o.playable ?? []) : []).map((c) => c.id),
    jumpInCardIds: (o.jumpIn ?? []).map((c) => c.id),
  };
}

/** Deterministic "random" source. */
export const always = (value: number) => () => value;
