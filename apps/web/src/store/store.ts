import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type {
  Card,
  Emote,
  GameEvent,
  GameUpdate,
  LobbyState,
  PlayerId,
  RoomClosedReason,
  SessionInfo,
} from '@uno/shared';

export type Connection = 'connecting' | 'online' | 'offline';
export type ToastTone = 'info' | 'error' | 'success' | 'alert';

export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly tone: ToastTone;
}

export interface PlayedCard {
  readonly card: Card;
  readonly playerId: PlayerId;
  /** Deterministic jitter so the discard pile looks hand-made. */
  readonly rotation: number;
}

export interface Prefs {
  readonly name: string;
  readonly colorblind: boolean;
}

export interface AppState {
  readonly connection: Connection;
  readonly session: SessionInfo | null;
  /** True while a stored session is being resumed after (re)connection. */
  readonly resuming: boolean;
  readonly lobby: LobbyState | null;
  readonly game: GameUpdate | null;
  /** Increments with every server batch; animations key on it. */
  readonly eventSeq: number;
  readonly lastEvents: readonly GameEvent[];
  /** Last few cards played, bottom first, for the discard pile visual. */
  readonly discard: readonly PlayedCard[];
  readonly toasts: readonly Toast[];
  readonly emotes: Readonly<Record<PlayerId, { emote: Emote; seq: number }>>;
  /** Increments to trigger the "invalid action" shake. */
  readonly shake: number;
  readonly closed: RoomClosedReason | null;
  readonly prefs: Prefs;
}

const SESSION_KEY = 'uno.session';
const PREFS_KEY = 'uno.prefs';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode): the app still works, without resume.
  }
}

export function initialState(): AppState {
  return {
    connection: 'connecting',
    session: read<SessionInfo | null>(SESSION_KEY, null),
    resuming: false,
    lobby: null,
    game: null,
    eventSeq: 0,
    lastEvents: [],
    discard: [],
    toasts: [],
    emotes: {},
    shake: 0,
    closed: null,
    prefs: { name: '', colorblind: false, ...read<Partial<Prefs>>(PREFS_KEY, {}) },
  };
}

export type AppStore = StoreApi<AppState>;

export function createAppStore(): AppStore {
  return createStore<AppState>()(() => initialState());
}

// ── Pure updaters (unit-tested) ────────────────────────────────────────────

let toastId = 0;

export function pushToast(store: AppStore, text: string, tone: ToastTone = 'info'): number {
  const id = ++toastId;
  store.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
  setTimeout(() => dismissToast(store, id), tone === 'error' ? 2600 : 3200);
  return id;
}

export function dismissToast(store: AppStore, id: number): void {
  store.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function setSession(store: AppStore, session: SessionInfo | null): void {
  write(SESSION_KEY, session);
  store.setState({ session });
}

export function setPrefs(store: AppStore, patch: Partial<Prefs>): void {
  const prefs = { ...store.getState().prefs, ...patch };
  write(PREFS_KEY, prefs);
  store.setState({ prefs });
}

export function leaveRoomState(store: AppStore, closed: RoomClosedReason | null = null): void {
  setSession(store, null);
  store.setState({ lobby: null, game: null, discard: [], lastEvents: [], emotes: {}, closed });
}

const MAX_DISCARD_VISUAL = 5;

function jitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 25) - 12) * 1.1;
}

/** Applies a server game update: new authoritative view + event-driven visuals. */
export function applyGameUpdate(store: AppStore, update: GameUpdate): void {
  store.setState((s) => {
    let discard = s.discard;
    const newRound = update.events.some((e) => e.type === 'ROUND_STARTED');
    if (newRound || s.game === null) {
      discard = [{ card: update.view.top.card, playerId: '', rotation: 0 }];
    }
    for (const event of update.events) {
      // Reshuffled cards may come back into play: only the top stays on the pile.
      if (event.type === 'DECK_RESHUFFLED') discard = discard.slice(-1);
      if (event.type === 'CARD_PLAYED') {
        discard = [
          ...discard,
          ...event.cards.map((card) => ({
            card,
            playerId: event.playerId,
            rotation: jitter(card.id),
          })),
        ];
      }
    }
    // Keep the visual pile in sync with the authoritative top card.
    if (discard.at(-1)?.card.id !== update.view.top.card.id) {
      discard = [...discard, { card: update.view.top.card, playerId: '', rotation: 0 }];
    }
    return {
      game: update,
      lastEvents: update.events,
      eventSeq: s.eventSeq + 1,
      discard: discard.slice(-MAX_DISCARD_VISUAL),
    };
  });
}

export function receiveEmote(store: AppStore, playerId: PlayerId, emote: Emote): void {
  store.setState((s) => ({
    emotes: { ...s.emotes, [playerId]: { emote, seq: (s.emotes[playerId]?.seq ?? 0) + 1 } },
  }));
}

export function triggerShake(store: AppStore): void {
  store.setState((s) => ({ shake: s.shake + 1 }));
}

// ── React binding ──────────────────────────────────────────────────────────

export function useAppState<T>(store: AppStore, selector: (s: AppState) => T): T {
  return useStore(store, selector);
}
