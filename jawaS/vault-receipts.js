// ============================================================================
// VAULT-RECEIPTS.JS — Manager.io native payments tile
// Tiles: receipts (💰), payments (💸)
// API:
//   GET  /api/manager/all-receipts           — cross-branch receipt list
//   GET  /api/manager/all-payments            — cross-branch payment list
//   GET  /api/manager/receipt-details/{b}/{k} — receipt form detail
//   GET  /api/manager/payment-details/{b}/{k} — payment form detail
//   POST /api/manager/receipts?code=XXX       — create receipt
//   POST /api/manager/payments?code=XXX       — create payment
//   DELETE /api/manager/receipts/{k}?code=XXX — void receipt
//   DELETE /api/manager/payments/{k}?code=XXX — void payment
//   GET  /api/manager/bank-accounts?code=XXX  — bank/cash accounts
//   GET  /api/manager/customers?code=XXX      — customers (for dropdown)
//   GET  /api/manager/cache/keys?categories=suppliers — suppliers (for dropdown)
// ============================================================================

const VaultReceipts = (() => {

    let _activeMode     = 'receipts'; // 'receipts' | 'payments'
    let _receiptsList   = [];
    let _paymentsList   = [];
    let _bankAcctsCache = {};  // clientCode → [{key, name, actualBalance}]
    let _customersCache = {};  // clientCode → [{key, name}]
    let _suppliersCache = {};  // clientCode → [{key, name}]
    let _coaListsCache  = {};  // clientCode → [{key, name}]  (all COA accounts)
    let _b2bList        = [];  // [{CODE, B2B_NAME, BRANCH}]

    function _can(role) { return window.VaultPage?.can(role); }

    // ── Helpers ──────────────────────────────────────────────────────────────
    function _entityLabel() {
        return _activeMode === 'receipts' ? 'Customer' : 'Supplier';
    }
    function _entityKey() {
        return _activeMode === 'receipts' ? 'Customer' : 'Supplier';
    }
    function _entityListKey() {
        return _activeMode === 'receipts' ? 'customer' : 'supplier';
    }

    // ── Cache helpers ─────────────────────────────────────────────────────────
    async function _ensureBankAccounts(code) {
        if (_bankAcctsCache[code]) return _bankAcctsCache[code];
        try {
            const res = await callApi(`/api/manager/bank-accounts?code=${encodeURIComponent(code)}`, {}, 'GET');
            const accounts = res.bankAndCashAccounts || [];
            _bankAcctsCache[code] = accounts;
            return accounts;
        } catch {
            _bankAcctsCache[code] = [];
            return [];
        }
    }

    async function _ensureCustomers(code) {
        if (_customersCache[code]) return _customersCache[code];
        try {
            const res = await callApi(`/api/manager/customers?code=${encodeURIComponent(code)}`, {}, 'GET');
            const customers = res.customers || [];
            _customersCache[code] = customers;
            return customers;
        } catch {
            _customersCache[code] = [];
            return [];
        }
    }

    async function _ensureCoaAccounts(code) {
        if (_coaListsCache[code]) return _coaListsCache[code];
        try {
            const res = await callApi(`/api/manager/cache/keys?code=${encodeURIComponent(code)}&categories=coa`, {}, 'GET');
            const map = res.coa || {};
            const list = Object.entries(map).map(([name, key]) => ({key, name}));
            _coaListsCache[code] = list;
            return list;
        } catch {
            _coaListsCache[code] = [];
            return [];
        }
    }
        if (_suppliersCache[code]) return _suppliersCache[code];
        try {
            const res = await callApi(`/api/manager/cache/keys?code=${encodeURIComponent(code)}&categories=suppliers`, {}, 'GET');
            // Return as key→name map
            const map = res.suppliers || {};
            const list = Object.entries(map).map(([name, key]) => ({key, name}));
            _suppliersCache[code] = list;
            return list;
        } catch {
            _suppliersCache[code] = [];
            return [];
        }
    }

    async function _loadB2bList() {
        try {
            const data = await getAppData();
            if (data?.B2B) {
                _b2bList = Object.values(data.B2B).filter(c => c.CODE);
            }
        } catch {
            _b2bList = [];
        }
    }

    function _getClientCodeForBranch(branch) {
        const b = branch?.toLowerCase();
        const found = _b2bList.find(c => (c.BRANCH || '').toLowerCase() === b);
        return found ? found.CODE : null;
    }

    function _getBranchForClientCode(code) {
        const found = _b2bList.find(c => c.CODE === code);
        return found ? (found.BRANCH || '') : '';
    }

    // ── List injection ────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        const label = _activeMode === 'receipts' ? 'ref, customer' : 'ref, supplier';
        document.getElementById('vaultSearch').placeholder = `Search by ${label}, branch…`;
    }

    async function _fetchList() {
        const branchSelect = document.getElementById('vaultBranchSelect');
        const branch = branchSelect ? branchSelect.value : '';
        try {
            if (_activeMode === 'receipts') {
                const res = await callApi(`/api/manager/all-receipts${branch ? '?branch=' + branch : ''}`, {}, 'GET');
                _receiptsList = res.receipts || [];
            } else {
                const res = await callApi(`/api/manager/all-payments${branch ? '?branch=' + branch : ''}`, {}, 'GET');
                _paymentsList = res.payments || [];
            }
        } catch (err) {
            console.error('[VaultReceipts] Failed to fetch list:', err);
            if (_activeMode === 'receipts') _receiptsList = [];
            else _paymentsList = [];
        }
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const items = _activeMode === 'receipts' ? _receiptsList : _paymentsList;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? items.filter(item => {
                const entity = item[_entityListKey()] || {};
                return (item.reference || '').toLowerCase().includes(q) ||
                       (entity.name || '').toLowerCase().includes(q) ||
                       (item.date || '').includes(q) ||
                       (item.branch || '').toLowerCase().includes(q);
              })
            : items;

        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No ${_activeMode} found.</li>`;
            return;
        }

        const label = _activeMode === 'receipts' ? '📥' : '📤';
        ul.innerHTML = filtered.slice(0, 100).map(item => {
            const amount = item.total?.value || 0;
            const entity = item[_entityListKey()] || {};
            const entityDisplay = entity.name || '';
            return `<li data-key="${item.key}" data-branch="${item.branch || ''}" class="p-3 rounded-lg cursor-pointer hover:bg-green-50 border border-gray-200 transition-colors">
                <strong class="text-green-700 block text-sm">${label} ${item.reference || 'N/A'} — ${entityDisplay}</strong>
                <span class="text-xs text-gray-500">₹${amount.toFixed(2)} · ${item.date || ''} · ${item.branch || ''}</span>
            </li>`;
        }).join('');

        ul.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(li.dataset.key, li.dataset.branch);
            });
        });

        document.getElementById('vaultListMsg').textContent = `${filtered.length} ${_activeMode}`;
    }

    function search() { _renderList(); }

    // ── Detail view ────────────────────────────────────────────────────────────
    async function _renderDetail(key, branch) {
        if (!key || !branch) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `<div class="text-center py-8"><div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>`;
        VaultPage.showDetailPane();

        try {
            const endpoint = _activeMode === 'receipts'
                ? `/api/manager/receipt-details/${branch}/${key}`
                : `/api/manager/payment-details/${branch}/${key}`;
            const formData = await callApi(endpoint, {}, 'GET');

            const isReceipt = _activeMode === 'receipts';
            const label = isReceipt ? 'Receipt' : 'Payment';
            const entityNameKey = isReceipt ? 'Customer' : 'Supplier';
            const bankKey = isReceipt ? 'ReceivedIn' : 'PaidFrom';
            const amount = formData.Lines?.reduce((s, l) => s + (l.Amount || 0), 0) || 0;

            // Resolve names from cache
            const clientCode = _getClientCodeForBranch(branch);
            let entityDisplay = formData[entityNameKey] || '';
            let bankDisplay = formData[bankKey] || '';

            if (clientCode && isReceipt) {
                const customers = await _ensureCustomers(clientCode);
                const cust = customers.find(c => c.key === formData[entityNameKey]);
                if (cust) entityDisplay = cust.name;
            }
            if (clientCode) {
                const banks = await _ensureBankAccounts(clientCode);
                const bank = banks.find(b => b.key === formData[bankKey]);
                if (bank) bankDisplay = bank.name;
            }

            const linesHtml = (formData.Lines || []).map((line, i) => {
                const invRef = line.AccountsReceivableSalesInvoice
                    ? `<span class="text-gray-400 ml-2">Inv: ${line.AccountsReceivableSalesInvoice}</span>`
                    : line.AccountsPayablePurchaseInvoice
                    ? `<span class="text-gray-400 ml-2">Bill: ${line.AccountsPayablePurchaseInvoice}</span>`
                    : '';
                const accountName = line.Account ? (line.Account.length === 36 ? line.Account.substring(0, 8) + '…' : line.Account) : '';
                return `<tr><td class="py-1 text-xs text-gray-500">${i + 1}</td><td class="py-1 text-sm">${accountName}${invRef}</td><td class="py-1 text-sm text-right font-medium">₹${(line.Amount || 0).toFixed(2)}</td></tr>`;
            }).join('');

            const printBtn = `<button onclick="VaultReceipts._printEntry('${key}','${branch}')" class="btn btn-sm flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> Print</button>`;

            const voidBtn = `<button onclick="VaultReceipts._handleDelete('${key}','${branch}')" class="btn-danger btn-sm flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Void</button>`;

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header flex justify-between items-center">
                        <h3 class="font-semibold text-gray-700">${label} Detail</h3>
                        <div class="flex gap-2 items-center">
                            <span class="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700 border border-green-200">₹${amount.toFixed(2)}</span>
                            ${printBtn}${voidBtn}
                        </div>
                    </div>
                    <div class="detail-card-body">
                        <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-3 rounded-lg mb-4">
                            <div><span class="text-gray-500">Reference:</span> <span class="font-semibold">${formData.Reference || formData.reference || 'N/A'}</span></div>
                            <div><span class="text-gray-500">Date:</span> ${formData.Date || formData.date || 'N/A'}</div>
                            <div><span class="text-gray-500">${entityNameKey}:</span> <span class="font-semibold">${entityDisplay}</span></div>
                            <div><span class="text-gray-500">Bank Account:</span> ${bankDisplay}</div>
                            <div><span class="text-gray-500">Branch:</span> ${branch.toUpperCase()}</div>
                            <div><span class="text-gray-500">Total:</span> <span class="font-bold">₹${amount.toFixed(2)}</span></div>
                        </div>

                        ${formData.Description ? `<div class="text-sm text-gray-700 mb-4 bg-white border rounded-lg p-3">📝 ${formData.Description}</div>` : ''}

                        <div class="border rounded-lg overflow-hidden">
                            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 px-3 py-2 border-b">Lines</div>
                            <table class="w-full text-sm">
                                <thead><tr class="border-b bg-gray-50/50"><th class="text-left py-1 px-3 text-xs text-gray-400">#</th><th class="text-left py-1 px-3 text-xs text-gray-400">Account</th><th class="text-right py-1 px-3 text-xs text-gray-400">Amount</th></tr></thead>
                                <tbody>${linesHtml || '<tr><td colspan="3" class="text-center py-4 text-gray-400 text-sm">No lines</td></tr>'}</tbody>
                            </table>
                        </div>

                        <details class="mt-4">
                            <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Raw Data</summary>
                            <pre class="text-xs text-gray-500 mt-2 p-3 border rounded-lg overflow-auto max-h-64">${JSON.stringify(formData, null, 2)}</pre>
                        </details>
                    </div>
                </div>`;
        } catch (err) {
            view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8 text-red-600"><p class="text-sm">Failed to load: ${err.message || err}</p></div></div>`;
        }
        VaultPage.showDetailPane();
    }

    // ── Print ─────────────────────────────────────────────────────────────────
    async function _printEntry(key, branch) {
        try {
            const endpoint = _activeMode === 'receipts'
                ? `/api/manager/receipt-details/${branch}/${key}`
                : `/api/manager/payment-details/${branch}/${key}`;
            const formData = await callApi(endpoint, {}, 'GET');
            // Fallback to window.print with a simple summary if VaultPrint is not available
            if (window.VaultPrint?.printReceipt) {
                window.VaultPrint.printReceipt(formData, _activeMode === 'receipts');
            } else {
                const w = window.open('', '_blank');
                w.document.write(`<html><head><title>${_activeMode === 'receipts' ? 'Receipt' : 'Payment'} - ${formData.Reference || key}</title></head><body><pre>${JSON.stringify(formData, null, 2)}</pre></body></html>`);
                w.document.close();
                w.print();
            }
        } catch (err) {
            alert('Failed to load details for print: ' + (err.message || err));
        }
    }

    // ── Void / Delete ─────────────────────────────────────────────────────────
    async function _handleDelete(key, branch) {
        const label = _activeMode === 'receipts' ? 'receipt' : 'payment';
        if (!confirm(`Void this ${label}? This action cannot be undone.`)) return;

        const clientCode = _getClientCodeForBranch(branch);
        if (!clientCode) {
            alert(`Cannot void: no client code found for branch ${branch}.`);
            return;
        }

        try {
            const endpoint = _activeMode === 'receipts'
                ? `/api/manager/receipts/${key}?code=${encodeURIComponent(clientCode)}`
                : `/api/manager/payments/${key}?code=${encodeURIComponent(clientCode)}`;
            const res = await callApi(endpoint, null, 'DELETE');
            if (res.status === 'deleted' || res.status === 204) {
                // Remove from local list
                if (_activeMode === 'receipts') {
                    _receiptsList = _receiptsList.filter(r => r.key !== key);
                } else {
                    _paymentsList = _paymentsList.filter(p => p.key !== key);
                }
                _renderList();
                VaultPage.showDetail(false);
                VaultPage.showDetailPane();
            } else {
                alert('Voided successfully.');
                _fetchList().then(_renderList);
                VaultPage.showDetail(false);
            }
        } catch (err) {
            alert('Failed to void: ' + (err.message || err));
        }
    }

    // ── Add / Create form ─────────────────────────────────────────────────────
    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const isReceipt = _activeMode === 'receipts';
        const label = isReceipt ? 'Receipt' : 'Payment';

        // Build branch dropdown options
        const branchOptions = _b2bList
            .filter((c, i, arr) => arr.findIndex(x => x.BRANCH === c.BRANCH) === i) // unique branches
            .map(c => `<option value="${c.CODE}">${c.BRANCH || ''} — ${c.CODE}</option>`)
            .join('');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📥 Record ${label}</h3></div>
                <div class="detail-card-body">
                    <form id="rptCreateForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch / Client *</label>
                            <select name="client_code" required class="form-input text-sm">
                                <option value="">— Select Branch —</option>
                                ${branchOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                            <input name="date" type="date" required class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">${_entityLabel()} *</label>
                            <select name="entity_key" required class="form-input text-sm" id="rptEntitySelect" disabled>
                                <option value="">— Select branch first —</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Bank Account *</label>
                            <select name="bank_key" required class="form-input text-sm" id="rptBankSelect" disabled>
                                <option value="">— Select branch first —</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">${isReceipt ? 'Income' : 'Expense'} Account</label>
                            <select name="account" class="form-input text-sm" id="rptAccountSelect" disabled>
                                <option value="">— Select branch first —</option>
                            </select>
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Description / Narration</label>
                            <input name="description" class="form-input text-sm" placeholder="Optional description">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="rptCreateBtnText">Save ${label}</span>
                                <div id="rptCreateSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="rptCreateResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Set default date
        const dateInput = document.querySelector('[name="date"]');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

        // Branch/Client selector → load bank accounts and entity list
        const clientSelect = document.querySelector('[name="client_code"]');
        clientSelect.addEventListener('change', async function() {
            const code = this.value;
            const entitySelect = document.getElementById('rptEntitySelect');
            const bankSelect = document.getElementById('rptBankSelect');

            if (!code) {
                entitySelect.innerHTML = '<option value="">— Select branch first —</option>';
                entitySelect.disabled = true;
                bankSelect.innerHTML = '<option value="">— Select branch first —</option>';
                bankSelect.disabled = true;
                return;
            }

            entitySelect.innerHTML = '<option value="">Loading…</option>';
            bankSelect.innerHTML = '<option value="">Loading…</option>';
            entitySelect.disabled = true;
            bankSelect.disabled = true;

            try {
                // Load in parallel
                const [banks, entities, coa] = await Promise.all([
                    _ensureBankAccounts(code),
                    isReceipt ? _ensureCustomers(code) : _ensureSuppliers(code),
                    _ensureCoaAccounts(code)
                ]);

                // Populate bank accounts
                bankSelect.innerHTML = '<option value="">— Select bank account —</option>';
                banks.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.key;
                    opt.textContent = `${b.name} (₹${(b.actualBalance?.value || 0).toFixed(2)})`;
                    bankSelect.appendChild(opt);
                });
                bankSelect.disabled = false;

                // Populate entities (customers or suppliers)
                entitySelect.innerHTML = `<option value="">— Select ${_entityLabel()} —</option>`;
                entities.forEach(e => {
                    const opt = document.createElement('option');
                    opt.value = e.key;
                    opt.textContent = e.name;
                    entitySelect.appendChild(opt);
                });
                entitySelect.disabled = false;

                // Populate account dropdown (COA -> filter income/expense-like)
                const acctSelect = document.getElementById('rptAccountSelect');
                const keywords = isReceipt
                    ? ['income', 'sales', 'revenue', 'received', 'freight']
                    : ['expense', 'direct expenses', 'purchase', 'cost', 'fee', 'rent', 'charge'];
                const filtered = coa.filter(a =>
                    keywords.some(k => a.name.toLowerCase().includes(k))
                );
                acctSelect.innerHTML = '<option value="">— Auto (default) —</option>';
                filtered.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.key;
                    opt.textContent = a.name;
                    acctSelect.appendChild(opt);
                });
                acctSelect.disabled = false;

            } catch (err) {
                console.error('[VaultReceipts] Failed to load form data:', err);
                entitySelect.innerHTML = '<option value="">Error loading</option>';
                bankSelect.innerHTML = '<option value="">Error loading</option>';
            }
        });

        // Form submit
        document.getElementById('rptCreateForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('rptCreateSpinner');
            const resp = document.getElementById('rptCreateResponse');
            btn.disabled = true;
            sp.classList.remove('hidden');
            resp.classList.add('hidden');

            const code = data.client_code;
            const amount = parseFloat(data.amount);
            if (!amount || amount <= 0) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ Invalid amount.';
                resp.classList.remove('hidden');
                btn.disabled = false;
                sp.classList.add('hidden');
                return;
            }

            try {
                const payload = {
                    Date: data.date,
                    ...(isReceipt
                        ? { ReceivedIn: data.bank_key, Customer: data.entity_key }
                        : { PaidFrom: data.bank_key, Supplier: data.entity_key }
                    ),
                    Description: data.description || '',
                    Lines: [{
                        Amount: amount
                    }]
                };

                // Only include Account if specific one was selected
                if (data.account) {
                    payload.Lines[0].Account = data.account;
                }

                const endpoint = isReceipt
                    ? `/api/manager/receipts?code=${encodeURIComponent(code)}`
                    : `/api/manager/payments?code=${encodeURIComponent(code)}`;

                const res = await callApi(endpoint, payload, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ ${label} recorded. Ref: ${res.Reference || 'done'}`;
                resp.classList.remove('hidden');
                e.target.reset();
                if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

                // Refresh list
                await _fetchList();
                _renderList();
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed to create');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                sp.classList.add('hidden');
            }
        });

        VaultPage.showDetailPane();
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();
        await _loadB2bList();
        await _fetchList();
        _renderList();
    }

    function setMode(mode) { _activeMode = mode; }

    return {
        load,
        search,
        openAddPane,
        setMode,
        _handleDelete,
        _printEntry,
    };
})();

window.VaultReceipts = VaultReceipts;
