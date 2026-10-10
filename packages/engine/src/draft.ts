import type {
  Card,
  CardId,
  Direction,
  DiscardTop,
  DrawReason,
  GameEvent,
  GamePhase,
  GameSettings,
  PlayerState,
  ServerGameState,
} from '@uno/shared';
import { shuffle } from './rng';

export interface DraftPlayer {
  readonly id: string;
  readonly name: string;
  readonly isBot: boolean;
  connected: boolean;
  hand: Card[];
  score: number;
  uno: { declared: boolean; vulnerable: boolean };
}

/**
 * Mutable working copy of the state used while applying one intent. The
 * public API only ever exposes immutable `ServerGameState` snapshots: a draft
 * is created from a snapshot, mutated, and either committed or discarded.
 */
export interface Draft {
  version: number;
  readonly settings: Readonly<GameSettings>;
  players: DraftPlayer[];
  phase: GamePhase;
  currentPlayerIndex: number;
  direction: Direction;
  drawPile: Card[];
  discardPile: Card[];
  top: DiscardTop;
  drawStack: { total: number; cardIds: CardId[] };
  round: number;
  dealerIndex: number;
  rngState: number;
  readonly events: GameEvent[];
}

export function toDraft(state: ServerGameState): Draft {
  return {
    version: state.version,
    settings: state.settings,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand], uno: { ...p.uno } })),
    phase: state.phase,
    currentPlayerIndex: state.currentPlayerIndex,
    direction: state.direction,
    drawPile: [...state.drawPile],
    discardPile: [...state.discardPile],
    top: state.top,
    drawStack: { total: state.drawStack.total, cardIds: [...state.drawStack.cardIds] },
    round: state.round,
    dealerIndex: state.dealerIndex,
    rngState: state.rngState,
    events: [],
  };
}

export function commit(draft: Draft): ServerGameState {
  const players: PlayerState[] = draft.players.map((p) => ({
    ...p,
    hand: [...p.hand],
    uno: { ...p.uno },
  }));
  return {
    version: draft.version,
    settings: draft.settings,
    players,
    phase: draft.phase,
    currentPlayerIndex: draft.currentPlayerIndex,
    direction: draft.direction,
    drawPile: [...draft.drawPile],
    discardPile: [...draft.discardPile],
    top: draft.top,
    drawStack: { total: draft.drawStack.total, cardIds: [...draft.drawStack.cardIds] },
    round: draft.round,
    dealerIndex: draft.dealerIndex,
    rngState: draft.rngState,
  };
}

// ── Seats & turns ────────────────────────────────────────────────────────

export function player(d: Draft, index: number): DraftPlayer {
  const p = d.players[index];
  if (!p) throw new Error(`No player at seat ${index}`);
  return p;
}

export function seatFrom(d: Draft, from: number, steps: number): number {
  const n = d.players.length;
  return (((from + d.direction * steps) % n) + n) % n;
}

/** Moves the turn `steps` seats away from the current player. */
export function advanceTurn(d: Draft, steps = 1): void {
  d.currentPlayerIndex = seatFrom(d, d.currentPlayerIndex, steps);
  d.events.push({ type: 'TURN_CHANGED', playerId: player(d, d.currentPlayerIndex).id });
}

// ── Piles ────────────────────────────────────────────────────────────────

/** Takes the top of the draw pile, reshuffling the discard pile (minus its top) when empty. */
export function takeFromPile(d: Draft): Card | undefined {
  if (d.drawPile.length === 0 && d.discardPile.length > 1) {
    const top = d.discardPile[d.discardPile.length - 1] as Card;
    const [shuffled, rng] = shuffle(d.discardPile.slice(0, -1), d.rngState);
    d.rngState = rng;
    d.drawPile = shuffled;
    d.discardPile = [top];
    d.events.push({ type: 'DECK_RESHUFFLED', drawPileCount: shuffled.length });
  }
  return d.drawPile.pop();
}

export function resetUno(p: DraftPlayer): void {
  p.uno = { declared: false, vulnerable: false };
}

/** Gives up to `count` cards to a player and emits a single CARDS_DRAWN event. */
export function drawCards(d: Draft, index: number, count: number, reason: DrawReason): Card[] {
  const p = player(d, index);
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    const c = takeFromPile(d);
    if (!c) break;
    drawn.push(c);
  }
  p.hand.push(...drawn);
  if (drawn.length > 0) resetUno(p);
  d.events.push({ type: 'CARDS_DRAWN', playerId: p.id, count: drawn.length, reason });
  return drawn;
}

export function resetDrawStack(d: Draft): number {
  const total = d.drawStack.total;
  d.drawStack = { total: 0, cardIds: [] };
  return total;
}
