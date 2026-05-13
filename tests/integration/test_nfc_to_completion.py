from __future__ import annotations

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_task_manager.const import DOMAIN, EVENT_NFC_SCANNED
from custom_components.ha_task_manager.storage.store import TaskStore


def _task_payload() -> dict[str, object]:
    return {
        "id": "task-bathroom",
        "title": "Clean bathroom",
        "description": "",
        "recurrence": {
            "frequency": "daily",
            "days_of_week": [],
            "interval_days": 1,
            "day_of_month": None,
        },
        "skip_windows": [],
        "assigned_profile_id": "profile-alice",
        "nfc_tag_id": "tag-phone-1",
        "active": True,
        "start_date": "2026-05-10",
        "created_at": "2026-05-10T00:00:00+00:00",
        "updated_at": "2026-05-10T00:00:00+00:00",
    }


async def test_phone_nfc_scan_to_confirmed_completion(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
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
                    "ha_user_id": "ha-alice",
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
                    "id": "nfc-map-1",
                    "tag_id": "tag-phone-1",
                    "task_id": "task-bathroom",
                    "label": "Bathroom tag",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ]
        }
    )

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    hass.bus.async_fire(
        EVENT_NFC_SCANNED,
        {
            "tag_id": "tag-phone-1",
            "actor_ha_user_id": "ha-alice",
            "source": "phone",
            "as_of": "2026-05-10",
        },
    )
    await hass.async_block_till_done()

    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    pending_response = await client.receive_json()

    assert pending_response["success"] is True
    assert pending_response["result"] == [
        {
            "id": pending_response["result"][0]["id"],
            "task_id": "task-bathroom",
            "due_instance_id": "task-bathroom:2026-05-10",
            "actor_ha_user_id": "ha-alice",
            "source": "nfc_phone",
            "initiated_at": pending_response["result"][0]["initiated_at"],
        }
    ]
    attempt_id = pending_response["result"][0]["id"]

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/confirm_completion",
            "attempt_id": attempt_id,
            "completed_at": "2026-05-10T09:30:00+00:00",
        }
    )
    confirm_response = await client.receive_json()

    assert confirm_response["success"] is True
    assert confirm_response["result"]["task_id"] == "task-bathroom"
    assert confirm_response["result"]["due_instance_id"] == "task-bathroom:2026-05-10"
    assert confirm_response["result"]["actor_profile_id"] == "profile-alice"
    assert confirm_response["result"]["outcome"] == "confirmed"

    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    cleared_response = await client.receive_json()

    assert cleared_response["success"] is True
    assert cleared_response["result"] == []

    stored_history = await store.async_load_completions()

    assert stored_history == [
        {
            "id": confirm_response["result"]["id"],
            "task_id": "task-bathroom",
            "due_instance_id": "task-bathroom:2026-05-10",
            "completed_at": "2026-05-10T09:30:00+00:00",
            "actor_ha_user_id": "ha-alice",
            "actor_profile_id": "profile-alice",
            "source": "nfc_phone",
            "outcome": "confirmed",
            "blocked_reason": "",
        }
    ]


async def test_phone_nfc_scan_uses_rebuilt_runtime_service_after_task_save(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": []})
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
                    "ha_user_id": "ha-alice",
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
                    "id": "nfc-map-1",
                    "tag_id": "tag-phone-1",
                    "task_id": "task-bathroom",
                    "label": "Bathroom tag",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ]
        }
    )

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/save_task",
            "task": _task_payload(),
        }
    )
    save_response = await client.receive_json()

    assert save_response["success"] is True
    assert save_response["result"]["id"] == "task-bathroom"

    hass.bus.async_fire(
        EVENT_NFC_SCANNED,
        {
            "tag_id": "tag-phone-1",
            "actor_ha_user_id": "ha-alice",
            "source": "phone",
            "as_of": "2026-05-10",
        },
    )
    await hass.async_block_till_done()

    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    pending_response = await client.receive_json()

    assert pending_response["success"] is True
    assert pending_response["result"][0]["task_id"] == "task-bathroom"
    assert (
        pending_response["result"][0]["due_instance_id"]
        == "task-bathroom:2026-05-10"
    )
