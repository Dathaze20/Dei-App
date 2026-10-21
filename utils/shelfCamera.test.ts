// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxPhoto, PENDING_KEY, PICKUP_EVENT, Pickup, STORED_KEY, ShelfCameraNative } from './shelfCamera';
import { MAX_PHOTOS_PER_CHECK, newShelfCheck } from './shelfCheck';

/**
 * A stand-in for DeliNativePlugin's inbox: the camera "writes" a photo into it, takeShelfPhotos
 * lists it, deleteShelfPhotos removes it. Like the real one, it survives the page being reloaded.
 */
class FakeInbox implements ShelfCameraNative {
  files: InboxPhoto[] = [];
  capturing = false;
  cancelled = false;
  failed = 0;
  deleteFails = false;
  /** What the camera app does when opened: 'photo', 'cancel', or 'killed' (Android closes the app). */
  next: 'photo' | 'cancel' | 'killed' = 'photo';
  private counter = 0;

  addPhoto() {
    this.counter++;
    this.files.push({ name: `photo-${1000 + this.counter}.jpg`, dataUrl: `data:image/jpeg;base64,PHOTO${this.counter}` });
  }

  chooseShelfPhotos() {
    return this.takeShelfPhoto();
  }

  takeShelfPhoto() {
    if (this.next === 'killed') {
      // The camera wrote the photo, but the page that asked is gone: the promise never settles.
      this.addPhoto();
      return new Promise<{ taken: boolean }>(() => undefined);
    }
    if (this.next === 'cancel') {
      this.cancelled = true;
      return Promise.resolve({ taken: false });
    }
    this.addPhoto();
    return Promise.resolve({ taken: true });
  }

  async takeShelfPhotos() {
    const cancelled = this.cancelled;
    this.cancelled = false;
    return { photos: [...this.files], failed: this.failed, capturing: this.capturing, cancelled };
  }

  async deleteShelfPhotos({ names }: { names: string[] }) {
    if (this.deleteFails) throw new Error('delete failed');
    this.files = this.files.filter(f => !names.includes(f.name));
  }
}

/** A fresh copy of the page's modules, as after Android reloads the WebView. */
const loadPage = async () => {
  vi.resetModules();
  const camera = await import('./shelfCamera');
  const store = await import('./shelfStore');
  return { camera, store };
};

const pickups: Pickup[] = [];
window.addEventListener(PICKUP_EVENT, event => pickups.push((event as CustomEvent<Pickup>).detail));

beforeEach(() => {
  localStorage.clear();
  pickups.length = 0;
  indexedDB.deleteDatabase('deliordernyc-shelf');
});

describe('shelf camera', () => {
  it('stores a taken photo in the same check, at once, and empties the inbox', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    const check = newShelfCheck('arizona');
    await store.putCheck(check);

    const pickup = await camera.captureShelfPhoto(inbox, store, check);

    expect(pickup).toMatchObject({ checkId: check.id, added: 1, lost: false, failed: 0 });
    const saved = await store.getCheck(check.id);
    expect(saved?.imageIds).toHaveLength(1);
    expect(await store.getShelfImage(saved!.imageIds[0])).toBe('data:image/jpeg;base64,PHOTO1');
    expect(inbox.files).toEqual([]);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(localStorage.getItem(STORED_KEY)).toBeNull();
    expect(pickups.map(p => p.checkId)).toEqual([check.id]);
  });

  it('photos chosen in the gallery go into the same check the same way', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    const check = newShelfCheck(null);
    await store.putCheck(check);
    const pickup = await camera.captureShelfPhoto(inbox, store, check, 'gallery');
    expect(pickup).toMatchObject({ checkId: check.id, added: 1 });
  });

  it('keeps adding photos to the same check', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    const check = newShelfCheck(null);
    await store.putCheck(check);
    for (let i = 0; i < 3; i++) await camera.captureShelfPhoto(inbox, store, (await store.getCheck(check.id))!);
    expect((await store.getCheck(check.id))?.imageIds).toHaveLength(3);
  });

  it('recovers the photo when Android closed the app while the camera was open', async () => {
    const first = await loadPage();
    const inbox = new FakeInbox();
    inbox.next = 'killed';
    const check = newShelfCheck('arizona');
    await first.store.putCheck(check);
    void first.camera.captureShelfPhoto(inbox, first.store, check);
    await Promise.resolve();
    expect(JSON.parse(localStorage.getItem(PENDING_KEY)!).checkId).toBe(check.id);

    // The app starts again from scratch (new page, same phone storage, same inbox).
    const second = await loadPage();
    const pickup = await second.camera.collectShelfPhotos(inbox, second.store, null);

    expect(pickup).toMatchObject({ checkId: check.id, added: 1, lost: false });
    expect((await second.store.getCheck(check.id))?.imageIds).toHaveLength(1);
    expect(inbox.files).toEqual([]);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('says so when the camera was opened, the app was closed, and no photo came back', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    const check = newShelfCheck(null);
    await store.putCheck(check);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ checkId: check.id, startedAt: new Date().toISOString() }));

    const pickup = await camera.collectShelfPhotos(inbox, store, null);
    expect(pickup).toMatchObject({ checkId: check.id, added: 0, lost: true });
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('a cancelled camera is not reported as a lost photo', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    inbox.next = 'cancel';
    const check = newShelfCheck(null);
    await store.putCheck(check);
    const pickup = await camera.captureShelfPhoto(inbox, store, check);
    expect(pickup).toMatchObject({ checkId: null, added: 0, lost: false });
    expect(pickups).toEqual([]);
  });

  it('leaves the inbox alone while the camera is still open', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    inbox.capturing = true;
    const check = newShelfCheck(null);
    await store.putCheck(check);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ checkId: check.id, startedAt: new Date().toISOString() }));
    const pickup = await camera.collectShelfPhotos(inbox, store, null);
    expect(pickup.lost).toBe(false);
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull();
  });

  it('never adds a photo twice, also when deleting it from the inbox failed', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    inbox.deleteFails = true;
    const check = newShelfCheck(null);
    await store.putCheck(check);
    await camera.captureShelfPhoto(inbox, store, check);
    expect(inbox.files).toHaveLength(1);

    inbox.deleteFails = false;
    const again = await loadPage();
    await again.camera.collectShelfPhotos(inbox, again.store, null);
    expect((await again.store.getCheck(check.id))?.imageIds).toHaveLength(1);
    expect(inbox.files).toEqual([]);
    expect(localStorage.getItem(STORED_KEY)).toBeNull();
  });

  it('runs one collection at a time (start-up and the camera answer together)', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    const check = newShelfCheck(null);
    await store.putCheck(check);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ checkId: check.id, startedAt: new Date().toISOString() }));
    inbox.addPhoto();
    const [a, b] = await Promise.all([camera.collectShelfPhotos(inbox, store, null), camera.collectShelfPhotos(inbox, store, null)]);
    expect(a).toBe(b);
    expect((await store.getCheck(check.id))?.imageIds).toHaveLength(1);
  });

  it('a photo without a check (or for a saved check) starts a new unfinished check', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    inbox.addPhoto();
    const pickup = await camera.collectShelfPhotos(inbox, store, 'pepsico');
    const made = await store.getCheck(pickup.checkId!);
    expect(made).toMatchObject({ state: 'draft', supplierId: 'pepsico' });
    expect(made?.imageIds).toHaveLength(1);
  });

  it('photos beyond the limit go into a new check instead of being dropped', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    let check = newShelfCheck(null);
    check = { ...check, imageIds: Array.from({ length: MAX_PHOTOS_PER_CHECK }, (_, i) => `x${i}`) };
    await store.putCheck(check);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ checkId: check.id, startedAt: new Date().toISOString() }));
    inbox.addPhoto();
    const pickup = await camera.collectShelfPhotos(inbox, store, null);
    expect(pickup.checkId).toBe(check.id);
    expect(pickup.overflowCheckId).toBeTruthy();
    expect((await store.getCheck(pickup.overflowCheckId!))?.imageIds).toHaveLength(1);
  });

  it('keeps the photo in the inbox when it cannot be stored, and reports the error', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    const check = newShelfCheck(null);
    await store.putCheck(check);
    const failing = { ...store, putShelfImage: () => Promise.reject(new Error('QuotaExceededError')) };
    await expect(camera.captureShelfPhoto(inbox, failing, check)).rejects.toThrow('QuotaExceededError');
    expect(inbox.files).toHaveLength(1);
    // Next time there is room, it is stored.
    await camera.collectShelfPhotos(inbox, store, null);
    expect(inbox.files).toEqual([]);
  });

  it('reports unreadable photos', async () => {
    const { camera, store } = await loadPage();
    const inbox = new FakeInbox();
    inbox.failed = 1;
    const check = newShelfCheck(null);
    await store.putCheck(check);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ checkId: check.id, startedAt: new Date().toISOString() }));
    const pickup = await camera.collectShelfPhotos(inbox, store, null);
    expect(pickup).toMatchObject({ checkId: check.id, failed: 1, lost: false });
  });
});
