import { createContext, useContext, type ReactNode } from 'react';
import type { AppState, AppStore } from '../store/store';
import { useAppState } from '../store/store';
import type { GameClient } from './client';

interface AppContextValue {
  readonly store: AppStore;
  readonly client: GameClient;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  store,
  client,
  children,
}: AppContextValue & { readonly children: ReactNode }) {
  return <AppContext.Provider value={{ store, client }}>{children}</AppContext.Provider>;
}

function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppProvider missing');
  return ctx;
}

export function useClient(): GameClient {
  return useAppContext().client;
}

export function useStoreApi(): AppStore {
  return useAppContext().store;
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useAppState(useAppContext().store, selector);
}
