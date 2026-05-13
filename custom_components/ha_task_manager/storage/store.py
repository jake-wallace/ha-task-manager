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
    STORAGE_VERSION,
)


class TaskStore:
    """Persist raw serializable task-manager data structures."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._completions_lock = asyncio.Lock()
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
        self._nfc_store: Store[dict[str, Any]] = Store(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY_NFC,
        )

    async def async_load_tasks(self) -> dict[str, Any]:
        """Load raw task payloads."""
        return await self._tasks_store.async_load() or {}

    async def async_save_tasks(self, data: dict[str, Any]) -> None:
        """Persist raw task payloads."""
        await self._tasks_store.async_save(data)

    async def async_load_completions(self) -> list[dict[str, Any]]:
        """Load raw completion history payloads."""
        return await self._completions_store.async_load() or []

    async def async_save_completions(self, data: list[dict[str, Any]]) -> None:
        """Persist the full raw completion history payload list."""
        async with self._completions_lock:
            await self._completions_store.async_save(data)

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
        """Load raw NFC mapping payloads."""
        return await self._nfc_store.async_load() or {}

    async def async_save_nfc(self, data: dict[str, Any]) -> None:
        """Persist raw NFC mapping payloads."""
        await self._nfc_store.async_save(data)
