"""HA Task Manager integration."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .panel import async_register_task_manager_panel
from .services.analytics import AnalyticsService
from .services.completion_domain import CompletionDomainService
from .services.identity_mapping import IdentityMappingService
from .services.nfc_events import NfcEventService
from .services.task_domain import TaskDomainService
from .storage.store import TaskStore
from .websocket_api import (
    async_register_websocket_api,
    completion_record_from_dict,
    household_profile_from_dict,
    nfc_tag_mapping_from_dict,
    task_definition_from_dict,
    user_profile_mapping_from_dict,
)

_PANEL_REGISTERED = "_panel_registered"
_WEBSOCKET_REGISTERED = "_websocket_registered"


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

    domain_data[entry.entry_id] = {
        "store": store,
        "identity": identity_mapping_service,
        "task_domain": task_domain_service,
        "completion": completion_domain_service,
        "nfc": nfc_event_service,
        "analytics": analytics_service,
    }

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

    hass.data[DOMAIN].pop(entry.entry_id, None)
    remaining_entries = {
        key: value
        for key, value in hass.data[DOMAIN].items()
        if not str(key).startswith("_")
    }
    if not remaining_entries:
        hass.data.pop(DOMAIN)

    return True
