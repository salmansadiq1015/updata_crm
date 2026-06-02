const { chromium } = require('./node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(__dirname, '../.screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  const screenshots = [];

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const snap = async (name, label) => {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    screenshots.push({ file, label });
    console.log(`  ✓ ${label}`);
  };

  // Login
  console.log('\n→ Logging in...');
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'admin@appnity.ch');
  await page.fill('input[type="password"]', 'admin121');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await snap('01_sidebar_dashboard', 'Sidebar + Dashboard');

  // CRM Customers list
  console.log('→ CRM pages...');
  await page.goto('http://localhost:3000/crm/customers');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await snap('02_customers_list', 'CRM Customers list');

  // Open Create Customer modal
  const addBtn = page.locator('button').filter({ hasText: /neu|new|add|erstellen|create|hinzuf/i }).first();
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(1500);
    await snap('03_customer_modal', 'Customer create modal');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }

  // Customer detail (click first row)
  await page.goto('http://localhost:3000/crm/customers');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const firstCustomerLink = page.locator('a[href*="/crm/customers/"], tr[data-href], tbody tr').first();
  const linkHref = await firstCustomerLink.getAttribute('href').catch(() => null);
  if (linkHref) {
    await page.goto(`http://localhost:3000${linkHref}`);
  } else {
    await firstCustomerLink.click();
  }
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await snap('04_customer_detail', 'Customer detail page');

  // Sites
  await page.goto('http://localhost:3000/crm/sites');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await snap('05_sites', 'CRM Sites');

  // Installations
  await page.goto('http://localhost:3000/crm/installations');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await snap('06_installations', 'CRM Installations');

  // Maintenance
  await page.goto('http://localhost:3000/crm/maintenance');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await snap('07_maintenance', 'CRM Maintenance');

  // Contacts
  await page.goto('http://localhost:3000/crm/contacts');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await snap('08_contacts', 'CRM Contacts');

  // Newsletters
  await page.goto('http://localhost:3000/crm/newsletters');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await snap('09_newsletters', 'CRM Newsletters');

  // Spare parts / Procurement
  await page.goto('http://localhost:3000/crm/spare-parts/procurement');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await snap('10_procurement', 'Spare Parts Procurement');

  await browser.close();

  console.log('\n═══════════════════════════════════════');
  console.log('  Visual walkthrough complete!');
  console.log(`  Saved ${screenshots.length} screenshots to: ${outDir}`);
  console.log('═══════════════════════════════════════\n');
  screenshots.forEach(({ file, label }) => console.log(`  ${label}\n  → ${file}\n`));
})().catch(err => {
  console.error('\n✗ FAILED:', err.message);
  process.exit(1);
});
