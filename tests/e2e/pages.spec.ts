import { test, expect } from '@playwright/test';

test.describe('Public pages', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/resumora/i);
  });

  test('login page has no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Filter out known noise: network errors (no backend in CI), favicon, Google scripts
    const realErrors = errors.filter(
      (e) =>
        !e.includes('net::ERR') &&
        !e.includes('favicon') &&
        !e.includes('Failed to load resource') &&
        !e.includes('accounts.google'),
    );
    expect(realErrors).toHaveLength(0);
  });

  test('register page has correct fields', async ({ page }) => {
    await page.goto('/register');
    // Use placeholder-based selectors since labels are not associated via htmlFor
    await expect(page.locator('input[placeholder="First"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Last"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('verify-email page loads without crashing', async ({ page }) => {
    await page.goto('/verify-email?token=invalid');
    // Should show some UI, not a blank screen
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Protected pages redirect to login', () => {
  for (const route of ['/dashboard', '/upload', '/resumes', '/analysis', '/history']) {
    test(`${route} redirects unauthenticated users`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL((url) => url.pathname !== route || url.pathname === '/login', { timeout: 8_000 });
      const finalPath = new URL(page.url()).pathname;
      expect(['/login', '/']).toContain(finalPath);
    });
  }
});
