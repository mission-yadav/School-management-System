// Electron main process for the Janaki School desktop app.
// Boots the bundled Express+Prisma server (SQLite) as a child process, then opens
// a window pointing at it. Designed to run on Windows 7 and above (Electron 22).
const { app, BrowserWindow, shell, dialog } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch { /* optional */ }

const PORT = 47615; // fixed, uncommon localhost port
const isPackaged = app.isPackaged;

// In dev, resources live in the repo; when packaged, under resources/ (extraResources).
const resRoot = isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const serverDir = path.join(resRoot, 'server');
const serverEntry = path.join(serverDir, 'dist', 'index.js');
const clientDist = path.join(resRoot, 'client', 'dist');
const seedDb = path.join(serverDir, 'prisma', 'seed.db'); // PII-free starter DB (real data lives in userData)

// The live database lives in the OS user-data dir so it is writable and survives updates.
const dbPath = path.join(app.getPath('userData'), 'janaki-school.db');
const dbUrl = 'file:' + dbPath.replace(/\\/g, '/');

let serverProc = null;
let serverLog = '';
let serverExitCode = null;
const logPath = path.join(app.getPath('userData'), 'server.log');

function appendLog(s) {
  serverLog += s;
  if (serverLog.length > 20000) serverLog = serverLog.slice(-20000);
  try { fs.appendFileSync(logPath, s); } catch { /* ignore */ }
}

function ensureDatabase() {
  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(seedDb)) fs.copyFileSync(seedDb, dbPath); // first run: start from the shipped data
    else fs.writeFileSync(dbPath, ''); // empty file; server/prisma will create tables
  }
}

function startServer() {
  ensureDatabase();
  try { fs.writeFileSync(logPath, `--- start ${new Date().toISOString()} ---\ndb=${dbUrl}\nentry=${serverEntry}\n`); } catch { /* ignore */ }
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
  serverProc.stdout.on('data', (d) => appendLog('[out] ' + String(d)));
  serverProc.stderr.on('data', (d) => appendLog('[err] ' + String(d)));
  serverProc.on('exit', (code) => { serverExitCode = code == null ? -1 : code; appendLog(`[exit] code=${serverExitCode}\n`); });
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      // If the server process already died, surface its error immediately.
      if (serverExitCode !== null) return reject(new Error(`server process exited (code ${serverExitCode}).\n\n${serverLog.slice(-1600)}`));
      http.get(`http://localhost:${PORT}/api/health`, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - started > 60000) reject(new Error(`server did not start in time.\n\n${serverLog.slice(-1600)}`));
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
    // plugins:true enables Chromium's built-in PDF viewer so <iframe>/<embed> PDFs render.
    webPreferences: { contextIsolation: true, nodeIntegration: false, plugins: true },
  });
  win.once('ready-to-show', () => win.show());

  // Save PDF downloads straight to the Downloads folder and reveal them.
  win.webContents.session.on('will-download', (_e, item) => {
    const target = path.join(app.getPath('downloads'), item.getFilename());
    item.setSavePath(target);
    item.once('done', (_ev, state) => { if (state === 'completed') shell.showItemInFolder(target); });
  });

  win.loadURL(`http://localhost:${PORT}`);
  // open external links (e.g. downloaded PDFs) in the system browser, not a new window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${PORT}`)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Check GitHub Releases for a newer version, download in the background, and offer
// to restart when ready. No-ops if offline or unpackaged.
function setupAutoUpdate() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart & update now', 'Later'],
      defaultId: 0,
      title: 'Update available',
      message: `Janaki School ${info.version} has been downloaded.`,
      detail: 'Restart now to apply the update, or it will be installed the next time you close the app.',
    });
    if (response === 0) { setImmediate(() => autoUpdater.quitAndInstall()); }
  });
  autoUpdater.on('error', (e) => { try { fs.appendFileSync(logPath, `[updater] ${e}\n`); } catch { /* ignore */ } });
  autoUpdater.checkForUpdates().catch(() => { /* offline — ignore */ });
}

app.whenReady().then(async () => {
  try {
    startServer();
    await waitForServer();
    createWindow();
    setTimeout(setupAutoUpdate, 4000); // check shortly after the window is up
  } catch (err) {
    dialog.showErrorBox('Startup failed', `${String(err && err.message || err)}\n\nFull log: ${logPath}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProc) { try { serverProc.kill(); } catch { /* ignore */ } }
  app.quit();
});
app.on('before-quit', () => { if (serverProc) { try { serverProc.kill(); } catch { /* ignore */ } } });
