# FCE Shift Calendar - Developer Documentation

This document contains technical details for setting up and operating the shift scheduling system for 1. FC Egenhausen.

## 1. Technical Stack
- **Frontend:** Next.js (React), Tailwind CSS v4
- **Backend:** Vercel Serverless Functions (Python & TypeScript)
- **Database & Auth:** Supabase (PostgreSQL)

## 2. Database Setup

The schema lives in `supabase/migrations/`, applied in ascending order.

**Against a hosted project:**

1. `npx supabase login`
2. `npx supabase link --project-ref <your-project-ref>`
3. `npx supabase db push`

If you cannot link, paste each file in `supabase/migrations/` into the Supabase SQL Editor in
ascending filename order. They are idempotent, so re-running one is safe.

Either way, run `notify pgrst, 'reload schema';` afterwards. PostgREST caches the schema, and
skipping this makes the API answer `PGRST205` for `public.published_schedule` until it reloads
on its own.

**Locally:**

```bash
npm run db:start   # boots Postgres on 127.0.0.1:54322
npm run db:reset   # applies every migration, then supabase/seed.sql
npm run db:test    # runs the pgTAP access control suite
npm run db:stop
```

`supabase/seed.sql` holds development data only. `supabase/dev_reset.sql` drops every table and is
never for a database with real member records.

Every write to `members` is admin-only once `0005_access_control.sql` applies, so an empty table
has nobody who can set `is_admin` on themselves or anyone else through the app. Seed or repair the
first administrator directly in the Supabase SQL Editor, which runs as `postgres` and bypasses RLS.

## 3. Local Development
To start the project locally, follow these steps:

1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Environment Variables:**
   Create a `.env.local` file with your Supabase credentials (found under *Settings -> API*):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-publishable
   ```
3. **Start the Server:**
   Use the project development script for normal local frontend development. It runs Next.js with Webpack to avoid Turbopack filesystem and HMR issues on mounted workspaces:
   ```bash
   npm run dev
   ```
   Use `npx vercel dev` only when you specifically need to test Vercel's Python/serverless-function emulation; it may invoke Turbopack and reproduce the panic described above.
4. **Login:**
   Register via the app or use the test account:
   - **User:** `dev@localhost.test`
   - **Pass:** `devpassword`
   *(Note: The Admin status must be linked to the `auth_id` in the database).*

## 4. Mobile Testing (Same Wi-Fi)

To test the application on a mobile device within the same local network:

1. **Start the server on all interfaces:**
   By default, the server only listens on `localhost`. Use the following command to allow external access:
   ```bash
   npm run dev -- --hostname 0.0.0.0
   ```
2. **Find your Local IP:**
   - Windows (PowerShell): `ipconfig` (Look for `IPv4 Address`)
   - Linux/Mac: `hostname -I`
3. **Access on Phone:**
   Open your phone's browser and navigate to `http://<YOUR_IP>:3000`.

### ⚠️ Supabase Auth Redirects
If testing login on mobile, you must add `http://<YOUR_IP>:3000` to the **Redirect URLs** in your [Supabase Dashboard](https://supabase.com/dashboard) under *Authentication -> URL Configuration*.

## 5. Authentication & Permissions
- **Registration:** Anyone can create an account. This writes a claim to `registrations`, not a member row.
- **Linking:** An administrator links the claim to an existing member, or creates a new one, on `/admin/members`. Suggestions are ranked by `utils/memberMatch.ts`, which normalizes German spelling variants so "Mueller" matches "Müller".
- **Admin Status:** Only users with `is_admin = true` can access the dashboard and generate shifts.

## 5. Algorithm (Shift Generator)
The planning logic lives in `utils/schedule.ts` as a pure function, unit tested in `tests/unit/schedule.test.ts`. `app/api/generate/route.ts` is the thin route around it that reads from Supabase and writes the drafts back.
Assignments occur in 3 phases:
1. **Seniors:** Priority for "Important" shifts.
2. **Weekends:** Assigned based on weekend availability.
3. **Weekdays:** Distribution of remaining shifts.

## 6. Automated Reminders (Cron Jobs)
The system sends automated email reminders for shifts happening in exactly 7 days.

### Environment Setup
Add the following to your `.env.local`:
- `CRON_SECRET`: A random string (e.g., `super-secret-123`). In production, Vercel provides this automatically.
- `SUPABASE_SERVICE_ROLE_KEY`: The service role key from *Settings -> API*. The cron runs on a schedule with no user session, so it reads `members.email` with this key instead of the anon key. **Warning:** this key bypasses Row Level Security entirely. It belongs only in server-side configuration and must never appear in a `NEXT_PUBLIC_` variable or reach the browser.
- `RESEND_API_KEY`: Your API key from [Resend](https://resend.com).
- `DEVELOPMENT_EMAIL_OVERRIDE` (Optional): Set this to your own email address to redirect **all** reminder emails to yourself during testing, regardless of the member's email in the database.
- `REMINDERS_LIVE` (Production only): Set to `true` to allow reminders to reach the addresses stored in the `members` table.

### Who actually receives a reminder

The endpoint reports which mode it ran in, so a cron run can be audited from its response:

| Configuration | Mode | Recipients |
| :--- | :--- | :--- |
| `DEVELOPMENT_EMAIL_OVERRIDE` set | `override` | Only that one address |
| `REMINDERS_LIVE=true` | `live` | The members' own addresses |
| Neither | `dry-run` | Nobody. The run reports what it suppressed |

The default sends nothing on purpose. Reaching real addresses has to be asked for, because any database seeded from `supabase/seed.sql` is full of plausible member records, and a default that mailed whatever the table contained would send club reminders to strangers from a developer's machine.

### Local Testing
To trigger the reminder script manually without waiting for the schedule:
1. Start the dev server: `npx vercel dev` (required here to emulate Vercel's Python serverless function runtime)
2. Use `curl` to hit the endpoint with the required authorization:
   ```bash
   curl -H "Authorization: Bearer your-cron-secret" http://localhost:3000/api/cron/send_reminders
   ```
   *(Replace `your-cron-secret` with the value from your `.env.local`)*.

## 7. Testing

The project uses a two-tier testing strategy to ensure the fairness algorithm and critical UI paths remain stable.

### Backend Tests (Python)
The scheduling logic is tested using `pytest`, and the Python code is type-checked with `ty`. These checks use mocked Supabase data and do not require a live database.
- **Run all backend tests:**
  ```bash
  PYTHONPATH=. uv run pytest tests/backend/
  ```
- **Run the backend type check:**
  ```bash
  uv run ty check .
  ```

### End-to-End (E2E) Tests (Playwright)
The UI and API integration are tested using Playwright. These tests automatically start a local development server.
- **Run tests headlessly (CI style):**
  ```bash
  npm run test:e2e
  ```
- **Run tests in UI Mode (Local development/Debugging):**
  ```bash
  npm run test:e2e:local
  ```
- **View HTML Report:**
  ```bash
  npx playwright show-report
  ```

*Note: E2E tests mock the Supabase Auth and Database layers to ensure they can run reliably in any environment without actual credentials.*
