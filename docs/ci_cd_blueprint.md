# CI/CD & Testing Blueprint - FC Egenhausen Scheduling App

## 1. CI/CD Architecture & Philosophy
* **Version Control:** GitHub.
* **Branching Strategy:** Feature branches (e.g., `feature/new-ui`) merge into `main` via Pull Requests (PRs). **Never push directly to main.**
* **Continuous Deployment (CD):** Intended to be handled natively by Vercel, with a preview URL per PR and production on merge to `main`. **Target, not current:** no Vercel check or preview comment appears on pull requests, and the only registered deployments are the GitHub Pages builds of this documentation, so the app does not appear to be deployed yet.
* **Continuous Integration (CI):** Handled by GitHub Actions. Four workflows run on every PR: backend tests, frontend checks, E2E, and database migration verification.

## 2. The Tool Stack
* **Frontend Testing:** `Vitest` (for unit tests of the shared helpers in `utils/`, under `tests/unit/`) and `Playwright` (for End-to-End browser testing). *Component tests are a target, not current: there are none yet.*
* **Backend/Algorithm Testing:** `pytest` (for the Python fairness logic) and `ty` (for Python type checking).
* **Database CI:** Supabase GitHub Actions (to verify migrations apply cleanly).
* **Linting/Formatting:** `ESLint` and `Ruff`, both gating CI. *`Prettier` is a target, not current: it is not configured.*

## 3. Implementation Phases (For the AI Agent)

### Phase 1: Vercel & GitHub Integration setup
1.  **Task:** Generate the terminal commands to initialize a Git repository, commit the current local state, and provide instructions on linking the repo to Vercel via the Vercel Dashboard.
2.  **Goal:** Establish the baseline where pushing to `main` updates the live site.

### Phase 2: Scheduler and Backend Testing
* **Context:** The scheduling algorithm is the brain of the app. If it breaks, the club schedule breaks.
1.  **Task:** The algorithm is a pure function in `utils/schedule.ts`, covered by `vitest` in `tests/unit/schedule.test.ts`. It is deliberately separated from `app/api/generate/route.ts` so it can be tested without a database or a running server.
2.  **Task:** The remaining Python is the reminder cron, tested with `pytest` under `tests/api/`, mirroring the `api/` package layout and mocking Supabase responses.
3.  **Required scheduler tests:** * Verify Seniors are assigned to Important shifts.
    * Verify historical shift sorting (fairness) works perfectly.
    * Verify weekend constraints are respected.
    * Verify the cooldown holds members back, counting published assignments, and yields when that would leave a shift unstaffed.
    * Verify published assignments count toward a date's `required_people` and are never double-booked.

### Phase 3: Database Migration CI (Supabase)
* **Context:** We cannot break the production database. Schema changes must be tested.
1.  **Task:** Configure the Supabase GitHub Action (`.github/workflows/database-migrations.yml`).
2.  **Workflow Logic:** On every PR, the action should spin up a temporary Supabase database, run `supabase db start`, apply all SQL migrations in `/supabase/migrations/`, and verify there are no conflicts or syntax errors before allowing the merge.

### Phase 4: E2E Guardrails (`Playwright`)
* **Context:** We need a robot to click through the UI to ensure the critical paths work.
1.  **Task:** Install Playwright and create a `tests/e2e/` folder.
2.  **Required Tests:**
    * Admin Login flow (using a mock auth state).
    * Navigating to the "Member List" and verifying data renders.
    * Clicking "Generate Schedule" and verifying the UI updates without crashing.

### Phase 5: Frontend Gating (lint, types, unit tests, build)
* **Context:** A page referencing an undeclared hook once broke `npm run build` and reached `main`, because no job checked the frontend at all.
1.  **Task:** `.github/workflows/frontend-checks.yml` runs `npm run lint`, `npx tsc --noEmit`, `npm run test:unit` and `npm run build` on every PR.
2.  **Note on the effect rules:** `react-hooks/set-state-in-effect` (plugin v7, compiler based) rejects a mount effect whose call graph reaches a second memoized callback that sets state. The shape it accepts is a plain reader function outside the component plus a single state-setting site, which is why the admin pages load data that way.

## 4. Security Check (GDPR)
* The CI pipeline must include a step to check for leaked secrets (API keys) in the codebase. **Target, not current:** no such step exists.
* Ensure test data used in `pytest` and Playwright uses fake German names (e.g., "Max Mustermann") and never pulls from the live production database.
