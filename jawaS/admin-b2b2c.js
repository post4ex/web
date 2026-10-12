// ============================================================================
// ADMIN-B2B2C.JS — B2B2C Clients Management (List, View, Add, Edit, Delete)
// Fully consolidated module matching AdminClients and AdminBranches architecture
// ============================================================================

const AdminB2B2C = (() => {

    let _initialized = false;
    let allClients = {};
    let allParentClients = {};
    let isUpdateMode = false;
    let currentUid = null;
    let ui = {};

    // ── Constants ─────────────────────────────────────────────────────────────
    const DERIVED_FIELDS = ['CITY', 'STATE', 'CODE_STATE', 'GST_CODE', 'ZONE', 'EXPRESS_TAT', 'AIRLINE_TAT', 'SURFACE_TAT', 'PREMIUM_TAT', 'ODA'];
    const LOCKED_FIELDS  = ['NAME', 'BRANCH', 'CODE', 'GSTIN', 'PAN', 'AADHAAR', 'PINCODE', ...DERIVED_FIELDS];

    // ── Mobile helpers ────────────────────────────────────────────────────────
    function _splitMobile(val) {
        if (!val) return { cc: '91', num: '' };
        const clean = val.replace('-', '');
        return { cc: '91', num: clean.replace(/^91/, '') };
    }
    function _joinMobile() {
        if (!ui.mobileCCInput || !ui.mobileNumInput) return '';
        const cc  = (ui.mobileCCInput.value  || '91').trim();
        const num = (ui.mobileNumInput.value || '').trim();
        return num ? `${cc}${num}` : '';
    }

    // ── Injections ────────────────────────────────────────────────────────────
    function _injectListPane() {
        const listPane = document.getElementById('adminList');
        const listMsg  = document.getElementById('listMsg');
        if (listMsg) listMsg.classList.add('hidden');
        if (listPane) {
            listPane.innerHTML = `
                <ul id="b2b2cClientList" class="space-y-2">
                    <li class="text-center text-gray-500 text-sm py-4">Loading...</li>
                </ul>`;
        }
        const searchEl = document.getElementById('listSearch');
        if (searchEl) searchEl.placeholder = 'Search by Name, UID, or Code…';
    }

    function _injectFormPane() {
        AdminPage.showDetail(true);
        document.getElementById('detailView').innerHTML = `
            <!-- B2B2C Read-Only Details Card -->
            <div id="b2b2cViewContainer" class="detail-card hidden">
                <div class="detail-card-header flex justify-between items-center">
                    <h2 class="text-base font-bold text-gray-800">B2B2C Client Details</h2>
                    <div class="flex gap-2">
                        <button id="b2b2cEditCustomerBtn" class="btn btn-sm">Edit</button>
                        <button id="b2b2cDeleteBtn" class="btn-danger btn-sm">Delete</button>
                    </div>
                </div>
                <div class="detail-card-body">
                    <!-- Delete confirm inline -->
                    <div id="b2b2cDeleteConfirm" class="hidden border border-red-200 bg-red-50 rounded-lg p-3 mb-4">
                        <p class="text-sm text-red-700 font-medium mb-3">Delete <span id="b2b2cClientToDelete" class="font-bold"></span>? This cannot be undone.</p>
                        <div class="flex gap-3">
                            <button id="b2b2cConfirmDeleteBtn" type="button" class="btn-danger btn-sm flex items-center">
                                Yes, Delete
                                <div id="b2b2cDeleteSpinner" class="hidden ml-2 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                            <button id="b2b2cCancelDeleteBtn" type="button" class="btn-ghost btn-sm">Cancel</button>
                        </div>
                    </div>
                    
                    <div id="b2b2cViewContent"></div>
                </div>
            </div>

            <!-- B2B2C Form Card -->
            <div id="b2b2cEditContainer" class="detail-card hidden">
                <div class="detail-card-header flex justify-between items-center">
                    <h2 id="b2b2cFormTitle" class="text-base font-bold text-gray-800">B2B2C Client Form</h2>
                    <button type="button" id="b2b2cCancelEditBtn" class="btn-ghost btn-sm">Cancel</button>
                </div>
                <div class="detail-card-body">
                    <form id="b2b2cForm" class="space-y-4">
                        <input type="hidden" id="b2b2cRecordId">
                        <input type="hidden" name="CODE_STATE" id="b2b2cCodeState">
                        <input type="hidden" name="GST_CODE"   id="b2b2cGstCode">

                        <!-- SECTION 1: Contact Identity & Parent Client Linking -->
                        <div class="border border-indigo-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                            <div class="flex items-center justify-between border-b border-indigo-50 pb-2">
                                <div class="flex items-center gap-2">
                                    <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                                    <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 1: Contact Identity &amp; Parent Linking</h3>
                                </div>
                                <span class="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">Core Profile</span>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div class="md:col-span-1">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">UID</label>
                                    <input name="UID" id="b2b2cUid" class="form-input uppercase font-mono readonly-input" readonly placeholder="Auto-assigned">
                                </div>
                                <div class="md:col-span-3">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Name / Firm Name *</label>
                                    <input name="NAME" required class="form-input" placeholder="Consignee / Customer legal name">
                                </div>
                                <div class="md:col-span-2 relative">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Parent Master Client *</label>
                                    <input id="b2b2cParentSearch" class="form-input w-full" autocomplete="off" list="b2b2cParentList" placeholder="Search parent by Name or Code">
                                    <datalist id="b2b2cParentList"></datalist>
                                    <input type="hidden" name="CODE" id="b2b2cCode" required>
                                    <div id="b2b2cParentResults" class="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-48 overflow-y-auto hidden shadow-md"></div>
                                </div>
                                <div class="md:col-span-2">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Operating Branch *</label>
                                    <input name="BRANCH" id="b2b2cBranch" required class="form-input uppercase" list="b2b2cBranchList" autocomplete="off" placeholder="e.g. DDN">
                                    <datalist id="b2b2cBranchList"></datalist>
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 2: Contact Communication -->
                        <div class="border border-blue-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                            <div class="flex items-center justify-between border-b border-blue-50 pb-2">
                                <div class="flex items-center gap-2">
                                    <span class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                                    <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 2: Contact Communication</h3>
                                </div>
                                <span class="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">Reachability</span>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Mobile Number *</label>
                                    <div class="flex gap-2">
                                        <input id="b2b2cMobileCC" value="91" class="form-input" style="width:4.5rem;flex-shrink:0" placeholder="CC" maxlength="3">
                                        <input id="b2b2cMobileNum" type="tel" required class="form-input flex-1" placeholder="10-digit Number" maxlength="10">
                                    </div>
                                    <p class="text-[11px] text-gray-400 mt-1">Direct contact for POD &amp; delivery verification.</p>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Email Address</label>
                                    <input name="EMAIL" type="email" class="form-input" placeholder="consignee@example.com">
                                    <p class="text-[11px] text-gray-400 mt-1">E-invoices and tracking alert dispatches.</p>
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 3: Delivery Address & Pincode Routing -->
                        <div class="border border-emerald-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                            <div class="flex items-center justify-between border-b border-emerald-50 pb-2">
                                <div class="flex items-center gap-2">
                                    <span class="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                                    <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 3: Delivery Address &amp; Pincode Routing</h3>
                                </div>
                                <span class="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded">Geotag Engine</span>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div class="md:col-span-4">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Delivery Address *</label>
                                    <input name="ADDRESS" required class="form-input" placeholder="Complete street address, shop/plot number, landmark">
                                </div>
                                <div class="md:col-span-1 relative">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Pincode *</label>
                                    <input name="PINCODE" id="b2b2cPincode" required class="form-input font-mono" maxlength="6" placeholder="e.g. 248001">
                                    <span id="b2b2cPincodeStatus" class="absolute right-3 top-7 text-sm pointer-events-none"></span>
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">City</label>
                                    <input name="CITY" id="b2b2cCity" class="form-input readonly-input" readonly placeholder="Auto-populated">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">State</label>
                                    <input name="STATE" id="b2b2cState" class="form-input readonly-input" readonly placeholder="Auto-populated">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Logistics Zone</label>
                                    <input name="ZONE" id="b2b2cZone" class="form-input readonly-input font-mono" readonly placeholder="Z1 - Z14">
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 4: Statutory & GST Compliance -->
                        <div class="border border-amber-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                            <div class="flex items-center justify-between border-b border-amber-50 pb-2">
                                <div class="flex items-center gap-2">
                                    <span class="w-6 h-6 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center">4</span>
                                    <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 4: Statutory &amp; GST Compliance</h3>
                                </div>
                                <span class="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded">Tax &amp; Identity</span>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">GSTIN</label>
                                    <input name="GSTIN" class="form-input uppercase font-mono" maxlength="15" placeholder="22AAAAA0000A1Z5">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">PAN</label>
                                    <input name="PAN" class="form-input uppercase font-mono" maxlength="10" placeholder="AAAAA0000A">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Aadhaar</label>
                                    <input name="AADHAAR" class="form-input font-mono" maxlength="12" placeholder="12-digit UIDAI number">
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 5: Service Turnaround Time (TAT) & Logistics Carrier -->
                        <div class="border border-purple-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                            <div class="flex items-center justify-between border-b border-purple-50 pb-2">
                                <div class="flex items-center gap-2">
                                    <span class="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">5</span>
                                    <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 5: Service Turnaround Time &amp; Carrier</h3>
                                </div>
                                <span class="text-xs text-purple-600 font-medium bg-purple-50 px-2 py-0.5 rounded">Logistics Routing</span>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                <div class="col-span-2 sm:col-span-2">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Default Carrier</label>
                                    <input name="CARRIER" id="b2b2cCarrier" class="form-input" list="b2b2cCarrierList" autocomplete="off" placeholder="Assign carrier">
                                    <datalist id="b2b2cCarrierList"></datalist>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Express TAT</label>
                                    <input name="EXPRESS_TAT" id="b2b2cExpressTat" class="form-input readonly-input" readonly placeholder="Days">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Airline TAT</label>
                                    <input name="AIRLINE_TAT" id="b2b2cAirlineTat" class="form-input readonly-input" readonly placeholder="Days">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Surface TAT</label>
                                    <input name="SURFACE_TAT" id="b2b2cSurfaceTat" class="form-input readonly-input" readonly placeholder="Days">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Premium TAT</label>
                                    <input name="PREMIUM_TAT" id="b2b2cPremiumTat" class="form-input readonly-input" readonly placeholder="Days">
                                </div>
                                <div class="col-span-2 sm:col-span-1">
                                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">ODA Status</label>
                                    <input name="ODA" id="b2b2cOda" class="form-input readonly-input" readonly placeholder="N / Y">
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 6: Double-Entry Ledger Mechanics Notice -->
                        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 flex items-center gap-3">
                            <svg class="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            <div>
                                <span class="font-bold text-slate-900 block mb-0.5">On-Demand Double-Entry Accounting Rule:</span>
                                <span>Retail consignees and walk-in shippers do not require pre-allocated Chart of Accounts entries. On-demand billing (TOPAY consignment or direct invoice) automatically binds to <code>COA #1010 Accounts Receivable</code> tagged with <code>entity_code = UID</code>.</span>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex justify-between items-center pt-4 border-t">
                            <button type="button" id="b2b2cNewClientBtn" class="btn-ghost btn-sm">+ New Client</button>
                            <button type="submit" id="b2b2cSubmitBtn" class="btn px-6 py-2.5 flex items-center gap-2">
                                <span id="b2b2cBtnText">Submit New Client</span>
                                <div id="b2b2cSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>

                    <input type="hidden" id="b2b2cSearchClient">
                    <div id="b2b2cResponseMsg" class="hidden mt-3"></div>
                </div>
            </div>`;
    }

    function _bindUI() {
        ui = {
            form:                         document.getElementById('b2b2cForm'),
            recordIdInput:                document.getElementById('b2b2cRecordId'),
            submitButton:                 document.getElementById('b2b2cSubmitBtn'),
            buttonText:                   document.getElementById('b2b2cBtnText'),
            spinner:                      document.getElementById('b2b2cSpinner'),
            responseMessage:              document.getElementById('b2b2cResponseMsg'),
            clientList:                   document.getElementById('b2b2cClientList'),
            searchClientInput:            document.getElementById('listSearch'),
            mirrorSearchInput:            document.getElementById('b2b2cSearchClient'),
            newClientBtn:                 document.getElementById('b2b2cNewClientBtn'),
            uidInput:                     document.getElementById('b2b2cUid'),
            mobileCCInput:                document.getElementById('b2b2cMobileCC'),
            mobileNumInput:               document.getElementById('b2b2cMobileNum'),
            deleteButton:                 document.getElementById('b2b2cDeleteBtn'),
            deleteConfirm:                document.getElementById('b2b2cDeleteConfirm'),
            clientToDeleteSpan:           document.getElementById('b2b2cClientToDelete'),
            cancelDeleteBtn:              document.getElementById('b2b2cCancelDeleteBtn'),
            confirmDeleteBtn:             document.getElementById('b2b2cConfirmDeleteBtn'),
            deleteSpinner:                document.getElementById('b2b2cDeleteSpinner'),
            pincodeInput:                 document.getElementById('b2b2cPincode'),
            pincodeStatus:                document.getElementById('b2b2cPincodeStatus'),
            cityInput:                    document.getElementById('b2b2cCity'),
            stateInput:                   document.getElementById('b2b2cState'),
            carrierInput:                 document.getElementById('b2b2cCarrier'),
            carrierDataList:              document.getElementById('b2b2cCarrierList'),
            expressTatInput:              document.getElementById('b2b2cExpressTat'),
            airlineTatInput:              document.getElementById('b2b2cAirlineTat'),
            surfaceTatInput:              document.getElementById('b2b2cSurfaceTat'),
            premiumTatInput:              document.getElementById('b2b2cPremiumTat'),
            odaInput:                     document.getElementById('b2b2cOda'),
            zoneInput:                    document.getElementById('b2b2cZone'),
            parentClientSearchInput:      document.getElementById('b2b2cParentSearch'),
            parentClientResultsContainer: document.getElementById('b2b2cParentResults'),
            parentClientDataList:         document.getElementById('b2b2cParentList'),
            codeHiddenInput:              document.getElementById('b2b2cCode'),
            branchInput:                  document.getElementById('b2b2cBranch'),
            branchDataList:               document.getElementById('b2b2cBranchList'),
            
            // View / Edit Pane Elements
            viewContainer:                document.getElementById('b2b2cViewContainer'),
            viewContent:                  document.getElementById('b2b2cViewContent'),
            editContainer:                document.getElementById('b2b2cEditContainer'),
            editCustomerBtn:              document.getElementById('b2b2cEditCustomerBtn'),
            cancelEditBtn:                document.getElementById('b2b2cCancelEditBtn'),
        };
    }

    // ── Data loading ──────────────────────────────────────────────────────────
    function _handleDataLoaded(event) {
        const appData = event?.detail?.data;
        if (!appData) return;
        if (appData.B2B)      { allParentClients = appData.B2B; _populateParentList(appData.B2B); }
        if (appData.BRANCHES) _populateBranchList(appData.BRANCHES);
        if (appData.CARRIERS) _populateCarrierList(appData.CARRIERS);
        if (appData.B2B2C) {
            allClients = appData.B2B2C;
            _renderClientList(allClients);
            if (!currentUid) {
                _showB2b2cOverview();
            } else if (allClients[currentUid]) {
                _showClientView(allClients[currentUid]);
            }
        }
    }

    // ── List rendering ────────────────────────────────────────────────────────
    function _renderClientList(clients) {
        if (!ui.clientList) ui.clientList = document.getElementById('b2b2cClientList');
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
            li.className = `p-3 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors border border-gray-200 ${uid === currentUid ? 'bg-indigo-100 border-indigo-300' : ''}`;
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

    // ── Overview & Detail View ────────────────────────────────────────────────
    function _showB2b2cOverview() {
        if (!ui.viewContainer || !ui.editContainer) return;
        ui.viewContainer.classList.remove('hidden');
        ui.editContainer.classList.add('hidden');

        if (ui.editCustomerBtn) ui.editCustomerBtn.classList.add('hidden');
        if (ui.deleteButton) ui.deleteButton.classList.add('hidden');

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
        if (!ui.viewContainer || !ui.editContainer) return;
        ui.viewContainer.classList.remove('hidden');
        ui.editContainer.classList.add('hidden');

        if (ui.editCustomerBtn) ui.editCustomerBtn.classList.remove('hidden');
        if (ui.deleteButton) ui.deleteButton.classList.remove('hidden');

        const headerTitle = ui.viewContainer.querySelector('h2');
        if (headerTitle) headerTitle.textContent = 'B2B2C Client Details';

        const parent = allParentClients[client.CODE];
        const parentName = parent ? `${parent.B2B_NAME} (${client.CODE})` : (client.CODE || '—');

        let crossover = client.CROSSOVER;
        if (typeof crossover === 'string') {
            try { crossover = JSON.parse(crossover); } catch (e) { crossover = {}; }
        }
        crossover = crossover || {};
        const consignor_cnt = crossover.CONSIGNOR ?? crossover.consignor ?? 0;
        const consignee_cnt = crossover.CONSIGNEE ?? crossover.consignee ?? 0;

        let creditCardHtml = '';
        if (parent) {
            const parentCredit = parseFloat(parent.CREDIT_LIMIT || 0);
            const parentBilled = parseFloat(parent.BILLED_USAGE || 0);
            const parentUnbilled = parseFloat(parent.UNBILLED_USAGE || 0);
            const parentRemaining = parentCredit - (parentBilled + parentUnbilled);
            let remainingHtml = '';
            if (parentCredit === 0) {
                remainingHtml = '<span class="text-gray-500 font-semibold text-xs">No Credit Limit</span>';
            } else if (parentRemaining <= 0) {
                remainingHtml = '<span class="text-red-600 font-bold text-xs">₹0 (Over limit by ₹' + Math.abs(parentRemaining).toLocaleString('en-IN') + ')</span>';
            } else {
                remainingHtml = '<span class="text-emerald-600 font-semibold text-xs">₹' + parentRemaining.toLocaleString('en-IN') + '</span>';
            }

            creditCardHtml = `
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mb-3">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <h4 class="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Parent Client Credit &amp; Live Order Exposure
                        </h4>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600 font-medium">Consignee Orders: <strong class="text-gray-900">${consignee_cnt}</strong></span>
                            <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600 font-medium">Consignor Orders: <strong class="text-gray-900">${consignor_cnt}</strong></span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Credit Limit</span>
                            <span class="text-base font-bold text-gray-800">${parentCredit > 0 ? '₹' + parentCredit.toLocaleString('en-IN') : '<span class="text-gray-400 font-normal text-sm">No Limit</span>'}</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Billed AR Usage</span>
                            <span class="text-base font-bold text-amber-700">₹${parentBilled.toLocaleString('en-IN')}</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Unbilled Usage</span>
                            <span class="text-base font-bold text-blue-700">₹${parentUnbilled.toLocaleString('en-IN')}</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Available Credit</span>
                            ${remainingHtml}
                        </div>
                    </div>
                    <div class="mt-2.5 pt-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600 flex-wrap gap-2">
                        <div class="flex items-center gap-2">
                            <span class="font-medium">Parent Code:</span>
                            <span class="font-mono text-indigo-700 font-bold">${client.CODE || '—'}</span>
                            <span class="text-gray-400">&bull;</span>
                            <span class="text-gray-700 font-medium">${parent.B2B_NAME || ''}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="font-medium">Subledger Binding:</span>
                            <span class="font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">COA #1010 AR &bull; Subledger [${client.UID || '—'}]</span>
                        </div>
                    </div>
                </div>`;
        } else {
            creditCardHtml = `
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mb-3">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <h4 class="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Direct Billing &amp; Live Order Exposure
                        </h4>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600 font-medium">Consignee Orders: <strong class="text-gray-900">${consignee_cnt}</strong></span>
                            <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600 font-medium">Consignor Orders: <strong class="text-gray-900">${consignor_cnt}</strong></span>
                        </div>
                    </div>
                    <div class="flex items-center justify-between text-xs text-gray-600 flex-wrap gap-2 pt-1">
                        <div>
                            <span class="font-medium text-gray-700">Account Type:</span>
                            <span class="bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-800 font-semibold ml-1">Independent B2B2C / Walk-in Consignee</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="font-medium">Subledger Binding:</span>
                            <span class="font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">COA #1010 AR &bull; Subledger [${client.UID || '—'}]</span>
                        </div>
                    </div>
                </div>`;
        }

        let html = `
            <div class="space-y-4">
                ${creditCardHtml}

                <!-- Section 1: Contact Identity & Parent Routing -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        1. Contact Identity &amp; Parent Linking
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">UID (Record Key)</span>
                            <span class="font-mono font-bold text-indigo-700 text-base">${client.UID || '—'}</span>
                        </div>
                        <div class="col-span-2 md:col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">Contact / Consignee Name</span>
                            <span class="font-medium text-gray-900">${client.NAME || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Operating Branch</span>
                            <span class="font-bold text-gray-800">${client.BRANCH || '—'}</span>
                        </div>
                        <div class="col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">Parent B2B Client</span>
                            <span class="font-medium text-gray-900">${parentName}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Default Carrier</span>
                            <span class="px-2 py-0.5 text-xs rounded bg-indigo-50 text-indigo-700 font-semibold">${client.CARRIER || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">ODA Status</span>
                            <span class="px-2 py-0.5 text-xs rounded font-semibold ${client.ODA === 'ODA' || client.ODA === 'Yes' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}">${client.ODA || 'Standard Area'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Contact Communication -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                        2. Contact Communication
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Mobile Number</span>
                            <span class="font-mono text-gray-900">${client.MOBILE ? `<a href="tel:${client.MOBILE}" class="hover:underline text-indigo-600 font-medium">+${client.MOBILE}</a>` : '—'}</span>
                        </div>
                        <div class="col-span-2 md:col-span-3">
                            <span class="block text-xs font-semibold text-gray-500">Primary Email</span>
                            <span class="text-indigo-600 font-medium">${client.EMAIL ? `<a href="mailto:${client.EMAIL}" class="hover:underline">${client.EMAIL}</a>` : '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Delivery Address & Logistics Routing -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        3. Delivery Address &amp; Pincode Routing
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="col-span-2 md:col-span-4">
                            <span class="block text-xs font-semibold text-gray-500">Delivery Address</span>
                            <span class="text-gray-800">${client.ADDRESS || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Pincode</span>
                            <span class="font-mono font-bold text-gray-900">${client.PINCODE || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">City</span>
                            <span class="text-gray-800 font-medium">${client.CITY || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">State</span>
                            <span class="text-gray-800 font-medium">${client.STATE || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Zone</span>
                            <span class="px-2 py-0.5 text-xs rounded bg-purple-50 text-purple-700 font-semibold">${client.ZONE || '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 4: Statutory & GST Compliance -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        4. Statutory &amp; GST Compliance
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">GSTIN</span>
                            <span class="font-mono font-bold text-gray-900">${client.GSTIN || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">PAN</span>
                            <span class="font-mono text-gray-800">${client.PAN || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Aadhaar</span>
                            <span class="font-mono text-gray-800">${client.AADHAAR || '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 5: Service Turnaround Time & Carrier -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        5. Service Turnaround Time &amp; Carrier (TAT)
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="bg-white p-2 rounded border border-gray-100">
                            <span class="block text-xs font-semibold text-gray-500">Express TAT</span>
                            <span class="font-bold text-gray-800">${client.EXPRESS_TAT !== undefined && client.EXPRESS_TAT !== '' ? client.EXPRESS_TAT + ' Days' : '—'}</span>
                        </div>
                        <div class="bg-white p-2 rounded border border-gray-100">
                            <span class="block text-xs font-semibold text-gray-500">Airline TAT</span>
                            <span class="font-bold text-gray-800">${client.AIRLINE_TAT !== undefined && client.AIRLINE_TAT !== '' ? client.AIRLINE_TAT + ' Days' : '—'}</span>
                        </div>
                        <div class="bg-white p-2 rounded border border-gray-100">
                            <span class="block text-xs font-semibold text-gray-500">Surface TAT</span>
                            <span class="font-bold text-gray-800">${client.SURFACE_TAT !== undefined && client.SURFACE_TAT !== '' ? client.SURFACE_TAT + ' Days' : '—'}</span>
                        </div>
                        <div class="bg-white p-2 rounded border border-gray-100">
                            <span class="block text-xs font-semibold text-gray-500">Premium TAT</span>
                            <span class="font-bold text-gray-800">${client.PREMIUM_TAT !== undefined && client.PREMIUM_TAT !== '' ? client.PREMIUM_TAT + ' Days' : '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 6: Double-Entry Ledger Mechanics & Audit -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        6. Double-Entry Ledger Mechanics &amp; Audit Trail
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">Subledger Control Binding</span>
                            <span class="font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">COA #1010 AR &bull; On-Demand [${client.UID || '—'}]</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Created / Updated By</span>
                            <span class="text-gray-800 font-medium">${client.USER_NAME || 'SYSTEM'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Record Timestamp</span>
                            <span class="font-mono text-xs text-gray-600">${client.TIME_STAMP ? (typeof fmtDate === 'function' ? fmtDate(client.TIME_STAMP, 'full') : client.TIME_STAMP) : '—'}</span>
                        </div>
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
        if (ui.deleteConfirm) ui.deleteConfirm.classList.add('hidden');
        if (ui.deleteButton) ui.deleteButton.classList.remove('hidden');

        _showClientView(client);

        // Highlight in side list
        if (ui.clientList) {
            ui.clientList.querySelectorAll('li').forEach(li => {
                if (li.dataset.uid === uid) {
                    li.classList.add('bg-indigo-100', 'border-indigo-300');
                } else {
                    li.classList.remove('bg-indigo-100', 'border-indigo-300');
                }
            });
        }

        // Show detail pane
        AdminPage.showDetail(true);
        AdminPage.showDetailPane?.();
    }

    // ── Form edit & Reset ─────────────────────────────────────────────────────
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
            ui.codeHiddenInput.value = client.CODE;
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

    // ── API Handlers ──────────────────────────────────────────────────────────
    async function _handleRequest(action) {
        const isDelete = action === 'delete';
        _setLoading(true, isDelete ? 'delete' : 'submit');
        try {
            const uid = isDelete ? currentUid : ui.uidInput.value;
            let result;
            if (isDelete) {
                result = await b2b2cDelete(uid);       // OTP auto-asked inside callApi
            } else if (isUpdateMode) {
                const payload = { MOBILE: _joinMobile() };
                ['EMAIL', 'ADDRESS', 'CARRIER'].forEach(f => {
                    const el = ui.form.querySelector(`[name="${f}"]`);
                    if (el) payload[f] = el.value;
                });
                result = await b2b2cUpdate(uid, payload);  // OTP auto-asked inside callApi
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
            if (err.message !== 'OTP action cancelled') _showMsg(err.message, 'error');
            if (isDelete) { ui.deleteConfirm.classList.add('hidden'); ui.deleteButton.classList.remove('hidden'); }
        }
        _setLoading(false, isDelete ? 'delete' : 'submit');
        if (isDelete) { ui.deleteConfirm.classList.add('hidden'); ui.deleteButton.classList.remove('hidden'); }
    }

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

    // ── Search & Filter ───────────────────────────────────────────────────────
    function search(q) {
        const query = (q || '').trim().toLowerCase();
        if (!query) {
            _renderClientList(allClients);
            return;
        }
        const filtered = {};
        Object.entries(allClients).forEach(([uid, c]) => {
            if ((c.NAME || '').toLowerCase().includes(query) || uid.toLowerCase().includes(query) || (c.CODE || '').toLowerCase().includes(query))
                filtered[uid] = c;
        });
        _renderClientList(filtered);
    }

    // ── Events ────────────────────────────────────────────────────────────────
    function _bindEvents() {
        ui.carrierInput.addEventListener('input', e => {
            const opt = Array.from(ui.carrierDataList.options).find(o => o.value === e.target.value);
            if (opt?.dataset.code) setTimeout(() => { e.target.value = opt.dataset.code; }, 0);
        });

        if (ui.searchClientInput) {
            ui.searchClientInput.addEventListener('input', e => search(e.target.value));
        }

        if (ui.mirrorSearchInput) {
            ui.mirrorSearchInput.addEventListener('input', e => search(e.target.value));
        }

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
            if (ui.parentClientSearchInput && ui.parentClientResultsContainer &&
                !ui.parentClientSearchInput.contains(e.target) && !ui.parentClientResultsContainer.contains(e.target)) {
                ui.parentClientResultsContainer.classList.add('hidden');
            }
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

    // ── Public Interface ──────────────────────────────────────────────────────
    function load() {
        if (!_initialized || !document.getElementById('b2b2cForm')) {
            _initialized = true;
            _injectFormPane();
            _bindUI();
            _bindEvents();
            window.addEventListener('appDataLoaded',    _handleDataLoaded);
            window.addEventListener('appDataRefreshed', _handleDataLoaded);
        }

        // list pane re-injected every time (_showSplit clears adminList)
        _injectListPane();
        ui.clientList = document.getElementById('b2b2cClientList');

        // always reload data
        getAppData().then(data => {
            if (data) _handleDataLoaded({ detail: { data } });
        });
    }

    function openAddPane() {
        _newClient();
    }

    return {
        load,
        search,
        openAddPane,
        init: () => {},
        refresh: (data) => _handleDataLoaded({ detail: { data } })
    };
})();

window.AdminB2B2C = AdminB2B2C;
window.B2B2CModule = AdminB2B2C;
