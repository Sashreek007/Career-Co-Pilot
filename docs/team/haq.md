# Agent Brief: Haq

## Role
Infrastructure + Settings Engineer. You own the Settings feature (fully self-contained) and the Docker/backend infrastructure. Your work is independent of all other feature packages.

## Assigned Packages
- `packages/feature-settings` — Settings page with localStorage persistence
- `backend/` — FastAPI stub
- `docker-compose.yml`, `packages/app/Dockerfile`, `packages/app/nginx.conf`

## Prerequisite
Wait for Sashreek's `feat(app)` PR to merge before running `pnpm dev` to verify settings. You can work on backend/Docker independently immediately.

---

## Task 1: Improve packages/feature-settings

Read all files in `packages/feature-settings/src/`.

**Current state:** SettingsPage with 4 sections. Zustand store persists to localStorage. All inputs are wired.

**Your improvements:**

1. **Add a "Save" confirmation toast**:
   When any input changes and the user moves focus away (onBlur), show a subtle inline confirmation: a small green checkmark icon + "Saved" text that appears for 2 seconds then fades. Implement with `useState<boolean>` and `setTimeout`. Place it in the top-right corner of each section card.

2. **LLMSection — improve API key input**:
   - Add a "Test Connection" button that, when clicked, shows `Testing…` for 1 second then shows either a green "✓ Connected" or red "✗ Failed" message (stub — always show "Connected" after 1s delay using `setTimeout`). Use `useState` for the test state.
   - The test button should be disabled if `llmApiKey` is empty.

3. **BackupRestoreSection — implement export**:
   When "Export Backup" is clicked, serialize the entire `useSettingsStore` state to a JSON blob and trigger a real file download named `career-copilot-backup-<date>.json`. Use:
   ```ts
   const state = useSettingsStore.getState();
   const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a'); a.href = url; a.download = `career-copilot-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
   ```

4. **Add a version display** at the bottom of the page:
   ```tsx
   <p className="text-xs text-zinc-600 text-center pt-4">Career Co-Pilot v0.1.0 — scaffold phase</p>
   ```

**Definition of done:** Settings page renders all 4 sections. Values persist to localStorage (verify via DevTools → Application → Local Storage). Export backup downloads a JSON file. No TypeScript errors.

---

## Task 2: Verify and finalise Docker infrastructure

Read `docker-compose.yml`, `backend/Dockerfile`, `packages/app/Dockerfile`, `packages/app/nginx.conf`.

**Backend verification:**

1. From the repo root, run:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
2. Verify `http://localhost:8000/health` returns `{"status": "ok", "timestamp": "..."}`.
3. Verify `http://localhost:8000/docs` shows FastAPI Swagger UI.

**Add a second backend route for readiness:**

In `backend/app/routers/health.py`, add:
```python
@router.get("/ready")
def readiness_check():
    return {"ready": True, "version": "0.1.0"}
```

**Docker Compose verification:**

1. From the repo root, run `docker compose up --build`
2. Wait for both services to start (check logs)
3. Verify `http://localhost:3000` serves the React app
4. Verify `http://localhost:8000/health` returns OK from inside Docker

**Fix nginx config if needed:**
If the frontend can't reach the backend at `/api/`, verify the nginx proxy_pass is `http://backend:8000/` (service name matches docker-compose service name `backend`).

**Definition of done:** `docker compose up --build` completes without errors. Both endpoints are reachable. `docker compose down` cleans up correctly.

---

## Git Workflow

```bash
# Before starting:
git fetch origin
git checkout main
git pull origin main

# Task 1 (settings — independent, start immediately):
git checkout -b feature/haq/settings
git add packages/feature-settings/
git commit -m "feat(feature-settings): save toast, LLM test, export backup, version display"
git push origin feature/haq/settings
gh pr create --title "feat(feature-settings): settings improvements and export backup" --base main

# Task 2 (infrastructure — independent, start immediately in parallel):
git checkout main && git pull origin main
git checkout -b feature/haq/docker
# Only touch backend/ and docker-compose.yml and packages/app/Dockerfile and packages/app/nginx.conf
git add backend/ docker-compose.yml packages/app/Dockerfile packages/app/nginx.conf
git commit -m "chore(docker): verify and finalise backend + docker-compose"
git push origin feature/haq/docker
gh pr create --title "chore(docker): finalise containerization and health endpoints" --base main
```

## Rules
- For settings task: ONLY stage `packages/feature-settings/`
- For docker task: ONLY stage `backend/`, `docker-compose.yml`, `packages/app/Dockerfile`, `packages/app/nginx.conf`
- Never stage `packages/app/src/` — that is Sashreek's domain
- Never use `git add .` or `git add -A`
- Never commit to main directly
- Both tasks are independent — you can work on them simultaneously in separate branches
