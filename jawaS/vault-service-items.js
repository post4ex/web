// ============================================================================
// VAULT-SERVICE-ITEMS.JS — Service Items (placeholder — migrating to Manager.io)
// Tile: service-items
// Data source: Manager.io dynamic items (not hardcoded service_items.py which was deleted)
// ============================================================================

const VaultServiceItems = (() => {

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

window.VaultServiceItems = VaultServiceItems;
