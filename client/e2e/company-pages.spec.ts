import { expect, test } from '@playwright/test';

const pages = ['about', 'contact', 'support', 'privacy', 'terms', 'security'];
const names: Record<string, string[]> = {
  en: ['About', 'Contact', 'Support', 'Privacy', 'Terms', 'Security'],
  fr: ['À propos', 'Contact', 'Assistance', 'Confidentialité', 'Conditions', 'Sécurité'],
  de: ['Über uns', 'Kontakt', 'Support', 'Datenschutz', 'Bedingungen', 'Sicherheit'],
  ar: ['عن Updata', 'تواصل معنا', 'الدعم', 'الخصوصية', 'الشروط', 'الأمان'],
};

for (const locale of ['en', 'fr', 'de', 'ar']) {
  test(`${locale}: company and policy pages have working links, metadata and responsive layouts`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.context().addCookies([{ name: 'updata-locale', value: locale, url: baseURL! }]);
    for (const [index, path] of pages.entries()) {
      const response = await page.goto(`/${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await expect(page).toHaveTitle(`${names[locale][index]} — Updata`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('h1')).not.toContainText('company.');
      await expect(page.locator(`main nav a[href="/${path}"]`).first()).toHaveAttribute('aria-current', 'page');
      for (const destination of pages) await expect(page.locator(`footer a[href="/${destination}"]`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      await page.screenshot({ path: `/tmp/updata-company-${path}-${locale}-${test.info().project.name}.png` });
    }
    expect(errors).toEqual([]);
  });
}

test('support topics filter and search; contact form validates without sending data', async ({ page }) => {
  await page.goto('/support');
  const search = page.getByRole('searchbox', { name: 'Search help topics' });
  await search.fill('unmatched-query-xyz');
  await expect(page.getByRole('heading', { name: 'No matching topics' })).toBeVisible();
  await search.clear();
  await page.getByRole('button', { name: 'AI calling', exact: true }).click();
  await expect(page.locator('main details')).toHaveCount(1);
  await page.locator('main summary').click();
  await expect(page.locator('main details')).toHaveAttribute('open', '');
  await expect(page.getByRole('link', { name: /Sign in to request support/ })).toHaveAttribute('href', '/login?redirect=%2Fsupport');
  await page.goto('/contact');
  const form = page.locator('main form');
  expect(await form.evaluate((node: HTMLFormElement) => node.checkValidity())).toBe(false);
  await page.getByLabel('Your name', { exact: true }).fill('Design QA');
  await page.getByLabel('Work email', { exact: true }).fill('qa@example.test');
  await page.getByLabel('Your message', { exact: true }).fill('Please share the current product information.');
  expect(await form.evaluate((node: HTMLFormElement) => node.checkValidity())).toBe(true);
  await expect(page.getByText('Opens a draft in your email app. This page does not send or store your message.')).toBeVisible();
});

test('authenticated support uses the existing ticket endpoint and closes after success', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'company-test', url: baseURL! }]);
  const submitted: string[] = [];
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/refresh') data = { accessToken: 'company-test', refreshToken: 'company-test' };
    else if (path === '/users/me') data = { _id: 'support-reader', firstName: 'Support', email: 'support@example.test', role: { name: 'Reader', permissions: [] } };
    else if (path === '/support' && request.method() === 'POST') { submitted.push(request.postData() || ''); data = { _id: 'ticket-test', status: 'open' }; }
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': baseURL!, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, OPTIONS' }, body: JSON.stringify({ success: true, data }) });
  });
  await page.goto('/support');
  await page.getByRole('button', { name: 'Create a support ticket', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Report a problem' });
  await dialog.getByLabel('Subject', { exact: true }).fill('Test support request');
  await dialog.getByLabel('Description', { exact: true }).fill('A test of the existing support endpoint from the new help page.');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).toContain('Test support request');
  expect(submitted[0]).toContain('originPlatform');
  await expect(dialog).toHaveCount(0);
});
