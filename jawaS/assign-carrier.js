// jawaS/assign-carrier.js
// AssignCarrier.html page logic
// Depends on: core/assign-carrier-api.js (updateOrder)

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM ---
    const form            = document.getElementById('partialUpdateForm');
    const submitButton    = document.getElementById('submitButton');
    const buttonText      = document.getElementById('buttonText');
    const spinner         = document.getElementById('spinner');
    const responseMessage = document.getElementById('responseMessage');
    const placeholder     = document.getElementById('shipmentsPlaceholder');
    const listEl          = document.getElementById('shipmentsList');
    const searchInput     = document.getElementById('searchShipments');
    const referenceInput  = document.getElementById('reference');
    const carrierSelect   = document.getElementById('carrier');

    // --- STATE ---
    let allShipments      = [];
    let activeEl          = null;

    // --- INIT ---
    function initializeAppLogic(data) {
        if (!data) { placeholder.textContent = 'Could not load data. Please refresh.'; return; }

        const b2b2cData   = Object.values(data.B2B2C   || {});
        const ordersData  = Object.values(data.ORDERS  || {});
        const carrierData = Object.values(data.CARRIERS || {});

        carrierSelect.innerHTML = '<option value="">Select a carrier</option>';
        carrierData.forEach(c => {
            const o = document.createElement('option');
            o.value = c.COMPANY_CODE; o.textContent = c.COMPANY_CODE;
            carrierSelect.appendChild(o);
        });

        const nameLookup = new Map(b2b2cData.map(c => [c.UID, c.NAME]));
        const processed  = ordersData.map(s => ({
            ...s,
            CONSIGNOR: nameLookup.get(s.CONSIGNOR) || s.CONSIGNOR,
            CONSIGNEE: nameLookup.get(s.CONSIGNEE) || s.CONSIGNEE,
        }));

        const byDate = (a, b) => (parseDate(b.ORDER_DATE)?.getTime() || 0) - (parseDate(a.ORDER_DATE)?.getTime() || 0);
        const incomplete = processed.filter(s => !s.CARRIER || !s.AWB_NUMBER).sort(byDate);
        const complete   = processed.filter(s =>  s.CARRIER && s.AWB_NUMBER).sort(byDate);
        allShipments     = [...incomplete, ...complete];

        renderList(allShipments);
    }

    // --- RENDER ---
    function renderList(orders) {
        listEl.innerHTML = '';
        if (!orders.length) {
            listEl.innerHTML = `<li class="text-center text-gray-500 border-none cursor-default">No shipments found.</li>`;
            placeholder.classList.add('hidden');
            listEl.classList.remove('hidden');
            return;
        }
        orders.forEach(order => {
            const ref = order.REFERENCE; if (!ref) return;
            const li  = document.createElement('li');
            const incomplete = !order.CARRIER || !order.AWB_NUMBER;
            if (incomplete) li.classList.add('incomplete');
            li.innerHTML = `<strong>${order.AWB_NUMBER || 'No AWB'}</strong><span class="client-info">${order.CONSIGNOR || 'Unknown'} → ${order.CONSIGNEE || 'Unknown'}</span><div class="details-info"><span>Ref: ${ref} | ${fmtDate(order.ORDER_DATE)}</span><span>${order.CARRIER || 'No Carrier'}</span></div>`;
            li.dataset.ref = ref;
            li.addEventListener('click', () => selectShipment(order, li));
            listEl.appendChild(li);
        });
        placeholder.classList.add('hidden');
        listEl.classList.remove('hidden');
    }

    // --- SEARCH ---
    searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        const filtered = allShipments.filter(s =>
            String(s.REFERENCE  || '').toLowerCase().includes(q) ||
            String(s.AWB_NUMBER || '').toLowerCase().includes(q) ||
            (s.CONSIGNOR || '').toLowerCase().includes(q) ||
            (s.CONSIGNEE || '').toLowerCase().includes(q)
        );
        renderList(filtered);
    });

    // --- SELECT ---
    function selectShipment(shipment, li) {
        if (activeEl) activeEl.classList.remove('selected');
        li.classList.add('selected');
        activeEl = li;

        referenceInput.value = shipment.REFERENCE || '';
        document.getElementById('order_date').value = fmtDate(shipment.ORDER_DATE, 'input');
        document.getElementById('transit_date').value = shipment.TRANSIT_DATE ? new Date(shipment.TRANSIT_DATE).toISOString().split('T')[0] : '';
        carrierSelect.value = shipment.CARRIER    || '';
        document.getElementById('awb_number').value = shipment.AWB_NUMBER || '';
        document.getElementById('dyna_awb').value   = shipment.DYNA_AWB   || '';
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // --- FORM SUBMIT ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitButton.disabled  = true;
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
            if (activeEl) { activeEl.classList.add('border-green-400', 'bg-green-50'); setTimeout(() => activeEl?.classList.remove('border-green-400', 'bg-green-50'), 2000); }
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

    // --- DATA EVENTS ---
    window.addEventListener('appDataLoaded',    e => initializeAppLogic(e.detail.data));
    window.addEventListener('appDataRefreshed', e => initializeAppLogic(e.detail.data));

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
