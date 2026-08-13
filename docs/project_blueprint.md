# Club Scheduling App - Project Blueprint (FC Egenhausen Edition)

## 1. Architecture & Tech Stack
* **Frontend:** Next.js (React), Tailwind CSS. *PWA configuration is a target, not current: no manifest exists yet.*
* **Backend:** Vercel (Hobby Tier) + Python API routes.
* **Database:** Supabase (PostgreSQL).
* **Notifications:** Resend (Email) only. Paid channels such as SMS or WhatsApp are the fallback if email ever proves insufficient. *Web Push is a target, not current.*
* **Language:** **German (Deutsch)** for all user-facing interfaces.

## 2. UI/UX & Brand Integration (Seamless Design)
* **Brand Identity:** Design must match `https://www.fcegenhausen.de/` and the Black and Yellow crest of 1. FC Egenhausen 1921.
* **Primary Color:** Golden Yellow (`#FFD700`) for primary actions, buttons, and active states.
* **Secondary Color:** Deep Black (`#000000`) for navigation bars, headers, and high-contrast text.
* **Backgrounds:** Clean White (`#FFFFFF`) or very light gray (`#F8F9FA`) for content cards.
* **Localization:** Fully localized in **German** to cater to the local club members and admins.
* **Typography:** Clean sans-serif (Inter or system fonts) to match the professional sports-club aesthetic.
* **UI Pattern:** Card-based layout for mobile clarity. High-importance shifts should be visually distinguished using the primary brand color.

## 3. Core Logic (The Scheduling Algorithm)
* **Where it lives:** `utils/schedule.ts`, a pure function unit tested in `tests/unit/schedule.test.ts`. `app/api/generate/route.ts` is the thin shell that reads from Supabase, calls it, and writes the drafts back.
* **Bereiche (duty areas):** Every work date belongs to exactly one of three Bereiche, `Sportheim-Bewirtung`, `Fruehschoppen`, or `Sportplatz-Ordner`. A member's availability is tracked separately per Bereich (`member_bereiche`), defaulting to `Sportheim-Bewirtung` for every member. A member is only ever considered for a date in a Bereich they are listed as available for.
* The generator runs Phases 1 through 3 below once per Bereich. Fairness and cooldown are scoped to that Bereich, so a member's count and rest period in `Fruehschoppen` are independent of their count and rest period in `Sportheim-Bewirtung`. `historical_shifts` counts toward `Sportheim-Bewirtung` fairness only, since it predates the other two Bereiche and every duty it recorded was one.
* The one cross-Bereich rule: a member holds at most one duty per calendar date, whichever Bereich it is in. The database enforces this with a trigger, since two `work_dates` rows can share a date across different Bereiche, which a unique index cannot express.
* Phase 1: Seniors -> Important Shifts.
* Phase 2: Weekend availability -> Weekends.
* Phase 3: General availability -> Remaining slots.
* *Fairness:* Sort by `historical_shifts` (Ascending).
* *Cooldown:* Members are ineligible for a new shift if they have an assignment within a 3-week window (21 days) of the target date, counting assignments already published as well as those planned in the same run. This is a "soft" constraint: if no members are available without violating cooldown, the pool reverts to all eligible members for that phase to ensure the shift is filled.
* *Existing work counts:* Published assignments count toward a member's fairness total and toward a date's `required_people`, and a member already on a date is never assigned to it twice.
* *Configuration:* The cooldown period and the default start times per weekday bucket (Mon-Thu, Fri, Sat/Sun) are stored in the `settings` table and editable under `/admin/settings`.
* *Export:* The admin dashboard produces a printable A4 PDF of the schedule, carrying the club logo, a table of appointments with the people assigned to each, and a table listing every member's duties. Published assignments only, upcoming dates by default, with an opt-in for past dates.

## 4. Security & GDPR (Germany/EU Standards)
* Row Level Security (RLS) in Supabase. Administrators are identified by `public.is_admin()`, a `SECURITY DEFINER` predicate every admin policy uses instead of a policy on `members` querying `members`, which would recurse. Administrators have full access to `members`, `work_dates`, `assignments` and `member_bereiche`, and read plus update on `settings` and read plus delete on `registrations`. A non-admin member can read exactly their own `members` row and their own `member_bereiche` rows, and, through the `public.published_schedule` view, the whole published plan with the names of everyone on each date, visible at `/dienstplan`. Writes to every table and the admin area stay closed to a non-admin member. `anon` holds no privilege on any table. A pgTAP suite (`supabase/tests/access_control_test.sql`) asserts all of this and runs in CI.
* No personal data beyond name/contact/availability.
* "Right to be forgotten" button in Admin UI. Implemented in `app/admin/members/page.tsx`.
* Use `.env.local` for all credentials.
* **Registration:** Anyone can create an account. Registration collects Vorname and Nachname and writes a claim to the `registrations` table. It never creates or modifies a member row, so a self-asserted name cannot inherit an existing member's record.
* **Linking:** An administrator resolves each claim on `/admin/members`, either linking it to an existing member from a ranked list of suggestions or creating a new member.

## 5. Local Development
* `npm run db:start` brings up a local Docker Postgres, `db:reset` applies the migration chain and seed data against it, and `db:test` runs the pgTAP suite. There is no `supabase/config.toml`, so the full local stack (`supabase start`, with Auth and the REST gateway) does not come up. Develop against the hosted project for anything that needs a running API.
* `npm run dev` for normal local frontend development. The script uses Webpack instead of Turbopack to avoid filesystem and HMR issues on mounted workspaces.
* `npx vercel dev` only when testing Vercel's Python/serverless-function emulation.
* Fake club member data (e.g., "Max Mustermann") is seeded by `supabase/seed.sql`, which only inserts rows. The schema itself lives in `supabase/migrations/`, applied in order by `npm run db:reset`.

## 6. Automated Reminders (Vercel Cron Jobs)
* **Strategy:** Use Vercel's native Cron feature to trigger a Python Serverless Function once daily at 08:00 AM CET.
* **The Endpoint:** Create `/api/cron/send_reminders.py`.
* **Security:** The endpoint MUST verify the `Authorization: Bearer <CRON_SECRET>` header provided by Vercel before executing any logic.
* **Execution Logic:**
    1. Query Supabase for all `Assignments` with `status = 'Published'` where the associated `WorkDate` is exactly 7 days away (and/or 1 day away).
    2. Fetch the corresponding member's `email`.
    3. Use the `resend` Python SDK to fire a branded FC Egenhausen email reminder.
* **Configuration:** Add a `vercel.json` file to the project root scheduling the job using a standard cron expression (e.g., `0 7 * * *` for 8 AM CET).
