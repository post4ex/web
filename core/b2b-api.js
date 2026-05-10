// core/b2b-api.js
// B2B API wrappers

const B2B_CORE_FIELDS = ['CODE', 'BRANCH', 'STATUS', 'RATE_LIST'];

async function b2bSendOtp(code, action) {
    return await callApi('/api/sendB2bOtp', { CODE: code, action }, 'POST');
}

async function b2bVerifyOtp(code, action, otp) {
    return await callApi('/api/verifyB2bOtp', { CODE: code, action, otp }, 'POST');
}

async function b2bWrite(data, recordId, writeToken) {
    const core  = {};
    const extra = {};
    Object.entries(data).forEach(([k, v]) => {
        if (B2B_CORE_FIELDS.includes(k)) core[k] = v;
        else extra[k] = v;
    });
    return await callApi('/api/writeB2B', {
        ...core,
        extra,
        record_id:   recordId || null,
        write_token: writeToken,
    }, 'POST');
}

async function b2bSendDeleteOtp(code) {
    return await b2bSendOtp(code, 'delete_client');
}

async function b2bDelete(code, writeToken) {
    return await callApi('/api/deleteB2B', { CODE: code, write_token: writeToken }, 'POST');
}

async function b2bWriteRateList(code, rates, writeToken) {
    return await callApi('/api/writeRateList', { CODE: code, rates, write_token: writeToken }, 'POST');
}

async function b2bDeleteRateList(code, uids = []) {
    return await callApi('/api/deleteRateList', { CODE: code, uids }, 'DELETE');
}
