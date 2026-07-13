import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'PORT=3103 CORS_ORIGINS=http://localhost:5175 pnpm server',
      url: 'http://localhost:3103/api/health',
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'VITE_API_BASE=http://localhost:3103/api pnpm dev --port 5175',
      url: 'http://localhost:5175',
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
