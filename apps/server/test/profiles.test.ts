import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  ServerToClientEvents,
  SessionInfo,
} from '@uno/shared';
import { createUnoServer, type UnoServerInstance } from '../src/app';
import { createIdentify, type Identify } from '../src/profiles';
import { seededRandom } from './fakes';

const PID = '0123456789abcdef';

/** A stand-in for the profiles service: cookie "glsc_sid=GOOD…" is Gabin; pseudo "gabin" is reserved. */
function fakeProfiles(handler?: (body: { cookie: string; name: string }) => unknown) {
  const seen: { cookie: string; name: string }[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      const body = JSON.parse(raw) as { cookie: string; name: string };
      seen.push(body);
      const out = handler
        ? handler(body)
        : body.cookie.includes('glsc_sid=GOOD')
          ? { pid: PID, name: 'Gabin' }
          : { pid: null, guestNameOk: body.name.toLowerCase() !== 'gabin' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  return new Promise<{ url: string; seen: typeof seen; close: () => void }>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        seen,
        close: () => server.close(),
      }),
    ),
  );
}

describe('createIdentify', () => {
  it('recognises a profile, and tells a guest whether their pseudo is free', async () => {
    const svc = await fakeProfiles();
    const identify = createIdentify(svc.url);
    expect(await identify('a=1; glsc_sid=GOOD123', 'Mallory')).toEqual({
      pid: PID,
      name: 'Gabin',
      guestNameOk: true,
    });
    expect(await identify(undefined, 'gabin')).toEqual({
      pid: null,
      name: null,
      guestNameOk: false,
    });
    expect(await identify('glsc_sid=BAD', 'Léa')).toEqual({
      pid: null,
      name: null,
      guestNameOk: true,
    });
    expect(svc.seen[0]?.cookie).toBe('a=1; glsc_sid=GOOD123');
    svc.close();
  });

  it('never blocks a game: unreachable, slow, failing or garbled service means guest', async () => {
    const guest = { pid: null, name: null, guestNameOk: true };
    expect(await createIdentify(undefined)('glsc_sid=GOOD', 'Gabin')).toEqual(guest);
    expect(await createIdentify('http://127.0.0.1:1')('glsc_sid=GOOD', 'Gabin')).toEqual(guest);
    const slow = await fakeProfiles(() => new Promise(() => undefined) as unknown);
    expect(await createIdentify(slow.url, 100)('glsc_sid=GOOD', 'Gabin')).toEqual(guest);
    slow.close();
    for (const garbage of [
      { pid: 'nope', name: 'x' },
      { pid: PID },
      { pid: PID, name: 'x'.repeat(40) },
      'text',
    ]) {
      const svc = await fakeProfiles(() => garbage);
      expect(await createIdentify(svc.url)('glsc_sid=GOOD', 'Gabin')).toEqual(
        garbage === 'text' ? guest : { ...guest },
      );
      svc.close();
    }
  });
});

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let server: UnoServerInstance;
let url: string;
let profiles: Awaited<ReturnType<typeof fakeProfiles>>;
const clients: Client[] = [];

beforeEach(async () => {
  profiles = await fakeProfiles();
  const identify: Identify = createIdentify(profiles.url);
  server = createUnoServer({
    corsOrigins: ['http://localhost'],
    random: seededRandom(3),
    identify,
  });
  url = `http://localhost:${await server.listen(0)}`;
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await server.close();
  profiles.close();
});

async function client(cookie?: string): Promise<Client> {
  const c: Client = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    ...(cookie ? { extraHeaders: { cookie } } : {}),
  });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.once('connect', () => resolve());
    c.once('connect_error', reject);
  });
  return c;
}
const call = <T>(c: Client, event: string, ...args: unknown[]) =>
  new Promise<AckResult<T>>((resolve) => {
    (c.emit as (e: string, ...a: unknown[]) => void)(event, ...args, resolve);
  });

describe('profiles over Socket.IO', () => {
  it('a signed-in player takes their profile pseudo, whatever the client sent', async () => {
    const alice = await client('glsc_sid=GOOD1');
    const lobby = new Promise<{ seats: { name: string }[] }>((resolve) =>
      alice.once('room:state', resolve as never),
    );
    const created = await call<SessionInfo>(alice, 'room:create', {
      playerName: 'Mallory',
      mode: 'online',
    });
    expect(created.ok).toBe(true);
    expect((await lobby).seats.map((p) => p.name)).toEqual(['Gabin']);
  });

  it('a guest cannot take a pseudo reserved by a profile, to create or to join', async () => {
    const host = await client('glsc_sid=GOOD1');
    const room = await call<SessionInfo>(host, 'room:create', { playerName: 'x', mode: 'online' });
    if (!room.ok) throw new Error('no room');
    const guest = await client();
    expect(await call(guest, 'room:create', { playerName: 'GABIN', mode: 'online' })).toEqual({
      ok: false,
      reason: 'NAME_RESERVED',
    });
    expect(await call(guest, 'room:join', { code: room.value.code, playerName: 'gabin' })).toEqual({
      ok: false,
      reason: 'NAME_RESERVED',
    });
    expect((await call(guest, 'room:join', { code: room.value.code, playerName: 'Léa' })).ok).toBe(
      true,
    );
  });

  it('without a profile service, everyone plays as before', async () => {
    const plain = createUnoServer({ corsOrigins: ['http://localhost'] });
    const port = await plain.listen(0);
    const c: Client = connect(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    clients.push(c);
    await new Promise<void>((r) => c.once('connect', () => r()));
    expect((await call(c, 'room:create', { playerName: 'Gabin', mode: 'online' })).ok).toBe(true);
    c.disconnect();
    await plain.close();
  });
});
