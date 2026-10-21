// v0.1.4: the one-handed photo walk, Add to order from Needs attention, the last saved order and
// choosing lines to reuse, and the working place surviving a restart.
import { Page, expect, test } from '@playwright/test';
import { REAL, dumpStorage, seed } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const products = async (page: Page) => JSON.parse((await dumpStorage(page)).inventory_products) as { id: string; flavor: string; imageUrl?: string }[];
const order = async (page: Page) => JSON.parse((await dumpStorage(page)).inventory_currentOrder).items as { productId: string; quantity: number }[];
const back = (page: Page) => page.evaluate(() => window.deliBack!());

test('Add photos: one product at a time; a saved photo moves on to the next product without one', async ({ page }) => {
  await seed(page, REAL, '/counter/catalog');
  await page.getByTestId('open-photo-walk').click();
  const walk = page.getByTestId('photo-walk');
  await expect(walk).toContainText('84 of 84 still without a photo');
  const first = (await walk.getByTestId('walk-product').locator('p').first().textContent())!;
  await walk.getByTestId('walk-choose-input').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await expect(walk).toContainText(`Photo saved: Arizona`);
  await expect(walk).toContainText('83 of 84 still without a photo');
  await expect(walk.getByTestId('walk-product').locator('p').first()).not.toHaveText(first);
  const second = (await walk.getByTestId('walk-product').locator('p').first().textContent())!;
  await walk.getByTestId('walk-skip').click();
  await expect(walk.getByTestId('walk-product').locator('p').first()).not.toHaveText(second);
  expect((await products(page)).filter(p => p.imageUrl?.startsWith('photo:'))).toHaveLength(1);
});

test('Add photo from a product sheet starts at that product', async ({ page }) => {
  await seed(page, REAL, '/counter');
  await page.getByTestId('counter-row').filter({ hasText: 'Caution Low-Carb' }).first().getByRole('button', { name: /^Details/ }).click();
  await page.getByTestId('sheet-add-photo').click();
  await expect(page.getByTestId('walk-product')).toContainText('Caution Low-Carb');
  await page.getByTestId('walk-choose-input').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('photo-walk')).toContainText('Photo saved: Arizona RX Energy Caution Low-Carb');
  expect((await products(page)).find(p => p.flavor === 'Caution Low-Carb')!.imageUrl).toMatch(/^photo:/);
});

test('Needs attention: a product at its reorder point can be put on the order from the list', async ({ page }) => {
  await seed(page, REAL, '/counter');
  const target = (await products(page)).find(p => p.flavor === 'Caution Low-Carb')!;
  await page.evaluate(id => {
    localStorage.setItem('inventory_stockCounts', JSON.stringify({ schemaVersion: 1, products: { [id]: { counts: [{ units: 0, countedAt: new Date().toISOString(), source: 'counter', unitsPerCaseAtCount: 12 }] } } }));
  }, target.id);
  await page.reload();
  await page.getByTestId('attention-card').click();
  const item = page.getByTestId('attention-item').first();
  await expect(item).toContainText('Verified 0 · out');
  const before = (await order(page)).find(l => l.productId === target.id)?.quantity ?? 0;
  await item.getByTestId('attention-add').click();
  await expect(page.getByText('Added to the order: Arizona RX Energy Caution Low-Carb')).toBeVisible();
  expect((await order(page)).find(l => l.productId === target.id)!.quantity).toBe(before + 1);
});

test('last saved order on the supplier, and reusing only the chosen lines', async ({ page }) => {
  await seed(page, REAL, '/counter/orders');
  await page.getByRole('button', { name: /^Share Arizona order/ }).click();
  await page.getByTestId('save-to-history').click();
  await back(page);
  await expect(page.getByTestId('last-saved-order')).toContainText(/Last saved order: .* · Prepared/);
  await page.getByTestId('last-saved-order').click();
  await expect(page.getByTestId('history-filter')).toHaveCount(0); // one supplier: no filter needed
  await page.getByTestId('history-entry').click();
  const checks = page.getByTestId('history-line-check');
  const lines = await checks.count();
  expect(lines).toBeGreaterThan(1);
  await checks.first().click();
  await expect(page.getByTestId('history-reuse')).toHaveText(`Use ${lines - 1} selected lines`);
  await page.evaluate(() => localStorage.setItem('inventory_currentOrder', JSON.stringify({ items: [], createdAt: new Date().toISOString() })));
  await page.getByTestId('history-reuse').click();
  // The order in memory still has lines until the reload below; reuse replaces Arizona's lines only.
  await page.getByTestId('confirm-sheet').getByRole('button', { name: /Use as current order/ }).click();
  await expect(page.getByText(`${lines - 1} lines put in the current order.`)).toBeVisible();
});

test('the working place (scroll, closed sections) survives the app being closed', async ({ page }) => {
  await seed(page, REAL, '/counter');
  await page.getByTestId('counter-group').first().locator('button').first().click(); // close the first section
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(900);
  const saved = await page.evaluate(() => Math.round(window.scrollY));
  expect(saved).toBeGreaterThan(300);
  await page.reload();
  await expect(page.getByTestId('counter-home')).toBeVisible();
  await page.waitForTimeout(400);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - saved)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId('counter-group').first().locator('button').first()).toHaveAttribute('aria-expanded', 'false');
  // Device-only: never part of the deli data.
  expect(await page.evaluate(() => localStorage.getItem('deliordernyc_sys_place'))).toContain('"scroll"');
});
