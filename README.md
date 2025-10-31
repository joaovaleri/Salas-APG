# Student Room Allocation Dashboard

A lightweight web interface for managing student room assignments and key delivery at IMECC/Unicamp.  
It provides authentication through the institution's Apache/PAM layer, fetches data from Google Sheets via a PHP proxy to Google Apps Script, and renders an interactive UI for real-time allocation management.

---

## Overview

This project connects a modern browser frontend to legacy Google Sheets storage, using a secure intermediate proxy layer.  
It is designed for administrative users to allocate students to rooms, register key handovers, and manage pending or returned keys.

### Architecture

- **Frontend:** [`index.html`](./index.html)  
  Responsive HTML + CSS + Vanilla JS single page app.
- **Logic Layer:** [`main.js`](./main.js)  
  Handles API calls, DOM updates, state caching, and modal rendering.
- **Proxy Layer:** [`api.php`](./api.php)  
  Validates requests, enforces domain access rules, and communicates with the Apps Script endpoint.
- **Session Auth:** [`whoiam.php`](./whoiam.php)  
  Provides session identity (email + admin flag) from Apache/PAM auth.

The backend data and actions are provided by a Google Apps Script endpoint integrated with institutional Google Sheets.

---

## Notable Techniques

- **Dynamic DOM updates** with native [Element.appendChild()](https://developer.mozilla.org/en-US/docs/Web/API/Element/appendChild) and [template literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)
- **Scoped CSS variables** via [`:root`](https://developer.mozilla.org/en-US/docs/Web/CSS/:root) for theming and dark mode support
- **Async API calls** using [`fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/fetch) and `await` for clean asynchronous flow
- **Progress overlays and spinners** implemented with [CSS animations](https://developer.mozilla.org/en-US/docs/Web/CSS/@keyframes)
- **Session-based access control** using HTTP cookies via the PHP layer
- **Browser storage clearing utilities** leveraging [`indexedDB`](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [`CacheStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Cache), and [`ServiceWorker`](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- **Modal window handling** and escape key closures with [`addEventListener`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
- **Adaptive layout** using CSS [`grid`](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout) and [`@media`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media) queries
- **Compact state toggling** through `body` classes (`logged-in` / `logged-out`)

---

## Libraries and External Dependencies

- [Google Apps Script](https://developers.google.com/apps-script) — backend logic and data persistence
- [Google Sheets API](https://developers.google.com/sheets/api) (indirectly through Apps Script)
- [Apache / mod_authnz_external](https://httpd.apache.org/docs/current/mod/mod_authnz_external.html) or PAM for institutional login
- [Font: Inter](https://fonts.google.com/specimen/Inter) with system-ui fallback
- No JavaScript frameworks, no build step — 100% browser-native

---

## Project Structure

```plaintext
/
├── index.html          # Main web app (UI + logic bootstrap)
├── /gas
│   └── main.js            # Frontend logic and async API helpers
├── /api
│   ├── api.php
│   └── whoiam.php
└──  /assets
│   └── /images         # UI visuals (optional)

```

## Implementation Highlights

- Uses a shared secret between api.php and Google Apps Script for secure proxy calls.

- Enforces role-based access via isAdminUser_() in the Apps Script backend.

- Employs short-term caching (CacheService) to minimize spreadsheet reads.

- Automatically sends notification emails on key delivery and return.

- Supports data recovery and cache reset through the “Fix Connection” button — clearing IndexedDB, CacheStorage, and ServiceWorker.

- The UI uses progressive disclosure: login gate, spinner overlay, and modal windows for student details.

---

## 👨‍💻 Author & License

**João Victor Valerio**  
Developer – IMECC / UNICAMP  
jvalerio@unicamp.br • https://github.com/joaovaleri • https://www.linkedin.com/in/joao-valerio-dev/  

**License:** MIT
    
