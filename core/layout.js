// ============================================================================
// LAYOUT.JS — Dispatcher / Orchestrator
// ============================================================================
(function () {
    const s = document.createElement('script');
    s.src = 'core/app-refresh.js';
    document.head.appendChild(s);
})();

const _ALLOWED_COMPONENTS = ['header.html', 'footer.html'];

async function loadComponent(componentUrl, placeholderId) {
    try {
        const placeholder = document.getElementById(placeholderId);
        if (!placeholder) return;

        const isHeader = placeholderId === 'header-placeholder';
        placeholder.innerHTML = isHeader
            ? '<div class="animate-pulse bg-gray-200 h-14 w-full rounded"></div>'
            : '<div class="animate-pulse bg-gray-200 h-10 w-full rounded"></div>';
        placeholder.style.minHeight = isHeader ? '56px' : '26px';

        const safeComponent = _ALLOWED_COMPONENTS.find(c => c === componentUrl);
        if (!safeComponent) throw new Error(`Disallowed component: ${componentUrl}`);
        const response = await fetch(safeComponent, { cache: 'default' });
        if (!response.ok) throw new Error(`Failed to load ${componentUrl}`);

        const text = await response.text();
        const doc  = new DOMParser().parseFromString(text, 'text/html');

        Array.from(doc.querySelectorAll('script')).forEach(script => {
            const newScript = document.createElement('script');
            if (script.src) {
                newScript.src = script.src;
            } else {
                newScript.textContent = script.textContent;
            }
            document.head.appendChild(newScript);
            script.remove();
        });

        placeholder.innerHTML = '';
        while (doc.body.firstChild) {
            placeholder.appendChild(doc.body.firstChild);
        }
    } catch (error) {
        console.warn(`[Component Engine] Failed loading ${componentUrl}:`, error);
        const placeholder = document.getElementById(placeholderId);
        if (placeholder) {
            placeholder.innerHTML = `<div class="text-red-500 text-sm p-2">Failed to load ${componentUrl}</div>`;
        }
    }
}

const _ALLOWED_PAGES = ['tracking.html', 'services.html', 'dgr.html', 'awareness.html', 'Pincode.html', 'faqs.html',
                        'tracking', 'services', 'dgr', 'awareness', 'Pincode', 'faqs'];

async function loadDynamicContent(url, targetElementId) {
    const el = document.getElementById(targetElementId);
    if (!el) return;
    try {
        el.innerHTML = `<div class="text-center p-4 text-gray-500">Loading Content...</div>`;
        const safeUrl = _ALLOWED_PAGES.find(p => p === url);
        if (!safeUrl) throw new Error(`Disallowed page: ${url}`);
        const cacheBuster = safeUrl.includes('?') ? '&' : '?';
        const urlWithExt    = safeUrl;
        const urlWithoutExt = safeUrl.replace(/\.html$/, '');
        let res = await fetch(`${urlWithExt}${cacheBuster}v=${Date.now()}`);
        if (!res.ok) res = await fetch(`${urlWithoutExt}${cacheBuster}v=${Date.now()}`);
        if (!res.ok) throw new Error('Load failed');

        const txt = await res.text();
        const doc = new DOMParser().parseFromString(txt, 'text/html');
        const content = doc.querySelector('main .container');

        if (content) {
            el.innerHTML = content.innerHTML;
            setTimeout(() => {
                doc.body.querySelectorAll('script:not([src])').forEach(s => {
                    const ns = document.createElement('script');
                    ns.textContent = s.textContent;
                    document.body.appendChild(ns).remove();
                });
            }, 0);
        }
    } catch (e) {
        el.innerHTML = `<div class="text-red-500 text-center">Content unavailable.</div>`;
    }
}

const setActiveNavOnLoad = () => {
    const currentPath = window.location.pathname.split('/').pop();
    // derive pageId from filename without extension, lowercase
    const pageId = currentPath.replace(/\.html$/i, '').toLowerCase() || 'home';

    setTimeout(() => {
        document.querySelectorAll('a[id^="nav-"], a[id^="dropdown-"]').forEach(link => {
            const linkPage = (link.id || '').split('-')[1];
            link.classList.remove('bg-gray-600', 'font-bold', 'btn-active');
            if (linkPage === pageId) link.classList.add('btn-active');
        });
        document.querySelectorAll('#container-sidebar-nav a').forEach(link => {
            const href = (link.getAttribute('href') || '').split('/').pop();
            link.classList.toggle('btn-active', href === currentPath);
        });
    }, 150);
};

function initializeUI() {
    // Global dirty state — pages call markDirty() on edit, markClean() on save
    window._pageDirty = false;
    window.markDirty  = () => { window._pageDirty = true; };
    window.markClean  = () => { window._pageDirty = false; };
    document.addEventListener('input',  () => window.markDirty(), true);
    document.addEventListener('change', () => window.markDirty(), true);
    document.addEventListener('submit', () => window.markClean(), true);
    window.addEventListener('beforeunload', (e) => {
        if (window._pageDirty) { e.preventDefault(); e.returnValue = ''; }
    });


    const sb = document.getElementById('sidebar');
    const tg = document.getElementById('sidebar-toggle');
    const ov = document.getElementById('sidebar-overlay');
    if (sb && tg) {
        const toggleFn = () => { sb.classList.toggle('-translate-x-full'); ov.classList.toggle('hidden'); };
        tg.addEventListener('click', toggleFn);
        if (ov) ov.addEventListener('click', toggleFn);
    }

    initNotifications();

    document.querySelectorAll('[id*="logout"]').forEach(b => b.addEventListener('click', handleLogout));

    window.checkAppData = async () => {
        if (!window.appDB) { console.warn('IndexedDB not available'); return null; }
        const data = await getAppData();
        console.group('APP DATA INSPECTOR (IndexedDB)');
        Object.keys(data).forEach(sheet => console.log(`${sheet}: ${Object.keys(data[sheet] || {}).length} records`));
        console.groupEnd();
        return data;
    };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

// --- SSE state ---
window._lastEventTime  = null;
window._lastDeltaSync  = null;
window._sseConnected   = false;
window._sseGapStart    = null;
window._idbLastStamp   = 0;
window._idbHasData     = false;

let _sseWorker        = null;
let _sseConnectedOnce = false;
let _refreshTimer     = null;

function _scheduleRefresh() {
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(async () => {
        const fullData = await getAppData();
        window.dispatchEvent(new CustomEvent('appDataRefreshed', { detail: { data: fullData } }));
    }, 100);
}

async function _handleSSEMessage(payload) {
    window._lastEventTime = Date.now();

    if (payload.type === 'heartbeat') {
        window._lastHeartbeat = Date.now();
        window._sseConnected  = true;
        window._sseGapStart   = null;
        _sseConnectedOnce     = true;
        _sseBackoff           = 3000;
        console.log('[SSE] heartbeat ts:', payload.ts);
        return;
    }

    if (payload.type === 'logout') {
        handleLogout();
        return;
    }

    if (payload.type === 'resync') {
        console.log('[SSE] resync received, _syncInProgress:', window._syncInProgress, '_sseConnectedOnce:', _sseConnectedOnce);
        if (!window._syncInProgress)
            verifyAndFetchAppData(_sseConnectedOnce).catch(() => {});
        return;
    }

    if (payload.type === 'notif_count') {
        const badge = document.getElementById('notification-badge-global');
        if (badge && payload.unread > 0) {
            badge.innerText = payload.unread;
            badge.classList.remove('hidden');
        }
        return;
    }

    if (payload.type === 'notification') {
        if (!window.appDB || !window.appDB.db) return;
        const notif = { ...payload.data, IS_READ: false };
        await window.appDB.mergeSheet('NOTIFICATIONS', { [notif.NOTIF_ID]: notif });
        await loadNotificationsFromStorage();  // re-render full list instead of prepend
        return;
    }

    if (payload.type === 'system_status') return;

    if (payload.type === 'delta') {
        if (!window.appDB || !window.appDB.db) return;
        if (document.hidden) { console.log('[SSE] delta hidden tab — skip', payload.collection, payload.action, payload.key); return; }
        if (window._syncInProgress) { window._sseBuffer.push(payload); return; }
        console.log('[SSE] delta applying:', payload.collection, payload.action, payload.key);
        await _applyDelta(payload);
        _scheduleRefresh();
    }
}

// --- Direct SSE fallback (mobile / Safari / no SharedWorker) ---
let _sseDirect   = false;
let _sseAbort    = null;
let _sseBackoff  = 3000;
let _sseWatchdog = null;

function _resetWatchdog() {
    clearTimeout(_sseWatchdog);
    _sseWatchdog = setTimeout(() => {
        _sseAbort?.abort();
        _sseDirect = false;
        _openSSEDirect();
    }, 45000);
}

async function _openSSEDirect() {
    if (_sseDirect) { console.log('[SSE-direct] already running, skip'); return; }
    if (!isLoggedIn()) return;
    const token = getSessionId();
    if (!token) { handleLogout(); return; }
    console.log('[SSE-direct] opening connection...');
    _sseDirect = true;
    if (_sseAbort) _sseAbort.abort();
    _sseAbort = new AbortController();
    try {
        const res = await fetch(`${CONSTANTS.OPERATIONS_URL}/api/events`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal:  _sseAbort.signal,
            cache:   'no-store',
        });
        if (res.status === 401) { _sseDirect = false; handleLogout(); return; }
        if (!res.ok || !res.body) throw new Error('SSE failed');
        console.log('[SSE-direct] connected, reading stream...');
        _resetWatchdog();
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split('\n\n');
            buf = parts.pop();
            for (const part of parts) {
                const line = part.trim();
                if (!line.startsWith('data:')) continue;
                try { _handleSSEMessage(JSON.parse(line.slice(5).trim())); } catch (_) {}
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') { _sseDirect = false; return; }
        console.warn('[SSE-direct] error:', e.message);
    }
    clearTimeout(_sseWatchdog);
    _sseDirect  = false;
    const delay = _sseBackoff;
    _sseBackoff = Math.min(_sseBackoff * 2, 30000);
    console.log('[SSE-direct] reconnecting in', delay, 'ms');
    if (isLoggedIn()) setTimeout(_openSSEDirect, delay);
}

function openSSE() {
    if (!isLoggedIn()) return;
    if (typeof SharedWorker !== 'undefined') {
        console.log('[SSE] SharedWorker path');
        if (!_sseWorker) {
            try {
                _sseWorker = new SharedWorker('core/sse-worker.js');
                _sseWorker.port.start();
                _sseWorker.port.onmessage = (e) => { _handleSSEMessage(e.data); };
                _sseWorker.onerror = () => { console.warn('[SSE] SharedWorker error'); _sseWorker = null; };
                console.log('[SSE] SharedWorker created');
            } catch (e) {
                console.warn('[SSE] SharedWorker failed:', e.message);
                _sseWorker = null;
                return;
            }
        }
        _sseWorker.port.postMessage({ type: 'init', token: getSessionId(), url: CONSTANTS.OPERATIONS_URL });
        console.log('[SSE] init sent to worker, url:', CONSTANTS.OPERATIONS_URL);
        if (_sseConnectedOnce && !window._sseConnected)
            window._sseGapStart = window._sseGapStart || Date.now();
    } else {
        console.log('[SSE] direct path (no SharedWorker)');
        _openSSEDirect();
    }
}

// clear sync lock on page unload/navigation — prevents stuck state if sync was mid-flight
window.addEventListener('pagehide', () => {
    if (_syncLeader) {
        localStorage.removeItem('post4ex-sync-active');
        localStorage.removeItem('post4ex-sync-active-ts');
    }
});

// online / visibilitychange recovery
window.addEventListener('online', () => {
    if (!isLoggedIn()) return;
    const since = window._lastEventTime ?? window._idbLastStamp;
    console.log('[online] pullDeltaSince:', since, 'openSSE');
    if (since !== null && since !== undefined) pullDeltaSince(since).catch(() => {});
    openSSE();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !isLoggedIn()) return;
    const since = window._lastEventTime ?? window._idbLastStamp;
    // skip delta pull if SSE is live and recent (< 60s)
    const sseRecent = window._sseConnected && window._lastEventTime && (Date.now() - window._lastEventTime) < 60000;
    if (!sseRecent && since !== null && since !== undefined) pullDeltaSince(since).catch(() => {});
    console.log('[visibilitychange] visible, since:', since, '_sseConnected:', window._sseConnected, '_lastHeartbeat age:', Date.now() - (window._lastHeartbeat||0), 'ms');
    if (!_sseConnectedOnce || (Date.now() - (window._lastHeartbeat || 0)) > 45000) openSSE();
});

// 5-min safety net tick
setInterval(() => {
    if (document.hidden || !isLoggedIn()) return;
    if (window._sseConnected && window._lastEventTime && (Date.now() - window._lastEventTime) < 60000) return;
    const since = window._lastEventTime ?? window._idbLastStamp;
    console.log('[5min-tick] pullDeltaSince:', since);
    if (since !== null && since !== undefined) pullDeltaSince(since).catch(() => {});
}, 5 * 60 * 1000);

// multi-tab sync coordination (#10)
const _syncChannel = new BroadcastChannel('post4ex-sync');
let _syncLeader = false;
_syncChannel.addEventListener('message', async (e) => {
    if (e.data === 'sync-started') {
        localStorage.setItem('post4ex-sync-active', '1');
        localStorage.setItem('post4ex-sync-active-ts', Date.now().toString());
    }
    if (e.data === 'sync-complete') {
        localStorage.removeItem('post4ex-sync-active');
        localStorage.removeItem('post4ex-sync-active-ts');
        const fullData = await getAppData();
        window.dispatchEvent(new CustomEvent('appDataLoaded',    { detail: { data: fullData } }));
        window.dispatchEvent(new CustomEvent('appDataRefreshed', { detail: { data: fullData } }));
    }
});

function _isSyncActive() {
    const active = localStorage.getItem('post4ex-sync-active');
    if (!active) return false;
    // stale guard — if flag is older than 30s, treat as dead
    const ts = parseInt(localStorage.getItem('post4ex-sync-active-ts') || '0');
    if (Date.now() - ts > 10000) {
        localStorage.removeItem('post4ex-sync-active');
        localStorage.removeItem('post4ex-sync-active-ts');
        return false;
    }
    return true;
}

document.addEventListener('DOMContentLoaded', async () => {

    // Resolve API URL
    try {
        const res = await fetch('dev_url.json', { cache: 'no-store' });
        if (res.ok) {
            const { url } = await res.json();
            if (url) CONSTANTS.OPERATIONS_URL = url;
        }
    } catch (_) {}

    // Final safety — never leave placeholder
    if (!CONSTANTS.OPERATIONS_URL || CONSTANTS.OPERATIONS_URL === '__API_URL__')
        CONSTANTS.OPERATIONS_URL = window.location.origin;

    createNotificationModal();
    fetchClientIP();

    // Loading overlay — only for logged-in users (data pages)
    if (isLoggedIn()) {
        const _overlay = document.createElement('div');
        _overlay.id = 'sync-overlay';
        _overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(255,255,255,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;';
        _overlay.innerHTML = `
            <svg style="width:40px;height:40px;animation:spin 1s linear infinite;color:#9C2007" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle style="opacity:.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path style="opacity:.75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span style="font-size:14px;color:#6b7280;font-family:sans-serif;">Loading data…</span>
            <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
        document.body.appendChild(_overlay);

        const _removeOverlay = () => document.getElementById('sync-overlay')?.remove();
        window.addEventListener('syncComplete', _removeOverlay, { once: true });
        setTimeout(_removeOverlay, 30000);
    }

    // Offline indicator
    const _offlineBanner = document.createElement('div');
    _offlineBanner.id = 'offline-banner';
    _offlineBanner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;text-align:center;padding:6px;font-size:13px;font-family:sans-serif;display:none;';
    _offlineBanner.textContent = '⚠️ No internet connection';
    document.body.appendChild(_offlineBanner);
    window.addEventListener('offline', () => { _offlineBanner.style.display = 'block'; });
    window.addEventListener('online',  () => { _offlineBanner.style.display = 'none'; });

    await loadComponent('header.html', 'header-placeholder');
    await loadComponent('footer.html', 'footer-placeholder');
    window.dispatchEvent(new CustomEvent('footerLoaded'));

    checkLoginStatus();
    setActiveNavOnLoad();
    initializeUI();

    // Wait for IndexedDB to be ready (appDB is set immediately but db is null until init completes)
    await new Promise((resolve) => {
        if (window.appDB && window.appDB.db) return resolve();
        let resolved = false;
        const timeout = setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 5000);
        window.addEventListener('indexedDBReady', () => {
            if (!resolved) { resolved = true; clearTimeout(timeout); resolve(); }
        }, { once: true });
    });

    if (isLoggedIn()) {
        const existing  = await getAppData();
        const timeFilteredSheets = ['ORDERS', 'MULTIBOX', 'PRODUCTS', 'UPLOADS', 'ATTENDANCE', 'STAFF'];
        const hasData   = existing && timeFilteredSheets.some(s => Object.keys(existing[s] || {}).length > 0);
        window._idbHasData = hasData;
        console.log('[Layout] hasData:', hasData, '| sheets:', timeFilteredSheets.map(s => `${s}:${Object.keys(existing?.[s]||{}).length}`).join(' '));

        const timeFiltered = ['ORDERS','MULTIBOX','PRODUCTS','UPLOADS','ATTENDANCE','STAFF'];
        window._idbLastStamp = window.appDB ? await window.appDB.getLastStamp(timeFiltered).catch(() => 0) : 0;
        console.log('[Layout] _idbLastStamp:', window._idbLastStamp);

        if (!hasData && !_isSyncActive()) {
            console.log('[Layout] No data — running full verifyAndFetchAppData');
            _syncLeader = true;
            localStorage.setItem('post4ex-sync-active', '1');
            localStorage.setItem('post4ex-sync-active-ts', Date.now().toString());
            _syncChannel.postMessage('sync-started');
            await verifyAndFetchAppData();
            localStorage.removeItem('post4ex-sync-active');
            localStorage.removeItem('post4ex-sync-active-ts');
            _syncChannel.postMessage('sync-complete');
        } else if (!_isSyncActive()) {
            console.log('[Layout] Has data — firing events, pullDeltaSince:', window._idbLastStamp);
            const fullData = await getAppData();
            window.dispatchEvent(new CustomEvent('appDataLoaded',    { detail: { data: fullData } }));
            window.dispatchEvent(new CustomEvent('appDataRefreshed', { detail: { data: fullData } }));
            window.dispatchEvent(new CustomEvent('syncComplete'));  // drop overlay immediately — user already has data
            if (window._idbLastStamp !== null && window._idbLastStamp !== undefined)
                pullDeltaSince(window._idbLastStamp).catch(() => {});
            else if (typeof loadNotificationsFromStorage === 'function') loadNotificationsFromStorage();
            // full sync in background — merges on top, user already sees data
            verifyAndFetchAppData();
        } else {
            console.log('[Layout] Sync already active — skipping');
        }
        openSSE();
        initHeartbeat();
    }

    if (window.location.pathname.includes('main.html') || window.location.pathname.endsWith('/main') || window.location.pathname.endsWith('/')) {
        const tray = document.getElementById('services-tray');
        if (window.innerWidth >= 1024) {
            if (tray) tray.style.display = 'block';
            loadDynamicContent('services.html', 'services-content-area');
        } else {
            if (tray) tray.style.display = 'block';
            if (typeof window.loadMobileServicesSlideshow === 'function') window.loadMobileServicesSlideshow();
        }
    }
});
