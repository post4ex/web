// ============================================================================
// VAULT-CUSTOMERS.JS — Customers list from IDB B2B + LEDGER
// Tile: customers
// Data source: IDB B2B (list, balances), IDB LEDGER (statements)
// API:
//   POST /api/manager/receipts?code=XXX                   — record receipt
//   POST /api/manager/credit-notes?code=XXX               — issue credit note
//   GET  /api/manager/bank-accounts?code=XXX              — bank accounts dropdown
//   GET  /api/manager/cache/keys?categories=coa&code=XXX  — COA dropdown
// ============================================================================

const VaultCustomers = (() => {

    let _allB2B    = [];
    let _allLedger = [];
    let _b2bList   = [];   // for branch→clientCode resolution

    // ── Current report state ──────────────────────────────────────────────────
    let _currentCustomer    = null;
    let _currentCode        = null;
    let _currentStmtEntries = [];
    let _currentStmtBalance = 0;
    let _activeTab          = 'transactions';

    // ── Cache ────────────────────────────────────────────────────────────────
    let _balanceCache   = null;
    let _bankAcctsCache = {};  // clientCode → [{key, name, actualBalance}]
    let _coaCache       = {};  // clientCode → [{key, name}]

    // ── Filter state ─────────────────────────────────────────────────────────
    function getCurrentFYRange() {
        const now = new Date();
        const y = now.getFullYear();
        const sy = now.getMonth() < 3 ? y - 1 : y;
        return { start: `${sy}-04-01`, end: `${sy + 1}-03-31` };
    }
    const _fyRange = getCurrentFYRange();
    let _stmtFilterStart = _fyRange.start;
    let _stmtFilterEnd   = _fyRange.end;

    // ── Utilities ────────────────────────────────────────────────────────────
    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Parse NARRATION for charge breakdown ─────────────────────────────────
    function _parseNarration(entry) {
        try {
            const p = JSON.parse(entry.NARRATION || '{}');
            if (p.charges || p.grand_total !== undefined) return p;
        } catch (_) {}
        return null;
    }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, name, mobile…';
    }

    // ── Balance precomputation (LEDGER cache, for list view speed) ──────────
    function _precomputeBalances() {
        const cache = {};
        for (const entry of _allLedger) {
            if (!entry.CODE) continue;
            if (entry.ACCOUNT !== 'Accounts receivable') continue;
            
            const debit = +(entry.DEBIT || 0);
            const credit = +(entry.CREDIT || 0);
            if (!cache[entry.CODE]) cache[entry.CODE] = 0;
            cache[entry.CODE] += (debit - credit);
        }
        _balanceCache = cache;
    }

    function _getLatestBalance(code) {
        if (_balanceCache && code in _balanceCache) return _balanceCache[code];
        return 0;
    }

    function _getDisplayBalance(b2bEntry) {
        const opening = +(b2bEntry.BAL_LAST_FY || 0);
        const running = _balanceCache ? (_balanceCache[b2bEntry.CODE] || 0) : 0;
        return opening + running;
    }

    // ── Branch→client code resolution ───────────────────────────────────────
    function _getClientCodeForBranch(branch) {
        const b = branch?.toLowerCase();
        const found = _b2bList.find(c => (c.BRANCH || '').toLowerCase() === b);
        return found ? found.CODE : null;
    }

    function _getBranchForClientCode(code) {
        const found = _b2bList.find(c => c.CODE === code);
        return found ? (found.BRANCH || '') : '';
    }

    // ── Cache helpers ────────────────────────────────────────────────────────
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

    async function _ensureCoaAccounts(code) {
        if (_coaCache[code]) return _coaCache[code];
        try {
            const res = await callApi(`/api/manager/cache/keys?code=${encodeURIComponent(code)}&categories=coa`, {}, 'GET');
            const map = res.coa || {};
            const list = Object.entries(map).map(([name, key]) => ({ key, name }));
            _coaCache[code] = list;
            return list;
        } catch {
            _coaCache[code] = [];
            return [];
        }
    }

    function _getLocalLedgerFallback(code, start, end, direction = 'OUTWARD') {
        let localEntries = _allLedger.filter(e =>
            e.CODE === code && e.ACCOUNT === 'Accounts receivable'
        );
        if (start) {
            localEntries = localEntries.filter(e => _toDateStr(+e.TXN_DATE) >= start);
        }
        if (end) {
            localEntries = localEntries.filter(e => _toDateStr(+e.TXN_DATE) <= end);
        }
        localEntries.sort((a, b) =>
            (+a.TXN_DATE || 0) - (+b.TXN_DATE || 0) ||
            (a.TIME_STAMP || 0) - (b.TIME_STAMP || 0)
        );

        return localEntries.map(e => {
            const debit = +(e.DEBIT || 0);
            const credit = +(e.CREDIT || 0);

            return {
                date: _toDateStr(+e.TXN_DATE),
                ENTRY_DATE: _toDateStr(+e.TXN_DATE),
                description: e.DESCRIPTION || '',
                reference: e.DOX_REF || '',
                INV_NUMBER: e.DOX_REF || '',
                debit: debit,
                DEBIT: debit,
                credit: credit,
                CREDIT: credit,
                balance: 0,
                BALANCE: 0,
                ENTRY_TYPE: e.TXN_TYPE || (credit > 0 ? 'PAYMENT' : 'INVOICE'),
                STATUS: 'ACTIVE'
            };
        });
    }

    // ── Statement fetching from local LEDGER ────────────────────────────────
    function _fetchStatement(code, branch) {
        const start = document.getElementById('custStmtFilterStart')?.value || _stmtFilterStart;
        const end   = document.getElementById('custStmtFilterEnd')?.value   || _stmtFilterEnd;
        const entries = _getLocalLedgerFallback(code, start, end, 'OUTWARD');
        const balance = entries.length > 0 ? entries[entries.length - 1].balance : _getLatestBalance(code);
        return { entries, balance };
    }

    // ── List render (populated from IndexedDB B2B store directly) ───────────
    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const activeBranch = (VaultPage.getActiveBranch() || '').toLowerCase();
        if (!activeBranch) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">Please select a branch first.</li>`;
            return;
        }

        let customers = _allB2B.filter(c =>
            c.B2B_TYPE === 'CLIENT' &&
            (!activeBranch || (c.BRANCH || '').toLowerCase() === activeBranch)
        );

        if (q) {
            customers = customers.filter(c =>
                (c.CODE || '').toLowerCase().includes(q) ||
                (c.B2B_NAME || '').toLowerCase().includes(q) ||
                (c.MOBILE_NUMBER || '').toLowerCase().includes(q) ||
                (c.B2B_CITY || '').toLowerCase().includes(q)
            );
        }
        customers.sort((a, b) => {
            const balA = Math.abs(_getDisplayBalance(a));
            const balB = Math.abs(_getDisplayBalance(b));
            return balB - balA;
        });

        if (!customers.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No customers found.</li>`;
            const statusEl = document.getElementById('custListStatus');
            if (statusEl) statusEl.textContent = '0 customers';
            return;
        }

        // Update status
        const statusEl = document.getElementById('custListStatus');
        if (statusEl) statusEl.textContent = `${customers.length} customers`;

        ul.innerHTML = customers.map(c => {
            const balance = _getDisplayBalance(c);
            const balClass = balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-gray-500';
            return `<li data-code="${_escapeHtml(c.CODE)}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 border border-gray-200 transition-colors">
                <strong class="text-blue-800 block text-sm">${_escapeHtml(c.B2B_NAME || c.CODE)}</strong>
                <span class="text-xs text-gray-500">${_escapeHtml(c.CODE || '')} · ${_escapeHtml(c.MOBILE_NUMBER || 'No Mobile')} · ${_escapeHtml(c.B2B_CITY || 'No City')}</span>
                <div class="text-xs mt-1">
                    <span class="${balClass} font-medium">${balance > 0 ? '₹' + balance.toFixed(2) + ' due' : balance < 0 ? '₹' + Math.abs(balance).toFixed(2) + ' in credit' : '₹0.00'}</span>
                </div>
            </li>`;
        }).join('');

        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', async () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                const code = li.dataset.code;
                const customer = _allB2B.find(c => c.CODE === code) || { CODE: code, B2B_NAME: code, BRANCH: VaultPage.getActiveBranch() };
                try {
                    await _renderDetail(customer, code);
                } catch (err) {
                    console.error('[VaultCustomers] Error rendering detail:', err);
                }
            })
        );
    }

    function search() { _renderList(); }

    // ── Statement charge breakdown popup ────────────────────────────────────
    function _renderChargePopup(entry) {
        const parsed = _parseNarration(entry);
        if (!parsed) return '';
        const charges = parsed.charges || {};
        const chgNames = {
            fright: 'Freight', fuel_chg: 'Fuel', cod_chg: 'COD', topay_chg: 'ToPay',
            fov_chg: 'FOV', eway_chg: 'E-Way', awb_chg: 'AWB', pack_chg: 'Packing', dev_chg: 'Dev'
        };
        const chargeRows = Object.keys(chgNames)
            .filter(k => (charges[k] || 0) > 0)
            .map(k => `<div class="flex justify-between text-xs"><span class="text-gray-500">${chgNames[k]}</span><span>₹${(+charges[k]).toFixed(2)}</span></div>`)
            .join('');
        const total = (parsed.grand_total || 0);
        const taxAmt = (+parsed.sgst || 0) + (+parsed.cgst || 0) + (+parsed.igst || 0);
        return chargeRows ? `
            <div class="bg-gray-50 rounded p-2 mt-1 border text-xs space-y-0.5">
                ${chargeRows}
                ${taxAmt > 0 ? `<hr class="border-gray-200 my-0.5"><div class="flex justify-between text-xs"><span class="text-gray-500">Tax</span><span>₹${taxAmt.toFixed(2)}</span></div>` : ''}
                <hr class="border-gray-200 my-0.5">
                <div class="flex justify-between text-xs font-semibold"><span>Total</span><span>₹${total.toFixed(2)}</span></div>
            </div>` : '';
    }

    // ── Compute summary from statement ──────────────────────────────────────
    function _computeSummaryFromStatement(entries) {
        let totalDebit = 0, totalCredit = 0, invCount = 0, pmtCount = 0;
        for (const e of entries) {
            const d = +(e.debit || e.Debit || 0);
            const c = +(e.credit || e.Credit || 0);
            totalDebit  += d;
            totalCredit += c;
            if (d > 0) invCount++;
            if (c > 0) pmtCount++;
        }
        return {
            invoiceCount: invCount,
            paymentCount: pmtCount,
            totalInvoiced: totalDebit,
            totalPaid: totalCredit,
            balance: totalDebit - totalCredit
        };
    }

    // ── Record Receipt Modal ────────────────────────────────────────────────
    function _openRecordReceipt(code, customer) {
        const modalId = 'custReceiptModal';
        // Always rebuild modal HTML to avoid stale customer/branch data
        const existingModal = document.getElementById(modalId);
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay hidden';
        modal.innerHTML = `
            <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5">
                <div class="flex justify-between items-center border-b pb-3">
                    <h2 class="text-lg font-bold text-gray-800">📥 Record Receipt</h2>
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
                <form id="custReceiptForm_${code}" class="space-y-3">
                    <input type="hidden" name="customer_code" value="${_escapeHtml(code)}">
                    <div class="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Customer</label>
                            <input type="text" class="form-input text-xs bg-gray-50" value="${_escapeHtml(customer?.B2B_NAME || code)}" readonly>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Branch</label>
                            <input type="text" class="form-input text-xs bg-gray-50" value="${_escapeHtml(customer?.BRANCH || '')}" readonly>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Date *</label>
                            <input type="date" name="date" required class="form-input text-xs">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Amount (₹) *</label>
                            <input type="number" name="amount" step="0.01" min="0.01" required class="form-input text-xs" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Bank Account *</label>
                            <select name="bank_key" required class="form-input text-xs" id="custReceiptBank_${code}">
                                <option value="">Loading…</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Account</label>
                            <select name="account" class="form-input text-xs" id="custReceiptAcct_${code}">
                                <option value="">— Default —</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block font-semibold text-gray-600 mb-1 text-xs">Description</label>
                        <input name="description" class="form-input text-xs" placeholder="Optional narration">
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button type="button" onclick="document.getElementById('${modalId}').classList.add('hidden')" class="btn-ghost btn-sm">Cancel</button>
                        <button type="submit" class="btn btn-sm flex items-center gap-2">
                            <span>Record Receipt</span>
                            <div id="custReceiptSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        </button>
                    </div>
                </form>
                <div id="custReceiptResponse" class="hidden mt-2 p-3 rounded text-sm text-center"></div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

        // Set default date
        const dateInput = modal.querySelector('[name="date"]');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

        // Load bank accounts
        const clientCode = _getClientCodeForBranch(customer?.BRANCH);
        const bankSelect = document.getElementById(`custReceiptBank_${code}`);
        if (bankSelect) {
            bankSelect.innerHTML = '<option value="">Loading…</option>';
            bankSelect.disabled = true;
        }
        if (clientCode) {
            _ensureBankAccounts(clientCode).then(banks => {
                if (bankSelect) {
                    bankSelect.innerHTML = '<option value="">— Select Bank Account —</option>';
                    banks.forEach(b => {
                        const opt = document.createElement('option');
                        opt.value = b.key;
                        opt.textContent = `${b.name} (₹${(b.actualBalance?.value || 0).toFixed(2)})`;
                        bankSelect.appendChild(opt);
                    });
                    bankSelect.disabled = false;
                }
            });
            // Load COA for account dropdown
            const acctSelect = document.getElementById(`custReceiptAcct_${code}`);
            _ensureCoaAccounts(clientCode).then(coa => {
                if (acctSelect) {
                    const keywords = ['income', 'sales', 'revenue', 'received', 'freight'];
                    const filtered = coa.filter(a => keywords.some(k => a.name.toLowerCase().includes(k)));
                    acctSelect.innerHTML = '<option value="">— Default (Sales Income) —</option>';
                    filtered.forEach(a => {
                        const opt = document.createElement('option');
                        opt.value = a.key;
                        opt.textContent = a.name;
                        acctSelect.appendChild(opt);
                    });
                }
            });
        } else {
            if (bankSelect) {
                bankSelect.innerHTML = '<option value="">No branch client code found</option>';
                bankSelect.disabled = true;
            }
        }

        // Wire form submit
        const form = document.getElementById(`custReceiptForm_${code}`);
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(form);
            const data = Object.fromEntries(fd);
            const btn = form.querySelector('button[type=submit]');
            const sp = document.getElementById('custReceiptSpinner');
            const resp = document.getElementById('custReceiptResponse');
            btn.disabled = true;
            sp?.classList.remove('hidden');
            resp?.classList.add('hidden');

            const amount = parseFloat(data.amount);
            if (!amount || amount <= 0) {
                if (resp) { resp.className = 'mt-2 p-3 rounded text-sm text-center bg-red-100 text-red-800'; resp.textContent = '❌ Invalid amount.'; resp.classList.remove('hidden'); }
                btn.disabled = false; sp?.classList.add('hidden');
                return;
            }

            window.setLoading?.(true, 'Recording receipt…', 'detail');
            try {
                const payload = {
                    Date: data.date,
                    ReceivedIn: data.bank_key,
                    Customer: code,
                    Description: data.description || '',
                    Lines: [{ Amount: amount }]
                };
                if (data.account) payload.Lines[0].Account = data.account;

                const res = await callApi(`/api/manager/receipts?code=${encodeURIComponent(clientCode)}`, payload, 'POST');
                if (resp) {
                    resp.className = 'mt-2 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                    resp.textContent = `✅ Receipt recorded. Ref: ${res.Reference || 'done'}`;
                    resp.classList.remove('hidden');
                }
                document.getElementById(modalId)?.classList.add('hidden');
                if (customer) _renderDetail(customer, code);
            } catch (err) {
                if (resp) {
                    resp.className = 'mt-2 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                    resp.textContent = '❌ ' + (err.message || 'Failed to record receipt');
                    resp.classList.remove('hidden');
                }
            } finally {
                window.setLoading?.(false);
                btn.disabled = false;
                sp?.classList.add('hidden');
            }
        });

        modal.classList.remove('hidden');
    }

    // ── Issue Credit Note Modal ─────────────────────────────────────────────
    function _openIssueCreditNote(code, customer) {
        const modalId = 'custCreditNoteModal';
        // Always rebuild modal HTML to avoid stale customer/branch data
        const existingModal = document.getElementById(modalId);
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay hidden';
        modal.innerHTML = `
            <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5">
                <div class="flex justify-between items-center border-b pb-3">
                    <h2 class="text-lg font-bold text-gray-800">📝 Issue Credit Note</h2>
                    <button onclick="document.getElementById('${modalId}').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
                <form id="custCreditForm_${code}" class="space-y-3">
                    <input type="hidden" name="customer_code" value="${_escapeHtml(code)}">
                    <div class="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Customer</label>
                            <input type="text" class="form-input text-xs bg-gray-50" value="${_escapeHtml(customer?.B2B_NAME || code)}" readonly>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Branch</label>
                            <input type="text" class="form-input text-xs bg-gray-50" value="${_escapeHtml(customer?.BRANCH || '')}" readonly>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Date *</label>
                            <input type="date" name="date" required class="form-input text-xs">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Amount (₹) *</label>
                            <input type="number" name="amount" step="0.01" min="0.01" required class="form-input text-xs" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Account</label>
                            <select name="account" class="form-input text-xs" id="custCreditAcct_${code}">
                                <option value="">— Select Account —</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block font-semibold text-gray-600 mb-1 text-xs">Description</label>
                        <input name="description" class="form-input text-xs" placeholder="Reason for credit note">
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button type="button" onclick="document.getElementById('${modalId}').classList.add('hidden')" class="btn-ghost btn-sm">Cancel</button>
                        <button type="submit" class="btn btn-sm flex items-center gap-2">
                            <span>Issue Credit Note</span>
                            <div id="custCreditSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        </button>
                    </div>
                </form>
                <div id="custCreditResponse" class="hidden mt-2 p-3 rounded text-sm text-center"></div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

        const dateInput = modal.querySelector('[name="date"]');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

        const clientCode = _getClientCodeForBranch(customer?.BRANCH);
        const acctSelect = document.getElementById(`custCreditAcct_${code}`);
        if (acctSelect) {
            acctSelect.innerHTML = '<option value="">Loading…</option>';
        }

        if (clientCode) {
            _ensureCoaAccounts(clientCode).then(coa => {
                if (acctSelect) {
                    const keywords = ['income', 'sales', 'revenue', 'discount', 'adjustment', 'credit'];
                    const filtered = coa.filter(a => keywords.some(k => a.name.toLowerCase().includes(k)));
                    acctSelect.innerHTML = '<option value="">— Select Account (credit note) —</option>';
                    filtered.forEach(a => {
                        const opt = document.createElement('option');
                        opt.value = a.key;
                        opt.textContent = a.name;
                        acctSelect.appendChild(opt);
                    });
                }
            });
        }

        // Wire form submit
        const form = document.getElementById(`custCreditForm_${code}`);
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(form);
            const data = Object.fromEntries(fd);
            const btn = form.querySelector('button[type=submit]');
            const sp = document.getElementById('custCreditSpinner');
            const resp = document.getElementById('custCreditResponse');
            btn.disabled = true;
            sp?.classList.remove('hidden');
            resp?.classList.add('hidden');

            const amount = parseFloat(data.amount);
            if (!amount || amount <= 0) {
                if (resp) { resp.className = 'mt-2 p-3 rounded text-sm text-center bg-red-100 text-red-800'; resp.textContent = '❌ Invalid amount.'; resp.classList.remove('hidden'); }
                btn.disabled = false; sp?.classList.add('hidden');
                return;
            }

            window.setLoading?.(true, 'Issuing credit note…', 'detail');
            try {
                const line = { UnitPrice: amount };
                if (data.account) line.Account = data.account;

                const payload = {
                    Date: data.date,
                    Customer: code,
                    Description: data.description || '',
                    Lines: [line]
                };

                const res = await callApi(`/api/manager/credit-notes?code=${encodeURIComponent(clientCode)}`, payload, 'POST');
                if (resp) {
                    resp.className = 'mt-2 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                    resp.textContent = `✅ Credit note issued. Ref: ${res.Reference || 'done'}`;
                    resp.classList.remove('hidden');
                }
                document.getElementById(modalId)?.classList.add('hidden');
                if (customer) _renderDetail(customer, code);
            } catch (err) {
                if (resp) {
                    resp.className = 'mt-2 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                    resp.textContent = '❌ ' + (err.message || 'Failed to issue credit note');
                    resp.classList.remove('hidden');
                }
            } finally {
                window.setLoading?.(false);
                btn.disabled = false;
                sp?.classList.add('hidden');
            }
        });

        modal.classList.remove('hidden');
    }

    // ── Tab Rendering and Computations ────────────────────────────────────────
    function _calculateUnpaidInvoices(entries) {
        const invoices = [];
        let totalPayments = 0;

        entries.forEach(e => {
            const debit = +(e.debit || e.DEBIT || 0);
            const credit = +(e.credit || e.CREDIT || 0);
            if (debit > 0) {
                invoices.push({
                    date: e.date || e.ENTRY_DATE || '',
                    reference: e.reference || e.INV_NUMBER || '',
                    description: e.description || '',
                    amount: debit,
                    unpaid: debit
                });
            }
            totalPayments += credit;
        });

        let remainingPayments = totalPayments;
        for (const inv of invoices) {
            if (remainingPayments >= inv.unpaid) {
                remainingPayments -= inv.unpaid;
                inv.unpaid = 0;
            } else {
                inv.unpaid -= remainingPayments;
                remainingPayments = 0;
                break;
            }
        }
        return invoices.filter(inv => inv.unpaid > 0);
    }

    function _calculateAging(entries) {
        const invoices = _calculateUnpaidInvoices(entries);
        const today = new Date();
        const aging = { current: 0, thirty: 0, sixty: 0, ninety: 0, total: 0 };

        invoices.forEach(inv => {
            const invDate = new Date(inv.date);
            const diffTime = Math.abs(today - invDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 30) {
                aging.current += inv.unpaid;
            } else if (diffDays <= 60) {
                aging.thirty += inv.unpaid;
            } else if (diffDays <= 90) {
                aging.sixty += inv.unpaid;
            } else {
                aging.ninety += inv.unpaid;
            }
            aging.total += inv.unpaid;
        });
        return aging;
    }

    function _renderTabContent() {
        const container = document.getElementById('custStatementBody');
        if (!container) return;

        if (_activeTab === 'transactions') {
            container.innerHTML = _renderStatementTable(_currentStmtEntries, _currentStmtBalance);
        } else if (_activeTab === 'unpaid') {
            const unpaidInvoices = _calculateUnpaidInvoices(_currentStmtEntries);
            container.innerHTML = _renderUnpaidTable(unpaidInvoices);
        } else if (_activeTab === 'summary') {
            const summary = _computeSummaryFromStatement(_currentStmtEntries);
            container.innerHTML = _renderSummaryView(summary, _currentStmtBalance);
        } else if (_activeTab === 'aging') {
            const aging = _calculateAging(_currentStmtEntries);
            container.innerHTML = _renderAgingView(aging);
        }
    }

    function _renderUnpaidTable(unpaidInvoices) {
        if (!unpaidInvoices || !unpaidInvoices.length) {
            return `<div class="text-center py-8 text-gray-400 text-sm">No unpaid invoices found. All clear! 🎉</div>`;
        }

        const totalUnpaid = unpaidInvoices.reduce((s, e) => s + e.unpaid, 0);

        return `
            <div class="overflow-x-auto">
                <table class="min-w-full text-xs divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Date</th>
                            <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Invoice Ref</th>
                            <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Description</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Original Amount</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Unpaid / Due</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${unpaidInvoices.map(inv => {
                            return `<tr class="hover:bg-gray-50">
                                <td class="px-3 py-2 whitespace-nowrap">${inv.date ? fmtDate(inv.date, 'date') : ''}</td>
                                <td class="px-3 py-2 text-blue-800 font-medium">${_escapeHtml(inv.reference || '—')}</td>
                                <td class="px-3 py-2 max-w-[200px] truncate" title="${_escapeHtml(inv.description)}">${_escapeHtml(inv.description || '—')}</td>
                                <td class="px-3 py-2 text-right text-gray-600">₹${inv.amount.toFixed(2)}</td>
                                <td class="px-3 py-2 text-right font-bold text-red-600">₹${inv.unpaid.toFixed(2)}</td>
                            </tr>`;
                        }).join('')}
                        <tr class="bg-gray-50 font-bold text-gray-800">
                            <td class="px-3 py-2" colspan="3"></td>
                            <td class="px-3 py-2 text-right">Total Unpaid:</td>
                            <td class="px-3 py-2 text-right text-red-600">₹${totalUnpaid.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>`;
    }

    function _renderSummaryView(summary, outstanding) {
        return `
            <div class="p-6 space-y-6">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                        <div class="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Total Invoiced</div>
                        <div class="text-2xl font-bold text-blue-900">₹${summary.totalInvoiced.toFixed(2)}</div>
                        <div class="text-xs text-gray-500 mt-1">${summary.invoiceCount} invoices issued</div>
                    </div>
                    <div class="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                        <div class="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">Total Receipts</div>
                        <div class="text-2xl font-bold text-green-900">₹${summary.totalPaid.toFixed(2)}</div>
                        <div class="text-xs text-gray-500 mt-1">${summary.paymentCount} payments recorded</div>
                    </div>
                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                        <div class="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">Net Outstanding</div>
                        <div class="text-2xl font-bold ${outstanding > 0 ? 'text-red-700' : 'text-green-700'}">₹${outstanding.toFixed(2)}</div>
                        <div class="text-xs text-gray-500 mt-1">${outstanding > 0 ? 'Amount due from customer' : outstanding < 0 ? 'Credit balance' : 'Fully settled'}</div>
                    </div>
                </div>
                
                <div class="bg-gray-50 border rounded-xl p-4">
                    <h4 class="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Activity Breakdown</h4>
                    <div class="space-y-2 text-sm text-gray-600">
                        <div class="flex justify-between py-1 border-b">
                            <span>Average Invoice Value:</span>
                            <span class="font-medium text-gray-800">₹${summary.invoiceCount > 0 ? (summary.totalInvoiced / summary.invoiceCount).toFixed(2) : '0.00'}</span>
                        </div>
                        <div class="flex justify-between py-1 border-b">
                            <span>Average Payment Value:</span>
                            <span class="font-medium text-gray-800">₹${summary.paymentCount > 0 ? (summary.totalPaid / summary.paymentCount).toFixed(2) : '0.00'}</span>
                        </div>
                        <div class="flex justify-between py-1">
                            <span>Receipt/Invoice Ratio:</span>
                            <span class="font-medium text-gray-800">${summary.totalInvoiced > 0 ? ((summary.totalPaid / summary.totalInvoiced) * 100).toFixed(1) + '%' : '0.0%'}</span>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    function _renderAgingView(aging) {
        return `
            <div class="p-6 space-y-6">
                <div class="overflow-x-auto border rounded-xl bg-white shadow-sm">
                    <table class="min-w-full text-xs divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-center font-semibold text-gray-500 uppercase tracking-wider">Current (0-30 Days)</th>
                                <th class="px-4 py-3 text-center font-semibold text-gray-500 uppercase tracking-wider">30-60 Days</th>
                                <th class="px-4 py-3 text-center font-semibold text-gray-500 uppercase tracking-wider">60-90 Days</th>
                                <th class="px-4 py-3 text-center font-semibold text-gray-500 uppercase tracking-wider">Over 90 Days</th>
                                <th class="px-4 py-3 text-center font-bold text-gray-700 uppercase tracking-wider bg-gray-100">Total Outstanding</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 text-sm">
                            <tr class="hover:bg-gray-50 text-center font-medium">
                                <td class="px-4 py-4 text-green-600">₹${aging.current.toFixed(2)}</td>
                                <td class="px-4 py-4 text-amber-600">₹${aging.thirty.toFixed(2)}</td>
                                <td class="px-4 py-4 text-orange-600">₹${aging.sixty.toFixed(2)}</td>
                                <td class="px-4 py-4 text-red-600 font-bold">₹${aging.ninety.toFixed(2)}</td>
                                <td class="px-4 py-4 font-extrabold text-indigo-900 bg-indigo-50/50">₹${aging.total.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <div class="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 border">
                    💡 **Aging Method**: FIFO (First-In, First-Out) matching of receipts against oldest invoices. Outstandings are grouped by calendar age from the invoice date.
                </div>
            </div>`;
    }

    function setTab(tabName) {
        _activeTab = tabName;
        const tabs = ['transactions', 'unpaid', 'summary', 'aging'];
        tabs.forEach(t => {
            const btn = document.getElementById(`tab-${t}`);
            if (btn) {
                if (t === tabName) {
                    btn.className = 'py-2.5 px-3 text-center border-b-2 font-semibold text-xs border-indigo-500 text-indigo-600 transition-colors';
                } else {
                    btn.className = 'py-2.5 px-3 text-center border-b-2 font-semibold text-xs border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors';
                }
            }
        });
        _renderTabContent();
    }

    // ── Detail view ─────────────────────────────────────────────────────────
    async function _renderDetail(customer, code) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const branch = customer?.BRANCH || '';
        view.innerHTML = `<div class="text-center py-8"><div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>`;
        VaultPage.showDetailPane();

        // Fetch statement from Manager.io
        const { entries: stmtEntries, balance: stmtBalance } = _fetchStatement(code, branch);
        _currentCustomer = customer;
        _currentCode = code;
        _currentStmtEntries = stmtEntries;
        _currentStmtBalance = stmtBalance;

        // Compute summary from statement data
        let summary;
        if (stmtEntries.length > 0) {
            summary = _computeSummaryFromStatement(stmtEntries);
        } else {
            summary = { invoiceCount: 0, paymentCount: 0, totalInvoiced: 0, totalPaid: 0, balance: 0 };
        }
        const outstanding = stmtBalance || _getLatestBalance(code);

        // Find last transaction date from statement
        let lastDate = null;
        if (stmtEntries.length > 0) {
            const lastEntry = stmtEntries[stmtEntries.length - 1];
            lastDate = lastEntry.date || lastEntry.Date || null;
        }

        view.innerHTML = `
            <div class="space-y-4">
                <!-- Summary Bar -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div class="text-xs text-gray-500 uppercase tracking-wider">Outstanding</div>
                        <div class="text-lg font-bold ${outstanding > 0 ? 'text-red-600' : outstanding < 0 ? 'text-green-600' : 'text-gray-700'}">₹${outstanding.toFixed(2)}</div>
                    </div>
                    <div class="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div class="text-xs text-gray-500 uppercase tracking-wider">Invoices</div>
                        <div class="text-lg font-bold text-blue-700">${summary.invoiceCount}</div>
                    </div>
                    <div class="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div class="text-xs text-gray-500 uppercase tracking-wider">Receipts</div>
                        <div class="text-lg font-bold text-green-700">${summary.paymentCount}</div>
                    </div>
                    <div class="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div class="text-xs text-gray-500 uppercase tracking-wider">Total Charged</div>
                        <div class="text-lg font-bold text-gray-700">₹${summary.totalInvoiced.toFixed(2)}</div>
                    </div>
                </div>

                <!-- Customer Detail Card -->
                <div class="detail-card">
                    <div class="detail-card-header flex flex-wrap justify-between items-center gap-2">
                        <h3 class="font-semibold text-gray-700">${_escapeHtml(customer?.B2B_NAME || code)}</h3>
                        <div class="flex flex-wrap gap-2 relative">
                            <div class="relative inline-block text-left" id="custPrintDropdown">
                                <button onclick="event.stopPropagation(); document.getElementById('custPrintMenu').classList.toggle('hidden')" class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1 border">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> 🖨️ Print Report...
                                </button>
                                <div id="custPrintMenu" class="hidden absolute right-0 mt-1 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50 divide-y divide-gray-100 border border-gray-100">
                                    <div class="py-1">
                                        <button onclick="VaultCustomers._printStatement('${_escapeHtml(code)}')" class="group flex items-center px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left font-medium">
                                            📝 Statements (Transactions)
                                        </button>
                                        <button onclick="VaultCustomers._printUnpaidStatement('${_escapeHtml(code)}')" class="group flex items-center px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left font-medium">
                                            ❌ Statements (Unpaid Invoices)
                                        </button>
                                    </div>
                                    <div class="py-1">
                                        <button onclick="VaultCustomers._printCustomerSummary('${_escapeHtml(code)}')" class="group flex items-center px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left font-medium">
                                            📊 Customer Summary
                                        </button>
                                        <button onclick="VaultCustomers._printAgedReceivables('${_escapeHtml(code)}')" class="group flex items-center px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left font-medium">
                                            ⏳ Aged Receivables
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="detail-card-body">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <!-- Left: Basic Info -->
                            <div class="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                                <div class="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Basic Info</div>
                                <div class="grid grid-cols-2 gap-2 text-sm">
                                    <div><span class="text-gray-500 text-xs">Code:</span><br><span class="font-medium">${_escapeHtml(code)}</span></div>
                                    <div><span class="text-gray-500 text-xs">GST:</span><br><span class="font-mono text-xs">${_escapeHtml(customer?.ID_GST_PAN_ADHAR || 'N/A')}</span></div>
                                    <div><span class="text-gray-500 text-xs">Phone:</span><br>${_escapeHtml(customer?.MOBILE_NUMBER || 'N/A')}</div>
                                    <div><span class="text-gray-500 text-xs">Email:</span><br>${_escapeHtml(customer?.EMAIL || customer?.B2B_EMAIL || 'N/A')}</div>
                                    <div><span class="text-gray-500 text-xs">State Code:</span><br>${_escapeHtml(customer?.CODE_STATE || customer?.STATE_CODE || 'N/A')}</div>
                                    <div><span class="text-gray-500 text-xs">PIN Code:</span><br>${_escapeHtml(customer?.PIN_CODE || customer?.B2B_PIN || 'N/A')}</div>
                                    <div><span class="text-gray-500 text-xs">Branch:</span><br>${_escapeHtml(customer?.BRANCH || 'N/A')}</div>
                                    <div><span class="text-gray-500 text-xs">Contact:</span><br>${_escapeHtml(customer?.CONTACT_PERSON || customer?.B2B_CONTACT || 'N/A')}</div>
                                </div>
                            </div>
                            <!-- Right: Address & Terms -->
                            <div class="space-y-3">
                                <div class="bg-green-50/50 rounded-lg p-3 border border-green-100">
                                    <div class="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Address</div>
                                    <div class="text-sm text-gray-700">${_escapeHtml(customer?.B2B_ADDRESS || 'N/A')}</div>
                                    <div class="text-sm text-gray-500">${[customer?.B2B_CITY, customer?.B2B_STATE, customer?.B2B_PIN].filter(Boolean).join(', ') || ''}</div>
                                </div>
                                <div class="bg-purple-50/50 rounded-lg p-3 border border-purple-100">
                                    <div class="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">Terms</div>
                                    <div class="grid grid-cols-2 gap-2 text-xs">
                                        <div><span class="text-gray-500">Payment Terms:</span><br><span class="font-medium">${_escapeHtml(customer?.PAYMENT_TERMS || customer?.CREDIT_TERMS || 'Standard')}</span></div>
                                        <div><span class="text-gray-500">Credit Limit:</span><br><span class="font-medium">${customer?.CREDIT_LIMIT ? '₹' + (+customer.CREDIT_LIMIT).toFixed(2) : 'Unlimited'}</span></div>
                                        <div><span class="text-gray-500">B2B Type:</span><br><span class="font-medium">${_escapeHtml(customer?.B2B_TYPE || 'N/A')}</span></div>
                                        <div><span class="text-gray-500">Status:</span><br><span class="font-medium ${customer?.ACTIVE_STATUS === 'ACTIVE' ? 'text-green-600' : 'text-red-600'}">${_escapeHtml(customer?.ACTIVE_STATUS || 'ACTIVE')}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Quick Entry Buttons -->
                        <div class="mt-4 flex flex-wrap gap-2">
                            <button onclick="VaultCustomers._openRecordReceipt('${_escapeHtml(code)}', window.VaultCustomers._getCustomer('${_escapeHtml(code)}'))"
                                class="px-4 py-2 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 shadow-sm">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                                📥 Record Receipt
                            </button>
                            <button onclick="VaultCustomers._openIssueCreditNote('${_escapeHtml(code)}', window.VaultCustomers._getCustomer('${_escapeHtml(code)}'))"
                                class="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                📝 Issue Credit Note
                            </button>
                        </div>

                        <!-- Last Activity -->
                        <div class="mt-3 text-xs text-gray-400">
                            Last transaction: ${lastDate ? fmtDate(lastDate, 'date') : 'N/A'}
                            · Total charged: ₹${summary.totalInvoiced.toFixed(2)}
                            · Total received: ₹${summary.totalPaid.toFixed(2)}
                        </div>
                    </div>
                </div>

                <!-- Statement Card -->
                <div class="detail-card">
                    <div class="detail-card-header flex flex-wrap justify-between items-center gap-2">
                        <h3 class="font-semibold text-gray-700">Customer Reports</h3>
                        <div class="flex flex-wrap items-center gap-2 text-xs">
                            <input type="date" id="custStmtFilterStart" class="form-input text-xs w-32" value="${_stmtFilterStart}">
                            <span class="text-gray-400">—</span>
                            <input type="date" id="custStmtFilterEnd" class="form-input text-xs w-32" value="${_stmtFilterEnd}">
                            <button id="custStmtApplyBtn" class="btn btn-xs">Apply</button>
                            <button id="custStmtResetBtn" class="btn-ghost btn-xs">Reset</button>
                        </div>
                    </div>
                    
                    <!-- Tabs Navigation -->
                    <div class="border-b border-gray-200 bg-gray-50/50">
                        <nav class="flex -mb-px px-2" aria-label="Tabs">
                            <button id="tab-transactions" onclick="VaultCustomers.setTab('transactions')" class="py-2.5 px-3 text-center border-b-2 font-semibold text-xs transition-colors ${_activeTab === 'transactions' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">
                                Statements (Transactions)
                            </button>
                            <button id="tab-unpaid" onclick="VaultCustomers.setTab('unpaid')" class="py-2.5 px-3 text-center border-b-2 font-semibold text-xs transition-colors ${_activeTab === 'unpaid' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">
                                Statements (Unpaid Invoices)
                            </button>
                            <button id="tab-summary" onclick="VaultCustomers.setTab('summary')" class="py-2.5 px-3 text-center border-b-2 font-semibold text-xs transition-colors ${_activeTab === 'summary' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">
                                Customer Summary
                            </button>
                            <button id="tab-aging" onclick="VaultCustomers.setTab('aging')" class="py-2.5 px-3 text-center border-b-2 font-semibold text-xs transition-colors ${_activeTab === 'aging' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">
                                Aged Receivables
                            </button>
                        </nav>
                    </div>

                    <div class="detail-card-body p-0">
                        <div id="custStatementBody">
                            <!-- Populated dynamically by _renderTabContent() -->
                        </div>
                    </div>
                </div>
            </div>`;

        // Wire statement filter buttons
        const applyBtn = document.getElementById('custStmtApplyBtn');
        const resetBtn = document.getElementById('custStmtResetBtn');
        if (applyBtn) {
            applyBtn.onclick = async () => {
                _stmtFilterStart = document.getElementById('custStmtFilterStart').value;
                _stmtFilterEnd = document.getElementById('custStmtFilterEnd').value;
                const { entries: newEntries, balance: newBal } = _fetchStatement(code, branch);
                _currentStmtEntries = newEntries;
                _currentStmtBalance = newBal;
                _renderTabContent();
            };
        }
        if (resetBtn) {
            resetBtn.onclick = async () => {
                const fy = getCurrentFYRange();
                document.getElementById('custStmtFilterStart').value = fy.start;
                document.getElementById('custStmtFilterEnd').value = fy.end;
                _stmtFilterStart = fy.start;
                _stmtFilterEnd = fy.end;
                const { entries: newEntries, balance: newBal } = _fetchStatement(code, branch);
                _currentStmtEntries = newEntries;
                _currentStmtBalance = newBal;
                _renderTabContent();
            };
        }

        // Render the active tab content initially
        _renderTabContent();

        VaultPage.showDetailPane();
    }

    // ── Statement table render ──────────────────────────────────────────────
    function _renderStatementTable(entries, balance) {
        if (!entries || !entries.length) {
            return `<div class="text-center py-8 text-gray-400 text-sm">No statement entries found for the selected period.</div>`;
        }

        // Use BAL_LAST_FY as opening balance (as of March 31)
        const b2bEntry = _allB2B.find(b => b.CODE === _currentCode);
        const openingBalance = +(b2bEntry?.BAL_LAST_FY || 0);

        let runningBalance = openingBalance;
        const rowsHtml = entries.map(e => {
            const date = e.date || e.Date || '';
            const desc = e.description || e.Description || '';
            const ref = e.transaction || e.reference || e.Reference || '';
            const debit = +(e.debit || e.Debit || 0);
            const credit = +(e.credit || e.Credit || 0);
            runningBalance += (debit - credit);
            return `<tr class="hover:bg-gray-50">
                <td class="px-3 py-2 whitespace-nowrap">${date ? fmtDate(date, 'date') : ''}</td>
                <td class="px-3 py-2 max-w-[200px] truncate" title="${_escapeHtml(desc)}">${_escapeHtml(desc || '—')}</td>
                <td class="px-3 py-2 text-gray-500">${_escapeHtml(ref)}</td>
                <td class="px-3 py-2 text-right text-red-600">${debit > 0 ? '₹' + debit.toFixed(2) : ''}</td>
                <td class="px-3 py-2 text-right text-green-600">${credit > 0 ? '₹' + credit.toFixed(2) : ''}</td>
                <td class="px-3 py-2 text-right font-medium">₹${runningBalance.toFixed(2)}</td>
            </tr>`;
        }).join('');

        return `
            <div class="overflow-x-auto">
                <table class="min-w-full text-xs divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Date</th>
                            <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Description</th>
                            <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Ref</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Debit</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Credit</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Balance</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${openingBalance !== 0 ? `
                        <tr class="bg-gray-50 text-gray-500">
                            <td class="px-3 py-2" colspan="4"></td>
                            <td class="px-3 py-2 text-right font-medium">Opening</td>
                            <td class="px-3 py-2 text-right font-medium">₹${openingBalance.toFixed(2)}</td>
                        </tr>` : ''}
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>`;
    }

    // ── Print statement (uses live Manager.io statement data) ───────────────
    async function _printStatement(code) {
        const customer = _allB2B.find(c => c.CODE === code) || { CODE: code, B2B_NAME: code };
        const branch = customer.BRANCH || '';
        const { entries: stmtEntries, balance: stmtBalance } = _fetchStatement(code, branch);

        VaultPrint.printStatement(customer, code, stmtEntries, stmtBalance, 'Customer');
    }

    // ── Print statement (unpaid invoices) ──────────────────────────────────
    async function _printUnpaidStatement(code) {
        const customer = _allB2B.find(c => c.CODE === code) || { CODE: code, B2B_NAME: code };
        const branch = customer.BRANCH || '';
        const { entries: stmtEntries } = _fetchStatement(code, branch);

        const invoices = [];
        let totalPayments = 0;

        stmtEntries.forEach(e => {
            const debit = +(e.debit || e.DEBIT || 0);
            const credit = +(e.credit || e.CREDIT || 0);
            if (debit > 0) {
                invoices.push({
                    date: e.date || e.ENTRY_DATE || '',
                    reference: e.reference || e.INV_NUMBER || '',
                    amount: debit,
                    unpaid: debit
                });
            }
            totalPayments += credit;
        });

        let remainingPayments = totalPayments;
        for (const inv of invoices) {
            if (remainingPayments >= inv.unpaid) {
                remainingPayments -= inv.unpaid;
                inv.unpaid = 0;
            } else {
                inv.unpaid -= remainingPayments;
                remainingPayments = 0;
                break;
            }
        }

        const unpaidEntries = invoices.filter(inv => inv.unpaid > 0).map(inv => {
            return {
                ENTRY_DATE: inv.date,
                ENTRY_TYPE: 'INVOICE',
                INV_NUMBER: inv.reference,
                DEBIT: inv.amount,
                CREDIT: 0,
                BALANCE: inv.unpaid,
                STATUS: 'ACTIVE'
            };
        });

        const totalUnpaid = unpaidEntries.reduce((s, e) => s + e.BALANCE, 0);
        VaultPrint.printStatement(customer, code, unpaidEntries, totalUnpaid, 'Unpaid Invoices');
    }

    // ── Print customer summary ──────────────────────────────────────────────
    async function _printCustomerSummary(code) {
        const customer = _allB2B.find(c => c.CODE === code) || { CODE: code, B2B_NAME: code };
        const branch = customer.BRANCH || '';
        const { entries: stmtEntries, balance: stmtBalance } = _fetchStatement(code, branch);

        let summary;
        if (stmtEntries.length > 0) {
            summary = _computeSummaryFromStatement(stmtEntries);
        } else {
            summary = { invoiceCount: 0, paymentCount: 0, totalInvoiced: 0, totalPaid: 0, balance: 0 };
        }
        VaultPrint.printCustomerSummary(customer, code, summary, stmtBalance, 'Customer');
    }

    // ── Print aged receivables (FIFO aging calculation) ─────────────────────
    async function _printAgedReceivables(code) {
        const customer = _allB2B.find(c => c.CODE === code) || { CODE: code, B2B_NAME: code };
        const branch = customer.BRANCH || '';
        const { entries: stmtEntries } = _fetchStatement(code, branch);

        const invoices = [];
        let totalPayments = 0;

        stmtEntries.forEach(e => {
            const debit = +(e.debit || e.DEBIT || 0);
            const credit = +(e.credit || e.CREDIT || 0);
            if (debit > 0) {
                invoices.push({
                    date: e.date || e.ENTRY_DATE || '',
                    reference: e.reference || e.INV_NUMBER || '',
                    amount: debit,
                    unpaid: debit
                });
            }
            totalPayments += credit;
        });

        let remainingPayments = totalPayments;
        for (const inv of invoices) {
            if (remainingPayments >= inv.unpaid) {
                remainingPayments -= inv.unpaid;
                inv.unpaid = 0;
            } else {
                inv.unpaid -= remainingPayments;
                remainingPayments = 0;
                break;
            }
        }

        const today = new Date();
        const aging = { current: 0, thirty: 0, sixty: 0, ninety: 0, total: 0 };

        invoices.filter(inv => inv.unpaid > 0).forEach(inv => {
            const invDate = new Date(inv.date);
            const diffTime = Math.abs(today - invDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 30) {
                aging.current += inv.unpaid;
            } else if (diffDays <= 60) {
                aging.thirty += inv.unpaid;
            } else if (diffDays <= 90) {
                aging.sixty += inv.unpaid;
            } else {
                aging.ninety += inv.unpaid;
            }
            aging.total += inv.unpaid;
        });

        VaultPrint.printAgedReceivables(customer, code, aging, 'Aged Receivables');
    }

    // Register click outside print dropdown close handler
    window.addEventListener('click', () => {
        const menu = document.getElementById('custPrintMenu');
        if (menu) menu.classList.add('hidden');
    });

    // ── Helper to get customer object ───────────────────────────────────────
    function _getCustomer(code) {
        return _allB2B.find(c => c.CODE === code) || null;
    }

    // ── Inject status and filter UI into list pane ──────────────────────────
    function _injectUI() {
        // Status counter
        if (!document.getElementById('custListStatus')) {
            const statusEl = document.createElement('p');
            statusEl.id = 'custListStatus';
            statusEl.className = 'text-xs text-gray-500 px-4 pt-2 text-center font-medium';
            statusEl.textContent = 'Loading...';
            const listContainer = document.getElementById('vaultList')?.parentElement;
            listContainer?.insertBefore(statusEl, document.getElementById('vaultList'));
        }
    }

    // ── Load ────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();

        if (!window.__vaultCacheKeys) {
            try {
                window.__vaultCacheKeys = await callApi('/api/manager/cache/keys', {}, 'GET');
            } catch (e) {
                console.error('[VaultCustomers] Failed to fetch cache keys:', e);
                window.__vaultCacheKeys = {};
            }
        }

        const data = await getAppData();
        if (data) {
            _allB2B    = Object.values(data.B2B    || {});
            _allLedger = Object.values(data.LEDGER || {});
            _b2bList   = _allB2B.filter(c => c.CODE);
            _precomputeBalances();
            _injectUI();
            _renderList();
        }
    }

    return {
        load,
        search,
        setTab,
        _printStatement,
        _getCustomer,
        _openRecordReceipt,
        _openIssueCreditNote,
        _renderDetail,
    };
})();

window.VaultCustomers = VaultCustomers;
