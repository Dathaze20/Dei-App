import { Page, expect, test } from '@playwright/test';
import { readFileSync } from 'fs';
import { REAL, deliData, dumpStorage, exportViaUi, open, seed, visible } from './helpers';

/** Writes a safety snapshot and a restore journal straight into the app's IndexedDB. */
const plantInterruptedRestore = (page: Page, args: { snapshotText: string | null; phase: string; target: Record<string, string> }) =>
  page.evaluate(async ({ snapshotText, phase, target }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('deliordernyc-safety', 1);
      request.onupgradeneeded = () => {
        const d = request.result;
        if (!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('journal')) d.createObjectStore('journal', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const put = (store: string, value: unknown) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    const now = new Date().toISOString();
    if (snapshotText) {
      const parsed = JSON.parse(snapshotText);
      await put('snapshots', { id: 'snap-e2e', createdAt: now, purpose: 'pre-restore', exportText: snapshotText, rawChecksum: parsed.rawChecksum, byteLength: snapshotText.length });
    }
    await put('journal', { id: 'active', restoreId: 'r-e2e', phase, snapshotId: 'snap-e2e', target, purpose: 'pre-restore', startedAt: now, updatedAt: now });
    db.close();
    // The restore had written part of the backup and set its lock when the "power was cut".
    localStorage.setItem('inventory_deliName', 'HALF-WRITTEN');
    localStorage.setItem('deliordernyc_sys_restore_lock', '{}');
  }, args);

test('browser closed mid-restore: the next start puts the previous data back exactly', async ({ page }) => {
  await seed(page, REAL);
  const snapshotText = await exportViaUi(page);
  const original = deliData(await dumpStorage(page));
  await plantInterruptedRestore(page, { snapshotText, phase: 'applying', target: { ...REAL, inventory_deliName: 'Backup Deli' } });

  await page.reload();
  await expect(page.getByText('An interrupted restore was undone when the app started.')).toBeVisible();
  const after = await dumpStorage(page);
  expect(deliData(after)).toEqual(original);
  expect(after.deliordernyc_sys_restore_lock).toBeUndefined();
});

test('browser closed after everything was written: the next start completes the restore', async ({ page }) => {
  await seed(page, REAL);
  const snapshotText = await exportViaUi(page);
  const target = { ...deliData(await dumpStorage(page)), inventory_deliName: 'HALF-WRITTEN' };
  await plantInterruptedRestore(page, { snapshotText, phase: 'applying', target });
  await page.reload();
  await expect(page.getByText('An interrupted restore was finished when the app started.')).toBeVisible();
  expect(deliData(await dumpStorage(page))).toEqual(target);
});

test('rollback impossible: the app pauses on a recovery screen and changes nothing', async ({ page }) => {
  await seed(page, REAL);
  await plantInterruptedRestore(page, { snapshotText: null, phase: 'rollback-failed', target: { ...REAL, inventory_deliName: 'Backup Deli' } });
  const before = await dumpStorage(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Data Recovery Needed' })).toBeVisible();
  await expect(page.locator('#root header')).toHaveCount(0); // the app's screens never mounted
  expect(await dumpStorage(page)).toEqual(before);

  // The backup that was being restored can still be downloaded as a normal export file.
  const [download] = await Promise.all([page.waitForEvent('download'), visible(page).button('Download the Backup Being Restored').click()]);
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(file.format).toBe('deliordernyc-export');
  expect(file.raw.inventory_deliName).toBe('Backup Deli');

  // Retrying cannot succeed without the snapshot, and still changes nothing.
  await visible(page).button('Try Putting the Data Back Again').click();
  await expect(page.getByText(/could not be read or verified/)).toBeVisible();
  expect(await dumpStorage(page)).toEqual(before);
});

test('a stale lock with no journal is cleared and the app opens normally', async ({ page }) => {
  await seed(page, { ...REAL, deliordernyc_sys_restore_lock: '{}' });
  await open(page, '/');
  expect((await dumpStorage(page)).deliordernyc_sys_restore_lock).toBeUndefined();
});
