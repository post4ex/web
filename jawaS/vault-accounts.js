// ============================================================================
// VAULT-ACCOUNTS.JS — Cheque tracking (Manager.io) + Bank account reference
// Tiles: cheques (💳), bank-accounts (🏛️)
// API:
//   GET  /api/manager/all-cheques                  — cross-branch cheque list
//   GET  /api/manager/cheque-details/{type}/{b}/{k} — cheque form detail
//   PUT  /api/manager/cheque-status/{type}/{k}      — mark cleared/pending
//   GET  /api/manager/bank-accounts?code=XXX        — bank accounts (manager side)
// ============================================================================

const VaultAccounts = (() => {

    let _chequesList = [];
    let _allLedger = [];
    let _allBranches = [];
    let _allCarriers = [];
    let _b2bList = [];
    let _b2bMap = new Map();
    let _activeTile = 'cheques';

    // ── Filter state ────────────────────────────────────────────────────────────
    function getCurrentFYRange() {
        const now = new Date();
        const currentYear = now.getFullYear();
        let startYear = currentYear;
        if (now.getMonth() < 3) startYear = currentYear - 1;
        return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
    }
    const _fyRange = getCurrentFYRange();
    let _filterStart = _fyRange.start;
    let _filterEnd   = _fyRange.end;
    let _filterBranch = '';
    let _filterStatus = '';

    function _can(role) { return window.VaultPage?.can(role); }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Common list injection ─────────────────────────────────────────────────
    function _injectListPane(placeholder) {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = placeholder || 'Search…';
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function _getClientCodeForBranch(branch) {
        const b = branch?.toLowerCase();
        const found = _b2bList.find(c => (c.BRANCH || '').toLowerCase() === b);
        return found ? found.CODE : null;
    }

    // ========================================================================
    // CHEQUES TILE (Manager.io API)
    // ========================================================================

    async function _fetchCheques() {
        const branchSelect = document.getElementById('vaultBranchSelect');
        const branch = branchSelect ? branchSelect.value : '';
        window.setLoading?.(true, 'Loading cheques...', 'list');
        try {
            const res = await callApi(
                `/api/manager/all-cheques?startDate=${_filterStart || ''}&endDate=${_filterEnd || ''}&branch=${branch || ''}&status=${_filterStatus || ''}`,
                {}, 'GET'
            );
            _chequesList = res.cheques || [];
        } catch (err) {
            console.error('[VaultAccounts] Failed to fetch cheques:', err);
            _chequesList = [];
        } finally {
            window.setLoading?.(false);
        }
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = _chequesList.filter(item => {
            if (q) {
                const entity = item.customer || item.supplier || {};
                const match = (item.chequeNumber || '').toLowerCase().includes(q) ||
                    (entity.name || '').toLowerCase().includes(q) ||
                    (item.date || '').includes(q) ||
                    (item.branch || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            if (_filterBranch && (item.branch || '').toLowerCase() !== _filterBranch.toLowerCase()) return false;
            return true;
        });

        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // Status label
        const statusEl = document.getElementById('chqStatus');
        if (statusEl) {
            statusEl.textContent = `Showing ${filtered.length} of ${_chequesList.length} Cheques`;
        }

        if (!filtered.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No cheque entries found.</li>';
            return;
        }

        ul.innerHTML = filtered.slice(0, 100).map(item => {
            const amt = item.total?.value || 0;
            const isReceipt = item.chequeType === 'receipt';
            const isCleared = item.cleared === true;
            const chqBadge = isCleared ? '<span class="text-green-600">✅</span>' : '<span class="text-yellow-600">⏳</span>';
            const typeIcon = isReceipt ? '📥' : '📤';
            const entityName = item.customer?.name || item.supplier?.name || '';
            return `<li data-key="${item.key}" data-type="${item.chequeType}" data-branch="${item.branch || ''}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <div>
                        <strong class="text-blue-700 block text-sm">${chqBadge} ${typeIcon} ${_escapeHtml(item.chequeNumber || 'N/A')} — ₹${amt.toFixed(2)}</strong>
                        <span class="text-xs text-gray-500">${_escapeHtml(entityName)}</span>
                    </div>
                    <span class="text-xs text-gray-400">${_escapeHtml(item.branch || '')}</span>
                </div>
                <div class="flex gap-3 text-xs mt-1">
                    <span class="text-gray-400">${_escapeHtml(item.date || '')}</span>
                    <span class="text-gray-400 capitalize">${item.chequeType}</span>
                </div>
            </li>`;
        }).join('');

        ul.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderChequeDetail(li.dataset.type, li.dataset.key, li.dataset.branch);
            });
        });
    }

    function search() { _renderList(); }

    // ── Detail view ────────────────────────────────────────────────────────────
    async function _renderChequeDetail(chequeType, key, branch) {
        if (!key || !branch) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `<div class="text-center py-8"><div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>`;
        VaultPage.showDetailPane();

        window.setLoading?.(true, 'Fetching cheque...', 'detail');
        try {
            const formData = await callApi(
                `/api/manager/cheque-details/${chequeType}/${branch}/${key}`,
                {}, 'GET'
            );

            const isReceipt = chequeType === 'receipt';
            const dirLabel = isReceipt ? 'Receipt from client' : 'Payment to vendor';
            const entityNameKey = isReceipt ? 'Customer' : 'Supplier';
            const bankKey = isReceipt ? 'ReceivedIn' : 'PaidFrom';
            const amount = formData.Lines?.reduce((s, l) => s + (l.Amount || 0), 0) || 0;

            const chqNumber = formData.Reference || formData.reference || 'N/A';
            const isCleared = formData.Cleared === true;
            const chqStatusBadge = isCleared
                ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">✅ CLEARED</span>'
                : '<span class="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">⏳ PENDING</span>';

            const actionBtns = !isCleared ? `
                <span class="flex gap-2 mt-3">
                    <button onclick="VaultAccounts._updateChequeStatus('${chequeType}', '${key}', true, '${branch}')" class="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">✅ Mark Cleared</button>
                </span>` : '';

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-body p-6 space-y-6">
                        <!-- Header -->
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-5">
                            <div class="flex-1 min-w-0">
                                <h1 class="text-xl font-bold text-blue-800 tracking-tight break-words">💳 Cheque Detail</h1>
                                <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-semibold text-gray-700">${_escapeHtml(branch.toUpperCase())}</span></p>
                            </div>
                            <div class="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                                <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                                    <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 uppercase whitespace-nowrap">${isReceipt ? 'RECEIPT' : 'PAYMENT'}</span>
                                    <button onclick="VaultAccounts._printCheque('${chequeType}','${key}','${branch}')"
                                        class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                                        </svg><span class="truncate">Print</span>
                                    </button>
                                </div>
                                <p class="text-sm text-gray-500">Cheque #: <span class="font-bold text-gray-800">${_escapeHtml(chqNumber)}</span></p>
                                <p class="text-xs text-gray-400">Date: ${_escapeHtml(formData.Date || formData.date || 'N/A')}</p>
                            </div>
                        </div>

                        <!-- Amount & Status -->
                        <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                            <div class="flex items-center justify-between">
                                <div>
                                    <div class="text-lg font-bold text-blue-800">₹${amount.toFixed(2)}</div>
                                    <div class="text-xs text-blue-600">${dirLabel}</div>
                                </div>
                                <div class="text-right">
                                    <div>${chqStatusBadge}</div>
                                </div>
                            </div>
                            ${actionBtns}
                        </div>

                        <!-- Cheque Details Grid -->
                        <div class="grid grid-cols-2 gap-3 text-sm bg-white border rounded-lg p-3">
                            <div><span class="text-gray-500">Cheque No:</span> <span class="font-semibold">${_escapeHtml(chqNumber)}</span></div>
                            <div><span class="text-gray-500">Cheque Date:</span> ${_escapeHtml(formData.Date || formData.date || 'N/A')}</div>
                            <div><span class="text-gray-500">${entityNameKey}:</span> <span class="font-semibold">${_escapeHtml(formData[entityNameKey] || 'N/A')}</span></div>
                            <div><span class="text-gray-500">Direction:</span> ${isReceipt ? 'Receipt (Money In)' : 'Payment (Money Out)'}</div>
                        </div>

                        <!-- Description -->
                        ${formData.Description ? `<div class="bg-blue-50/40 border border-blue-100/50 rounded-lg p-3 text-xs text-blue-950">
                            <span class="font-semibold block text-blue-800 uppercase tracking-wider mb-1" style="font-size: 10px;">Description</span>
                            ${_escapeHtml(formData.Description)}
                        </div>` : ''}

                        <!-- Lines Table -->
                        <div class="overflow-hidden border border-gray-100 rounded-lg">
                            <table class="min-w-full divide-y divide-gray-100 text-xs">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-2.5 text-left font-bold text-gray-500 uppercase">#</th>
                                        <th class="px-4 py-2.5 text-left font-bold text-gray-500 uppercase">Account</th>
                                        <th class="px-4 py-2.5 text-right font-bold text-gray-500 uppercase">Amount</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 bg-white">
                                    ${(formData.Lines || []).map((line, i) => {
                                        const accountName = line.Account || '';
                                        return `<tr><td class="py-1 text-xs text-gray-500">${i + 1}</td><td class="py-1 text-sm">${_escapeHtml(accountName)}</td><td class="py-1 text-sm text-right font-medium">₹${(line.Amount || 0).toFixed(2)}</td></tr>`;
                                    }).join('') || '<tr><td colspan="3" class="text-center py-4 text-gray-400 text-sm">No lines</td></tr>'}
                                </tbody>
                            </table>
                        </div>

                        <!-- Summary -->
                        <div class="flex justify-end pt-2">
                            <div class="w-full md:w-64 space-y-2 text-xs bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <div class="flex justify-between font-bold text-gray-800 text-sm">
                                    <span>Total:</span>
                                    <span class="text-blue-700 font-extrabold">₹${amount.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Metadata -->
                        <details class="text-[11px] text-gray-400">
                            <summary class="cursor-pointer hover:text-gray-600 transition-colors">Audit & System Metadata</summary>
                            <div class="grid grid-cols-2 gap-2 mt-2 p-2 border rounded-lg bg-gray-50/50">
                                <div>Branch: ${_escapeHtml(branch.toUpperCase())}</div>
                                <div>Manager UUID: <span class="font-mono text-[9px]">${formData.Key || formData.key || 'N/A'}</span></div>
                                <div>Type: ${chequeType}</div>
                                <div>Cleared: ${isCleared ? 'Yes' : 'No'}</div>
                            </div>
                        </details>
                    </div>
                </div>`;
        } catch (err) {
            view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-red-600"><p class="text-sm">Failed to load: ${err.message || err}</p></div></div>`;
        } finally {
            window.setLoading?.(false);
        }
        VaultPage.showDetailPane();
    }

    // ── Update clearance status ────────────────────────────────────────────────
    async function _updateChequeStatus(chequeType, key, cleared, branch) {
        const clientCode = _getClientCodeForBranch(branch);
        if (!clientCode) {
            alert(`Cannot update: no client code found for branch ${branch}.`);
            return;
        }
        if (!confirm(`Mark this cheque as ${cleared ? 'CLEARED' : 'PENDING'}?`)) return;

        window.setLoading?.(true, 'Updating cheque status...', 'detail');
        try {
            const res = await callApi(
                `/api/manager/cheque-status/${chequeType}/${key}?cleared=${cleared}&code=${encodeURIComponent(clientCode)}`,
                {}, 'PUT'
            );
            // Refresh
            await _fetchCheques();
            _renderList();
            _renderChequeDetail(chequeType, key, branch);
        } catch (err) {
            alert('Failed to update status: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Print ─────────────────────────────────────────────────────────────────
    async function _printCheque(chequeType, key, branch) {
        window.setLoading?.(true, 'Preparing print...', 'detail');
        try {
            const [formData, appData] = await Promise.all([
                callApi(`/api/manager/cheque-details/${chequeType}/${branch}/${key}`, {}, 'GET'),
                getAppData()
            ]);

            const isReceipt = chequeType === 'receipt';
            const entityNameKey = isReceipt ? 'Customer' : 'Supplier';
            const ref = formData.Reference || formData.reference || key;
            const date = formData.Date || formData.date || '';
            const chqNumber = ref;
            const amt = formData.Lines?.reduce((s, l) => s + (l.Amount || 0), 0) || 0;

            // Branch info
            let branchInfo = null;
            if (appData?.BRANCHES) {
                Object.values(appData.BRANCHES).forEach(b => {
                    if ((b.BRANCH_CODE || '').toLowerCase() === (branch || '').toLowerCase()) {
                        branchInfo = b;
                    }
                });
            }
            const branchName = branchInfo?.BRANCH_NAME || branch.toUpperCase();
            const branchAddr = branchInfo?.BRANCH_ADDRESS || '';
            const branchCity = branchInfo?.BRANCH_CITY || '';
            const branchState = branchInfo?.BRANCH_STATE || '';

            const isCleared = formData.Cleared === true;
            const clearedLabel = isCleared ? '✅ Cleared' : '⏳ Pending';

            const lines = formData.Lines || [];
            const linesHtml = lines.map((line, i) =>
                `<tr><td class="tc">${i+1}</td><td>${_escapeHtml(line.Account || '')}</td><td class="tr">₹${(line.Amount || 0).toFixed(2)}</td></tr>`
            ).join('');

            const css = `
                body{font-family:Arial,sans-serif;font-size:13px;color:#000;margin:0;padding:20px;background:#f5f5f5}
                .box{max-width:800px;margin:auto;background:#fff;padding:30px;border:1px solid #eee;box-shadow:0 0 10px rgba(0,0,0,.15)}
                .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2563eb;padding-bottom:15px;margin-bottom:20px}
                .tr{text-align:right}.tc{text-align:center}
                .info{display:flex;justify-content:space-between;margin-bottom:20px;gap:20px}
                .col{width:48%}.col h3{margin:0 0 5px;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px}.col p{margin:2px 0;font-size:12px}
                .div{width:1px;background:#ccc}.divb{height:2px;background:#2563eb;margin-bottom:20px}
                table{width:100%;border-collapse:collapse;margin-bottom:20px}table,th,td{border:1px solid #000}th,td{padding:6px;text-align:left}th{background:#f2f2f2}
                .sig{text-align:right;font-weight:bold;margin-top:20px}.sigbox{display:inline-block;text-align:center;min-width:200px}
                .no-print{text-align:center;margin-bottom:15px}
                .no-print button{padding:8px 20px;margin:3px;border:none;border-radius:4px;cursor:pointer;font-weight:600}
                .no-print .print-btn{background:#2563eb;color:#fff}
                .no-print .close-btn{background:#6b7280;color:#fff}
                @media print{@page{size:A4;margin:10mm}body{background:#fff;padding:0}.box{box-shadow:none;border:none}.no-print{display:none}}
            `;

            const body = `
                <div class="no-print"><button class="print-btn" onclick="window.print()">🖨️ Print</button><button class="close-btn" onclick="window.close()">✕ Close</button></div>
                <div class="box">
                    <div class="hdr">
                        <div style="font-size:26px;font-weight:bold;text-transform:uppercase;color:#2563eb">💳 Cheque</div>
                        <div style="text-align:right;font-size:12px">
                            <b>Cheque No:</b> ${_escapeHtml(chqNumber)}<br>
                            <b>Date:</b> ${_escapeHtml(date.split('T')[0] || date)}
                        </div>
                    </div>

                    <div style="display:flex;justify-content:space-between;background:#eff6ff;padding:12px;border-radius:6px;margin-bottom:20px">
                        <div><b>Amount:</b> ₹${amt.toFixed(2)}</div>
                        <div><b>Status:</b> ${clearedLabel}</div>
                        <div><b>Type:</b> ${isReceipt ? 'Receipt' : 'Payment'}</div>
                    </div>

                    <div class="info">
                        <div class="col">
                            <h3>Branch: ${_escapeHtml(branchName)}</h3>
                            <p><b>Address:</b> ${_escapeHtml(branchAddr)}</p>
                            <p><b>City:</b> ${_escapeHtml(branchCity)}, ${_escapeHtml(branchState)}</p>
                        </div>
                        <div class="div"></div>
                        <div class="col">
                            <h3>${entityNameKey}</h3>
                            <p><b>${entityNameKey} Key:</b> ${_escapeHtml(formData[entityNameKey] || 'N/A')}</p>
                            <p><b>Branch:</b> ${_escapeHtml(branch.toUpperCase())}</p>
                        </div>
                    </div>

                    <div class="divb"></div>
                    ${formData.Description ? `<div style="margin-bottom:20px;font-weight:bold;text-align:center"><p>${_escapeHtml(formData.Description)}</p></div>` : ''}

                    ${lines.length ? `
                    <table>
                        <thead><tr><th class="tc">Sr</th><th>Account</th><th class="tr">Amount</th></tr></thead>
                        <tbody>${linesHtml}</tbody>
                    </table>
                    ` : ''}

                    <div style="margin-top:10px;text-align:right;font-size:16px;font-weight:bold;color:#2563eb">
                        Total: ₹${amt.toFixed(2)}
                    </div>

                    <div class="sig">
                        <div class="sigbox">
                            <p style="margin-bottom:40px">Authorized Signatory</p>
                            <p>for ${_escapeHtml(branchName)}</p>
                        </div>
                    </div>
                </div>`;

            const w = window.open('', 'Cheque_' + chqNumber.replace(/[^a-zA-Z0-9]/g, '_'));
            if (!w) { alert('Pop-up blocked! Please allow pop-ups.'); return; }
            w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cheque - ' + _escapeHtml(chqNumber) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>');
            w.document.close();
            w.onload = function() {
                setTimeout(function() {
                    try {
                        w.document.querySelectorAll('.no-print').forEach(function(e) { e.style.display = 'block'; });
                    } catch(_) {}
                }, 500);
            };
        } catch (err) {
            alert('Failed to load cheque details for print: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Filter UI injection ────────────────────────────────────────────────────
    function _injectFilterUI() {
        const listPane = document.getElementById('vaultListPane');
        const header = listPane?.querySelector('.sv-pane-header');
        if (header && !document.getElementById('chqFilterBtn')) {
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
            filterBtn.id = 'chqFilterBtn';
            filterBtn.className = 'btn-ghost btn-sm flex-shrink-0';
            filterBtn.title = 'Filter Cheques';
            filterBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>`;
            filterBtn.onclick = () => document.getElementById('chqFilterModal')?.classList.remove('hidden');
            searchRow?.appendChild(filterBtn);
        }

        if (!document.getElementById('chqStatus')) {
            const statusEl = document.createElement('p');
            statusEl.id = 'chqStatus';
            statusEl.className = 'text-xs text-gray-500 px-4 pt-2 text-center font-medium';
            statusEl.textContent = 'Loading...';
            const listContainer = document.getElementById('vaultList')?.parentElement;
            listContainer?.insertBefore(statusEl, document.getElementById('vaultList'));
        }

        if (!document.getElementById('chqFilterModal')) {
            const modal = document.createElement('div');
            modal.id = 'chqFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h2 class="text-lg font-bold text-gray-800">Filter Cheques</h2>
                        <button onclick="document.getElementById('chqFilterModal').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Start Date</label>
                            <input type="date" id="chqFilterStart" class="form-input text-xs" value="${_filterStart}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">End Date</label>
                            <input type="date" id="chqFilterEnd" class="form-input text-xs" value="${_filterEnd}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Branch</label>
                            <select id="chqFilterBranch" class="form-input text-xs">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Status</label>
                            <select id="chqFilterStatus" class="form-input text-xs">
                                <option value="">All</option>
                                <option value="cleared">Cleared</option>
                                <option value="pending">Pending</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button id="chqResetBtn" class="btn-ghost btn-sm">Reset</button>
                        <button id="chqApplyBtn" class="btn btn-sm">Apply Filters</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

            document.getElementById('chqApplyBtn').onclick = async () => {
                _filterStart = document.getElementById('chqFilterStart').value;
                _filterEnd = document.getElementById('chqFilterEnd').value;
                _filterBranch = document.getElementById('chqFilterBranch').value;
                _filterStatus = document.getElementById('chqFilterStatus').value;
                modal.classList.add('hidden');
                await _fetchCheques();
                _renderList();
            };

            document.getElementById('chqResetBtn').onclick = async () => {
                const range = getCurrentFYRange();
                document.getElementById('chqFilterStart').value = range.start;
                document.getElementById('chqFilterEnd').value = range.end;
                document.getElementById('chqFilterBranch').value = '';
                document.getElementById('chqFilterStatus').value = '';
                _filterStart = range.start;
                _filterEnd = range.end;
                _filterBranch = '';
                _filterStatus = '';
                await _fetchCheques();
                _renderList();
            };

            getAppData().then(data => {
                const select = document.getElementById('chqFilterBranch');
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

    // ========================================================================
    // BANK ACCOUNTS TILE (unchanged — uses appData ledger)
    // ========================================================================

    function _computeBankBalance(code) {
        let balance = 0;
        const entries = _allLedger.filter(e => e.STATUS === 'ACTIVE' && e.CODE === code);
        entries.forEach(e => {
            if (e.DIRECTION === 'OUTWARD') balance += (+e.DEBIT||0) - (+e.CREDIT||0);
            else balance += (+e.CREDIT||0) - (+e.DEBIT||0);
        });
        return balance;
    }

    function _getBankAccounts() {
        const branchAccounts = (_allBranches || []).filter(b => b.BRANCH_BANK_NAME || b.BRANCH_UPI).map(b => ({
            type: 'Branch',
            name: b.BRANCH_NAME || b.BRANCH_CODE || '',
            code: b.BRANCH_CODE || '',
            bank: b.BRANCH_BANK_NAME || '',
            account: b.BRANCH_BANK_AC || '',
            ifsc: b.BRANCH_IFSC || '',
            upi: b.BRANCH_UPI || '',
            upiName: b.BRANCH_UPI_NAME || '',
            balance: _computeBankBalance(b.BRANCH_CODE),
            raw: b,
        }));

        const carrierAccounts = (_allCarriers || []).filter(c => c.BANK_NAME || c.UPI).map(c => ({
            type: 'Carrier',
            name: c.COMPANY_NAME || c.COMPANY_CODE || '',
            code: c.COMPANY_CODE || '',
            bank: c.BANK_NAME || '',
            account: c.BANK_AC || '',
            ifsc: c.IFSC || '',
            upi: c.UPI || '',
            upiName: '',
            balance: _computeBankBalance(c.COMPANY_CODE),
            raw: c,
        }));

        return [...branchAccounts, ...carrierAccounts];
    }

    function _renderBankAccountStatement(code, name) {
        const entries = _allLedger.filter(e => e.CODE === code && e.STATUS === 'ACTIVE')
            .sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!entries.length) return '<div class="text-xs text-gray-400 text-center py-4">No transactions for this account.</div>';
        return `<div class="text-xs mt-1">
            <div class="font-semibold text-gray-600 mb-2">Recent Transactions</div>
            <div class="space-y-1 max-h-64 overflow-y-auto">
                ${entries.slice(0, 25).map(e => {
                    const amt = (+e.DEBIT||0) - (+e.CREDIT||0);
                    const dirLabel = amt >= 0 ? 'Dr' : 'Cr';
                    const absAmt = Math.abs(amt);
                    return `<div class="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                        <div>
                            <span class="${amt >= 0 ? 'text-red-600' : 'text-green-600'} font-medium">${dirLabel} ₹${absAmt.toFixed(2)}</span>
                            <span class="text-gray-400 ml-2">${e.ENTRY_DATE ? _fmt(e.ENTRY_DATE, 'date') : ''}</span>
                        </div>
                        <span class="text-gray-500 text-xs">${e.NARRATION ? (e.NARRATION.length > 30 ? e.NARRATION.slice(0, 30) + '…' : e.NARRATION) : e.ENTRY_TYPE || ''}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    function _copyToClipboard(text, label) {
        navigator.clipboard?.writeText(text).then(() => {
            const toast = document.getElementById('vaultToast') || (() => {
                const t = document.createElement('div');
                t.id = 'vaultToast';
                t.className = 'fixed bottom-4 right-4 bg-green-700 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50 transition-opacity duration-300';
                document.body.appendChild(t);
                return t;
            })();
            toast.textContent = `✅ ${label} copied!`;
            toast.classList.remove('opacity-0');
            setTimeout(() => toast.classList.add('opacity-0'), 2000);
        }).catch(() => {});
    }

    function _renderBankAccountDetail(acct) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const balClass = acct.balance >= 0 ? 'text-green-600' : 'text-red-600';
        const upiLink = acct.upi ? `upi://pay?pa=${encodeURIComponent(acct.upi)}${acct.upiName ? '&pn=' + encodeURIComponent(acct.upiName) : ''}` : '';
        const qrUrl = upiLink ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}` : '';

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h3 class="font-semibold text-gray-700">🏛️ ${acct.bank}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full ${acct.type === 'Branch' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">${acct.type}</span>
                    </div>
                    <span class="font-semibold ${balClass} text-lg">₹${acct.balance.toFixed(2)}</span>
                </div>
                <div class="detail-card-body">
                    <!-- Entity info -->
                    <div class="grid grid-cols-1 gap-3 text-sm mb-4 bg-gray-50 p-3 rounded-lg">
                        <div><span class="text-gray-500">Entity:</span> <span class="font-semibold">${acct.name}</span></div>
                        <div><span class="text-gray-500">Code:</span> <span class="font-mono text-xs">${acct.code}</span></div>
                    </div>

                    <!-- Bank Details with Copy buttons -->
                    <div class="grid grid-cols-1 gap-3 mb-4">
                        <div class="bg-white border rounded-lg p-3">
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="text-xs text-gray-500 mb-1">Account Number</div>
                                    <div class="font-mono text-sm font-semibold">${acct.account || 'N/A'}</div>
                                </div>
                                ${acct.account ? `<button onclick="VaultAccounts._copyToClipboard('${acct.account.replace(/'/g, "\\'")}', 'A/C No')" class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">📋 Copy</button>` : ''}
                            </div>
                        </div>
                        <div class="bg-white border rounded-lg p-3">
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="text-xs text-gray-500 mb-1">IFSC Code</div>
                                    <div class="font-mono text-sm font-semibold">${acct.ifsc || 'N/A'}</div>
                                </div>
                                ${acct.ifsc ? `<button onclick="VaultAccounts._copyToClipboard('${acct.ifsc.replace(/'/g, "\\'")}', 'IFSC')" class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">📋 Copy</button>` : ''}
                            </div>
                        </div>
                        ${acct.upi ? `<div class="bg-white border rounded-lg p-3">
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="text-xs text-gray-500 mb-1">UPI ID</div>
                                    <div class="font-mono text-sm font-semibold">${acct.upi}</div>
                                    ${acct.upiName ? `<div class="text-xs text-gray-400 mt-1">${acct.upiName}</div>` : ''}
                                </div>
                                <button onclick="VaultAccounts._copyToClipboard('${acct.upi.replace(/'/g, "\\'")}', 'UPI ID')" class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">📋 Copy</button>
                            </div>
                            ${qrUrl ? `<div class="mt-3 flex justify-center"><img src="${qrUrl}" alt="UPI QR" class="w-32 h-32 border rounded-lg" crossorigin="anonymous" onerror="this.style.display='none'"></div>` : ''}
                            ${qrUrl ? `<div class="text-center mt-2"><a href="${upiLink}" target="_blank" class="text-xs text-blue-600 underline">Open in UPI app</a></div>` : ''}
                        </div>` : ''}
                    </div>

                    <!-- Balance & Summary -->
                    <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3 mb-4">
                        <div><span class="text-gray-500">Ledger Balance:</span> <span class="font-semibold ${balClass}">₹${acct.balance.toFixed(2)}</span></div>
                        <div><span class="text-gray-500">Bank:</span> ${acct.bank}</div>
                    </div>

                    <!-- Statement -->
                    ${_renderBankAccountStatement(acct.code, acct.name)}
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function _renderBankAccounts() {
        _injectListPane('Search bank, entity, account…');
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        const allAccounts = _getBankAccounts();
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? allAccounts.filter(a =>
                (a.bank || '').toLowerCase().includes(q) ||
                (a.name || '').toLowerCase().includes(q) ||
                (a.code || '').toLowerCase().includes(q) ||
                (a.account || '').toLowerCase().includes(q) ||
                (a.ifsc || '').toLowerCase().includes(q) ||
                (a.upi || '').toLowerCase().includes(q)
              )
            : allAccounts;
        const total = allAccounts.length;
        const totalBalance = allAccounts.reduce((s, a) => s + a.balance, 0);

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">${q ? 'No matching accounts.' : 'No bank accounts found.'}</li>`;
            return;
        }

        // Summary bar
        document.getElementById('vaultListMsg').innerHTML = `<div class="flex items-center justify-between text-xs text-gray-500 px-1 mb-2">
            <span>${total} accounts · ₹${totalBalance.toFixed(2)} total</span>
            <span class="text-gray-400">${filtered.length} shown</span>
        </div>`;

        ul.innerHTML = filtered.map(a => {
            const balClass = a.balance >= 0 ? 'text-green-600' : 'text-red-600';
            return `<li data-code="${a.code}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <div>
                        <strong class="text-gray-800 block text-sm">${a.bank || 'N/A'}</strong>
                        <span class="text-xs text-gray-500">${a.name} · ${a.type}</span>
                    </div>
                    <span class="font-semibold ${balClass} text-sm">₹${a.balance.toFixed(2)}</span>
                </div>
                <div class="flex gap-2 text-xs mt-1">
                    ${a.account ? `<span class="font-mono text-gray-400">${a.account}</span>` : ''}
                    ${a.ifsc ? `<span class="font-mono text-gray-400">${a.ifsc}</span>` : ''}
                    ${a.upi ? `<span class="text-gray-400">UPI ✓</span>` : ''}
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                const acct = allAccounts.find(a => a.code === li.dataset.code);
                if (acct) _renderBankAccountDetail(acct);
            })
        );
        VaultPage.showDetail(false);
    }

    // ========================================================================
    // LOAD & ROUTING
    // ========================================================================

    async function load() {
        const data = await getAppData();
        if (!data) return;

        _allLedger = Object.values(data.LEDGER || {});
        _allBranches = Object.values(data.BRANCHES || {});
        _allCarriers = Object.values(data.CARRIERS || {});
        _b2bMap.clear();
        _b2bList = [];
        if (data.B2B) {
            Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
            _b2bList = Object.values(data.B2B).filter(c => c.CODE);
        }

        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();

        if (_activeTile === 'cheques') {
            _injectListPane('Search cheque number, branch…');
            _injectFilterUI();
            await _fetchCheques();
            _renderList();
        } else if (_activeTile === 'bank-accounts') {
            _injectListPane('Search bank, entity, account…');
            document.getElementById('vaultAddBtn').classList.add('hidden');
            _renderBankAccounts();
        }
    }

    function search() {
        if (_activeTile === 'cheques') _renderList();
        else if (_activeTile === 'bank-accounts') _renderBankAccounts();
    }

    function setTile(tile) { _activeTile = tile; }

    return { load, search, setTile, _printCheque, _copyToClipboard, _updateChequeStatus };
})();

window.VaultAccounts = VaultAccounts;
