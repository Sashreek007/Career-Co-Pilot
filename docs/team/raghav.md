# Agent Brief: Raghav

## Role
Design System Owner + Profile Feature. You define the visual language of the entire app. Your `packages/ui` work is a shared dependency — other teammates rely on your exports being stable.

## Assigned Packages
- `packages/ui` — shared components, design tokens
- `packages/feature-profile` — Profile page

## Prerequisite
Wait for Sashreek's `feat(core)` PR to merge before starting. Your packages import from `@career-copilot/core`.

---

## Task 1: Extend packages/ui shared components

The following components are already scaffolded. Your job is to **review, improve, and add missing ones**.

Read all files in `packages/ui/src/components/`.

**Improve existing components:**
- `Sidebar.tsx`: verify `NavLink` active state works correctly with React Router v6. The `isActive` prop on NavLink's className function should apply `bg-zinc-800 text-zinc-100`. Test by checking that clicking each nav item highlights it.
- `MatchBadge.tsx`: verify green/amber/gray tiers render correctly.
- `StatusPill.tsx`: verify all 7 status variants render (drafted, approved, submitted, interview, offer, rejected, archived).
- `SplitPane.tsx`: verify left panel does not overflow vertically.

**Add a new component: `EmptyState.tsx`**
Create `packages/ui/src/components/EmptyState.tsx`:
```tsx
// Props: icon (ReactNode), title (string), description (string), action? (ReactNode)
// Renders a centered empty state with an icon, title, description, and optional action button
// Use zinc-800 background, subtle border, centered layout
```

Export it from `packages/ui/src/index.ts`.

**Definition of done:** All ui components compile. `@career-copilot/ui` exports resolve correctly in all feature packages.

---

## Task 2: Improve packages/feature-profile

Read all files in `packages/feature-profile/src/`.

The profile page is read-only (display only). Your tasks:

1. **Improve SkillsSection**: Add a confidence score bar under each skill chip. The bar should be a thin horizontal bar (h-0.5) filling to `confidenceScore`% width. Color: green if ≥75, amber if ≥50, gray otherwise.

2. **Improve ProfilePage header**: Add a subtle `last updated` timestamp below the email/location line. Format: `Last updated: Feb 20, 2026`.

3. **Add loading skeleton**: When `isLoading` is true, show 3 placeholder skeleton cards (use `animate-pulse bg-zinc-800 rounded-lg h-24 w-full`) instead of the loading text.

4. **RoleInterestsSection**: Ensure location badges render as a comma-separated list inside the card.

**Definition of done:** Profile page renders without errors. All sections display mock data correctly. No TypeScript errors.

---

## Git Workflow

```bash
# Before starting:
git fetch origin
git checkout main
git pull origin main

# Task 1:
git checkout -b feature/raghav/ui-components
# ... make changes to packages/ui/ only ...
git add packages/ui/
git commit -m "feat(ui): extend shared components, add EmptyState"
git push origin feature/raghav/ui-components
gh pr create --title "feat(ui): extend shared design system components" --base main

# Wait for PR to merge, then:
git checkout main && git pull origin main
git checkout -b feature/raghav/profile-page
git add packages/feature-profile/
git commit -m "feat(feature-profile): improve skills, loading state, header"
git push origin feature/raghav/profile-page
gh pr create --title "feat(feature-profile): profile page improvements" --base main
```

## Rules
- ONLY stage files inside `packages/ui/` and `packages/feature-profile/`
- Never use `git add .` or `git add -A`
- Never modify `packages/app/`, `packages/core/`, `packages/api/`
- If you need a new shared type, ask Sashreek to add it to `packages/core` — do not modify core yourself
- Never commit to main directly
