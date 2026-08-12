import React, { useState, useRef, useEffect } from 'react';
import { VizMode } from './VisualizerCanvas';
import { InstrumentType } from '../hooks/useAudioEngine';
import { Song, songs } from '../data/songs';

type MenuBarProps = {
  vizMode: VizMode;
  onSetVizMode: (m: VizMode) => void;
  instrument: InstrumentType;
  onSetInstrument: (i: InstrumentType) => void;
  currentSong: Song | null;
  onLoadSong: (s: Song) => void;
  onAssignMedia: () => void;
  onPopout: () => void;
  onClearAllMedia: () => void;
  onShowAbout: () => void;
  onShowHotkeys: () => void;
  onResetHotkeys: () => void;
  onToggleMaximize: () => void;
};

type MenuId = 'file' | 'view' | 'instruments' | 'hotkeys' | 'help';

type Item =
  | { kind: 'sep' }
  | { kind: 'item'; label: string; shortcut?: string; checked?: boolean; disabled?: boolean; action: () => void };

export function MenuBar({
  vizMode, onSetVizMode,
  instrument, onSetInstrument,
  currentSong, onLoadSong,
  onAssignMedia, onPopout,
  onClearAllMedia, onShowAbout,
  onShowHotkeys, onResetHotkeys,
}: MenuBarProps) {
  const [open, setOpen] = useState<MenuId | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(null);
  const pick  = (id: MenuId) => setOpen(prev => prev === id ? null : id);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  const menus: { id: MenuId; label: string; items: Item[] }[] = [
    {
      id: 'file', label: 'FILE',
      items: [
        ...songs.map(s => ({
          kind: 'item' as const,
          label: s.name,
          checked: currentSong?.id === s.id,
          action: () => { onLoadSong(s); close(); },
        })),
        { kind: 'sep' },
        { kind: 'item', label: 'Assign Media…',  shortcut: 'Ctrl+M', action: () => { onAssignMedia();   close(); } },
        { kind: 'item', label: 'Popout Stage ↗', shortcut: 'Ctrl+P', action: () => { onPopout();        close(); } },
        { kind: 'sep' },
        { kind: 'item', label: 'Clear All Media',                     action: () => { onClearAllMedia(); close(); } },
      ],
    },
    {
      id: 'view', label: 'VIEW',
      items: [
        { kind: 'item', label: 'Piano Roll',     checked: vizMode === 'piano-roll',   action: () => { onSetVizMode('piano-roll');   close(); } },
        { kind: 'item', label: 'Frequency Bars', checked: vizMode === 'bars',         action: () => { onSetVizMode('bars');         close(); } },
        { kind: 'item', label: 'Oscilloscope',   checked: vizMode === 'oscilloscope', action: () => { onSetVizMode('oscilloscope'); close(); } },
        { kind: 'item', label: 'Media Show',     checked: vizMode === 'media-show',   action: () => { onSetVizMode('media-show');   close(); } },
        { kind: 'sep' },
        { kind: 'item', label: 'Full Screen',    shortcut: 'F11', action: () => { document.documentElement.requestFullscreen?.(); close(); } },
      ],
    },
    {
      id: 'instruments', label: 'SYNTH',
      items: [
        { kind: 'item', label: 'Soft Synth',  checked: instrument === 'soft',     action: () => { onSetInstrument('soft');     close(); } },
        { kind: 'item', label: 'Sine Wave',   checked: instrument === 'sine',     action: () => { onSetInstrument('sine');     close(); } },
        { kind: 'item', label: 'Square Wave', checked: instrument === 'square',   action: () => { onSetInstrument('square');   close(); } },
        { kind: 'item', label: 'Sawtooth',    checked: instrument === 'sawtooth', action: () => { onSetInstrument('sawtooth'); close(); } },
      ],
    },
    {
      id: 'hotkeys', label: 'HOTKEYS',
      items: [
        { kind: 'item', label: 'Configure…',      action: () => { onShowHotkeys();  close(); } },
        { kind: 'sep' },
        { kind: 'item', label: 'Reset Defaults',  action: () => { onResetHotkeys(); close(); } },
      ],
    },
    {
      id: 'help', label: 'HELP',
      items: [
        { kind: 'item', label: 'About MIDIVid…', action: () => { onShowAbout(); close(); } },
      ],
    },
  ];

  return (
    <div
      ref={barRef}
      className="flex items-stretch shrink-0 relative"
      style={{
        background: 'rgba(0,5,20,0.6)',
        borderBottom: '1px solid rgba(0,212,255,0.12)',
        zIndex: 60,
        height: 28,
      }}
    >
      {menus.map(m => (
        <div key={m.id} className="relative flex items-stretch">
          <button
            style={{
              padding: '0 12px',
              fontSize: 10,
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 600,
              letterSpacing: '0.1em',
              cursor: 'default',
              userSelect: 'none',
              color: open === m.id ? '#00d4ff' : 'rgba(150,185,220,0.7)',
              background: open === m.id ? 'rgba(0,212,255,0.12)' : 'transparent',
              border: 'none',
              borderBottom: open === m.id ? '2px solid #00d4ff' : '2px solid transparent',
              transition: 'all 0.15s',
              height: '100%',
            }}
            onMouseDown={() => pick(m.id)}
            onMouseEnter={() => { if (open !== null) setOpen(m.id); }}
            onMouseOver={e => {
              if (open === null) (e.currentTarget as HTMLElement).style.color = '#00d4ff';
            }}
            onMouseOut={e => {
              if (open !== m.id) (e.currentTarget as HTMLElement).style.color = 'rgba(150,185,220,0.7)';
            }}
          >
            {m.label}
          </button>

          {open === m.id && (
            <div
              className="absolute top-full left-0 py-1 min-w-[200px]"
              style={{
                background: 'rgba(4, 8, 28, 0.97)',
                border: '1px solid rgba(0,212,255,0.25)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(0,212,255,0.08)',
                backdropFilter: 'blur(20px)',
                zIndex: 70,
              }}
            >
              {m.items.map((item, idx) =>
                item.kind === 'sep' ? (
                  <div
                    key={idx}
                    style={{
                      height: 1,
                      margin: '4px 8px',
                      background: 'rgba(0,212,255,0.12)',
                    }}
                  />
                ) : (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 12px',
                      fontSize: 12,
                      fontFamily: "'Inter', sans-serif",
                      cursor: item.disabled ? 'not-allowed' : 'default',
                      userSelect: 'none',
                      color: item.disabled ? 'rgba(0,212,255,0.25)' : '#c8e0ff',
                      transition: 'all 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (!item.disabled) {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.12)';
                        (e.currentTarget as HTMLElement).style.color = '#00d4ff';
                      }
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = item.disabled ? 'rgba(0,212,255,0.25)' : '#c8e0ff';
                    }}
                    onMouseDown={() => !item.disabled && item.action()}
                  >
                    <span style={{ width: 14, fontSize: 11, color: '#00ff88', textAlign: 'center' }}>
                      {item.checked ? '●' : ''}
                    </span>
                    <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
                    {item.shortcut && (
                      <span style={{ fontSize: 10, opacity: 0.45, fontFamily: "'JetBrains Mono', monospace", marginLeft: 16 }}>
                        {item.shortcut}
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
