// ============================================================================
// ADMIN-BRANCHES.JS — Branches list, detail, add/edit/delete
// BRANCH_MOBILE stored as CC-NUMBER (e.g. 91-9045451155)
// Create/Update: POST /api/write  |  Delete: POST /api/delete  (ADMIN/MASTER)
// ============================================================================

const AdminBranches = (() => {

    let _branches = [];   // array of branch objects from IndexedDB
    let _selected = null; // BRANCH_CODE of selected branch

    // Fields in display/form order
    const FIELDS = [
        'BRANCH_CODE', 'BRANCH_NAME', 'BRANCH_GSTIN', 'BRANCH_PAN',
        'BRANCH_ADDRESS', 'BRANCH_PINCODE', 'BRANCH_CITY', 'BRANCH_STATE',
        'BRANCH_MOBILE', 'BRANCH_EMAIL',
        'BRANCH_UPI', 'BRANCH_UPI_NAME',
        'BRANCH_BANK_AC', 'BRANCH_IFSC', 'BRANCH_BANK_NAME',
        'BRANCH_GEO_TEG',
    ];
    // Read-only on edit (key field)
    const READONLY_ON_EDIT = new Set(['BRANCH_CODE']);
    // Auto-filled from pincode API
    const PINCODE_AUTO = new Set(['BRANCH_CITY', 'BRANCH_STATE']);

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
        document.getElementById('adminDetailPane')?.classList.add('mobile-show');
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
        document.getElementById('adminDetailPane')?.classList.add('mobile-show');
        _renderForm(b);
    }

    function _renderForm(b) {
        AdminPage.showDetail(true);
        const view = document.getElementById('detailView');
        if (!view) return;
        const isEdit = !!b;
        const { cc, num } = _splitMobile(b?.BRANCH_MOBILE);

        const fieldHtml = FIELDS.map(f => {
            if (f === 'BRANCH_MOBILE') return `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">BRANCH_MOBILE</label>
                    <div class="flex gap-2">
                        <input name="MOBILE_CC"  value="${cc}"  class="form-input text-sm" style="width:5rem;flex-shrink:0" placeholder="CC">
                        <input name="MOBILE_NUM" value="${num}" class="form-input text-sm flex-1" placeholder="Number">
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
                        ${f === 'BRANCH_PINCODE' ? 'id="branchPincodeInput" maxlength="6"' : ''}>
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

        // Pincode auto-fill
        const pinInput = view.querySelector('#branchPincodeInput');
        if (pinInput) {
            let _pt;
            pinInput.addEventListener('input', () => {
                clearTimeout(_pt);
                if (pinInput.value.length === 6)
                    _pt = setTimeout(() => _fetchPincode(pinInput.value, view), 500);
            });
        }

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
            const data = {};
            FIELDS.forEach(field => {
                if (field === 'BRANCH_MOBILE') {
                    data.BRANCH_MOBILE = _joinMobile(f.MOBILE_CC?.value, f.MOBILE_NUM?.value);
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
        try {
            const res  = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
            const data = await res.json();
            if (data?.[0]?.Status === 'Success') {
                const po = data[0].PostOffice[0];
                const cityEl  = view.querySelector('[name="BRANCH_CITY"]');
                const stateEl = view.querySelector('[name="BRANCH_STATE"]');
                if (cityEl)  cityEl.value  = po.District;
                if (stateEl) stateEl.value = po.State;
            }
        } catch (_) {}
    }

    return { load, renderList, search, openAddPane };
})();

window.AdminBranches = AdminBranches;
