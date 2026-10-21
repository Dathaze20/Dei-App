// utils/photoStore.ts
//
// Product photos the person adds on this phone. They are kept in IndexedDB (not localStorage,
// which is small and holds the main data), resized to at most 480px and stored as JPEG data so a
// whole catalog of photos stays a few megabytes. A product points at its photo with
// imageUrl = "photo:<id>". Photos are NOT inside the main backup file (its format is unchanged);
// Settings › Product photos exports and imports them as a separate file, and says so.

const DB_NAME = 'deliordernyc-photos';
const STORE = 'photos';
export const MAX_PHOTO_SIDE = 480;
export const MAX_PHOTO_BYTES = 400_000;
export const PHOTO_EXPORT_FORMAT = 'deliordernyc-photos';

export interface StoredPhoto {
  id: string;
  dataUrl: string;
  createdAt: string;
}

const cache = new Map<string, string>();

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no-indexeddb'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const run = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

export const isValidPhotoData = (dataUrl: unknown): dataUrl is string =>
  typeof dataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) && dataUrl.length <= MAX_PHOTO_BYTES * 1.4;

export const newPhotoId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const savePhoto = async (dataUrl: string, id = newPhotoId()): Promise<string> => {
  if (!isValidPhotoData(dataUrl)) throw new Error('invalid-photo');
  await run('readwrite', store => store.put({ id, dataUrl, createdAt: new Date().toISOString() } satisfies StoredPhoto));
  cache.set(id, dataUrl);
  return id;
};

export const getPhoto = async (id: string): Promise<string | null> => {
  const cached = cache.get(id);
  if (cached) return cached;
  try {
    const record = (await run<StoredPhoto | undefined>('readonly', store => store.get(id))) ?? null;
    if (record && isValidPhotoData(record.dataUrl)) {
      cache.set(id, record.dataUrl);
      return record.dataUrl;
    }
  } catch {
    // Unavailable: the product shows its label tile instead.
  }
  return null;
};

export const listPhotos = async (): Promise<StoredPhoto[]> => (await run<StoredPhoto[]>('readonly', store => store.getAll())) ?? [];

/** The separate photo backup file. */
export const buildPhotoExport = (photos: StoredPhoto[]) =>
  JSON.stringify({ format: PHOTO_EXPORT_FORMAT, schemaVersion: 1, exportedAt: new Date().toISOString(), photos }, null, 1);

/** Reads a photo backup; returns only well-formed photos. */
export const parsePhotoExport = (text: string): StoredPhoto[] | null => {
  try {
    const data = JSON.parse(text);
    if (data?.format !== PHOTO_EXPORT_FORMAT || !Array.isArray(data.photos)) return null;
    return data.photos.filter(
      (p: StoredPhoto) => p && typeof p.id === 'string' && /^[\w-]{1,64}$/.test(p.id) && isValidPhotoData(p.dataUrl),
    );
  } catch {
    return null;
  }
};

/** Adds photos from a backup; photos already on the phone are kept as they are. */
export const importPhotos = async (photos: StoredPhoto[]): Promise<{ added: number; kept: number }> => {
  let added = 0;
  let kept = 0;
  for (const photo of photos) {
    if (await getPhoto(photo.id)) {
      kept++;
      continue;
    }
    await savePhoto(photo.dataUrl, photo.id);
    added++;
  }
  return { added, kept };
};

/** Shrinks a chosen or taken picture to at most MAX_PHOTO_SIDE px, as JPEG. */
export const resizeImageFile = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('not-an-image'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('no-canvas'));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.7, 0.55]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (isValidPhotoData(data)) return resolve(data);
      }
      reject(new Error('too-large'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
