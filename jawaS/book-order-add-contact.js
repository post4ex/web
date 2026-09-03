// jawaS/book-order-add-contact.js
// Inline Add / Edit Contact modal for BookOrder.html and EditOrder.html
// Depends on: core/b2b2c-api.js, utils/searchpin.js
// Communicates with book-order.js via window.bookOrderCtx

import { searchPin } from '../utils/searchpin.js';

const modal      = document.getElementById('addContactModal');
const overlay    = document.getElementById('addContactOverlay');
const form       = document.getElementById('addContactModalForm');
const titleEl    = document.getElementById('addContactTitle');
const errorEl    = document.getElementById('addContactError');
const saveBtn    = document.getElementById('addContactSaveBtn');
const cancelBtn  = document.getElementById('addContactCancelBtn');
const spinner    = document.getElementById('addContactSpinner');
const carrierDL  = document.getElementById('addContactCarrierList');
const pinStatus  = document.getElementById('ac_pincode_status');

const fields = {
    name:       document.getElementById('ac_name'),
    mobile:     document.getElementById('ac_mobile'),
    pincode:    document.getElementById('ac_pincode'),
    address:    document.getElementById('ac_address'),
    email:      document.getElementById('ac_email'),
    gst:        document.getElementById('ac_gstin'),
    pan:        document.getElementById('ac_pan'),
    aadhaar:    document.getElementById('ac_aadhaar'),
    carrier:    document.getElementById('ac_carrier'),
    branch:     document.getElementById('ac_branch'),
    code:       document.getElementById('ac_code'),
    city:       document.getElementById('ac_city'),
    state:      document.getElementById('ac_state'),
    stateCode:  document.getElementById('ac_state_code'),
    gstCode:    document.getElementById('ac_gst_code'),
    zone:       document.getElementById('ac_zone'),
    oda:        document.getElementById('ac_oda'),
    expressTat: document.getElementById('ac_express_tat'),
    airlineTat: document.getElementById('ac_airline_tat'),
    surfaceTat: document.getElementById('ac_surface_tat'),
    premiumTat: document.getElementById('ac_premium_tat'),
};

const LOGISTICS_FIELDS = ['zone', 'oda', 'expressTat', 'airlineTat', 'surfaceTat', 'premiumTat'];
const TAT_FIELDS = ['airlineTat', 'surfaceTat', 'premiumTat'];

let addContactType = null; // 'sender' | 'receiver'
let editingUid = null;     // UID when in edit mode

// --- PINCODE HELPERS ---

function clearDerivedFields() {
    ['city', 'state', 'stateCode', 'gstCode', 'gst', 'pan', 'aadhaar', 'zone', 'oda', 'expressTat', 'airlineTat', 'surfaceTat', 'premiumTat'].forEach(k => { if (fields[k]) fields[k].value = ''; });
}

function lockLogisticsFields() {
    ['zone', 'oda', 'expressTat', 'airlineTat', 'surfaceTat', 'premiumTat'].forEach(k => {
        if (fields[k]) {
            fields[k].readOnly = true;
            fields[k].classList.add('bg-gray-50');
            fields[k].classList.remove('bg-white');
        }
    });
}

function unlockLogisticsFields() {
    ['zone', 'oda', 'expressTat', 'airlineTat', 'surfaceTat', 'premiumTat'].forEach(k => {
        if (fields[k]) {
            fields[k].readOnly = false;
            fields[k].classList.remove('bg-gray-50');
            fields[k].classList.add('bg-white');
        }
    });
}

async function lookupPincode(pincode) {
    if (!pinStatus) return;
    pinStatus.textContent = '…';

    const result = await searchPin(pincode);
    if (result && result.found) {
        if (fields.city) fields.city.value             = result.CITY || '';
        if (fields.state) fields.state.value           = result.STATE || '';
        if (fields.stateCode) fields.stateCode.value   = result.STATE_CODE || '';
        if (fields.gstCode) fields.gstCode.value       = result.GST_CODE || '';
        if (fields.zone) fields.zone.value             = result.ZONE || '';
        if (fields.oda) fields.oda.value               = result.ODA || '';
        if (fields.expressTat) fields.expressTat.value = result.EXPRESS_TAT !== 'N' ? (result.EXPRESS_TAT || '') : '';
        if (fields.airlineTat) fields.airlineTat.value = result.AIRLINE_TAT !== 'N' ? (result.AIRLINE_TAT || '') : '';
        if (fields.surfaceTat) fields.surfaceTat.value = result.SURFACE_TAT !== 'N' ? (result.SURFACE_TAT || '') : '';
        if (fields.premiumTat) fields.premiumTat.value = result.PREMIUM_TAT !== 'N' ? (result.PREMIUM_TAT || '') : '';
        
        // if from API fallback, ZONE/TAT will be null — unlock for manual entry
        if (result.ZONE === null) {
            unlockLogisticsFields();
            pinStatus.innerHTML = '<span class="text-yellow-500" title="City/State filled. Zone, ODA and TAT must be entered manually.">⚠</span>';
        } else {
            lockLogisticsFields();
            pinStatus.innerHTML = '<span class="text-green-500">✔</span>';
        }
        return;
    }

    // not found anywhere
    clearDerivedFields();
    lockLogisticsFields();
    if (pinStatus) pinStatus.innerHTML = '<span class="text-red-500">✖</span>';
}

// --- CARRIER DATALIST ---

function populateCarrierList(carriers) {
    if (!carrierDL) return;
    carrierDL.innerHTML = '';
    Object.values(carriers || {}).forEach(c => {
        if (!c.COMPANY_CODE) return;
        const opt = document.createElement('option');
        opt.value = c.COMPANY_CODE;
        carrierDL.appendChild(opt);
    });
}

// --- OPEN / CLOSE ---

export function openAddContactModal(type, inputEl, displayEl, editContact = null) {
    const ctx = window.bookOrderCtx;
    if (!ctx) return;

    addContactType = type;
    editingUid = editContact ? (editContact.UID || null) : null;

    form.reset();
    clearDerivedFields();
    lockLogisticsFields();
    if (pinStatus) pinStatus.textContent = '';
    errorEl.textContent = '';
    errorEl.classList.add('hidden');

    const customerCode = editContact?.CODE || ctx.selectedCustomerDetails?.CODE || '';
    const customerBranch = editContact?.BRANCH || ctx.selectedCustomerDetails?.BRANCH || '';

    fields.branch.value = customerBranch;
    fields.code.value   = customerCode;

    populateCarrierList(ctx.appData?.CARRIERS);

    if (editContact) {
        titleEl.textContent = `Edit Contact: ${editContact.NAME || ''} (${editContact.UID || ''})`;
        if (saveBtn) saveBtn.childNodes[0].textContent = 'Update Contact ';

        fields.name.value    = editContact.NAME || '';
        
        // Handle leading 91 dynamically: extract bare 10 digits for the input
        let rawMobile = String(editContact.MOBILE || '').replace(/\D/g, '');
        if (rawMobile.length === 12 && rawMobile.startsWith('91')) {
            rawMobile = rawMobile.slice(2);
        }
        fields.mobile.value  = rawMobile.slice(0, 10);

        fields.pincode.value = editContact.PINCODE || '';
        fields.address.value = editContact.ADDRESS || '';
        fields.email.value   = editContact.EMAIL || '';
        fields.gst.value     = editContact.GSTIN || '';
        fields.pan.value     = editContact.PAN || '';
        fields.aadhaar.value = editContact.AADHAAR || '';
        fields.carrier.value = editContact.CARRIER || '';
        fields.city.value    = editContact.CITY || '';
        fields.state.value   = editContact.STATE || '';
        fields.stateCode.value = editContact.CODE_STATE || '';
        fields.gstCode.value   = editContact.GST_CODE || '';
        fields.zone.value      = editContact.ZONE || '';
        fields.oda.value       = editContact.ODA || '';
        fields.expressTat.value = editContact.EXPRESS_TAT || '';
        fields.airlineTat.value = editContact.AIRLINE_TAT || '';
        fields.surfaceTat.value = editContact.SURFACE_TAT || '';
        fields.premiumTat.value = editContact.PREMIUM_TAT || '';

        // Lock non-editable fields per API definition (NAME, PINCODE, GSTIN, PAN, AADHAAR, LOGISTICS)
        ['name', 'pincode', 'gst', 'pan', 'aadhaar'].forEach(k => {
            if (fields[k]) {
                fields[k].readOnly = true;
                fields[k].classList.add('bg-gray-100', 'cursor-not-allowed');
                fields[k].classList.remove('bg-white');
            }
        });
        lockLogisticsFields();

        // Enable editable fields (MOBILE, ADDRESS, EMAIL, CARRIER)
        ['mobile', 'address', 'email', 'carrier'].forEach(k => {
            if (fields[k]) {
                fields[k].readOnly = false;
                fields[k].classList.remove('bg-gray-100', 'cursor-not-allowed');
                fields[k].classList.add('bg-white');
            }
        });
    } else {
        titleEl.textContent = `Add Contact for ${customerCode}`;
        if (saveBtn) saveBtn.childNodes[0].textContent = 'Save ';

        // Unlock all primary fields for new entry
        ['name', 'mobile', 'pincode', 'address', 'email', 'gst', 'pan', 'aadhaar', 'carrier'].forEach(k => {
            if (fields[k]) {
                fields[k].readOnly = false;
                fields[k].classList.remove('bg-gray-100', 'cursor-not-allowed');
                fields[k].classList.add('bg-white');
            }
        });
        lockLogisticsFields();
    }

    modal._inputEl   = inputEl;
    modal._displayEl = displayEl;
    modal.classList.remove('hidden');
    
    if (editContact) {
        fields.mobile.focus();
    } else {
        fields.name.focus();
    }
}

export function openEditContactModal(contact, type, inputEl, displayEl) {
    openAddContactModal(type, inputEl, displayEl, contact);
}

// Attach globally for convenience
window.openAddContactModal = openAddContactModal;
window.openEditContactModal = openEditContactModal;

function closeModal() {
    modal.classList.add('hidden');
    addContactType = null;
    editingUid = null;
}

// --- EVENT LISTENERS ---

if (fields.pincode) {
    fields.pincode.addEventListener('input', async () => {
        // Only run lookup if not in edit mode
        if (editingUid) return;
        const val = fields.pincode.value.trim();
        if (val.length === 6 && /^\d{6}$/.test(val)) {
            await lookupPincode(val);
        } else {
            clearDerivedFields();
            lockLogisticsFields();
            if (pinStatus) pinStatus.textContent = '';
        }
    });
}

if (fields.mobile) {
    fields.mobile.addEventListener('input', () => {
        fields.mobile.value = fields.mobile.value.replace(/\D/g, '').slice(0, 10);
    });
}

if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
if (overlay) overlay.addEventListener('click', closeModal);

if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        errorEl.classList.add('hidden');

        const name    = fields.name.value.trim();
        const mobile  = fields.mobile.value.trim();
        const address = fields.address.value.trim();
        const pincode = fields.pincode.value.trim();
        const zone    = fields.zone.value.trim();

        if (!mobile || !address) {
            errorEl.textContent = 'Mobile and Address are required.';
            errorEl.classList.remove('hidden');
            return;
        }
        if (mobile.length !== 10) {
            errorEl.textContent = 'Mobile number must be exactly 10 digits.';
            errorEl.classList.remove('hidden');
            return;
        }

        if (!editingUid) {
            if (!name || !pincode) {
                errorEl.textContent = 'Name and Pincode are required.';
                errorEl.classList.remove('hidden');
                return;
            }
            if (!fields.city.value) {
                errorEl.textContent = 'Pincode not resolved — enter a valid pincode.';
                errorEl.classList.remove('hidden');
                return;
            }
            if (!zone) {
                errorEl.textContent = 'Zone is required. Enter it manually if not auto-filled.';
                errorEl.classList.remove('hidden');
                return;
            }
        }

        let payload;
        if (editingUid) {
            payload = {
                MOBILE:  '91' + mobile,
                ADDRESS: address,
                EMAIL:   fields.email.value.trim() || null,
                CARRIER: fields.carrier.value.trim() || null,
            };
        } else {
            payload = {
                NAME:        name,
                MOBILE:      '91' + mobile,
                ADDRESS:     address,
                PINCODE:     pincode,
                EMAIL:       fields.email.value.trim() || null,
                GSTIN:       fields.gst.value.trim().toUpperCase() || null,
                PAN:         fields.pan.value.trim().toUpperCase() || null,
                AADHAAR:     fields.aadhaar.value.trim() || null,
                CARRIER:     fields.carrier.value.trim() || null,
                BRANCH:      fields.branch.value,
                CODE:        fields.code.value,
                CITY:        fields.city.value,
                STATE:       fields.state.value,
                CODE_STATE:  fields.stateCode.value,
                GST_CODE:    fields.gstCode.value,
                ZONE:        zone,
                ODA:         fields.oda.value.trim() || null,
                EXPRESS_TAT: fields.expressTat.value,
                AIRLINE_TAT: fields.airlineTat.value,
                SURFACE_TAT: fields.surfaceTat.value,
                PREMIUM_TAT: fields.premiumTat.value,
            };
        }

        saveBtn.disabled = true;
        if (spinner) spinner.classList.remove('hidden');

        try {
            let result;
            if (editingUid) {
                result = await b2b2cUpdate(editingUid, payload);   // OTP auto-asked inside callApi
            } else {
                result = await b2b2cCreate(payload);
            }
            const record = result.record || { ...payload, UID: editingUid || result.uid };
            const uid = editingUid || result.uid || record.UID;

            const ctx = window.bookOrderCtx;
            if (ctx && ctx.appData && ctx.appData.B2B2C) {
                ctx.appData.B2B2C[uid] = { ...(ctx.appData.B2B2C[uid] || {}), ...record };
            }

            const inputEl   = modal._inputEl;
            const displayEl = modal._displayEl;
            if (inputEl) inputEl.value = record.NAME;
            if (ctx && ctx.displayContactDetails && displayEl) {
                ctx.displayContactDetails(record, displayEl);
            }
            if (ctx && ctx.selectedContacts && addContactType) {
                ctx.selectedContacts[addContactType] = record;
            }

            if (ctx) {
                if (addContactType === 'sender') {
                    if (ctx.originPincodeInput) ctx.originPincodeInput.value = record.PINCODE || '';
                } else if (addContactType === 'receiver') {
                    if (ctx.destPincodeInput) ctx.destPincodeInput.value = record.PINCODE || '';
                    if (ctx.carrierSelect) ctx.carrierSelect.value    = record.CARRIER || '';
                    if (ctx.populateModeDropdown) ctx.populateModeDropdown(record.ZONE);
                }

                if (ctx.revalidateMode) ctx.revalidateMode();
                if (ctx.updateDisplayTables) ctx.updateDisplayTables();
                if (ctx.checkMainDetailsAndToggleInputs) ctx.checkMainDetailsAndToggleInputs();
            }

            closeModal();

        } catch (err) {
            if (err.message === 'OTP action cancelled') { closeModal(); return; }
            errorEl.textContent = err.message || 'Failed to save contact.';
            errorEl.classList.remove('hidden');
        } finally {
            saveBtn.disabled = false;
            if (spinner) spinner.classList.add('hidden');
        }
    });
}

