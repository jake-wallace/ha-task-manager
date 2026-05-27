import { afterEach, describe, expect, it, vi } from "vitest";

import "./ha-task-manager-panel";
import type { HaTaskManagerPanel } from "./ha-task-manager-panel";
import type { TaskDefinition } from "./types/task";

type WsMessage = Record<string, unknown>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function taskFixture(): TaskDefinition {
  return {
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
  };
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createHass(
  callHandler: (message: WsMessage) => Promise<unknown>,
  options: { isAdmin?: boolean; userId?: string } = {}
) {
  return {
    user: { id: options.userId ?? "ha-user-1", is_admin: options.isAdmin ?? false },
    callWS: async <T>(message: WsMessage): Promise<T> => callHandler(message) as Promise<T>,
  };
}

async function settlePanel(panel: HaTaskManagerPanel): Promise<void> {
  await panel.updateComplete;
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(0);
  } else {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  await panel.updateComplete;
}

describe("ha-task-manager-panel", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("loads core data for non-admin users without requesting admin-only datasets", async () => {
    const requestedTypes: string[] = [];
    const adminOnlyTypes = new Set([
      "ha_task_manager/profile_mappings",
      "ha_task_manager/ha_users",
      "ha_task_manager/unmapped_nfc_tags",
    ]);
    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      if (adminOnlyTypes.has(type)) {
        throw new Error("admin only");
      }

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [taskFixture()];
        case "ha_task_manager/due_instances":
          return [
            {
              id: "due-1",
              task_id: "task-1",
              due_date: "2026-05-14",
              skipped: false,
              source_task_updated_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/pending_confirmations":
          return [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const myTasksView = panel.shadowRoot?.querySelector("task-manager-my-tasks-view") as
      | HTMLElement
      | null;
    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    );
    const setupButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Setup"
    );

    expect(requestedTypes).toEqual([
      "ha_task_manager/current_profile",
      "ha_task_manager/profiles",
      "ha_task_manager/tasks",
      "ha_task_manager/due_instances",
      "ha_task_manager/pending_confirmations",
    ]);
    expect(panel.shadowRoot?.textContent).not.toContain("admin only");
    expect(manageTasksButton).toBeUndefined();
    expect(setupButton).toBeUndefined();
    expect(myTasksView).not.toBeNull();
    expect((myTasksView as { tasks?: unknown[] }).tasks).toHaveLength(1);
  });

  it("falls back to my tasks when a non-admin is forced onto the admin view", async () => {
    const requestedTypes: string[] = [];
    const adminOnlyTypes = new Set([
      "ha_task_manager/profile_mappings",
      "ha_task_manager/ha_users",
      "ha_task_manager/unmapped_nfc_tags",
    ]);
    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      if (adminOnlyTypes.has(type)) {
        throw new Error("admin only");
      }

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [taskFixture()];
        case "ha_task_manager/due_instances":
          return [
            {
              id: "due-1",
              task_id: "task-1",
              due_date: "2026-05-14",
              skipped: false,
              source_task_updated_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/pending_confirmations":
          return [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    (panel as unknown as { currentView: string }).currentView = "admin";
    await settlePanel(panel);

    const myTasksView = panel.shadowRoot?.querySelector("task-manager-my-tasks-view") as
      | HTMLElement
      | null;
    const taskBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view");
    const selectedButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.getAttribute("aria-selected") === "true"
    );

    expect(panel.shadowRoot?.textContent).not.toContain("admin only");
    expect(myTasksView).not.toBeNull();
    expect(taskBuilderView).toBeNull();
    expect(selectedButton?.textContent?.trim()).toBe("My Tasks");
    expect(requestedTypes).toEqual([
      "ha_task_manager/current_profile",
      "ha_task_manager/profiles",
      "ha_task_manager/tasks",
      "ha_task_manager/due_instances",
      "ha_task_manager/pending_confirmations",
    ]);
  });

  it("loads setup datasets when the setup tab is opened", async () => {
    const requestedTypes: string[] = [];
    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [taskFixture()];
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [
            {
              id: "mapping-1",
              ha_user_id: "ha-user-1",
              profile_id: "profile-1",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/ha_users":
          return [
            {
              id: "ha-user-1",
              name: "Alex",
              is_active: true,
              is_admin: true,
              system_generated: false,
            },
          ];
        case "ha_task_manager/unmapped_nfc_tags":
          return [
            {
              tag_id: "tag-1",
              first_seen: "2026-05-14T08:00:00+00:00",
              last_seen: "2026-05-14T08:00:00+00:00",
              last_source: "nfc_phone",
            },
          ];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const setupButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Setup"
    ) as HTMLButtonElement | undefined;
    setupButton?.click();

    await settlePanel(panel);

    const setupView = panel.shadowRoot?.querySelector("task-manager-setup-view") as
      | HTMLElement
      | null;

    expect(requestedTypes).toContain("ha_task_manager/profile_mappings");
    expect(requestedTypes).toContain("ha_task_manager/ha_users");
    expect(requestedTypes).toContain("ha_task_manager/unmapped_nfc_tags");
    expect(setupView).not.toBeNull();
    expect((setupView as { haUsers?: unknown[] }).haUsers).toHaveLength(1);
    expect((setupView as { unmappedTags?: unknown[] }).unmappedTags).toHaveLength(1);
  });

  it("reloads setup-derived admin data immediately when the hass user changes on manage tasks", async () => {
    const requestedTypes: string[] = [];
    let activeUserId = "ha-user-1";
    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(`${activeUserId}:${type}`);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: activeUserId,
            mapped: true,
            profile_id: activeUserId === "ha-user-1" ? "profile-1" : "profile-2",
            display_name: activeUserId === "ha-user-1" ? "Alex" : "Jordan",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: activeUserId === "ha-user-1" ? "profile-1" : "profile-2",
              display_name: activeUserId === "ha-user-1" ? "Alex Profile" : "Jordan Profile",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [
            {
              ...taskFixture(),
              assigned_profile_id: activeUserId === "ha-user-1" ? "profile-1" : "profile-2",
            },
          ];
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [
            {
              id: activeUserId === "ha-user-1" ? "mapping-1" : "mapping-2",
              ha_user_id: activeUserId,
              profile_id: activeUserId === "ha-user-1" ? "profile-1" : "profile-2",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/ha_users":
          return [
            {
              id: activeUserId,
              name: activeUserId === "ha-user-1" ? "Alex HA" : "Jordan HA",
              is_active: true,
              is_admin: true,
              system_generated: false,
            },
          ];
        case "ha_task_manager/unmapped_nfc_tags":
          return [
            {
              tag_id: activeUserId === "ha-user-1" ? "tag-1" : "tag-2",
              first_seen: "2026-05-14T08:00:00+00:00",
              last_seen: "2026-05-14T08:00:00+00:00",
              last_source: "nfc_phone",
            },
          ];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true, userId: "ha-user-1" });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();

    await settlePanel(panel);

    const initialBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ haUsers?: Array<{ name: string }>; unmappedTags?: Array<{ tag_id: string }> } & HTMLElement)
      | null;

    expect(initialBuilderView?.haUsers?.map((user) => user.name)).toEqual(["Alex HA"]);
    expect(initialBuilderView?.unmappedTags?.map((tag) => tag.tag_id)).toEqual(["tag-1"]);

    requestedTypes.length = 0;

  activeUserId = "ha-user-2";
    panel.hass = createHass(hass.callWS, { isAdmin: true, userId: "ha-user-2" });
    await settlePanel(panel);

    const refreshedBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ haUsers?: Array<{ name: string }>; unmappedTags?: Array<{ tag_id: string }> } & HTMLElement)
      | null;

    expect(requestedTypes).toContain("ha-user-2:ha_task_manager/profile_mappings");
    expect(requestedTypes).toContain("ha-user-2:ha_task_manager/ha_users");
    expect(requestedTypes).toContain("ha-user-2:ha_task_manager/unmapped_nfc_tags");
    expect(refreshedBuilderView?.haUsers?.map((user) => user.name)).toEqual(["Jordan HA"]);
    expect(refreshedBuilderView?.unmappedTags?.map((tag) => tag.tag_id)).toEqual(["tag-2"]);
  });

  it("ignores stale overlapping user-context reload responses on manage tasks", async () => {
    const requestedTypes: string[] = [];
    const endpointTypes = [
      "ha_task_manager/current_profile",
      "ha_task_manager/profiles",
      "ha_task_manager/tasks",
      "ha_task_manager/due_instances",
      "ha_task_manager/pending_confirmations",
      "ha_task_manager/profile_mappings",
      "ha_task_manager/ha_users",
      "ha_task_manager/unmapped_nfc_tags",
    ] as const;

    type EndpointType = (typeof endpointTypes)[number];
    type DeferredResponseMap = Record<EndpointType, Deferred<unknown>>;

    const createDeferredResponseMap = (): DeferredResponseMap => ({
      "ha_task_manager/current_profile": createDeferred(),
      "ha_task_manager/profiles": createDeferred(),
      "ha_task_manager/tasks": createDeferred(),
      "ha_task_manager/due_instances": createDeferred(),
      "ha_task_manager/pending_confirmations": createDeferred(),
      "ha_task_manager/profile_mappings": createDeferred(),
      "ha_task_manager/ha_users": createDeferred(),
      "ha_task_manager/unmapped_nfc_tags": createDeferred(),
    });

    const responsesByUser: Record<string, DeferredResponseMap> = {
      "ha-user-1": createDeferredResponseMap(),
      "ha-user-2": createDeferredResponseMap(),
    };

    const resolveUserResponses = (userId: "ha-user-1" | "ha-user-2"): void => {
      const suffix = userId === "ha-user-1" ? "1" : "2";
      responsesByUser[userId]["ha_task_manager/current_profile"].resolve({
        ha_user_id: userId,
        mapped: true,
        profile_id: `profile-${suffix}`,
        display_name: userId === "ha-user-1" ? "Alex" : "Jordan",
      });
      responsesByUser[userId]["ha_task_manager/profiles"].resolve([
        {
          id: `profile-${suffix}`,
          display_name: userId === "ha-user-1" ? "Alex Profile" : "Jordan Profile",
          avatar_url: "",
          created_at: "2026-05-10T00:00:00+00:00",
        },
      ]);
      responsesByUser[userId]["ha_task_manager/tasks"].resolve([
        {
          ...taskFixture(),
          assigned_profile_id: `profile-${suffix}`,
        },
      ]);
      responsesByUser[userId]["ha_task_manager/due_instances"].resolve([]);
      responsesByUser[userId]["ha_task_manager/pending_confirmations"].resolve([]);
      responsesByUser[userId]["ha_task_manager/profile_mappings"].resolve([
        {
          id: `mapping-${suffix}`,
          ha_user_id: userId,
          profile_id: `profile-${suffix}`,
          created_at: "2026-05-10T00:00:00+00:00",
        },
      ]);
      responsesByUser[userId]["ha_task_manager/ha_users"].resolve([
        {
          id: userId,
          name: userId === "ha-user-1" ? "Alex HA" : "Jordan HA",
          is_active: true,
          is_admin: true,
          system_generated: false,
        },
      ]);
      responsesByUser[userId]["ha_task_manager/unmapped_nfc_tags"].resolve([
        {
          tag_id: userId === "ha-user-1" ? "tag-1" : "tag-2",
          first_seen: "2026-05-14T08:00:00+00:00",
          last_seen: "2026-05-14T08:00:00+00:00",
          last_source: "nfc_phone",
        },
      ]);
    };

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const createDeferredHass = (userId: "ha-user-1" | "ha-user-2") =>
      createHass(async (message) => {
        const type = String(message.type) as EndpointType;
        requestedTypes.push(`${userId}:${type}`);

        if (!endpointTypes.includes(type)) {
          throw new Error(`Unexpected websocket call: ${type}`);
        }

        return responsesByUser[userId][type].promise;
      }, { isAdmin: true, userId });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    (panel as unknown as { currentView: string }).currentView = "admin";
    panel.hass = createDeferredHass("ha-user-1");
    document.body.append(panel);

    await panel.updateComplete;
    await Promise.resolve();

    expect(requestedTypes).toEqual(expect.arrayContaining([
      "ha-user-1:ha_task_manager/current_profile",
      "ha-user-1:ha_task_manager/profiles",
      "ha-user-1:ha_task_manager/tasks",
      "ha-user-1:ha_task_manager/due_instances",
      "ha-user-1:ha_task_manager/pending_confirmations",
      "ha-user-1:ha_task_manager/profile_mappings",
      "ha-user-1:ha_task_manager/ha_users",
      "ha-user-1:ha_task_manager/unmapped_nfc_tags",
    ]));

    panel.hass = createDeferredHass("ha-user-2");
    await panel.updateComplete;
    await Promise.resolve();

    expect(requestedTypes).toEqual(expect.arrayContaining([
      "ha-user-1:ha_task_manager/current_profile",
      "ha-user-1:ha_task_manager/profiles",
      "ha-user-1:ha_task_manager/tasks",
      "ha-user-1:ha_task_manager/due_instances",
      "ha-user-1:ha_task_manager/pending_confirmations",
      "ha-user-1:ha_task_manager/profile_mappings",
      "ha-user-1:ha_task_manager/ha_users",
      "ha-user-1:ha_task_manager/unmapped_nfc_tags",
      "ha-user-2:ha_task_manager/current_profile",
      "ha-user-2:ha_task_manager/profiles",
      "ha-user-2:ha_task_manager/tasks",
      "ha-user-2:ha_task_manager/due_instances",
      "ha-user-2:ha_task_manager/pending_confirmations",
      "ha-user-2:ha_task_manager/profile_mappings",
      "ha-user-2:ha_task_manager/ha_users",
      "ha-user-2:ha_task_manager/unmapped_nfc_tags",
    ]));

    resolveUserResponses("ha-user-2");
    await settlePanel(panel);

    const latestBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ haUsers?: Array<{ name: string }>; unmappedTags?: Array<{ tag_id: string }>; tasks?: Array<{ assigned_profile_id: string }> } & HTMLElement)
      | null;

    expect(panel.shadowRoot?.textContent).toContain("Signed in as Jordan");
    expect(latestBuilderView?.tasks?.map((task) => task.assigned_profile_id)).toEqual(["profile-2"]);
    expect(latestBuilderView?.haUsers?.map((user) => user.name)).toEqual(["Jordan HA"]);
    expect(latestBuilderView?.unmappedTags?.map((tag) => tag.tag_id)).toEqual(["tag-2"]);

    resolveUserResponses("ha-user-1");
    await settlePanel(panel);

    const finalBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ haUsers?: Array<{ name: string }>; unmappedTags?: Array<{ tag_id: string }>; tasks?: Array<{ assigned_profile_id: string }> } & HTMLElement)
      | null;

    expect(panel.shadowRoot?.textContent).toContain("Signed in as Jordan");
    expect(finalBuilderView?.tasks?.map((task) => task.assigned_profile_id)).toEqual(["profile-2"]);
    expect(finalBuilderView?.haUsers?.map((user) => user.name)).toEqual(["Jordan HA"]);
    expect(finalBuilderView?.unmappedTags?.map((tag) => tag.tag_id)).toEqual(["tag-2"]);
  });

  it("shows a loading state the first time an admin opens setup", async () => {
    const requestedTypes: string[] = [];
    let resolveSetupData: (() => void) | undefined;
    const setupDataReady = new Promise<void>((resolve) => {
      resolveSetupData = resolve;
    });

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [taskFixture()];
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
        case "ha_task_manager/ha_users":
        case "ha_task_manager/unmapped_nfc_tags":
          await setupDataReady;
          if (type === "ha_task_manager/profile_mappings") {
            return [];
          }
          if (type === "ha_task_manager/ha_users") {
            return [];
          }
          return [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const setupButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Setup"
    ) as HTMLButtonElement | undefined;
    setupButton?.click();

    await panel.updateComplete;

    const setupView = panel.shadowRoot?.querySelector("task-manager-setup-view") as
      | ({ loading?: boolean; updateComplete?: Promise<unknown> } & HTMLElement)
      | null;

    await setupView?.updateComplete;

    expect(requestedTypes).toContain("ha_task_manager/profile_mappings");
    expect(setupView).not.toBeNull();
    expect(setupView?.loading).toBe(true);
    expect(setupView?.shadowRoot?.textContent).toContain("Loading setup data...");
    expect(setupView?.shadowRoot?.textContent).not.toContain(
      "No Home Assistant users have been mapped yet."
    );

    resolveSetupData?.();
    await settlePanel(panel);

    expect(setupView?.loading).toBe(false);
    expect(setupView?.shadowRoot?.textContent).not.toContain("Loading setup data...");
  });

  it("clears a stale setup error banner after a successful setup reload", async () => {
    const requestedTypes: string[] = [];
    let failNextSetupLoad = true;

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [taskFixture()];
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          if (failNextSetupLoad) {
            failNextSetupLoad = false;
            throw new Error("Setup data unavailable");
          }
          return [
            {
              id: "mapping-1",
              ha_user_id: "ha-user-1",
              profile_id: "profile-1",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/ha_users":
          return [
            {
              id: "ha-user-1",
              name: "Alex",
              is_active: true,
              is_admin: true,
              system_generated: false,
            },
          ];
        case "ha_task_manager/unmapped_nfc_tags":
          return [
            {
              tag_id: "tag-1",
              first_seen: "2026-05-14T08:00:00+00:00",
              last_seen: "2026-05-14T08:00:00+00:00",
              last_source: "nfc_phone",
            },
          ];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const findNavButton = (label: string): HTMLButtonElement | undefined =>
      Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
        (button) => button.textContent?.trim() === label
      ) as HTMLButtonElement | undefined;

    findNavButton("Setup")?.click();
    await settlePanel(panel);

    expect(panel.shadowRoot?.textContent).toContain("Setup data unavailable");

    findNavButton("My Tasks")?.click();
    await settlePanel(panel);

    findNavButton("Setup")?.click();
    await settlePanel(panel);

    const setupView = panel.shadowRoot?.querySelector("task-manager-setup-view") as
      | ({ haUsers?: unknown[]; mappings?: unknown[]; unmappedTags?: unknown[] } & HTMLElement)
      | null;

    expect(requestedTypes.filter((type) => type === "ha_task_manager/profile_mappings")).toHaveLength(2);
    expect(panel.shadowRoot?.textContent).not.toContain("Setup data unavailable");
    expect((setupView as { haUsers?: unknown[] }).haUsers).toHaveLength(1);
    expect((setupView as { mappings?: unknown[] }).mappings).toHaveLength(1);
    expect((setupView as { unmappedTags?: unknown[] }).unmappedTags).toHaveLength(1);
  });

  it("renders a setup error state instead of setup empty states when setup loading fails", async () => {
    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [taskFixture()];
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          throw new Error("Setup data unavailable");
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const setupButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Setup"
    ) as HTMLButtonElement | undefined;
    setupButton?.click();

    await settlePanel(panel);

    const setupView = panel.shadowRoot?.querySelector("task-manager-setup-view") as HTMLElement | null;

    expect(panel.shadowRoot?.textContent).toContain("Setup data unavailable");
    expect(setupView).not.toBeNull();
    expect(setupView?.shadowRoot?.textContent).toContain("Setup data unavailable");
    expect(setupView?.shadowRoot?.textContent).not.toContain(
      "No Home Assistant users have been mapped yet."
    );
    expect(setupView?.shadowRoot?.textContent).not.toContain(
      "All available Home Assistant users are already mapped."
    );
    expect(setupView?.shadowRoot?.textContent).not.toContain(
      "No unmapped NFC tags have been discovered yet."
    );
  });

  it("polls setup discoveries while watch mode is active and stops after a new tag appears", async () => {
    vi.useFakeTimers();

    const requestedTypes: string[] = [];
    const unmappedResponses = [
      [],
      [],
      [
        {
          tag_id: "tag-2",
          first_seen: "2026-05-14T08:05:00+00:00",
          last_seen: "2026-05-14T08:05:00+00:00",
          last_source: "nfc_reader",
        },
      ],
    ];

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [taskFixture()];
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return unmappedResponses.shift() ?? unmappedResponses[unmappedResponses.length - 1] ?? [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const setupButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Setup"
    ) as HTMLButtonElement | undefined;
    setupButton?.click();

    await settlePanel(panel);

    const setupView = panel.shadowRoot?.querySelector("task-manager-setup-view") as
      | ({ watchingForScan?: boolean; unmappedTags?: unknown[] } & HTMLElement)
      | null;

    setupView?.dispatchEvent(
      new CustomEvent("start-nfc-watch-request", {
        bubbles: true,
        composed: true,
      })
    );

    await settlePanel(panel);

    expect(setupView?.watchingForScan).toBe(true);

    await vi.advanceTimersByTimeAsync(1600);
    await settlePanel(panel);

    expect(setupView?.watchingForScan).toBe(false);
    expect((setupView as { unmappedTags?: unknown[] }).unmappedTags).toHaveLength(1);

    const discoveryRequestCount = requestedTypes.filter(
      (type) => type === "ha_task_manager/unmapped_nfc_tags"
    ).length;

    await vi.advanceTimersByTimeAsync(3000);
    await settlePanel(panel);

    expect(
      requestedTypes.filter((type) => type === "ha_task_manager/unmapped_nfc_tags")
    ).toHaveLength(discoveryRequestCount);
  });

  it("ignores a stale setup watch poll after access context changes shut the watch down", async () => {
    const staleWatchPoll = createDeferred<unknown>();
    let initialSetupLoaded = false;

    const adminHass = createHass(async (message) => {
      const type = String(message.type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [taskFixture()];
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [
            {
              id: "ha-user-1",
              name: "Alex HA",
              is_active: true,
              is_admin: true,
              system_generated: false,
            },
          ];
        case "ha_task_manager/unmapped_nfc_tags":
          if (!initialSetupLoaded) {
            initialSetupLoaded = true;
            return [
              {
                tag_id: "tag-1",
                first_seen: "2026-05-14T08:00:00+00:00",
                last_seen: "2026-05-14T08:00:00+00:00",
                last_source: "nfc_phone",
              },
            ];
          }
          return staleWatchPoll.promise;
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true, userId: "ha-user-1" });

    const nonAdminHass = createHass(async (message) => {
      const type = String(message.type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-2",
            mapped: true,
            profile_id: "profile-2",
            display_name: "Jordan",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-2",
              display_name: "Jordan",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [
            {
              ...taskFixture(),
              assigned_profile_id: "profile-2",
            },
          ];
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: false, userId: "ha-user-2" });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = adminHass;
    document.body.append(panel);

    await settlePanel(panel);

    const setupButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Setup"
    ) as HTMLButtonElement | undefined;
    setupButton?.click();

    await settlePanel(panel);

    const setupView = panel.shadowRoot?.querySelector("task-manager-setup-view") as
      | ({ watchingForScan?: boolean; unmappedTags?: Array<{ tag_id: string }> } & HTMLElement)
      | null;

    expect(setupView?.unmappedTags?.map((tag) => tag.tag_id)).toEqual(["tag-1"]);

    setupView?.dispatchEvent(
      new CustomEvent("start-nfc-watch-request", {
        bubbles: true,
        composed: true,
      })
    );

    await panel.updateComplete;
    await Promise.resolve();

    expect(setupView?.watchingForScan).toBe(true);

    panel.hass = nonAdminHass;
    await settlePanel(panel);

    expect((panel as unknown as { setupWatchActive?: boolean }).setupWatchActive).toBe(false);
    expect((panel as unknown as { unmappedTags?: Array<{ tag_id: string }> }).unmappedTags).toEqual([]);
    expect(panel.shadowRoot?.textContent).toContain("Signed in as Jordan");
    expect(panel.shadowRoot?.textContent).not.toContain("Setup");

    staleWatchPoll.resolve([
      {
        tag_id: "tag-stale",
        first_seen: "2026-05-14T09:00:00+00:00",
        last_seen: "2026-05-14T09:00:00+00:00",
        last_source: "nfc_reader",
      },
    ]);
    await settlePanel(panel);

    expect((panel as unknown as { setupWatchActive?: boolean }).setupWatchActive).toBe(false);
    expect((panel as unknown as { unmappedTags?: Array<{ tag_id: string }> }).unmappedTags).toEqual([]);
    expect(panel.shadowRoot?.textContent).toContain("Signed in as Jordan");
    expect(panel.shadowRoot?.textContent).not.toContain("tag-stale");
  });

  it("refreshes builder setup-derived props after a successful task save", async () => {
    const requestedTypes: string[] = [];
    let storedTasks = [taskFixture()];
    let unmappedTags = [
      {
        tag_id: "tag-1",
        first_seen: "2026-05-14T08:00:00+00:00",
        last_seen: "2026-05-14T08:00:00+00:00",
        last_source: "nfc_phone",
      },
    ];

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return storedTasks;
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [
            {
              id: "mapping-1",
              ha_user_id: "ha-user-1",
              profile_id: "profile-1",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/ha_users":
          return [
            {
              id: "ha-user-1",
              name: "Alex",
              is_active: true,
              is_admin: true,
              system_generated: false,
            },
          ];
        case "ha_task_manager/unmapped_nfc_tags":
          return unmappedTags;
        case "ha_task_manager/save_task": {
          const savedTask = {
            ...taskFixture(),
            nfc_tag_id: "tag-1",
            updated_at: "2026-05-14T09:00:00+00:00",
          };
          storedTasks = [savedTask];
          unmappedTags = [];
          return savedTask;
        }
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();

    await settlePanel(panel);

    const initialBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ unmappedTags?: unknown[] } & HTMLElement)
      | null;

    expect((initialBuilderView as { unmappedTags?: unknown[] }).unmappedTags).toHaveLength(1);

    requestedTypes.length = 0;

    initialBuilderView?.dispatchEvent(
      new CustomEvent("save-task-request", {
        detail: {
          task: {
            ...taskFixture(),
            nfc_tag_id: "tag-1",
          },
        },
        bubbles: true,
        composed: true,
      })
    );

    await settlePanel(panel);

    const refreshedBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ unmappedTags?: unknown[] } & HTMLElement)
      | null;

    expect(requestedTypes).toContain("ha_task_manager/save_task");
    expect(requestedTypes).toContain("ha_task_manager/profile_mappings");
    expect(requestedTypes).toContain("ha_task_manager/ha_users");
    expect(requestedTypes).toContain("ha_task_manager/unmapped_nfc_tags");
    expect((refreshedBuilderView as { unmappedTags?: unknown[] }).unmappedTags).toHaveLength(0);
  });

  it("switches the builder into edit mode after creating a task", async () => {
    const requestedTypes: string[] = [];
    let storedTasks: TaskDefinition[] = [];

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return storedTasks;
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        case "ha_task_manager/save_task": {
          const requestTask = message.task as TaskDefinition;
          const savedTask = {
            ...requestTask,
            id: "task-created",
            created_at: "2026-05-14T09:00:00+00:00",
            updated_at: "2026-05-14T09:05:00+00:00",
          };
          storedTasks = [savedTask];
          return savedTask;
        }
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();

    await settlePanel(panel);

    const initialBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | HTMLElement
      | null;

    expect(initialBuilderView?.shadowRoot?.querySelector("h3")?.textContent?.trim()).toBe("Create Task");

    initialBuilderView?.dispatchEvent(
      new CustomEvent("save-task-request", {
        detail: {
          task: {
            ...taskFixture(),
            id: "task-draft",
            title: "Fold laundry",
          },
        },
        bubbles: true,
        composed: true,
      })
    );

    await settlePanel(panel);

    const refreshedBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | HTMLElement
      | null;
    const submitButton = refreshedBuilderView?.shadowRoot?.querySelector("button.primary") as
      | HTMLButtonElement
      | null;
    const activeTaskButton = Array.from(
      refreshedBuilderView?.shadowRoot?.querySelectorAll("button.task-button") ?? []
    ).find((button) => button.classList.contains("active"));

    expect(requestedTypes).toContain("ha_task_manager/save_task");
    expect(refreshedBuilderView?.shadowRoot?.querySelector("h3")?.textContent?.trim()).toBe("Edit Task");
    expect(submitButton?.textContent?.trim()).toBe("Save Changes");
    expect(activeTaskButton?.textContent).toContain("Fold laundry");
  });

  it("preserves active state on generic save so archive and restore remain explicit workflows", async () => {
    const requestedTypes: string[] = [];
    let savedActiveValue: boolean | null = null;
    let storedTasks: TaskDefinition[] = [
      {
        ...taskFixture(),
        id: "task-1",
        title: "Kitchen counters",
        active: true,
      },
    ];

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return storedTasks;
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        case "ha_task_manager/save_task": {
          const requestTask = message.task as TaskDefinition;
          savedActiveValue = requestTask.active;
          const savedTask = {
            ...requestTask,
            updated_at: "2026-05-14T09:10:00+00:00",
          };
          storedTasks = [savedTask];
          return savedTask;
        }
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();

    await settlePanel(panel);

    const builderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ tasks?: TaskDefinition[] } & HTMLElement)
      | null;

    builderView?.dispatchEvent(
      new CustomEvent("save-task-request", {
        detail: {
          task: {
            ...taskFixture(),
            id: "task-1",
            title: "Kitchen counters",
            active: false,
          },
        },
        bubbles: true,
        composed: true,
      })
    );

    await settlePanel(panel);

    const refreshedBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ tasks?: TaskDefinition[] } & HTMLElement)
      | null;

    expect(requestedTypes).toContain("ha_task_manager/save_task");
    expect(savedActiveValue).toBe(true);
    expect(refreshedBuilderView?.tasks?.find((task) => task.id === "task-1")?.active).toBe(true);
  });

  it("archives and restores tasks through admin actions", async () => {
    const requestedTypes: string[] = [];
    let storedTasks: TaskDefinition[] = [
      {
        ...taskFixture(),
        id: "task-1",
        title: "Kitchen counters",
        active: true,
      },
    ];

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return storedTasks;
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        case "ha_task_manager/archive_task": {
          storedTasks = storedTasks.map((task) =>
            task.id === String(message.task_id)
              ? {
                  ...task,
                  active: false,
                  updated_at: "2026-05-14T09:00:00+00:00",
                }
              : task
          );
          return storedTasks[0];
        }
        case "ha_task_manager/restore_task": {
          storedTasks = storedTasks.map((task) =>
            task.id === String(message.task_id)
              ? {
                  ...task,
                  active: true,
                  updated_at: "2026-05-14T09:05:00+00:00",
                }
              : task
          );
          return storedTasks[0];
        }
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();

    await settlePanel(panel);

    const builderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ tasks?: TaskDefinition[] } & HTMLElement)
      | null;

    builderView?.dispatchEvent(
      new CustomEvent("archive-task-request", {
        detail: { taskId: "task-1" },
        bubbles: true,
        composed: true,
      })
    );
    await settlePanel(panel);

    builderView?.dispatchEvent(
      new CustomEvent("restore-task-request", {
        detail: { taskId: "task-1" },
        bubbles: true,
        composed: true,
      })
    );
    await settlePanel(panel);

    const refreshedBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ tasks?: TaskDefinition[] } & HTMLElement)
      | null;

    expect(requestedTypes).toContain("ha_task_manager/archive_task");
    expect(requestedTypes).toContain("ha_task_manager/restore_task");
    expect(refreshedBuilderView?.tasks?.find((task) => task.id === "task-1")?.active).toBe(true);
  });

  it("loads custom-range snapshots and passes due instances into schedule snapshot view", async () => {
    const requestedMessages: WsMessage[] = [];

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      requestedMessages.push(message);
      const type = String(message.type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [
            {
              ...taskFixture(),
              id: "task-1",
              title: "Laundry",
            },
          ];
        case "ha_task_manager/due_instances":
          if (typeof message.to_date === "string") {
            return [
              {
                id: "due-snapshot-1",
                task_id: "task-1",
                due_date: "2026-05-20",
                skipped: false,
              },
            ];
          }
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();

    await settlePanel(panel);

    const snapshotFromInput = panel.shadowRoot?.querySelector("[data-snapshot-from-date]") as
      | HTMLInputElement
      | null;
    const snapshotToInput = panel.shadowRoot?.querySelector("[data-snapshot-to-date]") as
      | HTMLInputElement
      | null;
    const loadSnapshotButton = panel.shadowRoot?.querySelector("[data-load-snapshot-range]") as
      | HTMLButtonElement
      | null;

    snapshotFromInput!.value = "2026-05-01";
    snapshotFromInput!.dispatchEvent(new Event("input"));
    snapshotToInput!.value = "2026-05-31";
    snapshotToInput!.dispatchEvent(new Event("input"));
    loadSnapshotButton?.click();

    await settlePanel(panel);

    const snapshotRangeRequest = requestedMessages.find(
      (message) =>
        String(message.type) === "ha_task_manager/due_instances" &&
        message.from_date === "2026-05-01" &&
        message.to_date === "2026-05-31"
    );

    const snapshotView = panel.shadowRoot?.querySelector("task-manager-schedule-snapshot-view") as
      | ({ snapshotGroups?: Array<{ date: string }> } & HTMLElement)
      | null;

    expect(snapshotRangeRequest).toBeDefined();
    expect(snapshotView).not.toBeNull();
    expect(snapshotView?.snapshotGroups?.map((group) => group.date)).toEqual(["2026-05-20"]);
  });

  it("hands off snapshot quick-summary edit requests to the task builder", async () => {
    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [
            {
              ...taskFixture(),
              id: "task-1",
              title: "Laundry",
            },
          ];
        case "ha_task_manager/due_instances":
          if (typeof message.to_date === "string") {
            return [
              {
                id: "due-snapshot-1",
                task_id: "task-1",
                due_date: "2026-05-20",
                skipped: false,
              },
            ];
          }
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();
    await settlePanel(panel);

    const snapshotFromInput = panel.shadowRoot?.querySelector("[data-snapshot-from-date]") as
      | HTMLInputElement
      | null;
    const snapshotToInput = panel.shadowRoot?.querySelector("[data-snapshot-to-date]") as
      | HTMLInputElement
      | null;
    const loadSnapshotButton = panel.shadowRoot?.querySelector("[data-load-snapshot-range]") as
      | HTMLButtonElement
      | null;

    snapshotFromInput!.value = "2026-05-01";
    snapshotFromInput!.dispatchEvent(new Event("input"));
    snapshotToInput!.value = "2026-05-31";
    snapshotToInput!.dispatchEvent(new Event("input"));
    loadSnapshotButton?.click();
    await settlePanel(panel);

    const snapshotView = panel.shadowRoot?.querySelector("task-manager-schedule-snapshot-view") as
      | ({ updateComplete?: Promise<unknown> } & HTMLElement)
      | null;

    const snapshotItemButton = snapshotView?.shadowRoot?.querySelector(
      '[data-snapshot-item="due-snapshot-1"]'
    ) as HTMLButtonElement | null;
    snapshotItemButton?.click();
    await snapshotView?.updateComplete;

    const quickSummary = snapshotView?.shadowRoot?.querySelector("[data-quick-summary]") as HTMLElement | null;
    expect(quickSummary?.textContent).toContain("Assignee: Alex");
    expect(quickSummary?.textContent).toContain("Selected due date: 2026-05-20");
    expect(quickSummary?.textContent).toContain("Snapshot range: 2026-05-01 to 2026-05-31");

    const editButton = snapshotView?.shadowRoot?.querySelector(
      "[data-edit-task-button]"
    ) as HTMLButtonElement | null;
    editButton?.click();

    await settlePanel(panel);

    const builderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ handoffTaskId?: string } & HTMLElement)
      | null;

    expect(builderView?.handoffTaskId).toBe("task-1");
  });

  it("re-applies snapshot edit handoff when requesting the same task id again", async () => {
    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [
            {
              ...taskFixture(),
              id: "task-1",
              title: "Laundry",
            },
          ];
        case "ha_task_manager/due_instances":
          if (typeof message.to_date === "string") {
            return [
              {
                id: "due-snapshot-1",
                task_id: "task-1",
                due_date: "2026-05-20",
                skipped: false,
              },
            ];
          }
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();
    await settlePanel(panel);

    const snapshotFromInput = panel.shadowRoot?.querySelector("[data-snapshot-from-date]") as
      | HTMLInputElement
      | null;
    const snapshotToInput = panel.shadowRoot?.querySelector("[data-snapshot-to-date]") as
      | HTMLInputElement
      | null;
    const loadSnapshotButton = panel.shadowRoot?.querySelector("[data-load-snapshot-range]") as
      | HTMLButtonElement
      | null;

    snapshotFromInput!.value = "2026-05-01";
    snapshotFromInput!.dispatchEvent(new Event("input"));
    snapshotToInput!.value = "2026-05-31";
    snapshotToInput!.dispatchEvent(new Event("input"));
    loadSnapshotButton?.click();
    await settlePanel(panel);

    const triggerSnapshotEdit = async () => {
      const snapshotView = panel.shadowRoot?.querySelector("task-manager-schedule-snapshot-view") as
        | ({ updateComplete?: Promise<unknown> } & HTMLElement)
        | null;

      const snapshotItemButton = snapshotView?.shadowRoot?.querySelector(
        '[data-snapshot-item="due-snapshot-1"]'
      ) as HTMLButtonElement | null;
      snapshotItemButton?.click();
      await snapshotView?.updateComplete;

      const editButton = snapshotView?.shadowRoot?.querySelector(
        "[data-edit-task-button]"
      ) as HTMLButtonElement | null;
      editButton?.click();
      await settlePanel(panel);
    };

    await triggerSnapshotEdit();

    const builderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ updateComplete?: Promise<unknown> } & HTMLElement)
      | null;
    const heading = builderView?.shadowRoot?.querySelector("h3");
    expect(heading?.textContent?.trim()).toBe("Edit Task");

    const newTaskButton = builderView?.shadowRoot?.querySelector("button.new-button") as
      | HTMLButtonElement
      | null;
    newTaskButton?.click();
    await builderView?.updateComplete;

    expect(heading?.textContent?.trim()).toBe("Create Task");

    await triggerSnapshotEdit();

    expect(heading?.textContent?.trim()).toBe("Edit Task");
  });

  it("replays snapshot edit handoff for the same task id after admin user context switches", async () => {
    let activeUserId: "ha-user-1" | "ha-user-2" = "ha-user-1";

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const callHandler = async (message: WsMessage) => {
      const type = String(message.type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: activeUserId,
            mapped: true,
            profile_id: activeUserId === "ha-user-1" ? "profile-1" : "profile-2",
            display_name: activeUserId === "ha-user-1" ? "Alex" : "Jordan",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: activeUserId === "ha-user-1" ? "profile-1" : "profile-2",
              display_name: activeUserId === "ha-user-1" ? "Alex" : "Jordan",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [
            {
              ...taskFixture(),
              id: "task-1",
              title: activeUserId === "ha-user-1" ? "Laundry (Alex)" : "Laundry (Jordan)",
              assigned_profile_id: activeUserId === "ha-user-1" ? "profile-1" : "profile-2",
            },
          ];
        case "ha_task_manager/due_instances":
          if (typeof message.to_date === "string") {
            return [
              {
                id: `due-snapshot-${activeUserId}`,
                task_id: "task-1",
                due_date: "2026-05-20",
                skipped: false,
              },
            ];
          }
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    };

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = createHass(callHandler, { isAdmin: true, userId: "ha-user-1" });
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();
    await settlePanel(panel);

    const loadSnapshotAndTriggerEdit = async () => {
      const snapshotFromInput = panel.shadowRoot?.querySelector("[data-snapshot-from-date]") as
        | HTMLInputElement
        | null;
      const snapshotToInput = panel.shadowRoot?.querySelector("[data-snapshot-to-date]") as
        | HTMLInputElement
        | null;
      const loadSnapshotButton = panel.shadowRoot?.querySelector("[data-load-snapshot-range]") as
        | HTMLButtonElement
        | null;

      snapshotFromInput!.value = "2026-05-01";
      snapshotFromInput!.dispatchEvent(new Event("input"));
      snapshotToInput!.value = "2026-05-31";
      snapshotToInput!.dispatchEvent(new Event("input"));
      loadSnapshotButton?.click();
      await settlePanel(panel);

      const snapshotView = panel.shadowRoot?.querySelector("task-manager-schedule-snapshot-view") as
        | ({ updateComplete?: Promise<unknown> } & HTMLElement)
        | null;
      const snapshotItemButton = snapshotView?.shadowRoot?.querySelector("[data-snapshot-item]") as
        | HTMLButtonElement
        | null;
      snapshotItemButton?.click();
      await snapshotView?.updateComplete;

      const editButton = snapshotView?.shadowRoot?.querySelector(
        "[data-edit-task-button]"
      ) as HTMLButtonElement | null;
      editButton?.click();
      await settlePanel(panel);
    };

    await loadSnapshotAndTriggerEdit();

    const builderViewUser1 = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | HTMLElement
      | null;
    const titleInputUser1 = builderViewUser1?.shadowRoot?.querySelector(
      "input[required]"
    ) as HTMLInputElement | null;
    expect(titleInputUser1?.value).toBe("Laundry (Alex)");

    activeUserId = "ha-user-2";
    panel.hass = createHass(callHandler, { isAdmin: true, userId: "ha-user-2" });
    await settlePanel(panel);

    expect(panel.shadowRoot?.textContent).toContain("Signed in as Jordan");

    await loadSnapshotAndTriggerEdit();

    const builderViewUser2 = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | HTMLElement
      | null;
    const titleInputUser2 = builderViewUser2?.shadowRoot?.querySelector(
      "input[required]"
    ) as HTMLInputElement | null;

    expect(titleInputUser2?.value).toBe("Laundry (Jordan)");
  });

  it("blocks snapshot loading when either snapshot date is blank", async () => {
    const requestedMessages: WsMessage[] = [];

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      requestedMessages.push(message);
      const type = String(message.type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [taskFixture()];
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();
    await settlePanel(panel);

    const snapshotFromInput = panel.shadowRoot?.querySelector("[data-snapshot-from-date]") as
      | HTMLInputElement
      | null;
    const snapshotToInput = panel.shadowRoot?.querySelector("[data-snapshot-to-date]") as
      | HTMLInputElement
      | null;
    const loadSnapshotButton = panel.shadowRoot?.querySelector("[data-load-snapshot-range]") as
      | HTMLButtonElement
      | null;

    const snapshotRequestCount = (): number =>
      requestedMessages.filter(
        (message) =>
          String(message.type) === "ha_task_manager/due_instances" &&
          message.horizon_days === undefined
      ).length;

    const beforeInvalidRequests = snapshotRequestCount();

    snapshotFromInput!.value = "2026-05-01";
    snapshotFromInput!.dispatchEvent(new Event("input"));
    snapshotToInput!.value = "";
    snapshotToInput!.dispatchEvent(new Event("input"));
    loadSnapshotButton?.click();
    await settlePanel(panel);

    expect(panel.shadowRoot?.textContent).toContain("Snapshot range requires valid start and end dates.");
    expect(snapshotRequestCount()).toBe(beforeInvalidRequests);

    snapshotToInput!.value = "2026-05-31";
    snapshotToInput!.dispatchEvent(new Event("input"));
    snapshotFromInput!.value = "";
    snapshotFromInput!.dispatchEvent(new Event("input"));
    loadSnapshotButton?.click();
    await settlePanel(panel);

    expect(panel.shadowRoot?.textContent).toContain("Snapshot range requires valid start and end dates.");
    expect(snapshotRequestCount()).toBe(beforeInvalidRequests);
  });

  it("keeps task save successful when snapshot refresh fails after save", async () => {
    const requestedTypes: string[] = [];
    let storedTasks = [
      {
        ...taskFixture(),
        id: "task-1",
        title: "Kitchen counters",
      },
    ];
    let shouldFailSnapshotRefresh = false;

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const hass = createHass(async (message) => {
      const type = String(message.type);
      requestedTypes.push(type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return storedTasks;
        case "ha_task_manager/due_instances":
          if (typeof message.to_date === "string" && shouldFailSnapshotRefresh) {
            throw new Error("Snapshot refresh failed");
          }
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        case "ha_task_manager/save_task": {
          shouldFailSnapshotRefresh = true;
          const requestTask = message.task as TaskDefinition;
          const savedTask = {
            ...requestTask,
            id: "task-1",
            title: "Kitchen counters refreshed",
            updated_at: "2026-05-14T09:05:00+00:00",
          };
          storedTasks = [savedTask];
          return savedTask;
        }
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    }, { isAdmin: true });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = hass;
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();

    await settlePanel(panel);

    const builderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ statusMessage?: string; errorMessage?: string; tasks?: TaskDefinition[] } & HTMLElement)
      | null;

    builderView?.dispatchEvent(
      new CustomEvent("save-task-request", {
        detail: {
          task: {
            ...taskFixture(),
            id: "task-1",
            title: "Kitchen counters refreshed",
          },
        },
        bubbles: true,
        composed: true,
      })
    );

    await settlePanel(panel);

    const refreshedBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ statusMessage?: string; errorMessage?: string; tasks?: TaskDefinition[] } & HTMLElement)
      | null;

    expect(requestedTypes).toContain("ha_task_manager/save_task");
    expect(refreshedBuilderView?.statusMessage).toBe("Saved Kitchen counters refreshed.");
    expect(refreshedBuilderView?.errorMessage).toBe("");
    expect(panel.shadowRoot?.textContent).toContain("Snapshot refresh failed");
    expect(refreshedBuilderView?.tasks?.map((task) => task.title)).toContain("Kitchen counters refreshed");
  });

  it("ignores a stale in-flight save result after the hass user context changes", async () => {
    const saveRequest = createDeferred<TaskDefinition>();

    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const createTaskForUser = (userId: "ha-user-1" | "ha-user-2"): TaskDefinition => ({
      ...taskFixture(),
      id: userId === "ha-user-1" ? "task-1" : "task-2",
      title: userId === "ha-user-1" ? "Alex Task" : "Jordan Task",
      assigned_profile_id: userId === "ha-user-1" ? "profile-1" : "profile-2",
    });

    const createAdminHass = (userId: "ha-user-1" | "ha-user-2") =>
      createHass(async (message) => {
        const type = String(message.type);

        switch (type) {
          case "ha_task_manager/current_profile":
            return {
              ha_user_id: userId,
              mapped: true,
              profile_id: userId === "ha-user-1" ? "profile-1" : "profile-2",
              display_name: userId === "ha-user-1" ? "Alex" : "Jordan",
            };
          case "ha_task_manager/profiles":
            return [
              {
                id: userId === "ha-user-1" ? "profile-1" : "profile-2",
                display_name: userId === "ha-user-1" ? "Alex Profile" : "Jordan Profile",
                avatar_url: "",
                created_at: "2026-05-10T00:00:00+00:00",
              },
            ];
          case "ha_task_manager/tasks":
            return [createTaskForUser(userId)];
          case "ha_task_manager/due_instances":
            return [];
          case "ha_task_manager/pending_confirmations":
            return [];
          case "ha_task_manager/profile_mappings":
            return [];
          case "ha_task_manager/ha_users":
            return [];
          case "ha_task_manager/unmapped_nfc_tags":
            return [];
          case "ha_task_manager/save_task":
            if (userId !== "ha-user-1") {
              throw new Error("Unexpected save request for refreshed context");
            }
            return saveRequest.promise;
          default:
            throw new Error(`Unexpected websocket call: ${type}`);
        }
      }, { isAdmin: true, userId });

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    (panel as unknown as { currentView: string }).currentView = "admin";
    panel.hass = createAdminHass("ha-user-1");
    document.body.append(panel);

    await settlePanel(panel);

    const initialBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ saving?: boolean; statusMessage?: string; tasks?: TaskDefinition[] } & HTMLElement)
      | null;

    initialBuilderView?.dispatchEvent(
      new CustomEvent("save-task-request", {
        detail: {
          task: {
            ...taskFixture(),
            id: "task-draft",
            title: "Stale Save Task",
          },
        },
        bubbles: true,
        composed: true,
      })
    );

    await panel.updateComplete;
    await Promise.resolve();
    await panel.updateComplete;

    expect(initialBuilderView?.saving).toBe(true);

    panel.hass = createAdminHass("ha-user-2");
    await settlePanel(panel);

    const refreshedBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ saving?: boolean; statusMessage?: string; tasks?: TaskDefinition[] } & HTMLElement)
      | null;

    expect(panel.shadowRoot?.textContent).toContain("Signed in as Jordan");
    expect(refreshedBuilderView?.saving).toBe(false);
    expect(refreshedBuilderView?.statusMessage).toBe("");
    expect(refreshedBuilderView?.tasks?.map((task) => task.title)).toEqual(["Jordan Task"]);

    saveRequest.resolve({
      ...taskFixture(),
      id: "task-stale",
      title: "Stale Save Task",
      assigned_profile_id: "profile-1",
      created_at: "2026-05-14T09:00:00+00:00",
      updated_at: "2026-05-14T09:05:00+00:00",
    });
    await settlePanel(panel);

    const finalBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | ({ saving?: boolean; statusMessage?: string; tasks?: TaskDefinition[] } & HTMLElement)
      | null;

    expect(panel.shadowRoot?.textContent).toContain("Signed in as Jordan");
    expect(panel.shadowRoot?.textContent).not.toContain("Saved Stale Save Task.");
    expect(finalBuilderView?.saving).toBe(false);
    expect(finalBuilderView?.statusMessage).toBe("");
    expect(finalBuilderView?.tasks?.map((task) => task.title)).toEqual(["Jordan Task"]);
  });

  it("ignores direct save-task events after admin access is revoked", async () => {
    const requestedTypes: string[] = [];
    vi.spyOn(window, "setInterval").mockReturnValue(1);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);

    const callHandler = async (message: WsMessage) => {
      const type = String(message.type);
      requestedTypes.push(type);

      switch (type) {
        case "ha_task_manager/current_profile":
          return {
            ha_user_id: "ha-user-1",
            mapped: true,
            profile_id: "profile-1",
            display_name: "Alex",
          };
        case "ha_task_manager/profiles":
          return [
            {
              id: "profile-1",
              display_name: "Alex",
              avatar_url: "",
              created_at: "2026-05-10T00:00:00+00:00",
            },
          ];
        case "ha_task_manager/tasks":
          return [taskFixture()];
        case "ha_task_manager/due_instances":
          return [];
        case "ha_task_manager/pending_confirmations":
          return [];
        case "ha_task_manager/profile_mappings":
          return [];
        case "ha_task_manager/ha_users":
          return [];
        case "ha_task_manager/unmapped_nfc_tags":
          return [];
        case "ha_task_manager/save_task":
          return taskFixture();
        default:
          throw new Error(`Unexpected websocket call: ${type}`);
      }
    };

    const panel = document.createElement("ha-task-manager-panel") as HaTaskManagerPanel;
    panel.hass = createHass(callHandler, { isAdmin: true });
    document.body.append(panel);

    await settlePanel(panel);

    const manageTasksButton = Array.from(panel.shadowRoot?.querySelectorAll("nav button") ?? []).find(
      (button) => button.textContent?.trim() === "Manage Tasks"
    ) as HTMLButtonElement | undefined;
    manageTasksButton?.click();

    await settlePanel(panel);

    const staleTaskBuilderView = panel.shadowRoot?.querySelector("task-manager-task-builder-view") as
      | HTMLElement
      | null;

    expect(staleTaskBuilderView).not.toBeNull();

    panel.hass = createHass(callHandler, { isAdmin: false });
    await settlePanel(panel);

    requestedTypes.length = 0;

    staleTaskBuilderView?.dispatchEvent(
      new CustomEvent("save-task-request", {
        detail: { task: taskFixture() },
        bubbles: true,
        composed: true,
      })
    );

    await settlePanel(panel);

    expect(panel.shadowRoot?.querySelector("task-manager-task-builder-view")).toBeNull();
    expect(requestedTypes).not.toContain("ha_task_manager/save_task");
  });
});