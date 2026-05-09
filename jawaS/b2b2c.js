// ============================================================================
// B2B2C.JS — Client list + form logic, init()-based
// Called by admin-b2b2c.js after HTML is injected into the admin panel
// ============================================================================

const B2B2CModule = (() => {

    let allClients = {};
    let allParentClients = {};
    let isUpdateMode = false;
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
            searchClientInput:          document.getElementById('b2b2cSearchClient'),
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
        };
    }

    // ── Mobile helpers ────────────────────────────────────────────────────────
    function _splitMobile(val) {
        if (!val) return { cc: '91', num: '' };
        const idx = val.indexOf('-');
        return idx === -1 ? { cc: '91', num: val } : { cc: val.slice(0, idx), num: val.slice(idx + 1) };
    }
    function _joinMobile() {
        const cc  = (ui.mobileCCInput.value  || '91').trim();
        const num = (ui.mobileNumInput.value || '').trim();
        return num ? `${cc}-${num}` : '';
    }

    // ── Constants ─────────────────────────────────────────────────────────────
    const DERIVED_FIELDS = ['CITY', 'STATE', 'ZONE', 'EXPRESS_TAT', 'AIRLINE_TAT', 'SURFACE_TAT', 'PREMIUM_TAT', 'ODA'];
    const LOCKED_FIELDS  = ['NAME', 'BRANCH', 'CODE', 'GST_ID_PAN_ADHAR', 'PINCODE', ...DERIVED_FIELDS];

    // ── Data loading ──────────────────────────────────────────────────────────
    function _handleDataLoaded(event) {
        const appData = event.detail.data;
        if (appData?.B2B2C) { allClients = appData.B2B2C; _renderClientList(allClients); }
        if (appData?.B2B)      { allParentClients = appData.B2B; _populateParentList(appData.B2B); }
        if (appData?.BRANCHES) _populateBranchList(appData.BRANCHES);
        if (appData?.CARRIERS) _populateCarrierList(appData.CARRIERS);
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
            li.innerHTML = `<strong class="text-indigo-700 block text-sm">${c.NAME || 'Unnamed'}</strong><span class="text-xs text-gray-600">${uid}</span>`;
            li.addEventListener('click', () => _populateFormForEdit(uid));
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
    function _populateFormForEdit(uid) {
        const client = allClients[uid];
        if (!client) return;
        _resetForm();

        ui.recordIdInput.value = client.id || '';
        for (const key in client) {
            if (key === 'MOBILE') continue;
            const input = ui.form.querySelector(`[name="${key}"]`);
            if (input) input.value = key === 'TIME_STAMP' && client[key] ? fmtDate(client[key], 'full') : (client[key] || '');
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
        ui.deleteButton.classList.remove('hidden');

        // show detail pane
        AdminPage.showDetail(true);
        document.getElementById('adminDetailPane')?.classList.add('mobile-show');
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
        ui.deleteButton.classList.add('hidden');
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

        // try local map first (fast, full data)
        if (typeof searchPin === 'function') {
            const local = searchPin(pincode);
            if (local.found) {
                ui.cityInput.value       = local.CITY;
                ui.stateInput.value      = local.STATE;
                ui.zoneInput.value       = local.ZONE;
                ui.odaInput.value        = local.ODA;
                ui.expressTatInput.value = local.EXPRESS_TAT !== 'N' ? local.EXPRESS_TAT : '';
                ui.airlineTatInput.value = local.AIRLINE_TAT !== 'N' ? local.AIRLINE_TAT : '';
                ui.surfaceTatInput.value = local.SURFACE_TAT !== 'N' ? local.SURFACE_TAT : '';
                ui.premiumTatInput.value = local.PREMIUM_TAT !== 'N' ? local.PREMIUM_TAT : '';
                _lockDerived();
                ui.pincodeStatus.innerHTML = '<span class="text-green-500">✔</span>';
                return;
            }
        }

        // fallback to Post Office web API
        const web = await searchPinWeb(pincode);
        if (web.found) {
            ui.cityInput.value  = web.CITY;
            ui.stateInput.value = web.STATE;
            ui.zoneInput.value = ui.odaInput.value = ui.expressTatInput.value =
            ui.airlineTatInput.value = ui.surfaceTatInput.value = ui.premiumTatInput.value = '';
            _unlockLogistics();
            ui.pincodeStatus.innerHTML = '<span class="text-yellow-500" title="Zone, ODA and TAT must be filled manually.">⚠ partial</span>';
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
            const uid = ui.uidInput.value;
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
            _resetForm();
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

        ui.newClientBtn.addEventListener('click', () => {
            _resetForm();
            AdminPage.showDetail(true);
            document.getElementById('adminDetailPane')?.classList.add('mobile-show');
        });

        ui.pincodeInput.addEventListener('input', async () => {
            ui.pincodeStatus.innerHTML = '';
            const pin = ui.pincodeInput.value.trim();
            if (pin.length < 6) { _clearPincodeFields(); _lockDerived(); }
            else if (pin.length === 6 && /^\d{6}$/.test(pin)) await _lookupPincode(pin);
        });

        ui.deleteButton.addEventListener('click', () => {
            const uid  = ui.uidInput.value;
            const name = ui.form.querySelector('[name="NAME"]').value;
            if (!uid) return;
            ui.clientToDeleteSpan.textContent = `${name} (${uid})`;
            ui.deleteConfirm.classList.remove('hidden');
            ui.deleteButton.classList.add('hidden');
        });

        ui.cancelDeleteBtn.addEventListener('click', () => {
            ui.deleteConfirm.classList.add('hidden');
            ui.deleteButton.classList.remove('hidden');
        });

        ui.confirmDeleteBtn.addEventListener('click', () => _handleRequest('delete'));

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
