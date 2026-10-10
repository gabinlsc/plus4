import { randomUUID } from 'node:crypto';
import {
  resolveSettings,
  type AckResult,
  type CreateRoomInput,
  type JoinRoomPayload,
  type PlayerId,
  type SessionInfo,
} from '@uno/shared';
import { generateRoomCode } from './codes';
import { Room, type RoomTimings, type RoomTransport } from './Room';

interface Session {
  readonly code: string;
  readonly playerId: PlayerId;
}

export interface RoomManagerOptions {
  readonly transportFor: (code: string) => RoomTransport;
  readonly random?: () => number;
  readonly timings?: Partial<RoomTimings>;
}

/** Registry of rooms and reconnection sessions. Payloads must be validated by the caller. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly sessions = new Map<string, Session>();
  private readonly tokenByPlayer = new Map<PlayerId, string>();

  constructor(private readonly options: RoomManagerOptions) {}

  get roomCount(): number {
    return this.rooms.size;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  session(token: string): Session | undefined {
    return this.sessions.get(token);
  }

  /** Room and player behind a session token, if both are still alive. */
  resolve(token: string | undefined): { room: Room; playerId: PlayerId } | undefined {
    if (!token) return undefined;
    const session = this.sessions.get(token);
    if (!session) return undefined;
    const room = this.rooms.get(session.code);
    if (!room || !room.hasPlayer(session.playerId)) return undefined;
    return { room, playerId: session.playerId };
  }

  create(payload: CreateRoomInput): SessionInfo {
    const code = generateRoomCode((c) => this.rooms.has(c));
    const room: Room = new Room({
      code,
      mode: payload.mode,
      hostName: payload.playerName,
      settings: resolveSettings(payload.settings ?? {}),
      bots: (payload.bots ?? []).map((b) => b.difficulty),
      transport: this.options.transportFor(code),
      hooks: {
        onSeatRemoved: (playerId) => this.revoke(playerId),
        onDisposed: () => this.forget(room),
      },
      ...(this.options.random ? { random: this.options.random } : {}),
      ...(this.options.timings ? { timings: this.options.timings } : {}),
    });
    this.rooms.set(code, room);
    return this.issue(code, room.hostPlayerId);
  }

  join(payload: JoinRoomPayload): AckResult<SessionInfo> {
    const room = this.rooms.get(payload.code);
    if (!room) return { ok: false, reason: 'ROOM_NOT_FOUND' };
    const joined = room.join(payload.playerName);
    if (!joined.ok) return joined;
    return { ok: true, value: this.issue(room.code, joined.value) };
  }

  dispose(): void {
    for (const room of [...this.rooms.values()]) room.dispose('idle');
  }

  private issue(code: string, playerId: PlayerId): SessionInfo {
    const sessionToken = randomUUID();
    this.sessions.set(sessionToken, { code, playerId });
    this.tokenByPlayer.set(playerId, sessionToken);
    return { playerId, sessionToken, code };
  }

  private revoke(playerId: PlayerId): void {
    const token = this.tokenByPlayer.get(playerId);
    if (token) this.sessions.delete(token);
    this.tokenByPlayer.delete(playerId);
  }

  private forget(room: Room): void {
    this.rooms.delete(room.code);
    for (const [token, session] of this.sessions) {
      if (session.code === room.code) {
        this.sessions.delete(token);
        this.tokenByPlayer.delete(session.playerId);
      }
    }
  }
}
