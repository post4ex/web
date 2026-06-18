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

    function _renderList(quotes) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        if (!quotes || !quotes.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No quotations found.</li>';
            return;
        }
        ul.innerHTML = quotes.map(q => {
            const total = q.totalAmount != null ? _fmtAmt(q.totalAmount) : '—';
            const customer = q.customer || q.Customer || '—';
            const ref = q.reference || q.Reference || '—';
            const date = _fmtDate(q.date || q.Date);
            return `<li data-key="${q.key}" class="p-3 rounded-lg cursor-pointer hover:bg-cyan-50 border border-gray-200 transition-colors">
                <strong class="text-cyan-700 block text-sm">📋 ${ref} — ${customer}</strong>
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
        const lq = q.toLowerCase();
        const filtered = _allQuotes.filter(x =>
            (x.reference || '').toLowerCase().includes(lq) ||
            (x.customer || '').toLowerCase().includes(lq) ||
            (x.description || '').toLowerCase().includes(lq)
        );
        _renderList(filtered);
    }

    // ── Detail view ───────────────────────────────────────────────────────────

    async function _fetchAndRenderDetail(key) {
        const view = document.getElementById('vaultDetailView');
        VaultPage.showDetail(true);
        view.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Loading…</p>';
        VaultPage.showDetailPane();
        try {
            const code = _getCode();
            const data = await callApi(`/api/manager/quotes/${key}?code=${encodeURIComponent(code)}`, {}, 'GET');
            _renderDetail(key, data);
        } catch (err) {
            view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-red-500">Failed to load: ${err.message || err}</div></div>`;
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

        // Build lines table
        const lines = data.Lines || data.lines || [];
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

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">📋 Quotation — ${ref}</h3>
                    <div class="flex gap-2 items-center">
                        <button onclick="VaultQuotations._handleDelete('${key}')"
                            class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg> Delete
                        </button>
                    </div>
                </div>
                <div class="detail-card-body space-y-4">
                    <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-3 rounded-lg">
                        <div><span class="text-gray-500">Customer:</span> <span class="font-semibold">${customer}</span></div>
                        <div><span class="text-gray-500">Date:</span> ${date}</div>
                        <div><span class="text-gray-500">Reference:</span> ${ref}</div>
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
                        </table>
                    </div>` : ''}
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    async function _handleDelete(key) {
        if (!confirm('Delete this quotation from Manager.io? This cannot be undone.')) return;
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
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    const _b2bMap = new Map();

    function _titleCase(str) {
        return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
    function _parseTaxRate(tcName) {
        const m = (tcName || '').match(/(\d+(\.\d+)?)\s*%?/);
        return m ? parseFloat(m[1]) : 18;
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

        if (!window.__vaultCacheKeys) {
            try {
                window.__vaultCacheKeys = await callApi('/api/manager/cache/keys', {}, 'GET');
            } catch (err) {
                console.error("Failed to pre-fetch cache keys in quotations load:", err);
            }
        }

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
            _renderList(_allQuotes);
        } catch (err) {
            document.getElementById('vaultListMsg').textContent = 'Failed to load: ' + (err.message || err);
        }
    }

    return { load, search, openAddPane, _handleDelete, _recalc };
})();

window.VaultQuotations = VaultQuotations;
