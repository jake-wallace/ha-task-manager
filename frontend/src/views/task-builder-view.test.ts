import { afterEach, describe, expect, it, vi } from "vitest";

import "./task-builder-view";
import type { TaskBuilderView } from "./task-builder-view";
import type { TaskDefinition } from "../types/task";

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

describe("task-manager-task-builder-view", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resets the new-task draft when the admin context changes", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView & {
      draftContextKey?: string;
    };

    element.draftContextKey = "ha-user-1:admin";
    element.profiles = [
      {
        id: "profile-1",
        display_name: "Alex Profile",
        avatar_url: "",
        created_at: "2026-05-10T00:00:00+00:00",
      },
      {
        id: "profile-2",
        display_name: "Jordan Profile",
        avatar_url: "",
        created_at: "2026-05-10T00:00:00+00:00",
      },
    ];
    element.unmappedTags = [
      {
        tag_id: "tag-front-door",
        first_seen: "2026-05-14T08:00:00+00:00",
        last_seen: "2026-05-14T08:05:00+00:00",
        last_source: "nfc_phone",
      },
    ];

    document.body.append(element);
    await element.updateComplete;

    const assigneeSelect = element.shadowRoot?.querySelector(
      "[data-assignee-select]"
    ) as HTMLSelectElement | null;
    const nfcTagSelect = element.shadowRoot?.querySelector(
      "[data-nfc-tag-select]"
    ) as HTMLSelectElement | null;

    assigneeSelect!.value = "profile-2";
    assigneeSelect!.dispatchEvent(new Event("change"));
    nfcTagSelect!.value = "tag-front-door";
    nfcTagSelect!.dispatchEvent(new Event("change"));
    await element.updateComplete;

    expect(assigneeSelect?.value).toBe("profile-2");
    expect(nfcTagSelect?.value).toBe("tag-front-door");

    element.profiles = [
      {
        id: "profile-3",
        display_name: "Casey Profile",
        avatar_url: "",
        created_at: "2026-05-10T00:00:00+00:00",
      },
    ];
    element.unmappedTags = [
      {
        tag_id: "tag-laundry-room",
        first_seen: "2026-05-14T09:00:00+00:00",
        last_seen: "2026-05-14T09:10:00+00:00",
        last_source: "nfc_reader",
      },
    ];
    element.draftContextKey = "ha-user-2:admin";
    await element.updateComplete;

    const refreshedAssigneeSelect = element.shadowRoot?.querySelector(
      "[data-assignee-select]"
    ) as HTMLSelectElement | null;
    const refreshedNfcTagSelect = element.shadowRoot?.querySelector(
      "[data-nfc-tag-select]"
    ) as HTMLSelectElement | null;

    expect(refreshedAssigneeSelect?.value).toBe("profile-3");
    expect(refreshedNfcTagSelect?.value).toBe("");
  });

  it("re-applies same handoff task id after draft context switches", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView & {
      draftContextKey?: string;
      handoffTaskId?: string;
    };

    element.draftContextKey = "ha-user-1:admin";
    element.tasks = [
      buildTask({
        id: "task-1",
        title: "Laundry (Alex)",
        assigned_profile_id: "profile-1",
      }),
    ];

    document.body.append(element);
    await element.updateComplete;

    element.handoffTaskId = "task-1";
    await element.updateComplete;

    const initialTitleInput = element.shadowRoot?.querySelector("input[required]") as
      | HTMLInputElement
      | null;
    expect(initialTitleInput?.value).toBe("Laundry (Alex)");

    element.handoffTaskId = "";
    element.tasks = [
      buildTask({
        id: "task-1",
        title: "Laundry (Jordan)",
        assigned_profile_id: "profile-2",
      }),
    ];
    element.draftContextKey = "ha-user-2:admin";
    await element.updateComplete;

    element.handoffTaskId = "task-1";
    await element.updateComplete;

    const refreshedTitleInput = element.shadowRoot?.querySelector("input[required]") as
      | HTMLInputElement
      | null;
    expect(refreshedTitleInput?.value).toBe("Laundry (Jordan)");
  });

  it("renders linked assignee labels and discovered NFC tag options", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;

    element.profiles = [
      {
        id: "profile-1",
        display_name: "Alex Profile",
        avatar_url: "",
        created_at: "2026-05-10T00:00:00+00:00",
      },
      {
        id: "profile-2",
        display_name: "Jordan Profile",
        avatar_url: "",
        created_at: "2026-05-10T00:00:00+00:00",
      },
    ];
    element.profileMappings = [
      {
        id: "mapping-1",
        ha_user_id: "ha-user-1",
        profile_id: "profile-1",
        created_at: "2026-05-10T00:00:00+00:00",
      },
    ];
    element.haUsers = [
      {
        id: "ha-user-1",
        name: "Alex HA",
        is_active: true,
        is_admin: true,
        system_generated: false,
      },
    ];
    element.unmappedTags = [
      {
        tag_id: "tag-front-door",
        first_seen: "2026-05-14T08:00:00+00:00",
        last_seen: "2026-05-14T08:05:00+00:00",
        last_source: "nfc_phone",
      },
      {
        tag_id: "tag-laundry-room",
        first_seen: "2026-05-14T09:00:00+00:00",
        last_seen: "2026-05-14T09:10:00+00:00",
        last_source: "nfc_reader",
      },
    ];

    document.body.append(element);
    await element.updateComplete;

    const assigneeSelect = element.shadowRoot?.querySelector(
      "[data-assignee-select]"
    ) as HTMLSelectElement | null;
    const nfcTagSelect = element.shadowRoot?.querySelector(
      "[data-nfc-tag-select]"
    ) as HTMLSelectElement | null;

    expect(assigneeSelect).not.toBeNull();
    expect(
      Array.from(assigneeSelect?.options ?? []).map((option) => option.textContent?.trim())
    ).toEqual(["Alex Profile (Alex HA)", "Jordan Profile"]);

    expect(nfcTagSelect).not.toBeNull();
    expect(
      Array.from(nfcTagSelect?.options ?? []).map((option) => ({
        value: option.value,
        label: option.textContent?.trim(),
      }))
    ).toEqual([
      { value: "", label: "Optional" },
      { value: "tag-front-door", label: "tag-front-door" },
      { value: "tag-laundry-room", label: "tag-laundry-room" },
    ]);
  });

  it("shows an actionable error when submitting with no assignable profiles", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;

    document.body.append(element);
    await element.updateComplete;

    const titleInput = element.shadowRoot?.querySelector("input[required]") as HTMLInputElement | null;
    const startDateInput = element.shadowRoot?.querySelector("input[type='date']") as HTMLInputElement | null;
    const form = element.shadowRoot?.querySelector("form") as HTMLFormElement | null;

    titleInput!.value = "Laundry";
    titleInput!.dispatchEvent(new Event("input"));
    startDateInput!.value = "2026-05-16";
    startDateInput!.dispatchEvent(new Event("input"));

    const saveTaskEvents: CustomEvent[] = [];
    element.addEventListener("save-task-request", (event) => {
      saveTaskEvents.push(event as CustomEvent);
    });

    form?.requestSubmit();
    await element.updateComplete;

    const errorMessage = element.shadowRoot?.querySelector(".error")?.textContent ?? "";

    expect(saveTaskEvents).toHaveLength(0);
    expect(errorMessage).toContain("Import at least one user profile in Setup before creating tasks.");
  });

  it("creates a task when crypto.randomUUID is unavailable", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;
    element.profiles = [
      {
        id: "profile-1",
        display_name: "Alex Profile",
        avatar_url: "",
        created_at: "2026-05-10T00:00:00+00:00",
      },
    ];

    document.body.append(element);
    await element.updateComplete;

    const originalRandomUuid = (globalThis.crypto as Crypto & { randomUUID?: unknown }).randomUUID;
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });

    try {
      const titleInput = element.shadowRoot?.querySelector("input[required]") as HTMLInputElement | null;
      const form = element.shadowRoot?.querySelector("form") as HTMLFormElement | null;

      titleInput!.value = "Fold laundry";
      titleInput!.dispatchEvent(new Event("input"));

      const saveTaskEvents: CustomEvent[] = [];
      element.addEventListener("save-task-request", (event) => {
        saveTaskEvents.push(event as CustomEvent);
      });

      form?.requestSubmit();
      await element.updateComplete;

      expect(saveTaskEvents).toHaveLength(1);
      const savedTask = (saveTaskEvents[0].detail as { task: TaskDefinition }).task;
      expect(savedTask.id).toMatch(/^task-fold-laundry-[a-z0-9]{8}$/);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: originalRandomUuid,
        configurable: true,
      });
    }
  });

  it("renders separate Active Tasks and Archived Tasks sections", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;
    element.tasks = [
      buildTask({
        id: "task-active",
        title: "Active task",
        active: true,
      }),
      buildTask({
        id: "task-archived",
        title: "Archived task",
        active: false,
      }),
    ];

    document.body.append(element);
    await element.updateComplete;

    const sectionHeadings = Array.from(element.shadowRoot?.querySelectorAll("h4") ?? []).map(
      (heading) => heading.textContent?.trim()
    );
    const activeList = element.shadowRoot?.querySelector("[data-active-task-list]") as HTMLElement | null;
    const archivedList = element.shadowRoot?.querySelector("[data-archived-task-list]") as HTMLElement | null;

    expect(sectionHeadings).toContain("Active Tasks");
    expect(sectionHeadings).toContain("Archived Tasks");
    expect(activeList?.textContent).toContain("Active task");
    expect(activeList?.textContent).not.toContain("Archived task");
    expect(archivedList?.textContent).toContain("Archived task");
    expect(archivedList?.textContent).not.toContain("Active task");
  });

  it("does not render an active toggle in the generic save form", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;
    element.tasks = [
      buildTask({
        id: "task-active",
        title: "Active task",
        active: true,
      }),
    ];

    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("input[type='checkbox']")).toBeNull();
  });

  it("requires confirmation before dispatching archive-task-request", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;
    element.tasks = [
      buildTask({
        id: "task-active",
        title: "Active task",
        active: true,
      }),
      buildTask({
        id: "task-archived",
        title: "Archived task",
        active: false,
      }),
    ];

    const archiveEvents: Array<{ taskId: string }> = [];

    element.addEventListener("archive-task-request", (event) => {
      archiveEvents.push((event as CustomEvent<{ taskId: string }>).detail);
    });

    document.body.append(element);
    await element.updateComplete;

    const archiveButton = element.shadowRoot?.querySelector(
      "[data-archive-task-id='task-active']"
    ) as HTMLButtonElement | null;

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    archiveButton?.click();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(archiveEvents).toEqual([]);

    confirmSpy.mockRestore();
  });

  it("emits archive-task-request when confirmation succeeds", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;
    element.tasks = [
      buildTask({
        id: "task-active",
        title: "Active task",
        active: true,
      }),
      buildTask({
        id: "task-archived",
        title: "Archived task",
        active: false,
      }),
    ];

    const archiveEvents: Array<{ taskId: string }> = [];

    element.addEventListener("archive-task-request", (event) => {
      archiveEvents.push((event as CustomEvent<{ taskId: string }>).detail);
    });

    document.body.append(element);
    await element.updateComplete;

    const archiveButton = element.shadowRoot?.querySelector(
      "[data-archive-task-id='task-active']"
    ) as HTMLButtonElement | null;

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    archiveButton?.click();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(archiveEvents).toEqual([{ taskId: "task-active" }]);

    confirmSpy.mockRestore();
  });

  it("emits restore-task-request for an archived task row", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;
    element.tasks = [
      buildTask({
        id: "task-active",
        title: "Active task",
        active: true,
      }),
      buildTask({
        id: "task-archived",
        title: "Archived task",
        active: false,
      }),
    ];

    const restoreEvents: Array<{ taskId: string }> = [];

    element.addEventListener("restore-task-request", (event) => {
      restoreEvents.push((event as CustomEvent<{ taskId: string }>).detail);
    });

    document.body.append(element);
    await element.updateComplete;

    const restoreButton = element.shadowRoot?.querySelector(
      "[data-restore-task-id='task-archived']"
    ) as HTMLButtonElement | null;

    restoreButton?.click();

    expect(restoreEvents).toEqual([{ taskId: "task-archived" }]);
  });

  it("emits delete-task-definition-request for an active task row", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;
    element.tasks = [
      buildTask({
        id: "task-active",
        title: "Active task",
        active: true,
      }),
      buildTask({
        id: "task-archived",
        title: "Archived task",
        active: false,
      }),
    ];

    const deleteEvents: Array<{ taskId: string }> = [];

    element.addEventListener("delete-task-definition-request", (event) => {
      deleteEvents.push((event as CustomEvent<{ taskId: string }>).detail);
    });

    document.body.append(element);
    await element.updateComplete;

    const deleteButton = element.shadowRoot?.querySelector(
      "[data-delete-task-id='task-active']"
    ) as HTMLButtonElement | null;

    deleteButton?.click();

    expect(deleteEvents).toEqual([{ taskId: "task-active" }]);
  });

  it("emits delete-task-definition-request for an archived task row", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;
    element.tasks = [
      buildTask({
        id: "task-active",
        title: "Active task",
        active: true,
      }),
      buildTask({
        id: "task-archived",
        title: "Archived task",
        active: false,
      }),
    ];

    const deleteEvents: Array<{ taskId: string }> = [];

    element.addEventListener("delete-task-definition-request", (event) => {
      deleteEvents.push((event as CustomEvent<{ taskId: string }>).detail);
    });

    document.body.append(element);
    await element.updateComplete;

    const deleteButton = element.shadowRoot?.querySelector(
      "[data-delete-task-id='task-archived']"
    ) as HTMLButtonElement | null;

    deleteButton?.click();

    expect(deleteEvents).toEqual([{ taskId: "task-archived" }]);
  });
});