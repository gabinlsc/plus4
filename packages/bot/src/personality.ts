import type { BotDifficulty } from '@uno/shared';

/** Probabilities and reaction times that make each difficulty feel distinct. */
export interface BotPersonality {
  /** Calls Uno before playing the penultimate card. */
  readonly callUno: number;
  /** Calls Uno late, out of turn, after forgetting. */
  readonly lateCallUno: number;
  readonly catchUno: number;
  readonly jumpIn: number;
  readonly challengeDraw4: number;
  /** Plays strategically; otherwise picks a random legal card. */
  readonly strategic: boolean;
  readonly multiplePlay: boolean;
  /** Delay before acting on its own turn, in ms. */
  readonly thinkMs: readonly [min: number, max: number];
  /** Delay before reacting out of turn (jump-in, catch), in ms. */
  readonly reactMs: readonly [min: number, max: number];
}

export const PERSONALITIES: Readonly<Record<BotDifficulty, BotPersonality>> = {
  easy: {
    callUno: 0.5,
    lateCallUno: 0.6,
    catchUno: 0.3,
    jumpIn: 0.3,
    challengeDraw4: 0.1,
    strategic: false,
    multiplePlay: false,
    thinkMs: [1200, 2200],
    reactMs: [1500, 3000],
  },
  normal: {
    callUno: 0.9,
    lateCallUno: 0.9,
    catchUno: 0.6,
    jumpIn: 0.7,
    challengeDraw4: 0.25,
    strategic: true,
    multiplePlay: false,
    thinkMs: [900, 1600],
    reactMs: [900, 2000],
  },
  hard: {
    callUno: 1,
    lateCallUno: 1,
    catchUno: 0.9,
    jumpIn: 1,
    challengeDraw4: 0.35,
    strategic: true,
    multiplePlay: true,
    thinkMs: [700, 1300],
    reactMs: [500, 1200],
  },
};

export function pickDelay([min, max]: readonly [number, number], random: () => number): number {
  return Math.round(min + (max - min) * random());
}
