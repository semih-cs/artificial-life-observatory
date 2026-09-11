/** Observer stream address. Override with VITE_OBSERVER_WS_URL (see .env.example). */
export const DEFAULT_OBSERVER_WS_URL = 'ws://127.0.0.1:8787/';

export function observerWsUrl(env: { VITE_OBSERVER_WS_URL?: string } = import.meta.env): string {
  const raw = env.VITE_OBSERVER_WS_URL?.trim();
  return raw !== undefined && raw !== '' ? raw : DEFAULT_OBSERVER_WS_URL;
}
