import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { TaskDefinition, TaskDueInstance } from "../types/task";

export interface SnapshotGroup {
  date: string;
  items: TaskDueInstance[];
}

interface SnapshotSelection {
  dueInstance: TaskDueInstance;
  task: TaskDefinition | null;
}

@customElement("task-manager-schedule-snapshot-view")
export class ScheduleSnapshotView extends LitElement {
  @property({ attribute: false }) public snapshotGroups: SnapshotGroup[] = [];

  @property({ attribute: false }) public tasksById: Record<string, TaskDefinition> = {};

  @property({ type: Boolean }) public loading = false;

  @property() public errorMessage = "";

  @state() private selectedDueInstanceId = "";

  static styles = css`
    :host {
      display: block;
    }

    .layout {
      display: grid;
      gap: 12px;
    }

    .group {
      border: 1px solid rgba(44, 67, 49, 0.15);
      border-radius: 14px;
      padding: 12px;
    }

    .group h3 {
      margin: 0 0 8px;
    }

    .group ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }

    .item {
      width: 100%;
      text-align: left;
      cursor: pointer;
    }

    .summary {
      border: 1px solid rgba(44, 67, 49, 0.15);
      border-radius: 14px;
      padding: 12px;
    }
  `;

  protected willUpdate(changedProperties: Map<PropertyKey, unknown>): void {
    if (
      changedProperties.has("snapshotGroups") &&
      this.selectedDueInstanceId &&
      !this.findDueInstanceById(this.selectedDueInstanceId)
    ) {
      this.selectedDueInstanceId = "";
    }
  }

  protected render() {
    if (this.loading) {
      return html`<p>Loading schedule snapshot...</p>`;
    }

    if (this.errorMessage) {
      return html`<p>${this.errorMessage}</p>`;
    }

    if (this.snapshotGroups.length === 0) {
      return html`<p>No schedule snapshots are available.</p>`;
    }

    const selection = this.selectedSnapshot;

    return html`
      <div class="layout">
        <div>
          ${this.snapshotGroups.map((group) => this.renderGroup(group))}
        </div>
        ${selection ? this.renderQuickSummary(selection) : html`<aside class="summary">Select a snapshot item.</aside>`}
      </div>
    `;
  }

  private renderGroup(group: SnapshotGroup) {
    return html`
      <section class="group" data-snapshot-group=${group.date}>
        <h3>${group.date}</h3>
        <ul>
          ${group.items.map((item) => this.renderItem(item))}
        </ul>
      </section>
    `;
  }

  private renderItem(item: TaskDueInstance) {
    const task = this.tasksById[item.task_id];

    return html`
      <li>
        <button
          class="item"
          type="button"
          data-snapshot-item=${item.id}
          @click=${() => this.selectDueInstance(item.id)}
        >
          ${task?.title ?? "Unknown task"}
        </button>
      </li>
    `;
  }

  private renderQuickSummary(selection: SnapshotSelection) {
    return html`
      <aside class="summary" data-quick-summary>
        <h4>${selection.task?.title ?? "Task details"}</h4>
        <p>Due date: ${selection.dueInstance.due_date}</p>
        <button
          type="button"
          data-edit-task-button
          @click=${() => this.emitEditTaskRequest(selection.dueInstance.task_id)}
        >
          Edit Task
        </button>
      </aside>
    `;
  }

  private selectDueInstance(dueInstanceId: string): void {
    this.selectedDueInstanceId = dueInstanceId;
  }

  private emitEditTaskRequest(taskId: string): void {
    this.dispatchEvent(
      new CustomEvent("edit-task-request", {
        detail: { taskId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private get selectedSnapshot(): SnapshotSelection | null {
    if (!this.selectedDueInstanceId) {
      return null;
    }

    for (const group of this.snapshotGroups) {
      const dueInstance = group.items.find((item) => item.id === this.selectedDueInstanceId);
      if (dueInstance) {
        return {
          dueInstance,
          task: this.tasksById[dueInstance.task_id] ?? null,
        };
      }
    }

    return null;
  }

  private findDueInstanceById(dueInstanceId: string): TaskDueInstance | null {
    for (const group of this.snapshotGroups) {
      const dueInstance = group.items.find((item) => item.id === dueInstanceId);
      if (dueInstance) {
        return dueInstance;
      }
    }

    return null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-manager-schedule-snapshot-view": ScheduleSnapshotView;
  }
}