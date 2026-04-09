// ============================================================================
// utils/docgen.js — Document Builder Utility
// ============================================================================

function getJsBarcodeSrc() {
    return window.location.origin + '/assets/js/JsBarcode.all.min.js';
}

// --- SHARED STYLES ---
function getLabelStyles() {
    return `<style>
        .label-wrapper { border:1px solid #000; width:100%; max-width:42rem; margin:0 auto; font-family:Arial,sans-serif; background:#fff; color:#000; font-size:12px; line-height:1.4; display:flex; flex-direction:column; }
        .label-row { display:flex; border-bottom:1px solid #000; }
        .label-row:last-child { border-bottom:none; }
        .label-cell { padding:6px 8px; border-right:1px solid #000; width:100%; box-sizing:border-box; }
        .label-cell:last-child { border-right:none; }
        .flex-1{flex:1;} .flex-2{flex:2;} .flex-3{flex:3;}
        .w-1-3{width:33.33%;} .w-2-3{width:66.66%;} .w-1-2{width:50%;}
        .text-center{text-align:center;} .text-right{text-align:right;} .font-bold{font-weight:bold;}
        .font-xxl{font-size:28px;font-weight:bold;line-height:1.2;}
        .label-header-sm{font-size:10px;font-weight:bold;text-transform:uppercase;margin-bottom:2px;}
        .label-logo{font-size:24px;font-weight:bold;text-transform:uppercase;}
        .barcode-container{text-align:center;padding:4px 20px;}
        .barcode-container svg{width:100%;height:auto;}
        .barcode-number{font-size:20px;font-weight:bold;text-align:center;letter-spacing:2px;margin-top:2px;}
        .consignee-details{line-height:1.4;font-size:12px;overflow-wrap:break-word;}
        .consignee-details strong{font-size:13px;}
        .label-table{width:100%;border-collapse:collapse;font-size:12px;}
        .label-table th,.label-table td{border-top:1px solid #000;border-right:1px solid #000;padding:6px 8px;text-align:left;}
        .label-table th:last-child,.label-table td:last-child{border-right:none;}
        .label-table th{font-weight:bold;background-color:#f4f4f4;}
        @media print{.label-wrapper{margin:0!important;box-shadow:none!important;}}
    </style>`;
}

function getReceiptStyles() {
    return `<style>
        .receipt-wrapper{border:1px solid #333;width:100%;max-width:48rem;margin:0 auto;font-family:Arial,sans-serif;background:#fff;color:#000;font-size:11px;line-height:1.4;}
        .receipt-header{display:flex;justify-content:space-between;align-items:center;padding:0.5rem 1rem;border-bottom:2px solid #000;}
        .receipt-logo{font-size:24px;font-weight:bold;text-transform:uppercase;}
        .receipt-copy-type{font-size:16px;font-weight:bold;text-align:right;}
        .receipt-meta{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid #333;}
        .receipt-meta-cell{padding:0.5rem 1rem;border-right:1px solid #333;border-top:1px solid #333;}
        .receipt-meta-cell:nth-child(3n){border-right:none;}
        .receipt-meta-cell:nth-child(1),.receipt-meta-cell:nth-child(2){border-top:none;}
        .receipt-meta-cell:last-child{border-right:none;}
        .receipt-meta-cell strong{font-size:13px;}
        .receipt-barcode-container{text-align:center;padding:5px;height:100%;display:flex;align-items:center;justify-content:center;}
        .receipt-barcode-container svg{width:100%;max-width:200px;height:auto;}
        .receipt-party{display:flex;border-bottom:2px solid #000;}
        .receipt-party-cell{width:50%;padding:0.75rem 1rem;border-right:1px solid #333;}
        .receipt-party-cell:last-child{border-right:none;}
        .receipt-party-cell .label{font-size:10px;font-weight:bold;text-transform:uppercase;color:#555;}
        .receipt-party-cell .name{font-size:14px;font-weight:bold;margin-bottom:0.25rem;}
        .receipt-details{display:flex;border-bottom:1px solid #333;}
        .receipt-details-cell{padding:0.5rem 1rem;border-right:1px solid #333;text-align:center;}
        .receipt-details-cell:last-child{border-right:none;}
        .receipt-details-cell .label{font-size:10px;font-weight:bold;text-transform:uppercase;color:#555;display:block;}
        .receipt-details-cell .value{font-size:13px;font-weight:bold;}
        .receipt-table{width:100%;border-collapse:collapse;}
        .receipt-table-header{font-weight:bold;background-color:#f0f0f0;font-size:10px;text-transform:uppercase;}
        .receipt-table-cell{border-bottom:1px solid #ccc;padding:0.5rem 0.75rem;border-right:1px solid #ccc;font-size:10px;}
        .receipt-table-cell:last-child{border-right:none;}
        .text-right{text-align:right;}
        .receipt-terms-row{display:flex;border-top:2px solid #000;border-bottom:2px solid #000;}
        .receipt-terms-cell{width:25%;padding:0.5rem 0.75rem;border-right:1px solid #333;text-align:center;display:flex;align-items:center;justify-content:center;flex-direction:column;}
        .receipt-terms-cell .label{font-size:10px;color:#555;}
        .receipt-qr-cell{width:75%;padding:0.5rem 0.75rem;font-size:6px;line-height:1.5;color:#333;overflow-y:hidden;max-height:120px;border-left:1px solid #ccc;}
        .sign-box{height:50px;}
        @media print{.receipt-wrapper{margin:0!important;box-shadow:none!important;width:100%!important;max-width:100%!important;}}
    </style>`;
}

// --- BUILD LABEL ---
function buildLabel(order, cnor, cnee, products, multiboxItems, options = { type: 'preview' }) {
    const orderDate   = fmtDate(order.ORDER_DATE, 'date');
    const ref         = order.REFERENCE || 'N/A';
    const awb         = order.AWB_NUMBER || ref;
    const carrierName = order.CARRIER || 'CARRIER';
    const modeShort   = order.MODE || 'N/A';
    const modeName    = modesDataMap.get(modeShort) || modeShort;

    const cnorName    = cnor?.NAME || 'N/A';
    const cnorAddress = `${cnor?.ADDRESS||''}, ${cnor?.CITY||''}, ${cnor?.STATE||''} - ${cnor?.PINCODE||''}`;
    const cneeName    = cnee?.NAME || 'N/A';
    const cneeAddress = `${cnee?.ADDRESS||''}, ${cnee?.CITY||''}, ${cnee?.STATE||''}, ${cnee?.PINCODE||''}`;
    const cneeMobile  = cnee?.MOBILE || 'N/A';
    const cneePincode = cnee?.PINCODE || 'N/A';
    const cneeCity    = cnee?.CITY || 'N/A';

    let paymentMode = 'PREPAID', orderValue = 'N/A';
    if (order.COD && parseFloat(order.COD) > 0)        { paymentMode = 'COD';     orderValue = parseFloat(order.COD).toFixed(2); }
    else if (order.TOPAY && parseFloat(order.TOPAY) > 0){ paymentMode = 'TO PAY'; orderValue = parseFloat(order.TOPAY).toFixed(2); }

    const weight  = order.WEIGHT || '0.50';
    const pieces  = multiboxItems.length > 0 ? multiboxItems.length : (order.PIECS || 1);
    const productDesc = (products.length > 0 && products[0].PRODUCT) ? products[0].PRODUCT : 'N/A';

    let totalWeight = 0, totalChgWt = 0;
    if (multiboxItems.length > 0) {
        multiboxItems.forEach(b => { totalWeight += parseFloat(b.WEIGHT||0); totalChgWt += parseFloat(b.CHG_WT||0); });
    } else {
        totalWeight = parseFloat(weight); totalChgWt = totalWeight;
    }

    let summaryTableHtml = '', piecesDisplay = pieces;

    if (options.type === 'box') {
        const boxData = multiboxItems[options.index] || {};
        piecesDisplay = `Box ${options.index + 1} / ${pieces}`;
        const L = boxData.LENGTH||'N/A', B = boxData.BREADTH||'N/A', H = boxData.HIGHT||'N/A';
        const chgWt = boxData.CHG_WT ? parseFloat(boxData.CHG_WT).toFixed(2) : 'N/A';
        summaryTableHtml = `<table class="label-table"><thead><tr><th>BOX#</th><th>WEIGHT</th><th>L*B*H</th><th>CHG WT</th></tr></thead><tbody>
            <tr><td>${boxData.BOX_NO||(options.index+1)}</td><td>${boxData.WEIGHT||'N/A'}</td><td>${L}*${B}*${H}</td><td>${chgWt}</td></tr>
        </tbody></table>`;

    } else if (options.type === 'summary') {
        piecesDisplay = `TOTAL PCS: ${pieces}`;
        summaryTableHtml = `<table class="label-table"><thead><tr><th class="text-center">Boxes</th><th class="text-center">Total Weight</th><th class="text-center">Total Chg Wt</th></tr></thead><tbody>
            <tr><td class="text-center">${pieces}</td><td class="text-center">${totalWeight.toFixed(2)}</td><td class="text-center">${totalChgWt.toFixed(2)}</td></tr>
        </tbody></table>`;

    } else {
        piecesDisplay = `PCS: ${pieces}`;
        if (multiboxItems.length > 0) {
            summaryTableHtml = `<table class="label-table"><thead><tr><th>BOX#</th><th>WEIGHT</th><th>L*B*H</th><th>CHG WT</th></tr></thead><tbody>`;
            multiboxItems.forEach((b, i) => {
                const L = b.LENGTH||'N/A', B = b.BREADTH||'N/A', H = b.HIGHT||'N/A';
                const chgWt = b.CHG_WT ? parseFloat(b.CHG_WT).toFixed(2) : 'N/A';
                summaryTableHtml += `<tr><td>${b.BOX_NO||(i+1)}</td><td>${b.WEIGHT||'N/A'}</td><td>${L}*${B}*${H}</td><td>${chgWt}</td></tr>`;
            });
            summaryTableHtml += `<tr style="font-weight:bold;background:#f4f4f4;"><td>TOTALS</td><td>${totalWeight.toFixed(2)}</td><td>-</td><td>${totalChgWt.toFixed(2)}</td></tr></tbody></table>`;
        } else {
            summaryTableHtml = `<table class="label-table"><thead><tr><th>Order Value</th><th>Weight (KGs)</th><th>Dimension</th></tr></thead><tbody>
                <tr><td>${orderValue}</td><td>${weight}</td><td>N/A</td></tr>
            </tbody></table>`;
        }
    }

    let productTableHtml = `<table class="label-table" style="margin-top:-1px;"><thead><tr><th>PRODUCT</th><th>DOC#</th><th>EWAY</th><th>AMT</th></tr></thead><tbody>`;
    if (products.length > 0) {
        products.forEach(p => {
            productTableHtml += `<tr><td>${p.PRODUCT||'N/A'}</td><td>${p.DOC_NUMBER||'N/A'}</td><td>${p.EWAY_IF||'N/A'}</td><td>${p.AMOUNT||'N/A'}</td></tr>`;
        });
    } else {
        productTableHtml += `<tr><td>${productDesc}</td><td>N/A</td><td>N/A</td><td>N/A</td></tr>`;
    }
    productTableHtml += `</tbody></table>`;

    const barcodeId = `barcode-${options.type}-${options.index||0}`;

    return `${getLabelStyles()}
    <div class="label-wrapper">
        <div class="label-row">
            <div class="label-cell w-1-3"><div class="label-logo">${carrierName}</div></div>
            <div class="label-cell w-1-3">Date: <strong>${orderDate}</strong><br><span class="font-bold" style="font-size:18px;">${paymentMode}</span></div>
            <div class="label-cell w-1-3"><div class="label-logo" style="font-size:20px;font-weight:bold;">${piecesDisplay}</div></div>
        </div>
        <div class="label-row">
            <div class="label-cell w-1-2" style="font-size:18px;font-weight:bold;">Mode: ${modeName}</div>
            <div class="label-cell w-1-2" style="font-size:18px;font-weight:bold;">Ref No: ${ref}</div>
        </div>
        <div class="label-row">
            <div class="label-cell">
                <div class="barcode-container"><svg id="${barcodeId}" class="barcode-svg" data-value="${awb}"></svg></div>
                <div class="barcode-number">${awb}</div>
            </div>
        </div>
        <div class="label-row">
            <div class="label-cell w-1-2"><div class="label-header-sm">Destination Pincode</div><div class="font-xxl">${cneePincode}</div></div>
            <div class="label-cell w-1-2"><div class="label-header-sm">Destination</div><div class="font-xxl">${cneeCity}</div></div>
        </div>
        <div class="label-row" style="flex:1;min-height:0;">
            <div class="label-cell consignee-details" style="display:flex;flex-direction:column;justify-content:center;padding:6px 8px;">
                <div style="font-size:9px;font-weight:600;text-transform:uppercase;color:#555;margin-bottom:2px;">SHIP TO</div>
                <div style="font-size:22px;font-weight:900;line-height:1.1;word-break:break-word;">${cneeName}</div>
                <div style="font-size:13px;font-weight:600;margin-top:4px;line-height:1.3;">${cneeAddress}</div>
                <div style="font-size:13px;font-weight:700;margin-top:3px;">&#128222; ${cneeMobile}</div>
            </div>
        </div>
        <div class="label-row">
            <div class="label-cell" style="padding:0;">${summaryTableHtml}${productTableHtml}</div>
        </div>
        <div class="label-row" style="flex-shrink:0;">
            <div class="label-cell" style="font-size:9px;padding:3px 6px;">Return: <strong>${cnorName}</strong>, ${cnorAddress}</div>
        </div>
    </div>`;
}

// --- SHARED RECEIPT HTML BUILDER ---
function _buildReceiptHtml(order, cnor, cnee, products, copyType) {
    const multiboxItems = multiboxDataMap.get(order.REFERENCE) || [];
    const orderDate   = fmtDate(order.ORDER_DATE, 'date');
    const ref         = order.REFERENCE || 'N/A';
    const awb         = order.AWB_NUMBER || ref;
    const carrierName = order.CARRIER || 'CARRIER';
    const modeName    = modesDataMap.get(order.MODE) || order.MODE || 'N/A';

    const cnorName    = cnor?.NAME || 'N/A';
    const cnorAddress = `${cnor?.ADDRESS||''}, ${cnor?.CITY||''}, ${cnor?.STATE||''} - ${cnor?.PINCODE||''}`;
    const cnorMobile  = cnor?.MOBILE || 'N/A';
    const cneeName    = cnee?.NAME || 'N/A';
    const cneeAddress = `${cnee?.ADDRESS||''}, ${cnee?.CITY||''}, ${cnee?.STATE||''}, ${cnee?.PINCODE||''}`;
    const cneeMobile  = cnee?.MOBILE || 'N/A';

    let paymentMode = 'PREPAID', totalAmt = 0;
    if (order.COD && parseFloat(order.COD) > 0)         paymentMode = 'COD';
    else if (order.TOPAY && parseFloat(order.TOPAY) > 0) paymentMode = 'TO PAY';

    const weight = parseFloat(order.WEIGHT || '0.50').toFixed(2);
    const pieces = order.PIECS || 1;

    let productTableHtml = '';
    if (products.length > 0) {
        products.forEach((p, i) => {
            const amt = parseFloat(p.AMOUNT || p.AMT || 0);
            totalAmt += amt;
            productTableHtml += `<tr class="receipt-table-row">
                <td class="receipt-table-cell">${i+1}</td>
                <td class="receipt-table-cell">${p.PRODUCT||'N/A'}</td>
                <td class="receipt-table-cell">${p.DOC_NUMBER||'N/A'}</td>
                <td class="receipt-table-cell">${p.EWAY_IF||'N/A'}</td>
                <td class="receipt-table-cell text-right">${amt.toFixed(2)}</td>
            </tr>`;
        });
    } else {
        productTableHtml = `<tr><td class="receipt-table-cell" colspan="5">No product details.</td></tr>`;
    }

    let multiboxTableHtml = '';
    if (multiboxItems.length > 0) {
        multiboxTableHtml = `<table class="receipt-table" style="border-top:2px solid #000;">
            <thead class="receipt-table-header"><tr>
                <th class="receipt-table-cell">BOX#</th>
                <th class="receipt-table-cell">WEIGHT (Kg)</th>
                <th class="receipt-table-cell">L*B*H (Cm)</th>
                <th class="receipt-table-cell text-right">CHG WT (Kg)</th>
            </tr></thead><tbody>`;
        multiboxItems.forEach((b, i) => {
            const L = b.LENGTH||'N/A', B = b.BREADTH||'N/A', H = b.HIGHT||'N/A';
            const wt = parseFloat(b.WEIGHT||0).toFixed(2);
            const chgWt = parseFloat(b.CHG_WT||0).toFixed(2);
            multiboxTableHtml += `<tr>
                <td class="receipt-table-cell">${b.BOX_NO||(i+1)}</td>
                <td class="receipt-table-cell">${wt}</td>
                <td class="receipt-table-cell">${L}*${B}*${H}</td>
                <td class="receipt-table-cell text-right">${chgWt}</td>
            </tr>`;
        });
        multiboxTableHtml += `</tbody></table>`;
    }

    const isClientCopy = copyType === 'CLIENT COPY';
    const footerHtml = isClientCopy ? `
        <div class="receipt-terms-row">
            <div class="receipt-terms-cell">
                <span class="label">Admits to T&C</span>
                <div class="sign-box"></div>
                <span class="label">Consignor's Sign & Stamp</span>
            </div>
            <div class="receipt-qr-cell">
                <p style="text-align:left;margin:0;padding:0;">
                    1. Consignor is fully responsible for restricted/prohibited items. 2. This is a Customer Copy, not a Tax Invoice. 3. This receipt means shipment has been handed over for shipping. 4. TAT may differ due to transport, air traffic or natural calamity. 5. Custom, Clearance and Penalty not paid here. 6. Higher Value shipments must be insured by shipper. 7. Freight refund not entertained for service failure due to strikes, floods, fire, accidents or natural calamities. 8. NO FRAGILE or Perishable items under Carrier's Risk. 9. This receipt has 30 days life from booking date. 10. Carrier's liabilities are specifically limited. 11. Carrier has the right to open consignment for inspection.
                </p>
            </div>
        </div>` : (copyType === 'POD COPY' ? `
        <div class="receipt-terms-row">
            <div class="receipt-terms-cell">
                <span class="label">Received in Good Condition</span>
                <div class="sign-box"></div>
                <span class="label">Receiver's Sign & Stamp</span>
            </div>
            <div class="receipt-qr-cell">
                <p style="text-align:left;margin:0;padding:0;">
                    1. Consignor is fully responsible for restricted/prohibited items. 2. This is a Customer Copy, not a Tax Invoice. 3. This receipt means shipment has been handed over for shipping. 4. TAT may differ due to transport, air traffic or natural calamity. 5. Custom, Clearance and Penalty not paid here. 6. Higher Value shipments must be insured by shipper. 7. Freight refund not entertained for service failure due to strikes, floods, fire, accidents or natural calamities. 8. NO FRAGILE or Perishable items under Carrier's Risk. 9. This receipt has 30 days life from booking date. 10. Carrier's liabilities are specifically limited. 11. Carrier has the right to open consignment for inspection.
                </p>
            </div>
        </div>` : '');

    return `${getReceiptStyles()}
    <div class="receipt-wrapper">
        <div class="receipt-header">
            <div class="receipt-logo">POSTMAN</div>
            <div class="receipt-copy-type">${copyType}</div>
        </div>
        <div class="receipt-meta">
            <div class="receipt-meta-cell"><strong>AWB No: ${awb}</strong></div>
            <div class="receipt-meta-cell"><strong>Date:</strong> ${orderDate}</div>
            <div class="receipt-meta-cell" style="grid-row:1/3;grid-column:3/4;border-left:1px solid #333;border-top:none;border-right:none;padding:0.5rem;">
                <div class="receipt-barcode-container"><svg id="receipt-barcode" data-value="${awb}"></svg></div>
            </div>
            <div class="receipt-meta-cell"><strong>Ref No:</strong> ${ref}</div>
            <div class="receipt-meta-cell"><strong>Carrier:</strong> ${carrierName}</div>
        </div>
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
        <div class="receipt-details">
            <div class="receipt-details-cell" style="flex-grow:2;"><span class="label">Payment Mode</span><span class="value">${paymentMode}</span></div>
            <div class="receipt-details-cell" style="flex-grow:1;"><span class="label">Pieces</span><span class="value">${pieces}</span></div>
            <div class="receipt-details-cell" style="flex-grow:1;"><span class="label">Weight (Kg)</span><span class="value">${weight}</span></div>
            <div class="receipt-details-cell" style="flex-grow:2;"><span class="label">Service</span><span class="value">${modeName}</span></div>
            <div class="receipt-details-cell" style="flex-grow:2;"><span class="label">Value</span><span class="value">INR ${totalAmt.toFixed(2)}</span></div>
        </div>
        ${multiboxTableHtml}
        <table class="receipt-table" style="${multiboxTableHtml ? '' : 'border-top:2px solid #000;'}">
            <thead class="receipt-table-header"><tr>
                <th class="receipt-table-cell" style="width:5%;">#</th>
                <th class="receipt-table-cell" style="width:30%;">Product</th>
                <th class="receipt-table-cell">Doc #</th>
                <th class="receipt-table-cell">E-Way</th>
                <th class="receipt-table-cell text-right" style="width:15%;">Amount</th>
            </tr></thead>
            <tbody>${productTableHtml}</tbody>
        </table>
        ${footerHtml}
    </div>`;
}

function buildReceipt(order, cnor, cnee, products)    { return _buildReceiptHtml(order, cnor, cnee, products, 'CLIENT COPY'); }
function buildPOD(order, cnor, cnee, products)         { return _buildReceiptHtml(order, cnor, cnee, products, 'POD COPY'); }
function buildOfficeCopy(order, cnor, cnee, products)  { return _buildReceiptHtml(order, cnor, cnee, products, 'OFFICE COPY'); }

function buildDocs(order, cnor, cnee, products) {
    const ref         = order.REFERENCE || 'N/A';
    const awb         = order.AWB_NUMBER || ref;
    const orderDate   = fmtDate(order.ORDER_DATE, 'date');
    const carrierName = order.CARRIER || 'N/A';
    const modeName    = modesDataMap.get(order.MODE) || order.MODE || 'N/A';

    const cnorName   = cnor?.NAME   || 'N/A';
    const cnorAddr   = `${cnor?.ADDRESS||''}, ${cnor?.CITY||''} - ${cnor?.PINCODE||''}`;
    const cnorMobile = cnor?.MOBILE || 'N/A';
    const cneeName   = cnee?.NAME   || 'N/A';
    const cneeAddr   = `${cnee?.ADDRESS||''}, ${cnee?.CITY||''} - ${cnee?.PINCODE||''}`;
    const cneeMobile = cnee?.MOBILE || 'N/A';

    let totalAmt = 0;
    let rows = '';
    products.forEach((p, i) => {
        const amt = parseFloat(p.AMOUNT || 0);
        totalAmt += amt;
        rows += `<tr>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${i + 1}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;">${p.PRODUCT || 'N/A'}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${p.DOC_NUMBER || 'N/A'}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${p.DOC_TYPE || 'N/A'}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${p.EWAY_IF || 'N/A'}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;font-weight:bold;">${amt.toFixed(2)}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;"></td>
        </tr>`;
    });

    if (products.length === 0)
        rows = `<tr><td colspan="7" style="border:1px solid #ccc;padding:8px;text-align:center;color:#888;">No product data.</td></tr>`;

    return `<style>
        body{font-family:Arial,sans-serif;font-size:11px;color:#000;}
        .ps-wrapper{border:2px solid #000;max-width:52rem;margin:0 auto;}
        .ps-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:2px solid #000;background:#f4f4f4;}
        .ps-logo{font-size:22px;font-weight:bold;text-transform:uppercase;}
        .ps-title{font-size:16px;font-weight:bold;letter-spacing:1px;}
        .ps-meta{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:1px solid #000;}
        .ps-meta-cell{padding:5px 10px;border-right:1px solid #ccc;}
        .ps-meta-cell:last-child{border-right:none;}
        .ps-meta-cell .lbl{font-size:9px;font-weight:bold;text-transform:uppercase;color:#555;}
        .ps-meta-cell .val{font-size:12px;font-weight:bold;margin-top:1px;}
        .ps-party{display:flex;border-bottom:2px solid #000;}
        .ps-party-cell{width:50%;padding:8px 12px;border-right:1px solid #ccc;}
        .ps-party-cell:last-child{border-right:none;}
        .ps-party-cell .lbl{font-size:9px;font-weight:bold;text-transform:uppercase;color:#555;margin-bottom:3px;}
        .ps-party-cell .name{font-size:13px;font-weight:bold;}
        .ps-table{width:100%;border-collapse:collapse;font-size:11px;}
        .ps-table th{background:#f4f4f4;font-weight:bold;text-transform:uppercase;font-size:9px;border:1px solid #ccc;padding:6px 8px;text-align:center;}
        .ps-totals td{background:#f4f4f4;font-weight:bold;border:1px solid #ccc;padding:6px 8px;text-align:center;}
        .ps-footer{display:flex;border-top:2px solid #000;}
        .ps-sign-cell{width:50%;padding:8px 12px;border-right:1px solid #ccc;}
        .ps-sign-cell:last-child{border-right:none;}
        .ps-sign-box{height:48px;border-bottom:1px solid #999;margin-top:4px;}
        @media print{.ps-wrapper{margin:0;border:none;}}
    </style>
    <div class="ps-wrapper">
        <div class="ps-header">
            <div class="ps-logo">POSTMAN</div>
            <div class="ps-title">PRODUCT PACKING SLIP</div>
        </div>
        <div class="ps-meta">
            <div class="ps-meta-cell"><div class="lbl">AWB No</div><div class="val">${awb}</div></div>
            <div class="ps-meta-cell"><div class="lbl">Ref No</div><div class="val">${ref}</div></div>
            <div class="ps-meta-cell"><div class="lbl">Date</div><div class="val">${orderDate}</div></div>
            <div class="ps-meta-cell"><div class="lbl">Carrier / Mode</div><div class="val">${carrierName} / ${modeName}</div></div>
        </div>
        <div class="ps-party">
            <div class="ps-party-cell">
                <div class="lbl">From (Shipper)</div>
                <div class="name">${cnorName}</div>
                <div>${cnorAddr}</div>
                <div>Mob: ${cnorMobile}</div>
            </div>
            <div class="ps-party-cell">
                <div class="lbl">To (Consignee)</div>
                <div class="name">${cneeName}</div>
                <div>${cneeAddr}</div>
                <div>Mob: ${cneeMobile}</div>
            </div>
        </div>
        <table class="ps-table">
            <thead><tr>
                <th>#</th>
                <th style="text-align:left;">Product</th>
                <th>Doc No</th>
                <th>Doc Type</th>
                <th>E-Way Bill</th>
                <th>Amount (₹)</th>
                <th>Remarks</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr class="ps-totals">
                <td colspan="5" style="text-align:right;">TOTAL (${products.length} item${products.length !== 1 ? 's' : ''})</td>
                <td>${totalAmt.toFixed(2)}</td>
                <td></td>
            </tr></tfoot>
        </table>
        <div class="ps-footer">
            <div class="ps-sign-cell">
                <div class="lbl">Packed By</div>
                <div class="ps-sign-box"></div>
            </div>
            <div class="ps-sign-cell">
                <div class="lbl">Checked By</div>
                <div class="ps-sign-box"></div>
            </div>
        </div>
    </div>`;
}

function buildMultibox(order, cnor, cnee, products, multiboxItems) {
    const ref         = order.REFERENCE || 'N/A';
    const awb         = order.AWB_NUMBER || ref;
    const orderDate   = fmtDate(order.ORDER_DATE, 'date');
    const carrierName = order.CARRIER || 'N/A';
    const modeName    = modesDataMap.get(order.MODE) || order.MODE || 'N/A';

    const cnorName    = cnor?.NAME    || 'N/A';
    const cnorAddr    = `${cnor?.ADDRESS||''}, ${cnor?.CITY||''} - ${cnor?.PINCODE||''}`;
    const cnorMobile  = cnor?.MOBILE  || 'N/A';
    const cneeName    = cnee?.NAME    || 'N/A';
    const cneeAddr    = `${cnee?.ADDRESS||''}, ${cnee?.CITY||''} - ${cnee?.PINCODE||''}`;
    const cneeMobile  = cnee?.MOBILE  || 'N/A';

    let totalWt = 0, totalChgWt = 0;
    let rows = '';
    multiboxItems.forEach((b, i) => {
        const wt    = parseFloat(b.WEIGHT  || 0);
        const chgWt = parseFloat(b.CHG_WT || 0);
        const L = parseFloat(b.LENGTH  || 0);
        const B = parseFloat(b.BREADTH || 0);
        const H = parseFloat(b.HIGHT   || 0);
        const vol = L && B && H ? ((L * B * H) / 5000).toFixed(2) : 'N/A';
        totalWt    += wt;
        totalChgWt += chgWt;
        rows += `<tr>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${b.BOX_NUM || (i + 1)}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${wt.toFixed(2)}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${L} × ${B} × ${H}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${vol}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;font-weight:bold;">${chgWt.toFixed(2)}</td>
            <td style="border:1px solid #ccc;padding:6px 8px;"></td>
        </tr>`;
    });

    if (multiboxItems.length === 0)
        rows = `<tr><td colspan="6" style="border:1px solid #ccc;padding:8px;text-align:center;color:#888;">No multibox data.</td></tr>`;

    return `<style>
        body{font-family:Arial,sans-serif;font-size:11px;color:#000;}
        .ps-wrapper{border:2px solid #000;max-width:52rem;margin:0 auto;}
        .ps-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:2px solid #000;background:#f4f4f4;}
        .ps-logo{font-size:22px;font-weight:bold;text-transform:uppercase;}
        .ps-title{font-size:16px;font-weight:bold;letter-spacing:1px;}
        .ps-meta{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:1px solid #000;}
        .ps-meta-cell{padding:5px 10px;border-right:1px solid #ccc;}
        .ps-meta-cell:last-child{border-right:none;}
        .ps-meta-cell .lbl{font-size:9px;font-weight:bold;text-transform:uppercase;color:#555;}
        .ps-meta-cell .val{font-size:12px;font-weight:bold;margin-top:1px;}
        .ps-party{display:flex;border-bottom:2px solid #000;}
        .ps-party-cell{width:50%;padding:8px 12px;border-right:1px solid #ccc;}
        .ps-party-cell:last-child{border-right:none;}
        .ps-party-cell .lbl{font-size:9px;font-weight:bold;text-transform:uppercase;color:#555;margin-bottom:3px;}
        .ps-party-cell .name{font-size:13px;font-weight:bold;}
        .ps-table{width:100%;border-collapse:collapse;font-size:11px;}
        .ps-table th{background:#f4f4f4;font-weight:bold;text-transform:uppercase;font-size:9px;border:1px solid #ccc;padding:6px 8px;text-align:center;}
        .ps-totals td{background:#f4f4f4;font-weight:bold;border:1px solid #ccc;padding:6px 8px;text-align:center;}
        .ps-footer{display:flex;border-top:2px solid #000;}
        .ps-sign-cell{width:50%;padding:8px 12px;border-right:1px solid #ccc;}
        .ps-sign-cell:last-child{border-right:none;}
        .ps-sign-box{height:48px;border-bottom:1px solid #999;margin-top:4px;}
        @media print{.ps-wrapper{margin:0;border:none;}}
    </style>
    <div class="ps-wrapper">
        <div class="ps-header">
            <div class="ps-logo">POSTMAN</div>
            <div class="ps-title">PACKING SLIP</div>
        </div>
        <div class="ps-meta">
            <div class="ps-meta-cell"><div class="lbl">AWB No</div><div class="val">${awb}</div></div>
            <div class="ps-meta-cell"><div class="lbl">Ref No</div><div class="val">${ref}</div></div>
            <div class="ps-meta-cell"><div class="lbl">Date</div><div class="val">${orderDate}</div></div>
            <div class="ps-meta-cell"><div class="lbl">Carrier / Mode</div><div class="val">${carrierName} / ${modeName}</div></div>
        </div>
        <div class="ps-party">
            <div class="ps-party-cell">
                <div class="lbl">From (Shipper)</div>
                <div class="name">${cnorName}</div>
                <div>${cnorAddr}</div>
                <div>Mob: ${cnorMobile}</div>
            </div>
            <div class="ps-party-cell">
                <div class="lbl">To (Consignee)</div>
                <div class="name">${cneeName}</div>
                <div>${cneeAddr}</div>
                <div>Mob: ${cneeMobile}</div>
            </div>
        </div>
        <table class="ps-table">
            <thead><tr>
                <th>Box #</th>
                <th>Weight (kg)</th>
                <th>L × B × H (cm)</th>
                <th>Vol. Wt (kg)</th>
                <th>Chg. Wt (kg)</th>
                <th>Remarks</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr class="ps-totals">
                <td>TOTAL (${multiboxItems.length} boxes)</td>
                <td>${totalWt.toFixed(2)}</td>
                <td>—</td>
                <td>—</td>
                <td>${totalChgWt.toFixed(2)}</td>
                <td></td>
            </tr></tfoot>
        </table>
        <div class="ps-footer">
            <div class="ps-sign-cell">
                <div class="lbl">Packed By</div>
                <div class="ps-sign-box"></div>
            </div>
            <div class="ps-sign-cell">
                <div class="lbl">Checked By</div>
                <div class="ps-sign-box"></div>
            </div>
        </div>
    </div>`;
}

function buildChallan(order, cnor, cnee, products) {
    const list = products.map(p => `<li>${p.PRODUCT||'N/A'}</li>`).join('') || '<li>No products.</li>';
    return `<div style="padding:1rem;font-family:Arial,sans-serif;">
        <h3 style="font-weight:bold;">Delivery Challan</h3>
        <p><strong>From:</strong> ${cnor?.NAME||'N/A'}</p>
        <p><strong>To:</strong> ${cnee?.NAME||'N/A'}</p>
        <ul style="margin-top:0.5rem;">${list}</ul>
        <p style="color:#888;font-size:11px;margin-top:1rem;">(Full challan template pending)</p>
    </div>`;
}

// --- OPEN DOC IN NEW TAB ---
function _openInNewTab(title, bodyHtml, barcodeIds = []) {
    const jsSrc = getJsBarcodeSrc();
    const barcodeScript = barcodeIds.length > 0 ? `
        <script src="${jsSrc}"><\/script>
        <script>
            window.addEventListener('load', function() {
                ${barcodeIds.map(id => `
                try {
                    var el = document.getElementById('${id}') || document.querySelector('[id="${id}"]');
                    if (el) JsBarcode(el, el.getAttribute('data-value'), { format:'CODE128', displayValue:true, fontSize:14, margin:5, height:40, width:2 });
                } catch(e) { console.error('Barcode error ${id}:', e); }
                `).join('')}
            });
        <\/script>` : '';

    const html = `<!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>body{margin:0;padding:1rem;background:#f3f4f6;} @media print{body{padding:0;background:#fff;}}</style>
    </head><body>
        ${bodyHtml}
        ${barcodeScript}
    </body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
}

function _getSelectedOrder() {
    if (!currentSelectedRef) { showNotification('No shipment selected.', 'error'); return null; }
    const order = allOrders.find(o => o.REFERENCE === currentSelectedRef);
    if (!order) { showNotification('Order data not found.', 'error'); return null; }
    return order;
}

function printSelectedShipmentLabel() {
    const order = _getSelectedOrder(); if (!order) return;
    const cnor         = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee         = b2b2cDataMap.get(order.CONSIGNEE);
    const products     = productDataMap.get(order.REFERENCE) || [];
    const multiboxItems = multiboxDataMap.get(order.REFERENCE) || [];
    const awb          = order.AWB_NUMBER || order.REFERENCE;
    const pieces       = multiboxItems.length > 0 ? multiboxItems.length : (order.PIECS || 1);
    const layoutSelect = document.getElementById('label-print-layout');
    const layout       = layoutSelect ? layoutSelect.value : '2up-landscape';

    const isPortrait   = layout === '4up-portrait';
    const pageStyle    = `<style>@page{size:A4 ${isPortrait?'portrait':'landscape'};margin:8mm;}
        body{display:flex;flex-wrap:wrap;justify-content:space-between;align-content:flex-start;gap:0;}
        .label-wrapper{width:49%;max-width:49%!important;border:1px solid #000!important;box-shadow:none!important;margin:0;padding:0;box-sizing:border-box;page-break-inside:avoid;
            height:${isPortrait?'138mm':'192mm'}!important;display:flex;flex-direction:column;overflow:hidden;}
        ${isPortrait ? `
        .label-logo{font-size:13px!important;}
        .label-cell{padding:2px 4px!important;font-size:10px!important;}
        .label-row:nth-child(1) .label-cell{font-size:10px!important;}
        .label-row:nth-child(2) .label-cell{font-size:11px!important;}
        .font-xxl{font-size:18px!important;}
        .label-header-sm{font-size:8px!important;}
        .barcode-container{padding:2px 6px!important;}
        .barcode-container svg{height:55px!important;width:100%!important;}
        .barcode-number{font-size:12px!important;letter-spacing:1px!important;}
        .label-table td,.label-table th{padding:1px 3px!important;font-size:9px!important;}
        .consignee-details div:nth-child(2){font-size:20px!important;}
        .consignee-details div:nth-child(3){font-size:14px!important;}
        .consignee-details div:nth-child(4){font-size:14px!important;}
        ` : ''}
    </style>`;

    let bodyHtml = pageStyle;
    const barcodeIds = [];

    if (multiboxItems.length > 0) {
        for (let i = 0; i < pieces; i++) {
            bodyHtml += buildLabel(order, cnor, cnee, products, multiboxItems, { type:'box', index:i });
            barcodeIds.push(`barcode-box-${i}`);
        }
    } else {
        bodyHtml += buildLabel(order, cnor, cnee, products, [], { type:'box', index:0 });
        barcodeIds.push('barcode-box-0');
    }
    bodyHtml += buildLabel(order, cnor, cnee, products, multiboxItems, { type:'summary' });
    barcodeIds.push('barcode-summary-0');

    _openInNewTab(`Label - ${awb}`, bodyHtml, barcodeIds);
}

function printSelectedShipmentReceipt() {
    const order = _getSelectedOrder(); if (!order) return;
    const cnor     = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee     = b2b2cDataMap.get(order.CONSIGNEE);
    const products = productDataMap.get(order.REFERENCE) || [];
    _openInNewTab(`Receipt - ${order.AWB_NUMBER||order.REFERENCE}`, buildReceipt(order, cnor, cnee, products), ['receipt-barcode']);
}

function printSelectedShipmentPOD() {
    const order = _getSelectedOrder(); if (!order) return;
    const cnor     = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee     = b2b2cDataMap.get(order.CONSIGNEE);
    const products = productDataMap.get(order.REFERENCE) || [];
    _openInNewTab(`POD - ${order.AWB_NUMBER||order.REFERENCE}`, buildPOD(order, cnor, cnee, products), ['receipt-barcode']);
}

function printSelectedShipmentOfficeCopy() {
    const order = _getSelectedOrder(); if (!order) return;
    const cnor     = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee     = b2b2cDataMap.get(order.CONSIGNEE);
    const products = productDataMap.get(order.REFERENCE) || [];
    _openInNewTab(`Office Copy - ${order.AWB_NUMBER||order.REFERENCE}`, buildOfficeCopy(order, cnor, cnee, products), ['receipt-barcode']);
}

function printSelectedShipmentDocs() {
    const order = _getSelectedOrder(); if (!order) return;
    const cnor     = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee     = b2b2cDataMap.get(order.CONSIGNEE);
    const products = productDataMap.get(order.REFERENCE) || [];
    _openInNewTab(`Docs - ${order.AWB_NUMBER||order.REFERENCE}`, buildDocs(order, cnor, cnee, products));
}

function printSelectedShipmentMultibox() {
    const order = _getSelectedOrder(); if (!order) return;
    const cnor         = b2b2cDataMap.get(order.CONSIGNOR);
    const cnee         = b2b2cDataMap.get(order.CONSIGNEE);
    const products     = productDataMap.get(order.REFERENCE) || [];
    const multiboxItems = multiboxDataMap.get(order.REFERENCE) || [];
    _openInNewTab(`Multibox - ${order.AWB_NUMBER||order.REFERENCE}`, buildMultibox(order, cnor, cnee, products, multiboxItems));
}
