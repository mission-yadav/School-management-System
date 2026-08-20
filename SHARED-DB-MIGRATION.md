# Shared Database Migration — Roadmap

## STATUS: BUILD SUCCEEDED — awaiting user test + publish (2026-08-19)
CI build v1.1.0 is green. Draft release created with `Janaki-School-Setup-1.1.0.exe` (87 MB) +
`.blockmap` + `latest.yml`. Releases page:
https://github.com/mission-yadav/School-management-System/releases
LAST STEPS (user): download the draft .exe -> install on a Windows PC -> confirm it shows real
data (138 students) from Neon -> click "Publish release" -> existing devices auto-update to 1.1.0.
Also: merge PR #1 (feat/shared-neon-db -> main) so main matches the released tag.

CI gotchas solved along the way (keep in mind for future builds):
- Prisma client must be generated BEFORE tsc (fixed ordering in workflow + build scripts).
- Don't use electron-builder's GitHub publisher here (it hung); build with --publish never and
  upload via gh release. Job has timeout-minutes: 30.
- npm links the root pkg (name "sms") into node_modules/sms -> points at repo root -> release/
  win-unpacked -> electron-builder packed its own output recursively (30-min 7-Zip hang). Workflow
  removes self-links + stale release/ before building; files excludes node_modules/sms + release.

## PROGRESS (branch: `feat/shared-neon-db`)
- ✅ **Phase 1 done** — schema.prisma flipped to `postgresql` + `directUrl`; client regenerated; validates.
- ✅ **Phase 2 done** — removed the SQLite PRAGMA `ensureSchema()` hack from `server/src/index.ts`;
  updated `server/.env.example`; gitignored `electron/db.runtime.json`.
- ✅ **Phase 4 code done** — `electron/main.cjs` now reads DB URL + JWT secrets from a build-time
  `db.runtime.json` (gitignored) with env fallback; removed the seed.db/local-file logic; friendly
  "check your internet" startup error. `build-desktop.sh`/`.bat` generate `db.runtime.json`;
  electron-builder bundles it.
- ✅ **Phase 0 done** — Neon project created (region ap-southeast-1 Singapore, db `neondb`).
  Connection strings in gitignored `server/.env`. NOTE: currently using the DIRECT endpoint for
  both url + directUrl; still want the POOLED (`-pooler`) URL for the app runtime `DATABASE_URL`.
- ✅ **Phase 3 done + verified** — REAL source of truth is `server/prisma/dev.db` (138 students /
  129 payments), NOT the stale Aug-14 `export.json` (only 53 students). Migrated dev.db -> Neon via
  a Prisma-to-Prisma copy (`server/prisma/migrate-devdb-to-neon.ts` + a temp SQLite client from
  `sqlite-src.prisma`), so SQLite dates(ms)/booleans(0/1)/JSON-text convert correctly. Then
  `reset-sequences.sql`. Verified on Neon: 138 students, 138 parents, 138 invoices, 754 fee items,
  129 payments (₹414,245 total), 14 classes; sequences safe; server boots + login route works.
  NOTE: Neon free tier auto-suspends -> first connection can throw P1001; just retry to wake it.
  To RE-RUN before go-live (dev.db changes): `prisma db push --force-reset` (retry on P1001) ->
  confirm empty -> `tsx prisma/migrate-devdb-to-neon.ts` -> `reset-sequences.sql`.
- ✅ **Build pipeline chosen = GitHub Actions** (wine won't install on this Mac: needs sudo +
  wine-stable is deprecated/Gatekeeper-blocked). Added `.github/workflows/desktop-release.yml`
  (builds on windows-latest, publishes a DRAFT GitHub Release on `v*` tags). Version bumped to
  1.1.0. All committed + pushed to branch `feat/shared-neon-db`.
- ⏳ **Phase 6/7 remaining (user + me):**
  1. `gh auth login` (interactive — user runs via `!`). [git push already works via stored creds]
  2. Get the POOLED Neon URL; set it as the `DATABASE_URL` secret (directUrl stays direct).
  3. I set 3 repo secrets from server/.env via `gh secret set` (DATABASE_URL, JWT_ACCESS_SECRET,
     JWT_REFRESH_SECRET) — same values baked into every build.
  4. Merge branch -> main, tag `v1.1.0`, push tag -> CI builds + creates a DRAFT release.
  5. Download the draft's .exe, TEST on a Windows machine against Neon, then click "Publish
     release" -> existing devices auto-update to the shared-DB version.

### Build-time env (for build-desktop.sh) — keep these consistent across ALL builds
Every installer must bake the SAME `DATABASE_URL` + `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET`
(so tokens work across devices/updates). They currently live in gitignored `server/.env`; reuse
those exact values for the build (export them before running build-desktop.sh).

### De-risking discoveries (make this easier than first assumed)
- The project was ORIGINALLY PostgreSQL (converted to SQLite for desktop). `.env.example` +
  `import-data.ts` still speak Postgres. We're moving it back to its native habitat.
- **Case-insensitive search already handled** — `students.ts:134` + `search.ts:18` already use
  `mode: 'insensitive'` (works natively on Postgres). Phase 5's main worry is a no-op.
- **Receipt numbers are NOT `max+1`** — `fees.ts:369` uses `RCPT+timestamp+random`, `@unique`-guarded.
  Concurrency risk is minimal; no change needed.
- **JWT secrets fell back to public defaults** (`jwt.ts:6-7`) in the packaged app. Now injected as
  real random secrets via `db.runtime.json` (important once the DB is internet-reachable).

---



> **Goal:** Move from a per-device local SQLite database to ONE shared cloud database,
> so every device sees the same data and edits can be made from anywhere.
> **Hard constraint:** zero ongoing cost.
>
> _This file is the resume point. If the working session is lost, start from the phase
> marked "NEXT" below._

---

## Decision (locked)

**Chosen approach: keep the Electron desktop app as-is; move ONLY the database
from local SQLite → one shared cloud Postgres on Neon.**

Each device keeps running its own local Express server (forked by Electron, as it does
today). The only change is that the server connects to a shared cloud database instead
of a local file.

### Why this approach
- **Zero hosting cost / zero cold starts** — we do NOT host the API. Only the DB moves
  to the cloud. Neon's free tier doesn't expire and wakes in ~1s (unlike Render's free
  Postgres, which expires, and Render's free web service, which sleeps ~60s).
- **Windows 7 keeps working** — the Electron 22 shell is untouched (Electron 22 is the
  last line that runs on Win7; a modern React 19 UI won't run in Win7's old browsers).
- **Least work** — mostly a Prisma provider swap + connection-string change. The app
  code barely changes.
- **Current DB is ~364 KB**; Neon free tier is 0.5 GB — years of headroom.

### The one accepted trade-off
The DB password lives inside the distributed desktop app, so someone with the installer
could extract it and connect to the DB directly. Acceptable for a small set of trusted
school machines. **Note:** access is intended to be GLOBAL (different countries), which
means the DB is reachable from anywhere on the public internet — so this trade-off carries
a bit more weight than a LAN-only setup would. **Upgrade path (if ever needed):** host the
Express API centrally behind the existing JWT auth so devices never touch the DB directly.
Nothing built here gets thrown away in that upgrade.

### Windows 7 is a HARD constraint (do not violate)
Every decision must favor Windows 7 compatibility. Consequences:
- **Keep the Electron desktop app** (installed `.exe`) — it bundles a modern Chromium, the
  only reliable way to render the React 19 / Tailwind 4 UI on Win7.
- **Browser-only / hosted-web-app approach is REJECTED** — a modern browser app won't render
  on Win7's old browsers (old Chrome / IE11). Considered on 2026-08-19 and ruled out for
  this reason. Do not re-propose it.
- Electron stays pinned at 22.x (last line supporting Win7).

### Also understood (not in scope of this migration)
- **Data sharing is near-real-time, not live.** The app fetches on screen load
  (`useFetch`, no websockets). Device B sees Device A's change on next reload — fine for
  a school. True live updates would be extra work.
- **Feature/code updates are a SEPARATE system.** New features reach devices via the
  existing electron-updater + GitHub Releases auto-update pipeline — unrelated to the DB.
  This migration does not touch it; it keeps working.
- **Every device now needs internet.** If the connection drops, the app stops (no offline
  mode). Offline + sync was considered and rejected as too complex for now.

---

## Tools

### New (the only genuinely new infrastructure)
- **Neon** — free-tier cloud PostgreSQL. The single shared database.
- **PostgreSQL 16** — the engine Neon runs.
- **`@prisma/adapter-neon` + `@neondatabase/serverless`** — OPTIONAL Neon serverless
  driver (HTTP/WebSocket instead of raw TCP; nicer with pooling / flaky networks).
  Decision still open: use this adapter vs a plain direct Postgres TCP connection.

### Reused (already in the project, just repointed)
- **Prisma ORM** (5.4.2) — `provider` flips `sqlite` → `postgresql`, pointed at Neon.
- **Prisma Migrate** — adopted properly (currently NOT used; see Phase 2).
- **Express server** — unchanged, still forked locally per device.
- **Electron** (22.3.27) + **electron-builder** + **electron-updater** — unchanged.
- **`server/prisma/import-data.ts` + `server/prisma/seed-data/export.json`** — reused to
  load real data into Neon (Phase 3).
- **React 19 client** — unchanged.

### Connection config detail
Neon + Prisma uses TWO URLs (standard practice):
- **Pooled URL** (`...-pooler...`) → the running app (`url` in schema.prisma).
- **Direct URL** (unpooled) → migrations (`directUrl` in schema.prisma; the pooler can't
  run migrations).
Both connection strings need `sslmode=require`.

---

## Current-state facts (so we don't re-discover them)
- DB today: **SQLite** via Prisma. Schema at `server/prisma/schema.prisma`
  (native + windows binaryTargets — KEEP windows, the packaged app needs the Windows
  query engine to talk to Postgres too).
- `DATABASE_URL` is set by **`electron/main.cjs`** to a local `file:` path in the user's
  AppData; on first run it copies `server/prisma/seed.db` there.
- Real school data lives in `server/prisma/dev.db` (excluded from the installer).
  A JSON dump exists at `server/prisma/seed-data/export.json`.
- **There are NO Prisma migration files.** Instead, `server/src/index.ts` runs a
  lightweight "ALTER TABLE if column missing" (PRAGMA) hack at startup — SQLite-specific,
  must be removed in Phase 2.
- Fee logic (the app's core): `server/src/lib/ledger.ts`, routes in
  `server/src/routes/fees.ts`, PDFs in `server/src/routes/pdf.ts`.
- Versioning lives only in `electron/package.json` (currently 1.0.6).

---

## Roadmap (phased)

### Phase 0 — Set up Neon  ◀ NEXT
- [ ] Create a free Neon account + project/database.
- [ ] **Pick region closest to most devices — Singapore or Mumbai** (school is in Nepal).
      Access is global (works from any country); region only affects latency.
- [ ] Copy the **pooled** and **direct** connection strings (with `sslmode=require`).
- [ ] Decide: separate Neon DB for dev vs the school's production DB (recommended: yes).
- [ ] **Verify current Neon free-tier limits** (storage, compute hours, connection caps)
      before relying on them — terms change.

### Phase 1 — Convert Prisma schema SQLite → Postgres
- [ ] `datasource` `provider` → `postgresql`; add `url` + `directUrl`.
- [ ] Keep `binaryTargets` including windows.
- [ ] Audit schema for SQLite-lenient bits: native enums, defaults, JSON-as-text fields
      (e.g. `Setting.value`).

### Phase 2 — Adopt real Prisma migrations
- [ ] Remove the startup ALTER/PRAGMA hack in `server/src/index.ts`.
- [ ] Generate a clean initial migration; create all tables/enums on Neon
      (`prisma migrate deploy` / `db push` via the direct URL).

### Phase 3 — Move real data across
- [ ] Back up `dev.db` first.
- [ ] Point Prisma at Neon; run `import-data.ts` to load `seed-data/export.json`.
- [ ] Verify row counts + foreign-key integrity.

### Phase 4 — Point the app at Neon
- [ ] `electron/main.cjs`: set `DATABASE_URL` to the Neon connection string; remove the
      first-run `seed.db` copy / local `file:` logic.
- [ ] Decide where the connection string is stored (build-time env baked into the app).

### Phase 5 — Code audit for Postgres differences  ⚠ easy to overlook, painful in prod
- [ ] **Case-insensitive search:** SQLite `LIKE` ignores case, Postgres doesn't. Grep all
      search queries (students, global search) and add Prisma `mode: 'insensitive'`.
- [ ] **Concurrency / race conditions** (never mattered with one user per DB):
  - [ ] Receipt-number generation — if it's `max + 1`, two simultaneous payments collide
        on unique `receiptNo`. Wrap in a transaction or use a DB sequence.
  - [ ] Billing-period advance — two devices could accrue the same month twice. Guard it.
- [ ] Remove/replace any SQLite-specific raw SQL / PRAGMA.

### Phase 6 — Test
- [ ] Run two app instances against Neon at once; exercise fees, payments, PDFs, imports.
- [ ] Test the PACKAGED Windows build against Neon (not just local dev).

### Phase 7 — Release & roll out
- [ ] Load the school's live data into Neon (Phase 3, for real).
- [ ] Bump version in `electron/package.json`; build installer; publish to GitHub Releases
      (auto-update delivers it to devices).

### Phase 8 — Backups
- [ ] Set up a periodic export from Neon (independent of Neon's own PITR).

---

## Trickiest parts (where to be careful)
1. **Phase 5** — case-insensitive search + concurrency fixes. Silent bugs if skipped.
2. **Phase 3** — getting real data across cleanly (counts + FK integrity).

Everything else is mechanical.
