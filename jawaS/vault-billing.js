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
        const clientAddress = b2b?.B2B_ADDRESS || '';
        const clientCity = b2b?.B2B_CITY || '';
        const clientState = b2b?.B2B_STATE || '';
        const clientGstin = b2b?.ID_GST_PAN_ADHAR || 'Unregistered';
        const clientMobile = b2b?.MOBILE_NUMBER || '';
        const clientGstCode = b2b?.GST_CODE || '';

        const invNum     = inv.INV_NUMBER || 'N/A';
        const invDate    = inv.INVOICE_DATE ? _fmt(inv.INVOICE_DATE) : 'N/A';
        const branchName = branch?.BRANCH_NAME || inv.BRANCH || 'POST4EX LOGISTICS';
        const branchAddress = branch?.BRANCH_ADDRESS || '';
        const branchCity = branch?.BRANCH_CITY || 'Dehradun';
        const branchState = branch?.BRANCH_STATE || 'Uttarakhand';
        const branchStateCode = branch?.GST_CODE || branch?.CODE_STATE || '05';
        const branchGstin = branch?.BRANCH_GSTIN || '';
        const branchPan   = branch?.BRANCH_PAN || '';
        const branchEmail = branch?.BRANCH_EMAIL || '';
        const branchMobile = branch?.BRANCH_MOBILE || '';
        const branchUpi  = branch?.BRANCH_UPI  || '';
        const branchUpiName = branch?.BRANCH_UPI_NAME || branchName;
        const branchBank = branch?.BRANCH_BANK || branch?.BANK_NAME || 'Bank of Baroda';
        const branchAccNo = branch?.BRANCH_ACCOUNT_NO || branch?.ACCOUNT_NO || '';
        const branchIfsc = branch?.BRANCH_IFSC || branch?.IFSC_CODE || '';

        let tFright=0, tFuel=0, tCod=0, tTopay=0, tFov=0, tEway=0, tAwb=0, tPack=0, tDev=0,
            tSgst=0, tCgst=0, tIgst=0, tTaxable=0, tTotal=0, tPiecs=0, tChgWt=0;
        
        shipments.forEach(s => {
            tFright+=+s.FRIGHT||0; tFuel+=+s.FUEL_CHG||0; tCod+=+s.COD_CHG||0;
            tTopay+=+s.TOPAY_CHG||0; tFov+=+s.FOV_CHG||0; tEway+=+s.EWAY_CHG||0;
            tAwb+=+s.AWB_CHG||0; tPack+=+s.PACK_CHG||0; tDev+=+s.DEV_CHG||0;
            tSgst+=+s.SGST||0; tCgst+=+s.CGST||0; tIgst+=+s.IGST||0;
            tTaxable+=+s.TAXABLE||0; tTotal+=+s.TOTAL||0;
            tPiecs+=parseInt(s.PIECS||0, 10); tChgWt+=+s.CHG_WT||0;
        });

        const grandTotal = inv.TOTAL || tTotal;
        const totalTaxAmt = tSgst + tCgst + tIgst;

        function numToWords(n) {
            const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
            const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
            n=Math.round(n); if(!n) return 'Zero';
            if(n<20) return a[n]; if(n<100) return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');
            if(n<1000) return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+numToWords(n%100):'');
            if(n<100000) return numToWords(Math.floor(n/1000))+' Thousand'+(n%1000?' '+numToWords(n%1000):'');
            if(n<10000000) return numToWords(Math.floor(n/100000))+' Lakh'+(n%100000?' '+numToWords(n%100000):'');
            return numToWords(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+numToWords(n%10000000):'');
        }

        const rows = shipments.map((s, i) => `
            <tr class="item-row">
                <td class="tc border-r">${i + 1}</td>
                <td class="border-r">${_fmt(s.ORDER_DATE)}</td>
                <td class="border-r font-bold">${s.AWB_NUMBER || 'N/A'}${s.CARRIER ? ': ' + s.CARRIER : ''}</td>
                <td class="tc border-r">${s.MODE || 'N/A'}</td>
                <td class="tc border-r">${String(s.PIECS || 1).padStart(2, '0')}</td>
                <td class="border-r">${s.DEST_PINCODE || ''}: ${s.DEST_CITY || 'N/A'}</td>
                <td class="tr border-r">${(+s.CHG_WT || 0).toFixed(2)}</td>
                <td class="tr">&#8377;${(+s.FRIGHT || 0).toFixed(2)}</td>
            </tr>
        `).join('');

        const qrUrl = branchUpi ? `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=upi://pay?pa=${encodeURIComponent(branchUpi)}%26pn=${encodeURIComponent(branchUpiName)}%26am=${grandTotal.toFixed(2)}%26cu=INR%26tn=${encodeURIComponent('INV-'+invNum)}` : '';

        const css = `
            * { box-sizing: border-box; }
            body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; font-size: 11px; line-height: 1.35; color: #000; margin: 0; padding: 15px; background: #f5f5f5; }
            .tally-wrap { max-width: 820px; margin: auto; background: #fff; border: 1.5px solid #000; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .tally-header { text-align: center; border-bottom: 1.5px solid #000; padding: 4px 10px; position: relative; }
            .tally-title { font-size: 15px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
            .tally-subtitle { font-size: 9px; font-weight: bold; position: absolute; right: 10px; top: 6px; }
            .tally-grid { display: grid; grid-template-columns: 52% 48%; border-bottom: 1px solid #000; }
            .border-r { border-right: 1px solid #000; }
            .border-b { border-bottom: 1px solid #000; }
            .p-6 { padding: 6px 8px; }
            .p-4 { padding: 4px 6px; }
            .meta-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
            .meta-table td { padding: 2.5px 4px; vertical-align: top; border-bottom: 1px solid #000; }
            .meta-table tr:last-child td { border-bottom: none; }
            .meta-table .meta-cell { border-right: 1px solid #000; width: 50%; }
            .items-table { width: 100%; border-collapse: collapse; font-size: 10.5px; border-bottom: 1.5px solid #000; }
            .items-table th { background: #f2f2f2; border-bottom: 1.5px solid #000; padding: 5px 4px; font-weight: bold; }
            .items-table td { padding: 4px 5px; vertical-align: middle; }
            .items-table .item-row td { border-bottom: 1px solid #e5e7eb; }
            .tc { text-align: center; }
            .tr { text-align: right; }
            .tl { text-align: left; }
            .font-bold { font-weight: bold; }
            .sub-txt { font-size: 9px; color: #444; }
            .tot-row td { border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; font-weight: bold; padding: 6px 4px; background: #fafafa; }
            .bottom-section { display: grid; grid-template-columns: 55% 45%; border-bottom: 1.5px solid #000; }
            .tax-words-box { padding: 6px 8px; font-size: 10.5px; border-right: 1px solid #000; display: flex; flex-direction: column; justify-content: space-between; }
            .bank-box { margin-top: 6px; padding-top: 4px; border-top: 1px dashed #000; font-size: 10px; }
            .sig-section { display: grid; grid-template-columns: 55% 45%; }
            .decl-box { padding: 6px 8px; font-size: 9.5px; border-right: 1px solid #000; }
            .signatory-box { padding: 6px 8px; text-align: right; display: flex; flex-direction: column; justify-content: space-between; min-height: 85px; }
            .computer-note { text-align: center; font-size: 9px; padding: 3px; font-weight: bold; background: #fafafa; }
            @media print {
                @page { size: A4 portrait; margin: 8mm; }
                body { background: #fff; padding: 0; }
                .tally-wrap { box-shadow: none; width: 100% !important; max-width: 100% !important; border: 1.5px solid #000 !important; }
            }
        `;

        const html = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Tax Invoice - ${invNum}</title>
            <style>${css}</style>
        </head>
        <body>
            <div class="tally-wrap">
                <!-- Top Title Bar -->
                <div class="tally-header">
                    <div class="tally-title">Tax Invoice</div>
                    <div class="tally-subtitle">(ORIGINAL FOR RECIPIENT)</div>
                </div>

                <!-- Seller & Buyer Details + Dispatch Meta Grid -->
                <div class="tally-grid">
                    <div class="border-r" style="display: flex; flex-direction: column; justify-content: space-between;">
                        <div class="p-6">
                            <div style="font-size: 12.5px; font-weight: bold; line-height: 1.2; margin-bottom: 2px;">Billed By: ${branchName}</div>
                            <div><b>Address:</b> ${branchAddress}</div>
                            <div><b>City:</b> ${branchCity}, ${branchState}</div>
                            <div><b>State Name:</b> ${branchState}, <b>Code:</b> ${branchStateCode}</div>
                            <div><b>PAN/GST:</b> ${branchPan ? branchPan + ' / ' : ''}<span class="font-bold">${branchGstin || 'N/A'}</span></div>
                            <div><b>Phone:</b> ${branchMobile || ''} ${branchEmail ? ' | <b>Email:</b> ' + branchEmail : ''}</div>
                        </div>
                        <div class="p-6" style="border-top: 1px solid #000;">
                            <div class="font-bold" style="text-decoration: underline; margin-bottom: 2px;">Bill To: ${clientName}</div>
                            <div><b>Address:</b> ${clientAddress}</div>
                            <div><b>City:</b> ${clientCity ? clientCity + ', ' : ''}${clientState}</div>
                            <div><b>State Name:</b> ${clientState || 'N/A'}, <b>Code:</b> ${clientGstCode || '—'}</div>
                            <div><b>GST:</b> <span class="font-bold">${clientGstin}</span></div>
                            ${clientMobile ? `<div><b>Mobile:</b> ${clientMobile}</div>` : ''}
                        </div>
                    </div>
                    <div>
                        <table class="meta-table" style="height: 100%;">
                            <tr>
                                <td class="meta-cell"><b>Invoice No.</b><br><span class="font-bold" style="font-size: 11px;">${invNum}</span></td>
                                <td><b>Invoice Date:</b><br><span class="font-bold">${invDate}</span></td>
                            </tr>
                            <tr>
                                <td class="meta-cell"><b>Delivery Note</b><br>—</td>
                                <td><b>Mode/Terms of Payment</b><br>Credit / On Receipt</td>
                            </tr>
                            <tr>
                                <td class="meta-cell"><b>Supplier's Ref.</b><br>—</td>
                                <td><b>Other Reference(s)</b><br>—</td>
                            </tr>
                            <tr>
                                <td class="meta-cell"><b>Buyer's Order No.</b><br>—</td>
                                <td><b>Dated</b><br>—</td>
                            </tr>
                            <tr>
                                <td class="meta-cell"><b>Despatch Doc No.</b><br>SAC Code 996812</td>
                                <td><b>Delivery Note Date</b><br>—</td>
                            </tr>
                            <tr>
                                <td class="meta-cell"><b>Despatched through</b><br>Courier Services</td>
                                <td><b>Destination</b><br>${clientCity || 'Various'}</td>
                            </tr>
                        </table>
                    </div>
                </div>

                <!-- Items & Shipments Table -->
                <table class="items-table">
                    <thead>
                        <tr>
                            <th class="tc border-r" style="width: 28px;">Sr</th>
                            <th class="tl border-r" style="width: 80px;">Date</th>
                            <th class="tl border-r">AWB: Carrier</th>
                            <th class="tc border-r" style="width: 45px;">Mode</th>
                            <th class="tc border-r" style="width: 45px;">Pcs</th>
                            <th class="tl border-r" style="width: 170px;">Destination</th>
                            <th class="tr border-r" style="width: 65px;">Chg.Wt</th>
                            <th class="tr" style="width: 80px;">Fright</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                    <tfoot>
                        <tr class="tot-row">
                            <td colspan="4" class="tr border-r font-bold">Totals</td>
                            <td class="tc border-r font-bold">${tPiecs}</td>
                            <td class="border-r"></td>
                            <td class="tr border-r font-bold">${tChgWt.toFixed(2)}</td>
                            <td class="tr font-bold">&#8377;${tFright.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>

                <!-- Amount in Words & Charges / Tax Summary -->
                <div class="bottom-section">
                    <div class="tax-words-box">
                        <div>
                            <div><b>Amount Chargeable (in words):</b></div>
                            <div class="font-bold" style="font-size: 11px; margin-top: 2px;">INR Indian Rupees ${numToWords(Math.round(grandTotal))} Only</div>
                        </div>
                        <div class="bank-box">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <div class="font-bold">Company's Bank Details:</div>
                                    <div>Bank Name: <b>${branchBank}</b></div>
                                    ${branchAccNo ? `<div>A/c No.: <b>${branchAccNo}</b></div>` : ''}
                                    ${branchIfsc ? `<div>Branch &amp; IFS Code: <b>${branchIfsc}</b></div>` : ''}
                                    ${branchUpi ? `<div>UPI ID: <b>${branchUpi}</b></div>` : ''}
                                </div>
                                ${qrUrl ? `<div><img src="${qrUrl}" style="width: 68px; height: 68px; border: 1px solid #999;"></div>` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="padding: 6px 8px; font-size: 10px; display: flex; flex-direction: column; justify-content: space-between;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                            <tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">Freight Amount:</td><td class="tr font-bold">&#8377;${tFright.toFixed(2)}</td></tr>
                            ${tFuel > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">Fuel Charge:</td><td class="tr">&#8377;${tFuel.toFixed(2)}</td></tr>` : ''}
                            ${tCod > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">COD Charge:</td><td class="tr">&#8377;${tCod.toFixed(2)}</td></tr>` : ''}
                            ${tTopay > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">Topay Charge:</td><td class="tr">&#8377;${tTopay.toFixed(2)}</td></tr>` : ''}
                            ${tFov > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">Insurance:</td><td class="tr">&#8377;${tFov.toFixed(2)}</td></tr>` : ''}
                            ${tEway > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">Eway Handle:</td><td class="tr">&#8377;${tEway.toFixed(2)}</td></tr>` : ''}
                            ${tAwb > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">AWB Charges:</td><td class="tr">&#8377;${tAwb.toFixed(2)}</td></tr>` : ''}
                            ${tPack > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">Packaging:</td><td class="tr">&#8377;${tPack.toFixed(2)}</td></tr>` : ''}
                            ${tDev > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">Development:</td><td class="tr">&#8377;${tDev.toFixed(2)}</td></tr>` : ''}
                            <tr style="border-bottom: 1.5px solid #000; font-weight: bold;"><td style="padding: 2.5px 0;">Taxable Amount:</td><td class="tr">&#8377;${tTaxable.toFixed(2)}</td></tr>
                            ${tCgst > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">Add: Central Tax (CGST):</td><td class="tr">&#8377;${tCgst.toFixed(2)}</td></tr>` : ''}
                            ${tSgst > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">Add: State Tax (SGST):</td><td class="tr">&#8377;${tSgst.toFixed(2)}</td></tr>` : ''}
                            ${tIgst > 0 ? `<tr style="border-bottom: 1px solid #ddd;"><td style="padding: 2px 0;">Add: Integrated Tax (IGST):</td><td class="tr">&#8377;${tIgst.toFixed(2)}</td></tr>` : ''}
                            <tr style="font-weight: bold; font-size: 11px; background: #fafafa;"><td style="padding: 4px 0; border-top: 1.5px solid #000;">Total Amount:</td><td class="tr" style="border-top: 1.5px solid #000;">&#8377;${grandTotal.toFixed(2)}</td></tr>
                        </table>
                    </div>
                </div>

                <!-- Declarations & Signatory -->
                <div class="sig-section">
                    <div class="decl-box">
                        <div class="font-bold" style="text-decoration: underline;">Terms &amp; Conditions:</div>
                        <ol style="margin: 3px 0 0 0; padding-left: 16px; font-size: 9px;">
                            <li>All disputes subject to ${branchCity} Jurisdiction.</li>
                            <li>Payment due on receipt.</li>
                            <li>Computer-generated bill; no signature required.</li>
                            <li>Dev. charges of 5% waived if paid within 10 days.</li>
                            <li>Bill For SAC Code 996812 (Courier Services).</li>
                        </ol>
                    </div>
                    <div class="signatory-box">
                        <div style="font-size: 10px;">for <b>${branchName}</b></div>
                        <div class="font-bold" style="font-size: 10.5px;">Authorised Signatory</div>
                    </div>
                </div>

                <!-- Footer Note -->
                <div class="computer-note border-b" style="border-top: 1px solid #000;">
                    SUBJECT TO ${branchCity.toUpperCase()} JURISDICTION · This is a Computer Generated Invoice
                </div>
            </div>
            <script>window.onload = () => window.print();<\/script>
        </body>
        </html>`;

        const w = window.open('', `Invoice-${invNum}`);
        w.document.write(html);
        w.document.close();
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
        modal.className = 'fixed inset-0 flex items-center justify-center p-4';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px); z-index: 999999 !important; display: flex; align-items: center; justify-content: center;';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto relative overflow-hidden flex flex-col border border-gray-200 animate-fade-in" style="max-height: 88vh; z-index: 1000000 !important;">
                <!-- Header -->
                <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <i class="fa-solid fa-file-invoice text-sm"></i>
                        </div>
                        <div>
                            <h3 class="text-base font-bold text-gray-900 leading-tight">Generate Invoice</h3>
                            <p class="text-xs text-gray-500 font-medium">${clientName} &middot; <span class="text-indigo-600 font-semibold">${inv.INVOICE_ID || 'N/A'}</span></p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('vbCloseInvModal').remove()" class="w-7 h-7 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 flex items-center justify-center transition-colors">
                        <i class="fa-solid fa-xmark text-sm"></i>
                    </button>
                </div>

                <!-- Info Chips -->
                <div class="px-6 py-2.5 bg-indigo-50/40 border-b border-indigo-50 flex items-center justify-between text-xs text-gray-600 font-medium">
                    <div>Branch: <span class="font-bold text-gray-800">${branch?.BRANCH_NAME || inv.BRANCH || 'N/A'}</span></div>
                    <div>${shipments.length} AWBs &middot; <span class="font-bold text-gray-800">${tChgWt.toFixed(2)} kg</span></div>
                </div>

                <!-- Scrollable Body: Charges Table -->
                <div class="px-6 py-4 overflow-y-auto flex-1 space-y-1 text-xs">
                    ${tableHtml}
                </div>

                <!-- Footer: Date + Actions -->
                <div class="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Invoice Date *</label>
                        <input id="vbCloseInvDate" type="date" class="form-input w-full text-sm font-medium bg-white">
                        <p class="text-[11px] text-gray-500 mt-1 flex items-center gap-1.5">
                            <i class="fa-solid fa-circle-check text-emerald-500 text-xs"></i>
                            Invoice number is automatically sequenced by Invoice Ninja.
                        </p>
                    </div>
                    <p id="vbCloseInvErr" class="text-xs text-red-600 font-medium hidden"></p>

                    <div class="flex gap-2.5 pt-1">
                        <button id="vbCloseInvCancel" class="btn-danger btn-sm flex-1">Cancel</button>
                        <button id="vbCloseInvConfirm" class="btn-ghost btn-sm flex-1 font-bold">
                            <i class="fa-solid fa-bolt text-xs"></i>
                            <span>Confirm &amp; Generate</span>
                        </button>
                    </div>
                    ${qrUrl ? `<div class="flex items-center gap-3 pt-2 border-t border-gray-200">
                        <img src="${qrUrl}" style="width:50px;height:50px;border:1px solid #ddd;border-radius:6px;">
                        <div class="text-xs text-gray-500">UPI QR for payment<br><span class="font-bold text-gray-800">&#8377;${grandTotal.toFixed(2)}</span></div>
                    </div>` : ''}
                </div>
            </div>`;

        document.body.appendChild(modal);

        // ── Wire up ───────────────────────────────────────────────────────────
        document.getElementById('vbCloseInvDate').value = fmtDate(Date.now(), 'input');
        document.getElementById('vbCloseInvErr').classList.add('hidden');
        document.getElementById('vbCloseInvCancel').onclick = () => modal.remove();

        document.getElementById('vbCloseInvConfirm').onclick = async () => {
            const invDate = document.getElementById('vbCloseInvDate').value;
            const errEl   = document.getElementById('vbCloseInvErr');
            if (!invDate) { errEl.textContent = 'Invoice date is required.'; errEl.classList.remove('hidden'); return; }

            const btn = document.getElementById('vbCloseInvConfirm');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Issuing to Invoice Ninja...</span>';

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                const res = await callApi('/api/issueInvoice', { invoice_id: inv.INVOICE_ID, inv_date: toMs(invDate) });
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
                btn.innerHTML = '<i class="fa-solid fa-file-invoice text-sm"></i> <span>Confirm &amp; Generate</span>';
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
