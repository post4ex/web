// ============================================================================
// ADMIN.JS — Page init, sudo flow, tab switching, add-user modal orchestration
// sudo_token stored in sessionStorage only (cleared on tab close)
// ============================================================================

const AdminPage = (() => {

    const SUDO_KEY = 'admin_sudo_token';
    let _sudoUsername = '';
    let _addUserPrefill = null;

    // ── Sudo token helpers ────────────────────────────────────────────────────
    function getSudo()       { return sessionStorage.getItem(SUDO_KEY); }
    function setSudo(token)  { sessionStorage.setItem(SUDO_KEY, token); }
    function clearSudo()     { sessionStorage.removeItem(SUDO_KEY); }

    // ── Tab switching ─────────────────────────────────────────────────────────
    function _initTabs() {
        document.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('border-indigo-600','text-indigo-600'));
                document.querySelectorAll('[data-panel]').forEach(p => p.classList.add('hidden'));
                btn.classList.add('border-indigo-600','text-indigo-600');
                document.querySelector(`[data-panel="${tab}"]`)?.classList.remove('hidden');
                if (tab === 'registrations') AdminRegistrations.load();
            });
        });
    }

    // ── Sudo flow ─────────────────────────────────────────────────────────────
    function _showSudoModal() {
        document.getElementById('sudoModal')?.classList.remove('hidden');
    }

    function _initSudoForm() {
        document.getElementById('sudoForm')?.addEventListener('submit', async e => {
            e.preventDefault();
            const username = e.target.sudoUsername.value.trim();
            const password = e.target.sudoPassword.value;
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Sending OTP...';
            try {
                await AdminAPI.initiateAdminAccess(username, password);
                _sudoUsername = username;
                document.getElementById('sudoModal').classList.add('hidden');
                document.getElementById('sudoOtpModal').classList.remove('hidden');
                document.getElementById('sudoOtpHint').textContent = `OTP sent to ${username}`;
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            } finally { btn.disabled = false; btn.textContent = 'Send OTP'; }
        });

        document.getElementById('sudoOtpForm')?.addEventListener('submit', async e => {
            e.preventDefault();
            const otp = e.target.sudoOtp.value.trim();
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Verifying...';
            try {
                const res = await AdminAPI.verifyAdminAccess(_sudoUsername, otp);
                setSudo(res.sudo_token);
                document.getElementById('sudoOtpModal').classList.add('hidden');
                AdminUsers.init(res.sudo_token, res.data || []);
                showNotification('✅ Admin access granted', 'success');
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            } finally { btn.disabled = false; btn.textContent = 'Verify'; }
        });
    }

    // ── Add User modal ────────────────────────────────────────────────────────
    function openAddUserModal(prefill = {}) {
        _addUserPrefill = prefill;
        const f = document.getElementById('addUserForm');
        if (!f) return;
        ['USER','NAME','EMAIL','MOBILE','BRANCH','ROLE','PASS'].forEach(field => {
            const el = f.elements[field];
            if (el) el.value = prefill[field] || '';
        });
        document.getElementById('addUserModal').classList.remove('hidden');
    }

    function _initAddUserFlow() {
        document.getElementById('addUserBtn')?.addEventListener('click', () => openAddUserModal());

        document.getElementById('addUserForm')?.addEventListener('submit', async e => {
            e.preventDefault();
            const f = e.target;
            const payload = {
                USER:         f.USER.value.trim(),
                NAME:         f.NAME.value.trim(),
                EMAIL:        f.EMAIL.value.trim(),
                MOBILE:       f.MOBILE.value.trim(),
                BRANCH:       f.BRANCH.value.trim(),
                ROLE:         f.ROLE.value,
                PASS:         f.PASS.value,
                STATUS:       'ACTIVE',
                COL_FILTER:   '',
                FILTER_VALUE: '',
            };
            const btn = f.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Sending OTP...';
            try {
                await AdminAPI.initiateAddUser(payload);
                document.getElementById('addUserModal').classList.add('hidden');
                document.getElementById('addUserOtpModal').classList.remove('hidden');
                document.getElementById('addUserOtpHint').textContent = `OTP sent to admin for user: ${payload.USER}`;
                // store username for confirm step
                document.getElementById('addUserOtpModal').dataset.username = payload.USER;
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            } finally { btn.disabled = false; btn.textContent = 'Send OTP'; }
        });

        document.getElementById('addUserOtpForm')?.addEventListener('submit', async e => {
            e.preventDefault();
            const username = document.getElementById('addUserOtpModal').dataset.username;
            const otp = e.target.addUserOtp.value.trim();
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Confirming...';
            try {
                await AdminAPI.confirmAddUser(username, otp);
                document.getElementById('addUserOtpModal').classList.add('hidden');
                showNotification('✅ User added successfully', 'success');
                // Refresh user list
                const res = await AdminAPI.fetchAllUsers(getSudo());
                AdminUsers.init(getSudo(), res.data || []);
                // If came from registrations, remove that card
                if (_addUserPrefill?.id) AdminRegistrations.removeById(_addUserPrefill.id);
                _addUserPrefill = null;
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            } finally { btn.disabled = false; btn.textContent = 'Confirm'; }
        });
    }

    // ── Modal close buttons ───────────────────────────────────────────────────
    function _initCloseButtons() {
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById(btn.dataset.closeModal)?.classList.add('hidden');
            });
        });
    }

    // ── Search ────────────────────────────────────────────────────────────────
    function _initSearch() {
        document.getElementById('searchUsers')?.addEventListener('input', e => {
            AdminUsers.search(e.target.value);
        });
    }

    // ── Entry point ───────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        _initTabs();
        _initSudoForm();
        _initAddUserFlow();
        _initCloseButtons();
        _initSearch();

        // Show sudo modal on load (admin page always requires sudo)
        const existing = getSudo();
        if (existing) {
            // Already have token — fetch users directly
            AdminAPI.fetchAllUsers(existing)
                .then(res => AdminUsers.init(existing, res.data || []))
                .catch(() => { clearSudo(); _showSudoModal(); });
        } else {
            _showSudoModal();
        }
    });

    return { openAddUserModal, getSudo };
})();

window.AdminPage = AdminPage;
