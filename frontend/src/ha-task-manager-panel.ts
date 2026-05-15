import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import {
  completeDueInstance,
  confirmCompletion,
  fetchAnalytics,
  fetchCurrentProfile,
  fetchDueInstances,
  fetchHaUsers,
  fetchPendingConfirmations,
  fetchProfileMappings,
  fetchProfiles,
  fetchTasks,
  fetchUnmappedNfcTags,
  importHaUser,
  linkNfcTag,
  saveTask,
} from "./api/client";
import "./components/completion-dialog";
import "./components/nfc-confirm-dialog";
import "./views/analytics-view";
import "./views/household-board-view";
import "./views/my-tasks-view";
import "./views/setup-view";
import "./views/task-builder-view";
import type {
  ImportHaUserRequestDetail,
  LinkNfcTagRequestDetail,
} from "./views/setup-view";

import type {
  CompletionAttempt,
  CurrentUserProfile,
  HaUserSummary,
  HouseholdProfile,
  NfcDiscoveryEntry,
  ProfileAnalyticsSnapshot,
  TaskDefinition,
  TaskDueInstance,
  UserProfileMapping,
} from "./types/task";

type PanelView = "my-tasks" | "household" | "analytics" | "admin" | "setup";

interface HomeAssistantLike {
  callWS: <T>(message: Record<string, unknown>) => Promise<T>;
  user?: {
    id?: string;
    is_admin?: boolean;
  };
}

interface NavigationTab {
  id: PanelView;
  label: string;
  description: string;
}

const SETUP_DISCOVERY_WATCH_INTERVAL_MS = 1500;

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
  },
  {
    id: "setup",
    label: "Setup",
    description: "Import Home Assistant users and link discovered NFC tags."
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

function upsertTask(tasks: TaskDefinition[], savedTask: TaskDefinition, requestedTaskId: string): TaskDefinition[] {
  const retainedTasks = tasks.filter(
    (task) => task.id !== savedTask.id && task.id !== requestedTaskId
  );

  return [...retainedTasks, savedTask];
}

type PanelErrorSource = "setup-load" | null;

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

  @state() private profileMappings: UserProfileMapping[] = [];

  @state() private haUsers: HaUserSummary[] = [];

  @state() private unmappedTags: NfcDiscoveryEntry[] = [];

  @state() private manualCompletionDialog: ManualCompletionDialogState | null = null;

  @state() private manualCompletionBusy = false;

  @state() private manualCompletionError = "";

  @state() private activeNfcAttemptId = "";

  @state() private nfcBusy = false;

  @state() private nfcError = "";

  @state() private taskBuilderSaving = false;

  @state() private setupBusy = false;

  @state() private setupLoading = false;

  @state() private setupWatchActive = false;

  @state() private taskBuilderStatusMessage = "";

  @state() private taskBuilderErrorMessage = "";

  @state() private taskBuilderHandoffTaskId = "";

  private pendingPollHandle: number | null = null;

  private setupWatchPollHandle: number | null = null;

  private hasLoadedInitialData = false;

  private lastLoadedUserContextKey = "";

  private coreLoadRequestId = 0;

  private setupLoadRequestId = 0;

  private setupWatchRefreshRequestId = 0;

  private setupMutationRequestId = 0;

  private taskSaveRequestId = 0;

  private setupWatchSessionId = 0;

  private snoozedPendingAttemptIds = new Set<string>();

  private panelErrorSource: PanelErrorSource = null;

  private hasLoadedSetupData = false;

  private setupWatchBaselineTagIds = new Set<string>();

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
      this.stopSetupWatch();
      const currentUserContextKey = this.currentUserContextKey;
      if (!this.hasLoadedInitialData || this.lastLoadedUserContextKey !== currentUserContextKey) {
        this.invalidateAdminMutations();
        this.hasLoadedInitialData = true;
        this.lastLoadedUserContextKey = currentUserContextKey;
        this.hasLoadedSetupData = false;
        this.setupLoading = this.activeView === "setup" || this.activeView === "admin";
        this.profileMappings = [];
        this.haUsers = [];
        this.unmappedTags = [];
        void this.loadCoreData();
        if (this.activeView === "setup" || this.activeView === "admin") {
          void this.loadSetupData();
        }
        this.startPendingPolling();
      }
    }

    if (changedProperties.has("currentView")) {
      if (this.activeView !== "setup") {
        this.stopSetupWatch();
      }

      if (this.activeView === "analytics") {
        void this.loadAnalytics();
      }

      if ((this.activeView === "setup" || this.activeView === "admin") && !this.hasLoadedSetupData) {
        void this.loadSetupData();
      }
    }
  }

  public disconnectedCallback(): void {
    this.stopSetupWatch();
    if (this.pendingPollHandle !== null) {
      window.clearInterval(this.pendingPollHandle);
      this.pendingPollHandle = null;
    }
    super.disconnectedCallback();
  }

  protected render() {
    const activeView = this.activeView;
    const navigationTabs = this.navigationTabs;
    const activeTab = navigationTabs.find((tab) => tab.id === activeView);
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
          ${navigationTabs.map(
            (tab) => html`
              <button
                type="button"
                aria-selected=${tab.id === activeView ? "true" : "false"}
                @click=${() => this.selectView(tab.id)}
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
            ${this.renderCurrentView(activeView)}
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

  private renderCurrentView(view: PanelView) {
    if (this.coreLoading && this.tasks.length === 0) {
      return html`<div>Loading panel data...</div>`;
    }

    switch (view) {
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
            .profileMappings=${this.profileMappings}
            .haUsers=${this.haUsers}
            .unmappedTags=${this.unmappedTags}
            .draftContextKey=${this.currentUserContextKey}
            .handoffTaskId=${this.taskBuilderHandoffTaskId}
            .saving=${this.taskBuilderSaving}
            .statusMessage=${this.taskBuilderStatusMessage}
            .errorMessage=${this.taskBuilderErrorMessage}
            @save-task-request=${this.handleSaveTask}
          ></task-manager-task-builder-view>
        `;
      case "setup":
        return html`
          <task-manager-setup-view
            .haUsers=${this.haUsers}
            .profiles=${this.profiles}
            .mappings=${this.profileMappings}
            .unmappedTags=${this.unmappedTags}
            .tasks=${this.tasks}
            .watchingForScan=${this.setupWatchActive}
            .errorMessage=${this.panelErrorSource === "setup-load" ? this.panelError : ""}
            .busy=${this.setupBusy}
            .loading=${this.setupLoading && !this.hasLoadedSetupData}
            @import-ha-user-request=${this.handleImportHaUser}
            @link-nfc-tag-request=${this.handleLinkNfcTag}
            @start-nfc-watch-request=${this.handleStartSetupWatch}
            @stop-nfc-watch-request=${this.handleStopSetupWatch}
          ></task-manager-setup-view>
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

  private startSetupWatchPolling(): void {
    if (this.setupWatchPollHandle !== null) {
      window.clearInterval(this.setupWatchPollHandle);
    }

    this.setupWatchPollHandle = window.setInterval(() => {
      void this.pollSetupDiscoveries();
    }, SETUP_DISCOVERY_WATCH_INTERVAL_MS);
  }

  private stopSetupWatch(): void {
    this.setupWatchSessionId += 1;
    this.setupWatchActive = false;
    if (this.setupWatchPollHandle !== null) {
      window.clearInterval(this.setupWatchPollHandle);
      this.setupWatchPollHandle = null;
    }
  }

  private clearPanelError(): void {
    this.panelError = "";
    this.panelErrorSource = null;
  }

  private setPanelError(message: string, source: PanelErrorSource = null): void {
    this.panelError = message;
    this.panelErrorSource = source;
  }

  private clearSetupLoadError(): void {
    if (this.panelErrorSource === "setup-load") {
      this.clearPanelError();
    }
  }

  private invalidateAdminMutations(): void {
    this.setupMutationRequestId += 1;
    this.taskSaveRequestId += 1;
    this.setupBusy = false;
    this.taskBuilderSaving = false;
    this.taskBuilderStatusMessage = "";
    this.taskBuilderErrorMessage = "";
    this.taskBuilderHandoffTaskId = "";
  }

  private beginCoreLoad(): {
    hass: HomeAssistantLike;
    requestId: number;
    userContextKey: string;
  } | null {
    if (!this.hass) {
      return null;
    }

    return {
      hass: this.hass,
      requestId: ++this.coreLoadRequestId,
      userContextKey: this.currentUserContextKey,
    };
  }

  private beginSetupLoad(): {
    hass: HomeAssistantLike;
    requestId: number;
    userContextKey: string;
  } | null {
    if (!this.hass || !this.canAccessAdminViews) {
      return null;
    }

    return {
      hass: this.hass,
      requestId: ++this.setupLoadRequestId,
      userContextKey: this.currentUserContextKey,
    };
  }

  private beginSetupWatchRefresh(): {
    hass: HomeAssistantLike;
    requestId: number;
    userContextKey: string;
    watchSessionId: number;
  } | null {
    if (!this.hass || !this.canAccessAdminViews || !this.setupWatchActive) {
      return null;
    }

    return {
      hass: this.hass,
      requestId: ++this.setupWatchRefreshRequestId,
      userContextKey: this.currentUserContextKey,
      watchSessionId: this.setupWatchSessionId,
    };
  }

  private beginSetupMutation(): {
    hass: HomeAssistantLike;
    requestId: number;
    userContextKey: string;
  } | null {
    if (!this.hass || !this.canAccessAdminViews) {
      return null;
    }

    return {
      hass: this.hass,
      requestId: ++this.setupMutationRequestId,
      userContextKey: this.currentUserContextKey,
    };
  }

  private beginTaskSave(): {
    hass: HomeAssistantLike;
    requestId: number;
    userContextKey: string;
  } | null {
    if (!this.hass || !this.canAccessAdminViews) {
      return null;
    }

    return {
      hass: this.hass,
      requestId: ++this.taskSaveRequestId,
      userContextKey: this.currentUserContextKey,
    };
  }

  private isCurrentCoreLoad(requestId: number, userContextKey: string): boolean {
    return requestId === this.coreLoadRequestId && userContextKey === this.currentUserContextKey;
  }

  private isCurrentSetupLoad(requestId: number, userContextKey: string): boolean {
    return requestId === this.setupLoadRequestId && userContextKey === this.currentUserContextKey;
  }

  private isCurrentSetupMutation(requestId: number, userContextKey: string): boolean {
    return requestId === this.setupMutationRequestId && userContextKey === this.currentUserContextKey;
  }

  private isCurrentTaskSave(requestId: number, userContextKey: string): boolean {
    return requestId === this.taskSaveRequestId && userContextKey === this.currentUserContextKey;
  }

  private isCurrentSetupWatchRefresh(
    requestId: number,
    userContextKey: string,
    watchSessionId: number
  ): boolean {
    return (
      this.setupWatchActive &&
      requestId === this.setupWatchRefreshRequestId &&
      userContextKey === this.currentUserContextKey &&
      watchSessionId === this.setupWatchSessionId
    );
  }

  private async loadCoreData(): Promise<void> {
    const loadRequest = this.beginCoreLoad();
    if (!loadRequest) {
      return;
    }

    this.coreLoading = true;
    this.clearPanelError();

    try {
      const today = todayIso();
      const fromDate = shiftIsoDate(today, -14);
      const [currentProfile, profiles, tasks, dueInstances, pendingConfirmations] = await Promise.all([
        fetchCurrentProfile(loadRequest.hass),
        fetchProfiles(loadRequest.hass),
        fetchTasks(loadRequest.hass),
        fetchDueInstances(loadRequest.hass, { fromDate, horizonDays: 35 }),
        fetchPendingConfirmations(loadRequest.hass),
      ]);

      if (!this.isCurrentCoreLoad(loadRequest.requestId, loadRequest.userContextKey)) {
        return;
      }

      this.currentProfile = currentProfile;
      this.profiles = profiles;
      this.tasks = tasks;
      this.dueInstances = dueInstances;
      this.pendingConfirmations = pendingConfirmations;
      this.pruneSnoozedAttempts();
      this.ensurePendingDialog();
    } catch (error) {
      if (this.isCurrentCoreLoad(loadRequest.requestId, loadRequest.userContextKey)) {
        this.setPanelError(errorMessage(error));
      }
    } finally {
      if (this.isCurrentCoreLoad(loadRequest.requestId, loadRequest.userContextKey)) {
        this.coreLoading = false;
      }
    }

    if (
      this.isCurrentCoreLoad(loadRequest.requestId, loadRequest.userContextKey) &&
      this.currentView === "analytics"
    ) {
      await this.loadAnalytics();
    }
  }

  private async loadSetupData(): Promise<void> {
    const loadRequest = this.beginSetupLoad();
    if (!loadRequest) {
      return;
    }

    this.setupLoading = true;

    try {
      const [profileMappings, haUsers, unmappedTags] = await Promise.all([
        fetchProfileMappings(loadRequest.hass),
        fetchHaUsers(loadRequest.hass),
        fetchUnmappedNfcTags(loadRequest.hass),
      ]);

      if (!this.isCurrentSetupLoad(loadRequest.requestId, loadRequest.userContextKey)) {
        return;
      }

      this.profileMappings = profileMappings;
      this.haUsers = haUsers;
      this.unmappedTags = unmappedTags;
      this.hasLoadedSetupData = true;
      this.clearSetupLoadError();
    } catch (error) {
      if (this.isCurrentSetupLoad(loadRequest.requestId, loadRequest.userContextKey)) {
        this.profileMappings = [];
        this.haUsers = [];
        this.unmappedTags = [];
        this.hasLoadedSetupData = false;
        this.setPanelError(errorMessage(error), "setup-load");
      }
    } finally {
      if (this.isCurrentSetupLoad(loadRequest.requestId, loadRequest.userContextKey)) {
        this.setupLoading = false;
      }
    }
  }

  private async pollSetupDiscoveries(): Promise<void> {
    const refreshRequest = this.beginSetupWatchRefresh();
    if (!refreshRequest) {
      return;
    }

    try {
      const unmappedTags = await fetchUnmappedNfcTags(refreshRequest.hass);

      if (
        !this.isCurrentSetupWatchRefresh(
          refreshRequest.requestId,
          refreshRequest.userContextKey,
          refreshRequest.watchSessionId
        )
      ) {
        return;
      }

      this.unmappedTags = unmappedTags;

      const discoveredNewTag = unmappedTags.some(
        (tag) => !this.setupWatchBaselineTagIds.has(tag.tag_id)
      );

      if (discoveredNewTag) {
        this.stopSetupWatch();
      }
    } catch (error) {
      if (
        !this.isCurrentSetupWatchRefresh(
          refreshRequest.requestId,
          refreshRequest.userContextKey,
          refreshRequest.watchSessionId
        )
      ) {
        return;
      }

      this.stopSetupWatch();
      this.setPanelError(errorMessage(error));
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
      this.setPanelError(errorMessage(error));
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
      this.setPanelError(errorMessage(error));
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

  private handleStartSetupWatch = (): void => {
    if (!this.hass || !this.canAccessAdminViews || this.setupLoading || this.setupWatchActive) {
      return;
    }

    this.setupWatchBaselineTagIds = new Set(this.unmappedTags.map((tag) => tag.tag_id));
    this.setupWatchSessionId += 1;
    this.setupWatchActive = true;
    void this.pollSetupDiscoveries();
    this.startSetupWatchPolling();
  };

  private handleStopSetupWatch = (): void => {
    this.stopSetupWatch();
  };

  private handleImportHaUser = async (
    event: CustomEvent<ImportHaUserRequestDetail>
  ): Promise<void> => {
    const mutationRequest = this.beginSetupMutation();
    if (!mutationRequest) {
      return;
    }

    this.setupBusy = true;
    this.clearPanelError();

    try {
      await importHaUser(mutationRequest.hass, { haUserId: event.detail.haUserId });

      if (!this.isCurrentSetupMutation(mutationRequest.requestId, mutationRequest.userContextKey)) {
        return;
      }

      await this.loadCoreData();
      await this.loadSetupData();
    } catch (error) {
      if (this.isCurrentSetupMutation(mutationRequest.requestId, mutationRequest.userContextKey)) {
        this.setPanelError(errorMessage(error));
      }
    } finally {
      if (this.isCurrentSetupMutation(mutationRequest.requestId, mutationRequest.userContextKey)) {
        this.setupBusy = false;
      }
    }
  };

  private handleLinkNfcTag = async (
    event: CustomEvent<LinkNfcTagRequestDetail>
  ): Promise<void> => {
    const mutationRequest = this.beginSetupMutation();
    if (!mutationRequest) {
      return;
    }

    this.setupBusy = true;
    this.clearPanelError();

    try {
      await linkNfcTag(mutationRequest.hass, event.detail);

      if (!this.isCurrentSetupMutation(mutationRequest.requestId, mutationRequest.userContextKey)) {
        return;
      }

      await this.loadCoreData();
      await this.loadSetupData();
    } catch (error) {
      if (this.isCurrentSetupMutation(mutationRequest.requestId, mutationRequest.userContextKey)) {
        this.setPanelError(errorMessage(error));
      }
    } finally {
      if (this.isCurrentSetupMutation(mutationRequest.requestId, mutationRequest.userContextKey)) {
        this.setupBusy = false;
      }
    }
  };

  private handleSaveTask = async (event: Event): Promise<void> => {
    const mutationRequest = this.beginTaskSave();
    if (!mutationRequest) {
      return;
    }

    const detail = (event as CustomEvent<{ task: TaskDefinition }>).detail;
    this.taskBuilderSaving = true;
    this.taskBuilderStatusMessage = "";
    this.taskBuilderErrorMessage = "";

    try {
      const savedTask = await saveTask(mutationRequest.hass, detail.task);

      if (!this.isCurrentTaskSave(mutationRequest.requestId, mutationRequest.userContextKey)) {
        return;
      }

      this.tasks = upsertTask(this.tasks, savedTask, detail.task.id);
      this.taskBuilderHandoffTaskId = savedTask.id;
      this.taskBuilderStatusMessage = `Saved ${savedTask.title}.`;
      await Promise.all([
        this.loadCoreData(),
        this.loadSetupData(),
      ]);
      if (
        this.isCurrentTaskSave(mutationRequest.requestId, mutationRequest.userContextKey) &&
        this.currentView === "analytics"
      ) {
        await this.loadAnalytics();
      }
    } catch (error) {
      if (this.isCurrentTaskSave(mutationRequest.requestId, mutationRequest.userContextKey)) {
        this.taskBuilderErrorMessage = errorMessage(error);
      }
    } finally {
      if (this.isCurrentTaskSave(mutationRequest.requestId, mutationRequest.userContextKey)) {
        this.taskBuilderSaving = false;
      }
    }
  };

  private get canAccessAdminViews(): boolean {
    return this.hass?.user?.is_admin === true;
  }

  private get currentUserContextKey(): string {
    const userId = this.hass?.user?.id ?? "";
    const accessLevel = this.canAccessAdminViews ? "admin" : "user";
    return `${userId}:${accessLevel}`;
  }

  private get activeView(): PanelView {
    if ((this.currentView === "setup" || this.currentView === "admin") && !this.canAccessAdminViews) {
      return "my-tasks";
    }

    return this.currentView;
  }

  private get navigationTabs(): NavigationTab[] {
    return NAVIGATION_TABS.filter(
      (tab) => (tab.id !== "setup" && tab.id !== "admin") || this.canAccessAdminViews
    );
  }

  private selectView(view: PanelView): void {
    if (view === "setup" || view === "admin") {
      if (!this.canAccessAdminViews) {
        return;
      }

      if (view === "setup" && !this.hasLoadedSetupData) {
        this.setupLoading = true;
      }
    }

    if (view !== "setup") {
      this.stopSetupWatch();
    }

    this.currentView = view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-task-manager-panel": HaTaskManagerPanel;
  }
}