// ============================================================================
// ADMIN-STAFF.JS — Staff list + detail form (add/edit/delete)
// Attendance is handled separately in admin-attendance.js
// Role gates: Save/Delete → ADMIN+
// ============================================================================

const AdminStaff = (() => {

    let _staff       = {};
    let _branches    = {};
    let _selected    = null;
    let _initialized = false;

    const STAFF_STATUSES = ['Active', 'Resigned', 'On Leave'];
    const STAFF_ROLES    = ['Delivery Executive', 'Manager', 'Admin', 'Operations'];
    const STAFF_DEPTS    = ['Operations', 'Sales', 'Human Resources', 'Finance'];

    function _can(role) { return AdminPage.can(role); }

    // ── List ──────────────────────────────────────────────────────────────────
    function _injectListPane() {
        const listPane = document.getElementById('adminList');
        const listMsg  = document.getElementById('listMsg');
        if (listMsg) listMsg.classList.add('hidden');
        if (listPane) listPane.innerHTML = `<ul id="staffAdminList" class="space-y-2"></ul>`;
        const searchEl = document.getElementById('listSearch');
        if (searchEl) searchEl.placeholder = 'Search by code or name…';
    }

    function _renderList(staff) {
        const ul = document.getElementById('staffAdminList');
        if (!ul) return;
        const items = Object.values(staff || {});
        if (!items.length) { ul.innerHTML = '<li class="text-center text-gray-500 text-sm py-4">No staff found.</li>'; return; }
        items.sort((a, b) => (a.STAFF_CODE > b.STAFF_CODE ? 1 : -1));
        ul.innerHTML = items.map(s => `
            <li data-code="${s.STAFF_CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors border border-gray-200 ${_selected === s.STAFF_CODE ? 'bg-blue-100 border-blue-300' : ''}">
                <strong class="text-blue-700 block text-sm">${s.STAFF_CODE}</strong>
                <span class="text-xs text-gray-600">${s.STAFF_NAME || ''}</span>
                <span class="text-xs text-gray-400 block">${s.BRANCH || ''}</span>
            </li>`).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => _selectStaff(li.dataset.code))
        );
    }

    function search(q) {
        const lq = q.toLowerCase();
        const filtered = {};
        Object.entries(_staff).forEach(([k, s]) => {
            if ((s.STAFF_CODE || '').toLowerCase().includes(lq) || (s.STAFF_NAME || '').toLowerCase().includes(lq))
                filtered[k] = s;
        });
        _renderList(filtered);
    }

    // ── Detail ────────────────────────────────────────────────────────────────
    function _selectStaff(code) {
        _selected = code;
        _renderList(_staff);
        _renderDetail(_staff[code]);
        document.getElementById('adminDetailPane')?.classList.add('mobile-show');
    }

    function openAddPane() {
        _selected = null;
        _renderList(_staff);
        _renderDetail(null);
        AdminPage.showDetail(true);
        document.getElementById('adminDetailPane')?.classList.add('mobile-show');
    }

    function _renderDetail(s) {
        AdminPage.showDetail(true);
        const view = document.getElementById('detailView');
        if (!view) return;

        const canEdit   = _can('ADMIN');
        const canDelete = _can('ADMIN');
        const isEdit    = !!s;

        const branchOptions = Object.values(_branches).map(b =>
            `<option value="${b.BRANCH_CODE}" ${s?.BRANCH === b.BRANCH_CODE ? 'selected' : ''}>${b.BRANCH_CODE} - ${b.BRANCH_NAME || ''}</option>`
        ).join('');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h2 class="text-base font-bold text-gray-800">${isEdit ? s.STAFF_CODE : 'New Staff'}</h2>
                    ${isEdit && canDelete ? `<button id="staffDeleteBtn" class="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700">Delete</button>` : ''}
                </div>
                <div class="detail-card-body">
                    <form id="staffDetailForm" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Staff Code *</label>
                            <input name="STAFF_CODE" value="${s?.STAFF_CODE || ''}" class="form-input text-sm readonly-input" readonly>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Staff Name *</label>
                            <input name="STAFF_NAME" value="${s?.STAFF_NAME || ''}" required class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch *</label>
                            <select name="BRANCH" required class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                                <option value="">Select Branch</option>
                                ${branchOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Aadhar Number</label>
                            <input name="ADHAR_NUM" id="sfAdhar" value="${s?.ADHAR_NUM || ''}" maxlength="12" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Father's Name</label>
                            <input name="FATHERS_NAME" value="${s?.FATHERS_NAME || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date of Birth</label>
                            <input name="DATE_BIRTH" type="date" value="${s?.DATE_BIRTH ? s.DATE_BIRTH.split('T')[0] : ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date of Joining</label>
                            <input name="DATE_JOIN" type="date" value="${s?.DATE_JOIN ? s.DATE_JOIN.split('T')[0] : ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date of Leaving</label>
                            <input name="DATE_LEAVE" type="date" value="${s?.DATE_LEAVE ? s.DATE_LEAVE.split('T')[0] : ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">PAN Number</label>
                            <input name="PAN_NUM" value="${s?.PAN_NUM || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">EPF UID</label>
                            <input name="EPF_UID" value="${s?.EPF_UID || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">ESI UID</label>
                            <input name="ESI_UID" value="${s?.ESI_UID || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
                            <select name="STATUS" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                                ${STAFF_STATUSES.map(o => `<option ${s?.STATUS === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Role</label>
                            <select name="ROLE" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                                <option value="">Select Role</option>
                                ${STAFF_ROLES.map(o => `<option ${s?.ROLE === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Department</label>
                            <select name="DEPARTMENT" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                                <option value="">Select Dept</option>
                                ${STAFF_DEPTS.map(o => `<option ${s?.DEPARTMENT === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Address</label>
                            <input name="ADDRESS" value="${s?.ADDRESS || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div class="relative">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Pincode</label>
                            <input name="PINCODE" id="sfPincode" value="${s?.PINCODE || ''}" maxlength="6" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">City</label>
                            <input name="CITY" id="sfCity" value="${s?.CITY || ''}" class="form-input text-sm readonly-input" readonly>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">State</label>
                            <input name="STATE" id="sfState" value="${s?.STATE || ''}" class="form-input text-sm readonly-input" readonly>
                        </div>
                        ${canEdit ? `
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">
                                ${isEdit ? 'Save Changes' : 'Create Staff'}
                            </button>
                        </div>` : ''}
                    </form>
                </div>
            </div>`;

        // auto-generate staff code on new
        if (!isEdit && canEdit) {
            const _gen = () => {
                const name   = (view.querySelector('[name="STAFF_NAME"]')?.value || '').replace(/\s+/g, '').toUpperCase();
                const branch = view.querySelector('[name="BRANCH"]')?.value || '';
                const adhar  = view.querySelector('[name="ADHAR_NUM"]')?.value || '';
                view.querySelector('[name="STAFF_CODE"]').value =
                    (name && branch && adhar.length >= 4) ? `${name.substring(0,4)}${branch}${adhar.slice(-4)}` : '';
            };
            ['input','change'].forEach(ev => {
                view.querySelector('[name="STAFF_NAME"]')?.addEventListener(ev, _gen);
                view.querySelector('[name="BRANCH"]')?.addEventListener(ev, _gen);
                view.querySelector('[name="ADHAR_NUM"]')?.addEventListener(ev, _gen);
            });
        }

        // pincode auto-fill
        if (canEdit) {
            let _pt;
            view.querySelector('#sfPincode')?.addEventListener('input', e => {
                clearTimeout(_pt);
                if (e.target.value.length === 6)
                    _pt = setTimeout(() => _fetchPincode(e.target.value, view), 400);
            });
        }

        // save
        if (canEdit) {
            view.querySelector('#staffDetailForm').addEventListener('submit', async e => {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(e.target));
                const btn  = e.target.querySelector('button[type=submit]');
                btn.disabled = true; btn.textContent = 'Saving…';
                try {
                    const payload = { collection: 'STAFF', data };
                    if (isEdit) payload.record_id = s.id;
                    const res = await callApi('/api/write', payload);
                    const rec = res.record;
                    _staff[rec.STAFF_CODE] = rec;
                    _selected = rec.STAFF_CODE;
                    _renderList(_staff);
                    _renderDetail(rec);
                    const cnt = document.getElementById('cnt-staff');
                    if (cnt) cnt.textContent = Object.keys(_staff).length;
                    showNotification(`✅ Staff ${isEdit ? 'updated' : 'created'}`, 'success');
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                } finally { btn.disabled = false; btn.textContent = isEdit ? 'Save Changes' : 'Create Staff'; }
            });
        }

        // delete
        if (isEdit && canDelete) {
            view.querySelector('#staffDeleteBtn')?.addEventListener('click', async () => {
                if (!confirm(`Delete staff "${s.STAFF_CODE}"? This cannot be undone.`)) return;
                try {
                    await callApi('/api/delete', { collection: 'STAFF', record_id: s.id });
                    delete _staff[s.STAFF_CODE];
                    _selected = null;
                    _renderList(_staff);
                    AdminPage.showDetail(false);
                    const cnt = document.getElementById('cnt-staff');
                    if (cnt) cnt.textContent = Object.keys(_staff).length;
                    showNotification('✅ Staff deleted', 'success');
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                }
            });
        }
    }

    async function _fetchPincode(pin, view) {
        try {
            const res  = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
            const data = await res.json();
            if (data?.[0]?.Status === 'Success') {
                const po = data[0].PostOffice[0];
                const c  = view.querySelector('#sfCity');
                const st = view.querySelector('#sfState');
                if (c)  c.value  = po.District;
                if (st) st.value = po.State;
            }
        } catch (_) {}
    }

    // ── Data ──────────────────────────────────────────────────────────────────
    function _loadData(data) {
        if (data?.STAFF)    _staff    = data.STAFF;
        if (data?.BRANCHES) _branches = data.BRANCHES;
    }

    async function load() {
        if (!_initialized) {
            _initialized = true;
            window.addEventListener('appDataRefreshed', e => { _loadData(e.detail.data); _renderList(_staff); });
        }
        _injectListPane();
        const data = await getAppData();
        if (data) { _loadData(data); _renderList(_staff); }
    }

    return { load, search, openAddPane };
})();

window.AdminStaff = AdminStaff;
