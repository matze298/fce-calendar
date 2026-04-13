# Club Scheduling App - Project Blueprint (FC Egenhausen Edition)

## 1. Architecture & Tech Stack
* **Frontend:** Next.js (React), Tailwind CSS. Configured as a PWA.
* **Backend:** Vercel (Hobby Tier) + Python API routes.
* **Database:** Supabase (PostgreSQL).
* **Notifications:** Resend (Email), Telegram Bot, Web Push.
* **Language:** **German (Deutsch)** for all user-facing interfaces.

## 2. UI/UX & Brand Integration (Seamless Design)
* **Brand Identity:** Design must match `https://www.fcegenhausen.de/` and the Black and Yellow crest of 1. FC Egenhausen 1921.
* **Primary Color:** Golden Yellow (`#FFD700`) for primary actions, buttons, and active states.
* **Secondary Color:** Deep Black (`#000000`) for navigation bars, headers, and high-contrast text.
* **Backgrounds:** Clean White (`#FFFFFF`) or very light gray (`#F8F9FA`) for content cards.
* **Localization:** Fully localized in **German** to cater to the local club members and admins.
* **Typography:** Clean sans-serif (Inter or system fonts) to match the professional sports-club aesthetic.
* **UI Pattern:** Card-based layout for mobile clarity. High-importance shifts should be visually distinguished using the primary brand color.

## 3. Core Logic (The Python Algorithm)
* Phase 1: Seniors -> Important Shifts.
* Phase 2: Weekend availability -> Weekends.
* Phase 3: General availability -> Remaining slots.
* *Fairness:* Sort by `historical_shifts` (Ascending).

## 4. Security & GDPR (Germany/EU Standards)
* Strict Row Level Security (RLS) in Supabase.
* No personal data beyond name/contact/availability.
* "Right to be forgotten" button in Admin UI.
* Use `.env.local` for all credentials.

## 5. Local Development
* `supabase start` for local Docker DB.
* `vercel dev` for local frontend/backend testing.
* `seed.sql` with fake club member data (e.g., "Max Mustermann").
