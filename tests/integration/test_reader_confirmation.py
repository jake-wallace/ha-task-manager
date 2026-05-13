from __future__ import annotations

from datetime import date

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_task_manager.const import DOMAIN
from custom_components.ha_task_manager.models import CompletionSource
from custom_components.ha_task_manager.storage.store import TaskStore


async def test_reader_pending_confirmation_and_completion_follow_same_path(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks(
        {
            "tasks": [
                {
                    "id": "task-trash",
                    "title": "Take out trash",
                    "description": "",
                    "recurrence": {
                        "frequency": "daily",
                        "days_of_week": [],
                        "interval_days": 1,
                        "day_of_month": None,
                    },
                    "skip_windows": [],
                    "assigned_profile_id": "profile-alice",
                    "nfc_tag_id": "tag-reader-1",
                    "active": True,
                    "start_date": "2026-05-10",
                    "created_at": "2026-05-10T00:00:00+00:00",
                    "updated_at": "2026-05-10T00:00:00+00:00",
                }
            ]
        }
    )
    await store.async_save_profiles(
        {
            "profiles": [
                {
                    "id": "profile-alice",
                    "display_name": "Alice",
                    "avatar_url": "",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
            "mappings": [
                {
                    "id": "mapping-alice",
                    "ha_user_id": "reader-ha-alice",
                    "profile_id": "profile-alice",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
        }
    )
    await store.async_save_nfc(
        {
            "tag_mappings": [
                {
                    "id": "nfc-map-reader",
                    "tag_id": "tag-reader-1",
                    "task_id": "task-trash",
                    "label": "Trash tag",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ]
        }
    )

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    services = hass.data[DOMAIN][entry.entry_id]
    attempt = services["nfc"].initiate_confirmation(
        tag_id="tag-reader-1",
        actor_ha_user_id="reader-ha-alice",
        source=CompletionSource.NFC_READER,
        as_of=date(2026, 5, 10),
    )

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    pending_response = await client.receive_json()

    assert pending_response["success"] is True
    assert pending_response["result"][0]["source"] == "nfc_reader"
    assert pending_response["result"][0]["due_instance_id"] == "task-trash:2026-05-10"

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/confirm_completion",
            "attempt_id": attempt.id,
        }
    )
    confirm_response = await client.receive_json()

    assert confirm_response["success"] is True
    assert confirm_response["result"]["source"] == "nfc_reader"
    assert confirm_response["result"]["outcome"] == "confirmed"

    stored_history = await store.async_load_completions()

    assert len(stored_history) == 1
    assert stored_history[0]["due_instance_id"] == "task-trash:2026-05-10"
    assert stored_history[0]["source"] == "nfc_reader"
