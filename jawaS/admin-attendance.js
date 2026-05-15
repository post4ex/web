// ============================================================================
// ADMIN-ATTENDANCE.JS — Attendance tile: select staff → record + history
// Min role: STAFF
// ============================================================================

const AdminAttendance = (() => {

    let _staff      = {};
    let _attendance = {};
    let _branches   = {};
    let _selected   = null;
    let _initialized = false;

    const ATT_STATUSES    = ['Present', 'Absent', 'Half Day', 'Leave'];
    const ATT_SHIFTS      = ['Morning', 'Evening', 'Night'];
    const ATT_LEAVE_TYPES = ['Sick', 'Casual', 'Earned', 'Unpaid'];


    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        const listPane = document.getElementById('adminList');
        const listMsg  = document.getElementById('listMsg');
        if (listMsg) listMsg.classList.add('hidden');
        if (listPane) listPane.innerHTML = `<ul id="attStaffList" class="space-y-2"></ul>`;
        const searchEl = document.getElementById('listSearch');
        if (searchEl) searchEl.placeholder = 'Search staff…';
    }

    function _renderList(staff) {
        const ul = document.getElementById('attStaffList');
        if (!ul) return;
        const items = Object.values(staff || {}).filter(s => s.STATUS !== 'Resigned');
        if (!items.length) { ul.innerHTML = '<li class="text-center text-gray-500 text-sm py-4">No staff found.</li>'; return; }
        items.sort((a, b) => (a.STAFF_CODE > b.STAFF_CODE ? 1 : -1));
        ul.innerHTML = items.map(s => `
            <li data-code="${s.STAFF_CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-green-50 transition-colors border border-gray-200 ${_selected === s.STAFF_CODE ? 'bg-green-100 border-green-300' : ''}">
                <strong class="text-green-700 block text-sm">${s.STAFF_CODE}</strong>
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

        const today   = new Date().toISOString().split('T')[0];
        const attId   = `${s.STAFF_CODE}-${today}`;
        const existing = _attendance[attId];

        const hasIn  = !!(existing?.IN_TIME);
        const hasOut = !!(existing?.OUT_TIME);

        // Determine what to show
        let formContent = '';
        if (hasOut) {
            // Both done — nothing to fill
            formContent = `<p class="text-sm text-green-700 font-medium">✅ Attendance complete for today.</p>`;
        } else if (hasIn) {
            // In done — show Out Time only
            const canApprove = AdminPage.can('ADMIN');
            formContent = `
                <div class="relative">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Out Time</label>
                    <input type="time" name="OUT_TIME" id="attOutTime" class="form-input text-sm pr-10" readonly>
                    <input type="hidden" name="GEO_TAG_OUT_TIME" id="attGeoOut">
                    <input type="hidden" name="OUT_TIME_DIST"    id="attDistOut">
                    <button type="button" id="attNowOut" class="absolute right-1 bottom-1 text-xs bg-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-300">Now</button>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Overtime Hrs</label>
                    <input type="number" name="OVERTIME_HRS" min="0" step="0.5" value="${existing?.OVERTIME_HRS || ''}" class="form-input text-sm" ${!canApprove ? 'disabled' : ''} placeholder="0">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Late Mins</label>
                    <input type="number" name="LATE_MINS" min="0" value="${existing?.LATE_MINS || ''}" class="form-input text-sm" ${!canApprove ? 'disabled' : ''} placeholder="0">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Approved By</label>
                    <input type="text" name="APPROVED_BY" value="${existing?.APPROVED_BY || ''}" class="form-input text-sm" ${!canApprove ? 'disabled' : ''} placeholder="Manager code">
                </div>`;
        } else {
            // Nothing yet — show In Time + Status only
            formContent = `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
                    <select name="STATUS" class="form-input text-sm">
                        ${ATT_STATUSES.map(o => `<option>${o}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Shift</label>
                    <select name="SHIFT" class="form-input text-sm">
                        ${ATT_SHIFTS.map(o => `<option>${o}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Leave Type</label>
                    <select name="LEAVE_TYPE" class="form-input text-sm">
                        <option value="">N/A</option>
                        ${ATT_LEAVE_TYPES.map(o => `<option>${o}</option>`).join('')}
                    </select>
                </div>
                <div class="relative">
                    <label class="block text-xs font-medium text-gray-600 mb-1">In Time</label>
                    <input type="time" name="IN_TIME" id="attInTime" class="form-input text-sm pr-10" readonly>
                    <input type="hidden" name="GEO_TAG_IN_TIME" id="attGeoIn">
                    <input type="hidden" name="IN_TIME_DIST"    id="attDistIn">
                    <button type="button" id="attNowIn" class="absolute right-1 bottom-1 text-xs bg-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-300">Now</button>
                </div>`;
        }

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header">
                    <h2 class="text-base font-bold text-gray-800">${s.STAFF_NAME || s.STAFF_CODE} <span class="text-xs font-normal text-gray-400">${s.BRANCH || ''}</span></h2>
                    <p class="text-xs text-gray-400">${today}</p>
                </div>
                <div class="detail-card-body space-y-4">
                    <form id="attForm" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        ${formContent}
                        ${!hasOut ? `
                        <div class="col-span-2 sm:col-span-4">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
                            <input type="text" name="REMARKS" class="form-input text-sm" placeholder="Any notes…">
                        </div>
                        <div class="col-span-2 sm:col-span-4 flex justify-end">
                            <button type="submit" id="attSubmitBtn" class="btn btn-sm flex items-center gap-2">
                                <span id="attBtnText">${hasIn ? 'Submit Out Time' : 'Submit In Time'}</span>
                                <div id="attSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>` : ''}
                    </form>
                    <div id="attHistory"></div>
                </div>
            </div>`;

        _renderHistory(s.STAFF_CODE);

        if (hasOut) return;

        if (hasIn) {
            view.querySelector('#attNowOut').addEventListener('click', () => _setNow(view.querySelector('#attOutTime'), view.querySelector('#attGeoOut'), view.querySelector('#attDistOut'), s));
        } else {
            view.querySelector('#attNowIn').addEventListener('click', () => _setNow(view.querySelector('#attInTime'), view.querySelector('#attGeoIn'), view.querySelector('#attDistIn'), s));
        }

        view.querySelector('#attForm').addEventListener('submit', async e => {
            e.preventDefault();

            if (!navigator.geolocation) {
                showNotification('❌ GPS not available on this device. Attendance cannot be submitted.', 'error');
                return;
            }

            const raw = Object.fromEntries(new FormData(e.target));

            if (!hasIn) {
                if (!raw.IN_TIME) {
                    showNotification('❌ Use the "Now" button to record In Time.', 'error');
                    return;
                }
                if (!raw.GEO_TAG_IN_TIME || raw.GEO_TAG_IN_TIME === 'Unavailable') {
                    showNotification('❌ GPS location required. Use the "Now" button.', 'error');
                    return;
                }
            } else {
                if (!raw.OUT_TIME) {
                    showNotification('❌ Use the "Now" button to record Out Time.', 'error');
                    return;
                }
                if (!raw.GEO_TAG_OUT_TIME || raw.GEO_TAG_OUT_TIME === 'Unavailable') {
                    showNotification('❌ GPS location required. Use the "Now" button.', 'error');
                    return;
                }
            }

            const toTimeMs = (hhmm) => {
                if (!hhmm) return 0;
                const [h, m] = hhmm.split(':').map(Number);
                const d = new Date(today); d.setHours(h, m, 0, 0);
                return d.getTime();
            };

            const data = hasIn ? {
                // Patch: out time only
                OUT_TIME:      toTimeMs(raw.OUT_TIME),
                GEO_TAG_OUT:   raw.GEO_TAG_OUT_TIME || '',
                OUT_TIME_DIST: parseFloat(raw.OUT_TIME_DIST) || 0,
                OVERTIME_HRS:  parseFloat(raw.OVERTIME_HRS) || 0,
                LATE_MINS:     parseInt(raw.LATE_MINS) || 0,
                APPROVED_BY:   raw.APPROVED_BY || '',
                REMARKS:       raw.REMARKS || '',
                STAFF_CODE:    s.STAFF_CODE,
                STAFF_NAME:    s.STAFF_NAME,
                BRANCH:        s.BRANCH,
                ATTENDANCE_ID: attId,
            } : {
                // Create: in time + status
                IN_TIME:       toTimeMs(raw.IN_TIME),
                GEO_TAG_IN:    raw.GEO_TAG_IN_TIME || '',
                IN_TIME_DIST:  parseFloat(raw.IN_TIME_DIST) || 0,
                STATUS:        raw.STATUS,
                SHIFT:         raw.SHIFT || '',
                LEAVE_TYPE:    raw.LEAVE_TYPE || '',
                REMARKS:       raw.REMARKS || '',
                ATTEN_DATE:    new Date(today).getTime(),
                STAFF_CODE:    s.STAFF_CODE,
                STAFF_NAME:    s.STAFF_NAME,
                BRANCH:        s.BRANCH,
                ATTENDANCE_ID: attId,
            };

            const btn = view.querySelector('#attSubmitBtn');
            const txt = view.querySelector('#attBtnText');
            const spn = view.querySelector('#attSpinner');
            btn.disabled = true; txt.textContent = 'Submitting…'; spn.classList.remove('hidden');
            try {
                const payload = { collection: 'ATTENDANCE', data };
                if (existing?.id) payload.record_id = existing.id;
                const res = await callApi('/api/write', payload);
                _attendance[attId] = res.record || { ...existing, ...data };
                _renderDetail(s);  // re-render to reflect new state
                showNotification('✅ Attendance saved', 'success');
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
                btn.disabled = false; txt.textContent = hasIn ? 'Submit Out Time' : 'Submit In Time'; spn.classList.add('hidden');
            }
        });
    }

    function _renderHistory(staffCode) {
        const el = document.getElementById('attHistory');
        if (!el) return;
        const recs = Object.values(_attendance)
            .filter(r => r.STAFF_CODE === staffCode)
            .sort((a, b) => (b.ATTEN_DATE > a.ATTEN_DATE ? 1 : -1))
            .slice(0, 15);
        if (!recs.length) { el.innerHTML = '<p class="text-xs text-gray-400">No recent records.</p>'; return; }
        // Desktop: table | Mobile: cards
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            el.innerHTML = recs.map(r => `
                <div class="border rounded-lg p-3 mb-2 bg-white text-xs space-y-1">
                    <div class="flex justify-between items-center">
                        <span class="font-semibold text-gray-700">${r.ATTEN_DATE ? fmtDate(r.ATTEN_DATE, 'input') : ''}</span>
                        <span class="px-2 py-0.5 rounded-full text-white text-xs font-medium" style="background:${r.STATUS==='Present'?'#16a34a':r.STATUS==='Absent'?'#dc2626':r.STATUS==='Half Day'?'#d97706':'#6b7280'}">${r.STATUS || ''}</span>
                    </div>
                    <div class="flex gap-4 text-gray-600">
                        <span>🕐 In: <strong>${r.IN_TIME  ? fmtDate(r.IN_TIME,  'time') : '—'}</strong></span>
                        <span>🕔 Out: <strong>${r.OUT_TIME ? fmtDate(r.OUT_TIME, 'time') : '—'}</strong></span>
                    </div>
                    <div class="flex gap-4 text-gray-500">
                        ${r.SHIFT        ? `<span>Shift: ${r.SHIFT}</span>` : ''}
                        ${r.LATE_MINS    ? `<span>Late: ${parseFloat(r.LATE_MINS)}m</span>` : ''}
                        ${r.OVERTIME_HRS ? `<span>OT: ${parseFloat(r.OVERTIME_HRS)}h</span>` : ''}
                    </div>
                    ${r.APPROVED_BY ? `<div class="text-gray-400">Approved: ${r.APPROVED_BY}</div>` : ''}
                    ${r.REMARKS     ? `<div class="text-gray-400 italic">${r.REMARKS}</div>` : ''}
                </div>`).join('');
        } else {
            el.innerHTML = `
            <table class="w-full text-xs">
                <thead><tr class="bg-gray-50 text-gray-500">
                    <th class="p-1.5 text-left">Date</th>
                    <th class="p-1.5 text-left">Status</th>
                    <th class="p-1.5 text-left">Shift</th>
                    <th class="p-1.5 text-left">In</th>
                    <th class="p-1.5 text-left">Out</th>
                    <th class="p-1.5 text-left">Late</th>
                    <th class="p-1.5 text-left">OT</th>
                    <th class="p-1.5 text-left">Approved</th>
                    <th class="p-1.5 text-left">Remarks</th>
                </tr></thead>
                <tbody>${recs.map(r => `
                    <tr class="border-b">
                        <td class="p-1.5">${r.ATTEN_DATE ? fmtDate(r.ATTEN_DATE, 'input') : ''}</td>
                        <td class="p-1.5">${r.STATUS || ''}</td>
                        <td class="p-1.5">${r.SHIFT || ''}</td>
                        <td class="p-1.5">${r.IN_TIME  ? fmtDate(r.IN_TIME,  'time') : ''}</td>
                        <td class="p-1.5">${r.OUT_TIME ? fmtDate(r.OUT_TIME, 'time') : ''}</td>
                        <td class="p-1.5">${r.LATE_MINS    ? parseFloat(r.LATE_MINS)    : ''}</td>
                        <td class="p-1.5">${r.OVERTIME_HRS ? parseFloat(r.OVERTIME_HRS) : ''}</td>
                        <td class="p-1.5">${r.APPROVED_BY   || ''}</td>
                        <td class="p-1.5">${r.REMARKS || ''}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
        }
    }

    function _setNow(timeInput, geoInput, distInput, staffMember) {
        timeInput.removeAttribute('readonly');
        timeInput.value = new Date().toTimeString().slice(0, 5);
        timeInput.setAttribute('readonly', true);
        timeInput.dispatchEvent(new Event('input'));
        geoGetPosition({
            onStart:   () => {},
            onSuccess: coords => {
                geoInput.value = coords;
                const branch = _branches[staffMember?.BRANCH];
                if (!branch?.BRANCH_GEO_TEG) return;
                const dist = geoCalcDistance(coords, branch.BRANCH_GEO_TEG);
                if (dist !== null) distInput.value = dist;
            },
            onError: msg => {
                geoInput.value = 'Unavailable';
                showNotification('⚠️ ' + msg, 'warning');
            },
            decimals: 5,
        });
    }

    // ── Data ──────────────────────────────────────────────────────────────────
    function _loadData(data) {
        if (data?.STAFF)      _staff      = data.STAFF;
        if (data?.ATTENDANCE) _attendance = data.ATTENDANCE;
        if (data?.BRANCHES)   _branches   = data.BRANCHES;
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

    return { load, search };
})();

window.AdminAttendance = AdminAttendance;
