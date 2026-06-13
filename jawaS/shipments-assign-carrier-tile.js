// shipments-assign-carrier-tile.js
// Assign Carrier tile logic for Shipments.html
// Namespaced IDs to avoid collisions with the shipments page
// Depends on: core/assign-carrier-api.js (updateOrder)

function initAssignCarrierTile(data) {
    if (!data) return;

    // --- DOM refs ---
    const form            = document.getElementById('ac-form');
    const submitButton    = document.getElementById('ac-submit-btn');
    const buttonText      = document.getElementById('ac-btn-text');
    const spinner         = document.getElementById('ac-spinner');
    const responseMessage = document.getElementById('ac-response');
    const placeholder     = document.getElementById('ac-placeholder');
    const listEl          = document.getElementById('ac-list');
    const searchInput     = document.getElementById('ac-search');
    const referenceInput  = document.getElementById('ac-reference');
    const carrierSelect   = document.getElementById('ac-carrier');
    const emptyView       = document.getElementById('ac-empty-view');
    const formView        = document.getElementById('ac-form-view');
    const mainPane        = document.getElementById('ac-form-pane');
    const aside           = document.getElementById('ac-list-pane');
    const backToListBtn   = document.getElementById('ac-back-to-list');
    const backToTilesBtn  = document.getElementById('ac-back-to-tiles-btn');

    // --- STATE ---
    let allShipments = [];
    let activeEl     = null;

    // --- Build carrier options ---
    const carrierData = Object.values(data.CARRIERS || {});
    carrierSelect.innerHTML = '<option value="">Select a carrier</option>';
    carrierData.forEach(c => {
        const o = document.createElement('option');
        o.value = c.COMPANY_CODE;
        o.textContent = c.COMPANY_CODE;
        carrierSelect.appendChild(o);
    });

    // --- Name lookup ---
    const b2b2cData   = Object.values(data.B2B2C || {});
    const ordersData  = Object.values(data.ORDERS  || {});
    const nameLookup  = new Map(b2b2cData.map(c => [c.UID, c.NAME]));
    const processed   = ordersData.map(s => ({
        ...s,
        CONSIGNOR: nameLookup.get(s.CONSIGNOR) || s.CONSIGNOR,
        CONSIGNEE: nameLookup.get(s.CONSIGNEE) || s.CONSIGNEE,
    }));

    // --- Filter incomplete (no carrier OR no AWB) ---
    const byDate   = (a, b) => (parseDate(b.ORDER_DATE)?.getTime() || 0) - (parseDate(a.ORDER_DATE)?.getTime() || 0);
    const cutoff   = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent   = processed.filter(s => (parseDate(s.ORDER_DATE)?.getTime() || 0) >= cutoff);
    const incomplete = recent.filter(s => !s.CARRIER || !s.AWB_NUMBER).sort(byDate);
    const complete   = recent.filter(s =>  s.CARRIER && s.AWB_NUMBER).sort(byDate);
    allShipments     = [...incomplete, ...complete];

    // --- RENDER ---
    function renderList(orders) {
        listEl.innerHTML = '';
        if (!orders.length) {
            listEl.innerHTML = '<li class="text-center text-gray-500 border-none cursor-default">No shipments found.</li>';
            placeholder.classList.add('hidden');
            listEl.classList.remove('hidden');
            return;
        }
        orders.forEach(order => {
            const ref = order.REFERENCE;
            if (!ref) return;
            const li = document.createElement('li');
            const inc = !order.CARRIER || !order.AWB_NUMBER;
            if (inc) li.classList.add('incomplete');
            li.innerHTML = [
                `<strong>${order.AWB_NUMBER || 'No AWB'}</strong>`,
                `<span class="sv-item-sub">${order.CONSIGNOR || 'Unknown'} → ${order.CONSIGNEE || 'Unknown'}</span>`,
                `<div class="sv-item-meta"><span>Ref: ${ref} | ${fmtDate(order.ORDER_DATE)}</span><span>${order.CARRIER || 'No Carrier'}</span></div>`,
            ].join('');
            li.dataset.ref = ref;
            li.addEventListener('click', () => selectShipment(order, li));
            listEl.appendChild(li);
        });
        placeholder.classList.add('hidden');
        listEl.classList.remove('hidden');
    }

    renderList(allShipments);

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
        document.getElementById('ac-order-date').value   = fmtDate(shipment.ORDER_DATE, 'input');
        document.getElementById('ac-transit-date').value = shipment.TRANSIT_DATE && shipment.TRANSIT_DATE !== 0 ? fmtDate(shipment.TRANSIT_DATE, 'input') : '';
        carrierSelect.value = shipment.CARRIER    || '';
        document.getElementById('ac-awb').value      = shipment.AWB_NUMBER || '';
        document.getElementById('ac-dyna-awb').value = shipment.DYNA_AWB   || '';

        emptyView.classList.add('hidden');
        formView.classList.remove('hidden');
        mainPane.classList.remove('hidden');
        aside.classList.add('hidden');
        aside.classList.add('md:flex');
    }

    // mobile back-to-list
    backToListBtn.addEventListener('click', () => {
        mainPane.classList.add('hidden');
        aside.classList.remove('hidden');
    });

    // back-to-tiles
    backToTilesBtn.addEventListener('click', () => {
        document.getElementById('assignCarrierView').style.display = 'none';
        document.getElementById('tilesView').style.display = 'flex';
    });

    // --- FORM SUBMIT ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitButton.disabled  = true;
        buttonText.textContent = 'Updating...';
        spinner.classList.remove('hidden');
        responseMessage.classList.add('hidden');

        const reference = referenceInput.value;
        const fields    = {};
        const fieldNames = [
            { name: 'ORDER_DATE',   el: document.getElementById('ac-order-date') },
            { name: 'TRANSIT_DATE', el: document.getElementById('ac-transit-date') },
            { name: 'CARRIER',      el: document.getElementById('ac-carrier') },
            { name: 'AWB_NUMBER',   el: document.getElementById('ac-awb') },
            { name: 'DYNA_AWB',     el: document.getElementById('ac-dyna-awb') },
        ];
        fieldNames.forEach(({ name, el }) => {
            if (!el || !el.value) return;
            if (name === 'ORDER_DATE' || name === 'TRANSIT_DATE') {
                const ms = toUnix(el.value);
                if (ms) fields[name] = ms;
            } else {
                fields[name] = el.value;
            }
        });

        try {
            await updateOrder(reference, fields);
            responseMessage.textContent = 'Order updated successfully.';
            responseMessage.className   = 'mt-4 p-4 text-sm rounded-md bg-green-100 text-green-800';
            if (activeEl) {
                activeEl.classList.add('border-green-400', 'bg-green-50');
                setTimeout(() => activeEl?.classList.remove('border-green-400', 'bg-green-50'), 2000);
            }
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
}
