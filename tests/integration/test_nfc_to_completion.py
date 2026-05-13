from __future__ import annotations

import asyncio

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_task_manager.const import (
    DOMAIN,
    EVENT_NFC_SCANNED,
    EVENT_NFC_TAG_MAPPING_REQUESTED,
)
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
    hass_admin_user,
) -> None:
    user_id = hass_admin_user.id
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
                    "ha_user_id": user_id,
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
            "actor_ha_user_id": user_id,
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
                "actor_ha_user_id": user_id,
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
            "actor_ha_user_id": user_id,
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
    hass_admin_user,
) -> None:
    user_id = hass_admin_user.id
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
                    "ha_user_id": user_id,
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
            "actor_ha_user_id": user_id,
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


async def test_save_task_rejects_invalid_recurrence_payload(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": []})

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    invalid_task = _task_payload()
    invalid_task["recurrence"] = {
        "frequency": "monthly",
        "days_of_week": [],
        "interval_days": 1,
        "day_of_month": None,
    }

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/save_task",
            "task": invalid_task,
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "invalid_task"
    assert await store.async_load_tasks() == {"tasks": []}


async def test_unknown_nfc_tag_emits_mapping_request_event(
    enable_custom_integrations,
    hass,
) -> None:
    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    captured_events = []
    hass.bus.async_listen(
        EVENT_NFC_TAG_MAPPING_REQUESTED,
        lambda event: captured_events.append(event.data),
    )

    hass.bus.async_fire(
        EVENT_NFC_SCANNED,
        {
            "tag_id": "unknown-tag",
            "actor_ha_user_id": "ha-alice",
            "source": "phone",
        },
    )
    await hass.async_block_till_done()

    assert captured_events == [
        {
            "tag_id": "unknown-tag",
            "actor_ha_user_id": "ha-alice",
            "source": "nfc_phone",
        }
    ]


async def test_stale_pending_confirmation_is_rejected_after_task_edit(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    user_id = hass_admin_user.id
    store = TaskStore(hass)
    original_task = _task_payload()
    await store.async_save_tasks({"tasks": [original_task]})
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
                    "ha_user_id": user_id,
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
            "actor_ha_user_id": user_id,
            "source": "phone",
            "as_of": "2026-05-10",
        },
    )
    await hass.async_block_till_done()

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    pending_response = await client.receive_json()

    assert pending_response["success"] is True
    attempt_id = pending_response["result"][0]["id"]

    edited_task = _task_payload()
    edited_task["recurrence"] = {
        "frequency": "weekly",
        "days_of_week": [2],
        "interval_days": 1,
        "day_of_month": None,
    }
    edited_task["updated_at"] = "2026-05-11T00:00:00+00:00"
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/save_task",
            "task": edited_task,
        }
    )
    save_response = await client.receive_json()

    assert save_response["success"] is True

    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    cleared_response = await client.receive_json()

    assert cleared_response["success"] is True
    assert cleared_response["result"] == []

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/confirm_completion",
            "attempt_id": attempt_id,
        }
    )
    confirm_response = await client.receive_json()

    assert confirm_response["success"] is False
    assert confirm_response["error"]["code"] == "attempt_not_found"


async def test_disabling_task_clears_pending_confirmation(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    user_id = hass_admin_user.id
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
                    "ha_user_id": user_id,
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
            "actor_ha_user_id": user_id,
            "source": "phone",
            "as_of": "2026-05-10",
        },
    )
    await hass.async_block_till_done()

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    pending_response = await client.receive_json()

    assert pending_response["success"] is True
    attempt_id = pending_response["result"][0]["id"]

    disabled_task = _task_payload()
    disabled_task["active"] = False
    disabled_task["updated_at"] = "2026-05-11T00:00:00+00:00"
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/save_task",
            "task": disabled_task,
        }
    )
    save_response = await client.receive_json()

    assert save_response["success"] is True

    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    cleared_response = await client.receive_json()

    assert cleared_response["success"] is True
    assert cleared_response["result"] == []

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/confirm_completion",
            "attempt_id": attempt_id,
        }
    )
    confirm_response = await client.receive_json()

    assert confirm_response["success"] is False
    assert confirm_response["error"]["code"] == "attempt_not_found"


async def test_save_task_updates_persisted_nfc_mapping(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
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
    updated_task = _task_payload()
    updated_task["nfc_tag_id"] = "tag-phone-2"
    updated_task["updated_at"] = "2026-05-11T00:00:00+00:00"

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/save_task",
            "task": updated_task,
        }
    )
    response = await client.receive_json()

    assert response["success"] is True

    stored_nfc = await store.async_load_nfc()

    assert len(stored_nfc["tag_mappings"]) == 1
    assert stored_nfc["tag_mappings"][0]["tag_id"] == "tag-phone-2"
    assert stored_nfc["tag_mappings"][0]["task_id"] == "task-bathroom"
    assert stored_nfc["tag_mappings"][0]["label"] == "Clean bathroom"


async def test_save_task_rejects_duplicate_nfc_tag_assignment(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks(
        {
            "tasks": [
                _task_payload(),
                {
                    "id": "task-kitchen",
                    "title": "Clean kitchen",
                    "description": "",
                    "recurrence": {
                        "frequency": "daily",
                        "days_of_week": [],
                        "interval_days": 1,
                        "day_of_month": None,
                    },
                    "skip_windows": [],
                    "assigned_profile_id": "profile-alice",
                    "nfc_tag_id": None,
                    "active": True,
                    "start_date": "2026-05-10",
                    "created_at": "2026-05-10T00:00:00+00:00",
                    "updated_at": "2026-05-10T00:00:00+00:00",
                },
            ]
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
    duplicate_tag_task = {
        "id": "task-kitchen",
        "title": "Clean kitchen",
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
        "updated_at": "2026-05-11T00:00:00+00:00",
    }

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/save_task",
            "task": duplicate_tag_task,
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "invalid_task"

    stored_tasks = await store.async_load_tasks()

    assert stored_tasks["tasks"][1]["nfc_tag_id"] is None


async def test_runtime_ignores_stale_persisted_nfc_mapping_on_setup(
    enable_custom_integrations,
    hass,
) -> None:
    store = TaskStore(hass)
    updated_task = _task_payload()
    updated_task["nfc_tag_id"] = "tag-phone-2"
    await store.async_save_tasks({"tasks": [updated_task]})
    await store.async_save_nfc(
        {
            "tag_mappings": [
                {
                    "id": "nfc-map-stale",
                    "tag_id": "tag-phone-1",
                    "task_id": "task-bathroom",
                    "label": "Stale bathroom tag",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ]
        }
    )

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    mapping_events = []
    hass.bus.async_listen(
        EVENT_NFC_TAG_MAPPING_REQUESTED,
        lambda event: mapping_events.append(event.data),
    )

    hass.bus.async_fire(
        EVENT_NFC_SCANNED,
        {
            "tag_id": "tag-phone-1",
            "actor_ha_user_id": "ha-alice",
            "source": "phone",
        },
    )
    await hass.async_block_till_done()

    assert mapping_events == [
        {
            "tag_id": "tag-phone-1",
            "actor_ha_user_id": "ha-alice",
            "source": "nfc_phone",
        }
    ]


async def test_concurrent_save_task_requests_are_serialized(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": []})

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    runtime_store = hass.data[DOMAIN][entry.entry_id]["store"]
    original_save_tasks = runtime_store.async_save_tasks
    active_saves = 0
    max_active_saves = 0

    async def tracked_save_tasks(data):
        nonlocal active_saves, max_active_saves
        active_saves += 1
        max_active_saves = max(max_active_saves, active_saves)
        try:
            await asyncio.sleep(0.05)
            await original_save_tasks(data)
        finally:
            active_saves -= 1

    runtime_store.async_save_tasks = tracked_save_tasks

    client_one = await hass_ws_client(hass)
    client_two = await hass_ws_client(hass)
    bathroom_task = _task_payload()
    kitchen_task = {
        "id": "task-kitchen",
        "title": "Clean kitchen",
        "description": "",
        "recurrence": {
            "frequency": "daily",
            "days_of_week": [],
            "interval_days": 1,
            "day_of_month": None,
        },
        "skip_windows": [],
        "assigned_profile_id": "profile-alice",
        "nfc_tag_id": "tag-phone-2",
        "active": True,
        "start_date": "2026-05-10",
        "created_at": "2026-05-10T00:00:00+00:00",
        "updated_at": "2026-05-10T00:00:00+00:00",
    }

    await asyncio.gather(
        client_one.send_json_auto_id(
            {"type": "ha_task_manager/save_task", "task": bathroom_task}
        ),
        client_two.send_json_auto_id(
            {"type": "ha_task_manager/save_task", "task": kitchen_task}
        ),
    )
    responses = await asyncio.gather(
        client_one.receive_json(),
        client_two.receive_json(),
    )

    assert responses[0]["success"] is True
    assert responses[1]["success"] is True
    assert max_active_saves == 1

    stored_tasks = await store.async_load_tasks()

    assert {task["id"] for task in stored_tasks["tasks"]} == {
        "task-bathroom",
        "task-kitchen",
    }
