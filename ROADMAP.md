# Roadmap

The gap between what `docs/project_blueprint.md` and `docs/ci_cd_blueprint.md` specify and what the code
actually does today, ordered by severity, plus the runbook for getting the app live. The blueprints stay
the specification, this file tracks what is still missing and shrinks as items close.
Written 2026-08-04.

For what the app does and how it is built, read the blueprints and `docs/WEBAPP_GUIDE.md` instead.

## Current state

- A real Supabase project is connected, currently holding dummy data (the fictional German names seeded
  by `supabase/seed.sql`)
- `.env.local` ships with placeholder credentials (`mock.supabase.co`, `mock-key`), so a fresh checkout
  cannot log in until real values are filled in. See `DEVELOPER.md` section 3
- CI gates every PR on pytest with ruff and ty, Playwright E2E, a pgTAP suite run against a local
  Supabase instance, and frontend lint, type check, unit tests and build
- The pgTAP suite (`supabase/tests/access_control_test.sql`, 35 assertions) exercises the real RLS
  policies and grants against a real Postgres instance. The Playwright suite still mocks the entire
  Supabase layer, so no test exercises authentication or RLS through an actual browser session

## Before the first real member record

Not launch day items. The database is already real, so the trigger is the first real name and email
address entered into it, not a go-live date.

### Data and operations

- **The first administrator has no path through the app.** Every write to `members` is admin-only once
  `0005_access_control.sql` applies (see the Access control section below), so an empty table has nobody
  who can set `is_admin` on themselves or anyone else through the UI. Seed that first row through the
  Supabase SQL editor, which runs as `postgres` and bypasses RLS
- No backup or restore procedure for the Supabase project
- No data retention policy. The "right to be forgotten" button required by blueprint section 4 does
  exist (`app/admin/members/page.tsx:130`), but nothing defines how long data is kept otherwise
- `app/api/generate/route.ts` deletes all Draft assignments then inserts the new ones with no
  transaction, so a failure between the two leaves an empty plan

### Access control

Blueprint section 4's RLS is in place. `public.is_admin()` is the predicate every admin policy uses, and
administrators have full access to `members`, `work_dates` and `assignments`, and read plus update on
`settings` and read plus delete on `registrations`. A non-admin member reads exactly their own `members`
row and nothing else directly. `anon` holds no privilege on any table. See blueprint section 4 for the
full picture and `supabase/tests/access_control_test.sql` for the pgTAP suite that verifies it in CI.

- An auth account can outlive its claim, and nothing can clean it up without the service role key.
  Two ways in: an admin rejects a claim, or the claim write fails after `signUp` already succeeded. The
  person then holds a login that no admin can see. Retrying registration with the same address is the
  only recovery, and it depends on Supabase returning the same user id rather than an obfuscated one

### Configuration and secrets

- Real Supabase URL and anon key in Vercel and in each developer's `.env.local`
- `SUPABASE_SERVICE_ROLE_KEY` set in Vercel, server side only. It must never appear in a `NEXT_PUBLIC_`
  variable, which both Vercel and Next.js expose to the browser bundle. The reminder cron already
  refuses to run without it; nothing else needs it, since `/api/generate` and the browser both run as
  the calling user under RLS
- `CRON_SECRET` actually set in Vercel. The endpoint now refuses to run when it is unset, so a missing
  secret fails closed rather than accepting `Bearer None`
- Resend domain verification for the `info@fcegenhausen.de` sender, without which every reminder is
  rejected at the provider
- `REMINDERS_LIVE=true` in Vercel, and nowhere else. Reminders send to nobody until it is set, so
  go-live needs it, and a preview or development environment must never have it. Vercel environment
  variables are per-environment for exactly this reason
- `DEVELOPMENT_EMAIL_OVERRIDE` must be unset in production, or every reminder for every member goes to
  that one address
- Custom SMTP for Supabase Auth, pointed at Resend. The built-in sender is development-only and capped
  at a handful of confirmation emails per hour, so registration fails with `email rate limit exceeded`
  the moment more than a few people sign up on the same day
- **Re-enable "Confirm email" in Supabase Auth.** It is currently switched off so that development is
  not throttled by that rate limit, so registration accepts an address nobody has proved they own.
  `signUp` still returns a session immediately, but a freshly registered account has no linked
  `members` row yet, so under current RLS it can read or write nothing until an admin links it. This
  also depends on custom SMTP above, since re-enabling it against the built-in sender reintroduces the
  rate limit
- Supabase Auth redirect URLs for the production hostname. See `DEVELOPER.md` section 4
- GitHub's native secret scanning with push protection, a repository setting that blocks a push
  containing a credential. The CI gitleaks job catches one after the fact, which is weaker

### Features specified but not built

- PWA configuration, named in blueprint section 1. No manifest exists
- Web Push notifications, named in blueprint section 1. Email through Resend is the only channel that
  exists, and it is the only free one. SMS or WhatsApp would be the paid fallback if email proves
  insufficient. Telegram was dropped from the codebase in favor of that decision

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
8. Verify the reminder cron by calling the endpoint with the configured `CRON_SECRET`. It reports its
   mode, so confirm it says `live` rather than `dry-run` once `REMINDERS_LIVE` is set
9. Switch "Confirm email" back on in Supabase Auth, after custom SMTP is in place. See the
   Configuration and secrets section for why leaving it off is worse than an unverified address
10. Link to the subdomain from the existing site's navigation

### Constraints to check before relying on it

- **Vercel's Hobby plan is licensed for non-commercial use.** A registered e.V. running an internal
  member tool is a reasonable fit, but it is Vercel's judgment call rather than a documented guarantee.
  Adding sponsorship or a shop to the same project is what would turn this into a Pro-tier question
- **Hobby cron limits are tight:** few jobs, each roughly once per day, fired at approximately rather
  than exactly the requested time. The single daily job in `vercel.json` fits, but confirm the current
  limits before depending on the schedule
- **The cron time drifts with daylight saving.** Vercel evaluates cron expressions in UTC and
  `vercel.json` says `0 7 * * *`, so reminders go out at 08:00 in winter and 09:00 in summer, while
  blueprint section 6 specifies 08:00 CET
- **Python dependencies ship as declared.** Vercel installs from `uv.lock` or `pyproject.toml` with zero
  configuration, so no `requirements.txt` is needed. But `pytest`, `pytest-mock`, `prek`, `ruff` and `ty`
  are currently in the main `dependencies` array with no dev group, so they would be installed into the
  deployment. `ruff` and `ty` are large binaries, and the serverless bundle limit is 250 MB unzipped.
  Move them to `[dependency-groups]`
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
- **If `utils/memberMatch.ts` suggestions ever prove too noisy or too sparse in real use, score the
  surname and the given name separately and weight the surname heavily, rather than moving the single
  global threshold.** Bigram similarity over the joined name conflates two signals of very different
  value: a different person sharing a surname scores 0.512, a different person sharing a given name
  scores 0.417, yet a surname is far more identifying. The current `+0.05` surname boost only breaks
  near ties and is overridden whenever the raw scores already differ by more than that, so it cannot
  fix a genuinely wrong ranking on its own

## Decided, no action

- **24 hour times.** Every time the app renders itself is already 24 hour. AM and PM appear only inside
  the native `<input type="time">` pickers on `/admin/dates` and `/admin/settings`, and browsers take
  that format from the browser or OS locale rather than from `<html lang="de">`. A German locale already
  shows 24 hour on today's code, so this is a viewer setting, not a code change
- **Weekday buckets differ from `is_weekend`.** Start time defaults bucket as Mon to Thu, Fri, and Sat
  with Sun, while the scheduler counts Friday as weekend. The divergence is deliberate
