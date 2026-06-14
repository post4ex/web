// ============================================================================
// VAULT-SALES-INVOICES.JS — Sales Invoices from LEDGER collection
// Tile: sales-invoices
// Data source: appData.LEDGER (filtered by ENTRY_TYPE === 'INVOICE', DIRECTION === 'OUTWARD')
// ============================================================================

const VaultSalesInvoices = (() => {

    let _allLedger = [];
    let _b2bMap    = new Map();

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, client, invoice no…';
    }

    function _getInvoices() {
        return _allLedger.filter(e =>
            (e.ENTRY_TYPE || '').toUpperCase() === 'INVOICE' &&
            (e.DIRECTION || '').toUpperCase() === 'OUTWARD'
        );
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const invoices = _getInvoices();
        // Apply search filter
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? invoices.filter(e =>
                (e.CODE || '').toLowerCase().includes(q) ||
                (e.CLIENT_NAME || '').toLowerCase().includes(q) ||
                (e.INV_NUMBER || '').toLowerCase().includes(q) ||
                (e.INVOICE_ID || '').toLowerCase().includes(q) ||
                (e.NARRATION || '').toLowerCase().includes(q)
              )
            : invoices;
        filtered.sort((a, b) => (b.ENTRY_DATE || 0) - (a.ENTRY_DATE || 0));

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No sales invoices found.</li>`;
            return;
        }
        ul.innerHTML = filtered.map(e => {
            const statusColor = e.STATUS === 'ACTIVE' ? 'text-green-700' :
                                e.STATUS === 'PENDING' ? 'text-yellow-700' :
                                e.STATUS === 'VOID' ? 'text-red-700' : 'text-gray-700';
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <strong class="text-indigo-700 block text-sm">${e.INV_NUMBER || 'N/A'} — ${e.CLIENT_NAME || e.CODE || 'N/A'}</strong>
                <span class="text-xs text-gray-500">₹${(+e.DEBIT||0).toFixed(2)} · ${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''}</span>
                <div class="text-xs mt-1">
                    <span class="${statusColor} font-medium">${e.STATUS || ''}</span>
                    <span class="text-gray-400"> · Balance: ₹${(+e.BALANCE||0).toFixed(2)}</span>
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(_allLedger.find(e => e.ENTRY_ID === li.dataset.entry));
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

    // ── Delete (void) ─────────────────────────────────────────────────────────
    async function _handleDelete(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry) return;
        if (!confirm(`Delete invoice ${entry.INV_NUMBER || entry.INVOICE_ID || ''}?\n\nThis will void the entry and recalculate balances.`)) return;
        const reason = prompt('Reason for deletion (optional):', '') || '';
        try {
            await callApi('/api/ledger/void', { entry_id: entry.ENTRY_ID, void_reason: reason }, 'POST');
            const appData = await getAppData();
            if (appData?.LEDGER) {
                _allLedger = Object.values(appData.LEDGER);
                _renderList();
            }
            document.getElementById('vaultDetailView').innerHTML = `
                <div class="detail-card"><div class="detail-card-body text-center py-8">
                    <div class="text-4xl mb-3">🗑️</div>
                    <p class="text-gray-500 text-sm">Invoice has been deleted (voided).</p>
                </div></div>`;
        } catch (err) {
            alert('Failed to delete: ' + (err.message || err));
        }
    }

    function _renderDetailById(entryId) {
        _renderDetail(_allLedger.find(e => e.ENTRY_ID === entryId));
    }

    // ── Edit (void old → create new) ──────────────────────────────────────────
    function _openEditForm(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const entryDate = entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE, 'input') : new Date().toISOString().split('T')[0];
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">✏️ Edit Invoice — ${entry.INV_NUMBER || 'N/A'}</h3></div>
                <div class="detail-card-body">
                    <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
                        ⚠️ Editing will void the current invoice and create a replacement.
                    </p>
                    <form id="siEditForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                            <input name="code" id="siEditCode" required class="form-input text-sm uppercase" value="${entry.CODE || ''}" list="siEditCodeList" autocomplete="off">
                            <datalist id="siEditCodeList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                            <input name="branch" id="siEditBranch" class="form-input text-sm uppercase" value="${entry.BRANCH || ''}" list="siEditBranchList">
                            <datalist id="siEditBranchList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Number</label>
                            <input name="inv_number" class="form-input text-sm" value="${entry.INV_NUMBER || ''}" placeholder="Auto-generate if blank">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Date *</label>
                            <input name="inv_date" type="date" required class="form-input text-sm" value="${entryDate}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" value="${(+entry.DEBIT||0).toFixed(2)}" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">POS (State Code)</label>
                            <input name="pos" id="siEditPos" class="form-input text-sm" value="${entry.POS || ''}" maxlength="2">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration</label>
                            <input name="narration" class="form-input text-sm" value="${entry.NARRATION || ''}" placeholder="Invoice description">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t gap-2">
                            <button type="button" onclick="VaultSalesInvoices._renderDetailById('${entry.ENTRY_ID}')" class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="siEditBtnText">Save Changes</span>
                                <div id="siEditSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="siEditResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate datalists
        getAppData().then(data => {
            const dl = document.getElementById('siEditCodeList');
            if (data?.B2B) Object.values(data.B2B).forEach(c => {
                if (c.CODE) { const o = document.createElement('option'); o.value = c.CODE; o.label = `${c.CODE} - ${c.B2B_NAME || ''}`; dl.appendChild(o); }
            });
            const bdl = document.getElementById('siEditBranchList');
            if (data?.BRANCHES) Object.values(data.BRANCHES).forEach(b => {
                if (b.BRANCH_CODE) { const o = document.createElement('option'); o.value = b.BRANCH_CODE; bdl.appendChild(o); }
            });
        });

        // Auto-fill branch/POS on code change
        document.getElementById('siEditCode').addEventListener('input', function() {
            const code = this.value.trim().toUpperCase();
            const b2b = _b2bMap.get(code);
            if (b2b) {
                const bi = document.getElementById('siEditBranch');
                if (b2b.BRANCH && !bi.value) bi.value = b2b.BRANCH;
                const pi = document.getElementById('siEditPos');
                if (b2b.CODE_STATE && !pi.value) pi.value = b2b.CODE_STATE;
            }
        });

        document.getElementById('siEditForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('siEditSpinner');
            const resp = document.getElementById('siEditResponse');
            btn.disabled = true; sp.classList.remove('hidden');
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;

            try {
                // Step 1: Void the current entry
                await callApi('/api/ledger/void', {
                    entry_id: entry.ENTRY_ID,
                    void_reason: `Replaced by edit`,
                }, 'POST');

                // Step 2: Create new entry
                const res = await callApi('/api/ledger/invoice', {
                    code: data.code,
                    branch: data.branch || '',
                    inv_number: data.inv_number || '',
                    inv_date: toMs(data.inv_date),
                    amount: parseFloat(data.amount),
                    pos: data.pos || '',
                    narration: data.narration || `Invoice ${data.inv_number || ''}`,
                }, 'POST');

                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Updated — old voided, new invoice ${res.inv_number} created. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');

                const appData = await getAppData();
                if (appData?.LEDGER) {
                    _allLedger = Object.values(appData.LEDGER);
                    _renderList();
                }
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed to edit invoice');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });
        VaultPage.showDetailPane();
    }

    // ── Detail pane ───────────────────────────────────────────────────────────
    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const isStandalone = (entry.INVOICE_ID || '').startsWith('SI-');
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';

        // Async check GST filing
        _ensureGstFiledCache().then(() => {
            const gstFiled = _isGstFiled(entry.BRANCH || entry.BRANCH_NAME, entry.ENTRY_DATE);
            const showActions = isStandalone && isActive && !gstFiled && !isVoid;
            const actionsEl = document.getElementById('siDetailActions');
            if (actionsEl) {
                actionsEl.style.display = showActions ? '' : 'none';
                if (gstFiled && !actionsEl.dataset.gstNote) {
                    actionsEl.dataset.gstNote = '1';
                    const note = document.createElement('p');
                    note.className = 'text-xs text-gray-400 mt-1';
                    note.textContent = 'GST already filed — editing locked.';
                    actionsEl.appendChild(note);
                }
            }
        });

        const actionBtns = isStandalone && !isVoid ? `
            <div id="siDetailActions" class="flex gap-2" style="display:none">
                <button onclick="VaultSalesInvoices._openEditForm('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 flex items-center gap-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    Edit
                </button>
                <button onclick="VaultSalesInvoices._handleDelete('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    Delete
                </button>
            </div>` : '';

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">Sales Invoice — ${entry.INV_NUMBER || 'N/A'}</h3>
                    ${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : actionBtns}
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-500">Invoice No:</span> ${entry.INV_NUMBER || 'N/A'}</div>
                        <div><span class="text-gray-500">Invoice ID:</span> ${entry.INVOICE_ID || 'N/A'}</div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Status:</span> <span class="font-medium">${entry.STATUS || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Client:</span> ${entry.CLIENT_NAME || 'N/A'} (${entry.CODE || ''})</div>
                        <div><span class="text-gray-500">Branch:</span> ${entry.BRANCH_NAME || entry.BRANCH || 'N/A'}</div>
                        <div><span class="text-gray-500">Client GST:</span> ${entry.CLIENT_GST || 'N/A'}</div>
                        <div><span class="text-gray-500">POS:</span> ${entry.POS || 'N/A'}</div>
                        <div><span class="text-gray-500">Amount (₹):</span> <strong class="text-indigo-700">₹${(+entry.DEBIT||0).toFixed(2)}</strong></div>
                        <div><span class="text-gray-500">Running Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">FY:</span> ${entry.FY || 'N/A'}</div>
                        <div><span class="text-gray-500">Direction:</span> ${entry.DIRECTION || 'N/A'}</div>
                        <div class="col-span-2"><span class="text-gray-500">Narration:</span> ${entry.NARRATION || '—'}</div>
                        <div class="col-span-2 border-t pt-2 mt-1 grid grid-cols-2 gap-4">
                            <div><span class="text-gray-500">Created by:</span> ${entry.USER_NAME || 'N/A'}</div>
                            <div><span class="text-gray-500">Staff:</span> ${entry.STAFF_NAME || ''} ${entry.STAFF_CODE ? '('+entry.STAFF_CODE+')' : ''}</div>
                            ${entry.APPROVED_BY ? `<div><span class="text-gray-500">Approved by:</span> ${entry.APPROVED_BY}</div>` : ''}
                            ${entry.APPROVED_AT ? `<div><span class="text-gray-500">Approved at:</span> ${fmtDate(entry.APPROVED_AT)}</div>` : ''}
                            ${entry.VOID_REASON ? `<div class="col-span-2 text-red-600"><span class="text-gray-500">Void reason:</span> ${entry.VOID_REASON}</div>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── New Invoice Form ─────────────────────────────────────────────────────
    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">➕ New Sales Invoice</h3></div>
                <div class="detail-card-body">
                    <form id="siForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                            <input name="code" id="siCode" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="siCodeList" autocomplete="off">
                            <datalist id="siCodeList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                            <input name="branch" id="siBranch" class="form-input text-sm uppercase" placeholder="Auto from client" list="siBranchList">
                            <datalist id="siBranchList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Number <span class="text-gray-400">(optional)</span></label>
                            <input name="inv_number" class="form-input text-sm" placeholder="Auto-generate if blank">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Date *</label>
                            <input name="inv_date" type="date" required class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">POS (State Code)</label>
                            <input name="pos" id="siPos" class="form-input text-sm" placeholder="Auto from client" maxlength="2">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration</label>
                            <input name="narration" class="form-input text-sm" placeholder="Invoice description (optional)">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="siBtnText">Create Invoice</span>
                                <div id="siSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="siResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate client datalist from B2B
        getAppData().then(data => {
            const dl = document.getElementById('siCodeList');
            if (data?.B2B) Object.values(data.B2B).forEach(c => {
                if (c.CODE) {
                    const o = document.createElement('option');
                    o.value = c.CODE;
                    o.label = `${c.CODE} - ${c.B2B_NAME || ''}`;
                    dl.appendChild(o);
                }
            });
            const bdl = document.getElementById('siBranchList');
            if (data?.BRANCHES) Object.values(data.BRANCHES).forEach(b => {
                if (b.BRANCH_CODE) {
                    const o = document.createElement('option');
                    o.value = b.BRANCH_CODE;
                    bdl.appendChild(o);
                }
            });
        });

        // Auto-fill branch and POS when client code is entered
        document.getElementById('siCode').addEventListener('input', function() {
            const code = this.value.trim().toUpperCase();
            const b2b = _b2bMap.get(code);
            if (b2b) {
                const branchInput = document.getElementById('siBranch');
                if (b2b.BRANCH && !branchInput.value) branchInput.value = b2b.BRANCH;
                const posInput = document.getElementById('siPos');
                if (b2b.CODE_STATE && !posInput.value) posInput.value = b2b.CODE_STATE;
            }
        });

        document.getElementById('siForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('siSpinner');
            const resp = document.getElementById('siResponse');
            btn.disabled = true; sp.classList.remove('hidden');

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                const res = await callApi('/api/ledger/invoice', {
                    code: data.code,
                    branch: data.branch || '',
                    inv_number: data.inv_number || '',
                    inv_date: toMs(data.inv_date),
                    amount: parseFloat(data.amount),
                    pos: data.pos || '',
                    narration: data.narration || `Invoice ${data.inv_number || ''}`,
                }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Invoice ${res.inv_number} created. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');
                e.target.reset();
                const d = document.querySelector('[name="inv_date"]');
                if (d) d.value = new Date().toISOString().split('T')[0];
                // Refresh data
                const appData = await getAppData();
                if (appData?.LEDGER) {
                    _allLedger = Object.values(appData.LEDGER);
                    _renderList();
                }
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed to create invoice');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });
        const d = document.querySelector('[name="inv_date"]');
        if (d) d.value = new Date().toISOString().split('T')[0];
        VaultPage.showDetailPane();
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        // Wire search input
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();
        const data = await getAppData();
        if (data) {
            _allLedger = Object.values(data.LEDGER || {});
            _b2bMap.clear();
            if (data.B2B) Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
            _renderList(_allLedger);
        }
    }

    return { load, search, openAddPane, _handleDelete, _openEditForm, _renderDetailById };
})();

window.VaultSalesInvoices = VaultSalesInvoices;
