// ============================================================================
// VAULT-PRODUCT-ITEMS.JS — Hardcoded reference list of common logistics products
// Tile: product-items
// Data: static list (similar to COA), no API calls needed
// ============================================================================

const VaultProductItems = (() => {

    const PRODUCTS = [
        { code: 'BOX-S',  name: 'Small Box',     description: 'Small corrugated box (12x10x8")', group: 'Packaging' },
        { code: 'BOX-M',  name: 'Medium Box',    description: 'Medium corrugated box (16x14x12")', group: 'Packaging' },
        { code: 'BOX-L',  name: 'Large Box',     description: 'Large corrugated box (20x18x16")', group: 'Packaging' },
        { code: 'BOX-XL', name: 'Extra Large Box', description: 'Extra large corrugated box (24x20x18")', group: 'Packaging' },
        { code: 'BUBB',   name: 'Bubble Wrap',   description: 'Bubble wrap roll (per meter)', group: 'Packaging' },
        { code: 'TAPE',   name: 'Packaging Tape', description: 'Clear/brown packaging tape (per roll)', group: 'Packaging' },
        { code: 'POLY',   name: 'Poly Bag',      description: 'Plastic poly bag for documents', group: 'Packaging' },
        { code: 'LABEL',  name: 'Shipping Label', description: 'Thermal shipping label (AWB)', group: 'Consumable' },
        { code: 'POUCH',  name: 'Document Pouch', description: 'Waterproof document pouch', group: 'Packaging' },
        { code: 'STAPLE', name: 'Stapler + Pins', description: 'Heavy-duty stapler with pins', group: 'Stationery' },
        { code: 'PEN',    name: 'Marker Pen',    description: 'Permanent marker (permanent/waterproof)', group: 'Stationery' },
        { code: 'SCALE',  name: 'Weighing Scale', description: 'Digital weighing scale (up to 50kg)', group: 'Equipment' },
        { code: 'THERM',  name: 'Thermal Printer', description: '4x6 thermal label printer', group: 'Equipment' },
        { code: 'ROLL',   name: 'Thermal Roll',  description: 'Thermal paper roll (4x6")', group: 'Consumable' },
        { code: 'HAND',   name: 'Hand Truck',    description: 'Foldable hand truck / dolly', group: 'Equipment' },
        { code: 'SEAL',   name: 'Security Seal',  description: 'Tamper-evident security seal (per 100)', group: 'Packaging' },
        { code: 'PALLET', name: 'Pallet',         description: 'Wooden/plastic shipping pallet', group: 'Packaging' },
        { code: 'STRAP',  name: 'Strapping Band', description: 'Plastic strapping band (per roll)', group: 'Packaging' },
    ];

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search product code or name…';
    }

    function _renderList(filter) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const filtered = filter ? PRODUCTS.filter(p =>
            p.code.toLowerCase().includes(filter) ||
            p.name.toLowerCase().includes(filter) ||
            p.description.toLowerCase().includes(filter) ||
            p.group.toLowerCase().includes(filter)
        ) : PRODUCTS;
        if (!filtered.length) {
            ul.innerHTML = '<li class=\"text-center text-gray-400 text-sm py-6\">No matching products.</li>';
            return;
        }
        const groups = {};
        filtered.forEach(p => { if (!groups[p.group]) groups[p.group] = []; groups[p.group].push(p); });
        const groupOrder = ['Packaging', 'Consumable', 'Stationery', 'Equipment'];
        ul.innerHTML = groupOrder.filter(g => groups[g]).map(g => `
            <li class=\"border-none cursor-default\">
                <div class=\"text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pb-1 pt-3\">${g}</div>
            </li>
            ${groups[g].map(p => `
                <li data-code="${p.code}" class="p-2.5 rounded-lg cursor-pointer hover:bg-amber-50 border border-gray-200 transition-colors">
                    <strong class="text-amber-700 block text-sm">${p.code} — ${p.name}</strong>
                    <span class="text-xs text-gray-500">${p.description}</span>
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
        const p = PRODUCTS.find(x => x.code === code);
        if (!p) return;
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${p.code} — ${p.name}</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-1 gap-4 text-sm">
                        <div><span class="text-gray-500">Code:</span> <span class="font-mono font-medium">${p.code}</span></div>
                        <div><span class="text-gray-500">Name:</span> ${p.name}</div>
                        <div><span class="text-gray-500">Group:</span> <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">${p.group}</span></div>
                        <div><span class="text-gray-500">Description:</span> ${p.description}</div>
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

window.VaultProductItems = VaultProductItems;
