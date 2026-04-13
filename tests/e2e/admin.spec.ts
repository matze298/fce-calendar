import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Inject a fake session into LocalStorage
    await page.addInitScript(() => {
      const mockSession = {
        access_token: 'fake-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fake-refresh',
        user: { 
          id: 'mock-user-id', 
          email: 'admin@fce.de',
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      };

      const originalGetItem = window.localStorage.getItem;
      window.localStorage.getItem = function(key) {
        if (key && (key.includes('auth-token') || key === 'supabase.auth.token')) {
          return JSON.stringify(mockSession);
        }
        return originalGetItem.apply(this, arguments as any);
      };
    });

    // 2. Mock Supabase Auth
    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          user: { id: 'mock-user-id', email: 'admin@fce.de' },
          access_token: 'fake-token'
        }),
      });
    });

    // 3. Mock Profile Check
    await page.route(url => url.href.includes('/rest/v1/members') && url.search.includes('select=is_admin'), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ is_admin: true, is_approved: true }),
      });
    });

    // 4. Mock Members List
    await page.route(url => url.href.includes('/rest/v1/members') && url.search.includes('select=*'), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '1', name: 'Max Mustermann', email: 'max@fce.de', seniority_level: 'Senior', historical_shifts: 5, is_approved: true },
          { id: '2', name: 'Erika Musterfrau', email: 'erika@fce.de', seniority_level: 'Standard', historical_shifts: 2, is_approved: true },
        ]),
      });
    });

    // 5. Mock Work Dates
    await page.route(url => url.href.includes('/rest/v1/work_dates'), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '101', date: '2024-05-01', required_people: 1, is_important_shift: true, is_weekend: false },
        ]),
      });
    });

    // 6. Mock Assignments
    await page.route(url => url.href.includes('/rest/v1/assignments'), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('Admin Login flow and dashboard access', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Admin-Bereich');
  });

  test('Navigating to Member List and verifying data renders', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('body')).toContainText('Max Mustermann', { timeout: 15000 });
    await expect(page.locator('body')).toContainText('Erika Musterfrau');
    await expect(page.locator('body')).toContainText('2 Personen');
  });

  test('Clicking "Generate Schedule" and verifying UI updates', async ({ page }) => {
    await page.route('**/api/generate', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', assignments_count: 1 }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/admin');
    const dialogPromise = page.waitForEvent('dialog');
    const generateBtn = page.getByRole('button', { name: 'Planung generieren' });
    await generateBtn.click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('1 Schichten wurden als Entwurf geplant');
    await dialog.accept();
  });
});
