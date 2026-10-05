import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Move scripts change data on the server named by TWENTY_API_URL. There is no
// globalSetup on purpose: the integration setup syncs the app to that server,
// which is an apply. Always name the script to run.
export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['tsconfig.spec.json'],
      ignoreConfigErrors: true,
    }),
  ],
  test: {
    testTimeout: 1_800_000,
    fileParallelism: false,
    include: ['scripts/*.move.ts'],
    // A move prints its plan and progress; intercepted, the lines arrive late and under test headers.
    disableConsoleIntercept: true,
    env: {
      TWENTY_API_URL: process.env.TWENTY_API_URL ?? '',
      TWENTY_API_KEY: process.env.TWENTY_API_KEY ?? '',
    },
  },
});
