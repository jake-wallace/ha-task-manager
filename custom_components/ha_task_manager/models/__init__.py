"""Domain model exports for HA Task Manager."""

from .analytics import ProfileAnalyticsSnapshot
from .completion import (
    AttemptOutcome,
    CompletionAttempt,
    CompletionRecord,
    CompletionSource,
)
from .identity import HouseholdProfile, UserProfileMapping
from .nfc import NfcTagMapping
from .task import (
    RecurrenceFrequency,
    RecurrenceRule,
    SkipWindow,
    TaskDefinition,
    TaskDueInstance,
)

__all__ = [
    "AttemptOutcome",
    "CompletionAttempt",
    "CompletionRecord",
    "CompletionSource",
    "HouseholdProfile",
    "NfcTagMapping",
    "ProfileAnalyticsSnapshot",
    "RecurrenceFrequency",
    "RecurrenceRule",
    "SkipWindow",
    "TaskDefinition",
    "TaskDueInstance",
    "UserProfileMapping",
]
