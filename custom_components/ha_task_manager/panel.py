"""Panel registration helpers for HA Task Manager."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

STATIC_URL_BASE = "/ha_task_manager_static"
PANEL_MODULE = "ha-task-manager-panel.js"
PANEL_URL_PATH = "ha_task_manager"


def _panel_module_url() -> str:
    """Return panel module URL without event-loop file I/O."""
    return f"{STATIC_URL_BASE}/{PANEL_MODULE}"


async def async_register_task_manager_panel(hass: HomeAssistant) -> None:
    """Register the sidebar panel and static asset path."""
    if hass.http is None:
        return

    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL_BASE, str(frontend_dir), cache_headers=False)]
    )
    await panel_custom.async_register_panel(
        hass=hass,
        frontend_url_path=PANEL_URL_PATH,
        config_panel_domain="ha_task_manager",
        webcomponent_name="ha-task-manager-panel",
        sidebar_title="Home Tasks",
        sidebar_icon="mdi:checkbox-marked-circle",
        module_url=_panel_module_url(),
        embed_iframe=False,
        require_admin=False,
    )
