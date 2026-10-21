// v0.1.6: compact rows (one-tap select with Undo, the quantity adjuster, the large preview), the
// Camera tab, labels that never break inside a word at Android's largest text, and the shelf
// camera's photo coming back to the same check, also when Android closed the app meanwhile.
//
// The camera tests use a stand-in for the Android inbox (window.__deliShelfCameraForTests), kept in
// sessionStorage so it survives a page reload the way the real inbox survives Android closing the
// app. They prove the screens and the storage; they do not prove the phone's own camera app.
import { Page, expect, test } from '@playwright/test';
import { REAL, seed } from './helpers';

const order = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('inventory_currentOrder')!).items as { productId: string; quantity: number }[]);
const row = (page: Page, text: string) => page.getByTestId('counter-row').filter({ hasText: text }).first();
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

/**
 * The Android side, simulated: `mode` decides what the camera does when opened.
 *   'photo'   the photo comes back while the page is alive;
 *   'killed'  the photo is written, then the page is reloaded (Android closed the app);
 *   'nothing' the page is reloaded and the camera wrote nothing.
 */
const fakeCamera = (page: Page, mode: 'photo' | 'killed' | 'nothing') =>
  page.addInitScript(([mode, photo]) => {
    const key = 'fakeInbox';
    const read = (): { name: string; dataUrl: string }[] => JSON.parse(sessionStorage.getItem(key) ?? '[]');
    const write = (files: unknown) => sessionStorage.setItem(key, JSON.stringify(files));
    let n = Number(sessionStorage.getItem('fakeN') ?? '0');
    const add = () => {
      n++;
      sessionStorage.setItem('fakeN', String(n));
      write([...read(), { name: `photo-${1000 + n}.jpg`, dataUrl: photo }]);
    };
    (window as unknown as { __deliShelfCameraForTests: unknown }).__deliShelfCameraForTests = {
      takeShelfPhoto: () => {
        if (mode === 'photo') {
          add();
          return Promise.resolve({ taken: true });
        }
        if (mode === 'killed') add();
        setTimeout(() => {
          // 'nothing': Android restarted the app at its start screen (Counter).
          if (mode === 'nothing') history.replaceState(null, '', `${location.pathname}#/counter`);
          location.reload();
        }, 50);
        return new Promise(() => undefined);
      },
      chooseShelfPhotos: () => {
        add();
        return Promise.resolve({ taken: true });
      },
      takeShelfPhotos: () => Promise.resolve({ photos: read(), failed: 0, capturing: false }),
      deleteShelfPhotos: ({ names }: { names: string[] }) => {
        write(read().filter(f => !names.includes(f.name)));
        return Promise.resolve();
      },
    };
  }, [mode, PHOTO] as const);

test.describe('rows: select, adjust, undo, preview', () => {
  test('one tap adds a case and shows ✓ 1; Undo takes it back; picking never counts stock', async ({ page }) => {
    await seed(page, REAL, '/counter');
    const before = await order(page);
    await row(page, 'Caution Low-Carb').getByRole('button', { name: /^Add one/ }).click();
    await expect(row(page, 'Caution Low-Carb').getByTestId('row-selected')).toHaveText('1');
    expect(await order(page)).toHaveLength(before.length + 1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(row(page, 'Caution Low-Carb').getByTestId('row-add')).toBeVisible();
    expect(await order(page)).toEqual(before);
    expect(await page.evaluate(() => localStorage.getItem('inventory_stockCounts'))).toBeNull();
  });

  test('the adjuster: + and −, Remove with Undo restores the quantity', async ({ page }) => {
    await seed(page, REAL, '/counter');
    const lowCarb = row(page, 'Caution Low-Carb');
    await lowCarb.getByRole('button', { name: /^Add one/ }).click();
    await lowCarb.getByTestId('row-selected').click();
    await page.getByTestId('quantity-plus').click();
    await page.getByTestId('quantity-plus').click();
    await expect(page.getByTestId('quantity-value')).toHaveText('3');
    await expect(page.getByTestId('quantity-sheet')).toContainText('case(s)');
    await page.getByTestId('quantity-remove').click();
    await expect(page.getByTestId('quantity-sheet')).toHaveCount(0);
    expect((await order(page)).some(i => i.productId === 'az_rx_lowcarb_slim11_5')).toBe(false);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(lowCarb.getByTestId('row-selected')).toHaveText('3');
  });

  test('rows lead with the flavor, leave out the supplier name and the chosen size, and never cut a name', async ({ page }) => {
    await seed(page, REAL, '/counter');
    await page.getByTestId('filter-pill').filter({ hasText: '11.5 oz' }).click();
    const fruit = row(page, 'Caution Extreme Fruit Punch');
    await expect(fruit.getByTestId('row-name')).toHaveText('Caution Extreme Fruit Punch');
    await expect(fruit).toContainText('RX Energy');
    await expect(fruit).not.toContainText('Arizona');
    await expect(fruit).not.toContainText('11.5 oz');
    const cut = await page.getByTestId('counter-row').evaluateAll(rows => rows.filter(r => [...r.querySelectorAll('p')].some(p => p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 2)).length);
    expect(cut).toBe(0);
  });

  test('tapping the picture opens a large preview with the full name, size and details', async ({ page }) => {
    await seed(page, REAL, '/counter');
    await row(page, 'Caution Extreme Fruit Punch').getByTestId('row-picture').click();
    const sheet = page.getByTestId('product-sheet');
    await expect(sheet).toContainText('Arizona RX Energy');
    await expect(sheet).toContainText('Caution Extreme Fruit Punch');
    await expect(sheet.getByTestId('product-facts')).toContainText('11.5 oz');
    const big = (await sheet.getByTestId('product-thumb-placeholder').boundingBox())!;
    expect(big.height).toBeGreaterThan(150);
    // A colour label is never passed off as the package.
    await expect(sheet.getByTestId('label-tile-note')).toBeVisible();
  });
});

test.describe('labels at the largest Android text', () => {
  // Android's text size makes the words bigger without making the boxes bigger. Doubling the
  // label's own font size does the same here (v0.1.5 then showed "Orde/r" and "Cou/nt").
  for (const width of [320, 412]) {
    test(`${width}px, text twice as large: Order, Count and the tab names never break inside a word`, async ({ page }) => {
      await page.setViewportSize({ width, height: 860 });
      await seed(page, REAL, '/counter');
      await page.evaluate(() => {
        for (const el of document.querySelectorAll<HTMLElement>('[data-testid=mode-order] span, [data-testid=mode-count] span, [data-testid=counter-nav] a > span:last-child')) {
          el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * 2}px`;
        }
      });
      await page.waitForTimeout(300);
      const lines = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-testid=mode-order] span, [data-testid=mode-count] span, [data-testid=counter-nav] a > span:last-child')].map(el => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return { text: el.textContent, lines: new Set([...range.getClientRects()].map(r => Math.round(r.top))).size };
        }),
      );
      expect(lines.filter(l => l.lines > 1)).toEqual([]);
    });
  }
});

test.describe('Camera tab and shelf photos', () => {
  test('Camera opens shelf photos; unfinished checks are listed and counted on the tab', async ({ page }) => {
    await seed(page, REAL, '/counter');
    await page.getByTestId('nav-camera').click();
    await expect(page).toHaveURL(/#\/counter\/shelf$/);
    await expect(page.getByTestId('new-shelf-check')).toBeVisible();
    await expect(page.getByTestId('new-shelf-gallery')).toBeVisible();
    await page.getByTestId('new-shelf-gallery-input').setInputFiles([{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(PHOTO.split(',')[1], 'base64') }]);
    await expect(page.getByTestId('shelf-photo')).toHaveCount(1);
    await page.getByTestId('nav-camera').click();
    await expect(page.getByTestId('shelf-draft')).toHaveCount(1);
    await expect(page.getByTestId('nav-camera')).toContainText('1');
  });

  test('Take photo: the photo shows in the same check at once; more can be added; they stay after leaving', async ({ page }) => {
    await fakeCamera(page, 'photo');
    await seed(page, REAL, '/counter/shelf');
    await page.getByTestId('new-shelf-check').click();
    await expect(page).toHaveURL(/#\/counter\/shelf\/chk/);
    const url = page.url();
    await expect(page.getByTestId('shelf-photo')).toHaveCount(1);
    await expect(page.getByTestId('shelf-message')).toHaveText('Photo saved to this check.');
    await page.getByTestId('shelf-take-photo').click();
    await expect(page.getByTestId('shelf-photo')).toHaveCount(2);
    await page.getByTestId('shelf-photo').first().click();
    await expect(page.getByTestId('shelf-photo-view').locator('img')).toBeVisible();
    await page.getByTestId('shelf-photo-view').getByRole('button', { name: /Close/ }).click();
    await page.getByTestId('nav-counter').click();
    await page.goto(url);
    await expect(page.getByTestId('shelf-photo')).toHaveCount(2);
  });

  test('Android closed the app while the camera was open: the photo comes back in the same check', async ({ page }) => {
    await fakeCamera(page, 'killed');
    await seed(page, REAL, '/counter/shelf');
    await page.getByTestId('new-shelf-check').click();
    await expect(page).toHaveURL(/#\/counter\/shelf\/chk/);
    const url = page.url();
    // The page reloads (as after Android closed the app); the photo is collected from the inbox.
    await expect(page.getByTestId('shelf-photo')).toHaveCount(1, { timeout: 15_000 });
    expect(page.url()).toBe(url);
    await expect(page.getByTestId('shelf-message')).toHaveText('Photo saved to this check.');
    expect(await page.evaluate(() => sessionStorage.getItem('fakeInbox'))).toBe('[]');
    expect(await page.evaluate(() => localStorage.getItem('deliordernyc_sys_shelfCapture'))).toBeNull();
  });

  test('the app reopened on Counter after the camera: it goes back to the check and says what happened', async ({ page }) => {
    await fakeCamera(page, 'nothing');
    await seed(page, REAL, '/counter/shelf');
    await page.getByTestId('new-shelf-check').click();
    await expect(page).toHaveURL(/#\/counter\/shelf\/chk/);
    const url = page.url();
    // The app restarts on Counter; the pending check is remembered on the phone, so it goes back.
    await expect(page).toHaveURL(url, { timeout: 15_000 });
    await expect(page.getByTestId('shelf-message')).toContainText('The camera did not return a photo');
  });
});
