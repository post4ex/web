// ============================================================================
// ADMIN-BRANCHES.JS — Branches list, detail, add/edit/delete
// BRANCH_MOBILE stored as CC-NUMBER (e.g. 91-9045451155)
// Create/Update: POST /api/write  |  Delete: POST /api/delete  (ADMIN/MASTER)
// ============================================================================

const AdminBranches = (() => {

    // Validation helpers - use centralized InputValidator
    const _validate = window.InputValidator || {
        branchCode: (v) => !v || /^[A-Z]{3}$/.test(v),
        gstin: (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
        pan: (v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v),
        pin: (v) => !v || /^[1-9][0-9]{5}$/.test(v),
        email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        upi: (v) => !v || /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(v),
        ifsc: (v) => !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
        mobile: (v) => !v || /^[0-9]{7,15}$/.test(v),
        bankAccount: (v) => !v || /^[0-9]{9,18}$/.test(v),
        stateCode: (v) => !v || /^[A-Z]{2}$/.test(v),
        gstCode: (v) => !v || /^[0-9]{2}$/.test(v)
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

    // Fields in display/form order (BRANCH_STATE/CODE_STATE/GST_CODE rendered as one row separately)
    const FIELDS = [
        'BRANCH_CODE', 'BRANCH_NAME', 'BRANCH_STATUS', 'BRANCH_GSTIN', 'BRANCH_PAN',
        'BRANCH_ADDRESS', 'BRANCH_LANDMARK', 'BRANCH_PINCODE', 'BRANCH_CITY', '__STATE_ROW__',
        'BRANCH_MOBILE', 'BRANCH_EMAIL',
        'BRANCH_MANAGER', 'BRANCH_MANAGER_PHONE',
        'BRANCH_OPEN_TIME', 'BRANCH_CLOSE_TIME',
        'BRANCH_UPI', 'BRANCH_UPI_NAME',
        'BRANCH_BANK_AC', 'BRANCH_IFSC', 'BRANCH_BANK_NAME',
        'BRANCH_GEO_TEG',
    ];
    // Read-only on edit (key field)
    const READONLY_ON_EDIT = new Set(['BRANCH_CODE']);
    // Auto-filled from pincode API
    const PINCODE_AUTO = new Set(['BRANCH_CITY', 'BRANCH_STATE', 'CODE_STATE', 'GST_CODE']);

    // ── Mobile helpers ────────────────────────────────────────────────────────
    function _splitMobile(val) {
        if (!val) return { cc: '91', num: '' };
        const idx = val.indexOf('-');
        return idx === -1 ? { cc: '91', num: val } : { cc: val.slice(0, idx), num: val.slice(idx + 1) };
    }
    function _joinMobile(cc, num) {
        cc = (cc || '91').trim(); num = (num || '').trim();
        return num ? `${cc}-${num}` : '';
    }

    // ── Public API ────────────────────────────────────────────────────────────
    async function load() {
        const msg = document.getElementById('listMsg');
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
        const { cc, num } = _splitMobile(b?.BRANCH_MOBILE);

        const fieldHtml = FIELDS.map(f => {
            if (f === '__STATE_ROW__') return `
                <div class="sm:col-span-2 grid grid-cols-3 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_STATE</label>
                        <input name="BRANCH_STATE" value="${b?.BRANCH_STATE || ''}"
                            class="form-input text-sm bg-gray-100 cursor-not-allowed" readonly data-auto
                            placeholder="State name">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">CODE_STATE</label>
                        <input name="CODE_STATE" value="${b?.CODE_STATE || ''}"
                            class="form-input text-sm bg-gray-100 cursor-not-allowed" readonly data-auto
                            maxlength="2" data-validate="stateCode" placeholder="e.g. DL">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">GST_CODE</label>
                        <input name="GST_CODE" value="${b?.GST_CODE || ''}"
                            class="form-input text-sm bg-gray-100 cursor-not-allowed" readonly data-auto
                            maxlength="2" data-validate="gstCode" placeholder="e.g. 07">
                    </div>
                </div>`;
            if (f === 'BRANCH_GEO_TEG') return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_GEO_TEG</label>
                    <div class="flex gap-2">
                        <input name="BRANCH_GEO_TEG" id="branchGeoInput" value="${b?.[f] || ''}" class="form-input text-sm flex-1" placeholder="lat,lon">
                        <button type="button" id="branchGeoBtn" class="px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1 text-xs flex-shrink-0">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                            <span data-geo-label>GPS</span>
                        </button>
                    </div>
                </div>`;
            if (f === 'BRANCH_STATUS') return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_STATUS</label>
                    <select name="BRANCH_STATUS" class="form-input text-sm">
                        ${['Active','Inactive','Closed'].map(o => `<option ${(b?.BRANCH_STATUS||'Active')===o?'selected':''}>${o}</option>`).join('')}
                    </select>
                </div>`;
            if (f === 'BRANCH_OPEN_TIME') return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_OPEN_TIME</label>
                    <input name="BRANCH_OPEN_TIME" type="time" value="${b?.BRANCH_OPEN_TIME || ''}" class="form-input text-sm">
                </div>`;
            if (f === 'BRANCH_CLOSE_TIME') return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_CLOSE_TIME</label>
                    <input name="BRANCH_CLOSE_TIME" type="time" value="${b?.BRANCH_CLOSE_TIME || ''}" class="form-input text-sm">
                </div>`;
            if (f === 'BRANCH_MANAGER_PHONE') {
                const { cc: mcc, num: mnum } = _splitMobile(b?.BRANCH_MANAGER_PHONE);
                return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_MANAGER_PHONE</label>
                    <div class="flex gap-2">
                        <input name="MGR_PHONE_CC"  value="${mcc}"  class="form-input text-sm" style="width:5rem;flex-shrink:0" placeholder="CC" maxlength="3">
                        <input name="MGR_PHONE_NUM" value="${mnum}" class="form-input text-sm flex-1" placeholder="Number" data-validate="mobile">
                    </div>
                </div>`;
            }
            if (f === 'BRANCH_MOBILE') return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_MOBILE</label>
                    <div class="flex gap-2">
                        <input name="MOBILE_CC"  value="${cc}"  class="form-input text-sm" style="width:5rem;flex-shrink:0" placeholder="CC" maxlength="3">
                        <input name="MOBILE_NUM" value="${num}" class="form-input text-sm flex-1" placeholder="Number" data-validate="mobile">
                    </div>
                    <p class="text-xs text-gray-400 mt-0.5">CC - Number (e.g. 91 - 9876543210)</p>
                </div>`;
            const isRO = isEdit && READONLY_ON_EDIT.has(f);
            const isAuto = PINCODE_AUTO.has(f);
            return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">${f}</label>
                    <input name="${f}" value="${b?.[f] || ''}"
                        class="form-input text-sm${isRO || isAuto ? ' bg-gray-100 cursor-not-allowed' : ''}"
                        ${isRO ? 'readonly' : ''}
                        ${isAuto ? 'readonly data-auto' : ''}
                        ${f === 'BRANCH_CODE' ? 'maxlength="3" style="text-transform:uppercase" data-validate="branchCode" required' : ''}
                        ${f === 'BRANCH_PINCODE' ? 'id="branchPincodeInput" maxlength="6"' : ''}
                        ${f === 'BRANCH_GSTIN' ? 'maxlength="15" data-validate="gstin"' : ''}
                        ${f === 'BRANCH_PAN' ? 'maxlength="10" data-validate="pan"' : ''}
                        ${f === 'BRANCH_EMAIL' ? 'type="email" data-validate="email"' : ''}
                        ${f === 'BRANCH_UPI' ? 'data-validate="upi"' : ''}
                        ${f === 'BRANCH_IFSC' ? 'maxlength="11" data-validate="ifsc"' : ''}
                        ${f === 'BRANCH_BANK_AC' ? 'data-validate="bankAccount"' : ''}
                        ${f === 'CODE_STATE' ? 'maxlength="2" data-validate="stateCode"' : ''}
                        ${f === 'GST_CODE' ? 'maxlength="2" data-validate="gstCode"' : ''}>
                </div>`;
        }).join('');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h2 class="text-base font-bold text-gray-800">${isEdit ? b.BRANCH_CODE : 'New Branch'}</h2>
                    ${isEdit ? `<button id="deleteBranchBtn" class="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700">Delete</button>` : ''}
                </div>
                <div class="detail-card-body">
                    <form id="branchForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        ${fieldHtml}
                        <div class="sm:col-span-2 flex justify-end">
                            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">
                                ${isEdit ? 'Save Changes' : 'Create Branch'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;

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
                        mobile: 'Invalid mobile number (7-15 digits)',
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

        const canEdit   = AdminPage.can('ADMIN');
        const canDelete = AdminPage.can('MASTER');

        // hide Save if not ADMIN
        if (!canEdit) view.querySelector('button[type=submit]')?.classList.add('hidden');
        // hide Delete if not MASTER
        if (isEdit && !canDelete) view.querySelector('#deleteBranchBtn')?.classList.add('hidden');
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
                    ['BRANCH_STATE', 'CODE_STATE', 'GST_CODE'].forEach(sf => {
                        const el = f.elements[sf];
                        if (el) data[sf] = el.value.trim();
                    });
                } else if (field === 'BRANCH_MOBILE') {
                    data.BRANCH_MOBILE = _joinMobile(f.MOBILE_CC?.value, f.MOBILE_NUM?.value);
                } else if (field === 'BRANCH_MANAGER_PHONE') {
                    data.BRANCH_MANAGER_PHONE = _joinMobile(f.MGR_PHONE_CC?.value, f.MGR_PHONE_NUM?.value);
                } else {
                    const el = f.elements[field];
                    if (el) data[field] = el.value.trim();
                }
            });

            try {
                (async () => {
                    const payload = { collection: 'BRANCHES', data };
                    if (isEdit) payload.record_id = b.id;
                    const res = await callApi('/api/write', payload);
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
                    showNotification(`✅ Branch ${isEdit ? 'updated' : 'created'}`, 'success');
                })();
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            }
        });

        if (isEdit && canDelete) {
            view.querySelector('#deleteBranchBtn').addEventListener('click', () => {
                if (!confirm(`Delete branch "${b.BRANCH_CODE}"? This cannot be undone.`)) return;
                (async () => {
                    try {
                        await callApi('/api/delete', { collection: 'BRANCHES', record_id: b.id });
                        _branches = _branches.filter(x => x.BRANCH_CODE !== b.BRANCH_CODE);
                        _selected = null;
                        renderList(_branches);
                        AdminPage.showDetail(false);
                        const cnt = document.getElementById('cnt-branches');
                        if (cnt) cnt.textContent = _branches.length;
                        showNotification('✅ Branch deleted', 'success');
                    } catch (err) {
                        showNotification('❌ ' + err.message, 'error');
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
