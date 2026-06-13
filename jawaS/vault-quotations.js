// ============================================================================
// VAULT-QUOTATIONS.JS — Quotations (placeholder)
// Tile: quotations
// Note: Quotations collection not yet implemented in backend.
// ============================================================================

const VaultQuotations = (() => {

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        ul.innerHTML = `
            <li class="text-center border-none cursor-default py-12">
                <div class="text-4xl mb-4">📋</div>
                <p class="text-gray-500 text-sm mb-2">Quotations module coming soon.</p>
                <p class="text-xs text-gray-400">This will allow you to create and manage quotations for your clients.</p>
            </li>`;
    }

    function search() {}

    async function load() {
        _injectListPane();
        _renderList();
    }

    return { load, search };
})();

window.VaultQuotations = VaultQuotations;
