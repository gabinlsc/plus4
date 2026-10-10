/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game server URL. Defaults to the page origin (proxied in development). */
  readonly VITE_SERVER_URL?: string;
}
