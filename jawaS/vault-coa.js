// ============================================================================
// VAULT-COA.JS — Chart of Accounts (COA) Tile
// Aligned with Master Ledger Implant Plan (Section 3 & Section 14.1)
// Connects to Native Double-Entry Ledger Engine (/api/ledger/accounts)
// Filter Model: Standard Modal pattern from Shipments (vaultFilterBtn)
// ============================================================================

const VaultCOA = (() => {

    let _coaList = [];
    let _activeAccount = null;

    // Filter states (controlled via Filter Modal matching Shipments)
    let _filterCategory = "ALL";
    let _filterNormalBal = "ALL";
    let _filterBalStatus = "ALL";
    let _filterType = "ALL";
    let _statementStartDate = "";
    let _statementEndDate = "";

    const _escapeHtml = (str) => {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };

    const TYPE_COLORS = {
        'BANK': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'CASH': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'RECEIVABLE': 'bg-blue-50 text-blue-700 border-blue-200',
        'CURRENT_ASSET': 'bg-indigo-50 text-indigo-700 border-indigo-200',
        'NON_CURRENT_ASSET': 'bg-purple-50 text-purple-700 border-purple-200',
        'INVENTORY': 'bg-cyan-50 text-cyan-700 border-cyan-200',
        'PAYABLE': 'bg-amber-50 text-amber-700 border-amber-200',
        'CURRENT_LIABILITY': 'bg-amber-50 text-amber-700 border-amber-200',
        'NON_CURRENT_LIABILITY': 'bg-red-50 text-red-700 border-red-200',
        'EQUITY': 'bg-rose-50 text-rose-700 border-rose-200',
        'OPERATING_REVENUE': 'bg-teal-50 text-teal-700 border-teal-200',
        'NON_OPERATING_REVENUE': 'bg-teal-50 text-teal-700 border-teal-200',
        'OPERATING_EXPENSE': 'bg-red-50 text-red-700 border-red-200',
        'DIRECT_EXPENSE': 'bg-rose-50 text-rose-700 border-rose-200',
        'OVERHEAD_EXPENSE': 'bg-orange-50 text-orange-700 border-orange-200',
        'OTHER_EXPENSE': 'bg-gray-50 text-gray-700 border-gray-200',
        'CONTROL': 'bg-slate-50 text-slate-700 border-slate-200'
    };

    const CATEGORY_STYLES = {
        'ASSET': 'bg-blue-50 text-blue-800 border-blue-200',
        'LIABILITY': 'bg-amber-50 text-amber-800 border-amber-200',
        'EQUITY': 'bg-rose-50 text-rose-800 border-rose-200',
        'REVENUE': 'bg-emerald-50 text-emerald-800 border-emerald-200',
        'EXPENSE': 'bg-red-50 text-red-800 border-red-200'
    };

    function _hasActiveFilters() {
        return _filterCategory !== 'ALL' ||
               _filterNormalBal !== 'ALL' ||
               _filterBalStatus !== 'ALL' ||
               _filterType !== 'ALL' ||
               !!_statementStartDate ||
               !!_statementEndDate;
    }

    function _updateFilterButtonState() {
        const btn = document.getElementById('vaultFilterBtn');
        if (!btn) return;
        const active = _hasActiveFilters();
        btn.classList.toggle('filter-active', active);
        if (active) {
            btn.classList.add('bg-red-100', 'text-red-700');
            btn.classList.remove('text-gray-500');
            btn.title = 'Filters Active (Click to modify)';
        } else {
            btn.classList.remove('bg-red-100', 'text-red-700', 'filter-active');
            btn.classList.add('text-gray-500');
            btn.title = 'Filter Chart of Accounts';
        }
    }

    // ── Inject & Setup Filter Modal (Matches Shipments Model) ──────────────────
    function _setupFilterModal() {
        // Remove any old inline chips under search
        document.getElementById('coaCategoryChips')?.remove();

        // Unhide header filter button
        const filterBtn = document.getElementById('vaultFilterBtn');
        if (filterBtn) {
            filterBtn.classList.remove('hidden');
            filterBtn.onclick = () => openFilterModal();
        }

        // Inject modal if not present
        let modal = document.getElementById('coaFilterModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'coaFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4">
                    <div class="flex justify-between items-center border-b pb-3">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
                            </div>
                            <h2 class="text-base font-bold text-gray-900">Filter Chart of Accounts</h2>
                        </div>
                        <button id="close-coa-filter-modal" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1 leading-none" aria-label="Close">✕</button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                            <label for="coa-filter-category" class="block font-semibold text-gray-700 mb-1">Account Category</label>
                            <select id="coa-filter-category" class="form-input text-xs w-full">
                                <option value="ALL">All Categories</option>
                                <option value="ASSET">ASSET (1000s Series)</option>
                                <option value="LIABILITY">LIABILITY (2000s Series)</option>
                                <option value="EQUITY">EQUITY (6000s Series)</option>
                                <option value="REVENUE">REVENUE (3000s/4000s Series)</option>
                                <option value="EXPENSE">EXPENSE (5000s Series)</option>
                            </select>
                        </div>
                        <div>
                            <label for="coa-filter-normal-bal" class="block font-semibold text-gray-700 mb-1">Normal Balance</label>
                            <select id="coa-filter-normal-bal" class="form-input text-xs w-full">
                                <option value="ALL">All Normal Balances</option>
                                <option value="DEBIT">Debit (Dr) — Assets &amp; Expenses</option>
                                <option value="CREDIT">Credit (Cr) — Liabilities, Equity &amp; Revenue</option>
                            </select>
                        </div>
                        <div>
                            <label for="coa-filter-bal-status" class="block font-semibold text-gray-700 mb-1">Balance Activity</label>
                            <select id="coa-filter-bal-status" class="form-input text-xs w-full">
                                <option value="ALL">All Accounts</option>
                                <option value="NON_ZERO">With Balance Only (Non-Zero)</option>
                                <option value="ZERO">Zero Balance Only</option>
                            </select>
                        </div>
                        <div>
                            <label for="coa-filter-type" class="block font-semibold text-gray-700 mb-1">Classification Type</label>
                            <select id="coa-filter-type" class="form-input text-xs w-full">
                                <option value="ALL">All Classifications</option>
                                <option value="BANK">Bank Accounts</option>
                                <option value="CASH">Cash in Hand</option>
                                <option value="RECEIVABLE">Trade Receivables (AR)</option>
                                <option value="CURRENT_ASSET">Current Assets</option>
                                <option value="NON_CURRENT_ASSET">Fixed / Non-Current Assets</option>
                                <option value="INVENTORY">Inventory</option>
                                <option value="PAYABLE">Trade Payables (AP)</option>
                                <option value="CURRENT_LIABILITY">Current Liabilities</option>
                                <option value="NON_CURRENT_LIABILITY">Long-term Liabilities</option>
                                <option value="EQUITY">Equity &amp; Reserves</option>
                                <option value="OPERATING_REVENUE">Operating Freight Revenue</option>
                                <option value="NON_OPERATING_REVENUE">Other / Indirect Revenue</option>
                                <option value="DIRECT_EXPENSE">Direct Linehaul Expense</option>
                                <option value="OPERATING_EXPENSE">Hub Operating Expense</option>
                                <option value="OVERHEAD_EXPENSE">Administrative Overheads</option>
                                <option value="OTHER_EXPENSE">Other Expenses</option>
                            </select>
                        </div>
                        <div class="sm:col-span-2 border-t pt-3 mt-1">
                            <span class="block font-bold text-gray-800 mb-1 uppercase tracking-wider text-[10px]">Ledger Running Statement Period</span>
                            <p class="text-[11px] text-gray-500 mb-2">Filter transaction lines on the selected account's statement:</p>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label for="coa-filter-start-date" class="block font-medium text-gray-600 mb-1">Start Date</label>
                                    <input type="date" id="coa-filter-start-date" class="form-input text-xs w-full">
                                </div>
                                <div>
                                    <label for="coa-filter-end-date" class="block font-medium text-gray-600 mb-1">End Date</label>
                                    <input type="date" id="coa-filter-end-date" class="form-input text-xs w-full">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="flex justify-end gap-3 pt-3 border-t">
                        <button id="coa-reset-filters" type="button" class="btn-ghost btn-sm">Reset</button>
                        <button id="coa-apply-filters" type="button" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs">Apply Filters</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Close listeners
            document.getElementById('close-coa-filter-modal').addEventListener('click', closeFilterModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeFilterModal();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeFilterModal();
            });

            // Action listeners
            document.getElementById('coa-apply-filters').addEventListener('click', () => {
                _filterCategory = document.getElementById('coa-filter-category').value;
                _filterNormalBal = document.getElementById('coa-filter-normal-bal').value;
                _filterBalStatus = document.getElementById('coa-filter-bal-status').value;
                _filterType = document.getElementById('coa-filter-type').value;
                _statementStartDate = document.getElementById('coa-filter-start-date').value;
                _statementEndDate = document.getElementById('coa-filter-end-date').value;

                closeFilterModal();
                _updateFilterButtonState();
                _renderList();

                // Re-render statement if active account exists
                if (_activeAccount) {
                    _showDetailView(_activeAccount);
                }
            });

            document.getElementById('coa-reset-filters').addEventListener('click', () => {
                _filterCategory = "ALL";
                _filterNormalBal = "ALL";
                _filterBalStatus = "ALL";
                _filterType = "ALL";
                _statementStartDate = "";
                _statementEndDate = "";

                document.getElementById('coa-filter-category').value = "ALL";
                document.getElementById('coa-filter-normal-bal').value = "ALL";
                document.getElementById('coa-filter-bal-status').value = "ALL";
                document.getElementById('coa-filter-type').value = "ALL";
                document.getElementById('coa-filter-start-date').value = "";
                document.getElementById('coa-filter-end-date').value = "";

                closeFilterModal();
                _updateFilterButtonState();
                _renderList();

                if (_activeAccount) {
                    _showDetailView(_activeAccount);
                }
            });
        }

        _updateFilterButtonState();
    }

    function openFilterModal() {
        const modal = document.getElementById('coaFilterModal');
        if (!modal) return;
        document.getElementById('coa-filter-category').value = _filterCategory;
        document.getElementById('coa-filter-normal-bal').value = _filterNormalBal;
        document.getElementById('coa-filter-bal-status').value = _filterBalStatus;
        document.getElementById('coa-filter-type').value = _filterType;
        document.getElementById('coa-filter-start-date').value = _statementStartDate;
        document.getElementById('coa-filter-end-date').value = _statementEndDate;
        modal.classList.remove('hidden');
    }

    function closeFilterModal() {
        document.getElementById('coaFilterModal')?.classList.add('hidden');
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        const listEl = document.getElementById('vaultList');
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) {
            searchInput.placeholder = 'Search by #code, name, category…';
            searchInput.oninput = () => search();
        }

        // Setup filter modal and button
        _setupFilterModal();

        if (listEl) {
            listEl.innerHTML = `
                <li class="p-8 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p class="font-medium">Connecting to Chart of Accounts…</p>
                </li>
            `;
        }

        try {
            let resData = null;

            // 1. Primary: Native Ledger Engine Endpoint
            try {
                resData = await callApi('/api/ledger/accounts', {}, 'GET');
            } catch (e) {
                console.warn('Primary /api/ledger/accounts call failed, trying shim fallback:', e);
            }

            // 2. Secondary fallback: Accounting Shim Endpoint
            if (!resData) {
                try {
                    resData = await callApi('/api/accounting/accounts', {}, 'GET');
                } catch (e2) {
                    console.error('Shim /api/accounting/accounts fallback also failed:', e2);
                }
            }

            const raw = Array.isArray(resData) 
                ? resData 
                : (resData?.accounts || resData?.data || []);

            if (Array.isArray(raw) && raw.length > 0) {
                _coaList = raw.map(acc => {
                    const code = String(acc.code || acc.account_code || '');
                    const category = (acc.category || 'ASSET').toUpperCase();
                    const normalBal = (acc.normal_balance || (['ASSET', 'EXPENSE'].includes(category) ? 'DEBIT' : 'CREDIT')).toUpperCase();
                    return {
                        id: code || String(acc.id || ''),
                        code: code,
                        name: acc.name || 'Unnamed Account',
                        category: category,
                        account_type: (acc.account_type || `${category}_GENERAL`).toUpperCase(),
                        normal_balance: normalBal,
                        balance: parseFloat(acc.balance || 0),
                        debit: parseFloat(acc.debit || acc.live_debit || 0),
                        credit: parseFloat(acc.credit || acc.live_credit || 0),
                        description: acc.description || '',
                        is_system: !!acc.is_system
                    };
                }).sort((a, b) => (Number(a.code) || 0) - (Number(b.code) || 0) || a.name.localeCompare(b.name));
            } else {
                _coaList = [];
            }

            _renderList();

            // Do not auto-select first item; keep detail pane closed unless preselected
            if (_coaList.length > 0) {
                const targetCode = window._coaPreselectCode;
                window._coaPreselectCode = null;
                const selected = targetCode 
                    ? _coaList.find(a => String(a.code) === String(targetCode))
                    : (_activeAccount ? _coaList.find(a => a.code === _activeAccount.code) : null);
                if (selected) {
                    _showDetailView(selected);
                } else {
                    _activeAccount = null;
                    VaultPage?.showDetail?.(false);
                }
            } else {
                _activeAccount = null;
                VaultPage?.showDetail?.(false);
            }

        } catch (err) {
            console.error('[VaultCOA.load error]', err);
            if (listEl) {
                listEl.innerHTML = `<li class="p-6 text-center text-red-600 text-xs">Failed to load Chart of Accounts: ${_escapeHtml(err.message)}</li>`;
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Render List ───────────────────────────────────────────────────────────
    function _renderList() {
        const ul = document.getElementById('vaultList');
        const msgEl = document.getElementById('vaultListMsg');
        if (!ul) return;
        ul.innerHTML = '';

        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase().trim();

        const filtered = _coaList.filter(item => {
            // Modal Filter Category
            if (_filterCategory !== 'ALL') {
                if ((item.category || '').toUpperCase() !== _filterCategory) return false;
            }
            // Modal Filter Normal Balance
            if (_filterNormalBal !== 'ALL') {
                if (item.normal_balance !== _filterNormalBal) return false;
            }
            // Modal Filter Classification Type
            if (_filterType !== 'ALL') {
                if (item.account_type !== _filterType) return false;
            }
            // Modal Filter Balance Activity
            if (_filterBalStatus === 'NON_ZERO') {
                if (Math.abs(item.balance) === 0) return false;
            } else if (_filterBalStatus === 'ZERO') {
                if (Math.abs(item.balance) !== 0) return false;
            }

            if (!q) return true;
            return item.name.toLowerCase().includes(q) ||
                   String(item.code || '').toLowerCase().includes(q) ||
                   String(item.category || '').toLowerCase().includes(q) ||
                   String(item.account_type || '').toLowerCase().includes(q) ||
                   String(item.description || '').toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
            if (msgEl) {
                msgEl.textContent = q ? 'No matching accounts found.' : 'No accounts match the active filters.';
                msgEl.classList.remove('hidden');
            }
            return;
        }
        if (msgEl) msgEl.classList.add('hidden');

        ul.innerHTML = filtered.map(item => {
            const badgeClass = TYPE_COLORS[item.account_type] || CATEGORY_STYLES[item.category] || 'bg-slate-100 text-slate-700 border-slate-200';
            const formattedType = (item.account_type || item.category || 'GENERAL').replace(/_/g, ' ');
            const isSelected = _activeAccount && String(_activeAccount.code) === String(item.code);
            const isDebitNormal = item.normal_balance === 'DEBIT';
            const balSuffix = isDebitNormal ? 'Dr' : 'Cr';
            const hasBal = item.balance !== 0;

            return `
                <li data-code="${_escapeHtml(item.code)}" class="p-3 bg-white rounded-lg border transition shadow-2xs space-y-1 cursor-pointer ${
                    isSelected ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-400/30' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50/70'
                }">
                    <div class="flex justify-between items-start gap-2">
                        <span class="font-bold text-gray-900 text-xs truncate flex-1 leading-snug">${_escapeHtml(item.name)}</span>
                        ${item.code ? `<span class="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-800 rounded border border-slate-200 shrink-0">#${_escapeHtml(item.code)}</span>` : ''}
                    </div>
                    <div class="flex items-center justify-between text-[11px] mt-1 pt-0.5">
                        <span class="px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wider ${badgeClass}">
                            ${_escapeHtml(formattedType)}
                        </span>
                        <span class="font-bold text-xs ${hasBal ? 'text-gray-900' : 'text-gray-400 font-mono'}">
                            ₹${Math.abs(item.balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                            <span class="text-[10px] ${isDebitNormal ? 'text-blue-700' : 'text-emerald-700'} font-semibold font-mono">${balSuffix}</span>
                        </span>
                    </div>
                </li>
            `;
        }).join('');

        ul.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => {
                    x.classList.remove('border-indigo-500', 'bg-indigo-50/60', 'ring-1', 'ring-indigo-400/30');
                    x.classList.add('border-gray-200');
                });
                li.classList.remove('border-gray-200');
                li.classList.add('border-indigo-500', 'bg-indigo-50/60', 'ring-1', 'ring-indigo-400/30');

                const code = li.dataset.code;
                const found = _coaList.find(item => String(item.code) === String(code));
                if (found) _showDetailView(found);
            });
        });
    }

    // ── Show Detail View ──────────────────────────────────────────────────────
    async function _showDetailView(item) {
        _activeAccount = item;
        VaultPage?.showDetail?.(true);
        VaultPage?.showDetailPane?.();
        const view = document.getElementById('vaultDetailView');
        if (!view) return;

        const badgeClass = TYPE_COLORS[item.account_type] || CATEGORY_STYLES[item.category] || 'bg-slate-100 text-slate-700 border-slate-200';
        const catBadgeClass = CATEGORY_STYLES[item.category] || 'bg-slate-100 text-slate-700 border-slate-200';
        const formattedType = (item.account_type || item.category || 'GENERAL').replace(/_/g, ' ');
        const isDebitNormal = item.normal_balance === 'DEBIT';
        const normalBalanceText = isDebitNormal ? 'Debit (Dr)' : 'Credit (Cr)';
        const normalBalanceClass = isDebitNormal ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200';
        const balSuffix = isDebitNormal ? 'Dr' : 'Cr';

        // Account range description
        let seriesDesc = 'General Control';
        const cNum = Number(item.code);
        if (cNum >= 1000 && cNum < 2000) seriesDesc = '1000s Asset Master Range';
        else if (cNum >= 2000 && cNum < 3000) seriesDesc = '2000s Liability Master Range';
        else if (cNum >= 3000 && cNum < 5000) seriesDesc = '3000s/4000s Revenue Master Range';
        else if (cNum >= 5000 && cNum < 6000) seriesDesc = '5000s Linehaul & Operating Expense';
        else if (cNum >= 6000 && cNum < 7000) seriesDesc = '6000s Equity & Reserves Range';

        // Date filter active label
        const hasDateFilter = !!(_statementStartDate || _statementEndDate);
        const dateFilterText = hasDateFilter 
            ? `${_statementStartDate || 'Start'} → ${_statementEndDate || 'Current'}`
            : 'All Time';

        view.innerHTML = `
            <div class="space-y-5">
                <!-- Top Account Header Card (High-Contrast Clean White Theme) -->
                <div class="p-5 bg-white border border-gray-200 rounded-xl shadow-xs">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div class="space-y-1.5 flex-1">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="px-2 py-0.5 text-xs font-mono font-bold bg-slate-100 text-slate-800 rounded border border-slate-300">
                                    #${_escapeHtml(item.code || 'COA')}
                                </span>
                                <span class="px-2.5 py-0.5 text-xs font-bold uppercase rounded-full border ${catBadgeClass}">
                                    ${_escapeHtml(item.category)}
                                </span>
                                <span class="px-2.5 py-0.5 text-xs font-semibold uppercase rounded-full border ${badgeClass}">
                                    ${_escapeHtml(formattedType)}
                                </span>
                            </div>
                            <h1 class="text-xl font-black text-gray-900 tracking-tight">${_escapeHtml(item.name)}</h1>
                            <p class="text-xs text-gray-600 max-w-xl">${_escapeHtml(item.description || 'Master chart of accounts control record.')}</p>
                        </div>
                        <div class="text-left sm:text-right bg-gray-50 border border-gray-200 p-3 rounded-lg shrink-0">
                            <span class="text-[11px] text-gray-500 uppercase block font-bold tracking-wide">Live Closing Balance</span>
                            <div class="flex items-baseline sm:justify-end gap-1.5 mt-1">
                                <span class="text-2xl font-black text-gray-900 font-mono">
                                    ₹${Math.abs(item.balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span class="text-xs font-black font-mono px-2 py-0.5 rounded shadow-2xs ${isDebitNormal ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}">
                                    ${balSuffix}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Action Buttons Bar -->
                    <div class="flex flex-wrap items-center gap-2 pt-3.5 mt-3.5 border-t border-gray-200 text-xs">
                        <button onclick="VaultCOA.openAddAccountModal()" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700 border-0 flex items-center gap-1.5 shadow-xs">
                            <span>+ New Account</span>
                        </button>
                        <button onclick="VaultCOA.openEditAccountModal('${_escapeHtml(item.code)}')" class="btn-ghost btn-sm border border-gray-300 text-gray-700 hover:bg-gray-100 flex items-center gap-1">
                            <span>✏️ Edit</span>
                        </button>
                        <button onclick="VaultCOA.handleDeleteAccount('${_escapeHtml(item.code)}')" class="btn-ghost btn-sm border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 flex items-center gap-1">
                            <span>🗑️ Delete</span>
                        </button>
                        <button onclick="window.print()" class="btn-ghost btn-sm border border-gray-300 text-gray-700 hover:bg-gray-100 ml-auto flex items-center gap-1">
                            <span>🖨️ Print Statement</span>
                        </button>
                    </div>
                </div>

                <!-- Parameters & Governance Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 shadow-2xs">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Account Code &amp; Series</span>
                        <span class="text-xs font-mono font-bold text-gray-900 block mt-0.5">#${_escapeHtml(item.code || '—')}</span>
                        <span class="text-[10px] text-gray-400 block">${seriesDesc}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 shadow-2xs">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Classification</span>
                        <span class="text-xs font-bold text-gray-900 block mt-0.5">${_escapeHtml(item.category)}</span>
                        <span class="text-[10px] text-gray-500 block truncate">${_escapeHtml(formattedType)}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 shadow-2xs">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Normal Balance Rule</span>
                        <span class="text-xs font-bold px-1.5 py-0.5 rounded border inline-block mt-0.5 ${normalBalanceClass}">${normalBalanceText}</span>
                        <span class="text-[10px] text-gray-400 block mt-0.5">${isDebitNormal ? 'Increases on Dr, decreases on Cr' : 'Increases on Cr, decreases on Dr'}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 shadow-2xs">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Live Turnover Activity</span>
                        <div class="text-xs font-mono text-gray-800 mt-0.5 flex justify-between">
                            <span>Dr: ₹${item.debit.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</span>
                            <span>Cr: ₹${item.credit.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</span>
                        </div>
                        <span class="text-[10px] text-indigo-600 font-semibold block mt-0.5">Double-Entry Runtime Sync</span>
                    </div>
                </div>

                <!-- Live Ledger Statement Table Container -->
                <div class="p-4 bg-white border border-gray-200 rounded-xl space-y-3.5 shadow-2xs">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-3">
                        <div>
                            <h3 class="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                                <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                Live General Ledger Statement &amp; Running Balance
                            </h3>
                            <p class="text-[11px] text-gray-500 mt-0.5">Chronological audit of double-entry postings affecting account #${_escapeHtml(item.code)}.</p>
                        </div>
                        <div class="flex items-center gap-2 text-xs flex-wrap">
                            <span class="px-2 py-1 bg-gray-100 rounded text-gray-600 font-mono text-[11px] border border-gray-200 flex items-center gap-1">
                                <span>Period:</span>
                                <strong class="text-gray-900">${dateFilterText}</strong>
                            </span>
                            <button onclick="VaultCOA.openFilterModal()" class="btn-ghost btn-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
                                <span>Filter Period</span>
                            </button>
                            ${hasDateFilter ? `
                                <button onclick="VaultCOA.clearDateFilter()" class="btn-ghost btn-sm text-red-600 hover:text-red-800 text-[11px]">
                                    ✕ Clear Date
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <div id="coaStatementContent" class="overflow-x-auto">
                        <div class="p-6 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
                            <div class="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            <span>Querying live double-entry ledger statement…</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        _loadStatement(item.code, _statementStartDate, _statementEndDate);
    }

    // ── Load Running Ledger Statement ─────────────────────────────────────────
    async function _loadStatement(accountCode, startDate = '', endDate = '') {
        const container = document.getElementById('coaStatementContent');
        if (!container) return;

        try {
            const q = [];
            if (startDate) q.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) q.push(`end_date=${encodeURIComponent(endDate)}`);
            const qs = q.length ? `?${q.join('&')}` : '';

            let res = null;
            // 1. Primary: Native Ledger Statement Endpoint
            try {
                res = await callApi(`/api/ledger/accounts/${encodeURIComponent(accountCode)}/statement${qs}`, {}, 'GET');
            } catch (e) {
                console.warn('Primary ledger statement call failed, trying shim fallback:', e);
            }

            // 2. Secondary: Accounting Shim Statement Endpoint
            if (!res) {
                try {
                    res = await callApi(`/api/accounting/accounts/${encodeURIComponent(accountCode)}/statement${qs}`, {}, 'GET');
                } catch (e2) {
                    console.error('Shim statement fallback failed:', e2);
                }
            }

            if (!res) {
                container.innerHTML = `<p class="text-xs text-red-600 py-4 text-center">Unable to load ledger statement.</p>`;
                return;
            }

            const entries = res.lines || res.entries || res.data || [];
            const openBal = parseFloat(res.opening_balance || 0);
            const closeBal = parseFloat(res.closing_balance || 0);
            const totDr = parseFloat(res.total_debit || 0);
            const totCr = parseFloat(res.total_credit || 0);

            const rowsHtml = entries.map((e, idx) => {
                const docNo = e.doc_no || e.transaction_no || '—';
                const docDate = e.doc_date || e.transaction_date || '—';
                const memo = e.memo || e.narration || e.transaction_type || '—';
                const party = [e.entity_code, e.entity_type].filter(Boolean).join(' • ') || e.reference || '—';
                const dr = parseFloat(e.debit || 0);
                const cr = parseFloat(e.credit || 0);
                const runBal = parseFloat(e.running_balance || 0);

                return `
                    <tr class="hover:bg-gray-50/70 transition-colors border-b border-gray-100 text-xs">
                        <td class="px-3 py-2 text-center text-gray-400 font-mono text-[11px]">${idx + 1}</td>
                        <td class="px-3 py-2 font-mono text-gray-600 whitespace-nowrap text-[11px]">${_escapeHtml(docDate)}</td>
                        <td class="px-3 py-2 font-bold text-indigo-700 font-mono whitespace-nowrap text-[11px]">
                            <span class="hover:underline cursor-pointer" title="Voucher">${_escapeHtml(docNo)}</span>
                        </td>
                        <td class="px-3 py-2 text-gray-700 font-mono text-[11px]">${_escapeHtml(party)}</td>
                        <td class="px-3 py-2 text-gray-800">${_escapeHtml(memo)}</td>
                        <td class="px-3 py-2 text-right font-mono font-medium ${dr > 0 ? 'text-gray-900' : 'text-gray-400'}">
                            ${dr > 0 ? '₹' + dr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </td>
                        <td class="px-3 py-2 text-right font-mono font-medium ${cr > 0 ? 'text-gray-900' : 'text-gray-400'}">
                            ${cr > 0 ? '₹' + cr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </td>
                        <td class="px-3 py-2 text-right font-mono font-bold text-gray-900">
                            ₹${runBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <table class="w-full text-left text-xs border-collapse">
                    <thead class="bg-gray-100 text-gray-600 font-bold uppercase border-b border-gray-200 text-[10px] tracking-wider">
                        <tr>
                            <th class="px-3 py-2 text-center" style="width:40px;">#</th>
                            <th class="px-3 py-2" style="width:95px;">Date</th>
                            <th class="px-3 py-2" style="width:130px;">Doc #</th>
                            <th class="px-3 py-2" style="width:120px;">Entity / Party</th>
                            <th class="px-3 py-2">Narration / Memo</th>
                            <th class="px-3 py-2 text-right" style="width:110px;">Debit (Dr)</th>
                            <th class="px-3 py-2 text-right" style="width:110px;">Credit (Cr)</th>
                            <th class="px-3 py-2 text-right" style="width:130px;">Running Balance</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 bg-white">
                        <tr class="bg-slate-50/70 font-semibold text-gray-600 italic">
                            <td class="px-3 py-2 text-center">—</td>
                            <td class="px-3 py-2 font-mono text-[11px]">${_escapeHtml(startDate || 'Beginning')}</td>
                            <td class="px-3 py-2 font-mono text-[11px] text-gray-500">OPENING</td>
                            <td class="px-3 py-2" colspan="4">Opening Balance Brought Forward</td>
                            <td class="px-3 py-2 text-right font-bold text-indigo-950 font-mono">
                                ₹${openBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                        </tr>
                        ${rowsHtml || `
                            <tr>
                                <td colspan="8" class="px-3 py-6 text-center text-gray-400 italic">
                                    No transaction entries recorded for account #${_escapeHtml(accountCode)} in the selected period.
                                </td>
                            </tr>
                        `}
                        <tr class="bg-gray-50 font-bold border-t-2 border-gray-300 text-gray-900">
                            <td class="px-3 py-2 text-center" colspan="5">Period Totals &amp; Closing Balance</td>
                            <td class="px-3 py-2 text-right text-indigo-900 font-mono">
                                ₹${totDr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td class="px-3 py-2 text-right text-emerald-900 font-mono">
                                ₹${totCr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td class="px-3 py-2 text-right text-amber-900 font-black font-mono text-sm">
                                ₹${closeBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                        </tr>
                    </tbody>
                </table>
            `;
        } catch (err) {
            console.error('[_loadStatement error]', err);
            container.innerHTML = `<p class="text-xs text-red-600 py-4 text-center">Failed to load statement: ${_escapeHtml(err.message)}</p>`;
        }
    }

    function clearDateFilter() {
        _statementStartDate = '';
        _statementEndDate = '';
        const sEl = document.getElementById('coa-filter-start-date');
        const eEl = document.getElementById('coa-filter-end-date');
        if (sEl) sEl.value = '';
        if (eEl) eEl.value = '';
        _updateFilterButtonState();
        if (_activeAccount) {
            _showDetailView(_activeAccount);
        }
    }

    // ── Create Account Modal ──────────────────────────────────────────────────
    function openAddAccountModal() {
        const categories = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
        const accountTypes = [
            'CURRENT_ASSET',
            'BANK',
            'RECEIVABLE',
            'NON_CURRENT_ASSET',
            'INVENTORY',
            'CURRENT_LIABILITY',
            'PAYABLE',
            'NON_CURRENT_LIABILITY',
            'EQUITY',
            'OPERATING_REVENUE',
            'NON_OPERATING_REVENUE',
            'DIRECT_EXPENSE',
            'OPERATING_EXPENSE',
            'OVERHEAD_EXPENSE',
            'OTHER_EXPENSE'
        ];

        const modal = document.createElement('div');
        modal.id = 'coaAddModal';
        modal.className = 'modal-overlay fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-gray-100">
                <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                    <div>
                        <h2 class="text-base font-bold text-gray-900">Create New Chart of Accounts Record</h2>
                        <p class="text-xs text-gray-500">Adds an account to DATADB/coa.json with double-entry governance rules.</p>
                    </div>
                    <button onclick="document.getElementById('coaAddModal').remove()" class="text-gray-400 hover:text-gray-700 text-lg font-bold">✕</button>
                </div>
                <div class="space-y-3.5 text-xs">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-gray-700 mb-1">Category *</label>
                            <select id="newAccCategory" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold">
                                ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-gray-700 mb-1">Account Code (Optional)</label>
                            <input type="text" id="newAccCode" placeholder="Auto-assigned if blank" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono">
                            <span class="text-[10px] text-gray-400 mt-0.5 block">e.g. 1500 (Asset), 2500 (Liab), 5500 (Exp)</span>
                        </div>
                    </div>
                    <div>
                        <label class="block font-bold text-gray-700 mb-1">Account Official Name *</label>
                        <input type="text" id="newAccName" placeholder="e.g. Northern Hub Local Drayage Expense" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block font-bold text-gray-700 mb-1">Classification Type *</label>
                            <select id="newAccType" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs">
                                ${accountTypes.map(t => `<option value="${t}">${t.replace(/_/g, ' ')}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block font-bold text-gray-700 mb-1">Normal Balance *</label>
                            <select id="newAccNormal" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold">
                                <option value="DEBIT">DEBIT (Dr)</option>
                                <option value="CREDIT">CREDIT (Cr)</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block font-bold text-gray-700 mb-1">Description / Double-Entry Purpose</label>
                        <input type="text" id="newAccDesc" placeholder="e.g. Inward freight cartage and loading expenses for hub" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs">
                    </div>
                </div>
                <div class="flex justify-end gap-2 pt-3 border-t border-gray-100">
                    <button onclick="document.getElementById('coaAddModal').remove()" class="btn-ghost btn-sm">Cancel</button>
                    <button onclick="VaultCOA.saveNewAccount()" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs">
                        <span>Save Account</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Auto-update normal balance on category change
        const catSelect = document.getElementById('newAccCategory');
        const normSelect = document.getElementById('newAccNormal');
        catSelect?.addEventListener('change', () => {
            const c = catSelect.value;
            if (normSelect) {
                normSelect.value = (c === 'ASSET' || c === 'EXPENSE') ? 'DEBIT' : 'CREDIT';
            }
        });
    }

    async function saveNewAccount() {
        const category = document.getElementById('newAccCategory')?.value?.trim();
        const code = document.getElementById('newAccCode')?.value?.trim();
        const name = document.getElementById('newAccName')?.value?.trim();
        const account_type = document.getElementById('newAccType')?.value?.trim();
        const normal_balance = document.getElementById('newAccNormal')?.value?.trim();
        const description = document.getElementById('newAccDesc')?.value?.trim();

        if (!name) {
            alert('Please enter an account name.');
            return;
        }

        try {
            await callApi('/api/ledger/accounts', {
                code,
                name,
                category,
                account_type,
                normal_balance,
                description
            }, 'POST');

            document.getElementById('coaAddModal')?.remove();
            alert(`Account '${name}' created successfully.`);
            await load();
        } catch (err) {
            alert('Failed to create account: ' + (err.message || err));
        }
    }

    // ── Edit Account Modal ────────────────────────────────────────────────────
    function openEditAccountModal(accountCode) {
        const acc = _coaList.find(a => String(a.code) === String(accountCode));
        if (!acc) return;

        const modal = document.createElement('div');
        modal.id = 'coaEditModal';
        modal.className = 'modal-overlay fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100">
                <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                    <div>
                        <h2 class="text-base font-bold text-gray-900">Edit Account #${_escapeHtml(acc.code)}</h2>
                        <p class="text-xs text-gray-500">${_escapeHtml(acc.category)} &bull; ${_escapeHtml(acc.account_type)}</p>
                    </div>
                    <button onclick="document.getElementById('coaEditModal').remove()" class="text-gray-400 hover:text-gray-700 text-lg font-bold">✕</button>
                </div>
                <div class="space-y-3.5 text-xs">
                    <div>
                        <label class="block font-bold text-gray-700 mb-1">Account Official Name *</label>
                        <input type="text" id="editAccName" value="${_escapeHtml(acc.name)}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold">
                    </div>
                    <div>
                        <label class="block font-bold text-gray-700 mb-1">Description / Notes</label>
                        <input type="text" id="editAccDesc" value="${_escapeHtml(acc.description)}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs">
                    </div>
                    <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
                        <strong class="text-slate-800">Double-Entry Governance:</strong> Account code <code class="font-mono text-indigo-700 font-bold">#${_escapeHtml(acc.code)}</code>, category, and normal balance are immutable to protect trial balance integrity.
                    </div>
                </div>
                <div class="flex justify-end gap-2 pt-3 border-t border-gray-100">
                    <button onclick="document.getElementById('coaEditModal').remove()" class="btn-ghost btn-sm">Cancel</button>
                    <button onclick="VaultCOA.saveEditAccount('${_escapeHtml(acc.code)}')" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs">
                        <span>Save Changes</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    async function saveEditAccount(accountCode) {
        const name = document.getElementById('editAccName')?.value?.trim();
        const description = document.getElementById('editAccDesc')?.value?.trim();

        if (!name) {
            alert('Please enter an account name.');
            return;
        }

        try {
            await callApi(`/api/ledger/accounts/${encodeURIComponent(accountCode)}`, { name, description }, 'PUT');
            document.getElementById('coaEditModal')?.remove();
            alert(`Account #${accountCode} updated successfully.`);
            await load();
        } catch (err) {
            alert('Failed to update account: ' + (err.message || err));
        }
    }

    // ── Delete Account ────────────────────────────────────────────────────────
    async function handleDeleteAccount(accountCode) {
        const acc = _coaList.find(a => String(a.code) === String(accountCode));
        const name = acc ? acc.name : `#${accountCode}`;

        if (!confirm(`Are you sure you want to permanently delete account '${name}' (#${accountCode})?\n\nNote: Deletion will be rejected if any posted ledger transactions exist or if it is a core system account.`)) {
            return;
        }

        try {
            await callApi(`/api/ledger/accounts/${encodeURIComponent(accountCode)}`, {}, 'DELETE');
            alert(`Account #${accountCode} deleted successfully.`);
            _activeAccount = null;
            await load();
        } catch (err) {
            alert('Cannot delete account: ' + (err.message || err));
        }
    }

    function search() {
        _renderList();
    }

    return { 
        load, 
        search, 
        openFilterModal,
        closeFilterModal,
        clearDateFilter,
        openAddAccountModal,
        saveNewAccount,
        openEditAccountModal,
        saveEditAccount,
        handleDeleteAccount
    };
})();

window.VaultCOA = VaultCOA;
window.VaultCoa = VaultCOA;
