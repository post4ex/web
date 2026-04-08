import { searchPin } from '../utils/searchpin.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let allClients = {};
    let allParentClients = {};
    let isUpdateMode = false;

    // --- UI ELEMENTS ---
    const ui = {
        form: document.getElementById('clientForm'),
        recordIdInput: document.getElementById('record_id'),
        submitButton: document.getElementById('submitButton'),
        buttonText: document.getElementById('buttonText'),
        spinner: document.getElementById('spinner'),
        responseMessage: document.getElementById('responseMessage'),
        clientList: document.getElementById('clientList'),
        searchClientInput: document.getElementById('searchClient'),
        newClientBtn: document.getElementById('newClientBtn'),
        uidInput: document.getElementById('uid'),
        deleteButton: document.getElementById('deleteButton'),
        deleteConfirm: document.getElementById('deleteConfirm'),
        clientToDeleteSpan: document.getElementById('clientToDelete'),
        cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
        confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
        deleteSpinner: document.getElementById('deleteSpinner'),
        clientListContainer: document.getElementById('clientListContainer'),
        clientFormContainer: document.getElementById('clientFormContainer'),
        backToListBtn: document.getElementById('backToListBtn'),
        pincodeInput: document.getElementById('pincode'),
        pincodeStatus: document.getElementById('pincodeStatus'),
        cityInput: document.getElementById('city'),
        stateInput: document.getElementById('state'),
        carrierInput: document.getElementById('carrier'),
        carrierDataList: document.getElementById('carrier-list'),
        expressTatInput: document.getElementById('express_tat'),
        airlineTatInput: document.getElementById('airline_tat'),
        surfaceTatInput: document.getElementById('surface_tat'),
        premiumTatInput: document.getElementById('premium_tat'),
        odaInput: document.getElementById('oda'),
        zoneInput: document.getElementById('zone'),
        parentClientSearchInput: document.getElementById('parentClientSearch'),
        parentClientResultsContainer: document.getElementById('parentClientResults'),
        parentClientDataList: document.getElementById('parent-client-list'),
        codeHiddenInput: document.getElementById('code'),
        branchInput: document.getElementById('branch'),
        branchDataList: document.getElementById('branch-list')
    };

    // --- VIEW LOGIC ---
    const isMobileView = () => window.innerWidth < 768;

    const showFormView = () => {
        if (isMobileView()) {
            ui.clientListContainer.classList.add('hidden');
            ui.clientFormContainer.classList.remove('hidden', 'md:block');
            ui.clientFormContainer.classList.add('block');
        }
    };

    const showListView = () => {
        if (isMobileView()) {
            ui.clientListContainer.classList.remove('hidden');
            ui.clientFormContainer.classList.add('hidden');
        }
    };

    const handleResize = () => {
        if (!isMobileView()) {
            ui.clientListContainer.classList.remove('hidden');
            ui.clientFormContainer.classList.remove('hidden');
            ui.clientFormContainer.classList.add('md:block');
        } else {
            if (!ui.clientFormContainer.classList.contains('hidden')) {
                ui.clientListContainer.classList.add('hidden');
            } else {
                ui.clientListContainer.classList.remove('hidden');
                ui.clientFormContainer.classList.add('hidden');
            }
        }
    };
    window.addEventListener('resize', handleResize);

    // --- DATA & RENDERING ---
    const handleDataLoaded = (event) => {
        const appData = event.detail.data;

        if (appData && appData.B2B2C) {
            allClients = appData.B2B2C;
            renderClientList(allClients);
        } else {
            document.getElementById('clientLoader').textContent = 'No B2B2C clients found.';
        }

        if (appData && appData.B2B) {
            allParentClients = appData.B2B;
            populateParentClientDataList(appData.B2B);
        }

        if (appData && appData.BRANCHES) populateBranchDataList(appData.BRANCHES);
        if (appData && appData.CARRIERS) populateCarrierDataList(appData.CARRIERS);
    };

    window.addEventListener('appDataLoaded', handleDataLoaded);
    window.addEventListener('appDataRefreshed', handleDataLoaded);

    const renderClientList = (clients) => {
        ui.clientList.innerHTML = '';
        const keys = Object.keys(clients || {});
        if (!keys.length) {
            ui.clientList.innerHTML = '<li class="text-center text-gray-500">No matching clients.</li>';
            return;
        }
        keys.forEach(uid => {
            const client = clients[uid];
            const li = document.createElement('li');
            li.className = 'p-3 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors border border-gray-200';
            li.innerHTML = `<strong class="text-indigo-700 block text-sm">${client.NAME || 'Unnamed'}</strong><span class="text-xs text-gray-600">${uid}</span>`;
            li.addEventListener('click', () => populateFormForEdit(uid));
            ui.clientList.appendChild(li);
        });
    };

    const populateCarrierDataList = (carriers) => {
        ui.carrierDataList.innerHTML = '';
        Object.values(carriers).forEach(carrier => {
            const option = document.createElement('option');
            if (carrier.COMPANY_CODE && carrier.COMPANY_NAME) {
                option.value = `${carrier.COMPANY_CODE} - ${carrier.COMPANY_NAME}`;
                option.dataset.code = carrier.COMPANY_CODE;
            } else if (carrier.COMPANY_CODE) {
                option.value = carrier.COMPANY_CODE;
                option.dataset.code = carrier.COMPANY_CODE;
            } else if (carrier.COMPANY_NAME) {
                option.value = carrier.COMPANY_NAME;
                option.dataset.code = carrier.COMPANY_NAME;
            } else return;
            ui.carrierDataList.appendChild(option);
        });
    };

    const populateBranchDataList = (branches) => {
        ui.branchDataList.innerHTML = '';
        Object.values(branches).forEach(b => {
            const option = document.createElement('option');
            option.value = b.BRANCH_CODE;
            option.label = b.BRANCH_NAME ? `${b.BRANCH_CODE} - ${b.BRANCH_NAME}` : b.BRANCH_CODE;
            ui.branchDataList.appendChild(option);
        });
    };

    const populateParentClientDataList = (b2b) => {
        ui.parentClientDataList.innerHTML = '';
        Object.values(b2b).forEach(c => {
            if (!c.CODE) return;
            const option = document.createElement('option');
            option.value = c.B2B_NAME ? `${c.B2B_NAME} (${c.CODE})` : c.CODE;
            option.dataset.code = c.CODE;
            option.dataset.branch = c.BRANCH || '';
            ui.parentClientDataList.appendChild(option);
        });
    };

    // --- FORM & PINCODE LOGIC ---
    const DERIVED_FIELDS = ['CITY', 'STATE', 'ZONE', 'EXPRESS_TAT', 'AIRLINE_TAT', 'SURFACE_TAT', 'PREMIUM_TAT', 'ODA'];
    const LOCKED_FIELDS = ['NAME', 'BRANCH', 'CODE', 'GST_ID_PAN_ADHAR', 'PINCODE', ...DERIVED_FIELDS];

    const populateFormForEdit = (uid) => {
        const client = allClients[uid];
        if (!client) return;
        resetForm();

        ui.recordIdInput.value = client.id || '';

        for (const key in client) {
            const input = ui.form.querySelector(`[name="${key}"]`);
            if (input) {
                input.value = key === 'TIME_STAMP' && client[key] ? fmtDate(client[key], 'full') : (client[key] || '');
            }
        }

        if (client.CODE) {
            const parentClient = allParentClients[client.CODE];
            ui.parentClientSearchInput.value = parentClient
                ? `${parentClient.B2B_NAME} (${parentClient.CODE})`
                : client.CODE;
        }

        if (client.CARRIER) {
            const matchingOption = Array.from(ui.carrierDataList.options).find(opt => opt.dataset.code === client.CARRIER);
            ui.carrierInput.value = matchingOption ? matchingOption.dataset.code : client.CARRIER;
        }

        LOCKED_FIELDS.forEach(field => {
            const el = ui.form.querySelector(`[name="${field}"]`);
            if (el) { el.readOnly = true; el.classList.add('readonly-input'); }
        });
        ui.parentClientSearchInput.readOnly = true;
        ui.parentClientSearchInput.classList.add('readonly-input');

        isUpdateMode = true;
        ui.uidInput.readOnly = true;
        ui.uidInput.classList.add('readonly-input');
        ui.buttonText.textContent = `Update Client ${uid}`;
        ui.deleteButton.classList.remove('hidden');
        showFormView();
    };

    const resetForm = () => {
        ui.form.reset();
        ui.recordIdInput.value = '';
        isUpdateMode = false;
        ui.uidInput.readOnly = true;
        ui.uidInput.classList.add('readonly-input');
        ui.buttonText.textContent = 'Submit New Client';
        ui.deleteButton.classList.add('hidden');
        ui.deleteConfirm.classList.add('hidden');
        ui.pincodeStatus.innerHTML = '';
        clearPincodeDataFields();
        ui.parentClientSearchInput.value = '';
        ui.parentClientSearchInput.readOnly = false;
        ui.parentClientSearchInput.classList.remove('readonly-input');
        ui.parentClientResultsContainer.innerHTML = '';
        ui.parentClientResultsContainer.classList.add('hidden');
        ui.codeHiddenInput.value = '';
        LOCKED_FIELDS.forEach(field => {
            const el = ui.form.querySelector(`[name="${field}"]`);
            if (el && !DERIVED_FIELDS.includes(field)) {
                el.readOnly = false;
                el.classList.remove('readonly-input');
            }
        });
        lockDerivedFields();
    };

    const clearPincodeDataFields = () => {
        [ui.cityInput, ui.stateInput, ui.zoneInput,
         ui.expressTatInput, ui.airlineTatInput, ui.surfaceTatInput, ui.premiumTatInput, ui.odaInput
        ].forEach(f => f.value = '');
    };

    const lockDerivedFields = () => {
        DERIVED_FIELDS.forEach(field => {
            const el = ui.form.querySelector(`[name="${field}"]`);
            if (el) { el.readOnly = true; el.classList.add('readonly-input'); }
        });
    };

    const unlockLogisticsFields = () => {
        ['ZONE', 'EXPRESS_TAT', 'AIRLINE_TAT', 'SURFACE_TAT', 'PREMIUM_TAT', 'ODA'].forEach(field => {
            const el = ui.form.querySelector(`[name="${field}"]`);
            if (el) { el.readOnly = false; el.classList.remove('readonly-input'); }
        });
    };

    async function lookupPincode(pincode) {
        // Try local map first
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
            lockDerivedFields();
            ui.pincodeStatus.innerHTML = '<span class="text-green-500">✔</span>';
            return;
        }

        // Fallback to Post Office web API
        ui.pincodeStatus.innerHTML = '<span class="text-gray-400 text-xs">searching...</span>';
        const web = await searchPinWeb(pincode);
        if (web.found) {
            ui.cityInput.value  = web.CITY;
            ui.stateInput.value = web.STATE;
            // ZONE, ODA, TAT not available — clear and unlock for manual entry
            ui.zoneInput.value       = '';
            ui.odaInput.value        = '';
            ui.expressTatInput.value = '';
            ui.airlineTatInput.value = '';
            ui.surfaceTatInput.value = '';
            ui.premiumTatInput.value = '';
            unlockLogisticsFields();
            ui.pincodeStatus.innerHTML = '<span class="text-yellow-500" title="City/State filled from Post Office API. Zone, ODA and TAT must be filled manually.">⚠ partial</span>';
        } else {
            clearPincodeDataFields();
            lockDerivedFields();
            ui.pincodeStatus.innerHTML = '<span class="text-red-500">✖</span>';
        }
    }

    // --- EVENT LISTENERS ---
    ui.carrierInput.addEventListener('input', (e) => {
        const selectedOption = Array.from(ui.carrierDataList.options).find(opt => opt.value === e.target.value);
        if (selectedOption?.dataset.code) {
            setTimeout(() => { e.target.value = selectedOption.dataset.code; }, 0);
        }
    });

    ui.searchClientInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        if (!searchTerm) { renderClientList(allClients); return; }
        const filtered = {};
        Object.entries(allClients).forEach(([uid, client]) => {
            if ((client.NAME || '').toLowerCase().includes(searchTerm) ||
                uid.toLowerCase().includes(searchTerm) ||
                (client.CODE || '').toLowerCase().includes(searchTerm)) {
                filtered[uid] = client;
            }
        });
        renderClientList(filtered);
    });

    ui.parentClientSearchInput.addEventListener('input', (e) => {
        const inputValue = e.target.value;
        const selected = Array.from(ui.parentClientDataList.options).find(o => o.value === inputValue);
        if (selected) {
            ui.codeHiddenInput.value = selected.dataset.code;
            if (selected.dataset.branch) ui.branchInput.value = selected.dataset.branch;
            ui.parentClientResultsContainer.classList.add('hidden');
            return;
        }

        const searchTerm = inputValue.toLowerCase();
        ui.parentClientResultsContainer.innerHTML = '';
        ui.parentClientResultsContainer.classList.add('hidden');
        ui.codeHiddenInput.value = '';
        if (!searchTerm) return;

        const matches = Object.values(allParentClients).filter(c =>
            c.CODE && c.B2B_NAME &&
            ((c.B2B_NAME || '').toLowerCase().includes(searchTerm) ||
             (c.CODE || '').toLowerCase().includes(searchTerm))
        );

        if (matches.length) {
            matches.forEach(client => {
                const item = document.createElement('div');
                item.className = 'p-2 hover:bg-gray-100 cursor-pointer';
                item.textContent = `${client.B2B_NAME} (${client.CODE})`;
                item.addEventListener('mousedown', () => {
                    ui.parentClientSearchInput.value = item.textContent;
                    ui.codeHiddenInput.value = client.CODE;
                    ui.parentClientResultsContainer.classList.add('hidden');
                    if (client.BRANCH) ui.branchInput.value = client.BRANCH;
                });
                ui.parentClientResultsContainer.appendChild(item);
            });
            ui.parentClientResultsContainer.classList.remove('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!ui.parentClientSearchInput.contains(e.target) && !ui.parentClientResultsContainer.contains(e.target)) {
            ui.parentClientResultsContainer.classList.add('hidden');
        }
    });

    ui.newClientBtn.addEventListener('click', () => { resetForm(); showFormView(); });
    ui.backToListBtn.addEventListener('click', () => { resetForm(); showListView(); });

    ui.pincodeInput.addEventListener('input', async () => {
        ui.pincodeStatus.innerHTML = '';
        const pincode = ui.pincodeInput.value.trim();
        if (pincode.length < 6) {
            clearPincodeDataFields();
            lockDerivedFields();
        } else if (pincode.length === 6 && /^\d{6}$/.test(pincode)) {
            await lookupPincode(pincode);
        }
    });

    ui.deleteButton.addEventListener('click', () => {
        const uid = ui.uidInput.value;
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
    ui.confirmDeleteBtn.addEventListener('click', () => handleRequest('delete'));

    ui.form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!ui.codeHiddenInput.value) {
            showResponseMessage('Please select a valid Parent Client from the search.', 'error');
            ui.parentClientSearchInput.focus();
            return;
        }
        handleRequest('submit');
    });

    // --- NETWORK REQUEST ---
    async function handleRequest(action) {
        const isDelete = action === 'delete';
        setLoading(true, isDelete ? 'delete' : 'submit');

        try {
            const uid = ui.uidInput.value;
            let result;

            if (isDelete) {
                result = await b2b2cDelete(uid);
            } else if (isUpdateMode) {
                const payload = {};
                ['MOBILE', 'EMAIL', 'ADDRESS', 'CARRIER'].forEach(f => {
                    const el = ui.form.querySelector(`[name="${f}"]`);
                    if (el) payload[f] = el.value;
                });
                result = await b2b2cUpdate(uid, payload);
            } else {
                const data = {};
                new FormData(ui.form).forEach((value, key) => { data[key] = value; });
                result = await b2b2cCreate(data);
            }

            const msg = isDelete
                ? 'Contact deleted successfully.'
                : isUpdateMode
                    ? 'Contact updated successfully.'
                    : `Contact created. UID: ${result.uid}`;

            resetForm();
            showListView();
            showResponseMessage(msg, 'success');

        } catch (error) {
            showResponseMessage(error.message, 'error');
            if (isDelete) {
                ui.deleteConfirm.classList.add('hidden');
                ui.deleteButton.classList.remove('hidden');
            }
        }
        setLoading(false, isDelete ? 'delete' : 'submit');
        if (isDelete) {
            ui.deleteConfirm.classList.add('hidden');
            ui.deleteButton.classList.remove('hidden');
        }
    }

    // --- UI HELPERS ---
    function setLoading(isLoading, type) {
        if (type === 'delete') {
            ui.deleteSpinner.classList.toggle('hidden', !isLoading);
            ui.confirmDeleteBtn.disabled = isLoading;
            ui.cancelDeleteBtn.disabled = isLoading;
        } else {
            ui.spinner.classList.toggle('hidden', !isLoading);
            ui.submitButton.disabled = isLoading;
            const uid = ui.uidInput.value;
            ui.buttonText.textContent = isLoading
                ? (isUpdateMode ? 'Updating...' : 'Submitting...')
                : (isUpdateMode ? `Update Client ${uid}` : 'Submit New Client');
        }
    }

    function showResponseMessage(message, type) {
        ui.responseMessage.innerHTML = `<p class="font-semibold">${message}</p>`;
        ui.responseMessage.className = `mt-6 text-center p-4 rounded-lg text-sm ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
        ui.responseMessage.classList.remove('hidden');
    }

    // --- INITIAL LOAD ---
    const waitForDB = async () => {
        if (window.appDB && window.appDB.db) return;
        await new Promise(resolve => {
            const t = setTimeout(resolve, 3000);
            window.addEventListener('indexedDBReady', () => { clearTimeout(t); resolve(); }, { once: true });
        });
    };
    waitForDB().then(async () => {
        const data = await getAppData();
        if (data) handleDataLoaded({ detail: { data } });
    });
});
