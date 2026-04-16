# Gemini Code Assist - Project Guidelines

Welcome to the **FCE Schichtkalender** project. This document serves as a high-level guide for AI-assisted development.

**🚀 Live Documentation Site:** `https://<your-username>.github.io/fce-calendar/` (Requires GitHub Pages activation in settings)

## 📖 Core Reference
The source of truth for the project's logic and architecture is the **[Project Blueprint](./docs/project_blueprint.md)**. Always refer to it before implementing new features or modifying the scheduling algorithm.

## 📂 High-Level Repository Structure

- **`/app`**: Next.js (React) frontend and TypeScript API routes.
- **`/api`**: Python serverless functions containing the core scheduling algorithm logic.
- **`/supabase`**: Database schema, RLS policies, and migration scripts.
- **`/tests`**:
    - **`/tests/backend`**: Python unit tests for the scheduling logic using `pytest`.
    - **`/tests/e2e`**: Playwright tests for critical user journeys and UI stability.
- **`/docs`**: Extended documentation, blueprints, and implementation guides.

### Testing Standards
For the overall testing standards and framework, refer to the **[CI/CD & Testing Blueprint](./docs/ci_cd_blueprint.md)**.

To ensure maintainability and clarity, all tests must follow the **GIVEN, WHEN, THEN** schema. Every test file should utilize comments to explicitly separate these phases.

**E2E Testing Note:** When running Playwright E2E tests, always use the `--reporter=list` (or `dot`) flag to prevent the HTML report from opening automatically in the browser, which can hang in headless or remote environments. Example: `npx playwright test --reporter=list`.

### Schema Requirements:
1. **GIVEN**: Setup the initial state, mock data, and environment.
2. **WHEN**: Execute the specific action or function being tested.
3. **THEN**: Assert the expected outcome and verify side effects.

### Example Pattern:
```python
def test_fairness_distribution():
    # GIVEN A set of members where one member has zero historical shifts
    # and others have several.
    members = setup_mock_members()

    # WHEN The scheduling algorithm generates assignments for a new date
    result = generate_shifts(members, work_date)

    # THEN The member with zero shifts should be prioritized for assignment
    assert result[0].member_id == member_with_zero_shifts.id
```

## 🐍 Python Standards
- **Imports:** Never use relative imports for Python (unless not avoidable, e.g. for tests). Always prefer absolute imports starting from the project root (e.g., `from api.models import Member`).

## 📝 Documentation Maintenance
Maintain the **[WEBAPP_GUIDE.md](./docs/WEBAPP_GUIDE.md)** as a concise technical overview for Python developers. Whenever adding new pages, API routes, or core frontend utilities, update the tables in that guide to reflect the changes.
