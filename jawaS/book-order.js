// ============================================================================
// jawaS/book-order.js — BookOrder.html page logic
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    const timestampInput = document.getElementById('timestamp');
    const orderDateInput = document.getElementById('order_date');
    const senderNameInput = document.getElementById('sender_name');
    const senderDetailsDisplay = document.getElementById('senderDetailsDisplay');
    const senderAutocompleteResults = document.getElementById('sender_autocomplete_results');
    const receiverNameInput = document.getElementById('receiver_name');
    const receiverDetailsDisplay = document.getElementById('receiverDetailsDisplay');
    const receiverAutocompleteResults = document.getElementById('receiver_autocomplete_results');
    const originPincodeInput = document.getElementById('origin_pincode');
    const destPincodeInput = document.getElementById('dest_pincode');
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
    const bookButton = document.getElementById('book_button');
    const cancelButton = document.getElementById('cancel_button');
    const getAwbButton = document.getElementById('getAwbButton');
    const customerNameSelect = document.getElementById('customer_name');
    const transportTypeSelect = document.getElementById('transport_type');
    const carrierSelect = document.getElementById('carrier_select');
    const bookingMessage = document.getElementById('bookingMessage');
    const shipmentList = document.getElementById('shipmentList');
    const shipmentListContainer = document.getElementById('shipmentListContainer');

    let isBookingLocked = false;
    let currentCalcUid = null;
    let wasModeUnlocked = false;

    // --- ROLE ---
    const userRole  = getUser().ROLE || 'GUEST';
    const isClient  = (ROLE_LEVELS[userRole] || 0) < ROLE_LEVELS['STAFF'];
    const canDelete = (ROLE_LEVELS[userRole] || 0) >= ROLE_LEVELS['ADMIN'];
    let userMadeInitialModeChoice = false;
    let appData = {};
    let consignmentBoxes = [];
    let consignmentProducts = [];
    let selectedCustomerDetails = {};
    let selectedContacts = { sender: null, receiver: null };
    let summaryTotals = { totalWgt: 0, totalChgWt: 0, boxCount: 0, totalAmount: 0 };

    function initializeAppLogic(eventDetail) {
        if (!eventDetail || !eventDetail.data) {
            bookingMessage.textContent = 'Application data could not be loaded.';
            bookingMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-red-700 bg-red-100';
            return;
        }
        appData = eventDetail.data;
        updateAllDropdowns();
        setupAutocomplete(senderNameInput, senderAutocompleteResults, senderDetailsDisplay, 'sender');
        setupAutocomplete(receiverNameInput, receiverAutocompleteResults, receiverDetailsDisplay, 'receiver');
        if (customerNameSelect.options.length === 2) {
            customerNameSelect.selectedIndex = 1;
            handleCustomerSelectionChange();
        }
        fetchShipmentList();
        // Edit mode detection
        const editRef = sessionStorage.getItem('editOrderRef');
        if (editRef) prefillEditOrder(editRef);
    }

    function handleDataRefresh(eventDetail) {
        console.log('Booking Page: App data refreshed. Preserving selections.');
        if (!eventDetail || !eventDetail.data) return;
        appData = eventDetail.data;
        updateAllDropdowns();
        fetchShipmentList();
    }

    function updateAllDropdowns() {
        const selectedCustomer = customerNameSelect.value;
        const selectedCarrier = carrierSelect.value;
        const selectedMode = transportTypeSelect.value;
        populateCustomerDropdown();
        populateCarrierDropdown();
        populateModeDropdown(selectedContacts.receiver?.ZONE);
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

    function setBookingFieldsLocked(locked) {
        const fieldsToLock = [
            'order_date', 'sender_name', 'receiver_name',
            'transport_type', 'carrier_select', 'payment_global',
            'payment_topay', 'payment_cod', 'payment_fov'
        ];
        fieldsToLock.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                if (locked && id === 'carrier_select' && element.value === '') return;
                element.disabled = locked;
                element.classList.toggle('bg-gray-200', locked);
                element.classList.toggle('cursor-not-allowed', locked);
            }
        });
        isBookingLocked = locked;
    }

    function toggleWeightProductEntry(locked) {
        const fields = [
            actualWeightInput, lengthInput, breadthInput, heightInput,
            productNameInput, docNoInput, ewayBillInput, productTypeSelect, amountInput
        ];
        fields.forEach(field => {
            field.disabled = locked;
            field.classList.toggle('bg-gray-200', locked);
            field.classList.toggle('cursor-not-allowed', locked);
        });
    }

    function areMainDetailsComplete() {
        return customerNameSelect.value && selectedContacts.sender && selectedContacts.receiver && transportTypeSelect.value && carrierSelect.value;
    }

    function checkMainDetailsAndToggleInputs() {
        toggleWeightProductEntry(!areMainDetailsComplete());
    }

    function resetForNextBooking() {
        consignmentBoxes = [];
        consignmentProducts = [];
        ['receiver_name', 'awb', 'actual_weight', 'length', 'breadth', 'height', 'product_name', 'doc_no', 'eway_bill', 'amount'].forEach(id => document.getElementById(id).value = '');
        ['payment_global', 'payment_topay', 'payment_cod', 'payment_fov'].forEach(id => document.getElementById(id).checked = false);
        selectedContacts.receiver = null;
        receiverDetailsDisplay.innerHTML = `<span class="italic text-gray-500">Enter receiver details manually.</span>`;
        transportTypeSelect.value = '';
        carrierSelect.value = '';
        renderMultiboxTable();
        renderProductTable();
        setBookingFieldsLocked(false);
        toggleWeightProductEntry(true);
        updateDisplayTables();
        fetchShipmentList();
    }

    function resetFullForm() {
        consignmentBoxes = [];
        consignmentProducts = [];
        renderMultiboxTable();
        renderProductTable();
        setBookingFieldsLocked(false);
        userMadeInitialModeChoice = false;
        document.getElementById('bookingForm').reset();
        orderDateInput.value = fmtDate(new Date(), 'input');
        senderDetailsDisplay.innerHTML = `<span class="italic text-gray-500">Select a customer to autofill sender.</span>`;
        receiverDetailsDisplay.innerHTML = `<span class="italic text-gray-500">Enter receiver details manually.</span>`;
        bookingMessage.textContent = '';
        bookingMessage.className = 'p-2 text-sm text-center rounded-md mt-2';
        selectedContacts = { sender: null, receiver: null };
        selectedCustomerDetails = {};
        updateDisplayTables();
        currentCalcUid = null;
        updateAndDisplayCharges();
        toggleWeightProductEntry(true);
    }

    function updateTimestamp() {
        const now = new Date();
        timestampInput.value = `${fmtDate(now, 'input')} ${fmtDate(now, 'time')}`;
        updateDisplayTables();
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
            parseFloat(document.getElementById('display_chg_wt').textContent) || 0
        );
        for (const key in charges) {
            const element = document.getElementById(`display_${key}`);
            if (element) element.textContent = charges[key];
        }
        // Auto-save to CALC_HISTORY on Calculator page
        if (document.getElementById('calcHistoryList') && window.appDB) {
            if (!currentCalcUid) currentCalcUid = 'CALC_' + Date.now();
            const rec = {
                CALC_UID: currentCalcUid, TIME_STAMP: Date.now(),
                order_date: orderDateInput?.value || '',
                customer_name: customerNameSelect?.value || '',
                transport_type: transportTypeSelect?.value || '',
                origin_pincode: document.getElementById('origin_pincode')?.value || '',
                dest_pincode: document.getElementById('dest_pincode')?.value || '',
                boxes: consignmentBoxes, products: consignmentProducts,
                payment_global: document.getElementById('payment_global')?.checked || false,
                payment_topay:  document.getElementById('payment_topay')?.checked  || false,
                payment_cod:    document.getElementById('payment_cod')?.checked    || false,
                payment_fov:    document.getElementById('payment_fov')?.checked    || false,
                display_weight: document.getElementById('display_weight')?.textContent || '',
                display_chg_wt: document.getElementById('display_chg_wt')?.textContent || '',
                display_total:  document.getElementById('display_total')?.textContent  || '',
            };
            window.appDB.putSheet('CALC_HISTORY', { [currentCalcUid]: rec })
                .then(async () => {
                    // Keep only latest 10 entries
                    const all = await window.IndexedDBManager.getAll('CALC_HISTORY');
                    if (all.length > 10) {
                        all.sort((a, b) => a.TIME_STAMP - b.TIME_STAMP);
                        const toDelete = all.slice(0, all.length - 10);
                        const tx = window.appDB.db.transaction(['CALC_HISTORY'], 'readwrite');
                        const store = tx.objectStore('CALC_HISTORY');
                        toDelete.forEach(r => store.delete(r.CALC_UID));
                    }
                    window._loadCalcHistory && window._loadCalcHistory();
                }).catch(() => {});
        }
    }

    function updateHelperTable() {
        const helperData = getHelperTableData(
            parseFloat(document.getElementById('display_chg_wt').textContent) || 0,
            selectedCustomerDetails,
            transportTypeSelect.value,
            selectedContacts.receiver?.ZONE,
            appData.RATES
        );
        for (const key in helperData) {
            const element = document.getElementById(`display_${key}`);
            if (element) element.textContent = helperData[key];
        }
        updateAndDisplayCharges();
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

    function updateDisplayTables() {
        document.getElementById('display_timestamp').textContent = timestampInput.value || '---';
        document.getElementById('display_order_date').textContent = orderDateInput.value || '---';
        document.getElementById('display_transit_date').textContent = orderDateInput.value || '---';
        document.getElementById('display_carrier').textContent = carrierSelect.value || '---';
        document.getElementById('display_awb_number').textContent = document.getElementById('awb').value || '---';
        document.getElementById('display_consignor').textContent = selectedContacts.sender?.UID || '---';
        document.getElementById('display_origin_pincode').textContent = originPincodeInput.value || '---';
        document.getElementById('display_origin_city').textContent = selectedContacts.sender?.CITY || '---';
        document.getElementById('display_consignee').textContent = selectedContacts.receiver?.UID || '---';
        document.getElementById('display_dest_pincode').textContent = destPincodeInput.value || '---';
        document.getElementById('display_dest_city').textContent = selectedContacts.receiver?.CITY || '---';
        const selectedModeOption = transportTypeSelect.options[transportTypeSelect.selectedIndex];
        const selectedModeText = selectedModeOption ? selectedModeOption.text.toUpperCase().replace(/ /g, '_') : '';
        const tatColumnName = `${selectedModeText}_TAT`;
        document.getElementById('display_tat').textContent = (selectedContacts.receiver && selectedModeText && selectedContacts.receiver[tatColumnName]) || '---';
        document.getElementById('display_mode').textContent = transportTypeSelect.value || '---';
        document.getElementById('display_zone').textContent = selectedContacts.receiver?.ZONE || '---';
        ['global', 'cod', 'topay', 'fov'].forEach(type => {
            document.getElementById(`display_${type}`).textContent = document.getElementById(`payment_${type}`).checked ? 'Yes' : 'No';
        });
        document.getElementById('display_code').textContent = selectedCustomerDetails.CODE || '---';
        document.getElementById('display_user_name').textContent = getUser().NAME || '---';
        document.getElementById('display_branch').textContent = selectedCustomerDetails.BRANCH || '---';
    }

    function revalidateMode() {
        if (userMadeInitialModeChoice && isBookingLocked) return;
        let initialMode = transportTypeSelect.value;
        let newMode = initialMode;
        let message = '';
        let temporaryUnlock = false;
        const weightChangeLimit = parseFloat(selectedCustomerDetails.WEIGHT_CHANGE);
        const expressOption = Array.from(transportTypeSelect.options).find(opt => opt.text.toUpperCase() === 'EXPRESS');
        if (!isNaN(weightChangeLimit) && expressOption && !userMadeInitialModeChoice) {
            if (summaryTotals.totalChgWt > weightChangeLimit && initialMode === expressOption.value) {
                newMode = selectedContacts.receiver?.MODE || newMode;
                message = newMode !== initialMode ? `Mode auto-switched to ${newMode} based on weight.` : `Weight exceeds Express limit (${weightChangeLimit}kg). Please select a new mode.`;
                if (newMode === initialMode) temporaryUnlock = true;
            } else if (summaryTotals.totalChgWt <= weightChangeLimit && initialMode !== expressOption.value) {
                newMode = expressOption.value;
                message = `Weight is within limit. Mode reverted to Express.`;
            }
        }
        if (newMode !== initialMode) transportTypeSelect.value = newMode;
        const receiverZone = selectedContacts.receiver?.ZONE;
        if (receiverZone && appData.MODES) {
            const currentModeData = appData.MODES[transportTypeSelect.value];
            if (currentModeData && currentModeData[receiverZone] === 'N') {
                const surfaceOption = Object.values(appData.MODES).find(m => m.MODE.toUpperCase() === 'SURFACE');
                if (surfaceOption) {
                    transportTypeSelect.value = surfaceOption.SHORT;
                    message = `Mode ${currentModeData.MODE} not available for ${receiverZone}. Switched to Surface. Select another mode if needed.`;
                    temporaryUnlock = true;
                }
            }
        }
        if (transportTypeSelect.value !== initialMode) renderMultiboxTable();
        modeChangeMessage.textContent = message;
        if (isBookingLocked) {
            transportTypeSelect.disabled = temporaryUnlock ? false : true;
            transportTypeSelect.classList.toggle('bg-gray-200', !temporaryUnlock);
            transportTypeSelect.classList.toggle('cursor-not-allowed', !temporaryUnlock);
            wasModeUnlocked = temporaryUnlock;
        }
        updateDisplayTables();
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
        updateSummaryDisplay();
        revalidateMode();
    }

    function addMultiboxEntry() {
        const actualWeight = parseFloat(actualWeightInput.value);
        const length = parseFloat(lengthInput.value);
        const breadth = parseFloat(breadthInput.value);
        const height = parseFloat(heightInput.value);
        const selectedModeOption = transportTypeSelect.options[transportTypeSelect.selectedIndex];
        const volIngr = parseFloat(selectedModeOption.dataset.volIngr);
        multiboxErrorMessage.textContent = '';
        if (!actualWeight || !length || !breadth || !height) {
            multiboxErrorMessage.textContent = 'Please fill all Wgt, L, B, and H fields to add a box.';
            return;
        }
        consignmentBoxes = recalculateAllBoxWeights(
            [...consignmentBoxes, { actualWeight, length, breadth, height }],
            volIngr
        );
        consignmentBoxes.forEach((box, index) => box.boxNum = index + 1);
        if (!isBookingLocked) {
            setBookingFieldsLocked(true);
        } else if (wasModeUnlocked) {
            transportTypeSelect.disabled = true;
            transportTypeSelect.classList.add('bg-gray-200', 'cursor-not-allowed');
            wasModeUnlocked = false;
            modeChangeMessage.textContent = '';
        }
        renderMultiboxTable();
        actualWeightInput.value = '';
        lengthInput.value = '';
        breadthInput.value = '';
        heightInput.value = '';
    }

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
        if (amount >= 50000 && !ewayBill) {
            ewayStatusMessage.textContent = 'EWay Bill is mandatory for invoice value ₹50,000 and above.';
            return;
        }
        if (ewayBill && !/^\d{12}$/.test(ewayBill)) {
            ewayStatusMessage.textContent = 'EWay bill must be a 12-digit numeric number.';
            return;
        }
        consignmentProducts.push({ name: productName, docNo, ewayBill, type: productType, amount: amount || 0 });
        if (!isBookingLocked) setBookingFieldsLocked(true);
        renderProductTable();
        productNameInput.value = '';
        docNoInput.value = '';
        ewayBillInput.value = '';
        amountInput.value = '';
        productTypeSelect.value = 'INV';
    }

    function handleCustomerSelectionChange() {
        const selectedCustomerCode = customerNameSelect.value;
        selectedCustomerDetails = appData.B2B?.[selectedCustomerCode] || {};
        const contactDetails = Object.values(appData.B2B2C || {}).find(c => c.NAME === selectedCustomerDetails.B2B_NAME && c.CODE === selectedCustomerCode);
        if (contactDetails) {
            senderNameInput.value = contactDetails.NAME;
            originPincodeInput.value = contactDetails.PINCODE || '';
            selectedContacts.sender = contactDetails;
            displayContactDetails(contactDetails, senderDetailsDisplay);
        } else {
            senderNameInput.value = '';
            originPincodeInput.value = '';
            selectedContacts.sender = null;
            senderDetailsDisplay.innerHTML = `<span class="italic text-gray-500">Select a customer to autofill sender.</span>`;
        }
        populateModeDropdown(null);
        const expressOption = Array.from(transportTypeSelect.options).find(opt => opt.text.toUpperCase() === 'EXPRESS');
        if (expressOption) transportTypeSelect.value = expressOption.value;
        updateDisplayTables();
        checkMainDetailsAndToggleInputs();
    }

    function displayContactDetails(contact, displayElement) {
        if (contact) {
            displayElement.innerHTML = `
                <p class="text-xs text-gray-600">${contact.ADDRESS || ''}</p>
                <p class="text-xs text-gray-600">${contact.CITY || ''}, ${contact.STATE || ''} - ${contact.PINCODE || ''}</p>
                <p class="text-xs text-gray-600">Ph: ${contact.MOBILE || ''}</p>
            `;
        } else {
            displayElement.innerHTML = `<span class="italic text-gray-500">No details found.</span>`;
        }
    }

    function setupAutocomplete(inputElement, resultsElement, displayElement, type) {
        inputElement.addEventListener('input', () => {
            const query = inputElement.value.toLowerCase();
            resultsElement.innerHTML = '';
            resultsElement.classList.add('hidden');
            if (type === 'sender') selectedContacts.sender = null;
            if (type === 'receiver') {
                selectedContacts.receiver = null;
                populateModeDropdown(null);
            }
            updateDisplayTables();
            checkMainDetailsAndToggleInputs();
            if (query.length < 2 || !appData.B2B2C) return;
            const customerCode = selectedCustomerDetails.CODE;
            if (!customerCode) return;
            const customerSpecificContacts = Object.values(appData.B2B2C).filter(contact => contact.CODE === customerCode);
            const filteredResults = customerSpecificContacts.filter(contact =>
                (contact.NAME && contact.NAME.toLowerCase().includes(query)) ||
                (contact.PINCODE && contact.PINCODE.toString().includes(query)) ||
                (contact.CITY && contact.CITY.toLowerCase().includes(query))
            );
            if (filteredResults.length > 0 || query) {
                filteredResults.forEach(contact => {
                    const li = document.createElement('li');
                    li.textContent = `${contact.NAME} - ${contact.CITY}, ${contact.PINCODE}`;
                    li.addEventListener('click', () => {
                        inputElement.value = contact.NAME;
                        displayContactDetails(contact, displayElement);
                        if (type === 'sender') {
                            selectedContacts.sender = contact;
                            originPincodeInput.value = contact.PINCODE || '';
                        } else {
                            selectedContacts.receiver = contact;
                            destPincodeInput.value = contact.PINCODE || '';
                            carrierSelect.value = contact.CARRIER || '';
                            populateModeDropdown(contact.ZONE);
                        }
                        resultsElement.classList.add('hidden');
                        revalidateMode();
                        updateDisplayTables();
                        checkMainDetailsAndToggleInputs();
                    });
                    resultsElement.appendChild(li);
                });
                const addNewLi = document.createElement('li');
                addNewLi.className = 'bg-gray-100 font-semibold';
                addNewLi.textContent = '+ Add New Contact';
                addNewLi.addEventListener('click', () => {
                    if (window.openAddContactModal) {
                        window.openAddContactModal(type, inputElement, displayElement);
                    }
                    resultsElement.classList.add('hidden');
                });
                resultsElement.appendChild(addNewLi);
                resultsElement.classList.remove('hidden');
            }
        });
    }

    function formatCurrency(value) {
        const num = parseFloat(value);
        return isNaN(num) || num === 0 ? '---' : num.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function lookupModeName(shortCode) {
        if (!appData.MODES || !shortCode) return shortCode;
        const modeEntry = appData.MODES[shortCode];
        return modeEntry ? modeEntry.MODE : shortCode;
    }

    function lookupContactName(uid) {
        if (!appData.B2B2C || !uid) return 'N/A';
        const contact = appData.B2B2C[uid];
        return contact ? contact.NAME : uid;
    }

    function renderShipmentList(shipments) {
        const listEl = document.getElementById('shipmentList');
        listEl.innerHTML = '';
        if (!shipments.length) {
            listEl.innerHTML = '<li class="text-center text-gray-500 p-4">No recent shipments found.</li>';
            return;
        }
        shipments.forEach(order => {
            const ref  = order.REFERENCE;
            const cnor = lookupContactName(order.CONSIGNOR);
            const cnee = lookupContactName(order.CONSIGNEE);
            const li   = document.createElement('li');
            li.style.cssText = 'padding:0.75rem;border-radius:0.5rem;border:1px solid #e5e7eb;line-height:1.6;';
            li.innerHTML = `
                <div class="bo-li-wrap">
                    <div class="bo-li-main">
                        <div style="flex:1;min-width:0;">
                            <strong style="color:#4338ca;display:block;font-size:0.875rem;font-weight:600;">${order.AWB_NUMBER || 'No AWB'}</strong>
                            <span style="font-size:0.75rem;color:#6b7280;">${cnor} &rarr; ${cnee}</span>
                            <div class="bo-li-grid" style="margin-top:4px;">
                                <span><span style="color:#9ca3af;">Ref</span> <b>${ref}</b></span>
                                <span><span style="color:#9ca3af;">Date</span> <b>${fmtDate(order.ORDER_DATE)}</b></span>
                                <span><span style="color:#9ca3af;">Dest</span> <b>${order.DEST_CITY || 'N/A'} ${order.DEST_PINCODE || ''}</b></span>
                                <span><span style="color:#9ca3af;">Carrier</span> <b>${order.CARRIER || 'N/A'}</b></span>
                                <span><span style="color:#9ca3af;">Mode</span> <b>${lookupModeName(order.MODE) || order.MODE || 'N/A'}</b></span>
                                <span><span style="color:#9ca3af;">TAT</span> <b>${order.TAT || 'N/A'}</b></span>
                                <span><span style="color:#9ca3af;">Zone</span> <b>${order.ZONE || 'N/A'}</b></span>
                                <span><span style="color:#9ca3af;">Wt</span> <b>${order.WEIGHT || 0} kg</b></span>
                                <span><span style="color:#9ca3af;">ChgWt</span> <b>${order.CHG_WT ? parseFloat(order.CHG_WT).toFixed(2) : '0.00'} kg</b></span>
                                <span><span style="color:#9ca3af;">Pcs</span> <b>${order.PIECS || 0}</b></span>
                                <span><span style="color:#9ca3af;">Value</span> <b>&#8377;${order.VALUE ? parseFloat(order.VALUE).toFixed(2) : '0.00'}</b></span>
                                ${(order.COD && parseFloat(order.COD) > 0) ? `<span><span style="color:#9ca3af;">COD</span> <b>${order.COD}</b></span>` : ''}
                                ${(order.TOPAY && order.TOPAY !== 'No') ? `<span><span style="color:#9ca3af;">ToPay</span> <b>${order.TOPAY}</b></span>` : ''}
                                ${(order.FOV && parseFloat(order.FOV) > 0) ? `<span><span style="color:#9ca3af;">FOV</span> <b>${order.FOV}</b></span>` : ''}
                            </div>
                        </div>
                        <div class="bo-li-btns">
                            <div class="bo-action-row">
                                ${!isClient ? `<button onclick="boEditOrder('${ref}')" title="Edit" style="padding:4px;border:none;background:transparent;cursor:pointer;color:#6b7280;border-radius:4px;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'"><svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>` : ''}
                                ${canDelete ? `<button onclick="boDeleteOrder('${ref}')" title="Delete" style="padding:4px;border:none;background:transparent;cursor:pointer;color:#ef4444;border-radius:4px;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='transparent'"><svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : ''}
                                <button onclick="boPrintAll('${ref}')" title="Print All" style="padding:4px;border:none;background:transparent;cursor:pointer;color:#6b7280;border-radius:4px;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'"><svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg></button>
                                <button onclick="boShowInfo('${ref}')" title="Info" style="padding:4px;border:none;background:transparent;cursor:pointer;color:#4338ca;border-radius:4px;" onmouseover="this.style.background='#eef2ff'" onmouseout="this.style.background='transparent'"><svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>
                            </div>
                            <div class="bo-print-row">
                                <button onclick="boPrint('receipt','${ref}')"  title="Receipt"     style="padding:3px 5px;border:none;background:#f9fafb;cursor:pointer;color:#6b7280;border-radius:4px;font-size:0.6rem;font-weight:600;" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f9fafb'">RCP</button>
                                <button onclick="boPrint('label','${ref}')"    title="Label"       style="padding:3px 5px;border:none;background:#f9fafb;cursor:pointer;color:#6b7280;border-radius:4px;font-size:0.6rem;font-weight:600;" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f9fafb'">LBL</button>
                                <button onclick="boPrint('pod','${ref}')"      title="POD"         style="padding:3px 5px;border:none;background:#f9fafb;cursor:pointer;color:#6b7280;border-radius:4px;font-size:0.6rem;font-weight:600;" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f9fafb'">POD</button>
                                <button onclick="boPrint('office','${ref}')"   title="Office Copy" style="padding:3px 5px;border:none;background:#f9fafb;cursor:pointer;color:#6b7280;border-radius:4px;font-size:0.6rem;font-weight:600;" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f9fafb'">OFC</button>
                                <button onclick="boPrint('docs','${ref}')"     title="Docs"        style="padding:3px 5px;border:none;background:#f9fafb;cursor:pointer;color:#6b7280;border-radius:4px;font-size:0.6rem;font-weight:600;" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f9fafb'">DOC</button>
                                <button onclick="boPrint('multibox','${ref}')" title="Multibox"    style="padding:3px 5px;border:none;background:#f9fafb;cursor:pointer;color:#6b7280;border-radius:4px;font-size:0.6rem;font-weight:600;" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f9fafb'">MBX</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            listEl.appendChild(li);
        });
    }

    window.boShowInfo = (ref) => {
        const p = _boGetParts(ref); if (!p) return;

        // set globals that shipments render functions depend on
        currentSelectedRef = ref;
        allOrders          = Object.values(appData.ORDERS || {});

        // wire ui references to modal containers (shipments bootstrap didn't run here)
        ui.documentCenterContainer  = document.getElementById('documentCenterContainer');
        ui.shipmentDetailsContainer = document.getElementById('shipmentDetailsContainer');
        ui.productBoxDetailsContainer = document.getElementById('productBoxDetailsContainer');
        ui.trackingStatusContainer  = document.getElementById('trackingStatusContainer');
        ui.consignorDetailsContainer = document.getElementById('boInfoConsignor');
        ui.consigneeDetailsContainer = document.getElementById('boInfoConsignee');
        ui.trackingHistoryContainer  = document.getElementById('trackingHistoryContainer');

        // render all panes
        renderDocumentCenter(p.order);
        renderShipmentDetails(p.order);
        renderPartyDetails('Consignor', p.cnor?.NAME || p.order.CONSIGNOR, p.order.ORIGIN_CITY, p.cnor?.PINCODE || p.order.ORIGIN_PINCODE, p.cnor?.ADDRESS || '', p.cnor?.MOBILE || '', ui.consignorDetailsContainer);
        renderPartyDetails('Consignee', p.cnee?.NAME || p.order.CONSIGNEE, p.order.DEST_CITY,   p.cnee?.PINCODE || p.order.DEST_PINCODE,   p.cnee?.ADDRESS || '', p.cnee?.MOBILE || '', ui.consigneeDetailsContainer);
        renderProductAndBoxDetails(p.order);
        renderTrackingStatus(p.order);

        document.getElementById('boInfoModal').classList.remove('hidden');
    };

    document.getElementById('boInfoModalClose').addEventListener('click', () => {
        document.getElementById('boInfoModal').classList.add('hidden');
    });
    document.getElementById('boInfoModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('boInfoModal'))
            document.getElementById('boInfoModal').classList.add('hidden');
    });

    window.boEditOrder = (ref) => {
        if (typeof prefillEditOrder === 'function') {
            // Already on BookOrder.html — prefill directly
            prefillEditOrder(ref);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            // Coming from another page
            sessionStorage.setItem('editOrderRef', ref);
            window.location.href = 'BookOrder.html';
        }
    };
    window.boDeleteOrder = async (ref) => {
        if (!confirm(`Delete order ${ref}? This cannot be undone.`)) return;
        try { await deleteOrder(ref); fetchShipmentList(); } catch(e) { alert('Delete failed: ' + e.message); }
    };

    function _boSetupMaps() {
        b2b2cDataMap.clear();
        modesDataMap.clear();
        carriersDataMap.clear();
        productDataMap.clear();
        multiboxDataMap.clear();
        uploadsDataMap.clear();
        Object.values(appData.B2B2C    || {}).forEach(c => b2b2cDataMap.set(c.UID, c));
        Object.values(appData.MODES    || {}).forEach(m => modesDataMap.set(m.SHORT, m.MODE));
        Object.values(appData.CARRIERS || {}).forEach(c => carriersDataMap.set(c.COMPANY_CODE, c.COMPANY_NAME));
        Object.values(appData.PRODUCTS || {}).forEach(p => { const r = String(p.REFERENCE); if (!r) return; if (!productDataMap.has(r)) productDataMap.set(r, []); productDataMap.get(r).push(p); });
        Object.values(appData.MULTIBOX || {}).forEach(b => { const r = String(b.REFERENCE); if (!r) return; if (!multiboxDataMap.has(r)) multiboxDataMap.set(r, []); multiboxDataMap.get(r).push(b); });
        Object.values(appData.UPLOADS  || {}).forEach(u => { const r = String(u.REFERENCE); if (!r) return; if (!uploadsDataMap.has(r)) uploadsDataMap.set(r, []); uploadsDataMap.get(r).push(u); });
    }

    function _boGetParts(ref) {
        _boSetupMaps();
        const order = Object.values(appData.ORDERS || {}).find(o => String(o.REFERENCE) === String(ref));
        if (!order) return null;
        return {
            order,
            cnor:  b2b2cDataMap.get(order.CONSIGNOR),
            cnee:  b2b2cDataMap.get(order.CONSIGNEE),
            prods: productDataMap.get(String(ref))  || [],
            boxes: multiboxDataMap.get(String(ref)) || [],
            awb:   order.AWB_NUMBER || ref
        };
    }

    window.boPrintAll = (ref) => {
        const p = _boGetParts(ref); if (!p) return;
        const pieces    = p.boxes.length > 0 ? p.boxes.length : (p.order.PIECS || 1);
        const pageStyle = `<style>@page{size:A4 landscape;margin:8mm;}body{display:flex;flex-wrap:wrap;justify-content:space-between;align-content:flex-start;gap:0;}.label-wrapper{width:49%;max-width:49%!important;border:1px solid #000!important;box-shadow:none!important;margin:0;padding:0;box-sizing:border-box;page-break-inside:avoid;height:192mm!important;display:flex;flex-direction:column;overflow:hidden;}</style>`;
        let labelHtml = pageStyle;
        const labelIds = [];
        if (p.boxes.length > 0) {
            for (let i = 0; i < pieces; i++) { labelHtml += buildLabel(p.order, p.cnor, p.cnee, p.prods, p.boxes, { type:'box', index:i }); labelIds.push(`barcode-box-${i}`); }
        } else {
            labelHtml += buildLabel(p.order, p.cnor, p.cnee, p.prods, [], { type:'box', index:0 }); labelIds.push('barcode-box-0');
        }
        labelHtml += buildLabel(p.order, p.cnor, p.cnee, p.prods, p.boxes, { type:'summary' }); labelIds.push('barcode-summary-0');
        const html = [
            buildReceipt(p.order, p.cnor, p.cnee, p.prods),
            labelHtml,
            buildPOD(p.order, p.cnor, p.cnee, p.prods),
            buildOfficeCopy(p.order, p.cnor, p.cnee, p.prods),
            buildDocs(p.order, p.cnor, p.cnee, p.prods),
            ...(p.boxes.length ? [buildMultibox(p.order, p.cnor, p.cnee, p.prods, p.boxes)] : [])
        ].join('<div style="page-break-after:always;"></div>');
        _openInNewTab(`All Docs - ${p.awb}`, html, ['receipt-barcode', ...labelIds]);
    };

    window.boPrint = (type, ref) => {
        const p = _boGetParts(ref); if (!p) return;
        if (type === 'label') {
            const pieces    = p.boxes.length > 0 ? p.boxes.length : (p.order.PIECS || 1);
            const isPortrait = false;
            const pageStyle = `<style>@page{size:A4 landscape;margin:8mm;}body{display:flex;flex-wrap:wrap;justify-content:space-between;align-content:flex-start;gap:0;}.label-wrapper{width:49%;max-width:49%!important;border:1px solid #000!important;box-shadow:none!important;margin:0;padding:0;box-sizing:border-box;page-break-inside:avoid;height:192mm!important;display:flex;flex-direction:column;overflow:hidden;}</style>`;
            let html = pageStyle;
            const ids = [];
            if (p.boxes.length > 0) {
                for (let i = 0; i < pieces; i++) { html += buildLabel(p.order, p.cnor, p.cnee, p.prods, p.boxes, { type:'box', index:i }); ids.push(`barcode-box-${i}`); }
            } else {
                html += buildLabel(p.order, p.cnor, p.cnee, p.prods, [], { type:'box', index:0 }); ids.push('barcode-box-0');
            }
            html += buildLabel(p.order, p.cnor, p.cnee, p.prods, p.boxes, { type:'summary' }); ids.push('barcode-summary-0');
            _openInNewTab(`Label - ${p.awb}`, html, ids);
        }
        else if (type === 'receipt')  _openInNewTab(`Receipt - ${p.awb}`,     buildReceipt(p.order, p.cnor, p.cnee, p.prods), ['receipt-barcode']);
        else if (type === 'pod')      _openInNewTab(`POD - ${p.awb}`,         buildPOD(p.order, p.cnor, p.cnee, p.prods), ['receipt-barcode']);
        else if (type === 'office')   _openInNewTab(`Office Copy - ${p.awb}`, buildOfficeCopy(p.order, p.cnor, p.cnee, p.prods), ['receipt-barcode']);
        else if (type === 'docs')     _openInNewTab(`Docs - ${p.awb}`,        buildDocs(p.order, p.cnor, p.cnee, p.prods));
        else if (type === 'multibox') _openInNewTab(`Multibox - ${p.awb}`,    buildMultibox(p.order, p.cnor, p.cnee, p.prods, p.boxes));
    };

    // --- EDIT ORDER ---
    let editOrderRef = null;

    async function prefillEditOrder(ref) {
        editOrderRef = ref;
        sessionStorage.removeItem('editOrderRef');

        const order = Object.values(appData.ORDERS || {}).find(o => String(o.REFERENCE) === String(ref));
        if (!order) { showNotification('Order not found: ' + ref, 'error'); return; }

        const boxes    = Object.values(appData.MULTIBOX  || {}).filter(b => String(b.REFERENCE) === String(ref));
        const prods    = Object.values(appData.PRODUCTS  || {}).filter(p => String(p.REFERENCE) === String(ref));

        // Show edit banner
        const banner = document.createElement('div');
        banner.id = 'editOrderBanner';
        banner.className = 'p-2 text-sm text-center font-semibold bg-yellow-100 text-yellow-800 border-b border-yellow-300';
        banner.textContent = 'Editing Order: ' + ref;
        document.querySelector('main')?.prepend(banner);

        // Change Book button
        if (bookButton) {
            bookButton.textContent = 'Update Order';
        }

        // Fill date
        if (orderDateInput && order.ORDER_DATE) orderDateInput.value = fmtDate(order.ORDER_DATE, 'input');

        // Fill customer
        if (customerNameSelect && order.CODE) {
            customerNameSelect.value = order.CODE;
            handleCustomerSelectionChange();
        }

        // Fill AWB + carrier
        if (document.getElementById('awb')) document.getElementById('awb').value = order.AWB_NUMBER || '';
        await new Promise(r => setTimeout(r, 300));
        if (carrierSelect) carrierSelect.value = order.CARRIER || '';

        // Fill mode
        if (transportTypeSelect) { transportTypeSelect.value = order.MODE || ''; transportTypeSelect.dispatchEvent(new Event('change')); }

        // Fill payments
        document.getElementById('payment_global').checked = order.GLOBAL === 'Yes';
        document.getElementById('payment_topay').checked  = order.TOPAY  === 'Yes';
        document.getElementById('payment_cod').checked    = order.COD    === 'Yes';
        document.getElementById('payment_fov').checked    = order.FOV    === 'Yes';

        // Fill sender (consignor)
        const cnor = Object.values(appData.B2B2C || {}).find(c => c.UID === order.CONSIGNOR);
        if (cnor && senderNameInput) {
            senderNameInput.value = cnor.NAME || '';
            selectedContacts.sender = cnor;
            originPincodeInput.value = cnor.PINCODE || '';
            senderDetailsDisplay.innerHTML = `<div class=text-sm><strong>${cnor.NAME}</strong><br>${cnor.ADDRESS||''}, ${cnor.CITY||''} - ${cnor.PINCODE||''}<br>${cnor.MOBILE||''}</div>`;
        }

        // Fill receiver (consignee)
        const cnee = Object.values(appData.B2B2C || {}).find(c => c.UID === order.CONSIGNEE);
        if (cnee && receiverNameInput) {
            receiverNameInput.value = cnee.NAME || '';
            selectedContacts.receiver = cnee;
            destPincodeInput.value = cnee.PINCODE || '';
            receiverDetailsDisplay.innerHTML = `<div class=text-sm><strong>${cnee.NAME}</strong><br>${cnee.ADDRESS||''}, ${cnee.CITY||''} - ${cnee.PINCODE||''}<br>${cnee.MOBILE||''}</div>`;
            populateModeDropdown(cnee.ZONE);
            transportTypeSelect.value = order.MODE || '';
        }

        // Fill multibox
        consignmentBoxes = boxes.map((b, i) => ({
            boxNum:       b.BOX_NUM || (i + 1),
            actualWeight: parseFloat(b.WEIGHT)  || 0,
            length:       parseFloat(b.LENGTH)  || 0,
            breadth:      parseFloat(b.BREADTH) || 0,
            height:       parseFloat(b.HIGHT)   || 0,
            volWeight:    parseFloat(b.VOLUME)  || 0,
            chargeWeight: parseFloat(b.CHG_WT)  || 0,
        }));

        // Fill products (exclude EWB rows — they are derived)
        const mainProds = prods.filter(p => p.DOC_TYPE !== 'EWB');
        consignmentProducts = mainProds.map(p => {
            const ewb = prods.find(e => e.DOC_TYPE === 'EWB' && e.PRODUCT === p.PRODUCT);
            return {
                name:     p.PRODUCT    || '',
                docNo:    p.DOC_NUMBER || '',
                ewayBill: ewb ? ewb.DOC_NUMBER : '',
                type:     p.DOC_TYPE   || 'INV',
                amount:   parseFloat(p.AMOUNT) || 0,
            };
        });

        renderMultiboxTable();
        renderProductTable();
        // In edit mode — unlock all fields so user can edit freely
        setBookingFieldsLocked(false);
        toggleWeightProductEntry(false);
        updateDisplayTables();
    }

    async function fetchShipmentList() {
        try {
            const allOrders = Object.values(appData.ORDERS || {});
            if (!Array.isArray(allOrders) || !allOrders.length) { renderShipmentList([]); return; }
            const sorted = [...allOrders].sort((a, b) => (parseDate(b.TIME_STAMP)?.getTime() || 0) - (parseDate(a.TIME_STAMP)?.getTime() || 0));
            renderShipmentList(sorted.slice(0, 10));
        } catch (error) {
            console.error('Error reading ORDERS data:', error);
            document.getElementById('shipmentList').innerHTML = '<li class="p-4 text-center text-red-500">Failed to load shipments.</li>';
        }
    }

    // --- MAIN INITIALIZATION & EVENT LISTENERS ---

    if (isClient) {
        const awbInput = document.getElementById('awb');
        const getAwbBtn = document.getElementById('getAwbButton');
        if (awbInput) awbInput.closest('.relative.flex-grow').classList.add('hidden');
        if (getAwbBtn) getAwbBtn.classList.add('hidden');
    }

    window.addEventListener('appDataLoaded', (e) => initializeAppLogic(e.detail));
    window.addEventListener('appDataRefreshed', (e) => handleDataRefresh(e.detail));

    // --- CALC HISTORY ---
    async function loadCalcHistory() { window._loadCalcHistory = loadCalcHistory;
        const listEl = document.getElementById('calcHistoryList');
        if (!listEl || !window.appDB) return;
        try {
            const all = await window.IndexedDBManager.getAll('CALC_HISTORY');
            if (!all || !all.length) { listEl.innerHTML = '<li class="text-center text-gray-500 text-sm">No history yet.</li>'; return; }
            all.sort((a, b) => b.TIME_STAMP - a.TIME_STAMP);
            listEl.innerHTML = '';
            all.forEach(c => {
                const li = document.createElement('li');
                li.style.cssText = 'padding:0.75rem;border-radius:0.5rem;border:1px solid #e5e7eb;line-height:1.6;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;';
                li.innerHTML = `
                    <div style="flex:1;min-width:0;font-size:0.75rem;color:#374151;">
                        <strong style="color:#4338ca;font-size:0.875rem;">${c.customer_name || 'N/A'}</strong>
                        <span style="color:#6b7280;"> &mdash; ${fmtDate(c.TIME_STAMP, 'full')}</span>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;">
                            <span>Mode: <b>${c.transport_type || 'N/A'}</b></span>
                            <span>Wt: <b>${c.display_chg_wt || '---'}</b></span>
                            <span>Total: <b>${c.display_total || '---'}</b></span>
                            <span>${c.origin_pincode || '?'} &rarr; ${c.dest_pincode || '?'}</span>
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0;">
                        <button onclick="calcHistoryBookIt('${c.CALC_UID}')"  style="padding:3px 8px;border:none;background:#15803d;color:#fff;border-radius:4px;font-size:0.65rem;cursor:pointer;">Book It</button>
                        <button onclick="calcHistoryLoad('${c.CALC_UID}')"    style="padding:3px 8px;border:none;background:#1d4ed8;color:#fff;border-radius:4px;font-size:0.65rem;cursor:pointer;">Load</button>
                        <button onclick="calcHistoryDelete('${c.CALC_UID}')" style="padding:3px 8px;border:none;background:#dc2626;color:#fff;border-radius:4px;font-size:0.65rem;cursor:pointer;">Delete</button>
                    </div>`;
                listEl.appendChild(li);
            });
        } catch(e) { console.warn('Calc history load failed', e); }
    }

    window.calcHistoryBookIt = async (calcUid) => {
        const all = await window.IndexedDBManager.getAll('CALC_HISTORY');
        const rec = all.find(c => c.CALC_UID === calcUid);
        if (rec) { localStorage.setItem('calcToBook', JSON.stringify(rec)); window.location.href = 'BookOrder.html'; }
    };

    window.calcHistoryLoad = async (calcUid) => {
        const all = await window.IndexedDBManager.getAll('CALC_HISTORY');
        const rec = all.find(c => c.CALC_UID === calcUid);
        if (!rec) return;
        customerNameSelect.value = rec.customer_name || '';
        customerNameSelect.dispatchEvent(new Event('change'));
        if (originPincodeInput) originPincodeInput.value = rec.origin_pincode || '';
        if (destPincodeInput)   destPincodeInput.value   = rec.dest_pincode   || '';
        if (destPincodeInput)   destPincodeInput.dispatchEvent(new Event('input'));
        orderDateInput.value = rec.order_date || '';
        document.getElementById('payment_global').checked = !!rec.payment_global;
        document.getElementById('payment_topay').checked  = !!rec.payment_topay;
        document.getElementById('payment_cod').checked    = !!rec.payment_cod;
        document.getElementById('payment_fov').checked    = !!rec.payment_fov;
        consignmentBoxes    = rec.boxes    || [];
        consignmentProducts = rec.products || [];
        renderMultiboxTable();
        renderProductTable();
        setTimeout(() => { transportTypeSelect.value = rec.transport_type || ''; transportTypeSelect.dispatchEvent(new Event('change')); }, 500);
    };

    window.calcHistoryDelete = async (calcUid) => {
        if (!confirm('Delete this calculation?')) return;
        const tx = window.appDB.db.transaction(['CALC_HISTORY'], 'readwrite');
        tx.objectStore('CALC_HISTORY').delete(calcUid);
        tx.oncomplete = loadCalcHistory;
    };

    window.calcHistoryClearAll = async () => {
        if (!confirm('Clear all calculation history?')) return;
        const tx = window.appDB.db.transaction(['CALC_HISTORY'], 'readwrite');
        tx.objectStore('CALC_HISTORY').clear();
        tx.oncomplete = loadCalcHistory;
    };

    window.addEventListener('indexedDBReady', loadCalcHistory);
    if (window.appDB?.db) loadCalcHistory();

    // Expose context for book-order-add-contact.js
    window.bookOrderCtx = {
        get appData()                { return appData; },
        get selectedCustomerDetails(){ return selectedCustomerDetails; },
        get selectedContacts()       { return selectedContacts; },
        get originPincodeInput()     { return originPincodeInput; },
        get destPincodeInput()       { return destPincodeInput; },
        get carrierSelect()          { return carrierSelect; },
        displayContactDetails,
        populateModeDropdown,
        revalidateMode,
        updateDisplayTables,
        checkMainDetailsAndToggleInputs,
    };

    const waitForDB = async () => {
        if (window.appDB && window.appDB.db) return;
        await new Promise(resolve => {
            const t = setTimeout(resolve, 3000);
            window.addEventListener('indexedDBReady', () => { clearTimeout(t); resolve(); }, { once: true });
        });
    };
    waitForDB().then(async () => {
        const data = await getAppData();
        if (data) initializeAppLogic({ data });
    });

    customerNameSelect.addEventListener('change', handleCustomerSelectionChange);

    transportTypeSelect.addEventListener('change', () => {
        if (!isBookingLocked) userMadeInitialModeChoice = true;
        consignmentBoxes = recalculateAllBoxWeights(consignmentBoxes, parseFloat(transportTypeSelect.options[transportTypeSelect.selectedIndex].dataset.volIngr));
        renderMultiboxTable();
        if (isBookingLocked) {
            transportTypeSelect.disabled = true;
            transportTypeSelect.classList.add('bg-gray-200', 'cursor-not-allowed');
            wasModeUnlocked = false;
            modeChangeMessage.textContent = '';
        }
        checkMainDetailsAndToggleInputs();
    });

    carrierSelect.addEventListener('change', () => {
        if (isBookingLocked && carrierSelect.value !== '') {
            carrierSelect.disabled = true;
            carrierSelect.classList.add('bg-gray-200', 'cursor-not-allowed');
        }
        checkMainDetailsAndToggleInputs();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) {
            senderAutocompleteResults.classList.add('hidden');
            receiverAutocompleteResults.classList.add('hidden');
        }
    });

    ['order_date', 'carrier_select', 'awb', 'sender_name', 'origin_pincode', 'receiver_name', 'dest_pincode', 'transport_type'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateDisplayTables);
    });

    ['payment_global', 'payment_topay', 'payment_cod', 'payment_fov'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            updateDisplayTables();
            updateAndDisplayCharges();
        });
    });

    actualWeightInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lengthInput.focus(); } });
    lengthInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); breadthInput.focus(); } });
    breadthInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); heightInput.focus(); } });
    heightInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); addMultiboxEntry(); actualWeightInput.focus(); } });
    productNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); docNoInput.focus(); } });
    docNoInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ewayBillInput.focus(); } });
    ewayBillInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); amountInput.focus(); } });
    amountInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); addProductEntry(); productNameInput.focus(); } });

    clearMultiboxButton.addEventListener('click', () => {
        consignmentBoxes.pop();
        renderMultiboxTable();
        if (consignmentBoxes.length === 0 && consignmentProducts.length === 0) setBookingFieldsLocked(false);
    });
    clearMultiboxButton.addEventListener('dblclick', () => {
        consignmentBoxes = [];
        renderMultiboxTable();
        if (consignmentBoxes.length === 0 && consignmentProducts.length === 0) setBookingFieldsLocked(false);
    });
    clearProductsButton.addEventListener('click', () => {
        consignmentProducts.pop();
        renderProductTable();
        if (consignmentBoxes.length === 0 && consignmentProducts.length === 0) setBookingFieldsLocked(false);
    });
    clearProductsButton.addEventListener('dblclick', () => {
        consignmentProducts = [];
        renderProductTable();
        if (consignmentBoxes.length === 0 && consignmentProducts.length === 0) setBookingFieldsLocked(false);
    });
    clearAllButton.addEventListener('click', () => {
        consignmentBoxes = [];
        consignmentProducts = [];
        renderMultiboxTable();
        renderProductTable();
        setBookingFieldsLocked(false);
    });

    cancelButton.addEventListener('click', resetFullForm);

    const bookItButton = document.getElementById('book_it_button');
    if (bookItButton) {
        bookItButton.addEventListener('click', async () => {
            const calcUid = 'CALC_' + Date.now();
            const record = {
                CALC_UID:       calcUid,
                TIME_STAMP:     Date.now(),
                order_date:     orderDateInput.value,
                customer_name:  customerNameSelect.value,
                transport_type: transportTypeSelect.value,
                origin_pincode: originPincodeInput?.value || '',
                dest_pincode:   destPincodeInput?.value || '',
                boxes:          consignmentBoxes,
                products:       consignmentProducts,
                payment_global: document.getElementById('payment_global').checked,
                payment_topay:  document.getElementById('payment_topay').checked,
                payment_cod:    document.getElementById('payment_cod').checked,
                payment_fov:    document.getElementById('payment_fov').checked,
                display_weight: document.getElementById('display_weight').textContent,
                display_chg_wt: document.getElementById('display_chg_wt').textContent,
                display_total:  document.getElementById('display_total').textContent,
            };
            if (window.appDB) await window.appDB.putSheet('CALC_HISTORY', { [calcUid]: record });
            localStorage.setItem('calcToBook', JSON.stringify(record));
            window.location.href = 'BookOrder.html';
        });
    }

    bookButton.addEventListener('click', async () => {
        bookingMessage.textContent = '';
        bookingMessage.className = 'p-2 text-sm text-center rounded-md mt-2';
        if (!areMainDetailsComplete() || (consignmentBoxes.length === 0 && consignmentProducts.length === 0)) {
            bookingMessage.textContent = 'Please fill all required fields (Customer, Sender, Receiver, Mode, Carrier) and add at least one box or product.';
            bookingMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-red-700 bg-red-100';
            return;
        }
        bookButton.disabled = true;
        if (editOrderRef) {
            bookButton.textContent = 'Updating...';
            try {
                const payload = buildEditPayload(consignmentBoxes, consignmentProducts, summaryTotals, orderDateInput, editOrderRef);
                await submitEditOrder(payload);
                bookingMessage.textContent = `Order ${editOrderRef} updated successfully!`;
                bookingMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-green-700 bg-green-100';
                editOrderRef = null;
                document.getElementById('editOrderBanner')?.remove();
                bookButton.style.backgroundColor = '';
                bookButton.textContent = 'Book';
                resetForNextBooking();
            } catch (error) {
                bookingMessage.textContent = `Update failed: ${error.message}`;
                bookingMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-red-700 bg-red-100';
            } finally {
                bookButton.disabled = false;
                bookButton.textContent = editOrderRef ? 'Update Order' : 'Book';
            }
        } else {
            bookButton.textContent = 'Booking...';
            try {
                const payload = buildBookingPayload(consignmentBoxes, consignmentProducts, summaryTotals, orderDateInput);
                const result = await submitBookOrder(payload);
                bookingMessage.textContent = `Booked successfully! Reference: ${result.reference}`;
                bookingMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-green-700 bg-green-100';
                resetForNextBooking();
            } catch (error) {
                bookingMessage.textContent = `Booking failed: ${error.message}`;
                bookingMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-red-700 bg-red-100';
            } finally {
                bookButton.disabled = false;
                bookButton.textContent = 'Book';
            }
        }
    });

    if (getAwbButton) {
        getAwbButton.addEventListener('click', () => {
            bookingMessage.textContent = 'AWB fetch logic not implemented yet.';
            bookingMessage.className = 'p-2 text-sm text-center rounded-md mt-2 text-blue-700 bg-blue-100';
        });
    }

    updateTimestamp();
    orderDateInput.value = fmtDate(new Date(), 'input');
    setInterval(updateTimestamp, 60000);
    updateDisplayTables();
    updateSummaryDisplay();
    toggleWeightProductEntry(true);
    if (appData.ORDERS) fetchShipmentList();
});
