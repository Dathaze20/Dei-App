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
  // (No fake clock: freezing time also froze framer-motion's animations. The share text's time
  // line is the only clock-dependent text; it is masked in the screenshot instead.)
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
      mask: [page.locator('textarea[readonly]')],
    });
  });
}
