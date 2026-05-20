import { describe, expect, it } from "vitest";

import {
  archiveTask,
  fetchDueInstances,
  restoreTask,
  type ArchiveTaskOptions,
  type HomeAssistantConnection
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

describe("client archive and snapshot helpers", () => {
  it("keeps archive/restore request fields aligned with the backend contract", () => {
    const requestFields: Record<keyof ArchiveTaskOptions, true> = {
      taskId: true
    };

    expect(requestFields).toEqual({
      taskId: true
    });
  });

  it("sends archive and restore websocket payloads with task_id", async () => {
    const { hass, sentMessages } = createConnection();

    await archiveTask(hass, { taskId: "task-kitchen" });
    await restoreTask(hass, { taskId: "task-kitchen" });

    expect(sentMessages).toEqual([
      {
        type: "ha_task_manager/archive_task",
        task_id: "task-kitchen"
      },
      {
        type: "ha_task_manager/restore_task",
        task_id: "task-kitchen"
      }
    ]);
  });

  it("sends to_date together with from_date for due-instance snapshot queries", async () => {
    const { hass, sentMessages } = createConnection();

    await fetchDueInstances(hass, {
      fromDate: "2026-05-01",
      toDate: "2026-05-31"
    });

    expect(sentMessages).toEqual([
      {
        type: "ha_task_manager/due_instances",
        from_date: "2026-05-01",
        to_date: "2026-05-31"
      }
    ]);
  });
});
