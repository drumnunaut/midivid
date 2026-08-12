export type NoteEvent = { note: number; time: number; duration: number };
export type Song = { id: string; name: string; notes: NoteEvent[] };

function createSong(notesString: string, baseTime: number = 0, tempo: number = 120): NoteEvent[] {
  // notesString format: "C4 C4 G4 G4" where each is a quarter note, "(rest)" is a rest
  // tempo: bpm (quarter notes per minute)
  const quarterNoteDuration = 60 / tempo;
  let currentTime = baseTime;
  const events: NoteEvent[] = [];

  const notes = notesString.split(' ');
  for (const n of notes) {
    if (n === '(rest)') {
      currentTime += quarterNoteDuration;
      continue;
    }
    
    // Parse note like C4, C#4
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const match = n.match(/([A-G]#?)(\d)/);
    if (match) {
      const name = match[1];
      const octave = parseInt(match[2], 10);
      const noteIndex = noteNames.indexOf(name);
      if (noteIndex !== -1) {
        // C4 = 60
        const midiNote = 12 * (octave + 1) + noteIndex;
        // slightly less than full duration for articulation
        events.push({ note: midiNote, time: currentTime, duration: quarterNoteDuration * 0.9 });
      }
    }
    currentTime += quarterNoteDuration;
  }
  return events;
}

export const songs: Song[] = [
  {
    id: 'fur-elise',
    name: 'Für Elise',
    notes: createSong('E5 D#5 E5 D#5 E5 B4 D5 C5 A4 (rest) C4 E4 A4 B4 (rest) E4 G#4 B4 C5 (rest) E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4', 0, 160)
  },
  {
    id: 'ode-to-joy',
    name: 'Ode to Joy',
    notes: createSong('E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4', 0, 120)
  },
  {
    id: 'twinkle',
    name: 'Twinkle Twinkle',
    notes: createSong('C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4 G4 G4 F4 F4 E4 E4 D4 G4 G4 F4 F4 E4 E4 D4 C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4', 0, 100)
  },
  {
    id: 'mary',
    name: 'Mary Had a Little Lamb',
    notes: createSong('E4 D4 C4 D4 E4 E4 E4 D4 D4 D4 E4 G4 G4 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4', 0, 120)
  },
  {
    id: 'jingle',
    name: 'Jingle Bells',
    notes: createSong('E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4 F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4 G4 E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4', 0, 140)
  },
  {
    id: 'happy-birthday',
    name: 'Happy Birthday',
    notes: createSong('G4 G4 A4 G4 C5 B4 G4 G4 A4 G4 D5 C5 G4 G4 G5 E5 C5 B4 A4 F5 F5 E5 C5 D5 C5', 0, 120)
  }
];
