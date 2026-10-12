// ============================================================================
// ADMIN-STAFF.JS — Staff list + detail form (add/edit/delete)
// Attendance is handled separately in admin-attendance.js
// Role gates: Save/Delete → ADMIN+
// ============================================================================

const AdminStaff = (() => {

    // Validation helpers — delegate to global InputValidator
    const _validate = {
        pan:      (v) => InputValidator.pan(v),
        aadhar:   (v) => InputValidator.aadhar(v),
        pin:      (v) => InputValidator.pin(v),
        mobile:   (v) => InputValidator.mobile(v),
        mobile10: (v) => InputValidator.mobile10 ? InputValidator.mobile10(v) : (!v || /^[0-9]{10}$/.test(v)),
        ifsc:     (v) => InputValidator.ifsc(v),
        age18:    (v) => InputValidator.age18(v),
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

        // ── Computed limit math for view mode ─────────────────────────────────
        const limit = parseFloat(s?.USAGE_LIMIT || 0);
        const balance = parseFloat(s?.BALANCE || 0);
        const unbilled = parseFloat(s?.UNBILLED_USAGE || 0);
        const remaining = limit + balance - unbilled;
        let limitStatusClass, limitStatusText;
        if (limit === 0) {
            limitStatusClass = 'text-gray-500 font-semibold text-xs';
            limitStatusText = 'No Limit Enforced';
        } else if (remaining <= 0) {
            limitStatusClass = 'text-red-600 font-bold text-xs';
            limitStatusText = '₹0 (Over limit by ₹' + Math.abs(remaining).toLocaleString('en-IN') + ')';
        } else {
            limitStatusClass = 'text-emerald-600 font-semibold text-xs';
            limitStatusText = '₹' + remaining.toLocaleString('en-IN');
        }

        const statusVal = s?.STATUS || 'Active';
        let statusBadge = '';
        if (statusVal === 'Active') {
            statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Active</span>';
        } else if (statusVal === 'Resigned' || statusVal === 'Inactive') {
            statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">' + statusVal + '</span>';
        } else {
            statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">' + statusVal + '</span>';
        }

        // ── View Mode: Sectioned HTML ─────────────────────────────────────────
        const viewHtml = isEdit ? `
            <div class="space-y-4">
                <!-- Imprest & Double-Entry Ledger Exposure Card -->
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mb-3">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <h4 class="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Imprest Policy &amp; Live Advance Exposure
                        </h4>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600 font-medium">Branch: <strong class="text-gray-900">${s.BRANCH || '—'}</strong></span>
                            <span>${statusBadge}</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Cash / Imprest Limit</span>
                            <span class="text-base font-bold text-gray-800">${limit > 0 ? '₹' + limit.toLocaleString('en-IN') : '<span class="text-gray-400 font-normal text-sm">No Limit</span>'}</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Advance Balance</span>
                            <span class="text-base font-bold text-amber-700">₹${balance.toLocaleString('en-IN')}</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Unbilled / In-Bag COD</span>
                            <span class="text-base font-bold text-blue-700">₹${unbilled.toLocaleString('en-IN')}</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Remaining Limit</span>
                            ${limitStatusClass ? `<span class="${limitStatusClass}">${limitStatusText}</span>` : limitStatusText}
                        </div>
                    </div>
                    <div class="mt-2.5 pt-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600 flex-wrap gap-2">
                        <div class="flex items-center gap-2">
                            <span class="font-medium">Subledger Binding:</span>
                            <span class="font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">COA #1030 Advances &bull; COA #2020 Salaries &bull; Subledger [${s.STAFF_CODE || '—'}]</span>
                        </div>
                        <div class="text-xs text-gray-500">
                            <span>${s.ROLE || 'Staff'} &bull; ${s.DEPARTMENT || 'Operations'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 1: Employment Identity & Role Profile -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"/></svg>
                        1. Employment Identity &amp; Role Profile
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Staff Code</span>
                            <span class="font-mono font-bold text-indigo-700 text-base">${s.STAFF_CODE || '—'}</span>
                        </div>
                        <div class="col-span-2 md:col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">Full Legal Name</span>
                            <span class="font-bold text-gray-900">${s.STAFF_NAME || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Assigned Branch</span>
                            <span class="font-bold text-gray-800">${s.BRANCH || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Operating Role</span>
                            <span class="px-2 py-0.5 text-xs rounded bg-indigo-50 text-indigo-700 font-semibold">${s.ROLE || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Department</span>
                            <span class="px-2 py-0.5 text-xs rounded bg-gray-100 font-semibold text-gray-800">${s.DEPARTMENT || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Employment Status</span>
                            <span>${statusBadge}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Linked User Login</span>
                            <span class="font-mono text-gray-700 text-xs">${s.USER || '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Personal Demographics & Employment Dates -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        2. Personal Demographics &amp; Employment Dates
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">Father's / Guardian's Name</span>
                            <span class="text-gray-800 font-medium">${s.FATHERS_NAME || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Gender</span>
                            <span class="text-gray-800">${s.GENDER || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Blood Group</span>
                            <span class="px-2 py-0.5 text-xs rounded font-bold bg-rose-50 text-rose-700 border border-rose-200">${s.BLOOD_GROUP || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Date of Birth</span>
                            <span class="text-gray-800">${s.DATE_BIRTH ? fmtDate(s.DATE_BIRTH, 'display') : '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Date of Joining</span>
                            <span class="text-gray-800 font-medium">${s.DATE_JOIN ? fmtDate(s.DATE_JOIN, 'display') : '—'}</span>
                        </div>
                        <div class="col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">Date of Leaving</span>
                            <span class="text-gray-800">${s.DATE_LEAVE ? fmtDate(s.DATE_LEAVE, 'display') : '<span class="text-emerald-700 font-medium">Active in Service</span>'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Contact & Emergency Communication -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                        3. Contact &amp; Emergency Communication
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Primary Mobile</span>
                            <span class="font-mono text-gray-900">${s.MOBILE ? `<a href="tel:${s.MOBILE}" class="hover:underline text-indigo-600 font-medium">+${s.MOBILE}</a>` : '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Primary Email</span>
                            <span class="text-indigo-600 font-medium">${s.EMAIL ? `<a href="mailto:${s.EMAIL}" class="hover:underline">${s.EMAIL}</a>` : '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Emergency Contact</span>
                            <span class="font-mono text-gray-900">${s.EMERGENCY_CONTACT ? `<a href="tel:${s.EMERGENCY_CONTACT}" class="hover:underline text-rose-600 font-medium">+${s.EMERGENCY_CONTACT}</a>` : '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 4: Residential Address & Geotag Routing -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        4. Residential Address &amp; Geotag Routing
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="col-span-2 md:col-span-4">
                            <span class="block text-xs font-semibold text-gray-500">Full Residential Address</span>
                            <span class="text-gray-800">${s.ADDRESS || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Pincode</span>
                            <span class="font-mono font-bold text-gray-900">${s.PINCODE || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">City</span>
                            <span class="text-gray-800 font-medium">${s.CITY || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">State</span>
                            <span class="text-gray-800 font-medium">${s.STATE || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">State Code / GST Code</span>
                            <span class="font-mono text-gray-800">${[s.CODE_STATE, s.GST_CODE].filter(Boolean).join(' / ') || '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 5: Statutory Compliance & Payroll IDs -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        5. Statutory Compliance &amp; Payroll IDs
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                        <div class="col-span-2 sm:col-span-1">
                            <span class="block text-xs font-semibold text-gray-500">Aadhaar Number</span>
                            <span class="font-mono font-bold text-gray-900">${s.ADHAR_NUM ? s.ADHAR_NUM.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">PAN Number</span>
                            <span class="font-mono font-bold text-indigo-700">${s.PAN_NUM || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">EPF UID</span>
                            <span class="font-mono text-gray-800">${s.EPF_UID || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">ESI UID</span>
                            <span class="font-mono text-gray-800">${s.ESI_UID || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">UAN</span>
                            <span class="font-mono text-gray-800">${s.UAN || '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 6: Banking & Remittance -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                        6. Banking &amp; Remittance (Salary &amp; Claims)
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Bank Name</span>
                            <span class="font-medium text-gray-800">${s.BANK_NAME || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Account Number</span>
                            <span class="font-mono font-bold text-gray-900">${s.BANK_AC || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">IFSC Code</span>
                            <span class="font-mono font-bold text-purple-700">${s.BANK_IFSC || '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 7: Delivery Fleet & Operations Policy -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"/></svg>
                        7. Delivery Fleet &amp; Cash Bag Limit
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Driving License</span>
                            <span class="font-mono text-gray-800">${s.DRIVING_LICENSE || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Vehicle Number</span>
                            <span class="font-mono font-semibold text-gray-900">${s.VEHICLE_NUM || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Cash-in-Bag / Imprest Limit</span>
                            <span class="font-bold text-gray-800">${limit > 0 ? '₹' + limit.toLocaleString('en-IN') : 'No Limit'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 8: Double-Entry Ledger Mechanics & Audit -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        8. Double-Entry Ledger Mechanics &amp; Audit Trail
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">Subledger Accounts Binding</span>
                            <span class="font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">COA #1030 (Dr Advance) &bull; COA #2020 (Cr Payable)</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Last Updated By</span>
                            <span class="text-gray-800 font-medium">${s.USER || 'SYSTEM'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Audit Timestamp</span>
                            <span class="font-mono text-xs text-gray-600">${s.TIME_STAMP ? (typeof fmtDate === 'function' ? fmtDate(s.TIME_STAMP, 'full') : s.TIME_STAMP) : '—'}</span>
                        </div>
                    </div>
                </div>
            </div>
        ` : '';

        // ── Edit Mode: Sectioned Form Inputs ──────────────────────────────────
        const editFields = `
            <div class="space-y-4">
                <!-- Section 1: Employment Identity & Role Profile -->
                <div class="border border-indigo-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between border-b border-indigo-50 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                            <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 1: Employment Identity &amp; Role Profile</h3>
                        </div>
                        <span class="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">Core Profile</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Staff Code *</label>
                            <input name="STAFF_CODE" value="${s?.STAFF_CODE || ''}" class="form-input text-sm uppercase font-mono readonly-input" readonly placeholder="Auto-generated on new">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Staff Legal Name *</label>
                            <input name="STAFF_NAME" value="${s?.STAFF_NAME || ''}" required class="form-input text-sm" placeholder="Full legal name">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Assigned Branch *</label>
                            <select name="BRANCH" required class="form-input text-sm">
                                <option value="">Select Branch</option>
                                ${branchOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Operating Role</label>
                            <select name="ROLE" class="form-input text-sm">
                                <option value="">Select Role</option>
                                ${STAFF_ROLES.map(o => `<option ${s?.ROLE === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Department</label>
                            <select name="DEPARTMENT" class="form-input text-sm">
                                <option value="">Select Dept</option>
                                ${STAFF_DEPTS.map(o => `<option ${s?.DEPARTMENT === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                        <div class="md:col-span-3">
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Employment Status</label>
                            <select name="STATUS" class="form-input text-sm">
                                ${STAFF_STATUSES.map(o => `<option ${s?.STATUS === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Personal Demographics & Employment Dates -->
                <div class="border border-blue-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between border-b border-blue-50 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                            <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 2: Personal Demographics &amp; Employment Dates</h3>
                        </div>
                        <span class="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">Demographics</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Father's / Guardian's Name</label>
                            <input name="FATHERS_NAME" value="${s?.FATHERS_NAME || ''}" class="form-input text-sm" placeholder="Father's full name">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Gender</label>
                            <select name="GENDER" class="form-input text-sm">
                                <option value="">Select Gender</option>
                                ${STAFF_GENDERS.map(o => `<option ${s?.GENDER === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Blood Group</label>
                            <select name="BLOOD_GROUP" class="form-input text-sm">
                                <option value="">Select Blood Group</option>
                                ${STAFF_BLOOD.map(o => `<option ${s?.BLOOD_GROUP === o ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Date of Birth</label>
                            <input name="DATE_BIRTH" id="sfDob" type="date" value="${s?.DATE_BIRTH ? fmtDate(s.DATE_BIRTH, 'input') : ''}" class="form-input text-sm" data-validate="age18">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Date of Joining</label>
                            <input name="DATE_JOIN" type="date" value="${s?.DATE_JOIN ? fmtDate(s.DATE_JOIN, 'input') : ''}" class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Date of Leaving</label>
                            <input name="DATE_LEAVE" type="date" value="${s?.DATE_LEAVE ? fmtDate(s.DATE_LEAVE, 'input') : ''}" class="form-input text-sm">
                        </div>
                    </div>
                </div>

                <!-- Section 3: Contact & Emergency Reachability -->
                <div class="border border-emerald-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between border-b border-emerald-50 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                            <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 3: Contact &amp; Emergency Reachability</h3>
                        </div>
                        <span class="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded">Reachability</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Primary Mobile *</label>
                            <div class="flex gap-2">
                                <input name="MOBILE_CC" value="91" class="form-input text-sm" style="width:4.5rem;flex-shrink:0" placeholder="CC" maxlength="3">
                                <input name="MOBILE_NUM" value="${(s?.MOBILE||'').replace(/^91/, '')}" required class="form-input text-sm flex-1" placeholder="10-digit number" maxlength="10" data-validate="mobile10">
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Primary Email *</label>
                            <input name="EMAIL" type="email" required value="${s?.EMAIL || ''}" class="form-input text-sm" placeholder="staff@example.com">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Emergency Contact Mobile</label>
                            <div class="flex gap-2">
                                <input id="sfEmergencyCC" value="91" class="form-input text-sm" style="width:4.5rem;flex-shrink:0" placeholder="CC" maxlength="3">
                                <input id="sfEmergencyNum" type="tel" value="${(s?.EMERGENCY_CONTACT||'').replace(/^91/, '')}" class="form-input text-sm flex-1" placeholder="10-digit number" maxlength="10" data-validate="mobile10">
                            </div>
                            <input type="hidden" name="EMERGENCY_CONTACT" id="sfEmergencyContact" value="${s?.EMERGENCY_CONTACT || ''}">
                        </div>
                    </div>
                </div>

                <!-- Section 4: Residential Address & Pincode Routing -->
                <div class="border border-amber-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between border-b border-amber-50 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center">4</span>
                            <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 4: Residential Address &amp; Pincode Routing</h3>
                        </div>
                        <span class="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded">Geotag Routing</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div class="md:col-span-4">
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Full Residential Address *</label>
                            <input name="ADDRESS" value="${s?.ADDRESS || ''}" class="form-input text-sm" placeholder="Street, house number, area">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Pincode *</label>
                            <input name="PINCODE" id="sfPincode" required value="${s?.PINCODE || ''}" maxlength="6" class="form-input text-sm font-mono" placeholder="e.g. 248001" data-validate="pin">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">City</label>
                            <input name="CITY" id="sfCity" value="${s?.CITY || ''}" class="form-input text-sm" placeholder="Auto-populated">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">State</label>
                            <input name="STATE" id="sfState" value="${s?.STATE || ''}" class="form-input text-sm" placeholder="Auto-populated">
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">State Code</label>
                                <input name="CODE_STATE" value="${s?.CODE_STATE || ''}" class="form-input text-sm font-mono" maxlength="2" placeholder="05">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">GST Code</label>
                                <input name="GST_CODE" value="${s?.GST_CODE || ''}" class="form-input text-sm font-mono" maxlength="2" data-uppercase placeholder="05">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Section 5: Statutory Compliance & Payroll IDs -->
                <div class="border border-purple-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between border-b border-purple-50 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">5</span>
                            <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 5: Statutory Compliance &amp; Payroll IDs</h3>
                        </div>
                        <span class="text-xs text-purple-600 font-medium bg-purple-50 px-2 py-0.5 rounded">Tax &amp; Identity</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div class="md:col-span-1">
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Aadhaar Number</label>
                            <input name="ADHAR_NUM" id="sfAdhar" value="${s?.ADHAR_NUM || ''}" maxlength="12" class="form-input text-sm font-mono" placeholder="12-digit UID" data-validate="aadhar">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">PAN Number</label>
                            <input name="PAN_NUM" value="${s?.PAN_NUM || ''}" maxlength="10" class="form-input text-sm font-mono uppercase" placeholder="ABCDE1234F" data-validate="pan" data-uppercase>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">EPF UID</label>
                            <input name="EPF_UID" value="${s?.EPF_UID || ''}" class="form-input text-sm font-mono" placeholder="Provident Fund ID">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">ESI UID</label>
                            <input name="ESI_UID" value="${s?.ESI_UID || ''}" class="form-input text-sm font-mono" placeholder="ESIC Number">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">UAN</label>
                            <input name="UAN" value="${s?.UAN || ''}" class="form-input text-sm font-mono" placeholder="Universal A/c No">
                        </div>
                    </div>
                </div>

                <!-- Section 6: Banking & Remittance -->
                <div class="border border-sky-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between border-b border-sky-50 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center">6</span>
                            <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 6: Banking &amp; Remittance (Salary &amp; Claims)</h3>
                        </div>
                        <span class="text-xs text-sky-600 font-medium bg-sky-50 px-2 py-0.5 rounded">Payroll Payout</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Bank Name</label>
                            <input name="BANK_NAME" value="${s?.BANK_NAME || ''}" class="form-input text-sm" placeholder="e.g. State Bank of India">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Bank Account Number</label>
                            <input name="BANK_AC" value="${s?.BANK_AC || ''}" class="form-input text-sm font-mono" placeholder="Full account number">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Bank IFSC Code</label>
                            <input name="BANK_IFSC" value="${s?.BANK_IFSC || ''}" maxlength="11" class="form-input text-sm font-mono uppercase" placeholder="e.g. SBIN0001234" data-validate="ifsc" data-uppercase>
                        </div>
                    </div>
                </div>

                <!-- Section 7: Delivery Fleet & Operations Policy -->
                <div class="border border-teal-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between border-b border-teal-50 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">7</span>
                            <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 7: Delivery Fleet &amp; Operations Policy</h3>
                        </div>
                        <span class="text-xs text-teal-600 font-medium bg-teal-50 px-2 py-0.5 rounded">Fleet Operations</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Driving License</label>
                            <input name="DRIVING_LICENSE" value="${s?.DRIVING_LICENSE || ''}" class="form-input text-sm uppercase font-mono" placeholder="DL number">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Vehicle Registration Number</label>
                            <input name="VEHICLE_NUM" value="${s?.VEHICLE_NUM || ''}" class="form-input text-sm uppercase font-mono" placeholder="UK07AA1234" data-uppercase>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Cash-in-Bag / Imprest Limit</label>
                            <input name="USAGE_LIMIT" type="number" step="any" min="0" value="${s?.USAGE_LIMIT || ''}" class="form-input text-sm font-mono" placeholder="e.g. 10000">
                            <p class="text-[11px] text-gray-400 mt-1">Maximum allowed cash-in-bag or advance limit.</p>
                        </div>
                    </div>
                </div>

                <!-- Section 8: Double-Entry Ledger Notice -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 flex items-center gap-3">
                    <svg class="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <div>
                        <span class="font-bold text-slate-900 block mb-0.5">Staff Double-Entry Ledger Architecture:</span>
                        <span>Employee advances and imprests bind directly to <code>COA #1030 Staff Advances</code> (Asset). Monthly payroll bookings credit <code>COA #2020 Salaries Payable</code> (Liability), while salary remittances clear from <code>COA #1021 Bank Operating Account</code>.</span>
                    </div>
                </div>

                ${canEdit ? `
                <div class="flex justify-end gap-3 pt-3 border-t">
                    ${isEdit ? `<button type="button" id="staffCancelFormBtn" class="btn-ghost btn-sm">Cancel</button>` : ''}
                    <button type="submit" class="btn px-6 py-2.5 flex items-center gap-2">
                        <span>${isEdit ? 'Save Changes' : 'Create Staff'}</span>
                    </button>
                </div>` : ''}
            </div>
        `;

        view.innerHTML = `
            <div class="detail-card ${isEdit ? 'mode-view' : ''}" id="staffDetailCard">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h2 class="text-base font-bold text-gray-800">${isEdit ? s.STAFF_CODE : 'New Staff'}</h2>
                        <p class="text-xs text-gray-500">${isEdit ? (s.STAFF_NAME || '') : 'Fill out employee profile and statutory details'}</p>
                    </div>
                    ${isEdit && canDelete ? `
                    <div class="flex gap-2">
                        <button id="staffEditBtn" class="view-only btn btn-sm">Edit Staff</button>
                        <button id="staffDeleteBtn" class="view-only btn-danger btn-sm">Delete</button>
                        <button id="staffCancelEditBtn" class="edit-only btn-ghost btn-sm">Cancel</button>
                    </div>` : ''}
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

                    <!-- View Mode: Read-only content -->
                    <div class="view-only">
                        ${isEdit ? viewHtml : '<p class="text-gray-500 text-sm">Complete the form below to create a new staff member.</p>'}
                    </div>

                    <!-- Edit Mode: Editable form -->
                    <form id="staffDetailForm" class="edit-only">
                        ${editFields}
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

        // ── View/Edit mode toggling ─────────────────────────────────────────
        if (isEdit && canEdit) {
            view.querySelector('#staffEditBtn')?.addEventListener('click', () => {
                const card = document.getElementById('staffDetailCard');
                if (card) card.className = 'detail-card mode-edit';
            });
            view.querySelector('#staffCancelEditBtn')?.addEventListener('click', () => {
                if (window.NavigationGuard) NavigationGuard.markClean();
                _renderDetail(_staff[_selected]);
            });
            view.querySelector('#staffCancelFormBtn')?.addEventListener('click', () => {
                if (window.NavigationGuard) NavigationGuard.markClean();
                _renderDetail(_staff[_selected]);
            });
        }

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
                            pan:      'Invalid PAN format (e.g., ABCDE1234F)',
                            aadhar:   'Invalid Aadhar (12 digits required)',
                            pin:      'Invalid pincode format',
                            mobile:   'Mobile must be 10 or 12 digits',
                            mobile10: 'Mobile number must be 10 digits (e.g. 9876543210)',
                            ifsc:     'Invalid IFSC (e.g., SBIN0001234)',
                            age18:    'Staff must be at least 18 years old'
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

                // Reset CASCADED_BLOCK on manual status change
                if (data.STATUS) {
                    data.CASCADED_BLOCK = false;
                }

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
                    if (window.NavigationGuard) NavigationGuard.markClean();
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
                    if (window.NavigationGuard) NavigationGuard.markClean();
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
