# Browser Helper Extension Plan

## Goal
Implement a user-permissioned browser-helper flow (similar to extension-style operation) where job capture happens in the user's own browser session, then imports into Career Co-Pilot for matching and application workflows.

## Why This Plan
- Keep browser actions in the user's local Chrome context.
- Avoid backend-controlled crawling workflows for LinkedIn/Indeed pages.
- Make the capture/import behavior explicit and user-triggered.

## Scope
- Add a local Chrome extension (`browser-helper-extension/`) with:
  - popup UI for capture actions
  - content script for LinkedIn/Indeed extraction
  - background worker for import requests to backend
- Reuse existing backend import API (`POST /jobs/import-link`) for insertion.
- Improve import path so metadata fetch is skipped when extension already provides rich data.

## Implementation Steps

### 1) Backend Import Optimization
- Update `/jobs/import-link`:
  - if `title`, `company`, and `description` are already provided, skip remote metadata fetch.
  - continue fallback metadata logic when fields are missing.

### 2) Extension Scaffolding
- Create `browser-helper-extension/manifest.json` (MV3).
- Add required permissions/host permissions:
  - LinkedIn + Indeed pages
  - local backend (`http://localhost:8000/*`)

### 3) Capture Logic (Content Script)
- Detect platform (`linkedin` / `indeed`).
- Support two capture modes:
  - current selected job (detail-focused)
  - visible list capture (N jobs)
- Extract:
  - `sourceUrl`, `title`, `company`, `location`, `description`, `remote`
- Prefer detail panel text; fallback to card/snippet text.

### 4) Import Logic (Background Worker)
- Receive captured jobs from popup/content script.
- De-duplicate by `sourceUrl`.
- Import each job through backend `POST /jobs/import-link`.
- Return summary: captured, imported, failed, error list.

### 5) Popup UX
- Backend URL setting (default `http://localhost:8000`), persisted in extension storage.
- Buttons:
  - Capture current job
  - Capture first 10 jobs
  - Capture first 20 jobs
- Display import result summary and failures.

### 6) Documentation
- Add extension setup/use docs:
  - load unpacked extension
  - configure backend URL
  - open LinkedIn/Indeed jobs page
  - capture/import
  - refresh Career Co-Pilot job feed

## Validation Checklist
- Extension loads without errors in Chrome (MV3).
- Capture works on logged-in LinkedIn and Indeed search/detail pages.
- Imported jobs appear in Career Co-Pilot feed.
- Job description is non-empty for most captured jobs.
- Skill matching computes from imported descriptions.

## Known Limits
- DOM selectors can break if LinkedIn/Indeed change layout.
- Some postings may still provide partial descriptions from the visible UI.
- This is user-triggered browser extraction, not a guaranteed official API integration.
