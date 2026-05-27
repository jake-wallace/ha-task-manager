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
    HaUserSummary,
    HouseholdProfile,
    NfcDiscoveryEntry,
    NfcTagMapping,
    OperationStatus,
    ProfileAnalyticsSnapshot,
    RecurrenceFrequency,
    RecurrenceRule,
    SkipWindow,
    TaskDeletionRecord,
    TaskDefinition,
    TaskDueInstance,
    UserProfileMapping,
)
from .models.time import utc_now
from .services.nfc_events import NfcEventService
from .storage.store import TaskStore


DELETE_CONFIRM_TEXT = "delete"
TASK_DELETE_UNDO_WINDOW = timedelta(minutes=5)


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


def ha_user_summary_to_dict(ha_user: HaUserSummary) -> dict[str, Any]:
    """Serialize a Home Assistant user summary."""
    return {
        "id": ha_user.id,
        "name": ha_user.name,
        "is_active": ha_user.is_active,
        "is_admin": ha_user.is_admin,
        "system_generated": ha_user.system_generated,
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


def nfc_discovery_entry_from_dict(raw_entry: dict[str, Any]) -> NfcDiscoveryEntry:
    """Deserialize a raw NFC discovery entry payload."""
    return NfcDiscoveryEntry(
        tag_id=raw_entry.get("tag_id", ""),
        first_seen=_parse_datetime(raw_entry["first_seen"]),
        last_seen=_parse_datetime(raw_entry["last_seen"]),
        last_source=raw_entry.get("last_source", "nfc_phone"),
    )


def nfc_discovery_entry_to_dict(entry: NfcDiscoveryEntry) -> dict[str, Any]:
    """Serialize an NFC discovery entry."""
    return {
        "tag_id": entry.tag_id,
        "first_seen": entry.first_seen.isoformat(),
        "last_seen": entry.last_seen.isoformat(),
        "last_source": entry.last_source,
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


def task_deletion_record_to_dict(record: TaskDeletionRecord) -> dict[str, Any]:
    """Serialize a task deletion control record."""
    return {
        "id": record.id,
        "task_snapshot": record.task_snapshot,
        "actor_ha_user_id": record.actor_ha_user_id,
        "deleted_at": record.deleted_at.isoformat(),
        "undo_expires_at": record.undo_expires_at.isoformat(),
        "status": record.status.value,
    }


def task_deletion_record_from_dict(raw_record: dict[str, Any]) -> TaskDeletionRecord:
    """Deserialize a task deletion control record payload."""
    raw_status = raw_record.get("status", OperationStatus.ACTIVE.value)
    try:
        status = OperationStatus(raw_status)
    except ValueError:
        status = OperationStatus.ACTIVE

    return TaskDeletionRecord(
        id=raw_record["id"],
        task_snapshot=raw_record["task_snapshot"],
        actor_ha_user_id=raw_record.get("actor_ha_user_id", ""),
        deleted_at=_parse_datetime(raw_record["deleted_at"]),
        undo_expires_at=_parse_datetime(raw_record["undo_expires_at"]),
        status=status,
    )


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


def _pending_confirmations_for_user(
    runtime_data: dict[str, Any],
    ha_user_id: str,
) -> list[CompletionAttempt]:
    return [
        attempt
        for attempt in runtime_data["nfc"].get_pending_confirmations()
        if attempt.actor_ha_user_id == ha_user_id
    ]


def _is_mapped_user(runtime_data: dict[str, Any], ha_user_id: str) -> bool:
    identity_service = runtime_data["identity"]
    return identity_service.is_mapped(ha_user_id)


def _dismiss_pending_confirmations_for_task(
    runtime_data: dict[str, Any],
    task_id: str,
) -> None:
    pending_attempts = runtime_data["nfc"].get_pending_confirmations()
    for attempt in pending_attempts:
        if attempt.task_id == task_id:
            runtime_data["nfc"].dismiss_confirmation(attempt.id)


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
) -> None:
    if not task.active or not task.nfc_tag_id:
        return

    conflicting_task = next(
        (
            existing
            for existing in tasks
            if existing.id != task.id
            and existing.active
            and existing.nfc_tag_id == task.nfc_tag_id
        ),
        None,
    )
    if conflicting_task is not None:
        raise ValueError(
            "NFC tag "
            f"{task.nfc_tag_id!r} is already assigned to task "
            f"{conflicting_task.id!r}."
        )


async def _async_list_ha_users(hass: HomeAssistant) -> list[HaUserSummary]:
    users = await hass.auth.async_get_users()
    return [
        HaUserSummary(
            id=user.id,
            name=user.name,
            is_active=user.is_active,
            is_admin=user.is_admin,
            system_generated=user.system_generated,
        )
        for user in sorted(users, key=lambda current: (current.name.casefold(), current.id))
    ]


async def _persist_profiles_snapshot(
    store: TaskStore,
    identity_service,
) -> None:
    await store.async_save_profiles(
        {
            "profiles": [
                household_profile_to_dict(profile)
                for profile in identity_service.list_profiles()
            ],
            "mappings": [
                user_profile_mapping_to_dict(mapping)
                for mapping in identity_service.list_mappings()
            ],
        }
    )


def _derive_task_tag_mappings(
    tasks: list[TaskDefinition],
) -> list[NfcTagMapping]:
    return [
        NfcTagMapping(
            tag_id=task.nfc_tag_id,
            task_id=task.id,
            label=task.title,
            created_at=task.updated_at,
        )
        for task in tasks
        if task.active and task.nfc_tag_id
    ]


async def _load_history(store: TaskStore) -> list[CompletionRecord]:
    raw_history = await store.async_load_completions()
    return [completion_record_from_dict(raw_record) for raw_record in raw_history]


async def _persist_latest_history_record_if_needed(
    hass: HomeAssistant,
    store: TaskStore,
    completion_service,
    *,
    history_before: int,
) -> bool:
    updated_history = completion_service.get_history()
    if len(updated_history) <= history_before:
        return False

    recorded_payload = completion_record_to_dict(updated_history[-1])
    await store.async_append_completion(recorded_payload)
    hass.bus.async_fire(EVENT_COMPLETION_RECORDED, recorded_payload)
    return True


def _rebuild_nfc_service(
    runtime_data: dict[str, Any],
    *,
    tasks: list[TaskDefinition],
    tag_mappings: list[NfcTagMapping],
    discovery_entries: list[NfcDiscoveryEntry] | None = None,
) -> None:
    runtime_data["nfc"] = NfcEventService(
        tag_mappings=tag_mappings,
        discovery_entries=(
            discovery_entries
            if discovery_entries is not None
            else runtime_data["nfc"].get_discoveries()
        ),
        tasks=tasks,
        pending_attempts=_filter_pending_confirmations(runtime_data, tasks),
        task_domain_service=runtime_data["task_domain"],
    )


async def _sync_task_nfc_mappings(
    store: TaskStore,
    tasks: list[TaskDefinition],
) -> list[NfcTagMapping]:
    updated_mappings = _derive_task_tag_mappings(tasks)

    await store.async_save_nfc(
        {
            "tag_mappings": [
                nfc_tag_mapping_to_dict(mapping) for mapping in updated_mappings
            ]
        }
    )
    return updated_mappings


async def _rollback_task_mutation_snapshot(
    store: TaskStore,
    *,
    tasks_payload: dict[str, Any],
    nfc_payload: dict[str, Any],
    controls_payload: dict[str, Any],
) -> None:
    """Best-effort rollback for multi-store task mutations."""
    try:
        await store.async_save_tasks(tasks_payload)
    except Exception:
        pass

    try:
        await store.async_save_nfc(nfc_payload)
    except Exception:
        pass

    try:
        await store.async_save_controls(controls_payload)
    except Exception:
        pass


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

        pending = _pending_confirmations_for_user(runtime_data, connection.user.id)
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

    @websocket_api.websocket_command(
        {vol.Required("type"): f"{DOMAIN}/profile_mappings"}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_profile_mappings(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        mappings = sorted(
            runtime_data["identity"].list_mappings(),
            key=lambda mapping: mapping.ha_user_id,
        )
        connection.send_result(
            msg["id"],
            [user_profile_mapping_to_dict(mapping) for mapping in mappings],
        )

    @websocket_api.websocket_command(
        {vol.Required("type"): f"{DOMAIN}/ha_users"}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_ha_users(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        connection.send_result(
            msg["id"],
            [
                ha_user_summary_to_dict(ha_user)
                for ha_user in await _async_list_ha_users(hass)
            ],
        )

    @websocket_api.websocket_command(
        {vol.Required("type"): f"{DOMAIN}/current_profile"}
    )
    @websocket_api.async_response
    async def ws_current_profile(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        identity_service = runtime_data["identity"]
        ha_user_id = connection.user.id

        try:
            profile = identity_service.resolve_profile(ha_user_id)
        except UnmappedUserError:
            connection.send_result(
                msg["id"],
                {
                    "ha_user_id": ha_user_id,
                    "mapped": False,
                    "profile_id": None,
                    "display_name": None,
                    "avatar_url": None,
                },
            )
            return

        connection.send_result(
            msg["id"],
            {
                "ha_user_id": ha_user_id,
                "mapped": True,
                "profile_id": profile.id,
                "display_name": profile.display_name,
                "avatar_url": profile.avatar_url,
            },
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/import_ha_user",
            vol.Required("ha_user_id"): cv.string,
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_import_ha_user(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        identity_service = runtime_data["identity"]
        ha_user = next(
            (
                candidate
                for candidate in await _async_list_ha_users(hass)
                if candidate.id == msg["ha_user_id"]
            ),
            None,
        )
        if ha_user is None:
            connection.send_error(
                msg["id"],
                "ha_user_not_found",
                f"Home Assistant user {msg['ha_user_id']!r} was not found.",
            )
            return

        if not ha_user.is_active or ha_user.system_generated:
            connection.send_error(
                msg["id"],
                "invalid_ha_user",
                "Only active, non-system Home Assistant users can be imported.",
            )
            return

        profile, mapping, created = identity_service.ensure_profile_for_ha_user(ha_user)
        await _persist_profiles_snapshot(runtime_data["store"], identity_service)
        connection.send_result(
            msg["id"],
            {
                "created": created,
                "ha_user": ha_user_summary_to_dict(ha_user),
                "profile": household_profile_to_dict(profile),
                "mapping": user_profile_mapping_to_dict(mapping),
            },
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
            vol.Optional("to_date"): cv.string,
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

        to_date_raw = msg.get("to_date")
        if to_date_raw is not None:
            try:
                to_date = _parse_date(to_date_raw)
            except ValueError as err:
                connection.send_error(msg["id"], "invalid_to_date", str(err))
                return

            if to_date < from_date:
                connection.send_error(
                    msg["id"],
                    "invalid_date_range",
                    "to_date must be on or after from_date.",
                )
                return

            horizon_days = (to_date - from_date).days + 1
        else:
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
    @websocket_api.require_admin
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
            try:
                _validate_unique_nfc_tag(task, tasks)
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

            updated_tag_mappings = await _sync_task_nfc_mappings(store, stored_tasks)
            _rebuild_nfc_service(
                runtime_data,
                tasks=stored_tasks,
                tag_mappings=updated_tag_mappings,
            )

            await store.async_save_nfc(
                {
                    "discovery_entries": [
                        nfc_discovery_entry_to_dict(entry)
                        for entry in runtime_data["nfc"].get_discoveries()
                    ]
                }
            )

        connection.send_result(msg["id"], task_definition_to_dict(task))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/archive_task",
            vol.Required("task_id"): cv.string,
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_archive_task(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        store: TaskStore = runtime_data["store"]

        async with runtime_data["task_save_lock"]:
            tasks = await _load_tasks(store)
            task = next(
                (candidate for candidate in tasks if candidate.id == msg["task_id"]),
                None,
            )
            if task is None:
                connection.send_error(
                    msg["id"],
                    "task_not_found",
                    f"Task {msg['task_id']!r} was not found.",
                )
                return

            task.active = False
            task.updated_at = utc_now()
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

            updated_tag_mappings = await _sync_task_nfc_mappings(store, stored_tasks)
            _rebuild_nfc_service(
                runtime_data,
                tasks=stored_tasks,
                tag_mappings=updated_tag_mappings,
            )

            await store.async_save_nfc(
                {
                    "discovery_entries": [
                        nfc_discovery_entry_to_dict(entry)
                        for entry in runtime_data["nfc"].get_discoveries()
                    ]
                }
            )

        connection.send_result(msg["id"], task_definition_to_dict(task))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/restore_task",
            vol.Required("task_id"): cv.string,
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_restore_task(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        store: TaskStore = runtime_data["store"]

        async with runtime_data["task_save_lock"]:
            tasks = await _load_tasks(store)
            task = next(
                (candidate for candidate in tasks if candidate.id == msg["task_id"]),
                None,
            )
            if task is None:
                connection.send_error(
                    msg["id"],
                    "task_not_found",
                    f"Task {msg['task_id']!r} was not found.",
                )
                return

            original_active = task.active
            task.active = True
            try:
                _validate_unique_nfc_tag(task, tasks)
            except ValueError as err:
                task.active = original_active
                connection.send_error(msg["id"], "invalid_task", str(err))
                return

            task.updated_at = utc_now()
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

            updated_tag_mappings = await _sync_task_nfc_mappings(store, stored_tasks)
            _rebuild_nfc_service(
                runtime_data,
                tasks=stored_tasks,
                tag_mappings=updated_tag_mappings,
            )

            await store.async_save_nfc(
                {
                    "discovery_entries": [
                        nfc_discovery_entry_to_dict(entry)
                        for entry in runtime_data["nfc"].get_discoveries()
                    ]
                }
            )

        connection.send_result(msg["id"], task_definition_to_dict(task))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/delete_task_definition",
            vol.Required("task_id"): cv.string,
            vol.Required("confirm_text"): cv.string,
        }
    )
    @websocket_api.async_response
    async def ws_delete_task_definition(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        if not _is_mapped_user(runtime_data, connection.user.id):
            connection.send_error(
                msg["id"],
                "mapping_required",
                "A mapped household user is required.",
            )
            return

        if msg["confirm_text"] != DELETE_CONFIRM_TEXT:
            connection.send_error(
                msg["id"],
                "invalid_confirm_text",
                "Type delete to confirm task deletion.",
            )
            return

        store: TaskStore = runtime_data["store"]

        async with runtime_data["task_save_lock"]:
            tasks = await _load_tasks(store)
            task = next(
                (candidate for candidate in tasks if candidate.id == msg["task_id"]),
                None,
            )
            if task is None:
                connection.send_error(
                    msg["id"],
                    "task_not_found",
                    f"Task {msg['task_id']!r} was not found.",
                )
                return

            controls = await store.async_load_controls()
            nfc_snapshot = await store.async_load_nfc()
            tasks_snapshot = {
                "tasks": [
                    task_definition_to_dict(existing)
                    for existing in tasks
                ]
            }
            now = utc_now()
            deletion_record = TaskDeletionRecord(
                task_snapshot=task_definition_to_dict(task),
                actor_ha_user_id=connection.user.id,
                deleted_at=now,
                undo_expires_at=now + TASK_DELETE_UNDO_WINDOW,
            )

            stored_tasks = [existing for existing in tasks if existing.id != task.id]
            updated_tasks_payload = {
                "tasks": [
                    task_definition_to_dict(existing)
                    for existing in stored_tasks
                ]
            }
            updated_tag_mappings = _derive_task_tag_mappings(stored_tasks)
            updated_discovery_entries = [
                nfc_discovery_entry_to_dict(entry)
                for entry in runtime_data["nfc"].get_discoveries()
            ]
            updated_controls_payload = {
                "task_deletions": [
                    *controls["task_deletions"],
                    task_deletion_record_to_dict(deletion_record),
                ]
            }

            try:
                await store.async_save_tasks(updated_tasks_payload)
                await store.async_save_nfc(
                    {
                        "tag_mappings": [
                            nfc_tag_mapping_to_dict(mapping)
                            for mapping in updated_tag_mappings
                        ],
                        "discovery_entries": updated_discovery_entries,
                    }
                )
                await store.async_save_controls(updated_controls_payload)
                _rebuild_nfc_service(
                    runtime_data,
                    tasks=stored_tasks,
                    tag_mappings=updated_tag_mappings,
                )
            except Exception:
                await _rollback_task_mutation_snapshot(
                    store,
                    tasks_payload=tasks_snapshot,
                    nfc_payload=nfc_snapshot,
                    controls_payload=controls,
                )
                connection.send_error(
                    msg["id"],
                    "delete_task_failed",
                    "Failed to delete task definition.",
                )
                return

        connection.send_result(
            msg["id"],
            {
                "operation_id": deletion_record.id,
                "task_id": task.id,
                "undo_expires_at": deletion_record.undo_expires_at.isoformat(),
            },
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/undo_delete_task_definition",
            vol.Required("operation_id"): cv.string,
        }
    )
    @websocket_api.async_response
    async def ws_undo_delete_task_definition(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        if not _is_mapped_user(runtime_data, connection.user.id):
            connection.send_error(
                msg["id"],
                "mapping_required",
                "A mapped household user is required.",
            )
            return

        store: TaskStore = runtime_data["store"]

        async with runtime_data["task_save_lock"]:
            controls = await store.async_load_controls()
            deletion_records = [
                task_deletion_record_from_dict(raw_record)
                for raw_record in controls["task_deletions"]
            ]
            deletion_record = next(
                (
                    record
                    for record in deletion_records
                    if record.id == msg["operation_id"]
                ),
                None,
            )
            if deletion_record is None:
                connection.send_error(
                    msg["id"],
                    "operation_not_found",
                    "Delete operation was not found.",
                )
                return

            if deletion_record.status != OperationStatus.ACTIVE:
                connection.send_error(
                    msg["id"],
                    "operation_not_reversible",
                    "Delete operation is not reversible.",
                )
                return

            if utc_now() > deletion_record.undo_expires_at:
                updated_records = []
                for record in deletion_records:
                    if record.id == deletion_record.id:
                        record.status = OperationStatus.EXPIRED
                    updated_records.append(task_deletion_record_to_dict(record))

                try:
                    await store.async_save_controls(
                        {
                            "task_deletions": updated_records,
                        }
                    )
                except Exception:
                    connection.send_error(
                        msg["id"],
                        "undo_delete_task_failed",
                        "Failed to undo task deletion.",
                    )
                    return
                connection.send_error(
                    msg["id"],
                    "undo_window_expired",
                    "Undo window has expired.",
                )
                return

            tasks = await _load_tasks(store)
            restored_task = task_definition_from_dict(deletion_record.task_snapshot)
            try:
                _validate_unique_nfc_tag(restored_task, tasks)
            except ValueError as err:
                connection.send_error(msg["id"], "invalid_task", str(err))
                return

            controls_snapshot = controls
            tasks_snapshot = {
                "tasks": [
                    task_definition_to_dict(existing)
                    for existing in tasks
                ]
            }
            nfc_snapshot = await store.async_load_nfc()
            stored_tasks = [existing for existing in tasks if existing.id != restored_task.id]
            stored_tasks.append(restored_task)
            updated_tasks_payload = {
                "tasks": [
                    task_definition_to_dict(existing)
                    for existing in stored_tasks
                ]
            }
            updated_tag_mappings = _derive_task_tag_mappings(stored_tasks)
            updated_discovery_entries = [
                nfc_discovery_entry_to_dict(entry)
                for entry in runtime_data["nfc"].get_discoveries()
            ]

            updated_records = []
            for record in deletion_records:
                if record.id == deletion_record.id:
                    record.status = OperationStatus.UNDONE
                updated_records.append(task_deletion_record_to_dict(record))

            try:
                await store.async_save_tasks(updated_tasks_payload)
                await store.async_save_nfc(
                    {
                        "tag_mappings": [
                            nfc_tag_mapping_to_dict(mapping)
                            for mapping in updated_tag_mappings
                        ],
                        "discovery_entries": updated_discovery_entries,
                    }
                )
                await store.async_save_controls(
                    {
                        "task_deletions": updated_records,
                    }
                )
                _rebuild_nfc_service(
                    runtime_data,
                    tasks=stored_tasks,
                    tag_mappings=updated_tag_mappings,
                )
            except Exception:
                await _rollback_task_mutation_snapshot(
                    store,
                    tasks_payload=tasks_snapshot,
                    nfc_payload=nfc_snapshot,
                    controls_payload=controls_snapshot,
                )
                connection.send_error(
                    msg["id"],
                    "undo_delete_task_failed",
                    "Failed to undo task deletion.",
                )
                return

        connection.send_result(
            msg["id"],
            {
                "operation_id": deletion_record.id,
                "status": OperationStatus.UNDONE.value,
                "task": task_definition_to_dict(restored_task),
            },
        )

    @websocket_api.websocket_command(
        {vol.Required("type"): f"{DOMAIN}/unmapped_nfc_tags"}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_unmapped_nfc_tags(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        discoveries = runtime_data["nfc"].list_unmapped_discoveries()
        connection.send_result(
            msg["id"],
            [nfc_discovery_entry_to_dict(entry) for entry in discoveries],
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/link_nfc_tag",
            vol.Required("tag_id"): cv.string,
            vol.Required("task_id"): cv.string,
            vol.Optional("label"): cv.string,
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_link_nfc_tag(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        store: TaskStore = runtime_data["store"]

        async with runtime_data["task_save_lock"]:
            tasks = await _load_tasks(store)
            task = next(
                (candidate for candidate in tasks if candidate.id == msg["task_id"]),
                None,
            )
            if task is None:
                connection.send_error(
                    msg["id"],
                    "task_not_found",
                    f"Task {msg['task_id']!r} was not found.",
                )
                return

            if not task.active:
                connection.send_error(
                    msg["id"],
                    "inactive_task",
                    f"Task {task.id!r} must be active before linking an NFC tag.",
                )
                return

            conflicting_task = next(
                (
                    candidate
                    for candidate in tasks
                    if candidate.id != task.id
                    and candidate.active
                    and candidate.nfc_tag_id == msg["tag_id"]
                ),
                None,
            )
            if conflicting_task is not None:
                connection.send_error(
                    msg["id"],
                    "nfc_tag_conflict",
                    f"NFC tag {msg['tag_id']!r} is already assigned to task {conflicting_task.id!r}.",
                )
                return

            task.nfc_tag_id = msg["tag_id"]
            task.updated_at = utc_now()
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

            updated_tag_mappings = await _sync_task_nfc_mappings(store, stored_tasks)
            _rebuild_nfc_service(
                runtime_data,
                tasks=stored_tasks,
                tag_mappings=updated_tag_mappings,
            )

            await store.async_save_nfc(
                {
                    "discovery_entries": [
                        nfc_discovery_entry_to_dict(entry)
                        for entry in runtime_data["nfc"].get_discoveries()
                    ]
                }
            )

            linked_mapping = next(
                mapping
                for mapping in updated_tag_mappings
                if mapping.task_id == task.id and mapping.tag_id == msg["tag_id"]
            )

        connection.send_result(msg["id"], nfc_tag_mapping_to_dict(linked_mapping))

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
        if attempt is None or attempt.actor_ha_user_id != connection.user.id:
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
            await _persist_latest_history_record_if_needed(
                hass,
                store,
                completion_service,
                history_before=history_before,
            )
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
            vol.Required("type"): f"{DOMAIN}/complete_due_instance",
            vol.Required("due_instance_id"): cv.string,
            vol.Optional("completed_at"): cv.string,
        }
    )
    @websocket_api.async_response
    async def ws_complete_due_instance(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        runtime_data = _get_runtime_data(connection, msg)
        if runtime_data is None:
            return

        store: TaskStore = runtime_data["store"]
        completion_service = runtime_data["completion"]
        task_domain = runtime_data["task_domain"]

        actor_ha_user_id = connection.user.id

        try:
            task_id, _due_date = msg["due_instance_id"].rsplit(":", 1)
        except ValueError:
            connection.send_error(
                msg["id"],
                "invalid_due_instance",
                f"Due instance id {msg['due_instance_id']!r} is invalid.",
            )
            return

        tasks = await _load_tasks(store)
        task = next((candidate for candidate in tasks if candidate.id == task_id), None)
        if task is None:
            connection.send_error(
                msg["id"],
                "task_not_found",
                f"Task {task_id!r} was not found.",
            )
            return

        try:
            due_instance = _resolve_due_instance(
                task_domain,
                task=task,
                due_instance_id=msg["due_instance_id"],
            )
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_due_instance", str(err))
            return

        try:
            completed_at = (
                _parse_datetime(msg["completed_at"])
                if "completed_at" in msg
                else None
            )
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_completed_at", str(err))
            return

        history_before = len(completion_service.get_history())

        try:
            completion_record = completion_service.confirm_completion(
                task=task,
                due_instance=due_instance,
                actor_ha_user_id=actor_ha_user_id,
                source=CompletionSource.MANUAL,
                completed_at=completed_at,
            )
        except TaskManagerError as err:
            await _persist_latest_history_record_if_needed(
                hass,
                store,
                completion_service,
                history_before=history_before,
            )
            if isinstance(err, UnmappedUserError):
                hass.bus.async_fire(
                    EVENT_USER_MAPPING_WARNING,
                    {
                        "actor_ha_user_id": actor_ha_user_id,
                        "task_id": task.id,
                        "due_instance_id": due_instance.id,
                    },
                )
            connection.send_error(
                msg["id"],
                (
                    "mapping_required"
                    if isinstance(err, UnmappedUserError)
                    else "complete_due_instance_failed"
                ),
                str(err),
            )
            return

        recorded_payload = completion_record_to_dict(completion_record)
        await store.async_append_completion(recorded_payload)
        hass.bus.async_fire(EVENT_COMPLETION_RECORDED, recorded_payload)
        connection.send_result(msg["id"], recorded_payload)

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
            projected_due_instances.extend(
                task_domain.project_due_instances(
                    task=task,
                    from_date=from_date,
                    horizon_days=horizon_days,
                )
            )

        task_assignments = {
            task.id: task.assigned_profile_id for task in tasks
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
    websocket_api.async_register_command(hass, ws_profile_mappings)
    websocket_api.async_register_command(hass, ws_ha_users)
    websocket_api.async_register_command(hass, ws_current_profile)
    websocket_api.async_register_command(hass, ws_import_ha_user)
    websocket_api.async_register_command(hass, ws_tasks)
    websocket_api.async_register_command(hass, ws_due_instances)
    websocket_api.async_register_command(hass, ws_save_task)
    websocket_api.async_register_command(hass, ws_archive_task)
    websocket_api.async_register_command(hass, ws_restore_task)
    websocket_api.async_register_command(hass, ws_delete_task_definition)
    websocket_api.async_register_command(hass, ws_undo_delete_task_definition)
    websocket_api.async_register_command(hass, ws_unmapped_nfc_tags)
    websocket_api.async_register_command(hass, ws_link_nfc_tag)
    websocket_api.async_register_command(hass, ws_confirm_completion)
    websocket_api.async_register_command(hass, ws_complete_due_instance)
    websocket_api.async_register_command(hass, ws_analytics)
