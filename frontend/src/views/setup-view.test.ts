import { afterEach, describe, expect, it } from "vitest";

import "./setup-view";
import type { SetupView } from "./setup-view";

describe("task-manager-setup-view", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a watch control with a listening state and emits start or stop events", async () => {
    const element = document.createElement("task-manager-setup-view") as SetupView;

    document.body.append(element);
    await element.updateComplete;

    const startEvents: CustomEvent[] = [];
    const stopEvents: CustomEvent[] = [];
    element.addEventListener("start-nfc-watch-request", (event) => {
      startEvents.push(event as CustomEvent);
    });
    element.addEventListener("stop-nfc-watch-request", (event) => {
      stopEvents.push(event as CustomEvent);
    });

    const startButton = element.shadowRoot?.querySelector(
      "[data-watch-toggle]"
    ) as HTMLButtonElement | null;

    expect(startButton?.textContent).toContain("Watch for Next Scan");
    expect(element.shadowRoot?.textContent).not.toContain("Listening for the next NFC scan.");

    startButton?.click();

    expect(startEvents).toHaveLength(1);
    expect(stopEvents).toHaveLength(0);

    element.watchingForScan = true;
    await element.updateComplete;

    const stopButton = element.shadowRoot?.querySelector(
      "[data-watch-toggle]"
    ) as HTMLButtonElement | null;

    expect(stopButton?.textContent).toContain("Stop Watching");
    expect(element.shadowRoot?.textContent).toContain("Listening for the next NFC scan.");

    stopButton?.click();

    expect(startEvents).toHaveLength(1);
    expect(stopEvents).toHaveLength(1);
  });

  it("emits import and link events", async () => {
    const element = document.createElement("task-manager-setup-view") as SetupView;

    element.haUsers = [
      {
        id: "ha-user-1",
        name: "Alex",
        is_active: true,
        is_admin: true,
        system_generated: false,
      },
    ];
    element.mappings = [];
    element.unmappedTags = [
      {
        tag_id: "tag-1",
        first_seen: "2026-05-14T08:00:00+00:00",
        last_seen: "2026-05-14T08:00:00+00:00",
        last_source: "nfc_phone",
      },
    ];
    element.tasks = [
      {
        id: "task-1",
        title: "Clean bathroom",
        description: "",
        recurrence: {
          frequency: "daily",
          days_of_week: [],
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
      },
    ];

    document.body.append(element);
    await element.updateComplete;

    const events: CustomEvent[] = [];
    element.addEventListener("import-ha-user-request", (event) => {
      events.push(event as CustomEvent);
    });
    element.addEventListener("link-nfc-tag-request", (event) => {
      events.push(event as CustomEvent);
    });

    const importButton = element.shadowRoot?.querySelector(
      '[data-import-user-id="ha-user-1"]'
    ) as HTMLButtonElement | null;
    importButton?.click();

    const linkSelect = element.shadowRoot?.querySelector(
      '[data-link-tag-id="tag-1"]'
    ) as HTMLSelectElement | null;
    if (!linkSelect) {
      throw new Error("Expected link select to exist");
    }
    linkSelect.value = "task-1";
    linkSelect.dispatchEvent(new Event("change"));

    expect(events[0]?.detail).toEqual({ haUserId: "ha-user-1" });
    expect(events[1]?.detail).toEqual({ tagId: "tag-1", taskId: "task-1" });
  });

  it("shows only active, non-system, unmapped users as importable", async () => {
    const element = document.createElement("task-manager-setup-view") as SetupView;

    element.haUsers = [
      {
        id: "ha-user-1",
        name: "Mapped User",
        is_active: true,
        is_admin: false,
        system_generated: false,
      },
      {
        id: "ha-user-2",
        name: "Import Me",
        is_active: true,
        is_admin: true,
        system_generated: false,
      },
      {
        id: "ha-user-3",
        name: "Inactive User",
        is_active: false,
        is_admin: false,
        system_generated: false,
      },
      {
        id: "ha-user-4",
        name: "Scanner User",
        is_active: true,
        is_admin: false,
        system_generated: true,
      },
    ];
    element.mappings = [
      {
        id: "mapping-1",
        ha_user_id: "ha-user-1",
        profile_id: "profile-1",
        created_at: "2026-05-10T00:00:00+00:00",
      },
    ];

    document.body.append(element);
    await element.updateComplete;

    const importButtons = Array.from(
      element.shadowRoot?.querySelectorAll("[data-import-user-id]") ?? []
    ) as HTMLButtonElement[];

    expect(importButtons.map((button) => button.dataset.importUserId)).toEqual([
      "ha-user-2",
    ]);
    expect(
      element.shadowRoot?.querySelector('[data-import-user-id="ha-user-1"]')
    ).toBeNull();
    expect(
      element.shadowRoot?.querySelector('[data-import-user-id="ha-user-3"]')
    ).toBeNull();
    expect(
      element.shadowRoot?.querySelector('[data-import-user-id="ha-user-4"]')
    ).toBeNull();
  });

  it("shows a loading state before setup datasets are available", async () => {
    const element = document.createElement("task-manager-setup-view") as SetupView;

    element.loading = true;

    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.textContent).toContain("Loading setup data...");
    expect(element.shadowRoot?.textContent).not.toContain(
      "No Home Assistant users have been mapped yet."
    );
    expect(element.shadowRoot?.textContent).not.toContain(
      "All available Home Assistant users are already mapped."
    );
    expect(element.shadowRoot?.textContent).not.toContain(
      "No unmapped NFC tags have been discovered yet."
    );
  });

  it("excludes inactive tasks from NFC link options", async () => {
    const element = document.createElement("task-manager-setup-view") as SetupView;

    element.unmappedTags = [
      {
        tag_id: "tag-1",
        first_seen: "2026-05-14T08:00:00+00:00",
        last_seen: "2026-05-14T08:00:00+00:00",
        last_source: "nfc_phone",
      },
    ];
    element.tasks = [
      {
        id: "task-2",
        title: "Archived kitchen task",
        description: "",
        recurrence: {
          frequency: "daily",
          days_of_week: [],
          interval_days: 1,
          day_of_month: null,
        },
        skip_windows: [],
        assigned_profile_id: "profile-1",
        nfc_tag_id: null,
        active: false,
        start_date: "2026-05-10",
        created_at: "2026-05-10T00:00:00+00:00",
        updated_at: "2026-05-10T00:00:00+00:00",
      },
      {
        id: "task-1",
        title: "Clean bathroom",
        description: "",
        recurrence: {
          frequency: "daily",
          days_of_week: [],
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
      },
    ];

    document.body.append(element);
    await element.updateComplete;

    const linkSelect = element.shadowRoot?.querySelector(
      '[data-link-tag-id="tag-1"]'
    ) as HTMLSelectElement | null;

    const optionValues = Array.from(linkSelect?.options ?? []).map((option) => ({
      value: option.value,
      label: option.textContent?.trim(),
    }));

    expect(optionValues).toEqual([
      { value: "", label: "Link to task" },
      { value: "task-1", label: "Clean bathroom" },
    ]);
  });
});