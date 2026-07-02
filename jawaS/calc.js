// ============================================================================
// jawaS/calc.js — Calculator page logic (pincode-based rate calculator)
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    const originPincodeInput = document.getElementById('origin_pincode');
    const destPincodeInput = document.getElementById('dest_pincode');
    const originDetailsDisplay = document.getElementById('originDetailsDisplay');
    const destDetailsDisplay = document.getElementById('destDetailsDisplay');
    const actualWeightInput = document.getElementById('actual_weight');
    const lengthInput = document.getElementById('length');
    const breadthInput = document.getElementById('breadth');
    const heightInput = document.getElementById('height');
    const multiboxTableBody = document.getElementById('multiboxTableBody');
    const clearMultiboxButton = document.getElementById('clearMultiboxButton');
    const multiboxErrorMessage = document.getElementById('multiboxErrorMessage');
    const modeChangeMessage = document.getElementById('modeChangeMessage');
    const productTableBody = document.getElementById('productTableBody');
    const productNameInput = document.getElementById('product_name');
    const docNoInput = document.getElementById('doc_no');
    const ewayBillInput = document.getElementById('eway_bill');
    const productTypeSelect = document.getElementById('product_type');
    const amountInput = document.getElementById('amount');
    const ewayStatusMessage = document.getElementById('ewayStatusMessage');
    const clearProductsButton = document.getElementById('clearProductsButton');
    const clearAllButton = document.getElementById('clearAllButton');
    const calcButton = document.getElementById('calc_button');
    const cancelButton = document.getElementById('cancel_button');
    const customerNameSelect = document.getElementById('customer_name');
    const transportTypeSelect = document.getElementById('transport_type');
    const carrierSelect = document.getElementById('carrier_select');
    const calcMessage = document.getElementById('calcMessage');

    let appData = {};
    let consignmentBoxes = [];
    let consignmentProducts = [];
    let selectedCustomerDetails = {};
    let summaryTotals = { totalWgt: 0, totalChgWt: 0, boxCount: 0, totalAmount: 0 };

    // Pincode data cache — stores looked-up zone/TAT/city info
    let pincodeCache = {};
    let pincodeData = { origin: null, dest: null };

    // --- PINCODE LOOKUP ---
    async function lookupPincode(pincode) {
        if (!pincode || pincode.length !== 6 || !window.searchPin) return null;
        if (pincodeCache[pincode]) return pincodeCache[pincode];
        try {
            const result = await window.searchPin(pincode);
            if (result && result.found) {
                pincodeCache[pincode] = result;
                return result;
            }
        } catch(e) { console.warn('Pincode lookup failed:', e); }
        return null;
    }

    function updatePincodeDisplay(type, data) {
        const el = type === 'origin' ? originDetailsDisplay : destDetailsDisplay;
        if (!data) {
            el.innerHTML = `<span class="italic text-gray-500">Enter pincode to auto-fill ${type === 'origin' ? 'city' : 'city & zone'}.</span>`;
            return;
        }
        const parts = [];
        if (data.CITY) parts.push(data.CITY);
        if (data.STATE) parts.push(data.STATE);
        if (data.ZONE) parts.push(`Zone: ${data.ZONE}`);
        if (data.ODA) parts.push(`ODA: ${data.ODA}`);
        el.innerHTML = parts.length ? `<span class="text-gray-700 font-medium">${parts.join(' · ')}</span>`
                                    : `<span class="italic text-gray-500">City not found for this pincode.</span>`;
    }

    // --- PINCODE INPUT HANDLERS ---
    let pincodeTimers = { origin: null, dest: null };

    async function handlePincodeInput(type) {
        const input = type === 'origin' ? originPincodeInput : destPincodeInput;
        const val = input.value.trim();
        if (val.length === 6 && /^\d{6}$/.test(val)) {
            const data = await lookupPincode(val);
            pincodeData[type] = data;
            updatePincodeDisplay(type, data);
            if (type === 'dest') {
                // Re-populate mode dropdown based on dest zone
                populateModeDropdown(data?.ZONE || null);
                // Also trigger revalidation
                revalidateZone();
            }
            updateDisplayTables();
            updateSummaryDisplay();
        } else {
            pincodeData[type] = null;
            updatePincodeDisplay(type, null);
            if (type === 'dest') {
                populateModeDropdown(null);
                updateDisplayTables();
                updateSummaryDisplay();
            }
        }
    }

    originPincodeInput.addEventListener('input', () => {
        clearTimeout(pincodeTimers.origin);
        pincodeTimers.origin = setTimeout(() => handlePincodeInput('origin'), 400);
    });
    destPincodeInput.addEventListener('input', () => {
        clearTimeout(pincodeTimers.dest);
        pincodeTimers.dest = setTimeout(() => handlePincodeInput('dest'), 400);
    });

    function revalidateZone() {
        const zone = pincodeData.dest?.ZONE;
        if (zone && appData.MODES) {
            const currentMode = transportTypeSelect.value;
            if (currentMode) {
                const modeData = appData.MODES[currentMode];
                if (modeData && modeData[zone] === 'N') {
                    const surfaceOption = Object.values(appData.MODES).find(m => m.MODE.toUpperCase() === 'SURFACE');
                    if (surfaceOption) {
                        transportTypeSelect.value = surfaceOption.SHORT;
                        modeChangeMessage.textContent = `Mode not available for ${zone}. Switched to Surface.`;
                    }
                } else {
                    modeChangeMessage.textContent = '';
                }
            }
        }
        updateDisplayTables();
    }

    // --- DROPDOWN POPULATION ---
    function updateAllDropdowns() {
        const selectedCustomer = customerNameSelect.value;
        const selectedCarrier = carrierSelect.value;
        const selectedMode = transportTypeSelect.value;
        populateCustomerDropdown();
        populateCarrierDropdown();
        populateModeDropdown(pincodeData.dest?.ZONE || null);
        customerNameSelect.value = selectedCustomer;
        carrierSelect.value = selectedCarrier;
        transportTypeSelect.value = selectedMode;
    }

    function populateCustomerDropdown() {
        customerNameSelect.innerHTML = '<option value="">Select Customer</option>';
        if (appData.B2B) {
            Object.values(appData.B2B).forEach(client => {
                const option = document.createElement('option');
                option.value = client.CODE;
                option.textContent = client.B2B_NAME;
                customerNameSelect.appendChild(option);
            });
        }
    }

    function populateModeDropdown(zone) {
        transportTypeSelect.innerHTML = '<option value="">Select Mode</option>';
        if (appData.MODES) {
            Object.values(appData.MODES).forEach(mode => {
                const isAvailableForZone = !zone || mode[zone] === 'Y';
                const option = document.createElement('option');
                option.value = mode.SHORT;
                option.textContent = mode.MODE;
                option.dataset.volIngr = mode.VOL_INGR;
                option.dataset.minWt = mode.MIN_WT;
                option.disabled = !isAvailableForZone;
                transportTypeSelect.appendChild(option);
            });
        }
    }

    function populateCarrierDropdown() {
        carrierSelect.innerHTML = '<option value="">Select Carrier</option>';
        if (appData.CARRIERS) {
            Object.values(appData.CARRIERS).forEach(carrier => {
                const option = document.createElement('option');
                option.value = carrier.COMPANY_CODE;
                option.textContent = carrier.COMPANY_CODE;
                carrierSelect.appendChild(option);
            });
        }
    }

    // --- APP INIT ---
    function initializeAppLogic(eventDetail) {
        if (!eventDetail || !eventDetail.data) {
            calcMessage.textContent = 'Application data could not be loaded.';
            calcMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-red-700 bg-red-100';
            return;
        }
        appData = eventDetail.data;
        updateAllDropdowns();
        updateDisplayTables();
        updateSummaryDisplay();
    }

    function handleDataRefresh(eventDetail) {
        if (!eventDetail || !eventDetail.data) return;
        appData = eventDetail.data;
        updateAllDropdowns();
    }

    // --- DISPLAY UPDATES ---
    function updateDisplayTables() {
        document.getElementById('display_origin_pincode').textContent = originPincodeInput.value || '---';
        document.getElementById('display_origin_city').textContent = pincodeData.origin?.CITY || '---';
        document.getElementById('display_dest_pincode').textContent = destPincodeInput.value || '---';
        document.getElementById('display_dest_city').textContent = pincodeData.dest?.CITY || '---';
        document.getElementById('display_zone').textContent = pincodeData.dest?.ZONE || '---';
        document.getElementById('display_carrier').textContent = carrierSelect.value || '---';
        document.getElementById('display_mode').textContent = transportTypeSelect.value || '---';
        const selectedModeOption = transportTypeSelect.options[transportTypeSelect.selectedIndex];
        const selectedModeText = selectedModeOption ? selectedModeOption.text.toUpperCase().replace(/ /g, '_') : '';
        const tatColumnName = `${selectedModeText}_TAT`;
        document.getElementById('display_tat').textContent = (pincodeData.dest && pincodeData.dest[tatColumnName]) || '---';
        ['global', 'cod', 'topay', 'fov'].forEach(type => {
            document.getElementById(`display_${type}`).textContent = document.getElementById(`payment_${type}`).checked ? 'Yes' : 'No';
        });
        document.getElementById('display_code').textContent = selectedCustomerDetails.CODE || '---';
        document.getElementById('display_user_name').textContent = getUser().NAME || '---';
        document.getElementById('display_branch').textContent = selectedCustomerDetails.BRANCH || '---';
    }

    function updateSummaryDisplay() {
        const selectedModeOption = transportTypeSelect.options[transportTypeSelect.selectedIndex];
        const minWt = (selectedModeOption && selectedModeOption.dataset.minWt) ? parseFloat(selectedModeOption.dataset.minWt) : 0;
        const finalTotalChgWt = Math.max(summaryTotals.totalChgWt, minWt);
        document.getElementById('display_weight').textContent = summaryTotals.totalWgt ? summaryTotals.totalWgt.toFixed(2) : '---';
        document.getElementById('display_chg_wt').textContent = finalTotalChgWt ? finalTotalChgWt.toFixed(2) : '---';
        document.getElementById('display_pieces').textContent = summaryTotals.boxCount || '---';
        document.getElementById('display_value').textContent = summaryTotals.totalAmount ? `₹${summaryTotals.totalAmount.toFixed(2)}` : '---';
        updateHelperTable();
    }

    function updateHelperTable() {
        const helperData = getHelperTableData(
            parseFloat(document.getElementById('display_chg_wt').textContent) || 0,
            selectedCustomerDetails,
            transportTypeSelect.value,
            pincodeData.dest?.ZONE,
            appData.RATES
        );
        for (const key in helperData) {
            const element = document.getElementById(`display_${key}`);
            if (element) element.textContent = helperData[key];
        }
        updateAndDisplayCharges();
    }

    function updateAndDisplayCharges() {
        const frightVal = calculateFreight(
            transportTypeSelect.value,
            parseFloat(document.getElementById('display_rate').textContent),
            parseFloat(document.getElementById('display_add_rate').textContent),
            parseFloat(document.getElementById('display_weight_ceiling').textContent),
            parseFloat(document.getElementById('display_weight_zone').textContent)
        );
        const charges = calculateAllCharges(
            frightVal,
            summaryTotals,
            selectedCustomerDetails,
            {
                cod: document.getElementById('payment_cod'),
                topay: document.getElementById('payment_topay'),
                fov: document.getElementById('payment_fov')
            },
            consignmentProducts,
            parseFloat(document.getElementById('display_chg_wt').textContent) || 0,
            appData.BRANCHES
        );
        // Set all charge values and dynamically show/hide their rows
        for (const key in charges) {
            const element = document.getElementById(`display_${key}`);
            if (element) {
                element.textContent = charges[key];
                // Show/hide the parent row if it has a data-charge attribute
                const row = element.closest('tr');
                if (row && row.dataset.charge === key) {
                    const value = parseFloat(charges[key]);
                    row.classList.toggle('hidden', !value || value === 0);
                }
            }
        }
    }

    // --- MULTIBOX ---
    // --- PAYMENT MODE LOCK ---
    function togglePaymentModeLock() {
        const hasBoxes = consignmentBoxes.length > 0;
        // Lock Dox, ToPay, COD, FOV when boxes exist — Pcs stays unlocked
        ['payment_global', 'payment_topay', 'payment_cod', 'payment_fov'].forEach(id => {
            document.getElementById(id).disabled = hasBoxes;
        });
    }

    function renderMultiboxTable() {
        multiboxTableBody.innerHTML = '';
        let totalWgt = 0, totalVolWt = 0, calculatedTotalChgWt = 0;
        consignmentBoxes.forEach(box => {
            const row = document.createElement('tr');
            row.classList.add('hover:bg-gray-50');
            row.innerHTML = `
                <td class="p-2 border border-gray-400">${box.boxNum}</td>
                <td class="p-2 border border-gray-400">${box.actualWeight}</td>
                <td class="p-2 border border-gray-400">${box.length}</td>
                <td class="p-2 border border-gray-400">${box.breadth}</td>
                <td class="p-2 border border-gray-400">${box.height}</td>
                <td class="p-2 border border-gray-400">${box.volWeight.toFixed(2)}</td>
                <td class="p-2 border border-gray-400">${box.chargeWeight.toFixed(2)}</td>
            `;
            multiboxTableBody.appendChild(row);
            totalWgt += box.actualWeight;
            totalVolWt += box.volWeight;
            calculatedTotalChgWt += box.chargeWeight;
        });
        summaryTotals.totalWgt = totalWgt;
        summaryTotals.totalChgWt = calculatedTotalChgWt;
        summaryTotals.boxCount = consignmentBoxes.length;
        togglePaymentModeLock();
        updateSummaryDisplay();
    }

    function addMultiboxEntry() {
        const actualWeight = parseFloat(actualWeightInput.value);
        const length = parseFloat(lengthInput.value);
        const breadth = parseFloat(breadthInput.value);
        const height = parseFloat(heightInput.value);
        const pcsInput = document.getElementById('pcs_count');
        const pcs = (pcsInput && pcsInput.style.display !== 'none' && parseInt(pcsInput.value) > 0) ? parseInt(pcsInput.value) : 1;
        const selectedModeOption = transportTypeSelect.options[transportTypeSelect.selectedIndex];
        const volIngr = selectedModeOption ? parseFloat(selectedModeOption.dataset.volIngr) : 5000;
        multiboxErrorMessage.textContent = '';
        if (!actualWeight || !length || !breadth || !height) {
            multiboxErrorMessage.textContent = 'Please fill all Wgt, L, B, and H fields to add a box.';
            return;
        }
        const newBoxes = Array.from({ length: pcs }, () => ({ actualWeight, length, breadth, height }));
        consignmentBoxes = recalculateAllBoxWeights([...consignmentBoxes, ...newBoxes], volIngr);
        consignmentBoxes.forEach((box, index) => box.boxNum = index + 1);
        renderMultiboxTable();
        actualWeightInput.value = '';
        lengthInput.value = '';
        breadthInput.value = '';
        heightInput.value = '';
        if (pcsInput) pcsInput.value = '';
    }

    // --- PRODUCTS ---
    function renderProductTable() {
        productTableBody.innerHTML = '';
        let totalAmount = 0;
        consignmentProducts.forEach((product, index) => {
            const row = document.createElement('tr');
            row.classList.add('hover:bg-gray-50');
            row.innerHTML = `
                <td class="p-2 border border-gray-400">${index + 1}</td>
                <td class="p-2 border border-gray-400">${product.name}</td>
                <td class="p-2 border border-gray-400">${product.docNo}</td>
                <td class="p-2 border border-gray-400">${product.ewayBill}</td>
                <td class="p-2 border border-gray-400">${product.type}</td>
                <td class="p-2 border border-gray-400">₹${product.amount.toFixed(2)}</td>
            `;
            productTableBody.appendChild(row);
            totalAmount += product.amount;
        });
        summaryTotals.totalAmount = totalAmount;
        updateSummaryDisplay();
        updateAndDisplayCharges();
    }

    function addProductEntry() {
        const productName = productNameInput.value.trim();
        const docNo = docNoInput.value.trim();
        const ewayBill = ewayBillInput.value.trim();
        const productType = productTypeSelect.value;
        const amount = parseFloat(amountInput.value);
        ewayStatusMessage.textContent = '';
        if (!productName || !docNo || !amountInput.value) {
            ewayStatusMessage.textContent = 'Product, DocNo and Amount fields are required.';
            return;
        }
        if (ewayBill && !/^\d{12}$/.test(ewayBill)) {
            ewayStatusMessage.textContent = 'EWay bill must be a 12-digit numeric number.';
            return;
        }
        consignmentProducts.push({ name: productName, docNo, ewayBill, type: productType, amount: amount || 0 });
        renderProductTable();
        productNameInput.value = '';
        docNoInput.value = '';
        ewayBillInput.value = '';
        amountInput.value = '';
        productTypeSelect.value = 'INV';
    }

    // --- CUSTOMER ---
    function handleCustomerSelectionChange() {
        const selectedCustomerCode = customerNameSelect.value;
        selectedCustomerDetails = appData.B2B?.[selectedCustomerCode] || {};
        updateDisplayTables();
    }
    customerNameSelect.addEventListener('change', handleCustomerSelectionChange);

    // --- RESET ---
    function resetFullForm() {
        consignmentBoxes = [];
        consignmentProducts = [];
        renderMultiboxTable();
        renderProductTable();
        pincodeData = { origin: null, dest: null };
        originPincodeInput.value = '';
        destPincodeInput.value = '';
        originDetailsDisplay.innerHTML = '<span class="italic text-gray-500">Enter pincode to auto-fill city.</span>';
        destDetailsDisplay.innerHTML = '<span class="italic text-gray-500">Enter pincode to auto-fill city & zone.</span>';
        ['payment_global', 'payment_pcs', 'payment_topay', 'payment_cod', 'payment_fov'].forEach(id => document.getElementById(id).checked = false);
        transportTypeSelect.value = '';
        carrierSelect.value = '';
        customerNameSelect.value = '';
        selectedCustomerDetails = {};
        calcMessage.textContent = '';
        calcMessage.className = 'p-2 text-sm text-center rounded-md mt-2';
        updateDisplayTables();
        updateAndDisplayCharges();
    }

    cancelButton.addEventListener('click', resetFullForm);

    // --- CALCULATE / RECALCULATE ---
    calcButton.addEventListener('click', () => {
        if (!destPincodeInput.value || destPincodeInput.value.length !== 6) {
            calcMessage.textContent = 'Please enter a valid destination pincode first.';
            calcMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-red-700 bg-red-100';
            return;
        }
        if (!pincodeData.dest) {
            calcMessage.textContent = 'Pincode not resolved. Please wait for lookup to complete.';
            calcMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-yellow-700 bg-yellow-100';
            return;
        }
        updateDisplayTables();
        updateHelperTable();
        calcMessage.textContent = 'Calculation refreshed ✓';
        calcMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-green-700 bg-green-100';
        setTimeout(() => { calcMessage.textContent = ''; calcMessage.className = 'p-2 text-sm text-center rounded-md mt-2'; }, 4000);
    });

    // --- INIT (single source: appDataLoaded event) ---
    window.addEventListener('appDataLoaded', (e) => initializeAppLogic(e.detail));
    window.addEventListener('appDataRefreshed', (e) => handleDataRefresh(e.detail));

    // --- EVENT LISTENERS ---
    transportTypeSelect.addEventListener('change', () => {
        consignmentBoxes = recalculateAllBoxWeights(consignmentBoxes, parseFloat(transportTypeSelect.options[transportTypeSelect.selectedIndex].dataset.volIngr));
        renderMultiboxTable();
    });

    carrierSelect.addEventListener('change', () => {
        updateDisplayTables();
    });

    ['payment_global', 'payment_topay', 'payment_cod', 'payment_fov'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            updateDisplayTables();
            updateAndDisplayCharges();
        });
    });

    // Enter key navigation for dimensions
    actualWeightInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lengthInput.focus(); } });
    lengthInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); breadthInput.focus(); } });
    breadthInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); heightInput.focus(); } });
    heightInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); addMultiboxEntry(); actualWeightInput.focus(); } });
    productNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); docNoInput.focus(); } });
    docNoInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ewayBillInput.focus(); } });
    ewayBillInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); amountInput.focus(); } });
    amountInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); addProductEntry(); productNameInput.focus(); } });

    document.getElementById('addBoxButton')?.addEventListener('click', () => { addMultiboxEntry(); actualWeightInput.focus(); });
    document.getElementById('addProductButton')?.addEventListener('click', () => { addProductEntry(); productNameInput.focus(); });

    clearMultiboxButton.addEventListener('click', () => {
        consignmentBoxes.pop();
        renderMultiboxTable();
    });
    clearMultiboxButton.addEventListener('dblclick', () => {
        consignmentBoxes = [];
        renderMultiboxTable();
    });
    clearProductsButton.addEventListener('click', () => {
        consignmentProducts.pop();
        renderProductTable();
    });
    clearProductsButton.addEventListener('dblclick', () => {
        consignmentProducts = [];
        renderProductTable();
    });
    clearAllButton.addEventListener('click', () => {
        consignmentBoxes = [];
        consignmentProducts = [];
        renderMultiboxTable();
        renderProductTable();
    });

    // ---- expose for mobile popup bridge ----
    window._addMultiboxEntry = addMultiboxEntry;
    window._addProductEntry = addProductEntry;
    window._doxRenderEntry = function(wgt, l, b, h, type) {
        const selectedModeOption = transportTypeSelect.options[transportTypeSelect.selectedIndex];
        const volIngr = parseFloat(selectedModeOption?.dataset.volIngr) || 5000;
        consignmentBoxes = recalculateAllBoxWeights([{ actualWeight: wgt, length: l, breadth: b, height: h }], volIngr);
        consignmentBoxes[0].boxNum = 1;
        consignmentProducts = [{ name: 'Documents/Papers', docNo: type, ewayBill: '', type: 'DOX', amount: 100 }];
        renderMultiboxTable();
        renderProductTable();
    };

    // Initial setup
    updateDisplayTables();
    updateSummaryDisplay();
});

// Mobile popup bridge functions
window.mobileAddBox = function() {
    const isDox = document.getElementById('payment_global')?.checked;
    if (isDox) {
        const DOX_SIZES = { DL: { l:22, b:11 }, A4: { l:32, b:25 }, BG: { l:40, b:30 } };
        const wgt = parseFloat(document.getElementById('m_dox_weight').value);
        const type = ['DL','A4','BG'].find(t => document.getElementById('m_dox_' + t.toLowerCase())?.checked);
        const errEl = document.getElementById('mobileBoxError');
        if (!wgt || wgt <= 0 || !type) { errEl.textContent = 'Enter weight and select envelope type.'; errEl.classList.remove('hidden'); return; }
        if (wgt > 2) { errEl.textContent = 'Dox weight cannot exceed 2 kg.'; errEl.classList.remove('hidden'); return; }
        errEl.classList.add('hidden');
        const h = wgt <= 0.1 ? 0.5 : wgt <= 0.5 ? 1 : wgt <= 1.0 ? 2 : 3;
        const size = DOX_SIZES[type];
        if (typeof window._doxRenderEntry === 'function') window._doxRenderEntry(wgt, size.l, size.b, h, type);
        document.getElementById('m_dox_weight').value = '';
        ['m_dox_dl','m_dox_a4','m_dox_bg'].forEach(id => document.getElementById(id).checked = false);
        document.getElementById('mobileBoxPopup').classList.add('hidden');
        return;
    }
    document.getElementById('actual_weight').value = document.getElementById('m_actual_weight').value;
    document.getElementById('length').value        = document.getElementById('m_length').value;
    document.getElementById('breadth').value       = document.getElementById('m_breadth').value;
    document.getElementById('height').value        = document.getElementById('m_height').value;
    const mPcs = document.getElementById('m_pcs_count');
    const dPcs = document.getElementById('pcs_count');
    if (mPcs && dPcs) dPcs.value = mPcs.value;
    if (typeof window._addMultiboxEntry === 'function') window._addMultiboxEntry();
    const err = document.getElementById('multiboxErrorMessage').textContent;
    if (err) {
        document.getElementById('mobileBoxError').textContent = err;
        document.getElementById('mobileBoxError').classList.remove('hidden');
        return;
    }
    ['m_actual_weight','m_length','m_breadth','m_height'].forEach(id => document.getElementById(id).value = '');
    if (document.getElementById('m_pcs_count')) document.getElementById('m_pcs_count').value = '';
    document.getElementById('mobileBoxError').classList.add('hidden');
};

window.mobileAddProduct = function() {
    document.getElementById('product_name').value  = document.getElementById('m_product_name').value;
    document.getElementById('doc_no').value        = document.getElementById('m_doc_no').value;
    document.getElementById('eway_bill').value     = document.getElementById('m_eway_bill').value;
    document.getElementById('product_type').value  = document.getElementById('m_product_type').value;
    document.getElementById('amount').value        = document.getElementById('m_amount').value;
    if (typeof window._addProductEntry === 'function') window._addProductEntry();
    const err = document.getElementById('ewayStatusMessage').textContent;
    if (err) {
        document.getElementById('mobileProdError').textContent = err;
        document.getElementById('mobileProdError').classList.remove('hidden');
        return;
    }
    ['m_product_name','m_doc_no','m_eway_bill','m_amount'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('m_product_type').value = 'INV';
    document.getElementById('mobileProdError').classList.add('hidden');
};
