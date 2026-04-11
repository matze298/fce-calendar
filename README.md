This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Setup

### 1. Initialize Project
The project was initialized with the following commands:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
npm install @supabase/supabase-js supabase --save-dev
```

### 2. Database Configuration
To set up your Supabase database, run the following SQL script in your Supabase SQL Editor:
[supabase/setup.sql](./supabase/setup.sql)

This script will automatically:
- Create the `Members`, `WorkDates`, and `Assignments` tables.
- Set up GDPR-compliant Row Level Security (RLS).
- Insert 50 realistic German test members.
- Generate 6 months of empty WorkDates (May–Oct 2026).

### 3. Environment Variables
Create a `.env.local` file in the root directory and add your Supabase credentials. 

**Where to find these:**
1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project.
3. Go to **Project Settings** (gear icon at the bottom of the sidebar).
4. Click on **API**.
5. Copy the **Project URL** and the **`anon` public API Key** (also called the **Publishable** key). 

**Important Security Note:**
- **YES (Use this):** `anon` public key (starts with `eyJ...`). This is safe to use in the browser with RLS enabled.
- **NO (Do NOT use):** `service_role` secret key. This key bypasses all security rules and should **never** be exposed in a `.env.local` file that starts with `NEXT_PUBLIC_`.

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-long-anon-jwt-key
```

### 4. Authentication Setup
This project uses Supabase Auth for the Admin area.

1. **Enable Email Auth:** In the Supabase Dashboard, go to **Authentication -> Providers** and ensure **Email** is enabled.
2. **Registration:** You can create new accounts via the `/register` page in the app.
3. **Email Confirmation:** By default, Supabase requires users to confirm their email address. 
   - **For Testing:** You can disable this in **Authentication -> Settings -> User Signup** by toggling off "Confirm email".
   - **Local Dev:** If you use the `dev@localhost` / `devpassword` credentials, you must manually create this user in the **Authentication -> Users** tab of the Supabase Dashboard.

## Getting Started

To run both the **Next.js frontend** and the **Python API routes** simultaneously, you must use the Vercel CLI:

1. **Install Vercel CLI (if not already done):**
   ```bash
   npm install
   ```

2. **Run the development server:**
   ```bash
   npx vercel dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

**Note:** Standard `npm run dev` only starts the Next.js server and will not handle the Python `/api` routes, leading to network errors when generating the schedule.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
