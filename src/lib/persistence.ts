/**
 * MIDIVid — persistence layer
 *
 * FX settings   → localStorage (small JSON)
 * Media blobs   → IndexedDB (image/video files survive restarts as blobs;
 *                 works identically in the browser and the Electron desktop
 *                 app, and avoids stale file-path problems entirely)
 */

import { EffectsSettings, DEFAULT_EFFECTS_SETTINGS } from '../types/effects';

// ── FX settings (localStorage) ────────────────────────────────────────────────

const FX_KEY = 'midivid_effectsSettings';

export function loadEffectsSettings(): EffectsSettings {
  try {
    const raw = localStorage.getItem(FX_KEY);
    if (!raw) return DEFAULT_EFFECTS_SETTINGS;
    const parsed = JSON.parse(raw);
    // Merge with defaults so new fields added in later versions get sane values
    return { ...DEFAULT_EFFECTS_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_EFFECTS_SETTINGS;
  }
}

export function saveEffectsSettings(settings: EffectsSettings): void {
  try { localStorage.setItem(FX_KEY, JSON.stringify(settings)); } catch {}
}

// ── Media assignments (IndexedDB) ─────────────────────────────────────────────

const DB_NAME    = 'midivid';
const DB_VERSION = 1;
const STORE      = 'mediaAssignments';

type StoredMedia =
  | { note: number; kind: 'image' | 'video'; blob: Blob; name: string; mime: string }
  | { note: number; kind: 'camera' };

export type RestoredMedia =
  | { note: number; type: 'image' | 'video'; file: File }
  | { note: number; type: 'camera' };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'note' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Resolves only when the transaction actually commits (not just request success). */
function writeTx(db: IDBDatabase, run: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.oncomplete = () => resolve();
    t.onerror    = () => reject(t.error);
    t.onabort    = () => reject(t.error);
    run(t.objectStore(STORE));
  });
}

// All writes are serialized through a single FIFO queue so they commit in the
// exact order the user performed them. Without this, an assign immediately
// followed by a clear could commit out of order (independent connections /
// transactions), resurrecting the cleared assignment on next startup.
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(run: (store: IDBObjectStore) => void): Promise<void> {
  const op = writeQueue.then(async () => {
    const db = await openDb();
    try { await writeTx(db, run); }
    finally { db.close(); }
  });
  // Keep the queue alive even if this op fails; the caller still sees the error.
  writeQueue = op.catch(() => {});
  return op;
}

/** Persist an image/video assignment (stores the file blob itself). */
export function persistMediaFile(note: number, file: File): Promise<void> {
  const kind: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
  const entry: StoredMedia = { note, kind, blob: file, name: file.name, mime: file.type };
  return enqueueWrite((store) => store.put(entry));
}

/** Persist a camera assignment (no blob — just the marker). */
export function persistCameraAssignment(note: number): Promise<void> {
  const entry: StoredMedia = { note, kind: 'camera' };
  return enqueueWrite((store) => store.put(entry));
}

export function removePersistedMedia(note: number): Promise<void> {
  return enqueueWrite((store) => store.delete(note));
}

export function clearAllPersistedMedia(): Promise<void> {
  return enqueueWrite((store) => store.clear());
}

/** Load every stored assignment; blobs are rewrapped as File objects. */
export async function loadPersistedMedia(): Promise<RestoredMedia[]> {
  const db = await openDb();
  try {
    const all = await reqAsPromise(tx(db, 'readonly').getAll() as IDBRequest<StoredMedia[]>);
    return all.map((entry) => {
      if (entry.kind === 'camera') return { note: entry.note, type: 'camera' as const };
      const file = new File([entry.blob], entry.name, { type: entry.mime });
      return { note: entry.note, type: entry.kind, file };
    });
  } finally { db.close(); }
}
