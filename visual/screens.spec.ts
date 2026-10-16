import { mkdirSync, writeFileSync } from 'fs';
import { test } from '@playwright/test';
import { SCREENS, showScreen } from '../e2e/tour';

// Photographs every screen in e2e/tour.ts under identical conditions, so the old build (Tailwind
// from the CDN, Inter from Google Fonts) and the new build can be compared pixel by pixel.
const LABEL = process.env.VISUAL_LABEL ?? 'after';
const OUT = `visual-output/${LABEL}`;
mkdirSync(OUT, { recursive: true });

// 1×1 light-grey PNG. Sample product pictures come from placehold.co; both runs get this
// instead, so a slow or changed image service cannot show up as a difference.
const GREY_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+P/ffwAJYQPZMp+2xgAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  // The share text and its QR code include the current date and time. Fix `Date` (only Date:
  // Playwright's fake clock also froze framer-motion's animations) so both runs encode the same.
  await page.addInitScript(() => {
    const fixed = new Date('2026-10-01T15:00:00-04:00').getTime();
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(fixed);
        else super(...(args as [string]));
      }
      static now() {
        return fixed;
      }
    }
    (window as unknown as { Date: DateConstructor }).Date = FixedDate as DateConstructor;
  });
  await page.route(/^https:\/\/placehold\.co\//, route => route.fulfill({ contentType: 'image/png', body: GREY_PIXEL }));
});

// Computed styles recorded for every element, so a pixel difference can be traced to the CSS
// property that caused it.
const PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'margin', 'padding',
  'border-width', 'border-style', 'border-color', 'border-radius', 'color', 'background-color',
  'background-image', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'letter-spacing', 'text-align', 'text-transform', 'text-decoration-line', 'white-space', 'opacity',
  'box-shadow', 'transform', 'filter', 'backdrop-filter', 'z-index', 'gap', 'flex-direction',
  'justify-content', 'align-items', 'overflow', 'outline-style', '-webkit-font-smoothing',
  'font-feature-settings', 'font-variation-settings', 'direction', 'visibility',
];

for (const screen of SCREENS) {
  test(screen.name, async ({ page }) => {
    test.skip(LABEL === 'before' && screen.since === 'c1', 'This screen only exists in the new build.');
    await showScreen(page, screen);
    await page.evaluate(() => document.fonts.ready);
    // Pictures in view have finished loading (the stand-in grey pixel).
    await page.waitForFunction(() =>
      [...document.images]
        .filter(img => {
          const rect = img.getBoundingClientRect();
          return rect.top < innerHeight && rect.bottom > 0 && rect.width > 0;
        })
        .every(img => img.complete),
    );
    // Let entrance animations (framer-motion) finish.
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: `${OUT}/${screen.name}.png`,
      animations: 'disabled',
      caret: 'hide',
    });
    const styles = await page.evaluate(props => {
      const out: Record<string, Record<string, string>> = {};
      const path = (el: Element): string => {
        const parent = el.parentElement;
        if (!parent) return el.tagName.toLowerCase();
        const index = [...parent.children].indexOf(el);
        return `${path(parent)}>${el.tagName.toLowerCase()}:${index}`;
      };
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
        const computed = getComputedStyle(el);
        out[path(el)] = Object.fromEntries(props.map(p => [p, computed.getPropertyValue(p)]));
      }
      return out;
    }, PROPS);
    writeFileSync(`${OUT}/${screen.name}.styles.json`, JSON.stringify(styles));
  });
}
