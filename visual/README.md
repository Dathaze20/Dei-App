# Visual comparison

`screens.spec.ts` photographs every screen in `e2e/tour.ts` (supplier view, Arizona, product
detail, new supplier form, order, share dialog, Manage, Backup, edit product, shelf tag; dark,
Arabic and Spanish variants) at the Galaxy A17 viewport (412×915, 2.625×) with the real
141-product catalog and Arizona order from `fixtures/exports/`.

Placeholder product pictures are replaced with a grey pixel and the share text box is masked
(it contains the current time), so only the app's own styling can differ.

CI (`visual` job) builds `main` and this branch, photographs both, and runs `compare.mjs`, which
writes before | after | difference sheets and a table of changed pixels to the job summary and
the `visual-comparison` artifact.

Locally:

```bash
npm run build
npx playwright test -c playwright.visual.config.ts          # writes visual-output/after/
VISUAL_DIST=other-build VISUAL_LABEL=before npx playwright test -c playwright.visual.config.ts
node visual/compare.mjs
```
