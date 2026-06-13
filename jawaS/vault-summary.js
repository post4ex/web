// ============================================================================
// VAULT-SUMMARY.JS — Client outstanding, account statement, reports
// Tiles: summary, reports, bank-recon, bulk-import
// API: GET /api/ledger/summary, GET /api/ledger/statement, GET /api/ledger/inward/summary
// ============================================================================

const VaultSummary = (() => {

    let _allLEDGER = [];
    let _allB2B    = [];
    let _activeView = 'summary';

    function _can(role) { return window.VaultPage?.can(role); }

    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search client code or name…';
    }

    function _renderSummaryList(entries) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        // Build latest outstanding per code from LEDGER
        const latest = {};
        const sorted = [...(entries || [])].sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        sorted.forEach(e => {
            if (e.DIRECTION === 'OUTWARD' && e.STATUS === 'ACTIVE' && e.CODE) {
                if (!latest[e.CODE]) latest[e.CODE] = e;
            }
        });

        const codes = Object.values(latest).sort((a, b) => (b.BALANCE || 0) - (a.BALANCE || 0));
        if (!codes.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No outstanding balances.</li>';
            return;
        }
        ul.innerHTML = codes.map(e => {
            const bal = (+e.BALANCE || 0);
            const name = e.CLIENT_NAME || '';
            return `<li data-code="${e.CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 border border-gray-200 transition-colors">
                <strong class="text-gray-800 block text-sm">${e.CODE}</strong>
                <span class="text-xs text-gray-500">${name}</span>
                <div class="text-xs font-semibold mt-1 ${bal >= 0 ? 'text-red-600' : 'text-green-600'}">₹${bal.toFixed(2)}</div>
            </li>`;
        }).join('');

        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _showStatement(li.dataset.code);
            })
        );
    }

    function search(q) {
        const lq = q.toLowerCase();
        _renderSummaryList(_allLEDGER.filter(e =>
            (e.CODE || '').toLowerCase().includes(lq) ||
            (e.CLIENT_NAME || '').toLowerCase().includes(lq)
        ));
    }

    // ── Statement View ────────────────────────────────────────────────────────
    async function _showStatement(code) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">Loading statement…</div>';
        try {
            const res = await callApi(`/api/ledger/statement?code=${code}`, {}, 'GET');
            _renderStatement(res);
        } catch (err) {
            view.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed'}</div>`;
        }
        VaultPage.showDetailPane();
    }

    function _renderStatement(data) {
        const entries = data.entries || [];
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">${data.code}</h3>
                    <p class="text-sm text-gray-500">${data.client_name || ''}</p>
                </div>
                <div class="text-right">
                    <div class="text-xs text-gray-500">Opening Balance</div>
                    <div class="text-sm font-semibold">₹${(+data.opening_balance).toFixed(2)}</div>
                    <div class="text-xs text-gray-500 mt-1">Closing Balance</div>
                    <div class="text-lg font-bold ${(+data.closing_balance) >= 0 ? 'text-red-600' : 'text-green-600'}">₹${(+data.closing_balance).toFixed(2)}</div>
                </div>
            </div>

            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Ledger Entries (${entries.length})</h3></div>
                <div class="detail-card-body overflow-x-auto">
                    ${entries.length ? `<table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-2">Date</th><th class="px-2 py-2">Type</th>
                            <th class="px-2 py-2">Inv#</th><th class="px-2 py-2 text-right">Debit</th>
                            <th class="px-2 py-2 text-right">Credit</th><th class="px-2 py-2 text-right">Balance</th>
                            <th class="px-2 py-2">Narration</th>
                        </tr></thead>
                        <tbody>${entries.map(e => {
                            const typeIcons = { 'INVOICE': '🧾', 'PAYMENT': '💰', 'JOURNAL': '✏️', 'EXPENSE': '💸' };
                            return `<tr class="border-b hover:bg-gray-50">
                                <td class="px-2 py-2 whitespace-nowrap">${_fmt(e.ENTRY_DATE, 'date')}</td>
                                <td class="px-2 py-2">${typeIcons[e.ENTRY_TYPE] || ''} ${e.ENTRY_TYPE}</td>
                                <td class="px-2 py-2">${e.INV_NUMBER || e.JOURNAL_TYPE || '-'}</td>
                                <td class="px-2 py-2 text-right">${(+e.DEBIT||0).toFixed(2)}</td>
                                <td class="px-2 py-2 text-right">${(+e.CREDIT||0).toFixed(2)}</td>
                                <td class="px-2 py-2 text-right font-semibold">${(+e.BALANCE||0).toFixed(2)}</td>
                                <td class="px-2 py-2 text-gray-500 max-w-[200px] truncate">${e.NARRATION || ''}</td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table>` : '<p class="text-gray-400 text-sm text-center py-4">No entries found.</p>'}
                </div>
            </div>`;

        // Mobile-friendly cards fallback
        if (window.innerWidth < 768 && entries.length) {
            const cards = entries.map(e => `
                <div class="border border-gray-200 rounded-lg p-3 text-xs space-y-1">
                    <div class="flex justify-between font-semibold">
                        <span>${_fmt(e.ENTRY_DATE, 'date')}</span>
                        <span class="${(+e.BALANCE||0) >= 0 ? 'text-red-600' : 'text-green-600'}">₹${(+e.BALANCE||0).toFixed(2)}</span>
                    </div>
                    <div class="text-gray-600">${e.ENTRY_TYPE} ${e.INV_NUMBER ? '- ' + e.INV_NUMBER : ''}</div>
                    <div class="flex gap-3 text-gray-500">
                        <span>Dr: ₹${(+e.DEBIT||0).toFixed(2)}</span>
                        <span>Cr: ₹${(+e.CREDIT||0).toFixed(2)}</span>
                    </div>
                    <div class="text-gray-400 truncate">${e.NARRATION || ''}</div>
                </div>`).join('');
            view.innerHTML += `<div class="md:hidden space-y-2 mt-4">${cards}</div>`;
        }

        VaultPage.showDetailPane();
    }

    // ── Dashboard summary ─────────────────────────────────────────────────────
    async function showDashboard() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">Loading summary…</div>';

        try {
            const [outRes, inRes, cashRes] = await Promise.all([
                callApi('/api/ledger/summary', {}, 'GET').catch(() => ({ data: [] })),
                callApi('/api/ledger/inward/summary', {}, 'GET').catch(() => ({ data: [] })),
                callApi('/api/ledger/cash', {}, 'GET').catch(() => ({ data: [] })),
            ]);

            const outData = outRes.data || [];
            const inData = inRes.data || [];
            const cashData = cashRes.data || [];

            const totalOutstanding = outData.reduce((s, d) => s + (+d.balance || 0), 0);
            const totalInward = inData.reduce((s, d) => s + (+d.balance || 0), 0);
            const totalCash = cashData.reduce((s, d) => s + Math.max(0, +d.balance || 0), 0);
            const topDebtors = [...outData].sort((a, b) => (+b.balance || 0) - (+a.balance || 0)).slice(0, 5);

            view.innerHTML = `
                <!-- KPI cards -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                        <div class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Total Outstanding</div>
                        <div class="text-2xl font-bold text-red-600 mt-1">₹${totalOutstanding.toFixed(2)}</div>
                        <div class="text-xs text-gray-400 mt-1">${outData.length} clients</div>
                    </div>
                    <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                        <div class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Vendor Dues</div>
                        <div class="text-2xl font-bold text-orange-600 mt-1">₹${totalInward.toFixed(2)}</div>
                        <div class="text-xs text-gray-400 mt-1">${inData.length} vendors</div>
                    </div>
                    <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                        <div class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Cash in Hand</div>
                        <div class="text-2xl font-bold text-green-600 mt-1">₹${totalCash.toFixed(2)}</div>
                        <div class="text-xs text-gray-400 mt-1">${cashData.length} holders</div>
                    </div>
                </div>

                <!-- Top Debtors -->
                <div class="detail-card mb-4">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Top Outstanding Clients</h3></div>
                    <div class="detail-card-body overflow-x-auto">
                        ${topDebtors.length ? `<table class="min-w-full text-sm">
                            <thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr>
                                <th class="px-3 py-2">Client</th><th class="px-3 py-2">Name</th><th class="px-3 py-2 text-right">Outstanding</th>
                            </tr></thead>
                            <tbody>${topDebtors.map(d => `<tr class="border-b cursor-pointer hover:bg-gray-50" onclick="VaultSummary._showStatement('${d.code}')">
                                <td class="px-3 py-2 font-medium">${d.code}</td>
                                <td class="px-3 py-2 text-gray-600">${d.client_name || ''}</td>
                                <td class="px-3 py-2 text-right font-semibold text-red-600">₹${(+d.balance).toFixed(2)}</td>
                            </tr>`).join('')}</tbody>
                        </table>` : '<p class="text-gray-400 text-sm">No data</p>'}
                    </div>
                </div>

                <!-- Cash in Hand -->
                <div class="detail-card">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Cash Holders</h3></div>
                    <div class="detail-card-body overflow-x-auto">
                        ${cashData.length ? `<table class="min-w-full text-sm">
                            <thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr>
                                <th class="px-3 py-2">Holder</th><th class="px-3 py-2 text-right">Balance</th>
                            </tr></thead>
                            <tbody>${cashData.map(d => `<tr class="border-b">
                                <td class="px-3 py-2">${d.holder}</td>
                                <td class="px-3 py-2 text-right font-semibold ${d.balance >= 0 ? 'text-green-700' : 'text-red-700'}">₹${(+d.balance).toFixed(2)}</td>
                            </tr>`).join('')}</tbody>
                        </table>` : '<p class="text-gray-400 text-sm">No cash data</p>'}
                    </div>
                </div>`;
            VaultPage.showDetailPane();
        } catch (err) {
            view.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed to load summary'}</div>`;
            VaultPage.showDetailPane();
        }
    }

    // ── Reports placeholder ──────────────────────────────────────────────────
    function showReports() {
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📊 Reports</h3></div>
                <div class="detail-card-body space-y-4">
                    <p class="text-gray-500 text-sm">Generate periodic reports.</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button onclick="window.VaultGst?.setTile('gstr1');window.VaultPage?.activateTile('gstr1')" class="p-4 bg-green-50 border border-green-200 rounded-lg text-left hover:bg-green-100 transition-colors">
                            <div class="font-semibold text-green-700">🇮🇳 GSTR-1 Report</div>
                            <div class="text-xs text-gray-500">Monthly outward supply report</div>
                        </button>
                        <button onclick="window.VaultGst?.setTile('gstr3b');window.VaultPage?.activateTile('gstr3b')" class="p-4 bg-blue-50 border border-blue-200 rounded-lg text-left hover:bg-blue-100 transition-colors">
                            <div class="font-semibold text-blue-700">📊 GSTR-3B Report</div>
                            <div class="text-xs text-gray-500">Monthly summary return</div>
                        </button>
                        <button onclick="window.VaultSummary.showDashboard();" class="p-4 bg-purple-50 border border-purple-200 rounded-lg text-left hover:bg-purple-100 transition-colors">
                            <div class="font-semibold text-purple-700">📈 Outstanding Summary</div>
                            <div class="text-xs text-gray-500">Client-wise balance overview</div>
                        </button>
                        <button onclick="window.VaultSummary._showBankRecon();" class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left hover:bg-yellow-100 transition-colors">
                            <div class="font-semibold text-yellow-700">🏦 Bank Reconciliation</div>
                            <div class="text-xs text-gray-500">Reconcile bank statements</div>
                        </button>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function _showBankRecon() {
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">🏦 Bank Reconciliation</h3></div>
                <div class="detail-card-body">
                    <p class="text-gray-400 text-sm py-8 text-center">Bank reconciliation module — Coming soon.</p>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Pending Approvals — ACCOUNTANT+ ────────────────────────────────────────
    let _pendingEntries = [];

    function _renderPendingList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        if (!_pendingEntries.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No pending entries. 🎉</li>';
            return;
        }
        const typeIcons = { 'INVOICE': '🧾', 'PAYMENT': '💰', 'JOURNAL': '✏️', 'EXPENSE': '💸', 'CASH_MOVEMENT': '🪙' };
        ul.innerHTML = _pendingEntries.map(e => {
            const icon = typeIcons[e.ENTRY_TYPE] || '📋';
            const label = e.ENTRY_TYPE + (e.JOURNAL_TYPE ? ' (' + e.JOURNAL_TYPE + ')' : '');
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-yellow-50 border border-gray-200 transition-colors">
                <strong class="text-yellow-800 block text-sm">${icon} ${e.CODE || '-'} — ${label}</strong>
                <span class="text-xs text-gray-500">${e.ENTRY_DATE ? _fmt(e.ENTRY_DATE, 'date') : ''} · ${e.USER_NAME || e.STAFF_NAME || ''}</span>
                <div class="text-xs mt-1">
                    <span class="text-red-500">Dr: ₹${(+e.DEBIT||0).toFixed(2)}</span>
                    <span class="text-green-500 ml-2">Cr: ₹${(+e.CREDIT||0).toFixed(2)}</span>
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderPendingDetail(li.dataset.entry);
            })
        );
        // Auto-select first
        if (_pendingEntries.length) {
            ul.querySelector('li')?.classList.add('selected');
            _renderPendingDetail(_pendingEntries[0].ENTRY_ID);
        }
    }

    function _renderPendingDetail(entryId) {
        VaultPage.showDetail(true);
        const e = _pendingEntries.find(x => x.ENTRY_ID === entryId);
        if (!e) return;
        const typeIcons = { 'INVOICE': '🧾', 'PAYMENT': '💰', 'JOURNAL': '✏️', 'EXPENSE': '💸', 'CASH_MOVEMENT': '🪙' };
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">⏳ Pending — ${e.ENTRY_ID}</h3>
                    <span class="flex gap-2">
                        <button onclick="VaultSummary._approveEntry('${e.ENTRY_ID}', 'APPROVE')" class="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">✅ Approve</button>
                        <button onclick="VaultSummary._approveEntry('${e.ENTRY_ID}', 'REJECT')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200">❌ Reject</button>
                    </span>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <div><span class="text-gray-500">Entry ID:</span> <span class="font-mono">${e.ENTRY_ID}</span></div>
                        <div><span class="text-gray-500">Date:</span> ${e.ENTRY_DATE ? _fmt(e.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Code:</span> ${e.CODE || 'N/A'}</div>
                        <div><span class="text-gray-500">Type:</span> ${typeIcons[e.ENTRY_TYPE] || ''} ${e.ENTRY_TYPE}${e.JOURNAL_TYPE ? ' (' + e.JOURNAL_TYPE + ')' : ''}</div>
                        <div><span class="text-gray-500">Branch:</span> ${e.BRANCH || 'N/A'}</div>
                        <div><span class="text-gray-500">Direction:</span> ${e.DIRECTION || 'N/A'}</div>
                        <div><span class="text-gray-500">Debit:</span> <span class="text-red-600">₹${(+e.DEBIT||0).toFixed(2)}</span></div>
                        <div><span class="text-gray-500">Credit:</span> <span class="text-green-600">₹${(+e.CREDIT||0).toFixed(2)}</span></div>
                        <div><span class="text-gray-500">Created by:</span> ${e.USER_NAME || e.STAFF_NAME || 'N/A'}</div>
                        ${e.PAYMENT_MODE ? `<div><span class="text-gray-500">Mode:</span> ${e.PAYMENT_MODE}</div>` : ''}
                        ${e.EXPENSE_TYPE ? `<div><span class="text-gray-500">Expense Type:</span> ${e.EXPENSE_TYPE}</div>` : ''}
                        ${e.CASH_ACCOUNT ? `<div><span class="text-gray-500">Cash Account:</span> ${e.CASH_ACCOUNT}</div>` : ''}
                        ${e.NARRATION ? `<div class="col-span-3"><span class="text-gray-500">Narration:</span> ${e.NARRATION}</div>` : ''}
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    async function showPendingApprovals() {
        _injectListPane();
        document.getElementById('vaultSearch').placeholder = 'Search code, type, narration…';
        document.getElementById('vaultSearch').oninput = _approveEntrySearch;
        document.getElementById('vaultListMsg').textContent = '';
        try {
            const res = await callApi('/api/ledger/pending', {}, 'GET');
            _pendingEntries = res.data || [];
            _renderPendingList();
        } catch (err) {
            document.getElementById('vaultList').innerHTML = `<li class="text-center text-red-500 py-6">❌ ${err.message}</li>`;
        }
    }

    function _approveEntrySearch() {
        if (!_pendingEntries || !_pendingEntries.length) { _renderPendingList(); return; }
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = _pendingEntries.filter(e =>
            (e.CODE || '').toLowerCase().includes(q) ||
            (e.ENTRY_TYPE || '').toLowerCase().includes(q) ||
            (e.JOURNAL_TYPE || '').toLowerCase().includes(q) ||
            (e.NARRATION || '').toLowerCase().includes(q) ||
            (e.ENTRY_ID || '').toLowerCase().includes(q)
        );
        const ul = document.getElementById('vaultList');
        if (filtered.length === _pendingEntries.length) { _renderPendingList(); return; }
        if (!ul) return;
        if (!filtered.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No matching entries.</li>';
            return;
        }
        const typeIcons = { 'INVOICE': '🧾', 'PAYMENT': '💰', 'JOURNAL': '✏️', 'EXPENSE': '💸', 'CASH_MOVEMENT': '🪙' };
        ul.innerHTML = filtered.map(e => {
            const icon = typeIcons[e.ENTRY_TYPE] || '📋';
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-yellow-50 border border-gray-200 transition-colors">
                <strong class="text-yellow-800 block text-sm">${icon} ${e.CODE || '-'}</strong>
                <span class="text-xs text-gray-500">${e.ENTRY_TYPE}${e.JOURNAL_TYPE ? ' (' + e.JOURNAL_TYPE + ')' : ''}</span>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderPendingDetail(li.dataset.entry);
            })
        );
    }

    async function _approveEntry(entryId, action) {
        const reason = action === 'REJECT' ? prompt('Rejection reason (optional):') || '' : '';
        try {
            const res = await callApi('/api/ledger/approve', { entry_id: entryId, action, reason }, 'POST');
            if (res.status === 'success') {
                showPendingApprovals();
            }
        } catch (err) {
            alert('Failed: ' + (err.message || err));
        }
    }

    // ── Chart of Accounts — hardcoded reference ──────────────────────────────
    async function showChartOfAccounts() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">Loading Chart of Accounts…</div>';

        try {
            const res = await callApi('/api/coa', {}, 'GET');
            const accounts = res.data || [];

            // Group by account type
            const groups = {};
            accounts.forEach(a => {
                if (!groups[a.group]) groups[a.group] = [];
                groups[a.group].push(a);
            });

            const groupOrder = ['Current Assets', 'Fixed Assets', 'Current Liabilities', 'Equity',
                'Direct Income', 'Operating Income', 'Other Income',
                'Direct Expenses', 'Employee Costs', 'Office Expenses',
                'Vehicle Expenses', 'Administrative', 'Financial', 'Tax Expenses',
                'Non-Cash Expenses', 'Other Expenses'];

            const total = accounts.length;

            function _renderAccounts(groups, groupOrder) {
                return groupOrder.map(grp => {
                    const accs = groups[grp];
                    if (!accs || !accs.length) return '';
                    const isAsset = accs[0].type === 'Asset';
                    const isLiability = accs[0].type === 'Liability';
                    const isIncome = accs[0].type === 'Income';
                    const isExpense = accs[0].type === 'Expense';
                    const bgColor = isAsset ? 'bg-blue-50 border-blue-200' :
                                    isLiability ? 'bg-orange-50 border-orange-200' :
                                    isIncome ? 'bg-green-50 border-green-200' :
                                    'bg-rose-50 border-rose-200';
                    const headerColor = isAsset ? 'text-blue-800' :
                                        isLiability ? 'text-orange-800' :
                                        isIncome ? 'text-green-800' :
                                        'text-rose-800';
                    return `<div class="${bgColor} rounded-lg border p-3 mb-3">
                        <h4 class="${headerColor} text-xs font-bold uppercase tracking-wider mb-2">${grp}</h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                            ${accs.map(a => `<div class="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/60 transition-colors">
                                <span class="font-mono text-xs font-medium text-gray-500 w-12">${a.code}</span>
                                <span class="text-sm text-gray-800">${a.name}</span>
                                <span class="text-xs text-gray-400 ml-auto">${a.normal_balance}</span>
                            </div>`).join('')}
                        </div>
                    </div>`;
                }).join('');
            }

            view.innerHTML = `
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">📒 Chart of Accounts</h3>
                        <p class="text-xs text-gray-500">${total} accounts — hardcoded reference list</p>
                    </div>
                    <div class="relative">
                        <input id="coaSearch" type="text" placeholder="Search code, name, group…"
                            class="form-input text-sm w-64 pl-8">
                        <svg class="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </div>
                </div>
                <div id="coaContainer">
                    ${_renderAccounts(groups, groupOrder)}
                </div>`;
            VaultPage.showDetailPane();

            // Live search
            document.getElementById('coaSearch').addEventListener('input', e => {
                const q = e.target.value.toLowerCase();
                const filtered = accounts.filter(a =>
                    a.code.includes(q) || a.name.toLowerCase().includes(q) || a.group.toLowerCase().includes(q)
                );
                const fGroups = {};
                filtered.forEach(a => {
                    if (!fGroups[a.group]) fGroups[a.group] = [];
                    fGroups[a.group].push(a);
                });
                document.getElementById('coaContainer').innerHTML =
                    filtered.length
                        ? _renderAccounts(fGroups, groupOrder)
                        : '<p class="text-center text-gray-400 py-8">No matching accounts.</p>';
            });
        } catch (err) {
            view.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed to load'}</div>`;
            VaultPage.showDetailPane();
        }
    }

    // ── Bulk Import ──────────────────────────────────────────────────────────
    function showBulkImport() {
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📥 Bulk Import</h3></div>
                <div class="detail-card-body">
                    <p class="text-gray-400 text-sm py-8 text-center">Bulk import of ledger entries — Coming soon.</p>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLEDGER = Object.values(data.LEDGER);
            _allB2B = data.B2B ? Object.values(data.B2B) : [];
        }
        if (_activeView === 'summary') {
            _renderSummaryList(_allLEDGER);
            showDashboard();
        }
    }

    function setView(view) { _activeView = view; }

    return { load, search, showDashboard, showReports, showPendingApprovals, showChartOfAccounts, showBulkImport, _showStatement, _showBankRecon, _approveEntry, setView };
})();

window.VaultSummary = VaultSummary;
