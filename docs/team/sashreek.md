# Agent Brief: Sashreek

## Role
Integration Owner — you own the type contracts, mock data, app wiring, and routing. Nothing ships without your types being stable first. You are the first person whose work must land on main before anyone else can proceed.

## Assigned Packages
- `packages/core` — all TypeScript domain interfaces
- `packages/api` — mock functions + data
- `packages/app` — Vite entry, FeatureRegistry, router, AppShell wiring

## Current State
All three packages are scaffolded with full source code. Your job in this phase is to **review, validate, and improve** them — not rewrite from scratch.

---

## Task 1: Validate and stabilise packages/core types

Read every file in `packages/core/src/types/`. Ensure:
- All types are exported from `packages/core/src/index.ts`
- `FeatureModule` and `NavItem` are exported from `packages/core/src/registry.ts` AND re-exported from `packages/core/src/index.ts`
- No circular references exist between type files
- All optional fields are marked with `?`

**Definition of done:** Running `cd packages/core && npx tsc --noEmit` produces zero errors.

---

## Task 2: Validate and extend packages/api mock data

Read all files in `packages/api/src/mock-data/`. Verify:
- Job IDs used in `applications.ts` (`job-001`, `job-002`, etc.) match IDs defined in `jobs.ts`
- Resume version IDs used in `applications.ts` (`rv-001`, `rv-002`, etc.) match IDs in `resume-versions.ts`
- `interview-kits.ts` has `applicationId: 'app-001'` which matches `applications.ts` `app-001`
- All mock data is typed correctly against `@career-copilot/core` types

Fix any ID mismatches you find.

**Definition of done:** All mock data files compile without TypeScript errors.

---

## Task 3: Wire packages/app and verify dev server starts

1. Read `packages/app/src/router.tsx` — ensure all 7 feature imports resolve
2. Read `packages/app/vite.config.ts` — ensure all alias paths are correct
3. Read `packages/app/tailwind.config.js` — ensure all feature package paths are in the `content` array
4. Run `pnpm install` from the repo root
5. Run `pnpm dev` and verify Vite starts at `http://localhost:5173`
6. Navigate to each route: `/jobs`, `/applications`, `/resume-studio`, `/interviews`, `/insights`, `/profile`, `/settings`
7. Fix any import errors or missing exports that prevent the dev server from starting

**Definition of done:** `pnpm dev` starts without errors and all 7 routes render without crashing.

---

## Git Workflow

```bash
# Before starting any task:
git fetch origin
git checkout main
git pull origin main

# Create a branch per task (not per file):
git checkout -b feature/sashreek/core-types
# ... make changes ...
git add packages/core/
git commit -m "feat(core): stabilise domain types and registry exports"
git push origin feature/sashreek/core-types
gh pr create --title "feat(core): stabilise domain types" --base main

# New branch for next task:
git checkout main && git pull origin main
git checkout -b feature/sashreek/api-mock-data
git add packages/api/
git commit -m "feat(api): fix mock data ID consistency"
git push origin feature/sashreek/api-mock-data
gh pr create --title "feat(api): fix mock data ID consistency" --base main

git checkout main && git pull origin main
git checkout -b feature/sashreek/app-wiring
git add packages/app/
git commit -m "feat(app): wire all features and verify dev server"
git push origin feature/sashreek/app-wiring
gh pr create --title "feat(app): feature registry wiring and dev verification" --base main
```

## Rules
- ONLY add/stage files inside `packages/core/`, `packages/api/`, `packages/app/`
- Never use `git add .` or `git add -A`
- Never commit to main directly
- Never modify files in other feature packages
- If a type change is needed in `packages/core`, make it yourself — you own it
- Merge your PRs before other team members start, so their imports resolve
