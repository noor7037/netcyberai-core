import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Lightweight, kept regression-test config (Decision Log C70) -- unit
// tests only, no DB/network access, so it runs unconditionally in CI.
// Deliberately not a "testing platform": one config, no plugins beyond
// the @ alias this repo's tsconfig already uses everywhere else.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
