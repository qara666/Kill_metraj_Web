# ── Backend Dockerfile ────────────────────────────────────────────────────────
FROM node:22-alpine

# Install only production dependencies
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# Copy source code
COPY . .

# Create a non-root user and switch to it for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001 -G nodejs && \
    chown -R nodeapp:nodejs /app

USER nodeapp

EXPOSE 5001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:5001/api/health || exit 1

CMD ["node", "simple_server.js"]
