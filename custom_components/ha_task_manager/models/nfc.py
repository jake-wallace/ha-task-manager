"""NFC-related domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4

from .task import utc_now


@dataclass
class NfcTagMapping:
    """Mapping from a raw NFC tag identifier to a task."""

    id: str = field(default_factory=lambda: str(uuid4()))
    tag_id: str = ""
    task_id: str = ""
    label: str = ""
    created_at: datetime = field(default_factory=utc_now)
