// ============================================================================
// ADMIN-BRANCHES.JS — Branches list, detail, add/edit/delete
// BRANCH_MOBILE stored as CC-NUMBER (e.g. 91-9045451155)
// Create/Update: POST /api/writeBranch  |  Delete: POST /api/deleteBranch  (ADMIN+)
// Create is free; edit + delete are OTP / Google Authenticator (2FA) gated.
// Field contract (mirrors backend field_validation.classify_branch_fields):
//   GENIE  — free edit, operational fields
//   SYNCED — branch details (name, bank, ifsc, upi)
//   LOCKED — BRANCH_CODE, never editable once created
//   SYSTEM — STATUS / USED_LIMIT / UNBILLED_USAGE / CROSSOVER, engine owned
// ============================================================================

const AdminBranches = (() => {

    // Validation helpers — delegate to global InputValidator
    const _validate = {
        branchCode: (v) => InputValidator.branchCode(v),
        gstin:      (v) => InputValidator.gstin(v),
        pan:        (v) => InputValidator.pan(v),
        pin:        (v) => InputValidator.pin(v),
        email:      (v) => InputValidator.email(v),
        upi:        (v) => InputValidator.upi(v),
        ifsc:       (v) => InputValidator.ifsc(v),
        mobile:     (v) => InputValidator.mobile(v),
        mobile10:   (v) => InputValidator.mobile10 ? InputValidator.mobile10(v) : (!v || /^[0-9]{10}$/.test(v)),
        bankAccount:(v) => InputValidator.bankAccount(v),
        stateCode:  (v) => InputValidator.stateCode(v),
        gstCode:    (v) => InputValidator.gstCode(v),
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

    let _branches = [];   // array of branch objects from IndexedDB
    let _selected = null; // BRANCH_CODE of selected branch

    // Fields in display/form order (BRANCH_CITY/BRANCH_STATE/CODE_STATE/GST_CODE rendered in responsive row)
    const FIELDS = [
        'BRANCH_CODE', 'BRANCH_NAME', 'BRANCH_STATUS', 'BRANCH_GSTIN', 'BRANCH_PAN',
        'BRANCH_ADDRESS', 'BRANCH_LANDMARK', 'BRANCH_PINCODE', '__STATE_ROW__',
        'BRANCH_MOBILE', 'BRANCH_EMAIL',
        'BRANCH_MANAGER', 'BRANCH_MANAGER_PHONE',
        'BRANCH_OPEN_TIME', 'BRANCH_CLOSE_TIME',
        'BRANCH_UPI', 'BRANCH_UPI_NAME',
        'BRANCH_BANK_AC', 'BRANCH_IFSC', 'BRANCH_BANK_NAME',
        'BRANCH_GEO_TEG',
        '__CREDIT_SECTION__',
    ];
    // Read-only on edit (key field)
    const READONLY_ON_EDIT = new Set(['BRANCH_CODE']);
    // Auto-filled from pincode API
    const PINCODE_AUTO = new Set(['BRANCH_CITY', 'BRANCH_STATE', 'CODE_STATE', 'GST_CODE']);
    // An edit here is pushed to the branch Entity / bank Account
    const ACCOUNTING_SYNCED = new Set([
        'BRANCH_NAME', 'BRANCH_BANK_NAME', 'BRANCH_BANK_AC',
        'BRANCH_IFSC', 'BRANCH_UPI', 'BRANCH_UPI_NAME',
    ]);
    // Owned by the credit engine / accounting — rendered read-only, never sent
    const SYSTEM_OWNED = new Set(['STATUS', 'USED_LIMIT', 'UNBILLED_USAGE', 'CROSSOVER']);

    // ── Mobile helpers ────────────────────────────────────────────────────────
    function _splitMobile(val) {
        if (!val) return { cc: '91', num: '' };
        const clean = val.replace('-', '');
        return { cc: '91', num: clean.replace(/^91/, '') };
    }
    function _joinMobile(cc, num) {
        cc = (cc || '91').trim();
        num = (num || '').trim().replace(/^91/, '');
        return num ? `${cc}${num}` : '';
    }

    // ── Public API ────────────────────────────────────────────────────────────
    async function load() {
        const msg = document.getElementById('listMsg');
        const searchEl = document.getElementById('listSearch');
        if (searchEl) searchEl.placeholder = 'Search branches…';
        try {
            const raw = await getAppData('BRANCHES');
            _branches = Object.values(raw || {});
            if (!_branches.length) {
                document.getElementById('adminList').innerHTML = '';
                if (msg) { msg.textContent = 'No branches found.'; msg.classList.remove('hidden'); }
                return;
            }
            if (msg) msg.classList.add('hidden');
            renderList(_branches);
        } catch (err) {
            if (msg) { msg.textContent = 'Failed to load.'; msg.classList.remove('hidden'); }
            showNotification('❌ ' + err.message, 'error');
        }
    }

    function renderList(branches) {
        const ul  = document.getElementById('adminList');
        const msg = document.getElementById('listMsg');
        if (!ul) return;
        if (!branches.length) {
            ul.innerHTML = '';
            if (msg) { msg.textContent = 'No branches found.'; msg.classList.remove('hidden'); }
            return;
        }
        if (msg) msg.classList.add('hidden');
        ul.innerHTML = branches.map(b => `
            <li data-code="${b.BRANCH_CODE}" class="${_selected === b.BRANCH_CODE ? 'selected' : ''}">
                <strong>${b.BRANCH_CODE}</strong>
                <span class="client-info">${b.BRANCH_NAME || ''}</span>
                <div class="details-info">
                    <span class="text-xs text-gray-500">${b.BRANCH_CITY || ''}</span>
                </div>
            </li>`).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => _selectBranch(li.dataset.code))
        );
    }

    function search(q) {
        const lq = q.toLowerCase();
        renderList(_branches.filter(b =>
            (b.BRANCH_CODE || '').toLowerCase().includes(lq) ||
            (b.BRANCH_NAME || '').toLowerCase().includes(lq) ||
            (b.BRANCH_CITY || '').toLowerCase().includes(lq)
        ));
    }

    function openAddPane() {
        _selected = null;
        document.querySelectorAll('#adminList li').forEach(li => li.classList.remove('selected'));
        AdminPage.showDetailPane();
        _renderForm(null);
    }

    // ── Private ───────────────────────────────────────────────────────────────
    function _selectBranch(code) {
        _selected = code;
        const b = _branches.find(x => x.BRANCH_CODE === code);
        if (!b) return;
        document.querySelectorAll('#adminList li').forEach(li =>
            li.classList.toggle('selected', li.dataset.code === code)
        );
        AdminPage.showDetailPane();
        _renderForm(b);
    }

    function _renderForm(b) {
        AdminPage.showDetail(true);
        const view = document.getElementById('detailView');
        if (!view) return;
        const isEdit = !!b;
        const canEdit = AdminPage.can('ADMIN');
        const canDelete = AdminPage.can('ADMIN');
        const { cc, num } = _splitMobile(b?.BRANCH_MOBILE);
        const { cc: mcc, num: mnum } = _splitMobile(b?.BRANCH_MANAGER_PHONE);

        const cl = parseFloat(b?.CREDIT_LIMIT || 0);
        const ul = parseFloat(b?.USED_LIMIT || 0);
        const uu = parseFloat(b?.UNBILLED_USAGE || 0);
        const cashInHand = parseFloat(b?.CASH_IN_HAND || 0);
        const remaining = cl - (ul + uu);
        
        let remainingLimitHtml = '';
        if (cl === 0) {
            remainingLimitHtml = '<span class="text-gray-500 font-semibold text-xs">No Credit Limit</span>';
        } else if (remaining <= 0) {
            remainingLimitHtml = '<span class="text-red-600 font-bold text-xs">₹0 (Over limit by ₹' + Math.abs(remaining).toLocaleString('en-IN') + ')</span>';
        } else {
            remainingLimitHtml = '<span class="text-emerald-600 font-semibold text-xs">₹' + remaining.toLocaleString('en-IN') + '</span>';
        }

        const statusVal = b?.BRANCH_STATUS || b?.STATUS || 'Active';
        let statusBadge = '';
        if (statusVal === 'Active') {
            statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Active</span>';
        } else if (statusVal === 'Inactive') {
            statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">Inactive</span>';
        } else {
            statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">' + statusVal + '</span>';
        }

        // Crossover counts (Orders, B2B, Staff)
        let crossover = b?.CROSSOVER;
        if (typeof crossover === 'string') {
            try { crossover = JSON.parse(crossover); } catch (e) { crossover = {}; }
        }
        crossover = crossover || {};
        const orderCount = crossover.ORDERS ?? crossover.orders ?? 0;
        const b2bCount = crossover.B2B ?? crossover.b2b ?? 0;
        const staffCount = crossover.STAFF ?? crossover.staff ?? 0;

        // GPS Geotag coordinate link
        const geo = b?.BRANCH_GEO_TEG || '';
        const geoHtml = geo && geo.includes(',') 
            ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(geo)}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1 font-mono text-xs">${geo} <svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>`
            : (geo || '—');

        const viewHtml = isEdit ? `
            <!-- Credit & Live Exposure Card -->
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mb-3">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Credit Policy & Live Exposure
                    </h4>
                    <div class="flex items-center gap-2">
                        <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600 font-medium">Clients: <strong class="text-gray-900">${b2bCount}</strong></span>
                        <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600 font-medium">Staff: <strong class="text-gray-900">${staffCount}</strong></span>
                        <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600 font-medium">Orders: <strong class="text-gray-900">${orderCount}</strong></span>
                    </div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                        <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Credit Limit</span>
                        <span class="text-base font-bold text-gray-800">${cl > 0 ? '₹' + cl.toLocaleString('en-IN') : '<span class="text-gray-400 font-normal text-sm">No Limit</span>'}</span>
                    </div>
                    <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                        <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Billed AR Usage</span>
                        <span class="text-base font-bold text-amber-700">₹${ul.toLocaleString('en-IN')}</span>
                    </div>
                    <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                        <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Unbilled Usage</span>
                        <span class="text-base font-bold text-blue-700">₹${uu.toLocaleString('en-IN')}</span>
                    </div>
                    <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                        <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Remaining Limit</span>
                        ${remainingLimitHtml}
                    </div>
                </div>
                ${cashInHand > 0 ? `
                <div class="mt-2.5 pt-2 border-t border-gray-200 flex items-center justify-between text-xs">
                    <span class="text-gray-600 font-medium">Branch Cash in Hand (Operating Imprest):</span>
                    <span class="font-bold text-emerald-700 font-mono text-sm">₹${cashInHand.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                </div>` : ''}
            </div>

            <!-- Section 1: Branch Identity & Location -->
            <div class="border-t pt-3.5">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                    Branch Identity & Location
                </h4>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Branch Code</span>
                        <span class="font-mono font-bold text-gray-900">${b.BRANCH_CODE || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Branch Name</span>
                        <span class="font-medium text-gray-800">${b.BRANCH_NAME || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Operating Status</span>
                        <span>${statusBadge}</span>
                    </div>
                    <div class="col-span-2">
                        <span class="block text-xs font-semibold text-gray-500">Address</span>
                        <span class="text-gray-800">${b.BRANCH_ADDRESS || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Landmark</span>
                        <span class="text-gray-700">${b.BRANCH_LANDMARK || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">City / State</span>
                        <span class="text-gray-800 font-medium">${[b.BRANCH_CITY, b.BRANCH_STATE].filter(Boolean).join(', ') || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Pincode</span>
                        <span class="font-mono text-gray-800">${b.BRANCH_PINCODE || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">State Code / GST Code</span>
                        <span class="font-mono text-gray-800">${b.CODE_STATE || '—'} (GST: ${b.GST_CODE || '—'})</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">GPS Coordinates</span>
                        <span>${geoHtml}</span>
                    </div>
                </div>
            </div>

            <!-- Section 2: Operations & Policies -->
            <div class="border-t pt-3.5">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Operations & Policy
                </h4>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Opening Time</span>
                        <span class="text-gray-800 font-medium">${b.BRANCH_OPEN_TIME || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Closing Time</span>
                        <span class="text-gray-800 font-medium">${b.BRANCH_CLOSE_TIME || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Cross-Limit Policy</span>
                        <span class="text-gray-800">${b.CROSS_LIMIT === 'Yes' ? '<span class="text-emerald-700 font-semibold">Allowed</span> (Orders proceed above limit)' : '<span class="text-gray-700 font-medium">Strict Block</span> (No orders above limit)'}</span>
                    </div>
                </div>
            </div>

            <!-- Section 3: Contact & Management -->
            <div class="border-t pt-3.5">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    Contact & Management
                </h4>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Branch Manager</span>
                        <span class="font-medium text-gray-800">${b.BRANCH_MANAGER || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Manager Mobile</span>
                        <span class="text-gray-800 font-mono">${b.BRANCH_MANAGER_PHONE ? '+' + b.BRANCH_MANAGER_PHONE : '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Branch Mobile</span>
                        <span class="text-gray-800 font-mono">${b.BRANCH_MOBILE ? '+' + b.BRANCH_MOBILE : '—'}</span>
                    </div>
                    <div class="col-span-2 md:col-span-3">
                        <span class="block text-xs font-semibold text-gray-500">Official Email</span>
                        <span class="text-indigo-600 font-medium">${b.BRANCH_EMAIL ? `<a href="mailto:${b.BRANCH_EMAIL}" class="hover:underline">${b.BRANCH_EMAIL}</a>` : '—'}</span>
                    </div>
                </div>
            </div>

            <!-- Section 4: Banking & Digital Settlement -->
            <div class="border-t pt-3.5">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                    Banking & Digital Settlement
                </h4>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Bank Name</span>
                        <span class="text-gray-800 font-medium">${b.BRANCH_BANK_NAME || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">Account Number</span>
                        <span class="font-mono text-gray-900 font-bold">${b.BRANCH_BANK_AC || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">IFSC Code</span>
                        <span class="font-mono text-gray-900 font-semibold">${b.BRANCH_IFSC || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">UPI VPA</span>
                        <span class="font-mono text-indigo-700 font-semibold">${b.BRANCH_UPI || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">UPI Payee Name</span>
                        <span class="text-gray-800 font-medium">${b.BRANCH_UPI_NAME || '—'}</span>
                    </div>
                </div>
            </div>

            <!-- Section 5: Statutory & Compliance -->
            <div class="border-t pt-3.5">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Statutory & Tax Compliance
                </h4>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">GSTIN</span>
                        <span class="font-mono text-gray-900 font-semibold">${b.BRANCH_GSTIN || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">PAN</span>
                        <span class="font-mono text-gray-900 font-semibold">${b.BRANCH_PAN || '—'}</span>
                    </div>
                    <div>
                        <span class="block text-xs font-semibold text-gray-500">GST State Jurisdiction</span>
                        <span class="font-mono text-gray-800">${b.GST_CODE || '—'} (${b.BRANCH_STATE || '—'})</span>
                    </div>
                </div>
            </div>` : '';

        const editFormHtml = `
            <!-- Section 1: Branch Identity & Location -->
            <div class="border-b border-gray-200 pb-4">
                <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                    Branch Identity & Location
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">
                            BRANCH_CODE <span class="text-red-500">*</span>
                            ${isEdit ? '<span class="ml-1 text-[10px] text-amber-600 font-semibold">(Locked)</span>' : ''}
                        </label>
                        <input name="BRANCH_CODE" value="${b?.BRANCH_CODE || ''}"
                            class="form-input text-sm font-mono${isEdit ? ' bg-gray-100 cursor-not-allowed font-bold text-gray-700' : ''}"
                            ${isEdit ? 'readonly' : ''} maxlength="3" style="text-transform:uppercase" data-validate="branchCode" required placeholder="e.g. DDN">
                        <p class="text-[10px] text-gray-400 mt-0.5">${isEdit ? 'Unique 3-letter branch code (immutable)' : '3 uppercase letters (e.g. DEL, DDN)'}</p>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_NAME <span class="text-red-500">*</span></label>
                        <input name="BRANCH_NAME" value="${b?.BRANCH_NAME || ''}" class="form-input text-sm" required placeholder="Full official branch name">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_STATUS</label>
                        <select name="BRANCH_STATUS" class="form-input text-sm">
                            ${['Active','Inactive','Closed'].map(o => `<option ${(b?.BRANCH_STATUS||b?.STATUS||'Active')===o?'selected':''}>${o}</option>`).join('')}
                        </select>
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_ADDRESS</label>
                        <input name="BRANCH_ADDRESS" value="${b?.BRANCH_ADDRESS || ''}" class="form-input text-sm" placeholder="Building, Street, Area">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_LANDMARK</label>
                        <input name="BRANCH_LANDMARK" value="${b?.BRANCH_LANDMARK || ''}" class="form-input text-sm" placeholder="Prominent landmark">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_PINCODE</label>
                        <input name="BRANCH_PINCODE" id="branchPincodeInput" value="${b?.BRANCH_PINCODE || ''}" class="form-input text-sm font-mono" maxlength="6" placeholder="6-digit PIN code">
                        <p class="text-[10px] text-gray-400 mt-0.5">Auto-fills City, State, State Code & GST Code</p>
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_GEO_TEG (GPS)</label>
                        <div class="flex gap-2">
                            <input name="BRANCH_GEO_TEG" id="branchGeoInput" value="${b?.BRANCH_GEO_TEG || ''}" class="form-input text-sm flex-1 font-mono text-xs" placeholder="latitude,longitude">
                            <button type="button" id="branchGeoBtn" class="px-2.5 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1 text-xs flex-shrink-0">
                                <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                <span data-geo-label>Capture GPS</span>
                            </button>
                        </div>
                    </div>
                    <!-- Pincode-derived location strip -->
                    <div class="sm:col-span-2 md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 p-2.5 rounded border border-gray-200">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_CITY</label>
                            <input name="BRANCH_CITY" value="${b?.BRANCH_CITY || ''}" class="form-input text-sm bg-gray-100 cursor-not-allowed" readonly data-auto placeholder="Auto from PIN">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_STATE</label>
                            <input name="BRANCH_STATE" value="${b?.BRANCH_STATE || ''}" class="form-input text-sm bg-gray-100 cursor-not-allowed" readonly data-auto placeholder="Auto from PIN">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">CODE_STATE</label>
                            <input name="CODE_STATE" value="${b?.CODE_STATE || ''}" class="form-input text-sm bg-gray-100 cursor-not-allowed font-mono" readonly data-auto maxlength="2" data-validate="stateCode" placeholder="e.g. UP">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">GST_CODE</label>
                            <input name="GST_CODE" value="${b?.GST_CODE || ''}" class="form-input text-sm bg-gray-100 cursor-not-allowed font-mono" readonly data-auto maxlength="2" data-validate="gstCode" placeholder="e.g. 09">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section 2: Contact & Management -->
            <div class="border-b border-gray-200 pb-4">
                <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    Contact & Management
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_MANAGER</label>
                        <input name="BRANCH_MANAGER" value="${b?.BRANCH_MANAGER || ''}" class="form-input text-sm" placeholder="Manager full name">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_MANAGER_PHONE</label>
                        <div class="flex gap-2">
                            <input name="MGR_PHONE_CC" value="${mcc}" class="form-input text-sm" style="width:4.5rem;flex-shrink:0" placeholder="CC" maxlength="3">
                            <input name="MGR_PHONE_NUM" value="${mnum}" class="form-input text-sm flex-1 font-mono" placeholder="10-digit number" maxlength="10" data-validate="mobile10">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_MOBILE</label>
                        <div class="flex gap-2">
                            <input name="MOBILE_CC" value="${cc}" class="form-input text-sm" style="width:4.5rem;flex-shrink:0" placeholder="CC" maxlength="3">
                            <input name="MOBILE_NUM" value="${num}" class="form-input text-sm flex-1 font-mono" placeholder="10-digit number" maxlength="10" data-validate="mobile10">
                        </div>
                        <p class="text-[10px] text-gray-400 mt-0.5">CC 91 auto-prepended on save</p>
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_EMAIL</label>
                        <input name="BRANCH_EMAIL" type="email" value="${b?.BRANCH_EMAIL || ''}" class="form-input text-sm" data-validate="email" placeholder="branch@post4ex.com">
                    </div>
                </div>
            </div>

            <!-- Section 3: Operations & Timings -->
            <div class="border-b border-gray-200 pb-4">
                <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Operations & Policy
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_OPEN_TIME</label>
                        <input name="BRANCH_OPEN_TIME" type="time" value="${b?.BRANCH_OPEN_TIME || ''}" class="form-input text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_CLOSE_TIME</label>
                        <input name="BRANCH_CLOSE_TIME" type="time" value="${b?.BRANCH_CLOSE_TIME || ''}" class="form-input text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">CROSS_LIMIT</label>
                        <select name="CROSS_LIMIT" class="form-input text-sm">
                            <option value="No" ${b?.CROSS_LIMIT === 'No' ? 'selected' : ''}>No (Strict Block on Over-Limit)</option>
                            <option value="Yes" ${b?.CROSS_LIMIT === 'Yes' ? 'selected' : ''}>Yes (Allow Bookings on Over-Limit)</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Section 4: Banking & Digital Settlement -->
            <div class="border-b border-gray-200 pb-4">
                <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                    Banking & Digital Settlement
                    <span class="ml-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200" title="Edits here are pushed to the accounting ledger">&#8594; accounting synced</span>
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_BANK_NAME</label>
                        <input name="BRANCH_BANK_NAME" value="${b?.BRANCH_BANK_NAME || ''}" class="form-input text-sm" placeholder="e.g. State Bank of India">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_BANK_AC</label>
                        <input name="BRANCH_BANK_AC" value="${b?.BRANCH_BANK_AC || ''}" class="form-input text-sm font-mono" data-validate="bankAccount" placeholder="Bank account number">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_IFSC</label>
                        <input name="BRANCH_IFSC" value="${b?.BRANCH_IFSC || ''}" class="form-input text-sm font-mono" maxlength="11" data-validate="ifsc" placeholder="e.g. SBIN0001234">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_UPI (VPA)</label>
                        <input name="BRANCH_UPI" value="${b?.BRANCH_UPI || ''}" class="form-input text-sm font-mono text-indigo-700" data-validate="upi" placeholder="branch@upi">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_UPI_NAME</label>
                        <input name="BRANCH_UPI_NAME" value="${b?.BRANCH_UPI_NAME || ''}" class="form-input text-sm" placeholder="Payee name on UPI">
                    </div>
                </div>
            </div>

            <!-- Section 5: Statutory & Compliance -->
            <div class="border-b border-gray-200 pb-4">
                <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Statutory & Tax Compliance
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_GSTIN</label>
                        <input name="BRANCH_GSTIN" value="${b?.BRANCH_GSTIN || ''}" class="form-input text-sm font-mono" maxlength="15" data-validate="gstin" placeholder="15-digit GSTIN">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_PAN</label>
                        <input name="BRANCH_PAN" value="${b?.BRANCH_PAN || ''}" class="form-input text-sm font-mono" maxlength="10" data-validate="pan" placeholder="10-digit PAN">
                    </div>
                </div>
            </div>

            <!-- Section 6: Credit Policy & Exposure Engine -->
            <div class="pb-1">
                <h4 class="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Credit Policy & Exposure Controls
                </h4>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">CREDIT_LIMIT (₹)</label>
                        <input name="CREDIT_LIMIT" type="number" step="any" value="${b?.CREDIT_LIMIT || ''}" class="form-input text-sm font-medium" placeholder="0">
                        <p class="text-[10px] text-gray-400 mt-0.5">0 = Unlimited credit</p>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">USED_LIMIT (AR)</label>
                        <input name="USED_LIMIT" type="number" step="any" value="${b?.USED_LIMIT || ''}" class="form-input text-sm bg-gray-100 cursor-not-allowed font-mono text-amber-800" readonly placeholder="Auto-calc">
                        <p class="text-[10px] text-gray-400 mt-0.5">Engine-owned (B2B AR)</p>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">UNBILLED_USAGE</label>
                        <input name="UNBILLED_USAGE" type="number" step="any" value="${b?.UNBILLED_USAGE || ''}" class="form-input text-sm bg-gray-100 cursor-not-allowed font-mono text-blue-800" readonly placeholder="Auto-calc">
                        <p class="text-[10px] text-gray-400 mt-0.5">Engine-owned (Unbilled Bookings)</p>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">Remaining Limit</label>
                        <div class="pt-1.5">${remainingLimitHtml}</div>
                    </div>
                </div>
            </div>`;

        view.innerHTML = `
            <div class="detail-card ${isEdit ? 'mode-view' : 'mode-edit'}" id="branchDetailCard">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-base font-bold text-gray-800 font-mono">${isEdit ? b.BRANCH_CODE : 'New Branch'}</h2>
                            ${isEdit ? statusBadge : ''}
                            ${isEdit && b.CROSS_LIMIT === 'Yes' ? '<span class="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-semibold border border-blue-200">Cross-Limit: Allowed</span>' : ''}
                        </div>
                        <p class="text-xs text-gray-500 mt-0.5">${isEdit ? (b.BRANCH_NAME || '') : ''}</p>
                    </div>
                    <div class="flex gap-2">
                        ${isEdit && canEdit ? `<button id="branchEditBtn" class="view-only btn btn-sm">Edit Branch</button>` : ''}
                        ${isEdit && canDelete ? `<button id="deleteBranchBtn" class="view-only btn-danger btn-sm">Delete</button>` : ''}
                        ${isEdit && canEdit ? `<button id="branchCancelEditBtn" class="edit-only btn-ghost btn-sm">Cancel</button>` : ''}
                    </div>
                </div>
                <div class="detail-card-body">
                    <!-- View Mode: Read-only details -->
                    <div class="view-only space-y-3">
                        ${viewHtml}
                    </div>

                    <!-- Edit Mode: Form with structured sections -->
                    <form id="branchForm" class="edit-only space-y-5">
                        ${editFormHtml}
                        ${canEdit ? `
                        <div class="pt-3 border-t border-gray-200 flex justify-end gap-3">
                            <button type="submit" class="btn btn-sm">
                                ${isEdit ? 'Save Changes' : 'Create Branch'}
                            </button>
                        </div>` : ''}
                    </form>
                </div>
            </div>`;

        // Wire View Mode Edit click
        view.querySelector('#branchEditBtn')?.addEventListener('click', () => {
            const card = document.getElementById('branchDetailCard');
            if (card) card.className = 'detail-card mode-edit';
        });

        // Wire Edit Mode Cancel click
        view.querySelector('#branchCancelEditBtn')?.addEventListener('click', () => {
            if (window.NavigationGuard) NavigationGuard.markClean();
            const card = document.getElementById('branchDetailCard');
            if (card) card.className = 'detail-card mode-view';
        });

        // Geo tag GPS capture
        const geoBtn = view.querySelector('#branchGeoBtn');
        if (geoBtn) geoWireButton(geoBtn, view.querySelector('#branchGeoInput'));

        // Pincode auto-fill
        const pinInput = view.querySelector('#branchPincodeInput');
        if (pinInput) {
            let _pt;
            pinInput.addEventListener('input', () => {
                clearTimeout(_pt);
                if (pinInput.value.length === 6) {
                    if (_validate.pin(pinInput.value)) {
                        _clearFieldError(pinInput);
                        _pt = setTimeout(() => _fetchPincode(pinInput.value, view), 500);
                    } else {
                        _showFieldError(pinInput, 'Invalid pincode format');
                    }
                }
            });
        }

        // Real-time validation for all fields
        view.querySelectorAll('[data-validate]').forEach(input => {
            // Auto-uppercase for BRANCH_CODE
            if (input.dataset.validate === 'branchCode') {
                input.addEventListener('input', (e) => {
                    e.target.value = e.target.value.toUpperCase();
                    _clearFieldError(input);
                });
            }
            
            input.addEventListener('blur', () => {
                const type = input.dataset.validate;
                const val = input.value.trim();
                if (val && !_validate[type](val)) {
                    const labels = {
                        branchCode: 'Invalid code (3 uppercase letters, e.g., DEL)',
                        gstin: 'Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)',
                        pan: 'Invalid PAN format (e.g., ABCDE1234F)',
                        email: 'Invalid email format',
                        upi: 'Invalid UPI format (e.g., user@bank)',
                        ifsc: 'Invalid IFSC format (e.g., SBIN0001234)',
                        mobile: 'Mobile must be 10 or 12 digits (e.g., 9876543210 or 919876543210)',
                        mobile10: 'Mobile number must be 10 digits (e.g. 9876543210)',
                        bankAccount: 'Invalid account number (9-18 digits)',
                        stateCode: 'Invalid state code (2 uppercase letters, e.g., DL, HR)',
                        gstCode: 'Invalid GST code (2 digits, e.g., 01, 27)'
                    };
                    _showFieldError(input, labels[type] || 'Invalid format');
                } else {
                    _clearFieldError(input);
                }
            });
            if (input.dataset.validate !== 'branchCode') {
                input.addEventListener('input', () => _clearFieldError(input));
            }
        });

        // disable inputs if not ADMIN
        if (!canEdit) view.querySelectorAll('input,select').forEach(el => el.disabled = true);

        view.querySelector('#branchForm').addEventListener('submit', e => {
            e.preventDefault();
            if (!canEdit) return;
            const f = e.target;
            
            // Validate all fields before submit
            let hasError = false;
            view.querySelectorAll('[data-validate]').forEach(input => {
                const type = input.dataset.validate;
                const val = input.value.trim();
                if (val && !_validate[type](val)) {
                    _showFieldError(input, 'Invalid format');
                    hasError = true;
                }
            });
            if (hasError) {
                showNotification('❌ Please fix validation errors', 'error');
                return;
            }
            
            const data = {};
            FIELDS.forEach(field => {
                if (field === '__STATE_ROW__') {
                    ['BRANCH_CITY', 'BRANCH_STATE', 'CODE_STATE', 'GST_CODE'].forEach(sf => {
                        const el = f.elements[sf];
                        if (el) data[sf] = el.value.trim();
                    });
                } else if (field === 'BRANCH_MOBILE') {
                    data.BRANCH_MOBILE = _joinMobile(f.MOBILE_CC?.value, f.MOBILE_NUM?.value);
                } else if (field === 'BRANCH_MANAGER_PHONE') {
                    data.BRANCH_MANAGER_PHONE = _joinMobile(f.MGR_PHONE_CC?.value, f.MGR_PHONE_NUM?.value);
                } else if (field === '__CREDIT_SECTION__') {
                    // USED_LIMIT / UNBILLED_USAGE are computed by the credit engine — never sent.
                    ['CREDIT_LIMIT', 'USED_LIMIT', 'UNBILLED_USAGE', 'CROSS_LIMIT'].forEach(sf => {
                        if (SYSTEM_OWNED.has(sf)) return;
                        const el = f.elements[sf];
                        if (el) data[sf] = el.value.trim();
                    });
                } else {
                    if (SYSTEM_OWNED.has(field)) return;
                    const el = f.elements[field];
                    if (el) data[field] = el.value.trim();
                }
            });

            const submitBtn = f.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${isEdit ? 'Saving Changes…' : 'Creating Branch…'}`;
            }

            (async () => {
                try {
                    // Branch write is OTP-gated — callApi auto-asks (rule: record_id/'new')
                    const payload = { data };
                    if (isEdit) payload.record_id = b.id;
                    const res = await callApi('/api/writeBranch', payload, 'POST');
                    const rec = res.record;
                    if (isEdit) {
                        const idx = _branches.findIndex(x => x.BRANCH_CODE === b.BRANCH_CODE);
                        if (idx !== -1) _branches[idx] = rec;
                    } else {
                        _branches.push(rec);
                    }
                    _selected = rec.BRANCH_CODE;
                    renderList(_branches);
                    _renderForm(rec);
                    const cnt = document.getElementById('cnt-branches');
                    if (cnt) cnt.textContent = _branches.length;
                    if (window.NavigationGuard) NavigationGuard.markClean();
                    showNotification(`✅ Branch ${isEdit ? 'updated' : 'created'}`, 'success');
                } catch (err) {
                    if (err.message !== 'OTP action cancelled') showNotification('❌ ' + err.message, 'error');
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = isEdit ? 'Save Changes' : 'Create Branch';
                    }
                }
            })();
        });

        if (isEdit && canDelete) {
            view.querySelector('#deleteBranchBtn').addEventListener('click', () => {
                if (!confirm(`Delete branch "${b.BRANCH_CODE}"?\n\nThis is only allowed while the accounting entity is in its initial state (no transactions). If it cannot be deleted, disable the branch instead by setting BRANCH_STATUS to Inactive.`)) return;
                const delBtn = view.querySelector('#deleteBranchBtn');
                if (delBtn) {
                    delBtn.disabled = true;
                    delBtn.innerHTML = `<svg class="animate-spin -ml-1 mr-1 h-3.5 w-3.5 text-white inline-block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Deleting…`;
                }
                (async () => {
                    try {
                        await callApi('/api/deleteBranch', { record_id: b.id }, 'POST');  // OTP auto-asked

                        _branches = _branches.filter(x => x.BRANCH_CODE !== b.BRANCH_CODE);
                        _selected = null;
                        renderList(_branches);
                        AdminPage.showDetail(false);
                        const cnt = document.getElementById('cnt-branches');
                        if (cnt) cnt.textContent = _branches.length;
                        if (window.NavigationGuard) NavigationGuard.markClean();
                        showNotification('✅ Branch deleted', 'success');
                    } catch (err) {
                        if (err.message !== 'OTP action cancelled') showNotification('❌ ' + err.message, 'error');
                    } finally {
                        if (delBtn) {
                            delBtn.disabled = false;
                            delBtn.innerHTML = 'Delete';
                        }
                    }
                })();
            });
        }
    }

    async function _fetchPincode(pin, view) {
        if (typeof window.searchPin !== 'function') {
            console.warn('searchPin not ready yet');
            return;
        }
        try {
            const result = await window.searchPin(pin);
            console.log('searchPin result:', result);
            if (result?.found) {
                const cityEl     = view.querySelector('[name="BRANCH_CITY"]');
                const stateEl    = view.querySelector('[name="BRANCH_STATE"]');
                const codeStateEl = view.querySelector('[name="CODE_STATE"]');
                const gstCodeEl  = view.querySelector('[name="GST_CODE"]');
                if (cityEl)      cityEl.value      = result.CITY       || '';
                if (stateEl)     stateEl.value     = result.STATE_NAME || result.STATE || '';
                if (codeStateEl) codeStateEl.value = result.STATE_CODE || '';
                if (gstCodeEl)   gstCodeEl.value   = result.GST_CODE   || '';
            } else {
                console.warn('searchPin: not found for', pin);
            }
        } catch (err) {
            console.warn('Pincode lookup failed:', err);
        }
    }

    return { load, renderList, search, openAddPane };
})();

window.AdminBranches = AdminBranches;
