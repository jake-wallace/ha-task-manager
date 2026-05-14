# Home Assistant Task Manager

A Home Assistant-native task management integration for household chores and recurring tasks.

## Overview

This project is a custom Home Assistant integration with a dedicated panel page for managing recurring household tasks. It supports NFC-based completion, per-user analytics, and flexible recurrence scheduling — all without leaving Home Assistant.

## Key Features

- **Recurring tasks** with flexible recurrence rules (daily, weekly, every N days, specific days, monthly, custom intervals) and skip windows (for example vacation mode).
- **NFC completion** via phone scan (primary) or dedicated reader (for example ESPHome). Every scan requires explicit in-app confirmation before recording.
- **Strict assignment enforcement.** Only the assigned household member can confirm completion of a task.
- **Dual identity model.** Supports both Home Assistant users and household profiles with a mapping layer between them.
- **Analytics dashboard** showing completion trend, on-time vs late rate, streaks, and missed-task counts, all per-user and per-task.
- **Open task authorship.** Any household user can create and manage task definitions.
- **In-app reminders** for overdue tasks (push notifications are out of scope for v1).

## Architecture

The integration is split into isolated Python components:

| Component | Responsibility |
|---|---|
| Task Domain Service | Task definitions, recurrence engine, due-instance projection, skip windows |
| Completion Domain Service | Completion validation, assignment enforcement, immutable history |
| Identity Mapping Service | HA user ↔ household profile resolution |
| NFC Event Service | Tag-to-task resolution, confirmation flow initiation |
| Analytics Service | Pre-aggregated metrics from completion history |
| HA Panel UI | TypeScript frontend for the dedicated management page |

## Technology Stack

- **Backend:** Python (Home Assistant integration, all domain logic)
- **Frontend:** TypeScript (custom HA panel page and analytics charts)
- **Platform:** Home Assistant

## Project Structure

```
custom_components/
  ha_task_manager/         # HA integration root
    __init__.py
    config_flow.py
    services/
      task_domain.py
      completion_domain.py
      identity_mapping.py
      nfc_events.py
      analytics.py
    models/
    const.py
frontend/
  src/                     # TypeScript panel UI
  package.json
  tsconfig.json
tests/
  unit/
  integration/
  scenarios/
```

## Getting Started

### Requirements

- Home Assistant 2024.1 or later
- Python 3.12+
- Node.js 20+ (for frontend development)

### Installation (Development)

1. Clone this repository into your Home Assistant `custom_components` directory or configure a dev container.
2. Install Python dev dependencies:
   ```bash
   pip install -r requirements-dev.txt
   ```
3. Install frontend dependencies:
   ```bash
   cd frontend && npm install
   ```
4. Run backend tests:
   ```bash
   pytest tests/
   ```
5. Build frontend:
   ```bash
   cd frontend && npm run build
   ```

## Testing

Tests are organised into three layers:

- **Unit tests** (`tests/unit/`) — recurrence expansion, assignment validation, identity mapping.
- **Integration tests** (`tests/integration/`) — NFC scan to completion, reader event to confirmation, analytics loading.
- **Scenario tests** (`tests/scenarios/`) — overdue accumulation, reassignment effects, concurrent completion attempts.

Run all tests:
```bash
pytest tests/
```


## Non-Functional Requirements

- Recurrence is deterministic across timezone changes.
- Completion history is immutable; actor identity is recorded on every attempt.
- Integration restarts do not corrupt due-instance generation or analytics state.
- The panel is responsive at realistic household-scale data volumes.

## Out of Scope (v1)

- Push notifications and external HA automation escalations.
- Assignment overrides by non-assigned users.
- Gamification or reward systems.
- Multi-instance federation across separate HA installs.
