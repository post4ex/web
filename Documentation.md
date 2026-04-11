# Post4Ex Frontend — Documentation
*Version 3.0.0 | Last Updated: 2025*

---

## Section 1: Architecture Overview

### Technology Stack
- **Vanilla JavaScript** — no framework, no build step required
- **Tailwind CSS 3.4** — compiled to `style.css` (not CDN in production)
- **IndexedDB** — client-side offline data storage (version 5)
- **SSE (Server-Sent Events)** — real-time push from backend
- **Font Awesome 6.5** — icons (local, no CDN dependency)

### Core Script Files (load order matters)

| File | Purpose |
|---|---|
| `indexeddb.js` | DB init, schema, CRUD operations |
| `core/app-config.js` | CONSTANTS, ROLE_LEVELS, PAGE_CONFIG, theme |
| `core/formatIST.js` | Date formatting (IST timezone) |
| `core/app-notify.js` | Bell notifications, toast messages |
| `core/app-api.js` | API calls, data sync, SSE handler |
| `core/app-auth.js` | Session, heartbeat, RBAC, logout |
| `core/layout.js` | Component loader, UI init, page entry point |

### Page Boot Sequence
```
DOMContentLoaded
  → fetch dev_url.json → set API URL
  → createNotificationModal()
  → fetchClientIP()
  → loadComponent(header) + loadComponent(footer)
  → fire footerLoaded
  → checkLoginStatus() → RBAC redirect if needed
  → setActiveNavOnLoad()
  → initializeUI() → wire buttons, notif actions
  → wait indexedDBReady
  → if logged in:
      → hasData? loadNotificationsFromStorage : verifyAndFetchAppData
      → openSSE()
      → initHeartbeat()
```

---

## Section 2: Data Layer

### IndexedDB (version 5)
Database name: `WEBIndexedDB`

| Store | Key Field | Contents |
|---|---|---|
| ORDERS | REFERENCE | All shipment orders |
| B2B | CODE | B2B client records |
| B2B2C | UID | Retail client records |
| RATES | UID | Rate cards |
| STAFF | STAFF_CODE | Staff records |
| ATTENDANCE | ATTENDANCE_ID | Attendance logs |
| BRANCHES | BRANCH_CODE | Branch master |
| MODES | SHORT | Transport modes |
| CARRIERS | COMPANY_CODE | Carrier master |
| MULTIBOX | MB_UID | Multi-box entries per order |
| PRODUCTS | PD_UID | Product/document entries per order |
| UPLOADS | UPLOAD_UID | Uploaded document records |
| CALC_HISTORY | CALC_UID | Calculator history |
| NOTIFICATIONS | NOTIF_ID | Per-user notifications (IS_READ boolean) |
| _metadata | key | lastSyncTime etc. |

### Data Sync Flow
```
Login / page load
  → POST /api/verifyAndFetchAppData
    → all collections fetched in parallel (asyncio.gather on backend)
    → clearSheet + putSheet per collection
    → fire appDataLoaded + appDataRefreshed
  → GET /api/fetchNotifications
    → putSheet NOTIFICATIONS (IS_READ computed per user on backend)
    → loadNotificationsFromStorage()

Live updates via SSE:
  → delta upsert → mergeSheet → fire appDataRefreshed
  → delta delete → deleteRecord → fire appDataRefreshed
  → notification → mergeSheet NOTIFICATIONS + render bell
```

### Reading Data
```js
// Single collection
const orders = await getAppData('ORDERS');

// All collections
const data = await getAppData();

// Listen for updates
window.addEventListener('appDataRefreshed', (e) => {
    renderPage(e.detail.data);
});
```

---

## Section 3: Notification System

### Bell Notifications (persistent, saved to PocketBase)
- Stored in IndexedDB `NOTIFICATIONS` store
- `IS_READ` — boolean computed by backend per requesting user
- `DISMISSED_BY` — JSON array, filtered server-side before sending
- CRITICAL notifications: non-admin = read only, ADMIN+ = can dismiss

### Per-item actions
| Button | Icon | Condition | Action |
|---|---|---|---|
| Envelope | 📧 | IS_READ = false | Mark read → `/api/notifread` |
| X | ✕ | non-CRITICAL or ADMIN+ | Dismiss → `/api/notifclear` |

### Header dropdown actions
| Button | Action |
|---|---|
| ✓ All read | Mark all unread as read |
| 🗑 Clear all | Dismiss all non-CRITICAL |

### Toast Notifications (transient, UI only)
```js
showNotification('message', 'success' | 'error' | 'warning' | 'info', durationMs);
```
- Fixed position: `top:72px right:16px` (below sticky header)
- Uses inline styles — Tailwind classes don't work on dynamic elements
- Auto-dismisses with fade
- Never saved to IndexedDB or PocketBase

---

## Section 4: Authentication & RBAC

### Session Storage
- JWT stored in `localStorage['loginData']` as `{ sessionId, userData: { NAME, ROLE, CODE, BRANCH, COL_FILTER, FILTER_VALUE } }`
- 8hr hard expiry, 2hr inactivity timeout
- On logout: localStorage cleared, IndexedDB wiped, redirect to login.html

### Role Levels
| Role | Level |
|---|---|
| MASTER | 100 |
| ADMIN | 90 |
| AUDITOR | 70 |
| ACCOUNTANT | 60 |
| MANAGER | 50 |
| STAFF | 10 |
| CLIENT | 1 |
| GUEST | 0 |

### Page Protection
`PAGE_CONFIG` in `app-config.js` maps each page to minimum role. `checkLoginStatus()` redirects on insufficient role.

### Data Filtering
Users have `COL_FILTER` (field name: `CODE` or `BRANCH`) and `FILTER_VALUE` (e.g. `AGWL`, `DDN`). Backend applies this filter on all data fetches and SSE broadcasts. ADMIN+ receive all data.

---

## Section 5: Real-Time (SSE)

### Connection
- Opens on login, reconnects automatically on disconnect
- On reconnect: full `verifyAndFetchAppData()` to catch up missed updates
- Heartbeat every 15 seconds from backend

### Message Types
| type | Frontend action |
|---|---|
| `heartbeat` | Reset idle timer |
| `notif_count` | Update bell badge number |
| `notification` | Save to IndexedDB + render in bell |
| `system_status` | No-op (503 on next API call handles it) |
| `delta` upsert | mergeSheet + fire appDataRefreshed |
| `delta` delete | deleteRecord + fire appDataRefreshed |

---

## Section 6: Header & Navigation

### Structure
- Sticky, `z-index:30`, brand color `#9C2007`
- Left: sidebar toggle + logo
- Right: notification bell + profile dropdown + mobile menu

### Navigation Generation
`NAV_CONFIG` in `header.html` defines public, private, and sidebar menus. `renderNavItems()` generates HTML filtered by user role. Sidebar has collapsible submenus.

### Notification Bell
- Hidden until login
- Badge shows unread count
- Dropdown: mark-all-read + clear-all + notification list
- Notifications loaded from IndexedDB on page load

---

## Section 7: Vendored Libraries

| Library | File | Purpose |
|---|---|---|
| Chart.js | assets/js/chart.js | Charts (dashboard only) |
| jsPDF | assets/js/jspdf.umd.min.js | PDF generation |
| PDF.js | assets/js/pdf.min.js | PDF viewing |
| QRCode.js | assets/js/qrcode.min.js | QR code generation |
| JsBarcode | assets/js/JsBarcode.all.min.js | Barcode generation |
| Tesseract.js | assets/js/tesseract.min.js | OCR |
| Cropper.js | assets/js/cropper.min.js | Image cropping |
| CamanJS | assets/js/caman.full.min.js | Image filters |

All vendored — no CDN dependencies in production.

---

## Section 8: Styling

### Brand Colors
- Primary: `#9C2007` (maroon)
- Hover: `#8C1C06`
- Light: `#FEF2F2`
- Theme switchable via `window.setTheme('maroon' | 'blue')`

### Tailwind Note
Tailwind JIT only generates CSS for classes found in static files at build time. **Never use Tailwind classes on dynamically created elements** — use inline styles instead. This is why `showNotification` and notification items use `Object.assign(el.style, {...})`.

### Fonts
- Primary: Inter (local CSS + Google Fonts fallback)
- Icons: Font Awesome 6.5 (local woff2 files)

---

## Section 9: External Services (Frontend)

| Service | URL | Purpose |
|---|---|---|
| ipify | api.ipify.org | Client IP detection (2s timeout, fallback 0.0.0.0) |
| Backend API | CONSTANTS.OPERATIONS_URL | All data operations |

`OPERATIONS_URL` is set at runtime from `dev_url.json` (dev) or compiled into the nginx config (production).
