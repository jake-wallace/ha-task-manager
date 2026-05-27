import { afterEach, describe, expect, it } from "vitest";

import "./destructive-confirm-dialog.js";
import type { DestructiveConfirmDialog } from "./destructive-confirm-dialog.js";

describe("task-manager-destructive-confirm-dialog", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps confirm disabled until exact delete is entered", async () => {
    const element = document.createElement(
      "task-manager-destructive-confirm-dialog"
    ) as DestructiveConfirmDialog;

    element.open = true;
    document.body.append(element);
    await element.updateComplete;

    const confirmButton = element.shadowRoot?.querySelector(
      '[data-action="confirm"]'
    ) as HTMLButtonElement | null;
    const input = element.shadowRoot?.querySelector(
      '[data-action="confirm-input"]'
    ) as HTMLInputElement | null;

    expect(confirmButton?.disabled).toBe(true);

    if (!input) {
      throw new Error("Expected confirmation input to exist");
    }

    input.value = "Delete";
    input.dispatchEvent(new Event("input"));
    await element.updateComplete;
    expect(confirmButton?.disabled).toBe(true);

    input.value = "delete";
    input.dispatchEvent(new Event("input"));
    await element.updateComplete;
    expect(confirmButton?.disabled).toBe(false);
  });

  it("emits confirm-request with confirm text when valid", async () => {
    const element = document.createElement(
      "task-manager-destructive-confirm-dialog"
    ) as DestructiveConfirmDialog;

    element.open = true;
    document.body.append(element);
    await element.updateComplete;

    const events: CustomEvent[] = [];
    element.addEventListener("confirm-request", (event: Event) => {
      events.push(event as CustomEvent);
    });

    const input = element.shadowRoot?.querySelector(
      '[data-action="confirm-input"]'
    ) as HTMLInputElement | null;
    const confirmButton = element.shadowRoot?.querySelector(
      '[data-action="confirm"]'
    ) as HTMLButtonElement | null;

    if (!input || !confirmButton) {
      throw new Error("Expected confirmation controls to exist");
    }

    input.value = "delete";
    input.dispatchEvent(new Event("input"));
    await element.updateComplete;

    confirmButton.click();

    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toEqual({ confirmText: "delete" });
  });

  it("emits dismiss-request when cancel is clicked", async () => {
    const element = document.createElement(
      "task-manager-destructive-confirm-dialog"
    ) as DestructiveConfirmDialog;

    element.open = true;
    document.body.append(element);
    await element.updateComplete;

    const events: CustomEvent[] = [];
    element.addEventListener("dismiss-request", (event: Event) => {
      events.push(event as CustomEvent);
    });

    const cancelButton = element.shadowRoot?.querySelector(
      '[data-action="dismiss"]'
    ) as HTMLButtonElement | null;

    cancelButton?.click();

    expect(events).toHaveLength(1);
  });
});
