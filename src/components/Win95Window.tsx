import React from 'react';

type Win95WindowProps = {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  defaultWidth?: number;
  defaultHeight?: number;
};

/**
 * Formerly the floating Win95 window — now a full-screen app shell
 * with a space-age header bar. The old floating/drag/resize logic is
 * replaced by a fixed full-viewport layout.
 */
export function Win95Window({
  title, icon, children, onClose, onToggleMaximize,
}: Win95WindowProps) {
  return (
    <div
      className="flex flex-col"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'transparent',
      }}
    >
      {/* ── Header / title bar ── */}
      <div
        className="shrink-0 flex items-center justify-between px-3 select-none"
        style={{
          background: 'linear-gradient(90deg, rgba(0,8,30,0.98) 0%, rgba(0,25,70,0.98) 60%, rgba(0,15,50,0.98) 100%)',
          borderBottom: '1px solid rgba(0,212,255,0.28)',
          boxShadow: '0 2px 20px rgba(0,212,255,0.1)',
          height: 38,
        }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {icon && (
            <span className="flex items-center justify-center w-5 h-5 shrink-0" style={{ color: '#00d4ff' }}>
              {icon}
            </span>
          )}
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#00d4ff',
              textTransform: 'uppercase',
              textShadow: '0 0 10px rgba(0,212,255,0.5)',
            }}
          >
            {title}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Fullscreen button */}
          <button
            onClick={() => document.documentElement.requestFullscreen?.()}
            title="Full Screen"
            style={{
              width: 22, height: 22,
              background: 'rgba(0,212,255,0.06)',
              border: '1px solid rgba(0,212,255,0.25)',
              borderRadius: 3,
              color: '#00d4ff',
              fontSize: 10,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.18)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 8px rgba(0,212,255,0.3)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.06)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            ⛶
          </button>
          {/* Maximize toggle */}
          <button
            onClick={onToggleMaximize}
            title="Maximize / Restore"
            style={{
              width: 22, height: 22,
              background: 'rgba(0,212,255,0.06)',
              border: '1px solid rgba(0,212,255,0.25)',
              borderRadius: 3,
              color: '#00d4ff',
              fontSize: 10,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.18)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 8px rgba(0,212,255,0.3)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.06)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            □
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Close"
              style={{
                width: 22, height: 22,
                background: 'rgba(220,50,50,0.08)',
                border: '1px solid rgba(220,80,80,0.3)',
                borderRadius: 3,
                color: '#ff6060',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(220,50,50,0.28)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 0 8px rgba(220,50,50,0.4)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(220,50,50,0.08)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0" style={{ color: '#c8e0ff' }}>
        {children}
      </div>
    </div>
  );
}
