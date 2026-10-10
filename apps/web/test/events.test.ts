import { describe, expect, it } from 'vitest';
import { describeEvent } from '../src/lib/events';
import { errorMessage } from '../src/lib/messages';
import { red7 } from './fixtures';

const names: Record<string, string> = { me: 'Moi', bob: 'Bob', eve: 'Eve' };
const nameOf = (id: string) => names[id] ?? '?';

describe('describeEvent', () => {
  it('announces jump-ins, Uno calls and catches', () => {
    expect(
      describeEvent(
        { type: 'CARD_PLAYED', playerId: 'bob', cards: [red7], jumpIn: true },
        nameOf,
        'me',
      ),
    ).toEqual({
      text: 'Bob coupe !',
      tone: 'alert',
    });
    expect(
      describeEvent(
        { type: 'CARD_PLAYED', playerId: 'bob', cards: [red7], jumpIn: false },
        nameOf,
        'me',
      ),
    ).toBeNull();
    expect(describeEvent({ type: 'UNO_CALLED', playerId: 'eve' }, nameOf, 'me')?.text).toBe(
      'Eve : UNO !',
    );
    expect(describeEvent({ type: 'UNO_CAUGHT', by: 'bob', target: 'me' }, nameOf, 'me')).toEqual({
      text: 'Bob t’a pris sans Uno !',
      tone: 'error',
    });
  });

  it('describes challenges and big penalties', () => {
    expect(
      describeEvent(
        { type: 'CHALLENGE_RESOLVED', challengerId: 'me', accusedId: 'bob', bluff: true },
        nameOf,
        'me',
      )?.text,
    ).toBe('Bluff démasqué ! Bob pioche.');
    expect(
      describeEvent(
        { type: 'CARDS_DRAWN', playerId: 'bob', count: 6, reason: 'penalty' },
        nameOf,
        'me',
      )?.text,
    ).toBe('Bob ramasse +6 !');
    expect(
      describeEvent(
        { type: 'CARDS_DRAWN', playerId: 'bob', count: 1, reason: 'voluntary' },
        nameOf,
        'me',
      ),
    ).toBeNull();
  });

  it('does not echo my own color choice', () => {
    expect(
      describeEvent({ type: 'COLOR_CHOSEN', playerId: 'me', color: 'red' }, nameOf, 'me'),
    ).toBeNull();
    expect(
      describeEvent({ type: 'COLOR_CHOSEN', playerId: 'bob', color: 'red' }, nameOf, 'me')?.text,
    ).toBe('Bob choisit le rouge');
  });
});

describe('errorMessage', () => {
  it('has a French message for rule violations and lobby errors', () => {
    expect(errorMessage('JUMP_IN_NOT_IDENTICAL')).toMatch(/exactement la même carte/);
    expect(errorMessage('ROOM_FULL')).toMatch(/complète/);
  });
});
