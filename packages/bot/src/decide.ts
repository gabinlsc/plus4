import {
  CARD_COLORS,
  cardPoints,
  type BotDifficulty,
  type Card,
  type CardColor,
  type ClientGameView,
  type GameIntent,
  type PublicPlayerState,
} from '@uno/shared';
import { PERSONALITIES } from './personality';

export type Random = () => number;

/**
 * Decides the bot's action when it is its turn. Uses only the bot's own
 * `ClientGameView`, exactly like a human client: bots never see hidden cards.
 */
export function decideTurn(
  view: ClientGameView,
  difficulty: BotDifficulty,
  random: Random,
): GameIntent | null {
  if (view.currentPlayerId !== view.me.id) return null;
  const persona = PERSONALITIES[difficulty];
  const expectedVersion = view.version;
  const hand = view.me.hand;

  switch (view.phase.type) {
    case 'AWAITING_COLOR':
      return { type: 'CHOOSE_COLOR', color: dominantColor(hand), expectedVersion };
    case 'AWAITING_SWAP_TARGET': {
      const target = weakestOpponent(view);
      return target ? { type: 'CHOOSE_SWAP_TARGET', targetId: target.id, expectedVersion } : null;
    }
    case 'AWAITING_CHALLENGE': {
      const play = choosePlay(view, difficulty, random);
      if (play) return play;
      return {
        type: 'RESOLVE_CHALLENGE',
        challenge: random() < persona.challengeDraw4,
        expectedVersion,
      };
    }
    case 'AWAITING_PLAY':
    case 'AWAITING_PLAY_DRAWN': {
      const play = choosePlay(view, difficulty, random);
      if (!play) {
        return view.phase.type === 'AWAITING_PLAY_DRAWN'
          ? { type: 'PASS', expectedVersion }
          : { type: 'DRAW', expectedVersion };
      }
      // The engine accepts an early call only with exactly two cards in hand;
      // after a multiple play down to one card the bot calls late instead.
      const preCall = hand.length === 2 && play.cardIds.length === 1;
      if (preCall && !view.me.uno.declared && random() < persona.callUno) {
        return { type: 'CALL_UNO' };
      }
      return play;
    }
    default:
      return null;
  }
}

/**
 * Reactions available at any time: late Uno call, catching a forgetful
 * opponent, jumping in. Returns null when the bot lets the moment pass.
 */
export function decideOutOfTurn(
  view: ClientGameView,
  difficulty: BotDifficulty,
  random: Random,
): GameIntent | null {
  const persona = PERSONALITIES[difficulty];
  const running = !['ROUND_OVER', 'GAME_OVER'].includes(view.phase.type);
  if (!running) return null;

  if (view.me.hand.length === 1 && !view.me.uno.declared && random() < persona.lateCallUno) {
    return { type: 'CALL_UNO' };
  }
  const forgetful = view.seats.find((s) => s.id !== view.me.id && s.uno.vulnerable);
  if (forgetful && view.settings.unoPenalty.enabled && random() < persona.catchUno) {
    return { type: 'CATCH_UNO', targetId: forgetful.id };
  }
  const jumpCard = view.jumpInCardIds[0];
  if (jumpCard && view.currentPlayerId !== view.me.id && random() < persona.jumpIn) {
    return { type: 'JUMP_IN', cardId: jumpCard, expectedVersion: view.version };
  }
  return null;
}

// ── Card selection ───────────────────────────────────────────────────────

function choosePlay(
  view: ClientGameView,
  difficulty: BotDifficulty,
  random: Random,
): Extract<GameIntent, { type: 'PLAY_CARD' }> | null {
  const persona = PERSONALITIES[difficulty];
  const hand = view.me.hand;
  const playable = hand.filter((c) => view.playableCardIds.includes(c.id));
  if (playable.length === 0) return null;

  const chosen = persona.strategic
    ? bestCard(view, playable)
    : (playable[Math.floor(random() * playable.length)] as Card);

  const cards = [chosen];
  const canMultiPlay =
    persona.multiplePlay &&
    view.settings.allowMultiplePlay &&
    view.phase.type === 'AWAITING_PLAY' &&
    chosen.kind === 'colored';
  if (canMultiPlay) {
    cards.push(
      ...hand.filter((c) => c.id !== chosen.id && c.kind === 'colored' && c.value === chosen.value),
    );
  }

  const last = cards[cards.length - 1] as Card;
  const played = new Set(cards.map((c) => c.id));
  const intent: Extract<GameIntent, { type: 'PLAY_CARD' }> = {
    type: 'PLAY_CARD',
    cardIds: cards.map((c) => c.id),
    expectedVersion: view.version,
  };
  return last.kind === 'wild'
    ? { ...intent, chosenColor: dominantColor(hand.filter((c) => !played.has(c.id))) }
    : intent;
}

/** Heuristic scoring: attack a threatening next player, save wilds, keep color options. */
function bestCard(view: ClientGameView, playable: readonly Card[]): Card {
  const next = nextOpponent(view);
  const threatened = next !== undefined && next.handCount <= 2;
  const hand = view.me.hand;
  const twoPlayers = view.seats.length === 2;

  const score = (c: Card): number => {
    let s = 0;
    if (c.kind === 'wild') {
      s -= c.value === 'wild_draw4' ? 60 : 50;
    } else {
      s +=
        2 * hand.filter((h) => h.id !== c.id && h.kind === 'colored' && h.color === c.color).length;
    }
    const attacking =
      c.value === 'skip' ||
      c.value === 'draw2' ||
      c.value === 'wild_draw4' ||
      (c.value === 'reverse' && twoPlayers);
    if (attacking) s += threatened ? 100 : -3;
    if (typeof c.value === 'number') s += cardPoints(c.value) / 10;
    return s;
  };

  return playable.reduce((best, c) => (score(c) > score(best) ? c : best));
}

export function dominantColor(cards: readonly Card[]): CardColor {
  let best: CardColor = CARD_COLORS[0];
  let bestCount = -1;
  for (const color of CARD_COLORS) {
    const n = cards.filter((c) => c.kind === 'colored' && c.color === color).length;
    if (n > bestCount) {
      best = color;
      bestCount = n;
    }
  }
  return best;
}

function nextOpponent(view: ClientGameView): PublicPlayerState | undefined {
  const n = view.seats.length;
  const mine = view.seats.findIndex((s) => s.id === view.me.id);
  return view.seats[(((mine + view.direction) % n) + n) % n];
}

function weakestOpponent(view: ClientGameView): PublicPlayerState | undefined {
  return view.seats
    .filter((s) => s.id !== view.me.id)
    .reduce<PublicPlayerState | undefined>(
      (best, s) => (best === undefined || s.handCount < best.handCount ? s : best),
      undefined,
    );
}
