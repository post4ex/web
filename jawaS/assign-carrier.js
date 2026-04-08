// jawaS/assign-carrier.js
// AssignCarrier.html page logic
// Depends on: core/assign-carrier-api.js (updateOrder)

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM ---
    const form                   = document.getElementById('partialUpdateForm');
    const submitButton           = document.getElementById('submitButton');
    const buttonText             = document.getElementById('buttonText');
    const spinner                = document.getElementById('spinner');
    const responseMessage        = document.getElementById('responseMessage');
    const shipmentsListContainer = document.getElementById('shipmentsListContainer');
    const shipmentsPlaceholder   = document.getElementById('shipmentsPlaceholder');
    const shipmentsSpinner       = document.getElementById('shipmentsSpinner');
    const referenceInput         = document.getElementById('reference');
    const carrierSelect          = document.getElementById('carrier');
    const loadMoreContainer      = document.getElementById('loadMoreContainer');
    const loadMoreButton         = document.getElementById('loadMoreButton');

    // --- STATE ---
    let activeShipmentElement = null;
    let allShipments          = [];
    let currentIndex          = 0;
    const BATCH_SIZE          = 10;

    // --- INIT ---
    function initializeAppLogic(data) {
        if (!data) {
            shipmentsSpinner.classList.add('hidden');
            shipmentsListContainer.innerHTML = `<p class="text-center text-red-500 p-4">Could not load application data. Please refresh.</p>`;
            return;
        }

        shipmentsPlaceholder.classList.add('hidden');
        shipmentsSpinner.classList.remove('hidden');

        const b2b2cData   = Object.values(data.B2B2C   || {});
        const ordersData  = Object.values(data.ORDERS  || {});
        const carrierData = Object.values(data.CARRIERS || {});

        // Populate carrier dropdown
        carrierSelect.innerHTML = '<option value="">Select a carrier</option>';
        carrierData.forEach(carrier => {
            const option = document.createElement('option');
            option.value = carrier.COMPANY_CODE;
            option.textContent = carrier.COMPANY_CODE;
            carrierSelect.appendChild(option);
        });

        // Resolve CONSIGNOR/CONSIGNEE UIDs to names
        const nameLookup = new Map(b2b2cData.map(c => [c.UID, c.NAME]));
        const processed  = ordersData.map(s => ({
            ...s,
            CONSIGNOR: nameLookup.get(s.CONSIGNOR) || s.CONSIGNOR,
            CONSIGNEE: nameLookup.get(s.CONSIGNEE) || s.CONSIGNEE,
        }));

        // Incomplete (no carrier/AWB) first, then complete — both sorted newest first
        const byDate = (a, b) => new Date(b.ORDER_DATE) - new Date(a.ORDER_DATE);
        const incomplete = processed.filter(s => !s.CARRIER || !s.AWB_NUMBER).sort(byDate);
        const complete   = processed.filter(s =>  s.CARRIER && s.AWB_NUMBER).sort(byDate);

        allShipments = [...incomplete, ...complete];
        currentIndex = 0;

        shipmentsSpinner.classList.add('hidden');
        shipmentsListContainer.innerHTML = '';

        if (!allShipments.length) {
            shipmentsListContainer.innerHTML = '<p class="text-center text-gray-500">No shipments found.</p>';
            loadMoreContainer.classList.add('hidden');
            return;
        }

        renderMoreShipments();
    }

    // --- RENDER ---
    function renderMoreShipments() {
        const batch    = allShipments.slice(currentIndex, currentIndex + BATCH_SIZE);
        const fragment = document.createDocumentFragment();

        batch.forEach(shipment => {
            const div = document.createElement('div');
            div.className = shipment.CARRIER && shipment.AWB_NUMBER
                ? 'p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors'
                : 'p-3 border border-amber-300 rounded-lg cursor-pointer bg-amber-50 hover:bg-amber-100 transition-colors';
            div.dataset.referenceId = shipment.REFERENCE;

            const orderDate = shipment.ORDER_DATE
                ? new Date(shipment.ORDER_DATE).toISOString().split('T')[0]
                : 'No Date';

            div.innerHTML = `
                <div class="flex justify-between items-center">
                    <p class="font-semibold text-gray-800">Ref: ${shipment.REFERENCE}</p>
                    <p class="text-xs text-gray-500">${orderDate}</p>
                </div>
                <p class="text-sm text-gray-600 mt-1">From: ${shipment.CONSIGNOR || 'N/A'}</p>
                <p class="text-sm text-gray-600 mt-1">To: ${shipment.CONSIGNEE || 'N/A'} - ${shipment.DEST_CITY || 'N/A'}</p>
                <p class="text-sm text-gray-600 mt-1">Carrier: ${shipment.CARRIER || 'Not Assigned'}</p>
                <p class="text-sm text-gray-600 mt-1">AWB: ${shipment.AWB_NUMBER || 'Not Assigned'}</p>
            `;
            fragment.appendChild(div);
        });

        shipmentsListContainer.appendChild(fragment);
        currentIndex += batch.length;
        updateLoadMoreButton();
    }

    function updateLoadMoreButton() {
        if (currentIndex < allShipments.length) {
            loadMoreContainer.classList.remove('hidden');
        } else {
            loadMoreContainer.classList.add('hidden');
            if (!shipmentsListContainer.querySelector('.end-of-list')) {
                const end = document.createElement('p');
                end.className = 'end-of-list text-center text-xs text-gray-400 py-2';
                end.textContent = 'End of list';
                shipmentsListContainer.appendChild(end);
            }
        }
    }

    // --- FORM SUBMIT ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitButton.disabled = true;
        buttonText.textContent = 'Updating...';
        spinner.classList.remove('hidden');
        responseMessage.classList.add('hidden');

        const reference = referenceInput.value;
        const fields    = {};
        ['ORDER_DATE', 'TRANSIT_DATE', 'CARRIER', 'AWB_NUMBER', 'DYNA_AWB'].forEach(f => {
            const el = form.querySelector(`[name="${f}"]`);
            if (el && el.value) fields[f] = el.value;
        });

        try {
            await updateOrder(reference, fields);

            responseMessage.textContent = 'Order updated successfully.';
            responseMessage.className   = 'mt-4 p-4 text-sm rounded-md bg-green-100 text-green-800';

            if (activeShipmentElement) {
                activeShipmentElement.classList.add('border-green-400', 'bg-green-50');
                setTimeout(() => activeShipmentElement?.classList.remove('border-green-400', 'bg-green-50'), 2000);
                activeShipmentElement = null;
            }

            if (window.verifyAndFetchAppData) window.verifyAndFetchAppData(true);

        } catch (error) {
            responseMessage.textContent = `Error: ${error.message}`;
            responseMessage.className   = 'mt-4 p-4 text-sm rounded-md bg-red-100 text-red-800';
        } finally {
            submitButton.disabled  = false;
            buttonText.textContent = 'Update Order';
            spinner.classList.add('hidden');
            responseMessage.classList.remove('hidden');
        }
    });

    // --- SHIPMENT CLICK ---
    shipmentsListContainer.addEventListener('click', (e) => {
        const el = e.target.closest('[data-reference-id]');
        if (!el) return;

        const refId    = el.dataset.referenceId;
        const shipment = allShipments.find(s => s.REFERENCE == refId);

        if (shipment) {
            referenceInput.value = shipment.REFERENCE || '';
            document.getElementById('order_date').value   = shipment.ORDER_DATE   ? new Date(shipment.ORDER_DATE).toISOString().split('T')[0]   : '';
            document.getElementById('transit_date').value = shipment.TRANSIT_DATE ? new Date(shipment.TRANSIT_DATE).toISOString().split('T')[0] : '';
            carrierSelect.value = shipment.CARRIER   || '';
            document.getElementById('awb_number').value = shipment.AWB_NUMBER || '';
            document.getElementById('dyna_awb').value   = shipment.DYNA_AWB   || '';
        }

        if (activeShipmentElement) {
            activeShipmentElement.classList.remove('bg-indigo-50', 'border-indigo-300');
        }
        el.classList.add('bg-indigo-50', 'border-indigo-300');
        activeShipmentElement = el;
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    loadMoreButton.addEventListener('click', renderMoreShipments);

    // --- DATA EVENTS ---
    window.addEventListener('appDataLoaded',    (e) => initializeAppLogic(e.detail.data));
    window.addEventListener('appDataRefreshed', (e) => initializeAppLogic(e.detail.data));

    // Initial load from IndexedDB
    const waitForDB = async () => {
        if (window.appDB && window.appDB.db) return;
        await new Promise(resolve => {
            const t = setTimeout(resolve, 3000);
            window.addEventListener('indexedDBReady', () => { clearTimeout(t); resolve(); }, { once: true });
        });
    };
    waitForDB().then(async () => {
        const data = await getAppData();
        if (data) initializeAppLogic(data);
    });
});
