from datetime import UTC, date

from custom_components.ha_task_manager.models import TaskDueInstance
from custom_components.ha_task_manager.models.task import utc_now


def test_utc_now_returns_timezone_aware_utc_datetime() -> None:
    timestamp = utc_now()

    assert timestamp.tzinfo is not None
    assert timestamp.tzinfo == UTC


def test_task_due_instance_build_uses_deterministic_identifier() -> None:
    instance = TaskDueInstance.build("task-123", date(2026, 5, 13), skipped=True)

    assert instance.id == "task-123:2026-05-13"
    assert instance.task_id == "task-123"
    assert instance.due_date == date(2026, 5, 13)
    assert instance.skipped is True
