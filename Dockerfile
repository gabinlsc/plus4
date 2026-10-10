# syntax=docker/dockerfile:1.7

# ── Build: install the workspace and build the web client ──────────────────
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/bot/package.json packages/bot/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm --filter @uno/web build
# Production dependencies of the server only.
RUN pnpm --filter @uno/server deploy --prod --legacy /out

# ── Runtime: one Node process serves the API, WebSockets and the web client ──
FROM node:22-alpine
ENV NODE_ENV=production PORT=3001 STATIC_DIR=/app/public
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /app/apps/web/dist ./public
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:${PORT}/health || exit 1
CMD ["node", "--import", "tsx", "src/index.ts"]
