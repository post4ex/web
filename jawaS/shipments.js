// ============================================================================
// SHIPMENTS.JS — Page Logic for Shipments.html
// ============================================================================

// --- GLOBAL STATE ---
let allOrders       = [];
let currentSelectedRef = null;
let b2b2cDataMap    = new Map(); // UID → B2B2C record
let productDataMap  = new Map(); // REFERENCE → [products]
let multiboxDataMap = new Map(); // REFERENCE → [boxes]
let uploadsDataMap  = new Map(); // REFERENCE → [uploads]
let modesDataMap    = new Map(); // SHORT → MODE name
let carriersDataMap = new Map(); // COMPANY_CODE → COMPANY_NAME

let ui = {};

// --- SHARED DOC ACTION BUTTONS ---
const _docIco = {
    print:    `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>`,
    mail:     `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`,
    download: `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>`,
    whatsapp: `<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
    telegram: `<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
};

function _uploadActionBtns(url, uploadUid) {
    const cls = (extra = '') => `doc-action-btn${extra ? ' ' + extra : ''}`;
    return [
        `<a href="${url}" target="_blank" title="Print"    class="${cls()}">${_docIco.print}</a>`,
        `<a href="${url}" target="_blank" title="Mail"     class="${cls()}">${_docIco.mail}</a>`,
        `<a href="${url}" target="_blank" title="Download" class="${cls()}" download>${_docIco.download}</a>`,
        `<a href="${url}" target="_blank" title="WhatsApp" class="${cls('doc-action-btn--wa')}">${_docIco.whatsapp}</a>`,
        `<a href="${url}" target="_blank" title="Telegram" class="${cls('doc-action-btn--tg')}">${_docIco.telegram}</a>`,
        `<button onclick="console.warn('delete upload not implemented', '${uploadUid}')" title="Delete" class="p-1.5 text-red-400 rounded hover:bg-red-50"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>`,
    ].join('');
}

// --- DATA INITIALIZATION ---
function initializePageWithData(appData) {
    if (!appData || !appData.ORDERS) {
        ui.statusMessage.textContent = 'No shipment data found.';
        return;
    }
    try {
        allOrders = Object.values(appData.ORDERS);
        allOrders.sort((a, b) => new Date(b.ORDER_DATE) - new Date(a.ORDER_DATE));

        b2b2cDataMap.clear(); productDataMap.clear(); multiboxDataMap.clear();
        uploadsDataMap.clear(); modesDataMap.clear(); carriersDataMap.clear();

        if (appData.B2B2C)
            Object.values(appData.B2B2C).forEach(c => b2b2cDataMap.set(c.UID, c));

        if (appData.PRODUCTS)
            Object.values(appData.PRODUCTS).forEach(p => {
                const r = p.REFERENCE; if (!r) return;
                if (!productDataMap.has(r)) productDataMap.set(r, []);
                productDataMap.get(r).push(p);
            });

        if (appData.MULTIBOX)
            Object.values(appData.MULTIBOX).forEach(b => {
                const r = b.REFERENCE; if (!r) return;
                if (!multiboxDataMap.has(r)) multiboxDataMap.set(r, []);
                multiboxDataMap.get(r).push(b);
            });

        if (appData.UPLOADS)
            Object.values(appData.UPLOADS).forEach(u => {
                const r = u.REFERENCE; if (!r) return;
                if (!uploadsDataMap.has(r)) uploadsDataMap.set(r, []);
                uploadsDataMap.get(r).push(u);
            });

        if (appData.MODES)
            Object.values(appData.MODES).forEach(m => modesDataMap.set(m.SHORT, m.MODE));

        if (appData.CARRIERS)
            Object.values(appData.CARRIERS).forEach(c => carriersDataMap.set(c.COMPANY_CODE, c.COMPANY_NAME));

        populateFilters(allOrders);
        setupFilterListeners();
        applyFilters();
        ui.statusMessage.textContent = '';
    } catch (err) {
        ui.statusMessage.textContent = 'Failed to process data.';
        console.error('Data processing error:', err);
    }
}

async function loadFromIndexedDB() {
    try {
        await new Promise(resolve => {
            if (window.appDB && window.appDB.db) return resolve();
            window.addEventListener('indexedDBReady', resolve, { once: true });
            setTimeout(resolve, 5000);
        });
        const appData = await getAppData();
        if (appData && appData.ORDERS && Object.keys(appData.ORDERS).length > 0) {
            initializePageWithData(appData);
        } else {
            ui.statusMessage.textContent = 'No data yet — syncing...';
        }
    } catch (err) {
        ui.statusMessage.textContent = 'Error loading data.';
        console.error(err);
    }
}

// --- FILTERS ---
function populateFilters(orders) {
    ui.filterBranch.length = 1; ui.filterCode.length = 1; ui.filterCarrier.length = 1;
    const branches = [...new Set(orders.map(o => o.BRANCH).filter(Boolean))];
    const codes    = [...new Set(orders.map(o => o.CODE).filter(Boolean))];
    const carriers = [...new Set(orders.map(o => o.CARRIER).filter(Boolean))];
    branches.sort().forEach(v => ui.filterBranch.add(new Option(v, v)));
    codes.sort().forEach(v => ui.filterCode.add(new Option(v, v)));
    carriers.sort().forEach(v => ui.filterCarrier.add(new Option(v, v)));
}

function setupFilterListeners() {
    ui.searchShipments.addEventListener('input', applyFilters);
    ui.filterToggleBtn.addEventListener('click', () => ui.filterModal.classList.remove('hidden'));
    ui.applyFiltersBtn.addEventListener('click', () => { applyFilters(); ui.filterModal.classList.add('hidden'); });
    ui.resetFiltersBtn.addEventListener('click', () => {
        ui.filterStartDate.value = ''; ui.filterEndDate.value = '';
        ui.filterBranch.value = ''; ui.filterCode.value = ''; ui.filterCarrier.value = '';
        applyFilters();
    });
    ui.filterModal.addEventListener('click', e => { if (e.target === ui.filterModal) ui.filterModal.classList.add('hidden'); });
}

function applyFilters() {
    let startDate = ui.filterStartDate.value;
    let endDate   = ui.filterEndDate.value;
    const branch  = ui.filterBranch.value;
    const code    = ui.filterCode.value;
    const carrier = ui.filterCarrier.value;
    const searchTerm = ui.searchShipments.value.toLowerCase();

    const isAnyFilterApplied = startDate || endDate || branch || code || carrier || searchTerm;
    let statusText = `Displaying {count} of ${allOrders.length} records.`;

    if (!isAnyFilterApplied) {
        const today = new Date(); const currentDay = today.getDate(); let firstDay;
        if (currentDay <= 10 && today.getMonth() > 0)
            firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        else if (currentDay <= 10 && today.getMonth() === 0)
            firstDay = new Date(today.getFullYear() - 1, 11, 1);
        else
            firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        startDate  = firstDay.toISOString().split('T')[0];
        statusText = `Displaying {count} of ${allOrders.length} records (default view from ${startDate}).`;
    }

    const filteredOrders = allOrders.filter(order => {
        const orderDate = order.ORDER_DATE ? new Date(order.ORDER_DATE) : null;
        if (!orderDate) return false;
        const sdMatch  = !startDate || orderDate >= new Date(startDate + 'T00:00:00Z');
        const edMatch  = !endDate   || orderDate <= new Date(endDate   + 'T23:59:59Z');
        const bMatch   = !branch    || order.BRANCH  === branch;
        const cMatch   = !code      || order.CODE    === code;
        const carMatch = !carrier   || order.CARRIER === carrier;
        const sMatch   = !searchTerm ||
            String(order.REFERENCE  || '').toLowerCase().includes(searchTerm) ||
            String(order.AWB_NUMBER || '').toLowerCase().includes(searchTerm) ||
            (order.CONSIGNOR || '').toLowerCase().includes(searchTerm) ||
            (order.CONSIGNEE || '').toLowerCase().includes(searchTerm);
        return sdMatch && edMatch && bMatch && cMatch && carMatch && sMatch;
    });

    renderShipmentList(filteredOrders);
    ui.statusMessage.textContent = statusText.replace('{count}', filteredOrders.length);

    if (isMobileView()) {
        ui.shipmentListPane.classList.remove('hidden');
        ui.shipmentDetailPane.classList.add('hidden');
        if (currentSelectedRef && !filteredOrders.find(o => o.REFERENCE === currentSelectedRef))
            currentSelectedRef = null;
    } else {
        if (currentSelectedRef) {
            const currentOrder = filteredOrders.find(o => o.REFERENCE === currentSelectedRef);
            if (currentOrder)
                handleShipmentSelection(currentSelectedRef, ui.shipmentList.querySelector(`li[data-ref="${currentSelectedRef}"]`));
            else {
                currentSelectedRef = null;
                ui.emptyView.classList.remove('hidden');
                ui.detailView.classList.add('hidden');
            }
        } else {
            ui.emptyView.classList.remove('hidden');
            ui.detailView.classList.add('hidden');
        }
    }
}

// --- RENDER LIST ---
function renderShipmentList(orders) {
    ui.shipmentList.innerHTML = '';
    if (orders.length === 0) {
        ui.shipmentList.innerHTML = `<li class="text-center text-gray-500 border-none hover:bg-transparent cursor-default">No orders match filters.</li>`;
        return;
    }
    orders.forEach(order => {
        const ref = order.REFERENCE; if (!ref) return;
        const li  = document.createElement('li');
        li.innerHTML = `<strong>${order.AWB_NUMBER || 'No AWB'}</strong><span class="client-info">${order.CONSIGNOR || 'Unknown'} → ${order.CONSIGNEE || 'Unknown'}</span><div class="details-info"><span>Ref: ${ref} | ${fmtDate(order.ORDER_DATE)}</span></div>`;
        li.dataset.ref = ref;
        li.addEventListener('click', () => handleShipmentSelection(ref, li));
        if (String(ref) === String(currentSelectedRef)) li.classList.add('selected');
        ui.shipmentList.appendChild(li);
    });
}

// --- MOBILE HELPERS ---
const isMobileView = () => window.innerWidth < 768;

function showDetailView() {
    if (isMobileView()) {
        ui.shipmentListPane.classList.add('hidden');
        ui.shipmentDetailPane.classList.remove('hidden');
    }
    ui.emptyView.classList.add('hidden');
    ui.detailView.classList.remove('hidden');
}

// --- SELECTION HANDLER ---
function handleShipmentSelection(ref, selectedLi) {
    currentSelectedRef = ref;
    ui.shipmentList.querySelectorAll('li.selected').forEach(li => li.classList.remove('selected'));
    if (selectedLi) selectedLi.classList.add('selected');

    const order = allOrders.find(o => o.REFERENCE === ref);
    if (!order) {
        ui.emptyView.classList.remove('hidden');
        ui.detailView.classList.add('hidden');
        return;
    }

    renderDocumentCenter(order);
    renderShipmentDetails(order);
    const cnor = b2b2cDataMap.get(order.CONSIGNOR) || {};
    const cnee = b2b2cDataMap.get(order.CONSIGNEE) || {};
    renderPartyDetails('Consignor', cnor.NAME || order.CONSIGNOR, order.ORIGIN_CITY, cnor.PINCODE || order.ORIGIN_PINCODE, cnor.ADDRESS || '', cnor.MOBILE || '', ui.consignorDetailsContainer);
    renderPartyDetails('Consignee', cnee.NAME || order.CONSIGNEE, order.DEST_CITY,   cnee.PINCODE || order.DEST_PINCODE,   cnee.ADDRESS || '', cnee.MOBILE || '', ui.consigneeDetailsContainer);
    renderProductAndBoxDetails(order);

    const toggleBtn = document.getElementById('toggleUploadsBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const uploadsDiv = document.getElementById('uploadsContainer');
            const icon = toggleBtn.querySelector('svg');
            if (uploadsDiv) uploadsDiv.classList.toggle('hidden');
            if (icon) icon.classList.toggle('rotate-180');
        });
    }

    renderTrackingStatus(order);
    renderTrackingHistory(order);
    showDetailView();
}

// --- RENDER: SHIPMENT DETAILS ---
function renderShipmentDetails(order) {
    const carrier = carriersDataMap.get(order.CARRIER) || order.CARRIER || 'N/A';
    const mode    = modesDataMap.get(order.MODE) || order.MODE || 'N/A';
    const d = [
        {l:'Carrier',   v:carrier},       {l:'Mode',      v:mode},
        {l:'TAT',       v:order.TAT},      {l:'Zone',      v:order.ZONE},
        {l:'Wt(kg)',    v:order.WEIGHT},   {l:'ChgWt(kg)', v:order.CHG_WT},
        {l:'Pcs',       v:order.PIECS},    {l:'Value',     v:order.VALUE},
        {l:'COD',       v:order.COD},      {l:'ToPay',     v:order.TOPAY},
        {l:'FOV',       v:order.FOV},      {l:'Global',    v:order.GLOBAL}
    ];
    const visible = d.filter(i => i.v !== undefined && i.v !== null && i.v !== '');
    let h = `<table class="w-full text-xs border-collapse border border-gray-200">`;
    for (let i = 0; i < visible.length; i += 2) {
        const a = visible[i], b = visible[i + 1];
        h += `<tr>`;
        h += `<td class="border border-gray-200 px-2 py-1 text-gray-500 bg-gray-50 w-1/4">${a.l}</td>`;
        h += `<td class="border border-gray-200 px-2 py-1 font-semibold text-gray-800 w-1/4">${a.v}</td>`;
        if (b) {
            h += `<td class="border border-gray-200 px-2 py-1 text-gray-500 bg-gray-50 w-1/4">${b.l}</td>`;
            h += `<td class="border border-gray-200 px-2 py-1 font-semibold text-gray-800 w-1/4">${b.v}</td>`;
        } else {
            h += `<td class="border border-gray-200 px-2 py-1" colspan="2"></td>`;
        }
        h += `</tr>`;
    }
    h += `</table>`;

    const loginData = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.LOGIN) || '{}');
    const userRole  = loginData.ROLE || loginData.userData?.ROLE || 'GUEST';
    const canDelete = (ROLE_LEVELS[userRole] || 0) >= ROLE_LEVELS['ADMIN'];

    const editBtn = `<button id="editOrderBtn" title="Edit" class="p-1.5 text-gray-500 rounded hover:bg-gray-100"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>`;
    const mailBtn = `<button id="mailOrderBtn" title="Email" class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.mail}</button>`;
    const waBtn   = `<button id="waOrderBtn"   title="WhatsApp" class="p-1.5 doc-action-btn--wa rounded hover:bg-green-50">${_docIco.whatsapp}</button>`;
    const tgBtn   = `<button id="tgOrderBtn"   title="Telegram" class="p-1.5 doc-action-btn--tg rounded hover:bg-blue-50">${_docIco.telegram}</button>`;
    const delBtn  = canDelete ? `<button id="deleteOrderBtn" title="Delete" class="p-1.5 text-red-500 rounded hover:bg-red-50"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : '';

    ui.shipmentDetailsContainer.innerHTML = `<div class="detail-card-header flex justify-between items-center"><h3 class="font-semibold text-gray-700">Shipment Details</h3><div class="flex items-center gap-0.5">${editBtn}${mailBtn}${waBtn}${tgBtn}${delBtn}</div></div><div class="detail-card-body">${h}</div>`;

    document.getElementById('editOrderBtn').addEventListener('click', () => {
        sessionStorage.setItem('editOrderRef', order.REFERENCE);
        window.location.href = 'BookOrder.html';
    });
    document.getElementById('mailOrderBtn').addEventListener('click', () => showNotification('Email not implemented yet.', 'info'));
    document.getElementById('waOrderBtn').addEventListener('click',   () => showNotification('WhatsApp not implemented yet.', 'info'));
    document.getElementById('tgOrderBtn').addEventListener('click',   () => showNotification('Telegram not implemented yet.', 'info'));

    if (canDelete) {
        document.getElementById('deleteOrderBtn').addEventListener('click', async () => {
            if (!confirm(`Delete order ${order.REFERENCE}? This cannot be undone.`)) return;
            try {
                await deleteOrder(order.REFERENCE);
                showNotification(`✅ Order ${order.REFERENCE} deleted`, 'success');
                currentSelectedRef = null;
                ui.detailView.classList.add('hidden');
                ui.emptyView.classList.remove('hidden');
            } catch (err) {
                showNotification(`❌ Delete failed: ${err.message}`, 'error');
            }
        });
    }
}

// --- RENDER: TRACKING STATUS ---
function renderTrackingStatus(order) {
    const h = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div><div class="text-gray-500 text-xs">Order Date</div><div class="font-semibold text-gray-800">${fmtDate(order.ORDER_DATE)}</div></div>
        <div><div class="text-gray-500 text-xs">Transit Date</div><div class="font-semibold text-gray-800">${fmtDate(order.TRANSIT_DATE)}</div></div>
        <div><div class="text-gray-500 text-xs">Invoice Date</div><div class="font-semibold text-gray-800">${fmtDate(order.INVOICE_DATE)}</div></div>
    </div>`;
    ui.trackingStatusContainer.innerHTML = `<div class="detail-card-header flex justify-between items-center">
        <h3 class="font-semibold text-gray-700">Tracking Status</h3>
        <div class="flex items-center gap-0.5">
            <button onclick="console.warn('ticket not implemented')" title="Ticket"   class="p-1.5 text-gray-500 rounded hover:bg-gray-100"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/></svg></button>
            <button onclick="console.warn('mark not implemented')"   title="Mark"    class="p-1.5 text-gray-500 rounded hover:bg-gray-100"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>
            <button onclick="console.warn('mail tracking not implemented')"  title="Mail"     class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.mail}</button>
            <button onclick="console.warn('wa tracking not implemented')"    title="WhatsApp" class="p-1.5 doc-action-btn--wa rounded hover:bg-green-50">${_docIco.whatsapp}</button>
            <button onclick="console.warn('tg tracking not implemented')"    title="Telegram" class="p-1.5 doc-action-btn--tg rounded hover:bg-blue-50">${_docIco.telegram}</button>
        </div>
    </div><div class="detail-card-body">${h}</div>`;
}

// --- RENDER: PARTY DETAILS ---
function renderPartyDetails(label, name, city, pincode, state, mobile, container) {
    const d = [{l:'Name',v:name},{l:'City',v:city},{l:'Pincode',v:pincode},{l:'State',v:state},{l:'Mobile',v:mobile}];
    let h = `<div class="space-y-2 text-sm">`;
    d.forEach(i => {
        if (i.v) h += `<div class="flex justify-between"><span class="text-gray-500">${i.l}:</span><span class="font-medium text-right">${i.v}</span></div>`;
    });
    h += `</div>`;
    container.innerHTML = `<div class="detail-card-header"><h3 class="font-semibold text-gray-700">${label} Details</h3></div><div class="detail-card-body">${h}</div>`;
}

// --- RENDER: TRACKING HISTORY ---
function renderTrackingHistory(order) {
    ui.trackingHistoryContainer.innerHTML = `<div class="detail-card-header"><h3 class="font-semibold text-gray-700">Tracking History</h3></div><div class="detail-card-body"><p class="text-sm text-gray-500">Tracking history not available.</p></div>`;
}

// --- RENDER: PRODUCT, BOX & UPLOADS ---
function renderProductAndBoxDetails(order) {
    const r = order.REFERENCE;
    const p = productDataMap.get(r)  || [];
    const b = multiboxDataMap.get(r) || [];
    const u = uploadsDataMap.get(r)  || [];
    let h_body = '';

    if (p.length === 0 && b.length === 0 && u.length === 0) {
        h_body = `<p class="text-sm text-gray-500">No product, box, or upload details.</p>`;
    } else {
        h_body = `<div class="grid grid-cols-1 md:grid-cols-2 gap-6">`;

        // Products
        if (p.length > 0) {
            h_body += `<div><h4 class="font-medium text-sm mb-2 text-gray-600">Product</h4>`;
            h_body += `<div class="space-y-2 text-sm sm:hidden">`;
            p.forEach(i => {
                const docUpload  = u.find(up => up.UPLOAD_TYPE === 'Product' && up.DOC_NUMBER === i.DOC_NUMBER && up.DOC_TYPE?.toUpperCase() !== 'EWB');
                const ewayUpload = u.find(up => up.UPLOAD_TYPE === 'Product' && up.DOC_NUMBER === i.EWAY_IF    && up.DOC_TYPE?.toUpperCase() === 'EWB');
                const docCell    = docUpload  ? `<a href="${docUpload.FILE_URL}"  target="_blank" class="text-blue-600 hover:underline">${i.DOC_NUMBER||'N/A'}</a>`  : (i.DOC_NUMBER||'N/A');
                const ewayCell   = ewayUpload ? `<a href="${ewayUpload.FILE_URL}" target="_blank" class="text-blue-600 hover:underline">${i.EWAY_IF||'N/A'}</a>` : (i.EWAY_IF||'N/A');
                h_body += `<div class="p-3 bg-gray-50 rounded-md border">
                    <div class="font-semibold text-gray-800">${i.PRODUCT||'N/A'}</div>
                    <div class="flex justify-between mt-1 pt-1 border-t"><span class="text-gray-500">Doc#:</span><span class="font-medium text-gray-700">${docCell}</span></div>
                    <div class="flex justify-between mt-1"><span class="text-gray-500">EWay:</span><span class="font-medium text-gray-700">${ewayCell}</span></div>
                    <div class="flex justify-between mt-1"><span class="text-gray-500">Amt:</span><span class="font-medium text-gray-700">${i.AMOUNT?i.AMOUNT.toFixed(2):'0.00'}</span></div>
                </div>`;
            });
            h_body += `</div>`;
            h_body += `<div class="hidden sm:block border rounded-md overflow-hidden"><table class="min-w-full text-xs divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Product</th><th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Doc#</th><th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">EWay</th><th class="px-2 py-1 text-right font-medium text-gray-500 uppercase">Amt</th></tr></thead><tbody class="bg-white divide-y divide-gray-200">`;
            p.forEach(i => {
                const docUpload  = u.find(up => up.UPLOAD_TYPE === 'Product' && up.DOC_NUMBER === i.DOC_NUMBER && up.DOC_TYPE?.toUpperCase() !== 'EWB');
                const ewayUpload = u.find(up => up.UPLOAD_TYPE === 'Product' && up.DOC_NUMBER === i.EWAY_IF    && up.DOC_TYPE?.toUpperCase() === 'EWB');
                const docCell    = docUpload  ? `<a href="${docUpload.FILE_URL}"  target="_blank" class="text-blue-600 hover:underline">${i.DOC_NUMBER||'N/A'}</a>`  : (i.DOC_NUMBER||'N/A');
                const ewayCell   = ewayUpload ? `<a href="${ewayUpload.FILE_URL}" target="_blank" class="text-blue-600 hover:underline">${i.EWAY_IF||'N/A'}</a>` : (i.EWAY_IF||'N/A');
                h_body += `<tr><td class="px-2 py-1">${i.PRODUCT||'N/A'}</td><td class="px-2 py-1">${docCell}</td><td class="px-2 py-1">${ewayCell}</td><td class="px-2 py-1 text-right">${i.AMOUNT?i.AMOUNT.toFixed(2):'0.00'}</td></tr>`;
            });
            h_body += `</tbody></table></div></div>`;
        } else {
            h_body += `<div><h4 class="font-medium text-sm mb-2 text-gray-600">Product</h4><p class="text-xs text-gray-500">None</p></div>`;
        }

        // Multibox
        if (b.length > 0) {
            h_body += `<div><h4 class="font-medium text-sm mb-2 text-gray-600">MultiBox</h4>`;
            h_body += `<div class="space-y-2 text-sm sm:hidden">`;
            b.forEach(i => {
                const lbh = `${parseFloat(i.LENGTH)||0}*${parseFloat(i.BREADTH)||0}*${parseFloat(i.HIGHT)||0}`;
                h_body += `<div class="p-3 bg-gray-50 rounded-md border">
                    <div class="font-semibold text-gray-800">Box#: ${i.BOX_NUM||'N/A'}</div>
                    <div class="flex justify-between mt-1 pt-1 border-t"><span class="text-gray-500">Weight:</span><span class="font-medium text-gray-700">${i.WEIGHT||0}</span></div>
                    <div class="flex justify-between mt-1"><span class="text-gray-500">L*B*H:</span><span class="font-medium text-gray-700">${lbh}</span></div>
                    <div class="flex justify-between mt-1"><span class="text-gray-500">Chg Wt:</span><span class="font-medium text-gray-700">${(i.CHG_WT||0).toFixed(2)}</span></div>
                </div>`;
            });
            h_body += `</div>`;
            h_body += `<div class="hidden sm:block border rounded-md overflow-hidden"><table class="min-w-full text-xs divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Weight</th><th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">L*B*H</th><th class="px-2 py-1 text-right font-medium text-gray-500 uppercase">Chg Wt</th><th class="px-2 py-1 text-right font-medium text-gray-500 uppercase">Box#</th></tr></thead><tbody class="bg-white divide-y divide-gray-200">`;
            b.forEach(i => {
                const lbh = `${parseFloat(i.LENGTH)||0}*${parseFloat(i.BREADTH)||0}*${parseFloat(i.HIGHT)||0}`;
                h_body += `<tr><td class="px-2 py-1">${i.WEIGHT||0}</td><td class="px-2 py-1">${lbh}</td><td class="px-2 py-1 text-right">${(i.CHG_WT||0).toFixed(2)}</td><td class="px-2 py-1 text-right">${i.BOX_NUM||'N/A'}</td></tr>`;
            });
            h_body += `</tbody></table></div></div>`;
        } else {
            h_body += `<div><h4 class="font-medium text-sm mb-2 text-gray-600">MultiBox</h4><p class="text-xs text-gray-500">None</p></div>`;
        }

        h_body += `</div>`;

        // Uploads
        if (u.length > 0) {
            h_body += `<div id="uploadsContainer"><hr class="my-4"><h4 class="font-medium text-sm mb-2 text-gray-600">Uploads</h4>`;
            h_body += `<div class="space-y-2 text-sm sm:hidden">`;
            u.forEach(up => {
                const ud  = fmtDate(up.TIME_STAMP, 'full');
                const idt = up.AWB_NUMBER || up.KYC_NUMBER || up.REFERENCE;
                let det = '';
                if (up.UPLOAD_TYPE==='MultiBox')  det = `Child:${up.CHILD_AWB||'N/A'}`;
                else if (up.UPLOAD_TYPE==='KYC')  det = `${up.CUSTOMER_UID||'N/A'}(${up.KYC_TYPE||'N/A'})`;
                else if (up.UPLOAD_TYPE==='Product') det = `${up.DOC_NUMBER||'N/A'}(${up.DOC_TYPE||'N/A'})`;
                else det = up.STATUS_REMARK || 'N/A';
                h_body += `<div class="p-3 bg-gray-50 rounded-md border">
                    <div class="flex justify-between items-center">
                        <span class="font-semibold text-gray-800">${up.UPLOAD_TYPE||'N/A'}</span>
                        <span class="text-xs text-gray-500">${ud}</span>
                    </div>
                    <div class="flex justify-between mt-1 pt-1 border-t"><span class="text-gray-500">ID:</span><span class="font-medium text-gray-700">${idt||'N/A'}</span></div>
                    <div class="flex justify-between mt-1"><span class="text-gray-500">Details:</span><span class="font-medium text-gray-700 text-right">${det}</span></div>
                    <div class="flex gap-1 mt-2">${_uploadActionBtns(up.FILE_URL, up.UPLOAD_UID)}</div>
                </div>`;
            });
            h_body += `</div>`;
            h_body += `<div class="hidden sm:block overflow-x-auto border rounded-md"><table id="uploadsTable" class="min-w-full text-xs divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th class="px-4 py-2 text-left font-medium text-gray-500 uppercase">Type</th><th class="px-4 py-2 text-left font-medium text-gray-500 uppercase">ID</th><th class="px-4 py-2 text-left font-medium text-gray-500 uppercase">Details</th><th class="px-4 py-2 text-left font-medium text-gray-500 uppercase">Date</th><th class="px-4 py-2 text-center font-medium text-gray-500 uppercase">File</th></tr></thead><tbody class="bg-white divide-y divide-gray-200">`;
            u.forEach(up => {
                const ud  = fmtDate(up.TIME_STAMP, 'full');
                const idt = up.AWB_NUMBER || up.KYC_NUMBER || up.REFERENCE;
                let det = '';
                if (up.UPLOAD_TYPE==='MultiBox')  det = `Child:${up.CHILD_AWB||'N/A'}`;
                else if (up.UPLOAD_TYPE==='KYC')  det = `${up.CUSTOMER_UID||'N/A'}(${up.KYC_TYPE||'N/A'})`;
                else if (up.UPLOAD_TYPE==='Product') det = `${up.DOC_NUMBER||'N/A'}(${up.DOC_TYPE||'N/A'})`;
                else det = up.STATUS_REMARK || 'N/A';
                h_body += `<tr><td class="px-4 py-2">${up.UPLOAD_TYPE||'N/A'}</td><td class="px-4 py-2">${idt||'N/A'}</td><td class="px-4 py-2">${det}</td><td class="px-4 py-2">${ud}</td><td class="px-4 py-2"><div class="flex gap-1">${_uploadActionBtns(up.FILE_URL, up.UPLOAD_UID)}</div></td></tr>`;
            });
            h_body += `</tbody></table></div></div>`;
        } else {
            h_body += `<hr class="my-4"><h4 class="font-medium text-sm mb-2 text-gray-600">Uploads</h4><p class="text-xs text-gray-500">None</p>`;
        }
    }

    let h_header = `<div class="detail-card-header flex justify-between items-center"><h3 class="font-semibold text-gray-700">Product, Box & Upload Details</h3><div class="flex items-center gap-0.5">`;
    if (u.length > 0) {
        h_header += [
            `<button onclick="console.warn('print uploads not implemented')" title="Print All" class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.print}</button>`,
            `<button onclick="console.warn('mail uploads not implemented')"  title="Mail All"  class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.mail}</button>`,
            `<button onclick="console.warn('wa uploads not implemented')"    title="WhatsApp All" class="p-1.5 doc-action-btn--wa rounded hover:bg-green-50">${_docIco.whatsapp}</button>`,
            `<button onclick="console.warn('tg uploads not implemented')"    title="Telegram All" class="p-1.5 doc-action-btn--tg rounded hover:bg-blue-50">${_docIco.telegram}</button>`,
            `<button id="toggleUploadsBtn" title="Toggle Uploads" class="p-1.5 text-gray-500 rounded hover:bg-gray-100"><svg class="w-4 h-4 transition-transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></button>`,
        ].join('');
    }
    h_header += `</div></div>`;

    ui.productBoxDetailsContainer.innerHTML = `${h_header}<div class="detail-card-body">${h_body}</div>`;
}

// --- RENDER: DOCUMENT CENTER ---
function renderDocumentCenter(order) {
    const r = order.REFERENCE;
    // icon SVGs — use shared _docIco
    function actionBtns(printFn) {
        return [
            `<button onclick="${printFn}()" title="Print" class="doc-action-btn">${_docIco.print}</button>`,
            `<button onclick="console.warn('mail not implemented')" title="Mail" class="doc-action-btn">${_docIco.mail}</button>`,
            `<button onclick="console.warn('download not implemented')" title="Download" class="doc-action-btn">${_docIco.download}</button>`,
            `<button onclick="console.warn('whatsapp not implemented')" title="WhatsApp" class="doc-action-btn doc-action-btn--wa">${_docIco.whatsapp}</button>`,
            `<button onclick="console.warn('telegram not implemented')" title="Telegram" class="doc-action-btn doc-action-btn--tg">${_docIco.telegram}</button>`,
        ].join('');
    }

    const docs = [
        { label: 'Receipt',     sys: actionBtns('printSelectedShipmentReceipt') },
        { label: 'Label',       sys: actionBtns('printSelectedShipmentLabel') },
        { label: 'POD',         sys: actionBtns('printSelectedShipmentPOD') },
        { label: 'Office Copy', sys: actionBtns('printSelectedShipmentOfficeCopy') },
        { label: 'Docs',        sys: actionBtns('printSelectedShipmentDocs') },
        { label: 'Multibox',    sys: actionBtns('printSelectedShipmentMultibox') },
    ];

    let h = `<div class="divide-y divide-gray-100">`;
    docs.forEach(d => {
        h += `<div class="flex items-center gap-2 py-1.5 px-2">
            <span class="font-medium text-gray-700 text-xs w-24 shrink-0">${d.label}</span>
            <div class="flex flex-1 gap-1.5">${d.sys}</div>
        </div>`;
    });
    h += `</div>`;

    h += `<div class="flex justify-end items-center gap-2 pt-2 border-t mt-2">
        <label for="label-print-layout" class="text-xs text-gray-600">Label Layout:</label>
        <select id="label-print-layout" class="form-input text-xs" style="width:auto;padding:2px 6px;">
            <option value="2up-landscape">2-up Landscape (1x2)</option>
            <option value="4up-portrait">4-up Portrait (2x2)</option>
        </select>
    </div>`;

    const headerBtns = [
        `<button onclick="console.warn('print all not implemented')" title="Print All" class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.print}</button>`,
        `<button onclick="console.warn('mail all not implemented')"  title="Mail All"  class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.mail}</button>`,
        `<button onclick="console.warn('wa all not implemented')"    title="WhatsApp All" class="p-1.5 doc-action-btn--wa rounded hover:bg-green-50">${_docIco.whatsapp}</button>`,
        `<button onclick="console.warn('tg all not implemented')"    title="Telegram All" class="p-1.5 doc-action-btn--tg rounded hover:bg-blue-50">${_docIco.telegram}</button>`,
    ].join('');

    ui.documentCenterContainer.innerHTML = `<div class="detail-card-header flex justify-between items-center"><h3 class="font-semibold text-gray-700">Document Center</h3><div class="flex items-center gap-0.5">${headerBtns}</div></div><div class="detail-card-body p-0 px-2 py-2">${h}</div>`;
}

// --- BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', () => {
    ui = {
        statusMessage:              document.getElementById('status-message'),
        shipmentList:               document.getElementById('shipmentList'),
        shipmentListPane:           document.getElementById('shipmentListPane'),
        shipmentDetailPane:         document.getElementById('shipmentDetailPane'),
        backToListBtn:              document.getElementById('backToListBtn'),
        searchShipments:            document.getElementById('searchShipments'),
        filterToggleBtn:            document.getElementById('filterToggleBtn'),
        filterModal:                document.getElementById('filterModal'),
        filterStartDate:            document.getElementById('filter-start-date'),
        filterEndDate:              document.getElementById('filter-end-date'),
        filterBranch:               document.getElementById('filter-branch'),
        filterCode:                 document.getElementById('filter-code'),
        filterCarrier:              document.getElementById('filter-carrier'),
        resetFiltersBtn:            document.getElementById('reset-filters'),
        applyFiltersBtn:            document.getElementById('apply-filters'),
        detailView:                 document.getElementById('detailView'),
        emptyView:                  document.getElementById('emptyView'),
        shipmentDetailsContainer:   document.getElementById('shipmentDetailsContainer'),
        trackingStatusContainer:    document.getElementById('trackingStatusContainer'),
        consignorDetailsContainer:  document.getElementById('consignorDetailsContainer'),
        consigneeDetailsContainer:  document.getElementById('consigneeDetailsContainer'),
        productBoxDetailsContainer: document.getElementById('productBoxDetailsContainer'),
        trackingHistoryContainer:   document.getElementById('trackingHistoryContainer'),
        documentCenterContainer:    document.getElementById('documentCenterContainer'),
    };

    ui.backToListBtn.addEventListener('click', () => {
        if (isMobileView()) {
            ui.shipmentListPane.classList.remove('hidden');
            ui.shipmentDetailPane.classList.add('hidden');
        }
    });

    window.addEventListener('appDataLoaded',    e => initializePageWithData(e.detail.data));
    window.addEventListener('appDataRefreshed', e => initializePageWithData(e.detail.data));

    loadFromIndexedDB();
});
