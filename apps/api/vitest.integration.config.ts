import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration-spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Integration tests need real DB round-trips and parallel approvals.
    maxWorkers: 1,
  },
});
