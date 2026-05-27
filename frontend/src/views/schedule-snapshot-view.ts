import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { SnapshotGroup, TaskDefinition, TaskDueInstance } from "../types/task";

function describeRecurrence(task: TaskDefinition): string {
  const { frequency, days_of_week, interval_days, day_of_month } = task.recurrence;

  if (frequency === "weekly") {
    if (days_of_week.length === 0) {
      return "Weekly";
    }

    const weekdayLabels = days_of_week
      .slice()
      .sort((left, right) => left - right)
      .map((day) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day - 1] ?? `Day ${day}`);

    return `Weekly on ${weekdayLabels.join(", ")}`;
  }

  if (frequency === "monthly") {
    return `Monthly on day ${day_of_month ?? 1}`;
  }

  if (frequency === "custom_days") {
    return `Every ${interval_days} days`;
  }

  return "Daily";
}

interface SnapshotSelection {
  dueInstance: TaskDueInstance;
  task: TaskDefinition | null;
}

@customElement("task-manager-schedule-snapshot-view")
export class ScheduleSnapshotView extends LitElement {
  @property({ attribute: false }) public snapshotGroups: SnapshotGroup[] = [];

  @property({ attribute: false }) public tasksById: Record<string, TaskDefinition> = {};

  @property({ attribute: false }) public profileLabelsById: Record<string, string> = {};

  @property() public snapshotFromDate = "";

  @property() public snapshotToDate = "";

  @property({ type: Boolean }) public loading = false;

  @property() public errorMessage = "";

  @state() private selectedDueInstanceId = "";

  static styles = css`
    :host {
      display: block;
    }

    .state,
    .error,
    .empty {
      padding: 20px;
      border-radius: 18px;
    }

    .state,
    .empty {
      background: rgba(245, 248, 242, 0.92);
      color: #586a58;
      border: 1px dashed rgba(47, 76, 53, 0.2);
    }

    .error {
      background: rgba(195, 92, 67, 0.12);
      color: #8d3526;
      font-weight: 600;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(240px, 1fr);
      gap: 16px;
      align-items: start;
    }

    .groups {
      display: grid;
      gap: 14px;
    }

    .group {
      border-radius: 18px;
      border: 1px solid rgba(44, 67, 49, 0.1);
      background: rgba(255, 255, 255, 0.92);
      padding: 14px;
      display: grid;
      gap: 10px;
    }

    .group h3 {
      margin: 0;
      font-size: 1rem;
      color: #27402d;
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
      border: 1px solid rgba(44, 67, 49, 0.12);
      border-radius: 14px;
      background: rgba(248, 250, 246, 0.95);
      padding: 10px 12px;
      text-align: left;
      cursor: pointer;
      color: #253428;
      display: grid;
      gap: 4px;
      font: inherit;
    }

    .item.is-selected {
      border-color: rgba(47, 107, 71, 0.42);
      background: rgba(235, 245, 236, 0.98);
    }

    .summary {
      border-radius: 18px;
      border: 1px solid rgba(44, 67, 49, 0.1);
      background: rgba(250, 252, 248, 0.94);
      padding: 16px;
      display: grid;
      gap: 10px;
    }

    .summary h4 {
      margin: 0;
      color: #1f3225;
      font-size: 1rem;
    }

    .summary p {
      margin: 0;
      color: #627362;
      line-height: 1.45;
    }

    .summary button {
      appearance: none;
      justify-self: start;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      padding: 10px 14px;
    }

    .summary-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .summary button[data-edit-task-button] {
      background: #2f6b47;
      color: #f8faf6;
    }

    .summary button[data-close-summary-button] {
      background: rgba(50, 75, 57, 0.1);
      color: #294132;
    }

    @media (max-width: 840px) {
      .layout {
        grid-template-columns: 1fr;
      }
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
      return html`<div class="state">Loading schedule snapshot...</div>`;
    }

    if (this.errorMessage) {
      return html`<div class="error">${this.errorMessage}</div>`;
    }

    if (this.snapshotGroups.length === 0) {
      return html`<div class="empty">No schedule snapshots are available.</div>`;
    }

    const selection = this.selectedSnapshot;

    return html`
      <div class="layout">
        <div class="groups">
          ${this.snapshotGroups.map((group) => this.renderGroup(group))}
        </div>
        ${selection ? this.renderQuickSummary(selection) : this.renderEmptySummary()}
      </div>
    `;
  }

  private renderGroup(group: SnapshotGroup) {
    return html`
      <section class="group" data-snapshot-group=${group.date}>
        <h3 data-snapshot-date>${group.date}</h3>
        <ul>
          ${group.items.map((item) => this.renderItem(item))}
        </ul>
      </section>
    `;
  }

  private renderItem(item: TaskDueInstance) {
    const task = this.tasksById[item.task_id];
    const selected = this.selectedDueInstanceId === item.id;

    return html`
      <li>
        <button
          type="button"
          class="item ${selected ? "is-selected" : ""}"
          data-snapshot-item=${item.id}
          @click=${() => this.selectDueInstance(item.id)}
        >
          <strong>${task?.title ?? "Unknown task"}</strong>
          <span>Due ${item.due_date}</span>
        </button>
      </li>
    `;
  }

  private renderQuickSummary(selection: SnapshotSelection) {
    const task = selection.task;
    const assigneeLabel = task
      ? (this.profileLabelsById[task.assigned_profile_id] ?? task.assigned_profile_id)
      : "Unknown profile";
    const recurrenceLabel = task ? describeRecurrence(task) : "Unknown recurrence";
    const activeStateLabel = task ? (task.active ? "Active" : "Archived") : "Unknown";

    return html`
      <aside class="summary" data-quick-summary>
        <h4>${task?.title ?? "Task details"}</h4>
        <p>Assignee: ${assigneeLabel}</p>
        <p>Recurrence: ${recurrenceLabel}</p>
        <p>Selected due date: ${selection.dueInstance.due_date}</p>
        <p>Snapshot range: ${this.rangeContextLabel}</p>
        <p>State: ${activeStateLabel}</p>
        <div class="summary-actions">
          <button
            type="button"
            data-edit-task-button
            ?disabled=${!task}
            @click=${() => this.emitEditTaskRequest(selection.dueInstance.task_id)}
          >
            Edit Task
          </button>
          <button
            type="button"
            data-close-summary-button
            @click=${this.closeSummary}
          >
            Close
          </button>
        </div>
      </aside>
    `;
  }

  private renderEmptySummary() {
    return html`
      <aside class="summary">
        <p>Select a snapshot item to review details.</p>
      </aside>
    `;
  }

  private selectDueInstance(dueInstanceId: string): void {
    this.selectedDueInstanceId = dueInstanceId;
  }

  private closeSummary = (): void => {
    this.selectedDueInstanceId = "";
  };

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

  private get rangeContextLabel(): string {
    if (this.snapshotFromDate && this.snapshotToDate) {
      return `${this.snapshotFromDate} to ${this.snapshotToDate}`;
    }

    if (this.snapshotFromDate) {
      return `From ${this.snapshotFromDate}`;
    }

    if (this.snapshotToDate) {
      return `Through ${this.snapshotToDate}`;
    }

    return "Current range";
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