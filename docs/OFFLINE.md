# What still needs the internet

Since C0 the app's code, styles and fonts are all part of its own build. Nothing is loaded from a
CDN when the app starts. This page lists what is still network dependent. It does **not** claim
the app works offline as an installed app: there is no service worker yet (see the end).

## Removed in C0

| Before | Now |
| --- | --- |
| Tailwind Play CDN script (`cdn.tailwindcss.com`) generated all styles in the browser at runtime | Tailwind 3.4.17 runs at build time through PostCSS; one CSS file in `dist/assets/` |
| Google Fonts stylesheet and font files (`fonts.googleapis.com`, `fonts.gstatic.com`) | Inter from `@fontsource/inter` (SIL Open Font License 1.1), bundled in `dist/assets/` |
| Import map pointing at `esm.sh` for React, React Router, framer-motion, react-qr-code, @google/genai and html5-qrcode | Removed. Vite already bundled every import, so the map was never used by the built app; it was left over from Google AI Studio |
| `<link href="/index.css">` to a file that did not exist (a 404 on every load) | `index.css` exists and is imported by `index.tsx`, so Vite bundles it |

## Still network dependent

| What | Host | Without internet |
| --- | --- | --- |
| Sample product pictures (all 141 sample products have an `imageUrl`) and the "No Image" fallback | `placehold.co` | The picture area stays an empty grey box. Everything else works. |
| Pictures from any image URL a user types into a product | that URL's host | Same: an empty box |
| Loading the app itself | wherever it is hosted | Opening the page needs the server. Once loaded, the open tab keeps working. |

Verified by `e2e/offline.spec.ts`: it runs the production build with every request outside
`localhost` blocked, records which hosts the app tried to reach, and fails if any host other than
`placehold.co` appears. Ordering (the Arizona $77.98 order), sharing by QR / Copy Text / Send as
Text, Export My Data, both themes and Arabic all pass with the internet blocked.

"Send as Text" opens the phone's messaging app with an `sms:` link; sending the message is up to
that app and the phone network.

## Typography

The font is the same family (Inter) at the same weights (400, 500, 600, 700, 800). Differences:

- The files come from Fontsource 5.1.1 (Inter 4.0) rather than whatever Inter build Google Fonts
  serves, so letter shapes and spacing can differ very slightly.
- Only the Latin and Latin Extended character sets are bundled (English and Spanish). Greek or
  Cyrillic letters, if someone typed them, now use the phone's sans-serif font.
- Arabic was never in Inter; it uses the phone's sans-serif font, exactly as before.

## Not done yet (later milestones)

- No service worker and no PWA install, so the app cannot be opened with no connection.
- Sample pictures are not bundled.
