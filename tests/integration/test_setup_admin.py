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
        "assigned_profile_id": "",
        "nfc_tag_id": None,
        "active": True,
        "start_date": "2026-05-10",
        "created_at": "2026-05-10T00:00:00+00:00",
        "updated_at": "2026-05-10T00:00:00+00:00",
    }


def _second_task_payload() -> dict[str, object]:
    return {
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
        "assigned_profile_id": "",
        "nfc_tag_id": None,
        "active": True,
        "start_date": "2026-05-10",
        "created_at": "2026-05-10T00:00:00+00:00",
        "updated_at": "2026-05-10T00:00:00+00:00",
    }


async def test_startup_runtime_honors_task_level_nfc_tag_links(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    task = _task_payload()
    task["nfc_tag_id"] = "tag-task-level"
    await store.async_save_tasks({"tasks": [task]})
    await store.async_save_profiles({"profiles": [], "mappings": []})
    await store.async_save_nfc({"tag_mappings": [], "discovery_entries": []})

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    hass.bus.async_fire(
        EVENT_NFC_SCANNED,
        {
            "tag_id": "tag-task-level",
            "actor_ha_user_id": hass_admin_user.id,
            "source": "phone",
            "as_of": "2026-05-10",
        },
    )
    await hass.async_block_till_done()

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    pending_response = await client.receive_json()

    assert pending_response["success"] is True
    assert pending_response["result"][0]["task_id"] == "task-bathroom"
    assert pending_response["result"][0]["source"] == "nfc_phone"


async def test_admin_setup_commands_list_users_and_import_profile_mapping(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles({"profiles": [], "mappings": []})

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    new_user = await hass.auth.async_create_user("Sam")
    inactive_user = await hass.auth.async_create_user("Inactive")
    await hass.auth.async_deactivate_user(inactive_user)
    system_user = await hass.auth.async_create_system_user("Task Manager Scanner")

    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "ha_task_manager/ha_users"})
    users_response = await client.receive_json()

    assert users_response["success"] is True
    users_by_id = {
        ha_user["id"]: ha_user for ha_user in users_response["result"]
    }
    assert users_by_id[hass_admin_user.id]["name"] == hass_admin_user.name
    assert users_by_id[hass_admin_user.id]["is_admin"] is True
    assert users_by_id[new_user.id] == {
        "id": new_user.id,
        "name": "Sam",
        "is_active": True,
        "is_admin": False,
        "system_generated": False,
    }
    assert users_by_id[inactive_user.id]["is_active"] is False
    assert users_by_id[system_user.id]["system_generated"] is True

    await client.send_json_auto_id({"type": "ha_task_manager/profile_mappings"})
    mappings_before = await client.receive_json()

    assert mappings_before["success"] is True
    assert [mapping["ha_user_id"] for mapping in mappings_before["result"]] == [
        hass_admin_user.id
    ]

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/import_ha_user",
            "ha_user_id": new_user.id,
        }
    )
    import_response = await client.receive_json()

    assert import_response["success"] is True
    assert import_response["result"]["created"] is True
    assert import_response["result"]["ha_user"] == {
        "id": new_user.id,
        "name": "Sam",
        "is_active": True,
        "is_admin": False,
        "system_generated": False,
    }
    assert import_response["result"]["profile"]["display_name"] == "Sam"
    assert import_response["result"]["mapping"]["ha_user_id"] == new_user.id

    await client.send_json_auto_id({"type": "ha_task_manager/profile_mappings"})
    mappings_after = await client.receive_json()

    assert mappings_after["success"] is True
    assert {mapping["ha_user_id"] for mapping in mappings_after["result"]} == {
        hass_admin_user.id,
        new_user.id,
    }

    stored_profiles = await store.async_load_profiles()
    assert {mapping["ha_user_id"] for mapping in stored_profiles["mappings"]} == {
        hass_admin_user.id,
        new_user.id,
    }


async def test_non_admin_cannot_save_tasks_via_websocket(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_read_only_access_token,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": []})
    await store.async_save_profiles({"profiles": [], "mappings": []})

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass, access_token=hass_read_only_access_token)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/save_task",
            "task": _task_payload(),
        }
    )
    response = await client.receive_json()

    assert response["success"] is False

    stored_tasks = await store.async_load_tasks()
    assert stored_tasks["tasks"] == []


async def test_admin_setup_commands_list_unmapped_nfc_tags_and_link_them(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
    await store.async_save_profiles({"profiles": [], "mappings": []})
    await store.async_save_nfc({"tag_mappings": [], "discovery_entries": []})

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    hass.bus.async_fire(
        EVENT_NFC_SCANNED,
        {
            "tag_id": "tag-new",
            "actor_ha_user_id": hass_admin_user.id,
            "source": "phone",
            "as_of": "2026-05-10",
        },
    )
    await hass.async_block_till_done()

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ha_task_manager/unmapped_nfc_tags"})
    discoveries_response = await client.receive_json()

    assert discoveries_response["success"] is True
    assert [entry["tag_id"] for entry in discoveries_response["result"]] == [
        "tag-new"
    ]
    assert discoveries_response["result"][0]["last_source"] == "nfc_phone"

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/link_nfc_tag",
            "tag_id": "tag-new",
            "task_id": "task-bathroom",
        }
    )
    link_response = await client.receive_json()

    assert link_response["success"] is True
    assert link_response["result"]["tag_id"] == "tag-new"
    assert link_response["result"]["task_id"] == "task-bathroom"
    assert link_response["result"]["label"] == "Clean bathroom"

    stored_tasks = await store.async_load_tasks()
    assert stored_tasks["tasks"] == [
        {
            **_task_payload(),
            "nfc_tag_id": "tag-new",
            "updated_at": link_response["result"]["created_at"],
        }
    ]

    await client.send_json_auto_id({"type": "ha_task_manager/tasks"})
    tasks_response = await client.receive_json()

    assert tasks_response["success"] is True
    assert tasks_response["result"][0]["nfc_tag_id"] == "tag-new"

    await client.send_json_auto_id({"type": "ha_task_manager/unmapped_nfc_tags"})
    cleared_response = await client.receive_json()

    assert cleared_response["success"] is True
    assert cleared_response["result"] == []

    stored_nfc = await store.async_load_nfc()
    assert stored_nfc["tag_mappings"] == [
        {
            "id": link_response["result"]["id"],
            "tag_id": "tag-new",
            "task_id": "task-bathroom",
            "label": "Clean bathroom",
            "created_at": link_response["result"]["created_at"],
        }
    ]
    assert stored_nfc["discovery_entries"] == []

    hass.bus.async_fire(
        EVENT_NFC_SCANNED,
        {
            "tag_id": "tag-new",
            "actor_ha_user_id": hass_admin_user.id,
            "source": "phone",
            "as_of": "2026-05-10",
        },
    )
    await hass.async_block_till_done()

    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    pending_response = await client.receive_json()

    assert pending_response["success"] is True
    assert pending_response["result"][0]["task_id"] == "task-bathroom"


async def test_inactive_task_nfc_tags_do_not_create_pending_confirmations(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    inactive_task = _task_payload()
    inactive_task["active"] = False
    inactive_task["nfc_tag_id"] = "tag-inactive"
    await store.async_save_tasks({"tasks": [inactive_task]})
    await store.async_save_profiles({"profiles": [], "mappings": []})
    await store.async_save_nfc({"tag_mappings": [], "discovery_entries": []})

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    hass.bus.async_fire(
        EVENT_NFC_SCANNED,
        {
            "tag_id": "tag-inactive",
            "actor_ha_user_id": hass_admin_user.id,
            "source": "phone",
            "as_of": "2026-05-10",
        },
    )
    await hass.async_block_till_done()

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    pending_response = await client.receive_json()

    assert pending_response["success"] is True
    assert pending_response["result"] == []


async def test_save_task_prunes_matching_nfc_discovery_entries(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
    await store.async_save_profiles({"profiles": [], "mappings": []})
    await store.async_save_nfc(
        {
            "tag_mappings": [],
            "discovery_entries": [
                {
                    "tag_id": "tag-new",
                    "first_seen": "2026-05-10T00:00:00+00:00",
                    "last_seen": "2026-05-10T00:05:00+00:00",
                    "last_source": "nfc_phone",
                }
            ],
        }
    )

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/save_task",
            "task": {
                **_task_payload(),
                "nfc_tag_id": "tag-new",
            },
        }
    )
    response = await client.receive_json()

    assert response["success"] is True

    stored_nfc = await store.async_load_nfc()
    assert len(stored_nfc["tag_mappings"]) == 1
    assert stored_nfc["tag_mappings"][0]["tag_id"] == "tag-new"
    assert stored_nfc["tag_mappings"][0]["task_id"] == "task-bathroom"
    assert stored_nfc["tag_mappings"][0]["label"] == "Clean bathroom"
    assert (
        stored_nfc["tag_mappings"][0]["created_at"]
        == response["result"]["updated_at"]
    )
    assert stored_nfc["discovery_entries"] == []


async def test_link_nfc_tag_rejects_inactive_task_targets(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    inactive_task = _task_payload()
    inactive_task["active"] = False
    await store.async_save_tasks({"tasks": [inactive_task]})
    await store.async_save_profiles({"profiles": [], "mappings": []})
    await store.async_save_nfc({"tag_mappings": [], "discovery_entries": []})

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/link_nfc_tag",
            "tag_id": "tag-new",
            "task_id": "task-bathroom",
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "inactive_task"

    stored_tasks = await store.async_load_tasks()
    assert stored_tasks["tasks"] == [inactive_task]


async def test_link_nfc_tag_allows_reusing_tags_from_inactive_tasks(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    inactive_task = _task_payload()
    inactive_task["active"] = False
    inactive_task["nfc_tag_id"] = "tag-old"
    active_task = _second_task_payload()
    await store.async_save_tasks({"tasks": [inactive_task, active_task]})
    await store.async_save_profiles({"profiles": [], "mappings": []})
    await store.async_save_nfc({"tag_mappings": [], "discovery_entries": []})

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/link_nfc_tag",
            "tag_id": "tag-old",
            "task_id": "task-kitchen",
        }
    )
    response = await client.receive_json()

    assert response["success"] is True
    assert response["result"]["tag_id"] == "tag-old"
    assert response["result"]["task_id"] == "task-kitchen"

    stored_nfc = await store.async_load_nfc()
    assert stored_nfc["tag_mappings"] == [
        {
            "id": response["result"]["id"],
            "tag_id": "tag-old",
            "task_id": "task-kitchen",
            "label": "Clean kitchen",
            "created_at": response["result"]["created_at"],
        }
    ]


async def test_link_nfc_tag_ignores_stale_persisted_mapping_records(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload(), _second_task_payload()]})
    await store.async_save_profiles({"profiles": [], "mappings": []})
    await store.async_save_nfc(
        {
            "tag_mappings": [
                {
                    "id": "nfc-map-1",
                    "tag_id": "tag-existing",
                    "task_id": "task-bathroom",
                    "label": "Bathroom tag",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
            "discovery_entries": [],
        }
    )

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/link_nfc_tag",
            "tag_id": "tag-existing",
            "task_id": "task-kitchen",
        }
    )
    response = await client.receive_json()

    assert response["success"] is True
    assert response["result"]["tag_id"] == "tag-existing"
    assert response["result"]["task_id"] == "task-kitchen"

    stored_tasks = await store.async_load_tasks()
    assert stored_tasks["tasks"] == [
        _task_payload(),
        {
            **_second_task_payload(),
            "nfc_tag_id": "tag-existing",
            "updated_at": response["result"]["created_at"],
        },
    ]

    stored_nfc = await store.async_load_nfc()
    assert stored_nfc["tag_mappings"] == [
        {
            "id": response["result"]["id"],
            "tag_id": "tag-existing",
            "task_id": "task-kitchen",
            "label": "Clean kitchen",
            "created_at": response["result"]["created_at"],
        }
    ]