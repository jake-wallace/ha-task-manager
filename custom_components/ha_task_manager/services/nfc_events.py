"""NFC event handling and pending confirmation management."""

from __future__ import annotations

from collections.abc import Iterable
from copy import deepcopy
from datetime import date, datetime

from custom_components.ha_task_manager.exceptions import (
    NoActionableDueInstanceError,
    UnknownNfcTagError,
)
from custom_components.ha_task_manager.models import (
    CompletionAttempt,
    CompletionSource,
    NfcDiscoveryEntry,
    NfcTagMapping,
    TaskDefinition,
)
from custom_components.ha_task_manager.models.time import utc_now
from custom_components.ha_task_manager.services.task_domain import TaskDomainService


class NfcEventService:
    """Resolve NFC tags to tasks and manage pending confirmation attempts."""

    def __init__(
        self,
        tag_mappings: Iterable[NfcTagMapping] | None = None,
        discovery_entries: Iterable[NfcDiscoveryEntry] | None = None,
        tasks: Iterable[TaskDefinition] | None = None,
        pending_attempts: Iterable[CompletionAttempt] | None = None,
        task_domain_service: TaskDomainService | None = None,
    ) -> None:
        self._tag_to_task_id: dict[str, str] = {}
        self._tag_mappings_by_tag_id: dict[str, NfcTagMapping] = {}
        self._tasks_by_id: dict[str, TaskDefinition] = {}
        self._discoveries_by_tag_id: dict[str, NfcDiscoveryEntry] = {}
        self._pending_attempts: dict[str, CompletionAttempt] = {}
        self._task_domain_service = task_domain_service or TaskDomainService()

        for task in tasks or []:
            self.register_task(task)
        for mapping in tag_mappings or []:
            self.register_tag_mapping(mapping)
        for discovery_entry in discovery_entries or []:
            self._discoveries_by_tag_id[discovery_entry.tag_id] = deepcopy(
                discovery_entry
            )
        self._retire_mapped_discoveries()
        for attempt in pending_attempts or []:
            self._pending_attempts[attempt.id] = deepcopy(attempt)

    def resolve_tag(self, tag_id: str) -> TaskDefinition:
        """Return the task mapped to the NFC tag."""
        task_id = self._tag_to_task_id.get(tag_id)
        if task_id is None:
            raise UnknownNfcTagError(tag_id)

        task = self._tasks_by_id.get(task_id)
        if task is None:
            raise UnknownNfcTagError(tag_id)

        return deepcopy(task)

    def initiate_confirmation(
        self,
        *,
        tag_id: str,
        actor_ha_user_id: str,
        source: CompletionSource,
        completed_due_instance_ids: set[str] | None = None,
        as_of: date | None = None,
    ) -> CompletionAttempt:
        """Create a pending NFC confirmation attempt for the actionable due instance."""
        task = self.resolve_tag(tag_id)
        actionable_due_instance = (
            self._task_domain_service.select_actionable_due_instance(
                task=task,
                completed_due_instance_ids=completed_due_instance_ids or set(),
                as_of=as_of or utc_now().date(),
            )
        )
        if actionable_due_instance is None:
            raise NoActionableDueInstanceError(task.id)

        existing_attempt = self._get_pending_attempt_for_due_instance(
            actionable_due_instance.id
        )
        if existing_attempt is not None:
            return existing_attempt

        attempt = CompletionAttempt(
            task_id=task.id,
            due_instance_id=actionable_due_instance.id,
            actor_ha_user_id=actor_ha_user_id,
            source=source,
        )
        self._pending_attempts[attempt.id] = deepcopy(attempt)
        return deepcopy(attempt)

    def get_pending_confirmations(self) -> list[CompletionAttempt]:
        """Return pending NFC confirmation attempts."""
        return [
            deepcopy(attempt) for attempt in self._pending_attempts.values()
        ]

    def get_pending_confirmation(self, attempt_id: str) -> CompletionAttempt | None:
        """Return a pending confirmation attempt if present."""
        attempt = self._pending_attempts.get(attempt_id)
        if attempt is None:
            return None

        return deepcopy(attempt)

    def dismiss_confirmation(self, attempt_id: str) -> None:
        """Remove a pending confirmation attempt if it exists."""
        self._pending_attempts.pop(attempt_id, None)

    def record_tag_discovery(
        self,
        tag_id: str,
        *,
        source: str,
        seen_at: datetime | None = None,
    ) -> NfcDiscoveryEntry:
        """Record or update observed metadata for an NFC tag."""
        observed_at = seen_at or utc_now()
        existing_entry = self._discoveries_by_tag_id.get(tag_id)

        if tag_id in self._tag_to_task_id:
            self._discoveries_by_tag_id.pop(tag_id, None)
            return NfcDiscoveryEntry(
                tag_id=tag_id,
                first_seen=(
                    existing_entry.first_seen
                    if existing_entry is not None
                    else observed_at
                ),
                last_seen=observed_at,
                last_source=source,
            )

        if existing_entry is None:
            updated_entry = NfcDiscoveryEntry(
                tag_id=tag_id,
                first_seen=observed_at,
                last_seen=observed_at,
                last_source=source,
            )
        else:
            updated_entry = deepcopy(existing_entry)
            updated_entry.last_seen = observed_at
            updated_entry.last_source = source

        self._discoveries_by_tag_id[tag_id] = deepcopy(updated_entry)
        return deepcopy(updated_entry)

    def list_unmapped_discoveries(self) -> list[NfcDiscoveryEntry]:
        """Return discovered tags that are not currently mapped to a task."""
        return [
            deepcopy(entry)
            for tag_id, entry in sorted(
                self._discoveries_by_tag_id.items(),
                key=lambda item: (item[1].last_seen, item[0]),
                reverse=True,
            )
            if tag_id not in self._tag_to_task_id
        ]

    def get_discoveries(self) -> list[NfcDiscoveryEntry]:
        """Return all discovery entries for persistence."""
        return [
            deepcopy(entry)
            for tag_id, entry in self._discoveries_by_tag_id.items()
            if tag_id not in self._tag_to_task_id
        ]

    def replace_tag_mappings(self, mappings: Iterable[NfcTagMapping]) -> None:
        """Replace the active NFC tag mappings with a new persisted set."""
        self._tag_mappings_by_tag_id = {
            mapping.tag_id: deepcopy(mapping) for mapping in mappings
        }
        self._rebuild_tag_index()

    def _get_pending_attempt_for_due_instance(
        self,
        due_instance_id: str,
    ) -> CompletionAttempt | None:
        for attempt in self._pending_attempts.values():
            if attempt.due_instance_id == due_instance_id:
                return deepcopy(attempt)

        return None

    def register_task(self, task: TaskDefinition) -> None:
        """Register or replace a task that may be targeted by NFC."""
        self._tasks_by_id[task.id] = deepcopy(task)
        self._rebuild_tag_index()

    def register_tag_mapping(self, mapping: NfcTagMapping) -> None:
        """Register or replace a raw tag-to-task mapping."""
        self._tag_mappings_by_tag_id[mapping.tag_id] = deepcopy(mapping)
        self._rebuild_tag_index()

    def _rebuild_tag_index(self) -> None:
        tag_to_task_id: dict[str, str] = {}

        for task in self._tasks_by_id.values():
            if task.active and task.nfc_tag_id:
                tag_to_task_id[task.nfc_tag_id] = task.id

        for mapping in self._tag_mappings_by_tag_id.values():
            tag_to_task_id[mapping.tag_id] = mapping.task_id

        self._tag_to_task_id = tag_to_task_id
        self._retire_mapped_discoveries()

    def _retire_mapped_discoveries(self) -> None:
        for tag_id in list(self._discoveries_by_tag_id):
            if tag_id in self._tag_to_task_id:
                self._discoveries_by_tag_id.pop(tag_id, None)

