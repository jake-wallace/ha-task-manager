from datetime import UTC, date, datetime

import pytest

from custom_components.ha_task_manager.exceptions import InvalidRecurrenceError
from custom_components.ha_task_manager.models import (
    RecurrenceFrequency,
    RecurrenceRule,
    SkipWindow,
    TaskDefinition,
)
from custom_components.ha_task_manager.services.task_domain import (
    project_due_instances,
    select_actionable_due_instance,
)


def build_task(
    recurrence: RecurrenceRule,
    *,
    task_id: str = "task-123",
    skip_windows: list[SkipWindow] | None = None,
    created_at: datetime = datetime(2026, 5, 1, tzinfo=UTC),
) -> TaskDefinition:
    return TaskDefinition(
        id=task_id,
        title="Test Task",
        recurrence=recurrence,
        skip_windows=skip_windows or [],
        created_at=created_at,
        updated_at=created_at,
    )


def test_weekly_expansion_produces_dates_and_deterministic_ids() -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.WEEKLY,
            days_of_week=[2],
        )
    )

    instances = project_due_instances(
        task=task,
        from_date=date(2026, 5, 11),
        horizon_days=14,
    )

    assert [instance.due_date for instance in instances] == [
        date(2026, 5, 12),
        date(2026, 5, 19),
    ]
    assert [instance.id for instance in instances] == [
        "task-123:2026-05-12",
        "task-123:2026-05-19",
    ]


def test_skip_windows_mark_matching_dates_as_skipped() -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.WEEKLY,
            days_of_week=[2],
        ),
        skip_windows=[
            SkipWindow(
                start_date=date(2026, 5, 10),
                end_date=date(2026, 5, 15),
                label="Vacation",
            )
        ],
    )

    instances = project_due_instances(
        task=task,
        from_date=date(2026, 5, 11),
        horizon_days=14,
    )

    assert [(instance.due_date, instance.skipped) for instance in instances] == [
        (date(2026, 5, 12), True),
        (date(2026, 5, 19), False),
    ]


def test_daily_recurrence_produces_consecutive_dates() -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        )
    )

    instances = project_due_instances(
        task=task,
        from_date=date(2026, 5, 1),
        horizon_days=5,
    )

    assert [instance.due_date for instance in instances] == [
        date(2026, 5, 1),
        date(2026, 5, 2),
        date(2026, 5, 3),
        date(2026, 5, 4),
        date(2026, 5, 5),
    ]


def test_custom_interval_recurrence_works() -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.CUSTOM_DAYS,
            interval_days=3,
        )
    )

    instances = project_due_instances(
        task=task,
        from_date=date(2026, 5, 1),
        horizon_days=10,
    )

    assert [instance.due_date for instance in instances] == [
        date(2026, 5, 1),
        date(2026, 5, 4),
        date(2026, 5, 7),
        date(2026, 5, 10),
    ]


def test_monthly_recurrence_clamps_to_last_valid_day() -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.MONTHLY,
            day_of_month=31,
        ),
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )

    instances = project_due_instances(
        task=task,
        from_date=date(2026, 1, 31),
        horizon_days=61,
    )

    assert [instance.due_date for instance in instances] == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
    ]


def test_invalid_weekly_rule_without_days_raises() -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.WEEKLY,
            days_of_week=[],
        )
    )

    with pytest.raises(InvalidRecurrenceError):
        project_due_instances(
            task=task,
            from_date=date(2026, 5, 1),
            horizon_days=7,
        )


def test_changing_rule_changes_future_projections() -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.WEEKLY,
            days_of_week=[2],
        )
    )

    original = project_due_instances(
        task=task,
        from_date=date(2026, 5, 11),
        horizon_days=14,
    )

    task.recurrence = RecurrenceRule(
        frequency=RecurrenceFrequency.WEEKLY,
        days_of_week=[5],
    )

    updated = project_due_instances(
        task=task,
        from_date=date(2026, 5, 11),
        horizon_days=14,
    )

    assert [instance.due_date for instance in original] != [
        instance.due_date for instance in updated
    ]
    assert [instance.due_date for instance in updated] == [
        date(2026, 5, 15),
        date(2026, 5, 22),
    ]


def test_actionable_selection_picks_oldest_open_overdue_or_today_instance() -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        )
    )

    actionable = select_actionable_due_instance(
        task=task,
        completed_due_instance_ids=set(),
        as_of=date(2026, 5, 5),
        lookback_days=3,
        horizon_days=5,
    )

    assert actionable is not None
    assert actionable.due_date == date(2026, 5, 2)
    assert actionable.id == "task-123:2026-05-02"


def test_actionable_selection_falls_forward_to_next_future_instance() -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        )
    )

    actionable = select_actionable_due_instance(
        task=task,
        completed_due_instance_ids={
            "task-123:2026-05-02",
            "task-123:2026-05-03",
            "task-123:2026-05-04",
            "task-123:2026-05-05",
        },
        as_of=date(2026, 5, 5),
        lookback_days=3,
        horizon_days=5,
    )

    assert actionable is not None
    assert actionable.due_date == date(2026, 5, 6)
    assert actionable.id == "task-123:2026-05-06"


def test_actionable_selection_ignores_skipped_and_completed_instances() -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        ),
        skip_windows=[
            SkipWindow(
                start_date=date(2026, 5, 2),
                end_date=date(2026, 5, 3),
                label="Away",
            )
        ],
    )

    actionable = select_actionable_due_instance(
        task=task,
        completed_due_instance_ids={
            "task-123:2026-05-01",
            "task-123:2026-05-04",
        },
        as_of=date(2026, 5, 4),
        lookback_days=3,
        horizon_days=3,
    )

    assert actionable is not None
    assert actionable.due_date == date(2026, 5, 5)
    assert actionable.skipped is False
