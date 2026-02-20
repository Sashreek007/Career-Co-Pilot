# Agent Brief: Divya

## Role
Data Visualization Engineer — you own the two data-display-heavy features: Interviews and Insights. Both rely heavily on Recharts and structured data rendering.

## Assigned Packages
- `packages/feature-interviews` — 4-tab interview prep interface
- `packages/feature-insights` — analytics dashboard with charts

## Prerequisite
Wait for Sashreek's PRs (`feat(core)`, `feat(api)`, `feat(app)`) to merge before starting.

---

## Task 1: Improve feature-interviews

Read all files in `packages/feature-interviews/src/`.

**Current state:** 4 tabs scaffolded. QuestionsTab shows grouped questions. AnswerDraftsTab shows STAR format. MockSimulatorTab has sequential flow. PerformanceHistoryTab has a LineChart.

**Your improvements:**

1. **QuestionsTab — add collapse/expand**:
   Each question card should be collapsible. By default, show only the question text and difficulty badge. Clicking a card expands it to show `contextNotes` and `skills` tags. Use local state (`useState<string | null>`) to track the expanded question ID.

2. **MockSimulatorTab — add progress indicator**:
   Above the question, add a progress bar showing `currentQuestionIndex / kit.questions.length`. Use a thin `h-1` bar filled with `bg-blue-500` at the correct width percentage.

3. **AnswerDraftsTab — improve readability**:
   Each STAR section (Situation, Task, Action, Result, Reflection) should render as a coloured left-border block:
   - Situation: `border-l-2 border-zinc-600`
   - Task: `border-l-2 border-blue-500/40`
   - Action: `border-l-2 border-blue-500`
   - Result: `border-l-2 border-green-500`
   - Reflection: `border-l-2 border-amber-500`

4. **PerformanceHistoryTab — add per-dimension breakdown**:
   Below the LineChart, add a bar chart showing the average of each scoring dimension (Structure, Relevance, Technical Depth, Specificity, Clarity) across all sessions. Use `recharts BarChart` with `ResponsiveContainer`. Colour: `#6366f1` (indigo).

**Definition of done:** All 4 tabs render correctly. Charts display mock data. Collapse/expand works. No TypeScript errors.

---

## Task 2: Improve feature-insights

Read all files in `packages/feature-insights/src/`.

**Current state:** 5 MetricCards and 3 Recharts charts (Bar, Line, Pie).

**Your improvements:**

1. **Add chart tooltips with better formatting**:
   - ApplicationsOverTime BarChart tooltip: format date as "Jan 22" instead of "2026-01-22". Use a custom `tickFormatter` on the XAxis.
   - InterviewRate LineChart tooltip: show value as "21%" not "21".
   - MatchDistribution PieChart: tooltip should show "12 applications (43%)" format.

2. **Add a trend indicator to MetricCards**:
   Modify `MetricCard.tsx` to accept an optional `trend?: 'up' | 'down' | 'flat'` prop. When provided, show a small arrow icon:
   - up: `↑` in green
   - down: `↓` in red
   - flat: `→` in zinc

   Add these trends to the InsightsPage MetricCards:
   - Response Rate: `trend="up"`
   - Interview Rate: `trend="up"`
   - Total Applications: `trend="flat"`

3. **Add a "No data" state**:
   If `metrics.totalApplications === 0`, show an EmptyState component (from `@career-copilot/ui` — Raghav adds it) with title "No data yet" and description "Start applying to jobs to see your insights.".

4. **Fix PieChart legend**:
   The current legend uses a `formatter` function. Verify the legend renders the tier names correctly with the right colours.

**Definition of done:** Insights page renders 5 cards and 3 charts. Tooltips are readable. Trend indicators show. No TypeScript errors.

---

## Git Workflow

```bash
# Before starting:
git fetch origin
git checkout main
git pull origin main

# Task 1:
git checkout -b feature/divya/interviews
git add packages/feature-interviews/
git commit -m "feat(feature-interviews): collapse/expand questions, progress bar, STAR styling"
git push origin feature/divya/interviews
gh pr create --title "feat(feature-interviews): interview prep improvements" --base main

git checkout main && git pull origin main
git checkout -b feature/divya/insights
git add packages/feature-insights/
git commit -m "feat(feature-insights): chart tooltips, trend indicators, empty state"
git push origin feature/divya/insights
gh pr create --title "feat(feature-insights): insights dashboard improvements" --base main
```

## Rules
- ONLY stage files inside `packages/feature-interviews/` and `packages/feature-insights/`
- Never use `git add .` or `git add -A`
- Never modify any other packages
- The `EmptyState` component in `packages/ui` is Raghav's responsibility — import it from `@career-copilot/ui` once it's available. If it's not merged yet, use a simple inline placeholder.
- Never commit to main directly
