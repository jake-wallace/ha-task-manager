"""Task recurrence projection and due-instance selection."""

from __future__ import annotations

import calendar
from datetime import date, timedelta

from custom_components.ha_task_manager.exceptions import (
    InvalidRecurrenceError,
    InvalidTaskDefinitionError,
)
from custom_components.ha_task_manager.models import (
    RecurrenceFrequency,
    RecurrenceRule,
    SkipWindow,
    TaskDefinition,
    TaskDueInstance,
)


class TaskDomainService:
    """Task recurrence projection and due-instance selection service."""

    def validate_task(self, task: TaskDefinition) -> None:
        """Validate a task definition before persistence or projection."""
        _validate_task(task)

    def project_due_instances(
        self,
        task: TaskDefinition,
        from_date: date,
        horizon_days: int,
    ) -> list[TaskDueInstance]:
        """Project deterministic due instances for the provided task window."""
        if horizon_days <= 0:
            return []

        self.validate_task(task)

        start_date = max(from_date, task.start_date)
        end_date = from_date + timedelta(days=horizon_days - 1)

        if start_date > end_date:
            return []

        return [
            TaskDueInstance.build(
                task_id=task.id,
                due_date=due_date,
                skipped=_is_skipped(task.skip_windows, due_date),
            )
            for due_date in _expand_due_dates(task, start_date, end_date)
        ]

    def select_actionable_due_instance(
        self,
        task: TaskDefinition,
        completed_due_instance_ids: set[str],
        as_of: date,
        lookback_days: int = 30,
        horizon_days: int = 60,
    ) -> TaskDueInstance | None:
        """Return the next actionable due instance.

        ``lookback_days`` controls the size of each backlog search chunk while
        preserving oldest-open semantics across the full task history.
        """
        normalized_lookback = max(lookback_days, 1)
        normalized_horizon = max(horizon_days, 0)

        oldest_open_instance = self._find_oldest_open_backlog_instance(
            task=task,
            completed_due_instance_ids=completed_due_instance_ids,
            as_of=as_of,
            lookback_days=normalized_lookback,
        )
        if oldest_open_instance is not None:
            return oldest_open_instance

        if normalized_horizon == 0:
            return None

        search_start = max(task.start_date, as_of + timedelta(days=1))
        search_end = max(as_of, task.start_date) + timedelta(days=normalized_horizon)
        if search_start > search_end:
            return None

        search_span = (search_end - search_start).days + 1
        projected_instances = self.project_due_instances(
            task=task,
            from_date=search_start,
            horizon_days=search_span,
        )

        for instance in projected_instances:
            if not instance.skipped and instance.id not in completed_due_instance_ids:
                return instance

        return None

    def _find_oldest_open_backlog_instance(
        self,
        *,
        task: TaskDefinition,
        completed_due_instance_ids: set[str],
        as_of: date,
        lookback_days: int,
    ) -> TaskDueInstance | None:
        if as_of < task.start_date:
            return None

        oldest_open_instance: TaskDueInstance | None = None
        search_end = as_of

        while search_end >= task.start_date:
            chunk_start = max(
                task.start_date,
                search_end - timedelta(days=lookback_days - 1),
            )
            search_span = (search_end - chunk_start).days + 1
            projected_instances = self.project_due_instances(
                task=task,
                from_date=chunk_start,
                horizon_days=search_span,
            )

            for instance in projected_instances:
                if (
                    not instance.skipped
                    and instance.id not in completed_due_instance_ids
                ):
                    oldest_open_instance = instance
                    break

            search_end = chunk_start - timedelta(days=1)

        return oldest_open_instance


def _validate_task(task: TaskDefinition) -> None:
    if not task.title.strip():
        raise InvalidTaskDefinitionError(task.id, "Title cannot be empty.")
    if not task.assigned_profile_id.strip():
        raise InvalidTaskDefinitionError(task.id, "Task must be assigned to a profile.")

    if task.recurrence.frequency == RecurrenceFrequency.NONE and task.nfc_tag_id is not None:
        raise InvalidTaskDefinitionError(task.id, "One-off tasks cannot be assigned NFC tags.")

    _validate_recurrence(task.recurrence)

    for skip_window in task.skip_windows:
        if skip_window.start_date > skip_window.end_date:
            raise InvalidRecurrenceError(
                "Skip windows must use a start date on or before the end date."
            )


def _validate_recurrence(rule: RecurrenceRule) -> None:
    if rule.frequency == RecurrenceFrequency.WEEKLY:
        if not rule.days_of_week:
            raise InvalidRecurrenceError(
                "Weekly recurrence requires at least one ISO weekday."
            )
        if any(day < 1 or day > 7 for day in rule.days_of_week):
            raise InvalidRecurrenceError(
                "Weekly recurrence days must be ISO weekdays from 1 through 7."
            )

    if rule.frequency == RecurrenceFrequency.CUSTOM_DAYS and rule.interval_days < 1:
        raise InvalidRecurrenceError(
            "Custom day recurrence requires a positive interval."
        )

    if rule.frequency == RecurrenceFrequency.DAILY and rule.interval_days < 1:
        raise InvalidRecurrenceError(
            "Daily recurrence requires a positive interval."
        )

    if rule.frequency == RecurrenceFrequency.MONTHLY:
        if rule.day_of_month is None:
            raise InvalidRecurrenceError(
                "Monthly recurrence requires a day_of_month value."
            )
        if rule.day_of_month < 1 or rule.day_of_month > 31:
            raise InvalidRecurrenceError(
                "Monthly recurrence day_of_month must be between 1 and 31."
            )


def _expand_due_dates(
    task: TaskDefinition,
    start_date: date,
    end_date: date,
) -> list[date]:
    rule = task.recurrence

    if rule.frequency == RecurrenceFrequency.NONE:
        if start_date <= task.start_date <= end_date:
            return [task.start_date]
        return []
    if rule.frequency == RecurrenceFrequency.DAILY:
        return _expand_daily(
            anchor_date=task.start_date,
            start_date=start_date,
            end_date=end_date,
            interval_days=rule.interval_days,
        )
    if rule.frequency == RecurrenceFrequency.WEEKLY:
        return _expand_weekly(start_date, end_date, rule.days_of_week)
    if rule.frequency == RecurrenceFrequency.CUSTOM_DAYS:
        return _expand_custom_days(
            anchor_date=task.start_date,
            start_date=start_date,
            end_date=end_date,
            interval_days=rule.interval_days,
        )
    if rule.frequency == RecurrenceFrequency.MONTHLY:
        return _expand_monthly(start_date, end_date, rule.day_of_month)

    raise InvalidRecurrenceError("Unsupported recurrence frequency.")


def _expand_daily(
    anchor_date: date,
    start_date: date,
    end_date: date,
    interval_days: int,
) -> list[date]:
    return _expand_interval_days(
        anchor_date=anchor_date,
        start_date=start_date,
        end_date=end_date,
        interval_days=interval_days,
    )


def _expand_weekly(
    start_date: date,
    end_date: date,
    days_of_week: list[int],
) -> list[date]:
    allowed_days = set(days_of_week)
    current = start_date
    results: list[date] = []

    while current <= end_date:
        if current.isoweekday() in allowed_days:
            results.append(current)
        current += timedelta(days=1)

    return results


def _expand_custom_days(
    anchor_date: date,
    start_date: date,
    end_date: date,
    interval_days: int,
) -> list[date]:
    return _expand_interval_days(
        anchor_date=anchor_date,
        start_date=start_date,
        end_date=end_date,
        interval_days=interval_days,
    )


def _expand_interval_days(
    anchor_date: date,
    start_date: date,
    end_date: date,
    interval_days: int,
) -> list[date]:
    if anchor_date > end_date:
        return []

    current = anchor_date
    if current < start_date:
        days_since_anchor = (start_date - anchor_date).days
        offset_days = days_since_anchor % interval_days
        if offset_days == 0:
            current = start_date
        else:
            current = start_date + timedelta(days=interval_days - offset_days)

    results: list[date] = []
    while current <= end_date:
        results.append(current)
        current += timedelta(days=interval_days)

    return results


def _expand_monthly(
    start_date: date,
    end_date: date,
    day_of_month: int | None,
) -> list[date]:
    if day_of_month is None:
        return []

    results: list[date] = []
    year = start_date.year
    month = start_date.month

    while True:
        last_day = calendar.monthrange(year, month)[1]
        candidate = date(year, month, min(day_of_month, last_day))

        if candidate > end_date:
            break
        if candidate >= start_date:
            results.append(candidate)

        if month == 12:
            year += 1
            month = 1
        else:
            month += 1

    return results


def _is_skipped(skip_windows: list[SkipWindow], due_date: date) -> bool:
    return any(skip_window.contains(due_date) for skip_window in skip_windows)
