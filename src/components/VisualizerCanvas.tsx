import React, { useRef, useEffect } from 'react';
import { Song } from '../data/songs';
import { EffectsSettings, DEFAULT_EFFECTS_SETTINGS } from '../types/effects';

export type VizMode = 'piano-roll' | 'bars' | 'oscilloscope' | 'media-show';

// Per-note visual effect parameters — generated once when a note starts
type NoteEffect = {
  hue: number;                        // colour hue 0-360
  segments: number;                   // kaleidoscope wedge count 4-12
  rotSpeed: number;                   // rotation speed multiplier 0.3-2.0
  phase: number;                      // initial rotation offset (radians)
  scale: number;                      // media scale multiplier 0.7-1.5
  cx: number;                         // orb centre-x as fraction of width  0-1
  cy: number;                         // orb centre-y as fraction of height 0-1
  blendMode: GlobalCompositeOperation;
  born: number;                       // timeOffset when note started
  diedAt: number | null;             // timeOffset when note stopped, null if alive
};

// lighter and color-dodge add RGB values directly — they blow out to white
// when multiple effects stack. Only use darkening/clamped modes.
const BLEND_MODES: GlobalCompositeOperation[] = [
  'screen', 'overlay', 'hard-light', 'multiply', 'soft-light',
];

function genEffect(note: number, timeOffset: number, settings: EffectsSettings = DEFAULT_EFFECTS_SETTINGS): NoteEffect {
  const r = Math.random;
  const segs  = settings.segments === 0 ? 3 + Math.floor(r() * 4) : Math.max(3, Math.min(8, settings.segments));
  const blend = settings.blendMode === 'random'
    ? BLEND_MODES[Math.floor(r() * BLEND_MODES.length)]
    : settings.blendMode as GlobalCompositeOperation;
  return {
    hue:       (note % 12) * 30 + r() * 40 - 20,
    segments:  segs,
    rotSpeed:  (0.3 + r() * 1.4) * Math.max(0, settings.rotSpeed),
    phase:     r() * Math.PI * 2,
    scale:     (0.7 + r() * 0.8) * Math.max(0.1, settings.scale),
    cx:        0.1 + r() * 0.8,
    cy:        0.1 + r() * 0.6,
    blendMode: blend,
    born:      timeOffset,
    diedAt:    null,
  };
}

type MediaEntry =
  | { type: 'image' | 'video'; url: string; file: File }
  | { type: 'camera'; url: ''; file: null };

type VisualizerCanvasProps = {
  mode: VizMode;
  analyser: AnalyserNode | null;
  activeNotes: Set<number>;
  currentSong?: Song | null;
  currentTime?: number;
  mediaAssignments: Map<number, MediaEntry>;
  audioInputActive?: boolean;
  effectsSettings?: EffectsSettings;
  stageRef?: React.RefObject<HTMLCanvasElement | null>;
  /** When provided, `.current` is set to a function that wipes all active effects instantly. */
  clearFXRef?: React.RefObject<(() => void) | null>;
};

export function VisualizerCanvas({
  mode, analyser, activeNotes, currentSong, currentTime = 0, mediaAssignments,
  audioInputActive = false, effectsSettings = DEFAULT_EFFECTS_SETTINGS, stageRef, clearFXRef,
}: VisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Expose the canvas element to the parent so it can call captureStream()
  useEffect(() => {
    if (stageRef) (stageRef as React.MutableRefObject<HTMLCanvasElement | null>).current = canvasRef.current;
  });
  const reqRef   = useRef<number>(0);
  const mediaElementsRef = useRef<Map<number, HTMLImageElement | HTMLVideoElement>>(new Map());
  // Tracks live MediaStream objects for camera-type assignments
  const cameraStreamsRef = useRef<Map<number, MediaStream>>(new Map());
  // Effect state lives here — never triggers React re-renders
  const noteEffectsRef = useRef<Map<number, NoteEffect>>(new Map());
  // Notes auto-triggered by mic/system audio energy
  const micActiveNotesRef = useRef<Set<number>>(new Set());
  // Sorted assigned note keys — rebuilt only when mediaAssignments changes, not every frame
  const sortedAssignedNotesRef = useRef<number[]>([]);
  // Reusable combined-active Set — avoids a new Set allocation every RAF tick
  const combinedActiveSetRef = useRef<Set<number>>(new Set());
  // Smoothed mic RMS — leaky integrator keeps it from jittering frame-to-frame
  const smoothedMicRMSRef = useRef<number>(0);

  // Keep frequently-changing props in refs so the RAF loop never restarts
  const activeNotesRef        = useRef<Set<number>>(activeNotes);
  const currentTimeRef        = useRef<number>(currentTime);
  const currentSongRef        = useRef<Song | null | undefined>(currentSong);
  const mediaAssignmentsRef   = useRef(mediaAssignments);
  const audioInputActiveRef   = useRef(audioInputActive);
  const effectsSettingsRef    = useRef<EffectsSettings>(effectsSettings);
  activeNotesRef.current       = activeNotes;
  currentTimeRef.current       = currentTime;
  currentSongRef.current       = currentSong;
  mediaAssignmentsRef.current  = mediaAssignments;
  audioInputActiveRef.current  = audioInputActive;
  effectsSettingsRef.current   = effectsSettings;

  // ── Expose clear-FX imperative handle to parent ──────────────────────────────
  useEffect(() => {
    if (!clearFXRef) return;
    (clearFXRef as React.MutableRefObject<(() => void) | null>).current = () => {
      noteEffectsRef.current.clear();
      micActiveNotesRef.current.clear();
      smoothedMicRMSRef.current = 0;
    };
    return () => {
      (clearFXRef as React.MutableRefObject<(() => void) | null>).current = null;
    };
  }, [clearFXRef]);

  // ── Camera stream unconditional teardown on unmount ─────────────────────────
  // Separate from the media sync effect so it always fires on unmount regardless
  // of whether mediaAssignments is empty — privacy guarantee.
  useEffect(() => {
    return () => {
      cameraStreamsRef.current.forEach(stream => stream.getTracks().forEach(t => t.stop()));
      cameraStreamsRef.current.clear();
      mediaElementsRef.current.forEach(el => {
        const v = el as HTMLVideoElement;
        if (typeof v.pause === 'function') { v.pause(); v.src = ''; v.srcObject = null; v.load(); }
      });
      mediaElementsRef.current.clear();
    };
  }, []);

  // ── Media element sync ──────────────────────────────────────────────────────
  useEffect(() => {
    const release = (el: HTMLImageElement | HTMLVideoElement, note: number) => {
      const v = el as HTMLVideoElement;
      if (typeof v.pause === 'function') { v.pause(); v.src = ''; v.srcObject = null; v.load(); }
      // Stop any camera stream associated with this note
      const stream = cameraStreamsRef.current.get(note);
      if (stream) { stream.getTracks().forEach(t => t.stop()); cameraStreamsRef.current.delete(note); }
    };

    mediaElementsRef.current.forEach((el, note) => {
      if (!mediaAssignments.has(note)) { release(el, note); mediaElementsRef.current.delete(note); }
    });

    mediaAssignments.forEach((media, note) => {
      const existing = mediaElementsRef.current.get(note);

      if (media.type === 'camera') {
        // Camera assignment: if we already have a live stream for this note, keep it
        if (cameraStreamsRef.current.has(note)) return;
        // Otherwise stop whatever was there and start a new camera stream
        if (existing) release(existing, note);
        const v = document.createElement('video');
        v.muted = true; v.autoplay = true;
        mediaElementsRef.current.set(note, v);
        navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
          // ── Ownership guard ──────────────────────────────────────────────
          // The assignment may have been cleared or replaced between when we called
          // getUserMedia and when the promise resolved.  Check that this note still
          // wants a camera source before persisting the stream — otherwise we'd
          // leave a live camera track with no owner (privacy leak).
          const current = mediaAssignmentsRef.current.get(note);
          if (current?.type !== 'camera') {
            stream.getTracks().forEach(t => t.stop());
            // Also remove the placeholder element we set above if it's still there
            if (mediaElementsRef.current.get(note) === v) mediaElementsRef.current.delete(note);
            return;
          }
          cameraStreamsRef.current.set(note, stream);
          v.srcObject = stream;
          v.play().catch(() => {});
        }).catch(() => {
          // Camera access denied — remove the placeholder element and clean up
          if (mediaElementsRef.current.get(note) === v) mediaElementsRef.current.delete(note);
        });
        return;
      }

      // File-based assignment (image / video)
      const existingSrc = (existing as HTMLImageElement)?.src || (existing as HTMLVideoElement)?.src || '';
      if (existingSrc === media.url) return;
      if (existing) release(existing, note);
      if (media.type === 'image') {
        const img = new Image(); img.src = media.url;
        mediaElementsRef.current.set(note, img);
      } else {
        const v = document.createElement('video');
        v.src = media.url; v.loop = true; v.muted = true; v.play().catch(() => {});
        mediaElementsRef.current.set(note, v);
      }
    });

    // Cache sorted note list — used by the RAF loop; rebuilding once here is
    // much cheaper than Array.from().sort() on every animation frame.
    sortedAssignedNotesRef.current = Array.from(mediaAssignments.keys()).sort((a, b) => a - b);
  }, [mediaAssignments]);

  // ── Main render loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width  = canvas.width;
    let height = canvas.height;
    const ro   = new ResizeObserver(entries => {
      for (const e of entries) {
        width = e.contentRect.width;  canvas.width  = width;
        height = e.contentRect.height; canvas.height = height;
      }
    });
    ro.observe(canvas);

    const freqData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const timeData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    let timeOffset   = 0;
    let lastRender   = performance.now();

    // ── Helpers ──────────────────────────────────────────────────────────────
    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const WHITE_OFFSETS: Record<string, number> = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };
    const KEY_WIDTH = () => width / 14;

    const noteXCenter = (note: number) => {
      const name      = NOTE_NAMES[note % 12];
      const isBlack   = name.includes('#');
      const octave    = Math.floor(note / 12) - 1;
      const relOct    = octave - 4;
      const baseName  = name.replace('#', '');
      const baseIdx   = relOct * 7 + (WHITE_OFFSETS[baseName] ?? 0);
      const kw        = KEY_WIDTH();
      const leftEdge  = isBlack ? (baseIdx + 0.7) * kw : baseIdx * kw;
      return leftEdge + (isBlack ? kw * 0.3 : kw * 0.45);
    };

    const effectOpacity = (e: NoteEffect) => {
      const fade = effectsSettingsRef.current.fadeDuration;
      return e.diedAt !== null
        ? Math.max(0, 1 - (timeOffset - e.diedAt) / fade)
        : Math.min(1, (timeOffset - e.born) / 0.15);
    };

    const mediaReady = (el: HTMLImageElement | HTMLVideoElement | undefined) => {
      if (!el) return false;
      const img = el as HTMLImageElement;
      const vid = el as HTMLVideoElement;
      return (img.complete && img.naturalWidth > 0)
          || (typeof vid.readyState === 'number' && vid.readyState >= 2);
    };

    // ── Offscreen canvas — blit source once per new video frame ─────────────
    // 1024×1024 gives sharp output on displays up to ~1440p at typical scales.
    // Using an intermediate buffer means we call drawImage(videoEl) only once
    // per new video frame instead of once per wedge segment — the GPU decodes
    // the video frame a single time regardless of how many wedges are drawn.
    const OFFW = 1024, OFFH = 1024;
    const offscreen = document.createElement('canvas');
    offscreen.width = OFFW; offscreen.height = OFFH;
    const offCtx = offscreen.getContext('2d')!;
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';

    // Track the last-rendered currentTime per source element so we skip
    // re-blitting the offscreen when the video hasn't advanced to a new frame.
    // rAF fires at 60 Hz; most video is 24–30 fps → half the blits are wasted
    // without this guard.  Images (no .currentTime) are always re-blitted.
    const lastVideoTimes = new Map<Element, number>();

    const drawKaleidoscope = (
      el: HTMLImageElement | HTMLVideoElement,
      segments: number,
      rotation: number,
      scale: number,
    ) => {
      const cx = width / 2, cy = height / 2;
      const img = el as HTMLImageElement;
      const vid = el as HTMLVideoElement;
      const srcW = (img.naturalWidth  || vid.videoWidth)  || 300;
      const srcH = (img.naturalHeight || vid.videoHeight) || 300;

      // Only re-blit when the video has a new frame.
      const vt    = vid.currentTime;
      const isVid = typeof vt === 'number' && !isNaN(vt);
      if (!isVid || vt !== lastVideoTimes.get(el)) {
        if (isVid) lastVideoTimes.set(el, vt);
        offCtx.clearRect(0, 0, OFFW, OFFH);
        try { offCtx.drawImage(el, 0, 0, srcW, srcH, 0, 0, OFFW, OFFH); } catch { return; }
      }

      // ── Proper wedge-clipped kaleidoscope ────────────────────────────────
      // Each segment is a pie-slice of the video.  Adjacent slices are mirrored
      // on Y so their shared edge matches perfectly — classic kaleidoscope join.
      // Clipping to the wedge prevents overlap, eliminating the "glittery"
      // strobing that N stacked full-frame copies cause.
      const wedgeAngle  = (Math.PI * 2) / segments;
      // Diagonal fill: make each wedge large enough to reach every screen corner.
      const displaySize = Math.hypot(width, height) * scale;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      for (let i = 0; i < segments; i++) {
        ctx.save();
        // Spin this wedge into its position around the centre
        ctx.rotate(rotation + i * wedgeAngle);

        // Clip to a pie-wedge — only pixels inside this slice are drawn
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, displaySize, -wedgeAngle / 2, wedgeAngle / 2);
        ctx.closePath();
        ctx.clip();

        // Mirror every other wedge so the shared edges join seamlessly
        if (i % 2 === 1) ctx.scale(1, -1);
        // Rotate so the source centre aligns with the wedge bisector
        ctx.rotate(-wedgeAngle / 2);
        ctx.drawImage(offscreen, -displaySize / 2, -displaySize / 2, displaySize, displaySize);

        ctx.restore();
      }

      ctx.restore();
    };

    // ── Geometric fallback kaleidoscope (no media assigned) ──────────────────
    const drawGeoKaleidoscope = (effect: NoteEffect, rotation: number, cs: number) => {
      const cx = width / 2, cy = height / 2;
      const radius = Math.max(width, height);
      const pulse  = Math.sin(timeOffset * effect.rotSpeed * 2 + effect.phase) * 0.3 + 0.7;
      const r      = Math.min(width, height) * 0.4 * pulse;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      for (let i = 0; i < effect.segments; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI * 2) / effect.segments);
        const hShift = (effect.hue + timeOffset * 70 * cs + i * (360 / effect.segments)) % 360;
        const grad   = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0,   `hsla(${hShift},100%,65%,0.55)`);
        grad.addColorStop(0.6, `hsla(${(hShift + 60) % 360},100%,50%,0.3)`);
        grad.addColorStop(1,   `hsla(${(hShift + 120) % 360},100%,35%,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius, -radius * Math.tan(Math.PI / effect.segments));
        ctx.lineTo(radius,  radius * Math.tan(Math.PI / effect.segments));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    };

    // ── Render ───────────────────────────────────────────────────────────────
    const render = (now: number) => {
      // Clamp dt to 100 ms so backgrounded-tab resumption doesn't cause a time jump
      const dt = Math.min(now - lastRender, 100);
      lastRender  = now;
      timeOffset += dt * 0.001;

      const activeNotes = activeNotesRef.current;
      const currentTime = currentTimeRef.current;
      const currentSong = currentSongRef.current;
      const effects     = noteEffectsRef.current;

      // ── Fetch analyser data ONCE per frame ───────────────────────────────
      // Always fetch when mic is active (all modes need micRMS for cross-interaction).
      // Otherwise only fetch for modes that actually visualise frequency data.
      const needsFreq = mode === 'bars' || mode === 'media-show' || audioInputActiveRef.current;
      if (needsFreq && analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
      }

      // ── Smoothed mic RMS — drives MIDI effect modulation in every mode ────
      // Raw RMS would jitter; a leaky integrator (70/30 mix) gives a smooth swell.
      let micRMS = 0;
      if (audioInputActiveRef.current && analyser && freqData) {
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        const raw = sum / freqData.length / 255;
        smoothedMicRMSRef.current = smoothedMicRMSRef.current * 0.72 + raw * 0.28;
        // Cap at 0.5 — the analyser's default dB range maps even quiet room
        // noise to surprisingly high byte values, so without a ceiling small
        // sounds push micRMS to 0.8+ and blow out additive blend modes.
        micRMS = Math.min(smoothedMicRMSRef.current, 0.5);
      } else {
        smoothedMicRMSRef.current *= 0.85; // decay when mic off
        micRMS = smoothedMicRMSRef.current;
      }

      // Fractal mode: mic active in media-show → recursive multi-layer rendering,
      // denser kaleidoscope segments, lower trigger threshold, and more effects.
      // Declared here (before the mic-trigger block) to avoid TDZ with const.
      const fractalMode = audioInputActiveRef.current && mode === 'media-show';

      // ── Mic auto-trigger: map frequency bands → assigned keys ─────────────
      if (audioInputActiveRef.current && mode === 'media-show' && analyser && freqData) {
        const assignedNotes = sortedAssignedNotesRef.current; // pre-sorted, no allocation
        if (assignedNotes.length > 0) {
          const specLen  = Math.max(1, Math.floor(freqData.length * 0.6));
          const bandSize = Math.max(1, Math.floor(specLen / assignedNotes.length));
          for (let i = 0; i < assignedNotes.length; i++) {
            const note  = assignedNotes[i];
            const start = i * bandSize;
            const end   = Math.min((i + 1) * bandSize, specLen);
            let sum = 0;
            for (let j = start; j < end; j++) sum += freqData[j];
            const energy = sum / (end - start) / 255;
            // In fractal mode lower the threshold so media fires much more readily
            const trig = effectsSettingsRef.current.micThreshold * (fractalMode ? 0.45 : 1.0);
            if (energy > trig)             micActiveNotesRef.current.add(note);
            else if (energy < trig * 0.45) micActiveNotesRef.current.delete(note);
          }
        } else {
          micActiveNotesRef.current.clear();
        }
      } else {
        micActiveNotesRef.current.clear();
      }

      // ── Merge active notes (reuse pre-allocated Set — no per-frame alloc) ─
      const combinedActive = combinedActiveSetRef.current;
      combinedActive.clear();
      activeNotes.forEach(n => combinedActive.add(n));
      micActiveNotesRef.current.forEach(n => combinedActive.add(n));

      // ── Pull settings once per frame ─────────────────────────────────────
      const S   = effectsSettingsRef.current;
      const cs  = S.colorSpeed;  // hue-cycle speed multiplier
      const brt = S.brightness;  // global alpha/intensity multiplier

      // ── Effect lifecycle ──────────────────────────────────────────────────
      // In fractal mode allow up to 6 simultaneous effects so media fills the screen
      const MAX_EFFECTS = fractalMode ? Math.max(S.maxEffects, 6) : S.maxEffects;
      combinedActive.forEach(note => {
        const ex = effects.get(note);
        if (!ex) {
          let liveCount = 0;
          effects.forEach(e => { if (e.diedAt === null) liveCount++; });
          if (liveCount < MAX_EFFECTS) effects.set(note, genEffect(note, timeOffset, S));
        } else if (ex.diedAt !== null) {
          ex.diedAt = null;
          ex.born   = timeOffset;
        }
      });
      effects.forEach((ex, note) => {
        if (!combinedActive.has(note) && ex.diedAt === null) ex.diedAt = timeOffset;
      });
      effects.forEach((ex, note) => {
        if (ex.diedAt !== null && timeOffset - ex.diedAt > S.fadeDuration) effects.delete(note);
      });

      // ── Clear ─────────────────────────────────────────────────────────────
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      // ── BARS ──────────────────────────────────────────────────────────────
      // freqData already filled at top of frame — no second fetch needed.
      if (mode === 'bars' && analyser && freqData) {
        const bw = width / 128;
        for (let i = 0; i < 128; i++) {
          const pct = freqData[i] / 255;
          const h   = height * pct;
          ctx.fillStyle = `hsl(${(240 - (i / 128) * 240 + timeOffset * 80 * cs) % 360},100%,55%)`;
          ctx.fillRect(i * bw, height - h, bw - 1, h);
        }

        // Per-note effects — kaleidoscope video if media assigned, else glow orb
        let layerIdxBars = 0;
        effects.forEach((ex, note) => {
          const alpha = effectOpacity(ex) * 0.75;
          if (alpha <= 0) return;

          const el = mediaElementsRef.current.get(note);
          if (el && mediaReady(el)) {
            const rotation = timeOffset * ex.rotSpeed * 0.35 + ex.phase;
            const scaleMod = ex.scale * (1 + micRMS * 0.6);
            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = layerIdxBars === 0 ? 'source-over' : ex.blendMode;
            drawKaleidoscope(el, ex.segments, rotation, scaleMod);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            layerIdxBars++;
            return;
          }

          const pulse   = Math.sin(timeOffset * ex.rotSpeed * 3 + ex.phase) * 0.5 + 0.5;
          const micBoost = 1 + micRMS * 1.0;
          const r        = (55 + pulse * 85) * (height / 400) * micBoost;
          const hue      = (ex.hue + timeOffset * 55 * cs + micRMS * 40) % 360;
          const cx       = ex.cx * width;
          const cy       = ex.cy * height;

          const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g1.addColorStop(0,   `hsla(${hue},100%,85%,${alpha})`);
          g1.addColorStop(0.4, `hsla(${hue},100%,60%,${alpha * 0.7})`);
          g1.addColorStop(1,   `hsla(${hue},100%,40%,0)`);
          ctx.globalCompositeOperation = ex.blendMode;
          ctx.fillStyle = g1;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

          // Outer ring — extra ring appears on loud mic peaks
          const r2 = r * (1.5 + Math.sin(timeOffset * ex.rotSpeed * 1.7 + ex.phase + 2) * 0.4);
          ctx.lineWidth   = 1.5 + micRMS * 2;
          ctx.strokeStyle = `hsla(${hue},100%,80%,${alpha * (0.35 + micRMS * 0.25)})`;
          ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI * 2); ctx.stroke();
          if (micRMS > 0.45) {
            ctx.lineWidth   = 1;
            ctx.strokeStyle = `hsla(${(hue + 180) % 360},100%,90%,${(micRMS - 0.45) * 0.4})`;
            ctx.beginPath(); ctx.arc(cx, cy, r2 * 1.5, 0, Math.PI * 2); ctx.stroke();
          }
        });
        ctx.globalCompositeOperation = 'source-over';
      }

      // ── OSCILLOSCOPE ──────────────────────────────────────────────────────
      else if (mode === 'oscilloscope' && analyser && timeData) {
        analyser.getByteTimeDomainData(timeData);

        // Per-note effects — kaleidoscope video if media assigned, else ghost waveform
        const oscStride  = Math.max(1, Math.floor(timeData.length / 512));
        const ampScale   = 1 + micRMS * 0.6; // voice stretches waveform vertically
        let layerIdxOsc = 0;
        effects.forEach((ex, note) => {
          const alpha = effectOpacity(ex) * 0.45;
          if (alpha <= 0 || !analyser) return;

          const el = mediaElementsRef.current.get(note);
          if (el && mediaReady(el)) {
            const rotation = timeOffset * ex.rotSpeed * 0.35 + ex.phase;
            const scaleMod = ex.scale * (1 + micRMS * 0.6);
            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = layerIdxOsc === 0 ? 'source-over' : ex.blendMode;
            drawKaleidoscope(el, ex.segments, rotation, scaleMod);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            layerIdxOsc++;
            return;
          }

          const shift = Math.sin(timeOffset * ex.rotSpeed + ex.phase) * (12 + micRMS * 18);
          const hue   = (ex.hue + timeOffset * 65 * cs + micRMS * 40) % 360;
          ctx.lineWidth   = 1.5 + micRMS * 2;
          ctx.strokeStyle = `hsla(${hue},100%,65%,${Math.min(alpha + micRMS * 0.15, 0.8)})`;
          ctx.globalCompositeOperation = ex.blendMode;
          ctx.beginPath();
          const sw = width / (timeData.length / oscStride);
          let x = 0;
          for (let i = 0; i < timeData.length; i += oscStride) {
            const v = timeData[i] / 128.0;
            const y = ((v - 1) * ampScale + 1) * height / 2 + shift;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            x += sw;
          }
          ctx.stroke();
        });
        ctx.globalCompositeOperation = 'source-over';

        // Main waveform — shifts from green toward white on loud mic peaks
        const mainHue = `hsl(${(timeOffset * 60 * cs + (micRMS > 0.1 ? 120 - micRMS * 120 : 120)) % 360},100%,${50 + micRMS * 40}%)`;
        ctx.lineWidth   = 2 + micRMS * 2;
        ctx.strokeStyle = mainHue;
        ctx.beginPath();
        const sw = width / (timeData.length / oscStride);
        let x = 0;
        for (let i = 0; i < timeData.length; i += oscStride) {
          const v = timeData[i] / 128.0;
          const y = ((v - 1) * ampScale + 1) * height / 2;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          x += sw;
        }
        ctx.stroke();
      }

      // ── PIANO ROLL ────────────────────────────────────────────────────────
      else if (mode === 'piano-roll') {
        const speed        = 150;
        const kw           = KEY_WIDTH();
        const lookahead    = height / speed;

        if (currentSong) {
          ctx.save();
          currentSong.notes.forEach(ev => {
            const timeUntil = ev.time - currentTime;
            if (timeUntil < lookahead && timeUntil + ev.duration > -0.1) {
              const hue      = ((ev.note % 12) * 30 + timeOffset * 45 * cs) % 360;
              const name     = NOTE_NAMES[ev.note % 12];
              const isBlack  = name.includes('#');
              const octave   = Math.floor(ev.note / 12) - 1;
              const relOct   = octave - 4;
              const baseIdx  = relOct * 7 + (WHITE_OFFSETS[name.replace('#', '')] ?? 0);
              const xPos     = isBlack ? (baseIdx + 0.7) * kw : baseIdx * kw;
              ctx.fillStyle  = `hsl(${hue},100%,${isBlack ? 70 : 60}%)`;
              ctx.shadowColor= `hsl(${hue},100%,${isBlack ? 50 : 40}%)`;
              ctx.shadowBlur = 15;
              const yBot     = height - timeUntil * speed;
              ctx.fillRect(xPos, yBot - ev.duration * speed, (isBlack ? 0.6 : 0.9) * kw, ev.duration * speed);
            }
          });
          ctx.restore();
        }

        // Per-note effects — kaleidoscope video if media assigned, else radial glow
        let layerIdxPR = 0;
        effects.forEach((ex, note) => {
          const alpha    = effectOpacity(ex);
          if (alpha <= 0) return;

          const el = mediaElementsRef.current.get(note);
          if (el && mediaReady(el)) {
            const rotation = timeOffset * ex.rotSpeed * 0.35 + ex.phase;
            const scaleMod = ex.scale * (1 + micRMS * 0.6);
            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = layerIdxPR === 0 ? 'source-over' : ex.blendMode;
            drawKaleidoscope(el, ex.segments, rotation, scaleMod);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            layerIdxPR++;
            return;
          }

          ctx.globalCompositeOperation = 'screen';
          const pulse    = Math.sin(timeOffset * ex.rotSpeed * 4 + ex.phase) * 0.5 + 0.5;
          const micBoost = 1 + micRMS * 1.2;
          const r        = (40 + pulse * 60) * (width / 800) * micBoost;
          const hue      = (ex.hue + timeOffset * 60 * cs + micRMS * 40) % 360;
          const xc       = noteXCenter(note);
          const grad     = ctx.createRadialGradient(xc, height, 0, xc, height, r * 2.8);
          grad.addColorStop(0,    `hsla(${hue},100%,95%,${alpha})`);
          grad.addColorStop(0.35, `hsla(${hue},100%,70%,${alpha * 0.8})`);
          grad.addColorStop(1,    `hsla(${hue},100%,50%,0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(xc, height + 10, r * 2.8, 0, Math.PI * 2);
          ctx.fill();
          // Second bloom ring on louder mic input
          if (micRMS > 0.5) {
            const g2 = ctx.createRadialGradient(xc, height, 0, xc, height, r * 4);
            g2.addColorStop(0,   `hsla(${(hue + 40) % 360},100%,80%,${(micRMS - 0.5) * alpha * 0.4})`);
            g2.addColorStop(1,   'transparent');
            ctx.fillStyle = g2;
            ctx.beginPath();
            ctx.arc(xc, height + 10, r * 4, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.globalCompositeOperation = 'source-over';
      }

      // ── MEDIA SHOW ────────────────────────────────────────────────────────
      else if (mode === 'media-show') {
        // freqData already populated at the top of this frame — no second fetch.
        // Compute amplitude bands once; reuse throughout this block.
        let avgAmp  = 0;
        let bassAmp = 0;

        if (analyser && freqData) {
          const len     = freqData.length;
          const bassEnd = Math.floor(len * 0.10);
          let sum = 0, bs = 0;
          for (let i = 0; i < len; i++) { sum += freqData[i]; if (i < bassEnd) bs += freqData[i]; }
          avgAmp  = sum / len / 255;
          bassAmp = bs / bassEnd / 255;
        }

        // ── Audio-reactive background ─────────────────────────────────────
        // Only draw when effects aren't already covering the canvas — this is
        // the single biggest perf saving: skip 5 gradient fills when media is
        // actively showing (which is the common case with mic input).
        if (avgAmp > 0.01 && effects.size === 0) {
          const SEG = 5; // was 8 × 3 layers = 24 gradient fills; now 5 = 5 fills
          const cx = width / 2, cy = height / 2;
          const radius  = Math.max(width, height) * 0.85;
          const hueBase = (timeOffset * 35 * cs) % 360;
          const rot     = timeOffset * 0.18;
          const tanAngle = Math.tan(Math.PI / SEG);

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.globalCompositeOperation = 'screen';

          for (let i = 0; i < SEG; i++) {
            ctx.save();
            ctx.rotate((i * Math.PI * 2) / SEG);
            const hue  = (hueBase + i * (360 / SEG)) % 360;
            const r    = radius * avgAmp * 2.8;
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
            grad.addColorStop(0,   `hsla(${hue},100%,85%,${Math.min(avgAmp * 2, 0.9)})`);
            grad.addColorStop(0.6, `hsla(${hue + 40},100%,55%,${avgAmp * 0.5})`);
            grad.addColorStop(1,   'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(radius, -radius * tanAngle);
            ctx.lineTo(radius,  radius * tanAngle);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }

          ctx.restore();
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }

        // ── Note / mic-triggered media effects ────────────────────────────
        // micRMS drives rotation speed, scale swell, and tint intensity so
        // held MIDI notes visually react to voice/sound through the mic.
        let layerIdx = 0;

        effects.forEach((ex, note) => {
          const alpha = effectOpacity(ex);
          if (alpha <= 0) return;
          const el = mediaElementsRef.current.get(note);

          // Fractal mode spins faster — bass and mic both push the speed harder
          const speedMod = fractalMode
            ? 1 + bassAmp * 5 + micRMS * 9
            : 1 + bassAmp * 3 + micRMS * 4;
          const rotation = timeOffset * ex.rotSpeed * 0.4 * speedMod + ex.phase;
          const scaleMod = ex.scale * (1 + micRMS * 1.2);

          // Fractal mode: 6–12 kaleidoscope wedges (denser / more crystalline)
          // Normal mode: uses whatever segments were assigned at effect creation
          const effectiveSegments = fractalMode
            ? Math.min(12, Math.max(6, ex.segments * 2) + Math.floor(micRMS * 4))
            : ex.segments;

          // Fractal mode: 1–4 recursive layers driven by mic energy.
          //   Quiet  (< 0.1) → 1 layer  — standard single kaleidoscope
          //   Medium (≈ 0.3) → 2 layers — one smaller copy nested inside
          //   Loud   (≈ 0.45)→ 3 layers — two smaller copies
          //   Peak   (= 0.5) → 4 layers — full fractal bloom
          const fractalLayers = fractalMode
            ? Math.max(1, Math.min(S.fractalDepth, 1 + Math.floor(micRMS * 8)))
            : 1;

          if (el && mediaReady(el)) {
            for (let fl = 0; fl < fractalLayers; fl++) {
              // Each successive layer is drawn at ~55% the previous scale,
              // creating the recursive "zoom into itself" illusion.
              const layerScale = fractalMode ? scaleMod * Math.pow(0.55, fl) : scaleMod;

              // Each layer counter-rotates by a phase offset relative to the one
              // outside it — gives the Escher / spinning-mirror feel.
              const layerRot = rotation + fl * (ex.phase * 0.5 + micRMS * 0.9);

              // Breathing pulse — layers expand/contract with the beat independently
              const breathe = fractalMode
                ? 1 + Math.sin(timeOffset * 3.5 + fl * 1.3 + ex.phase) * micRMS * 0.28
                : 1;

              // Deeper layers are more transparent; blend additively so inner
              // copies glow rather than occlude.
              ctx.globalAlpha = alpha * (fl === 0 ? 1 : 0.6 / fl);
              ctx.globalCompositeOperation = fl === 0
                ? (layerIdx === 0 ? 'source-over' : ex.blendMode)
                : 'screen';

              drawKaleidoscope(el, effectiveSegments, layerRot, layerScale * breathe);
            }
            // Tint: drawn once for the bottom-most effect only to prevent blow-out
            if (layerIdx === 0) {
              ctx.globalCompositeOperation = 'overlay';
              ctx.globalAlpha = 0.14 + micRMS * 0.12;
              const tintHue = (ex.hue + timeOffset * 90 * cs + micRMS * 60) % 360;
              ctx.fillStyle = `hsla(${tintHue},100%,55%,1)`;
              ctx.fillRect(0, 0, width, height);
            }
          } else {
            // Geometric fallback also gets denser segments and fractal rotation in fractal mode
            const geoEx = fractalMode
              ? { ...ex, segments: Math.min(12, Math.max(6, ex.segments * 2)), rotSpeed: ex.rotSpeed * (1 + micRMS * 2) }
              : ex;
            drawGeoKaleidoscope(geoEx, rotation, cs);
          }
          ctx.globalAlpha = alpha;
          layerIdx++;
        });

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // Idle shimmer — only when truly silent and no effects
        if (effects.size === 0 && avgAmp <= 0.01) {
          const cx = width / 2, cy = height / 2;
          const r  = Math.sin(timeOffset * 1.5) * 25 + 70;
          const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, `hsla(${(timeOffset * 40 * cs) % 360},80%,60%,0.25)`);
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        }
      }

      reqRef.current = requestAnimationFrame(render);
    };

    reqRef.current = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(reqRef.current); ro.disconnect(); };
  }, [mode, analyser]); // only restarts on mode/analyser change

  return (
    <div className="w-full h-full relative win95-inset bg-black overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" width={800} height={400} />

      {/* Media overlay thumbnails for non-media-show modes */}
      {mode !== 'media-show' && Array.from(activeNotes).map(note => {
        const media = mediaAssignments.get(note);
        if (!media) return null;
        const xOff = (note % 5 - 2) * 22;
        const yOff = ((note * 7) % 5 - 2) * 22;
        return (
          <div
            key={note}
            className="absolute win95-outset bg-[#c0c0c0] p-1 shadow-lg animate-in zoom-in duration-200"
            style={{
              left: `calc(50% + ${xOff}px)`,
              top:  `calc(50% + ${yOff}px)`,
              transform: 'translate(-50%, -50%)',
              maxWidth: '60%', maxHeight: '80%', zIndex: 30,
            }}
          >
            {media.type === 'image'
              ? <img  src={media.url} alt="Media" className="w-full h-full object-contain win95-inset border border-black" />
              : <video src={media.url} autoPlay loop muted className="w-full h-full object-contain win95-inset border border-black" />}
          </div>
        );
      })}
    </div>
  );
}
