import { expect, test, type Page } from '@playwright/test';

const previewUrl = process.env.ORB_PREVIEW_URL || '/login/orb-preview';

async function openPreview(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(previewUrl);
  await expect(page.locator('body')).toHaveAttribute('data-orb-preview-hydrated', 'true', { timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Orb preview', exact: true }).getByRole('img')).toHaveAttribute('data-state', 'idle');
  // Observe actual canvas draws, including animation loops that should stop.
  await page.locator('canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const clear = context.clearRect.bind(context);
    canvas.dataset.draws = '0';
    context.clearRect = (...args) => {
      canvas.dataset.draws = String(Number(canvas.dataset.draws) + 1);
      clear(...args);
    };
  });
  return errors;
}

test('orb renders every conversation state and supports drag and keyboard interaction', async ({ page, isMobile }) => {
  const errors = await openPreview(page);
  const orb = page.getByRole('region', { name: 'Orb preview', exact: true }).getByRole('img');
  const controls = page.getByRole('group', { name: 'Conversation state' });
  for (const [label, state] of [
    ['Connecting', 'connecting'], ['Listening', 'listening'], ['Thinking', 'processing'],
    ['Speaking', 'speaking'], ['Muted', 'muted'], ['Reconnecting', 'reconnecting'],
    ['Disconnected', 'error'], ['Ready', 'idle'],
  ]) {
    await controls.getByRole('button', { name: label, exact: true }).click();
    await expect(orb).toHaveAttribute('data-state', state);
  }
  const box = (await orb.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  if (isMobile) {
    await orb.tap();
    await expect(orb).not.toHaveAttribute('data-dragging');
  } else {
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
    await page.mouse.down();
    await expect(orb).toHaveAttribute('data-dragging', 'true');
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 10 });
    await page.mouse.up();
    await expect(orb).not.toHaveAttribute('data-dragging');
    await orb.focus();
    await expect(orb).toBeFocused();
    await orb.press('ArrowRight');
    await orb.press('Enter');
    await orb.press('Home');
    await expect(orb).toHaveAttribute('data-state', 'idle');
  }

  const nonEmpty = await page.locator('canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return data.some((channel, index) => index % 4 === 3 && channel > 100);
  });
  expect(nonEmpty).toBe(true);
  expect(errors).toEqual([]);
});

test('pause and system reduced motion stop continuous canvas drawing while states still update', async ({ page }) => {
  const errors = await openPreview(page);
  const orb = page.getByRole('region', { name: 'Orb preview', exact: true }).getByRole('img');
  const canvas = page.locator('canvas');
  const draws = () => canvas.getAttribute('data-draws');
  await expect.poll(async () => Number(await draws())).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Pause orb animation' }).click();
  await expect(orb).toHaveAttribute('data-motion', 'reduced');
  await expect(orb).not.toHaveAttribute('tabindex');
  await page.waitForTimeout(100);
  const pausedDraws = await draws();
  await page.waitForTimeout(180);
  expect(await draws()).toBe(pausedDraws);
  await page.getByRole('button', { name: 'Speaking', exact: true }).click();
  await expect(orb).toHaveAttribute('data-state', 'speaking');
  await orb.scrollIntoViewIfNeeded();
  await expect.poll(async () => Number(await draws())).toBeGreaterThan(Number(pausedDraws));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Enable orb animation' }).click();
  await expect(orb).toHaveAttribute('data-motion', 'reduced');
  await page.waitForTimeout(100);
  const reducedDraws = await draws();
  await page.waitForTimeout(180);
  expect(await draws()).toBe(reducedDraws);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(orb).toHaveAttribute('data-motion', 'full');
  await expect.poll(async () => Number(await draws())).toBeGreaterThan(Number(reducedDraws) + 2);
  expect(errors).toEqual([]);
});

test('conversation demo advances and a manual state selection stops the demo', async ({ page }) => {
  await openPreview(page);
  await page.getByRole('button', { name: 'Play conversation demo' }).click();
  await expect(page.getByRole('region', { name: 'Orb preview', exact: true }).getByRole('img')).toHaveAttribute('data-state', 'connecting');
  await expect(page.getByRole('region', { name: 'Orb preview', exact: true }).getByRole('img')).toHaveAttribute('data-state', 'listening', { timeout: 5000 });
  await page.getByRole('button', { name: 'Muted', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Orb preview', exact: true }).getByRole('img')).toHaveAttribute('data-state', 'muted');
  await expect(page.getByRole('button', { name: 'Play conversation demo' })).toHaveAttribute('aria-pressed', 'false');
});
