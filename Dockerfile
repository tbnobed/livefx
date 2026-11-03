# syntax=docker/dockerfile:1
# The workspace lockfile supports Linux x86-64 native build dependencies.
FROM --platform=linux/amd64 node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/live-fx-control/package.json artifacts/live-fx-control/package.json
COPY lib/ lib/
COPY scripts/package.json scripts/package.json
RUN pnpm install --frozen-lockfile --filter @workspace/api-server... --filter @workspace/live-fx-control...
COPY tsconfig*.json ./
COPY artifacts/api-server/ artifacts/api-server/
COPY artifacts/live-fx-control/ artifacts/live-fx-control/
RUN pnpm --filter @workspace/api-server run build
RUN NODE_ENV=production PORT=8080 BASE_PATH=/ pnpm --filter @workspace/live-fx-control run build

FROM --platform=linux/amd64 node:24-bookworm-slim AS api
ENV NODE_ENV=production PORT=8080
WORKDIR /app
# The API build bundles JS dependencies and the logger's worker files.
COPY --from=build --chown=node:node /app/artifacts/api-server/dist/ ./dist/
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

FROM --platform=linux/amd64 nginxinc/nginx-unprivileged:stable-alpine AS web
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/artifacts/live-fx-control/dist/public/ /usr/share/nginx/html/
EXPOSE 8080
