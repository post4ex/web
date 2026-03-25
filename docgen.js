// --- MOVED TO GLOBAL SCOPE ---
// --- MODIFIED: Renders ALL documents ---
function renderDocumentWorkshop(order) {
    // We still have access to all the data, e.g.:
    // NOTE: This function relies on global variables defined in the main HTML:
    // b2b2cDataMap, productDataMap, multiboxDataMap, trackDataMap, ui
    const ref = order.REFERANCE;
    const cnor = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee = b2b2cDataMap.get(order.CONSIGNEE);
    const products = productDataMap.get(ref) || [];
    const multiboxItems = multiboxDataMap.get(ref) || []; // ADDED
    const tracking = trackDataMap.get(ref);
    
    let workshopContent = `
        <div class="space-y-4">
            <!-- Section 1: RECIEPT -->
            <details class="doc-section" id="doc-section-reciept">
                <summary>RECIEPT</summary>
                <div class="doc-section-content">
                    <!-- ADDED: Print Button -->
                    <div class="flex justify-end mb-4">
                        <button onclick="printSelectedShipmentReceipt()" class="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 text-sm flex items-center">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-8a2 2 0 01-2-2v-2a2 2 0 012-2h0a2 2 0 012 2v2a2 2 0 01-2 2z"></path></svg>
                            Print Receipt
                        </button>
                    </div>
                    <!-- End Print Button -->
                    ${buildReceipt(order, cnor, cnee, products, tracking)}
                </div>
            </details>

            <!-- Section 2: LABLE -->
            <details class="doc-section" id="doc-section-lable" open> <!-- Open by default -->
                <summary>LABLE</summary>
                <div class="doc-section-content">
                    <!-- ADDED: Print Button -->
                    <div class="flex justify-end mb-4">
                        <button onclick="printSelectedShipmentLabel()" class="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 text-sm flex items-center">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-8a2 2 0 01-2-2v-2a2 2 0 012-2h0a2 2 0 012 2v2a2 2 0 01-2 2z"></path></svg>
                            Print Label
                        </button>
                    </div>
                    <!-- End Print Button -->

                    ${buildLabel(order, cnor, cnee, products, multiboxItems, { type: 'preview' })} <!-- MODIFIED -->
                </div>
            </details>

            <!-- Section 3: POD -->
            <details class="doc-section" id="doc-section-pod">
                <summary>POD</summary>
                <div class="doc-section-content">
                    <!-- ADDED: Print Button -->
                    <div class="flex justify-end mb-4">
                        <button onclick="printSelectedShipmentPOD()" class="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 text-sm flex items-center">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-8a2 2 0 01-2-2v-2a2 2 0 012-2h0a2 2 0 012 2v2a2 2 0 01-2 2z"></path></svg>
                            Print POD
                        </button>
                    </div>
                    <!-- End Print Button -->
                    ${buildPOD(order, cnor, cnee, products, tracking)}
                </div>
            </details>

            <!-- Section 4: CHALLAN -->
            <details class="doc-section" id="doc-section-challan">
                <summary>CHALLAN</summary>
                <div class="doc-section-content">
                    ${buildChallan(order, cnor, cnee, products, tracking)}
                </div>
            </details>

            <!-- Section 5: OFFICE COPY -->
            <details class="doc-section" id="doc-section-office_copy">
                <summary>OFFICE COPY</summary>
                <div class="doc-section-content">
                    <!-- ADDED: Print Button -->
                    <div class="flex justify-end mb-4">
                        <button onclick="printSelectedShipmentOfficeCopy()" class="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 text-sm flex items-center">
                            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-8a2 2 0 01-2-2v-2a2 2 0 012-2h0a2 2 0 012 2v2a2 2 0 01-2 2z"></path></svg>
                            Print Office Copy
                        </button>
                    </div>
                    <!-- End Print Button -->
                    ${buildOfficeCopy(order, cnor, cnee, products, tracking)}
                </div>
            </details>
        </div>
    `;
    
    ui.documentWorkshop.innerHTML = `
        <div class="flex justify-between items-center mb-4">
             <h2 class="text-xl font-bold text-gray-800">Document Workshop: ${ref}</h2>
             <!-- Add print button? -->
        </div>
        ${workshopContent}
    `;

    // --- Call JsBarcode AFTER setting innerHTML ---
    const awbForBarcode = order.AWB_NUMBER || order.REFERANCE;
    if (awbForBarcode) {
        // --- RENDER LABEL BARCODE ---
        try {
            JsBarcode("#shipping-barcode", awbForBarcode, {
                format: "CODE128",
                displayValue: false, // Hide default value, we'll add our own
                text: awbForBarcode,
                fontSize: 16,
                margin: 10,
                height: 50, // MODIFIED: Changed height from 70 to 50
                width: 3 // Made bars thicker
            });
        } catch (e) {
            console.error("JsBarcode error (Label):", e);
            const barcodeEl = document.getElementById('shipping-barcode-container');
            if(barcodeEl) barcodeEl.innerHTML = `<div class="text-red-500 text-xs">Error generating label barcode.</div>`;
        }

        // --- RE-ENABLED: RENDER RECEIPT BARCODE ---
        try {
            JsBarcode("#receipt-barcode", awbForBarcode, {
                format: "CODE128",
                displayValue: true,
                text: awbForBarcode,
                fontSize: 14, // Smaller font for receipt
                margin: 5,
                height: 40, // Smaller height for receipt
                width: 2
            });
        } catch (e) {
            console.error("JsBarcode error (Receipt):", e);
            const barcodeEl = document.getElementById('receipt-barcode-container');
            if(barcodeEl) barcodeEl.innerHTML = `<div class="text-red-500 text-xs">Error generating receipt barcode.</div>`;
        }
    }
}

// --- MOVED TO GLOBAL SCOPE ---
// --- MODIFIED: Adopting new label style ---
function buildLabel(order, cnor, cnee, products, multiboxItems, options = { type: 'preview' }) { // MODIFIED
    // NOTE: This function relies on global variable: modeDataMap
    const orderDate = fmtDate(order.ORDER_DATE, 'date');
    const ref = order.REFERANCE || 'N/A';
    const awb = order.AWB_NUMBER || ref;
    
    const cnorName = cnor?.NAME || 'N/A';
    const cnorAddress = `${cnor?.ADDRESS || ''}, ${cnor?.CITY || ''}, ${cnor?.STATE || ''} - ${cnor?.PINCODE || ''}`;
    
    const cneeName = cnee?.NAME || 'N/A';
    const cneeAddress = `${cnee?.ADDRESS || ''}, ${cnee?.CITY || ''}, ${cnee?.STATE || ''}, ${cnee?.PINCODE || ''}`;
    const cneeMobile = cnee?.MOBILE || 'N/A';
    const cneePincode = cnee?.PINCODE || 'N/A';
    const cneeCity = cnee?.CITY || 'N/A';

    let paymentMode = "PREPAID";
    let orderValue = 'N/A';
    if (order.COD && parseFloat(order.COD) > 0) {
        paymentMode = "COD";
        orderValue = parseFloat(order.COD).toFixed(2);
    } else if (order.TOPAY && parseFloat(order.TOPAY) > 0) {
        paymentMode = "TO PAY";
        orderValue = parseFloat(order.TOPAY).toFixed(2);
    }
    
    const weight = order.WEIGHT || '0.50';
    const pieces = multiboxItems.length > 0 ? multiboxItems.length : (order.PIECS || 1);
    // Get first product description, or default - USED AS FALLBACK
    const productDesc = (products.length > 0 && products[0].PRODUCT) ? products[0].PRODUCT : 'N/A';
    
    // --- MODIFIED: Get carrier name ---
    const carrierName = order.CARRIER || 'CARRIER';

    // --- ADDED: Get full mode name ---
    const modeShort = order.MODE || 'N/A';
    const modeName = modeDataMap.get(modeShort) || modeShort; // This is the full name e.g., "SURFACE"

    // --- Build Multibox/Summary Table ---
    let summaryTableHtml = '';
    let piecesDisplay = pieces; // Default

    // --- Calculate Totals ---
    let totalWeight = 0;
    let totalChgWt = 0;
    if (multiboxItems && multiboxItems.length > 0) {
         multiboxItems.forEach(box => {
            const wt = box.WEIGHT || box.WT || 0;
            const chgWt = box.CHG_WT || 0;
            totalWeight += parseFloat(wt);
            totalChgWt += parseFloat(chgWt);
         });
    } else {
        totalWeight = parseFloat(weight);
        totalChgWt = totalWeight; // Fallback
    }
    
    if (options.type === 'box') {
        // --- BOX LABEL ---
        const boxIndex = options.index; // 0-based
        const boxData = multiboxItems[boxIndex] || {}; // Get specific box
        piecesDisplay = `Box ${boxIndex + 1} / ${pieces}`; // e.g., Box 1 / 6

        summaryTableHtml = `
            <table class="label-table">
                <thead>
                    <tr>
                        <th>BOX#</th>
                        <th>WEIGHT</th>
                        <th>L*B*H</th>
                        <th>CHG WT</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        const L = boxData.LENGTH || boxData.L || 'N/A';
        const B = boxData.BREADTH || boxData.B || 'N/A';
        const H = boxData.HEIGHT || boxData.H || boxData.HEG || boxData.HIGHT || 'N/A';
        let chgWtDisplay = 'N/A';
        const chgWtVal = boxData.CHG_WT;
        if (chgWtVal && !isNaN(parseFloat(chgWtVal))) {
            chgWtDisplay = parseFloat(chgWtVal).toFixed(2);
        }
        const wtDisplay = boxData.WEIGHT || boxData.WT || 'N/A';

        summaryTableHtml += `
            <tr>
                <td>${boxData.BOX_NO || (boxIndex + 1)}</td>
                <td>${wtDisplay}</td>
                <td>${L}*${B}*${H}</td>
                <td>${chgWtDisplay}</td>
            </tr>
        </tbody></table>`;

    } else if (options.type === 'summary') {
        // --- SUMMARY LABEL ---
        piecesDisplay = `TOTAL PCS: ${pieces}`;
        summaryTableHtml = `
            <table class="label-table">
                <thead>
                    <tr>
                        <th class="text-center">Boxes</th>
                        <th class="text-center">Total Weight</th>
                        <th class="text-center">Total Chg Wt</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- MODIFIED: Single row as requested -->
                    <tr>
                        <td class="text-center">${pieces}</td>
                        <td class="text-center">${totalWeight.toFixed(2)}</td>
                        <td class="text-center">${totalChgWt.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
        `;

    } else {
        // --- PREVIEW LABEL (or fallback) ---
        piecesDisplay = `PCS: ${pieces}`;
        if (multiboxItems && multiboxItems.length > 0) {
            summaryTableHtml = `
                <table class="label-table">
                    <thead>
                        <tr>
                            <th>BOX#</th>
                            <th>WEIGHT</th>
                            <th>L*B*H</th>
                            <th>CHG WT</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            multiboxItems.forEach((box, index) => {
                const L = box.LENGTH || box.L || 'N/A';
                const B = box.BREADTH || box.B || 'N/A';
                const H = box.HEIGHT || box.H || box.HEG || box.HIGHT || 'N/A'; 
                let chgWtDisplay = 'N/A';
                const chgWtVal = box.CHG_WT; 
                if (chgWtVal && !isNaN(parseFloat(chgWtVal))) {
                    chgWtDisplay = parseFloat(chgWtVal).toFixed(2);
                }
                
                summaryTableHtml += `
                    <tr>
                        <td>${box.BOX_NO || (index + 1)}</td>
                        <td>${box.WEIGHT || box.WT || 'N/A'}</td>
                        <td>${L}*${B}*${H}</td>
                        <td>${chgWtDisplay}</td>
                    </tr>
                `;
            });
            // Add totals row for preview
            summaryTableHtml += `
                    <tr style="font-weight: bold; background-color: #f4f4f4;">
                        <td>TOTALS</td>
                        <td>${totalWeight.toFixed(2)}</td>
                        <td>-</td>
                        <td>${totalChgWt.toFixed(2)}</td>
                    </tr>
                </tbody>
                </table>
            `;
        } else {
            // Default summary row if not multibox
            summaryTableHtml = `
                <table class="label-table">
                    <thead>
                        <tr>
                            <th>Order Value (INR)</th>
                            <th>Weight (KGs)</th>
                            <th>Dimension</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${orderValue}</td>
                            <td>${weight}</td>
                            <td>N/A</td>
                        </tr>
                    </tbody>
                </table>
            `;
        }
    }


    // --- Build Product Table ---
    let productTableHtml = `
        <table class="label-table" style="margin-top: -1px;"> <!-- Use margin-top: -1px to connect borders -->
            <thead>
                <tr>
                    <th>PRODUCT</th>
                    <th>DOC#</th>
                    <th>EWAY</th>
                    <th>AMT</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    if (products && products.length > 0) {
        products.forEach((p, index) => {
            const docNo = p.DOC_NO || p.DOCNO || p.DOC || p.DOC_NUMBER || 'N/A';
            const eway = p.EWAY || p.EWAY_NO || p.EWAYBILLNO || p.EWAY_IF || 'N/A';
            const amt = p.AMT || p.AMOUNT || 'N/A';

            productTableHtml += `
                <tr>
                    <td>${p.PRODUCT || 'N/A'}</td>
                    <td>${docNo}</td>
                    <td>${eway}</td>
                    <td>${amt}</td>
                </tr>
            `;
        });
    } else {
        // Fallback to order-level info if no product data
        productTableHtml += `
            <tr>
                <td>${productDesc}</td>
                <td>N/A</td>
                <td>N/A</td>
                <td>N/A</td>
            </tr>
        `;
    }
    
    productTableHtml += `
            </tbody>
        </table>
    `;

    // MODIFIED: Removed the block that cleared productTableHtml for 'summary'
    // ---
    // if (options.type === 'summary') {
    //    productTableHtml = '';
    // }
    // ---


    // Self-contained styles for the new label.
    // This <style> tag will be extracted for printing.
    const styles = `
        <style>
            .label-wrapper {
                border: 1px solid #000;
                width: 100%;
                max-width: 42rem; /* Approx 7 inches */
                margin: 0 auto;
                font-family: 'Arial', sans-serif;
                background: #fff;
                color: #000;
                font-size: 12px;
                line-height: 1.4;
            }
            .label-row {
                display: flex;
                border-bottom: 1px solid #000;
            }
            .label-row:last-child {
                border-bottom: none;
            }
            .label-cell {
                padding: 6px 8px;
                border-right: 1px solid #000;
                width: 100%; /* Default to full width */
                box-sizing: border-box;
            }
            .label-cell:last-child {
                border-right: none;
            }
            /* Flex utils */
            .flex-1 { flex: 1; }
            .flex-2 { flex: 2; }
            .flex-3 { flex: 3; }
            .w-1-3 { width: 33.33%; }
            .w-2-3 { width: 66.66%; }
            .w-1-2 { width: 50%; }
            
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .font-xl { font-size: 20px; }
            .font-xxl { font-size: 28px; font-weight: bold; line-height: 1.2; }
            
            .label-header-sm {
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
                margin-bottom: 2px;
            }
            .label-logo {
                font-size: 24px;
                font-weight: bold;
                color: #000;
                text-transform: uppercase; 
            }
            .barcode-container {
                text-align: center;
                padding: 4px 20px; /* MODIFIED: Reduced top/bottom padding from 10px */
            }
            .barcode-container svg {
                width: 100%;
                height: auto;
            }
            .barcode-number {
                font-size: 20px;
                font-weight: bold;
                text-align: center;
                letter-spacing: 2px;
                margin-top: 2px; /* MODIFIED: Reduced margin-top from 4px */
            }
            /* --- MODIFIED: Removed fixed font sizes, set 12px as base/min --- */
            .consignee-details {
                line-height: 1.4; /* Set a default line height */
                font-size: 12px; /* Set the default/min font size */
                overflow-wrap: break-word; /* ADDED: break long words */
            }
            .consignee-details strong {
                font-size: 13px; /* Set a default/min strong size */
            }
            .label-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
            }
            .label-table th, .label-table td {
                border-top: 1px solid #000;
                border-right: 1px solid #000;
                padding: 6px 8px;
                text-align: left;
            }
            .label-table th:last-child, .label-table td:last-child {
                border-right: none;
            }
            .label-table th {
                font-weight: bold;
                background-color: #f4f4f4;
            }

            /* ADDED: Print override to fix centering when right-click printing */
            @media print {
                .label-wrapper {
                    margin: 0 !important;
                    box-shadow: none !important;
                }
            }
        </style>
    `;
    
    // HTML structure for the new label
    // Use a unique ID for the barcode SVG based on the options
    const barcodeId = `shipping-barcode-${options.type}-${options.index || 0}`;

    return `
        ${styles}
        <div class="label-wrapper">
            <!-- Row 1: Logo, Info, Payment -->
            <div class="label-row">
                <div class="label-cell w-1-3">
                    <div class="label-logo">${carrierName}</div>
                </div>
                <div class="label-cell w-1-3">
                    Date: <strong>${orderDate}</strong><br>
                    <span class="font-bold" style="font-size: 18px;">${paymentMode}</span>
                </div>
                <div class="label-cell w-1-3">
                    <!-- MODIFIED: Use piecesDisplay -->
                    <div class="label-logo" style="font-size: 20px; font-weight: bold;">${piecesDisplay}</div>
                </div>
            </div>

            <!-- Row 2: Category, Order ID -->
            <!-- MODIFIED: Set font to 18px bold and use modeName (full name) -->
            <div class="label-row">
                <div class="label-cell w-1-2" style="font-size: 18px; font-weight: bold;">
                    Mode: ${modeName}
                </div>
                <div class="label-cell w-1-2" style="font-size: 18px; font-weight: bold;">
                    Ref No: ${ref}
                </div>
            </div>
            
            <!-- Row 3: Barcode -->
            <div class="label-row">
                <div class="label-cell">
                    <div class="barcode-container" id="shipping-barcode-container">
                        <!-- MODIFIED: Use dynamic ID for preview, but static for print -->
                        <svg id="${options.type === 'preview' ? 'shipping-barcode' : barcodeId}" class="barcode-svg" data-barcode-value="${awb}"></svg>
                    </div>
                    <div class="barcode-number">${awb}</div>
                </div>
            </div>

            <!-- Row 4: Destination -->
            <div class="label-row">
                <div class="label-cell w-1-2">
                    <div class="label-header-sm">Destination Pincode</div>
                    <div class="font-xxl">${cneePincode}</div>
                </div>
                <div class="label-cell w-1-2">
                    <div class="label-header-sm">Destination</div>
                    <div class="font-xxl">${cneeCity}</div>
                </div>
            </div>

            <!-- Row 5: Consignee -->
            <div class="label-row">
                <div class="label-cell consignee-details">
                    <strong>Ship To:</strong>
                    <strong style="font-size: 16px;"> ${cneeName}</strong>,
                    ${cneeAddress},
                    Contact No: <strong>${cneeMobile}</strong>
                </div>
            </div>

            <!-- Row 6: Details Table -->
            <div class="label-row">
                <div class="label-cell" style="padding: 0;">
                    ${summaryTableHtml}
                    ${productTableHtml}
                </div>
            </div>

            <!-- Row 7: Return Address -->
            <div class="label-row">
                <div class="label-cell">
                    Return Address:
                    <strong>${cnorName},</strong> ${cnorAddress}
                </div>
            </div>

        </div>
    `;
}
// --- END FIX ---

// --- ADDED: Placeholder build functions ---
// --- MODIFIED: buildReceipt ---
function buildReceipt(order, cnor, cnee, products, tracking) {
    // NOTE: This function relies on global variables: multiboxDataMap, modeDataMap
    // --- ADDED: Get multibox data ---
    const multiboxItems = multiboxDataMap.get(order.REFERANCE) || [];

    const orderDate = fmtDate(order.ORDER_DATE, 'date');
    const ref = order.REFERANCE || 'N/A';
    const awb = order.AWB_NUMBER || ref;
    const carrierName = order.CARRIER || 'CARRIER'; // We still need this for the origin box
    const modeShort = order.MODE || 'N/A';
    const modeName = modeDataMap.get(modeShort) || modeShort;

    const cnorName = cnor?.NAME || 'N/A';
    const cnorAddress = `${cnor?.ADDRESS || ''}, ${cnor?.CITY || ''}, ${cnor?.STATE || ''} - ${cnor?.PINCODE || ''}`;
    const cnorMobile = cnor?.MOBILE || 'N/A';
    
    const cneeName = cnee?.NAME || 'N/A';
    const cneeAddress = `${cnee?.ADDRESS || ''}, ${cnee?.CITY || ''}, ${cnee?.STATE || ''}, ${cnee?.PINCODE || ''}`;
    const cneeMobile = cnee?.MOBILE || 'N/A';

    let paymentMode = "PREPAID";
    let orderValue = 0;
    if (order.COD && parseFloat(order.COD) > 0) {
        paymentMode = "COD";
        orderValue = parseFloat(order.COD);
    } else if (order.TOPAY && parseFloat(order.TOPAY) > 0) {
        paymentMode = "TO PAY";
        orderValue = parseFloat(order.TOPAY);
    }
    
    const weight = parseFloat(order.WEIGHT || '0.50').toFixed(2);
    const pieces = order.PIECS || 1;

    // --- Build Product Table & Calculate Totals ---
    let productTableHtml = '';
    let totalQty = 0;
    let totalAmt = 0;

    if (products && products.length > 0) {
        products.forEach((p, index) => {
            const product = p.PRODUCT || 'N/A';
            const docNo = p.DOC_NO || p.DOCNO || p.DOC || p.DOC_NUMBER || 'N/A';
            const eway = p.EWAY || p.EWAY_NO || p.EWAYBILLNO || p.EWAY_IF || 'N/A';
            const qty = parseInt(p.QTY || 1);
            const amt = parseFloat(p.AMT || p.AMOUNT || 0);
            
            totalQty += qty;
            totalAmt += amt;

            productTableHtml += `
                <tr class="receipt-table-row">
                    <td class="receipt-table-cell">${index + 1}</td>
                    <td class="receipt-table-cell">${product}</td>
                    <td class="receipt-table-cell">${docNo}</td>
                    <td class="receipt-table-cell">${eway}</td>
                    <td class="receipt-table-cell text-right">${qty}</td>
                    <td class="receipt-table-cell text-right">${amt.toFixed(2)}</td>
                </tr>
            `;
        });
    } else {
        productTableHtml = `
            <tr class="receipt-table-row">
                <td class="receipt-table-cell" colspan="6">No product details available.</td>
            </tr>
        `;
    }

    // --- ADDED: Build Multibox Table ---
    let multiboxTableHtml = '';
    let totalWeight_mb = 0;
    let totalChgWt_mb = 0;

    if (multiboxItems && multiboxItems.length > 0) {
        multiboxTableHtml = `
            <table class="receipt-table" style="border-top: 2px solid #000; margin-top: -1px;">
                <thead class="receipt-table-header">
                    <tr>
                        <th class="receipt-table-cell" style="width: 15%;">BOX#</th>
                        <th class="receipt-table-cell">WEIGHT (Kg)</th>
                        <th class="receipt-table-cell">L*B*H (Cm)</th>
                        <th class="receipt-table-cell text-right">CHG WT (Kg)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        multiboxItems.forEach((box, index) => {
            const L = box.LENGTH || box.L || 'N/A';
            const B = box.BREADTH || box.B || 'N/A';
            const H = box.HEIGHT || box.H || box.HEG || box.HIGHT || 'N/A'; 
            
            const wt = parseFloat(box.WEIGHT || box.WT || 0);
            const chgWt = parseFloat(box.CHG_WT || 0);
            totalWeight_mb += wt;
            totalChgWt_mb += chgWt;

            multiboxTableHtml += `
                <tr>
                    <td class="receipt-table-cell">${box.BOX_NO || (index + 1)}</td>
                    <td class="receipt-table-cell">${wt.toFixed(2)}</td>
                    <td class="receipt-table-cell">${L}*${B}*${H}</td>
                    <td class="receipt-table-cell text-right">${chgWt.toFixed(2)}</td>
                </tr>
            `;
        });
        multiboxTableHtml += `
                </tbody>
            </table>
        `;
    }
    // --- END Multibox Table ---


    const styles = `
        <style>
            .receipt-wrapper {
                border: 1px solid #333;
                width: 100%;
                max-width: 48rem; /* A4-ish width */
                margin: 0 auto;
                font-family: 'Arial', sans-serif;
                background: #fff;
                color: #000;
                font-size: 11px; /* Smaller base font */
                line-height: 1.4;
            }
            .receipt-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.5rem 1rem;
                border-bottom: 2px solid #000;
            }
            .receipt-logo {
                font-size: 24px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .receipt-copy-type {
                font-size: 16px;
                font-weight: bold;
                text-align: right;
            }
            .receipt-meta {
                display: grid; /* MODIFIED */
                grid-template-columns: 1fr 1fr 1fr; /* MODIFIED */
                border-bottom: 1px solid #333;
            }
            .receipt-meta-cell {
                /* width: 33.33%; */ /* REMOVED */
                padding: 0.5rem 1rem;
                border-right: 1px solid #333;
                border-top: 1px solid #333; /* ADDED for grid */
            }
            /* ADDED: Clean up grid borders */
            .receipt-meta-cell:nth-child(3n) { border-right: none; } 
            .receipt-meta-cell:nth-child(1),
            .receipt-meta-cell:nth-child(2) { border-top: none; } 
            /* END ADDED */

            .receipt-meta-cell:last-child { border-right: none; }
            .receipt-meta-cell strong { font-size: 13px; }

            /* ADDED: Barcode container for receipt */
            .receipt-barcode-container {
                text-align: center;
                padding: 5px;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .receipt-barcode-container svg {
                width: 100%;
                max-width: 200px; /* Adjust max-width as needed */
                height: auto;
            }
            /* END ADDED */

            .receipt-party {
                display: flex;
                border-bottom: 2px solid #000;
            }
            .receipt-party-cell {
                width: 50%;
                padding: 0.75rem 1rem;
                border-right: 1px solid #333;
            }
            .receipt-party-cell:last-child { border-right: none; }
            .receipt-party-cell .label {
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
                color: #555;
            }
            .receipt-party-cell .name {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 0.25rem;
            }
            
            .receipt-details {
                display: flex;
                border-bottom: 1px solid #333;
            }
            .receipt-details-cell {
                padding: 0.5rem 1rem;
                border-right: 1px solid #333;
                text-align: center;
            }
            .receipt-details-cell:last-child { border-right: none; }
            .receipt-details-cell .label {
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
                color: #555;
                display: block;
            }
            .receipt-details-cell .value {
                font-size: 13px;
                font-weight: bold;
            }

            .receipt-table {
                width: 100%;
                border-collapse: collapse;
            }
            .receipt-table-header {
                font-weight: bold;
                background-color: #f0f0f0;
                font-size: 10px;
                text-transform: uppercase;
            }
            .receipt-table-cell {
                border-bottom: 1px solid #ccc;
                padding: 0.5rem 0.75rem;
                border-right: 1px solid #ccc;
                font-size: 10px; /* MODIFIED: Matched font size to header */
            }
            .receipt-table-cell:last-child { border-right: none; }
            .text-right { text-align: right; }

            /* --- NEW: Added styles for T&C and QR row --- */
            .receipt-terms-row {
                display: flex;
                border-top: 2px solid #000;
                border-bottom: 2px solid #000;
            }
            /* MODIFIED: This is now the QR cell */
            .receipt-terms-cell {
                width: 25%; /* MODIFIED: 1 part */
                padding: 0.5rem 0.75rem;
                border-right: 1px solid #333;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
            }
            /* MODIFIED: This is now the T&C cell */
            .receipt-qr-cell {
                width: 75%; /* MODIFIED: 3 parts */
                padding: 0.5rem 0.75rem;
                font-size: 6px; /* As requested */
                line-height: 1.5;
                color: #333;
                overflow-y: hidden; /* Prevent long text from breaking layout */
                max-height: 120px; /* Set a max height */
                border-left: 1px solid #ccc;
            }
            /* REMOVED: .qr-placeholder styles */
            
            /* ADDED: Style for label inside the terms cell */
            .receipt-terms-cell .label {
                font-size: 10px;
                color: #555;
            }
            /* --- End new styles --- */

            /* REMOVED: .receipt-footer, .receipt-footer-cell, .receipt-barcode-container */

            .sign-box {
                height: 50px; /* MODIFIED: Space for signature (was 80px) */
            }

        </style>
    `;

    const html = `
        <div class="receipt-wrapper">
            <!-- Header -->
            <div class="receipt-header">
                <!-- MODIFIED: Use "POSTMAN" -->
                <div class="receipt-logo">POSTMAN</div>
                <div class="receipt-copy-type">CLIENT COPY</div>
            </div>
            
            <!-- Meta -->
            <div class="receipt-meta">
                <div class="receipt-meta-cell">
                    <strong>AWB No: ${awb}</strong>
                </div>
                <div class="receipt-meta-cell">
                    <strong>Date:</strong> ${orderDate}
                </div>
                <!-- MODIFIED: Added explicit grid-column to force it to the 3rd column -->
                <div class="receipt-meta-cell" style="grid-row: 1 / 3; grid-column: 3 / 4; border-left: 1px solid #333; border-top: none; border-right: none; padding: 0.5rem;">
                    <!-- MODIFIED: Added Barcode -->
                    <div class="receipt-barcode-container" id="receipt-barcode-container">
                        <svg id="receipt-barcode"></svg>
                    </div>
                </div>
                <div class="receipt-meta-cell">
                    <strong>Ref No:</strong> ${ref}
                </div>
                <!-- MODIFIED: Removed Origin, kept Carrier -->
                <div class="receipt-meta-cell">
                    <strong>Carrier:</strong> ${carrierName}
                </div>
                <!-- REMOVED Blank Cell -->
            </div>

            <!-- Party -->
            <div class="receipt-party">
                <div class="receipt-party-cell">
                    <span class="label">Shipper</span>
                    <div class="name">${cnorName}</div>
                    <div>${cnorAddress}</div>
                    <div><strong>Contact:</strong> ${cnorMobile}</div>
                </div>
                <div class="receipt-party-cell">
                    <span class="label">Consignee</span>
                    <div class="name">${cneeName}</div>
                    <div>${cneeAddress}</div>
                    <div><strong>Contact:</strong> ${cneeMobile}</div>
                </div>
            </div>

            <!-- Details -->
            <div class="receipt-details">
                <div class="receipt-details-cell" style="flex-grow: 2;">
                    <span class="label">Payment Mode</span>
                    <span class="value">${paymentMode}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 1;">
                    <span class="label">Pieces</span>
                    <span class="value">${pieces}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 1;">
                    <span class="label">Weight (Kg)</span>
                    <span class="value">${weight}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 2;">
                    <span class="label">Service</span>
                    <span class="value">${modeName}</span>
                </div>
                <!-- ADDED: New box for total product amount -->
                <div class="receipt-details-cell" style="flex-grow: 2;">
                    <span class="label">Value</span>
                    <span class="value">INR ${totalAmt.toFixed(2)}</span>
                </div>
            </div>

            <!-- MODIFIED: Added Multibox Table -->
            ${multiboxTableHtml}

            <!-- Products -->
            <table class="receipt-table" style="${multiboxTableHtml ? '' : 'border-top: 2px solid #000; margin-top: -1px;'}">
                <thead class="receipt-table-header">
                    <tr>
                        <th class="receipt-table-cell" style="width: 5%;">#</th>
                        <th class="receipt-table-cell" style="width: 30%;">Product</th>
                        <th class="receipt-table-cell">Doc #</th>
                        <th class="receipt-table-cell">E-Way</th>
                        <th class="receipt-table-cell text-right" style="width: 10%;">Qty</th>
                        <th class="receipt-table-cell text-right" style="width: 15%;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${productTableHtml}
                </tbody>
            </table>

            <!-- NEW: Terms and QR Row (SWAPPED) -->
            <div class="receipt-terms-row">
                <!-- MODIFIED: This cell now holds the signature block -->
                <div class="receipt-terms-cell">
                    <span class="label">Admits to T&C</span>
                    <div class="sign-box"></div>
                    <span class="label">Consignor's Sign & Stamp</span>
                </div>
                <!-- MODIFIED: This cell now holds the T&Cs -->
                <div class="receipt-qr-cell">
                    <p style="text-align: left; margin: 0; padding: 0;">
                        1. Here Consignor is fully responsible if IATA/ICAO/IMDG,ADR restricted/Prohabitted items is being ship or mismatch with declared contain. 2. This is a Customer Copy of Declared shipment and Payment recipt of Charges, not a Tax Invoice. 3. This recipt means said shipment has been handovered for shipping. 4. Shipment TAT may differ as declared, depends transport, air traffic and natural clamity. 5. Custom, Clearance and Penalty are not paid here will be taken if charged by GOV. 6. Higher Value shipments are mandatory to be insured by the shipper/sender as “Owner’s Risk” with a valid insurance Documents. In-case of “Carrier’s Risk”, the sender pay the risk surcharge as per defined. 7. Fright refund will not be entertained in any claims if service failure is resulted from any condition Eg. Strikes, Bandh, Elections, Rains, Floods, Fire, Accident or other natural calamities. 8. NO FRAGILE and Perishable Item can be booked under Carrier's Risk. 9. This recipt has 30 days life from booking date. 10. We are a service provider and in case of any unforeseen delay, damage, loss of consignment, our liabilities are specifically limited. 11. Carrrier has the right at its option or at the request of competent authorities to open consignment at any time to inspect the contents of the shipment.
                    </p>
                </div>
            </div>

            <!-- Footer -->
            <!-- REMOVED: Entire receipt-footer div -->

        </div>
    `;
    
    // FIX: Return ONLY styles and HTML. Do not run script here.
    return styles + html;
}

// --- MODIFIED: buildPOD ---
function buildPOD(order, cnor, cnee, products, tracking) {
    // NOTE: This function relies on global variables: multiboxDataMap, modeDataMap
    // --- This function is now a copy of buildReceipt, with modifications ---
    const multiboxItems = multiboxDataMap.get(order.REFERANCE) || [];
    const orderDate = fmtDate(order.ORDER_DATE, 'date');
    const ref = order.REFERANCE || 'N/A';
    const awb = order.AWB_NUMBER || ref;
    const carrierName = order.CARRIER || 'CARRIER';
    const modeShort = order.MODE || 'N/A';
    const modeName = modeDataMap.get(modeShort) || modeShort;
    const cnorName = cnor?.NAME || 'N/A';
    const cnorAddress = `${cnor?.ADDRESS || ''}, ${cnor?.CITY || ''}, ${cnor?.STATE || ''} - ${cnor?.PINCODE || ''}`;
    const cnorMobile = cnor?.MOBILE || 'N/A';
    const cneeName = cnee?.NAME || 'N/A';
    const cneeAddress = `${cnee?.ADDRESS || ''}, ${cnee?.CITY || ''}, ${cnee?.STATE || ''}, ${cnee?.PINCODE || ''}`;
    const cneeMobile = cnee?.MOBILE || 'N/A';

    let paymentMode = "PREPAID";
    let orderValue = 0;
    if (order.COD && parseFloat(order.COD) > 0) {
        paymentMode = "COD";
        orderValue = parseFloat(order.COD);
    } else if (order.TOPAY && parseFloat(order.TOPAY) > 0) {
        paymentMode = "TO PAY";
        orderValue = parseFloat(order.TOPAY);
    }
    const weight = parseFloat(order.WEIGHT || '0.50').toFixed(2);
    const pieces = order.PIECS || 1;

    let productTableHtml = '';
    let totalQty = 0;
    let totalAmt = 0;
    if (products && products.length > 0) {
        products.forEach((p, index) => {
            const product = p.PRODUCT || 'N/A';
            const docNo = p.DOC_NO || p.DOCNO || p.DOC || p.DOC_NUMBER || 'N/A';
            const eway = p.EWAY || p.EWAY_NO || p.EWAYBILLNO || p.EWAY_IF || 'N/A';
            const qty = parseInt(p.QTY || 1);
            const amt = parseFloat(p.AMT || p.AMOUNT || 0);
            totalQty += qty;
            totalAmt += amt;
            productTableHtml += `
                <tr class="receipt-table-row">
                    <td class="receipt-table-cell">${index + 1}</td>
                    <td class="receipt-table-cell">${product}</td>
                    <td class="receipt-table-cell">${docNo}</td>
                    <td class="receipt-table-cell">${eway}</td>
                    <td class="receipt-table-cell text-right">${qty}</td>
                    <td class="receipt-table-cell text-right">${amt.toFixed(2)}</td>
                </tr>
            `;
        });
    } else {
        productTableHtml = `
            <tr class="receipt-table-row">
                <td class="receipt-table-cell" colspan="6">No product details available.</td>
            </tr>
        `;
    }

    let multiboxTableHtml = '';
    let totalWeight_mb = 0;
    let totalChgWt_mb = 0;
    if (multiboxItems && multiboxItems.length > 0) {
        multiboxTableHtml = `
            <table class="receipt-table" style="border-top: 2px solid #000; margin-top: -1px;">
                <thead class="receipt-table-header">
                    <tr>
                        <th class="receipt-table-cell" style="width: 15%;">BOX#</th>
                        <th class="receipt-table-cell">WEIGHT (Kg)</th>
                        <th class="receipt-table-cell">L*B*H (Cm)</th>
                        <th class="receipt-table-cell text-right">CHG WT (Kg)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        multiboxItems.forEach((box, index) => {
            const L = box.LENGTH || box.L || 'N/A';
            const B = box.BREADTH || box.B || 'N/A';
            const H = box.HEIGHT || box.H || box.HEG || box.HIGHT || 'N/A'; 
            const wt = parseFloat(box.WEIGHT || box.WT || 0);
            const chgWt = parseFloat(box.CHG_WT || 0);
            totalWeight_mb += wt;
            totalChgWt_mb += chgWt;
            multiboxTableHtml += `
                <tr>
                    <td class="receipt-table-cell">${box.BOX_NO || (index + 1)}</td>
                    <td class="receipt-table-cell">${wt.toFixed(2)}</td>
                    <td class="receipt-table-cell">${L}*${B}*${H}</td>
                    <td class="receipt-table-cell text-right">${chgWt.toFixed(2)}</td>
                </tr>
            `;
        });
        multiboxTableHtml += `
                </tbody>
            </table>
        `;
    }

    // --- NOTE: Styles are identical to buildReceipt ---
    const styles = `
        <style>
            .receipt-wrapper {
                border: 1px solid #333;
                width: 100%;
                max-width: 48rem; /* A4-ish width */
                margin: 0 auto;
                font-family: 'Arial', sans-serif;
                background: #fff;
                color: #000;
                font-size: 11px; /* Smaller base font */
                line-height: 1.4;
            }
            .receipt-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.5rem 1rem;
                border-bottom: 2px solid #000;
            }
            .receipt-logo {
                font-size: 24px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .receipt-copy-type {
                font-size: 16px;
                font-weight: bold;
                text-align: right;
            }
            .receipt-meta {
                display: grid; /* MODIFIED */
                grid-template-columns: 1fr 1fr 1fr; /* MODIFIED */
                border-bottom: 1px solid #333;
            }
            .receipt-meta-cell {
                /* width: 33.33%; */ /* REMOVED */
                padding: 0.5rem 1rem;
                border-right: 1px solid #333;
                border-top: 1px solid #333; /* ADDED for grid */
            }
            /* ADDED: Clean up grid borders */
            .receipt-meta-cell:nth-child(3n) { border-right: none; } 
            .receipt-meta-cell:nth-child(1),
            .receipt-meta-cell:nth-child(2) { border-top: none; } 
            /* END ADDED */

            .receipt-meta-cell:last-child { border-right: none; }
            .receipt-meta-cell strong { font-size: 13px; }

            /* ADDED: Barcode container for receipt */
            .receipt-barcode-container {
                text-align: center;
                padding: 5px;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .receipt-barcode-container svg {
                width: 100%;
                max-width: 200px; /* Adjust max-width as needed */
                height: auto;
            }
            /* END ADDED */

            .receipt-party {
                display: flex;
                border-bottom: 2px solid #000;
            }
            .receipt-party-cell {
                width: 50%;
                padding: 0.75rem 1rem;
                border-right: 1px solid #333;
            }
            .receipt-party-cell:last-child { border-right: none; }
            .receipt-party-cell .label {
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
                color: #555;
            }
            .receipt-party-cell .name {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 0.25rem;
            }
            
            .receipt-details {
                display: flex;
                border-bottom: 1px solid #333;
            }
            .receipt-details-cell {
                padding: 0.5rem 1rem;
                border-right: 1px solid #333;
                text-align: center;
            }
            .receipt-details-cell:last-child { border-right: none; }
            .receipt-details-cell .label {
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
                color: #555;
                display: block;
            }
            .receipt-details-cell .value {
                font-size: 13px;
                font-weight: bold;
            }

            .receipt-table {
                width: 100%;
                border-collapse: collapse;
            }
            .receipt-table-header {
                font-weight: bold;
                background-color: #f0f0f0;
                font-size: 10px;
                text-transform: uppercase;
            }
            .receipt-table-cell {
                border-bottom: 1px solid #ccc;
                padding: 0.5rem 0.75rem;
                border-right: 1px solid #ccc;
                font-size: 10px; /* MODIFIED: Matched font size to header */
            }
            .receipt-table-cell:last-child { border-right: none; }
            .text-right { text-align: right; }

            /* --- NEW: Added styles for T&C and QR row --- */
            .receipt-terms-row {
                display: flex;
                border-top: 2px solid #000;
                border-bottom: 2px solid #000;
            }
            /* MODIFIED: This is now the QR cell */
            .receipt-terms-cell {
                width: 25%; /* MODIFIED: 1 part */
                padding: 0.5rem 0.75rem;
                border-right: 1px solid #333;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
            }
            /* MODIFIED: This is now the T&C cell */
            .receipt-qr-cell {
                width: 75%; /* MODIFIED: 3 parts */
                padding: 0.5rem 0.75rem;
                font-size: 6px; /* As requested */
                line-height: 1.5;
                color: #333;
                overflow-y: hidden; /* Prevent long text from breaking layout */
                max-height: 120px; /* Set a max height */
                border-left: 1px solid #ccc;
            }
            /* REMOVED: .qr-placeholder styles */
            
            /* ADDED: Style for label inside the terms cell */
            .receipt-terms-cell .label {
                font-size: 10px;
                color: #555;
            }
            /* --- End new styles --- */

            /* REMOVED: .receipt-footer, .receipt-footer-cell, .receipt-barcode-container */

            .sign-box {
                height: 50px; /* MODIFIED: Space for signature (was 80px) */
            }

        </style>
    `;

    const html = `
        <div class="receipt-wrapper">
            <!-- Header -->
            <div class="receipt-header">
                <div class="receipt-logo">POSTMAN</div>
                <!-- MODIFICATION: Changed to POD COPY -->
                <div class="receipt-copy-type">POD COPY</div>
            </div>
            
            <!-- Meta -->
            <div class="receipt-meta">
                <div class="receipt-meta-cell">
                    <strong>AWB No: ${awb}</strong>
                </div>
                <div class="receipt-meta-cell">
                    <strong>Date:</strong> ${orderDate}
                </div>
                <div class="receipt-meta-cell" style="grid-row: 1 / 3; grid-column: 3 / 4; border-left: 1px solid #333; border-top: none; border-right: none; padding: 0.5rem;">
                    <div class="receipt-barcode-container" id="receipt-barcode-container">
                        <svg id="receipt-barcode"></svg>
                    </div>
                </div>
                <div class="receipt-meta-cell">
                    <strong>Ref No:</strong> ${ref}
                </div>
                <div class="receipt-meta-cell">
                    <strong>Carrier:</strong> ${carrierName}
                </div>
            </div>

            <!-- Party -->
            <div class="receipt-party">
                <div class="receipt-party-cell">
                    <span class="label">Shipper</span>
                    <div class="name">${cnorName}</div>
                    <div>${cnorAddress}</div>
                    <div><strong>Contact:</strong> ${cnorMobile}</div>
                </div>
                <div class="receipt-party-cell">
                    <span class="label">Consignee</span>
                    <div class="name">${cneeName}</div>
                    <div>${cneeAddress}</div>
                    <div><strong>Contact:</strong> ${cneeMobile}</div>
                </div>
            </div>

            <!-- Details -->
            <div class="receipt-details">
                <div class="receipt-details-cell" style="flex-grow: 2;">
                    <span class="label">Payment Mode</span>
                    <span class="value">${paymentMode}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 1;">
                    <span class="label">Pieces</span>
                    <span class="value">${pieces}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 1;">
                    <span class="label">Weight (Kg)</span>
                    <span class="value">${weight}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 2;">
                    <span class="label">Service</span>
                    <span class="value">${modeName}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 2;">
                    <span class="label">Value</span>
                    <span class="value">INR ${totalAmt.toFixed(2)}</span>
                </div>
            </div>

            ${multiboxTableHtml}

            <!-- Products -->
            <table class="receipt-table" style="${multiboxTableHtml ? '' : 'border-top: 2px solid #000; margin-top: -1px;'}">
                <thead class="receipt-table-header">
                    <tr>
                        <th class="receipt-table-cell" style="width: 5%;">#</th>
                        <th class="receipt-table-cell" style="width: 30%;">Product</th>
                        <th class="receipt-table-cell">Doc #</th>
                        <th class="receipt-table-cell">E-Way</th>
                        <th class="receipt-table-cell text-right" style="width: 10%;">Qty</th>
                        <th class="receipt-table-cell text-right" style="width: 15%;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${productTableHtml}
                </tbody>
            </table>

            <div class="receipt-terms-row">
                <!-- MODIFICATION: Changed signature block text -->
                <div class="receipt-terms-cell">
                    <span class="label">Recieved in Good Condition,</span>
                    <div class="sign-box"></div>
                    <span class="label">Recievers Sign & Stamp</span>
                </div>
                <div class="receipt-qr-cell">
                    <p style="text-align: left; margin: 0; padding: 0;">
                        1. Here Consignor is fully responsible if IATA/ICAO/IMDG,ADR restricted/Prohabitted items is being ship or mismatch with declared contain. 2. This is a Customer Copy of Declared shipment and Payment recipt of Charges, not a Tax Invoice. 3. This recipt means said shipment has been handovered for shipping. 4. Shipment TAT may differ as declared, depends transport, air traffic and natural clamity. 5. Custom, Clearance and Penalty are not paid here will be taken if charged by GOV. 6. Higher Value shipments are mandatory to be insured by the shipper/sender as “Owner’s Risk” with a valid insurance Documents. In-case of “Carrier’s Risk”, the sender pay the risk surcharge as per defined. 7. Fright refund will not be entertained in any claims if service failure is resulted from any condition Eg. Strikes, Bandh, Elections, Rains, Floods, Fire, Accident or other natural calamities. 8. NO FRAGILE and Perishable Item can be booked under Carrier's Risk. 9. This recipt has 30 days life from booking date. 10. We are a service provider and in case of any unforeseen delay, damage, loss of consignment, our liabilities are specifically limited. 11. Carrrier has the right at its option or at the request of competent authorities to open consignment at any time to inspect the contents of the shipment.
                    </p>
                </div>
            </div>

        </div>
    `;
    
    return styles + html;
}

function buildChallan(order, cnor, cnee, products, tracking) {
    let productList = products.map(p => `<li>${p.PRODUCT || 'N/A'} (Qty: ${p.QTY || 1})</li>`).join('');
    if (!productList) productList = '<li>No product details available.</li>';

    return `<div class="p-4 border rounded-md bg-gray-50 text-gray-700">
                <h3 class="font-bold text-lg mb-2">Delivery Challan</h3>
                <p><strong>From:</strong> ${cnor?.NAME || 'N/A'}</p>
                <p><strong>To:</strong> ${cnee?.NAME || 'N/A'}</p>
                <p class="mt-2 font-semibold">Products:</p>
                <ul class="list-disc list-inside text-sm">${productList}</ul>
                <p class="mt-4 text-sm text-gray-500">(Full challan template to be built here)</p>
           </div>`;
}

// --- MODIFIED: buildOfficeCopy ---
function buildOfficeCopy(order, cnor, cnee, products, tracking) {
    // NOTE: This function relies on global variables: multiboxDataMap, modeDataMap
    // --- This function is a copy of buildPOD, with modifications ---
    const multiboxItems = multiboxDataMap.get(order.REFERANCE) || [];
    const orderDate = fmtDate(order.ORDER_DATE, 'date');
    const ref = order.REFERANCE || 'N/A';
    const awb = order.AWB_NUMBER || ref;
    const carrierName = order.CARRIER || 'CARRIER';
    const modeShort = order.MODE || 'N/A';
    const modeName = modeDataMap.get(modeShort) || modeShort;
    const cnorName = cnor?.NAME || 'N/A';
    const cnorAddress = `${cnor?.ADDRESS || ''}, ${cnor?.CITY || ''}, ${cnor?.STATE || ''} - ${cnor?.PINCODE || ''}`;
    const cnorMobile = cnor?.MOBILE || 'N/A';
    const cneeName = cnee?.NAME || 'N/A';
    const cneeAddress = `${cnee?.ADDRESS || ''}, ${cnee?.CITY || ''}, ${cnee?.STATE || ''}, ${cnee?.PINCODE || ''}`;
    const cneeMobile = cnee?.MOBILE || 'N/A';

    let paymentMode = "PREPAID";
    let orderValue = 0;
    if (order.COD && parseFloat(order.COD) > 0) {
        paymentMode = "COD";
        orderValue = parseFloat(order.COD);
    } else if (order.TOPAY && parseFloat(order.TOPAY) > 0) {
        paymentMode = "TO PAY";
        orderValue = parseFloat(order.TOPAY);
    }
    const weight = parseFloat(order.WEIGHT || '0.50').toFixed(2);
    const pieces = order.PIECS || 1;

    let productTableHtml = '';
    let totalQty = 0;
    let totalAmt = 0;
    if (products && products.length > 0) {
        products.forEach((p, index) => {
            const product = p.PRODUCT || 'N/A';
            const docNo = p.DOC_NO || p.DOCNO || p.DOC || p.DOC_NUMBER || 'N/A';
            const eway = p.EWAY || p.EWAY_NO || p.EWAYBILLNO || p.EWAY_IF || 'N/A';
            const qty = parseInt(p.QTY || 1);
            const amt = parseFloat(p.AMT || p.AMOUNT || 0);
            totalQty += qty;
            totalAmt += amt;
            productTableHtml += `
                <tr class="receipt-table-row">
                    <td class="receipt-table-cell">${index + 1}</td>
                    <td class="receipt-table-cell">${product}</td>
                    <td class="receipt-table-cell">${docNo}</td>
                    <td class="receipt-table-cell">${eway}</td>
                    <td class="receipt-table-cell text-right">${qty}</td>
                    <td class="receipt-table-cell text-right">${amt.toFixed(2)}</td>
                </tr>
            `;
        });
    } else {
        productTableHtml = `
            <tr class="receipt-table-row">
                <td class="receipt-table-cell" colspan="6">No product details available.</td>
            </tr>
        `;
    }

    let multiboxTableHtml = '';
    let totalWeight_mb = 0;
    let totalChgWt_mb = 0;
    if (multiboxItems && multiboxItems.length > 0) {
        multiboxTableHtml = `
            <table class="receipt-table" style="border-top: 2px solid #000; margin-top: -1px;">
                <thead class="receipt-table-header">
                    <tr>
                        <th class="receipt-table-cell" style="width: 15%;">BOX#</th>
                        <th class="receipt-table-cell">WEIGHT (Kg)</th>
                        <th class="receipt-table-cell">L*B*H (Cm)</th>
                        <th class="receipt-table-cell text-right">CHG WT (Kg)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        multiboxItems.forEach((box, index) => {
            const L = box.LENGTH || box.L || 'N/A';
            const B = box.BREADTH || box.B || 'N/A';
            const H = box.HEIGHT || box.H || box.HEG || box.HIGHT || 'N/A'; 
            const wt = parseFloat(box.WEIGHT || box.WT || 0);
            const chgWt = parseFloat(box.CHG_WT || 0);
            totalWeight_mb += wt;
            totalChgWt_mb += chgWt;
            multiboxTableHtml += `
                <tr>
                    <td class="receipt-table-cell">${box.BOX_NO || (index + 1)}</td>
                    <td class="receipt-table-cell">${wt.toFixed(2)}</td>
                    <td class="receipt-table-cell">${L}*${B}*${H}</td>
                    <td class="receipt-table-cell text-right">${chgWt.toFixed(2)}</td>
                </tr>
            `;
        });
        multiboxTableHtml += `
                </tbody>
            </table>
        `;
    }

    // --- NOTE: Styles are identical to buildReceipt ---
    const styles = `
        <style>
            .receipt-wrapper {
                border: 1px solid #333;
                width: 100%;
                max-width: 48rem; /* A4-ish width */
                margin: 0 auto;
                font-family: 'Arial', sans-serif;
                background: #fff;
                color: #000;
                font-size: 11px; /* Smaller base font */
                line-height: 1.4;
            }
            .receipt-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.5rem 1rem;
                border-bottom: 2px solid #000;
            }
            .receipt-logo {
                font-size: 24px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .receipt-copy-type {
                font-size: 16px;
                font-weight: bold;
                text-align: right;
            }
            .receipt-meta {
                display: grid; /* MODIFIED */
                grid-template-columns: 1fr 1fr 1fr; /* MODIFIED */
                border-bottom: 1px solid #333;
            }
            .receipt-meta-cell {
                /* width: 33.33%; */ /* REMOVED */
                padding: 0.5rem 1rem;
                border-right: 1px solid #333;
                border-top: 1px solid #333; /* ADDED for grid */
            }
            /* ADDED: Clean up grid borders */
            .receipt-meta-cell:nth-child(3n) { border-right: none; } 
            .receipt-meta-cell:nth-child(1),
            .receipt-meta-cell:nth-child(2) { border-top: none; } 
            /* END ADDED */

            .receipt-meta-cell:last-child { border-right: none; }
            .receipt-meta-cell strong { font-size: 13px; }

            /* ADDED: Barcode container for receipt */
            .receipt-barcode-container {
                text-align: center;
                padding: 5px;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .receipt-barcode-container svg {
                width: 100%;
                max-width: 200px; /* Adjust max-width as needed */
                height: auto;
            }
            /* END ADDED */

            .receipt-party {
                display: flex;
                border-bottom: 2px solid #000;
            }
            .receipt-party-cell {
                width: 50%;
                padding: 0.75rem 1rem;
                border-right: 1px solid #333;
            }
            .receipt-party-cell:last-child { border-right: none; }
            .receipt-party-cell .label {
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
                color: #555;
            }
            .receipt-party-cell .name {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 0.25rem;
            }
            
            .receipt-details {
                display: flex;
                border-bottom: 1px solid #333;
            }
            .receipt-details-cell {
                padding: 0.5rem 1rem;
                border-right: 1px solid #333;
                text-align: center;
            }
            .receipt-details-cell:last-child { border-right: none; }
            .receipt-details-cell .label {
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
                color: #555;
                display: block;
            }
            .receipt-details-cell .value {
                font-size: 13px;
                font-weight: bold;
            }

            .receipt-table {
                width: 100%;
                border-collapse: collapse;
            }
            .receipt-table-header {
                font-weight: bold;
                background-color: #f0f0f0;
                font-size: 10px;
                text-transform: uppercase;
            }
            .receipt-table-cell {
                border-bottom: 1px solid #ccc;
                padding: 0.5rem 0.75rem;
                border-right: 1px solid #ccc;
                font-size: 10px; /* MODIFIED: Matched font size to header */
            }
            .receipt-table-cell:last-child { border-right: none; }
            .text-right { text-align: right; }

            /* --- REMOVED: T&C and QR row styles --- */

            .sign-box {
                height: 50px; /* MODIFIED: Space for signature (was 80px) */
            }

        </style>
    `;

    const html = `
        <div class="receipt-wrapper">
            <!-- Header -->
            <div class="receipt-header">
                <div class="receipt-logo">POSTMAN</div>
                <!-- MODIFICATION: Changed to OFFICE COPY -->
                <div class="receipt-copy-type">OFFICE COPY</div>
            </div>
            
            <!-- Meta -->
            <div class="receipt-meta">
                <div class="receipt-meta-cell">
                    <strong>AWB No: ${awb}</strong>
                </div>
                <div class="receipt-meta-cell">
                    <strong>Date:</strong> ${orderDate}
                </div>
                <div class="receipt-meta-cell" style="grid-row: 1 / 3; grid-column: 3 / 4; border-left: 1px solid #333; border-top: none; border-right: none; padding: 0.5rem;">
                    <div class="receipt-barcode-container" id="receipt-barcode-container">
                        <svg id="receipt-barcode"></svg>
                    </div>
                </div>
                <div class="receipt-meta-cell">
                    <strong>Ref No:</strong> ${ref}
                </div>
                <div class="receipt-meta-cell">
                    <strong>Carrier:</strong> ${carrierName}
                </div>
            </div>

            <!-- Party -->
            <div class="receipt-party">
                <div class="receipt-party-cell">
                    <span class="label">Shipper</span>
                    <div class="name">${cnorName}</div>
                    <div>${cnorAddress}</div>
                    <div><strong>Contact:</strong> ${cnorMobile}</div>
                </div>
                <div class="receipt-party-cell">
                    <span class="label">Consignee</span>
                    <div class="name">${cneeName}</div>
                    <div>${cneeAddress}</div>
                    <div><strong>Contact:</strong> ${cneeMobile}</div>
                </div>
            </div>

            <!-- Details -->
            <div class="receipt-details">
                <div class="receipt-details-cell" style="flex-grow: 2;">
                    <span class="label">Payment Mode</span>
                    <span class="value">${paymentMode}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 1;">
                    <span class="label">Pieces</span>
                    <span class="value">${pieces}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 1;">
                    <span class="label">Weight (Kg)</span>
                    <span class="value">${weight}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 2;">
                    <span class="label">Service</span>
                    <span class="value">${modeName}</span>
                </div>
                <div class="receipt-details-cell" style="flex-grow: 2;">
                    <span class="label">Value</span>
                    <span class="value">INR ${totalAmt.toFixed(2)}</span>
                </div>
            </div>

            ${multiboxTableHtml}

            <!-- Products -->
            <table class="receipt-table" style="${multiboxTableHtml ? '' : 'border-top: 2px solid #000; margin-top: -1px;'}">
                <thead class="receipt-table-header">
                    <tr>
                        <th class="receipt-table-cell" style="width: 5%;">#</th>
                        <th class="receipt-table-cell" style="width: 30%;">Product</th>
                        <th class="receipt-table-cell">Doc #</th>
                        <th class="receipt-table-cell">E-Way</th>
                        <th class="receipt-table-cell text-right" style="width: 10%;">Qty</th>
                        <th class="receipt-table-cell text-right" style="width: 15%;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${productTableHtml}
                </tbody>
            </table>

            <!-- REMOVED: T&C / Signature row -->

        </div>
    `;
    
    return styles + html;
}

// --- NEW: Print Label Function ---
function printSelectedShipmentLabel() {
    // NOTE: This function relies on global variables:
    // currentSelectedRef, allOrders, b2b2cDataMap, cnee, productDataMap, multiboxDataMap
    if (!currentSelectedRef) {
        console.error('No shipment selected to print.');
        return;
    }
    const order = allOrders.find(o => o.REFERANCE === currentSelectedRef);
    if (!order) {
        console.error('Could not find order data for printing.');
        return;
    }
    
    // Get all data needed for labels
    const cnor = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee = b2b2cDataMap.get(order.CONSIGNEE);
    const products = productDataMap.get(order.REFERANCE) || [];
    const multiboxItems = multiboxDataMap.get(order.REFERANCE) || [];
    const awb = order.AWB_NUMBER || order.REFERANCE;
    const pieces = multiboxItems.length > 0 ? multiboxItems.length : (order.PIECS || 1);

    // --- MODIFIED: Read layout from HTML element ---
    // User must add a <select id="label-print-layout"> with <option value="2up-landscape"> and <option value="4up-portrait">
    const layoutSelect = document.getElementById('label-print-layout');
    const printLayout = layoutSelect ? layoutSelect.value : '2up-landscape';
    // --- END MODIFICATION ---

    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>Print Label</title>');
    
    // Add JsBarcode script
    printWindow.document.write('<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>');
    
    // --- MODIFIED: Write styles based on layout choice ---
    if (printLayout === '4up-portrait') {
        // --- 4-UP PORTRAIT STYLES ---
        printWindow.document.write(`
            <style>
                @page {
                    size: A4 portrait;
                    margin: 10mm; 
                }
                body, html {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    font-family: 'Arial', sans-serif;
                    box-sizing: border-box;
                }
                body {
                    display: flex;
                    flex-wrap: wrap;
                    /* MODIFIED: Replaced gap/calc with space-between */
                    justify-content: space-between;
                    align-content: flex-start;
                    box-sizing: border-box;
                }
                .label-wrapper { 
                    /* MODIFIED: Using 49% width */
                    width: 49%;
                    max-width: 49% !important; 
                    border: 1px solid #000 !important;
                    box-shadow: none !important;
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box; 
                    page-break-inside: avoid;
                    height: 135mm !important; /* Approx half of A4 portrait height minus margins */
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    overflow: hidden;
                }
                /* ADDED: CSS overrides for 4-up scaling */
                .print-layout-4up-portrait .label-logo { font-size: 14px !important; }
                .print-layout-4up-portrait span[style*="font-size: 18px"] { font-size: 12px !important; } /* Payment */
                .print-layout-4up-portrait div[style*="font-size: 20px"] { font-size: 14px !important; } /* Pieces */
                .print-layout-4up-portrait div[style*="font-size: 18px"] { font-size: 12px !important; } /* Mode/Ref */
                .print-layout-4up-portrait .font-xxl { font-size: 18px !important; } /* Destination */
                .print-layout-4up-portrait .barcode-number { font-size: 14px !important; }
                .print-layout-4up-portrait .label-table { font-size: 9px !important; }
                .print-layout-4up-portrait .label-cell { padding: 3px 4px !important; }
                /* consignee font is handled by JS logic */
                .print-layout-4up-portrait .label-header-sm { font-size: 8px !important; }
                /* END ADDED */
                .label-wrapper .label-row:last-child {
                    margin-top: auto;
                    border-bottom: none !important;
                }
                .label-wrapper .label-row:nth-of-type(5) { /* Consignee */
                    flex-grow: 1;
                    overflow-y: hidden;
                    min-height: 0;
                }
                .label-wrapper .label-row:nth-of-type(6) { /* Tables */
                    flex-shrink: 1;
                    overflow-y: hidden;
                    min-height: 0;
                }
            </style>
        `);
    } else {
        // --- 2-UP LANDSCAPE STYLES (Default) ---
        printWindow.document.write(`
            <style>
                @page {
                    size: A4 landscape;
                    margin: 10mm;
                }
                body, html {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    font-family: 'Arial', sans-serif;
                    box-sizing: border-box;
                }
                body {
                    display: flex;
                    flex-wrap: wrap;
                    /* MODIFIED: Replaced gap/calc with space-between */
                    justify-content: space-between;
                    align-content: flex-start;
                    box-sizing: border-box;
                }
                .label-wrapper { 
                    /* MODIFIED: Using 49% width */
                    width: 49%;
                    max-width: 49% !important; 
                    border: 1px solid #000 !important;
                    box-shadow: none !important;
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box; 
                    page-break-inside: avoid;
                    height: 190mm !important; /* Full A4 landscape height minus margins */
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    overflow: hidden;
                }
                .label-wrapper .label-row:last-child {
                    margin-top: auto;
                    border-bottom: none !important;
                }
                .label-wrapper .label-row:nth-of-type(5) { /* Consignee */
                    flex-grow: 1;
                    overflow-y: hidden;
                    min-height: 0;
                }
                .label-wrapper .label-row:nth-of-type(6) { /* Tables */
                    flex-shrink: 1;
                    overflow-y: hidden;
                    min-height: 0;
                }
            </style>
        `);
    }
    // --- END MODIFICATION ---

    // MODIFIED: Added class to body for CSS targeting
    printWindow.document.write('</head><body class="print-layout-' + printLayout + '">');
    
    // 1. Generate all individual box labels
    if (multiboxItems.length > 0) {
        for (let i = 0; i < pieces; i++) {
            const labelHtml = buildLabel(order, cnor, cnee, products, multiboxItems, { type: 'box', index: i });
            printWindow.document.write(labelHtml);
        }
    } else {
        // If not multibox, print one "box 1/1" label
        const labelHtml = buildLabel(order, cnor, cnee, products, [], { type: 'box', index: 0 });
        printWindow.document.write(labelHtml);
    }

    // 2. Generate the final summary label
    const summaryLabelHtml = buildLabel(order, cnor, cnee, products, multiboxItems, { type: 'summary' });
    printWindow.document.write(summaryLabelHtml);


    printWindow.document.write(`
        <script>
            window.onload = function() {
                try {
                    // --- MODIFICATION: Set options based on layout ---
                    const layout = "${printLayout}";
                    let barcodeOptions, fontOptions;

                    if (layout === '4up-portrait') {
                        barcodeOptions = {
                            format: "CODE128",
                            displayValue: false,
                            margin: 2, // MODIFIED: Reduced from 5
                            height: 25, // 50% height
                            width: 2    // 66% width (1.5 is too small)
                        };
                        fontOptions = {
                            max: 24, // 50% max
                            min: 6   // 75% min
                        };
                    } else { // Default to 2up-landscape
                        barcodeOptions = {
                            format: "CODE128",
                            displayValue: false,
                            margin: 4, // MODIFIED: Reduced from 10
                            height: 50,
                            width: 3
                        };
                        fontOptions = {
                            max: 48,
                            min: 8
                        };
                    }
                    // --- END MODIFICATION ---

                    // --- CRITICAL: Generate barcodes *inside* the print window ---
                    const allSvgs = document.querySelectorAll('.barcode-svg');
                    allSvgs.forEach((svgElement, index) => {
                        const barcodeValue = svgElement.getAttribute('data-barcode-value');
                        if (barcodeValue) {
                            JsBarcode(svgElement, barcodeValue, barcodeOptions); // Use options
                        }
                    });

                    // --- Flexible font size logic ---
                    const allConsigneeCells = document.querySelectorAll('.label-wrapper .label-row:nth-of-type(5)');
                    allConsigneeCells.forEach(cell => {
                        const details = cell.querySelector('.consignee-details');
                        if (!details) return;

                        // Use options
                        const maxFontSize = fontOptions.max;
                        const minFontSize = fontOptions.min;
                        let currentFontSize = maxFontSize; // Start at the max size

                        while (currentFontSize > minFontSize) {
                            details.style.fontSize = \`\${currentFontSize}px\`;
                            const strongs = details.querySelectorAll('strong');
                            strongs.forEach(s => { s.style.fontSize = \`\${currentFontSize + 1}px\`; });

                            if (details.scrollHeight <= (cell.offsetHeight + 1)) {
                                break; 
                            }
                            currentFontSize--;
                        }
                        const finalSize = Math.max(currentFontSize, minFontSize);
                        details.style.fontSize = \`\${finalSize}px\`;
                        const strongs = details.querySelectorAll('strong');
                        strongs.forEach(s => { s.style.fontSize = \`\${finalSize + 1}px\`; });
                    });
                    // --- END of new logic ---

                    // All barcodes and fonts are generated, now print.
                    setTimeout(function() {
                        window.print();
                        // window.close();
                    }, 250); // Small delay for rendering
                } catch (e) {
                    console.error("Print window script failed:", e);
                }
            };
        <\/script>
    `);

    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
}
// --- END OF NEW FUNCTION ---

// --- NEW: Print Receipt Function ---
function printSelectedShipmentReceipt() {
    // NOTE: This function relies on global variables:
    // currentSelectedRef, allOrders, b2b2cDataMap, productDataMap, trackDataMap
    if (!currentSelectedRef) {
        console.error('No shipment selected to print.');
        return;
    }
    const order = allOrders.find(o => o.REFERANCE === currentSelectedRef);
    if (!order) {
        console.error('Could not find order data for printing.');
        return;
    }
    
    // Re-build the receipt content for printing
    const cnor = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee = b2b2cDataMap.get(order.CONSIGNEE);
    const products = productDataMap.get(order.REFERANCE) || [];
    const tracking = trackDataMap.get(order.REFERANCE);
    
    const receiptContent = buildReceipt(order, cnor, cnee, products, tracking);
    const awb = order.AWB_NUMBER || order.REFERANCE;

    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow.document.write('<html><head><title>Print Receipt</title>');
    
    // --- CRITICAL: Add JsBarcode script to print window ---
    printWindow.document.write('<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>');
    
    // Add print-specific overrides for A4 portrait
    printWindow.document.write(`
        <style>
            @page {
                size: A4 portrait;
                margin: 10mm;
            }
            body, html {
                margin: 0;
                padding: 0;
                width: 100%;
                font-family: 'Arial', sans-serif;
            }
            .receipt-wrapper { 
                width: 100% !important;
                max-width: 100% !important; 
                /* MODIFIED: Added border back for printing */
                border: 1px solid #333 !important; 
                box-shadow: none !important;
                margin: 0;
                padding: 0;
                box-sizing: border-box; 
                page-break-inside: avoid;
            }
        </style>
    `);
    printWindow.document.write('</head><body>');
    
    // Write the receipt HTML
    printWindow.document.write(receiptContent);

    // --- ADDED: Script to run *inside* print window ---
    printWindow.document.write(`
        <script>
            // Wait for window to load to ensure barcode script is ready
            window.onload = function() {
                // --- RE-ENABLED: Barcode generation for receipt ---
                try {
                    // Generate the barcode
                    JsBarcode("#receipt-barcode", "${awb}", {
                        format: "CODE128",
                        displayValue: true,
                        text: "${awb}",
                        fontSize: 14,
                        margin: 5,
                        height: 40,
                        width: 2
                    });
                } catch (e) {
                    console.error("Print window JsBarcode error (Receipt):", e);
                }
                
                // Give barcode time to render, then print
                setTimeout(function() {
                    window.print();
                    // window.close();
                }, 250);
            };
        <\/script>
    `);
    // --- END of new script ---


    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
}
// --- END OF MODIFIED FUNCTION ---

// --- NEW: Print POD Function ---
function printSelectedShipmentPOD() {
    // NOTE: This function relies on global variables:
    // currentSelectedRef, allOrders, b2b2cDataMap, productDataMap, trackDataMap
    if (!currentSelectedRef) {
        console.error('No shipment selected to print.');
        return;
    }
    const order = allOrders.find(o => o.REFERANCE === currentSelectedRef);
    if (!order) {
        console.error('Could not find order data for printing.');
        return;
    }
    
    // Re-build the POD content for printing
    const cnor = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee = b2b2cDataMap.get(order.CONSIGNEE);
    const products = productDataMap.get(order.REFERANCE) || [];
    const tracking = trackDataMap.get(order.REFERANCE);
    
    // --- MODIFIED: Call buildPOD ---
    const podContent = buildPOD(order, cnor, cnee, products, tracking);
    const awb = order.AWB_NUMBER || order.REFERANCE;

    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow.document.write('<html><head><title>Print POD</title>'); // MODIFIED title
    
    printWindow.document.write('<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>');
    
    printWindow.document.write(`
        <style>
            @page {
                size: A4 portrait;
                margin: 10mm;
            }
            body, html {
                margin: 0;
                padding: 0;
                width: 100%;
                font-family: 'Arial', sans-serif;
            }
            .receipt-wrapper { 
                width: 100% !important;
                max-width: 100% !important; 
                border: 1px solid #333 !important; 
                box-shadow: none !important;
                margin: 0;
                padding: 0;
                box-sizing: border-box; 
                page-break-inside: avoid;
            }
        </style>
    `);
    printWindow.document.write('</head><body>');
    
    // Write the POD HTML
    printWindow.document.write(podContent);

    printWindow.document.write(`
        <script>
            window.onload = function() {
                try {
                    JsBarcode("#receipt-barcode", "${awb}", { // ID is still receipt-barcode
                        format: "CODE128",
                        displayValue: true,
                        text: "${awb}",
                        fontSize: 14,
                        margin: 5,
                        height: 40,
                        width: 2
                    });
                } catch (e) {
                    console.error("Print window JsBarcode error (POD):", e);
                }
                
                setTimeout(function() {
                    window.print();
                    // window.close();
                }, 250);
            };
        <\/script>
    `);

    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
}
// --- END OF NEW FUNCTION ---

// --- NEW: Print Office Copy Function ---
function printSelectedShipmentOfficeCopy() {
    // NOTE: This function relies on global variables:
    // currentSelectedRef, allOrders, b2b2cDataMap, productDataMap, trackDataMap
    if (!currentSelectedRef) {
        console.error('No shipment selected to print.');
        return;
    }
    const order = allOrders.find(o => o.REFERANCE === currentSelectedRef);
    if (!order) {
        console.error('Could not find order data for printing.');
        return;
    }
    
    // Re-build the Office Copy content for printing
    const cnor = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee = b2b2cDataMap.get(order.CONSIGNEE);
    const products = productDataMap.get(order.REFERANCE) || [];
    const tracking = trackDataMap.get(order.REFERANCE);
    
    // --- MODIFIED: Call buildOfficeCopy ---
    const officeCopyContent = buildOfficeCopy(order, cnor, cnee, products, tracking);
    const awb = order.AWB_NUMBER || order.REFERANCE;

    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow.document.write('<html><head><title>Print Office Copy</title>'); // MODIFIED title
    
    printWindow.document.write('<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>');
    
    printWindow.document.write(`
        <style>
            @page {
                size: A4 portrait;
                margin: 10mm;
            }
            body, html {
                margin: 0;
                padding: 0;
                width: 100%;
                font-family: 'Arial', sans-serif;
            }
            .receipt-wrapper { 
                width: 100% !important;
                max-width: 100% !important; 
                border: 1px solid #333 !important; 
                box-shadow: none !important;
                margin: 0;
                padding: 0;
                box-sizing: border-box; 
                page-break-inside: avoid;
            }
        </style>
    `);
    printWindow.document.write('</head><body>');
    
    // Write the Office Copy HTML
    printWindow.document.write(officeCopyContent);

    printWindow.document.write(`
        <script>
            window.onload = function() {
                try {
                    JsBarcode("#receipt-barcode", "${awb}", { // ID is still receipt-barcode
                        format: "CODE128",
                        displayValue: true,
                        text: "${awb}",
                        fontSize: 14,
                        margin: 5,
                        height: 40,
                        width: 2
                    });
                } catch (e) {
                    console.error("Print window JsBarcode error (Office Copy):", e);
                }
                
                setTimeout(function() {
                    window.print();
                    // window.close();
                }, 250);
            };
        <\/script>
    `);

    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
}
// --- END OF NEW FUNCTION ---
