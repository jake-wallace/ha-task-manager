import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type {
  HouseholdProfile,
  RecurrenceFrequency,
  SkipWindow,
  TaskDefinition,
} from "../types/task";

const NEW_TASK_ID = "__new__";

interface TaskFormState {
  title: string;
  description: string;
  assignedProfileId: string;
  nfcTagId: string;
  active: boolean;
  startDate: string;
  frequency: RecurrenceFrequency;
  daysOfWeek: number[];
  intervalDays: number;
  dayOfMonth: number;
  skipWindows: SkipWindow[];
}

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyFormState(profiles: HouseholdProfile[]): TaskFormState {
  return {
    title: "",
    description: "",
    assignedProfileId: profiles[0]?.id ?? "",
    nfcTagId: "",
    active: true,
    startDate: todayIso(),
    frequency: "weekly",
    daysOfWeek: [1],
    intervalDays: 2,
    dayOfMonth: 1,
    skipWindows: [],
  };
}

function formStateFromTask(task: TaskDefinition): TaskFormState {
  return {
    title: task.title,
    description: task.description,
    assignedProfileId: task.assigned_profile_id,
    nfcTagId: task.nfc_tag_id ?? "",
    active: task.active,
    startDate: task.start_date,
    frequency: task.recurrence.frequency,
    daysOfWeek: task.recurrence.days_of_week.slice(),
    intervalDays: task.recurrence.interval_days,
    dayOfMonth: task.recurrence.day_of_month ?? 1,
    skipWindows: task.skip_windows.map((skipWindow) => ({ ...skipWindow })),
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "task";
}

@customElement("task-manager-task-builder-view")
export class TaskBuilderView extends LitElement {
  @property({ attribute: false }) public tasks: TaskDefinition[] = [];

  @property({ attribute: false }) public profiles: HouseholdProfile[] = [];

  @property({ type: Boolean }) public saving = false;

  @property() public statusMessage = "";

  @property() public errorMessage = "";

  @state() private selectedTaskId = NEW_TASK_ID;

  @state() private formState: TaskFormState = emptyFormState([]);

  @state() private localError = "";

  static styles = css`
    :host {
      display: block;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(240px, 0.85fr) minmax(0, 1.5fr);
      gap: 18px;
    }

    .panel {
      border-radius: 24px;
      border: 1px solid rgba(44, 67, 49, 0.08);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 247, 240, 0.98));
      padding: 18px;
      box-shadow: 0 14px 30px rgba(34, 48, 36, 0.05);
    }

    h2,
    h3 {
      margin: 0;
      color: #203024;
    }

    p {
      color: #627362;
      line-height: 1.55;
    }

    .task-list {
      display: grid;
      gap: 10px;
      margin-top: 16px;
    }

    .task-button,
    .new-button {
      appearance: none;
      border: 1px solid rgba(44, 67, 49, 0.1);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.92);
      cursor: pointer;
      color: #203024;
      font: inherit;
      padding: 14px;
      text-align: left;
      transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
    }

    .task-button:hover,
    .new-button:hover {
      transform: translateY(-1px);
      border-color: rgba(47, 107, 71, 0.28);
      box-shadow: 0 10px 20px rgba(47, 107, 71, 0.09);
    }

    .task-button.active,
    .new-button.active {
      border-color: rgba(47, 107, 71, 0.44);
      background: rgba(238, 246, 239, 0.98);
    }

    form {
      display: grid;
      gap: 16px;
      margin-top: 12px;
    }

    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    label {
      display: grid;
      gap: 8px;
      color: #304132;
      font-weight: 600;
    }

    input,
    textarea,
    select {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(44, 67, 49, 0.14);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.96);
      color: #203024;
      font: inherit;
      padding: 12px 14px;
    }

    textarea {
      min-height: 92px;
      resize: vertical;
    }

    .frequency-grid,
    .weekday-grid,
    .skip-window-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .skip-window-list {
      display: grid;
      gap: 12px;
    }

    .skip-window-card {
      display: grid;
      gap: 12px;
      padding: 14px;
      border-radius: 18px;
      border: 1px solid rgba(44, 67, 49, 0.1);
      background: rgba(245, 248, 242, 0.9);
    }

    .inline-action {
      appearance: none;
      justify-self: start;
      border: none;
      border-radius: 999px;
      background: rgba(50, 75, 57, 0.08);
      color: #294132;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      padding: 9px 14px;
    }

    .chip {
      appearance: none;
      border: 1px solid rgba(44, 67, 49, 0.12);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.92);
      color: #294132;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      padding: 10px 14px;
    }

    .chip.active {
      background: #2f6b47;
      color: #f8faf6;
      border-color: #2f6b47;
    }

    .messages {
      display: grid;
      gap: 10px;
    }

    .success,
    .error {
      padding: 13px 15px;
      border-radius: 18px;
      font-weight: 600;
    }

    .success {
      background: rgba(62, 138, 87, 0.12);
      color: #2d6540;
    }

    .error {
      background: rgba(195, 92, 67, 0.12);
      color: #8d3526;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 6px;
    }

    .actions button {
      appearance: none;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      padding: 10px 16px;
    }

    .ghost {
      background: rgba(50, 75, 57, 0.08);
      color: #294132;
    }

    .primary {
      background: #2f6b47;
      color: #f8faf6;
    }

    button:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    @media (max-width: 920px) {
      .layout,
      .row {
        grid-template-columns: 1fr;
      }
    }
  `;

  protected willUpdate(changedProperties: Map<PropertyKey, unknown>): void {
    if (changedProperties.has("profiles") && !this.formState.assignedProfileId) {
      this.formState = {
        ...this.formState,
        assignedProfileId: this.profiles[0]?.id ?? "",
      };
    }

    if (changedProperties.has("tasks")) {
      const selectedTask = this.tasks.find((task) => task.id === this.selectedTaskId);
      if (selectedTask) {
        this.formState = formStateFromTask(selectedTask);
      } else if (this.selectedTaskId !== NEW_TASK_ID) {
        this.selectedTaskId = NEW_TASK_ID;
        this.formState = emptyFormState(this.profiles);
      } else if (!changedProperties.has("profiles") && this.tasks.length === 0 && !this.formState.title) {
        this.formState = emptyFormState(this.profiles);
      }
    }
  }

  protected render() {
    return html`
      <div class="layout">
        <aside class="panel">
          <h2>Manage Tasks</h2>
          <p>Create a new recurring task or load an existing definition for editing.</p>
          <button class="new-button ${this.selectedTaskId === NEW_TASK_ID ? "active" : ""}" type="button" @click=${this.startNewTask}>
            New Task
          </button>
          <div class="task-list">
            ${this.tasks.map(
              (task) => html`
                <button
                  class="task-button ${this.selectedTaskId === task.id ? "active" : ""}"
                  type="button"
                  @click=${() => this.selectTask(task.id)}
                >
                  <strong>${task.title}</strong>
                  <div>${task.active ? "Active" : "Paused"} · ${task.recurrence.frequency}</div>
                </button>
              `
            )}
          </div>
        </aside>
        <section class="panel">
          <h3>${this.selectedTaskId === NEW_TASK_ID ? "Create Task" : "Edit Task"}</h3>
          <div class="messages">
            ${this.statusMessage ? html`<div class="success">${this.statusMessage}</div>` : html``}
            ${this.errorMessage || this.localError ? html`<div class="error">${this.errorMessage || this.localError}</div>` : html``}
          </div>
          <form @submit=${this.handleSubmit}>
            <div class="row">
              <label>
                Title
                <input .value=${this.formState.title} @input=${this.handleTextInput("title")} required />
              </label>
              <label>
                Assigned profile
                <select .value=${this.formState.assignedProfileId} @change=${this.handleTextInput("assignedProfileId")} required>
                  ${this.profiles.map(
                    (profile) => html`<option value=${profile.id}>${profile.display_name}</option>`
                  )}
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea .value=${this.formState.description} @input=${this.handleTextInput("description")}></textarea>
            </label>
            <div class="row">
              <label>
                Start date
                <input type="date" .value=${this.formState.startDate} @input=${this.handleTextInput("startDate")} required />
              </label>
              <label>
                NFC tag ID
                <input .value=${this.formState.nfcTagId} @input=${this.handleTextInput("nfcTagId")} placeholder="Optional" />
              </label>
            </div>
            <label>
              Recurrence
              <div class="frequency-grid">
                ${([
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                  { value: "custom_days", label: "Every N Days" },
                ] as Array<{ value: RecurrenceFrequency; label: string }>).map(
                  (option) => html`
                    <button
                      type="button"
                      class="chip ${this.formState.frequency === option.value ? "active" : ""}"
                      @click=${() => this.setFrequency(option.value)}
                    >
                      ${option.label}
                    </button>
                  `
                )}
              </div>
            </label>
            ${this.formState.frequency === "weekly"
              ? html`
                  <label>
                    Days of week
                    <div class="weekday-grid">
                      ${[
                        { day: 1, label: "Mon" },
                        { day: 2, label: "Tue" },
                        { day: 3, label: "Wed" },
                        { day: 4, label: "Thu" },
                        { day: 5, label: "Fri" },
                        { day: 6, label: "Sat" },
                        { day: 7, label: "Sun" },
                      ].map(
                        ({ day, label }) => html`
                          <button
                            type="button"
                            class="chip ${this.formState.daysOfWeek.includes(day) ? "active" : ""}"
                            @click=${() => this.toggleWeekday(day)}
                          >
                            ${label}
                          </button>
                        `
                      )}
                    </div>
                  </label>
                `
              : html``}
            ${this.formState.frequency === "custom_days"
              ? html`
                  <label>
                    Interval days
                    <input
                      type="number"
                      min="1"
                      .value=${String(this.formState.intervalDays)}
                      @input=${this.handleNumberInput("intervalDays")}
                      required
                    />
                  </label>
                `
              : html``}
            ${this.formState.frequency === "monthly"
              ? html`
                  <label>
                    Day of month
                    <input
                      type="number"
                      min="1"
                      max="31"
                      .value=${String(this.formState.dayOfMonth)}
                      @input=${this.handleNumberInput("dayOfMonth")}
                      required
                    />
                  </label>
                `
              : html``}
            <label>
              Skip windows
              <div class="skip-window-list">
                ${this.formState.skipWindows.map(
                  (skipWindow, index) => html`
                    <div class="skip-window-card">
                      <div class="row">
                        <label>
                          Label
                          <input
                            .value=${skipWindow.label}
                            @input=${this.handleSkipWindowText(index, "label")}
                            placeholder="Vacation, renovation, travel"
                          />
                        </label>
                        <label>
                          Start date
                          <input
                            type="date"
                            .value=${skipWindow.start_date}
                            @input=${this.handleSkipWindowText(index, "start_date")}
                            required
                          />
                        </label>
                      </div>
                      <div class="row">
                        <label>
                          End date
                          <input
                            type="date"
                            .value=${skipWindow.end_date}
                            @input=${this.handleSkipWindowText(index, "end_date")}
                            required
                          />
                        </label>
                      </div>
                      <button
                        class="inline-action"
                        type="button"
                        @click=${() => this.removeSkipWindow(index)}
                      >
                        Remove skip window
                      </button>
                    </div>
                  `
                )}
                <button class="inline-action" type="button" @click=${this.addSkipWindow}>
                  Add skip window
                </button>
              </div>
            </label>
            <label>
              <input type="checkbox" .checked=${this.formState.active} @change=${this.toggleActive} />
              Active task
            </label>
            <div class="actions">
              <button class="ghost" type="button" ?disabled=${this.saving} @click=${this.resetForm}>
                Reset
              </button>
              <button class="primary" type="submit" ?disabled=${this.saving}>
                ${this.saving ? "Saving..." : this.selectedTaskId === NEW_TASK_ID ? "Create Task" : "Save Changes"}
              </button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  private startNewTask(): void {
    this.selectedTaskId = NEW_TASK_ID;
    this.localError = "";
    this.formState = emptyFormState(this.profiles);
  }

  private selectTask(taskId: string): void {
    const task = this.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return;
    }
    this.selectedTaskId = task.id;
    this.localError = "";
    this.formState = formStateFromTask(task);
  }

  private setFrequency(frequency: RecurrenceFrequency): void {
    this.localError = "";
    this.formState = {
      ...this.formState,
      frequency,
      daysOfWeek: frequency === "weekly" ? (this.formState.daysOfWeek.length > 0 ? this.formState.daysOfWeek : [1]) : [],
      intervalDays: frequency === "custom_days" ? Math.max(this.formState.intervalDays, 1) : this.formState.intervalDays,
    };
  }

  private toggleWeekday(day: number): void {
    const days = this.formState.daysOfWeek.includes(day)
      ? this.formState.daysOfWeek.filter((value) => value !== day)
      : [...this.formState.daysOfWeek, day].sort((left, right) => left - right);
    this.localError = "";
    this.formState = {
      ...this.formState,
      daysOfWeek: days,
    };
  }

  private toggleActive(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    this.localError = "";
    this.formState = {
      ...this.formState,
      active: target.checked,
    };
  }

  private handleTextInput(field: keyof Pick<TaskFormState, "title" | "description" | "assignedProfileId" | "nfcTagId" | "startDate">) {
    return (event: Event) => {
      const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      this.localError = "";
      this.formState = {
        ...this.formState,
        [field]: target.value,
      };
    };
  }

  private handleNumberInput(field: keyof Pick<TaskFormState, "intervalDays" | "dayOfMonth">) {
    return (event: Event) => {
      const target = event.currentTarget as HTMLInputElement;
      this.localError = "";
      this.formState = {
        ...this.formState,
        [field]: Number(target.value),
      };
    };
  }

  private resetForm(): void {
    if (this.selectedTaskId === NEW_TASK_ID) {
      this.formState = emptyFormState(this.profiles);
    } else {
      const task = this.tasks.find((candidate) => candidate.id === this.selectedTaskId);
      if (task) {
        this.formState = formStateFromTask(task);
      }
    }
    this.localError = "";
  }

  private addSkipWindow = (): void => {
    this.localError = "";
    this.formState = {
      ...this.formState,
      skipWindows: [
        ...this.formState.skipWindows,
        {
          id: `skip-${crypto.randomUUID().slice(0, 8)}`,
          label: "",
          start_date: this.formState.startDate,
          end_date: this.formState.startDate,
        },
      ],
    };
  };

  private removeSkipWindow(index: number): void {
    this.localError = "";
    this.formState = {
      ...this.formState,
      skipWindows: this.formState.skipWindows.filter((_, currentIndex) => currentIndex !== index),
    };
  }

  private handleSkipWindowText(index: number, field: keyof Pick<SkipWindow, "label" | "start_date" | "end_date">) {
    return (event: Event) => {
      const target = event.currentTarget as HTMLInputElement;
      const skipWindows = this.formState.skipWindows.map((skipWindow, currentIndex) =>
        currentIndex === index ? { ...skipWindow, [field]: target.value } : skipWindow
      );
      this.localError = "";
      this.formState = {
        ...this.formState,
        skipWindows,
      };
    };
  }

  private handleSubmit(event: Event): void {
    event.preventDefault();
    this.localError = this.validateForm();
    if (this.localError) {
      return;
    }

    const existingTask = this.tasks.find((task) => task.id === this.selectedTaskId) ?? null;
    const nowIsoString = new Date().toISOString();
    const taskId = existingTask?.id ?? `task-${slugify(this.formState.title)}-${crypto.randomUUID().slice(0, 8)}`;

    const task: TaskDefinition = {
      id: taskId,
      title: this.formState.title.trim(),
      description: this.formState.description.trim(),
      recurrence: {
        frequency: this.formState.frequency,
        days_of_week: this.formState.frequency === "weekly" ? this.formState.daysOfWeek.slice().sort((left, right) => left - right) : [],
        interval_days: this.formState.frequency === "custom_days" ? this.formState.intervalDays : 1,
        day_of_month: this.formState.frequency === "monthly" ? this.formState.dayOfMonth : null,
      },
      skip_windows: this.formState.skipWindows.map((skipWindow) => ({
        ...skipWindow,
        label: skipWindow.label.trim(),
      })),
      assigned_profile_id: this.formState.assignedProfileId,
      nfc_tag_id: this.formState.nfcTagId.trim() || null,
      active: this.formState.active,
      start_date: this.formState.startDate,
      created_at: existingTask?.created_at ?? nowIsoString,
      updated_at: nowIsoString,
    };

    this.dispatchEvent(
      new CustomEvent("save-task-request", {
        detail: { task },
        bubbles: true,
        composed: true,
      })
    );
  }

  private validateForm(): string {
    if (!this.formState.title.trim()) {
      return "Task title is required.";
    }
    if (!this.formState.assignedProfileId) {
      return "Choose an assignee.";
    }
    if (!this.formState.startDate) {
      return "Start date is required.";
    }
    if (this.formState.frequency === "weekly" && this.formState.daysOfWeek.length === 0) {
      return "Choose at least one weekday for a weekly task.";
    }
    if (this.formState.frequency === "custom_days" && this.formState.intervalDays < 1) {
      return "Custom-day recurrence must repeat at least every 1 day.";
    }
    if (
      this.formState.frequency === "monthly" &&
      (this.formState.dayOfMonth < 1 || this.formState.dayOfMonth > 31)
    ) {
      return "Monthly recurrence day must be between 1 and 31.";
    }
    if (
      this.formState.skipWindows.some(
        (skipWindow) =>
          !skipWindow.start_date ||
          !skipWindow.end_date ||
          skipWindow.start_date > skipWindow.end_date
      )
    ) {
      return "Each skip window needs a valid start and end date.";
    }

    return "";
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-manager-task-builder-view": TaskBuilderView;
  }
}