import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

const REQUIRED_CONFIRM_TEXT = "delete";

@customElement("task-manager-destructive-confirm-dialog")
export class DestructiveConfirmDialog extends LitElement {
  @property({ type: Boolean }) public open = false;

  @property() public title = "Confirm Destructive Action";

  @property() public message = "This action cannot be undone after the undo window expires.";

  @property({ type: Boolean }) public busy = false;

  @property() public errorMessage = "";

  @state() private confirmText = "";

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 22;
      pointer-events: none;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(21, 34, 25, 0.52);
      backdrop-filter: blur(6px);
      pointer-events: auto;
    }

    .dialog {
      width: min(520px, 100%);
      border-radius: 28px;
      background: linear-gradient(180deg, rgba(254, 254, 252, 0.98), rgba(244, 247, 239, 0.98));
      border: 1px solid rgba(45, 69, 50, 0.12);
      box-shadow: 0 28px 60px rgba(18, 26, 20, 0.24);
      padding: 24px;
      color: #203024;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    h2 {
      margin: 0;
      font-size: 1.35rem;
      line-height: 1.2;
    }

    p {
      margin: 10px 0 0;
      color: #4f6151;
      line-height: 1.55;
    }

    .hint {
      margin-top: 16px;
      padding: 14px;
      border-radius: 18px;
      background: rgba(195, 92, 67, 0.12);
      color: #7f2d1f;
      font-weight: 600;
    }

    label {
      display: grid;
      gap: 8px;
      margin-top: 16px;
      font-weight: 600;
      color: #294132;
    }

    input {
      border: 1px solid rgba(50, 75, 57, 0.28);
      border-radius: 12px;
      padding: 10px 12px;
      font: inherit;
      color: #203024;
      background: rgba(255, 255, 255, 0.92);
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

    .close {
      border-radius: 999px;
      width: 34px;
      height: 34px;
      display: inline-grid;
      place-items: center;
      font-size: 1.1rem;
      padding: 0;
      background: rgba(50, 75, 57, 0.08);
      color: #294132;
    }

    .ghost {
      background: rgba(50, 75, 57, 0.08);
      color: #294132;
    }

    .danger {
      background: #8d3526;
      color: #fff6f3;
    }

    button:disabled {
      cursor: wait;
      opacity: 0.6;
    }
  `;

  protected willUpdate(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has("open") && !this.open) {
      this.confirmText = "";
    }
  }

  protected render() {
    if (!this.open) {
      return nothing;
    }

    return html`
      <div class="backdrop" @click=${this.handleBackdropClick}>
        <section class="dialog" role="dialog" aria-modal="true" @click=${this.stopPropagation}>
          <header>
            <h2>${this.title}</h2>
            <button
              class="close"
              type="button"
              aria-label="Close"
              data-action="close"
              ?disabled=${this.busy}
              @click=${this.dismiss}
            >
              ×
            </button>
          </header>
          <p>${this.message}</p>
          <div class="hint">Type <strong>${REQUIRED_CONFIRM_TEXT}</strong> to enable confirmation.</div>
          <label>
            Confirmation text
            <input
              type="text"
              data-action="confirm-input"
              .value=${this.confirmText}
              ?disabled=${this.busy}
              @input=${this.handleInput}
            />
          </label>
          ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : nothing}
          <footer>
            <button
              class="ghost"
              type="button"
              data-action="dismiss"
              ?disabled=${this.busy}
              @click=${this.dismiss}
            >
              Cancel
            </button>
            <button
              class="danger"
              type="button"
              data-action="confirm"
              ?disabled=${this.busy || !this.isConfirmEnabled}
              @click=${this.confirm}
            >
              ${this.busy ? "Applying..." : "Confirm"}
            </button>
          </footer>
        </section>
      </div>
    `;
  }

  private get isConfirmEnabled(): boolean {
    return this.confirmText === REQUIRED_CONFIRM_TEXT;
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.confirmText = input.value;
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
    if (!this.isConfirmEnabled || this.busy) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("confirm-request", {
        bubbles: true,
        composed: true,
        detail: { confirmText: this.confirmText },
      })
    );
  }

  private dismiss(): void {
    if (this.busy) {
      return;
    }

    this.dispatchEvent(new CustomEvent("dismiss-request", { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-manager-destructive-confirm-dialog": DestructiveConfirmDialog;
  }
}
