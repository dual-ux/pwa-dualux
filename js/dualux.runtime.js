/*
 * License Notice Dual-UX - GNU Affero General Public License
 *
 * This file is part of Dual-UX.
 *
 * Dual-UX is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Dual-UX is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with Dual-UX. If not, see <https://www.gnu.org/licenses/>.
 */

/* dualux.runtime.js
 * DUAL-UX Runtime v1.0.0 (ES module)
 * Event-driven UX-mode runtime with display-mode detection.
 * © 2021–2025 Easywebapp Inc. All rights reserved. Author: Ron J. van der Zwan (Easywebapp Inc.)
 *
 * =================================================================================================
 * DUAL-UX RUNTIME – API REQUIREMENTS (READ ME)
 * =================================================================================================
 * EXPORTS
 *   - `dualux` (singleton instance of `DualUxRuntime`)
 *
 * PUBLIC API (stable)
 *   1) dualux.configure(options)
 *        - Input: Partial config object
 *            {
 *              enableLogging?: boolean,                                // default false
 *              targets?: { web?: string, app?: string, hiddenClass?: string },
 *              mapping?: { standaloneTo?: 'app'|'web', browserTo?: 'app'|'web' },
 *              // NOTE: fullscreen is NOT controlled by mapping (see Display-Mode Semantics below)
 *              routes?: { appHome?: string, webHome?: string },
 *              storageKey?: string
 *            }
 *        - Output: none
 *        - Side effects: merges into internal config (`cfg`)
 *
 *   2) dualux.init()
 *        - Input: none
 *        - Output: none
 *        - Side effects:
 *            • Detects current display mode and UX mode
 *            • Sets session-scoped `isStandalone`
 *            • Persists state to localStorage
 *            • Renders DOM (show/hide app/web containers)
 *            • Subscribes to display-mode media queries & `fullscreenchange`
 *            • Emits initial change to subscribers
 *
 *   3) dualux.getDisplayMode()
 *        - Output: 'browser' | 'standalone' | 'fullscreen'
 *
 *   4) dualux.getUxMode()
 *        - Output: 'web' | 'app'
 *
 *   5) dualux.switchUx(to, options?)
 *        - Input:
 *            to: 'web' | 'app'
 *            options?: {
 *              persist?: boolean,             // default true (store ux in localStorage)
 *              navigate?: boolean,            // if true, navigate to routes.appHome / routes.webHome
 *              requestFullscreen?: boolean    // if true and to==='app', try requestFullscreen()
 *            }
 *        - Output: { displayMode, uxMode, changed: boolean, source: 'switch' }
 *        - Side effects: may change DOM, localStorage, location, fullscreen
 *
 *   6) dualux.on(_event, handler)
 *      dualux.off(_event, handler)
 *        - Input:
 *            _event: string (ignored in v2; single channel; pass 'modechange' for readability)
 *            handler: (detail) => void
 *        - detail shape:
 *            { displayMode: 'browser'|'standalone'|'fullscreen',
 *              uxMode: 'web'|'app',
 *              changed: boolean,
 *              source: 'detection'|'media'|'fullscreen'|'switch' }
 *
 * DISPLAY-MODE SEMANTICS (hard requirements)
 *   • 'standalone'  → session is considered "installed"; defaults to UX 'app' (configurable via mapping.standaloneTo)
 *   • 'browser'     → session is a regular tab; defaults to UX 'web' (configurable via mapping.browserTo)
 *   • 'fullscreen'  → UX is derived from the session nature, NOT mapping:
 *                      - if the current session is standalone → UX 'app'
 *                      - if the current session is browser    → UX 'web'
 *     Rationale: pressing F11 (desktop) must not flip UX. This rule is enforced regardless of mapping.
 *
 * DOM REQUIREMENTS
 *   • Provide containers that match `targets.web` and `targets.app` (default: '#web-ux', '#app-ux').
 *   • Provide a CSS class (default: '.hidden') that hides inactive container (`display:none !important;` is fine).
 *   • The runtime will add/remove `hiddenClass` on those nodes.
 *   • Defensive rendering prevents blank screens if one container is missing.
 *
 * STORAGE / PERSISTENCE
 *   • localStorage keys (namespaced by `storageKey`, default 'dualux'):
 *       `${key}:displayMode`, `${key}:uxMode`, `${key}:isStandalone`
 *   • The runtime does NOT *read* `isStandalone` from storage for behavior (only writes it for debugging/telemetry).
 *
 * EVENTS
 *   • Subscribers added with `dualux.on()` receive a unified event payload (see above).
 *   • `_event` argument is accepted for readability but not used to filter handlers in v2.
 *
 * ERROR HANDLING & SAFETY
 *   • All DOM and Fullscreen calls are guarded; failures are swallowed to avoid breaking UX.
 *   • If both containers are missing, runtime becomes a no-op beyond state/emits.
 *
 * BROWSER / PLATFORM NOTES
 *   • Desktop Chrome/Edge/Firefox: Fullscreen is detected via the Fullscreen API first.
 *   • iOS Safari PWA (standalone): detected via `navigator.standalone === true`.
 *   • Media queries `(display-mode: …)` are also observed and debounced.
 *
 * NON-GOALS
 *   • No DOM CustomEvent dispatch in v2 (use `dualux.on(...)`).
 *   • No SSR support (assumes `window`, `document`, `matchMedia` exist).
 *
 * SAMPLE USAGE
 *   import { dualux } from '/js/dualux.runtime.js';
 *   dualux.configure({
 *     targets: { web: '#web-ux', app: '#app-ux', hiddenClass: 'hidden' },
 *     routes: { appHome: '/app', webHome: '/' },
 *     // DO NOT attempt to force fullscreen mapping; it's session-derived by design.
 *   });
 *   dualux.on('modechange', ({displayMode, uxMode}) => { console.log(displayMode, uxMode); });
 *   dualux.init();
 * =================================================================================================
 */

const DEFAULTS = {
  // Console diagnostics toggle
  enableLogging: false,

  // Selectors the runtime will show/hide by toggling `hiddenClass`
  targets: { web: '#web-ux', app: '#app-ux', hiddenClass: 'hidden' },

  // Mapping for non-fullscreen cases only. Fullscreen is session-derived (see resolveUxMode()).
  // NOTE: `fullscreenTo` here is informational and ignored by resolveUxMode() by design.
  mapping: { standaloneTo: 'app', fullscreenTo: 'app', browserTo: 'web' },

  // Optional UX-specific navigation anchors when `switchUx(..., { navigate:true })` is used
  routes: { appHome: '/app', webHome: '/' },

  // localStorage key prefix
  storageKey: 'dualux',
};

/** Returns v if defined, otherwise default d. */
function clamp(v, d) { return (v === undefined ? d : v); }

/**
 * Debounce helper for noisy events (e.g., media query changes).
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function} debounced function
 */
function debounce(fn, ms = 50) {
  let t;
  return function (...args) {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn.apply(this, args), ms);
  };
}

/** Conditional logger with unified prefix. */
function log(enabled, ...args) { if (enabled) console.log('[DUAL-UX]', ...args); }

/**
 * Detect the active "display mode".
 * Hard rule: on desktop, the Fullscreen API is authoritative for F11/ESC transitions.
 * Falls back to (display-mode:*) media queries and platform heuristics (iOS Safari standalone).
 * @returns {'fullscreen'|'standalone'|'browser'}
 */
function detectDisplayMode() {
  // 1) Fullscreen API is authoritative for desktop browsers (F11, ESC)
  if (document.fullscreenElement) return 'fullscreen';

  // 2) Media queries + platform heuristics
  const isMediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isMediaFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
  const isMediaBrowser = window.matchMedia('(display-mode: browser)').matches;
  const isSafariStandalone = window.navigator && window.navigator.standalone === true;

  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

  // Chrome-like mobile standalone heuristic (no browser UI chrome, no referrer)
  const isLikelyChromeStandalone =
    isMobile &&
    typeof (window.navigator || {}).standalone === 'undefined' &&
    !document.referrer &&
    Math.abs(window.innerHeight - screen.height) <= 1 &&
    window.innerWidth === screen.width;

  if (isMediaStandalone || isSafariStandalone || isLikelyChromeStandalone) return 'standalone';
  if (isMediaFullscreen) return 'fullscreen';
  if (isMediaBrowser) return 'browser';
  return 'browser';
}

class DualUxRuntime {
  constructor() {
    // Clone defaults (no structuredClone for broader support)
    this.cfg = JSON.parse(JSON.stringify(DEFAULTS));

    // Subscriptions to (display-mode:*) queries
    this.mediaQueries = [];

    // In-process listeners (single unified channel)
    this.handlers = new Set();

    // Current display and UX modes
    /** @type {'browser'|'standalone'|'fullscreen'} */ this.displayMode = 'browser';
    /** @type {'web'|'app'} */ this.uxMode = 'web';

    // Manual UX override (set by switchUx); when set, mapping/derivation is bypassed
    this.uxOverride = null;

    // Session flag: true only when actually in 'standalone' display mode
    // Used to decide UX while in 'fullscreen' (installed vs browser fullscreen)
    this.isStandalone = false;
  }

  /**
   * Merge runtime configuration.
   * NOTE: Do not rely on `mapping.fullscreenTo`; fullscreen is session-derived.
   * @param {Object} options
   */
  configure(options) {
    if (!options) return;
    this.cfg.enableLogging = clamp(options.enableLogging, this.cfg.enableLogging);
    if (options.targets) this.cfg.targets = { ...this.cfg.targets, ...options.targets };
    if (options.mapping) this.cfg.mapping = { ...this.cfg.mapping, ...options.mapping };
    if (options.routes) this.cfg.routes = { ...this.cfg.routes, ...options.routes };
    if (options.storageKey) this.cfg.storageKey = options.storageKey;
  }

  /**
   * Boot the runtime: detect, render, notify, and bind listeners.
   * Must be called once per page load (after DOM is present).
   */
  init() {
    this.displayMode = detectDisplayMode();

    // Derive isStandalone strictly from the live mode
    this.isStandalone = (this.displayMode === 'standalone');

    // Resolve UX and persist initial state
    this.uxMode = this.resolveUxMode();
    this.persistState();

    log(this.cfg.enableLogging, 'Mode Detected:', {
      displayMode: this.displayMode,
      uxMode: this.uxMode,
      isStandalone: this.isStandalone,
      userAgent: navigator.userAgent,
      screenHeight: screen.height,
      innerHeight: window.innerHeight,
      referrer: document.referrer,
    });

    // Initial paint and event to subscribers
    this.render();
    this.emit({ displayMode: this.displayMode, uxMode: this.uxMode, changed: true, source: 'detection' });

    // Media query listeners for display-mode changes (debounced)
    this.mediaQueries = [
      window.matchMedia('(display-mode: standalone)'),
      window.matchMedia('(display-mode: fullscreen)'),
      window.matchMedia('(display-mode: browser)'),
    ];

    const onModeMaybeChanged = debounce(() => {
      const nextDisplay = detectDisplayMode();
      if (nextDisplay === this.displayMode) return;

      const prevDisplay = this.displayMode;
      this.displayMode = nextDisplay;

      // Update isStandalone only on explicit, non-fullscreen modes
      if (nextDisplay === 'standalone') this.isStandalone = true;
      if (nextDisplay === 'browser') this.isStandalone = false;

      if (!this.uxOverride) {
        if (nextDisplay === 'fullscreen') {
          // Desktop fullscreen must keep UX aligned with session nature
          this.uxMode = this.isStandalone ? 'app' : 'web';
        } else {
          this.uxMode = this.resolveUxMode();
        }
      }

      this.persistState();
      log(this.cfg.enableLogging, 'Display mode changed:', {
        from: prevDisplay, to: this.displayMode, uxMode: this.uxMode, isStandalone: this.isStandalone
      });
      this.render();
      this.emit({ displayMode: this.displayMode, uxMode: this.uxMode, changed: true, source: 'media' });
    }, 50);

    this.mediaQueries.forEach((mq) => mq.addEventListener('change', onModeMaybeChanged));

    // React immediately to F11/ESC transitions
    document.addEventListener('fullscreenchange', () => {
      const nowFullscreen = !!document.fullscreenElement;
      const nextDisplay = nowFullscreen ? 'fullscreen' : detectDisplayMode();
      if (nextDisplay === this.displayMode) return;

      this.displayMode = nextDisplay;

      // Do not change `isStandalone` here (only explicit modes set it)
      if (!this.uxOverride) {
        if (nowFullscreen) {
          this.uxMode = this.isStandalone ? 'app' : 'web';
        } else {
          // On exit, recompute session nature and UX
          this.isStandalone = (this.displayMode === 'standalone');
          this.uxMode = this.resolveUxMode();
        }
      }

      this.persistState();
      log(this.cfg.enableLogging, 'Fullscreenchange:', {
        fullscreen: nowFullscreen, displayMode: this.displayMode, uxMode: this.uxMode, isStandalone: this.isStandalone
      });
      this.render();
      this.emit({ displayMode: this.displayMode, uxMode: this.uxMode, changed: true, source: 'fullscreen' });
    });
  }

  /** @returns {'browser'|'standalone'|'fullscreen'} */
  getDisplayMode() { return this.displayMode; }

  /** @returns {'web'|'app'} */
  getUxMode() { return this.uxMode; }

  /**
   * Programmatically switch UX (e.g., user toggles “Open App Mode”).
   * @param {'web'|'app'} to
   * @param {{persist?:boolean,navigate?:boolean,requestFullscreen?:boolean}} [options]
   * @returns {{displayMode:string, uxMode:string, changed:boolean, source:'switch'}}
   */
  async switchUx(to, options) {
    const opts = options || {};
    const persist = opts.persist !== false;
    const navigate = !!opts.navigate;
    const requestFullscreen = !!opts.requestFullscreen;

    const prev = this.uxMode;
    this.uxOverride = to;
    this.uxMode = to;

    if (persist) this.persistState();

    // Optional: enter fullscreen when switching to app UX
    if (requestFullscreen && to === 'app') {
      try {
        const el = document.documentElement;
        if (el && el.requestFullscreen) await el.requestFullscreen();
      } catch (_) {} // ignore user-gesture requirements, etc.
    }

    if (navigate) {
      const url = to === 'app' ? this.cfg.routes.appHome : this.cfg.routes.webHome;
      if (url && location.pathname !== url) window.location.assign(url);
    }

    const changed = prev !== this.uxMode;
    this.render();
    const detail = { displayMode: this.displayMode, uxMode: this.uxMode, changed, source: 'switch' };
    this.emit(detail);
    return detail;
  }

  /**
   * Subscribe to mode changes. `_event` is accepted but ignored (single channel).
   * @param {string} _event
   * @param {(detail:{displayMode:string,uxMode:string,changed:boolean,source:string})=>void} handler
   */
  on(_event, handler) { this.handlers.add(handler); }

  /**
   * Unsubscribe a previously registered handler.
   * @param {string} _event
   * @param {Function} handler
   */
  off(_event, handler) { this.handlers.delete(handler); }

  /**
   * Resolve UX from current displayMode unless manually overridden.
   * Fullscreen is session-derived (installed→app, browser→web) by design.
   * @private
   */
  resolveUxMode() {
    if (this.uxOverride) return this.uxOverride;
    const m = this.cfg.mapping;
    switch (this.displayMode) {
      case 'standalone': return m.standaloneTo; // default: 'app'
      case 'fullscreen':
        // Hard requirement: fullscreen never flips UX by mapping.
        return this.isStandalone ? 'app' : 'web';
      case 'browser':
      default: return m.browserTo; // default: 'web'
    }
  }

  /**
   * Show one container and hide the other.
   * Defensive: if a target is missing, show the other to avoid blank screens.
   * @private
   */
  render() {
    const t = this.cfg.targets;
    const hidden = t.hiddenClass || 'hidden';

    const appEl = t.app ? document.querySelector(t.app) : null;
    const webEl = t.web ? document.querySelector(t.web) : null;

    const hide = (el) => el && el.classList.add(hidden);
    const show = (el) => el && el.classList.remove(hidden);

    const wantApp = this.uxMode === 'app';

    if (wantApp) {
      if (appEl) {
        show(appEl);
        if (webEl) hide(webEl);
      } else {
        if (webEl) show(webEl); // fallback to avoid blank
      }
    } else {
      if (webEl) {
        show(webEl);
        if (appEl) hide(appEl);
      } else {
        if (appEl) show(appEl); // fallback to avoid blank
      }
    }
  }

  /**
   * Notify subscribers. (Single broadcast channel in v2.)
   * @private
   */
  emit(detail) {
    this.handlers.forEach((h) => {
      try { h(detail); } catch (e) { console.error('[DUAL-UX] handler error', e); }
    });
  }

  /**
   * Persist current modes & session hint for diagnostics/telemetry.
   * Behavior does not rely on reading `isStandalone` from storage.
   * @private
   */
  persistState() {
    try {
      const base = this.cfg.storageKey || 'dualux';
      localStorage.setItem(`${base}:displayMode`, this.displayMode);
      localStorage.setItem(`${base}:uxMode`, this.uxMode);
      localStorage.setItem(`${base}:isStandalone`, String(this.isStandalone));
    } catch (_) {} // storage may be unavailable (quota/3P/iframe)
  }
}

/** Preferred v2 API */
export const dualux = new DualUxRuntime();
