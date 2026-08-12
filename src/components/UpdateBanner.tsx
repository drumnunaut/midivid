import React, { useEffect, useState } from 'react';

/**
 * Auto-update notification banner (desktop app only).
 *
 * Listens to update events from the Electron main process and renders a
 * slim glass banner over the top of the app:
 *   available  → "Update vX available"  [Download] [Later]
 *   progress   → progress bar
 *   downloaded → "Restart to install"   [Restart now] [Later]
 *   error      → dismissible notice (e.g. Windows portable zip can't auto-update)
 */

type UpdateEvent =
  | { type: 'available'; version: string }
  | { type: 'none' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

type ElectronUpdateAPI = {
  isElectron?: boolean;
  onUpdateEvent?: (cb: (data: UpdateEvent) => void) => () => void;
  downloadUpdate?: () => Promise<{ ok: boolean; reason?: string }>;
  installUpdate?: () => void;
};

const api = (window as unknown as { electronAPI?: ElectronUpdateAPI }).electronAPI;

export function UpdateBanner() {
  const [state, setState] = useState<UpdateEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!api?.isElectron || !api.onUpdateEvent) return;
    const unsubscribe = api.onUpdateEvent((data) => {
      if (data.type === 'none') return;          // silent — no update
      setState(data);
      setDismissed(false);
    });
    return unsubscribe;
  }, []);

  if (!api?.isElectron || !state || dismissed) return null;
  // Errors on auto-update-unsupported builds (Windows portable zip): stay quiet
  // unless the user had already seen an update offer.
  if (state.type === 'error') return null;

  const barStyle: React.CSSProperties = {
    position: 'fixed', top: 34, left: '50%', transform: 'translateX(-50%)',
    zIndex: 300, display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 16px', borderRadius: 4,
    background: 'rgba(4, 10, 32, 0.97)',
    border: '1px solid rgba(0,212,255,0.35)',
    boxShadow: '0 0 30px rgba(0,212,255,0.15), 0 8px 30px rgba(0,0,0,0.6)',
    fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#c8e0ff',
  };

  const btn: React.CSSProperties = {
    height: 26, padding: '0 14px', borderRadius: 3, cursor: 'pointer',
    background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.4)',
    color: '#00d4ff', fontSize: 10, fontFamily: "'Orbitron', sans-serif",
    fontWeight: 700, letterSpacing: '0.08em',
  };

  const btnGhost: React.CSSProperties = {
    ...btn, background: 'transparent', border: '1px solid rgba(150,185,220,0.25)',
    color: 'rgba(150,185,220,0.7)',
  };

  if (state.type === 'available') {
    return (
      <div style={barStyle}>
        <span>
          <span style={{ color: '#00ff88', fontWeight: 600 }}>Update v{state.version}</span> is available
        </span>
        <button style={btn} onClick={() => api.downloadUpdate?.()}>DOWNLOAD</button>
        <button style={btnGhost} onClick={() => setDismissed(true)}>LATER</button>
      </div>
    );
  }

  if (state.type === 'progress') {
    return (
      <div style={barStyle}>
        <span>Downloading update…</span>
        <div style={{ width: 140, height: 6, borderRadius: 3, background: 'rgba(0,212,255,0.1)', overflow: 'hidden' }}>
          <div style={{
            width: `${state.percent}%`, height: '100%',
            background: 'linear-gradient(90deg, #00d4ff, #00ff88)',
            transition: 'width 0.3s',
          }} />
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{state.percent}%</span>
      </div>
    );
  }

  if (state.type === 'downloaded') {
    return (
      <div style={barStyle}>
        <span>
          <span style={{ color: '#00ff88', fontWeight: 600 }}>v{state.version} ready</span> — restart to install
        </span>
        <button style={btn} onClick={() => api.installUpdate?.()}>RESTART NOW</button>
        <button style={btnGhost} onClick={() => setDismissed(true)}>LATER</button>
      </div>
    );
  }

  return null;
}
