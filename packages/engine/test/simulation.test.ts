import { describe, expect, it } from 'vitest';
import { CARD_COLORS, SETTINGS_PRESETS, type GameIntent, type ServerGameState } from '@uno/shared';
import {
  applyIntent,
  createGame,
  getJumpInCardIds,
  getPlayableCardIds,
  randomInt,
  startNextRound,
} from '../src';
import { countAllCards } from './helpers';

function assertInvariants(state: ServerGameState): void {
  expect(countAllCards(state)).toBe(108);
  const ids = [
    ...state.drawPile,
    ...state.discardPile,
    ...state.players.flatMap((p) => p.hand),
  ].map((c) => c.id);
  expect(new Set(ids).size).toBe(108);
  expect(state.discardPile.at(-1)).toEqual(state.top.card);
  expect(state.players[state.currentPlayerIndex]).toBeDefined();
  if (state.phase.type !== 'AWAITING_COLOR') expect(state.top.activeColor).not.toBeNull();
  expect(state.drawStack.total).toBeGreaterThanOrEqual(0);
}

/** A random but legal policy: exercises every phase and out-of-turn action. */
function chooseIntent(state: ServerGameState, rng: number): [string, GameIntent, number] {
  const current = state.players[state.currentPlayerIndex];
  if (!current) throw new Error('no current player');
  const v = state.version;
  let r: number;
  [r, rng] = randomInt(rng, 100);

  // Occasional out-of-turn actions.
  if (r < 10) {
    for (const p of state.players) {
      const jump = getJumpInCardIds(state, p.id)[0];
      if (jump && p.id !== current.id)
        return [p.id, { type: 'JUMP_IN', cardId: jump, expectedVersion: v }, rng];
    }
  }
  if (r < 15) {
    const target = state.players.find((p) => p.uno.vulnerable);
    const catcher = state.players.find((p) => p.id !== target?.id);
    if (target && catcher) return [catcher.id, { type: 'CATCH_UNO', targetId: target.id }, rng];
  }

  const color = CARD_COLORS[r % 4] ?? 'red';
  switch (state.phase.type) {
    case 'AWAITING_COLOR':
      return [current.id, { type: 'CHOOSE_COLOR', color, expectedVersion: v }, rng];
    case 'AWAITING_SWAP_TARGET': {
      const target = state.players.find((p) => p.id !== current.id);
      return [
        current.id,
        { type: 'CHOOSE_SWAP_TARGET', targetId: target?.id ?? '', expectedVersion: v },
        rng,
      ];
    }
    case 'AWAITING_CHALLENGE':
      if (r % 3 === 0)
        return [
          current.id,
          { type: 'RESOLVE_CHALLENGE', challenge: r % 2 === 0, expectedVersion: v },
          rng,
        ];
      break;
    default:
      break;
  }
  if (current.hand.length === 2 && r % 2 === 0 && state.phase.type === 'AWAITING_PLAY') {
    return [current.id, { type: 'CALL_UNO' }, rng];
  }
  const playable = getPlayableCardIds(state, current.id);
  const pick = playable[r % Math.max(playable.length, 1)];
  if (pick) {
    const cardIds = [pick];
    const first = current.hand.find((c) => c.id === pick);
    if (
      state.settings.allowMultiplePlay &&
      state.phase.type !== 'AWAITING_PLAY_DRAWN' &&
      r % 4 === 0 &&
      first
    ) {
      const twin = current.hand.find((c) => c.id !== pick && c.value === first.value);
      if (twin) cardIds.push(twin.id);
    }
    return [
      current.id,
      { type: 'PLAY_CARD', cardIds, chosenColor: color, expectedVersion: v },
      rng,
    ];
  }
  if (state.phase.type === 'AWAITING_PLAY_DRAWN') {
    return [current.id, { type: 'PASS', expectedVersion: v }, rng];
  }
  return [current.id, { type: 'DRAW', expectedVersion: v }, rng];
}

describe('random game simulation', () => {
  for (const preset of SETTINGS_PRESETS) {
    it(`${preset.id}: random legal play keeps every invariant and games terminate`, () => {
      let finished = 0;
      const games = 40;
      for (let seed = 1; seed <= games; seed++) {
        const players = Array.from({ length: 2 + (seed % 5) }, (_, i) => ({
          id: `p${i}`,
          name: `P${i}`,
        }));
        let state = createGame({
          players,
          seed,
          settings: { ...preset.settings, scoring: { mode: 'points', target: 200 } },
        }).state;
        let rng = seed * 7919;
        for (let step = 0; step < 5000; step++) {
          assertInvariants(state);
          if (state.phase.type === 'GAME_OVER') break;
          if (state.phase.type === 'ROUND_OVER') {
            const next = startNextRound(state);
            if (!next.ok) throw new Error(next.reason);
            state = next.state;
            continue;
          }
          let actor: string;
          let intent: GameIntent;
          [actor, intent, rng] = chooseIntent(state, rng);
          const result = applyIntent(state, actor, intent);
          if (!result.ok) {
            throw new Error(
              `seed ${seed} step ${step}: ${intent.type} by ${actor} → ${result.reason}`,
            );
          }
          expect(result.state.version).toBe(state.version + 1);
          state = result.state;
        }
        if (state.phase.type === 'GAME_OVER') finished++;
      }
      expect(finished).toBe(games);
    });
  }
});
