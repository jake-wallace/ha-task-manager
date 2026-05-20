import { afterEach, describe, expect, it } from "vitest";

import "./task-builder-view";
import type { TaskBuilderView } from "./task-builder-view";
import type { TaskDefinition } from "../types/task";

describe("task-manager-task-builder-view", () => {
  const buildTask = (overrides: Partial<TaskDefinition> = {}): TaskDefinition => ({
    id: "task-default",
    title: "Default Task",
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
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders active and archived task sections separately", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;

    element.tasks = [
      buildTask({ id: "task-active", title: "Kitchen counters", active: true }),
      buildTask({ id: "task-archived", title: "Garage cleanup", active: false }),
    ];

    document.body.append(element);
    await element.updateComplete;

    const activeSection = element.shadowRoot?.querySelector("[data-active-task-section]");
    const archivedSection = element.shadowRoot?.querySelector("[data-archived-task-section]");

    expect(activeSection).not.toBeNull();
    expect(archivedSection).not.toBeNull();

    const activeTitles = Array.from(
      activeSection?.querySelectorAll("[data-task-title]") ?? []
    ).map((title) => title.textContent?.trim());
    const archivedTitles = Array.from(
      archivedSection?.querySelectorAll("[data-task-title]") ?? []
    ).map((title) => title.textContent?.trim());

    expect(activeTitles).toEqual(["Kitchen counters"]);
    expect(archivedTitles).toEqual(["Garage cleanup"]);
  });

  it("emits archive-task-request for an active task action", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;

    element.tasks = [
      buildTask({ id: "task-active", title: "Kitchen counters", active: true }),
    ];

    const archiveTaskEvents: CustomEvent[] = [];
    element.addEventListener("archive-task-request", (event) => {
      archiveTaskEvents.push(event as CustomEvent);
    });

    document.body.append(element);
    await element.updateComplete;

    const archiveButton = element.shadowRoot?.querySelector(
      '[data-archive-task-button="task-active"]'
    ) as HTMLButtonElement | null;

    archiveButton?.click();

    expect(archiveTaskEvents).toHaveLength(1);
    expect(archiveTaskEvents[0].detail).toEqual({ taskId: "task-active" });
  });

  it("emits restore-task-request for an archived task action", async () => {
    const element = document.createElement("task-manager-task-builder-view") as TaskBuilderView;

    element.tasks = [
      buildTask({ id: "task-archived", title: "Garage cleanup", active: false }),
    ];

    const restoreTaskEvents: CustomEvent[] = [];
    element.addEventListener("restore-task-request", (event) => {
      restoreTaskEvents.push(event as CustomEvent);
    });

    document.body.append(element);
    await element.updateComplete;

    const restoreButton = element.shadowRoot?.querySelector(
      '[data-restore-task-button="task-archived"]'
    ) as HTMLButtonElement | null;

    restoreButton?.click();

    expect(restoreTaskEvents).toHaveLength(1);
    expect(restoreTaskEvents[0].detail).toEqual({ taskId: "task-archived" });
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
});