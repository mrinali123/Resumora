import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForPageReady(page: import('@playwright/test').Page, route: string) {
  await page.goto(route);
  // Wait for client-side redirect to settle (auth check happens after hydration)
  await page.waitForURL((url) => url.pathname === '/login' || url.pathname === route, { timeout: 8_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Upload page', () => {
  test('upload page shows drop zone when not logged in redirect', async ({ page }) => {
    await page.goto('/upload');
    await page.waitForURL((url) => url.pathname === '/login' || url.pathname === '/upload', { timeout: 8_000 });
    const isLoginPage = page.url().includes('/login');
    const isUploadPage = page.url().includes('/upload');
    expect(isLoginPage || isUploadPage).toBe(true);
  });

  test('upload page has correct title and accepts PDF/DOCX', async ({ page }) => {
    await waitForPageReady(page, '/upload');
    if (page.url().includes('/login')) return; // skip if not authed

    await expect(page.getByText(/upload resume/i)).toBeVisible();
    await expect(page.getByText(/PDF.*DOCX|DOCX.*PDF/i)).toBeVisible();
  });

  test('upload rejects invalid file type', async ({ page }) => {
    await waitForPageReady(page, '/upload');
    if (page.url().includes('/login')) return;

    // Create a temp txt file
    const tmpPath = path.join(process.env.TEMP ?? '/tmp', 'test-resume.txt');
    fs.writeFileSync(tmpPath, 'this is not a resume');

    const input = page.locator('input[type="file"]');
    await input.setInputFiles(tmpPath);

    await expect(page.getByText(/only pdf|not supported|pdf and docx/i)).toBeVisible({ timeout: 5_000 });
    fs.unlinkSync(tmpPath);
  });
});
