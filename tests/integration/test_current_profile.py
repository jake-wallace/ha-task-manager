from __future__ import annotations

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_task_manager.const import DOMAIN
from custom_components.ha_task_manager.storage.store import TaskStore


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
    await store.async_save_profiles({"profiles": [], "mappings": []})

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
