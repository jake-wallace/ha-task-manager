"""Task-related domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from uuid import uuid4

from .time import utc_now


class RecurrenceFrequency(StrEnum):
    """Supported recurrence frequencies."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CUSTOM_DAYS = "custom_days"


@dataclass(kw_only=True)
class SkipWindow:
    """Date range where a task recurrence should be skipped."""

    start_date: date
    end_date: date
    id: str = field(default_factory=lambda: str(uuid4()))
    label: str = ""

    def contains(self, value: date) -> bool:
        """Return whether the provided date falls within the skip window."""
        return self.start_date <= value <= self.end_date


@dataclass
class RecurrenceRule:
    """Scheduling rule for generating due task instances."""

    frequency: RecurrenceFrequency
    days_of_week: list[int] = field(default_factory=list)
    interval_days: int = 1
    day_of_month: int | None = None


@dataclass
class TaskDefinition:
    """Persistent task definition owned by the task domain."""

    id: str = field(default_factory=lambda: str(uuid4()))
    title: str = ""
    description: str = ""
    recurrence: RecurrenceRule = field(
        default_factory=lambda: RecurrenceRule(frequency=RecurrenceFrequency.WEEKLY)
    )
    skip_windows: list[SkipWindow] = field(default_factory=list)
    assigned_profile_id: str = ""
    nfc_tag_id: str | None = None
    active: bool = True
    start_date: date = field(default_factory=lambda: utc_now().date())
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


@dataclass
class TaskDueInstance:
    """Concrete due occurrence derived from a task definition."""

    id: str
    task_id: str
    due_date: date
    skipped: bool = False

    @classmethod
    def build(
        cls,
        task_id: str,
        due_date: date,
        skipped: bool = False,
    ) -> TaskDueInstance:
        """Create a due instance with a deterministic identifier."""
        return cls(
            id=f"{task_id}:{due_date.isoformat()}",
            task_id=task_id,
            due_date=due_date,
            skipped=skipped,
        )
