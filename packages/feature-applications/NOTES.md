# Feature: Applications
## Status: Scaffolded

## What's Done
- KanbanBoard with @dnd-kit/core DndContext and PointerSensor
- 5 columns: Drafted, Approved, Submitted, Interview, Offer
- Draggable ApplicationCards using useDraggable
- Droppable KanbanColumns using useDroppable
- ApplicationDetailModal on card click (cover letter, answers, missing skills)
- Zustand store (useApplicationsStore) with moveDraft for optimistic status updates

## Next Steps
- Add SortableContext per column for intra-column ordering
- Column count badges (already present) need animation on drop
- "Approve & Submit" button in modal → triggers controlled submission engine
- Add date stamps to cards (submitted date)
- Add filter bar: by match score, date, company

## Dependencies
- @career-copilot/core (ApplicationDraft, ApplicationStatus)
- @career-copilot/ui (MatchBadge, StatusPill, PageHeader, cn)
- @career-copilot/api (getApplicationDrafts, updateDraftStatus)
- @dnd-kit/core, @dnd-kit/sortable
