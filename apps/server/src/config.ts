import { resolve } from 'node:path';

export interface ServerConfig {
  readonly port: number;
  /** Allowed browser origins for Socket.IO CORS. */
  readonly corsOrigins: readonly string[];
  /** Built web client to serve, if any (resolved against the working directory). */
  readonly staticDir: string | undefined;
  /** Finished games are appended here, one JSON object per line (optional). */
  readonly resultsFile: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  const corsOrigins = (env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const staticDir = env.STATIC_DIR ? resolve(env.STATIC_DIR) : undefined;
  const resultsFile = env.RESULTS_FILE ? resolve(env.RESULTS_FILE) : undefined;
  return { port, corsOrigins, staticDir, resultsFile };
}
