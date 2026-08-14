#!/usr/bin/env bash
# Build the Janaki School Windows desktop installer.
# Run on macOS/Linux (cross-builds the Windows .exe) or on Windows (via Git Bash).
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 1/4  Building client (Vite)…"
( cd client && npm run build )

echo "==> 2/4  Building server (tsc)…"
( cd server && npm run build )

echo "==> 3/4  Generating Prisma client (native + windows engines)…"
( cd server && npx prisma generate )

echo "==> 4/4  Packaging Windows installer (Electron 22 + NSIS)…"
( cd electron && npm install && npm run dist:win )

echo ""
echo "Done. Installer(s) are in ./release/"
ls -la release/*.exe 2>/dev/null || true
