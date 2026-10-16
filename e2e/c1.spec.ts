import { Page, expect, test } from '@playwright/test';
import { REAL, checkBackup, collectErrors, dumpStorage, exportViaUi, open, seed, visible } from './helpers';

// C1: verified stock counting in Classic View, and Boar's Head as a plain item list.

const KEY = 'inventory_stockCounts';
const EMPTY_ORDER = JSON.stringify({ items: [], createdAt: '2026-10-15T08:00:00.000Z' });

const openProduct = async (page: Page, flavor: string) => {
  await page.getByPlaceholder(/Search all products|Buscar|ابحث/).fill(flavor);
  await page.getByText(flavor, { exact: true }).first().click();
  await expect(page.getByTestId('stock-count-panel')).toBeVisible();
};

const saveCount = async (page: Page, value: string) => {
  await page.locator('#stockCount').fill(value);
  await page.getByRole('button', { name: 'Save count' }).click();
};

const storedCounts = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY);

const shareText = async (page: Page) => {
  await open(page, '/order');
  await visible(page).button(/^(Share|Compartir|مشاركة)$/).click();
  return page.locator('textarea[readonly]').first().inputValue();
};

test.describe('verified stock counting (Classic View)', () => {
  test('a count is saved only with Save count, persists, keeps the last two, and never touches products', async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page, REAL);
    const productsBefore = (await dumpStorage(page)).inventory_products;
    const oldNumber = JSON.parse(productsBefore).find((p: { id: string }) => p.id === 'az_rx_fruitpunch_slim11_5').currentStockUnits;

    await openProduct(page, 'Caution Extreme Fruit Punch');
    await expect(page.getByTestId('stock-status')).toContainText(`Not counted yet. Old number: ${oldNumber} (not verified). No stock warning`);

    // Typing alone saves nothing (the old field saved on every keystroke).
    await page.locator('#stockCount').fill('18');
    await page.waitForTimeout(800);
    expect(await storedCounts(page)).toBeNull();

    await page.getByRole('button', { name: 'Save count' }).click();
    await expect(page.getByText('Count saved: 18 units.')).toBeVisible();
    await saveCount(page, '20');
    await expect(page.getByText('Count saved: 20 units.')).toBeVisible();
    await expect(page.getByTestId('last-counts').locator('li')).toHaveCount(2);

    const stored = await storedCounts(page);
    expect(stored.products.az_rx_fruitpunch_slim11_5.counts.map((c: { units: number }) => c.units)).toEqual([20, 18]);
    expect((await dumpStorage(page)).inventory_products).toBe(productsBefore);

    await open(page, '/');
    await page.getByPlaceholder(/Search all products/).fill('Caution Extreme Fruit Punch');
    await expect(page.getByTestId('stock-label').first()).toHaveText(/^20 in stock · counted /);
    expect(errors).toEqual([]);
  });

  test('blank, decimal and negative input are refused and never become 0', async ({ page }) => {
    await seed(page, REAL);
    await openProduct(page, 'Caution Extreme Fruit Punch');
    for (const value of ['', '2.5', '-3', 'ten']) {
      await saveCount(page, value);
      await expect(page.getByRole('alert').filter({ hasText: 'Enter a whole number of units (0 or more).' })).toBeVisible();
    }
    expect(await storedCounts(page)).toBeNull();
  });

  test('uncounted products show "Not counted · old: N" and no warning; counted 0 and low counts warn', async ({ page }) => {
    await seed(page, REAL);
    await page.getByPlaceholder(/Search all products/).fill('Arizona RX Energy');
    const labels = page.getByTestId('stock-label');
    await expect(labels.first()).toHaveText(/^Not counted · old: \d+$/);
    await expect(page.getByText(/OUT OF STOCK|Low Stock/)).toHaveCount(0);

    await openProduct(page, 'Caution Extreme Fruit Punch');
    await saveCount(page, '0');
    await expect(page.getByTestId('stock-status')).toHaveText('Out of stock (counted 0).');
    await saveCount(page, '3');
    await expect(page.getByTestId('stock-status')).toHaveText('Low stock (counted).');
    await saveCount(page, '40');
    await expect(page.getByTestId('stock-status')).toHaveText('Stock level is good (counted).');
  });

  test('the old number becomes a count only after confirming it was physically checked', async ({ page }) => {
    await seed(page, REAL);
    await openProduct(page, 'Caution Extreme Performance');
    const useOld = page.getByRole('button', { name: /^Use old number \((\d+)\)$/ });
    const old = (await useOld.textContent())!.match(/\((\d+)\)/)![1];
    await useOld.click();
    const confirm = page.getByRole('button', { name: `Save ${old} as the count` });
    await expect(confirm).toBeDisabled();
    expect(await storedCounts(page)).toBeNull();
    await page.getByLabel(`I physically counted this product and there are exactly ${old} units.`).check();
    await confirm.click();
    await expect(page.getByText(`Count saved: ${old} units.`)).toBeVisible();
    const stored = await storedCounts(page);
    expect(stored.products.az_rx_caution_slim11_5.counts[0]).toMatchObject({ units: Number(old), source: 'confirmed-legacy' });
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
    await openProduct(page, 'Caution Extreme Fruit Punch');
    await saveCount(page, '12');
    await expect(page.getByRole('alert').filter({ hasText: 'Count NOT saved. The phone did not save it. Try again.' })).toBeVisible();
    await expect(page.getByText('Count saved')).toHaveCount(0);
    expect(await storedCounts(page)).toBeNull();
  });

  test('two tabs: a count from a stale tab is refused, the other tab\'s count survives, and the user is told', async ({ context }) => {
    const tabA = await context.newPage();
    await seed(tabA, REAL);
    const tabB = await context.newPage();
    await tabB.goto('/#/');
    await expect(tabB.locator('#root header')).toBeVisible();

    await openProduct(tabA, 'Caution Extreme Fruit Punch');
    await saveCount(tabA, '18');
    await expect(tabA.getByText('Count saved: 18 units.')).toBeVisible();

    await openProduct(tabB, 'Caution Extreme Performance');
    await saveCount(tabB, '7');
    await expect(tabB.getByRole('alert').filter({ hasText: 'Count NOT saved.' })).toBeVisible();
    await expect(tabB.getByText(/verified stock counts changed in another tab or window/)).toBeVisible();

    const stored = await storedCounts(tabA);
    expect(Object.keys(stored.products)).toEqual(['az_rx_fruitpunch_slim11_5']);
    // After reloading, tab B sees tab A's count and can save its own.
    await tabB.reload();
    await openProduct(tabB, 'Caution Extreme Performance');
    await saveCount(tabB, '7');
    await expect(tabB.getByText('Count saved: 7 units.')).toBeVisible();
    expect(Object.keys((await storedCounts(tabB)).products).sort()).toEqual(['az_rx_caution_slim11_5', 'az_rx_fruitpunch_slim11_5']);
  });

  test('corrupted counts: a banner explains, nothing shows as counted, saving is off, and the text is kept', async ({ page }) => {
    const damaged = '{"schemaVersion":1,"products":{"az_rx_fruitpunch_slim11_5":{"counts":[{"units":"lots"}]}}';
    await seed(page, { ...REAL, [KEY]: damaged });
    await expect(page.getByRole('alert').filter({ hasText: 'verified stock counts' })).toBeVisible();
    await page.getByPlaceholder(/Search all products/).fill('Caution Extreme Fruit Punch');
    await expect(page.getByTestId('stock-label').first()).toHaveText("Stock count can't be read");
    await page.getByText('Caution Extreme Fruit Punch', { exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Save count' })).toBeDisabled();
    expect((await dumpStorage(page))[KEY]).toBe(damaged);
  });

  test('Export My Data includes the counts', async ({ page }) => {
    await seed(page, REAL);
    await openProduct(page, 'Caution Extreme Fruit Punch');
    await saveCount(page, '18');
    await expect(page.getByText('Count saved: 18 units.')).toBeVisible();
    const exported = JSON.parse(await exportViaUi(page));
    expect(JSON.parse(exported.raw[KEY]).products.az_rx_fruitpunch_slim11_5.counts[0].units).toBe(18);
    expect(exported.summary.verifiedCountProductCount).toBe(1);
  });

  test('restoring a backup without counts shows a prominent warning and needs its own acknowledgement; Undo brings the counts back', async ({ page }) => {
    await seed(page, REAL);
    await openProduct(page, 'Caution Extreme Fruit Punch');
    await saveCount(page, '18');
    await expect(page.getByText('Count saved: 18 units.')).toBeVisible();
    const counts = (await dumpStorage(page))[KEY];

    // A real backup made before stock counting existed.
    const preC1 = (await import('fs')).readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8');
    await checkBackup(page, preC1);
    await expect(page.getByTestId('restore-counts-loss')).toContainText('would remove or replace verified stock counts saved on this device for 1 product(s)');
    await expect(page.getByTestId('restore-counts-loss')).toContainText('1 counted product(s) have no count in the backup.');
    await expect(page.getByTestId('restore-counts-line')).toHaveText('Verified stock counts: 1 → 0 product(s)');
    await page.getByLabel(/I understand this replaces/).check();
    const restore = visible(page).button('Restore Backup');
    await expect(restore).toBeDisabled();
    await page.getByLabel('I understand that verified stock counts for 1 product(s) will be removed or replaced.').check();
    await expect(restore).toBeEnabled();
    await Promise.all([page.waitForEvent('load'), restore.click()]);
    await expect(page.locator('#root header')).toBeVisible();
    expect((await dumpStorage(page))[KEY]).toBeUndefined();

    await open(page, '/manage');
    await visible(page).button('Undo Last Restore').click();
    await Promise.all([page.waitForEvent('load'), visible(page).button('Yes, Continue').click()]);
    await expect(page.getByText('The last restore was undone.')).toBeVisible();
    expect((await dumpStorage(page))[KEY]).toBe(counts);
  });
});

test('product details and the share dialog open on screen, even from a long list (no scrolling needed)', async ({ page }) => {
  await seed(page, REAL);
  // Pick a product near the bottom of the long Arizona list.
  const row = page.getByText('Caution Extreme Fruit Punch').last();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await expect(page.getByRole('heading', { name: 'Product Details' })).toBeInViewport();
  await page.keyboard.press('Escape');
  await open(page, '/order');
  await visible(page).button('Share').click();
  await expect(page.getByRole('heading', { name: /Share Order/ })).toBeInViewport();
});

test('restoring an older backup that has an older count for the same product needs the acknowledgement', async ({ page }) => {
  await seed(page, REAL);
  await openProduct(page, 'Caution Extreme Fruit Punch');
  await saveCount(page, '18');
  await expect(page.getByText('Count saved: 18 units.')).toBeVisible();
  const backup = await exportViaUi(page); // has the count of 18

  await open(page, '/');
  await openProduct(page, 'Caution Extreme Fruit Punch');
  await saveCount(page, '25');
  await expect(page.getByText('Count saved: 25 units.')).toBeVisible();
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

  await open(page, '/manage');
  await visible(page).button('Undo Last Restore').click();
  await Promise.all([page.waitForEvent('load'), visible(page).button('Yes, Continue').click()]);
  await expect(page.getByText('The last restore was undone.')).toBeVisible();
  expect((await dumpStorage(page))[KEY]).toBe(newer);
});

test('deleting a counted product when its counts cannot be saved keeps the product and says why', async ({ page }) => {
  await seed(page, REAL);
  await page.getByPlaceholder(/Search all products/).fill('Monster Energy');
  await page.getByText('Original', { exact: true }).first().click();
  await saveCount(page, '7');
  await expect(page.getByText('Count saved: 7 units.')).toBeVisible();
  const before = await dumpStorage(page);
  // From the next page load on, saving the counts fails (as when storage is full).
  await page.addInitScript(key => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return setItem.call(this, k, v);
    };
  }, KEY);
  await open(page, '/manage');
  await expect(page.getByRole('heading', { name: 'Manage Products' })).toBeVisible();
  // The delete button of the "Monster Energy Original" card (the third action button on it).
  const card = page.locator('div.bg-white\\/75 > div, div').filter({ hasText: /^Monster EnergyOriginal/ }).first();
  await card.locator('button.text-red-600').first().click();
  await expect(page.getByTestId('delete-error')).toHaveText(
    '“Monster Energy Original” was NOT deleted. Its verified stock counts could not be saved before deleting. Try again. Nothing was changed.',
  );
  expect(await dumpStorage(page)).toEqual(before);
});

test.describe("Boar's Head: a plain weekly item list", () => {
  test('no stock line, no count prompt, no warnings, no case wording', async ({ page }) => {
    await seed(page, { ...REAL, inventory_currentOrder: EMPTY_ORDER });
    await visible(page).button("Boar's Head").click();
    await expect(page.getByText('OvenGold Turkey Breast').first()).toBeVisible();
    await expect(page.getByTestId('stock-label')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add 1 item(s) to order' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /case/ })).toHaveCount(0);

    await page.getByText('OvenGold Turkey Breast', { exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Product Details' })).toBeVisible();
    await expect(page.getByTestId('stock-count-panel')).toHaveCount(0);
    await expect(page.getByText(/Units per Case|Reorder|in stock|Not counted|case\(s\)/)).toHaveCount(0);
    await expect(page.getByText('item(s)')).toBeVisible();
  });

  test('a Boar\'s Head + Arizona order: items without prices, Arizona still $77.98, shown as a priced subtotal in the page, QR, Copy Text and SMS', async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page, REAL); // the real Arizona order (2 cases, $77.98)
    for (const name of ['OvenGold Turkey Breast', 'American Cheese']) {
      await page.getByPlaceholder(/Search all products/).fill(name);
      await visible(page).button('Add 1 item(s) to order').click();
    }
    const productsBefore = (await dumpStorage(page)).inventory_products;
    await open(page, '/order');
    const order = JSON.parse((await dumpStorage(page)).inventory_currentOrder).items;
    expect(order).toEqual([
      { productId: 'az_rx_fruitpunch_slim11_5', quantity: 1 },
      { productId: 'az_rx_caution_slim11_5', quantity: 1 },
      { productId: 'bh_turkey', quantity: 1, unit: 'item' },
      { productId: 'bh_american', quantity: 1, unit: 'item' },
    ]);
    await expect(page.getByText('1 item(s)')).toHaveCount(2);
    await expect(page.getByText('Not priced')).toBeVisible();
    await expect(page.getByTestId('order-total')).toContainText('Priced subtotal: $77.98');
    await expect(page.getByTestId('order-total')).toContainText('Items without a price are not included.');

    const text = await shareText(page);
    expect(text).toContain('› 1 OvenGold Turkey Breast (Roasted)\n');
    expect(text).toContain('› 1 American Cheese (White)\n');
    expect(text).toContain('*PRICED SUBTOTAL: $77.98*');
    const start = text.indexOf("BOAR'S HEAD");
    const boarsHead = text.slice(start, text.indexOf('----------------------------------------\n\n', start));
    expect(boarsHead).toContain('OvenGold');
    expect(boarsHead).not.toContain('$');
    expect(boarsHead).not.toMatch(/case/i);
    await expect(page.locator('svg').filter({ hasText: 'Deli Order Details' })).toBeVisible();
    const sms = await page.getByRole('link', { name: 'Send as Text' }).getAttribute('href');
    expect(decodeURIComponent(sms!.replace(/^sms:\?&body=/, ''))).toBe(text);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await visible(page).button('Copy Text').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    expect((await dumpStorage(page)).inventory_products).toBe(productsBefore);
    expect(errors).toEqual([]);
  });

  test('an order line saved before C1 keeps meaning cases until it is explicitly changed', async ({ page }) => {
    const legacy = JSON.stringify({ items: [{ productId: 'bh_turkey', quantity: 2 }], createdAt: '2026-10-01T08:00:00.000Z' });
    await seed(page, { ...REAL, inventory_currentOrder: legacy }, '/order');
    await expect(page.getByText('2 case(s) · earlier order line, in cases')).toBeVisible();
    expect(await shareText(page)).toContain('› 2 case(s) - OvenGold Turkey Breast (Roasted) [earlier order line, in cases]');
    expect((await dumpStorage(page)).inventory_currentOrder).toBe(legacy); // viewing changes nothing

    await open(page, '/order');
    page.once('dialog', dialog => dialog.accept());
    await visible(page).button('Change to items').click();
    await expect(page.getByText('2 item(s)')).toBeVisible();
    expect(JSON.parse((await dumpStorage(page)).inventory_currentOrder).items).toEqual([{ productId: 'bh_turkey', quantity: 2, unit: 'item' }]);
  });

  test('declining the change keeps the old case line exactly', async ({ page }) => {
    const legacy = JSON.stringify({ items: [{ productId: 'bh_turkey', quantity: 2 }], createdAt: '2026-10-01T08:00:00.000Z' });
    await seed(page, { ...REAL, inventory_currentOrder: legacy }, '/order');
    page.once('dialog', dialog => dialog.dismiss());
    await visible(page).button('Change to items').click();
    await expect(page.getByText('2 case(s) · earlier order line, in cases')).toBeVisible();
    expect((await dumpStorage(page)).inventory_currentOrder).toBe(legacy);
  });

  for (const [language, items, subtotal, notCounted] of [
    ['es', '1 artículo(s)', 'Subtotal con precio: $77.98', /^Sin contar · anterior: \d+$/],
    ['ar', '1 قطعة', 'المجموع الفرعي المسعّر: $77.98', /^لم يُعدّ · القديم: \d+$/],
  ] as const) {
    test(`translated (${language})`, async ({ page }) => {
      await seed(page, { ...REAL, language });
      await page.getByPlaceholder(/Buscar|ابحث/).fill('Caution Extreme Fruit Punch');
      await expect(page.getByTestId('stock-label').first()).toHaveText(notCounted);
      await page.getByPlaceholder(/Buscar|ابحث/).fill('OvenGold');
      await page.getByRole('button', { name: /artículo|قطعة/ }).filter({ visible: true }).first().click();
      await open(page, '/order');
      await expect(page.getByText(items, { exact: true })).toBeVisible();
      await expect(page.getByTestId('order-total')).toContainText(subtotal);
      if (language === 'ar') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    });
  }
});
