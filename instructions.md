# Post4Ex Frontend — Developer Instructions

## Stack
- **Vanilla JS** — no framework, no build step
- **Tailwind CSS** — compiled to style.css (no CDN in production)
- **IndexedDB** — offline data storage (version 5)
- **SSE** — real-time updates from backend
- **Font Awesome** — icons (local, no CDN)

## Local Development

### 1. Serve Frontend
```bash
# From project root
cd web
python3 -m http.server 3000
# or use Live Server in VS Code
```

### 2. Point to Dev Backend
Edit `web/dev_url.json`:
```json
{ "url": "http://localhost:8000" }
```
For mobile testing with Cloudflare tunnel:
```json
{ "url": "https://your-tunnel.trycloudflare.com" }
```

### 3. Clear IndexedDB (if schema changes)
Open browser DevTools → Application → IndexedDB → WEBIndexedDB → Delete database
Or bump `version` in `indexeddb.js` (triggers `onupgradeneeded` which wipes and recreates all stores).

## Adding a New Page

### 1. Create HTML file
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Name</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div id="header-placeholder"></div>

    <main class="container mx-auto px-4 py-6">
        <!-- page content -->
    </main>

    <div id="footer-placeholder"></div>

    <script src="indexeddb.js"></script>
    <script src="core/app-config.js"></script>
    <script src="core/formatIST.js"></script>
    <script src="core/app-notify.js"></script>
    <script src="core/app-api.js"></script>
    <script src="core/app-auth.js"></script>
    <script src="core/layout.js"></script>
</body>
</html>
```

### 2. Add to PAGE_CONFIG (app-config.js)
```js
'NewPage.html': 'CLIENT',  // minimum role required
```

### 3. Add to NAV_CONFIG (header.html) if needed
```js
{ label: 'New Page', link: 'NewPage.html', id: 'newpage', reqRole: 'CLIENT' }
```

## Using App Data

### Read from IndexedDB
```js
// All orders
const orders = await getAppData('ORDERS');
// orders = { 'REF001': {...}, 'REF002': {...} }

// All collections
const data = await getAppData();
// data = { ORDERS: {...}, B2B: {...}, ... }
```

### Listen for data updates
```js
window.addEventListener('appDataLoaded', (e) => {
    const data = e.detail.data;
    renderMyPage(data);
});

window.addEventListener('appDataRefreshed', (e) => {
    const data = e.detail.data;
    renderMyPage(data);
});
```

### Call API
```js
// POST
const result = await callApi('/api/bookOrder', { order: {...}, multibox: [], products: [] });

// GET
const result = await callApi('/api/fetchNotifications', {}, 'GET');

// PATCH
const result = await callApi('/api/updateOrder', { reference: 'REF001', CARRIER: 'DTDC' }, 'PATCH');
```

## Notifications

### Show UI toast (not saved to DB)
```js
showNotification('✅ Order saved', 'success');          // 3s
showNotification('❌ Failed to connect', 'error');      // 3s
showNotification('⚠️ Check your input', 'warning');    // 3s
showNotification('ℹ️ Loading...', 'info', 1500);       // 1.5s
```
Types: `success` (green), `error` (red), `warning` (yellow), `info` (blue)

### Toast position
Fixed `top:72px right:16px` — just below the sticky header. Uses inline styles (not Tailwind) because dynamically created elements are not scanned by Tailwind JIT.

## Role-Based Access

### Check role in JS
```js
const loginData = JSON.parse(localStorage.getItem('loginData') || '{}');
const role = loginData?.userData?.ROLE || 'GUEST';
const level = ROLE_LEVELS[role] || 0;

if (level >= ROLE_LEVELS['ADMIN']) {
    // show admin controls
}
```

### Page-level protection
Handled automatically by `checkLoginStatus()` via `PAGE_CONFIG` in `app-config.js`.

## SSE Events

The app maintains a persistent SSE connection after login. Events handled in `_handleSSEMessage`:

| type | action |
|---|---|
| `heartbeat` | reset idle timer |
| `notif_count` | update bell badge |
| `notification` | save to IndexedDB + render in bell |
| `system_status` | no-op (503 on next request) |
| `delta` upsert | mergeSheet + fire appDataRefreshed |
| `delta` delete | deleteRecord + fire appDataRefreshed |

## Important Rules

### Never use Tailwind on dynamically created elements
Tailwind JIT only generates CSS for classes found in static HTML/JS files at build time. Dynamic elements (created via `document.createElement`) must use inline styles.

### Never write to NOTIFICATIONS IndexedDB directly
Only `_handleSSEMessage` and `verifyAndFetchAppData` write to NOTIFICATIONS. All other code reads from it.

### showNotification is UI-only
Never use `showNotification` for real notifications. It's for transient UI feedback only — not saved to IndexedDB or PocketBase.

### Always check DB ready before reading
```js
if (!window.appDB || !window.appDB.db) return;
const data = await window.appDB.getSheet('ORDERS');
```

## Common Issues

### Notifications not showing
- Check IndexedDB NOTIFICATIONS store has records
- Check `IS_READ` field is present (set by `/api/fetchNotifications`)
- Check `loadNotificationsFromStorage()` is called after data is in DB

### Data not updating after API call
- SSE broadcast handles this automatically
- If SSE is disconnected, `verifyAndFetchAppData()` runs on reconnect

### Page shows wrong role content
- Check `PAGE_CONFIG` in `app-config.js`
- Check `NAV_CONFIG` `reqRole` in `header.html`
- `checkLoginStatus()` redirects on insufficient role

### IndexedDB version mismatch
- Bump `version` in `indexeddb.js`
- `onupgradeneeded` deletes all stores and recreates them
- Users will get a fresh sync on next login
