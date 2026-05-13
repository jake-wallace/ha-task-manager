import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
  weekday: "long"
});

function formatDueDate(value: string): string {
  return DATE_FORMATTER.format(new Date(`${value}T12:00:00`));
}

@customElement("task-manager-completion-dialog")
export class CompletionDialog extends LitElement {
  @property({ type: Boolean }) public open = false;

  @property() public taskTitle = "";

  @property() public dueDate = "";

  @property({ type: Boolean }) public busy = false;

  @property() public errorMessage = "";

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 20;
      pointer-events: none;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background: rgba(21, 34, 25, 0.52);
      backdrop-filter: blur(6px);
      display: grid;
      place-items: center;
      padding: 20px;
      pointer-events: auto;
    }

    .dialog {
      width: min(480px, 100%);
      border-radius: 28px;
      background: linear-gradient(180deg, rgba(254, 254, 252, 0.98), rgba(244, 247, 239, 0.98));
      border: 1px solid rgba(45, 69, 50, 0.12);
      box-shadow: 0 28px 60px rgba(18, 26, 20, 0.24);
      padding: 24px;
      color: #203024;
    }

    h2 {
      margin: 0 0 8px;
      font-size: 1.35rem;
    }

    p {
      margin: 0;
      color: #4f6151;
      line-height: 1.55;
    }

    .callout {
      margin-top: 16px;
      padding: 14px;
      border-radius: 18px;
      background: rgba(47, 107, 71, 0.08);
      color: #294132;
      font-weight: 600;
    }

    .error {
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(195, 92, 67, 0.12);
      color: #8d3526;
      font-weight: 600;
    }

    footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 22px;
    }

    button {
      appearance: none;
      border-radius: 999px;
      border: none;
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
      cursor: wait;
      opacity: 0.6;
    }
  `;

  protected render() {
    if (!this.open) {
      return nothing;
    }

    return html`
      <div class="backdrop" @click=${this.handleBackdropClick}>
        <section class="dialog" role="dialog" aria-modal="true" @click=${this.stopPropagation}>
          <h2>Confirm Manual Completion</h2>
          <p>
            Mark <strong>${this.taskTitle}</strong> complete for
            <strong>${this.dueDate ? formatDueDate(this.dueDate) : "this due date"}</strong>?
          </p>
          <div class="callout">This records an immutable completion entry and still enforces task assignment rules.</div>
          ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : nothing}
          <footer>
            <button class="ghost" type="button" ?disabled=${this.busy} @click=${this.dismiss}>
              Cancel
            </button>
            <button class="primary" type="button" ?disabled=${this.busy} @click=${this.confirm}>
              ${this.busy ? "Saving..." : "Confirm Completion"}
            </button>
          </footer>
        </section>
      </div>
    `;
  }

  private handleBackdropClick(): void {
    if (!this.busy) {
      this.dismiss();
    }
  }

  private stopPropagation(event: Event): void {
    event.stopPropagation();
  }

  private confirm(): void {
    this.dispatchEvent(new CustomEvent("confirm-request", { bubbles: true, composed: true }));
  }

  private dismiss(): void {
    this.dispatchEvent(new CustomEvent("dismiss-request", { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-manager-completion-dialog": CompletionDialog;
  }
}