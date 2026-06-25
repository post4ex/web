// ADMIN-CARRIERS.JS — Carriers tile: exact match to Carrier.html
// ============================================================================

const AdminCarriers = (() => {

    let _allCarriers = [];
    let _isUpdate    = false;
    let _pinTimer    = null;
    let _deleteAbort = null;   // AbortController for deleteCarrierBtn listener

    function _can(role) { return window.AdminPage?.can(role); }

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('listMsg')?.classList.add('hidden');
        document.getElementById('adminList').innerHTML =
            `<ul id="carriersList" class="p-4 space-y-2"></ul>`;
        document.getElementById('listSearch').placeholder = 'Search carriers...';
    }

    function _renderList(carriers) {
        const ul = document.getElementById('carriersList');
        if (!ul) return;
        ul.innerHTML = '';
        if (!carriers || !carriers.length) {
            ul.innerHTML = '<li class="text-center text-gray-500">No matching carriers.</li>';
            return;
        }
        carriers.forEach(carrier => {
            const li = document.createElement('li');
            li.className = 'p-3 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors border border-gray-200';
            li.innerHTML = `<strong class="text-indigo-700">${carrier.COMPANY_CODE}</strong> - ${carrier.COMPANY_NAME || 'Unnamed'}`;
            li.dataset.companyCode = carrier.COMPANY_CODE;
            li.addEventListener('click', () => _showViewMode(carrier));
            ul.appendChild(li);
        });
    }

    function search(term) {
        const t = (term || '').toLowerCase();
        _renderList(_allCarriers.filter(c =>
            (c.COMPANY_CODE || '').toLowerCase().includes(t) ||
            (c.COMPANY_NAME || '').toLowerCase().includes(t)
        ));
    }

    // ── Detail pane ───────────────────────────────────────────────────────────
    function _injectDetailPane() {
        document.getElementById('detailView').innerHTML = `
            <div class="w-full">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold text-gray-900">Carrier Management</h1>
                    <p class="text-gray-600 mt-2">Select a carrier to edit, or create a new one.</p>
                </div>
                <form id="carriersForm" autocomplete="off">
                    <h2 class="text-xl font-semibold mb-6 text-indigo-600">Carrier Details</h2>
                    <div class="grid grid-cols-1 md:grid-cols-6 gap-6">
                        <div class="md:col-span-2">
                            <label class="block mb-2 text-sm font-medium text-gray-700">Company Code*</label>
                            <input type="text" id="carriersCode" name="COMPANY_CODE" required placeholder="e.g., C001"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-4">
                            <label class="block mb-2 text-sm font-medium text-gray-700">Company Name</label>
                            <input type="text" name="COMPANY_NAME" placeholder="e.g., Express Logistics"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-3">
                            <label class="block mb-2 text-sm font-medium text-gray-700">Logo URL (G-Drive)</label>
                            <input type="url" name="LOGO_URL_GDRIVE" placeholder="https://"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-3">
                            <label class="block mb-2 text-sm font-medium text-gray-700">Logo URL (PostIMG)</label>
                            <input type="url" name="LOGO_URL_POSTIMG" placeholder="https://"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-3">
                            <label class="block mb-2 text-sm font-medium text-gray-700">GSTIN</label>
                            <input type="text" name="GSTIN" placeholder="15-digit GSTIN" maxlength="15"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-3">
                            <label class="block mb-2 text-sm font-medium text-gray-700">Transport ID</label>
                            <input type="text" name="TRANSPORT_ID" placeholder="Transport ID"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-6">
                            <label class="block mb-2 text-sm font-medium text-gray-700">Address</label>
                            <input type="text" name="COMPANY_ADDRESS" placeholder="123 Commerce St"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-2 text-sm font-medium text-gray-700">Pincode</label>
                            <div class="relative">
                                <input type="text" id="carriersPincode" name="COMPANY_PINCODE" placeholder="123456" maxlength="6"
                                    class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 pr-10">
                                <div id="carriersPincodeStatus" class="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-gray-500 pointer-events-none"></div>
                            </div>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-2 text-sm font-medium text-gray-700">City</label>
                            <input type="text" id="carriersCity" name="COMPANY_CITY" placeholder="City" readonly
                                class="bg-gray-200 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-2 text-sm font-medium text-gray-700">State</label>
                            <input type="text" id="carriersState" name="COMPANY_STATE" placeholder="State" readonly
                                class="bg-gray-200 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5">
                        </div>
                    </div>
                    <div class="mt-8 text-center">
                        <button type="submit" id="carriersSubmitBtn"
                            class="btn px-8 py-3 flex items-center justify-center mx-auto disabled:opacity-45">
                            <span id="carriersSubmitText">Submit New Carrier</span>
                            <div id="carriersSpinner" class="spinner hidden ml-3" style="width:24px;height:24px;"></div>
                        </button>
                    </div>
                </form>
                <div id="carriersResponseMsg" class="mt-6 text-center p-4 rounded-lg text-sm hidden"></div>
            </div>

            <!-- Delete Confirmation Modal -->
            <div id="carriersDeleteModal" class="modal-overlay hidden">
                <div class="modal-content">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">Confirm Deletion</h2>
                    <p class="text-gray-600 mb-6">Are you sure you want to delete carrier <strong id="carriersDeleteName"></strong>? This action cannot be undone.</p>
                    <div class="flex justify-end space-x-4">
                        <button id="carriersCancelDeleteBtn" class="btn-ghost px-4 py-2">Cancel</button>
                        <button id="carriersConfirmDeleteBtn" class="btn-danger px-4 py-2">Yes, Delete</button>
                    </div>
                </div>
            </div>`;

        AdminPage.showDetail(true);
        _bindDetailEvents();
    }

    // ── resetForm ─────────────────────────────────────────────────────────────
    function _resetForm() {
        document.getElementById('carriersForm').reset();
        _isUpdate = false;
        const codeEl = document.getElementById('carriersCode');
        codeEl.readOnly = false;
        codeEl.classList.remove('bg-gray-200', 'cursor-not-allowed');
        document.getElementById('carriersSubmitText').textContent = 'Submit New Carrier';
        document.getElementById('carriersPincodeStatus').innerHTML = '';
        document.getElementById('carriersResponseMsg').classList.add('hidden');
        document.getElementById('deleteCarrierBtn')?.classList.add('hidden');
    }

    // ── View mode: read-only detail (Plan 7) ─────────────────────────────────
    function _showViewMode(carrier) {
        if (!carrier) return;
        const view = document.getElementById('detailView');
        if (!view) return;

        const canEdit = _can('ADMIN');
        view.innerHTML = `
            <div class="detail-card mode-view" id="carrierDetailCard">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h2 class="text-base font-bold text-gray-800">${carrier.COMPANY_CODE}</h2>
                        <p class="text-xs text-gray-500">${carrier.COMPANY_NAME || ''}</p>
                    </div>
                    ${canEdit ? `
                    <div class="flex gap-2">
                        <button id="carrierEditBtn" class="view-only btn btn-sm">Edit</button>
                        <button id="carrierCancelEditBtn" class="edit-only btn-ghost btn-sm">Cancel</button>
                    </div>` : ''}
                </div>
                <div class="detail-card-body">
                    <div class="view-only space-y-3">
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div><span class="block text-xs font-semibold text-gray-500">Company Code</span><span class="text-sm">${carrier.COMPANY_CODE || '—'}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">Company Name</span><span class="text-sm">${carrier.COMPANY_NAME || '—'}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">GSTIN</span><span class="text-sm">${carrier.GSTIN || '—'}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">Transport ID</span><span class="text-sm">${carrier.TRANSPORT_ID || '—'}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">Address</span><span class="text-sm">${carrier.COMPANY_ADDRESS || '—'}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">Pincode</span><span class="text-sm">${carrier.COMPANY_PINCODE || '—'}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">City</span><span class="text-sm">${carrier.COMPANY_CITY || '—'}</span></div>
                            <div><span class="block text-xs font-semibold text-gray-500">State</span><span class="text-sm">${carrier.COMPANY_STATE || '—'}</span></div>
                        </div>
                    </div>
                </div>
            </div>`;

        if (canEdit) {
            view.querySelector('#carrierEditBtn')?.addEventListener('click', () => {
                _injectDetailPane();  // Restore form HTML from the detail pane
                _populateFormForEdit(carrier.COMPANY_CODE);
            });
            view.querySelector('#carrierCancelEditBtn')?.addEventListener('click', () => {
                _showViewMode(carrier);
            });
        }

        AdminPage.showDetail(true);
        AdminPage.showDetailPane();
    }

    // ── populateFormForEdit ───────────────────────────────────────────────────
    function _populateFormForEdit(companyCode) {
        const carrier = _allCarriers.find(c => c.COMPANY_CODE === companyCode);
        if (!carrier) return;
        _resetForm();
        const form = document.getElementById('carriersForm');
        for (const key in carrier) {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) input.value = carrier[key] || '';
        }
        _isUpdate = true;
        const codeEl = document.getElementById('carriersCode');
        codeEl.readOnly = true;
        codeEl.classList.add('bg-gray-200', 'cursor-not-allowed');
        document.getElementById('carriersSubmitText').textContent = `Update Carrier ${companyCode}`;
        if (_can('MASTER')) document.getElementById('deleteCarrierBtn')?.classList.remove('hidden');

        // Switch to edit mode on the detail card
        const card = document.getElementById('carrierDetailCard');
        if (card) {
            card.className = 'detail-card mode-edit';
        } else {
            // Fallback: inject full detail pane
            _injectDetailPane();
            const form2 = document.getElementById('carriersForm');
            for (const key in carrier) {
                const input2 = form2.querySelector(`[name="${key}"]`);
                if (input2) input2.value = carrier[key] || '';
            }
            const ce = document.getElementById('carriersCode');
            ce.readOnly = true;
            ce.classList.add('bg-gray-200', 'cursor-not-allowed');
            document.getElementById('carriersSubmitText').textContent = `Update Carrier ${companyCode}`;
            if (_can('MASTER')) document.getElementById('deleteCarrierBtn')?.classList.remove('hidden');
        }

        document.querySelectorAll('#carriersList li').forEach(li =>
            li.classList.toggle('bg-indigo-50', li.dataset.companyCode === companyCode)
        );
        AdminPage.showDetail(true);
        AdminPage.showDetailPane();
    }

    function openAddPane() {
        _resetForm();
        AdminPage.showDetail(true);
        AdminPage.showDetailPane();
    }

    // ── setLoading ────────────────────────────────────────────────────────────
    function _setLoading(isLoading) {
        document.getElementById('carriersSpinner').classList.toggle('hidden', !isLoading);
        document.getElementById('carriersSubmitBtn').disabled = isLoading;
        document.getElementById('carriersConfirmDeleteBtn').disabled = isLoading;
        const codeVal = document.getElementById('carriersCode')?.value || '';
        document.getElementById('carriersSubmitText').textContent = isLoading
            ? (_isUpdate ? 'Updating...' : 'Submitting...')
            : (_isUpdate ? `Update Carrier ${codeVal}` : 'Submit New Carrier');
    }

    // ── showResponseMessage ───────────────────────────────────────────────────
    function _showResponseMsg(message, type, data = null) {
        const el = document.getElementById('carriersResponseMsg');
        if (!el) return;
        let content = `<p class="font-semibold">${message}</p>`;
        if (data && typeof data === 'object') {
            content += '<div class="mt-2 text-left text-xs bg-gray-50 p-3 rounded border border-gray-200 max-w-md mx-auto">';
            for (const [k, v] of Object.entries(data)) {
                if (v) content += `<p><strong class="font-medium text-gray-600">${k.replace(/_/g, ' ')}:</strong> <span class="text-gray-800">${v}</span></p>`;
            }
            content += '</div>';
        }
        el.innerHTML = content;
        el.className = `mt-6 text-center p-4 rounded-lg text-sm ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
        el.classList.remove('hidden');
    }

    // ── Pincode (exact match: postalpincode.in + field-spinner) ───────────────
    function _initPincode() {
        const pin    = document.getElementById('carriersPincode');
        const city   = document.getElementById('carriersCity');
        const state  = document.getElementById('carriersState');
        const status = document.getElementById('carriersPincodeStatus');
        if (!pin) return;
        pin.addEventListener('input', () => {
            clearTimeout(_pinTimer);
            status.innerHTML = '';
            const v = pin.value.trim();
            if (v.length < 6) { city.value = ''; state.value = ''; }
            if (v.length === 6) {
                status.innerHTML = '<div class="spinner field-spinner" style="width:16px;height:16px;border-top-color:#6d28d9;"></div>';
                _pinTimer = setTimeout(async () => {
                    try {
                        const res  = await fetch(`https://api.postalpincode.in/pincode/${v}`);
                        const json = await res.json();
                        if (json?.[0]?.Status === 'Success') {
                            const po = json[0].PostOffice[0];
                            city.value  = po.District || '';
                            state.value = po.State    || '';
                            status.innerHTML = '<span class="text-green-500">✔</span>';
                        } else {
                            status.innerHTML = '<span class="text-red-500">✖</span>';
                        }
                    } catch {
                        status.innerHTML = '<span class="text-red-500">!</span>';
                    }
                }, 500);
            }
        });
    }

    // ── handleRequest ─────────────────────────────────────────────────────────
    async function _handleRequest(action) {
        _setLoading(true);
        const data = {};
        if (action === 'submit') {
            new FormData(document.getElementById('carriersForm')).forEach((v, k) => { data[k] = v; });
        } else {
            data.COMPANY_CODE = document.getElementById('carriersCode').value;
        }
        try {
            const result = await callApi(
                action === 'delete' ? '/api/deleteCarrier' : '/api/writeCarrier',
                { data, record_id: action !== 'delete' && _isUpdate ? data.COMPANY_CODE : null },
                'POST'
            );
            document.getElementById('carriersDeleteModal').classList.add('hidden');
            _showResponseMsg(result.message || 'Done.', 'success', result.data);
            _resetForm();
            const appData = await getAppData();
            _allCarriers = Object.values(appData?.CARRIERS || {});
            _renderList(_allCarriers);
        } catch (err) {
            _showResponseMsg(err.message, 'error');
        } finally {
            _setLoading(false);
        }
    }

    // ── Bind detail-pane events (re-bound each load) ──────────────────────────
    function _bindDetailEvents() {
        _initPincode();
        document.getElementById('carriersForm').addEventListener('submit', e => {
            e.preventDefault(); _handleRequest('submit');
        });
        document.getElementById('carriersCancelDeleteBtn').addEventListener('click', () =>
            document.getElementById('carriersDeleteModal').classList.add('hidden')
        );
        document.getElementById('carriersConfirmDeleteBtn').addEventListener('click', () =>
            _handleRequest('delete')
        );
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    function load() {
        _injectListPane();
        _injectDetailPane();

        // deleteCarrierBtn lives in admin.html list header — re-bind with AbortController
        if (_deleteAbort) _deleteAbort.abort();
        _deleteAbort = new AbortController();
        document.getElementById('deleteCarrierBtn')?.addEventListener('click', () => {
            const code = document.getElementById('carriersCode')?.value;
            if (!code) return;
            document.getElementById('carriersDeleteName').textContent = code;
            document.getElementById('carriersDeleteModal').classList.remove('hidden');
        }, { signal: _deleteAbort.signal });

        getAppData().then(data => {
            _allCarriers = Object.values(data?.CARRIERS || {});
            _renderList(_allCarriers);
        });
    }

    return { load, search, openAddPane };

})();

window.AdminCarriers = AdminCarriers;
