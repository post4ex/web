// ============================================================================
// services-api.js — Services panel API wrappers  (§3)
// ============================================================================

const ServicesAPI = (() => {

    async function _get(path, params = {}) {
        const token = getSessionId();
        const qs = new URLSearchParams(params).toString();
        const url = `${CONSTANTS.OPERATIONS_URL}${path}${qs ? '?' + qs : ''}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store',
        });
        const json = await res.json();
        if (json.status === 'error') throw new Error(json.detail || json.message);
        return json;
    }

    async function _post(path, body = {}) {
        const token = getSessionId();
        const res = await fetch(`${CONSTANTS.OPERATIONS_URL}${path}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.status === 'error') throw new Error(json.detail || json.message);
        return json;
    }

    // Status
    const pingAll      = ()             => _get('/api/services/status');
    const ping         = (name)         => _get(`/api/services/ping/${name}`);

    // Generic log fetcher
    const getLogs      = (type, p = {}) => _get(`/api/services/logs/${type}`, p);

    // Specific log fetchers
    const getLogsApp   = (p = {})       => getLogs('app', p);
    const getLogsNotif = (p = {})       => getLogs('notifications', p);
    const getLogsTrack = (p = {})       => getLogs('tracking', p);
    const getLogsWA    = (p = {})       => getLogs('wa', p);
    const getLogsMail  = (p = {})       => getLogs('mail', p);
    const getShipments = (p = {})       => getLogs('tracking/shipments', p);
    const getMovements = (p = {})       => getLogs('tracking/movements', p);

    // HF container logs
    const getHFLogs    = (space, lines = 100) => _get(`/api/services/logs/hf/${space}`, { lines });

    // Render
    const getRenderLogs  = (limit = 100) => _get('/api/services/logs/render', { limit });
    const renderRestart  = ()             => _post('/api/services/render/restart');

    // WhatsApp
    const waStatus   = ()  => _get('/api/services/wa/status');
    const waLogout   = ()  => _post('/api/services/wa/logout');
    const waQR       = ()  => _get('/api/services/wa/qr');

    return {
        pingAll, ping, getLogs,
        getLogsApp, getLogsNotif, getLogsTrack, getLogsWA, getLogsMail,
        getShipments, getMovements,
        getHFLogs, getRenderLogs, renderRestart,
        waStatus, waLogout, waQR,
    };
})();

window.ServicesAPI = ServicesAPI;
