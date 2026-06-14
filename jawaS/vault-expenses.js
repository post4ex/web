// ============================================================================
// VAULT-EXPENSES.JS — Expense claims + petty cash movements
// Tiles: expense-claims, petty-cash, staff-advances, branch-advances
// API: POST /api/ledger/expense, POST /api/ledger/cash_movement, GET /api/ledger/cash
// ============================================================================

const VaultExpenses = (() => {

    let _allLedger = [];

    function _can(role) { return window.VaultPage?.can(role); }

    // ── COA cache ─────────────────────────────────────────────────────────────
    let _coaMap = {};

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

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by type, narration…';
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const entries = _allLedger.filter(e => e.ENTRY_TYPE === 'EXPENSE');
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? entries.filter(e =>
                (e.EXPENSE_TYPE || '').toLowerCase().includes(q) ||
                (e.NARRATION || '').toLowerCase().includes(q) ||
                (e.BRANCH || '').toLowerCase().includes(q) ||
                (e.CODE || '').toLowerCase().includes(q)
              )
            : entries;
        filtered.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!filtered.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No expenses recorded.</li>';
            return;
        }
        const typeIcons = { 'FUEL': '⛽', 'OFFICE': '🏢', 'SALARY': '💼', 'OTHER': '📋' };
        ul.innerHTML = filtered.slice(0, 50).map(e => {
            const icon = typeIcons[e.EXPENSE_TYPE] || '📋';
            const amt = (+e.DEBIT||0).toFixed(2);
            const statusColor = e.STATUS === 'ACTIVE' ? 'text-green-700' :
                                e.STATUS === 'PENDING' ? 'text-yellow-700' :
                                e.STATUS === 'VOID' ? 'text-red-700' : 'text-gray-700';
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-rose-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <div>
                        <strong class="text-rose-700 block text-sm">${icon} ${e.BRANCH || ''} — ₹${amt}</strong>
                        <span class="text-xs text-gray-500">${e.EXPENSE_TYPE || ''} · ${e.NARRATION || ''}</span>
                    </div>
                    <span class="${statusColor} text-xs font-medium">${e.STATUS || ''}</span>
                </div>
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

    function _renderCashList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const movements = _allLedger.filter(e => e.ENTRY_TYPE === 'CASH_MOVEMENT');
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? movements.filter(e =>
                (e.CASH_FROM || '').toLowerCase().includes(q) ||
                (e.CASH_TO || '').toLowerCase().includes(q) ||
                (e.NARRATION || '').toLowerCase().includes(q) ||
                (e.BRANCH || '').toLowerCase().includes(q)
              )
            : movements;
        filtered.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!filtered.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No cash movements recorded.</li>';
            return;
        }
        const statusColor = (s) => s === 'ACTIVE' ? 'text-green-700' :
                             s === 'PENDING' ? 'text-yellow-700' :
                             s === 'VOID' ? 'text-red-700' : 'text-gray-700';
        ul.innerHTML = filtered.slice(0, 50).map(e => {
            const amt = (+e.CASH_AMOUNT||0).toFixed(2);
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-yellow-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <div>
                        <strong class="text-yellow-700 block text-sm">🪙 ${e.CASH_FROM || '?'} → ${e.CASH_TO || '?'} — ₹${amt}</strong>
                        <span class="text-xs text-gray-500">${e.NARRATION || ''}</span>
                    </div>
                    <span class="${statusColor(e.STATUS)} text-xs font-medium">${e.STATUS || ''}</span>
                </div>
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

    function _printEntry(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry) return;
        if (entry.ENTRY_TYPE === 'CASH_MOVEMENT') {
            VaultPrint.printCashMovement(entry);
        } else {
            VaultPrint.printExpense(entry);
        }
    }

    function search() {
        if (_activeType === 'expense') _renderList();
        else _renderCashList();
    }

    let _activeType = 'expense';

    // ── Edit form (void-then-recreate) ───────────────────────────────────────
    function _openEditForm(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry) return;
        const isExpense = entry.ENTRY_TYPE === 'EXPENSE';
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const entryDate = entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE, 'input') : new Date().toISOString().split('T')[0];
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">✏️ Edit ${isExpense ? 'Expense' : 'Cash Movement'}</h3></div>
                <div class="detail-card-body">
                    <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
                        ⚠️ Editing will void the current entry and create a replacement.
                    </p>
                    <form id="expEditForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        ${isExpense ? `
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch *</label>
                            <input name="branch" required class="form-input text-sm uppercase" value="${entry.BRANCH || ''}" list="editExpBranchList">
                            <datalist id="editExpBranchList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Expense Type *</label>
                            <select name="expense_type" required class="form-input text-sm">
                                <option value="FUEL" ${entry.EXPENSE_TYPE === 'FUEL' ? 'selected' : ''}>Fuel</option>
                                <option value="OFFICE" ${entry.EXPENSE_TYPE === 'OFFICE' ? 'selected' : ''}>Office</option>
                                <option value="SALARY" ${entry.EXPENSE_TYPE === 'SALARY' ? 'selected' : ''}>Salary</option>
                                <option value="OTHER" ${!['FUEL','OFFICE','SALARY'].includes(entry.EXPENSE_TYPE) ? 'selected' : ''}>Other</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="debit" type="number" step="0.01" min="0.01" required class="form-input text-sm" value="${(+entry.DEBIT||0).toFixed(2)}">
                        </div>` : `
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">From *</label>
                            <input name="cash_from" required class="form-input text-sm uppercase" value="${entry.CASH_FROM || ''}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">To *</label>
                            <input name="cash_to" required class="form-input text-sm uppercase" value="${entry.CASH_TO || ''}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="cash_amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" value="${(+entry.CASH_AMOUNT||0).toFixed(2)}">
                        </div>`}
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                            <input name="branch" class="form-input text-sm uppercase" value="${entry.BRANCH || ''}" list="editCashBranchList">
                            <datalist id="editCashBranchList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                            <input name="entry_date" type="date" required class="form-input text-sm" value="${entryDate}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration *</label>
                            <input name="narration" required class="form-input text-sm" value="${entry.NARRATION || ''}">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t gap-2">
                            <button type="button" onclick="VaultExpenses._renderDetailById('${entry.ENTRY_ID}')" class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm">Save Changes</button>
                        </div>
                    </form>
                    <div id="expEditResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate branch datalist
        getAppData().then(data => {
            const dl = document.getElementById('editExpBranchList');
            if (data?.BRANCHES) Object.values(data.BRANCHES).forEach(b => {
                if (b.BRANCH_CODE) { const o = document.createElement('option'); o.value = b.BRANCH_CODE; dl.appendChild(o); }
            });
        });

        document.getElementById('expEditForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const resp = document.getElementById('expEditResponse');
            btn.disabled = true;
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                await callApi('/api/ledger/void', { entry_id: entry.ENTRY_ID, void_reason: 'Replaced by edit' }, 'POST');
                const endpoint = isExpense ? '/api/ledger/expense' : '/api/ledger/cash_movement';
                const body = isExpense ? {
                    branch: data.branch,
                    entry_date: toMs(data.entry_date),
                    expense_type: data.expense_type,
                    debit: parseFloat(data.debit),
                    narration: data.narration,
                } : {
                    cash_from: data.cash_from,
                    cash_to: data.cash_to,
                    cash_amount: parseFloat(data.cash_amount),
                    entry_date: toMs(data.entry_date),
                    narration: data.narration,
                    branch: data.branch || '',
                };
                await callApi(endpoint, body, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = '✅ Updated successfully.';
                resp.classList.remove('hidden');
                const appData = await getAppData();
                if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _activeType === 'expense' ? _renderList() : _renderCashList(); }
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally { btn.disabled = false; }
        });
        VaultPage.showDetailPane();
    }

    // ── Detail pane ───────────────────────────────────────────────────────────
    async function _handleDelete(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry || entry.STATUS === 'VOID') return;
        const label = entry.ENTRY_TYPE === 'EXPENSE' ? 'expense' : 'cash movement';
        if (!confirm(`Delete this ${label}? This will void and recalculate balances.`)) return;
        const reason = prompt('Reason (optional):', '') || '';
        try {
            await callApi('/api/ledger/void', { entry_id: entryId, void_reason: reason }, 'POST');
            const appData = await getAppData();                if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _activeType === 'expense' ? _renderList() : _renderCashList(); }
            document.getElementById('vaultDetailView').innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8"><div class="text-4xl mb-3">🗑️</div><p class="text-gray-500 text-sm">${label.charAt(0).toUpperCase() + label.slice(1)} deleted (voided).</p></div></div>`;
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';
        const delBtn = isActive ? `<button onclick="VaultExpenses._handleDelete('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1">&times; Delete</button>` : '';
        const editBtn = isActive ? `<button onclick="VaultExpenses._openEditForm('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 flex items-center gap-1">&#9998; Edit</button>` : '';
        const printBtn = isActive ? `<button onclick="VaultExpenses._printEntry('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> Print</button>` : '';

        const coaDr = _coaName(entry.COA_DR);
        const coaCr = _coaName(entry.COA_CR);

        if (entry.ENTRY_TYPE === 'EXPENSE') {
            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header flex justify-between items-center">
                        <h3 class="font-semibold text-gray-700">Expense Detail</h3>
                        <div class="flex gap-2 items-center">
                            ${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : ''}
                            <span class="px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700">₹${(+entry.DEBIT||0).toFixed(2)}</span>
                            ${printBtn}${editBtn}${delBtn}
                        </div>
                    </div>
                    <div class="detail-card-body">
                        <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-3 rounded-lg mb-3">
                            <div><span class="text-gray-500">Branch:</span> <span class="font-semibold">${entry.BRANCH || 'N/A'}</span></div>
                            <div><span class="text-gray-500">Type:</span> <span class="font-medium">${entry.EXPENSE_TYPE || 'N/A'}</span></div>
                            <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                            <div><span class="text-gray-500">Status:</span> <span class="font-medium">${entry.STATUS || 'N/A'}</span></div>
                            <div><span class="text-gray-500">Amount:</span> ₹${(+entry.DEBIT||0).toFixed(2)}</div>
                            <div><span class="text-gray-500">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                        </div>

                        <!-- COA -->
                        <div class="text-xs text-gray-400 mb-2 flex gap-4">
                            <span>Dr: ${coaDr}</span>
                            <span>Cr: ${coaCr}</span>
                        </div>

                        ${entry.NARRATION ? `<div class="text-sm text-gray-700 bg-white border rounded-lg p-3">📝 ${entry.NARRATION}</div>` : ''}

                        <!-- Audit info -->
                        <details class="mt-4">
                            <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Audit Info</summary>
                            <div class="grid grid-cols-2 gap-3 text-xs text-gray-500 mt-2 p-3 border rounded-lg">
                                <div>ID: ${entry.ENTRY_ID}</div>
                                <div>FY: ${entry.FY || 'N/A'}</div>
                                <div>Created: ${entry.USER_NAME || 'N/A'}</div>
                                ${entry.VOID_REASON ? `<div class="col-span-2 text-red-600">Void: ${entry.VOID_REASON}</div>` : ''}
                            </div>
                        </details>
                    </div>
                </div>`;
        } else if (entry.ENTRY_TYPE === 'CASH_MOVEMENT') {
            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header flex justify-between items-center">
                        <h3 class="font-semibold text-gray-700">Cash Movement Detail</h3>
                        <div class="flex gap-2 items-center">
                            ${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : ''}
                            <span class="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">₹${(+entry.CASH_AMOUNT||0).toFixed(2)}</span>
                            ${printBtn}${editBtn}${delBtn}
                        </div>
                    </div>
                    <div class="detail-card-body">
                        <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-3 rounded-lg mb-3">
                            <div><span class="text-gray-500">From:</span> <span class="font-semibold">${entry.CASH_FROM || 'N/A'}</span></div>
                            <div><span class="text-gray-500">To:</span> <span class="font-semibold">${entry.CASH_TO || 'N/A'}</span></div>
                            <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                            <div><span class="text-gray-500">Status:</span> <span class="font-medium">${entry.STATUS || 'N/A'}</span></div>
                            <div><span class="text-gray-500">Amount:</span> ₹${(+entry.CASH_AMOUNT||0).toFixed(2)}</div>
                        </div>

                        <!-- COA -->
                        <div class="text-xs text-gray-400 mb-2 flex gap-4">
                            <span>Dr: ${coaDr}</span>
                            <span>Cr: ${coaCr}</span>
                        </div>

                        ${entry.NARRATION ? `<div class="text-sm text-gray-700 bg-white border rounded-lg p-3">📝 ${entry.NARRATION}</div>` : ''}

                        <details class="mt-4">
                            <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Audit Info</summary>
                            <div class="grid grid-cols-2 gap-3 text-xs text-gray-500 mt-2 p-3 border rounded-lg">
                                <div>ID: ${entry.ENTRY_ID}</div>
                                <div>FY: ${entry.FY || 'N/A'}</div>
                                <div>Created: ${entry.USER_NAME || 'N/A'}</div>
                                ${entry.VOID_REASON ? `<div class="col-span-2 text-red-600">Void: ${entry.VOID_REASON}</div>` : ''}
                            </div>
                        </details>
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
                _renderList();
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
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                            <input name="branch" class="form-input text-sm uppercase" placeholder="e.g. DDN" list="cashBranchList">
                            <datalist id="cashBranchList"></datalist>
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
                    branch: data.branch || '',
                }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = '✅ Cash movement recorded.';
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderCashList();
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
    let _cashHolders = [];

    function _getHolderLastTx(holder) {
        const tx = _allLedger
            .filter(e => e.CASH_FROM === holder || e.CASH_TO === holder)
            .sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0))[0];
        return tx ? (tx.ENTRY_DATE ? fmtDate(tx.ENTRY_DATE, 'date') : '') : '';
    }

    function _renderCashHoldersList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        if (!_cashHolders.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No cash holders found.</li>';
            return;
        }
        ul.innerHTML = _cashHolders.map(d => {
            const balClass = d.balance >= 0 ? 'text-green-600' : 'text-red-600';
            const lastTx = _getHolderLastTx(d.holder);
            return `<li data-holder="${d.holder}" class="p-3 rounded-lg cursor-pointer hover:bg-yellow-50 border border-gray-200 transition-colors">
                <strong class="text-yellow-800 block text-sm">👛 ${d.holder}</strong>
                <div class="flex items-center justify-between mt-1">
                    <span class="${balClass} text-sm font-medium">₹${(+d.balance).toFixed(2)}</span>
                    ${lastTx ? `<span class="text-xs text-gray-400">Last: ${lastTx}</span>` : ''}
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderWalletHolderDetail(li.dataset.holder);
            })
        );
        // Auto-select first
        if (_cashHolders.length) {
            ul.querySelector('li')?.classList.add('selected');
            _renderWalletHolderDetail(_cashHolders[0].holder);
        }
    }

    function _renderWalletHolderDetail(holder) {
        VaultPage.showDetail(true);
        const d = _cashHolders.find(h => h.holder === holder);
        if (!d) return;
        const view = document.getElementById('vaultDetailView');
        const bal = (+d.balance || 0);
        const balClass = bal >= 0 ? 'text-green-600' : 'text-red-600';

        // Compute summary from ledger
        const txns = _allLedger.filter(e => e.CASH_FROM === holder || e.CASH_TO === holder)
            .sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        const totalReceived = txns.filter(e => e.CASH_TO === holder)
            .reduce((s, e) => s + (+e.CASH_AMOUNT || 0), 0);
        const totalSent = txns.filter(e => e.CASH_FROM === holder)
            .reduce((s, e) => s + (+e.CASH_AMOUNT || 0), 0);

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h3 class="font-semibold text-gray-700">👛 ${holder}</h3>
                        <span class="text-xs text-gray-400">${txns.length} transactions</span>
                    </div>
                    <button onclick="VaultExpenses.openAddPane();" class="px-3 py-1.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 flex items-center gap-1">
                        <span>+ New Movement</span>
                    </button>
                </div>
                <div class="detail-card-body">
                    <!-- Balance card -->
                    <div class="text-center py-6 bg-gray-50 rounded-lg border mb-4">
                        <div class="text-3xl font-bold ${balClass}">₹${bal.toFixed(2)}</div>
                        <div class="text-sm text-gray-500 mt-1">Current Balance</div>
                    </div>

                    <!-- Summary cards -->
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div class="bg-green-50 rounded-lg p-3 border border-green-200 text-center">
                            <div class="text-xs text-green-600 font-medium uppercase tracking-wider">Received</div>
                            <div class="text-lg font-bold text-green-700 mt-1">₹${totalReceived.toFixed(2)}</div>
                        </div>
                        <div class="bg-red-50 rounded-lg p-3 border border-red-200 text-center">
                            <div class="text-xs text-red-600 font-medium uppercase tracking-wider">Sent</div>
                            <div class="text-lg font-bold text-red-700 mt-1">₹${totalSent.toFixed(2)}</div>
                        </div>
                    </div>

                    <!-- Recent transactions -->
                    <div class="text-xs mt-1">
                        <div class="font-semibold text-gray-600 mb-2">Recent Transactions</div>
                        ${!txns.length
                            ? '<div class="text-xs text-gray-400 text-center py-4">No transactions for this holder.</div>'
                            : `<div class="space-y-1 max-h-80 overflow-y-auto">
                                ${txns.slice(0, 30).map(e => {
                                    const isInflow = e.CASH_TO === holder;
                                    const counterparty = isInflow ? e.CASH_FROM : e.CASH_TO;
                                    const amt = (+e.CASH_AMOUNT || 0);
                                    return `<div class="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                                        <div class="flex items-center gap-2">
                                            <span class="${isInflow ? 'text-green-500' : 'text-red-500'}">${isInflow ? '⬇' : '⬆'}</span>
                                            <div>
                                                <span class="font-medium ${isInflow ? 'text-green-700' : 'text-red-700'}">${isInflow ? '+' : '-'}₹${amt.toFixed(2)}</span>
                                                <span class="text-gray-400 ml-1">${counterparty || ''}</span>
                                            </div>
                                        </div>
                                        <span class="text-gray-400 text-xs">${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''}</span>
                                    </div>`;
                                }).join('')}
                            </div>`}
                    </div>

                    <!-- Narration if only one recent -->
                    ${txns[0]?.NARRATION ? `<div class="text-xs text-gray-500 mt-3 bg-gray-50 rounded p-2">Latest: ${txns[0].NARRATION}</div>` : ''}
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    async function showWallet() {
        _injectListPane();
        document.getElementById('vaultSearch').placeholder = 'Search holder…';
        document.getElementById('vaultSearch').oninput = function() {
            const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
            if (!q) { _renderCashHoldersList(); return; }
            const filtered = _cashHolders.filter(d =>
                (d.holder || '').toLowerCase().includes(q)
            );
            const ul = document.getElementById('vaultList');
            if (!ul) return;
            if (!filtered.length) {
                ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No matching holders.</li>';
                return;
            }
            ul.innerHTML = filtered.map(d => {
                const balClass = d.balance >= 0 ? 'text-green-600' : 'text-red-600';
                const lastTx = _getHolderLastTx(d.holder);
                return `<li data-holder="${d.holder}" class="p-3 rounded-lg cursor-pointer hover:bg-yellow-50 border border-gray-200 transition-colors">
                    <strong class="text-yellow-800 block text-sm">👛 ${d.holder}</strong>
                    <div class="flex items-center justify-between mt-1">
                        <span class="${balClass} text-sm font-medium">₹${(+d.balance).toFixed(2)}</span>
                        ${lastTx ? `<span class="text-xs text-gray-400">Last: ${lastTx}</span>` : ''}
                    </div>
                </li>`;
            }).join('');
            ul.querySelectorAll('li').forEach(li =>
                li.addEventListener('click', () => {
                    ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                    li.classList.add('selected');
                    _renderWalletHolderDetail(li.dataset.holder);
                })
            );
        };
        try {
            const res = await callApi('/api/ledger/cash', {}, 'GET');
            _cashHolders = res.data || [];
            _renderCashHoldersList();
        } catch (err) {
            document.getElementById('vaultList').innerHTML = `<li class="text-center text-red-500 py-6">❌ ${err.message}</li>`;
        }
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        await _loadCoaCache();
        const data = await getAppData();

        // Wire search input
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();

        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            if (_activeType === 'expense') _renderList();
            else _renderCashList();
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

    function _renderDetailById(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (entry) _renderDetail(entry);
    }

    return { load, search, openAddPane, showWallet, setType, _handleDelete, _openEditForm, _renderDetailById, _printEntry };
})();

window.VaultExpenses = VaultExpenses;
