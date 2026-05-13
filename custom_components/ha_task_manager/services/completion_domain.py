"""Completion validation and immutable history service."""

from __future__ import annotations

from collections.abc import Iterable
from copy import deepcopy
from datetime import datetime

from custom_components.ha_task_manager.exceptions import AssignmentViolationError
from custom_components.ha_task_manager.models import (
    AttemptOutcome,
    CompletionRecord,
    CompletionSource,
    TaskDefinition,
    TaskDueInstance,
)
from custom_components.ha_task_manager.models.time import utc_now
from custom_components.ha_task_manager.services.identity_mapping import (
    IdentityMappingService,
)


class CompletionDomainService:
    """Validate completion attempts and append immutable history records."""

    def __init__(
        self,
        identity_mapping_service: IdentityMappingService,
        history: Iterable[CompletionRecord] | None = None,
    ) -> None:
        self._identity_mapping_service = identity_mapping_service
        self._history: list[CompletionRecord] = [
            deepcopy(record) for record in history or []
        ]

    def confirm_completion(
        self,
        *,
        task: TaskDefinition,
        due_instance: TaskDueInstance,
        actor_ha_user_id: str,
        source: CompletionSource,
        completed_at: datetime | None = None,
    ) -> CompletionRecord:
        """Confirm a completion attempt for the provided task due instance."""
        actor_profile = self._identity_mapping_service.resolve_profile(actor_ha_user_id)
        record_timestamp = completed_at or utc_now()

        if actor_profile.id != task.assigned_profile_id:
            blocked_record = CompletionRecord(
                task_id=task.id,
                due_instance_id=due_instance.id,
                completed_at=record_timestamp,
                actor_ha_user_id=actor_ha_user_id,
                actor_profile_id=actor_profile.id,
                source=source,
                outcome=AttemptOutcome.BLOCKED_ASSIGNMENT,
                blocked_reason=(
                    f"Task assigned to {task.assigned_profile_id!r}; "
                    f"attempted by {actor_profile.id!r}."
                ),
            )
            self._history.append(blocked_record)
            raise AssignmentViolationError(
                task_id=task.id,
                actor_id=actor_profile.id,
                assigned_id=task.assigned_profile_id,
            )

        confirmed_record = CompletionRecord(
            task_id=task.id,
            due_instance_id=due_instance.id,
            completed_at=record_timestamp,
            actor_ha_user_id=actor_ha_user_id,
            actor_profile_id=actor_profile.id,
            source=source,
            outcome=AttemptOutcome.CONFIRMED,
        )
        self._history.append(confirmed_record)
        return deepcopy(confirmed_record)

    def get_history(self) -> list[CompletionRecord]:
        """Return a copy of the immutable completion and audit history."""
        return deepcopy(self._history)

    def get_audit_records(self) -> list[CompletionRecord]:
        """Return a copied audit-visible history stream."""
        return self.get_history()
