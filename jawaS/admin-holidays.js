// ============================================================================
// ADMIN-HOLIDAYS.JS — Holidays tile (MANAGER+)
// State-based holidays — STATE_CODE = comma-separated state codes
// OPEN_BRANCHES — comma-separated branch codes open on this holiday
// Dates stored as Unix ms in PB
// ============================================================================

const AdminHolidays = (() => {

    let _holidays  = {};
    let _branches  = {};
    let _selected  = null;
    let _initialized = false;

    const HOLIDAY_TYPES = ['National', 'Regional', 'Optional', 'Company'];

    function _can(role) { return AdminPage.can(role); }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function _msToInput(ms) {
        if (!ms) return '';
        return new Date(parseInt(ms)).toISOString().split('T')[0];
    }
    function _inputToMs(dateStr) {
        if (!dateStr) return 0;
        return new Date(dateStr + 'T00:00:00Z').getTime();
    }
    function _fmtDisplay(ms) {
        if (!ms) return '—';
        return new Date(parseInt(ms)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    }

    // ── List ──────────────────────────────────────────────────────────────────
    function _injectListPane() {
        const listMsg = document.getElementById('listMsg');
        if (listMsg) listMsg.classList.add('hidden');
        document.getElementById('adminList').innerHTML = `<ul id="holidayList" class="space-y-2"></ul>`;
        const searchEl = document.getElementById('listSearch');
        if (searchEl) searchEl.placeholder = 'Search holidays…';
    }

    function _renderList(holidays) {
        const ul = document.getElementById('holidayList');
        if (!ul) return;
        const items = Object.values(holidays || {}).sort((a, b) => parseInt(a.HOLIDAY_DATE) - parseInt(b.HOLIDAY_DATE));
        if (!items.length) {
            ul.innerHTML = '<li class="text-center text-gray-500 text-sm py-4">No holidays found.</li>';
            return;
        }

        // Group by month
        const byMonth = {};
        items.forEach(h => {
            const d = new Date(parseInt(h.HOLIDAY_DATE));
            const key = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
            if (!byMonth[key]) byMonth[key] = [];
            byMonth[key].push(h);
        });

        ul.innerHTML = Object.entries(byMonth).map(([month, hs]) => `
            <li class="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 pt-2">${month}</li>
            ${hs.map(h => {
                const openBranches = (h.OPEN_BRANCHES || '').split(',').filter(Boolean);
                const states = (h.STATE_CODE || '').split(',').filter(Boolean);
                const typeColor = h.HOLIDAY_TYPE === 'National' ? 'bg-red-50 text-red-700' :
                                  h.HOLIDAY_TYPE === 'Regional' ? 'bg-blue-50 text-blue-700' :
                                  h.HOLIDAY_TYPE === 'Optional' ? 'bg-gray-100 text-gray-600' :
                                  'bg-purple-50 text-purple-700';
                return `
                <li data-id="${h.HOLIDAY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-yellow-50 border border-gray-200 transition-colors ${_selected === h.HOLIDAY_ID ? 'bg-yellow-100 border-yellow-300' : ''}">
                    <div class="flex justify-between items-start">
                        <strong class="text-yellow-700 text-sm">${h.HOLIDAY_NAME || ''}</strong>
                        <span class="text-xs ${typeColor} px-1.5 py-0.5 rounded ml-1 flex-shrink-0">${h.HOLIDAY_TYPE || ''}</span>
                    </div>
                    <span class="text-xs text-gray-500">${_fmtDisplay(h.HOLIDAY_DATE)}</span>
                    <div class="flex flex-wrap gap-1 mt-1">
                        ${states.length ? states.map(s => `<span class="text-xs bg-blue-50 text-blue-600 px-1 rounded">${s}</span>`).join('') : '<span class="text-xs text-gray-400">All States</span>'}
                        ${openBranches.length ? `<span class="text-xs bg-green-50 text-green-700 px-1.5 rounded">🟢 ${openBranches.length} open</span>` : ''}
                    </div>
                </li>`;
            }).join('')}`
        ).join('');

        ul.querySelectorAll('li[data-id]').forEach(li =>
            li.addEventListener('click', () => _selectHoliday(li.dataset.id))
        );
    }

    function search(q) {
        const lq = q.toLowerCase();
        const filtered = {};
        Object.entries(_holidays).forEach(([k, h]) => {
            if ((h.HOLIDAY_NAME || '').toLowerCase().includes(lq) ||
                (h.STATE_CODE   || '').toLowerCase().includes(lq) ||
                (h.HOLIDAY_TYPE || '').toLowerCase().includes(lq) ||
                _fmtDisplay(h.HOLIDAY_DATE).toLowerCase().includes(lq))
                filtered[k] = h;
        });
        _renderList(filtered);
    }

    // ── Detail ────────────────────────────────────────────────────────────────
    function _selectHoliday(id) {
        _selected = id;
        _renderList(_holidays);
        _renderDetail(_holidays[id]);
        AdminPage.showDetailPane();
    }

    function openAddPane() {
        _selected = null;
        _renderList(_holidays);
        _renderDetail(null);
        AdminPage.showDetail(true);
        AdminPage.showDetailPane();
    }

    function _renderDetail(h) {
        AdminPage.showDetail(true);
        const view    = document.getElementById('detailView');
        if (!view) return;
        const isEdit  = !!h;
        const canEdit = _can('ADMIN');

        // State options — unique CODE_STATE values from branches
        const states = [...new Set(Object.values(_branches).map(b => b.CODE_STATE).filter(Boolean))].sort();
        const selectedStates = (h?.STATE_CODE || '').split(',').filter(Boolean);

        const stateCheckboxes = states.map(s => `
            <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" name="state_code" value="${s}" ${selectedStates.includes(s) ? 'checked' : ''} ${!canEdit ? 'disabled' : ''}>
                <span class="font-medium">${s}</span>
            </label>`).join('');

        // Branch checkboxes
        const openBranches = (h?.OPEN_BRANCHES || '').split(',').filter(Boolean);
        const branchCheckboxes = Object.values(_branches).map(b => `
            <label class="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-gray-50">
                <input type="checkbox" name="open_branch" value="${b.BRANCH_CODE}" ${openBranches.includes(b.BRANCH_CODE) ? 'checked' : ''} ${!canEdit ? 'disabled' : ''}>
                <span class="font-medium text-gray-700">${b.BRANCH_CODE}</span>
                <span class="text-gray-400">${b.BRANCH_NAME || ''}</span>
                <span class="text-gray-300 text-xs">${b.CODE_STATE || ''}</span>
            </label>`).join('');

        // ── View mode: read-only labels ───────────────────────────────────────
        const typeColor = h?.HOLIDAY_TYPE === 'National' ? 'bg-red-50 text-red-700' :
                          h?.HOLIDAY_TYPE === 'Regional' ? 'bg-blue-50 text-blue-700' :
                          h?.HOLIDAY_TYPE === 'Optional' ? 'bg-gray-100 text-gray-600' :
                          'bg-purple-50 text-purple-700';

        view.innerHTML = `
            <div class="detail-card ${isEdit ? 'mode-view' : ''}" id="holidayDetailCard">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h2 class="text-base font-bold text-gray-800">${isEdit ? h.HOLIDAY_NAME : 'New Holiday'}</h2>
                        ${isEdit ? `<span class="text-xs ${typeColor} px-1.5 py-0.5 rounded">${h.HOLIDAY_TYPE || ''}</span>` : ''}
                    </div>
                    ${isEdit && canEdit ? `
                    <div class="flex gap-2">
                        <button id="holidayEditBtn" class="view-only btn btn-sm">Edit</button>
                        <button id="holidayDeleteBtn" class="view-only btn-danger btn-sm">Delete</button>
                        <button id="holidayCancelEditBtn" class="edit-only btn-ghost btn-sm">Cancel</button>
                    </div>` : ''}
                </div>
                <div class="detail-card-body">
                    <!-- View Mode: read-only -->
                    <div class="view-only space-y-3">
                        ${isEdit ? `
                        <div class="grid grid-cols-2 gap-4">
                            <div><span class="block text-xs font-semibold text-gray-500">Holiday Name</span><span class="text-sm">${h.HOLIDAY_NAME || '—'}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">Date</span><span class="text-sm">${_fmtDisplay(h.HOLIDAY_DATE)}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">Year</span><span class="text-sm">${h.YEAR || '—'}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">States</span><span class="text-sm">${(h.STATE_CODE || '').split(',').filter(Boolean).join(', ') || 'All States'}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">Open Branches</span><span class="text-sm">${(h.OPEN_BRANCHES || '').split(',').filter(Boolean).join(', ') || 'None'}</span></div>
                        </div>` : ''}
                    </div>

                    <!-- Edit Mode: editable form -->
                    <form id="holidayForm" class="edit-only grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Holiday Name *</label>
                            <input name="HOLIDAY_NAME" required value="${h?.HOLIDAY_NAME || ''}" class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                            <input name="HOLIDAY_DATE" type="date" required value="${_msToInput(h?.HOLIDAY_DATE)}" class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Type</label>
                            <select name="HOLIDAY_TYPE" class="form-input text-sm">
                                ${HOLIDAY_TYPES.map(t => `<option ${h?.HOLIDAY_TYPE === t ? 'selected' : ''}>${t}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Year</label>
                            <input name="YEAR" value="${h?.YEAR || new Date().getFullYear()}" class="form-input text-sm">
                        </div>

                        <!-- States -->
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-2">
                                Applicable States
                                <span class="text-gray-400 font-normal ml-1">(leave all unchecked = all states)</span>
                            </label>
                            <div class="flex flex-wrap gap-3 border rounded p-2 bg-gray-50">
                                ${stateCheckboxes || '<p class="text-xs text-gray-400">No states found in branches.</p>'}
                            </div>
                        </div>

                        <!-- Open branches override -->
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-2">
                                🟢 Branches Open on This Holiday
                                <span class="text-gray-400 font-normal ml-1">(branches that will operate)</span>
                            </label>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 border rounded p-2 max-h-40 overflow-y-auto bg-gray-50">
                                ${branchCheckboxes || '<p class="text-xs text-gray-400 p-2">No branches found.</p>'}
                            </div>
                        </div>

                        ${canEdit ? `
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm">
                                ${isEdit ? 'Save Changes' : 'Create Holiday'}
                            </button>
                        </div>` : ''}
                    </form>
                </div>
            </div>`;

        // ── View/Edit toggling ─────────────────────────────────────────────────
        if (isEdit && canEdit) {
            view.querySelector('#holidayEditBtn')?.addEventListener('click', () => {
                const card = document.getElementById('holidayDetailCard');
                if (card) card.className = 'detail-card mode-edit';
            });
            view.querySelector('#holidayCancelEditBtn')?.addEventListener('click', () => {
                if (window.NavigationGuard) NavigationGuard.markClean();
                _renderDetail(_holidays[_selected]);
            });
        }

        if (canEdit) {
            view.querySelector('#holidayForm').addEventListener('submit', async e => {
                e.preventDefault();
                const f = e.target;
                const stateVals  = [...f.querySelectorAll('[name="state_code"]:checked')].map(cb => cb.value);
                const openBrVals = [...f.querySelectorAll('[name="open_branch"]:checked')].map(cb => cb.value);
                const payload = {
                    HOLIDAY_NAME:  f.HOLIDAY_NAME.value.trim(),
                    HOLIDAY_DATE:  _inputToMs(f.HOLIDAY_DATE.value),
                    HOLIDAY_TYPE:  f.HOLIDAY_TYPE.value,
                    STATE_CODE:    stateVals.join(','),
                    OPEN_BRANCHES: openBrVals.join(','),
                    YEAR:          f.YEAR.value.trim(),
                };
                if (isEdit) payload.record_id = h.id;
                const btn = f.querySelector('button[type=submit]');
                btn.disabled = true; btn.textContent = 'Saving…';
                try {
                    const res = await callApi('/api/writeHoliday', payload);
                    const rec = res.record;
                    _holidays[rec.HOLIDAY_ID] = rec;
                    _selected = rec.HOLIDAY_ID;
                    _renderList(_holidays);
                    _renderDetail(rec);
                    const cnt = document.getElementById('cnt-holidays');
                    if (cnt) cnt.textContent = Object.keys(_holidays).length;
                    if (window.NavigationGuard) NavigationGuard.markClean();
                    showNotification(`✅ Holiday ${isEdit ? 'updated' : 'created'}`, 'success');
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                } finally { btn.disabled = false; btn.textContent = isEdit ? 'Save Changes' : 'Create Holiday'; }
            });
        }

        if (isEdit && canEdit) {
            view.querySelector('#holidayDeleteBtn')?.addEventListener('click', async () => {
                if (!confirm(`Delete "${h.HOLIDAY_NAME}"?`)) return;
                try {
                    await callApi('/api/deleteHoliday', { record_id: h.id }, 'DELETE');
                    delete _holidays[h.HOLIDAY_ID];
                    _selected = null;
                    _renderList(_holidays);
                    AdminPage.showDetail(false);
                    const cnt = document.getElementById('cnt-holidays');
                    if (cnt) cnt.textContent = Object.keys(_holidays).length;
                    if (window.NavigationGuard) NavigationGuard.markClean();
                    showNotification('✅ Holiday deleted', 'success');
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                }
            });
        }
    }

    // ── Data ──────────────────────────────────────────────────────────────────
    function _loadData(data) {
        if (data?.HOLIDAYS) _holidays = data.HOLIDAYS;
        if (data?.BRANCHES) _branches = data.BRANCHES;
    }

    async function load() {
        if (!_initialized) {
            _initialized = true;
            window.addEventListener('appDataRefreshed', e => {
                _loadData(e.detail.data);
                _renderList(_holidays);
            });
        }
        _injectListPane();
        const data = await getAppData();
        _loadData(data);
        _renderList(_holidays);
        AdminPage.showDetail(false);
    }

    return { load, search, openAddPane };
})();

window.AdminHolidays = AdminHolidays;
