# API keys and the browser bundle

Everything in `dist/` is public: each visitor's browser downloads it and anyone can read it.
A key placed there is a published key.

## What C0 found

`vite.config.ts` (from the Google AI Studio template) contained:

```ts
define: {
  'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
  'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
},
```

Vite replaces those expressions with the literal value of `GEMINI_API_KEY` at build time. No code
in the app reads either expression today (`services/geminiService.ts` is empty and the AI
components render nothing), so no key was in any build. But the first line of code that used
`process.env.API_KEY` would have copied the private key into the public JavaScript.

## What C0 changed

- Removed the `define` block. No feature used it, so nothing stops working.
- `npm run build` now ends with `npm run check:secrets` (`scripts/check-bundle-secrets.mjs`),
  which scans every file in `dist/` for credential formats (Google/Gemini keys, private key
  blocks, OpenAI, Anthropic, GitHub, AWS keys, Google OAuth secrets) and for the exact value of
  `GEMINI_API_KEY`, `API_KEY`, `GOOGLE_API_KEY` and `SECRET_SCAN_CANARY` if set. Any hit fails the
  build. Findings name the file and rule, never the secret.
- CI builds with fake canary values in those variables, so a setting that leaks them fails CI.
- `.env` and `.env.*` are ignored by git.

Checked locally: putting the old `define` back and reading `process.env.GEMINI_API_KEY` in code
makes the scan fail with `value of GEMINI_API_KEY`.

## AI features later

A Gemini key cannot be kept secret in a browser-only app. If AI features are added, the request
has to go through something that holds the key on a server (for example a small serverless
function), or each user supplies their own key at runtime and stores it only on their device.
That is a separate, reviewed change; C0 removes nothing that works today.

The unused dependencies `@google/genai` and `html5-qrcode` are still in `package.json`. They are
never imported, so they are not in the build.

## Dependency audit (C0, October 2026)

`npm audit --omit=dev` (everything the app ships to browsers): **0 vulnerabilities**.

`npm audit` (including development tools): 10 findings, all in tools that run only on a
developer's machine or in CI. None of their code is in `dist/`; the build outputs only the app's
own CSS, JavaScript and font files.

C0 added PostCSS 8.4.49, which had four advisories (XSS through `</style>` in its output, file
reads through attacker-written `sourceMappingURL` comments). It was raised to 8.5.30 (same major
version, the copy Vite already used). The built files were byte-identical before and after.

Remaining, deliberately deferred:

| Severity | Package (path) | Used for | Why it does not reach the app | Fix |
| --- | --- | --- | --- | --- |
| Critical | `vitest` 3.2.7, `tinypool` 1.1.1 (vitest → tinypool) | Unit tests | Needs attacker control of test-runner worker options; tests are our own code | vitest 4.1.11+ or 5 (major). Already on `main` before C0; planned as a separate dev-tooling PR |
| Moderate | `@vitest/mocker` 3.2.7 (vitest → @vitest/mocker) | Unit tests | Needs attacker-written mock paths | Same vitest upgrade |
| High | `braces` 3.0.3 via `chokidar`, `micromatch`, `fast-glob`; reported again on `tailwindcss` 3.4.17 | CSS build | Denial of service from deeply nested glob patterns; our patterns are fixed in `tailwind.config.js`. Worst case is a hung build | No fixed `braces` or Tailwind 3 release; Tailwind 4 is a major rewrite and would need a new visual review |
| Moderate | `postcss-selector-parser` 6.1.4, `postcss-nested` 6.2.0 (tailwindcss → …) | CSS build | CPU exhaustion from crafted selectors; the only CSS input is our own | Same Tailwind 4 upgrade |

Remaining risk: running the test or build tools on untrusted code (for example a pull request
from someone else) is the only way these could matter, and such code could already run anything
in that job. CI here has read-only repository permissions and no secrets other than fake canary
values. Re-run `npm audit` and `npm audit --omit=dev` before each release.
