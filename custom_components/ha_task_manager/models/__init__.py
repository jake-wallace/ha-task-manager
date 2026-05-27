"""Domain model exports for HA Task Manager."""

from .analytics import ProfileAnalyticsSnapshot
from .completion import (
    AttemptOutcome,
    CompletionAttempt,
    CompletionRecord,
    CompletionSource,
)
from .destructive import (
    AnalyticsBaselineResetRecord,
    AnalyticsBaselineState,
    OperationStatus,
    TaskDeletionRecord,
)
from .identity import HaUserSummary, HouseholdProfile, UserProfileMapping
from .nfc import NfcDiscoveryEntry, NfcTagMapping
from .task import (
    RecurrenceFrequency,
    RecurrenceRule,
    SkipWindow,
    TaskDefinition,
    TaskDueInstance,
)

__all__ = [
    "AnalyticsBaselineResetRecord",
    "AnalyticsBaselineState",
    "AttemptOutcome",
    "CompletionAttempt",
    "CompletionRecord",
    "CompletionSource",
    "HaUserSummary",
    "HouseholdProfile",
    "NfcDiscoveryEntry",
    "NfcTagMapping",
    "OperationStatus",
    "ProfileAnalyticsSnapshot",
    "RecurrenceFrequency",
    "RecurrenceRule",
    "SkipWindow",
    "TaskDeletionRecord",
    "TaskDefinition",
    "TaskDueInstance",
    "UserProfileMapping",
]
