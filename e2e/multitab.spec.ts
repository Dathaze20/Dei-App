import { expect, test } from '@playwright/test';
import { REAL, checkBackup, confirmRestore, deliData, dumpStorage, exportViaUi, seed } from './helpers';

test('a restore in one tab reloads the other tab, which then shows the restored data and never overwrites it', async ({ context }) => {
  const tabA = await context.newPage();
  await seed(tabA, { ...REAL, inventory_deliName: 'Backup Deli' });
  const backup = await exportViaUi(tabA);
  await seed(tabA, { ...REAL, inventory_deliName: 'Phone Deli' });

  const tabB = await context.newPage();
  await tabB.goto('/');
  await expect(tabB.getByText('Phone Deli').first()).toBeVisible();

  await checkBackup(tabA, backup);
  const bReloaded = tabB.waitForEvent('load');
  await confirmRestore(tabA);
  await bReloaded;

  await expect(tabB.getByText('Backup Deli').first()).toBeVisible();
  // Tab B's old in-memory state ("Phone Deli") was never saved over the restore.
  await tabB.waitForTimeout(1000);
  const stored = await dumpStorage(tabB);
  expect(stored.inventory_deliName).toBe('Backup Deli');
  expect(deliData(stored)).toEqual(deliData(JSON.parse(backup).raw));
});

test('two tabs editing the same data: the stale tab never overwrites the newer save', async ({ context }) => {
  const tabA = await context.newPage();
  await seed(tabA, { ...REAL, inventory_deliName: 'Original' }, '/manage');
  const tabB = await context.newPage();
  await tabB.goto('/#/manage');

  await tabB.locator('#deliName').fill('Saved in tab B');
  await tabB.getByRole('button', { name: 'Save Name' }).click();
  await expect.poll(async () => (await dumpStorage(tabA)).inventory_deliName).toBe('Saved in tab B');

  // Tab A still shows the old name and now edits it: this must not overwrite tab B's save.
  await tabA.locator('#deliName').fill('Stale edit in tab A');
  await tabA.getByRole('button', { name: 'Save Name' }).click();
  await expect(tabA.getByText('Changed in another tab or window', { exact: true })).toBeVisible();
  expect((await dumpStorage(tabA)).inventory_deliName).toBe('Saved in tab B');

  // Reloading tab A shows the newer data and saving works again.
  await tabA.getByRole('button', { name: 'Reload' }).click();
  await expect(tabA.locator('#deliName')).toHaveValue('Saved in tab B');
});
