// ============================================================================
// VAULT-DELIVERY-NOTES.JS — Delivery Notes (placeholder)
// Tile: delivery-notes
// Note: Delivery Notes collection not yet implemented in backend.
// ============================================================================

const VaultDeliveryNotes = (() => {

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        ul.innerHTML = `
            <li class="text-center border-none cursor-default py-12">
                <div class="text-4xl mb-4">🚚</div>
                <p class="text-gray-500 text-sm mb-2">Delivery Notes module coming soon.</p>
                <p class="text-xs text-gray-400">This will allow you to create and manage delivery notes (DC) for shipments.</p>
            </li>`;
    }

    function search() {}

    async function load() {
        _injectListPane();
        _renderList();
    }

    return { load, search };
})();

window.VaultDeliveryNotes = VaultDeliveryNotes;
