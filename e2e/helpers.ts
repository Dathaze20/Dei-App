import { Page, expect } from '@playwright/test';
import { readFileSync } from 'fs';

export const fixture = (name: string) => readFileSync(`fixtures/exports/${name}`, 'utf8');
/** The real 141-product catalog + Arizona order, exported by a browser in PR #1. */
export const REAL: Record<string, string> = JSON.parse(fixture('pr1-b291176-arizona-demo.json')).raw;

/** Page errors other than the Tailwind CDN being unreachable (it is blocked in some sandboxes). */
export const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', error => {
    if (!/tailwind is not defined/.test(error.message)) errors.push(error.message);
  });
  return errors;
};

/** Opens a route with a full page load (so the app re-reads storage). */
export const open = async (page: Page, path = '/') => {
  await page.goto(`/#${path}`);
  await page.reload();
  await expect(page.locator('#root header')).toBeVisible();
};

/** Replaces this origin's storage with `data` and reloads. */
export const seed = async (page: Page, data: Record<string, string>, path = '/') => {
  await page.goto('/');
  await page.evaluate(entries => {
    localStorage.clear();
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, data);
  await open(page, path);
};

export const dumpStorage = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)!])));

/** Only DeliOrderNYC's data keys (drops other apps' keys and restore control keys). */
export const deliData = (all: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(all).filter(([key]) =>
      ['inventory_products', 'inventory_suppliers', 'inventory_currentOrder', 'inventory_deliName', 'theme', 'language'].includes(key) ||
      (key.startsWith('inventory_') || (key.startsWith('deliordernyc_') && !key.startsWith('deliordernyc_sys_'))),
    ),
  );

export const visible = (page: Page) => ({
  button: (name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true }).first(),
  link: (name: string | RegExp) => page.getByRole('link', { name }).filter({ visible: true }).first(),
});

/** Uses Export My Data and returns the downloaded file's text. */
export const exportViaUi = async (page: Page): Promise<string> => {
  await open(page, '/manage');
  await visible(page).button('Export My Data').click();
  await expect(page.getByText('Verified: the SHA-256 checksum was confirmed')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), visible(page).button('Download File').click()]);
  const path = await download.path();
  return readFileSync(path!, 'utf8');
};

/** Loads a backup into the Restore panel and checks it. */
export const checkBackup = async (page: Page, text: string, name = 'backup.json') => {
  await open(page, '/manage');
  await page.getByTestId('restore-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
  await visible(page).button('Check Backup').click();
  await expect(page.getByTestId('restore-analysis')).toBeVisible();
};

/** Confirms and runs the restore, waiting for the reload that follows success. */
export const confirmRestore = async (page: Page) => {
  await page.getByLabel(/I understand this replaces/).check();
  await Promise.all([page.waitForEvent('load'), visible(page).button('Restore Backup').click()]);
  await expect(page.locator('#root header')).toBeVisible();
};
