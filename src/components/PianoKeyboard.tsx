import React, { useRef, useEffect } from 'react';

const WKW = 22;
const BKW = 13;
const WKH = 100;
const BKH = 63;

const NOTE_NAMES  = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const IS_BLACK    = [false,true,false,true,false,false,true,false,true,false,true,false];
const SEMI_POS    = [0, 0.65, 1, 1.65, 2, 3, 3.65, 4, 4.65, 5, 5.65, 6];

type PianoKeyboardProps = {
  activeNotes: Set<number>;
  onNoteDown: (note: number) => void;
  onNoteUp:   (note: number) => void;
  mediaAssignments?: Map<number, any>;
  selectedNoteForMedia?: number;
  onNoteSelect?: (note: number) => void;
  startOctave?: number;
  endOctave?:   number;
};

export function PianoKeyboard({
  activeNotes, onNoteDown, onNoteUp,
  mediaAssignments = new Map(),
  selectedNoteForMedia,
  onNoteSelect,
  startOctave = 1,
  endOctave   = 7,
}: PianoKeyboardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const startMidi  = 12 * (startOctave + 1);
  const endMidi    = 12 * (endOctave   + 2) - 1;
  const numOctaves = endOctave - startOctave + 1;
  const totalW     = numOctaves * 7 * WKW;

  type KeyInfo = { note: number; isBlack: boolean; leftPx: number; name: string; octave: number };
  const keys: KeyInfo[] = [];
  for (let note = startMidi; note <= endMidi; note++) {
    const semi    = note % 12;
    const oct     = Math.floor(note / 12) - 1;
    const octsFrom = oct - startOctave;
    const leftPx  = (octsFrom * 7 + SEMI_POS[semi]) * WKW;
    keys.push({ note, isBlack: IS_BLACK[semi], leftPx, name: NOTE_NAMES[semi], octave: oct });
  }

  const whiteKeys = keys.filter(k => !k.isBlack);
  const blackKeys = keys.filter(k =>  k.isBlack);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const c4Left = (4 - startOctave) * 7 * WKW;
    el.scrollLeft = Math.max(0, c4Left - el.clientWidth / 4);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const press   = (note: number, e?: React.MouseEvent) => {
    if (e && e.button !== 0) return;
    onNoteDown(note);
    onNoteSelect?.(note);
  };
  const release = (note: number) => onNoteUp(note);

  return (
    <div
      ref={scrollRef}
      style={{
        width: '100%',
        overflowX: 'auto',
        background: 'rgba(0,5,18,0.95)',
        borderTop: '1px solid rgba(0,212,255,0.15)',
        height: WKH + 10,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'relative', width: totalW, height: WKH }}>

        {/* ── White keys ── */}
        {whiteKeys.map((k, i) => {
          const active   = activeNotes.has(k.note);
          const selected = selectedNoteForMedia === k.note;
          const hasMedia = mediaAssignments.has(k.note);

          let bg = '#d8e8f0';
          let shadow = 'inset 0 -4px 0 rgba(0,0,0,0.25)';
          if (active) {
            bg = '#00d4ff';
            shadow = '0 0 18px rgba(0,212,255,0.9), inset 0 -4px 0 rgba(0,120,200,0.6)';
          } else if (selected) {
            bg = 'rgba(168,85,247,0.25)';
            shadow = '0 0 10px rgba(168,85,247,0.5), inset 0 -4px 0 rgba(120,60,200,0.4)';
          }

          return (
            <div
              key={k.note}
              style={{
                position: 'absolute', top: 0,
                left: k.leftPx, width: WKW, height: WKH,
                background: bg,
                boxShadow: shadow,
                borderRight: '1px solid rgba(0,0,0,0.5)',
                borderBottom: '2px solid rgba(0,0,0,0.3)',
                borderLeft: i === 0 ? '1px solid rgba(0,0,0,0.5)' : undefined,
                zIndex: 1,
                cursor: 'pointer',
                transition: 'background 0.05s, box-shadow 0.05s',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                alignItems: 'center', paddingBottom: 4,
              }}
              onMouseDown={e => press(k.note, e)}
              onMouseUp={() => release(k.note)}
              onMouseLeave={() => release(k.note)}
              onTouchStart={e => { e.preventDefault(); press(k.note); }}
              onTouchEnd={e   => { e.preventDefault(); release(k.note); }}
            >
              {hasMedia && (
                <div style={{
                  position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#00ff88', boxShadow: '0 0 6px rgba(0,255,136,0.8)',
                }} />
              )}
              {k.name === 'C' && (
                <span style={{
                  fontSize: 8, lineHeight: 1.2, pointerEvents: 'none',
                  color: active ? '#003040' : 'rgba(0,20,40,0.4)',
                  fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                }}>
                  C{k.octave}
                </span>
              )}
            </div>
          );
        })}

        {/* ── Black keys ── */}
        {blackKeys.map((k) => {
          const active   = activeNotes.has(k.note);
          const selected = selectedNoteForMedia === k.note;
          const hasMedia = mediaAssignments.has(k.note);

          let bg = 'linear-gradient(180deg, #0a0a18 0%, #141428 100%)';
          let shadow = '0 4px 8px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)';
          if (active) {
            bg = 'linear-gradient(180deg, #a855f7 0%, #7c3aed 100%)';
            shadow = '0 0 16px rgba(168,85,247,0.8), 0 4px 8px rgba(0,0,0,0.6)';
          } else if (selected) {
            bg = 'linear-gradient(180deg, #4c1d95 0%, #2e1065 100%)';
            shadow = '0 0 10px rgba(168,85,247,0.4)';
          }

          return (
            <div
              key={k.note}
              style={{
                position: 'absolute', top: 0,
                left: k.leftPx - BKW / 2, width: BKW, height: BKH,
                background: bg,
                boxShadow: shadow,
                border: '1px solid rgba(0,0,0,0.8)',
                borderBottom: active ? 'none' : '3px solid rgba(0,0,0,0.6)',
                zIndex: 2,
                cursor: 'pointer',
                transition: 'background 0.05s, box-shadow 0.05s',
                display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
                paddingBottom: 3,
              }}
              onMouseDown={e => press(k.note, e)}
              onMouseUp={() => release(k.note)}
              onMouseLeave={() => release(k.note)}
              onTouchStart={e => { e.preventDefault(); press(k.note); }}
              onTouchEnd={e   => { e.preventDefault(); release(k.note); }}
            >
              {hasMedia && (
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: '#00ff88', boxShadow: '0 0 5px rgba(0,255,136,0.9)',
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
