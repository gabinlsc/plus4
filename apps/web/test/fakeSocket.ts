import type { AckResult } from '@uno/shared';
import type { UnoSocket } from '../src/net/socket';

type Handler = (...args: unknown[]) => void;
type ServerReply = (...args: unknown[]) => AckResult<unknown>;

/** Minimal Socket.IO client double: records emits and lets tests push server events. */
export class FakeSocket {
  connected = false;
  readonly emitted: { event: string; args: unknown[] }[] = [];
  readonly replies = new Map<string, ServerReply>();
  private readonly handlers = new Map<string, Handler[]>();
  readonly io = { on: () => undefined, removeAllListeners: () => undefined };

  on(event: string, handler: Handler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    return this;
  }

  timeout(): { emit: (event: string, ...args: unknown[]) => void } {
    return {
      emit: (event, ...args) => {
        const callback = args.pop() as (err: unknown, result: unknown) => void;
        this.emitted.push({ event, args });
        const reply = this.replies.get(event);
        queueMicrotask(() => callback(null, reply ? reply(...args) : { ok: true, value: null }));
      },
    };
  }

  connect(): this {
    this.connected = true;
    this.serverEmit('connect');
    return this;
  }

  disconnect(): this {
    this.connected = false;
    return this;
  }

  removeAllListeners(): this {
    this.handlers.clear();
    return this;
  }

  serverEmit(event: string, ...args: unknown[]): void {
    for (const h of this.handlers.get(event) ?? []) h(...args);
  }

  asSocket(): UnoSocket {
    return this as unknown as UnoSocket;
  }
}

export const flush = () => new Promise((r) => setTimeout(r, 0));
