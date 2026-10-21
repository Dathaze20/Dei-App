import { Page, expect } from '@playwright/test';
import { REAL } from './helpers';

/**
 * A fixed tour of the app's screens, shared by the class-coverage test (which checks that the
 * local Tailwind build styles every class the screens use) and the before/after visual
 * comparison (visual/). It only uses UI that exists on `main` too, so the same steps can
 * photograph the old build and the new one.
 */
export interface Screen {
  name: string;
  theme: 'light' | 'dark';
  language: 'en' | 'es' | 'ar';
  path: string;
  /** Interactions after the page has loaded. */
  prepare?: (page: Page) => Promise<void>;
  /** Stored data added on top of the real export. Older builds simply ignore keys they don't know. */
  data?: Record<string, string>;
  /** Uses UI that only exists since this milestone, so it cannot be photographed on older builds. */
  since?: 'c1';
}

// C1 data: two verified counts, and an order mixing Arizona cases with Boar's Head items.
const C1_COUNTS = JSON.stringify({
  schemaVersion: 1,
  products: {
    az_rx_fruitpunch_slim11_5: {
      counts: [
        { units: 18, countedAt: '2026-10-15T13:40:00.000Z', source: 'classic', unitsPerCaseAtCount: 24 },
        { units: 20, countedAt: '2026-10-12T11:05:00.000Z', source: 'classic', unitsPerCaseAtCount: 24 },
      ],
    },
    az_rx_caution_slim11_5: { counts: [{ units: 0, countedAt: '2026-10-15T13:41:00.000Z', source: 'classic', unitsPerCaseAtCount: 24 }] },
  },
});
const C1_ORDER = JSON.stringify({
  items: [
    { productId: 'az_rx_fruitpunch_slim11_5', quantity: 1 },
    { productId: 'az_rx_caution_slim11_5', quantity: 1 },
    { productId: 'bh_turkey', quantity: 1, unit: 'item' },
    { productId: 'bh_american', quantity: 1, unit: 'item' },
    { productId: 'bh_provolone', quantity: 1 },
  ],
  createdAt: '2026-10-15T08:00:00.000Z',
});
const c1Data = { inventory_stockCounts: C1_COUNTS, inventory_currentOrder: C1_ORDER };

// Since C2.3 the Counter screen is the only interface. These steps use Counter UI that exists on
// `main` too (main has the Counter screen at #/counter since C2.2b), so both builds can be photographed.
const row = (page: Page, text: string) => page.getByTestId('counter-row').filter({ hasText: text }).first();

/** Opens a supplier: the C2.3 supplier list when there is one, else the C2.2 capsules. */
const openSupplier = async (page: Page, name: string) => {
  if (await page.getByTestId('all-suppliers').count()) {
    await page.getByTestId('all-suppliers').click();
    await page.getByTestId('supplier-grid-all').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  } else {
    await page.getByTestId('counter-capsules').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  }
  await page.waitForTimeout(300);
};

const openFruitPunch = async (page: Page) => {
  await row(page, 'Caution Extreme Fruit Punch').getByRole('button', { name: /^(Details|Detalles|تفاصيل)/ }).click();
  await expect(page.getByTestId('product-sheet')).toBeVisible();
};

const openCountSheet = async (page: Page) => {
  await page.getByTestId('mode-count').click();
  await row(page, 'Caution Extreme Fruit Punch').getByRole('button', { name: /^(Count|Contar|عدّ):/ }).click();
  await expect(page.getByTestId('count-sheet')).toBeVisible();
};

const openShare = async (page: Page) => {
  await page.getByRole('button', { name: /^(Share Arizona order|Compartir pedido de Arizona|مشاركة طلب Arizona)$/ }).click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();
};

const openMenu = async (page: Page) => {
  await page.getByTestId('counter-menu-button').click();
  await expect(page.getByTestId('counter-drawer')).toBeVisible();
  await page.waitForTimeout(300);
};

const scrollToBackup = async (page: Page) => {
  const heading = page.getByRole('heading', { name: 'Backup & Export' });
  await heading.scrollIntoViewIfNeeded();
  await heading.evaluate(el => el.scrollIntoView({ block: 'start' }));
};

const openEditor = async (page: Page) => {
  await page.getByRole('button', { name: 'Add product' }).click();
  await expect(page.getByTestId('product-editor')).toBeVisible();
};

export const SCREENS: Screen[] = [
  { name: 'counter-light', theme: 'light', language: 'en', path: '/counter' },
  { name: 'counter-dark', theme: 'dark', language: 'en', path: '/counter' },
  { name: 'product-sheet-light', theme: 'light', language: 'en', path: '/counter', prepare: openFruitPunch },
  { name: 'count-sheet-dark', theme: 'dark', language: 'en', path: '/counter', prepare: openCountSheet },
  { name: 'frito-lay-light', theme: 'light', language: 'en', path: '/counter', prepare: page => openSupplier(page, 'Frito-Lay') },
  { name: 'boarshead-dark', theme: 'dark', language: 'en', path: '/counter', prepare: page => openSupplier(page, "Boar's Head"), data: c1Data },
  { name: 'orders-light', theme: 'light', language: 'en', path: '/counter/orders', data: c1Data },
  { name: 'orders-dark', theme: 'dark', language: 'en', path: '/counter/orders', data: c1Data },
  { name: 'share-light', theme: 'light', language: 'en', path: '/counter/orders', prepare: openShare },
  { name: 'catalog-light', theme: 'light', language: 'en', path: '/counter/catalog' },
  { name: 'editor-dark', theme: 'dark', language: 'en', path: '/counter/catalog', prepare: openEditor },
  { name: 'settings-light', theme: 'light', language: 'en', path: '/counter/settings' },
  { name: 'backup-dark', theme: 'dark', language: 'en', path: '/counter/settings', prepare: scrollToBackup },
  { name: 'menu-dark', theme: 'dark', language: 'en', path: '/counter', prepare: openMenu },
  { name: 'menu-light', theme: 'light', language: 'en', path: '/counter', prepare: openMenu },
  { name: 'counter-arabic-dark', theme: 'dark', language: 'ar', path: '/counter', data: c1Data },
  { name: 'orders-arabic', theme: 'light', language: 'ar', path: '/counter/orders', data: c1Data },
  { name: 'counter-spanish', theme: 'light', language: 'es', path: '/counter', data: c1Data },
  { name: 'orders-spanish', theme: 'light', language: 'es', path: '/counter/orders', data: c1Data },
];

/**
 * Loads one screen with the real 141-product catalog and its Arizona order, in the screen's theme
 * and language. Storage is replaced, so call it on a page of a dedicated test origin.
 */
export const showScreen = async (page: Page, screen: Screen) => {
  await page.goto('/');
  await page.evaluate(
    ({ data, theme, language }) => {
      localStorage.clear();
      for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
      localStorage.setItem('theme', theme);
      localStorage.setItem('language', language);
    },
    { data: { ...REAL, ...screen.data }, theme: screen.theme, language: screen.language },
  );
  // A different query string forces a full page load (a hash-only change would not), so the app
  // starts fresh and reads the data written above.
  await page.goto(`/?screen=${screen.name}#${screen.path}`);
  await expect(page.locator('#root header')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#${screen.path.replace(/\//g, '\\/')}$`));
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${screen.theme}\\b`));
  await screen.prepare?.(page);
};
