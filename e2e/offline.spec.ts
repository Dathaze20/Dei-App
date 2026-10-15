import { BrowserContext, Page, expect, test } from '@playwright/test';
import { collectErrors, open, seed, visible } from './helpers';
import { SCREENS, showScreen } from './tour';

// Every test here runs with the internet cut off: only the app's own server (localhost) answers.
// Requests to anywhere else are aborted and recorded, so a new external dependency fails loudly.

/** External hosts the app is still allowed to try, and why (see docs/OFFLINE.md). */
const KNOWN_EXTERNAL_HOSTS = new Set([
  // Sample product pictures. Without internet the image area stays a plain grey box.
  'placehold.co',
]);

const blockInternet = async (context: BrowserContext) => {
  const blocked: string[] = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.protocol === 'data:' || url.protocol === 'blob:') {
      return route.continue();
    }
    blocked.push(url.hostname);
    return route.abort('internetdisconnected');
  });
  return blocked;
};

let blocked: string[];
test.beforeEach(async ({ context }) => {
  blocked = await blockInternet(context);
});
test.afterEach(async ({}, testInfo) => {
  const hosts = [...new Set(blocked)].sort();
  testInfo.annotations.push({ type: 'blocked external hosts', description: hosts.join(', ') || 'none' });
  expect(hosts.filter(host => !KNOWN_EXTERNAL_HOSTS.has(host)), 'unexpected network dependency').toEqual([]);
});

const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('works without internet (production build)', () => {
  test('the bundled stylesheet and fonts load from the app itself', async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page, {});
    const sheets = await page.evaluate(() =>
      [...document.styleSheets].map(sheet => ({ href: sheet.href, rules: sheet.cssRules.length })),
    );
    // Exactly one stylesheet, served from this origin's /assets/, with the Tailwind rules in it.
    expect(sheets).toHaveLength(1);
    expect(sheets[0].href).toMatch(/^http:\/\/localhost:\d+\/assets\/index-[\w-]+\.css$/);
    expect(sheets[0].rules).toBeGreaterThan(500);

    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => ({
      family: getComputedStyle(document.body).fontFamily,
      loaded: [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Inter' && f.status === 'loaded').map(f => f.weight),
    }));
    expect(fonts.family).toMatch(/^Inter,/);
    expect(fonts.loaded.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('light and dark themes are styled', async ({ page }) => {
    await seed(page, { theme: 'light' });
    expect(await bodyBackground(page)).toBe('rgb(241, 245, 249)'); // slate-100
    // The bottom navigation is fixed to the bottom of the screen and has its brand-coloured tab.
    const nav = page.locator('nav').last();
    await expect(nav).toHaveCSS('position', 'fixed');
    await expect(page.locator('header')).toHaveCSS('position', 'sticky');

    await visible(page).button(/theme/i).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    expect(await bodyBackground(page)).toBe('rgb(2, 6, 23)'); // slate-950
  });

  test('product rows and supplier chips are styled', async ({ page }) => {
    await seed(page, {});
    const row = page.locator('main img').first(); // the first product row's picture
    await expect(row).toHaveCSS('width', '80px'); // w-20
    await expect(row).toHaveCSS('border-radius', '8px'); // rounded-lg
    // The selected supplier chip (the first one, on a fresh device).
    const active = page.locator('main .lg\\:hidden button.rounded-full').first();
    await expect(active).toHaveCSS('background-color', 'rgb(79, 70, 229)'); // brand primary
    await expect(active).toHaveCSS('border-radius', '9999px');
  });

  test('the Arizona order totals $77.98 and shares by QR, Copy Text and SMS', async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page, {});
    for (const flavor of ['Caution Extreme Fruit Punch', 'Caution Extreme Performance']) {
      await page.getByPlaceholder(/Search all products/).fill(flavor);
      await visible(page).button(/Add 1 case/).click();
    }
    await open(page, '/order');
    await expect(page.getByText('$77.98').first()).toBeVisible();
    await visible(page).button('Share').click();
    await expect(page.locator('svg').filter({ hasText: 'Deli Order Details' })).toBeVisible();
    await expect(visible(page).button('Copy Text')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Send as Text' })).toHaveAttribute('href', /^sms:\?&body=/);
    expect(await page.locator('textarea[readonly]').first().inputValue()).toContain('77.98');
    expect(errors).toEqual([]);
  });

  test('Export My Data works offline', async ({ page }) => {
    await seed(page, {}, '/manage');
    await visible(page).button('Export My Data').click();
    await expect(page.getByText('Verified: the SHA-256 checksum was confirmed')).toBeVisible();
  });

  test('Arabic is right-to-left and styled', async ({ page }) => {
    await seed(page, { language: 'ar' });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await bodyBackground(page)).toBe('rgb(241, 245, 249)');
  });
});

/**
 * Collects every class used on the page that no rule in the loaded stylesheets mentions.
 * Tailwind only writes CSS for classes it finds in the source, so a class built in a way the
 * scanner cannot see would show up here.
 */
const unstyledClasses = (page: Page) =>
  page.evaluate(() => {
    const known = new Set<string>();
    const visit = (rules: CSSRuleList) => {
      for (const rule of [...rules]) {
        if (rule instanceof CSSStyleRule) {
          for (const match of rule.selectorText.matchAll(/\.((?:\\.|[\w-])+)/g)) known.add(match[1].replace(/\\(.)/g, '$1'));
        }
        if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of [...document.styleSheets]) visit(sheet.cssRules);
    const used = new Set<string>();
    for (const el of document.querySelectorAll('[class]')) {
      const value = el.getAttribute('class') ?? '';
      for (const name of value.split(/\s+/)) if (name) used.add(name);
    }
    return [...used].filter(name => !known.has(name)).sort();
  });

// Classes in the markup that are not Tailwind utilities (they style nothing, before or after).
const NOT_TAILWIND = new Set([
  'light', // <html> theme marker set by ThemeContext; only `dark` has variants
  'active', // added by React Router's NavLink to the current bottom-nav tab
  'text-md', // not a Tailwind size (the CDN ignored it too); the OrderPage heading uses the inherited size
]);

test('every class on the existing screens has CSS in the bundled stylesheet', async ({ page }) => {
  test.setTimeout(240_000);
  const missing: Record<string, string[]> = {};
  for (const screen of SCREENS) {
    await showScreen(page, screen);
    const unstyled = (await unstyledClasses(page)).filter(name => !NOT_TAILWIND.has(name));
    if (unstyled.length) missing[screen.name] = unstyled;
  }
  expect(missing).toEqual({});
});

test('every supplier colour, including ones from a restored backup, is in the stylesheet', async ({ page }) => {
  await seed(page, {});
  const missing = await page.evaluate(() => {
    const families = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
    const probe = document.createElement('div');
    document.body.append(probe);
    const out: string[] = [];
    for (const family of families) {
      for (const shade of shades) {
        probe.className = `bg-${family}-${shade}`;
        if (getComputedStyle(probe).backgroundColor === 'rgba(0, 0, 0, 0)') out.push(probe.className);
      }
    }
    probe.remove();
    return out;
  });
  expect(missing).toEqual([]);
});
