from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from custom_components.ha_task_manager import panel


async def test_register_panel_exposes_existing_module_url() -> None:
    static_paths = AsyncMock()
    hass = SimpleNamespace(
        http=SimpleNamespace(async_register_static_paths=static_paths)
    )

    with patch(
        "custom_components.ha_task_manager.panel.panel_custom.async_register_panel",
        new=AsyncMock(),
    ) as register_panel:
        await panel.async_register_task_manager_panel(hass)

    static_paths.assert_awaited_once()
    static_path = static_paths.await_args.args[0][0]
    assert static_path.url_path == panel.STATIC_URL_BASE
    assert Path(static_path.path, panel.PANEL_MODULE).exists()

    register_panel.assert_awaited_once()
    assert register_panel.await_args.kwargs["module_url"] == (
        f"{panel.STATIC_URL_BASE}/{panel.PANEL_MODULE}"
    )
    assert register_panel.await_args.kwargs["sidebar_title"] == "Home Tasks"


async def test_register_panel_does_not_read_manifest_in_event_loop() -> None:
    static_paths = AsyncMock()
    hass = SimpleNamespace(
        http=SimpleNamespace(async_register_static_paths=static_paths)
    )

    with patch(
        "custom_components.ha_task_manager.panel.Path.read_text",
        side_effect=AssertionError("manifest read should not happen during panel setup"),
    ), patch(
        "custom_components.ha_task_manager.panel.panel_custom.async_register_panel",
        new=AsyncMock(),
    ):
        await panel.async_register_task_manager_panel(hass)
