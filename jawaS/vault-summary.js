// ============================================================================
// VAULT-SUMMARY.JS — Dashboard, Reports, Bank Recon, Bulk Import
// Tiles: summary, reports, bank-recon, bulk-import
// Legacy API calls removed — being migrated to Manager.io.
// ============================================================================

const VaultSummary = (() => {

    let _allLEDGER = [];
    let _allB2B    = [];
    let _activeView = 'summary';



    function _injectListPane(placeholder = 'Search client code or name…') {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = placeholder;
    }

    function _renderSummaryList(entries) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
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
                <div class="text-xs font-semibold mt-1 ${bal >= 0 ? 'text-red-600' : 'text-green-600'}">₹${Math.abs(bal).toFixed(2)} ${bal >= 0 ? 'Dr' : 'Cr'}</div>
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
        if (_activeView !== 'summary') {
            const lq = q.toLowerCase();
            _renderSummaryList(_allLEDGER.filter(e =>
                (e.CODE || '').toLowerCase().includes(lq) ||
                (e.CLIENT_NAME || '').toLowerCase().includes(lq)
            ));
            return;
        }
        // Filter financial categories
        const lq = q.toLowerCase();
        document.querySelectorAll('.financial-cat').forEach(li => {
            const label = li.textContent.toLowerCase();
            li.style.display = label.includes(lq) ? '' : 'none';
        });
        // Show/hide section headers based on whether any sibling category is visible
        document.querySelectorAll('.section-header').forEach(header => {
            let hasVisible = false;
            let el = header.nextElementSibling;
            while (el && !el.classList.contains('section-header')) {
                if (el.classList.contains('financial-cat') && el.style.display !== 'none') {
                    hasVisible = true;
                    break;
                }
                el = el.nextElementSibling;
            }
            header.style.display = hasVisible ? '' : 'none';
        });
    }

    // ── Statement View ────────────────────────────────────────────────────────
    async function _showStatement(code) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">📊 Statement view is being migrated to Manager.io. Coming soon.</div>';
        VaultPage.showDetailPane();
    }





    // ── TILE: Financial Summary Dashboard ────────────────────────────────────
    // Shows combined Balance Sheet + Profit & Loss with drill-down by category
    
    // Category definitions for sidebar
    const _FINANCIAL_CATEGORIES = [
        { id: 'all',        icon: '📊', label: 'All',       section: 'Overview' },
        { id: 'assets',     icon: '🏛️', label: 'Assets',    section: 'Balance Sheet' },
        { id: 'liabilities',icon: '📋', label: 'Liabilities',section: 'Balance Sheet' },
        { id: 'equity',     icon: '💰', label: 'Equity',    section: 'Balance Sheet' },
        { id: 'income',     icon: '📈', label: 'Income',    section: 'Profit & Loss' },
        { id: 'expenses',   icon: '💸', label: 'Expenses',  section: 'Profit & Loss' },
    ];

    function _renderFinancialCategories() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        let sections = {};
        _FINANCIAL_CATEGORIES.forEach(cat => {
            if (!sections[cat.section]) sections[cat.section] = [];
            sections[cat.section].push(cat);
        });
        ul.innerHTML = Object.entries(sections).map(([section, cats]) => `
            <li class="section-header text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pt-4 pb-1">${section}</li>
            ${cats.map(c => `<li data-category="${c.id}" class="financial-cat px-3 py-2.5 rounded-lg cursor-pointer hover:bg-blue-50 transition-all flex items-center gap-3 border border-transparent hover:border-blue-200 mb-0.5 text-sm font-medium text-gray-700">
                <span class="text-lg">${c.icon}</span>
                <span>${c.label}</span>
            </li>`).join('')}
        `).join('');
        ul.querySelectorAll('.financial-cat').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('.financial-cat').forEach(x => {
                    x.classList.remove('selected', 'bg-blue-100', 'border-blue-300', 'text-blue-700');
                    x.classList.add('border-transparent');
                });
                li.classList.add('selected', 'bg-blue-100', 'border-blue-300', 'text-blue-700');
                li.classList.remove('border-transparent');
                _showFinancialCategory(li.dataset.category);
            })
        );
    }

    async function _showFinancialCategory(categoryId) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        
        if (categoryId === 'all') {
            await showDashboard();
            return;
        }
        
        view.innerHTML = '<div class="text-center text-gray-400 py-8">📊 Financial detail view is being migrated to Manager.io. Coming soon.</div>';
        VaultPage.showDetailPane();
    }



    async function showDashboard() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="flex items-center justify-center py-12">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span class="ml-3 text-sm text-gray-500 font-medium">Computing summary...</span>
            </div>
        `;
        VaultPage.showDetailPane();

        try {
            const data = await getAppData();
            if (!data) {
                view.innerHTML = '<div class="text-center text-gray-400 py-8">No data found.</div>';
                return;
            }

            const ledger = Object.values(data.LEDGER || {});
            const b2b = Object.values(data.B2B || {});
            const staff = Object.values(data.STAFF || {});

            const branch = VaultPage.getActiveBranch();
            const branchLower = (branch || '').toLowerCase();

            // 1. Receivables
            let receivablesSum = 0;
            const clientBalMap = {};
            ledger.forEach(e => {
                if (e.CODE && e.ACCOUNT === 'Accounts receivable' && (!branchLower || (e.BRANCH || '').toLowerCase() === branchLower)) {
                    clientBalMap[e.CODE] = (clientBalMap[e.CODE] || 0) + (+(e.DEBIT || 0) - +(e.CREDIT || 0));
                }
            });
            b2b.forEach(c => {
                if (c.B2B_TYPE === 'CLIENT' && c.CODE && (!branchLower || (c.BRANCH || '').toLowerCase() === branchLower)) {
                    const opening = +(c.BAL_LAST_FY || 0);
                    const running = clientBalMap[c.CODE] || 0;
                    receivablesSum += (opening + running);
                }
            });

            // 2. Payables
            let payablesSum = 0;
            const supplierBalMap = {};
            ledger.forEach(e => {
                if (e.CODE && e.ACCOUNT === 'Accounts payable' && (!branchLower || (e.BRANCH || '').toLowerCase() === branchLower)) {
                    supplierBalMap[e.CODE] = (supplierBalMap[e.CODE] || 0) + (+(e.CREDIT || 0) - +(e.DEBIT || 0));
                }
            });
            b2b.forEach(c => {
                if ((c.B2B_TYPE === 'SUPPLIER' || c.B2B_TYPE === 'CARRIER') && c.CODE && (!branchLower || (c.BRANCH || '').toLowerCase() === branchLower)) {
                    const opening = +(c.BAL_LAST_FY || 0);
                    const running = supplierBalMap[c.CODE] || 0;
                    payablesSum += (opening + running);
                }
            });

            // 3. Bank & Cash balances
            let bankBalanceSum = 0;
            let loadedLive = false;
            
            const getClientCodeForBranch = (bName) => {
                const b = bName?.toLowerCase();
                const found = b2b.find(c => (c.BRANCH || '').toLowerCase() === b);
                return found ? found.CODE : null;
            };

            const clientCode = getClientCodeForBranch(branch);
            if (clientCode) {
                try {
                    const res = await callApi(`/api/manager/bank-accounts?code=${encodeURIComponent(clientCode)}`, {}, 'GET');
                    const list = res.bankAndCashAccounts || [];
                    list.forEach(a => {
                        bankBalanceSum += (+a.balance || 0);
                    });
                    loadedLive = true;
                } catch (err) {
                    console.error('[VaultSummary] Failed to fetch live bank accounts:', err);
                }
            }

            if (!loadedLive) {
                let ledgerBankSum = 0;
                ledger.forEach(e => {
                    if ((!branchLower || (e.BRANCH || '').toLowerCase() === branchLower) && e.ACCOUNT && (e.ACCOUNT.toLowerCase().includes('bank') || e.ACCOUNT.toLowerCase().includes('cash'))) {
                        ledgerBankSum += (+(e.DEBIT || 0) - +(e.CREDIT || 0));
                    }
                });
                bankBalanceSum = ledgerBankSum;
            }

            // 4. Staff Advances
            let staffAdvancesSum = 0;
            const staffBalMap = {};
            ledger.forEach(e => {
                if (e.STAFF_CODE && (!branchLower || (e.BRANCH || '').toLowerCase() === branchLower)) {
                    staffBalMap[e.STAFF_CODE] = (staffBalMap[e.STAFF_CODE] || 0) + (+(e.DEBIT || 0) - +(e.CREDIT || 0));
                }
            });
            staff.forEach(s => {
                if (s.STAFF_CODE && (!branchLower || (s.BRANCH || '').toLowerCase() === branchLower)) {
                    const opening = +(s.BAL_LAST_FY || 0);
                    const running = staffBalMap[s.STAFF_CODE] || 0;
                    staffAdvancesSum += (opening + running);
                }
            });

            const netExposure = bankBalanceSum + receivablesSum - payablesSum;

            view.innerHTML = `
                <div class="space-y-6 font-sans">
                    <div class="border-b pb-3">
                        <h3 class="font-bold text-gray-800 text-lg">🏛️ Financial Dashboard</h3>
                        <p class="text-xs text-gray-500">Overview of branch cash position and outstanding operations</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <!-- Receivables -->
                        <div id="dashReceivablesCard" class="p-4 bg-gradient-to-br from-red-50 to-white rounded-xl border border-red-200 shadow-sm cursor-pointer hover:shadow transition-all">
                            <div class="flex justify-between items-start">
                                <div>
                                    <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Total Receivables</span>
                                    <h4 class="text-2xl font-extrabold text-red-600 mt-1">₹${receivablesSum.toFixed(2)}</h4>
                                </div>
                                <span class="text-xl">👥</span>
                            </div>
                            <span class="text-xs text-gray-400 block mt-2">Outstanding customer balances →</span>
                        </div>

                        <!-- Payables -->
                        <div id="dashPayablesCard" class="p-4 bg-gradient-to-br from-green-50 to-white rounded-xl border border-green-200 shadow-sm cursor-pointer hover:shadow transition-all">
                            <div class="flex justify-between items-start">
                                <div>
                                    <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Total Payables</span>
                                    <h4 class="text-2xl font-extrabold text-green-600 mt-1">₹${payablesSum.toFixed(2)}</h4>
                                </div>
                                <span class="text-xl">🤝</span>
                            </div>
                            <span class="text-xs text-gray-400 block mt-2">Outstanding supplier obligations →</span>
                        </div>

                        <!-- Bank & Cash Balance -->
                        <div id="dashBankCard" class="p-4 bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-200 shadow-sm cursor-pointer hover:shadow transition-all">
                            <div class="flex justify-between items-start">
                                <div>
                                    <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Bank & Cash</span>
                                    <h4 class="text-2xl font-extrabold text-blue-600 mt-1">₹${bankBalanceSum.toFixed(2)}</h4>
                                </div>
                                <span class="text-xl">🏦</span>
                            </div>
                            <span class="text-xs text-gray-400 block mt-2">Total cash posture in accounts →</span>
                        </div>

                        <!-- Staff Advances -->
                        <div id="dashStaffCard" class="p-4 bg-gradient-to-br from-purple-50 to-white rounded-xl border border-purple-200 shadow-sm cursor-pointer hover:shadow transition-all">
                            <div class="flex justify-between items-start">
                                <div>
                                    <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Staff Advances</span>
                                    <h4 class="text-2xl font-extrabold text-purple-600 mt-1">₹${staffAdvancesSum.toFixed(2)}</h4>
                                </div>
                                <span class="text-xl">👤</span>
                            </div>
                            <span class="text-xs text-gray-400 block mt-2">Outstanding staff advance balances →</span>
                        </div>
                    </div>

                    <!-- Net Operational cash posture -->
                    <div class="p-5 bg-gradient-to-r from-gray-50 to-white border border-gray-200 rounded-xl shadow-sm">
                        <div class="flex justify-between items-center">
                            <div>
                                <h4 class="font-semibold text-gray-800 text-sm">🛡️ Net Operational Posture</h4>
                                <span class="text-xs text-gray-500">Bank Balance + Receivables - Payables</span>
                            </div>
                            <div class="text-right">
                                <h3 class="text-2xl font-extrabold ${netExposure >= 0 ? 'text-green-700' : 'text-red-700'}">
                                    ₹${netExposure.toFixed(2)}
                                </h3>
                                <span class="text-xs font-mono text-gray-400 uppercase">${netExposure >= 0 ? 'Surplus' : 'Deficit'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Wire the click navigation
            document.getElementById('dashReceivablesCard').addEventListener('click', () => {
                VaultPage.activateTile('customers');
            });
            document.getElementById('dashPayablesCard').addEventListener('click', () => {
                VaultPage.activateTile('suppliers');
            });
            document.getElementById('dashBankCard').addEventListener('click', () => {
                VaultPage.activateTile('bank-accounts');
            });
            document.getElementById('dashStaffCard').addEventListener('click', () => {
                VaultPage.activateTile('employees');
            });

        } catch (err) {
            console.error('[VaultSummary] Failed to load dashboard:', err);
            view.innerHTML = `<div class="text-red-500 text-center py-8">Failed to compile dashboard: ${err.message || err}</div>`;
        }
    }

    // ── TILE: Reports Hub (P&L, Balance Sheet, Aging) ────────────────────────
    function showReports() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">📊 Reports are being migrated to Manager.io. Coming soon.</div>';
        VaultPage.showDetailPane();
    }

    async function _showPL(currentFY) {
        const rc = document.getElementById('reportContent');
        rc.innerHTML = '<div class="text-center text-gray-400 py-8">📈 P&L is being migrated to Manager.io. Coming soon.</div>';
    }

    async function _showBalanceSheet() {
        const rc = document.getElementById('reportContent');
        rc.innerHTML = '<div class="text-center text-gray-400 py-8">📋 Balance Sheet is being migrated to Manager.io. Coming soon.</div>';
    }

    async function _showAgingReport() {
        const rc = document.getElementById('reportContent');
        rc.innerHTML = '<div class="text-center text-gray-400 py-8">📅 Aging report is being migrated to Manager.io. Coming soon.</div>';
    }

    // ── TILE: Bank Reconciliation ─────────────────────────────────────────────
    function _showBankRecon() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">🏦 Bank Reconciliation</h3></div>
                <div class="detail-card-body">
                    <p class="text-sm text-gray-600 mb-4">Paste bank statement transactions (TSV format: <code>date\\tref\\tdebit\\tcredit\\tnarration</code> per line, or JSON array).</p>
                    <textarea id="bankStmtInput" rows="8" class="form-input text-xs font-mono mb-3" placeholder="2026-04-01\tNEFT123\t0\t50000\tPayment received&#10;2026-04-02\tCHQ001\t25000\t0\tCheque payment"></textarea>
                    <div class="flex gap-2 mb-4">
                        <button id="bankParseBtn" class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">Parse & Match</button>
                    </div>
                    <div id="bankReconResult"></div>
                </div>
            </div>`;

        document.getElementById('bankParseBtn').addEventListener('click', () => _parseBankStmt());
        VaultPage.showDetailPane();
    }

    async function _parseBankStmt() {
        const result = document.getElementById('bankReconResult');
        const raw = document.getElementById('bankStmtInput').value.trim();
        if (!raw) { result.innerHTML = '<p class="text-red-500 text-sm">Paste bank statement data first.</p>'; return; }

        let transactions = [];
        // Try parsing as JSON first
        try {
            transactions = JSON.parse(raw);
            if (!Array.isArray(transactions)) throw new Error('Not an array');
        } catch {
            // Parse as TSV
            transactions = raw.split('\n').filter(l => l.trim()).map((line, i) => {
                const parts = line.split('\t');
                return {
                    date: parts[0]?.trim() || '',
                    ref: parts[1]?.trim() || '',
                    debit: parseFloat(parts[2]) || 0,
                    credit: parseFloat(parts[3]) || 0,
                    narration: parts.slice(4).join(' ').trim() || ''
                };
            });
        }

        if (!transactions.length) {
            result.innerHTML = '<p class="text-red-500 text-sm">No transactions parsed.</p>';
            return;
        }

        // Fetch all ACTIVE PAYMENT entries from LEDGER to match against
        const allLedger = await getAppData().then(d => d?.LEDGER ? Object.values(d.LEDGER) : []);
        const payments = allLedger.filter(e =>
            e.STATUS === 'ACTIVE' &&
            e.ENTRY_TYPE === 'PAYMENT' &&
            (e.PAYMENT_MODE === 'CHEQUE' || e.PAYMENT_MODE === 'NEFT' || e.PAYMENT_MODE === 'UPI')
        );

        // Match by amount + date proximity
        const matched = [];
        const unmatched = [];

        for (const txn of transactions) {
            const txnDate = new Date(txn.date).getTime();
            const txnAmount = txn.credit || txn.debit;
            const isCredit = txn.credit > 0;

            // Find matching ledger entry
            const match = payments.find(p => {
                const pAmount = isCredit ? (+p.CREDIT || 0) : (+p.DEBIT || 0);
                const pDate = +p.ENTRY_DATE || 0;
                const dateDiff = Math.abs(pDate - txnDate);
                const amountDiff = Math.abs(pAmount - txnAmount);
                return amountDiff < 1 && (dateDiff < 7 * 24 * 60 * 60 * 1000); // 7 days window
            });

            if (match) {
                matched.push({ txn, entry: match });
            } else {
                unmatched.push(txn);
            }
        }

        result.innerHTML = `
            <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
                    <div class="text-xs text-gray-500 uppercase">Total Transactions</div>
                    <div class="text-lg font-bold">${transactions.length}</div>
                </div>
                <div class="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
                    <div class="text-xs text-gray-500 uppercase">Matched</div>
                    <div class="text-lg font-bold text-blue-700">${matched.length}</div>
                </div>
                <div class="p-3 bg-red-50 rounded-lg border border-red-200 text-center">
                    <div class="text-xs text-gray-500 uppercase">Unmatched</div>
                    <div class="text-lg font-bold text-red-700">${unmatched.length}</div>
                </div>
            </div>
            ${matched.length ? `<div class="detail-card mb-3">
                <div class="detail-card-header"><h4 class="text-sm font-semibold text-blue-700">✅ Matched (${matched.length})</h4></div>
                <div class="detail-card-body overflow-x-auto max-h-48 overflow-y-auto">
                    <table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-1">Date</th><th class="px-2 py-1">Ref</th><th class="px-2 py-1 text-right">Amount</th>
                            <th class="px-2 py-1">Ledger</th><th class="px-2 py-1">Code</th>
                        </tr></thead>
                        <tbody>${matched.map(m => `<tr class="border-b">
                            <td class="px-2 py-1">${m.txn.date}</td>
                            <td class="px-2 py-1">${m.txn.ref}</td>
                            <td class="px-2 py-1 text-right">₹${(m.txn.credit || m.txn.debit).toFixed(2)}</td>
                            <td class="px-2 py-1">${m.entry.PAYMENT_MODE} ${m.entry.CHEQUE_NUMBER || m.entry.TXN_REF || ''}</td>
                            <td class="px-2 py-1">${m.entry.CODE || ''}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>` : ''}
            ${unmatched.length ? `<div class="detail-card">
                <div class="detail-card-header"><h4 class="text-sm font-semibold text-red-700">❌ Unmatched (${unmatched.length})</h4></div>
                <div class="detail-card-body overflow-x-auto max-h-48 overflow-y-auto">
                    <table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-1">Date</th><th class="px-2 py-1">Ref</th><th class="px-2 py-1 text-right">Amount</th>
                            <th class="px-2 py-1">Narration</th>
                        </tr></thead>
                        <tbody>${unmatched.map(u => `<tr class="border-b">
                            <td class="px-2 py-1">${u.date}</td>
                            <td class="px-2 py-1">${u.ref}</td>
                            <td class="px-2 py-1 text-right">₹${(u.credit || u.debit).toFixed(2)}</td>
                            <td class="px-2 py-1 text-gray-500 truncate max-w-[200px]">${u.narration}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>` : ''}`;
    }

    // ── TILE: Bulk Import ────────────────────────────────────────────────────
    function showBulkImport() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">📥 Bulk Import is not supported under Manager.io integration.</div>';
        VaultPage.showDetailPane();
    }

    // ── Chart of Accounts — hardcoded reference ──────────────────────────────
    async function showChartOfAccounts() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">📒 Chart of Accounts data now comes from Manager.io. Use the cache endpoints.</div>';
        VaultPage.showDetailPane();
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane('Filter categories…');
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLEDGER = Object.values(data.LEDGER);
        }
        if (_activeView === 'summary') {
            _renderFinancialCategories();
            await showDashboard();
            // Auto-select 'All' category after dashboard loads
            const allCat = document.querySelector('[data-category=all]');
            if (allCat) {
                allCat.classList.add('selected', 'bg-blue-100', 'border-blue-300', 'text-blue-700');
                allCat.classList.remove('border-transparent');
            }
            showReports();
        } else if (_activeView === 'bank-recon') {
            _showBankRecon();
        } else if (_activeView === 'bulk-import') {
            showBulkImport();
        }
    }

    function setView(view) { _activeView = view; }

    return { load, search, showDashboard, showReports, showChartOfAccounts, showBulkImport, _showStatement, _showBankRecon, setView };
})();

window.VaultSummary = VaultSummary;
