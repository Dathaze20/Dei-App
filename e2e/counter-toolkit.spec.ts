// The Counter toolkit (C2.2c/d): counting with the keypad and Save & Next (with every C1
// protection), the order tray and per-supplier sharing, the Orders tab, the Boar's Head list,
// the Catalog editor, Settings, the menu and Android Back — plus the phone-layout guarantees for
// every new sheet.
import { Page, expect, test } from '@playwright/test';
import { REAL, dumpStorage, seed } from './helpers';
import { SAFE_BOTTOM, expectTargets, openPhone, overflowing } from './layout';

const COUNTER = { deliordernyc_sys_uiMode: 'counter' };
const COUNTS = 'inventory_stockCounts';
const EMPTY_ORDER = JSON.stringify({ items: [], createdAt: '2026-10-15T08:00:00.000Z' });

const row = (page: Page, text: string) => page.getByTestId('counter-row').filter({ hasText: text }).first();
const order = async (page: Page) => JSON.parse((await dumpStorage(page)).inventory_currentOrder).items as { productId: string; quantity: number; unit?: string }[];
const counts = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), COUNTS);
const products = async (page: Page) => JSON.parse((await dumpStorage(page)).inventory_products) as Record<string, unknown>[];
const back = (page: Page) => page.evaluate(() => window.deliBack!());
const sheet = (page: Page) => page.getByTestId('count-sheet');
const key = (page: Page, digit: string) => sheet(page).getByTestId('count-keypad').getByRole('button', { name: digit, exact: true }).click();
const type = async (page: Page, digits: string) => {
  for (const digit of digits) await key(page, digit);
};
const startCounting = async (page: Page, flavor: string) => {
  await page.getByTestId('mode-count').click();
  await row(page, flavor).getByRole('button', { name: /^Count/ }).click();
  await expect(sheet(page)).toBeVisible();
};
/** From the next save on, the phone refuses to save verified counts (as when storage is full). */
const failCountSaves = (page: Page) =>
  page.evaluate(key => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return setItem.call(this, k, v);
    };
  }, COUNTS);

test.describe('counting with the keypad', () => {
  test('Save & Next saves the count (source: counter) and moves to the next product on screen; Save closes with a notice', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await startCounting(page, 'Caution Extreme Fruit Punch');
    await expect(sheet(page)).toContainText('How many cans on the shelf?');
    await expect(sheet(page).getByTestId('count-display')).toHaveText('Nothing typed');
    await type(page, '24');
    await expect(sheet(page).getByTestId('count-display')).toHaveText('24cans');
    await sheet(page).getByRole('button', { name: 'Save & Next' }).click();

    await expect(sheet(page).getByRole('heading', { name: 'Caution Extreme Performance' })).toBeVisible();
    await expect(sheet(page).getByTestId('count-message')).toHaveText('Saved: Arizona RX Energy Caution Extreme Fruit Punch, 24 cans.');
    await expect(sheet(page).getByTestId('count-display')).toHaveText('Nothing typed');
    const first = (await counts(page)).products.az_rx_fruitpunch_slim11_5.counts[0];
    expect(first).toMatchObject({ units: 24, source: 'counter', unitsPerCaseAtCount: 24 });

    await type(page, '7');
    await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId('counter-notice')).toContainText('Caution Extreme Performance, 7 cans.');
    await expect(row(page, 'Caution Extreme Performance').getByTestId('stock-label')).toContainText('7 in stock');
    expect(Object.keys((await counts(page)).products).sort()).toEqual(['az_rx_caution_slim11_5', 'az_rx_fruitpunch_slim11_5']);
  });

  test('Save & Next follows the rows on screen, across groups, and skips closed groups', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await page.getByTestId('mode-count').click();
    const visibleRows = await page.getByTestId('counter-row').evaluateAll(rows => rows.map(r => r.getAttribute('data-product')));
    const at = visibleRows.indexOf('az_rx_lowcarb_slim11_5');
    const next = visibleRows[at + 1]!;
    await row(page, 'Caution Low-Carb').getByRole('button', { name: /^Count/ }).click();
    await type(page, '3');
    await sheet(page).getByRole('button', { name: 'Save & Next' }).click();
    const nextFlavor = await page.locator(`[data-product="${next}"] [role=button] p`).first().textContent();
    await expect(sheet(page).getByRole('heading')).toHaveText(nextFlavor!);
    // Closed groups (20 oz. Tall Boy starts closed) are never counted by Save & Next.
    await expect(page.getByTestId('counter-group').filter({ hasText: '20 oz. Tall Boy' }).getByRole('button', { expanded: false })).toBeVisible();
    await expect(sheet(page)).toContainText(`${at + 2} of ${visibleRows.length}`);
  });

  test('nothing typed is never 0: Save and Save & Next refuse, nothing is stored, the sheet stays', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await startCounting(page, 'Caution Extreme Fruit Punch');
    await sheet(page).getByRole('button', { name: 'Save & Next' }).click();
    await expect(sheet(page).getByRole('alert')).toContainText('Count NOT saved. Enter a whole number of units (0 or more).');
    await expect(sheet(page).getByRole('heading', { name: 'Caution Extreme Fruit Punch' })).toBeVisible();
    await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sheet(page)).toBeVisible();
    expect(await counts(page)).toBeNull();
    // −1 on blank keeps it blank; +1 on blank gives 1; C clears.
    await sheet(page).getByRole('button', { name: 'One less' }).click();
    await expect(sheet(page).getByTestId('count-display')).toHaveText('Nothing typed');
    await sheet(page).getByRole('button', { name: 'One more' }).click();
    await expect(sheet(page).getByTestId('count-display')).toHaveText('1cans');
    await sheet(page).getByRole('button', { name: 'Clear the number' }).click();
    await expect(sheet(page).getByTestId('count-display')).toHaveText('Nothing typed');
  });

  test('a save the phone refuses says NOT saved, keeps what was typed, and does not move on', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await failCountSaves(page);
    await startCounting(page, 'Caution Extreme Fruit Punch');
    await type(page, '12');
    await sheet(page).getByRole('button', { name: 'Save & Next' }).click();
    await expect(sheet(page).getByRole('alert')).toHaveText('Count NOT saved. The phone did not save it. Try again.');
    await expect(sheet(page).getByRole('heading', { name: 'Caution Extreme Fruit Punch' })).toBeVisible();
    await expect(sheet(page).getByTestId('count-display')).toHaveText('12cans');
    expect(await counts(page)).toBeNull();
  });

  test('a count changed in another tab blocks saving here (no silent overwrite)', async ({ context }) => {
    const tabA = await context.newPage();
    await seed(tabA, { ...REAL, ...COUNTER });
    const tabB = await context.newPage();
    await tabB.goto('/#/counter');
    await expect(tabB.getByTestId('counter-screen')).toBeVisible();
    await startCounting(tabA, 'Caution Extreme Fruit Punch');
    await type(tabA, '18');
    await sheet(tabA).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(tabA.getByTestId('counter-notice')).toBeVisible();

    await startCounting(tabB, 'Caution Extreme Performance');
    await type(tabB, '7');
    await sheet(tabB).getByRole('button', { name: 'Save & Next' }).click();
    await expect(sheet(tabB).getByTestId('count-message')).toContainText('Count NOT saved.');
    await expect(sheet(tabB).getByRole('heading', { name: 'Caution Extreme Performance' })).toBeVisible();
    expect(Object.keys((await counts(tabA)).products)).toEqual(['az_rx_fruitpunch_slim11_5']);
  });

  test('the old number becomes a count only after confirming it was physically checked', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await startCounting(page, 'Caution Extreme Fruit Punch');
    await sheet(page).getByRole('button', { name: 'Use old number (16)' }).click();
    const confirm = sheet(page).getByRole('button', { name: 'Save 16 as the count' });
    await expect(confirm).toBeDisabled();
    await sheet(page).getByRole('checkbox').check();
    await confirm.click();
    await expect(sheet(page).getByTestId('count-message')).toContainText('16 cans');
    expect((await counts(page)).products.az_rx_fruitpunch_slim11_5.counts[0]).toMatchObject({ units: 16, source: 'confirmed-legacy' });
  });

  test("Boar's Head is never counted: no Count mode, no Count buttons, no Count in its sheet", async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await page.getByTestId('mode-count').click();
    await page.getByTestId('counter-capsules').getByRole('button', { name: "Boar's Head" }).click();
    await expect(page.getByTestId('mode-count')).toHaveCount(0);
    await expect(page.getByTestId('list-hint')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Count:/ })).toHaveCount(0);
    await row(page, 'Provolone Cheese').getByRole('button', { name: /^Details/ }).click();
    await expect(page.getByTestId('product-sheet')).toBeVisible();
    await expect(page.getByTestId('open-count')).toHaveCount(0);
    await expect(page.getByTestId('product-sheet')).not.toContainText('$');
  });
});

test.describe('ordering by supplier', () => {
  test('the tray shows this supplier only; Review changes quantities; Share has only this supplier (QR, Copy, Text)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await seed(page, { ...REAL, ...COUNTER });
    await page.getByTestId('counter-capsules').getByRole('button', { name: /Frito-Lay/ }).click();
    await row(page, 'Classic').getByRole('button', { name: /^Add one/ }).click();
    await expect(page.getByTestId('order-tray')).toContainText('Frito-Lay');
    await expect(page.getByTestId('order-tray')).toContainText('1 lines · 1 case(s)');

    await page.getByTestId('counter-capsules').getByRole('button', { name: /Arizona/ }).click();
    await expect(page.getByTestId('order-tray')).toContainText('Arizona');
    await page.getByTestId('order-tray').click();
    const tray = page.getByTestId('tray-sheet');
    await expect(tray.getByTestId('order-line')).toHaveCount(2);
    await tray.getByTestId('order-line').first().getByRole('button', { name: /^Add one/ }).click();
    await expect(tray.getByTestId('supplier-order-total')).toHaveText('$116.97');
    await tray.getByRole('button', { name: 'Share Arizona order' }).click();

    const share = page.getByTestId('share-sheet');
    await expect(share.getByTestId('share-qr')).toBeVisible();
    const text = await share.locator('textarea').inputValue();
    expect(text).toContain('ARIZONA');
    expect(text).not.toMatch(/Frito|Lays/i);
    await share.getByRole('button', { name: 'Copy Text' }).click();
    await expect(share.getByRole('button', { name: 'Copied!' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    expect(await share.getByRole('link', { name: 'Send as Text' }).getAttribute('href')).toBe(`sms:?&body=${encodeURIComponent(text)}`);
  });

  test('Orders: overview, per-supplier sections, Add more returns to that supplier, clearing asks first', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await page.getByTestId('counter-capsules').getByRole('button', { name: /Frito-Lay/ }).click();
    await row(page, 'BBQ').getByRole('button', { name: /^Add one/ }).click();
    await page.getByTestId('counter-capsules').getByRole('button', { name: /Arizona/ }).click();
    await page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ }).click();

    await expect(page.getByTestId('orders-overview')).toContainText('2 suppliers · 3 lines');
    await expect(page.getByTestId('order-total')).toContainText('$109.98');
    await expect(page.getByTestId('order-total')).toContainText('Estimated total');
    const frito = page.locator('[data-testid="supplier-order"][data-supplier="sup4"]');
    await frito.getByRole('button', { name: 'Add more' }).click();
    await expect(page).toHaveURL(/#\/counter$/);
    await expect(page.getByTestId('counter-capsules').getByRole('button', { name: /Frito-Lay/ })).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ }).click();
    await frito.getByRole('button', { name: 'Clear supplier' }).click();
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Cancel' }).click();
    expect(await order(page)).toHaveLength(3);
    await frito.getByRole('button', { name: 'Clear supplier' }).click();
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Clear supplier' }).click();
    expect(await order(page)).toEqual(JSON.parse(REAL.inventory_currentOrder).items);

    await page.getByRole('button', { name: 'Clear Order' }).click();
    await expect(page.getByTestId('confirm-sheet')).toContainText('Confirm Clear Order');
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Yes, Clear' }).click();
    await expect(page.getByTestId('orders-empty')).toBeVisible();
    expect(await order(page)).toEqual([]);
  });

  test("Boar's Head: tick, optional quantity, Create List reads aloud with no prices, cases or counts", async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER, inventory_currentOrder: EMPTY_ORDER });
    await page.getByTestId('counter-capsules').getByRole('button', { name: "Boar's Head" }).click();
    await page.getByRole('checkbox', { name: /Provolone Cheese/ }).click();
    await page.getByRole('checkbox', { name: /OvenGold Turkey/ }).click();
    await row(page, 'Provolone Cheese').getByRole('button', { name: /^Add one/ }).click();
    expect(await order(page)).toEqual([
      { productId: 'bh_provolone', quantity: 2, unit: 'item' },
      { productId: 'bh_turkey', quantity: 1, unit: 'item' },
    ]);
    await expect(page.getByTestId('order-tray')).toContainText('Create List');
    await page.getByTestId('order-tray').click();
    const list = page.getByTestId('list-sheet');
    await expect(list.getByTestId('read-aloud-list')).toHaveText(/MEATS.*1 OvenGold Turkey Breast \(Roasted\).*CHEESES.*2 Provolone Cheese \(Mild\)/);
    const text = await list.locator('textarea').inputValue();
    expect(text).not.toMatch(/\$|case|count/i);

    // On the Orders tab the list leads with the product, not the flavor ("Mild").
    await back(page);
    await page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ }).click();
    await expect(page.getByTestId('order-line-name')).toHaveText(['Provolone Cheese', 'OvenGold Turkey Breast']);
    await page.getByTestId('counter-nav').getByRole('link', { name: /Counter/ }).click();
    await page.getByTestId('order-tray').click();

    // Unticking takes it off the list completely.
    await back(page);
    await page.getByRole('checkbox', { name: /Provolone Cheese/ }).click();
    expect(await order(page)).toEqual([{ productId: 'bh_turkey', quantity: 1, unit: 'item' }]);
  });

  test("an older Boar's Head case line keeps meaning cases until it is changed, after confirming", async ({ page }) => {
    const older = JSON.stringify({ items: [{ productId: 'bh_ham', quantity: 2 }], createdAt: '2026-10-01T08:00:00.000Z' });
    await seed(page, { ...REAL, ...COUNTER, inventory_currentOrder: older });
    await page.getByTestId('counter-capsules').getByRole('button', { name: "Boar's Head" }).click();
    await expect(row(page, 'Deluxe Ham')).toContainText('+ 2 case(s) from an earlier line');
    await page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ }).click();
    await expect(page.getByTestId('order-line')).toContainText('2 case(s) · earlier order line, in cases');
    await page.getByTestId('order-line').getByRole('button', { name: 'Change to items' }).click();
    await expect(page.getByTestId('confirm-sheet')).toContainText('Change this line from 2 case(s) to 2 item(s)?');
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Cancel' }).click();
    expect(await order(page)).toEqual([{ productId: 'bh_ham', quantity: 2 }]);
    await page.getByTestId('order-line').getByRole('button', { name: 'Change to items' }).click();
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Change to items' }).click();
    expect(await order(page)).toEqual([{ productId: 'bh_ham', quantity: 2, unit: 'item' }]);
  });
});

test.describe('Catalog', () => {
  test('search, edit with labelled fields (other data kept), refuse bad numbers, add and delete after confirming', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await page.goto('/#/counter/catalog');
    await page.getByRole('searchbox', { name: 'Search the catalog' }).fill('mucho mango');
    await expect(page.getByTestId('catalog-product').first()).toBeVisible();
    await page.getByTestId('catalog-product').filter({ hasText: '23 oz. Big Can' }).getByRole('button', { name: 'Edit Arizona Mucho Mango' }).click();
    const editor = page.getByTestId('product-editor');
    const before = (await products(page)).find(p => p.id === 'az_mango_can23')!;

    await editor.getByLabel('Units per case').fill('0');
    await editor.getByRole('button', { name: 'Save Product' }).click();
    await expect(editor.getByTestId('editor-problem')).toHaveText('Units per case must be a whole number, 1 or more.');
    expect((await products(page)).find(p => p.id === 'az_mango_can23')).toEqual(before);

    await editor.getByLabel('Units per case').fill('24');
    await editor.getByLabel('Reorder at (units)').fill('9');
    await editor.getByRole('button', { name: 'Save Product' }).click();
    await expect(page.getByTestId('catalog-notice')).toHaveText('Saved: Arizona Mucho Mango');
    expect((await products(page)).find(p => p.id === 'az_mango_can23')).toEqual({ ...before, reorderThresholdUnits: 9 });

    await page.getByRole('button', { name: 'Add product' }).click();
    await editor.getByLabel(/Product Name/).fill('Test Seltzer');
    await editor.getByLabel(/Supplier/).selectOption({ label: 'PepsiCo' });
    await editor.getByLabel('Cost per case ($)').fill('12.50');
    await editor.getByRole('button', { name: 'Save Product' }).click();
    const added = (await products(page)).find(p => p.name === 'Test Seltzer')!;
    expect(added).toMatchObject({ supplierId: 'sup3', costPrice: 12.5, unitsPerCase: 1 });

    await page.getByRole('searchbox', { name: 'Search the catalog' }).fill('test seltzer');
    await page.getByRole('button', { name: 'Edit Test Seltzer' }).click();
    await editor.getByRole('button', { name: 'Delete product' }).click();
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Cancel' }).click();
    expect((await products(page)).some(p => p.name === 'Test Seltzer')).toBe(true);
    await editor.getByRole('button', { name: 'Delete product' }).click();
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Delete product' }).click();
    await expect(page.getByTestId('catalog-notice')).toHaveText('Deleted: Test Seltzer');
    expect((await products(page)).some(p => p.name === 'Test Seltzer')).toBe(false);
  });

  test('deleting a counted product when its counts cannot be kept safely: not deleted, and why', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await startCounting(page, 'Caution Extreme Fruit Punch');
    await type(page, '5');
    await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
    await failCountSaves(page);
    await page.getByTestId('counter-nav').getByRole('link', { name: /Catalog/ }).click();
    await page.getByRole('searchbox', { name: 'Search the catalog' }).fill('extreme fruit punch');
    await page.getByRole('button', { name: /^Edit Arizona RX Energy Caution Extreme Fruit Punch/ }).click();
    const before = await dumpStorage(page);
    await page.getByTestId('product-editor').getByRole('button', { name: 'Delete product' }).click();
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Delete product' }).click();
    await expect(page.getByTestId('editor-problem')).toContainText('was NOT deleted');
    expect(await dumpStorage(page)).toEqual(before);
  });

  test('Edit in Catalog from a product sheet opens that product; Add supplier has a labelled name', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await row(page, 'Caution Low-Carb').getByRole('button', { name: /^Details/ }).click();
    await page.getByRole('button', { name: 'Edit in Catalog' }).click();
    await expect(page).toHaveURL(/#\/counter\/catalog$/);
    await expect(page.getByTestId('product-editor')).toContainText('Caution Low-Carb');
    await page.getByTestId('product-editor').getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Add supplier' }).first().click();
    await page.getByTestId('supplier-editor').getByLabel('Supplier Name').fill('Bread Guy');
    await page.getByTestId('supplier-editor').getByRole('button', { name: 'Save Supplier' }).click();
    await expect(page.getByTestId('catalog-suppliers')).toContainText('Bread Guy');
  });
});

test.describe('Settings and menu', () => {
  test('store name, theme, language and screen style save and stay after a restart', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER, theme: 'light' });
    await page.goto('/#/counter/settings');
    await page.getByLabel('Deli Name').fill('Sunrise Deli');
    await page.getByRole('button', { name: 'Save Name' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Español' }).click();
    await expect(page.getByTestId('counter-nav')).toContainText('Pedidos');
    await page.reload();
    await expect(page.getByTestId('counter-screen')).toContainText('Sunrise Deli');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expect(page.getByTestId('counter-nav')).toContainText('Pedidos');
    expect(await dumpStorage(page)).toMatchObject({ inventory_deliName: 'Sunrise Deli', theme: 'dark', language: 'es' });

    await page.getByTestId('screen-style-panel').getByRole('button', { name: 'Vista Clásica' }).click();
    await expect(page).toHaveURL(/#\/$/);
    expect((await dumpStorage(page)).deliordernyc_sys_uiMode).toBe('classic');
  });

  test('every menu entry opens its Settings section; About says where the data is', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    for (const [label, id] of [
      ['Store profile', 'settings-store'],
      ['Appearance & language', 'settings-display'],
      ['Backup & Restore', 'settings-backup'],
      ['Restore & recovery', 'settings-restore'],
      ['App updates', 'settings-updates'],
      ['About this app', 'settings-about'],
    ]) {
      await page.getByTestId('counter-menu-button').click();
      await page.getByTestId('counter-drawer').getByRole('button', { name: label }).click();
      await expect(page).toHaveURL(/#\/counter\/settings$/);
      await expect(page.locator(`#${id}`), label).toBeInViewport();
    }
    await expect(page.getByTestId('app-info')).toContainText('Web version');
    await expect(page.locator('#settings-updates')).toContainText('Updates are installed from the Android app');
  });
});

test.describe('Android Back', () => {
  test('closes the newest sheet first, then the next, then returns to Counter, then leaves the app', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await row(page, 'Caution Extreme Fruit Punch').getByRole('button', { name: /^Details/ }).click();
    await page.getByTestId('open-count').click(); // the keypad replaces the product sheet
    await type(page, '9');
    expect(await back(page)).toBe(true);
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId('product-sheet')).toHaveCount(0);
    expect(await counts(page)).toBeNull(); // Back never saves (or deletes) anything

    await page.getByTestId('order-tray').click();
    await page.getByRole('button', { name: /^Share Arizona order/ }).click();
    expect(await back(page)).toBe(true);
    await expect(page.getByTestId('share-sheet')).toHaveCount(0);
    await expect(page.getByTestId('tray-sheet')).toBeVisible();
    expect(await back(page)).toBe(true);
    await expect(page.getByTestId('tray-sheet')).toHaveCount(0);

    await page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ }).click();
    await page.getByRole('button', { name: /^Share Arizona order/ }).click();
    expect(await back(page)).toBe(true);
    await expect(page.getByTestId('share-sheet')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/counter\/orders$/);
    expect(await back(page)).toBe(true);
    await expect(page).toHaveURL(/#\/counter$/);
    expect(await back(page)).toBe(false); // home, nothing open: Android may leave the app
  });

  test('closes the menu and the search first; never loops between tabs', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await page.getByTestId('counter-nav').getByRole('link', { name: /Catalog/ }).click();
    await page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ }).click();
    await page.getByTestId('counter-menu-button').click();
    expect(await back(page)).toBe(true);
    await expect(page.getByTestId('counter-drawer')).toHaveCount(0);
    expect(await back(page)).toBe(true);
    await expect(page).toHaveURL(/#\/counter$/);
    expect(await back(page)).toBe(false);

    await page.getByRole('button', { name: 'Search products' }).click();
    await page.getByRole('searchbox').fill('provolone');
    expect(await back(page)).toBe(true);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByTestId('counter-capsules')).toBeVisible();
  });

  test('Classic View: closes a dialog, then returns to Products, then leaves', async ({ page }) => {
    await seed(page, REAL, '/order');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    expect(await back(page)).toBe(true);
    await expect(page.getByRole('heading', { name: /Share Order/ })).toHaveCount(0);
    expect(await back(page)).toBe(true);
    await expect(page).toHaveURL(/#\/$/);
    expect(await back(page)).toBe(false);
  });
});

test.describe('new sheets on the phone', () => {
  for (const [width, text] of [[320, 100], [360, 160], [412, 130]] as const) {
    test(`${width}px, text ${text}%: sheets fit, actions stay above the gesture bar`, async ({ browser }) => {
      const phone = await openPhone(browser, { width, text, storage: COUNTER }, '/counter');
      const { page } = phone;
      const check = async (label: string, testId: string) => {
        await page.waitForTimeout(450);
        expect(await overflowing(page), label).toEqual([]);
        // The sheet's background reaches the screen edge; its buttons stay above the gesture bar.
        const footer = page.getByTestId(testId).getByTestId('sheet-footer');
        const bottoms = await footer.locator('button, a').evaluateAll(els => els.map(e => e.getBoundingClientRect().bottom));
        const lowest = Math.max(...(bottoms.length ? bottoms : [0]));
        expect(lowest, `${label}: actions above the gesture bar`).toBeLessThanOrEqual(860 - SAFE_BOTTOM + 0.5);
        const top = (await page.getByTestId(testId).boundingBox())!.y;
        expect(top, `${label}: under the status bar`).toBeGreaterThanOrEqual(32);
        await expectTargets(page, `[data-testid="${testId}"] button`);
      };
      await page.getByTestId('mode-count').click();
      await row(page, 'Caution Extreme Fruit Punch').getByRole('button', { name: /^Count/ }).click();
      await check('count', 'count-sheet');
      await back(page);
      await page.getByTestId('mode-order').click();
      await row(page, 'Caution Low-Carb').getByRole('button', { name: /^Details/ }).click();
      await check('product', 'product-sheet');
      await back(page);
      await page.getByTestId('order-tray').click();
      await check('tray', 'tray-sheet');
      await page.getByRole('button', { name: /^Share Arizona order/ }).click();
      await check('share', 'share-sheet');
      await back(page);
      await back(page);
      await page.goto('/#/counter/catalog');
      await page.getByRole('button', { name: 'Add product' }).click();
      await check('editor', 'product-editor');
      expect(phone.errors).toEqual([]);
      await phone.close();
    });
  }

  test('landscape (915x412): Counter, Orders, Catalog and Settings fit', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 915, height: 412, storage: COUNTER }, '/counter');
    for (const path of ['/counter', '/counter/orders', '/counter/catalog', '/counter/settings']) {
      await phone.page.goto(`/#${path}`);
      await phone.page.waitForTimeout(500);
      expect(await overflowing(phone.page), path).toEqual([]);
    }
    await phone.close();
  });

  test('Arabic at 360px: Orders, Catalog, Settings and the count sheet fit', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 360, lang: 'ar', storage: COUNTER }, '/counter');
    const { page } = phone;
    await page.getByTestId('mode-count').click();
    await page.getByTestId('counter-row').first().getByRole('button', { name: /^عدّ:/ }).click();
    await page.waitForTimeout(450);
    expect(await overflowing(page), 'count').toEqual([]);
    for (const path of ['/counter/orders', '/counter/catalog', '/counter/settings']) {
      await page.goto(`/#${path}`);
      await page.waitForTimeout(500);
      expect(await overflowing(page), path).toEqual([]);
    }
    await phone.close();
  });
});
