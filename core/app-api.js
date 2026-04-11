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
    const loginData = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.LOGIN) || '{}');
    const token     = loginData.sessionId || '';

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };
    if (method !== 'GET') options.body = JSON.stringify(payload);

    const res = await fetch(`${CONSTANTS.OPERATIONS_URL}${endpoint}`, options);

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

async function verifyAndFetchAppData() {
    const loginData = localStorage.getItem(CONSTANTS.KEYS.LOGIN);
    if (!loginData) return;

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

    showNotification('🔄 Connecting to Server...', 'info');

    try {
        const result = await callApi('/api/verifyAndFetchAppData', {});

        if (result.status === 'success') {
            const incomingData = result.data || {};
            let syncErrors  = [];
            let successCount = 0;

            for (const [sheetName, sheetData] of Object.entries(incomingData)) {
                try {
                    await window.appDB.clearSheet(sheetName);
                    if (Object.keys(sheetData).length > 0) await window.appDB.putSheet(sheetName, sheetData);
                    successCount++;
                } catch (error) {
                    syncErrors.push(`${sheetName}: ${error.message}`);
                }
            }

            const fullData = await getAppData();
            window.dispatchEvent(new CustomEvent('appDataLoaded',    { detail: { data: fullData } }));
            window.dispatchEvent(new CustomEvent('appDataRefreshed', { detail: { data: fullData } }));

            if (syncErrors.length > 0) {
                showNotification(`⚠️ Sync errors: ${syncErrors.join(', ')}`, 'error');
            } else if (successCount > 0) {
                showNotification(`✅ Data Synced (${successCount} collections)`, 'success');
            } else {
                showNotification('ℹ️ No data', 'info');
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

// --- SSE ---

let _sseAbort = null;

async function openSSE() {
    const loginData = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.LOGIN) || '{}');
    const token = loginData.sessionId || '';
    if (!token) return;

    if (_sseAbort) _sseAbort.abort();
    _sseAbort = new AbortController();

    try {
        const res = await fetch(`${CONSTANTS.OPERATIONS_URL}/api/events`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: _sseAbort.signal
        });

        if (!res.ok || !res.body) throw new Error('SSE connection failed');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop();

            for (const part of parts) {
                const line = part.trim();
                if (!line.startsWith('data:')) continue;
                try {
                    const payload = JSON.parse(line.slice(5).trim());
                    await _handleSSEMessage(payload);
                } catch (e) {
                    console.warn('[SSE] Parse error', e);
                }
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn('[SSE] Disconnected, reconnecting...', e.message);
    }

    // reconnect after delay + full sync to catch up
    setTimeout(async () => {
        await verifyAndFetchAppData();
        openSSE();
    }, CONSTANTS.SSE_RECONNECT_DELAY);
}

async function _handleSSEMessage(payload) {
    if (payload.type === 'heartbeat') {
        lastActivity = Date.now();
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
        const notif = { ...payload };
        delete notif.type;
        await window.appDB.mergeSheet('NOTIFICATIONS', { [notif.NOTIF_ID]: notif });
        renderNotificationItem(notif, true);
        return;
    }

    if (payload.type === 'system_status') {
        // server will return 503 on next request if DEAD — no action needed here
        return;
    }

    if (payload.type === 'delta') {
        const { collection, action, key, data } = payload;
        if (!window.appDB || !window.appDB.db) return;

        if (action === 'upsert') {
            await window.appDB.mergeSheet(collection, { [key]: data });
        } else if (action === 'delete') {
            await window.appDB.deleteRecord(collection, key);
        }

        const fullData = await getAppData();
        window.dispatchEvent(new CustomEvent('appDataRefreshed', { detail: { data: fullData } }));
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
        const result = {};
        for (const sheet of sheets) {
            try {
                result[sheet] = await window.appDB.getSheet(sheet);
            } catch (error) {
                console.warn(`Failed to load ${sheet}:`, error);
                result[sheet] = {};
            }
        }
        return result;
    } catch (error) {
        console.error('Failed to get app data:', error);
        return null;
    }
}
