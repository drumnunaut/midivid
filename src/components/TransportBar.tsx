import React, { useState } from 'react';
import { InstrumentType } from '../hooks/useAudioEngine';
import { VizMode } from './VisualizerCanvas';
import { Song, songs } from '../data/songs';
import { EffectsSettings } from '../types/effects';
import { EffectsPanel } from './EffectsPanel';
import { HotkeyMap, codeForAction, formatCode } from '../hooks/useHotkeys';

type TransportBarProps = {
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  progress: number;
  currentTime: number;
  totalDuration: number;
  onSeek: (ratio: number) => void;
  currentSong: Song | null;
  onSelectSong: (song: Song) => void;
  instrument: InstrumentType;
  onSelectInstrument: (inst: InstrumentType) => void;
  vizMode: VizMode;
  onSelectVizMode: (mode: VizMode) => void;
  volume: number;
  onSetVolume: (v: number) => void;
  onAssignMedia: () => void;
  onPopout: () => void;
  micActive: boolean;
  onToggleMic: () => void;
  effectsSettings: EffectsSettings;
  onChangeEffects: (s: EffectsSettings) => void;
  clearFxCC: number;
  onChangeClearFxCC: (cc: number) => void;
  learningCC: boolean;
  onStartLearnCC: () => void;
  onCancelLearnCC: () => void;
  onClearFX: () => void;
  hotkeys: HotkeyMap;
};

const BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  padding: '0 10px', height: 28, borderRadius: 3, cursor: 'pointer',
  background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.25)',
  color: '#00d4ff', fontSize: 13, fontFamily: 'inherit',
  transition: 'all 0.15s ease', userSelect: 'none',
};
const BTN_ACTIVE: React.CSSProperties = {
  ...BTN,
  background: 'rgba(0,212,255,0.22)',
  border: '1px solid rgba(0,212,255,0.7)',
  boxShadow: '0 0 14px rgba(0,212,255,0.35)',
};
const LABEL: React.CSSProperties = {
  fontSize: 10, fontFamily: "'Orbitron', sans-serif", fontWeight: 600,
  letterSpacing: '0.08em', color: 'rgba(150,185,220,0.6)',
  textTransform: 'uppercase' as const,
};
const SEP: React.CSSProperties = {
  width: 1, alignSelf: 'stretch', margin: '4px 6px',
  background: 'rgba(0,212,255,0.14)',
};

function TBtn({ active, onClick, title, children }: {
  active?: boolean; onClick?: () => void; title?: string; children: React.ReactNode;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      style={hover || active ? BTN_ACTIVE : BTN}
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
  );
}

export function TransportBar(props: TransportBarProps) {
  const [showFX, setShowFX] = useState(false);

  const closeFXPanel = () => {
    setShowFX(false);
    if (props.learningCC) props.onCancelLearnCC();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    props.onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  const vizIcons: { mode: VizMode; icon: string; title: string }[] = [
    { mode: 'piano-roll',   icon: '🎹', title: 'Falling Notes' },
    { mode: 'bars',         icon: '▊',  title: 'Frequency Bars' },
    { mode: 'oscilloscope', icon: '≋',  title: 'Oscilloscope' },
    { mode: 'media-show',   icon: '✦',  title: 'Media Show' },
  ];

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
        padding: '5px 8px',
        background: 'rgba(4,8,25,0.88)',
        borderTop: '1px solid rgba(0,212,255,0.12)',
        borderBottom: '1px solid rgba(0,212,255,0.12)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* ── Playback ── */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <TBtn title="Previous">⏮</TBtn>
        <TBtn active={props.isPlaying} onClick={props.onPlayPause} title="Play / Pause">
          <span style={{ fontSize: 14 }}>{props.isPlaying ? '⏸' : '⏵'}</span>
          {(() => {
            const code = codeForAction(props.hotkeys, 'play-pause');
            return code ? (
              <span style={{
                fontSize: 8, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                padding: '1px 4px', borderRadius: 2,
                background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)',
                color: '#00d4ff',
              }}>{formatCode(code)}</span>
            ) : null;
          })()}
        </TBtn>
        <TBtn onClick={props.onStop} title="Stop">
          <span style={{ fontSize: 13 }}>⏹</span>
          {(() => {
            const code = codeForAction(props.hotkeys, 'stop');
            return code ? (
              <span style={{
                fontSize: 8, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                padding: '1px 4px', borderRadius: 2,
                background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)',
                color: '#00d4ff',
              }}>{formatCode(code)}</span>
            ) : null;
          })()}
        </TBtn>
        <TBtn title="Next">⏭</TBtn>
      </div>

      <div style={SEP} />

      {/* ── Progress ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 100, gap: 2 }}>
        <div
          className="space-progress-track"
          style={{ height: 10 }}
          onClick={handleProgressClick}
        >
          <div className="space-progress-fill" style={{ width: `${props.progress * 100}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
          <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(150,185,220,0.7)' }}>
            {formatTime(props.currentTime)}
          </span>
          <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(150,185,220,0.7)' }}>
            {formatTime(props.totalDuration)}
          </span>
        </div>
      </div>

      <div style={SEP} />

      {/* ── Song + Instrument ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={LABEL}>Song</span>
          <select
            value={props.currentSong?.id || ''}
            onChange={e => { const s = songs.find(x => x.id === e.target.value); if (s) props.onSelectSong(s); }}
            style={{ width: 130, height: 24 }}
          >
            <option value="" disabled>Select…</option>
            {songs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={LABEL}>Synth</span>
          <select
            value={props.instrument}
            onChange={e => props.onSelectInstrument(e.target.value as InstrumentType)}
            style={{ width: 100, height: 24 }}
          >
            <option value="soft">Soft Synth</option>
            <option value="sine">Sine Wave</option>
            <option value="square">Square Wave</option>
            <option value="sawtooth">Sawtooth</option>
          </select>
        </div>
      </div>

      <div style={SEP} />

      {/* ── Viz mode ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={LABEL}>Viz</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {vizIcons.map(({ mode, icon, title }) => (
            <TBtn key={mode} active={props.vizMode === mode} onClick={() => props.onSelectVizMode(mode)} title={title}>
              <span style={{ fontSize: 13 }}>{icon}</span>
            </TBtn>
          ))}
        </div>
      </div>

      <div style={SEP} />

      {/* ── Volume ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{ fontSize: 15, cursor: 'pointer' }}
          title={props.volume === 0 ? 'Unmute' : 'Mute'}
          onClick={() => props.onSetVolume(props.volume === 0 ? 0.5 : 0)}
        >
          {props.volume === 0 ? '🔇' : props.volume < 0.4 ? '🔈' : props.volume < 0.75 ? '🔉' : '🔊'}
        </span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={props.volume}
          onChange={e => props.onSetVolume(parseFloat(e.target.value))}
          style={{ width: 72, height: 16 }}
          title={`Volume: ${Math.round(props.volume * 100)}%`}
        />
        <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(150,185,220,0.7)', width: 28 }}>
          {Math.round(props.volume * 100)}%
        </span>
      </div>

      <div style={SEP} />

      {/* ── Mic ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {props.micActive && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#ff4444', flexShrink: 0,
            boxShadow: '0 0 6px rgba(255,68,68,0.8)',
            animation: 'greenGlowPulse 1s ease-in-out infinite',
          }} title="Mic active" />
        )}
        <TBtn active={props.micActive} onClick={props.onToggleMic}
          title={props.micActive ? 'Stop microphone' : 'Microphone input'}>
          <span style={{ fontSize: 13 }}>🎤</span>
        </TBtn>
      </div>

      <div style={SEP} />

      {/* ── FX + Assign ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <TBtn active={showFX} onClick={() => { if (showFX) closeFXPanel(); else setShowFX(true); }} title="FX Controls">
            <span style={{ fontSize: 10, fontFamily: "'Orbitron', sans-serif", fontWeight: 700, letterSpacing: '0.05em' }}>FX</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
          </TBtn>
          {showFX && (
            <EffectsPanel
              settings={props.effectsSettings}
              onChange={props.onChangeEffects}
              onClose={closeFXPanel}
              micActive={props.micActive}
              clearFxCC={props.clearFxCC}
              onChangeClearFxCC={props.onChangeClearFxCC}
              learningCC={props.learningCC}
              onStartLearnCC={props.onStartLearnCC}
            />
          )}
        </div>

        <TBtn onClick={props.onClearFX} title="Clear all active fractal effects">
          <span style={{ fontSize: 11 }}>✕</span>
          <span style={{ fontSize: 9, fontFamily: "'Orbitron', sans-serif", fontWeight: 700, letterSpacing: '0.05em' }}>FX</span>
          {(() => {
            const code = codeForAction(props.hotkeys, 'clear-fx');
            return code ? (
              <span style={{
                fontSize: 8, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                padding: '1px 4px', borderRadius: 2,
                background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)',
                color: '#00d4ff',
              }}>{formatCode(code)}</span>
            ) : null;
          })()}
        </TBtn>
      </div>

      <div style={SEP} />

      <TBtn onClick={props.onAssignMedia} title="Assign media to piano keys">
        <span style={{ fontSize: 10, fontFamily: "'Orbitron', sans-serif", fontWeight: 700, letterSpacing: '0.05em' }}>MEDIA</span>
      </TBtn>

      <TBtn onClick={props.onPopout} title="Open visualizer in popout window">
        <span style={{ fontSize: 10, fontFamily: "'Orbitron', sans-serif", fontWeight: 600, letterSpacing: '0.05em' }}>STAGE ↗</span>
      </TBtn>
    </div>
  );
}
