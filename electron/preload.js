/**
 * MIDIVid — Electron preload script
 *
 * Runs in a sandboxed context before the renderer loads.
 * Exposes a minimal electronAPI to the renderer via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  /** true when running inside the desktop app (web app checks this) */
  isElectron: true,

  /** App version from package.json */
  version: process.env.npm_package_version ?? '2.0.0',

  /** Request the window to minimize / maximize / close */
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close:    () => ipcRenderer.send('window:close'),

  /** ── Auto-update ──────────────────────────────────────────────────────── */
  /** Subscribe to update events: {type:'available'|'none'|'progress'|'downloaded'|'error', ...} */
  onUpdateEvent: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('update:event', listener);
    return () => ipcRenderer.removeListener('update:event', listener);
  },
  /** Manually re-check for updates */
  checkForUpdates:  () => ipcRenderer.invoke('update:check'),
  /** Start downloading an available update */
  downloadUpdate:   () => ipcRenderer.invoke('update:download'),
  /** Quit and install a downloaded update */
  installUpdate:    () => ipcRenderer.send('update:install'),
});
