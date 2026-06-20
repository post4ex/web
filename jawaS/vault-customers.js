// ============================================================================
// VAULT-CUSTOMERS.JS — Customers list with Manager.io statement & quick entries
// Tile: customers
// Data source: appData.B2B (list), Manager.io API (statement)
// API:
//   GET  /api/manager/customer-statement/{branch}/{code}  — statement entries
//   POST /api/manager/receipts?code=XXX                   — record receipt
//   POST /api/manager/credit-notes?code=XXX               — issue credit note
//   GET  /api/manager/bank-accounts?code=XXX              — bank accounts dropdown
//   GET  /api/manager/cache/keys?categories=coa&code=XXX  — COA dropdown
// ============================================================================

const VaultCustomers = (() => {

    let _allB2B    = [];
    let _allLedger = [];
    let _b2bList   = [];   // for branch→clientCode resolution

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
        const sorted = [..._allLedger]
            .filter(e => e.DIRECTION === 'OUTWARD' && (e.STATUS === 'ACTIVE' || e.STATUS === 'PENDING'))
            .sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        for (const e of sorted) {
            const code = e.CODE;
            if (code && !(code in cache)) {
                cache[code] = +e.BALANCE || 0;
            }
        }
        _balanceCache = cache;
    }

    function _getLatestBalance(code) {
        if (_balanceCache && code in _balanceCache) return _balanceCache[code];
        return 0;
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

    // ── Statement fetching from Manager.io API ──────────────────────────────
    async function _fetchStatement(code, branch) {
        const start = document.getElementById('custStmtFilterStart')?.value || _stmtFilterStart;
        const end   = document.getElementById('custStmtFilterEnd')?.value   || _stmtFilterEnd;
        const clientCode = _getClientCodeForBranch(branch);
        if (!clientCode) return { entries: [], balance: 0 };

        const params = new URLSearchParams();
        if (start) params.set('startDate', start);
        if (end)   params.set('endDate', end);

        window.setLoading?.(true, 'Loading statement…', 'detail');
        try {
            const url = `/api/manager/customer-statement/${encodeURIComponent(branch)}/${encodeURIComponent(code)}?${params.toString()}`;
            const res = await callApi(url, {}, 'GET');
            const entries = res.statement || res.transactions || [];
            const balance = entries.length > 0 ? (entries[entries.length - 1].balance || 0) : 0;
            return { entries, balance };
        } catch (err) {
            console.error('[VaultCustomers] Failed to fetch statement:', err);
            return { entries: [], balance: 0 };
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── List render ──────────────────────────────────────────────────────────
    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        let customers = _allB2B.filter(c => c.CODE && c.B2B_TYPE !== 'VENDOR');
        const activeBranch = VaultPage.getActiveBranch();
        if (activeBranch) {
            customers = customers.filter(c => (c.BRANCH || '').toLowerCase() === activeBranch.toLowerCase());
        }
        if (q) {
            customers = customers.filter(c =>
                (c.CODE || '').toLowerCase().includes(q) ||
                (c.B2B_NAME || '').toLowerCase().includes(q) ||
                (c.MOBILE_NUMBER || '').toLowerCase().includes(q) ||
                (c.B2B_CITY || '').toLowerCase().includes(q)
            );
        }
        customers.sort((a, b) => {
            const balA = Math.abs(_getLatestBalance(a.CODE));
            const balB = Math.abs(_getLatestBalance(b.CODE));
            return balB - balA;
        });

        if (!customers.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No customers found.</li>`;
            return;
        }

        // Update status
        const statusEl = document.getElementById('custListStatus');
        if (statusEl) statusEl.textContent = `${customers.length} customers`;

        ul.innerHTML = customers.map(c => {
            const balance = _getLatestBalance(c.CODE);
            const balClass = balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-gray-500';
            return `<li data-code="${_escapeHtml(c.CODE)}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 border border-gray-200 transition-colors">
                <strong class="text-blue-800 block text-sm">${_escapeHtml(c.B2B_NAME || c.CODE)}</strong>
                <span class="text-xs text-gray-500">${_escapeHtml(c.CODE || '')} · ${_escapeHtml(c.MOBILE_NUMBER || '')} · ${_escapeHtml(c.B2B_CITY || '')}</span>
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
                const customer = _allB2B.find(c => c.CODE === code);
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

    // ── Detail view ─────────────────────────────────────────────────────────
    async function _renderDetail(customer, code) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const branch = customer?.BRANCH || '';
        view.innerHTML = `<div class="text-center py-8"><div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>`;
        VaultPage.showDetailPane();

        // Fetch statement from Manager.io
        const { entries: stmtEntries, balance: stmtBalance } = await _fetchStatement(code, branch);

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
                        <div class="flex flex-wrap gap-2">
                            <button onclick="VaultCustomers._printStatement('${_escapeHtml(code)}')" class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> Print
                            </button>
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
                        <h3 class="font-semibold text-gray-700">Statement (${stmtEntries.length} entries)</h3>
                        <div class="flex flex-wrap items-center gap-2 text-xs">
                            <input type="date" id="custStmtFilterStart" class="form-input text-xs w-32" value="${_stmtFilterStart}">
                            <span class="text-gray-400">—</span>
                            <input type="date" id="custStmtFilterEnd" class="form-input text-xs w-32" value="${_stmtFilterEnd}">
                            <button id="custStmtApplyBtn" class="btn btn-xs">Apply</button>
                            <button id="custStmtResetBtn" class="btn-ghost btn-xs">Reset</button>
                        </div>
                    </div>
                    <div class="detail-card-body p-0">
                        <div id="custStatementBody">
                            ${_renderStatementTable(stmtEntries, outstanding)}
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
                const { entries: newEntries, balance: newBal } = await _fetchStatement(code, branch);
                document.getElementById('custStatementBody').innerHTML = _renderStatementTable(newEntries, newBal);
                // Update header count
                const h3 = view.querySelector('.detail-card:last-child .detail-card-header h3');
                if (h3) h3.textContent = `Statement (${newEntries.length} entries)`;
            };
        }
        if (resetBtn) {
            resetBtn.onclick = async () => {
                const fy = getCurrentFYRange();
                document.getElementById('custStmtFilterStart').value = fy.start;
                document.getElementById('custStmtFilterEnd').value = fy.end;
                _stmtFilterStart = fy.start;
                _stmtFilterEnd = fy.end;
                const { entries: newEntries, balance: newBal } = await _fetchStatement(code, branch);
                document.getElementById('custStatementBody').innerHTML = _renderStatementTable(newEntries, newBal);
                const h3 = view.querySelector('.detail-card:last-child .detail-card-header h3');
                if (h3) h3.textContent = `Statement (${newEntries.length} entries)`;
            };
        }

        VaultPage.showDetailPane();
    }

    // ── Statement table render ──────────────────────────────────────────────
    function _renderStatementTable(entries, balance) {
        if (!entries || !entries.length) {
            return `<div class="text-center py-8 text-gray-400 text-sm">No statement entries found for the selected period.</div>`;
        }

        // Compute opening balance (balance of first entry minus its own debit+credit)
        const first = entries[0];
        let openingBalance = 0;
        if (first) {
            const firstDebit = +(first.debit || first.Debit || 0);
            const firstCredit = +(first.credit || first.Credit || 0);
            openingBalance = (+(first.balance || first.Balance || 0)) - firstDebit + firstCredit;
        }

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
                        ${entries.map(e => {
                            const date = e.date || e.Date || '';
                            const desc = e.description || e.Description || '';
                            const ref = e.transaction || e.reference || e.Reference || '';
                            const debit = +(e.debit || e.Debit || 0);
                            const credit = +(e.credit || e.Credit || 0);
                            const bal = +(e.balance || e.Balance || 0);
                            return `<tr class="hover:bg-gray-50">
                                <td class="px-3 py-2 whitespace-nowrap">${date ? fmtDate(date, 'date') : ''}</td>
                                <td class="px-3 py-2 max-w-[200px] truncate" title="${_escapeHtml(desc)}">${_escapeHtml(desc || '—')}</td>
                                <td class="px-3 py-2 text-gray-500">${_escapeHtml(ref)}</td>
                                <td class="px-3 py-2 text-right text-red-600">${debit > 0 ? '₹' + debit.toFixed(2) : ''}</td>
                                <td class="px-3 py-2 text-right text-green-600">${credit > 0 ? '₹' + credit.toFixed(2) : ''}</td>
                                <td class="px-3 py-2 text-right font-medium">₹${bal.toFixed(2)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // ── Print statement (uses LEDGER data as fallback) ─────────────────────
    function _printStatement(code) {
        const customer = _allB2B.find(c => c.CODE === code) || { CODE: code, B2B_NAME: code };
        const entries = _allLedger.filter(e =>
            e.CODE === code && e.DIRECTION === 'OUTWARD'
        ).sort((a, b) => (a.ENTRY_DATE || 0) - (a.ENTRY_DATE || 0) ||
                           (a.TIME_STAMP || 0) - (b.TIME_STAMP || 0));
        const balance = _getLatestBalance(code);
        VaultPrint.printStatement(customer, code, entries, balance, 'Customer');
    }

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
        _printStatement,
        _getCustomer,
        _openRecordReceipt,
        _openIssueCreditNote,
        _renderDetail,
    };
})();

window.VaultCustomers = VaultCustomers;
