from __future__ import annotations

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_task_manager.const import DOMAIN
from custom_components.ha_task_manager.storage.store import TaskStore


async def _seed_analytics_store(store: TaskStore) -> None:
    await store.async_save_tasks(
        {
            "tasks": [
                {
                    "id": "task-dishes",
                    "title": "Wash dishes",
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
                {
                    "id": "task-vacuum",
                    "title": "Vacuum",
                    "description": "",
                    "recurrence": {
                        "frequency": "daily",
                        "days_of_week": [],
                        "interval_days": 1,
                        "day_of_month": None,
                    },
                    "skip_windows": [],
                    "assigned_profile_id": "profile-bob",
                    "nfc_tag_id": None,
                    "active": True,
                    "start_date": "2026-05-10",
                    "created_at": "2026-05-10T00:00:00+00:00",
                    "updated_at": "2026-05-10T00:00:00+00:00",
                },
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
                    "ha_user_id": "ha-alice",
                    "profile_id": "profile-alice",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
        }
    )
    await store.async_append_completion(
        {
            "id": "completion-1",
            "task_id": "task-dishes",
            "due_instance_id": "task-dishes:2026-05-10",
            "completed_at": "2026-05-10T08:00:00+00:00",
            "actor_ha_user_id": "ha-alice",
            "actor_profile_id": "profile-alice",
            "source": "manual",
            "outcome": "confirmed",
            "blocked_reason": "",
        }
    )
    await store.async_append_completion(
        {
            "id": "completion-2",
            "task_id": "task-dishes",
            "due_instance_id": "task-dishes:2026-05-11",
            "completed_at": "2026-05-12T08:00:00+00:00",
            "actor_ha_user_id": "ha-alice",
            "actor_profile_id": "profile-alice",
            "source": "manual",
            "outcome": "confirmed",
            "blocked_reason": "",
        }
    )
    await store.async_append_completion(
        {
            "id": "completion-3",
            "task_id": "task-vacuum",
            "due_instance_id": "task-vacuum:2026-05-10",
            "completed_at": "2026-05-10T09:00:00+00:00",
            "actor_ha_user_id": "ha-bob",
            "actor_profile_id": "profile-bob",
            "source": "manual",
            "outcome": "confirmed",
            "blocked_reason": "",
        }
    )


def _profiles_payload(*, mapped_ha_user_id: str) -> dict[str, object]:
    return {
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
                "ha_user_id": mapped_ha_user_id,
                "profile_id": "profile-alice",
                "created_at": "2026-05-10T00:00:00+00:00",
            }
        ],
    }


async def test_analytics_loading_returns_profile_scoped_snapshot(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await _seed_analytics_store(store)

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/analytics",
            "profile_id": "profile-alice",
            "as_of": "2026-05-13",
            "horizon_days": 4,
        }
    )
    response = await client.receive_json()

    assert response["success"] is True
    assert response["result"] == {
        "profile_id": "profile-alice",
        "computed_at": response["result"]["computed_at"],
        "daily_completions": [
            {"date": "2026-05-10", "count": 1},
            {"date": "2026-05-12", "count": 1},
        ],
        "on_time_count": 1,
        "late_count": 1,
        "missed_count": 1,
        "current_streak": 1,
        "longest_streak": 1,
    }


async def test_due_instances_rejects_invalid_from_date(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await _seed_analytics_store(store)

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/due_instances",
            "from_date": "not-a-date",
            "horizon_days": 7,
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "invalid_from_date"


async def test_analytics_rejects_invalid_as_of(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await _seed_analytics_store(store)

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/analytics",
            "profile_id": "profile-alice",
            "as_of": "not-a-date",
            "horizon_days": 4,
        }
    )
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "invalid_as_of"


async def test_websocket_returns_clean_error_after_unload(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)
    assert await hass.config_entries.async_unload(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ha_task_manager/pending_confirmations"})
    response = await client.receive_json()

    assert response["success"] is False
    assert response["error"]["code"] == "integration_unavailable"


async def test_profiles_returns_profile_list_contract(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
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

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ha_task_manager/profiles"})
    response = await client.receive_json()

    assert response["success"] is True
    assert response["result"] == [
        {
            "id": "profile-alice",
            "display_name": "Alice",
            "avatar_url": "",
            "created_at": "2026-05-10T00:00:00+00:00",
        }
    ]


async def test_analytics_keeps_historical_kpis_for_paused_tasks(
    enable_custom_integrations,
    hass,
    hass_ws_client,
) -> None:
    store = TaskStore(hass)
    await store.async_save_tasks(
        {
            "tasks": [
                {
                    "id": "task-dishes",
                    "title": "Wash dishes",
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
                    "active": False,
                    "start_date": "2026-05-10",
                    "created_at": "2026-05-10T00:00:00+00:00",
                    "updated_at": "2026-05-14T00:00:00+00:00",
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
                    "ha_user_id": "ha-alice",
                    "profile_id": "profile-alice",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
        }
    )
    await store.async_append_completion(
        {
            "id": "completion-1",
            "task_id": "task-dishes",
            "due_instance_id": "task-dishes:2026-05-10",
            "completed_at": "2026-05-10T08:00:00+00:00",
            "actor_ha_user_id": "ha-alice",
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
            "type": "ha_task_manager/analytics",
            "profile_id": "profile-alice",
            "as_of": "2026-05-13",
            "horizon_days": 4,
        }
    )
    response = await client.receive_json()

    assert response["success"] is True
    assert response["result"]["on_time_count"] == 1
    assert response["result"]["late_count"] == 0
    assert response["result"]["missed_count"] == 2


async def test_analytics_excludes_deleted_history_when_flag_off(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await _seed_analytics_store(store)
    await store.async_save_profiles(_profiles_payload(mapped_ha_user_id=hass_admin_user.id))

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/delete_task_definition",
            "task_id": "task-dishes",
            "confirm_text": "delete",
        }
    )
    delete_response = await client.receive_json()
    assert delete_response["success"] is True

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/analytics",
            "profile_id": "profile-alice",
            "as_of": "2026-05-13",
            "horizon_days": 14,
            "include_deleted_task_history": False,
        }
    )
    analytics_response = await client.receive_json()

    assert analytics_response["success"] is True
    assert analytics_response["result"]["on_time_count"] == 0
    assert analytics_response["result"]["late_count"] == 0


async def test_analytics_reflects_persisted_baseline_after_reset_and_undo(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await _seed_analytics_store(store)
    await store.async_save_profiles(_profiles_payload(mapped_ha_user_id=hass_admin_user.id))

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
    as_of = reset_response["result"]["new_baseline_at"][:10]

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/analytics",
            "profile_id": "profile-alice",
            "as_of": as_of,
            "horizon_days": 4,
        }
    )
    analytics_after_reset = await client.receive_json()

    assert analytics_after_reset["success"] is True
    assert analytics_after_reset["result"]["on_time_count"] == 0
    assert analytics_after_reset["result"]["late_count"] == 0
    assert analytics_after_reset["result"]["missed_count"] == 0

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/undo_analytics_baseline_reset",
            "operation_id": operation_id,
        }
    )
    undo_response = await client.receive_json()

    assert undo_response["success"] is True

    await client.send_json_auto_id(
        {
            "type": "ha_task_manager/analytics",
            "profile_id": "profile-alice",
            "as_of": as_of,
            "horizon_days": 4,
        }
    )
    analytics_after_undo = await client.receive_json()

    assert analytics_after_undo["success"] is True
    assert analytics_after_undo["result"]["missed_count"] == 3
