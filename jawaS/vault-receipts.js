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

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

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

    async function _ensureSuppliers(code) {
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
        window.setLoading?.(true, `Loading ${_activeMode}...`, 'list');
        try {
            if (_activeMode === 'receipts') {
                const res = await callApi(`/api/manager/all-receipts?startDate=${_filterStart || ''}&endDate=${_filterEnd || ''}&branch=${branch || ''}`, {}, 'GET');
                _receiptsList = res.receipts || [];
            } else {
                const res = await callApi(`/api/manager/all-payments?startDate=${_filterStart || ''}&endDate=${_filterEnd || ''}&branch=${branch || ''}`, {}, 'GET');
                _paymentsList = res.payments || [];
            }
        } catch (err) {
            console.error('[VaultReceipts] Failed to fetch list:', err);
            if (_activeMode === 'receipts') _receiptsList = [];
            else _paymentsList = [];
        } finally {
            window.setLoading?.(false);
        }
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const items = _activeMode === 'receipts' ? _receiptsList : _paymentsList;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = items.filter(item => {
            // Text search
            if (q) {
                const entity = item[_entityListKey()] || {};
                const match = (item.reference || '').toLowerCase().includes(q) ||
                    (entity.name || '').toLowerCase().includes(q) ||
                    (item.date || '').includes(q) ||
                    (item.branch || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            // Date range
            const d = item.date || '';
            if (_filterStart && d < _filterStart) return false;
            if (_filterEnd && d > _filterEnd) return false;
            // Branch
            if (_filterBranch && (item.branch || '').toLowerCase() !== _filterBranch.toLowerCase()) return false;
            // Status (has amount vs zero)
            if (_filterStatus) {
                const amt = item.total?.value || 0;
                if (_filterStatus === 'hasamount' && amt <= 0) return false;
                if (_filterStatus === 'zero' && amt > 0) return false;
            }
            return true;
        });

        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // Update status label
        const statusEl = document.getElementById('rptStatus');
        if (statusEl) {
            const totalLabel = _activeMode === 'receipts' ? 'Receipts' : 'Payments';
            statusEl.textContent = `Showing ${filtered.length} of ${items.length} ${totalLabel}`;
        }

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No matching ${_activeMode} found.</li>`;
            return;
        }

        const label = _activeMode === 'receipts' ? '📥' : '📤';
        ul.innerHTML = filtered.slice(0, 100).map(item => {
            const amount = item.total?.value || 0;
            const entity = item[_entityListKey()] || {};
            const entityDisplay = _escapeHtml(entity.name || '');
            return `<li data-key="${item.key}" data-branch="${item.branch || ''}" class="p-3 rounded-lg cursor-pointer hover:bg-green-50 border border-gray-200 transition-colors">
                <strong class="text-green-700 block text-sm">${label} ${_escapeHtml(item.reference || 'N/A')} — ${entityDisplay}</strong>
                <span class="text-xs text-gray-500">₹${amount.toFixed(2)} · ${_escapeHtml(item.date || '')} · ${_escapeHtml(item.branch || '')}</span>
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

        const _dl = _activeMode === 'receipts' ? 'Receipt' : 'Payment';
        window.setLoading?.(true, `Fetching ${_dl}...`, 'detail');
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

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-body p-6 space-y-6">
                        <!-- Header -->
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-5">
                            <div class="flex-1 min-w-0">
                                <h1 class="text-xl font-bold text-green-800 tracking-tight break-words">${label}</h1>
                                <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-semibold text-gray-700">${_escapeHtml(branch.toUpperCase())}</span></p>
                            </div>
                            <div class="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                                <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                                    <span class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-green-50 text-green-700 uppercase whitespace-nowrap">${isReceipt ? 'RECEIPT' : 'PAYMENT'}</span>
                                    <button onclick="VaultReceipts._printEntry('${key}','${branch}')"
                                        class="btn btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                                        </svg><span class="truncate">Print</span>
                                    </button>
                                    <button onclick="VaultReceipts._handleDelete('${key}','${branch}')"
                                        class="btn-danger btn-sm flex-1 sm:flex-none min-w-0 justify-center">
                                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg><span class="truncate">Void</span>
                                    </button>
                                </div>
                                <p class="text-sm text-gray-500">${label} #: <span class="font-bold text-gray-800">${_escapeHtml(formData.Reference || formData.reference || 'N/A')}</span></p>
                                <p class="text-xs text-gray-400">Date: ${_escapeHtml(formData.Date || formData.date || 'N/A')}</p>
                            </div>
                        </div>

                        <!-- Entity & Bank Details -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">${entityNameKey}</h3>
                                <p class="font-semibold text-gray-800">${_escapeHtml(entityDisplay)}</p>
                            </div>
                            <div>
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Details</h3>
                                <p class="text-gray-600">Bank Account: <span class="font-medium text-gray-800">${_escapeHtml(bankDisplay)}</span></p>
                                <p class="text-gray-600 mt-0.5">Total: <span class="font-bold text-green-700">₹${amount.toFixed(2)}</span></p>
                            </div>
                        </div>

                        <!-- Description -->
                        ${formData.Description ? `<div class="bg-green-50/40 border border-green-100/50 rounded-lg p-3 text-xs text-green-950">
                            <span class="font-semibold block text-green-800 uppercase tracking-wider mb-1" style="font-size: 10px;">Description</span>
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
                                    ${linesHtml || '<tr><td colspan="3" class="text-center py-4 text-gray-400 text-sm">No lines</td></tr>'}
                                </tbody>
                            </table>
                        </div>

                        <!-- Summary Block -->
                        <div class="flex justify-end pt-2">
                            <div class="w-full md:w-64 space-y-2 text-xs bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <div class="flex justify-between font-bold text-gray-800 text-sm">
                                    <span>Total ${label}:</span>
                                    <span class="text-green-700 font-extrabold">₹${amount.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Metadata -->
                        <details class="text-[11px] text-gray-400">
                            <summary class="cursor-pointer hover:text-gray-600 transition-colors">Audit & System Metadata</summary>
                            <div class="grid grid-cols-2 gap-2 mt-2 p-2 border rounded-lg bg-gray-50/50">
                                <div>Branch: ${_escapeHtml(branch.toUpperCase())}</div>
                                <div>Manager UUID: <span class="font-mono text-[9px]">${formData.Key || formData.key || 'N/A'}</span></div>
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

    // ── Print ─────────────────────────────────────────────────────────────────
    async function _printEntry(key, branch) {
        window.setLoading?.(true, 'Preparing print...', 'detail');
        try {
            const endpoint = _activeMode === 'receipts'
                ? `/api/manager/receipt-details/${branch}/${key}`
                : `/api/manager/payment-details/${branch}/${key}`;
            const [formData, appData] = await Promise.all([
                callApi(endpoint, {}, 'GET'),
                getAppData()
            ]);

            const isReceipt = _activeMode === 'receipts';
            const label = isReceipt ? 'Receipt' : 'Payment';
            const entityNameKey = isReceipt ? 'Customer' : 'Supplier';
            const bankKey = isReceipt ? 'ReceivedIn' : 'PaidFrom';
            const ref = formData.Reference || formData.reference || key;
            const date = formData.Date || formData.date || '';

            // Resolve names
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
            const branchMobile = branchInfo?.BRANCH_MOBILE || '';
            const branchEmail = branchInfo?.BRANCH_EMAIL || '';
            const branchGstin = branchInfo?.BRANCH_GSTIN || '';

            const lines = formData.Lines || [];
            const linesHtml = lines.map((line, i) => {
                const accountName = line.Account || '';
                const amt = line.Amount || 0;
                return `<tr><td class="tc">${i+1}</td><td>${_escapeHtml(accountName)}</td><td class="tr">₹${amt.toFixed(2)}</td></tr>`;
            }).join('');
            const totalAmount = lines.reduce((s, l) => s + (l.Amount || 0), 0);

            const css = `
                body{font-family:Arial,sans-serif;font-size:13px;color:#000;margin:0;padding:20px;background:#f5f5f5}
                .box{max-width:800px;margin:auto;background:#fff;padding:30px;border:1px solid #eee;box-shadow:0 0 10px rgba(0,0,0,.15)}
                .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #16a34a;padding-bottom:15px;margin-bottom:20px}
                .tr{text-align:right}.tc{text-align:center}
                .info{display:flex;justify-content:space-between;margin-bottom:20px;gap:20px}
                .col{width:48%}.col h3{margin:0 0 5px;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:3px}.col p{margin:2px 0;font-size:12px}
                .div{width:1px;background:#ccc}.divb{height:2px;background:#16a34a;margin-bottom:20px}
                .meta{margin-bottom:20px;font-weight:bold;text-align:center}
                table{width:100%;border-collapse:collapse;margin-bottom:20px}table,th,td{border:1px solid #000}th,td{padding:6px;text-align:left}th{background:#f2f2f2}
                .sig{text-align:right;font-weight:bold;margin-top:20px}.sigbox{display:inline-block;text-align:center;min-width:200px}
                .no-print{text-align:center;margin-bottom:15px}
                .no-print button{padding:8px 20px;margin:3px;border:none;border-radius:4px;cursor:pointer;font-weight:600}
                .no-print .print-btn{background:#16a34a;color:#fff}
                .no-print .close-btn{background:#6b7280;color:#fff}
                @media print{@page{size:A4;margin:10mm}body{background:#fff;padding:0}.box{box-shadow:none;border:none}.no-print{display:none}}
            `;

            const body = `
                <div class="no-print"><button class="print-btn" onclick="window.print()">🖨️ Print</button><button class="close-btn" onclick="window.close()">✕ Close</button></div>
                <div class="box">
                    <div class="hdr">
                        <div style="font-size:26px;font-weight:bold;text-transform:uppercase;color:#16a34a">${label}</div>
                        <div style="text-align:right;font-size:12px">
                            <b>${label} No:</b> ${_escapeHtml(ref)}<br>
                            <b>Date:</b> ${_escapeHtml(date.split('T')[0] || date)}
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
                            <h3>${entityNameKey}: ${_escapeHtml(entityDisplay)}</h3>
                            <p><b>Bank Account:</b> ${_escapeHtml(bankDisplay)}</p>
                            <p><b>Branch:</b> ${_escapeHtml(branch.toUpperCase())}</p>
                        </div>
                    </div>

                    <div class="divb"></div>
                    ${formData.Description ? `<div class="meta"><p>${_escapeHtml(formData.Description)}</p></div>` : ''}

                    ${lines.length ? `
                    <table>
                        <thead><tr><th class="tc">Sr</th><th>Account</th><th class="tr">Amount</th></tr></thead>
                        <tbody>${linesHtml}</tbody>
                    </table>
                    ` : ''}

                    <div style="margin-top:10px;text-align:right;font-size:16px;font-weight:bold;color:#16a34a">
                        Total ${label}: ₹${totalAmount.toFixed(2)}
                    </div>

                    <div class="sig">
                        <div class="sigbox">
                            <p style="margin-bottom:40px">Authorized Signatory</p>
                            <p>for ${_escapeHtml(branchName)}</p>
                        </div>
                    </div>
                </div>`;

            const w = window.open('', (isReceipt ? 'Receipt_' : 'Payment_') + ref.replace(/[^a-zA-Z0-9]/g, '_'));
            if (!w) { alert('Pop-up blocked! Please allow pop-ups.'); return; }
            w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + label + ' - ' + _escapeHtml(ref) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>');
            w.document.close();
            w.onload = function() {
                setTimeout(function() {
                    try {
                        w.document.querySelectorAll('.no-print').forEach(function(e) { e.style.display = 'block'; });
                    } catch(_) {}
                }, 500);
            };
        } catch (err) {
            alert('Failed to load details for print: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
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

        window.setLoading?.(true, `Voiding ${label}...`, 'detail');
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
        } finally {
            window.setLoading?.(false);
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
            window.setLoading?.(true, 'Loading dropdowns...', 'detail');

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
            } finally {
                window.setLoading?.(false);
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
            window.setLoading?.(true, `Saving ${label}...`, 'detail');

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
                window.setLoading?.(false);
                btn.disabled = false;
                sp.classList.add('hidden');
            }
        });

        VaultPage.showDetailPane();
    }

    // ── Filter UI injection (filter button, status counter, filter modal) ──────
    function _injectUI() {
        const listPane = document.getElementById('vaultListPane');
        const header   = listPane?.querySelector('.sv-pane-header');
        if (header && !document.getElementById('rptFilterBtn')) {
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
            filterBtn.id = 'rptFilterBtn';
            filterBtn.className = 'btn-ghost btn-sm flex-shrink-0';
            filterBtn.title = 'Filter ' + (_activeMode === 'receipts' ? 'Receipts' : 'Payments');
            filterBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>`;
            filterBtn.onclick = () => document.getElementById('rptFilterModal')?.classList.remove('hidden');
            searchRow?.appendChild(filterBtn);
        }

        if (!document.getElementById('rptStatus')) {
            const statusEl = document.createElement('p');
            statusEl.id = 'rptStatus';
            statusEl.className = 'text-xs text-gray-500 px-4 pt-2 text-center font-medium';
            statusEl.textContent = 'Loading...';
            const listContainer = document.getElementById('vaultList')?.parentElement;
            listContainer?.insertBefore(statusEl, document.getElementById('vaultList'));
        }

        if (!document.getElementById('rptFilterModal')) {
            const modal = document.createElement('div');
            modal.id = 'rptFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h2 class="text-lg font-bold text-gray-800">Filter ${_activeMode === 'receipts' ? 'Receipts' : 'Payments'}</h2>
                        <button onclick="document.getElementById('rptFilterModal').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Start Date</label>
                            <input type="date" id="rptFilterStart" class="form-input text-xs" value="${_filterStart}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">End Date</label>
                            <input type="date" id="rptFilterEnd" class="form-input text-xs" value="${_filterEnd}">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Branch</label>
                            <select id="rptFilterBranch" class="form-input text-xs">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Amount</label>
                            <select id="rptFilterStatus" class="form-input text-xs">
                                <option value="">All</option>
                                <option value="hasamount">Has Amount</option>
                                <option value="zero">Zero Amount</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button id="rptResetBtn" class="btn-ghost btn-sm">Reset</button>
                        <button id="rptApplyBtn" class="btn btn-sm">Apply Filters</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

            document.getElementById('rptApplyBtn').onclick = async () => {
                _filterStart = document.getElementById('rptFilterStart').value;
                _filterEnd = document.getElementById('rptFilterEnd').value;
                _filterBranch = document.getElementById('rptFilterBranch').value;
                _filterStatus = document.getElementById('rptFilterStatus').value;
                modal.classList.add('hidden');
                await _fetchList();
                _renderList();
            };

            document.getElementById('rptResetBtn').onclick = async () => {
                const range = getCurrentFYRange();
                document.getElementById('rptFilterStart').value = range.start;
                document.getElementById('rptFilterEnd').value = range.end;
                document.getElementById('rptFilterBranch').value = '';
                document.getElementById('rptFilterStatus').value = '';
                _filterStart = range.start;
                _filterEnd = range.end;
                _filterBranch = '';
                _filterStatus = '';
                await _fetchList();
                _renderList();
            };

            getAppData().then(data => {
                const select = document.getElementById('rptFilterBranch');
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
        await _loadB2bList();
        _injectUI();
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
