import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import type {
  HaUserSummary,
  HouseholdProfile,
  NfcDiscoveryEntry,
  TaskDefinition,
  UserProfileMapping,
} from "../types/task";

export interface ImportHaUserRequestDetail {
  haUserId: string;
}

export interface LinkNfcTagRequestDetail {
  tagId: string;
  taskId: string;
}

function formatSeenAt(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

@customElement("task-manager-setup-view")
export class SetupView extends LitElement {
  @property({ attribute: false }) public haUsers: HaUserSummary[] = [];

  @property({ attribute: false }) public profiles: HouseholdProfile[] = [];

  @property({ attribute: false }) public mappings: UserProfileMapping[] = [];

  @property({ attribute: false }) public unmappedTags: NfcDiscoveryEntry[] = [];

  @property({ attribute: false }) public tasks: TaskDefinition[] = [];

  @property() public errorMessage = "";

  @property({ type: Boolean }) public busy = false;

  @property({ type: Boolean }) public loading = false;

  @property({ type: Boolean }) public watchingForScan = false;

  static styles = css`
    :host {
      display: block;
    }

    .setup-grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .panel {
      display: grid;
      gap: 14px;
      padding: 18px;
      border-radius: 22px;
      border: 1px solid rgba(44, 67, 49, 0.08);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 247, 240, 0.98));
      box-shadow: 0 14px 30px rgba(34, 48, 36, 0.05);
    }

    h3 {
      margin: 0;
      color: #203024;
      font-size: 1.05rem;
    }

    p {
      margin: 0;
      color: #627362;
      line-height: 1.55;
    }

    .list {
      display: grid;
      gap: 10px;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px;
      border-radius: 18px;
      border: 1px solid rgba(44, 67, 49, 0.08);
      background: rgba(250, 251, 248, 0.9);
    }

    .meta {
      min-width: 0;
      display: grid;
      gap: 4px;
    }

    .meta strong {
      color: #203024;
      word-break: break-word;
    }

    .meta span {
      color: #6a7a6c;
      font-size: 0.92rem;
      word-break: break-word;
    }

    .action,
    select {
      appearance: none;
      border: 1px solid rgba(44, 67, 49, 0.12);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.95);
      color: #294132;
      font: inherit;
    }

    .action {
      cursor: pointer;
      font-weight: 700;
      padding: 10px 16px;
      white-space: nowrap;
    }

    select {
      min-width: 168px;
      padding: 10px 14px;
    }

    .empty {
      padding: 22px;
      border-radius: 20px;
      border: 1px dashed rgba(47, 76, 53, 0.18);
      background: rgba(244, 247, 240, 0.8);
      color: #536553;
      text-align: center;
    }

    .status {
      font-weight: 600;
      color: #476048;
    }

    .watch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px;
      border-radius: 18px;
      border: 1px solid rgba(44, 67, 49, 0.08);
      background: rgba(248, 250, 245, 0.92);
    }

    .watch-copy {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .watch-copy strong {
      color: #203024;
    }

    .watch-copy span {
      color: #627362;
      font-size: 0.92rem;
      line-height: 1.5;
    }

    .loading {
      padding: 28px;
      border-radius: 20px;
      border: 1px dashed rgba(47, 76, 53, 0.18);
      background: rgba(244, 247, 240, 0.8);
      color: #476048;
      text-align: center;
      font-weight: 600;
    }

    .error {
      display: grid;
      gap: 10px;
      padding: 22px;
      border-radius: 20px;
      border: 1px solid rgba(160, 67, 48, 0.18);
      background: rgba(196, 99, 76, 0.08);
      color: #7f3123;
    }

    .error strong {
      font-size: 1rem;
    }

    button:disabled,
    select:disabled {
      opacity: 0.65;
      cursor: wait;
    }

    @media (max-width: 640px) {
      .row {
        flex-direction: column;
        align-items: stretch;
      }

      select,
      .action {
        width: 100%;
        box-sizing: border-box;
      }
    }
  `;

  protected render() {
    if (this.loading) {
      return html`<div class="loading">Loading setup data...</div>`;
    }

    if (this.errorMessage) {
      return html`
        <div class="error" role="alert">
          <strong>Unable to load setup data.</strong>
          <span>${this.errorMessage}</span>
        </div>
      `;
    }

    const mappedUserIds = new Set(this.mappings.map((mapping) => mapping.ha_user_id));
    const profileNames = new Map(this.profiles.map((profile) => [profile.id, profile.display_name]));
    const userNames = new Map(this.haUsers.map((user) => [user.id, user.name]));
    const importableUsers = this.haUsers
      .filter(
        (user) => user.is_active && !user.system_generated && !mappedUserIds.has(user.id)
      )
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name));
    const linkableTasks = this.tasks
      .filter((task) => task.active)
      .slice()
      .sort((left, right) => left.title.localeCompare(right.title));

    return html`
      <div class="setup-grid">
        <section class="panel">
          <div>
            <h3>Mapped Users</h3>
            <p>Existing Home Assistant user links that power assignment-aware completion.</p>
          </div>
          ${this.mappings.length === 0
            ? html`<div class="empty">No Home Assistant users have been mapped yet.</div>`
            : html`
                <div class="list">
                  ${this.mappings.map(
                    (mapping) => html`
                      <div class="row">
                        <div class="meta">
                          <strong>${profileNames.get(mapping.profile_id) ?? mapping.profile_id}</strong>
                          <span>${userNames.get(mapping.ha_user_id) ?? mapping.ha_user_id}</span>
                        </div>
                      </div>
                    `
                  )}
                </div>
              `}
        </section>

        <section class="panel">
          <div>
            <h3>Importable HA Users</h3>
            <p>Bring unmapped Home Assistant users into the household profile list.</p>
          </div>
          ${this.busy ? html`<p class="status">Saving setup changes...</p>` : html``}
          ${importableUsers.length === 0
            ? html`<div class="empty">All available Home Assistant users are already mapped.</div>`
            : html`
                <div class="list">
                  ${importableUsers.map(
                    (user) => html`
                      <div class="row">
                        <div class="meta">
                          <strong>${user.name}</strong>
                          <span>${user.is_admin ? "Administrator" : "Standard user"}</span>
                        </div>
                        <button
                          class="action"
                          type="button"
                          data-import-user-id=${user.id}
                          ?disabled=${this.busy}
                          @click=${() => this.handleImportUser(user.id)}
                        >
                          Import
                        </button>
                      </div>
                    `
                  )}
                </div>
              `}
        </section>

        <section class="panel">
          <div>
            <h3>Discovered NFC Tags</h3>
            <p>Link newly seen tags to tasks so scans can start the confirmation flow.</p>
          </div>
          <div class="watch-row">
            <div class="watch-copy">
              <strong>${this.watchingForScan ? "Listening for a scan" : "Watch for next scan"}</strong>
              <span>
                ${this.watchingForScan
                  ? "Listening for the next NFC scan. Scan an unmapped tag now."
                  : "Keep this panel open and start watching to refresh discoveries when a new unmapped tag is scanned."}
              </span>
            </div>
            <button
              class="action"
              type="button"
              data-watch-toggle
              ?disabled=${this.busy || this.loading}
              @click=${this.handleWatchToggle}
            >
              ${this.watchingForScan ? "Stop Watching" : "Watch for Next Scan"}
            </button>
          </div>
          ${this.unmappedTags.length === 0
            ? html`<div class="empty">No unmapped NFC tags have been discovered yet.</div>`
            : html`
                <div class="list">
                  ${this.unmappedTags.map(
                    (tag) => html`
                      <div class="row">
                        <div class="meta">
                          <strong>${tag.tag_id}</strong>
                          <span>
                            Last seen ${formatSeenAt(tag.last_seen)} via
                            ${tag.last_source === "nfc_reader" ? "reader" : "phone"}
                          </span>
                        </div>
                        <select
                          data-link-tag-id=${tag.tag_id}
                          ?disabled=${this.busy || linkableTasks.length === 0}
                          @change=${(event: Event) => this.handleLinkTag(event, tag.tag_id)}
                        >
                          <option value="">
                            ${linkableTasks.length === 0 ? "Create a task first" : "Link to task"}
                          </option>
                          ${linkableTasks.map(
                            (task) => html`<option value=${task.id}>${task.title}</option>`
                          )}
                        </select>
                      </div>
                    `
                  )}
                </div>
              `}
        </section>
      </div>
    `;
  }

  private handleImportUser(haUserId: string): void {
    if (this.busy) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent<ImportHaUserRequestDetail>("import-ha-user-request", {
        detail: { haUserId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleLinkTag(event: Event, tagId: string): void {
    if (this.busy) {
      return;
    }

    const target = event.currentTarget as HTMLSelectElement;
    if (!target.value) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent<LinkNfcTagRequestDetail>("link-nfc-tag-request", {
        detail: { tagId, taskId: target.value },
        bubbles: true,
        composed: true,
      })
    );

    target.value = "";
  }

  private handleWatchToggle = (): void => {
    if (this.busy || this.loading) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent(this.watchingForScan ? "stop-nfc-watch-request" : "start-nfc-watch-request", {
        bubbles: true,
        composed: true,
      })
    );
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "task-manager-setup-view": SetupView;
  }
}