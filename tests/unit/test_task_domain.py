from datetime import UTC, date, datetime

import pytest

from custom_components.ha_task_manager.exceptions import (
    InvalidRecurrenceError,
    InvalidTaskDefinitionError,
)
from custom_components.ha_task_manager.models import (
    RecurrenceFrequency,
    RecurrenceRule,
    SkipWindow,
    TaskDefinition,
)
from custom_components.ha_task_manager.services.task_domain import TaskDomainService


def build_task(
    recurrence: RecurrenceRule,
    *,
    task_id: str = "task-123",
    skip_windows: list[SkipWindow] | None = None,
    created_at: datetime = datetime(2026, 5, 1, tzinfo=UTC),
    start_date: date | None = None,
) -> TaskDefinition:
    task = TaskDefinition(
        id=task_id,
        title="Test Task",
        recurrence=recurrence,
        skip_windows=skip_windows or [],
        assigned_profile_id="some-profile",
        created_at=created_at,
        updated_at=created_at,
    )
    task.start_date = start_date or created_at.date()
    return task


@pytest.fixture(name="task_domain_service")
def task_domain_service_fixture() -> TaskDomainService:
    return TaskDomainService()


class RecordingTaskDomainService(TaskDomainService):
    def __init__(self) -> None:
        self.calls: list[tuple[date, int]] = []

    def project_due_instances(
        self,
        task: TaskDefinition,
        from_date: date,
        horizon_days: int,
    ) -> list:
        self.calls.append((from_date, horizon_days))
        return super().project_due_instances(
            task=task,
            from_date=from_date,
            horizon_days=horizon_days,
        )


def test_weekly_expansion_produces_dates_and_deterministic_ids(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.WEEKLY,
            days_of_week=[2],
        )
    )

    instances = task_domain_service.project_due_instances(
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


def test_skip_windows_mark_matching_dates_as_skipped(
    task_domain_service: TaskDomainService,
) -> None:
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

    instances = task_domain_service.project_due_instances(
        task=task,
        from_date=date(2026, 5, 11),
        horizon_days=14,
    )

    assert [(instance.due_date, instance.skipped) for instance in instances] == [
        (date(2026, 5, 12), True),
        (date(2026, 5, 19), False),
    ]


def test_daily_recurrence_produces_consecutive_dates(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        )
    )

    instances = task_domain_service.project_due_instances(
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


def test_daily_recurrence_honors_interval_days(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=2,
        )
    )

    instances = task_domain_service.project_due_instances(
        task=task,
        from_date=date(2026, 5, 1),
        horizon_days=6,
    )

    assert [instance.due_date for instance in instances] == [
        date(2026, 5, 1),
        date(2026, 5, 3),
        date(2026, 5, 5),
    ]


def test_projection_uses_start_date_instead_of_created_at_date(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        ),
        created_at=datetime(2026, 5, 10, tzinfo=UTC),
        start_date=date(2026, 5, 1),
    )

    instances = task_domain_service.project_due_instances(
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


def test_custom_interval_recurrence_works(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.CUSTOM_DAYS,
            interval_days=3,
        )
    )

    instances = task_domain_service.project_due_instances(
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


def test_custom_interval_recurrence_anchors_to_start_date(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.CUSTOM_DAYS,
            interval_days=3,
        ),
        created_at=datetime(2026, 5, 1, 12, 0, tzinfo=UTC),
        start_date=date(2026, 5, 2),
    )

    instances = task_domain_service.project_due_instances(
        task=task,
        from_date=date(2026, 5, 1),
        horizon_days=8,
    )

    assert [instance.due_date for instance in instances] == [
        date(2026, 5, 2),
        date(2026, 5, 5),
        date(2026, 5, 8),
    ]


def test_monthly_recurrence_clamps_to_last_valid_day(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.MONTHLY,
            day_of_month=31,
        ),
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )

    instances = task_domain_service.project_due_instances(
        task=task,
        from_date=date(2026, 1, 31),
        horizon_days=61,
    )

    assert [instance.due_date for instance in instances] == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
    ]


def test_invalid_weekly_rule_without_days_raises(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.WEEKLY,
            days_of_week=[],
        )
    )

    with pytest.raises(InvalidRecurrenceError):
        task_domain_service.project_due_instances(
            task=task,
            from_date=date(2026, 5, 1),
            horizon_days=7,
        )


def test_changing_rule_changes_future_projections(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.WEEKLY,
            days_of_week=[2],
        )
    )

    original = task_domain_service.project_due_instances(
        task=task,
        from_date=date(2026, 5, 11),
        horizon_days=14,
    )

    task.recurrence = RecurrenceRule(
        frequency=RecurrenceFrequency.WEEKLY,
        days_of_week=[5],
    )

    updated = task_domain_service.project_due_instances(
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


def test_actionable_selection_picks_oldest_open_overdue_or_today_instance(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        )
    )

    actionable = task_domain_service.select_actionable_due_instance(
        task=task,
        completed_due_instance_ids=set(),
        as_of=date(2026, 5, 5),
        lookback_days=3,
        horizon_days=5,
    )

    assert actionable is not None
    assert actionable.due_date == date(2026, 5, 1)
    assert actionable.id == "task-123:2026-05-01"


def test_actionable_selection_falls_forward_to_next_future_instance(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        )
    )

    actionable = task_domain_service.select_actionable_due_instance(
        task=task,
        completed_due_instance_ids={
            "task-123:2026-05-01",
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


def test_actionable_selection_ignores_skipped_and_completed_instances(
    task_domain_service: TaskDomainService,
) -> None:
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

    actionable = task_domain_service.select_actionable_due_instance(
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


def test_actionable_selection_returns_oldest_open_due_even_beyond_lookback(
    task_domain_service: TaskDomainService,
) -> None:
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        ),
        start_date=date(2026, 3, 1),
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
    )

    actionable = task_domain_service.select_actionable_due_instance(
        task=task,
        completed_due_instance_ids=set(),
        as_of=date(2026, 5, 13),
        lookback_days=30,
        horizon_days=14,
    )

    assert actionable is not None
    assert actionable.due_date == date(2026, 3, 1)
    assert actionable.id == "task-123:2026-03-01"


def test_actionable_selection_uses_lookback_as_backlog_search_chunk() -> None:
    task_domain_service = RecordingTaskDomainService()
    task = build_task(
        RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        ),
        start_date=date(2026, 5, 1),
    )

    actionable = task_domain_service.select_actionable_due_instance(
        task=task,
        completed_due_instance_ids=set(),
        as_of=date(2026, 5, 10),
        lookback_days=3,
        horizon_days=4,
    )

    assert actionable is not None
    assert actionable.due_date == date(2026, 5, 1)
    assert task_domain_service.calls == [
        (date(2026, 5, 8), 3),
        (date(2026, 5, 5), 3),
        (date(2026, 5, 2), 3),
        (date(2026, 5, 1), 1),
    ]


def test_one_off_task_generates_single_instance(task_domain_service: TaskDomainService) -> None:
    """Test that a task with NONE frequency yields exactly one instance on its start date."""
    target_date = date(2026, 6, 1)
    task = TaskDefinition(
        title="One-off chore",
        recurrence=RecurrenceRule(frequency=RecurrenceFrequency.NONE),
        assigned_profile_id="some-profile",
        start_date=target_date,
    )

    instances = task_domain_service.project_due_instances(
        task=task,
        from_date=date(2026, 5, 1),
        horizon_days=62,
    )

    assert len(instances) == 1
    assert instances[0].due_date == target_date


def test_one_off_task_cannot_have_nfc(task_domain_service: TaskDomainService) -> None:
    """Test that a task with NONE frequency cannot be mapped to an NFC tag."""
    task = TaskDefinition(
        title="One-off chore",
        recurrence=RecurrenceRule(frequency=RecurrenceFrequency.NONE),
        assigned_profile_id="some-profile",
        nfc_tag_id="some-tag",
    )

    with pytest.raises(InvalidTaskDefinitionError, match="One-off tasks cannot be assigned NFC tags"):
        task_domain_service.validate_task(task)


def test_task_definition_validation_empty_title(task_domain_service: TaskDomainService) -> None:
    """Test that an empty title raises an error."""
    task = TaskDefinition(
        title="",
        recurrence=RecurrenceRule(frequency=RecurrenceFrequency.DAILY),
        assigned_profile_id="some-profile",
    )

    with pytest.raises(InvalidTaskDefinitionError, match="Title cannot be empty"):
        task_domain_service.validate_task(task)


def test_task_definition_validation_empty_profile(task_domain_service: TaskDomainService) -> None:
    """Test that an empty assigned profile raises an error."""
    task = TaskDefinition(
        title="Test task",
        recurrence=RecurrenceRule(frequency=RecurrenceFrequency.DAILY),
        assigned_profile_id="",
    )

    with pytest.raises(InvalidTaskDefinitionError, match="Task must be assigned to a profile"):
        task_domain_service.validate_task(task)

