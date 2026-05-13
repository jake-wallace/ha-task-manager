"""Completion-related domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import uuid4

from .task import utc_now


class CompletionSource(StrEnum):
    """Source of a completion attempt or record."""

    MANUAL = "manual"
    NFC_PHONE = "nfc_phone"
    NFC_READER = "nfc_reader"


class AttemptOutcome(StrEnum):
    """Outcome of a completion attempt."""

    CONFIRMED = "confirmed"
    BLOCKED_ASSIGNMENT = "blocked_assignment"
    BLOCKED_NO_MAPPING = "blocked_no_mapping"


@dataclass
class CompletionAttempt:
    """Ephemeral in-progress completion confirmation request."""

    id: str = field(default_factory=lambda: str(uuid4()))
    task_id: str = ""
    due_instance_id: str = ""
    actor_ha_user_id: str = ""
    source: CompletionSource = CompletionSource.MANUAL
    initiated_at: datetime = field(default_factory=utc_now)


@dataclass
class CompletionRecord:
    """Immutable persisted completion or blocked-attempt audit record."""

    id: str = field(default_factory=lambda: str(uuid4()))
    task_id: str = ""
    due_instance_id: str = ""
    completed_at: datetime = field(default_factory=utc_now)
    actor_ha_user_id: str = ""
    actor_profile_id: str = ""
    source: CompletionSource = CompletionSource.MANUAL
    outcome: AttemptOutcome = AttemptOutcome.CONFIRMED
    blocked_reason: str = ""
