import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

function describeSource(source: string): string {
  return source === "nfc_reader" ? "an NFC reader" : "your phone";
}

function formatInitiatedAt(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

@customElement("task-manager-nfc-confirm-dialog")
export class NfcConfirmDialog extends LitElement {
  @property({ type: Boolean }) public open = false;

  @property() public taskTitle = "";

  @property() public initiatedAt = "";

  @property() public source = "nfc_phone";

  @property({ type: Boolean }) public busy = false;

  @property() public errorMessage = "";

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 21;
      pointer-events: none;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(17, 30, 22, 0.58);
      backdrop-filter: blur(7px);
      pointer-events: auto;
    }

    .dialog {
      width: min(500px, 100%);
      border-radius: 28px;
      background: linear-gradient(160deg, rgba(248, 251, 244, 0.98), rgba(239, 244, 236, 0.98));
      border: 1px solid rgba(45, 69, 50, 0.12);
      box-shadow: 0 28px 60px rgba(18, 26, 20, 0.26);
      padding: 26px;
      color: #203024;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      background: rgba(62, 138, 87, 0.12);
      color: #2d6540;
      padding: 7px 11px;
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    h2 {
      margin: 14px 0 10px;
      font-size: 1.4rem;
      line-height: 1.15;
    }

    p {
      margin: 0;
      color: #506351;
      line-height: 1.55;
    }

    .summary {
      margin-top: 16px;
      display: grid;
      gap: 10px;
      padding: 16px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.72);
      border: 1px solid rgba(50, 75, 57, 0.08);
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
      margin-top: 24px;
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
          <span class="eyebrow">Pending NFC Confirmation</span>
          <h2>Confirm ${this.taskTitle}</h2>
          <p>The scan came from ${describeSource(this.source)}. NFC never auto-completes this task without your confirmation.</p>
          <div class="summary">
            <div><strong>Task</strong>: ${this.taskTitle}</div>
            <div><strong>Scanned</strong>: ${this.initiatedAt ? formatInitiatedAt(this.initiatedAt) : "Just now"}</div>
          </div>
          ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : nothing}
          <footer>
            <button class="ghost" type="button" ?disabled=${this.busy} @click=${this.dismiss}>
              Not Yet
            </button>
            <button class="primary" type="button" ?disabled=${this.busy} @click=${this.confirm}>
              ${this.busy ? "Confirming..." : "Yes, Record Completion"}
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
    "task-manager-nfc-confirm-dialog": NfcConfirmDialog;
  }
}