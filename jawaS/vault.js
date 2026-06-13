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
        'sales-invoices':    'CLIENT',
        'quotations':        'CLIENT',
        'credit-notes':      'CLIENT',
        'delivery-notes':    'CLIENT',
        'customers':         'CLIENT',
        'service-items':     'MANAGER',
        'product-items':     'MANAGER',
        'billing':           'CLIENT',
        'purchase-bills':    'CLIENT',
        'debit-notes':       'CLIENT',
        'suppliers':         'CLIENT',
        'inventory':         'MANAGER',
        'stock-transfers':   'MANAGER',
        'receipts':          'CLIENT',
        'payments':          'CLIENT',
        'cheques':           'CLIENT',
        'bank-accounts':     'ACCOUNTANT',
        'wallet':            'CLIENT',
        'employees':         'CLIENT',
        'payroll':           'MANAGER',
        'expense-claims':    'CLIENT',
        'petty-cash':        'MANAGER',
        'staff-advances':    'MANAGER',
        'branch-advances':   'MANAGER',
        'chart-of-accounts': 'CLIENT',
        'journal-entries':   'CLIENT',
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
        'summary':           'CLIENT',
        'reports':           'CLIENT',
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
        'bank-recon':        'Bank Recon',
        'bulk-import':       'Bulk Import',
    };

    // ── View switching ────────────────────────────────────────────────────────
    function _showTiles() {
        document.getElementById('tilesView').style.display = 'flex';
        document.getElementById('splitView').style.display = 'none';
        document.getElementById('vaultDetailPane').style.display = 'none';
        document.getElementById('vaultListPane').style.display = 'flex';
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
        _activeTile = name;
        _showSplit(TILE_LABELS[name] || name);

        // Determine which tile group this belongs to
        const receiptsTiles   = ['receipts', 'payments'];
        const journalTiles    = ['journal-entries', 'credit-notes', 'debit-notes', 'opening-balances'];
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
            await VaultSummary.showPendingApprovals();
        }
        else if (name === 'sales-invoices') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultSalesInvoices.load();
        }
        else if (name === 'credit-notes') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultCreditNotes.load();
        }
        else if (name === 'customers') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultCustomers.load();
        }
        else if (name === 'quotations') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultQuotations.load();
        }
        else if (name === 'delivery-notes') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            await VaultDeliveryNotes.load();
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
            document.getElementById('vaultAddBtn').classList.add('hidden');
            VaultJournal._loadRecurring();
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
    }

    document.addEventListener('DOMContentLoaded', _init);

    return { showDetail: _showDetail, showDetailPane: _showDetailPane, can: _can, showTiles: _showTiles, activeTile: () => _activeTile, activateTile: _activateTile };
})();

window.VaultPage = VaultPage;
