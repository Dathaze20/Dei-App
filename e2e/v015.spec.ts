// v0.1.5: filter pills and picture cards, the quiet stock summary, shelf photos (observations with
// confirmed totals, Undo), barcodes read from photos (offline), and the upgrade from v0.1.4.
import { Page, expect, test } from '@playwright/test';
import { REAL, dumpStorage, seed } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const counts = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('inventory_stockCounts') ?? 'null'));
const products = async (page: Page) => JSON.parse((await dumpStorage(page)).inventory_products) as { id: string; flavor: string; upc?: string }[];

/** A real EAN-13 barcode drawn in the page, as PNG bytes. */
const ean13Png = async (page: Page, digits: string): Promise<Buffer> => {
  const dataUrl = await page.evaluate(code => {
    const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
    const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
    const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
    const d = code.split('').map(Number);
    let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += R[d[i]];
    bits += '101';
    const scale = 4;
    const canvas = document.createElement('canvas');
    canvas.width = (bits.length + 20) * scale;
    canvas.height = 220;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    [...bits].forEach((bit, i) => bit === '1' && ctx.fillRect((i + 10) * scale, 20, scale, 180));
    return canvas.toDataURL('image/png');
  }, digits);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};
/** EAN-13 check digit for 12 digits. */
const ean13 = (twelve: string) => {
  const sum = twelve.split('').reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0);
  return twelve + ((10 - (sum % 10)) % 10);
};

test.describe('Counter: pills and cards', () => {
  test('selecting Arizona › 11.5 oz shows its flavors side by side, distinguishable; + adds; tap count is 2', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await seed(page, REAL, '/counter');
    await page.getByTestId('filter-pill').filter({ hasText: '11.5 oz' }).click();
    const names = await page.getByTestId('row-name').allTextContents();
    expect(names).toEqual(['Caution Extreme Fruit Punch', 'Caution Extreme Performance', 'Caution Low-Carb']);
    const cards = await page.getByTestId('counter-row').evaluateAll(els => els.map(e => e.getBoundingClientRect()));
    expect(cards.every(c => c.bottom < 915)).toBe(true); // all three on the first screen
    await page.getByTestId('counter-row').filter({ hasText: 'Caution Low-Carb' }).getByRole('button', { name: /^Add one/ }).click();
    await expect(page.getByTestId('counter-row').filter({ hasText: 'Caution Low-Carb' }).getByTestId('row-selected')).toHaveText('1');
  });

  test('the stock summary is quiet: not counted is not urgent; in Order mode it appears only for verified low or out', async ({ page }) => {
    await seed(page, REAL, '/counter');
    await expect(page.getByTestId('attention-card')).toHaveCount(0); // Order mode, nothing verified low
    await page.getByTestId('mode-count').click();
    await expect(page.getByTestId('attention-card')).toHaveText(/Stock:\s*84 not counted\s*Review/);
    const id = (await products(page)).find(p => p.flavor === 'Caution Low-Carb')!.id;
    await page.evaluate(id => localStorage.setItem('inventory_stockCounts', JSON.stringify({ schemaVersion: 1, products: { [id]: { counts: [{ units: 2, countedAt: new Date().toISOString(), source: 'counter', unitsPerCaseAtCount: 12 }] } } })), id);
    await page.reload();
    await page.getByTestId('mode-order').click();
    await expect(page.getByTestId('attention-card')).toContainText('1 low');
  });
});

test.describe('shelf photos', () => {
  test('photos, a product you see, visible vs confirmed total, one confirmation saves verified counts, Undo takes them back', async ({ page }) => {
    await seed(page, REAL, '/counter');
    await page.getByTestId('mode-count').click();
    await page.getByTestId('open-shelf-check').click();
    // The explanations are behind one Help button (v0.1.6), so the photos keep the screen.
    await page.getByTestId('shelf-help').click();
    await expect(page.getByTestId('shelf-help-sheet')).toContainText('Nothing is counted automatically');
    await page.getByTestId('shelf-help-sheet').getByRole('button', { name: /Close/ }).click();
    await page.getByTestId('new-shelf-gallery-input').setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: PNG },
      { name: 'b.png', mimeType: 'image/png', buffer: PNG },
    ]);
    await expect(page.getByTestId('shelf-photos').locator('img')).toHaveCount(2);
    await expect(page.getByTestId('shelf-save')).toBeDisabled();

    await page.getByTestId('shelf-add-product').click();
    await page.getByTestId('product-picker').getByRole('searchbox').fill('Low-Carb');
    await page.getByTestId('picker-product').first().click();
    const item = page.getByTestId('shelf-item').first();
    await item.getByTestId('shelf-visible').fill('6');
    await expect(page.getByTestId('shelf-save')).toBeDisabled(); // a visible estimate is not a count
    await item.getByRole('button', { name: 'Same as visible' }).click();
    await item.getByTestId('shelf-total').fill('14');
    await page.getByTestId('shelf-save').click();
    await page.getByTestId('confirm-sheet').getByRole('button', { name: /Save 1 verified counts/ }).click();
    await expect(page.getByText('1 counts saved from the shelf check.')).toBeVisible();
    const id = (await products(page)).find(p => p.flavor === 'Caution Low-Carb')!.id;
    expect((await counts(page)).products[id].counts[0]).toMatchObject({ units: 14, source: 'photo-review' });

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await counts(page)).products[id]).toBeUndefined();
    // Nothing went into the main data or the backup besides the counts.
    expect(Object.keys(await dumpStorage(page)).filter(k => k.includes('shelf'))).toEqual([]);
  });

  test('a barcode in a shelf photo proposes the matching product (read on the phone); unknown codes are reported', async ({ page }) => {
    await seed(page, REAL, '/counter');
    const code = ean13('001234567890'); // UPC-A 012345678905 in EAN-13 form
    await page.evaluate(upc => {
      const list = JSON.parse(localStorage.getItem('inventory_products')!);
      const target = list.find((p: { flavor: string }) => p.flavor === 'Caution Extreme Fruit Punch');
      target.upc = upc;
      localStorage.setItem('inventory_products', JSON.stringify(list));
    }, '012345678905');
    await page.goto('/#/counter/shelf');
    await page.reload();
    await page.getByTestId('new-shelf-gallery-input').setInputFiles([
      { name: 'code.png', mimeType: 'image/png', buffer: await ean13Png(page, code) },
      { name: 'other.png', mimeType: 'image/png', buffer: await ean13Png(page, ean13('400638133393')) },
    ]);
    await expect(page.getByTestId('shelf-photos').locator('img')).toHaveCount(2);
    await page.getByTestId('shelf-read-barcodes').click();
    await expect(page.getByTestId('shelf-message')).toContainText('Barcodes found: 2. Matched to products: 1.', { timeout: 20_000 });
    await expect(page.getByTestId('shelf-message')).toContainText('4006381333931 is not in the catalog');
    await expect(page.getByTestId('shelf-item')).toHaveCount(1);
    await expect(page.getByTestId('shelf-item')).toContainText('Caution Extreme Fruit Punch');
    await expect(page.getByTestId('shelf-item')).toContainText('from barcode 012345678905') // ZXing reports the UPC-A form;
  });

  test('Scan barcode in search finds the product by its UPC', async ({ page }) => {
    await seed(page, REAL, '/counter');
    await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('inventory_products')!);
      list.find((p: { flavor: string }) => p.flavor === 'Caution Low-Carb').upc = '012345678905';
      localStorage.setItem('inventory_products', JSON.stringify(list));
    });
    await page.reload();
    await page.getByRole('button', { name: 'Search products' }).click();
    await page.getByTestId('scan-barcode-input').setInputFiles({ name: 'code.png', mimeType: 'image/png', buffer: await ean13Png(page, ean13('001234567890')) });
    await expect(page.getByRole('searchbox', { name: 'Search products' })).toHaveValue('012345678905', { timeout: 20_000 });
    await expect(page.getByTestId('counter-row')).toHaveCount(1);
    await expect(page.getByTestId('counter-row')).toContainText('Caution Low-Carb');
  });
});

test('a product\'s details say honestly what is known about how it moves', async ({ page }) => {
  await seed(page, REAL, '/counter');
  await page.getByTestId('counter-row').filter({ hasText: 'Caution Low-Carb' }).getByRole('button', { name: /^Details/ }).click();
  await expect(page.getByTestId('product-signals')).toContainText('Bestseller: not known (no sales records in the app)');
});

test('upgrade from v0.1.4: data, saved orders, preferences and working place load unchanged', async ({ page }) => {
  const v014 = {
    ...REAL,
    inventory_orderHistory: JSON.stringify({ schemaVersion: 1, entries: [] }),
    deliordernyc_sys_prefs: JSON.stringify({ favorites: ['sup4'], recent: ['sup1'], lastSupplier: 'sup6', mode: 'order', density: 'comfortable' }),
    deliordernyc_sys_place: JSON.stringify({ scroll: { sup6: 0 }, sections: { 'sup6:size:12 oz. Can': false } }),
    deliordernyc_sys_backupLog: JSON.stringify({ last: { saved: '2026-10-20T10:00:00.000Z' } }),
  };
  await seed(page, v014, '/counter');
  await expect(page.getByTestId('filter-pill').first()).toHaveAttribute('aria-pressed', 'true');
  const after = await dumpStorage(page);
  for (const [key, value] of Object.entries(v014)) expect(after[key], key).toBe(value);
});
