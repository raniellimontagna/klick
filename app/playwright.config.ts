import { defineConfig, devices } from '@playwright/test';

// A porta é fixa (strictPort) e pode ser trocada por KLICK_E2E_PORT: outros projetos da máquina usam a 4321.
const PORT = Number(process.env.KLICK_E2E_PORT ?? 4329);
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: ORIGIN, trace: 'retain-on-failure' },
  webServer: { command: `pnpm build && pnpm preview --port ${PORT} --strictPort --host 127.0.0.1`, url: ORIGIN, reuseExistingServer: false, timeout: 180_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /timer\.spec\.ts/ },
  ],
});
