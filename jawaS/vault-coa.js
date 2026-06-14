// ============================================================================
// VAULT-COA.JS — Chart of Accounts with left pane list / right pane detail
// Tile: chart-of-accounts
// Data source: /api/coa endpoint
// ============================================================================

const VaultCOA = (() => {

    let _allAccounts = [];
    let _allLedger   = [];
    let _currentGroup = null;

    // Group display order
    const GROUP_ORDER = [
        'Current Assets', 'Fixed Assets', 'Intangible Assets',
        'Current Liabilities', 'Equity',
        'Operating Income', 'Other Income',
        'Freight & Transport', 'Employee Costs', 'Office & Admin',
        'Vehicle Operations', 'Administrative', 'Financial',
        'Tax Expenses', 'Depreciation', 'Other Expenses',
    ];

    function _typeColor(type) {
        if (type === 'Asset')      return 'text-blue-700';
        if (type === 'Liability')  return 'text-orange-700';
        if (type === 'Income')     return 'text-green-700';
        if (type === 'Expense')    return 'text-rose-700';
        return 'text-gray-700';
    }

    function _typeBg(type) {
        if (type === 'Asset')      return 'bg-blue-50 border-blue-200';
        if (type === 'Liability')  return 'bg-orange-50 border-orange-200';
        if (type === 'Income')     return 'bg-green-50 border-green-200';
        if (type === 'Expense')    return 'bg-rose-50 border-rose-200';
        return 'bg-gray-50 border-gray-200';
    }

    function _computeBalance(code, normalBalance) {
        let drTotal = 0, crTotal = 0;
        _allLedger.filter(e => e.STATUS === 'ACTIVE').forEach(e => {
            if (e.COA_DR === code) drTotal += (+e.DEBIT || 0);
            if (e.COA_CR === code) crTotal += (+e.CREDIT || 0);
        });
        // Dr-normal (assets/expenses): balance = debits - credits
        // Cr-normal (liabilities/income): balance = credits - debits
        return normalBalance === 'Dr' ? drTotal - crTotal : crTotal - drTotal;
    }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search code or name…';
    }

    function _getGroups(accounts) {
        const groups = {};
        accounts.forEach(a => {
            if (!groups[a.group]) groups[a.group] = [];
            groups[a.group].push(a);
        });
        return groups;
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();

        let filtered = _allAccounts;
        if (q) {
            filtered = _allAccounts.filter(a =>
                a.code.includes(q) || a.name.toLowerCase().includes(q) || a.group.toLowerCase().includes(q)
            );
        }

        const groups = _getGroups(filtered);
        const groupOrder = GROUP_ORDER.filter(g => groups[g]);

        if (!groupOrder.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No accounts found.</li>';
            return;
        }

        ul.innerHTML = groupOrder.map(grp => {
            const accs = groups[grp];
            const totalBal = accs.reduce((s, a) => s + (a.normal_balance === 'Dr' ? 1 : 0), 0);
            const drCount = accs.filter(a => a.normal_balance === 'Dr').length;
            const crCount = accs.filter(a => a.normal_balance === 'Cr').length;
            const type = accs[0].type;
            return `<li data-group="${grp}" class="p-3 rounded-lg cursor-pointer hover:bg-gray-50 border border-gray-200 transition-colors">
                <strong class="block text-sm ${_typeColor(type)}">${grp}</strong>
                <span class="text-xs text-gray-500">${accs.length} accounts · ${drCount} Dr · ${crCount} Cr</span>
            </li>`;
        }).join('');

        ul.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(li.dataset.group);
            });
        });

        // Auto-select first group if none selected
        if (!_currentGroup && groupOrder.length) {
            _currentGroup = groupOrder[0];
            ul.querySelector('li')?.classList.add('selected');
            _renderDetail(_currentGroup);
        }
    }

    function search() { _renderList(); }

    function _renderDetail(groupName) {
        _currentGroup = groupName;
        VaultPage.showDetail(true);

        const accounts = _allAccounts.filter(a => a.group === groupName);
        const type = accounts[0]?.type || '';
        const drCount = accounts.filter(a => a.normal_balance === 'Dr').length;
        const crCount = accounts.filter(a => a.normal_balance === 'Cr').length;

        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header ${_typeBg(type)}">
                    <div class="flex justify-between items-center">
                        <h3 class="font-semibold ${_typeColor(type)}">${groupName}</h3>
                        <span class="text-xs text-gray-500">${accounts.length} accounts · ${drCount} Dr · ${crCount} Cr</span>
                    </div>
                </div>
                <div class="detail-card-body p-0">
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-sm divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-2 text-left font-medium text-gray-500 uppercase text-xs w-20">Code</th>
                                    <th class="px-4 py-2 text-left font-medium text-gray-500 uppercase text-xs">Account Name</th>
                                    <th class="px-4 py-2 text-left font-medium text-gray-500 uppercase text-xs">Type</th>
                                    <th class="px-4 py-2 text-right font-medium text-gray-500 uppercase text-xs w-24">Balance</th>
                                    <th class="px-4 py-2 text-center font-medium text-gray-500 uppercase text-xs w-16">Normal Bal</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                ${accounts.map(a => `
                                    <tr class="hover:bg-gray-50 transition-colors cursor-pointer" onclick="VaultCOA._showAccountDetail('${a.code}')">
                                        <td class="px-4 py-2 font-mono text-xs font-medium text-gray-500">${a.code}</td>
                                        <td class="px-4 py-2 font-medium text-gray-800">${a.name}</td>
                                        <td class="px-4 py-2 text-xs text-gray-500">${a.type}</td>
                                        <td class="px-4 py-2 text-right text-xs">
                                            ${(() => {
                                                const bal = _computeBalance(a.code, a.normal_balance);
                                                if (bal === 0) return '<span class="text-gray-400">—</span>';
                                                const cls = bal > 0 ? 'text-green-600' : 'text-red-600';
                                                return `<span class="font-medium ${cls}">₹${Math.abs(bal).toFixed(2)}</span>`;
                                            })()}
                                        </td>
                                        <td class="px-4 py-2 text-center">
                                            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${a.normal_balance === 'Dr' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">${a.normal_balance}</span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Account detail modal (inline expand) ────────────────────────────────
    function _showAccountDetail(code) {
        const acc = _allAccounts.find(a => a.code === code);
        if (!acc) return;

        // Check if already expanded
        const existing = document.getElementById(`coa-detail-${code}`);
        if (existing) {
            existing.remove();
            return;
        }

        // Remove any other open detail rows
        document.querySelectorAll('[id^="coa-detail-"]').forEach(el => el.remove());

        // Find the row and insert detail below it
        const rows = document.querySelectorAll('#vaultDetailView tbody tr');
        let targetRow = null;
        rows.forEach(tr => {
            if (tr.querySelector('td:first-child')?.textContent.trim() === code) {
                targetRow = tr;
            }
        });
        if (!targetRow) return;

        const detailRow = document.createElement('tr');
        detailRow.id = `coa-detail-${code}`;
        detailRow.innerHTML = `
            <td colspan="5" class="px-6 py-4 bg-gray-50">
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div><span class="text-xs text-gray-400 block">Code</span><span class="font-mono font-medium">${acc.code}</span></div>
                    <div><span class="text-xs text-gray-400 block">Name</span><span class="font-medium">${acc.name}</span></div>
                    <div><span class="text-xs text-gray-400 block">Group</span><span>${acc.group}</span></div>
                    <div><span class="text-xs text-gray-400 block">Type</span><span class="${_typeColor(acc.type)} font-medium">${acc.type}</span></div>
                    <div><span class="text-xs text-gray-400 block">Normal Balance</span>
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${acc.normal_balance === 'Dr' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">${acc.normal_balance}</span>
                    </div>
                    <div><span class="text-xs text-gray-400 block">Balance</span>
                        ${(() => {
                            const bal = _computeBalance(acc.code, acc.normal_balance);
                            if (bal === 0) return '<span class="text-gray-400">₹0.00</span>';
                            const cls = bal > 0 ? 'text-green-600' : 'text-red-600';
                            return `<span class="font-medium ${cls}">₹${Math.abs(bal).toFixed(2)}</span>`;
                        })()}
                    </div>
                </div>
            </td>`;

        targetRow.insertAdjacentElement('afterend', detailRow);
    }

    async function load() {
        _injectListPane();
        try {
            const [coaRes, appData] = await Promise.all([
                callApi('/api/coa', {}, 'GET'),
                getAppData(),
            ]);
            _allAccounts = coaRes.data || [];
            _allLedger = Object.values(appData?.LEDGER || {});
            _renderList();
        } catch (err) {
            document.getElementById('vaultList').innerHTML = `<li class="text-center text-red-500 py-6">❌ ${err.message}</li>`;
        }
    }

    return { load, search, _showAccountDetail };
})();

window.VaultCOA = VaultCOA;
