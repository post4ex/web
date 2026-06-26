// ============================================================================
// ADMIN-USERS.JS — Users list, full detail (no PASS/RESET_TOKEN), sudo mutations
// MOBILE stored as "CC-NUMBER" (e.g. 91-9760395014), shown as two fields
// ============================================================================

const AdminUsers = (() => {

    let _users = [];
    let _selected = null;

    const ROLES    = ['MASTER','ADMIN','AUDITOR','ACCOUNTANT','MANAGER','STAFF','CLIENT'];
    const STATUSES = ['ACTIVE','INACTIVE'];

    // Fields excluded from editing — shown as read-only labels instead
    const SKIP_FIELDS = new Set(['PASS','RESET_TOKEN','id','collectionId','collectionName','created','updated']);
    // Fields shown as read-only (displayed but not in the form)
    const READONLY_FIELDS = new Set(['USER']);

    // Fields that get a <select> instead of <input>
    const SELECT_FIELDS = { ROLE: ROLES, STATUS: STATUSES };

    const ROLE_COLORS = {
        MASTER:'bg-red-100 text-red-700', ADMIN:'bg-orange-100 text-orange-700',
        AUDITOR:'bg-yellow-100 text-yellow-700', ACCOUNTANT:'bg-blue-100 text-blue-700',
        MANAGER:'bg-purple-100 text-purple-700', STAFF:'bg-green-100 text-green-700',
        CLIENT:'bg-gray-100 text-gray-700'
    };

    // ── Mobile helpers ────────────────────────────────────────────────────────
    // Stored: "91-9760395014"  →  cc="91", num="9760395014"
    function _splitMobile(val) {
        if (!val) return { cc: '91', num: '' };
        const idx = val.indexOf('-');
        if (idx === -1) return { cc: '91', num: val };
        return { cc: val.slice(0, idx), num: val.slice(idx + 1) };
    }
    function _joinMobile(cc, num) {
        cc  = (cc  || '91').trim();
        num = (num || '').trim();
        return num ? `${cc}${num}` : '';
    }

    // ── Public API ────────────────────────────────────────────────────────────
    function setUsers(users) { _users = users; }

    function renderList(users) {
        const ul  = document.getElementById('adminList');
        const msg = document.getElementById('listMsg');
        if (!ul) return;
        if (!users.length) {
            ul.innerHTML = '';
            if (msg) { msg.textContent = 'No users found.'; msg.classList.remove('hidden'); }
            return;
        }
        if (msg) msg.classList.add('hidden');
        ul.innerHTML = users.map(u => `
            <li data-user="${u.USER}" class="${_selected === u.USER ? 'selected' : ''}">
                <strong>${u.USER}</strong>
                <span class="client-info">${u.NAME || ''}</span>
                <div class="details-info">
                    <span class="status-badge ${ROLE_COLORS[u.ROLE] || 'bg-gray-100 text-gray-600'}">${u.ROLE}</span>
                    <span class="${u.STATUS === 'ACTIVE' ? 'text-green-600' : 'text-red-500'} text-xs">${u.STATUS || ''}</span>
                </div>
            </li>`).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => _selectUser(li.dataset.user))
        );
    }

    function search(q) {
        const lq = q.toLowerCase();
        renderList(_users.filter(u =>
            u.USER.toLowerCase().includes(lq) ||
            (u.NAME||'').toLowerCase().includes(lq) ||
            (u.ROLE||'').toLowerCase().includes(lq)
        ));
    }

    // ── Private ───────────────────────────────────────────────────────────────
    function _selectUser(username) {
        _selected = username;
        const u = _users.find(x => x.USER === username);
        if (!u) return;
        document.querySelectorAll('#adminList li').forEach(li =>
            li.classList.toggle('selected', li.dataset.user === username)
        );
        AdminPage.showDetailPane();
        _renderDetail(u);
    }

    function _renderDetail(u) {
        AdminPage.showDetail(true);
        const view = document.getElementById('detailView');
        if (!view) return;

        const canEdit   = AdminPage.can('ADMIN');
        const canDelete = AdminPage.can('MASTER');

        // ── Self-lockout check: cannot toggle own account ─────────────────────
        const isSelf = u.USER === (getUser?.()?.USER || '');
        const canToggle = canEdit && !isSelf;

        let toggleBtnHtml = '';
        if (canToggle) {
            const btnClass = u.STATUS === 'ACTIVE' ? 'btn-danger' : 'btn';
            const btnLabel = u.STATUS === 'ACTIVE' ? 'Deactivate' : 'Activate';
            toggleBtnHtml = `<button id="toggleUserStatusBtn" class="${btnClass} btn-sm">${btnLabel}</button>`;
        }

        // Build fields from actual user keys
        const readonlyFields = Object.keys(u).filter(k => READONLY_FIELDS.has(k));
        const editableFields  = Object.keys(u).filter(k => !SKIP_FIELDS.has(k) && !READONLY_FIELDS.has(k));

        const readonlyHtml = readonlyFields.map(f => `
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">${f}</label>
                <p class="text-sm text-gray-800 px-3 py-2 bg-gray-50 border border-gray-200 rounded">${u[f] || '—'}</p>
            </div>`).join('');
        const { cc, num } = _splitMobile(u.MOBILE);

        const fieldHtml = editableFields.map(f => {
            if (f === 'MOBILE') return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">MOBILE</label>
                    <div class="flex gap-2">
                        <input name="MOBILE_CC"  value="${cc}"  class="form-input text-sm" style="width:5rem;flex-shrink:0" placeholder="CC" title="Country code">
                        <input name="MOBILE_NUM" value="${num}" class="form-input text-sm flex-1" placeholder="Number">
                    </div>
                    <p class="text-xs text-gray-400 mt-0.5">CC - Number</p>
                </div>`;
            if (SELECT_FIELDS[f]) return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">${f}</label>
                    <select name="${f}" class="form-input text-sm">
                        ${SELECT_FIELDS[f].map(o => `<option ${u[f]===o?'selected':''}>${o}</option>`).join('')}
                    </select>
                </div>`;
            return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">${f}</label>
                    <input name="${f}" value="${u[f]||''}" class="form-input text-sm">
                </div>`;
        }).join('');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h2 class="text-base font-bold text-gray-800">${u.USER}</h2>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="status-badge ${ROLE_COLORS[u.ROLE] || 'bg-gray-100 text-gray-600'}">${u.ROLE}</span>
                            <span class="${u.STATUS === 'ACTIVE' ? 'text-green-600' : 'text-red-500'} text-xs font-semibold">${u.STATUS || ''}</span>
                        </div>
                    </div>
                    <div class="flex gap-2 items-center">
                        ${toggleBtnHtml}
                        ${canDelete ? `<button id="deleteUserBtn" class="btn-danger btn-sm">Delete</button>` : ''}
                    </div>
                </div>
                <div class="detail-card-body">
                    <form id="editUserForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        ${readonlyHtml}
                        ${fieldHtml}
                        ${canEdit ? `<div class="sm:col-span-2 flex justify-end">
                            <button type="submit" class="btn btn-sm">Save Changes</button>
                        </div>` : ''}
                    </form>
                </div>
            </div>`;

        if (!canEdit) view.querySelectorAll('input,select').forEach(el => el.disabled = true);

        // ── Status Toggle Button ──────────────────────────────────────────────
        view.querySelector('#toggleUserStatusBtn')?.addEventListener('click', () => {
            if (!canToggle) return;
            const newStatus = u.STATUS === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
            const actionWord = u.STATUS === 'ACTIVE' ? 'deactivate' : 'activate';

            if (!confirm(`Are you sure you want to ${actionWord} user "${u.USER}"?`)) return;

            AdminPage.requireSudo(async sudoToken => {
                try {
                    const payload = { STATUS: newStatus, CASCADED_BLOCK: false };
                    await AdminAPI.updateUser(u.USER, sudoToken, payload);

                    u.STATUS = newStatus;
                    u.CASCADED_BLOCK = false;
                    showNotification('✅ User status updated to ' + newStatus, 'success');
                    _renderDetail(u);
                    renderList(_users);
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                }
            });
        });

        // ── Edit Form Submit ──────────────────────────────────────────────────
        view.querySelector('#editUserForm').addEventListener('submit', e => {
            if (!canEdit) return;
            e.preventDefault();
            const f = e.target;
            const fields = {};

            editableFields.forEach(field => {
                if (field === 'MOBILE') {
                    const newVal = _joinMobile(f.MOBILE_CC?.value, f.MOBILE_NUM?.value);
                    if (newVal !== (u.MOBILE || '')) fields.MOBILE = newVal;
                } else {
                    const el = f.elements[field];
                    if (el && el.value !== (u[field] || '')) {
                        fields[field] = el.value;
                        if (field === 'STATUS') {
                            fields.CASCADED_BLOCK = false;
                        }
                    }
                }
            });

            if (!Object.keys(fields).length) return showNotification('No changes', 'info');

            // validate EMAIL and MOBILE if changed
            if (fields.EMAIL && window.InputValidator && !window.InputValidator.email(fields.EMAIL))
                return showNotification('❌ Invalid email address', 'error');
            if (fields.MOBILE && window.InputValidator && !window.InputValidator.mobile(fields.MOBILE))
                return showNotification('❌ MOBILE must be 91XXXXXXXXXX (12 digits)', 'error');

            AdminPage.requireSudo(async sudoToken => {
                try {
                    await AdminAPI.updateUser(u.USER, sudoToken, fields);
                    Object.assign(u, fields);
                    showNotification('✅ User updated', 'success');
                    _renderDetail(u);
                    renderList(_users);
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                }
            });
        });

        // ── Delete Button ─────────────────────────────────────────────────────
        view.querySelector('#deleteUserBtn')?.addEventListener('click', () => {
            if (!canDelete) return;
            if (!confirm(`Delete user "${u.USER}"? This cannot be undone.`)) return;
            AdminPage.requireSudo(async sudoToken => {
                try {
                    await AdminAPI.deleteUser(u.USER, sudoToken);
                    _users = _users.filter(x => x.USER !== u.USER);
                    _selected = null;
                    renderList(_users);
                    AdminPage.showDetail(false);
                    showNotification('✅ User deleted', 'success');
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                }
            });
        });
    }

    return { setUsers, renderList, search };
})();

window.AdminUsers = AdminUsers;
