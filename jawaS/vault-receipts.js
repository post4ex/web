// ============================================================================
// VAULT-RECEIPTS.JS — Record payments received + view payment history
// Tiles: receipts, payments
// API: POST /api/ledger/payment, POST /api/ledger/inward/payment
// ============================================================================

const VaultReceipts = (() => {

    let _allLedger   = [];
    let _b2bMap      = new Map();
    let _carrierMap  = new Map();
    let _activeMode  = 'receipts'; // 'receipts' | 'payments'

    function _can(role) { return window.VaultPage?.can(role); }

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, narration…';
    }

    function _renderList(entries) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const filtered = entries.filter(e => {
            if (_activeMode === 'receipts') return e.DIRECTION === 'OUTWARD' && e.ENTRY_TYPE === 'PAYMENT';
            return e.DIRECTION === 'INWARD' && e.ENTRY_TYPE === 'PAYMENT';
        });
        filtered.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No ${_activeMode} recorded yet.</li>`;
            return;
        }
        ul.innerHTML = filtered.slice(0, 50).map(e => {
            const label = _activeMode === 'receipts' ? '📥' : '📤';
            const code = e.CODE || '';
            const mode = e.PAYMENT_MODE || '';
            const amount = e.CREDIT || e.DEBIT || 0;
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-green-50 border border-gray-200 transition-colors">
                <strong class="text-green-700 block text-sm">${label} ${code} — ₹${(+amount).toFixed(2)}</strong>
                <span class="text-xs text-gray-500">${mode} · ${e.NARRATION || ''}</span>
                <div class="text-xs text-gray-400 mt-1">${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''} · Balance: ₹${(+e.BALANCE||0).toFixed(2)}</div>
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

    function search(q) {
        const lq = q.toLowerCase();
        _renderList(_allLedger.filter(e =>
            (e.CODE || '').toLowerCase().includes(lq) ||
            (e.NARRATION || '').toLowerCase().includes(lq) ||
            (e.PAYMENT_MODE || '').toLowerCase().includes(lq)
        ));
    }

    // ── Detail pane ───────────────────────────────────────────────────────────
    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Payment Detail</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-500">Entry ID:</span> ${entry.ENTRY_ID || 'N/A'}</div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Client/Vendor:</span> ${entry.CODE || 'N/A'}</div>
                        <div><span class="text-gray-500">Payment Mode:</span> ${entry.PAYMENT_MODE || 'N/A'}</div>
                        <div><span class="text-gray-500">Amount:</span> ₹${(+entry.CREDIT || +entry.DEBIT || 0).toFixed(2)}</div>
                        <div><span class="text-gray-500">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">Direction:</span> ${entry.DIRECTION || 'N/A'}</div>
                        <div><span class="text-gray-500">Status:</span> ${entry.STATUS || 'N/A'}</div>
                        ${entry.TXN_REF ? `<div class="col-span-2"><span class="text-gray-500">TXN Ref:</span> ${entry.TXN_REF}</div>` : ''}
                        ${entry.CHEQUE_NUMBER ? `<div><span class="text-gray-500">Cheque No:</span> ${entry.CHEQUE_NUMBER}</div>` : ''}
                        ${entry.BANK_NAME ? `<div><span class="text-gray-500">Bank:</span> ${entry.BANK_NAME}</div>` : ''}
                        ${entry.NARRATION ? `<div class="col-span-2"><span class="text-gray-500">Narration:</span> ${entry.NARRATION}</div>` : ''}
                    </div>
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
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${isReceipt ? 'Record Receipt' : 'Record Payment'}</h3></div>
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
                        <div id="chequeFields" class="hidden sm:col-span-2 grid grid-cols-3 gap-3">
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Cheque No</label><input name="cheque_number" class="form-input text-sm"></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Cheque Date</label><input name="cheque_date" type="date" class="form-input text-sm"></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Bank Name</label><input name="bank_name" class="form-input text-sm"></div>
                        </div>
                        <div id="neftFields" class="hidden sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">TXN Ref</label>
                            <input name="txn_ref" class="form-input text-sm" placeholder="UTR / TXN ID">
                        </div>
                        ${isReceipt ? `
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Cash Account <span class="text-gray-400">(for CASH mode)</span></label>
                            <input name="cash_account" class="form-input text-sm" placeholder="e.g. BRANCH:DDN or STAFF:SC001">
                        </div>` : `
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
                                <span id="payBtnText">Save Payment</span>
                                <div id="paySpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="payResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate code datalist from B2B data
        const dl = document.getElementById('receiptCodeList');
        _b2bMap.forEach((v, k) => {
            const opt = document.createElement('option');
            opt.value = k; opt.label = `${k} - ${v.B2B_NAME || ''}`;
            dl.appendChild(opt);
        });

        // Payment mode conditional fields
        document.querySelector('[name="payment_mode"]').addEventListener('change', e => {
            const v = e.target.value;
            document.getElementById('chequeFields').classList.toggle('hidden', v !== 'CHEQUE');
            document.getElementById('neftFields').classList.toggle('hidden', v !== 'NEFT' && v !== 'UPI');
        });
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
                    credit: parseFloat(data.credit),
                    payment_mode: data.payment_mode,
                    narration: data.narration || '',
                    branch: '',
                    ...(isReceipt ? { cash_account: data.cash_account || '' } : { vendor_type: data.vendor_type || 'B2B' }),
                    ...(data.cheque_number ? { cheque_number: data.cheque_number, cheque_date: toMs(data.cheque_date), bank_name: data.bank_name } : {}),
                    ...(data.txn_ref ? { txn_ref: data.txn_ref } : {}),
                };
                const res = await callApi(endpoint, body, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ ${isReceipt ? 'Receipt' : 'Payment'} recorded. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');
                e.target.reset();
                // Refresh data
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

        // Set default date
        const d = document.querySelector('[name="entry_date"]');
        if (d) d.value = new Date().toISOString().split('T')[0];

        VaultPage.showDetailPane();
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data) {
            _allLedger = Object.values(data.LEDGER || {});
            _b2bMap.clear();
            if (data.B2B) Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
            _carrierMap.clear();
            if (data.CARRIERS) Object.values(data.CARRIERS).forEach(c => c.COMPANY_CODE && _carrierMap.set(c.COMPANY_CODE, c));
            _renderList(_allLedger);
        }
    }

    function setMode(mode) { _activeMode = mode; }

    return { load, search, openAddPane, setMode };
})();

window.VaultReceipts = VaultReceipts;
