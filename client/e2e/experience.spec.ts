import { expect, test } from '@playwright/test';

const languages = {
  en: { title: 'Turn every business', faq: 'How do I get access?', start: 'Get started', calling: 'Calling Agents', menu: 'Open navigation' },
  fr: { title: 'Transformez chaque', faq: 'Comment obtenir un accès ?', start: 'Commencer', calling: 'Agents d’appel', menu: 'Ouvrir la navigation' },
  de: { title: 'Machen Sie aus jeder', faq: 'Wie erhalte ich Zugang?', start: 'Jetzt starten', calling: 'Anrufagenten', menu: 'Navigation öffnen' },
  ar: { title: 'حوّل كل فرصة', faq: 'كيف أحصل على الوصول؟', start: 'ابدأ الآن', calling: 'وكلاء الاتصال', menu: 'افتح التنقل' },
};

for (const [locale, copy] of Object.entries(languages)) {
  test(`${locale}: landing navigation, FAQ, localized SSR and responsive layout`, async ({ page, baseURL, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.context().addCookies([{ name: 'updata-locale', value: locale, url: baseURL! }]);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('h1')).toContainText(copy.title);
    await expect(page.locator('h1')).toHaveCSS('opacity', '1');
    // Wait for hydration through a working interaction, rather than a timer.
    if (isMobile) {
      await page.locator('header button[aria-controls="landing-mobile-menu"]').click();
      await expect(page.locator('#landing-mobile-menu')).toBeVisible();
      await page.locator('#landing-mobile-menu a[href="#pricing"]').click();
    } else {
      await page.getByRole('banner').getByRole('button', { name: locale === 'ar' ? 'المنتج' : locale === 'de' ? 'Produkt' : locale === 'fr' ? 'Produit' : 'Product', exact: true }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('a[href*="login"]').filter({ hasText: copy.start }).first()).toHaveAttribute('href', /redirect=/);
    const faq = page.locator('summary').filter({ hasText: copy.faq });
    await faq.scrollIntoViewIfNeeded();
    await faq.click();
    await expect(faq.locator('..')).toHaveAttribute('open', '');
    const missingAnchors = await page.locator('a[href^="#"]').evaluateAll(links => links.map(a => a.getAttribute('href')!).filter(href => href.length > 1 && !document.getElementById(href.slice(1))));
    expect(missingAnchors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `/tmp/updata-landing-${locale}-${test.info().project.name}.png` });
  });

  test(`${locale}: read-only agent workspace uses theme tokens and mirrors navigation`, async ({ page, baseURL, isMobile }) => {
    await page.context().addCookies([
      { name: 'updata-locale', value: locale, url: baseURL! },
      { name: 'mb_refresh_token', value: 'design-fixture', url: baseURL! },
    ]);
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      let data: unknown = [];
      if (path === '/auth/refresh') data = { accessToken: 'design-fixture', refreshToken: 'design-fixture' };
      else if (path === '/users/me') data = { _id: 'design-reader', firstName: 'Design', lastName: 'Reader', email: 'design@example.test', role: { name: 'Reader', permissions: ['lead:read', 'ai-calling:read'] } };
      else if (path === '/ai-calling/agents') data = { agents: [], summary: { agents: 0, activeCampaigns: 0, inProgress: 0, completed: 0, eligible: 0 } };
      else if (path === '/ai-calling/settings') data = { voicePaused: false };
      await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': baseURL!, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' }, body: JSON.stringify({ success: true, data, pagination: { page: 1, pages: 1, total: 0, limit: 24 } }) });
    });
    await page.goto('/ai-calling');
    await expect(page.getByRole('heading', { name: copy.calling, exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('main').getByRole('button').first()).toBeDisabled();
    if (isMobile) {
      await page.getByRole('button', { name: copy.menu, exact: true }).click();
      const sidebar = page.locator('[data-slot="sheet-content"]');
      await expect(sidebar).toBeVisible();
      await expect(sidebar).toHaveAttribute('data-side', locale === 'ar' ? 'right' : 'left');
      await page.keyboard.press('Escape');
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await expect(page.locator('main .updata-agent-panel').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.screenshot({ path: `/tmp/updata-agents-${locale}-${test.info().project.name}.png` });
  });
}

test('hero remains readable before JavaScript loads', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect(page.locator('h1')).toHaveCSS('opacity', '1');
  await expect(page.locator('h1')).toContainText('Turn every business');
  await context.close();
});
