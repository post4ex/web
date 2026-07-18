// ============================================================================
// MINI-UPLOADER.JS — Self-contained uploader modal
// Injects its own HTML into the page on load.
// No order list (reference passed in via miniUploader.setReference())
// Upload types: POD, Reciept, KYC, Product, MultiBox
// ============================================================================

// --- State Variables ---
let hiddenTypes = ['KYC']; // KYC hidden by default; enable on B2B/B2B2C pages
let _savedHiddenTypes = null; // Restored on modal close after setReferenceWithDefaultType
let rbacRestrictedTypes = []; // Computed on load from user role (non-overridable)
function _getRestrictedTypes() { return [...new Set([...hiddenTypes, ...rbacRestrictedTypes])]; }
let ordersData    = {};
let b2b2cMap      = new Map();
let productMap    = new Map();
let uploadsMap    = new Map();
let selectedOrder   = null;
let currentUploadType = null;

// Stubs for uploader-camera.js compatibility (order-matching not used)
const filterAndRenderOrders = () => {};
const searchMiniOrderInput = null;
const orderList = null;
const toggleOrderListBtn = null;
const mobilePlaceholder = { querySelector: () => null };

// --- V1 State Variables (Uploader) ---
let stream = null, currentRotation = 0, isImageLocked = false, cropper = null;
let imageQueue = [], currentImageIndex = -1;
let barcodeDetector;
let originalCropperSrc = null;
const MAX_FILES = 50;
let isSelecting = false, selectionRect = {};
let isProcessingOCR = false;
let isProcessingImage = false;
let selectedPickupRow = null;
let selectionCtx, previewCtx;
let currentEnhancements = { brightness: 0, contrast: 0, sharpen: false, greyscale: false, bw: false };

// --- V1 UI Elements ---
let cameraBtn, uploadBtn, fileInput, placeholder, imagePreview, cameraFeed;
let previewCanvas, rotateBtn, lockBtn, cancelBtn, cancelAllBtn;
let scrollerContainer, scroller;
let inlineCropperWrapper, imageViewArea, cropperImage, cropConfirmBtn, cropCancelBtn;
let cropRotateBtn, selectionCanvas, uploadTypeStrip, statusBar; 
let enhanceBtn, enhancementControls, autoEnhanceBtn, greyscaleBtn, bwBtn, sharpenBtn, resetEnhanceBtn;
let brightnessSlider, contrastSlider;
let tableBody, deleteLastBtn, clearAllBtn, submitBtn;
let dynamicInputArea, existingUploadsContainer, existingTableBody;

// ============================================================================
// MODAL HTML — Self-contained, injected into page on load
// ============================================================================
function _buildUploaderModalHTML() {
    return `<div id="uploaderModal" class="fixed inset-0 z-50 hidden bg-black bg-opacity-50 flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
        <div class="bg-white rounded-lg shadow-2xl w-full max-w-6xl my-2 sm:my-6">
            <div class="flex justify-between items-center px-4 py-2.5 border-b bg-white rounded-t-lg">
                <h3 class="font-bold text-gray-800 text-base">Document Uploader</h3>
                <button id="uploaderModalClose" class="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="p-3 sm:p-5">
                <div id="main-controls-strip" style="width:100%;display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap;padding:8px;background-color:#e9ecef;box-sizing:border-box;">
                    <div class="upload-type-strip" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;">
                        <button class="btn-danger" data-type="POD">POD</button>
                        <button class="btn-danger" data-type="Reciept">Reciept</button>
                        <button class="btn-danger" data-type="KYC">KYC</button>
                        <button class="btn-danger" data-type="Product">Product</button>
                        <button class="btn-danger" data-type="MultiBox">MultiBox</button>
                    </div>
                    <div style="width:1px;height:28px;background-color:#ced4da;"></div>
                    <div class="button-group" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;">
                        <button id="camera-btn" class="btn">Camera</button>
                        <button id="upload-btn" class="btn">Upload</button>
                        <button id="rotate-btn" class="btn-danger">Rotate</button>
                        <button id="lock-btn" class="btn-danger">Lock</button>
                        <button id="cancel-btn" class="btn-danger">Cancel</button>
                        <button id="cancel-all-btn" class="btn-danger">Cancel All</button>
                        <input type="file" id="file-input" accept="image/*,application/pdf" multiple style="display: none;">
                    </div>
                </div>
                <div class="mt-3">
                    <div id="image-scroller-container" style="width:100%;height:80px;background-color:#eee;border:1px solid #ddd;border-radius:4px;padding:5px;box-sizing:border-box;display:none;margin-bottom:15px;">
                        <div id="image-scroller" style="height:100%;display:flex;gap:5px;overflow-x:auto;white-space:nowrap;"></div>
                    </div>
                    <div id="inline-cropper-wrapper" style="display:none;width:100%;padding:10px;box-sizing:border-box;background-color:#f0f0f0;border:2px dashed #1E3A8A;">
                        <div id="cropper-container" style="width:100%;height:60vh;">
                            <img id="cropper-image" src="" style="display:block;max-width:100%;">
                        </div>
                        <div class="button-group" style="margin-top:10px;display:flex;gap:8px;justify-content:center;">
                            <button id="crop-rotate-btn" class="btn-danger">Rotate</button>
                            <button id="enhance-btn" class="btn-danger">Enhance</button>
                            <button id="crop-confirm-btn" class="btn">Crop</button>
                            <button id="crop-cancel-btn" class="btn-danger">Cancel</button>
                        </div>
                        <div id="enhancement-controls" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid #ccc;">
                            <div class="button-group" style="display:flex;gap:8px;justify-content:center;">
                                <button id="auto-enhance-btn" class="btn-danger">Auto</button>
                                <button id="greyscale-btn" class="btn-danger">Greyscale</button>
                                <button id="bw-btn" class="btn-danger">B&amp;W Doc</button>
                                <button id="sharpen-btn" class="btn-danger">Sharpen</button>
                                <button id="reset-enhance-btn" class="btn-danger">Reset</button>
                            </div>
                            <div class="enhancement-sliders" style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:15px;">
                                <div class="slider-control" style="display:flex;align-items:center;gap:10px;width:100%;max-width:280px;justify-content:center;">
                                    <label for="brightness-slider">Brightness</label>
                                    <input type="range" id="brightness-slider" min="-50" max="50" value="0" style="flex-grow:1;">
                                </div>
                                <div class="slider-control" style="display:flex;align-items:center;gap:10px;width:100%;max-width:280px;justify-content:center;">
                                    <label for="contrast-slider">Contrast</label>
                                    <input type="range" id="contrast-slider" min="-50" max="50" value="0" style="flex-grow:1;">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="image-view-area" style="border:2px dashed #ccc;width:100%;aspect-ratio:1/1;display:flex;justify-content:center;align-items:center;text-align:center;color:#888;position:relative;overflow:hidden;background-color:#f0f0f0;cursor:default;">
                        <span id="placeholder">Select Camera or Upload to begin</span>
                        <img id="image-preview" src="" alt="Image preview" style="display:none;"/>
                        <canvas id="preview-canvas" style="width:100%;height:100%;object-fit:contain;display:none;"></canvas>
                        <canvas id="selection-canvas" style="position:absolute;top:0;left:0;display:none;z-index:10;"></canvas>
                        <video id="camera-feed" autoplay playsinline style="width:100%;height:100%;object-fit:cover;display:none;"></video>
                    </div>
                    <div id="status-bar" style="width:100%;padding:8px;box-sizing:border-box;min-height:2.5em;text-align:center;background-color:#e9ecef;border-radius:4px;color:#495057;margin-top:15px;">Initializing...</div>
                    <div id="dynamic-input-area" style="width:100%;margin-top:15px;border:1px solid #e2e8f0;border-radius:4px;background-color:#fafafa;max-height:280px;overflow-y:auto;">
                        <div class="placeholder" style="padding:20px;text-align:center;color:#888;font-style:italic;">Waiting for reference...</div>
                    </div>
                    <div class="data-table-container" style="width:100%;margin-top:15px;overflow-x:auto;max-height:400px;border:1px solid #ccc;border-radius:4px;">
                        <table style="width:100%;border-collapse:collapse;">
                            <thead>
                                <tr id="table-header-row" style="background-color:#f0f0f0;">
                                    <th style="border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;width:15%;">STATUS</th>
                                    <th style="border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;width:20%;">REFERENCE / AWB</th>
                                    <th style="border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;width:25%;">CUSTOMER / KYC INFO</th>
                                    <th style="border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;width:20%;">DOCUMENT INFO</th>
                                    <th style="border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;width:10%;">ACTION</th>
                                    <th style="display:none;">BRANCH / CODE</th>
                                </tr>
                            </thead>
                            <tbody id="data-table-body">
                                <!-- Rows added by JS -->
                            </tbody>
                        </table>
                    </div>
                    <div id="table-actions" style="width:100%;margin-top:15px;display:flex;gap:8px;justify-content:flex-end;">
                        <button id="delete-last-btn" class="btn-danger">Delete Last</button>
                        <button id="clear-all-btn" class="btn-danger">Clear All</button>
                        <button id="submit-btn" class="btn">Submit</button>
                    </div>
                    <div id="existing-uploads-container" style="display:none;margin-top:25px;border-top:2px solid #1E3A8A;padding-top:10px;">
                        <h3 style="font-size:1.125rem;font-weight:600;margin-bottom:10px;color:#1E3A8A;">Existing Uploads for this Order</h3>
                        <div id="existing-uploads-table" class="data-table-container" style="width:100%;margin-top:5px;overflow-x:auto;max-height:300px;border:1px solid #ccc;border-radius:4px;">
                            <table style="width:100%;border-collapse:collapse;">
                                <thead>
                                    <tr id="existing-table-header-row" style="background-color:#f0f0f0;">
                                        <th style="border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;">STATUS</th>
                                        <th style="border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;">REFERENCE / AWB</th>
                                        <th style="border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;">CUSTOMER / KYC INFO</th>
                                        <th style="border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;">DOCUMENT INFO</th>
                                        <th style="border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;white-space:nowrap;position:sticky;top:0;z-index:2;">ACTION</th>
                                        <th style="display:none;">BRANCH / CODE</th>
                                    </tr>
                                </thead>
                                <tbody id="existing-data-table-body">
                                    <!-- Rows added by JS -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// --- KYC Options ---
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

// --- Data Processing ---
function processAppData(detail) {
    const data = (detail && detail.data) ? detail.data : (detail || {});
    ordersData = data.ORDERS || {};

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

    // Refresh if we already have a reference set
    if (selectedOrder) {
        selectedOrder = ordersData[selectedOrder.REFERENCE] || null;
        if (selectedOrder) renderDynamicInputs();
    }

    updateStatus('App data loaded. Ready.');
}

function initializeV1DataListeners() {
    window.addEventListener('appDataLoaded', (e) => {
        processAppData(e.detail);
    });
    window.addEventListener('appDataRefreshed', (e) => {
        processAppData(e.detail);
    });
}

// --- Existing Uploads ---
function renderExistingUploadsForOrder(order) {
    if (!existingTableBody || !order) {
        if (existingUploadsContainer) existingUploadsContainer.style.display = 'none';
        return;
    }
    existingTableBody.innerHTML = '';
    const matchingUploads = uploadsMap.get(String(order.REFERENCE)) || [];
    if (matchingUploads.length === 0) {
        existingUploadsContainer.style.display = 'none';
        return;
    }
    matchingUploads.forEach(upload => {
        const consignorName = selectedOrder?.CONSIGNOR_NAME || 'N/A';
        const consigneeName = selectedOrder?.CONSIGNEE_NAME || 'N/A';
        const newRow = existingTableBody.insertRow();
        newRow.dataset.keyRef = upload.REFERENCE || upload.AWB_NUMBER;
        newRow.dataset.keyType = upload.UPLOAD_TYPE;
        newRow.dataset.branch = upload.BRANCH || '';
        newRow.dataset.code = upload.CODE || '';

        const rowData = {
            type: upload.UPLOAD_TYPE || 'N/A',
            status: upload.STATUS_REMARK || '',
            refAwb: (upload.UPLOAD_TYPE === 'MultiBox')
                ? `Ref: ${upload.REFERENCE || upload.AWB_NUMBER} <br> Child: ${upload.CHILD_AWB}`
                : `Ref: ${upload.REFERENCE || ''} <br> AWB: ${upload.AWB_NUMBER || ''}`,
            customerKyc: upload.UPLOAD_TYPE === 'KYC' 
                ? `Cust: ${consignorName} <br> UID: ${upload.CUSTOMER_UID || ''} <br> KYC: ${upload.KYC_NUMBER} (${upload.KYC_TYPE})`
                : '',
            docInfo: upload.UPLOAD_TYPE === 'Product'
                ? `Doc: ${upload.DOC_NUMBER || ''} <br> Type: ${upload.DOC_TYPE || ''} <br> Remark: ${upload.STATUS_REMARK || ''}`
                : '',
            image: upload.FILE_URL
        };
        if (upload.UPLOAD_TYPE === 'Reciept' && !upload.STATUS_REMARK) rowData.status = 'Booked';
        if (upload.UPLOAD_TYPE === 'POD' && !upload.STATUS_REMARK) rowData.status = 'Delivered';

        newRow.insertCell(0).dataset.label = 'Status';
        newRow.cells[0].textContent = `${rowData.type} - ${rowData.status}`;
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
        openBtn.addEventListener('click', () => previewFile(rowData.image, rowData.type));
        imageCell.appendChild(openBtn);
        const userLevel = ROLE_LEVELS[getUser().ROLE] || 0;
        if (userLevel >= ROLE_LEVELS['MANAGER']) {
            const delBtn = document.createElement('button');
            delBtn.className = 'v1-btn';
            delBtn.textContent = 'Delete';
            delBtn.style.cssText = 'font-size:0.75rem;background:#f8d7da;border-color:#f5c6cb;margin-left:4px;';
            delBtn.addEventListener('click', () => deleteUploadRecord(upload.UPLOAD_UID, delBtn));
            imageCell.appendChild(delBtn);
        }
        const hiddenCell = newRow.insertCell(5);
        hiddenCell.textContent = `Branch: ${upload.BRANCH}, Code: ${upload.CODE}`;
        hiddenCell.style.display = 'none';
    });
    existingUploadsContainer.style.display = 'block';
}

// --- Dynamic Input Logic ---
function checkUploadStatus(ref, awb) {
    const status = { pod: false, reciept: false };
    const rows = tableBody.rows;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const keyRef = row.dataset.keyRef;
        const keyType = row.dataset.keyType;
        const refMatch = String(keyRef) === String(ref) || (awb && String(keyRef) === String(awb));
        if (refMatch && keyType === 'POD') status.pod = true;
        if (refMatch && keyType === 'Reciept') status.reciept = true;
    }
    (uploadsMap.get(String(ref)) || []).forEach(upload => {
        if (upload.UPLOAD_TYPE === 'POD')     status.pod     = true;
        if (upload.UPLOAD_TYPE === 'Reciept') status.reciept = true;
    });
    return status;
}

function createPickButton(pickData) {
    const button = document.createElement('button');
    button.className = 'btn-danger';
    button.textContent = 'Pick';
    for (const [key, val] of Object.entries(pickData)) {
        button.dataset[key] = val;
    }
    return button;
}

function renderPodRow(tableBody, { ref, awb }) {
    const pickData = { 'type': 'POD', 'ref': ref, 'awb': awb };
    const row = tableBody.insertRow();
    row.innerHTML = `
<td data-label="Type">POD</td>
<td data-label="Reference">${ref} / ${awb}</td>
<td data-label="Details">Status</td>
<td data-label="Input"><input type="text" class="dynamic-text-input" placeholder="Delivered (default)"></td>
    `;
    const actionCell = row.insertCell();
    actionCell.dataset.label = "Action";
    actionCell.appendChild(createPickButton(pickData));
}

function renderReceiptRow(tableBody, { ref, awb }) {
    const pickData = { 'type': 'Reciept', 'ref': ref, 'awb': awb };
    const row = tableBody.insertRow();
    row.innerHTML = `
<td data-label="Type">Reciept</td>
<td data-label="Reference">${ref} / ${awb}</td>
<td data-label="Details">Status</td>
<td data-label="Input"><input type="text" class="dynamic-text-input" placeholder="Booked (default)"></td>
    `;
    const actionCell = row.insertCell();
    actionCell.dataset.label = "Action";
    actionCell.appendChild(createPickButton(pickData));
}

function renderKycRows(tableBody, { ref, consignorName, consignorUid, consigneeName, consigneeUid }) {
    let pickData = { 'type': 'KYC', 'ref': ref, 'customerName': consignorName, 'customerUid': consignorUid };
    const kycRow1 = tableBody.insertRow();
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
    let actionCell1 = kycRow1.insertCell();
    actionCell1.dataset.label = "Action";
    actionCell1.appendChild(createPickButton(pickData));
    
    pickData = { 'type': 'KYC', 'ref': ref, 'customerName': consigneeName, 'customerUid': consigneeUid };
    const kycRow2 = tableBody.insertRow();
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
    let actionCell2 = kycRow2.insertCell();
    actionCell2.dataset.label = "Action";
    actionCell2.appendChild(createPickButton(pickData));
}

function renderProductRows(tableBody, { ref }) {
    const products = productMap.get(String(ref)) || [];
    if (products.length > 0) {
        products.forEach(product => {
            const docNum = product.DOC_NUMBER || '';
            const docType = product.TYPE || '';
            const pickData = { 'type': 'Product', 'ref': ref, 'docNumber': docNum, 'docType': docType };
            const productRow = tableBody.insertRow();
            productRow.innerHTML = `
<td data-label="Type">Product</td>
<td data-label="Reference">${ref}</td>
<td data-label="Details">Doc: ${docNum || 'N/A'} (${docType || 'N/A'})</td>
<td data-label="Input"><input type="text" class="dynamic-text-input" placeholder="PAPERS UPLOADED (default)"></td>
    `;
            const actionCell = productRow.insertCell();
            actionCell.dataset.label = "Action";
            actionCell.appendChild(createPickButton(pickData));
        });
    } else if (currentUploadType === 'Product') {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:15px;color:#888;">No products found for this order.</td></tr>';
    }
}

function renderMultiBoxRow(tableBody, { ref, awb }) {
    const pickData = { 'type': 'MultiBox', 'ref': ref, 'awb': awb };
    const multiBoxRow = tableBody.insertRow();
    multiBoxRow.innerHTML = `
<td data-label="Type">MultiBox</td>
<td data-label="Reference">${ref} / ${awb}</td>
<td data-label="Details">Child AWB</td>
<td data-label="Input"><input type="text" class="dynamic-text-input" placeholder="Enter Child AWB (default: ${awb})"></td>
    `;
    const actionCell = multiBoxRow.insertCell();
    actionCell.dataset.label = "Action";
    actionCell.appendChild(createPickButton(pickData));
}

function renderDynamicInputs() {
    if (!dynamicInputArea) return;
    dynamicInputArea.innerHTML = '';
    selectedPickupRow = null;
    if (existingUploadsContainer) existingUploadsContainer.style.display = 'none';
    if (existingTableBody) existingTableBody.innerHTML = '';

    if (!selectedOrder) {
        dynamicInputArea.innerHTML = '<div class="placeholder" style="padding:20px;text-align:center;color:#888;font-style:italic;">Waiting for reference...</div>';
        return;
    }

    const ref = selectedOrder.REFERENCE;
    const awb = selectedOrder.AWB_NUMBER || '';
    const consignorUid = selectedOrder.CONSIGNOR;
    const consigneeUid = selectedOrder.CONSIGNEE;
    const cnor = b2b2cMap.get(consignorUid);
    const consignorName = cnor?.NAME || `UID: ${consignorUid}`;
    const cnee = b2b2cMap.get(consigneeUid);
    const consigneeName = cnee?.NAME || `UID: ${consigneeUid}`;
    selectedOrder.CONSIGNOR_NAME = consignorName;
    selectedOrder.CONSIGNEE_NAME = consigneeName;
    const orderDetails = { ref, awb, consignorUid, consignorName, consigneeUid, consigneeName };

    const uploadStatus = checkUploadStatus(ref, awb);

    // If POD is already uploaded (and not hidden), stop showing tasks
    if (!_getRestrictedTypes().includes('POD') && uploadStatus.pod) {
        dynamicInputArea.innerHTML = '<div class="placeholder" style="color:green;font-weight:bold;padding:20px;text-align:center;">POD already uploaded for this order. No further tasks available.</div>';
        renderExistingUploadsForOrder(selectedOrder);
        return;
    }

    const table = document.createElement('table');
    table.className = 'pickup-table';
    const tableHead = `<thead><tr><th>TYPE</th><th>REFERENCE</th><th>DETAILS</th><th>INPUT</th><th>ACTION</th></tr></thead>`;
    const tbody = document.createElement('tbody');

    const restricted = _getRestrictedTypes();
    if (currentUploadType === null) {
        if (!restricted.includes('POD')) renderPodRow(tbody, orderDetails);
        if (!uploadStatus.reciept && !restricted.includes('Reciept')) renderReceiptRow(tbody, orderDetails);
        if (!restricted.includes('KYC')) renderKycRows(tbody, orderDetails);
        if (!restricted.includes('Product')) renderProductRows(tbody, orderDetails);
        if (!restricted.includes('MultiBox')) renderMultiBoxRow(tbody, orderDetails);
    } else {
        switch (currentUploadType) {
            case 'POD':
                if (!restricted.includes('POD')) renderPodRow(tbody, orderDetails);
                break;
            case 'Reciept':
                if (!uploadStatus.reciept && !restricted.includes('Reciept')) renderReceiptRow(tbody, orderDetails);
                break;
            case 'KYC':
                if (!restricted.includes('KYC')) renderKycRows(tbody, orderDetails);
                break;
            case 'Product':
                if (!restricted.includes('Product')) renderProductRows(tbody, orderDetails);
                break;
            case 'MultiBox':
                if (!restricted.includes('MultiBox')) renderMultiBoxRow(tbody, orderDetails);
                break;
            default:
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:15px;color:#888;">Input logic for "${currentUploadType}" not defined.</td></tr>`;
        }
    }

    table.innerHTML = tableHead;
    table.appendChild(tbody);
    dynamicInputArea.appendChild(table);
    renderExistingUploadsForOrder(selectedOrder);
}

// --- Main DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inject modal HTML into the page (self-contained — no HTML needed in the page)
    if (!document.getElementById('uploaderModal')) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = _buildUploaderModalHTML();
        document.body.appendChild(wrapper.firstElementChild);
    }

    // 2. UI Elements
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
    dynamicInputArea = document.getElementById('dynamic-input-area');
    existingUploadsContainer = document.getElementById('existing-uploads-container');
    existingTableBody = document.getElementById('existing-data-table-body');

    // Canvas contexts
    selectionCtx = selectionCanvas.getContext('2d');
    previewCtx = previewCanvas.getContext('2d');

    // Initial state
    resetUploader();
    updateStatus('Ready. Select a reference to begin.');

    // RBAC: Restrict Reciept & POD from CLIENT users
    const userRole = getUser()?.ROLE || '';
    const userLevel = ROLE_LEVELS[userRole] || 0;
    if (userLevel < ROLE_LEVELS['STAFF']) {
        rbacRestrictedTypes = ['Reciept', 'POD'];
    }

    // Data listeners
    initializeV1DataListeners();

    // --- Upload Type Strip ---
    uploadTypeStrip.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-danger') && e.target.dataset.type) {
            const selectedType = e.target.dataset.type;
            if (e.target.classList.contains('active')) {
                e.target.classList.remove('active');
                currentUploadType = null;
            } else {
                uploadTypeStrip.querySelector('.active')?.classList.remove('active');
                e.target.classList.add('active');
                currentUploadType = selectedType;
            }
            if (selectedOrder) renderDynamicInputs();
        }
    });

    // --- Camera ---
    cameraBtn.addEventListener('click', async () => {
        if (isProcessingImage) return;
        if (stream) {
            const canvas = document.createElement('canvas');
            const vw = cameraFeed.videoWidth, vh = cameraFeed.videoHeight;
            const size = Math.min(vw, vh);
            const sx = (vw - size) / 2, sy = (vh - size) / 2;
            canvas.width = size;
            canvas.height = size;
            canvas.getContext('2d').drawImage(cameraFeed, sx, sy, size, size, 0, 0, size, size);
            const dataUrl = canvas.toDataURL('image/png');
            stopCamera();
            imageQueue = [];
            currentImageIndex = 0;
            imageQueue.push(await dataURLtoFile(dataUrl, `capture-${Date.now()}.png`));
            initCropper(dataUrl, `capture-${Date.now()}.png`);
        } else {
            resetUploader();
            placeholder.textContent = 'Starting camera...';
            placeholder.style.display = 'block';
            // Firefox falls back to blurry 640x480 if constraints fail.
            // On mobile portrait, width is smaller (e.g. 720x1280). 
            // Asking for width:{min:1280} fails on 720p screens, triggering the blurry fallback!
            // Fix: Ask for min:720 on both axes, and ideal:4096 so it maximizes resolution.
            const _camConstraints = [
                { facingMode: { exact: 'environment' }, width: { min: 720, ideal: 4096 }, height: { min: 720, ideal: 4096 } },
                { facingMode: { exact: 'environment' }, width: { ideal: 4096 }, height: { ideal: 4096 } },
                { facingMode: { exact: 'environment' } },
                { facingMode: { ideal: 'environment' } },
            ];
            let _opened = false;
            for (const vc of _camConstraints) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: vc });
                    _opened = true;
                    break;
                } catch (_) {}
            }
            if (!_opened) {
                updateStatus('Could not access camera. Check permissions.', true);
                resetUploader();
                return;
            }
            const track = stream.getVideoTracks()[0];
            // Chrome: continuous autofocus
            if (track && typeof track.applyConstraints === 'function') {
                track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
            }
            // Firefox: grabFrame() triggers hardware autofocus
            if ('ImageCapture' in window && track) {
                setTimeout(() => {
                    try { new ImageCapture(track).grabFrame().catch(() => {}); } catch (_) {}
                }, 600);
            }
            cameraFeed.style.display = 'block';
            placeholder.style.display = 'none';
            cameraFeed.srcObject = stream;
            cameraFeed.play();
            setInterfaceState('streaming');
            cameraFeed.addEventListener('click', handleVideoStreamClick);
        }
    });

    // --- Upload ---
    uploadBtn.addEventListener('click', () => { if (isProcessingImage) return; fileInput.click(); });

    fileInput.addEventListener('change', async (event) => {
        if (isProcessingImage) return;
        isProcessingImage = true;
        const files = Array.from(event.target.files);
        if (files.length === 0) { isProcessingImage = false; return; }
        updateStatus('Processing uploaded files...');
        let processedFiles = [];
        for (const file of files) {
            if (file.type === 'application/pdf') {
                try {
                    const pdfImages = await handlePdfFile(file);
                    processedFiles.push(...pdfImages);
                } catch (error) { updateStatus(`Failed to process PDF: ${file.name}`, true); }
            } else if (file.type.startsWith('image/')) {
                processedFiles.push(file);
            }
        }
        if (processedFiles.length > MAX_FILES) {
            updateStatus(`Max ${MAX_FILES} files allowed. Loading first ${MAX_FILES}.`, true);
            processedFiles = processedFiles.slice(0, MAX_FILES);
        }
        if (processedFiles.length === 0) { updateStatus('No valid images found.', true); isProcessingImage = false; return; }
        imageQueue = processedFiles;
        scrollerContainer.style.display = imageQueue.length > 1 ? 'block' : 'none';
        if (imageQueue.length > 1) renderScroller();
        isProcessingImage = false;
        displayImage(0);
        updateStatus(`${imageQueue.length} image(s) loaded.`);
    });

    // --- Cropper ---
    cropRotateBtn.addEventListener('click', () => { if (isProcessingImage || !cropper) return; cropper.rotate(90); });

    cropCancelBtn.addEventListener('click', () => {
        if (isProcessingImage) return;
        inlineCropperWrapper.style.display = 'none';
        imageViewArea.style.display = 'flex';
        if (cropper) cropper.destroy();
        cropper = null;
        if (imageQueue.length > 0) { setInterfaceState('preview'); displayImage(currentImageIndex); }
        else { resetUploader(); }
    });

    // --- Preview ---
    rotateBtn.addEventListener('click', () => {
        if (isProcessingImage) return;
        if (previewCanvas.style.display === 'block') {
            currentRotation = (currentRotation + 90) % 360;
            drawPreview();
        }
    });

    lockBtn.addEventListener('click', () => {
        if (isProcessingImage) return;
        isImageLocked = !isImageLocked;
        lockBtn.textContent = isImageLocked ? 'Unlock' : 'Lock';
        lockBtn.style.backgroundColor = isImageLocked ? '#d4edda' : '';
        updateStatus(isImageLocked ? "Image locked." : "Image unlocked.");
    });

    cancelBtn.addEventListener('click', () => {
        if (isProcessingImage) return;
        if (stream) {
            if (cancelBtn.textContent === 'Done' && imageQueue.length > 0) { stopCamera(); displayImage(0); }
            else { resetUploader(); }
            return;
        }
        if (isImageLocked) { resetUploader(); return; }
        if (imageQueue.length > 0) {
            imageQueue.splice(currentImageIndex, 1);
            renderScroller();
            displayImage(currentImageIndex < imageQueue.length ? currentImageIndex : 0);
        } else { resetUploader(); }
    });

    cancelAllBtn.addEventListener('click', () => { if (isProcessingImage) return; resetUploader(); });

    // --- OCR Selection ---
    imageViewArea.addEventListener('mousedown', onSelectionStart);
    imageViewArea.addEventListener('touchstart', onSelectionStart, { passive: false });

    // --- Enhancements ---
    enhanceBtn.addEventListener('click', () => {
        if (isProcessingImage) return;
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
        if (currentEnhancements.greyscale) { currentEnhancements.bw = false; bwBtn.style.backgroundColor = ''; }
        greyscaleBtn.style.backgroundColor = currentEnhancements.greyscale ? '#d4edda' : '';
        applyEnhancements();
    });

    bwBtn.addEventListener('click', () => {
        currentEnhancements.bw = !currentEnhancements.bw;
        if (currentEnhancements.bw) { currentEnhancements.greyscale = false; greyscaleBtn.style.backgroundColor = ''; }
        bwBtn.style.backgroundColor = currentEnhancements.bw ? '#d4edda' : '';
        applyEnhancements();
    });

    autoEnhanceBtn.addEventListener('click', () => {
        currentEnhancements.sharpen = true;
        currentEnhancements.brightness = 10;
        currentEnhancements.contrast = 10;
        currentEnhancements.greyscale = false;
        currentEnhancements.bw = false;
        brightnessSlider.value = 10;
        contrastSlider.value = 10;
        sharpenBtn.style.backgroundColor = '#d4edda';
        greyscaleBtn.style.backgroundColor = '';
        bwBtn.style.backgroundColor = '';
        applyEnhancements();
    });

    // --- Dynamic Input Pick Handler ---
    dynamicInputArea.addEventListener('click', async (e) => {
        const clickedRow = e.target.closest('tr');
        if (!clickedRow) return;

        if (e.target.classList.contains('btn-danger') && e.target.dataset.type) {
            if (isProcessingImage) return;
            const pickButton = e.target;
            const pickData = { ...pickButton.dataset };
            const parentRow = pickButton.closest('tr');
            pickButton.disabled = true;
            pickButton.textContent = 'Picking...';
            isProcessingImage = true;

            if (!imagePreview.src || !imagePreview.src.startsWith('data:')) {
                updateStatus("No image in preview. Capture or upload first.", true);
                pickButton.disabled = false;
                pickButton.textContent = 'Pick';
                isProcessingImage = false;
                return;
            }

            let submitRowData = {
                uploadType: pickData.type || '',
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
                const defaultStatus = pickData.type === 'POD' ? 'Delivered' : 'Booked';
                pickData.status = statusInput.value.trim() || defaultStatus;
                submitRowData.statusRemark = pickData.status;
            } else if (pickData.type === 'KYC') {
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
            } else if (pickData.type === 'Product') {
                const remarkInput = parentRow.querySelector('.dynamic-text-input');
                pickData.remark = remarkInput.value.trim() || 'PAPERS UPLOADED';
                submitRowData.docNumber = pickData.docNumber || '';
                submitRowData.docType = pickData.docType || '';
                submitRowData.statusRemark = pickData.remark;
            } else if (pickData.type === 'MultiBox') {
                const childAwbInput = parentRow.querySelector('.dynamic-text-input');
                pickData.childAwb = childAwbInput.value.trim() || pickData.awb;
                submitRowData.childAwb = pickData.childAwb;
            }

            try {
                updateStatus("Processing image...");
                const rotatedImageSrc = await getRotatedImage(imagePreview.src, currentRotation);
                const finalImageSrc = await compressImage(rotatedImageSrc, 100, 1024);

                let groupKey = null;
                if (pickData.type === 'KYC') groupKey = `KYC_${submitRowData.refNumber}_${submitRowData.customerUid}`;
                else if (pickData.type === 'Product') groupKey = `PROD_${submitRowData.refNumber}_${submitRowData.docNumber}`;
                else if (pickData.type === 'MultiBox') groupKey = `MULTI_${submitRowData.awbNumber}`;

                let existingRow = groupKey ? Array.from(tableBody.rows).find(row => row.dataset.groupKey === groupKey) : null;

                if (existingRow) {
                    let images = JSON.parse(existingRow.dataset.images);
                    images.push(finalImageSrc);
                    existingRow.dataset.images = JSON.stringify(images);
                    const statusCell = existingRow.querySelector('td[data-label="Status"]');
                    if (statusCell) statusCell.textContent = `${pickData.type} (${images.length} images)`;
                    const imageCell = existingRow.querySelector('td[data-label="Action"] img');
                    if (imageCell) imageCell.src = finalImageSrc;
                    updateStatus(`Added image to ${pickData.type} bundle.`);
                } else {
                    const newRow = tableBody.insertRow();
                    newRow.dataset.keyRef = pickData.ref || pickData.awb || '';
                    newRow.dataset.keyType = pickData.type || '';
                    newRow.dataset.imageData = finalImageSrc;
                    newRow.dataset.images = JSON.stringify([finalImageSrc]);
                    newRow.dataset.submitData = JSON.stringify(submitRowData);
                    if (groupKey) newRow.dataset.groupKey = groupKey;

                    const rowData = {
                        type: pickData.type || 'N/A',
                        status: pickData.status || submitRowData.statusRemark || '',
                        refAwb: (pickData.type === 'MultiBox')
                            ? `Ref: ${pickData.ref || ''} <br> Child: ${pickData.childAwb}`
                            : `Ref: ${pickData.ref || ''} <br> AWB: ${pickData.awb || ''}`,
                        customerKyc: pickData.type === 'KYC'
                            ? `Cust: ${pickData.customerName || ''} <br> UID: ${pickData.customerUid || ''} <br> KYC: ${pickData.kycNumber} (${pickData.kycType})`
                            : '',
                        docInfo: pickData.type === 'Product'
                            ? `Doc: ${pickData.docNumber || ''} <br> Type: ${pickData.docType || ''} <br> Remark: ${pickData.remark}`
                            : '',
                        image: finalImageSrc
                    };

                    let statusText = `${rowData.type} - ${rowData.status}`;
                    if (groupKey) statusText = `${rowData.type} (1 image)`;

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

                // Clear inputs
                const inputsToClear = parentRow.querySelectorAll('input[type="text"], .kyc-number-input');
                inputsToClear.forEach(input => input.value = '');
                const selectsToClear = parentRow.querySelectorAll('select');
                selectsToClear.forEach(select => select.selectedIndex = 0);
                if (selectedPickupRow) {
                    selectedPickupRow.classList.remove('selected-pickup-row');
                    selectedPickupRow = null;
                }
                renderDynamicInputs();

                if (!isImageLocked) {
                    if (imageQueue.length > 0) {
                        imageQueue.splice(currentImageIndex, 1);
                        renderScroller();
                        isProcessingImage = false;
                        displayImage(currentImageIndex < imageQueue.length ? currentImageIndex : 0);
                    } else { resetUploader(); }
                } else { isProcessingImage = false; }

            } catch (err) {
                updateStatus("Error processing image.", true);
                isProcessingImage = false;
            } finally {
                if (pickButton) { pickButton.disabled = false; pickButton.textContent = 'Pick'; }
            }
        } else {
            if (selectedPickupRow) selectedPickupRow.classList.remove('selected-pickup-row');
            selectedPickupRow = clickedRow;
            selectedPickupRow.classList.add('selected-pickup-row');
        }
    });

    // --- Table Actions ---
    deleteLastBtn.addEventListener('click', () => {
        if (tableBody.rows.length > 0) {
            tableBody.deleteRow(-1);
            updateStatus("Last entry deleted.");
            if (selectedOrder) renderDynamicInputs();
            resetUploader();
        }
    });

    clearAllBtn.addEventListener('click', () => {
        if (tableBody.rows.length > 0) {
            tableBody.innerHTML = '';
            updateStatus("All entries cleared.");
            if (selectedOrder) renderDynamicInputs();
            resetUploader();
        }
    });

    submitBtn.addEventListener('click', async () => {
        if (isProcessingImage) { updateStatus('Please wait for image processing to finish.', true); return; }
        const rows = tableBody.rows;
        if (rows.length === 0) { updateStatus('No data in the table to submit.', true); return; }
        if (!isLoggedIn()) { updateStatus('Authentication error: Please re-login.', true); return; }

        submitBtn.disabled = true;
        let successCount = 0;
        const failedRows = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.style.backgroundColor === 'rgb(212, 237, 218)') { successCount++; continue; }
            updateStatus(`Submitting row ${i + 1} of ${rows.length}...`);
            const rowData = JSON.parse(row.dataset.submitData);
            const images = JSON.parse(row.dataset.images);
            let fileData, contentType;
            if (rowData.uploadType === 'POD' || rowData.uploadType === 'Reciept') {
                fileData = images[0].split(',')[1];
                contentType = 'image/jpeg';
            } else {
                updateStatus(`Bundling ${images.length} image(s) into PDF...`);
                const pdfDataUrl = await createPdfFromImages(images);
                fileData = pdfDataUrl.split(',')[1];
                contentType = 'application/pdf';
            }
            const payload = buildUploadPayload(rowData, fileData, contentType);
            try {
                const result = await submitUpload(payload);
                successCount++;
                row.style.backgroundColor = '#d4edda';
                row.dataset.fileUrl = result.url;
            } catch (err) {
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

    // --- Modal Close Handlers ---
    const closeBtn = document.getElementById('uploaderModalClose');
    const modal = document.getElementById('uploaderModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => window.miniUploader.close());
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) window.miniUploader.close();
        });
    }

    // --- Barcode Detector ---
    if (!('BarcodeDetector' in window)) {
        console.log('Barcode Detector not supported.');
    } else {
        try {
            barcodeDetector = new BarcodeDetector({
                formats: ['code_128', 'code_39', 'ean_13', 'qr_code', 'upc_a', 'itf']
            });
        } catch (e) {
            console.error('Barcode Detector could not be instantiated.', e);
        }
    }
});

// ============================================================================
// PUBLIC API — called by edit-order.js / book-order.js / shipments.js
// ============================================================================
window.miniUploader = {
    currentRef: null,

    setReference(ref) {
        if (!ref) return;
        this.currentRef = ref;
        selectedOrder = ordersData[ref] || null;
        if (selectedOrder) {
            renderDynamicInputs();
            updateStatus(`Ready. Uploading for: ${selectedOrder.AWB_NUMBER || ref}`);
        } else {
            updateStatus(`Order ${ref} not found in local data.`, true);
        }
        // Hide type buttons from both hiddenTypes and RBAC restrictions
        const allHidden = [...new Set([...hiddenTypes, ...rbacRestrictedTypes])];
        allHidden.forEach(type => {
            const btn = uploadTypeStrip?.querySelector(`button[data-type="${type}"]`);
            if (btn) btn.style.display = 'none';
        });
        const modal = document.getElementById('uploaderModal');
        if (modal) modal.classList.remove('hidden');
        return selectedOrder ? true : false;
    },

set hiddenTypes(val) { hiddenTypes = val; },
get hiddenTypes() { return hiddenTypes; },
get effectiveHiddenTypes() { return [...new Set([...hiddenTypes, ...rbacRestrictedTypes])]; },

    setReferenceWithDefaultType(ref, defaultType) {
        if (!ref || !defaultType) return this.setReference(ref);
        // Save current hiddenTypes to restore on close
        _savedHiddenTypes = [...hiddenTypes];
        // Temporarily hide all types except the default
        const allTypes = ['POD', 'Reciept', 'KYC', 'Product', 'MultiBox'];
        hiddenTypes = allTypes.filter(t => t !== defaultType);
        const result = this.setReference(ref);
        if (result) {
            setTimeout(() => {
                const btn = uploadTypeStrip?.querySelector(`button[data-type="${defaultType}"]`);
                if (btn && btn.style.display !== 'none') btn.click();
            }, 200);
        }
        return result;
    },

    close() {
        const modal = document.getElementById('uploaderModal');
        if (modal) modal.classList.add('hidden');
        this.clear();
    },

    clear() {
        // Restore hiddenTypes from setReferenceWithDefaultType if needed
        if (_savedHiddenTypes !== null) {
            hiddenTypes = _savedHiddenTypes;
            _savedHiddenTypes = null;
        }
        selectedOrder = null;
        this.currentRef = null;
        if (tableBody) tableBody.innerHTML = '';
        if (dynamicInputArea) {
            dynamicInputArea.innerHTML = '<div class="placeholder" style="padding:20px;text-align:center;color:#888;font-style:italic;">Waiting for reference...</div>';
        }
        if (existingUploadsContainer) existingUploadsContainer.style.display = 'none';
        if (existingTableBody) existingTableBody.innerHTML = '';
        resetUploader();
        updateStatus('Cleared. Waiting for reference...');
    }
};
