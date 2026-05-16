import { afterEach, describe, expect, it } from "vitest";

import "./task-builder-view";
import type { TaskBuilderView } from "./task-builder-view";
import type { TaskDefinition } from "../types/task";

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