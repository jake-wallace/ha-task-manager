"""Analytics snapshot domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from .time import utc_now


@dataclass
class ProfileAnalyticsSnapshot:
    """Derived analytics metrics for a household profile."""

    profile_id: str = ""
    computed_at: datetime = field(default_factory=utc_now)
    daily_completions: list[tuple[str, int]] = field(default_factory=list)
    on_time_count: int = 0
    late_count: int = 0
    missed_count: int = 0
    current_streak: int = 0
    longest_streak: int = 0
