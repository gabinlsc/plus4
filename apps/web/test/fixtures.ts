import {
  DEFAULT_SETTINGS,
  type Card,
  type CardColor,
  type ClientGameView,
  type GameSettings,
  type GameUpdate,
  type PublicPlayerState,
} from '@uno/shared';

export const red5: Card = { id: 'red-5-0', kind: 'colored', color: 'red', value: 5 };
export const red7: Card = { id: 'red-7-0', kind: 'colored', color: 'red', value: 7 };
export const blue2: Card = { id: 'blue-2-0', kind: 'colored', color: 'blue', value: 2 };
export const wild: Card = { id: 'wild-0', kind: 'wild', color: null, value: 'wild' };

export function seat(
  id: string,
  name: string,
  handCount: number,
  extra: Partial<PublicPlayerState> = {},
): PublicPlayerState {
  return {
    id,
    name,
    isBot: false,
    connected: true,
    score: 0,
    uno: { declared: false, vulnerable: false },
    handCount,
    ...extra,
  };
}

export interface ViewOptions {
  hand?: Card[];
  top?: Card;
  activeColor?: CardColor;
  current?: string;
  playable?: string[];
  jumpIn?: string[];
  settings?: Partial<GameSettings>;
  seats?: PublicPlayerState[];
  phase?: ClientGameView['phase'];
  drawStack?: number;
  version?: number;
}

export function makeView(o: ViewOptions = {}): ClientGameView {
  const hand = o.hand ?? [red7, blue2, wild];
  const top = o.top ?? red5;
  return {
    version: o.version ?? 4,
    settings: { ...DEFAULT_SETTINGS, ...o.settings },
    me: {
      id: 'me',
      name: 'Moi',
      isBot: false,
      connected: true,
      hand,
      score: 0,
      uno: { declared: false, vulnerable: false },
    },
    seats: o.seats ?? [seat('me', 'Moi', hand.length), seat('bob', 'Bob', 5)],
    phase: o.phase ?? { type: 'AWAITING_PLAY' },
    currentPlayerId: o.current ?? 'me',
    direction: 1,
    drawPileCount: 60,
    top: { card: top, activeColor: o.activeColor ?? (top.kind === 'colored' ? top.color : 'red') },
    drawStack: { total: o.drawStack ?? 0, cardIds: [] },
    round: 1,
    playableCardIds: o.playable ?? [red7.id, wild.id],
    jumpInCardIds: o.jumpIn ?? [],
  };
}

export function makeUpdate(view: ClientGameView, events: GameUpdate['events'] = []): GameUpdate {
  return { view, events, turnDeadline: null };
}
