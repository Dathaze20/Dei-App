import { mkdirSync } from 'fs';
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

for (const screen of SCREENS) {
  test(screen.name, async ({ page }) => {
    await showScreen(page, screen);
    await page.evaluate(() => document.fonts.ready);
    // Pictures in view have finished loading (the stand-in grey pixel).
    await page.waitForFunction(() =>
      [...document.images].filter(img => img.getBoundingClientRect().top < innerHeight).every(img => img.complete),
    );
    // Let entrance animations (framer-motion) finish.
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: `${OUT}/${screen.name}.png`,
      animations: 'disabled',
      caret: 'hide',
    });
  });
}
