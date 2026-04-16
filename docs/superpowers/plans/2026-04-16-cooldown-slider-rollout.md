# Cooldown Slider Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the integration of the cooldown period slider in the Admin UI, ensuring it persists to the database and is verified by E2E tests.

**Architecture:** The UI uses a React range slider to update local state, which is then persisted to the Supabase `settings` table. The backend scheduler fetches this value before generating assignments.

**Tech Stack:** Next.js (React), Supabase (PostgreSQL), Playwright (E2E Testing).

---

### Task 1: Polish Frontend Slider & Feedback

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Improve Slider UI and Labels**
Update the slider section to provide better visual feedback and ensure consistent styling.

```tsx
// Inside the settings section in app/admin/page.tsx
<div className="flex-grow flex items-center gap-4">
  <div className="flex flex-col flex-grow">
    <div className="flex justify-between items-center mb-1">
      <label htmlFor="cooldown-slider" className="text-xs font-bold uppercase text-secondary/60 tracking-wider">
        Abkühlphase
      </label>
      <span className="text-2xl font-black text-secondary">{cooldownDays} Tage</span>
    </div>
    <input
      id="cooldown-slider"
      type="range"
      min="0"
      max="60"
      step="1"
      value={cooldownDays}
      onChange={(e) => setCooldownDays(parseInt(e.target.value))}
      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary border border-black/5"
    />
    <div className="flex justify-between text-[10px] font-bold text-muted mt-1 px-1">
      <span>0 TAGE</span>
      <span>30 TAGE</span>
      <span>60 TAGE</span>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Ensure proper disabled state for buttons**
Ensure the "Speichern" and "Neu generieren" buttons respect the `isSavingSettings` state.

```tsx
// Update Neu generieren button
<button
  className="..."
  onClick={generateSchedule}
  disabled={isGenerating || isSavingPlan || isCancelling || isSavingSettings}
>
  {isGenerating ? '...' : 'Neu generieren'}
</button>

// Update Speichern button in settings section
<button
  onClick={saveSettings}
  disabled={isSavingSettings || isGenerating}
  className="..."
>
  {isSavingSettings ? '...' : 'Speichern'}
</button>
```

- [ ] **Step 3: Commit UI changes**

```bash
git add app/admin/page.tsx
git commit -m "ui: polish cooldown slider and add disabled states"
```

### Task 2: Backend Consistency Verification

**Files:**
- Modify: `api/generate.py`

- [ ] **Step 1: Align default values**
Ensure the backend's default fallback matches the frontend's default (21 days).

```python
# In api/generate.py, ensure get_scheduler_settings and generate_assignments use 21
def get_scheduler_settings(supabase: Client) -> dict[str, Any]:
    # ...
    return {"cooldown_days": 21}

def generate_assignments(
    members: list[dict[str, Any]], work_dates: list[dict[str, Any]], cooldown_days: int = 21
) -> list[dict[str, Any]]:
    # ...
```

- [ ] **Step 2: Run backend tests to ensure no regressions**

Run: `pytest tests/api/test_generate.py -v`
Expected: PASS

- [ ] **Step 3: Commit backend alignment**

```bash
git add api/generate.py
git commit -m "fix: align backend cooldown default with frontend"
```

### Task 3: Implement E2E Test for Cooldown Configuration

**Files:**
- Modify: `tests/e2e/admin.spec.ts`

- [ ] **Step 1: Add E2E test case for the slider**
Add a test that verifies moving the slider and clicking "Speichern" triggers the correct API call.

```typescript
  // Add this to the "Admin Dashboard" describe block in tests/e2e/admin.spec.ts
  test('Adjusting cooldown slider and saving settings', async ({ page }) => {
    // GIVEN a mocked settings update route
    let capturedBody: any = null;
    await page.route(url => url.href.includes('/rest/v1/settings'), async (route) => {
      const method = route.request().method();
      if (method === 'PATCH' || method === 'PUT') {
        capturedBody = route.request().postDataJSON();
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    await page.goto('/admin');
    await expect(page.locator('h1')).toContainText('Admin-Bereich');

    // WHEN adjusting the slider
    const slider = page.locator('#cooldown-slider');
    await slider.fill('45'); // Playwright fill works for range inputs

    // AND clicking Speichern
    const saveBtn = page.getByRole('button', { name: 'Speichern' });
    const dialogPromise = page.waitForEvent('dialog');
    await saveBtn.click();

    // THEN the success dialog is shown
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('erfolgreich gespeichert');
    await dialog.accept();

    // AND the correct data was sent to Supabase
    expect(capturedBody).toMatchObject({
      cooldown_days: 45
    });
  });
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/admin.spec.ts --reporter=list`
Expected: PASS

- [ ] **Step 3: Commit E2E test**

```bash
git add tests/e2e/admin.spec.ts
git commit -m "test: add e2e test for cooldown slider configuration"
```
