// v0.1.3: visual-first rows, three-tab navigation, product photos, bulk CSV import, order
// history, the backup reminder, Needs attention, and migration from v0.1.2 data — plus the
// layout at every phone width and text size.
import { Page, expect, test } from '@playwright/test';
import { REAL, dumpStorage, pickSupplier, seed } from './helpers';
import { expectTargets, openPhone, overflowing } from './layout';

const row = (page: Page, text: string) => page.getByTestId('counter-row').filter({ hasText: text }).first();
const order = async (page: Page) => JSON.parse((await dumpStorage(page)).inventory_currentOrder).items as { productId: string; quantity: number }[];
const products = async (page: Page) => JSON.parse((await dumpStorage(page)).inventory_products) as Record<string, unknown>[];
const back = (page: Page) => page.evaluate(() => window.deliBack!());
// A tiny real PNG (1x1) to stand in for a photo from the phone.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test.describe('rows and navigation', () => {
  test('three tabs (no Menu tab), the menu stays in the header, and the modes read Order | Count', async ({ page }) => {
    await seed(page, REAL, '/counter');
    const nav = page.getByTestId('counter-nav');
    await expect(nav.getByRole('link')).toHaveText(['Counter', 'Orders', 'Catalog']);
    await expect(nav.getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('mode-order')).toHaveText('Order');
    await expect(page.getByTestId('mode-count')).toHaveText('Count');
    await page.getByTestId('counter-menu-button').click();
    await expect(page.getByTestId('counter-drawer')).toBeVisible();
  });

  test('pictures lead the row: about 84px Comfortable and 68px Compact at 412px; names 15px; colour tiles drawn offline', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await seed(page, REAL, '/counter');
    const thumb = row(page, 'Caution Extreme Fruit Punch').locator('.row-thumb');
    expect((await thumb.boundingBox())!.width).toBeCloseTo(84, 0);
    await expect(thumb).toHaveAttribute('data-testid', 'product-thumb-placeholder');
    // The catalog tile keeps its colour and caption, with no network request.
    expect(await thumb.evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    expect(await row(page, 'Caution Extreme Fruit Punch').getByTestId('row-name').evaluate(e => getComputedStyle(e).fontSize)).toBe('15px');
    await page.evaluate(() => (document.documentElement.dataset.density = 'compact'));
    expect((await thumb.boundingBox())!.width).toBeCloseTo(68, 0);
  });

  for (const width of [320, 360, 384, 412] as const) {
    for (const text of [100, 130, 160, 200] as const) {
      test(`${width}px, text ${text}%: rows fit, names are not crushed, controls stay 44px`, async ({ browser }) => {
        const phone = await openPhone(browser, { width, text }, '/counter');
        const { page } = phone;
        for (const mode of ['mode-count', 'mode-order'] as const) {
          await page.getByTestId(mode).click();
          await page.waitForTimeout(200);
          expect(await overflowing(page), mode).toEqual([]);
          const names = await page.getByTestId('row-name').evaluateAll(els => els.slice(0, 12).map(e => e.getBoundingClientRect().width));
          expect(Math.min(...names), `${mode}: narrowest name`).toBeGreaterThanOrEqual(110);
          await expectTargets(page, mode === 'mode-count' ? '[data-testid="row-count"]' : '[data-testid="counter-row"] button[aria-label^="Add one"]');
        }
        expect(phone.errors).toEqual([]);
        await phone.close();
      });
    }
  }

  for (const [lang, theme] of [['es', 'dark'], ['ar', 'light'], ['ar', 'dark']] as const) {
    test(`${lang}, ${theme}, 360px at 200%: Counter, Orders, Catalog, history and Settings fit`, async ({ browser }) => {
      const phone = await openPhone(browser, { width: 360, text: 200, lang, theme }, '/counter');
      const { page } = phone;
      for (const path of ['/counter', '/counter/orders', '/counter/orders/history', '/counter/catalog', '/counter/settings']) {
        await page.goto(`/#${path}`);
        await page.waitForTimeout(500);
        expect(await overflowing(page), path).toEqual([]);
      }
      expect(phone.errors).toEqual([]);
      await phone.close();
    });
  }
});

test.describe('product photos', () => {
  test('choose a photo: resized, kept in IndexedDB (not localStorage), shown in rows after a restart, counted in Settings', async ({ page }) => {
    await seed(page, REAL, '/counter/catalog');
    await page.getByRole('searchbox', { name: 'Search the catalog' }).fill('Caution Extreme Fruit Punch');
    await page.getByTestId('catalog-product').first().getByRole('button', { name: /^Edit/ }).first().click();
    await page.getByTestId('photo-choose-input').setInputFiles({ name: 'can.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('editor-picture').getByTestId('product-thumb-image')).toBeVisible();
    await page.getByRole('button', { name: 'Save Product' }).click();
    const saved = (await products(page)).find(p => p.id === 'az_rx_fp')!;
    expect(saved.imageUrl).toMatch(/^photo:p[\w-]+$/);
    // localStorage holds only the reference, never the picture.
    expect((await dumpStorage(page)).inventory_products).not.toContain('data:image');

    await page.reload();
    await page.goto('/#/counter');
    const image = row(page, 'Caution Extreme Fruit Punch').getByTestId('product-thumb-image');
    await expect(image).toBeVisible();
    expect(await image.getAttribute('src')).toMatch(/^data:image\/jpeg;base64,/);

    await page.goto('/#/counter/settings');
    await expect(page.getByTestId('photo-backup')).toContainText('Photos on this phone: 1');
    await expect(page.getByTestId('photos-not-in-backup')).toContainText('1 product photos are not inside this file');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export photos' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^deliordernyc-photos-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('importing a photo file adds missing photos and keeps ones already on the phone', async ({ page }) => {
    await seed(page, REAL, '/counter/settings');
    const file = JSON.stringify({ format: 'deliordernyc-photos', schemaVersion: 1, photos: [{ id: 'pimported1', dataUrl: `data:image/png;base64,${PNG.toString('base64')}`, createdAt: '2026-10-01T00:00:00Z' }] });
    const importFile = () => page.getByTestId('photo-import-input').setInputFiles({ name: 'photos.json', mimeType: 'application/json', buffer: Buffer.from(file) });
    await importFile();
    await expect(page.getByTestId('photo-backup')).toContainText('Photos added: 1. Already on this phone (kept): 0.');
    await importFile();
    await expect(page.getByTestId('photo-backup')).toContainText('Photos added: 0. Already on this phone (kept): 1.');
  });
});

test.describe('bulk import', () => {
  test('preview checks every row; only approved new rows are added; existing products are never changed', async ({ page }) => {
    await seed(page, REAL, '/counter/catalog');
    const before = await products(page);
    const existing = before.find(p => p.supplierId === 'sup4')! as { name: string; flavor: string; size: string };
    const csv = [
      'name,supplier,flavor,size,units_per_case,case_cost,upc',
      'Ruffles,Frito-Lay,Original,1 oz,64,38.50,028400000001',
      'Ruffles,Frito-Lay,Cheddar & Sour Cream,1 oz,64,38.50,028400000002',
      `${existing.name},Frito-Lay,${existing.flavor},${existing.size},1,1,`,
      'Ruffles,Frito-Lay,Original,1 oz,64,38.50,',
      'Fritos,Frito-Lay,Original,1 oz,64,,',
      'Mystery,Nobody,,,1,1,',
    ].join('\n');
    await page.getByTestId('open-import').click();
    await page.getByTestId('import-input').setInputFiles({ name: 'products.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    const preview = page.getByTestId('import-preview');
    await expect(preview).toContainText('Ready to add: 2');
    await expect(preview).toContainText('Already in catalog: 1');
    await expect(preview).toContainText('Repeated in file: 1');
    await expect(preview).toContainText('Need fixing: 2');
    await expect(preview).toContainText('no case cost');
    await expect(preview).toContainText('supplier not found (add it first)');
    // Untick one; only the other is added.
    await preview.getByRole('checkbox', { name: /Cheddar/ }).click();
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('catalog-notice')).toHaveText('Added 1 products. Nothing else was changed.');
    const after = await products(page);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toEqual([
      expect.objectContaining({ name: 'Ruffles', flavor: 'Original', supplierId: 'sup4', costPrice: 38.5, unitsPerCase: 64, upc: '028400000001', currentStockUnits: 0 }),
    ]);
  });

  test('Fruit Guy and Candy Guy say nothing was made up and point to Catalog', async ({ page }) => {
    await seed(page, REAL, '/counter');
    for (const name of ['Fruit Guy', 'Candy Guy']) {
      await pickSupplier(page, name);
      await expect(page.getByTestId('supplier-empty')).toContainText(`No products for ${name} yet`);
      await expect(page.getByTestId('supplier-empty')).toContainText('Nothing has been made up for this supplier');
    }
    await page.getByRole('button', { name: 'Open Catalog' }).click();
    await expect(page.getByTestId('counter-catalog')).toBeVisible();
  });
});

test.describe('order history', () => {
  test('save without clearing, no duplicates, mark sent, reuse after confirming, kept in backups', async ({ page }) => {
    await seed(page, REAL, '/counter/orders');
    const original = await order(page);
    expect(original.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: /^Share Arizona order/ }).click();
    await page.getByTestId('save-to-history').click();
    await expect(page.getByText('Saved to order history (prepared). The current order is unchanged.')).toBeVisible();
    await page.getByTestId('save-to-history').click();
    await expect(page.getByText(/This order is already in history \(saved today\)/)).toBeVisible();
    expect(await order(page)).toEqual(original);
    await back(page);

    const stored = JSON.parse((await dumpStorage(page)).inventory_orderHistory);
    expect(stored.schemaVersion).toBe(1);
    expect(stored.entries).toHaveLength(1);
    expect(stored.entries[0]).toMatchObject({ supplierName: 'Arizona', status: 'prepared' });

    await page.getByTestId('open-history').click();
    await expect(page.getByTestId('history-entry')).toHaveCount(1);
    await expect(page.getByTestId('history-entry')).toContainText('Prepared');
    await page.getByTestId('history-entry').click();
    await page.getByTestId('history-status').click();
    await expect(page.getByTestId('history-status')).toHaveText(/Mark as not sent/);
    await back(page);
    await expect(page.getByTestId('history-entry')).toContainText('Sent');

    // Reuse puts the saved lines back, only after confirming.
    await page.evaluate(() => localStorage.setItem('inventory_currentOrder', JSON.stringify({ items: [], createdAt: new Date().toISOString() })));
    await page.reload();
    await page.getByTestId('history-entry').click();
    await page.getByTestId('history-reuse').click();
    await page.getByTestId('confirm-sheet').getByRole('button', { name: 'Use as current order' }).click();
    await expect(page).toHaveURL(/#\/counter\/orders$/);
    expect((await order(page)).filter(l => original.some(o => o.productId === l.productId))).toHaveLength(stored.entries[0].lines.length);
  });
});

test.describe('backup reminder', () => {
  test('shows until a backup leaves the phone; Not now hides it; Settings says what is actually known', async ({ page }) => {
    await seed(page, REAL, '/counter');
    await expect(page.getByTestId('backup-reminder')).toContainText('Products, counts and orders live only on this phone');
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('counter-home')).toBeVisible();
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);

    await page.goto('/#/counter/settings');
    await expect(page.getByTestId('backup-status')).toHaveText('No backup has been saved from this phone yet.');
    await page.getByRole('button', { name: 'Export My Data' }).click();
    await expect(page.getByTestId('backup-status')).toContainText('A backup was created today but not saved, shared or copied afterwards.');
    await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download File' }).click()]);
    await expect(page.getByTestId('backup-status')).toContainText('Last backup download started: today (the browser does not confirm it finished).');
    // The log is device-only: never part of a backup.
    expect(Object.keys(await dumpStorage(page))).toContain('deliordernyc_sys_backupLog');
  });
});

test.describe('needs attention', () => {
  test('lists never-counted and low products from verified counts; Count these walks the keypad through them', async ({ page }) => {
    await seed(page, REAL, '/counter');
    await page.getByTestId('mode-count').click();
    const card = page.getByTestId('attention-card');
    await expect(card).toContainText('never counted');
    await card.click();
    const first = page.getByTestId('attention-item').first();
    await expect(first).toContainText('Never counted');
    const firstName = (await first.locator('p').first().textContent())!;
    await page.getByTestId('attention-count-all').click();
    const sheet = page.getByTestId('count-sheet');
    await expect(sheet).toContainText(firstName.split(' ').slice(-2).join(' '));
    await sheet.getByTestId('count-keypad').getByRole('button', { name: '1', exact: true }).click();
    await sheet.getByRole('button', { name: /Save & Next/ }).click();
    await expect(sheet).toBeVisible();
    await back(page);
    await card.click();
    await expect(page.getByTestId('attention-item').first()).toContainText(/Verified 1 · (out · )?reorder at \d+/);
  });
});

test.describe('migration from v0.1.2', () => {
  test('v0.1.2 data and preferences load unchanged; nothing is rewritten or removed', async ({ page }) => {
    const v012 = {
      ...REAL,
      deliordernyc_sys_prefs: JSON.stringify({ favorites: ['sup6'], recent: ['sup4'], lastSupplier: 'sup6', mode: 'count', density: 'compact' }),
      deliordernyc_sys_uiMode: 'counter',
    };
    await seed(page, v012, '/counter');
    await expect(page.getByTestId('mode-count')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.dataset.density)).toBe('compact');
    const after = await dumpStorage(page);
    for (const [key, value] of Object.entries(v012)) expect(after[key], key).toBe(value);
    expect(after).not.toHaveProperty('inventory_orderHistory');
  });
});
