import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// VITE_BASE lets the site live under a sub-path (for example "/algorithm-health/").
// Nothing in this repo deploys it; see DECISIONS.md.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 60_000,
  },
});
