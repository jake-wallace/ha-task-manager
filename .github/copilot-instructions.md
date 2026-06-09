# GitHub Copilot Instructions — HA Task Manager

## Project Summary

This is a Home Assistant custom integration and panel UI for managing recurring household tasks. The backend is Python; the frontend is TypeScript. The primary UI is a dedicated Home Assistant panel page.

## Architecture Constraints

- The integration follows Home Assistant conventions: `custom_components/ha_task_manager/`.
- Domain logic lives in `custom_components/ha_task_manager/services/`, each file owning a single concern.
- The frontend lives in `frontend/src/` and is a custom HA panel built in TypeScript.
- Do not mix domain logic into HA lifecycle files (`__init__.py`, `config_flow.py`). These wire things up; services do the work.
- All completion history is immutable. Never edit or delete records; only append.

## Code Style

### Python
- Follow PEP 8 and Home Assistant coding standards.
- Use type annotations on all public functions and class attributes.
- Prefer dataclasses or `TypedDict` for structured data over plain dicts.
- Raise domain-specific exceptions rather than returning error codes.
- All services must be independently unit-testable with no HA state dependencies in the logic layer.

### TypeScript
- Strict mode enabled (`"strict": true` in tsconfig).
- No `any` types without a comment explaining why.
- Prefer functional components and hooks for the panel UI.
- Keep API calls isolated in a `src/api/` directory.

## Key Domain Rules (do not break these)

1. **Strict assignment enforcement.** A completion attempt from a non-assigned user must be rejected. The validator lives in `completion_domain.py` — do not bypass it.
2. **NFC never auto-completes.** A scan event only starts a pending confirmation. The user must actively confirm. This is a hard product requirement.
3. **Completion history is immutable.** Append-only. Never mutate or delete past records.
4. **Recurrence engine is authoritative.** Due instances are regenerated from the rule when rules change. Do not manually patch due instance records.
5. **Identity mapping is explicit.** A HA user and a household profile are separate entities linked by `UserProfileMapping`. Do not conflate them.

## Testing Expectations

- All new domain logic requires unit tests in `tests/unit/`.
- New service integrations require tests in `tests/integration/`.
- Tests must not depend on a live HA instance. Mock the HA event bus and state machine.
- Test coverage must not decrease below current baseline.

## Component Map

| File/Module | What it owns |
|---|---|
| `services/task_domain.py` | Task definitions, recurrence rules, skip windows, due-instance engine |
| `services/completion_domain.py` | Completion attempts, assignment validation, history persistence |
| `services/identity_mapping.py` | HA user ↔ household profile resolution |
| `services/nfc_events.py` | NFC scan events, tag-to-task resolution, confirmation flow |
| `services/analytics.py` | Aggregate metric computation from history |
| `frontend/src/` | TypeScript panel: views, charts, task forms, confirmation UI |

## Error Handling

- Unknown NFC tags: surface a map-flow prompt. Do not silently drop the event.
- Non-assigned completion attempt: block and record an audit entry. Do not silently succeed.
- Invalid recurrence plus skip-window combination: surface a validation error at save time.
- Unmapped HA user: allow temporary HA-only operation with a visible warning. Do not crash.

## What Not to Do

- Do not add features outside the v1 scope: no push notifications, no assignment overrides, no gamification.
- Do not write multi-responsibility service files. If a file is growing large, that is a signal to split it.
- Do not call HA state machine methods directly from service classes. Pass them in as dependencies.
- Do not store computed analytics as source-of-truth. They are derived from history on demand.
