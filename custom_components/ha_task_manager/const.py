"""Constants for the HA Task Manager integration."""

DOMAIN = "ha_task_manager"
STORAGE_VERSION = 1

STORAGE_KEY_TASKS = f"{DOMAIN}_tasks"
STORAGE_KEY_COMPLETIONS = f"{DOMAIN}_completions"
STORAGE_KEY_PROFILES = f"{DOMAIN}_profiles"
STORAGE_KEY_NFC = f"{DOMAIN}_nfc"

EVENT_NFC_SCANNED = f"{DOMAIN}_nfc_scanned"
EVENT_COMPLETION_REQUESTED = f"{DOMAIN}_completion_requested"
EVENT_COMPLETION_RECORDED = f"{DOMAIN}_completion_recorded"
