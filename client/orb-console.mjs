import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (message) => console.log(`console:${message.type()}: ${message.text()}`));
page.on('pageerror', (error) => console.log(`pageerror: ${error.stack || error.message}`));
page.on('requestfailed', (request) => console.log(`requestfailed: ${request.url()} · ${request.failure()?.errorText}`));
await page.goto('http://127.0.0.1:3000/login/orb-preview', { waitUntil: 'networkidle' });
console.log(await page.locator('canvas').first().evaluate((canvas) => ({
  width: canvas.width,
  height: canvas.height,
  rect: canvas.getBoundingClientRect().toJSON(),
  userAgent: navigator.userAgent,
  hasContext: Boolean(canvas.getContext('2d')),
  hydrated: document.body.dataset.orbPreviewHydrated,
} )));
await page.waitForTimeout(1000);
await browser.close();
