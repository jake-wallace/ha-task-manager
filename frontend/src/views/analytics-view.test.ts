import { afterEach, describe, expect, it } from "vitest";

import "./analytics-view";
import type { AnalyticsView } from "./analytics-view";

describe("task-manager-analytics-view", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("dispatches reset-analytics-baseline-request when reset is clicked", async () => {
    const element = document.createElement("task-manager-analytics-view") as AnalyticsView;
    const resetEvents: CustomEvent[] = [];

    element.addEventListener("reset-analytics-baseline-request", (event) => {
      resetEvents.push(event as CustomEvent);
    });

    document.body.append(element);
    await element.updateComplete;

    const resetButton = element.shadowRoot?.querySelector(
      "[data-reset-analytics-baseline]"
    ) as HTMLButtonElement | null;

    resetButton?.click();

    expect(resetEvents).toHaveLength(1);
  });

  it("dispatches include-deleted-history-change with includeDeletedTaskHistory", async () => {
    const element = document.createElement("task-manager-analytics-view") as AnalyticsView;
    const includeDeletedEvents: Array<{ includeDeletedTaskHistory: boolean }> = [];

    element.addEventListener("include-deleted-history-change", (event) => {
      includeDeletedEvents.push(
        (event as CustomEvent<{ includeDeletedTaskHistory: boolean }>).detail
      );
    });

    document.body.append(element);
    await element.updateComplete;

    const includeDeletedToggle = element.shadowRoot?.querySelector(
      "[data-include-deleted-history-toggle]"
    ) as HTMLInputElement | null;

    if (!includeDeletedToggle) {
      throw new Error("Expected include deleted history toggle");
    }

    includeDeletedToggle.checked = false;
    includeDeletedToggle.dispatchEvent(new Event("change"));

    includeDeletedToggle.checked = true;
    includeDeletedToggle.dispatchEvent(new Event("change"));

    expect(includeDeletedEvents).toEqual([
      { includeDeletedTaskHistory: false },
      { includeDeletedTaskHistory: true },
    ]);
  });

  it("defaults includeDeletedTaskHistory to true and renders checked toggle", async () => {
    const element = document.createElement("task-manager-analytics-view") as AnalyticsView;

    document.body.append(element);
    await element.updateComplete;

    const includeDeletedToggle = element.shadowRoot?.querySelector(
      "[data-include-deleted-history-toggle]"
    ) as HTMLInputElement | null;

    expect(element.includeDeletedTaskHistory).toBe(true);
    expect(includeDeletedToggle?.checked).toBe(true);
  });
});