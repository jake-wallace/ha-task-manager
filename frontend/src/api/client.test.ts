import { describe, expect, it } from "vitest";

import {
  archiveTask,
  deleteTaskDefinition,
  fetchAnalytics,
  fetchHaUsers,
  fetchDueInstances,
  fetchProfileMappings,
  fetchUnmappedNfcTags,
  importHaUser,
  linkNfcTag,
  resetAnalyticsBaseline,
  restoreTask,
  undoAnalyticsBaselineReset,
  undoDeleteTaskDefinition,
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

  it("sends archive and restore task requests with task ids", async () => {
    const { hass, sentMessages } = createConnection();

    await archiveTask(hass, { taskId: "task-bathroom" });
    await restoreTask(hass, { taskId: "task-bathroom" });

    expect(sentMessages).toEqual([
      {
        type: "ha_task_manager/archive_task",
        task_id: "task-bathroom"
      },
      {
        type: "ha_task_manager/restore_task",
        task_id: "task-bathroom"
      }
    ]);
  });

  it("includes to_date in due instances snapshot range queries", async () => {
    const { hass, sentMessages } = createConnection();

    await fetchDueInstances(hass, {
      fromDate: "2026-05-10",
      toDate: "2026-05-12"
    });

    expect(sentMessages).toEqual([
      {
        type: "ha_task_manager/due_instances",
        from_date: "2026-05-10",
        to_date: "2026-05-12"
      }
    ]);
  });

  it("maps delete_task_definition payload fields", async () => {
    const { hass, sentMessages } = createConnection();

    await deleteTaskDefinition(hass, {
      taskId: "task-bathroom",
      confirmText: "delete"
    });

    expect(sentMessages).toEqual([
      {
        type: "ha_task_manager/delete_task_definition",
        task_id: "task-bathroom",
        confirm_text: "delete"
      }
    ]);
  });

  it("maps undo_delete_task_definition payload fields", async () => {
    const { hass, sentMessages } = createConnection();

    await undoDeleteTaskDefinition(hass, {
      operationId: "operation-delete-1"
    });

    expect(sentMessages).toEqual([
      {
        type: "ha_task_manager/undo_delete_task_definition",
        operation_id: "operation-delete-1"
      }
    ]);
  });

  it("maps reset_analytics_baseline payload fields", async () => {
    const { hass, sentMessages } = createConnection();

    await resetAnalyticsBaseline(hass, {
      confirmText: "reset"
    });

    expect(sentMessages).toEqual([
      {
        type: "ha_task_manager/reset_analytics_baseline",
        confirm_text: "reset"
      }
    ]);
  });

  it("maps undo_analytics_baseline_reset payload fields", async () => {
    const { hass, sentMessages } = createConnection();

    await undoAnalyticsBaselineReset(hass, {
      operationId: "operation-baseline-1"
    });

    expect(sentMessages).toEqual([
      {
        type: "ha_task_manager/undo_analytics_baseline_reset",
        operation_id: "operation-baseline-1"
      }
    ]);
  });

  it("propagates include_deleted_task_history in analytics queries, including false", async () => {
    const { hass, sentMessages } = createConnection();

    await fetchAnalytics(hass, {
      profileId: "profile-123",
      includeDeletedTaskHistory: false
    });

    await fetchAnalytics(hass, {
      profileId: "profile-123",
      includeDeletedTaskHistory: true
    });

    expect(sentMessages).toEqual([
      {
        type: "ha_task_manager/analytics",
        profile_id: "profile-123",
        include_deleted_task_history: false
      },
      {
        type: "ha_task_manager/analytics",
        profile_id: "profile-123",
        include_deleted_task_history: true
      }
    ]);
  });
});