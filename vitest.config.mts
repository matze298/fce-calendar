import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Scoped to tests/unit so the Playwright specs in tests/e2e are not collected.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': new URL('.', import.meta.url).pathname,
    },
  },
});
