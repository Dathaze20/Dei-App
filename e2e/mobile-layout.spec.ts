// Phone layout (C2.2a): the app must fit the screen at every common Android width and text size,
// stay clear of the status bar and gesture bar, and keep touch targets comfortable.
//
// Android 15+ draws the app edge to edge; Capacitor reports the system bars as
// --safe-area-inset-top/bottom, which these tests set the same way (32px and 24px). Larger
// Android font sizes are simulated by raising the root font size, which scales every rem-based
// size (text, spacing, buttons), a stricter case than text alone.
//
// Overflow is measured on elements, not on the page scroll width: the page clips sideways
// overflow as a last line of defence, and these tests make sure nothing relies on that.
import { Browser, Page, expect, test } from '@playwright/test';
import { REAL } from './helpers';

const SAFE_TOP = 32;
const SAFE_BOTTOM = 24;

interface Setup { width: number; height?: number; text?: number; lang?: 'en' | 'es' | 'ar' }

const openPhone = async (browser: Browser, { width, height = 860, text = 100, lang = 'en' }: Setup, path = '/') => {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.addInitScript(([raw, text, lang, top, bottom]) => {
    if (!localStorage.getItem('inventory_products')) for (const [key, value] of Object.entries(raw)) localStorage.setItem(key, value);
    localStorage.setItem('language', lang);
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = `${text}%`;
      document.documentElement.style.setProperty('--safe-area-inset-top', `${top}px`);
      document.documentElement.style.setProperty('--safe-area-inset-bottom', `${bottom}px`);
    });
  }, [REAL, text, lang, SAFE_TOP, SAFE_BOTTOM] as const);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/#${path}`);
  await expect(page.locator('#root header')).toBeVisible();
  await page.waitForTimeout(500); // entry animations
  return { page, errors, close: () => context.close() };
};

/** Opens a screen and waits until its content is shown (page changes are animated). */
const show = async (page: Page, path: string) => {
  await page.goto(`/#${path}`);
  const ready = { '/': page.getByTestId('product-row').first(), '/order': page.getByTestId('order-line').first(), '/manage': page.getByRole('heading', { name: /Manage Products|Gestionar Productos|إدارة المنتجات/ }) }[path];
  if (ready) await expect(ready).toBeVisible();
  await page.waitForTimeout(500);
};

/** Visible elements that stick out of the screen sideways (horizontal scrollers excepted). */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const vw = window.innerWidth;
    const shown = (e: Element) => {
      const box = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const inScroller = (e: Element) => {
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const outside = (box: DOMRect) => box.right > vw + 1 || box.left < -1;
    const found: string[] = [];
    for (const e of document.querySelectorAll('body *')) {
      if (!shown(e) || inScroller(e)) continue;
      const box = e.getBoundingClientRect();
      if (!outside(box)) continue;
      const parent = e.parentElement;
      if (parent && outside(parent.getBoundingClientRect()) && !inScroller(parent)) continue; // report the outermost only
      found.push(`<${e.tagName.toLowerCase()} class="${String((e as HTMLElement).className).slice(0, 60)}"> ${Math.round(box.left)}..${Math.round(box.right)} of ${vw}: "${(e.textContent ?? '').trim().slice(0, 30)}"`);
    }
    return found;
  });

/** The header content sits below the status bar; the bottom navigation sits fully above the gesture bar. */
const systemBars = (page: Page) =>
  page.evaluate(([top, bottom]) => {
    const header = document.querySelector('header > div')!.getBoundingClientRect();
    const nav = [...document.querySelectorAll('nav')].find(n => getComputedStyle(n).position === 'fixed');
    const navBox = nav?.firstElementChild?.getBoundingClientRect();
    return {
      headerTop: Math.round(header.top),
      headerOk: header.top >= top - 0.5,
      navOk: !navBox || (navBox.top >= 0 && navBox.bottom <= window.innerHeight - bottom + 0.5),
      navBottom: navBox ? Math.round(navBox.bottom) : null,
    };
  }, [SAFE_TOP, SAFE_BOTTOM] as const);

/** Size of every visible match, for touch-target checks. */
const boxes = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll(els =>
    els
      .map(e => ({ box: e.getBoundingClientRect(), name: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30) }))
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .map(({ box, name }) => ({ name, width: Math.round(box.width), height: Math.round(box.height) })),
  );

const expectTargets = async (page: Page, selector: string, min = 44) => {
  const found = await boxes(page, selector);
  expect(found.length, `no elements for ${selector}`).toBeGreaterThan(0);
  const small = found.filter(b => b.width < min - 0.5 || b.height < min - 0.5);
  expect(small, `touch targets smaller than ${min}px for ${selector}`).toEqual([]);
};

test.describe('no sideways overflow at any width or text size', () => {
  for (const width of [320, 360, 384, 412]) {
    for (const text of [100, 130, 160]) {
      test(`${width}px, text ${text}%: Products, Order and Manage fit the screen and clear the system bars`, async ({ browser }) => {
        const phone = await openPhone(browser, { width, text });
        for (const path of ['/', '/order', '/manage']) {
          await show(phone.page, path);
          expect(await overflowing(phone.page), `${path}`).toEqual([]);
          const bars = await systemBars(phone.page);
          expect(bars.headerOk, `${path}: header under the status bar (top ${bars.headerTop})`).toBe(true);
          expect(bars.navOk, `${path}: bottom navigation under the gesture bar (bottom ${bars.navBottom})`).toBe(true);
        }
        // Manage with a supplier opened, at the bottom of the page.
        await phone.page.getByRole('button', { name: /^Arizona\s*\d+$/ }).click();
        await phone.page.waitForTimeout(300);
        expect(await overflowing(phone.page), '/manage with Arizona open').toEqual([]);
        expect(phone.errors).toEqual([]);
        await phone.close();
      });
    }
  }

  test('Arabic (right to left) at 360px fits on every screen', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 360, lang: 'ar' });
    expect(await phone.page.locator('[dir="rtl"]').count()).toBeGreaterThan(0);
    for (const path of ['/', '/order', '/manage']) {
      await show(phone.page, path);
      expect(await overflowing(phone.page), path).toEqual([]);
    }
    await phone.close();
  });

  test('Spanish at 130% text fits on every screen', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 384, text: 130, lang: 'es' });
    for (const path of ['/', '/order', '/manage']) {
      await show(phone.page, path);
      expect(await overflowing(phone.page), path).toEqual([]);
    }
    await phone.close();
  });

  test('landscape (915x412) fits and the header clears the status bar', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 915, height: 412 });
    for (const path of ['/', '/order', '/manage']) {
      await show(phone.page, path);
      expect(await overflowing(phone.page), path).toEqual([]);
      expect((await systemBars(phone.page)).headerOk).toBe(true);
    }
    await phone.close();
  });
});

test.describe('dialogs fit and stay usable', () => {
  for (const text of [100, 160]) {
    test(`text ${text}%: product details, share and product form fit; close stays reachable`, async ({ browser }) => {
      const phone = await openPhone(browser, { width: 360, text });
      const { page } = phone;
      const dialogOk = async (label: string) => {
        expect(await overflowing(page), label).toEqual([]);
        const close = page.getByRole('button', { name: 'Close' }).last();
        await expect(close, label).toBeInViewport();
        const box = (await close.boundingBox())!;
        expect(box.y, `${label}: close button under the status bar`).toBeGreaterThanOrEqual(SAFE_TOP - 0.5);
        expect(Math.min(box.width, box.height), `${label}: close button size`).toBeGreaterThanOrEqual(43.5);
        await close.click();
        await page.waitForTimeout(400);
      };

      await page.getByTestId('product-row').first().locator('.cursor-pointer').last().click();
      await expect(page.getByRole('heading', { name: 'Product Details' })).toBeVisible();
      await page.waitForTimeout(400);
      // The add-to-order button can be scrolled to inside the sheet, above the gesture bar.
      const add = page.getByRole('button', { name: 'Add to Order', exact: true });
      await add.scrollIntoViewIfNeeded();
      const addBox = (await add.boundingBox())!;
      expect(addBox.y + addBox.height).toBeLessThanOrEqual(860 - SAFE_BOTTOM + 0.5);
      await dialogOk('product details');

      await page.goto('/#/order');
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Share Order/ })).toBeInViewport();
      await page.getByRole('link', { name: 'Send as Text' }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('link', { name: 'Send as Text' })).toBeInViewport();
      await dialogOk('share order');

      await page.goto('/#/manage');
      await page.getByRole('button', { name: 'New Product' }).first().click();
      await expect(page.getByRole('heading', { name: 'New Product' })).toBeVisible();
      await page.getByRole('button', { name: 'Save Product' }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('button', { name: 'Save Product' })).toBeInViewport();
      await dialogOk('product form');

      expect(phone.errors).toEqual([]);
      await phone.close();
    });
  }
});

test.describe('touch targets are at least 44x44', () => {
  test('header, navigation, suppliers, groups, product rows, order lines and Manage actions', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 360 });
    const { page } = phone;
    await expectTargets(page, 'header a, header button');
    await expectTargets(page, 'nav.fixed a');
    await expectTargets(page, '[data-testid="supplier-capsules"] button');
    await expectTargets(page, 'button[aria-expanded]');
    await expectTargets(page, '[data-testid="product-row"] button');

    await page.goto('/#/order');
    await expect(page.getByTestId('order-line').first()).toBeVisible();
    await page.waitForTimeout(400);
    await expectTargets(page, '[data-testid="order-line"] button');

    await page.goto('/#/manage');
    await page.getByRole('button', { name: /^Arizona\s*\d+$/ }).click();
    await expect(page.getByTestId('manage-product').first()).toBeVisible();
    await expectTargets(page, '[data-testid="manage-product"] button');
    await phone.close();
  });
});

test.describe('less scrolling, nothing removed', () => {
  test('Arizona: groups of more than 12 products start closed and open with one tap', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 412 });
    const { page } = phone;
    const group = (name: string) => page.getByRole('button', { name: new RegExp(`^${name.replace(/\./g, '\\.')}`) });
    await expect(group('20 oz. Tall Boy')).toHaveAttribute('aria-expanded', 'false');
    await expect(group('23 oz. Big Can')).toHaveAttribute('aria-expanded', 'false');
    await expect(group('11.5 oz. Slim Can')).toHaveAttribute('aria-expanded', 'true');
    await expect(group('12 oz. Can')).toHaveAttribute('aria-expanded', 'true');
    const before = await page.getByTestId('product-row').count();
    await group('23 oz. Big Can').click();
    await expect(group('23 oz. Big Can')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('product-row')).toHaveCount(before + 21);
    await phone.close();
  });

  test('a supplier with a single large group shows it open (Frito-Lay has more groups; Doritos starts closed)', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 412 });
    const { page } = phone;
    await page.getByTestId('supplier-capsules').getByRole('button', { name: 'Frito-Lay' }).click();
    await expect(page.getByRole('button', { name: /^Doritos\s*14$/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: /^Lays\s*\d+$/ })).toHaveAttribute('aria-expanded', 'true');
    await phone.close();
  });

  test('Manage lists every product under its supplier', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 412 }, '/manage');
    const { page } = phone;
    const sections = page.getByRole('button', { name: /\d+$/ }).filter({ has: page.locator('h3') });
    const counts = await sections.evaluateAll(els => els.map(e => Number(e.querySelector('span')?.textContent ?? 0)));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(JSON.parse(REAL.inventory_products).length);
    await expect(page.getByTestId('manage-product')).toHaveCount(0); // all closed at first
    await page.getByRole('button', { name: /^Boar's Head/ }).click();
    await expect(page.getByTestId('manage-product')).toHaveCount(5);
    await phone.close();
  });

  test('a product without a picture, or whose picture cannot load, shows a tidy placeholder', async ({ browser }) => {
    const phone = await openPhone(browser, { width: 360 });
    const { page } = phone;
    // Pictures are remote; offline (as in this test) they fail to load and the placeholder is shown.
    await page.route(/^https?:\/\/(?!localhost)/, route => route.abort());
    await page.reload();
    await page.waitForTimeout(800);
    expect(await page.getByTestId('product-thumb-placeholder').count()).toBeGreaterThan(0);
    expect(await overflowing(page)).toEqual([]);
    await phone.close();
  });
});
