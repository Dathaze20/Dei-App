import { defineConfig } from 'vitest/config';

// Unit and component tests. Browser (Playwright) tests live in e2e/ and run separately.
export default defineConfig({
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
  },
});
