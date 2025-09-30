# ---- build stage ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV DATABASE_URL=/tmp/build.db

# Native build deps for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install deps (dev deps included for Svelte/Vite build)
COPY package*.json ./
# Help node-gyp find Python
ENV npm_config_python=python3
RUN npm ci

# Build the SvelteKit app
COPY . .
RUN npm run build

# Trim dev deps so runtime is small
RUN npm prune --omit=dev

# ---- run stage ----
FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production

# sqlite3 CLI for one-time schema init
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Bring in production node_modules and built app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/build ./build
COPY drizzle ./drizzle

# Entry: ensure DB & tables exist, then run server
RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    ': "${DATABASE_URL:=/data/app.db}"' \
    'mkdir -p "$(dirname "$DATABASE_URL")"' \
    'if ! sqlite3 "$DATABASE_URL" "SELECT 1 FROM sqlite_master WHERE name='\''participants'\'';" | grep -q 1; then' \
    '  echo "Initializing SQLite schema..."' \
    '  sqlite3 "$DATABASE_URL" < /app/drizzle/0000_amused_inertia.sql || true' \
    'fi' \
    'exec node build/index.js' \
    > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 3000
CMD ["/app/entrypoint.sh"]