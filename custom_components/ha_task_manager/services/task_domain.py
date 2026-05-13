"""Task recurrence projection and due-instance selection."""

from __future__ import annotations

import calendar
from datetime import date, timedelta

from custom_components.ha_task_manager.exceptions import InvalidRecurrenceError
from custom_components.ha_task_manager.models import (
    RecurrenceFrequency,
    RecurrenceRule,
    SkipWindow,
    TaskDefinition,
    TaskDueInstance,
)


def project_due_instances(
    task: TaskDefinition,
    from_date: date,
    horizon_days: int,
) -> list[TaskDueInstance]:
    """Project deterministic due instances for the provided task window."""
    if horizon_days <= 0:
        return []

    _validate_task(task)

    start_date = max(from_date, task.created_at.date())
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
    task: TaskDefinition,
    completed_due_instance_ids: set[str],
    as_of: date,
    lookback_days: int = 30,
    horizon_days: int = 60,
) -> TaskDueInstance | None:
    """Return the next due instance that should be acted on, if any."""
    normalized_lookback = max(lookback_days, 0)
    normalized_horizon = max(horizon_days, 0)
    search_start = as_of - timedelta(days=normalized_lookback)
    search_span = normalized_lookback + normalized_horizon + 1

    projected_instances = project_due_instances(
        task=task,
        from_date=search_start,
        horizon_days=search_span,
    )
    open_instances = [
        instance
        for instance in projected_instances
        if not instance.skipped and instance.id not in completed_due_instance_ids
    ]

    for instance in open_instances:
        if instance.due_date <= as_of:
            return instance

    for instance in open_instances:
        if instance.due_date > as_of:
            return instance

    return None


def _validate_task(task: TaskDefinition) -> None:
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

    if rule.frequency == RecurrenceFrequency.DAILY:
        return _expand_daily(start_date, end_date)
    if rule.frequency == RecurrenceFrequency.WEEKLY:
        return _expand_weekly(start_date, end_date, rule.days_of_week)
    if rule.frequency == RecurrenceFrequency.CUSTOM_DAYS:
        return _expand_custom_days(
            anchor_date=task.created_at.date(),
            start_date=start_date,
            end_date=end_date,
            interval_days=rule.interval_days,
        )
    if rule.frequency == RecurrenceFrequency.MONTHLY:
        return _expand_monthly(start_date, end_date, rule.day_of_month)

    raise InvalidRecurrenceError("Unsupported recurrence frequency.")


def _expand_daily(start_date: date, end_date: date) -> list[date]:
    current = start_date
    results: list[date] = []

    while current <= end_date:
        results.append(current)
        current += timedelta(days=1)

    return results


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
