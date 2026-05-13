"""HA Task Manager integration."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback

from .const import DOMAIN, EVENT_COMPLETION_REQUESTED, EVENT_NFC_SCANNED
from .exceptions import TaskManagerError
from .models import AttemptOutcome, CompletionSource
from .panel import async_register_task_manager_panel
from .services.analytics import AnalyticsService
from .services.completion_domain import CompletionDomainService
from .services.identity_mapping import IdentityMappingService
from .services.nfc_events import NfcEventService
from .services.task_domain import TaskDomainService
from .storage.store import TaskStore
from .websocket_api import (
    async_register_websocket_api,
    completion_attempt_to_dict,
    completion_record_from_dict,
    household_profile_from_dict,
    nfc_tag_mapping_from_dict,
    task_definition_from_dict,
    user_profile_mapping_from_dict,
)

_LOGGER = logging.getLogger(__name__)
_PANEL_REGISTERED = "_panel_registered"
_WEBSOCKET_REGISTERED = "_websocket_registered"
_NFC_LISTENER_UNSUBSCRIBE = "_nfc_listener_unsubscribe"


def _resolve_nfc_scan_source(raw_source: Any) -> CompletionSource | None:
    if not isinstance(raw_source, str):
        return None

    normalized_source = raw_source.strip().lower()
    if normalized_source in {"phone", CompletionSource.NFC_PHONE.value}:
        return CompletionSource.NFC_PHONE
    if normalized_source in {"reader", CompletionSource.NFC_READER.value}:
        return CompletionSource.NFC_READER

    return None


def _parse_nfc_scan_as_of(raw_as_of: Any) -> date | None:
    if raw_as_of is None:
        return None
    if isinstance(raw_as_of, date):
        return raw_as_of
    if not isinstance(raw_as_of, str):
        return None

    try:
        return date.fromisoformat(raw_as_of)
    except ValueError:
        return None


def _confirmed_due_instance_ids(
    completion_service: CompletionDomainService,
) -> set[str]:
    return {
        record.due_instance_id
        for record in completion_service.get_history()
        if record.outcome == AttemptOutcome.CONFIRMED
    }


def _register_nfc_event_listener(
    hass: HomeAssistant,
    runtime_data: dict[str, Any],
):
    nfc_service: NfcEventService = runtime_data["nfc"]
    completion_service: CompletionDomainService = runtime_data["completion"]

    @callback
    def _handle_nfc_scan(event: Event[dict[str, Any]]) -> None:
        event_data = event.data or {}
        tag_id = event_data.get("tag_id")
        actor_ha_user_id = event_data.get("actor_ha_user_id")
        source = _resolve_nfc_scan_source(event_data.get("source"))
        as_of = _parse_nfc_scan_as_of(event_data.get("as_of"))

        if not isinstance(tag_id, str) or not tag_id:
            _LOGGER.warning("Ignoring NFC scan without a tag_id: %s", event_data)
            return
        if not isinstance(actor_ha_user_id, str) or not actor_ha_user_id:
            _LOGGER.warning(
                "Ignoring NFC scan for tag %s without actor_ha_user_id",
                tag_id,
            )
            return
        if source is None:
            _LOGGER.warning(
                "Ignoring NFC scan for tag %s with unsupported source %r",
                tag_id,
                event_data.get("source"),
            )
            return
        if event_data.get("as_of") is not None and as_of is None:
            _LOGGER.warning(
                "Ignoring NFC scan for tag %s with invalid as_of %r",
                tag_id,
                event_data.get("as_of"),
            )
            return

        try:
            attempt = nfc_service.initiate_confirmation(
                tag_id=tag_id,
                actor_ha_user_id=actor_ha_user_id,
                source=source,
                completed_due_instance_ids=_confirmed_due_instance_ids(
                    completion_service
                ),
                as_of=as_of,
            )
        except TaskManagerError as err:
            _LOGGER.warning(
                "Failed to initiate NFC confirmation for tag %s: %s",
                tag_id,
                err,
            )
            return

        hass.bus.async_fire(
            EVENT_COMPLETION_REQUESTED,
            completion_attempt_to_dict(attempt),
        )

    return hass.bus.async_listen(EVENT_NFC_SCANNED, _handle_nfc_scan)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Set up the integration component."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up HA Task Manager from a config entry."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    store = TaskStore(hass)

    raw_tasks = await store.async_load_tasks()
    raw_profiles = await store.async_load_profiles()
    raw_nfc = await store.async_load_nfc()
    raw_history = await store.async_load_completions()

    tasks = [
        task_definition_from_dict(raw_task)
        for raw_task in raw_tasks.get("tasks", [])
    ]
    profiles = [
        household_profile_from_dict(raw_profile)
        for raw_profile in raw_profiles.get("profiles", [])
    ]
    mappings = [
        user_profile_mapping_from_dict(raw_mapping)
        for raw_mapping in raw_profiles.get("mappings", [])
    ]
    tag_mappings = [
        nfc_tag_mapping_from_dict(raw_mapping)
        for raw_mapping in raw_nfc.get("tag_mappings", [])
    ]
    history = [
        completion_record_from_dict(raw_record) for raw_record in raw_history
    ]

    identity_mapping_service = IdentityMappingService(
        profiles=profiles,
        mappings=mappings,
    )
    task_domain_service = TaskDomainService()
    completion_domain_service = CompletionDomainService(
        identity_mapping_service=identity_mapping_service,
        history=history,
    )
    nfc_event_service = NfcEventService(
        tag_mappings=tag_mappings,
        tasks=tasks,
        task_domain_service=task_domain_service,
    )
    analytics_service = AnalyticsService()

    runtime_data = {
        "store": store,
        "identity": identity_mapping_service,
        "task_domain": task_domain_service,
        "completion": completion_domain_service,
        "nfc": nfc_event_service,
        "analytics": analytics_service,
    }
    runtime_data[_NFC_LISTENER_UNSUBSCRIBE] = _register_nfc_event_listener(
        hass,
        runtime_data,
    )
    domain_data[entry.entry_id] = runtime_data

    if not domain_data.get(_WEBSOCKET_REGISTERED):
        async_register_websocket_api(hass, entry.entry_id)
        domain_data[_WEBSOCKET_REGISTERED] = True

    if not domain_data.get(_PANEL_REGISTERED):
        await async_register_task_manager_panel(hass)
        domain_data[_PANEL_REGISTERED] = True

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if DOMAIN not in hass.data:
        return True

    runtime_data = hass.data[DOMAIN].get(entry.entry_id)
    if runtime_data is not None:
        unsubscribe = runtime_data.pop(_NFC_LISTENER_UNSUBSCRIBE, None)
        if unsubscribe is not None:
            unsubscribe()

    hass.data[DOMAIN].pop(entry.entry_id, None)
    remaining_entries = {
        key: value
        for key, value in hass.data[DOMAIN].items()
        if not str(key).startswith("_")
    }
    if not remaining_entries:
        hass.data.pop(DOMAIN)

    return True
