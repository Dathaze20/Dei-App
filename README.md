# DeliOrderNYC

A supplier-first ordering and stock assistant for a neighborhood deli: pick a supplier, review its
products, build an order in cases, and share it by QR code, copied text or SMS.

Originally built in Google AI Studio. All data is stored in the browser on the device.

## Protecting your data

Use **Manage → Backup & Export → Export My Data** to save a JSON copy of everything the app has
stored, and **Manage → Restore from Backup** to load one back. A restore always saves a verified
safety snapshot first and can be undone. Data saved at one web address (for example the AI Studio preview) is not visible to a copy
of the app at another address. See [docs/DATA_SAFETY.md](docs/DATA_SAFETY.md) before moving
between copies.

## Stock counting

Stock is counted in individual units and saved only as verified counts with a date; old
numbers are shown as "not counted". Boar's Head is a plain weekly item list without stock
counting or prices. See [docs/STOCK_COUNTING.md](docs/STOCK_COUNTING.md).

## Development

Requires Node.js 22.

```bash
npm ci              # install exact dependency versions from package-lock.json
npm run dev         # start the dev server on http://localhost:3000
npm run typecheck   # TypeScript check (tsc --noEmit)
npm test            # unit tests (Vitest)
npm run build       # type-check, then production build into dist/
npm run verify      # type-check, unit tests, build
npm run test:e2e    # browser tests at Galaxy A17 size (needs `npm run build` first)
npm run check:secrets  # scan dist/ for API keys (also runs at the end of npm run build)
```

To try the app on a phone, see [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md): a manually triggered
GitHub Pages workflow publishes `main` to https://dathaze20.github.io/Dei-App/.

Styles are built with Tailwind CSS (`tailwind.config.js`, `index.css`) and the Inter font is
bundled, so the app loads nothing from CDNs. See [docs/OFFLINE.md](docs/OFFLINE.md) for what still
uses the internet and [docs/SECURITY.md](docs/SECURITY.md) for why API keys must never go in the
browser build.

`npm run build` runs the type check first, so a build can no longer succeed while hiding
TypeScript errors. GitHub Actions (`.github/workflows/ci.yml`) runs the same checks on every push
and pull request. It only verifies; it never deploys or publishes anything.
