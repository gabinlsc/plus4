import { describe, expect, it } from 'vitest';
import { SETTINGS_PRESETS, type BotDifficulty } from '@uno/shared';
import { applyIntent, createGame, nextRandom, projectForPlayer, startNextRound } from '@uno/engine';
import { decideOutOfTurn, decideTurn } from '../src';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    const [value, next] = nextRandom(state);
    state = next;
    return value;
  };
}

describe('bots playing full games through the real engine', () => {
  const difficulties: BotDifficulty[] = ['easy', 'normal', 'hard'];

  for (const preset of SETTINGS_PRESETS) {
    it(`${preset.id}: every bot decision is legal and games finish`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const random = seeded(seed);
        const players = Array.from({ length: 2 + (seed % 4) }, (_, i) => ({
          id: `b${i}`,
          name: `B${i}`,
          isBot: true,
        }));
        const level = (id: string) => difficulties[Number(id.slice(1)) % 3] as BotDifficulty;
        let state = createGame({
          players,
          seed,
          settings: { ...preset.settings, scoring: { mode: 'points', target: 150 } },
        }).state;

        let steps = 0;
        while (state.phase.type !== 'GAME_OVER') {
          expect(steps++).toBeLessThan(20_000);
          if (state.phase.type === 'ROUND_OVER') {
            const next = startNextRound(state);
            if (!next.ok) throw new Error(next.reason);
            state = next.state;
            continue;
          }
          // Out-of-turn reactions first (jump-in, catch, late Uno), then the current player.
          let acted = false;
          for (const p of state.players) {
            const intent = decideOutOfTurn(projectForPlayer(state, p.id), level(p.id), random);
            if (!intent) continue;
            const result = applyIntent(state, p.id, intent);
            if (!result.ok)
              throw new Error(`seed ${seed}: ${p.id} ${intent.type} → ${result.reason}`);
            state = result.state;
            acted = true;
            break;
          }
          if (acted) continue;
          const current = state.players[state.currentPlayerIndex];
          if (!current) throw new Error('no current player');
          const intent = decideTurn(projectForPlayer(state, current.id), level(current.id), random);
          if (!intent)
            throw new Error(`seed ${seed}: current bot ${current.id} returned no action`);
          const result = applyIntent(state, current.id, intent);
          if (!result.ok)
            throw new Error(`seed ${seed}: ${current.id} ${intent.type} → ${result.reason}`);
          state = result.state;
        }
      }
    });
  }
});
