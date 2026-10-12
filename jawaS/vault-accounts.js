// ============================================================================
// VAULT-ACCOUNTS.JS — Liquid Bank Accounts & Contra Transfers Register
// Tile: bank-accounts (🏛️ / 🏦)
// Architecture:
// 1. Control Account + Sub-Ledger Pattern:
//    - COA 3001: Master Bank Accounts Control Account.
//    - COA 3002: Branch Petty Cash Imprest Account.
//    - COA 3003: Branch Cash In Hand (Counter Collections) Account.
// 2. Sub-Ledger Storage: DATADB/bank_accounts.json stores all branch banks.
// 3. High-Contrast Typography: text-gray-950, font-mono, clear badges.
// 4. In-Pane Workflows:
//    - Contra Transfers (Cash Deposit, Withdrawal, Inter-Bank) in view pane.
//    - Add New Bank Account in view pane.
//    - Live Running Ledger Statement with date period filters.
// ============================================================================

const VaultAccounts = (() => {

    let _bankAccounts = [];
    let _cashAccounts = [];
    let _allAccounts = [];
    let _selectedAccount = null;
    let _activeTab = 'ALL'; // 'ALL', 'BANKS', 'CASH'
    let _statementPeriod = 'CFY'; // 'THIS_MONTH', 'CFY', 'PFY', 'ALL'
    let _statementData = null;
    let _activeTile = 'bank-accounts';

    const _escapeHtml = (str) => {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    function _fmtMoney(n) {
        const num = Number(n) || 0;
        return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function _fmtDate(dStr) {
        if (!dStr) return "—";
        try {
            const d = new Date(dStr);
            if (isNaN(d.getTime())) return dStr;
            return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        } catch (_) {
            return dStr;
        }
    }

    function _getAuthToken() {
        if (typeof getSessionId === 'function') {
            const s = getSessionId();
            if (s) return s;
        }
        try {
            const raw = localStorage.getItem('loginData') || localStorage.getItem('post4ex_session') || localStorage.getItem('session') || '';
            if (raw) {
                const parsed = JSON.parse(raw);
                return parsed.sessionId || parsed.token || parsed.jwt || parsed.access_token || raw;
            }
        } catch { /* fallback */ }
        return localStorage.getItem('token') || localStorage.getItem('jwt') || '';
    }

    function _getHeaders() {
        const token = _getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function _showToast(msg, isError = false) {
        if (typeof showToast === 'function') {
            showToast(msg, isError ? 'error' : 'success');
        } else if (typeof window.showNotification === 'function') {
            window.showNotification(msg, isError ? 'error' : 'success');
        } else {
            alert(msg);
        }
    }

    function _copyToClipboard(text, label = 'Copied') {
        if (!text) return;
        navigator.clipboard?.writeText(text).then(() => {
            _showToast(`${label} copied to clipboard!`);
        }).catch(() => {
            _showToast(`Failed to copy: ${text}`, true);
        });
    }

    // ========================================================================
    // DATA FETCHING
    // ========================================================================

    async function _fetchAccounts() {
        const branch = VaultPage.getActiveBranch() || '';
        const url = `/api/accounting/bank-accounts?branch_code=${encodeURIComponent(branch)}`;
        window.setLoading?.(true, 'Loading bank & cash accounts...', 'list');

        try {
            const res = await fetch(url, { headers: _getHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            _bankAccounts = json.bank_accounts || [];
            _cashAccounts = json.cash_accounts || [];
            _allAccounts = json.all_accounts || [..._bankAccounts, ..._cashAccounts];

            // Do not auto-select first account; keep null until user clicks
            if (_selectedAccount) {
                const refreshed = _allAccounts.find(a => (a.code || a.bank_code) === (_selectedAccount.code || _selectedAccount.bank_code));
                _selectedAccount = refreshed || null;
            }
        } catch (err) {
            console.error('[VaultAccounts] Failed to fetch accounts:', err);
            _bankAccounts = [];
            _cashAccounts = [];
            _allAccounts = [];
        } finally {
            window.setLoading?.(false);
        }
    }

    async function _fetchStatement(acct) {
        if (!acct) return;
        const branch = VaultPage.getActiveBranch() || '';
        let glCode = acct.gl_account_code || (acct.is_cash ? (acct.code === 'PETTY_CASH' ? '3002' : '3003') : '3001');
        let entityCode = acct.is_cash ? '' : (acct.bank_code || acct.code || '');

        let url = `/api/accounting/accounts/${encodeURIComponent(glCode)}/statement?branch_code=${encodeURIComponent(branch)}`;
        if (entityCode) {
            url += `&entity_code=${encodeURIComponent(entityCode)}`;
        }

        // Apply statement period
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        // Indian FY: starts Apr 1
        const fyStartYear = m >= 3 ? y : y - 1;

        if (_statementPeriod === 'THIS_MONTH') {
            const startM = new Date(y, m, 1).toISOString().split('T')[0];
            url += `&start_date=${startM}`;
        } else if (_statementPeriod === 'CFY') {
            const startFY = `${fyStartYear}-04-01`;
            url += `&start_date=${startFY}`;
        } else if (_statementPeriod === 'PFY') {
            const startPFY = `${fyStartYear - 1}-04-01`;
            const endPFY = `${fyStartYear}-03-31`;
            url += `&start_date=${startPFY}&end_date=${endPFY}`;
        }

        try {
            const res = await fetch(url, { headers: _getHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            _statementData = await res.json();
        } catch (err) {
            console.error('[VaultAccounts] Failed to fetch statement:', err);
            _statementData = { opening_balance: 0, lines: [], closing_balance: 0 };
        }
    }

    // ========================================================================
    // LEFT LIST PANE RENDERING
    // ========================================================================

    function _renderList() {
        const listEl = document.getElementById('vaultList');
        if (!listEl) return;
        listEl.innerHTML = '';

        const searchVal = (document.getElementById('vaultSearch')?.value || '').trim().toLowerCase();

        let list = _allAccounts;
        if (_activeTab === 'BANKS') list = _bankAccounts;
        else if (_activeTab === 'CASH') list = _cashAccounts;

        if (searchVal) {
            list = list.filter(a => {
                const name = (a.bank_name || a.account_name || '').toLowerCase();
                const code = (a.bank_code || a.code || '').toLowerCase();
                const num = (a.account_no || a.accountNumber || '').toLowerCase();
                const ifsc = (a.ifsc || '').toLowerCase();
                return name.includes(searchVal) || code.includes(searchVal) || num.includes(searchVal) || ifsc.includes(searchVal);
            });
        }

        const msgEl = document.getElementById('vaultListMsg');
        if (msgEl) {
            if (list.length === 0) {
                msgEl.textContent = 'No bank or cash accounts found.';
                msgEl.classList.remove('hidden');
            } else {
                msgEl.classList.add('hidden');
            }
        }

        // Render Tabs & Action Header
        const container = document.createElement('div');
        container.className = 'w-full flex flex-col gap-2 p-2';

        const headerRow = document.createElement('div');
        headerRow.className = 'flex items-center justify-between gap-1 pb-2 border-b border-gray-200';
        headerRow.innerHTML = `
            <div class="flex items-center gap-1">
                <button type="button" class="tab-btn px-2.5 py-1 text-xs font-semibold rounded-md ${_activeTab === 'ALL' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}" data-tab="ALL">All (${_allAccounts.length})</button>
                <button type="button" class="tab-btn px-2.5 py-1 text-xs font-semibold rounded-md ${_activeTab === 'BANKS' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}" data-tab="BANKS">Banks (${_bankAccounts.length})</button>
                <button type="button" class="tab-btn px-2.5 py-1 text-xs font-semibold rounded-md ${_activeTab === 'CASH' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}" data-tab="CASH">Cash (${_cashAccounts.length})</button>
            </div>
            <button type="button" id="btnAddBankModal" class="btn btn-sm btn-secondary text-xs px-2 py-1 flex items-center gap-1 font-medium text-gray-700" title="Add New Bank Account">
                <i class="fa-solid fa-plus text-blue-600"></i> New Bank
            </button>
        `;

        headerRow.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                _activeTab = btn.dataset.tab;
                _renderList();
            };
        });

        const btnAddBank = headerRow.querySelector('#btnAddBankModal');
        if (btnAddBank) {
            btnAddBank.onclick = () => openAddBankPane();
        }

        container.appendChild(headerRow);

        // Account Cards List
        const ul = document.createElement('ul');
        ul.className = 'flex flex-col gap-2 list-none p-0 m-0';

        list.forEach(acct => {
            const isSelected = _selectedAccount && (_selectedAccount.bank_code || _selectedAccount.code) === (acct.bank_code || acct.code);
            const isCash = !!acct.is_cash;
            const bal = Number(acct.balance || acct.current_balance || 0);

            const li = document.createElement('li');
            li.className = `p-3 rounded-lg border cursor-pointer transition-all duration-150 ${isSelected ? 'bg-blue-50/80 border-blue-500 shadow-sm ring-1 ring-blue-400' : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`;
            li.tabIndex = 0;

            const iconClass = isCash ? 'fa-wallet text-amber-600' : 'fa-building-columns text-blue-600';
            const badgeType = isCash ? 'CASH' : (acct.account_type || 'BANK');
            const primaryBadge = acct.is_primary ? `<span class="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">PRIMARY</span>` : '';

            li.innerHTML = `
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                        <div>
                            <div class="text-sm font-bold text-gray-950 flex items-center gap-1.5">
                                ${_escapeHtml(acct.bank_name || acct.account_name)}
                                ${primaryBadge}
                            </div>
                            <div class="text-xs text-gray-700 font-mono flex items-center gap-2">
                                <span>${_escapeHtml(acct.bank_code || acct.code)}</span>
                                ${acct.branch_code ? `<span class="px-1 bg-gray-200 text-gray-800 rounded font-semibold text-[10px]">${_escapeHtml(acct.branch_code)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-mono font-bold ${bal >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
                            ${_fmtMoney(bal)}
                        </div>
                        <div class="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                            ${badgeType}
                        </div>
                    </div>
                </div>
                ${!isCash && acct.account_no ? `
                    <div class="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600 font-mono flex items-center justify-between">
                        <span>A/c: ****${_escapeHtml(acct.account_no.slice(-4))}</span>
                        <span>IFSC: ${_escapeHtml(acct.ifsc || '—')}</span>
                    </div>
                ` : ''}
            `;

            li.onclick = () => selectAccount(acct);
            li.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectAccount(acct);
                }
            };

            ul.appendChild(li);
        });

        container.appendChild(ul);
        listEl.appendChild(container);
    }

    // ========================================================================
    // DETAIL VIEW PANE (STATEMENT & ACCOUNT CARD)
    // ========================================================================

    async function _renderDetail() {
        const viewEl = document.getElementById('vaultDetailView');
        if (!viewEl) return;
        viewEl.innerHTML = '';

        if (!_selectedAccount) {
            VaultPage.showDetail(false);
            return;
        }

        VaultPage.showDetail(true);

        const acct = _selectedAccount;
        const isCash = !!acct.is_cash;
        const bal = Number(acct.balance || acct.current_balance || 0);
        const code = acct.bank_code || acct.code;
        const name = acct.bank_name || acct.account_name;

        // Fetch statement
        await _fetchStatement(acct);
        const stmt = _statementData || { opening_balance: 0, lines: [], closing_balance: bal };
        const openBal = Number(stmt.opening_balance || 0);
        const closeBal = Number(stmt.closing_balance || bal);
        const lines = stmt.lines || stmt.entries || [];

        // Total Inflows / Outflows
        let totDr = 0;
        let totCr = 0;
        lines.forEach(l => {
            totDr += Number(l.debit || 0);
            totCr += Number(l.credit || 0);
        });

        const root = document.createElement('div');
        root.className = 'w-full p-4 flex flex-col gap-4 text-gray-900';

        // Top Summary Card
        const topCard = document.createElement('div');
        topCard.className = 'bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3';
        topCard.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl ${isCash ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'} flex items-center justify-center text-xl shadow-inner">
                        <i class="fa-solid ${isCash ? 'fa-wallet' : 'fa-building-columns'}"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-lg font-bold text-gray-950">${_escapeHtml(name)}</h2>
                            ${acct.is_primary ? `<span class="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-300">PRIMARY REMITTANCE</span>` : ''}
                            <span class="px-2 py-0.5 text-xs font-bold rounded-full border ${acct.status === 'INACTIVE' ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}">
                                ${acct.status === 'INACTIVE' ? 'INACTIVE (ARCHIVED)' : 'ACTIVE'}
                            </span>
                        </div>
                        <div class="text-xs text-gray-600 font-mono flex items-center gap-2 mt-0.5">
                            <span class="font-bold text-gray-900">Code: ${code}</span>
                            <button type="button" class="btnCopyCode text-gray-600 hover:text-blue-600 transition" title="Copy code">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                            <span class="text-gray-300">•</span>
                            <span>GL Control: ${acct.gl_account_code || (isCash ? (acct.code === 'PETTY_CASH' ? '3002' : '3003') : '3001')}</span>
                            <span class="text-gray-300">•</span>
                            <span class="px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded text-[11px] font-bold">Branch: ${_escapeHtml(acct.branch_code || 'ALL')}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" id="btnDetailContra" class="btn btn-sm btn-blue px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold shadow-sm">
                        <i class="fa-solid fa-money-bill-transfer"></i> Contra Transfer
                    </button>
                    ${!isCash ? `
                        <button type="button" id="btnDetailEdit" class="btn btn-sm btn-secondary px-2.5 py-1.5 text-xs font-medium text-gray-700 flex items-center gap-1" title="Edit Bank Details">
                            <i class="fa-solid fa-pen-to-square text-blue-600"></i> Edit
                        </button>
                        <button type="button" id="btnDetailDelete" class="btn btn-sm btn-secondary px-2.5 py-1.5 text-xs font-medium ${acct.status === 'INACTIVE' ? 'text-emerald-700 hover:bg-emerald-50' : 'text-rose-700 hover:bg-rose-50'} flex items-center gap-1" title="${acct.status === 'INACTIVE' ? 'Reactivate Bank Account' : 'Deactivate / Archive Bank Account'}">
                            <i class="fa-solid ${acct.status === 'INACTIVE' ? 'fa-toggle-on text-emerald-600' : 'fa-toggle-off text-gray-400'}"></i> ${acct.status === 'INACTIVE' ? 'Activate' : 'Deactivate'}
                        </button>
                    ` : ''}
                    <button type="button" id="btnDetailRefresh" class="btn btn-sm btn-secondary px-2.5 py-1.5 text-xs font-medium text-gray-700" title="Refresh">
                        <i class="fa-solid fa-arrows-rotate"></i>
                    </button>
                </div>
            </div>

            <!-- Metrics Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div class="bg-gray-50/80 rounded-lg p-3 border border-gray-100">
                    <div class="text-xs font-bold text-gray-600 uppercase tracking-wider">Live Balance</div>
                    <div class="text-lg font-mono font-bold mt-1 ${closeBal >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
                        ${_fmtMoney(closeBal)}
                    </div>
                </div>
                <div class="bg-gray-50/80 rounded-lg p-3 border border-gray-100">
                    <div class="text-xs font-bold text-gray-600 uppercase tracking-wider">Period Inflows (Dr)</div>
                    <div class="text-lg font-mono font-bold text-blue-700 mt-1">
                        ${_fmtMoney(totDr)}
                    </div>
                </div>
                <div class="bg-gray-50/80 rounded-lg p-3 border border-gray-100">
                    <div class="text-xs font-bold text-gray-600 uppercase tracking-wider">Period Outflows (Cr)</div>
                    <div class="text-lg font-mono font-bold text-rose-700 mt-1">
                        ${_fmtMoney(totCr)}
                    </div>
                </div>
                <div class="bg-gray-50/80 rounded-lg p-3 border border-gray-100">
                    <div class="text-xs font-bold text-gray-600 uppercase tracking-wider">${isCash ? 'Cash Category' : 'Account Number'}</div>
                    <div class="text-sm font-mono font-bold text-gray-900 mt-1 truncate" title="${acct.account_no || 'Physical Desk'}">
                        ${isCash ? (acct.code === 'PETTY_CASH' ? 'Petty Imprest' : 'Counter Desk') : (acct.account_no || '—')}
                    </div>
                </div>
            </div>

            ${!isCash ? `
                <!-- Remittance Details Card -->
                <div class="bg-blue-50/50 rounded-lg p-3 border border-blue-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div class="flex flex-wrap items-center gap-4">
                        <div>
                            <span class="text-gray-600 font-semibold">IFSC:</span>
                            <span class="font-mono font-bold text-gray-950 ml-1">${_escapeHtml(acct.ifsc || '—')}</span>
                            <button type="button" class="btnCopyIFSC text-gray-600 hover:text-blue-600 ml-1" title="Copy IFSC"><i class="fa-regular fa-copy"></i></button>
                        </div>
                        <div>
                            <span class="text-gray-600 font-semibold">UPI ID:</span>
                            <span class="font-mono font-bold text-gray-950 ml-1">${_escapeHtml(acct.upi_id || acct.upi || '—')}</span>
                        </div>
                        <div>
                            <span class="text-gray-600 font-semibold">Type:</span>
                            <span class="font-bold text-gray-950 ml-1 uppercase">${_escapeHtml(acct.account_type || 'CURRENT')}</span>
                        </div>
                    </div>
                    <div class="text-[11px] text-blue-900 font-medium bg-blue-100/60 px-2 py-0.5 rounded">
                        <i class="fa-solid fa-shield-halved mr-1"></i> Remittance Print Ready
                    </div>
                </div>
            ` : ''}
        `;

        topCard.querySelector('.btnCopyCode')?.addEventListener('click', () => _copyToClipboard(code, 'Account Code'));
        topCard.querySelector('.btnCopyIFSC')?.addEventListener('click', () => _copyToClipboard(acct.ifsc, 'IFSC Code'));
        topCard.querySelector('#btnDetailContra')?.addEventListener('click', () => openContraPane(acct));
        topCard.querySelector('#btnDetailEdit')?.addEventListener('click', () => openEditBankPane(acct));
        topCard.querySelector('#btnDetailDelete')?.addEventListener('click', () => confirmDeleteOrToggle(acct));
        topCard.querySelector('#btnDetailRefresh')?.addEventListener('click', () => selectAccount(acct));

        root.appendChild(topCard);

        // Statement Section
        const stmtSection = document.createElement('div');
        stmtSection.className = 'bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3';

        // Filter Bar
        const filterBar = document.createElement('div');
        filterBar.className = 'flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-100';
        filterBar.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-sm font-bold text-gray-950">Ledger Statement</span>
                <span class="text-xs text-gray-600">(${lines.length} entries)</span>
            </div>
            <div class="flex items-center gap-1.5">
                <button type="button" class="period-btn px-2.5 py-1 text-xs font-semibold rounded ${_statementPeriod === 'THIS_MONTH' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}" data-period="THIS_MONTH">This Month</button>
                <button type="button" class="period-btn px-2.5 py-1 text-xs font-semibold rounded ${_statementPeriod === 'CFY' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}" data-period="CFY">CFY 26-27</button>
                <button type="button" class="period-btn px-2.5 py-1 text-xs font-semibold rounded ${_statementPeriod === 'PFY' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}" data-period="PFY">PFY 25-26</button>
                <button type="button" class="period-btn px-2.5 py-1 text-xs font-semibold rounded ${_statementPeriod === 'ALL' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}" data-period="ALL">All Time</button>
            </div>
        `;

        filterBar.querySelectorAll('.period-btn').forEach(btn => {
            btn.onclick = async () => {
                _statementPeriod = btn.dataset.period;
                await _renderDetail();
            };
        });

        stmtSection.appendChild(filterBar);

        // Statement Table
        const tableWrap = document.createElement('div');
        tableWrap.className = 'overflow-x-auto w-full';

        const table = document.createElement('table');
        table.className = 'w-full text-left text-xs border-collapse';
        table.innerHTML = `
            <thead>
                <tr class="bg-gray-100/80 text-gray-700 uppercase tracking-wider font-semibold border-b border-gray-200">
                    <th class="p-2.5">Date</th>
                    <th class="p-2.5">Voucher #</th>
                    <th class="p-2.5">Type</th>
                    <th class="p-2.5">Ref / Slip No</th>
                    <th class="p-2.5">Particulars / Narration</th>
                    <th class="p-2.5 text-right">Debit (In)</th>
                    <th class="p-2.5 text-right">Credit (Out)</th>
                    <th class="p-2.5 text-right">Running Balance</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 font-mono">
                <!-- Opening Balance Row -->
                <tr class="bg-amber-50/40 font-bold text-gray-900">
                    <td class="p-2.5 font-sans">—</td>
                    <td class="p-2.5 font-sans">—</td>
                    <td class="p-2.5"><span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px]">OPENING</span></td>
                    <td class="p-2.5 font-sans">—</td>
                    <td class="p-2.5 font-sans font-semibold text-gray-800">Opening Balance Brought Forward</td>
                    <td class="p-2.5 text-right">${openBal > 0 ? _fmtMoney(openBal) : '—'}</td>
                    <td class="p-2.5 text-right">${openBal < 0 ? _fmtMoney(Math.abs(openBal)) : '—'}</td>
                    <td class="p-2.5 text-right font-bold text-gray-950">${_fmtMoney(openBal)}</td>
                </tr>
            </tbody>
        `;

        const tbody = table.querySelector('tbody');

        if (lines.length === 0) {
            const emptyTr = document.createElement('tr');
            emptyTr.innerHTML = `
                <td colspan="8" class="p-6 text-center text-gray-600 font-sans">
                    No transactions recorded for this period.
                </td>
            `;
            tbody.appendChild(emptyTr);
        } else {
            lines.forEach((l, idx) => {
                const tr = document.createElement('tr');
                tr.className = idx % 2 === 0 ? 'bg-white hover:bg-blue-50/30' : 'bg-gray-50/50 hover:bg-blue-50/30';

                const dr = Number(l.debit || 0);
                const cr = Number(l.credit || 0);
                const rBal = Number(l.running_balance !== undefined ? l.running_balance : l.balance);
                const docType = l.doc_type || (l.doc_no ? l.doc_no.split('-')[0] : 'TXN');

                let badgeColor = 'bg-gray-100 text-gray-800';
                if (docType === 'REC') badgeColor = 'bg-emerald-100 text-emerald-800';
                else if (docType === 'PAY') badgeColor = 'bg-rose-100 text-rose-800';
                else if (docType === 'CON') badgeColor = 'bg-blue-100 text-blue-800';
                else if (docType === 'JRN') badgeColor = 'bg-purple-100 text-purple-800';

                tr.innerHTML = `
                    <td class="p-2.5 whitespace-nowrap text-gray-700">${_fmtDate(l.doc_date)}</td>
                    <td class="p-2.5 font-bold text-blue-700 whitespace-nowrap">${_escapeHtml(l.doc_no || '—')}</td>
                    <td class="p-2.5 whitespace-nowrap">
                        <span class="px-1.5 py-0.5 rounded font-bold text-[10px] ${badgeColor}">${_escapeHtml(docType)}</span>
                    </td>
                    <td class="p-2.5 text-gray-600 whitespace-nowrap">${_escapeHtml(l.ref_no || '—')}</td>
                    <td class="p-2.5 font-sans text-gray-800 max-w-xs truncate" title="${_escapeHtml(l.memo || l.narration || '')}">
                        ${_escapeHtml(l.memo || l.narration || 'General transaction')}
                    </td>
                    <td class="p-2.5 text-right font-bold text-emerald-700">${dr > 0 ? _fmtMoney(dr) : '—'}</td>
                    <td class="p-2.5 text-right font-bold text-rose-700">${cr > 0 ? _fmtMoney(cr) : '—'}</td>
                    <td class="p-2.5 text-right font-bold text-gray-950">${_fmtMoney(rBal)}</td>
                </tr>
                `;
                tbody.appendChild(tr);
            });
        }

        // Closing Balance Row
        const closeTr = document.createElement('tr');
        closeTr.className = 'bg-blue-50/60 font-bold border-t-2 border-gray-300 text-gray-950';
        closeTr.innerHTML = `
            <td class="p-2.5 font-sans">—</td>
            <td class="p-2.5 font-sans">—</td>
            <td class="p-2.5"><span class="px-1.5 py-0.5 rounded bg-blue-200 text-blue-900 text-[10px]">CLOSING</span></td>
            <td class="p-2.5 font-sans">—</td>
            <td class="p-2.5 font-sans font-bold text-gray-950">Closing Ledger Balance</td>
            <td class="p-2.5 text-right font-bold text-emerald-800">${_fmtMoney(totDr)}</td>
            <td class="p-2.5 text-right font-bold text-rose-800">${_fmtMoney(totCr)}</td>
            <td class="p-2.5 text-right font-bold text-blue-950 text-sm">${_fmtMoney(closeBal)}</td>
        `;
        tbody.appendChild(closeTr);

        tableWrap.appendChild(table);
        stmtSection.appendChild(tableWrap);
        root.appendChild(stmtSection);

        viewEl.appendChild(root);
    }

    // ========================================================================
    // IN-PANE CONTRA TRANSFER FORM
    // ========================================================================

    function openContraPane(preselectedFrom = null) {
        const viewEl = document.getElementById('vaultDetailView');
        if (!viewEl) return;
        viewEl.innerHTML = '';
        VaultPage.showDetail(true);
        VaultPage?.showDetailPane?.();

        const branch = VaultPage.getActiveBranch() || 'DDN';

        const root = document.createElement('div');
        root.className = 'w-full p-4 flex flex-col gap-4 text-gray-900 max-w-2xl mx-auto';

        root.innerHTML = `
            <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
                <!-- Header -->
                <div class="flex items-center justify-between pb-3 border-b border-gray-200">
                    <div>
                        <h2 class="text-base font-bold text-gray-950 flex items-center gap-2">
                            <i class="fa-solid fa-money-bill-transfer text-blue-600"></i> New Contra Transfer (CON)
                        </h2>
                        <p class="text-xs text-gray-600 mt-0.5">Transfer funds between cash & bank accounts (P&L neutral).</p>
                    </div>
                    <button type="button" id="btnContraCancel" class="btn btn-sm btn-secondary text-xs px-2.5 py-1">
                        <i class="fa-solid fa-xmark mr-1"></i> Cancel
                    </button>
                </div>

                <!-- Transfer Type Selector -->
                <div>
                    <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Transfer Workflow Type</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button type="button" class="contra-type-btn p-2.5 rounded-lg border text-left flex flex-col gap-1 bg-blue-50 border-blue-500 text-blue-900" data-type="CASH_TO_BANK">
                            <div class="text-xs font-bold flex items-center gap-1.5">
                                <i class="fa-solid fa-arrow-down-to-bracket text-emerald-600"></i> Cash Deposit
                            </div>
                            <div class="text-[11px] text-gray-600">Counter Cash &rarr; Bank A/c</div>
                        </button>
                        <button type="button" class="contra-type-btn p-2.5 rounded-lg border text-left flex flex-col gap-1 bg-white border-gray-200 text-gray-700 hover:bg-gray-50" data-type="BANK_TO_PETTY">
                            <div class="text-xs font-bold flex items-center gap-1.5">
                                <i class="fa-solid fa-arrow-up-from-bracket text-rose-600"></i> Cash Withdrawal
                            </div>
                            <div class="text-[11px] text-gray-600">Bank A/c &rarr; Petty Cash</div>
                        </button>
                        <button type="button" class="contra-type-btn p-2.5 rounded-lg border text-left flex flex-col gap-1 bg-white border-gray-200 text-gray-700 hover:bg-gray-50" data-type="BANK_TO_BANK">
                            <div class="text-xs font-bold flex items-center gap-1.5">
                                <i class="fa-solid fa-right-left text-blue-600"></i> Inter-Bank
                            </div>
                            <div class="text-[11px] text-gray-600">Bank A &rarr; Bank B</div>
                        </button>
                    </div>
                </div>

                <!-- Source & Destination Dropdowns -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">From (Paying / Disbursing)</label>
                        <select id="contraFrom" class="form-select w-full text-xs font-mono font-medium rounded-lg border-gray-300 p-2"></select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">To (Receiving / Depositing)</label>
                        <select id="contraTo" class="form-select w-full text-xs font-mono font-medium rounded-lg border-gray-300 p-2"></select>
                    </div>
                </div>

                <!-- Amount & Date -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Amount (₹) *</label>
                        <input type="number" id="contraAmount" step="0.01" min="1" placeholder="0.00" class="form-input w-full text-sm font-mono font-bold rounded-lg border-gray-300 p-2 text-emerald-700" required>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Transfer Date</label>
                        <input type="date" id="contraDate" value="${new Date().toISOString().split('T')[0]}" class="form-input w-full text-xs font-mono rounded-lg border-gray-300 p-2">
                    </div>
                </div>

                <!-- Reference & Narration -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Ref / Slip / UTR / Cheque #</label>
                        <input type="text" id="contraRef" placeholder="e.g. DEP-0410 or UTR..." class="form-input w-full text-xs font-mono rounded-lg border-gray-300 p-2">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Branch Code</label>
                        <input type="text" id="contraBranch" value="${_escapeHtml(branch)}" class="form-input w-full text-xs font-mono font-bold bg-gray-100 rounded-lg border-gray-300 p-2" readonly>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Narration / Notes</label>
                    <textarea id="contraNarration" rows="2" placeholder="Purpose of internal transfer..." class="form-textarea w-full text-xs rounded-lg border-gray-300 p-2"></textarea>
                </div>

                <!-- Double Entry Live Preview -->
                <div class="bg-gray-50 rounded-lg p-3 border border-gray-200 flex flex-col gap-1.5">
                    <div class="flex items-center justify-between text-xs font-bold text-gray-600">
                        <span>DOUBLE-ENTRY JOURNAL AUDIT</span>
                        <span class="text-emerald-700 flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> Balanced</span>
                    </div>
                    <div class="text-xs font-mono flex items-center justify-between text-gray-800">
                        <span>Debit (Asset &uarr;): <strong id="previewDebitAcc" class="text-blue-700">—</strong></span>
                        <span id="previewDebitAmt" class="font-bold text-emerald-700">₹0.00</span>
                    </div>
                    <div class="text-xs font-mono flex items-center justify-between text-gray-800">
                        <span>Credit (Asset &darr;): <strong id="previewCreditAcc" class="text-rose-700">—</strong></span>
                        <span id="previewCreditAmt" class="font-bold text-rose-700">₹0.00</span>
                    </div>
                </div>

                <!-- Submit Button -->
                <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                    <button type="button" id="btnContraSubmit" class="btn btn-blue px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <i class="fa-solid fa-check"></i> Post Contra Entry
                    </button>
                </div>
            </div>
        `;

        const fromSelect = root.querySelector('#contraFrom');
        const toSelect = root.querySelector('#contraTo');
        const amtInput = root.querySelector('#contraAmount');
        const previewDebitAcc = root.querySelector('#previewDebitAcc');
        const previewCreditAcc = root.querySelector('#previewCreditAcc');
        const previewDebitAmt = root.querySelector('#previewDebitAmt');
        const previewCreditAmt = root.querySelector('#previewCreditAmt');

        let currentWorkflow = 'CASH_TO_BANK';

        function populateOptions() {
            fromSelect.innerHTML = '';
            toSelect.innerHTML = '';

            if (currentWorkflow === 'CASH_TO_BANK') {
                fromSelect.innerHTML = `<option value="CASH_IN_HAND">Cash In Hand (${branch} Desk)</option>`;
                _bankAccounts.forEach(b => {
                    toSelect.innerHTML += `<option value="${b.bank_code}">${b.bank_name} (${b.bank_code})</option>`;
                });
            } else if (currentWorkflow === 'BANK_TO_PETTY') {
                _bankAccounts.forEach(b => {
                    fromSelect.innerHTML += `<option value="${b.bank_code}">${b.bank_name} (${b.bank_code})</option>`;
                });
                toSelect.innerHTML = `<option value="PETTY_CASH">Petty Cash Imprest (${branch})</option>`;
            } else if (currentWorkflow === 'BANK_TO_BANK') {
                _bankAccounts.forEach(b => {
                    fromSelect.innerHTML += `<option value="${b.bank_code}">${b.bank_name} (${b.bank_code})</option>`;
                    toSelect.innerHTML += `<option value="${b.bank_code}">${b.bank_name} (${b.bank_code})</option>`;
                });
                if (toSelect.options.length > 1) {
                    toSelect.selectedIndex = 1;
                }
            }

            if (preselectedFrom && preselectedFrom.bank_code) {
                if (currentWorkflow === 'BANK_TO_PETTY' || currentWorkflow === 'BANK_TO_BANK') {
                    fromSelect.value = preselectedFrom.bank_code;
                }
            }
            updatePreview();
        }

        function updatePreview() {
            const amt = Number(amtInput.value) || 0;
            const fromText = fromSelect.options[fromSelect.selectedIndex]?.text || fromSelect.value;
            const toText = toSelect.options[toSelect.selectedIndex]?.text || toSelect.value;

            previewDebitAcc.textContent = toText;
            previewCreditAcc.textContent = fromText;
            previewDebitAmt.textContent = _fmtMoney(amt);
            previewCreditAmt.textContent = _fmtMoney(amt);
        }

        // Type Button Events
        root.querySelectorAll('.contra-type-btn').forEach(btn => {
            btn.onclick = () => {
                root.querySelectorAll('.contra-type-btn').forEach(b => {
                    b.className = 'contra-type-btn p-2.5 rounded-lg border text-left flex flex-col gap-1 bg-white border-gray-200 text-gray-700 hover:bg-gray-50';
                });
                btn.className = 'contra-type-btn p-2.5 rounded-lg border text-left flex flex-col gap-1 bg-blue-50 border-blue-500 text-blue-900';
                currentWorkflow = btn.dataset.type;
                populateOptions();
            };
        });

        fromSelect.onchange = updatePreview;
        toSelect.onchange = updatePreview;
        amtInput.oninput = updatePreview;

        populateOptions();

        root.querySelector('#btnContraCancel').onclick = () => _renderDetail();

        // Submit Contra
        root.querySelector('#btnContraSubmit').onclick = async () => {
            const amount = parseFloat(amtInput.value);
            if (isNaN(amount) || amount <= 0) {
                _showToast('Please enter a valid transfer amount greater than 0.', true);
                amtInput.focus();
                return;
            }

            const fromAcc = fromSelect.value;
            const toAcc = toSelect.value;
            if (fromAcc === toAcc) {
                _showToast('Source and Destination accounts cannot be the same.', true);
                return;
            }

            const payload = {
                from_account: fromAcc,
                to_account: toAcc,
                amount: amount,
                doc_date: root.querySelector('#contraDate').value || new Date().toISOString().split('T')[0],
                branch_code: branch,
                ref_no: (root.querySelector('#contraRef').value || '').trim(),
                narration: (root.querySelector('#contraNarration').value || '').trim(),
                metadata: {
                    workflow: currentWorkflow
                }
            };

            const submitBtn = root.querySelector('#btnContraSubmit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Posting...';

            try {
                const res = await fetch('/api/accounting/contra', {
                    method: 'POST',
                    headers: _getHeaders(),
                    body: JSON.stringify(payload)
                });
                const resJson = await res.json();
                if (!res.ok) {
                    throw new Error(resJson.detail || resJson.message || 'Contra transfer failed.');
                }

                _showToast(`Contra Entry #${resJson.doc_no || 'CON'} posted successfully!`);
                await _fetchAccounts();
                _renderList();
                _renderDetail();
            } catch (err) {
                console.error('[VaultAccounts] Contra error:', err);
                _showToast(err.message || 'Error posting contra transfer.', true);
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Post Contra Entry';
            }
        };

        viewEl.appendChild(root);
    }

    // ========================================================================
    // IN-PANE ADD BANK ACCOUNT FORM
    // ========================================================================

    function openAddBankPane() {
        const viewEl = document.getElementById('vaultDetailView');
        if (!viewEl) return;
        viewEl.innerHTML = '';
        VaultPage.showDetail(true);
        VaultPage?.showDetailPane?.();

        const branch = VaultPage.getActiveBranch() || 'DDN';

        const root = document.createElement('div');
        root.className = 'w-full p-4 flex flex-col gap-4 text-gray-900 max-w-xl mx-auto';

        root.innerHTML = `
            <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
                <div class="flex items-center justify-between pb-3 border-b border-gray-200">
                    <div>
                        <h2 class="text-base font-bold text-gray-950 flex items-center gap-2">
                            <i class="fa-solid fa-building-columns text-blue-600"></i> Add New Bank Account
                        </h2>
                        <p class="text-xs text-gray-600 mt-0.5">Persists to DATADB/bank_accounts.json with sub-ledger code.</p>
                    </div>
                    <button type="button" id="btnAddCancel" class="btn btn-sm btn-secondary text-xs px-2.5 py-1">
                        <i class="fa-solid fa-xmark mr-1"></i> Cancel
                    </button>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Bank Name *</label>
                        <input type="text" id="newBankName" placeholder="e.g. Punjab National Bank" class="form-input w-full text-xs font-medium rounded-lg border-gray-300 p-2" required>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Account Number *</label>
                        <input type="text" id="newAccNo" placeholder="Account Number" class="form-input w-full text-xs font-mono font-bold rounded-lg border-gray-300 p-2" required>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Bank Sub-Ledger Code *</label>
                        <input type="text" id="newBankCode" placeholder="e.g. PUNB0410" class="form-input w-full text-xs font-mono font-bold uppercase rounded-lg border-gray-300 p-2 text-blue-700" required>
                        <span class="text-[10px] text-gray-600">Format: [BANK][LAST4], e.g. PUNB0410, HDFC8849</span>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">IFSC Code *</label>
                        <input type="text" id="newIFSC" placeholder="e.g. PUNB0041000" class="form-input w-full text-xs font-mono font-bold uppercase rounded-lg border-gray-300 p-2" required>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Account Type</label>
                        <select id="newAccType" class="form-select w-full text-xs font-semibold rounded-lg border-gray-300 p-2">
                            <option value="CURRENT">Current Account</option>
                            <option value="SAVINGS">Savings Account</option>
                            <option value="OVERDRAFT">Overdraft (OD) / CC</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Branch Binding</label>
                        <input type="text" id="newBranch" value="${_escapeHtml(branch)}" class="form-input w-full text-xs font-mono font-bold uppercase rounded-lg border-gray-300 p-2">
                        <span class="text-[10px] text-gray-600">Enter 'ALL' for company-wide central accounts</span>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-gray-700 uppercase mb-1">UPI ID (Optional)</label>
                    <input type="text" id="newUPI" placeholder="e.g. post4ex.pnb@upi" class="form-input w-full text-xs font-mono rounded-lg border-gray-300 p-2">
                </div>

                <div class="flex items-center gap-2 pt-1">
                    <input type="checkbox" id="newIsPrimary" class="form-checkbox text-blue-600 rounded">
                    <label for="newIsPrimary" class="text-xs font-semibold text-gray-800 cursor-pointer">
                        Set as Primary Remittance Bank for this branch (prints on customer invoices)
                    </label>
                </div>

                <div class="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                    <button type="button" id="btnSaveNewBank" class="btn btn-blue px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <i class="fa-solid fa-check"></i> Save Bank Account
                    </button>
                </div>
            </div>
        `;

        const nameInput = root.querySelector('#newBankName');
        const accNoInput = root.querySelector('#newAccNo');
        const codeInput = root.querySelector('#newBankCode');

        // Auto-generate code when bank name or account number changes
        function autoGenerateCode() {
            if (codeInput.dataset.manuallyEdited) return;
            const bName = nameInput.value.trim().toUpperCase();
            const aNo = accNoInput.value.trim();
            if (!bName && !aNo) return;

            const words = bName.split(/\s+/).filter(Boolean);
            let prefix = words.length > 1 ? words.map(w => w[0]).join('') : bName.slice(0, 4);
            prefix = prefix.slice(0, 4);
            const suffix = aNo.length >= 4 ? aNo.slice(-4) : '0001';
            codeInput.value = `${prefix}${suffix}`.toUpperCase();
        }

        nameInput.oninput = autoGenerateCode;
        accNoInput.oninput = autoGenerateCode;
        codeInput.oninput = () => { codeInput.dataset.manuallyEdited = '1'; };

        root.querySelector('#btnAddCancel').onclick = () => _renderDetail();

        root.querySelector('#btnSaveNewBank').onclick = async () => {
            const bName = nameInput.value.trim();
            const aNo = accNoInput.value.trim();
            const bCode = codeInput.value.trim().toUpperCase();
            const ifsc = root.querySelector('#newIFSC').value.trim().toUpperCase();

            if (!bName || !aNo || !bCode || !ifsc) {
                _showToast('Please fill in all mandatory fields: Bank Name, Account #, Bank Code, and IFSC.', true);
                return;
            }

            const payload = {
                bank_code: bCode,
                bank_name: bName,
                account_no: aNo,
                ifsc: ifsc,
                branch_code: root.querySelector('#newBranch').value.trim().toUpperCase() || 'ALL',
                account_type: root.querySelector('#newAccType').value,
                upi_id: root.querySelector('#newUPI').value.trim(),
                is_primary: root.querySelector('#newIsPrimary').checked
            };

            const saveBtn = root.querySelector('#btnSaveNewBank');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...';

            try {
                const res = await fetch('/api/accounting/bank-accounts', {
                    method: 'POST',
                    headers: _getHeaders(),
                    body: JSON.stringify(payload)
                });
                const resJson = await res.json();
                if (!res.ok) {
                    throw new Error(resJson.detail || resJson.message || 'Failed to save bank account.');
                }

                _showToast(`Bank Account '${bCode}' created successfully!`);
                await _fetchAccounts();
                _selectedAccount = _bankAccounts.find(b => b.bank_code === bCode) || _bankAccounts[0];
                _renderList();
                _renderDetail();
            } catch (err) {
                console.error('[VaultAccounts] Save bank error:', err);
                _showToast(err.message || 'Error saving bank account.', true);
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Save Bank Account';
            }
        };

        viewEl.appendChild(root);
    }

    // ========================================================================
    // IN-PANE EDIT BANK ACCOUNT FORM
    // ========================================================================

    function openEditBankPane(acct) {
        if (!acct) return;
        const viewEl = document.getElementById('vaultDetailView');
        if (!viewEl) return;
        viewEl.innerHTML = '';
        VaultPage.showDetail(true);
        VaultPage?.showDetailPane?.();

        const code = acct.bank_code || acct.code;
        const root = document.createElement('div');
        root.className = 'w-full p-4 flex flex-col gap-4 text-gray-900 max-w-xl mx-auto';

        root.innerHTML = `
            <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
                <div class="flex items-center justify-between pb-3 border-b border-gray-200">
                    <div>
                        <h2 class="text-base font-bold text-gray-950 flex items-center gap-2">
                            <i class="fa-solid fa-pen-to-square text-blue-600"></i> Edit Bank Account (${_escapeHtml(code)})
                        </h2>
                        <p class="text-xs text-gray-600 mt-0.5">Modify bank details and branch assignment.</p>
                    </div>
                    <button type="button" id="btnEditCancel" class="btn btn-sm btn-secondary text-xs px-2.5 py-1">
                        <i class="fa-solid fa-xmark mr-1"></i> Cancel
                    </button>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Bank Name *</label>
                        <input type="text" id="editBankName" value="${_escapeHtml(acct.bank_name || acct.account_name || '')}" class="form-input w-full text-xs font-medium rounded-lg border-gray-300 p-2" required>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Account Number *</label>
                        <input type="text" id="editAccNo" value="${_escapeHtml(acct.account_no || '')}" class="form-input w-full text-xs font-mono font-bold rounded-lg border-gray-300 p-2" required>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Bank Code (Sub-Ledger)</label>
                        <input type="text" value="${_escapeHtml(code)}" class="form-input w-full text-xs font-mono font-bold uppercase rounded-lg border-gray-300 p-2 bg-gray-100 text-gray-500 cursor-not-allowed" readonly>
                        <span class="text-[10px] text-gray-500">Sub-ledger code cannot be changed once created.</span>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">IFSC Code *</label>
                        <input type="text" id="editIFSC" value="${_escapeHtml(acct.ifsc || '')}" class="form-input w-full text-xs font-mono font-bold uppercase rounded-lg border-gray-300 p-2" required>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Account Type</label>
                        <select id="editAccType" class="form-select w-full text-xs font-semibold rounded-lg border-gray-300 p-2">
                            <option value="CURRENT" ${(acct.account_type || '').toUpperCase() === 'CURRENT' ? 'selected' : ''}>Current Account</option>
                            <option value="SAVINGS" ${(acct.account_type || '').toUpperCase() === 'SAVINGS' ? 'selected' : ''}>Savings Account</option>
                            <option value="OVERDRAFT" ${(acct.account_type || '').toUpperCase() === 'OVERDRAFT' ? 'selected' : ''}>Overdraft (OD) / CC</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Branch Binding</label>
                        <input type="text" id="editBranch" value="${_escapeHtml(acct.branch_code || 'ALL')}" class="form-input w-full text-xs font-mono font-bold uppercase rounded-lg border-gray-300 p-2">
                        <span class="text-[10px] text-gray-600">Enter 'ALL' for company-wide central accounts</span>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">UPI ID (Optional)</label>
                        <input type="text" id="editUPI" value="${_escapeHtml(acct.upi_id || acct.upi || '')}" placeholder="e.g. post4ex.pnb@upi" class="form-input w-full text-xs font-mono rounded-lg border-gray-300 p-2">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase mb-1">Status</label>
                        <select id="editStatus" class="form-select w-full text-xs font-semibold rounded-lg border-gray-300 p-2">
                            <option value="ACTIVE" ${(acct.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? 'selected' : ''}>Active</option>
                            <option value="INACTIVE" ${(acct.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'selected' : ''}>Inactive (Archived)</option>
                        </select>
                    </div>
                </div>

                <div class="flex items-center gap-2 pt-1">
                    <input type="checkbox" id="editIsPrimary" class="form-checkbox text-blue-600 rounded" ${acct.is_primary ? 'checked' : ''}>
                    <label for="editIsPrimary" class="text-xs font-semibold text-gray-800 cursor-pointer">
                        Set as Primary Remittance Bank for this branch (prints on customer invoices)
                    </label>
                </div>

                <div class="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                    <button type="button" id="btnUpdateBank" class="btn btn-blue px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <i class="fa-solid fa-check"></i> Save Changes
                    </button>
                </div>
            </div>
        `;

        root.querySelector('#btnEditCancel').onclick = () => _renderDetail();

        root.querySelector('#btnUpdateBank').onclick = async () => {
            const bName = root.querySelector('#editBankName').value.trim();
            const aNo = root.querySelector('#editAccNo').value.trim();
            const ifsc = root.querySelector('#editIFSC').value.trim().toUpperCase();

            if (!bName || !aNo || !ifsc) {
                _showToast('Please fill in all mandatory fields: Bank Name, Account #, and IFSC.', true);
                return;
            }

            const payload = {
                bank_name: bName,
                account_no: aNo,
                ifsc: ifsc,
                branch_code: root.querySelector('#editBranch').value.trim().toUpperCase() || 'ALL',
                account_type: root.querySelector('#editAccType').value,
                upi_id: root.querySelector('#editUPI').value.trim(),
                status: root.querySelector('#editStatus').value,
                is_primary: root.querySelector('#editIsPrimary').checked
            };

            const updateBtn = root.querySelector('#btnUpdateBank');
            updateBtn.disabled = true;
            updateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Saving...';

            try {
                const res = await fetch(`/api/accounting/bank-accounts/${encodeURIComponent(code)}`, {
                    method: 'PUT',
                    headers: _getHeaders(),
                    body: JSON.stringify(payload)
                });
                const resJson = await res.json();
                if (!res.ok) {
                    throw new Error(resJson.detail || resJson.message || 'Failed to update bank account.');
                }

                _showToast(`Bank Account '${code}' updated successfully!`);
                await _fetchAccounts();
                _selectedAccount = _bankAccounts.find(b => b.bank_code === code) || _selectedAccount;
                _renderList();
                _renderDetail();
            } catch (err) {
                console.error('[VaultAccounts] Update bank error:', err);
                _showToast(err.message || 'Error updating bank account.', true);
                updateBtn.disabled = false;
                updateBtn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Save Changes';
            }
        };

        viewEl.appendChild(root);
    }

    // ========================================================================
    // DELETE / DEACTIVATE / REACTIVATE ACTION
    // ========================================================================

    async function confirmDeleteOrToggle(acct) {
        if (!acct) return;
        const code = acct.bank_code || acct.code;
        const name = acct.bank_name || acct.account_name;
        const isInactive = acct.status === 'INACTIVE';

        if (isInactive) {
            const ok = confirm(`Reactivate bank account "${name}" (${code})?\n\nThis will re-enable this account for receipts, payments, and contra transfers.`);
            if (!ok) return;

            try {
                const res = await fetch(`/api/accounting/bank-accounts/${encodeURIComponent(code)}/status?status=ACTIVE`, {
                    method: 'PATCH',
                    headers: _getHeaders()
                });
                const resJson = await res.json();
                if (!res.ok) throw new Error(resJson.detail || resJson.message || 'Failed to reactivate account.');
                _showToast(`Bank account '${code}' reactivated successfully.`);
                await _fetchAccounts();
                _selectedAccount = _bankAccounts.find(b => b.bank_code === code) || _selectedAccount;
                _renderList();
                _renderDetail();
            } catch (err) {
                _showToast(err.message || 'Error reactivating bank account.', true);
            }
        } else {
            const ok = confirm(`Are you sure you want to deactivate / delete bank account "${name}" (${code})?\n\n- If transactions exist in the ledger, it will be safely ARCHIVED (marked Inactive) to protect statutory audit trails.\n- If zero transactions exist, it will be permanently deleted.`);
            if (!ok) return;

            try {
                const res = await fetch(`/api/accounting/bank-accounts/${encodeURIComponent(code)}`, {
                    method: 'DELETE',
                    headers: _getHeaders()
                });
                const resJson = await res.json();
                if (!res.ok) throw new Error(resJson.detail || resJson.message || 'Failed to delete/archive account.');

                _showToast(resJson.message || `Account '${code}' updated.`);
                await _fetchAccounts();
                if (resJson.status === 'DELETED') {
                    _selectedAccount = _bankAccounts[0] || _allAccounts[0] || null;
                } else {
                    _selectedAccount = _bankAccounts.find(b => b.bank_code === code) || _bankAccounts[0];
                }
                _renderList();
                _renderDetail();
            } catch (err) {
                _showToast(err.message || 'Error deleting/deactivating bank account.', true);
            }
        }
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    async function load() {
        _selectedAccount = null;
        VaultPage.showDetail(false);
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();

        await _fetchAccounts();
        _renderList();
        if (_selectedAccount) {
            await _renderDetail();
        } else {
            VaultPage.showDetail(false);
        }
    }

    function search() {
        _renderList();
    }

    function selectAccount(acct) {
        _selectedAccount = acct;
        _renderList();
        _renderDetail();
        VaultPage?.showDetailPane?.();
    }

    function setTile(tile) {
        _activeTile = tile;
    }

    return {
        load,
        search,
        selectAccount,
        setTile,
        openContraPane,
        openAddBankPane,
        openEditBankPane,
        confirmDeleteOrToggle,
        refresh: load
    };
})();

window.VaultAccounts = VaultAccounts;
