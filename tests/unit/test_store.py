from __future__ import annotations

import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from homeassistant.core import HomeAssistant

from custom_components.ha_task_manager.const import STORAGE_KEY_NFC
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


class _FakeNfcStore:
    def __init__(self) -> None:
        self.data: dict[str, list[dict[str, object]]] = {
            "tag_mappings": [],
            "discovery_entries": [],
        }

    async def async_load(self) -> dict[str, list[dict[str, object]]]:
        await asyncio.sleep(0)
        return {
            key: [dict(item) for item in value]
            for key, value in self.data.items()
        }

    async def async_save(self, data: dict[str, list[dict[str, object]]]) -> None:
        await asyncio.sleep(0)
        self.data = {
            key: [dict(item) for item in value]
            for key, value in data.items()
        }


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


async def test_nfc_storage_round_trip_includes_discovery_entries(hass) -> None:
    store = TaskStore(hass)
    payload = {
        "tag_mappings": [
            {
                "id": "mapping-1",
                "tag_id": "tag-abc123",
                "task_id": "task-bathroom",
                "label": "Bathroom",
                "created_at": "2026-05-10T00:00:00+00:00",
            }
        ],
        "discovery_entries": [
            {
                "tag_id": "tag-new",
                "first_seen": "2026-05-14T08:00:00+00:00",
                "last_seen": "2026-05-14T09:30:00+00:00",
                "last_source": "nfc_reader",
            }
        ],
    }

    await store.async_save_nfc(payload)

    assert await store.async_load_nfc() == payload


async def test_nfc_storage_serializes_overlapping_partial_updates(hass) -> None:
    store = TaskStore(hass)
    fake_store = _FakeNfcStore()
    store._nfc_store = fake_store

    await asyncio.gather(
        store.async_save_nfc(
            {
                "tag_mappings": [
                    {
                        "id": "mapping-1",
                        "tag_id": "tag-abc123",
                        "task_id": "task-bathroom",
                        "label": "Bathroom",
                        "created_at": "2026-05-10T00:00:00+00:00",
                    }
                ]
            }
        ),
        store.async_save_nfc(
            {
                "discovery_entries": [
                    {
                        "tag_id": "tag-new",
                        "first_seen": "2026-05-14T08:00:00+00:00",
                        "last_seen": "2026-05-14T09:30:00+00:00",
                        "last_source": "nfc_reader",
                    }
                ]
            }
        ),
    )

    assert fake_store.data == {
        "tag_mappings": [
            {
                "id": "mapping-1",
                "tag_id": "tag-abc123",
                "task_id": "task-bathroom",
                "label": "Bathroom",
                "created_at": "2026-05-10T00:00:00+00:00",
            }
        ],
        "discovery_entries": [
            {
                "tag_id": "tag-new",
                "first_seen": "2026-05-14T08:00:00+00:00",
                "last_seen": "2026-05-14T09:30:00+00:00",
                "last_source": "nfc_reader",
            }
        ],
    }


async def test_nfc_storage_loads_existing_version_1_payload() -> None:
    with TemporaryDirectory() as config_dir:
        hass = HomeAssistant(config_dir)
        store = TaskStore(hass)
        storage_path = Path(store._nfc_store.path)
        storage_path.parent.mkdir(parents=True, exist_ok=True)
        storage_path.write_text(
            json.dumps(
                {
                    "version": 1,
                    "minor_version": 1,
                    "key": STORAGE_KEY_NFC,
                    "data": {
                        "tag_mappings": [
                            {
                                "id": "mapping-1",
                                "tag_id": "tag-abc123",
                                "task_id": "task-bathroom",
                                "label": "Bathroom",
                                "created_at": "2026-05-10T00:00:00+00:00",
                            }
                        ]
                    },
                }
            ),
            encoding="utf-8",
        )

        assert await store.async_load_nfc() == {
            "tag_mappings": [
                {
                    "id": "mapping-1",
                    "tag_id": "tag-abc123",
                    "task_id": "task-bathroom",
                    "label": "Bathroom",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
            "discovery_entries": [],
        }

        persisted = json.loads(storage_path.read_text(encoding="utf-8"))

        assert persisted == {
            "version": 1,
            "minor_version": 2,
            "key": STORAGE_KEY_NFC,
            "data": {
                "tag_mappings": [
                    {
                        "id": "mapping-1",
                        "tag_id": "tag-abc123",
                        "task_id": "task-bathroom",
                        "label": "Bathroom",
                        "created_at": "2026-05-10T00:00:00+00:00",
                    }
                ],
                "discovery_entries": [],
            },
        }
