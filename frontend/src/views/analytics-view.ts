import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import "../components/analytics-chart";

import type { ProfileAnalyticsSnapshot, HouseholdProfile } from "../types/task";
import type { AnalyticsChartConfig } from "../components/analytics-chart";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function lineChartConfig(profile: HouseholdProfile, snapshot: ProfileAnalyticsSnapshot): AnalyticsChartConfig {
  return {
    kind: "line",
    title: `${profile.display_name} Completion Trend`,
    subtitle: "Completions within the current analytics window",
    categories: snapshot.daily_completions.map((bucket) => bucket.date.slice(5)),
    series: [
      {
        name: "Completed",
        values: snapshot.daily_completions.map((bucket) => bucket.count)
      }
    ]
  };
}

function donutChartConfig(snapshot: ProfileAnalyticsSnapshot): AnalyticsChartConfig {
  return {
    kind: "donut",
    title: "On-Time Split",
    subtitle: "Confirmed completions only",
    slices: [
      { name: "On time", value: snapshot.on_time_count },
      { name: "Late", value: snapshot.late_count }
    ]
  };
}

@customElement("task-manager-analytics-view")
export class AnalyticsView extends LitElement {
  @property({ attribute: false }) public profiles: HouseholdProfile[] = [];

  @property({ attribute: false }) public analytics: Record<string, ProfileAnalyticsSnapshot> = {};

  @property({ type: Boolean }) public loading = false;

  @property() public errorMessage = "";

  static styles = css`
    :host {
      display: block;
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }

    h2 {
      margin: 0;
      color: #203024;
      font-size: clamp(1.35rem, 2.5vw, 1.8rem);
    }

    p {
      margin: 6px 0 0;
      color: #627362;
      max-width: 60ch;
      line-height: 1.55;
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
    }

    button:disabled {
      cursor: wait;
      opacity: 0.6;
    }

    .error,
    .empty {
      padding: 18px;
      border-radius: 20px;
      margin-bottom: 18px;
    }

    .error {
      background: rgba(195, 92, 67, 0.12);
      color: #8d3526;
    }

    .empty {
      background: rgba(244, 247, 240, 0.9);
      color: #566656;
      border: 1px dashed rgba(47, 76, 53, 0.18);
    }

    .stack {
      display: grid;
      gap: 18px;
    }

    .panel {
      border-radius: 26px;
      border: 1px solid rgba(44, 67, 49, 0.09);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(242, 246, 239, 0.98));
      padding: 20px;
      box-shadow: 0 16px 32px rgba(34, 48, 36, 0.06);
    }

    .panel-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .panel-header h3 {
      margin: 0;
      color: #203024;
      font-size: 1.15rem;
    }

    .panel-header span {
      color: #6b7a6b;
      font-size: 0.88rem;
    }

    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .kpi {
      padding: 14px;
      border-radius: 18px;
      background: rgba(251, 252, 249, 0.94);
      border: 1px solid rgba(44, 67, 49, 0.07);
    }

    .kpi strong {
      display: block;
      margin-bottom: 6px;
      font-size: 1.4rem;
      color: #203024;
    }

    .kpi span {
      color: #687867;
    }

    .charts {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
      gap: 16px;
    }

    @media (max-width: 860px) {
      .toolbar,
      .panel-header {
        flex-direction: column;
        align-items: stretch;
      }

      .charts {
        grid-template-columns: 1fr;
      }
    }
  `;

  protected render() {
    return html`
      <div class="toolbar">
        <div>
          <h2>Analytics</h2>
          <p>Snapshot metrics, trend lines, and completion mix update from the backend’s immutable history and due-instance projection.</p>
        </div>
        <button type="button" ?disabled=${this.loading} @click=${this.refreshAnalytics}>
          ${this.loading ? "Refreshing..." : "Refresh Analytics"}
        </button>
      </div>
      ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : nothing}
      ${this.profiles.length === 0
        ? html`<div class="empty">Add household profiles to start seeing analytics snapshots.</div>`
        : nothing}
      <div class="stack">
        ${this.profiles.map((profile) => {
          const snapshot = this.analytics[profile.id];
          if (!snapshot) {
            return html`<div class="panel"><div class="empty">Loading analytics for ${profile.display_name}...</div></div>`;
          }

          const completedTotal = snapshot.on_time_count + snapshot.late_count;
          const onTimeRate = completedTotal === 0 ? "N/A" : `${Math.round((snapshot.on_time_count / completedTotal) * 100)}%`;

          return html`
            <section class="panel">
              <div class="panel-header">
                <h3>${profile.display_name}</h3>
                <span>Computed ${formatTimestamp(snapshot.computed_at)}</span>
              </div>
              <div class="kpis">
                <div class="kpi"><strong>${snapshot.current_streak}</strong><span>Current streak</span></div>
                <div class="kpi"><strong>${snapshot.longest_streak}</strong><span>Longest streak</span></div>
                <div class="kpi"><strong>${snapshot.missed_count}</strong><span>Missed in window</span></div>
                <div class="kpi"><strong>${onTimeRate}</strong><span>On-time rate</span></div>
              </div>
              <div class="charts">
                <task-manager-analytics-chart .config=${lineChartConfig(profile, snapshot)}></task-manager-analytics-chart>
                <task-manager-analytics-chart .config=${donutChartConfig(snapshot)}></task-manager-analytics-chart>
              </div>
            </section>
          `;
        })}
      </div>
    `;
  }

  private refreshAnalytics(): void {
    this.dispatchEvent(
      new CustomEvent("refresh-analytics", {
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-manager-analytics-view": AnalyticsView;
  }
}