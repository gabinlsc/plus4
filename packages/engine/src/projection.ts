import type { CardId, ClientGameView, PlayerId, ServerGameState } from '@uno/shared';
import { isCardPlayable, isIdenticalToTop } from './rules';

function findPlayer(state: ServerGameState, playerId: PlayerId) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new Error(`Unknown player ${playerId}`);
  return p;
}

/** Cards the player may play right now (empty when it is not their turn). */
export function getPlayableCardIds(state: ServerGameState, playerId: PlayerId): CardId[] {
  const current = state.players[state.currentPlayerIndex];
  if (current?.id !== playerId) return [];
  return current.hand.filter((c) => isCardPlayable(state, c)).map((c) => c.id);
}

/** Cards the player may use to jump in right now. */
export function getJumpInCardIds(state: ServerGameState, playerId: PlayerId): CardId[] {
  if (!state.settings.allowJumpIn || state.phase.type !== 'AWAITING_PLAY') return [];
  return findPlayer(state, playerId)
    .hand.filter((c) => isIdenticalToTop(c, state.top))
    .map((c) => c.id);
}

/** Per-player view: own hand in clear, opponents reduced to public information. */
export function projectForPlayer(state: ServerGameState, playerId: PlayerId): ClientGameView {
  const me = findPlayer(state, playerId);
  const current = state.players[state.currentPlayerIndex];
  if (!current) throw new Error('Invalid current player index');
  return {
    version: state.version,
    settings: state.settings,
    me: { ...me, hand: [...me.hand], uno: { ...me.uno } },
    seats: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      connected: p.connected,
      score: p.score,
      uno: { ...p.uno },
      handCount: p.hand.length,
    })),
    phase: state.phase,
    currentPlayerId: current.id,
    direction: state.direction,
    drawPileCount: state.drawPile.length,
    top: state.top,
    drawStack: { total: state.drawStack.total, cardIds: [...state.drawStack.cardIds] },
    round: state.round,
    playableCardIds: getPlayableCardIds(state, playerId),
    jumpInCardIds: getJumpInCardIds(state, playerId),
  };
}
