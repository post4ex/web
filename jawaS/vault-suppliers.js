// ============================================================================
// VAULT-SUPPLIERS.JS — Suppliers list with inward LEDGER balance & statement
// Tile: suppliers
// Data source: appData.B2B (VENDOR type) + appData.LEDGER (INWARD direction)
// ============================================================================

const VaultSuppliers = (() => {

    let _allB2B    = [];
    let _allLedger = [];

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, name, mobile…';
    }

    let _balanceCache = null;

    function _precomputeBalances() {
        const cache = {};
        // Build sorted per-code list of ACTIVE+PENDING entries (most recent first)
        const sorted = [..._allLedger]
            .filter(e => e.DIRECTION === 'INWARD' && (e.STATUS === 'ACTIVE' || e.STATUS === 'PENDING'))
            .sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        for (const e of sorted) {
            const code = e.CODE;
            if (code && !(code in cache)) {
                cache[code] = +e.BALANCE || 0;
            }
        }
        _balanceCache = cache;
    }

    function _getLatestBalance(code) {
        if (_balanceCache && code in _balanceCache) return _balanceCache[code];
        return 0;
    }

    function _getStatementEntries(code) {
        const entries = _allLedger.filter(e =>
            e.CODE === code &&
            e.DIRECTION === 'INWARD' &&
            (e.STATUS === 'ACTIVE' || e.STATUS === 'PENDING')
        );
        entries.sort((a, b) => (a.ENTRY_DATE || 0) - (a.ENTRY_DATE || 0) ||
                                 (a.TIME_STAMP || 0) - (b.TIME_STAMP || 0));
        return entries;
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        let suppliers = _allB2B.filter(c => c.CODE && c.B2B_TYPE === 'VENDOR');
        if (q) {
            suppliers = suppliers.filter(c =>
                (c.CODE || '').toLowerCase().includes(q) ||
                (c.B2B_NAME || '').toLowerCase().includes(q) ||
                (c.MOBILE_NUMBER || '').toLowerCase().includes(q) ||
                (c.B2B_CITY || '').toLowerCase().includes(q)
            );
        }
        // Also include carrier vendors from LEDGER that have INWARD entries
        const carrierCodes = new Set(
            _allLedger.filter(e => e.DIRECTION === 'INWARD' && e.VENDOR_TYPE === 'CARRIER')
                      .map(e => e.CODE)
        );
        carrierCodes.forEach(code => {
            if (!suppliers.find(s => s.CODE === code)) {
                suppliers.push({ CODE: code, B2B_NAME: code, B2B_TYPE: 'VENDOR', _isCarrier: true });
            }
        });

        // Sort by outstanding balance descending
        suppliers.sort((a, b) => {
            const balA = Math.abs(_getLatestBalance(a.CODE));
            const balB = Math.abs(_getLatestBalance(b.CODE));
            return balB - balA;
        });

        if (!suppliers.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No suppliers found.</li>`;
            return;
        }
        ul.innerHTML = suppliers.map(c => {
            const balance = _getLatestBalance(c.CODE);
            const balClass = balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-gray-500';
            const tag = c._isCarrier ? '<span class="text-xs bg-orange-100 text-orange-700 px-1 rounded ml-1">CARRIER</span>' : '';
            return `<li data-code="${c.CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-orange-50 border border-gray-200 transition-colors">
                <strong class="text-orange-800 block text-sm">${c.B2B_NAME || c.CODE}${tag}</strong>
                <span class="text-xs text-gray-500">${c.CODE || ''} · ${c.MOBILE_NUMBER || ''} · ${c.B2B_CITY || ''}</span>
                <div class="text-xs mt-1">
                    <span class="${balClass} font-medium">${balance > 0 ? '₹' + balance.toFixed(2) + ' owed' : balance < 0 ? '₹' + Math.abs(balance).toFixed(2) + ' in debit' : '₹0.00'}</span>
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                const code = li.dataset.code;
                const supplier = _allB2B.find(c => c.CODE === code) || { CODE: code, B2B_NAME: code };
                _renderDetail(supplier, code);
            })
        );
    }

    function search() { _renderList(); }

    function _renderDetail(supplier, code) {
        VaultPage.showDetail(true);
        const entries = _getStatementEntries(code);
        const balance = _getLatestBalance(code);

        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${supplier?.B2B_NAME || code}</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div><span class="text-gray-500">Code:</span> ${code}</div>
                        <div><span class="text-gray-500">GST:</span> ${supplier?.GST_CODE || supplier?.ID_GST_PAN_ADHAR || 'N/A'}</div>
                        <div><span class="text-gray-500">Mobile:</span> ${supplier?.MOBILE_NUMBER || 'N/A'}</div>
                        <div><span class="text-gray-500">City:</span> ${supplier?.B2B_CITY || supplier?.B2B_STATE || 'N/A'}</div>
                        <div class="col-span-2"><span class="text-gray-500">Address:</span> ${supplier?.B2B_ADDRESS || 'N/A'}</div>
                        <div><span class="text-gray-500">Type:</span> ${supplier?._isCarrier ? 'CARRIER' : supplier?.B2B_TYPE || 'VENDOR'}</div>
                        <div class="text-right"><span class="text-gray-500">Outstanding:</span> <strong class="${balance > 0 ? 'text-red-600' : 'text-green-600'}">₹${balance.toFixed(2)}</strong></div>
                    </div>
                </div>
            </div>

            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Quick Statement (${entries.length} entries)</h3></div>
                <div class="detail-card-body p-0">
                    ${entries.length ? `
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-xs divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Date</th>
                                    <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Type</th>
                                    <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Ref</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Debit</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Credit</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-500 uppercase">Balance</th>
                                    <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                ${entries.map(e => {
                                    const typeLabel = e.ENTRY_TYPE === 'INVOICE' ? (e.VENDOR_TYPE === 'CARRIER' ? 'CAR-INV' : 'PUR-INV') :
                                                      e.ENTRY_TYPE === 'PAYMENT' ? (e.VENDOR_TYPE === 'CARRIER' ? 'CAR-PMT' : 'PUR-PMT') :
                                                      e.ENTRY_TYPE === 'JOURNAL' ? (e.JOURNAL_TYPE === 'CREDIT_NOTE' ? 'CN' : e.JOURNAL_TYPE === 'DEBIT_NOTE' ? 'DN' : 'JR') :
                                                      e.ENTRY_TYPE || '—';
                                    const ref = e.INV_NUMBER || e.INVOICE_ID || '';
                                    const vendTag = e.VENDOR_TYPE ? `<span class="text-xs text-gray-400">[${e.VENDOR_TYPE}]</span>` : '';
                                    return `<tr class="${e.STATUS === 'PENDING' ? 'bg-yellow-50' : ''}">
                                        <td class="px-3 py-2 whitespace-nowrap">${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''}</td>
                                        <td class="px-3 py-2"><span class="font-medium">${typeLabel}</span> ${vendTag}</td>
                                        <td class="px-3 py-2 text-gray-500">${ref}</td>
                                        <td class="px-3 py-2 text-right text-red-600">${+e.DEBIT > 0 ? '₹' + (+e.DEBIT).toFixed(2) : ''}</td>
                                        <td class="px-3 py-2 text-right text-green-600">${+e.CREDIT > 0 ? '₹' + (+e.CREDIT).toFixed(2) : ''}</td>
                                        <td class="px-3 py-2 text-right font-medium">₹${(+e.BALANCE||0).toFixed(2)}</td>
                                        <td class="px-3 py-2"><span class="${e.STATUS === 'ACTIVE' ? 'text-green-600' : e.STATUS === 'PENDING' ? 'text-yellow-600' : 'text-gray-400'}">${e.STATUS || ''}</span></td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>` : `
                    <div class="text-center py-8 text-gray-400 text-sm">No inward ledger entries for this supplier.</div>`}
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data) {
            _allB2B    = Object.values(data.B2B    || {});
            _allLedger = Object.values(data.LEDGER || {});
            _precomputeBalances();
            _renderList();
        }
    }

    return { load, search };
})();

window.VaultSuppliers = VaultSuppliers;
