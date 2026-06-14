// ============================================================================
// VAULT-PURCHASES.JS — Purchase bills (inward invoices) + inward payments
// Tiles: purchase-bills, suppliers
// API: POST /api/ledger/inward/invoice, GET /api/ledger/inward/statement, summary
// ============================================================================

const VaultPurchases = (() => {

    let _allLedger = [];
    let _b2bMap = new Map();
    let _carrierMap = new Map();
    let _branchMap = new Map();

    function _can(role) { return window.VaultPage?.can(role); }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, vendor name…';
    }

    function _renderList(entries) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const inward = entries.filter(e => e.DIRECTION === 'INWARD' && e.ENTRY_TYPE === 'INVOICE');
        inward.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!inward.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No purchase bills recorded.</li>';
            return;
        }
        ul.innerHTML = inward.slice(0, 50).map(e => `
            <li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-orange-50 border border-gray-200 transition-colors">
                <strong class="text-orange-700 block text-sm">🛒 ${e.CODE || ''} — ₹${(+e.CREDIT||0).toFixed(2)}</strong>
                <span class="text-xs text-gray-500">${e.VENDOR_TYPE || ''} · ${e.CLIENT_NAME || ''}</span>
                <div class="text-xs text-gray-400 mt-1">${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''} · ${e.INV_NUMBER || 'No inv#'}</div>
            </li>`).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(_allLedger.find(e => e.ENTRY_ID === li.dataset.entry));
            })
        );
    }

    function search(q) {
        const lq = q.toLowerCase();
        _renderList(_allLedger.filter(e =>
            e.DIRECTION === 'INWARD' && (
                (e.CODE || '').toLowerCase().includes(lq) ||
                (e.CLIENT_NAME || '').toLowerCase().includes(lq) ||
                (e.INV_NUMBER || '').toLowerCase().includes(lq)
            )
        ));
    }

    async function _handleDelete(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry || entry.STATUS === 'VOID') return;
        if (!confirm(`Delete this purchase bill? ₹${(+entry.CREDIT||0).toFixed(2)}. This will void and recalculate balances.`)) return;
        const reason = prompt('Reason (optional):', '') || '';
        try {
            await callApi('/api/ledger/void', { entry_id: entryId, void_reason: reason }, 'POST');
            const appData = await getAppData();
            if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _renderList(_allLedger); }
            document.getElementById('vaultDetailView').innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8"><div class="text-4xl mb-3">🗑️</div><p class="text-gray-500 text-sm">Purchase bill deleted (voided).</p></div></div>`;
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';
        const delBtn = isActive ? `<button onclick="VaultPurchases._handleDelete('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Delete</button>` : '';
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">Purchase Bill Detail</h3>
                    <div class="flex gap-2">${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : delBtn}</div>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-500">Entry ID:</span> ${entry.ENTRY_ID}</div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Vendor:</span> ${entry.CODE || 'N/A'} (${entry.CLIENT_NAME || ''})</div>
                        <div><span class="text-gray-500">Type:</span> ${entry.VENDOR_TYPE || 'N/A'}</div>
                        <div><span class="text-gray-500">Amount:</span> ₹${(+entry.CREDIT||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">Inv #:</span> ${entry.INV_NUMBER || 'N/A'}</div>
                        <div><span class="text-gray-500">Status:</span> ${entry.STATUS || 'N/A'}</div>
                        ${entry.VENDOR_TAXABLE || entry.VENDOR_CGST ? `
                        <div class="col-span-2 border-t pt-2 mt-2">
                            <div class="text-xs font-semibold text-gray-500 uppercase mb-1">GST Breakup</div>
                            <div class="grid grid-cols-2 gap-2">
                                <div>Taxable: ₹${(+entry.VENDOR_TAXABLE||0).toFixed(2)}</div>
                                <div>CGST: ₹${(+entry.VENDOR_CGST||0).toFixed(2)}</div>
                                <div>SGST: ₹${(+entry.VENDOR_SGST||0).toFixed(2)}</div>
                                <div>IGST: ₹${(+entry.VENDOR_IGST||0).toFixed(2)}</div>
                            </div>
                        </div>` : ''}
                        ${entry.NARRATION ? `<div class="col-span-2"><span class="text-gray-500">Narration:</span> ${entry.NARRATION}</div>` : ''}
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Record Purchase Bill</h3></div>
                <div class="detail-card-body">
                    <form id="purchaseForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Vendor Code *</label>
                            <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. DELHIVERY">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Vendor Type *</label>
                            <select name="vendor_type" class="form-input text-sm">
                                <option value="B2B">B2B (Vendor)</option>
                                <option value="CARRIER">Carrier</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                            <select name="branch" class="form-input text-sm">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                            <input name="entry_date" type="date" required class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Number</label>
                            <input name="inv_number" class="form-input text-sm" placeholder="Vendor invoice #">
                        </div>
                        <div></div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration</label>
                            <input name="narration" class="form-input text-sm" placeholder="Optional description">
                        </div>
                        <!-- GST fields (optional) -->
                        <div class="sm:col-span-2 border-t pt-2">
                            <p class="text-xs text-gray-500 mb-2">GST Breakup (optional, required for ITC)</p>
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div><label class="block text-xs font-medium text-gray-600 mb-1">Taxable</label><input name="vendor_taxable" type="number" step="0.01" class="form-input text-sm"></div>
                                <div><label class="block text-xs font-medium text-gray-600 mb-1">CGST</label><input name="vendor_cgst" type="number" step="0.01" class="form-input text-sm"></div>
                                <div><label class="block text-xs font-medium text-gray-600 mb-1">SGST</label><input name="vendor_sgst" type="number" step="0.01" class="form-input text-sm"></div>
                                <div><label class="block text-xs font-medium text-gray-600 mb-1">IGST</label><input name="vendor_igst" type="number" step="0.01" class="form-input text-sm"></div>
                            </div>
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="purBtnText">Save Purchase Bill</span>
                                <div id="purSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="purResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate branch dropdown right after form is injected
        const branchSelect = document.querySelector('select[name="branch"]');
        if (branchSelect) {
            _branchMap.forEach((v, k) => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = v.BRANCH_NAME || k;
                branchSelect.appendChild(opt);
            });
        }

        document.getElementById('purchaseForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('purSpinner');
            const resp = document.getElementById('purResponse');
            btn.disabled = true; sp.classList.remove('hidden');

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                const body = {
                    code: data.code,
                    vendor_type: data.vendor_type,
                    entry_date: toMs(data.entry_date),
                    amount: parseFloat(data.amount),
                    narration: data.narration || '',
                    inv_number: data.inv_number || '',
                    branch: data.branch || '',
                    vendor_taxable: parseFloat(data.vendor_taxable) || 0,
                    vendor_cgst: parseFloat(data.vendor_cgst) || 0,
                    vendor_sgst: parseFloat(data.vendor_sgst) || 0,
                    vendor_igst: parseFloat(data.vendor_igst) || 0,
                };
                const res = await callApi('/api/ledger/inward/invoice', body, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Purchase bill saved. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderList(_allLedger);
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });
        const d = document.querySelector('[name="entry_date"]');
        if (d) d.value = new Date().toISOString().split('T')[0];
        VaultPage.showDetailPane();
    }

    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data) {
            _allLedger = Object.values(data.LEDGER || {});
            _b2bMap.clear();
            if (data.B2B) Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
            _carrierMap.clear();
            if (data.CARRIERS) Object.values(data.CARRIERS).forEach(c => c.COMPANY_CODE && _carrierMap.set(c.COMPANY_CODE, c));
            _branchMap.clear();
            if (data.BRANCHES) Object.values(data.BRANCHES).forEach(b => b.BRANCH_CODE && _branchMap.set(b.BRANCH_CODE, b));
            _renderList(_allLedger);
        }
    }

    return { load, search, openAddPane, _handleDelete };
})();

window.VaultPurchases = VaultPurchases;
