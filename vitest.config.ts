import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Lightweight, kept regression-test config (Decision Log C70) -- unit
// tests only, no DB/network access, so it runs unconditionally in CI.
// Deliberately not a "testing platform": one config, no plugins beyond
// the @ alias this repo's tsconfig already uses everywhere else.
export default defineConfig({
  test: {
    environment: 'node',
    // test/: flow tests that swap Supabase Auth and Postgres for in-memory
    // stand-ins (C95); kept outside src/ so nothing there ships or reads as data.
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Many tests build a whole database from the migrations (PGlite) inside one test, which takes seconds and grows with
    // every migration; under the full suite's parallel load the 5-second default failed them at random (C230-U). A hung
    // test still fails, at 30 seconds.
    testTimeout: 30_000,
  },
  // Components (.tsx) use the automatic JSX runtime, as Next.js does, so
  // render tests can load them without importing React.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
