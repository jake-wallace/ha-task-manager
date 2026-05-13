import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import "../components/task-card";

import type { HouseholdProfile, TaskDefinition, TaskDueInstance } from "../types/task";
import type { TaskCardStatus } from "../components/task-card";

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusForInstance(instance: TaskDueInstance, today: string): TaskCardStatus {
  if (instance.skipped) {
    return "skipped";
  }
  if (instance.due_date < today) {
    return "overdue";
  }
  if (instance.due_date === today) {
    return "due_today";
  }
  return "upcoming";
}

@customElement("task-manager-household-board-view")
export class HouseholdBoardView extends LitElement {
  @property({ attribute: false }) public tasks: TaskDefinition[] = [];

  @property({ attribute: false }) public dueInstances: TaskDueInstance[] = [];

  @property({ attribute: false }) public profiles: HouseholdProfile[] = [];

  static styles = css`
    :host {
      display: block;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 22px;
    }

    .metric {
      padding: 18px;
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(243, 246, 239, 0.96));
      border: 1px solid rgba(44, 67, 49, 0.08);
      box-shadow: 0 12px 26px rgba(34, 48, 36, 0.05);
    }

    .metric strong {
      display: block;
      margin-bottom: 6px;
      font-size: 1.4rem;
      color: #1f2d22;
    }

    .metric span {
      color: #647464;
    }

    .board {
      display: grid;
      gap: 20px;
    }

    .lane {
      padding: 18px;
      border-radius: 24px;
      border: 1px solid rgba(44, 67, 49, 0.08);
      background: rgba(248, 250, 245, 0.86);
    }

    .lane-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .lane-header h3 {
      margin: 0;
      color: #203024;
    }

    .lane-header span {
      color: #6b7a6b;
      font-size: 0.9rem;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }

    .empty {
      padding: 28px;
      border-radius: 24px;
      border: 1px dashed rgba(47, 76, 53, 0.18);
      background: rgba(244, 247, 240, 0.8);
      color: #536553;
      text-align: center;
    }
  `;

  protected render() {
    const taskMap = new Map(this.tasks.map((task) => [task.id, task]));
    const today = todayIso();
    const relevantInstances = this.dueInstances.filter((instance) => taskMap.has(instance.task_id));

    if (relevantInstances.length === 0) {
      return html`<div class="empty">No household tasks are scheduled in the current window.</div>`;
    }

    const overdueCount = relevantInstances.filter((instance) => instance.due_date < today && !instance.skipped).length;
    const dueTodayCount = relevantInstances.filter((instance) => instance.due_date === today && !instance.skipped).length;
    const upcomingCount = relevantInstances.filter((instance) => instance.due_date > today && !instance.skipped).length;

    const lanes = this.profiles.map((profile) => {
      const items = relevantInstances
        .filter((instance) => taskMap.get(instance.task_id)?.assigned_profile_id === profile.id)
        .slice()
        .sort((left, right) => left.due_date.localeCompare(right.due_date));
      return { profile, items };
    });

    const unassignedItems = relevantInstances
      .filter((instance) => {
        const task = taskMap.get(instance.task_id);
        return task ? !this.profiles.some((profile) => profile.id === task.assigned_profile_id) : false;
      })
      .slice()
      .sort((left, right) => left.due_date.localeCompare(right.due_date));

    return html`
      <div class="summary">
        <div class="metric"><strong>${relevantInstances.length}</strong><span>Total scheduled</span></div>
        <div class="metric"><strong>${overdueCount}</strong><span>Overdue</span></div>
        <div class="metric"><strong>${dueTodayCount}</strong><span>Due today</span></div>
        <div class="metric"><strong>${upcomingCount}</strong><span>Upcoming</span></div>
      </div>
      <div class="board">
        ${lanes.map(({ profile, items }) => this.renderLane(profile.display_name, items, taskMap, today))}
        ${unassignedItems.length > 0 ? this.renderLane("Unassigned", unassignedItems, taskMap, today) : nothing}
      </div>
    `;
  }

  private renderLane(
    label: string,
    instances: TaskDueInstance[],
    taskMap: Map<string, TaskDefinition>,
    today: string
  ) {
    return html`
      <section class="lane">
        <div class="lane-header">
          <h3>${label}</h3>
          <span>${instances.length} scheduled</span>
        </div>
        ${instances.length === 0
          ? html`<div class="empty">Nothing currently assigned.</div>`
          : html`
              <div class="cards">
                ${instances.map((instance) => {
                  const task = taskMap.get(instance.task_id);
                  if (!task) {
                    return nothing;
                  }

                  return html`
                    <task-manager-task-card
                      .task=${task}
                      .dueInstance=${instance}
                      .assigneeName=${label}
                      .status=${statusForInstance(instance, today)}
                      .showCompleteAction=${false}
                    ></task-manager-task-card>
                  `;
                })}
              </div>
            `}
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-manager-household-board-view": HouseholdBoardView;
  }
}