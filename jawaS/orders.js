// orders.js — Orders page controller (mirrors vault.js / admin.js pattern)

const OrdersPage = (() => {

    let _activeTile = null;
    const _isMobile = () => window.innerWidth < 768;

    function _userLevel() { return ROLE_LEVELS[getUser().ROLE] || 0; }
    function _can(role)   { return _userLevel() >= (ROLE_LEVELS[role] || 0); }

    const TILE_MIN_ROLE = {
        'pickup-request': 'CLIENT',
        'book-order':     'CLIENT',
        'assign-carrier': 'STAFF',
    };

    const TILE_LABELS = {
        'pickup-request': 'Pickup Request',
        'book-order':     'Book Order',
        'assign-carrier': 'Assign Carrier',
    };

    // ── View switching ────────────────────────────────────────────────────────
    function _showTiles() {
        document.getElementById('tilesView').style.display = 'flex';
        document.getElementById('splitView').classList.remove('active');
        document.getElementById('ordersDetailPane').style.display = 'none';
        document.getElementById('ordersListPane').style.display = 'flex';
        _activeTile = null;
    }

    function _showSplit(title) {
        document.getElementById('tilesView').style.display = 'none';
        document.getElementById('splitView').classList.add('active');
        document.getElementById('splitTitle').textContent = title;
        _showDetail(false);
        document.getElementById('ordersList').innerHTML = '';
        document.getElementById('ordersListMsg').textContent = 'Loading…';
        document.getElementById('ordersSearch').value = '';
        document.getElementById('ordersListPane').style.display = 'flex';
        document.getElementById('ordersDetailPane').style.display = _isMobile() ? 'none' : 'block';
    }

    function showListPane() {
        document.getElementById('ordersListPane').style.display = 'flex';
        document.getElementById('ordersDetailPane').style.display = 'none';
    }

    function showDetailPane() {
        if (_isMobile()) {
            document.getElementById('ordersListPane').style.display = 'none';
            document.getElementById('ordersDetailPane').style.display = 'block';
        } else {
            document.getElementById('ordersListPane').style.display = 'flex';
            document.getElementById('ordersDetailPane').style.display = 'block';
        }
    }

    function showDetail(show) {
        document.getElementById('ordersDetailEmpty').classList.toggle('hidden', show);
        document.getElementById('ordersDetailView').classList.toggle('hidden', !show);
    }

    // ── RBAC tile hiding ──────────────────────────────────────────────────────
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
        document.getElementById('ordersAddBtn').classList.add('hidden');
        document.getElementById('ordersListMsg').textContent = 'Coming soon.';
    }

    function _init() {
        _hideTilesByRole();
        document.querySelectorAll('[data-tile]').forEach(tile =>
            tile.addEventListener('click', () => _activateTile(tile.dataset.tile))
        );
        document.getElementById('backToTilesBtn').addEventListener('click', _showTiles);
        document.getElementById('backToListBtn')?.addEventListener('click', () => {
            if (_isMobile()) showListPane();
        });
    }

    document.addEventListener('DOMContentLoaded', _init);

    return { showDetail, showDetailPane, showListPane, can: _can, activeTile: () => _activeTile };
})();

window.OrdersPage = OrdersPage;
