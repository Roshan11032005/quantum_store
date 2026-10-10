import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

test('landing page loads and shows register button', async ({ page }) => {
  await page.goto(BASE_URL);
  await expect(page.getByRole('link', { name: /register/i }).first()).toBeVisible();
  await expect(page.getByText(/quantum-resistant/i)).toBeVisible();
});

test('register page renders form', async ({ page }) => {
  await page.goto(`${BASE_URL}/register`);
  await expect(page.getByLabel(/username/i)).toBeVisible();
  await expect(page.getByLabel(/passphrase/i).first()).toBeVisible();
});

test('login redirects to login when unauthenticated', async ({ page }) => {
  await page.goto(`${BASE_URL}/dashboard`);
  await expect(page).toHaveURL(/login/);
});
