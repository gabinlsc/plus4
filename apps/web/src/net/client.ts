import type {
  BotDifficulty,
  CreateRoomPayload,
  Emote,
  GameIntent,
  GameSettings,
  PlayerId,
} from '@uno/shared';
import { describeEvent } from '../lib/events';
import { errorMessage } from '../lib/messages';
import {
  applyGameUpdate,
  leaveRoomState,
  pushToast,
  receiveEmote,
  setSession,
  triggerShake,
  type AppStore,
} from '../store/store';
import { request, type ClientAck, type UnoSocket } from './socket';

type WithoutVersion<I> = I extends { expectedVersion: number } ? Omit<I, 'expectedVersion'> : I;
export type IntentInput = WithoutVersion<GameIntent>;

export interface GameClient {
  createRoom(payload: CreateRoomPayload): Promise<boolean>;
  joinRoom(code: string, playerName: string): Promise<boolean>;
  leaveRoom(): void;
  updateSettings(patch: Partial<GameSettings>): Promise<boolean>;
  setReady(ready: boolean): Promise<boolean>;
  addBot(difficulty: BotDifficulty): Promise<boolean>;
  removeBot(botId: PlayerId): Promise<boolean>;
  kick(playerId: PlayerId): Promise<boolean>;
  start(): Promise<boolean>;
  intent(intent: IntentInput): Promise<boolean>;
  rematch(): Promise<boolean>;
  emote(emote: Emote): void;
  dispose(): void;
}

/** Connects the socket to the store and exposes user actions. */
export function createGameClient(socket: UnoSocket, store: AppStore): GameClient {
  const fail = (reason: Parameters<typeof errorMessage>[0], shake = false) => {
    pushToast(store, errorMessage(reason), 'error');
    if (shake) triggerShake(store);
  };

  const check = <T>(result: ClientAck<T>, shake = false): result is { ok: true; value: T } => {
    if (result.ok) return true;
    fail(result.reason, shake);
    return false;
  };

  const resume = async () => {
    const session = store.getState().session;
    if (!session) return;
    store.setState({ resuming: true });
    const result = await request(socket, 'room:resume', { sessionToken: session.sessionToken });
    store.setState({ resuming: false });
    if (!result.ok) {
      leaveRoomState(store);
      if (result.reason !== 'OFFLINE')
        pushToast(store, 'La partie précédente n’est plus disponible.');
    }
  };

  socket.on('connect', () => {
    store.setState({ connection: 'online' });
    void resume();
  });
  socket.on('disconnect', () => store.setState({ connection: 'offline' }));
  socket.io.on('reconnect_attempt', () => store.setState({ connection: 'connecting' }));
  socket.on('connect_error', () => store.setState({ connection: 'offline' }));

  socket.on('room:state', (lobby) => store.setState({ lobby, closed: null }));
  socket.on('game:update', (update) => {
    applyGameUpdate(store, update);
    const seats = update.view.seats;
    const nameOf = (id: PlayerId) => seats.find((s) => s.id === id)?.name ?? '?';
    for (const event of update.events) {
      const toast = describeEvent(event, nameOf, update.view.me.id);
      if (toast) pushToast(store, toast.text, toast.tone);
    }
  });
  socket.on('room:closed', (reason) => {
    leaveRoomState(store, reason);
    if (reason === 'kicked') pushToast(store, 'Tu as été exclu de la room.', 'error');
    if (reason === 'idle') pushToast(store, 'La room a été fermée pour inactivité.');
  });
  socket.on('chat:emote', ({ playerId, emote }) => receiveEmote(store, playerId, emote));

  const simple = async (promise: Promise<ClientAck<unknown>>) => check(await promise);

  socket.connect();

  return {
    async createRoom(payload) {
      const result = await request(socket, 'room:create', payload);
      if (!check(result)) return false;
      setSession(store, result.value);
      return true;
    },
    async joinRoom(code, playerName) {
      const result = await request(socket, 'room:join', { code, playerName });
      if (!check(result)) return false;
      setSession(store, result.value);
      return true;
    },
    leaveRoom() {
      socket.emit('room:leave');
      leaveRoomState(store);
    },
    updateSettings: (patch) => simple(request(socket, 'room:update-settings', patch)),
    setReady: (ready) =>
      // set-ready has no ack in the protocol: fire and forget.
      Promise.resolve(socket.emit('room:set-ready', ready)).then(() => true),
    addBot: (difficulty) => simple(request(socket, 'room:add-bot', difficulty)),
    removeBot: (botId) => simple(request(socket, 'room:remove-bot', botId)),
    kick: (playerId) => simple(request(socket, 'room:kick', playerId)),
    start: () => simple(request(socket, 'game:start')),
    rematch: () => simple(request(socket, 'game:rematch')),
    async intent(input) {
      const view = store.getState().game?.view;
      if (!view) return false;
      const intent = (
        input.type === 'CALL_UNO' || input.type === 'CATCH_UNO'
          ? input
          : { ...input, expectedVersion: view.version }
      ) as GameIntent;
      return check(await request(socket, 'game:intent', intent), true);
    },
    emote(emote) {
      socket.emit('chat:emote', emote);
    },
    dispose() {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    },
  };
}
