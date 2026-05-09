// ============================================================================
// ADMIN-B2B2C.JS — Injects B2B2C HTML into admin panel, delegates to b2b2c.js
// ============================================================================

const AdminB2B2C = (() => {

    let _initialized = false;

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
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h2 class="text-base font-bold text-gray-800">B2B2C Client</h2>
                    <button id="b2b2cDeleteBtn" class="hidden px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700">Delete</button>
                </div>
                <div class="detail-card-body">
                    <form id="b2b2cForm" class="space-y-4">
                        <input type="hidden" id="b2b2cRecordId">

                        <!-- Core -->
                        <div>
                            <h3 class="text-xs font-semibold text-indigo-600 uppercase tracking-wide border-b pb-1 mb-3">Core Information</h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">UID</label>
                                    <input name="UID" id="b2b2cUid" class="form-input text-sm readonly-input" readonly>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                                    <input name="NAME" required class="form-input text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Mobile *</label>
                                    <div class="flex gap-2">
                                        <input id="b2b2cMobileCC" value="91" class="form-input text-sm" style="width:4.5rem;flex-shrink:0" placeholder="CC">
                                        <input id="b2b2cMobileNum" type="tel" required class="form-input text-sm flex-1" placeholder="Number">
                                    </div>
                                    <p class="text-xs text-gray-400 mt-0.5">CC - Number (e.g. 91 - 9876543210)</p>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Email</label>
                                    <input name="EMAIL" type="email" class="form-input text-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Branch *</label>
                                    <input name="BRANCH" id="b2b2cBranch" required class="form-input text-sm" list="b2b2cBranchList" autocomplete="off">
                                    <datalist id="b2b2cBranchList"></datalist>
                                </div>
                                <div class="relative">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Parent Client *</label>
                                    <input id="b2b2cParentSearch" class="form-input text-sm w-full" autocomplete="off" list="b2b2cParentList" placeholder="Search by Name or Code">
                                    <datalist id="b2b2cParentList"></datalist>
                                    <input type="hidden" name="CODE" id="b2b2cCode" required>
                                    <div id="b2b2cParentResults" class="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-48 overflow-y-auto hidden"></div>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">GST / PAN / Aadhaar</label>
                                    <input name="GST_ID_PAN_ADHAR" class="form-input text-sm">
                                </div>
                            </div>
                        </div>

                        <!-- Address -->
                        <div>
                            <h3 class="text-xs font-semibold text-indigo-600 uppercase tracking-wide border-b pb-1 mb-3">Address & Pincode</h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div class="sm:col-span-2">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Address *</label>
                                    <input name="ADDRESS" required class="form-input text-sm">
                                </div>
                                <div class="relative">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Pincode *</label>
                                    <input name="PINCODE" id="b2b2cPincode" required class="form-input text-sm" maxlength="6">
                                    <span id="b2b2cPincodeStatus" class="absolute right-3 top-8 text-sm pointer-events-none"></span>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">City</label>
                                    <input name="CITY" id="b2b2cCity" class="form-input text-sm readonly-input" readonly>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">State</label>
                                    <input name="STATE" id="b2b2cState" class="form-input text-sm readonly-input" readonly>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Zone</label>
                                    <input name="ZONE" id="b2b2cZone" class="form-input text-sm readonly-input" readonly>
                                </div>
                            </div>
                        </div>

                        <!-- Service -->
                        <div>
                            <h3 class="text-xs font-semibold text-indigo-600 uppercase tracking-wide border-b pb-1 mb-3">Service Details</h3>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div class="col-span-2 sm:col-span-1">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Carrier</label>
                                    <input name="CARRIER" id="b2b2cCarrier" class="form-input text-sm" list="b2b2cCarrierList" autocomplete="off">
                                    <datalist id="b2b2cCarrierList"></datalist>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Express TAT</label>
                                    <input name="EXPRESS_TAT" id="b2b2cExpressTat" class="form-input text-sm readonly-input" readonly>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Airline TAT</label>
                                    <input name="AIRLINE_TAT" id="b2b2cAirlineTat" class="form-input text-sm readonly-input" readonly>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Surface TAT</label>
                                    <input name="SURFACE_TAT" id="b2b2cSurfaceTat" class="form-input text-sm readonly-input" readonly>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Premium TAT</label>
                                    <input name="PREMIUM_TAT" id="b2b2cPremiumTat" class="form-input text-sm readonly-input" readonly>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">ODA</label>
                                    <input name="ODA" id="b2b2cOda" class="form-input text-sm readonly-input" readonly>
                                </div>
                            </div>
                        </div>

                        <!-- Delete confirm -->
                        <div id="b2b2cDeleteConfirm" class="hidden border border-red-200 bg-red-50 rounded-lg p-3">
                            <p class="text-sm text-red-700 font-medium mb-3">Delete <span id="b2b2cClientToDelete" class="font-bold"></span>? This cannot be undone.</p>
                            <div class="flex gap-3">
                                <button id="b2b2cConfirmDeleteBtn" type="button" class="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 flex items-center">
                                    Yes, Delete
                                    <div id="b2b2cDeleteSpinner" class="hidden ml-2 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                </button>
                                <button id="b2b2cCancelDeleteBtn" type="button" class="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 text-sm font-medium hover:bg-gray-300">Cancel</button>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex justify-between items-center pt-3 border-t">
                            <button type="button" id="b2b2cNewClientBtn" class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">+ New</button>
                            <button type="submit" id="b2b2cSubmitBtn" class="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 flex items-center gap-2">
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

    function load() {
        // form pane + event binding only once
        if (!_initialized) {
            _initialized = true;
            _injectFormPane();
            B2B2CModule.init();
        }

        // list pane re-injected every time (_showSplit clears adminList)
        _injectListPane();

        // always reload data
        getAppData().then(data => {
            if (data) B2B2CModule.refresh(data);
        });
    }

    return { load };
})();

window.AdminB2B2C = AdminB2B2C;
