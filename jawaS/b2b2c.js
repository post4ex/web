// ============================================================================
// B2B2C.JS — Client list + form logic, init()-based
// Called by admin-b2b2c.js after HTML is injected into the admin panel
// ============================================================================

const B2B2CModule = (() => {

    let allClients = {};
    let allParentClients = {};
    let isUpdateMode = false;
    let currentUid = null;
    let ui = {};

    function _bindUI() {
        ui = {
            form:                       document.getElementById('b2b2cForm'),
            recordIdInput:              document.getElementById('b2b2cRecordId'),
            submitButton:               document.getElementById('b2b2cSubmitBtn'),
            buttonText:                 document.getElementById('b2b2cBtnText'),
            spinner:                    document.getElementById('b2b2cSpinner'),
            responseMessage:            document.getElementById('b2b2cResponseMsg'),
            clientList:                 document.getElementById('b2b2cClientList'),
            searchClientInput:          document.getElementById('listSearch'),
            newClientBtn:               document.getElementById('b2b2cNewClientBtn'),
            uidInput:                   document.getElementById('b2b2cUid'),
            mobileCCInput:              document.getElementById('b2b2cMobileCC'),
            mobileNumInput:             document.getElementById('b2b2cMobileNum'),
            deleteButton:               document.getElementById('b2b2cDeleteBtn'),
            deleteConfirm:              document.getElementById('b2b2cDeleteConfirm'),
            clientToDeleteSpan:         document.getElementById('b2b2cClientToDelete'),
            cancelDeleteBtn:            document.getElementById('b2b2cCancelDeleteBtn'),
            confirmDeleteBtn:           document.getElementById('b2b2cConfirmDeleteBtn'),
            deleteSpinner:              document.getElementById('b2b2cDeleteSpinner'),
            pincodeInput:               document.getElementById('b2b2cPincode'),
            pincodeStatus:              document.getElementById('b2b2cPincodeStatus'),
            cityInput:                  document.getElementById('b2b2cCity'),
            stateInput:                 document.getElementById('b2b2cState'),
            carrierInput:               document.getElementById('b2b2cCarrier'),
            carrierDataList:            document.getElementById('b2b2cCarrierList'),
            expressTatInput:            document.getElementById('b2b2cExpressTat'),
            airlineTatInput:            document.getElementById('b2b2cAirlineTat'),
            surfaceTatInput:            document.getElementById('b2b2cSurfaceTat'),
            premiumTatInput:            document.getElementById('b2b2cPremiumTat'),
            odaInput:                   document.getElementById('b2b2cOda'),
            zoneInput:                  document.getElementById('b2b2cZone'),
            parentClientSearchInput:    document.getElementById('b2b2cParentSearch'),
            parentClientResultsContainer: document.getElementById('b2b2cParentResults'),
            parentClientDataList:       document.getElementById('b2b2cParentList'),
            codeHiddenInput:            document.getElementById('b2b2cCode'),
            branchInput:                document.getElementById('b2b2cBranch'),
            branchDataList:             document.getElementById('b2b2cBranchList'),
            
            // View / Edit Pane Elements
            viewContainer:              document.getElementById('b2b2cViewContainer'),
            viewContent:                document.getElementById('b2b2cViewContent'),
            editContainer:              document.getElementById('b2b2cEditContainer'),
            editCustomerBtn:            document.getElementById('b2b2cEditCustomerBtn'),
            cancelEditBtn:              document.getElementById('b2b2cCancelEditBtn'),
        };
    }

    // ── Mobile helpers ────────────────────────────────────────────────────────
    function _splitMobile(val) {
        if (!val) return { cc: '91', num: '' };
        const clean = val.replace('-', '');
        return { cc: '91', num: clean.replace(/^91/, '') };
    }
    function _joinMobile() {
        const cc  = (ui.mobileCCInput.value  || '91').trim();
        const num = (ui.mobileNumInput.value || '').trim();
        return num ? `${cc}${num}` : '';
    }

    // ── Constants ─────────────────────────────────────────────────────────────
    const DERIVED_FIELDS = ['CITY', 'STATE', 'CODE_STATE', 'GST_CODE', 'ZONE', 'EXPRESS_TAT', 'AIRLINE_TAT', 'SURFACE_TAT', 'PREMIUM_TAT', 'ODA'];
    const LOCKED_FIELDS  = ['NAME', 'BRANCH', 'CODE', 'GSTIN', 'PAN', 'AADHAAR', 'PINCODE', ...DERIVED_FIELDS];

    // ── Data loading ──────────────────────────────────────────────────────────
    function _handleDataLoaded(event) {
        const appData = event.detail.data;
        if (appData?.B2B)      { allParentClients = appData.B2B; _populateParentList(appData.B2B); }
        if (appData?.BRANCHES) _populateBranchList(appData.BRANCHES);
        if (appData?.CARRIERS) _populateCarrierList(appData.CARRIERS);
        if (appData?.B2B2C) {
            allClients = appData.B2B2C;
            _renderClientList(allClients);
            if (!currentUid) {
                _showB2b2cOverview();
            }
        }
    }

    // ── List rendering ────────────────────────────────────────────────────────
    function _renderClientList(clients) {
        if (!ui.clientList) return;
        ui.clientList.innerHTML = '';
        const keys = Object.keys(clients || {});
        if (!keys.length) {
            ui.clientList.innerHTML = '<li class="text-center text-gray-500 text-sm py-4">No matching clients.</li>';
            return;
        }
        keys.forEach(uid => {
            const c = clients[uid];
            const li = document.createElement('li');
            li.dataset.uid = uid;
            li.className = 'p-3 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors border border-gray-200';
            const parent = allParentClients[c.CODE];
            const parentName = parent ? (parent.B2B_NAME || c.CODE) : (c.CODE || 'N/A');
            li.innerHTML = `<strong class="text-indigo-700 block text-sm">${c.NAME || 'Unnamed'}</strong><span class="text-xs text-gray-500">${parentName}</span>`;
            li.addEventListener('click', () => _selectClientForView(uid));
            ui.clientList.appendChild(li);
        });
    }

    function _populateCarrierList(carriers) {
        if (!ui.carrierDataList) return;
        ui.carrierDataList.innerHTML = '';
        Object.values(carriers).forEach(c => {
            const opt = document.createElement('option');
            if (c.COMPANY_CODE && c.COMPANY_NAME) { opt.value = `${c.COMPANY_CODE} - ${c.COMPANY_NAME}`; opt.dataset.code = c.COMPANY_CODE; }
            else if (c.COMPANY_CODE) { opt.value = c.COMPANY_CODE; opt.dataset.code = c.COMPANY_CODE; }
            else if (c.COMPANY_NAME) { opt.value = c.COMPANY_NAME; opt.dataset.code = c.COMPANY_NAME; }
            else return;
            ui.carrierDataList.appendChild(opt);
        });
    }

    function _populateBranchList(branches) {
        if (!ui.branchDataList) return;
        ui.branchDataList.innerHTML = '';
        Object.values(branches).forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.BRANCH_CODE;
            opt.label = b.BRANCH_NAME ? `${b.BRANCH_CODE} - ${b.BRANCH_NAME}` : b.BRANCH_CODE;
            ui.branchDataList.appendChild(opt);
        });
    }

    function _populateParentList(b2b) {
        if (!ui.parentClientDataList) return;
        ui.parentClientDataList.innerHTML = '';
        Object.values(b2b).forEach(c => {
            if (!c.CODE) return;
            const opt = document.createElement('option');
            opt.value = c.B2B_NAME ? `${c.B2B_NAME} (${c.CODE})` : c.CODE;
            opt.dataset.code   = c.CODE;
            opt.dataset.branch = c.BRANCH || '';
            ui.parentClientDataList.appendChild(opt);
        });
    }

    // ── Form logic ────────────────────────────────────────────────────────────
    function _showB2b2cOverview() {
        ui.viewContainer.classList.remove('hidden');
        ui.editContainer.classList.add('hidden');

        ui.editCustomerBtn.classList.add('hidden');
        ui.deleteButton.classList.add('hidden');

        const headerTitle = ui.viewContainer.querySelector('h2');
        if (headerTitle) headerTitle.textContent = 'B2B2C Clients Overview';

        const clients = Object.values(allClients);

        let html = `
            <div class="overflow-x-auto">
                <table class="w-full text-sm border-collapse text-left mobile-cards-table">
                    <thead>
                        <tr class="bg-gray-100 border-b border-gray-200">
                            <th class="p-3 font-semibold text-gray-700">UID</th>
                            <th class="p-3 font-semibold text-gray-700">Name</th>
                            <th class="p-3 font-semibold text-gray-700">Mobile</th>
                            <th class="p-3 font-semibold text-gray-700">Branch</th>
                            <th class="p-3 font-semibold text-gray-700">Parent Code</th>
                            <th class="p-3 font-semibold text-gray-700">Crossover (Consignor / Consignee)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (clients.length === 0) {
            html += `<tr><td colspan="6" class="p-4 text-center text-gray-500">No clients found.</td></tr>`;
        } else {
            clients.forEach(c => {
                const crossover = c.CROSSOVER || {};
                let consignor_cnt = parseInt(crossover.CONSIGNOR) || 0;
                let consignee_cnt = parseInt(crossover.CONSIGNEE) || 0;

                html += `
                    <tr class="border-b hover:bg-indigo-50 cursor-pointer transition-colors" data-uid="${c.UID}">
                        <td class="p-3 font-mono font-bold text-indigo-600" data-label="UID">${c.UID}</td>
                        <td class="p-3" data-label="Name">${c.NAME || '-'}</td>
                        <td class="p-3" data-label="Mobile">${c.MOBILE || '-'}</td>
                        <td class="p-3" data-label="Branch">${c.BRANCH || '-'}</td>
                        <td class="p-3 font-mono" data-label="Parent Code">${c.CODE || '-'}</td>
                        <td class="p-3 text-xs text-gray-500" data-label="Crossover">Consignor: <strong>${consignor_cnt}</strong> | Consignee: <strong>${consignee_cnt}</strong></td>
                    </tr>
                `;
            });
        }

        html += `
                    </tbody>
                </table>
            </div>
        `;
        ui.viewContent.innerHTML = html;

        ui.viewContent.querySelectorAll('tbody tr').forEach(tr => {
            const uid = tr.dataset.uid;
            if (uid) {
                tr.addEventListener('click', () => _selectClientForView(uid));
            }
        });
    }

    function _showClientView(client) {
        ui.viewContainer.classList.remove('hidden');
        ui.editContainer.classList.add('hidden');

        ui.editCustomerBtn.classList.remove('hidden');
        ui.deleteButton.classList.remove('hidden');

        const headerTitle = ui.viewContainer.querySelector('h2');
        if (headerTitle) headerTitle.textContent = 'B2B2C Client Details';

        const parent = allParentClients[client.CODE];
        const parentName = parent ? `${parent.B2B_NAME} (${client.CODE})` : (client.CODE || '-');

        const crossover = client.CROSSOVER || {};
        let consignor_cnt = crossover.CONSIGNOR || 0;
        let consignee_cnt = crossover.CONSIGNEE || 0;

        let html = `
            <div class="space-y-6">
                <div class="border-b pb-4">
                    <h3 class="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-3">Core Information</h3>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div><span class="font-semibold text-gray-600">UID:</span> ${client.UID || '-'}</div>
                        <div><span class="font-semibold text-gray-600">Name:</span> ${client.NAME || '-'}</div>
                        <div><span class="font-semibold text-gray-600">Mobile:</span> ${client.MOBILE || '-'}</div>
                        <div><span class="font-semibold text-gray-600">Email:</span> ${client.EMAIL || '-'}</div>
                        <div><span class="font-semibold text-gray-600">Branch:</span> ${client.BRANCH || '-'}</div>
                        <div><span class="font-semibold text-gray-600">Parent Client:</span> ${parentName}</div>
                        <div><span class="font-semibold text-gray-600">GSTIN:</span> ${client.GSTIN || '-'}</div>
                        <div><span class="font-semibold text-gray-600">PAN:</span> ${client.PAN || '-'}</div>
                        <div><span class="font-semibold text-gray-600">Aadhaar:</span> ${client.AADHAAR || '-'}</div>
                    </div>
                </div>
                <div class="border-b pb-4">
                    <h3 class="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-3">Address & Pincode</h3>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div class="col-span-2 md:col-span-3"><span class="font-semibold text-gray-600">Address:</span> ${client.ADDRESS || '-'}</div>
                        <div><span class="font-semibold text-gray-600">Pincode:</span> ${client.PINCODE || '-'}</div>
                        <div><span class="font-semibold text-gray-600">City:</span> ${client.CITY || '-'}</div>
                        <div><span class="font-semibold text-gray-600">State:</span> ${client.STATE || '-'}</div>
                        <div><span class="font-semibold text-gray-600">Zone:</span> ${client.ZONE || '-'}</div>
                    </div>
                </div>
                <div class="border-b pb-4">
                    <h3 class="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-3">Service Details</h3>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div><span class="font-semibold text-gray-600">Carrier:</span> ${client.CARRIER || '-'}</div>
                        <div><span class="font-semibold text-gray-600">Express TAT:</span> ${client.EXPRESS_TAT !== undefined ? client.EXPRESS_TAT : '-'}</div>
                        <div><span class="font-semibold text-gray-600">Airline TAT:</span> ${client.AIRLINE_TAT !== undefined ? client.AIRLINE_TAT : '-'}</div>
                        <div><span class="font-semibold text-gray-600">Surface TAT:</span> ${client.SURFACE_TAT !== undefined ? client.SURFACE_TAT : '-'}</div>
                        <div><span class="font-semibold text-gray-600">Premium TAT:</span> ${client.PREMIUM_TAT !== undefined ? client.PREMIUM_TAT : '-'}</div>
                        <div><span class="font-semibold text-gray-600">ODA:</span> ${client.ODA || '-'}</div>
                    </div>
                </div>
                <div>
                    <h3 class="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-3">Linked Orders (Crossover)</h3>
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div><span class="font-semibold text-gray-600">Consignor Orders:</span> ${consignor_cnt}</div>
                        <div><span class="font-semibold text-gray-600">Consignee Orders:</span> ${consignee_cnt}</div>
                    </div>
                </div>
            </div>
        `;
        ui.viewContent.innerHTML = html;
    }

    function _selectClientForView(uid) {
        const client = allClients[uid];
        if (!client) return;
        currentUid = uid;
        ui.deleteConfirm.classList.add('hidden');
        ui.deleteButton.classList.remove('hidden');

        _showClientView(client);

        // show detail pane
        AdminPage.showDetail(true);
        AdminPage.showDetailPane?.();
    }

    function _switchToEditMode() {
        if (!currentUid) return;
        const client = allClients[currentUid];
        if (!client) return;

        ui.viewContainer.classList.add('hidden');
        ui.editContainer.classList.remove('hidden');
        _populateFormForEdit(currentUid);
    }

    function _cancelEdit() {
        if (currentUid) {
            const client = allClients[currentUid];
            if (client) {
                _showClientView(client);
                return;
            }
        }
        _resetForm();
        _showB2b2cOverview();
    }

    function _newClient() {
        currentUid = null;
        _resetForm();
        ui.viewContainer.classList.add('hidden');
        ui.editContainer.classList.remove('hidden');
        AdminPage.showDetail(true);
        AdminPage.showDetailPane?.();
    }

    function _populateFormForEdit(uid) {
        const client = allClients[uid];
        if (!client) return;
        _resetForm();

        ui.recordIdInput.value = client.id || '';
        for (const key in client) {
            if (key === 'MOBILE') continue;
            const input = ui.form.querySelector(`[name="${key}"]`);
            if (input) input.value = key === 'TIME_STAMP' && client[key] ? fmtDate(client[key], 'full') : (client[key] ?? '');
        }
        const { cc, num } = _splitMobile(client.MOBILE);
        ui.mobileCCInput.value  = cc;
        ui.mobileNumInput.value = num;

        if (client.CODE) {
            const parent = allParentClients[client.CODE];
            ui.parentClientSearchInput.value = parent ? `${parent.B2B_NAME} (${parent.CODE})` : client.CODE;
        }
        if (client.CARRIER) {
            const match = Array.from(ui.carrierDataList.options).find(o => o.dataset.code === client.CARRIER);
            ui.carrierInput.value = match ? match.dataset.code : client.CARRIER;
        }

        LOCKED_FIELDS.forEach(f => {
            const el = ui.form.querySelector(`[name="${f}"]`);
            if (el) { el.readOnly = true; el.classList.add('readonly-input'); }
        });
        ui.parentClientSearchInput.readOnly = true;
        ui.parentClientSearchInput.classList.add('readonly-input');

        isUpdateMode = true;
        ui.uidInput.readOnly = true;
        ui.uidInput.classList.add('readonly-input');
        ui.buttonText.textContent = `Update Client ${uid}`;
    }

    function _resetForm() {
        ui.form.reset();
        ui.recordIdInput.value  = '';
        ui.mobileCCInput.value  = '91';
        ui.mobileNumInput.value = '';
        isUpdateMode = false;
        ui.uidInput.readOnly = true;
        ui.uidInput.classList.add('readonly-input');
        ui.buttonText.textContent = 'Submit New Client';
        ui.deleteConfirm.classList.add('hidden');
        ui.pincodeStatus.innerHTML = '';
        _clearPincodeFields();
        ui.parentClientSearchInput.value = '';
        ui.parentClientSearchInput.readOnly = false;
        ui.parentClientSearchInput.classList.remove('readonly-input');
        ui.parentClientResultsContainer.innerHTML = '';
        ui.parentClientResultsContainer.classList.add('hidden');
        ui.codeHiddenInput.value = '';
        LOCKED_FIELDS.forEach(f => {
            const el = ui.form.querySelector(`[name="${f}"]`);
            if (el && !DERIVED_FIELDS.includes(f)) { el.readOnly = false; el.classList.remove('readonly-input'); }
        });
        _lockDerived();
    }

    function _clearPincodeFields() {
        [ui.cityInput, ui.stateInput, ui.zoneInput,
         ui.expressTatInput, ui.airlineTatInput, ui.surfaceTatInput, ui.premiumTatInput, ui.odaInput
        ].forEach(f => { if (f) f.value = ''; });
        const csEl = ui.form.querySelector('[name="CODE_STATE"]');
        const gcEl = ui.form.querySelector('[name="GST_CODE"]');
        if (csEl) csEl.value = '';
        if (gcEl) gcEl.value = '';
    }

    function _lockDerived() {
        DERIVED_FIELDS.forEach(f => {
            const el = ui.form.querySelector(`[name="${f}"]`);
            if (el) { el.readOnly = true; el.classList.add('readonly-input'); }
        });
    }

    function _unlockLogistics() {
        ['ZONE', 'EXPRESS_TAT', 'AIRLINE_TAT', 'SURFACE_TAT', 'PREMIUM_TAT', 'ODA'].forEach(f => {
            const el = ui.form.querySelector(`[name="${f}"]`);
            if (el) { el.readOnly = false; el.classList.remove('readonly-input'); }
        });
    }

    // ── Pincode lookup ────────────────────────────────────────────────────────
    async function _lookupPincode(pincode) {
        ui.pincodeStatus.innerHTML = '<span class="text-gray-400 text-xs">searching...</span>';

        if (typeof window.searchPin !== 'function') {
            ui.pincodeStatus.innerHTML = '<span class="text-red-500">✖ searchPin unavailable</span>';
            return;
        }

        const result = await window.searchPin(pincode);
        const csEl = ui.form.querySelector('[name="CODE_STATE"]');
        const gcEl = ui.form.querySelector('[name="GST_CODE"]');

        if (result.found) {
            ui.cityInput.value       = result.CITY       || '';
            ui.stateInput.value      = result.STATE_NAME || result.STATE || '';
            if (csEl) csEl.value     = result.STATE_CODE || '';
            if (gcEl) gcEl.value     = result.GST_CODE   || '';
            ui.zoneInput.value       = result.ZONE       || '';
            ui.odaInput.value        = result.ODA        || '';
            ui.expressTatInput.value = result.EXPRESS_TAT !== 'N' ? (result.EXPRESS_TAT || '') : '';
            ui.airlineTatInput.value = result.AIRLINE_TAT !== 'N' ? (result.AIRLINE_TAT || '') : '';
            ui.surfaceTatInput.value = result.SURFACE_TAT !== 'N' ? (result.SURFACE_TAT || '') : '';
            ui.premiumTatInput.value = result.PREMIUM_TAT !== 'N' ? (result.PREMIUM_TAT || '') : '';
            if (result.ZONE === null) {
                _unlockLogistics();
                ui.pincodeStatus.innerHTML = '<span class="text-yellow-500" title="Zone, ODA and TAT must be filled manually.">⚠ partial</span>';
            } else {
                _lockDerived();
                ui.pincodeStatus.innerHTML = '<span class="text-green-500">✔</span>';
            }
        } else {
            _clearPincodeFields();
            _lockDerived();
            ui.pincodeStatus.innerHTML = '<span class="text-red-500">✖</span>';
        }
    }

    // ── Network ───────────────────────────────────────────────────────────────
    async function _handleRequest(action) {
        const isDelete = action === 'delete';
        _setLoading(true, isDelete ? 'delete' : 'submit');
        try {
            const uid = isDelete ? currentUid : ui.uidInput.value;
            let result;
            if (isDelete) {
                result = await b2b2cDelete(uid);
            } else if (isUpdateMode) {
                const payload = { MOBILE: _joinMobile() };
                ['EMAIL', 'ADDRESS', 'CARRIER'].forEach(f => {
                    const el = ui.form.querySelector(`[name="${f}"]`);
                    if (el) payload[f] = el.value;
                });
                result = await b2b2cUpdate(uid, payload);
            } else {
                const data = {};
                new FormData(ui.form).forEach((v, k) => { data[k] = v; });
                data.MOBILE = _joinMobile();
                result = await b2b2cCreate(data);
            }

            const msg = isDelete ? 'Contact deleted.' : isUpdateMode ? 'Contact updated.' : `Contact created. UID: ${result.uid}`;
            if (isDelete) {
                currentUid = null;
                _resetForm();
                _showB2b2cOverview();
            } else {
                const targetUid = isUpdateMode ? uid : result.uid;
                setTimeout(() => {
                    _selectClientForView(targetUid);
                }, 100);
            }
            _showMsg(msg, 'success');
        } catch (err) {
            _showMsg(err.message, 'error');
            if (isDelete) { ui.deleteConfirm.classList.add('hidden'); ui.deleteButton.classList.remove('hidden'); }
        }
        _setLoading(false, isDelete ? 'delete' : 'submit');
        if (isDelete) { ui.deleteConfirm.classList.add('hidden'); ui.deleteButton.classList.remove('hidden'); }
    }

    // ── UI helpers ────────────────────────────────────────────────────────────
    function _setLoading(isLoading, type) {
        if (type === 'delete') {
            ui.deleteSpinner.classList.toggle('hidden', !isLoading);
            ui.confirmDeleteBtn.disabled = isLoading;
            ui.cancelDeleteBtn.disabled  = isLoading;
        } else {
            ui.spinner.classList.toggle('hidden', !isLoading);
            ui.submitButton.disabled = isLoading;
            ui.buttonText.textContent = isLoading
                ? (isUpdateMode ? 'Updating...' : 'Submitting...')
                : (isUpdateMode ? `Update Client ${ui.uidInput.value}` : 'Submit New Client');
        }
    }

    function _showMsg(message, type) {
        if (!ui.responseMessage) return;
        ui.responseMessage.innerHTML = `<p class="font-semibold">${message}</p>`;
        ui.responseMessage.className = `mt-4 text-center p-3 rounded-lg text-sm ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
        ui.responseMessage.classList.remove('hidden');
    }

    // ── Event binding ─────────────────────────────────────────────────────────
    function _bindEvents() {
        ui.carrierInput.addEventListener('input', e => {
            const opt = Array.from(ui.carrierDataList.options).find(o => o.value === e.target.value);
            if (opt?.dataset.code) setTimeout(() => { e.target.value = opt.dataset.code; }, 0);
        });

        ui.searchClientInput.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            if (!q) { _renderClientList(allClients); return; }
            const filtered = {};
            Object.entries(allClients).forEach(([uid, c]) => {
                if ((c.NAME || '').toLowerCase().includes(q) || uid.toLowerCase().includes(q) || (c.CODE || '').toLowerCase().includes(q))
                    filtered[uid] = c;
            });
            _renderClientList(filtered);
        });

        ui.parentClientSearchInput.addEventListener('input', e => {
            const val = e.target.value;
            const selected = Array.from(ui.parentClientDataList.options).find(o => o.value === val);
            if (selected) {
                ui.codeHiddenInput.value = selected.dataset.code;
                if (selected.dataset.branch) ui.branchInput.value = selected.dataset.branch;
                ui.parentClientResultsContainer.classList.add('hidden');
                return;
            }
            const q = val.toLowerCase();
            ui.parentClientResultsContainer.innerHTML = '';
            ui.parentClientResultsContainer.classList.add('hidden');
            ui.codeHiddenInput.value = '';
            if (!q) return;
            const matches = Object.values(allParentClients).filter(c =>
                c.CODE && c.B2B_NAME &&
                ((c.B2B_NAME || '').toLowerCase().includes(q) || (c.CODE || '').toLowerCase().includes(q))
            );
            if (matches.length) {
                matches.forEach(c => {
                    const item = document.createElement('div');
                    item.className = 'p-2 hover:bg-gray-100 cursor-pointer text-sm';
                    item.textContent = `${c.B2B_NAME} (${c.CODE})`;
                    item.addEventListener('mousedown', () => {
                        ui.parentClientSearchInput.value = item.textContent;
                        ui.codeHiddenInput.value = c.CODE;
                        ui.parentClientResultsContainer.classList.add('hidden');
                        if (c.BRANCH) ui.branchInput.value = c.BRANCH;
                    });
                    ui.parentClientResultsContainer.appendChild(item);
                });
                ui.parentClientResultsContainer.classList.remove('hidden');
            }
        });

        document.addEventListener('click', e => {
            if (!ui.parentClientSearchInput.contains(e.target) && !ui.parentClientResultsContainer.contains(e.target))
                ui.parentClientResultsContainer.classList.add('hidden');
        });

        ui.newClientBtn.addEventListener('click', _newClient);

        ui.pincodeInput.addEventListener('input', async () => {
            ui.pincodeStatus.innerHTML = '';
            const pin = ui.pincodeInput.value.trim();
            if (pin.length < 6) { _clearPincodeFields(); _lockDerived(); }
            else if (pin.length === 6 && /^\d{6}$/.test(pin)) await _lookupPincode(pin);
        });

        ui.deleteButton.addEventListener('click', () => {
            if (!currentUid) return;
            const client = allClients[currentUid];
            if (!client) return;
            ui.clientToDeleteSpan.textContent = `${client.NAME} (${currentUid})`;
            ui.deleteConfirm.classList.remove('hidden');
            ui.deleteButton.classList.add('hidden');
        });

        ui.cancelDeleteBtn.addEventListener('click', () => {
            ui.deleteConfirm.classList.add('hidden');
            ui.deleteButton.classList.remove('hidden');
        });

        ui.confirmDeleteBtn.addEventListener('click', () => _handleRequest('delete'));

        ui.editCustomerBtn.addEventListener('click', _switchToEditMode);
        ui.cancelEditBtn.addEventListener('click', _cancelEdit);

        ui.form.addEventListener('submit', e => {
            e.preventDefault();
            if (!ui.codeHiddenInput.value) {
                _showMsg('Please select a valid Parent Client from the search.', 'error');
                ui.parentClientSearchInput.focus();
                return;
            }
            _handleRequest('submit');
        });
    }

    // ── Public init ───────────────────────────────────────────────────────────
    function init() {
        _bindUI();
        _bindEvents();
        window.addEventListener('appDataLoaded',    _handleDataLoaded);
        window.addEventListener('appDataRefreshed', _handleDataLoaded);
    }

    function refresh(data) {
        // re-bind clientList since _injectListPane creates a new element each activation
        ui.clientList = document.getElementById('b2b2cClientList');
        _handleDataLoaded({ detail: { data } });
    }

    return { init, refresh };
})();

window.B2B2CModule = B2B2CModule;
