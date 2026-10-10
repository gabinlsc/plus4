import { describe, expect, it } from 'vitest';
import { createGameClient } from '../src/net/client';
import { createAppStore, setSession } from '../src/store/store';
import { FakeSocket, flush } from './fakeSocket';
import { makeUpdate, makeView } from './fixtures';

function setup() {
  const socket = new FakeSocket();
  const store = createAppStore();
  const client = createGameClient(socket.asSocket(), store);
  return { socket, store, client };
}

describe('game client', () => {
  it('connects and marks the store online', () => {
    const { store } = setup();
    expect(store.getState().connection).toBe('online');
  });

  it('creates a room and stores the session', async () => {
    const { socket, store, client } = setup();
    socket.replies.set('room:create', () => ({
      ok: true,
      value: { playerId: 'p1', sessionToken: 'tok', code: 'UNO-ABCD' },
    }));
    expect(await client.createRoom({ playerName: 'Gabin', mode: 'online' })).toBe(true);
    expect(store.getState().session).toEqual({
      playerId: 'p1',
      sessionToken: 'tok',
      code: 'UNO-ABCD',
    });
  });

  it('adds the current state version to versioned intents', async () => {
    const { socket, client } = setup();
    socket.serverEmit('game:update', makeUpdate(makeView({ version: 9 })));
    await client.intent({ type: 'DRAW' });
    await client.intent({ type: 'CALL_UNO' });
    const intents = socket.emitted.filter((e) => e.event === 'game:intent').map((e) => e.args[0]);
    expect(intents).toEqual([{ type: 'DRAW', expectedVersion: 9 }, { type: 'CALL_UNO' }]);
  });

  it('a rejected intent shakes and shows a French message', async () => {
    const { socket, store, client } = setup();
    socket.serverEmit('game:update', makeUpdate(makeView()));
    socket.replies.set('game:intent', () => ({ ok: false, reason: 'ILLEGAL_CARD' }));
    expect(await client.intent({ type: 'PLAY_CARD', cardIds: ['x'] })).toBe(false);
    expect(store.getState().shake).toBe(1);
    expect(store.getState().toasts.at(-1)).toMatchObject({
      text: 'Cette carte ne peut pas être posée.',
      tone: 'error',
    });
  });

  it('resumes a stored session on connect, and forgets it when expired', async () => {
    const socket = new FakeSocket();
    const store = createAppStore();
    setSession(store, { playerId: 'p1', sessionToken: 'tok', code: 'UNO-ABCD' });
    socket.replies.set('room:resume', () => ({ ok: false, reason: 'SESSION_EXPIRED' }));
    createGameClient(socket.asSocket(), store);
    expect(socket.emitted.find((e) => e.event === 'room:resume')?.args[0]).toEqual({
      sessionToken: 'tok',
    });
    await flush();
    expect(store.getState().session).toBeNull();
  });

  it('turns game events into notifications', () => {
    const { socket, store } = setup();
    socket.serverEmit(
      'game:update',
      makeUpdate(makeView(), [{ type: 'UNO_CALLED', playerId: 'bob' }]),
    );
    expect(store.getState().toasts.at(-1)?.text).toBe('Bob : UNO !');
  });

  it('a kick clears the room and tells the player', () => {
    const { socket, store } = setup();
    setSession(store, { playerId: 'p1', sessionToken: 'tok', code: 'UNO-ABCD' });
    socket.serverEmit('room:closed', 'kicked');
    expect(store.getState().session).toBeNull();
    expect(store.getState().toasts.at(-1)?.tone).toBe('error');
  });
});
