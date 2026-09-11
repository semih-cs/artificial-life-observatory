import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Observatory is a static, read-only client. It talks to the observer
// stream over WebSocket only (VITE_OBSERVER_WS_URL, default ws://127.0.0.1:8787/).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // PixiJS alone is ~530 kB minified; the single-chunk warning is expected.
    chunkSizeWarningLimit: 1000,
  },
});
