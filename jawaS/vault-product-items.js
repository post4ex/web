// ============================================================================
// VAULT-PRODUCT-ITEMS.JS — Hardcoded reference list of logistics products
// Tile: product-items
// Data: static list (similar to COA/SERVICE_ITEMS), with COA expense mapping
// ============================================================================

const VaultProductItems = (() => {

    let _allCoa = {};

    const PRODUCTS = [
        // ── PACKAGING ─────────────────────────────────────────────────────
        { code: 'BOX-S',  name: 'Small Corrugated Box',      description: 'Small 3-ply corrugated box (12x10x8")',           group: 'Packaging',           expense_coa: '4012', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'BOX-M',  name: 'Medium Corrugated Box',     description: 'Medium 5-ply corrugated box (16x14x12")',        group: 'Packaging',           expense_coa: '4012', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'BOX-L',  name: 'Large Corrugated Box',      description: 'Large 5-ply corrugated box (20x18x16")',         group: 'Packaging',           expense_coa: '4012', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'BOX-XL', name: 'Extra Large Box',           description: 'Extra large 7-ply corrugated box (24x20x18")',   group: 'Packaging',           expense_coa: '4012', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'POLY-S', name: 'Poly Bag (Small)',          description: 'Tamper-evident poly courier bag (10x14") for docs', group: 'Packaging',        expense_coa: '4012', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'POLY-L', name: 'Poly Bag (Large)',          description: 'Tamper-evident poly courier bag (14x20") for apparel', group: 'Packaging',     expense_coa: '4012', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'BUBB',   name: 'Bubble Wrap Roll',          description: 'Bubble wrap roll (100m x 1m) protective packaging', group: 'Packaging',       expense_coa: '4012', stock_unit: 'roll', charge_type: 'product' },
        { code: 'TAPE',   name: 'BOPP Packaging Tape',       description: 'Clear/brown BOPP tape (48mm x 100y) carton sealing', group: 'Packaging',      expense_coa: '4012', stock_unit: 'roll', charge_type: 'product' },
        { code: 'STRAP',  name: 'Plastic Strapping Band',    description: 'PP strapping band (12mm x 500m) box baling',       group: 'Packaging',         expense_coa: '4012', stock_unit: 'roll', charge_type: 'product' },
        { code: 'SHRINK', name: 'Shrink Wrap / Stretch Film',description: 'Stretch film (500mm x 300m) pallet unitization',   group: 'Packaging',         expense_coa: '4012', stock_unit: 'roll', charge_type: 'product' },
        { code: 'PALLET', name: 'Shipping Pallet (Wooden)',   description: 'Standard wooden pallet (1200x1000mm) ISO',        group: 'Packaging',         expense_coa: '4012', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'POUCH',  name: 'Waterproof Document Pouch',  description: 'Waterproof A4 zip-lock pouch tamper-evident',     group: 'Packaging',         expense_coa: '4012', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'SEAL',   name: 'Tamper-Evident Seal',       description: 'Plastic tamper-evident seal (per 100 pcs)',       group: 'Packaging',         expense_coa: '4012', stock_unit: 'box',  charge_type: 'product' },
        { code: 'AIRP',   name: 'Air Pillows / Void Fill',   description: 'Air cushion pillows for void fill in cartons',    group: 'Packaging',         expense_coa: '4012', stock_unit: 'roll', charge_type: 'product' },
        // ── LABELS & CONSUMABLES ──────────────────────────────────────────
        { code: 'AWB-L',  name: 'AWB / Shipping Label',      description: '4x6" thermal AWB/shipping label (roll of 500)',   group: 'Labels & Consumables', expense_coa: '4013', stock_unit: 'roll', charge_type: 'consumable' },
        { code: 'BC-L',   name: 'Barcode / SKU Label',      description: 'Barcode label (1x3") for warehouse SKU/bin ID',   group: 'Labels & Consumables', expense_coa: '4013', stock_unit: 'roll', charge_type: 'consumable' },
        { code: 'ROLL',   name: 'Thermal Paper Roll',        description: 'Thermal receipt/POD paper roll (3x50m)',          group: 'Labels & Consumables', expense_coa: '5036', stock_unit: 'roll', charge_type: 'consumable' },
        { code: 'RIBBON', name: 'Thermal Transfer Ribbon',   description: 'Wax thermal ribbon (110mm x 300m) for barcode printers', group: 'Labels & Consumables', expense_coa: '5036', stock_unit: 'roll', charge_type: 'consumable' },
        // ── STATIONERY ────────────────────────────────────────────────────
        { code: 'STAPLE', name: 'Heavy-Duty Stapler + Pins', description: 'HD stapler with HD-26 pins for bulk AWB stapling', group: 'Stationery',        expense_coa: '5035', stock_unit: 'set',  charge_type: 'consumable' },
        { code: 'PEN',    name: 'Permanent Marker Pen',      description: 'Oil-based permanent marker (black/red)',          group: 'Stationery',        expense_coa: '5035', stock_unit: 'pcs',  charge_type: 'consumable' },
        { code: 'PPRINT', name: 'A4 Printer Paper',          description: 'A4 75gsm multipurpose paper (ream of 500)',       group: 'Stationery',        expense_coa: '5035', stock_unit: 'ream', charge_type: 'consumable' },
        { code: 'TONER',  name: 'Printer Toner Cartridge',   description: 'Laser toner cartridge (HP/Canon/Brother)',        group: 'Stationery',        expense_coa: '5035', stock_unit: 'pcs',  charge_type: 'consumable' },
        { code: 'FILE',   name: 'File Folder / Pouch',       description: 'Laminated A4 file folder for POD/CN filing',      group: 'Stationery',        expense_coa: '5035', stock_unit: 'pcs',  charge_type: 'consumable' },
        // ── VEHICLE & FLEET ───────────────────────────────────────────────
        { code: 'TYRE',   name: 'Commercial Vehicle Tyre',   description: 'Radial tyre for HCV/LCV fleet (285/65R22.5)',     group: 'Vehicle & Fleet',    expense_coa: '5051', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'OIL',    name: 'Engine Oil (Diesel)',       description: '15W-40 diesel engine oil (5L/20L can) for fleet', group: 'Vehicle & Fleet',    expense_coa: '5050', stock_unit: 'can',  charge_type: 'consumable' },
        { code: 'GREASE', name: 'Lithium Grease',            description: 'Lithium multipurpose grease (400g cartridge)',     group: 'Vehicle & Fleet',    expense_coa: '5052', stock_unit: 'pcs',  charge_type: 'consumable' },
        { code: 'BATTERY',name: 'Vehicle Battery',           description: 'Heavy-duty 12V truck battery (100-150Ah)',        group: 'Vehicle & Fleet',    expense_coa: '5053', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'FILTER', name: 'Oil/Air/Fuel Filter Set',   description: 'Combo filter set for fleet preventive maint',    group: 'Vehicle & Fleet',    expense_coa: '5053', stock_unit: 'set',  charge_type: 'product' },
        { code: 'BRAKE',  name: 'Brake Liner / Brake Pad',   description: 'Brake liner shoes for HCV/LCV drum brakes',      group: 'Vehicle & Fleet',    expense_coa: '5053', stock_unit: 'set',  charge_type: 'product' },
        // ── TECHNOLOGY ────────────────────────────────────────────────────
        { code: 'SCAN',   name: 'Handheld Barcode Scanner',  description: '2D handheld scanner (HHT) for pick-scan-ship',    group: 'Technology',         expense_coa: '1105', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'GPS',    name: 'GPS Vehicle Tracker',       description: 'Real-time GPS/GSM vehicle tracking device',       group: 'Technology',         expense_coa: '1104', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'SIM',    name: 'M2M / IoT SIM Card',        description: 'M2M SIM (2G/4G) for GPS trackers & handhelds',    group: 'Technology',         expense_coa: '5041', stock_unit: 'pcs',  charge_type: 'consumable' },
        { code: 'THERM',  name: 'Thermal Label Printer',     description: '4x6" direct thermal label printer (Zebra/TSC)',   group: 'Technology',         expense_coa: '1105', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'WEIGH',  name: 'Digital Weighing Scale',    description: 'Digital platform scale (50-100kg) for parcels',   group: 'Technology',         expense_coa: '1103', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'CCTV',   name: 'CCTV Camera',               description: 'IP CCTV camera for warehouse security',           group: 'Technology',         expense_coa: '1107', stock_unit: 'pcs',  charge_type: 'product' },
        // ── WAREHOUSE EQUIPMENT ───────────────────────────────────────────
        { code: 'HPT',    name: 'Hand Pallet Truck',         description: 'Manual hydraulic HPT (2.5T) for warehouse',       group: 'Warehouse Equipment', expense_coa: '1100', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'RACK',   name: 'Pallet Racking Section',    description: 'Heavy-duty selective pallet racking bay',         group: 'Warehouse Equipment', expense_coa: '1101', stock_unit: 'bay',  charge_type: 'product' },
        { code: 'HAND',   name: 'Foldable Hand Truck',       description: 'Foldable aluminum hand truck (100kg) last-mile',  group: 'Warehouse Equipment', expense_coa: '1100', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'TROLLEY',name: 'Cargo Trolley',             description: 'Platform cargo trolley (4-wheel, 250kg)',         group: 'Warehouse Equipment', expense_coa: '1101', stock_unit: 'pcs',  charge_type: 'product' },
        // ── SAFETY & UNIFORM ──────────────────────────────────────────────
        { code: 'VEST',   name: 'Reflective Safety Vest',    description: 'Hi-vis yellow/orange reflective safety vest',     group: 'Safety & Uniform',   expense_coa: '5010', stock_unit: 'pcs',  charge_type: 'consumable' },
        { code: 'HELMET', name: 'Safety Helmet',             description: 'ISI-marked industrial safety helmet',              group: 'Safety & Uniform',   expense_coa: '5010', stock_unit: 'pcs',  charge_type: 'product' },
        { code: 'BOOT',   name: 'Steel-Toe Safety Boot',     description: 'Steel-toe leather safety boot for warehouse',     group: 'Safety & Uniform',   expense_coa: '5010', stock_unit: 'pair', charge_type: 'product' },
        { code: 'UNIFORM',name: 'Staff Uniform Set',         description: 'Branded company staff uniform (shirt + trouser)',  group: 'Safety & Uniform',   expense_coa: '5010', stock_unit: 'set',  charge_type: 'product' },
        { code: 'GLOVE',  name: 'Work Gloves',               description: 'Cotton/latex work gloves for loading staff',      group: 'Safety & Uniform',   expense_coa: '5010', stock_unit: 'pair', charge_type: 'consumable' },
        { code: 'MASK',   name: 'Dust Mask / N95',           description: 'N95 respirator / dust mask for warehouse staff',  group: 'Safety & Uniform',   expense_coa: '5010', stock_unit: 'box',  charge_type: 'consumable' },
        // ── CLEANING & MAINTENANCE ─────────────────────────────────────────
        { code: 'BROOM',  name: 'Warehouse Broom',           description: 'Heavy-duty warehouse industrial push brush',      group: 'Cleaning & Maintenance', expense_coa: '5048', stock_unit: 'pcs',  charge_type: 'consumable' },
        { code: 'CLOTH',  name: 'Cleaning Rags',             description: 'Cotton wiping rags (per kg bundle)',              group: 'Cleaning & Maintenance', expense_coa: '5048', stock_unit: 'kg',   charge_type: 'consumable' },
        { code: 'DETER',  name: 'Floor Cleaner / Degreaser', description: 'Industrial floor detergent/degreaser (5L can)',   group: 'Cleaning & Maintenance', expense_coa: '5048', stock_unit: 'can',  charge_type: 'consumable' },
    ];

    function _loadCoaCache() {
        callApi('/api/coa', {}, 'GET').then(res => {
            if (res?.data) { _allCoa = {}; res.data.forEach(a => _allCoa[a.code] = a); }
        }).catch(() => {});
    }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search product code or name…';
    }

    const GROUP_ORDER = ['Packaging', 'Labels & Consumables', 'Stationery', 'Vehicle & Fleet', 'Technology', 'Warehouse Equipment', 'Safety & Uniform', 'Cleaning & Maintenance'];

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
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No matching products.</li>';
            return;
        }
        const groups = {};
        filtered.forEach(p => { if (!groups[p.group]) groups[p.group] = []; groups[p.group].push(p); });
        ul.innerHTML = GROUP_ORDER.filter(g => groups[g]).map(g => `
            <li class="border-none cursor-default">
                <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pb-1 pt-3">${g}</div>
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
        const expenseCoa = _allCoa[p.expense_coa] ? `${p.expense_coa} — ${_allCoa[p.expense_coa].name}` : p.expense_coa || '—';
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${p.code} — ${p.name}</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-500">Code:</span> <span class="font-mono font-medium">${p.code}</span></div>
                        <div><span class="text-gray-500">Unit:</span> <span class="font-medium">${p.stock_unit}</span></div>
                        <div><span class="text-gray-500">Group:</span> <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">${p.group}</span></div>
                        <div><span class="text-gray-500">Type:</span> <span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs uppercase">${p.charge_type}</span></div>
                        <div class="sm:col-span-2"><span class="text-gray-500">Description:</span> ${p.description}</div>
                    </div>
                    <div class="mt-3 border-t pt-3">
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">COA Expense Mapping (Purchase)</div>
                        <div class="bg-rose-50 rounded p-2.5 border border-rose-100">
                            <div class="text-xs text-rose-600 font-medium">Expense (INWARD Purchase)</div>
                            <div class="text-sm font-mono font-bold text-rose-800">${expenseCoa}</div>
                        </div>
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
        _loadCoaCache();
        _renderList('');
    }

    return { load, search };
})();

window.VaultProductItems = VaultProductItems;
