# syntax=docker/dockerfile:1

# One image: Express serves /api and the built Angular client (spec §7 Deployment).
FROM node:24.21.0-bookworm-slim AS base
# CI=true: non-interactive Angular CLI; lefthook's postinstall skips hook install.
ENV CI=true
RUN npm install -g pnpm@10.34.6
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm fetch --frozen-lockfile
COPY . .
# The root `prepare` script builds @sweep/core during install.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline
RUN pnpm build
# pnpm 10 deploy needs --legacy because workspace packages are not injected (see ADR 0013).
RUN pnpm --filter @sweep/server deploy --legacy --prod /out/server \
 && cp -r packages/client/dist/client/browser /out/public

FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    CLIENT_DIST_DIR=/app/public
WORKDIR /app
COPY --from=build --chown=node:node /out/server ./server
COPY --from=build --chown=node:node /out/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server/dist/index.js"]
