// The Counter screen (C2.2b): opt-in, remembered on the phone, never in backups; one-tap ordering
// on the one saved order; Boar's Head item lines; search; Orders, Catalog and the menu; and the
// same phone-layout guarantees as Classic View.
import { Page, expect, test } from '@playwright/test';
import { REAL, dumpStorage, exportViaUi, open, seed } from './helpers';
import { expectTargets, openPhone, overflowing, systemBars } from './layout';

const UI_MODE_KEY = 'deliordernyc_sys_uiMode';
const COUNTER = { [UI_MODE_KEY]: 'counter' };
const order = async (page: Page) => JSON.parse((await dumpStorage(page)).inventory_currentOrder).items as { productId: string; quantity: number; unit?: string }[];
const row = (page: Page, text: string) => page.getByTestId('counter-row').filter({ hasText: text }).first();

test.describe('opt-in, remembered, and Classic View always reachable', () => {
  test('a fresh phone opens Classic View; nothing about the screen style is stored', async ({ page }) => {
    await seed(page, REAL);
    await expect(page.getByTestId('counter-screen')).toHaveCount(0);
    await expect(page.getByPlaceholder(/Search all products/)).toBeVisible();
    expect((await dumpStorage(page))[UI_MODE_KEY]).toBeUndefined();
  });

  test('choosing Counter in Manage opens it, and the app opens there next time', async ({ page }) => {
    await seed(page, REAL);
    await open(page, '/manage');
    await page.getByTestId('screen-style-panel').getByRole('button', { name: 'Counter (new)' }).click();
    await expect(page).toHaveURL(/#\/counter$/);
    await expect(page.getByTestId('counter-screen')).toBeVisible();
    expect((await dumpStorage(page))[UI_MODE_KEY]).toBe('counter');

    await page.goto('/#/');
    await page.reload();
    await expect(page).toHaveURL(/#\/counter$/);
    await expect(page.getByTestId('counter-screen')).toBeVisible();
  });

  test('the menu switches back to Classic View, which then stays', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await expect(page.getByTestId('counter-screen')).toBeVisible();
    await page.getByTestId('counter-menu-button').click();
    await page.getByTestId('switch-to-classic').click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByPlaceholder(/Search all products/)).toBeVisible();
    expect((await dumpStorage(page))[UI_MODE_KEY]).toBe('classic');
    await page.reload();
    await expect(page.getByTestId('counter-screen')).toHaveCount(0);
  });

  test('the screen style is never in a backup, and data is identical in both screens', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    const before = await dumpStorage(page);
    const exported = JSON.parse(await exportViaUi(page));
    expect(Object.keys(exported.raw)).not.toContain(UI_MODE_KEY);
    for (const key of Object.keys(REAL)) expect(exported.raw[key]).toBe(REAL[key]);
    // Opening the Counter screen wrote nothing but what was already there.
    const { [UI_MODE_KEY]: mode, ...rest } = before;
    expect(mode).toBe('counter');
    expect(rest).toEqual(REAL);
  });

  test('shelf-tag links still open the product in Classic View', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER }, '/product/az_rx_fruitpunch_slim11_5');
    await expect(page.getByRole('heading', { name: 'Product Details' })).toBeVisible();
  });
});

test.describe('one-tap ordering on the one saved order', () => {
  test('+ adds a case line, + again adds one more, − twice removes it; Orders shows the badge', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    const lowCarb = row(page, 'Caution Low-Carb');
    await lowCarb.getByRole('button', { name: /^Add one/ }).click();
    expect((await order(page)).find(i => i.productId === 'az_rx_lowcarb_slim11_5')).toEqual({ productId: 'az_rx_lowcarb_slim11_5', quantity: 1 });
    await lowCarb.getByRole('button', { name: /^Add one/ }).click();
    expect((await order(page)).find(i => i.productId === 'az_rx_lowcarb_slim11_5')?.quantity).toBe(2);
    await expect(page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ })).toContainText('3');
    await expect(page.getByTestId('counter-capsules').getByRole('button', { name: /Arizona/ })).toContainText('3');

    await lowCarb.getByRole('button', { name: /^Remove one/ }).click();
    await lowCarb.getByRole('button', { name: /^Remove one/ }).click();
    expect((await order(page)).some(i => i.productId === 'az_rx_lowcarb_slim11_5')).toBe(false);
    expect(await order(page)).toEqual(JSON.parse(REAL.inventory_currentOrder).items); // the Arizona order is untouched

    await page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ }).click();
    await expect(page.getByTestId('order-total')).toContainText('$77.98');
  });

  test("Boar's Head: MEATS then CHEESES, item lines, no stock or prices", async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await page.getByTestId('counter-capsules').getByRole('button', { name: "Boar's Head" }).click();
    const groups = page.getByTestId('counter-group').locator('h3');
    await expect(groups).toHaveText(['Meats', 'Cheeses']);
    await expect(page.getByTestId('stock-label')).toHaveCount(0);
    await page.getByRole('checkbox', { name: /Provolone Cheese/ }).click();
    expect((await order(page)).find(i => i.productId === 'bh_provolone')).toEqual({ productId: 'bh_provolone', quantity: 1, unit: 'item' });
    await page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ }).click();
    await expect(page.getByTestId('order-line').filter({ hasText: 'Provolone' })).toContainText('1 item(s)');
  });

  test('tapping a product opens its sheet with the full name and verified stock counting', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await row(page, 'Caution Extreme Fruit Punch').getByRole('button', { name: /^Details/ }).click();
    const sheet = page.getByTestId('product-sheet');
    await expect(sheet.getByRole('heading', { name: 'Arizona RX Energy' })).toBeVisible();
    await expect(sheet).toContainText('Caution Extreme Fruit Punch');
    await sheet.getByRole('button', { name: 'Count stock' }).click();
    await expect(page.getByTestId('count-sheet')).toBeVisible();
  });

  test('large groups start closed and open with one tap', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    const tallBoy = page.getByTestId('counter-group').filter({ hasText: '20 oz. Tall Boy' }).getByRole('button', { expanded: false });
    await expect(tallBoy).toBeVisible();
    await tallBoy.click();
    await expect(page.getByTestId('counter-group').filter({ hasText: '20 oz. Tall Boy' }).getByTestId('counter-row')).toHaveCount(17);
  });

  test('search finds products from every supplier; closing it returns to the supplier', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await page.getByRole('button', { name: 'Search products' }).click();
    await page.getByRole('searchbox', { name: 'Search products' }).fill('provolone');
    await expect(page.getByTestId('counter-row')).toHaveCount(1);
    await expect(page.getByTestId('counter-group').locator('h3')).toHaveText(["Boar's Head"]);
    await page.getByRole('button', { name: 'Close search' }).click();
    await expect(page.getByTestId('counter-capsules')).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);
  });
});

test.describe('Orders, Catalog and the menu', () => {
  test('Catalog has the products and suppliers; Settings has backup and restore', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await page.getByTestId('counter-nav').getByRole('link', { name: /Catalog/ }).click();
    await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Manage Suppliers' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Backup & Export' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Add product' }).click();
    await expect(page.getByRole('heading', { name: 'New Product' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByTestId('counter-menu-button').click();
    await page.getByTestId('counter-drawer').getByRole('button', { name: 'Backup & Restore' }).click();
    await expect(page).toHaveURL(/#\/counter\/settings$/);
    await expect(page.getByRole('heading', { name: 'Backup & Export' })).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Restore from Backup' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Manage Products' })).toHaveCount(0);
  });

  test('the menu changes language and dark mode, and closes with Escape', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER, theme: 'light' });
    await page.getByTestId('counter-menu-button').click();
    const drawer = page.getByTestId('counter-drawer');
    await drawer.getByRole('switch', { name: /Dark mode/ }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await drawer.getByRole('button', { name: 'Español' }).click();
    await expect(page.getByTestId('counter-nav')).toContainText('Mostrador');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });
});

test.describe('Counter phone layout', () => {
  for (const width of [360, 412]) {
    for (const text of [100, 130, 160]) {
      test(`${width}px, text ${text}%: every Counter place fits and clears the system bars`, async ({ browser }) => {
        const phone = await openPhone(browser, { width, text, storage: COUNTER }, '/counter');
        const { page } = phone;
        for (const path of ['/counter', '/counter/orders', '/counter/catalog', '/counter/settings']) {
          await page.goto(`/#${path}`);
          await expect(page.getByTestId('counter-screen')).toBeVisible();
          await page.waitForTimeout(500);
          expect(await overflowing(page), path).toEqual([]);
          const bars = await systemBars(page);
          expect(bars.headerOk, `${path}: top bar under the status bar`).toBe(true);
          expect(bars.navOk, `${path}: navigation under the gesture bar`).toBe(true);
        }
        await page.goto('/#/counter');
        await page.getByTestId('counter-menu-button').click();
        await page.waitForTimeout(400);
        expect(await overflowing(page), 'menu').toEqual([]);
        expect(phone.errors).toEqual([]);
        await phone.close();
      });
    }
  }

  test('Arabic: the menu opens from the right and nothing overflows', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 360, lang: 'ar', storage: COUNTER }, '/counter');
    const { page } = phone;
    expect(await overflowing(page)).toEqual([]);
    await page.getByTestId('counter-menu-button').click();
    await page.waitForTimeout(500);
    const box = (await page.getByTestId('counter-drawer').boundingBox())!;
    expect(Math.round(box.x + box.width)).toBe(360);
    await phone.close();
  });

  test('touch targets: top bar, suppliers, groups, rows, navigation and menu are at least 44x44', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 360, storage: COUNTER }, '/counter');
    const { page } = phone;
    await expectTargets(page, '[data-testid="counter-screen"] header button');
    await expectTargets(page, '[data-testid="counter-capsules"] button');
    await expectTargets(page, '[data-testid="counter-group"] > button');
    await expectTargets(page, '[data-testid="counter-row"] button');
    await expectTargets(page, '[data-testid="counter-nav"] a, [data-testid="counter-nav"] button');
    await page.getByTestId('counter-menu-button').click();
    await page.waitForTimeout(400);
    await expectTargets(page, '[data-testid="counter-drawer"] button');
    await phone.close();
  });
});
