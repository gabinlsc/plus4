import { describe, expect, it } from 'vitest';
import { decideOutOfTurn, decideTurn } from '../src';
import { always, card, view, wild } from './helpers';

const rnd = always(0);

describe('decideTurn', () => {
  it('returns null when it is not the bot’s turn', () => {
    expect(
      decideTurn(view({ hand: [card('red', 1)], top: card('red', 5), current: 1 }), 'hard', rnd),
    ).toBeNull();
  });

  it('draws when nothing is playable', () => {
    const v = view({ hand: [card('blue', 1)], top: card('red', 5), playable: [] });
    expect(decideTurn(v, 'normal', rnd)).toEqual({ type: 'DRAW', expectedVersion: 3 });
  });

  it('plays a playable card', () => {
    const r1 = card('red', 1);
    const v = view({
      hand: [r1, card('blue', 2), card('blue', 3)],
      top: card('red', 5),
      playable: [r1],
    });
    expect(decideTurn(v, 'normal', rnd)).toEqual({
      type: 'PLAY_CARD',
      cardIds: [r1.id],
      expectedVersion: 3,
    });
  });

  it('keeps wilds for later when a colored card is available', () => {
    const r1 = card('red', 1);
    const w = wild();
    const v = view({ hand: [w, r1, card('blue', 2)], top: card('red', 5), playable: [w, r1] });
    expect(decideTurn(v, 'normal', rnd)).toMatchObject({ cardIds: [r1.id] });
  });

  it('declares its dominant color when playing a wild', () => {
    const w = wild();
    const v = view({
      hand: [w, card('green', 1), card('green', 2), card('blue', 3)],
      top: card('red', 5),
      playable: [w],
    });
    expect(decideTurn(v, 'normal', rnd)).toMatchObject({ cardIds: [w.id], chosenColor: 'green' });
  });

  it('attacks the next player when they are about to win', () => {
    const r1 = card('red', 1);
    const skip = card('red', 'skip');
    const v = view({
      hand: [r1, skip, card('blue', 2)],
      top: card('red', 5),
      playable: [r1, skip],
      opponents: [1, 6],
    });
    expect(decideTurn(v, 'hard', rnd)).toMatchObject({ cardIds: [skip.id] });
  });

  it('follows the play direction to find the next player', () => {
    const r1 = card('red', 1);
    const skip = card('red', 'skip');
    const v = view({
      hand: [r1, skip, card('blue', 2)],
      top: card('red', 5),
      playable: [r1, skip],
      opponents: [1, 6],
      direction: -1,
    });
    expect(decideTurn(v, 'hard', rnd)).toMatchObject({ cardIds: [r1.id] });
  });

  it('stacks on a pending penalty, preferring a +2 over a +4', () => {
    const d2 = card('blue', 'draw2');
    const plus4 = wild('wild_draw4');
    const v = view({
      hand: [d2, plus4, card('green', 3)],
      top: card('red', 'draw2'),
      drawStack: 2,
      playable: [d2, plus4],
      settings: { allowStackingDrawCards: true },
    });
    expect(decideTurn(v, 'normal', rnd)).toMatchObject({ cardIds: [d2.id] });
  });

  it('takes the penalty when it cannot stack', () => {
    const v = view({
      hand: [card('green', 3)],
      top: card('red', 'draw2'),
      drawStack: 4,
      playable: [],
    });
    expect(decideTurn(v, 'normal', rnd)).toEqual({ type: 'DRAW', expectedVersion: 3 });
  });

  it('calls Uno before playing its penultimate card', () => {
    const r1 = card('red', 1);
    const v = view({ hand: [r1, card('blue', 2)], top: card('red', 5), playable: [r1] });
    expect(decideTurn(v, 'hard', rnd)).toEqual({ type: 'CALL_UNO' });
  });

  it('an easy bot may forget to call Uno', () => {
    const r1 = card('red', 1);
    const v = view({ hand: [r1, card('blue', 2)], top: card('red', 5), playable: [r1] });
    expect(decideTurn(v, 'easy', always(0.99))).toMatchObject({ type: 'PLAY_CARD' });
  });

  it('plays several cards of the same value when allowed (hard)', () => {
    const r7 = card('red', 7);
    const b7 = card('blue', 7);
    const v = view({
      hand: [r7, b7, card('blue', 1), card('green', 2)],
      top: card('red', 5),
      playable: [r7],
      settings: { allowMultiplePlay: true },
    });
    expect(decideTurn(v, 'hard', rnd)).toMatchObject({ cardIds: [r7.id, b7.id] });
  });

  it('plays the drawn card when possible, otherwise passes', () => {
    const r8 = card('red', 8);
    const playable = view({
      hand: [r8, card('blue', 1), card('blue', 2)],
      top: card('red', 5),
      playable: [r8],
      phase: { type: 'AWAITING_PLAY_DRAWN', drawnCardId: r8.id },
    });
    expect(decideTurn(playable, 'normal', rnd)).toMatchObject({
      type: 'PLAY_CARD',
      cardIds: [r8.id],
    });
    const notPlayable = view({
      hand: [r8, card('blue', 1), card('blue', 2)],
      top: card('red', 5),
      playable: [],
      phase: { type: 'AWAITING_PLAY_DRAWN', drawnCardId: r8.id },
    });
    expect(decideTurn(notPlayable, 'normal', rnd)).toEqual({ type: 'PASS', expectedVersion: 3 });
  });

  it('chooses a color at round start', () => {
    const v = view({
      hand: [card('blue', 1), card('blue', 2), card('red', 1)],
      top: wild(),
      phase: { type: 'AWAITING_COLOR', cardId: 'x' },
    });
    expect(decideTurn(v, 'normal', rnd)).toEqual({
      type: 'CHOOSE_COLOR',
      color: 'blue',
      expectedVersion: 3,
    });
  });

  it('swaps hands with the opponent holding the fewest cards', () => {
    const v = view({
      hand: [card('blue', 1), card('blue', 2)],
      top: card('red', 7),
      opponents: [4, 1, 3],
      phase: { type: 'AWAITING_SWAP_TARGET' },
    });
    expect(decideTurn(v, 'normal', rnd)).toEqual({
      type: 'CHOOSE_SWAP_TARGET',
      targetId: 'o2',
      expectedVersion: 3,
    });
  });

  it('facing a +4: stacks if possible, otherwise challenges or accepts', () => {
    const phase = {
      type: 'AWAITING_CHALLENGE' as const,
      accusedId: 'o2',
      previousColor: 'red' as const,
    };
    const d2 = card('blue', 'draw2');
    const canStack = view({
      hand: [d2, card('green', 1)],
      top: wild('wild_draw4'),
      drawStack: 4,
      playable: [d2],
      phase,
      settings: { allowStackingDrawCards: true },
    });
    expect(decideTurn(canStack, 'hard', rnd)).toMatchObject({
      type: 'PLAY_CARD',
      cardIds: [d2.id],
    });
    const cannot = view({ hand: [card('green', 1)], top: wild('wild_draw4'), drawStack: 4, phase });
    expect(decideTurn(cannot, 'easy', always(0.99))).toEqual({
      type: 'RESOLVE_CHALLENGE',
      challenge: false,
      expectedVersion: 3,
    });
    expect(decideTurn(cannot, 'hard', always(0))).toEqual({
      type: 'RESOLVE_CHALLENGE',
      challenge: true,
      expectedVersion: 3,
    });
  });
});

describe('decideOutOfTurn', () => {
  it('jumps in when holding the identical card', () => {
    const twin = card('red', 5);
    const v = view({
      hand: [twin, card('blue', 1)],
      top: card('red', 5),
      current: 1,
      jumpIn: [twin],
      settings: { allowJumpIn: true },
    });
    expect(decideOutOfTurn(v, 'hard', rnd)).toEqual({
      type: 'JUMP_IN',
      cardId: twin.id,
      expectedVersion: 3,
    });
  });

  it('catches an opponent who forgot to call Uno', () => {
    const v = view({
      hand: [card('blue', 1), card('blue', 2)],
      top: card('red', 5),
      current: 2,
      opponents: [1, 5],
      vulnerable: [1],
    });
    expect(decideOutOfTurn(v, 'hard', rnd)).toEqual({ type: 'CATCH_UNO', targetId: 'o1' });
  });

  it('calls Uno late if it forgot', () => {
    const v = view({ hand: [card('blue', 1)], top: card('red', 5), current: 1 });
    expect(decideOutOfTurn(v, 'easy', rnd)).toEqual({ type: 'CALL_UNO' });
  });

  it('does nothing when there is nothing to do', () => {
    const v = view({ hand: [card('blue', 1), card('blue', 2)], top: card('red', 5), current: 1 });
    expect(decideOutOfTurn(v, 'hard', rnd)).toBeNull();
  });

  it('a lazy roll skips the opportunity', () => {
    const twin = card('red', 5);
    const v = view({
      hand: [twin, card('blue', 1)],
      top: card('red', 5),
      current: 1,
      jumpIn: [twin],
      settings: { allowJumpIn: true },
    });
    expect(decideOutOfTurn(v, 'easy', always(0.99))).toBeNull();
  });
});
