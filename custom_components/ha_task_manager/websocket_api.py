"""WebSocket API surface for the HA Task Manager panel."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, EVENT_COMPLETION_RECORDED, EVENT_USER_MAPPING_WARNING
from .exceptions import TaskManagerError, UnmappedUserError
from .models import (
    AttemptOutcome,
    CompletionAttempt,
    CompletionRecord,
    CompletionSource,
    HouseholdProfile,
    NfcTagMapping,
    ProfileAnalyticsSnapshot,
    RecurrenceFrequency,
    RecurrenceRule,
    SkipWindow,
    TaskDefinition,
    TaskDueInstance,
    UserProfileMapping,
)
from .models.time import utc_now
from .services.nfc_events import NfcEventService
from .storage.store import TaskStore


def _parse_date(value: str) -> date:
    return date.fromisoformat(value)


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def task_definition_from_dict(raw_task: dict[str, Any]) -> TaskDefinition:
    """Deserialize a raw task payload into the domain model."""
    recurrence = raw_task.get("recurrence", {})
    skip_windows = raw_task.get("skip_windows", [])
    created_at = raw_task.get("created_at")
    updated_at = raw_task.get("updated_at")

    return TaskDefinition(
        id=raw_task.get("id", ""),
        title=raw_task.get("title", ""),
        description=raw_task.get("description", ""),
        recurrence=RecurrenceRule(
            frequency=RecurrenceFrequency(recurrence.get("frequency", "weekly")),
            days_of_week=list(recurrence.get("days_of_week", [])),
            interval_days=recurrence.get("interval_days", 1),
            day_of_month=recurrence.get("day_of_month"),
        ),
        skip_windows=[
            SkipWindow(
                id=raw_skip.get("id", ""),
                label=raw_skip.get("label", ""),
                start_date=_parse_date(raw_skip["start_date"]),
                end_date=_parse_date(raw_skip["end_date"]),
            )
            for raw_skip in skip_windows
        ],
        assigned_profile_id=raw_task.get("assigned_profile_id", ""),
        nfc_tag_id=raw_task.get("nfc_tag_id"),
        active=raw_task.get("active", True),
        start_date=_parse_date(
            raw_task.get("start_date", utc_now().date().isoformat())
        ),
        created_at=_parse_datetime(created_at) if created_at else utc_now(),
        updated_at=_parse_datetime(updated_at) if updated_at else utc_now(),
    )


def task_definition_to_dict(task: TaskDefinition) -> dict[str, Any]:
    """Serialize a task domain model for websocket transport and raw storage."""
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "recurrence": {
            "frequency": task.recurrence.frequency.value,
            "days_of_week": list(task.recurrence.days_of_week),
            "interval_days": task.recurrence.interval_days,
            "day_of_month": task.recurrence.day_of_month,
        },
        "skip_windows": [
            {
                "id": skip_window.id,
                "label": skip_window.label,
                "start_date": skip_window.start_date.isoformat(),
                "end_date": skip_window.end_date.isoformat(),
            }
            for skip_window in task.skip_windows
        ],
        "assigned_profile_id": task.assigned_profile_id,
        "nfc_tag_id": task.nfc_tag_id,
        "active": task.active,
        "start_date": task.start_date.isoformat(),
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
    }


def completion_record_from_dict(raw_record: dict[str, Any]) -> CompletionRecord:
    """Deserialize a raw completion record payload."""
    return CompletionRecord(
        id=raw_record.get("id", ""),
        task_id=raw_record.get("task_id", ""),
        due_instance_id=raw_record.get("due_instance_id", ""),
        completed_at=_parse_datetime(raw_record["completed_at"]),
        actor_ha_user_id=raw_record.get("actor_ha_user_id", ""),
        actor_profile_id=raw_record.get("actor_profile_id", ""),
        source=CompletionSource(raw_record.get("source", CompletionSource.MANUAL)),
        outcome=AttemptOutcome(raw_record.get("outcome", AttemptOutcome.CONFIRMED)),
        blocked_reason=raw_record.get("blocked_reason", ""),
    )


def completion_record_to_dict(record: CompletionRecord) -> dict[str, Any]:
    """Serialize a completion record for websocket transport and storage."""
    return {
        "id": record.id,
        "task_id": record.task_id,
        "due_instance_id": record.due_instance_id,
        "completed_at": record.completed_at.isoformat(),
        "actor_ha_user_id": record.actor_ha_user_id,
        "actor_profile_id": record.actor_profile_id,
        "source": record.source.value,
        "outcome": record.outcome.value,
        "blocked_reason": record.blocked_reason,
    }


def household_profile_from_dict(raw_profile: dict[str, Any]) -> HouseholdProfile:
    """Deserialize a raw household profile payload."""
    return HouseholdProfile(
        id=raw_profile.get("id", ""),
        display_name=raw_profile.get("display_name", ""),
        avatar_url=raw_profile.get("avatar_url", ""),
        created_at=_parse_datetime(raw_profile["created_at"]),
    )


def household_profile_to_dict(profile: HouseholdProfile) -> dict[str, Any]:
    """Serialize a household profile."""
    return {
        "id": profile.id,
        "display_name": profile.display_name,
        "avatar_url": profile.avatar_url,
        "created_at": profile.created_at.isoformat(),
    }


def user_profile_mapping_from_dict(raw_mapping: dict[str, Any]) -> UserProfileMapping:
    """Deserialize a raw HA-user-to-profile mapping payload."""
    return UserProfileMapping(
        id=raw_mapping.get("id", ""),
        ha_user_id=raw_mapping.get("ha_user_id", ""),
        profile_id=raw_mapping.get("profile_id", ""),
        created_at=_parse_datetime(raw_mapping["created_at"]),
    )


def user_profile_mapping_to_dict(mapping: UserProfileMapping) -> dict[str, Any]:
    """Serialize a HA-user-to-profile mapping."""
    return {
        "id": mapping.id,
        "ha_user_id": mapping.ha_user_id,
        "profile_id": mapping.profile_id,
        "created_at": mapping.created_at.isoformat(),
    }


def nfc_tag_mapping_from_dict(raw_mapping: dict[str, Any]) -> NfcTagMapping:
    """Deserialize a raw NFC tag mapping payload."""
    return NfcTagMapping(
        id=raw_mapping.get("id", ""),
        tag_id=raw_mapping.get("tag_id", ""),
        task_id=raw_mapping.get("task_id", ""),
        label=raw_mapping.get("label", ""),
        created_at=_parse_datetime(raw_mapping["created_at"]),
    )


def nfc_tag_mapping_to_dict(mapping: NfcTagMapping) -> dict[str, Any]:
    """Serialize an NFC tag mapping."""
    return {
        "id": mapping.id,
        "tag_id": mapping.tag_id,
        "task_id": mapping.task_id,
        "label": mapping.label,
        "created_at": mapping.created_at.isoformat(),
    }


def due_instance_to_dict(instance: TaskDueInstance) -> dict[str, Any]:
    """Serialize a due instance for websocket transport."""
    return {
        "id": instance.id,
        "task_id": instance.task_id,
        "due_date": instance.due_date.isoformat(),
        "skipped": instance.skipped,
    }


def completion_attempt_to_dict(attempt: CompletionAttempt) -> dict[str, Any]:
    """Serialize a pending confirmation attempt."""
    return {
        "id": attempt.id,
        "task_id": attempt.task_id,
        "due_instance_id": attempt.due_instance_id,
        "actor_ha_user_id": attempt.actor_ha_user_id,
        "source": attempt.source.value,
        "initiated_at": attempt.initiated_at.isoformat(),
    }


def analytics_snapshot_to_dict(
    snapshot: ProfileAnalyticsSnapshot,
) -> dict[str, Any]:
    """Serialize an analytics snapshot for websocket transport."""
    return {
        "profile_id": snapshot.profile_id,
        "computed_at": snapshot.computed_at.isoformat(),
        "daily_completions": [
            {"date": bucket_date.isoformat(), "count": count}
            for bucket_date, count in snapshot.daily_completions
        ],
        "on_time_count": snapshot.on_time_count,
        "late_count": snapshot.late_count,
        "missed_count": snapshot.missed_count,
        "current_streak": snapshot.current_streak,
        "longest_streak": snapshot.longest_streak,
    }


def _resolve_due_instance(
    task_domain,
    *,
    task: TaskDefinition,
    due_instance_id: str,
) -> TaskDueInstance:
    if not task.active:
        raise ValueError(f"Task {task.id!r} is inactive.")

    raw_task_id, raw_due_date = due_instance_id.rsplit(":", 1)
    due_date = _parse_date(raw_due_date)
    if raw_task_id != task.id:
        raise ValueError(
            f"Invalid due instance id {due_instance_id!r} for task {task.id!r}"
        )

    projected_instances = task_domain.project_due_instances(
        task=task,
        from_date=due_date,
        horizon_days=1,
    )
    matching_due_instance = next(
        (
            instance
            for instance in projected_instances
            if instance.id == due_instance_id
        ),
        None,
    )
    if matching_due_instance is None:
        raise ValueError(
            f"Due instance {due_instance_id!r} is no longer valid for task {task.id!r}"
        )

    return matching_due_instance


def _filter_pending_confirmations(
    runtime_data: dict[str, Any],
    tasks: list[TaskDefinition],
) -> list[CompletionAttempt]:
    task_domain = runtime_data["task_domain"]
    tasks_by_id = {task.id: task for task in tasks}
    pending_attempts = runtime_data["nfc"].get_pending_confirmations()
    valid_attempts: list[CompletionAttempt] = []

    for attempt in pending_attempts:
        task = tasks_by_id.get(attempt.task_id)
        if task is None:
            continue
        try:
            _resolve_due_instance(
                task_domain,
                task=task,
                due_instance_id=attempt.due_instance_id,
            )
        except ValueError:
            continue
        valid_attempts.append(attempt)

    return valid_attempts


async def _load_tasks(store: TaskStore) -> list[TaskDefinition]:
    raw_tasks = await store.async_load_tasks()
    return [
        task_definition_from_dict(raw_task)
        for raw_task in raw_tasks.get("tasks", [])
    ]


async def _load_profiles(
    store: TaskStore,
) -> tuple[list[HouseholdProfile], list[UserProfileMapping]]:
    raw_profiles = await store.async_load_profiles()
    profiles = [
        household_profile_from_dict(raw_profile)
        for raw_profile in raw_profiles.get("profiles", [])
    ]
    mappings = [
        user_profile_mapping_from_dict(raw_mapping)
        for raw_mapping in raw_profiles.get("mappings", [])
    ]
    return profiles, mappings


def _validate_unique_nfc_tag(
    task: TaskDefinition,
    tasks: list[TaskDefinition],
    tag_mappings: list[NfcTagMapping],
) -> None:
    if not task.nfc_tag_id:
        return

    conflicting_task = next(
        (
            existing
            for existing in tasks
            if existing.id != task.id and existing.nfc_tag_id == task.nfc_tag_id
        ),
        None,
    )
    if conflicting_task is not None:
        raise ValueError(
            "NFC tag "
            f"{task.nfc_tag_id!r} is already assigned to task "
            f"{conflicting_task.id!r}."
        )

    conflicting_mapping = next(
        (
            mapping
            for mapping in tag_mappings
            if mapping.task_id != task.id and mapping.tag_id == task.nfc_tag_id
        ),
        None,
    )
    if conflicting_mapping is not None:
        raise ValueError(
            "NFC tag "
            f"{task.nfc_tag_id!r} is already mapped to task "
            f"{conflicting_mapping.task_id!r}."
        )


async def _load_tag_mappings(store: TaskStore) -> list[NfcTagMapping]:
    raw_nfc = await store.async_load_nfc()
    return [
        nfc_tag_mapping_from_dict(raw_mapping)
        for raw_mapping in raw_nfc.get("tag_mappings", [])
    ]


async def _load_history(store: TaskStore) -> list[CompletionRecord]:
    raw_history = await store.async_load_completions()
    return [completion_record_from_dict(raw_record) for raw_record in raw_history]


def _rebuild_nfc_service(
    runtime_data: dict[str, Any],
    *,
    tasks: list[TaskDefinition],
    tag_mappings: list[NfcTagMapping],
) -> None:
    runtime_data["nfc"] = NfcEventService(
        tag_mappings=tag_mappings,
        tasks=tasks,
        pending_attempts=_filter_pending_confirmations(runtime_data, tasks),
        task_domain_service=runtime_data["task_domain"],
    )


async def _sync_task_nfc_mappings(
    store: TaskStore,
    task: TaskDefinition,
) -> list[NfcTagMapping]:
    existing_mappings = await _load_tag_mappings(store)
    updated_mappings = [
        mapping for mapping in existing_mappings if mapping.task_id != task.id
    ]

    if task.nfc_tag_id:
        updated_mappings = [
            mapping
            for mapping in updated_mappings
            if mapping.tag_id != task.nfc_tag_id
        ]
        existing_mapping = next(
            (
                mapping
                for mapping in existing_mappings
                if mapping.task_id == task.id and mapping.tag_id == task.nfc_tag_id
            ),
            None,
        )
        updated_mappings.append(
            existing_mapping
            if existing_mapping is not None
            else NfcTagMapping(
                tag_id=task.nfc_tag_id,
                task_id=task.id,
                label=task.title,
                created_at=task.updated_at,
            )
        )

    await store.async_save_nfc(
        {
            "tag_mappings": [
                nfc_tag_mapping_to_dict(mapping) for mapping in updated_mappings
            ]
        }
    )
    return updated_mappings


def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register the WebSocket commands consumed by the panel UI."""

    def _get_runtime_data(
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> dict[str, Any] | None:
        domain_data = hass.data.get(DOMAIN)
        if not domain_data:
            connection.send_error(
                msg["id"],
                "integration_unavailable",
                "HA Task Manager is not currently loaded.",
            )
            return None

        active_entry_id = domain_data.get("_active_entry_id")
        runtime_data = domain_data.get(active_entry_id) if active_entry_id else None
        if runtime_data is None:
            connection.send_error(
                msg["id"],
                "integration_unavailable",
                "HA Task Manager is not currently loaded.",
            )
            return None

        return runtime_data

    @websocket_api.websocket_command(
        {vol.Required("type"): f"{DOMAIN}/pending_confirmations"}
    )
    @websocket_api.async_response
    async def ws_pending_confirmations(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        pending = runtime_data["nfc"].get_pending_confirmations()
        connection.send_result(
            msg["id"],
            [completion_attempt_to_dict(attempt) for attempt in pending],
        )

    @websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/profiles"})
    @websocket_api.async_response
    async def ws_profiles(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        profiles, _mappings = await _load_profiles(runtime_data["store"])
        connection.send_result(
            msg["id"],
            [household_profile_to_dict(profile) for profile in profiles],
        )

    @websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/tasks"})
    @websocket_api.async_response
    async def ws_tasks(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        tasks = await _load_tasks(runtime_data["store"])
        connection.send_result(
            msg["id"],
            [task_definition_to_dict(task) for task in tasks],
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/due_instances",
            vol.Optional("from_date"): cv.string,
            vol.Optional("horizon_days", default=30): vol.Coerce(int),
        }
    )
    @websocket_api.async_response
    async def ws_due_instances(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        task_domain = runtime_data["task_domain"]
        tasks = await _load_tasks(runtime_data["store"])

        try:
            from_date = _parse_date(
                msg.get("from_date", utc_now().date().isoformat())
            )
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_from_date", str(err))
            return

        horizon_days = msg["horizon_days"]

        results: list[dict[str, Any]] = []
        for task in tasks:
            if not task.active:
                continue
            due_instances = task_domain.project_due_instances(
                task=task,
                from_date=from_date,
                horizon_days=horizon_days,
            )
            results.extend(
                due_instance_to_dict(instance) for instance in due_instances
            )

        connection.send_result(msg["id"], results)

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/save_task",
            vol.Required("task"): dict,
        }
    )
    @websocket_api.async_response
    async def ws_save_task(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        store: TaskStore = runtime_data["store"]
        task_domain = runtime_data["task_domain"]

        try:
            task = task_definition_from_dict(msg["task"])
            task_domain.validate_task(task)
        except (TaskManagerError, TypeError, ValueError) as err:
            connection.send_error(msg["id"], "invalid_task", str(err))
            return

        async with runtime_data["task_save_lock"]:
            tasks = await _load_tasks(store)
            tag_mappings = await _load_tag_mappings(store)
            try:
                _validate_unique_nfc_tag(task, tasks, tag_mappings)
            except ValueError as err:
                connection.send_error(msg["id"], "invalid_task", str(err))
                return

            stored_tasks = [existing for existing in tasks if existing.id != task.id]
            stored_tasks.append(task)

            await store.async_save_tasks(
                {
                    "tasks": [
                        task_definition_to_dict(existing)
                        for existing in stored_tasks
                    ]
                }
            )

            tag_mappings = await _sync_task_nfc_mappings(store, task)
            _rebuild_nfc_service(
                runtime_data,
                tasks=stored_tasks,
                tag_mappings=tag_mappings,
            )

        connection.send_result(msg["id"], task_definition_to_dict(task))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/confirm_completion",
            vol.Required("attempt_id"): cv.string,
            vol.Optional("completed_at"): cv.string,
        }
    )
    @websocket_api.async_response
    async def ws_confirm_completion(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        store: TaskStore = runtime_data["store"]
        nfc_service = runtime_data["nfc"]
        completion_service = runtime_data["completion"]
        task_domain = runtime_data["task_domain"]

        attempt = nfc_service.get_pending_confirmation(msg["attempt_id"])
        if attempt is None:
            connection.send_error(
                msg["id"],
                "attempt_not_found",
                f"Pending confirmation {msg['attempt_id']!r} was not found.",
            )
            return

        tasks = await _load_tasks(store)
        task = next(
            (candidate for candidate in tasks if candidate.id == attempt.task_id),
            None,
        )
        if task is None:
            nfc_service.dismiss_confirmation(attempt.id)
            connection.send_error(
                msg["id"],
                "task_not_found",
                f"Task {attempt.task_id!r} was not found.",
            )
            return

        try:
            due_instance = _resolve_due_instance(
                task_domain,
                task=task,
                due_instance_id=attempt.due_instance_id,
            )
        except ValueError as err:
            nfc_service.dismiss_confirmation(attempt.id)
            connection.send_error(msg["id"], "invalid_due_instance", str(err))
            return

        history_before = len(completion_service.get_history())

        try:
            completed_at = (
                _parse_datetime(msg["completed_at"])
                if "completed_at" in msg
                else None
            )
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_completed_at", str(err))
            return

        try:
            completion_record = completion_service.confirm_completion(
                task=task,
                due_instance=due_instance,
                actor_ha_user_id=attempt.actor_ha_user_id,
                source=attempt.source,
                completed_at=completed_at,
            )
        except TaskManagerError as err:
            updated_history = completion_service.get_history()
            if len(updated_history) > history_before:
                recorded_payload = completion_record_to_dict(updated_history[-1])
                await store.async_append_completion(recorded_payload)
                hass.bus.async_fire(EVENT_COMPLETION_RECORDED, recorded_payload)
            if isinstance(err, UnmappedUserError):
                hass.bus.async_fire(
                    EVENT_USER_MAPPING_WARNING,
                    {
                        "actor_ha_user_id": attempt.actor_ha_user_id,
                        "task_id": attempt.task_id,
                        "attempt_id": attempt.id,
                    },
                )
            nfc_service.dismiss_confirmation(attempt.id)
            connection.send_error(
                msg["id"],
                (
                    "mapping_required"
                    if isinstance(err, UnmappedUserError)
                    else "confirm_completion_failed"
                ),
                str(err),
            )
            return

        recorded_payload = completion_record_to_dict(completion_record)
        await store.async_append_completion(recorded_payload)
        hass.bus.async_fire(EVENT_COMPLETION_RECORDED, recorded_payload)
        nfc_service.dismiss_confirmation(attempt.id)
        connection.send_result(msg["id"], completion_record_to_dict(completion_record))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/analytics",
            vol.Required("profile_id"): cv.string,
            vol.Optional("as_of"): cv.string,
            vol.Optional("horizon_days", default=30): vol.Coerce(int),
        }
    )
    @websocket_api.async_response
    async def ws_analytics(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        store: TaskStore = runtime_data["store"]
        analytics_service = runtime_data["analytics"]
        task_domain = runtime_data["task_domain"]

        try:
            as_of = _parse_date(msg.get("as_of", utc_now().date().isoformat()))
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_as_of", str(err))
            return

        horizon_days = msg["horizon_days"]
        from_date = as_of - timedelta(days=max(horizon_days - 1, 0))

        tasks = await _load_tasks(store)
        history = await _load_history(store)
        projected_due_instances: list[TaskDueInstance] = []
        for task in tasks:
            if not task.active:
                continue
            projected_due_instances.extend(
                task_domain.project_due_instances(
                    task=task,
                    from_date=from_date,
                    horizon_days=horizon_days,
                )
            )

        task_assignments = {
            task.id: task.assigned_profile_id for task in tasks if task.active
        }
        snapshot = analytics_service.compute_snapshot(
            profile_id=msg["profile_id"],
            history=history,
            projected_due_instances=projected_due_instances,
            task_assignments=task_assignments,
            as_of=as_of,
        )
        connection.send_result(msg["id"], analytics_snapshot_to_dict(snapshot))

    websocket_api.async_register_command(hass, ws_pending_confirmations)
    websocket_api.async_register_command(hass, ws_profiles)
    websocket_api.async_register_command(hass, ws_tasks)
    websocket_api.async_register_command(hass, ws_due_instances)
    websocket_api.async_register_command(hass, ws_save_task)
    websocket_api.async_register_command(hass, ws_confirm_completion)
    websocket_api.async_register_command(hass, ws_analytics)
