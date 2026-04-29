// ============================================================================
// APP-API.JS — Network, Data Engine & Date Utilities
// ============================================================================

async function fetchClientIP() {
    if (sessionStorage.getItem(CONSTANTS.KEYS.IP)) return;
    try {
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 2000);
        const res        = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timeoutId);
        const json = await res.json();
        sessionStorage.setItem(CONSTANTS.KEYS.IP, json.ip);
    } catch (e) {
        sessionStorage.setItem(CONSTANTS.KEYS.IP, '0.0.0.0');
    }
}

const MUTATING_ENDPOINTS = [
    // kept for reference only — SSE broadcasts replace post-write sync
    '/api/bookOrder', '/api/updateOrder',
    '/api/writeB2B', '/api/deleteB2B', '/api/writeRateList', '/api/deleteRateList',
    '/api/writeB2B2C', '/api/updateB2B2C', '/api/deleteB2B2C',
    '/api/writeStaff', '/api/deleteStaff',
    '/api/writeBranch', '/api/deleteBranch',
    '/api/writeCarrier', '/api/deleteCarrier',
    '/api/writeMode', '/api/deleteMode',
    '/api/uploadOrders', '/api/editUpload', '/api/deleteOrder',
];

async function callApi(endpoint, payload = {}, method = 'POST') {
    const token = getSessionId();

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };
    if (method !== 'GET') options.body = JSON.stringify(payload);

    const base = CONSTANTS.OPERATIONS_URL;
    if (!endpoint.startsWith('/api/')) throw new Error('Invalid endpoint');
    const safeEndpoint = endpoint;
    const res = await fetch(`${base}${safeEndpoint}`, options);

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('[API] Expected JSON but got:', text.substring(0, 150));
        throw new Error('Invalid Server Response (Not JSON)');
    }

    const json = await res.json();
    if (json.status === 'error') {
        if (json.message.includes('Session expired')) {
            console.warn('[API] Session Expired. Logging out.');
            handleLogout();
        }
        throw new Error(json.message);
    }

    return json;
}

// --- DATE UTILITIES ---
// Formatting is handled by core/formatIST.js — fmtDate() and fromIST() are global.

// --- DATA ENGINE ---

window._syncInProgress = false;
window._sseBuffer      = [];

async function _applyDelta({ collection, action, key, data }) {
    if (action === 'upsert') await window.appDB.mergeSheet(collection, { [key]: data });
    else if (action === 'delete') await window.appDB.deleteRecord(collection, key);
}
window._applyDelta = _applyDelta;

async function pullDeltaSince(since_ms) {
    if (since_ms === null || since_ms === undefined || !isLoggedIn() || !window.appDB || !window.appDB.db) {
        console.log('[pullDeltaSince] skipped — since_ms:', since_ms, 'loggedIn:', isLoggedIn());
        return;
    }
    // since_ms=0 — pass as-is, backend handles fallback to sync_start_ms
    const effective = since_ms;
    console.log('[pullDeltaSince] calling with since_ms:', effective);
    try {
        const result = await callApi('/api/verifyAndFetchAppData', { since_ms: effective });
        if (result.status !== 'success') return;
        const incomingData = result.data || {};
        console.log('[pullDeltaSince] response meta:', result.meta, '| collections:', Object.entries(incomingData).map(([k,v]) => `${k}:${Object.keys(v).length}`).join(' '));
        for (const [sheetName, sheetData] of Object.entries(incomingData)) {
            if (Object.keys(sheetData).length > 0)
                await window.appDB.mergeSheet(sheetName, sheetData);
        }
        window._lastDeltaSync = Date.now();
        _scheduleRefresh();
    } catch (e) { console.warn('[pullDeltaSince] error:', e.message); }
}

async function verifyAndFetchAppData(clearAll = false) {
    console.log('[verifyAndFetchAppData] called, clearAll:', clearAll);
    if (!isLoggedIn()) return;

    if (!window.appDB) {
        console.warn('[Data Engine] IndexedDB not available');
        showNotification('⚠️ Using localStorage fallback - Limited offline storage', 'info');
        return;
    }

    if (!window.appDB.db) {
        try {
            await window.appDB.init();
        } catch (error) {
            showNotification(`⚠️ Failed to initialize database: ${error.message}`, 'error');
            return;
        }
    }

    try {
        const result = await callApi('/api/verifyAndFetchAppData', {});

        if (result.status === 'success') {
            const incomingData = result.data || {};
            const noTimeFilter = new Set(CONSTANTS.SYNC_NO_TIME_FILTER || []);
            let syncErrors  = [];
            let successCount = 0;

            window._syncInProgress = true;
            try {
                for (const [sheetName, sheetData] of Object.entries(incomingData)) {
                    try {
                        if (clearAll || noTimeFilter.has(sheetName)) {
                            await window.appDB.clearSheet(sheetName);
                        }
                        if (Object.keys(sheetData).length > 0) await window.appDB.putSheet(sheetName, sheetData);
                        successCount++;
                    } catch (error) {
                        syncErrors.push(`${sheetName}: ${error.message}`);
                    }
                }
            } finally {
                window._syncInProgress = false;
                for (const delta of window._sseBuffer) { await _applyDelta(delta); }
                window._sseBuffer = [];
            }

            // store sync window start for reference
            if (result.meta?.sync_from_ms && window.appDB)
                await window.appDB.setMetadata('syncFromMs', result.meta.sync_from_ms).catch(() => {});
            await window.appDB.setMetadata('lastSyncTime', Date.now()).catch(() => {});

            const fullData = await getAppData();
            window.dispatchEvent(new CustomEvent('appDataLoaded', { detail: { data: fullData } }));
            _scheduleRefresh();  // appDataRefreshed fires after appDataLoaded

            // fetch notifications into IndexedDB
            try {
                const notifResult = await callApi('/api/fetchNotifications', {}, 'GET');
                if (notifResult.status === 'success' && window.appDB) {
                    if (Object.keys(notifResult.data).length > 0)
                        await window.appDB.putSheet('NOTIFICATIONS', notifResult.data);
                    if (typeof loadNotificationsFromStorage === 'function')
                        await loadNotificationsFromStorage();
                }
            } catch (_) {}

            if (syncErrors.length > 0) {
                showNotification(`⚠️ Sync errors: ${syncErrors.join(', ')}`, 'error');
            } else {
                showNotification(`✅ Synced`, 'success', 1500);
            }

        } else {
            showNotification(`❌ Server Error: ${result.message || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('[Data Engine] Sync Error:', error);
        let errorMsg = '❌ Sync Failed: ';
        if (error.message.includes('Invalid Server Response')) errorMsg += 'Server configuration issue';
        else if (error.message.includes('Session expired'))    errorMsg += 'Session expired - Please login again';
        else if (error.message.includes('Failed to fetch'))    errorMsg += 'Network connection failed';
        else errorMsg += error.message || 'Unknown error';
        showNotification(errorMsg, 'error');
    }
}

// fetchFile — fetch a private /api/file/... URL with auth and return a blob URL
// Use for <img src> and open-in-tab for private uploaded files
window.fetchFileUrl = async function (filePath) {
    const base  = CONSTANTS.OPERATIONS_URL;
    const token = getSessionId();
    const url   = filePath.startsWith('http') ? filePath : `${base}${filePath}`;
    const res   = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) throw new Error(`File fetch failed: ${res.status}`);
    const blob  = await res.blob();
    return URL.createObjectURL(blob);
};

// deleteUploadRecord — shared handler for upload delete buttons on any page
// Requires MANAGER role (enforced server-side; button hidden client-side for lower roles)
window.deleteUploadRecord = async function (uploadUid, btnEl) {
    if (!confirm('Delete this upload? This will permanently remove the file.')) return;
    if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.4'; }
    try {
        await callApi(`/api/upload/${uploadUid}`, {}, 'DELETE');
        showNotification('\u2705 Upload deleted', 'success');
        const row = btnEl?.closest('tr') || btnEl?.closest('.p-3');
        if (row) row.remove();
    } catch (err) {
        showNotification(`\u274c Delete failed: ${err.message}`, 'error');
        if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = ''; }
    }
};

// trackShipment — fetch live tracking data for a shipment
// Returns the unified tracking object or throws on error
window.trackShipment = async function (carrier, awb) {
    const base  = CONSTANTS.OPERATIONS_URL;
    const token = getSessionId();
    const res   = await fetch(`${base}/api/track?carrier=${encodeURIComponent(carrier)}&awb=${encodeURIComponent(awb)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok || json.status === 'error') throw new Error(json.message || json.detail || 'Tracking failed');
    return json.data;
};

async function fetchBusinessYearData(fyYear = null) {
    if (!window.appDB || !window.appDB.db) return;
    try {
        const payload = fyYear !== null ? { fy_year: fyYear } : {};
        const result  = await callApi('/api/fetchBusinessYear', payload);

        if (result.status === 'already_synced' || result.status === 'error') {
            showNotification('ℹ️ Data already synced for this period', 'info');
            return;
        }

        const incomingData = result.data || {};
        for (const [sheetName, sheetData] of Object.entries(incomingData)) {
            if (Object.keys(sheetData).length > 0)
                await window.appDB.putSheet(sheetName, sheetData);
        }

        // update sync boundary to include business year data
        if (result.from_ms && window.appDB)
            await window.appDB.setMetadata('syncFromMs', result.from_ms).catch(() => {});

        const fullData = await getAppData();
        window.dispatchEvent(new CustomEvent('appDataRefreshed', { detail: { data: fullData } }));
        showNotification(`✅ ${result.fy_label} loaded`, 'success', 2000);
    } catch (error) {
        showNotification(`❌ Failed to load business year: ${error.message}`, 'error');
    }
}

async function getAppData(sheetName = null) {
    if (!window.appDB || !window.appDB.db) {
        console.warn('IndexedDB not available');
        return null;
    }

    try {
        if (sheetName) return await window.appDB.getSheet(sheetName);

        const sheets = ['ORDERS', 'B2B', 'B2B2C', 'RATES', 'STAFF', 'ATTENDANCE', 'BRANCHES', 'MODES', 'CARRIERS', 'MULTIBOX', 'PRODUCTS', 'UPLOADS'];
        const result  = {};
        const results = await Promise.all(sheets.map(s => window.appDB.getSheet(s).catch(() => ({}))));
        sheets.forEach((s, i) => result[s] = results[i]);
        return result;
    } catch (error) {
        console.error('Failed to get app data:', error);
        return null;
    }
}
