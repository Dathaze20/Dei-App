import { Page, expect } from '@playwright/test';
import { REAL } from './helpers';

/**
 * A fixed tour of the app's existing screens, shared by the class-coverage test (which checks
 * that the local Tailwind build styles every class the screens use) and the before/after visual
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

const openFruitPunch = async (page: Page) => {
  await openArizona(page);
  await page.getByText('Caution Extreme Fruit Punch').first().click();
  await expect(page.getByRole('heading', { name: /Product Details|Detalles del Producto|تفاصيل المنتج/ })).toBeVisible();
};

const openBoarsHead = async (page: Page) => {
  await chip(page, "Boar's Head").click();
  await expect(page.getByText('OvenGold Turkey Breast').first()).toBeVisible();
};

const chip = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();

const openArizona = async (page: Page) => {
  await chip(page, 'Arizona').click();
  await expect(page.getByText('Caution Extreme Fruit Punch').first()).toBeVisible();
};

const openShare = async (page: Page) => {
  await page.getByRole('button', { name: /^(Share|Compartir|مشاركة)$/ }).filter({ visible: true }).first().click();
  await expect(page.locator('textarea[readonly]').first()).toBeVisible();
};

/** Since C2.2a, Manage lists products in supplier sections that start closed; open the first. */
const openManageSection = async (page: Page) => {
  const closed = page.locator('main button[aria-expanded="false"]').filter({ has: page.locator('h3') }).filter({ visible: true });
  if (await closed.count()) await closed.first().click();
};

const scrollToBackup = async (page: Page) => {
  const heading = page.getByRole('heading', { name: 'Backup & Export' });
  await heading.scrollIntoViewIfNeeded();
  await heading.evaluate(el => el.scrollIntoView({ block: 'start' }));
};

export const SCREENS: Screen[] = [
  { name: 'supplier-view-light', theme: 'light', language: 'en', path: '/' },
  { name: 'arizona-light', theme: 'light', language: 'en', path: '/', prepare: openArizona },
  {
    name: 'product-detail-light',
    theme: 'light',
    language: 'en',
    path: '/',
    prepare: async page => {
      await openArizona(page);
      await page.getByText('Caution Extreme Fruit Punch').first().click();
      await expect(page.getByRole('heading', { name: 'Product Details' })).toBeVisible();
    },
  },
  {
    name: 'new-supplier-form-light',
    theme: 'light',
    language: 'en',
    path: '/',
    prepare: async page => {
      // The round "+" after the supplier chips; its form shows every supplier colour choice.
      await page.locator('main .lg\\:hidden button.rounded-full:has(svg)').first().click();
      await expect(page.getByPlaceholder('Supplier Name')).toBeVisible();
    },
  },
  { name: 'order-light', theme: 'light', language: 'en', path: '/order' },
  { name: 'share-dialog-light', theme: 'light', language: 'en', path: '/order', prepare: openShare },
  { name: 'manage-light', theme: 'light', language: 'en', path: '/manage' },
  { name: 'backup-light', theme: 'light', language: 'en', path: '/manage', prepare: scrollToBackup },
  {
    name: 'edit-product-light',
    theme: 'light',
    language: 'en',
    path: '/manage',
    prepare: async page => {
      await openManageSection(page);
      await page.locator('button.text-blue-600, button[aria-label="Edit Product"]').filter({ visible: true }).first().click();
      await expect(page.locator('input[name="name"]')).toBeVisible();
    },
  },
  {
    name: 'shelf-tag-light',
    theme: 'light',
    language: 'en',
    path: '/manage',
    prepare: async page => {
      await openManageSection(page);
      await page.locator('button.text-green-600, button[aria-label="Shelf tag"]').filter({ visible: true }).first().click();
      await expect(page.locator('svg[viewBox]').filter({ has: page.locator('path') }).last()).toBeVisible();
    },
  },
  { name: 'supplier-view-dark', theme: 'dark', language: 'en', path: '/' },
  { name: 'arizona-dark', theme: 'dark', language: 'en', path: '/', prepare: openArizona },
  { name: 'order-dark', theme: 'dark', language: 'en', path: '/order' },
  { name: 'share-dialog-dark', theme: 'dark', language: 'en', path: '/order', prepare: openShare },
  { name: 'backup-dark', theme: 'dark', language: 'en', path: '/manage', prepare: scrollToBackup },
  { name: 'supplier-view-arabic', theme: 'light', language: 'ar', path: '/' },
  { name: 'arizona-arabic-dark', theme: 'dark', language: 'ar', path: '/', prepare: openArizona },
  { name: 'order-arabic', theme: 'light', language: 'ar', path: '/order' },
  { name: 'manage-arabic', theme: 'light', language: 'ar', path: '/manage' },
  { name: 'supplier-view-spanish', theme: 'light', language: 'es', path: '/' },
  // C1 states. The data is also loaded into the `main` build, which ignores what it doesn't know.
  { name: 'c1-counted-arizona-light', theme: 'light', language: 'en', path: '/', prepare: openArizona, data: c1Data },
  { name: 'c1-counted-detail-light', theme: 'light', language: 'en', path: '/', prepare: openFruitPunch, data: c1Data },
  { name: 'c1-counted-detail-arabic-dark', theme: 'dark', language: 'ar', path: '/', prepare: openFruitPunch, data: c1Data },
  { name: 'c1-boarshead-light', theme: 'light', language: 'en', path: '/', prepare: openBoarsHead, data: c1Data },
  { name: 'c1-mixed-order-light', theme: 'light', language: 'en', path: '/order', data: c1Data },
  { name: 'c1-mixed-order-dark', theme: 'dark', language: 'en', path: '/order', data: c1Data },
  { name: 'c1-mixed-order-spanish', theme: 'light', language: 'es', path: '/order', data: c1Data },
  { name: 'c1-mixed-share-light', theme: 'light', language: 'en', path: '/order', prepare: openShare, data: c1Data },
  {
    name: 'c1-confirm-old-number-light',
    theme: 'light',
    language: 'en',
    path: '/',
    since: 'c1',
    prepare: async page => {
      await openArizona(page);
      await page.getByText('Caution Extreme Performance').first().click();
      await page.getByRole('button', { name: /^Use old number/ }).click();
      await expect(page.getByTestId('confirm-old-number')).toBeVisible();
    },
  },
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
