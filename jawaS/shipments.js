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
let branchDataMap   = new Map(); // BRANCH_CODE → branch record

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
    const openFn = `previewFile('${url}', '${url.split('/').pop()}')`;
    const dlFn   = `(async()=>{try{const b=await fetchFileUrl('${url}');const a=document.createElement('a');a.href=b;a.download='${url.split('/').pop()}';a.click();}catch(e){showNotification('Download failed','error');}})()` ;
    const btns   = [
        `<button onclick="${openFn}" title="Open" class="doc-action-btn">${_docIco.print}</button>`,
        `<button onclick="${dlFn}"   title="Download" class="doc-action-btn">${_docIco.download}</button>`,
    ];
    // Delete button — only for MANAGER and above (level >= 50)
    const userLevel = ROLE_LEVELS[getUser().ROLE] || 0;
    if (userLevel >= ROLE_LEVELS['MANAGER']) {
        btns.push(`<button onclick="deleteUploadRecord('${uploadUid}', this)" title="Delete" class="p-1.5 text-red-400 rounded hover:bg-red-50"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>`);
    }
    return btns.join('');
}

// --- DATA INITIALIZATION ---
function initializePageWithData(appData) {
    if (!appData || !appData.ORDERS) {
        ui.statusMessage.textContent = 'No shipment data found.';
        return;
    }
    try {
        allOrders = Object.values(appData.ORDERS);
        allOrders.sort((a, b) => (parseDate(b.ORDER_DATE)?.getTime() || 0) - (parseDate(a.ORDER_DATE)?.getTime() || 0));

        b2b2cDataMap.clear(); productDataMap.clear(); multiboxDataMap.clear();
        uploadsDataMap.clear(); modesDataMap.clear(); carriersDataMap.clear(); branchDataMap.clear();

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

        if (appData.BRANCHES)
            Object.values(appData.BRANCHES).forEach(b => { if (b.BRANCH_CODE) branchDataMap.set(b.BRANCH_CODE, b); });

        populateFilters(allOrders);
        setupFilterListeners();
        applyFilters();
        ui.statusMessage.textContent = '';
    } catch (err) {
        ui.statusMessage.textContent = 'Failed to process data.';
        console.error('Data processing error:', err);
    }
}

let _dataListenersRegistered = false;

async function loadFromIndexedDB() {
    if (!_dataListenersRegistered) {
        _dataListenersRegistered = true;
        const onData = e => initializePageWithData(e.detail.data);
        window.addEventListener('appDataLoaded',    onData);
        window.addEventListener('appDataRefreshed', onData);
    }
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
            ui.statusMessage.textContent = 'Syncing...';
            await new Promise(resolve => {
                window.addEventListener('appDataLoaded',    resolve, { once: true });
                window.addEventListener('appDataRefreshed', resolve, { once: true });
                setTimeout(resolve, 15000);
            });
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

let _filterListenersSetup = false;

function setupFilterListeners() {
    if (_filterListenersSetup) return;
    _filterListenersSetup = true;
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
        const orderDate = parseDate(order.ORDER_DATE);
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
        const ref  = order.REFERENCE; if (!ref) return;
        const cnor = b2b2cDataMap.get(order.CONSIGNOR)?.NAME || order.CONSIGNOR || 'Unknown';
        const cnee = b2b2cDataMap.get(order.CONSIGNEE)?.NAME || order.CONSIGNEE || 'Unknown';
        const li   = document.createElement('li');
        li.innerHTML = `<strong>${order.AWB_NUMBER || 'No AWB'}</strong><span class="client-info">${cnor} &rarr; ${cnee}</span><div class="details-info"><span>Ref: ${ref} | ${fmtDate(order.ORDER_DATE)}</span></div>`;
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

    const userRole  = getUser().ROLE || 'GUEST';
    const canDelete = (ROLE_LEVELS[userRole] || 0) >= ROLE_LEVELS['ADMIN'];

    const editBtn  = `<button id="editOrderBtn"  title="Edit"   class="p-1.5 text-gray-500 rounded hover:bg-gray-100"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>`;
    const copyBtn  = `<button id="copyOrderBtn"  title="Copy"   class="p-1.5 text-gray-500 rounded hover:bg-gray-100"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></button>`;
    const shareBtn = `<button id="shareOrderBtn" title="Share"  class="p-1.5 text-gray-500 rounded hover:bg-gray-100"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg></button>`;
    const mailBtn  = `<button id="mailOrderBtn"  title="Email"  class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.mail}</button>`;
    const waBtn    = `<button id="waOrderBtn"    title="WhatsApp" class="p-1.5 doc-action-btn--wa rounded hover:bg-green-50">${_docIco.whatsapp}</button>`;
    const tgBtn    = `<button id="tgOrderBtn"    title="Telegram" class="p-1.5 doc-action-btn--tg rounded hover:bg-blue-50">${_docIco.telegram}</button>`;
    const delBtn   = canDelete ? `<button id="deleteOrderBtn" title="Delete" class="p-1.5 text-red-500 rounded hover:bg-red-50"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : '';

    ui.shipmentDetailsContainer.innerHTML = `<div class="detail-card-header flex justify-between items-center"><h3 class="font-semibold text-gray-700">Shipment Details</h3><div class="flex items-center gap-0.5">${editBtn}${copyBtn}${shareBtn}${mailBtn}${waBtn}${tgBtn}${delBtn}</div></div><div class="detail-card-body">${h}</div>`;

    function _buildOrderText() {
        const cnor  = b2b2cDataMap.get(order.CONSIGNOR) || {};
        const cnee  = b2b2cDataMap.get(order.CONSIGNEE) || {};
        const prods = productDataMap.get(order.REFERENCE)  || [];
        const boxes = multiboxDataMap.get(order.REFERENCE) || [];
        return [
            `Date: ${fmtDate(order.ORDER_DATE)}`,
            `AWB: ${order.AWB_NUMBER || 'N/A'}`,
            `Carrier: ${carriersDataMap.get(order.CARRIER) || order.CARRIER || 'N/A'}`,
            order.TOPAY === 'Yes' ? `ToPay: Yes (${order.TOTAL || 'N/A'})` : null,
            order.COD && parseFloat(order.COD) > 0 ? `COD: ${order.COD}` : null,
            `Value: ${order.VALUE || 'N/A'}`,
            `Pcs: ${order.PIECS || 'N/A'}`,
            `Wt: ${order.WEIGHT || 'N/A'} kg`,
            ``,
            `Consignee: ${cnee.NAME || order.CONSIGNEE || 'N/A'}`,
            cnee.ADDRESS ? `  ${cnee.ADDRESS}` : null,
            cnee.CITY    ? `  ${cnee.CITY} - ${cnee.PINCODE || ''}` : null,
            cnee.MOBILE  ? `  Ph: ${cnee.MOBILE}` : null,
            ``,
            `Consignor: ${cnor.NAME || order.CONSIGNOR || 'N/A'}`,
            cnor.CITY   ? `  ${cnor.CITY} - ${cnor.PINCODE || ''}` : null,
            cnor.MOBILE ? `  Ph: ${cnor.MOBILE}` : null,
            prods.length > 0 ? `` : null,
            prods.length > 0 ? `Products:` : null,
            ...prods.map(p => `  ${p.PRODUCT || 'N/A'} | Doc: ${p.DOC_NUMBER || 'N/A'} | Amt: ${p.AMOUNT || 0}`),
            boxes.length > 0 ? `` : null,
            boxes.length > 0 ? `Boxes:` : null,
            ...boxes.map(b => `  Box#${b.BOX_NUM || 'N/A'} | Wt:${b.WEIGHT || 0} | ${parseFloat(b.LENGTH)||0}x${parseFloat(b.BREADTH)||0}x${parseFloat(b.HIGHT)||0} | ChgWt:${parseFloat(b.CHG_WT||0).toFixed(2)}`),
        ].filter(l => l !== null).join('\n');
    }

    document.getElementById('editOrderBtn').addEventListener('click', () => {
        sessionStorage.setItem('editOrderRef', order.REFERENCE);
        window.location.href = 'BookOrder.html';
    });
    document.getElementById('copyOrderBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(_buildOrderText())
            .then(() => showNotification('\u2705 Copied to clipboard', 'success', 1500))
            .catch(() => showNotification('\u274c Copy failed', 'error'));
    });
    document.getElementById('shareOrderBtn').addEventListener('click', async () => {
        const text = _buildOrderText();
        if (navigator.share) {
            try {
                await navigator.share({ title: `Shipment ${order.AWB_NUMBER || order.REFERENCE}`, text });
            } catch (e) {
                if (e.name !== 'AbortError') showNotification('\u274c Share failed', 'error');
            }
        } else {
            navigator.clipboard.writeText(text)
                .then(() => showNotification('\u2705 Copied (share not supported)', 'info', 2000))
                .catch(() => showNotification('\u274c Share not supported', 'error'));
        }
    });
    document.getElementById('mailOrderBtn').addEventListener('click', () => showNotification('Email not implemented yet.', 'info'));
    document.getElementById('waOrderBtn').addEventListener('click',   () => showNotification('WhatsApp not implemented yet.', 'info'));
    document.getElementById('tgOrderBtn').addEventListener('click',   () => showNotification('Telegram not implemented yet.', 'info'));

    if (canDelete) {
        document.getElementById('deleteOrderBtn').addEventListener('click', async () => {
            if (!confirm(`Delete order ${order.REFERENCE}? This cannot be undone.`)) return;
            try {
                await deleteOrder(order.REFERENCE);
                showNotification(`\u2705 Order ${order.REFERENCE} deleted`, 'success');
                currentSelectedRef = null;
                ui.detailView.classList.add('hidden');
                ui.emptyView.classList.remove('hidden');
            } catch (err) {
                showNotification(`\u274c Delete failed: ${err.message}`, 'error');
            }
        });
    }
}

// --- TRACKING STATE CONFIG ---
const _stateConfig = {
    delivered:       { label: 'Delivered',        cls: 'bg-green-100 text-green-800' },
    outfordelivery:  { label: 'Out for Delivery',  cls: 'bg-blue-100 text-blue-800'  },
    intransit:       { label: 'In Transit',        cls: 'bg-yellow-100 text-yellow-800' },
    pending:         { label: 'Pending',           cls: 'bg-gray-100 text-gray-600'  },
    exception:       { label: 'Exception',         cls: 'bg-red-100 text-red-800'    },
};

// --- RENDER: TRACKING STATUS ---
function renderTrackingStatus(order) {
    const staticGrid = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-3">
        <div><div class="text-gray-500 text-xs">AWB Number</div><div class="font-semibold text-gray-800">${order.AWB_NUMBER || 'N/A'}</div></div>
        <div><div class="text-gray-500 text-xs">Order Date</div><div class="font-semibold text-gray-800">${fmtDate(order.ORDER_DATE)}</div></div>
        <div><div class="text-gray-500 text-xs">Transit Date</div><div class="font-semibold text-gray-800">${fmtDate(order.TRANSIT_DATE)}</div></div>
        <div><div class="text-gray-500 text-xs">Document Date</div><div class="font-semibold text-gray-800">${order.INVOICE_DATE && order.INVOICE_DATE !== '0' && order.INVOICE_DATE !== 0 ? fmtDate(order.INVOICE_DATE) : 'N/A'}</div></div>
    </div>`;

    const headerBtns = [
        `<button onclick="console.warn('ticket not implemented')" title="Ticket" class="p-1.5 text-gray-500 rounded hover:bg-gray-100"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/></svg></button>`,
        `<button onclick="console.warn('mark not implemented')" title="Mark" class="p-1.5 text-gray-500 rounded hover:bg-gray-100"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>`,
        `<button onclick="console.warn('mail tracking not implemented')" title="Mail" class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.mail}</button>`,
        `<button onclick="console.warn('wa tracking not implemented')" title="WhatsApp" class="p-1.5 doc-action-btn--wa rounded hover:bg-green-50">${_docIco.whatsapp}</button>`,
        `<button onclick="console.warn('tg tracking not implemented')" title="Telegram" class="p-1.5 doc-action-btn--tg rounded hover:bg-blue-50">${_docIco.telegram}</button>`,
        `<button id="refreshTrackingBtn" title="Refresh Tracking" class="p-1.5 text-gray-500 rounded hover:bg-gray-100"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg></button>`,
    ].join('');

    ui.trackingStatusContainer.innerHTML = `
        <div class="detail-card-header flex justify-between items-center">
            <h3 class="font-semibold text-gray-700">Tracking Status</h3>
            <div class="flex items-center gap-0.5">${headerBtns}</div>
        </div>
        <div class="detail-card-body">
            ${staticGrid}
            <div id="liveTrackingStatus"><p class="text-xs text-gray-400">Live status not loaded.</p></div>
        </div>`;

    document.getElementById('refreshTrackingBtn').addEventListener('click', () => _fetchAndRenderTracking(order));

    if (order.AWB_NUMBER && order.CARRIER)
        _fetchAndRenderTracking(order);
}

async function _fetchAndRenderTracking(order) {
    const statusEl  = document.getElementById('liveTrackingStatus');
    const historyEl = ui.trackingHistoryContainer.querySelector('#liveTrackingHistory');
    if (!statusEl) return;

    if (!order.AWB_NUMBER || !order.CARRIER) {
        statusEl.innerHTML = `<p class="text-xs text-gray-400">No AWB or carrier assigned.</p>`;
        return;
    }

    statusEl.innerHTML = `<p class="text-xs text-gray-400 animate-pulse">Fetching live status…</p>`;
    if (historyEl) historyEl.innerHTML = `<p class="text-xs text-gray-400 animate-pulse">Loading…</p>`;

    try {
        const t = await trackShipment(order.CARRIER, order.AWB_NUMBER);

        // --- update card header title with status + date ---
        const sc        = _stateConfig[t.state] || _stateConfig.intransit;
        const badge     = `<span class="status-badge ${sc.cls}">${sc.label}</span>`;
        const latestDate = t.movements?.[0]?.date || '';
        const latestTime = t.movements?.[0]?.time || '';
        const dateStr    = [latestDate, latestTime].filter(Boolean).join(' ');
        const titleEl    = ui.trackingStatusContainer.querySelector('.detail-card-header h3');
        if (titleEl) titleEl.innerHTML = `Tracking Status &nbsp;${badge}${dateStr ? `<span class="text-xs font-normal text-gray-400 ml-1">${dateStr}</span>` : ''}`;

        // --- live status body ---
        const rows = [
            t.status      ? `<div class="sm:col-span-2"><div class="text-gray-500 text-xs">Status</div><div class="font-semibold text-gray-800">${t.status}</div></div>` : '',
            t.origin      ? `<div><div class="text-gray-500 text-xs">Origin</div><div class="font-semibold text-gray-800">${t.origin}</div></div>` : '',
            t.destination ? `<div><div class="text-gray-500 text-xs">Destination</div><div class="font-semibold text-gray-800">${t.destination}</div></div>` : '',
            t.booked_date ? `<div><div class="text-gray-500 text-xs">Booked</div><div class="font-semibold text-gray-800">${t.booked_date}</div></div>` : '',
            t.additional_info ? `<div class="sm:col-span-2"><div class="text-gray-500 text-xs">Info</div><div class="text-gray-700 text-xs">${t.additional_info}</div></div>` : '',
        ].filter(Boolean).join('');
        statusEl.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">${rows}</div>`;

        // --- POD icon button injected into header ---
        const podBtnContainer = document.getElementById('trackingPodBtn');
        if (podBtnContainer) podBtnContainer.remove();
        if (t.pod_image) {
            if (t.pod_image.startsWith('data:')) window._podInlineData = t.pod_image;
            const podSrc  = t.pod_image.startsWith('data:') ? '__inline__' : t.pod_image;
            const isInline = t.pod_image.startsWith('data:');
            const podBtn  = document.createElement('button');
            podBtn.id     = 'trackingPodBtn';
            podBtn.title  = 'Show POD Image';
            podBtn.className = 'p-1.5 text-indigo-600 rounded hover:bg-indigo-50';
            podBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`;
            podBtn.onclick = () => _showPodImage(podSrc, isInline);
            // insert before the refresh button
            const refreshBtn = document.getElementById('refreshTrackingBtn');
            refreshBtn.parentNode.insertBefore(podBtn, refreshBtn);
        }

        // --- history panel ---
        _renderTrackingHistoryData(t.movements || []);

    } catch (err) {
        statusEl.innerHTML = `<p class="text-xs text-red-500">${err.message}</p>`;
        if (historyEl) historyEl.innerHTML = '';
    }
}

// --- POD IMAGE VIEWER ---
function _showPodImage(src, isInline) {
    const url = isInline ? window._podInlineData : src;
    if (!url) return;
    const popup = document.getElementById('podImagePopup');
    const img   = document.getElementById('podImageEl');
    img.src = url;
    popup.classList.remove('hidden');
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
    ui.trackingHistoryContainer.innerHTML = `
        <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Tracking History</h3></div>
        <div class="detail-card-body"><div id="liveTrackingHistory"><p class="text-sm text-gray-400">Loading…</p></div></div>`;
}

function _renderTrackingHistoryData(movements) {
    const el = document.getElementById('liveTrackingHistory');
    if (!el) return;
    if (!movements.length) {
        el.innerHTML = `<p class="text-sm text-gray-400">No movement history available.</p>`;
        return;
    }
    // Desktop table / mobile cards
    let cards = `<div class="space-y-2 sm:hidden">`;
    movements.forEach(m => {
        cards += `<div class="p-3 bg-gray-50 rounded-md border text-xs">
            <div class="font-semibold text-gray-800">${m.activity || 'N/A'}</div>
            <div class="text-gray-500 mt-1">${[m.date, m.time].filter(Boolean).join(' ')}</div>
            ${m.location ? `<div class="text-gray-600 mt-0.5">${m.location}</div>` : ''}
        </div>`;
    });
    cards += `</div>`;

    let rows = '';
    movements.forEach(m => {
        rows += `<tr>
            <td class="px-3 py-2 whitespace-nowrap">${m.date || ''}</td>
            <td class="px-3 py-2 whitespace-nowrap">${m.time || ''}</td>
            <td class="px-3 py-2">${m.location || ''}</td>
            <td class="px-3 py-2">${m.activity || ''}</td>
        </tr>`;
    });
    const table = `<div class="hidden sm:block overflow-x-auto border rounded-md">
        <table id="trackingHistoryTable" class="min-w-full text-xs divide-y divide-gray-200">
            <thead class="bg-gray-50"><tr>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Date</th>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Time</th>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Location</th>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Activity</th>
            </tr></thead>
            <tbody class="bg-white divide-y divide-gray-200">${rows}</tbody>
        </table>
    </div>`;

    el.innerHTML = cards + table;
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
            `<button onclick="printSelectedShipmentDocsAndBox()" title="Print Docs+Box" class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.print}</button>`,
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
        { label: 'Label',       sys: actionBtns('printSelectedShipmentLabel') },
        { label: 'Receipt',     sys: actionBtns('printSelectedShipmentReceipt') },
        { label: 'POD',         sys: actionBtns('printSelectedShipmentPOD') },
        { label: 'Office Copy', sys: actionBtns('printSelectedShipmentOfficeCopy') },
        { label: 'Docs + Box',  sys: actionBtns('printSelectedShipmentDocsAndBox') },
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
        `<button onclick="printSelectedShipmentAll()" title="Print All" class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.print}</button>`,
        `<button onclick="console.warn('mail all not implemented')"  title="Mail All"  class="p-1.5 text-gray-500 rounded hover:bg-gray-100">${_docIco.mail}</button>`,
        `<button onclick="console.warn('wa all not implemented')"    title="WhatsApp All" class="p-1.5 doc-action-btn--wa rounded hover:bg-green-50">${_docIco.whatsapp}</button>`,
        `<button onclick="console.warn('tg all not implemented')"    title="Telegram All" class="p-1.5 doc-action-btn--tg rounded hover:bg-blue-50">${_docIco.telegram}</button>`,
    ].join('');

    ui.documentCenterContainer.innerHTML = `<div class="detail-card-header flex justify-between items-center"><h3 class="font-semibold text-gray-700">Document Center</h3><div class="flex items-center gap-0.5">${headerBtns}</div></div><div class="detail-card-body p-0 px-2 py-2">${h}</div>`;
}

// --- BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('shipmentListPane')) return; // not on Shipments.html — render functions still available
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

    loadFromIndexedDB();
});
