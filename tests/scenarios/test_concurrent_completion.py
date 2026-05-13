from datetime import UTC, date, datetime

import pytest

from custom_components.ha_task_manager.exceptions import DuplicateCompletionError
from custom_components.ha_task_manager.models import (
    AttemptOutcome,
    CompletionSource,
    HouseholdProfile,
    RecurrenceFrequency,
    RecurrenceRule,
    TaskDefinition,
    TaskDueInstance,
    UserProfileMapping,
)
from custom_components.ha_task_manager.services.completion_domain import (
    CompletionDomainService,
)
from custom_components.ha_task_manager.services.identity_mapping import (
    IdentityMappingService,
)


def test_concurrent_completion_attempts_leave_single_confirmation() -> None:
    profile = HouseholdProfile(
        id="profile-alice",
        display_name="Alice",
        created_at=datetime(2026, 5, 13, tzinfo=UTC),
    )
    identity_mapping = IdentityMappingService(
        profiles=[profile],
        mappings=[
            UserProfileMapping(
                id="mapping-alice-phone",
                ha_user_id="ha-alice-phone",
                profile_id=profile.id,
                created_at=datetime(2026, 5, 13, tzinfo=UTC),
            ),
            UserProfileMapping(
                id="mapping-alice-tablet",
                ha_user_id="ha-alice-tablet",
                profile_id=profile.id,
                created_at=datetime(2026, 5, 13, tzinfo=UTC),
            ),
        ],
    )
    task = TaskDefinition(
        id="task-dishes",
        title="Wash dishes",
        recurrence=RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        ),
        assigned_profile_id=profile.id,
        start_date=date(2026, 5, 13),
        created_at=datetime(2026, 5, 13, tzinfo=UTC),
        updated_at=datetime(2026, 5, 13, tzinfo=UTC),
    )
    due_instance = TaskDueInstance.build(
        task_id=task.id,
        due_date=date(2026, 5, 13),
    )
    service = CompletionDomainService(identity_mapping)

    confirmed_record = service.confirm_completion(
        task=task,
        due_instance=due_instance,
        actor_ha_user_id="ha-alice-phone",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 13, 9, 0, tzinfo=UTC),
    )

    with pytest.raises(DuplicateCompletionError):
        service.confirm_completion(
            task=task,
            due_instance=due_instance,
            actor_ha_user_id="ha-alice-tablet",
            source=CompletionSource.MANUAL,
            completed_at=datetime(2026, 5, 13, 9, 0, 1, tzinfo=UTC),
        )

    history = service.get_history()

    assert history[0] == confirmed_record
    assert [record.outcome for record in history] == [
        AttemptOutcome.CONFIRMED,
        AttemptOutcome.BLOCKED_DUPLICATE,
    ]
    assert history[1].actor_ha_user_id == "ha-alice-tablet"
    assert len(
        [record for record in history if record.outcome == AttemptOutcome.CONFIRMED]
    ) == 1
