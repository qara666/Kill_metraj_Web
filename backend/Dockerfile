FROM node:22-alpine AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# ── Install ALL deps (dev + prod) ────────────────────────────
FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Production image ─────────────────────────────────────────
FROM base AS production

# Copy node_modules from deps and prune to prod-only
COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules /app/node_modules

# Prune devDependencies (no build scripts triggered)
RUN pnpm prune --prod 2>/dev/null || true

COPY . .

RUN mkdir -p logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001 -G nodejs && \
    chown -R nodeapp:nodejs /app

USER nodeapp

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:5001/health/readiness || exit 1

STOPSIGNAL SIGTERM

CMD ["node", "simple_server.js"]
