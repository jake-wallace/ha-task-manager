"""NFC event handling and pending confirmation management."""

from __future__ import annotations

from collections.abc import Iterable
from copy import deepcopy
from datetime import date

from custom_components.ha_task_manager.exceptions import (
    NoActionableDueInstanceError,
    UnknownNfcTagError,
)
from custom_components.ha_task_manager.models import (
    CompletionAttempt,
    CompletionSource,
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
        tasks: Iterable[TaskDefinition] | None = None,
        task_domain_service: TaskDomainService | None = None,
    ) -> None:
        self._tag_to_task_id: dict[str, str] = {}
        self._tasks_by_id: dict[str, TaskDefinition] = {}
        self._pending_attempts: dict[str, CompletionAttempt] = {}
        self._task_domain_service = task_domain_service or TaskDomainService()

        for task in tasks or []:
            self.register_task(task)
        for mapping in tag_mappings or []:
            self.register_tag_mapping(mapping)

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

    def register_task(self, task: TaskDefinition) -> None:
        """Register or replace a task that may be targeted by NFC."""
        self._tasks_by_id[task.id] = deepcopy(task)
        if task.nfc_tag_id:
            self._tag_to_task_id[task.nfc_tag_id] = task.id

    def register_tag_mapping(self, mapping: NfcTagMapping) -> None:
        """Register or replace a raw tag-to-task mapping."""
        self._tag_to_task_id[mapping.tag_id] = mapping.task_id

