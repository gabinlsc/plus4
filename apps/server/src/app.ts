import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { RoomManager } from './room/RoomManager';
import type { RoomTimings } from './room/Room';
import { playerChannel, registerHandlers, roomChannel, type UnoServer } from './socket/handlers';

export interface UnoServerOptions {
  readonly corsOrigins: readonly string[];
  readonly random?: () => number;
  readonly timings?: Partial<RoomTimings>;
}

export interface UnoServerInstance {
  readonly httpServer: HttpServer;
  readonly io: UnoServer;
  readonly manager: RoomManager;
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

export function createUnoServer(options: UnoServerOptions): UnoServerInstance {
  // Transports resolve `io` lazily: rooms are only created once the server is up.
  const manager = new RoomManager({
    transportFor: (code) => ({
      lobby: (state) => io.to(roomChannel(code)).emit('room:state', state),
      game: (playerId, update) => io.to(playerChannel(code, playerId)).emit('game:update', update),
      emote: (playerId, emote) => io.to(roomChannel(code)).emit('chat:emote', { playerId, emote }),
      closed: (playerId, reason) => {
        io.to(playerChannel(code, playerId)).emit('room:closed', reason);
        io.in(playerChannel(code, playerId)).socketsLeave([
          roomChannel(code),
          playerChannel(code, playerId),
        ]);
      },
    }),
    ...(options.random ? { random: options.random } : {}),
    ...(options.timings ? { timings: options.timings } : {}),
  });

  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', rooms: manager.roomCount }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  const io: UnoServer = new Server(httpServer, {
    cors: { origin: [...options.corsOrigins] },
    maxHttpBufferSize: 16 * 1024,
  });
  registerHandlers(io, manager);

  return {
    httpServer,
    io,
    manager,
    listen: (port) =>
      new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => resolve((httpServer.address() as AddressInfo).port));
      }),
    close: async () => {
      manager.dispose();
      await io.close();
    },
  };
}
