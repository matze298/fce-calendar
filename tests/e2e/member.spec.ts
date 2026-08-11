import { test, expect, type Page } from '@playwright/test';

const AUTH_USER = { id: 'auth-1', email: 'mem.ber@example.com' };

const SCHEDULE_ROWS = [
  {
    workdate_id: 'wd-1', date: '2099-01-10', event_name: 'Heimspiel', start_time: '15:30:00',
    member_id: 'm-1', member_name: 'Mem Ber',
  },
  {
    workdate_id: 'wd-1', date: '2099-01-10', event_name: 'Heimspiel', start_time: '15:30:00',
    member_id: 'm-2', member_name: 'Kol Lege',
  },
  {
    workdate_id: 'wd-2', date: '2099-01-17', event_name: 'Auswaertsspiel', start_time: '20:00:00',
    member_id: 'm-2', member_name: 'Kol Lege',
  },
];

/** Signs the browser in and serves the given members row and schedule rows. */
async function givenMemberSession(
  page: Page,
  options: { profile: Record<string, unknown> | null; rows?: typeof SCHEDULE_ROWS },
): Promise<void> {
  // checkMemberAccess reads the session from local storage before it ever calls the network, so
  // the auth/v1 mock below is reached only once a session already appears signed in. The user is
  // passed in as an argument, since an init script runs in the page and cannot close over
  // AUTH_USER from module scope.
  await page.addInitScript(user => {
    const mockSession = {
      access_token: 'fake-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'fake-refresh',
      user,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    const originalGetItem = window.localStorage.getItem;
    window.localStorage.getItem = function (...args: [key: string]) {
      const [key] = args;
      if (key && (key.includes('auth-token') || key === 'supabase.auth.token')) {
        return JSON.stringify(mockSession);
      }
      return originalGetItem.apply(this, args);
    };
  }, AUTH_USER);

  await page.route('**/auth/v1/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: AUTH_USER }) }),
  );

  await page.route(url => url.href.includes('/rest/v1/members'), route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.profile),
    }),
  );

  await page.route(url => url.href.includes('/rest/v1/published_schedule'), route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.rows ?? SCHEDULE_ROWS),
    }),
  );
}

test.describe('Member duty plan', () => {
  test('lists every published date with the people on it, including one the member does not work', async ({ page }) => {
    // GIVEN an approved member whose plan holds a date they are not assigned to
    await givenMemberSession(page, {
      profile: { id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false },
    });

    // WHEN they open the plan
    await page.goto('/dienstplan');

    // THEN both dates and all the names are shown, so they can check who is working
    await expect(page.getByText('Heimspiel')).toBeVisible();
    await expect(page.getByText('Auswaertsspiel')).toBeVisible();
    await expect(page.getByText('Kol Lege').first()).toBeVisible();
    // Exact match, so an untrimmed "15:30:00" would not satisfy it
    await expect(page.getByText('15:30 · Heimspiel', { exact: true })).toBeVisible();
  });

  test('marks the viewer among the names so they can find themselves', async ({ page }) => {
    // GIVEN an approved member on the plan
    await givenMemberSession(page, {
      profile: { id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false },
    });

    // WHEN they open the plan
    await page.goto('/dienstplan');

    // THEN their own entry carries the marker and a colleague's does not
    await expect(page.getByTestId('person-m-1')).toHaveAttribute('data-me', 'true');
    await expect(page.getByTestId('person-m-2').first()).toHaveAttribute('data-me', 'false');
  });

  test('offers no admin link to an ordinary member and one to an admin', async ({ page }) => {
    // GIVEN an ordinary approved member
    await givenMemberSession(page, {
      profile: { id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false },
    });

    // WHEN they open the plan
    await page.goto('/dienstplan');

    // THEN nothing invites them into the admin area, once the page has actually loaded rather
    // than still showing its loading screen, where no link is present for an unrelated reason
    await expect(page.getByRole('heading', { name: 'Dienstplan' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Admin-Bereich/i })).toHaveCount(0);

    // GIVEN an approved admin instead
    await givenMemberSession(page, {
      profile: { id: 'm-9', name: 'Ada Admin', is_approved: true, is_admin: true },
    });

    // WHEN they open the plan
    await page.goto('/dienstplan');

    // THEN the admin area is one click away
    await expect(page.getByRole('link', { name: /Admin-Bereich/i })).toBeVisible();
  });

  test('tells an unlinked registration to wait rather than showing an empty plan', async ({ page }) => {
    // GIVEN an account that registered but whose claim no admin has linked, so there is no
    // members row for it at all
    await givenMemberSession(page, { profile: null });

    // WHEN they open the plan
    await page.goto('/dienstplan');

    // THEN they are told their registration is being reviewed, and see no schedule
    await expect(page.getByText(/Registrierung wird noch geprüft/i)).toBeVisible();
    await expect(page.getByText('Heimspiel')).toHaveCount(0);
  });

  test('reports an empty plan distinctly from a pending account', async ({ page }) => {
    // GIVEN an approved member and nothing published
    await givenMemberSession(page, {
      profile: { id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false },
      rows: [],
    });

    // WHEN they open the plan
    await page.goto('/dienstplan');

    // THEN the empty state names the real reason
    await expect(page.getByText(/noch kein Dienstplan veröffentlicht/i)).toBeVisible();
  });

  test('shows a failed query as an error rather than a false empty plan', async ({ page }) => {
    // GIVEN an approved member whose schedule query fails
    await givenMemberSession(page, {
      profile: { id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false },
    });
    await page.route(url => url.href.includes('/rest/v1/published_schedule'), route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'boom', details: '', hint: '', code: '500' }),
      }),
    );

    // WHEN they open the plan
    await page.goto('/dienstplan');

    // THEN the real error is shown, and the unrelated empty-plan message is not
    await expect(page.getByText(/Der Dienstplan konnte nicht geladen werden/i)).toBeVisible();
    await expect(page.getByText(/noch kein Dienstplan veröffentlicht/i)).toHaveCount(0);
  });
});
