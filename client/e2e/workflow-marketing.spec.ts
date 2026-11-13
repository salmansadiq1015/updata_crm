import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'updata-locale', value: 'en', url: 'http://localhost' }]);
});

test('homepage automation preview leads to the public detail page', async ({ page }) => {
  await page.goto('/');
  const section = page.locator('#workflow-automation');
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('heading', { level: 2 })).toBeVisible();
  await expect(section.getByRole('tab', { name: 'Email → AI follow-up' })).toBeVisible();
  await section.getByRole('link', { name: /Explore more/ }).click();
  await expect(page).toHaveURL(/\/workflow-automation$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Workflow automation.');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://updata-crm.vercel.app/workflow-automation');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /connected-workflows-social.webp/);
  const data = await page.locator('script[type="application/ld+json"]').evaluateAll(scripts => scripts.map(script => JSON.parse(script.textContent || '{}')));
  expect(data.some(item => item['@graph']?.some((entry: Record<string, unknown>) => entry['@type'] === 'FAQPage'))).toBe(true);
});

test('workflow controls, scenario keyboard navigation and email preview work without signing in', async ({ page }) => {
  await page.goto('/workflow-automation');
  const demo = page.getByTestId('workflow-demo');
  await demo.scrollIntoViewIfNeeded();
  await demo.getByRole('button', { name: 'Pause workflow animation' }).click();
  await demo.getByRole('tab', { name: 'AI lead qualification' }).focus();
  await page.keyboard.press('End');
  await expect(demo.getByRole('tab', { name: 'Email → AI follow-up' })).toBeFocused();
  await expect(demo.getByRole('tab', { name: 'Email → AI follow-up' })).toHaveAttribute('aria-selected', 'true');
  await demo.getByRole('button', { name: 'Next workflow step' }).click();
  await expect(demo.getByRole('heading', { name: 'Start with a useful email' })).toBeVisible();
  await demo.getByRole('button', { name: 'Step 7: Publish with intention', exact: true }).click();
  await expect(demo.getByRole('heading', { name: 'Publish with intention' })).toBeVisible();
  await expect(demo.getByRole('button', { name: 'Next workflow step' })).toBeDisabled();
  await demo.getByRole('button', { name: 'Restart workflow preview' }).click();
  await expect(demo.getByRole('heading', { name: 'Give new contacts a clear path' })).toBeVisible();
  await page.getByRole('button', { name: '02 · Review' }).click();
  await expect(page.getByRole('heading', { name: 'Your message. Your final say.' })).toBeVisible();
  await page.getByRole('button', { name: '03 · Follow up' }).click();
  await expect(page.getByRole('heading', { name: 'Keep the next conversation in view' })).toBeVisible();
  await page.getByText('Can I test a workflow before it sends real messages?', { exact: true }).click();
  await expect(page.locator('details[open]')).toContainText('without sending real messages');
  const emailLink = page.getByRole('link', { name: 'Explore your email workspace' });
  await expect(emailLink).toHaveAttribute('href', '/login?redirect=%2Femail');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('reduced motion keeps the walkthrough manual and narrow layouts remain usable', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/workflow-automation');
  const demo = page.getByTestId('workflow-demo');
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute('data-running', 'false');
  await expect(demo.getByRole('button', { name: 'Pause workflow animation' })).toHaveCount(0);
  await demo.getByRole('button', { name: 'Next workflow step' }).click();
  await expect(demo.getByRole('heading', { name: 'Make the first connection' })).toBeVisible();
  await page.getByRole('button', { name: /Open navigation menu|Navigationsmenü öffnen/ }).click();
  await page.getByRole('dialog').getByRole('link', { name: /Workflow Automation|Workflow-Automatisierung/ }).click();
  await expect(page).toHaveURL(/\/workflow-automation$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(browserErrors).toEqual([]);
});
