class HaTaskManagerPanel extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          box-sizing: border-box;
          display: block;
          min-height: 100%;
          padding: 32px 20px;
          background: linear-gradient(180deg, #f5f1e8 0%, #ffffff 100%);
          color: #1f2a37;
          font-family: Georgia, "Times New Roman", serif;
        }

        .card {
          max-width: 720px;
          margin: 0 auto;
          padding: 28px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(31, 42, 55, 0.12);
          box-shadow: 0 24px 60px rgba(31, 42, 55, 0.12);
        }

        h1 {
          margin: 0 0 12px;
          font-size: 2rem;
          line-height: 1.1;
        }

        p {
          margin: 0;
          font-size: 1rem;
          line-height: 1.6;
        }
      </style>
      <section class="card">
        <h1>HA Task Manager</h1>
        <p>
          The Task Manager panel asset is registered and loading. Task 6 will
          replace this placeholder with the full panel UI.
        </p>
      </section>
    `;
  }
}

if (!customElements.get("ha-task-manager-panel")) {
  customElements.define("ha-task-manager-panel", HaTaskManagerPanel);
}