"""Identity mapping domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4

from .task import utc_now


@dataclass
class HouseholdProfile:
    """Household identity used for assignments and analytics."""

    id: str = field(default_factory=lambda: str(uuid4()))
    display_name: str = ""
    avatar_url: str = ""
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class UserProfileMapping:
    """Explicit link between a Home Assistant user and household profile."""

    id: str = field(default_factory=lambda: str(uuid4()))
    ha_user_id: str = ""
    profile_id: str = ""
    created_at: datetime = field(default_factory=utc_now)
