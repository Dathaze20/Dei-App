import { BrowserContext, Page, expect, test } from '@playwright/test';
import { REAL, checkBackup, confirmRestore, deliData, dumpStorage, fixture, seed, visible } from './helpers';

// The backup differs from the device (its stock values were generated on another day).
const BACKUP = fixture('pr1-c3d8d63-arizona-demo.json');
const BACKUP_DATA = deliData(JSON.parse(BACKUP).raw);

/** Tab A reviews the restore preview; tab B is the same app open in a second tab. */
const twoTabs = async (context: BrowserContext) => {
  const tabA = await context.newPage();
  await seed(tabA, { ...REAL, other_app_auth: 'other-app' });
  const tabB = await context.newPage();
  await tabB.goto('/#/');
  await expect(tabB.locator('#root header')).toBeVisible();
  await checkBackup(tabA, BACKUP);
  await expect(tabA.getByTestId('restore-diff')).toBeVisible();
  return { tabA, tabB };
};

const otherTabEdits: [string, (tab: Page) => Promise<void>][] = [
  ['adds a case to the order (through the UI)', async tab => {
    await tab.getByPlaceholder(/Search all products/).fill('Pepsi');
    await visible(tab).button(/Add 1 case/).click();
  }],
  ['changes a stock count (through the product screen)', async tab => {
    await tab.locator('main img').filter({ visible: true }).first().click();
    await tab.locator('#currentStock').fill('4');
    await tab.waitForTimeout(800); // the stock field saves 500 ms after typing stops
  }],
  ['saves a new wholesale price', async tab => {
    // Same effect as tab B saving an edited product: the stored price changes.
    await tab.evaluate(() => {
      const products = JSON.parse(localStorage.getItem('inventory_products')!);
      products[0].costPrice = 41.5;
      localStorage.setItem('inventory_products', JSON.stringify(products));
    });
  }],
];

for (const [label, edit] of otherTabEdits) {
  test(`another tab ${label} after the preview: the restore is refused and nothing changes`, async ({ context }) => {
    const { tabA, tabB } = await twoTabs(context);
    const reviewed = deliData(await dumpStorage(tabA));
    await edit(tabB);
    const edited = await dumpStorage(tabA);
    expect(deliData(edited)).not.toEqual(reviewed); // tab B's change really was saved

    await tabA.getByLabel(/I understand this replaces/).check();
    await visible(tabA).button('Restore Backup').click();
    await expect(tabA.getByText(/changed after you reviewed the comparison/)).toBeVisible();

    // Nothing was written, tab B's change survives, and the old preview is gone.
    expect(await dumpStorage(tabA)).toEqual(edited);
    await expect(tabA.getByTestId('restore-analysis')).toHaveCount(0);
    await expect(tabA.getByRole('button', { name: 'Restore Backup' })).toHaveCount(0);

    // Checking again shows the updated comparison; confirming it restores the backup.
    await visible(tabA).button('Check Backup').click();
    await expect(tabA.getByTestId('restore-diff')).toBeVisible();
    await confirmRestore(tabA);
    await expect(tabA.getByText('Restore complete.')).toBeVisible();
    const restored = await dumpStorage(tabA);
    expect(deliData(restored)).toEqual(BACKUP_DATA);
    expect(restored.other_app_auth).toBe('other-app');
  });
}

test('another app changing its own data after the preview does not block the restore', async ({ context }) => {
  const { tabA, tabB } = await twoTabs(context);
  await tabB.evaluate(() => localStorage.setItem('other_app_auth', 'rotated'));
  await confirmRestore(tabA);
  await expect(tabA.getByText('Restore complete.')).toBeVisible();
  const restored = await dumpStorage(tabA);
  expect(deliData(restored)).toEqual(BACKUP_DATA);
  expect(restored.other_app_auth).toBe('rotated');
});

test('an unchanged preview restores successfully', async ({ context }) => {
  const { tabA } = await twoTabs(context);
  await confirmRestore(tabA);
  await expect(tabA.getByText('Restore complete.')).toBeVisible();
  expect(deliData(await dumpStorage(tabA))).toEqual(BACKUP_DATA);
});
