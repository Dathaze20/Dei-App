// The Counter screen, the only interface since C2.3: phones upgrading from v0.1.1 (either screen
// style) open it with all their data; old addresses still work; supplier choice is remembered;
// one-tap ordering on the one saved order; Boar's Head item lines; search; the menu; phone layout.
import { Page, expect, test } from '@playwright/test';
import { REAL, dumpStorage, exportViaUi, open, pickSupplier, seed } from './helpers';
import { expectTargets, openPhone, overflowing, systemBars } from './layout';

const UI_MODE_KEY = 'deliordernyc_sys_uiMode';
const PREFS_KEY = 'deliordernyc_sys_prefs';
const COUNTER = { [UI_MODE_KEY]: 'counter' };
const order = async (page: Page) => JSON.parse((await dumpStorage(page)).inventory_currentOrder).items as { productId: string; quantity: number; unit?: string }[];
const row = (page: Page, text: string) => page.getByTestId('counter-row').filter({ hasText: text }).first();

test.describe('one interface: upgrading from v0.1.1 and older addresses', () => {
  for (const [label, extra] of [
    ['a phone that used Classic View', { [UI_MODE_KEY]: 'classic' }],
    ['a phone that used the Counter screen', COUNTER],
    ['a phone that never chose', {}],
  ] as const) {
    test(`${label} opens Counter with all its data, and nothing is rewritten`, async ({ page }) => {
      await seed(page, { ...REAL, ...extra });
      await expect(page).toHaveURL(/#\/counter$/);
      await expect(page.getByTestId('counter-screen')).toBeVisible();
      await expect(page.getByTestId('current-supplier')).toContainText('Arizona');
      await expect(page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ })).toContainText('2');
      // Opening the app wrote nothing over the saved data; the old screen-style key is left as it was.
      expect(await dumpStorage(page)).toEqual({ ...REAL, ...extra });
      await expect(page.getByTestId('screen-style-panel')).toHaveCount(0);
      await page.getByTestId('counter-menu-button').click();
      await expect(page.getByTestId('switch-to-classic')).toHaveCount(0);
    });
  }

  test('old addresses lead to their Counter places', async ({ page }) => {
    await seed(page, REAL, '/order');
    await expect(page).toHaveURL(/#\/counter\/orders$/);
    await open(page, '/manage');
    await expect(page).toHaveURL(/#\/counter\/settings$/);
    await open(page, '/history');
    await expect(page).toHaveURL(/#\/counter$/);
  });

  test('shelf-tag QR links (#/product/<id>) open that product, on its supplier', async ({ page }) => {
    await seed(page, REAL);
    // Opened from a scanned code: a fresh start of the app at that address.
    await page.goto('/?scan=1#/product/bh_provolone');
    await expect(page).toHaveURL(/#\/counter$/);
    await expect(page.getByTestId('product-sheet')).toContainText('Provolone Cheese');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('current-supplier')).toContainText("Boar's Head");
    // A product that no longer exists: Counter opens and says so.
    await page.goto('/?scan=2#/product/not_a_product');
    await expect(page.getByTestId('toast')).toHaveText('That product is no longer in the catalog.');
    await expect(page.getByTestId('product-sheet')).toHaveCount(0);
  });

  test('display preferences are never in a backup; the data exported is exactly the saved data', async ({ page }) => {
    await seed(page, REAL);
    await pickSupplier(page, 'Frito-Lay'); // writes the device-only preferences
    const exported = JSON.parse(await exportViaUi(page));
    expect(Object.keys(exported.raw).filter(key => key.startsWith('deliordernyc_sys_'))).toEqual([]);
    for (const key of Object.keys(REAL)) expect(exported.raw[key]).toBe(REAL[key]);
    expect(Object.keys(await dumpStorage(page))).toContain(PREFS_KEY);
  });
});

test.describe('supplier selector: no sideways scrolling, favourites, recent, remembered', () => {
  test('every supplier is in one list; picking one closes it; the choice survives a restart', async ({ page }) => {
    await seed(page, REAL);
    await page.getByTestId('current-supplier').click();
    await expect(page.getByTestId('supplier-grid-all').getByTestId('supplier-tile')).toHaveCount(JSON.parse(REAL.inventory_suppliers).length);
    await page.getByRole('searchbox', { name: 'Search suppliers' }).fill('red');
    await expect(page.getByTestId('supplier-grid-all').getByTestId('supplier-tile')).toHaveText(['Red Bull']);
    await page.getByTestId('supplier-grid-all').getByRole('button', { name: /^Red Bull/ }).click();
    await expect(page.getByTestId('supplier-grid')).toHaveCount(0);
    await expect(page.getByTestId('current-supplier')).toContainText('Red Bull');
    await page.reload();
    await expect(page.getByTestId('current-supplier')).toContainText('Red Bull');
    // The previous supplier is first under Recent in the supplier list (v0.1.6: one compact button).
    await page.getByTestId('current-supplier').click();
    await page.getByTestId('supplier-grid-recent').getByRole('button', { name: /^Arizona/ }).click();
    await expect(page.getByTestId('current-supplier')).toContainText('Arizona');
  });

  test('no pins or stars: the supplier list shows recent suppliers first; an old saved pin does nothing and is kept', async ({ page }) => {
    await seed(page, { ...REAL, deliordernyc_sys_prefs: JSON.stringify({ favorites: ['sup1'], recent: ['sup4'], lastSupplier: 'sup6', mode: 'order', density: 'comfortable' }) });
    await page.getByTestId('current-supplier').click();
    await expect(page.getByTestId('supplier-grid-recent').getByTestId('supplier-tile')).toHaveText(['Frito-Lay']);
    await expect(page.getByRole('button', { name: /^(Pin|Unpin) / })).toHaveCount(0);
    await expect(page.getByTestId('supplier-grid').getByRole('heading', { name: 'Pinned' })).toHaveCount(0);
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('deliordernyc_sys_prefs')))!).favorites).toEqual(['sup1']);
  });

  test('leaving Counter and coming back keeps the supplier, the chosen pill and the place in the list', async ({ page }) => {
    await seed(page, REAL);
    await page.getByTestId('filter-pill').filter({ hasText: '20 oz. Tall Boy' }).click();
    await expect(page.getByTestId('filter-pill').filter({ hasText: '20 oz. Tall Boy' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('counter-row')).toHaveCount(17);
    await row(page, 'Arnold Palmer').getByRole('button', { name: /^Add one/ }).click();
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(800);
    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBeGreaterThan(300);
    await page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ }).click();
    await expect(page.getByTestId('counter-orders')).toBeVisible();
    await page.getByTestId('counter-nav').getByRole('link', { name: /Counter/ }).click();
    await expect(page.getByTestId('filter-pill').filter({ hasText: '20 oz. Tall Boy' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 60);
  });

  test('pills come from the catalog: All shows every size with a heading; a pill shows only its products', async ({ page }) => {
    await seed(page, REAL);
    const pills = page.getByTestId('filter-pill');
    await expect(pills.first()).toHaveText(/^All/);
    await expect(pills).toHaveCount(1 + 11); // All + Arizona's 11 package sizes, from the catalog
    await expect(page.getByTestId('product-section')).toHaveCount(11);
    await pills.filter({ hasText: '12 oz. Can' }).click();
    await expect(page.getByTestId('counter-row')).toHaveCount(10);
    await expect(page.getByTestId('product-section').locator('h2')).toHaveCount(0);
  });

  test('two products that differ only at the end of the flavor are both readable (two lines, no cut-off)', async ({ page }) => {
    await seed(page, REAL);
    const names = page.getByTestId('row-name');
    await expect(names.filter({ hasText: 'Caution Extreme Fruit Punch' })).toHaveCount(1);
    for (const text of ['Caution Extreme Fruit Punch', 'Caution Extreme Performance']) {
      const el = names.filter({ hasText: text }).first();
      // Fully shown: nothing hidden by the two-line limit.
      expect(await el.evaluate(e => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
    }
  });
});

test.describe('one-tap ordering on the one saved order', () => {
  test('+ adds a case line (✓ 1), the adjuster adds one more, − twice removes it; Orders shows the badge', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    const lowCarb = row(page, 'Caution Low-Carb');
    await lowCarb.getByRole('button', { name: /^Add one/ }).click();
    expect((await order(page)).find(i => i.productId === 'az_rx_lowcarb_slim11_5')).toEqual({ productId: 'az_rx_lowcarb_slim11_5', quantity: 1 });
    await expect(lowCarb.getByTestId('row-selected')).toHaveText('1');
    await lowCarb.getByTestId('row-selected').click();
    const adjuster = page.getByTestId('quantity-sheet');
    await adjuster.getByTestId('quantity-plus').click();
    await expect(adjuster.getByTestId('quantity-value')).toHaveText('2');
    expect((await order(page)).find(i => i.productId === 'az_rx_lowcarb_slim11_5')?.quantity).toBe(2);
    await expect(page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ })).toContainText('3');
    await expect(page.getByTestId('current-supplier')).toContainText('3');

    await adjuster.getByTestId('quantity-minus').click();
    await adjuster.getByTestId('quantity-minus').click();
    await expect(adjuster).toHaveCount(0);
    expect((await order(page)).some(i => i.productId === 'az_rx_lowcarb_slim11_5')).toBe(false);
    expect(await order(page)).toEqual(JSON.parse(REAL.inventory_currentOrder).items); // the Arizona order is untouched

    await page.getByTestId('counter-nav').getByRole('link', { name: /Orders/ }).click();
    await expect(page.getByTestId('order-total')).toContainText('$77.98');
  });

  test("Boar's Head: MEATS then CHEESES, item lines, no stock or prices", async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await pickSupplier(page, "Boar's Head");
    await expect(page.getByTestId('filter-pill')).toHaveText([/^All/, /^Meats/, /^Cheeses/]);
    await expect(page.getByTestId('product-section').locator('h2')).toHaveText([/^Meats/, /^Cheeses/]);
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

  test('one tap on a pill shows that size; + adds a case without opening anything', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await page.getByTestId('filter-pill').filter({ hasText: '20 oz. Tall Boy' }).click();
    await expect(page.getByTestId('counter-row')).toHaveCount(17);
    const first = page.getByTestId('counter-row').first();
    const id = (await first.getAttribute('data-product'))!;
    await first.getByRole('button', { name: /^Add one/ }).click();
    expect((await order(page)).find(i => i.productId === id)).toEqual({ productId: id, quantity: 1 });
    await expect(page.getByTestId('product-sheet')).toHaveCount(0);
  });

  test('search finds products from every supplier; closing it returns to the supplier', async ({ page }) => {
    await seed(page, { ...REAL, ...COUNTER });
    await page.getByRole('button', { name: 'Search products' }).click();
    await page.getByRole('searchbox', { name: 'Search products' }).fill('provolone');
    await expect(page.getByTestId('counter-row')).toHaveCount(1);
    await expect(page.getByTestId('product-section').locator('h2')).toHaveText([/^Boar's Head/]);
    await page.getByRole('button', { name: 'Close search' }).click();
    await expect(page.getByTestId('counter-bar')).toBeVisible();
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
    await drawer.getByRole('button', { name: /Español/ }).click();
    await expect(page.getByTestId('counter-nav')).toContainText('Mostrador');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });
});

test.describe('Counter phone layout', () => {
  for (const width of [320, 360, 384, 412]) {
    for (const text of [100, 130, 160, 200]) {
      test(`${width}px, text ${text}%: every Counter place fits and clears the system bars`, async ({ browser }) => {
        test.setTimeout(120_000);
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
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('counter-drawer')).toHaveCount(0);
        await page.getByTestId('current-supplier').click();
        await page.waitForTimeout(400);
        expect(await overflowing(page), 'all suppliers').toEqual([]);
        // Supplier names are never cut: each tile's name fits on its lines.
        const cut = await page.getByTestId('supplier-tile').locator('span[dir="auto"]').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
        expect(cut, 'supplier names cut off').toEqual([]);
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
    await expectTargets(page, '[data-testid="counter-bar"] button');
    await expectTargets(page, '[data-testid="filter-pill"]');
    await expectTargets(page, '[data-testid="counter-row"] button');
    await expectTargets(page, '[data-testid="counter-nav"] a, [data-testid="counter-nav"] button');
    await page.getByTestId('counter-menu-button').click();
    await page.waitForTimeout(400);
    await expectTargets(page, '[data-testid="counter-drawer"] button');
    await phone.close();
  });
});
