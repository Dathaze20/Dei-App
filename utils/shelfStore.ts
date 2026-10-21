// utils/shelfStore.ts
//
// Shelf checks and their photos (utils/shelfCheck.ts), in their own IndexedDB database so they
// can never touch the main data, the product photos or the backups. Photos are made smaller
// (1280px, JPEG) to keep enough detail to count from while staying a few hundred KB each.
// Saved or discarded checks are deleted, with their photos, after RETENTION_DAYS (purgeExpired).
import { isExpired, isShelfCheck, ShelfCheck } from './shelfCheck';

const DB_NAME = 'deliordernyc-shelf';
const CHECKS = 'checks';
const IMAGES = 'images';
export const SHELF_PHOTO_SIDE = 1280;
export const SHELF_PHOTO_MAX_BYTES = 900_000;

let connection: Promise<IDBDatabase> | null = null;
const open = (): Promise<IDBDatabase> =>
  (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no-indexeddb'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CHECKS, { keyPath: 'id' });
      request.result.createObjectStore(IMAGES, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch(error => {
    connection = null;
    throw error;
  }));

const run = async <T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = work(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

export const listChecks = async (): Promise<ShelfCheck[]> =>
  ((await run<unknown[]>(CHECKS, 'readonly', s => s.getAll())) ?? [])
    .filter(isShelfCheck)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export const getCheck = async (id: string): Promise<ShelfCheck | null> => {
  const value = await run<unknown>(CHECKS, 'readonly', s => s.get(id));
  return isShelfCheck(value) ? value : null;
};

export const putCheck = (check: ShelfCheck) => run(CHECKS, 'readwrite', s => s.put(check));

export const putShelfImage = async (dataUrl: string): Promise<string> => {
  const id = `img${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  await run(IMAGES, 'readwrite', s => s.put({ id, dataUrl, createdAt: new Date().toISOString() }));
  return id;
};

export const getShelfImage = async (id: string): Promise<string | null> => {
  const value = await run<{ dataUrl?: unknown } | undefined>(IMAGES, 'readonly', s => s.get(id));
  return typeof value?.dataUrl === 'string' ? value.dataUrl : null;
};

export const deleteShelfImages = async (ids: readonly string[]) => {
  for (const id of ids) await run(IMAGES, 'readwrite', s => s.delete(id));
};

/** Deletes a check and its photos. */
export const deleteCheck = async (check: ShelfCheck) => {
  await deleteShelfImages(check.imageIds);
  await run(CHECKS, 'readwrite', s => s.delete(check.id));
};

/** Removes saved or discarded checks (and photos) past the retention period. Returns how many. */
export const purgeExpired = async (now = new Date()): Promise<number> => {
  const expired = (await listChecks()).filter(check => isExpired(check, now));
  for (const check of expired) await deleteCheck(check);
  return expired.length;
};

/** Shrinks a shelf photo to at most SHELF_PHOTO_SIDE px as JPEG. */
export const resizeShelfPhoto = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('not-an-image'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, SHELF_PHOTO_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('no-canvas'));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.78, 0.65, 0.5]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length <= SHELF_PHOTO_MAX_BYTES * 1.37) return resolve(data);
      }
      reject(new Error('too-large'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
