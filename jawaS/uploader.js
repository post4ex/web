// ============================================================================
// UPLOADER.JS — Data layer, order list, pickup table, submit, event wiring
// Depends on: uploader-image.js, uploader-camera.js
// ============================================================================

// --- State Variables ---
// --- V2 State Variables (Shipment List) ---
// --- Data Maps (keyed objects + lookup Maps, same pattern as shipments.js) ---
let ordersData    = {};   // REFERENCE → order record
let b2b2cMap      = new Map(); // UID → B2B2C record
let productMap    = new Map(); // REFERENCE → [products]
let uploadsMap    = new Map(); // REFERENCE → [uploads]
let allOrdersList = [];   // sorted array for filter/render — rebuilt on each data load
let displayedOrders = [];
let displayDays     = 90;
let selectedOrder   = null;
let currentUploadType = null;

// --- V1 State Variables (Uploader) ---
let stream = null, currentRotation = 0, isImageLocked = false, cropper = null;
let imageQueue = [], currentImageIndex = -1;
let barcodeDetector;
let originalCropperSrc = null;
const MAX_FILES = 50;
let isSelecting = false, selectionRect = {};
let isProcessingOCR = false;
let isProcessingImage = false; // *** NEW: Race condition lock ***
let selectedPickupRow = null; // *** NEW: To track selected pickup row ***
let selectionCtx, previewCtx;
let currentEnhancements = { brightness: 0, contrast: 0, sharpen: false, greyscale: false, bw: false };
let desktopRightPanelParent; // *** NEW: To store desktop layout ***

// --- V2 UI Elements (Right Panel) ---
let miniOrderListContainer, orderList, searchMiniOrderInput, loadMoreBtn, toggleOrderListBtn;

// --- V1 UI Elements (Left Panel) ---
let cameraBtn, uploadBtn, fileInput, placeholder, imagePreview, cameraFeed;
let previewCanvas, rotateBtn, lockBtn, cancelBtn, cancelAllBtn;
let scrollerContainer, scroller;
let inlineCropperWrapper, imageViewArea, cropperImage, cropConfirmBtn, cropCancelBtn;
let cropRotateBtn, selectionCanvas, uploadTypeStrip, statusBar; 
let enhanceBtn, enhancementControls, autoEnhanceBtn, greyscaleBtn, bwBtn, sharpenBtn, resetEnhanceBtn;
let brightnessSlider, contrastSlider;
let tableBody, deleteLastBtn, clearAllBtn, submitBtn;


// --- === IMAGE FUNCTIONS (MOVED TO TOP) === ---

/**
 * Compresses an image data URL to a target size.
 * @param {string} dataUrl - The original image data URL.
 * @param {number} targetSizeKB - The target size in kilobytes.
 * @param {number} maxDimension - The maximum width or height.
 * @returns {Promise<string>} - The compressed image data URL (jpeg).
 */

const kycOptionsHTML = `
    <optgroup label="Individual">
<option value="Aadhaar Card">Aadhaar Card</option>
<option value="PAN Card">PAN Card</option>
<option value="Indian Passport">Indian Passport</option>
<option value="Voter ID Card">Voter ID Card</option>
<option value="Driving License">Driving License</option>
<option value="NREGA Job Card">NREGA Job Card</option>
    </optgroup>
    <optgroup label="Business">
<option value="Partnership Deed">Partnership Deed</option>
<option value="Certificate of Incorporation">Certificate of Incorporation</option>
<option value="GST Registration">GST Registration</option>
<option value="MoA & AoA">MoA & AoA</option>
<option value="Board Resolution">Board Resolution</option>
    </optgroup>
`;

// --- V1 Status Update Logic ---

function processAppData(detail) {
    const data = (detail && detail.data) ? detail.data : (detail || {});

    // Store raw keyed objects
    ordersData = data.ORDERS || {};

    // Build lookup Maps
    b2b2cMap.clear(); productMap.clear(); uploadsMap.clear();

    Object.values(data.B2B2C || {}).forEach(c => b2b2cMap.set(c.UID, c));

    Object.values(data.PRODUCTS || {}).forEach(p => {
const r = p.REFERENCE; if (!r) return;
if (!productMap.has(r)) productMap.set(r, []);
productMap.get(r).push(p);
    });

    Object.values(data.UPLOADS || {}).forEach(u => {
const r = u.REFERENCE; if (!r) return;
if (!uploadsMap.has(r)) uploadsMap.set(r, []);
uploadsMap.get(r).push(u);
    });

    // Sorted array for list rendering
    allOrdersList = Object.values(ordersData).sort((a, b) => {
const da = parseDate(b.ORDER_DATE);
const db = parseDate(a.ORDER_DATE);
return (da?.getTime() || 0) - (db?.getTime() || 0);
    });

    filterAndRenderOrders();

    if (selectedOrder) {
selectedOrder = ordersData[selectedOrder.REFERENCE] || null;
renderDynamicInputs();
    }

    updateStatus('App data loaded. Ready.');
}

// --- *** NEW: V3 Data Listeners (Adopted from V1) *** ---
function initializeV1DataListeners() {
    // Listen for data loaded/refreshed from the main site (e.g., layout.js)
    window.addEventListener('appDataLoaded', (e) => {
console.log("Event 'appDataLoaded' received.");
processAppData(e.detail);
    });
    
    window.addEventListener('appDataRefreshed', (e) => {
console.log("Event 'appDataRefreshed' received.");
processAppData(e.detail);
    });
}


// --- List Filtering and Rendering (Right Panel) ---

// Date formatting → fmtDate() from core/formatIST.js

function renderMiniOrderList(ordersToRender) {
    if (!orderList) return;
    orderList.innerHTML = '';
    displayedOrders = ordersToRender;

    if (!ordersToRender.length) {
orderList.innerHTML = '<li class="status-message">No matching orders found.</li>';
if (loadMoreBtn) loadMoreBtn.style.display = 'none';
return;
    }

    ordersToRender.forEach(order => {
const ref  = order.REFERENCE; if (!ref) return;
const cnor = b2b2cMap.get(order.CONSIGNOR);
const cnee = b2b2cMap.get(order.CONSIGNEE);
const li   = document.createElement('li');
li.innerHTML = `<strong>${order.AWB_NUMBER || ref}</strong><span class="client-info">${cnor?.NAME || 'Unknown'} → ${cnee?.NAME || 'Unknown'}</span><div class="dest-info">${order.DEST_CITY || 'N/A'}</div><div class="details-info">${fmtDate(order.ORDER_DATE)}</div>`;
li.dataset.orderRef = ref;
if (selectedOrder?.REFERENCE === ref) li.classList.add('selected');
orderList.appendChild(li);
    });

    const searchTerm = searchMiniOrderInput?.value.toLowerCase() || '';
    const total = filterOrdersBySearchTerm(searchTerm).length;
    if (loadMoreBtn) {
if (ordersToRender.length < total) {
    loadMoreBtn.style.display = 'block';
    loadMoreBtn.disabled      = false;
    loadMoreBtn.textContent   = `Load More (${ordersToRender.length} / ${total})`;
} else {
    loadMoreBtn.style.display = 'none';
}
    }
}

function filterOrdersBySearchTerm(searchTerm) {
    if (!searchTerm) return allOrdersList;
    return allOrdersList.filter(order => {
const cnor = b2b2cMap.get(order.CONSIGNOR);
const cnee = b2b2cMap.get(order.CONSIGNEE);
const s = searchTerm.toLowerCase();
return String(order.REFERENCE  || '').toLowerCase().includes(s) ||
       String(order.AWB_NUMBER || '').toLowerCase().includes(s) ||
       (cnor?.NAME || '').toLowerCase().includes(s) ||
       (cnee?.NAME || '').toLowerCase().includes(s) ||
       (order.DEST_CITY || '').toLowerCase().includes(s) ||
       fmtDate(order.ORDER_DATE).toLowerCase().includes(s);
    });
}

function filterOrdersByDate(orders) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - displayDays);
    cutoff.setHours(0, 0, 0, 0);
    return orders.filter(o => {
const d = parseDate(o.ORDER_DATE);
return d && d >= cutoff;
    });
}

function filterAndRenderOrders() {
    const searchTerm = searchMiniOrderInput ? searchMiniOrderInput.value.toLowerCase() : '';
    const filtered   = filterOrdersByDate(filterOrdersBySearchTerm(searchTerm));
    renderMiniOrderList(filtered);
}

// --- === NEW: Function to render existing uploads FOR A SPECIFIC ORDER === ---
function renderExistingUploadsForOrder(order) {
    if (!existingTableBody || !order) {
existingUploadsContainer.style.display = 'none';
return;
    }
    
    existingTableBody.innerHTML = ''; // Clear previous
    
    // Find all uploads matching the selected order's REF or AWB
    const matchingUploads = uploadsMap.get(String(order.REFERENCE)) || [];

    if (matchingUploads.length === 0) {
existingUploadsContainer.style.display = 'none';
return;
    }

    matchingUploads.forEach(upload => {
// Get consignor/consignee names from the *selected order* object
const consignorName = selectedOrder.CONSIGNOR_NAME || 'N/A';
const consigneeName = selectedOrder.CONSIGNEE_NAME || 'N/A';

const newRow = existingTableBody.insertRow();

// Add data attributes for filtering
newRow.dataset.keyRef = upload.REFERENCE || upload.AWB_NUMBER;
newRow.dataset.keyType = upload.UPLOAD_TYPE;
newRow.dataset.branch = upload.BRANCH || '';
newRow.dataset.code = upload.CODE || '';

// Build row data based on upload type
const rowData = {
    type: upload.UPLOAD_TYPE || 'N/A',
    status: upload.STATUS_REMARK || '', // *** FIX: No 'N/A' ***
    refAwb: (upload.UPLOAD_TYPE === 'MultiBox')
? `Ref: ${upload.REFERENCE || upload.AWB_NUMBER} <br> Child: ${upload.CHILD_AWB}`
: `Ref: ${upload.REFERENCE || ''} <br> AWB: ${upload.AWB_NUMBER || ''}`,
    customerKyc: upload.UPLOAD_TYPE === 'KYC' 
? `Cust: ${consignorName} <br> UID: ${upload.CUSTOMER_UID || ''} <br> KYC: ${upload.KYC_NUMBER} (${upload.KYC_TYPE})`
: '', // *** FIX: No 'N/A' ***
    docInfo: upload.UPLOAD_TYPE === 'Product'
? `Doc: ${upload.DOC_NUMBER || ''} <br> Type: ${upload.DOC_TYPE || ''} <br> Remark: ${upload.STATUS_REMARK || ''}`
: '', // *** FIX: No 'N/A' ***
    image: upload.FILE_URL
};

// Manually set status for POD/Reciept if remark is empty
if (upload.UPLOAD_TYPE === 'POD' && !upload.STATUS_REMARK) rowData.status = 'Delivered';
if (upload.UPLOAD_TYPE === 'Reciept' && !upload.STATUS_REMARK) rowData.status = 'Booked';

// --- *** MODIFIED: Create cells with data-label *** ---

// Cell 0: Status
newRow.insertCell(0).dataset.label = 'Status';
newRow.cells[0].textContent = `${rowData.type} - ${rowData.status}`;

// Cell 1: Reference
newRow.insertCell(1).dataset.label = 'Reference';
newRow.cells[1].innerHTML = rowData.refAwb;

// Cell 2: Customer/KYC
newRow.insertCell(2).dataset.label = rowData.customerKyc ? 'Customer/KYC' : 'N/A';
newRow.cells[2].innerHTML = rowData.customerKyc || 'N/A';

// Cell 3: Doc Info
newRow.insertCell(3).dataset.label = rowData.docInfo ? 'Doc Info' : 'N/A';
newRow.cells[3].innerHTML = rowData.docInfo || 'N/A';

// Cell 4: Preview button
const imageCell = newRow.insertCell(4);
imageCell.dataset.label = 'Action';
const openBtn = document.createElement('button');
openBtn.className = 'v1-btn';
openBtn.textContent = 'Preview';
openBtn.style.fontSize = '0.75rem';
openBtn.addEventListener('click', () => previewFile(rowData.image, rowData.type));
imageCell.appendChild(openBtn);

// Cell 5: Hidden Branch/Code Cell
const hiddenCell = newRow.insertCell(5);
hiddenCell.textContent = `Branch: ${upload.BRANCH}, Code: ${upload.CODE}`;
hiddenCell.style.display = 'none';
    });
    
    existingUploadsContainer.style.display = 'block'; // Show the container
}

// --- === DYNAMIC INPUT LOGIC (Refactored) === ---

/**
 * *** MODIFIED ***
 * Checks if a POD or Reciept task is already in the main upload table OR existing uploads
 */
function checkUploadStatus(ref, awb) {
    const status = { pod: false, reciept: false };
    
    // 1. Check NEWLY staged items in the main upload table
    const rows = tableBody.rows;
    for (let i = 0; i < rows.length; i++) {
const row = rows[i];
const keyRef = row.dataset.keyRef;
const keyType = row.dataset.keyType;
// *** FIX: Ensure keyRef is a string for comparison ***
const refMatch = String(keyRef) === String(ref) || (awb && String(keyRef) === String(awb));

if (refMatch && keyType === 'POD') {
    status.pod = true;
}
if (refMatch && keyType === 'Reciept') {
    status.reciept = true;
}
    }
    
    // 2. Check EXISTING uploads
    (uploadsMap.get(String(ref)) || []).forEach(upload => {
if (upload.UPLOAD_TYPE === 'POD')     status.pod     = true;
if (upload.UPLOAD_TYPE === 'Reciept') status.reciept = true;
    });
    
    return status;
}

/**
 * Creates a single pick button for the table
 */
function createPickButton(pickData) {
    const button = document.createElement('button');
    button.className = 'v1-btn pick-btn-dynamic';
    button.textContent = 'Pick';
    for (const [key, val] of Object.entries(pickData)) {
button.dataset[key] = val;
    }
    return button;
}

/**
 * Renders the POD row in the pickup table
 */
function renderPodRow(tableBody, { ref, awb }) {
    // Check is now done in renderDynamicInputs
    const pickData = { 'type': 'POD', 'ref': ref, 'awb': awb };
    const row = tableBody.insertRow();
    // *** MODIFIED: Added data-label attributes ***
    row.innerHTML = `
<td data-label="Type">POD</td>
<td data-label="Reference">${ref} / ${awb}</td>
<td data-label="Details">Status</td>
<td data-label="Input"><input type="text" class="dynamic-text-input" placeholder="Delivered (default)"></td>
    `;
    // *** MODIFIED: Added data-label to action cell ***
    const actionCell = row.insertCell();
    actionCell.dataset.label = "Action";
    actionCell.appendChild(createPickButton(pickData));
}

/**
 * Renders the Receipt row in the pickup table
 */
function renderReceiptRow(tableBody, { ref, awb }) {
    // Check is now done in renderDynamicInputs
    const pickData = { 'type': 'Reciept', 'ref': ref, 'awb': awb };
    const row = tableBody.insertRow();
    // *** MODIFIED: Added data-label attributes ***
    row.innerHTML = `
<td data-label="Type">Reciept</td>
<td data-label="Reference">${ref} / ${awb}</td>
<td data-label="Details">Status</td>
<td data-label="Input"><input type="text" class="dynamic-text-input" placeholder="Booked (default)"></td>
    `;
    // *** MODIFIED: Added data-label to action cell ***
    const actionCell = row.insertCell();
    actionCell.dataset.label = "Action";
    actionCell.appendChild(createPickButton(pickData));
}

/**
 * Renders the KYC rows in the pickup table
 */
function renderKycRows(tableBody, { ref, consignorName, consignorUid, consigneeName, consigneeUid }) {
    // Row 1: Consignor
    let pickData = { 'type': 'KYC', 'ref': ref, 'customerName': consignorName, 'customerUid': consignorUid };
    const kycRow1 = tableBody.insertRow();
    // *** MODIFIED: Added data-label attributes ***
    kycRow1.innerHTML = `
<td data-label="Type">KYC</td>
<td data-label="Reference">${ref}</td>
<td data-label="Details">${consignorName}</td>
<td data-label="Input">
    <div class="kyc-inputs">
<input type="text" class="kyc-number-input" placeholder="KYC Number">
<select class="kyc-type-select">${kycOptionsHTML}</select>
    </div>
</td>
    `;
    // *** MODIFIED: Added data-label to action cell ***
    let actionCell1 = kycRow1.insertCell();
    actionCell1.dataset.label = "Action";
    actionCell1.appendChild(createPickButton(pickData));
    
    // Row 2: Consignee
    pickData = { 'type': 'KYC', 'ref': ref, 'customerName': consigneeName, 'customerUid': consigneeUid };
    const kycRow2 = tableBody.insertRow();
    // *** MODIFIED: Added data-label attributes ***
    kycRow2.innerHTML = `
<td data-label="Type">KYC</td>
<td data-label="Reference">${ref}</td>
<td data-label="Details">${consigneeName}</td>
<td data-label="Input">
    <div class="kyc-inputs">
<input type="text" class="kyc-number-input" placeholder="KYC Number">
<select class="kyc-type-select">${kycOptionsHTML}</select>
    </div>
</td>
    `;
    // *** MODIFIED: Added data-label to action cell ***
    let actionCell2 = kycRow2.insertCell();
    actionCell2.dataset.label = "Action";
    actionCell2.appendChild(createPickButton(pickData));
}

/**
 * Renders the Product rows in the pickup table
 */
function renderProductRows(tableBody, { ref }) {
    const products = productMap.get(String(ref)) || [];
    if (products.length > 0) {
products.forEach(product => {
    const docNum = product.DOC_NUMBER || ''; // *** FIX: Use '' not 'N/A' ***
    const docType = product.TYPE || ''; // *** FIX: Use '' not 'N/A' ***
    const pickData = { 'type': 'Product', 'ref': ref, 'docNumber': docNum, 'docType': docType };
    
    const productRow = tableBody.insertRow();
    // *** MODIFIED: Added data-label attributes ***
    productRow.innerHTML = `
<td data-label="Type">Product</td>
<td data-label="Reference">${ref}</td>
<td data-label="Details">Doc: ${docNum || 'N/A'} (${docType || 'N/A'})</td>
<td data-label="Input"><input type="text" class="dynamic-text-input" placeholder="PAPERS UPLOADED (default)"></td>
    `;
    // *** MODIFIED: Added data-label to action cell ***
    const actionCell = productRow.insertCell();
    actionCell.dataset.label = "Action";
    actionCell.appendChild(createPickButton(pickData));
});
    } else if (currentUploadType === 'Product') { // Only show "no products" if in filter mode
tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 15px; color: #888;">No products found for this order.</td></tr>';
    }
}

/**
 * Renders the MultiBox row in the pickup table
 */
function renderMultiBoxRow(tableBody, { ref, awb }) {
    const pickData = { 'type': 'MultiBox', 'ref': ref, 'awb': awb };
    const multiBoxRow = tableBody.insertRow();
    // *** MODIFIED: Added data-label attributes ***
    multiBoxRow.innerHTML = `
<td data-label="Type">MultiBox</td>
<td data-label="Reference">${ref} / ${awb}</td>
<td data-label="Details">Child AWB</td>
<td data-label="Input"><input type="text" class="dynamic-text-input" placeholder="Enter Child AWB (default: ${awb})"></td>
    `;
    // *** MODIFIED: Added data-label to action cell ***
    const actionCell = multiBoxRow.insertCell();
    actionCell.dataset.label = "Action";
    actionCell.appendChild(createPickButton(pickData));
}

/**
 * Renders the dynamic input rows based on selected order and upload type
 */
function renderDynamicInputs() {
    if (!dynamicInputArea) return;
    dynamicInputArea.innerHTML = ''; // Clear previous inputs
    selectedPickupRow = null; // Clear row selection
    
    // *** NEW: Also hide/clear existing uploads when re-rendering ***
    if (existingUploadsContainer) existingUploadsContainer.style.display = 'none';
    if (existingTableBody) existingTableBody.innerHTML = '';

    if (!selectedOrder) {
dynamicInputArea.innerHTML = '<div class="placeholder">Select an order from the list...</div>';
return;
    }

    // --- 1. Get all order details ---
    const ref = selectedOrder.REFERENCE;
    const awb = selectedOrder.AWB_NUMBER || ''; // *** FIX: Use '' not 'N/A' ***
    const consignorUid = selectedOrder.CONSIGNOR;
    const consigneeUid = selectedOrder.CONSIGNEE;
    
    const cnor = b2b2cMap.get(consignorUid);
    const consignorName = cnor?.NAME || `UID: ${consignorUid}`;
    const cnee = b2b2cMap.get(consigneeUid);
    const consigneeName = cnee?.NAME || `UID: ${consigneeUid}`;
    
    selectedOrder.CONSIGNOR_NAME = consignorName;
    selectedOrder.CONSIGNEE_NAME = consigneeName;

    const orderDetails = { ref, awb, consignorUid, consignorName, consigneeUid, consigneeName };

    // --- *** NEW RULE CHECK *** ---
    const uploadStatus = checkUploadStatus(ref, awb);

    if (uploadStatus.pod) {
dynamicInputArea.innerHTML = '<div class="placeholder" style="color: green; font-weight: bold;">POD already uploaded for this order. No further tasks available.</div>';
renderExistingUploadsForOrder(selectedOrder); // Still show existing uploads
return; // Stop here
    }
    // --- *** END NEW RULE CHECK *** ---


    // --- 2. Create table structure ---
    const table = document.createElement('table');
    table.className = 'pickup-table';
    
    const tableHead = `
<thead>
    <tr>
<th>TYPE</th>
<th>REFERENCE</th>
<th>DETAILS</th>
<th>INPUT</th>
<th>ACTION</th>
    </tr>
</thead>
    `;
    const tableBody = document.createElement('tbody');

    // --- 3. Populate table based on mode ---
    if (currentUploadType === null) {
// "All" mode - render every type
renderPodRow(tableBody, orderDetails); // POD check is already done
if (!uploadStatus.reciept) { // Check for Reciept
    renderReceiptRow(tableBody, orderDetails);
}
renderKycRows(tableBody, orderDetails);
renderProductRows(tableBody, orderDetails);
renderMultiBoxRow(tableBody, orderDetails);
    } else {
// "Filter" mode - render only the selected type
switch (currentUploadType) {
    case 'POD':
renderPodRow(tableBody, orderDetails); // POD check is already done
break;
    case 'Reciept':
if (!uploadStatus.reciept) { // Check for Reciept
    renderReceiptRow(tableBody, orderDetails);
}
break;
    case 'KYC':
renderKycRows(tableBody, orderDetails);
break;
    case 'Product':
renderProductRows(tableBody, orderDetails);
break;
    case 'MultiBox':
renderMultiBoxRow(tableBody, orderDetails);
break;
    default:
tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 15px; color: #888;">Input logic for "${currentUploadType}" not defined.</td></tr>`;
}
    }
    
    table.innerHTML = tableHead;
    table.appendChild(tableBody);
    dynamicInputArea.appendChild(table);
    
    // --- 4. *** NEW: Render existing uploads for this order ***
    renderExistingUploadsForOrder(selectedOrder);
}

// --- === END: DYNAMIC INPUT LOGIC === ---

// --- *** NEW: PDF Creation Function *** ---

function initializeData() {
    // *** MODIFIED: Assign Generic Panel UI ***
    miniOrderListContainer = document.getElementById('miniOrderListContainer');
    orderList = document.getElementById('miniOrderList');
    searchMiniOrderInput = document.getElementById('searchMiniOrder');
    loadMoreBtn = document.getElementById('loadMoreBtn');
    toggleOrderListBtn = document.getElementById('toggleOrderListBtn'); // *** NEW ***
    
    // --- Add Listeners to elements ---
    if (searchMiniOrderInput) {
searchMiniOrderInput.addEventListener('input', filterAndRenderOrders);
    }

    if (loadMoreBtn) {
loadMoreBtn.addEventListener('click', () => {
    displayDays += 90; // Load 90 more days
    filterAndRenderOrders();
});
    }
    
    if (orderList) {
orderList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li || !li.dataset.orderRef) return;
    
    const ref = li.dataset.orderRef;
    selectedOrder = ordersData[ref] || null;
    
    if (selectedOrder) {
console.log("Selected Order:", selectedOrder);
// Re-render list to show selection
filterAndRenderOrders();
// Render the dynamic inputs on the left
renderDynamicInputs();

// *** NEW: Auto-hide list on mobile after selection ***
if (window.innerWidth < 1024) {
    const panel = mobilePlaceholder.querySelector('.right-panel');
    if (panel && !panel.classList.contains('collapsed')) {
panel.classList.add('collapsed');
if(toggleOrderListBtn) toggleOrderListBtn.classList.add('collapsed');
    }
    dynamicInputArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
    }
});
    }

    // *** NEW: Toggle Button Listener ***
    if (toggleOrderListBtn) {
toggleOrderListBtn.addEventListener('click', () => {
    const panel = mobilePlaceholder.querySelector('.right-panel');
    if (panel) {
panel.classList.toggle('collapsed');
toggleOrderListBtn.classList.toggle('collapsed');
    }
});
    }
}

// --- Main DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
     // 1. Initialize Right Panel (Data Listeners)
     initializeData(); // This still sets up search/click listeners
     
     // *** NEW: Call the V1 data listener setup ***
     initializeV1DataListeners();

     // 2. Assign Left Panel (Uploader UI)
     cameraBtn = document.getElementById('camera-btn');
     uploadBtn = document.getElementById('upload-btn');
     fileInput = document.getElementById('file-input');
     placeholder = document.getElementById('placeholder');
     imagePreview = document.getElementById('image-preview');
     cameraFeed = document.getElementById('camera-feed');
     previewCanvas = document.getElementById('preview-canvas');
     rotateBtn = document.getElementById('rotate-btn');
     lockBtn = document.getElementById('lock-btn');
     cancelBtn = document.getElementById('cancel-btn');
     cancelAllBtn = document.getElementById('cancel-all-btn');
     scrollerContainer = document.getElementById('image-scroller-container');
     scroller = document.getElementById('image-scroller');
     inlineCropperWrapper = document.getElementById('inline-cropper-wrapper');
     imageViewArea = document.getElementById('image-view-area');
     cropperImage = document.getElementById('cropper-image');
     cropConfirmBtn = document.getElementById('crop-confirm-btn');
     cropCancelBtn = document.getElementById('crop-cancel-btn');
     cropRotateBtn = document.getElementById('crop-rotate-btn');
     selectionCanvas = document.getElementById('selection-canvas');
     uploadTypeStrip = document.querySelector('.upload-type-strip');
     statusBar = document.getElementById('status-bar'); 
     enhanceBtn = document.getElementById('enhance-btn');
     enhancementControls = document.getElementById('enhancement-controls');
     autoEnhanceBtn = document.getElementById('auto-enhance-btn');
     greyscaleBtn = document.getElementById('greyscale-btn');
     bwBtn = document.getElementById('bw-btn');
     sharpenBtn = document.getElementById('sharpen-btn');
     resetEnhanceBtn = document.getElementById('reset-enhance-btn');
     brightnessSlider = document.getElementById('brightness-slider');
     contrastSlider = document.getElementById('contrast-slider');
     tableBody = document.getElementById('data-table-body');
     deleteLastBtn = document.getElementById('delete-last-btn');
     clearAllBtn = document.getElementById('clear-all-btn');
     submitBtn = document.getElementById('submit-btn');
     dynamicInputArea= document.getElementById('dynamic-input-area');
     existingUploadsContainer = document.getElementById('existing-uploads-container');
     existingTableBody= document.getElementById('existing-data-table-body');
     mobilePlaceholder= document.getElementById('mobile-order-list-placeholder');


     // Assign canvas contexts
     selectionCtx = selectionCanvas.getContext('2d');
     previewCtx = previewCanvas.getContext('2d');
     
     // 3. Set initial state of the uploader
     resetUploader();
     
     // 4. Load from IndexedDB — wait for DB ready first, then load
     (async () => {
 try {
     // wait for IndexedDB to be ready
     if (!window.appDB || !window.appDB.db) {
 await new Promise(resolve => {
     window.addEventListener('indexedDBReady', resolve, { once: true });
     setTimeout(resolve, 5000); // fallback
 });
     }
     const data = await getAppData();
     if (data && data.ORDERS && Object.keys(data.ORDERS).length > 0) {
 processAppData(data);
 return;
     }
 } catch (e) { console.warn('[Uploader] IndexedDB load failed:', e); }
 // no data yet — wait for sync event
 updateStatus('Waiting for app data...');
     })();
 
 
     // --- *** NEW: Responsive Layout Handler *** ---
     const rightPanelEl = document.querySelector('.right-panel');
     const leftPanelEl = document.querySelector('.left-panel');
     desktopRightPanelParent = rightPanelEl.parentNode;
     
     function handleResponsiveLayout() {
const toggleBtn = document.getElementById('toggleOrderListBtn'); // Get button
if (window.innerWidth < 1024) {
    // Mobile View
    if (rightPanelEl.parentNode !== mobilePlaceholder) {
mobilePlaceholder.appendChild(rightPanelEl);
    }
    rightPanelEl.style.height = 'auto';
    rightPanelEl.style.maxHeight = '50vh'; // Set mobile height
    rightPanelEl.style.overflow = 'hidden'; // Keep internal flex scroll
    rightPanelEl.style.borderLeft = 'none';
    rightPanelEl.style.borderBottom = '1px solid #e2e8f0';
    leftPanelEl.style.overflowY = 'visible';
    // *** NEW: Check collapsed state on move ***
    if (rightPanelEl.classList.contains('collapsed')) {
rightPanelEl.style.maxHeight = '56px';
    }

} else {
    // Desktop View
    if (rightPanelEl.parentNode !== desktopRightPanelParent) {
desktopRightPanelParent.appendChild(rightPanelEl);
    }
    rightPanelEl.style.height = '100%';
    rightPanelEl.style.maxHeight = 'none';
    rightPanelEl.style.overflow = 'hidden';
    rightPanelEl.style.borderLeft = '1px solid #e2e8f0';
    rightPanelEl.style.borderBottom = 'none';
    leftPanelEl.style.overflowY = 'auto';

    // *** NEW: Ensure list is not collapsed on desktop ***
    if (rightPanelEl.classList.contains('collapsed')) {
rightPanelEl.classList.remove('collapsed');
if (toggleBtn) toggleBtn.classList.remove('collapsed');
    }
}
     }
     
     // Run on load and on resize
     handleResponsiveLayout();
     window.addEventListener('resize', handleResponsiveLayout);
     // --- *** END: Responsive Layout Handler *** ---
 
 
     // 5. NEW: Add Left Panel UI Listeners
     uploadTypeStrip.addEventListener('click', (e) => {
if (e.target.classList.contains('type-btn')) {
    const selectedType = e.target.dataset.type;
    
    // NEW Toggle Logic
    if (e.target.classList.contains('active')) {
// Clicked an active button - deselect it
e.target.classList.remove('active');
currentUploadType = null;
    } else {
// Clicked an inactive button - select it
uploadTypeStrip.querySelector('.active')?.classList.remove('active');
e.target.classList.add('active');
currentUploadType = selectedType;
    }
    
    console.log("Upload type changed to:", currentUploadType);
    
    // Re-render inputs if an order is already selected
    if (selectedOrder) {
renderDynamicInputs();
    }
}
     });

     // --- === ALL NEW CLICK HANDLERS (from V1) === ---
     
     // --- Camera/Upload Button Handlers ---
     cameraBtn.addEventListener('click', async () => {
if (isProcessingImage) return; // *** BUG FIX: Check lock ***
if (stream) {
    // This is the "Capture" click
    const canvas = document.createElement('canvas');
    canvas.width = cameraFeed.videoWidth;
    canvas.height = cameraFeed.videoHeight;
    canvas.getContext('2d').drawImage(cameraFeed, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    stopCamera();
    imageQueue = []; // Reset queue for single capture mode
    currentImageIndex = 0; // Set index to 0
    imageQueue.push(await dataURLtoFile(dataUrl, `capture-${Date.now()}.png`)); // Add file to queue
    initCropper(dataUrl, `capture-${Date.now()}.png`);
    
} else {
    // This is the "Camera" click
    resetUploader(); // Clear previous state
    placeholder.textContent = 'Starting camera...';
    placeholder.style.display = 'block';

    const constraints = { video: { facingMode: { ideal: "environment" } } };
    try {
stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
       updateStatus("Could not access camera. Check permissions.", true);
       console.error(err);
       resetUploader();
       return;
    }
    
    cameraFeed.style.display = 'block';
    placeholder.style.display = 'none';
    cameraFeed.srcObject = stream;
    cameraFeed.play(); 
    setInterfaceState('streaming');
    cameraFeed.addEventListener('click', handleVideoStreamClick);
}
    });
    
    uploadBtn.addEventListener('click', () => { 
if (isProcessingImage) return; // *** BUG FIX: Check lock ***
fileInput.click(); 
    });
    
    fileInput.addEventListener('change', async (event) => {
if (isProcessingImage) return; // *** BUG FIX: Check lock ***
isProcessingImage = true; // Set lock

const files = Array.from(event.target.files);
if (files.length === 0) {
    isProcessingImage = false;
    return;
}

updateStatus('Processing uploaded files...');
let processedFiles = [];
for (const file of files) {
    if (file.type === 'application/pdf') {
try {
    const pdfImages = await handlePdfFile(file);
    processedFiles.push(...pdfImages);
} catch (error) { 
    updateStatus(`Failed to process PDF: ${file.name}`, true); 
}
    } else if (file.type.startsWith('image/')) {
processedFiles.push(file);
    }
}

if (processedFiles.length > MAX_FILES) {
    updateStatus(`Max ${MAX_FILES} files allowed. Loading first ${MAX_FILES}.`, true);
    processedFiles = processedFiles.slice(0, MAX_FILES);
}
if (processedFiles.length === 0) {
    updateStatus('No valid images found or processed.', true); 
    isProcessingImage = false;
    return;
}

imageQueue = processedFiles;
scrollerContainer.style.display = imageQueue.length > 1 ? 'block' : 'none';
if (imageQueue.length > 1) renderScroller();

isProcessingImage = false; // Release lock *before* displaying image
displayImage(0); // Display the first image in the cropper
updateStatus(`${imageQueue.length} image(s) loaded.`);
    });
     
     // --- Cropper Button Handlers ---
     cropRotateBtn.addEventListener('click', () => {
if (isProcessingImage || !cropper) return; // *** BUG FIX: Check lock ***
cropper.rotate(90); // Use cropper's built-in rotate method
    });
    
    cropCancelBtn.addEventListener('click', () => {
if (isProcessingImage) return; // *** BUG FIX: Check lock ***

inlineCropperWrapper.style.display = 'none';
imageViewArea.style.display = 'flex';
if(cropper) cropper.destroy();
cropper = null;

if (imageQueue.length > 0) {
    // We were in a queue, show the preview screen
    setInterfaceState('preview');
    // We need to re-display the *uncropped* image from the file
    displayImage(currentImageIndex); 
} else {
    // We were not in a queue (e.g., single camera shot), reset
    resetUploader();
}
    });
     
     // --- Preview Button Handlers ---
     rotateBtn.addEventListener('click', () => {
if (isProcessingImage) return; // *** BUG FIX: Check lock ***
if (previewCanvas.style.display === 'block') {
    currentRotation = (currentRotation + 90) % 360;
    drawPreview();
    scanBarcodeFromPreview();
}
    });

    lockBtn.addEventListener('click', () => {
if (isProcessingImage) return; // *** BUG FIX: Check lock ***
isImageLocked = !isImageLocked;
lockBtn.textContent = isImageLocked ? 'Unlock' : 'Lock';
lockBtn.style.backgroundColor = isImageLocked ? '#d4edda' : '';
updateStatus(isImageLocked ? "Image locked. It will not be cleared after picking." : "Image unlocked.");
    });

    cancelBtn.addEventListener('click', () => {
if (isProcessingImage) return; // *** BUG FIX: Check lock ***
if (stream) { // "Done" or "Cancel" in streaming mode
    if (cancelBtn.textContent === 'Done' && imageQueue.length > 0) {
stopCamera();
displayImage(0); // Go to cropper with first image
    } else {
resetUploader(); // Just cancel
    }
    return;
}

// "Cancel" in preview mode
if (isImageLocked) { 
    resetUploader(); // If locked, cancel all
    return; 
}

if (imageQueue.length > 0) {
     imageQueue.splice(currentImageIndex, 1); // Remove current image
     renderScroller();
     // Display next image or reset
     displayImage(currentImageIndex < imageQueue.length ? currentImageIndex : 0);
} else {
    resetUploader();
}
    });

    cancelAllBtn.addEventListener('click', () => {
 if (isProcessingImage) return; // *** BUG FIX: Check lock ***
 resetUploader();
    });
    
    // --- Preview Area Handlers (OCR) ---
    imageViewArea.addEventListener('mousedown', onSelectionStart);
    imageViewArea.addEventListener('touchstart', onSelectionStart, { passive: false });

     // --- Enhancement Button Handlers ---
    enhanceBtn.addEventListener('click', () => { 
if (isProcessingImage) return; // *** BUG FIX: Check lock ***
enhancementControls.style.display = enhancementControls.style.display === 'block' ? 'none' : 'block'; 
    });
    
    resetEnhanceBtn.addEventListener('click', resetEnhancements);
    
    const applyEnhanceDebounce = () => { 
currentEnhancements.brightness = brightnessSlider.value; 
currentEnhancements.contrast = contrastSlider.value; 
applyEnhancements(); 
    };
    brightnessSlider.addEventListener('input', applyEnhanceDebounce);
    contrastSlider.addEventListener('input', applyEnhanceDebounce);
    
    sharpenBtn.addEventListener('click', () => { 
currentEnhancements.sharpen = !currentEnhancements.sharpen; 
sharpenBtn.style.backgroundColor = currentEnhancements.sharpen ? '#d4edda' : ''; 
applyEnhancements(); 
    });
    
    greyscaleBtn.addEventListener('click', () => {
currentEnhancements.greyscale = !currentEnhancements.greyscale;
if (currentEnhancements.greyscale) { 
    currentEnhancements.bw = false; 
    bwBtn.style.backgroundColor = ''; 
}
greyscaleBtn.style.backgroundColor = currentEnhancements.greyscale ? '#d4edda' : ''; 
applyEnhancements();
    });

    bwBtn.addEventListener('click', () => {
currentEnhancements.bw = !currentEnhancements.bw;
if (currentEnhancements.bw) { 
    currentEnhancements.greyscale = false; 
    greyscaleBtn.style.backgroundColor = ''; 
}
bwBtn.style.backgroundColor = currentEnhancements.bw ? '#d4edda' : ''; 
applyEnhancements();
    });

    autoEnhanceBtn.addEventListener('click', () => {
currentEnhancements.sharpen = true; 
currentEnhancements.brightness = 10; 
currentEnhancements.contrast = 10;
currentEnhancements.greyscale = false; 
currentEnhancements.bw = false;

brightnessSlider.value = currentEnhancements.brightness;
contrastSlider.value = currentEnhancements.contrast;
sharpenBtn.style.backgroundColor = '#d4edda';
greyscaleBtn.style.backgroundColor = '';
bwBtn.style.backgroundColor = '';

applyEnhancements();
    });

     // --- === END of V1 CLICK HANDLERS === ---


     // --- *** NEW: Delegated "Pickup Table" click listener *** ---
     dynamicInputArea.addEventListener('click', async (e) => {

const clickedRow = e.target.closest('tr');
if (!clickedRow) return; // Click was not on a row

// --- Handle "Pick" button clicks ---
if (e.target.classList.contains('pick-btn-dynamic')) {
    if (isProcessingImage) return; // Check lock
    
    const pickButton = e.target;
    const pickData = { ...pickButton.dataset }; 
    const parentRow = pickButton.closest('tr');
    
    pickButton.disabled = true; 
    pickButton.textContent = 'Picking...';
    isProcessingImage = true; 

    // 1. CHECK FOR IMAGE
    if (!imagePreview.src || !imagePreview.src.startsWith('data:')) {
updateStatus("No image in preview. Capture or upload an image first.", true);
pickButton.disabled = false;
pickButton.textContent = 'Pick';
isProcessingImage = false; 
return;
    }

    // 2. GATHER DATA (V1 LOGIC)
    let submitRowData = { // *** NEW: Build submit object here ***
uploadType: pickData.type || '', // *** FIX: No 'N/A' ***
refNumber: pickData.ref || '',
awbNumber: pickData.awb || '',
childAwb: '',
customerName: '',
customerUid: '',
kycNumber: '',
kycType: '',
docNumber: '',
docType: '',
statusRemark: '',
branch: selectedOrder?.BRANCH || '',
code: selectedOrder?.CODE || ''
    };
    
    if (pickData.type === 'POD' || pickData.type === 'Reciept') {
const statusInput = parentRow.querySelector('.dynamic-text-input');
pickData.status = statusInput.value.trim() || (pickData.type === 'POD' ? 'Delivered' : 'Booked');
submitRowData.statusRemark = pickData.status;
    } 
    else if (pickData.type === 'KYC') {
const kycNumInput = parentRow.querySelector('.kyc-number-input');
const kycTypeSelect = parentRow.querySelector('.kyc-type-select');
pickData.kycNumber = kycNumInput ? kycNumInput.value.trim() : '';
pickData.kycType = kycTypeSelect ? kycTypeSelect.value : '';

if (!pickData.kycNumber) {
    updateStatus("KYC Number is required.", true);
    kycNumInput.focus();
    pickButton.disabled = false;
    pickButton.textContent = 'Pick';
    isProcessingImage = false; 
    return;
}
submitRowData.customerName = pickData.customerName || '';
submitRowData.customerUid = pickData.customerUid || '';
submitRowData.kycNumber = pickData.kycNumber;
submitRowData.kycType = pickData.kycType;
    }
    else if (pickData.type === 'Product') {
const remarkInput = parentRow.querySelector('.dynamic-text-input');
pickData.remark = remarkInput.value.trim() || 'PAPERS UPLOADED';
submitRowData.docNumber = pickData.docNumber || '';
submitRowData.docType = pickData.docType || '';
submitRowData.statusRemark = pickData.remark;
    }
    else if (pickData.type === 'MultiBox') {
const childAwbInput = parentRow.querySelector('.dynamic-text-input');
pickData.childAwb = childAwbInput.value.trim() || pickData.awb; 
submitRowData.childAwb = pickData.childAwb;
    }
    
    console.log("Dynamic Pick clicked:", pickData);

    try {
// 3. PROCESS IMAGE
updateStatus("Processing image... Please wait.");
const rotatedImageSrc = await getRotatedImage(imagePreview.src, currentRotation);
const finalImageSrc = await compressImage(rotatedImageSrc, 100, 1024);

// 4. POPULATE TABLE

// --- *** NEW BUNDLING LOGIC *** ---
let groupKey = null;
if (pickData.type === 'KYC') {
    groupKey = `KYC_${submitRowData.refNumber}_${submitRowData.customerUid}`;
} else if (pickData.type === 'Product') {
    groupKey = `PROD_${submitRowData.refNumber}_${submitRowData.docNumber}`;
} else if (pickData.type === 'MultiBox') {
    groupKey = `MULTI_${submitRowData.awbNumber}`;
}

let existingRow = groupKey ? Array.from(tableBody.rows).find(row => row.dataset.groupKey === groupKey) : null;

if (existingRow) {
    // Add to existing bundle
    let images = JSON.parse(existingRow.dataset.images);
    images.push(finalImageSrc);
    existingRow.dataset.images = JSON.stringify(images);
    
    // Update UI
    // *** MODIFIED: Find cell by data-label ***
    const statusCell = existingRow.querySelector('td[data-label="Status"]');
    if (statusCell) {
statusCell.textContent = `${pickData.type} (${images.length} images)`;
    }
    const imageCell = existingRow.querySelector('td[data-label="Image"] img');
    if (imageCell) {
imageCell.src = finalImageSrc; // Show latest image
    }
    updateStatus(`Added image to ${pickData.type} bundle.`);
    
} else {
    // Create new row
    const newRow = tableBody.insertRow();
    newRow.dataset.keyRef = pickData.ref || pickData.awb || '';
    newRow.dataset.keyType = pickData.type || '';
    newRow.dataset.imageData = finalImageSrc; // Store for POD/Reciept
    newRow.dataset.images = JSON.stringify([finalImageSrc]); // Store for bundling
    newRow.dataset.submitData = JSON.stringify(submitRowData);
    if (groupKey) {
newRow.dataset.groupKey = groupKey;
    }

    const rowData = {
type: pickData.type || 'N/A',
status: pickData.status || submitRowData.statusRemark || '', // *** FIX: No 'N/A' ***
refAwb: (pickData.type === 'MultiBox')
    ? `Ref: ${pickData.ref || ''} <br> Child: ${pickData.childAwb}`
    : `Ref: ${pickData.ref || ''} <br> AWB: ${pickData.awb || ''}`,
customerKyc: pickData.type === 'KYC' 
    ? `Cust: ${pickData.customerName || ''} <br> UID: ${pickData.customerUid || ''} <br> KYC: ${pickData.kycNumber} (${pickData.kycType})`
    : '', // *** FIX: No 'N/A' ***
docInfo: pickData.type === 'Product'
    ? `Doc: ${pickData.docNumber || ''} <br> Type: ${pickData.docType || ''} <br> Remark: ${pickData.remark}`
    : '', // *** FIX: No 'N/A' ***
image: finalImageSrc
    };
    
    // Update count display for bundles
    let statusText = `${rowData.type} - ${rowData.status}`;
    if(groupKey) statusText = `${rowData.type} (1 image)`;

    // --- *** MODIFIED: Create cells with data-label *** ---
    newRow.insertCell(0).dataset.label = 'Status';
    newRow.cells[0].textContent = statusText;

    newRow.insertCell(1).dataset.label = 'Reference';
    newRow.cells[1].innerHTML = rowData.refAwb;

    newRow.insertCell(2).dataset.label = rowData.customerKyc ? 'Customer/KYC' : 'N/A';
    newRow.cells[2].innerHTML = rowData.customerKyc || 'N/A';

    newRow.insertCell(3).dataset.label = rowData.docInfo ? 'Doc Info' : 'N/A';
    newRow.cells[3].innerHTML = rowData.docInfo || 'N/A';
    
    const imageCell = newRow.insertCell(4);
    imageCell.dataset.label = 'Action';
    const openBtn = document.createElement('button');
    openBtn.className = 'v1-btn';
    openBtn.textContent = 'Preview';
    openBtn.style.fontSize = '0.75rem';
    openBtn.addEventListener('click', () => previewFile(rowData.image, rowData.type || 'Preview'));
    imageCell.appendChild(openBtn);
    
    const hiddenCell = newRow.insertCell(5);
    hiddenCell.textContent = `Branch: ${submitRowData.branch}, Code: ${submitRowData.code}`;
    hiddenCell.style.display = 'none';

    updateStatus(`Added ${pickData.type} for ${pickData.ref} to table.`);
}

// --- *** END BUNDLING LOGIC *** ---

// --- *** NEW: Reset inputs in the picked row *** ---
const inputsToClear = parentRow.querySelectorAll('input[type="text"], .kyc-number-input');
inputsToClear.forEach(input => {
    input.value = ''; // Clear the value
});
// Reset dropdown to first option
const selectsToClear = parentRow.querySelectorAll('select');
selectsToClear.forEach(select => {
    select.selectedIndex = 0;
});

// *** NEW: Deselect the pickup row ***
if (selectedPickupRow) {
    selectedPickupRow.classList.remove('selected-pickup-row');
    selectedPickupRow = null;
}

// *** NEW: Re-render the pickup table to hide the picked row ***
// This will also trigger the new "POD complete" check
renderDynamicInputs();

// 5. RESET
if (!isImageLocked) {
    if (imageQueue.length > 0) {
imageQueue.splice(currentImageIndex, 1);
renderScroller();
isProcessingImage = false; 
displayImage(currentImageIndex < imageQueue.length ? currentImageIndex : 0);
    } else {
resetUploader(); 
    }
} else {
     isProcessingImage = false; 
}

    } catch (err) {
console.error("Failed during pick process:", err);
updateStatus("Error processing image.", true);
isProcessingImage = false; // Release lock on error
    } finally {
if (pickButton) { 
    pickButton.disabled = false;
    pickButton.textContent = 'Pick';
}
    }
}

// --- Handle Row Selection ---
else {
    if (selectedPickupRow) {
selectedPickupRow.classList.remove('selected-pickup-row');
    }
    selectedPickupRow = clickedRow;
    selectedPickupRow.classList.add('selected-pickup-row');
}
     });
     
     
     // --- *** NEW: Table Action Button Listeners *** ---
     deleteLastBtn.addEventListener('click', () => {
if (tableBody.rows.length > 0) {
    tableBody.deleteRow(-1);
    updateStatus("Last entry deleted.");
    // Re-render pickup table to show the task again
    if (selectedOrder) {
renderDynamicInputs();
    }
    resetUploader(); // *** NEW: Clear image cache ***
}
     });

     clearAllBtn.addEventListener('click', () => {
if (tableBody.rows.length > 0) {
    tableBody.innerHTML = '';
    updateStatus("All entries cleared.");
    // Re-render pickup table to show all tasks again
    if (selectedOrder) {
renderDynamicInputs();
    }
    resetUploader(); // *** NEW: Clear image cache ***
}
     });
     
     submitBtn.addEventListener('click', async () => {
if (isProcessingImage) {
    updateStatus('Please wait for image processing to finish.', true);
    return;
}
const rows = tableBody.rows;
if (rows.length === 0) { updateStatus('No data in the table to submit.', true); return; }
if (!isLoggedIn())     { updateStatus('Authentication error: Please re-login.', true); return; }

submitBtn.disabled = true;
let successCount = 0;
const failedRows = [];

for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.style.backgroundColor === 'rgb(212, 237, 218)') { successCount++; continue; }

    updateStatus(`Submitting row ${i + 1} of ${rows.length}...`);

    const rowData = JSON.parse(row.dataset.submitData);
    const images  = JSON.parse(row.dataset.images);

    // Build file: POD/Reciept → single JPEG, others → PDF bundle
    let fileData, contentType;
    if (rowData.uploadType === 'POD' || rowData.uploadType === 'Reciept') {
        fileData    = images[0].split(',')[1];
        contentType = 'image/jpeg';
    } else {
        updateStatus(`Bundling ${images.length} image(s) into PDF...`);
        const pdfDataUrl = await createPdfFromImages(images);
        fileData    = pdfDataUrl.split(',')[1];
        contentType = 'application/pdf';
    }

    const payload = buildUploadPayload(rowData, fileData, contentType);

    try {
        const result = await submitUpload(payload);
successCount++;
row.style.backgroundColor = '#d4edda';
// store the returned URL back into the row for reference
row.dataset.fileUrl = result.url;
    } catch (err) {
console.error('Upload error:', err);
row.style.backgroundColor = '#f8d7da';
failedRows.push(i + 1);
updateStatus(`Error on row ${i + 1}: ${err.message}`, true);
    }
}

submitBtn.disabled = false;
if (failedRows.length > 0) {
    updateStatus(`Failed rows: ${failedRows.join(', ')}. Fix and retry.`, true);
} else {
    updateStatus(`All ${successCount} row(s) submitted successfully.`);
    setTimeout(() => { clearAllBtn.click(); updateStatus('Table cleared.'); }, 2000);
}
     });


     // --- Barcode Detector Init ---
    if (!('BarcodeDetector' in window)) {
console.log('Barcode Detector is not supported by this browser.');
    } else {
console.log('Barcode Detector supported!');
try {
    barcodeDetector = new BarcodeDetector({
formats: ['code_128', 'code_39', 'ean_13', 'qr_code', 'upc_a', 'itf']
    });
} catch (e) {
    console.error('Barcode Detector could not be instantiated.', e);
}
    }
});
