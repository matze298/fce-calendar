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
* Phase 1: Seniors -> Important Shifts.
* Phase 2: Weekend availability -> Weekends.
* Phase 3: General availability -> Remaining slots.
* *Fairness:* Sort by `historical_shifts` (Ascending).
* *Cooldown:* Members are ineligible for a new shift if they have an assignment within a 3-week window (21 days) of the target date, counting assignments already published as well as those planned in the same run. This is a "soft" constraint: if no members are available without violating cooldown, the pool reverts to all eligible members for that phase to ensure the shift is filled.
* *Existing work counts:* Published assignments count toward a member's fairness total and toward a date's `required_people`, and a member already on a date is never assigned to it twice.
* *Configuration:* The cooldown period and the default start times per weekday bucket (Mon-Thu, Fri, Sat/Sun) are stored in the `settings` table and editable under `/admin/settings`.

## 4. Security & GDPR (Germany/EU Standards)
* Strict Row Level Security (RLS) in Supabase. **Target, not current.** Every table still grants `FOR ALL TO authenticated USING (true)`, and `anon` can read all member rows. See `ROADMAP.md` in the repository root, which tracks this as a blocker for holding real member data.
* No personal data beyond name/contact/availability.
* "Right to be forgotten" button in Admin UI. Implemented in `app/admin/members/page.tsx`.
* Use `.env.local` for all credentials.

## 5. Local Development
* `supabase start` for local Docker DB. *Target, not current: there is no `supabase/config.toml`, so this does not run yet. Develop against the hosted project instead.*
* `npm run dev` for normal local frontend development. The script uses Webpack instead of Turbopack to avoid filesystem and HMR issues on mounted workspaces.
* `npx vercel dev` only when testing Vercel's Python/serverless-function emulation.
* Fake club member data (e.g., "Max Mustermann") is seeded by `supabase/setup.sql`, not a separate `seed.sql`. Note that the same file drops all tables first, so it is safe to run only against an empty database.

## 6. Automated Reminders (Vercel Cron Jobs)
* **Strategy:** Use Vercel's native Cron feature to trigger a Python Serverless Function once daily at 08:00 AM CET.
* **The Endpoint:** Create `/api/cron/send_reminders.py`.
* **Security:** The endpoint MUST verify the `Authorization: Bearer <CRON_SECRET>` header provided by Vercel before executing any logic.
* **Execution Logic:**
    1. Query Supabase for all `Assignments` with `status = 'Published'` where the associated `WorkDate` is exactly 7 days away (and/or 1 day away).
    2. Fetch the corresponding member's `email`.
    3. Use the `resend` Python SDK to fire a branded FC Egenhausen email reminder.
* **Configuration:** Add a `vercel.json` file to the project root scheduling the job using a standard cron expression (e.g., `0 7 * * *` for 8 AM CET).
