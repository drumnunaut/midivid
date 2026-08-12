import React, { useRef, useEffect, useState } from 'react';

type VizMode = 'piano-roll' | 'bars' | 'oscilloscope' | 'media-show';

type StageFrame = {
  mode: VizMode;
  activeNotes: number[];
  currentTime: number;
  freqData: number[] | null;
  timeData: number[] | null;
  currentSong: { notes: { note: number; time: number; duration: number }[] } | null;
  mediaMap: { note: number; type: 'image' | 'video'; url: string }[];
};

export default function PopoutStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<StageFrame | null>(null);
  const mediaElementsRef = useRef<Map<number, HTMLImageElement | HTMLVideoElement>>(new Map());
  const [connected, setConnected] = useState(false);

  // Page styling
  useEffect(() => {
    document.title = 'MIDIVid Stage';
    const prev = document.body.style.cssText;
    document.body.style.cssText = 'margin:0;padding:0;background:black;overflow:hidden;';
    return () => { document.body.style.cssText = prev; };
  }, []);

  // BroadcastChannel receiver — syncs data from the main app
  useEffect(() => {
    const channel = new BroadcastChannel('midivid-stage');

    channel.onmessage = (e: MessageEvent<StageFrame>) => {
      const data = e.data;
      frameRef.current = data;
      if (!connected) setConnected(true);

      // Sync media elements for the popout's own canvas
      const map = mediaElementsRef.current;

      // Remove stale notes
      const incomingNotes = new Set(data.mediaMap.map(m => m.note));
      map.forEach((_, note) => { if (!incomingNotes.has(note)) map.delete(note); });

      // Add / replace notes whose URL changed
      data.mediaMap.forEach(({ note, type, url }) => {
        const existing = map.get(note);
        const existingSrc =
          (existing as HTMLImageElement)?.src ||
          (existing as HTMLVideoElement)?.src || '';
        if (existingSrc === url) return;

        if (type === 'image') {
          const img = new Image();
          img.src = url;
          map.set(note, img);
        } else {
          const video = document.createElement('video');
          video.src = url;
          video.loop = true;
          video.muted = true;
          video.play().catch(() => {});
          map.set(note, video);
        }
      });
    };

    return () => channel.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;

    const draw = () => {
      rafId = requestAnimationFrame(draw);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      const frame = frameRef.current;
      if (!frame) {
        ctx.fillStyle = '#2a2a2a';
        ctx.font = '18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for MIDIVid…', width / 2, height / 2 - 12);
        ctx.fillStyle = '#555';
        ctx.font = '13px monospace';
        ctx.fillText('Keep the main window open and press Play', width / 2, height / 2 + 16);
        ctx.textAlign = 'left';
        return;
      }

      const { mode, activeNotes, currentTime, freqData, timeData, currentSong } = frame;
      const activeSet = new Set(activeNotes);

      // ── Frequency bars ───────────────────────────────────────────────────────
      if (mode === 'bars' && freqData) {
        const binCount = freqData.length;
        const barW = width / binCount;
        for (let i = 0; i < binCount; i++) {
          const v = freqData[i] / 255;
          const hue = (i / binCount) * 300;
          ctx.fillStyle = `hsl(${hue},100%,${30 + v * 50}%)`;
          ctx.fillRect(i * barW, height - v * height, barW - 1, v * height);
        }
        activeSet.forEach(note => {
          const hue = (note % 12) * 30;
          ctx.fillStyle = `hsla(${hue},100%,80%,0.15)`;
          ctx.fillRect(0, 0, width, height);
        });

      // ── Oscilloscope ─────────────────────────────────────────────────────────
      } else if (mode === 'oscilloscope' && timeData) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        const sliceW = width / timeData.length;
        let x = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] / 128 - 1;
          const y = (v * height) / 2 + height / 2;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          x += sliceW;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

      // ── Piano roll ───────────────────────────────────────────────────────────
      } else if (mode === 'piano-roll') {
        const speed = 200;
        const numNotes = 24;
        const startNote = 60;
        const keyWidth = width / numNotes;

        if (currentSong) {
          ctx.save();
          currentSong.notes.forEach(noteEvent => {
            const idx = noteEvent.note - startNote;
            if (idx < 0 || idx >= numNotes) return;
            const timeUntilHit = noteEvent.time - currentTime;
            if (timeUntilHit > height / speed || timeUntilHit < -noteEvent.duration) return;
            const hue = (noteEvent.note % 12) * 30;
            const isBlack = [1, 3, 6, 8, 10].includes(noteEvent.note % 12);
            ctx.fillStyle = `hsl(${hue},80%,${isBlack ? 55 : 65}%)`;
            ctx.shadowColor = `hsl(${hue},100%,50%)`;
            ctx.shadowBlur = 8;
            const yBottom = height - timeUntilHit * speed;
            const pixelH = noteEvent.duration * speed;
            ctx.fillRect(idx * keyWidth + 1, yBottom - pixelH, keyWidth - 2, pixelH);
          });
          ctx.restore();
        }

        activeSet.forEach(note => {
          const hue = (note % 12) * 30;
          ctx.fillStyle = `hsl(${hue},100%,80%)`;
          ctx.shadowBlur = 20;
          ctx.shadowColor = `hsl(${hue},100%,80%)`;
          ctx.fillRect(0, height - 10, width, 10);
        });
        ctx.shadowBlur = 0;

      // ── Media show ───────────────────────────────────────────────────────────
      } else if (mode === 'media-show' && activeSet.size > 0) {
        const firstNote = Array.from(activeSet)[0];
        const media = mediaElementsRef.current.get(firstNote);

        const imgEl = media as HTMLImageElement | undefined;
        const vidEl = media as HTMLVideoElement | undefined;
        const isImageReady = !!(imgEl?.complete && (imgEl?.naturalWidth ?? 0) > 0);
        const isVideoReady = typeof vidEl?.readyState === 'number' && (vidEl.readyState ?? 0) >= 2;

        if (media && (isImageReady || isVideoReady)) {
          const segments = 8;
          const cx = width / 2;
          const cy = height / 2;
          const radius = Math.max(width, height);
          const srcW = (imgEl?.naturalWidth || vidEl?.videoWidth) || 300;
          const srcH = (imgEl?.naturalHeight || vidEl?.videoHeight) || 300;
          const minDim = Math.max(srcW, srcH, 1);
          const scale = radius / minDim;

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(currentTime * 0.5);
          for (let i = 0; i < segments; i++) {
            ctx.save();
            ctx.rotate((i * Math.PI * 2) / segments);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(radius, -radius * Math.tan(Math.PI / segments));
            ctx.lineTo(radius, radius * Math.tan(Math.PI / segments));
            ctx.closePath();
            ctx.clip();
            if (i % 2 === 1) ctx.scale(1, -1);
            try {
              ctx.drawImage(media as CanvasImageSource, 0, -radius / 2, srcW * scale, srcH * scale);
            } catch { /* skip if media not ready this frame */ }
            ctx.restore();
          }
          ctx.restore();

          const hue = (firstNote % 12) * 30;
          ctx.globalCompositeOperation = 'overlay';
          ctx.fillStyle = `hsla(${hue},100%,50%,0.3)`;
          ctx.fillRect(0, 0, width, height);
          ctx.globalCompositeOperation = 'source-over';
        } else {
          // Pulsing placeholder while media buffers
          const hue = (firstNote % 12) * 30;
          const pulse = (Math.sin(currentTime * 4) + 1) / 2;
          ctx.beginPath();
          ctx.arc(width / 2, height / 2, 50 + pulse * 80, 0, Math.PI * 2);
          ctx.fillStyle = `hsl(${hue},100%,50%)`;
          ctx.fill();
        }
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100vw', height: '100vh', background: 'black' }}
    />
  );
}
