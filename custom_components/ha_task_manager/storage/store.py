"""Thin typed wrappers around Home Assistant storage."""

from __future__ import annotations

import asyncio
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from custom_components.ha_task_manager.const import (
    STORAGE_KEY_COMPLETIONS,
    STORAGE_KEY_NFC,
    STORAGE_KEY_PROFILES,
    STORAGE_KEY_TASKS,
    STORAGE_MINOR_VERSION_NFC,
    STORAGE_VERSION,
)


class _NfcStore(Store[dict[str, Any]]):
    """NFC storage with migration support for discovery persistence."""

    async def _async_migrate_func(
        self,
        old_major_version: int,
        old_minor_version: int,
        old_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Backfill newly added NFC fields during version upgrades."""
        if old_major_version == STORAGE_VERSION and old_minor_version < 2:
            return TaskStore._normalize_nfc_payload(old_data)

        raise NotImplementedError


class TaskStore:
    """Persist raw serializable task-manager data structures."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._completions_lock = asyncio.Lock()
        self._nfc_lock = asyncio.Lock()
        self._tasks_store: Store[dict[str, Any]] = Store(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY_TASKS,
        )
        self._completions_store: Store[list[dict[str, Any]]] = Store(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY_COMPLETIONS,
        )
        self._profiles_store: Store[dict[str, Any]] = Store(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY_PROFILES,
        )
        self._nfc_store: Store[dict[str, Any]] = _NfcStore(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY_NFC,
            minor_version=STORAGE_MINOR_VERSION_NFC,
        )

    @staticmethod
    def _normalize_nfc_payload(data: dict[str, Any] | None) -> dict[str, Any]:
        """Ensure NFC payloads always include all persisted collections."""
        data = data or {}
        return {
            "tag_mappings": data.get("tag_mappings", []),
            "discovery_entries": data.get("discovery_entries", []),
        }

    async def async_load_tasks(self) -> dict[str, Any]:
        """Load raw task payloads."""
        return await self._tasks_store.async_load() or {}

    async def async_save_tasks(self, data: dict[str, Any]) -> None:
        """Persist raw task payloads."""
        await self._tasks_store.async_save(data)

    async def async_load_completions(self) -> list[dict[str, Any]]:
        """Load raw completion history payloads."""
        return await self._completions_store.async_load() or []

    async def async_append_completion(self, record: dict[str, Any]) -> None:
        """Append one raw completion or audit payload."""
        async with self._completions_lock:
            history = await self._completions_store.async_load() or []
            history.append(record)
            await self._completions_store.async_save(history)

    async def async_load_profiles(self) -> dict[str, Any]:
        """Load raw profile and mapping payloads."""
        return await self._profiles_store.async_load() or {}

    async def async_save_profiles(self, data: dict[str, Any]) -> None:
        """Persist raw profile and mapping payloads."""
        await self._profiles_store.async_save(data)

    async def async_load_nfc(self) -> dict[str, Any]:
        """Load raw NFC payloads."""
        return self._normalize_nfc_payload(await self._nfc_store.async_load())

    async def async_save_nfc(self, data: dict[str, Any]) -> None:
        """Persist raw NFC payloads."""
        async with self._nfc_lock:
            existing = self._normalize_nfc_payload(await self._nfc_store.async_load())
            await self._nfc_store.async_save(
                {
                    "tag_mappings": data.get(
                        "tag_mappings",
                        existing["tag_mappings"],
                    ),
                    "discovery_entries": data.get(
                        "discovery_entries",
                        existing["discovery_entries"],
                    ),
                }
            )
