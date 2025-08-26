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
 * DUAL-UX Runtime v1.1.0 (ES module)
 * Event-driven UX-mode runtime with display-mode detection + URL strategies (query/hash/runtime).
 * © 2021–2025 Easywebapp Inc. All rights reserved. Author: Ron J. van der Zwan (Easywebapp Inc.)
 *
 * =================================================================================================
 * NEW: HTACCESS-FREE ROUTING STRATEGIES
 *   routing.strategy: 'query' | 'hash' | 'runtime'
 *     - 'query'   → /?mode=app or /?mode=web
 *     - 'hash'    → /#/app or /#/web
 *     - 'runtime' → single entry; mode chosen by display-mode (standalone=app, browser=web)
 *
 * Minimal config examples:
 *   // Query param strategy (great for Shopify/static)
 *   dualux.configure({ routing: { strategy: 'query' } });
 *
 *   // Hash strategy (GitHub Pages/Netlify friendly)
 *   dualux.configure({ routing: { strategy: 'hash' } });
 *
 *   // Runtime-only (no deep links; zero config)
 *   dualux.configure({ routing: { strategy: 'runtime' } });
 *
 * Everything else (display-mode rules, fullscreen behavior) remains unchanged.
 * =================================================================================================
 */

const DEFAULTS = {
  // Console diagnostics toggle
  enableLogging: false,

  // Selectors the runtime will show/hide by toggling `hiddenClass`
  targets: { web: '#web-ux', app: '#app-ux', hiddenClass: 'hidden' },

  // Mapping for non-fullscreen cases only. Fullscreen is session-derived (see resolveUxMode()).
  mapping: { standaloneTo: 'app', fullscreenTo: 'app', browserTo: 'web' },

  // Optional UX-specific navigation anchors when `switchUx(..., { navigate:true })` is used.
  // NOTE: If not provided, they will be derived from routing.strategy at runtime.
  routes: { appHome: '/app', webHome: '/' },

  // HTACCESS-FREE strategy configuration
  routing: {
    strategy: 'runtime',     // 'query' | 'hash' | 'runtime'
    param: 'mode',           // query key for 'query' strategy: /?mode=app|web
    hashApp: '#/app',        // hash token for 'hash' strategy
    hashWeb: '#/web'
  },

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
 * @returns {'fullscreen'|'standalone'|'browser'}
 */
function detectDisplayMode() {
  if (document.fullscreenElement) return 'fullscreen';

  const isMediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isMediaFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
  const isMediaBrowser = window.matchMedia('(display-mode: browser)').matches;
  const isSafariStandalone = window.navigator && window.navigator.standalone === true;

  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
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

/** URL helpers for strategy-based deep linking (no htaccess). */
const UrlStrategy = {
  /** Inspect URL and return an intent: 'app' | 'web' | null */
  readIntent(cfg) {
    const r = cfg.routing || {};
    const strategy = r.strategy || 'runtime';
    if (strategy === 'query') {
      const key = r.param || 'mode';
      const val = new URLSearchParams(location.search).get(key);
      if (val === 'app' || val === 'web') return val;
      return null;
    }
    if (strategy === 'hash') {
      const h = location.hash || '';
      if (h.startsWith(r.hashApp || '#/app')) return 'app';
      if (h.startsWith(r.hashWeb || '#/web')) return 'web';
      return null;
    }
    return null; // 'runtime' does not signal via URL
  },

  /** Compute navigation target for a given UX ('app'|'web') */
  navTo(cfg, to) {
    // Prefer explicit routes if provided
    const explicit = to === 'app' ? cfg.routes.appHome : cfg.routes.webHome;
    if (explicit) return explicit;

    // Otherwise synthesize from routing.strategy
    const r = cfg.routing || {};
    const strategy = r.strategy || 'runtime';

    if (strategy === 'query') {
      const key = r.param || 'mode';
      const url = new URL(location.href);
      url.searchParams.set(key, to);
      url.hash = ''; // keep clean
      return url.pathname + '?' + url.searchParams.toString(); // relative
    }

    if (strategy === 'hash') {
      const token = to === 'app' ? (r.hashApp || '#/app') : (r.hashWeb || '#/web');
      return location.pathname + location.search + token; // keep current path/query, add hash
    }

    // 'runtime': no special deep link—stay on the same entry
    return location.pathname + location.search + (location.hash || '');
  }
};

class DualUxRuntime {
  constructor() {
    this.cfg = JSON.parse(JSON.stringify(DEFAULTS));
    this.mediaQueries = [];
    this.handlers = new Set();

    /** @type {'browser'|'standalone'|'fullscreen'} */ this.displayMode = 'browser';
    /** @type {'web'|'app'} */ this.uxMode = 'web';

    // Manual override (explicit switch or URL intent)
    this.uxOverride = null;

    // True when actually in 'standalone' display mode (used for fullscreen derivation)
    this.isStandalone = false;
  }

  configure(options) {
    if (!options) return;
    this.cfg.enableLogging = clamp(options.enableLogging, this.cfg.enableLogging);
    if (options.targets) this.cfg.targets = { ...this.cfg.targets, ...options.targets };
    if (options.mapping) this.cfg.mapping = { ...this.cfg.mapping, ...options.mapping };
    if (options.routes) this.cfg.routes = { ...this.cfg.routes, ...options.routes };
    if (options.routing) this.cfg.routing = { ...this.cfg.routing, ...options.routing };
    if (options.storageKey) this.cfg.storageKey = options.storageKey;
  }

  init() {
    // 1) Detect display mode & session nature
    this.displayMode = detectDisplayMode();
    this.isStandalone = (this.displayMode === 'standalone');

    // 2) Read URL intent for query/hash strategies (sets initial override if present)
    const intent = UrlStrategy.readIntent(this.cfg);
    if (intent === 'app' || intent === 'web') this.uxOverride = intent;

    // 3) Resolve UX and persist
    this.uxMode = this.resolveUxMode();
    this.persistState();

    log(this.cfg.enableLogging, 'Mode Detected:', {
      displayMode: this.displayMode,
      uxMode: this.uxMode,
      isStandalone: this.isStandalone,
      routing: this.cfg.routing,
      userAgent: navigator.userAgent
    });

    // 4) Initial paint + notify
    this.render();
    this.emit({ displayMode: this.displayMode, uxMode: this.uxMode, changed: true, source: intent ? 'url' : 'detection' });

    // 5) Bind media query observers (debounced)
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

      if (nextDisplay === 'standalone') this.isStandalone = true;
      if (nextDisplay === 'browser') this.isStandalone = false;

      if (!this.uxOverride) {
        if (nextDisplay === 'fullscreen') {
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

    // 6) React to F11/ESC transitions
    document.addEventListener('fullscreenchange', () => {
      const nowFullscreen = !!document.fullscreenElement;
      const nextDisplay = nowFullscreen ? 'fullscreen' : detectDisplayMode();
      if (nextDisplay === this.displayMode) return;

      this.displayMode = nextDisplay;

      if (!this.uxOverride) {
        if (nowFullscreen) {
          this.uxMode = this.isStandalone ? 'app' : 'web';
        } else {
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
   * Programmatically switch UX.
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

    if (requestFullscreen && to === 'app') {
      try {
        const el = document.documentElement;
        if (el && el.requestFullscreen) await el.requestFullscreen();
      } catch (_) {}
    }

    if (navigate) {
      const url = UrlStrategy.navTo(this.cfg, to);
      // Avoid infinite reload loops: only navigate when target differs
      const current = location.pathname + location.search + location.hash;
      if (current !== url) window.location.assign(url);
    }

    const changed = prev !== this.uxMode;
    this.render();
    const detail = { displayMode: this.displayMode, uxMode: this.uxMode, changed, source: 'switch' };
    this.emit(detail);
    return detail;
  }

  on(_event, handler) { this.handlers.add(handler); }
  off(_event, handler) { this.handlers.delete(handler); }

  resolveUxMode() {
    if (this.uxOverride) return this.uxOverride;
    const m = this.cfg.mapping;
    switch (this.displayMode) {
      case 'standalone': return m.standaloneTo; // default: 'app'
      case 'fullscreen': return this.isStandalone ? 'app' : 'web';
      case 'browser':
      default: return m.browserTo; // default: 'web'
    }
  }

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
        if (webEl) show(webEl);
      }
    } else {
      if (webEl) {
        show(webEl);
        if (appEl) hide(appEl);
      } else {
        if (appEl) show(appEl);
      }
    }
  }

  emit(detail) {
    this.handlers.forEach((h) => {
      try { h(detail); } catch (e) { console.error('[DUAL-UX] handler error', e); }
    });
  }

  persistState() {
    try {
      const base = this.cfg.storageKey || 'dualux';
      localStorage.setItem(`${base}:displayMode`, this.displayMode);
      localStorage.setItem(`${base}:uxMode`, this.uxMode);
      localStorage.setItem(`${base}:isStandalone`, String(this.isStandalone));
    } catch (_) {}
  }
}

/** Preferred API */
export const dualux = new DualUxRuntime();

/* =========================
 * QUICK-START CONFIG RECIPES
 * =========================
 *
 * // 1) Query-param (Shopify/static; sharable deep links)
 * dualux.configure({
 *   routing: { strategy: 'query', param: 'mode' }, // results in /?mode=app or /?mode=web
 *   targets: { web: '#web-ux', app: '#app-ux', hiddenClass: 'hidden' },
 *   mapping: { standaloneTo: 'app', browserTo: 'web' },
 * });
 * dualux.init();
 *
 * // 2) Hash (GitHub Pages/Netlify friendly)
 * dualux.configure({
 *   routing: { strategy: 'hash', hashApp: '#/app', hashWeb: '#/web' },
 * });
 * dualux.init();
 *
 * // 3) Runtime-only (zero-config, no deep links)
 * dualux.configure({
 *   routing: { strategy: 'runtime' },
 * });
 * dualux.init();
 */
