// ============================================================================
// ADMIN-CLIENTS.JS — Clients (B2B) tile: full add/edit/delete + rate management
// Depends on: core/b2b-api.js
// ============================================================================

const AdminClients = (() => {

    const STATIC_WEIGHTS   = ['0.5', '0.5A'];
    const DYNAMIC_WEIGHTS  = ['3', '10', '25', '50', '100', '500', '1000', '2000', '5000', '10000'];
    const STANDARD_MODES   = ['premium', 'express', 'airline', 'surface'];
    const SIMPLIFIED_ZONES = [
        { label: 'REGIONAL', zones: [1, 2] },
        { label: 'NCR',      zones: [4] },
        { label: 'NORTH',    zones: [3, 5, 6] },
        { label: 'METRO',    zones: [7, 8] },
        { label: 'ROI',      zones: [9, 10, 11, 12] },
        { label: 'EAST',     zones: [13, 14] },
    ];
    const PERCENT_FIELDS = ['PCT_TOPAY_IF', 'PCT_COD_IF', 'PCT_FOV_IF', 'FUEL_CHARGES', 'DEV_CHARGES'];

    // ── State ─────────────────────────────────────────────────────────────────
    let _allCustomers = {};
    let _allModes     = [];
    let _allRates     = {};
    let _currentCode  = null;
    let _isUpdate     = false;

    // ── Helpers ───────────────────────────────────────────────────────────────
    function _msg(html, type) {
        const el = document.getElementById('clientsMsg');
        if (!el) return;
        el.innerHTML = html;
        el.className = `my-3 p-3 rounded text-sm text-center ${
            type === 'success' ? 'bg-green-100 text-green-800' :
            type === 'error'   ? 'bg-red-100 text-red-800' :
                                 'bg-blue-100 text-blue-800'}`;
        el.classList.remove('hidden');
    }

    function _viewMsg(html, type) {
        const el = document.getElementById('clientsViewMsg');
        if (!el) return;
        el.innerHTML = html;
        el.className = `my-3 p-3 rounded text-sm text-center ${
            type === 'success' ? 'bg-green-100 text-green-800' :
            type === 'error'   ? 'bg-red-100 text-red-800' :
                                 'bg-blue-100 text-blue-800'}`;
        el.classList.remove('hidden');
    }

    function _can(role) { return window.AdminPage?.can(role); }

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        const listMsg = document.getElementById('listMsg');
        if (listMsg) listMsg.classList.add('hidden');
        document.getElementById('adminList').innerHTML =
            `<ul id="clientsList" class="space-y-2"></ul>`;
        document.getElementById('listSearch').placeholder = 'Search by Name or Code…';
    }

    function _renderList(customers) {
        const ul = document.getElementById('clientsList');
        if (!ul) return;
        const entries = Object.values(customers || {})
            .filter(c => c.STATUS !== 'DELETED')
            .sort((a, b) => (a.CODE || '').localeCompare(b.CODE || ''));
        if (!entries.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No clients found.</li>';
            return;
        }
        ul.innerHTML = entries.map(c => `
            <li data-code="${c.CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <strong class="text-indigo-700 block text-sm">${c.B2B_NAME || 'Unnamed'}</strong>
                <span class="text-xs text-gray-500">${c.CODE}
                    <span class="ml-2 px-1.5 py-0.5 rounded text-xs font-semibold ${
                        c.STATUS === 'ACTIVE'  ? 'bg-green-100 text-green-700' :
                        c.STATUS === 'BLOCKED' ? 'bg-red-100 text-red-700' :
                                                 'bg-gray-100 text-gray-600'}">${c.STATUS || ''}</span>
                </span>
            </li>`).join('');
        ul.querySelectorAll('li[data-code]').forEach(li =>
            li.addEventListener('click', () => _selectClient(li.dataset.code))
        );
    }

    function search(term) {
        const t = (term || '').toLowerCase();
        const filtered = {};
        Object.entries(_allCustomers).forEach(([k, c]) => {
            if (c.STATUS !== 'DELETED' &&
                ((c.B2B_NAME || '').toLowerCase().includes(t) ||
                 (c.CODE || '').toLowerCase().includes(t))) filtered[k] = c;
        });
        _renderList(filtered);
    }

    // ── Detail pane injection ─────────────────────────────────────────────────
    function _injectDetailPane() {
        document.getElementById('detailView').innerHTML = `
            <!-- READ-ONLY VIEW (shown on list click) -->
            <div id="clientsViewContainer" class="hidden detail-card mb-4">
                <div class="detail-card-header flex justify-between items-center">
                    <h2 id="clientsViewTitle" class="text-base font-bold text-gray-800"></h2>
                    <div class="flex gap-2">
                        <button id="clientsPrintBtn" class="hidden btn btn-sm">Print</button>
                        <button id="clientsEmailBtn" class="hidden btn btn-sm">Email</button>
                        <button id="clientsEditBtn" class="hidden btn btn-sm">Edit</button>
                        <button id="clientsDeleteBtn" class="hidden btn-danger btn-sm">Delete</button>
                    </div>
                </div>
                <div class="detail-card-body">
                    <div id="clientsViewMsg" class="hidden mb-3"></div>
                    <div id="clientsViewContent"></div>
                    <!-- Delete confirm inline -->
                    <div id="clientsDeleteConfirm" class="hidden mt-4 border border-red-200 bg-red-50 rounded-lg p-4">
                        <p class="text-sm text-red-700 font-medium mb-3">Delete <strong id="clientsDeleteName"></strong>?<br>
                        <span class="text-xs text-gray-500">Client will be marked DELETED. Rates remain unchanged.</span></p>
                        <div class="flex gap-3 items-center flex-wrap">
                            <button id="clientsConfirmDeleteBtn" class="btn-danger btn-sm flex items-center gap-1">
                                Confirm Delete
                                <div id="clientsDeleteSpinner" class="hidden w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                            <button id="clientsCancelDeleteBtn" class="btn-ghost btn-sm">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- EDIT CONTAINER (shown on Edit click or New) -->
            <div id="clientsEditContainer" class="hidden detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h2 id="clientsFormTitle" class="text-base font-bold text-gray-800">New Client</h2>
                </div>
                <div class="detail-card-body">
                    <div id="clientsMsg" class="hidden mb-3"></div>
                    <!-- Tabs -->
                    <div class="flex border-b border-gray-300 mb-0">
                        <button id="clientsTabDetails" class="tab-button active">Customer Details</button>
                        <button id="clientsTabRates" class="tab-button" disabled>Rate List</button>
                        <div class="flex-grow"></div>
                    </div>

                    <!-- Details form -->
                    <div id="clientsDetailsTab">
                        <form id="clientsForm" class="space-y-5">
                            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Code*</label>
                                    <input name="CODE" id="clientsCode" required class="form-input uppercase" placeholder="e.g., AGWL">
                                </div>
                                <div class="md:col-span-3">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">B2B Name*</label>
                                    <input name="B2B_NAME" required class="form-input" placeholder="Full legal name">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                                    <div class="flex gap-2">
                                        <input name="MOBILE_CC" class="form-input" style="width:5rem;flex-shrink:0" placeholder="CC" maxlength="3" value="91">
                                        <input name="MOBILE_NUM" type="tel" class="form-input flex-1" placeholder="Number">
                                    </div>
                                </div>
                                <div class="md:col-span-3">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input type="email" name="EMAIL" class="form-input" placeholder="primary@example.com">
                                </div>
                                <div class="md:col-span-4">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">B2B Address</label>
                                    <input name="B2B_ADDRESS" class="form-input">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Landmark</label>
                                    <input name="B2B_LANDMARK" class="form-input">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
                                    <input name="B2B_PINCODE" id="clientsPincode" class="form-input" maxlength="6">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
                                    <input name="B2B_CITY" id="clientsCity" class="form-input">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">State</label>
                                    <input name="B2B_STATE" id="clientsState" class="form-input">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Code State</label>
                                    <input name="CODE_STATE" id="clientsCodeState" class="form-input" maxlength="2">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">GST Code</label>
                                    <input name="GST_CODE" id="clientsGstCode" class="form-input" maxlength="2">
                                </div>
                                <div class="md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">GST / PAN / Adhar</label>
                                    <input name="ID_GST_PAN_ADHAR" class="form-input">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Branch*</label>
                                    <input name="BRANCH" required class="form-input uppercase" placeholder="e.g., DDN">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">B2B Type</label>
                                    <select name="B2B_TYPE" class="form-input">
                                        <option value="CLIENT">CLIENT</option>
                                        <option value="SUPPLIER">SUPPLIER</option>
                                        <option value="VENDOR">VENDOR</option>
                                    </select>
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Status*</label>
                                    <select name="STATUS" required class="form-input">
                                        <option value="ACTIVE">ACTIVE</option>
                                        <option value="BLOCKED">BLOCKED</option>
                                        <option value="QUOTED">QUOTED</option>
                                        <option value="DELETED">DELETED</option>
                                    </select>
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Clearing Charge</label>
                                    <input type="number" step="any" name="CLEARING_CHG" class="form-input" placeholder="e.g., 50">
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Rate List Type*</label>
                                    <select name="RATE_LIST" required class="form-input">
                                        <option value="SIMPLIFIED">SIMPLIFIED</option>
                                        <option value="DYNAMIC">DYNAMIC</option>
                                    </select>
                                </div>
                            </div>
                            <h3 class="text-md font-semibold text-indigo-600 mt-5 mb-3 border-t pt-4">Charges &amp; Settings</h3>
                            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Weight Change</label>
                                    <input type="number" step="any" name="WEIGHT_CHANGE" class="form-input" placeholder="e.g., 2">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">% TO-PAY</label>
                                    <input type="number" step="0.001" min="0" name="PCT_TOPAY_IF" class="form-input" placeholder="e.g., 0.03">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">% COD</label>
                                    <input type="number" step="0.001" min="0" name="PCT_COD_IF" class="form-input" placeholder="e.g., 0.005">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">% FOV</label>
                                    <input type="number" step="0.001" min="0" name="PCT_FOV_IF" class="form-input" placeholder="e.g., 0.02">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">E-Way Charge</label>
                                    <input type="number" step="any" min="0" name="EWAY_IF" class="form-input" placeholder="e.g., 10">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">AWB Charge</label>
                                    <input type="number" step="any" min="0" name="AWB_CHARGES" class="form-input" placeholder="e.g., 0">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Packing Charge</label>
                                    <input type="number" step="any" min="0" name="PACKING_CHARGES" class="form-input" placeholder="e.g., 0">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Fuel Charge %</label>
                                    <input type="number" step="any" min="0" name="FUEL_CHARGES" class="form-input" placeholder="e.g., 0.125">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Dev. Charge %</label>
                                    <input type="number" step="any" min="0" name="DEV_CHARGES" class="form-input" placeholder="e.g., 0.05">
                                </div>
                                <div class="flex items-center space-x-2 pt-5">
                                    <input type="checkbox" id="clientsGstIncCheck" class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                                    <label for="clientsGstIncCheck" class="text-sm font-medium text-gray-700">GST Included?</label>
                                    <input type="hidden" name="GST_INC" id="clientsGstInc" value="N">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Bill Cycle</label>
                                    <select name="BILL_CYCLE" class="form-input">
                                        <option value="D">Daily</option>
                                        <option value="W">Weekly</option>
                                        <option value="H">Half Month</option>
                                        <option value="M">Monthly</option>
                                        <option value="E">Every</option>
                                    </select>
                                </div>
                                <div class="md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">WP Alerts <span class="text-xs text-gray-400">(comma-separated e.g. 91-9876543210)</span></label>
                                    <input name="WP_ALERTS" id="clientsWpAlerts" class="form-input" placeholder="91-9876543210, 91-9123456789">
                                </div>
                                <div class="md:col-span-4">
                                    <div class="flex items-center gap-3 mb-2">
                                        <label class="block text-sm font-medium text-gray-700">WP Groups</label>
                                        <button type="button" id="clientsLoadGroupsBtn" class="btn-ghost btn-sm">Load Groups</button>
                                        <span class="text-xs text-gray-400" id="clientsWpGroupStatus"></span>
                                    </div>
                                    <div id="clientsWpGroupList" class="hidden grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-3 border rounded-lg bg-gray-50">
                                    </div>
                                </div>
                            </div>
                            <div class="mt-6 flex justify-center items-center gap-4 flex-wrap border-t pt-6">
                                <button type="submit" id="clientsSubmitBtn" class="btn px-8 py-3 flex items-center justify-center disabled:opacity-45">
                                    <span id="clientsSubmitText">Save Customer</span>
                                    <div id="clientsSubmitSpinner" class="spinner hidden ml-3"></div>
                                </button>
                                <button type="button" id="clientsCancelBtn" class="hidden btn-ghost px-8 py-3 flex items-center justify-center disabled:opacity-45">
                                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                                    <span>Cancel</span>
                                </button>
                            </div>
                        </form>
                    </div>

                    <!-- Rates tab -->
                    <div id="clientsRatesTab" class="hidden">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-lg font-semibold text-indigo-600">Rate List for <span id="clientsRateCode" class="font-bold"></span></h2>
                            <button type="button" id="clientsSetDefaultBtn" class="hidden btn btn-sm">Set Default Rates</button>
                        </div>
                        <div class="mb-4 p-4 bg-gray-50 border rounded-lg">
                            <label class="block text-sm font-semibold text-gray-700 mb-2">Select Additional Modes:</label>
                            <div id="clientsModeCheckboxes" class="grid grid-cols-2 md:grid-cols-4 gap-2"></div>
                        </div>
                        <form id="clientsRateForm">
                            <div id="clientsRateTable" class="overflow-x-auto relative border rounded-md max-h-[60vh]">
                                <p class="text-center p-4 text-gray-500">Select a client to view rates.</p>
                            </div>
                            <div class="mt-4 p-4 border-l-4 border-gray-500 bg-gray-50">
                                <h3 class="text-md font-bold text-gray-800 mb-2">Zone Information</h3>
                                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-sm text-gray-700">
                                    <div><span class="font-semibold">Z1:</span> UP UK WEST</div>
                                    <div><span class="font-semibold">Z2:</span> UP DIRECT</div>
                                    <div><span class="font-semibold">Z3:</span> HR PB RAJ DIRECT</div>
                                    <div><span class="font-semibold">Z4:</span> DELHI NCR</div>
                                    <div><span class="font-semibold">Z5:</span> REST OF UP UK</div>
                                    <div><span class="font-semibold">Z6:</span> REST OF HR PB RAJ</div>
                                    <div><span class="font-semibold">Z7:</span> JAMMU HP BHR CGG JHR MP</div>
                                    <div><span class="font-semibold">Z8:</span> METROS</div>
                                    <div><span class="font-semibold">Z9:</span> NON METROS</div>
                                    <div><span class="font-semibold">Z10:</span> GWT SXR SLG</div>
                                    <div><span class="font-semibold">Z11:</span> AP KAR KER ORS PY TN TL WB</div>
                                    <div><span class="font-semibold">Z12:</span> DNH DND JNK</div>
                                    <div><span class="font-semibold">Z13:</span> AR ASM MNP ML MZM NGL SKM TPR</div>
                                    <div><span class="font-semibold">Z14:</span> PORTBLIER IMPHAL AGARTALA</div>
                                </div>
                            </div>
                            <p class="text-sm text-gray-600 mt-4 text-center">Click "Save All Rates" to save all changes made to the rate list. This will overwrite any existing rates for this customer.</p>
                            <div class="mt-6 flex justify-center items-center gap-4 flex-wrap border-t pt-6">
                                <button type="submit" id="clientsSaveRatesBtn" class="btn px-8 py-3 flex items-center justify-center disabled:opacity-45">
                                    <span id="clientsRatesText">Save All Rates</span>
                                    <div id="clientsRatesSpinner" class="spinner hidden ml-3"></div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>`;

        AdminPage.showDetail(true);
        _bindDetailEvents();
    }

    // ── OTP Modal ─────────────────────────────────────────────────────────────
    // Resolves with write_token on success, rejects on cancel/failure
    function _requestOtp(code, action) {
        return new Promise((resolve, reject) => {
            const existing = document.getElementById('b2bOtpModal');
            if (existing) existing.remove();

            const actionLabels = {
                new_client:    'New Client',
                update_client: 'Update Client',
                save_rates:    'Save Rate List',
                delete_client: 'Delete Client',
            };

            const modal = document.createElement('div');
            modal.id = 'b2bOtpModal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
                    <h3 class="text-base font-bold text-gray-800 mb-1">Confirm: ${actionLabels[action] || action}</h3>
                    <p class="text-xs text-gray-500 mb-4">Client: <strong>${code}</strong> &mdash; An OTP has been sent to your email &amp; WhatsApp.</p>
                    <div id="b2bOtpMsg" class="hidden mb-3 p-2 rounded text-xs text-center"></div>
                    <input id="b2bOtpInput" type="text" maxlength="6" placeholder="Enter 6-digit OTP"
                        class="form-input w-full text-center text-lg tracking-widest mb-4">
                    <div class="flex gap-3">
                        <button id="b2bOtpVerifyBtn" class="btn flex-1 flex items-center justify-center gap-2">
                            <span>Verify &amp; Proceed</span>
                            <div id="b2bOtpSpinner" class="spinner hidden"></div>
                        </button>
                        <button id="b2bOtpCancelBtn" class="btn-ghost btn-sm">Cancel</button>
                    </div>
                    <button id="b2bOtpResendBtn" class="mt-3 w-full text-xs text-indigo-600 hover:underline">Resend OTP</button>
                </div>`;
            document.body.appendChild(modal);

            const msgEl     = modal.querySelector('#b2bOtpMsg');
            const inputEl   = modal.querySelector('#b2bOtpInput');
            const verifyBtn = modal.querySelector('#b2bOtpVerifyBtn');
            const spinner   = modal.querySelector('#b2bOtpSpinner');
            const cancelBtn = modal.querySelector('#b2bOtpCancelBtn');
            const resendBtn = modal.querySelector('#b2bOtpResendBtn');

            const showMsg = (txt, type) => {
                msgEl.textContent = txt;
                msgEl.className = `mb-3 p-2 rounded text-xs text-center ${
                    type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
                msgEl.classList.remove('hidden');
            };

            const sendOtp = async () => {
                resendBtn.disabled = true; resendBtn.textContent = 'Sending…';
                try {
                    await b2bSendOtp(code, action);
                    showMsg('OTP sent to your email & WhatsApp.', 'success');
                } catch (e) {
                    showMsg(e.message, 'error');
                } finally {
                    resendBtn.disabled = false; resendBtn.textContent = 'Resend OTP';
                }
            };

            verifyBtn.addEventListener('click', async () => {
                const otp = inputEl.value.trim();
                if (otp.length !== 6) { showMsg('Enter the 6-digit OTP.', 'error'); return; }
                verifyBtn.disabled = true; spinner.classList.remove('hidden');
                try {
                    const res = await b2bVerifyOtp(code, action, otp);
                    modal.remove();
                    resolve(res.write_token);
                } catch (e) {
                    showMsg(e.message, 'error');
                    verifyBtn.disabled = false; spinner.classList.add('hidden');
                }
            });

            cancelBtn.addEventListener('click', () => { modal.remove(); reject(new Error('cancelled')); });
            resendBtn.addEventListener('click', sendOtp);
            inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') verifyBtn.click(); });

            // auto-send OTP on open
            sendOtp();
        });
    }

    // ── WP Groups ─────────────────────────────────────────────────────────────
    let _wpGroups = null; // cached [{id, name}]

    async function _loadWpGroups(selectedIds = []) {
        const wrap   = document.getElementById('clientsWpGroupList');
        const status = document.getElementById('clientsWpGroupStatus');
        const btn    = document.getElementById('clientsLoadGroupsBtn');
        if (!wrap) return;
        if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
        try {
            if (!_wpGroups) {
                const res = await callApi('/api/wpGroups', {}, 'GET');
                _wpGroups = res.groups || [];
            }
            wrap.innerHTML = _wpGroups.length
                ? _wpGroups.map(g => `
                    <label class="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" class="wp-group-cb h-4 w-4 text-indigo-600 border-gray-300 rounded"
                            value="${g.id}" ${selectedIds.includes(g.id) ? 'checked' : ''}>
                        <span class="truncate" title="${g.name}">${g.name}</span>
                    </label>`).join('')
                : '<span class="text-xs text-gray-400 col-span-full">No groups found</span>';
            wrap.classList.remove('hidden');
            if (status) status.textContent = `(${_wpGroups.length} groups)`;
            if (btn) btn.classList.add('hidden');
        } catch {
            if (status) status.textContent = '(failed to load)';
            if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
        }
    }

    function _resetWpGroupUI() {
        const wrap = document.getElementById('clientsWpGroupList');
        const btn  = document.getElementById('clientsLoadGroupsBtn');
        const status = document.getElementById('clientsWpGroupStatus');
        if (wrap)   { wrap.innerHTML = ''; wrap.classList.add('hidden'); }
        if (btn)    { btn.disabled = false; btn.textContent = 'Load Groups'; btn.classList.remove('hidden'); }
        if (status) status.textContent = '';
    }

    function _getSelectedWpGroups() {
        return [...document.querySelectorAll('#clientsWpGroupList .wp-group-cb:checked')].map(cb => cb.value);
    }

    // ── Pincode auto-fill ─────────────────────────────────────────────────────
    function _initPincode() {
        const pin = document.getElementById('clientsPincode');
        if (!pin) return;
        let _t;
        pin.addEventListener('input', () => {
            clearTimeout(_t);
            const v = pin.value.trim();
            if (v.length === 6 && /^\d{6}$/.test(v) && typeof window.searchPin === 'function') {
                _t = setTimeout(async () => {
                    const r = await window.searchPin(v);
                    if (r?.found) {
                        const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
                        f('clientsCity',      r.CITY);
                        f('clientsState',     r.STATE_NAME || r.STATE);
                        f('clientsCodeState', r.STATE_CODE);
                        f('clientsGstCode',   r.GST_CODE);
                    }
                }, 500);
            }
        });
    }

    // ── Tab switching ─────────────────────────────────────────────────────────
    function _switchTab(tab) {
        const isDetails = tab === 'details';
        document.getElementById('clientsTabDetails').className = isDetails ? 'tab-button active' : 'tab-button';
        document.getElementById('clientsTabRates').className   = !isDetails ? 'tab-button active' : 'tab-button';
        document.getElementById('clientsDetailsTab').classList.toggle('hidden', !isDetails);
        document.getElementById('clientsRatesTab').classList.toggle('hidden', isDetails);
        if (!isDetails && _currentCode) _generateRateForm(_currentCode);
    }

    // ── Client selection → show read-only view ────────────────────────────────
    function _selectClient(code) {
        const c = _allCustomers[code];
        if (!c) return;
        _currentCode = code;
        _isUpdate    = true;

        document.querySelectorAll('#clientsList li').forEach(li =>
            li.classList.toggle('selected', li.dataset.code === code)
        );

        // show read-only view, hide edit container
        document.getElementById('clientsViewContainer').classList.remove('hidden');
        document.getElementById('clientsEditContainer').classList.add('hidden');
        document.getElementById('clientsDeleteConfirm').classList.add('hidden');
        document.getElementById('clientsMsg').classList.add('hidden');

        document.getElementById('clientsEditBtn').classList.toggle('hidden', !_can('ADMIN'));
        document.getElementById('clientsDeleteBtn').classList.toggle('hidden', !_can('ADMIN'));
        document.getElementById('clientsPrintBtn').classList.remove('hidden');
        document.getElementById('clientsEmailBtn').classList.remove('hidden');
        document.getElementById('clientsViewTitle').textContent = c.B2B_NAME || c.CODE;

        _renderView(c);
        if (!_wpGroups) _loadWpGroups([]).then(() => _renderView(c));
        AdminPage.showDetail(true);
        AdminPage.showDetailPane();
    }

    function _renderView(c) {
        const rates = Object.values(_allRates).filter(r => r.CODE === c.CODE);
        let html = `<div class="space-y-6">
            <div class="border-b pb-4">
                <h3 class="text-md font-semibold text-indigo-600 mb-3">Basic Information</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span class="font-semibold text-gray-600">Code:</span> ${c.CODE||'-'}</div>
                    <div class="col-span-3"><span class="font-semibold text-gray-600">Name:</span> ${c.B2B_NAME||'-'}</div>
                    <div><span class="font-semibold text-gray-600">Branch:</span> ${c.BRANCH||'-'}</div>
                    <div><span class="font-semibold text-gray-600">Type:</span> ${c.B2B_TYPE||'-'}</div>
                    <div><span class="font-semibold text-gray-600">Status:</span>
                        <span class="px-2 py-1 rounded text-xs font-semibold ${c.STATUS==='ACTIVE'?'bg-green-100 text-green-800':c.STATUS==='BLOCKED'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800'}">${c.STATUS||'-'}</span>
                    </div>
                    <div><span class="font-semibold text-gray-600">Rate List:</span> ${c.RATE_LIST||'-'}</div>
                </div>
            </div>
            <div class="border-b pb-4">
                <h3 class="text-md font-semibold text-indigo-600 mb-3">Contact Details</h3>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div><span class="font-semibold text-gray-600">Mobile:</span> ${c.MOBILE_NUMBER||'-'}</div>
                    <div class="col-span-2"><span class="font-semibold text-gray-600">Email:</span> ${c.EMAIL||'-'}</div>
                    <div class="col-span-3"><span class="font-semibold text-gray-600">Address:</span> ${c.B2B_ADDRESS||'-'}</div>
                    <div><span class="font-semibold text-gray-600">City:</span> ${c.B2B_CITY||'-'}</div>
                    <div><span class="font-semibold text-gray-600">State:</span> ${c.B2B_STATE||'-'}</div>
                    <div><span class="font-semibold text-gray-600">Code State:</span> ${c.CODE_STATE||'-'}</div>
                    <div><span class="font-semibold text-gray-600">GST Code:</span> ${c.GST_CODE||'-'}</div>
                    <div><span class="font-semibold text-gray-600">Pincode:</span> ${c.B2B_PINCODE||'-'}</div>
                </div>
            </div>
            <div class="border-b pb-4">
                <h3 class="text-md font-semibold text-indigo-600 mb-3">Charges & Settings</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span class="font-semibold text-gray-600">Weight Change:</span> ${c.WEIGHT_CHANGE||'-'}</div>
                    <div><span class="font-semibold text-gray-600">% TO-PAY:</span> ${c.PCT_TOPAY_IF||'-'}</div>
                    <div><span class="font-semibold text-gray-600">% COD:</span> ${c.PCT_COD_IF||'-'}</div>
                    <div><span class="font-semibold text-gray-600">% FOV:</span> ${c.PCT_FOV_IF||'-'}</div>
                    <div><span class="font-semibold text-gray-600">Fuel %:</span> ${c.FUEL_CHARGES||'-'}</div>
                    <div><span class="font-semibold text-gray-600">Dev %:</span> ${c.DEV_CHARGES||'-'}</div>
                    <div><span class="font-semibold text-gray-600">AWB Charge:</span> ${c.AWB_CHARGES||'-'}</div>
                    <div><span class="font-semibold text-gray-600">GST Inc:</span> ${c.GST_INC==='Y'?'Yes':'No'}</div>
                    <div><span class="font-semibold text-gray-600">Bill Cycle:</span> ${c.BILL_CYCLE||'-'}</div>
                    <div class="col-span-2"><span class="font-semibold text-gray-600">WP Alerts:</span> ${Array.isArray(c.WP_ALERTS)&&c.WP_ALERTS.length?c.WP_ALERTS.join(', '):'-'}</div>
                    <div class="col-span-2"><span class="font-semibold text-gray-600">WP Groups:</span> ${Array.isArray(c.WP_GROUP)&&c.WP_GROUP.length?c.WP_GROUP.map(id=>{const g=(_wpGroups||[]).find(x=>x.id===id);return g?g.name:id;}).join(', '):'-'}</div>
                </div>
            </div>
            <div>
                <h3 class="text-md font-semibold text-indigo-600 mb-3">Rate List (${rates.length} rates)</h3>`;
        if (rates.length > 0) {
            html += '<div class="overflow-x-auto"><table class="w-full text-xs border-collapse"><thead><tr class="bg-gray-100"><th class="border p-2">Mode</th><th class="border p-2">Weight</th>';
            for (let i = 1; i <= 14; i++) html += `<th class="border p-2">Z${i}</th>`;
            html += '</tr></thead><tbody>';
            rates.forEach(rate => {
                html += `<tr><td class="border p-2">${rate.MODE||'-'}</td><td class="border p-2">${rate.WEIGHT||'-'}</td>`;
                for (let i = 1; i <= 14; i++) html += `<td class="border p-2 text-right">${rate[`Z${i}`]||'-'}</td>`;
                html += '</tr>';
            });
            html += '</tbody></table></div>';
        } else {
            html += '<p class="text-gray-500 text-center py-4">No rates defined.</p>';
        }
        html += '</div></div>';
        document.getElementById('clientsViewContent').innerHTML = html;
    }

    // ── Switch to edit form ───────────────────────────────────────────────────
    function _switchToEdit() {
        const c = _allCustomers[_currentCode];
        if (!c) return;
        document.getElementById('clientsViewContainer').classList.add('hidden');
        document.getElementById('clientsEditContainer').classList.remove('hidden');
        document.getElementById('clientsFormTitle').textContent = `Edit: ${_currentCode}`;

        const form = document.getElementById('clientsForm');
        const inputs = form.querySelectorAll('[name]');
        Object.entries(c).forEach(([k, v]) => {
            if (k === 'GST_INC') {
                document.getElementById('clientsGstIncCheck').checked = v === 'Y';
                document.getElementById('clientsGstInc').value = v || 'N';
                return;
            }
            if (k === 'WP_ALERTS') {
                const el = document.getElementById('clientsWpAlerts');
                if (el) el.value = Array.isArray(v) ? v.join(', ') : (v || '');
                return;
            }
            if (k === 'WP_GROUP') {
                _resetWpGroupUI();
                const ids = Array.isArray(v) ? v : [];
                if (ids.length) _loadWpGroups(ids);
                return;
            }
            if (k === 'MOBILE_NUMBER') {
                const parts = (v || '').split('-');
                const form2 = document.getElementById('clientsForm');
                const ccEl  = form2.querySelector('[name="MOBILE_CC"]');
                const numEl = form2.querySelector('[name="MOBILE_NUM"]');
                if (parts.length === 2) {
                    if (ccEl)  ccEl.value  = parts[0];
                    if (numEl) numEl.value = parts[1];
                } else {
                    if (ccEl)  ccEl.value  = '91';
                    if (numEl) numEl.value = v || '';
                }
                return;
            }
            const el = [...inputs].find(i => i.getAttribute('name') === k);
            if (el) el.value = v || '';
        });
        const codeEl = document.getElementById('clientsCode');
        codeEl.value    = _currentCode;
        codeEl.readOnly = true;
        document.getElementById('clientsSubmitText').textContent = 'Update Customer';
        document.getElementById('clientsCancelBtn').classList.remove('hidden');

        // enable rates tab
        const ratesTab = document.getElementById('clientsTabRates');
        ratesTab.disabled = false;
        document.getElementById('clientsRateCode').textContent = _currentCode;
        _switchTab('details');
    }

    // ── Open add form ─────────────────────────────────────────────────────────
    function openAddPane() {
        _currentCode = null;
        _isUpdate    = false;
        document.getElementById('clientsViewContainer').classList.add('hidden');
        document.getElementById('clientsEditContainer').classList.remove('hidden');
        document.getElementById('clientsMsg').classList.add('hidden');
        document.getElementById('clientsFormTitle').textContent = 'New Client';
        document.getElementById('clientsForm').reset();
        document.getElementById('clientsGstInc').value = 'N';
        const codeEl = document.getElementById('clientsCode');
        codeEl.readOnly = false;
        document.getElementById('clientsSubmitText').textContent = 'Save Customer';
        document.getElementById('clientsCancelBtn').classList.add('hidden');
        const ratesTab = document.getElementById('clientsTabRates');
        ratesTab.disabled = true;
        _switchTab('details');
        _resetWpGroupUI();
        AdminPage.showDetail(true);
        AdminPage.showDetailPane();
    }

    // ── Validation ────────────────────────────────────────────────────────────
    // field name → [validator fn, error message]
    const FIELD_VALIDATORS = {
        'MOBILE_NUM':      [v => window.InputValidator.mobile(v),   'Invalid mobile number'],
        'EMAIL':           [v => window.InputValidator.email(v),    'Invalid email address'],
        'B2B_PINCODE':     [v => window.InputValidator.pin(v),      'Invalid pincode (6 digits)'],
        'BRANCH':          [v => window.InputValidator.branchCode(v.toUpperCase()), 'Branch must be 3 uppercase letters (e.g., DDN)'],
        'ID_GST_PAN_ADHAR':[v => {
            if (!v) return true;
            const u = v.toUpperCase();
            return window.InputValidator.gstin(u) || window.InputValidator.pan(u) || window.InputValidator.aadhar(u);
        }, 'Invalid GST / PAN / Aadhaar'],
    };

    function _showFieldError(input, msg) {
        input.classList.add('border-red-500');
        let err = input.parentNode.querySelector('.field-error');
        if (!err) {
            err = document.createElement('p');
            err.className = 'field-error text-xs text-red-600 mt-1';
            input.parentNode.appendChild(err);
        }
        err.textContent = msg;
    }

    function _clearFieldErrors(form) {
        form.querySelectorAll('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
        form.querySelectorAll('.field-error').forEach(el => el.remove());
    }

    function _validateForm(form) {
        if (!window.InputValidator) return true;
        _clearFieldErrors(form);
        let valid = true;
        Object.entries(FIELD_VALIDATORS).forEach(([name, [fn, msg]]) => {
            const el = form.querySelector(`[name="${name}"]`);
            if (!el || el.readOnly || el.disabled) return;
            if (!fn(el.value.trim())) {
                _showFieldError(el, msg);
                if (valid) el.focus();
                valid = false;
            }
        });
        return valid;
    }

    // ── Form submit ───────────────────────────────────────────────────────────
    async function _handleSubmit(e) {
        e.preventDefault();
        const form = document.getElementById('clientsForm');
        if (!_validateForm(form)) return;
        // uppercase required fields
        ['CODE', 'BRANCH', 'B2B_NAME', 'B2B_ADDRESS', 'B2B_LANDMARK', 'B2B_CITY', 'B2B_STATE', 'ID_GST_PAN_ADHAR', 'CODE_STATE'].forEach(n => {
            const el = form.querySelector(`[name="${n}"]`);
            if (el && el.value) el.value = el.value.toUpperCase();
        });
        const data = {};
        new FormData(form).forEach((v, k) => {
            data[k] = PERCENT_FIELDS.includes(k) && v !== '' ? parseFloat(v) / 100 : (v || '');
        });
        // combine country code + number into MOBILE_NUMBER
        const cc  = (data.MOBILE_CC  || '91').trim();
        const num = (data.MOBILE_NUM || '').trim();
        data.MOBILE_NUMBER = num ? `${cc}-${num}` : '';
        delete data.MOBILE_CC;
        delete data.MOBILE_NUM;
        // WP_ALERTS: comma-string → array
        data.WP_ALERTS = data.WP_ALERTS
            ? data.WP_ALERTS.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        // WP_GROUP: checked checkboxes → array of ids
        data.WP_GROUP = _getSelectedWpGroups();

        const btn = document.getElementById('clientsSubmitBtn');
        const spinner = document.getElementById('clientsSubmitSpinner');

        try {
            const action = _isUpdate ? 'update_client' : 'new_client';
            const writeToken = await _requestOtp(data.CODE || _currentCode, action);
            btn.disabled = true; spinner.classList.remove('hidden');
            await b2bWrite(data, _isUpdate ? _currentCode : null, writeToken);
            if (!_isUpdate) {
                _currentCode = data.CODE;
                _isUpdate    = true;
                document.getElementById('clientsCode').readOnly = true;
                document.getElementById('clientsSubmitText').textContent = 'Update Customer';
                document.getElementById('clientsCancelBtn').classList.remove('hidden');
                const ratesTab = document.getElementById('clientsTabRates');
                ratesTab.disabled = false;
                document.getElementById('clientsRateCode').textContent = _currentCode;
            }
            _msg('Client saved successfully.', 'success');
        } catch (err) {
            _msg(err.message, 'error');
        } finally {
            btn.disabled = false; spinner.classList.add('hidden');
        }
    }

    // ── Rate form ─────────────────────────────────────────────────────────────
    function _generateModeCheckboxes() {
        const wrap = document.getElementById('clientsModeCheckboxes');
        if (!wrap) return;
        wrap.innerHTML = '';
        _allModes.forEach(mode => {
            if (STANDARD_MODES.includes(mode.MODE.toLowerCase())) return;
            const label = document.createElement('label');
            label.className = 'flex items-center space-x-2 text-sm cursor-pointer';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'h-4 w-4 text-indigo-600 border-gray-300 rounded';
            cb.dataset.mode = mode.MODE;
            cb.addEventListener('change', () => { if (_currentCode) _generateRateForm(_currentCode); });
            const span = document.createElement('span');
            span.textContent = mode.MODE;
            label.appendChild(cb);
            label.appendChild(span);
            wrap.appendChild(label);
        });
    }

    function _generateRateForm(code) {
        if (!code) return;
        const container = document.getElementById('clientsRateTable');
        if (!container) return;
        container.innerHTML = '';

        if (!_allModes.length) {
            container.innerHTML = '<p class="text-center p-4 text-red-500 text-sm">Mode list not available.</p>';
            return;
        }

        const customer      = _allCustomers[code];
        const isSimplified  = customer?.RATE_LIST === 'SIMPLIFIED';
        const customerRates = Object.values(_allRates).filter(r => r.CODE === code);
        const rateMap       = customerRates.reduce((acc, r) => { if (r.UID) acc[r.UID.trim()] = r; return acc; }, {});

        document.getElementById('clientsSetDefaultBtn').classList.toggle('hidden', customerRates.length > 0);
        if (document.getElementById('clientsModeCheckboxes').children.length === 0) _generateModeCheckboxes();

        const table = document.createElement('table');
        table.className = 'w-full text-xs border-collapse table-fixed';
        const thead = table.createTHead();
        const hRow  = thead.insertRow();

        [{ text: 'Mode', w: 'w-24' }, { text: 'Wt', w: 'w-16' }].forEach((h, i) => {
            const th = document.createElement('th');
            th.textContent = h.text;
            th.className   = `rate-header sticky top-0 ${h.w}`;
            th.style.left  = i === 1 ? '96px' : '0';
            th.style.zIndex = '6';
            hRow.appendChild(th);
        });

        if (isSimplified) {
            SIMPLIFIED_ZONES.forEach(z => {
                const th = document.createElement('th');
                th.textContent = z.label;
                th.className   = 'rate-header w-20';
                hRow.appendChild(th);
            });
        } else {
            for (let i = 1; i <= 14; i++) {
                const th = document.createElement('th');
                th.textContent = `Z${i}`;
                th.className   = 'rate-header w-16';
                hRow.appendChild(th);
            }
        }

        const tbody = table.createTBody();
        const branch = customer?.BRANCH || '';

        const addRow = (modeName, shortCode, weight, weights, wIdx) => {
            const uid      = `${code}${shortCode}${weight}`;
            const existing = rateMap[uid];
            const hasData  = existing && [1,2,3,4,5,6,7,8,9,10,11,12,13,14].some(i => existing[`Z${i}`] !== null && existing[`Z${i}`] !== undefined && existing[`Z${i}`] !== '');

            const row = tbody.insertRow();
            row.className      = 'rate-row';
            row.dataset.uid    = uid; row.dataset.mode = modeName; row.dataset.weight = weight; row.dataset.hasData = hasData ? 'true' : 'false';

            // Mode cell
            const mc = row.insertCell();
            mc.className  = 'rate-label-col sticky w-24';
            mc.style.left = '0'; mc.style.zIndex = '1';
            mc.appendChild(document.createTextNode(modeName));

            // Weight cell
            const wc = row.insertCell();
            wc.className  = 'rate-label-col sticky w-16 text-gray-600';
            wc.style.left = '96px'; wc.style.zIndex = '1';
            if (wIdx < weights.length - 1) {
                const btn = document.createElement('span');
                btn.className   = 'add-row-btn';
                btn.textContent = '+';
                btn.style.marginRight = '0.25rem';
                btn.onclick = () => {
                    const nextRow = tbody.querySelector(`tr[data-uid="${code}${shortCode}${weights[wIdx+1]}"]`);
                    if (nextRow) { nextRow.classList.add('visible'); btn.style.display = 'none'; }
                };
                wc.appendChild(btn);
            }
            wc.appendChild(document.createTextNode(weight));

            // Hidden fields
            [['UID',uid],['MODE',modeName],['WEIGHT',weight],['BRANCH',branch],['CODE',code],['TYPE','CLIENT']].forEach(([f,v]) => {
                const inp = document.createElement('input');
                inp.type = 'hidden'; inp.name = `rate_${uid}_${f}`; inp.value = v;
                wc.appendChild(inp);
            });

            // Zone inputs
            if (isSimplified) {
                SIMPLIFIED_ZONES.forEach(z => {
                    const td = row.insertCell(); td.className = 'rate-data-cell';
                    const inp = document.createElement('input');
                    inp.type = 'number'; inp.step = 'any';
                    inp.className = 'form-input rate-input w-full simplified-zone-input';
                    inp.dataset.zones = JSON.stringify(z.zones); inp.dataset.uid = uid;
                    inp.value = existing?.[`Z${z.zones[0]}`] ?? '';
                    inp.placeholder = z.label;
                    td.appendChild(inp);
                });
            } else {
                for (let i = 1; i <= 14; i++) {
                    const td = row.insertCell(); td.className = 'rate-data-cell';
                    const inp = document.createElement('input');
                    inp.type = 'number'; inp.step = 'any';
                    inp.name = `rate_${uid}_Z${i}`;
                    inp.className = 'form-input rate-input w-full';
                    inp.value = existing?.[`Z${i}`] ?? '';
                    inp.placeholder = `Z${i}`;
                    td.appendChild(inp);
                }
            }
        };

        _allModes.forEach(mode => {
            const modeName  = mode.MODE;
            const shortCode = mode.SHORT;
            if (!shortCode) return;
            const modeLower = modeName.toLowerCase();
            const isStd     = STANDARD_MODES.includes(modeLower);
            const isChecked = !!document.querySelector(`#clientsModeCheckboxes input[data-mode="${modeName}"]`)?.checked;
            const hasModeData = customerRates.some(r => r.MODE === modeName);
            if (!isStd && !isChecked && !hasModeData) return;

            const weights  = (modeLower === 'express' || modeLower === 'premium') ? STATIC_WEIGHTS : DYNAMIC_WEIGHTS;
            const uidShort = modeLower === 'express' ? 'E' : modeLower === 'premium' ? 'P' : shortCode;
            weights.forEach((w, idx) => addRow(modeName, uidShort, w, weights, idx));
        });

        container.appendChild(table);

        // Visibility — use .visible class (matches style.css .rate-row.visible)
        tbody.querySelectorAll('.rate-row').forEach(row => {
            const mode = row.dataset.mode.toLowerCase();
            const w    = row.dataset.weight;
            const show = row.dataset.hasData === 'true'
                || mode === 'premium' || mode === 'express'
                || (mode === 'airline' && ['3','10','25'].includes(w))
                || (mode === 'surface' && ['3','10','25','50'].includes(w))
                || ['3','10','25','50'].includes(w);
            if (show) row.classList.add('visible');
        });

        // Hide + buttons for consecutive visible rows
        const modeGroups = {};
        tbody.querySelectorAll('.rate-row.visible').forEach(row => {
            const m = row.dataset.mode;
            if (!modeGroups[m]) modeGroups[m] = [];
            modeGroups[m].push(row);
        });
        Object.values(modeGroups).forEach(rows =>
            rows.slice(0, -1).forEach(row => {
                const btn = row.querySelector('.add-row-btn');
                if (btn) btn.style.display = 'none';
            })
        );
    }

    function _setDefaultRates() {
        if (!_currentCode) return;
        const customer = _allCustomers[_currentCode];
        const branch   = customer?.BRANCH || 'RRK';
        const defaults = Object.values(_allRates).filter(r => r.CODE === 'DFLT' && r.BRANCH === branch && r.TYPE === 'CLIENT');
        if (!defaults.length) { _msg(`No default rates for branch ${branch}`, 'error'); return; }

        const isSimplified = customer?.RATE_LIST === 'SIMPLIFIED';
        defaults.forEach(def => {
            const uid = `${_currentCode}${def.UID.replace('DFLT', '')}`;
            if (isSimplified) {
                document.querySelectorAll('#clientsRateForm .simplified-zone-input').forEach(inp => {
                    if (inp.dataset.uid !== uid) return;
                    const firstZone = JSON.parse(inp.dataset.zones)[0];
                    inp.value = def[`Z${firstZone}`] || '';
                });
            } else {
                for (let i = 1; i <= 14; i++) {
                    const inp = document.querySelector(`#clientsRateForm input[name="rate_${uid}_Z${i}"]`);
                    if (inp && def[`Z${i}`] != null) inp.value = def[`Z${i}`];
                }
            }
        });
        _msg('Default rates loaded. Click "Save All Rates" to save.', 'success');
    }

    async function _handleRateSubmit(e) {
        e.preventDefault();
        if (!_currentCode) { _msg('No client selected.', 'error'); return; }

        const customer     = _allCustomers[_currentCode];
        const isSimplified = customer?.RATE_LIST === 'SIMPLIFIED';
        const grouped      = {};
        const form         = document.getElementById('clientsRateForm');

        form.querySelectorAll('input[type="hidden"]').forEach(inp => {
            const m = inp.name.match(/^rate_([^_]+)_(.+)$/);
            if (!m) return;
            const uid = m[1]; const field = m[2];
            if (!grouped[uid]) grouped[uid] = { UID: uid };
            grouped[uid][field] = field === 'WEIGHT' ? (parseFloat(inp.value) || inp.value) : (inp.value || '');
        });

        if (isSimplified) {
            form.querySelectorAll('.simplified-zone-input').forEach(inp => {
                const uid = inp.dataset.uid; const zones = JSON.parse(inp.dataset.zones); const val = parseFloat(inp.value);
                if (!grouped[uid]) grouped[uid] = { UID: uid };
                zones.forEach(z => { grouped[uid][`Z${z}`] = isNaN(val) || inp.value === '' ? null : val; });
            });
        } else {
            form.querySelectorAll('input[type="number"]').forEach(inp => {
                const m = inp.name.match(/^rate_([^_]+)_(Z\d+)$/);
                if (!m) return;
                const uid = m[1]; const field = m[2];
                if (!grouped[uid]) grouped[uid] = { UID: uid };
                const n = parseFloat(inp.value);
                grouped[uid][field] = isNaN(n) || inp.value === '' ? null : n;
            });
        }

        const rates = Object.values(grouped).filter(r =>
            [1,2,3,4,5,6,7,8,9,10,11,12,13,14].some(i => r[`Z${i}`] != null && r[`Z${i}`] !== undefined)
        );
        if (!rates.length) { _msg('No rate data entered.', 'error'); return; }

        const btn = document.getElementById('clientsSaveRatesBtn');
        const sp  = document.getElementById('clientsRatesSpinner');
        try {
            const writeToken = await _requestOtp(_currentCode, 'save_rates');
            btn.disabled = true; sp.classList.remove('hidden');
            await b2bWriteRateList(_currentCode, rates, writeToken);
            _msg('Rates saved successfully.', 'success');
        } catch (err) {
            if (err.message !== 'cancelled') _msg(err.message, 'error');
        } finally {
            btn.disabled = false; sp.classList.add('hidden');
        }
    }

    // ── Delete flow ───────────────────────────────────────────────────────────
    function _showDeleteConfirm() {
        if (!_currentCode) return;
        const c = _allCustomers[_currentCode];
        document.getElementById('clientsDeleteName').textContent = `${c?.B2B_NAME || ''} (${_currentCode})`;
        document.getElementById('clientsDeleteConfirm').classList.remove('hidden');
    }

    async function _confirmDelete() {
        const btn = document.getElementById('clientsConfirmDeleteBtn');
        const sp  = document.getElementById('clientsDeleteSpinner');
        try {
            const writeToken = await _requestOtp(_currentCode, 'delete_client');
            btn.disabled = true; sp.classList.remove('hidden');
            await b2bDelete(_currentCode, writeToken);
            document.getElementById('clientsDeleteConfirm').classList.add('hidden');
            document.getElementById('clientsViewContainer').classList.add('hidden');
            _currentCode = null; _isUpdate = false;
            AdminPage.showDetail(false);
            _msg('Client deleted.', 'success');
        } catch (err) {
            if (err.message !== 'cancelled') _viewMsg(err.message, 'error');
        } finally {
            btn.disabled = false; sp.classList.add('hidden');
        }
    }

    // ── Bind all detail pane events ───────────────────────────────────────────
    function _bindDetailEvents() {
        _initPincode();

        document.getElementById('clientsTabDetails').addEventListener('click', () => _switchTab('details'));
        document.getElementById('clientsTabRates').addEventListener('click', () => {
            if (!document.getElementById('clientsTabRates').disabled) _switchTab('rates');
        });

        document.getElementById('clientsGstIncCheck').addEventListener('change', e => {
            document.getElementById('clientsGstInc').value = e.target.checked ? 'Y' : 'N';
        });

        document.getElementById('clientsEditBtn').addEventListener('click', _switchToEdit);
        document.getElementById('clientsDeleteBtn').addEventListener('click', _showDeleteConfirm);
        document.getElementById('clientsPrintBtn').addEventListener('click', () => _viewMsg('Print template coming soon.', 'info'));
        document.getElementById('clientsEmailBtn').addEventListener('click', () => _viewMsg('Email template coming soon.', 'info'));
        document.getElementById('clientsCancelBtn').addEventListener('click', () => {
            if (_isUpdate && _currentCode) {
                // back to view
                document.getElementById('clientsEditContainer').classList.add('hidden');
                document.getElementById('clientsViewContainer').classList.remove('hidden');
            } else {
                AdminPage.showDetail(false);
            }
        });
        document.getElementById('clientsForm').addEventListener('submit', _handleSubmit);
        // clear validation errors on input
        document.getElementById('clientsForm').addEventListener('input', e => {
            if (e.target.classList.contains('border-red-500')) {
                e.target.classList.remove('border-red-500');
                const err = e.target.parentNode.querySelector('.field-error');
                if (err) err.remove();
            }
        });

        document.getElementById('clientsSetDefaultBtn').addEventListener('click', _setDefaultRates);
        document.getElementById('clientsLoadGroupsBtn').addEventListener('click', () => _loadWpGroups(_getSelectedWpGroups()));
        document.getElementById('clientsRateForm').addEventListener('submit', _handleRateSubmit);

        document.getElementById('clientsConfirmDeleteBtn').addEventListener('click', _confirmDelete);
        document.getElementById('clientsCancelDeleteBtn').addEventListener('click', () => {
            document.getElementById('clientsDeleteConfirm').classList.add('hidden');
        });
    }

    // ── Data load ─────────────────────────────────────────────────────────────
    function _handleData(data) {
        if (!data) return;
        _allCustomers = data.B2B    || {};
        _allModes     = data.MODES  ? Object.values(data.MODES) : [];
        _allRates     = data.RATES  || {};
        _renderList(_allCustomers);
    }

    function load() {
        _injectListPane();
        // always re-inject — _showSplit wipes detailView each time
        _injectDetailPane();
        getAppData().then(data => {
            if (!data) return;
            _handleData(data);
            // restore selected client view after DOM re-inject
            if (_currentCode && _allCustomers[_currentCode]) {
                _selectClient(_currentCode);
            }
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────
    return { load, search, openAddPane };

})();

window.AdminClients = AdminClients;
