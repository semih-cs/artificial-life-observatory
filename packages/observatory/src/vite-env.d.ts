/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Observer WebSocket URL. Default: ws://127.0.0.1:8787/ */
  readonly VITE_OBSERVER_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
