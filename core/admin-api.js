// ============================================================================
// ADMIN-API.JS — Admin endpoint wrappers (no DOM, no cache)
// Uses its own fetch wrapper with cache:'no-store' — never uses IndexedDB.
// sudo_token is passed explicitly — stored in sessionStorage only.
// ============================================================================

const AdminAPI = (() => {

    async function _fetch(endpoint, payload = {}, method = 'POST') {
        const token = getSessionId();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const options = { method, headers, cache: 'no-store' };
        if (method !== 'GET') options.body = JSON.stringify(payload);
        const res = await fetch(`${CONSTANTS.OPERATIONS_URL}${endpoint}`, options);
        const json = await res.json();
        if (json.status === 'error') throw new Error(json.message);
        return json;
    }

    // --- Sudo / Auth ---

    async function initiateAdminAccess(username, password) {
        return _fetch('/api/initiateAdminAccess', { username, password });
    }

    async function verifyAdminAccess(username, otp) {
        return _fetch('/api/verifyAdminAccess?username=' + encodeURIComponent(username), { otp });
    }

    // --- Users ---

    async function fetchAllUsers(sudoToken) {
        return _fetch('/api/fetchAllUsers?sudo_token=' + encodeURIComponent(sudoToken), {}, 'GET');
    }

    async function initiateAddUser(payload) {
        return _fetch('/api/initiateAddUser', payload);
    }

    async function confirmAddUser(username, otp) {
        return _fetch('/api/confirmAddUser?username=' + encodeURIComponent(username), { otp });
    }

    async function updateUser(username, sudoToken, fields) {
        return _fetch('/api/adminUpdateUser', { username, sudo_token: sudoToken, fields }, 'PATCH');
    }

    async function deleteUser(username, sudoToken) {
        return _fetch('/api/adminDeleteUser', { username, sudo_token: sudoToken }, 'DELETE');
    }

    // --- Registrations ---

    async function fetchRegistrations() {
        return _fetch('/api/fetchRegistrations', {}, 'GET');
    }

    async function declineRegistration(recordId) {
        return _fetch('/api/declineRegistration', { record_id: recordId });
    }

    return {
        initiateAdminAccess,
        verifyAdminAccess,
        fetchAllUsers,
        initiateAddUser,
        confirmAddUser,
        updateUser,
        deleteUser,
        fetchRegistrations,
        declineRegistration,
    };
})();

window.AdminAPI = AdminAPI;
