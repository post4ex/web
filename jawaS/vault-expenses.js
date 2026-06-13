// ============================================================================
// VAULT-EXPENSES.JS — Expense claims + petty cash movements
// Tiles: expense-claims, petty-cash, staff-advances, branch-advances
// API: POST /api/ledger/expense, POST /api/ledger/cash_movement, GET /api/ledger/cash
// ============================================================================

const VaultExpenses = (() => {

    let _allLedger = [];

    function _can(role) { return window.VaultPage?.can(role); }

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by type, narration…';
    }

    function _renderExpenseList(entries) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const expenses = entries.filter(e => e.ENTRY_TYPE === 'EXPENSE');
        expenses.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!expenses.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No expenses recorded.</li>';
            return;
        }
        const typeIcons = { 'FUEL': '⛽', 'OFFICE': '🏢', 'SALARY': '💼', 'OTHER': '📋' };
        ul.innerHTML = expenses.slice(0, 50).map(e => {
            const icon = typeIcons[e.EXPENSE_TYPE] || '📋';
            const amt = (+e.DEBIT||0).toFixed(2);
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-rose-50 border border-gray-200 transition-colors">
                <strong class="text-rose-700 block text-sm">${icon} ${e.BRANCH || ''} — ₹${amt}</strong>
                <span class="text-xs text-gray-500">${e.EXPENSE_TYPE || ''} · ${e.NARRATION || ''}</span>
                <div class="text-xs text-gray-400 mt-1">${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''} · ${e.STATUS || ''}</div>
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

    function _renderCashList(entries) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const movements = entries.filter(e => e.ENTRY_TYPE === 'CASH_MOVEMENT');
        movements.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!movements.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No cash movements recorded.</li>';
            return;
        }
        ul.innerHTML = movements.slice(0, 50).map(e => {
            const amt = (+e.CASH_AMOUNT||0).toFixed(2);
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-yellow-50 border border-gray-200 transition-colors">
                <strong class="text-yellow-700 block text-sm">🪙 ${e.CASH_FROM || '?'} → ${e.CASH_TO || '?'} — ₹${amt}</strong>
                <span class="text-xs text-gray-500">${e.NARRATION || ''}</span>
                <div class="text-xs text-gray-400 mt-1">${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''}</div>
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
        const filtered = _allLedger.filter(e =>
            (e.EXPENSE_TYPE || '').toLowerCase().includes(lq) ||
            (e.NARRATION || '').toLowerCase().includes(lq) ||
            (e.CASH_FROM || '').toLowerCase().includes(lq) ||
            (e.CASH_TO || '').toLowerCase().includes(lq) ||
            (e.BRANCH || '').toLowerCase().includes(lq)
        );
        _activeType === 'expense' ? _renderExpenseList(filtered) : _renderCashList(filtered);
    }

    let _activeType = 'expense';

    // ── Detail pane ───────────────────────────────────────────────────────────
    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        if (entry.ENTRY_TYPE === 'EXPENSE') {
            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Expense Detail</h3></div>
                    <div class="detail-card-body">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div><span class="text-gray-500">Entry ID:</span> ${entry.ENTRY_ID}</div>
                            <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                            <div><span class="text-gray-500">Branch:</span> ${entry.BRANCH || 'N/A'}</div>
                            <div><span class="text-gray-500">Type:</span> ${entry.EXPENSE_TYPE || 'N/A'}</div>
                            <div><span class="text-gray-500">Amount:</span> ₹${(+entry.DEBIT||0).toFixed(2)}</div>
                            <div><span class="text-gray-500">Status:</span> ${entry.STATUS || 'N/A'}</div>
                            ${entry.NARRATION ? `<div class="col-span-2"><span class="text-gray-500">Narration:</span> ${entry.NARRATION}</div>` : ''}
                        </div>
                    </div>
                </div>`;
        } else if (entry.ENTRY_TYPE === 'CASH_MOVEMENT') {
            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Cash Movement Detail</h3></div>
                    <div class="detail-card-body">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div><span class="text-gray-500">Entry ID:</span> ${entry.ENTRY_ID}</div>
                            <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                            <div><span class="text-gray-500">From:</span> ${entry.CASH_FROM || 'N/A'}</div>
                            <div><span class="text-gray-500">To:</span> ${entry.CASH_TO || 'N/A'}</div>
                            <div><span class="text-gray-500">Amount:</span> ₹${(+entry.CASH_AMOUNT||0).toFixed(2)}</div>
                            ${entry.NARRATION ? `<div class="col-span-2"><span class="text-gray-500">Narration:</span> ${entry.NARRATION}</div>` : ''}
                        </div>
                    </div>
                </div>`;
        }
        VaultPage.showDetailPane();
    }

    // ── Forms ─────────────────────────────────────────────────────────────────
    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        if (_activeType === 'expense') {
            _openExpenseForm(view);
        } else {
            _openCashForm(view);
        }
    }

    function _openExpenseForm(view) {
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Record Expense</h3></div>
                <div class="detail-card-body">
                    <form id="expForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch *</label>
                            <input name="branch" required class="form-input text-sm uppercase" placeholder="e.g. DDN" list="expBranchList">
                            <datalist id="expBranchList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Expense Type *</label>
                            <select name="expense_type" required class="form-input text-sm">
                                <option value="FUEL">Fuel</option>
                                <option value="OFFICE">Office</option>
                                <option value="SALARY">Salary</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="debit" type="number" step="0.01" min="0.01" required class="form-input text-sm" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                            <input name="entry_date" type="date" required class="form-input text-sm">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration *</label>
                            <input name="narration" required class="form-input text-sm" placeholder="Description of expense">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="expBtnText">Save Expense</span>
                                <div id="expSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="expResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate branch datalist
        getAppData().then(data => {
            const dl = document.getElementById('expBranchList');
            if (data?.BRANCHES) Object.values(data.BRANCHES).forEach(b => {
                if (b.BRANCH_CODE) { const o = document.createElement('option'); o.value = b.BRANCH_CODE; dl.appendChild(o); }
            });
        });

        document.getElementById('expForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('expSpinner');
            const resp = document.getElementById('expResponse');
            btn.disabled = true; sp.classList.remove('hidden');
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                const res = await callApi('/api/ledger/expense', {
                    branch: data.branch,
                    entry_date: toMs(data.entry_date),
                    expense_type: data.expense_type,
                    debit: parseFloat(data.debit),
                    narration: data.narration,
                }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = '✅ Expense saved.';
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderExpenseList(_allLedger);
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

    function _openCashForm(view) {
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Record Cash Movement</h3></div>
                <div class="detail-card-body">
                    <form id="cashForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">From *</label>
                            <input name="cash_from" required class="form-input text-sm uppercase" placeholder="e.g. STAFF:SC001 or BRANCH:DDN">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">To *</label>
                            <input name="cash_to" required class="form-input text-sm uppercase" placeholder="e.g. BRANCH:DDN or BANK:HDFC">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="cash_amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                            <input name="entry_date" type="date" required class="form-input text-sm">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration *</label>
                            <input name="narration" required class="form-input text-sm" placeholder="Description of movement">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="cashBtnText">Save Movement</span>
                                <div id="cashSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="cashResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        document.getElementById('cashForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('cashSpinner');
            const resp = document.getElementById('cashResponse');
            btn.disabled = true; sp.classList.remove('hidden');
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                const res = await callApi('/api/ledger/cash_movement', {
                    cash_from: data.cash_from,
                    cash_to: data.cash_to,
                    cash_amount: parseFloat(data.cash_amount),
                    entry_date: toMs(data.entry_date),
                    narration: data.narration,
                }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = '✅ Cash movement recorded.';
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderCashList(_allLedger);
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

    // ── Wallet (cash in hand) ──────────────────────────────────────────────────
    async function showWallet() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">Loading wallet data…</div>';

        try {
            const res = await callApi('/api/ledger/cash', {}, 'GET');
            const data = res.data || [];
            VaultPage.showDetail(true);
            const rows = data.map(d => `<tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-700">${d.holder}</td>
                <td class="px-4 py-3 text-right font-semibold ${d.balance >= 0 ? 'text-green-700' : 'text-red-700'}">₹${(+d.balance).toFixed(2)}</td>
            </tr>`).join('') || '<tr><td colspan="2" class="text-center text-gray-400 py-4">No cash data yet.</td></tr>';

            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header flex justify-between items-center">
                        <h3 class="font-semibold text-gray-700">👛 Cash in Hand</h3>
                        <button onclick="VaultExpenses.openAddPane();" class="btn-ghost btn-sm">+ New Movement</button>
                    </div>
                    <div class="detail-card-body overflow-x-auto">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                                <tr><th class="px-4 py-2 text-left">Holder</th><th class="px-4 py-2 text-right">Balance</th></tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;
        } catch (err) {
            view.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed to load wallet'}</div>`;
        }
        VaultPage.showDetailPane();
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            if (_activeType === 'expense') _renderExpenseList(_allLedger);
            else _renderCashList(_allLedger);
        }
    }

    function setType(type) {
        _activeType = type;
        if (type === 'cash') {
            document.getElementById('vaultSearch').placeholder = 'Search cash movements…';
        } else {
            document.getElementById('vaultSearch').placeholder = 'Search by type, narration…';
        }
    }

    return { load, search, openAddPane, showWallet, setType };
})();

window.VaultExpenses = VaultExpenses;
