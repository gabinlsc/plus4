import type { Server, Socket } from 'socket.io';
import {
  botDifficultySchema,
  createRoomPayloadSchema,
  emoteSchema,
  joinRoomPayloadSchema,
  parseGameIntent,
  partialGameSettingsSchema,
  type AckResult,
  type ClientToServerEvents,
  type PlayerId,
  type ServerToClientEvents,
} from '@uno/shared';
import { z } from 'zod';
import type { Room } from '../room/Room';
import type { RoomManager } from '../room/RoomManager';
import { guestsOnly, type Identify } from '../profiles';
import { RateLimiter } from './rateLimiter';

export interface SocketData {
  sessionToken?: string;
}

export type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type UnoSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

export const roomChannel = (code: string) => `room:${code}`;
export const playerChannel = (code: string, playerId: PlayerId) => `player:${code}:${playerId}`;

type AnyAck = (result: AckResult<unknown>) => void;
const tokenSchema = z.string().uuid();

/** Wires every client event to the room manager. All payloads are validated here. */
export function registerHandlers(
  io: UnoServer,
  manager: RoomManager,
  identify: Identify = guestsOnly,
): void {
  /** Live sockets per player: a player may briefly have two (reload, second tab). */
  const socketsByPlayer = new Map<PlayerId, Set<string>>();

  io.on('connection', (socket: UnoSocket) => {
    const limiter = new RateLimiter(30, 15);

    const reply = (ack: unknown, result: AckResult<unknown>) => {
      if (typeof ack === 'function') (ack as AnyAck)(result);
    };

    /** Wraps a handler: rate limiting, ack guarding and crash isolation. */
    const on = <A extends unknown[]>(
      event: keyof ClientToServerEvents,
      handler: (
        args: A,
        ack: unknown,
      ) => AckResult<unknown> | undefined | Promise<AckResult<unknown> | undefined>,
    ) => {
      socket.on(event, (...raw: unknown[]) => {
        const ack = typeof raw[raw.length - 1] === 'function' ? raw.pop() : undefined;
        if (!limiter.take()) return reply(ack, { ok: false, reason: 'RATE_LIMITED' });
        const failed = (error: unknown) => {
          console.error(`[socket] ${event} failed`, error);
          reply(ack, { ok: false, reason: 'INVALID_PAYLOAD' });
        };
        try {
          const result = handler(raw as A, ack);
          if (result instanceof Promise) {
            result.then((value) => value && reply(ack, value), failed);
          } else if (result) {
            reply(ack, result);
          }
        } catch (error) {
          failed(error);
        }
      });
    };

    /** Signed-in players play under their profile pseudo; guests cannot take a pseudo reserved by a profile. */
    const who = async (typed: string) => {
      const id = await identify(socket.handshake.headers.cookie, typed);
      if (id.pid && id.name) return { ok: true as const, name: id.name, pid: id.pid };
      if (!id.guestNameOk) return { ok: false as const, reason: 'NAME_RESERVED' as const };
      return { ok: true as const, name: typed, pid: undefined };
    };

    const current = () => manager.resolve(socket.data.sessionToken);

    const attach = (room: Room, playerId: PlayerId, token: string) => {
      detach();
      socket.data.sessionToken = token;
      void socket.join([roomChannel(room.code), playerChannel(room.code, playerId)]);
      const set = socketsByPlayer.get(playerId) ?? new Set<string>();
      set.add(socket.id);
      socketsByPlayer.set(playerId, set);
      room.connect(playerId);
    };

    /** Unbinds this socket from its room; returns the player if it was their last socket. */
    const detach = (): { room: Room; playerId: PlayerId; last: boolean } | undefined => {
      const ctx = current();
      const token = socket.data.sessionToken;
      delete socket.data.sessionToken;
      if (!ctx || !token) return undefined;
      void socket.leave(roomChannel(ctx.room.code));
      void socket.leave(playerChannel(ctx.room.code, ctx.playerId));
      const set = socketsByPlayer.get(ctx.playerId);
      set?.delete(socket.id);
      const last = !set || set.size === 0;
      if (last) socketsByPlayer.delete(ctx.playerId);
      return { ...ctx, last };
    };

    const withRoom =
      <A extends unknown[]>(
        fn: (room: Room, playerId: PlayerId, ...args: A) => AckResult<unknown>,
      ) =>
      (args: A): AckResult<unknown> => {
        const ctx = current();
        if (!ctx) return { ok: false, reason: 'NOT_IN_ROOM' };
        return fn(ctx.room, ctx.playerId, ...args);
      };

    on<[unknown]>('room:create', async ([payload]) => {
      const parsed = createRoomPayloadSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, reason: 'INVALID_PAYLOAD' };
      const player = await who(parsed.data.playerName);
      if (!player.ok) return player;
      const session = manager.create({ ...parsed.data, playerName: player.name }, player.pid);
      const room = manager.getRoom(session.code);
      if (!room) return { ok: false, reason: 'ROOM_NOT_FOUND' };
      attach(room, session.playerId, session.sessionToken);
      return { ok: true, value: session };
    });

    on<[unknown]>('room:join', async ([payload]) => {
      const parsed = joinRoomPayloadSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, reason: 'INVALID_PAYLOAD' };
      const player = await who(parsed.data.playerName);
      if (!player.ok) return player;
      const joined = manager.join({ ...parsed.data, playerName: player.name }, player.pid);
      if (!joined.ok) return joined;
      const room = manager.getRoom(joined.value.code);
      if (!room) return { ok: false, reason: 'ROOM_NOT_FOUND' };
      attach(room, joined.value.playerId, joined.value.sessionToken);
      return joined;
    });

    on<[unknown]>('room:resume', ([payload]) => {
      const parsed = z.object({ sessionToken: tokenSchema }).strict().safeParse(payload);
      if (!parsed.success) return { ok: false, reason: 'INVALID_PAYLOAD' };
      const ctx = manager.resolve(parsed.data.sessionToken);
      if (!ctx) return { ok: false, reason: 'SESSION_EXPIRED' };
      attach(ctx.room, ctx.playerId, parsed.data.sessionToken);
      return {
        ok: true,
        value: {
          playerId: ctx.playerId,
          sessionToken: parsed.data.sessionToken,
          code: ctx.room.code,
        },
      };
    });

    on('room:leave', () => {
      const ctx = detach();
      if (!ctx) return undefined;
      // Leaving is explicit: other tabs of the same player leave too.
      io.in(playerChannel(ctx.room.code, ctx.playerId)).socketsLeave([
        roomChannel(ctx.room.code),
        playerChannel(ctx.room.code, ctx.playerId),
      ]);
      socketsByPlayer.delete(ctx.playerId);
      ctx.room.leave(ctx.playerId);
      return undefined;
    });

    on<[unknown]>(
      'room:update-settings',
      withRoom((room, playerId, patch: unknown) => {
        const parsed = partialGameSettingsSchema.safeParse(patch);
        if (!parsed.success) return { ok: false, reason: 'INVALID_PAYLOAD' };
        return room.updateSettings(playerId, parsed.data);
      }),
    );

    on<[unknown]>(
      'room:set-ready',
      withRoom((room, playerId, ready: unknown) =>
        typeof ready === 'boolean'
          ? room.setReady(playerId, ready)
          : { ok: false, reason: 'INVALID_PAYLOAD' },
      ),
    );

    on<[unknown]>(
      'room:add-bot',
      withRoom((room, playerId, difficulty: unknown) => {
        const parsed = botDifficultySchema.safeParse(difficulty);
        return parsed.success
          ? room.addBot(playerId, parsed.data)
          : { ok: false, reason: 'INVALID_PAYLOAD' };
      }),
    );

    on<[unknown]>(
      'room:remove-bot',
      withRoom((room, playerId, botId: unknown) =>
        typeof botId === 'string'
          ? room.removeBot(playerId, botId)
          : { ok: false, reason: 'INVALID_PAYLOAD' },
      ),
    );

    on<[unknown]>(
      'room:kick',
      withRoom((room, playerId, target: unknown) => {
        if (typeof target !== 'string') return { ok: false, reason: 'INVALID_PAYLOAD' };
        const result = room.kick(playerId, target);
        if (result.ok) {
          io.in(playerChannel(room.code, target)).socketsLeave([
            roomChannel(room.code),
            playerChannel(room.code, target),
          ]);
          socketsByPlayer.delete(target);
        }
        return result;
      }),
    );

    on(
      'game:start',
      withRoom((room, playerId) => room.start(playerId)),
    );

    on<[unknown]>(
      'game:intent',
      withRoom((room, playerId, raw: unknown) => {
        const intent = parseGameIntent(raw);
        return intent ? room.intent(playerId, intent) : { ok: false, reason: 'INVALID_PAYLOAD' };
      }),
    );

    on(
      'game:rematch',
      withRoom((room, playerId) => room.rematch(playerId)),
    );

    on<[unknown]>(
      'chat:emote',
      withRoom((room, playerId, emote: unknown) => {
        const parsed = emoteSchema.safeParse(emote);
        return parsed.success
          ? room.emote(playerId, parsed.data)
          : { ok: false, reason: 'INVALID_PAYLOAD' };
      }),
    );

    socket.on('disconnect', () => {
      const ctx = detach();
      if (ctx?.last) ctx.room.disconnect(ctx.playerId);
    });
  });
}
