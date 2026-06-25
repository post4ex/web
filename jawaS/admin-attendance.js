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

        const today     = new Date().toISOString().split('T')[0];
        const attId     = `${s.STAFF_CODE}-${today}`;
        const existing  = _attendance[attId];
        const hasIn     = !!(existing?.IN_TIME);
        const hasOut    = !!(existing?.OUT_TIME);
        const canAdmin  = AdminPage.can('ADMIN');
        const canDelete = AdminPage.can('ADMIN');

        // ── View Mode: read-only summary ─────────────────────────────────────
        let viewContent = '';
        if (!hasIn && !hasOut) {
            viewContent = `
                <p class="text-sm text-gray-500 italic">No attendance recorded for today.</p>
                <button id="attRecordBtn" class="btn btn-sm mt-2">Record Attendance</button>`;
        } else if (hasIn && !hasOut) {
            viewContent = `
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div><span class="block text-xs font-semibold text-gray-500">Status</span><span class="text-sm">${existing.STATUS || '—'}</span></div>
                    <div><span class="block text-xs font-semibold text-gray-500">In Time</span><span class="text-sm">${existing.IN_TIME ? fmtDate(existing.IN_TIME, 'time') : '—'}</span></div>
                    <div><span class="block text-xs font-semibold text-gray-500">Shift</span><span class="text-sm">${existing.SHIFT || '—'}</span></div>
                    <div><span class="block text-xs font-semibold text-gray-500">Geo (In)</span><span class="text-sm font-mono text-xs">${existing.GEO_TAG_IN || '—'}</span></div>
                    ${existing.LATE_MINS ? `<div><span class="block text-xs font-semibold text-gray-500">Late</span><span class="text-sm text-orange-600">${parseFloat(existing.LATE_MINS)}m</span></div>` : ''}
                </div>
                <button id="attRecordOutBtn" class="btn btn-sm">Record Out Time</button>`;
        } else {
            viewContent = `
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div><span class="block text-xs font-semibold text-gray-500">Status</span><span class="text-sm">${existing.STATUS || '—'}</span></div>
                    <div><span class="block text-xs font-semibold text-gray-500">Shift</span><span class="text-sm">${existing.SHIFT || '—'}</span></div>
                    <div><span class="block text-xs font-semibold text-gray-500">In Time</span><span class="text-sm">${existing.IN_TIME ? fmtDate(existing.IN_TIME, 'time') : '—'}</span></div>
                    <div><span class="block text-xs font-semibold text-gray-500">Out Time</span><span class="text-sm">${existing.OUT_TIME ? fmtDate(existing.OUT_TIME, 'time') : '—'}</span></div>
                    <div><span class="block text-xs font-semibold text-gray-500">Geo (In)</span><span class="text-sm font-mono text-xs">${existing.GEO_TAG_IN || '—'}</span></div>
                    <div><span class="block text-xs font-semibold text-gray-500">Geo (Out)</span><span class="text-sm font-mono text-xs">${existing.GEO_TAG_OUT || '—'}</span></div>
                    ${existing.LATE_MINS ? `<div><span class="block text-xs font-semibold text-gray-500">Late</span><span class="text-sm text-orange-600">${parseFloat(existing.LATE_MINS)}m</span></div>` : ''}
                    ${existing.OVERTIME_HRS ? `<div><span class="block text-xs font-semibold text-gray-500">OT</span><span class="text-sm text-green-600">${parseFloat(existing.OVERTIME_HRS)}h</span></div>` : ''}
                    ${existing.APPROVED_BY ? `<div><span class="block text-xs font-semibold text-gray-500">Approved By</span><span class="text-sm">${existing.APPROVED_BY}</span></div>` : ''}
                </div>
                <div class="flex gap-2">
                    <button id="attModifyBtn" class="btn btn-sm">Modify Attendance</button>
                    ${canDelete ? '<button id="attDeleteBtn" class="btn-danger btn-sm">Delete Record</button>' : ''}
                </div>`;
        }

        // ── Edit Mode: form content ──────────────────────────────────────────
        let formContent = '';
        if (!hasIn && !hasOut) {
            // Full form: In Time + Status
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
                </div>
                <div class="col-span-2 sm:col-span-4">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
                    <input type="text" name="REMARKS" class="form-input text-sm" placeholder="Any notes…">
                </div>
                <div class="col-span-2 sm:col-span-4 flex justify-end">
                    <button type="submit" id="attSubmitBtn" class="btn btn-sm flex items-center gap-2">
                        <span id="attBtnText">Submit In Time</span>
                        <div id="attSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </button>
                </div>`;
        } else if (hasIn && !hasOut) {
            // Out Time form only
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
                    <input type="number" name="OVERTIME_HRS" min="0" step="0.5" value="${existing?.OVERTIME_HRS || ''}" class="form-input text-sm" ${!canAdmin ? 'disabled' : ''} placeholder="0">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Late Mins</label>
                    <input type="number" name="LATE_MINS" min="0" value="${existing?.LATE_MINS || ''}" class="form-input text-sm" ${!canAdmin ? 'disabled' : ''} placeholder="0">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Approved By</label>
                    <input type="text" name="APPROVED_BY" value="${existing?.APPROVED_BY || ''}" class="form-input text-sm" ${!canAdmin ? 'disabled' : ''} placeholder="Manager code">
                </div>
                <div class="col-span-2 sm:col-span-4">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
                    <input type="text" name="REMARKS" class="form-input text-sm" placeholder="Any notes…">
                </div>
                <div class="col-span-2 sm:col-span-4 flex justify-end">
                    <button type="submit" id="attSubmitBtn" class="btn btn-sm flex items-center gap-2">
                        <span id="attBtnText">Submit Out Time</span>
                        <div id="attSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </button>
                </div>`;
        } else {
            // Both done — edit mode for admins
            formContent = `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
                    <select name="STATUS" class="form-input text-sm">
                        ${ATT_STATUSES.map(o => `<option ${existing?.STATUS === o ? 'selected' : ''}>${o}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Shift</label>
                    <select name="SHIFT" class="form-input text-sm">
                        ${ATT_SHIFTS.map(o => `<option ${existing?.SHIFT === o ? 'selected' : ''}>${o}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Leave Type</label>
                    <select name="LEAVE_TYPE" class="form-input text-sm">
                        <option value="">N/A</option>
                        ${ATT_LEAVE_TYPES.map(o => `<option ${existing?.LEAVE_TYPE === o ? 'selected' : ''}>${o}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">In Time</label>
                    <input type="time" name="IN_TIME" value="${existing?.IN_TIME ? fmtDate(existing.IN_TIME, 'time') : ''}" class="form-input text-sm">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Out Time</label>
                    <input type="time" name="OUT_TIME" value="${existing?.OUT_TIME ? fmtDate(existing.OUT_TIME, 'time') : ''}" class="form-input text-sm">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Overtime Hrs</label>
                    <input type="number" name="OVERTIME_HRS" min="0" step="0.5" value="${existing?.OVERTIME_HRS || ''}" class="form-input text-sm" placeholder="0">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Late Mins</label>
                    <input type="number" name="LATE_MINS" min="0" value="${existing?.LATE_MINS || ''}" class="form-input text-sm" placeholder="0">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Approved By</label>
                    <input type="text" name="APPROVED_BY" value="${existing?.APPROVED_BY || ''}" class="form-input text-sm" placeholder="Manager code">
                </div>
                <div class="col-span-2 sm:col-span-4">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
                    <input type="text" name="REMARKS" value="${existing?.REMARKS || ''}" class="form-input text-sm" placeholder="Any notes…">
                </div>
                <div class="col-span-2 sm:col-span-4 flex justify-end">
                    <button type="submit" id="attSubmitBtn" class="btn btn-sm flex items-center gap-2">
                        <span id="attBtnText">Save Changes</span>
                        <div id="attSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </button>
                </div>`;
        }

        // ── Build HTML ───────────────────────────────────────────────────────
        view.innerHTML = `
            <div class="detail-card mode-view" id="attDetailCard">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h2 class="text-base font-bold text-gray-800">${s.STAFF_NAME || s.STAFF_CODE} <span class="text-xs font-normal text-gray-400">${s.BRANCH || ''}</span></h2>
                        <p class="text-xs text-gray-400">${today}</p>
                    </div>
                    <button id="attCancelBtn" class="edit-only btn-ghost btn-sm">Cancel</button>
                </div>
                <div class="detail-card-body space-y-4">
                    <div class="view-only">${viewContent}</div>
                    <form id="attForm" class="edit-only grid grid-cols-2 sm:grid-cols-4 gap-3">
                        ${formContent}
                    </form>
                    <div id="attHistory"></div>
                </div>
            </div>

            <!-- Delete Confirmation Modal -->
            <div id="attDeleteModal" class="modal-overlay hidden">
                <div class="modal-content text-center">
                    <h2 class="text-xl font-semibold text-gray-800 mb-4">Delete Attendance Record</h2>
                    <p class="text-gray-600 mb-6">Are you sure you want to delete attendance for <strong>${s.STAFF_NAME || s.STAFF_CODE}</strong> on ${today}? This cannot be undone.</p>
                    <div class="flex justify-center gap-4">
                        <button id="attCancelDeleteBtn" class="btn-ghost px-6 py-2">Cancel</button>
                        <button id="attConfirmDeleteBtn" class="btn-danger px-6 py-2 flex items-center disabled:opacity-45">
                            <span>Confirm Delete</span>
                            <div id="attDeleteSpinner" class="hidden ml-3 w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                        </button>
                    </div>
                </div>
            </div>`;

        _renderHistory(s.STAFF_CODE);

        // ── Wire View Mode Events ────────────────────────────────────────────
        // Record Attendance (no record yet)
        view.querySelector('#attRecordBtn')?.addEventListener('click', () => {
            const card = document.getElementById('attDetailCard');
            if (card) card.className = 'detail-card mode-edit';
            view.querySelector('#attNowIn')?.addEventListener('click', () => _setNow(view.querySelector('#attInTime'), view.querySelector('#attGeoIn'), view.querySelector('#attDistIn'), s));
        });

        // Record Out Time (In done, Out pending)
        view.querySelector('#attRecordOutBtn')?.addEventListener('click', () => {
            const card = document.getElementById('attDetailCard');
            if (card) card.className = 'detail-card mode-edit';
            view.querySelector('#attNowOut')?.addEventListener('click', () => _setNow(view.querySelector('#attOutTime'), view.querySelector('#attGeoOut'), view.querySelector('#attDistOut'), s));
        });

        // Modify Attendance (both In & Out done)
        view.querySelector('#attModifyBtn')?.addEventListener('click', () => {
            const card = document.getElementById('attDetailCard');
            if (card) card.className = 'detail-card mode-edit';
        });

        // Cancel → back to view mode
        view.querySelector('#attCancelBtn')?.addEventListener('click', () => {
            _renderDetail(s);
        });

        // Delete Record
        view.querySelector('#attDeleteBtn')?.addEventListener('click', () => {
            document.getElementById('attDeleteModal').classList.remove('hidden');
        });

        // Delete modal: Cancel
        view.querySelector('#attCancelDeleteBtn')?.addEventListener('click', () => {
            document.getElementById('attDeleteModal').classList.add('hidden');
        });

        // Delete modal: Confirm
        view.querySelector('#attConfirmDeleteBtn')?.addEventListener('click', async () => {
            const spn = view.querySelector('#attDeleteSpinner');
            const btn = view.querySelector('#attConfirmDeleteBtn');
            btn.disabled = true; spn.classList.remove('hidden');
            try {
                await callApi('/api/deleteAttendance', { record_id: existing?.id }, 'POST');
                delete _attendance[attId];
                document.getElementById('attDeleteModal').classList.add('hidden');
                _renderDetail(s);
                showNotification('✅ Attendance record deleted', 'success');
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            } finally {
                btn.disabled = false; spn.classList.add('hidden');
            }
        });

        // ── Wire Edit Mode Form Submit ───────────────────────────────────────
        if (hasOut) {
            // Both done — form already has all fields, just handle submit
            view.querySelector('#attForm').addEventListener('submit', async e => {
                e.preventDefault();
                const raw = Object.fromEntries(new FormData(e.target));
                const toTimeMs = (hhmm) => {
                    if (!hhmm) return 0;
                    const [h, m] = hhmm.split(':').map(Number);
                    const d = new Date(today); d.setHours(h, m, 0, 0);
                    return d.getTime();
                };
                const data = {
                    IN_TIME:       toTimeMs(raw.IN_TIME),
                    OUT_TIME:      toTimeMs(raw.OUT_TIME),
                    STATUS:        raw.STATUS,
                    SHIFT:         raw.SHIFT || '',
                    LEAVE_TYPE:    raw.LEAVE_TYPE || '',
                    OVERTIME_HRS:  parseFloat(raw.OVERTIME_HRS) || 0,
                    LATE_MINS:     parseInt(raw.LATE_MINS) || 0,
                    APPROVED_BY:   raw.APPROVED_BY || '',
                    REMARKS:       raw.REMARKS || '',
                    GEO_TAG_IN:    existing?.GEO_TAG_IN  || '',
                    GEO_TAG_OUT:   existing?.GEO_TAG_OUT || '',
                    IN_TIME_DIST:  existing?.IN_TIME_DIST  || 0,
                    OUT_TIME_DIST: existing?.OUT_TIME_DIST || 0,
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
                    const res = await callApi('/api/writeAttendance', { data, record_id: existing?.id }, 'POST');
                    _attendance[attId] = res.record || { ...existing, ...data };
                    _renderDetail(s);
                    showNotification('✅ Attendance updated', 'success');
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                    btn.disabled = false; txt.textContent = 'Save Changes'; spn.classList.add('hidden');
                }
            });
        } else {
            // Not yet complete — GPS form (same as original logic)
            if (!hasIn) {
                view.querySelector('#attNowIn')?.addEventListener('click', () => _setNow(view.querySelector('#attInTime'), view.querySelector('#attGeoIn'), view.querySelector('#attDistIn'), s));
            } else {
                view.querySelector('#attNowOut')?.addEventListener('click', () => _setNow(view.querySelector('#attOutTime'), view.querySelector('#attGeoOut'), view.querySelector('#attDistOut'), s));
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
                    const payload = { data };
                    if (existing?.id) payload.record_id = existing.id;
                    const res = await callApi('/api/writeAttendance', payload, 'POST');
                    _attendance[attId] = res.record || { ...existing, ...data };
                    _renderDetail(s);
                    showNotification('✅ Attendance saved', 'success');
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                    btn.disabled = false; txt.textContent = hasIn ? 'Submit Out Time' : 'Submit In Time'; spn.classList.add('hidden');
                }
            });
        }
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
