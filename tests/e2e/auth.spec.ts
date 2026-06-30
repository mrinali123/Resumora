import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page loads and shows form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in|log in|welcome/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('register page loads and shows form', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i }).first()).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('nonexistent@test.com');
    await page.getByLabel(/password/i).fill('wrongpassword123');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.getByText(/invalid|incorrect|wrong|not found/i)).toBeVisible({ timeout: 8_000 });
  });

  test('forgot password page loads', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
  });

  test('unauthenticated user is redirected from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login|\/$/);
  });
});
