from datetime import UTC, date, datetime

from custom_components.ha_task_manager.models import (
    CompletionSource,
    HouseholdProfile,
    RecurrenceFrequency,
    RecurrenceRule,
    TaskDefinition,
    UserProfileMapping,
)
from custom_components.ha_task_manager.services.analytics import AnalyticsService
from custom_components.ha_task_manager.services.completion_domain import (
    CompletionDomainService,
)
from custom_components.ha_task_manager.services.identity_mapping import (
    IdentityMappingService,
)
from custom_components.ha_task_manager.services.task_domain import TaskDomainService


def test_overdue_instances_accumulate_until_completed() -> None:
    profile = HouseholdProfile(
        id="profile-alice",
        display_name="Alice",
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    identity_mapping = IdentityMappingService(
        profiles=[profile],
        mappings=[
            UserProfileMapping(
                id="mapping-alice",
                ha_user_id="ha-alice",
                profile_id=profile.id,
                created_at=datetime(2026, 5, 1, tzinfo=UTC),
            )
        ],
    )
    task = TaskDefinition(
        id="task-trash",
        title="Take out trash",
        recurrence=RecurrenceRule(
            frequency=RecurrenceFrequency.WEEKLY,
            days_of_week=[5],
        ),
        assigned_profile_id=profile.id,
        start_date=date(2026, 5, 1),
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
        updated_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    task_domain = TaskDomainService()
    completion_domain = CompletionDomainService(identity_mapping)
    analytics = AnalyticsService()

    projected_due_instances = task_domain.project_due_instances(
        task=task,
        from_date=date(2026, 5, 1),
        horizon_days=28,
    )

    completion_domain.confirm_completion(
        task=task,
        due_instance=projected_due_instances[0],
        actor_ha_user_id="ha-alice",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 1, 9, 0, tzinfo=UTC),
    )
    completion_domain.confirm_completion(
        task=task,
        due_instance=projected_due_instances[2],
        actor_ha_user_id="ha-alice",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 17, 9, 0, tzinfo=UTC),
    )

    snapshot = analytics.compute_snapshot(
        profile_id=profile.id,
        history=completion_domain.get_history(),
        projected_due_instances=projected_due_instances,
        task_assignments={task.id: profile.id},
        as_of=date(2026, 5, 23),
    )
    actionable_due_instance = task_domain.select_actionable_due_instance(
        task=task,
        completed_due_instance_ids={
            record.due_instance_id for record in completion_domain.get_history()
        },
        as_of=date(2026, 5, 23),
        lookback_days=14,
        horizon_days=14,
    )

    assert [instance.due_date for instance in projected_due_instances] == [
        date(2026, 5, 1),
        date(2026, 5, 8),
        date(2026, 5, 15),
        date(2026, 5, 22),
    ]
    assert snapshot.missed_count == 2
    assert snapshot.on_time_count == 1
    assert snapshot.late_count == 1
    assert actionable_due_instance is not None
    assert actionable_due_instance.id == "task-trash:2026-05-08"
