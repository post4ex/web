// ============================================================================
// ADMIN-REGISTRATIONS.JS — Registrations list, approve, decline
// ============================================================================

const AdminRegistrations = (() => {

    let _regs = [];

    async function load() {
        const msg = document.getElementById('reg-status-msg');
        try {
            if (msg) msg.textContent = 'Loading...';
            const res = await AdminAPI.fetchRegistrations();
            _regs = res.data || [];
            _render();
        } catch (err) {
            if (msg) msg.textContent = 'Failed to load.';
            showNotification('❌ ' + err.message, 'error');
        }
    }

    function _render() {
        const container = document.getElementById('regList');
        const msg = document.getElementById('reg-status-msg');
        if (!container) return;
        if (!_regs.length) {
            container.innerHTML = '';
            if (msg) msg.textContent = 'No pending registrations.';
            return;
        }
        if (msg) msg.textContent = '';
        container.innerHTML = _regs.map(r => `
            <div class="p-4 rounded-lg border border-gray-200 bg-white space-y-1" data-id="${r.id}">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-semibold text-gray-800 text-sm">${r.NAME || r.USER || '—'}</p>
                        <p class="text-xs text-gray-500">${r.EMAIL || ''} ${r.MOBILE ? '· ' + r.MOBILE : ''}</p>
                        ${r.BRANCH ? `<p class="text-xs text-gray-400">Branch: ${r.BRANCH}</p>` : ''}
                        <p class="text-xs text-gray-400">${r.created ? new Date(r.created).toLocaleDateString() : ''}</p>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button class="approve-btn px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">Approve</button>
                        <button class="decline-btn px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">Decline</button>
                    </div>
                </div>
            </div>`).join('');

        container.querySelectorAll('[data-id]').forEach(card => {
            const id = card.dataset.id;
            const reg = _regs.find(r => r.id === id);

            card.querySelector('.approve-btn').addEventListener('click', () => {
                // Pre-fill add-user modal and open it
                window.AdminPage.openAddUserModal({
                    USER:   reg.USER  || reg.EMAIL?.split('@')[0] || '',
                    NAME:   reg.NAME  || '',
                    EMAIL:  reg.EMAIL || '',
                    MOBILE: reg.MOBILE || '',
                    BRANCH: reg.BRANCH || '',
                    ROLE:   'CLIENT',
                });
            });

            card.querySelector('.decline-btn').addEventListener('click', async () => {
                if (!confirm(`Decline registration for "${reg.NAME || reg.EMAIL}"?`)) return;
                try {
                    await AdminAPI.declineRegistration(id);
                    _regs = _regs.filter(r => r.id !== id);
                    _render();
                    showNotification('✅ Registration declined', 'success');
                } catch (err) { showNotification('❌ ' + err.message, 'error'); }
            });
        });
    }

    // Remove a registration from list after approval
    function removeById(id) {
        _regs = _regs.filter(r => r.id !== id);
        _render();
    }

    return { load, removeById };
})();

window.AdminRegistrations = AdminRegistrations;
