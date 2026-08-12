import React, { useState, useEffect } from 'react';
import {
  HotkeyMap, ActionId, ALL_ACTIONS, ACTION_LABELS,
  DEFAULT_HOTKEYS, formatCode, formatNote,
} from '../hooks/useHotkeys';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Find which key code (if any) is bound to a given action. */
function codeForAction(map: HotkeyMap, actionId: ActionId): string | null {
  for (const [code, e] of Object.entries(map))
    if (e.type === 'action' && e.actionId === actionId) return code;
  return null;
}

/** All note bindings sorted by note, then key. */
function noteRows(map: HotkeyMap): { code: string; note: number }[] {
  return Object.entries(map)
    .filter(([, e]) => e.type === 'note')
    .map(([code, e]) => ({ code, note: (e as { type: 'note'; note: number }).note }))
    .sort((a, b) => a.note - b.note || a.code.localeCompare(b.code));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KeyBadge({ code, pulse }: { code: string; pulse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[28px] h-[18px] px-1.5
        win95-outset text-[10px] font-mono font-bold select-none
        ${pulse ? 'bg-yellow-300 text-black animate-pulse' : 'bg-[#c0c0c0] text-black'}`}
    >
      {pulse ? '…' : formatCode(code)}
    </span>
  );
}

// ── Capture state ─────────────────────────────────────────────────────────────

type CaptureTarget =
  | { kind: 'rebind';      oldCode: string }
  | { kind: 'bind-action'; actionId: ActionId }
  | { kind: 'add-note';    note: number };

// ── Build MIDI note option list once ─────────────────────────────────────────

const NOTE_OPTIONS: { value: number; label: string }[] = [];
for (let n = 24; n <= 107; n++)
  NOTE_OPTIONS.push({ value: n, label: `${formatNote(n)}  (MIDI ${n})` });

// ── Modal ─────────────────────────────────────────────────────────────────────

type Props = {
  isOpen:   boolean;
  onClose:  () => void;
  hotkeys:  HotkeyMap;
  onChange: (map: HotkeyMap) => void;
  onReset:  () => void;
};

export function HotkeysModal({ isOpen, onClose, hotkeys, onChange, onReset }: Props) {
  const [capture,   setCapture]   = useState<CaptureTarget | null>(null);
  const [isAdding,  setIsAdding]  = useState(false);
  const [addNote,   setAddNote]   = useState<number>(60);

  // ── Global key capture ────────────────────────────────────────────────────
  useEffect(() => {
    if (!capture) return;
    const handle = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') { setCapture(null); return; }

      const next = { ...hotkeys };

      if (capture.kind === 'rebind') {
        const entry = next[capture.oldCode];
        if (!entry) { setCapture(null); return; }
        delete next[capture.oldCode];
        delete next[e.code];
        next[e.code] = entry;
      } else if (capture.kind === 'bind-action') {
        delete next[e.code];
        next[e.code] = { type: 'action', actionId: capture.actionId };
      } else {
        // add-note
        delete next[e.code];
        next[e.code] = { type: 'note', note: capture.note };
        setIsAdding(false);
      }

      onChange(next);
      setCapture(null);
    };
    window.addEventListener('keydown', handle, { capture: true });
    return () => window.removeEventListener('keydown', handle, { capture: true });
  }, [capture, hotkeys, onChange]);

  if (!isOpen) return null;

  const clear = (code: string) => { const n = { ...hotkeys }; delete n[code]; onChange(n); };
  const notes = noteRows(hotkeys);
  const busy  = !!capture;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative z-10 w-[580px] flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* ── Win95 chrome ── */}
        <div className="win95-outset bg-[#c0c0c0] flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>

          {/* Title bar */}
          <div className="win95-titlebar flex items-center justify-between px-2 py-0.5 shrink-0">
            <span className="text-[11px] font-bold tracking-wide">Configure Hotkeys</span>
            <button
              className="w-[16px] h-[14px] win95-outset flex items-center justify-center text-black font-bold text-[11px]"
              onClick={onClose}
            >×</button>
          </div>

          <div className="p-3 flex flex-col gap-3 text-[11px] overflow-y-auto">

            {/* Capture banner */}
            {capture && (
              <div className="win95-inset bg-yellow-100 text-center py-1 text-[11px]">
                🎹 <strong>Press any key</strong> to assign it · <strong>Esc</strong> to cancel
              </div>
            )}

            {/* ── App Actions ─────────────────────────────────────────── */}
            <section>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#555] mb-1">App Actions</div>
              <div className="win95-inset bg-white">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#c0c0c0]">
                      <th className="text-left px-2 py-[2px] text-[10px] w-[52px]">Key</th>
                      <th className="text-left px-2 py-[2px] text-[10px]">Action</th>
                      <th className="w-[90px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {ALL_ACTIONS.map(actionId => {
                      const code  = codeForAction(hotkeys, actionId);
                      const pulse = busy && capture?.kind !== 'add-note' &&
                        ((capture?.kind === 'rebind'      && capture.oldCode === code) ||
                         (capture?.kind === 'bind-action' && capture.actionId === actionId));
                      return (
                        <tr key={actionId}
                          className={`border-t border-[#e0e0e0] ${pulse ? 'bg-yellow-50' : 'hover:bg-[#f5f5f5]'}`}
                        >
                          <td className="px-2 py-[2px]">
                            {code
                              ? <KeyBadge code={code} pulse={pulse} />
                              : <span className="text-[#aaa] font-mono">—</span>}
                          </td>
                          <td className="px-2 py-[2px]">{ACTION_LABELS[actionId]}</td>
                          <td className="px-2 py-[2px]">
                            <div className="flex gap-1 justify-end">
                              <button
                                className="win95-button text-[10px] px-1.5 py-0 h-[16px]"
                                disabled={busy}
                                onClick={() =>
                                  code
                                    ? setCapture({ kind: 'rebind',      oldCode: code })
                                    : setCapture({ kind: 'bind-action', actionId })
                                }
                              >{code ? 'Rebind' : 'Bind…'}</button>
                              {code && (
                                <button
                                  className="win95-button text-[10px] px-1.5 py-0 h-[16px]"
                                  disabled={busy}
                                  onClick={() => clear(code)}
                                >×</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Note Keys ───────────────────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#555]">Note Keys</div>
                <button
                  className="win95-button text-[10px] px-2 py-0 h-[16px]"
                  disabled={busy || isAdding}
                  onClick={() => setIsAdding(true)}
                >+ Add</button>
              </div>

              <div className="win95-inset bg-white" style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-[#c0c0c0]">
                    <tr>
                      <th className="text-left px-2 py-[2px] text-[10px] w-[52px]">Key</th>
                      <th className="text-left px-2 py-[2px] text-[10px] w-[52px]">Note</th>
                      <th className="text-left px-2 py-[2px] text-[10px] text-[#888]">MIDI#</th>
                      <th className="w-[90px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {notes.length === 0 && !isAdding && (
                      <tr><td colSpan={4} className="px-2 py-2 text-[#888] text-center">No note keys assigned</td></tr>
                    )}

                    {notes.map(({ code, note }) => {
                      const pulse = capture?.kind === 'rebind' && capture.oldCode === code;
                      return (
                        <tr key={code}
                          className={`border-t border-[#e0e0e0] ${pulse ? 'bg-yellow-50' : 'hover:bg-[#f5f5f5]'}`}
                        >
                          <td className="px-2 py-[2px]"><KeyBadge code={code} pulse={pulse} /></td>
                          <td className="px-2 py-[2px] font-mono font-bold">{formatNote(note)}</td>
                          <td className="px-2 py-[2px] text-[#888]">{note}</td>
                          <td className="px-2 py-[2px]">
                            <div className="flex gap-1 justify-end">
                              <button
                                className="win95-button text-[10px] px-1.5 py-0 h-[16px]"
                                disabled={busy}
                                onClick={() => setCapture({ kind: 'rebind', oldCode: code })}
                              >Rebind</button>
                              <button
                                className="win95-button text-[10px] px-1.5 py-0 h-[16px]"
                                disabled={busy}
                                onClick={() => clear(code)}
                              >×</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Add-note form row */}
                    {isAdding && (
                      <tr className="border-t border-[#e0e0e0] bg-[#f0f8ff]">
                        <td className="px-2 py-[3px]">
                          {capture?.kind === 'add-note'
                            ? <KeyBadge code="..." pulse />
                            : (
                              <button
                                className="win95-button text-[10px] px-1.5 py-0 h-[18px] whitespace-nowrap"
                                disabled={busy}
                                onClick={() => setCapture({ kind: 'add-note', note: addNote })}
                              >Press key…</button>
                            )
                          }
                        </td>
                        <td className="px-2 py-[3px]" colSpan={2}>
                          <select
                            className="win95-inset bg-white text-[10px] w-full h-[18px]"
                            value={addNote}
                            onChange={e => setAddNote(Number(e.target.value))}
                          >
                            {NOTE_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-[3px]">
                          <button
                            className="win95-button text-[10px] px-1.5 py-0 h-[16px]"
                            onClick={() => { setIsAdding(false); setCapture(null); }}
                          >Cancel</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Footer ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between pt-1 border-t border-[#808080] shrink-0">
              <button
                className="win95-button text-[11px]"
                onClick={() => { onReset(); setCapture(null); setIsAdding(false); }}
              >Reset to Defaults</button>
              <button className="win95-button text-[11px] w-16" onClick={onClose}>Close</button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
