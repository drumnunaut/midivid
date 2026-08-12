import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Win95Window }     from '../components/Win95Window';
import { MenuBar }         from '../components/MenuBar';
import { PianoKeyboard }   from '../components/PianoKeyboard';
import { TransportBar }    from '../components/TransportBar';
import { VisualizerCanvas, VizMode } from '../components/VisualizerCanvas';
import { EffectsSettings, DEFAULT_EFFECTS_SETTINGS } from '../types/effects';
import { MediaModal }      from '../components/MediaModal';
import { HotkeysModal }    from '../components/HotkeysModal';
import { useAudioEngine }  from '../hooks/useAudioEngine';
import { useMIDI }         from '../hooks/useMIDI';
import { useHotkeys }      from '../hooks/useHotkeys';
import { UpdateBanner }    from '../components/UpdateBanner';
import { Song }            from '../data/songs';
import {
  loadEffectsSettings, saveEffectsSettings,
  persistMediaFile, persistCameraAssignment,
  removePersistedMedia, clearAllPersistedMedia, loadPersistedMedia,
} from '../lib/persistence';

// ── Space-age modal dialog ─────────────────────────────────────────────────────
function SpaceDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,5,20,0.6)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />
      <div style={{
        position: 'relative', zIndex: 201, width: 400,
        background: 'rgba(4, 8, 28, 0.97)',
        border: '1px solid rgba(0,212,255,0.3)',
        boxShadow: '0 0 60px rgba(0,212,255,0.12), 0 20px 60px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'linear-gradient(90deg, rgba(0,8,30,0.98) 0%, rgba(0,25,70,0.98) 100%)',
          borderBottom: '1px solid rgba(0,212,255,0.25)',
        }}>
          <span style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', color: '#00d4ff',
            textShadow: '0 0 8px rgba(0,212,255,0.5)',
          }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              width: 22, height: 22, borderRadius: 3,
              background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,80,80,0.3)',
              color: '#ff6060', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>
        <div style={{ padding: 16, fontSize: 12, fontFamily: "'Inter', sans-serif", color: '#c8e0ff' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MIDIVidApp() {
  const engine = useAudioEngine();
  const midi   = useMIDI();

  const [vizMode, setVizMode]               = useState<VizMode>('piano-roll');
  type MediaEntry = { type: 'image'|'video'; url: string; file: File } | { type: 'camera'; url: ''; file: null };
  const [mediaAssignments, setMediaAssignments] = useState<Map<number, MediaEntry>>(new Map());
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isHotkeysOpen,    setIsHotkeysOpen]    = useState(false);
  const [selectedNote,     setSelectedNote]     = useState<number | null>(60);
  const [statusMsg,        setStatusMsg]        = useState('Ready');
  const [showAbout,        setShowAbout]        = useState(false);
  const [effectsSettings,  setEffectsSettings]  = useState<EffectsSettings>(loadEffectsSettings);

  // Persist FX settings whenever they change
  useEffect(() => { saveEffectsSettings(effectsSettings); }, [effectsSettings]);

  // Notes the user modified before the async restore finished — restore must
  // never resurrect an assignment the user has since changed or cleared.
  const touchedNotesRef = useRef<Set<number>>(new Set());
  const clearedAllRef   = useRef(false);
  // Mirror of the current assignments so unmount cleanup can revoke object URLs
  const assignmentsRef  = useRef<Map<number, MediaEntry>>(new Map());
  useEffect(() => { assignmentsRef.current = mediaAssignments; }, [mediaAssignments]);
  useEffect(() => () => {
    assignmentsRef.current.forEach((m) => { if (m.url) URL.revokeObjectURL(m.url); });
  }, []);

  // Restore media assignments from IndexedDB on startup
  useEffect(() => {
    let cancelled = false;
    loadPersistedMedia()
      .then((restored) => {
        if (cancelled || restored.length === 0 || clearedAllRef.current) return;
        const created: string[] = [];
        let count = 0;
        setMediaAssignments((prev) => {
          const next = new Map(prev);
          for (const entry of restored) {
            // Skip anything the user assigned or cleared while we were loading
            if (next.has(entry.note) || touchedNotesRef.current.has(entry.note)) continue;
            if (entry.type === 'camera') {
              next.set(entry.note, { type: 'camera', url: '', file: null });
            } else {
              const url = URL.createObjectURL(entry.file);
              created.push(url);
              next.set(entry.note, { type: entry.type, url, file: entry.file });
            }
            count++;
          }
          return next;
        });
        if (cancelled) { created.forEach((u) => URL.revokeObjectURL(u)); return; }
        if (count > 0) setStatusMsg(`Restored ${count} media assignment${count === 1 ? '' : 's'}`);
      })
      .catch(() => { /* first run or blocked storage — start clean */ });
    return () => { cancelled = true; };
  }, []);

  const persistFailed = useCallback(() => {
    setStatusMsg('Warning: could not save media for next session (storage full or blocked)');
  }, []);
  const [clearFxCC, setClearFxCC] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('midivid_clearFxCC');
      if (saved !== null) return parseInt(saved, 10);
    } catch {}
    return 64;
  });
  useEffect(() => {
    try { localStorage.setItem('midivid_clearFxCC', String(clearFxCC)); } catch {}
  }, [clearFxCC]);

  const [learningCC, setLearningCC] = useState(false);
  const learnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFXRef = useRef<(() => void) | null>(null);
  const handleClearFX = useCallback(() => {
    clearFXRef.current?.();
    setStatusMsg('FX cleared');
  }, []);

  const { hotkeys, setHotkeys, resetHotkeys } = useHotkeys({
    onPlayPause:  () => engine.togglePlayback(),
    onStop:       () => engine.stopPlayback(),
    onVizCycle:   () => setVizMode(m => {
      const modes: VizMode[] = ['piano-roll', 'bars', 'oscilloscope', 'media-show'];
      return modes[(modes.indexOf(m) + 1) % modes.length];
    }),
    onInstrument: engine.setInstrument,
    onNoteOn:     (note) => { engine.initAudio(); engine.playNoteRaw(note); },
    onNoteOff:    (note) => engine.stopNoteRaw(note),
    onClearFX:    handleClearFX,
    disabled:     isMediaModalOpen || isHotkeysOpen,
  });

  const handleMidiNoteOn  = useCallback((note: number, _vel: number) => {
    engine.initAudio(); engine.playNoteRaw(note);
  }, [engine.initAudio, engine.playNoteRaw]);

  const handleMidiNoteOff = useCallback((note: number) => {
    engine.stopNoteRaw(note);
  }, [engine.stopNoteRaw]);

  const handleMidiCC = useCallback((controller: number, value: number) => {
    if (learningCC && value > 0) {
      setClearFxCC(controller);
      setLearningCC(false);
      if (learnTimeoutRef.current) clearTimeout(learnTimeoutRef.current);
      setStatusMsg(`MIDI Learn: CC ${controller} mapped to Clear FX`);
      return;
    }
    if (clearFxCC >= 0 && controller === clearFxCC && value > 0) {
      clearFXRef.current?.();
      setStatusMsg(`CC ${controller} fired — FX cleared`);
    }
  }, [learningCC, clearFxCC, handleClearFX]);

  const handleStartLearnCC = useCallback(() => {
    if (learnTimeoutRef.current) clearTimeout(learnTimeoutRef.current);
    setLearningCC(true);
    setStatusMsg('MIDI Learn: waiting for CC input…');
    learnTimeoutRef.current = setTimeout(() => {
      setLearningCC(false);
      setStatusMsg('MIDI Learn: timed out');
    }, 5000);
  }, []);

  const handleCancelLearnCC = useCallback(() => {
    if (learnTimeoutRef.current) clearTimeout(learnTimeoutRef.current);
    setLearningCC(false);
    setStatusMsg('MIDI Learn: cancelled');
  }, []);

  useEffect(() => {
    midi.setListeners({ noteOn: handleMidiNoteOn, noteOff: handleMidiNoteOff, cc: handleMidiCC });
  }, [midi.setListeners, handleMidiNoteOn, handleMidiNoteOff, handleMidiCC]);

  const combinedActiveNotes = useMemo(
    () => new Set([...engine.activeNotes, ...midi.activeMidiNotes]),
    [engine.activeNotes, midi.activeMidiNotes],
  );

  const vizCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleNoteDown = (note: number) => { engine.initAudio(); engine.playNoteRaw(note); };
  const handleNoteUp   = (note: number) => engine.stopNoteRaw(note);

  const handleAssignMedia = (note: number, file: File) => {
    const url  = URL.createObjectURL(file);
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    setMediaAssignments(prev => {
      const next = new Map(prev);
      const old  = next.get(note);
      if (old && old.url) URL.revokeObjectURL(old.url);
      next.set(note, { type, url, file });
      return next;
    });
    touchedNotesRef.current.add(note);
    persistMediaFile(note, file).catch(persistFailed);
  };

  const handleAssignCamera = (note: number) => {
    setMediaAssignments(prev => {
      const next = new Map(prev);
      const old  = next.get(note);
      if (old && old.url) URL.revokeObjectURL(old.url);
      next.set(note, { type: 'camera', url: '', file: null });
      return next;
    });
    touchedNotesRef.current.add(note);
    persistCameraAssignment(note).catch(persistFailed);
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    setStatusMsg(`Camera assigned to ${names[note % 12]}${Math.floor(note / 12) - 1}`);
  };

  const handleClearMedia = (note: number) => {
    setMediaAssignments(prev => {
      const next = new Map(prev);
      const old  = next.get(note);
      if (old && old.url) URL.revokeObjectURL(old.url);
      next.delete(note);
      return next;
    });
    touchedNotesRef.current.add(note);
    removePersistedMedia(note).catch(() => {});
  };

  const handleClearAllMedia = () => {
    setMediaAssignments(prev => { prev.forEach(m => { if (m.url) URL.revokeObjectURL(m.url); }); return new Map(); });
    clearedAllRef.current = true;
    clearAllPersistedMedia().catch(() => {});
    setStatusMsg('All media cleared');
  };

  const handleLoadSong = (s: Song) => {
    engine.loadSong(s);
    setStatusMsg(`Loaded: ${s.name}`);
  };

  const handleToggleMic = useCallback(async () => {
    if (engine.audioInputActive && engine.audioInputMode === 'mic') {
      engine.stopAudioInput();
    } else {
      await engine.startAudioInput('mic');
    }
  }, [engine.audioInputActive, engine.audioInputMode, engine.startAudioInput, engine.stopAudioInput]);

  const openPopoutStage = () => {
    const canvas = vizCanvasRef.current;
    if (!canvas) { setStatusMsg('Canvas not ready — play a note first'); return; }
    const stream = (canvas as unknown as { captureStream(fps: number): MediaStream }).captureStream(30);
    const stage  = window.open('', 'MIDIVidStage', 'width=1280,height=720,menubar=no,toolbar=no,location=no');
    if (!stage) { setStatusMsg('Popout blocked — allow popups for this site'); return; }
    stage.document.write(`<!DOCTYPE html>
<html><head><title>MIDIVid Stage</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;overflow:hidden}
video{width:100vw;height:100vh;object-fit:contain;display:block}
.tip{position:fixed;top:8px;left:8px;color:#444;font:11px monospace;pointer-events:none;opacity:0;transition:opacity .3s}
body:hover .tip{opacity:1}</style></head>
<body><video id="v" autoplay muted playsinline></video>
<div class="tip">MIDIVid Stage · OBS: add as Browser Source</div></body></html>`);
    stage.document.close();
    const vid = stage.document.getElementById('v') as HTMLVideoElement;
    vid.srcObject = stream;
    vid.play().catch(() => {});
    setStatusMsg('Stage opened');
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    // Space background
    <div className="space-bg" style={{ zIndex: 0 }}>
      <div className="stars-layer" />
      <UpdateBanner />

      <Win95Window
        title="MIDIVid · Synthesizer & Visualizer"
        icon={
          <svg width="14" height="14" viewBox="0 0 16 16">
            <rect x="2" y="2" width="12" height="10" fill="none" stroke="#00d4ff" strokeWidth="1.5"/>
            <circle cx="8" cy="7" r="2" fill="#00d4ff"/>
            <path d="M2 12 l12 0" stroke="#00d4ff" strokeWidth="2"/>
          </svg>
        }
      >
        {/* ── Menu bar ── */}
        <MenuBar
          vizMode={vizMode}              onSetVizMode={setVizMode}
          instrument={engine.instrument} onSetInstrument={engine.setInstrument}
          currentSong={engine.currentSong} onLoadSong={handleLoadSong}
          onAssignMedia={() => setIsMediaModalOpen(true)}
          onPopout={openPopoutStage}
          onClearAllMedia={handleClearAllMedia}
          onShowAbout={() => setShowAbout(true)}
          onShowHotkeys={() => setIsHotkeysOpen(true)}
          onResetHotkeys={resetHotkeys}
          onToggleMaximize={() => {}}
        />

        {/* ── Main content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px', gap: 6, minHeight: 0 }}>

          {/* Visualizer */}
          <div style={{
            flex: 1, minHeight: 0, position: 'relative',
            background: '#000',
            border: '1px solid rgba(0,212,255,0.18)',
            boxShadow: '0 0 20px rgba(0,212,255,0.06), inset 0 0 40px rgba(0,0,0,0.4)',
          }}>
            <VisualizerCanvas
              mode={vizMode}
              analyser={engine.audioInputActive ? engine.audioInputAnalyser : engine.analyser}
              activeNotes={combinedActiveNotes}
              currentSong={engine.currentSong}
              currentTime={engine.currentTime}
              mediaAssignments={mediaAssignments}
              audioInputActive={engine.audioInputActive}
              effectsSettings={effectsSettings}
              stageRef={vizCanvasRef}
              clearFXRef={clearFXRef}
            />
          </div>

          <TransportBar
            isPlaying={engine.isPlaying}
            onPlayPause={engine.togglePlayback}
            onStop={engine.stopPlayback}
            progress={engine.progress}
            currentTime={engine.currentTime}
            totalDuration={engine.totalDuration}
            onSeek={engine.seek}
            currentSong={engine.currentSong}
            onSelectSong={handleLoadSong}
            instrument={engine.instrument}
            onSelectInstrument={engine.setInstrument}
            vizMode={vizMode}
            onSelectVizMode={setVizMode}
            onAssignMedia={() => setIsMediaModalOpen(true)}
            onPopout={openPopoutStage}
            volume={engine.volume}
            onSetVolume={engine.setVolume}
            micActive={engine.audioInputActive && engine.audioInputMode === 'mic'}
            onToggleMic={handleToggleMic}
            effectsSettings={effectsSettings}
            onChangeEffects={setEffectsSettings}
            clearFxCC={clearFxCC}
            onChangeClearFxCC={setClearFxCC}
            learningCC={learningCC}
            onStartLearnCC={handleStartLearnCC}
            onCancelLearnCC={handleCancelLearnCC}
            onClearFX={handleClearFX}
            hotkeys={hotkeys}
          />

          <PianoKeyboard
            activeNotes={combinedActiveNotes}
            onNoteDown={handleNoteDown}
            onNoteUp={handleNoteUp}
            mediaAssignments={mediaAssignments}
            selectedNoteForMedia={isMediaModalOpen && selectedNote !== null ? selectedNote : undefined}
            onNoteSelect={setSelectedNote}
          />
        </div>

        {/* ── Status bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          height: 22, padding: '0 8px', flexShrink: 0,
          background: 'rgba(0,5,18,0.95)',
          borderTop: '1px solid rgba(0,212,255,0.12)',
          fontSize: 10,
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{
            flex: 1, height: 14, overflow: 'hidden',
            display: 'flex', alignItems: 'center', paddingLeft: 4,
            background: 'rgba(0,3,12,0.6)', border: '1px solid rgba(0,212,255,0.1)',
            borderRadius: 2,
          }}>
            <span style={{ color: 'rgba(150,185,220,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {statusMsg}
            </span>
          </div>
          <div style={{
            width: 160, height: 14, display: 'flex', alignItems: 'center', paddingLeft: 6,
            background: 'rgba(0,3,12,0.6)', border: '1px solid rgba(0,212,255,0.1)',
            borderRadius: 2,
          }}>
            <span style={{ color: 'rgba(150,185,220,0.7)', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
              {midi.statusText}
            </span>
          </div>
          <div style={{
            width: 90, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,3,12,0.6)', border: '1px solid rgba(0,212,255,0.1)',
            borderRadius: 2,
          }}>
            <span style={{
              color: '#00d4ff', fontSize: 9, fontFamily: "'Orbitron', sans-serif",
              fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              {vizMode}
            </span>
          </div>
        </div>
      </Win95Window>

      {/* ── Modals ── */}
      <MediaModal
        isOpen={isMediaModalOpen}
        onClose={() => setIsMediaModalOpen(false)}
        selectedNote={selectedNote}
        mediaAssignments={mediaAssignments}
        onAssign={handleAssignMedia}
        onAssignCamera={handleAssignCamera}
        onClear={handleClearMedia}
        onClearAll={handleClearAllMedia}
      />

      <HotkeysModal
        isOpen={isHotkeysOpen}
        onClose={() => setIsHotkeysOpen(false)}
        hotkeys={hotkeys}
        onChange={setHotkeys}
        onReset={resetHotkeys}
      />

      {showAbout && (
        <SpaceDialog title="ABOUT MIDIVID" onClose={() => setShowAbout(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{
                padding: 12, flexShrink: 0, borderRadius: 4,
                background: 'rgba(0,5,20,0.8)', border: '1px solid rgba(0,212,255,0.2)',
                boxShadow: '0 0 20px rgba(0,212,255,0.1)',
              }}>
                <svg width="44" height="44" viewBox="0 0 16 16">
                  <rect x="2" y="2" width="12" height="10" fill="none" stroke="#00d4ff" strokeWidth="1.5"/>
                  <circle cx="8" cy="7" r="2" fill="#00d4ff"/>
                  <path d="M2 12 l12 0" stroke="#00d4ff" strokeWidth="2"/>
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 900, color: '#00d4ff', letterSpacing: '0.08em', textShadow: '0 0 16px rgba(0,212,255,0.5)' }}>
                  MIDIVID
                </div>
                <div style={{ fontSize: 11, color: 'rgba(150,185,220,0.6)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                  Version 2.0 — Stellar Edition
                </div>
                <div style={{ fontSize: 12, color: 'rgba(150,185,220,0.8)', marginTop: 10, lineHeight: 1.6 }}>
                  Space-age MIDI synthesizer & visualizer with real-time kaleidoscopic effects and media assignment.
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(0,212,255,0.12)' }} />
            <button
              onClick={() => setShowAbout(false)}
              style={{
                alignSelf: 'center', height: 30, padding: '0 24px', borderRadius: 3,
                background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.35)',
                color: '#00d4ff', cursor: 'pointer', fontSize: 11,
                fontFamily: "'Orbitron', sans-serif", fontWeight: 700, letterSpacing: '0.1em',
                transition: 'all 0.15s',
              }}
            >OK</button>
          </div>
        </SpaceDialog>
      )}
    </div>
  );
}
