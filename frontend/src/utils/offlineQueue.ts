/**
 * Penyimpanan offline berbasis IndexedDB (native, tanpa dependensi) untuk
 * pengisian survei lapangan oleh surveyor:
 *  - store `queue`: respons yang diisi offline, menunggu sinkronisasi
 *  - store `cache`: data survei (fill & nomor) agar bisa dibuka tanpa internet
 */

const DB_NAME = 'survei-offline';
const DB_VERSION = 2;
const QUEUE_STORE = 'queue';
const CACHE_STORE = 'cache';
const MEDIA_STORE = 'media';

/** Prefiks nilai jawaban media yang masih lokal (belum terunggah). */
export const LOCAL_MEDIA_PREFIX = 'local-media://';

export interface QueuedResponse {
  /** Kunci lokal unik (juga dipakai sebagai clientSubmissionId idempotensi). */
  localId: string;
  surveyId: string;
  surveyTitle: string;
  /** Endpoint pengiriman respons (surveyor atau responden). */
  submitPath: string;
  /** Endpoint unggah media untuk me-resolve local-media://. */
  uploadPath: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'localId' });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = fn(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      }),
  );
}

// ─── Queue ────────────────────────────────────────────────────────────────

export function queueAdd(record: QueuedResponse): Promise<void> {
  return tx<IDBValidKey>(QUEUE_STORE, 'readwrite', (s) => s.put(record)).then(() => undefined);
}

export function queueGetAll(): Promise<QueuedResponse[]> {
  return tx<QueuedResponse[]>(QUEUE_STORE, 'readonly', (s) => s.getAll());
}

export function queueDelete(localId: string): Promise<void> {
  return tx<undefined>(QUEUE_STORE, 'readwrite', (s) => s.delete(localId)).then(() => undefined);
}

export async function queueCount(): Promise<number> {
  const all = await queueGetAll();
  return all.length;
}

// ─── Cache (data survei untuk offline) ──────────────────────────────────────

export function cachePut(key: string, value: unknown): Promise<void> {
  return tx<IDBValidKey>(CACHE_STORE, 'readwrite', (s) => s.put({ key, value })).then(
    () => undefined,
  );
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const row = await tx<{ key: string; value: T } | undefined>(CACHE_STORE, 'readonly', (s) =>
    s.get(key),
  );
  return row ? row.value : null;
}

// ─── Media (blob foto/audio/ttd/berkas yang diisi offline) ──────────────────

export interface StoredMedia {
  id: string;
  blob: Blob;
  filename: string;
}

export function mediaPut(media: StoredMedia): Promise<void> {
  return tx<IDBValidKey>(MEDIA_STORE, 'readwrite', (s) => s.put(media)).then(() => undefined);
}

export function mediaGet(id: string): Promise<StoredMedia | undefined> {
  return tx<StoredMedia | undefined>(MEDIA_STORE, 'readonly', (s) => s.get(id));
}

export function mediaDelete(id: string): Promise<void> {
  return tx<undefined>(MEDIA_STORE, 'readwrite', (s) => s.delete(id)).then(() => undefined);
}

/** UUID v4 (pakai crypto bila tersedia, fallback sederhana). */
export function makeLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
