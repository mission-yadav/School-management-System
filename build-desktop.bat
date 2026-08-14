@echo off
REM Build the Janaki School Windows desktop installer on Windows.
setlocal
cd /d "%~dp0"

echo ==^> 1/4  Building client (Vite)...
cd client && call npm run build || goto :err
cd ..

echo ==^> 2/4  Building server (tsc)...
cd server && call npm run build || goto :err
cd ..

echo ==^> 3/4  Generating Prisma client (native + windows engines)...
cd server && call npx prisma generate || goto :err
cd ..

echo ==^> 4/4  Packaging Windows installer (Electron 22 + NSIS)...
cd electron && call npm install && call npm run dist:win || goto :err
cd ..

echo.
echo Done. Installer is in .\release\
dir release\*.exe
goto :eof

:err
echo BUILD FAILED
exit /b 1
