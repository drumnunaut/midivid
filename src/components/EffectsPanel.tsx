import React, { useRef, useEffect, useState } from 'react';
import { EffectsSettings, DEFAULT_EFFECTS_SETTINGS, BLEND_MODE_OPTIONS } from '../types/effects';

type Props = {
  settings: EffectsSettings;
  onChange: (s: EffectsSettings) => void;
  onClose: () => void;
  micActive: boolean;
  clearFxCC: number;
  onChangeClearFxCC: (cc: number) => void;
  learningCC: boolean;
  onStartLearnCC: () => void;
};

function SliderRow({ label, value, min, max, step, display, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span style={{
        width: 100, flexShrink: 0, fontSize: 11,
        fontFamily: "'Inter', sans-serif", color: disabled ? 'rgba(150,185,220,0.3)' : 'rgba(150,185,220,0.85)',
      }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        style={{ flex: 1, height: 14, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}
      />
      <span style={{
        width: 38, textAlign: 'right', fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace", color: 'rgba(0,212,255,0.8)',
      }}>{display}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: "'Orbitron', sans-serif", fontWeight: 700,
      letterSpacing: '0.15em', color: 'rgba(0,212,255,0.5)',
      textTransform: 'uppercase', paddingTop: 8, paddingBottom: 3,
      borderBottom: '1px solid rgba(0,212,255,0.1)', marginBottom: 2,
    }}>{children}</div>
  );
}

export function EffectsPanel({ settings, onChange, onClose, micActive, clearFxCC, onChangeClearFxCC, learningCC, onStartLearnCC }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!learningCC) { setCountdown(5); return; }
    setCountdown(5);
    const iv = setInterval(() => {
      setCountdown(prev => { if (prev <= 1) { clearInterval(iv); return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(iv);
  }, [learningCC]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const set = <K extends keyof EffectsSettings>(key: K, val: EffectsSettings[K]) =>
    onChange({ ...settings, [key]: val });
  const fmt = (n: number, d = 1) => n.toFixed(d);

  const panelStyle: React.CSSProperties = {
    position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
    zIndex: 100, minWidth: 290,
    background: 'rgba(3, 7, 25, 0.97)',
    border: '1px solid rgba(0,212,255,0.22)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 20px rgba(0,212,255,0.08)',
    backdropFilter: 'blur(20px)',
  };

  const [learnHover, setLearnHover] = useState(false);

  return (
    <div ref={ref} style={panelStyle}>
      {/* Title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px',
        background: 'linear-gradient(90deg, rgba(0,8,30,0.98) 0%, rgba(0,25,70,0.98) 100%)',
        borderBottom: '1px solid rgba(0,212,255,0.22)',
      }}>
        <span style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', color: '#00d4ff',
          textShadow: '0 0 8px rgba(0,212,255,0.5)',
        }}>FX CONTROLS</span>
        <button
          onClick={onClose}
          style={{
            width: 20, height: 20, borderRadius: 3,
            background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,80,80,0.3)',
            color: '#ff6060', fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>
      </div>

      <div style={{ padding: '4px 12px 10px' }}>

        {/* Visual */}
        <SectionLabel>Visual</SectionLabel>
        <SliderRow label="Color Speed" value={settings.colorSpeed} min={0} max={3} step={0.05} display={`${fmt(settings.colorSpeed)}×`} onChange={v => set('colorSpeed', v)} />
        <SliderRow label="Rotation"    value={settings.rotSpeed}   min={0} max={3} step={0.05} display={`${fmt(settings.rotSpeed)}×`}   onChange={v => set('rotSpeed', v)} />
        <SliderRow label="Scale"       value={settings.scale}      min={0.2} max={2.5} step={0.05} display={`${fmt(settings.scale)}×`}   onChange={v => set('scale', v)} />
        <SliderRow label="Brightness"  value={settings.brightness} min={0.2} max={1.5} step={0.05} display={fmt(settings.brightness)}    onChange={v => set('brightness', v)} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ width: 100, flexShrink: 0, fontSize: 11, fontFamily: "'Inter', sans-serif", color: 'rgba(150,185,220,0.85)' }}>Segments</span>
          <input type="range" min={0} max={8} step={1} value={settings.segments} onChange={e => set('segments', parseInt(e.target.value))} style={{ flex: 1, height: 14 }} />
          <span style={{ width: 38, textAlign: 'right', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(0,212,255,0.8)' }}>
            {settings.segments === 0 ? 'rand' : settings.segments}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ width: 100, flexShrink: 0, fontSize: 11, fontFamily: "'Inter', sans-serif", color: 'rgba(150,185,220,0.85)' }}>Blend Mode</span>
          <select value={settings.blendMode} onChange={e => set('blendMode', e.target.value)} style={{ flex: 1, height: 24 }}>
            {BLEND_MODE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Behaviour */}
        <SectionLabel>Behaviour</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ width: 100, flexShrink: 0, fontSize: 11, fontFamily: "'Inter', sans-serif", color: 'rgba(150,185,220,0.85)' }}>Max Effects</span>
          <input type="range" min={1} max={5} step={1} value={settings.maxEffects} onChange={e => set('maxEffects', parseInt(e.target.value))} style={{ flex: 1, height: 14 }} />
          <span style={{ width: 38, textAlign: 'right', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(0,212,255,0.8)' }}>{settings.maxEffects}</span>
        </div>
        <SliderRow label="Fade Time" value={settings.fadeDuration} min={0.1} max={3} step={0.1} display={`${fmt(settings.fadeDuration)}s`} onChange={v => set('fadeDuration', v)} />

        {/* Mic */}
        <SectionLabel>Mic Trigger</SectionLabel>
        <div style={{ opacity: micActive ? 1 : 0.38 }} title={micActive ? undefined : 'Sensitivity only applies in mic mode'}>
          <SliderRow label="Sensitivity"   value={settings.micThreshold} min={0.05} max={0.5} step={0.01} display={fmt(settings.micThreshold, 2)} onChange={v => set('micThreshold', v)} disabled={!micActive} />
          <SliderRow label="Fractal Depth" value={settings.fractalDepth} min={1}    max={4}   step={1}    display={String(settings.fractalDepth)}   onChange={v => set('fractalDepth', Math.round(v))} disabled={!micActive} />
        </div>
        {!micActive && (
          <span style={{ fontSize: 9, color: 'rgba(0,212,255,0.35)', marginLeft: 108, display: 'block', marginTop: -2 }}>mic mode only</span>
        )}

        {/* MIDI CC */}
        <SectionLabel>MIDI Clear FX</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ width: 100, flexShrink: 0, fontSize: 11, fontFamily: "'Inter', sans-serif", color: 'rgba(150,185,220,0.85)' }}>CC Trigger</span>
          <input
            type="number" min={-1} max={127} value={clearFxCC}
            onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) onChangeClearFxCC(Math.max(-1, Math.min(127, v))); }}
            style={{ width: 50, height: 24, textAlign: 'center' }}
            title="MIDI CC number that triggers Clear FX (0–127, or -1 to disable)"
          />
          <button
            onClick={onStartLearnCC}
            onMouseEnter={() => setLearnHover(true)}
            onMouseLeave={() => setLearnHover(false)}
            style={{
              height: 24, padding: '0 8px', borderRadius: 3, cursor: 'pointer',
              fontSize: 11, fontFamily: "'Inter', sans-serif",
              background: learningCC ? 'rgba(0,212,255,0.22)' : learnHover ? 'rgba(0,212,255,0.14)' : 'rgba(0,212,255,0.07)',
              border: `1px solid rgba(0,212,255,${learningCC ? '0.7' : '0.3'})`,
              color: '#00d4ff',
              boxShadow: learningCC ? '0 0 12px rgba(0,212,255,0.3)' : 'none',
              transition: 'all 0.15s',
            }}
            title="Click then press a pedal/controller to auto-detect CC"
          >
            {learningCC ? `⏳ ${countdown}s` : 'Learn'}
          </button>
        </div>
        <span style={{ fontSize: 9, color: 'rgba(150,185,220,0.4)', marginLeft: 108, display: 'block', marginTop: 1 }}>
          {learningCC
            ? `Listening… ${countdown}s remaining`
            : clearFxCC < 0
              ? 'Set 0–127 to enable, or click Learn'
              : `CC ${clearFxCC}${clearFxCC === 64 ? ' (sustain)' : ''} · fires on value > 0`}
        </span>

        {/* Reset */}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => onChange(DEFAULT_EFFECTS_SETTINGS)}
            style={{
              height: 26, padding: '0 14px', borderRadius: 3, cursor: 'pointer',
              fontSize: 11, fontFamily: "'Inter', sans-serif",
              background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.25)',
              color: '#00d4ff', transition: 'all 0.15s',
            }}
          >Reset Defaults</button>
        </div>
      </div>
    </div>
  );
}
