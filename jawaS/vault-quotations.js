// ============================================================================
// VAULT-QUOTATIONS.JS — Sales Quotations via Manager.io
// Tile: quotations
// API:  GET  /api/manager/quotes?code=XXX      — list all quotes
//       POST /api/manager/quotes?code=XXX      — create quote
//       GET  /api/manager/quotes/:key?code=XXX — fetch single quote
//       DELETE /api/manager/quotes/:key?code=XXX — delete quote
// ============================================================================

const VaultQuotations = (() => {

    let _allQuotes = [];
    let _clientCode = null;

    // ── Filter state ──────────────────────────────────────────────────────────
    let _filterStart = '';
    let _filterEnd = '';
    let _filterStatus = '';

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _getCode() {
        if (_clientCode) return _clientCode;
        // Try to resolve from app state (same pattern as other vault modules)
        try { _clientCode = window.__vaultCode || localStorage.getItem('vault_code') || ''; } catch (_) {}
        return _clientCode || '';
    }

    function _fmtDate(str) {
        if (!str) return '—';
        // Manager.io returns dates as YYYY-MM-DD strings
        const d = new Date(str + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function _fmtAmt(v) {
        return '₹' + (parseFloat(v) || 0).toFixed(2);
    }

    // ── List rendering ────────────────────────────────────────────────────────

    function _getFilteredQuotes() {
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        return _allQuotes.filter(x => {
            // Text search
            if (q) {
                const matchText = (x.reference || '').toLowerCase().includes(q) ||
                    (x.customer || '').toLowerCase().includes(q) ||
                    (x.description || '').toLowerCase().includes(q);
                if (!matchText) return false;
            }
            // Date range
            const d = x.date || x.Date || '';
            if (_filterStart && d < _filterStart) return false;
            if (_filterEnd && d > _filterEnd) return false;
            // Status
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

        // Update count label
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
        // search text is applied in _getFilteredQuotes() via DOM
        _applyFilters();
    }

    function _applyFilters() {
        const filtered = _getFilteredQuotes();
        _renderList(filtered);
    }

    // ── Detail view ───────────────────────────────────────────────────────────

    async function _fetchAndRenderDetail(key) {
        const view = document.getElementById('vaultDetailView');
        VaultPage.showDetail(true);
        view.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Loading…</p>';
        VaultPage.showDetailPane();
        window.setLoading?.(true, 'Fetching quotation...', 'detail');
        try {
            const code = _getCode();
            const data = await callApi(`/api/manager/quotes/${key}?code=${encodeURIComponent(code)}`, {}, 'GET');
            _renderDetail(key, data);
        } catch (err) {
            view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-red-500">Failed to load: ${err.message || err}</div></div>`;
        } finally {
            window.setLoading?.(false);
        }
    }

    function _renderDetail(key, data) {
        const view = document.getElementById('vaultDetailView');
        VaultPage.showDetail(true);

        // Manager.io returns the form fields directly
        const ref       = data.Reference || data.reference || '—';
        const customer  = data.Customer  || data.customer  || '—';
        const date      = _fmtDate(data.Date || data.date);
        const desc      = data.Description || data.description || '';

        // Compute total from lines
        const lines = data.Lines || data.lines || [];
        const grandTotal = lines.reduce((sum, ln) => {
            const qty = ln.Qty || ln.qty || 1;
            const unit = ln.SalesUnitPrice || ln.salesUnitPrice || 0;
            return sum + (qty * unit);
        }, 0);

        // Build lines table
        const lineRows = lines.map((ln, i) => {
            const desc = ln.LineDescription || ln.lineDescription || '';
            const qty  = ln.Qty || ln.qty || 1;
            const unit = ln.SalesUnitPrice || ln.salesUnitPrice || 0;
            const amt  = qty * unit;
            return `<tr class="border-t border-gray-100">
                <td class="py-1.5 px-2 text-xs text-gray-500">${i + 1}</td>
                <td class="py-1.5 px-2 text-sm">${desc}</td>
                <td class="py-1.5 px-2 text-sm text-right">${qty}</td>
                <td class="py-1.5 px-2 text-sm text-right">${_fmtAmt(unit)}</td>
                <td class="py-1.5 px-2 text-sm text-right font-medium">${_fmtAmt(amt)}</td>
            </tr>`;
        }).join('');

        const code = _getCode();
        const status = data.Status || data.status || '';
        const statusHtml = status ? `<span class="inline-block px-2 py-0.5 text-[11px] font-semibold rounded-full bg-blue-100 text-blue-700">${status}</span>` : '';

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">📋 Quotation — ${ref} ${statusHtml}</h3>
                    <div class="flex gap-1.5 items-center flex-wrap justify-end">
                        <button onclick="VaultQuotations._handleConvertToInvoice('${key}', event)"
                            class="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                            </svg> Invoice
                        </button>
                        <button onclick="VaultQuotations._handlePrint('${key}')"
                            class="px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                            </svg> Print
                        </button>
                        <button onclick="VaultQuotations._handleEdit('${key}')"
                            class="px-3 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded hover:bg-amber-200 flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg> Edit
                        </button>
                        <button onclick="VaultQuotations._handleDelete('${key}')"
                            class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="detail-card-body space-y-4">
                    <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-3 rounded-lg">
                        <div><span class="text-gray-500">Customer:</span> <span class="font-semibold">${customer}</span></div>
                        <div><span class="text-gray-500">Date:</span> ${date}</div>
                        <div><span class="text-gray-500">Reference:</span> ${ref}</div>
                        <div><span class="text-gray-500">Total:</span> <span class="font-semibold text-indigo-700">${_fmtAmt(grandTotal)}</span></div>
                    </div>
                    ${desc ? `<div class="text-sm text-gray-700 bg-white border rounded-lg p-3">📝 ${desc}</div>` : ''}
                    ${lineRows ? `<div class="border rounded-lg overflow-hidden">
                        <table class="w-full text-left">
                            <thead class="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th class="py-2 px-2">#</th>
                                    <th class="py-2 px-2">Description</th>
                                    <th class="py-2 px-2 text-right">Qty</th>
                                    <th class="py-2 px-2 text-right">Unit Price</th>
                                    <th class="py-2 px-2 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>${lineRows}</tbody>
                            <tfoot>
                                <tr class="bg-gray-50 font-bold">
                                    <td colspan="4" class="py-2 px-2 text-right text-sm">Grand Total</td>
                                    <td class="py-2 px-2 text-right text-sm text-indigo-700">${_fmtAmt(grandTotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>` : ''}
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    async function _handleDelete(key) {
        if (!confirm('Delete this quotation from Manager.io? This cannot be undone.')) return;
        window.setLoading?.(true, 'Deleting quotation...', 'detail');
        try {
            const code = _getCode();
            await callApi(`/api/manager/quotes/${key}?code=${encodeURIComponent(code)}`, null, 'DELETE');
            // Refresh list
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

    const _b2bMap = new Map();

    function _titleCase(str) {
        return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
    function _parseTaxRate(tcName) {
        const m = (tcName || '').match(/(\d+(\.\d+)?)\s*%?/);
        return m ? parseFloat(m[1]) : 18;
    }

    // ── UI Injection (filter btn, status label, modal) ────────────────────────

    function _injectUI() {
        // 1. Filter button next to search
        const listPane = document.getElementById('vaultListPane');
        const header = listPane?.querySelector('.sv-pane-header');
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
            filterBtn.className = 'p-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex-shrink-0 transition-colors';
            filterBtn.title = 'Filter Quotations';
            filterBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>`;
            filterBtn.onclick = () => document.getElementById('quotFilterModal')?.classList.remove('hidden');
            searchRow?.appendChild(filterBtn);
        }

        // 2. Status line above list
        if (!document.getElementById('quotStatus')) {
            const statusEl = document.createElement('p');
            statusEl.id = 'quotStatus';
            statusEl.className = 'text-xs text-gray-500 px-4 pt-2 text-center font-medium';
            statusEl.textContent = 'Loading...';
            const container = document.getElementById('vaultList')?.parentElement;
            container?.insertBefore(statusEl, document.getElementById('vaultList'));
        }

        // 3. Filter modal
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
                        <button id="quotResetBtn" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold transition-colors">Reset</button>
                        <button id="quotApplyBtn" class="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold transition-colors">Apply Filters</button>
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
                document.getElementById('quotFilterStart').value = '';
                document.getElementById('quotFilterEnd').value = '';
                document.getElementById('quotFilterStatus').value = '';
                _filterStart = '';
                _filterEnd = '';
                _filterStatus = '';
                _applyFilters();
            };
        }
    }

    // ── Edit ──────────────────────────────────────────────────────────────────

    async function _handleEdit(key) {
        // Fetch the full quote data first, then open the form pre-filled
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

        // Build B2B map
        if (appData?.B2B) Object.values(appData.B2B).forEach(c => {
            if (c.CODE) _b2bMap.set(c.CODE.trim().toUpperCase(), c);
        });

        // Extract existing values
        const existingRef = data.Reference || data.reference || '';
        const existingCustomer = data.Customer || data.customer || '';  // B2B code or UUID
        const existingDate = data.Date || data.date || '';
        const existingDesc = data.Description || data.description || '';
        const existingLines = data.Lines || data.lines || [];
        const existingValidDays = data.ValidDays || data.validDays || 30;

        // Determine branch from existing customer
        let branchCode = '';
        const b2b = _b2bMap.get(existingCustomer.toUpperCase());
        if (b2b) {
            branchCode = (b2b.BRANCH || '').toLowerCase();
        } else {
            // Fallback: try to find branch via client resolution
            const ab = VaultPage.getActiveBranch();
            if (ab) branchCode = ab.toLowerCase();
        }

        let currentOpts = _getBranchDropdowns(branchCode);

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

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">✏️ Edit Quotation — ${existingRef || key}</h3></div>
                <div class="detail-card-body space-y-4">
                    <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                        ⚠️ Editing will update this quotation in Manager.io. Reference number will be preserved.
                    </p>
                    <form id="quotEditForm" class="space-y-4">
                        <input type="hidden" name="quote_key" value="${key}">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                <input name="code" id="quotEditCode" required class="form-input text-sm uppercase"
                                    value="${existingCustomer}" list="quotEditCodeList" autocomplete="off">
                                <datalist id="quotEditCodeList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                <input name="branch" id="quotEditBranch" readonly
                                    class="form-input text-sm uppercase bg-gray-50 text-gray-500" placeholder="Auto">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">POS State</label>
                                <input name="pos" id="quotEditPos" readonly
                                    class="form-input text-sm bg-gray-50 text-gray-500" placeholder="Auto">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                <input name="date" type="date" required class="form-input text-sm" value="${existingDate}">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Valid For (Days)</label>
                                <input name="valid_days" type="number" min="1" value="${existingValidDays}" class="form-input text-sm">
                            </div>
                        </div>

                        <!-- Line Items -->
                        <div class="border rounded-lg overflow-hidden">
                            <div class="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</span>
                                <button type="button" id="quotEditAddLine"
                                    class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">+ Add Line</button>
                            </div>
                            <table class="w-full text-sm" id="quotEditLinesTable">
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
                                <tbody id="quotEditLineRows"></tbody>
                            </table>
                        </div>

                        <!-- Totals -->
                        <div class="border rounded-lg p-3 bg-gray-50 space-y-1.5 text-sm" id="quotEditTotals">
                            <div class="flex justify-between text-gray-600"><span>Subtotal</span><span id="qe_subtotal" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between text-gray-600" id="qe_sgst_row"><span>SGST</span><span id="qe_sgst_val" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between text-gray-600" id="qe_cgst_row"><span>CGST</span><span id="qe_cgst_val" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between text-gray-600 hidden" id="qe_igst_row"><span>IGST</span><span id="qe_igst_val" class="font-medium">₹0.00</span></div>
                            <div class="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-1">
                                <span>Grand Total</span>
                                <span id="qe_grand_total" class="text-indigo-700 text-base">₹0.00</span>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Description / Terms</label>
                            <textarea name="description" class="form-input text-sm" rows="2">${existingDesc}</textarea>
                        </div>

                        <div class="flex justify-between items-center pt-2 border-t">
                            <div id="quotEditResponse" class="hidden text-sm"></div>
                            <button type="submit" id="quotEditSubmitBtn" class="btn btn-sm flex items-center gap-2 ml-auto">
                                <span id="quotEditBtnText">Update Quotation</span>
                                <div id="quotEditSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;

        // Populate client datalist
        const dl = document.getElementById('quotEditCodeList');
        _b2bMap.forEach((rec, code) => {
            const o = document.createElement('option');
            o.value = code;
            o.label = `${code} — ${rec.B2B_NAME || ''}`;
            dl.appendChild(o);
        });

        // Auto-fill branch + POS
        function _applyClientAutofill() {
            const code = document.getElementById('quotEditCode').value.trim().toUpperCase();
            const b2b = _b2bMap.get(code);
            if (!b2b) return;
            const branch = (b2b.BRANCH || '').toUpperCase();
            document.getElementById('quotEditBranch').value = branch;
            document.getElementById('quotEditPos').value = b2b.CODE_STATE || b2b.STATE_CODE || '';
            currentOpts = _getBranchDropdowns(branch);
            document.querySelectorAll('#quotEditLineRows tr').forEach(tr => {
                const itemSel = tr.querySelector('.qe-item');
                const tcSel = tr.querySelector('.qe-tc');
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
        document.getElementById('quotEditCode').addEventListener('input', _applyClientAutofill);
        document.getElementById('quotEditCode').addEventListener('change', _applyClientAutofill);

        // ── Line management ──
        let _lineCount = 0;

        function _addLine(defaultItem = '', defaultDesc = '', defaultQty = 1, defaultPrice = 0, defaultTc = '') {
            const idx = _lineCount++;
            const tr = document.createElement('tr');
            tr.id = `qeLine_${idx}`;
            tr.className = 'border-t border-gray-100';
            tr.innerHTML = `
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs qe-item" style="min-width:140px">${currentOpts.itemOpts}</select>
                </td>
                <td class="py-1.5 px-2">
                    <input type="text" class="form-input text-xs qe-desc" placeholder="Description" style="min-width:120px" value="${_escapeHtml(defaultDesc)}">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs qe-qty text-right" value="${defaultQty}" min="0.001" step="any" style="min-width:55px">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs qe-price text-right" value="${defaultPrice}" min="0" step="0.01" style="min-width:80px">
                </td>
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs qe-tc" style="min-width:120px">${currentOpts.tcOpts}</select>
                </td>
                <td class="py-1.5 px-2 text-right">
                    <span class="qe-amt text-gray-700 font-medium text-xs">₹0.00</span>
                </td>
                <td class="py-1.5 px-2 text-center">
                    <button type="button" class="qe-remove text-red-400 hover:text-red-600 text-lg leading-none" title="Remove line">×</button>
                </td>`;
            document.getElementById('quotEditLineRows').appendChild(tr);

            if (defaultItem) tr.querySelector('.qe-item').value = defaultItem;
            if (defaultTc) tr.querySelector('.qe-tc').value = defaultTc;

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
                const qty = parseFloat(tr.querySelector('.qe-qty')?.value || 0);
                const price = parseFloat(tr.querySelector('.qe-price')?.value || 0);
                const tc = (tr.querySelector('.qe-tc')?.value || '').toUpperCase();
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
            document.getElementById('qe_subtotal').textContent = '₹' + subtotal.toFixed(2);
            document.getElementById('qe_sgst_val').textContent = '₹' + sgst.toFixed(2);
            document.getElementById('qe_cgst_val').textContent = '₹' + cgst.toFixed(2);
            document.getElementById('qe_igst_val').textContent = '₹' + igst.toFixed(2);
            document.getElementById('qe_grand_total').textContent = '₹' + grandTotal.toFixed(2);
            document.getElementById('qe_sgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
            document.getElementById('qe_cgst_row').classList.toggle('hidden', sgst === 0 && cgst === 0);
            document.getElementById('qe_igst_row').classList.toggle('hidden', igst === 0);
        }

        // Populate existing lines
        if (existingLines.length) {
            existingLines.forEach(ln => {
                const itemName = ln.Item || '';  // Could be UUID or name — the cache should resolve
                const desc = ln.LineDescription || ln.lineDescription || '';
                const qty = ln.Qty || ln.qty || 1;
                const price = ln.SalesUnitPrice || ln.salesUnitPrice || 0;
                const tc = ln.TaxCode || ln.taxCode || '';
                _addLine(itemName, desc, qty, price, tc);
            });
        } else {
            _addLine();
        }

        document.getElementById('quotEditAddLine').addEventListener('click', () => _addLine());

        // Trigger auto-fill for the existing customer
        _applyClientAutofill();

        // ── Submit ──
        document.getElementById('quotEditForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const raw = Object.fromEntries(fd);
            const btn = document.getElementById('quotEditSubmitBtn');
            const sp = document.getElementById('quotEditSpinner');
            const resp = document.getElementById('quotEditResponse');
            btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';
            window.setLoading?.(true, 'Updating quotation...', 'detail');

            try {
                const clientCode = raw.code.trim().toUpperCase();
                const lines = [];
                document.querySelectorAll('#quotEditLineRows tr').forEach(tr => {
                    const item = tr.querySelector('.qe-item')?.value || '';
                    const desc = tr.querySelector('.qe-desc')?.value || '';
                    const qty = parseFloat(tr.querySelector('.qe-qty')?.value || 1);
                    const price = parseFloat(tr.querySelector('.qe-price')?.value || 0);
                    const tc = tr.querySelector('.qe-tc')?.value || '';
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
                    IssueDate: raw.date,
                    Customer: clientCode,
                    Description: raw.description || undefined,
                    Lines: lines,
                    ValidDays: parseInt(raw.valid_days) || 30,
                    TaxCodeEnabled: true,
                };

                const url = `/api/manager/quotes/${raw.quote_key}?code=${encodeURIComponent(clientCode)}`;
                await callApi(url, payload, 'PUT');
                resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                resp.textContent = `✅ Quotation updated in Manager.io!`;
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

    // ── Print ─────────────────────────────────────────────────────────────────

    async function _handlePrint(key) {
        window.setLoading?.(true, 'Preparing print...', 'detail');
        try {
            const code = _getCode();
            const data = await callApi(`/api/manager/quotes/${key}?code=${encodeURIComponent(code)}`, {}, 'GET');
            _printQuote(data);
        } catch (err) {
            alert('Failed to load quote for printing: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    function _printQuote(data) {
        const ref = data.Reference || data.reference || 'N/A';
        const customer = data.Customer || data.customer || 'N/A';
        const date = data.Date || data.date || '';
        const desc = data.Description || data.description || '';
        const validDays = data.ValidDays || data.validDays || 30;
        const lines = data.Lines || data.lines || [];

        const rows = lines.map((ln, i) => {
            const d = ln.LineDescription || ln.lineDescription || '';
            const q = ln.Qty || ln.qty || 1;
            const u = ln.SalesUnitPrice || ln.salesUnitPrice || 0;
            const a = (q * u).toFixed(2);
            return `<tr><td>${i + 1}</td><td>${_escapeHtml(d)}</td><td class="tr">${q}</td><td class="tr">₹${u.toFixed(2)}</td><td class="tr">₹${a}</td></tr>`;
        }).join('');

        const total = lines.reduce((s, ln) => {
            const q = ln.Qty || ln.qty || 1;
            const u = ln.SalesUnitPrice || ln.salesUnitPrice || 0;
            return s + (q * u);
        }, 0);

        const css = `
            body{font-family:Arial,sans-serif;font-size:13px;color:#000;margin:0;padding:20px;background:#f5f5f5}
            .box{max-width:800px;margin:auto;background:#fff;padding:30px;border:1px solid #eee;box-shadow:0 0 10px rgba(0,0,0,.15)}
            .hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:15px;margin-bottom:20px}
            .tr{text-align:right}.tc{text-align:center}
            table{width:100%;border-collapse:collapse;margin-bottom:20px}table,th,td{border:1px solid #000}th,td{padding:6px;text-align:left}th{background:#f2f2f2}
            .info{display:flex;justify-content:space-between;margin-bottom:20px}
            .terms{font-size:11px;margin-top:20px}
            .total-row{font-weight:bold;background:#f9f9f9}
            @media print{@page{size:A4;margin:10mm}body{background:#fff;padding:0}.box{box-shadow:none;border:none}}
        `;

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Quotation ${ref}</title><style>${css}</style></head><body>
            <div class="box">
                <div class="hdr">
                    <img src="assets/images/genie-logo.svg" style="width:200px;height:auto" onerror="this.style.display='none'">
                    <div style="text-align:right">
                        <h1 style="margin:0;font-size:26px;text-transform:uppercase">Quotation</h1>
                        <p><b>Quote #:</b> ${ref}</p>
                        <p><b>Date:</b> ${date}</p>
                        <p><b>Valid:</b> ${validDays} days</p>
                    </div>
                </div>
                <div class="info">
                    <div><h3>Customer</h3><p>${_escapeHtml(customer)}</p></div>
                </div>
                ${desc ? `<p><b>Description:</b> ${_escapeHtml(desc)}</p>` : ''}
                <table>
                    <thead><tr><th class="tc">#</th><th>Description</th><th class="tr">Qty</th><th class="tr">Unit Price</th><th class="tr">Amount</th></tr></thead>
                    <tbody>${rows}</tbody>
                    <tfoot><tr class="total-row"><td colspan="4" class="tr">Grand Total</td><td class="tr">₹${total.toFixed(2)}</td></tr></tfoot>
                </table>
                <div class="terms"><b>Terms:</b> This quotation is valid for ${validDays} days from the date of issue. Prices are in Indian Rupees (₹).</div>
            </div>
            <script>window.onload=()=>window.print();<\/script></body></html>`;

        const w = window.open('', `Quote-${ref}`);
        w.document.write(html);
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

    // ── Helper: escape HTML for print template ────────────────────────────────

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _recalc() {}

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
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📋 New Quotation</h3></div>
                <div class="detail-card-body space-y-4">
                    <form id="quotForm" class="space-y-4">

                        <!-- Header: Client + Branch + POS + Date -->
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div class="sm:col-span-2">
                                <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                <input name="code" id="quotCode" required class="form-input text-sm uppercase"
                                    placeholder="e.g. AGWL" list="quotCodeList" autocomplete="off">
                                <datalist id="quotCodeList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                <input name="branch" id="quotBranch" readonly
                                    class="form-input text-sm uppercase bg-gray-50 text-gray-500" placeholder="Auto">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">POS State</label>
                                <input name="pos" id="quotPos" readonly
                                    class="form-input text-sm bg-gray-50 text-gray-500" placeholder="Auto">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Quotation Date *</label>
                                <input name="date" id="quotDate" type="date" required class="form-input text-sm">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Valid For (Days)</label>
                                <input name="valid_days" type="number" min="1" value="30" class="form-input text-sm">
                            </div>
                        </div>

                        <!-- Line Items -->
                        <div class="border rounded-lg overflow-hidden">
                            <div class="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</span>
                                <button type="button" id="quotAddLine"
                                    class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                    + Add Line
                                </button>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="w-full text-sm" id="quotLinesTable">
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
                                    <tbody id="quotLineRows"></tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Totals -->
                        <div class="border rounded-lg p-3 bg-gray-50 space-y-1.5 text-sm" id="quotTotals">
                            <div class="flex justify-between text-gray-600">
                                <span>Subtotal</span>
                                <span id="quot_subtotal" class="font-medium">₹0.00</span>
                            </div>
                            <div class="flex justify-between text-gray-600" id="quot_sgst_row">
                                <span>SGST</span><span id="quot_sgst_val" class="font-medium">₹0.00</span>
                            </div>
                            <div class="flex justify-between text-gray-600" id="quot_cgst_row">
                                <span>CGST</span><span id="quot_cgst_val" class="font-medium">₹0.00</span>
                            </div>
                            <div class="flex justify-between text-gray-600 hidden" id="quot_igst_row">
                                <span>IGST</span><span id="quot_igst_val" class="font-medium">₹0.00</span>
                            </div>
                            <div class="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-1">
                                <span>Grand Total</span>
                                <span id="quot_grand_total" class="text-indigo-700 text-base">₹0.00</span>
                            </div>
                        </div>

                        <!-- Description / Terms -->
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Description / Terms</label>
                            <textarea name="description" class="form-input text-sm" rows="2" placeholder="Services, conditions, delivery terms…"></textarea>
                        </div>

                        <!-- Submit -->
                        <div class="flex justify-between items-center pt-2 border-t">
                            <div id="quotResponse" class="hidden text-sm"></div>
                            <button type="submit" id="quotSubmitBtn" class="btn btn-sm flex items-center gap-2 ml-auto">
                                <span id="quotBtnText">Save Quotation</span>
                                <div id="quotSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;

        // Populate client datalist from B2B map
        const dl = document.getElementById('quotCodeList');
        _b2bMap.forEach((rec, code) => {
            const o = document.createElement('option');
            o.value = code;
            o.label = `${code} — ${rec.B2B_NAME || ''}`;
            dl.appendChild(o);
        });

        // Auto-fill branch + POS from B2B and update dropdown options based on branch
        function _applyClientAutofill() {
            const code = document.getElementById('quotCode').value.trim().toUpperCase();
            const b2b  = _b2bMap.get(code);
            if (!b2b) return;
            const branch = (b2b.BRANCH || '').toUpperCase();
            document.getElementById('quotBranch').value = branch;
            document.getElementById('quotPos').value    = b2b.CODE_STATE || b2b.STATE_CODE || '';

            // Update line item dropdown options dynamically for the branch
            currentOpts = _getBranchDropdowns(branch);
            document.querySelectorAll('#quotLineRows tr').forEach(tr => {
                const itemSel = tr.querySelector('.quot-item');
                const tcSel = tr.querySelector('.quot-tc');
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
        const quotCodeEl = document.getElementById('quotCode');
        quotCodeEl.addEventListener('input',  _applyClientAutofill);
        quotCodeEl.addEventListener('change', _applyClientAutofill);

        // Default date = today
        document.getElementById('quotDate').value = new Date().toISOString().split('T')[0];

        // ── Line management ────────────────────────────────────────────────────
        let _lineCount = 0;

        function _addLine(defaultItem = '', defaultTc = '') {
            const idx = _lineCount++;
            const tr  = document.createElement('tr');
            tr.id     = `quotLine_${idx}`;
            tr.className = 'border-t border-gray-100';
            tr.innerHTML = `
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs quot-item" data-idx="${idx}" style="min-width:140px">
                        ${currentOpts.itemOpts}
                    </select>
                </td>
                <td class="py-1.5 px-2">
                    <input type="text" class="form-input text-xs quot-desc" placeholder="Description" style="min-width:120px">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs quot-qty text-right" value="1" min="0.001" step="any" style="min-width:55px">
                </td>
                <td class="py-1.5 px-2">
                    <input type="number" class="form-input text-xs quot-price text-right" value="" min="0" step="0.01" placeholder="0.00" style="min-width:80px">
                </td>
                <td class="py-1.5 px-2">
                    <select class="form-input text-xs quot-tc" style="min-width:120px">
                        ${currentOpts.tcOpts}
                    </select>
                </td>
                <td class="py-1.5 px-2 text-right">
                    <span class="quot-amt text-gray-700 font-medium text-xs">₹0.00</span>
                </td>
                <td class="py-1.5 px-2 text-center">
                    <button type="button" class="quot-remove text-red-400 hover:text-red-600 text-lg leading-none" title="Remove line">×</button>
                </td>`;
            document.getElementById('quotLineRows').appendChild(tr);

            // Pre-select defaults if provided
            if (defaultItem) tr.querySelector('.quot-item').value = defaultItem;
            if (defaultTc)   tr.querySelector('.quot-tc').value   = defaultTc;

            // When item changes, auto-fill description from item name
            tr.querySelector('.quot-item').addEventListener('change', function() {
                const descEl = tr.querySelector('.quot-desc');
                if (!descEl.value) descEl.value = _titleCase(this.value);
                _calcTotals();
            });

            // Live recalc on any change
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

                // Detect tax type from tax code name
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

        // Add initial line
        _addLine();
        document.getElementById('quotAddLine').addEventListener('click', () => _addLine());

        // ── Submit ────────────────────────────────────────────────────────────
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
                const clientCode = raw.code.trim().toUpperCase();

                // Build lines from table rows
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
                    IssueDate:               raw.date,
                    Customer:                clientCode,
                    Description:             raw.description || undefined,
                    Lines:                   lines,
                    ValidDays:               parseInt(raw.valid_days) || 30,
                    TaxCodeEnabled:          true,
                };

                const url = `/api/manager/quotes?code=${encodeURIComponent(clientCode)}`;
                await callApi(url, payload, 'POST');
                resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                resp.textContent = `✅ Quotation saved to Manager.io!`;
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

        // Inject UI controls
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
            // Resolve client code for selected branch
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
