// utils/shelfCamera.ts
//
// Shelf photos from the Android camera, in a way that survives Android closing the app.
//
// v0.1.5 used the WebView's camera input. While the camera app is open, Android may close this
// app (the page, the activity or the whole process) to free memory; the photo was then handed to
// a page that no longer existed and was lost, and the app reopened on another screen. Now:
//   1. Before the camera opens, the check it is for is remembered on the phone (PENDING_KEY).
//   2. The camera app writes the photo into a private inbox folder (DeliNativePlugin.java).
//   3. Whenever the page starts or comes back, collectShelfPhotos() takes every photo in the inbox,
//      stores it in that check (IndexedDB, utils/shelfStore.ts), and only then deletes it from the
//      inbox. Names already stored are remembered (STORED_KEY), so a photo is never added twice,
//      even if the app is closed between storing and deleting.
// Both keys are `deliordernyc_sys_` keys: device-only, never exported or restored.
import { MAX_PHOTOS_PER_CHECK, ShelfCheck, newShelfCheck, withPhoto } from './shelfCheck';

export const PENDING_KEY = 'deliordernyc_sys_shelfCapture';
export const STORED_KEY = 'deliordernyc_sys_shelfInbox';

export interface InboxPhoto {
  name: string;
  dataUrl: string;
}

export interface ShelfCameraNative {
  takeShelfPhoto(): Promise<{ taken: boolean }>;
  /** Android's photo picker; the chosen photos go into the same inbox. */
  chooseShelfPhotos(): Promise<{ taken: boolean }>;
  /** capturing: the camera is still open; cancelled: it was closed without a photo. */
  takeShelfPhotos(): Promise<{ photos: InboxPhoto[]; failed: number; capturing: boolean; cancelled?: boolean }>;
  deleteShelfPhotos(options: { names: string[] }): Promise<void>;
}

export interface ShelfPhotoStore {
  getCheck(id: string): Promise<ShelfCheck | null>;
  putCheck(check: ShelfCheck): Promise<unknown>;
  putShelfImage(dataUrl: string): Promise<string>;
}

export interface PendingCapture {
  checkId: string;
  startedAt: string;
}

export interface Pickup {
  /** The check the photos went into (or the camera was opened for); null when nothing happened. */
  checkId: string | null;
  added: number;
  /** Photos that could not be read and were removed. */
  failed: number;
  /** The camera was opened for a check, the app was closed meanwhile, and no photo came back. */
  lost: boolean;
  /** Photos did not fit in the check (12 at most) and went into this new check. */
  overflowCheckId: string | null;
}

const read = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the photos are still in the inbox and are collected next time.
  }
};

export const pendingCapture = (): PendingCapture | null => {
  const value = read<PendingCapture>(PENDING_KEY);
  return value && typeof value.checkId === 'string' ? value : null;
};

const storedNames = (): string[] => {
  const value = read<{ names?: unknown }>(STORED_KEY);
  return Array.isArray(value?.names) ? value.names.filter((n): n is string => typeof n === 'string') : [];
};

/** Sent on window with the Pickup whenever photos were stored, failed, or did not come back. */
export const PICKUP_EVENT = 'deli-shelf-pickup';

let running: Promise<Pickup> | null = null;

/**
 * Stores every photo waiting in the inbox. Runs once at a time: a second call while one is
 * running gets the same answer, so the start-up check and the camera's own answer never both add
 * the same photo.
 */
export const collectShelfPhotos = (native: ShelfCameraNative, store: ShelfPhotoStore, supplierId: string | null): Promise<Pickup> =>
  (running ??= collect(native, store, supplierId).finally(() => {
    running = null;
  }));

const collect = async (native: ShelfCameraNative, store: ShelfPhotoStore, supplierId: string | null): Promise<Pickup> => {
  const pending = pendingCapture();
  const { photos, failed, capturing, cancelled = false } = await native.takeShelfPhotos();
  const already = new Set(storedNames());
  const fresh = photos.filter(p => !already.has(p.name));

  let check: ShelfCheck | null = pending ? await store.getCheck(pending.checkId).catch(() => null) : null;
  if (check && check.state !== 'draft') check = null;
  let firstCheckId: string | null = check?.id ?? pending?.checkId ?? null;
  let overflowCheckId: string | null = null;
  let added = 0;

  for (const photo of fresh) {
    if (!check || check.imageIds.length >= MAX_PHOTOS_PER_CHECK) {
      const full = !!check;
      check = newShelfCheck(supplierId);
      if (full) overflowCheckId ??= check.id;
      else firstCheckId = check.id;
    }
    const imageId = await store.putShelfImage(photo.dataUrl);
    check = withPhoto(check, imageId);
    await store.putCheck(check);
    already.add(photo.name);
    write(STORED_KEY, { names: [...already] });
    added++;
  }

  // Everything stored can leave the inbox now. If deleting fails, the names stay remembered.
  const done = photos.map(p => p.name).filter(name => already.has(name));
  if (done.length) {
    try {
      await native.deleteShelfPhotos({ names: done });
      write(STORED_KEY, null);
    } catch {
      // Tried again next time; the remembered names keep the photos from being added twice.
    }
  } else if (already.size && !photos.length) {
    write(STORED_KEY, null);
  }

  // The camera is closed now (or never answered): the check no longer waits for it.
  const lost = !!pending && !capturing && !cancelled && added === 0 && failed === 0;
  if (!capturing) write(PENDING_KEY, null);

  const pickup: Pickup = { checkId: added || lost || failed ? firstCheckId : null, added, failed, lost, overflowCheckId };
  if (pickup.checkId && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<Pickup>(PICKUP_EVENT, { detail: pickup }));
  return pickup;
};

/**
 * Opens the camera (or the photo picker) for a check and stores the photos when they come back (announced with
 * PICKUP_EVENT). If Android closes the app meanwhile, this promise never settles; the collection
 * when the app starts again stores the photo instead.
 */
export const captureShelfPhoto = async (
  native: ShelfCameraNative,
  store: ShelfPhotoStore,
  check: ShelfCheck,
  source: 'camera' | 'gallery' = 'camera',
): Promise<Pickup> => {
  write(PENDING_KEY, { checkId: check.id, startedAt: new Date().toISOString() } satisfies PendingCapture);
  try {
    await (source === 'gallery' ? native.chooseShelfPhotos() : native.takeShelfPhoto());
  } catch (error) {
    write(PENDING_KEY, null);
    throw error;
  }
  return collectShelfPhotos(native, store, check.supplierId);
};

/** For tests: forget a collection left running by a failed test. */
export const resetShelfCameraForTests = () => {
  running = null;
};
