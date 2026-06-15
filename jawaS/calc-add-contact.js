// jawaS/book-order-add-contact.js
// Inline Add Contact modal for BookOrder.html
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
    pinStatus.textContent = '…';

    const result = await searchPin(pincode);
    if (result.found) {
        fields.city.value       = result.CITY;
        fields.state.value      = result.STATE;
        fields.stateCode.value  = result.STATE_CODE  || '';
        fields.gstCode.value    = result.GST_CODE    || '';
        fields.zone.value       = result.ZONE        || '';
        fields.oda.value        = result.ODA         || '';
        fields.expressTat.value = result.EXPRESS_TAT !== 'N' ? (result.EXPRESS_TAT || '') : '';
        fields.airlineTat.value = result.AIRLINE_TAT !== 'N' ? (result.AIRLINE_TAT || '') : '';
        fields.surfaceTat.value = result.SURFACE_TAT !== 'N' ? (result.SURFACE_TAT || '') : '';
        fields.premiumTat.value = result.PREMIUM_TAT !== 'N' ? (result.PREMIUM_TAT || '') : '';
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
    pinStatus.innerHTML = '<span class="text-red-500">✖</span>';
}

// --- CARRIER DATALIST ---

function populateCarrierList(carriers) {
    carrierDL.innerHTML = '';
    Object.values(carriers || {}).forEach(c => {
        if (!c.COMPANY_CODE) return;
        const opt = document.createElement('option');
        opt.value = c.COMPANY_CODE;
        carrierDL.appendChild(opt);
    });
}

// --- OPEN / CLOSE ---

export function openAddContactModal(type, inputEl, displayEl) {
    const ctx = window.bookOrderCtx;
    if (!ctx) return;

    addContactType = type;

    form.reset();
    clearDerivedFields();
    lockLogisticsFields();
    pinStatus.textContent = '';
    errorEl.textContent = '';
    errorEl.classList.add('hidden');

    fields.branch.value = ctx.selectedCustomerDetails.BRANCH || '';
    fields.code.value   = ctx.selectedCustomerDetails.CODE   || '';

    titleEl.textContent = `Add Contact for ${ctx.selectedCustomerDetails.CODE || ''}`;

    populateCarrierList(ctx.appData.CARRIERS);

    modal._inputEl   = inputEl;
    modal._displayEl = displayEl;
    modal.classList.remove('hidden');
    fields.name.focus();
}

function closeModal() {
    modal.classList.add('hidden');
    addContactType = null;
}

// --- EVENT LISTENERS ---

fields.pincode.addEventListener('input', async () => {
    const val = fields.pincode.value.trim();
    if (val.length === 6 && /^\d{6}$/.test(val)) {
        await lookupPincode(val);
    } else {
        clearDerivedFields();
        lockLogisticsFields();
        pinStatus.textContent = '';
    }
});

cancelBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', closeModal);

saveBtn.addEventListener('click', async () => {
    errorEl.classList.add('hidden');

    const name    = fields.name.value.trim();
    const mobile  = fields.mobile.value.trim();
    const address = fields.address.value.trim();
    const pincode = fields.pincode.value.trim();
    const zone    = fields.zone.value.trim();

    if (!name || !mobile || !address || !pincode) {
        errorEl.textContent = 'Name, Mobile, Address and Pincode are required.';
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

    const payload = {
        NAME:        name,
        MOBILE:      mobile,
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

    saveBtn.disabled = true;
    spinner.classList.remove('hidden');

    try {
        const result = await b2b2cCreate(payload);
        const { record, uid } = result;

        const ctx = window.bookOrderCtx;
        ctx.appData.B2B2C[uid] = record;

        const inputEl   = modal._inputEl;
        const displayEl = modal._displayEl;
        inputEl.value = record.NAME;
        ctx.displayContactDetails(record, displayEl);
        ctx.selectedContacts[addContactType] = record;

        if (addContactType === 'sender') {
            ctx.originPincodeInput.value = record.PINCODE || '';
        } else {
            ctx.destPincodeInput.value = record.PINCODE || '';
            ctx.carrierSelect.value    = record.CARRIER || '';
            ctx.populateModeDropdown(record.ZONE);
        }

        ctx.revalidateMode();
        ctx.updateDisplayTables();
        ctx.checkMainDetailsAndToggleInputs();

        closeModal();


    } catch (err) {
        errorEl.textContent = err.message || 'Failed to save contact.';
        errorEl.classList.remove('hidden');
    } finally {
        saveBtn.disabled = false;
        spinner.classList.add('hidden');
    }
});
