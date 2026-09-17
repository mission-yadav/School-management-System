// Electron main process for the Janaki School desktop app.
// Boots the bundled Express+Prisma server (shared PostgreSQL / Neon) as a child process,
// then opens a window pointing at it. Designed to run on Windows 7 and above (Electron 22).
// The database now lives in the cloud, so every device shares the same data (needs internet).
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

// Runtime secrets — the shared Neon DATABASE_URL and the JWT signing secrets — are
// injected at build time into db.runtime.json (gitignored, bundled next to main.cjs),
// and fall back to process.env for local dev. Nothing secret lives in the git repo.
function loadRuntimeConfig() {
  const cfg = {};
  try {
    const p = path.join(__dirname, 'db.runtime.json');
    if (fs.existsSync(p)) Object.assign(cfg, JSON.parse(fs.readFileSync(p, 'utf8')));
  } catch { /* ignore a malformed config; the missing-URL check below will catch it */ }
  for (const k of ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (process.env[k]) cfg[k] = process.env[k]; // env overrides bundled config (dev)
  }
  return cfg;
}
const runtimeConfig = loadRuntimeConfig();

let serverProc = null;
let serverLog = '';
let serverExitCode = null;
const logPath = path.join(app.getPath('userData'), 'server.log');

function appendLog(s) {
  serverLog += s;
  if (serverLog.length > 20000) serverLog = serverLog.slice(-20000);
  try { fs.appendFileSync(logPath, s); } catch { /* ignore */ }
}

function startServer() {
  // Log only the DB host (never the full URL) so the password stays out of server.log.
  let dbHost = '(unset)';
  try { dbHost = new URL(runtimeConfig.DATABASE_URL).host; } catch { /* leave as (unset) */ }
  try { fs.writeFileSync(logPath, `--- start ${new Date().toISOString()} ---\ndb=${dbHost}\nentry=${serverEntry}\n`); } catch { /* ignore */ }
  serverProc = fork(serverEntry, [], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(PORT),
      CLIENT_DIST: clientDist,
      ...runtimeConfig, // shared Neon DATABASE_URL + JWT_ACCESS_SECRET + JWT_REFRESH_SECRET
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
  if (!runtimeConfig.DATABASE_URL) {
    dialog.showErrorBox('Configuration error',
      'No database connection is configured for this build.\n\n' +
      'The shared-database version must be built with db.runtime.json present. Please reinstall the official installer.');
    app.quit();
    return;
  }
  try {
    startServer();
    await waitForServer();
    createWindow();
    setTimeout(setupAutoUpdate, 4000); // check shortly after the window is up
  } catch (err) {
    dialog.showErrorBox('Startup failed',
      'Could not connect to the school database.\n\n' +
      'Please check that this computer is connected to the internet, then reopen the app.\n\n' +
      `Technical detail: ${String(err && err.message || err)}\n\nFull log: ${logPath}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProc) { try { serverProc.kill(); } catch { /* ignore */ } }
  app.quit();
});
app.on('before-quit', () => { if (serverProc) { try { serverProc.kill(); } catch { /* ignore */ } } });
