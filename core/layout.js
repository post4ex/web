// ============================================================================
// LAYOUT.JS — Dispatcher / Orchestrator
// ============================================================================

const _ALLOWED_COMPONENTS = ['header.html', 'footer.html'];

async function loadComponent(componentUrl, placeholderId) {
    try {
        const placeholder = document.getElementById(placeholderId);
        if (!placeholder) return;

        const isHeader = placeholderId === 'header-placeholder';
        placeholder.innerHTML = isHeader
            ? '<div class="animate-pulse bg-gray-200 h-14 w-full rounded"></div>'
            : '<div class="animate-pulse bg-gray-200 h-10 w-full rounded"></div>';
        placeholder.style.minHeight = isHeader ? '56px' : '36px';

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

const _ALLOWED_PAGES = ['tracking.html', 'services.html'];

async function loadDynamicContent(url, targetElementId) {
    const el = document.getElementById(targetElementId);
    if (!el) return;
    try {
        el.innerHTML = `<div class="text-center p-4 text-gray-500">Loading Content...</div>`;
        const safeUrl = _ALLOWED_PAGES.find(p => p === url);
        if (!safeUrl) throw new Error(`Disallowed page: ${url}`);
        const cacheBuster = safeUrl.includes('?') ? '&' : '?';
        const res = await fetch(`${safeUrl}${cacheBuster}v=${Date.now()}`);
        if (!res.ok) throw new Error('Load failed');

        const txt = await res.text();
        const doc = new DOMParser().parseFromString(txt, 'text/html');
        const content = doc.querySelector('main .container');

        if (content) {
            el.innerHTML = content.innerHTML;
            content.querySelectorAll('script').forEach(s => {
                const ns = document.createElement('script');
                ns.textContent = s.textContent;
                document.body.appendChild(ns).remove();
            });
        }
    } catch (e) {
        el.innerHTML = `<div class="text-red-500 text-center">Content unavailable.</div>`;
    }
}

const setActiveNavOnLoad = () => {
    const path = window.location.pathname;
    let pageId = 'home';
    if      (path.includes('dashboard.html'))  pageId = 'home';
    else if (path.includes('Pincode.html'))    pageId = 'pincode';
    else if (path.includes('complaint.html'))  pageId = 'complaint';
    else if (path.includes('BookOrder.html'))  pageId = 'bookorder';
    else if (path.includes('tracking.html'))   pageId = 'tracking';
    else if (path.includes('Calculator.html')) pageId = 'calculator';
    else if (path.includes('ticket.html'))     pageId = 'ticket';
    else if (path.includes('task.html'))       pageId = 'task';
    else if (path.includes('wallet.html'))     pageId = 'wallet';
    else if (path.includes('search.html'))     pageId = 'search';

    setTimeout(() => {
        document.querySelectorAll('a[id^="nav-"], a[id^="dropdown-"]').forEach(link => {
            const linkPage = (link.id || '').split('-')[1];
            link.classList.remove('bg-gray-600', 'font-bold');
            if (!link.id.includes('search')) {
                link.classList.add('text-white');
                link.style.backgroundColor = '#9C2007';
            }
            if (linkPage === pageId) {
                link.style.backgroundColor = '';
                link.classList.remove('text-white');
                link.classList.add('bg-gray-600', 'font-bold');
            }
        });
    }, 150);
};

function initializeUI() {
    ['menuButton', 'profile-button'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            const menu = document.getElementById(id === 'menuButton' ? 'dropdownMenu' : 'profile-dropdown');
            btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && !btn.contains(e.target)) menu.classList.add('hidden');
            });
        }
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

    createNotificationModal();
    fetchClientIP();

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
            if (window._idbLastStamp !== null && window._idbLastStamp !== undefined)
                pullDeltaSince(window._idbLastStamp).catch(() => {});
            else if (typeof loadNotificationsFromStorage === 'function') loadNotificationsFromStorage();
            // full sync in background — merges on top, user already sees data
            verifyAndFetchAppData().catch(() => {});
        } else {
            console.log('[Layout] Sync already active — skipping');
        }
        openSSE();
        initHeartbeat();
    }

    if (window.location.pathname.includes('main.html') || window.location.pathname.endsWith('/')) {
        loadDynamicContent('tracking.html', 'tracking-content-area');
        if (window.innerWidth >= 1024) {
            loadDynamicContent('services.html', 'services-content-area');
        } else {
            if (typeof window.loadMobileServicesSlideshow === 'function') window.loadMobileServicesSlideshow();
        }

        const trackingArea = document.getElementById('tracking-content-area');
        const servicesArea = document.getElementById('services-content-area');
        if (trackingArea && servicesArea) {
            const observer = new MutationObserver(() => {
                const resultsContainer = trackingArea.querySelector('#results-container');
                const searchButton     = trackingArea.querySelector('#tracking-search-button');
                if (resultsContainer && resultsContainer.innerHTML.trim() !== '' && !resultsContainer.classList.contains('hidden')) {
                    servicesArea.classList.add('hidden');
                }
                if (searchButton && !searchButton.hasAttribute('data-listener-added')) {
                    searchButton.addEventListener('click', () => { if (servicesArea) servicesArea.classList.remove('hidden'); });
                    searchButton.setAttribute('data-listener-added', 'true');
                }
            });
            observer.observe(trackingArea, { childList: true, subtree: true });
        }
    }
});
