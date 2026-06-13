// ============================================================================
// ADMIN-STAFF.JS — Staff list + detail form (add/edit/delete)
// Attendance is handled separately in admin-attendance.js
// Role gates: Save/Delete → ADMIN+
// ============================================================================

const AdminStaff = (() => {

    // Validation helpers — delegate to global InputValidator
    const _validate = {
        pan:    (v) => InputValidator.pan(v),
        aadhar: (v) => InputValidator.aadhar(v),
        pin:    (v) => InputValidator.pin(v),
        mobile: (v) => InputValidator.mobile(v),
        ifsc:   (v) => InputValidator.ifsc(v),
        age18:  (v) => InputValidator.age18(v),
    };

    function _showFieldError(input, msg) {
        input.classList.add('border-red-500');
        let err = input.nextElementSibling;
        if (!err || !err.classList.contains('field-error')) {
            err = document.createElement('p');
            err.className = 'field-error text-xs text-red-600 mt-1';
            input.parentNode.appendChild(err);
        }
        err.textContent = msg;
    }

    function _clearFieldError(input) {
        input.classList.remove('border-red-500');
        const err = input.nextElementSibling;
        if (err && err.classList.contains('field-error')) err.remove();
    }

    let _staff       = {};
    let _branches    = {};
    let _selected    = null;
    let _initialized = false;

    const STAFF_STATUSES  = ['Active', 'Inactive', 'Resigned', 'On Leave'];
    const STAFF_ROLES     = ['Delivery Executive', 'Manager', 'Admin', 'Operations'];
    const STAFF_DEPTS     = ['Operations', 'Sales', 'Human Resources', 'Finance'];
    const STAFF_GENDERS   = ['Male', 'Female', 'Other'];
    const STAFF_BLOOD     = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

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
        AdminPage.showDetailPane();
    }

    function openAddPane() {
        _selected = null;
        _renderList(_staff);
        _renderDetail(null);
        AdminPage.showDetail(true);
        AdminPage.showDetailPane();
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
                    ${isEdit && canDelete ? `<button id="staffDeleteBtn" class="btn-danger btn-sm">Delete</button>` : ''}
                </div>
                <div class="detail-card-body">
                    ${isEdit && canDelete ? `
                    <div id="staffDeleteConfirm" class="hidden mb-4 border border-red-200 bg-red-50 rounded-lg p-4">
                        <p class="text-sm text-red-700 font-medium mb-3">Delete <strong>${s?.STAFF_NAME || ''} (${s?.STAFF_CODE || ''})</strong>?<br>
                        <span class="text-xs text-gray-500">This will permanently remove the staff record.</span></p>
                        <div class="flex gap-3 items-center flex-wrap">
                            <button id="staffConfirmDeleteBtn" class="btn-danger btn-sm flex items-center gap-1">
                                Confirm Delete
                                <div id="staffDeleteSpinner" class="hidden w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                            <button id="staffCancelDeleteBtn" class="btn-ghost btn-sm">Cancel</button>
                        </div>
                    </div>` : ''}
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
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Gender</label>
                            <select name="GENDER" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                                <option value="">Select Gender</option>
                                ${STAFF_GENDERS.map(o => `<option ${s?.GENDER === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Blood Group</label>
                            <select name="BLOOD_GROUP" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                                <option value="">Select Blood Group</option>
                                ${STAFF_BLOOD.map(o => `<option ${s?.BLOOD_GROUP === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Mobile *</label>
                            <div class="flex gap-2">
                                <input name="MOBILE_CC" value="91" class="form-input text-sm" style="width:5rem;flex-shrink:0" placeholder="CC" maxlength="3" ${!canEdit ? 'disabled' : ''}>
                                <input name="MOBILE_NUM" value="${(s?.MOBILE||'').replace(/^91/, '')}" required class="form-input text-sm flex-1" placeholder="Number" data-validate="mobile" ${!canEdit ? 'disabled' : ''}>
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                            <input name="EMAIL" type="email" required value="${s?.EMAIL || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Emergency Contact Mobile</label>
                            <div class="flex gap-2">
                                <input id="sfEmergencyCC" value="91" class="form-input text-sm" style="width:5rem;flex-shrink:0" placeholder="CC" maxlength="3" ${!canEdit ? 'disabled' : ''}>
                                <input id="sfEmergencyNum" type="tel" value="${(s?.EMERGENCY_CONTACT||'').replace(/^91/, '')}" class="form-input text-sm flex-1" placeholder="Number" data-validate="mobile" ${!canEdit ? 'disabled' : ''}>
                            </div>
                            <input type="hidden" name="EMERGENCY_CONTACT" id="sfEmergencyContact" value="${s?.EMERGENCY_CONTACT || ''}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Aadhar Number</label>
                            <input name="ADHAR_NUM" id="sfAdhar" value="${s?.ADHAR_NUM || ''}" maxlength="12" class="form-input text-sm" data-validate="aadhar" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">PAN Number</label>
                            <input name="PAN_NUM" value="${s?.PAN_NUM || ''}" maxlength="10" class="form-input text-sm" data-validate="pan" data-uppercase ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Father's Name</label>
                            <input name="FATHERS_NAME" value="${s?.FATHERS_NAME || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date of Birth</label>
                            <input name="DATE_BIRTH" id="sfDob" type="date" value="${s?.DATE_BIRTH ? fmtDate(s.DATE_BIRTH, 'input') : ''}" class="form-input text-sm" data-validate="age18" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date of Joining</label>
                            <input name="DATE_JOIN" type="date" value="${s?.DATE_JOIN ? fmtDate(s.DATE_JOIN, 'input') : ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date of Leaving</label>
                            <input name="DATE_LEAVE" type="date" value="${s?.DATE_LEAVE ? fmtDate(s.DATE_LEAVE, 'input') : ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
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
                            <label class="block text-xs font-medium text-gray-600 mb-1">UAN</label>
                            <input name="UAN" value="${s?.UAN || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Bank Account</label>
                            <input name="BANK_AC" value="${s?.BANK_AC || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Bank IFSC</label>
                            <input name="BANK_IFSC" value="${s?.BANK_IFSC || ''}" maxlength="11" class="form-input text-sm" data-validate="ifsc" data-uppercase ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Bank Name</label>
                            <input name="BANK_NAME" value="${s?.BANK_NAME || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Driving License</label>
                            <input name="DRIVING_LICENSE" value="${s?.DRIVING_LICENSE || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Vehicle Number</label>
                            <input name="VEHICLE_NUM" value="${s?.VEHICLE_NUM || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Address</label>
                            <input name="ADDRESS" value="${s?.ADDRESS || ''}" class="form-input text-sm" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div class="relative">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Pincode *</label>
                            <input name="PINCODE" id="sfPincode" required value="${s?.PINCODE || ''}" maxlength="6" class="form-input text-sm" data-validate="pin" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">City</label>
                            <input name="CITY" id="sfCity" value="${s?.CITY || ''}" class="form-input text-sm">
                        </div>
                        <div class="sm:col-span-2 grid grid-cols-3 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">State</label>
                                <input name="STATE" id="sfState" value="${s?.STATE || ''}" class="form-input text-sm">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Code State</label>
                                <input name="CODE_STATE" value="${s?.CODE_STATE || ''}" class="form-input text-sm" maxlength="2">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">GST Code</label>
                                <input name="GST_CODE" value="${s?.GST_CODE || ''}" class="form-input text-sm" maxlength="2" data-uppercase>
                            </div>
                        </div>
                        ${canEdit ? `
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm">
                                ${isEdit ? 'Save Changes' : 'Create Staff'}
                            </button>
                        </div>` : ''}
                    </form>
                </div>
            </div>`;

        // ── OTP helper ────────────────────────────────────────────────────
        const _staffOtp = (staffCode, action) => new Promise((resolve, reject) => {
            const existing = document.getElementById('staffOtpModal');
            if (existing) existing.remove();
            const labels = { new_staff: 'New Staff', update_staff: 'Update Staff', delete_staff: 'Delete Staff' };
            const modal = document.createElement('div');
            modal.id = 'staffOtpModal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
                    <h3 class="text-base font-bold text-gray-800 mb-1">Confirm: ${labels[action] || action}</h3>
                    <p class="text-xs text-gray-500 mb-4">Staff: <strong>${staffCode}</strong> &mdash; OTP sent to your email &amp; WhatsApp.</p>
                    <div id="staffOtpMsg" class="hidden mb-3 p-2 rounded text-xs text-center"></div>
                    <input id="staffOtpInput" type="text" maxlength="6" placeholder="Enter 6-digit OTP"
                        class="form-input w-full text-center text-lg tracking-widest mb-4">
                    <div class="flex gap-3">
                        <button id="staffOtpVerifyBtn" class="btn flex-1 flex items-center justify-center gap-2">
                            <span>Verify &amp; Proceed</span><div id="staffOtpSpinner" class="spinner hidden"></div>
                        </button>
                        <button id="staffOtpCancelBtn" class="btn-ghost btn-sm">Cancel</button>
                    </div>
                    <button id="staffOtpResendBtn" class="mt-3 w-full text-xs text-indigo-600 hover:underline">Resend OTP</button>
                </div>`;
            document.body.appendChild(modal);
            const msgEl = modal.querySelector('#staffOtpMsg');
            const showMsg = (t, type) => { msgEl.textContent = t; msgEl.className = `mb-3 p-2 rounded text-xs text-center ${type==='error'?'bg-red-100 text-red-700':'bg-green-100 text-green-700'}`; msgEl.classList.remove('hidden'); };
            const sendOtp = async () => {
                const rb = modal.querySelector('#staffOtpResendBtn');
                rb.disabled = true; rb.textContent = 'Sending…';
                try { await callApi('/api/sendStaffOtp', { STAFF_CODE: staffCode, action }, 'POST'); showMsg('OTP sent to your email & WhatsApp.', 'success'); }
                catch (e) { showMsg(e.message, 'error'); }
                finally { rb.disabled = false; rb.textContent = 'Resend OTP'; }
            };
            modal.querySelector('#staffOtpVerifyBtn').addEventListener('click', async () => {
                const otp = modal.querySelector('#staffOtpInput').value.trim();
                if (otp.length !== 6) { showMsg('Enter the 6-digit OTP.', 'error'); return; }
                const vb = modal.querySelector('#staffOtpVerifyBtn'); const sp = modal.querySelector('#staffOtpSpinner');
                vb.disabled = true; sp.classList.remove('hidden');
                try { const r = await callApi('/api/verifyStaffOtp', { STAFF_CODE: staffCode, action, otp }, 'POST'); modal.remove(); resolve(r.write_token); }
                catch (e) { showMsg(e.message, 'error'); vb.disabled = false; sp.classList.add('hidden'); }
            });
            modal.querySelector('#staffOtpCancelBtn').addEventListener('click', () => { modal.remove(); reject(new Error('cancelled')); });
            modal.querySelector('#staffOtpResendBtn').addEventListener('click', sendOtp);
            modal.querySelector('#staffOtpInput').addEventListener('keydown', e => { if (e.key === 'Enter') modal.querySelector('#staffOtpVerifyBtn').click(); });
            sendOtp();
        });

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

        // auto-uppercase inputs
        if (canEdit) {
            view.querySelectorAll('[data-uppercase]').forEach(input => {
                input.addEventListener('input', () => {
                    const pos = input.selectionStart;
                    input.value = input.value.toUpperCase();
                    input.setSelectionRange(pos, pos);
                });
            });
        }

        // pincode auto-fill
        if (canEdit) {
            let _pt;
            const pinInput = view.querySelector('#sfPincode');
            pinInput?.addEventListener('input', e => {
                clearTimeout(_pt);
                if (e.target.value.length === 6) {
                    if (_validate.pin(e.target.value)) {
                        _clearFieldError(pinInput);
                        _pt = setTimeout(() => _fetchPincode(e.target.value, view), 400);
                    } else {
                        _showFieldError(pinInput, 'Invalid pincode format');
                    }
                }
            });
        }

        // Real-time validation for all fields
        if (canEdit) {
            view.querySelectorAll('[data-validate]').forEach(input => {
                input.addEventListener('blur', () => {
                    const type = input.dataset.validate;
                    const val = input.value.trim();
                    if (val && !_validate[type](val)) {
                        const labels = {
                            pan:    'Invalid PAN format (e.g., ABCDE1234F)',
                            aadhar: 'Invalid Aadhar (12 digits required)',
                            pin:    'Invalid pincode format',
                            mobile: 'Mobile must be 91XXXXXXXXXX',
                            ifsc:   'Invalid IFSC (e.g., SBIN0001234)',
                            age18:  'Staff must be at least 18 years old'
                        };
                        _showFieldError(input, labels[type] || 'Invalid format');
                    } else {
                        _clearFieldError(input);
                    }
                });
                input.addEventListener('input', () => _clearFieldError(input));
            });
        }

        // save
        if (canEdit) {
            view.querySelector('#staffDetailForm').addEventListener('submit', async e => {
                e.preventDefault();

                let hasError = false;
                view.querySelectorAll('[data-validate]').forEach(input => {
                    const type = input.dataset.validate;
                    const val  = input.value.trim();
                    if (val && !_validate[type](val)) { _showFieldError(input, 'Invalid format'); hasError = true; }
                });
                if (hasError) { showNotification('\u274c Please fix validation errors', 'error'); return; }

                const f    = e.target;
                const data = Object.fromEntries(new FormData(f));
                const cc   = (data.MOBILE_CC  || '91').trim();
                const num  = (data.MOBILE_NUM || '').trim();
                data.MOBILE = num ? `${cc}${num}` : '';
                delete data.MOBILE_CC;
                delete data.MOBILE_NUM;

                // build EMERGENCY_CONTACT from CC+num fields
                const ecc  = (document.getElementById('sfEmergencyCC')?.value  || '91').trim();
                const enum_ = (document.getElementById('sfEmergencyNum')?.value || '').trim();
                data.EMERGENCY_CONTACT = enum_ ? `${ecc}${enum_}` : '';

                // cast date fields to Unix ms bigint
                for (const f of ['DATE_BIRTH', 'DATE_JOIN', 'DATE_LEAVE']) {
                    if (data[f]) data[f] = new Date(data[f]).getTime() || null;
                    else delete data[f];
                }

                const staffCode = data.STAFF_CODE || (isEdit ? s.STAFF_CODE : '');
                const action    = isEdit ? 'update_staff' : 'new_staff';
                const btn       = e.target.querySelector('button[type=submit]');

                try {
                    const writeToken = await _staffOtp(staffCode, action);
                    btn.disabled = true; btn.textContent = 'Saving…';
                    const res = await callApi('/api/writeStaff', {
                        data,
                        record_id:   isEdit ? s.id : null,
                        write_token: writeToken,
                    });
                    const rec = res.record;
                    _staff[rec.STAFF_CODE] = rec;
                    _selected = rec.STAFF_CODE;                    _renderList(_staff);
                    _renderDetail(rec);
                    const cnt = document.getElementById('cnt-staff');
                    if (cnt) cnt.textContent = Object.keys(_staff).length;
                    showNotification(`\u2705 Staff ${isEdit ? 'updated' : 'created'}`, 'success');
                } catch (err) {
                    if (err.message !== 'cancelled') showNotification('\u274c ' + err.message, 'error');
                } finally { btn.disabled = false; btn.textContent = isEdit ? 'Save Changes' : 'Create Staff'; }
            });
        }

        // delete
        if (isEdit && canDelete) {
            view.querySelector('#staffDeleteBtn')?.addEventListener('click', () => {
                document.getElementById('staffDeleteConfirm').classList.remove('hidden');
            });
            view.querySelector('#staffCancelDeleteBtn')?.addEventListener('click', () => {
                document.getElementById('staffDeleteConfirm').classList.add('hidden');
            });
            view.querySelector('#staffConfirmDeleteBtn')?.addEventListener('click', async () => {
                const btn = view.querySelector('#staffConfirmDeleteBtn');
                const sp  = view.querySelector('#staffDeleteSpinner');
                try {
                    const writeToken = await _staffOtp(s.STAFF_CODE, 'delete_staff');
                    btn.disabled = true; sp.classList.remove('hidden');
                    await callApi('/api/deleteStaff', { record_id: s.id, STAFF_CODE: s.STAFF_CODE, write_token: writeToken });
                    // soft delete — backend returns upsert with STATUS=Resigned, update local cache
                    _staff[s.STAFF_CODE] = { ..._staff[s.STAFF_CODE], STATUS: 'Resigned' };
                    _selected = null;
                    _renderList(_staff);
                    _renderDetail(_staff[s.STAFF_CODE]);
                    AdminPage.showDetail(false);
                    const cnt = document.getElementById('cnt-staff');
                    if (cnt) cnt.textContent = Object.keys(_staff).length;
                    showNotification('\u2705 Staff deleted', 'success');
                } catch (err) {
                    if (err.message !== 'cancelled') showNotification('\u274c ' + err.message, 'error');
                } finally { btn.disabled = false; sp.classList.add('hidden'); }
            });
        }
    }

    async function _fetchPincode(pin, view) {
        if (typeof window.searchPin !== 'function') return;
        try {
            const result = await window.searchPin(pin);
            if (result?.found) {
                const f = (sel, val) => { const el = view.querySelector(sel); if (el) el.value = val || ''; };
                f('#sfCity',              result.CITY);
                f('#sfState',             result.STATE_NAME || result.STATE);
                f('[name="CODE_STATE"]',  result.STATE_CODE);
                f('[name="GST_CODE"]',    result.GST_CODE);
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
