// jawaS/book-order-add-contact.js
// Inline Add Contact modal for BookOrder.html
// Depends on: core/b2b2c-api.js, core/searchpinweb.js, utils/searchpin.js
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
    gst:        document.getElementById('ac_gst'),
    carrier:    document.getElementById('ac_carrier'),
    branch:     document.getElementById('ac_branch'),
    code:       document.getElementById('ac_code'),
    city:       document.getElementById('ac_city'),
    state:      document.getElementById('ac_state'),
    zone:       document.getElementById('ac_zone'),
    oda:        document.getElementById('ac_oda'),
    expressTat: document.getElementById('ac_express_tat'),
    airlineTat: document.getElementById('ac_airline_tat'),
    surfaceTat: document.getElementById('ac_surface_tat'),
    premiumTat: document.getElementById('ac_premium_tat'),
};

const LOGISTICS_FIELDS = ['zone', 'oda', 'expressTat', 'airlineTat', 'surfaceTat', 'premiumTat'];

let addContactType = null; // 'sender' | 'receiver'

// --- PINCODE HELPERS ---

function clearDerivedFields() {
    ['city', 'state', ...LOGISTICS_FIELDS].forEach(k => { fields[k].value = ''; });
}

function lockLogisticsFields() {
    LOGISTICS_FIELDS.forEach(k => {
        fields[k].readOnly = true;
        fields[k].classList.add('bg-gray-50');
        fields[k].classList.remove('bg-white');
    });
}

function unlockLogisticsFields() {
    LOGISTICS_FIELDS.forEach(k => {
        fields[k].readOnly = false;
        fields[k].classList.remove('bg-gray-50');
        fields[k].classList.add('bg-white');
    });
}

async function lookupPincode(pincode) {
    pinStatus.textContent = '…';

    // 1 — try local map
    const local = searchPin(pincode);
    if (local.found) {
        fields.city.value       = local.CITY;
        fields.state.value      = local.STATE;
        fields.zone.value       = local.ZONE;
        fields.oda.value        = local.ODA;
        fields.expressTat.value = local.EXPRESS_TAT !== 'N' ? local.EXPRESS_TAT : '';
        fields.airlineTat.value = local.AIRLINE_TAT !== 'N' ? local.AIRLINE_TAT : '';
        fields.surfaceTat.value = local.SURFACE_TAT !== 'N' ? local.SURFACE_TAT : '';
        fields.premiumTat.value = local.PREMIUM_TAT !== 'N' ? local.PREMIUM_TAT : '';
        lockLogisticsFields();
        pinStatus.innerHTML = '<span class="text-green-500">✔</span>';
        return;
    }

    // 2 — fallback to Post Office web API
    const web = await searchPinWeb(pincode);
    if (web.found) {
        fields.city.value  = web.CITY;
        fields.state.value = web.STATE;
        // logistics fields not available — clear and unlock for manual entry
        LOGISTICS_FIELDS.forEach(k => { fields[k].value = ''; });
        unlockLogisticsFields();
        pinStatus.innerHTML = '<span class="text-yellow-500" title="City/State filled. Zone, ODA and TAT must be entered manually.">⚠</span>';
        return;
    }

    // 3 — not found anywhere
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
        NAME:             name,
        MOBILE:           mobile,
        ADDRESS:          address,
        PINCODE:          pincode,
        EMAIL:            fields.email.value.trim(),
        GST_ID_PAN_ADHAR: fields.gst.value.trim(),
        CARRIER:          fields.carrier.value.trim(),
        BRANCH:           fields.branch.value,
        CODE:             fields.code.value,
        CITY:             fields.city.value,
        STATE:            fields.state.value,
        ZONE:             zone,
        ODA:              fields.oda.value.trim(),
        EXPRESS_TAT:      fields.expressTat.value,
        AIRLINE_TAT:      fields.airlineTat.value,
        SURFACE_TAT:      fields.surfaceTat.value,
        PREMIUM_TAT:      fields.premiumTat.value,
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
