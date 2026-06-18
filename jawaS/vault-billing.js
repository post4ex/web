// vault-billing.js — Billing module for The Vault. No dependency on billing.js.

const VaultBilling = (() => {

    let _all          = [];   // all shipments
    let _b2bMap       = new Map();
    let _branchMap    = new Map();
    let _consolidated = [];
    let _currentKey   = null;
    let _isUnbilled   = false;

    const _fmt = v => (typeof fmtDate === 'function') ? fmtDate(v) : new Date(v).toLocaleDateString();
    const _fmtD = v => (typeof fmtDate === 'function') ? fmtDate(v, 'date') : new Date(v).toLocaleDateString();

    // ── Print ─────────────────────────────────────────────────────────────────
    function _print(inv, shipments, b2b, branch) {
        const clientName = b2b?.B2B_NAME || inv.CODE;
        const invNum     = inv.INV_NUMBER || 'N/A';
        const invDate    = inv.INVOICE_DATE ? _fmt(inv.INVOICE_DATE) : 'N/A';
        const branchName = branch?.BRANCH_NAME || inv.BRANCH || 'N/A';
        const branchCity = branch?.BRANCH_CITY || 'local';
        const branchUpi  = branch?.BRANCH_UPI  || '';
        const branchUpiName = branch?.BRANCH_UPI_NAME || branchName;

        let tFright=0,tFuel=0,tCod=0,tTopay=0,tFov=0,tEway=0,tAwb=0,tPack=0,tDev=0,
            tSgst=0,tCgst=0,tIgst=0,tTaxable=0,tTotal=0,tPiecs=0,tChgWt=0;
        shipments.forEach(s => {
            tFright+=+s.FRIGHT||0; tFuel+=+s.FUEL_CHG||0; tCod+=+s.COD_CHG||0;
            tTopay+=+s.TOPAY_CHG||0; tFov+=+s.FOV_CHG||0; tEway+=+s.EWAY_CHG||0;
            tAwb+=+s.AWB_CHG||0; tPack+=+s.PACK_CHG||0; tDev+=+s.DEV_CHG||0;
            tSgst+=+s.SGST||0; tCgst+=+s.CGST||0; tIgst+=+s.IGST||0;
            tTaxable+=+s.TAXABLE||0; tTotal+=+s.TOTAL||0;
            tPiecs+=parseInt(s.PIECS||0); tChgWt+=+s.CHG_WT||0;
        });

        function numToWords(n) {
            const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
            const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
            n=Math.round(n); if(!n) return '';
            if(n<20) return a[n]; if(n<100) return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');
            if(n<1000) return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+numToWords(n%100):'');
            if(n<100000) return numToWords(Math.floor(n/1000))+' Thousand'+(n%1000?' '+numToWords(n%1000):'');
            if(n<10000000) return numToWords(Math.floor(n/100000))+' Lakh'+(n%100000?' '+numToWords(n%100000):'');
            return numToWords(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+numToWords(n%10000000):'');
        }

        const rows = shipments.map((s,i) => `<tr>
            <td class="tc">${i+1}</td><td>${_fmt(s.ORDER_DATE)}</td>
            <td>${s.AWB_NUMBER||'N/A'}: ${s.CARRIER||'N/A'}</td>
            <td class="tc">${s.MODE||'N/A'}</td><td class="tc">${String(s.PIECS||1).padStart(2,'0')}</td>
            <td>${s.DEST_PINCODE||''}: ${s.DEST_CITY||'N/A'}</td>
            <td class="tr">${(+s.CHG_WT||0).toFixed(2)}</td>                            <td class="tr">&#8377;${(+s.FRIGHT||0).toFixed(2)}</td></tr>`).join('');

        // Use pre-calculated totals from consolidated invoice object (authoritative)
        const chargeRows = [
            ['Fright',tFright,true],['Fuel Charge',tFuel,false],['COD Charge',tCod,false],
            ['Topay Charge',tTopay,false],['Insurance',tFov,false],['Eway Handle',tEway,false],
            ['AWB Charges',tAwb,false],['Packaging',tPack,false],['Development',tDev,false],
            ['Taxable Amount',tTaxable,true],['SGST',tSgst,false],['CGST',tCgst,false],['IGST',tIgst,false],
        ].filter(([,v,a])=>a||v>0).map(([l,v])=>`<tr><td>${l}</td><td class="tr">${v.toFixed(2)}</td></tr>`).join('');

        // Use consolidated grand total from the invoice totals (not re-summed)
        const grandTotal = inv.TOTAL || tTotal;

        const qrUrl = branchUpi ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=upi://pay?pa=${encodeURIComponent(branchUpi)}%26pn=${encodeURIComponent(branchUpiName)}%26am=${grandTotal.toFixed(2)}%26cu=INR%26tn=${encodeURIComponent('INV-'+invNum)}` : '';

        const css = `body{font-family:Arial,sans-serif;font-size:13px;color:#000;margin:0;padding:20px;background:#f5f5f5}
        .box{max-width:800px;margin:auto;background:#fff;padding:30px;border:1px solid #eee;box-shadow:0 0 10px rgba(0,0,0,.15)}
        .hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:15px;margin-bottom:20px}
        .logo{width:240px;height:120px;object-fit:contain}.tr{text-align:right}.tc{text-align:center}
        .info{display:flex;justify-content:space-between;margin-bottom:20px;gap:20px}
        .col{width:48%}.col h3{margin:0 0 5px;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px}.col p{margin:2px 0}
        .div{width:1px;background:#ccc}.divb{height:2px;background:#000;margin-bottom:20px}
        .meta{margin-bottom:20px;font-weight:bold;text-align:center}
        table{width:100%;border-collapse:collapse;margin-bottom:20px}table,th,td{border:1px solid #000}th,td{padding:6px;text-align:left}th{background:#f2f2f2}
        .tot{display:flex;justify-content:space-between;margin-bottom:20px;page-break-inside:avoid}
        .pay{width:55%}.chg{width:40%}.chg table{margin-bottom:0}.chg th,.chg td{padding:4px 6px}
        .terms{font-size:11px;margin-bottom:40px}.terms ol{margin:5px 0 0;padding-left:20px}
        .sig{text-align:right;font-weight:bold}.sigbox{display:inline-block;text-align:center;min-width:200px}
        @media print{@page{size:A4;margin:10mm}body{background:#fff;padding:0}.box{box-shadow:none;border:none}}`;

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tax Invoice ${invNum}</title><style>${css}</style></head><body>
        <div class="box">
            <div class="hdr"><img src="assets/images/genie-logo.svg" class="logo"><div style="text-align:right"><h1 style="margin:0;font-size:28px;text-transform:uppercase">Tax Invoice</h1><p><b>Invoice Date:</b> ${invDate}</p><p><b>Invoice No:</b> ${invNum}</p></div></div>
            <div class="info">
                <div class="col"><h3>Billed By: ${branchName}</h3><p><b>Address:</b> ${branch?.BRANCH_ADDRESS||''}</p><p><b>City:</b> ${branchCity}, ${branch?.BRANCH_STATE||''}</p><p><b>Phone:</b> ${branch?.BRANCH_MOBILE||''}</p><p><b>Email:</b> ${branch?.BRANCH_EMAIL||''}</p><p><b>PAN/GST:</b> ${branch?.BRANCH_PAN||''} / ${branch?.BRANCH_GSTIN||''}</p></div>
                <div class="div"></div>
                <div class="col"><h3>Bill To: ${clientName}</h3><p><b>Address:</b> ${b2b?.B2B_ADDRESS||''}</p><p><b>City:</b> ${b2b?.B2B_CITY||''}, ${b2b?.B2B_STATE||''}</p><p><b>Mobile:</b> ${b2b?.MOBILE_NUMBER||''}</p><p><b>GST:</b> ${b2b?.ID_GST_PAN_ADHAR||'N/A'}</p></div>
            </div>
            <div class="divb"></div><div class="meta"><p>Bill For SAC Code 996812 Courier Services</p></div>
            <table><thead><tr><th class="tc">Sr</th><th>Date</th><th>AWB: Carrier</th><th class="tc">Mode</th><th class="tc">Pcs</th><th>Destination</th><th class="tr">Chg.Wt</th><th class="tr">Fright</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr style="font-weight:bold"><td colspan="4" class="tr">Totals</td><td class="tc">${tPiecs}</td><td></td><td class="tr">${tChgWt.toFixed(2)}</td><td class="tr">${tFright.toFixed(2)}</td></tr></tfoot></table>
            <div class="tot">
                <div class="pay">${branchUpi?`<p><b>Pay via UPI:</b></p><img src="${qrUrl}" style="width:120px;height:120px;margin:10px 0;border:1px solid #ddd"><p>Name: ${branchUpiName}<br>UPI ID: ${branchUpi}<br><b>Note:</b> INV-${invNum}</p>`:''}<p><b>Amount in words:</b><br>Rupees ${numToWords(Math.round(grandTotal))} Only</p></div>
                <div class="chg"><table><thead><tr><th>Charge</th><th class="tr">Amount</th></tr></thead><tbody>${chargeRows}<tr style="font-weight:bold"><td>Total Amount</td><td class="tr">${grandTotal.toFixed(2)}</td></tr></tbody></table></div>
            </div>
            <div class="terms"><b>Terms &amp; Conditions:</b><ol><li>All disputes subject to ${branchCity} Jurisdiction.</li><li>Payment due on receipt.</li><li>Computer-generated bill; no signature required.</li><li>Dev. charges of 5% waived if paid within 10 days.</li><li>SAC Code 996812 (Courier Services).</li></ol></div>
            <div class="sig"><div class="sigbox"><p style="margin-bottom:40px">Authorized Signatory</p><p>for ${branchName}</p></div></div>
        </div><script>window.onload=()=>window.print();<\/script></body></html>`;

        const w = window.open('', `Invoice-${invNum}`);
        w.document.write(html); w.document.close();
    }

    // ── Data helpers ──────────────────────────────────────────────────────────
    function _key(order) {
        if (order.INV_NUMBER) return { key: 'INV-'  + order.INV_NUMBER, type: 'INV'   };
        if (order.INVOICE_ID) return { key: 'ID-'   + order.INVOICE_ID, type: 'ID'    };
        if (order.ORDER_DATE && order.CODE) {
            const d = new Date(order.ORDER_DATE);
            if (isNaN(d)) return null;
            const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}`;
            return { key: `MONTH-${order.CODE}-${ym}`, type: 'MONTH' };
        }
        return null;
    }

    function _consolidate(orders) {
        const map = new Map();
        orders.forEach(order => {
            const ki = _key(order); if (!ki) return;
            const { key, type } = ki;
            const oDate = order.ORDER_DATE || null, iDate = order.INVOICE_DATE || null;
            const sortDt = iDate || oDate; if (!sortDt) return;
            const total = parseFloat(order.TOTAL) || 0;
            if (map.has(key)) {
                const inv = map.get(key);
                inv.TOTAL += total;
                if (iDate && (!inv.INVOICE_DATE || new Date(iDate) < new Date(inv.INVOICE_DATE))) inv.INVOICE_DATE = iDate;
                if (oDate && (!inv.START_DATE   || new Date(oDate) < new Date(inv.START_DATE)))   inv.START_DATE   = oDate;
                if (oDate && (!inv.END_DATE     || new Date(oDate) > new Date(inv.END_DATE)))     inv.END_DATE     = oDate;
                if (new Date(sortDt) > new Date(inv.DATE_FOR_SORTING)) inv.DATE_FOR_SORTING = sortDt;
            } else {
                map.set(key, { CONSOLIDATION_KEY: key, KEY_TYPE: type,
                    INV_NUMBER: order.INV_NUMBER||null, INVOICE_ID: order.INVOICE_ID||null,
                    CODE: order.CODE, BRANCH: order.BRANCH, CARRIER: order.CARRIER,
                    INVOICE_DATE: iDate, DATE_FOR_SORTING: sortDt,
                    START_DATE: oDate, END_DATE: oDate, TOTAL: total });
            }
        });
        return Array.from(map.values()).sort((a,b) => new Date(b.DATE_FOR_SORTING||0) - new Date(a.DATE_FOR_SORTING||0));
    }

    function _initData(appData) {
        if (!appData?.ORDERS) return;
        _all = Object.values(appData.ORDERS);
        _b2bMap.clear();
        if (appData.B2B)      Object.values(appData.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
        _branchMap.clear();
        if (appData.BRANCHES) Object.values(appData.BRANCHES).forEach(b => b.BRANCH_CODE && _branchMap.set(b.BRANCH_CODE, b));
        _consolidated = _consolidate(_all);
        _populateFilters();
        _applyFilters();
        document.getElementById('vbStatus').textContent = '';
    }

    // ── Render list (exact billing.js style) ─────────────────────────────────
    function _renderList(invoices) {
        const ul  = document.getElementById('vaultList');
        const msg = document.getElementById('vbStatus');
        ul.innerHTML = '';
        if (msg) msg.textContent = `${_isUnbilled ? 'UnBilled' : 'Billed'}: ${invoices.length} of ${_consolidated.length}`;
        if (!invoices.length) {
            ul.innerHTML = '<li class="text-center text-gray-500 border-none cursor-default" style="padding:.75rem">No invoices match filters.</li>';
            return;
        }
        invoices.forEach(inv => {
            const key = inv.CONSOLIDATION_KEY;
            const dt  = inv.INVOICE_DATE ? _fmtD(inv.INVOICE_DATE) : 'N/A';
            let primary, secondary;
            if (inv.KEY_TYPE === 'INV') {
                primary   = `INV#: ${inv.INV_NUMBER}`;
                secondary = `ID: ${inv.INVOICE_ID||'N/A'} | ${inv.CODE||''} - ${inv.BRANCH||''}`;
            } else if (inv.KEY_TYPE === 'ID') {
                primary   = `[UnBilled] ID: ${inv.INVOICE_ID}`;
                secondary = `${inv.CODE||''} - ${inv.BRANCH||''}`;
            } else {
                const parts = key.split('-'), ym = parts[parts.length-1];
                primary   = `[UnBilled] ${inv.CODE} (${ym.substring(4,6)}/${ym.substring(0,4)})`;
                secondary = `Branch: ${inv.BRANCH||'N/A'}`;
            }
            const li = document.createElement('li');
            li.innerHTML = `
                <strong>${primary}</strong>
                <span class="sv-item-sub">${secondary}</span>
                <div class="sv-item-meta">
                    <span>Date: ${dt}</span>
                    <span class="sv-status-badge bg-indigo-100 text-indigo-700">₹${(inv.TOTAL||0).toFixed(2)}</span>
                </div>`;
            li.dataset.ref = key;
            if (key === _currentKey) li.classList.add('selected');
            li.addEventListener('click', () => _select(key, li));
            ul.appendChild(li);
        });
    }

    // ── Render detail (exact 3-card structure from Billing.html) ─────────────
    function _renderDetail(key) {
        const inv       = _consolidated.find(i => i.CONSOLIDATION_KEY === key);
        const shipments = _all.filter(s => { const k = _key(s); return k && k.key === key; });
        const b2b       = _b2bMap.get(inv.CODE);
        const branch    = _branchMap.get(b2b?.BRANCH || inv.BRANCH);

        // Card 1 — Invoice Details
        document.getElementById('vbInvoiceCard').innerHTML = `
            <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Invoice Details</h3></div>
            <div class="detail-card-body">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <div class="text-xs font-semibold text-gray-400 uppercase mb-1">Bill From</div>
                        <div class="font-bold text-base text-gray-800">${branch?.BRANCH_NAME||inv.BRANCH||'N/A'}</div>
                        <div class="text-sm text-gray-700">${branch?.BRANCH_ADDRESS||''}, ${branch?.BRANCH_CITY||''}, ${branch?.BRANCH_STATE||''} - ${branch?.BRANCH_PINCODE||''}</div>
                        <div class="text-sm text-gray-600">${branch?.BRANCH_MOBILE||''}</div>
                        <div class="text-sm text-gray-600">${branch?.BRANCH_EMAIL||''}</div>
                        <div class="text-xs text-gray-500 pt-1">GSTIN: ${branch?.BRANCH_GSTIN||'N/A'}</div>
                    </div>
                    <div>
                        <div class="text-xs font-semibold text-gray-400 uppercase mb-1">Bill To</div>
                        <div class="font-bold text-lg text-indigo-700">${b2b?.B2B_NAME||inv.CODE}</div>
                        <div class="text-sm text-gray-600">${b2b?.MOBILE_NUMBER||''}</div>
                        <div class="text-sm text-gray-700">${b2b?.B2B_ADDRESS||''}, ${b2b?.B2B_CITY||''}, ${b2b?.B2B_STATE||''} - ${b2b?.B2B_PINCODE||''}</div>
                        <div class="text-xs text-gray-500 pt-1">GST: ${b2b?.ID_GST_PAN_ADHAR||'N/A'}</div>
                    </div>
                    <div class="space-y-2 text-sm p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div class="flex justify-between"><span class="text-gray-500">Invoice No:</span><span class="font-semibold">${inv.INV_NUMBER||'N/A'}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">Invoice Date:</span><span class="font-semibold">${inv.INVOICE_DATE ? _fmt(inv.INVOICE_DATE) : 'N/A'}</span></div>
                        <hr>
                        <div class="flex justify-between"><span class="text-gray-500">Start:</span><span>${inv.START_DATE ? _fmt(inv.START_DATE) : 'N/A'}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">End:</span><span>${inv.END_DATE ? _fmt(inv.END_DATE) : 'N/A'}</span></div>
                    </div>
                </div>
            </div>`;

        // Card 2 — Shipments table
        const tableRows = shipments.map(s => `<tr>
            <td class="px-3 py-2 whitespace-nowrap">${_fmt(s.ORDER_DATE)}</td>
            <td class="px-3 py-2">${s.AWB_NUMBER||'N/A'} / ${s.CARRIER||'N/A'}</td>
            <td class="px-3 py-2">${s.ORIGIN_CITY||'N/A'}</td>
            <td class="px-3 py-2">${s.MODE||'N/A'} / ${s.PIECS||0}</td>
            <td class="px-3 py-2">${s.DEST_CITY||'N/A'} (${s.DEST_PINCODE||''})</td>
            <td class="px-3 py-2 text-right">${(+s.CHG_WT||0).toFixed(2)}</td>
            <td class="px-3 py-2 text-right">${(+s.FRIGHT||0).toFixed(2)}</td>
            <td class="px-3 py-2">${_isUnbilled ? `<button onclick="sessionStorage.setItem('editOrderRef','${s.REFERENCE}');window.open('EditOrder.html','_blank')" class="p-1 text-gray-500 rounded hover:bg-gray-100" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>` : ''}</td></tr>`).join('');

        const mobileCards = shipments.map((s,i) => `
            <div class="border border-gray-200 rounded-lg p-3 text-xs space-y-1">
                <div class="flex justify-between font-semibold text-gray-700">
                    <span>${i+1}. ${s.AWB_NUMBER||'N/A'}</span>
                    <div class="flex items-center gap-2">
                        ${_isUnbilled ? `<button onclick="sessionStorage.setItem('editOrderRef','${s.REFERENCE}');window.open('EditOrder.html','_blank')" class="p-1 text-gray-500 rounded hover:bg-gray-100" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>` : ''}
                        <span class="text-indigo-700">&#8377;${(+s.FRIGHT||0).toFixed(2)}</span>
                    </div>
                </div>
                <div class="text-gray-500">${_fmt(s.ORDER_DATE)} &middot; ${s.CARRIER||'N/A'} &middot; ${s.MODE||'N/A'} &middot; ${s.PIECS||0} pcs</div>
                <div class="text-gray-600">${s.ORIGIN_CITY||'N/A'} &rarr; ${s.DEST_CITY||'N/A'} (${s.DEST_PINCODE||''})</div>
                <div class="text-gray-500">Chg Wt: ${(+s.CHG_WT||0).toFixed(2)}</div>
            </div>`).join('');

        document.getElementById('vbShipmentsCard').innerHTML = `
            <div class="detail-card-header flex justify-between items-center">
                <h3 class="font-semibold text-gray-700">Shipments (${shipments.length})</h3>
                <div class="flex items-center gap-2">
                    ${inv.KEY_TYPE !== 'INV' ? `<button id="vbCloseInvBtn" class="px-3 py-1 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Issue Invoice
                    </button>` : ''}
                    <button id="vbPrintBtn" class="px-3 py-1 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                        Print Invoice
                    </button>
                </div>
            </div>
            <div class="detail-card-body overflow-x-auto hidden md:block">
                <table class="min-w-full text-xs divide-y divide-gray-200">
                    <thead class="bg-gray-50"><tr>
                        <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Date</th>
                        <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">AWB / Carrier</th>
                        <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Origin</th>
                        <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Mode / Pcs</th>
                        <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Destination</th>
                        <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Chg Wt</th>
                        <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Freight ₹</th>
                        <th class="px-3 py-2"></th>
                    </tr></thead>
                    <tbody class="bg-white divide-y divide-gray-200">${tableRows}</tbody>
                </table>
            </div>
            <div class="detail-card-body md:hidden space-y-2">${mobileCards}</div>`;

        document.getElementById('vbPrintBtn').onclick = () => _print(inv, shipments, b2b, branch);
        document.getElementById('vbCloseInvBtn')?.addEventListener('click', () => _showCloseInvModal(inv, shipments));

        // Card 3 — Summary
        let fright=0, other=0, gst=0, total=0;
        shipments.forEach(s => {
            fright += +s.FRIGHT||0;
            other  += (+s.FUEL_CHG||0)+(+s.COD_CHG||0)+(+s.TOPAY_CHG||0)+(+s.FOV_CHG||0)+(+s.EWAY_CHG||0)+(+s.AWB_CHG||0)+(+s.PACK_CHG||0)+(+s.DEV_CHG||0);
            gst    += (+s.SGST||0)+(+s.CGST||0)+(+s.IGST||0);
            total  += +s.TOTAL||0;
        });
        const sumRows = [['Freight',fright,false],['Other Charges',other,false],['GST',gst,false],['GRAND TOTAL',total,true]]
            .map(([l,v,bold]) => `<tr class="${bold?'bg-indigo-50 font-bold':''}"><td class="px-4 py-2">${l}</td><td class="px-4 py-2 text-right ${bold?'text-indigo-700':''}">${v.toFixed(2)}</td></tr>`).join('');

        document.getElementById('vbSummaryCard').innerHTML = `
            <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Charges Summary</h3></div>
            <div class="detail-card-body">
                <table class="min-w-full text-sm divide-y divide-gray-200">
                    <thead class="bg-gray-50"><tr>
                        <th class="px-4 py-2 text-left font-medium text-gray-500 uppercase">Charge</th>
                        <th class="px-4 py-2 text-right font-medium text-gray-500 uppercase">Amount (₹)</th>
                    </tr></thead>
                    <tbody class="bg-white divide-y divide-gray-200">${sumRows}</tbody>
                </table>
            </div>`;
    }

    function _select(key, li) {
        _currentKey = key;
        document.querySelectorAll('#vaultList li.selected').forEach(el => el.classList.remove('selected'));
        if (li) li.classList.add('selected');
        // show detail containers
        document.getElementById('vbDetailView').classList.remove('hidden');
        document.getElementById('vbEmptyView').classList.add('hidden');
        _renderDetail(key);
        VaultPage.showDetailPane();
    }

    // ── Filters ───────────────────────────────────────────────────────────────
    function _populateFilters() {
        const branch = document.getElementById('vbFilterBranch');
        const code   = document.getElementById('vbFilterCode');
        const carrier= document.getElementById('vbFilterCarrier');
        if (!branch) return;
        branch.length = code.length = carrier.length = 1;
        [...new Set(_consolidated.map(i=>i.BRANCH).filter(Boolean))].sort().forEach(v=>branch.add(new Option(v,v)));
        [...new Set(_consolidated.map(i=>i.CODE).filter(Boolean))].sort().forEach(v=>code.add(new Option(v,v)));
        [...new Set(_consolidated.map(i=>i.CARRIER).filter(Boolean))].sort().forEach(v=>carrier.add(new Option(v,v)));
    }

    function _applyFilters() {
        const q      = (document.getElementById('vaultSearch')?.value||'').toLowerCase();
        const sd     = document.getElementById('vbFilterStart')?.value;
        const ed     = document.getElementById('vbFilterEnd')?.value;
        const branch = document.getElementById('vbFilterBranch')?.value;
        const code   = document.getElementById('vbFilterCode')?.value;
        const carrier= document.getElementById('vbFilterCarrier')?.value;

        const filtered = _consolidated.filter(inv => {
            if (_isUnbilled ? inv.KEY_TYPE === 'INV' : inv.KEY_TYPE !== 'INV') return false;
            const dt = inv.DATE_FOR_SORTING ? new Date(inv.DATE_FOR_SORTING) : null;
            if (sd && dt && dt < new Date(sd+'T00:00:00Z')) return false;
            if (ed && dt && dt > new Date(ed+'T23:59:59Z')) return false;
            if (branch  && inv.BRANCH  !== branch)  return false;
            if (code    && inv.CODE    !== code)     return false;
            if (carrier && inv.CARRIER !== carrier)  return false;
            if (q && ![ inv.INV_NUMBER, inv.INVOICE_ID, inv.CODE, inv.BRANCH ]
                .some(v => String(v||'').toLowerCase().includes(q))) return false;
            return true;
        });
        _renderList(filtered);
    }

    // ── Inject billing UI into vault panes ────────────────────────────────────
    function _injectUI() {
        // Inject list header controls above #vaultList
        const listPane = document.getElementById('vaultListPane');
        const header   = listPane?.querySelector('.sv-pane-header');
        if (header && !document.getElementById('vbUnbilledBtn')) {
            // Add UnBilled toggle next to title
            const titleRow = header.querySelector('.flex.items-center.gap-2');
            const unbilledBtn = document.createElement('button');
            unbilledBtn.id = 'vbUnbilledBtn';
            unbilledBtn.className = 'px-3 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded-md hover:bg-red-200 transition-colors';
            unbilledBtn.textContent = 'UnBilled';
            unbilledBtn.onclick = () => {
                _isUnbilled = !_isUnbilled;
                unbilledBtn.classList.toggle('filter-active', _isUnbilled);
                _currentKey = null;
                document.getElementById('vbDetailView')?.classList.add('hidden');
                document.getElementById('vbEmptyView')?.classList.remove('hidden');
                _applyFilters();
            };
            titleRow?.appendChild(unbilledBtn);

            // Add filter icon button next to search
            const searchRow = header.querySelector('.flex.gap-2') || header;
            const filterBtn = document.createElement('button');
            filterBtn.id = 'vbFilterBtn';
            filterBtn.className = 'p-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex-shrink-0';
            filterBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>`;
            filterBtn.onclick = () => document.getElementById('vbFilterModal')?.classList.remove('hidden');
            searchRow?.appendChild(filterBtn);
        }

        // Inject status message above list
        if (!document.getElementById('vbStatus')) {
            const statusEl = document.createElement('p');
            statusEl.id = 'vbStatus';
            statusEl.className = 'text-gray-600 px-4 pt-3 text-center text-sm';
            statusEl.textContent = 'Loading invoice data...';
            const listContainer = document.getElementById('vaultList')?.parentElement;
            listContainer?.insertBefore(statusEl, document.getElementById('vaultList'));
        }

        // Inject detail content into vaultDetailView
        const dv = document.getElementById('vaultDetailView');
        if (dv) {
            if (!document.getElementById('vbDetailView')) {
                dv.innerHTML = `
                    <div id="vbEmptyView" class="h-full flex items-center justify-center">
                        <p class="text-gray-500 text-lg">Select an invoice from the list to view included shipments.</p>
                    </div>
                    <div id="vbDetailView" class="hidden space-y-6">
                        <div id="vbInvoiceCard"   class="detail-card"></div>
                        <div id="vbShipmentsCard" class="detail-card"></div>
                        <div id="vbSummaryCard"   class="detail-card"></div>
                    </div>`;
            }
            VaultPage.showDetail(true);
        }

        // Inject filter modal into body (once)
        if (!document.getElementById('vbFilterModal')) {
            const modal = document.createElement('div');
            modal.id = 'vbFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4">
                    <div class="flex justify-between items-center">
                        <h2 class="text-xl font-semibold text-gray-800">Filter Invoices</h2>
                        <button onclick="document.getElementById('vbFilterModal').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label class="block text-sm font-medium text-gray-700">Start Date</label><input type="date" id="vbFilterStart" class="form-input mt-1 text-sm"></div>
                        <div><label class="block text-sm font-medium text-gray-700">End Date</label><input type="date" id="vbFilterEnd" class="form-input mt-1 text-sm"></div>
                        <div><label class="block text-sm font-medium text-gray-700">Branch</label><select id="vbFilterBranch" class="form-input mt-1 text-sm"><option value="">All</option></select></div>
                        <div><label class="block text-sm font-medium text-gray-700">Code</label><select id="vbFilterCode" class="form-input mt-1 text-sm"><option value="">All</option></select></div>
                        <div class="sm:col-span-2"><label class="block text-sm font-medium text-gray-700">Carrier</label><select id="vbFilterCarrier" class="form-input mt-1 text-sm"><option value="">All</option></select></div>
                    </div>
                    <div class="flex justify-end gap-4 pt-4 border-t">
                        <button id="vbResetBtn"  class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium">Reset</button>
                        <button id="vbApplyBtn"  class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium">Apply Filters</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
            document.getElementById('vbApplyBtn').onclick  = () => { _isUnbilled = false; document.getElementById('vbUnbilledBtn')?.classList.remove('filter-active'); _applyFilters(); modal.classList.add('hidden'); };
            document.getElementById('vbResetBtn').onclick  = () => { ['vbFilterStart','vbFilterEnd','vbFilterBranch','vbFilterCode','vbFilterCarrier'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); _applyFilters(); };
        }
    }

    // ── NEW: Invoice Generation Form ───────────────────────────────────────────
    function _showCloseInvModal(inv, shipments) {
        const b2b = _b2bMap.get(inv.CODE);
        const branch = _branchMap.get(b2b?.BRANCH || inv.BRANCH);

        // ── Compute all charges from shipments ────────────────────────────────
        let tFright=0,tFuel=0,tCod=0,tTopay=0,tFov=0,tEway=0,tAwb=0,tPack=0,tDev=0,
            tSgst=0,tCgst=0,tIgst=0,tTaxable=0,tTotal=0,tPiecs=0,tChgWt=0;
        let minDate = Infinity, maxDate = 0;
        shipments.forEach(s => {
            tFright+=+s.FRIGHT||0; tFuel+=+s.FUEL_CHG||0; tCod+=+s.COD_CHG||0;
            tTopay+=+s.TOPAY_CHG||0; tFov+=+s.FOV_CHG||0; tEway+=+s.EWAY_CHG||0;
            tAwb+=+s.AWB_CHG||0; tPack+=+s.PACK_CHG||0; tDev+=+s.DEV_CHG||0;
            tSgst+=+s.SGST||0; tCgst+=+s.CGST||0; tIgst+=+s.IGST||0;
            tTaxable+=+s.TAXABLE||0; tTotal+=+s.TOTAL||0;
            tPiecs+=parseInt(s.PIECS||0); tChgWt+=+s.CHG_WT||0;
            const d = +s.ORDER_DATE||0;
            if (d) { if (d < minDate) minDate = d; if (d > maxDate) maxDate = d; }
        });
        const otherCharges = tFuel + tCod + tTopay + tFov + tEway + tAwb + tPack + tDev;
        const chargesSubtotal = tFright + otherCharges;
        const totalTax = tSgst + tCgst + tIgst;
        const grandTotal = inv.TOTAL || tTotal;

        // Compute GST rate % from actual data
        function _gstRate(taxable, sgst, cgst, igst) {
            if (taxable <= 0) return { sgstRate: '---', cgstRate: '---', igstRate: '---', isInterState: false };
            const totalGst = sgst + cgst + igst;
            const ratePct = Math.round((totalGst / taxable) * 100);
            if (ratePct <= 0) return { sgstRate: '---', cgstRate: '---', igstRate: '---', isInterState: false };
            const half = ratePct / 2;
            if (igst > 0) return { sgstRate: '', cgstRate: '', igstRate: `${ratePct}%`, isInterState: true };
            return { sgstRate: `${half}%`, cgstRate: `${half}%`, igstRate: '', isInterState: false };
        }
        const rates = _gstRate(tTaxable, tSgst, tCgst, tIgst);

        const clientName = b2b?.B2B_NAME || inv.CODE;
        const periodStr = (minDate < Infinity && maxDate > 0)
            ? `${_fmt(minDate)} — ${_fmt(maxDate)}` : 'N/A';

        // ── Build the form HTML ───────────────────────────────────────────────
        function _row(label, val, bold, indent) {
            return `<tr class="${bold ? 'font-bold bg-gray-50' : ''}">
                <td class="px-3 py-1.5 text-sm ${indent ? 'pl-6' : ''}">${label}</td>
                <td class="px-3 py-1.5 text-sm text-right ${bold ? 'text-indigo-700' : 'text-gray-800'}">&#8377;${val.toFixed(2)}</td>
            </tr>`;
        }
        function _sep() {
            return `<tr><td colspan="2" class="px-3 py-0"><hr class="border-gray-300"></td></tr>`;
        }
        function _sectionHdr(label) {
            return `<tr><td colspan="2" class="px-3 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">${label}</td></tr>`;
        }

        const chargeRows = [
            _sectionHdr('Operating Charges'),
            _row('Freight', tFright, false),
            ...(tFuel > 0 ? [_row('Fuel Surcharge', tFuel, false, true)] : []),
            ...(tCod > 0 ? [_row('COD Charges', tCod, false, true)] : []),
            ...(tTopay > 0 ? [_row('ToPay Charges', tTopay, false, true)] : []),
            ...(tFov > 0 ? [_row('Insurance (FOV)', tFov, false, true)] : []),
            ...(tEway > 0 ? [_row('E-Way Charges', tEway, false, true)] : []),
            ...(tAwb > 0 ? [_row('AWB Charges', tAwb, false, true)] : []),
            ...(tPack > 0 ? [_row('Packaging', tPack, false, true)] : []),
            ...(tDev > 0 ? [_row('Development', tDev, false, true)] : []),
            _sep(),
            _row('Charges Subtotal', chargesSubtotal, true),
        ];

        const taxRows = [
            _sectionHdr('Tax Details'),
            _row('Taxable Value', tTaxable, false),
            ...(rates.sgstRate && tSgst > 0 ? [_row(`SGST @ ${rates.sgstRate}`, tSgst, false, true)] : []),
            ...(rates.cgstRate && tCgst > 0 ? [_row(`CGST @ ${rates.cgstRate}`, tCgst, false, true)] : []),
            ...(rates.igstRate && tIgst > 0 ? [_row(`IGST @ ${rates.igstRate}`, tIgst, false, true)] : []),
            ...((tSgst + tCgst + tIgst) > 0 ? [_sep(), _row('Total Tax', totalTax, true)] : []),
        ];

        const allRows = [...chargeRows, ...taxRows, _sep(), _row('GRAND TOTAL', grandTotal, true)];

        const tableHtml = `<table class="min-w-full">${allRows.join('')}</table>`;

        const qrUrl = branch?.BRANCH_UPI
            ? `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=upi://pay?pa=${encodeURIComponent(branch.BRANCH_UPI)}%26pn=${encodeURIComponent(branch.BRANCH_UPI_NAME||branch.BRANCH_NAME||'')}%26am=${grandTotal.toFixed(2)}%26cu=INR`
            : '';

        // ── Render modal ──────────────────────────────────────────────────────
        document.getElementById('vbCloseInvModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'vbCloseInvModal';
        modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 p-4 overflow-y-auto';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-auto relative" style="max-height:90vh;overflow-y:auto;">
                <!-- Close btn -->
                <button onclick="document.getElementById('vbCloseInvModal').remove()" class="absolute top-3 right-3 text-gray-400 hover:text-gray-700 z-10">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>

                <!-- Header -->
                <div class="px-6 pt-5 pb-3 border-b bg-gradient-to-r from-indigo-50 to-white">
                    <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        Generate Invoice
                    </h3>
                    <div class="flex justify-between items-start mt-1">
                        <div>
                            <p class="text-sm font-semibold text-gray-800">${clientName}</p>
                            <p class="text-xs text-gray-500">ID: ${inv.INVOICE_ID || 'N/A'} &middot; Branch: ${branch?.BRANCH_NAME || inv.BRANCH || 'N/A'}</p>
                        </div>
                        <div class="text-right text-xs text-gray-500">
                            <div>${shipments.length} shipment${shipments.length !== 1 ? 's' : ''}</div>
                            <div>${tChgWt.toFixed(2)} kg</div>
                        </div>
                    </div>
                </div>

                <!-- Body: Charges + Tax Table -->
                <div class="px-6 py-4 space-y-1">
                    ${tableHtml}
                </div>

                <!-- Invoice Number + Date -->
                <div class="px-6 py-4 border-t bg-gray-50 space-y-3">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Number</label>
                            <input id="vbCloseInvNum" type="text" class="form-input w-full text-sm" placeholder="Auto-generate">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Date *</label>
                            <input id="vbCloseInvDate" type="date" class="form-input w-full text-sm">
                        </div>
                    </div>
                    <p id="vbCloseInvErr" class="text-xs text-red-600 hidden"></p>

                    <div class="flex gap-3 pt-1">
                        <button id="vbCloseInvConfirm" class="flex-1 px-4 py-2.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Confirm &amp; Generate
                        </button>
                        <button id="vbCloseInvCancel" class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                    </div>
                    ${qrUrl ? `<div class="flex items-center gap-3 pt-2 border-t border-gray-200">
                        <img src="${qrUrl}" style="width:60px;height:60px;border:1px solid #ddd;border-radius:4px;">
                        <div class="text-xs text-gray-500">UPI QR for payment<br><span class="font-semibold text-gray-700">&#8377;${grandTotal.toFixed(2)}</span></div>
                    </div>` : ''}
                </div>
            </div>`;

        document.body.appendChild(modal);

        // ── Wire up ───────────────────────────────────────────────────────────
        document.getElementById('vbCloseInvDate').value = fmtDate(Date.now(), 'input');
        document.getElementById('vbCloseInvNum').value = '';
        document.getElementById('vbCloseInvErr').classList.add('hidden');
        document.getElementById('vbCloseInvCancel').onclick = () => modal.remove();

        document.getElementById('vbCloseInvConfirm').onclick = async () => {
            const invNum  = document.getElementById('vbCloseInvNum').value.trim() || null;
            const invDate = document.getElementById('vbCloseInvDate').value;
            const errEl   = document.getElementById('vbCloseInvErr');
            if (!invDate) { errEl.textContent = 'Invoice date is required.'; errEl.classList.remove('hidden'); return; }

            const btn = document.getElementById('vbCloseInvConfirm');
            btn.disabled = true;
            btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 9a9 9 0 0115.12-4.38M20 20v-5h-5"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 15a9 9 0 01-15.12 4.38"/></svg> Generating...';

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                const res = await callApi('/api/issueInvoice', { invoice_id: inv.INVOICE_ID, inv_number: invNum, inv_date: toMs(invDate) });
                if (res.status === 'success') {
                    modal.remove();
                    _showInvoiceBanner(res.inv_number, invDate, res.updated);
                    const fresh = await getAppData().catch(() => null);
                    if (fresh) _initData(fresh);
                } else {
                    errEl.textContent = res.detail || 'Failed to issue invoice.'; errEl.classList.remove('hidden');
                }
            } catch (e) {
                errEl.textContent = e.message || 'Error issuing invoice.'; errEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Confirm &amp; Generate';
            }
        };
    }

    function _showInvoiceBanner(invNum, invDate, count) {
        document.getElementById('vbInvBanner')?.remove();
        const banner = document.createElement('div');
        banner.id = 'vbInvBanner';
        banner.className = 'flex items-center justify-between gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 mb-4';
        banner.innerHTML = `
            <div class="flex items-center gap-2">
                <svg class="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>Invoice <strong>${invNum}</strong> issued on <strong>${invDate}</strong> — ${count} order${count !== 1 ? 's' : ''} updated.</span>
            </div>
            <button onclick="document.getElementById('vbInvBanner').remove()" class="text-green-600 hover:text-green-800 flex-shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>`;
        const detail = document.getElementById('vaultDetailView');
        detail?.prepend(banner);
    }

    // ── Public load() ─────────────────────────────────────────────────────────
    async function load() {
        _isUnbilled = false; _currentKey = null;
        _injectUI();
        document.getElementById('vbUnbilledBtn')?.classList.remove('filter-active');
        document.getElementById('vbDetailView')?.classList.add('hidden');
        document.getElementById('vbEmptyView')?.classList.remove('hidden');
        document.getElementById('vaultSearch').oninput = _applyFilters;

        const data = await getAppData().catch(() => null);
        if (data) _initData(data);
        else document.getElementById('vbStatus').textContent = 'Waiting for server data...';
    }

    window.addEventListener('appDataLoaded',    e => { if (window.VaultPage?.activeTile() === 'billing') _initData(e.detail.data); });
    window.addEventListener('appDataRefreshed', e => { if (window.VaultPage?.activeTile() === 'billing') _initData(e.detail.data); });

    return { load };
})();

window.VaultBilling = VaultBilling;
