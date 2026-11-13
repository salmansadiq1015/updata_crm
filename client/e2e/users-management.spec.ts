import { expect, test } from '@playwright/test';

test('user modal passwords, English labels and responsive layout', async ({ page, baseURL }, testInfo) => {
  const origin = baseURL || 'http://localhost:3000';
  const person = { _id: 'user-1', firstName: 'Alex', lastName: 'Morgan', salutation: 'herr', email: 'alex@example.test', status: 'active', role: { _id: 'role-user', name: 'User' }, language: 'en', department: 'Administration', position: 'Mitarbeiter Administration', preferences: {} };
  let passwordUpdate: Record<string, unknown> | undefined;
  let submitted: Record<string, unknown> | undefined;
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'fixture', url: origin }, { name: 'updata-locale', value: 'en', url: origin }]);
  await page.addInitScript(() => { localStorage.setItem('theme', 'dark'); localStorage.setItem('updata-locale', 'en'); });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = []; let pagination;
    if (path === '/auth/refresh') data = { accessToken: 'fixture', refreshToken: 'fixture' };
    else if (path === '/users/me') data = { ...person, _id: 'owner', role: { name: 'Admin' } };
    else if (path === '/roles') data = [{ _id: 'role-user', name: 'User', permissions: [] }];
    else if (path === '/users/stats') data = { total: 1, byStatus: { active: 1 }, roles: 1 };
    else if (path === '/users' && route.request().method() === 'POST') { submitted = route.request().postDataJSON(); data = person; }
    else if (path === '/users') { data = [person]; pagination = { hasNext: false }; }
    else if (path === '/users/user-1') {
      if (route.request().method() === 'PATCH') passwordUpdate = route.request().postDataJSON();
      data = person;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, ...(pagination ? { pagination } : {}) }) });
  });
  await page.goto('/settings/users?action=create');
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('heading', { name: 'New User', exact: true })).toBeVisible({ timeout: 90_000 });
  await modal.getByPlaceholder('Max', { exact: true }).fill('Alex');
  await modal.getByPlaceholder('Muster', { exact: true }).fill('Morgan');
  await modal.getByRole('button', { name: 'Next', exact: true }).click();
  await modal.getByPlaceholder('max.muster@updata.ai').fill('alex@example.test');
  await page.screenshot({ animations: 'disabled', path: `/tmp/updata-user-contact-${testInfo.project.name}.png` });
  for (let i = 0; i < 3; i++) await modal.getByRole('button', { name: 'Next', exact: true }).click();
  await modal.getByLabel('Password', { exact: true }).fill('ChosenCredential123!');
  await modal.getByLabel('Confirm password', { exact: true }).fill('OtherCredential123!');
  await modal.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(modal.getByText('Passwords do not match.')).toBeVisible();
  expect(submitted).toBeUndefined();
  await modal.getByLabel('Confirm password', { exact: true }).fill('ChosenCredential123!');
  await page.screenshot({ animations: 'disabled', path: `/tmp/updata-user-password-${testInfo.project.name}.png` });
  const bounds = await modal.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(modal).not.toContainText(/Schritt|Passwort|Benutzer|Weiter/);
  await modal.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(modal).toBeHidden();
  expect(submitted?.password).toBe('ChosenCredential123!');
  expect(submitted).not.toHaveProperty('confirmPassword');
  await page.getByRole('checkbox').nth(1).check();
  const toolbar = page.getByRole('toolbar', { name: '1 selected' });
  await expect(toolbar.getByRole('button', { name: 'Clear selection' })).toBeVisible();
  await expect(toolbar).not.toContainText(/ausgewählt|Aufheben/);
  await page.screenshot({ animations: 'disabled', path: `/tmp/updata-user-bulk-${testInfo.project.name}.png` });
  await page.goto('/settings/users/user-1');
  await expect(page.getByRole('heading', { name: 'Mr Alex Morgan' })).toBeVisible();
  for (const name of ['Overview', 'Sessions', 'Activity']) await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Administration Employee', { exact: true }).first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/Übersicht|Sitzungen|Aktivität|Mitarbeiter Administration|Inaktiv/);
  await page.screenshot({ animations: 'disabled', path: `/tmp/updata-user-detail-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Edit User', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: '5 Access', exact: true }).click();
  await expect(modal.getByText(/Leave both fields blank/)).toBeVisible();
  await modal.getByLabel('Password', { exact: true }).fill('ReplacementCredential123!');
  await modal.getByLabel('Confirm password', { exact: true }).fill('ReplacementCredential123!');
  await expect(modal).not.toContainText(/Schritt|Passwort|Benutzer|Weiter/);
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).toBeHidden();
  expect(passwordUpdate?.password).toBe('ReplacementCredential123!');
  expect(passwordUpdate).not.toHaveProperty('confirmPassword');

});
