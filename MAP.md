# POST4EX FRONTEND — COMPLETE MAP
# Version 3.0.0 | Vanilla JS + IndexedDB + SSE

# =============================================================================
# SCRIPT LOAD ORDER (every page)
# =============================================================================
# 1. indexeddb.js      → DB init, fires indexedDBReady event
# 2. core/app-config.js → CONSTANTS, ROLE_LEVELS, PAGE_CONFIG, theme
# 3. core/formatIST.js  → fmtDate(), fromIST() — date formatting
# 4. core/app-notify.js → renderNotificationItem(), loadNotificationsFromStorage(), showNotification()
# 5. core/app-api.js    → callApi(), verifyAndFetchAppData(), openSSE(), getAppData()
# 6. core/app-auth.js   → handleLogout(), checkLoginStatus(), initHeartbeat()
# 7. core/layout.js     → loadComponent(), initializeUI(), DOMContentLoaded entry point

# =============================================================================
# indexeddb.js
# =============================================================================
# class AppDatabase
#   dbName: 'WEBIndexedDB'
#   version: 5
#   sheetKeys: { ORDERS:REFERENCE, B2B:CODE, B2B2C:UID, RATES:UID,
#                STAFF:STAFF_CODE, ATTENDANCE:ATTENDANCE_ID, BRANCHES:BRANCH_CODE,
#                MODES:SHORT, CARRIERS:COMPANY_CODE, MULTIBOX:MB_UID,
#                PRODUCTS:PD_UID, UPLOADS:UPLOAD_UID, CALC_HISTORY:CALC_UID,
#                NOTIFICATIONS:NOTIF_ID }
#
#   init()                    → open/upgrade DB, create object stores
#   putSheet(name, data)      → bulk upsert {key: record} dict
#   getSheet(name)            → returns {key: record} dict
#   mergeSheet(name, delta)   → upsert individual records
#   clearSheet(name)          → wipe entire store
#   deleteRecord(name, key)   → delete single record
#   clearAll()                → wipe all stores + metadata
#   setMetadata/getMetadata   → key-value metadata store
#   getLastSyncTime/setLastSyncTime → sync timestamp helpers
#
# class IndexedDBManager
#   getAllStoreNames()         → list of store names (excludes _metadata)
#   getAll(storeName)         → array of all records
#   count(storeName)          → record count
#
# window.appDB = new AppDatabase()
# window.IndexedDBManager = new IndexedDBManager(appDB)
# fires: window.dispatchEvent(new CustomEvent('indexedDBReady'))

# =============================================================================
# core/app-config.js
# =============================================================================
# CONSTANTS (window.CONSTANTS):
#   APP_NAME, SUPPORT_EMAIL, COMPANY_NAME, COPYRIGHT_YEAR
#   APP_THEME: 'maroon'
#   THEMES: { maroon: {primary:#9C2007, ...}, blue: {primary:#1e3a8a, ...} }
#   OPERATIONS_URL: '__API_URL__'  → replaced at runtime from dev_url.json
#   SYNC_INTERVAL: 5min
#   PING_INTERVAL: 2min
#   IDLE_TIMEOUT: 2hr
#   ACTIVITY_THROTTLE: 30s
#   SSE_RECONNECT_DELAY: 3000ms
#   ALLOWED_DOMAINS: ['post4ex.github.io', 'huggingface.co', 'hf.space']
#   KEYS: { LOGIN:'loginData', IP:'clientIP', SESSION_ACTIVE:'SESSION_ACTIVE' }
#
# ROLE_LEVELS (window.ROLE_LEVELS):
#   MASTER:100, ADMIN:90, AUDITOR:70, ACCOUNTANT:60,
#   MANAGER:50, STAFF:10, CLIENT:1, GUEST:0
#
# PAGE_CONFIG: { page.html: minRole } — RBAC redirect on load
# DATA_SCHEMA: { label: collection } — for search/display
# DATA_INSTRUCTIONS: { collection: 'getAppData("X")' }
# DATE_FIELDS: list of timestamp field names
# window.setTheme(themeName) → apply CSS variables

# =============================================================================
# core/app-notify.js
# =============================================================================
# createNotificationModal()
#   → injects modal HTML into body (once)
#   → close on X, close button, backdrop click
#
# openNotificationModal(message, level, timestamp)
#   → shows modal with icon, title, content, time
#
# renderNotificationItem(notif, showToast)
#   → reads IS_READ boolean from notif
#   → reads ROLE_LEVELS from localStorage loginData to determine canDismiss
#   → CRITICAL: non-admin = no dismiss button, admin+ = dismiss allowed
#   → envelope button (mark read) — only if !IS_READ
#   → X button (dismiss) — only if canDismiss
#   → click content → openNotificationModal + callApi /api/notifread
#   → prepends to #notification-list-global
#   → showToast=true → increments badge
#
# loadNotificationsFromStorage()
#   → reads from IndexedDB NOTIFICATIONS store
#   → returns early if DB not ready (no blank flash)
#   → only wipes list when actual data confirmed
#   → badge = unread count (IS_READ === false)
#
# _updateBadge()
#   → counts list items, updates badge, shows "No new notifications" if empty
#
# showNotification(message, type, duration=3000)
#   → UI toast ONLY — never touches bell or IndexedDB
#   → inline styles (not Tailwind — dynamic elements not scanned)
#   → position: fixed, top:72px, right:16px, z-index:99999
#   → auto-dismisses after duration ms with fade
#   → types: success(green), error(red), warning(yellow), info(blue)

# =============================================================================
# core/app-api.js
# =============================================================================
# fetchClientIP()
#   → ipify.org with 2s timeout → sessionStorage KEYS.IP
#
# callApi(endpoint, payload, method)
#   → reads JWT from localStorage KEYS.LOGIN
#   → validates endpoint.startsWith('/api/')
#   → fetch CONSTANTS.OPERATIONS_URL + endpoint
#   → throws on non-JSON response or status:error
#   → auto-logout on 'Session expired'
#
# verifyAndFetchAppData()
#   → POST /api/verifyAndFetchAppData
#   → clearSheet + putSheet for each collection
#   → fires appDataLoaded + appDataRefreshed events
#   → then GET /api/fetchNotifications → putSheet NOTIFICATIONS → loadNotificationsFromStorage
#   → showNotification on error only (silent on success)
#
# openSSE()
#   → fetch /api/events with Bearer token
#   → reads stream, parses data: lines
#   → on disconnect: verifyAndFetchAppData() + reconnect after SSE_RECONNECT_DELAY
#
# _handleSSEMessage(payload):
#   heartbeat    → reset lastActivity
#   notif_count  → update badge
#   notification → mergeSheet NOTIFICATIONS with IS_READ:false + renderNotificationItem
#   system_status → no-op (503 on next request handles it)
#   delta upsert → mergeSheet + fire appDataRefreshed
#   delta delete → deleteRecord + fire appDataRefreshed
#
# getAppData(sheetName)
#   → reads from IndexedDB
#   → no sheetName → returns all 12 data collections (not NOTIFICATIONS)

# =============================================================================
# core/app-auth.js
# =============================================================================
# lastActivity — module-level timestamp, reset on user events
#
# initHeartbeat()
#   → listens: mousemove, keydown, click, scroll → update lastActivity
#   → setInterval every PING_INTERVAL:
#     → if idle > IDLE_TIMEOUT → handleLogout()
#
# handleLogout()
#   → callApi /api/logout (fire-and-forget)
#   → localStorage.removeItem KEYS.LOGIN
#   → sessionStorage.clear()
#   → appDB.clearAll() — wipes all IndexedDB stores
#   → redirect to login.html
#
# checkLoginStatus()
#   → reads loginData from localStorage
#   → isLoggedIn = !!allData.ROLE
#   → show/hide header elements based on login state
#   → populate profile dropdown (desktop + mobile)
#   → session token shown as **** with Show/Hide toggle
#   → PAGE_CONFIG RBAC: redirect if role insufficient

# =============================================================================
# core/layout.js
# =============================================================================
# _ALLOWED_COMPONENTS = ['header.html', 'footer.html']
# _ALLOWED_PAGES = ['tracking.html', 'services.html']
#
# loadComponent(componentUrl, placeholderId)
#   → validates against _ALLOWED_COMPONENTS
#   → fetch + DOMParser + inject scripts to head
#   → replace placeholder content
#
# loadDynamicContent(url, targetElementId)
#   → validates against _ALLOWED_PAGES
#   → fetch + extract main .container content
#
# setActiveNavOnLoad()
#   → highlights current page nav link
#
# initializeUI()
#   → menuButton, profile-button dropdowns
#   → sidebar toggle + overlay
#   → setupNotifActions():
#     → #notif-mark-all-read → callApi /api/notifread all + mergeSheet IS_READ:true
#     → #notif-clear-all → callApi /api/notifclear all + deleteRecord each
#   → _loadNotifs() → loadNotificationsFromStorage (gated: logged in only)
#   → logout buttons → handleLogout
#
# DOMContentLoaded entry point:
#   1. fetch dev_url.json → set CONSTANTS.OPERATIONS_URL
#   2. createNotificationModal()
#   3. fetchClientIP()
#   4. loadComponent header + footer
#   5. fire footerLoaded event
#   6. checkLoginStatus()
#   7. setActiveNavOnLoad()
#   8. initializeUI()
#   9. wait for indexedDBReady (5s timeout)
#   10. if logged in:
#       → hasData? → loadNotificationsFromStorage : verifyAndFetchAppData
#       → openSSE()
#       → initHeartbeat()
#   11. main.html: loadDynamicContent tracking + services

# =============================================================================
# header.html
# =============================================================================
# Sticky header, z-30, brand color #9C2007
# Left: sidebar toggle (hidden until login) + logo
# Center: desktop nav (generated by renderNavItems)
# Right: notification bell + profile dropdown + mobile menu button
#
# Notification bell (#notification-container-global):
#   → hidden until login
#   → badge (#notification-badge-global) — unread count
#   → dropdown (#notification-dropdown):
#     → "✓ All read" button (#notif-mark-all-read)
#     → "🗑 Clear all" button (#notif-clear-all)
#     → list (#notification-list-global)
#
# NAV_CONFIG: public[], private[], sidebar[]
# renderNavItems() → desktop + mobile containers
# renderSidebar() → sidebar nav with submenus
# toggleSubmenu() → expand/collapse sidebar items
# getUserLevel() → reads role from localStorage

# =============================================================================
# IndexedDB STORES (version 5)
# =============================================================================
# ORDERS        key: REFERENCE
# B2B           key: CODE
# B2B2C         key: UID
# RATES         key: UID
# STAFF         key: STAFF_CODE
# ATTENDANCE    key: ATTENDANCE_ID
# BRANCHES      key: BRANCH_CODE
# MODES         key: SHORT
# CARRIERS      key: COMPANY_CODE
# MULTIBOX      key: MB_UID
# PRODUCTS      key: PD_UID
# UPLOADS       key: UPLOAD_UID
# CALC_HISTORY  key: CALC_UID
# NOTIFICATIONS key: NOTIF_ID  (IS_READ boolean, not in verifyAndFetchAppData)
# _metadata     key: key       (lastSyncTime etc.)

# =============================================================================
# NOTIFICATION FLOW (frontend)
# =============================================================================
# On login / page load:
#   verifyAndFetchAppData()
#     → /api/fetchNotifications → putSheet NOTIFICATIONS (IS_READ per user)
#     → loadNotificationsFromStorage() → render bell
#
# On SSE notification event:
#   → mergeSheet NOTIFICATIONS {IS_READ: false}
#   → renderNotificationItem(notif, true) → prepend + badge++
#
# On SSE notif_count:
#   → update badge only (no render)
#
# Mark read (envelope button or click):
#   → callApi /api/notifread
#   → mergeSheet {IS_READ: true}
#   → remove envelope button + unread dot
#
# Dismiss (X button):
#   → callApi /api/notifclear
#   → deleteRecord from IndexedDB
#   → remove item from list
#
# Mark all read:
#   → callApi /api/notifread {all:true}
#   → mergeSheet all {IS_READ: true}
#   → loadNotificationsFromStorage()
#
# Clear all:
#   → callApi /api/notifclear {all:true}
#   → deleteRecord each non-CRITICAL
#   → loadNotificationsFromStorage()
