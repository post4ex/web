// ============================================================================
// VAULT-COA.JS — Chart of Accounts (Dynamic from Manager.io cache keys)
// Tile: chart-of-accounts
// Data source: Manager.io dynamic COA
// ============================================================================

const VaultCoa = (() => {

    let _coaList = []; // Array of { name, key }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by account name…';
    }

    async function load() {
        _injectListPane();
        window.setLoading?.(true, 'Loading Chart of Accounts...', 'list');
        
        try {
            // Fetch/Ensure cache keys
            if (!window.__vaultCacheKeys) {
                window.__vaultCacheKeys = await callApi('/api/manager/cache/keys', {}, 'GET');
            }

            const activeBranch = (VaultPage.getActiveBranch() || '').toLowerCase();
            const branchKeys = window.__vaultCacheKeys?.[activeBranch] || {};
            const coaMap = branchKeys.coa || {};

            _coaList = Object.entries(coaMap).map(([name, key]) => ({ name, key })).sort((a, b) => a.name.localeCompare(b.name));

            _renderList();
        } catch (err) {
            console.error('[VaultCoa] Load failed:', err);
            document.getElementById('vaultListMsg').textContent = 'Failed to load Chart of Accounts.';
        } finally {
            window.setLoading?.(false);
        }
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        ul.innerHTML = '';

        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = _coaList.filter(item => item.name.toLowerCase().includes(q) || item.key.toLowerCase().includes(q));

        if (filtered.length === 0) {
            document.getElementById('vaultListMsg').textContent = q ? 'No matching accounts found.' : 'No accounts available.';
            return;
        }
        document.getElementById('vaultListMsg').textContent = '';

        filtered.forEach(item => {
            const li = document.createElement('li');
            li.className = 'px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 transition-colors flex items-center justify-between';
            li.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-semibold text-xs">
                        📖
                    </div>
                    <div>
                        <div class="text-sm font-medium text-slate-700">${item.name}</div>
                        <div class="text-xxs text-slate-400 font-mono select-all">${item.key}</div>
                    </div>
                </div>
            `;
            li.addEventListener('click', () => _showDetail(item));
            ul.appendChild(li);
        });
    }

    function _showDetail(item) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card rounded-2xl border border-slate-100 shadow-sm bg-white overflow-hidden">
                <div class="h-1.5 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                <div class="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
                    <div>
                        <h3 class="font-bold text-slate-800 text-lg tracking-tight">${item.name}</h3>
                        <p class="text-xs text-slate-400">Chart of Accounts details from Manager.io</p>
                    </div>
                </div>
                <div class="p-6 space-y-4">
                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-100/80 space-y-3">
                        <div>
                            <span class="block text-xxs font-semibold uppercase tracking-wider text-slate-400">Account Name</span>
                            <span class="text-sm font-semibold text-slate-700">${item.name}</span>
                        </div>
                        <div>
                            <span class="block text-xxs font-semibold uppercase tracking-wider text-slate-400">Manager.io Key</span>
                            <span class="text-xs font-mono text-slate-600 select-all">${item.key}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        VaultPage.showDetailPane();
    }

    function search() {
        _renderList();
    }

    return { load, search };
})();

window.VaultCoa = VaultCoa;
