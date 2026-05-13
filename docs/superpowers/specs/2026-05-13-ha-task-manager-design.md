# Home Assistant Task Manager Design

Date: 2026-05-13
Status: Approved for planning
Scope: Single-project spec

## 1. Objective
Build a Home Assistant-native task management app with a dedicated page inside Home Assistant for daily use and administration.

The app must support:
- Recurring household tasks with flexible recurrence rules and skip windows.
- Completion tracking and user-level analytics.
- NFC-based completion initiation with explicit in-app confirmation.
- Identity support for both Home Assistant users and household profiles.

## 2. Product Constraints and Decisions

### 2.1 Platform and deployment
- Home Assistant-native architecture.
- Dedicated panel page inside Home Assistant is the primary UI.

### 2.2 Identity model
- Both Home Assistant users and household profiles are first-class identities.
- Mapping layer links HA users to household profiles.

### 2.3 Task permissions
- Any authenticated household user can create and manage task definitions.
- Completion remains strictly assignment-based.

### 2.4 Assignment policy
- Strict assignment only for completion confirmation.
- No assignment overrides in v1.

### 2.5 Recurrence and scheduling
- Flexible recurrence rules (not weekly-only).
- Skip windows supported in v1.

### 2.6 NFC completion paths
- Both phone scan and dedicated reader flows are first-class in v1.
- Phone flow is primary.
- Completion never persists without explicit confirmation.

### 2.7 Reminders and escalations
- In-app reminders only in v1.
- No push notifications or external escalation automations in v1.

### 2.8 Analytics
- Combined dashboard in v1 including:
  - Completion trend over time.
  - On-time vs late completion rates.
  - Streaks.
  - Missed-task counts.

## 3. Architecture

### 3.1 Architectural style
A full custom Home Assistant integration plus a dedicated Home Assistant panel page.

### 3.2 Core components
1. Task Domain Service
- Owns task definitions, recurrence rules, skip windows, assignment policy, and due-instance generation.

2. Completion Domain Service
- Owns completion attempts, confirmation state, strict assignment enforcement, and immutable completion history.

3. Identity Mapping Service
- Resolves HA user to household profile associations while allowing either identity type.

4. NFC Event Service
- Handles phone and reader-originated scan events.
- Resolves tag-to-task mapping.
- Starts pending confirmation flow.

5. Analytics Service
- Computes chart-ready aggregates from immutable completion history.

6. Home Assistant Panel UI
- Dedicated page for task management, completion confirmation, and analytics.

7. Reminder Policy Surface
- In-app overdue and urgency presentation.

### 3.3 Boundary rules
- Recurrence logic, completion logic, NFC handling, identity mapping, and analytics are isolated components.
- Components interact via clear service interfaces and event-driven handoff.

## 4. Data Model (Conceptual)

### 4.1 Primary entities
- TaskDefinition
- TaskDueInstance
- CompletionAttempt
- CompletionRecord
- NfcTagMapping
- HouseholdProfile
- UserProfileMapping
- AnalyticsSnapshot (derived)

### 4.2 Key ownership principles
- Completion history is immutable.
- Dashboard metrics are derived from history, not entered manually.
- NFC mappings are explicit and auditable.

## 5. Data Flow and Interaction Model

### 5.1 Task lifecycle
1. User creates or edits a task in panel UI.
2. Task Domain validates recurrence and skip-window rules.
3. Due-instance projection regenerates future instances.
4. In-app urgency state is derived from due/overdue status.

### 5.2 Completion flows

Manual completion:
1. User opens due task.
2. User confirms completion.
3. Completion service validates assignment.
4. Completion record persists.
5. Analytics updates.

Phone NFC completion (primary):
1. User scans NFC tag with phone.
2. NFC service resolves task mapping.
3. App shows confirmation prompt.
4. Completion service validates assignment.
5. Completion record persists.

Dedicated reader completion:
1. Reader posts scan event to HA.
2. NFC service resolves task mapping.
3. App creates pending confirmation action.
4. User confirms in app.
5. Completion service validates assignment.
6. Completion record persists.

### 5.3 Assignment enforcement
- If actor is assigned user: completion allowed.
- If actor is not assigned user: completion blocked with clear message and audit event.

### 5.4 Analytics pipeline
- Every confirmed completion appends immutable history.
- Analytics service computes trend, on-time rate, streaks, and missed counts.
- Panel reads pre-aggregated metrics for responsive load.

## 6. Home Assistant Panel Design

### 6.1 Main views
- My Tasks: due now, overdue, upcoming.
- Household Board: all active tasks by assignee/status.
- Task Builder: create/edit with recurrence, skip windows, assignee, and NFC mapping.
- Analytics Dashboard: combined metrics and charts.

### 6.2 Quick actions
- Create from template.
- Reassign future instances.
- Pause or resume recurrence.
- Open NFC mapping workflow.

## 7. Error Handling
- Unknown NFC tag: map flow prompt.
- Non-assigned completion attempt: blocked with assignee guidance and audit log.
- Invalid recurrence plus skip-window overlap: save blocked with inline validation.
- Unmapped HA user/profile relation: temporary HA-only operation allowed with mapping warning.
- Analytics staleness: show last computed timestamp and allow on-demand recompute.

## 8. Testing Strategy

### 8.1 Unit tests
- Recurrence expansion with skip windows.
- Assignment validator.
- Identity mapping resolver.

### 8.2 Integration tests
- Phone NFC scan to persisted completion history.
- Reader event to pending confirmation flow.
- Panel analytics data loading.

### 8.3 Scenario tests
- Overdue accumulation and missed count updates.
- Reassignment impact on future vs historical instances.
- Concurrent completion attempts on same due instance.

## 9. V1 Scope

### 9.1 In scope
- Native HA integration with dedicated page.
- Open task creation/edit for household users.
- Strict assignment completion.
- Flexible recurrence plus skip windows.
- First-class phone and reader NFC flows.
- Required confirmation before persist.
- Dual identity model with mapping.
- In-app overdue reminders.
- Combined analytics dashboard.

### 9.2 Out of scope
- Push notifications and external escalations.
- Completion overrides by non-assigned users.
- Gamification features.
- Advanced role hierarchy beyond household user and admin system settings.
- Multi-instance federation.

## 10. Acceptance Criteria
1. Any household user can create and manage task definitions.
2. Only assigned user can confirm completion across all paths.
3. NFC scans do not auto-complete without explicit confirmation.
4. Recurrence with skip windows updates due instances correctly after edits.
5. Dashboard metrics remain accurate against completion history.
6. Unknown tags and mapping gaps produce clear recoverable error states.
7. Dedicated page supports daily operation without YAML editing.

## 11. Non-Functional Requirements
- Deterministic recurrence behavior across timezone changes.
- Immutable completion history with actor identity for every attempt.
- Safe integration restart behavior for due generation and analytics summaries.
- Responsive UI with realistic household-scale data.

## 12. Recommended Implementation Language
Primary backend language: Python.
- Home Assistant integrations are Python-native, so this aligns with platform APIs, lifecycle, config flows, and testing conventions.

Frontend language for panel UI: TypeScript.
- Use TypeScript for the custom panel interface and visualization logic.

Single-language decision if forced: Python, because Home Assistant backend integration is the architectural anchor.
