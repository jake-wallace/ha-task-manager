import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type {
  HaUserSummary,
  HouseholdProfile,
  NfcDiscoveryEntry,
  RecurrenceFrequency,
  SkipWindow,
  TaskDefinition,
  UserProfileMapping,
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

function randomToken(length = 8): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, length);
  }

  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  }

  const fallback = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return fallback.slice(0, length).padEnd(length, "0");
}

@customElement("task-manager-task-builder-view")
export class TaskBuilderView extends LitElement {
  @property({ attribute: false }) public tasks: TaskDefinition[] = [];

  @property({ attribute: false }) public profiles: HouseholdProfile[] = [];

  @property({ attribute: false }) public profileMappings: UserProfileMapping[] = [];

  @property({ attribute: false }) public haUsers: HaUserSummary[] = [];

  @property({ attribute: false }) public unmappedTags: NfcDiscoveryEntry[] = [];

  @property({ attribute: false }) public handoffTaskId = "";

  @property({ type: Number }) public handoffRequestId = 0;

  @property() public draftContextKey = "";

  @property({ type: Boolean }) public saving = false;

  @property() public statusMessage = "";

  @property() public errorMessage = "";

  @state() private selectedTaskId = NEW_TASK_ID;

  @state() private formState: TaskFormState = emptyFormState([]);

  @state() private localError = "";

  private lastAppliedHandoffTaskId = "";

  private lastAppliedHandoffRequestId = -1;

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

    .task-section {
      display: grid;
      gap: 8px;
    }

    .task-section h4 {
      margin: 2px 0;
      color: #28402e;
      font-size: 0.95rem;
    }

    .section-empty {
      margin: 0;
      color: #6a7b6b;
      font-size: 0.9rem;
    }

    .task-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 8px;
      align-items: center;
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

      .task-row {
        grid-template-columns: 1fr;
      }
    }
  `;

  protected willUpdate(changedProperties: Map<PropertyKey, unknown>): void {
    if (changedProperties.has("draftContextKey")) {
      this.lastAppliedHandoffTaskId = "";
      this.lastAppliedHandoffRequestId = -1;

      if (this.selectedTaskId === NEW_TASK_ID) {
        this.localError = "";
        this.formState = emptyFormState(this.profiles);
      }
    }

    if (
      (changedProperties.has("handoffTaskId") ||
        changedProperties.has("handoffRequestId") ||
        changedProperties.has("tasks")) &&
      this.handoffTaskId
    ) {
      const handoffTask = this.tasks.find((task) => task.id === this.handoffTaskId);
      const hasNewHandoffRequest = this.handoffRequestId !== this.lastAppliedHandoffRequestId;
      const hasNewHandoffTask = this.handoffTaskId !== this.lastAppliedHandoffTaskId;

      if (handoffTask && (hasNewHandoffRequest || hasNewHandoffTask)) {
        this.selectedTaskId = handoffTask.id;
        this.localError = "";
        this.formState = formStateFromTask(handoffTask);
        this.lastAppliedHandoffTaskId = handoffTask.id;
        this.lastAppliedHandoffRequestId = this.handoffRequestId;
      }
    }

    if (changedProperties.has("profiles") && !this.formState.assignedProfileId) {
      this.formState = {
        ...this.formState,
        assignedProfileId: this.profiles[0]?.id ?? "",
      };
    }

    if (
      this.selectedTaskId === NEW_TASK_ID &&
      (changedProperties.has("profiles") || changedProperties.has("unmappedTags"))
    ) {
      const profileIds = new Set(this.profiles.map((profile) => profile.id));
      const nextAssignedProfileId = profileIds.has(this.formState.assignedProfileId)
        ? this.formState.assignedProfileId
        : this.profiles[0]?.id ?? "";
      const availableTagIds = new Set(this.unmappedTags.map((tag) => tag.tag_id));
      const nextNfcTagId =
        this.formState.nfcTagId && availableTagIds.has(this.formState.nfcTagId)
          ? this.formState.nfcTagId
          : "";

      if (
        nextAssignedProfileId !== this.formState.assignedProfileId ||
        nextNfcTagId !== this.formState.nfcTagId
      ) {
        this.formState = {
          ...this.formState,
          assignedProfileId: nextAssignedProfileId,
          nfcTagId: nextNfcTagId,
        };
      }
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
    const activeTasks = this.tasks.filter((task) => task.active);
    const archivedTasks = this.tasks.filter((task) => !task.active);

    return html`
      <div class="layout">
        <aside class="panel">
          <h2>Manage Tasks</h2>
          <p>Create a new recurring task or load an existing definition for editing.</p>
          <button class="new-button ${this.selectedTaskId === NEW_TASK_ID ? "active" : ""}" type="button" @click=${this.startNewTask}>
            New Task
          </button>
          <div class="task-list">
            <section class="task-section" data-active-task-list>
              <h4>Active Tasks</h4>
              ${activeTasks.length === 0
                ? html`<p class="section-empty">No active tasks yet.</p>`
                : activeTasks.map(
                    (task) => html`
                      <div class="task-row">
                        <button
                          class="task-button ${this.selectedTaskId === task.id ? "active" : ""}"
                          type="button"
                          @click=${() => this.selectTask(task.id)}
                        >
                          <strong>${task.title}</strong>
                          <div>Active · ${task.recurrence.frequency}</div>
                        </button>
                        <button
                          class="inline-action"
                          type="button"
                          data-archive-task-id=${task.id}
                          ?disabled=${this.saving}
                          @click=${() => this.requestArchive(task.id)}
                        >
                          Archive
                        </button>
                      </div>
                    `
                  )}
            </section>
            <section class="task-section" data-archived-task-list>
              <h4>Archived Tasks</h4>
              ${archivedTasks.length === 0
                ? html`<p class="section-empty">No archived tasks.</p>`
                : archivedTasks.map(
                    (task) => html`
                      <div class="task-row">
                        <button
                          class="task-button ${this.selectedTaskId === task.id ? "active" : ""}"
                          type="button"
                          @click=${() => this.selectTask(task.id)}
                        >
                          <strong>${task.title}</strong>
                          <div>Archived · ${task.recurrence.frequency}</div>
                        </button>
                        <button
                          class="inline-action"
                          type="button"
                          data-edit-archived-task-id=${task.id}
                          ?disabled=${this.saving}
                          @click=${() => this.selectTask(task.id)}
                        >
                          Edit
                        </button>
                        <button
                          class="inline-action"
                          type="button"
                          data-restore-task-id=${task.id}
                          ?disabled=${this.saving}
                          @click=${() => this.requestRestore(task.id)}
                        >
                          Restore
                        </button>
                      </div>
                    `
                  )}
            </section>
          </div>
        </aside>
        <section class="panel">
          <h3>${this.selectedTaskId === NEW_TASK_ID ? "Create Task" : "Edit Task"}</h3>
          <div class="messages">
            ${this.statusMessage ? html`<div class="success">${this.statusMessage}</div>` : html``}
            ${this.errorMessage || this.localError ? html`<div class="error">${this.errorMessage || this.localError}</div>` : html``}
          </div>
          <form @submit=${this.handleSubmit} novalidate>
            <div class="row">
              <label>
                Title
                <input .value=${this.formState.title} @input=${this.handleTextInput("title")} required />
              </label>
              <label>
                Assigned profile
                <select
                  data-assignee-select
                  .value=${this.formState.assignedProfileId}
                  @change=${this.handleTextInput("assignedProfileId")}
                  required
                >
                  ${this.profiles.length === 0
                    ? html`<option value="">Import a profile in Setup first</option>`
                    : html``}
                  ${this.profiles.map(
                    (profile) => html`
                      <option value=${profile.id}>${this.renderProfileLabel(profile)}</option>
                    `
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
                NFC tag
                <select
                  data-nfc-tag-select
                  .value=${this.formState.nfcTagId}
                  @change=${this.handleTextInput("nfcTagId")}
                >
                  <option value="">Optional</option>
                  ${this.availableNfcTagIds.map(
                    (tagId) => html`<option value=${tagId}>${tagId}</option>`
                  )}
                </select>
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

  private requestArchive(taskId: string): void {
    const taskTitle = this.tasks.find((task) => task.id === taskId)?.title ?? "this task";
    const confirmed =
      typeof window.confirm !== "function"
        ? true
        : window.confirm(`Archive ${taskTitle}? You can restore it later.`);

    if (!confirmed) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("archive-task-request", {
        detail: { taskId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private requestRestore(taskId: string): void {
    this.dispatchEvent(
      new CustomEvent("restore-task-request", {
        detail: { taskId },
        bubbles: true,
        composed: true,
      })
    );
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

  private renderProfileLabel(profile: HouseholdProfile): string {
    const mapping = this.profileMappings.find((candidate) => candidate.profile_id === profile.id);
    if (!mapping) {
      return profile.display_name;
    }

    const haUser = this.haUsers.find((candidate) => candidate.id === mapping.ha_user_id);
    if (!haUser) {
      return profile.display_name;
    }

    return `${profile.display_name} (${haUser.name})`;
  }

  private get availableNfcTagIds(): string[] {
    const seenTagIds = new Set<string>();
    const tagIds: string[] = [];

    if (this.formState.nfcTagId) {
      seenTagIds.add(this.formState.nfcTagId);
      tagIds.push(this.formState.nfcTagId);
    }

    for (const tag of this.unmappedTags) {
      if (seenTagIds.has(tag.tag_id)) {
        continue;
      }
      seenTagIds.add(tag.tag_id);
      tagIds.push(tag.tag_id);
    }

    return tagIds;
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
          id: `skip-${randomToken(8)}`,
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
    const taskId = existingTask?.id ?? `task-${slugify(this.formState.title)}-${randomToken(8)}`;

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
      active: existingTask?.active ?? true,
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
    if (this.profiles.length === 0) {
      return "Import at least one user profile in Setup before creating tasks.";
    }
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