// Gera os PNGs do PWA a partir de public/icon.svg, com o Chromium do Playwright (pnpm exec playwright install chromium).
// Rode uma vez e commite os PNGs: o build não depende deste script.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const root = new URL('../public/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', root), 'utf8');
const OUTPUTS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size } of OUTPUTS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`,
    );
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(new URL(file, root), png);
    console.log(`${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
