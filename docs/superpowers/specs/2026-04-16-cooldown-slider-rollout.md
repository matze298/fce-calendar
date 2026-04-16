# Design Spec: Cooldown Slider Rollout

## Status
- **Topic:** Cooldown Period Configuration via Slider
- **Strategy:** Database-persistent configuration (Option B)
- **Scope:** Frontend (Admin Dashboard), Backend (API), and E2E Tests

## Architecture & Data Flow
1. **Frontend (Admin Dashboard):**
   - The existing slider in `app/admin/page.tsx` will remain.
   - Users adjust the `cooldownDays` state via the slider.
   - The `saveSettings` function updates the `settings` table in Supabase.
   - The `generateSchedule` function triggers the `/api/generate` endpoint.

2. **Backend (API):**
   - The `/api/generate` endpoint (in `api/generate.py`) currently fetches `cooldown_days` from the `settings` table via `get_scheduler_settings`.
   - The scheduling logic uses this value to filter members who are within the cooldown window.

3. **Database:**
   - The `settings` table stores the `cooldown_days` value.

## Implementation Details

### Frontend Changes (`app/admin/page.tsx`)
- Ensure the slider UI is polished and properly labeled.
- Verify that `saveSettings` correctly persists the slider value.
- Add visual feedback (e.g., a success toast or alert) when settings are saved.
- Ensure the "Neu generieren" button is only enabled when no settings are being saved.

### Backend Changes (`api/generate.py`)
- The backend already supports fetching from the `settings` table.
- Ensure the default fallback (21 days) is consistent with the frontend default.

### E2E Testing (`tests/e2e/admin.spec.ts`)
- Add a new test case to verify the slider interaction:
  - **GIVEN** the admin dashboard is loaded.
  - **WHEN** the user moves the cooldown slider and clicks "Speichern".
  - **THEN** the Supabase `update` call should be triggered with the new value.
  - **AND** a success message should appear.

## Success Criteria
- The admin can adjust the cooldown period using the slider.
- The value is persisted in the database.
- The scheduling algorithm uses the persisted value for new generations.
- E2E tests confirm the slider functionality works as expected.

## Trade-offs (Option B)
- **Pros:** Clear separation between "configuring" and "executing"; consistent behavior for all admin users.
- **Cons:** Requires an extra click to "Save" before the new value is used in generation.
