# Task Archive And Schedule Snapshot Design

## Summary

This design adds two admin capabilities to the existing Manage Tasks experience:

1. Soft destroy via archive/restore workflow
2. Custom-range schedule snapshot with quick task summary and edit handoff

The existing append-only completion history model remains unchanged. Task records are not hard-deleted.

## Goals

- Allow admins to quickly archive tasks (soft destroy) and restore them later.
- Keep archived tasks out of active operational views and future schedule snapshots by default.
- Allow admins to view all projected tasks for any chosen date range.
- Support quick inspection from the snapshot and one-click transition to full task editing.

## Non-Goals

- No hard deletion of task definitions.
- No mutation or deletion of historical completion records.
- No changes to recurrence core logic ownership in task_domain.py.
- No migration to a fully calendar-native planner view in this phase.

## Product Decisions

- Destroy semantics: soft delete only (archive).
- Snapshot default view: custom range list/calendar hybrid.
- Archived task visibility: separate Archived Tasks section.
- Snapshot item interaction: open quick summary panel, with Edit Task button.

## UX Design

### Manage Tasks View Layout

The existing admin view remains the entry point and is extended with three sections:

1. Active Tasks
- Existing create/edit interactions remain.
- Each active task includes an Archive action.

2. Archived Tasks
- Dedicated section listing archived tasks.
- Each archived task includes Restore and Edit actions.

3. Schedule Snapshot
- Date-range controls: start date and end date.
- Grouped output by date, with per-day scheduled items.
- Empty state when no scheduled items are projected in the selected range.
- Clicking an item opens a quick summary panel.

### Quick Summary Panel

Displays:
- Task title
- Assignee/profile label
- Recurrence summary
- Date context (selected due date and range context)
- Active/archived state

Actions:
- Edit Task (hands off to existing task builder edit mode)
- Close summary

## Backend Design

### Data Model

No schema migration required. Archive status uses existing task.active field:
- active = true: task participates in normal flows
- active = false: task is archived/inactive

### WebSocket API

Add explicit admin-only commands:

1. ha_task_manager/archive_task
- Input: task_id
- Behavior:
  - Validate task exists
  - Set task.active = false
  - Update task.updated_at
  - Persist through store.async_save_tasks
  - Rebuild NFC runtime mappings/services
  - Return updated task

2. ha_task_manager/restore_task
- Input: task_id
- Behavior:
  - Validate task exists
  - Set task.active = true
  - Update task.updated_at
  - Persist through store.async_save_tasks
  - Rebuild NFC runtime mappings/services
  - Return updated task

Rationale for explicit commands instead of save_task-only toggling:
- Clear intent and safer admin UI wiring
- Simpler focused test cases
- Lower risk of accidental task-shape mutation

### Schedule Snapshot Data Source

Keep recurrence projection authoritative by reusing existing due instance projection pipeline.

Approach:
- Continue using due instance projection logic from task_domain.py
- For snapshot requests, query due instances over selected custom range
- Exclude archived/inactive tasks from snapshot results by default

Implementation options:
- Extend due_instances command to accept explicit date range semantics cleanly, or
- Add a dedicated snapshot query command that still delegates to the same projection logic

Preferred: Add frontend-level snapshot query helper over existing due_instances if current contract already supports range safely.

## Frontend Design

### API Client

Add methods:
- archiveTask(taskId)
- restoreTask(taskId)
- fetchScheduleSnapshot({ fromDate, toDate })

### Admin Panel State

Extend panel state with:
- activeTasks derived from tasks
- archivedTasks derived from tasks
- snapshotRange { fromDate, toDate }
- snapshotItems grouped by date
- quickSummary selection state

### Interaction Flow

Archive:
- User clicks Archive on an active task
- Confirm action
- Call archiveTask
- Refresh task + setup-derived views as needed
- Move task into Archived Tasks section

Restore:
- User clicks Restore on archived task
- Call restoreTask
- Refresh views
- Move task into Active Tasks section

Snapshot:
- User picks date range and refreshes snapshot
- Grouped date output updates
- Clicking item opens quick summary
- Edit Task action sets builder handoff task id

## Error Handling

- Archive/restore failures show inline actionable error in admin view.
- Snapshot fetch failure shows scoped snapshot error state without breaking entire panel.
- Snapshot with no projected results shows explicit empty state.
- If selected snapshot item references now-archived/updated task, quick summary reads latest available task state and still allows edit handoff when task exists.

## Domain Rule Compliance

- Completion history stays append-only.
- No bypass of completion assignment validation.
- NFC scans still require explicit confirmation.
- Recurrence engine remains authoritative for due projections.
- Identity mapping boundaries remain unchanged.

## Testing Strategy

### Backend Tests

Integration tests:
- archive_task marks task inactive and persists
- restore_task marks task active and persists
- archived tasks excluded from projected due instances in snapshot range
- restored tasks reappear in projected due instances

Regression checks:
- NFC runtime rebuild remains consistent after archive/restore
- Existing admin authorization rules apply to new commands

### Frontend Tests

Panel/view tests:
- Active task archive action moves task to archived section
- Archived task restore action moves task back to active section
- Snapshot renders grouped date sections for custom range
- Snapshot empty state renders correctly
- Clicking snapshot item opens quick summary
- Quick summary Edit Task action triggers builder handoff

### Verification Commands

- Frontend targeted: npm run test -- src/ha-task-manager-panel.test.ts
- Frontend targeted: npm run test -- src/views/task-builder-view.test.ts
- Frontend full: npm run test && npm run typecheck
- Backend targeted: pytest tests/integration/test_setup_admin.py -v
- Backend full: pytest tests/ -v

## Rollout Notes

- This is additive and backward-compatible with existing task storage.
- Existing inactive-task behaviors in NFC and due projections continue to align with archive semantics.
- UI labels should consistently use Archive/Restore language rather than Delete to avoid hard-delete ambiguity.

## Open Questions

None for the scoped phase. Decisions on hard delete and full calendar-first planner remain explicitly out of scope.
