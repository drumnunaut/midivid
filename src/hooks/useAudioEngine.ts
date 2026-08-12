import { useRef, useEffect, useState, useCallback } from 'react';
import { Song, NoteEvent } from '../data/songs';

export type InstrumentType = 'soft' | 'sine' | 'square' | 'sawtooth';
export type AudioInputMode = 'mic' | 'system';

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  // ── Audio input (mic / system) ───────────────────────────────────────────────
  const inputStreamRef   = useRef<MediaStream | null>(null);
  const inputSourceRef   = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);

  const [audioInputAnalyser, setAudioInputAnalyser] = useState<AnalyserNode | null>(null);
  const [audioInputActive, setAudioInputActive]     = useState(false);
  const [audioInputMode,   setAudioInputMode]       = useState<AudioInputMode | null>(null);
  const [audioInputError,  setAudioInputError]      = useState<string | null>(null);

  // Expose analyser as state so VisualizerCanvas re-renders when audio is initialised
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const [volume, setVolumeState] = useState(0.5);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (masterGainRef.current) masterGainRef.current.gain.value = clamped;
  }, []);

  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [instrument, setInstrument] = useState<InstrumentType>('soft');
  
  // Timing
  const [progress, setProgress] = useState(0); // 0 to 1
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  const scheduleIntervalRef = useRef<number | null>(null);
  const lookaheadRef = useRef(0.1); // 100ms
  const nextNoteIndexRef = useRef(0);
  const startTimeRef = useRef(0);
  
  // Keep track of active oscillators to stop them
  const activeOscillatorsRef = useRef<Map<number, { osc: OscillatorNode, gain: GainNode }>>(new Map());

  // ── Stop audio input ────────────────────────────────────────────────────────
  const stopAudioInput = useCallback(() => {
    if (inputSourceRef.current) {
      try { inputSourceRef.current.disconnect(); } catch {}
      inputSourceRef.current = null;
    }
    if (inputStreamRef.current) {
      inputStreamRef.current.getTracks().forEach(t => t.stop());
      inputStreamRef.current = null;
    }
    if (inputAnalyserRef.current) {
      try { inputAnalyserRef.current.disconnect(); } catch {}
      inputAnalyserRef.current = null;
    }
    setAudioInputAnalyser(null);
    setAudioInputActive(false);
    setAudioInputMode(null);
  }, []);

  // ── Start audio input (mic or system/tab capture) ────────────────────────────
  const startAudioInput = useCallback(async (mode: AudioInputMode) => {
    // Always tear down any previous input first
    if (inputSourceRef.current) {
      try { inputSourceRef.current.disconnect(); } catch {}
      inputSourceRef.current = null;
    }
    if (inputStreamRef.current) {
      inputStreamRef.current.getTracks().forEach(t => t.stop());
      inputStreamRef.current = null;
    }
    if (inputAnalyserRef.current) {
      try { inputAnalyserRef.current.disconnect(); } catch {}
      inputAnalyserRef.current = null;
    }

    setAudioInputError(null);

    try {
      // Ensure AudioContext exists
      if (!ctxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        ctxRef.current = new AudioContextClass();
        analyserRef.current = ctxRef.current.createAnalyser();
        analyserRef.current.fftSize = 512;
        masterGainRef.current = ctxRef.current.createGain();
        masterGainRef.current.gain.value = 0.5;
        masterGainRef.current.connect(analyserRef.current);
        analyserRef.current.connect(ctxRef.current.destination);
        setAnalyserNode(analyserRef.current);
      }
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume();

      const ctx = ctxRef.current;

      let stream: MediaStream;
      if (mode === 'mic') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } else {
        // getDisplayMedia captures tab/app/system audio
        stream = await (navigator.mediaDevices as any).getDisplayMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false,
        });
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach(t => t.stop());
        setAudioInputError(
          mode === 'system'
            ? 'No audio captured — make sure to check "Share tab audio" when prompted'
            : 'No microphone audio track found'
        );
        return;
      }

      inputStreamRef.current = stream;

      // Build: stream → source → inputAnalyser
      // inputAnalyser is NOT wired to destination — prevents mic feedback / echo
      const source = ctx.createMediaStreamSource(stream);
      inputSourceRef.current = source;

      const inputAnalyser = ctx.createAnalyser();
      inputAnalyser.fftSize = 1024;           // higher resolution for live audio
      inputAnalyser.smoothingTimeConstant = 0.82;
      source.connect(inputAnalyser);
      // deliberately no inputAnalyser → destination

      inputAnalyserRef.current = inputAnalyser;
      setAudioInputAnalyser(inputAnalyser);
      setAudioInputActive(true);
      setAudioInputMode(mode);

      // Auto-stop when the user clicks "Stop sharing" in the browser UI
      audioTracks[0].addEventListener('ended', () => {
        inputStreamRef.current = null; // already stopped by browser
        if (inputSourceRef.current) { try { inputSourceRef.current.disconnect(); } catch {} inputSourceRef.current = null; }
        if (inputAnalyserRef.current) { try { inputAnalyserRef.current.disconnect(); } catch {} inputAnalyserRef.current = null; }
        setAudioInputAnalyser(null);
        setAudioInputActive(false);
        setAudioInputMode(null);
      });

    } catch (err: any) {
      const msg =
        err.name === 'NotAllowedError' ? 'Permission denied — allow access in your browser' :
        err.name === 'NotFoundError'   ? 'No audio device found' :
        err.name === 'NotSupportedError' ? 'System audio capture not supported in this browser' :
        err.message || 'Could not start audio input';
      setAudioInputError(msg);
    }
  }, []);

  // Ensure ctx
  const initAudio = useCallback(() => {
    if (!ctxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new AudioContextClass();
      analyserRef.current = ctxRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      
      masterGainRef.current = ctxRef.current.createGain();
      masterGainRef.current.gain.value = 0.5;
      
      masterGainRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctxRef.current.destination);

      // Expose to React state so VisualizerCanvas re-renders with the live analyser
      setAnalyserNode(analyserRef.current);
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
  }, []);

  const playNoteRaw = useCallback((note: number, duration?: number, scheduleTime?: number) => {
    if (!ctxRef.current || !masterGainRef.current) return;
    if (ctxRef.current.state === 'closed') return;
    const ctx = ctxRef.current;

    // Clamp scheduled time so it's never in the past — Chrome throws DOMException
    // if osc.stop() is called with a time < currentTime.
    const now = ctx.currentTime;
    const time = Math.max(now, scheduleTime !== undefined ? scheduleTime : now);

    try {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();

      const freq = 440 * Math.pow(2, (note - 69) / 12);
      osc.frequency.value = freq;

      // Instrument presets
      let attack = 0.02;
      let release = 0.05;
      let targetGain = 0.4;

      switch (instrument) {
        case 'soft':
          osc.type = 'triangle';
          targetGain = 0.4;
          attack = 0.02;
          break;
        case 'sine':
          osc.type = 'sine';
          targetGain = 0.5;
          attack = 0.005;
          break;
        case 'square':
          osc.type = 'square';
          targetGain = 0.2;
          attack = 0.005;
          break;
        case 'sawtooth':
          osc.type = 'sawtooth';
          targetGain = 0.25;
          attack = 0.01;
          break;
      }

      osc.connect(noteGain);
      noteGain.connect(masterGainRef.current);

      // Envelope
      noteGain.gain.setValueAtTime(0, time);
      noteGain.gain.linearRampToValueAtTime(targetGain, time + attack);

      if (duration !== undefined) {
        // Ensure release window stays valid even for very short durations
        const safeRelease = Math.min(release, duration * 0.5);
        noteGain.gain.setValueAtTime(targetGain, time + duration - safeRelease);
        noteGain.gain.linearRampToValueAtTime(0, time + duration);
        osc.start(time);
        osc.stop(time + duration);

        // Disconnect nodes after playback ends — prevents unbounded audio graph growth
        osc.onended = () => {
          try { osc.disconnect(); } catch {}
          try { noteGain.disconnect(); } catch {}
        };

        // Light up the key in the visualizer
        const onDelay = Math.max(0, (time - now) * 1000);
        const offDelay = Math.max(0, (time + duration - now) * 1000);
        setTimeout(() => {
          setActiveNotes(prev => { const n = new Set(prev); n.add(note); return n; });
        }, onDelay);
        setTimeout(() => {
          setActiveNotes(prev => { const n = new Set(prev); n.delete(note); return n; });
        }, offDelay);
      } else {
        // Indefinite note (piano key held) — kill any previous oscillator for this pitch
        if (activeOscillatorsRef.current.has(note)) {
          stopNoteRaw(note);
        }
        osc.start(time);
        activeOscillatorsRef.current.set(note, { osc, gain: noteGain });
        setActiveNotes(prev => { const n = new Set(prev); n.add(note); return n; });
      }
    } catch (err) {
      console.error('[MIDIVid] playNoteRaw error:', err);
    }
  }, [instrument]);

  const stopNoteRaw = useCallback((note: number) => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') return;
    const ctx = ctxRef.current;
    const active = activeOscillatorsRef.current.get(note);
    if (active) {
      try {
        const release = 0.05;
        active.gain.gain.setValueAtTime(active.gain.gain.value, ctx.currentTime);
        active.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + release);
        active.osc.stop(ctx.currentTime + release);
        active.osc.onended = () => {
          try { active.osc.disconnect(); } catch {}
          try { active.gain.disconnect(); } catch {}
        };
      } catch (err) {
        console.error('[MIDIVid] stopNoteRaw error:', err);
        try { active.osc.disconnect(); } catch {}
        try { active.gain.disconnect(); } catch {}
      }
      activeOscillatorsRef.current.delete(note);
      setActiveNotes(prev => { const n = new Set(prev); n.delete(note); return n; });
    }
  }, []);

  const scheduleNotes = useCallback(() => {
    if (!ctxRef.current || !currentSong || !isPlaying) return;
    
    const ctx = ctxRef.current;
    
    while (
      nextNoteIndexRef.current < currentSong.notes.length &&
      currentSong.notes[nextNoteIndexRef.current].time < (ctx.currentTime - startTimeRef.current) + lookaheadRef.current
    ) {
      const noteEvent = currentSong.notes[nextNoteIndexRef.current];
      const scheduleTime = startTimeRef.current + noteEvent.time;
      
      playNoteRaw(noteEvent.note, noteEvent.duration, scheduleTime);
      nextNoteIndexRef.current++;
    }

    if (nextNoteIndexRef.current >= currentSong.notes.length) {
      // Song finished
      const lastNote = currentSong.notes[currentSong.notes.length - 1];
      if (ctx.currentTime - startTimeRef.current > lastNote.time + lastNote.duration) {
        setIsPlaying(false);
        if (scheduleIntervalRef.current !== null) {
          window.clearInterval(scheduleIntervalRef.current);
          scheduleIntervalRef.current = null;
        }
      }
    }
  }, [currentSong, isPlaying, playNoteRaw]);

  // Update UI progress
  useEffect(() => {
    if (!isPlaying || !currentSong || !ctxRef.current) return;
    
    const interval = setInterval(() => {
      const t = Math.max(0, ctxRef.current!.currentTime - startTimeRef.current);
      setCurrentTime(t);
      if (totalDuration > 0) {
        setProgress(Math.min(1, t / totalDuration));
      }
    }, 50);
    
    return () => clearInterval(interval);
  }, [isPlaying, currentSong, totalDuration]);

  // Scheduler loop
  useEffect(() => {
    if (isPlaying) {
      scheduleIntervalRef.current = window.setInterval(scheduleNotes, 25);
    } else {
      if (scheduleIntervalRef.current !== null) {
        window.clearInterval(scheduleIntervalRef.current);
        scheduleIntervalRef.current = null;
      }
    }
    return () => {
      if (scheduleIntervalRef.current !== null) {
        window.clearInterval(scheduleIntervalRef.current);
      }
    };
  }, [isPlaying, scheduleNotes]);

  const loadSong = useCallback((song: Song) => {
    initAudio();
    setIsPlaying(false);
    setCurrentSong(song);
    nextNoteIndexRef.current = 0;
    setCurrentTime(0);
    setProgress(0);
    
    if (song.notes.length > 0) {
      const last = song.notes[song.notes.length - 1];
      setTotalDuration(last.time + last.duration);
    } else {
      setTotalDuration(0);
    }
  }, [initAudio]);

  const togglePlayback = useCallback(() => {
    initAudio();
    if (!currentSong) return;
    
    if (isPlaying) {
      setIsPlaying(false);
      // Note: pausing stops the schedule, but we'd need more complex logic to resume from exact spot
      // For simplicity, stopping acts like a full stop here if we don't handle pause offset
    } else {
      if (!ctxRef.current) return;
      startTimeRef.current = ctxRef.current.currentTime - currentTime;
      setIsPlaying(true);
    }
  }, [isPlaying, currentSong, currentTime, initAudio]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setProgress(0);
    nextNoteIndexRef.current = 0;
  }, []);

  const seek = useCallback((ratio: number) => {
    if (!currentSong || !ctxRef.current) return;
    const newTime = ratio * totalDuration;
    setCurrentTime(newTime);
    setProgress(ratio);
    
    // Find next note index
    let idx = 0;
    while (idx < currentSong.notes.length && currentSong.notes[idx].time < newTime) {
      idx++;
    }
    nextNoteIndexRef.current = idx;
    
    if (isPlaying) {
      startTimeRef.current = ctxRef.current.currentTime - newTime;
    }
  }, [currentSong, totalDuration, isPlaying]);

  return {
    initAudio,
    analyser: analyserNode,
    playNoteRaw,
    stopNoteRaw,
    activeNotes,
    
    loadSong,
    currentSong,
    isPlaying,
    togglePlayback,
    stopPlayback,
    seek,
    
    instrument,
    setInstrument,
    
    currentTime,
    totalDuration,
    progress,

    // Audio input
    startAudioInput,
    stopAudioInput,
    audioInputActive,
    audioInputMode,
    audioInputError,
    audioInputAnalyser,

    // Volume
    volume,
    setVolume,
  };
}
