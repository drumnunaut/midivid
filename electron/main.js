/**
 * MIDIVid — Electron main process
 *
 * In development:  loads from the Vite dev server (VITE_DEV_SERVER_URL)
 * In production:   loads the bundled build from dist-electron/renderer/index.html
 *
 * Auto-update: electron-updater checks GitHub Releases on launch (packaged
 * builds only). Downloads happen only when the user opts in from the UI.
 * Note: on Windows auto-update requires the NSIS installer build; the
 * portable zip build reports "not supported" and the UI falls back to a
 * "download manually" link.
 */

import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import path from 'path';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

// NOTE: this file is bundled by esbuild to CommonJS (dist-electron/main.cjs),
// so `__dirname` is provided by the CJS runtime — do not use import.meta here.
const isDev     = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;

// Silence the "Electron Security Warning" in dev; we handle CSP ourselves.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

let mainWindow = null;

// ── Auto-update ────────────────────────────────────────────────────────────────
// Buffer the most recent meaningful event so a renderer that finishes loading
// after the launch-time check still sees it (events are replayed on load).
let lastUpdateEvent = null;

function sendUpdateEvent(type, payload = {}) {
  const event = { type, ...payload };
  if (type !== 'none' && type !== 'error') lastUpdateEvent = event;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:event', event);
  }
}

function setupAutoUpdater() {
  // Updates only make sense for packaged builds (and are unsupported for the
  // Windows portable zip — electron-updater throws; we surface that cleanly).
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;           // user opts in from the UI
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available',     (info) => sendUpdateEvent('available',   { version: info.version }));
  autoUpdater.on('update-not-available', ()     => sendUpdateEvent('none'));
  autoUpdater.on('download-progress',    (p)    => sendUpdateEvent('progress',    { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded',    (info) => sendUpdateEvent('downloaded',  { version: info.version }));
  autoUpdater.on('error',                (err)  => sendUpdateEvent('error',       { message: String(err?.message ?? err) }));

  // Check on launch (never crash the app if the update feed is unreachable)
  autoUpdater.checkForUpdates().catch(() => {});
}

ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch (err) { return { ok: false, reason: String(err?.message ?? err) }; }
});

ipcMain.handle('update:download', async () => {
  try { await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (err) { return { ok: false, reason: String(err?.message ?? err) }; }
});

ipcMain.on('update:install', () => {
  autoUpdater.quitAndInstall();
});

// ── Window controls (preload sends these) ─────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

function createWindow() {
  const win = new BrowserWindow({
    width:  1280,
    height: 780,
    minWidth:  900,
    minHeight: 600,
    show: false,   // wait until ready-to-show to avoid white flash
    backgroundColor: '#050510',
    titleBarStyle: 'hidden',    // we draw our own title bar in the React UI
    // on macOS the traffic lights show; on Windows/Linux the frame is hidden
    ...(process.platform !== 'darwin' ? { frame: false } : {}),
    webPreferences: {
      // Bundled by esbuild into dist-electron/preload.cjs (sits next to main)
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Web MIDI API — enable Chromium's built-in MIDI implementation
      experimentalFeatures: true,
    },
    icon: path.join(__dirname, '../public/icon.png'),
  });

  mainWindow = win;

  // ── Permission handler: allow MIDI, audio, camera ──────────────────────────
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['midi', 'midiSysex', 'media', 'camera', 'microphone', 'audioCapture'];
    callback(allowed.includes(permission));
  });

  // ── Load the app ───────────────────────────────────────────────────────────
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Bundled main lives at dist-electron/main.cjs → renderer sits alongside it
    const indexPath = path.join(__dirname, 'renderer/index.html');
    win.loadFile(indexPath);
  }

  // Replay the latest updater event to renderers that load after it fired
  win.webContents.on('did-finish-load', () => {
    if (lastUpdateEvent) win.webContents.send('update:event', lastUpdateEvent);
  });

  // ── Window lifecycle ───────────────────────────────────────────────────────
  win.once('ready-to-show', () => {
    win.show();
    win.maximize();
  });

  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  // Open external links in the system browser, not in Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  return win;
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Needed for Web MIDI on some platforms
  app.commandLine.appendSwitch('enable-web-midi');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream', 'false');

  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
