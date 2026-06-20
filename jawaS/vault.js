// ============================================================================
// VAULT.JS — Tiles first, click → split view (mirrors admin.js pattern)
// ============================================================================

const VaultPage = (() => {

    let _activeTile = null;
    const _isMobile = () => window.innerWidth < 768;

    // ── Role helpers ──────────────────────────────────────────────────────────
    function _userLevel() { return ROLE_LEVELS[getUser().ROLE] || 0; }
    function _can(role)   { return _userLevel() >= (ROLE_LEVELS[role] || 0); }

    // Minimum role to see each tile
    const TILE_MIN_ROLE = {
        'sales-invoices':    'MANAGER',
        'quotations':        'CLIENT',
        'credit-notes':      'MANAGER',
        'delivery-notes':    'CLIENT',
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
        'gstr1':             'ACCOUNTANT',
        'gstr3b':            'ACCOUNTANT',
        'gstr2b':            'ACCOUNTANT',
        'tds':               'ACCOUNTANT',
        'tcs':               'ACCOUNTANT',
        'tds-certs':         'ACCOUNTANT',
        'gst-filing':        'ACCOUNTANT',
        'purchase-register': 'ACCOUNTANT',
        'summary':           'MANAGER',
        'reports':           'ACCOUNTANT',
        'close-fy':          'ACCOUNTANT',
        'bank-recon':        'ACCOUNTANT',
        'bulk-import':       'ACCOUNTANT',
    };

    const TILE_LABELS = {
        'sales-invoices':    'Sales Invoices',
        'quotations':        'Quotations',
        'credit-notes':      'Credit Notes',
        'delivery-notes':    'Delivery Notes',
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
        'gstr1':             'GSTR-1',
        'gstr3b':            'GSTR-3B',
        'gstr2b':            'GSTR-2B Recon',
        'tds':               'TDS',
        'tcs':               'TCS',
        'tds-certs':         'TDS Certificates',
        'gst-filing':        'GST Filing',
        'purchase-register': 'Purchase Register',
        'summary':           'Summary',
        'reports':           'Reports',
        'close-fy':          'Close FY',
        'bank-recon':        'Bank Recon',
        'bulk-import':       'Bulk Import',
    };

    // ── View switching ────────────────────────────────────────────────────────
    function _showTiles() {
        document.getElementById('tilesView').style.display = 'flex';
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
        document.getElementById('tilesView').style.display = 'none';
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
        
        // Clean up Billing specific UI items from shared list header
        document.getElementById('vbUnbilledBtn')?.remove();
        document.getElementById('vbFilterBtn')?.remove();
        
        // Clean up Sales Invoice specific UI items from shared list header
        document.getElementById('siFilterBtn')?.remove();
        document.getElementById('siStatus')?.remove();
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
        const journalTiles    = ['journal-entries', 'credit-notes', 'opening-balances'];
        const purchasesTiles  = ['purchase-bills', 'suppliers'];
        const expenseTiles    = ['expense-claims', 'petty-cash', 'staff-advances', 'branch-advances'];
        const gstTiles        = ['gstr1', 'gstr3b', 'gst-filing', 'gstr2b', 'tds', 'tcs', 'tds-certs', 'purchase-register'];
        const summaryTiles    = ['summary', 'reports', 'bank-recon', 'bulk-import'];
        const directViewTiles = [];  // No tiles bypass list pane anymore

        // Show + Add button for roles that can record (not for billing or read-only tiles)
        const canRecord = _can(VAULT_PERMISSIONS.C) && name !== 'billing' && !directViewTiles.includes(name);
        document.getElementById('vaultAddBtn').classList.toggle('hidden', !canRecord);

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
        else if (name === 'suppliers') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultSuppliers.load();
        }
        else if (purchasesTiles.includes(name)) {
            document.getElementById('vaultAddBtn').onclick = () => VaultPurchases.openAddPane();
            await VaultPurchases.load();
        }
        else if (expenseTiles.includes(name)) {
            const isCash = name === 'petty-cash';
            VaultExpenses.setType(isCash ? 'cash' : 'expense');
            document.getElementById('vaultAddBtn').onclick = () => VaultExpenses.openAddPane();
            await VaultExpenses.load();
        }
        else if (gstTiles.includes(name)) {
            VaultGst.setTile(name);
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultGst.load();
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
        else if (name === 'quotations') {
            document.getElementById('vaultAddBtn').onclick = () => VaultQuotations.openAddPane();
            await VaultQuotations.load();
        }
        else if (name === 'delivery-notes') {
            document.getElementById('vaultAddBtn').onclick = () => VaultDeliveryNotes.openAddPane();
            await VaultDeliveryNotes.load();
        }
        else if (name === 'service-items') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultServiceItems.load();
        }
        else if (name === 'product-items') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultProductItems.load();
        }
        else if (name === 'chart-of-accounts') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultCOA.load();
        }
        else if (name === 'cheques') {
            VaultAccounts.setTile('cheques');
            document.getElementById('vaultAddBtn').onclick = () => VaultAccounts._openChequeAddPane();
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
            } else if (name === 'reports') {
                VaultSummary.showReports();
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

    document.addEventListener('DOMContentLoaded', _init);

    return { showDetail: _showDetail, showDetailPane: _showDetailPane, can: _can, showTiles: _showTiles, activeTile: () => _activeTile, activateTile: _activateTile, getActiveBranch };
})();

window.VaultPage = VaultPage;
