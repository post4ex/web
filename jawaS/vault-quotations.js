// ============================================================================
// VAULT-QUOTATIONS.JS — Sales Quotations via Manager.io
// Tile: quotations
// API:  GET  /api/manager/quotes?code=XXX      — list all quotes
//       POST /api/manager/quotes?code=XXX      — create quote
//       GET  /api/manager/quotes/:key?code=XXX — fetch single quote
//       PUT  /api/manager/quotes/:key?code=XXX — update quote
//       DELETE /api/manager/quotes/:key?code=XXX — delete quote
// ============================================================================

const VaultQuotations = (() => {

    let _allQuotes = [];
    let _clientCode = null;
    let _b2bMap = new Map();

    // ── FY default date range ─────────────────────────────────────────────────
    function getCurrentFYRange() {
        const now = new Date();
        const currentYear = now.getFullYear();
        let startYear = currentYear;
        if (now.getMonth() < 3) startYear = currentYear - 1;
        return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
    }
    const _fyRange = getCurrentFYRange();

    // ── Filter state ──────────────────────────────────────────────────────────
    let _filterStart = _fyRange.start;
    let _filterEnd   = _fyRange.end;
    let _filterStatus = '';

    // ── Helpers ───────────────────────────────────────────────────────────────
    function _getCode() {
        if (_clientCode) return _clientCode;
        try { _clientCode = window.__vaultCode || localStorage.getItem('vault_code') || ''; } catch (_) {}
        return _clientCode || '';
    }

    function _fmtDate(str) {
        if (!str) return '—';
        const d = new Date(str + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function _fmtAmt(v) {
        return '₹' + (parseFloat(v) || 0).toFixed(2);
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _titleCase(str) {
        return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }

    function _parseTaxRate(tcName) {
        const m = (tcName || '').match(/(\d+(\.\d+)?)\s*%?/);
        return m ? parseFloat(m[1]) : 18;
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

    // ── List rendering ────────────────────────────────────────────────────────
    function _getFilteredQuotes() {
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        return _allQuotes.filter(x => {
            if (q) {
                const matchText = (x.reference || '').toLowerCase().includes(q) ||
                    (x.customer || '').toLowerCase().includes(q) ||
                    (x.description || '').toLowerCase().includes(q);
                if (!matchText) return false;
            }
            const d = x.date || x.Date || '';
            if (_filterStart && d < _filterStart) return false;
            if (_filterEnd && d > _filterEnd) return false;
            if (_filterStatus) {
                const st = (x.status || '').toLowerCase();
                if (st !== _filterStatus.toLowerCase()) return false;
            }
            return true;
        });
    }

    function _getStatusBadge(status) {
        if (!status) return '';
        const s = status.toLowerCase();
        let cls = 'bg-gray-100 text-gray-600';
        if (s === 'active' || s === 'draft') cls = 'bg-blue-100 text-blue-700';
        else if (s === 'accepted' || s === 'approved') cls = 'bg-green-100 text-green-700';
        else if (s === 'declined' || s === 'rejected') cls = 'bg-red-100 text-red-700';
        else if (s === 'expired') cls = 'bg-amber-100 text-amber-700';
        else if (s === 'sent') cls = 'bg-indigo-100 text-indigo-700';
        return `<span class="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${cls}">${status}</span>`;
    }

    function _renderList(quotes) {
        const ul = document.getElementById('vaultList');
        const st = document.getElementById('quotStatus');
        if (!ul) return;

        if (st) {
            const total = _allQuotes.length;
            st.textContent = `Showing ${quotes.length} of ${total} Quotations`;
        }

        if (!quotes || !quotes.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No matching quotations found.</li>';
            return;
        }
        ul.innerHTML = quotes.map(q => {
            const total = q.totalAmount != null ? _fmtAmt(q.totalAmount) : '—';
            const customer = q.customer || q.Customer || '—';
            const ref = q.reference || q.Reference || '—';
            const date = _fmtDate(q.date || q.Date);
            const status = _getStatusBadge(q.status || q.Status);
            return `<li data-key="${q.key}" class="p-3 rounded-lg cursor-pointer hover:bg-cyan-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <strong class="text-cyan-700 block text-sm flex-1 min-w-0 truncate">📋 ${ref} — ${customer}</strong>
                    ${status}
                </div>
                <div class="flex justify-between mt-1">
                    <span class="text-xs text-gray-500">${date}</span>
                    <span class="text-xs font-semibold text-indigo-700">${total}</span>
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _fetchAndRenderDetail(li.dataset.key);
            })
        );
    }

    function search(q) {
        _applyFilters();
    }

    function _applyFilters() {
        const filtered = _getFilteredQuotes();
        _renderList(filtered);
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    async function _handleDelete(key) {
        if (!confirm('Delete this quotation from Manager.io permanently?\n\nThis action cannot be undone.')) return;
        window.setLoading?.(true, 'Deleting quotation...', 'detail');
        try {
            const code = _getCode();
            await callApi(`/api/manager/quotes/${key}?code=${encodeURIComponent(code)}`, null, 'DELETE');
            await load();
            document.getElementById('vaultDetailView').innerHTML =
                `<div class="detail-card"><div class="detail-card-body text-center py-8">
                    <div class="text-4xl mb-3">🗑️</div>
                    <p class="text-gray-500 text-sm">Quotation deleted.</p>
                </div></div>`;
        } catch (err) {
            alert('Failed: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Detail view ───────────────────────────────────────────────────────────
    async function _fetchAndRenderDetail(key) {
        const view = document.getElementById('vaultDetailView');
        VaultPage.showDetail(true);
        view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8">
            <p class="text-gray-500 text-sm">Fetching quotation details from Manager.io...</p>
        </div></div>`;
        VaultPage.showDetailPane();
        window.setLoading?.(true, 'Fetching quotation...', 'detail');
        try {
            const code = _getCode();
            const data = await callApi(`/api/manager/quotes/${key}?code=${encodeURIComponent(code)}`, {}, 'GET');
            await _renderDetail(key, data);
        } catch (err) {
            view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-red-600"><p class="text-sm">Failed to load: ${err.message || err}</p></div></div>`;
        } finally {
            window.setLoading?.(false);
        }
    }

    async function _renderDetail(key, data) {
        const view = document.getElementById('vaultDetailView');
        VaultPage.showDetail(true);

        const ref      = data.Reference || data.reference || '—';
        const date     = data.Date || data.date || '';
        const desc     = data.Description || data.description || '';
        const validDays = data.ValidDays || data.validDays || 30;
        const status   = data.Status || data.status || '';

        // Compute total and tax from lines
        const lines = data.Lines || data.lines || [];
        let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
        lines.forEach(line => {
            const unitPrice = parseFloat(line.SalesUnitPrice || 0);
            const qty       = parseFloat(line.Qty || 1);
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

        const linesRows = lines.map(line => {
            const qty   = parseFloat(line.Qty || 1);
            const price = parseFloat(line.SalesUnitPrice || 0);
            const lineAmt = qty * price;
            const taxCodeLabel = line.TaxCode === 'c9228485-7a58-4ccb-89e8-fe025e20261d' ? 'CGST/SGST 18%' :
                                 line.TaxCode === '16e26b59-06ca-49ab-ba1c-a2c36711683e' ? 'IGST 18%' : 'Exempt/Nil';
            let descText = line.LineDescription || 'Charges';
            if (qty !== 1) {
                descText += ` (${qty} × ₹${price.toFixed(2)})`;
            }
            return `
                <tr class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-4 py-2.5 text-gray-700 font-medium">${descText}</td>
                    <td class="px-4 py-2.5 text-right text-gray-500">${taxCodeLabel}</td>
                    <td class="px-4 py-2.5 text-right text-gray-900 font-semibold">₹${lineAmt.toFixed(2)}</td>
                </tr>`;
        }).join('');

        // Fetch live customer details from Manager.io
        let customerName = data.Customer || data.customer || 'N/A';
        let customerAddr = '';
        let customerGst = '';

        try {
            const appData = await getAppData();
            let clientCode = '';
            if (appData?.B2B) {
                const activeBranch = VaultPage.getActiveBranch();
                Object.values(appData.B2B).forEach(c => {
                    if ((c.BRANCH || '').toLowerCase() === (activeBranch || '').toLowerCase()) {
                        clientCode = c.CODE;
                    }
                });
                if (!clientCode) clientCode = _getCode();
            }
            if (clientCode && (data.Customer || data.customer)) {
                const custKey = data.Customer || data.customer;
                if (custKey.length === 36 && custKey.includes('-')) {
                    const cust = await callApi(`/api/manager/customers/${custKey}?code=${encodeURIComponent(clientCode)}`, {}, 'GET');
                    if (cust) {
                        customerName = cust.Name || customerName;
                        customerAddr = cust.BillingAddress || '';
                        if (cust.CustomFields) {
                            customerGst = cust.CustomFields["37a9097b-398e-4227-bd32-f483ddc4ea3a"] || '';
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Failed to fetch customer details for viewer:", err);
        }

        // Render detail view
        const listEntry = _allQuotes.find(q => q.key === key) || {};
        const branchCode = listEntry.branch || '';
        const statusHtml = status ? `<span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-cyan-50 text-cyan-700 uppercase whitespace-nowrap">${status}</span>` : '';

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <!-- Quotation Header -->
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-5">
                        <div class="flex-1 min-w-0">
                            <h1 class="text-xl font-bold text-cyan-800 tracking-tight break-words">Quotation</h1>
                            <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-semibold text-gray-700">${branchCode || 'N/A'}</span></p>
                        </div>
                        <div class="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                            <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                                ${statusHtml}
                                <button onclick="VaultQuotations._handleConvertToInvoice('${key}', event)"
                                    class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg><span class="truncate">Invoice</span>
                                </button>
                                <button onclick="VaultQuotations._handlePrint('${key}')"
                                    class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg><span class="truncate">Print</span>
                                </button>
                                <button onclick="VaultQuotations._handleEdit('${key}')"
                                    class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg><span class="truncate">Edit</span>
                                </button>
                                <button onclick="VaultQuotations._handleDelete('${key}')"
                                    class="btn-danger btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg><span class="truncate">Delete</span>
                                </button>
                            </div>
                            <p class="text-sm text-gray-500">Quotation #: <span class="font-bold text-gray-800">${_escapeHtml(ref)}</span></p>
                            <p class="text-xs text-gray-400">Date: ${date ? date.split('T')[0] : 'N/A'}${validDays ? ` · Valid: ${validDays} days` : ''}</p>
                        </div>
                    </div>

                    <!-- Customer & Details -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                        <div>
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Customer</h3>
                            <p class="font-semibold text-gray-800">${_escapeHtml(customerName)}</p>
                            ${customerAddr ? `<p class="text-xs text-gray-500 mt-1">${_escapeHtml(customerAddr).replace(/\n/g, '<br>')}</p>` : ''}
                            ${customerGst ? `<p class="text-xs text-gray-500 mt-1">GSTIN: <span class="font-semibold text-gray-700">${_escapeHtml(customerGst)}</span></p>` : ''}
                        </div>
                        <div>
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Quotation Details</h3>
                            <p class="text-gray-600">Valid For: <span class="font-medium text-gray-800">${validDays} Days</span></p>
                            <p class="text-gray-600 mt-0.5">Reference: <span class="font-bold text-cyan-700">${_escapeHtml(ref)}</span></p>
                        </div>
                    </div>

                    <!-- Description / Narration -->
                    ${desc ? `
                    <div class="bg-cyan-50/40 border border-cyan-100/50 rounded-lg p-3 text-xs text-cyan-950">
                        <span class="font-semibold block text-cyan-800 uppercase tracking-wider mb-1" style="font-size: 10px;">Description / Terms</span>
                        ${_escapeHtml(desc)}
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
                                ${linesRows || '<tr><td colspan="3" class="text-center py-4 text-gray-400 text-sm">No line items</td></tr>'}
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
                            </div>` : ''}
                            ${totalSgst > 0 ? `
                            <div class="flex justify-between text-gray-600">
                                <span>SGST @ 9%:</span>
                                <span class="font-medium text-amber-700">₹${totalSgst.toFixed(2)}</span>
                            </div>` : ''}
                            ${totalIgst > 0 ? `
                            <div class="flex justify-between text-gray-600">
                                <span>IGST @ 18%:</span>
                                <span class="font-medium text-amber-700">₹${totalIgst.toFixed(2)}</span>
                            </div>` : ''}
                            <div class="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-800 text-sm">
                                <span>Grand Total:</span>
                                <span class="text-cyan-800 font-extrabold">₹${computedGrandTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Form Metadata -->
                    <details class="text-[11px] text-gray-400">
                        <summary class="cursor-pointer hover:text-gray-600 transition-colors">Audit & System Metadata</summary>
                        <div class="grid grid-cols-2 gap-2 mt-2 p-2 border rounded-lg bg-gray-50/50">
                            <div>Tax Code Enabled: ${data.TaxCodeEnabled ? 'Yes' : 'No'}</div>
                            <div>Rounding Enabled: ${data.Rounding ? 'Yes' : 'No'}</div>
                            <div>Valid Days: ${validDays}</div>
                            <div>Manager UUID: <span class="font-mono text-[9px]">${data.Key || data.key || 'N/A'}</span></div>
                        </div>
                    </details>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Print ─────────────────────────────────────────────────────────────────
    async function _handlePrint(key) {
        window.setLoading?.(true, 'Preparing print...', 'detail');
        try {
            const code = _getCode();
            const [data, appData] = await Promise.all([
                callApi(`/api/manager/quotes/${key}?code=${encodeURIComponent(code)}`, {}, 'GET'),
                getAppData()
            ]);

            // Resolve client code from active branch
            let clientCode = '';
            const activeBranch = VaultPage.getActiveBranch();
            if (appData?.B2B) {
                Object.values(appData.B2B).forEach(c => {
                    if ((c.BRANCH || '').toLowerCase() === (activeBranch || '').toLowerCase()) {
                        clientCode = c.CODE;
                    }
                });
            }
            if (!clientCode) clientCode = _getCode();

            // Fetch live customer details before printing (like Sales Invoices)
            let customerName = (data.Customer || data.customer) || 'N/A';
            let customerAddr = '';
            let customerGst = '';
            const customerUuid = data.Customer || data.customer || '';
            if (customerUuid && customerUuid.length === 36 && customerUuid.includes('-') && clientCode) {
                try {
                    const cust = await callApi(`/api/manager/customers/${customerUuid}?code=${encodeURIComponent(clientCode)}`, {}, 'GET');
                    if (cust) {
                        customerName = cust.Name || customerName;
                        customerAddr = cust.BillingAddress || '';
                        if (cust.CustomFields) {
                            customerGst = cust.CustomFields["37a9097b-398e-4227-bd32-f483ddc4ea3a"] || '';
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch customer details for print:", err);
                    // Fall back to list entry name
                    const listQuote = _allQuotes.find(q => q.key === (data.Key || data.key || ''));
                    customerName = listQuote?.customer || customerName;
                }
            } else {
                // Fall back to list entry name
                const listQuote = _allQuotes.find(q => q.key === (data.Key || data.key || ''));
                customerName = listQuote?.customer || customerName;
            }

            _printQuote(data, appData, { customerName, customerAddr, customerGst, activeBranch, clientCode });
        } catch (err) {
            alert('Failed to load quote for printing: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    function _printQuote(data, appData, opts) {
        const ref       = data.Reference || data.reference || 'N/A';
        const date      = data.Date || data.date || '';
        const desc      = data.Description || data.description || '';
        const validDays = data.ValidDays || data.validDays || 30;
        const lines     = data.Lines || data.lines || [];

        const customerName = opts.customerName || 'N/A';
        const customerAddr = opts.customerAddr || '';
        const customerGst  = opts.customerGst  || '';
        const activeBranch = opts.activeBranch || '';
        const clientCode   = opts.clientCode   || '';

        // Try to resolve branch details
        let branch = null;
        if (appData?.BRANCHES) {
            Object.values(appData.BRANCHES).forEach(b => {
                if ((b.BRANCH_CODE || '').toLowerCase() === (activeBranch || '').toLowerCase()) {
                    branch = b;
                }
            });
        }
        const branchName  = branch?.BRANCH_NAME  || (activeBranch || '').toUpperCase();
        const branchAddr  = branch?.BRANCH_ADDRESS || '';
        const branchCity  = branch?.BRANCH_CITY   || 'local';
        const branchState = branch?.BRANCH_STATE  || '';
        const branchMobile = branch?.BRANCH_MOBILE || '';
        const branchEmail  = branch?.BRANCH_EMAIL  || '';
        const branchPan    = branch?.BRANCH_PAN    || '';
        const branchGstin  = branch?.BRANCH_GSTIN  || '';

        // Compute totals
        let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
        const linesHtml = lines.map((ln, i) => {
            const desc  = ln.LineDescription || ln.lineDescription || '';
            const qty   = ln.Qty || ln.qty || 1;
            const price = ln.SalesUnitPrice || ln.salesUnitPrice || 0;
            const lineAmt = qty * price;
            totalTaxable += lineAmt;
            if (ln.TaxCode === 'c9228485-7a58-4ccb-89e8-fe025e20261d') {
                totalCgst += lineAmt * 0.09;
                totalSgst += lineAmt * 0.09;
            } else if (ln.TaxCode === '16e26b59-06ca-49ab-ba1c-a2c36711683e') {
                totalIgst += lineAmt * 0.18;
            }
            return `<tr><td class="tc">${i + 1}</td><td>${_escapeHtml(desc)}</td><td class="tr">${qty}</td><td class="tr">₹${price.toFixed(2)}</td><td class="tr">₹${lineAmt.toFixed(2)}</td></tr>`;
        }).join('');

        totalCgst = Math.round(totalCgst * 100) / 100;
        totalSgst = Math.round(totalSgst * 100) / 100;
        totalIgst = Math.round(totalIgst * 100) / 100;
        const grandTotal = totalTaxable + totalCgst + totalSgst + totalIgst;

        const chargeRows = [
            `<tr><td>Taxable Subtotal</td><td class="tr">₹${totalTaxable.toFixed(2)}</td></tr>`,
            ...(totalCgst > 0 ? [`<tr><td>CGST @ 9%</td><td class="tr">₹${totalCgst.toFixed(2)}</td></tr>`] : []),
            ...(totalSgst > 0 ? [`<tr><td>SGST @ 9%</td><td class="tr">₹${totalSgst.toFixed(2)}</td></tr>`] : []),
            ...(totalIgst > 0 ? [`<tr><td>IGST @ 18%</td><td class="tr">₹${totalIgst.toFixed(2)}</td></tr>`] : []),
        ].join('');

        const css = `
            body{font-family:Arial,sans-serif;font-size:13px;color:#000;margin:0;padding:20px;background:#f5f5f5}
            .box{max-width:800px;margin:auto;background:#fff;padding:30px;border:1px solid #eee;box-shadow:0 0 10px rgba(0,0,0,.15)}
            .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0891b2;padding-bottom:15px;margin-bottom:20px}
            .tr{text-align:right}.tc{text-align:center}
            .info{display:flex;justify-content:space-between;margin-bottom:20px;gap:20px}
            .col{width:48%}.col h3{margin:0 0 5px;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px}.col p{margin:2px 0;font-size:12px}
            .div{width:1px;background:#ccc}.divb{height:2px;background:#0891b2;margin-bottom:20px}
            .meta{margin-bottom:20px;font-weight:bold;text-align:center}
            table{width:100%;border-collapse:collapse;margin-bottom:20px}table,th,td{border:1px solid #000}th,td{padding:6px;text-align:left}th{background:#f2f2f2}
            .tot{display:flex;justify-content:space-between;margin-bottom:20px;page-break-inside:avoid}
            .chg{width:55%}.chg table{margin-bottom:0}.chg th,.chg td{padding:4px 6px}
            .pay{width:40%}
            .terms{font-size:11px;margin-bottom:40px}.terms ol{margin:5px 0 0;padding-left:20px}
            .sig{text-align:right;font-weight:bold;margin-top:20px}.sigbox{display:inline-block;text-align:center;min-width:200px}
            @media print{@page{size:A4;margin:10mm}body{background:#fff;padding:0}.box{box-shadow:none;border:none}}
        `;

        const body = `
            <div class="box">
                <div class="hdr">
                    <div style="font-size:26px;font-weight:bold;text-transform:uppercase;color:#0891b2">Quotation</div>
                    <div style="text-align:right;font-size:12px">
                        <b>Quotation #:</b> ${_escapeHtml(ref)}<br>
                        <b>Date:</b> ${date.split('T')[0] || date}<br>
                        <b>Valid:</b> ${validDays} days
                    </div>
                </div>

                <div class="info">
                    <div class="col">
                        <h3>From: ${_escapeHtml(branchName)}</h3>
                        <p><b>Address:</b> ${_escapeHtml(branchAddr)}</p>
                        <p><b>City:</b> ${_escapeHtml(branchCity)}, ${_escapeHtml(branchState)}</p>
                        <p><b>Phone:</b> ${_escapeHtml(branchMobile)}</p>
                        <p><b>Email:</b> ${_escapeHtml(branchEmail)}</p>
                        ${branchPan ? `<p><b>PAN/GST:</b> ${_escapeHtml(branchPan)} / ${_escapeHtml(branchGstin)}</p>` : ''}
                    </div>
                    <div class="div"></div>
                    <div class="col">
                        <h3>To: ${_escapeHtml(customerName)}</h3>
                        ${customerAddr ? `<p>${_escapeHtml(customerAddr).replace(/\n/g, '<br>')}</p>` : ''}
                        ${customerGst ? `<p><b>GST:</b> ${_escapeHtml(customerGst)}</p>` : ''}
                    </div>
                </div>

                <div class="divb"></div>
                ${desc ? `<div class="meta"><p>${_escapeHtml(desc)}</p></div>` : ''}

                ${lines.length ? `
                <table>
                    <thead><tr><th class="tc">Sr</th><th>Description</th><th class="tr">Qty</th><th class="tr">Unit Price</th><th class="tr">Amount</th></tr></thead>
                    <tbody>${linesHtml}</tbody>
                </table>
                ` : ''}

                <div class="tot">
                    <div class="pay">
                        <p><b>Amount in words:</b><br>Rupees ${_numToWords(Math.round(grandTotal))} Only</p>
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
                    <ol>
                        <li>This quotation is valid for ${validDays} days from the date of issue.</li>
                        <li>All prices are in Indian Rupees (₹).</li>
                        <li>All disputes subject to ${_escapeHtml(branchCity)} Jurisdiction.</li>
                        <li>This is a computer-generated document; no signature required.</li>
                    </ol>
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

        const w = window.open('', 'Quotation_' + ref.replace(/[^a-zA-Z0-9]/g, '_'));
        if (!w) { alert('Pop-up blocked! Please allow pop-ups.'); return; }
        w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Quotation - ' + _escapeHtml(ref) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>');
        w.document.close();
    }

    // ── Convert to Invoice ────────────────────────────────────────────────────
    async function _handleConvertToInvoice(quoteKey, evt) {
        if (!confirm('Convert this quotation to a Sales Invoice? A new invoice will be created in Manager.io.')) return;
        window.setLoading?.(true, 'Converting to invoice...', 'detail');
        try {
            const code = _getCode();
            const btn = evt?.target?.closest('button');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"></span> Converting...'; }

            const res = await callApi(`/api/manager/quotes/convert-to-invoice?quote_key=${encodeURIComponent(quoteKey)}&code=${encodeURIComponent(code)}`, {}, 'POST');

            if (res.status === 'success') {
                alert(`✅ Quote converted to Invoice #${res.invoice_reference} in Manager.io!`);
                await load();
                document.getElementById('vaultDetailView').innerHTML = `
                    <div class="detail-card"><div class="detail-card-body text-center py-8">
                        <div class="text-4xl mb-3">🧾</div>
                        <p class="text-green-700 font-semibold">Invoice ${res.invoice_reference} created!</p>
                        <p class="text-gray-500 text-sm mt-1">Quote has been converted to a Sales Invoice.</p>
                    </div></div>`;
            }
        } catch (err) {
            alert('❌ Conversion failed: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Edit ──────────────────────────────────────────────────────────────────
    async function _handleEdit(key) {
        window.setLoading?.(true, 'Loading quotation for edit...', 'detail');
        try {
            const code = _getCode();
            const data = await callApi(`/api/manager/quotes/${key}?code=${encodeURIComponent(code)}`, {}, 'GET');
            await _openEditPane(key, data);
        } catch (err) {
            alert('Failed to load quote for editing: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function _openEditPane(key, data) {
        const btn = document.querySelector(`button[onclick*="_handleEdit('${key}')"]`);
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '...'; }

        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-gray-400 text-sm">Loading form data…</div></div>`;
        VaultPage.showDetailPane();

        try {
            const appData = await getAppData();

            // Load cache keys
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

            // Determine active branch
            const activeBranch = (VaultPage.getActiveBranch() || '').toLowerCase();

            // Build reverse UUID → name maps from cache keys for pre-filling dropdowns
            const _bKey = activeBranch;
            const _bKeys = window.__vaultCacheKeys?.[_bKey] || {};
            const _itemUuidToName = {};
            const _tcUuidToName = {};
            const _customerUuidToName = {};
            Object.entries(_bKeys.non_inventory_items || {}).forEach(([name, uuid]) => { _itemUuidToName[uuid] = name; });
            Object.entries(_bKeys.tax_codes || {}).forEach(([name, uuid]) => { _tcUuidToName[uuid] = name; });
            Object.entries(_bKeys.customers || {}).forEach(([name, uuid]) => { _customerUuidToName[uuid] = name; });

            const existingRef      = data.Reference || data.reference || '';
            const existingCustomer = data.Customer || data.customer || '';
            const existingDate     = data.Date || data.date || '';
            const existingDesc     = data.Description || data.description || '';
            const existingLines    = data.Lines || data.lines || [];
            const existingValidDays = data.ValidDays || data.validDays || 30;

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

            let currentOpts = _getBranchDropdowns(activeBranch);

            // Populate customer options from cache keys (names to UUIDs)
            const customersList = Object.entries(_bKeys.customers || {}).sort((a, b) => a[0].localeCompare(b[0]));
            const customerOpts = `<option value="">— Select Customer —</option>` +
                customersList.map(([name, uuid]) => {
                    const selected = uuid === existingCustomer ? 'selected' : '';
                    return `<option value="${uuid}" ${selected}>${_escapeHtml(name)}</option>`;
                }).join('');

            view.innerHTML = `
                <div class="detail-card rounded-2xl border border-slate-100 shadow-sm bg-white overflow-hidden">
                    <div class="h-1.5 bg-gradient-to-r from-amber-400 via-cyan-500 to-teal-500"></div>
                    <div class="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-650 shadow-sm">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-800 text-lg tracking-tight">Edit Quotation</h3>
                                <p class="text-xs text-slate-400">Update Sales Quotation — ${existingRef || key}</p>
                            </div>
                        </div>
                    </div>
                    <div class="detail-card-body p-6 space-y-6">
                        <div class="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-850/95 flex items-start gap-2.5 shadow-sm">
                            <svg class="w-4 h-4 shrink-0 text-amber-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                            <div>
                                <span class="font-bold">Notice:</span> Editing will update this quotation in Manager.io. The reference number <strong>${existingRef}</strong> is locked and will be preserved automatically.
                            </div>
                        </div>
                        <form id="quotEditForm" class="space-y-6">
                            <input type="hidden" name="quote_key" value="${key}">

                            <!-- Header: Customer, Date, Valid Days -->
                            <div class="bg-slate-50/50 p-4 rounded-xl border border-slate-100/80 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div class="md:col-span-1">
                                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Customer *</label>
                                    <select name="customer" id="quotEditCustomer" required class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                                        ${customerOpts}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Quotation Date *</label>
                                    <input name="date" id="quotEditDate" type="date" required class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" value="${existingDate.split('T')[0] || existingDate}">
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Valid Days</label>
                                    <input name="valid_days" type="number" min="1" class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" value="${existingValidDays}">
                                </div>
                            </div>

                            <!-- Line Items -->
                            <div class="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
                                <div class="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-100">
                                    <span class="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                                        Line Items
                                    </span>
                                    <button type="button" id="quotEditAddLine"
                                        class="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 bg-white border border-indigo-150/70 px-3 py-1.5 rounded-lg shadow-sm hover:shadow">
                                        ➕ Add Line
                                    </button>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm divide-y divide-slate-100" id="quotEditLinesTable">
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
                                        <tbody id="quotEditLineRows" class="divide-y divide-slate-100"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Narration + Totals -->
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                                <!-- Narration -->
                                <div class="md:col-span-2 space-y-1.5">
                                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500">Description / Terms</label>
                                    <textarea name="description" rows="3" class="form-input text-sm rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full" placeholder="Services, conditions, delivery terms…">${_escapeHtml(existingDesc)}</textarea>
                                </div>

                                <!-- Totals Box -->
                                <div class="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-4 border border-slate-150/60 space-y-3 text-sm flex flex-col justify-between" id="quotEditTotals">
                                    <div class="space-y-2">
                                        <div class="flex justify-between text-slate-500 font-medium">
                                            <span>Subtotal</span>
                                            <span id="qe_subtotal" class="font-bold text-slate-700">₹0.00</span>
                                        </div>
                                        <div class="flex justify-between text-slate-500 font-medium" id="qe_sgst_row">
                                            <span>SGST</span>
                                            <span id="qe_sgst_val" class="font-bold text-slate-700">₹0.00</span>
                                        </div>
                                        <div class="flex justify-between text-slate-500 font-medium" id="qe_cgst_row">
                                            <span>CGST</span>
                                            <span id="qe_cgst_val" class="font-bold text-slate-700">₹0.00</span>
                                        </div>
                                        <div class="flex justify-between text-slate-500 font-medium hidden" id="qe_igst_row">
                                            <span>IGST</span>
                                            <span id="qe_igst_val" class="font-bold text-slate-700">₹0.00</span>
                                        </div>
                                    </div>
                                    <div class="border-t border-slate-200 pt-3 flex justify-between items-center font-bold text-slate-800">
                                        <span class="text-xs uppercase tracking-wider text-slate-400">Grand Total</span>
                                        <span id="qe_grand_total" class="text-cyan-650 text-lg font-black tracking-tight">₹0.00</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Submit Bar -->
                            <div class="flex items-center justify-between pt-4 border-t border-slate-100">
                                <div id="quotEditResponse" class="hidden text-sm"></div>
                                <div class="flex gap-3 ml-auto">
                                    <button type="button" id="quotEditCancelBtn" class="btn btn-sm btn-ghost px-4 py-2 text-slate-500 font-semibold hover:bg-slate-50 rounded-lg">Cancel</button>
                                    <button type="submit" id="quotEditSubmitBtn" class="btn btn-sm bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-5 py-2 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2">
                                        <span id="quotEditBtnText">Update Quotation</span>
                                        <div id="quotEditSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>`;

            // Bind cancel event
            document.getElementById('quotEditCancelBtn').addEventListener('click', () => {
                _renderDetail(key, data);
            });

            // ── Line management ──
            let _lineCount = 0;

            function _addLine(defaultItem = '', defaultDesc = '', defaultQty = 1, defaultPrice = 0, defaultTc = '') {
                const idx = _lineCount++;
                const tr = document.createElement('tr');
                tr.id = `qeLine_${idx}`;
                tr.className = 'border-t border-slate-100';
                tr.innerHTML = `
                    <td class="py-2.5 px-4">
                        <select class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 qe-item w-full">${currentOpts.itemOpts}</select>
                    </td>
                    <td class="py-2.5 px-4">
                        <input type="text" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 qe-desc w-full" placeholder="Description" value="${_escapeHtml(defaultDesc)}">
                    </td>
                    <td class="py-2.5 px-4">
                        <input type="number" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 qe-qty text-right w-full" value="${defaultQty}" min="0.001" step="any">
                    </td>
                    <td class="py-2.5 px-4">
                        <input type="number" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 qe-price text-right w-full" value="${defaultPrice}" min="0" step="0.01">
                    </td>
                    <td class="py-2.5 px-4">
                        <select class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 qe-tc w-full">${currentOpts.tcOpts}</select>
                    </td>
                    <td class="py-2.5 px-4 text-right font-semibold text-slate-700">
                        <span class="qe-amt text-xs">₹0.00</span>
                    </td>
                    <td class="py-2.5 px-4 text-center">
                        <button type="button" class="qe-remove text-slate-350 hover:text-red-500 transition-colors" title="Remove line">
                            <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </td>`;
                document.getElementById('quotEditLineRows').appendChild(tr);

                if (defaultItem) tr.querySelector('.qe-item').value = defaultItem;
                if (defaultTc)   tr.querySelector('.qe-tc').value   = defaultTc;

                tr.querySelector('.qe-item').addEventListener('change', function() {
                    const descEl = tr.querySelector('.qe-desc');
                    if (!descEl.value) descEl.value = _titleCase(this.value);
                    _calcTotals();
                });
                tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', _calcTotals));
                tr.querySelector('.qe-remove').addEventListener('click', () => { tr.remove(); _calcTotals(); });
                _calcTotals();
            }

            function _calcTotals() {
                let subtotal = 0, sgst = 0, cgst = 0, igst = 0;
                document.querySelectorAll('#quotEditLineRows tr').forEach(tr => {
                    const qty   = parseFloat(tr.querySelector('.qe-qty')?.value  || 0);
                    const price = parseFloat(tr.querySelector('.qe-price')?.value || 0);
                    const tc    = (tr.querySelector('.qe-tc')?.value || '').toUpperCase();
                    const lineAmt = qty * price;
                    subtotal += lineAmt;
                    tr.querySelector('.qe-amt').textContent = '₹' + lineAmt.toFixed(2);
                    if (tc.includes('IGST')) {
                        igst += lineAmt * _parseTaxRate(tr.querySelector('.qe-tc').value) / 100;
                    } else if (tc && tc !== '') {
                        const rate = _parseTaxRate(tr.querySelector('.qe-tc').value);
                        sgst += lineAmt * rate / 200;
                        cgst += lineAmt * rate / 200;
                    }
                });
                const grandTotal = subtotal + sgst + cgst + igst;
                document.getElementById('qe_subtotal').textContent    = '₹' + subtotal.toFixed(2);
                document.getElementById('qe_sgst_val').textContent    = '₹' + sgst.toFixed(2);
                document.getElementById('qe_cgst_val').textContent    = '₹' + cgst.toFixed(2);
                document.getElementById('qe_igst_val').textContent    = '₹' + igst.toFixed(2);
                document.getElementById('qe_grand_total').textContent = '₹' + grandTotal.toFixed(2);
                document.getElementById('qe_sgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
                document.getElementById('qe_cgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
                document.getElementById('qe_igst_row').classList.toggle('hidden', igst === 0);
            }

            // Populate existing lines (convert UUIDs back to friendly names)
            if (existingLines.length) {
                existingLines.forEach(ln => {
                    const itemUuid = ln.Item || '';
                    const itemName = _itemUuidToName[itemUuid] || itemUuid;
                    const desc  = ln.LineDescription || ln.lineDescription || '';
                    const qty   = ln.Qty || ln.qty || 1;
                    const price = ln.SalesUnitPrice || ln.salesUnitPrice || 0;
                    const tcUuid = ln.TaxCode || ln.taxCode || '';
                    const tcName = _tcUuidToName[tcUuid] || tcUuid;
                    _addLine(itemName, desc, qty, price, tcName);
                });
            } else {
                _addLine();
            }

            document.getElementById('quotEditAddLine').addEventListener('click', () => _addLine());

            // ── Submit ──
            document.getElementById('quotEditForm').addEventListener('submit', async e => {
                e.preventDefault();
                const fd  = new FormData(e.target);
                const raw = Object.fromEntries(fd);
                const btn = document.getElementById('quotEditSubmitBtn');
                const sp  = document.getElementById('quotEditSpinner');
                const resp = document.getElementById('quotEditResponse');
                btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
                window.setLoading?.(true, 'Updating quotation...', 'detail');

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

                    const lines = [];
                    document.querySelectorAll('#quotEditLineRows tr').forEach(tr => {
                        const item  = tr.querySelector('.qe-item')?.value  || '';
                        const desc  = tr.querySelector('.qe-desc')?.value  || '';
                        const qty   = parseFloat(tr.querySelector('.qe-qty')?.value  || 1);
                        const price = parseFloat(tr.querySelector('.qe-price')?.value || 0);
                        const tc    = tr.querySelector('.qe-tc')?.value || '';
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
                        IssueDate:    raw.date,
                        Reference:    existingRef || undefined,
                        Customer:     customerUuid,
                        Description:  raw.description || undefined,
                        Lines:        lines,
                        ValidDays:    parseInt(raw.valid_days) || 30,
                        TaxCodeEnabled: true,
                    };

                    const url = `/api/manager/quotes/${raw.quote_key}?code=${encodeURIComponent(clientCode)}`;
                    await callApi(url, payload, 'PUT');
                    resp.className = 'mt-2 text-sm bg-green-150 text-green-800 px-3 py-2 rounded-xl';
                    resp.textContent = `✅ Quotation updated in Manager.io!`;
                    resp.classList.remove('hidden');
                    await load();
                    // Re-fetch and render detail
                    const code = _getCode();
                    const freshData = await callApi(`/api/manager/quotes/${raw.quote_key}?code=${encodeURIComponent(code)}`, {}, 'GET');
                    _renderDetail(raw.quote_key, freshData);
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

    // ── Create form ───────────────────────────────────────────────────────────
    async function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-gray-400 text-sm">Loading form data…</div></div>`;
        VaultPage.showDetailPane();

        const appData = await getAppData();

        if (!window.__vaultCacheKeys) {
            try {
                window.__vaultCacheKeys = await callApi('/api/manager/cache/keys', {}, 'GET');
            } catch (err) {
                console.error("Failed to load cache keys inside form:", err);
                window.__vaultCacheKeys = {};
            }
        }

        if (appData?.B2B) Object.values(appData.B2B).forEach(c => {
            if (c.CODE) _b2bMap.set(c.CODE.trim().toUpperCase(), c);
        });

        const activeBranch = (VaultPage.getActiveBranch() || '').toLowerCase();

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

        const bKeys = window.__vaultCacheKeys?.[activeBranch] || {};
        const customersList = Object.entries(bKeys.customers || {}).sort((a, b) => a[0].localeCompare(b[0]));
        const customerOpts = `<option value="">— Select Customer —</option>` +
            customersList.map(([name, uuid]) => `<option value="${uuid}">${_escapeHtml(name)}</option>`).join('');

        view.innerHTML = `
            <div class="detail-card rounded-2xl border border-slate-100 shadow-sm bg-white overflow-hidden">
                <div class="h-1.5 bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500"></div>
                <div class="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600 shadow-sm">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-lg tracking-tight">New Quotation</h3>
                            <p class="text-xs text-slate-400">Create a new sales quotation synchronized with Manager.io</p>
                        </div>
                    </div>
                </div>
                <div class="detail-card-body p-6 space-y-6">
                    <form id="quotForm" class="space-y-6">

                        <!-- Header: Customer, Date, Valid Days -->
                        <div class="bg-slate-50/50 p-4 rounded-xl border border-slate-100/80 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="md:col-span-1">
                                <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Customer *</label>
                                <select name="customer" id="quotCustomer" required class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                                    ${customerOpts}
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Quotation Date *</label>
                                <input name="date" id="quotDate" type="date" required class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Valid Days</label>
                                <input name="valid_days" id="quotValidDays" type="number" min="1" value="30" class="form-input text-sm w-full rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                            </div>
                        </div>

                        <!-- Line Items -->
                        <div class="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
                            <div class="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-100">
                                <span class="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                                    Line Items
                                </span>
                                <button type="button" id="quotAddLine"
                                    class="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 bg-white border border-indigo-150/70 px-3 py-1.5 rounded-lg shadow-sm hover:shadow">
                                    ➕ Add Line
                                </button>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="w-full text-sm divide-y divide-slate-100" id="quotLinesTable">
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
                                    <tbody id="quotLineRows" class="divide-y divide-slate-100"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Narration + Totals -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="md:col-span-2 space-y-1.5">
                                <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500">Description / Terms</label>
                                <textarea name="description" rows="3" class="form-input text-sm rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full" placeholder="Services, conditions, delivery terms…"></textarea>
                            </div>

                            <div class="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-4 border border-slate-150/60 space-y-3 text-sm flex flex-col justify-between" id="quotTotals">
                                <div class="space-y-2">
                                    <div class="flex justify-between text-slate-500 font-medium">
                                        <span>Subtotal</span>
                                        <span id="quot_subtotal" class="font-bold text-slate-700">₹0.00</span>
                                    </div>
                                    <div class="flex justify-between text-slate-500 font-medium" id="quot_sgst_row">
                                        <span>SGST</span>
                                        <span id="quot_sgst_val" class="font-bold text-slate-700">₹0.00</span>
                                    </div>
                                    <div class="flex justify-between text-slate-500 font-medium" id="quot_cgst_row">
                                        <span>CGST</span>
                                        <span id="quot_cgst_val" class="font-bold text-slate-700">₹0.00</span>
                                    </div>
                                    <div class="flex justify-between text-slate-500 font-medium hidden" id="quot_igst_row">
                                        <span>IGST</span>
                                        <span id="quot_igst_val" class="font-bold text-slate-700">₹0.00</span>
                                    </div>
                                </div>
                                <div class="border-t border-slate-200 pt-3 flex justify-between items-center font-bold text-slate-800">
                                    <span class="text-xs uppercase tracking-wider text-slate-400">Grand Total</span>
                                    <span id="quot_grand_total" class="text-cyan-600 text-lg font-black tracking-tight">₹0.00</span>
                                </div>
                            </div>
                        </div>

                        <!-- Submit Bar -->
                        <div class="flex items-center justify-between pt-4 border-t border-slate-100">
                            <div id="quotResponse" class="hidden text-sm"></div>
                            <div class="flex gap-3 ml-auto">
                                <button type="button" onclick="VaultPage.showDetail(false)" class="btn btn-sm btn-ghost px-4 py-2 text-slate-500 font-semibold hover:bg-slate-50 rounded-lg">Cancel</button>
                                <button type="submit" id="quotSubmitBtn" class="btn btn-sm bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-5 py-2 rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2">
                                    <span id="quotBtnText">Save Quotation</span>
                                    <div id="quotSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>`;

        // Default date = today
        document.getElementById('quotDate').value = new Date().toISOString().split('T')[0];

        // ── Line management ──
        let _lineCount = 0;

        function _addLine(defaultItem = '', defaultTc = '') {
            const idx = _lineCount++;
            const tr  = document.createElement('tr');
            tr.id     = `quotLine_${idx}`;
            tr.className = 'border-t border-slate-100';
            tr.innerHTML = `
                <td class="py-2.5 px-4">
                    <select class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 quot-item w-full" data-idx="${idx}">
                        ${currentOpts.itemOpts}
                    </select>
                </td>
                <td class="py-2.5 px-4">
                    <input type="text" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 quot-desc w-full" placeholder="Description">
                </td>
                <td class="py-2.5 px-4">
                    <input type="number" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 quot-qty text-right w-full" value="1" min="0.001" step="any">
                </td>
                <td class="py-2.5 px-4">
                    <input type="number" class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 quot-price text-right w-full" value="" min="0" step="0.01" placeholder="0.00">
                </td>
                <td class="py-2.5 px-4">
                    <select class="form-input text-xs rounded-lg border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 quot-tc w-full">
                        ${currentOpts.tcOpts}
                    </select>
                </td>
                <td class="py-2.5 px-4 text-right font-semibold text-slate-700">
                    <span class="quot-amt text-xs">₹0.00</span>
                </td>
                <td class="py-2.5 px-4 text-center">
                    <button type="button" class="quot-remove text-slate-350 hover:text-red-500 transition-colors" title="Remove line">
                        <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </td>`;
            document.getElementById('quotLineRows').appendChild(tr);

            if (defaultItem) tr.querySelector('.quot-item').value = defaultItem;
            if (defaultTc)   tr.querySelector('.quot-tc').value   = defaultTc;

            tr.querySelector('.quot-item').addEventListener('change', function() {
                const descEl = tr.querySelector('.quot-desc');
                if (!descEl.value) descEl.value = _titleCase(this.value);
                _calcTotals();
            });

            tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', _calcTotals));
            tr.querySelector('.quot-remove').addEventListener('click', () => { tr.remove(); _calcTotals(); });

            _calcTotals();
        }

        function _calcTotals() {
            let subtotal = 0, sgst = 0, cgst = 0, igst = 0;

            document.querySelectorAll('#quotLineRows tr').forEach(tr => {
                const qty   = parseFloat(tr.querySelector('.quot-qty')?.value  || 0);
                const price = parseFloat(tr.querySelector('.quot-price')?.value || 0);
                const tc    = (tr.querySelector('.quot-tc')?.value || '').toUpperCase();
                const lineAmt = qty * price;
                subtotal += lineAmt;
                tr.querySelector('.quot-amt').textContent = '₹' + lineAmt.toFixed(2);

                if (tc.includes('IGST')) {
                    const rate = _parseTaxRate(tr.querySelector('.quot-tc').value);
                    igst += lineAmt * rate / 100;
                } else if (tc && tc !== '') {
                    const rate = _parseTaxRate(tr.querySelector('.quot-tc').value);
                    sgst += lineAmt * rate / 200;
                    cgst += lineAmt * rate / 200;
                }
            });

            const grandTotal = subtotal + sgst + cgst + igst;
            document.getElementById('quot_subtotal').textContent  = '₹' + subtotal.toFixed(2);
            document.getElementById('quot_sgst_val').textContent  = '₹' + sgst.toFixed(2);
            document.getElementById('quot_cgst_val').textContent  = '₹' + cgst.toFixed(2);
            document.getElementById('quot_igst_val').textContent  = '₹' + igst.toFixed(2);
            document.getElementById('quot_grand_total').textContent = '₹' + grandTotal.toFixed(2);
            document.getElementById('quot_sgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
            document.getElementById('quot_cgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
            document.getElementById('quot_igst_row').classList.toggle('hidden', igst === 0);
        }

        _addLine();
        document.getElementById('quotAddLine').addEventListener('click', () => _addLine());

        // ── Submit ──
        document.getElementById('quotForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd  = new FormData(e.target);
            const raw = Object.fromEntries(fd);
            const btn = document.getElementById('quotSubmitBtn');
            const sp  = document.getElementById('quotSpinner');
            const resp = document.getElementById('quotResponse');
            btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
            window.setLoading?.(true, 'Saving quotation...', 'detail');

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

                const lines = [];
                document.querySelectorAll('#quotLineRows tr').forEach(tr => {
                    const item  = tr.querySelector('.quot-item')?.value  || '';
                    const desc  = tr.querySelector('.quot-desc')?.value  || '';
                    const qty   = parseFloat(tr.querySelector('.quot-qty')?.value  || 1);
                    const price = parseFloat(tr.querySelector('.quot-price')?.value || 0);
                    const tc    = tr.querySelector('.quot-tc')?.value || '';
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
                    IssueDate:    raw.date,
                    Customer:     customerUuid,
                    Description:  raw.description || undefined,
                    Lines:        lines,
                    ValidDays:    parseInt(raw.valid_days) || 30,
                    TaxCodeEnabled: true,
                };

                const url = `/api/manager/quotes?code=${encodeURIComponent(clientCode)}`;
                const res = await callApi(url, payload, 'POST');
                const refNum = res.Reference || res.reference || 'created';
                resp.className = 'mt-2 text-sm bg-green-150 text-green-800 px-3 py-2 rounded-xl';
                resp.textContent = `✅ Quotation ${refNum} created in Manager.io.`;
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

    // ── UI Injection ──────────────────────────────────────────────────────────
    function _injectUI() {
        const listPane = document.getElementById('vaultListPane');
        const header   = listPane?.querySelector('.sv-pane-header');
        if (header && !document.getElementById('quotFilterBtn')) {
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
            filterBtn.id = 'quotFilterBtn';
            filterBtn.className = 'btn-ghost btn-sm flex-shrink-0';
            filterBtn.title = 'Filter Quotations';
            filterBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>`;
            filterBtn.onclick = () => document.getElementById('quotFilterModal')?.classList.remove('hidden');
            searchRow?.appendChild(filterBtn);
        }

        if (!document.getElementById('quotStatus')) {
            const statusEl = document.createElement('p');
            statusEl.id = 'quotStatus';
            statusEl.className = 'text-xs text-gray-500 px-4 pt-2 text-center font-medium';
            statusEl.textContent = 'Loading...';
            const container = document.getElementById('vaultList')?.parentElement;
            container?.insertBefore(statusEl, document.getElementById('vaultList'));
        }

        if (!document.getElementById('quotFilterModal')) {
            const modal = document.createElement('div');
            modal.id = 'quotFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h2 class="text-lg font-bold text-gray-800">Filter Quotations</h2>
                        <button onclick="document.getElementById('quotFilterModal').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Start Date</label>
                            <input type="date" id="quotFilterStart" class="form-input text-xs" value="${_filterStart}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">End Date</label>
                            <input type="date" id="quotFilterEnd" class="form-input text-xs" value="${_filterEnd}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Status</label>
                            <select id="quotFilterStatus" class="form-input text-xs">
                                <option value="">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="accepted">Accepted</option>
                                <option value="declined">Declined</option>
                                <option value="expired">Expired</option>
                                <option value="draft">Draft</option>
                                <option value="sent">Sent</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button id="quotResetBtn" class="btn-ghost btn-sm">Reset</button>
                        <button id="quotApplyBtn" class="btn btn-sm">Apply Filters</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

            document.getElementById('quotApplyBtn').onclick = () => {
                _filterStart = document.getElementById('quotFilterStart').value;
                _filterEnd = document.getElementById('quotFilterEnd').value;
                _filterStatus = document.getElementById('quotFilterStatus').value;
                modal.classList.add('hidden');
                _applyFilters();
            };

            document.getElementById('quotResetBtn').onclick = () => {
                document.getElementById('quotFilterStart').value = _fyRange.start;
                document.getElementById('quotFilterEnd').value   = _fyRange.end;
                document.getElementById('quotFilterStatus').value = '';
                _filterStart  = _fyRange.start;
                _filterEnd    = _fyRange.end;
                _filterStatus = '';
                _applyFilters();
            };
        }
    }

    function _recalc() {}

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load(code) {
        if (code) {
            _clientCode = code;
        } else {
            _clientCode = null;
        }
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by reference, customer…';
        document.getElementById('vaultSearch').oninput = e => search(e.target.value);

        _injectUI();

        if (!window.__vaultCacheKeys) {
            try {
                window.__vaultCacheKeys = await callApi('/api/manager/cache/keys', {}, 'GET');
            } catch (err) {
                console.error("Failed to pre-fetch cache keys in quotations load:", err);
            }
        }

        window.setLoading?.(true, 'Loading quotations...', 'list');
        try {
            const activeBranch = VaultPage.getActiveBranch();
            if (activeBranch && !_clientCode) {
                const appData = await getAppData();
                if (appData?.B2B) {
                    const client = Object.values(appData.B2B).find(c => (c.BRANCH || '').toLowerCase() === activeBranch.toLowerCase());
                    if (client) {
                        _clientCode = client.CODE;
                    }
                }
            }

            const c = _clientCode || _getCode();
            if (!c) {
                document.getElementById('vaultListMsg').textContent = 'No client code resolved for selected branch.';
                return;
            }
            document.getElementById('vaultListMsg').textContent = 'Loading…';
            const data = await callApi(`/api/manager/quotes?code=${encodeURIComponent(c)}`, {}, 'GET');
            _allQuotes = data.salesQuotes || data.quotes || [];
            document.getElementById('vaultListMsg').textContent = '';
            _renderList(_getFilteredQuotes());
        } catch (err) {
            document.getElementById('vaultListMsg').textContent = 'Failed to load: ' + (err.message || err);
        } finally {
            window.setLoading?.(false);
        }
    }

    return { load, search, openAddPane, _handleDelete, _handleEdit, _handlePrint, _handleConvertToInvoice, _recalc };
})();

window.VaultQuotations = VaultQuotations;
