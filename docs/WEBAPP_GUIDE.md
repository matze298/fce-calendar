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
| `/admin` | `app/admin/page.tsx` | Main dashboard: Viewing assignments & triggering scheduling. |
| `/admin/dates` | `app/admin/dates/page.tsx` | CRUD for work dates/shifts. |
| `/admin/members` | `app/admin/members/page.tsx`| CRUD for club members & manual approvals. |

### 🛠️ API & Server Logic (`/app/api/**/route.ts` & `/api/**/*.py`)
Next.js and Vercel Serverless Functions handle backend logic. For Python devs, these are equivalent to FastAPI endpoints.

| Endpoint | Implementation File | Responsibility |
| :--- | :--- | :--- |
| `/api/generate`| `app/api/generate/route.ts` | **Proxy Route**: Forwards requests to the Python scheduling backend (Vercel Serverless Function at `/api/generate.py`). |
| `/api/cron/send_reminders` | `api/cron/send_reminders.py` | **Cron Job**: Automated daily email reminders for members with upcoming shifts. |

### 🌍 Shared Logic & Global Files
- **`app/layout.tsx`**: The "base template" (like a base Jinja2 template). Contains the HTML structure, fonts, and metadata that persist across all pages.
- **`app/globals.css`**: Global TailwindCSS/Vanilla CSS styles.
- **`utils/supabase.js`**: Initialized Supabase client (the equivalent of a `db_session` or `SQLAlchemy` engine).
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
