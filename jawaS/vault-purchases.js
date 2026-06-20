// ============================================================================
// VAULT-PURCHASES.JS — Purchase Bills via Manager.io API
// Tile: purchase-bills
// Data source: Manager.io /purchase-invoices endpoint
// ============================================================================

const VaultPurchases = (() => {

    let _allInvoices = [];
    let _b2bMap      = new Map();

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
        document.getElementById('vaultSearch').placeholder = 'Search by supplier, reference, description…';
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();

        const filtered = _allInvoices.filter(e => {
            if (q) {
                const matchSearch = (e.reference || '').toLowerCase().includes(q) ||
                                     (e.supplier || '').toLowerCase().includes(q) ||
                                     (e.description || '').toLowerCase().includes(q) ||
                                     (e.branch || '').toLowerCase().includes(q);
                if (!matchSearch) return false;
            }
            const d = e.date || '';
            if (_filterStart && d < _filterStart) return false;
            if (_filterEnd && d > _filterEnd) return false;
            if (_filterBranch && (e.branch || '').toLowerCase() !== _filterBranch.toLowerCase()) return false;
            if (_filterStatus && (e.status || '').toLowerCase() !== _filterStatus.toLowerCase()) return false;
            return true;
        });

        filtered.sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            return (b.reference || '').localeCompare(a.reference || '');
        });

        const statusEl = document.getElementById('pbStatus');
        if (statusEl) {
            statusEl.textContent = `Showing ${filtered.length} of ${_allInvoices.length} Purchase Bills`;
        }

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No matching purchase bills found.</li>`;
            return;
        }
        ul.innerHTML = filtered.map(e => {
            const amount = typeof e.amount === 'object' ? (e.amount?.value || 0) : (+e.amount || 0);
            const status = e.status || '';
            const statusColor = status.toUpperCase() === 'ACTIVE' ? 'text-green-700' :
                                status.toUpperCase() === 'OVERDUE' ? 'text-red-700' : 'text-gray-700';
            return `<li data-key="${e.key}" class="p-3 rounded-lg cursor-pointer hover:bg-orange-50 border border-gray-200 transition-colors">
                <strong class="text-orange-700 block text-sm">${e.reference || 'N/A'} — ${e.supplier || 'N/A'}</strong>
                <span class="text-xs text-gray-500">₹${(+amount).toFixed(2)} · ${e.date || ''} · ${e.branch || ''}</span>
                <div class="text-xs mt-1">
                    <span class="${statusColor} font-medium">${status || 'N/A'}</span>
                    <span class="text-gray-400"> · ${e.description || ''}</span>
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(_allInvoices.find(n => n.key === li.dataset.key));
            })
        );
    }

    function search() {
        _renderList();
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    async function _handleDelete(invKey, branchCode) {
        if (!invKey || !branchCode) {
            alert('Cannot delete: missing purchase bill key or branch.');
            return;
        }
        if (!confirm('Delete this purchase bill from Manager.io permanently?\n\nThis action cannot be undone.')) return;
        window.setLoading?.(true, 'Deleting purchase bill...', 'detail');
        try {
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
            await callApi(`/api/manager/purchase-invoices/${invKey}?code=${encodeURIComponent(clientCode)}`, {}, 'DELETE');
            await load();
        } catch (err) {
            alert('Failed to delete purchase bill: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Print ─────────────────────────────────────────────────────────────────
    async function _printEntry(invKey, branchCode) {
        if (!invKey || !branchCode) return;
        window.setLoading?.(true, 'Preparing print...', 'detail');
        try {
            const [res, appData] = await Promise.all([
                callApi(`/api/manager/purchase-invoice-details/${branchCode}/${invKey}`, {}, 'GET'),
                getAppData()
            ]);

            if (appData?.B2B) {
                Object.values(appData.B2B).forEach(c => {
                    if (c.CODE) _b2bMap.set(c.CODE.trim().toUpperCase(), c);
                });
            }

            const inv = _allInvoices.find(i => i.key === invKey);
            const ref = res.Reference || inv?.reference || invKey;
            const date = res.IssueDate || inv?.date || '';
            const supplierCode = inv?.supplier || '';

            // Resolve supplier name from B2B or carriers
            let supplierName = supplierCode;
            if (appData?.B2B) {
                Object.values(appData.B2B).forEach(c => {
                    if (c.CODE && c.CODE.trim().toUpperCase() === supplierCode.trim().toUpperCase()) {
                        supplierName = c.B2B_NAME || supplierCode;
                    }
                });
            }
            if (appData?.CARRIERS && supplierName === supplierCode) {
                Object.values(appData.CARRIERS).forEach(c => {
                    if (c.COMPANY_CODE && c.COMPANY_CODE.trim().toUpperCase() === supplierCode.trim().toUpperCase()) {
                        supplierName = c.COMPANY_NAME || supplierCode;
                    }
                });
            }
            const supplierGst = '';

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
            const branchGstin = branch?.BRANCH_GSTIN || '';

            // Compute totals from lines
            const lines = res.Lines || [];
            let taxableSubtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
            const linesHtml = lines.map((line, i) => {
                const desc = line.LineDescription || '';
                const qty = line.Qty || 1;
                const price = line.UnitPrice || 0;
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

            const chargeRows = [
                `<tr><td>Taxable Subtotal</td><td class="tr">₹${taxableSubtotal.toFixed(2)}</td></tr>`,
                ...(totalCgst > 0 ? [`<tr><td>CGST @ 9%</td><td class="tr">₹${totalCgst.toFixed(2)}</td></tr>`] : []),
                ...(totalSgst > 0 ? [`<tr><td>SGST @ 9%</td><td class="tr">₹${totalSgst.toFixed(2)}</td></tr>`] : []),
                ...(totalIgst > 0 ? [`<tr><td>IGST @ 18%</td><td class="tr">₹${totalIgst.toFixed(2)}</td></tr>`] : []),
            ].join('');

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
                        <div style="font-size:26px;font-weight:bold;text-transform:uppercase;color:#ea580c">Purchase Bill</div>
                        <div style="text-align:right;font-size:12px">
                            <b>Bill No:</b> ${_escapeHtml(ref)}<br>
                            <b>Date:</b> ${date.split('T')[0] || date}
                        </div>
                    </div>

                    <div class="info">
                        <div class="col">
                            <h3>Branch: ${_escapeHtml(branchName)}</h3>
                            <p><b>Address:</b> ${_escapeHtml(branchAddr)}</p>
                            <p><b>City:</b> ${_escapeHtml(branchCity)}, ${_escapeHtml(branchState)}</p>
                            <p><b>Phone:</b> ${_escapeHtml(branchMobile)}</p>
                            <p><b>Email:</b> ${_escapeHtml(branchEmail)}</p>
                            ${branchGstin ? `<p><b>GSTIN:</b> ${_escapeHtml(branchGstin)}</p>` : ''}
                        </div>
                        <div class="div"></div>
                        <div class="col">
                            <h3>Supplier: ${_escapeHtml(supplierName)}</h3>
                            <p><b>Code:</b> ${_escapeHtml(supplierCode)}</p>
                            ${supplierGst ? `<p><b>GST:</b> ${_escapeHtml(supplierGst)}</p>` : ''}
                        </div>
                    </div>

                    <div class="divb"></div>
                    ${res.Description ? `<div class="meta"><p>${_escapeHtml(res.Description)}</p></div>` : ''}

                    ${lines.length ? `
                    <table>
                        <thead><tr><th class="tc">Sr</th><th>Description</th><th class="tr">Qty</th><th class="tr">Unit Price</th><th class="tr">Amount</th></tr></thead>
                        <tbody>${linesHtml}</tbody>
                    </table>
                    ` : ''}

                    <div class="tot">
                        <div class="pay">
                            <p><b>Bill Total:</b> ₹${grandTotal.toFixed(2)}</p>
                        </div>
                        <div class="chg">
                            <table>
                                <thead><tr><th>Charge</th><th class="tr">Amount</th></tr></thead>
                                <tbody>${chargeRows}<tr style="font-weight:bold"><td>Total Amount</td><td class="tr">₹${grandTotal.toFixed(2)}</td></tr></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="sig">
                        <div class="sigbox">
                            <p style="margin-bottom:40px">Authorized Signatory</p>
                            <p>for ${_escapeHtml(branchName)}</p>
                        </div>
                    </div>
                </div>`;

            const w = window.open('', 'Purchase_Bill_' + ref.replace(/[^a-zA-Z0-9]/g, '_'));
            if (!w) { alert('Pop-up blocked! Please allow pop-ups.'); return; }
            w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Purchase Bill - ' + _escapeHtml(ref) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>');
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
        } finally {
            window.setLoading?.(false);
        }
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _titleCase(str) {
        return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }

    function _parseTaxRate(tcName) {
        const m = (tcName || '').match(/(\d+(\.\d+)?)\s*%?/);
        return m ? parseFloat(m[1]) : 18;
    }

    // ── Detail view ────────────────────────────────────────────────────────────
    async function _renderDetail(listEntry) {
        if (!listEntry) return;

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
            <p class="text-gray-500 text-sm">Fetching purchase bill details from Manager.io...</p>
        </div>`;
        VaultPage.showDetailPane();
        window.setLoading?.(true, 'Fetching purchase bill details...', 'detail');

        try {
            const res = await callApi(`/api/manager/purchase-invoice-details/${listEntry.branch}/${listEntry.key}`, {}, 'GET');

            let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
            (res.Lines || []).forEach(line => {
                const unitPrice = parseFloat(line.UnitPrice || 0);
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
                const unitPrice = parseFloat(line.UnitPrice || 0);
                const lineAmt = qty * unitPrice;
                const taxCodeLabel = line.TaxCode === 'c9228485-7a58-4ccb-89e8-fe025e20261d' ? 'CGST/SGST 18%' :
                                     line.TaxCode === '16e26b59-06ca-49ab-ba1c-a2c36711683e' ? 'IGST 18%' : 'Exempt/Nil';
                return `
                    <tr class="hover:bg-gray-50/50 transition-colors">
                        <td class="px-4 py-2.5 text-gray-700 font-medium">${line.LineDescription || 'Charges'}</td>
                        <td class="px-4 py-2.5 text-right text-gray-500">${qty}</td>
                        <td class="px-4 py-2.5 text-right text-gray-500">₹${unitPrice.toFixed(2)}</td>
                        <td class="px-4 py-2.5 text-right text-gray-500">${taxCodeLabel}</td>
                        <td class="px-4 py-2.5 text-right text-gray-900 font-semibold">₹${lineAmt.toFixed(2)}</td>
                    </tr>
                `;
            }).join('');

            const amount = typeof listEntry.amount === 'object' ? (listEntry.amount?.value || 0) : (+listEntry.amount || 0);

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-body p-6 space-y-6">
                        <!-- Purchase Bill Header -->
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-5">
                            <div class="flex-1 min-w-0">
                                <h1 class="text-xl font-bold text-orange-800 tracking-tight break-words">Purchase Bill</h1>
                                <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-semibold text-gray-700">${listEntry.branch || 'N/A'}</span></p>
                            </div>
                            <div class="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                                <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                                    <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-orange-50 text-orange-700 uppercase whitespace-nowrap">PURCHASE</span>
                                    <button onclick="VaultPurchases._printEntry('${listEntry.key}', '${listEntry.branch}')"
                                        class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                                        </svg><span class="truncate">Print</span>
                                    </button>
                                    <button onclick="VaultPurchases._openEditPaneFromDetail('${listEntry.key}', '${listEntry.branch}', event)"
                                        class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                        </svg><span class="truncate">Edit</span>
                                    </button>
                                    <button onclick="VaultPurchases._handleDelete('${listEntry.key}', '${listEntry.branch}')"
                                        class="btn-danger btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg><span class="truncate">Delete</span>
                                    </button>
                                </div>
                                <p class="text-sm text-gray-500">Bill #: <span class="font-bold text-gray-800">${res.Reference || 'N/A'}</span></p>
                                <p class="text-xs text-gray-400">Date: ${res.IssueDate ? res.IssueDate.split('T')[0] : 'N/A'}</p>
                            </div>
                        </div>

                        <!-- Supplier & Details -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Supplier</h3>
                                <p class="font-semibold text-gray-800">${listEntry.supplier || 'N/A'}</p>
                            </div>
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Details</h3>
                                <p class="text-gray-600">Due Days: <span class="font-medium text-gray-800">${res.DueDateDays || 0} Days</span></p>
                                <p class="text-gray-600 mt-0.5">Amount: <span class="font-bold text-orange-700">₹${(+amount).toFixed(2)}</span></p>
                            </div>
                        </div>

                        <!-- Description -->
                        ${res.Description ? `
                        <div class="bg-orange-50/40 border border-orange-100/50 rounded-lg p-3 text-xs text-orange-950">
                            <span class="font-semibold block text-orange-800 uppercase tracking-wider mb-1" style="font-size: 10px;">Description</span>
                            ${res.Description}
                        </div>
                        ` : ''}

                        <!-- Lines Table -->
                        <div class="overflow-hidden border border-gray-100 rounded-lg">
                            <table class="min-w-full divide-y divide-gray-100 text-xs">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-2.5 text-left font-bold text-gray-500 uppercase">Line Item Description</th>
                                        <th class="px-4 py-2.5 text-right font-bold text-gray-500 uppercase">Qty</th>
                                        <th class="px-4 py-2.5 text-right font-bold text-gray-500 uppercase">Unit Price</th>
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
                                    <span>Total Amount:</span>
                                    <span class="text-orange-700 font-extrabold">₹${(+amount).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Metadata -->
                        <details class="text-[11px] text-gray-400">
                            <summary class="cursor-pointer hover:text-gray-600 transition-colors">Audit & System Metadata</summary>
                            <div class="grid grid-cols-2 gap-2 mt-2 p-2 border rounded-lg bg-gray-50/50">
                                <div>Tax Enabled: ${res.TaxCodeEnabled !== false ? 'Yes' : 'No'}</div>
                                <div>Rounding: ${res.Rounding ? 'Yes' : 'No'}</div>
                                <div>Manager UUID: <span class="font-mono text-[9px]">${res.Key || 'N/A'}</span></div>
                            </div>
                        </details>
                    </div>
                </div>`;
        } catch (err) {
            view.innerHTML = `
                <div class="detail-card"><div class="detail-card-body text-center py-8 text-red-600">
                    <p class="text-sm">Failed to retrieve details: ${err.message || err}</p>
                </div></div>`;
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Edit via Manager.io PUT ──────────────────────────────────────────────
    async function _openEditPaneFromDetail(invKey, branchCode, evt) {
        const btn = evt?.target?.closest('button');
        if (btn) { btn.disabled = true; btn.innerHTML = '...'; }
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-gray-400 text-sm">Loading purchase bill form data…</div></div>`;
        VaultPage.showDetailPane();

        try {
            const res = await callApi(`/api/manager/purchase-invoice-details/${branchCode}/${invKey}`, {}, 'GET');

            const appData = await getAppData();
            let clientCode = '';
            if (appData?.B2B) {
                Object.values(appData.B2B).forEach(c => {
                    if ((c.BRANCH || '').toLowerCase() === (branchCode || '').toLowerCase()) {
                        clientCode = c.CODE;
                    }
                });
            }

            if (!window.__vaultCacheKeys) {
                try {
                    window.__vaultCacheKeys = await callApi('/api/manager/cache/keys', {}, 'GET');
                } catch (err) {
                    console.error("Failed to load cache keys:", err);
                    window.__vaultCacheKeys = {};
                }
            }

            if (appData?.B2B) Object.values(appData.B2B).forEach(c => {
                if (c.CODE) _b2bMap.set(c.CODE.trim().toUpperCase(), c);
            });

            const _bKey = (branchCode || '').toLowerCase();
            const _bKeys = window.__vaultCacheKeys?.[_bKey] || {};
            const _itemUuidToName = {};
            const _tcUuidToName = {};
            Object.entries(_bKeys.non_inventory_items || {}).forEach(([name, uuid]) => { _itemUuidToName[uuid] = name; });
            Object.entries(_bKeys.tax_codes || {}).forEach(([name, uuid]) => { _tcUuidToName[uuid] = name; });

            const existingRef = res.Reference || res.reference || '';
            const existingSupplier = res.Supplier || res.supplier || '';
            const existingDate = res.IssueDate || res.issueDate || '';
            const existingDesc = res.Description || res.description || '';
            const existingDueDays = res.DueDateDays || res.dueDateDays || 30;
            const existingLines = res.Lines || res.lines || [];

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
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">✏️ Edit Purchase Bill — ${existingRef || invKey}</h3></div>
                    <div class="detail-card-body space-y-4">
                        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                            ⚠️ Editing will update this purchase bill in Manager.io. Reference number will be preserved.
                        </p>
                        <form id="pbeForm" class="space-y-4">
                            <input type="hidden" name="inv_key" value="${invKey}">
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div class="sm:col-span-2">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Supplier Code *</label>
                                    <input name="code" id="pbeCode" required class="form-input text-sm uppercase"
                                        value="${clientCode}" list="pbeCodeList" autocomplete="off">
                                    <datalist id="pbeCodeList"></datalist>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                    <input name="branch" id="pbeBranch" readonly
                                        class="form-input text-sm uppercase bg-gray-50 text-gray-500" value="${branchCode.toUpperCase() || ''}">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                    <input name="pi_date" type="date" required class="form-input text-sm" value="${existingDate.split('T')[0] || existingDate}">
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Due Days</label>
                                    <input name="due_days" type="number" min="0" class="form-input text-sm" value="${existingDueDays}">
                                </div>
                            </div>

                            <!-- Line Items -->
                            <div class="border rounded-lg overflow-hidden">
                                <div class="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                                    <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</span>
                                    <button type="button" id="pbeAddLine"
                                        class="text-xs font-semibold text-orange-600 hover:text-orange-800 flex items-center gap-1">+ Add Line</button>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm" id="pbeLinesTable">
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
                                        <tbody id="pbeLineRows"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Totals -->
                            <div class="border rounded-lg p-3 bg-gray-50 space-y-1.5 text-sm" id="pbeTotals">
                                <div class="flex justify-between text-gray-600"><span>Subtotal</span><span id="pbe_subtotal" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between text-gray-600" id="pbe_sgst_row"><span>SGST</span><span id="pbe_sgst_val" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between text-gray-600" id="pbe_cgst_row"><span>CGST</span><span id="pbe_cgst_val" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between text-gray-600 hidden" id="pbe_igst_row"><span>IGST</span><span id="pbe_igst_val" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-1">
                                    <span>Total Amount</span>
                                    <span id="pbe_grand_total" class="text-orange-700 text-base">₹0.00</span>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                <input name="narration" class="form-input text-sm" value="${_escapeHtml(existingDesc)}">
                            </div>

                            <div class="flex justify-between items-center pt-2 border-t">
                                <div id="pbeResponse" class="hidden text-sm"></div>
                                <button type="submit" id="pbeSubmitBtn" class="btn btn-sm flex items-center gap-2 ml-auto">
                                    <span id="pbeBtnText">Update Purchase Bill</span>
                                    <div id="pbeSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>`;

            // Populate supplier datalist from B2B + Carriers
            const dl = document.getElementById('pbeCodeList');
            if (appData?.B2B) Object.values(appData.B2B).forEach(c => {
                if (c.CODE) { const o = document.createElement('option'); o.value = c.CODE; o.label = `${c.CODE} — ${c.B2B_NAME || ''}`; dl.appendChild(o); }
            });
            if (appData?.CARRIERS) Object.values(appData.CARRIERS).forEach(c => {
                if (c.COMPANY_CODE) { const o = document.createElement('option'); o.value = c.COMPANY_CODE; o.label = `${c.COMPANY_CODE} — ${c.COMPANY_NAME || ''}`; dl.appendChild(o); }
            });

            function _applyClientAutofill() {
                const code = document.getElementById('pbeCode').value.trim().toUpperCase();
                // Look up branch from B2B or Carrier
                let branch = '';
                if (appData?.B2B) Object.values(appData.B2B).forEach(c => {
                    if (c.CODE === code) branch = c.BRANCH || '';
                });
                if (!branch && appData?.CARRIERS) Object.values(appData.CARRIERS).forEach(c => {
                    if (c.COMPANY_CODE === code) branch = c.BRANCH || '';
                });
                if (branch) document.getElementById('pbeBranch').value = branch.toUpperCase();
                currentOpts = _getBranchDropdowns(branch.toLowerCase());
                document.querySelectorAll('#pbeLineRows tr').forEach(tr => {
                    const itemSel = tr.querySelector('.pbe-item');
                    const tcSel = tr.querySelector('.pbe-tc');
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
            document.getElementById('pbeCode').addEventListener('input', _applyClientAutofill);
            document.getElementById('pbeCode').addEventListener('change', _applyClientAutofill);

            let _lineCount = 0;

            function _addLine(defaultItem = '', defaultDesc = '', defaultQty = 1, defaultPrice = 0, defaultTc = '') {
                const idx = _lineCount++;
                const tr = document.createElement('tr');
                tr.id = `pbeLine_${idx}`;
                tr.className = 'border-t border-gray-100';
                tr.innerHTML = `
                    <td class="py-1.5 px-2">
                        <select class="form-input text-xs pbe-item" style="min-width:140px">${currentOpts.itemOpts}</select>
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="text" class="form-input text-xs pbe-desc" placeholder="Description" style="min-width:120px" value="${_escapeHtml(defaultDesc)}">
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="number" class="form-input text-xs pbe-qty text-right" value="${defaultQty}" min="0.001" step="any" style="min-width:55px">
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="number" class="form-input text-xs pbe-price text-right" value="${defaultPrice}" min="0" step="0.01" style="min-width:80px">
                    </td>
                    <td class="py-1.5 px-2">
                        <select class="form-input text-xs pbe-tc" style="min-width:120px">${currentOpts.tcOpts}</select>
                    </td>
                    <td class="py-1.5 px-2 text-right">
                        <span class="pbe-amt text-gray-700 font-medium text-xs">₹0.00</span>
                    </td>
                    <td class="py-1.5 px-2 text-center">
                        <button type="button" class="pbe-remove text-red-400 hover:text-red-600 text-lg leading-none" title="Remove line">×</button>
                    </td>`;
                document.getElementById('pbeLineRows').appendChild(tr);

                if (defaultItem) tr.querySelector('.pbe-item').value = defaultItem;
                if (defaultTc) tr.querySelector('.pbe-tc').value = defaultTc;

                tr.querySelector('.pbe-item').addEventListener('change', function() {
                    const descEl = tr.querySelector('.pbe-desc');
                    if (!descEl.value) descEl.value = _titleCase(this.value);
                    _calcTotals();
                });
                tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', _calcTotals));
                tr.querySelector('.pbe-remove').addEventListener('click', () => { tr.remove(); _calcTotals(); });
                _calcTotals();
            }

            function _calcTotals() {
                let subtotal = 0, sgst = 0, cgst = 0, igst = 0;
                document.querySelectorAll('#pbeLineRows tr').forEach(tr => {
                    const qty = parseFloat(tr.querySelector('.pbe-qty')?.value || 0);
                    const price = parseFloat(tr.querySelector('.pbe-price')?.value || 0);
                    const tc = (tr.querySelector('.pbe-tc')?.value || '').toUpperCase();
                    const lineAmt = qty * price;
                    subtotal += lineAmt;
                    tr.querySelector('.pbe-amt').textContent = '₹' + lineAmt.toFixed(2);
                    if (tc.includes('IGST')) {
                        igst += lineAmt * _parseTaxRate(tr.querySelector('.pbe-tc').value) / 100;
                    } else if (tc && tc !== '') {
                        const rate = _parseTaxRate(tr.querySelector('.pbe-tc').value);
                        sgst += lineAmt * rate / 200;
                        cgst += lineAmt * rate / 200;
                    }
                });
                const grandTotal = subtotal + sgst + cgst + igst;
                document.getElementById('pbe_subtotal').textContent = '₹' + subtotal.toFixed(2);
                document.getElementById('pbe_sgst_val').textContent = '₹' + sgst.toFixed(2);
                document.getElementById('pbe_cgst_val').textContent = '₹' + cgst.toFixed(2);
                document.getElementById('pbe_igst_val').textContent = '₹' + igst.toFixed(2);
                document.getElementById('pbe_grand_total').textContent = '₹' + grandTotal.toFixed(2);
                document.getElementById('pbe_sgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
                document.getElementById('pbe_cgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
                document.getElementById('pbe_igst_row').classList.toggle('hidden', igst === 0);
            }

            // Populate existing lines
            if (existingLines.length) {
                existingLines.forEach(ln => {
                    const itemUuid = ln.Item || '';
                    const itemName = _itemUuidToName[itemUuid] || itemUuid;
                    const desc = ln.LineDescription || ln.lineDescription || '';
                    const qty = ln.Qty || ln.qty || 1;
                    const price = ln.UnitPrice || ln.unitPrice || 0;
                    const tcUuid = ln.TaxCode || ln.taxCode || '';
                    const tcName = _tcUuidToName[tcUuid] || tcUuid;
                    _addLine(itemName, desc, qty, price, tcName);
                });
            } else {
                _addLine();
            }

            document.getElementById('pbeAddLine').addEventListener('click', () => _addLine());
            _applyClientAutofill();

            document.getElementById('pbeForm').addEventListener('submit', async e => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const raw = Object.fromEntries(fd);
                const btn = document.getElementById('pbeSubmitBtn');
                const sp = document.getElementById('pbeSpinner');
                const resp = document.getElementById('pbeResponse');
                btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
                window.setLoading?.(true, 'Updating purchase bill...', 'detail');

                try {
                    const editClientCode = raw.code.trim().toUpperCase();
                    const lines = [];
                    document.querySelectorAll('#pbeLineRows tr').forEach(tr => {
                        const item = tr.querySelector('.pbe-item')?.value || '';
                        const desc = tr.querySelector('.pbe-desc')?.value || '';
                        const qty = parseFloat(tr.querySelector('.pbe-qty')?.value || 1);
                        const price = parseFloat(tr.querySelector('.pbe-price')?.value || 0);
                        const tc = tr.querySelector('.pbe-tc')?.value || '';
                        if (price > 0 || item) {
                            lines.push({
                                Item: item || undefined,
                                LineDescription: desc || undefined,
                                Qty: qty,
                                UnitPrice: price,
                                TaxCode: tc || undefined,
                            });
                        }
                    });
                    if (!lines.length) throw new Error('Add at least one line item with a price.');

                    const payload = {
                        IssueDate: raw.pi_date,
                        DueDateDays: parseInt(raw.due_days) || 30,
                        Supplier: editClientCode,
                        Description: raw.narration || undefined,
                        Lines: lines,
                        TaxCodeEnabled: true,
                        HasLineNumber: true,
                        Rounding: true,
                    };

                    const url = `/api/manager/purchase-invoices/${raw.inv_key}?code=${encodeURIComponent(editClientCode)}`;
                    const result = await callApi(url, payload, 'PUT');
                    const refNum = result.Reference || result.reference || 'updated';
                    resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                    resp.textContent = `✅ Purchase Bill ${refNum} updated in Manager.io!`;
                    resp.classList.remove('hidden');
                    await load();
                } catch (err) {
                    resp.className = 'mt-2 text-sm bg-red-100 text-red-800 px-3 py-2 rounded';
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
            if (btn) { btn.disabled = false; btn.innerHTML = ''; }
        }
    }

    // ── New Purchase Bill Form (line items) ─────────────────────────────────────
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
                console.error("Failed to load cache keys:", err);
                window.__vaultCacheKeys = {};
            }
        }

        if (appData?.B2B) Object.values(appData.B2B).forEach(c => {
            if (c.CODE) _b2bMap.set(c.CODE.trim().toUpperCase(), c);
        });

        let defaultBranch = '';
        const firstClient = Object.values(appData?.B2B || {})[0];
        if (firstClient?.BRANCH) defaultBranch = firstClient.BRANCH.toLowerCase();

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
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">🛒 New Purchase Bill</h3></div>
                <div class="detail-card-body space-y-4">
                    <form id="pbForm" class="space-y-4">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-medium text-gray-600 mb-1">Supplier Code *</label>
                                <input name="code" id="pbCode" required class="form-input text-sm uppercase"
                                    placeholder="e.g. DELHIVERY" list="pbCodeList" autocomplete="off">
                                <datalist id="pbCodeList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                <input name="branch" id="pbBranch" readonly
                                    class="form-input text-sm uppercase bg-gray-50 text-gray-500" placeholder="Auto">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                <input name="pi_date" id="pbDate" type="date" required class="form-input text-sm">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Due Days</label>
                                <input name="due_days" type="number" min="0" value="30" class="form-input text-sm">
                            </div>
                        </div>

                        <!-- Line Items -->
                        <div class="border rounded-lg overflow-hidden">
                            <div class="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</span>
                                <button type="button" id="pbAddLine"
                                    class="text-xs font-semibold text-orange-600 hover:text-orange-800 flex items-center gap-1">+ Add Line</button>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="w-full text-sm" id="pbLinesTable">
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
                                    <tbody id="pbLineRows"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Totals -->
                        <div class="border rounded-lg p-3 bg-gray-50 space-y-1.5 text-sm" id="pbTotals">
                            <div class="flex justify-between text-gray-600"><span>Subtotal</span><span id="pb_subtotal" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between text-gray-600" id="pb_sgst_row"><span>SGST</span><span id="pb_sgst_val" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between text-gray-600" id="pb_cgst_row"><span>CGST</span><span id="pb_cgst_val" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between text-gray-600 hidden" id="pb_igst_row"><span>IGST</span><span id="pb_igst_val" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-1">
                                <span>Total Amount</span>
                                <span id="pb_grand_total" class="text-orange-700 text-base">₹0.00</span>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Description</label>
                            <input name="narration" class="form-input text-sm" placeholder="Bill description (optional)">
                        </div>

                        <div class="flex justify-between items-center pt-2 border-t">
                            <div id="pbResponse" class="hidden text-sm"></div>
                            <button type="submit" id="pbSubmitBtn" class="btn btn-sm flex items-center gap-2 ml-auto">
                                <span id="pbBtnText">Save Purchase Bill</span>
                                <div id="pbSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;

        // Populate supplier datalist from B2B + Carriers
        const dl = document.getElementById('pbCodeList');
        if (appData?.B2B) Object.values(appData.B2B).forEach(c => {
            if (c.CODE) { const o = document.createElement('option'); o.value = c.CODE; o.label = `${c.CODE} — ${c.B2B_NAME || ''}`; dl.appendChild(o); }
        });
        if (appData?.CARRIERS) Object.values(appData.CARRIERS).forEach(c => {
            if (c.COMPANY_CODE) { const o = document.createElement('option'); o.value = c.COMPANY_CODE; o.label = `${c.COMPANY_CODE} — ${c.COMPANY_NAME || ''}`; dl.appendChild(o); }
        });

        function _applyClientAutofill() {
            const code = document.getElementById('pbCode').value.trim().toUpperCase();
            let branch = '';
            if (appData?.B2B) Object.values(appData.B2B).forEach(c => {
                if (c.CODE === code) branch = c.BRANCH || '';
            });
            if (!branch && appData?.CARRIERS) Object.values(appData.CARRIERS).forEach(c => {
                if (c.COMPANY_CODE === code) branch = c.BRANCH || '';
            });
            if (branch) document.getElementById('pbBranch').value = branch.toUpperCase();
            currentOpts = _getBranchDropdowns(branch.toLowerCase());
            document.querySelectorAll('#pbLineRows tr').forEach(tr => {
                const itemSel = tr.querySelector('.pb-item');
                const tcSel = tr.querySelector('.pb-tc');
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
        document.getElementById('pbCode').addEventListener('input', _applyClientAutofill);
        document.getElementById('pbCode').addEventListener('change', _applyClientAutofill);

        document.getElementById('pbDate').value = new Date().toISOString().split('T')[0];

        let _lineCount = 0;

        function _addLine(defaultItem = '', defaultTc = '') {
            const idx = _lineCount++;
            const tr = document.createElement('tr');
            tr.id = `pbLine_${idx}`;
            tr.className = 'border-t border-gray-100';
            tr.innerHTML = `
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs pb-item" data-idx="${idx}" style="min-width:140px">${currentOpts.itemOpts}</select>
                </td>
                <td class="py-1.5 px-2">
                    <input type="text" class="form-input text-xs pb-desc" placeholder="Description" style="min-width:120px">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs pb-qty text-right" value="1" min="0.001" step="any" style="min-width:55px">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs pb-price text-right" value="" min="0" step="0.01" placeholder="0.00" style="min-width:80px">
                </td>
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs pb-tc" style="min-width:120px">${currentOpts.tcOpts}</select>
                </td>
                <td class="py-1.5 px-2 text-right">
                    <span class="pb-amt text-gray-700 font-medium text-xs">₹0.00</span>
                </td>
                <td class="py-1.5 px-2 text-center">
                    <button type="button" class="pb-remove text-red-400 hover:text-red-600 text-lg leading-none" title="Remove line">×</button>
                </td>`;
            document.getElementById('pbLineRows').appendChild(tr);

            if (defaultItem) tr.querySelector('.pb-item').value = defaultItem;
            if (defaultTc) tr.querySelector('.pb-tc').value = defaultTc;

            tr.querySelector('.pb-item').addEventListener('change', function() {
                const descEl = tr.querySelector('.pb-desc');
                if (!descEl.value) descEl.value = _titleCase(this.value);
                _calcTotals();
            });
            tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', _calcTotals));
            tr.querySelector('.pb-remove').addEventListener('click', () => { tr.remove(); _calcTotals(); });
            _calcTotals();
        }

        function _calcTotals() {
            let subtotal = 0, sgst = 0, cgst = 0, igst = 0;
            document.querySelectorAll('#pbLineRows tr').forEach(tr => {
                const qty = parseFloat(tr.querySelector('.pb-qty')?.value || 0);
                const price = parseFloat(tr.querySelector('.pb-price')?.value || 0);
                const tc = (tr.querySelector('.pb-tc')?.value || '').toUpperCase();
                const lineAmt = qty * price;
                subtotal += lineAmt;
                tr.querySelector('.pb-amt').textContent = '₹' + lineAmt.toFixed(2);
                if (tc.includes('IGST')) {
                    igst += lineAmt * _parseTaxRate(tr.querySelector('.pb-tc').value) / 100;
                } else if (tc && tc !== '') {
                    const rate = _parseTaxRate(tr.querySelector('.pb-tc').value);
                    sgst += lineAmt * rate / 200;
                    cgst += lineAmt * rate / 200;
                }
            });
            const grandTotal = subtotal + sgst + cgst + igst;
            document.getElementById('pb_subtotal').textContent = '₹' + subtotal.toFixed(2);
            document.getElementById('pb_sgst_val').textContent = '₹' + sgst.toFixed(2);
            document.getElementById('pb_cgst_val').textContent = '₹' + cgst.toFixed(2);
            document.getElementById('pb_igst_val').textContent = '₹' + igst.toFixed(2);
            document.getElementById('pb_grand_total').textContent = '₹' + grandTotal.toFixed(2);
            document.getElementById('pb_sgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
            document.getElementById('pb_cgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
            document.getElementById('pb_igst_row').classList.toggle('hidden', igst === 0);
        }

        _addLine();
        document.getElementById('pbAddLine').addEventListener('click', () => _addLine());

        document.getElementById('pbForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const raw = Object.fromEntries(fd);
            const btn = document.getElementById('pbSubmitBtn');
            const sp = document.getElementById('pbSpinner');
            const resp = document.getElementById('pbResponse');
            btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
            window.setLoading?.(true, 'Creating purchase bill...', 'detail');

            try {
                const clientCode = raw.code.trim().toUpperCase();
                const lines = [];
                document.querySelectorAll('#pbLineRows tr').forEach(tr => {
                    const item = tr.querySelector('.pb-item')?.value || '';
                    const desc = tr.querySelector('.pb-desc')?.value || '';
                    const qty = parseFloat(tr.querySelector('.pb-qty')?.value || 1);
                    const price = parseFloat(tr.querySelector('.pb-price')?.value || 0);
                    const tc = tr.querySelector('.pb-tc')?.value || '';
                    if (price > 0 || item) {
                        lines.push({
                            Item: item || undefined,
                            LineDescription: desc || undefined,
                            Qty: qty,
                            UnitPrice: price,
                            TaxCode: tc || undefined,
                        });
                    }
                });
                if (!lines.length) throw new Error('Add at least one line item with a price.');

                const payload = {
                    IssueDate: raw.pi_date,
                    DueDateDays: parseInt(raw.due_days) || 30,
                    Supplier: clientCode,
                    Description: raw.narration || undefined,
                    Lines: lines,
                    TaxCodeEnabled: true,
                    HasLineNumber: true,
                    Rounding: true,
                };

                const url = `/api/manager/purchase-invoices?code=${encodeURIComponent(clientCode)}`;
                const res = await callApi(url, payload, 'POST');
                const refNum = res.Reference || res.reference || 'created';
                resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                resp.textContent = `✅ Purchase Bill ${refNum} created in Manager.io.`;
                resp.classList.remove('hidden');
                await load();
            } catch (err) {
                resp.className = 'mt-2 text-sm bg-red-100 text-red-800 px-3 py-2 rounded';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                window.setLoading?.(false);
                btn.disabled = false; sp.classList.add('hidden');
            }
        });

        VaultPage.showDetailPane();
    }

    // ── UI injection (filter button, status counter, filter modal) ──────────────
    function _injectUI() {
        const listPane = document.getElementById('vaultListPane');
        const header   = listPane?.querySelector('.sv-pane-header');
        if (header && !document.getElementById('pbFilterBtn')) {
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
            filterBtn.id = 'pbFilterBtn';
            filterBtn.className = 'btn-ghost btn-sm flex-shrink-0';
            filterBtn.title = 'Filter Purchase Bills';
            filterBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>`;
            filterBtn.onclick = () => document.getElementById('pbFilterModal')?.classList.remove('hidden');
            searchRow?.appendChild(filterBtn);
        }

        if (!document.getElementById('pbStatus')) {
            const statusEl = document.createElement('p');
            statusEl.id = 'pbStatus';
            statusEl.className = 'text-xs text-gray-500 px-4 pt-2 text-center font-medium';
            statusEl.textContent = 'Loading...';
            const listContainer = document.getElementById('vaultList')?.parentElement;
            listContainer?.insertBefore(statusEl, document.getElementById('vaultList'));
        }

        if (!document.getElementById('pbFilterModal')) {
            const modal = document.createElement('div');
            modal.id = 'pbFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h2 class="text-lg font-bold text-gray-800">Filter Purchase Bills</h2>
                        <button onclick="document.getElementById('pbFilterModal').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Start Date</label>
                            <input type="date" id="pbFilterStart" class="form-input text-xs" value="${_filterStart}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">End Date</label>
                            <input type="date" id="pbFilterEnd" class="form-input text-xs" value="${_filterEnd}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Branch</label>
                            <select id="pbFilterBranch" class="form-input text-xs">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Status</label>
                            <select id="pbFilterStatus" class="form-input text-xs">
                                <option value="">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="overdue">Overdue</option>
                                <option value="draft">Draft</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button id="pbResetBtn" class="btn-ghost btn-sm">Reset</button>
                        <button id="pbApplyBtn" class="btn btn-sm">Apply Filters</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

            document.getElementById('pbApplyBtn').onclick = async () => {
                _filterStart = document.getElementById('pbFilterStart').value;
                _filterEnd = document.getElementById('pbFilterEnd').value;
                _filterBranch = document.getElementById('pbFilterBranch').value;
                _filterStatus = document.getElementById('pbFilterStatus').value;
                modal.classList.add('hidden');
                await load();
            };

            document.getElementById('pbResetBtn').onclick = async () => {
                const range = getCurrentFYRange();
                document.getElementById('pbFilterStart').value = range.start;
                document.getElementById('pbFilterEnd').value = range.end;
                document.getElementById('pbFilterBranch').value = '';
                document.getElementById('pbFilterStatus').value = '';

                _filterStart = range.start;
                _filterEnd = range.end;
                _filterBranch = '';
                _filterStatus = '';
                await load();
            };

            getAppData().then(data => {
                const select = document.getElementById('pbFilterBranch');
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
                console.error("Failed to pre-fetch cache keys:", err);
            }
        }

        window.setLoading?.(true, 'Loading purchase bills...', 'list');
        try {
            const branch = VaultPage.getActiveBranch();
            const url = `/api/manager/all-purchase-invoices?startDate=${_filterStart || ''}&endDate=${_filterEnd || ''}&branch=${branch || ''}`;
            const res = await callApi(url, {}, 'GET');
            if (res.status === 'success') {
                _allInvoices = res.purchaseInvoices || [];
                document.getElementById('vaultListMsg').textContent = '';
                _renderList();
            } else {
                document.getElementById('vaultListMsg').textContent = 'Failed to load purchase bills.';
            }
        } catch (err) {
            document.getElementById('vaultListMsg').textContent = 'Error: ' + (err.message || err);
        } finally {
            window.setLoading?.(false);
        }
    }

    return { load, search, openAddPane, _handleDelete, _printEntry, _openEditPaneFromDetail };
})();

window.VaultPurchases = VaultPurchases;
