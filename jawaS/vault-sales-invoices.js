// ============================================================================
// VAULT-SALES-INVOICES.JS — Sales Invoices from LEDGER collection
// Tile: sales-invoices
// Data source: appData.LEDGER (filtered by ENTRY_TYPE === 'INVOICE', DIRECTION === 'OUTWARD')
// ============================================================================

const VaultSalesInvoices = (() => {

    let _allInvoices = [];
    let _b2bMap    = new Map();

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
    let _filterStatus = '';

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
                const matchSearch = (e.reference || '').toLowerCase().includes(q) ||
                                     (e.customer || '').toLowerCase().includes(q) ||
                                     (e.description || '').toLowerCase().includes(q) ||
                                     (e.branch || '').toLowerCase().includes(q);
                if (!matchSearch) return false;
            }
            // Date range (FY/Filterform range)
            const d = e.issueDate || '';
            if (_filterStart && d < _filterStart) return false;
            if (_filterEnd && d > _filterEnd) return false;
            // Branch
            if (_filterBranch && (e.branch || '').toLowerCase() !== _filterBranch.toLowerCase()) return false;
            // Status
            if (_filterStatus && (e.status || '').toLowerCase() !== _filterStatus.toLowerCase()) return false;
            
            return true;
        });

        filtered.sort((a, b) => {
            const dateA = a.issueDate || '';
            const dateB = b.issueDate || '';
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            return (b.reference || '').localeCompare(a.reference || '');
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
            const amount = e.invoiceAmount?.value || 0;
            const balance = e.balanceDue?.value || 0;
            const status = e.status || '';
            const statusColor = status.toUpperCase() === 'PAID' ? 'text-green-700' :
                                status.toUpperCase() === 'OVERDUE' ? 'text-red-700' : 'text-gray-700';
            return `<li data-key="${e.key}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <strong class="text-indigo-700 block text-sm">${e.reference || 'N/A'} — ${e.customer || 'N/A'}</strong>
                <span class="text-xs text-gray-500">₹${(+amount).toFixed(2)} · ${e.issueDate || ''} · ${e.branch || ''}</span>
                <div class="text-xs mt-1">
                    <span class="${statusColor} font-medium">${status}</span>
                    <span class="text-gray-400"> · Balance Due: ₹${(+balance).toFixed(2)}</span>
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(_allInvoices.find(inv => inv.key === li.dataset.key));
            })
        );
    }

    function search() {
        _renderList();
    }

    // ── GST filing check ────────────────────────────────────────────────────
    let _gstFiledCache = null;

    async function _ensureGstFiledCache() {
        if (_gstFiledCache) return _gstFiledCache;
        try {
            const res = await callApi('/api/gst/filings', {}, 'GET');
            _gstFiledCache = (res.data || []).filter(f =>
                f.return_type === 'GSTR1' && f.status === 'FILED'
            );
        } catch {
            _gstFiledCache = [];
        }
        return _gstFiledCache;
    }

    function _isGstFiled(branch, entryDate) {
        if (!branch || !entryDate) return false;
        const d = new Date(entryDate);
        if (isNaN(d.getTime())) return false;
        const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        return (_gstFiledCache || []).some(f =>
            f.branch === branch && f.period === period
        );
    }

    // ── Delete via Manager.io ─────────────────────────────────────────────────
    async function _handleDelete(invoiceKey, branchCode) {
        if (!invoiceKey || !branchCode) {
            alert('Cannot delete: missing invoice key or branch.');
            return;
        }
        if (!confirm('Delete this invoice from Manager.io permanently?\n\nThis action cannot be undone.')) return;
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
        try {
            const [res, appData] = await Promise.all([
                callApi(`/api/manager/invoice-details/${branchCode}/${invoiceKey}`, {}, 'GET'),
                getAppData()
            ]);

            // Ensure _b2bMap is populated (may not be if user clicked Print without opening Add/Edit)
            if (appData?.B2B) {
                Object.values(appData.B2B).forEach(c => {
                    if (c.CODE) _b2bMap.set(c.CODE.trim().toUpperCase(), c);
                });
            }

            const inv = _allInvoices.find(i => i.key === invoiceKey);

            const ref = res.Reference || inv?.reference || invoiceKey;
            const issueDate = res.IssueDate || inv?.issueDate || '';
            const customerCode = inv?.customer || '';
            const description = res.Description || '';

            // Look up B2B and branch details
            const b2b = _b2bMap.get(customerCode.trim().toUpperCase());
            const b2bName = b2b?.B2B_NAME || customerCode;
            const b2bAddr = b2b?.B2B_ADDRESS || '';
            const b2bCity = b2b?.B2B_CITY || '';
            const b2bState = b2b?.B2B_STATE || '';
            const b2bMobile = b2b?.MOBILE_NUMBER || '';
            const b2bGst = b2b?.ID_GST_PAN_ADHAR || 'N/A';

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
                .no-print{text-align:center;margin-bottom:15px}
                .no-print button{padding:8px 20px;margin:3px;border:none;border-radius:4px;cursor:pointer;font-weight:600}
                .no-print .print-btn{background:#1a1a2e;color:#fff}
                .no-print .close-btn{background:#6b7280;color:#fff}
                @media print{@page{size:A4;margin:10mm}body{background:#fff;padding:0}.box{box-shadow:none;border:none}.no-print{display:none}}
            `;

            const body = `
                <div class="no-print"><button class="print-btn" onclick="window.print()">🖨️ Print</button><button class="close-btn" onclick="window.close()">✕ Close</button></div>
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
                            <p><b>Address:</b> ${_escapeHtml(b2bAddr)}</p>
                            <p><b>City:</b> ${_escapeHtml(b2bCity)}, ${_escapeHtml(b2bState)}</p>
                            <p><b>Mobile:</b> ${_escapeHtml(b2bMobile)}</p>
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
                </div>`;

            const w = window.open('', 'Sales_Invoice_' + ref.replace(/[^a-zA-Z0-9]/g, '_'));
            if (!w) { alert('Pop-up blocked! Please allow pop-ups.'); return; }
            w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tax Invoice - ' + _escapeHtml(ref) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>');
            w.document.close();
            w.onload = function() {
                setTimeout(function() {
                    try {
                        w.document.querySelectorAll('.no-print').forEach(function(e) { e.style.display = 'block'; });
                    } catch(_) {}
                }, 500);
            };
        } catch (err) {
            alert('Failed to print: ' + (err.message || err));
        }
    }

    // ── Edit via Manager.io PUT ──────────────────────────────────────────────
    async function _openEditPaneFromDetail(invoiceKey, branchCode, evt) {
        const btn = evt?.target?.closest('button');
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

            // Build B2B map
            if (appData?.B2B) Object.values(appData.B2B).forEach(c => {
                if (c.CODE) _b2bMap.set(c.CODE.trim().toUpperCase(), c);
            });

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

            // ── GST period guard: block edit if period already filed ──
            let _gstBlocked = false;
            let _gstPeriod = '';
            await _ensureGstFiledCache();
            if (_isGstFiled(branchCode, existingDate)) {
                _gstBlocked = true;
                const d = new Date(existingDate);
                if (!isNaN(d.getTime())) {
                    _gstPeriod = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
                }
            }

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

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">✏️ Edit Invoice — ${existingRef || invoiceKey}</h3></div>
                    <div class="detail-card-body space-y-4">
                        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                            ⚠️ Editing will update this invoice in Manager.io. Reference number will be preserved.
                        </p>
                        ${_gstBlocked ? `
                        <div class="bg-red-100 border border-red-300 text-red-800 rounded-lg p-3 text-xs space-y-1">
                            <div class="flex items-center gap-2 font-semibold">
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
                        <form id="sieForm" class="space-y-4">
                            <input type="hidden" name="invoice_key" value="${invoiceKey}">
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div class="sm:col-span-2">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                    <input name="code" id="sieCode" required class="form-input text-sm uppercase"
                                        value="${clientCode}" list="sieCodeList" autocomplete="off">
                                    <datalist id="sieCodeList"></datalist>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                    <input name="branch" id="sieBranch" readonly
                                        class="form-input text-sm uppercase bg-gray-50 text-gray-500" value="${branchCode.toUpperCase() || ''}">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">POS State</label>
                                    <input name="pos" id="siePos" readonly
                                        class="form-input text-sm bg-gray-50 text-gray-500" placeholder="Auto">
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Date *</label>
                                    <input name="inv_date" type="date" required class="form-input text-sm" value="${existingDate.split('T')[0] || existingDate}">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Due Days</label>
                                    <input name="due_days" type="number" min="0" class="form-input text-sm" value="${existingDueDays}">
                                </div>
                            </div>

                            <!-- Line Items -->
                            <div class="border rounded-lg overflow-hidden">
                                <div class="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                                    <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</span>
                                    <button type="button" id="sieAddLine"
                                        class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">+ Add Line</button>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm" id="sieLinesTable">
                                        <thead>
                                            <tr class="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                                                <th class="py-2 px-2 text-left" style="min-width:160px">Item</th>
                                                <th class="py-2 px-2 text-left" style="min-width:140px">Description</th>
                                                <th class="py-2 px-2 text-right" style="min-width:60px">Qty</th>
                                                <th class="py-2 px-2 text-right" style="min-width:90px">Unit Price</th>
                                                <th class="py-2 px-2 text-left" style="min-width:130px">Tax Code</th>
                                                <th class="py-2 px-2 text-right" style="min-width:80px">Amount</th>
                                                <th class="py-2 px-2" style="min-width:32px"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="sieLineRows"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Totals -->
                            <div class="border rounded-lg p-3 bg-gray-50 space-y-1.5 text-sm" id="sieTotals">
                                <div class="flex justify-between text-gray-600"><span>Subtotal</span><span id="sie_subtotal" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between text-gray-600" id="sie_sgst_row"><span>SGST</span><span id="sie_sgst_val" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between text-gray-600" id="sie_cgst_row"><span>CGST</span><span id="sie_cgst_val" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between text-gray-600 hidden" id="sie_igst_row"><span>IGST</span><span id="sie_igst_val" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-1">
                                    <span>Grand Total</span>
                                    <span id="sie_grand_total" class="text-indigo-700 text-base">₹0.00</span>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Narration / Description</label>
                                <input name="narration" class="form-input text-sm" value="${_escapeHtml(existingDesc)}">
                            </div>

                            <div class="flex justify-between items-center pt-2 border-t">
                                <div id="sieResponse" class="hidden text-sm"></div>
                                <button type="submit" id="sieSubmitBtn" class="btn btn-sm flex items-center gap-2 ml-auto" ${_gstBlocked ? 'disabled' : ''}>
                                    <span id="sieBtnText">${_gstBlocked ? 'Edit Blocked' : 'Update Invoice'}</span>
                                    <div id="sieSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>`;

            // Populate client datalist
            const dl = document.getElementById('sieCodeList');
            _b2bMap.forEach((rec, code) => {
                const o = document.createElement('option');
                o.value = code;
                o.label = `${code} — ${rec.B2B_NAME || ''}`;
                dl.appendChild(o);
            });

            // Auto-fill branch + POS
            function _applyClientAutofill() {
                const code = document.getElementById('sieCode').value.trim().toUpperCase();
                const b2b = _b2bMap.get(code);
                if (!b2b) return;
                const branch = (b2b.BRANCH || '').toUpperCase();
                document.getElementById('sieBranch').value = branch;
                document.getElementById('siePos').value = b2b.CODE_STATE || b2b.STATE_CODE || '';
                currentOpts = _getBranchDropdowns(branch);
                document.querySelectorAll('#sieLineRows tr').forEach(tr => {
                    const itemSel = tr.querySelector('.sie-item');
                    const tcSel = tr.querySelector('.sie-tc');
                    if (itemSel && tcSel) {
                        const prevItem = itemSel.value;
                        const prevTc = tcSel.value;
                        itemSel.innerHTML = currentOpts.itemOpts;
                        tcSel.innerHTML = currentOpts.tcOpts;
                        if (currentOpts.itemNames.includes(prevItem)) itemSel.value = prevItem;
                        if (currentOpts.taxCodeNames.includes(prevTc)) tcSel.value = prevTc;
                    }
                });
            }
            document.getElementById('sieCode').addEventListener('input', _applyClientAutofill);
            document.getElementById('sieCode').addEventListener('change', _applyClientAutofill);

            // ── Line management ──
            let _lineCount = 0;

            function _addLine(defaultItem = '', defaultDesc = '', defaultQty = 1, defaultPrice = 0, defaultTc = '') {
                const idx = _lineCount++;
                const tr = document.createElement('tr');
                tr.id = `sieLine_${idx}`;
                tr.className = 'border-t border-gray-100';
                tr.innerHTML = `
                    <td class="py-1.5 px-2">
                        <select class="form-input text-xs sie-item" style="min-width:140px">${currentOpts.itemOpts}</select>
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="text" class="form-input text-xs sie-desc" placeholder="Description" style="min-width:120px" value="${_escapeHtml(defaultDesc)}">
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="number" class="form-input text-xs sie-qty text-right" value="${defaultQty}" min="0.001" step="any" style="min-width:55px">
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="number" class="form-input text-xs sie-price text-right" value="${defaultPrice}" min="0" step="0.01" style="min-width:80px">
                    </td>
                    <td class="py-1.5 px-2">
                        <select class="form-input text-xs sie-tc" style="min-width:120px">${currentOpts.tcOpts}</select>
                    </td>
                    <td class="py-1.5 px-2 text-right">
                        <span class="sie-amt text-gray-700 font-medium text-xs">₹0.00</span>
                    </td>
                    <td class="py-1.5 px-2 text-center">
                        <button type="button" class="sie-remove text-red-400 hover:text-red-600 text-lg leading-none" title="Remove line">×</button>
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
            _applyClientAutofill();

            // ── Submit ──
            document.getElementById('sieForm').addEventListener('submit', async e => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const raw = Object.fromEntries(fd);
                const btn = document.getElementById('sieSubmitBtn');
                const sp = document.getElementById('sieSpinner');
                const resp = document.getElementById('sieResponse');
                btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';

                try {
                    const editClientCode = raw.code.trim().toUpperCase();
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
                        Customer: editClientCode,
                        Description: raw.narration || undefined,
                        Lines: lines,
                        TaxCodeEnabled: true,
                        HasLineNumber: true,
                        Rounding: true,
                    };

                    const url = `/api/manager/invoices/${raw.invoice_key}?code=${encodeURIComponent(editClientCode)}`;
                    const result = await callApi(url, payload, 'PUT');
                    const refNum = result.Reference || result.reference || 'updated';
                    resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                    resp.textContent = `✅ Invoice ${refNum} updated in Manager.io!`;
                    resp.classList.remove('hidden');
                    await load();
                } catch (err) {
                    resp.className = 'mt-2 text-sm bg-red-100 text-red-800 px-3 py-2 rounded';
                    resp.textContent = '❌ ' + (err.message || 'Failed');
                    resp.classList.remove('hidden');
                } finally {
                    btn.disabled = false; sp.classList.add('hidden');
                }
            });

            VaultPage.showDetailPane();
        } catch (err) {
            view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-red-600"><p class="text-sm">Failed to load: ${err.message || err}</p></div></div>`;
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = ''; }
        }
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Detail pane (with charge breakdown) ────────────────────────────────────
    async function _renderDetail(listEntry) {
        if (!listEntry) return;

        if (!listEntry.key) {
            const ref = listEntry.INV_NUMBER || listEntry.INVOICE_ID;
            const branch = listEntry.BRANCH || listEntry.branch;
            if (ref) {
                const match = _allInvoices.find(inv => 
                    (inv.reference === ref) && 
                    (!branch || (inv.branch || '').toLowerCase() === branch.toLowerCase())
                );
                if (match) {
                    listEntry = match;
                }
            }
        }

        if (!listEntry.key) {
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
            <div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p class="text-gray-500 text-sm">Fetching invoice details from Manager.io...</p>
        </div>`;
        
        try {
            const res = await callApi(`/api/manager/invoice-details/${listEntry.branch}/${listEntry.key}`, {}, 'GET');
            
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
                const amount = parseFloat(line.SalesUnitPrice || 0);
                const taxCodeLabel = line.TaxCode === 'c9228485-7a58-4ccb-89e8-fe025e20261d' ? 'CGST/SGST 18%' :
                                     line.TaxCode === '16e26b59-06ca-49ab-ba1c-a2c36711683e' ? 'IGST 18%' : 'Exempt/Nil';
                return `
                    <tr class="hover:bg-gray-50/50 transition-colors">
                        <td class="px-4 py-2.5 text-gray-700 font-medium">${line.LineDescription || 'Charges'}</td>
                        <td class="px-4 py-2.5 text-right text-gray-500">${taxCodeLabel}</td>
                        <td class="px-4 py-2.5 text-right text-gray-900 font-semibold">₹${amount.toFixed(2)}</td>
                    </tr>
                `;
            }).join('');
            
            const balance = listEntry.balanceDue?.value || 0;

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-body p-6 space-y-6">
                        <!-- Invoice Header -->
                        <div class="flex justify-between items-start border-b border-gray-100 pb-5">
                            <div>
                                <h1 class="text-xl font-bold text-indigo-900 tracking-tight">${res.SalesInvoiceCustomTitle || 'Tax Invoice'}</h1>
                                <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-semibold text-gray-700">${listEntry.branch || 'N/A'}</span></p>
                            </div>
                            <div class="text-right flex flex-col items-end gap-1.5">
                                <div class="flex items-center gap-1.5 flex-wrap justify-end">
                                    <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 uppercase mr-1">${listEntry.status || 'N/A'}</span>
                                    <button onclick="VaultSalesInvoices._printEntry('${listEntry.key}', '${listEntry.branch}')"
                                        class="btn btn-sm">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                                        </svg> Print
                                    </button>
                                    <button onclick="VaultSalesInvoices._openEditPaneFromDetail('${listEntry.key}', '${listEntry.branch}', event)"
                                        class="btn btn-sm">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                        </svg> Edit
                                    </button>
                                    <button onclick="VaultSalesInvoices._handleDelete('${listEntry.key}', '${listEntry.branch}')"
                                        class="btn-danger btn-sm">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg>
                                    </button>
                                </div>
                                <p class="text-sm text-gray-500 mt-1">Invoice #: <span class="font-bold text-gray-800">${res.Reference || 'N/A'}</span></p>
                                <p class="text-xs text-gray-400">Date: ${res.IssueDate ? res.IssueDate.split('T')[0] : 'N/A'}</p>
                            </div>
                        </div>

                        <!-- Bill To & Details -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Bill To</h3>
                                <p class="font-semibold text-gray-800">${listEntry.customer || 'N/A'}</p>
                            </div>
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Invoice Details</h3>
                                <p class="text-gray-600">Due Period: <span class="font-medium text-gray-800">${res.DueDateDays || 0} Days</span></p>
                                <p class="text-gray-600 mt-0.5">Balance Due: <span class="font-bold text-indigo-700">₹${(+balance).toFixed(2)}</span></p>
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
                                    <span class="text-indigo-800 font-extrabold">₹${(listEntry.invoiceAmount?.value || computedGrandTotal).toFixed(2)}</span>
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
        } catch (err) {
            view.innerHTML = `
                <div class="detail-card"><div class="detail-card-body text-center py-8 text-red-600">
                    <p class="text-sm">Failed to retrieve details: ${err.message || err}</p>
                </div></div>`;
        }
        VaultPage.showDetailPane();
    }

    // ── Parse breakdown from NARRATION ────────────────────────────────────────
    function _parseNarration(entry) {
        try {
            const p = JSON.parse(entry.NARRATION || '{}');
            if (p.charges || p.grand_total !== undefined) return p;
        } catch (_) {}
        return null;
    }

    // ── Charge recalc ─────────────────────────────────────────────────────────
    function _recalc() {
        function get(id) { return parseFloat(document.getElementById(id)?.value || 0); }
        const fright = get('si_fright'), fuel = get('si_fuel'), cod = get('si_cod'),
              topay = get('si_topay'), fov = get('si_fov'), eway = get('si_eway'),
              awb = get('si_awb'), pack = get('si_pack'), dev = get('si_dev');
        const subtotal = fright + fuel + cod + topay + fov + eway + awb + pack + dev;
        const taxable = subtotal;
        const taxRate = parseFloat(document.getElementById('si_tax_rate')?.value || 18);
        const isInter = document.getElementById('si_is_inter')?.checked || false;
        let sgst = 0, cgst = 0, igst = 0;
        if (isInter) {
            igst = taxable * (taxRate / 100);
        } else {
            sgst = taxable * (taxRate / 200);
            cgst = taxable * (taxRate / 200);
        }
        const totalTax = sgst + cgst + igst;
        const grandTotal = taxable + totalTax;

        document.getElementById('si_subtotal').textContent = subtotal.toFixed(2);
        document.getElementById('si_taxable').textContent = taxable.toFixed(2);
        document.getElementById('si_sgst_val').textContent = sgst.toFixed(2);
        document.getElementById('si_cgst_val').textContent = cgst.toFixed(2);
        document.getElementById('si_igst_val').textContent = igst.toFixed(2);
        document.getElementById('si_grand_total').textContent = grandTotal.toFixed(2);

        const cd = document.getElementById('si_computed');
        cd.dataset.subtotal = subtotal;
        cd.dataset.taxable = taxable;
        cd.dataset.sgst = sgst;
        cd.dataset.cgst = cgst;
        cd.dataset.igst = igst;
        cd.dataset.taxPercent = taxRate;
        cd.dataset.isInter = isInter;
        cd.dataset.grandTotal = grandTotal;

        document.getElementById('si_sgst_row').classList.toggle('hidden', isInter);
        document.getElementById('si_cgst_row').classList.toggle('hidden', isInter);
        document.getElementById('si_igst_row').classList.toggle('hidden', !isInter);
    }

    function _buildNarrationJson(d) {
        return JSON.stringify({
            description: d.description || '',
            charges: {
                fright: +d.fright||0, fuel_chg: +d.fuel_chg||0, cod_chg: +d.cod_chg||0,
                topay_chg: +d.topay_chg||0, fov_chg: +d.fov_chg||0, eway_chg: +d.eway_chg||0,
                awb_chg: +d.awb_chg||0, pack_chg: +d.pack_chg||0, dev_chg: +d.dev_chg||0,
            },
            charges_subtotal: +d.charges_subtotal||0,
            taxable: +d.taxable||0,
            sgst: +d.sgst||0, cgst: +d.cgst||0, igst: +d.igst||0,
            tax_percent: +d.tax_percent||0,
            is_inter_state: d.is_inter_state === 'true',
            grand_total: +d.grand_total||0,
        });
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

        // Build lookup maps
        if (appData?.B2B) Object.values(appData.B2B).forEach(c => {
            if (c.CODE) _b2bMap.set(c.CODE.trim().toUpperCase(), c);
        });

        // Determine initial branch for dropdowns
        let defaultBranch = '';
        const firstClient = Object.values(appData?.B2B || {})[0];
        if (firstClient?.BRANCH) {
            defaultBranch = firstClient.BRANCH.toLowerCase();
        }

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

        let currentOpts = _getBranchDropdowns(defaultBranch);

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">➕ New Sales Invoice</h3></div>
                <div class="detail-card-body space-y-4">
                    <form id="siForm" class="space-y-4">

                        <!-- Header: Client + Branch + POS + Date -->
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                <input name="code" id="siCode" required class="form-input text-sm uppercase"
                                    placeholder="e.g. AGWL" list="siCodeList" autocomplete="off">
                                <datalist id="siCodeList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                <input name="branch" id="siBranch" readonly
                                    class="form-input text-sm uppercase bg-gray-50 text-gray-500" placeholder="Auto">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">POS State</label>
                                <input name="pos" id="siPos" readonly
                                    class="form-input text-sm bg-gray-50 text-gray-500" placeholder="Auto">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Date *</label>
                                <input name="inv_date" id="siDate" type="date" required class="form-input text-sm">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Due Days</label>
                                <input name="due_days" type="number" min="0" value="20" class="form-input text-sm">
                            </div>
                        </div>

                        <!-- Line Items -->
                        <div class="border rounded-lg overflow-hidden">
                            <div class="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</span>
                                <button type="button" id="siAddLine"
                                    class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                    + Add Line
                                </button>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="w-full text-sm" id="siLinesTable">
                                    <thead>
                                        <tr class="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                                            <th class="py-2 px-2 text-left" style="min-width:160px">Item</th>
                                            <th class="py-2 px-2 text-left" style="min-width:140px">Description</th>
                                            <th class="py-2 px-2 text-right" style="min-width:60px">Qty</th>
                                            <th class="py-2 px-2 text-right" style="min-width:90px">Unit Price</th>
                                            <th class="py-2 px-2 text-left" style="min-width:130px">Tax Code</th>
                                            <th class="py-2 px-2 text-right" style="min-width:80px">Amount</th>
                                            <th class="py-2 px-2" style="min-width:32px"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="siLineRows"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Totals -->
                        <div class="border rounded-lg p-3 bg-gray-50 space-y-1.5 text-sm" id="siTotals">
                            <div class="flex justify-between text-gray-600">
                                <span>Subtotal</span>
                                <span id="si_subtotal" class="font-medium">₹0.00</span>
                            </div>
                            <div class="flex justify-between text-gray-600" id="si_sgst_row">
                                <span>SGST</span><span id="si_sgst_val" class="font-medium">₹0.00</span>
                            </div>
                            <div class="flex justify-between text-gray-600" id="si_cgst_row">
                                <span>CGST</span><span id="si_cgst_val" class="font-medium">₹0.00</span>
                            </div>
                            <div class="flex justify-between text-gray-600 hidden" id="si_igst_row">
                                <span>IGST</span><span id="si_igst_val" class="font-medium">₹0.00</span>
                            </div>
                            <div class="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-1">
                                <span>Grand Total</span>
                                <span id="si_grand_total" class="text-indigo-700 text-base">₹0.00</span>
                            </div>
                        </div>

                        <!-- Description / Narration -->
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration / Description</label>
                            <input name="narration" class="form-input text-sm" placeholder="Invoice notes (optional)">
                        </div>

                        <!-- Submit -->
                        <div class="flex justify-between items-center pt-2 border-t">
                            <div id="siResponse" class="hidden text-sm"></div>
                            <button type="submit" id="siSubmitBtn" class="btn btn-sm flex items-center gap-2 ml-auto">
                                <span id="siBtnText">Create Invoice</span>
                                <div id="siSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;

        // Populate client datalist from B2B map
        const dl = document.getElementById('siCodeList');
        _b2bMap.forEach((rec, code) => {
            const o = document.createElement('option');
            o.value = code;
            o.label = `${code} — ${rec.B2B_NAME || ''}`;
            dl.appendChild(o);
        });

        // Auto-fill branch + POS from B2B and update dropdown options based on branch
        function _applyClientAutofill() {
            const code = document.getElementById('siCode').value.trim().toUpperCase();
            const b2b  = _b2bMap.get(code);
            if (!b2b) return;
            const branch = (b2b.BRANCH || '').toUpperCase();
            document.getElementById('siBranch').value = branch;
            document.getElementById('siPos').value    = b2b.CODE_STATE || b2b.STATE_CODE || '';

            // Update line item dropdown options dynamically for the branch
            currentOpts = _getBranchDropdowns(branch);
            document.querySelectorAll('#siLineRows tr').forEach(tr => {
                const itemSel = tr.querySelector('.si-item');
                const tcSel = tr.querySelector('.si-tc');
                if (itemSel && tcSel) {
                    const prevItem = itemSel.value;
                    const prevTc = tcSel.value;

                    itemSel.innerHTML = currentOpts.itemOpts;
                    tcSel.innerHTML = currentOpts.tcOpts;

                    if (currentOpts.itemNames.includes(prevItem)) itemSel.value = prevItem;
                    if (currentOpts.taxCodeNames.includes(prevTc)) tcSel.value = prevTc;
                }
            });
        }
        const siCodeEl = document.getElementById('siCode');
        siCodeEl.addEventListener('input',  _applyClientAutofill);
        siCodeEl.addEventListener('change', _applyClientAutofill);

        // Default date = today
        document.getElementById('siDate').value = new Date().toISOString().split('T')[0];

        // ── Line management ────────────────────────────────────────────────────
        let _lineCount = 0;

        function _addLine(defaultItem = '', defaultTc = '') {
            const idx = _lineCount++;
            const tr  = document.createElement('tr');
            tr.id     = `siLine_${idx}`;
            tr.className = 'border-t border-gray-100';
            tr.innerHTML = `
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs si-item" data-idx="${idx}" style="min-width:140px">
                        ${currentOpts.itemOpts}
                    </select>
                </td>
                <td class="py-1.5 px-2">
                    <input type="text" class="form-input text-xs si-desc" placeholder="Description" style="min-width:120px">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs si-qty text-right" value="1" min="0.001" step="any" style="min-width:55px">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs si-price text-right" value="" min="0" step="0.01" placeholder="0.00" style="min-width:80px">
                </td>
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs si-tc" style="min-width:120px">
                        ${currentOpts.tcOpts}
                    </select>
                </td>
                <td class="py-1.5 px-2 text-right">
                    <span class="si-amt text-gray-700 font-medium text-xs">₹0.00</span>
                </td>
                <td class="py-1.5 px-2 text-center">
                    <button type="button" class="si-remove text-red-400 hover:text-red-600 text-lg leading-none" title="Remove line">×</button>
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

            try {
                const clientCode = raw.code.trim().toUpperCase();

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
                    IssueDate:               raw.inv_date,
                    DueDateDays:             parseInt(raw.due_days) || 20,
                    Customer:                clientCode,
                    Description:             raw.narration || undefined,
                    Lines:                   lines,
                    TaxCodeEnabled:          true,
                    HasLineNumber:           true,
                    Rounding:                true,
                };

                const url = `/api/manager/invoices?code=${encodeURIComponent(clientCode)}`;
                const res = await callApi(url, payload, 'POST');
                const refNum = res.Reference || res.reference || 'created';
                resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                resp.textContent = `✅ Invoice ${refNum} created in Manager.io.`;
                resp.classList.remove('hidden');
                await load();
            } catch (err) {
                resp.className = 'mt-2 text-sm bg-red-100 text-red-800 px-3 py-2 rounded';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
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
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Status</label>
                            <select id="siFilterStatus" class="form-input text-xs">
                                <option value="">All Statuses</option>
                                <option value="paid">Paid</option>
                                <option value="comingdue">Coming Due</option>
                                <option value="overdue">Overdue</option>
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
                _filterStatus = document.getElementById('siFilterStatus').value;
                modal.classList.add('hidden');
                await load();
            };
            
            document.getElementById('siResetBtn').onclick = async () => {
                const range = getCurrentFYRange();
                document.getElementById('siFilterStart').value = range.start;
                document.getElementById('siFilterEnd').value = range.end;
                document.getElementById('siFilterBranch').value = '';
                document.getElementById('siFilterStatus').value = '';
                
                _filterStart = range.start;
                _filterEnd = range.end;
                _filterBranch = '';
                _filterStatus = '';
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

        document.getElementById('vaultListMsg').textContent = 'Loading invoices from Manager.io...';
        try {
            const branch = VaultPage.getActiveBranch();
            const url = `/api/manager/all-sales-invoices?startDate=${_filterStart || ''}&endDate=${_filterEnd || ''}&branch=${branch || ''}`;
            const res = await callApi(url, {}, 'GET');
            if (res.status === 'success') {
                _allInvoices = res.invoices || [];
                document.getElementById('vaultListMsg').textContent = '';
                _renderList();
            } else {
                document.getElementById('vaultListMsg').textContent = 'Failed to load invoices from Manager.io.';
            }
        } catch (err) {
            document.getElementById('vaultListMsg').textContent = 'Error: ' + (err.message || err);
        }
    }

    return { load, search, openAddPane, _handleDelete, _recalc, _printEntry, _openEditPaneFromDetail };
})();

window.VaultSalesInvoices = VaultSalesInvoices;
