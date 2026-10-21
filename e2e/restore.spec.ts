import { expect, test } from '@playwright/test';
import { REAL, checkBackup, collectErrors, confirmRestore, deliData, dumpStorage, exportViaUi, fixture, open, seed, visible } from './helpers';

const OTHER_APP = { other_app_auth: 'token-owned-by-another-app' };

test.describe('Restore from Backup', () => {
  test('export → change → restore → Undo, exactly, without touching other apps’ data', async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page, { ...REAL, ...OTHER_APP });
    const exported = await exportViaUi(page);
    const original = await dumpStorage(page);

    // Change things on the device after the export.
    const changed = { ...REAL, ...OTHER_APP, inventory_deliName: 'Changed Deli', inventory_currentOrder: JSON.stringify({ items: [], createdAt: '2026-10-16T00:00:00.000Z' }) };
    await seed(page, changed);
    const beforeRestore = await dumpStorage(page);

    await checkBackup(page, exported);
    await expect(page.getByText('Backup verified')).toBeVisible();
    await expect(page.getByTestId('restore-diff')).toContainText('inventory_deliName');
    await expect(page.getByTestId('restore-diff')).toContainText('Order lines: 0 → 2');
    await confirmRestore(page);

    await expect(page.getByText('Restore complete.')).toBeVisible();
    const restored = await dumpStorage(page);
    expect(deliData(restored)).toEqual(deliData(original));
    expect(restored.other_app_auth).toBe(OTHER_APP.other_app_auth);

    // Undo puts back exactly what was there before the restore.
    await open(page, '/manage');
    await visible(page).button('Undo Last Restore').click();
    await Promise.all([page.waitForEvent('load'), visible(page).button('Yes, Continue').click()]);
    await expect(page.getByText('The last restore was undone.')).toBeVisible();
    const undone = await dumpStorage(page);
    expect(deliData(undone)).toEqual(deliData(beforeRestore));
    expect(undone.other_app_auth).toBe(OTHER_APP.other_app_auth);

    // Both safety snapshots are listed and downloadable.
    await open(page, '/manage');
    await expect(page.getByTestId('snapshot-list').locator('li')).toHaveCount(2);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('snapshot-list').getByRole('button').first().click()]);
    expect(download.suggestedFilename()).toMatch(/^deliordernyc-snapshot-pre-undo-.*\.json$/);
    expect(errors).toEqual([]);
  });

  test('a PR #1 legacy backup restores all 141 products and the $77.98 order, skipping another app’s key', async ({ page }) => {
    await seed(page, { inventory_deliName: 'Phone', ...OTHER_APP });
    await checkBackup(page, fixture('pr1-c3d8d63-legacy-with-other-app-key.json'));
    await expect(page.getByText(/do not belong to DeliOrderNYC/)).toBeVisible();
    await confirmRestore(page);
    const restored = await dumpStorage(page);
    expect(JSON.parse(restored.inventory_products)).toHaveLength(141);
    expect(JSON.parse(restored.inventory_suppliers)).toHaveLength(13);
    expect(restored.other_app_auth).toBe(OTHER_APP.other_app_auth); // the file's value was never written
    await open(page, '/counter/orders');
    await expect(page.getByTestId('order-total')).toContainText('$77.98');
  });

  test('an unverified backup needs an explicit acknowledgement', async ({ page }) => {
    await seed(page, REAL);
    await checkBackup(page, fixture('pr1-b291176-no-web-crypto.json'));
    await expect(page.getByText('This backup cannot be verified')).toBeVisible();
    await page.getByLabel(/I understand this replaces/).check();
    await expect(visible(page).button('Restore Backup')).toBeDisabled();
    await page.getByLabel(/I understand this backup is unverified/).check();
    await expect(visible(page).button('Restore Backup')).toBeEnabled();
  });

  test('a tampered backup is refused and nothing can be restored', async ({ page }) => {
    await seed(page, REAL);
    const before = await dumpStorage(page);
    const tampered = JSON.parse(fixture('pr1-b291176-arizona-demo.json'));
    tampered.raw.inventory_deliName = 'Tampered';
    await checkBackup(page, JSON.stringify(tampered));
    await expect(page.getByText('This backup cannot be restored')).toBeVisible();
    await expect(page.getByText(/Checksum mismatch/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore Backup' })).toHaveCount(0);
    expect(await dumpStorage(page)).toEqual(before);
  });

  test('full browser storage: the restore refuses to start and nothing changes', async ({ page }) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if ((window as unknown as { __storageFull?: boolean }).__storageFull) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    await seed(page, REAL);
    await checkBackup(page, fixture('pr1-c3d8d63-arizona-demo.json'));
    const before = await dumpStorage(page);
    await page.evaluate(() => ((window as unknown as { __storageFull: boolean }).__storageFull = true));
    await page.getByLabel(/I understand this replaces/).check();
    await visible(page).button('Restore Backup').click();
    await expect(page.getByText(/The restore did not start\. Nothing was changed\./)).toBeVisible();
    expect(await dumpStorage(page)).toEqual(before);
  });

  test('not enough free space for a safety snapshot: refuses to start', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.storage, 'estimate', { value: async () => ({ quota: 5_000_000, usage: 4_990_000 }) });
    });
    await seed(page, REAL);
    const before = await dumpStorage(page);
    await checkBackup(page, fixture('pr1-c3d8d63-arizona-demo.json'));
    await page.getByLabel(/I understand this replaces/).check();
    await visible(page).button('Restore Backup').click();
    await expect(page.getByText(/not enough free browser storage/)).toBeVisible();
    expect(await dumpStorage(page)).toEqual(before);
  });
});
