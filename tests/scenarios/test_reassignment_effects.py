from dataclasses import replace
from datetime import UTC, date, datetime

import pytest

from custom_components.ha_task_manager.exceptions import AssignmentViolationError
from custom_components.ha_task_manager.models import (
    AttemptOutcome,
    CompletionSource,
    HouseholdProfile,
    RecurrenceFrequency,
    RecurrenceRule,
    TaskDefinition,
    UserProfileMapping,
)
from custom_components.ha_task_manager.services.completion_domain import (
    CompletionDomainService,
)
from custom_components.ha_task_manager.services.identity_mapping import (
    IdentityMappingService,
)
from custom_components.ha_task_manager.services.task_domain import TaskDomainService


def test_reassignment_requires_new_assignee_for_future_due_instances() -> None:
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

    reassigned_task = replace(
        original_task,
        assigned_profile_id=bob.id,
        updated_at=datetime(2026, 5, 2, tzinfo=UTC),
    )
    future_due_instance = task_domain.project_due_instances(
        task=reassigned_task,
        from_date=date(2026, 5, 2),
        horizon_days=1,
    )[0]

    with pytest.raises(AssignmentViolationError):
        completion_domain.confirm_completion(
            task=reassigned_task,
            due_instance=future_due_instance,
            actor_ha_user_id="ha-alice",
            source=CompletionSource.MANUAL,
            completed_at=datetime(2026, 5, 2, 8, 0, tzinfo=UTC),
        )

    confirmed_record = completion_domain.confirm_completion(
        task=reassigned_task,
        due_instance=future_due_instance,
        actor_ha_user_id="ha-bob",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 2, 9, 0, tzinfo=UTC),
    )

    assert confirmed_record.actor_profile_id == bob.id
    assert [record.outcome for record in completion_domain.get_history()] == [
        AttemptOutcome.BLOCKED_ASSIGNMENT,
        AttemptOutcome.CONFIRMED,
    ]


def test_reassignment_leaves_historical_completion_history_unchanged() -> None:
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

    due_instance = task_domain.project_due_instances(
        task=original_task,
        from_date=date(2026, 5, 11),
        horizon_days=7,
    )[0]
    completion_domain.confirm_completion(
        task=original_task,
        due_instance=due_instance,
        actor_ha_user_id="ha-alice",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 12, 9, 0, tzinfo=UTC),
    )

    reassigned_task = replace(
        original_task,
        assigned_profile_id=bob.id,
        updated_at=datetime(2026, 5, 13, tzinfo=UTC),
    )

    next_due_instance = task_domain.project_due_instances(
        task=reassigned_task,
        from_date=date(2026, 5, 19),
        horizon_days=1,
    )[0]
    completion_domain.confirm_completion(
        task=reassigned_task,
        due_instance=next_due_instance,
        actor_ha_user_id="ha-bob",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 19, 9, 0, tzinfo=UTC),
    )

    assert [record.due_instance_id for record in completion_domain.get_history()] == [
        "task-laundry:2026-05-12"
        ,
        "task-laundry:2026-05-19",
    ]
    assert [record.actor_profile_id for record in completion_domain.get_history()] == [
        alice.id,
        bob.id,
    ]
