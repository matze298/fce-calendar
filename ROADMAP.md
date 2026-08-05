# Roadmap

The gap between what `docs/project_blueprint.md` and `docs/ci_cd_blueprint.md` specify and what the code
actually does today, ordered by severity, plus the runbook for getting the app live. The blueprints stay
the specification, this file tracks what is still missing and shrinks as items close.
Written 2026-08-04.

For what the app does and how it is built, read the blueprints and `docs/WEBAPP_GUIDE.md` instead.

## Current state

- A real Supabase project is connected, currently holding dummy data (the fictional German names seeded
  by `supabase/setup.sql`)
- `.env.local` ships with placeholder credentials (`mock.supabase.co`, `mock-key`), so a fresh checkout
  cannot log in until real values are filled in. See `DEVELOPER.md` section 3
- CI gates every PR on pytest with ruff and ty, Playwright E2E, Supabase migration verification, and
  frontend lint, type check, unit tests and build
- The Playwright suite mocks the entire Supabase layer, so **no test exercises real authentication or
  real Row Level Security**. Everything in the access control section below is invisible to CI

## Before the first real member record

Not launch day items. The database is already real, so the trigger is the first real name and email
address entered into it, not a go-live date.

### Data and operations

- **`supabase/setup.sql` destroys data.** It opens with `DROP TABLE IF EXISTS ... CASCADE` on all four
  tables, then seeds 51 members and 98 work dates. `DEVELOPER.md` section 2 instructs pasting it into the
  SQL Editor, which is safe exactly once. Go-live needs a schema-only path with no drops and no seed
- No backup or restore procedure for the Supabase project
- No data retention policy. The "right to be forgotten" button required by blueprint section 4 does
  exist (`app/admin/members/page.tsx:130`), but nothing defines how long data is kept otherwise
- `api/generate.py` deletes all Draft assignments then inserts the new ones with no transaction, so a
  failure between the two leaves an empty plan

### Access control

Blueprint section 4 requires strict RLS. None of it is in place.

- **Every table grants full write access to any authenticated user.** All four carry
  `FOR ALL TO authenticated USING (true) WITH CHECK (true)`, despite the policy names claiming
  "Admins can do everything". Because `members` is included, any registered user can set `is_admin` on
  their own row
- **`anon` can read every member,** names and email addresses included, and the anon key is public by
  design once the app is deployed. This is the GDPR exposure
- **`anon` can insert and delete assignments,** so anyone can wipe or forge the published schedule
- **Server side functions authenticate with the anon key,** not a service role key (`api/generate.py`,
  `api/cron/send_reminders.py`, `app/api/generate/route.ts`). They are indistinguishable from a browser
  visitor, which is what forces the permissive policies above. Adding `SUPABASE_SERVICE_ROLE_KEY` and
  using it server side is a prerequisite for tightening anything else
- Registration claims an existing row by email. `app/register/page.tsx` runs
  `update({ auth_id }).eq('email', email)` when that address already exists, which combined with the open
  `members` policy is the shortest path into someone else's record
- `utils/adminGuard.ts` is a UI convenience check only, as its own docstring states. Every admin page
  redirect can be bypassed by calling Supabase directly

Sequencing note: a policy on `members` that queries `members` recurses. The usual fixes are a
`SECURITY DEFINER` helper or moving `is_admin` into the JWT app metadata. That choice is still open.

Verification note: nothing tests the policies, and nothing can with the current setup, because the
Playwright suite mocks Supabase entirely. This work needs its own harness, for example a psql script
asserting each role's reach against a throwaway Postgres. Treat that as part of the task, not a
follow-up, or the policies ship unverified.

### Configuration and secrets

- Real Supabase URL and anon key in Vercel and in each developer's `.env.local`
- `CRON_SECRET` actually set in Vercel. The endpoint now refuses to run when it is unset, so a missing
  secret fails closed rather than accepting `Bearer None`
- Resend domain verification for the `info@fcegenhausen.de` sender
- `DEVELOPMENT_EMAIL_OVERRIDE` must be unset in production, or every reminder for every member goes to
  that one address
- Supabase Auth redirect URLs for the production hostname. See `DEVELOPER.md` section 4
- Secret scanning in CI, required by ci_cd blueprint section 5

### Features specified but not built

- PWA configuration, named in blueprint section 1. No manifest exists
- Web Push notifications, named in blueprint section 1. Email through Resend is the only channel that
  exists, and it is the only free one. SMS or WhatsApp would be the paid fallback if email proves
  insufficient. Telegram was dropped from the codebase in favor of that decision
- A working `supabase start` for local development, named in blueprint section 5. There is no
  `supabase/config.toml`

## Live deployment

The app is not deployed yet. No Vercel check or preview comment appears on pull requests, and the only
registered deployments are the GitHub Pages builds of this documentation. The target is a subdomain of
the club's existing domain.

### Why a subdomain and not a subpage

`fcegenhausen.de` resolves to `217.160.0.3` on IONOS nameservers (`ns*.ui-dns.*`), with club mail on
`mx0*.ionos.de`. So the domain, DNS and email all sit at IONOS.

`schichtplan.fcegenhausen.de` is one DNS record and leaves the existing site untouched.

`fcegenhausen.de/schichtplan` is not achievable by DNS at all, because DNS maps names to addresses and
has no concept of paths. Serving a path from a different host needs a reverse proxy on whatever answers
for the apex domain, and IONOS shared hosting does not generally allow proxying to an external origin.
The alternatives are worse: move the apex to Vercel and rewrite every non-app path back to the old site,
or embed in an iframe, which breaks authentication cookies. Next.js `basePath` only helps once the whole
domain is on Vercel. Link to the subdomain from the main site's navigation instead.

### Steps

1. Import the repository into Vercel. The Next.js framework preset is detected automatically
2. Set the environment variables in the Vercel project: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, and leave
   `DEVELOPMENT_EMAIL_OVERRIDE` unset. The Configuration and secrets section above is the owner of
   this list and explains why each one matters
3. Pin the function region to Frankfurt (`fra1`), and confirm the Supabase project is also in the EU
4. Add `schichtplan.fcegenhausen.de` as a domain on the Vercel project
5. In the IONOS DNS panel, add the CNAME record Vercel provides for that subdomain. **Keep IONOS as the
   DNS provider and only add the record.** Moving the nameservers to Vercel without recreating the `MX`
   records would silently break club email
6. Wait for Vercel to issue the TLS certificate, then confirm the subdomain serves over HTTPS
7. Add the production URL to the Supabase Auth redirect URLs, otherwise login redirects fail off
   localhost
8. Verify the reminder cron by calling the endpoint with the configured `CRON_SECRET`
9. Link to the subdomain from the existing site's navigation

### Constraints to check before relying on it

- **Vercel's Hobby plan is licensed for non-commercial use.** A registered e.V. running an internal
  member tool is a reasonable fit, but it is Vercel's judgment call rather than a documented guarantee.
  Adding sponsorship or a shop to the same project is what would turn this into a Pro-tier question
- **Hobby cron limits are tight:** few jobs, each roughly once per day, fired at approximately rather
  than exactly the requested time. The single daily job in `vercel.json` fits, but confirm the current
  limits before depending on the schedule
- **The cron fires in UTC, so no single expression holds one local time all year.** `0 6 * * *` is 08:00
  during CEST, covering the May to October season, and 07:00 during CET. Vercel offers no timezone
  option, so this is a choice rather than something to fix
- **Python dependencies ship as declared.** Vercel installs from `uv.lock` or `pyproject.toml` with zero
  configuration, so no `requirements.txt` is needed. The dev tooling lives in `[dependency-groups]` so it
  stays out of the serverless bundle, which matters against the 250 MB unzipped limit. Keep it that way
  when adding dependencies: `[project.dependencies]` is what gets deployed
- **A data processing agreement with Vercel** matters for a German club holding member names and email
  addresses, and availability tends to differ by plan. Settle this before real member data goes in,
  which is the same trigger as the access control work above

## After go-live

- Replace `alert()` user feedback with real toasts and inline errors
- A custom 24 hour time control, if admins browse with a locale where the native `<input type="time">`
  renders AM and PM. See below
- A clearer message when Supabase is unreachable, rather than passing the raw browser fetch error
  through as "Anmeldung fehlgeschlagen: NetworkError ..."
- Mobile polish for the admin screens, which are laid out desktop first

## Decided, no action

- **24 hour times.** Every time the app renders itself is already 24 hour. AM and PM appear only inside
  the native `<input type="time">` pickers on `/admin/dates` and `/admin/settings`, and browsers take
  that format from the browser or OS locale rather than from `<html lang="de">`. A German locale already
  shows 24 hour on today's code, so this is a viewer setting, not a code change
- **Weekday buckets differ from `is_weekend`.** Start time defaults bucket as Mon to Thu, Fri, and Sat
  with Sun, while the scheduler counts Friday as weekend. The divergence is deliberate
