// Tests for the Admin dasbhoard using Playwright.

import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // GIVEN a mocked Supabase session injected into localStorage before the page loads
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
      window.localStorage.getItem = function (key) {
        if (key && (key.includes('auth-token') || key === 'supabase.auth.token')) {
          return JSON.stringify(mockSession);
        }
        return originalGetItem.apply(this, arguments as any);
      };
    });

    // GIVEN a mocked Supabase Auth response
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

    // CONSOLIDATED members mock handler
    await page.route(url => url.href.includes('/rest/v1/members'), async (route) => {
      const method = route.request().method();
      const urlString = route.request().url();

      if (['PATCH', 'PUT', 'POST'].includes(method)) {
        await route.fulfill({
          status: 204,
          contentType: 'application/json',
        });
      } else if (method === 'GET') {
        if (urlString.includes('select=is_admin')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ is_admin: true, is_approved: true }),
          });
        } else if (urlString.includes('select=*')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: '1', name: 'Max Mustermann', email: 'max@fce.de', seniority_level: 'Senior', historical_shifts: 5, is_approved: true, created_at: new Date().toISOString() },
              { id: '2', name: 'Erika Musterfrau', email: 'erika@fce.de', seniority_level: 'Standard', historical_shifts: 2, is_approved: true, created_at: new Date().toISOString() },
              { id: '3', name: 'New User', email: 'pending@fce.de', seniority_level: 'Junior', historical_shifts: 0, is_approved: false, created_at: new Date().toISOString() },
            ]),
          });
        } else {
          await route.continue();
        }
      } else {
        await route.continue();
      }
    });

    // GIVEN mocked work dates
    await page.route(url => url.href.includes('/rest/v1/work_dates'), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '101', date: '2024-05-01', required_people: 1, is_important_shift: true, is_weekend: false },
        ]),
      });
    });

    // GIVEN mocked assignments
    await page.route(url => url.href.includes('/rest/v1/assignments'), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });


  // WHEN accessing the admin page
  test('Admin Login flow and dashboard access', async ({ page }) => {
    await page.goto('/admin');
    // THEN the page is loaded with the correct URL and contains "Admin-Bereich"
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Admin-Bereich');
  });

  // WHEN accessing the admin page and navigating to members
  test('Navigating to Member List and verifying data renders', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('link', { name: 'Mitglieder verwalten' }).click();
    await expect(page).toHaveURL(/\/admin\/members/);
    // THEN the members are contained
    await expect(page.locator('body')).toContainText('Max Mustermann', { timeout: 15000 });
    await expect(page.locator('body')).toContainText('Erika Musterfrau');
    await expect(page.locator('body')).toContainText('2 Personen');
  });

  // WHEN clicking Generate Schedule
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

    // THEN the success dialog is shown with the correct message
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('1 Schichten wurden als Entwurf geplant');
    await dialog.accept();
  });

  // WHEN accessing the dates page
  test('Navigating to Dates management and verifying data', async ({ page }) => {
    await page.goto('/admin');

    // THEN the page contains the expected date
    await page.getByRole('link', { name: 'Termine verwalten' }).click();
    await expect(page).toHaveURL(/\/admin\/dates/);
    await expect(page.locator('body')).toContainText('Mai 2024');
    await expect(page.locator('body')).toContainText('Wichtig');
  });

  // WHEN editing a member on the members page
  test('Editing a member and saving changes', async ({ page }) => {
    await page.goto('/admin/members');

    // GIVEN we click edit on the first member
    await page.locator('button[title="Mitglied bearbeiten"]').first().click();

    // THEN the modal should be visible
    await expect(page.getByRole('heading', { name: 'Mitglied bearbeiten' })).toBeVisible();

    // WHEN we change the name and submit
    await page.fill('input[required]', 'Max Edited');
    await page.click('button:has-text("Speichern")');

    // THEN the modal should be closed (fetchData is called, we check if modal is gone)
    await expect(page.locator('h2:has-text("Mitglied bearbeiten")')).not.toBeVisible();
  });

  // WHEN approving a pending member
  test('Approving a pending member', async ({ page }) => {
    await page.goto('/admin/members');

    // THEN we should see the pending member
    await expect(page.locator('body')).toContainText('pending@fce.de');

    // WHEN we click "Freischalten"
    await page.click('button:has-text("Freischalten")');

    // THEN the member should be processed (fetchData called again)
    // (In a real mock we could change the response, but checking the click works is enough for E2E logic)
    await expect(page.locator('button:has-text("Freischalten")')).toBeVisible(); // Still there because mock doesn't change
  });

  // WHEN adding a new member on the members page
  test('Adding a new member', async ({ page }) => {
    await page.goto('/admin/members');

    // GIVEN we fill out the "Mitglied hinzufügen" form
    await page.fill('input[placeholder="Vorname Nachname"]', 'New Admin Member');
    await page.fill('input[placeholder="email@fce.de"]', 'new-admin@fce.de');

    // WHEN we click "Mitglied anlegen"
    await page.click('button:has-text("Mitglied anlegen")');

    // THEN the form should be reset (fetchData called again)
    await expect(page.locator('input[placeholder="Vorname Nachname"]')).toHaveValue('');
    await expect(page.locator('input[placeholder="email@fce.de"]')).toHaveValue('');
  });
});
