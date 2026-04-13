import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Inject a fake session into LocalStorage *before* the Supabase client initializes
    // This is much more reliable than cookies for @supabase/supabase-js.
    await page.addInitScript(() => {
      const storageKey = 'sb-localhost-auth-token'; // Default key for dev
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
      window.localStorage.setItem(storageKey, JSON.stringify(mockSession));
    });

    // 2. Mock Supabase Auth /user endpoint (used by supabase.auth.getUser())
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          user: { 
            id: 'mock-user-id', 
            email: 'admin@fce.de',
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
          } 
        }),
      });
    });

    // 3. Mock Profile Check (the .single() call in app/admin/page.tsx)
    await page.route('**/rest/v1/members?select=is_admin%2Cis_approved&auth_id=eq.mock-user-id', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ is_admin: true, is_approved: true }),
      });
    });

    // 4. Mock Members List
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

    // 5. Mock Work Dates
    await page.route('**/rest/v1/work_dates?order=date.asc&select=%2A', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '101', date: '2024-05-01', required_people: 1, is_important_shift: true, is_weekend: false },
        ]),
      });
    });

    // 6. Mock Assignments
    await page.route('**/rest/v1/assignments?status=eq.Draft&select=%2A%2Cmembers%28name%29', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('Admin Login flow and dashboard access', async ({ page }) => {
    await page.goto('/admin');
    
    // Explicitly wait for the page to load and not be redirected
    await page.waitForURL(/\/admin/);
    
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('Admin-Bereich');
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
    
    // Setup dialog listener before clicking
    const dialogPromise = page.waitForEvent('dialog');
    
    const generateBtn = page.getByRole('button', { name: 'Planung generieren' });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();
    
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('1 Schichten wurden als Entwurf geplant');
    await dialog.accept();
  });
});
