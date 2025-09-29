# Supermind

**Purpose:** a 20-minute, in-room exercise where **30 people** submit one short line each, watch a **live "brain"** form on screen, and see an **AI summary** of themes, tensions, and outliers. Optional: show each person a **most-similar match** to spark conversations later.

AI is the **facilitator/connector**, not a replacement.

## TL;DR

- **Participants (phones):** scan QR → pick table (A/B) → **submit one short line**.
- **Big screen:** the **graph** grows live; then a **summary** appears (themes, contradictions, outliers).
- **Optional:** each phone shows a **suggested match** across tables.

Time budget (suggested): **Join 1’ • Submit 2’ • Watch graph 1’ • Summary 1’ • (Optional) Match 1’**.

## Architecture

- **SvelteKit (Node adapter)** — single runtime (no Docker, no Python), easy on hotel Wi‑Fi.
- **SQLite + Drizzle** — local, fast, WAL-enabled.
- **SSE (Server-Sent Events)** — push `graph` + `summary` (and `matches`) to clients.
- **LLM** — one JSON-only call for summary; **embeddings** for links & matching.

```
phones → /api/join + /api/submit ─┐
                                  ├─ DB (SQLite) → build embeddings → broadcast via SSE → visualiser
facilitator → /api/summary ───────┘
```

## Data model (Drizzle / SQLite)

- **participants**: `id`, `name`, `tableSide` ('A'|'B'), `createdAt`
- **runs**: `id`, `createdAt`, `clustersJson?`, `optionsJson?`, `pairsJson?`
- **submissions**: `id`, `runId`, `participantId`, `kind` (default `'triad'`), `payloadJson`, `createdAt`  
  _Unique_: (`runId`,`participantId`,`kind`)
- **normalised**: `submissionId` (PK), `dataJson`, `embeddingJson?`
- **votes** (optional): composite PK (`runId`,`participantId`), `value 0..100`, `tableSide`, `createdAt`

> For the sprint we only need **participants**, **submissions**, **normalised** (with `embeddingJson`). **runs** is used to keep sessions separate. **votes** is there if you later add the A/B slider.

## HTTP & SSE interface

**Already in repo (MVP):**

- `POST /api/join` → `{ participantId }`
- `POST /api/submit` → stores submission, normalises, (now) embeds, then broadcasts counts/graph
- `GET  /api/stream` (SSE) → emits:
  - `event: submission_count` → `{ count }`
  - `event: graph` → `{ nodes:[{id,label,table}], links:[{source,target,value}] }`
  - (later) `event: summary`, `event: matches`
- `POST /api/vote` + `GET /api/vote/medians` (optional, unused in this sprint)

**To add (short tasks):**

- `POST /api/summary` → runs one LLM call across all submissions → broadcasts `summary`
- `POST /api/match` (optional) → cross-table nearest-neighbour pairs → broadcasts `matches`

## LLM contracts (strict JSON)

### 1) **Summary** (one call per exercise)

Input (server assembles):

```json
[
	{ "id": 12, "text": "..." },
	{ "id": 7, "text": "..." }
]
```

System prompt (essence):

> Cluster 30 short lines about "AI & logistics" into **3–6 themes**, list **clear contradictions** and **1–2 outliers**. **Return ONLY valid JSON**:

```json
{
  "themes":[{"label":"...", "why":"...", "members":[12,7, ...]}],
  "contradictions":[{"a":12, "b":7, "explain":"..."}],
  "outliers":[{"participantId":3, "explain":"..."}],
  "stats":{"count":30}
}
```

On parse failure: **retry once**, then **fallback** to heuristic (k-means on embeddings for themes; farthest points for outliers).

### 2) **Matching** (no LLM)

- Use **cosine similarity** on embeddings.
- Prefer **A↔B** matches (cross-table).
- Greedy pairing; allow "no match" if below threshold.

## Visuals

- **Graph:** `force-graph` (2D). Nodes coloured by table. Links when `cosine >= threshold` (start ~**0.78**, tune live). Limit each node to **top-3** links to avoid hairballs.
- **Summary view:** Right panel lists **themes** and **tensions**. (Nice-to-have: draw soft hulls around theme members.)

## Local development

### Prereqs

- Node **≥ 20**
- SQLite (bundled with better-sqlite3)
- An LLM key (for summary + embeddings) — e.g. `OPENAI_API_KEY`

### Environment

```
cp .env.example .env
# edit:
DATABASE_URL=/data/app.db           # or ./local.db
LLM_API_KEY=sk-...
```

### Install & DB

```bash
npm install
npm run db:push
npm run dev
```

Open:

- **Participants**: `http://localhost:5173/join`
- **Facilitator**: `http://localhost:5173/visualiser` and `http://localhost:5173/control`

## Event-day playbook (Hotel Arena, 2 long tables)

### Pre-event checklist (10 mins)

- ✅ Laptop on mains power; **Do Not Sleep**.
- ✅ Local network stable (hotspot fallback ready).
- ✅ `.env` set; app running (`npm run dev` or `node build`).
- ✅ Big screen on **/visualiser**.
- ✅ Print two QR codes:
  - Table A → `/join?table=A`
  - Table B → `/join?table=B`
- ✅ Threshold set (start **0.78**); test with 3 dummy submissions.

### Live run (6–8 mins exercise)

1. **Join (1 min)**  
   "Scan the QR, type your **first name**, select **your table**."
2. **Submit (2 mins)**  
   Prompt on screen:
   > "In one short line, share a **fact, fear, or hope** about AI in logistics."
3. **Graph (1 min)**  
   Narrate what they see: similar ideas linking, two tables mixing.
4. **Summary (1–2 mins)**  
   Tap **Summarise** on `/control`. Read out **3–6 themes**, **key tension(s)**, **1–2 outliers**.
5. **(Optional) Match (1 min)**  
   Tap **Match** on `/control`. Each phone shows a cross-table match. Invite them to connect after dessert.

### Fail-safes

- If LLM is slow: continue speaking over the **live graph**; trigger summary once.
- If SSE drops: refresh the visualiser; clients keep submitting (HTTP still works).
- If Wi‑Fi fails: use your phone’s hotspot (no external internet needed if embeddings are pre-enabled or stubbed).

## Operator pages

- `/visualiser` — big screen.
- `/control` — buttons: **Show Graph** (default), **Summarise**, **Show Matches** (optional).
- `/join` — phone page (query param `?table=A|B` preselects side).
- `/input` — phone submission page (1 text field).
- `/vote` — **not used** for this sprint (kept for future A/B).

## Configuration knobs

- **SIM_THRESHOLD** (cosine) — start `0.78`, adjust to control density.
- **TOP_K_LINKS** per node — start `3`.
- **MAX_INPUT_LEN** — 120 chars (guard rail).
- **RUN_RESET** — optional `/api/admin/reset` if you want to wipe mid-rehearsal.

## Privacy

- Store **first name** and one **short line**.
- No emails, no phone numbers.
- Data is **ephemeral**; a JSON dump is kept locally for post-event notes. Delete after.

## Roadmap

- [x] Join / Submit
- [x] SSE bus
- [x] Graph from embeddings
- [ ] `/api/summary` (LLM JSON + heuristic fallback)
- [ ] `/api/match` (cross-table)
- [ ] Visualiser: summary panel + (optional) hulls
- [ ] Control page buttons
- [ ] QR param preselect (`?table=A|B`)
- [ ] JSON data dump on exit

## Definition of done (for the event)

- Participants can **join**, **submit** a line, and see the **graph** react live.
- Facilitator can press **Summarise** and a **valid JSON** summary is shown on screen within ~10s.
- (Optional) Everyone sees a **cross-table match** on their phone.
- The whole flow runs on a **single laptop** with flaky hotel Wi‑Fi.

## Licence

Private, event use. © You.
