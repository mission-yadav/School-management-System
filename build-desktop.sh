#!/usr/bin/env bash
# Build the Janaki School Windows desktop installer.
# Run on macOS/Linux (cross-builds the Windows .exe) or on Windows (via Git Bash).
#
# Required environment variables (the shared-database connection + auth secrets that get
# baked into the installer; never committed to git):
#   DATABASE_URL         Neon POOLED connection string (…-pooler…, ?sslmode=require)
#   JWT_ACCESS_SECRET    long random string
#   JWT_REFRESH_SECRET   long random string
# Tip: put them in a local (gitignored) file and `set -a; source that-file; set +a` first.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 1/5  Writing runtime config (electron/db.runtime.json)…"
node -e '
  const fs = require("fs");
  const need = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  const out = {};
  for (const k of need) {
    if (!process.env[k]) { console.error("  ERROR: missing env var " + k); process.exit(1); }
    out[k] = process.env[k];
  }
  fs.writeFileSync("electron/db.runtime.json", JSON.stringify(out, null, 2));
  console.log("  wrote electron/db.runtime.json for " + new URL(out.DATABASE_URL).host);
'

echo "==> 2/5  Generating Prisma client (native + windows engines)…"
( cd server && npx prisma generate )   # must precede tsc — server code uses generated types

echo "==> 3/5  Building client (Vite)…"
( cd client && npm run build )

echo "==> 4/5  Building server (tsc)…"
( cd server && npm run build )

echo "==> 5/5  Packaging Windows installer (Electron 22 + NSIS)…"
( cd electron && npm install && npm run dist:win )

echo ""
echo "Done. Installer(s) are in ./release/"
ls -la release/*.exe 2>/dev/null || true
