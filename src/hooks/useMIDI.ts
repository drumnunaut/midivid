import { useEffect, useState, useCallback, useRef } from 'react';

export function useMIDI() {
  const [midiAccess, setMidiAccess] = useState<any | null>(null);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [activeMidiNotes, setActiveMidiNotes] = useState<Set<number>>(new Set());
  // Use a revision counter to force re-render on device connect/disconnect
  // WITHOUT replacing the midiAccess object (which would cause an infinite loop)
  const [, setMidiRevision] = useState(0);

  // Store listeners in a ref so the MIDI effect doesn't need to re-run when they change
  const listenersRef = useRef<{
    noteOn?: (note: number, velocity: number) => void;
    noteOff?: (note: number) => void;
    cc?: (controller: number, value: number) => void;
  }>({});

  const setListeners = useCallback((l: {
    noteOn?: (note: number, velocity: number) => void;
    noteOff?: (note: number) => void;
    cc?: (controller: number, value: number) => void;
  }) => {
    listenersRef.current = l;
  }, []);

  useEffect(() => {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess()
        .then((access) => {
          setMidiAccess(access as any);
        })
        .catch((err) => {
          setMidiError('MIDI Access Denied');
        });
    } else {
      setMidiError('Web MIDI not supported');
    }
  }, []);

  useEffect(() => {
    if (!midiAccess) return;

    const handleMessage = (msg: any) => {
      const [status, note, velocity] = msg.data;
      const cmd = status >> 4;
      
      if (cmd === 9 && velocity > 0) { // Note On
        setActiveMidiNotes((prev) => new Set(prev).add(note));
        listenersRef.current.noteOn?.(note, velocity);
      } else if (cmd === 8 || (cmd === 9 && velocity === 0)) { // Note Off
        setActiveMidiNotes((prev) => {
          const next = new Set(prev);
          next.delete(note);
          return next;
        });
        listenersRef.current.noteOff?.(note);
      } else if (cmd === 11) { // Control Change
        listenersRef.current.cc?.(note, velocity);
      }
    };

    const attachInputs = () => {
      const inputs = (midiAccess as any).inputs.values();
      for (const input of inputs) {
        input.onmidimessage = handleMessage;
      }
    };

    attachInputs();

    (midiAccess as any).onstatechange = () => {
      attachInputs();
      // Increment revision counter to force a re-render (so deviceCount updates)
      // without replacing the midiAccess object reference (which caused infinite loop)
      setMidiRevision(r => r + 1);
    };

    return () => {
      const inputs = (midiAccess as any).inputs.values();
      for (const input of inputs) {
        input.onmidimessage = null;
      }
      (midiAccess as any).onstatechange = null;
    };
  }, [midiAccess]); // listenersRef is a ref — no need in deps

  const deviceCount = midiAccess ? Array.from((midiAccess as any).inputs.values()).length : 0;

  return {
    isSupported: !midiError,
    deviceCount,
    statusText: midiError ? midiError : `MIDI: Connected (${deviceCount} device${deviceCount === 1 ? '' : 's'})`,
    activeMidiNotes,
    setListeners
  };
}
