// ============================================================================
// VAULT-TRIAL-BALANCE.JS — Trial Balance (Double-Entry Verification)
// Aligned with Master Ledger Implant Plan (Section 13.1 A and Table 14.1 Item 3)
// Primary Endpoint: /api/ledger/reports/trial-balance
// Fallback: /api/accounting/reports/trial-balance
// Filter Model: Standard Modal pattern from Shipments (vaultFilterBtn)
// Styling: Clean .detail-card pattern, high-contrast badges & metrics
// ============================================================================

const VaultTrialBalance = (() => {

    let _tbData = null; // { period, is_balanced, total_debit, total_credit, difference, accounts: [] }
    let _accountList = [];
    let _activeAccount = null;

    // Filter states
    let _filterStartDate = "";
    let _filterEndDate = "";
    let _filterBranch = "ALL";
    let _filterCategory = "ALL";
    let _filterExcludeZero = true; // Exclude accounts with 0 debit & 0 credit by default

    const CATEGORY_STYLES = {
        'ASSET': 'bg-blue-50 text-blue-800 border-blue-200',
        'LIABILITY': 'bg-amber-50 text-amber-800 border-amber-200',
        'EQUITY': 'bg-rose-50 text-rose-800 border-rose-200',
        'REVENUE': 'bg-emerald-50 text-emerald-800 border-emerald-200',
        'EXPENSE': 'bg-red-50 text-red-800 border-red-200'
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
        return localStorage.getItem('token') || '';
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function _fmtMoney(n) {
        const num = Number(n) || 0;
        return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function _hasActiveFilters() {
        return !!_filterStartDate ||
               !!_filterEndDate ||
               (_filterBranch && _filterBranch !== 'ALL') ||
               (_filterCategory && _filterCategory !== 'ALL') ||
               !_filterExcludeZero;
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
            btn.title = 'Filter Trial Balance';
        }
    }

    // ── Setup Filter Modal (Matches Shipments Model) ───────────────────────────
    function _setupFilterModal() {
        // Unhide header filter button
        const filterBtn = document.getElementById('vaultFilterBtn');
        if (filterBtn) {
            filterBtn.classList.remove('hidden');
            filterBtn.onclick = () => openFilterModal();
        }

        let modal = document.getElementById('tbFilterModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'tbFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-lg">
                    <div class="flex justify-between items-center border-b pb-3">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                <i class="fa-solid fa-scale-balanced text-sm"></i>
                            </div>
                            <div>
                                <h2 class="text-base font-bold text-gray-900">Filter Trial Balance</h2>
                                <p class="text-[11px] text-gray-500">Filter reporting period, branch, and accounts</p>
                            </div>
                        </div>
                        <button id="close-tb-filter-modal" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1 leading-none" aria-label="Close">✕</button>
                    </div>

                    <!-- Presets -->
                    <div>
                        <span class="block font-semibold text-gray-700 text-xs mb-1.5">Quick Date Presets</span>
                        <div class="flex flex-wrap gap-1.5">
                            <button type="button" class="tb-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition" data-preset="all">All Time</button>
                            <button type="button" class="tb-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition" data-preset="today">Today</button>
                            <button type="button" class="tb-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition" data-preset="this_month">This Month</button>
                            <button type="button" class="tb-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition" data-preset="fy_26_27">FY 2026-27</button>
                            <button type="button" class="tb-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium transition" data-preset="last_month">Last Month</button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label for="tb-filter-start-date" class="block font-semibold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="tb-filter-start-date" class="form-input text-xs w-full">
                        </div>
                        <div>
                            <label for="tb-filter-end-date" class="block font-semibold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="tb-filter-end-date" class="form-input text-xs w-full">
                        </div>
                        <div>
                            <label for="tb-filter-branch" class="block font-semibold text-gray-700 mb-1">Branch Scope</label>
                            <select id="tb-filter-branch" class="form-input text-xs w-full">
                                <option value="ALL">All Branches (Consolidated)</option>
                                <option value="DEL">Delhi Hub (DEL)</option>
                                <option value="BOM">Mumbai Hub (BOM)</option>
                                <option value="BLR">Bangalore Hub (BLR)</option>
                                <option value="HYD">Hyderabad Hub (HYD)</option>
                                <option value="CCU">Kolkata Hub (CCU)</option>
                                <option value="MAA">Chennai Hub (MAA)</option>
                                <option value="PNQ">Pune Hub (PNQ)</option>
                                <option value="AMD">Ahmedabad Hub (AMD)</option>
                                <option value="JAI">Jaipur Hub (JAI)</option>
                            </select>
                        </div>
                        <div>
                            <label for="tb-filter-category" class="block font-semibold text-gray-700 mb-1">COA Category</label>
                            <select id="tb-filter-category" class="form-input text-xs w-full">
                                <option value="ALL">All Categories</option>
                                <option value="ASSET">ASSET (1000s Series)</option>
                                <option value="LIABILITY">LIABILITY (2000s Series)</option>
                                <option value="EQUITY">EQUITY (6000s Series)</option>
                                <option value="REVENUE">REVENUE (3000s/4000s Series)</option>
                                <option value="EXPENSE">EXPENSE (5000s Series)</option>
                            </select>
                        </div>
                    </div>

                    <div class="border-t pt-3">
                        <label class="flex items-center gap-2 text-xs font-semibold text-gray-800 cursor-pointer select-none">
                            <input type="checkbox" id="tb-filter-exclude-zero" class="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" checked>
                            <span>Exclude accounts with zero activity / zero balance</span>
                        </label>
                        <p class="text-[11px] text-gray-500 mt-0.5 ml-6">When checked, shows only ledger accounts that have transaction lines or opening balances.</p>
                    </div>

                    <div class="flex justify-end gap-3 pt-3 border-t">
                        <button id="tb-reset-filters" type="button" class="btn-ghost btn-sm">Reset</button>
                        <button id="tb-apply-filters" type="button" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs font-semibold">Apply Filters</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Modal listeners
            document.getElementById('close-tb-filter-modal').addEventListener('click', closeFilterModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeFilterModal();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeFilterModal();
            });

            // Date Preset clicks
            modal.querySelectorAll('.tb-preset-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const preset = btn.dataset.preset;
                    const startInput = document.getElementById('tb-filter-start-date');
                    const endInput = document.getElementById('tb-filter-end-date');
                    const now = new Date();
                    const y = now.getFullYear();
                    const m = String(now.getMonth() + 1).padStart(2, '0');
                    const d = String(now.getDate()).padStart(2, '0');
                    const todayStr = `${y}-${m}-${d}`;

                    if (preset === 'all') {
                        startInput.value = '';
                        endInput.value = '';
                    } else if (preset === 'today') {
                        startInput.value = todayStr;
                        endInput.value = todayStr;
                    } else if (preset === 'this_month') {
                        startInput.value = `${y}-${m}-01`;
                        endInput.value = todayStr;
                    } else if (preset === 'fy_26_27') {
                        startInput.value = '2026-04-01';
                        endInput.value = '2027-03-31';
                    } else if (preset === 'last_month') {
                        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0);
                        const pY = prevMonth.getFullYear();
                        const pM = String(prevMonth.getMonth() + 1).padStart(2, '0');
                        const pEndD = String(lastDayPrev.getDate()).padStart(2, '0');
                        startInput.value = `${pY}-${pM}-01`;
                        endInput.value = `${pY}-${pM}-${pEndD}`;
                    }
                });
            });

            // Apply listener
            document.getElementById('tb-apply-filters').addEventListener('click', () => {
                _filterStartDate = document.getElementById('tb-filter-start-date').value;
                _filterEndDate = document.getElementById('tb-filter-end-date').value;
                _filterBranch = document.getElementById('tb-filter-branch').value;
                _filterCategory = document.getElementById('tb-filter-category').value;
                _filterExcludeZero = document.getElementById('tb-filter-exclude-zero').checked;

                closeFilterModal();
                _updateFilterButtonState();
                load();
            });

            // Reset listener
            document.getElementById('tb-reset-filters').addEventListener('click', () => {
                _filterStartDate = "";
                _filterEndDate = "";
                _filterBranch = "ALL";
                _filterCategory = "ALL";
                _filterExcludeZero = true;

                document.getElementById('tb-filter-start-date').value = "";
                document.getElementById('tb-filter-end-date').value = "";
                document.getElementById('tb-filter-branch').value = "ALL";
                document.getElementById('tb-filter-category').value = "ALL";
                document.getElementById('tb-filter-exclude-zero').checked = true;

                closeFilterModal();
                _updateFilterButtonState();
                load();
            });
        }

        _updateFilterButtonState();
    }

    function openFilterModal() {
        const modal = document.getElementById('tbFilterModal');
        if (!modal) return;
        document.getElementById('tb-filter-start-date').value = _filterStartDate;
        document.getElementById('tb-filter-end-date').value = _filterEndDate;
        document.getElementById('tb-filter-branch').value = _filterBranch || 'ALL';
        document.getElementById('tb-filter-category').value = _filterCategory || 'ALL';
        document.getElementById('tb-filter-exclude-zero').checked = _filterExcludeZero;
        modal.classList.remove('hidden');
    }

    function closeFilterModal() {
        const modal = document.getElementById('tbFilterModal');
        if (modal) modal.classList.add('hidden');
    }

    // ── Setup List Pane ────────────────────────────────────────────────────────
    function _injectListPane() {
        const msg = document.getElementById('vaultListMsg');
        const list = document.getElementById('vaultList');
        const search = document.getElementById('vaultSearch');
        if (msg) { msg.textContent = ''; msg.classList.add('hidden'); }
        if (list) list.innerHTML = '';
        if (search) {
            search.placeholder = 'Search ledger accounts, codes, balances…';
            search.oninput = () => _renderList();
        }
        _setupFilterModal();
    }

    // ── API Caller Helper ──────────────────────────────────────────────────────
    async function _fetchReport() {
        const token = _getAuthToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        const params = new URLSearchParams();
        if (_filterStartDate) params.append('start_date', _filterStartDate);
        if (_filterEndDate) params.append('end_date', _filterEndDate);
        if (_filterBranch && _filterBranch !== 'ALL') params.append('branch_code', _filterBranch);
        if (!_filterExcludeZero) params.append('include_zero', 'true');

        const qs = params.toString() ? `?${params.toString()}` : '';

        // Try primary native endpoint first
        try {
            const r = await fetch(`/api/ledger/reports/trial-balance${qs}`, { headers });
            if (r.ok) {
                const data = await r.json();
                return data?.trial_balance || data?.data || data || {};
            }
        } catch (e) {
            console.warn('[VaultTrialBalance] Primary endpoint failed, trying shim fallback', e);
        }

        // Try accounting shim endpoint
        const r2 = await fetch(`/api/accounting/reports/trial-balance${qs}`, { headers });
        if (!r2.ok) {
            throw new Error(`Server returned HTTP ${r2.status}`);
        }
        const data2 = await r2.json();
        return data2?.trial_balance || data2?.data || data2 || {};
    }

    // ── Main Load Function ─────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        window.setLoading?.(true, 'Calculating Live Trial Balance...', 'list');

        const listEl = document.getElementById('vaultList');
        if (listEl) {
            listEl.innerHTML = `
                <li class="p-6 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Aggregating debits &amp; credits from Master Ledger...</p>
                </li>
            `;
        }

        try {
            const report = await _fetchReport();
            _tbData = report;

            let rawAccounts = [];
            if (Array.isArray(report.accounts)) {
                rawAccounts = report.accounts;
            } else if (report.balances && typeof report.balances === 'object') {
                rawAccounts = Object.entries(report.balances).map(([name, item]) => ({
                    account_name: name,
                    account_code: item.account_code || '',
                    category: item.category || 'ASSET',
                    account_type: (item.account_type || '').toUpperCase(),
                    normal_balance: item.normal_balance || (item.category === 'LIABILITY' || item.category === 'REVENUE' || item.category === 'EQUITY' ? 'CREDIT' : 'DEBIT'),
                    total_debit: Number(item.debit || item.total_debit) || 0,
                    total_credit: Number(item.credit || item.total_credit) || 0,
                    net_balance: Number(item.net || item.net_balance) || 0,
                }));
            }

            _accountList = rawAccounts.map(acc => {
                const totalDr = Number(acc.total_debit) || 0;
                const totalCr = Number(acc.total_credit) || 0;
                let netBal = Number(acc.net_balance);
                const normalBal = (acc.normal_balance || 'DEBIT').toUpperCase();

                if (isNaN(netBal)) {
                    netBal = normalBal === 'CREDIT' ? (totalCr - totalDr) : (totalDr - totalCr);
                }

                // Determine whether position is Debit (Dr) or Credit (Cr)
                let isDr = true;
                if (totalDr > totalCr) {
                    isDr = true;
                } else if (totalCr > totalDr) {
                    isDr = false;
                } else {
                    isDr = normalBal === 'DEBIT';
                }

                return {
                    account_code: String(acc.account_code || ''),
                    account_name: acc.account_name || 'Account ' + (acc.account_code || ''),
                    category: (acc.category || 'ASSET').toUpperCase(),
                    account_type: (acc.account_type || '').toUpperCase() || 'GENERAL',
                    normal_balance: normalBal,
                    total_debit: totalDr,
                    total_credit: totalCr,
                    net_balance: netBal,
                    is_debit: isDr,
                    account_id: acc.account_id || ''
                };
            }).sort((a, b) => (Number(a.account_code) || 0) - (Number(b.account_code) || 0) || a.account_name.localeCompare(b.account_name));

            _renderList();

            // Do not auto-select first account; keep detail pane closed unless already selected
            if (_accountList.length > 0) {
                const found = _activeAccount ? _accountList.find(a => a.account_code === _activeAccount.account_code) : null;
                if (found) {
                    _showDetailView(found);
                } else {
                    _activeAccount = null;
                    VaultPage?.showDetail?.(false);
                }
            } else {
                _activeAccount = null;
                VaultPage?.showDetail?.(false);
            }

        } catch (err) {
            console.error('[VaultTrialBalance.load error]', err);
            if (listEl) {
                listEl.innerHTML = `
                    <li class="p-6 text-center text-red-600 text-xs space-y-2">
                        <i class="fa-solid fa-triangle-exclamation text-lg"></i>
                        <p class="font-bold">Failed to load Trial Balance</p>
                        <p class="text-gray-500">${_escapeHtml(err.message)}</p>
                        <button onclick="VaultTrialBalance.load()" class="btn btn-xs bg-indigo-600 text-white mt-2">Retry</button>
                    </li>
                `;
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Render List ────────────────────────────────────────────────────────────
    function _renderList() {
        const ul = document.getElementById('vaultList');
        const msgEl = document.getElementById('vaultListMsg');
        if (!ul) return;
        ul.innerHTML = '';

        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase().trim();

        let filtered = _accountList.filter(item => {
            if (_filterCategory !== 'ALL' && item.category !== _filterCategory) return false;
            if (_filterExcludeZero && item.total_debit === 0 && item.total_credit === 0 && item.net_balance === 0) return false;

            if (q) {
                const matchName = item.account_name.toLowerCase().includes(q);
                const matchCode = item.account_code.toLowerCase().includes(q);
                const matchType = item.account_type.toLowerCase().includes(q);
                const matchCat = item.category.toLowerCase().includes(q);
                return matchName || matchCode || matchType || matchCat;
            }
            return true;
        });

        if (filtered.length === 0) {
            if (msgEl) {
                msgEl.textContent = q ? 'No matching trial balance accounts found.' : 'No active accounts for selected filters.';
                msgEl.classList.remove('hidden');
            }
            return;
        }
        if (msgEl) msgEl.classList.add('hidden');

        ul.innerHTML = filtered.map(item => {
            const isSelected = _activeAccount && _activeAccount.account_code === item.account_code;
            const catStyle = CATEGORY_STYLES[item.category] || 'bg-slate-100 text-slate-700 border-slate-200';
            const isDr = item.is_debit;
            const netAbs = Math.abs(item.net_balance);

            return `
                <li data-code="${_escapeHtml(item.account_code)}" class="p-3 bg-white rounded-lg border ${isSelected ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-500' : 'border-gray-200'} hover:border-indigo-400 cursor-pointer transition shadow-xs space-y-1.5">
                    <div class="flex justify-between items-start gap-1">
                        <span class="font-bold text-gray-900 text-xs truncate max-w-[200px]" title="${_escapeHtml(item.account_name)}">
                            ${_escapeHtml(item.account_name)}
                        </span>
                        ${item.account_code ? `<span class="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200 flex-shrink-0">#${_escapeHtml(item.account_code)}</span>` : ''}
                    </div>

                    <div class="flex items-center justify-between text-[11px] mt-1 pt-1 border-t border-gray-100">
                        <span class="px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${catStyle}">
                            ${_escapeHtml(item.category)}
                        </span>

                        <div class="text-right flex items-center gap-1.5">
                            <span class="text-xs font-mono font-bold ${isDr ? 'text-blue-700' : 'text-emerald-700'}">
                                ${_fmtMoney(netAbs)}
                            </span>
                            <span class="px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${isDr ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'} shadow-2xs">
                                ${isDr ? 'Dr' : 'Cr'}
                            </span>
                        </div>
                    </div>
                </li>
            `;
        }).join('');

        const items = Array.from(ul.querySelectorAll('li'));
        items.forEach((li) => {
            li.addEventListener('click', () => {
                items.forEach(x => {
                    x.classList.remove('border-indigo-600', 'bg-indigo-50/40', 'ring-1', 'ring-indigo-500');
                    x.classList.add('border-gray-200');
                });
                li.classList.remove('border-gray-200');
                li.classList.add('border-indigo-600', 'bg-indigo-50/40', 'ring-1', 'ring-indigo-500');

                const code = li.dataset.code;
                const found = _accountList.find(item => String(item.account_code) === String(code));
                if (found) _showDetailView(found);
            });
        });
    }

    // ── Detail View: Empty State ───────────────────────────────────────────────
    function _showEmptyDetailView() {
        VaultPage?.showDetail?.(true);
        const view = document.getElementById('vaultDetailView');
        if (!view) return;

        view.innerHTML = `
            <div class="p-8 text-center bg-white rounded-xl border border-gray-200 space-y-3">
                <div class="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-xl">
                    <i class="fa-solid fa-scale-balanced"></i>
                </div>
                <h3 class="text-base font-bold text-gray-900">No Trial Balance Activity Found</h3>
                <p class="text-xs text-gray-500 max-w-sm mx-auto">There are no ledger transactions recorded for the selected filter criteria. Try adjusting the period or branch filters.</p>
                <button onclick="VaultTrialBalance.openFilterModal()" class="btn btn-sm bg-indigo-600 text-white mt-2">Modify Filters</button>
            </div>
        `;
    }

    // ── Detail View: Active Account ────────────────────────────────────────────
    function _showDetailView(item) {
        _activeAccount = item;
        VaultPage?.showDetail?.(true);
        VaultPage?.showDetailPane?.();
        const view = document.getElementById('vaultDetailView');
        if (!view) return;

        const totalDebit = Number(_tbData?.total_debit) || 0;
        const totalCredit = Number(_tbData?.total_credit) || 0;
        const variance = Math.abs(totalDebit - totalCredit);
        const isBalanced = _tbData?.is_balanced !== false && variance <= 0.01;

        const catStyle = CATEGORY_STYLES[item.category] || 'bg-slate-100 text-slate-700 border-slate-200';
        const typeStyle = TYPE_COLORS[item.account_type] || 'bg-slate-100 text-slate-700 border-slate-200';
        const formattedType = (item.account_type || item.category).replace(/_/g, ' ');

        const isDr = item.is_debit;
        const netAbs = Math.abs(item.net_balance);
        const normalIsDr = item.normal_balance === 'DEBIT';

        // Percentage of total activity
        const totalActivity = (totalDebit + totalCredit) || 1;
        const itemActivity = (item.total_debit + item.total_credit);
        const activityPct = ((itemActivity / totalActivity) * 100).toFixed(1);

        // Compute Category Summaries for Equation Audit
        const catMap = {
            'ASSET': { name: 'Assets (1000s)', dr: 0, cr: 0, count: 0 },
            'LIABILITY': { name: 'Liabilities (2000s)', dr: 0, cr: 0, count: 0 },
            'EQUITY': { name: 'Equity & Reserves (6000s)', dr: 0, cr: 0, count: 0 },
            'REVENUE': { name: 'Revenue (3000s/4000s)', dr: 0, cr: 0, count: 0 },
            'EXPENSE': { name: 'Expenses (5000s)', dr: 0, cr: 0, count: 0 }
        };

        _accountList.forEach(a => {
            const cat = a.category;
            if (catMap[cat]) {
                catMap[cat].dr += a.total_debit;
                catMap[cat].cr += a.total_credit;
                catMap[cat].count += 1;
            }
        });

        // Period display
        const periodDisplay = (_filterStartDate || _filterEndDate) 
            ? `${_filterStartDate || 'Beginning'} → ${_filterEndDate || 'Current Date'}`
            : 'All Historical Ledger Postings (Live)';
        const branchDisplay = _filterBranch && _filterBranch !== 'ALL' ? `Branch: ${_filterBranch}` : 'Company Consolidated (All Branches)';

        view.innerHTML = `
            <div class="space-y-5">

                <!-- 1. Master Equilibrium Verification Banner -->
                <div class="p-4 rounded-xl border ${isBalanced ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-rose-50 border-rose-300 text-rose-950'} shadow-xs">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl ${isBalanced ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'} flex items-center justify-center text-lg font-bold shadow-sm flex-shrink-0">
                                <i class="fa-solid ${isBalanced ? 'fa-scale-balanced' : 'fa-triangle-exclamation'}"></i>
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h3 class="text-sm font-black uppercase tracking-wider">
                                        ${isBalanced ? 'Double-Entry Equilibrium: In Balance' : 'Variance Detected (Out of Balance)'}
                                    </h3>
                                    <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full ${isBalanced ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'}">
                                        ${isBalanced ? '✓ Zero Variance' : `Diff: ${_fmtMoney(variance)}`}
                                    </span>
                                </div>
                                <p class="text-xs ${isBalanced ? 'text-emerald-800' : 'text-rose-800'} mt-0.5">
                                    ${isBalanced 
                                        ? 'Debits and Credits are verified in mathematical balance (GAAP &amp; Indian AS compliant).' 
                                        : 'Alert: Total Debits and Total Credits do not match. Review posted journal vouchers.'}
                                </p>
                            </div>
                        </div>

                        <!-- Scope pill & Print button -->
                        <div class="flex items-center gap-2 self-end sm:self-center">
                            <button onclick="VaultTrialBalance.exportReport()" class="btn btn-xs bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-2xs font-semibold flex items-center gap-1.5" title="Print Trial Balance">
                                <i class="fa-solid fa-print text-gray-500"></i> Print / Export
                            </button>
                        </div>
                    </div>

                    <!-- Equilibrium Totals Grid -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 pt-3 border-t ${isBalanced ? 'border-emerald-200' : 'border-rose-200'} text-xs">
                        <div>
                            <span class="block text-[10px] font-bold uppercase tracking-wider text-gray-600">Total Debit (Σ Dr)</span>
                            <span class="text-base font-mono font-black text-blue-700">${_fmtMoney(totalDebit)}</span>
                        </div>
                        <div>
                            <span class="block text-[10px] font-bold uppercase tracking-wider text-gray-600">Total Credit (Σ Cr)</span>
                            <span class="text-base font-mono font-black text-emerald-700">${_fmtMoney(totalCredit)}</span>
                        </div>
                        <div>
                            <span class="block text-[10px] font-bold uppercase tracking-wider text-gray-600">Net Variance</span>
                            <span class="text-base font-mono font-black ${variance <= 0.01 ? 'text-emerald-700' : 'text-rose-700'}">${_fmtMoney(variance)}</span>
                        </div>
                        <div>
                            <span class="block text-[10px] font-bold uppercase tracking-wider text-gray-600">Active Accounts</span>
                            <span class="text-base font-mono font-black text-gray-800">${_accountList.length} Accounts</span>
                        </div>
                    </div>

                    <!-- Scope Info -->
                    <div class="flex flex-wrap items-center justify-between text-[11px] text-gray-600 mt-2.5 pt-2 border-t ${isBalanced ? 'border-emerald-200/60' : 'border-rose-200/60'}">
                        <span><strong class="font-semibold text-gray-700">Scope:</strong> ${branchDisplay}</span>
                        <span><strong class="font-semibold text-gray-700">Period:</strong> ${periodDisplay}</span>
                    </div>
                </div>

                <!-- 2. Selected Account Detail Card (High Contrast White Theme) -->
                <div class="detail-card bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
                    <!-- Header -->
                    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-gray-100 pb-4">
                        <div>
                            <div class="flex flex-wrap items-center gap-2 mb-1.5">
                                <span class="px-2 py-0.5 text-[11px] font-mono font-black rounded bg-slate-900 text-white">#${_escapeHtml(item.account_code || '—')}</span>
                                <span class="px-2 py-0.5 text-[11px] font-bold uppercase rounded border ${catStyle}">${_escapeHtml(item.category)}</span>
                                <span class="px-2 py-0.5 text-[11px] font-semibold uppercase rounded border ${typeStyle}">${_escapeHtml(formattedType)}</span>
                            </div>
                            <h2 class="text-lg font-black text-gray-900 leading-snug">${_escapeHtml(item.account_name)}</h2>
                            <p class="text-xs text-gray-500 mt-0.5">Real-time ledger summary position derived from double-entry vouchers</p>
                        </div>

                        <!-- Big Live Closing Balance with 100% visible solid badge -->
                        <div class="text-left sm:text-right bg-slate-50 border border-slate-200 rounded-xl p-3 flex-shrink-0 min-w-[200px]">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Live Closing Balance</span>
                            <div class="flex items-baseline justify-start sm:justify-end gap-2 mt-0.5">
                                <span class="text-2xl font-mono font-black text-gray-900">${_fmtMoney(netAbs)}</span>
                                <span class="px-2.5 py-0.5 text-xs font-black uppercase rounded shadow-xs ${isDr ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}">
                                    ${isDr ? 'Dr' : 'Cr'}
                                </span>
                            </div>
                            <span class="text-[10px] text-gray-500 block mt-1">
                                Normal Balance: <strong class="font-semibold text-gray-700">${item.normal_balance}</strong>
                            </span>
                        </div>
                    </div>

                    <!-- 4 Account Metric Cards -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div class="p-3 bg-blue-50/50 rounded-xl border border-blue-200/70">
                            <span class="block text-[10px] font-extrabold uppercase text-blue-900">Total Debit (Dr)</span>
                            <span class="text-base font-mono font-black text-blue-700 mt-0.5 block">${_fmtMoney(item.total_debit)}</span>
                            <span class="text-[10px] text-blue-600 mt-0.5 block">Debit postings volume</span>
                        </div>

                        <div class="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200/70">
                            <span class="block text-[10px] font-extrabold uppercase text-emerald-900">Total Credit (Cr)</span>
                            <span class="text-base font-mono font-black text-emerald-700 mt-0.5 block">${_fmtMoney(item.total_credit)}</span>
                            <span class="text-[10px] text-emerald-600 mt-0.5 block">Credit postings volume</span>
                        </div>

                        <div class="p-3 bg-gray-50 rounded-xl border border-gray-200">
                            <span class="block text-[10px] font-bold uppercase text-gray-600">Net Position</span>
                            <div class="flex items-center gap-1.5 mt-0.5">
                                <span class="text-base font-mono font-black text-gray-900">${_fmtMoney(netAbs)}</span>
                                <span class="px-1.5 py-0.2 rounded text-[10px] font-bold ${isDr ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}">
                                    ${isDr ? 'Debit' : 'Credit'}
                                </span>
                            </div>
                            <span class="text-[10px] text-gray-500 mt-0.5 block">${normalIsDr === isDr ? 'Consistent with normal balance' : 'Contra-normal balance'}</span>
                        </div>

                        <div class="p-3 bg-gray-50 rounded-xl border border-gray-200">
                            <span class="block text-[10px] font-bold uppercase text-gray-600">Ledger Share</span>
                            <span class="text-base font-mono font-black text-indigo-700 mt-0.5 block">${activityPct}%</span>
                            <span class="text-[10px] text-gray-500 mt-0.5 block">Of total debit/credit turnover</span>
                        </div>
                    </div>

                    <!-- Quick Navigation & Audit Action -->
                    <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div class="text-xs text-gray-500">
                            <span>Double-entry ledger account verified under Indian AS &amp; GAAP rules.</span>
                        </div>
                        <button onclick="VaultTrialBalance.viewInCoa('${_escapeHtml(item.account_code)}')" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700 font-semibold shadow-xs flex items-center gap-2">
                            <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                            View Ledger Statement in Chart of Accounts
                        </button>
                    </div>
                </div>

                <!-- 3. Master Accounting Equation & Category Summary -->
                <div class="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-3">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                <i class="fa-solid fa-calculator"></i>
                            </div>
                            <h3 class="text-xs font-bold uppercase tracking-wider text-gray-900">
                                Master Accounting Equation Verification
                            </h3>
                        </div>
                        <span class="text-[11px] font-mono text-gray-500">Assets + Expenses == Liabilities + Equity + Revenue</span>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr class="border-b border-gray-200 bg-gray-50/80 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                                    <th class="py-2.5 px-3">Account Group</th>
                                    <th class="py-2.5 px-2 text-center">Accounts</th>
                                    <th class="py-2.5 px-3 text-right">Debit Volume (Dr)</th>
                                    <th class="py-2.5 px-3 text-right">Credit Volume (Cr)</th>
                                    <th class="py-2.5 px-3 text-right">Net Category Balance</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 text-gray-700 font-medium">
                                ${Object.entries(catMap).map(([key, data]) => {
                                    const net = Math.abs(data.dr - data.cr);
                                    const netSide = (key === 'ASSET' || key === 'EXPENSE')
                                        ? (data.dr >= data.cr ? 'Dr' : 'Cr')
                                        : (data.cr >= data.dr ? 'Cr' : 'Dr');
                                    const isDebitSide = netSide === 'Dr';
                                    const style = CATEGORY_STYLES[key] || '';

                                    return `
                                        <tr class="hover:bg-gray-50/50 transition">
                                            <td class="py-2.5 px-3">
                                                <div class="flex items-center gap-2">
                                                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${style}">${key}</span>
                                                    <span class="font-bold text-gray-900">${data.name}</span>
                                                </div>
                                            </td>
                                            <td class="py-2.5 px-2 text-center font-mono text-gray-600">${data.count}</td>
                                            <td class="py-2.5 px-3 text-right font-mono font-bold text-blue-700">${_fmtMoney(data.dr)}</td>
                                            <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">${_fmtMoney(data.cr)}</td>
                                            <td class="py-2.5 px-3 text-right">
                                                <div class="flex items-center justify-end gap-1.5">
                                                    <span class="font-mono font-bold text-gray-900">${_fmtMoney(net)}</span>
                                                    <span class="px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${isDebitSide ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}">${netSide}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                            <tfoot>
                                <tr class="border-t-2 border-gray-300 bg-gray-50 font-bold text-xs">
                                    <td class="py-3 px-3 text-gray-900 font-black">TOTAL EQUILIBRIUM</td>
                                    <td class="py-3 px-2 text-center font-mono text-gray-800">${_accountList.length}</td>
                                    <td class="py-3 px-3 text-right font-mono font-black text-blue-700 text-sm">${_fmtMoney(totalDebit)}</td>
                                    <td class="py-3 px-3 text-right font-mono font-black text-emerald-700 text-sm">${_fmtMoney(totalCredit)}</td>
                                    <td class="py-3 px-3 text-right">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase ${variance <= 0.01 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'}">
                                            ${variance <= 0.01 ? 'BALANCED' : `DIFF: ${_fmtMoney(variance)}`}
                                        </span>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

            </div>
        `;
    }

    // ── Navigate to Chart of Accounts (COA) ────────────────────────────────────
    function viewInCoa(accountCode) {
        if (!accountCode) return;
        window._coaPreselectCode = accountCode;
        const coaTile = document.querySelector('.tile[data-tile="chart-of-accounts"]');
        if (coaTile) {
            coaTile.click();
        } else if (typeof VaultPage !== 'undefined' && VaultPage.openTile) {
            VaultPage.openTile('chart-of-accounts');
        }
    }

    // ── Print / Export Trial Balance ───────────────────────────────────────────
    function exportReport() {
        if (!_accountList || _accountList.length === 0) {
            alert('No accounts to export.');
            return;
        }

        const totalDebit = Number(_tbData?.total_debit) || 0;
        const totalCredit = Number(_tbData?.total_credit) || 0;
        const variance = Math.abs(totalDebit - totalCredit);
        const periodDisplay = (_filterStartDate || _filterEndDate) 
            ? `${_filterStartDate || 'Beginning'} to ${_filterEndDate || 'Current Date'}`
            : 'All Historical Ledger Postings';
        const branchDisplay = _filterBranch && _filterBranch !== 'ALL' ? `Branch: ${_filterBranch}` : 'All Branches (Consolidated)';

        const printWin = window.open('', '_blank', 'width=900,height=700');
        if (!printWin) {
            alert('Please allow popups to print the Trial Balance.');
            return;
        }

        const rowsHtml = _accountList.map(item => {
            const netAbs = Math.abs(item.net_balance);
            const isDr = item.is_debit;
            return `
                <tr>
                    <td style="font-family: monospace; font-weight: bold; border-bottom: 1px solid #e5e7eb; padding: 6px 8px;">#${_escapeHtml(item.account_code)}</td>
                    <td style="border-bottom: 1px solid #e5e7eb; padding: 6px 8px; font-weight: 600;">${_escapeHtml(item.account_name)}</td>
                    <td style="border-bottom: 1px solid #e5e7eb; padding: 6px 8px; font-size: 11px; text-transform: uppercase;">${_escapeHtml(item.category)}</td>
                    <td style="border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: right; font-family: monospace;">${item.total_debit > 0 ? _fmtMoney(item.total_debit) : '—'}</td>
                    <td style="border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: right; font-family: monospace;">${item.total_credit > 0 ? _fmtMoney(item.total_credit) : '—'}</td>
                    <td style="border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: right; font-family: monospace; font-weight: bold;">
                        ${_fmtMoney(netAbs)} ${isDr ? 'Dr' : 'Cr'}
                    </td>
                </tr>
            `;
        }).join('');

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Trial Balance — Post4Ex</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #111827; margin: 30px; }
                    h1 { font-size: 20px; margin: 0 0 4px 0; }
                    .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th { text-align: left; background: #f3f4f6; padding: 8px; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #d1d5db; }
                    th.text-right { text-align: right; }
                    tfoot tr { font-weight: bold; background: #f9fafb; border-top: 2px solid #111827; }
                    tfoot td { padding: 10px 8px; }
                    .status { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; margin-top: 10px; background: #d1fae5; color: #065f46; }
                </style>
            </head>
            <body>
                <h1>Post4Ex Logistics — Master Trial Balance</h1>
                <div class="meta">
                    <strong>Scope:</strong> ${branchDisplay} | 
                    <strong>Period:</strong> ${periodDisplay} | 
                    <strong>Generated:</strong> ${new Date().toLocaleString('en-IN')}
                </div>
                <div class="status">
                    ${variance <= 0.01 ? '✓ IN EQUILIBRIUM: Σ Debit == Σ Credit (0.00 Variance)' : '⚠ OUT OF BALANCE: Variance of ' + _fmtMoney(variance)}
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 70px;">Code</th>
                            <th>Account Title</th>
                            <th style="width: 100px;">Category</th>
                            <th class="text-right" style="width: 120px;">Debit (Dr)</th>
                            <th class="text-right" style="width: 120px;">Credit (Cr)</th>
                            <th class="text-right" style="width: 130px;">Closing Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="3">TOTALS (${_accountList.length} ACCOUNTS)</td>
                            <td style="text-align: right; font-family: monospace;">${_fmtMoney(totalDebit)}</td>
                            <td style="text-align: right; font-family: monospace;">${_fmtMoney(totalCredit)}</td>
                            <td style="text-align: right; font-family: monospace;">${variance <= 0.01 ? 'BALANCED' : 'DIFF: ' + _fmtMoney(variance)}</td>
                        </tr>
                    </tfoot>
                </table>
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `);
        printWin.document.close();
    }

    function search() {
        _renderList();
    }

    return {
        load,
        search,
        openFilterModal,
        closeFilterModal,
        viewInCoa,
        exportReport
    };
})();

window.VaultTrialBalance = VaultTrialBalance;
