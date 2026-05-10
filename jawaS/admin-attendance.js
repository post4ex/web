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

    const ATT_STATUSES = ['Present', 'Absent', 'Half Day', 'Leave'];

    // ── Distance calc ─────────────────────────────────────────────────────────
    function _calcDistance(lat1, lon1, lat2, lon2) {
        if ([lat1, lon1, lat2, lon2].some(isNaN)) return null;
        const R = 6371, toRad = d => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
        return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(2);
    }

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
        document.getElementById('adminDetailPane')?.classList.add('mobile-show');
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
            formContent = `
                <div class="relative">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Out Time</label>
                    <input type="time" name="OUT_TIME" id="attOutTime" class="form-input text-sm pr-10" readonly>
                    <input type="hidden" name="GEO_TAG_OUT_TIME" id="attGeoOut">
                    <input type="hidden" name="OUT_TIME_DIST"    id="attDistOut">
                    <button type="button" id="attNowOut" class="absolute right-1 bottom-1 text-xs bg-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-300">Now</button>
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
                            <button type="submit" id="attSubmitBtn" class="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center gap-2">
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
        el.innerHTML = `
            <table class="w-full text-xs">
                <thead><tr class="bg-gray-50 text-gray-500">
                    <th class="p-1.5 text-left">Date</th><th class="p-1.5 text-left">Status</th>
                    <th class="p-1.5 text-left">In</th><th class="p-1.5 text-left">Dist</th>
                    <th class="p-1.5 text-left">Out</th><th class="p-1.5 text-left">Dist</th>
                    <th class="p-1.5 text-left">Remarks</th>
                </tr></thead>
                <tbody>${recs.map(r => `
                    <tr class="border-b">
                        <td class="p-1.5">${r.ATTEN_DATE ? fmtDate(r.ATTEN_DATE, 'input') : ''}</td>
                        <td class="p-1.5">${r.STATUS || ''}</td>
                        <td class="p-1.5">${r.IN_TIME  ? fmtDate(r.IN_TIME,  'time') : ''}</td>
                        <td class="p-1.5">${r.IN_TIME_DIST  || ''}</td>
                        <td class="p-1.5">${r.OUT_TIME ? fmtDate(r.OUT_TIME, 'time') : ''}</td>
                        <td class="p-1.5">${r.OUT_TIME_DIST || ''}</td>
                        <td class="p-1.5">${r.REMARKS || ''}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    }

    function _setNow(timeInput, geoInput, distInput, staffMember) {
        if (timeInput.readOnly) { showNotification('Record In Time first.', 'info'); return; }
        timeInput.value = new Date().toTimeString().slice(0, 5);
        timeInput.dispatchEvent(new Event('input'));
        if (!navigator.geolocation) { geoInput.value = 'Not Supported'; return; }
        navigator.geolocation.getCurrentPosition(pos => {
            const coords = `${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`;
            geoInput.value = coords;
            const branch = _branches[staffMember?.BRANCH];
            if (!branch?.BRANCH_GEO_TEG) return;
            const [sLat, sLon] = coords.split(',').map(Number);
            const [bLat, bLon] = branch.BRANCH_GEO_TEG.split(',').map(Number);
            const dist = _calcDistance(sLat, sLon, bLat, bLon);
            if (dist !== null) distInput.value = dist;
        }, err => {
            geoInput.value = 'Unavailable';
            const msg = err.code === 1 ? 'Location permission denied — allow it in browser settings.' : 'Could not get location. Try again.';
            showNotification('⚠️ ' + msg, 'warning');
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
