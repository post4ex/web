// ============================================================================
// VAULT-COA.JS — Chart of Accounts (placeholder — migrating to Manager.io)
// Tile: chart-of-accounts
// Data source: Manager.io dynamic COA (not hardcoded coa.py which was deleted)
// ============================================================================

const VaultCoa = (() => {

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search…';
    }

    async function load() {
        _injectListPane();
        document.getElementById('vaultList').innerHTML = '<li class="text-center text-gray-400 text-sm py-6">Coming soon — migrating to Manager.io</li>';
        VaultPage.showDetail(false);
    }

    function search() {}

    return { load, search };
})();

window.VaultCoa = VaultCoa;
