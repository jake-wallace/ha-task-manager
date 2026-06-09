import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import styles from './index.css?inline';

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
      // Create Shadow Root on our element
      const shadow = this.attachShadow({ mode: 'open' });

      // Embed CSS styles directly inside the Shadow DOM for instant rendering
      // This ensures 100% style coverage inside Home Assistant with zero external CSS file requirements!
      const styleEl = document.createElement('style');
      styleEl.textContent = styles;
      shadow.appendChild(styleEl);

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

