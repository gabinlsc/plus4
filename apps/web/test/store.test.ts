import { describe, expect, it } from 'vitest';
import type { Card } from '@uno/shared';
import {
  applyGameUpdate,
  createAppStore,
  leaveRoomState,
  setPrefs,
  setSession,
} from '../src/store/store';
import { blue2, makeUpdate, makeView, red5, red7 } from './fixtures';

const card = (n: number): Card => ({
  id: `c-${n}`,
  kind: 'colored',
  color: 'green',
  value: (n % 10) as 0,
});

describe('applyGameUpdate', () => {
  it('starts the visual discard pile with the top card', () => {
    const store = createAppStore();
    applyGameUpdate(store, makeUpdate(makeView({ top: red5 })));
    expect(store.getState().discard.map((d) => d.card.id)).toEqual([red5.id]);
    expect(store.getState().eventSeq).toBe(1);
  });

  it('appends played cards with their author', () => {
    const store = createAppStore();
    applyGameUpdate(store, makeUpdate(makeView({ top: red5 })));
    applyGameUpdate(
      store,
      makeUpdate(makeView({ top: red7 }), [
        { type: 'CARD_PLAYED', playerId: 'bob', cards: [red7], jumpIn: false },
      ]),
    );
    const discard = store.getState().discard;
    expect(discard.map((d) => d.card.id)).toEqual([red5.id, red7.id]);
    expect(discard[1]?.playerId).toBe('bob');
  });

  it('keeps at most five cards and resets on a new round or reshuffle', () => {
    const store = createAppStore();
    applyGameUpdate(store, makeUpdate(makeView({ top: card(0) })));
    for (let i = 1; i <= 7; i++) {
      applyGameUpdate(
        store,
        makeUpdate(makeView({ top: card(i) }), [
          { type: 'CARD_PLAYED', playerId: 'bob', cards: [card(i)], jumpIn: false },
        ]),
      );
    }
    expect(store.getState().discard).toHaveLength(5);
    expect(store.getState().discard.at(-1)?.card.id).toBe('c-7');

    applyGameUpdate(
      store,
      makeUpdate(makeView({ top: card(7) }), [{ type: 'DECK_RESHUFFLED', drawPileCount: 40 }]),
    );
    expect(store.getState().discard.map((d) => d.card.id)).toEqual(['c-7']);

    applyGameUpdate(
      store,
      makeUpdate(makeView({ top: blue2 }), [{ type: 'ROUND_STARTED', round: 2, dealerId: 'bob' }]),
    );
    expect(store.getState().discard.map((d) => d.card.id)).toEqual([blue2.id]);
  });

  it('resynchronizes with the authoritative top card', () => {
    const store = createAppStore();
    applyGameUpdate(store, makeUpdate(makeView({ top: red5 })));
    applyGameUpdate(store, makeUpdate(makeView({ top: blue2 })));
    expect(store.getState().discard.at(-1)?.card.id).toBe(blue2.id);
  });
});

describe('persistence', () => {
  it('stores the session and preferences across reloads', () => {
    const store = createAppStore();
    setSession(store, { playerId: 'p', sessionToken: 't', code: 'UNO-ABCD' });
    setPrefs(store, { name: 'Gabin', colorblind: true });
    const reloaded = createAppStore();
    expect(reloaded.getState().session?.code).toBe('UNO-ABCD');
    expect(reloaded.getState().prefs).toEqual({ name: 'Gabin', colorblind: true });
  });

  it('leaving a room clears the session and game state', () => {
    const store = createAppStore();
    setSession(store, { playerId: 'p', sessionToken: 't', code: 'UNO-ABCD' });
    applyGameUpdate(store, makeUpdate(makeView()));
    leaveRoomState(store, 'kicked');
    expect(store.getState()).toMatchObject({
      session: null,
      game: null,
      lobby: null,
      closed: 'kicked',
    });
    expect(createAppStore().getState().session).toBeNull();
  });
});
