
# DUAL-UX — A Split Web/App Experience for PWAs

> Deliver a *shareable, SEO-optimized* web experience **and** an *immersive, install-worthy* app experience from a single codebase. DUAL-UX formalizes the “two modes, one PWA” model for higher acquisition **and** retention.

---

## Key Benefits

- **Two UX modes, one repo:** Web UX optimized for discovery; App UX optimized for engagement.
- **Lightweight runtime:** A small client script (`dualux.runtime.js`) detects context and toggles UX.
- **Standards-compliant PWA:** Uses manifest + service worker for installability and offline.
- **No lock-in:** Vanilla HTML/CSS/JS; drop into any SPA/MPA.

---

## Directory Structure

```
.
├── app
├── assets
│   └── css
│       └── style.css
├── icons
│   ├── icon-192.png
│   └── icon-512.png
├── screenshots
│   ├── app.png
│   └── website.png
├── js
│   ├── dualux.runtime.js
│   ├── dualux.runtime.min.js
│   └── register-sw.js
├── index.html
├── sw.js
├── manifest.json
├── favicon.ico
├── htaccess
└── README.md
```

---

## Screenshots

- **Web UX (acquisition):** `screenshots/website.png`  
- **App UX (retention):** `screenshots/app.png`

---

## Quick Start (Local)

> Service workers require **HTTPS** or **localhost**. Don’t open `index.html` via `file://`.

**Option A — Node static server**
```bash
# from the repo root
npx serve -s . --single
```

**Option B — Python**
```bash
# Python 3
python -m http.server 8080
```

Open http://localhost:8080 and install the PWA (Add to Home Screen).  
If you use routes like `/app`, ensure your dev server rewrites unknown paths to `/index.html` (SPA fallback).

---

## How It Works

### 1) Include the runtime

In `index.html`:
```html
<!-- Dual-UX Runtime (use -min in production) -->
<script type="module" src="/js/dualux.runtime.js"></script>

<!-- Register the service worker -->
<script src="/js/register-sw.js" defer></script>
```

### 2) Provide two UX containers

```html
<!-- Web-first UX (public, SEO, shareable) -->
<section id="web-ux"> ... </section>

<!-- App-first UX (installed, loyal users) -->
<section id="app-ux" class="hidden"> ... </section>
```

> The runtime toggles visibility between `#web-ux` and `#app-ux`.

### 3) Configure & initialize

```html
<!-- DUAL-UX Runtime v1.1.0
    * Event-driven UX-mode runtime with display-mode detection. -->
  <script type="module">
    import { dualux } from '/js/dualux.runtime.v1.1.0.js';
    dualux.configure({
      routing: { strategy: 'runtime' },   // no query/hash
      routes:  { appHome: '/', webHome: '/' }, // optional; same entry
      mapping: { standaloneTo: 'app', browserTo: 'web' }
    });
    dualux.init();
  </script>
```

> **Mapping:**  
> - `standaloneTo: 'app'` → installed/standalone sessions see the App UX  
> - `browserTo: 'web'` → tabbed/browser sessions see the Web UX

---

## PWA Setup

### `manifest.json` (excerpt)
```json
{
  "name": "DUAL-UX PWA",
  "short_name": "DUAL-UX",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#000000",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service worker registration

`js/register-sw.js` should register your worker (typically `/sw.js`). Example:
```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.error('SW registration failed:', err));
  });
}
```

### Offline shell for `/app` (example SW snippet)

> Ensure `/app` always resolves to your shell offline so installs remain healthy.

```js
// sw.js (Workbox or vanilla; vanilla example)
const SHELL = '/index.html';
self.addEventListener('install', e => {
  e.waitUntil(caches.open('shell-v1').then(c => c.addAll([SHELL, '/manifest.json'])));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Serve the app shell for /app navigations
  if (e.request.mode === 'navigate' && url.pathname.startsWith('/app')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(SHELL))
    );
    return;
  }
  // Default network-first with cache fallback
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
```

---

## Production Usage

- **Use the minified runtime (when available)**: `js/dualux.runtime.v1.1.0.min.js`.
- **Set cache headers** for icons, CSS, and JS; **no-cache** for `index.html`.
- **Enable SPA fallback** on your CDN/host for routes like `/app/*` → `/index.html`.
- **HTTPS** required for installability and service workers.

---

## Customization

- **Selectors:** Change `targets.web` / `targets.app` to match your DOM.
- **Routing:** Adjust `routes.appHome` / `routes.webHome` for your project.
- **UX rules:** Update `mapping` if you want standalone to show the Web UX (or vice-versa).

---

## Troubleshooting

- **“Add to Home Screen” not shown:** Check `manifest.json`, served over HTTPS, and a working SW.
- **White flash on launch:** Preload critical CSS, set `background_color` in the manifest, and ensure your app shell renders above-the-fold content early.
- **Offline `/app` 404:** Verify the service worker shell fallback for `/app` navigations.

---

## Browser Support

Modern Chromium, Firefox, and Safari. Install experience and API availability vary by platform and version.

---

## Contributing

Issues and PRs are welcome. Please:
1. Open an issue describing the change.
2. Keep additions framework-agnostic.
3. Include before/after screenshots where UX is affected.

---

## License

- **Open Source:** GNU **AGPL-3.0** (suitable for networked/web deployments that share improvements).
- **Commercial License:** Available for proprietary use without AGPL obligations. Open an issue or start a discussion to connect with the maintainers.

---

## Trademarks & Patent Notice

DUAL-UX is a patented approach. © 2021–2025 Easywebapp Inc. All rights reserved.  
Product names and logos are property of their respective owners.

---

## Roadmap (Highlights)

- Optional Workbox recipe for richer offline policies.
- Built-in analytics hooks for install/UX-mode events.
- TypeScript types and ESM/CJS bundles.

---

### At a Glance

- **Web = reach. App = retention.** DUAL-UX lets you do both—deliberately.  
- Drop into any PWA, keep your stack, ship faster.
