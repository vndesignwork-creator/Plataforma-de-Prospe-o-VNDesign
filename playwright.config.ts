import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Lê E2E_* de apps/web/.env.local (se existir) para não ter de as exportar à mão.
if (existsSync('apps/web/.env.local')) {
  for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(E2E_[A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * Testes dos fluxos principais. Precisam de:
 *  - Supabase a correr (npx supabase start) e um utilizador de teste
 *    (npm run create-user -- --email … --password …);
 *  - E2E_EMAIL e E2E_PASSWORD definidos (ver .env.example).
 * Se E2E_BASE_URL não estiver definido, o Playwright arranca `npm run dev`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 45_000,
  use: {
    baseURL,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
        permissions: ['clipboard-read', 'clipboard-write'],
      },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.ts/, /mobile\.spec\.ts/],
    },
    {
      name: 'mobile',
      use: { ...devices['Galaxy S9+'], browserName: 'chromium', storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
