import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const TWENTY_API_URL = process.env.TWENTY_API_URL ?? 'http://localhost:2020';
const TWENTY_API_KEY = process.env.TWENTY_API_KEY ?? '';

// No globalSetup: it syncs the app to the server, and a migration run must not apply anything else.
export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['tsconfig.spec.json'],
      ignoreConfigErrors: true,
    }),
  ],
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    include: ['scripts/*.migration.ts'],
    // The run prints its plan and progress; intercepted, the lines arrive late and under test headers.
    disableConsoleIntercept: true,
    env: {
      TWENTY_API_URL,
      TWENTY_API_KEY,
    },
  },
});
