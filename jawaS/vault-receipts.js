// ============================================================================
// VAULT-RECEIPTS.JS — Record payments received + view payment history
// Tiles: receipts, payments
// API: POST /api/ledger/payment (OUTWARD), POST /api/ledger/inward/payment (INWARD)
// Both use double-entry via _create_entry_txn()
// ============================================================================

const VaultReceipts = (() => {

    let _allLedger   = [];
    let _b2bMap      = new Map();
    let _carrierMap  = new Map();
    let _activeMode  = 'receipts'; // 'receipts' | 'payments'
    let _coaMap      = {};

    function _can(role) { return window.VaultPage?.can(role); }

    // ── COA cache ─────────────────────────────────────────────────────────────
    async function _loadCoaCache() {
        try {
            const res = await callApi('/api/coa', {}, 'GET');
            if (res?.data) { res.data.forEach(a => _coaMap[a.code] = a); }
        } catch {}
    }

    function _coaName(code) {
        if (!code) return '';
        const a = _coaMap[code];
        return a ? `${a.code} — ${a.name}` : code;
    }

    // ── Parse NARRATION ───────────────────────────────────────────────────────
    function _parseNarration(entry) {
        try {
            const p = JSON.parse(entry.NARRATION || '{}');
            if (p.charges || p.grand_total !== undefined) return p;
        } catch (_) {}
        return null;
    }

    // ── List helpers ──────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        const label = _activeMode === 'receipts' ? 'code, client' : 'code, vendor';
        document.getElementById('vaultSearch').placeholder = `Search by ${label}, narration…`;
    }

    function _getEntries() {
        if (_activeMode === 'receipts') {
            return _allLedger.filter(e => e.DIRECTION === 'OUTWARD' && e.ENTRY_TYPE === 'PAYMENT');
        }
        return _allLedger.filter(e => e.DIRECTION === 'INWARD' && e.ENTRY_TYPE === 'PAYMENT');
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const entries = _getEntries();
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? entries.filter(e =>
                (e.CODE || '').toLowerCase().includes(q) ||
                (e.NARRATION || '').toLowerCase().includes(q) ||
                (e.PAYMENT_MODE || '').toLowerCase().includes(q) ||
                (e.CLIENT_NAME || '').toLowerCase().includes(q)
              )
            : entries;
        filtered.sort((a, b) => (b.ENTRY_DATE || 0) - (a.ENTRY_DATE || 0));

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No ${_activeMode} recorded yet.</li>`;
            return;
        }
        const label = _activeMode === 'receipts' ? '📥' : '📤';
        ul.innerHTML = filtered.slice(0, 50).map(e => {
            const amount = (+e.CREDIT || +e.DEBIT || 0);
            const statusColor = e.STATUS === 'ACTIVE' ? 'text-green-700' :
                                e.STATUS === 'PENDING' ? 'text-yellow-700' :
                                e.STATUS === 'VOID' ? 'text-red-700' : 'text-gray-700';
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-green-50 border border-gray-200 transition-colors">
                <strong class="text-green-700 block text-sm">${label} ${e.CLIENT_NAME || e.CODE || ''} — ₹${amount.toFixed(2)}</strong>
                <span class="text-xs text-gray-500">${e.PAYMENT_MODE || ''}${e.TXN_REF ? ' · ' + e.TXN_REF : ''}${e.CHEQUE_NUMBER ? ' · Chq#' + e.CHEQUE_NUMBER : ''}</span>
                <div class="text-xs mt-1">
                    <span class="${statusColor} font-medium">${e.STATUS || ''}</span>
                    <span class="text-gray-400"> · ${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''}</span>
                    <span class="text-gray-400"> · Bal: ₹${(+e.BALANCE||0).toFixed(2)}</span>
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

    function search() { _renderList(); }

    // ── Edit form (void-then-recreate) ───────────────────────────────────────
    function _openEditForm(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry) return;
        const isReceipt = entry.DIRECTION === 'OUTWARD';
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const entryDate = entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE, 'input') : new Date().toISOString().split('T')[0];
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">✏️ Edit ${isReceipt ? 'Receipt' : 'Payment'}</h3></div>
                <div class="detail-card-body">
                    <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">⚠️ Editing will void the current entry and create a replacement.</p>
                    <form id="rptEditForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Code *</label><input name="code" required class="form-input text-sm uppercase" value="${entry.CODE || ''}"></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label><input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" value="${(+entry.CREDIT||+entry.DEBIT||0).toFixed(2)}"></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Date *</label><input name="entry_date" type="date" required class="form-input text-sm" value="${entryDate}"></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Payment Mode *</label><select name="payment_mode" required class="form-input text-sm">
                            <option value="CASH" ${entry.PAYMENT_MODE === 'CASH' ? 'selected' : ''}>Cash</option>
                            <option value="CHEQUE" ${entry.PAYMENT_MODE === 'CHEQUE' ? 'selected' : ''}>Cheque</option>
                            <option value="NEFT" ${entry.PAYMENT_MODE === 'NEFT' ? 'selected' : ''}>NEFT</option>
                            <option value="UPI" ${entry.PAYMENT_MODE === 'UPI' ? 'selected' : ''}>UPI</option>
                            <option value="ADJUSTMENT" ${entry.PAYMENT_MODE === 'ADJUSTMENT' ? 'selected' : ''}>Adjustment</option>
                        </select></div>
                        <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 mb-1">Narration</label><input name="narration" class="form-input text-sm" value="${entry.NARRATION || ''}"></div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t gap-2">
                            <button type="button" onclick="VaultReceipts._rerenderDetail('${entry.ENTRY_ID}')" class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm">Save Changes</button>
                        </div>
                    </form>
                    <div id="rptEditResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;
        document.getElementById('rptEditForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const resp = document.getElementById('rptEditResponse');
            btn.disabled = true;
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                await callApi('/api/ledger/void', { entry_id: entry.ENTRY_ID, void_reason: 'Replaced by edit' }, 'POST');
                const endpoint = isReceipt ? '/api/ledger/payment' : '/api/ledger/inward/payment';
                const body = {
                    code: data.code,
                    entry_date: toMs(data.entry_date),
                    ...(isReceipt ? { credit: parseFloat(data.amount) } : { amount: parseFloat(data.amount) }),
                    payment_mode: data.payment_mode,
                    narration: data.narration || '',
                    cash_account: entry.CASH_ACCOUNT || '',
                    branch: entry.BRANCH || '',
                    ...(isReceipt ? {} : { vendor_type: entry.B2B_TYPE || entry.VENDOR_TYPE || 'B2B' }),
                };
                const res = await callApi(endpoint, body, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Updated. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');
                const appData = await getAppData();
                if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _renderList(); }
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally { btn.disabled = false; }
        });
        VaultPage.showDetailPane();
    }

    function _printEntry(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (entry) VaultPrint.printReceipt(entry, entry.DIRECTION === 'OUTWARD');
    }

    function _rerenderDetail(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (entry) _renderDetail(entry);
    }

    // ── Delete (void) ─────────────────────────────────────────────────────────
    async function _handleDelete(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry || entry.STATUS === 'VOID') return;
        const label = _activeMode === 'receipts' ? 'receipt' : 'payment';
        if (!confirm(`Delete this ${label}? Amount: ₹${(+entry.CREDIT||+entry.DEBIT||0).toFixed(2)}. This will void and recalculate balances.`)) return;
        const reason = prompt('Reason (optional):', '') || '';
        try {
            await callApi('/api/ledger/void', { entry_id: entryId, void_reason: reason }, 'POST');
            const appData = await getAppData();
            if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _renderList(); }
            document.getElementById('vaultDetailView').innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8"><div class="text-4xl mb-3">🗑️</div><p class="text-gray-500 text-sm">${label.charAt(0).toUpperCase() + label.slice(1)} deleted (voided).</p></div></div>`;
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    // ── Detail view ────────────────────────────────────────────────────────────
    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';
        const isReceipt = entry.DIRECTION === 'OUTWARD';
        const label = isReceipt ? 'Receipt' : 'Payment';
        const printBtn = `<button onclick="VaultReceipts._printEntry('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> Print</button>`;
        const editBtn = isActive ? `<button onclick="VaultReceipts._openEditForm('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Edit</button>` : '';
        const delBtn = isActive ? `<button onclick="VaultReceipts._handleDelete('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16\"/></svg> Delete</button>` : '';

        const buttonRow = [printBtn, editBtn, delBtn].filter(Boolean).join('');

        const amount = (+entry.CREDIT || +entry.DEBIT || 0);
        const mode = entry.PAYMENT_MODE || '';
        const coaDr = _coaName(entry.COA_DR);
        const coaCr = _coaName(entry.COA_CR);

        // Payment mode specific details
        let modeDetails = '';
        if (mode === 'CHEQUE') {
            modeDetails = `
                <div class="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                    <div class="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Cheque Details</div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div><span class="text-gray-500 text-xs">Cheque No:</span><br><span class="font-medium">${entry.CHEQUE_NUMBER || 'N/A'}</span></div>
                        <div><span class="text-gray-500 text-xs">Date:</span><br>${entry.CHEQUE_DATE ? fmtDate(entry.CHEQUE_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500 text-xs">Bank:</span><br>${entry.BANK_NAME || 'N/A'}</div>
                        <div><span class="text-gray-500 text-xs">Status:</span><br><span class="font-medium ${entry.CHEQUE_STATUS === 'CLEARED' ? 'text-green-600' : entry.CHEQUE_STATUS === 'BOUNCED' ? 'text-red-600' : 'text-yellow-600'}">${entry.CHEQUE_STATUS || 'PENDING'}</span></div>
                    </div>
                </div>`;
        } else if (mode === 'NEFT' || mode === 'UPI') {
            modeDetails = `
                <div class="bg-cyan-50/50 rounded-lg p-3 border border-cyan-100">
                    <div class="text-xs font-semibold text-cyan-600 uppercase tracking-wider mb-2">${mode} Details</div>
                    <div class="text-sm"><span class="text-gray-500">TXN Ref:</span> <span class="font-medium">${entry.TXN_REF || 'N/A'}</span></div>
                </div>`;
        }

        // Bank account info — shown independently of payment mode
        let bankAccountCard = '';
        if (entry.CASH_ACCOUNT) {
            bankAccountCard = `
                <div class="bg-gray-50/50 rounded-lg p-3 border border-gray-200">
                    <div class="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Bank Account</div>
                    <div class="text-sm"><span class="text-gray-500">Account:</span> <span class="font-medium">${entry.CASH_ACCOUNT}</span></div>
                    ${entry.BANK_NAME ? `<div class="text-sm"><span class="text-gray-500">Bank:</span> ${entry.BANK_NAME}</div>` : ''}
                </div>`;
        }

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">${label} Detail</h3>
                    <div class="flex gap-2 items-center">
                        ${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : ''}
                        <span class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">₹${amount.toFixed(2)}</span>
                        ${editBtn}${delBtn}
                    </div>
                </div>
                <div class="detail-card-body">
                    <!-- Header info -->
                    <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-3 rounded-lg">
                        <div><span class="text-gray-500">${isReceipt ? 'Client' : 'Vendor'}:</span> <span class="font-semibold">${entry.CLIENT_NAME || entry.CODE || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Status:</span> <span class="font-medium">${entry.STATUS || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Mode:</span> <span class="font-medium">${mode}</span></div>
                        <div><span class="text-gray-500">Branch:</span> ${entry.BRANCH_NAME || entry.BRANCH || 'N/A'}</div>
                        <div><span class="text-gray-500">Direction:</span> ${entry.DIRECTION || 'N/A'}</div>
                        <div><span class="text-gray-500">Amount:</span> ₹${amount.toFixed(2)}</div>
                        <div><span class="text-gray-500">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                    </div>

                    <!-- Payment mode details -->
                    ${modeDetails}

                    <!-- Bank account info -->
                    ${bankAccountCard}

                    <!-- COA mapping -->
                    <div class="text-xs text-gray-400 mt-2 flex gap-4">
                        <span>Dr: ${coaDr}</span>
                        <span>Cr: ${coaCr}</span>
                    </div>

                    <!-- Narration -->
                    ${entry.NARRATION ? `<div class="text-sm text-gray-700 mt-2 bg-white border rounded-lg p-3">📝 ${entry.NARRATION}</div>` : ''}

                    <!-- Audit info -->
                    <details class="mt-4">
                        <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Audit Info</summary>
                        <div class="grid grid-cols-2 gap-3 text-xs text-gray-500 mt-2 p-3 border rounded-lg">
                            <div>ID: ${entry.ENTRY_ID}</div>
                            <div>FY: ${entry.FY || 'N/A'}</div>
                            <div>Created: ${entry.USER_NAME || 'N/A'}</div>
                            <div>Staff: ${entry.STAFF_NAME || ''}</div>
                            ${entry.APPROVED_BY ? `<div>Approved: ${entry.APPROVED_BY}</div>` : ''}
                            ${entry.VOID_REASON ? `<div class="col-span-2 text-red-600">Void: ${entry.VOID_REASON}</div>` : ''}
                        </div>
                    </details>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Form for new payment ─────────────────────────────────────────────────
    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const isReceipt = _activeMode === 'receipts';
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${isReceipt ? '📥 Record Receipt' : '📤 Record Payment'}</h3></div>
                <div class="detail-card-body">
                    <form id="paymentForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                            <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="receiptCodeList">
                            <datalist id="receiptCodeList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="credit" type="number" step="0.01" min="0.01" required class="form-input text-sm" placeholder="0.00">
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
                            <label class="block text-xs font-medium text-gray-600 mb-1">Payment Mode *</label>
                            <select name="payment_mode" required class="form-input text-sm">
                                <option value="CASH">Cash</option>
                                <option value="CHEQUE">Cheque</option>
                                <option value="NEFT">NEFT</option>
                                <option value="UPI">UPI</option>
                                <option value="ADJUSTMENT">Adjustment</option>
                            </select>
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Bank Account <span class="text-gray-400">(${isReceipt ? 'destination' : 'source'})</span></label>
                            <select name="bank_account" class="form-input text-sm">
                                <option value="">— Select bank account —</option>
                            </select>
                        </div>
                        <div id="chequeFields" class="hidden sm:col-span-2 grid grid-cols-3 gap-3">
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Cheque No</label><input name="cheque_number" class="form-input text-sm"></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Cheque Date</label><input name="cheque_date" type="date" class="form-input text-sm"></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Bank Name</label><input name="bank_name" class="form-input text-sm"></div>
                        </div>
                        <div id="neftFields" class="hidden sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">TXN Ref</label>
                            <input name="txn_ref" class="form-input text-sm" placeholder="UTR / TXN ID">
                        </div>
                        ${isReceipt ? `` : `
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Vendor Type</label>
                            <select name="vendor_type" class="form-input text-sm">
                                <option value="B2B">B2B (Vendor)</option>
                                <option value="CARRIER">Carrier</option>
                            </select>
                        </div>`}
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration</label>
                            <input name="narration" class="form-input text-sm" placeholder="Optional description">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="payBtnText">Save ${isReceipt ? 'Receipt' : 'Payment'}</span>
                                <div id="paySpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="payResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate code datalist
        const dl = document.getElementById('receiptCodeList');
        _b2bMap.forEach((v, k) => {
            const opt = document.createElement('option');
            opt.value = k; opt.label = `${k} - ${v.B2B_NAME || ''}`;
            dl.appendChild(opt);
        });

        // Populate branch dropdown + bank account selector
        const bankAcctSelect = document.querySelector('select[name="bank_account"]');
        getAppData().then(data => {
            const branchSelect = document.querySelector('select[name="branch"]');
            if (branchSelect && data?.BRANCHES) {
                Object.values(data.BRANCHES).forEach(b => {
                    if (b.BRANCH_CODE) {
                        const opt = document.createElement('option');
                        opt.value = b.BRANCH_CODE;
                        opt.textContent = b.BRANCH_NAME || b.BRANCH_CODE;
                        branchSelect.appendChild(opt);
                    }
                });
            }

            // Populate bank account selector from branches + carriers with bank details
            if (bankAcctSelect && data) {
                const accs = [];
                if (data.BRANCHES) {
                    Object.values(data.BRANCHES).forEach(b => {
                        if (b.BRANCH_BANK_NAME || b.BRANCH_UPI) {
                            const label = `${b.BRANCH_BANK_NAME || 'N/A'} — ${b.BRANCH_NAME || b.BRANCH_CODE}${b.BRANCH_BANK_AC ? ' [' + b.BRANCH_BANK_AC + ']' : ''}`;
                            accs.push({ code: b.BRANCH_CODE, bank: b.BRANCH_BANK_NAME || '', label, type: 'Branch' });
                        }
                    });
                }
                if (data.CARRIERS) {
                    Object.values(data.CARRIERS).forEach(c => {
                        if (c.BANK_NAME || c.UPI) {
                            const label = `${c.BANK_NAME || 'N/A'} — ${c.COMPANY_NAME || c.COMPANY_CODE}${c.BANK_AC ? ' [' + c.BANK_AC + ']' : ''}`;
                            accs.push({ code: c.COMPANY_CODE, bank: c.BANK_NAME || '', label, type: 'Carrier' });
                        }
                    });
                }
                accs.sort((a, b) => a.label.localeCompare(b.label));
                accs.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.code;
                    opt.textContent = a.label;
                    opt.dataset.bank = a.bank;
                    bankAcctSelect.appendChild(opt);
                });

                // Event: when bank account selected, auto-fill bank_name
                bankAcctSelect.addEventListener('change', function() {
                    const selectedOpt = this.options[this.selectedIndex];
                    const bankNameInput = document.querySelector('[name="bank_name"]');
                    if (selectedOpt && selectedOpt.dataset.bank && bankNameInput) {
                        bankNameInput.value = selectedOpt.dataset.bank;
                    }
                });
            }
        });

        // Payment mode conditional fields
        document.querySelector('[name="payment_mode"]').addEventListener('change', e => {
            const v = e.target.value;
            document.getElementById('chequeFields').classList.toggle('hidden', v !== 'CHEQUE');
            document.getElementById('neftFields').classList.toggle('hidden', v !== 'NEFT' && v !== 'UPI');
            // Show bank account selector for non-ADJUSTMENT modes
            if (bankAcctSelect) {
                bankAcctSelect.closest('.sm\:col-span-2')?.classList.toggle('hidden', v === 'ADJUSTMENT');
            }
        });

        // Submit
        document.getElementById('paymentForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('paySpinner');
            const resp = document.getElementById('payResponse');
            btn.disabled = true; sp.classList.remove('hidden');

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                const endpoint = isReceipt ? '/api/ledger/payment' : '/api/ledger/inward/payment';
                const body = {
                    code: data.code,
                    entry_date: toMs(data.entry_date),
                    ...(isReceipt ? { credit: parseFloat(data.credit) } : { amount: parseFloat(data.credit) }),
                    payment_mode: data.payment_mode,
                    narration: data.narration || '',
                    branch: data.branch || '',
                    cash_account: data.bank_account || data.cash_account || '',
                    ...(isReceipt ? {} : { vendor_type: data.vendor_type || 'B2B' }),
                    ...(data.cheque_number ? { cheque_number: data.cheque_number, cheque_date: toMs(data.cheque_date), bank_name: data.bank_name } : {}),
                    ...(data.txn_ref ? { txn_ref: data.txn_ref } : {}),
                };
                const res = await callApi(endpoint, body, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ ${isReceipt ? 'Receipt' : 'Payment'} recorded. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _renderList(); }
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });

        // Set default date
        const d = document.querySelector('[name="entry_date"]');
        if (d) d.value = new Date().toISOString().split('T')[0];

        VaultPage.showDetailPane();
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();
        await _loadCoaCache();
        const data = await getAppData();
        if (data) {
            _allLedger = Object.values(data.LEDGER || {});
            _b2bMap.clear();
            if (data.B2B) Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
            _carrierMap.clear();
            if (data.CARRIERS) Object.values(data.CARRIERS).forEach(c => c.COMPANY_CODE && _carrierMap.set(c.COMPANY_CODE, c));
            _renderList();
        }
    }

    function setMode(mode) { _activeMode = mode; }

    return { load, search, openAddPane, setMode, _handleDelete, _rerenderDetail, _openEditForm, _printEntry };
})();

window.VaultReceipts = VaultReceipts;
