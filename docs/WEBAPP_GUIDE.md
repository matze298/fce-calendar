# FCE Schichtkalender - WebApp Implementation Guide (For Python Developers)

This guide provides a high-level overview of the Next.js (TypeScript) frontend architecture. For a Senior Python developer, think of Next.js as a mix of **FastAPI** (for routing/API) and **Jinja2/React** (for templating/UI).

## 🚀 Core Architecture: Next.js App Router
We use the **Next.js App Router**, which is a file-system based router. Each folder in `/app` represents a URL path.

### 🏠 Page Routing (`/app/**/page.tsx`)
Each `page.tsx` file defines the UI for its directory's path.

| Path | Implementation File | Responsibility |
| :--- | :--- | :--- |
| `/` | `app/page.tsx` | Landing page & main entry point. |
| `/login` | `app/login/page.tsx` | User authentication via Supabase. |
| `/register` | `app/register/page.tsx` | Member registration & account creation. |
| `/dienstplan` | `app/dienstplan/page.tsx` | Member-facing duty plan: every published date with the people on it, the viewer's own entries marked, their next duty named, and an opt-in for past dates. Shows an admin link only to an admin. |
| `/admin` | `app/admin/page.tsx` | Main dashboard: Viewing assignments & triggering scheduling. |
| `/admin/dates` | `app/admin/dates/page.tsx` | CRUD for work dates/shifts. |
| `/admin/settings` | `app/admin/settings/page.tsx` | Scheduler configuration: default start times & cooldown period. |
| `/admin/members` | `app/admin/members/page.tsx`| CRUD for club members & manual approvals. |

### 🛠️ API & Server Logic (`/app/api/**/route.ts` & `/api/**/*.py`)
Next.js and Vercel Serverless Functions handle backend logic. For Python devs, these are equivalent to FastAPI endpoints.

| Endpoint | Implementation File | Responsibility |
| :--- | :--- | :--- |
| `/api/generate`| `app/api/generate/route.ts` | Builds the draft plan. Requires an `Authorization: Bearer <token>` header carrying the caller's own Supabase session (401 without one, 403 if the caller is not an approved admin). Reads members with their per-Bereich availability, work dates, published assignments and the cooldown setting as that caller, then delegates to `utils/schedule.ts` and writes the drafts back. |
| `/api/cron/send_reminders` | `api/cron/send_reminders.py` | **Cron Job**: Automated daily email reminders for members with upcoming shifts. Runs with `SUPABASE_SERVICE_ROLE_KEY` and refuses to start without it. |

### 🗄️ Database Read Model (`supabase/migrations/`)
Row Level Security restricts every table to admins except a member's own `members` row and their
own `member_bereiche` rows. The objects below are the additional read surfaces built for
member-facing pages:

| Object | Columns | Responsibility |
| :--- | :--- | :--- |
| `public.published_schedule` | `workdate_id`, `date`, `event_name`, `start_time`, `member_id`, `member_name`, `bereich` | The whole published plan: one flat row per date/person pair, readable by any approved member. No email address. Feeds `/dienstplan`. |
| `member_bereiche` | `member_id`, `bereich` | A row means the member is available for that Bereich (duty area). An admin manages every row, and a member reads only their own. |

`work_dates` also carries a `bereich` column (`Sportheim-Bewirtung`, `Fruehschoppen`, or `Sportplatz-Ordner`), defaulting to `Sportheim-Bewirtung`. A calendar date can carry more than one Bereich, so uniqueness is on `(date, bereich)` rather than on `date` alone.

Two triggers sit alongside the RLS policies above:

| Trigger | Enforces |
| :--- | :--- |
| `on_member_created` | A new member gets a `member_bereiche` row for `Sportheim-Bewirtung` automatically. |
| `on_assignment_double_booking` | A member cannot hold a second assignment on a calendar date already worked, in any Bereich. |

### 🌍 Shared Logic & Global Files
- **`app/layout.tsx`**: The "base template" (like a base Jinja2 template). Contains the HTML structure, fonts, and metadata that persist across all pages.
- **`app/globals.css`**: Global TailwindCSS/Vanilla CSS styles.
- **`utils/supabase.js`**: Initialized Supabase client (the equivalent of a `db_session` or `SQLAlchemy` engine).
- **`utils/startTime.ts`**: Weekday bucket defaults, `TIME` value trimming, and date-only string parsing.
- **`utils/adminGuard.ts`**: `checkAdminAccess()`, the shared admin check for the `/admin` pages. A UI convenience only, not a security boundary.
- **`utils/memberGuard.ts`**: `checkMemberAccess()`, resolving a signed-in visitor into an approved member (with an `isAdmin` flag), `unauthenticated`, `pending` (registered but not yet approved or linked), or `error` (the auth or members lookup itself failed, distinct from either of the above). A UI convenience only. `published_schedule` enforces the real boundary through RLS.
- **`utils/memberSchedule.ts`**: `groupScheduleRows()` and `findNextOwnDuty()`, pure functions grouping the flat `published_schedule` rows into per-date entries and locating the viewer's next own duty.
- **`utils/signOut.ts`**: `signOutAndRedirect()`, ending the Supabase session and returning the visitor to `/login`. Used by `app/components/SignOutButton.tsx` on `/dienstplan` and every `/admin` page.
- **`utils/errors.ts`**: `errorMessage()`, for the message of a caught value that may not be an `Error`.
- **`utils/memberMatch.ts`**: Ranks existing members against a registration claim, normalizing German spelling variants so "Mueller" matches "Müller". Used only by the admin UI.
- **`utils/appointmentExport.ts`**: Turns work dates and published assignments into the two tables the PDF export prints. Pure, and where the export's rules live.
- **`utils/appointmentPdf.ts`**: Renders those tables as an A4 PDF with jsPDF. Imports jsPDF lazily so it stays out of the initial bundle.
- **`next.config.ts`**: Framework configuration (similar to `pyproject.toml` or `settings.py`).

## 🧠 Key Concepts for Python Developers

1. **Client Components (`'use client'`)**:
   - Files starting with `'use client'` are interactive and run in the browser.
   - They use `useState` (for local variable tracking) and `useEffect` (for triggering actions on load).
   - **Critical Actions**: Some pages contain complex local logic. For example, `app/admin/page.tsx` includes a **Reset Plan** function that interacts directly with Supabase to clear all assignments.

2. **TypeScript (TS)**:
   - Think of TS as "Python with mandatory type hints". We define `type Member = { ... }` or `interface` to ensure data structures are consistent.

3. **Supabase Client**:
   - Used for database queries. Syntax: `supabase.from('table').select('*').eq('id', value)`. Very similar to Pandas filtering or SQLAlchemy Query objects.

## 🔄 Rosetta Stone: Python vs. TypeScript

**Python (FastAPI/SQLAlchemy style)**
```python
# Function to get only senior members
def get_senior_members(members: List[Member]) -> List[Member]:
    # List comprehension
    return [m for m in members if m.seniority_level == "Senior"]
```

**TypeScript (Next.js/React style)**
```typescript
// Function to get only senior members
const getSeniorMembers = (members: Member[]): Member[] => {
  // Array .filter() method
  return members.filter(m => m.seniority_level === "Senior");
};
```

## ❓ Why TypeScript and not Python for the Frontend?

While Python is the king of data science and backend logic, TypeScript is the industry standard for modern web interfaces for several reasons:

1.  **Type-Safe UI Components**: TypeScript ensures that when you pass a `Member` object to a UI component, the component knows exactly which fields exist. This prevents "Undefined" errors in the browser that are common in plain JavaScript.
2.  **Superior Tooling**: IDEs (VS Code) provide instant feedback on CSS, HTML, and Data structures as you type.
3.  **Vercel/Next.js Optimization**: The framework is built on top of the Node.js ecosystem. Running Python on the frontend (via tools like PyScript) is currently too heavy and slow for a snappy user experience.

## 📖 Further Reading
- [Next.js Documentation](https://nextjs.org/docs) - Focus on "App Router".
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction) - For database operations.
- [TypeScript in 5 Minutes](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html) - For Python developers.
