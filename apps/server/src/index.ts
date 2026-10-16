import { createUnoServer } from './app';
import { loadConfig } from './config';
import { createIdentify } from './profiles';
import { fileResultSink } from './results';

const config = loadConfig();
const server = createUnoServer({
  corsOrigins: config.corsOrigins,
  ...(config.staticDir ? { staticDir: config.staticDir } : {}),
  ...(config.resultsFile ? { results: fileResultSink(config.resultsFile) } : {}),
  identify: createIdentify(config.profilesUrl),
});
const port = await server.listen(config.port);
console.log(
  `[uno] server listening on :${port} (CORS: ${config.corsOrigins.join(', ')}` +
    `${config.staticDir ? `, serving ${config.staticDir}` : ''}` +
    `${config.resultsFile ? `, results → ${config.resultsFile}` : ''})`,
);

const shutdown = (signal: string) => {
  console.log(`[uno] ${signal} received, shutting down`);
  server.close().then(
    () => process.exit(0),
    () => process.exit(1),
  );
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
