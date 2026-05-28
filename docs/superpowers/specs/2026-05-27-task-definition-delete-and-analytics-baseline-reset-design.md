# Task Definition Delete And Analytics Baseline Reset Design

## Summary

This design adds two destructive but reversible capabilities:

1. Hard delete task definitions while preserving immutable completion history.
2. Reset analytics globally by moving a baseline timestamp forward, with undo.

Both actions require typed confirmation (`delete`) and provide a 5-minute full rollback window.

## Goals

- Allow users to permanently remove task definitions from operational use.
- Preserve completion history records and auditability.
- Introduce a global analytics baseline reset that does not delete history.
- Provide a safe 5-minute undo window for both destructive actions.
- Keep due projection and NFC runtime behavior consistent immediately after deletion.

## Non-Goals

- No deletion or mutation of immutable completion history records.
- No per-profile or per-task analytics baseline reset in this phase.
- No custom permissions UI in Setup for these actions in this phase.
- No long-term recycle bin beyond the 5-minute undo window.

## Product Decisions (Confirmed)

- Delete semantics: hard delete task definition only; completion history remains.
- Permission: any mapped household user can execute delete/reset/undo.
- Confirmation gate: both destructive actions require exact text `delete`.
- Pending confirmations/due instances after deletion: immediately canceled/removed.
- Analytics reset scope: global household baseline reset.
- Undo window: 5 minutes.
- Undo behavior: full rollback for both actions.
- Deleted-task analytics visibility: user toggle to include/exclude deleted-task history.

## Architecture Overview

Introduce a small reversible operation control layer alongside existing task/history stores.

### Existing Stores (unchanged core role)

- Task definitions store remains source of truth for active/archived task definitions.
- Completion history remains immutable append-only source of truth.

### New Control Records

1. `TaskDeletionRecord`
- `id`
- `task_snapshot` (full task definition payload)
- `actor_ha_user_id`
- `deleted_at`
- `undo_expires_at`
- `status` (`active`, `undone`, `expired`)

2. `AnalyticsBaselineResetRecord`
- `id`
- `previous_baseline_at` (nullable for first reset)
- `new_baseline_at`
- `actor_ha_user_id`
- `reset_at`
- `undo_expires_at`
- `status` (`active`, `undone`, `expired`)

3. `AnalyticsBaselineState`
- Single global effective baseline timestamp used by analytics queries.

## Backend Design

### Service Boundaries

- Keep task deletion orchestration in websocket/service integration layer.
- Keep analytics calculations in `services/analytics.py` with baseline-aware filtering.
- Keep completion history immutable and untouched by delete/reset actions.

### WebSocket Commands

#### 1) `ha_task_manager/delete_task_definition`

Input:
- `task_id: string`
- `confirm_text: string`

Validation:
- mapped user required
- `confirm_text == "delete"`
- task exists

Behavior:
- write `TaskDeletionRecord` with 5-minute expiry and task snapshot
- remove task definition from tasks store
- rebuild NFC runtime mappings
- cancel pending confirmations for that task immediately
- persist runtime/discovery state consistency as needed

Response:
- `operation_id`
- `task_id`
- `undo_expires_at`

Errors:
- `mapping_required`
- `invalid_confirm_text`
- `task_not_found`
- `delete_task_failed`

#### 2) `ha_task_manager/undo_delete_task_definition`

Input:
- `operation_id: string`

Validation:
- mapped user required
- operation exists
- status is `active`
- current time <= `undo_expires_at`

Behavior:
- restore task definition from `task_snapshot`
- mark deletion record `undone`
- rebuild NFC runtime mappings

Response:
- restored task payload
- `operation_id`
- `status: "undone"`

Errors:
- `operation_not_found`
- `operation_not_reversible`
- `undo_window_expired`
- `undo_delete_task_failed`

#### 3) `ha_task_manager/reset_analytics_baseline`

Input:
- `confirm_text: string`

Validation:
- mapped user required
- `confirm_text == "delete"`

Behavior:
- capture current effective baseline (`previous_baseline_at`)
- set new effective baseline to `now`
- write `AnalyticsBaselineResetRecord` with 5-minute expiry

Response:
- `operation_id`
- `new_baseline_at`
- `undo_expires_at`

Errors:
- `mapping_required`
- `invalid_confirm_text`
- `reset_analytics_failed`

#### 4) `ha_task_manager/undo_analytics_baseline_reset`

Input:
- `operation_id: string`

Validation:
- mapped user required
- operation exists and reversible and not expired

Behavior:
- restore effective baseline from `previous_baseline_at`
- mark reset record `undone`

Response:
- `operation_id`
- `restored_baseline_at`
- `status: "undone"`

Errors:
- `operation_not_found`
- `operation_not_reversible`
- `undo_window_expired`
- `undo_reset_analytics_failed`

#### 5) Analytics Query Extension

Existing analytics command adds optional field:
- `include_deleted_task_history?: boolean` (default `true`)

Behavior:
- apply baseline filter first (`completed_at >= effective_baseline_at`)
- when include flag is true: include records for deleted tasks and return metadata label support
- when include flag is false: exclude records whose task definition is deleted

### Consistency and Atomicity

Delete operation must be atomic from user perspective:
- if task removal succeeds but pending-confirmation cancellation or runtime rebuild fails, rollback deletion and surface an error.

Undo operations are idempotent-safe:
- repeated undo on already-undone operation returns `operation_not_reversible`.

## Frontend UX Design

### Manage Tasks View

- Add `Delete` action for both active and archived task rows.
- Open destructive confirmation modal:
  - warning copy about removing task definition and future schedule
  - explicit note that completion history is preserved
  - text field requiring exact `delete`
  - confirm disabled until exact match

Success state:
- task removed from lists immediately
- banner/toast with `Undo` and countdown to `undo_expires_at`
- add or extend a "Recent destructive actions" area for recoverability

### Analytics View

- Add `Reset Analytics Baseline` action with identical typed confirmation modal.
- On success, refresh analytics against new baseline.
- Show `Undo` banner with countdown.
- Add toggle: `Include deleted task history` (default ON).

### Common UX

- scoped inline errors (modal stays open)
- prevent duplicate submissions while request in-flight
- on undo expiry, disable undo and show `Undo expired`

## Data and Rendering Semantics

When deleted-task history is included:
- analytics data points continue to count
- UI labels unknown/deleted task references as `Deleted task`
- profile-level aggregates remain valid for historical continuity

When excluded:
- those records are omitted from aggregates and charts

## Security and Authorization

- all destructive/reset/undo commands require mapped household user identity
- anonymous/unmapped users are blocked with `mapping_required`
- no elevated admin requirement for this scope (by confirmed decision)

## Testing Strategy

### Backend Integration Tests

1. Delete task definition command
- requires exact `delete`
- removes task definition
- writes deletion record with expiry
- cancels pending confirmations for task
- preserves completion history

2. Undo delete
- restores exact task payload
- expires after 5 minutes
- marks operation status correctly

3. Reset analytics baseline
- requires exact `delete`
- sets global baseline
- writes reset operation record

4. Undo analytics reset
- restores previous baseline within window
- expires correctly after 5 minutes

5. Analytics include/exclude deleted-task history toggle
- ON includes historical deleted-task records
- OFF excludes them

### Frontend Tests

1. Delete modal typed confirmation gate
2. Delete success + undo banner/countdown
3. Undo delete success and expiry behavior
4. Analytics reset modal typed gate and undo behavior
5. Include-deleted-history toggle impacts request and rendering
6. Error handling keeps modal open with scoped error feedback

### Verification Commands

- `cd frontend && npm run test -- src/ha-task-manager-panel.test.ts src/views/task-builder-view.test.ts`
- `cd frontend && npm run test -- src/views/analytics-view.test.ts`
- `cd frontend && npm run test && npm run typecheck`
- `./.venv/bin/pytest tests/integration/test_setup_admin.py -k "delete_task_definition or analytics_baseline" -v`
- `./.venv/bin/pytest tests/ -v`

## Rollout Notes

- Backward compatible for existing stored history/tasks.
- New control records initialize empty and are used only after first delete/reset action.
- This design supersedes prior archive-only constraint for task destroy semantics in the new scope.

## Open Questions

None for this scoped phase.
