function generateInvoicePrint(invoice, shipments, b2b, branch) {
    const clientName     = b2b?.B2B_NAME         || invoice.CODE;
    const clientGST      = b2b?.ID_GST_PAN_ADHAR  || '';
    const clientMob      = b2b?.MOBILE_NUMBER      || '';
    const clientLandmark = b2b?.B2B_LANDMARK       || '';
    const invNum         = invoice.INV_NUMBER      || 'N/A';
    const invDate        = invoice.INVOICE_DATE    ? fmtDate(invoice.INVOICE_DATE) : 'N/A';
    const branchName     = branch?.BRANCH_NAME     || invoice.BRANCH || 'N/A';
    const branchCity     = branch?.BRANCH_CITY     || 'local';
    const branchGST      = branch?.BRANCH_GSTIN    || '';
    const branchPAN      = branch?.BRANCH_PAN      || '';
    const branchMob      = branch?.BRANCH_MOBILE   || '';
    const branchEmail    = branch?.BRANCH_EMAIL    || '';
    const branchLandmark = branch?.BRANCH_LANDMARK || '';
    const branchUpi      = branch?.BRANCH_UPI      || '';
    const branchUpiName  = branch?.BRANCH_UPI_NAME  || branchName;
    const branchBankAc   = branch?.BRANCH_BANK_AC   || '';
    const branchIfsc     = branch?.BRANCH_IFSC       || '';
    const branchBankName = branch?.BRANCH_BANK_NAME  || '';

    let totalFright=0,totalFuel=0,totalCod=0,totalTopay=0,totalFov=0,
        totalEway=0,totalAwb=0,totalPack=0,totalDev=0,
        totalSgst=0,totalCgst=0,totalIgst=0,totalTaxable=0,grandTotal=0,
        totalPiecs=0,totalChgWt=0;

    shipments.forEach(s => {
        totalFright  += parseFloat(s.FRIGHT   ||0);
        totalFuel    += parseFloat(s.FUEL_CHG ||0);
        totalCod     += parseFloat(s.COD_CHG  ||0);
        totalTopay   += parseFloat(s.TOPAY_CHG||0);
        totalFov     += parseFloat(s.FOV_CHG  ||0);
        totalEway    += parseFloat(s.EWAY_CHG ||0);
        totalAwb     += parseFloat(s.AWB_CHG  ||0);
        totalPack    += parseFloat(s.PACK_CHG ||0);
        totalDev     += parseFloat(s.DEV_CHG  ||0);
        totalSgst    += parseFloat(s.SGST     ||0);
        totalCgst    += parseFloat(s.CGST     ||0);
        totalIgst    += parseFloat(s.IGST     ||0);
        totalTaxable += parseFloat(s.TAXABLE  ||0);
        grandTotal   += parseFloat(s.TOTAL    ||0);
        totalPiecs   += parseInt(s.PIECS      ||0);
        totalChgWt   += parseFloat(s.CHG_WT   ||0);
    });

    // Amount in words — Rupees X Only format
    function numToWords(n) {
        const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
            'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
        const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
        n = Math.round(n);
        if (n===0) return '';
        if (n<20)  return a[n];
        if (n<100) return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');
        if (n<1000) return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+numToWords(n%100):'');
        if (n<100000) return numToWords(Math.floor(n/1000))+' Thousand'+(n%1000?' '+numToWords(n%1000):'');
        if (n<10000000) return numToWords(Math.floor(n/100000))+' Lakh'+(n%100000?' '+numToWords(n%100000):'');
        return numToWords(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+numToWords(n%10000000):'');
    }
    const amtWords = 'Rupees ' + numToWords(Math.round(grandTotal)) + ' Only';

    const rows = shipments.map((s,i) => `<tr>
        <td class="text-center">${i+1}</td>
        <td>${fmtDate(s.ORDER_DATE)}</td>
        <td>${s.AWB_NUMBER||'N/A'}: ${s.CARRIER||'N/A'}</td>
        <td class="text-center">${s.MODE||'N/A'}</td>
        <td class="text-center">${String(s.PIECS||1).padStart(2,'0')}</td>
        <td>${s.DEST_PINCODE||''}: ${s.DEST_CITY||'N/A'}</td>
        <td class="text-right">${parseFloat(s.CHG_WT||0).toFixed(2)}</td>
        <td class="text-right">&#8377;${parseFloat(s.FRIGHT||0).toFixed(2)}</td>
    </tr>`).join('');

    const qrUrl = branchUpi
        ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=upi://pay?pa=${encodeURIComponent(branchUpi)}%26pn=${encodeURIComponent(branchUpiName)}%26am=${grandTotal.toFixed(2)}%26cu=INR`
        : '';

    // Only show non-zero charge rows
    const chargeRows = [
        ['Fright',             totalFright,   true],
        ['Fuel Charge',        totalFuel,     false],
        ['COD Charge',         totalCod,      false],
        ['Topay Charge',       totalTopay,    false],
        ['Insurance Charge',   totalFov,      false],
        ['Eway Handle Charge', totalEway,     false],
        ['Awb Charges',        totalAwb,      false],
        ['Packaging Charges',  totalPack,     false],
        ['Devlopment Charges', totalDev,      false],
        ['Taxable Amount',     totalTaxable,  true],
        ['SGST',               totalSgst,     false],
        ['CGST',               totalCgst,     false],
        ['IGST',               totalIgst,     false],
    ].filter(([,val,always]) => always || val > 0)
     .map(([label,val]) => `<tr><td>${label}</td><td class="text-right">${val.toFixed(2)}</td></tr>`)
     .join('');

    const css = `
        body{font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#000;margin:0;padding:20px;background:#f5f5f5;}
        .invoice-box{max-width:800px;margin:auto;background:#fff;padding:30px;border:1px solid #eee;box-shadow:0 0 10px rgba(0,0,0,.15);}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:15px;margin-bottom:20px;}
        .logo{width:100px;height:100px;object-fit:contain;border-radius:4px;}
        .title-section{text-align:right;}
        .title-section h1{margin:0;font-size:28px;text-transform:uppercase;}
        .title-section p{margin:5px 0 0;font-size:13px;}
        .info-container{display:flex;justify-content:space-between;margin-bottom:20px;gap:20px;}
        .info-col{width:48%;}
        .info-divider{width:1px;background:#ccc;align-self:stretch;}
        .info-divider-bottom{height:2px;background:#000;margin-bottom:20px;}
        .info-col h3{margin:0 0 5px;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px;}
        .info-col p{margin:2px 0;}
        .meta-info{margin-bottom:20px;font-weight:bold;text-align:center;}
        table{width:100%;border-collapse:collapse;margin-bottom:20px;}
        table,th,td{border:1px solid #000;}
        th,td{padding:6px;text-align:left;}
        th{background:#f2f2f2;}
        thead{display:table-header-group;}
        .text-right{text-align:right;}.text-center{text-align:center;}
        .totals-container{display:flex;justify-content:space-between;margin-bottom:20px;page-break-inside:avoid;}
        .payment-details{width:55%;}
        .charges-table{width:40%;}
        .charges-table table{margin-bottom:0;}
        .charges-table th,.charges-table td{padding:4px 6px;}
        .footer{margin-top:30px;}
        .terms{font-size:11px;margin-bottom:40px;}
        .terms ol{margin:5px 0 0;padding-left:20px;}
        .signatory{text-align:right;font-weight:bold;}
        .signatory-box{display:inline-block;text-align:center;}
        @media print{
            @page{size:A4;margin:10mm;}
            body{background:#fff;padding:0;}
            .invoice-box{box-shadow:none;border:none;}
            thead{display:table-header-group;}
            .totals-container{page-break-inside:avoid;}
        }
    `;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Tax Invoice ${invNum}</title>
    <style>${css}</style></head><body>
    <div class="invoice-box">
        <div class="header">
            <div><img src="assets/images/post4ex-logo.svg" alt="Logo" class="logo"></div>
            <div class="title-section">
                <h1>Tax Invoice</h1>
                <p><strong>Invoice Date:</strong> ${invDate}</p>
                <p><strong>Invoice No:</strong> ${invNum}</p>
            </div>
        </div>
        <div class="info-container">
            <div class="info-col">
                <h3>Billed By: ${branchName}</h3>
                <p><strong>Address:</strong> ${branch?.BRANCH_ADDRESS||''}</p>
                ${branchLandmark ? `<p><strong>Landmark:</strong> ${branchLandmark}</p>` : ''}
                <p><strong>City:</strong> ${branchCity}, ${branch?.BRANCH_STATE||''}, India</p>
                <p><strong>Biller Pincode:</strong> ${branch?.BRANCH_PINCODE||''}</p>
                <p><strong>Phone:</strong> ${branchMob}</p>
                <p><strong>Email:</strong> ${branchEmail}</p>
                <p><strong>PAN / GST:</strong> ${branchPAN} / ${branchGST}</p>
            </div>
            <div class="info-divider"></div>
            <div class="info-col">
                <h3>Bill To: ${clientName}</h3>
                <p><strong>Address:</strong> ${b2b?.B2B_ADDRESS||''}</p>
                <p><strong>Landmark:</strong> ${clientLandmark}</p>
                <p><strong>City:</strong> ${b2b?.B2B_CITY||''}, ${b2b?.B2B_STATE||''}, India</p>
                <p><strong>Billing Pincode:</strong> ${b2b?.B2B_PINCODE||''}</p>
                <p><strong>Mobile Number:</strong> ${clientMob}</p>
                <p><strong>PAN / GST:</strong> ${clientGST}</p>
            </div>
        </div>
        <div class="info-divider-bottom"></div>
        <div class="meta-info">
            <p>Bill For SAC Code 996812 Courier Services</p>
        </div>
        <table>
            <thead><tr>
                <th class="text-center">Sr</th><th>Date</th><th>AWB: Carrier</th>
                <th class="text-center">Mode</th><th class="text-center">Piecs</th>
                <th>Destination</th><th class="text-right">Chg. Wt</th><th class="text-right">Fright</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr style="font-weight:bold;">
                <td colspan="4" class="text-right">Totals</td>
                <td class="text-center">${totalPiecs}</td>
                <td></td>
                <td class="text-right">${totalChgWt.toFixed(2)}</td>
                <td class="text-right">${totalFright.toFixed(2)}</td>
            </tr></tfoot>
        </table>
        <div class="totals-container">
            <div class="payment-details">
                ${branchUpi ? `<p><strong>Pay via UPI:</strong></p>
                <img src="${qrUrl}" alt="UPI QR Code" style="width:120px;height:120px;margin:10px 0;border:1px solid #ddd;">
                <p>Name: ${branchUpiName}<br>UPI ID: ${branchUpi}</p>` : ''}
                ${branchBankAc ? `<p><strong>Bank Details:</strong><br>
                A/C: ${branchBankAc}<br>IFSC: ${branchIfsc}<br>Bank: ${branchBankName}</p>` : ''}
                <p><strong>Total Amount (in words):</strong><br>${amtWords}</p>
            </div>
            <div class="charges-table">
                <table><thead><tr><th>Charge Type</th><th class="text-right">Amount ( )</th></tr></thead>
                <tbody>
                    ${chargeRows}
                    <tr style="font-weight:bold;"><td>Total Amount</td><td class="text-right">${grandTotal.toFixed(2)}</td></tr>
                </tbody></table>
            </div>
        </div>
        <div class="footer">
            <div class="terms">
                <strong>Terms &amp; Conditions:</strong>
                <ol>
                    <li>All disputes are subject to ${branchCity} Jurisdiction.</li>
                    <li>Payment due on receipt of this bill.</li>
                    <li>This is a computer-generated bill; no signature is required.</li>
                    <li>Dev. charges of 5.00% will be waived if paid within 10 days.</li>
                    <li>This Bill is for SAC Code 996812 (Courier Services).</li>
                </ol>
            </div>
            <div class="signatory">
                <div class="signatory-box">
                    <p style="margin-bottom:40px;">Authorized Signatory</p>
                    <p>for ${branchName}</p>
                </div>
            </div>
        </div>
    </div>
    <script>window.onload=()=>window.print();<\/script>
    </body></html>`;

    const w = window.open('', `Invoice-${invNum}`);
    w.document.write(html);
    w.document.close();
}


document.addEventListener('DOMContentLoaded', () => {
    const ui = {
        statusMessage:                  document.getElementById('status-message'),
        shipmentList:                   document.getElementById('shipmentList'),
        shipmentListPane:               document.getElementById('shipmentListPane'),
        shipmentDetailPane:             document.getElementById('shipmentDetailPane'),
        backToListBtn:                  document.getElementById('backToListBtn'),
        detailView:                     document.getElementById('detailView'),
        searchShipments:                document.getElementById('searchShipments'),
        filterToggleBtn:                document.getElementById('filterToggleBtn'),
        unbilledToggleBtn:              document.getElementById('unbilledToggleBtn'),
        filterModal:                    document.getElementById('filterModal'),
        filterStartDate:                document.getElementById('filter-start-date'),
        filterEndDate:                  document.getElementById('filter-end-date'),
        filterBranch:                   document.getElementById('filter-branch'),
        filterCode:                     document.getElementById('filter-code'),
        filterCarrier:                  document.getElementById('filter-carrier'),
        resetFiltersBtn:                document.getElementById('reset-filters'),
        applyFiltersBtn:                document.getElementById('apply-filters'),
        emptyView:                      document.getElementById('emptyView'),
        invoiceDetailsCardContainer:    document.getElementById('invoiceDetailsCardContainer'),
        shipmentDetailsTableContainer:  document.getElementById('shipmentDetailsTableContainer'),
        summaryTableContainer:          document.getElementById('summaryTableContainer'),
    };

    let allShipments       = [];
    let b2bDataMap         = new Map();
    let branchDataMap      = new Map();
    let consolidatedInvoices = [];
    let currentSelectedRef = null;
    let isUnbilledMode     = false;

    const isMobileView = () => window.innerWidth < 768;

    const showDetailView = (showContent = false) => {
        if (isMobileView()) {
            ui.shipmentListPane.classList.toggle('hidden', showContent);
            ui.shipmentDetailPane.classList.toggle('hidden', !showContent);
        }
        ui.emptyView.classList.toggle('hidden', showContent);
        ui.detailView.classList.toggle('hidden', !showContent);
    };

    ui.backToListBtn.addEventListener('click', () => showDetailView(false));

    ui.unbilledToggleBtn.addEventListener('click', () => {
        isUnbilledMode = !isUnbilledMode;
        ui.unbilledToggleBtn.classList.toggle('filter-active', isUnbilledMode);
        ui.searchShipments.value = '';
        ui.filterStartDate.value = ''; ui.filterEndDate.value = '';
        ui.filterBranch.value = ''; ui.filterCode.value = ''; ui.filterCarrier.value = '';
        applyFilters();
    });

    // --- Consolidation ---
    function getConsolidationKey(order) {
        if (order.INV_NUMBER)  return { key: 'INV-'   + order.INV_NUMBER,  type: 'INV'   };
        if (order.INVOICE_ID)  return { key: 'ID-'    + order.INVOICE_ID,  type: 'ID'    };
        if (order.ORDER_DATE && order.CODE) {
            const d = new Date(order.ORDER_DATE);
            if (isNaN(d.getTime())) return null;
            const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}`;
            return { key: `MONTH-${order.CODE}-${ym}`, type: 'MONTH' };
        }
        return null;
    }

    function getShipmentsForInvoice(key) {
        return allShipments.filter(s => { const k = getConsolidationKey(s); return k && k.key === key; });
    }

    function consolidateInvoiceData(orders) {
        const map = new Map();
        orders.forEach(order => {
            const ki = getConsolidationKey(order);
            if (!ki) return;
            const { key, type } = ki;
            const oDate  = order.ORDER_DATE   || null;
            const iDate  = order.INVOICE_DATE || null;
            const sortDt = iDate || oDate;
            if (!sortDt) return;
            const total  = parseFloat(order.TOTAL) || 0;
            if (map.has(key)) {
                const inv = map.get(key);
                inv.TOTAL += total;
                if (iDate && (!inv.INVOICE_DATE || new Date(iDate) < new Date(inv.INVOICE_DATE))) inv.INVOICE_DATE = iDate;
                if (oDate && (!inv.START_DATE   || new Date(oDate) < new Date(inv.START_DATE)))   inv.START_DATE   = oDate;
                if (oDate && (!inv.END_DATE     || new Date(oDate) > new Date(inv.END_DATE)))     inv.END_DATE     = oDate;
                if (new Date(sortDt) > new Date(inv.DATE_FOR_SORTING)) inv.DATE_FOR_SORTING = sortDt;
            } else {
                map.set(key, { CONSOLIDATION_KEY: key, KEY_TYPE: type,
                    INV_NUMBER: order.INV_NUMBER || null, INVOICE_ID: order.INVOICE_ID || null,
                    CODE: order.CODE, BRANCH: order.BRANCH, CARRIER: order.CARRIER,
                    INVOICE_DATE: iDate, DATE_FOR_SORTING: sortDt,
                    START_DATE: oDate, END_DATE: oDate, TOTAL: total });
            }
        });
        return Array.from(map.values()).sort((a,b) => new Date(b.DATE_FOR_SORTING||0) - new Date(a.DATE_FOR_SORTING||0));
    }

    // --- Data Init ---
    function initializePageWithData(appData) {
        if (!appData || !appData.ORDERS) { ui.statusMessage.textContent = 'Could not find invoice data.'; return; }
        try {
            allShipments = Object.values(appData.ORDERS);
            b2bDataMap.clear();
            if (appData.B2B) Object.values(appData.B2B).forEach(c => { if (c.CODE) b2bDataMap.set(c.CODE, c); });
            branchDataMap.clear();
            if (appData.BRANCHES) Object.values(appData.BRANCHES).forEach(b => { if (b.BRANCH_CODE) branchDataMap.set(b.BRANCH_CODE, b); });
            consolidatedInvoices = consolidateInvoiceData(allShipments);
            populateFilters(consolidatedInvoices);
            setupFilterListeners();
            applyFilters();
            ui.statusMessage.textContent = '';
        } catch(e) { ui.statusMessage.textContent = 'Failed to process data.'; console.error(e); }
    }

    window.addEventListener('appDataLoaded',    e => initializePageWithData(e.detail.data));
    window.addEventListener('appDataRefreshed', e => initializePageWithData(e.detail.data));

    // Load from IndexedDB
    const waitForDB = async () => {
        if (window.appDB && window.appDB.db) return;
        await new Promise(resolve => {
            const t = setTimeout(resolve, 5000);
            window.addEventListener('indexedDBReady', () => { clearTimeout(t); resolve(); }, { once: true });
        });
    };
    waitForDB().then(async () => {
        const data = await getAppData();
        if (data) initializePageWithData(data);
        else ui.statusMessage.textContent = 'Waiting for server data...';
    });

    // --- Filters ---
    function populateFilters(invoices) {
        ui.filterBranch.length = 1; ui.filterCode.length = 1; ui.filterCarrier.length = 1;
        [...new Set(invoices.map(i => i.BRANCH).filter(Boolean))].sort().forEach(v => ui.filterBranch.add(new Option(v,v)));
        [...new Set(invoices.map(i => i.CODE).filter(Boolean))].sort().forEach(v => ui.filterCode.add(new Option(v,v)));
        [...new Set(invoices.map(i => i.CARRIER).filter(Boolean))].sort().forEach(v => ui.filterCarrier.add(new Option(v,v)));
    }

    function setupFilterListeners() {
        ui.searchShipments.addEventListener('input', applyFilters);
        ui.filterToggleBtn.addEventListener('click', () => ui.filterModal.classList.remove('hidden'));
        ui.applyFiltersBtn.addEventListener('click', () => { isUnbilledMode = false; ui.unbilledToggleBtn.classList.remove('filter-active'); applyFilters(); ui.filterModal.classList.add('hidden'); });
        ui.resetFiltersBtn.addEventListener('click', () => { ui.filterStartDate.value=''; ui.filterEndDate.value=''; ui.filterBranch.value=''; ui.filterCode.value=''; ui.filterCarrier.value=''; applyFilters(); });
        ui.filterModal.addEventListener('click', e => { if (e.target === ui.filterModal) ui.filterModal.classList.add('hidden'); });
    }

    function applyFilters() {
        const sd = ui.filterStartDate.value, ed = ui.filterEndDate.value;
        const branch = ui.filterBranch.value, code = ui.filterCode.value, carrier = ui.filterCarrier.value;
        const q = ui.searchShipments.value.toLowerCase();

        const filtered = consolidatedInvoices.filter(inv => {
            if (isUnbilledMode ? inv.KEY_TYPE === 'INV' : inv.KEY_TYPE !== 'INV') return false;
            const dt = inv.DATE_FOR_SORTING ? new Date(inv.DATE_FOR_SORTING) : null;
            if (sd && dt && dt < new Date(sd + 'T00:00:00Z')) return false;
            if (ed && dt && dt > new Date(ed + 'T23:59:59Z')) return false;
            if (branch && inv.BRANCH !== branch) return false;
            if (code   && inv.CODE   !== code)   return false;
            if (carrier && inv.CARRIER !== carrier) return false;
            if (q && ![ inv.INV_NUMBER, inv.INVOICE_ID, inv.CODE, inv.BRANCH ].some(v => String(v||'').toLowerCase().includes(q))) return false;
            return true;
        });

        renderInvoiceList(filtered);
        ui.statusMessage.textContent = `${isUnbilledMode ? 'UnBilled' : 'Billed'}: ${filtered.length} of ${consolidatedInvoices.length}`;

        if (isMobileView()) {
            ui.shipmentListPane.classList.remove('hidden');
            ui.shipmentDetailPane.classList.add('hidden');
            if (currentSelectedRef && !filtered.find(i => i.CONSOLIDATION_KEY === currentSelectedRef)) { currentSelectedRef = null; showDetailView(false); }
        } else {
            if (currentSelectedRef) {
                const cur = filtered.find(i => i.CONSOLIDATION_KEY === currentSelectedRef);
                cur ? handleInvoiceSelection(currentSelectedRef, ui.shipmentList.querySelector(`li[data-ref="${currentSelectedRef}"]`)) : (currentSelectedRef = null, showDetailView(false));
            } else { showDetailView(false); }
        }
    }

    // --- Render List ---
    function renderInvoiceList(invoices) {
        ui.shipmentList.innerHTML = '';
        if (!invoices.length) { ui.shipmentList.innerHTML = '<li class="text-center text-gray-500 border-none cursor-default">No invoices match filters.</li>'; return; }
        invoices.forEach(inv => {
            const key    = inv.CONSOLIDATION_KEY;
            const total  = (inv.TOTAL || 0).toFixed(2);
            const dt     = inv.INVOICE_DATE ? fmtDate(inv.INVOICE_DATE, 'date') : 'N/A';
            let primary, secondary;
            if (inv.KEY_TYPE === 'INV') {
                primary   = `INV#: ${inv.INV_NUMBER}`;
                secondary = `ID: ${inv.INVOICE_ID||'N/A'} | ${inv.CODE||''} - ${inv.BRANCH||''}`;
            } else if (inv.KEY_TYPE === 'ID') {
                primary   = `[UnBilled] ID: ${inv.INVOICE_ID}`;
                secondary = `${inv.CODE||''} - ${inv.BRANCH||''}`;
            } else {
                const parts = key.split('-'); const ym = parts[parts.length-1];
                primary   = `[UnBilled] ${inv.CODE} (${ym.substring(4,6)}/${ym.substring(0,4)})`;
                secondary = `Branch: ${inv.BRANCH||'N/A'}`;
            }
            const li = document.createElement('li');
            li.innerHTML = `<strong>${primary}</strong><span class="client-info">${secondary}</span><div class="details-info"><span>Date: ${dt}</span><span class="status-badge bg-indigo-100 text-indigo-700">₹${total}</span></div>`;
            li.dataset.ref = key;
            li.addEventListener('click', () => handleInvoiceSelection(key, li));
            if (String(key) === String(currentSelectedRef)) li.classList.add('selected');
            ui.shipmentList.appendChild(li);
        });
    }

    // --- Render Details ---
    function renderInvoiceDetailsCard(inv) {
        const b2b    = b2bDataMap.get(inv.CODE);
        const branch = branchDataMap.get(b2b?.BRANCH || inv.BRANCH);

        const billFrom = `<div class="space-y-1 text-sm">
            <div class="font-bold text-base text-gray-800">${branch?.BRANCH_NAME || inv.BRANCH || 'N/A'}</div>
            <div class="text-gray-700">${branch?.BRANCH_ADDRESS||''}, ${branch?.BRANCH_CITY||''}, ${branch?.BRANCH_STATE||''} - ${branch?.BRANCH_PINCODE||''}</div>
            <div class="text-gray-600">${branch?.BRANCH_MOBILE||''}</div>
            <div class="text-gray-600">${branch?.BRANCH_EMAIL||''}</div>
            <div class="text-xs text-gray-500 pt-1">GSTIN: ${branch?.BRANCH_GSTIN||'N/A'}</div>
        </div>`;

        const billTo = `<div class="space-y-1 text-sm">
            <div class="font-bold text-lg text-indigo-700">${b2b?.B2B_NAME || inv.CODE}</div>
            <div class="text-gray-600">${b2b?.MOBILE_NUMBER || ''}</div>
            <div class="text-gray-700">${b2b?.B2B_ADDRESS||''}, ${b2b?.B2B_CITY||''}, ${b2b?.B2B_STATE||''} - ${b2b?.B2B_PINCODE||''}</div>
            <div class="text-xs text-gray-500 pt-1">GST: ${b2b?.ID_GST_PAN_ADHAR||'N/A'}</div>
        </div>`;

        const right = `<div class="space-y-2 text-sm p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div class="flex justify-between"><span class="text-gray-500">Invoice No:</span><span class="font-semibold">${inv.INV_NUMBER||'N/A'}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Invoice Date:</span><span class="font-semibold">${inv.INVOICE_DATE ? fmtDate(inv.INVOICE_DATE) : 'N/A'}</span></div>
            <hr><div class="flex justify-between"><span class="text-gray-500">Start:</span><span>${inv.START_DATE ? fmtDate(inv.START_DATE) : 'N/A'}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">End:</span><span>${inv.END_DATE ? fmtDate(inv.END_DATE) : 'N/A'}</span></div>
        </div>`;

        ui.invoiceDetailsCardContainer.innerHTML = `
            <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Invoice Details</h3></div>
            <div class="detail-card-body">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div><div class="text-xs font-semibold text-gray-400 uppercase mb-1">Bill From</div>${billFrom}</div>
                    <div><div class="text-xs font-semibold text-gray-400 uppercase mb-1">Bill To</div>${billTo}</div>
                    <div>${right}</div>
                </div>
            </div>`;
    }

    function renderShipmentDetailsTable(shipments, key) {
        const n = shipments.length;
        let rows = '';
        shipments.forEach(s => {
            rows += `<tr>
                <td class="px-3 py-2 whitespace-nowrap">${fmtDate(s.ORDER_DATE)}</td>
                <td class="px-3 py-2">${s.AWB_NUMBER||'N/A'} / ${s.CARRIER||'N/A'}</td>
                <td class="px-3 py-2">${s.ORIGIN_CITY||'N/A'}</td>
                <td class="px-3 py-2">${s.MODE||'N/A'} / ${s.PIECS||0}</td>
                <td class="px-3 py-2">${s.DEST_CITY||'N/A'} (${s.DEST_PINCODE||''})</td>
                <td class="px-3 py-2 text-right">${parseFloat(s.CHG_WT||0).toFixed(2)}</td>
                <td class="px-3 py-2 text-right">${parseFloat(s.FRIGHT||0).toFixed(2)}</td>
            </tr>`;
        });
        const table = `<div class="overflow-x-auto border rounded-md hidden md:block"><table class="min-w-full text-xs divide-y divide-gray-200">
            <thead class="bg-gray-50"><tr>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Date</th>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">AWB / Carrier</th>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Origin</th>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Mode / Pcs</th>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Destination</th>
                <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Chg Wt</th>
                <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Freight ₹</th>
            </tr></thead><tbody class="bg-white divide-y divide-gray-200">${rows}</tbody></table></div>`;

        ui.shipmentDetailsTableContainer.innerHTML = `
            <div class="detail-card-header flex justify-between items-center">
                <h3 class="font-semibold text-gray-700">Shipments (${n})</h3>
                <button id="printInvoiceBtn" data-key="${key}" class="px-3 py-1 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                    Print Invoice
                </button>
            </div>
            <div class="detail-card-body">${table}</div>`;
    }

    function renderSummaryTable(shipments) {
        let fright=0, other=0, gst=0, total=0;
        shipments.forEach(s => {
            fright += parseFloat(s.FRIGHT||0);
            other  += parseFloat(s.FUEL_CHG||0)+parseFloat(s.COD_CHG||0)+parseFloat(s.TOPAY_CHG||0)+
                      parseFloat(s.FOV_CHG||0)+parseFloat(s.EWAY_CHG||0)+parseFloat(s.AWB_CHG||0)+
                      parseFloat(s.PACK_CHG||0)+parseFloat(s.DEV_CHG||0);
            gst    += parseFloat(s.SGST||0)+parseFloat(s.CGST||0)+parseFloat(s.IGST||0);
            total  += parseFloat(s.TOTAL||0);
        });
        const rows = [
            ['Freight', fright, false],
            ['Other Charges', other, false],
            ['GST', gst, false],
            ['GRAND TOTAL', total, true],
        ].map(([label, val, bold]) => `<tr class="${bold?'bg-indigo-50 font-bold':''}">
            <td class="px-4 py-2">${label}</td>
            <td class="px-4 py-2 text-right ${bold?'text-indigo-700':''}">₹${val.toFixed(2)}</td>
        </tr>`).join('');
        ui.summaryTableContainer.innerHTML = `
            <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Charges Summary</h3></div>
            <div class="detail-card-body"><div class="overflow-x-auto"><table class="min-w-full text-sm divide-y divide-gray-200">
                <thead class="bg-gray-50"><tr>
                    <th class="px-4 py-2 text-left font-medium text-gray-500 uppercase">Charge</th>
                    <th class="px-4 py-2 text-right font-medium text-gray-500 uppercase">Amount (₹)</th>
                </tr></thead><tbody class="bg-white divide-y divide-gray-200">${rows}</tbody>
            </table></div></div>`;
    }

    // --- Selection ---
    function handleInvoiceSelection(key, selectedLi) {
        currentSelectedRef = key;
        ui.shipmentList.querySelectorAll('li.selected').forEach(li => li.classList.remove('selected'));
        if (selectedLi) selectedLi.classList.add('selected');

        const inv       = consolidatedInvoices.find(i => i.CONSOLIDATION_KEY === key);
        const shipments = getShipmentsForInvoice(key);

        renderInvoiceDetailsCard(inv);
        renderShipmentDetailsTable(shipments, key);
        renderSummaryTable(shipments);

        const printBtn = document.getElementById('printInvoiceBtn');
        if (printBtn) {
            printBtn.onclick = () => {
                const b2b    = b2bDataMap.get(inv.CODE);
                const branch = branchDataMap.get(b2b?.BRANCH || inv.BRANCH);
                generateInvoicePrint(inv, shipments, b2b, branch);
            };
        }
        showDetailView(true);
    }
});
