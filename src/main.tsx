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

      // Load fonts globally in the document's head to ensure they render correctly
      if (!document.getElementById('ha-task-scheduler-fonts')) {
        const fontLink = document.createElement('link');
        fontLink.id = 'ha-task-scheduler-fonts';
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap';
        document.head.appendChild(fontLink);
      }

      // Create Shadow Root on our element
      const shadow = this.attachShadow({ mode: 'open' });

      // Inject the stylesheet directly into the Shadow Root (critical for Lovelace formatting)
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssUrl;
      shadow.appendChild(link);

      // Create our React mount point inside the Shadow Root
      const mountPoint = document.createElement('div');
      mountPoint.id = 'ha-task-scheduler-root';
      shadow.appendChild(mountPoint);

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

