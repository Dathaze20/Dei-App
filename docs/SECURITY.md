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
