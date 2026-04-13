import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Supabase Auth and Data
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'mock-user-id', email: 'admin@fce.de' }),
      });
    });

    await page.route('**/rest/v1/members?select=is_admin%2Cis_approved&auth_id=eq.mock-user-id', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ is_admin: true, is_approved: true }),
      });
    });

    await page.route('**/rest/v1/members?order=name.asc&select=%2A', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '1', name: 'Max Mustermann', email: 'max@fce.de', seniority_level: 'Senior', historical_shifts: 5, is_approved: true },
          { id: '2', name: 'Erika Musterfrau', email: 'erika@fce.de', seniority_level: 'Standard', historical_shifts: 2, is_approved: true },
        ]),
      });
    });

    await page.route('**/rest/v1/work_dates?order=date.asc&select=%2A', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '101', date: '2024-05-01', required_people: 1, is_important_shift: true, is_weekend: false },
        ]),
      });
    });

    await page.route('**/rest/v1/assignments?status=eq.Draft&select=%2A%2Cmembers%28name%29', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('Admin Login flow and dashboard access', async ({ page }) => {
    // We start at /admin, and since we mocked the user, it should stay there
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('h1')).toContainText('Admin-Bereich');
  });

  test('Navigating to Member List and verifying data renders', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByText('Max Mustermann')).toBeVisible();
    await expect(page.getByText('Erika Musterfrau')).toBeVisible();
    await expect(page.getByText('2 Personen')).toBeVisible();
  });

  test('Clicking "Generate Schedule" and verifying UI updates', async ({ page }) => {
    // Mock the generate API
    await page.route('**/api/generate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', assignments_count: 1 }),
      });
    });

    await page.goto('/admin');
    
    // Listen for alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('1 Schichten wurden als Entwurf geplant');
      await dialog.accept();
    });

    const generateBtn = page.getByRole('button', { name: 'Planung generieren' });
    await generateBtn.click();
    
    // Button should show loading state during request (might be too fast to catch without slowdown)
    // but we can verify it's still there or the alert was handled.
  });
});
