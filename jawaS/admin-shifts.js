// ============================================================================
// ADMIN-SHIFTS.JS — Shifts & Leaves tile (MANAGER+)
// Read-only view of ATTENDANCE data — no new collection
// Left: staff list with today's shift + leave summary
// Right: tabbed view — Shifts history | Leaves history
// ============================================================================

const AdminShifts = (() => {

    let _staff      = {};
    let _attendance = {};
    let _selected   = null;
    let _activeTab  = 'shifts'; // 'shifts' | 'leaves'
    let _initialized = false;

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        const listMsg = document.getElementById('listMsg');
        if (listMsg) listMsg.classList.add('hidden');
        document.getElementById('adminList').innerHTML = `<ul id="shiftStaffList" class="space-y-2"></ul>`;
        const searchEl = document.getElementById('listSearch');
        if (searchEl) searchEl.placeholder = 'Search staff…';
    }

    function _renderList(staff) {
        const ul = document.getElementById('shiftStaffList');
        if (!ul) return;
        const today = new Date().toISOString().split('T')[0];
        const items = Object.values(staff || {}).filter(s => s.STATUS !== 'Resigned');
        if (!items.length) { ul.innerHTML = '<li class="text-center text-gray-500 text-sm py-4">No staff found.</li>'; return; }
        items.sort((a, b) => (a.STAFF_CODE > b.STAFF_CODE ? 1 : -1));

        ul.innerHTML = items.map(s => {
            const todayRec  = _attendance[`${s.STAFF_CODE}-${today}`];
            const shift     = todayRec?.SHIFT || '—';
            const leaveCount = Object.values(_attendance).filter(r => r.STAFF_CODE === s.STAFF_CODE && r.STATUS === 'Leave').length;
            return `
            <li data-code="${s.STAFF_CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-purple-50 border border-gray-200 transition-colors ${_selected === s.STAFF_CODE ? 'bg-purple-100 border-purple-300' : ''}">
                <strong class="text-purple-700 block text-sm">${s.STAFF_CODE}</strong>
                <span class="text-xs text-gray-600">${s.STAFF_NAME || ''}</span>
                <div class="flex gap-2 mt-1">
                    <span class="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">⏰ ${shift}</span>
                    ${leaveCount ? `<span class="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">🏖 ${leaveCount} leave${leaveCount > 1 ? 's' : ''}</span>` : ''}
                </div>
            </li>`;
        }).join('');

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

    // ── Detail pane ───────────────────────────────────────────────────────────
    function _selectStaff(code) {
        _selected = code;
        _renderList(_staff);
        _renderDetail(_staff[code]);
        AdminPage.showDetailPane();
    }

    function _renderDetail(s) {
        AdminPage.showDetail(true);
        const view = document.getElementById('detailView');
        if (!view) return;

        const allRecs = Object.values(_attendance)
            .filter(r => r.STAFF_CODE === s.STAFF_CODE)
            .sort((a, b) => b.ATTEN_DATE - a.ATTEN_DATE);

        const shiftRecs = allRecs.filter(r => r.SHIFT);
        const leaveRecs = allRecs.filter(r => r.STATUS === 'Leave');

        // Shift summary counts
        const shiftCounts = {};
        shiftRecs.forEach(r => { shiftCounts[r.SHIFT] = (shiftCounts[r.SHIFT] || 0) + 1; });

        // Leave summary counts
        const leaveCounts = {};
        leaveRecs.forEach(r => { leaveCounts[r.LEAVE_TYPE || 'Unspecified'] = (leaveCounts[r.LEAVE_TYPE || 'Unspecified'] || 0) + 1; });

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header">
                    <h2 class="text-base font-bold text-gray-800">${s.STAFF_NAME || s.STAFF_CODE} <span class="text-xs font-normal text-gray-400">${s.BRANCH || ''}</span></h2>
                </div>
                <div class="detail-card-body space-y-4">

                    <!-- Summary badges -->
                    <div class="flex flex-wrap gap-2">
                        ${Object.entries(shiftCounts).map(([sh, cnt]) =>
                            `<span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">⏰ ${sh}: ${cnt} days</span>`
                        ).join('')}
                        ${Object.entries(leaveCounts).map(([lt, cnt]) =>
                            `<span class="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded-full font-medium">🏖 ${lt}: ${cnt} day${cnt > 1 ? 's' : ''}</span>`
                        ).join('')}
                        ${!Object.keys(shiftCounts).length && !Object.keys(leaveCounts).length
                            ? '<span class="text-xs text-gray-400">No shift or leave records found.</span>' : ''}
                    </div>

                    <!-- Tabs -->
                    <div class="flex border-b">
                        <button id="tabShifts" class="px-4 py-2 text-sm font-medium border-b-2 ${_activeTab === 'shifts' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}">Shifts</button>
                        <button id="tabLeaves" class="px-4 py-2 text-sm font-medium border-b-2 ${_activeTab === 'leaves' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">Leaves <span class="ml-1 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">${leaveRecs.length}</span></button>
                    </div>

                    <!-- Tab content -->
                    <div id="shiftTabContent"></div>
                </div>
            </div>`;

        const _renderShifts = () => {
            const el = document.getElementById('shiftTabContent');
            if (!shiftRecs.length) { el.innerHTML = '<p class="text-xs text-gray-400">No shift records.</p>'; return; }
            const isMobile = window.innerWidth < 768;
            if (isMobile) {
                el.innerHTML = shiftRecs.slice(0, 20).map(r => `
                    <div class="border rounded-lg p-3 mb-2 bg-white text-xs space-y-1">
                        <div class="flex justify-between">
                            <span class="font-semibold text-gray-700">${r.ATTEN_DATE ? fmtDate(r.ATTEN_DATE, 'input') : ''}</span>
                            <span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">${r.SHIFT}</span>
                        </div>
                        <div class="flex gap-3 text-gray-600">
                            <span>In: ${r.IN_TIME ? fmtDate(r.IN_TIME, 'time') : '—'}</span>
                            <span>Out: ${r.OUT_TIME ? fmtDate(r.OUT_TIME, 'time') : '—'}</span>
                        </div>
                        ${r.LATE_MINS ? `<span class="text-orange-500">Late: ${r.LATE_MINS}m</span>` : ''}
                        ${r.OVERTIME_HRS ? `<span class="text-green-600">OT: ${r.OVERTIME_HRS}h</span>` : ''}
                    </div>`).join('');
            } else {
                el.innerHTML = `
                    <table class="w-full text-xs">
                        <thead><tr class="bg-gray-50 text-gray-500">
                            <th class="p-1.5 text-left">Date</th>
                            <th class="p-1.5 text-left">Shift</th>
                            <th class="p-1.5 text-left">In</th>
                            <th class="p-1.5 text-left">Out</th>
                            <th class="p-1.5 text-left">Late</th>
                            <th class="p-1.5 text-left">OT</th>
                            <th class="p-1.5 text-left">Status</th>
                        </tr></thead>
                        <tbody>${shiftRecs.slice(0, 30).map(r => `
                            <tr class="border-b">
                                <td class="p-1.5">${r.ATTEN_DATE ? fmtDate(r.ATTEN_DATE, 'input') : ''}</td>
                                <td class="p-1.5"><span class="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">${r.SHIFT}</span></td>
                                <td class="p-1.5">${r.IN_TIME  ? fmtDate(r.IN_TIME,  'time') : '—'}</td>
                                <td class="p-1.5">${r.OUT_TIME ? fmtDate(r.OUT_TIME, 'time') : '—'}</td>
                                <td class="p-1.5">${r.LATE_MINS    ? parseFloat(r.LATE_MINS) + 'm'    : ''}</td>
                                <td class="p-1.5">${r.OVERTIME_HRS ? parseFloat(r.OVERTIME_HRS) + 'h' : ''}</td>
                                <td class="p-1.5">${r.STATUS || ''}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>`;
            }
        };

        const _renderLeaves = () => {
            const el = document.getElementById('shiftTabContent');
            if (!leaveRecs.length) { el.innerHTML = '<p class="text-xs text-gray-400">No leave records.</p>'; return; }
            const isMobile = window.innerWidth < 768;
            if (isMobile) {
                el.innerHTML = leaveRecs.map(r => `
                    <div class="border rounded-lg p-3 mb-2 bg-orange-50 text-xs space-y-1">
                        <div class="flex justify-between">
                            <span class="font-semibold text-gray-700">${r.ATTEN_DATE ? fmtDate(r.ATTEN_DATE, 'input') : ''}</span>
                            <span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">${r.LEAVE_TYPE || 'Leave'}</span>
                        </div>
                        ${r.APPROVED_BY ? `<div class="text-gray-500">Approved by: ${r.APPROVED_BY}</div>` : '<div class="text-yellow-600">⏳ Pending approval</div>'}
                        ${r.REMARKS ? `<div class="text-gray-400 italic">${r.REMARKS}</div>` : ''}
                    </div>`).join('');
            } else {
                el.innerHTML = `
                    <table class="w-full text-xs">
                        <thead><tr class="bg-orange-50 text-gray-500">
                            <th class="p-1.5 text-left">Date</th>
                            <th class="p-1.5 text-left">Type</th>
                            <th class="p-1.5 text-left">Approved By</th>
                            <th class="p-1.5 text-left">Remarks</th>
                        </tr></thead>
                        <tbody>${leaveRecs.map(r => `
                            <tr class="border-b">
                                <td class="p-1.5">${r.ATTEN_DATE ? fmtDate(r.ATTEN_DATE, 'input') : ''}</td>
                                <td class="p-1.5"><span class="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">${r.LEAVE_TYPE || '—'}</span></td>
                                <td class="p-1.5">${r.APPROVED_BY || '<span class="text-yellow-600">Pending</span>'}</td>
                                <td class="p-1.5">${r.REMARKS || ''}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>`;
            }
        };

        // Initial render
        _activeTab === 'shifts' ? _renderShifts() : _renderLeaves();

        // Tab switching
        view.querySelector('#tabShifts').addEventListener('click', () => {
            _activeTab = 'shifts';
            view.querySelector('#tabShifts').className = 'px-4 py-2 text-sm font-medium border-b-2 border-purple-600 text-purple-700';
            view.querySelector('#tabLeaves').className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';
            _renderShifts();
        });
        view.querySelector('#tabLeaves').addEventListener('click', () => {
            _activeTab = 'leaves';
            view.querySelector('#tabLeaves').className = 'px-4 py-2 text-sm font-medium border-b-2 border-orange-500 text-orange-600';
            view.querySelector('#tabShifts').className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700';
            _renderLeaves();
        });
    }

    // ── Data ──────────────────────────────────────────────────────────────────
    function _loadData(data) {
        if (data?.STAFF)      _staff      = data.STAFF;
        if (data?.ATTENDANCE) _attendance = data.ATTENDANCE;
    }

    async function load() {
        if (!_initialized) {
            _initialized = true;
            window.addEventListener('appDataRefreshed', e => { _loadData(e.detail.data); _renderList(_staff); });
        }
        _injectListPane();
        const data = await getAppData();
        if (data) { _loadData(data); _renderList(_staff); }
        AdminPage.showDetail(false);
    }

    return { load, search };
})();

window.AdminShifts = AdminShifts;
