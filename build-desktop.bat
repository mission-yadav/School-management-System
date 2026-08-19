@echo off
REM Build the Janaki School Windows desktop installer on Windows.
REM Requires these env vars set first (baked into the installer, never committed):
REM   DATABASE_URL  JWT_ACCESS_SECRET  JWT_REFRESH_SECRET
setlocal
cd /d "%~dp0"

echo ==^> 1/5  Writing runtime config (electron\db.runtime.json)...
node -e "const fs=require('fs');const need=['DATABASE_URL','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET'];const out={};for(const k of need){if(!process.env[k]){console.error('  ERROR: missing env var '+k);process.exit(1);}out[k]=process.env[k];}fs.writeFileSync('electron/db.runtime.json',JSON.stringify(out,null,2));console.log('  wrote electron/db.runtime.json');" || goto :err

echo ==^> 2/5  Building client (Vite)...
cd client && call npm run build || goto :err
cd ..

echo ==^> 3/5  Building server (tsc)...
cd server && call npm run build || goto :err
cd ..

echo ==^> 4/5  Generating Prisma client (native + windows engines)...
cd server && call npx prisma generate || goto :err
cd ..

echo ==^> 5/5  Packaging Windows installer (Electron 22 + NSIS)...
cd electron && call npm install && call npm run dist:win || goto :err
cd ..

echo.
echo Done. Installer is in .\release\
dir release\*.exe
goto :eof

:err
echo BUILD FAILED
exit /b 1
