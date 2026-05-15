import { describe, expect, it } from "vitest";

import {
  fetchHaUsers,
  fetchProfileMappings,
  fetchUnmappedNfcTags,
  importHaUser,
  linkNfcTag,
  type HomeAssistantConnection,
  type LinkNfcTagOptions
} from "./client";

function createConnection(): {
  hass: HomeAssistantConnection;
  sentMessages: Record<string, unknown>[];
} {
  const sentMessages: Record<string, unknown>[] = [];

  return {
    sentMessages,
    hass: {
      callWS: async <T>(message: Record<string, unknown>): Promise<T> => {
        sentMessages.push(message);
        return undefined as unknown as T;
      }
    }
  };
}

describe("client admin setup helpers", () => {
  it("keeps linkNfcTag request fields aligned with the backend contract", () => {
    const requestFields: Record<keyof LinkNfcTagOptions, true> = {
      tagId: true,
      taskId: true
    };

    expect(requestFields).toEqual({
      tagId: true,
      taskId: true
    });
  });

  it("sends the expected websocket payloads", async () => {
    const { hass, sentMessages } = createConnection();

    await fetchProfileMappings(hass);
    await fetchHaUsers(hass);
    await fetchUnmappedNfcTags(hass);
    await importHaUser(hass, { haUserId: "ha-user-123" });
    await linkNfcTag(hass, {
      tagId: "tag-abc123",
      taskId: "task-bathroom"
    });

    expect(sentMessages).toEqual([
      { type: "ha_task_manager/profile_mappings" },
      { type: "ha_task_manager/ha_users" },
      { type: "ha_task_manager/unmapped_nfc_tags" },
      {
        type: "ha_task_manager/import_ha_user",
        ha_user_id: "ha-user-123"
      },
      {
        type: "ha_task_manager/link_nfc_tag",
        tag_id: "tag-abc123",
        task_id: "task-bathroom"
      }
    ]);
  });
});