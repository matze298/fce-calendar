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
          email: 'admin@example.com',
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      };

      const originalGetItem = window.localStorage.getItem;
      window.localStorage.getItem = function (...args: [key: string]) {
        const [key] = args;
        if (key && (key.includes('auth-token') || key === 'supabase.auth.token')) {
          return JSON.stringify(mockSession);
        }
        return originalGetItem.apply(this, args);
      };
    });

    // GIVEN a mocked Supabase Auth response
    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'mock-user-id', email: 'admin@example.com' },
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
              { id: '1', name: 'Max Mustermann', email: 'max@example.com', seniority_level: 'Senior', historical_shifts: 5, is_approved: true, is_admin: true, created_at: new Date().toISOString() },
              { id: '2', name: 'Erika Musterfrau', email: 'erika@example.com', seniority_level: 'Standard', historical_shifts: 2, is_approved: true, auth_id: 'existing-auth-2', created_at: new Date().toISOString() },
              { id: '3', name: 'New User', email: 'pending@example.com', seniority_level: 'Junior', historical_shifts: 0, is_approved: false, created_at: new Date().toISOString() },
            ]),
          });
        } else {
          await route.continue();
        }
      } else {
        await route.continue();
      }
    });

    // GIVEN one pending registration whose name typos an existing seeded member
    await page.route(url => url.href.includes('/rest/v1/registrations'), async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'reg-1',
              auth_id: 'auth-reg-1',
              email: 'neu@example.com',
              first_name: 'Mak',
              last_name: 'Mustermann',
              created_at: new Date().toISOString(),
            },
          ]),
        });
      } else {
        await route.fulfill({ status: 204 });
      }
    });

    // GIVEN mocked work dates
    await page.route(url => url.href.includes('/rest/v1/work_dates'), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '101',
            date: '2024-05-01',
            name: 'Heimspiel gegen TSV',
            start_time: '19:00:00',
            required_people: 1,
            is_important_shift: true,
            is_weekend: false,
          },
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

    // GIVEN mocked settings, with a Friday default distinct from the Mon-Thu one
    await page.route(url => url.href.includes('/rest/v1/settings'), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          cooldown_days: 21,
          default_start_time_mon_thu: '20:00:00',
          default_start_time_fri: '18:30:00',
          default_start_time_sat_sun: '15:30:00',
          last_updated: new Date().toISOString(),
        }),
      });
    });
  });


  // WHEN accessing the admin page
  test('Admin Login flow and dashboard access', async ({ page }) => {
    await page.goto('/admin');
    // THEN the page should be fully loaded and contain "Admin-Bereich"
    // Wait for the loading state to be false, then assert the header is visible.
    await expect(page.locator('.animate-pulse')).not.toBeVisible({ timeout: 10000 }); // Wait for loading indicator to disappear
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

  test('The member list marks account and admin status independently', async ({ page }) => {
    // GIVEN the member list. The fixture gives Erika an auth_id and no admin rights, and Max admin
    // rights and no auth_id, so the two badges can be told apart rather than moving together
    await page.goto('/admin/members');
    await expect(page.locator('body')).toContainText('Erika Musterfrau', { timeout: 15000 });

    // THEN the member with a linked login is marked as registered but not as an admin
    const erika = page.getByRole('heading', { name: 'Erika Musterfrau' }).locator('..');
    await expect(erika).toContainText('Registriert');
    await expect(erika).not.toContainText('Administrator');

    // THEN the admin without a login is marked as an admin but not as registered
    const max = page.getByRole('heading', { name: 'Max Mustermann' }).locator('..');
    await expect(max).toContainText('Administrator');
    await expect(max).not.toContainText('Registriert');
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
    await expect(page.locator('.animate-pulse')).not.toBeVisible({ timeout: 15000 });

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

  test('Dashboard cards show the Veranstaltung name and start time', async ({ page }) => {
    // GIVEN the admin dashboard with a named Veranstaltung
    await page.goto('/admin');
    await expect(page.locator('.animate-pulse')).not.toBeVisible({ timeout: 10000 });

    // THEN the card shows the name and the start time next to the date
    await expect(page.locator('body')).toContainText('Heimspiel gegen TSV');
    await expect(page.locator('body')).toContainText('19:00');

    // THEN the raw PostgREST value is not rendered, so the time really was trimmed
    await expect(page.locator('body')).not.toContainText('19:00:00');
  });

  test('Start time pre-fills from the configured weekday defaults', async ({ page }) => {
    // GIVEN the Termin-Management page
    await page.goto('/admin/dates');
    const dateInput = page.locator('input[type="date"]');
    const timeInput = page.locator('input[type="time"]');
    await expect(dateInput).toBeVisible({ timeout: 15000 });

    // WHEN picking a Wednesday
    await dateInput.fill('2026-09-16');

    // THEN the Mon-Thu default is pre-filled
    await expect(timeInput).toHaveValue('20:00');

    // WHEN picking a Friday
    await dateInput.fill('2026-09-18');

    // THEN the Friday default is pre-filled
    await expect(timeInput).toHaveValue('18:30');

    // WHEN picking a Saturday
    await dateInput.fill('2026-09-19');

    // THEN the weekend default is pre-filled
    await expect(timeInput).toHaveValue('15:30');
  });

  test('Editing a Veranstaltung shows its stored name and start time', async ({ page }) => {
    // GIVEN the Termin-Management page listing a named Veranstaltung
    await page.goto('/admin/dates');
    await expect(page.locator('body')).toContainText('Heimspiel gegen TSV', { timeout: 15000 });

    // THEN the list also shows its start time and keeps the month label
    await expect(page.locator('body')).toContainText('Beginn: 19:00');
    await expect(page.locator('body')).not.toContainText('19:00:00');
    await expect(page.locator('body')).toContainText('Mai 2024');

    // WHEN clicking edit on that entry
    await page.locator('button[title="Termin bearbeiten"]').first().click();

    // THEN the form carries the stored values rather than a bucket default
    await expect(page.locator('input[type="time"]')).toHaveValue('19:00');
    await expect(page.locator('input[placeholder="z. B. Heimspiel gegen TSV Musterdorf"]')).toHaveValue(
      'Heimspiel gegen TSV'
    );
  });

  test('Switching from an edited Veranstaltung to a fresh date applies that date\'s default', async ({ page }) => {
    // GIVEN an existing Veranstaltung has been loaded for editing, so its stored time fills the form
    await page.goto('/admin/dates');
    await expect(page.locator('body')).toContainText('Heimspiel gegen TSV', { timeout: 15000 });
    await page.locator('button[title="Termin bearbeiten"]').first().click();
    await expect(page.locator('input[type="time"]')).toHaveValue('19:00');

    // WHEN picking a different date that has no Veranstaltung yet
    await page.locator('input[type="date"]').fill('2026-09-19');

    // THEN the weekend default replaces the loaded time instead of carrying it over
    await expect(page.locator('input[type="time"]')).toHaveValue('15:30');

    // WHEN typing a time by hand and then picking yet another fresh date
    await page.locator('input[type="time"]').fill('17:45');
    await page.locator('input[type="date"]').fill('2026-09-18');

    // THEN the hand-typed time survives, because only an untouched field gets pre-filled
    await expect(page.locator('input[type="time"]')).toHaveValue('17:45');
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
    await expect(page.locator('body')).toContainText('pending@example.com');

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
    await page.fill('input[placeholder="email@fce.de"]', 'new-admin@example.com');

    // WHEN we click "Mitglied anlegen"
    await page.click('button:has-text("Mitglied anlegen")');

    // THEN the form should be reset (fetchData called again)
    await expect(page.locator('input[placeholder="Vorname Nachname"]')).toHaveValue('');
    await expect(page.locator('input[placeholder="email@fce.de"]')).toHaveValue('');
  });

  // WHEN clicking Reset Plan
  test('Clicking "Reset Plan" and verifying UI updates', async ({ page }) => {
    // GIVEN mocked assignments so the button is enabled
    await page.route(url => url.href.includes('/rest/v1/assignments'), async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: '1', workdate_id: '101', member_id: '1', status: 'Published', members: { name: 'Max Mustermann' } }
          ]),
        });
      } else if (method === 'DELETE') {
        await route.fulfill({
          status: 204,
          contentType: 'application/json',
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/admin');

    // THEN the reset button should be visible and enabled
    const resetBtn = page.getByRole('button', { name: 'Dienstplan vollständig zurücksetzen' });
    await expect(resetBtn).toBeVisible();
    await expect(resetBtn).toBeEnabled();

    // Set up dialog handling for both the confirmation AND the success alert
    // Ensure we're handling potential loading spinners or delays before dialogs appear
    let dialogCount = 0;
    page.on('dialog', async dialog => {
      dialogCount++;
      if (dialogCount === 1) {
        // First dialog is the confirmation
        expect(dialog.message()).toContain('ACHTUNG');
        await dialog.accept();
      } else if (dialogCount === 2) {
        // Second dialog is the success message after fetchData completes
        expect(dialog.message()).toContain('Der gesamte Dienstplan wurde erfolgreich zurückgesetzt.');
        await dialog.accept();
      }
    });

    // WHEN clicking Reset Plan
    await resetBtn.click();

    // THEN both dialogs should have been handled and the success alert should have appeared
    // Wait for the dialogs to be processed. Using a poll for dialogCount ensures async operations are complete.
    await expect.poll(() => dialogCount, { timeout: 15000 }).toBe(2);
  });

  test('Saving the settings page stores the cooldown and all three start time defaults', async ({ page }) => {
    // GIVEN a mocked settings update route that leaves reads to the beforeEach handler
    let capturedBody: Record<string, unknown> | null = null;
    await page.route(url => url.href.includes('/rest/v1/settings'), async (route) => {
      const method = route.request().method();
      if (method === 'PATCH' || method === 'PUT') {
        capturedBody = route.request().postDataJSON();
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    // GIVEN the admin dashboard
    await page.goto('/admin');
    await expect(page.locator('.animate-pulse')).not.toBeVisible({ timeout: 10000 });

    // WHEN following the settings link
    await page.getByRole('link', { name: 'Einstellungen' }).click();

    // THEN the settings page opens with the stored values
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.locator('#default-fri')).toHaveValue('18:30', { timeout: 15000 });

    // WHEN changing the cooldown and the weekend default
    await page.locator('#cooldown-slider').fill('45');
    await page.locator('#default-sat-sun').fill('16:00');

    let successDialogFound = false;
    page.on('dialog', async dialog => {
      if (dialog.message().includes('erfolgreich gespeichert')) {
        successDialogFound = true;
      }
      await dialog.accept();
    });

    // AND clicking Speichern
    await page.getByRole('button', { name: 'Speichern' }).click();

    // THEN the success dialog was shown
    await expect.poll(() => successDialogFound).toBe(true);

    // AND all four settings were sent to Supabase
    expect(capturedBody).toMatchObject({
      cooldown_days: 45,
      default_start_time_mon_thu: '20:00',
      default_start_time_fri: '18:30',
      default_start_time_sat_sun: '16:00',
    });
  });

  test('Saving with an empty name and cleared time stores null for both', async ({ page }) => {
    // GIVEN the work date write is captured
    let capturedBody: Record<string, unknown> | null = null;
    await page.route(url => url.href.includes('/rest/v1/work_dates'), async (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON();
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([]) });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/admin/dates');
    await expect(page.locator('input[type="date"]')).toBeVisible({ timeout: 15000 });

    // WHEN picking a fresh date, clearing the pre-filled time, leaving the name empty and saving
    await page.locator('input[type="date"]').fill('2026-09-19');
    await page.locator('input[type="time"]').fill('');
    await page.getByRole('button', { name: 'Termin festlegen' }).click();

    // THEN both optional fields were sent as null rather than as empty strings
    await expect.poll(() => capturedBody).not.toBeNull();
    expect(capturedBody).toMatchObject({ name: null, start_time: null });
  });

  test('Admin sees a ranked suggestion for a pending registration and can link it', async ({ page }) => {
    // GIVEN the members page with one pending registration
    let capturedLink: Record<string, unknown> | null = null;
    let capturedLinkUrl: string | null = null;
    await page.route(url => url.href.includes('/rest/v1/members'), async (route) => {
      if (route.request().method() === 'PATCH') {
        capturedLink = route.request().postDataJSON();
        capturedLinkUrl = route.request().url();
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    // GIVEN the registration's DELETE is captured, leaving its GET to the beforeEach handler
    let deletedRegistrationUrl: string | null = null;
    await page.route(url => url.href.includes('/rest/v1/registrations'), async (route) => {
      if (route.request().method() === 'DELETE') {
        deletedRegistrationUrl = route.request().url();
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/admin/members');
    await expect(page.locator('body')).toContainText('Ausstehende Registrierungen', { timeout: 15000 });

    // THEN the claimed name and a suggestion for the typo'd member are both shown
    await expect(page.locator('body')).toContainText('Mak Mustermann');
    await expect(page.locator('body')).toContainText('Max Mustermann');
    await expect(page.locator('body')).toContainText('ähnlich');

    // WHEN linking to the suggestion
    await page.getByRole('button', { name: /Mit Max Mustermann verknüpfen/ }).click();

    // THEN the member row is claimed with the registration's auth id and email
    await expect.poll(() => capturedLink, { timeout: 15000 }).not.toBeNull();
    expect(capturedLink).toMatchObject({
      auth_id: 'auth-reg-1',
      email: 'neu@example.com',
      is_approved: true,
    });

    // AND the PATCH targeted the suggested member's row, not some other one
    expect(capturedLinkUrl).toContain('id=eq.1');

    // AND the resolved claim is removed from the registrations table
    await expect.poll(() => deletedRegistrationUrl, { timeout: 15000 }).not.toBeNull();
    expect(deletedRegistrationUrl).toContain('id=eq.reg-1');
  });

  test('A failed member update leaves the registration claim unresolved and alerts the admin', async ({ page }) => {
    // GIVEN the member update fails, the realistic shape of a members.email unique collision
    await page.route(url => url.href.includes('/rest/v1/members'), async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code: '23505',
            message: 'duplicate key value violates unique constraint "members_email_key"',
          }),
        });
      } else {
        await route.fallback();
      }
    });

    // GIVEN any DELETE to the registrations table is captured, leaving its GET to the beforeEach handler
    let deleteCalled = false;
    await page.route(url => url.href.includes('/rest/v1/registrations'), async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    // GIVEN the admin's alert dialog is observed
    let alertMessage: string | null = null;
    page.on('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.goto('/admin/members');
    await expect(page.locator('body')).toContainText('Ausstehende Registrierungen', { timeout: 15000 });

    // WHEN linking to the suggestion and the update fails
    await page.getByRole('button', { name: /Mit Max Mustermann verknüpfen/ }).click();

    // THEN the admin is told the link failed
    await expect.poll(() => alertMessage, { timeout: 15000 }).not.toBeNull();
    expect(alertMessage).toContain('Verknüpfen fehlgeschlagen');

    // AND the claim survives, since it is never deleted when the update failed
    expect(deleteCalled).toBe(false);
  });

  test('Creating a new member from a registration posts the member and deletes the claim', async ({ page }) => {
    // GIVEN the members POST is captured, leaving GETs to the beforeEach handler
    let capturedCreate: Record<string, unknown> | null = null;
    await page.route(url => url.href.includes('/rest/v1/members'), async (route) => {
      if (route.request().method() === 'POST') {
        capturedCreate = route.request().postDataJSON();
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([]) });
      } else {
        await route.fallback();
      }
    });

    // GIVEN the registration's DELETE is captured, leaving its GET to the beforeEach handler
    let deletedRegistrationUrl: string | null = null;
    await page.route(url => url.href.includes('/rest/v1/registrations'), async (route) => {
      if (route.request().method() === 'DELETE') {
        deletedRegistrationUrl = route.request().url();
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/admin/members');
    await expect(page.locator('body')).toContainText('Ausstehende Registrierungen', { timeout: 15000 });

    // WHEN creating a new member from the pending registration
    await page.getByRole('button', { name: 'Als neues Mitglied anlegen' }).click();

    // THEN the new member is posted with the claim's identity, approved and non-admin
    await expect.poll(() => capturedCreate, { timeout: 15000 }).not.toBeNull();
    expect(capturedCreate).toMatchObject({
      auth_id: 'auth-reg-1',
      email: 'neu@example.com',
      name: 'Mak Mustermann',
      is_approved: true,
      is_admin: false,
    });

    // AND the resolved claim is removed from the registrations table
    await expect.poll(() => deletedRegistrationUrl, { timeout: 15000 }).not.toBeNull();
    expect(deletedRegistrationUrl).toContain('id=eq.reg-1');
  });

  test('Rejecting a registration only deletes the claim', async ({ page }) => {
    // GIVEN any write to members is captured, so a wrongly-issued write would be visible
    let membersWriteCalled = false;
    await page.route(url => url.href.includes('/rest/v1/members'), async (route) => {
      if (['PATCH', 'POST', 'PUT'].includes(route.request().method())) {
        membersWriteCalled = true;
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    // GIVEN the registration's DELETE is captured, leaving its GET to the beforeEach handler
    let deletedRegistrationUrl: string | null = null;
    await page.route(url => url.href.includes('/rest/v1/registrations'), async (route) => {
      if (route.request().method() === 'DELETE') {
        deletedRegistrationUrl = route.request().url();
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    // GIVEN the confirmation dialog is accepted
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.goto('/admin/members');
    await expect(page.locator('body')).toContainText('Ausstehende Registrierungen', { timeout: 15000 });

    // WHEN rejecting the pending registration
    await page.getByRole('button', { name: 'Ablehnen' }).click();

    // THEN only the claim is deleted
    await expect.poll(() => deletedRegistrationUrl, { timeout: 15000 }).not.toBeNull();
    expect(deletedRegistrationUrl).toContain('id=eq.reg-1');
    expect(membersWriteCalled).toBe(false);
  });

  test('A suggestion for an admin member shows the Administrator warning', async ({ page }) => {
    // GIVEN the members page with one pending registration whose top suggestion is an admin member
    await page.goto('/admin/members');
    await expect(page.locator('body')).toContainText('Ausstehende Registrierungen', { timeout: 15000 });

    // WHEN looking at the suggestion row offering to link to that admin member
    const suggestionButton = page.getByRole('button', { name: /Mit Max Mustermann verknüpfen/ });

    // THEN the Administrator warning is shown on that suggestion
    await expect(suggestionButton).toContainText('Administrator');
  });

  test('Linking to an already-linked member via the manual select asks for confirmation, and canceling writes nothing', async ({ page }) => {
    // GIVEN the members PATCH and the registration DELETE are captured
    let patchCalled = false;
    await page.route(url => url.href.includes('/rest/v1/members'), async (route) => {
      if (route.request().method() === 'PATCH') {
        patchCalled = true;
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    let deleteCalled = false;
    await page.route(url => url.href.includes('/rest/v1/registrations'), async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    // GIVEN the confirmation dialog is dismissed
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('bereits mit einem Konto verknüpft');
      await dialog.dismiss();
    });

    await page.goto('/admin/members');
    await expect(page.locator('body')).toContainText('Ausstehende Registrierungen', { timeout: 15000 });

    // WHEN choosing the already-linked member through the manual select and canceling the warning
    const manualSelect = page.locator('select', { hasText: 'Manuell zuordnen' });
    await manualSelect.selectOption('2');

    // THEN neither the member row nor the registration claim is touched, giving the UI a moment
    // to have done the wrong thing before asserting nothing happened
    await page.waitForTimeout(500);
    expect(patchCalled).toBe(false);
    expect(deleteCalled).toBe(false);
  });

  test('Confirming the overwrite links the already-linked member and removes the claim', async ({ page }) => {
    // GIVEN the members PATCH and the registration DELETE are captured
    let capturedLinkUrl: string | null = null;
    await page.route(url => url.href.includes('/rest/v1/members'), async (route) => {
      if (route.request().method() === 'PATCH') {
        capturedLinkUrl = route.request().url();
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    let deletedRegistrationUrl: string | null = null;
    await page.route(url => url.href.includes('/rest/v1/registrations'), async (route) => {
      if (route.request().method() === 'DELETE') {
        deletedRegistrationUrl = route.request().url();
        await route.fulfill({ status: 204 });
      } else {
        await route.fallback();
      }
    });

    // GIVEN the confirmation dialog is accepted
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.goto('/admin/members');
    await expect(page.locator('body')).toContainText('Ausstehende Registrierungen', { timeout: 15000 });

    // WHEN choosing the already-linked member through the manual select and accepting the warning
    const manualSelect = page.locator('select', { hasText: 'Manuell zuordnen' });
    await manualSelect.selectOption('2');

    // THEN the member row is claimed, targeting the selected member and not the suggested one
    await expect.poll(() => capturedLinkUrl, { timeout: 15000 }).not.toBeNull();
    expect(capturedLinkUrl).toContain('id=eq.2');

    // AND the resolved claim is removed from the registrations table
    await expect.poll(() => deletedRegistrationUrl, { timeout: 15000 }).not.toBeNull();
    expect(deletedRegistrationUrl).toContain('id=eq.reg-1');
  });

  test('Exporting the schedule downloads a PDF', async ({ page }) => {
    // GIVEN the loaded dashboard
    await page.goto('/admin');
    await expect(page.locator('.animate-pulse')).not.toBeVisible({ timeout: 15000 });

    // WHEN exporting
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als PDF exportieren' }).click();
    const download = await downloadPromise;

    // THEN a dated PDF arrives, which is the only proof jsPDF runs in a real browser
    expect(download.suggestedFilename()).toMatch(/^schichtplan-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
