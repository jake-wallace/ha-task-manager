from datetime import UTC, date, datetime

import pytest

from custom_components.ha_task_manager.exceptions import UnknownNfcTagError
from custom_components.ha_task_manager.models import (
    CompletionSource,
    NfcTagMapping,
    RecurrenceFrequency,
    RecurrenceRule,
    TaskDefinition,
)
from custom_components.ha_task_manager.services.nfc_events import NfcEventService
from custom_components.ha_task_manager.services.task_domain import TaskDomainService


@pytest.fixture(name="task")
def task_fixture() -> TaskDefinition:
    return TaskDefinition(
        id="task-bathroom",
        title="Clean bathroom",
        recurrence=RecurrenceRule(
            frequency=RecurrenceFrequency.DAILY,
            interval_days=1,
        ),
        assigned_profile_id="profile-alice",
        nfc_tag_id="tag-abc123",
        created_at=datetime(2026, 5, 10, tzinfo=UTC),
        updated_at=datetime(2026, 5, 10, tzinfo=UTC),
        start_date=date(2026, 5, 10),
    )


@pytest.fixture(name="tag_mapping")
def tag_mapping_fixture(task: TaskDefinition) -> NfcTagMapping:
    return NfcTagMapping(
        id="mapping-1",
        tag_id="tag-abc123",
        task_id=task.id,
        label="Bathroom",
        created_at=datetime(2026, 5, 10, tzinfo=UTC),
    )


@pytest.fixture(name="service")
def service_fixture(
    tag_mapping: NfcTagMapping,
    task: TaskDefinition,
) -> NfcEventService:
    return NfcEventService(
        tag_mappings=[tag_mapping],
        tasks=[task],
        task_domain_service=TaskDomainService(),
    )


def test_resolve_known_tag(service: NfcEventService, task: TaskDefinition) -> None:
    result = service.resolve_tag("tag-abc123")

    assert result.id == task.id


def test_resolve_unknown_tag_raises(service: NfcEventService) -> None:
    with pytest.raises(UnknownNfcTagError):
        service.resolve_tag("tag-unknown")


def test_phone_confirmation_creates_pending_attempt_with_due_instance(
    service: NfcEventService,
) -> None:
    attempt = service.initiate_confirmation(
        tag_id="tag-abc123",
        actor_ha_user_id="ha-alice",
        source=CompletionSource.NFC_PHONE,
        completed_due_instance_ids={
            "task-bathroom:2026-05-10",
            "task-bathroom:2026-05-11",
        },
        as_of=date(2026, 5, 12),
    )

    assert attempt.source == CompletionSource.NFC_PHONE
    assert attempt.actor_ha_user_id == "ha-alice"
    assert attempt.task_id == "task-bathroom"
    assert attempt.due_instance_id == "task-bathroom:2026-05-12"


def test_reader_confirmation_creates_pending_attempt_with_due_instance(
    service: NfcEventService,
) -> None:
    attempt = service.initiate_confirmation(
        tag_id="tag-abc123",
        actor_ha_user_id="ha-alice",
        source=CompletionSource.NFC_READER,
        completed_due_instance_ids={
            "task-bathroom:2026-05-10",
            "task-bathroom:2026-05-11",
            "task-bathroom:2026-05-12",
        },
        as_of=date(2026, 5, 13),
    )

    assert attempt.source == CompletionSource.NFC_READER
    assert attempt.actor_ha_user_id == "ha-alice"
    assert attempt.due_instance_id == "task-bathroom:2026-05-13"


def test_pending_confirmations_are_tracked(service: NfcEventService) -> None:
    attempt = service.initiate_confirmation(
        tag_id="tag-abc123",
        actor_ha_user_id="ha-alice",
        source=CompletionSource.NFC_PHONE,
        as_of=date(2026, 5, 10),
    )

    pending = service.get_pending_confirmations()

    assert pending == [attempt]


def test_repeated_scans_reuse_existing_pending_attempt_for_same_due_instance(
    service: NfcEventService,
) -> None:
    first_attempt = service.initiate_confirmation(
        tag_id="tag-abc123",
        actor_ha_user_id="ha-alice",
        source=CompletionSource.NFC_PHONE,
        as_of=date(2026, 5, 10),
    )

    second_attempt = service.initiate_confirmation(
        tag_id="tag-abc123",
        actor_ha_user_id="ha-alice",
        source=CompletionSource.NFC_PHONE,
        as_of=date(2026, 5, 10),
    )

    assert second_attempt == first_attempt
    assert service.get_pending_confirmations() == [first_attempt]


def test_dismiss_confirmation_removes_pending_attempt(service: NfcEventService) -> None:
    attempt = service.initiate_confirmation(
        tag_id="tag-abc123",
        actor_ha_user_id="ha-alice",
        source=CompletionSource.NFC_PHONE,
        as_of=date(2026, 5, 10),
    )

    service.dismiss_confirmation(attempt.id)

    assert service.get_pending_confirmations() == []
