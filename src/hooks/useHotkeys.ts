import { useState, useEffect, useCallback, useRef } from 'react';
import { InstrumentType } from './useAudioEngine';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionId =
  | 'play-pause'
  | 'stop'
  | 'viz-cycle'
  | 'inst-soft'
  | 'inst-sine'
  | 'inst-square'
  | 'inst-sawtooth'
  | 'clear-fx';

export type HotkeyEntry =
  | { type: 'action'; actionId: ActionId }
  | { type: 'note';   note: number };

export type HotkeyMap = Record<string, HotkeyEntry>;

// ── Metadata ──────────────────────────────────────────────────────────────────

export const ALL_ACTIONS: ActionId[] = [
  'play-pause', 'stop', 'viz-cycle',
  'inst-soft', 'inst-sine', 'inst-square', 'inst-sawtooth',
  'clear-fx',
];

export const ACTION_LABELS: Record<ActionId, string> = {
  'play-pause':    'Play / Pause',
  'stop':          'Stop',
  'viz-cycle':     'Cycle Visualizer Mode',
  'inst-soft':     'Instrument: Soft Synth',
  'inst-sine':     'Instrument: Sine Wave',
  'inst-square':   'Instrument: Square Wave',
  'inst-sawtooth': 'Instrument: Sawtooth',
  'clear-fx':      'Clear FX',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Find which key code (if any) is bound to a given action. */
export function codeForAction(map: HotkeyMap, actionId: ActionId): string | null {
  for (const [code, e] of Object.entries(map))
    if (e.type === 'action' && e.actionId === actionId) return code;
  return null;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export const formatNote = (n: number) =>
  `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

export function formatCode(code: string): string {
  if (code === 'Space')     return 'Space';
  if (code === 'Escape')    return 'Esc';
  if (code === 'Tab')       return 'Tab';
  if (code === 'Enter')     return 'Enter';
  if (code === 'Backspace') return 'BkSp';
  if (code === 'Delete')    return 'Del';
  if (code === 'ArrowUp')   return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight')return '→';
  if (code.startsWith('Key'))   return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const syms: Record<string, string> = {
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
    Quote: "'", BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  };
  return syms[code] ?? code;
}

// ── Defaults ──────────────────────────────────────────────────────────────────
// Classic two-row piano layout. Actions use Space/Esc/Tab so the letter keys
// are free for note playing.

export const DEFAULT_HOTKEYS: HotkeyMap = {
  // Actions
  Space:    { type: 'action', actionId: 'play-pause' },
  Escape:   { type: 'action', actionId: 'stop' },
  Tab:      { type: 'action', actionId: 'viz-cycle' },
  Digit1:   { type: 'action', actionId: 'inst-soft' },
  Digit2:   { type: 'action', actionId: 'inst-sine' },
  Digit3:   { type: 'action', actionId: 'inst-square' },
  Digit4:   { type: 'action', actionId: 'inst-sawtooth' },
  Delete:   { type: 'action', actionId: 'clear-fx' },
  // Bottom row  Z X C V B N M , . /
  KeyZ:     { type: 'note', note: 48 }, // C3
  KeyX:     { type: 'note', note: 50 }, // D3
  KeyC:     { type: 'note', note: 52 }, // E3
  KeyV:     { type: 'note', note: 53 }, // F3
  KeyB:     { type: 'note', note: 55 }, // G3
  KeyN:     { type: 'note', note: 57 }, // A3
  KeyM:     { type: 'note', note: 59 }, // B3
  Comma:    { type: 'note', note: 60 }, // C4
  Period:   { type: 'note', note: 62 }, // D4
  Slash:    { type: 'note', note: 64 }, // E4
  // Top row  A W S E D F T G Y H U J K O L P ;
  KeyA:     { type: 'note', note: 60 }, // C4
  KeyW:     { type: 'note', note: 61 }, // C#4
  KeyS:     { type: 'note', note: 62 }, // D4
  KeyE:     { type: 'note', note: 63 }, // D#4
  KeyD:     { type: 'note', note: 64 }, // E4
  KeyF:     { type: 'note', note: 65 }, // F4
  KeyT:     { type: 'note', note: 66 }, // F#4
  KeyG:     { type: 'note', note: 67 }, // G4
  KeyY:     { type: 'note', note: 68 }, // G#4
  KeyH:     { type: 'note', note: 69 }, // A4
  KeyU:     { type: 'note', note: 70 }, // A#4
  KeyJ:     { type: 'note', note: 71 }, // B4
  KeyK:     { type: 'note', note: 72 }, // C5
  KeyO:     { type: 'note', note: 73 }, // C#5
  KeyL:     { type: 'note', note: 74 }, // D5
  KeyP:     { type: 'note', note: 75 }, // D#5
  Semicolon:{ type: 'note', note: 76 }, // E5
};

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'midivid-hotkeys-v1';

function loadMap(): HotkeyMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as HotkeyMap;
  } catch {}
  return DEFAULT_HOTKEYS;
}

function saveMap(map: HotkeyMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────────

type Callbacks = {
  onPlayPause:  () => void;
  onStop:       () => void;
  onVizCycle:   () => void;
  onInstrument: (i: InstrumentType) => void;
  onNoteOn:     (note: number) => void;
  onNoteOff:    (note: number) => void;
  onClearFX:    () => void;
  /** When true the hook ignores key events (e.g. while the config modal is open). */
  disabled?:    boolean;
};

export function useHotkeys(callbacks: Callbacks) {
  const [hotkeys, setHotkeysState] = useState<HotkeyMap>(loadMap);

  // Keep stable refs so the effect closure never goes stale
  const cbRef  = useRef(callbacks);
  cbRef.current = callbacks;

  const mapRef = useRef(hotkeys);
  mapRef.current = hotkeys;

  // Track which physical keys are currently held so keyup can stop the right note
  const heldRef = useRef<Set<string>>(new Set());

  const setHotkeys = useCallback((map: HotkeyMap) => {
    setHotkeysState(map);
    saveMap(map);
  }, []);

  const resetHotkeys = useCallback(() => {
    setHotkeysState(DEFAULT_HOTKEYS);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (cbRef.current.disabled) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (heldRef.current.has(e.code)) return; // ignore auto-repeat
      heldRef.current.add(e.code);

      const entry = mapRef.current[e.code];
      if (!entry) return;

      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();

      if (entry.type === 'note') {
        cbRef.current.onNoteOn(entry.note);
      } else {
        switch (entry.actionId) {
          case 'play-pause':    cbRef.current.onPlayPause();           break;
          case 'stop':          cbRef.current.onStop();                break;
          case 'viz-cycle':     cbRef.current.onVizCycle();            break;
          case 'inst-soft':     cbRef.current.onInstrument('soft');    break;
          case 'inst-sine':     cbRef.current.onInstrument('sine');    break;
          case 'inst-square':   cbRef.current.onInstrument('square');  break;
          case 'inst-sawtooth': cbRef.current.onInstrument('sawtooth');break;
          case 'clear-fx':      cbRef.current.onClearFX();             break;
        }
      }
    };

    const up = (e: KeyboardEvent) => {
      const wasHeld = heldRef.current.delete(e.code);
      if (!wasHeld) return;
      if (cbRef.current.disabled) return;
      const entry = mapRef.current[e.code];
      if (entry?.type === 'note') cbRef.current.onNoteOff(entry.note);
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup',   up);
    };
  }, []); // stable — all mutable state accessed via refs

  return { hotkeys, setHotkeys, resetHotkeys };
}
