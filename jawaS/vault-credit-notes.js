// ============================================================================
// VAULT-CREDIT-NOTES.JS — Credit Notes from IDB HEADER store
// Tile: credit-notes
// Data source: IDB HEADER (filtered by DOX_TYPE === 'Credit Note')
// Detail: Manager.io API + IDB LEDGER for GL postings
// ============================================================================

const VaultCreditNotes = (() => {

    let _allNotes = [];

    // ── Date helpers ──────────────────────────────────────────────────────────
    const _toDateStr = (ms) => {
        if (!ms) return '';
        const d = new Date(ms);
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
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

        const filtered = _allNotes.filter(e => {
            if (q) {
                const matchSearch = (e.DOX_REF || '').toLowerCase().includes(q) ||
                                     (e.B2B || '').toLowerCase().includes(q) ||
                                     (e.BRANCH || '').toLowerCase().includes(q);
                if (!matchSearch) return false;
            }
            const d = _toDateStr(e.IO_TIMESTAMP);
            if (_filterStart && d < _filterStart) return false;
            if (_filterEnd && d > _filterEnd) return false;
            if (_filterBranch && (e.BRANCH || '').toLowerCase() !== _filterBranch.toLowerCase()) return false;
            return true;
        });

        filtered.sort((a, b) => {
            const tsA = a.IO_TIMESTAMP || 0;
            const tsB = b.IO_TIMESTAMP || 0;
            if (tsA !== tsB) return tsB - tsA;
            return (b.DOX_REF || '').localeCompare(a.DOX_REF || '');
        });

        const statusEl = document.getElementById('cnStatus');
        if (statusEl) {
            statusEl.textContent = `Showing ${filtered.length} of ${_allNotes.length} Credit Notes`;
        }

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No matching credit notes found.</li>`;
            return;
        }
        ul.innerHTML = filtered.map(e => {
            const dateStr = _toDateStr(e.IO_TIMESTAMP);
            const amount = parseFloat(e.AMOUNT || 0);
            return `<li data-key="${e.DOX_KEY}" class="p-3 rounded-lg cursor-pointer hover:bg-pink-50 border border-gray-200 transition-colors">
                <strong class="text-pink-700 block text-sm">${e.DOX_REF || 'N/A'} — ${e.B2B || 'N/A'}</strong>
                <span class="text-xs text-gray-500">₹${amount.toFixed(2)} · ${dateStr || 'N/A'} · ${e.BRANCH || ''}</span>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(_allNotes.find(n => n.DOX_KEY === li.dataset.key));
            })
        );
    }

    function search() {
        _renderList();
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    async function _handleDelete(noteKey, branchCode) {
        if (!noteKey || !branchCode) {
            alert('Cannot delete: missing credit note key or branch.');
            return;
        }
        if (!confirm('Delete this credit note from Manager.io permanently?\n\nThis action cannot be undone.')) return;
        window.setLoading?.(true, 'Deleting credit note...', 'detail');
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
            await callApi(`/api/manager/credit-notes/${noteKey}?code=${encodeURIComponent(clientCode)}`, {}, 'DELETE');
            await load();
        } catch (err) {
            alert('Failed to delete credit note: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Print ─────────────────────────────────────────────────────────────────
    async function _printEntry(noteKey, branchCode) {
        if (!noteKey || !branchCode) return;
        window.setLoading?.(true, 'Preparing print...', 'detail');
        try {
            const [res, appData] = await Promise.all([
                callApi(`/api/manager/credit-note-details/${branchCode}/${noteKey}`, {}, 'GET'),
                getAppData()
            ]);

            const note = _allNotes.find(n => n.DOX_KEY === noteKey);
            const ref = res.Reference || note?.DOX_REF || noteKey;
            const date = res.Date || _toDateStr(note?.IO_TIMESTAMP) || '';
            const customerCode = note?.B2B || '';
            const description = res.Description || '';

            let b2bName = customerCode;
            let b2bGst = 'N/A';
            if (appData?.B2B) {
                Object.values(appData.B2B).forEach(c => {
                    if ((c.CODE || '').trim().toUpperCase() === customerCode.trim().toUpperCase()) {
                        b2bName = c.B2B_NAME || customerCode;
                        b2bGst = c.ID_GST_PAN_ADHAR || 'N/A';
                    }
                });
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
                        <div style="font-size:26px;font-weight:bold;text-transform:uppercase;color:#ec4899">Credit Note</div>
                        <div style="text-align:right;font-size:12px">
                            <b>Credit No:</b> ${_escapeHtml(ref)}<br>
                            <b>Date:</b> ${date.split('T')[0] || date}
                        </div>
                    </div>

                    <div class="info">
                        <div class="col">
                            <h3>Issued By: ${_escapeHtml(branchName)}</h3>
                            <p><b>Address:</b> ${_escapeHtml(branchAddr)}</p>
                            <p><b>City:</b> ${_escapeHtml(branchCity)}, ${_escapeHtml(branchState)}</p>
                            <p><b>Phone:</b> ${_escapeHtml(branchMobile)}</p>
                            <p><b>Email:</b> ${_escapeHtml(branchEmail)}</p>
                            ${branchGstin ? `<p><b>GSTIN:</b> ${_escapeHtml(branchGstin)}</p>` : ''}
                        </div>
                        <div class="div"></div>
                        <div class="col">
                            <h3>Customer: ${_escapeHtml(b2bName)}</h3>
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
                            <p style="color:#ec4899;font-size:14px;font-weight:bold;">Total Credit: ₹${grandTotal.toFixed(2)}</p>
                        </div>
                        <div class="chg">
                            <table>
                                <thead><tr><th>Charge</th><th class="tr">Amount</th></tr></thead>
                                <tbody>${chargeRows}<tr style="font-weight:bold;color:#ec4899"><td>Total Credit</td><td class="tr">₹${grandTotal.toFixed(2)}</td></tr></tbody>
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

            const w = window.open('', 'Credit_Note_' + ref.replace(/[^a-zA-Z0-9]/g, '_'));
            if (!w) { alert('Pop-up blocked! Please allow pop-ups.'); return; }
            w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Credit Note - ' + _escapeHtml(ref) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>');
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
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
            <p class="text-gray-500 text-sm">Fetching credit note details from Manager.io...</p>
        </div>`;
        VaultPage.showDetailPane();
        window.setLoading?.(true, 'Fetching credit note details...', 'detail');

        try {
            const res = await callApi(`/api/manager/credit-note-details/${branchCode}/${invoiceKey}`, {}, 'GET');

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

            const amount = parseFloat(listEntry.AMOUNT || 0);

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-body p-6 space-y-6">
                        <!-- Credit Note Header -->
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-5">
                            <div class="flex-1 min-w-0">
                                <h1 class="text-xl font-bold text-pink-800 tracking-tight break-words">Credit Note</h1>
                                <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-semibold text-gray-700">${branchCode || 'N/A'}</span></p>
                            </div>
                            <div class="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                                <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                                    <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-pink-50 text-pink-700 uppercase whitespace-nowrap">CREDIT</span>
                                    <button onclick="VaultCreditNotes._printEntry('${invoiceKey}', '${branchCode}')"
                                        class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                                        </svg><span class="truncate">Print</span>
                                    </button>
                                    <button onclick="VaultCreditNotes._openEditPaneFromDetail('${invoiceKey}', '${branchCode}', event)"
                                        class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                        </svg><span class="truncate">Edit</span>
                                    </button>
                                    <button onclick="VaultCreditNotes._handleDelete('${invoiceKey}', '${branchCode}')"
                                        class="btn-danger btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg><span class="truncate">Delete</span>
                                    </button>
                                </div>
                                <p class="text-sm text-gray-500">Credit #: <span class="font-bold text-gray-800">${res.Reference || 'N/A'}</span></p>
                                <p class="text-xs text-gray-400">Date: ${res.Date ? res.Date.split('T')[0] : 'N/A'}</p>
                            </div>
                        </div>

                        <!-- Customer & Details -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Customer</h3>
                                <p class="font-semibold text-gray-800">${listEntry.B2B || 'N/A'}</p>
                            </div>
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Details</h3>
                                <p class="text-gray-600">Invoice Reference: <span class="font-medium text-gray-800">${res.SalesInvoice || 'N/A'}</span></p>
                                <p class="text-gray-600 mt-0.5">Amount: <span class="font-bold text-pink-700">₹${(+amount).toFixed(2)}</span></p>
                            </div>
                        </div>

                        <!-- Description -->
                        ${res.Description ? `
                        <div class="bg-pink-50/40 border border-pink-100/50 rounded-lg p-3 text-xs text-pink-950">
                            <span class="font-semibold block text-pink-800 uppercase tracking-wider mb-1" style="font-size: 10px;">Description</span>
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
                                    <span>Total Credit:</span>
                                    <span class="text-pink-700 font-extrabold">₹${(+amount).toFixed(2)}</span>
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
                                ${res.SalesInvoice ? `<div>Linked Invoice: ${res.SalesInvoice}</div>` : ''}
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
        } catch (glErr) {
            console.warn('Failed to load GL postings:', glErr);
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

    // ── Edit via Manager.io PUT ──────────────────────────────────────────────
    async function _openEditPaneFromDetail(noteKey, branchCode, evt) {
        const btn = evt?.target?.closest('button');
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '...'; }
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-gray-400 text-sm">Loading credit note form data…</div></div>`;
        VaultPage.showDetailPane();

        try {
            const res = await callApi(`/api/manager/credit-note-details/${branchCode}/${noteKey}`, {}, 'GET');

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

            const _bKey = (branchCode || '').toLowerCase();
            const _bKeys = window.__vaultCacheKeys?.[_bKey] || {};
            const _itemUuidToName = {};
            const _tcUuidToName = {};
            Object.entries(_bKeys.non_inventory_items || {}).forEach(([name, uuid]) => { _itemUuidToName[uuid] = name; });
            Object.entries(_bKeys.tax_codes || {}).forEach(([name, uuid]) => { _tcUuidToName[uuid] = name; });

            const existingRef = res.Reference || res.reference || '';
            const existingCustomer = res.Customer || res.customer || '';
            const existingDate = res.Date || res.date || '';
            const existingDesc = res.Description || res.description || '';
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
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">✏️ Edit Credit Note — ${existingRef || noteKey}</h3></div>
                    <div class="detail-card-body space-y-4">
                        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                            ⚠️ Editing will update this credit note in Manager.io. Reference number will be preserved.
                        </p>
                        <form id="cneForm" class="space-y-4">
                            <input type="hidden" name="note_key" value="${noteKey}">
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div class="sm:col-span-2">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                    <input name="code" id="cneCode" required class="form-input text-sm uppercase"
                                        value="${clientCode}" list="cneCodeList" autocomplete="off">
                                    <datalist id="cneCodeList"></datalist>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                    <input name="branch" id="cneBranch" readonly
                                        class="form-input text-sm uppercase bg-gray-50 text-gray-500" value="${branchCode.toUpperCase() || ''}">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                    <input name="cn_date" type="date" required class="form-input text-sm" value="${existingDate.split('T')[0] || existingDate}">
                                </div>
                            </div>

                            <!-- Line Items -->
                            <div class="border rounded-lg overflow-hidden">
                                <div class="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                                    <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items (Credit)</span>
                                    <button type="button" id="cneAddLine"
                                        class="text-xs font-semibold text-pink-600 hover:text-pink-800 flex items-center gap-1">+ Add Line</button>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm" id="cneLinesTable">
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
                                        <tbody id="cneLineRows"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Totals -->
                            <div class="border rounded-lg p-3 bg-gray-50 space-y-1.5 text-sm" id="cneTotals">
                                <div class="flex justify-between text-gray-600"><span>Subtotal</span><span id="cne_subtotal" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between text-gray-600" id="cne_sgst_row"><span>SGST</span><span id="cne_sgst_val" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between text-gray-600" id="cne_cgst_row"><span>CGST</span><span id="cne_cgst_val" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between text-gray-600 hidden" id="cne_igst_row"><span>IGST</span><span id="cne_igst_val" class="font-medium">₹0.00</span></div>
                                <div class="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-1">
                                    <span>Total Credit</span>
                                    <span id="cne_grand_total" class="text-pink-700 text-base">₹0.00</span>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Description / Reason</label>
                                <input name="narration" class="form-input text-sm" value="${_escapeHtml(existingDesc)}">
                            </div>

                            <div class="flex justify-between items-center pt-2 border-t">
                                <div id="cneResponse" class="hidden text-sm"></div>
                                <button type="submit" id="cneSubmitBtn" class="btn btn-sm flex items-center gap-2 ml-auto">
                                    <span id="cneBtnText">Update Credit Note</span>
                                    <div id="cneSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>`;

            // Populate client datalist
            const dl = document.getElementById('cneCodeList');
        if (appData?.B2B) Object.values(appData.B2B).forEach(rec => {
                const o = document.createElement('option');
                o.value = code;
                o.label = `${code} — ${rec.B2B_NAME || ''}`;
                dl.appendChild(o);
            });

            function _applyClientAutofill() {
                const code = document.getElementById('cneCode').value.trim().toUpperCase();
                const b2b = Object.values(appData?.B2B || {}).find(c => c.CODE === code);
                if (!b2b) return;
                const branch = (b2b.BRANCH || '').toUpperCase();
                document.getElementById('cneBranch').value = branch;
                currentOpts = _getBranchDropdowns(branch);
                document.querySelectorAll('#cneLineRows tr').forEach(tr => {
                    const itemSel = tr.querySelector('.cne-item');
                    const tcSel = tr.querySelector('.cne-tc');
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
            document.getElementById('cneCode').addEventListener('input', _applyClientAutofill);
            document.getElementById('cneCode').addEventListener('change', _applyClientAutofill);

            let _lineCount = 0;

            function _addLine(defaultItem = '', defaultDesc = '', defaultQty = 1, defaultPrice = 0, defaultTc = '') {
                const idx = _lineCount++;
                const tr = document.createElement('tr');
                tr.id = `cneLine_${idx}`;
                tr.className = 'border-t border-gray-100';
                tr.innerHTML = `
                    <td class="py-1.5 px-2">
                        <select class="form-input text-xs cne-item" style="min-width:140px">${currentOpts.itemOpts}</select>
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="text" class="form-input text-xs cne-desc" placeholder="Description" style="min-width:120px" value="${_escapeHtml(defaultDesc)}">
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="number" class="form-input text-xs cne-qty text-right" value="${defaultQty}" min="0.001" step="any" style="min-width:55px">
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="number" class="form-input text-xs cne-price text-right" value="${defaultPrice}" min="0" step="0.01" style="min-width:80px">
                    </td>
                    <td class="py-1.5 px-2">
                        <select class="form-input text-xs cne-tc" style="min-width:120px">${currentOpts.tcOpts}</select>
                    </td>
                    <td class="py-1.5 px-2 text-right">
                        <span class="cne-amt text-gray-700 font-medium text-xs">₹0.00</span>
                    </td>
                    <td class="py-1.5 px-2 text-center">
                        <button type="button" class="cne-remove text-red-400 hover:text-red-600 text-lg leading-none" title="Remove line">×</button>
                    </td>`;
                document.getElementById('cneLineRows').appendChild(tr);

                if (defaultItem) tr.querySelector('.cne-item').value = defaultItem;
                if (defaultTc) tr.querySelector('.cne-tc').value = defaultTc;

                tr.querySelector('.cne-item').addEventListener('change', function() {
                    const descEl = tr.querySelector('.cne-desc');
                    if (!descEl.value) descEl.value = _titleCase(this.value);
                    _calcTotals();
                });
                tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', _calcTotals));
                tr.querySelector('.cne-remove').addEventListener('click', () => { tr.remove(); _calcTotals(); });
                _calcTotals();
            }

            function _calcTotals() {
                let subtotal = 0, sgst = 0, cgst = 0, igst = 0;
                document.querySelectorAll('#cneLineRows tr').forEach(tr => {
                    const qty = parseFloat(tr.querySelector('.cne-qty')?.value || 0);
                    const price = parseFloat(tr.querySelector('.cne-price')?.value || 0);
                    const tc = (tr.querySelector('.cne-tc')?.value || '').toUpperCase();
                    const lineAmt = qty * price;
                    subtotal += lineAmt;
                    tr.querySelector('.cne-amt').textContent = '₹' + lineAmt.toFixed(2);
                    if (tc.includes('IGST')) {
                        igst += lineAmt * _parseTaxRate(tr.querySelector('.cne-tc').value) / 100;
                    } else if (tc && tc !== '') {
                        const rate = _parseTaxRate(tr.querySelector('.cne-tc').value);
                        sgst += lineAmt * rate / 200;
                        cgst += lineAmt * rate / 200;
                    }
                });
                const grandTotal = subtotal + sgst + cgst + igst;
                document.getElementById('cne_subtotal').textContent = '₹' + subtotal.toFixed(2);
                document.getElementById('cne_sgst_val').textContent = '₹' + sgst.toFixed(2);
                document.getElementById('cne_cgst_val').textContent = '₹' + cgst.toFixed(2);
                document.getElementById('cne_igst_val').textContent = '₹' + igst.toFixed(2);
                document.getElementById('cne_grand_total').textContent = '₹' + grandTotal.toFixed(2);
                document.getElementById('cne_sgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
                document.getElementById('cne_cgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
                document.getElementById('cne_igst_row').classList.toggle('hidden', igst === 0);
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

            document.getElementById('cneAddLine').addEventListener('click', () => _addLine());
            _applyClientAutofill();

            document.getElementById('cneForm').addEventListener('submit', async e => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const raw = Object.fromEntries(fd);
                const btn = document.getElementById('cneSubmitBtn');
                const sp = document.getElementById('cneSpinner');
                const resp = document.getElementById('cneResponse');
                btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
                window.setLoading?.(true, 'Updating credit note...', 'detail');

                try {
                    const editClientCode = raw.code.trim().toUpperCase();
                    const lines = [];
                    document.querySelectorAll('#cneLineRows tr').forEach(tr => {
                        const item = tr.querySelector('.cne-item')?.value || '';
                        const desc = tr.querySelector('.cne-desc')?.value || '';
                        const qty = parseFloat(tr.querySelector('.cne-qty')?.value || 1);
                        const price = parseFloat(tr.querySelector('.cne-price')?.value || 0);
                        const tc = tr.querySelector('.cne-tc')?.value || '';
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
                        Date: raw.cn_date,
                        Customer: editClientCode,
                        Description: raw.narration || undefined,
                        Lines: lines,
                        TaxCodeEnabled: true,
                        HasLineNumber: true,
                        Rounding: true,
                    };

                    const url = `/api/manager/credit-notes/${raw.note_key}?code=${encodeURIComponent(editClientCode)}`;
                    const result = await callApi(url, payload, 'PUT');
                    const refNum = result.Reference || result.reference || 'updated';
                    resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                    resp.textContent = `✅ Credit Note ${refNum} updated in Manager.io!`;
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
            if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
        }
    }

    // ── New Credit Note Form (line items) ─────────────────────────────────────
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
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">➕ New Credit Note</h3></div>
                <div class="detail-card-body space-y-4">
                    <form id="cnForm" class="space-y-4">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                <input name="code" id="cnCode" required class="form-input text-sm uppercase"
                                    placeholder="e.g. AGWL" list="cnCodeList" autocomplete="off">
                                <datalist id="cnCodeList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                <input name="branch" id="cnBranch" readonly
                                    class="form-input text-sm uppercase bg-gray-50 text-gray-500" placeholder="Auto">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                <input name="cn_date" id="cnDate" type="date" required class="form-input text-sm">
                            </div>
                        </div>

                        <!-- Line Items -->
                        <div class="border rounded-lg overflow-hidden">
                            <div class="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items (Credit)</span>
                                <button type="button" id="cnAddLine"
                                    class="text-xs font-semibold text-pink-600 hover:text-pink-800 flex items-center gap-1">+ Add Line</button>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="w-full text-sm" id="cnLinesTable">
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
                                    <tbody id="cnLineRows"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Totals -->
                        <div class="border rounded-lg p-3 bg-gray-50 space-y-1.5 text-sm" id="cnTotals">
                            <div class="flex justify-between text-gray-600"><span>Subtotal</span><span id="cn_subtotal" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between text-gray-600" id="cn_sgst_row"><span>SGST</span><span id="cn_sgst_val" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between text-gray-600" id="cn_cgst_row"><span>CGST</span><span id="cn_cgst_val" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between text-gray-600 hidden" id="cn_igst_row"><span>IGST</span><span id="cn_igst_val" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-1">
                                <span>Total Credit</span>
                                <span id="cn_grand_total" class="text-pink-700 text-base">₹0.00</span>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Reason / Description</label>
                            <input name="narration" class="form-input text-sm" placeholder="Reason for credit note">
                        </div>

                        <div class="flex justify-between items-center pt-2 border-t">
                            <div id="cnResponse" class="hidden text-sm"></div>
                            <button type="submit" id="cnSubmitBtn" class="btn btn-sm flex items-center gap-2 ml-auto">
                                <span id="cnBtnText">Create Credit Note</span>
                                <div id="cnSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;

        // Populate client datalist
        const dl = document.getElementById('cnCodeList');
        if (appData?.B2B) Object.values(appData.B2B).forEach(rec => {
            if (rec.CODE) {
                const o = document.createElement('option');
                o.value = rec.CODE;
                o.label = `${rec.CODE} — ${rec.B2B_NAME || ''}`;
                dl.appendChild(o);
            }
        });

        function _applyClientAutofill() {
            const code = document.getElementById('cnCode').value.trim().toUpperCase();
            const b2b = Object.values(appData?.B2B || {}).find(c => c.CODE === code);
            if (!b2b) return;
            const branch = (b2b.BRANCH || '').toUpperCase();
            document.getElementById('cnBranch').value = branch;
            currentOpts = _getBranchDropdowns(branch);
            document.querySelectorAll('#cnLineRows tr').forEach(tr => {
                const itemSel = tr.querySelector('.cn-item');
                const tcSel = tr.querySelector('.cn-tc');
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
        document.getElementById('cnCode').addEventListener('input', _applyClientAutofill);
        document.getElementById('cnCode').addEventListener('change', _applyClientAutofill);

        document.getElementById('cnDate').value = new Date().toISOString().split('T')[0];

        let _lineCount = 0;

        function _addLine(defaultItem = '', defaultTc = '') {
            const idx = _lineCount++;
            const tr = document.createElement('tr');
            tr.id = `cnLine_${idx}`;
            tr.className = 'border-t border-gray-100';
            tr.innerHTML = `
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs cn-item" data-idx="${idx}" style="min-width:140px">${currentOpts.itemOpts}</select>
                </td>
                <td class="py-1.5 px-2">
                    <input type="text" class="form-input text-xs cn-desc" placeholder="Description" style="min-width:120px">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs cn-qty text-right" value="1" min="0.001" step="any" style="min-width:55px">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs cn-price text-right" value="" min="0" step="0.01" placeholder="0.00" style="min-width:80px">
                </td>
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs cn-tc" style="min-width:120px">${currentOpts.tcOpts}</select>
                </td>
                <td class="py-1.5 px-2 text-right">
                    <span class="cn-amt text-gray-700 font-medium text-xs">₹0.00</span>
                </td>
                <td class="py-1.5 px-2 text-center">
                    <button type="button" class="cn-remove text-red-400 hover:text-red-600 text-lg leading-none" title="Remove line">×</button>
                </td>`;
            document.getElementById('cnLineRows').appendChild(tr);

            if (defaultItem) tr.querySelector('.cn-item').value = defaultItem;
            if (defaultTc) tr.querySelector('.cn-tc').value = defaultTc;

            tr.querySelector('.cn-item').addEventListener('change', function() {
                const descEl = tr.querySelector('.cn-desc');
                if (!descEl.value) descEl.value = _titleCase(this.value);
                _calcTotals();
            });
            tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', _calcTotals));
            tr.querySelector('.cn-remove').addEventListener('click', () => { tr.remove(); _calcTotals(); });
            _calcTotals();
        }

        function _calcTotals() {
            let subtotal = 0, sgst = 0, cgst = 0, igst = 0;
            document.querySelectorAll('#cnLineRows tr').forEach(tr => {
                const qty = parseFloat(tr.querySelector('.cn-qty')?.value || 0);
                const price = parseFloat(tr.querySelector('.cn-price')?.value || 0);
                const tc = (tr.querySelector('.cn-tc')?.value || '').toUpperCase();
                const lineAmt = qty * price;
                subtotal += lineAmt;
                tr.querySelector('.cn-amt').textContent = '₹' + lineAmt.toFixed(2);
                if (tc.includes('IGST')) {
                    igst += lineAmt * _parseTaxRate(tr.querySelector('.cn-tc').value) / 100;
                } else if (tc && tc !== '') {
                    const rate = _parseTaxRate(tr.querySelector('.cn-tc').value);
                    sgst += lineAmt * rate / 200;
                    cgst += lineAmt * rate / 200;
                }
            });
            const grandTotal = subtotal + sgst + cgst + igst;
            document.getElementById('cn_subtotal').textContent = '₹' + subtotal.toFixed(2);
            document.getElementById('cn_sgst_val').textContent = '₹' + sgst.toFixed(2);
            document.getElementById('cn_cgst_val').textContent = '₹' + cgst.toFixed(2);
            document.getElementById('cn_igst_val').textContent = '₹' + igst.toFixed(2);
            document.getElementById('cn_grand_total').textContent = '₹' + grandTotal.toFixed(2);
            document.getElementById('cn_sgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
            document.getElementById('cn_cgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
            document.getElementById('cn_igst_row').classList.toggle('hidden', igst === 0);
        }

        _addLine();
        document.getElementById('cnAddLine').addEventListener('click', () => _addLine());

        document.getElementById('cnForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const raw = Object.fromEntries(fd);
            const btn = document.getElementById('cnSubmitBtn');
            const sp = document.getElementById('cnSpinner');
            const resp = document.getElementById('cnResponse');
            btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
            window.setLoading?.(true, 'Creating credit note...', 'detail');

            try {
                const clientCode = raw.code.trim().toUpperCase();
                const lines = [];
                document.querySelectorAll('#cnLineRows tr').forEach(tr => {
                    const item = tr.querySelector('.cn-item')?.value || '';
                    const desc = tr.querySelector('.cn-desc')?.value || '';
                    const qty = parseFloat(tr.querySelector('.cn-qty')?.value || 1);
                    const price = parseFloat(tr.querySelector('.cn-price')?.value || 0);
                    const tc = tr.querySelector('.cn-tc')?.value || '';
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
                    Date: raw.cn_date,
                    Customer: clientCode,
                    Description: raw.narration || undefined,
                    Lines: lines,
                    TaxCodeEnabled: true,
                    HasLineNumber: true,
                    Rounding: true,
                };

                const url = `/api/manager/credit-notes?code=${encodeURIComponent(clientCode)}`;
                const res = await callApi(url, payload, 'POST');
                const refNum = res.Reference || res.reference || 'created';
                resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                resp.textContent = `✅ Credit Note ${refNum} created in Manager.io.`;
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
        if (header && !document.getElementById('cnFilterBtn')) {
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
            filterBtn.id = 'cnFilterBtn';
            filterBtn.className = 'btn-ghost btn-sm flex-shrink-0';
            filterBtn.title = 'Filter Credit Notes';
            filterBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>`;
            filterBtn.onclick = () => document.getElementById('cnFilterModal')?.classList.remove('hidden');
            searchRow?.appendChild(filterBtn);
        }

        if (!document.getElementById('cnStatus')) {
            const statusEl = document.createElement('p');
            statusEl.id = 'cnStatus';
            statusEl.className = 'text-xs text-gray-500 px-4 pt-2 text-center font-medium';
            statusEl.textContent = 'Loading...';
            const listContainer = document.getElementById('vaultList')?.parentElement;
            listContainer?.insertBefore(statusEl, document.getElementById('vaultList'));
        }

        if (!document.getElementById('cnFilterModal')) {
            const modal = document.createElement('div');
            modal.id = 'cnFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h2 class="text-lg font-bold text-gray-800">Filter Credit Notes</h2>
                        <button onclick="document.getElementById('cnFilterModal').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Start Date</label>
                            <input type="date" id="cnFilterStart" class="form-input text-xs" value="${_filterStart}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">End Date</label>
                            <input type="date" id="cnFilterEnd" class="form-input text-xs" value="${_filterEnd}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Branch</label>
                            <select id="cnFilterBranch" class="form-input text-xs">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button id="cnResetBtn" class="btn-ghost btn-sm">Reset</button>
                        <button id="cnApplyBtn" class="btn btn-sm">Apply Filters</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

            document.getElementById('cnApplyBtn').onclick = async () => {
                _filterStart = document.getElementById('cnFilterStart').value;
                _filterEnd = document.getElementById('cnFilterEnd').value;
                _filterBranch = document.getElementById('cnFilterBranch').value;
                modal.classList.add('hidden');
                await load();
            };

            document.getElementById('cnResetBtn').onclick = async () => {
                const range = getCurrentFYRange();
                document.getElementById('cnFilterStart').value = range.start;
                document.getElementById('cnFilterEnd').value = range.end;
                document.getElementById('cnFilterBranch').value = '';

                _filterStart = range.start;
                _filterEnd = range.end;
                _filterBranch = '';
                await load();
            };

            getAppData().then(data => {
                const select = document.getElementById('cnFilterBranch');
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

        window.setLoading?.(true, 'Loading credit notes...', 'list');
        try {
            if (!window.appDB) {
                document.getElementById('vaultListMsg').textContent = 'IDB not available. Please wait for sync to complete.';
                return;
            }
            const branch = VaultPage.getActiveBranch();
            const rawHeaders = await window.appDB.getSheet('HEADER');
            _allNotes = Object.values(rawHeaders || {}).filter(h =>
                h.DOX_TYPE === 'Credit Note' &&
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

window.VaultCreditNotes = VaultCreditNotes;
