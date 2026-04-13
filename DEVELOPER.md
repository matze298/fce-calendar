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
## 6. Testing

The project uses a two-tier testing strategy to ensure the fairness algorithm and critical UI paths remain stable.

### Backend Tests (Python)
The scheduling logic is tested using `pytest`. These tests use mocked Supabase data and do not require a live database.
- **Run all backend tests:**
  ```bash
  PYTHONPATH=. uv run pytest tests/backend/
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
