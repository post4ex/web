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
        'gstr1':             'ACCOUNTANT',
        'gstr3b':            'ACCOUNTANT',
        'gstr2b':            'ACCOUNTANT',
        'tds':               'ACCOUNTANT',
        'tcs':               'ACCOUNTANT',
        'tds-certs':         'ACCOUNTANT',
        'gst-filing':        'ACCOUNTANT',
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
        'gstr1':             'GSTR-1',
        'gstr3b':            'GSTR-3B',
        'gstr2b':            'GSTR-2B Recon',
        'tds':               'TDS',
        'tcs':               'TCS',
        'tds-certs':         'TDS Certificates',
        'gst-filing':        'GST Filing',
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

        // Show + Add button for roles that can record (not for billing — has its own UnBilled toggle)
        const canRecord = _can(VAULT_PERMISSIONS.C) && name !== 'billing';
        document.getElementById('vaultAddBtn').classList.toggle('hidden', !canRecord);

        if (name === 'billing') {
            document.getElementById('vaultListMsg').textContent = '';
            await VaultBilling.load();
        } else {
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

    return { showDetail: _showDetail, showDetailPane: _showDetailPane, can: _can, activeTile: () => _activeTile };
})();

window.VaultPage = VaultPage;
