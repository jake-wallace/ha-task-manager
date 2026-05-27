from datetime import UTC, date
from typing import get_type_hints

import pytest

from custom_components.ha_task_manager.models import (
    AnalyticsBaselineResetRecord,
    AnalyticsBaselineState,
    ProfileAnalyticsSnapshot,
    SkipWindow,
    TaskDeletionRecord,
    TaskDefinition,
    TaskDueInstance,
)
from custom_components.ha_task_manager.models.time import utc_now


def test_utc_now_returns_timezone_aware_utc_datetime() -> None:
    timestamp = utc_now()

    assert timestamp.tzinfo is not None
    assert timestamp.tzinfo == UTC


def test_task_due_instance_build_uses_deterministic_identifier() -> None:
    instance = TaskDueInstance.build("task-123", date(2026, 5, 13), skipped=True)

    assert instance.id == "task-123:2026-05-13"
    assert instance.task_id == "task-123"
    assert instance.due_date == date(2026, 5, 13)
    assert instance.skipped is True


def test_skip_window_contains_is_inclusive_of_boundary_dates() -> None:
    window = SkipWindow(
        start_date=date(2026, 5, 10),
        end_date=date(2026, 5, 12),
    )

    assert window.contains(date(2026, 5, 10)) is True
    assert window.contains(date(2026, 5, 11)) is True
    assert window.contains(date(2026, 5, 12)) is True
    assert window.contains(date(2026, 5, 9)) is False
    assert window.contains(date(2026, 5, 13)) is False


def test_skip_window_requires_explicit_date_bounds() -> None:
    with pytest.raises(TypeError):
        SkipWindow()


def test_profile_analytics_snapshot_daily_completions_uses_date_buckets() -> None:
    hints = get_type_hints(ProfileAnalyticsSnapshot)

    assert hints["daily_completions"] == list[tuple[date, int]]


def test_task_definition_exposes_date_only_schedule_anchor() -> None:
    hints = get_type_hints(TaskDefinition)

    assert hints["start_date"] == date


def test_task_deletion_record_defaults_to_active_status() -> None:
    now = utc_now()
    record = TaskDeletionRecord(
        task_snapshot={"id": "task-1", "title": "Task"},
        actor_ha_user_id="ha-user-1",
        deleted_at=now,
        undo_expires_at=now,
    )

    assert record.status == "active"


def test_analytics_baseline_state_defaults_to_none() -> None:
    state = AnalyticsBaselineState()

    assert state.effective_baseline_at is None


def test_analytics_reset_record_captures_previous_baseline() -> None:
    now = utc_now()
    record = AnalyticsBaselineResetRecord(
        previous_baseline_at=None,
        new_baseline_at=now,
        actor_ha_user_id="ha-user-1",
        reset_at=now,
        undo_expires_at=now,
    )

    assert record.previous_baseline_at is None
    assert record.new_baseline_at == now
    assert record.status == "active"
