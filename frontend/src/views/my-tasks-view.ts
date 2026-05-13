import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import "../components/task-card";

import type {
  CurrentUserProfile,
  HouseholdProfile,
  TaskDefinition,
  TaskDueInstance,
} from "../types/task";
import type { TaskCardStatus } from "../components/task-card";

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareDueDates(left: TaskDueInstance, right: TaskDueInstance): number {
  return left.due_date.localeCompare(right.due_date);
}

@customElement("task-manager-my-tasks-view")
export class MyTasksView extends LitElement {
  @property({ attribute: false }) public currentProfile: CurrentUserProfile | null = null;

  @property({ attribute: false }) public tasks: TaskDefinition[] = [];

  @property({ attribute: false }) public dueInstances: TaskDueInstance[] = [];

  @property({ attribute: false }) public profiles: HouseholdProfile[] = [];

  @property() public busyCompletionId = "";

  @property({ type: Number }) public pendingConfirmationCount = 0;

  static styles = css`
    :host {
      display: block;
    }

    .hero {
      display: grid;
      gap: 18px;
      margin-bottom: 22px;
      padding: 20px;
      border-radius: 24px;
      background: linear-gradient(135deg, rgba(44, 84, 54, 0.98), rgba(109, 146, 93, 0.92));
      color: #f7faf3;
      box-shadow: 0 18px 40px rgba(32, 52, 36, 0.18);
    }

    .hero-top {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 16px;
    }

    h2 {
      margin: 0;
      font-size: clamp(1.45rem, 2.8vw, 2rem);
      line-height: 1.05;
    }

    p {
      margin: 6px 0 0;
      color: rgba(247, 250, 243, 0.84);
      line-height: 1.55;
      max-width: 58ch;
    }

    .pending {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.12);
    }

    .pending button {
      appearance: none;
      border: none;
      border-radius: 999px;
      background: #f8faf5;
      color: #25412c;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      padding: 9px 14px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
    }

    .stat {
      padding: 14px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.12);
    }

    .stat strong {
      display: block;
      font-size: 1.5rem;
      line-height: 1;
      margin-bottom: 6px;
    }

    .section {
      margin-top: 24px;
    }

    .section-header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .section-header h3 {
      margin: 0;
      font-size: 1.15rem;
      color: #203024;
    }

    .section-header span {
      color: #6a7a6c;
      font-size: 0.9rem;
    }

    .grid {
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

    @media (max-width: 720px) {
      .hero-top,
      .section-header {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `;

  protected render() {
    const taskMap = new Map(this.tasks.map((task) => [task.id, task]));
    const profileMap = new Map(this.profiles.map((profile) => [profile.id, profile.display_name]));

    if (!this.currentProfile) {
      return html`<div class="empty">Loading your assigned tasks...</div>`;
    }

    if (!this.currentProfile.mapped || !this.currentProfile.profile_id) {
      return html`
        <section class="hero">
          <div class="hero-top">
            <div>
              <h2>My Tasks</h2>
              <p>
                Your Home Assistant user is not mapped to a household profile yet. Assignment-aware completion stays blocked until that identity link exists.
              </p>
            </div>
          </div>
          <div class="stats">
            <div class="stat"><strong>${this.pendingConfirmationCount}</strong><span>Pending NFC confirmations</span></div>
            <div class="stat"><strong>0</strong><span>Assigned tasks visible</span></div>
          </div>
        </section>
      `;
    }

    const myDueInstances = this.dueInstances
      .filter((instance) => taskMap.get(instance.task_id)?.assigned_profile_id === this.currentProfile?.profile_id)
      .slice()
      .sort(compareDueDates);

    const today = todayIso();
    const overdue = myDueInstances.filter((instance) => instance.due_date < today && !instance.skipped);
    const dueToday = myDueInstances.filter((instance) => instance.due_date === today && !instance.skipped);
    const upcoming = myDueInstances.filter((instance) => instance.due_date > today && !instance.skipped);

    return html`
      <section class="hero">
        <div class="hero-top">
          <div>
            <h2>${this.currentProfile.display_name ?? "Your"} Tasks</h2>
            <p>Due today and overdue tasks can be confirmed directly here. Upcoming items stay visible so the day ahead is clear.</p>
          </div>
          ${this.pendingConfirmationCount > 0
            ? html`
                <div class="pending">
                  <span>${this.pendingConfirmationCount} NFC confirmation${this.pendingConfirmationCount === 1 ? "" : "s"} waiting</span>
                  <button type="button" @click=${this.reviewPending}>Review</button>
                </div>
              `
            : nothing}
        </div>
        <div class="stats">
          <div class="stat"><strong>${overdue.length}</strong><span>Overdue</span></div>
          <div class="stat"><strong>${dueToday.length}</strong><span>Due today</span></div>
          <div class="stat"><strong>${upcoming.length}</strong><span>Upcoming</span></div>
        </div>
      </section>
      ${this.renderSection("Overdue", "Oldest open items first.", overdue, taskMap, profileMap, "overdue", true)}
      ${this.renderSection("Due Today", "Current assignments that are ready to confirm.", dueToday, taskMap, profileMap, "due_today", true)}
      ${this.renderSection("Upcoming", "Forward-looking schedule for the next stretch.", upcoming, taskMap, profileMap, "upcoming", false)}
      ${myDueInstances.length === 0
        ? html`<div class="empty">Nothing is scheduled for you in the current window.</div>`
        : nothing}
    `;
  }

  private renderSection(
    title: string,
    subtitle: string,
    instances: TaskDueInstance[],
    taskMap: Map<string, TaskDefinition>,
    profileMap: Map<string, string>,
    status: TaskCardStatus,
    showCompleteAction: boolean
  ) {
    if (instances.length === 0) {
      return nothing;
    }

    return html`
      <section class="section">
        <div class="section-header">
          <h3>${title}</h3>
          <span>${subtitle}</span>
        </div>
        <div class="grid">
          ${instances.map((instance) => {
            const task = taskMap.get(instance.task_id);
            if (!task) {
              return nothing;
            }

            return html`
              <task-manager-task-card
                .task=${task}
                .dueInstance=${instance}
                .assigneeName=${profileMap.get(task.assigned_profile_id) ?? "Unassigned"}
                .status=${status}
                .busy=${this.busyCompletionId === instance.id}
                .showCompleteAction=${showCompleteAction}
              ></task-manager-task-card>
            `;
          })}
        </div>
      </section>
    `;
  }

  private reviewPending(): void {
    this.dispatchEvent(
      new CustomEvent("review-pending-confirmations", {
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-manager-my-tasks-view": MyTasksView;
  }
}