# DeliOrderNYC

A supplier-first ordering and stock assistant for a neighborhood deli: pick a supplier, review its
products, build an order in cases, and share it by QR code, copied text or SMS.

Originally built in Google AI Studio. All data is stored in the browser on the device.

## Protecting your data

Use **Manage → Backup & Export → Export My Data** to save a JSON copy of everything the app has
stored. Data saved at one web address (for example the AI Studio preview) is not visible to a copy
of the app at another address. See [docs/DATA_SAFETY.md](docs/DATA_SAFETY.md) before moving
between copies.

## Development

Requires Node.js 22.

```bash
npm ci              # install exact dependency versions from package-lock.json
npm run dev         # start the dev server on http://localhost:3000
npm run typecheck   # TypeScript check (tsc --noEmit)
npm test            # unit tests (Vitest)
npm run build       # type-check, then production build into dist/
npm run verify      # everything CI runs: type-check, tests, build
```

`npm run build` runs the type check first, so a build can no longer succeed while hiding
TypeScript errors. GitHub Actions (`.github/workflows/ci.yml`) runs the same checks on every push
and pull request. It only verifies; it never deploys or publishes anything.
