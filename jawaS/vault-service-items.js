// ============================================================================
// VAULT-SERVICE-ITEMS.JS — Hardcoded reference list of courier/logistics services
// Tile: service-items
// Data: static list (similar to COA), no API calls needed
// ============================================================================

const VaultServiceItems = (() => {

    const SERVICES = [
        { code: 'FRT',  name: 'Freight',           description: 'Base freight/transportation charge', group: 'Core' },
        { code: 'FUEL', name: 'Fuel Surcharge',     description: 'Variable fuel adjustment charge', group: 'Surcharge' },
        { code: 'COD',  name: 'COD Charge',         description: 'Cash on Delivery collection fee', group: 'Value Added' },
        { code: 'TOPAY', name: 'ToPay Charge',      description: 'Receiver-pays freight charge', group: 'Value Added' },
        { code: 'FOV',  name: 'Insurance (FOV)',     description: 'Freight on value / insurance', group: 'Value Added' },
        { code: 'EWAY', name: 'E-Way Bill',         description: 'E-way bill generation charge', group: 'Compliance' },
        { code: 'AWB',  name: 'AWB Charges',        description: 'Airway bill / shipping label fee', group: 'Value Added' },
        { code: 'PACK', name: 'Packaging',          description: 'Packaging material charge', group: 'Value Added' },
        { code: 'DEV',  name: 'Development',        description: 'Development/delivery charge', group: 'Value Added' },
        { code: 'SGST', name: 'SGST',              description: 'State GST (9% or 6%)', group: 'Tax' },
        { code: 'CGST', name: 'CGST',              description: 'Central GST (9% or 6%)', group: 'Tax' },
        { code: 'IGST', name: 'IGST',              description: 'Integrated GST (inter-state)', group: 'Tax' },
        { code: 'HOLD', name: 'Holding Charge',      description: 'Storage / demurrage charge', group: 'Surcharge' },
        { code: 'RTO',  name: 'RTO Charge',         description: 'Return to origin charge', group: 'Surcharge' },
        { code: 'ODA',  name: 'ODA Charge',         description: 'Outer delivery area surcharge', group: 'Surcharge' },
        { code: 'N MSG', name: 'Notification SMS',  description: 'SMS/email tracking notifications', group: 'Value Added' },
    ];

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search service code or name…';
    }

    function _renderList(filter) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const filtered = filter ? SERVICES.filter(s =>
            s.code.toLowerCase().includes(filter) ||
            s.name.toLowerCase().includes(filter) ||
            s.description.toLowerCase().includes(filter) ||
            s.group.toLowerCase().includes(filter)
        ) : SERVICES;
        if (!filtered.length) {
            ul.innerHTML = '<li class=\"text-center text-gray-400 text-sm py-6\">No matching services.</li>';
            return;
        }
        const groups = {};
        filtered.forEach(s => { if (!groups[s.group]) groups[s.group] = []; groups[s.group].push(s); });
        const groupOrder = ['Core', 'Surcharge', 'Value Added', 'Compliance', 'Tax'];
        ul.innerHTML = groupOrder.filter(g => groups[g]).map(g => `
            <li class=\"border-none cursor-default\">
                <div class=\"text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pb-1 pt-3\">${g}</div>
            </li>
            ${groups[g].map(s => `
                <li data-code="${s.code}" class="p-2.5 rounded-lg cursor-pointer hover:bg-teal-50 border border-gray-200 transition-colors">
                    <strong class="text-teal-700 block text-sm">${s.code} — ${s.name}</strong>
                    <span class="text-xs text-gray-500">${s.description}</span>
                </li>
            `).join('')}
        `).join('');
        ul.querySelectorAll('li[data-code]').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(li.dataset.code);
            })
        );
    }

    function _renderDetail(code) {
        VaultPage.showDetail(true);
        const s = SERVICES.find(x => x.code === code);
        if (!s) return;
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${s.code} — ${s.name}</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-1 gap-4 text-sm">
                        <div><span class="text-gray-500">Code:</span> <span class="font-mono font-medium">${s.code}</span></div>
                        <div><span class="text-gray-500">Name:</span> ${s.name}</div>
                        <div><span class="text-gray-500">Group:</span> <span class="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs">${s.group}</span></div>
                        <div><span class="text-gray-500">Description:</span> ${s.description}</div>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function search(q) {
        _renderList(q.toLowerCase());
    }

    async function load() {
        _injectListPane();
        _renderList('');
    }

    return { load, search };
})();

window.VaultServiceItems = VaultServiceItems;
