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

    history = await store.async_load_completions()
    assert len(history) == 1
    assert history[0]["task_id"] == "task-bathroom"


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
