import { defineConfig, devices } from '@playwright/test';

// Before/after screenshots of the existing screens (see visual/README.md). Not part of
// `npm run test:e2e`: CI runs it once against `main`'s build and once against this branch's.
//   VISUAL_DIST   build folder to serve (default dist)
//   VISUAL_LABEL  output sub-folder, e.g. before / after (default after)
const PORT = Number(process.env.VISUAL_PORT ?? 4180);

export default defineConfig({
  testDir: 'visual',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    {
      name: 'galaxy-a17',
      use: {
        ...devices['Galaxy S9+'],
        browserName: 'chromium',
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        colorScheme: 'light',
      },
    },
  ],
  webServer: {
    command: `npx vite preview --outDir ${process.env.VISUAL_DIST ?? 'dist'} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
});
