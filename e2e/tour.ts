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
}

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
      await expect(page.locator('img[alt*="Caution Extreme Fruit Punch"]').last()).toBeVisible();
    },
  },
  {
    name: 'new-supplier-form-light',
    theme: 'light',
    language: 'en',
    path: '/',
    prepare: async page => {
      // The round "+" after the supplier chips; its form shows every supplier colour choice.
      await page.locator('main .lg\\:hidden button.rounded-full.h-10.w-10').first().click();
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
      await page.locator('button.text-blue-600').filter({ visible: true }).first().click();
      await expect(page.locator('input[name="name"]')).toBeVisible();
    },
  },
  {
    name: 'shelf-tag-light',
    theme: 'light',
    language: 'en',
    path: '/manage',
    prepare: async page => {
      await page.locator('button.text-green-600').filter({ visible: true }).first().click();
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
    { data: REAL, theme: screen.theme, language: screen.language },
  );
  // A different query string forces a full page load (a hash-only change would not), so the app
  // starts fresh and reads the data written above.
  await page.goto(`/?screen=${screen.name}#${screen.path}`);
  await expect(page.locator('#root header')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#${screen.path.replace(/\//g, '\\/')}$`));
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${screen.theme}\\b`));
  await screen.prepare?.(page);
};
