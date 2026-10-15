import { expect, test } from '@playwright/test';
import { readFileSync } from 'fs';
import { REAL, collectErrors, dumpStorage, exportViaUi, open, seed, visible } from './helpers';

const CASES = [
  { label: 'corrupted product records', key: 'inventory_products', damaged: JSON.stringify([{ id: 'real-1', name: 'Pepsi', costPrice: 'oops' }]) },
  { label: 'corrupted supplier records', key: 'inventory_suppliers', damaged: '[{"id":"sup1"}]' },
  { label: 'damaged order data', key: 'inventory_currentOrder', damaged: '{"items":[{"productId":"x"' },
];

for (const { label, key, damaged } of CASES) {
  test(`${label}: never overwritten, even while the app is used`, async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page, { ...REAL, [key]: damaged });
    await expect(page.getByText('Some saved data could not be read')).toBeVisible();
    // Use the app normally (this triggers the automatic saving).
    await page.getByPlaceholder(/Search all products/).fill('Pepsi');
    await visible(page).button(/Add 1 case/).click();
    await open(page, '/order');
    await open(page, '/manage');
    expect((await dumpStorage(page))[key]).toBe(damaged);
    expect(errors).toEqual([]);
  });
}

test('the damaged original is in Export My Data, and Start Fresh keeps it in a downloadable snapshot', async ({ page }) => {
  const damaged = REAL.inventory_products.slice(0, 4000); // cut off mid-way
  await seed(page, { ...REAL, inventory_products: damaged });
  const exported = JSON.parse(await exportViaUi(page));
  expect(exported.raw.inventory_products).toBe(damaged);

  await open(page, '/');
  await visible(page).button('Start Fresh with Sample Data').click();
  await Promise.all([page.waitForEvent('load'), visible(page).button('Yes, Continue').click()]);
  await expect(page.locator('#root header')).toBeVisible();
  await expect(page.getByText('Some saved data could not be read')).toHaveCount(0);
  const after = await dumpStorage(page);
  expect(JSON.parse(after.inventory_products)).toHaveLength(141);
  expect(after.inventory_suppliers).toBe(REAL.inventory_suppliers); // readable data untouched
  expect(after.inventory_currentOrder).toBe(REAL.inventory_currentOrder);

  await open(page, '/manage');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('snapshot-list').getByRole('button').first().click()]);
  const snapshot = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(snapshot.purpose).toBe('pre-start-fresh');
  expect(snapshot.raw.inventory_products).toBe(damaged);
});
