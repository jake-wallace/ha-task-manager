"""Destructive operation control models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4


class OperationStatus(StrEnum):
    """Lifecycle status for reversible destructive operations."""

    ACTIVE = "active"
    UNDONE = "undone"
    EXPIRED = "expired"


@dataclass
class TaskDeletionRecord:
    """Persisted metadata for a task-definition deletion action."""

    task_snapshot: dict[str, Any]
    actor_ha_user_id: str
    deleted_at: datetime
    undo_expires_at: datetime
    id: str = field(default_factory=lambda: str(uuid4()))
    status: OperationStatus = OperationStatus.ACTIVE


@dataclass
class AnalyticsBaselineResetRecord:
    """Persisted metadata for an analytics baseline reset action."""

    previous_baseline_at: datetime | None
    new_baseline_at: datetime
    actor_ha_user_id: str
    reset_at: datetime
    undo_expires_at: datetime
    id: str = field(default_factory=lambda: str(uuid4()))
    status: OperationStatus = OperationStatus.ACTIVE


@dataclass
class AnalyticsBaselineState:
    """Current effective analytics baseline marker."""

    effective_baseline_at: datetime | None = None