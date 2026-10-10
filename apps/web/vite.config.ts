import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const serverUrl = process.env.UNO_SERVER_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
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
