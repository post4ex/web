// ============================================================================
// VAULT.JS — Tiles first, click → split view (mirrors admin.js pattern)
// ============================================================================

const VaultPage = (() => {

    let _activeTile = null;
    let _tilesScrollTop = 0;
    const _isMobile = () => window.innerWidth < 768;

    // ── Role helpers ──────────────────────────────────────────────────────────
    function _userLevel() { return ROLE_LEVELS[getUser().ROLE] || 0; }
    function _can(role)   { return _userLevel() >= (ROLE_LEVELS[role] || 0); }

    // Minimum role to see each tile
    const TILE_MIN_ROLE = {
        'sales-invoices':    'MANAGER',
        'credit-notes':      'MANAGER',
        'customers':         'CLIENT',
        'service-items':     'MANAGER',
        'product-items':     'MANAGER',
        'billing':           'CLIENT',
        'purchase-bills':    'MANAGER',
        'debit-notes':       'MANAGER',
        'suppliers':         'CLIENT',
        'inventory':         'MANAGER',
        'stock-transfers':   'MANAGER',
        'receipts':          'MANAGER',
        'payments':          'MANAGER',
        'cheques':           'ACCOUNTANT',
        'bank-accounts':     'ACCOUNTANT',
        'wallet':            'CLIENT',
        'employees':         'MANAGER',
        'payroll':           'MANAGER',
        'expense-claims':    'MANAGER',
        'petty-cash':        'MANAGER',
        'staff-advances':    'MANAGER',
        'branch-advances':   'MANAGER',
        'chart-of-accounts': 'CLIENT',
        'journal-entries':   'MANAGER',
        'recurring':         'ACCOUNTANT',
        'opening-balances':  'ACCOUNTANT',
        'pending-approvals': 'ACCOUNTANT',
        'taxes':             'MANAGER',
        'summary':           'MANAGER',
        'close-fy':          'ACCOUNTANT',
        'bank-recon':        'ACCOUNTANT',
        'bulk-import':       'ACCOUNTANT',
    };

    const TILE_LABELS = {
        'sales-invoices':    'Sales Invoices',
        'credit-notes':      'Credit Notes',
        'customers':         'Customers',
        'service-items':     'Service Items',
        'product-items':     'Product Items',
        'billing':           'Billing',
        'purchase-bills':    'Purchase Bills',
        'debit-notes':       'Debit Notes',
        'suppliers':         'Suppliers',
        'inventory':         'Inventory',
        'stock-transfers':   'Stock Transfers',
        'receipts':          'Receipts',
        'payments':          'Payments',
        'cheques':           'Cheques & PDC',
        'bank-accounts':     'Bank Accounts',
        'wallet':            'Wallet',
        'employees':         'Employees',
        'payroll':           'Payroll',
        'expense-claims':    'Expense Claims',
        'petty-cash':        'Petty Cash',
        'staff-advances':    'Staff Advances',
        'branch-advances':   'Branch Advances',
        'chart-of-accounts': 'Chart of Accounts',
        'journal-entries':   'Journal Entries',
        'recurring':         'Recurring Entries',
        'opening-balances':  'Opening Balances',
        'pending-approvals': 'Pending Approvals',
        'taxes':             'Taxes',
        'summary':           'Summary',
        'close-fy':          'Close FY',
        'bank-recon':        'Bank Recon',
        'bulk-import':       'Bulk Import',
    };

    // ── View switching ────────────────────────────────────────────────────────
    function _showTiles() {
        const tilesView = document.getElementById('tilesView');
        if (tilesView) {
            tilesView.style.display = 'flex';
            setTimeout(() => {
                tilesView.scrollTop = _tilesScrollTop;
            }, 0);
        }
        document.getElementById('splitView').style.display = 'none';
        document.getElementById('vaultDetailPane').style.display = 'none';
        document.getElementById('vaultListPane').style.display = 'flex';
        
        // Show the branch selector bar when exploring tiles for roles above MANAGER
        const user = getUser();
        const isAboveManager = user && ROLE_LEVELS[user.ROLE] > ROLE_LEVELS['MANAGER'];
        if (isAboveManager) {
            const bar = document.getElementById('vaultBranchSelectorBar');
            if (bar) bar.classList.remove('hidden');
        }
        
        _activeTile = null;
    }

    function _showSplit(title) {
        const tilesView = document.getElementById('tilesView');
        if (tilesView) {
            _tilesScrollTop = tilesView.scrollTop;
            tilesView.style.display = 'none';
        }
        document.getElementById('splitView').style.display = 'flex';
        document.getElementById('splitTitle').textContent = title;
        _showDetail(false);
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultListMsg').textContent = 'Loading…';
        document.getElementById('vaultSearch').value = '';
        document.getElementById('vaultListPane').style.display = 'flex';
        document.getElementById('vaultDetailPane').style.display = _isMobile() ? 'none' : 'block';
        
        // Hide the branch selector bar when inside a tile/split view
        const bar = document.getElementById('vaultBranchSelectorBar');
        if (bar) bar.classList.add('hidden');
        
        // Clean up module-specific UI items from shared list header
        const idsToRemove = [
            'vbUnbilledBtn', 'vbFilterBtn',
            'siFilterBtn', 'siStatus',
            'quotFilterBtn', 'quotStatus',
            'cnFilterBtn', 'cnStatus',
            'dnFilterBtn', 'dnStatus',
            'pbFilterBtn', 'pbStatus',
            'rptFilterBtn', 'rptStatus',
            'chqFilterBtn', 'chqStatus',
            'invFilterBtn',
            'custListStatus', 'suppListStatus'
        ];
        idsToRemove.forEach(id => document.getElementById(id)?.remove());
    }

    function _showListPane() {
        document.getElementById('vaultListPane').style.display = 'flex';
        document.getElementById('vaultDetailPane').style.display = 'none';
    }

    function _showDetailPane() {
        if (_isMobile()) {
            document.getElementById('vaultListPane').style.display = 'none';
            document.getElementById('vaultDetailPane').style.display = 'block';
        } else {
            document.getElementById('vaultListPane').style.display = 'flex';
            document.getElementById('vaultDetailPane').style.display = 'block';
        }
    }

    function _showDetail(show) {
        document.getElementById('vaultDetailEmpty').classList.toggle('hidden', show);
        document.getElementById('vaultDetailView').classList.toggle('hidden', !show);
    }

    function getActiveBranch() {
        const user = getUser();
        if (!user || !user.ROLE) return '';
        const isAboveManager = ROLE_LEVELS[user.ROLE] > ROLE_LEVELS['MANAGER'];
        if (isAboveManager) {
            const selectEl = document.getElementById('vaultBranchSelect');
            return selectEl ? selectEl.value : '';
        } else {
            return user.BRANCH || '';
        }
    }

    // ── Hide tiles by role ────────────────────────────────────────────────────
    function _hideTilesByRole() {
        document.querySelectorAll('[data-tile]').forEach(tile => {
            const minRole = TILE_MIN_ROLE[tile.dataset.tile];
            if (minRole && !_can(minRole)) tile.classList.add('hidden');
        });
    }

    // ── Tile activation ───────────────────────────────────────────────────────
    async function _activateTile(name) {
        const minRole = TILE_MIN_ROLE[name];
        if (minRole && !_can(minRole)) return;

        const branch = getActiveBranch();
        const user = getUser();
        const isAboveManager = user && ROLE_LEVELS[user.ROLE] > ROLE_LEVELS['MANAGER'];

        if (isAboveManager && !branch) {
            _activeTile = name;
            _showSplit(TILE_LABELS[name] || name);
            document.getElementById('vaultListMsg').textContent = 'Please select a branch to view data.';
            document.getElementById('vaultList').innerHTML = '';
            document.getElementById('vaultAddBtn').classList.add('hidden');
            return;
        }

        _activeTile = name;
        _showSplit(TILE_LABELS[name] || name);

        // Determine which tile group this belongs to
        const receiptsTiles   = ['receipts', 'payments'];
        const journalTiles    = ['journal-entries', 'opening-balances'];
        const purchasesTiles  = ['purchase-bills', 'suppliers'];
        const expenseTiles    = ['expense-claims', 'petty-cash', 'staff-advances', 'branch-advances'];
        const summaryTiles    = ['summary', 'reports', 'bank-recon', 'bulk-import'];
        const directViewTiles = [];  // No tiles bypass list pane anymore

        // Show + Add button for roles that can record (not for billing or read-only tiles)
        const canRecord = _can(VAULT_PERMISSIONS.C) && name !== 'billing' && !directViewTiles.includes(name);
        document.getElementById('vaultAddBtn').classList.toggle('hidden', !canRecord);

        // Show + wire the Report button for eligible tiles
        const reportEligibleTiles = [
            'sales-invoices', 'credit-notes', 'debit-notes', 'purchase-bills',
            'receipts', 'payments', 'cheques', 'bank-accounts',
            'customers', 'suppliers', 'employees', 'payroll',
            'expense-claims', 'petty-cash', 'staff-advances', 'branch-advances',
            'journal-entries', 'taxes'
        ];
        const hasReport = reportEligibleTiles.includes(name);
        const reportBtn = document.getElementById('vaultReportBtn');
        if (reportBtn) {
            reportBtn.classList.toggle('hidden', !hasReport);
            reportBtn.onclick = () => _openReportModal(name);
        }

        // Wire the Add button for each module
        document.getElementById('vaultAddBtn').onclick = null;

        // ── Route to appropriate module ──
        document.getElementById('vaultListMsg').textContent = '';

        if (name === 'billing') {
            await VaultBilling.load();
        }
        else if (receiptsTiles.includes(name)) {
            const isPayments = name === 'payments';
            VaultReceipts.setMode(isPayments ? 'payments' : 'receipts');
            document.getElementById('vaultAddBtn').onclick = () => VaultReceipts.openAddPane();
            await VaultReceipts.load();
        }
        else if (journalTiles.includes(name)) {
            const jtMap = { 'journal-entries': 'JOURNAL', 'credit-notes': 'CREDIT_NOTE', 'debit-notes': 'DEBIT_NOTE', 'opening-balances': 'OPENING_BALANCE' };
            VaultJournal.setType(jtMap[name] || 'JOURNAL');
            document.getElementById('vaultAddBtn').onclick = () => VaultJournal.openAddPane();
            await VaultJournal.load();
        }
        else if (name === 'taxes') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultTaxes.load();
        }
        else if (name === 'suppliers') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultSuppliers.load();
        }
        else if (purchasesTiles.includes(name)) {
            document.getElementById('vaultAddBtn').onclick = () => VaultPurchases.openAddPane();
            await VaultPurchases.load();
        }
        else if (expenseTiles.includes(name)) {
            VaultExpenses.setType(name);
            document.getElementById('vaultAddBtn').onclick = () => VaultExpenses.openAddPane();
            document.getElementById('vaultAddBtn').classList.toggle('hidden', name !== 'expense-claims');
            await VaultExpenses.load();
        }
        else if (name === 'wallet') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultExpenses.showWallet();
        }
        else if (name === 'pending-approvals') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultPendingApprovals.load();
        }
        else if (name === 'sales-invoices') {
            document.getElementById('vaultAddBtn').onclick = () => VaultSalesInvoices.openAddPane();
            await VaultSalesInvoices.load();
        }
        else if (name === 'credit-notes') {
            document.getElementById('vaultAddBtn').onclick = () => VaultCreditNotes.openAddPane();
            await VaultCreditNotes.load();
        }
        else if (name === 'debit-notes') {
            document.getElementById('vaultAddBtn').onclick = () => VaultDebitNotes.openAddPane();
            await VaultDebitNotes.load();
        }
        else if (name === 'customers') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultCustomers.load();
        }

        else if (name === 'service-items') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultServiceItems.load();
        }
        else if (name === 'product-items') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultProductItems.load();
        }
        else if (name === 'inventory') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultInventory.load();
        }
        else if (name === 'chart-of-accounts') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultCOA.load();
        }
        else if (name === 'cheques') {
            VaultAccounts.setTile('cheques');
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultAccounts.load();
        }
        else if (name === 'bank-accounts') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            VaultAccounts.setTile('bank-accounts');
            await VaultAccounts.load();
        }
        else if (name === 'employees') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            VaultPayroll.setTile('employees');
            await VaultPayroll.load();
        }
        else if (name === 'payroll') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            VaultPayroll.setTile('payroll');
            await VaultPayroll.load();
        }
        else if (name === 'recurring') {
            VaultJournal._loadRecurring();
            document.getElementById('vaultAddBtn').onclick = () => VaultJournal._openRecurringForm();
        }
        else if (name === 'close-fy') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultCloseFY.load();
        }
        else if (summaryTiles.includes(name)) {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            if (name === 'summary') {
                VaultSummary.setView('summary');
                await VaultSummary.load();

            } else if (name === 'bank-recon') {
                VaultSummary._showBankRecon();
            } else if (name === 'bulk-import') {
                VaultSummary.showBulkImport();
            }
        }
        else {
            document.getElementById('vaultListMsg').textContent = 'Coming soon.';
        }
    }

    function _updateBranchStatus(branch) {
        const statusEl = document.getElementById('vaultBranchStatus');
        if (!statusEl) return;
        if (branch) {
            statusEl.innerHTML = `
                <div class="flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold rounded-full shadow-sm cursor-pointer hover:bg-green-100 transition-colors" onclick="window.uncollapseBranches?.()">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" style="animation-duration: 2s;"></span>
                    <i class="fa-solid fa-circle-check text-[10px]"></i>
                    <span>Branch ${branch} active <span class="text-[9px] text-gray-400 font-normal ml-1 hover:underline">(Change)</span></span>
                </div>
            `;
        } else {
            statusEl.innerHTML = `
                <div class="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-full shadow-sm">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <i class="fa-solid fa-circle-exclamation text-[10px]"></i>
                    <span>Select branch</span>
                </div>
            `;
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function _init() {
        _hideTilesByRole();

        document.querySelectorAll('[data-tile]').forEach(tile =>
            tile.addEventListener('click', () => _activateTile(tile.dataset.tile))
        );

        document.getElementById('backToTilesBtn').addEventListener('click', _showTiles);
        document.getElementById('backToListBtn')?.addEventListener('click', () => {
            if (_isMobile()) _showListPane();
        });

        // Initialize branch selector for roles above MANAGER
        const user = getUser();
        const isAboveManager = user && ROLE_LEVELS[user.ROLE] > ROLE_LEVELS['MANAGER'];
        if (isAboveManager) {
            const select = document.getElementById('vaultBranchSelect');
            const tilesSection = document.getElementById('vaultBranchTilesSection');
            const tilesGrid = document.getElementById('vaultBranchTilesGrid');

            window.uncollapseBranches = () => {
                if (tilesSection) tilesSection.classList.remove('hidden');
            };

            if (select && tilesSection && tilesGrid) {
                // Initialize active selection as empty on fresh load
                select.value = '';
                _updateBranchStatus('');

                const renderBranches = () => {
                    getAppData('BRANCHES').then(raw => {
                        const branches = Object.values(raw || {});
                        if (branches.length === 0) return; // Wait for sync

                        const currentVal = select.value;

                        // Native select sync
                        select.innerHTML = '<option value="">— Select Branch —</option>' +
                            branches.map(b => `<option value="${b.BRANCH_CODE}">${b.BRANCH_CODE} - ${b.BRANCH_NAME || ''}</option>`).join('');

                        if (currentVal && branches.some(b => b.BRANCH_CODE === currentVal)) {
                            select.value = currentVal;
                        } else {
                            select.value = '';
                        }

                        // Render branch selection tiles
                        tilesGrid.innerHTML = branches.map(b => `
                            <div class="tile select-branch-tile" data-branch="${b.BRANCH_CODE}" style="border-color:#dbeafe; padding: 1.25rem 1rem;">
                                <div class="tile-icon">🏢</div>
                                <div class="tile-label">${b.BRANCH_CODE}</div>
                                <div class="text-[12px] font-bold text-gray-800 mt-1 truncate" style="max-width: 100%;">${b.BRANCH_NAME || ''}</div>
                                <div class="text-[9px] text-gray-400 font-mono mt-0.5">GSTIN: ${b.BRANCH_GSTIN || 'N/A'}</div>
                            </div>
                        `).join('');

                        // Add click listeners to tiles
                        tilesGrid.querySelectorAll('.select-branch-tile').forEach(tile => {
                            tile.addEventListener('click', () => {
                                const val = tile.dataset.branch;
                                select.value = val;
                                select.dispatchEvent(new Event('change'));
                            });
                        });

                        // Show branch section if no active selection
                        if (!select.value) {
                            tilesSection.classList.remove('hidden');
                        }
                    });
                };

                // Render immediately with cached entries
                renderBranches();

                // Re-render when new data arrives/sync finishes
                window.addEventListener('appDataLoaded', renderBranches);
                window.addEventListener('appDataRefreshed', renderBranches);

                select.addEventListener('change', () => {
                    const branch = select.value;
                    localStorage.setItem('vault_selected_branch', branch);
                    _updateBranchStatus(branch);

                    // Collapse branch tiles section once a branch is active
                    if (branch) {
                        tilesSection.classList.add('hidden');
                    } else {
                        tilesSection.classList.remove('hidden');
                    }

                    // Start caching (pre-fetching keys) on branch selection
                    if (branch) {
                        callApi('/api/manager/cache/keys', {}, 'GET')
                            .then(keys => {
                                window.__vaultCacheKeys = keys;
                                console.log('[Vault] Cache keys pre-fetched on branch selection:', branch);
                            })
                            .catch(err => {
                                console.error('[Vault] Failed to pre-fetch cache keys on branch selection:', err);
                            });
                    }

                    const activeTile = _activeTile;
                    if (activeTile) {
                        _activateTile(activeTile);
                    }
                });
            }
        }
    }

    function _ensureReportModal() {
        if (document.getElementById('reportPeriodModal')) return;
        const modal = document.createElement('div');
        modal.id = 'reportPeriodModal';
        modal.className = 'modal-overlay hidden';
        modal.style.zIndex = '1000'; // Ensure it stays on top
        modal.innerHTML = `
            <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5 w-full mx-4">
                <div class="flex justify-between items-center border-b pb-3">
                    <h2 class="text-base font-bold text-gray-800">📊 Generate Report</h2>
                    <button onclick="document.getElementById('reportPeriodModal').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
                <div class="space-y-3 text-xs">
                    <p id="reportTargetLabel" class="font-medium text-gray-600 bg-gray-50 p-2.5 rounded border"></p>
                    <div>
                        <label class="block font-semibold text-gray-600 mb-1">Select Period</label>
                        <select id="reportPeriodSelect" class="form-input text-xs">
                            <option value="3m">3 Months</option>
                            <option value="6m">6 Months</option>
                            <option value="last_fy">Last FY</option>
                            <option value="custom">Custom Date Range</option>
                        </select>
                    </div>
                    <div id="reportCustomDates" class="grid grid-cols-2 gap-3 text-xs hidden">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Start Date</label>
                            <input type="date" id="reportStartDate" class="form-input text-xs">
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">End Date</label>
                            <input type="date" id="reportEndDate" class="form-input text-xs">
                        </div>
                    </div>
                </div>
                <div class="flex justify-end gap-2 pt-3 border-t">
                    <button onclick="document.getElementById('reportPeriodModal').classList.add('hidden')" class="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button id="reportGenerateConfirmBtn" class="px-4 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Generate</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('reportPeriodSelect').addEventListener('change', (e) => {
            const custom = e.target.value === 'custom';
            document.getElementById('reportCustomDates').classList.toggle('hidden', !custom);
        });
    }

    function _openReportModal(tileName) {
        _ensureReportModal();
        const selectedLi = document.querySelector('#vaultList li.selected');
        const code = selectedLi?.dataset.code || selectedLi?.dataset.key;
        
        let targetLabel = '';
        let targetName = '';
        if (selectedLi) {
            targetName = selectedLi.querySelector('strong')?.textContent || code || '';
            targetLabel = `Generating Report for selected item: <strong>${_escapeHtml(targetName)}</strong>`;
        } else {
            targetLabel = `Generating Report for: <strong>All Items in ${_escapeHtml(TILE_LABELS[tileName] || tileName)}</strong>`;
        }
        
        document.getElementById('reportTargetLabel').innerHTML = targetLabel;
        document.getElementById('reportPeriodSelect').value = '3m';
        document.getElementById('reportCustomDates').classList.add('hidden');
        document.getElementById('reportStartDate').value = '';
        document.getElementById('reportEndDate').value = '';
        
        const modal = document.getElementById('reportPeriodModal');
        modal.classList.remove('hidden');
        
        document.getElementById('reportGenerateConfirmBtn').onclick = async () => {
            modal.classList.add('hidden');
            await _buildReport(tileName, code || '', targetName);
        };
    }

    const _escapeHtml = (str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    function _toDateStr(ms) {
        if (!ms) return '';
        const d = new Date(ms);
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    async function _buildReport(tileName, selectedId, selectedName) {
        window.setLoading?.(true, 'Generating report...', 'detail');
        try {
            const period = document.getElementById('reportPeriodSelect').value;
            let start = '';
            let end = '';
            
            const today = new Date();
            if (period === '3m') {
                const d = new Date(today.getFullYear(), today.getMonth() - 3, 1);
                start = _toDateStr(d);
                end = _toDateStr(today);
            } else if (period === '6m') {
                const d = new Date(today.getFullYear(), today.getMonth() - 6, 1);
                start = _toDateStr(d);
                end = _toDateStr(today);
            } else if (period === 'last_fy') {
                const currentYear = today.getFullYear();
                let fyStartYear = currentYear;
                if (today.getMonth() < 3) fyStartYear = currentYear - 1;
                start = (fyStartYear - 1) + '-04-01';
                end = fyStartYear + '-03-31';
            } else {
                start = document.getElementById('reportStartDate').value;
                end = document.getElementById('reportEndDate').value;
            }
            
            if (!start || !end) {
                alert('Please select valid start and end dates.');
                return;
            }
            
            const headerRaw = await window.appDB.getSheet('HEADER');
            const ledgerRaw = await window.appDB.getSheet('LEDGER');
            
            const headers = Object.values(headerRaw || {});
            const ledger = Object.values(ledgerRaw || {});
            
            const branch = getActiveBranch();
            const branchLower = (branch || '').toLowerCase();
            
            let title = `${TILE_LABELS[tileName] || tileName} Report`;
            let sub = `${start} to ${end}`;
            if (branch) sub += ` · Branch: ${branch.toUpperCase()}`;
            if (selectedName) sub += ` · Filter: ${selectedName}`;
            
            let html = '';
            
            if (tileName === 'sales-invoices' || tileName === 'purchase-bills' || tileName === 'credit-notes' || tileName === 'debit-notes' || tileName === 'expense-claims' || tileName === 'payroll') {
                const typeMap = {
                    'sales-invoices': 'Sales Invoice',
                    'purchase-bills': 'Purchase Invoice',
                    'credit-notes': 'Credit Note',
                    'debit-notes': 'Debit Note',
                    'expense-claims': 'Expense Claim',
                    'payroll': 'Payslip'
                };
                const doxType = typeMap[tileName];
                let list = headers.filter(h => 
                    h.DOX_TYPE === doxType &&
                    (!branchLower || (h.BRANCH || '').toLowerCase() === branchLower) &&
                    _toDateStr(+h.TIME_STAMP) >= start &&
                    _toDateStr(+h.TIME_STAMP) <= end
                );
                
                if (selectedId) {
                    list = list.filter(h => h.DOX_KEY === selectedId);
                }
                
                list.sort((a,b) => (+a.TIME_STAMP || 0) - (+b.TIME_STAMP || 0));
                
                let total = 0;
                const rows = list.map(h => {
                    const amt = +(h.AMOUNT || 0);
                    total += amt;
                    return `<tr>
                        <td class="px-2 py-1">${_toDateStr(+h.TIME_STAMP)}</td>
                        <td class="px-2 py-1 font-mono">${_escapeHtml(h.DOX_REF || '')}</td>
                        <td class="px-2 py-1">${_escapeHtml(h.B2B || '')}</td>
                        <td class="px-2 py-1 max-w-[200px] truncate" title="${_escapeHtml(h.DOX_DESCRIPTION || '')}">${_escapeHtml(h.DOX_DESCRIPTION || '—')}</td>
                        <td class="px-2 py-1 text-right">₹${amt.toFixed(2)}</td>
                    </tr>`;
                }).join('');
                
                html = `
                    <div class="space-y-4 font-sans">
                        <table class="min-w-full text-xs divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Date</th>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Ref</th>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Name</th>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Description</th>
                                    <th class="px-2 py-1 text-right font-medium text-gray-500 uppercase">Amount</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y bg-white">
                                ${rows || '<tr><td colspan="5" class="text-center py-4 text-gray-400">No records found.</td></tr>'}
                            </tbody>
                        </table>
                        <div class="text-right font-semibold text-sm border-t pt-3">
                            Total Amount: <span class="text-indigo-700">₹${total.toFixed(2)}</span>
                        </div>
                    </div>`;
            } 
            else if (tileName === 'receipts' || tileName === 'payments' || tileName === 'cheques') {
                let list = headers.filter(h => 
                    (tileName === 'receipts' ? h.DOX_TYPE === 'Receipt' : tileName === 'payments' ? h.DOX_TYPE === 'Payment' : (h.DOX_TYPE === 'Receipt' || h.DOX_TYPE === 'Payment')) &&
                    (!branchLower || (h.BRANCH || '').toLowerCase() === branchLower) &&
                    _toDateStr(+h.TIME_STAMP) >= start &&
                    _toDateStr(+h.TIME_STAMP) <= end
                );
                
                if (tileName === 'cheques') {
                    list = list.filter(h => h.PAYMENT_MODE === 'cheque');
                }
                
                if (selectedId) {
                    list = list.filter(h => h.DOX_KEY === selectedId);
                }
                
                list.sort((a,b) => (+a.TIME_STAMP || 0) - (+b.TIME_STAMP || 0));
                
                let total = 0;
                const rows = list.map(h => {
                    const amt = +(h.AMOUNT || 0);
                    total += amt;
                    return `<tr>
                        <td class="px-2 py-1">${_toDateStr(+h.TIME_STAMP)}</td>
                        <td class="px-2 py-1 font-mono">${_escapeHtml(h.DOX_REF || '')}</td>
                        <td class="px-2 py-1">${_escapeHtml(h.DOX_TYPE || '')}</td>
                        <td class="px-2 py-1">${_escapeHtml(h.B2B || '')}</td>
                        <td class="px-2 py-1 max-w-[200px] truncate" title="${_escapeHtml(h.DOX_DESCRIPTION || '')}">${_escapeHtml(h.DOX_DESCRIPTION || '—')}</td>
                        <td class="px-2 py-1 text-right">₹${amt.toFixed(2)}</td>
                    </tr>`;
                }).join('');
                
                html = `
                    <div class="space-y-4 font-sans">
                        <table class="min-w-full text-xs divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Date</th>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Ref</th>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Type</th>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Name</th>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Description</th>
                                    <th class="px-2 py-1 text-right font-medium text-gray-500 uppercase">Amount</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y bg-white">
                                ${rows || '<tr><td colspan="6" class="text-center py-4 text-gray-400">No records found.</td></tr>'}
                            </tbody>
                        </table>
                        <div class="text-right font-semibold text-sm border-t pt-3">
                            Total Amount: <span class="text-indigo-700">₹${total.toFixed(2)}</span>
                        </div>
                    </div>`;
            }
            else {
                let list = ledger.filter(e => 
                    (!branchLower || (e.BRANCH || '').toLowerCase() === branchLower) &&
                    _toDateStr(+e.TXN_DATE) >= start &&
                    _toDateStr(+e.TXN_DATE) <= end
                );
                
                if (selectedId) {
                    list = list.filter(e => e.CODE === selectedId || e.STAFF_CODE === selectedId || e.BANK_ACCOUNT_KEY === selectedId);
                }
                
                if (tileName === 'customers') list = list.filter(e => e.ACCOUNT === 'Accounts receivable');
                else if (tileName === 'suppliers') list = list.filter(e => e.ACCOUNT === 'Accounts payable');
                else if (tileName === 'staff-advances') list = list.filter(e => e.ACCOUNT && e.ACCOUNT.toLowerCase().includes('staff advance'));
                else if (tileName === 'petty-cash') list = list.filter(e => e.ACCOUNT && (e.ACCOUNT.toLowerCase().includes('cash in hand') || e.ACCOUNT.toLowerCase().includes('petty cash')));
                else if (tileName === 'branch-advances') list = list.filter(e => e.ACCOUNT && e.ACCOUNT.toLowerCase().includes('branch advance'));
                
                list.sort((a,b) => (+a.TXN_DATE || 0) - (+b.TXN_DATE || 0) || (a.TIME_STAMP || 0) - (b.TIME_STAMP || 0));
                
                let totDebit = 0, totCredit = 0;
                const rows = list.map(e => {
                    const dr = +(e.DEBIT || 0);
                    const cr = +(e.CREDIT || 0);
                    totDebit += dr;
                    totCredit += cr;
                    return `<tr>
                        <td class="px-2 py-1">${_toDateStr(+e.TXN_DATE)}</td>
                        <td class="px-2 py-1 font-mono">${_escapeHtml(e.DOX_REF || '')}</td>
                        <td class="px-2 py-1">${_escapeHtml(e.ACCOUNT || '')}</td>
                        <td class="px-2 py-1 max-w-[200px] truncate" title="${_escapeHtml(e.DESCRIPTION || '')}">${_escapeHtml(e.DESCRIPTION || '—')}</td>
                        <td class="px-2 py-1 text-right text-green-600">${dr > 0 ? '₹' + dr.toFixed(2) : ''}</td>
                        <td class="px-2 py-1 text-right text-red-600">${cr > 0 ? '₹' + cr.toFixed(2) : ''}</td>
                    </tr>`;
                }).join('');
                
                html = `
                    <div class="space-y-4 font-sans">
                        <table class="min-w-full text-xs divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Date</th>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Ref</th>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Account</th>
                                    <th class="px-2 py-1 text-left font-medium text-gray-500 uppercase">Description</th>
                                    <th class="px-2 py-1 text-right font-medium text-gray-500 uppercase">Debit</th>
                                    <th class="px-2 py-1 text-right font-medium text-gray-500 uppercase">Credit</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y bg-white">
                                ${rows || '<tr><td colspan="6" class="text-center py-4 text-gray-400">No records found.</td></tr>'}
                            </tbody>
                        </table>
                        <div class="grid grid-cols-2 gap-3 text-right font-semibold text-sm border-t pt-3">
                            <div>Total Debit: <span class="text-green-700">₹${totDebit.toFixed(2)}</span></div>
                            <div>Total Credit: <span class="text-red-700">₹${totCredit.toFixed(2)}</span></div>
                        </div>
                    </div>`;
            }
            
            _showDetail(true);
            const view = document.getElementById('vaultDetailView');
            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header flex justify-between items-center border-b pb-3 mb-4">
                        <div>
                            <h3 class="font-bold text-gray-800 text-lg">📊 ${_escapeHtml(title)}</h3>
                            <span class="text-xs text-gray-500">${_escapeHtml(sub)}</span>
                        </div>
                        <button onclick="window.print()" class="btn btn-sm btn-primary flex items-center gap-1.5 shadow">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                            </svg>
                            <span>Print</span>
                        </button>
                    </div>
                    <div class="detail-card-body">
                        ${html}
                    </div>
                </div>
            `;
            _showDetailPane();
            
        } catch (err) {
            console.error('[Vault] Failed to build report:', err);
            alert('Failed to generate report: ' + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    document.addEventListener('DOMContentLoaded', _init);

    return { showDetail: _showDetail, showDetailPane: _showDetailPane, can: _can, showTiles: _showTiles, activeTile: () => _activeTile, activateTile: _activateTile, getActiveBranch, openReportModal: _openReportModal };
})();

window.VaultPage = VaultPage;
