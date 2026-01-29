# Supermind

SvelteKit app (Node adapter) with SQLite (Drizzle). Run it locally or in Docker.

## Requirements

- Node 24 + pnpm (Corepack)
- SQLite DB file path via `DATABASE_URL`

## Configure

Copy and edit:

```bash
cp .env.example .env
```

**Minimum:**

```env
DATABASE_URL=/data/app.db
ADMIN_TOKEN=change-me
```

**Optional** (enables OpenAI embeddings + summaries):

```env
LLM_API_KEY=...
EMBED_MODEL=text-embedding-3-small
SUMMARY_MODEL=gpt-4o-mini
```

## Develop

```bash
pnpm install
pnpm run db:push
pnpm run dev
```

## Build & run

```bash
pnpm run build
node build/index.js
```

## Docker

```bash
docker build . -t supermind
docker run -p 3000:3000 \
  -e DATABASE_URL=/data/app.db \
  -e ADMIN_TOKEN=... \
  -v /path/to/data:/data \
  supermind
```

## Useful scripts

- `pnpm run check`
- `pnpm run typecheck`
- `pnpm run fmt`
