from datetime import UTC, date
from typing import get_type_hints

import pytest

from custom_components.ha_task_manager.models import (
    ProfileAnalyticsSnapshot,
    SkipWindow,
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
