import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

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
    description: "Assigned work and pending confirmations will mount here in Task 7."
  },
  {
    id: "household",
    label: "Household Board",
    description: "The shared due-task board mounts here in Task 7."
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Charts and profile summaries mount here in Task 7."
  },
  {
    id: "admin",
    label: "Manage Tasks",
    description: "Task creation and editing mount here in Task 7."
  }
];

@customElement("ha-task-manager-panel")
export class HaTaskManagerPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistantLike;

  @state() private currentView: PanelView = "my-tasks";

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
      margin-bottom: 20px;
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
      color: var(--secondary-text-color, #4d5b4d);
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
    }

    #view-root {
      margin-top: 18px;
      padding: 18px;
      border-radius: 18px;
      background: rgba(235, 240, 229, 0.84);
      color: var(--secondary-text-color, #4d5b4d);
    }

    @media (max-width: 640px) {
      main {
        padding-inline: 14px;
      }

      section {
        padding: 22px;
      }
    }
  `;

  protected render() {
    const activeTab = NAVIGATION_TABS.find((tab) => tab.id === this.currentView);

    return html`
      <main>
        <header>
          <h1>Household Task Manager</h1>
          <p>
            Task 6 registers the panel shell and navigation. Task 7 will mount the
            real task lists, confirmation flows, and analytics into this root.
          </p>
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
        <section>
          <h2>${activeTab?.label ?? "Task Manager"}</h2>
          <div id="view-root">${activeTab?.description ?? "View placeholder."}</div>
        </section>
      </main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-task-manager-panel": HaTaskManagerPanel;
  }
}