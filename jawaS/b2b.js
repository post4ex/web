// jawaS/b2b.js
// B2B.html page logic
// Depends on: core/b2b-api.js

document.addEventListener('DOMContentLoaded', () => {

// =============================================================================
// CONSTANTS
// =============================================================================
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
const PERCENT_FIELDS        = ['%_TOPAY_IF', '%_COD_IF', '%_FOV_IF', 'FUEL_CHARGES', 'DEV_CHARGES'];
const TEXT_FIELDS_UPPERCASE = ['B2B_NAME', 'B2B_ADDRESS', 'B2B_LANDMARK', 'B2B_CITY', 'B2B_STATE', 'ID_GST_PAN_ADHAR'];

// OTP action constants
const OTP_ACTION = {
    NEW_CLIENT:    'new_client',
    UPDATE_CLIENT: 'update_client',
    DELETE_CLIENT: 'delete_client',
    SAVE_RATES:    'save_rates',
};

// Pincode auto-fill
const _pincodeInput = document.getElementById('b2b_pincode');
if (_pincodeInput) {
    let _pt;
    _pincodeInput.addEventListener('input', () => {
        clearTimeout(_pt);
        const pin = _pincodeInput.value.trim();
        if (pin.length === 6 && /^\d{6}$/.test(pin) && typeof window.searchPin === 'function') {
            _pt = setTimeout(async () => {
                const result = await window.searchPin(pin);
                if (result?.found) {
                    const city = document.getElementById('b2b_city');
                    const state = document.getElementById('b2b_state');
                    const cs = document.getElementById('b2b_code_state');
                    const gc = document.getElementById('b2b_gst_code');
                    if (city)  city.value  = result.CITY       || '';
                    if (state) state.value = result.STATE_NAME || result.STATE || '';
                    if (cs)    cs.value    = result.STATE_CODE || '';
                    if (gc)    gc.value    = result.GST_CODE   || '';
                }
            }, 500);
        }
    });
}

// =============================================================================
// STATE
// =============================================================================
let allCustomers = {};
let allModes     = [];
let allRates     = {};
let currentCode  = null;
let isUpdateMode = false;
let _pendingOtpConfirm = null; // Stores the onConfirm callback for the active OTP session

// =============================================================================
// UI REFS
// =============================================================================
const ui = {
    customerListContainer:  document.getElementById('customerListContainer'),
    customerFormContainer:  document.getElementById('customerFormContainer'),
    customerViewContainer:  document.getElementById('customerViewContainer'),
    customerEditContainer:  document.getElementById('customerEditContainer'),
    customerViewContent:    document.getElementById('customerViewContent'),
    contentCustomerDetails: document.getElementById('contentCustomerDetails'),
    contentRateList:        document.getElementById('contentRateList'),
    rateTableContainer:     document.getElementById('rateTableContainer'),
    customerForm:           document.getElementById('customerForm'),
    rateForm:               document.getElementById('rateForm'),
    customerLoader:         document.getElementById('customerLoader'),
    rateLoader:             document.getElementById('rateLoader'),
    customerList:           document.getElementById('customerList'),
    searchCustomerInput:    document.getElementById('searchCustomer'),
    newCustomerBtn:         document.getElementById('newCustomerBtn'),
    backToListBtn:          document.getElementById('backToListBtn'),
    formTitle:              document.getElementById('formTitle'),
    codeInput:              document.getElementById('code'),
    clientNameInput:        document.getElementById('b2b_name'),
    gstIncCheck:            document.getElementById('gst_inc_check'),
    gstIncHidden:           document.getElementById('gst_inc'),
    tabCustomerDetails:     document.getElementById('tabCustomerDetails'),
    tabRateList:            document.getElementById('tabRateList'),
    rateListCodeSpan:       document.getElementById('rateListCustomerCode'),
    submitCustomerButton:   document.getElementById('submitCustomerButton'),
    customerButtonText:     document.getElementById('customerButtonText'),
    customerSpinner:        document.getElementById('customerSpinner'),
    deleteCustomerButton:   document.getElementById('deleteCustomerButton'),
    setDefaultRatesBtn:     document.getElementById('setDefaultRatesBtn'),
    modeCheckboxes:         document.getElementById('modeCheckboxes'),
    printCustomerBtn:       document.getElementById('printCustomerBtn'),
    emailCustomerBtn:       document.getElementById('emailCustomerBtn'),
    editCustomerBtn:        document.getElementById('editCustomerBtn'),
    cancelEditCustomerBtn:  document.getElementById('cancelEditCustomerBtn'),
    softDeleteCustomerBtn:  document.getElementById('softDeleteCustomerBtn'),
    submitRatesButton:      document.getElementById('submitRatesButton'),
    ratesButtonText:        document.getElementById('ratesButtonText'),
    ratesSpinner:           document.getElementById('ratesSpinner'),
    // Generalized OTP modal
    otpModal:               document.getElementById('otpModal'),
    otpModalTitle:          document.getElementById('otpModalTitle'),
    otpModalDesc:           document.getElementById('otpModalDesc'),
    otpInput:               document.getElementById('otpInput'),
    otpSendBtn:             document.getElementById('otpSendBtn'),
    otpVerifyBtn:           document.getElementById('otpVerifyBtn'),
    otpCancelBtn:           document.getElementById('otpCancelBtn'),
    otpModalSpinner:        document.getElementById('otpModalSpinner'),
    otpModalError:          document.getElementById('otpModalError'),
    responseMessage:        document.getElementById('responseMessage'),
};

// =============================================================================
// OTP MODAL — GENERALIZED VERIFICATION FLOW
// =============================================================================

/**
 * Opens the OTP verification modal and orchestrates the send-verify-confirm flow.
 *
 * @param {string}   action     - OTP action: 'new_client' | 'update_client' | 'delete_client' | 'save_rates'
 * @param {string}   title      - Modal heading text (e.g. "Confirm Delete")
 * @param {string}   desc       - Modal description (e.g. "Delete customer AGWL?")
 * @param {string}   code       - B2B client CODE to associate with the OTP
 * @param {Function} onConfirm  - Async callback(writeToken) that runs after OTP verification succeeds
 */
function openOtpModal(action, title, desc, code, onConfirm) {
    ui.otpModalTitle.textContent = title;
    ui.otpModalDesc.textContent  = desc;
    ui.otpInput.value = '';
    ui.otpModalError.classList.add('hidden');
    ui.otpModalSpinner.classList.add('hidden');
    ui.otpSendBtn.disabled = false;
    ui.otpSendBtn.textContent = 'Send OTP';

    // Reset pending callback
    _pendingOtpConfirm = null;

    ui.otpModal.classList.remove('hidden');

    // ── Send OTP button ─────────────────────────────────────────────────
    ui.otpSendBtn.onclick = async () => {
        ui.otpSendBtn.disabled = true;
        ui.otpSendBtn.textContent = 'Sending...';
        try {
            await b2bSendOtp(code, action);
            showOtpModalError(false, 'OTP sent to your email. Enter it below.');
            // Wire up confirm on pressing Enter in the OTP input
            ui.otpInput.focus();
            ui.otpModalDesc.textContent = desc + ' (OTP sent)';
        } catch (err) {
            showOtpModalError(true, err.message || 'Failed to send OTP');
        } finally {
            ui.otpSendBtn.disabled = false;
            ui.otpSendBtn.textContent = 'Resend OTP';
        }
    };

    // ── OTP input keydown — Enter triggers verify ───────────────────────
    ui.otpInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            _executeOtpVerify(action, code, onConfirm);
        }
    };

    // Store action/code/onConfirm on the verify button for easy access
    ui.otpVerifyBtn.dataset.action = action;
    ui.otpVerifyBtn.dataset.code   = code;
    ui.otpVerifyBtn._onConfirm     = onConfirm;
}

/**
 * Internal: verifies the OTP and calls onConfirm with the write_token.
 */
async function _executeOtpVerify(action, code, onConfirm) {
    const otp = ui.otpInput.value.trim();
    if (!otp) {
        showOtpModalError(true, 'Please enter the OTP first.');
        return;
    }

    ui.otpModalSpinner.classList.remove('hidden');
    ui.otpInput.disabled = true;
    ui.otpSendBtn.disabled = true;
    ui.otpModalError.classList.add('hidden');

    try {
        const verifyResult = await b2bVerifyOtp(code, action, otp);
        const writeToken = verifyResult.write_token;
        if (!writeToken) {
            throw new Error('No write token received from server.');
        }
        // OTP verified — close modal and execute the confirmed action
        ui.otpModal.classList.add('hidden');
        await onConfirm(writeToken);
    } catch (err) {
        showOtpModalError(true, err.message || 'OTP verification failed. Try again.');
        ui.otpInput.disabled = false;
        ui.otpSendBtn.disabled = false;
    } finally {
        ui.otpModalSpinner.classList.add('hidden');
    }
}

function showOtpModalError(isError, message) {
    ui.otpModalError.textContent = message;
    ui.otpModalError.className = `text-sm mt-2 ${isError ? 'text-red-600' : 'text-green-600'}`;
    ui.otpModalError.classList.remove('hidden');
}

function closeOtpModal() {
    ui.otpModal.classList.add('hidden');
    ui.otpInput.disabled = false;
    ui.otpInput.value = '';
    ui.otpModalError.classList.add('hidden');
    ui.otpModalSpinner.classList.add('hidden');
    _pendingOtpConfirm = null;
}

// =============================================================================
// VIEW HELPERS
// =============================================================================
const isMobile = () => window.innerWidth < 768;

function showFormView() {
    if (isMobile()) {
        ui.customerListContainer.classList.add('hidden');
        ui.customerFormContainer.classList.remove('hidden', 'md:block');
        ui.customerFormContainer.classList.add('block');
    }
    ui.customerFormContainer.classList.remove('hidden');
}

function showListView() {
    resetFormsAndTabs();
    if (isMobile()) {
        ui.customerListContainer.classList.remove('hidden');
        ui.customerFormContainer.classList.add('hidden');
        ui.customerFormContainer.classList.remove('block');
    } else {
        ui.customerListContainer.classList.remove('hidden');
        ui.customerFormContainer.classList.remove('hidden');
        showB2bOverview();
    }
}

function handleResize() {
    if (!isMobile()) {
        ui.customerListContainer.classList.remove('hidden');
        ui.customerFormContainer.classList.remove('hidden');
        ui.customerFormContainer.classList.add('md:block');
    } else {
        if (!ui.customerFormContainer.classList.contains('hidden')) {
            ui.customerListContainer.classList.add('hidden');
            ui.customerFormContainer.classList.add('block');
            ui.customerFormContainer.classList.remove('md:block');
        } else {
            ui.customerListContainer.classList.remove('hidden');
            ui.customerFormContainer.classList.add('hidden');
            ui.customerFormContainer.classList.remove('block');
        }
    }
}

function switchTab(activeTab) {
    const isDetails = activeTab === 'details';
    ui.tabCustomerDetails.classList.toggle('active', isDetails);
    ui.tabRateList.classList.toggle('active', !isDetails);
    ui.contentCustomerDetails.classList.toggle('hidden', !isDetails);
    ui.contentRateList.classList.toggle('hidden', isDetails);
    if (!isDetails && currentCode && !ui.tabRateList.disabled) {
        generateRateForm(currentCode);
    }
}

function showResponseMessage(message, type) {
    ui.responseMessage.innerHTML = `<p class="font-semibold">${message}</p>`;
    ui.responseMessage.className = `my-4 text-center p-3 rounded-lg text-sm ${
        type === 'success' ? 'bg-green-100 text-green-800' :
        type === 'error'   ? 'bg-red-100 text-red-800' :
                             'bg-blue-100 text-blue-800'
    }`;
    ui.responseMessage.classList.remove('hidden');
}

// =============================================================================
// DATA LOAD
// =============================================================================
function handleDataLoaded(data) {
    if (!data) return;

    if (data.B2B) {
        allCustomers = data.B2B;
        renderCustomerList(allCustomers);
        if (!currentCode) {
            showB2bOverview();
        }
    } else {
        ui.customerLoader.textContent = 'No B2B customers found.';
    }

    allModes = data.MODES ? Object.values(data.MODES) : [];
    allRates = data.RATES || {};

    if (currentCode && !ui.contentRateList.classList.contains('hidden')) {
        generateRateForm(currentCode);
    }
}

window.addEventListener('appDataLoaded',    (e) => handleDataLoaded(e.detail.data));
window.addEventListener('appDataRefreshed', (e) => handleDataLoaded(e.detail.data));

const waitForDB = () => new Promise(resolve => {
    if (window.appDB && window.appDB.db) return resolve();
    const t = setTimeout(resolve, 3000);
    window.addEventListener('indexedDBReady', () => { clearTimeout(t); resolve(); }, { once: true });
});
waitForDB().then(async () => {
    const data = await getAppData();
    if (data) handleDataLoaded(data);
});

// =============================================================================
// CUSTOMER LIST
// =============================================================================
function renderCustomerList(customers) {
    ui.customerList.innerHTML = '';
    const entries = Object.values(customers || {})
        .filter(c => c.STATUS !== 'DELETED')
        .sort((a, b) => (a.CODE || '').localeCompare(b.CODE || ''));

    if (!entries.length) {
        ui.customerLoader.textContent = 'No matching customers.';
        ui.customerLoader.classList.remove('hidden');
        return;
    }
    ui.customerLoader.classList.add('hidden');

    entries.forEach(cust => {
        if (!cust.CODE) return;
        const li = document.createElement('li');
        li.className = '';
        li.innerHTML = `<strong>${cust.B2B_NAME || 'Unnamed'}</strong><span class="sv-item-sub">${cust.CODE} (${cust.BRANCH || '—'})</span>`;
        li.dataset.code = cust.CODE;
        li.addEventListener('click', () => populateFormForEdit(cust.CODE));
        ui.customerList.appendChild(li);
    });
}

// =============================================================================
// FORM RESET
// =============================================================================
function resetFormsAndTabs() {
    ui.customerForm.reset();
    ui.rateForm.reset();
    ui.rateTableContainer.innerHTML = `<p id="rateLoader" class="text-center p-4 text-gray-500">Select or save a customer to view/edit rates.</p>`;
    ui.modeCheckboxes.innerHTML = '';
    ui.customerViewContainer.classList.add('hidden');
    ui.customerEditContainer.classList.remove('hidden');

    currentCode  = null;
    isUpdateMode = false;

    ui.codeInput.readOnly = false;
    ui.codeInput.classList.remove('readonly-input');
    ui.formTitle.textContent = 'Create New Customer';
    ui.customerButtonText.textContent = 'Submit New Customer';
    ui.deleteCustomerButton.classList.add('hidden');
    ui.tabRateList.disabled = true;
    ui.responseMessage.classList.add('hidden');
    ui.gstIncCheck.checked = false;
    ui.gstIncHidden.value = 'N';
    ui.rateListCodeSpan.textContent = '';

    switchTab('details');
}

// =============================================================================
// CUSTOMER VIEW (read-only)
// =============================================================================
function showB2bOverview() {
    ui.customerViewContainer.classList.remove('hidden');
    ui.customerEditContainer.classList.add('hidden');

    ui.editCustomerBtn.classList.add('hidden');
    ui.softDeleteCustomerBtn.classList.add('hidden');
    ui.printCustomerBtn.classList.add('hidden');
    ui.emailCustomerBtn.classList.add('hidden');

    const headerTitle = ui.customerViewContainer.querySelector('h1');
    if (headerTitle) headerTitle.textContent = 'B2B Customers Overview';

    const customers = Object.values(allCustomers).filter(c => c.STATUS !== 'DELETED');

    let html = `
        <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse text-left mobile-cards-table">
                <thead>
                    <tr class="bg-gray-100 border-b border-gray-200">
                        <th class="p-3 font-semibold text-gray-700">Code</th>
                        <th class="p-3 font-semibold text-gray-700">B2B Name</th>
                        <th class="p-3 font-semibold text-gray-700">Branch</th>
                        <th class="p-3 font-semibold text-gray-700">Type</th>
                        <th class="p-3 font-semibold text-gray-700">Status</th>
                        <th class="p-3 font-semibold text-gray-700">Usage</th>
                        <th class="p-3 font-semibold text-gray-700">Crossover (Clients / Orders)</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (customers.length === 0) {
        html += `<tr><td colspan="7" class="p-4 text-center text-gray-500">No customers found.</td></tr>`;
    } else {
        customers.forEach(c => {
            const xo = c.CROSSOVER || {};
            let b2b2c_cnt = parseInt(xo.B2B2C || xo.b2b2c) || 0;
            let ord_cnt = parseInt(xo.ORDERS || xo.orders || xo.order || xo.ORDER) || 0;

            let limit = parseFloat(c.CREDIT_LIMIT) || 0;
            let used = parseFloat(c.USED_LIMIT) || 0;
            let pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
            let usageText = limit > 0 ? `₹${used.toLocaleString('en-IN')} / ₹${limit.toLocaleString('en-IN')} (${pct}%)` : `₹${used.toLocaleString('en-IN')} / —`;

            html += `
                <tr class="border-b hover:bg-indigo-50 cursor-pointer transition-colors" data-code="${c.CODE}">
                    <td class="p-3 font-mono font-bold text-indigo-600" data-label="Code">${c.CODE}</td>
                    <td class="p-3" data-label="B2B Name">${c.B2B_NAME || '-'}</td>
                    <td class="p-3" data-label="Branch">${c.BRANCH || '-'}</td>
                    <td class="p-3" data-label="Type"><span class="px-2 py-0.5 text-xs rounded bg-gray-100">${c.B2B_TYPE || '-'}</span></td>
                    <td class="p-3" data-label="Status">
                        <span class="px-2 py-0.5 text-xs rounded font-semibold ${c.STATUS === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${c.STATUS || '-'}</span>
                    </td>
                    <td class="p-3 font-mono text-xs" data-label="Usage">${usageText}</td>
                    <td class="p-3 text-xs text-gray-500" data-label="Crossover">B2B2C: <strong>${b2b2c_cnt}</strong> | Orders: <strong>${ord_cnt}</strong></td>
                </tr>
            `;
        });
    }

    html += `
                </tbody>
            </table>
        </div>
    `;
    ui.customerViewContent.innerHTML = html;

    ui.customerViewContent.querySelectorAll('tbody tr').forEach(tr => {
        const code = tr.dataset.code;
        if (code) {
            tr.addEventListener('click', () => populateFormForEdit(code));
        }
    });
}

function showCustomerView(customer) {
    ui.customerViewContainer.classList.remove('hidden');
    ui.customerEditContainer.classList.add('hidden');

    ui.editCustomerBtn.classList.remove('hidden');
    ui.softDeleteCustomerBtn.classList.remove('hidden');
    ui.printCustomerBtn.classList.remove('hidden');
    ui.emailCustomerBtn.classList.remove('hidden');

    const headerTitle = ui.customerViewContainer.querySelector('h1');
    if (headerTitle) headerTitle.textContent = 'Customer Details';

    const customerRates = Object.values(allRates).filter(r => r.CODE === customer.CODE);

    let html = `
        <div class="space-y-6">
            <div class="border-b pb-4">
                <h3 class="text-md font-semibold text-indigo-600 mb-3">Basic Information</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span class="font-semibold text-gray-600">Code:</span> ${customer.CODE || '-'}</div>
                    <div class="col-span-3"><span class="font-semibold text-gray-600">Name:</span> ${customer.B2B_NAME || '-'}</div>
                    <div><span class="font-semibold text-gray-600">Branch:</span> ${customer.BRANCH || '-'}</div>
                    <div><span class="font-semibold text-gray-600">Type:</span> ${customer.B2B_TYPE || '-'}</div>
                    <div><span class="font-semibold text-gray-600">Status:</span>
                        <span class="px-2 py-1 rounded text-xs font-semibold ${customer.STATUS === 'ACTIVE' ? 'bg-green-100 text-green-800' : customer.STATUS === 'BLOCKED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}">${customer.STATUS || '-'}</span>
                    </div>
                    <div><span class="font-semibold text-gray-600">Rate List:</span> ${customer.RATE_LIST || '-'}</div>
                </div>
            </div>
            <div class="border-b pb-4">
                <h3 class="text-md font-semibold text-indigo-600 mb-3">Contact Details</h3>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div><span class="font-semibold text-gray-600">Mobile:</span> ${customer.MOBILE_NUMBER || '-'}</div>
                    <div class="col-span-2"><span class="font-semibold text-gray-600">Email:</span> ${customer.EMAIL || '-'}</div>
                    <div class="col-span-3"><span class="font-semibold text-gray-600">Address:</span> ${customer.B2B_ADDRESS || '-'}</div>
                    <div><span class="font-semibold text-gray-600">City:</span> ${customer.B2B_CITY || '-'}</div>
                    <div><span class="font-semibold text-gray-600">State:</span> ${customer.B2B_STATE || '-'}</div>
                    <div><span class="font-semibold text-gray-600">Code State:</span> ${customer.CODE_STATE || '-'}</div>
                    <div><span class="font-semibold text-gray-600">GST Code:</span> ${customer.GST_CODE || '-'}</div>
                    <div><span class="font-semibold text-gray-600">Pincode:</span> ${customer.B2B_PINCODE || '-'}</div>
                </div>
            </div>
            <div class="border-b pb-4">
                <h3 class="text-md font-semibold text-indigo-600 mb-3">Usage & Credit</h3>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div><span class="font-semibold text-gray-600">Credit Limit:</span> ${customer.CREDIT_LIMIT ? '₹' + parseFloat(customer.CREDIT_LIMIT).toLocaleString('en-IN') : '—'}</div>
                    <div><span class="font-semibold text-gray-600">Billed Usage:</span> <span class="text-amber-700">${customer.BILLED_USAGE != null ? '₹' + parseFloat(customer.BILLED_USAGE).toLocaleString('en-IN') : '—'}</span></div>
                    <div><span class="font-semibold text-gray-600">Unbilled Usage:</span> <span class="text-amber-700">${customer.UNBILLED_USAGE != null ? '₹' + parseFloat(customer.UNBILLED_USAGE).toLocaleString('en-IN') : '—'}</span></div>
                    ${(() => {
                        const creditLimit = parseFloat(customer.CREDIT_LIMIT || 0);
                        const billedUsage = parseFloat(customer.BILLED_USAGE || 0);
                        const unbilledUsage = parseFloat(customer.UNBILLED_USAGE || 0);
                        const remainingCredit = creditLimit - (billedUsage + unbilledUsage);
                        if (creditLimit === 0) {
                            return `<div class="col-span-3"><span class="font-semibold text-gray-600">Remaining Credit:</span> <span class="text-gray-500 font-semibold">No Credit Limit</span></div>`;
                        } else if (remainingCredit <= 0) {
                            return `<div class="col-span-3"><span class="font-semibold text-gray-600">Remaining Credit:</span> <span class="text-red-600 font-bold">₹0 (Over limit by ₹${Math.abs(remainingCredit).toLocaleString('en-IN')})</span></div>`;
                        } else {
                            return `<div class="col-span-3"><span class="font-semibold text-gray-600">Remaining Credit:</span> <span class="text-green-600 font-semibold">₹${remainingCredit.toLocaleString('en-IN')}</span></div>`;
                        }
                    })()}
                </div>
            </div>
            <div class="border-b pb-4">
                <h3 class="text-md font-semibold text-indigo-600 mb-3">Charges & Settings</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span class="font-semibold text-gray-600">Weight Change:</span> ${customer.WEIGHT_CHANGE || '-'}</div>
                    <div><span class="font-semibold text-gray-600">% TO-PAY:</span> ${customer['%_TOPAY_IF'] || '-'}</div>
                    <div><span class="font-semibold text-gray-600">% COD:</span> ${customer['%_COD_IF'] || '-'}</div>
                    <div><span class="font-semibold text-gray-600">% FOV:</span> ${customer['%_FOV_IF'] || '-'}</div>
                    <div><span class="font-semibold text-gray-600">Fuel %:</span> ${customer.FUEL_CHARGES || '-'}</div>
                    <div><span class="font-semibold text-gray-600">Dev %:</span> ${customer.DEV_CHARGES || '-'}</div>
                    <div><span class="font-semibold text-gray-600">AWB Charge:</span> ${customer.AWB_CHARGES || '-'}</div>
                    <div><span class="font-semibold text-gray-600">GST Inc:</span> ${customer.GST_INC === 'Y' ? 'Yes' : 'No'}</div>
                    <div><span class="font-semibold text-gray-600">Bill Cycle:</span> ${customer.BILL_CYCLE || '-'}</div>
                </div>
            </div>
            <div>
                <h3 class="text-md font-semibold text-indigo-600 mb-3">Rate List (${customerRates.length} rates)</h3>`;

    if (customerRates.length > 0) {
        html += '<div class="overflow-x-auto"><table class="w-full text-xs border-collapse"><thead><tr class="bg-gray-100"><th class="border p-2">Mode</th><th class="border p-2">Weight</th>';
        for (let i = 1; i <= 14; i++) html += `<th class="border p-2">Z${i}</th>`;
        html += '</tr></thead><tbody>';
        customerRates.forEach(rate => {
            html += `<tr><td class="border p-2">${rate.MODE || '-'}</td><td class="border p-2">${rate.WEIGHT || '-'}</td>`;
            for (let i = 1; i <= 14; i++) html += `<td class="border p-2 text-right">${rate[`Z${i}`] || '-'}</td>`;
            html += '</tr>';
        });
        html += '</tbody></table></div>';
    } else {
        html += '<p class="text-gray-500 text-center py-4">No rates defined.</p>';
    }
    html += '</div></div>';
    ui.customerViewContent.innerHTML = html;
}

// =============================================================================
// FORM POPULATE & EDIT
// =============================================================================
function populateFormForEdit(code) {
    const customer = allCustomers[code];
    if (!customer) return;
    resetFormsAndTabs();
    currentCode  = code;
    isUpdateMode = true;
    showCustomerView(customer);
    showFormView();
}

function switchToEditMode() {
    const customer = allCustomers[currentCode];
    if (!customer) return;

    ui.customerViewContainer.classList.add('hidden');
    ui.customerEditContainer.classList.remove('hidden');

    for (const key in customer) {
        const input = ui.customerForm.querySelector(`[name="${key}"]`);
        if (!input) continue;
        if (key === 'GST_INC') {
            ui.gstIncCheck.checked = customer[key] === 'Y';
            ui.gstIncHidden.value  = customer[key] || 'N';
        } else if ((key === 'TIMESTAMP' || key === 'TIME_STAMP') && customer[key]) {
            input.value = fmtDate(customer[key], 'full');
        } else {
            input.value = customer[key] || '';
        }
    }

    ui.codeInput.value = currentCode;
    ui.codeInput.readOnly = true;
    ui.codeInput.classList.add('readonly-input');
    ui.formTitle.textContent       = `Edit Customer: ${currentCode}`;
    ui.customerButtonText.textContent = 'Update Customer';
    ui.deleteCustomerButton.classList.remove('hidden');
    ui.tabRateList.disabled = false;
    ui.rateListCodeSpan.textContent = currentCode;

    showFormView();
    switchTab('details');
}

function cancelCustomerEdit() {
    if (currentCode) {
        const customer = allCustomers[currentCode];
        if (customer) {
            showCustomerView(customer);
            return;
        }
    }
    resetFormsAndTabs();
    showB2bOverview();
    if (isMobile()) {
        ui.customerListContainer.classList.remove('hidden');
        ui.customerFormContainer.classList.add('hidden');
    }
}

// =============================================================================
// CUSTOMER FORM SUBMIT — with OTP flow
// =============================================================================
async function handleCustomerSubmit(e) {
    e.preventDefault();

    // Uppercase required fields
    ['CODE', 'BRANCH', ...TEXT_FIELDS_UPPERCASE].forEach(name => {
        const el = ui.customerForm.querySelector(`[name="${name}"]`);
        if (el && el.value) el.value = el.value.toUpperCase();
    });

    const submitData = {};
    new FormData(ui.customerForm).forEach((value, key) => {
        submitData[key] = PERCENT_FIELDS.includes(key) && value !== ''
            ? parseFloat(value) / 100
            : (value || '');
    });

    const code     = submitData.CODE;
    const action   = isUpdateMode ? OTP_ACTION.UPDATE_CLIENT : OTP_ACTION.NEW_CLIENT;
    const title    = isUpdateMode ? `Confirm Update: ${code}` : `Confirm Create: ${code}`;
    const desc     = isUpdateMode
        ? `Update customer "${submitData.B2B_NAME || code}" (${code})?`
        : `Create new customer "${submitData.B2B_NAME || code}" (${code})?`;

    openOtpModal(action, title, desc, code, async (writeToken) => {
        ui.customerSpinner.classList.remove('hidden');
        ui.submitCustomerButton.disabled = true;
        ui.customerButtonText.textContent = 'Processing...';

        try {
            const result = await b2bWrite(submitData, isUpdateMode ? currentCode : null, writeToken);
            showResponseMessage(result.message || 'Customer saved successfully.', 'success');

            if (!isUpdateMode) {
                currentCode  = code;
                isUpdateMode = true;
                ui.codeInput.value = currentCode;
                ui.codeInput.readOnly = true;
                ui.codeInput.classList.add('readonly-input');
                ui.formTitle.textContent          = `Edit Customer: ${currentCode}`;
                ui.customerButtonText.textContent = 'Update Customer';
                ui.deleteCustomerButton.classList.remove('hidden');
                ui.tabRateList.disabled = false;
                ui.rateListCodeSpan.textContent = currentCode;
            }
        } catch (err) {
            showResponseMessage(err.message, 'error');
        } finally {
            ui.customerSpinner.classList.add('hidden');
            ui.submitCustomerButton.disabled = false;
            ui.customerButtonText.textContent = isUpdateMode ? 'Update Customer' : 'Submit New Customer';
        }
    });
}

// =============================================================================
// RATE FORM
// =============================================================================
function generateModeCheckboxes() {
    ui.modeCheckboxes.innerHTML = '';
    allModes.forEach(mode => {
        if (STANDARD_MODES.includes(mode.MODE.toLowerCase())) return;
        const label    = document.createElement('label');
        label.className = 'flex items-center space-x-2 text-sm cursor-pointer';
        const checkbox  = document.createElement('input');
        checkbox.type   = 'checkbox';
        checkbox.className = 'h-4 w-4 text-indigo-600 border-gray-300 rounded';
        checkbox.dataset.mode = mode.MODE;
        checkbox.addEventListener('change', () => { if (currentCode) generateRateForm(currentCode); });
        const span = document.createElement('span');
        span.textContent = mode.MODE;
        label.appendChild(checkbox);
        label.appendChild(span);
        ui.modeCheckboxes.appendChild(label);
    });
}

function generateRateForm(code) {
    if (!code) return;
    ui.rateListCodeSpan.textContent = code;
    ui.rateTableContainer.innerHTML = '';

    if (!allModes.length) {
        ui.rateTableContainer.innerHTML = '<p class="text-center p-4 text-red-500">Mode list not available.</p>';
        return;
    }

    const customer     = allCustomers[code];
    const isSimplified = customer?.RATE_LIST === 'SIMPLIFIED';
    const customerRates = Object.values(allRates).filter(r => r.CODE === code);
    const rateMap = customerRates.reduce((acc, r) => { if (r.UID) acc[r.UID.trim()] = r; return acc; }, {});

    ui.setDefaultRatesBtn.classList.toggle('hidden', customerRates.length > 0);

    if (ui.modeCheckboxes.children.length === 0) generateModeCheckboxes();

    const table   = document.createElement('table');
    table.className = 'w-full text-xs border-collapse table-fixed';
    const thead   = table.createTHead();
    const headRow = thead.insertRow();

    [{ text: 'Mode', w: 'w-24' }, { text: 'Wt', w: 'w-16' }].forEach((h, i) => {
        const th = document.createElement('th');
        th.textContent = h.text;
        th.className   = `rate-header sticky top-0 ${h.w}`;
        th.style.left  = i === 1 ? '96px' : '0';
        th.style.zIndex = '6';
        headRow.appendChild(th);
    });

    if (isSimplified) {
        SIMPLIFIED_ZONES.forEach(z => {
            const th = document.createElement('th');
            th.textContent = z.label;
            th.className   = 'rate-header w-20';
            headRow.appendChild(th);
        });
    } else {
        for (let i = 1; i <= 14; i++) {
            const th = document.createElement('th');
            th.textContent = `Z${i}`;
            th.className   = 'rate-header w-16';
            headRow.appendChild(th);
        }
    }

    const tbody = table.createTBody();
    const customerBranch = customer?.BRANCH || '';

    const addRateRow = (modeName, shortCode, weight, weightsArr, wIdx) => {
        const uid         = `${code}${shortCode}${weight}`;
        const existing    = rateMap[uid];
        const hasData     = existing && [1,2,3,4,5,6,7,8,9,10,11,12,13,14].some(i => existing[`Z${i}`] !== null && existing[`Z${i}`] !== undefined && existing[`Z${i}`] !== '');

        const row = tbody.insertRow();
        row.className       = 'rate-row';
        row.dataset.uid     = uid;
        row.dataset.mode    = modeName;
        row.dataset.weight  = weight;
        row.dataset.hasData = hasData ? 'true' : 'false';

        // Mode cell
        const modeCell = row.insertCell();
        modeCell.className  = 'rate-label-col sticky w-24';
        modeCell.style.left = '0';
        modeCell.style.zIndex = '1';
        modeCell.appendChild(document.createTextNode(modeName));

        // Weight cell
        const wtCell = row.insertCell();
        wtCell.className  = 'rate-label-col sticky w-16 text-gray-600';
        wtCell.style.left = '96px';
        wtCell.style.zIndex = '1';

        if (wIdx < weightsArr.length - 1) {
            const btn = document.createElement('span');
            btn.className   = 'add-row-btn';
            btn.textContent = '+';
            btn.style.marginRight = '0.25rem';
            btn.onclick = () => {
                const nextUid = `${code}${shortCode}${weightsArr[wIdx + 1]}`;
                const nextRow = tbody.querySelector(`tr[data-uid="${nextUid}"]`);
                if (nextRow) { nextRow.classList.add('visible'); btn.style.display = 'none'; }
            };
            wtCell.appendChild(btn);
        }
        wtCell.appendChild(document.createTextNode(weight));

        // Hidden fields
        [['UID', uid], ['Service', modeName], ['Weight', weight], ['Branch', customerBranch], ['ServiceShortCode', shortCode], ['TYPE', 'CLIENT']].forEach(([f, v]) => {
            const inp = document.createElement('input');
            inp.type  = 'hidden';
            inp.name  = `rate_${uid}_${f}`;
            inp.value = v;
            wtCell.appendChild(inp);
        });

        // Zone inputs
        if (isSimplified) {
            SIMPLIFIED_ZONES.forEach(z => {
                const cell  = row.insertCell();
                cell.className = 'rate-data-cell';
                const input = document.createElement('input');
                input.type  = 'number';
                input.step  = 'any';
                input.className = 'form-input rate-input w-full simplified-zone-input';
                input.dataset.zones = JSON.stringify(z.zones);
                input.dataset.uid   = uid;
                input.value = existing?.[`Z${z.zones[0]}`] ?? '';
                input.placeholder = z.label;
                cell.appendChild(input);
            });
        } else {
            for (let i = 1; i <= 14; i++) {
                const cell  = row.insertCell();
                cell.className = 'rate-data-cell';
                const input = document.createElement('input');
                input.type  = 'number';
                input.step  = 'any';
                input.name  = `rate_${uid}_Z${i}`;
                input.className = 'form-input rate-input w-full';
                input.value = existing?.[`Z${i}`] ?? '';
                input.placeholder = `Z${i}`;
                cell.appendChild(input);
            }
        }
    };

    allModes.forEach(mode => {
        const modeName  = mode.MODE;
        const shortCode = mode.SHORT;
        const modeLower = modeName.toLowerCase();
        if (!shortCode) return;

        const isStandard = STANDARD_MODES.includes(modeLower);
        const isChecked  = !!document.querySelector(`input[data-mode="${modeName}"]`)?.checked;
        const hasModeData = customerRates.some(r => r.MODE === modeName);
        if (!isStandard && !isChecked && !hasModeData) return;

        const weights   = (modeLower === 'express' || modeLower === 'premium') ? STATIC_WEIGHTS : DYNAMIC_WEIGHTS;
        const uidShort  = modeLower === 'express' ? 'E' : modeLower === 'premium' ? 'P' : shortCode;
        weights.forEach((w, idx) => addRateRow(modeName, uidShort, w, weights, idx));
    });

    ui.rateTableContainer.appendChild(table);

    // Visibility logic
    tbody.querySelectorAll('.rate-row').forEach(row => {
        const mode   = row.dataset.mode.toLowerCase();
        const weight = row.dataset.weight;
        const hasData = row.dataset.hasData === 'true';
        const show = hasData
            || mode === 'premium' || mode === 'express'
            || (['airline'].includes(mode) && ['3','10','25'].includes(weight))
            || (['surface'].includes(mode) && ['3','10','25','50'].includes(weight))
            || ['3','10','25','50'].includes(weight);
        if (show) row.classList.add('visible');
    });

    // Hide + buttons for consecutive visible rows
    const modeGroups = {};
    tbody.querySelectorAll('.rate-row.visible').forEach(row => {
        const m = row.dataset.mode;
        if (!modeGroups[m]) modeGroups[m] = [];
        modeGroups[m].push(row);
    });
    Object.values(modeGroups).forEach(rows => {
        rows.slice(0, -1).forEach(row => {
            const btn = row.querySelector('.add-row-btn');
            if (btn) btn.style.display = 'none';
        });
    });
}

function setDefaultRates() {
    if (!currentCode) return;
    const customer = allCustomers[currentCode];
    const branch   = customer?.BRANCH || 'RRK';
    const defaults = Object.values(allRates).filter(r => r.CODE === 'DFLT' && r.BRANCH === branch && r.TYPE === 'CLIENT');

    if (!defaults.length) {
        showResponseMessage(`No default rates found for branch ${branch}`, 'error');
        return;
    }

    const isSimplified = customer?.RATE_LIST === 'SIMPLIFIED';
    defaults.forEach(def => {
        const uid = `${currentCode}${def.UID.replace('DFLT', '')}`;
        if (isSimplified) {
            ui.rateForm.querySelectorAll('.simplified-zone-input').forEach(input => {
                if (input.dataset.uid !== uid) return;
                const firstZone = JSON.parse(input.dataset.zones)[0];
                input.value = def[`Z${firstZone}`] || '';
            });
        } else {
            for (let i = 1; i <= 14; i++) {
                const input = ui.rateForm.querySelector(`input[name="rate_${uid}_Z${i}"]`);
                if (input && def[`Z${i}`] != null) input.value = def[`Z${i}`];
            }
        }
    });
    showResponseMessage('Default rates loaded. Click "Save All Rates" to save.', 'success');
}

// =============================================================================
// RATE FORM SUBMIT — with OTP flow
// =============================================================================
async function handleRateSubmit(e) {
    e.preventDefault();
    if (!currentCode) { showResponseMessage('No customer selected.', 'error'); return; }

    const customer     = allCustomers[currentCode];
    const isSimplified = customer?.RATE_LIST === 'SIMPLIFIED';
    const grouped      = {};

    // Collect hidden fields
    ui.rateForm.querySelectorAll('input[type="hidden"]').forEach(input => {
        const parts = input.name.split('_');
        if (parts[0] !== 'rate' || parts.length < 3) return;
        const uid   = parts[1];
        const field = parts.slice(2).join('_');
        if (!grouped[uid]) grouped[uid] = { UID: uid };
        grouped[uid][field] = input.value || '';
    });

    // Collect zone values
    if (isSimplified) {
        ui.rateForm.querySelectorAll('.simplified-zone-input').forEach(input => {
            const uid   = input.dataset.uid;
            const zones = JSON.parse(input.dataset.zones);
            const val   = parseFloat(input.value);
            if (!grouped[uid]) grouped[uid] = { UID: uid };
            zones.forEach(z => { grouped[uid][`Z${z}`] = isNaN(val) || input.value === '' ? null : val; });
        });
    } else {
        ui.rateForm.querySelectorAll('input[type="number"]:not(.simplified-zone-input)').forEach(input => {
            const parts = input.name.split('_');
            if (parts[0] !== 'rate' || parts.length < 3) return;
            const uid   = parts[1];
            const field = parts.slice(2).join('_');
            if (!grouped[uid]) grouped[uid] = { UID: uid };
            if (field.startsWith('Z')) {
                const num = parseFloat(input.value);
                grouped[uid][field] = isNaN(num) || input.value === '' ? null : num;
            }
        });
    }

    const rates = Object.values(grouped).filter(r =>
        [1,2,3,4,5,6,7,8,9,10,11,12,13,14].some(i => r[`Z${i}`] !== null && r[`Z${i}`] !== undefined)
    );

    if (!rates.length) { showResponseMessage('No rate data entered.', 'error'); return; }

    // Open OTP modal for rate save
    const code  = currentCode;
    const title = `Confirm Rate Save: ${code}`;
    const desc  = `Save ${rates.length} rate entries for customer "${allCustomers[code]?.B2B_NAME || code}" (${code})?`;

    openOtpModal(OTP_ACTION.SAVE_RATES, title, desc, code, async (writeToken) => {
        ui.ratesSpinner.classList.remove('hidden');
        ui.submitRatesButton.disabled = true;
        ui.ratesButtonText.textContent = 'Saving...';

        try {
            await b2bWriteRateList(code, rates, writeToken);
            showResponseMessage('Rates saved successfully.', 'success');
        } catch (err) {
            showResponseMessage(err.message, 'error');
        } finally {
            ui.ratesSpinner.classList.add('hidden');
            ui.submitRatesButton.disabled = false;
            ui.ratesButtonText.textContent = 'Save All Rates';
        }
    });
}

// =============================================================================
// DELETE HANDLERS — uses generalized OTP modal
// =============================================================================
function openDeleteConfirm(code) {
    const customer = allCustomers[code];
    const name     = customer?.B2B_NAME || code;
    const title    = `Confirm Delete: ${code}`;
    const desc     = `Delete customer "${name}" (${code})? This will mark them as DELETED in both Supabase and Manager.io.`;

    openOtpModal(OTP_ACTION.DELETE_CLIENT, title, desc, code, async (writeToken) => {
        try {
            await b2bDelete(code, writeToken);
            closeOtpModal();
            showListView();
        } catch (err) {
            showResponseMessage(err.message, 'error');
        }
    });
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================
ui.searchCustomerInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = {};
    Object.entries(allCustomers).forEach(([k, c]) => {
        if (c.STATUS !== 'DELETED' &&
            ((c.B2B_NAME || '').toLowerCase().includes(term) ||
             (c.CODE || '').toLowerCase().includes(term))) {
            filtered[k] = c;
        }
    });
    renderCustomerList(filtered);
});

ui.newCustomerBtn.addEventListener('click', () => { resetFormsAndTabs(); showFormView(); });
ui.backToListBtn.addEventListener('click', showListView);
ui.editCustomerBtn.addEventListener('click', switchToEditMode);
ui.cancelEditCustomerBtn.addEventListener('click', cancelCustomerEdit);
ui.printCustomerBtn.addEventListener('click', () => showResponseMessage('Print template coming soon.', 'info'));
ui.emailCustomerBtn.addEventListener('click', () => showResponseMessage('Email template coming soon.', 'info'));

// Read-only view "Delete" button → OTP delete
ui.softDeleteCustomerBtn.addEventListener('click', () => {
    if (currentCode) openDeleteConfirm(currentCode);
});

// Edit form "Delete Customer" button → OTP delete
ui.deleteCustomerButton.addEventListener('click', () => {
    if (currentCode) openDeleteConfirm(currentCode);
});

// OTP modal: Verify button triggers the OTP verification
ui.otpVerifyBtn.addEventListener('click', () => {
    // _pendingOtpConfirm is set when openOtpModal is called
    // The action/code/onConfirm are captured in the openOtpModal closure
    // We need to trigger verification. Since _executeOtpVerify is not exported,
    // we trigger the same logic by calling the internal flow.
    // The verify action is stored in otpVerifyBtn's dataset during openOtpModal
    const action = ui.otpVerifyBtn.dataset.action;
    const code   = ui.otpVerifyBtn.dataset.code;
    const onConfirm = ui.otpVerifyBtn._onConfirm;
    if (action && code && onConfirm) {
        _executeOtpVerify(action, code, onConfirm);
    }
});

// OTP modal cancel
ui.otpCancelBtn.addEventListener('click', closeOtpModal);

// Close modal on overlay click (click outside modal-content)
ui.otpModal.addEventListener('click', (e) => {
    if (e.target === ui.otpModal) closeOtpModal();
});

ui.gstIncCheck.addEventListener('change', () => {
    ui.gstIncHidden.value = ui.gstIncCheck.checked ? 'Y' : 'N';
});

ui.tabCustomerDetails.addEventListener('click', () => switchTab('details'));
ui.tabRateList.addEventListener('click', () => { if (!ui.tabRateList.disabled) switchTab('rates'); });
ui.setDefaultRatesBtn.addEventListener('click', setDefaultRates);

ui.customerForm.addEventListener('submit', handleCustomerSubmit);
ui.rateForm.addEventListener('submit', handleRateSubmit);

window.addEventListener('resize', handleResize);

// Init
resetFormsAndTabs();
handleResize();

}); // end DOMContentLoaded
