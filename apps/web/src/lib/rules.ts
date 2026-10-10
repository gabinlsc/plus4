import type { GameSettings } from '@uno/shared';

type BooleanRule = {
  [K in keyof GameSettings]: GameSettings[K] extends boolean ? K : never;
}[keyof GameSettings];

export interface RuleToggle {
  readonly key: BooleanRule;
  readonly title: string;
  readonly description: string;
  /** Rule only meaningful when another rule is on. */
  readonly requires?: BooleanRule;
}

export const RULE_TOGGLES: readonly RuleToggle[] = [
  {
    key: 'allowJumpIn',
    title: 'Interception',
    description: 'Coupe hors de ton tour avec une carte strictement identique à celle du dessus.',
  },
  {
    key: 'allowStackingDrawCards',
    title: 'Empilement +2 / +4',
    description: 'Les cartes pioche s’empilent : le premier qui ne peut pas répondre ramasse tout.',
  },
  {
    key: 'stackingRequiresColorMatch',
    title: '+2 sur +4 de la couleur annoncée',
    description: 'Pour répondre à un +4 avec un +2, celui-ci doit suivre la couleur choisie.',
    requires: 'allowStackingDrawCards',
  },
  {
    key: 'allowWildDraw4Challenge',
    title: 'Contester un +4',
    description:
      'Accuse de bluff : s’il pouvait jouer la couleur, il pioche 4. Sinon tu en prends 6.',
  },
  {
    key: 'sevenSwapHands',
    title: '7 : échange de main',
    description: 'Poser un 7 permet d’échanger sa main avec un adversaire.',
  },
  {
    key: 'zeroRotateHands',
    title: '0 : rotation des mains',
    description: 'Poser un 0 fait tourner toutes les mains dans le sens du jeu.',
  },
  {
    key: 'allowMultiplePlay',
    title: 'Pose multiple',
    description: 'Pose plusieurs cartes de même valeur en une fois.',
  },
  {
    key: 'drawUntilPlayable',
    title: 'Pioche jusqu’à pouvoir jouer',
    description: 'On pioche tant qu’aucune carte jouable ne sort.',
  },
  {
    key: 'allowPlayAfterDraw',
    title: 'Jouer la carte piochée',
    description: 'Si la carte piochée est jouable, tu peux la poser immédiatement.',
  },
];

export const TIMER_OPTIONS: readonly (number | null)[] = [null, 15, 30, 60];
export const HAND_SIZE_OPTIONS: readonly number[] = [5, 7, 10];
export const SCORE_OPTIONS: readonly (number | null)[] = [null, 200, 500];
