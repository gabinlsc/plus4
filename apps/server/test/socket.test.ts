import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  GameUpdate,
  LobbyState,
  ServerToClientEvents,
  SessionInfo,
} from '@uno/shared';
import { createUnoServer, type UnoServerInstance } from '../src/app';
import { seededRandom } from './fakes';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: UnoServerInstance;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  server = createUnoServer({
    corsOrigins: ['http://localhost'],
    random: seededRandom(3),
    timings: { disconnectGraceMs: 200, roundBreakMs: 50 },
  });
  const port = await server.listen(0);
  url = `http://localhost:${port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await server.close();
});

async function client(): Promise<Client> {
  const c: Client = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.once('connect', () => resolve());
    c.once('connect_error', reject);
  });
  return c;
}

/** Emits with an ack and resolves with the server's answer. */
function call<T>(c: Client, event: string, ...args: unknown[]): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    (c.emit as (e: string, ...a: unknown[]) => void)(event, ...args, resolve);
  });
}

function next<E extends keyof ServerToClientEvents>(
  c: Client,
  event: E,
  predicate: (...args: Parameters<ServerToClientEvents[E]>) => boolean = () => true,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 3000);
    const handler = (...args: Parameters<ServerToClientEvents[E]>) => {
      if (!predicate(...args)) return;
      clearTimeout(timer);
      (c.off as (e: string, h: unknown) => void)(event, handler);
      resolve(args[0]);
    };
    (c.on as (e: string, h: unknown) => void)(event, handler);
  });
}

function unwrap<T>(result: AckResult<T>): T {
  if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);
  return result.value;
}

describe('HTTP', () => {
  it('exposes a health endpoint', async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', rooms: 0 });
    expect((await fetch(`${url}/nope`)).status).toBe(404);
  });
});

describe('online room over Socket.IO', () => {
  it('create → join → start: each player receives their own view', async () => {
    const alice = await client();
    const bob = await client();

    const lobbyAfterCreate = next(alice, 'room:state');
    const host = unwrap(
      await call<SessionInfo>(alice, 'room:create', {
        playerName: 'Alice',
        mode: 'online',
        settings: { allowJumpIn: true, allowStackingDrawCards: true },
      }),
    );
    expect(host.code).toMatch(/^UNO-[2-9A-HJ-NP-Z]{4}$/);
    expect((await lobbyAfterCreate).settings.allowJumpIn).toBe(true);

    const aliceSeesBob = next(alice, 'room:state', (s: LobbyState) => s.seats.length === 2);
    const guest = unwrap(
      await call<SessionInfo>(bob, 'room:join', {
        code: host.code.slice(4).toLowerCase(),
        playerName: 'Bob',
      }),
    );
    expect(guest.code).toBe(host.code);
    expect((await aliceSeesBob).seats.map((s) => s.name)).toEqual(['Alice', 'Bob']);

    expect(await call(bob, 'game:start')).toEqual({ ok: false, reason: 'NOT_HOST' });
    const aliceUpdate = next(alice, 'game:update');
    const bobUpdate = next(bob, 'game:update');
    unwrap(await call(alice, 'game:start'));
    const [a, b] = (await Promise.all([aliceUpdate, bobUpdate])) as [GameUpdate, GameUpdate];
    expect(a.view.me.id).toBe(host.playerId);
    expect(b.view.me.id).toBe(guest.playerId);
    expect(a.view.me.hand).toHaveLength(7);
    expect(a.view.seats.find((s) => s.id === guest.playerId)?.handCount).toBeGreaterThanOrEqual(7);
    expect(JSON.stringify(a)).not.toContain(b.view.me.hand[0]?.id);

    // The current player draws; both players get the transition.
    const current = a.view.currentPlayerId === host.playerId ? alice : bob;
    const view = a.view.currentPlayerId === host.playerId ? a.view : b.view;
    if (view.phase.type === 'AWAITING_PLAY') {
      const otherSees = next(current === alice ? bob : alice, 'game:update');
      unwrap(await call(current, 'game:intent', { type: 'DRAW', expectedVersion: view.version }));
      expect(((await otherSees) as GameUpdate).events.map((e) => e.type)).toContain('CARDS_DRAWN');
    }
  });

  it('rejects malformed payloads and unknown rooms', async () => {
    const c = await client();
    expect(await call(c, 'room:create', { playerName: '', mode: 'online' })).toEqual({
      ok: false,
      reason: 'INVALID_PAYLOAD',
    });
    expect(await call(c, 'room:join', { code: 'UNO-ZZZZ', playerName: 'X' })).toEqual({
      ok: false,
      reason: 'ROOM_NOT_FOUND',
    });
    expect(await call(c, 'game:start')).toEqual({ ok: false, reason: 'NOT_IN_ROOM' });
    unwrap(
      await call(c, 'room:create', {
        playerName: 'Solo',
        mode: 'solo',
        bots: [{ difficulty: 'easy' }],
      }),
    );
    expect(await call(c, 'game:intent', { type: 'HACK' })).toEqual({
      ok: false,
      reason: 'INVALID_PAYLOAD',
    });
    expect(await call(c, 'room:update-settings', { initialHandSize: 1 })).toEqual({
      ok: false,
      reason: 'INVALID_PAYLOAD',
    });
  });

  it('resumes the same seat with the session token after a disconnect', async () => {
    const alice = await client();
    const host = unwrap(
      await call<SessionInfo>(alice, 'room:create', { playerName: 'Alice', mode: 'online' }),
    );
    const bob = await client();
    unwrap(await call<SessionInfo>(bob, 'room:join', { code: host.code, playerName: 'Bob' }));

    const sawDisconnect = next(bob, 'room:state', (s: LobbyState) =>
      s.seats.some((x) => x.id === host.playerId && !x.connected),
    );
    alice.disconnect();
    await sawDisconnect;

    const again = await client();
    const sawReconnect = next(bob, 'room:state', (s: LobbyState) =>
      s.seats.some((x) => x.id === host.playerId && x.connected),
    );
    const resumed = unwrap(
      await call<SessionInfo>(again, 'room:resume', { sessionToken: host.sessionToken }),
    );
    expect(resumed).toEqual(host);
    await sawReconnect;
    expect(
      await call(again, 'room:resume', { sessionToken: '00000000-0000-4000-8000-000000000000' }),
    ).toEqual({
      ok: false,
      reason: 'SESSION_EXPIRED',
    });
  });

  it('a kicked player is notified and loses access', async () => {
    const alice = await client();
    const host = unwrap(
      await call<SessionInfo>(alice, 'room:create', { playerName: 'Alice', mode: 'online' }),
    );
    const bob = await client();
    const guest = unwrap(
      await call<SessionInfo>(bob, 'room:join', { code: host.code, playerName: 'Bob' }),
    );
    const closed = next(bob, 'room:closed');
    unwrap(await call(alice, 'room:kick', guest.playerId));
    expect(await closed).toBe('kicked');
    expect(await call(bob, 'room:set-ready', true)).toEqual({ ok: false, reason: 'NOT_IN_ROOM' });
    expect(await call(bob, 'room:resume', { sessionToken: guest.sessionToken })).toEqual({
      ok: false,
      reason: 'SESSION_EXPIRED',
    });
  });

  it('broadcasts emotes to the room', async () => {
    const alice = await client();
    const host = unwrap(
      await call<SessionInfo>(alice, 'room:create', { playerName: 'Alice', mode: 'online' }),
    );
    const bob = await client();
    unwrap(await call<SessionInfo>(bob, 'room:join', { code: host.code, playerName: 'Bob' }));
    const received = next(bob, 'chat:emote');
    unwrap(await call(alice, 'chat:emote', '🔥'));
    expect(await received).toEqual({ playerId: host.playerId, emote: '🔥' });
    expect(await call(alice, 'chat:emote', 'not-an-emote')).toEqual({
      ok: false,
      reason: 'INVALID_PAYLOAD',
    });
  });

  it('solo game: bots answer through the socket in real time', async () => {
    const c = await client();
    unwrap(
      await call<SessionInfo>(c, 'room:create', {
        playerName: 'Solo',
        mode: 'solo',
        bots: [{ difficulty: 'hard' }],
      }),
    );
    const first = next(c, 'game:update');
    unwrap(await call(c, 'game:start'));
    const update = (await first) as GameUpdate;
    expect(update.view.seats).toHaveLength(2);
    expect(update.view.seats[1]?.isBot).toBe(true);
  });

  it('leaving the last seat closes the room', async () => {
    const c = await client();
    unwrap(await call<SessionInfo>(c, 'room:create', { playerName: 'Solo', mode: 'online' }));
    expect(server.manager.roomCount).toBe(1);
    c.emit('room:leave');
    await new Promise((r) => setTimeout(r, 50));
    expect(server.manager.roomCount).toBe(0);
  });
});
