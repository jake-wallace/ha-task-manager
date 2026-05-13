import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import {
  completeDueInstance,
  confirmCompletion,
  fetchAnalytics,
  fetchCurrentProfile,
  fetchDueInstances,
  fetchPendingConfirmations,
  fetchProfiles,
  fetchTasks,
  saveTask,
} from "./api/client";
import "./components/completion-dialog";
import "./components/nfc-confirm-dialog";
import "./views/analytics-view";
import "./views/household-board-view";
import "./views/my-tasks-view";
import "./views/task-builder-view";

import type {
  CompletionAttempt,
  CurrentUserProfile,
  HouseholdProfile,
  ProfileAnalyticsSnapshot,
  TaskDefinition,
  TaskDueInstance,
} from "./types/task";

type PanelView = "my-tasks" | "household" | "analytics" | "admin";

interface HomeAssistantLike {
  callWS: <T>(message: Record<string, unknown>) => Promise<T>;
}

interface NavigationTab {
  id: PanelView;
  label: string;
  description: string;
}

const NAVIGATION_TABS: NavigationTab[] = [
  {
    id: "my-tasks",
    label: "My Tasks",
    description: "Assignment-aware due work and manual completion."
  },
  {
    id: "household",
    label: "Household Board",
    description: "Shared view of scheduled work by assignee."
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Trend charts and KPI snapshots from immutable history."
  },
  {
    id: "admin",
    label: "Manage Tasks",
    description: "Create and update recurring household tasks."
  }
];

interface ManualCompletionDialogState {
  dueInstanceId: string;
  dueDate: string;
  taskTitle: string;
}

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftIsoDate(baseIso: string, offsetDays: number): string {
  const baseDate = new Date(`${baseIso}T12:00:00`);
  baseDate.setDate(baseDate.getDate() + offsetDays);
  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, "0");
  const day = String(baseDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

@customElement("ha-task-manager-panel")
export class HaTaskManagerPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistantLike;

  @state() private currentView: PanelView = "my-tasks";

  @state() private coreLoading = true;

  @state() private analyticsLoading = false;

  @state() private panelError = "";

  @state() private currentProfile: CurrentUserProfile | null = null;

  @state() private profiles: HouseholdProfile[] = [];

  @state() private tasks: TaskDefinition[] = [];

  @state() private dueInstances: TaskDueInstance[] = [];

  @state() private pendingConfirmations: CompletionAttempt[] = [];

  @state() private analyticsSnapshots: Record<string, ProfileAnalyticsSnapshot> = {};

  @state() private manualCompletionDialog: ManualCompletionDialogState | null = null;

  @state() private manualCompletionBusy = false;

  @state() private manualCompletionError = "";

  @state() private activeNfcAttemptId = "";

  @state() private nfcBusy = false;

  @state() private nfcError = "";

  @state() private taskBuilderSaving = false;

  @state() private taskBuilderStatusMessage = "";

  @state() private taskBuilderErrorMessage = "";

  private pendingPollHandle: number | null = null;

  private hasLoadedInitialData = false;

  private snoozedPendingAttemptIds = new Set<string>();

  static styles = css`
    :host {
      display: block;
      min-height: 100%;
      box-sizing: border-box;
      background:
        radial-gradient(circle at top left, rgba(76, 175, 80, 0.14), transparent 24%),
        linear-gradient(180deg, rgba(250, 252, 247, 0.96), rgba(241, 245, 236, 0.92));
      color: var(--primary-text-color, #1f2a1f);
      font-family: var(
        --ha-task-manager-font,
        "Avenir Next",
        "Segoe UI",
        sans-serif
      );
    }

    main {
      box-sizing: border-box;
      max-width: 1120px;
      margin: 0 auto;
      padding: 24px 20px 40px;
    }

    header {
      margin-bottom: 24px;
      display: grid;
      gap: 18px;
    }

    .hero {
      padding: 24px;
      border-radius: 28px;
      background: linear-gradient(135deg, rgba(36, 74, 47, 0.98), rgba(107, 143, 91, 0.9));
      color: #f7faf3;
      box-shadow: 0 24px 54px rgba(32, 52, 36, 0.18);
    }

    .hero-top {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 16px;
    }

    h1 {
      margin: 0;
      font-size: clamp(1.75rem, 3vw, 2.5rem);
      line-height: 1.1;
      letter-spacing: -0.04em;
    }

    p {
      margin: 8px 0 0;
      max-width: 68ch;
      color: rgba(247, 250, 243, 0.84);
      line-height: 1.6;
    }

    .hero-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }

    .hero-stat {
      padding: 14px 16px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.12);
    }

    .hero-stat strong {
      display: block;
      margin-bottom: 6px;
      font-size: 1.45rem;
      line-height: 1;
    }

    .hero-tag {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 24px;
    }

    button {
      appearance: none;
      border: 1px solid rgba(46, 78, 46, 0.14);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.7);
      color: inherit;
      cursor: pointer;
      font: inherit;
      padding: 10px 16px;
      transition: background-color 160ms ease, border-color 160ms ease,
        transform 160ms ease;
    }

    button:hover {
      background: rgba(255, 255, 255, 0.92);
      border-color: rgba(46, 78, 46, 0.24);
      transform: translateY(-1px);
    }

    button[aria-selected="true"] {
      background: #2f5d38;
      border-color: #2f5d38;
      color: #f9fbf7;
    }

    .error-banner {
      padding: 14px 16px;
      border-radius: 18px;
      background: rgba(195, 92, 67, 0.12);
      color: #8d3526;
      font-weight: 600;
    }

    section {
      padding: 28px;
      border: 1px solid rgba(46, 78, 46, 0.12);
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.78);
      box-shadow: 0 20px 48px rgba(37, 56, 37, 0.08);
    }

    h2 {
      margin: 0 0 10px;
      font-size: 1.25rem;
      color: #203024;
    }

    .subtitle {
      margin: 0;
      color: #5f705f;
      max-width: none;
    }

    .view-shell {
      margin-top: 18px;
    }

    @media (max-width: 640px) {
      main {
        padding-inline: 14px;
      }

      .hero-top {
        flex-direction: column;
        align-items: stretch;
      }

      section {
        padding: 22px;
      }
    }
  `;

  protected updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has("hass") && this.hass) {
      this.hasLoadedInitialData = true;
      void this.loadCoreData();
      this.startPendingPolling();
    }

    if (changedProperties.has("currentView") && this.currentView === "analytics") {
      void this.loadAnalytics();
    }
  }

  public disconnectedCallback(): void {
    if (this.pendingPollHandle !== null) {
      window.clearInterval(this.pendingPollHandle);
      this.pendingPollHandle = null;
    }
    super.disconnectedCallback();
  }

  protected render() {
    const activeTab = NAVIGATION_TABS.find((tab) => tab.id === this.currentView);
    const today = todayIso();
    const currentProfileId = this.currentProfile?.profile_id;
    const myTaskIds = new Set(
      this.tasks
        .filter((task) => task.assigned_profile_id === currentProfileId)
        .map((task) => task.id)
    );
    const myDueInstances = this.dueInstances.filter((instance) => myTaskIds.has(instance.task_id));
    const overdueCount = myDueInstances.filter((instance) => instance.due_date < today && !instance.skipped).length;
    const dueTodayCount = myDueInstances.filter((instance) => instance.due_date === today && !instance.skipped).length;
    const pendingCount = this.pendingConfirmations.length;

    return html`
      <main>
        <header>
          <div class="hero">
            <div class="hero-top">
              <div>
                <div class="hero-tag">Task Manager Panel</div>
                <h1>Household Task Manager</h1>
                <p>
                  One panel for assigned work, the shared household board, analytics, and task setup. NFC scans stay pending until someone confirms them in-app.
                </p>
              </div>
              ${this.currentProfile?.mapped
                ? html`<div class="hero-tag">Signed in as ${this.currentProfile.display_name}</div>`
                : html`<div class="hero-tag">Profile mapping needed</div>`}
            </div>
            <div class="hero-stats">
              <div class="hero-stat"><strong>${dueTodayCount}</strong><span>Due today</span></div>
              <div class="hero-stat"><strong>${overdueCount}</strong><span>Overdue</span></div>
              <div class="hero-stat"><strong>${pendingCount}</strong><span>Pending NFC</span></div>
            </div>
          </div>
        </header>
        <nav aria-label="Task Manager sections">
          ${NAVIGATION_TABS.map(
            (tab) => html`
              <button
                type="button"
                aria-selected=${tab.id === this.currentView ? "true" : "false"}
                @click=${() => {
                  this.currentView = tab.id;
                }}
              >
                ${tab.label}
              </button>
            `
          )}
        </nav>
        ${this.panelError ? html`<div class="error-banner">${this.panelError}</div>` : nothing}
        <section>
          <h2>${activeTab?.label ?? "Task Manager"}</h2>
          <p class="subtitle">${activeTab?.description ?? ""}</p>
          <div class="view-shell">
            ${this.renderCurrentView()}
          </div>
        </section>
        <task-manager-completion-dialog
          .open=${this.manualCompletionDialog !== null}
          .taskTitle=${this.manualCompletionDialog?.taskTitle ?? ""}
          .dueDate=${this.manualCompletionDialog?.dueDate ?? ""}
          .busy=${this.manualCompletionBusy}
          .errorMessage=${this.manualCompletionError}
          @confirm-request=${this.handleManualCompletionConfirm}
          @dismiss-request=${this.dismissManualCompletionDialog}
        ></task-manager-completion-dialog>
        <task-manager-nfc-confirm-dialog
          .open=${this.activePendingAttempt !== null}
          .taskTitle=${this.activePendingTask?.title ?? "Task"}
          .initiatedAt=${this.activePendingAttempt?.initiated_at ?? ""}
          .source=${this.activePendingAttempt?.source ?? "nfc_phone"}
          .busy=${this.nfcBusy}
          .errorMessage=${this.nfcError}
          @confirm-request=${this.handleNfcConfirm}
          @dismiss-request=${this.dismissNfcDialog}
        ></task-manager-nfc-confirm-dialog>
      </main>
    `;
  }

  private renderCurrentView() {
    if (this.coreLoading && this.tasks.length === 0) {
      return html`<div>Loading panel data...</div>`;
    }

    switch (this.currentView) {
      case "my-tasks":
        return html`
          <task-manager-my-tasks-view
            .currentProfile=${this.currentProfile}
            .tasks=${this.tasks}
            .dueInstances=${this.dueInstances}
            .profiles=${this.profiles}
            .busyCompletionId=${this.manualCompletionBusy ? this.manualCompletionDialog?.dueInstanceId ?? "" : ""}
            .pendingConfirmationCount=${this.pendingConfirmations.length}
            @task-complete-request=${this.openManualCompletionDialog}
            @review-pending-confirmations=${this.reviewPendingConfirmations}
          ></task-manager-my-tasks-view>
        `;
      case "household":
        return html`
          <task-manager-household-board-view
            .tasks=${this.tasks}
            .dueInstances=${this.dueInstances}
            .profiles=${this.profiles}
          ></task-manager-household-board-view>
        `;
      case "analytics":
        return html`
          <task-manager-analytics-view
            .profiles=${this.profiles}
            .analytics=${this.analyticsSnapshots}
            .loading=${this.analyticsLoading}
            .errorMessage=${this.currentView === "analytics" ? "" : ""}
            @refresh-analytics=${this.refreshAnalytics}
          ></task-manager-analytics-view>
        `;
      case "admin":
        return html`
          <task-manager-task-builder-view
            .tasks=${this.tasks}
            .profiles=${this.profiles}
            .saving=${this.taskBuilderSaving}
            .statusMessage=${this.taskBuilderStatusMessage}
            .errorMessage=${this.taskBuilderErrorMessage}
            @save-task-request=${this.handleSaveTask}
          ></task-manager-task-builder-view>
        `;
      default:
        return nothing;
    }
  }

  private get activePendingAttempt(): CompletionAttempt | null {
    return this.pendingConfirmations.find((attempt) => attempt.id === this.activeNfcAttemptId) ?? null;
  }

  private get activePendingTask(): TaskDefinition | null {
    const attempt = this.activePendingAttempt;
    if (!attempt) {
      return null;
    }
    return this.tasks.find((task) => task.id === attempt.task_id) ?? null;
  }

  private startPendingPolling(): void {
    if (this.pendingPollHandle !== null) {
      window.clearInterval(this.pendingPollHandle);
    }

    this.pendingPollHandle = window.setInterval(() => {
      void this.refreshPendingConfirmations();
    }, 10000);
  }

  private async loadCoreData(): Promise<void> {
    if (!this.hass) {
      return;
    }

    this.coreLoading = true;
    this.panelError = "";

    try {
      const today = todayIso();
      const fromDate = shiftIsoDate(today, -14);
      const [currentProfile, profiles, tasks, dueInstances, pendingConfirmations] = await Promise.all([
        fetchCurrentProfile(this.hass),
        fetchProfiles(this.hass),
        fetchTasks(this.hass),
        fetchDueInstances(this.hass, { fromDate, horizonDays: 35 }),
        fetchPendingConfirmations(this.hass),
      ]);

      this.currentProfile = currentProfile;
      this.profiles = profiles;
      this.tasks = tasks;
      this.dueInstances = dueInstances;
      this.pendingConfirmations = pendingConfirmations;
      this.pruneSnoozedAttempts();
      this.ensurePendingDialog();
    } catch (error) {
      this.panelError = errorMessage(error);
    } finally {
      this.coreLoading = false;
    }

    if (this.currentView === "analytics") {
      await this.loadAnalytics();
    }
  }

  private async loadAnalytics(): Promise<void> {
    if (!this.hass) {
      return;
    }

    if (this.profiles.length === 0) {
      this.analyticsSnapshots = {};
      return;
    }

    this.analyticsLoading = true;
    try {
      const snapshots = await Promise.all(
        this.profiles.map(async (profile) => {
          const snapshot = await fetchAnalytics(this.hass, { profileId: profile.id, horizonDays: 30 });
          return [profile.id, snapshot] as const;
        })
      );
      this.analyticsSnapshots = Object.fromEntries(snapshots);
    } catch (error) {
      this.panelError = errorMessage(error);
    } finally {
      this.analyticsLoading = false;
    }
  }

  private async refreshPendingConfirmations(): Promise<void> {
    if (!this.hass || !this.hasLoadedInitialData) {
      return;
    }

    try {
      this.pendingConfirmations = await fetchPendingConfirmations(this.hass);
      this.pruneSnoozedAttempts();
      if (!this.activePendingAttempt) {
        this.activeNfcAttemptId = "";
      }
      this.ensurePendingDialog();
    } catch (error) {
      this.panelError = errorMessage(error);
    }
  }

  private pruneSnoozedAttempts(): void {
    const pendingIds = new Set(this.pendingConfirmations.map((attempt) => attempt.id));
    this.snoozedPendingAttemptIds.forEach((attemptId) => {
      if (!pendingIds.has(attemptId)) {
        this.snoozedPendingAttemptIds.delete(attemptId);
      }
    });
  }

  private ensurePendingDialog(forceOpen = false): void {
    if (this.activePendingAttempt && !forceOpen) {
      return;
    }

    const nextAttempt = this.pendingConfirmations.find(
      (attempt) => forceOpen || !this.snoozedPendingAttemptIds.has(attempt.id)
    );
    this.activeNfcAttemptId = nextAttempt?.id ?? "";
    this.nfcError = "";
  }

  private reviewPendingConfirmations = (): void => {
    if (this.pendingConfirmations.length === 0) {
      return;
    }

    const attempt = this.pendingConfirmations[0];
    this.snoozedPendingAttemptIds.delete(attempt.id);
    this.activeNfcAttemptId = attempt.id;
    this.nfcError = "";
  };

  private openManualCompletionDialog = (event: Event): void => {
    const detail = (event as CustomEvent<ManualCompletionDialogState>).detail;
    this.manualCompletionDialog = detail;
    this.manualCompletionError = "";
  };

  private dismissManualCompletionDialog = (): void => {
    if (this.manualCompletionBusy) {
      return;
    }

    this.manualCompletionDialog = null;
    this.manualCompletionError = "";
  };

  private handleManualCompletionConfirm = async (): Promise<void> => {
    if (!this.hass || !this.manualCompletionDialog) {
      return;
    }

    this.manualCompletionBusy = true;
    this.manualCompletionError = "";

    try {
      await completeDueInstance(this.hass, {
        dueInstanceId: this.manualCompletionDialog.dueInstanceId,
      });
      this.manualCompletionDialog = null;
      await this.loadCoreData();
      if (this.currentView === "analytics") {
        await this.loadAnalytics();
      }
    } catch (error) {
      this.manualCompletionError = errorMessage(error);
    } finally {
      this.manualCompletionBusy = false;
    }
  };

  private dismissNfcDialog = (): void => {
    if (this.nfcBusy || !this.activePendingAttempt) {
      return;
    }

    this.snoozedPendingAttemptIds.add(this.activePendingAttempt.id);
    this.activeNfcAttemptId = "";
    this.nfcError = "";
  };

  private handleNfcConfirm = async (): Promise<void> => {
    if (!this.hass || !this.activePendingAttempt) {
      return;
    }

    this.nfcBusy = true;
    this.nfcError = "";

    try {
      await confirmCompletion(this.hass, {
        attemptId: this.activePendingAttempt.id,
      });
      this.snoozedPendingAttemptIds.delete(this.activePendingAttempt.id);
      this.activeNfcAttemptId = "";
      await this.loadCoreData();
      if (this.currentView === "analytics") {
        await this.loadAnalytics();
      }
    } catch (error) {
      this.nfcError = errorMessage(error);
    } finally {
      this.nfcBusy = false;
    }
  };

  private refreshAnalytics = async (): Promise<void> => {
    await this.loadAnalytics();
  };

  private handleSaveTask = async (event: Event): Promise<void> => {
    if (!this.hass) {
      return;
    }

    const detail = (event as CustomEvent<{ task: TaskDefinition }>).detail;
    this.taskBuilderSaving = true;
    this.taskBuilderStatusMessage = "";
    this.taskBuilderErrorMessage = "";

    try {
      const savedTask = await saveTask(this.hass, detail.task);
      this.taskBuilderStatusMessage = `Saved ${savedTask.title}.`;
      await this.loadCoreData();
      if (this.currentView === "analytics") {
        await this.loadAnalytics();
      }
    } catch (error) {
      this.taskBuilderErrorMessage = errorMessage(error);
    } finally {
      this.taskBuilderSaving = false;
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-task-manager-panel": HaTaskManagerPanel;
  }
}