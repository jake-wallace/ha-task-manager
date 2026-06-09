import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// 1. Regular mounting for the AI Studio preview environment
const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// 2. Home Assistant custom Lovelace card integration
class HomeAssistantTaskSchedulerCard extends HTMLElement {
  private _root: any = null;
  private _hass: any = null;
  private _config: any = {};

  set hass(hassVal: any) {
    this._hass = hassVal;
    this.renderReact();
  }

  setConfig(config: any) {
    this._config = config || {};
    this.renderReact();
  }

  renderReact() {
    if (this._root) {
      this._root.render(
        <StrictMode>
          <App hass={this._hass} config={this._config} />
        </StrictMode>
      );
    }
  }

  connectedCallback() {
    if (!this._root) {
      // Inject standard dynamic CSS bundle relative to this card's script location if not present
      if (!document.getElementById('ha-task-scheduler-style')) {
        const link = document.createElement('link');
        link.id = 'ha-task-scheduler-style';
        link.rel = 'stylesheet';

        // Retrieve current module path e.g. "/local/community/ha-task-manager/task-scheduler-card.js"
        // and dynamically resolve the corresponding CSS filename in the exact same directory
        let cssUrl = '/local/community/ha-task-manager/task-scheduler-card.css';
        try {
          const currentScript = document.currentScript as HTMLScriptElement;
          const scriptSrc = currentScript?.src || import.meta.url;
          if (scriptSrc) {
            cssUrl = scriptSrc.replace(/\.js(\?.*)?$/, '.css$1');
          }
        } catch (e) {
          console.warn('Could not auto-resolve CSS path, falling back to default:', e);
        }

        link.href = cssUrl;
        document.head.appendChild(link);
      }

      const mountPoint = document.createElement('div');
      mountPoint.id = 'ha-task-scheduler-root';
      this.appendChild(mountPoint);
      this._root = createRoot(mountPoint);
      this.renderReact();
    }
  }

  disconnectedCallback() {
    if (this._root) {
      this._root.unmount();
      this._root = null;
    }
  }

  getCardSize() {
    return 6; // Lovelace layout grid helper
  }
}

// Define the custom element name for Home Assistant Lovelace Dashboard card imports
if (typeof customElements !== 'undefined') {
  if (!customElements.get('ha-task-scheduler-card')) {
    customElements.define('ha-task-scheduler-card', HomeAssistantTaskSchedulerCard);
    console.log('Registered Home Assistant custom element: ha-task-scheduler-card');
  }
}

