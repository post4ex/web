// core/b2b-api.js
// B2B API wrappers

const B2B_CORE_FIELDS = ['CODE', 'BRANCH', 'STATUS', 'RATE_LIST'];

async function b2bWrite(data, recordId) {
    const core  = {};
    const extra = {};
    Object.entries(data).forEach(([k, v]) => {
        if (B2B_CORE_FIELDS.includes(k)) core[k] = v;
        else extra[k] = v;
    });
    return await callApi('/api/writeB2B', {
        ...core,
        extra,
        record_id: recordId || null,
    }, 'POST');
}

async function b2bSendDeleteOtp(code) {
    return await callApi('/api/sendDeleteOtp', { CODE: code }, 'POST');
}

async function b2bDelete(code, otp) {
    return await callApi('/api/deleteB2B', { CODE: code, otp }, 'POST');
}

async function b2bWriteRateList(code, rates) {
    return await callApi('/api/writeRateList', { CODE: code, rates }, 'POST');
}

async function b2bDeleteRateList(code, uids = []) {
    return await callApi('/api/deleteRateList', { CODE: code, uids }, 'DELETE');
}
