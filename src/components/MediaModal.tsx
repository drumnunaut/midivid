import React, { useState, useRef, useEffect } from 'react';
import { Win95Window } from './Win95Window';
import { PianoKeyboard } from './PianoKeyboard';

type MediaEntry = { type: 'image' | 'video'; url: string; file: File }
               | { type: 'camera'; url: ''; file: null };

type MediaModalProps = {
  isOpen: boolean;
  onClose: () => void;
  selectedNote: number | null;
  mediaAssignments: Map<number, MediaEntry>;
  onAssign: (note: number, file: File) => void;
  onAssignCamera: (note: number) => void;
  onClear: (note: number) => void;
  onClearAll: () => void;
};

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const formatNote = (note: number) => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

// Supported media types for folder import
const isMediaFile = (f: File) =>
  f.type.startsWith('image/') || f.type.startsWith('video/');

export function MediaModal({
  isOpen, onClose, selectedNote, mediaAssignments, onAssign, onAssignCamera, onClear, onClearAll,
}: MediaModalProps) {
  const [activeNote, setActiveNote]   = useState<number | null>(selectedNote ?? 60);
  const [folderMsg,  setFolderMsg]    = useState<string>('');

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Follow caller's selectedNote when modal opens / note changes
  useEffect(() => {
    if (selectedNote !== null) setActiveNote(selectedNote);
  }, [selectedNote]);

  if (!isOpen) return null;

  const assignment    = activeNote !== null ? mediaAssignments.get(activeNote) ?? null : null;
  const assignedCount = mediaAssignments.size;

  // ── Single-file assign ────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeNote !== null) {
      onAssign(activeNote, file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Folder assign ─────────────────────────────────────────────────────────
  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Array.from(e.target.files ?? []);
    if (raw.length === 0) return;

    // Keep only image/video, sort alphabetically by filename
    const media = raw
      .filter(isMediaFile)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (media.length === 0) {
      setFolderMsg('No image or video files found in folder.');
      if (folderInputRef.current) folderInputRef.current.value = '';
      return;
    }

    const start = activeNote ?? 36; // default C2 if nothing selected
    const end   = Math.min(start + media.length - 1, 107); // B7 ceiling
    const count = end - start + 1;

    media.slice(0, count).forEach((file, i) => onAssign(start + i, file));

    const skipped = media.length - count;
    setFolderMsg(
      `Assigned ${count} file${count !== 1 ? 's' : ''} · ${formatNote(start)}–${formatNote(end)}` +
      (skipped > 0 ? ` (${skipped} skipped — beyond keyboard range)` : ''),
    );

    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleKeySelect = (note: number) => {
    setActiveNote(note);
    setFolderMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClear = () => {
    if (activeNote !== null) onClear(activeNote);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} />

      <div className="relative z-10 w-[700px]">
        <Win95Window title="Assign Media to Keys" onClose={onClose}>
          <div className="p-3 flex flex-col gap-3">

            {/* ── Top row: preview + buttons ─────────────────────────────── */}
            <div className="flex gap-3">

              {/* Left: key display + preview */}
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex gap-2 items-center">
                  <span className="text-[11px] shrink-0 font-bold">Key:</span>
                  <div className="flex-1 win95-inset bg-[#e8e8e8] px-2 py-0.5 font-bold text-[11px] truncate">
                    {activeNote !== null
                      ? `${formatNote(activeNote)} (MIDI ${activeNote})`
                      : 'Click a key below to select it'}
                  </div>
                </div>

                {/* Preview */}
                <div className="win95-deep-inset h-[110px] flex items-center justify-center bg-black overflow-hidden">
                  {assignment ? (
                    assignment.type === 'image'
                      ? <img src={assignment.url} alt="preview" className="max-w-full max-h-full object-contain" />
                      : assignment.type === 'video'
                        ? <video src={assignment.url} autoPlay loop muted className="max-w-full max-h-full object-contain" />
                        : (
                          <div className="flex flex-col items-center gap-1">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00cc66" strokeWidth="1.5">
                              <rect x="2" y="6" width="14" height="12" rx="1"/>
                              <path d="M16 10l6-3v10l-6-3V10z"/>
                            </svg>
                            <span className="text-[#00cc66] text-[10px] font-bold">Live Camera</span>
                          </div>
                        )
                  ) : (
                    <span className="text-[#505050] text-[11px]">
                      {activeNote !== null ? 'No media assigned' : 'Select a key first'}
                    </span>
                  )}
                </div>

                {/* Status line */}
                <div className="text-[10px] text-[#606060] min-h-[14px]">
                  {folderMsg
                    ? <span className="text-[#004000]">{folderMsg}</span>
                    : assignedCount === 0
                      ? 'No keys assigned yet'
                      : `${assignedCount} key${assignedCount !== 1 ? 's' : ''} assigned  ·  teal dot = has media`}
                </div>
              </div>

              {/* Right: action buttons */}
              <div className="flex flex-col gap-2 w-[106px] shrink-0">

                {/* Hidden inputs */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                />
                {/* webkitdirectory is not in React's typedefs but is valid in all major browsers */}
                <input
                  type="file"
                  ref={folderInputRef}
                  className="hidden"
                  multiple
                  {...({'webkitdirectory': ''} as React.InputHTMLAttributes<HTMLInputElement>)}
                  onChange={handleFolderChange}
                />

                {/* Single-file */}
                <div className="text-[9px] text-[#606060] mt-1 font-bold uppercase tracking-wide">Single Key</div>
                <button
                  className="win95-button text-[11px]"
                  disabled={activeNote === null}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse…
                </button>
                <button
                  className="win95-button text-[11px]"
                  disabled={activeNote === null}
                  title="Use your webcam as a live visual source for this key"
                  onClick={() => { if (activeNote !== null) { onAssignCamera(activeNote); setFolderMsg(''); } }}
                >
                  Live Camera
                </button>
                <button
                  className="win95-button text-[11px]"
                  disabled={activeNote === null || !assignment}
                  onClick={handleClear}
                >
                  Clear Key
                </button>

                {/* Divider */}
                <div className="border-t border-[#808080] my-1" />

                {/* Folder */}
                <div className="text-[9px] text-[#606060] font-bold uppercase tracking-wide">Folder Fill</div>
                <button
                  className="win95-button text-[11px] text-left leading-tight py-1"
                  title="Upload a folder — files are sorted alphabetically and assigned to consecutive keys starting from the selected key"
                  onClick={() => folderInputRef.current?.click()}
                >
                  Upload Folder…
                </button>
                <div className="text-[9px] text-[#606060] leading-tight">
                  Fills keys from selected note up, A–Z order
                </div>

                {/* Divider */}
                <div className="border-t border-[#808080] my-1" />

                {/* Clear all */}
                <button
                  className="win95-button text-[11px]"
                  disabled={assignedCount === 0}
                  onClick={() => { onClearAll(); setFolderMsg(''); }}
                  title="Remove all media assignments from every key"
                >
                  Clear All
                </button>

                <div className="flex-1" />
                <button
                  className="win95-button text-[11px] font-bold"
                  onClick={onClose}
                >
                  OK
                </button>
              </div>
            </div>

            {/* ── Divider ──────────────────────────────────────────────────── */}
            <div className="border-t border-[#808080]" />

            {/* ── Keyboard ─────────────────────────────────────────────────── */}
            <div>
              <div className="text-[10px] text-[#606060] mb-1">
                Click a key to select it · <strong>Browse…</strong> assigns one file · <strong>Upload Folder…</strong> fills from this key up
              </div>
              <PianoKeyboard
                activeNotes={new Set<number>()}
                onNoteDown={() => {}}
                onNoteUp={() => {}}
                mediaAssignments={mediaAssignments}
                selectedNoteForMedia={activeNote ?? undefined}
                onNoteSelect={handleKeySelect}
              />
            </div>

          </div>
        </Win95Window>
      </div>
    </div>
  );
}
