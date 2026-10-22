import { Page, expect } from '@playwright/test';
import { readFileSync } from 'fs';

export const fixture = (name: string) => readFileSync(`fixtures/exports/${name}`, 'utf8');
/** The real 141-product catalog + Arizona order, exported by a browser in PR #1. */
export const REAL: Record<string, string> = JSON.parse(fixture('pr1-b291176-arizona-demo.json')).raw;

/** Uncaught page errors. (Styles are bundled since C0, so there is no CDN error to ignore.) */
export const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
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
  // Let the first page finish its own start-up redirect before the address is changed, so that
  // redirect can never land after the next navigation.
  await expect(page.locator('#root header').first()).toBeVisible();
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
  // Shown only when the backup lacks verified stock counts saved on this device (C1).
  const countsLoss = page.getByLabel(/verified stock counts for \d+ product\(s\) will be removed or replaced|unreadable stock counts on this device will be replaced/);
  if (await countsLoss.count()) await countsLoss.check();
  await Promise.all([page.waitForEvent('load'), visible(page).button('Restore Backup').click()]);
  await expect(page.locator('#root header')).toBeVisible();
};

/** Counter search (top bar): finds `text` across every supplier and adds one of the first match. */
export const searchAndAdd = async (page: Page, text: string) => {
  const box = page.getByRole('searchbox', { name: /Search products|Buscar productos|البحث في المنتجات/ });
  if (!(await box.count())) await page.getByRole('button', { name: /^(Search products|Buscar productos|البحث في المنتجات)$/ }).click();
  await box.fill(text);
  // Item-list rows (Boar's Head) have a tick box instead of "+".
  await page.getByTestId('counter-row').first().getByRole('button', { name: /^(Add one|Añadir uno|إضافة واحد)/ })
    .or(page.getByTestId('counter-row').first().getByRole('checkbox')).first().click();
};

/** Opens the counting keypad for the first product whose row contains `text` (Counter search). */
export const openCount = async (page: Page, text: string) => {
  const box = page.getByRole('searchbox', { name: /Search products/ });
  if (!(await box.count())) await page.getByRole('button', { name: 'Search products' }).click();
  await box.fill(text);
  await page.getByTestId('counter-row').filter({ hasText: text }).first().getByRole('button', { name: /^Details/ }).click();
  await page.getByTestId('open-count').click();
  await expect(page.getByTestId('count-sheet')).toBeVisible();
};

/** Types a count on the keypad and presses Save. */
export const keypadSave = async (page: Page, digits: string) => {
  for (const digit of digits) await page.getByTestId('count-keypad').getByRole('button', { name: digit, exact: true }).click();
  await page.getByTestId('count-sheet').getByRole('button', { name: 'Save', exact: true }).click();
};

/** Chooses a supplier through "All suppliers" (C2.3 supplier list). */
export const pickSupplier = async (page: Page, name: string | RegExp) => {
  await page.getByTestId('current-supplier').click();
  await page.getByTestId('supplier-grid-all').getByTestId('supplier-tile').filter({ hasText: name }).first().locator('button').first().click();
  await expect(page.getByTestId('supplier-grid')).toHaveCount(0);
};
