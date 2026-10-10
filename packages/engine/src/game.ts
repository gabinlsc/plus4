import {
  CARD_COLORS,
  CHALLENGE_PENALTY,
  DRAW_PENALTY,
  cardPoints,
  resolveSettings,
  type Card,
  type CardColor,
  type GameEvent,
  type GameIntent,
  type GameSettings,
  type PlayerId,
  type RuleViolation,
  type ServerGameState,
} from '@uno/shared';
import { createDeck } from './deck';
import {
  advanceTurn,
  commit,
  drawCards,
  player,
  resetDrawStack,
  resetUno,
  seatFrom,
  takeFromPile,
  toDraft,
  type Draft,
} from './draft';
import { randomInt, shuffle } from './rng';
import { hasColor, isCardPlayable, isIdenticalToTop, matchesTop, penaltyOf } from './rules';

export interface EngineSuccess {
  readonly ok: true;
  readonly state: ServerGameState;
  readonly events: readonly GameEvent[];
}
export type EngineResult = EngineSuccess | { readonly ok: false; readonly reason: RuleViolation };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

export interface PlayerSeed {
  readonly id: PlayerId;
  readonly name: string;
  readonly isBot?: boolean;
}

export interface CreateGameOptions {
  readonly players: readonly PlayerSeed[];
  readonly seed: number;
  /** Untrusted partial settings, validated and merged over the defaults. */
  readonly settings?: Partial<GameSettings>;
  /** Testing hook: a prearranged deck in draw order (first element drawn first). */
  readonly deck?: readonly Card[];
}

type Violation = RuleViolation | undefined;

// ── Game lifecycle ───────────────────────────────────────────────────────

export function createGame(options: CreateGameOptions): EngineSuccess {
  const { players } = options;
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new RangeError(`A game needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error('Player ids must be unique');
  }
  const settings = resolveSettings(options.settings ?? {});
  const placeholder = createDeck()[0] as Card;
  const d: Draft = {
    version: 0,
    settings,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot ?? false,
      connected: true,
      hand: [],
      score: 0,
      uno: { declared: false, vulnerable: false },
    })),
    phase: { type: 'AWAITING_PLAY' },
    currentPlayerIndex: 0,
    direction: 1,
    drawPile: [],
    discardPile: [],
    top: { card: placeholder, activeColor: null },
    drawStack: { total: 0, cardIds: [] },
    round: 1,
    dealerIndex: 0,
    rngState: options.seed | 0,
    events: [],
  };
  dealRound(d, options.deck);
  return { ok: true, state: commit(d), events: d.events };
}

export function startNextRound(state: ServerGameState, deck?: readonly Card[]): EngineResult {
  if (state.phase.type !== 'ROUND_OVER') return { ok: false, reason: 'WRONG_PHASE' };
  const d = toDraft(state);
  d.round += 1;
  d.dealerIndex = (d.dealerIndex + 1) % d.players.length;
  d.version += 1;
  dealRound(d, deck);
  return { ok: true, state: commit(d), events: d.events };
}

function dealRound(d: Draft, deck?: readonly Card[]): void {
  if (deck) {
    d.drawPile = [...deck].reverse();
  } else {
    const [shuffled, rng] = shuffle(createDeck(), d.rngState);
    d.drawPile = shuffled;
    d.rngState = rng;
  }
  d.discardPile = [];
  d.direction = 1;
  d.drawStack = { total: 0, cardIds: [] };
  for (const p of d.players) {
    p.hand = [];
    resetUno(p);
  }
  const dealer = player(d, d.dealerIndex);
  d.events.push({ type: 'ROUND_STARTED', round: d.round, dealerId: dealer.id });

  for (let round = 0; round < d.settings.initialHandSize; round++) {
    for (let offset = 1; offset <= d.players.length; offset++) {
      const c = d.drawPile.pop();
      if (c) player(d, seatFrom(d, d.dealerIndex, offset)).hand.push(c);
    }
  }
  d.events.push({
    type: 'CARDS_DEALT',
    perPlayer: Object.fromEntries(d.players.map((p) => [p.id, p.hand.length])),
  });

  // A wild +4 can never start a round: slip it back under the top and flip again.
  let first = d.drawPile.pop();
  while (first?.value === 'wild_draw4' && d.drawPile.length > 0) {
    const [index, rng] = randomInt(d.rngState, d.drawPile.length);
    d.rngState = rng;
    d.drawPile.splice(index, 0, first);
    first = d.drawPile.pop();
  }
  if (!first) throw new Error('Deck exhausted while dealing');
  d.discardPile = [first];
  d.events.push({ type: 'FIRST_CARD_FLIPPED', card: first });

  const firstPlayer = seatFrom(d, d.dealerIndex, 1);
  d.currentPlayerIndex = firstPlayer;
  d.phase = { type: 'AWAITING_PLAY' };

  if (first.kind === 'wild') {
    d.top = { card: first, activeColor: null };
    d.phase = { type: 'AWAITING_COLOR', cardId: first.id };
  } else {
    d.top = { card: first, activeColor: first.color };
    switch (first.value) {
      case 'skip':
        d.events.push({ type: 'TURN_SKIPPED', playerId: player(d, firstPlayer).id });
        d.currentPlayerIndex = seatFrom(d, d.dealerIndex, 2);
        break;
      case 'reverse':
        if (d.players.length === 2) {
          d.events.push({ type: 'TURN_SKIPPED', playerId: player(d, firstPlayer).id });
        } else {
          d.direction = -1;
          d.events.push({ type: 'DIRECTION_CHANGED', direction: -1 });
        }
        d.currentPlayerIndex = d.dealerIndex;
        break;
      case 'draw2':
        if (d.settings.allowStackingDrawCards) {
          d.drawStack = { total: DRAW_PENALTY.draw2, cardIds: [first.id] };
          d.events.push({ type: 'PENALTY_STACKED', total: DRAW_PENALTY.draw2 });
        } else {
          drawCards(d, firstPlayer, DRAW_PENALTY.draw2, 'penalty');
          d.events.push({ type: 'TURN_SKIPPED', playerId: player(d, firstPlayer).id });
          d.currentPlayerIndex = seatFrom(d, d.dealerIndex, 2);
        }
        break;
      default:
        break;
    }
  }
  d.events.push({ type: 'TURN_CHANGED', playerId: player(d, d.currentPlayerIndex).id });
}

// ── Intent dispatch ──────────────────────────────────────────────────────

const OUT_OF_TURN_SAFE = new Set<GameIntent['type']>(['CALL_UNO', 'CATCH_UNO']);

export function applyIntent(
  state: ServerGameState,
  playerId: PlayerId,
  intent: GameIntent,
): EngineResult {
  const actor = state.players.findIndex((p) => p.id === playerId);
  if (actor === -1) return { ok: false, reason: 'UNKNOWN_PLAYER' };
  if (state.phase.type === 'ROUND_OVER' || state.phase.type === 'GAME_OVER') {
    return { ok: false, reason: 'GAME_NOT_RUNNING' };
  }
  if ('expectedVersion' in intent && intent.expectedVersion !== state.version) {
    return { ok: false, reason: 'STALE_STATE' };
  }

  const d = toDraft(state);
  if (!OUT_OF_TURN_SAFE.has(intent.type)) closeUnoWindows(d, actor);

  const violation = dispatch(d, actor, intent);
  if (violation) return { ok: false, reason: violation };
  d.version += 1;
  return { ok: true, state: commit(d), events: d.events };
}

function dispatch(d: Draft, actor: number, intent: GameIntent): Violation {
  switch (intent.type) {
    case 'PLAY_CARD':
      return playCard(d, actor, intent.cardIds, intent.chosenColor);
    case 'JUMP_IN':
      return jumpIn(d, actor, intent.cardId);
    case 'DRAW':
      return draw(d, actor, 'voluntary');
    case 'PASS':
      return pass(d, actor);
    case 'CHOOSE_COLOR':
      return chooseColor(d, actor, intent.color);
    case 'CHOOSE_SWAP_TARGET':
      return chooseSwapTarget(d, actor, intent.targetId);
    case 'RESOLVE_CHALLENGE':
      return resolveChallenge(d, actor, intent.challenge);
    case 'CALL_UNO':
      return callUno(d, actor);
    case 'CATCH_UNO':
      return catchUno(d, actor, intent.targetId);
  }
}

/** Once someone else acts, a player who forgot to call Uno can no longer be caught. */
function closeUnoWindows(d: Draft, actor: number): void {
  d.players.forEach((p, i) => {
    if (i !== actor) p.uno.vulnerable = false;
  });
}

function requireTurn(d: Draft, actor: number): Violation {
  return actor === d.currentPlayerIndex ? undefined : 'NOT_YOUR_TURN';
}

// ── Playing cards ────────────────────────────────────────────────────────

function playCard(
  d: Draft,
  actor: number,
  cardIds: readonly string[],
  chosenColor: CardColor | undefined,
): Violation {
  const { phase } = d;
  if (
    phase.type !== 'AWAITING_PLAY' &&
    phase.type !== 'AWAITING_PLAY_DRAWN' &&
    phase.type !== 'AWAITING_CHALLENGE'
  ) {
    return 'WRONG_PHASE';
  }
  const notYourTurn = requireTurn(d, actor);
  if (notYourTurn) return notYourTurn;

  if (cardIds.length > 1 && !d.settings.allowMultiplePlay) return 'MULTIPLE_PLAY_DISABLED';
  if (new Set(cardIds).size !== cardIds.length) return 'MULTIPLE_PLAY_MISMATCH';

  const hand = player(d, actor).hand;
  const cards: Card[] = [];
  for (const id of cardIds) {
    const c = hand.find((h) => h.id === id);
    if (!c) return 'CARD_NOT_IN_HAND';
    cards.push(c);
  }
  const [first] = cards;
  const last = cards[cards.length - 1];
  if (!first || !last) return 'CARD_NOT_IN_HAND';
  if (cards.some((c) => c.value !== first.value)) return 'MULTIPLE_PLAY_MISMATCH';

  if (phase.type === 'AWAITING_PLAY_DRAWN') {
    if (cards.length !== 1 || first.id !== phase.drawnCardId) return 'ILLEGAL_CARD';
  }
  const penaltyPending = phase.type === 'AWAITING_CHALLENGE' || d.drawStack.total > 0;
  if (!isCardPlayable(d, first)) return penaltyPending ? 'MUST_STACK_OR_DRAW' : 'ILLEGAL_CARD';
  if (last.kind === 'wild' && !chosenColor) return 'COLOR_REQUIRED';

  performPlay(d, actor, cards, chosenColor, false);
  return undefined;
}

function jumpIn(d: Draft, actor: number, cardId: string): Violation {
  if (!d.settings.allowJumpIn) return 'JUMP_IN_DISABLED';
  if (d.phase.type !== 'AWAITING_PLAY') return 'WRONG_PHASE';
  const c = player(d, actor).hand.find((h) => h.id === cardId);
  if (!c) return 'CARD_NOT_IN_HAND';
  if (!isIdenticalToTop(c, d.top)) return 'JUMP_IN_NOT_IDENTICAL';
  performPlay(d, actor, [c], undefined, actor !== d.currentPlayerIndex);
  return undefined;
}

/** Puts validated cards on the table and resolves their effects. */
function performPlay(
  d: Draft,
  actor: number,
  cards: readonly Card[],
  chosenColor: CardColor | undefined,
  isJumpIn: boolean,
): void {
  const p = player(d, actor);
  const last = cards[cards.length - 1] as Card;
  const previousColor = d.top.activeColor ?? chosenColor ?? 'red';
  const playedIds = new Set(cards.map((c) => c.id));

  p.hand = p.hand.filter((c) => !playedIds.has(c.id));
  d.discardPile.push(...cards);
  const activeColor = last.kind === 'wild' ? (chosenColor as CardColor) : last.color;
  d.top = { card: last, activeColor };
  d.currentPlayerIndex = actor;
  d.phase = { type: 'AWAITING_PLAY' };
  d.events.push({ type: 'CARD_PLAYED', playerId: p.id, cards: [...cards], jumpIn: isJumpIn });
  if (last.kind === 'wild')
    d.events.push({ type: 'COLOR_CHOSEN', playerId: p.id, color: activeColor });

  if (p.hand.length === 1) {
    p.uno.vulnerable = !p.uno.declared && d.settings.unoPenalty.enabled;
  } else {
    resetUno(p);
  }

  const count = cards.length;
  const penalty = penaltyOf(last) * count;

  if (p.hand.length === 0) {
    if (penalty > 0) {
      const total = resetDrawStack(d) + penalty;
      drawCards(d, seatFrom(d, actor, 1), total, 'penalty');
    }
    endRound(d, actor);
    return;
  }

  switch (last.value) {
    case 'draw2':
    case 'wild_draw4': {
      const challengeable = last.value === 'wild_draw4' && d.settings.allowWildDraw4Challenge;
      if (challengeable || d.settings.allowStackingDrawCards) {
        d.drawStack.total += penalty;
        d.drawStack.cardIds.push(...cards.map((c) => c.id));
        d.events.push({ type: 'PENALTY_STACKED', total: d.drawStack.total });
        advanceTurn(d, 1);
        if (challengeable) d.phase = { type: 'AWAITING_CHALLENGE', accusedId: p.id, previousColor };
      } else {
        const victim = seatFrom(d, actor, 1);
        drawCards(d, victim, penalty, 'penalty');
        d.events.push({ type: 'TURN_SKIPPED', playerId: player(d, victim).id });
        advanceTurn(d, 2);
      }
      return;
    }
    case 'skip':
      skipPlayers(d, actor, count);
      return;
    case 'reverse':
      if (d.players.length === 2) {
        skipPlayers(d, actor, count);
        return;
      }
      if (count % 2 === 1) {
        d.direction = d.direction === 1 ? -1 : 1;
        d.events.push({ type: 'DIRECTION_CHANGED', direction: d.direction });
      }
      advanceTurn(d, 1);
      return;
    case 7:
      if (d.settings.sevenSwapHands) {
        d.phase = { type: 'AWAITING_SWAP_TARGET' };
        return;
      }
      advanceTurn(d, 1);
      return;
    case 0:
      if (d.settings.zeroRotateHands) rotateHands(d);
      advanceTurn(d, 1);
      return;
    default:
      advanceTurn(d, 1);
  }
}

function skipPlayers(d: Draft, actor: number, count: number): void {
  for (let k = 1; k <= count; k++) {
    d.events.push({ type: 'TURN_SKIPPED', playerId: player(d, seatFrom(d, actor, k)).id });
  }
  advanceTurn(d, count + 1);
}

function rotateHands(d: Draft): void {
  const hands = d.players.map((p) => p.hand);
  d.players.forEach((_, i) => {
    player(d, seatFrom(d, i, 1)).hand = hands[i] as Card[];
  });
  d.players.forEach(resetUno);
  d.events.push({ type: 'HANDS_ROTATED', direction: d.direction });
}

// ── Drawing & passing ────────────────────────────────────────────────────

function draw(d: Draft, actor: number, reason: 'voluntary' | 'timeout'): Violation {
  if (d.phase.type === 'AWAITING_CHALLENGE') return resolveChallenge(d, actor, false);
  if (d.phase.type !== 'AWAITING_PLAY') return 'WRONG_PHASE';
  const notYourTurn = requireTurn(d, actor);
  if (notYourTurn) return notYourTurn;

  if (d.drawStack.total > 0) {
    drawCards(d, actor, resetDrawStack(d), 'penalty');
    advanceTurn(d, 1);
    return undefined;
  }

  const p = player(d, actor);
  let drawn: Card | undefined;
  let count = 0;
  const keepDrawing = d.settings.drawUntilPlayable && reason === 'voluntary';
  do {
    drawn = takeFromPile(d);
    if (!drawn) break;
    p.hand.push(drawn);
    count += 1;
  } while (keepDrawing && !matchesTop(drawn, d.top));
  if (count > 0) resetUno(p);
  d.events.push({ type: 'CARDS_DRAWN', playerId: p.id, count, reason });

  if (
    reason === 'voluntary' &&
    drawn &&
    d.settings.allowPlayAfterDraw &&
    matchesTop(drawn, d.top)
  ) {
    d.phase = { type: 'AWAITING_PLAY_DRAWN', drawnCardId: drawn.id };
  } else {
    advanceTurn(d, 1);
  }
  return undefined;
}

function pass(d: Draft, actor: number): Violation {
  const notYourTurn = requireTurn(d, actor);
  if (notYourTurn) return notYourTurn;
  if (d.phase.type !== 'AWAITING_PLAY_DRAWN') return 'CANNOT_PASS';
  d.phase = { type: 'AWAITING_PLAY' };
  advanceTurn(d, 1);
  return undefined;
}

// ── Transient phases ─────────────────────────────────────────────────────

function chooseColor(d: Draft, actor: number, color: CardColor): Violation {
  if (d.phase.type !== 'AWAITING_COLOR') return 'WRONG_PHASE';
  const notYourTurn = requireTurn(d, actor);
  if (notYourTurn) return notYourTurn;
  d.top = { ...d.top, activeColor: color };
  d.phase = { type: 'AWAITING_PLAY' };
  d.events.push({ type: 'COLOR_CHOSEN', playerId: player(d, actor).id, color });
  return undefined;
}

function chooseSwapTarget(d: Draft, actor: number, targetId: PlayerId): Violation {
  if (d.phase.type !== 'AWAITING_SWAP_TARGET') return 'WRONG_PHASE';
  const notYourTurn = requireTurn(d, actor);
  if (notYourTurn) return notYourTurn;
  const target = d.players.findIndex((p) => p.id === targetId);
  if (target === -1 || target === actor) return 'INVALID_TARGET';
  const a = player(d, actor);
  const b = player(d, target);
  [a.hand, b.hand] = [b.hand, a.hand];
  resetUno(a);
  resetUno(b);
  d.events.push({ type: 'HANDS_SWAPPED', a: a.id, b: b.id });
  d.phase = { type: 'AWAITING_PLAY' };
  advanceTurn(d, 1);
  return undefined;
}

function resolveChallenge(d: Draft, actor: number, challenge: boolean): Violation {
  const { phase } = d;
  if (phase.type !== 'AWAITING_CHALLENGE') return 'WRONG_PHASE';
  const notYourTurn = requireTurn(d, actor);
  if (notYourTurn) return notYourTurn;

  const total = resetDrawStack(d);
  d.phase = { type: 'AWAITING_PLAY' };
  if (!challenge) {
    drawCards(d, actor, total, 'penalty');
    advanceTurn(d, 1);
    return undefined;
  }

  const accused = d.players.findIndex((p) => p.id === phase.accusedId);
  const bluff = accused !== -1 && hasColor(player(d, accused).hand, phase.previousColor);
  d.events.push({
    type: 'CHALLENGE_RESOLVED',
    challengerId: player(d, actor).id,
    accusedId: phase.accusedId,
    bluff,
  });
  if (bluff) {
    // The accused takes the penalty; the challenger plays their turn normally.
    drawCards(d, accused, Math.max(total, CHALLENGE_PENALTY.bluff), 'challenge_bluff');
  } else {
    drawCards(d, actor, total + CHALLENGE_PENALTY.failedExtra, 'challenge_failed');
    advanceTurn(d, 1);
  }
  return undefined;
}

// ── Uno ──────────────────────────────────────────────────────────────────

function callUno(d: Draft, actor: number): Violation {
  const p = player(d, actor);
  const preCall =
    p.hand.length === 2 &&
    actor === d.currentPlayerIndex &&
    (d.phase.type === 'AWAITING_PLAY' || d.phase.type === 'AWAITING_PLAY_DRAWN');
  const lastCard = p.hand.length === 1 && !p.uno.declared;
  if (!preCall && !lastCard) return 'UNO_NOT_ALLOWED';
  p.uno = { declared: true, vulnerable: false };
  d.events.push({ type: 'UNO_CALLED', playerId: p.id });
  return undefined;
}

function catchUno(d: Draft, actor: number, targetId: PlayerId): Violation {
  if (!d.settings.unoPenalty.enabled) return 'UNO_NOT_ALLOWED';
  const target = d.players.findIndex((p) => p.id === targetId);
  if (target === -1 || target === actor) return 'INVALID_TARGET';
  const t = player(d, target);
  if (!t.uno.vulnerable || t.hand.length !== 1) return 'NOTHING_TO_CATCH';
  t.uno.vulnerable = false;
  d.events.push({ type: 'UNO_CAUGHT', by: player(d, actor).id, target: t.id });
  drawCards(d, target, d.settings.unoPenalty.cards, 'uno_caught');
  return undefined;
}

// ── End of round ─────────────────────────────────────────────────────────

function endRound(d: Draft, winnerIndex: number): void {
  const winner = player(d, winnerIndex);
  const points = d.players.reduce(
    (sum, p) => sum + p.hand.reduce((s, c) => s + cardPoints(c.value), 0),
    0,
  );
  winner.score += points;
  resetDrawStack(d);
  d.events.push({ type: 'ROUND_ENDED', winnerId: winner.id, points });

  const { scoring } = d.settings;
  if (scoring.mode === 'single_round' || winner.score >= scoring.target) {
    d.phase = { type: 'GAME_OVER', winnerId: winner.id };
    d.events.push({ type: 'GAME_ENDED', winnerId: winner.id });
  } else {
    d.phase = { type: 'ROUND_OVER', winnerId: winner.id, points };
  }
}

// ── Timeouts ─────────────────────────────────────────────────────────────

/** Plays the safest default action for the current player when their turn timer expires. */
export function resolveTimeout(state: ServerGameState): EngineResult {
  if (state.phase.type === 'ROUND_OVER' || state.phase.type === 'GAME_OVER') {
    return { ok: false, reason: 'GAME_NOT_RUNNING' };
  }
  const d = toDraft(state);
  const actor = d.currentPlayerIndex;
  closeUnoWindows(d, actor);
  const violation = timeoutAction(d, actor);
  if (violation) return { ok: false, reason: violation };
  d.version += 1;
  return { ok: true, state: commit(d), events: d.events };
}

function timeoutAction(d: Draft, actor: number): Violation {
  switch (d.phase.type) {
    case 'AWAITING_PLAY':
      return draw(d, actor, 'timeout');
    case 'AWAITING_PLAY_DRAWN':
      return pass(d, actor);
    case 'AWAITING_COLOR':
      return chooseColor(d, actor, dominantColor(player(d, actor).hand));
    case 'AWAITING_SWAP_TARGET': {
      const target = d.players
        .map((p, i) => ({ i, id: p.id, size: p.hand.length }))
        .filter((s) => s.i !== actor)
        .sort((a, b) => a.size - b.size || a.i - b.i)[0];
      return target ? chooseSwapTarget(d, actor, target.id) : 'INVALID_TARGET';
    }
    case 'AWAITING_CHALLENGE':
      return resolveChallenge(d, actor, false);
    default:
      return 'GAME_NOT_RUNNING';
  }
}

/** Most frequent color among colored cards; ties resolved by CARD_COLORS order. */
export function dominantColor(hand: readonly Card[]): CardColor {
  let best: CardColor = CARD_COLORS[0];
  let bestCount = -1;
  for (const color of CARD_COLORS) {
    const n = hand.filter((c) => c.kind === 'colored' && c.color === color).length;
    if (n > bestCount) {
      best = color;
      bestCount = n;
    }
  }
  return best;
}
