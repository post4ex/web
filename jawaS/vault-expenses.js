// ============================================================================
// VAULT-EXPENSES.JS — Expense Claims, Petty Cash, Staff & Branch Advances
// Tiles: expense-claims, petty-cash, staff-advances, branch-advances
//
// Data sources:
//   Expense Claims: IDB HEADER (DOX_TYPE === 'Expense Claim')
//   Petty Cash:     IDB LEDGER (ACCOUNT contains 'Cash in Hand' / 'Petty Cash')
//   Staff Advances: IDB LEDGER (ACCOUNT contains 'Staff Advance', grouped by STAFF_CODE)
//   Branch Advances:IDB LEDGER (ACCOUNT contains 'Branch Advance', grouped by BRANCH)
// Detail:          IDB LEDGER for GL postings
// ============================================================================

const VaultExpenses = (() => {

    let _allExpenses = [];     // HEADER-based (expense-claims)
    let _allLedger   = [];     // LEDGER-based (petty-cash, staff-advances, branch-advances)
    let _activeType  = 'expense-claims';

    // ── Date helper ────────────────────────────────────────────────────────────
    function _toDateStr(ts) {
        if (!ts) return '—';
        try {
            const d = new Date(ts);
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (_) { return '—'; }
    }

    function _fmtAmt(v) {
        return '₹' + (parseFloat(v) || 0).toFixed(2);
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _titleCase(str) {
        return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        const search = document.getElementById('vaultSearch');
        if (search) {
            search.placeholder = _activeType === 'expense-claims'
                ? 'Search by reference, employee…'
                : 'Search…';
            search.oninput = () => search();
        }
    }

    // ── Helpers (LEDGER-based) ─────────────────────────────────────────────────
    function _computeRunningBalance(entries, openingBalance) {
        let running = openingBalance;
        return entries.map(e => {
            const debit = +(e.DEBIT || 0);
            const credit = +(e.CREDIT || 0);
            running += (debit - credit);
            return { ...e, RUNNING_BALANCE: running };
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // A. EXPENSE CLAIMS — HEADER-based list + GL Postings detail
    // ══════════════════════════════════════════════════════════════════════════

    function _renderExpenseList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = _allExpenses.filter(e => {
            if (!q) return true;
            return (e.DOX_REF || '').toLowerCase().includes(q) ||
                   (e.B2B || '').toLowerCase().includes(q);
        });
        filtered.sort((a, b) => ((b.IO_TIMESTAMP || '') > (a.IO_TIMESTAMP || '') ? 1 : -1));

        if (!filtered.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No expense claims found.</li>';
            return;
        }

        ul.innerHTML = filtered.map(e => `
            <li data-key="${e.DOX_KEY}" class="p-3 rounded-lg cursor-pointer hover:bg-rose-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <strong class="text-rose-700 block text-sm flex-1 min-w-0 truncate">${e.DOX_REF || 'N/A'} — ${e.B2B || 'N/A'}</strong>
                    <span class="text-xs font-semibold text-rose-700 shrink-0 ml-2">${_fmtAmt(e.AMOUNT)}</span>
                </div>
                <div class="flex justify-between mt-1">
                    <span class="text-xs text-gray-500">${_toDateStr(e.IO_TIMESTAMP)} · ${e.BRANCH || ''}</span>
                </div>
            </li>
        `).join('');

        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderExpenseDetail(li.dataset.key);
            })
        );
    }

    function _renderExpenseDetail(key) {
        const entry = _allExpenses.find(e => e.DOX_KEY === key);
        if (!entry) return;

        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <!-- Header -->
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-5">
                        <div>
                            <h1 class="text-xl font-bold text-rose-800 tracking-tight">Expense Claim</h1>
                            <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-semibold text-gray-700">${entry.BRANCH || 'N/A'}</span></p>
                        </div>
                        <div class="flex flex-col items-start sm:items-end gap-2">
                            <span class="text-xl font-bold text-rose-700">${_fmtAmt(entry.AMOUNT)}</span>
                            <p class="text-sm text-gray-500">Ref #: <span class="font-bold text-gray-800">${entry.DOX_REF || 'N/A'}</span></p>
                            <p class="text-xs text-gray-400">Date: ${_toDateStr(entry.IO_TIMESTAMP)}</p>
                        </div>
                    </div>

                    <!-- Details -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                        <div>
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Employee / Claimant</h3>
                            <p class="font-semibold text-gray-800">${entry.B2B || 'N/A'}</p>
                        </div>
                        <div>
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Details</h3>
                            <p class="text-gray-600">Amount: <span class="font-bold text-rose-700">${_fmtAmt(entry.AMOUNT)}</span></p>
                        </div>
                    </div>

                    <!-- Description -->
                    ${entry.DOX_DESCRIPTION ? `
                    <div class="bg-rose-50/40 border border-rose-100/50 rounded-lg p-3 text-xs text-rose-950">
                        <span class="font-semibold block text-rose-800 uppercase tracking-wider mb-1" style="font-size: 10px;">Description</span>
                        ${_escapeHtml(entry.DOX_DESCRIPTION)}
                    </div>
                    ` : ''}

                    <!-- General Ledger Postings -->
                    <details class="text-xs border border-slate-100 rounded-xl overflow-hidden" id="glPostingsDetails">
                        <summary class="cursor-pointer font-semibold text-gray-600 bg-slate-50 px-4 py-3 hover:bg-slate-100 transition-colors select-none">
                            📒 General Ledger Postings
                        </summary>
                        <div id="glPostingsContent" class="p-3 text-gray-400 text-xs">Loading…</div>
                    </details>

                    <script>(async function() {
                        try {
                            const ledgerRaw = await window.appDB?.getSheet('LEDGER');
                            const glEntries = Object.values(ledgerRaw || {}).filter(e => e.DOX_KEY === '${key}');
                            if (!glEntries.length) {
                                document.getElementById('glPostingsContent').innerHTML = '<p class="text-gray-400">No ledger entries found.</p>';
                                return;
                            }
                            glEntries.sort((a,b) => (a.IO_TIMESTAMP || '').localeCompare(b.IO_TIMESTAMP || ''));
                            const rows = glEntries.map(e => '<tr class="border-b border-slate-50">' +
                                '<td class="py-1.5 px-2 text-gray-700">' + (e.ACCOUNT || '—') + '</td>' +
                                '<td class="py-1.5 px-2 text-right text-green-700 font-medium">' + ((+e.DEBIT||0) ? '₹'+(+e.DEBIT).toFixed(2) : '—') + '</td>' +
                                '<td class="py-1.5 px-2 text-right text-red-700 font-medium">' + ((+e.CREDIT||0) ? '₹'+(+e.CREDIT).toFixed(2) : '—') + '</td>' +
                                '<td class="py-1.5 px-2 text-gray-500 text-[10px]">' + (e.NARRATION || '') + '</td>' +
                                '</tr>').join('');
                            document.getElementById('glPostingsContent').innerHTML =
                                '<table class="w-full text-[11px]"><thead><tr class="bg-slate-100 text-gray-500 font-semibold uppercase tracking-wider">' +
                                '<th class="py-2 px-2 text-left">Account</th><th class="py-2 px-2 text-right">Debit</th>' +
                                '<th class="py-2 px-2 text-right">Credit</th><th class="py-2 px-2 text-left">Narration</th>' +
                                '</tr></thead><tbody>' + rows + '</tbody></table>';
                        } catch(glErr) {
                            document.getElementById('glPostingsContent').innerHTML = '<p class="text-red-500">Failed to load GL postings.</p>';
                            console.error('GL postings error:', glErr);
                        }
                    })();</script>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // B. PETTY CASH — LEDGER-based running balance
    // ══════════════════════════════════════════════════════════════════════════

    function _renderPettyCashList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        const accounts = {};
        _allLedger.forEach(e => {
            const acct = (e.ACCOUNT || '').toLowerCase();
            if (acct.includes('cash in hand') || acct.includes('petty cash')) {
                if (!accounts[e.ACCOUNT]) accounts[e.ACCOUNT] = [];
                accounts[e.ACCOUNT].push(e);
            }
        });

        const accountNames = Object.keys(accounts).sort();
        if (!accountNames.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No cash accounts found in ledger.</li>';
            return;
        }

        // For each account, compute balance
        ul.innerHTML = accountNames.map(acctName => {
            const entries = accounts[acctName];
            const sortedEntries = entries.sort((a, b) => ((a.IO_TIMESTAMP || '') > (b.IO_TIMESTAMP || '') ? 1 : -1));
            const withBal = _computeRunningBalance(sortedEntries, 0);
            const currentBal = withBal.length ? withBal[withBal.length - 1].RUNNING_BALANCE : 0;
            const balClass = currentBal >= 0 ? 'text-green-600' : 'text-red-600';
            return `<li data-account="${_escapeHtml(acctName)}" class="p-3 rounded-lg cursor-pointer hover:bg-yellow-50 border border-gray-200 transition-colors">
                <div class="flex items-center justify-between">
                    <strong class="text-yellow-800 block text-sm">🪙 ${_escapeHtml(acctName)}</strong>
                    <span class="${balClass} text-sm font-bold">${_fmtAmt(currentBal)}</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">${entries.length} entries</div>
            </li>`;
        }).join('');

        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderPettyCashDetail(li.dataset.account);
            })
        );

        // Auto-select first
        const firstLi = ul.querySelector('li');
        if (firstLi) {
            firstLi.classList.add('selected');
            _renderPettyCashDetail(firstLi.dataset.account);
        }
    }

    function _renderPettyCashDetail(accountName) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        const entries = _allLedger.filter(e =>
            (e.ACCOUNT || '').toLowerCase() === (accountName || '').toLowerCase()
        ).sort((a, b) => ((a.IO_TIMESTAMP || '') > (b.IO_TIMESTAMP || '') ? 1 : -1));

        const opening = 0;
        const withBal = _computeRunningBalance(entries, opening);
        const currentBal = withBal.length ? withBal[withBal.length - 1].RUNNING_BALANCE : 0;
        const totalDebit = entries.reduce((s, e) => s + (+e.DEBIT || 0), 0);
        const totalCredit = entries.reduce((s, e) => s + (+e.CREDIT || 0), 0);

        const balClass = currentBal >= 0 ? 'text-green-600' : 'text-red-600';
        const tableRows = withBal.map(e => `
            <tr class="border-b border-gray-100 hover:bg-gray-50/50">
                <td class="py-1.5 px-2 text-xs text-gray-500">${_toDateStr(e.IO_TIMESTAMP)}</td>
                <td class="py-1.5 px-2 text-xs text-gray-600">${_escapeHtml(e.NARRATION || '')}</td>
                <td class="py-1.5 px-2 text-right text-xs text-green-700">${(+e.DEBIT||0) ? _fmtAmt(e.DEBIT) : '—'}</td>
                <td class="py-1.5 px-2 text-right text-xs text-red-700">${(+e.CREDIT||0) ? _fmtAmt(e.CREDIT) : '—'}</td>
                <td class="py-1.5 px-2 text-right text-xs font-semibold ${e.RUNNING_BALANCE >= 0 ? 'text-gray-800' : 'text-red-600'}">${_fmtAmt(e.RUNNING_BALANCE)}</td>
            </tr>
        `).join('');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <div class="flex items-center justify-between border-b border-gray-100 pb-4">
                        <h1 class="text-xl font-bold text-yellow-800">🪙 ${_escapeHtml(accountName)}</h1>
                        <span class="text-2xl font-black ${balClass}">${_fmtAmt(currentBal)}</span>
                    </div>

                    <!-- Summary cards -->
                    <div class="grid grid-cols-3 gap-3">
                        <div class="bg-green-50 rounded-lg p-3 border border-green-200 text-center">
                            <div class="text-[10px] text-green-600 font-semibold uppercase tracking-wider">Total Inflow</div>
                            <div class="text-lg font-bold text-green-700 mt-1">${_fmtAmt(totalDebit)}</div>
                        </div>
                        <div class="bg-red-50 rounded-lg p-3 border border-red-200 text-center">
                            <div class="text-[10px] text-red-600 font-semibold uppercase tracking-wider">Total Outflow</div>
                            <div class="text-lg font-bold text-red-700 mt-1">${_fmtAmt(totalCredit)}</div>
                        </div>
                        <div class="bg-yellow-50 rounded-lg p-3 border border-yellow-200 text-center">
                            <div class="text-[10px] text-yellow-600 font-semibold uppercase tracking-wider">Net Balance</div>
                            <div class="text-lg font-bold ${balClass} mt-1">${_fmtAmt(currentBal)}</div>
                        </div>
                    </div>

                    <!-- Statement Table -->
                    <div class="overflow-hidden border border-gray-100 rounded-lg">
                        <table class="min-w-full text-xs">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="py-2 px-2 text-left font-bold text-gray-500 uppercase">Date</th>
                                    <th class="py-2 px-2 text-left font-bold text-gray-500 uppercase">Narration</th>
                                    <th class="py-2 px-2 text-right font-bold text-green-600 uppercase">In (Dr)</th>
                                    <th class="py-2 px-2 text-right font-bold text-red-600 uppercase">Out (Cr)</th>
                                    <th class="py-2 px-2 text-right font-bold text-gray-500 uppercase">Balance</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white">${tableRows || '<tr><td colspan="5" class="text-center py-4 text-gray-400">No entries</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // C. STAFF ADVANCES — LEDGER-based, grouped by STAFF_CODE
    // ══════════════════════════════════════════════════════════════════════════

    function _renderStaffAdvancesList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        const grouped = {};
        _allLedger.forEach(e => {
            const acct = (e.ACCOUNT || '').toLowerCase();
            if (acct.includes('staff advance') && e.STAFF_CODE) {
                if (!grouped[e.STAFF_CODE]) grouped[e.STAFF_CODE] = [];
                grouped[e.STAFF_CODE].push(e);
            }
        });

        const staffCodes = Object.keys(grouped).sort();
        if (!staffCodes.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No staff advances found in ledger.</li>';
            return;
        }

        ul.innerHTML = staffCodes.map(code => {
            const entries = grouped[code];
            const net = entries.reduce((s, e) => s + (+e.DEBIT || 0) - (+e.CREDIT || 0), 0);
            const balClass = net >= 0 ? 'text-red-600' : 'text-green-600'; // Debit = owed by employee
            return `<li data-staff="${_escapeHtml(code)}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <div class="flex items-center justify-between">
                    <strong class="text-indigo-700 block text-sm">👤 ${_escapeHtml(code)}</strong>
                    <span class="${balClass} text-sm font-bold">${_fmtAmt(Math.abs(net))} ${net >= 0 ? '(Dr)' : '(Cr)'}</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">${entries.length} entries</div>
            </li>`;
        }).join('');

        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderStaffAdvanceDetail(li.dataset.staff);
            })
        );

        const firstLi = ul.querySelector('li');
        if (firstLi) {
            firstLi.classList.add('selected');
            _renderStaffAdvanceDetail(firstLi.dataset.staff);
        }
    }

    function _renderStaffAdvanceDetail(staffCode) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        const entries = _allLedger.filter(e =>
            (e.ACCOUNT || '').toLowerCase().includes('staff advance') &&
            e.STAFF_CODE === staffCode
        ).sort((a, b) => ((a.IO_TIMESTAMP || '') > (b.IO_TIMESTAMP || '') ? 1 : -1));

        const opening = 0;
        const withBal = _computeRunningBalance(entries, opening);
        const currentBal = withBal.length ? withBal[withBal.length - 1].RUNNING_BALANCE : 0;

        const tableRows = withBal.map(e => `
            <tr class="border-b border-gray-100 hover:bg-gray-50/50">
                <td class="py-1.5 px-2 text-xs text-gray-500">${_toDateStr(e.IO_TIMESTAMP)}</td>
                <td class="py-1.5 px-2 text-xs text-gray-600">${_escapeHtml(e.NARRATION || '')}</td>
                <td class="py-1.5 px-2 text-xs text-gray-500">${_escapeHtml(e.BRANCH || '')}</td>
                <td class="py-1.5 px-2 text-right text-xs text-green-700">${(+e.DEBIT||0) ? _fmtAmt(e.DEBIT) : '—'}</td>
                <td class="py-1.5 px-2 text-right text-xs text-red-700">${(+e.CREDIT||0) ? _fmtAmt(e.CREDIT) : '—'}</td>
                <td class="py-1.5 px-2 text-right text-xs font-semibold ${e.RUNNING_BALANCE >= 0 ? 'text-red-600' : 'text-green-600'}">${_fmtAmt(e.RUNNING_BALANCE)}</td>
            </tr>
        `).join('');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <div class="flex items-center justify-between border-b border-gray-100 pb-4">
                        <h1 class="text-xl font-bold text-indigo-800">👤 Staff Advance — ${_escapeHtml(staffCode)}</h1>
                        <span class="text-xl font-black ${currentBal >= 0 ? 'text-red-600' : 'text-green-600'}">${_fmtAmt(Math.abs(currentBal))} ${currentBal >= 0 ? 'Dr' : 'Cr'}</span>
                    </div>

                    <div class="overflow-hidden border border-gray-100 rounded-lg">
                        <table class="min-w-full text-xs">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="py-2 px-2 text-left font-bold text-gray-500 uppercase">Date</th>
                                    <th class="py-2 px-2 text-left font-bold text-gray-500 uppercase">Narration</th>
                                    <th class="py-2 px-2 text-left font-bold text-gray-500 uppercase">Branch</th>
                                    <th class="py-2 px-2 text-right font-bold text-green-600 uppercase">Debit</th>
                                    <th class="py-2 px-2 text-right font-bold text-red-600 uppercase">Credit</th>
                                    <th class="py-2 px-2 text-right font-bold text-gray-500 uppercase">Balance</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white">${tableRows || '<tr><td colspan="6" class="text-center py-4 text-gray-400">No entries</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // D. BRANCH ADVANCES — LEDGER-based, grouped by BRANCH
    // ══════════════════════════════════════════════════════════════════════════

    function _renderBranchAdvancesList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        const grouped = {};
        _allLedger.forEach(e => {
            const acct = (e.ACCOUNT || '').toLowerCase();
            if (acct.includes('branch advance') && e.BRANCH) {
                if (!grouped[e.BRANCH]) grouped[e.BRANCH] = [];
                grouped[e.BRANCH].push(e);
            }
        });

        const branches = Object.keys(grouped).sort();
        if (!branches.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No branch advances found in ledger.</li>';
            return;
        }

        ul.innerHTML = branches.map(br => {
            const entries = grouped[br];
            const net = entries.reduce((s, e) => s + (+e.DEBIT || 0) - (+e.CREDIT || 0), 0);
            const balClass = net >= 0 ? 'text-red-600' : 'text-green-600';
            return `<li data-branch="${_escapeHtml(br)}" class="p-3 rounded-lg cursor-pointer hover:bg-teal-50 border border-gray-200 transition-colors">
                <div class="flex items-center justify-between">
                    <strong class="text-teal-700 block text-sm">🏢 ${_escapeHtml(br)}</strong>
                    <span class="${balClass} text-sm font-bold">${_fmtAmt(Math.abs(net))} ${net >= 0 ? '(Dr)' : '(Cr)'}</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">${entries.length} entries</div>
            </li>`;
        }).join('');

        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderBranchAdvanceDetail(li.dataset.branch);
            })
        );

        const firstLi = ul.querySelector('li');
        if (firstLi) {
            firstLi.classList.add('selected');
            _renderBranchAdvanceDetail(firstLi.dataset.branch);
        }
    }

    function _renderBranchAdvanceDetail(branchCode) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        const entries = _allLedger.filter(e =>
            (e.ACCOUNT || '').toLowerCase().includes('branch advance') &&
            (e.BRANCH || '').toLowerCase() === (branchCode || '').toLowerCase()
        ).sort((a, b) => ((a.IO_TIMESTAMP || '') > (b.IO_TIMESTAMP || '') ? 1 : -1));

        const opening = 0;
        const withBal = _computeRunningBalance(entries, opening);
        const currentBal = withBal.length ? withBal[withBal.length - 1].RUNNING_BALANCE : 0;

        const tableRows = withBal.map(e => `
            <tr class="border-b border-gray-100 hover:bg-gray-50/50">
                <td class="py-1.5 px-2 text-xs text-gray-500">${_toDateStr(e.IO_TIMESTAMP)}</td>
                <td class="py-1.5 px-2 text-xs text-gray-600">${_escapeHtml(e.NARRATION || '')}</td>
                <td class="py-1.5 px-2 text-right text-xs text-green-700">${(+e.DEBIT||0) ? _fmtAmt(e.DEBIT) : '—'}</td>
                <td class="py-1.5 px-2 text-right text-xs text-red-700">${(+e.CREDIT||0) ? _fmtAmt(e.CREDIT) : '—'}</td>
                <td class="py-1.5 px-2 text-right text-xs font-semibold ${e.RUNNING_BALANCE >= 0 ? 'text-red-600' : 'text-green-600'}">${_fmtAmt(e.RUNNING_BALANCE)}</td>
            </tr>
        `).join('');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <div class="flex items-center justify-between border-b border-gray-100 pb-4">
                        <h1 class="text-xl font-bold text-teal-800">🏢 Branch Advance — ${_escapeHtml(branchCode)}</h1>
                        <span class="text-xl font-black ${currentBal >= 0 ? 'text-red-600' : 'text-green-600'}">${_fmtAmt(Math.abs(currentBal))} ${currentBal >= 0 ? 'Dr' : 'Cr'}</span>
                    </div>

                    <div class="overflow-hidden border border-gray-100 rounded-lg">
                        <table class="min-w-full text-xs">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="py-2 px-2 text-left font-bold text-gray-500 uppercase">Date</th>
                                    <th class="py-2 px-2 text-left font-bold text-gray-500 uppercase">Narration</th>
                                    <th class="py-2 px-2 text-right font-bold text-green-600 uppercase">Debit</th>
                                    <th class="py-2 px-2 text-right font-bold text-red-600 uppercase">Credit</th>
                                    <th class="py-2 px-2 text-right font-bold text-gray-500 uppercase">Balance</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white">${tableRows || '<tr><td colspan="5" class="text-center py-4 text-gray-400">No entries</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // E. LOAD — routes to correct tile
    // ══════════════════════════════════════════════════════════════════════════

    async function _loadExpenseClaims() {
        window.setLoading?.(true, 'Loading expense claims...', 'list');
        try {
            if (!window.appDB) {
                document.getElementById('vaultListMsg').textContent = 'IDB not available. Please wait for sync to complete.';
                return;
            }
            const activeBranch = VaultPage.getActiveBranch();
            if (!activeBranch) {
                document.getElementById('vaultListMsg').textContent = 'No branch selected.';
                return;
            }
            const raw = await window.appDB.getSheet('HEADER');
            _allExpenses = Object.values(raw || {}).filter(h =>
                h.DOX_TYPE === 'Expense Claim' &&
                (h.BRANCH || '').toLowerCase() === activeBranch.toLowerCase()
            );
            document.getElementById('vaultListMsg').textContent = '';
            _renderExpenseList();
        } catch (err) {
            document.getElementById('vaultListMsg').textContent = 'Error: ' + (err.message || err);
        } finally {
            window.setLoading?.(false);
        }
    }

    async function _loadLedgerView() {
        window.setLoading?.(true, 'Loading...', 'list');
        try {
            if (!window.appDB) {
                document.getElementById('vaultListMsg').textContent = 'IDB not available. Please wait for sync to complete.';
                return;
            }
            const raw = await window.appDB.getSheet('LEDGER');
            _allLedger = Object.values(raw || {});
            document.getElementById('vaultListMsg').textContent = '';

            if (_activeType === 'petty-cash') {
                _renderPettyCashList();
            } else if (_activeType === 'staff-advances') {
                _renderStaffAdvancesList();
            } else if (_activeType === 'branch-advances') {
                _renderBranchAdvancesList();
            }
        } catch (err) {
            document.getElementById('vaultListMsg').textContent = 'Error: ' + (err.message || err);
        } finally {
            window.setLoading?.(false);
        }
    }

    async function load() {
        _injectListPane();

        if (_activeType === 'expense-claims') {
            await _loadExpenseClaims();
        } else {
            await _loadLedgerView();
        }
    }

    function search() {
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        if (_activeType === 'expense-claims') {
            const filtered = _allExpenses.filter(e =>
                !q || (e.DOX_REF || '').toLowerCase().includes(q) || (e.B2B || '').toLowerCase().includes(q)
            );
            if (!filtered.length) {
                ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No matching expense claims.</li>';
                return;
            }
            ul.querySelectorAll('li').forEach(li => {
                const key = li.dataset.key;
                const match = filtered.some(e => e.DOX_KEY === key);
                li.style.display = match ? '' : 'none';
            });
        } else {
            // For LEDGER-based views, filter by text content of each list item
            ul.querySelectorAll('li').forEach(li => {
                const match = !q || (li.textContent || '').toLowerCase().includes(q);
                li.style.display = match ? '' : 'none';
            });
        }
    }

    function setType(type) {
        _activeType = type;
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) {
            const labels = {
                'expense-claims': 'Search by reference, employee…',
                'petty-cash': 'Search cash accounts…',
                'staff-advances': 'Search staff…',
                'branch-advances': 'Search branches…',
            };
            searchInput.placeholder = labels[type] || 'Search…';
        }

        // Hide Add button for ledger-based views
        const addBtn = document.getElementById('vaultAddBtn');
        if (addBtn) {
            addBtn.classList.toggle('hidden', type !== 'expense-claims');
        }
    }

    // ── Create form ─────────────────────────────────────────────────────────
    function openAddPane() {
        if (_activeType !== 'expense-claims') return;

        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Record Expense Claim</h3></div>
                <div class="detail-card-body text-center py-8 text-gray-400 text-sm">
                    <div class="text-4xl mb-3">🚧</div>
                    <p class="font-semibold text-gray-600">Coming Soon</p>
                    <p class="text-xs mt-1">Creating expense claims through Manager.io will be available in a future update.</p>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Wallet → redirect to petty-cash ─────────────────────────────────────
    async function showWallet() {
        setType('petty-cash');
        document.getElementById('vaultAddBtn')?.classList.add('hidden');
        await load();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // E. EXPORTS
    // ══════════════════════════════════════════════════════════════════════════

    return {
        load,
        search,
        openAddPane,
        showWallet,
        setType,
    };
})();

window.VaultExpenses = VaultExpenses;
