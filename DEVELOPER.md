# FCE Shift Calendar - Developer Documentation

This document contains technical details for setting up and operating the shift scheduling system for 1. FC Egenhausen.

## 1. Technical Stack
- **Frontend:** Next.js (React), Tailwind CSS v4
- **Backend:** Vercel Serverless Functions (Python & TypeScript)
- **Database & Auth:** Supabase (PostgreSQL)

## 2. Database Setup
The database is configured manually via the Supabase Dashboard.

1. Open the **SQL Editor** in your [Supabase Dashboard](https://supabase.com/dashboard).
2. Execute the full setup script: [supabase/setup.sql](./supabase/setup.sql).
3. This creates all tables, RLS (Row Level Security) policies, and seed data.

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
   Use the Vercel CLI to test both the frontend and API routes locally:
   ```bash
   npx vercel dev
   ```
4. **Login:**
   Register via the app or use the test account:
   - **User:** `dev@localhost.test`
   - **Pass:** `devpassword`
   *(Note: The Admin status must be linked to the `auth_id` in the database).*

## 4. Authentication & Permissions
The system uses a two-stage approval process:
- **Registration:** Anyone can create an account, but will initially have no access.
- **Approval:** An administrator must approve new accounts in the Admin Dashboard (`is_approved`).
- **Admin Status:** Only users with `is_admin = true` can access the dashboard and generate shifts.

## 5. Algorithm (Shift Generator)
The planning logic is located in `app/api/generate/route.ts` (TypeScript) and `api/generate.py` (Python reference).
Assignments occur in 3 phases:
1. **Seniors:** Priority for "Important" shifts.
2. **Weekends:** Assigned based on weekend availability.
3. **Weekdays:** Distribution of remaining shifts.
*Fairness Rule: Members with the fewest historical shifts are prioritized first.*
