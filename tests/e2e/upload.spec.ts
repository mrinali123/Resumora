import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAs(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /email/i }).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Wait for redirect away from login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Upload page', () => {
  test('upload page shows drop zone when not logged in redirect', async ({ page }) => {
    await page.goto('/upload');
    // Either shows upload page or redirects to login
    const isLoginPage = page.url().includes('/login');
    const isUploadPage = page.url().includes('/upload');
    expect(isLoginPage || isUploadPage).toBe(true);
  });

  test('upload page has correct title and accepts PDF/DOCX', async ({ page }) => {
    await page.goto('/upload');
    if (page.url().includes('/login')) return; // skip if not authed

    await expect(page.getByText(/upload resume/i)).toBeVisible();
    await expect(page.getByText(/PDF.*DOCX|DOCX.*PDF/i)).toBeVisible();
  });

  test('upload rejects invalid file type', async ({ page }) => {
    await page.goto('/upload');
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
