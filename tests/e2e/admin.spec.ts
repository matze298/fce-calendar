import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Debugging: Listen for console logs in the browser
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`BROWSER ${msg.type().toUpperCase()}: ${msg.text()}`);
      }
    });

    // 1. Inject a fake session into LocalStorage *before* the Supabase client initializes
    await page.addInitScript(() => {
      // Supabase uses keys like sb-[project-id]-auth-token
      // We'll set several common ones to be safe
      const keys = [
        'sb-localhost-auth-token', 
        'sb-mock-auth-token', 
        'supabase.auth.token'
      ];
      
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
      
      keys.forEach(key => window.localStorage.setItem(key, JSON.stringify(mockSession)));
      console.log('PLAYWRIGHT: Seeded localStorage with fake session');
    });

    // 2. Mock Supabase Auth /user endpoint
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

    // 3. Mock Profile Check
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
    
    // Explicitly wait for the page to load and ensure we are not on /login
    await page.waitForURL(/\/admin/);
    
    // The h1 in admin is "Admin-Bereich", in login it's "Interner Bereich"
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('Admin-Bereich');
  });

  test('Navigating to Member List and verifying data renders', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL(/\/admin/);
    await expect(page.getByText('Max Mustermann')).toBeVisible();
    await expect(page.getByText('Erika Musterfrau')).toBeVisible();
    await expect(page.getByText('2 Personen')).toBeVisible();
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
    await page.waitForURL(/\/admin/);
    
    const dialogPromise = page.waitForEvent('dialog');
    const generateBtn = page.getByRole('button', { name: 'Planung generieren' });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();
    
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('1 Schichten wurden als Entwurf geplant');
    await dialog.accept();
  });
});
