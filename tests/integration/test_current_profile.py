from __future__ import annotations

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_task_manager.const import DOMAIN
from custom_components.ha_task_manager.storage.store import TaskStore


async def test_first_setup_bootstraps_profiles_from_active_ha_users(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles({"profiles": [], "mappings": []})

    imported_user = await hass.auth.async_create_user("Sam")
    inactive_user = await hass.auth.async_create_user("Inactive")
    await hass.auth.async_deactivate_user(inactive_user)
    await hass.auth.async_create_system_user("Task Manager Scanner")

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ha_task_manager/current_profile"})
    response = await client.receive_json()

    assert response["success"] is True
    assert response["result"]["ha_user_id"] == hass_admin_user.id
    assert response["result"]["mapped"] is True

    stored_profiles = await store.async_load_profiles()
    profile_names = {
        profile["display_name"] for profile in stored_profiles["profiles"]
    }
    mapped_user_ids = {
        mapping["ha_user_id"] for mapping in stored_profiles["mappings"]
    }

    assert profile_names == {hass_admin_user.name, "Sam"}
    assert mapped_user_ids == {hass_admin_user.id, imported_user.id}
    assert inactive_user.id not in mapped_user_ids


async def test_current_profile_returns_mapping_for_authenticated_user(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles(
        {
            "profiles": [
                {
                    "id": "profile-alice",
                    "display_name": "Alice",
                    "avatar_url": "/alice.png",
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
    await client.send_json_auto_id({"type": "ha_task_manager/current_profile"})
    response = await client.receive_json()

    assert response["success"] is True
    assert response["result"] == {
        "ha_user_id": hass_admin_user.id,
        "mapped": True,
        "profile_id": "profile-alice",
        "display_name": "Alice",
        "avatar_url": "/alice.png",
    }


async def test_current_profile_returns_unmapped_state_when_no_mapping_exists(
    enable_custom_integrations,
    hass,
    hass_ws_client,
    hass_admin_user,
) -> None:
    store = TaskStore(hass)
    await store.async_save_profiles(
        {
            "profiles": [
                {
                    "id": "profile-sam",
                    "display_name": "Sam",
                    "avatar_url": "",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
            "mappings": [
                {
                    "id": "mapping-sam",
                    "ha_user_id": "ha-user-sam",
                    "profile_id": "profile-sam",
                    "created_at": "2026-05-10T00:00:00+00:00",
                }
            ],
        }
    )

    entry = MockConfigEntry(domain=DOMAIN, title="Task Manager")
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ha_task_manager/current_profile"})
    response = await client.receive_json()

    assert response["success"] is True
    assert response["result"] == {
        "ha_user_id": hass_admin_user.id,
        "mapped": False,
        "profile_id": None,
        "display_name": None,
        "avatar_url": None,
    }
