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

async function verifyAndFetchAppData(force = false) {
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

    if (!force) {
        try {
            const lastSync = await window.appDB.getLastSyncTime();
            if (lastSync && (Date.now() - parseInt(lastSync) < CONSTANTS.SYNC_INTERVAL)) return;
        } catch (error) {
            console.warn('[Data Engine] Failed to check last sync time:', error.message);
        }
    }

    let lastSyncTime = '';
    try {
        lastSyncTime = force ? '' : (await window.appDB.getLastSyncTime() || '');
    } catch (error) {
        console.warn('[Data Engine] Failed to get sync timestamp:', error.message);
    }

    console.log(`[Data Engine] Syncing... Delta Mode: ${!!lastSyncTime}, Force: ${force}`);
    showNotification('🔄 Connecting to Server...', 'info');

    try {
        const result = await callApi('/api/verifyAndFetchAppData', { lastSyncTime });

        if (result.status === 'success') {
            const incomingData = result.data || {};

            let syncErrors  = [];
            let successCount = 0;
            const totalSheets = Object.keys(incomingData).length;

            if (force || result.meta?.type === 'FULL') {
                for (const [sheetName, sheetData] of Object.entries(incomingData)) {
                    try {
                        await window.appDB.clearSheet(sheetName);
                        if (Object.keys(sheetData).length > 0) await window.appDB.putSheet(sheetName, sheetData);
                        successCount++;
                    } catch (error) {
                        syncErrors.push(`${sheetName}: ${error.message}`);
                    }
                }
            } else {
                for (const [sheetName, sheetData] of Object.entries(incomingData)) {
                    try {
                        if (Object.keys(sheetData).length === 0) continue;
                        await window.appDB.mergeSheet(sheetName, sheetData);
                        successCount++;
                    } catch (error) {
                        syncErrors.push(`${sheetName}: ${error.message}`);
                    }
                }
            }

            try {
                await window.appDB.setLastSyncTime(result.syncTimestamp);
            } catch (error) {
                syncErrors.push(`Timestamp update: ${error.message}`);
            }

            // Always load full data from IndexedDB so UI renders existing data even on empty delta
            const fullData = await getAppData();
            const eventType = force ? 'appDataRefreshed' : 'appDataLoaded';
            window.dispatchEvent(new CustomEvent(eventType, { detail: { data: fullData } }));

            if (syncErrors.length > 0) {
                showNotification(`⚠️ Sync completed with errors:\n${successCount}/${totalSheets} collections synced\n\nErrors:\n${syncErrors.join('\n')}`, 'error');
            } else if (successCount > 0) {
                showNotification(`✅ Data Synced Successfully (${result.meta?.type || 'DELTA'}) - ${successCount} collections updated`, 'success');
            } else {
                showNotification('ℹ️ No new data', 'info');
            }

            console.log('[Data Engine] Sync Complete.');
        } else {
            showNotification(`❌ Server Error: ${result.message || 'Unknown error occurred'}`, 'error');
        }
    } catch (error) {
        console.error('[Data Engine] Sync Error:', error);
        let errorMsg = '❌ Sync Failed: ';
        if (error.message.includes('Invalid Server Response')) {
            errorMsg += 'Server configuration issue - Check deployment settings';
        } else if (error.message.includes('Session expired')) {
            errorMsg += 'Session expired - Please login again';
        } else if (error.message.includes('Failed to fetch')) {
            errorMsg += 'Network connection failed - Check internet connection';
        } else {
            errorMsg += error.message || 'Unknown network error';
        }
        showNotification(errorMsg, 'error');
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
