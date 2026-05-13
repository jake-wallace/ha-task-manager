from __future__ import annotations

import asyncio

from custom_components.ha_task_manager.storage.store import TaskStore


class _FakeCompletionStore:
    def __init__(self) -> None:
        self.data: list[dict[str, object]] = []

    async def async_load(self) -> list[dict[str, object]]:
        await asyncio.sleep(0)
        return [dict(record) for record in self.data]

    async def async_save(self, data: list[dict[str, object]]) -> None:
        await asyncio.sleep(0)
        self.data = [dict(record) for record in data]


async def test_append_completion_serializes_concurrent_writes(hass) -> None:
    store = TaskStore(hass)
    fake_store = _FakeCompletionStore()
    store._completions_store = fake_store

    await asyncio.gather(
        store.async_append_completion({"id": "completion-1"}),
        store.async_append_completion({"id": "completion-2"}),
    )

    assert fake_store.data == [
        {"id": "completion-1"},
        {"id": "completion-2"},
    ]
