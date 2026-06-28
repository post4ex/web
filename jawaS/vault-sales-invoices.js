// ============================================================================
// VAULT-SALES-INVOICES.JS — Sales Invoices from IDB HEADER store
// Tile: sales-invoices
// Data source: IDB HEADER (filtered by DOX_TYPE === 'Sales Invoice')
// Detail: Manager.io API + IDB LEDGER for GL postings
// ============================================================================

const VaultSalesInvoices = (() => {

    let _allInvoices = [];

    // ── Date helpers ──────────────────────────────────────────────────────────
    const _toDateStr = (ms) => {
        if (!ms) return '';
        return fmtDate(ms, 'input');
    };

    function getCurrentFYRange() {
        const now = new Date();
        const currentYear = now.getFullYear();
        let startYear = currentYear;
        if (now.getMonth() < 3) {
            startYear = currentYear - 1;
        }
        return {
            start: `${startYear}-04-01`,
            end: `${startYear + 1}-03-31`
        };
    }

    const _fyRange = getCurrentFYRange();
    let _filterStart = _fyRange.start;
    let _filterEnd   = _fyRange.end;
    let _filterBranch = '';

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by customer, reference, description…';
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        
        const filtered = _allInvoices.filter(e => {
            // Text search
            if (q) {
                const matchSearch = (e.DOX_REF || '').toLowerCase().includes(q) ||
                                     (e.B2B || '').toLowerCase().includes(q) ||
                                     (e.DOX_DESCRIPTION || '').toLowerCase().includes(q) ||
                                     (e.BRANCH || '').toLowerCase().includes(q);
                if (!matchSearch) return false;
            }
            // Date range (FY/Filterform range)
            const d = _toDateStr(e.DOX_DATE);
            if (_filterStart && d < _filterStart) return false;
            if (_filterEnd && d > _filterEnd) return false;
            // Branch
            if (_filterBranch && (e.BRANCH || '').toLowerCase() !== _filterBranch.toLowerCase()) return false;
            
            return true;
        });

        filtered.sort((a, b) => {
            const tsA = a.DOX_DATE || 0;
            const tsB = b.DOX_DATE || 0;
            if (tsA !== tsB) return tsB - tsA;
            return (b.DOX_REF || '').localeCompare(a.DOX_REF || '');
        });

        // Update status label
        const statusEl = document.getElementById('siStatus');
        if (statusEl) {
            statusEl.textContent = `Showing ${filtered.length} of ${_allInvoices.length} Invoices`;
        }

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No matching invoices found.</li>`;
            return;
        }
        ul.innerHTML = filtered.map(e => {
            const dateStr = _toDateStr(e.DOX_DATE);
            const amount = parseFloat(e.AMOUNT || 0);
            return `<li data-key="${e.DOX_KEY}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <strong class="text-indigo-700 block text-sm">${e.DOX_REF || 'N/A'} — ${e.B2B || 'N/A'}</strong>
                <span class="text-xs text-gray-500">₹${amount.toFixed(2)} · ${dateStr || 'N/A'} · ${e.BRANCH || ''}</span>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(_allInvoices.find(inv => inv.DOX_KEY === li.dataset.key));
            })
        );
    }

    function search() {
        _renderList();
    }

    // ── Invoice delete ─────────────────────────────────────────────────
    async function _handleDelete(invoiceKey, branchCode) {
        if (!invoiceKey || !branchCode) {
            alert('Cannot delete: missing invoice key or branch.');
            return;
        }
        if (!confirm('Delete this invoice from Manager.io permanently?\n\nThis action cannot be undone.')) return;
        window.setLoading?.(true, 'Deleting invoice...', 'detail');
        try {
            // Resolve client code from branch
            const appData = await getAppData();
            let clientCode = '';
            if (appData?.B2B) {
                Object.values(appData.B2B).forEach(c => {
                    if ((c.BRANCH || '').toLowerCase() === (branchCode || '').toLowerCase()) {
                        clientCode = c.CODE;
                    }
                });
            }
            if (!clientCode) {
                alert(`Cannot resolve client code for branch "${branchCode}".`);
                return;
            }

            await callApi(`/api/manager/invoices/${invoiceKey}?code=${encodeURIComponent(clientCode)}`, {}, 'DELETE');
            await load();
        } catch (err) {
            alert('Failed to delete invoice: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    function _numToWords(n) {
        const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
        const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
        n=Math.round(n); if(!n) return 'Zero';
        if(n<20) return a[n]; if(n<100) return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');
        if(n<1000) return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+_numToWords(n%100):'');
        if(n<100000) return _numToWords(Math.floor(n/1000))+' Thousand'+(n%1000?' '+_numToWords(n%1000):'');
        if(n<10000000) return _numToWords(Math.floor(n/100000))+' Lakh'+(n%100000?' '+_numToWords(n%100000):'');
        return _numToWords(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+_numToWords(n%10000000):'');
    }

        async function _printEntry(invoiceKey, branchCode) {
        if (!invoiceKey || !branchCode) return;
        window.setLoading?.(true, 'Preparing print...', 'detail');
        try {
            const [res, appData] = await Promise.all([
                callApi(`/api/manager/invoice-details/${branchCode}/${invoiceKey}`, {}, 'GET'),
                getAppData()
            ]);

            const inv = _allInvoices.find(i => i.DOX_KEY === invoiceKey);

            const ref = res.Reference || inv?.DOX_REF || invoiceKey;
            const issueDate = res.IssueDate || _toDateStr(inv?.DOX_DATE) || '';
            const customerCode = inv?.B2B || '';
            const description = res.Description || '';

            // Resolve client code from branch
            let clientCode = '';
            if (appData?.B2B) {
                Object.values(appData.B2B).forEach(c => {
                    if ((c.BRANCH || '').toLowerCase() === (branchCode || '').toLowerCase()) {
                        clientCode = c.CODE;
                    }
                });
            }

            let b2bName = customerCode;
            let b2bAddr = '';
            let b2bState = '';
            let b2bGst = 'N/A';

            if (res.Customer && clientCode) {
                try {
                    const cust = await callApi(`/api/manager/customers/${res.Customer}?code=${encodeURIComponent(clientCode)}`, {}, 'GET');
                    if (cust) {
                        b2bName = cust.Name || b2bName;
                        b2bAddr = cust.BillingAddress || '';
                        if (cust.CustomFields) {
                            b2bGst = cust.CustomFields["37a9097b-398e-4227-bd32-f483ddc4ea3a"] || 'N/A';
                            b2bState = cust.CustomFields["48d27da1-05e8-4a61-b0ff-800e6e979584"] || '';
                            if (b2bState && b2bState.includes('-')) {
                                b2bState = b2bState.split('-')[1];
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch customer details for print:", err);
                }
            }

            let branch = null;
            if (appData?.BRANCHES) {
                Object.values(appData.BRANCHES).forEach(b => {
                    if ((b.BRANCH_CODE || '').toLowerCase() === (branchCode || '').toLowerCase()) {
                        branch = b;
                    }
                });
            }
            const branchName = branch?.BRANCH_NAME || branchCode.toUpperCase();
            const branchAddr = branch?.BRANCH_ADDRESS || '';
            const branchCity = branch?.BRANCH_CITY || 'local';
            const branchState = branch?.BRANCH_STATE || '';
            const branchMobile = branch?.BRANCH_MOBILE || '';
            const branchEmail = branch?.BRANCH_EMAIL || '';
            const branchPan = branch?.BRANCH_PAN || '';
            const branchGstin = branch?.BRANCH_GSTIN || '';
            const branchUpi = branch?.BRANCH_UPI || '';
            const branchUpiName = branch?.BRANCH_UPI_NAME || branchName;

            // Build line items from Manager.io detail
            const lines = res.Lines || [];
            let taxableSubtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
            const linesHtml = lines.map((line, i) => {
                const desc = line.LineDescription || '';
                const qty = line.Qty || 1;
                const price = line.SalesUnitPrice || 0;
                const lineAmt = qty * price;
                taxableSubtotal += lineAmt;
                if (line.TaxCode === 'c9228485-7a58-4ccb-89e8-fe025e20261d') {
                    totalCgst += lineAmt * 0.09;
                    totalSgst += lineAmt * 0.09;
                } else if (line.TaxCode === '16e26b59-06ca-49ab-ba1c-a2c36711683e') {
                    totalIgst += lineAmt * 0.18;
                }
                return `<tr><td class="tc">${i+1}</td><td>${_escapeHtml(desc)}</td><td class="tr">${qty}</td><td class="tr">₹${price.toFixed(2)}</td><td class="tr">₹${lineAmt.toFixed(2)}</td></tr>`;
            }).join('');

            totalCgst = Math.round(totalCgst * 100) / 100;
            totalSgst = Math.round(totalSgst * 100) / 100;
            totalIgst = Math.round(totalIgst * 100) / 100;
            const grandTotal = taxableSubtotal + totalCgst + totalSgst + totalIgst;

            // Build charges table
            const chargeRows = [
                `<tr><td>Taxable Subtotal</td><td class="tr">₹${taxableSubtotal.toFixed(2)}</td></tr>`,
                ...(totalCgst > 0 ? [`<tr><td>CGST @ 9%</td><td class="tr">₹${totalCgst.toFixed(2)}</td></tr>`] : []),
                ...(totalSgst > 0 ? [`<tr><td>SGST @ 9%</td><td class="tr">₹${totalSgst.toFixed(2)}</td></tr>`] : []),
                ...(totalIgst > 0 ? [`<tr><td>IGST @ 18%</td><td class="tr">₹${totalIgst.toFixed(2)}</td></tr>`] : []),
            ].join('');

            const qrUrl = branchUpi
                ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=upi://pay?pa=${encodeURIComponent(branchUpi)}%26pn=${encodeURIComponent(branchUpiName)}%26am=${grandTotal.toFixed(2)}%26cu=INR%26tn=${encodeURIComponent('INV-'+ref)}`
                : '';

            const terms = [
                'All disputes subject to ' + branchCity + ' Jurisdiction.',
                'Payment due on receipt.',
                'Computer-generated bill; no signature required.',
                'SAC Code 996812 (Courier Services).'
            ];

            const css = `
                body{font-family:Arial,sans-serif;font-size:13px;color:#000;margin:0;padding:20px;background:#f5f5f5}
                .box{max-width:800px;margin:auto;background:#fff;padding:30px;border:1px solid #eee;box-shadow:0 0 10px rgba(0,0,0,.15)}
                .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:15px;margin-bottom:20px}
                .tr{text-align:right}.tc{text-align:center}
                .info{display:flex;justify-content:space-between;margin-bottom:20px;gap:20px}
                .col{width:48%}.col h3{margin:0 0 5px;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px}.col p{margin:2px 0;font-size:12px}
                .div{width:1px;background:#ccc}.divb{height:2px;background:#000;margin-bottom:20px}
                .meta{margin-bottom:20px;font-weight:bold;text-align:center}
                table{width:100%;border-collapse:collapse;margin-bottom:20px}table,th,td{border:1px solid #000}th,td{padding:6px;text-align:left}th{background:#f2f2f2}
                .tot{display:flex;justify-content:space-between;margin-bottom:20px;page-break-inside:avoid}
                .chg{width:55%}.chg table{margin-bottom:0}.chg th,.chg td{padding:4px 6px}
                .pay{width:40%}
                .terms{font-size:11px;margin-bottom:40px}.terms ol{margin:5px 0 0;padding-left:20px}
                .sig{text-align:right;font-weight:bold;margin-top:20px}.sigbox{display:inline-block;text-align:center;min-width:200px}
                @media print{@page{size:A4;margin:10mm}body{background:#fff;padding:0}.box{box-shadow:none;border:none}}
            `;

            const b2bAddrHtml = b2bAddr ? b2bAddr.replace(/\n/g, '<br>') : '';

            const body = `
                <div class="box">
                    <div class="hdr">
                        <div style="font-size:26px;font-weight:bold;text-transform:uppercase">Tax Invoice</div>
                        <div style="text-align:right;font-size:12px">
                            <b>Invoice No:</b> ${_escapeHtml(ref)}<br>
                            <b>Invoice Date:</b> ${issueDate.split('T')[0] || issueDate}
                        </div>
                    </div>

                    <div class="info">
                        <div class="col">
                            <h3>Billed By: ${_escapeHtml(branchName)}</h3>
                            <p><b>Address:</b> ${_escapeHtml(branchAddr)}</p>
                            <p><b>City:</b> ${_escapeHtml(branchCity)}, ${_escapeHtml(branchState)}</p>
                            <p><b>Phone:</b> ${_escapeHtml(branchMobile)}</p>
                            <p><b>Email:</b> ${_escapeHtml(branchEmail)}</p>
                            ${branchPan ? `<p><b>PAN/GST:</b> ${_escapeHtml(branchPan)} / ${_escapeHtml(branchGstin)}</p>` : ''}
                        </div>
                        <div class="div"></div>
                        <div class="col">
                            <h3>Bill To: ${_escapeHtml(b2bName)}</h3>
                            <p>${b2bAddrHtml}</p>
                            ${b2bState ? `<p><b>State:</b> ${_escapeHtml(b2bState)}</p>` : ''}
                            <p><b>GST:</b> ${_escapeHtml(b2bGst)}</p>
                        </div>
                    </div>

                    <div class="divb"></div>
                    ${description ? `<div class="meta"><p>${_escapeHtml(description)}</p></div>` : ''}

                    ${lines.length ? `
                    <table>
                        <thead><tr><th class="tc">Sr</th><th>Description</th><th class="tr">Qty</th><th class="tr">Unit Price</th><th class="tr">Amount</th></tr></thead>
                        <tbody>${linesHtml}</tbody>
                    </table>
                    ` : ''}

                    <div class="tot">
                        <div class="pay">
                            <p><b>Amount in words:</b><br>Rupees ${_numToWords(Math.round(grandTotal))} Only</p>
                            ${qrUrl ? `<p><b>Pay via UPI:</b></p><img src="${qrUrl}" style="width:120px;height:120px;margin:10px 0;border:1px solid #ddd"><p>Name: ${_escapeHtml(branchUpiName)}<br>UPI ID: ${_escapeHtml(branchUpi)}<br><b>Note:</b> INV-${_escapeHtml(ref)}</p>` : ''}
                        </div>
                        <div class="chg">
                            <table>
                                <thead><tr><th>Charge</th><th class="tr">Amount</th></tr></thead>
                                <tbody>${chargeRows}<tr style="font-weight:bold"><td>Total Amount</td><td class="tr">${grandTotal.toFixed(2)}</td></tr></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="terms">
                        <b>Terms &amp; Conditions:</b>
                        <ol>${terms.map(t => `<li>${_escapeHtml(t)}</li>`).join('')}</ol>
                    </div>

                    <div class="sig">
                        <div class="sigbox">
                            <p style="margin-bottom:40px">Authorized Signatory</p>
                            <p>for ${_escapeHtml(branchName)}</p>
                        </div>
                    </div>
                </div>
                <script>
                    function startPrint() {
                        window.print();
                        window.close();
                    }
                    if (document.readyState === 'complete') {
                        setTimeout(startPrint, 300);
                    } else {
                        window.addEventListener('load', () => setTimeout(startPrint, 300));
                    }
                </script>
            `;

            const w = window.open('', 'Sales_Invoice_' + ref.replace(/[^a-zA-Z0-9]/g, '_'));
            if (!w) { alert('Pop-up blocked! Please allow pop-ups.'); return; }
            w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tax Invoice - ' + _escapeHtml(ref) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>');
            w.document.close();
        } catch (err) {
            alert('Failed to print: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Edit via Manager.io PUT ──────────────────────────────────────────────
        async function _openEditPaneFromDetail(invoiceKey, branchCode, evt) {
        const btn = evt?.target?.closest('button');
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '...'; }
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-gray-400 text-sm">Loading invoice form data…</div></div>`;
        VaultPage.showDetailPane();

        try {
            // Fetch the full invoice form from Manager.io
            const res = await callApi(`/api/manager/invoice-details/${branchCode}/${invoiceKey}`, {}, 'GET');

            // Determine client code from branch
            const appData = await getAppData();
            let clientCode = '';
            if (appData?.B2B) {
                Object.values(appData.B2B).forEach(c => {
                    if ((c.BRANCH || '').toLowerCase() === (branchCode || '').toLowerCase()) {
                        clientCode = c.CODE;
                    }
                });
            }

            // Ensure cache keys are loaded
            if (!window.__vaultCacheKeys) {
                try {
                    window.__vaultCacheKeys = await callApi('/api/manager/cache/keys', {}, 'GET');
                } catch (err) {
                    console.error("Failed to load cache keys:", err);
                    window.__vaultCacheKeys = {};
                }
            }

            // Build reverse UUID → name maps from cache keys for pre-filling dropdowns
            const _bKey = (branchCode || '').toLowerCase();
            const _bKeys = window.__vaultCacheKeys?.[_bKey] || {};
            const _itemUuidToName = {};
            const _tcUuidToName = {};
            Object.entries(_bKeys.non_inventory_items || {}).forEach(([name, uuid]) => { _itemUuidToName[uuid] = name; });
            Object.entries(_bKeys.tax_codes || {}).forEach(([name, uuid]) => { _tcUuidToName[uuid] = name; });

            const existingRef = res.Reference || res.reference || '';
            const existingCustomer = res.Customer || res.customer || '';
            const existingDate = res.IssueDate || res.issueDate || '';
            const existingDesc = res.Description || res.description || '';
            const existingDueDays = res.DueDateDays || res.dueDateDays || 20;
            const existingLines = res.Lines || res.lines || [];
            
            // Extract document-level fields from existing record
            const existingHasCustomTitle = res.HasSalesInvoiceCustomTitle !== false;
            const existingCustomTitle = res.SalesInvoiceCustomTitle || 'Tax Invoice';
            const existingDiscountRate = res.EarlyPaymentDiscountRate !== undefined && res.EarlyPaymentDiscountRate !== null ? res.EarlyPaymentDiscountRate : '';
            const existingLateFees = res.LatePaymentFees === true;

            // ── GST period guard: block edit if period already filed (Disabled) ──
            let _gstBlocked = false;
            let _gstPeriod = '';

            function _getBranchDropdowns(brCode) {
                const bKey = (brCode || '').toLowerCase();
                const bKeys = window.__vaultCacheKeys?.[bKey] || {};
                const itemNames = Object.keys(bKeys.non_inventory_items || {}).sort();
                const taxCodeNames = Object.keys(bKeys.tax_codes || {}).sort();
                const itemOpts = `<option value="">— Select item —</option>` +
                    itemNames.map(n => `<option value="${n}">${_titleCase(n)}</option>`).join('');
                const tcOpts = `<option value="">No Tax</option>` +
                    taxCodeNames.map(n => `<option value="${n}">${_titleCase(n)}</option>`).join('');
                return { itemOpts, tcOpts, itemNames, taxCodeNames };
            }

            let currentOpts = _getBranchDropdowns(branchCode);

            // Populate customer options from cache keys (names to UUIDs)
            const customersList = Object.entries(_bKeys.customers || {}).sort((a, b) => a[0].localeCompare(b[0]));
            const customerOpts = `<option value="">— Select Customer —</option>` +
                customersList.map(([name, uuid]) => {
                    const selected = uuid === existingCustomer ? 'selected' : '';
                    return `<option value="${uuid}" ${selected}>${_escapeHtml(name)}</option>`;
                }).join('');

            view.innerHTML = `
                <div class="detail-card rounded-2xl border border-slate-100 shadow-sm bg-white overflow-hidden">
                    <div class="h-1.5 bg-gradient-to-r from-amber-400 via-indigo-500 to-purple-500"></div>
                    <div class="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-650 shadow-sm">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-800 text-lg tracking-tight">Edit Invoice</h3>
                                <p class="text-xs text-slate-400">Update Sales Invoice — ${existingRef || invoiceKey}</p>
                            </div>
                        </div>
                    </div>
                    <div class="detail-card-body p-6 space-y-6">
                        <div class="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-850/95 flex items-start gap-2.5 shadow-sm">
                            <svg class="w-4 h-4 shrink-0 text-amber-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                            <div>
                                <span class="font-bold">Notice:</span> Editing this invoice will update its values in Manager.io. The reference number <strong>${existingRef}</strong> is locked and will be preserved automatically.
                            </div>
                        </div>
                        ${_gstBlocked ? `
                        <div class="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3.5 text-xs space-y-1.5 shadow-sm">
                            <div class="flex items-center gap-2 font-bold text-red-900">
                                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                                GST Period Filed — Edit Blocked
                            </div>
                            <p>This invoice's period <strong>${_gstPeriod}</strong> has already been filed as <strong>GSTR1</strong> for branch <strong>${branchCode.toUpperCase()}</strong>.</p>
                            <p>Editing invoices in filed periods is restricted. If you need to make changes, please manage this invoice directly in Manager.io or contact your accounts team.</p>
                        </div>
                        ` : ''}
                        <form id="sieForm" class="space-y-6">
                            <input type="hidden" name="invoice_key" value="${invoiceKey}">
                            
                            <!-- Header: Customer, Date, Due Days -->
                            <div class="bg-slate-50/50 p-4 rounded-xl border border-slate-100/80 grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div class="md:col-span-2">
                                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Customer *</label>
                                    <select name="customer" id="sieCustomer" required class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                                        ${customerOpts}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Invoice Date *</label>
                                    <input name="inv_date" type="date" required class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" value="${existingDate.split('T')[0] || existingDate}">
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Due Days</label>
                                    <input name="due_days" type="number" min="0" class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" value="${existingDueDays}">
                                </div>
                            </div>

                            <!-- Line Items -->
                            <div class="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
                                <div class="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-100">
                                    <span class="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                                        Line Items
                                    </span>
                                    <button type="button" id="sieAddLine"
                                        class="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 bg-white border border-indigo-150/70 px-3 py-1.5 rounded-lg shadow-sm hover:shadow">
                                        ➕ Add Line
                                    </button>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm divide-y divide-slate-100" id="sieLinesTable">
                                        <thead class="bg-slate-50/50">
                                            <tr class="text-xs font-bold text-slate-400 uppercase tracking-wider text-left border-b">
                                                <th class="py-3 px-4" style="min-width:180px">Item</th>
                                                <th class="py-3 px-4" style="min-width:200px">Description</th>
                                                <th class="py-3 px-4 text-right" style="min-width:70px">Qty</th>
                                                <th class="py-3 px-4 text-right" style="min-width:100px">Unit Price</th>
                                                <th class="py-3 px-4" style="min-width:150px">Tax Code</th>
                                                <th class="py-3 px-4 text-right" style="min-width:100px">Amount</th>
                                                <th class="py-3 px-4 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="sieLineRows" class="divide-y divide-slate-100"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Advanced Document Options -->
                            <div class="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white mt-4">
                                <div class="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                    <span class="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                        Advanced & Document Options
                                    </span>
                                </div>
                                <div class="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                    <div>
                                        <label class="flex items-center gap-2 font-semibold text-slate-650 mb-1.5 cursor-pointer">
                                            <input type="checkbox" name="has_custom_title" id="sieHasCustomTitle" class="rounded text-indigo-600 focus:ring-indigo-500/20" ${existingHasCustomTitle ? 'checked' : ''}>
                                            <span>Custom Invoice Title</span>
                                        </label>
                                        <input type="text" name="custom_title" id="sieCustomTitle" value="${_escapeHtml(existingCustomTitle)}" class="form-input text-sm rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full" placeholder="e.g. Tax Invoice">
                                    </div>
                                    <div>
                                        <label class="block font-semibold text-slate-650 mb-1.5">Early Payment Discount (%)</label>
                                        <input type="number" name="discount_rate" id="sieDiscountRate" min="0" max="100" step="any" class="form-input text-sm rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full" placeholder="Optional" value="${existingDiscountRate}">
                                    </div>
                                    <div class="flex items-center pt-5">
                                        <label class="flex items-center gap-2 font-semibold text-slate-650 cursor-pointer">
                                            <input type="checkbox" name="late_fees" id="sieLateFees" class="rounded text-indigo-600 focus:ring-indigo-500/20" ${existingLateFees ? 'checked' : ''}>
                                            <span>Apply Late Payment Fees</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <!-- Narration + Totals -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                                <!-- Narration -->
                                <div class="md:col-span-2 space-y-1.5">
                                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500">Narration / Description</label>
                                    <textarea name="narration" rows="3" class="form-input text-sm rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full" placeholder="Enter invoice notes or narration (optional)">${_escapeHtml(existingDesc)}</textarea>
                                </div>

                                <!-- Totals Box -->
                                <div class="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-4 border border-slate-150/60 space-y-3 text-sm flex flex-col justify-between" id="sieTotals">
                                    <div class="space-y-2">
                                        <div class="flex justify-between text-slate-500 font-medium">
                                            <span>Subtotal</span>
                                            <span id="sie_subtotal" class="font-bold text-slate-700">₹0.00</span>
                                        </div>
                                        <div class="flex justify-between text-slate-500 font-medium" id="sie_sgst_row">
                                            <span>SGST</span>
                                            <span id="sie_sgst_val" class="font-bold text-slate-700">₹0.00</span>
                                        </div>
                                        <div class="flex justify-between text-slate-500 font-medium" id="sie_cgst_row">
                                            <span>CGST</span>
                                            <span id="sie_cgst_val" class="font-bold text-slate-700">₹0.00</span>
                                        </div>
                                        <div class="flex justify-between text-slate-500 font-medium hidden" id="sie_igst_row">
                                            <span>IGST</span>
                                            <span id="sie_igst_val" class="font-bold text-slate-700">₹0.00</span>
                                        </div>
                                    </div>
                                    <div class="border-t border-slate-200 pt-3 flex justify-between items-center font-bold text-slate-800">
                                        <span class="text-xs uppercase tracking-wider text-slate-400">Grand Total</span>
                                        <span id="sie_grand_total" class="text-indigo-650 text-lg font-black tracking-tight">₹0.00</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Submit Bar -->
                            <div class="flex items-center justify-between pt-4 border-t border-slate-100">
                                <div id="sieResponse" class="hidden text-sm"></div>
                                <div class="flex gap-3 ml-auto">
                                    <button type="button" id="sieCancelBtn" class="btn btn-sm btn-ghost px-4 py-2 text-slate-500 font-semibold hover:bg-slate-50 rounded-lg">Cancel</button>
                                    <button type="submit" id="sieSubmitBtn" class="btn btn-sm bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2" ${_gstBlocked ? 'disabled' : ''}>
                                        <span id="sieBtnText">${_gstBlocked ? 'Edit Blocked' : 'Update Invoice'}</span>
                                        <div id="sieSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>`;

            // Handle custom title toggle
            const hasCustomTitleEl = document.getElementById('sieHasCustomTitle');
            const customTitleEl = document.getElementById('sieCustomTitle');
            function _toggleCustomTitle() {
                customTitleEl.disabled = !hasCustomTitleEl.checked;
                customTitleEl.classList.toggle('bg-slate-100', !hasCustomTitleEl.checked);
            }
            hasCustomTitleEl.addEventListener('change', _toggleCustomTitle);
            _toggleCustomTitle();

            // ── Line management ──
            let _lineCount = 0;

            function _addLine(defaultItem = '', defaultDesc = '', defaultQty = 1, defaultPrice = 0, defaultTc = '') {
                const idx = _lineCount++;
                const tr = document.createElement('tr');
                tr.id = `sieLine_${idx}`;
                tr.className = 'border-t border-slate-100';
                tr.innerHTML = `
                    <td class="py-2.5 px-4">
                        <select class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sie-item w-full" data-idx="${idx}">${currentOpts.itemOpts}</select>
                    </td>
                    <td class="py-2.5 px-4">
                        <input type="text" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sie-desc w-full" placeholder="Description" value="${_escapeHtml(defaultDesc)}">
                    </td>
                    <td class="py-2.5 px-4">
                        <input type="number" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sie-qty text-right w-full" value="${defaultQty}" min="0.001" step="any">
                    </td>
                    <td class="py-2.5 px-4">
                        <input type="number" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sie-price text-right w-full" value="${defaultPrice}" min="0" step="0.01">
                    </td>
                    <td class="py-2.5 px-4">
                        <select class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sie-tc w-full">${currentOpts.tcOpts}</select>
                    </td>
                    <td class="py-2.5 px-4 text-right font-semibold text-slate-700">
                        <span class="sie-amt text-xs">₹0.00</span>
                    </td>
                    <td class="py-2.5 px-4 text-center">
                        <button type="button" class="sie-remove text-slate-350 hover:text-red-500 transition-colors" title="Remove line">
                            <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </td>`;
                document.getElementById('sieLineRows').appendChild(tr);

                if (defaultItem) tr.querySelector('.sie-item').value = defaultItem;
                if (defaultTc) tr.querySelector('.sie-tc').value = defaultTc;

                tr.querySelector('.sie-item').addEventListener('change', function() {
                    const descEl = tr.querySelector('.sie-desc');
                    if (!descEl.value) descEl.value = _titleCase(this.value);
                    _calcTotals();
                });
                tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', _calcTotals));
                tr.querySelector('.sie-remove').addEventListener('click', () => { tr.remove(); _calcTotals(); });
                _calcTotals();
            }

            function _calcTotals() {
                let subtotal = 0, sgst = 0, cgst = 0, igst = 0;
                document.querySelectorAll('#sieLineRows tr').forEach(tr => {
                    const qty = parseFloat(tr.querySelector('.sie-qty')?.value || 0);
                    const price = parseFloat(tr.querySelector('.sie-price')?.value || 0);
                    const tc = (tr.querySelector('.sie-tc')?.value || '').toUpperCase();
                    const lineAmt = qty * price;
                    subtotal += lineAmt;
                    tr.querySelector('.sie-amt').textContent = '₹' + lineAmt.toFixed(2);
                    if (tc.includes('IGST')) {
                        igst += lineAmt * _parseTaxRate(tr.querySelector('.sie-tc').value) / 100;
                    } else if (tc && tc !== '') {
                        const rate = _parseTaxRate(tr.querySelector('.sie-tc').value);
                        sgst += lineAmt * rate / 200;
                        cgst += lineAmt * rate / 200;
                    }
                });
                const grandTotal = subtotal + sgst + cgst + igst;
                document.getElementById('sie_subtotal').textContent = '₹' + subtotal.toFixed(2);
                document.getElementById('sie_sgst_val').textContent = '₹' + sgst.toFixed(2);
                document.getElementById('sie_cgst_val').textContent = '₹' + cgst.toFixed(2);
                document.getElementById('sie_igst_val').textContent = '₹' + igst.toFixed(2);
                document.getElementById('sie_grand_total').textContent = '₹' + grandTotal.toFixed(2);
                document.getElementById('sie_sgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
                document.getElementById('sie_cgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
                document.getElementById('sie_igst_row').classList.toggle('hidden', igst === 0);
            }

            // Populate existing lines (convert UUIDs back to friendly names for dropdown matching)
            if (existingLines.length) {
                existingLines.forEach(ln => {
                    const itemUuid = ln.Item || '';
                    const itemName = _itemUuidToName[itemUuid] || itemUuid;
                    const desc = ln.LineDescription || ln.lineDescription || '';
                    const qty = ln.Qty || ln.qty || 1;
                    const price = ln.SalesUnitPrice || ln.salesUnitPrice || 0;
                    const tcUuid = ln.TaxCode || ln.taxCode || '';
                    const tcName = _tcUuidToName[tcUuid] || tcUuid;
                    _addLine(itemName, desc, qty, price, tcName);
                });
            } else {
                _addLine();
            }

            document.getElementById('sieAddLine').addEventListener('click', () => _addLine());

            // Bind cancel event listener
            document.getElementById('sieCancelBtn').addEventListener('click', () => {
                _renderDetail({ DOX_KEY: invoiceKey, BRANCH: branchCode });
            });

            // ── Submit ──
            document.getElementById('sieForm').addEventListener('submit', async e => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const raw = Object.fromEntries(fd);
                const btn = document.getElementById('sieSubmitBtn');
                const sp = document.getElementById('sieSpinner');
                const resp = document.getElementById('sieResponse');
                btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
                window.setLoading?.(true, 'Updating invoice...', 'detail');

                try {
                    const customerUuid = raw.customer;
                    const appData = await getAppData();
                    let clientCode = '';
                    if (appData?.B2B) {
                        Object.values(appData.B2B).forEach(c => {
                            if ((c.BRANCH || '').toLowerCase() === (branchCode || '').toLowerCase()) {
                                clientCode = c.CODE;
                            }
                        });
                    }
                    if (!clientCode) {
                        throw new Error(`Cannot resolve manager client code for branch "${branchCode}".`);
                    }

                    const lines = [];
                    document.querySelectorAll('#sieLineRows tr').forEach(tr => {
                        const item = tr.querySelector('.sie-item')?.value || '';
                        const desc = tr.querySelector('.sie-desc')?.value || '';
                        const qty = parseFloat(tr.querySelector('.sie-qty')?.value || 1);
                        const price = parseFloat(tr.querySelector('.sie-price')?.value || 0);
                        const tc = tr.querySelector('.sie-tc')?.value || '';
                        if (price > 0 || item) {
                            lines.push({
                                Item: item || undefined,
                                LineDescription: desc || undefined,
                                Qty: qty,
                                SalesUnitPrice: price,
                                TaxCode: tc || undefined,
                            });
                        }
                    });
                    if (!lines.length) throw new Error('Add at least one line item with a price.');

                    const payload = {
                        IssueDate: raw.inv_date,
                        DueDateDays: parseInt(raw.due_days) || 20,
                        Reference: existingRef || undefined,
                        Customer: customerUuid,
                        Description: raw.narration || undefined,
                        Lines: lines,
                        TaxCodeEnabled: true,
                        HasLineNumber: true,
                        Rounding: true,
                        HasSalesInvoiceCustomTitle: document.getElementById('sieHasCustomTitle').checked,
                        SalesInvoiceCustomTitle: document.getElementById('sieHasCustomTitle').checked ? document.getElementById('sieCustomTitle').value.trim() || "Tax Invoice" : undefined,
                        EarlyPaymentDiscountRate: raw.discount_rate ? parseFloat(raw.discount_rate) : undefined,
                        LatePaymentFees: document.getElementById('sieLateFees').checked,
                    };

                    const url = `/api/manager/invoices/${raw.invoice_key}?code=${encodeURIComponent(clientCode)}`;
                    const result = await callApi(url, payload, 'PUT');
                    const refNum = result.Reference || result.reference || 'updated';
                    resp.className = 'mt-2 text-sm bg-green-150 text-green-800 px-3 py-2 rounded-xl';
                    resp.textContent = `✅ Invoice ${refNum} updated in Manager.io!`;
                    resp.classList.remove('hidden');
                    await load();
                } catch (err) {
                    resp.className = 'mt-2 text-sm bg-red-150 text-red-800 px-3 py-2 rounded-xl';
                    resp.textContent = '❌ ' + (err.message || 'Failed');
                    resp.classList.remove('hidden');
                } finally {
                    window.setLoading?.(false);
                    btn.disabled = false; sp.classList.add('hidden');
                }
            });

            VaultPage.showDetailPane();
        } catch (err) {
            view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-red-600"><p class="text-sm">Failed to load: ${err.message || err}</p></div></div>`;
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
        }
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Detail pane (with charge breakdown) ────────────────────────────────────
        async function _renderDetail(listEntry) {
        if (!listEntry) return;
        
        const invoiceKey = listEntry.DOX_KEY || listEntry.key;
        const branchCode = listEntry.BRANCH || listEntry.branch;

        if (!invoiceKey) {
            VaultPage.showDetail(true);
            const view = document.getElementById('vaultDetailView');
            view.innerHTML = `<div class="detail-card">
                <div class="detail-card-body text-center py-8 text-red-600">
                    <p class="text-sm font-semibold">Cannot view details: Manager.io key not found.</p>
                </div>
            </div>`;
            return;
        }

        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `<div class="detail-card-body text-center py-8">
            <p class="text-gray-500 text-sm">Fetching invoice details from Manager.io...</p>
        </div>`;
        VaultPage.showDetailPane();
        window.setLoading?.(true, 'Fetching invoice details...', 'detail');
        
        try {
            const res = await callApi(`/api/manager/invoice-details/${branchCode}/${invoiceKey}`, {}, 'GET');
            
            let totalTaxable = 0;
            let totalCgst = 0;
            let totalSgst = 0;
            let totalIgst = 0;
            
            (res.Lines || []).forEach(line => {
                const unitPrice = parseFloat(line.SalesUnitPrice || 0);
                const qty = parseFloat(line.Qty || 1);
                const lineSubtotal = unitPrice * qty;
                totalTaxable += lineSubtotal;
                
                if (line.TaxCode === 'c9228485-7a58-4ccb-89e8-fe025e20261d') {
                    totalCgst += lineSubtotal * 0.09;
                    totalSgst += lineSubtotal * 0.09;
                } else if (line.TaxCode === '16e26b59-06ca-49ab-ba1c-a2c36711683e') {
                    totalIgst += lineSubtotal * 0.18;
                }
            });
            
            totalCgst = Math.round(totalCgst * 100) / 100;
            totalSgst = Math.round(totalSgst * 100) / 100;
            totalIgst = Math.round(totalIgst * 100) / 100;
            const computedGrandTotal = totalTaxable + totalCgst + totalSgst + totalIgst;
            
            const linesRows = (res.Lines || []).map(line => {
                const qty = parseFloat(line.Qty || 1);
                const price = parseFloat(line.SalesUnitPrice || 0);
                const lineAmt = qty * price;
                const taxCodeLabel = line.TaxCode === 'c9228485-7a58-4ccb-89e8-fe025e20261d' ? 'CGST/SGST 18%' :
                                     line.TaxCode === '16e26b59-06ca-49ab-ba1c-a2c36711683e' ? 'IGST 18%' : 'Exempt/Nil';
                let desc = line.LineDescription || 'Charges';
                if (qty !== 1) {
                    desc += ` (${qty} × ₹${price.toFixed(2)})`;
                }
                return `
                    <tr class="hover:bg-gray-50/50 transition-colors">
                        <td class="px-4 py-2.5 text-gray-700 font-medium">${desc}</td>
                        <td class="px-4 py-2.5 text-right text-gray-500">${taxCodeLabel}</td>
                        <td class="px-4 py-2.5 text-right text-gray-900 font-semibold">₹${lineAmt.toFixed(2)}</td>
                    </tr>
                `;
            }).join('');
            
            const balance = 0;

            // Fetch live customer details from Manager.io bypassing B2B map
            let customerName = listEntry.B2B || 'N/A';
            let customerAddr = '';
            let customerGst = '';
            
            try {
                const appData = await getAppData();
                let clientCode = '';
                if (appData?.B2B) {
                    Object.values(appData.B2B).forEach(c => {                    if ((c.BRANCH || '').toLowerCase() === (branchCode || '').toLowerCase()) {
                        clientCode = c.CODE;
                    }
                });
            }
            if (clientCode && res.Customer) {
                    const cust = await callApi(`/api/manager/customers/${res.Customer}?code=${encodeURIComponent(clientCode)}`, {}, 'GET');
                    if (cust) {
                        customerName = cust.Name || customerName;
                        customerAddr = cust.BillingAddress || '';
                        if (cust.CustomFields) {
                            customerGst = cust.CustomFields["37a9097b-398e-4227-bd32-f483ddc4ea3a"] || '';
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch customer details for viewer:", err);
            }

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-body p-6 space-y-6">
                        <!-- Invoice Header -->
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-5">
                            <div class="flex-1 min-w-0">
                                <h1 class="text-xl font-bold text-indigo-900 tracking-tight break-words">${res.SalesInvoiceCustomTitle || 'Tax Invoice'}</h1>
                                <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-semibold text-gray-700">${branchCode || 'N/A'}</span></p>
                            </div>
                            <div class="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                                <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                                    <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 uppercase whitespace-nowrap">N/A</span>
                                    <button onclick="VaultSalesInvoices._printEntry('${invoiceKey}', '${listEntry.branch}')"
                                        class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                                        </svg><span class="truncate">Print</span>
                                    </button>
                                    <button onclick="VaultSalesInvoices._openEditPaneFromDetail('${invoiceKey}', '${listEntry.branch}', event)"
                                        class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                        </svg><span class="truncate">Edit</span>
                                    </button>
                                    <button onclick="VaultSalesInvoices._handleDelete('${invoiceKey}', '${listEntry.branch}')"
                                        class="btn-danger btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg><span class="truncate">Delete</span>
                                    </button>
                                </div>
                                <p class="text-sm text-gray-500">Invoice #: <span class="font-bold text-gray-800">${res.Reference || 'N/A'}</span></p>
                                <p class="text-xs text-gray-400">Date: ${res.IssueDate ? res.IssueDate.split('T')[0] : 'N/A'}</p>
                            </div>
                        </div>

                        <!-- Bill To & Details -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Bill To</h3>
                                <p class="font-semibold text-gray-800">${_escapeHtml(customerName)}</p>
                                ${customerAddr ? `<p class="text-xs text-gray-500 mt-1">${_escapeHtml(customerAddr).replace(/\n/g, '<br>')}</p>` : ''}
                                ${customerGst ? `<p class="text-xs text-gray-500 mt-1">GSTIN: <span class="font-semibold text-gray-700">${_escapeHtml(customerGst)}</span></p>` : ''}
                            </div>
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Invoice Details</h3>
                                <p class="text-gray-600">Due Period: <span class="font-medium text-gray-800">${res.DueDateDays || 0} Days</span></p>
                                <p class="text-gray-600 mt-0.5">Balance Due: <span class="font-bold text-indigo-700">₹0.00</span></p>
                            </div>
                        </div>

                        <!-- Narration -->
                        ${res.Description ? `
                        <div class="bg-indigo-50/40 border border-indigo-100/50 rounded-lg p-3 text-xs text-indigo-950">
                            <span class="font-semibold block text-indigo-800 uppercase tracking-wider mb-1" style="font-size: 10px;">Description / Narration</span>
                            ${res.Description}
                        </div>
                        ` : ''}

                        <!-- Lines Table -->
                        <div class="overflow-hidden border border-gray-100 rounded-lg">
                            <table class="min-w-full divide-y divide-gray-100 text-xs">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-2.5 text-left font-bold text-gray-500 uppercase">Line Item Description</th>
                                        <th class="px-4 py-2.5 text-right font-bold text-gray-500 uppercase">Tax Rate</th>
                                        <th class="px-4 py-2.5 text-right font-bold text-gray-500 uppercase">Amount</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 bg-white">
                                    ${linesRows}
                                </tbody>
                            </table>
                        </div>

                        <!-- Summary Block -->
                        <div class="flex justify-end pt-2">
                            <div class="w-full md:w-64 space-y-2 text-xs bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <div class="flex justify-between text-gray-600">
                                    <span>Taxable Subtotal:</span>
                                    <span class="font-medium">₹${totalTaxable.toFixed(2)}</span>
                                </div>
                                ${totalCgst > 0 ? `
                                <div class="flex justify-between text-gray-600">
                                    <span>CGST @ 9%:</span>
                                    <span class="font-medium text-amber-700">₹${totalCgst.toFixed(2)}</span>
                                </div>
                                ` : ''}
                                ${totalSgst > 0 ? `
                                <div class="flex justify-between text-gray-600">
                                    <span>SGST @ 9%:</span>
                                    <span class="font-medium text-amber-700">₹${totalSgst.toFixed(2)}</span>
                                </div>
                                ` : ''}
                                ${totalIgst > 0 ? `
                                <div class="flex justify-between text-gray-600">
                                    <span>IGST @ 18%:</span>
                                    <span class="font-medium text-amber-700">₹${totalIgst.toFixed(2)}</span>
                                </div>
                                ` : ''}
                                <div class="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-800 text-sm">
                                    <span>Grand Total:</span>
                                    <span class="text-indigo-800 font-extrabold">₹${parseFloat(listEntry.AMOUNT || computedGrandTotal || 0).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Form Metadata -->
                        <details class="text-[11px] text-gray-400">
                            <summary class="cursor-pointer hover:text-gray-600 transition-colors">Audit & System Metadata</summary>
                            <div class="grid grid-cols-2 gap-2 mt-2 p-2 border rounded-lg bg-gray-50/50">
                                <div>Tax Code Enabled: ${res.TaxCodeEnabled ? 'Yes' : 'No'}</div>
                                <div>Rounding Enabled: ${res.Rounding ? 'Yes' : 'No'}</div>
                                <div>Manager UUID: <span class="font-mono text-[9px]">${res.Key || 'N/A'}</span></div>
                                <div>Project Enabled: ${res.ProjectEnabled ? 'Yes' : 'No'}</div>
                            </div>
                        </details>
                    </div>
                </div>`;
        
        // Append GL Postings from IDB LEDGER
        try {
            const ledgerRaw = await window.appDB.getSheet('LEDGER');
            const docEntries = Object.values(ledgerRaw || {}).filter(e => e.DOX_KEY === invoiceKey);
            if (docEntries.length > 0) {
                const glHtml = `
                    <details class="border border-slate-100 rounded-lg mt-4 bg-slate-50/50">
                        <summary class="p-3 font-bold text-slate-700 cursor-pointer hover:bg-slate-100 transition-all select-none text-sm">
                            📒 General Ledger Postings (${docEntries.length} entries)
                        </summary>
                        <div class="p-4 overflow-x-auto border-t">
                            <table class="w-full text-xs divide-y divide-slate-200">
                                <thead>
                                    <tr class="text-left font-bold text-slate-400 uppercase">
                                        <th class="py-2">Account</th>
                                        <th class="py-2 text-right">Debit (₹)</th>
                                        <th class="py-2 text-right">Credit (₹)</th>
                                        <th class="py-2 pl-4">Description</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${docEntries.map(e => `
                                        <tr class="hover:bg-white/50 transition-colors">
                                            <td class="py-2 font-medium text-slate-700">${e.ACCOUNT || ''}</td>
                                            <td class="py-2 text-right text-emerald-600 font-medium">${e.DEBIT ? '₹' + parseFloat(e.DEBIT).toFixed(2) : '—'}</td>
                                            <td class="py-2 text-right text-rose-600 font-medium">${e.CREDIT ? '₹' + parseFloat(e.CREDIT).toFixed(2) : '—'}</td>
                                            <td class="py-2 pl-4 text-slate-500">${e.DESCRIPTION || ''}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </details>`;
                view.querySelector('.detail-card-body').insertAdjacentHTML('beforeend', glHtml);
            }
        } catch (err) {
            console.warn('Failed to load GL postings:', err);
        }
        } catch (err) {
            view.innerHTML = `
                <div class="detail-card"><div class="detail-card-body text-center py-8 text-red-600">
                    <p class="text-sm">Failed to retrieve details: ${err.message || err}</p>
                </div></div>`;
        } finally {
            window.setLoading?.(false);
        }
    }



    // ── New Invoice Form (proper line-item entry) ──────────────────────────────
        async function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        // Show a loading state first
        view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-gray-400 text-sm">Loading form data…</div></div>`;
        VaultPage.showDetailPane();

        // Get app data
        const appData = await getAppData();

        // Load all cache keys if not already loaded
        if (!window.__vaultCacheKeys) {
            try {
                window.__vaultCacheKeys = await callApi('/api/manager/cache/keys', {}, 'GET');
            } catch (err) {
                console.error("Failed to load cache keys inside form:", err);
                window.__vaultCacheKeys = {};
            }
        }

        // Determine active branch
        const activeBranch = (VaultPage.getActiveBranch() || '').toLowerCase();

        // Helper: get dropdown options for a branch
        function _getBranchDropdowns(branchCode) {
            const bKey = (branchCode || '').toLowerCase();
            const bKeys = window.__vaultCacheKeys?.[bKey] || {};
            
            const itemNames = Object.keys(bKeys.non_inventory_items || {}).sort();
            const taxCodeNames = Object.keys(bKeys.tax_codes || {}).sort();

            const itemOpts = `<option value="">— Select item —</option>` +
                itemNames.map(n => `<option value="${n}">${_titleCase(n)}</option>`).join('');

            const tcOpts = `<option value="">No Tax</option>` +
                taxCodeNames.map(n => `<option value="${n}">${_titleCase(n)}</option>`).join('');
                
            return { itemOpts, tcOpts, itemNames, taxCodeNames };
        }

        let currentOpts = _getBranchDropdowns(activeBranch);

        // Populate customer options from cache keys (names to UUIDs)
        const bKeys = window.__vaultCacheKeys?.[activeBranch] || {};
        const customersList = Object.entries(bKeys.customers || {}).sort((a, b) => a[0].localeCompare(b[0]));
        const customerOpts = `<option value="">— Select Customer —</option>` +
            customersList.map(([name, uuid]) => `<option value="${uuid}">${_escapeHtml(name)}</option>`).join('');

        view.innerHTML = `
            <div class="detail-card rounded-2xl border border-slate-100 shadow-sm bg-white overflow-hidden">
                <div class="h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                <div class="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-lg tracking-tight">New Sales Invoice</h3>
                            <p class="text-xs text-slate-400">Create a new customer invoice synchronized with Manager.io</p>
                        </div>
                    </div>
                </div>
                <div class="detail-card-body p-6 space-y-6">
                    <form id="siForm" class="space-y-6">

                        <!-- Header: Customer, Date, Due Days -->
                        <div class="bg-slate-50/50 p-4 rounded-xl border border-slate-100/80 grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div class="md:col-span-2">
                                <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Customer *</label>
                                <select name="customer" id="siCustomer" required class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                                    ${customerOpts}
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Invoice Date *</label>
                                <input name="inv_date" id="siDate" type="date" required class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Due Days</label>
                                <input name="due_days" type="number" min="0" value="20" class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                            </div>
                        </div>

                        <!-- Line Items -->
                        <div class="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
                            <div class="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-100">
                                <span class="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                                    Line Items
                                </span>
                                <button type="button" id="siAddLine"
                                    class="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 bg-white border border-indigo-150/70 px-3 py-1.5 rounded-lg shadow-sm hover:shadow">
                                    ➕ Add Line
                                </button>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="w-full text-sm divide-y divide-slate-100" id="siLinesTable">
                                    <thead class="bg-slate-50/50">
                                        <tr class="text-xs font-bold text-slate-400 uppercase tracking-wider text-left border-b">
                                            <th class="py-3 px-4" style="min-width:180px">Item</th>
                                            <th class="py-3 px-4" style="min-width:200px">Description</th>
                                            <th class="py-3 px-4 text-right" style="min-width:70px">Qty</th>
                                            <th class="py-3 px-4 text-right" style="min-width:100px">Unit Price</th>
                                            <th class="py-3 px-4" style="min-width:150px">Tax Code</th>
                                            <th class="py-3 px-4 text-right" style="min-width:100px">Amount</th>
                                            <th class="py-3 px-4 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="siLineRows" class="divide-y divide-slate-100"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Advanced Document Options -->
                        <div class="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white mt-4">
                            <div class="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                <span class="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                    Advanced & Document Options
                                </span>
                            </div>
                            <div class="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                <div>
                                    <label class="flex items-center gap-2 font-semibold text-slate-600 mb-1.5 cursor-pointer">
                                        <input type="checkbox" name="has_custom_title" id="siHasCustomTitle" class="rounded text-indigo-600 focus:ring-indigo-500/20" checked>
                                        <span>Custom Invoice Title</span>
                                    </label>
                                    <input type="text" name="custom_title" id="siCustomTitle" value="Tax Invoice" class="form-input text-sm rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full" placeholder="e.g. Tax Invoice">
                                </div>
                                <div>
                                    <label class="block font-semibold text-slate-600 mb-1.5">Early Payment Discount (%)</label>
                                    <input type="number" name="discount_rate" id="siDiscountRate" min="0" max="100" step="any" class="form-input text-sm rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full" placeholder="Optional">
                                </div>
                                <div class="flex items-center pt-5">
                                    <label class="flex items-center gap-2 font-semibold text-slate-600 cursor-pointer">
                                        <input type="checkbox" name="late_fees" id="siLateFees" class="rounded text-indigo-600 focus:ring-indigo-500/20">
                                        <span>Apply Late Payment Fees</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Narration + Totals -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <!-- Narration -->
                            <div class="md:col-span-2 space-y-1.5">
                                <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500">Narration / Description</label>
                                <textarea name="narration" rows="3" class="form-input text-sm rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full" placeholder="Enter invoice notes or narration (optional)"></textarea>
                            </div>

                            <!-- Totals Box -->
                            <div class="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-4 border border-slate-150/60 space-y-3 text-sm flex flex-col justify-between" id="siTotals">
                                <div class="space-y-2">
                                    <div class="flex justify-between text-slate-500 font-medium">
                                        <span>Subtotal</span>
                                        <span id="si_subtotal" class="font-bold text-slate-700">₹0.00</span>
                                    </div>
                                    <div class="flex justify-between text-slate-500 font-medium" id="si_sgst_row">
                                        <span>SGST</span>
                                        <span id="si_sgst_val" class="font-bold text-slate-700">₹0.00</span>
                                    </div>
                                    <div class="flex justify-between text-slate-500 font-medium" id="si_cgst_row">
                                        <span>CGST</span>
                                        <span id="si_cgst_val" class="font-bold text-slate-700">₹0.00</span>
                                    </div>
                                    <div class="flex justify-between text-slate-500 font-medium hidden" id="si_igst_row">
                                        <span>IGST</span>
                                        <span id="si_igst_val" class="font-bold text-slate-700">₹0.00</span>
                                    </div>
                                </div>
                                <div class="border-t border-slate-200 pt-3 flex justify-between items-center font-bold text-slate-800">
                                    <span class="text-xs uppercase tracking-wider text-slate-400">Grand Total</span>
                                    <span id="si_grand_total" class="text-indigo-600 text-lg font-black tracking-tight">₹0.00</span>
                                </div>
                            </div>
                        </div>

                        <!-- Submit Bar -->
                        <div class="flex items-center justify-between pt-4 border-t border-slate-100">
                            <div id="siResponse" class="hidden text-sm"></div>
                            <div class="flex gap-3 ml-auto">
                                <button type="button" onclick="VaultPage.showDetail(false)" class="btn btn-sm btn-ghost px-4 py-2 text-slate-500 font-semibold hover:bg-slate-50 rounded-lg">Cancel</button>
                                <button type="submit" id="siSubmitBtn" class="btn btn-sm bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2">
                                    <span id="siBtnText">Create Invoice</span>
                                    <div id="siSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>`;

        // Default date = today
        document.getElementById('siDate').value = new Date().toISOString().split('T')[0];

        // Handle custom title toggle
        const hasCustomTitleEl = document.getElementById('siHasCustomTitle');
        const customTitleEl = document.getElementById('siCustomTitle');
        function _toggleCustomTitle() {
            customTitleEl.disabled = !hasCustomTitleEl.checked;
            customTitleEl.classList.toggle('bg-slate-100', !hasCustomTitleEl.checked);
        }
        hasCustomTitleEl.addEventListener('change', _toggleCustomTitle);
        _toggleCustomTitle();

        // ── Line management ────────────────────────────────────────────────────
        let _lineCount = 0;

        function _addLine(defaultItem = '', defaultTc = '') {
            const idx = _lineCount++;
            const tr  = document.createElement('tr');
            tr.id     = `siLine_${idx}`;
            tr.className = 'border-t border-slate-100';
            tr.innerHTML = `
                <td class="py-2.5 px-4">
                    <select class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 si-item w-full" data-idx="${idx}">
                        ${currentOpts.itemOpts}
                    </select>
                </td>
                <td class="py-2.5 px-4">
                    <input type="text" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 si-desc w-full" placeholder="Description">
                </td>
                <td class="py-2.5 px-4">
                    <input type="number" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 si-qty text-right w-full" value="1" min="0.001" step="any">
                </td>
                <td class="py-2.5 px-4">
                    <input type="number" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 si-price text-right w-full" value="" min="0" step="0.01" placeholder="0.00">
                </td>
                <td class="py-2.5 px-4">
                    <select class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 si-tc w-full">
                        ${currentOpts.tcOpts}
                    </select>
                </td>
                <td class="py-2.5 px-4 text-right font-semibold text-slate-700">
                    <span class="si-amt text-xs">₹0.00</span>
                </td>
                <td class="py-2.5 px-4 text-center">
                    <button type="button" class="si-remove text-slate-350 hover:text-red-500 transition-colors" title="Remove line">
                        <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </td>`;
            document.getElementById('siLineRows').appendChild(tr);

            // Pre-select defaults if provided
            if (defaultItem) tr.querySelector('.si-item').value = defaultItem;
            if (defaultTc)   tr.querySelector('.si-tc').value   = defaultTc;

            // When item changes, auto-fill description from item name
            tr.querySelector('.si-item').addEventListener('change', function() {
                const descEl = tr.querySelector('.si-desc');
                if (!descEl.value) descEl.value = _titleCase(this.value);
                _calcTotals();
            });

            // Live recalc on any change
            tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', _calcTotals));
            tr.querySelector('.si-remove').addEventListener('click', () => { tr.remove(); _calcTotals(); });

            _calcTotals();
        }

        function _calcTotals() {
            let subtotal = 0, sgst = 0, cgst = 0, igst = 0;

            document.querySelectorAll('#siLineRows tr').forEach(tr => {
                const qty   = parseFloat(tr.querySelector('.si-qty')?.value  || 0);
                const price = parseFloat(tr.querySelector('.si-price')?.value || 0);
                const tc    = (tr.querySelector('.si-tc')?.value || '').toUpperCase();
                const lineAmt = qty * price;
                subtotal += lineAmt;
                tr.querySelector('.si-amt').textContent = '₹' + lineAmt.toFixed(2);

                // Detect tax type from tax code name
                if (tc.includes('IGST')) {
                    const rate = _parseTaxRate(tr.querySelector('.si-tc').value);
                    igst += lineAmt * rate / 100;
                } else if (tc && tc !== '') {
                    const rate = _parseTaxRate(tr.querySelector('.si-tc').value);
                    sgst += lineAmt * rate / 200;
                    cgst += lineAmt * rate / 200;
                }
            });

            const grandTotal = subtotal + sgst + cgst + igst;
            document.getElementById('si_subtotal').textContent  = '₹' + subtotal.toFixed(2);
            document.getElementById('si_sgst_val').textContent  = '₹' + sgst.toFixed(2);
            document.getElementById('si_cgst_val').textContent  = '₹' + cgst.toFixed(2);
            document.getElementById('si_igst_val').textContent  = '₹' + igst.toFixed(2);
            document.getElementById('si_grand_total').textContent = '₹' + grandTotal.toFixed(2);
            document.getElementById('si_sgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
            document.getElementById('si_cgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
            document.getElementById('si_igst_row').classList.toggle('hidden', igst === 0);
        }

        // Add initial line
        _addLine();
        document.getElementById('siAddLine').addEventListener('click', () => _addLine());

        // ── Submit ────────────────────────────────────────────────────────────
        document.getElementById('siForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd  = new FormData(e.target);
            const raw = Object.fromEntries(fd);
            const btn = document.getElementById('siSubmitBtn');
            const sp  = document.getElementById('siSpinner');
            const resp = document.getElementById('siResponse');
            btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
            window.setLoading?.(true, 'Creating invoice...', 'detail');

            try {
                const customerUuid = raw.customer;
                const appData = await getAppData();
                let clientCode = '';
                if (appData?.B2B) {
                    Object.values(appData.B2B).forEach(c => {
                        if ((c.BRANCH || '').toLowerCase() === (activeBranch || '').toLowerCase()) {
                            clientCode = c.CODE;
                        }
                    });
                }
                if (!clientCode) {
                    throw new Error(`Cannot resolve manager client code for branch "${activeBranch}".`);
                }

                // Build lines from table rows
                const lines = [];
                document.querySelectorAll('#siLineRows tr').forEach(tr => {
                    const item  = tr.querySelector('.si-item')?.value  || '';
                    const desc  = tr.querySelector('.si-desc')?.value  || '';
                    const qty   = parseFloat(tr.querySelector('.si-qty')?.value  || 1);
                    const price = parseFloat(tr.querySelector('.si-price')?.value || 0);
                    const tc    = tr.querySelector('.si-tc')?.value || '';
                    if (price > 0 || item) {
                        lines.push({
                            Item:            item || undefined,
                            LineDescription: desc || undefined,
                            Qty:             qty,
                            SalesUnitPrice:  price,
                            TaxCode:         tc || undefined,
                        });
                    }
                });

                if (!lines.length) throw new Error('Add at least one line item with a price.');

                const payload = {
                    IssueDate:                  raw.inv_date,
                    DueDateDays:                parseInt(raw.due_days) || 20,
                    Customer:                   customerUuid,
                    Description:                raw.narration || undefined,
                    Lines:                      lines,
                    TaxCodeEnabled:             true,
                    HasLineNumber:              true,
                    Rounding:                   true,
                    HasSalesInvoiceCustomTitle: document.getElementById('siHasCustomTitle').checked,
                    SalesInvoiceCustomTitle:    document.getElementById('siHasCustomTitle').checked ? document.getElementById('siCustomTitle').value.trim() || "Tax Invoice" : undefined,
                    EarlyPaymentDiscountRate:   raw.discount_rate ? parseFloat(raw.discount_rate) : undefined,
                    LatePaymentFees:            document.getElementById('siLateFees').checked,
                };

                const url = `/api/manager/invoices?code=${encodeURIComponent(clientCode)}`;
                const res = await callApi(url, payload, 'POST');
                const refNum = res.Reference || res.reference || 'created';
                resp.className = 'mt-2 text-sm bg-green-150 text-green-800 px-3 py-2 rounded-xl';
                resp.textContent = `✅ Invoice ${refNum} created in Manager.io.`;
                resp.classList.remove('hidden');
                await load();
            } catch (err) {
                resp.className = 'mt-2 text-sm bg-red-150 text-red-800 px-3 py-2 rounded-xl';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                window.setLoading?.(false);
                btn.disabled = false; sp.classList.add('hidden');
            }
        });

        VaultPage.showDetailPane();
    }

    // Helpers
    function _titleCase(str) {
        return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
    function _parseTaxRate(tcName) {
        // Extract numeric rate from tax code name e.g. "GST 18%" → 18, "IGST @12%" → 12
        const m = (tcName || '').match(/(\d+(\.\d+)?)\s*%?/);
        return m ? parseFloat(m[1]) : 18;
    }


    function _injectUI() {
        const listPane = document.getElementById('vaultListPane');
        const header   = listPane?.querySelector('.sv-pane-header');
        if (header && !document.getElementById('siFilterBtn')) {
            const searchInput = document.getElementById('vaultSearch');
            let searchRow = searchInput?.parentElement;
            if (searchInput && searchRow && !searchRow.classList.contains('flex')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'flex gap-2 w-full mt-2';
                searchRow.insertBefore(wrapper, searchInput);
                wrapper.appendChild(searchInput);
                searchInput.classList.remove('mt-2');
                searchRow = wrapper;
            }
            
            const filterBtn = document.createElement('button');
            filterBtn.id = 'siFilterBtn';
            filterBtn.className = 'btn-ghost btn-sm flex-shrink-0';
            filterBtn.title = 'Filter Invoices';
            filterBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>`;
            filterBtn.onclick = () => document.getElementById('siFilterModal')?.classList.remove('hidden');
            searchRow?.appendChild(filterBtn);
        }

        if (!document.getElementById('siStatus')) {
            const statusEl = document.createElement('p');
            statusEl.id = 'siStatus';
            statusEl.className = 'text-xs text-gray-500 px-4 pt-2 text-center font-medium';
            statusEl.textContent = 'Loading...';
            const listContainer = document.getElementById('vaultList')?.parentElement;
            listContainer?.insertBefore(statusEl, document.getElementById('vaultList'));
        }

        if (!document.getElementById('siFilterModal')) {
            const modal = document.createElement('div');
            modal.id = 'siFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h2 class="text-lg font-bold text-gray-800">Filter Sales Invoices</h2>
                        <button onclick="document.getElementById('siFilterModal').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Start Date</label>
                            <input type="date" id="siFilterStart" class="form-input text-xs" value="${_filterStart}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">End Date</label>
                            <input type="date" id="siFilterEnd" class="form-input text-xs" value="${_filterEnd}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Branch</label>
                            <select id="siFilterBranch" class="form-input text-xs">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button id="siResetBtn" class="btn-ghost btn-sm">Reset</button>
                        <button id="siApplyBtn" class="btn btn-sm">Apply Filters</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
            
            document.getElementById('siApplyBtn').onclick = async () => {
                _filterStart = document.getElementById('siFilterStart').value;
                _filterEnd = document.getElementById('siFilterEnd').value;
                _filterBranch = document.getElementById('siFilterBranch').value;
                modal.classList.add('hidden');
                await load();
            };
            
            document.getElementById('siResetBtn').onclick = async () => {
                const range = getCurrentFYRange();
                document.getElementById('siFilterStart').value = range.start;
                document.getElementById('siFilterEnd').value = range.end;
                document.getElementById('siFilterBranch').value = '';
                
                _filterStart = range.start;
                _filterEnd = range.end;
                _filterBranch = '';
                await load();
            };
            
            getAppData().then(data => {
                const select = document.getElementById('siFilterBranch');
                if (select && data?.BRANCHES) {
                    Object.values(data.BRANCHES).forEach(b => {
                        if (b.BRANCH_CODE) {
                            const opt = document.createElement('option');
                            opt.value = b.BRANCH_CODE;
                            opt.textContent = b.BRANCH_CODE.toUpperCase();
                            select.appendChild(opt);
                        }
                    });
                }
            });
        }
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();
        _injectUI();

        if (!window.__vaultCacheKeys) {
            try {
                window.__vaultCacheKeys = await callApi('/api/manager/cache/keys', {}, 'GET');
            } catch (err) {
                console.error("Failed to pre-fetch cache keys in sales invoices load:", err);
            }
        }

        window.setLoading?.(true, 'Loading invoices...', 'list');
        try {
            if (!window.appDB) {
                document.getElementById('vaultListMsg').textContent = 'IDB not available. Please wait for sync to complete.';
                return;
            }
            const branch = VaultPage.getActiveBranch();
            const rawHeaders = await window.appDB.getSheet('HEADER');
            _allInvoices = Object.values(rawHeaders || {}).filter(h =>
                h.DOX_TYPE === 'Sales Invoice' &&
                (!branch || (h.BRANCH || '').toLowerCase() === branch.toLowerCase())
            );
            document.getElementById('vaultListMsg').textContent = '';
            _renderList();
        } catch (err) {
            document.getElementById('vaultListMsg').textContent = 'Error: ' + (err.message || err);
        } finally {
            window.setLoading?.(false);
        }
    }

    return { load, search, openAddPane, _handleDelete, _printEntry, _openEditPaneFromDetail };
})();

window.VaultSalesInvoices = VaultSalesInvoices;
