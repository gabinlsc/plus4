import { io, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '@uno/shared';
import type { ClientError } from '../lib/messages';

export type UnoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ClientAck<T> = AckResult<T> | { readonly ok: false; readonly reason: ClientError };

export function createSocket(url: string | undefined = import.meta.env.VITE_SERVER_URL): UnoSocket {
  const options = { autoConnect: false, transports: ['websocket'] };
  return url ? io(url, options) : io(options);
}

type EventsWithAck = {
  [E in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[E]> extends [
    ...infer _A,
    (result: AckResult<infer _T>) => void,
  ]
    ? E
    : never;
}[keyof ClientToServerEvents];

type AckValue<E extends EventsWithAck> =
  Parameters<ClientToServerEvents[E]> extends [...infer _A, (result: AckResult<infer T>) => void]
    ? T
    : never;

type ArgsOf<E extends EventsWithAck> =
  Parameters<ClientToServerEvents[E]> extends [...infer A, (result: AckResult<infer _T>) => void]
    ? A
    : never;

/** Emits an event and resolves with the server ack (or a client-side error). */
export function request<E extends EventsWithAck>(
  socket: UnoSocket,
  event: E,
  ...args: ArgsOf<E>
): Promise<ClientAck<AckValue<E>>> {
  if (!socket.connected) return Promise.resolve({ ok: false, reason: 'OFFLINE' });
  const timed = socket.timeout(5000) as unknown as {
    emit(event: string, ...rest: unknown[]): void;
  };
  return new Promise((resolve) => {
    timed.emit(event, ...args, (err: unknown, result: AckResult<AckValue<E>>) => {
      resolve(err ? { ok: false, reason: 'TIMEOUT' } : result);
    });
  });
}
