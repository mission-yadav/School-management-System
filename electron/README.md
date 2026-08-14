# Janaki School — Windows Desktop App

Packages the web app (React client + Express/Prisma API + SQLite) into a single
Windows installer. Runs offline on one PC — no PostgreSQL, no Node install, no
browser needed by the user.

## Architecture

```
Electron (main.cjs)
 ├─ forks  server/dist/index.js   (Express + Prisma, ELECTRON_RUN_AS_NODE)
 │    ├─ DATABASE_URL → %APPDATA%\Janaki School\janaki-school.db  (SQLite, writable)
 │    └─ serves the built client (client/dist) + /api on http://localhost:47615
 └─ BrowserWindow → http://localhost:47615
```

- **First run** copies the bundled seed database (`server/prisma/dev.db`, which
  holds the data migrated from PostgreSQL) into the user's data folder, so the
  school starts with all existing students/fees. Their data then lives at
  `%APPDATA%\Janaki School\janaki-school.db` and survives app updates.
- Login is unchanged: `admin@school.com` / `admin123`.

## Build

From the repo root, on macOS/Linux **or** Windows (Git Bash):

```bash
./build-desktop.sh        # or:  build-desktop.bat  on Windows
```

This builds the client, compiles the server, generates the Prisma client with
the **Windows** query engine, then runs electron-builder. The installer lands in
`../release/` as `Janaki-School-Setup-1.0.0.exe` (64-bit).

> **64-bit only.** Prisma ships no 32-bit Windows query engine, so the app needs
> 64-bit Windows 7 or above. This is standard on essentially all Win7 machines
> from ~2010 onward.

Building the Windows installer **on a real Windows PC is recommended** — it's the
most reliable, and it lets you smoke-test the result immediately.

## Windows 7 notes (important)

- The app is pinned to **Electron 22** — the last Electron that supports Windows 7
  and 8 (Chromium 108). Newer Electron will not launch on Win7.
- **Prisma query engine:** recent Prisma engine binaries may target Windows 10+.
  If the app starts but the database fails on a Windows 7 machine, the fix is to
  pin an older Prisma (e.g. `prisma@5.4`) which ships Win7-compatible engines, then
  rebuild. This only matters on genuine Win7; Windows 8.1/10/11 are fine.
- Only **64-bit Windows** is supported (Prisma has no 32-bit Windows engine).

## Run in development (from the repo)

```bash
cd server && npm run build      # produce server/dist
cd ../client && npm run build   # produce client/dist
cd ../electron && npm install && npm start
```

`npm start` launches Electron against the repo's built files (no packaging).
