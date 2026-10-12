// ============================================================================
// VAULT-BILLING.JS — Billing Desk (Master Ledger Bridge)
// Aligned with Master Ledger Implant Plan (Section 10 & Table 14.1 Item 4)
// Endpoints: /api/issueInvoice & /api/unbillInvoice
// Filter Model: Standard Modal pattern from Shipments (vaultFilterBtn)
// Contrast & Styling: Clean .detail-card pattern, high-contrast badges & metrics
// ============================================================================

const VaultBilling = (() => {

    let _all          = [];   // All shipments from appData.ORDERS
    let _b2bMap       = new Map();
    let _branchMap    = new Map();
    let _consolidated = [];
    let _currentKey   = null;
    let _isUnbilled   = false;

    // Filters
    let _filterStart   = "";
    let _filterEnd     = "";
    let _filterBranch  = "";
    let _filterCode    = "";
    let _filterCarrier = "";

    const _fmt = v => (typeof fmtDate === 'function') ? fmtDate(v) : new Date(v).toLocaleDateString();
    const _fmtD = v => (typeof fmtDate === 'function') ? fmtDate(v, 'date') : new Date(v).toLocaleDateString();

    function _fmtMoney(n) {
        const num = Number(n) || 0;
        return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ── RBAC Permission Guard (Accountant+) ──────────────────────────────────
    function _canUnbill() {
        const user = (typeof getUser === 'function') ? getUser() : null;
        const role = user?.ROLE || 'GUEST';
        const roleLevels = window.ROLE_LEVELS || { ACCOUNTANT: 60, AUDITOR: 70, ADMIN: 90, MASTER: 100 };
        const userLevel = roleLevels[role] || 0;
        const reqLevel = roleLevels['ACCOUNTANT'] || 60;
        return userLevel >= reqLevel;
    }

    // ── Filter State & Badge ──────────────────────────────────────────────────
    function _hasActiveFilters() {
        return !!_filterStart || !!_filterEnd || !!_filterBranch || !!_filterCode || !!_filterCarrier;
    }

    function _updateFilterButtonState() {
        const btn = document.getElementById('vaultFilterBtn');
        if (!btn) return;
        const active = _hasActiveFilters();
        btn.classList.toggle('filter-active', active);
        if (active) {
            btn.classList.add('bg-red-100', 'text-red-700');
            btn.classList.remove('text-gray-500');
            btn.title = 'Filters Active (Click to modify)';
        } else {
            btn.classList.remove('bg-red-100', 'text-red-700', 'filter-active');
            btn.classList.add('text-gray-500');
            btn.title = 'Filter Billing Desk';
        }
    }

    // ── Print Invoice (Tally/GST Tax Invoice Compliant) ───────────────────────
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
                <div class="tally-header">
                    <div class="tally-title">Tax Invoice</div>
                    <div class="tally-subtitle">(ORIGINAL FOR RECIPIENT)</div>
                </div>

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

    // ── Data Consolidation ────────────────────────────────────────────────────
    function _key(order) {
        if (order.INV_NUMBER) return { key: 'INV-'  + order.INV_NUMBER, type: 'INV' };
        if (order.INVOICE_ID) return { key: 'ID-'   + order.INVOICE_ID, type: 'ID' };
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
                map.set(key, {
                    CONSOLIDATION_KEY: key,
                    KEY_TYPE: type,
                    INV_NUMBER: order.INV_NUMBER || null,
                    INVOICE_ID: order.INVOICE_ID || null,
                    CODE: order.CODE,
                    BRANCH: order.BRANCH,
                    CARRIER: order.CARRIER,
                    INVOICE_DATE: iDate,
                    DATE_FOR_SORTING: sortDt,
                    START_DATE: oDate,
                    END_DATE: oDate,
                    TOTAL: total
                });
            }
        });
        return Array.from(map.values()).sort((a,b) => new Date(b.DATE_FOR_SORTING||0) - new Date(a.DATE_FOR_SORTING||0));
    }

    function _initData(appData) {
        if (!appData?.ORDERS) return;
        _all = Object.values(appData.ORDERS);
        _b2bMap.clear();
        if (appData.B2B) Object.values(appData.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
        _branchMap.clear();
        if (appData.BRANCHES) Object.values(appData.BRANCHES).forEach(b => b.BRANCH_CODE && _branchMap.set(b.BRANCH_CODE, b));
        _consolidated = _consolidate(_all);
        _populateFilterOptions();
        _applyFilters();
    }

    // ── Setup Filter Modal (Standard Modal Architecture) ──────────────────────
    function _setupFilterModal() {
        const filterBtn = document.getElementById('vaultFilterBtn');
        if (filterBtn) {
            filterBtn.classList.remove('hidden');
            filterBtn.onclick = () => openFilterModal();
        }

        let modal = document.getElementById('vbFilterModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'vbFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-lg">
                    <div class="flex justify-between items-center border-b pb-3">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                <i class="fa-solid fa-file-invoice text-sm"></i>
                            </div>
                            <div>
                                <h2 class="text-base font-bold text-gray-900">Filter Billing Desk</h2>
                                <p class="text-[11px] text-gray-500">Filter invoices by period, branch, client &amp; carrier</p>
                            </div>
                        </div>
                        <button id="close-vb-filter-modal" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1 leading-none" aria-label="Close">✕</button>
                    </div>

                    <!-- Presets -->
                    <div>
                        <span class="block font-semibold text-gray-700 text-xs mb-1.5">Quick Date Presets</span>
                        <div class="flex flex-wrap gap-1.5">
                            <button type="button" class="vb-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition" data-preset="all">All Time</button>
                            <button type="button" class="vb-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition" data-preset="today">Today</button>
                            <button type="button" class="vb-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition" data-preset="this_month">This Month</button>
                            <button type="button" class="vb-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition" data-preset="fy_26_27">FY 2026-27</button>
                            <button type="button" class="vb-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition" data-preset="last_month">Last Month</button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label for="vb-filter-start-date" class="block font-semibold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="vb-filter-start-date" class="form-input text-xs w-full">
                        </div>
                        <div>
                            <label for="vb-filter-end-date" class="block font-semibold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="vb-filter-end-date" class="form-input text-xs w-full">
                        </div>
                        <div>
                            <label for="vb-filter-branch" class="block font-semibold text-gray-700 mb-1">Branch Scope</label>
                            <select id="vb-filter-branch" class="form-input text-xs w-full">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                        <div>
                            <label for="vb-filter-code" class="block font-semibold text-gray-700 mb-1">Client Code</label>
                            <select id="vb-filter-code" class="form-input text-xs w-full">
                                <option value="">All Clients</option>
                            </select>
                        </div>
                        <div class="sm:col-span-2">
                            <label for="vb-filter-carrier" class="block font-semibold text-gray-700 mb-1">Carrier</label>
                            <select id="vb-filter-carrier" class="form-input text-xs w-full">
                                <option value="">All Carriers</option>
                            </select>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-3 border-t">
                        <button id="vb-reset-filters" type="button" class="btn-ghost btn-sm">Reset</button>
                        <button id="vb-apply-filters" type="button" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs font-semibold">Apply Filters</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('close-vb-filter-modal').addEventListener('click', closeFilterModal);
            modal.addEventListener('click', e => { if (e.target === modal) closeFilterModal(); });
            document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeFilterModal(); });

            // Preset clicks
            modal.querySelectorAll('.vb-preset-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const preset = btn.dataset.preset;
                    const startInput = document.getElementById('vb-filter-start-date');
                    const endInput = document.getElementById('vb-filter-end-date');
                    const now = new Date();
                    const y = now.getFullYear();
                    const m = String(now.getMonth() + 1).padStart(2, '0');
                    const d = String(now.getDate()).padStart(2, '0');
                    const todayStr = `${y}-${m}-${d}`;

                    if (preset === 'all') {
                        startInput.value = '';
                        endInput.value = '';
                    } else if (preset === 'today') {
                        startInput.value = todayStr;
                        endInput.value = todayStr;
                    } else if (preset === 'this_month') {
                        startInput.value = `${y}-${m}-01`;
                        endInput.value = todayStr;
                    } else if (preset === 'fy_26_27') {
                        startInput.value = '2026-04-01';
                        endInput.value = '2027-03-31';
                    } else if (preset === 'last_month') {
                        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0);
                        const pY = prevMonth.getFullYear();
                        const pM = String(prevMonth.getMonth() + 1).padStart(2, '0');
                        const pEndD = String(lastDayPrev.getDate()).padStart(2, '0');
                        startInput.value = `${pY}-${pM}-01`;
                        endInput.value = `${pY}-${pM}-${pEndD}`;
                    }
                });
            });

            // Action listeners
            document.getElementById('vb-apply-filters').addEventListener('click', () => {
                _filterStart = document.getElementById('vb-filter-start-date').value;
                _filterEnd = document.getElementById('vb-filter-end-date').value;
                _filterBranch = document.getElementById('vb-filter-branch').value;
                _filterCode = document.getElementById('vb-filter-code').value;
                _filterCarrier = document.getElementById('vb-filter-carrier').value;

                closeFilterModal();
                _updateFilterButtonState();
                _applyFilters();
            });

            document.getElementById('vb-reset-filters').addEventListener('click', () => {
                _filterStart = "";
                _filterEnd = "";
                _filterBranch = "";
                _filterCode = "";
                _filterCarrier = "";

                document.getElementById('vb-filter-start-date').value = "";
                document.getElementById('vb-filter-end-date').value = "";
                document.getElementById('vb-filter-branch').value = "";
                document.getElementById('vb-filter-code').value = "";
                document.getElementById('vb-filter-carrier').value = "";

                closeFilterModal();
                _updateFilterButtonState();
                _applyFilters();
            });
        }

        _updateFilterButtonState();
    }

    function openFilterModal() {
        const modal = document.getElementById('vbFilterModal');
        if (!modal) return;
        document.getElementById('vb-filter-start-date').value = _filterStart;
        document.getElementById('vb-filter-end-date').value = _filterEnd;
        document.getElementById('vb-filter-branch').value = _filterBranch;
        document.getElementById('vb-filter-code').value = _filterCode;
        document.getElementById('vb-filter-carrier').value = _filterCarrier;
        modal.classList.remove('hidden');
    }

    function closeFilterModal() {
        const modal = document.getElementById('vbFilterModal');
        if (modal) modal.classList.add('hidden');
    }

    function _populateFilterOptions() {
        const branchEl = document.getElementById('vb-filter-branch');
        const codeEl   = document.getElementById('vb-filter-code');
        const carrierEl= document.getElementById('vb-filter-carrier');
        if (!branchEl) return;

        branchEl.length = codeEl.length = carrierEl.length = 1;
        [...new Set(_consolidated.map(i => i.BRANCH).filter(Boolean))].sort().forEach(v => branchEl.add(new Option(v, v)));
        [...new Set(_consolidated.map(i => i.CODE).filter(Boolean))].sort().forEach(v => {
            const b = _b2bMap.get(v);
            const label = b?.B2B_NAME ? `${v} (${b.B2B_NAME})` : v;
            codeEl.add(new Option(label, v));
        });
        [...new Set(_consolidated.map(i => i.CARRIER).filter(Boolean))].sort().forEach(v => carrierEl.add(new Option(v, v)));
    }

    // ── Inject UI & Segmented Toggle ──────────────────────────────────────────
    function _injectUI() {
        _setupFilterModal();

        const search = document.getElementById('vaultSearch');
        if (search) {
            search.placeholder = 'Search invoices, batch IDs, clients, branches…';
            search.oninput = _applyFilters;
        }

        // Inject Segmented Mode Control below search if not present
        const searchInput = document.getElementById('vaultSearch');
        let toggleContainer = document.getElementById('vbModeToggle');
        if (!toggleContainer && searchInput) {
            toggleContainer = document.createElement('div');
            toggleContainer.id = 'vbModeToggle';
            toggleContainer.className = 'grid grid-cols-2 p-1 bg-gray-100 rounded-lg border border-gray-200 text-xs font-bold mt-2 gap-1 select-none';
            toggleContainer.innerHTML = `
                <button type="button" id="vbModeBilled" class="py-1.5 px-2 rounded-md transition text-center shadow-xs bg-white text-indigo-700">
                    Billed Invoices (<span id="vbBilledCount">0</span>)
                </button>
                <button type="button" id="vbModeUnbilled" class="py-1.5 px-2 rounded-md transition text-center text-gray-600 hover:text-gray-900">
                    UnBilled Batches (<span id="vbUnbilledCount">0</span>)
                </button>
            `;
            searchInput.parentNode.insertBefore(toggleContainer, searchInput.nextSibling);

            document.getElementById('vbModeBilled').onclick = () => {
                _isUnbilled = false;
                _updateToggleView();
                _applyFilters();
            };
            document.getElementById('vbModeUnbilled').onclick = () => {
                _isUnbilled = true;
                _updateToggleView();
                _applyFilters();
            };
        }

        // Status text element
        let statusEl = document.getElementById('vaultListMsg');
        if (!statusEl) {
            statusEl = document.createElement('p');
            statusEl.id = 'vaultListMsg';
            statusEl.className = 'text-gray-500 px-4 pt-3 text-center text-xs';
            const listContainer = document.getElementById('vaultList')?.parentElement;
            listContainer?.insertBefore(statusEl, document.getElementById('vaultList'));
        }
    }

    function _updateToggleView() {
        const billedBtn = document.getElementById('vbModeBilled');
        const unbilledBtn = document.getElementById('vbModeUnbilled');
        if (!billedBtn || !unbilledBtn) return;

        if (_isUnbilled) {
            unbilledBtn.className = 'py-1.5 px-2 rounded-md transition text-center shadow-xs bg-amber-500 text-white font-bold';
            billedBtn.className = 'py-1.5 px-2 rounded-md transition text-center text-gray-600 hover:text-gray-900 font-medium';
        } else {
            billedBtn.className = 'py-1.5 px-2 rounded-md transition text-center shadow-xs bg-white text-indigo-700 font-bold';
            unbilledBtn.className = 'py-1.5 px-2 rounded-md transition text-center text-gray-600 hover:text-gray-900 font-medium';
        }
    }

    // ── Apply Filters & Render List ───────────────────────────────────────────
    function _applyFilters() {
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase().trim();

        const billedList = _consolidated.filter(inv => inv.KEY_TYPE === 'INV');
        const unbilledList = _consolidated.filter(inv => inv.KEY_TYPE !== 'INV');

        const billedCountEl = document.getElementById('vbBilledCount');
        const unbilledCountEl = document.getElementById('vbUnbilledCount');
        if (billedCountEl) billedCountEl.textContent = billedList.length;
        if (unbilledCountEl) unbilledCountEl.textContent = unbilledList.length;

        const currentPool = _isUnbilled ? unbilledList : billedList;

        const filtered = currentPool.filter(inv => {
            const dt = inv.DATE_FOR_SORTING ? new Date(inv.DATE_FOR_SORTING) : null;
            if (_filterStart && dt && dt < new Date(_filterStart + 'T00:00:00Z')) return false;
            if (_filterEnd && dt && dt > new Date(_filterEnd + 'T23:59:59Z')) return false;
            if (_filterBranch && inv.BRANCH !== _filterBranch) return false;
            if (_filterCode && inv.CODE !== _filterCode) return false;
            if (_filterCarrier && inv.CARRIER !== _filterCarrier) return false;

            if (q) {
                const matchInv = String(inv.INV_NUMBER || '').toLowerCase().includes(q);
                const matchId = String(inv.INVOICE_ID || '').toLowerCase().includes(q);
                const matchCode = String(inv.CODE || '').toLowerCase().includes(q);
                const matchBranch = String(inv.BRANCH || '').toLowerCase().includes(q);
                const matchCarrier = String(inv.CARRIER || '').toLowerCase().includes(q);
                return matchInv || matchId || matchCode || matchBranch || matchCarrier;
            }
            return true;
        });

        _renderList(filtered);
    }

    function _renderList(invoices) {
        const ul = document.getElementById('vaultList');
        const msg = document.getElementById('vaultListMsg');
        if (!ul) return;
        ul.innerHTML = '';

        if (msg) {
            msg.textContent = `${_isUnbilled ? 'UnBilled Batches' : 'Billed Invoices'}: ${invoices.length} loaded`;
            msg.classList.toggle('hidden', invoices.length > 0);
        }

        if (!invoices.length) {
            ul.innerHTML = `<li class="p-6 text-center text-gray-500 text-xs">No ${_isUnbilled ? 'unbilled batches' : 'invoices'} match filters.</li>`;
            return;
        }

        ul.innerHTML = invoices.map(inv => {
            const key = inv.CONSOLIDATION_KEY;
            const dt = inv.INVOICE_DATE ? _fmtD(inv.INVOICE_DATE) : (inv.DATE_FOR_SORTING ? _fmtD(inv.DATE_FOR_SORTING) : 'N/A');
            const isSelected = key === _currentKey;
            const b2b = _b2bMap.get(inv.CODE);
            const clientName = b2b?.B2B_NAME || inv.CODE;

            let badgeHtml = '';
            let primaryTitle = '';
            let subTitle = '';

            if (inv.KEY_TYPE === 'INV') {
                primaryTitle = `INV# ${inv.INV_NUMBER}`;
                subTitle = `${clientName} (${inv.CODE}) &middot; ${inv.BRANCH || '—'}`;
                badgeHtml = `<span class="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-emerald-100 text-emerald-800 border border-emerald-300">BILLED</span>`;
            } else if (inv.KEY_TYPE === 'ID') {
                primaryTitle = `Batch ${inv.INVOICE_ID}`;
                subTitle = `${clientName} (${inv.CODE}) &middot; ${inv.BRANCH || '—'}`;
                badgeHtml = `<span class="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-amber-100 text-amber-800 border border-amber-300">UNBILLED</span>`;
            } else {
                primaryTitle = `${clientName} (${inv.CODE})`;
                subTitle = `Branch: ${inv.BRANCH || 'N/A'}`;
                badgeHtml = `<span class="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-amber-100 text-amber-800 border border-amber-300">UNBILLED</span>`;
            }

            return `
                <li data-key="${_escapeHtml(key)}" class="p-3 bg-white rounded-lg border ${isSelected ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-500' : 'border-gray-200'} hover:border-indigo-400 cursor-pointer transition shadow-xs space-y-1.5">
                    <div class="flex justify-between items-start gap-1">
                        <span class="font-bold text-gray-900 text-xs truncate max-w-[200px]" title="${_escapeHtml(primaryTitle)}">
                            ${_escapeHtml(primaryTitle)}
                        </span>
                        ${badgeHtml}
                    </div>

                    <div class="text-[11px] text-gray-500 truncate" title="${_escapeHtml(subTitle)}">
                        ${_escapeHtml(subTitle)}
                    </div>

                    <div class="flex items-center justify-between text-[11px] mt-1 pt-1 border-t border-gray-100">
                        <span class="text-gray-500 text-[10px] font-medium">Date: ${dt}</span>
                        <span class="text-xs font-mono font-black text-indigo-700">${_fmtMoney(inv.TOTAL)}</span>
                    </div>
                </li>
            `;
        }).join('');

        const items = Array.from(ul.querySelectorAll('li'));
        items.forEach(li => {
            li.addEventListener('click', () => {
                const key = li.dataset.key;
                _select(key);
            });
        });

        // Determine item to select
        let target = null;
        if (_currentKey) {
            target = invoices.find(i => i.CONSOLIDATION_KEY === _currentKey);
        }
        if (!target && window.innerWidth >= 768) {
            target = invoices[0];
        }
        if (target) {
            _select(target.CONSOLIDATION_KEY);
        } else {
            VaultPage?.showDetail?.(false);
        }
    }

    function _select(key) {
        if (!key) return;
        _currentKey = key;

        // Highlight selected item in list
        document.querySelectorAll('#vaultList li').forEach(li => {
            const isMatch = li.dataset.key === key;
            li.classList.toggle('border-indigo-600', isMatch);
            li.classList.toggle('bg-indigo-50/40', isMatch);
            li.classList.toggle('ring-1', isMatch);
            li.classList.toggle('ring-indigo-500', isMatch);
            li.classList.toggle('selected', isMatch);
            li.classList.toggle('border-gray-200', !isMatch);
        });

        VaultPage?.showDetail?.(true);
        _renderDetail(key);
        VaultPage?.showDetailPane?.();
    }

    // ── Render Detail View (High-Contrast White Theme) ─────────────────────────
    function _renderDetail(key) {
        const inv       = _consolidated.find(i => i.CONSOLIDATION_KEY === key);
        const view      = document.getElementById('vaultDetailView');
        if (!inv || !view) return;

        const shipments = _all.filter(s => { const k = _key(s); return k && k.key === key; });
        const b2b       = _b2bMap.get(inv.CODE);
        const branch    = _branchMap.get(b2b?.BRANCH || inv.BRANCH);
        const isBilled  = inv.KEY_TYPE === 'INV';

        // 1. Card 1 — Invoice Header Details
        const card1Html = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 text-xs font-mono font-black rounded ${isBilled ? 'bg-slate-900 text-white' : 'bg-amber-500 text-white'}">
                        ${isBilled ? `#${_escapeHtml(inv.INV_NUMBER)}` : 'UNBILLED BATCH'}
                    </span>
                    <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full ${isBilled ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}">
                        ${isBilled ? '✓ Posted to Master Ledger' : 'Pending Invoice Generation'}
                    </span>
                </div>
                <div class="text-right">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Total Invoice Value</span>
                    <span class="text-xl font-mono font-black text-indigo-700">${_fmtMoney(inv.TOTAL)}</span>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
                <!-- Bill From -->
                <div class="p-3 bg-gray-50/70 rounded-xl border border-gray-200/80 space-y-1">
                    <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Billed By (Origin Branch)</span>
                    <div class="font-bold text-sm text-gray-900">${_escapeHtml(branch?.BRANCH_NAME || inv.BRANCH || 'POST4EX LOGISTICS')}</div>
                    <div class="text-gray-600">${_escapeHtml(branch?.BRANCH_ADDRESS || '')}, ${_escapeHtml(branch?.BRANCH_CITY || '')}</div>
                    <div class="text-gray-500">GSTIN: <strong class="font-mono text-gray-800">${_escapeHtml(branch?.BRANCH_GSTIN || 'N/A')}</strong></div>
                    <div class="text-gray-500">Phone: ${_escapeHtml(branch?.BRANCH_MOBILE || '—')}</div>
                </div>

                <!-- Bill To -->
                <div class="p-3 bg-gray-50/70 rounded-xl border border-gray-200/80 space-y-1">
                    <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Bill To (Client / Debtor)</span>
                    <div class="font-bold text-sm text-indigo-700">${_escapeHtml(b2b?.B2B_NAME || inv.CODE)}</div>
                    <div class="text-gray-600">${_escapeHtml(b2b?.B2B_ADDRESS || '')}, ${_escapeHtml(b2b?.B2B_CITY || '')} (${_escapeHtml(b2b?.B2B_STATE || '')})</div>
                    <div class="text-gray-500">GSTIN: <strong class="font-mono text-gray-800">${_escapeHtml(b2b?.ID_GST_PAN_ADHAR || 'Unregistered')}</strong></div>
                    <div class="text-gray-500">Code: <span class="font-mono font-bold text-slate-700">${_escapeHtml(inv.CODE)}</span></div>
                </div>

                <!-- Timing & Series -->
                <div class="p-3 bg-gray-50/70 rounded-xl border border-gray-200/80 space-y-1.5 font-medium">
                    <div class="flex justify-between items-center"><span class="text-gray-500">Invoice No:</span><span class="font-mono font-bold text-gray-900">${_escapeHtml(inv.INV_NUMBER || 'Not Issued')}</span></div>
                    <div class="flex justify-between items-center"><span class="text-gray-500">Invoice Date:</span><span class="font-bold text-gray-800">${inv.INVOICE_DATE ? _fmt(inv.INVOICE_DATE) : '—'}</span></div>
                    <div class="flex justify-between items-center"><span class="text-gray-500">Batch ID:</span><span class="font-mono text-gray-700">${_escapeHtml(inv.INVOICE_ID || '—')}</span></div>
                    <div class="flex justify-between items-center border-t border-gray-200 pt-1 text-[11px]"><span class="text-gray-500">Shipments:</span><span class="font-bold text-indigo-700">${shipments.length} AWBs</span></div>
                </div>
            </div>
        `;

        // 2. Card 2 — Shipments Table & Action Buttons
        const tableRows = shipments.map((s, idx) => `
            <tr class="hover:bg-gray-50 transition border-b border-gray-100">
                <td class="px-3 py-2 text-center text-gray-400 font-mono text-[11px]">${idx + 1}</td>
                <td class="px-3 py-2 whitespace-nowrap text-gray-600">${_fmt(s.ORDER_DATE)}</td>
                <td class="px-3 py-2 font-mono font-bold text-gray-900">${_escapeHtml(s.AWB_NUMBER || 'N/A')} <span class="text-gray-400 font-normal">(${_escapeHtml(s.CARRIER || '—')})</span></td>
                <td class="px-3 py-2 text-gray-600">${_escapeHtml(s.ORIGIN_CITY || 'N/A')} &rarr; ${_escapeHtml(s.DEST_CITY || 'N/A')}</td>
                <td class="px-3 py-2 text-center"><span class="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 font-bold">${_escapeHtml(s.MODE || 'SURFACE')}</span></td>
                <td class="px-3 py-2 text-center text-gray-600 font-mono">${s.PIECS || 1}</td>
                <td class="px-3 py-2 text-right font-mono text-gray-700">${(+s.CHG_WT || 0).toFixed(2)}</td>
                <td class="px-3 py-2 text-right font-mono font-bold text-indigo-700">${_fmtMoney(s.FRIGHT)}</td>
                <td class="px-2 py-2 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="VaultBilling.showShipmentCharges('${_escapeHtml(s.REFERENCE || '')}')" class="p-1 text-blue-600 rounded hover:bg-blue-50 transition" title="Charges Breakdown">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </button>
                        ${!isBilled ? `
                            <button onclick="sessionStorage.setItem('editOrderRef','${_escapeHtml(s.REFERENCE || '')}');window.open('EditOrder.html','_blank')" class="p-1 text-gray-500 rounded hover:bg-indigo-50 hover:text-indigo-600 transition" title="Edit Order ${s.AWB_NUMBER || ''}">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');

        const mobileCards = shipments.map((s, i) => `
            <div class="border border-gray-200 rounded-lg p-3 text-xs space-y-1">
                <div class="flex justify-between font-semibold text-gray-700">
                    <span class="font-mono font-bold">${i + 1}. ${_escapeHtml(s.AWB_NUMBER || 'N/A')}</span>
                    <div class="flex items-center gap-1.5">
                        <button onclick="VaultBilling.showShipmentCharges('${_escapeHtml(s.REFERENCE || '')}')" class="p-1 text-blue-600 rounded hover:bg-blue-50 transition" title="Charges Breakdown">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </button>
                        ${!isBilled ? `
                            <button onclick="sessionStorage.setItem('editOrderRef','${_escapeHtml(s.REFERENCE || '')}');window.open('EditOrder.html','_blank')" class="p-1 text-gray-500 rounded hover:bg-indigo-50 hover:text-indigo-600 transition" title="Edit Order">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                        ` : ''}
                        <span class="text-indigo-700 font-mono font-bold ml-1">${_fmtMoney(s.FRIGHT)}</span>
                    </div>
                </div>
                <div class="text-gray-500">${_fmt(s.ORDER_DATE)} &middot; ${_escapeHtml(s.CARRIER || 'N/A')} &middot; ${_escapeHtml(s.MODE || 'N/A')} &middot; ${s.PIECS || 0} pcs</div>
                <div class="text-gray-600">${_escapeHtml(s.ORIGIN_CITY || 'N/A')} &rarr; ${_escapeHtml(s.DEST_CITY || 'N/A')}</div>
                <div class="text-gray-500 font-mono">Chg Wt: ${(+s.CHG_WT || 0).toFixed(2)} kg</div>
            </div>
        `).join('');

        const card2Html = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                        <i class="fa-solid fa-boxes-stacked"></i>
                    </div>
                    <h3 class="text-sm font-bold text-gray-900">Shipments in Batch (${shipments.length})</h3>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                    ${!isBilled ? `
                        <button id="vbCloseInvBtn" class="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs font-bold flex items-center gap-1.5">
                            <i class="fa-solid fa-bolt text-xs"></i>
                            Issue Invoice to Ledger
                        </button>
                    ` : (
                        _canUnbill() ? `
                            <button id="vbUnbillInvBtn" class="btn btn-sm bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 shadow-2xs font-semibold flex items-center gap-1.5" title="Unbill and reverse invoice (2FA & Accountant+ required)">
                                <i class="fa-solid fa-shield-halved text-rose-500 text-xs"></i>
                                <i class="fa-solid fa-rotate-left text-xs"></i>
                                Unbill / Reverse Invoice
                            </button>
                        ` : ''
                    )}

                    <button id="vbPrintBtn" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs font-semibold flex items-center gap-1.5">
                        <i class="fa-solid fa-print text-xs"></i>
                        Print Tax Invoice
                    </button>
                </div>
            </div>

            <!-- Desktop Table -->
            <div class="overflow-x-auto hidden md:block">
                <table class="w-full text-xs divide-y divide-gray-200">
                    <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                        <tr>
                            <th class="px-3 py-2 text-center" style="width: 35px;">#</th>
                            <th class="px-3 py-2 text-left">Date</th>
                            <th class="px-3 py-2 text-left">AWB : Carrier</th>
                            <th class="px-3 py-2 text-left">Route</th>
                            <th class="px-3 py-2 text-center">Mode</th>
                            <th class="px-3 py-2 text-center">Pcs</th>
                            <th class="px-3 py-2 text-right">Chg Wt</th>
                            <th class="px-3 py-2 text-right">Freight</th>
                            <th class="px-2 py-2 text-center" style="width: 60px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-100">${tableRows}</tbody>
                </table>
            </div>

            <!-- Mobile Cards -->
            <div class="md:hidden space-y-2">${mobileCards}</div>
        `;

        // 3. Card 3 — Charges & Tax Summary Table
        let fright=0, fuel=0, cod=0, topay=0, fov=0, eway=0, awb=0, pack=0, dev=0,
            sgst=0, cgst=0, igst=0, taxable=0, total=0;

        shipments.forEach(s => {
            fright += +s.FRIGHT || 0;
            fuel   += +s.FUEL_CHG || 0;
            cod    += +s.COD_CHG || 0;
            topay  += +s.TOPAY_CHG || 0;
            fov    += +s.FOV_CHG || 0;
            eway   += +s.EWAY_CHG || 0;
            awb    += +s.AWB_CHG || 0;
            pack   += +s.PACK_CHG || 0;
            dev    += +s.DEV_CHG || 0;
            sgst   += +s.SGST || 0;
            cgst   += +s.CGST || 0;
            igst   += +s.IGST || 0;
            taxable+= +s.TAXABLE || 0;
            total  += +s.TOTAL || 0;
        });

        const otherCharges = fuel + cod + topay + fov + eway + awb + pack + dev;
        const totalTax = sgst + cgst + igst;
        const grandTotal = inv.TOTAL || total;

        const card3Html = `
            <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                        <i class="fa-solid fa-calculator"></i>
                    </div>
                    <h3 class="text-sm font-bold text-gray-900">Charges &amp; GST Statutory Breakdown</h3>
                </div>
                <span class="text-xs font-mono font-bold text-gray-600">SAC Code: 996812 (Courier Services)</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <!-- Breakdown Table -->
                <div class="space-y-1.5">
                    <div class="flex justify-between py-1 border-b border-gray-100">
                        <span class="text-gray-600">Courier Freight Amount</span>
                        <span class="font-mono font-bold text-gray-900">${_fmtMoney(fright)}</span>
                    </div>
                    ${otherCharges > 0 ? `
                        <div class="flex justify-between py-1 border-b border-gray-100 text-gray-600">
                            <span>Surcharges (Fuel, FOV, AWB, Dev)</span>
                            <span class="font-mono font-bold text-gray-800">${_fmtMoney(otherCharges)}</span>
                        </div>
                    ` : ''}
                    <div class="flex justify-between py-1 border-b border-gray-200 font-bold bg-gray-50/60 px-2 rounded">
                        <span class="text-gray-800">Net Taxable Turnover</span>
                        <span class="font-mono text-gray-900">${_fmtMoney(taxable)}</span>
                    </div>
                </div>

                <!-- Tax Breakdown -->
                <div class="space-y-1.5">
                    ${cgst > 0 ? `
                        <div class="flex justify-between py-1 border-b border-gray-100 text-gray-600">
                            <span>Central GST (CGST 9%)</span>
                            <span class="font-mono font-bold text-gray-800">${_fmtMoney(cgst)}</span>
                        </div>
                    ` : ''}
                    ${sgst > 0 ? `
                        <div class="flex justify-between py-1 border-b border-gray-100 text-gray-600">
                            <span>State GST (SGST 9%)</span>
                            <span class="font-mono font-bold text-gray-800">${_fmtMoney(sgst)}</span>
                        </div>
                    ` : ''}
                    ${igst > 0 ? `
                        <div class="flex justify-between py-1 border-b border-gray-100 text-gray-600">
                            <span>Integrated GST (IGST 18%)</span>
                            <span class="font-mono font-bold text-gray-800">${_fmtMoney(igst)}</span>
                        </div>
                    ` : ''}
                    <div class="flex justify-between py-1.5 border-t border-gray-300 font-black text-sm bg-indigo-50/60 px-2 rounded">
                        <span class="text-indigo-950">GRAND TOTAL</span>
                        <span class="font-mono text-indigo-700">${_fmtMoney(grandTotal)}</span>
                    </div>
                </div>
            </div>
        `;

        view.innerHTML = `
            <div class="space-y-5">
                <div id="vbInvoiceCard" class="detail-card bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
                    ${card1Html}
                </div>
                <div id="vbShipmentsCard" class="detail-card bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
                    ${card2Html}
                </div>
                <div id="vbSummaryCard" class="detail-card bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
                    ${card3Html}
                </div>
            </div>
        `;

        document.getElementById('vbPrintBtn')?.addEventListener('click', () => _print(inv, shipments, b2b, branch));
        document.getElementById('vbCloseInvBtn')?.addEventListener('click', () => _showCloseInvModal(inv, shipments));
        document.getElementById('vbUnbillInvBtn')?.addEventListener('click', () => _showUnbillModal(inv, shipments));
    }

    // ── Issue Invoice Modal (Double-Entry Ledger Bridge) ──────────────────────
    function _showCloseInvModal(inv, shipments) {
        const b2b = _b2bMap.get(inv.CODE);
        const branch = _branchMap.get(b2b?.BRANCH || inv.BRANCH);

        let tFright=0, tFuel=0, tCod=0, tTopay=0, tFov=0, tEway=0, tAwb=0, tPack=0, tDev=0,
            tSgst=0, tCgst=0, tIgst=0, tTaxable=0, tTotal=0, tPiecs=0, tChgWt=0;

        shipments.forEach(s => {
            tFright += +s.FRIGHT || 0;
            tFuel   += +s.FUEL_CHG || 0;
            tCod    += +s.COD_CHG || 0;
            tTopay  += +s.TOPAY_CHG || 0;
            tFov    += +s.FOV_CHG || 0;
            tEway   += +s.EWAY_CHG || 0;
            tAwb    += +s.AWB_CHG || 0;
            tPack   += +s.PACK_CHG || 0;
            tDev    += +s.DEV_CHG || 0;
            tSgst   += +s.SGST || 0;
            tCgst   += +s.CGST || 0;
            tIgst   += +s.IGST || 0;
            tTaxable+= +s.TAXABLE || 0;
            tTotal  += +s.TOTAL || 0;
            tPiecs  += parseInt(s.PIECS || 0);
            tChgWt  += +s.CHG_WT || 0;
        });

        const otherCharges = tFuel + tCod + tTopay + tFov + tEway + tAwb + tPack + tDev;
        const totalTax = tSgst + tCgst + tIgst;
        const grandTotal = inv.TOTAL || tTotal;
        const clientName = b2b?.B2B_NAME || inv.CODE;

        document.getElementById('vbCloseInvModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'vbCloseInvModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content space-y-4 max-w-lg">
                <!-- Header -->
                <div class="flex justify-between items-center border-b pb-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                            <i class="fa-solid fa-file-invoice text-sm"></i>
                        </div>
                        <div>
                            <h3 class="text-base font-bold text-gray-900 leading-tight">Generate Tax Invoice</h3>
                            <p class="text-xs text-gray-500 font-medium">${_escapeHtml(clientName)} &middot; <span class="font-mono text-indigo-600 font-bold">${_escapeHtml(inv.INVOICE_ID || 'N/A')}</span></p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('vbCloseInvModal').remove()" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1 leading-none" aria-label="Close">✕</button>
                </div>

                <!-- Scope Pill -->
                <div class="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80 flex items-center justify-between text-xs font-medium text-emerald-950">
                    <div>Branch: <strong class="font-bold">${_escapeHtml(branch?.BRANCH_NAME || inv.BRANCH || 'N/A')}</strong></div>
                    <div>${shipments.length} AWBs &middot; <strong class="font-bold font-mono">${tChgWt.toFixed(2)} kg</strong></div>
                </div>

                <!-- Double-Entry Preview Box -->
                <div class="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-xs">
                    <span class="block text-[10px] font-bold uppercase tracking-wider text-gray-500">Double-Entry Journal Postings Preview</span>
                    <div class="space-y-1 font-mono text-[11px]">
                        <div class="flex justify-between text-blue-700">
                            <span>Dr #1010 Accounts Receivable (${_escapeHtml(inv.CODE)})</span>
                            <span class="font-bold">${_fmtMoney(grandTotal)}</span>
                        </div>
                        <div class="flex justify-between text-emerald-700 pl-3">
                            <span>Cr #4000 Courier Freight Revenue</span>
                            <span>${_fmtMoney(tFright)}</span>
                        </div>
                        ${otherCharges > 0 ? `
                            <div class="flex justify-between text-emerald-700 pl-3">
                                <span>Cr #4010 Logistics Surcharges Income</span>
                                <span>${_fmtMoney(otherCharges)}</span>
                            </div>
                        ` : ''}
                        ${tCgst > 0 ? `
                            <div class="flex justify-between text-emerald-700 pl-3">
                                <span>Cr #2031 Output CGST (9%)</span>
                                <span>${_fmtMoney(tCgst)}</span>
                            </div>
                        ` : ''}
                        ${tSgst > 0 ? `
                            <div class="flex justify-between text-emerald-700 pl-3">
                                <span>Cr #2032 Output SGST (9%)</span>
                                <span>${_fmtMoney(tSgst)}</span>
                            </div>
                        ` : ''}
                        ${tIgst > 0 ? `
                            <div class="flex justify-between text-emerald-700 pl-3">
                                <span>Cr #2033 Output IGST (18%)</span>
                                <span>${_fmtMoney(tIgst)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Form Controls -->
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Invoice Date *</label>
                        <input id="vbCloseInvDate" type="date" class="form-input text-xs w-full">
                        <p class="text-[11px] text-gray-500 mt-1 flex items-center gap-1.5">
                            <i class="fa-solid fa-circle-check text-emerald-500 text-xs"></i>
                            Invoice number is automatically sequenced by Native Master Ledger (FY 2026-27 Series).
                        </p>
                    </div>

                    <p id="vbCloseInvErr" class="text-xs text-red-600 font-bold hidden"></p>
                </div>

                <!-- Actions -->
                <div class="flex justify-end gap-3 pt-3 border-t">
                    <button id="vbCloseInvCancel" type="button" class="btn-ghost btn-sm">Cancel</button>
                    <button id="vbCloseInvConfirm" type="button" class="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs font-bold flex items-center gap-2">
                        <i class="fa-solid fa-bolt text-xs"></i>
                        <span>Confirm &amp; Post to Ledger</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        document.getElementById('vbCloseInvDate').value = `${y}-${m}-${d}`;
        document.getElementById('vbCloseInvCancel').onclick = () => modal.remove();

        document.getElementById('vbCloseInvConfirm').onclick = async () => {
            const invDate = document.getElementById('vbCloseInvDate').value;
            const errEl   = document.getElementById('vbCloseInvErr');
            if (!invDate) {
                errEl.textContent = 'Invoice date is required.';
                errEl.classList.remove('hidden');
                return;
            }

            const btn = document.getElementById('vbCloseInvConfirm');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Posting to Ledger...</span>';

            const toMs = d => d ? new Date(d + 'T00:00:00Z').getTime() : Date.now();
            try {
                const res = await callApi('/api/issueInvoice', { invoice_id: inv.INVOICE_ID, inv_date: toMs(invDate) });
                if (res.status === 'success') {
                    modal.remove();
                    _showInvoiceBanner(res.inv_number, invDate, res.updated);
                    const fresh = await getAppData().catch(() => null);
                    if (fresh) _initData(fresh);
                } else {
                    errEl.textContent = res.detail || 'Failed to issue invoice.';
                    errEl.classList.remove('hidden');
                }
            } catch (e) {
                errEl.textContent = e.message || 'Error issuing invoice.';
                errEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-bolt text-xs"></i> <span>Confirm &amp; Post to Ledger</span>';
            }
        };
    }

    // ── Unbill / Void Invoice Modal (Section 10.4 of Ledger Implant Plan) ──────
    function _showUnbillModal(inv, shipments) {
        if (!_canUnbill()) {
            if (typeof showNotification === 'function') {
                showNotification('Access denied: Accountant+ role required to unbill invoices', 'error');
            } else {
                alert('Access denied: Accountant+ role required to unbill invoices');
            }
            return;
        }

        document.getElementById('vbUnbillModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'vbUnbillModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content space-y-4 max-w-md">
                <!-- Header -->
                <div class="flex justify-between items-center border-b pb-3">
                    <div class="flex items-center gap-2 text-rose-600">
                        <i class="fa-solid fa-triangle-exclamation text-lg"></i>
                        <h3 class="text-base font-bold text-gray-900">Unbill / Void Invoice #${_escapeHtml(inv.INV_NUMBER)}</h3>
                    </div>
                    <button onclick="document.getElementById('vbUnbillModal').remove()" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1 leading-none" aria-label="Close">✕</button>
                </div>

                <div class="text-xs text-gray-600 space-y-2">
                    <p>You are about to cancel and unbill invoice <strong>${_escapeHtml(inv.INV_NUMBER)}</strong> containing <strong>${shipments.length} order(s)</strong> amounting to <strong class="font-mono">${_fmtMoney(inv.TOTAL)}</strong>.</p>
                    
                    <!-- 2FA & Role Security Banner -->
                    <div class="p-2.5 bg-indigo-50/70 rounded-lg border border-indigo-200 text-indigo-950 flex items-center justify-between text-[11px]">
                        <div class="flex items-center gap-1.5 font-semibold text-indigo-900">
                            <i class="fa-solid fa-shield-halved text-indigo-600"></i>
                            <span>2FA Protected &amp; Accountant+ Gated</span>
                        </div>
                        <span class="text-indigo-700 font-mono font-bold text-[10px] bg-indigo-100 px-1.5 py-0.5 rounded">Security Gate</span>
                    </div>

                    <div class="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 space-y-1">
                        <div class="font-bold flex items-center gap-1.5">
                            <i class="fa-solid fa-circle-exclamation text-amber-600"></i>
                            GST Compliance &amp; Double-Entry Safety Check:
                        </div>
                        <p class="text-[11px]">
                            • If this period is locked under a filed GST return, direct unbilling is legally blocked (Credit Note required).<br>
                            • If open, a Reversal Journal (JRN) will be booked in the Master Ledger and shipments returned to the unbilled pool.
                        </p>
                    </div>
                </div>

                <p id="vbUnbillErr" class="text-xs text-red-600 font-bold hidden"></p>

                <div class="flex justify-end gap-3 pt-3 border-t">
                    <button id="vbUnbillCancel" type="button" class="btn-ghost btn-sm">Cancel</button>
                    <button id="vbUnbillConfirm" type="button" class="btn btn-sm bg-rose-600 text-white hover:bg-rose-700 shadow-xs font-bold flex items-center gap-2">
                        <i class="fa-solid fa-rotate-left text-xs"></i>
                        <span>Confirm Unbill &amp; Reverse Ledger</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.getElementById('vbUnbillCancel').onclick = () => modal.remove();

        document.getElementById('vbUnbillConfirm').onclick = async () => {
            const errEl = document.getElementById('vbUnbillErr');
            const btn = document.getElementById('vbUnbillConfirm');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Verifying 2FA &amp; Reversing...</span>';

            try {
                const res = await callApi('/api/unbillInvoice', {
                    inv_number: inv.INV_NUMBER,
                    invoice_id: inv.INVOICE_ID,
                    branch: inv.BRANCH
                });

                if (res.status === 'success') {
                    modal.remove();
                    _showUnbillSuccessBanner(inv.INV_NUMBER, res.unbilled_orders_count);
                    const fresh = await getAppData().catch(() => null);
                    if (fresh) _initData(fresh);
                } else {
                    errEl.textContent = res.detail || 'Failed to unbill invoice.';
                    errEl.classList.remove('hidden');
                }
            } catch (e) {
                if (e && (e.message === 'OTP action cancelled' || e.message === 'cancelled')) {
                    // User closed the 2FA authentication modal
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-rotate-left text-xs"></i> <span>Confirm Unbill &amp; Reverse Ledger</span>';
                    return;
                }
                errEl.textContent = e.message || 'Error unbilling invoice.';
                errEl.classList.remove('hidden');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-rotate-left text-xs"></i> <span>Confirm Unbill &amp; Reverse Ledger</span>';
                }
            }
        };
    }

    function _showInvoiceBanner(invNum, invDate, count) {
        document.getElementById('vbInvBanner')?.remove();
        const banner = document.createElement('div');
        banner.id = 'vbInvBanner';
        banner.className = 'flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-950 mb-3 shadow-xs';
        banner.innerHTML = `
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-circle-check text-emerald-600 text-base flex-shrink-0"></i>
                <span>Invoice <strong>${_escapeHtml(invNum)}</strong> successfully issued on <strong>${_escapeHtml(invDate)}</strong> &middot; ${count} order(s) posted to Master Ledger.</span>
            </div>
            <button onclick="document.getElementById('vbInvBanner').remove()" class="text-emerald-700 hover:text-emerald-900 font-bold p-1">✕</button>
        `;
        const detail = document.getElementById('vaultDetailView');
        detail?.prepend(banner);
    }

    function _showUnbillSuccessBanner(invNum, count) {
        document.getElementById('vbInvBanner')?.remove();
        const banner = document.createElement('div');
        banner.id = 'vbInvBanner';
        banner.className = 'flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 mb-3 shadow-xs';
        banner.innerHTML = `
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-circle-check text-amber-600 text-base flex-shrink-0"></i>
                <span>Invoice <strong>${_escapeHtml(invNum)}</strong> reversed &middot; ${count} order(s) returned to unbilled batch pool.</span>
            </div>
            <button onclick="document.getElementById('vbInvBanner').remove()" class="text-amber-700 hover:text-amber-900 font-bold p-1">✕</button>
        `;
        const detail = document.getElementById('vaultDetailView');
        detail?.prepend(banner);
    }

    // ── Shipment Charges & Taxes Breakdown Modal ──────────────────────────────
    function showShipmentCharges(orderOrRef) {
        let order = orderOrRef;
        if (typeof orderOrRef === 'string') {
            order = _all.find(o => String(o.REFERENCE) === String(orderOrRef) || String(o.AWB_NUMBER) === String(orderOrRef))
                 || (window.allOrders && window.allOrders.find(o => String(o.REFERENCE) === String(orderOrRef) || String(o.AWB_NUMBER) === String(orderOrRef)))
                 || {};
        }
        if (!order || (!order.REFERENCE && !order.AWB_NUMBER)) {
            if (typeof showNotification === 'function') {
                showNotification('Shipment details not found', 'error');
            } else {
                alert('Shipment details not found');
            }
            return;
        }

        const fmt = (v) => parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const gstTotal = (parseFloat(order.CGST || 0) + parseFloat(order.SGST || 0) + parseFloat(order.IGST || 0));

        const chargeItems = [
            { label: 'Freight (Base)', val: +order.FRIGHT || 0, isBase: true },
            { label: 'Fuel Surcharge', val: +order.FUEL_CHG || 0 },
            { label: 'Docket / Dev Charge', val: +order.DEV_CHG || 0 },
            { label: 'AWB Charge', val: +order.AWB_CHG || 0 },
            { label: 'Packaging Charge', val: +order.PACK_CHG || 0 },
            { label: 'COD Charge', val: +order.COD_CHG || 0 },
            { label: 'ToPay Charge', val: +order.TOPAY_CHG || 0 },
            { label: 'FOV / Insurance Charge', val: +order.FOV_CHG || 0 },
            { label: 'E-Way Bill Charge', val: +order.EWAY_CHG || 0 },
        ];

        // Filter out zero-amount items
        const nonZeroCharges = chargeItems.filter(item => Math.abs(item.val) > 0.001);

        const taxItems = [
            { label: 'CGST', val: +order.CGST || 0 },
            { label: 'SGST', val: +order.SGST || 0 },
            { label: 'IGST', val: +order.IGST || 0 },
        ].filter(item => Math.abs(item.val) > 0.001);

        let desktopRowsHtml = '';
        if (nonZeroCharges.length === 0) {
            desktopRowsHtml += `
                <tr>
                    <td colspan="2" class="border border-gray-200 px-3 py-2 text-center text-gray-400 italic">No base/handling charges applied</td>
                </tr>
            `;
        } else {
            nonZeroCharges.forEach(item => {
                desktopRowsHtml += `
                    <tr>
                        <td class="border border-gray-200 px-3 py-1.5 ${item.isBase ? 'text-gray-700 font-medium' : 'text-gray-600'}">${item.label}</td>
                        <td class="border border-gray-200 px-3 py-1.5 text-right ${item.isBase ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}">₹${fmt(item.val)}</td>
                    </tr>
                `;
            });
        }

        desktopRowsHtml += `
            <tr class="bg-gray-50 font-semibold text-gray-800 border-t border-gray-300">
                <td class="border border-gray-200 px-3 py-2">Taxable Subtotal</td>
                <td class="border border-gray-200 px-3 py-2 text-right text-gray-900">₹${fmt(order.TAXABLE)}</td>
            </tr>
        `;

        taxItems.forEach(t => {
            desktopRowsHtml += `
                <tr>
                    <td class="border border-gray-200 px-3 py-1.5 text-gray-600">${t.label}</td>
                    <td class="border border-gray-200 px-3 py-1.5 text-right font-medium text-gray-800">₹${fmt(t.val)}</td>
                </tr>
            `;
        });

        desktopRowsHtml += `
            <tr class="bg-blue-50 font-bold text-blue-900 border-t-2 border-blue-300">
                <td class="border border-gray-200 px-3 py-2 text-sm">Grand Total</td>
                <td class="border border-gray-200 px-3 py-2 text-right text-blue-700 text-sm font-bold">₹${fmt(order.TOTAL)}</td>
            </tr>
        `;

        // Desktop: Clean Financial Table View
        const desktopTable = `
            <div class="hidden md:block">
                <table class="w-full text-xs border-collapse border border-gray-200">
                    <thead>
                        <tr class="bg-gray-100/80 text-gray-700">
                            <th class="border border-gray-200 px-3 py-2 text-left font-semibold">Charge Head</th>
                            <th class="border border-gray-200 px-3 py-2 text-right font-semibold">Amount (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${desktopRowsHtml}
                    </tbody>
                </table>
            </div>
        `;

        // Mobile: Card View
        const freightItems = [
            { label: 'Freight:', val: +order.FRIGHT || 0 },
            { label: 'Fuel Charge:', val: +order.FUEL_CHG || 0 },
            { label: 'Docket / Dev:', val: +order.DEV_CHG || 0 },
            { label: 'AWB Charge:', val: +order.AWB_CHG || 0 },
            { label: 'Packaging Charge:', val: +order.PACK_CHG || 0 }
        ].filter(i => Math.abs(i.val) > 0.001);

        const vasItems = [
            { label: 'COD Charge:', val: +order.COD_CHG || 0 },
            { label: 'ToPay Charge:', val: +order.TOPAY_CHG || 0 },
            { label: 'FOV / Insurance:', val: +order.FOV_CHG || 0 },
            { label: 'E-Way Bill:', val: +order.EWAY_CHG || 0 }
        ].filter(i => Math.abs(i.val) > 0.001);

        const mobileCards = `
            <div class="md:hidden space-y-3">
                <!-- Hero Total Card -->
                <div class="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-3.5 text-white shadow-sm">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="text-[10px] uppercase tracking-wider text-blue-200 font-semibold">Grand Total</div>
                            <div class="text-2xl font-black mt-0.5">₹${fmt(order.TOTAL)}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-[10px] uppercase tracking-wider text-blue-200 font-semibold">Taxable Amount</div>
                            <div class="text-sm font-bold text-blue-100 mt-0.5">₹${fmt(order.TAXABLE)}</div>
                        </div>
                    </div>
                    ${gstTotal > 0.001 ? `
                        <div class="mt-2.5 pt-2 border-t border-white/20 flex justify-between text-xs text-blue-100 font-medium">
                            <span>GST (Taxes Total):</span>
                            <span class="font-bold">₹${fmt(gstTotal)}</span>
                        </div>
                    ` : ''}
                </div>

                ${freightItems.length > 0 ? `
                    <!-- Card 1: Freight & Handling -->
                    <div class="bg-white border border-gray-200 rounded-xl p-3 shadow-xs">
                        <div class="text-xs font-bold text-gray-700 uppercase tracking-wide border-b pb-1.5 mb-2 flex justify-between items-center">
                            <span>Freight &amp; Handling</span>
                            <span class="text-[10px] text-gray-500 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">Base</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            ${freightItems.map(item => `
                                <div class="bg-gray-50/80 p-2 rounded border border-gray-100">
                                    <span class="text-gray-500 text-[11px]">${item.label}</span>
                                    <div class="font-bold text-gray-800 mt-0.5">₹${fmt(item.val)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${vasItems.length > 0 ? `
                    <!-- Card 2: Value Added Services -->
                    <div class="bg-white border border-gray-200 rounded-xl p-3 shadow-xs">
                        <div class="text-xs font-bold text-gray-700 uppercase tracking-wide border-b pb-1.5 mb-2 flex justify-between items-center">
                            <span>Value Added Services</span>
                            <span class="text-[10px] text-gray-400 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">VAS</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            ${vasItems.map(item => `
                                <div class="bg-gray-50/80 p-2 rounded border border-gray-100">
                                    <span class="text-gray-500 text-[11px]">${item.label}</span>
                                    <div class="font-bold text-gray-800 mt-0.5">₹${fmt(item.val)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${taxItems.length > 0 ? `
                    <!-- Card 3: Taxes Breakdown -->
                    <div class="bg-white border border-gray-200 rounded-xl p-3 shadow-xs">
                        <div class="text-xs font-bold text-gray-700 uppercase tracking-wide border-b pb-1.5 mb-2 flex justify-between items-center">
                            <span>Taxes Breakdown</span>
                            <span class="text-[10px] text-gray-400 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">GST</span>
                        </div>
                        <div class="grid grid-cols-${taxItems.length > 2 ? 3 : taxItems.length} gap-2 text-xs">
                            ${taxItems.map(t => `
                                <div class="bg-gray-50/80 p-2 rounded border border-gray-100 text-center">
                                    <span class="text-gray-500 text-[11px]">${t.label}</span>
                                    <div class="font-bold text-gray-800 mt-0.5">₹${fmt(t.val)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('vbChargesModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'vbChargesModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content max-w-lg w-full space-y-4 p-4 sm:p-6 max-h-[90vh] flex flex-col">
                <div class="flex justify-between items-center border-b pb-3">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </div>
                        <div>
                            <h2 class="text-base sm:text-lg font-bold text-gray-800">Charges &amp; Taxes Breakdown</h2>
                            <p class="text-xs text-gray-500 font-mono">Ref: ${_escapeHtml(order.REFERENCE || 'N/A')}${order.AWB_NUMBER ? ' | AWB: ' + _escapeHtml(order.AWB_NUMBER) : ''}</p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('vbChargesModal').remove()" class="btn-close text-gray-400 hover:text-gray-700 p-1" aria-label="Close">✕</button>
                </div>
                <div class="flex-1 overflow-y-auto space-y-3 overscroll-contain pr-1">
                    ${desktopTable}
                    ${mobileCards}
                </div>
                <div class="flex justify-end pt-3 border-t">
                    <button onclick="document.getElementById('vbChargesModal').remove()" class="btn-ghost text-sm">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        const onEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
    }

    // ── Public Load ───────────────────────────────────────────────────────────
    async function load() {
        _isUnbilled = false;
        _currentKey = null;
        _injectUI();
        _updateToggleView();

        const data = await getAppData().catch(() => null);
        if (data) {
            _initData(data);
        } else {
            const msg = document.getElementById('vaultListMsg');
            if (msg) msg.textContent = 'Waiting for live bookings data...';
        }
    }

    window.addEventListener('appDataLoaded',    e => { if (window.VaultPage?.activeTile() === 'billing') _initData(e.detail.data); });
    window.addEventListener('appDataRefreshed', e => { if (window.VaultPage?.activeTile() === 'billing') _initData(e.detail.data); });

    return {
        load,
        openFilterModal,
        closeFilterModal,
        showShipmentCharges
    };
})();

window.VaultBilling = VaultBilling;
if (!window.showShipmentCharges) {
    window.showShipmentCharges = VaultBilling.showShipmentCharges;
}

