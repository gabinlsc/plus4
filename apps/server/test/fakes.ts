import type { Emote, GameUpdate, LobbyState, PlayerId, RoomClosedReason } from '@uno/shared';
import type { RoomTransport } from '../src/room/Room';

/** Records everything a room sends, per player. */
export class FakeTransport implements RoomTransport {
  lobbies: LobbyState[] = [];
  updates = new Map<PlayerId, GameUpdate[]>();
  emotes: { playerId: PlayerId; emote: Emote }[] = [];
  closures: { playerId: PlayerId; reason: RoomClosedReason }[] = [];

  lobby(state: LobbyState): void {
    this.lobbies.push(state);
  }
  game(playerId: PlayerId, update: GameUpdate): void {
    const list = this.updates.get(playerId) ?? [];
    list.push(update);
    this.updates.set(playerId, list);
  }
  emote(playerId: PlayerId, emote: Emote): void {
    this.emotes.push({ playerId, emote });
  }
  closed(playerId: PlayerId, reason: RoomClosedReason): void {
    this.closures.push({ playerId, reason });
  }

  lastLobby(): LobbyState {
    const last = this.lobbies.at(-1);
    if (!last) throw new Error('no lobby broadcast yet');
    return last;
  }
  lastUpdate(playerId: PlayerId): GameUpdate {
    const last = this.updates.get(playerId)?.at(-1);
    if (!last) throw new Error(`no game update for ${playerId}`);
    return last;
  }
}

/** Deterministic Math.random replacement. */
export function seededRandom(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
