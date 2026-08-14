// Electron main process for the Janaki School desktop app.
// Boots the bundled Express+Prisma server (SQLite) as a child process, then opens
// a window pointing at it. Designed to run on Windows 7 and above (Electron 22).
const { app, BrowserWindow, shell, dialog } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const PORT = 47615; // fixed, uncommon localhost port
const isPackaged = app.isPackaged;

// In dev, resources live in the repo; when packaged, under resources/ (extraResources).
const resRoot = isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const serverDir = path.join(resRoot, 'server');
const serverEntry = path.join(serverDir, 'dist', 'index.js');
const clientDist = path.join(resRoot, 'client', 'dist');
const seedDb = path.join(serverDir, 'prisma', 'dev.db');

// The live database lives in the OS user-data dir so it is writable and survives updates.
const dbPath = path.join(app.getPath('userData'), 'janaki-school.db');
const dbUrl = 'file:' + dbPath.replace(/\\/g, '/');

let serverProc = null;

function ensureDatabase() {
  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(seedDb)) fs.copyFileSync(seedDb, dbPath); // first run: start from the shipped data
    else fs.writeFileSync(dbPath, ''); // empty file; server/prisma will create tables
  }
}

function startServer() {
  ensureDatabase();
  serverProc = fork(serverEntry, [], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATABASE_URL: dbUrl,
      CLIENT_DIST: clientDist,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  serverProc.stdout.on('data', (d) => console.log('[server]', String(d).trim()));
  serverProc.stderr.on('data', (d) => console.error('[server]', String(d).trim()));
  serverProc.on('exit', (code) => { if (code) console.error('server exited with', code); });
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http.get(`http://localhost:${PORT}/api/health`, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - started > 30000) reject(new Error('server did not start in time'));
          else setTimeout(tick, 300);
        });
    };
    tick();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'Janaki Secondary School',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(`http://localhost:${PORT}`);
  // open external links (e.g. downloaded PDFs) in the system browser, not a new window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${PORT}`)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  try {
    startServer();
    await waitForServer();
    createWindow();
  } catch (err) {
    dialog.showErrorBox('Startup failed', String(err && err.stack || err));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProc) { try { serverProc.kill(); } catch { /* ignore */ } }
  app.quit();
});
app.on('before-quit', () => { if (serverProc) { try { serverProc.kill(); } catch { /* ignore */ } } });
