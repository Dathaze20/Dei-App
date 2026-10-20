// Shared phone-layout checks for the browser tests (C2.2a, C2.2b).
//
// Android 15+ draws the app edge to edge; Capacitor reports the system bars as
// --safe-area-inset-top/bottom, which these helpers set the same way (32px and 24px). Larger
// Android font sizes are simulated by raising the root font size, which scales every rem-based
// size (text, spacing, buttons), a stricter case than text alone.
//
// Overflow is measured on elements, not on the page scroll width: the page clips sideways
// overflow as a last line of defence, and these checks make sure nothing relies on that.
import { Browser, Page, expect } from '@playwright/test';
import { REAL } from './helpers';

export const SAFE_TOP = 32;
export const SAFE_BOTTOM = 24;

export interface Setup { width: number; height?: number; text?: number; lang?: 'en' | 'es' | 'ar'; theme?: 'light' | 'dark'; /** Extra localStorage values, e.g. the screen style. */ storage?: Record<string, string> }

export const openPhone = async (browser: Browser, { width, height = 860, text = 100, lang = 'en', theme, storage = {} }: Setup, path = '/') => {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.addInitScript(([raw, text, lang, top, bottom, extra, theme]) => {
    if (!localStorage.getItem('inventory_products')) {
      for (const [key, value] of Object.entries(raw)) localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(extra)) localStorage.setItem(key, value);
      if (theme) localStorage.setItem('theme', theme);
    }
    localStorage.setItem('language', lang);
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = `${text}%`;
      document.documentElement.style.setProperty('--safe-area-inset-top', `${top}px`);
      document.documentElement.style.setProperty('--safe-area-inset-bottom', `${bottom}px`);
    });
  }, [REAL, text, lang, SAFE_TOP, SAFE_BOTTOM, storage, theme ?? ''] as const);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/#${path}`);
  await expect(page.locator('#root header').first()).toBeVisible();
  await page.waitForTimeout(500); // entry animations
  return { page, errors, close: () => context.close() };
};

/** Opens a screen and waits until its content is shown (page changes are animated). */
export const show = async (page: Page, path: string) => {
  await page.goto(`/#${path}`);
  const ready = { '/': page.getByTestId('product-row').first(), '/order': page.getByTestId('order-line').first(), '/manage': page.getByRole('heading', { name: /Manage Products|Gestionar Productos|إدارة المنتجات/ }) }[path];
  if (ready) await expect(ready).toBeVisible();
  await page.waitForTimeout(500);
};

/** Visible elements that stick out of the screen sideways (horizontal scrollers excepted). */
export const overflowing = (page: Page) =>
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
export const systemBars = (page: Page) =>
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
export const boxes = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll(els =>
    els
      .map(e => ({ box: e.getBoundingClientRect(), name: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30) }))
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .map(({ box, name }) => ({ name, width: Math.round(box.width), height: Math.round(box.height) })),
  );

export const expectTargets = async (page: Page, selector: string, min = 44) => {
  const found = await boxes(page, selector);
  expect(found.length, `no elements for ${selector}`).toBeGreaterThan(0);
  const small = found.filter(b => b.width < min - 0.5 || b.height < min - 0.5);
  expect(small, `touch targets smaller than ${min}px for ${selector}`).toEqual([]);
};

