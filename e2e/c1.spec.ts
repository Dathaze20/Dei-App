import { Page, expect, test } from '@playwright/test';
import { REAL, checkBackup, collectErrors, dumpStorage, exportViaUi, keypadSave, open, openCount, searchAndAdd, seed, visible } from './helpers';

// C1 protections, on the Counter screen (the only interface since C2.3): verified stock counting,
// and Boar's Head as a plain item list. Same data rules as when these ran on Classic View.

const KEY = 'inventory_stockCounts';
const EMPTY_ORDER = JSON.stringify({ items: [], createdAt: '2026-10-15T08:00:00.000Z' });
const sheet = (page: Page) => page.getByTestId('count-sheet');
const storedCounts = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY);
/** The row's stock line, found with Counter search. */
const stockLabel = async (page: Page, text: string) => {
  const box = page.getByRole('searchbox');
  if (!(await box.count())) await page.getByRole('button', { name: /^(Search products|Buscar productos|البحث في المنتجات)$/ }).click();
  await page.getByRole('searchbox').fill(text);
  return page.getByTestId('counter-row').filter({ hasText: text }).first().getByTestId('stock-label');
};

test.describe('verified stock counting', () => {
  test('a count is saved only with Save, persists, keeps the last two, and never touches products', async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page, REAL);
    const productsBefore = (await dumpStorage(page)).inventory_products;
    const oldNumber = JSON.parse(productsBefore).find((p: { id: string }) => p.id === 'az_rx_fruitpunch_slim11_5').currentStockUnits;

    await openCount(page, 'Caution Extreme Fruit Punch');
    await expect(sheet(page).getByTestId('count-last')).toContainText(`Not counted yet. Old number: ${oldNumber} (not verified). No stock warning`);

    // Typing alone saves nothing.
    await sheet(page).getByTestId('count-keypad').getByRole('button', { name: '1', exact: true }).click();
    await sheet(page).getByTestId('count-keypad').getByRole('button', { name: '8', exact: true }).click();
    await page.waitForTimeout(800);
    expect(await storedCounts(page)).toBeNull();
    await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('toast')).toContainText('18 cans');

    await openCount(page, 'Caution Extreme Fruit Punch');
    await keypadSave(page, '20');
    await openCount(page, 'Caution Extreme Fruit Punch');
    await expect(sheet(page).getByTestId('count-last')).toContainText('Last count: 20 cans');
    await expect(sheet(page).getByTestId('count-last')).toContainText('Before that: 18');
    await page.keyboard.press('Escape');

    const stored = await storedCounts(page);
    expect(stored.products.az_rx_fruitpunch_slim11_5.counts.map((c: { units: number }) => c.units)).toEqual([20, 18]);
    expect((await dumpStorage(page)).inventory_products).toBe(productsBefore);

    await page.reload();
    await expect(await stockLabel(page, 'Caution Extreme Fruit Punch')).toHaveText(/^20 in stock · counted /);
    expect(errors).toEqual([]);
  });

  test('nothing typed is refused and never becomes 0; the keypad has no decimal point or minus sign', async ({ page }) => {
    await seed(page, REAL);
    await openCount(page, 'Caution Extreme Fruit Punch');
    await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sheet(page).getByRole('alert').filter({ hasText: 'Enter a whole number of units (0 or more).' })).toBeVisible();
    await expect(sheet(page).getByTestId('count-keypad').getByRole('button', { name: /^[.,-]$/ })).toHaveCount(0);
    // A hardware keyboard's "." and "-" are ignored too.
    await page.keyboard.type('2.5-');
    await expect(sheet(page).getByTestId('count-display')).toHaveText('25cans');
    await page.keyboard.press('Escape');
    expect(await storedCounts(page)).toBeNull();
  });

  test('uncounted products show "Not counted · old: N" with no warning; counted 0 and low counts warn', async ({ page }) => {
    await seed(page, REAL);
    const label = await stockLabel(page, 'Caution Extreme Fruit Punch');
    await expect(label).toHaveText(/^Not counted · old: \d+$/);
    await expect(label).toHaveAttribute('data-stock-state', 'unverified');

    await openCount(page, 'Caution Extreme Fruit Punch');
    await keypadSave(page, '0');
    await expect(label).toHaveText(/^0 in stock · counted /);
    await expect(label).toHaveClass(/text-red-600/);
    await openCount(page, 'Caution Extreme Fruit Punch');
    await keypadSave(page, '3');
    await expect(label).toHaveClass(/text-amber-600/);
    await openCount(page, 'Caution Extreme Fruit Punch');
    await keypadSave(page, '40');
    await expect(label).not.toHaveClass(/text-(red|amber)-600/);
  });

  test('a failed save says NOT saved and stores nothing', async ({ page }) => {
    await seed(page, REAL);
    await page.evaluate(key => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return setItem.call(this, k, v);
      };
    }, KEY);
    await openCount(page, 'Caution Extreme Fruit Punch');
    await keypadSave(page, '12');
    await expect(sheet(page).getByRole('alert').filter({ hasText: 'Count NOT saved. The phone did not save it. Try again.' })).toBeVisible();
    expect(await storedCounts(page)).toBeNull();
  });

  test('corrupted counts: a banner explains, nothing shows as counted, saving is off, and the text is kept', async ({ page }) => {
    const damaged = '{"schemaVersion":1,"products":{"az_rx_fruitpunch_slim11_5":{"counts":[{"units":"lots"}]}}';
    await seed(page, { ...REAL, [KEY]: damaged });
    await expect(page.getByRole('alert').filter({ hasText: 'verified stock counts' }).first()).toBeVisible();
    await expect(await stockLabel(page, 'Caution Extreme Fruit Punch')).toHaveText("Stock count can't be read");
    await openCount(page, 'Caution Extreme Fruit Punch');
    await expect(sheet(page).getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect((await dumpStorage(page))[KEY]).toBe(damaged);
  });

  test('Export My Data includes the counts', async ({ page }) => {
    await seed(page, REAL);
    await openCount(page, 'Caution Extreme Fruit Punch');
    await keypadSave(page, '18');
    const exported = JSON.parse(await exportViaUi(page));
    expect(JSON.parse(exported.raw[KEY]).products.az_rx_fruitpunch_slim11_5.counts[0].units).toBe(18);
    expect(exported.summary.verifiedCountProductCount).toBe(1);
  });

  test('restoring a backup without counts shows a prominent warning and needs its own acknowledgement; Undo brings the counts back', async ({ page }) => {
    await seed(page, REAL);
    await openCount(page, 'Caution Extreme Fruit Punch');
    await keypadSave(page, '18');
    await expect(page.getByTestId('toast')).toBeVisible();
    const counts = (await dumpStorage(page))[KEY];

    // A real backup made before stock counting existed.
    const preC1 = (await import('fs')).readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8');
    await checkBackup(page, preC1);
    await expect(page.getByTestId('restore-counts-loss')).toContainText('would remove or replace verified stock counts saved on this device for 1 product(s)');
    await expect(page.getByTestId('restore-counts-line')).toHaveText('Verified stock counts: 1 → 0 product(s)');
    await page.getByLabel(/I understand this replaces/).check();
    const restore = visible(page).button('Restore Backup');
    await expect(restore).toBeDisabled();
    await page.getByLabel('I understand that verified stock counts for 1 product(s) will be removed or replaced.').check();
    await expect(restore).toBeEnabled();
    await Promise.all([page.waitForEvent('load'), restore.click()]);
    await expect(page.locator('#root header')).toBeVisible();
    expect((await dumpStorage(page))[KEY]).toBeUndefined();

    await open(page, '/counter/settings');
    await visible(page).button('Undo Last Restore').click();
    await Promise.all([page.waitForEvent('load'), visible(page).button('Yes, Continue').click()]);
    await expect(page.getByText('The last restore was undone.')).toBeVisible();
    expect((await dumpStorage(page))[KEY]).toBe(counts);
  });
});

test('restoring an older backup that has an older count for the same product needs the acknowledgement', async ({ page }) => {
  await seed(page, REAL);
  await openCount(page, 'Caution Extreme Fruit Punch');
  await keypadSave(page, '18');
  const backup = await exportViaUi(page); // has the count of 18

  await open(page, '/counter');
  await openCount(page, 'Caution Extreme Fruit Punch');
  await keypadSave(page, '25');
  await expect(page.getByTestId('toast')).toContainText('25 cans');
  const newer = (await dumpStorage(page))[KEY];

  await checkBackup(page, backup);
  await expect(page.getByTestId('restore-counts-loss')).toContainText(
    '1 product(s) would get an older or different count from the backup instead of the latest one here.',
  );
  await page.getByLabel(/I understand this replaces/).check();
  const restore = visible(page).button('Restore Backup');
  await expect(restore).toBeDisabled();
  await page.getByLabel('I understand that verified stock counts for 1 product(s) will be removed or replaced.').check();
  await Promise.all([page.waitForEvent('load'), restore.click()]);
  await expect(page.locator('#root header')).toBeVisible();
  expect(JSON.parse((await dumpStorage(page))[KEY]).products.az_rx_fruitpunch_slim11_5.counts[0].units).toBe(18);

  await open(page, '/counter/settings');
  await visible(page).button('Undo Last Restore').click();
  await Promise.all([page.waitForEvent('load'), visible(page).button('Yes, Continue').click()]);
  await expect(page.getByText('The last restore was undone.')).toBeVisible();
  expect((await dumpStorage(page))[KEY]).toBe(newer);
});

test.describe("Boar's Head: a plain weekly item list", () => {
  test('no stock line, no count prompt, no warnings, no case wording', async ({ page }) => {
    await seed(page, { ...REAL, inventory_currentOrder: EMPTY_ORDER });
    await page.getByTestId('all-suppliers').click();
    await page.getByTestId('supplier-grid-all').getByRole('button', { name: /^Boar's Head/ }).click();
    await expect(page.getByText('OvenGold Turkey Breast').first()).toBeVisible();
    await expect(page.getByTestId('stock-label')).toHaveCount(0);
    await expect(page.getByTestId('mode-count')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /case/ })).toHaveCount(0);

    await page.getByTestId('counter-row').filter({ hasText: 'OvenGold Turkey Breast' }).getByRole('button', { name: /^Details/ }).click();
    const details = page.getByTestId('product-sheet');
    await expect(details).toBeVisible();
    await expect(page.getByTestId('open-count')).toHaveCount(0);
    await expect(details.getByText(/Units per case|Reorder|in stock|Not counted|case\(s\)|\$/)).toHaveCount(0);
  });

  test("a Boar's Head + Arizona order: items without prices, Arizona still $77.98, a priced subtotal on Orders, each supplier shared on its own", async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page, REAL); // the real Arizona order (2 cases, $77.98)
    for (const name of ['OvenGold Turkey Breast', 'American Cheese']) await searchAndAdd(page, name);
    const productsBefore = (await dumpStorage(page)).inventory_products;
    await open(page, '/counter/orders');
    expect(JSON.parse((await dumpStorage(page)).inventory_currentOrder).items).toEqual([
      { productId: 'az_rx_fruitpunch_slim11_5', quantity: 1 },
      { productId: 'az_rx_caution_slim11_5', quantity: 1 },
      { productId: 'bh_turkey', quantity: 1, unit: 'item' },
      { productId: 'bh_american', quantity: 1, unit: 'item' },
    ]);
    await expect(page.getByTestId('order-line').filter({ hasText: '1 item(s)' })).toHaveCount(2);
    await expect(page.getByTestId('order-total')).toContainText('Priced subtotal (estimate)$77.98');
    await expect(page.getByText('Items without a price are not included.')).toBeVisible();

    await page.getByRole('button', { name: 'Share Arizona order' }).click();
    const arizona = await page.getByTestId('share-sheet').locator('textarea').inputValue();
    expect(arizona).toContain('77.98');
    expect(arizona).not.toMatch(/OvenGold|American Cheese/);
    await page.keyboard.press('Escape');

    await page.locator('[data-testid="supplier-order"][data-supplier="sup1"]').getByRole('button', { name: 'Create List' }).click();
    const list = await page.getByTestId('list-sheet').locator('textarea').inputValue();
    expect(list).toContain('- 1 OvenGold Turkey Breast (Roasted)');
    expect(list).toContain('- 1 American Cheese (White)');
    expect(list).not.toMatch(/\$|case/i);
    expect((await dumpStorage(page)).inventory_products).toBe(productsBefore);
    expect(errors).toEqual([]);
  });

  test('an order line saved before C1 keeps meaning cases until it is explicitly changed', async ({ page }) => {
    const legacy = JSON.stringify({ items: [{ productId: 'bh_turkey', quantity: 2 }], createdAt: '2026-10-01T08:00:00.000Z' });
    await seed(page, { ...REAL, inventory_currentOrder: legacy }, '/order');
    await expect(page.getByText('2 case(s) · earlier order line, in cases')).toBeVisible();
    await page.getByRole('button', { name: 'Create List' }).click();
    expect(await page.getByTestId('list-sheet').locator('textarea').inputValue()).toContain('- 2 case(s) OvenGold Turkey Breast (Roasted) [earlier order line, in cases]');
    await page.keyboard.press('Escape');
    expect((await dumpStorage(page)).inventory_currentOrder).toBe(legacy); // viewing changes nothing
  });

  for (const [language, items, subtotal, notCounted] of [
    ['es', '1 artículo(s)', /Subtotal con precio \(estimado\)\$77\.98/, /^Sin contar · anterior: \d+$/],
    ['ar', '1 قطعة', /المجموع المسعّر \(تقديري\)\$77\.98/, /^لم يُعدّ · القديم: \d+$/],
  ] as const) {
    test(`translated (${language})`, async ({ page }) => {
      await seed(page, { ...REAL, language });
      await expect(await stockLabel(page, 'Caution Extreme Fruit Punch')).toHaveText(notCounted);
      await searchAndAdd(page, 'OvenGold');
      await open(page, '/counter/orders');
      await expect(page.getByTestId('order-line').filter({ hasText: items })).toHaveCount(1);
      await expect(page.getByTestId('order-total')).toContainText(subtotal);
      if (language === 'ar') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    });
  }
});
