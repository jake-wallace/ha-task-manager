from __future__ import annotations

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_task_manager.const import DOMAIN, EVENT_NFC_SCANNED
from custom_components.ha_task_manager.storage.store import TaskStore


async def test_pending_confirmations_are_scoped_to_authenticated_user(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
    hass_read_only_user,
    hass_read_only_access_token,
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
                    "assigned_profile_id": "profile-bob",
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
                },
                {
                    "id": "profile-bob",
                    "display_name": "Bob",
                    "avatar_url": "",
                    "created_at": "2026-05-10T00:00:00+00:00",
                },
            ],
            "mappings": [
                {
                    "id": "mapping-alice",
                    "ha_user_id": hass_admin_user.id,
                    "profile_id": "profile-alice",
                    "created_at": "2026-05-10T00:00:00+00:00",
                },
                {
                    "id": "mapping-bob",
                    "ha_user_id": hass_read_only_user.id,
                    "profile_id": "profile-bob",
                    "created_at": "2026-05-10T00:00:00+00:00",
                },
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

    hass.bus.async_fire(
        EVENT_NFC_SCANNED,
        {
            "tag_id": "tag-reader-1",
            "actor_ha_user_id": hass_read_only_user.id,
            "source": "reader",
            "as_of": "2026-05-10",
        },
    )
    await hass.async_block_till_done()

    owner_client = await hass_ws_client(
        hass,
        access_token=hass_read_only_access_token,
    )
    other_client = await hass_ws_client(hass)

    await owner_client.send_json_auto_id(
        {"type": "ha_task_manager/pending_confirmations"}
    )
    owner_pending = await owner_client.receive_json()

    assert owner_pending["success"] is True
    assert len(owner_pending["result"]) == 1
    attempt_id = owner_pending["result"][0]["id"]

    await other_client.send_json_auto_id(
        {"type": "ha_task_manager/pending_confirmations"}
    )
    other_pending = await other_client.receive_json()

    assert other_pending["success"] is True
    assert other_pending["result"] == []

    await other_client.send_json_auto_id(
        {
            "type": "ha_task_manager/confirm_completion",
            "attempt_id": attempt_id,
        }
    )
    denied_response = await other_client.receive_json()

    assert denied_response["success"] is False
    assert denied_response["error"]["code"] == "attempt_not_found"

    await owner_client.send_json_auto_id(
        {
            "type": "ha_task_manager/confirm_completion",
            "attempt_id": attempt_id,
        }
    )
    confirmed_response = await owner_client.receive_json()

    assert confirmed_response["success"] is True
    assert confirmed_response["result"]["actor_ha_user_id"] == hass_read_only_user.id
