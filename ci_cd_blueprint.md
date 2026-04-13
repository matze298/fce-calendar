# CI/CD & Testing Blueprint - FC Egenhausen Scheduling App

## 1. CI/CD Architecture & Philosophy
* **Version Control:** GitHub.
* **Branching Strategy:** Feature branches (e.g., `feature/new-ui`) merge into `main` via Pull Requests (PRs). **Never push directly to main.**
* **Continuous Deployment (CD):** Handled natively by Vercel.
    * Every PR generates a temporary Vercel Preview URL.
    * Every merge to `main` auto-deploys to Production.
* **Continuous Integration (CI):** Handled by GitHub Actions. Runs automatically on every PR to ensure code quality, test the Python algorithm, and verify database migrations.

## 2. The Tool Stack
* **Frontend Testing:** `Vitest` (for fast React component testing) and `Playwright` (for End-to-End browser testing).
* **Backend/Algorithm Testing:** `pytest` (for the Python fairness logic).
* **Database CI:** Supabase GitHub Actions (to verify migrations apply cleanly).
* **Linting/Formatting:** `ESLint` + `Prettier` (Frontend), `Ruff` or `Flake8` (Python).

## 3. Implementation Phases (For the AI Agent)

### Phase 1: Vercel & GitHub Integration setup
1.  **Task:** Generate the terminal commands to initialize a Git repository, commit the current local state, and provide instructions on linking the repo to Vercel via the Vercel Dashboard.
2.  **Goal:** Establish the baseline where pushing to `main` updates the live site.

### Phase 2: Python Backend Testing (`pytest`)
* **Context:** The Python fairness algorithm (`/api/generate.py`) is the brain of the app. If it breaks, the club schedule breaks.
1.  **Task:** Set up a `tests/backend/` directory.
2.  **Task:** Write `pytest` test cases that mock Supabase database responses.
3.  **Required Tests:** * Verify Seniors are assigned to Important shifts.
    * Verify historical shift sorting (fairness) works perfectly.
    * Verify weekend constraints are respected.

### Phase 3: Database Migration CI (Supabase)
* **Context:** We cannot break the production database. Schema changes must be tested.
1.  **Task:** Configure the Supabase GitHub Action (`.github/workflows/ci.yml`).
2.  **Workflow Logic:** On every PR, the action should spin up a temporary Supabase database, run `supabase db start`, apply all SQL migrations in `/supabase/migrations/`, and verify there are no conflicts or syntax errors before allowing the merge.

### Phase 4: E2E Guardrails (`Playwright`)
* **Context:** We need a robot to click through the UI to ensure the critical paths work.
1.  **Task:** Install Playwright and create a `tests/e2e/` folder.
2.  **Required Tests:**
    * Admin Login flow (using a mock auth state).
    * Navigating to the "Member List" and verifying data renders.
    * Clicking "Generate Schedule" and verifying the UI updates without crashing.

## 5. Security Check (GDPR)
* The CI pipeline must include a step to check for leaked secrets (API keys) in the codebase.
* Ensure test data used in `pytest` and Playwright uses fake German names (e.g., "Max Mustermann") and never pulls from the live production database.
