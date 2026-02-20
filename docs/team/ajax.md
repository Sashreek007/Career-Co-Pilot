# Agent Brief: Ajax

## Role
Interaction Engineer — you own the two most interaction-heavy features: Kanban drag-and-drop (Applications) and the split-pane editor (Resume Studio). These are complex UI features requiring careful state management.

## Assigned Packages
- `packages/feature-applications` — Kanban board with drag-and-drop
- `packages/feature-resume-studio` — Resume split-pane editor

## Prerequisite
Wait for Sashreek's PRs (`feat(core)`, `feat(api)`, `feat(app)`) to merge before starting.

---

## Task 1: Improve feature-applications Kanban

Read all files in `packages/feature-applications/src/`.

**Current state:** Basic Kanban renders. Drag-and-drop moves cards between columns. Detail modal opens on click.

**Your improvements:**

1. **Fix drag-and-drop click conflict**: Currently `ApplicationCard` has both `useDraggable` listeners and an `onClick`. The click fires even after a drag. Fix this by tracking whether a drag actually occurred (use a `hasDragged` ref or check `transform` before firing onClick).

2. **Add column count animation**: When a card is dropped, the column badge count should update immediately (it already does via Zustand). Verify this works correctly end-to-end.

3. **Improve ApplicationDetailModal**:
   - Add an "Edit" button (stub — just logs to console)
   - Add a "Submit Application" button that only shows when `status === 'approved'`. On click: log `[stub] Submit application ${draft.id}` and close the modal.
   - Add a "Mark as Interview" button that appears when `status === 'submitted'`. On click: calls `moveDraft(draft.id, 'interview')` from the store and closes the modal.

4. **Add an empty state** for columns with no cards: show a faint "Drop cards here" placeholder (already scaffolded — verify it renders correctly).

**Definition of done:** Kanban renders all 5 columns. Cards drag between columns. Detail modal shows correct data. No TypeScript errors.

---

## Task 2: Improve feature-resume-studio

Read all files in `packages/feature-resume-studio/src/`.

**Your improvements:**

1. **VersionList improvements**:
   - Add a creation date below the strength score: `Created: Feb 16, 2026`
   - Add a "tailored for" badge (already showing company name — verify it's visible)
   - Sort versions: base always first, then tailored sorted by `createdAt` descending

2. **ResumePreview improvements**:
   - Add a "Resume Match" score bar at the top showing `strengthScore`% as a colour-coded progress bar (same pattern as SkillsSection in profile: green ≥80, amber ≥65, gray otherwise)
   - Add keyword coverage and skill alignment as small secondary stats below the score bar

3. **ExportButtons**:
   - When `exportPdf` is clicked, show a brief toast-like message: "PDF export requires backend connection. JSON export is available now." — implement this as a simple `alert()` stub for now.

4. **DiffView**:
   - Add a stat row at the top of each column: "X fragments, strength Y%"
   - Highlight fragments that appear in one version but not the other with a subtle left border colour (green = added, red = removed). Use fragment `id` to compare.

**Definition of done:** Resume Studio renders both base and tailored resumes. Compare mode shows DiffView. JSON export works (downloads file). No TypeScript errors.

---

## Git Workflow

```bash
# Before starting:
git fetch origin
git checkout main
git pull origin main

# Task 1:
git checkout -b feature/ajax/applications-kanban
git add packages/feature-applications/
git commit -m "feat(feature-applications): fix drag-click conflict, improve modal actions"
git push origin feature/ajax/applications-kanban
gh pr create --title "feat(feature-applications): kanban improvements and modal actions" --base main

git checkout main && git pull origin main
git checkout -b feature/ajax/resume-studio
git add packages/feature-resume-studio/
git commit -m "feat(feature-resume-studio): improve preview, diff view, version list"
git push origin feature/ajax/resume-studio
gh pr create --title "feat(feature-resume-studio): resume studio improvements" --base main
```

## Rules
- ONLY stage files inside `packages/feature-applications/` and `packages/feature-resume-studio/`
- Never use `git add .` or `git add -A`
- Never modify `packages/app/`, `packages/core/`, `packages/api/`, `packages/ui/`
- If you need a new shared component, request it from Raghav (packages/ui owner)
- If you need a new type, request it from Sashreek (packages/core owner)
- Never commit to main directly
