"""Analytics snapshot computation from immutable history and due projections."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping, Set
from datetime import date, datetime, timedelta

from custom_components.ha_task_manager.models import (
    AttemptOutcome,
    CompletionRecord,
    ProfileAnalyticsSnapshot,
    TaskDueInstance,
)


class AnalyticsService:
    """Compute derived analytics for a household profile."""

    def compute_snapshot(
        self,
        *,
        profile_id: str,
        history: Iterable[CompletionRecord],
        projected_due_instances: Iterable[TaskDueInstance],
        task_assignments: Mapping[str, str],
        as_of: date,
        effective_baseline_at: datetime | None = None,
        include_deleted_task_history: bool = True,
        existing_task_ids: Set[str] | None = None,
    ) -> ProfileAnalyticsSnapshot:
        """Compute a profile analytics snapshot from domain history and due data."""
        known_task_ids = set(existing_task_ids or set())
        history_list = []
        for record in history:
            if (
                effective_baseline_at is not None
                and record.completed_at < effective_baseline_at
            ):
                continue
            if (
                not include_deleted_task_history
                and record.task_id not in known_task_ids
            ):
                continue
            history_list.append(record)

        due_instances = [
            instance
            for instance in projected_due_instances
            if task_assignments.get(instance.task_id) == profile_id
        ]
        confirmed_profile_records = [
            record
            for record in history_list
            if record.outcome == AttemptOutcome.CONFIRMED
            and record.actor_profile_id == profile_id
        ]

        daily_counts = Counter(
            record.completed_at.date() for record in confirmed_profile_records
        )
        daily_completions = sorted(daily_counts.items())

        on_time_count = 0
        late_count = 0
        for record in confirmed_profile_records:
            due_date = self._due_date_from_due_instance_id(record.due_instance_id)
            if due_date is None:
                continue

            if record.completed_at.date() <= due_date:
                on_time_count += 1
            else:
                late_count += 1

        completed_due_instance_ids = {
            record.due_instance_id
            for record in history_list
            if record.outcome == AttemptOutcome.CONFIRMED
        }
        missed_count = sum(
            1
            for instance in due_instances
            if not instance.skipped
            and instance.due_date < as_of
            and instance.id not in completed_due_instance_ids
        )

        completion_days = sorted(daily_counts)

        return ProfileAnalyticsSnapshot(
            profile_id=profile_id,
            daily_completions=daily_completions,
            on_time_count=on_time_count,
            late_count=late_count,
            missed_count=missed_count,
            current_streak=self._compute_current_streak(completion_days, as_of),
            longest_streak=self._compute_longest_streak(completion_days),
        )

    def _due_date_from_due_instance_id(self, due_instance_id: str) -> date | None:
        try:
            _task_id, raw_due_date = due_instance_id.rsplit(":", 1)
            return date.fromisoformat(raw_due_date)
        except ValueError:
            return None

    def _compute_current_streak(
        self,
        completion_days: list[date],
        as_of: date,
    ) -> int:
        if not completion_days:
            return 0

        completion_day_set = set(completion_days)
        cursor = as_of
        if cursor not in completion_day_set:
            cursor = as_of - timedelta(days=1)
            if cursor not in completion_day_set:
                return 0

        streak = 0
        while cursor in completion_day_set:
            streak += 1
            cursor -= timedelta(days=1)

        return streak

    def _compute_longest_streak(self, completion_days: list[date]) -> int:
        if not completion_days:
            return 0

        longest_streak = 1
        current_streak = 1
        for previous_day, current_day in zip(completion_days, completion_days[1:]):
            if current_day - previous_day == timedelta(days=1):
                current_streak += 1
                longest_streak = max(longest_streak, current_streak)
            else:
                current_streak = 1

        return longest_streak
