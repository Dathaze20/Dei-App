import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No server-side secrets are passed into the browser bundle. Anything placed in `define` (or in a
// VITE_-prefixed env variable) is copied into public JavaScript that anyone can read, so API keys
// must never be wired in here. `npm run check:secrets` scans the production build for leaks.
export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
