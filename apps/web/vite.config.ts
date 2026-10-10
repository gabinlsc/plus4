import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const serverUrl = process.env.UNO_SERVER_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  build: {
    // Single-screen game app (~165 kB gzipped): one bundle is the right trade-off.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    // Same-origin in development: the client talks to /socket.io, proxied to the game server.
    proxy: { '/socket.io': { target: serverUrl, ws: true } },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});
