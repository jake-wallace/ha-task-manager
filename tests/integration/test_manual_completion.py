from __future__ import annotations

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_task_manager.const import DOMAIN
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
        "nfc_tag_id": None,
        "active": True,
        "start_date": "2026-05-10",
        "created_at": "2026-05-10T00:00:00+00:00",
        "updated_at": "2026-05-10T00:00:00+00:00",
    }


async def test_manual_completion_confirms_due_instance_for_authenticated_user(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
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
                    "ha_user_id": hass_admin_user.id,
                    "profile_id": "profile-alice",
                    "created_at": "2026-05-10T00:00:00+00:00",
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
            "type": "ha_task_manager/complete_due_instance",
            "due_instance_id": "task-bathroom:2026-05-10",
            "completed_at": "2026-05-10T09:30:00+00:00",
        }
    )
    response = await client.receive_json()

    assert response["success"] is True
    assert response["result"] == {
        "id": response["result"]["id"],
        "task_id": "task-bathroom",
        "due_instance_id": "task-bathroom:2026-05-10",
        "completed_at": "2026-05-10T09:30:00+00:00",
        "actor_ha_user_id": hass_admin_user.id,
        "actor_profile_id": "profile-alice",
        "source": "manual",
        "outcome": "confirmed",
        "blocked_reason": "",
    }

    assert await store.async_load_completions() == [response["result"]]


async def test_manual_completion_blocks_non_assigned_authenticated_user(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
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
                    "id": "mapping-bob",
                    "ha_user_id": hass_admin_user.id,
                    "profile_id": "profile-bob",
                    "created_at": "2026-05-10T00:00:00+00:00",
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
            "type": "ha_task_manager/complete_due_instance",
            "due_instance_id": "task-bathroom:2026-05-10",
            "completed_at": "2026-05-10T09:30:00+00:00",
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "complete_due_instance_failed"

    stored_history = await store.async_load_completions()

    assert stored_history == [
        {
            "id": stored_history[0]["id"],
            "task_id": "task-bathroom",
            "due_instance_id": "task-bathroom:2026-05-10",
            "completed_at": "2026-05-10T09:30:00+00:00",
            "actor_ha_user_id": hass_admin_user.id,
            "actor_profile_id": "profile-bob",
            "source": "manual",
            "outcome": "blocked_assignment",
            "blocked_reason": (
                "Task assigned to 'profile-alice'; attempted by 'profile-bob'."
            ),
        }
    ]


async def test_completing_one_off_task_archives_it(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    """Test that a one-off task is archived upon completion."""
    store = TaskStore(hass)
    await store.async_save_profiles(
        {
            "profiles": [
                {
                    "id": "profile_parent",
                    "display_name": "Parent",
                    "avatar_url": "",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
            "mappings": [
                {
                    "id": "mapping-parent",
                    "ha_user_id": hass_admin_user.id,
                    "profile_id": "profile_parent",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
        }
    )

    data = await store.async_load_tasks()
    tasks_list = data.get("tasks", [])
    task_id = "test-one-off-task"
    tasks_list.append(
        {
            "id": task_id,
            "title": "One-off chore",
            "active": True,
            "recurrence": {"frequency": "none", "days_of_week": [], "interval_days": 1, "day_of_month": None},
            "assigned_profile_id": "profile_parent",
            "start_date": "2026-05-20",
        }
    )
    await store.async_save_tasks({"tasks": tasks_list})
    due_instance_id = f"{task_id}:2026-05-20"

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/complete_due_instance",
            "due_instance_id": due_instance_id,
        }
    )
    response = await client.receive_json()
    assert response["success"]

    # Verify task was archived
    after_data = await store.async_load_tasks()
    archived_task = next(t for t in after_data["tasks"] if t["id"] == task_id)
    assert archived_task["active"] is False
