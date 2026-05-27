from __future__ import annotations

from datetime import UTC, datetime, timedelta

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_task_manager.const import DOMAIN, EVENT_NFC_SCANNED
from custom_components.ha_task_manager.storage.store import TaskStore


def _task_payload(*, nfc_tag_id: str | None = None) -> dict[str, object]:
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
        "nfc_tag_id": nfc_tag_id,
        "active": True,
        "start_date": "2026-05-10",
        "created_at": "2026-05-10T00:00:00+00:00",
        "updated_at": "2026-05-10T00:00:00+00:00",
    }


def _mapped_profiles_payload(admin_user_id: str) -> dict[str, object]:
    return {
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
                "ha_user_id": admin_user_id,
                "profile_id": "profile-alice",
                "created_at": "2026-05-10T00:00:00+00:00",
            }
        ],
    }


async def test_delete_task_definition_requires_exact_confirm_text(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-bathroom",
            "confirm_text": "DELETE",
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "invalid_confirm_text"


async def test_delete_task_definition_removes_task_and_preserves_history(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))
    await store.async_append_completion(
        {
            "id": "completion-1",
            "task_id": "task-bathroom",
            "due_instance_id": "task-bathroom:2026-05-10",
            "completed_at": "2026-05-10T09:30:00+00:00",
            "actor_ha_user_id": hass_admin_user.id,
            "actor_profile_id": "profile-alice",
            "source": "manual",
            "outcome": "confirmed",
            "blocked_reason": "",
        }
    )

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-bathroom",
            "confirm_text": "delete",
        }
    )
    delete_response = await client.receive_json()

    assert delete_response["success"] is True
    assert delete_response["result"]["task_id"] == "task-bathroom"
    assert delete_response["result"]["operation_id"]
    assert delete_response["result"]["undo_expires_at"]

    stored_tasks = await store.async_load_tasks()
    assert stored_tasks["tasks"] == []

    controls = await store.async_load_controls()
    assert controls["task_deletions"] == [
        {
            "id": delete_response["result"]["operation_id"],
            "task_snapshot": _task_payload(),
            "actor_ha_user_id": hass_admin_user.id,
            "deleted_at": controls["task_deletions"][0]["deleted_at"],
            "undo_expires_at": delete_response["result"]["undo_expires_at"],
            "status": "active",
        }
    ]

    history = await store.async_load_completions()
    assert len(history) == 1
    assert history[0]["task_id"] == "task-bathroom"


async def test_delete_task_definition_rejects_unknown_task_id(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-missing",
            "confirm_text": "delete",
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "task_not_found"


async def test_delete_task_definition_cancels_pending_confirmations_for_task(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    user_id = hass_admin_user.id
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload(nfc_tag_id="tag-phone-1")]})
    await store.async_save_profiles(_mapped_profiles_payload(user_id))
    await store.async_save_nfc({"tag_mappings": [], "discovery_entries": []})

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

    owner_client = await hass_ws_client(hass)
    await owner_client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    pending_before = await owner_client.receive_json()

    assert pending_before["success"] is True
    assert len(pending_before["result"]) == 1

    await owner_client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-bathroom",
            "confirm_text": "delete",
        }
    )
    delete_response = await owner_client.receive_json()

    assert delete_response["success"] is True

    await owner_client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    pending_after = await owner_client.receive_json()

    assert pending_after["success"] is True
    assert pending_after["result"] == []


async def test_undo_delete_task_definition_restores_snapshot_within_window(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-bathroom",
            "confirm_text": "delete",
        }
    )
    delete_response = await client.receive_json()

    assert delete_response["success"] is True
    operation_id = delete_response["result"]["operation_id"]

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_delete_task_definition",
            "operation_id": operation_id,
        }
    )
    undo_response = await client.receive_json()

    assert undo_response["success"] is True
    assert undo_response["result"]["operation_id"] == operation_id
    assert undo_response["result"]["status"] == "undone"
    assert undo_response["result"]["task"]["id"] == "task-bathroom"

    stored_tasks = await store.async_load_tasks()
    assert stored_tasks["tasks"] == [_task_payload()]

    controls = await store.async_load_controls()
    assert controls["task_deletions"] == [
        {
            "id": operation_id,
            "task_snapshot": _task_payload(),
            "actor_ha_user_id": hass_admin_user.id,
            "deleted_at": controls["task_deletions"][0]["deleted_at"],
            "undo_expires_at": controls["task_deletions"][0]["undo_expires_at"],
            "status": "undone",
        }
    ]


async def test_undo_delete_task_definition_rejects_unknown_operation(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_delete_task_definition",
            "operation_id": "missing-operation",
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "operation_not_found"


async def test_undo_delete_task_definition_rejects_already_undone_operation(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-bathroom",
            "confirm_text": "delete",
        }
    )
    delete_response = await client.receive_json()
    operation_id = delete_response["result"]["operation_id"]

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_delete_task_definition",
            "operation_id": operation_id,
        }
    )
    first_undo_response = await client.receive_json()
    assert first_undo_response["success"] is True

    controls_after_first_undo = await store.async_load_controls()
    assert controls_after_first_undo["task_deletions"] == [
        {
            "id": operation_id,
            "task_snapshot": _task_payload(),
            "actor_ha_user_id": hass_admin_user.id,
            "deleted_at": controls_after_first_undo["task_deletions"][0]["deleted_at"],
            "undo_expires_at": controls_after_first_undo["task_deletions"][0]["undo_expires_at"],
            "status": "undone",
        }
    ]

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_delete_task_definition",
            "operation_id": operation_id,
        }
    )
    second_undo_response = await client.receive_json()

    assert second_undo_response["success"] is False
    assert second_undo_response["error"]["code"] == "operation_not_reversible"

    controls_after_second_undo = await store.async_load_controls()
    assert controls_after_second_undo["task_deletions"] == [
        {
            "id": operation_id,
            "task_snapshot": _task_payload(),
            "actor_ha_user_id": hass_admin_user.id,
            "deleted_at": controls_after_second_undo["task_deletions"][0]["deleted_at"],
            "undo_expires_at": controls_after_second_undo["task_deletions"][0]["undo_expires_at"],
            "status": "undone",
        }
    ]


async def test_undo_delete_task_definition_rejects_expired_operation(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-bathroom",
            "confirm_text": "delete",
        }
    )
    delete_response = await client.receive_json()

    assert delete_response["success"] is True
    operation_id = delete_response["result"]["operation_id"]

    controls = await store.async_load_controls()
    for record in controls["task_deletions"]:
        if record.get("id") == operation_id:
            record["undo_expires_at"] = (
                datetime.now(UTC) - timedelta(minutes=1)
            ).isoformat()
    await store.async_save_controls({"task_deletions": controls["task_deletions"]})

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_delete_task_definition",
            "operation_id": operation_id,
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "undo_window_expired"

    updated_controls = await store.async_load_controls()
    assert updated_controls["task_deletions"] == [
        {
            "id": operation_id,
            "task_snapshot": _task_payload(),
            "actor_ha_user_id": hass_admin_user.id,
            "deleted_at": updated_controls["task_deletions"][0]["deleted_at"],
            "undo_expires_at": controls["task_deletions"][0]["undo_expires_at"],
            "status": "expired",
        }
    ]


async def test_delete_task_definition_rolls_back_when_controls_write_fails(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload(nfc_tag_id="tag-phone-1")]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))
    await store.async_save_nfc(
        {
            "tag_mappings": [
                {
                    "id": "mapping-1",
                    "tag_id": "tag-phone-1",
                    "task_id": "task-bathroom",
                    "label": "Bathroom",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
            "discovery_entries": [],
        }
    )

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    runtime_store = hass.data[DOMAIN][entry.entry_id]["store"]
    original_save_controls = runtime_store.async_save_controls
    failure_emitted = False

    async def fail_once_save_controls(data):
        nonlocal failure_emitted
        if not failure_emitted:
            failure_emitted = True
            raise RuntimeError("simulated controls write failure")
        await original_save_controls(data)

    runtime_store.async_save_controls = fail_once_save_controls

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-bathroom",
            "confirm_text": "delete",
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "delete_task_failed"

    stored_tasks = await store.async_load_tasks()
    assert stored_tasks["tasks"] == [_task_payload(nfc_tag_id="tag-phone-1")]

    controls = await store.async_load_controls()
    assert controls["task_deletions"] == []

    nfc_payload = await store.async_load_nfc()
    assert nfc_payload["tag_mappings"] == [
        {
            "id": "mapping-1",
            "tag_id": "tag-phone-1",
            "task_id": "task-bathroom",
            "label": "Bathroom",
            "created_at": "2026-05-10T00:00:00+00:00",
        }
    ]


async def test_undo_delete_task_definition_rolls_back_when_controls_write_fails(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload(nfc_tag_id="tag-phone-1")]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-bathroom",
            "confirm_text": "delete",
        }
    )
    delete_response = await client.receive_json()
    assert delete_response["success"] is True
    operation_id = delete_response["result"]["operation_id"]

    runtime_store = hass.data[DOMAIN][entry.entry_id]["store"]
    original_save_controls = runtime_store.async_save_controls
    failure_emitted = False

    async def fail_once_save_controls(data):
        nonlocal failure_emitted
        if not failure_emitted:
            failure_emitted = True
            raise RuntimeError("simulated controls write failure")
        await original_save_controls(data)

    runtime_store.async_save_controls = fail_once_save_controls

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_delete_task_definition",
            "operation_id": operation_id,
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "undo_delete_task_failed"

    stored_tasks = await store.async_load_tasks()
    assert stored_tasks["tasks"] == []

    controls = await store.async_load_controls()
    assert controls["task_deletions"] == [
        {
            "id": operation_id,
            "task_snapshot": _task_payload(nfc_tag_id="tag-phone-1"),
            "actor_ha_user_id": hass_admin_user.id,
            "deleted_at": controls["task_deletions"][0]["deleted_at"],
            "undo_expires_at": controls["task_deletions"][0]["undo_expires_at"],
            "status": "active",
        }
    ]


async def test_undo_delete_task_definition_rejects_nfc_conflict_on_restore(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload(nfc_tag_id="tag-phone-1")]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-bathroom",
            "confirm_text": "delete",
        }
    )
    delete_response = await client.receive_json()
    assert delete_response["success"] is True
    operation_id = delete_response["result"]["operation_id"]

    await store.async_save_tasks(
        {
            "tasks": [
                {
                    **_task_payload(nfc_tag_id="tag-phone-1"),
                    "id": "task-kitchen",
                    "title": "Clean kitchen",
                }
            ]
        }
    )

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_delete_task_definition",
            "operation_id": operation_id,
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "invalid_task"

    stored_tasks = await store.async_load_tasks()
    assert stored_tasks["tasks"] == [
        {
            **_task_payload(nfc_tag_id="tag-phone-1"),
            "id": "task-kitchen",
            "title": "Clean kitchen",
        }
    ]

    controls = await store.async_load_controls()
    assert controls["task_deletions"] == [
        {
            "id": operation_id,
            "task_snapshot": _task_payload(nfc_tag_id="tag-phone-1"),
            "actor_ha_user_id": hass_admin_user.id,
            "deleted_at": controls["task_deletions"][0]["deleted_at"],
            "undo_expires_at": controls["task_deletions"][0]["undo_expires_at"],
            "status": "active",
        }
    ]


async def test_delete_task_definition_requires_mapped_user(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
    hass_read_only_access_token,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks({"tasks": [_task_payload()]})
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    unmapped_client = await hass_ws_client(hass, access_token=hass_read_only_access_token)
    await unmapped_client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-bathroom",
            "confirm_text": "delete",
        }
    )
    response = await unmapped_client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "mapping_required"


async def test_reset_analytics_baseline_and_undo_within_window(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/reset_analytics_baseline",
            "confirm_text": "delete",
        }
    )
    reset_response = await client.receive_json()

    assert reset_response["success"] is True
    operation_id = reset_response["result"]["operation_id"]

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_analytics_baseline_reset",
            "operation_id": operation_id,
        }
    )
    undo_response = await client.receive_json()

    assert undo_response["success"] is True
    assert undo_response["result"] == {
        "operation_id": operation_id,
        "restored_baseline_at": None,
        "status": "undone",
    }

    controls = await store.async_load_controls()
    assert controls["analytics_baseline_state"] == {
        "effective_baseline_at": None,
    }
    assert controls["analytics_baseline_resets"] == [
        {
            "id": operation_id,
            "previous_baseline_at": None,
            "new_baseline_at": controls["analytics_baseline_resets"][0]["new_baseline_at"],
            "actor_ha_user_id": hass_admin_user.id,
            "reset_at": controls["analytics_baseline_resets"][0]["reset_at"],
            "undo_expires_at": controls["analytics_baseline_resets"][0][
                "undo_expires_at"
            ],
            "status": "undone",
        }
    ]


async def test_reset_analytics_baseline_requires_mapped_user(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
    hass_read_only_access_token,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    unmapped_client = await hass_ws_client(hass, access_token=hass_read_only_access_token)
    await unmapped_client.send_json_auto_id(
        {
            "type": "ha_task_manager/reset_analytics_baseline",
            "confirm_text": "delete",
        }
    )
    response = await unmapped_client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "mapping_required"


async def test_reset_analytics_baseline_requires_exact_confirm_text(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/reset_analytics_baseline",
            "confirm_text": "DELETE",
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "invalid_confirm_text"


async def test_undo_analytics_baseline_reset_rejects_unknown_operation(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_analytics_baseline_reset",
            "operation_id": "missing-operation",
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "operation_not_found"


async def test_undo_analytics_baseline_reset_rejects_already_undone_operation(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/reset_analytics_baseline",
            "confirm_text": "delete",
        }
    )
    reset_response = await client.receive_json()
    operation_id = reset_response["result"]["operation_id"]

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_analytics_baseline_reset",
            "operation_id": operation_id,
        }
    )
    first_undo_response = await client.receive_json()
    assert first_undo_response["success"] is True

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_analytics_baseline_reset",
            "operation_id": operation_id,
        }
    )
    second_undo_response = await client.receive_json()

    assert second_undo_response["success"] is False
    assert second_undo_response["error"]["code"] == "operation_not_reversible"


async def test_undo_analytics_baseline_reset_rejects_expired_operation(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/reset_analytics_baseline",
            "confirm_text": "delete",
        }
    )
    reset_response = await client.receive_json()
    operation_id = reset_response["result"]["operation_id"]

    controls = await store.async_load_controls()
    for record in controls["analytics_baseline_resets"]:
        if record.get("id") == operation_id:
            record["undo_expires_at"] = (
                datetime.now(UTC) - timedelta(minutes=1)
            ).isoformat()
    await store.async_save_controls(
        {
            "analytics_baseline_resets": controls["analytics_baseline_resets"],
        }
    )

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_analytics_baseline_reset",
            "operation_id": operation_id,
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "undo_window_expired"

    updated_controls = await store.async_load_controls()
    assert updated_controls["analytics_baseline_resets"] == [
        {
            "id": operation_id,
            "previous_baseline_at": None,
            "new_baseline_at": updated_controls["analytics_baseline_resets"][0][
                "new_baseline_at"
            ],
            "actor_ha_user_id": hass_admin_user.id,
            "reset_at": updated_controls["analytics_baseline_resets"][0]["reset_at"],
            "undo_expires_at": controls["analytics_baseline_resets"][0][
                "undo_expires_at"
            ],
            "status": "expired",
        }
    ]


async def test_reset_analytics_baseline_returns_reset_analytics_failed_on_storage_error(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    runtime_store = hass.data[DOMAIN][entry.entry_id]["store"]
    original_save_controls = runtime_store.async_save_controls
    failure_emitted = False

    async def fail_once_save_controls(data):
        nonlocal failure_emitted
        if not failure_emitted:
            failure_emitted = True
            raise RuntimeError("simulated controls write failure")
        await original_save_controls(data)

    runtime_store.async_save_controls = fail_once_save_controls

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/reset_analytics_baseline",
            "confirm_text": "delete",
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "reset_analytics_failed"

    controls = await store.async_load_controls()
    assert controls["analytics_baseline_state"] == {"effective_baseline_at": None}
    assert controls["analytics_baseline_resets"] == []


async def test_undo_analytics_baseline_reset_returns_undo_reset_analytics_failed_on_storage_error(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles(_mapped_profiles_payload(hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/reset_analytics_baseline",
            "confirm_text": "delete",
        }
    )
    reset_response = await client.receive_json()
    assert reset_response["success"] is True
    operation_id = reset_response["result"]["operation_id"]

    runtime_store = hass.data[DOMAIN][entry.entry_id]["store"]
    original_save_controls = runtime_store.async_save_controls
    failure_emitted = False

    async def fail_once_save_controls(data):
        nonlocal failure_emitted
        if not failure_emitted:
            failure_emitted = True
            raise RuntimeError("simulated controls write failure")
        await original_save_controls(data)

    runtime_store.async_save_controls = fail_once_save_controls

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_analytics_baseline_reset",
            "operation_id": operation_id,
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "undo_reset_analytics_failed"

    controls = await store.async_load_controls()
    assert controls["analytics_baseline_state"]["effective_baseline_at"] is not None
    assert controls["analytics_baseline_resets"] == [
        {
            "id": operation_id,
            "previous_baseline_at": None,
            "new_baseline_at": controls["analytics_baseline_resets"][0][
                "new_baseline_at"
            ],
            "actor_ha_user_id": hass_admin_user.id,
            "reset_at": controls["analytics_baseline_resets"][0]["reset_at"],
            "undo_expires_at": controls["analytics_baseline_resets"][0][
                "undo_expires_at"
            ],
            "status": "active",
        }
    ]
