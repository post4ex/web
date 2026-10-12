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

    // ── History API & State Management ──────────────────────────────────────
    function _pushHistoryState(view, tile) {
        try {
            const current = history.state;
            if (current && current.scope === 'orders' && current.view === view && current.tile === tile) {
                return;
            }
            const hash = view === 'detail' ? `#${tile || ''}-detail` : (view === 'split' ? `#${tile || ''}` : '');
            const url = hash ? `${window.location.pathname}${window.location.search}${hash}` : `${window.location.pathname}${window.location.search}`;
            history.pushState({ scope: 'orders', view, tile }, '', url);
        } catch (e) {
            console.warn('[Orders] pushState notice:', e);
        }
    }

    // ── View switching ────────────────────────────────────────────────────────
    function _showTiles(fromHistory = false) {
        document.getElementById('tilesView').style.display = 'flex';
        document.getElementById('splitView').classList.remove('active');
        document.getElementById('ordersDetailPane').style.display = 'none';
        document.getElementById('ordersListPane').style.display = 'flex';
        _activeTile = null;

        if (!fromHistory) {
            try {
                if (history.state && history.state.scope === 'orders' && history.state.view !== 'tiles') {
                    history.replaceState({ scope: 'orders', view: 'tiles' }, '', window.location.pathname + window.location.search);
                }
            } catch (_) {}
        }
    }

    function _showSplit(title) {
        document.getElementById('tilesView').style.display = 'none';
        document.getElementById('splitView').classList.add('active');
        document.getElementById('splitTitle').textContent = title;
        showDetail(false);
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

    function showDetailPane(fromHistory = false) {
        if (_isMobile()) {
            document.getElementById('ordersListPane').style.display = 'none';
            document.getElementById('ordersDetailPane').style.display = 'block';
            if (!fromHistory && _activeTile) {
                _pushHistoryState('detail', _activeTile);
            }
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
    async function _activateTile(name, fromHistory = false) {
        const minRole = TILE_MIN_ROLE[name];
        if (minRole && !_can(minRole)) return;
        _activeTile = name;
        _showSplit(TILE_LABELS[name] || name);
        if (!fromHistory) {
            _pushHistoryState('split', name);
        }
        document.getElementById('ordersAddBtn').classList.add('hidden');
        document.getElementById('ordersListMsg').textContent = 'Coming soon.';
    }

    function _init() {
        _hideTilesByRole();
        document.querySelectorAll('[data-tile]').forEach(tile =>
            tile.addEventListener('click', () => _activateTile(tile.dataset.tile))
        );

        function _handleBackToTiles() {
            if (history.state && history.state.scope === 'orders' && (history.state.view === 'split' || history.state.view === 'detail')) {
                history.back();
            } else {
                _showTiles();
            }
        }

        function _handleBackToList() {
            if (_isMobile()) {
                if (history.state && history.state.scope === 'orders' && history.state.view === 'detail') {
                    history.back();
                } else {
                    showListPane();
                }
            }
        }

        document.getElementById('backToTilesBtn')?.addEventListener('click', _handleBackToTiles);
        document.getElementById('backToListBtn')?.addEventListener('click', _handleBackToList);

        // Initial base history state & deep-link hydration
        if (!history.state || history.state.scope !== 'orders') {
            const initialHash = (window.location.hash || '').replace(/^#/, '');
            history.replaceState({ scope: 'orders', view: 'tiles' }, '', window.location.pathname + window.location.search);
            if (initialHash) {
                const targetTile = initialHash.replace(/-detail$/, '');
                if (document.querySelector(`.tile[data-tile="${targetTile}"]`)) {
                    _activateTile(targetTile);
                }
            }
        }

        window.addEventListener('popstate', (e) => {
            const state = e.state;
            if (!state || state.scope !== 'orders' || state.view === 'tiles') {
                _showTiles(true);
            } else if (state.view === 'split') {
                if (_activeTile !== state.tile) {
                    _activateTile(state.tile, true);
                }
                showListPane();
            } else if (state.view === 'detail') {
                if (_activeTile !== state.tile) {
                    _activateTile(state.tile, true);
                }
                showDetailPane(true);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', _init);

    return { showDetail, showDetailPane, showListPane, can: _can, activeTile: () => _activeTile };
})();

window.OrdersPage = OrdersPage;
