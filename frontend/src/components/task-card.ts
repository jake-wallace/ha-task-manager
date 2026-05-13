import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import type { TaskDefinition, TaskDueInstance } from "../types/task";

export type TaskCardStatus = "overdue" | "due_today" | "upcoming" | "skipped";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  weekday: "short"
});

function formatDueDate(value: string): string {
  return DATE_FORMATTER.format(new Date(`${value}T12:00:00`));
}

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

@customElement("task-manager-task-card")
export class TaskCard extends LitElement {
  @property({ attribute: false }) public task: TaskDefinition | null = null;

  @property({ attribute: false }) public dueInstance: TaskDueInstance | null = null;

  @property() public assigneeName = "";

  @property() public status: TaskCardStatus = "upcoming";

  @property({ type: Boolean }) public busy = false;

  @property({ type: Boolean }) public showCompleteAction = false;

  static styles = css`
    :host {
      display: block;
    }

    article {
      border-radius: 22px;
      border: 1px solid rgba(44, 67, 49, 0.1);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(245, 247, 241, 0.98));
      padding: 18px;
      box-shadow: 0 14px 30px rgba(34, 48, 36, 0.06);
    }

    header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    h3 {
      margin: 0;
      font-size: 1.05rem;
      line-height: 1.2;
      color: #1f2d22;
    }

    p {
      margin: 0;
      color: #556456;
      line-height: 1.5;
      font-size: 0.94rem;
    }

    .description {
      margin-bottom: 14px;
      min-height: 2.8em;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .badge.overdue {
      background: rgba(195, 92, 67, 0.14);
      color: #8d3526;
    }

    .badge.due_today {
      background: rgba(216, 154, 43, 0.16);
      color: #8b5a06;
    }

    .badge.upcoming,
    .badge.skipped {
      background: rgba(62, 138, 87, 0.12);
      color: #2e6441;
    }

    dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 14px;
      margin: 0;
    }

    dt {
      margin: 0 0 4px;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #708070;
    }

    dd {
      margin: 0;
      color: #263528;
      font-weight: 600;
    }

    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 18px;
    }

    button {
      appearance: none;
      border: none;
      border-radius: 999px;
      background: #2f6b47;
      color: #f8faf6;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      padding: 10px 16px;
      transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
      box-shadow: 0 10px 20px rgba(47, 107, 71, 0.18);
    }

    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 14px 24px rgba(47, 107, 71, 0.22);
    }

    button:disabled {
      cursor: wait;
      opacity: 0.6;
      transform: none;
      box-shadow: none;
    }

    .footnote {
      color: #667566;
      font-size: 0.82rem;
    }

    @media (max-width: 640px) {
      dl {
        grid-template-columns: 1fr;
      }

      footer {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `;

  protected render() {
    if (!this.task || !this.dueInstance) {
      return nothing;
    }

    const statusLabel = {
      overdue: "Overdue",
      due_today: "Due Today",
      upcoming: "Upcoming",
      skipped: "Skipped"
    }[this.status];

    return html`
      <article>
        <header>
          <div>
            <h3>${this.task.title}</h3>
          </div>
          <span class="badge ${this.status}">${statusLabel}</span>
        </header>
        <p class="description">${this.task.description || "No description yet."}</p>
        <dl>
          <div>
            <dt>Due</dt>
            <dd>${formatDueDate(this.dueInstance.due_date)}</dd>
          </div>
          <div>
            <dt>Recurs</dt>
            <dd>${describeRecurrence(this.task)}</dd>
          </div>
          <div>
            <dt>Assigned To</dt>
            <dd>${this.assigneeName || "Unassigned"}</dd>
          </div>
          <div>
            <dt>NFC</dt>
            <dd>${this.task.nfc_tag_id ? "Mapped" : "Not mapped"}</dd>
          </div>
        </dl>
        <footer>
          <span class="footnote">Due instance ${this.dueInstance.id}</span>
          ${this.showCompleteAction
            ? html`
                <button type="button" ?disabled=${this.busy} @click=${this.handleComplete}>
                  ${this.busy ? "Completing..." : "Mark Complete"}
                </button>
              `
            : nothing}
        </footer>
      </article>
    `;
  }

  private handleComplete(): void {
    if (!this.dueInstance || !this.task || this.busy) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("task-complete-request", {
        detail: {
          dueInstanceId: this.dueInstance.id,
          dueDate: this.dueInstance.due_date,
          taskTitle: this.task.title,
        },
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-manager-task-card": TaskCard;
  }
}