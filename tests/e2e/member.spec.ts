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

  // PostgREST answers select=* with an array regardless of row count, and maybeSingle() only
  // unwraps that shape client side. Serving a bare object here would hide a client bug that a
  // real backend cannot.
  await page.route(url => url.href.includes('/rest/v1/members'), route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.profile ? [options.profile] : []),
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
    // GIVEN an approved member whose schedule query fails with the body PostgREST sends when the
    // view has not been reloaded into its schema cache, the most likely real failure on this page
    await givenMemberSession(page, {
      profile: { id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false },
    });
    await page.route(url => url.href.includes('/rest/v1/published_schedule'), route =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          message: "Could not find the table 'public.published_schedule' in the schema cache",
          details: '',
          hint: '',
          code: 'PGRST205',
        }),
      }),
    );

    // WHEN they open the plan
    await page.goto('/dienstplan');

    // THEN the real error message is shown in full, not a stringified error object, so an operator
    // reading it can actually tell what went wrong
    await expect(
      page.getByText(
        "Der Dienstplan konnte nicht geladen werden: Could not find the table 'public.published_schedule' in the schema cache",
      ),
    ).toBeVisible();
    // THEN the unrelated empty-plan message is not shown
    await expect(page.getByText(/noch kein Dienstplan veröffentlicht/i)).toHaveCount(0);
  });

  test('clears the previous list and next-duty line when a refetch fails', async ({ page }) => {
    // GIVEN an approved member whose first load succeeds and shows a date they work
    await givenMemberSession(page, {
      profile: { id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false },
    });
    let scheduleRequestCount = 0;
    await page.route(url => url.href.includes('/rest/v1/published_schedule'), route => {
      scheduleRequestCount += 1;
      if (scheduleRequestCount === 1) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(SCHEDULE_ROWS),
        });
      }
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'boom', details: '', hint: '', code: '500' }),
      });
    });
    await page.goto('/dienstplan');
    await expect(page.getByText('Heimspiel')).toBeVisible();
    await expect(page.getByText(/Ihr nächster Dienst/)).toBeVisible();

    // WHEN toggling past dates triggers a second request that fails
    await page.getByLabel('Vergangene Termine einschließen').check();

    // THEN the error banner appears, and the stale list and next-duty line are gone rather than
    // sitting underneath it
    await expect(page.getByText(/Der Dienstplan konnte nicht geladen werden/i)).toBeVisible();
    await expect(page.getByText('Heimspiel')).toHaveCount(0);
    await expect(page.getByText(/Ihr nächster Dienst/)).toHaveCount(0);

    // THEN neither does it claim there is no duty, which a failed load gives no grounds to say
    await expect(page.getByText('Für Sie ist derzeit kein Dienst eingeteilt.')).toHaveCount(0);
  });

  test('re-fetches without the past-date filter once the toggle is checked, and shows the past date', async ({
    page,
  }) => {
    // GIVEN an approved member whose plan holds one past and one future date
    const PAST_AND_FUTURE_ROWS = [
      {
        workdate_id: 'wd-past', date: '2020-01-10', event_name: 'Vergangenes Spiel', start_time: '15:30:00',
        member_id: 'm-1', member_name: 'Mem Ber',
      },
      {
        workdate_id: 'wd-future', date: '2099-01-10', event_name: 'Kommendes Spiel', start_time: '15:30:00',
        member_id: 'm-1', member_name: 'Mem Ber',
      },
    ];
    await givenMemberSession(page, {
      profile: { id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false },
    });
    const requestedUrls: string[] = [];
    await page.route(url => url.href.includes('/rest/v1/published_schedule'), route => {
      requestedUrls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PAST_AND_FUTURE_ROWS),
      });
    });

    // WHEN they open the plan
    await page.goto('/dienstplan');

    // THEN only the future date is shown, and the request that produced it carried the gte filter
    await expect(page.getByText('Kommendes Spiel')).toBeVisible();
    await expect(page.getByText('Vergangenes Spiel')).toHaveCount(0);
    expect(requestedUrls.at(-1)).toContain('date=gte.');

    // WHEN they include past dates
    await page.getByLabel('Vergangene Termine einschließen').check();

    // THEN a second request fired without the gte filter, and the past date is now listed
    await expect(page.getByText('Vergangenes Spiel')).toBeVisible();
    expect(requestedUrls.length).toBeGreaterThanOrEqual(2);
    expect(requestedUrls.at(-1)).not.toContain('date=gte.');
  });
});

test.describe('Signing out', () => {
  test('ends the session and returns to the login page', async ({ page }) => {
    // GIVEN an approved member looking at their plan
    await givenMemberSession(page, {
      profile: { id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false },
    });
    let logoutRequested = false;
    await page.route('**/auth/v1/logout**', route => {
      logoutRequested = true;
      return route.fulfill({ status: 204, body: '' });
    });
    await page.goto('/dienstplan');

    // WHEN they sign out
    await page.getByRole('button', { name: /Abmelden/i }).click();

    // THEN they land back on the login page
    await expect(page).toHaveURL(/\/login$/);
    // THEN the session was actually ended, not merely navigated away from
    expect(logoutRequested).toBe(true);
  });

  test('reports a failure and stays put when the sign-out request itself fails', async ({ page }) => {
    // GIVEN an approved member whose sign-out request will fail on the server
    await givenMemberSession(page, {
      profile: { id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false },
    });
    await page.route('**/auth/v1/logout**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      }),
    );
    await page.goto('/dienstplan');

    // WHEN they try to sign out
    await page.getByRole('button', { name: /Abmelden/i }).click();

    // THEN they are told sign-out failed, and stay on the duty plan rather than being sent to
    // the login page while still holding a live session
    await expect(page.getByText('Abmelden fehlgeschlagen: Internal Server Error')).toBeVisible();
    await expect(page).toHaveURL(/\/dienstplan$/);
  });
});
