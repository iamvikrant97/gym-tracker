import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Playwright's own Chromium download may be blocked; fall back to a system Chrome when present.
const SYSTEM_CHROME = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
const executablePath = process.env.PW_CHROME ?? SYSTEM_CHROME;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    baseURL: 'http://localhost:4173/gym-tracker/',
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
    serviceWorkers: 'block', // page.route must see the Apps Script calls
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'mobile-chrome', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/gym-tracker/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
