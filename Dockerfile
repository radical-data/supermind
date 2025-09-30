# ---- build stage ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

# install deps
COPY package*.json ./
RUN npm ci

# build
COPY . .
RUN npm run build

# ---- run stage ----
FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production

# system tools: sqlite3 for one-time schema init
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# only production dependencies at runtime
COPY package*.json ./
RUN npm ci --omit=dev

# bring in built app and the migration SQL
COPY --from=build /app/build ./build
COPY drizzle ./drizzle

# small entrypoint: create DB + tables if missing, then run server
# (DATABASE_URL default goes to /data/app.db – persisted volume)
RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    ': "${DATABASE_URL:=/data/app.db}"' \
    'mkdir -p "$(dirname "$DATABASE_URL")"' \
    '# init only if participants table not present' \
    'if ! sqlite3 "$DATABASE_URL" "SELECT 1 FROM sqlite_master WHERE name='\''participants'\'';" | grep -q 1; then' \
    '  echo "Initializing SQLite schema..."' \
    '  sqlite3 "$DATABASE_URL" < /app/drizzle/0000_amused_inertia.sql || true' \
    'fi' \
    'exec node build/index.js' \
    > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 3000
CMD ["/app/entrypoint.sh"]