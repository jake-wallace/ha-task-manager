from dataclasses import replace
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


def test_reassignment_moves_open_overdue_work_to_new_assignee() -> None:
    alice = HouseholdProfile(
        id="profile-alice",
        display_name="Alice",
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    bob = HouseholdProfile(
        id="profile-bob",
        display_name="Bob",
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    identity_mapping = IdentityMappingService(
        profiles=[alice, bob],
        mappings=[
            UserProfileMapping(
                id="mapping-alice",
                ha_user_id="ha-alice",
                profile_id=alice.id,
                created_at=datetime(2026, 5, 1, tzinfo=UTC),
            ),
            UserProfileMapping(
                id="mapping-bob",
                ha_user_id="ha-bob",
                profile_id=bob.id,
                created_at=datetime(2026, 5, 1, tzinfo=UTC),
            ),
        ],
    )
    original_task = TaskDefinition(
        id="task-bathroom",
        title="Clean bathroom",
        recurrence=RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        ),
        assigned_profile_id=alice.id,
        start_date=date(2026, 5, 1),
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
        updated_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    task_domain = TaskDomainService()
    completion_domain = CompletionDomainService(identity_mapping)
    analytics = AnalyticsService()

    projected_due_instances = task_domain.project_due_instances(
        task=original_task,
        from_date=date(2026, 5, 1),
        horizon_days=4,
    )
    completion_domain.confirm_completion(
        task=original_task,
        due_instance=projected_due_instances[0],
        actor_ha_user_id="ha-alice",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 1, 8, 0, tzinfo=UTC),
    )

    reassigned_task = replace(
        original_task,
        assigned_profile_id=bob.id,
        updated_at=datetime(2026, 5, 2, tzinfo=UTC),
    )

    alice_snapshot = analytics.compute_snapshot(
        profile_id=alice.id,
        history=completion_domain.get_history(),
        projected_due_instances=projected_due_instances,
        task_assignments={reassigned_task.id: reassigned_task.assigned_profile_id},
        as_of=date(2026, 5, 4),
    )
    bob_snapshot = analytics.compute_snapshot(
        profile_id=bob.id,
        history=completion_domain.get_history(),
        projected_due_instances=projected_due_instances,
        task_assignments={reassigned_task.id: reassigned_task.assigned_profile_id},
        as_of=date(2026, 5, 4),
    )

    assert alice_snapshot.daily_completions == [(date(2026, 5, 1), 1)]
    assert alice_snapshot.missed_count == 0
    assert bob_snapshot.daily_completions == []
    assert bob_snapshot.missed_count == 2


def test_recurrence_rule_change_reprojects_future_instances_without_mutating_history(
    ) -> None:
    alice = HouseholdProfile(
        id="profile-alice",
        display_name="Alice",
        created_at=datetime(2026, 5, 1, tzinfo=UTC),
    )
    identity_mapping = IdentityMappingService(
        profiles=[alice],
        mappings=[
            UserProfileMapping(
                id="mapping-alice",
                ha_user_id="ha-alice",
                profile_id=alice.id,
                created_at=datetime(2026, 5, 1, tzinfo=UTC),
            )
        ],
    )
    original_task = TaskDefinition(
        id="task-laundry",
        title="Laundry",
        recurrence=RecurrenceRule(
            frequency=RecurrenceFrequency.WEEKLY,
            days_of_week=[2],
        ),
        assigned_profile_id=alice.id,
        start_date=date(2026, 5, 5),
        created_at=datetime(2026, 5, 5, tzinfo=UTC),
        updated_at=datetime(2026, 5, 5, tzinfo=UTC),
    )
    task_domain = TaskDomainService()
    completion_domain = CompletionDomainService(identity_mapping)

    before_change = task_domain.project_due_instances(
        task=original_task,
        from_date=date(2026, 5, 11),
        horizon_days=14,
    )
    completion_domain.confirm_completion(
        task=original_task,
        due_instance=before_change[0],
        actor_ha_user_id="ha-alice",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 12, 9, 0, tzinfo=UTC),
    )

    changed_task = replace(
        original_task,
        recurrence=RecurrenceRule(
            frequency=RecurrenceFrequency.WEEKLY,
            days_of_week=[5],
        ),
        updated_at=datetime(2026, 5, 13, tzinfo=UTC),
    )
    after_change = task_domain.project_due_instances(
        task=changed_task,
        from_date=date(2026, 5, 11),
        horizon_days=14,
    )

    assert [instance.id for instance in before_change] == [
        "task-laundry:2026-05-12",
        "task-laundry:2026-05-19",
    ]
    assert [instance.id for instance in after_change] == [
        "task-laundry:2026-05-15",
        "task-laundry:2026-05-22",
    ]
    assert [record.due_instance_id for record in completion_domain.get_history()] == [
        "task-laundry:2026-05-12"
    ]
