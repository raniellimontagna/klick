import { defineConfig, devices } from '@playwright/test';

// Porta do servidor de testes (strictPort). KLICK_E2E_PORT a troca, desde que seja um número de porta válido (1 a 65535).
const DEFAULT_PORT = 4329;
const envPort = process.env.KLICK_E2E_PORT ?? '';
const PORT = /^\d{1,5}$/.test(envPort) && Number(envPort) >= 1 && Number(envPort) <= 65535 ? Number(envPort) : DEFAULT_PORT;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: ORIGIN, trace: 'retain-on-failure' },
  webServer: { command: `pnpm build && pnpm preview --port ${PORT} --strictPort --host 127.0.0.1`, url: ORIGIN, reuseExistingServer: false, timeout: 180_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /(timer|sessions|trilha)\.spec\.ts/ },
  ],
});
