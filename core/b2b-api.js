// ============================================================================
// B2B-API.JS — Clients (B2B) tile API wrappers
// Restore: ye file missing thi — admin-clients.js in functions ko call karta
// hai, isliye Clients tile ka OTP flow kabhi fire hi nahi hota tha.
// Uses its own fetch wrapper with cache:'no-store' — never uses IndexedDB.
// ============================================================================

async function _b2bFetch(endpoint, payload = {}, method = 'POST') {
    const token = getSessionId();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const options = { method, headers, cache: 'no-store' };
    if (method !== 'GET') options.body = JSON.stringify(payload);
    const res = await fetch(endpoint, options);
    let json = {};
    try { json = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new Error(json.detail || json.message || `Request failed (${res.status})`);
    if (json.status === 'error') throw new Error(json.message || 'Request failed');
    return json;
}

// ── OTP (new_client | update_client | save_rates | delete_client) ──────────

async function b2bSendOtp(code, action) {
    return _b2bFetch('/api/sendB2bOtp', { CODE: code, action });
}

async function b2bVerifyOtp(code, action, otp) {
    return _b2bFetch('/api/verifyB2bOtp', { CODE: code, action, otp });
}

// ── Client create / update ──────────────────────────────────────────────────
// data = form fields; recordId = existing record id on update (null = new)

async function b2bWrite(data, recordId = null, writeToken = '') {
    const explicit = {};
    ['GSTIN', 'PAN', 'AADHAAR', 'CREDIT_LIMIT', 'MAX_USERS_ALLOWED',
     'MAX_LOGINS_PER_USER', 'SUBSCRIPTION_TYPE'].forEach(f => {
        if (data[f] !== undefined && data[f] !== null && data[f] !== '') explicit[f] = data[f];
    });
    return _b2bFetch('/api/writeB2B', {
        CODE:        data.CODE,
        BRANCH:      data.BRANCH,
        STATUS:      data.STATUS || 'Active',
        RATE_LIST:   data.RATE_LIST || '',
        record_id:   recordId || null,
        extra:       data,
        write_token: writeToken,
        ...explicit,
    });
}

// ── Rate list save (save_rates OTP ke through) ─────────────────────────────

async function b2bWriteRateList(code, rates, writeToken) {
    return _b2bFetch('/api/writeRateList', { CODE: code, rates, write_token: writeToken });
}

// ── Client delete (delete_client OTP ke through) ───────────────────────────

async function b2bDelete(code, writeToken) {
    return _b2bFetch('/api/deleteB2B', { CODE: code, write_token: writeToken });
}
