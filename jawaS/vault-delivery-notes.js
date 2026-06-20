// ============================================================================
// VAULT-DELIVERY-NOTES.JS — Delivery Notes via Manager.io API
// Tile: delivery-notes
// Data source: Manager.io /delivery-notes endpoint
// ============================================================================

const VaultDeliveryNotes = (() => {

    let _allNotes = [];
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

        const filtered = _allNotes.filter(e => {
            if (q) {
                const matchSearch = (e.reference || '').toLowerCase().includes(q) ||
                                     (e.customer || '').toLowerCase().includes(q) ||
                                     (e.description || '').toLowerCase().includes(q) ||
                                     (e.branch || '').toLowerCase().includes(q);
                if (!matchSearch) return false;
            }
            const d = e.deliveryDate || e.date || '';
            if (_filterStart && d < _filterStart) return false;
            if (_filterEnd && d > _filterEnd) return false;
            if (_filterBranch && (e.branch || '').toLowerCase() !== _filterBranch.toLowerCase()) return false;
            if (_filterStatus && (e.status || '').toLowerCase() !== _filterStatus.toLowerCase()) return false;
            return true;
        });

        filtered.sort((a, b) => {
            const dateA = a.deliveryDate || a.date || '';
            const dateB = b.deliveryDate || b.date || '';
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            return (b.reference || '').localeCompare(a.reference || '');
        });

        const statusEl = document.getElementById('dnStatus');
        if (statusEl) {
            statusEl.textContent = `Showing ${filtered.length} of ${_allNotes.length} Delivery Notes`;
        }

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No matching delivery notes found.</li>`;
            return;
        }
        ul.innerHTML = filtered.map(e => {
            const qty = typeof e.qtyDelivered === 'object' ? (e.qtyDelivered?.value || 0) : (+e.qtyDelivered || 0);
            const dDate = e.deliveryDate || e.date || '';
            const status = e.status || '';
            const statusColor = status.toUpperCase() === 'ACTIVE' ? 'text-green-700' : 'text-gray-700';
            return `<li data-key="${e.key}" class="p-3 rounded-lg cursor-pointer hover:bg-amber-50 border border-gray-200 transition-colors">
                <strong class="text-amber-700 block text-sm">${e.reference || 'N/A'} — ${e.customer || 'N/A'}</strong>
                <span class="text-xs text-gray-500">Qty: ${(+qty).toFixed(0)} · ${dDate || ''} · ${e.branch || ''}</span>
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
                _renderDetail(_allNotes.find(n => n.key === li.dataset.key));
            })
        );
    }

    function search() {
        _renderList();
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    async function _handleDelete(noteKey, branchCode) {
        if (!noteKey || !branchCode) {
            alert('Cannot delete: missing delivery note key or branch.');
            return;
        }
        if (!confirm('Delete this delivery note from Manager.io permanently?\n\nThis action cannot be undone.')) return;
        window.setLoading?.(true, 'Deleting delivery note...', 'detail');
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
            await callApi(`/api/manager/delivery-notes/${noteKey}?code=${encodeURIComponent(clientCode)}`, {}, 'DELETE');
            await load();
        } catch (err) {
            alert('Failed to delete delivery note: ' + (err.message || err));
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
                callApi(`/api/manager/delivery-note-details/${branchCode}/${noteKey}`, {}, 'GET'),
                getAppData()
            ]);

            if (appData?.B2B) {
                Object.values(appData.B2B).forEach(c => {
                    if (c.CODE) _b2bMap.set(c.CODE.trim().toUpperCase(), c);
                });
            }

            const note = _allNotes.find(n => n.key === noteKey);
            const ref = res.Reference || note?.reference || noteKey;
            const date = res.DeliveryDate || note?.deliveryDate || note?.date || '';
            const customerCode = note?.customer || '';
            const description = res.Description || '';

            const b2b = _b2bMap.get(customerCode.trim().toUpperCase());
            const b2bName = b2b?.B2B_NAME || customerCode;
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
            const branchGstin = branch?.BRANCH_GSTIN || '';

            const lines = res.Lines || [];
            let totalQty = 0;
            const linesHtml = lines.map((line, i) => {
                const desc = line.LineDescription || '';
                const qty = parseFloat(line.Qty || 1);
                totalQty += qty;
                return `<tr><td class="tc">${i+1}</td><td>${_escapeHtml(desc)}</td><td class="tr">${qty}</td></tr>`;
            }).join('');

            const css = `
                body{font-family:Arial,sans-serif;font-size:13px;color:#000;margin:0;padding:20px;background:#f5f5f5}
                .box{max-width:800px;margin:auto;background:#fff;padding:30px;border:1px solid #eee;box-shadow:0 0 10px rgba(0,0,0,.15)}
                .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:15px;margin-bottom:20px}
                .tr{text-align:right}.tc{text-align:center}
                .info{display:flex;justify-content:space-between;margin-bottom:20px;gap:20px}
                .col{width:48%}.col h3{margin:0 0 5px;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px}.col p{margin:2px 0;font-size:12px}
                .div{width:1px;background:#ccc}
                .meta{margin-bottom:20px;font-weight:bold;text-align:center}
                table{width:100%;border-collapse:collapse;margin-bottom:20px}table,th,td{border:1px solid #000}th,td{padding:6px;text-align:left}th{background:#f2f2f2}
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
                        <div style="font-size:26px;font-weight:bold;text-transform:uppercase;color:#f59e0b">Delivery Note</div>
                        <div style="text-align:right;font-size:12px">
                            <b>Ref No:</b> ${_escapeHtml(ref)}<br>
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

                    ${description ? `<div class="meta"><p>${_escapeHtml(description)}</p></div>` : ''}

                    ${lines.length ? `
                    <table>
                        <thead><tr><th class="tc">Sr</th><th>Item Description</th><th class="tr">Qty Delivered</th></tr></thead>
                        <tbody>${linesHtml}</tbody>
                        <tfoot><tr style="font-weight:bold"><td colspan="2" class="tr">Total Qty:</td><td class="tr">${totalQty}</td></tr></tfoot>
                    </table>
                    ` : ''}

                    <div class="sig">
                        <div class="sigbox">
                            <p style="margin-bottom:40px">Authorized Signatory</p>
                            <p>for ${_escapeHtml(branchName)}</p>
                            <p style="font-size:11px;color:#666;margin-top:5px">Customer acknowledgement: _______________</p>
                        </div>
                    </div>
                </div>`;

            const w = window.open('', 'Delivery_Note_' + ref.replace(/[^a-zA-Z0-9]/g, '_'));
            if (!w) { alert('Pop-up blocked! Please allow pop-ups.'); return; }
            w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Delivery Note - ' + _escapeHtml(ref) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>');
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
            <p class="text-gray-500 text-sm">Fetching delivery note details from Manager.io...</p>
        </div>`;
        VaultPage.showDetailPane();
        window.setLoading?.(true, 'Fetching delivery note details...', 'detail');

        try {
            const res = await callApi(`/api/manager/delivery-note-details/${listEntry.branch}/${listEntry.key}`, {}, 'GET');

            let totalQty = 0;
            (res.Lines || []).forEach(line => {
                totalQty += parseFloat(line.Qty || 1);
            });

            const linesRows = (res.Lines || []).map(line => {
                const qty = parseFloat(line.Qty || 1);
                return `
                    <tr class="hover:bg-gray-50/50 transition-colors">
                        <td class="px-4 py-2.5 text-gray-700 font-medium">${line.LineDescription || line.Item || 'Items'}</td>
                        <td class="px-4 py-2.5 text-right text-gray-900 font-semibold">${qty}</td>
                    </tr>
                `;
            }).join('');

            const qtyDelivered = typeof listEntry.qtyDelivered === 'object' ? (listEntry.qtyDelivered?.value || 0) : (+listEntry.qtyDelivered || 0);
            const dDate = listEntry.deliveryDate || listEntry.date || '';

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-body p-6 space-y-6">
                        <!-- Delivery Note Header -->
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-5">
                            <div class="flex-1 min-w-0">
                                <h1 class="text-xl font-bold text-amber-800 tracking-tight break-words">Delivery Note</h1>
                                <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-semibold text-gray-700">${listEntry.branch || 'N/A'}</span></p>
                            </div>
                            <div class="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                                <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                                    <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 uppercase whitespace-nowrap">DELIVERY</span>
                                    <button onclick="VaultDeliveryNotes._printEntry('${listEntry.key}', '${listEntry.branch}')"
                                        class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                                        </svg><span class="truncate">Print</span>
                                    </button>
                                    <button onclick="VaultDeliveryNotes._openEditPaneFromDetail('${listEntry.key}', '${listEntry.branch}', event)"
                                        class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                        </svg><span class="truncate">Edit</span>
                                    </button>
                                    <button onclick="VaultDeliveryNotes._handleDelete('${listEntry.key}', '${listEntry.branch}')"
                                        class="btn-danger btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg><span class="truncate">Delete</span>
                                    </button>
                                </div>
                                <p class="text-sm text-gray-500">Ref #: <span class="font-bold text-gray-800">${res.Reference || listEntry.reference || 'N/A'}</span></p>
                                <p class="text-xs text-gray-400">Delivery Date: ${dDate.split('T')[0] || dDate}</p>
                            </div>
                        </div>

                        <!-- Customer & Details -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Customer</h3>
                                <p class="font-semibold text-gray-800">${listEntry.customer || 'N/A'}</p>
                            </div>
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Details</h3>
                                <p class="text-gray-600">Order #: <span class="font-medium text-gray-800">${res.OrderNumber || 'N/A'}</span></p>
                                <p class="text-gray-600 mt-0.5">Total Qty: <span class="font-bold text-amber-700">${totalQty.toFixed(0)}</span></p>
                            </div>
                        </div>

                        <!-- Description -->
                        ${res.Description ? `
                        <div class="bg-amber-50/40 border border-amber-100/50 rounded-lg p-3 text-xs text-amber-950">
                            <span class="font-semibold block text-amber-800 uppercase tracking-wider mb-1" style="font-size: 10px;">Description</span>
                            ${res.Description}
                        </div>
                        ` : ''}

                        <!-- Lines Table -->
                        ${linesRows ? `
                        <div class="overflow-hidden border border-gray-100 rounded-lg">
                            <table class="min-w-full divide-y divide-gray-100 text-xs">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-2.5 text-left font-bold text-gray-500 uppercase">Item Description</th>
                                        <th class="px-4 py-2.5 text-right font-bold text-gray-500 uppercase">Qty Delivered</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 bg-white">
                                    ${linesRows}
                                </tbody>
                                <tfoot class="bg-gray-50">
                                    <tr>
                                        <td class="px-4 py-2.5 text-right font-bold text-gray-700 uppercase">Total Qty</td>
                                        <td class="px-4 py-2.5 text-right font-bold text-amber-700 text-sm">${totalQty}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        ` : ''}

                        <!-- Metadata -->
                        <details class="text-[11px] text-gray-400">
                            <summary class="cursor-pointer hover:text-gray-600 transition-colors">Audit & System Metadata</summary>
                            <div class="grid grid-cols-2 gap-2 mt-2 p-2 border rounded-lg bg-gray-50/50">
                                <div>Manager UUID: <span class="font-mono text-[9px]">${res.Key || listEntry.key || 'N/A'}</span></div>
                                ${res.InvoiceNumber ? `<div>Linked Invoice: ${res.InvoiceNumber}</div>` : ''}
                                ${res.InventoryLocation ? `<div>Location: ${res.InventoryLocation}</div>` : ''}
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
    async function _openEditPaneFromDetail(noteKey, branchCode, evt) {
        const btn = evt?.target?.closest('button');
        if (btn) { btn.disabled = true; btn.innerHTML = '...'; }
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-gray-400 text-sm">Loading delivery note form data…</div></div>`;
        VaultPage.showDetailPane();

        try {
            const res = await callApi(`/api/manager/delivery-note-details/${branchCode}/${noteKey}`, {}, 'GET');

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
            Object.entries(_bKeys.non_inventory_items || {}).forEach(([name, uuid]) => { _itemUuidToName[uuid] = name; });

            const existingRef = res.Reference || res.reference || '';
            const existingCustomer = res.Customer || res.customer || '';
            const existingDate = res.DeliveryDate || res.deliveryDate || res.Date || res.date || '';
            const existingDesc = res.Description || res.description || '';
            const existingLines = res.Lines || res.lines || [];

            function _getBranchDropdowns(brCode) {
                const bKey = (brCode || '').toLowerCase();
                const bKeys = window.__vaultCacheKeys?.[bKey] || {};
                const itemNames = Object.keys(bKeys.non_inventory_items || {}).sort();
                const itemOpts = `<option value="">— Select item —</option>` +
                    itemNames.map(n => `<option value="${n}">${_titleCase(n)}</option>`).join('');
                return { itemOpts, itemNames };
            }

            let currentOpts = _getBranchDropdowns(branchCode);

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">✏️ Edit Delivery Note — ${existingRef || noteKey}</h3></div>
                    <div class="detail-card-body space-y-4">
                        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                            ⚠️ Editing will update this delivery note in Manager.io. Reference number will be preserved.
                        </p>
                        <form id="dneForm" class="space-y-4">
                            <input type="hidden" name="note_key" value="${noteKey}">
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div class="sm:col-span-2">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                    <input name="code" id="dneCode" required class="form-input text-sm uppercase"
                                        value="${clientCode}" list="dneCodeList" autocomplete="off">
                                    <datalist id="dneCodeList"></datalist>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                    <input name="branch" id="dneBranch" readonly
                                        class="form-input text-sm uppercase bg-gray-50 text-gray-500" value="${branchCode.toUpperCase() || ''}">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                    <input name="dn_date" type="date" required class="form-input text-sm" value="${existingDate.split('T')[0] || existingDate}">
                                </div>
                            </div>

                            <!-- Line Items -->
                            <div class="border rounded-lg overflow-hidden">
                                <div class="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                                    <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items (Delivery)</span>
                                    <button type="button" id="dneAddLine"
                                        class="text-xs font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1">+ Add Line</button>
                                </div>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm" id="dneLinesTable">
                                        <thead>
                                            <tr class="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                                                <th class="py-2 px-2 text-left" style="min-width:160px">Item</th>
                                                <th class="py-2 px-2 text-left" style="min-width:200px">Description</th>
                                                <th class="py-2 px-2 text-right" style="min-width:80px">Qty</th>
                                                <th class="py-2 px-2" style="min-width:32px"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="dneLineRows"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Totals -->
                            <div class="border rounded-lg p-3 bg-gray-50 space-y-1.5 text-sm">
                                <div class="flex justify-between font-bold text-gray-800">
                                    <span>Total Qty</span>
                                    <span id="dne_total_qty" class="text-amber-700 text-base">0</span>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                <input name="narration" class="form-input text-sm" value="${_escapeHtml(existingDesc)}">
                            </div>

                            <div class="flex justify-between items-center pt-2 border-t">
                                <div id="dneResponse" class="hidden text-sm"></div>
                                <button type="submit" id="dneSubmitBtn" class="btn btn-sm flex items-center gap-2 ml-auto">
                                    <span id="dneBtnText">Update Delivery Note</span>
                                    <div id="dneSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>`;

            // Populate client datalist
            const dl = document.getElementById('dneCodeList');
            _b2bMap.forEach((rec, code) => {
                const o = document.createElement('option');
                o.value = code;
                o.label = `${code} — ${rec.B2B_NAME || ''}`;
                dl.appendChild(o);
            });

            function _applyClientAutofill() {
                const code = document.getElementById('dneCode').value.trim().toUpperCase();
                const b2b = _b2bMap.get(code);
                if (!b2b) return;
                const branch = (b2b.BRANCH || '').toUpperCase();
                document.getElementById('dneBranch').value = branch;
                currentOpts = _getBranchDropdowns(branch);
                document.querySelectorAll('#dneLineRows tr').forEach(tr => {
                    const itemSel = tr.querySelector('.dne-item');
                    if (itemSel) {
                        const prevItem = itemSel.value;
                        itemSel.innerHTML = currentOpts.itemOpts;
                        if (currentOpts.itemNames.includes(prevItem)) itemSel.value = prevItem;
                    }
                });
            }
            document.getElementById('dneCode').addEventListener('input', _applyClientAutofill);
            document.getElementById('dneCode').addEventListener('change', _applyClientAutofill);

            let _lineCount = 0;

            function _addLine(defaultItem = '', defaultDesc = '', defaultQty = 1) {
                const idx = _lineCount++;
                const tr = document.createElement('tr');
                tr.id = `dneLine_${idx}`;
                tr.className = 'border-t border-gray-100';
                tr.innerHTML = `
                    <td class="py-1.5 px-2">
                        <select class="form-input text-xs dne-item" style="min-width:140px">${currentOpts.itemOpts}</select>
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="text" class="form-input text-xs dne-desc" placeholder="Description" style="min-width:180px" value="${_escapeHtml(defaultDesc)}">
                    </td>
                    <td class="py-1.5 px-2">
                        <input type="number" class="form-input text-xs dne-qty text-right" value="${defaultQty}" min="0.001" step="any" style="min-width:70px">
                    </td>
                    <td class="py-1.5 px-2 text-center">
                        <button type="button" class="dne-remove text-red-400 hover:text-red-600 text-lg leading-none" title="Remove line">×</button>
                    </td>`;
                document.getElementById('dneLineRows').appendChild(tr);

                if (defaultItem) tr.querySelector('.dne-item').value = defaultItem;

                tr.querySelector('.dne-item').addEventListener('change', function() {
                    const descEl = tr.querySelector('.dne-desc');
                    if (!descEl.value) descEl.value = _titleCase(this.value);
                    _calcTotals();
                });
                tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', _calcTotals));
                tr.querySelector('.dne-remove').addEventListener('click', () => { tr.remove(); _calcTotals(); });
                _calcTotals();
            }

            function _calcTotals() {
                let totalQty = 0;
                document.querySelectorAll('#dneLineRows tr').forEach(tr => {
                    totalQty += parseFloat(tr.querySelector('.dne-qty')?.value || 0);
                });
                document.getElementById('dne_total_qty').textContent = totalQty;
            }

            // Populate existing lines
            if (existingLines.length) {
                existingLines.forEach(ln => {
                    const itemUuid = ln.Item || '';
                    const itemName = _itemUuidToName[itemUuid] || itemUuid;
                    const desc = ln.LineDescription || ln.lineDescription || '';
                    const qty = ln.Qty || ln.qty || 1;
                    _addLine(itemName, desc, qty);
                });
            } else {
                _addLine();
            }

            document.getElementById('dneAddLine').addEventListener('click', () => _addLine());
            _applyClientAutofill();

            document.getElementById('dneForm').addEventListener('submit', async e => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const raw = Object.fromEntries(fd);
                const btn = document.getElementById('dneSubmitBtn');
                const sp = document.getElementById('dneSpinner');
                const resp = document.getElementById('dneResponse');
                btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
                window.setLoading?.(true, 'Updating delivery note...', 'detail');

                try {
                    const editClientCode = raw.code.trim().toUpperCase();
                    const lines = [];
                    document.querySelectorAll('#dneLineRows tr').forEach(tr => {
                        const item = tr.querySelector('.dne-item')?.value || '';
                        const desc = tr.querySelector('.dne-desc')?.value || '';
                        const qty = parseFloat(tr.querySelector('.dne-qty')?.value || 1);
                        if (item || qty > 0) {
                            lines.push({
                                Item: item || undefined,
                                LineDescription: desc || undefined,
                                Qty: qty,
                            });
                        }
                    });
                    if (!lines.length) throw new Error('Add at least one line item.');

                    const payload = {
                        DeliveryDate: raw.dn_date,
                        Customer: editClientCode,
                        Description: raw.narration || undefined,
                        Lines: lines,
                    };

                    const url = `/api/manager/delivery-notes/${raw.note_key}?code=${encodeURIComponent(editClientCode)}`;
                    const result = await callApi(url, payload, 'PUT');
                    const refNum = result.Reference || result.reference || 'updated';
                    resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                    resp.textContent = `✅ Delivery Note ${refNum} updated in Manager.io!`;
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

    // ── New Delivery Note Form (line items) ─────────────────────────────────────
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
            const itemOpts = `<option value="">— Select item —</option>` +
                itemNames.map(n => `<option value="${n}">${_titleCase(n)}</option>`).join('');
            return { itemOpts, itemNames };
        }

        let currentOpts = _getBranchDropdowns(defaultBranch);

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">🚚 New Delivery Note</h3></div>
                <div class="detail-card-body space-y-4">
                    <form id="dnForm" class="space-y-4">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                <input name="code" id="dnCode" required class="form-input text-sm uppercase"
                                    placeholder="e.g. AGWL" list="dnCodeList" autocomplete="off">
                                <datalist id="dnCodeList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                <input name="branch" id="dnBranch" readonly
                                    class="form-input text-sm uppercase bg-gray-50 text-gray-500" placeholder="Auto">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                <input name="dn_date" id="dnDate" type="date" required class="form-input text-sm">
                            </div>
                        </div>

                        <!-- Line Items -->
                        <div class="border rounded-lg overflow-hidden">
                            <div class="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items (Delivery)</span>
                                <button type="button" id="dnAddLine"
                                    class="text-xs font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1">+ Add Line</button>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="w-full text-sm" id="dnLinesTable">
                                    <thead>
                                        <tr class="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                                            <th class="py-2 px-2 text-left" style="min-width:160px">Item</th>
                                            <th class="py-2 px-2 text-left" style="min-width:200px">Description</th>
                                            <th class="py-2 px-2 text-right" style="min-width:80px">Qty</th>
                                            <th class="py-2 px-2" style="min-width:32px"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="dnLineRows"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Totals -->
                        <div class="border rounded-lg p-3 bg-gray-50 space-y-1.5 text-sm">
                            <div class="flex justify-between font-bold text-gray-800">
                                <span>Total Quantity</span>
                                <span id="dn_total_qty" class="text-amber-700 text-base">0</span>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Description / Details</label>
                            <textarea name="narration" class="form-input text-sm" rows="2" placeholder="Describe the delivery items / quantities"></textarea>
                        </div>

                        <div class="flex justify-between items-center pt-2 border-t">
                            <div id="dnResponse" class="hidden text-sm"></div>
                            <button type="submit" id="dnSubmitBtn" class="btn btn-sm flex items-center gap-2 ml-auto">
                                <span id="dnBtnText">Save Delivery Note</span>
                                <div id="dnSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;

        // Populate client datalist
        const dl = document.getElementById('dnCodeList');
        _b2bMap.forEach((rec, code) => {
            const o = document.createElement('option');
            o.value = code;
            o.label = `${code} — ${rec.B2B_NAME || ''}`;
            dl.appendChild(o);
        });

        function _applyClientAutofill() {
            const code = document.getElementById('dnCode').value.trim().toUpperCase();
            const b2b = _b2bMap.get(code);
            if (!b2b) return;
            const branch = (b2b.BRANCH || '').toUpperCase();
            document.getElementById('dnBranch').value = branch;
            currentOpts = _getBranchDropdowns(branch);
            document.querySelectorAll('#dnLineRows tr').forEach(tr => {
                const itemSel = tr.querySelector('.dn-item');
                if (itemSel) {
                    const prevItem = itemSel.value;
                    itemSel.innerHTML = currentOpts.itemOpts;
                    if (currentOpts.itemNames.includes(prevItem)) itemSel.value = prevItem;
                }
            });
        }
        document.getElementById('dnCode').addEventListener('input', _applyClientAutofill);
        document.getElementById('dnCode').addEventListener('change', _applyClientAutofill);

        document.getElementById('dnDate').value = new Date().toISOString().split('T')[0];

        let _lineCount = 0;

        function _addLine(defaultItem = '') {
            const idx = _lineCount++;
            const tr = document.createElement('tr');
            tr.id = `dnLine_${idx}`;
            tr.className = 'border-t border-gray-100';
            tr.innerHTML = `
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs dn-item" style="min-width:140px">${currentOpts.itemOpts}</select>
                </td>
                <td class="py-1.5 px-2">
                    <input type="text" class="form-input text-xs dn-desc" placeholder="Description" style="min-width:180px">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs dn-qty text-right" value="1" min="0.001" step="any" style="min-width:70px">
                </td>
                <td class="py-1.5 px-2 text-center">
                    <button type="button" class="dn-remove text-red-400 hover:text-red-600 text-lg leading-none" title="Remove line">×</button>
                </td>`;
            document.getElementById('dnLineRows').appendChild(tr);

            if (defaultItem) tr.querySelector('.dn-item').value = defaultItem;

            tr.querySelector('.dn-item').addEventListener('change', function() {
                const descEl = tr.querySelector('.dn-desc');
                if (!descEl.value) descEl.value = _titleCase(this.value);
                _calcTotals();
            });
            tr.querySelectorAll('input, select').forEach(el => el.addEventListener('input', _calcTotals));
            tr.querySelector('.dn-remove').addEventListener('click', () => { tr.remove(); _calcTotals(); });
            _calcTotals();
        }

        function _calcTotals() {
            let totalQty = 0;
            document.querySelectorAll('#dnLineRows tr').forEach(tr => {
                totalQty += parseFloat(tr.querySelector('.dn-qty')?.value || 0);
            });
            document.getElementById('dn_total_qty').textContent = totalQty;
        }

        _addLine();
        document.getElementById('dnAddLine').addEventListener('click', () => _addLine());

        document.getElementById('dnForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const raw = Object.fromEntries(fd);
            const btn = document.getElementById('dnSubmitBtn');
            const sp = document.getElementById('dnSpinner');
            const resp = document.getElementById('dnResponse');
            btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
            window.setLoading?.(true, 'Creating delivery note...', 'detail');

            try {
                const clientCode = raw.code.trim().toUpperCase();
                const lines = [];
                document.querySelectorAll('#dnLineRows tr').forEach(tr => {
                    const item = tr.querySelector('.dn-item')?.value || '';
                    const desc = tr.querySelector('.dn-desc')?.value || '';
                    const qty = parseFloat(tr.querySelector('.dn-qty')?.value || 1);
                    if (item || qty > 0) {
                        lines.push({
                            Item: item || undefined,
                            LineDescription: desc || undefined,
                            Qty: qty,
                        });
                    }
                });
                if (!lines.length) throw new Error('Add at least one line item.');

                const payload = {
                    DeliveryDate: raw.dn_date,
                    Customer: clientCode,
                    Description: raw.narration || undefined,
                    Lines: lines,
                };

                const url = `/api/manager/delivery-notes?code=${encodeURIComponent(clientCode)}`;
                const res = await callApi(url, payload, 'POST');
                const refNum = res.Reference || res.reference || 'created';
                resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                resp.textContent = `✅ Delivery Note ${refNum} created in Manager.io.`;
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
        if (header && !document.getElementById('dnFilterBtn')) {
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
            filterBtn.id = 'dnFilterBtn';
            filterBtn.className = 'btn-ghost btn-sm flex-shrink-0';
            filterBtn.title = 'Filter Delivery Notes';
            filterBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>`;
            filterBtn.onclick = () => document.getElementById('dnFilterModal')?.classList.remove('hidden');
            searchRow?.appendChild(filterBtn);
        }

        if (!document.getElementById('dnStatus')) {
            const statusEl = document.createElement('p');
            statusEl.id = 'dnStatus';
            statusEl.className = 'text-xs text-gray-500 px-4 pt-2 text-center font-medium';
            statusEl.textContent = 'Loading...';
            const listContainer = document.getElementById('vaultList')?.parentElement;
            listContainer?.insertBefore(statusEl, document.getElementById('vaultList'));
        }

        if (!document.getElementById('dnFilterModal')) {
            const modal = document.createElement('div');
            modal.id = 'dnFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h2 class="text-lg font-bold text-gray-800">Filter Delivery Notes</h2>
                        <button onclick="document.getElementById('dnFilterModal').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Start Date</label>
                            <input type="date" id="dnFilterStart" class="form-input text-xs" value="${_filterStart}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">End Date</label>
                            <input type="date" id="dnFilterEnd" class="form-input text-xs" value="${_filterEnd}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Branch</label>
                            <select id="dnFilterBranch" class="form-input text-xs">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Status</label>
                            <select id="dnFilterStatus" class="form-input text-xs">
                                <option value="">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="draft">Draft</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button id="dnResetBtn" class="btn-ghost btn-sm">Reset</button>
                        <button id="dnApplyBtn" class="btn btn-sm">Apply Filters</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

            document.getElementById('dnApplyBtn').onclick = async () => {
                _filterStart = document.getElementById('dnFilterStart').value;
                _filterEnd = document.getElementById('dnFilterEnd').value;
                _filterBranch = document.getElementById('dnFilterBranch').value;
                _filterStatus = document.getElementById('dnFilterStatus').value;
                modal.classList.add('hidden');
                await load();
            };

            document.getElementById('dnResetBtn').onclick = async () => {
                const range = getCurrentFYRange();
                document.getElementById('dnFilterStart').value = range.start;
                document.getElementById('dnFilterEnd').value = range.end;
                document.getElementById('dnFilterBranch').value = '';
                document.getElementById('dnFilterStatus').value = '';

                _filterStart = range.start;
                _filterEnd = range.end;
                _filterBranch = '';
                _filterStatus = '';
                await load();
            };

            getAppData().then(data => {
                const select = document.getElementById('dnFilterBranch');
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

        window.setLoading?.(true, 'Loading delivery notes...', 'list');
        try {
            const branch = VaultPage.getActiveBranch();
            const url = `/api/manager/all-delivery-notes?startDate=${_filterStart || ''}&endDate=${_filterEnd || ''}&branch=${branch || ''}`;
            const res = await callApi(url, {}, 'GET');
            if (res.status === 'success') {
                _allNotes = res.deliveryNotes || [];
                document.getElementById('vaultListMsg').textContent = '';
                _renderList();
            } else {
                document.getElementById('vaultListMsg').textContent = 'Failed to load delivery notes.';
            }
        } catch (err) {
            document.getElementById('vaultListMsg').textContent = 'Error: ' + (err.message || err);
        } finally {
            window.setLoading?.(false);
        }
    }

    return { load, search, openAddPane, _handleDelete, _printEntry, _openEditPaneFromDetail };
})();

window.VaultDeliveryNotes = VaultDeliveryNotes;
