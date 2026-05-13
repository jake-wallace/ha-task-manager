from datetime import UTC, date, datetime

import pytest

from custom_components.ha_task_manager.exceptions import (
    AssignmentViolationError,
    DuplicateCompletionError,
    InvalidCompletionTargetError,
    UnmappedUserError,
)
from custom_components.ha_task_manager.models import (
    AttemptOutcome,
    CompletionRecord,
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


def build_task(*, assigned_profile_id: str) -> TaskDefinition:
    return TaskDefinition(
        id="task-dishes",
        title="Wash dishes",
        recurrence=RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        ),
        assigned_profile_id=assigned_profile_id,
        created_at=datetime(2026, 5, 13, tzinfo=UTC),
        updated_at=datetime(2026, 5, 13, tzinfo=UTC),
        start_date=date(2026, 5, 13),
    )


@pytest.fixture(name="identity_mapping_service")
def identity_mapping_service_fixture() -> IdentityMappingService:
    alex = HouseholdProfile(
        id="profile-alex",
        display_name="Alex",
        created_at=datetime(2026, 5, 13, tzinfo=UTC),
    )
    sam = HouseholdProfile(
        id="profile-sam",
        display_name="Sam",
        created_at=datetime(2026, 5, 13, tzinfo=UTC),
    )
    return IdentityMappingService(
        profiles=[alex, sam],
        mappings=[
            UserProfileMapping(
                id="mapping-alex",
                ha_user_id="ha-user-1",
                profile_id=alex.id,
                created_at=datetime(2026, 5, 13, tzinfo=UTC),
            ),
            UserProfileMapping(
                id="mapping-sam",
                ha_user_id="ha-user-2",
                profile_id=sam.id,
                created_at=datetime(2026, 5, 13, tzinfo=UTC),
            ),
        ],
    )


@pytest.fixture(name="completion_domain_service")
def completion_domain_service_fixture(
    identity_mapping_service: IdentityMappingService,
) -> CompletionDomainService:
    return CompletionDomainService(identity_mapping_service)


def test_assigned_user_can_complete(
    completion_domain_service: CompletionDomainService,
) -> None:
    task = build_task(assigned_profile_id="profile-alex")
    due_instance = TaskDueInstance.build(
        task_id=task.id,
        due_date=date(2026, 5, 13),
    )

    record = completion_domain_service.confirm_completion(
        task=task,
        due_instance=due_instance,
        actor_ha_user_id="ha-user-1",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 13, 9, 0, tzinfo=UTC),
    )

    assert record.outcome == AttemptOutcome.CONFIRMED
    assert record.actor_profile_id == "profile-alex"
    assert record.due_instance_id == due_instance.id
    assert completion_domain_service.get_history() == [record]


def test_duplicate_confirmation_is_rejected_and_audited(
    completion_domain_service: CompletionDomainService,
) -> None:
    task = build_task(assigned_profile_id="profile-alex")
    due_instance = TaskDueInstance.build(
        task_id=task.id,
        due_date=date(2026, 5, 13),
    )

    first_record = completion_domain_service.confirm_completion(
        task=task,
        due_instance=due_instance,
        actor_ha_user_id="ha-user-1",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 13, 9, 0, tzinfo=UTC),
    )

    with pytest.raises(DuplicateCompletionError):
        completion_domain_service.confirm_completion(
            task=task,
            due_instance=due_instance,
            actor_ha_user_id="ha-user-1",
            source=CompletionSource.MANUAL,
            completed_at=datetime(2026, 5, 13, 9, 5, tzinfo=UTC),
        )

    history = completion_domain_service.get_history()

    assert history[0] == first_record
    assert [record.outcome for record in history] == [
        AttemptOutcome.CONFIRMED,
        AttemptOutcome.BLOCKED_DUPLICATE,
    ]
    assert len(
        [record for record in history if record.outcome == AttemptOutcome.CONFIRMED]
    ) == 1


def test_non_assigned_user_raises_assignment_violation(
    completion_domain_service: CompletionDomainService,
) -> None:
    task = build_task(assigned_profile_id="profile-alex")
    due_instance = TaskDueInstance.build(
        task_id=task.id,
        due_date=date(2026, 5, 13),
    )

    with pytest.raises(AssignmentViolationError):
        completion_domain_service.confirm_completion(
            task=task,
            due_instance=due_instance,
            actor_ha_user_id="ha-user-2",
            source=CompletionSource.MANUAL,
            completed_at=datetime(2026, 5, 13, 9, 5, tzinfo=UTC),
        )


def test_blocked_assignment_attempt_is_written_to_audit_history(
    completion_domain_service: CompletionDomainService,
) -> None:
    task = build_task(assigned_profile_id="profile-alex")
    due_instance = TaskDueInstance.build(
        task_id=task.id,
        due_date=date(2026, 5, 13),
    )

    with pytest.raises(AssignmentViolationError):
        completion_domain_service.confirm_completion(
            task=task,
            due_instance=due_instance,
            actor_ha_user_id="ha-user-2",
            source=CompletionSource.MANUAL,
            completed_at=datetime(2026, 5, 13, 9, 5, tzinfo=UTC),
        )

    audit_records = completion_domain_service.get_audit_records()

    assert len(audit_records) == 1
    assert audit_records[0].task_id == task.id
    assert audit_records[0].actor_profile_id == "profile-sam"
    assert audit_records[0].outcome == AttemptOutcome.BLOCKED_ASSIGNMENT


def test_mismatched_due_instance_is_rejected(
    completion_domain_service: CompletionDomainService,
) -> None:
    task = build_task(assigned_profile_id="profile-alex")
    due_instance = TaskDueInstance.build(
        task_id="different-task",
        due_date=date(2026, 5, 13),
    )

    with pytest.raises(InvalidCompletionTargetError):
        completion_domain_service.confirm_completion(
            task=task,
            due_instance=due_instance,
            actor_ha_user_id="ha-user-1",
            source=CompletionSource.MANUAL,
            completed_at=datetime(2026, 5, 13, 9, 10, tzinfo=UTC),
        )

    assert completion_domain_service.get_history() == []


def test_skipped_due_instance_is_rejected(
    completion_domain_service: CompletionDomainService,
) -> None:
    task = build_task(assigned_profile_id="profile-alex")
    due_instance = TaskDueInstance.build(
        task_id=task.id,
        due_date=date(2026, 5, 13),
        skipped=True,
    )

    with pytest.raises(InvalidCompletionTargetError):
        completion_domain_service.confirm_completion(
            task=task,
            due_instance=due_instance,
            actor_ha_user_id="ha-user-1",
            source=CompletionSource.MANUAL,
            completed_at=datetime(2026, 5, 13, 9, 15, tzinfo=UTC),
        )

    assert completion_domain_service.get_history() == []


def test_unmapped_user_raises_and_writes_blocked_audit_record(
    completion_domain_service: CompletionDomainService,
) -> None:
    task = build_task(assigned_profile_id="profile-alex")
    due_instance = TaskDueInstance.build(
        task_id=task.id,
        due_date=date(2026, 5, 13),
    )

    with pytest.raises(UnmappedUserError):
        completion_domain_service.confirm_completion(
            task=task,
            due_instance=due_instance,
            actor_ha_user_id="missing-user",
            source=CompletionSource.MANUAL,
            completed_at=datetime(2026, 5, 13, 9, 20, tzinfo=UTC),
        )

    audit_records = completion_domain_service.get_audit_records()

    assert len(audit_records) == 1
    assert audit_records[0].task_id == task.id
    assert audit_records[0].due_instance_id == due_instance.id
    assert audit_records[0].actor_ha_user_id == "missing-user"
    assert audit_records[0].actor_profile_id == ""
    assert audit_records[0].outcome == AttemptOutcome.BLOCKED_NO_MAPPING
    assert audit_records[0].blocked_reason != ""


def test_completion_history_accessor_is_immutable_by_copy(
    completion_domain_service: CompletionDomainService,
) -> None:
    task = build_task(assigned_profile_id="profile-alex")
    due_instance = TaskDueInstance.build(
        task_id=task.id,
        due_date=date(2026, 5, 13),
    )
    completion_domain_service.confirm_completion(
        task=task,
        due_instance=due_instance,
        actor_ha_user_id="ha-user-1",
        source=CompletionSource.MANUAL,
        completed_at=datetime(2026, 5, 13, 9, 0, tzinfo=UTC),
    )

    copied_history = completion_domain_service.get_history()
    copied_history[0].outcome = AttemptOutcome.BLOCKED_ASSIGNMENT
    copied_history.append(
        CompletionRecord(
            task_id="different-task",
            due_instance_id="different-due-instance",
            actor_ha_user_id="ha-user-1",
            actor_profile_id="profile-alex",
            source=CompletionSource.MANUAL,
        )
    )

    fresh_history = completion_domain_service.get_history()

    assert len(fresh_history) == 1
    assert fresh_history[0].task_id == task.id
    assert fresh_history[0].outcome == AttemptOutcome.CONFIRMED
