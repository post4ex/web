// ============================================================================
// ADMIN-REGISTRATIONS.JS — List + right-pane detail, sudo-gated approve
// ============================================================================

const AdminRegistrations = (() => {

    let _regs = [];
    let _selected = null;

    const ROLES    = ['CLIENT','STAFF','MANAGER','ACCOUNTANT','AUDITOR','ADMIN','MASTER'];
    const STATUSES = ['ACTIVE','INACTIVE','SUSPENDED','PENDING'];

    // Fields not shown in detail pane
    const SKIP = new Set(['PASS','RESET_TOKEN','id','collectionId','collectionName','created','updated']);
    // Fields shown read-only (user submitted, admin shouldn't change)
    const READONLY = new Set(['USER','EMAIL']);
    const SELECT_FIELDS = { ROLE: ROLES, STATUS: STATUSES };

    function _splitMobile(val) {
        if (!val) return { cc: '91', num: '' };
        const idx = val.indexOf('-');
        return idx === -1 ? { cc: '91', num: val } : { cc: val.slice(0, idx), num: val.slice(idx + 1) };
    }
    function _joinMobile(cc, num) {
        cc = (cc || '91').trim(); num = (num || '').trim();
        return num ? `${cc}-${num}` : '';
    }

    async function load() {
        const msg = document.getElementById('listMsg');
        const ul  = document.getElementById('adminList');
        try {
            const res = await AdminAPI.fetchRegistrations();
            _regs = res.data || [];
            if (!_regs.length) {
                ul.innerHTML = '';
                if (msg) { msg.textContent = 'No pending registrations.'; msg.classList.remove('hidden'); }
                return;
            }
            if (msg) msg.classList.add('hidden');
            _renderList();
        } catch (err) {
            if (msg) { msg.textContent = 'Failed to load.'; msg.classList.remove('hidden'); }
            showNotification('❌ ' + err.message, 'error');
        }
    }

    function _renderList() {
        const ul = document.getElementById('adminList');
        if (!ul) return;
        ul.innerHTML = _regs.map(r => `
            <li data-id="${r.id}" class="${_selected === r.id ? 'selected' : ''}">
                <strong>${r.USER || r.EMAIL?.split('@')[0] || '—'}</strong>
                <span class="client-info">${r.NAME || ''}</span>
                <div class="details-info">
                    <span class="text-xs text-gray-500">${r.EMAIL || ''}</span>
                </div>
            </li>`).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => _selectReg(li.dataset.id))
        );
    }

    function _selectReg(id) {
        _selected = id;
        const reg = _regs.find(r => r.id === id);
        if (!reg) return;
        document.querySelectorAll('#adminList li').forEach(li =>
            li.classList.toggle('selected', li.dataset.id === id)
        );
        document.getElementById('adminDetailPane')?.classList.add('mobile-show');
        _renderDetail(reg);
    }

    function _renderDetail(reg) {
        AdminPage.showDetail(true);
        const view = document.getElementById('detailView');
        if (!view) return;

        const canAct = AdminPage.can('ADMIN');

        const editableKeys = Object.keys(reg).filter(k => !SKIP.has(k) && !READONLY.has(k));
        const { cc, num } = _splitMobile(reg.MOBILE);

        const readonlyHtml = [...READONLY].filter(k => reg[k] != null).map(k => `
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">${k}</label>
                <p class="text-sm text-gray-800 px-3 py-2 bg-gray-50 border border-gray-200 rounded">${reg[k] || '—'}</p>
            </div>`).join('');

        const fieldHtml = editableKeys.map(f => {
            if (f === 'MOBILE') return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">MOBILE</label>
                    <div class="flex gap-2">
                        <input name="MOBILE_CC"  value="${cc}"  class="form-input text-sm" style="width:5rem;flex-shrink:0" placeholder="CC">
                        <input name="MOBILE_NUM" value="${num}" class="form-input text-sm flex-1" placeholder="Number">
                    </div>
                    <p class="text-xs text-gray-400 mt-0.5">CC - Number</p>
                </div>`;
            if (SELECT_FIELDS[f]) return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">${f}</label>
                    <select name="${f}" class="form-input text-sm">
                        ${SELECT_FIELDS[f].map(o => `<option ${reg[f]===o?'selected':''}>${o}</option>`).join('')}
                    </select>
                </div>`;
            return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">${f}</label>
                    <input name="${f}" value="${reg[f]||''}" class="form-input text-sm">
                </div>`;
        }).join('');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h2 class="text-base font-bold text-gray-800">${reg.USER || '—'}</h2>
                        <p class="text-xs text-gray-500">${reg.NAME || ''}</p>
                    </div>
                    ${canAct ? `<button id="declineRegBtn" class="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700">Decline</button>` : ''}
                </div>
                <div class="detail-card-body">
                    <form id="approveRegForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        ${readonlyHtml}
                        ${fieldHtml}
                        ${canAct ? `<div class="sm:col-span-2 flex justify-end">
                            <button type="submit" class="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700">✓ Approve</button>
                        </div>` : ''}
                    </form>
                </div>
            </div>`;

        if (!canAct) view.querySelectorAll('input,select').forEach(el => el.disabled = true);

        view.querySelector('#approveRegForm').addEventListener('submit', e => {
            if (!canAct) return;
            e.preventDefault();
            const f = e.target;
            const fields = {};
            editableKeys.forEach(key => {
                if (key === 'MOBILE') {
                    fields.MOBILE = _joinMobile(f.MOBILE_CC?.value, f.MOBILE_NUM?.value);
                } else {
                    const el = f.elements[key];
                    if (el) fields[key] = el.value;
                }
            });
            AdminPage.requireSudo(async sudoToken => {
                try {
                    await AdminAPI.approveRegistration(reg.id, fields, sudoToken);
                    removeById(reg.id);
                    AdminPage.showDetail(false);
                    // refresh user count on tiles
                    const uRes = await AdminAPI.listUsers();
                    const cnt = document.getElementById('cnt-users');
                    if (cnt) cnt.textContent = (uRes.data || []).length;
                    showNotification('✅ Registration approved', 'success');
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                }
            });
        });

        view.querySelector('#declineRegBtn')?.addEventListener('click', async () => {
            if (!canAct) return;
            if (!confirm(`Decline registration for "${reg.NAME || reg.EMAIL}"?`)) return;
            try {
                await AdminAPI.declineRegistration(reg.id);
                removeById(reg.id);
                AdminPage.showDetail(false);
                showNotification('✅ Declined', 'success');
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            }
        });
    }

    function removeById(id) {
        _regs = _regs.filter(r => r.id !== id);
        _selected = null;
        const msg = document.getElementById('listMsg');
        if (!_regs.length) {
            document.getElementById('adminList').innerHTML = '';
            if (msg) { msg.textContent = 'No pending registrations.'; msg.classList.remove('hidden'); }
        } else {
            _renderList();
        }
        // update tile count
        const cnt = document.getElementById('cnt-registrations');
        if (cnt) cnt.textContent = _regs.length;
    }

    return { load, removeById };
})();

window.AdminRegistrations = AdminRegistrations;
