#!/usr/bin/env node
// Opens a GitHub Pages build (served under /Dei-App/) in Chromium with every request outside
// localhost blocked, and checks the app starts, is styled, and its HashRouter pages open.
// Usage: node scripts/smoke-pages.mjs http://localhost:4190/Dei-App/
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4190/Dei-App/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const errors = [];
const failed = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.url().startsWith(new URL(url).origin) && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
await page.route('**/*', route => {
  const host = new URL(route.request().url()).hostname;
  return host === 'localhost' || host === '127.0.0.1' ? route.continue() : route.abort();
});

const check = (ok, message) => { if (!ok) { console.error(`Pages smoke test FAILED: ${message}`); process.exitCode = 1; } };
try {
  await page.goto(url);
  await page.locator('#root header').waitFor({ timeout: 15000 });
  const rules = await page.evaluate(() => [...document.styleSheets].reduce((n, s) => n + s.cssRules.length, 0));
  check(rules > 500, `stylesheet not loaded (${rules} rules)`);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg !== 'rgba(0, 0, 0, 0)', 'page is unstyled');
  for (const route of ['#/order', '#/manage', '#/']) {
    await page.goto(new URL(route, url).href);
    await page.locator('#root header').waitFor({ timeout: 15000 });
    check(new URL(page.url()).pathname === new URL(url).pathname, `navigation left ${new URL(url).pathname}: ${page.url()}`);
  }
  check(failed.length === 0, `requests failed: ${failed.join(', ')}`);
  check(errors.length === 0, `page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
}
if (!process.exitCode) console.log(`Pages smoke test passed at ${url} (styled, routes work, no failed requests, no errors).`);
