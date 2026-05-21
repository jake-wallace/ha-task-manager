import { afterEach, describe, expect, it } from "vitest";

import "./schedule-snapshot-view";
import type { ScheduleSnapshotView, SnapshotGroup } from "./schedule-snapshot-view";
import type { TaskDefinition, TaskDueInstance } from "../types/task";

function buildTask(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id: "task-default",
    title: "Default task",
    description: "",
    recurrence: {
      frequency: "weekly",
      days_of_week: [1],
      interval_days: 1,
      day_of_month: null,
    },
    skip_windows: [],
    assigned_profile_id: "profile-1",
    nfc_tag_id: null,
    active: true,
    start_date: "2026-05-10",
    created_at: "2026-05-10T00:00:00+00:00",
    updated_at: "2026-05-10T00:00:00+00:00",
    ...overrides,
  };
}

function buildDueInstance(overrides: Partial<TaskDueInstance> = {}): TaskDueInstance {
  return {
    id: "due-default",
    task_id: "task-default",
    due_date: "2026-05-20",
    skipped: false,
    ...overrides,
  };
}

function buildGroup(date: string, items: TaskDueInstance[]): SnapshotGroup {
  return {
    date,
    items,
  };
}

describe("task-manager-schedule-snapshot-view", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("groups snapshot entries by date", async () => {
    const element = document.createElement(
      "task-manager-schedule-snapshot-view"
    ) as ScheduleSnapshotView;

    element.tasksById = {
      "task-1": buildTask({ id: "task-1", title: "Kitchen counters" }),
      "task-2": buildTask({ id: "task-2", title: "Laundry" }),
      "task-3": buildTask({ id: "task-3", title: "Trash" }),
    };
    element.snapshotGroups = [
      buildGroup("2026-05-20", [
        buildDueInstance({ id: "due-1", task_id: "task-1", due_date: "2026-05-20" }),
        buildDueInstance({ id: "due-2", task_id: "task-2", due_date: "2026-05-20" }),
      ]),
      buildGroup("2026-05-21", [
        buildDueInstance({ id: "due-3", task_id: "task-3", due_date: "2026-05-21" }),
      ]),
    ];

    document.body.append(element);
    await element.updateComplete;

    const groups = Array.from(
      element.shadowRoot?.querySelectorAll("[data-snapshot-group]") ?? []
    ) as HTMLElement[];

    expect(groups.map((group) => group.dataset.snapshotGroup)).toEqual([
      "2026-05-20",
      "2026-05-21",
    ]);

    const firstGroupItems = Array.from(
      element.shadowRoot?.querySelectorAll(
        '[data-snapshot-group="2026-05-20"] [data-snapshot-item]'
      ) ?? []
    ) as HTMLElement[];
    const secondGroupItems = Array.from(
      element.shadowRoot?.querySelectorAll(
        '[data-snapshot-group="2026-05-21"] [data-snapshot-item]'
      ) ?? []
    ) as HTMLElement[];

    expect(firstGroupItems.map((item) => item.dataset.snapshotItem)).toEqual([
      "due-1",
      "due-2",
    ]);
    expect(secondGroupItems.map((item) => item.dataset.snapshotItem)).toEqual(["due-3"]);
  });

  it("emits edit-task-request from quick summary", async () => {
    const element = document.createElement(
      "task-manager-schedule-snapshot-view"
    ) as ScheduleSnapshotView;

    element.tasksById = {
      "task-1": buildTask({ id: "task-1", title: "Kitchen counters" }),
    };
    element.snapshotGroups = [
      buildGroup("2026-05-20", [
        buildDueInstance({ id: "due-1", task_id: "task-1", due_date: "2026-05-20" }),
      ]),
    ];

    const editEvents: CustomEvent[] = [];
    element.addEventListener("edit-task-request", (event) => {
      editEvents.push(event as CustomEvent);
    });

    document.body.append(element);
    await element.updateComplete;

    const snapshotItemButton = element.shadowRoot?.querySelector(
      '[data-snapshot-item="due-1"]'
    ) as HTMLButtonElement | null;
    snapshotItemButton?.click();
    await element.updateComplete;

    const summary = element.shadowRoot?.querySelector("[data-quick-summary]");
    expect(summary).not.toBeNull();

    const editButton = element.shadowRoot?.querySelector(
      "[data-edit-task-button]"
    ) as HTMLButtonElement | null;
    editButton?.click();

    expect(editEvents).toHaveLength(1);
    expect(editEvents[0].detail).toEqual({ taskId: "task-1" });
  });
});