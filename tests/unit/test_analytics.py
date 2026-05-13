from datetime import UTC, date, datetime

import pytest

from custom_components.ha_task_manager.models import (
    AttemptOutcome,
    CompletionRecord,
    CompletionSource,
    TaskDueInstance,
)
from custom_components.ha_task_manager.services.analytics import AnalyticsService


@pytest.fixture(name="service")
def service_fixture() -> AnalyticsService:
    return AnalyticsService()


def build_record(
    *,
    profile_id: str,
    task_id: str = "task-1",
    due_instance_id: str,
    completed_at: datetime,
    outcome: AttemptOutcome = AttemptOutcome.CONFIRMED,
) -> CompletionRecord:
    return CompletionRecord(
        task_id=task_id,
        due_instance_id=due_instance_id,
        completed_at=completed_at,
        actor_ha_user_id=f"ha-{profile_id}",
        actor_profile_id=profile_id,
        source=CompletionSource.MANUAL,
        outcome=outcome,
    )


def build_due_instance(*, task_id: str = "task-1", due_date: date) -> TaskDueInstance:
    return TaskDueInstance.build(task_id=task_id, due_date=due_date)


def test_completion_count_per_profile_uses_daily_buckets(
    service: AnalyticsService,
) -> None:
    history = [
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-01",
            completed_at=datetime(2026, 5, 1, 8, 0, tzinfo=UTC),
        ),
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-01",
            completed_at=datetime(2026, 5, 1, 18, 0, tzinfo=UTC),
        ),
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-02",
            completed_at=datetime(2026, 5, 2, 9, 0, tzinfo=UTC),
        ),
        build_record(
            profile_id="bob",
            due_instance_id="task-1:2026-05-03",
            completed_at=datetime(2026, 5, 3, 9, 0, tzinfo=UTC),
        ),
    ]

    snapshot = service.compute_snapshot(
        profile_id="alice",
        history=history,
        projected_due_instances=[],
        task_assignments={"task-1": "alice"},
        as_of=date(2026, 5, 13),
    )

    assert snapshot.daily_completions == [
        (date(2026, 5, 1), 2),
        (date(2026, 5, 2), 1),
    ]
    assert isinstance(snapshot.daily_completions[0][0], date)


def test_missed_count_comes_from_past_due_uncompleted_instances(
    service: AnalyticsService,
) -> None:
    due_instances = [
        build_due_instance(due_date=date(2026, 5, 1)),
        build_due_instance(due_date=date(2026, 5, 2)),
        build_due_instance(due_date=date(2026, 5, 3)),
    ]
    history = [
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-02",
            completed_at=datetime(2026, 5, 2, 7, 0, tzinfo=UTC),
        )
    ]

    snapshot = service.compute_snapshot(
        profile_id="alice",
        history=history,
        projected_due_instances=due_instances,
        task_assignments={"task-1": "alice"},
        as_of=date(2026, 5, 4),
    )

    assert snapshot.missed_count == 2


def test_missed_count_filters_due_instances_by_assigned_profile(
    service: AnalyticsService,
) -> None:
    due_instances = [
        build_due_instance(task_id="task-1", due_date=date(2026, 5, 1)),
        build_due_instance(task_id="task-1", due_date=date(2026, 5, 2)),
        build_due_instance(task_id="task-2", due_date=date(2026, 5, 1)),
    ]
    history = [
        build_record(
            profile_id="alice",
            task_id="task-1",
            due_instance_id="task-1:2026-05-02",
            completed_at=datetime(2026, 5, 2, 7, 0, tzinfo=UTC),
        )
    ]

    snapshot = service.compute_snapshot(
        profile_id="alice",
        history=history,
        projected_due_instances=due_instances,
        task_assignments={"task-1": "alice", "task-2": "bob"},
        as_of=date(2026, 5, 4),
    )

    assert snapshot.missed_count == 1


def test_on_time_and_late_counts_are_computed_from_due_dates(
    service: AnalyticsService,
) -> None:
    due_instances = [
        build_due_instance(due_date=date(2026, 5, 5)),
        build_due_instance(due_date=date(2026, 5, 6)),
    ]
    history = [
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-05",
            completed_at=datetime(2026, 5, 5, 10, 0, tzinfo=UTC),
        ),
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-06",
            completed_at=datetime(2026, 5, 7, 10, 0, tzinfo=UTC),
        ),
    ]

    snapshot = service.compute_snapshot(
        profile_id="alice",
        history=history,
        projected_due_instances=due_instances,
        task_assignments={"task-1": "alice"},
        as_of=date(2026, 5, 13),
    )

    assert snapshot.on_time_count == 1
    assert snapshot.late_count == 1


def test_current_and_longest_streak_are_computed_from_completion_days(
    service: AnalyticsService,
) -> None:
    history = [
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-01",
            completed_at=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
        ),
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-02",
            completed_at=datetime(2026, 5, 2, 9, 0, tzinfo=UTC),
        ),
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-04",
            completed_at=datetime(2026, 5, 4, 9, 0, tzinfo=UTC),
        ),
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-05",
            completed_at=datetime(2026, 5, 5, 9, 0, tzinfo=UTC),
        ),
        build_record(
            profile_id="alice",
            due_instance_id="task-1:2026-05-06",
            completed_at=datetime(2026, 5, 6, 9, 0, tzinfo=UTC),
        ),
    ]

    snapshot = service.compute_snapshot(
        profile_id="alice",
        history=history,
        projected_due_instances=[],
        task_assignments={"task-1": "alice"},
        as_of=date(2026, 5, 6),
    )

    assert snapshot.current_streak == 3
    assert snapshot.longest_streak == 3
