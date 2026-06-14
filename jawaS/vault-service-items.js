// ============================================================================
// VAULT-SERVICE-ITEMS.JS — Hardcoded reference list of courier/logistics services
// Tile: service-items
// Data: static list (similar to COA), no API calls needed
// ============================================================================

const VaultServiceItems = (() => {

    // Cache of COA accounts for resolving account name from code
    let _allCoa = {};

    const SERVICES = [
        { code: 'FRT',  name: 'Freight',           description: 'Base freight/transportation charge', group: 'Core',       income_coa: '3001', expense_coa: '4001', charge_type: 'income' },
        { code: 'FUEL', name: 'Fuel Surcharge',     description: 'Variable fuel adjustment charge',   group: 'Surcharge',  income_coa: '3005', expense_coa: '4005', charge_type: 'income' },
        { code: 'COD',  name: 'COD Charge',         description: 'Cash on Delivery collection fee',   group: 'Value Added', income_coa: '3010', expense_coa: '4015', charge_type: 'income' },
        { code: 'TOPAY', name: 'ToPay Charge',      description: 'Receiver-pays freight charge',      group: 'Value Added', income_coa: '3015', expense_coa: '4001', charge_type: 'income' },
        { code: 'FOV',  name: 'Insurance (FOV)',     description: 'Freight on value / insurance',     group: 'Value Added', income_coa: '3020', expense_coa: '4016', charge_type: 'income' },
        { code: 'EWAY', name: 'E-Way Bill',         description: 'E-way bill generation charge',     group: 'Compliance',  income_coa: '3035', expense_coa: '4014', charge_type: 'income' },
        { code: 'AWB',  name: 'AWB Charges',        description: 'Airway bill / shipping label fee', group: 'Value Added', income_coa: '3030', expense_coa: '4013', charge_type: 'income' },
        { code: 'PACK', name: 'Packaging',          description: 'Packaging material charge',        group: 'Value Added', income_coa: '3025', expense_coa: '4012', charge_type: 'income' },
        { code: 'DEV',  name: 'Development',        description: 'Development/delivery charge',      group: 'Value Added', income_coa: '3040', expense_coa: '4001', charge_type: 'income' },
        { code: 'SGST', name: 'SGST',              description: 'State GST (9% or 6%)',              group: 'Tax',        income_coa: '2015', expense_coa: '1030', charge_type: 'tax' },
        { code: 'CGST', name: 'CGST',              description: 'Central GST (9% or 6%)',            group: 'Tax',        income_coa: '2015', expense_coa: '1030', charge_type: 'tax' },
        { code: 'IGST', name: 'IGST',              description: 'Integrated GST (inter-state)',       group: 'Tax',        income_coa: '2015', expense_coa: '1030', charge_type: 'tax' },
        { code: 'HOLD', name: 'Holding Charge',      description: 'Storage / demurrage charge',       group: 'Surcharge',  income_coa: '3041', expense_coa: '4010', charge_type: 'income' },
        { code: 'RTO',  name: 'RTO Charge',         description: 'Return to origin charge',           group: 'Surcharge',  income_coa: '3043', expense_coa: '4001', charge_type: 'income' },
        { code: 'ODA',  name: 'ODA Charge',         description: 'Outer delivery area surcharge',    group: 'Surcharge',  income_coa: '3042', expense_coa: '4003', charge_type: 'income' },
        { code: 'MSG',  name: 'Notification SMS',  description: 'SMS/email tracking notifications',  group: 'Value Added', income_coa: '3036', expense_coa: '5040', charge_type: 'income' },
    ];

    // Index for COA name lookup
    function _loadCoaCache() {
        callApi('/api/coa', {}, 'GET').then(res => {
            if (res?.data) {
                _allCoa = {};
                res.data.forEach(a => _allCoa[a.code] = a);
            }
        }).catch(() => {});
    }

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
        const incomeCoa = _allCoa[s.income_coa] ? `${s.income_coa} — ${_allCoa[s.income_coa].name}` : s.income_coa || '—';
        const expenseCoa = _allCoa[s.expense_coa] ? `${s.expense_coa} — ${_allCoa[s.expense_coa].name}` : s.expense_coa || '—';
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${s.code} — ${s.name}</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-500">Code:</span> <span class="font-mono font-medium">${s.code}</span></div>
                        <div><span class="text-gray-500">Name:</span> ${s.name}</div>
                        <div><span class="text-gray-500">Group:</span> <span class="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs">${s.group}</span></div>
                        <div><span class="text-gray-500">Type:</span> <span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs uppercase">${s.charge_type}</span></div>
                        <div><span class="text-gray-500">Description:</span> ${s.description}</div>
                    </div>
                    <div class="mt-3 border-t pt-3">
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">COA Mapping</div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div class="bg-green-50 rounded p-2.5 border border-green-100">
                                <div class="text-xs text-green-600 font-medium">Income (OUTWARD)</div>
                                <div class="text-sm font-mono font-bold text-green-800">${incomeCoa}</div>
                            </div>
                            <div class="bg-rose-50 rounded p-2.5 border border-rose-100">
                                <div class="text-xs text-rose-600 font-medium">Expense (INWARD)</div>
                                <div class="text-sm font-mono font-bold text-rose-800">${expenseCoa}</div>
                            </div>
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

window.VaultServiceItems = VaultServiceItems;
