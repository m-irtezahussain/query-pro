# syntax=docker/dockerfile:1.7

FROM node:22.13.1-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY index.html metadata.json tsconfig.json vite.config.ts server.ts ./
COPY src ./src

RUN npm run lint && npm run build

FROM node:22.13.1-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=build --chown=node:node /app/dist ./dist

USER 1000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/server.cjs"]
