// ============================================================================
// VAULT-SUPPLIERS.JS — Suppliers list with inward LEDGER balance & statement
// Tile: suppliers
// Data source: appData.B2B (VENDOR type) + appData.LEDGER (INWARD direction)
// ============================================================================

const VaultSuppliers = (() => {

    let _allB2B    = [];
    let _allLedger = [];

    // ── Parse NARRATION for charge breakdown ─────────────────────────────────
    function _parseNarration(entry) {
        try {
            const p = JSON.parse(entry.NARRATION || '{}');
            if (p.charges || p.grand_total !== undefined) return p;
        } catch (_) {}
        return null;
    }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, name, mobile…';
    }

    let _balanceCache = null;

    function _precomputeBalances() {
        const cache = {};
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

    function _getStatementEntries(code, dateRange) {
        let entries = _allLedger.filter(e =>
            e.CODE === code &&
            e.DIRECTION === 'INWARD'
            // VOID entries included in statement (visible as part of history)
        );
        entries.sort((a, b) => (a.ENTRY_DATE || 0) - (a.ENTRY_DATE || 0) ||
                                 (a.TIME_STAMP || 0) - (b.TIME_STAMP || 0));

        if (dateRange && dateRange !== 'all') {
            const now = Date.now();
            const cutoff = dateRange === '30' ? now - 30 * 86400000 :
                           dateRange === '90' ? now - 90 * 86400000 : 0;
            if (cutoff) {
                entries = entries.filter(e => (e.ENTRY_DATE || 0) >= cutoff);
            }
        }
        return entries;
    }

    function _computeSummary(code) {
        const entries = _allLedger.filter(e =>
            e.CODE === code &&
            e.DIRECTION === 'INWARD' &&
            (e.STATUS === 'ACTIVE' || e.STATUS === 'PENDING')
        );
        const bills = entries.filter(e => e.ENTRY_TYPE === 'INVOICE' && e.STATUS === 'ACTIVE');
        const payments = entries.filter(e => e.ENTRY_TYPE === 'PAYMENT' && e.STATUS === 'ACTIVE');
        const totalBilled = bills.reduce((s, e) => s + (+e.CREDIT || 0), 0);
        const totalPaid = payments.reduce((s, e) => s + (+e.DEBIT || 0), 0);
        const lastEntry = entries.length ? entries[entries.length - 1] : null;
        return {
            billCount: bills.length,
            paymentCount: payments.length,
            totalBilled,
            totalPaid,
            lastDate: lastEntry ? lastEntry.ENTRY_DATE : null,
        };
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        let suppliers = _allB2B.filter(c => c.CODE && c.B2B_TYPE === 'VENDOR');
        const activeBranch = VaultPage.getActiveBranch();
        if (activeBranch) {
            suppliers = suppliers.filter(c => (c.BRANCH || '').toLowerCase() === activeBranch.toLowerCase());
        }
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
            _allLedger.filter(e => e.DIRECTION === 'INWARD' && ((e.B2B_TYPE || e.VENDOR_TYPE) === 'CARRIER') && (!activeBranch || (e.BRANCH || '').toLowerCase() === activeBranch.toLowerCase()))
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

    function _printStatement(code) {
        const supplier = _allB2B.find(c => c.CODE === code) || { CODE: code, B2B_NAME: code };
        const entries = _getStatementEntries(code, 'all');
        const balance = _getLatestBalance(code);
        VaultPrint.printStatement(supplier, code, entries, balance, 'Supplier');
    }

    function search() { _renderList(); }

    // ── Statement charge breakdown popup ────────────────────────────────────
    function _renderChargePopup(entry) {
        const parsed = _parseNarration(entry);
        if (!parsed) return '';
        const charges = parsed.charges || {};
        const chgNames = {fright:'Freight',fuel_chg:'Fuel',cod_chg:'COD',topay_chg:'ToPay',
                         fov_chg:'FOV',eway_chg:'E-Way',awb_chg:'AWB',pack_chg:'Packing',dev_chg:'Dev'};
        const chargeRows = Object.keys(chgNames)
            .filter(k => (charges[k]||0) > 0)
            .map(k => `<div class="flex justify-between text-xs"><span class="text-gray-500">${chgNames[k]}</span><span>₹${(+charges[k]).toFixed(2)}</span></div>`)
            .join('');
        const total = (parsed.grand_total || 0);
        const taxAmt = (+parsed.sgst||0) + (+parsed.cgst||0) + (+parsed.igst||0);
        return chargeRows ? `
            <div class="bg-gray-50 rounded p-2 mt-1 border text-xs space-y-0.5">
                ${chargeRows}
                ${taxAmt > 0 ? `<hr class="border-gray-200 my-0.5"><div class="flex justify-between text-xs"><span class="text-gray-500">Tax</span><span>₹${taxAmt.toFixed(2)}</span></div>` : ''}
                <hr class="border-gray-200 my-0.5">
                <div class="flex justify-between text-xs font-semibold"><span>Total</span><span>₹${total.toFixed(2)}</span></div>
            </div>` : '';
    }

    function _renderDetail(supplier, code) {
        VaultPage.showDetail(true);
        const entries = _getStatementEntries(code, 'all');
        const balance = _getLatestBalance(code);
        const summary = _computeSummary(code);

        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="space-y-4">
                <!-- Summary Bar -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div class="text-xs text-gray-500 uppercase tracking-wider">Outstanding</div>
                        <div class="text-lg font-bold ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-gray-700'}">₹${balance.toFixed(2)}</div>
                    </div>
                    <div class="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div class="text-xs text-gray-500 uppercase tracking-wider">Bills</div>
                        <div class="text-lg font-bold text-orange-700">${summary.billCount}</div>
                    </div>
                    <div class="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div class="text-xs text-gray-500 uppercase tracking-wider">Payments</div>
                        <div class="text-lg font-bold text-green-700">${summary.paymentCount}</div>
                    </div>
                    <div class="bg-white rounded-lg border border-gray-200 p-3 text-center">
                        <div class="text-xs text-gray-500 uppercase tracking-wider">Total Billed</div>
                        <div class="text-lg font-bold text-gray-700">₹${summary.totalBilled.toFixed(2)}</div>
                    </div>
                </div>

                <!-- Supplier Detail Card -->
                <div class="detail-card">
                    <div class="detail-card-header flex justify-between items-center">
                        <h3 class="font-semibold text-gray-700">${supplier?.B2B_NAME || code}</h3>
                        <button onclick="VaultSuppliers._printStatement('${code}')" class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> Print</button>
                    </div>
                    <div class="detail-card-body">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <!-- Left: Basic Info -->
                            <div class="bg-orange-50/50 rounded-lg p-3 border border-orange-100">
                                <div class="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2">Basic Info</div>
                                <div class="grid grid-cols-2 gap-2 text-sm">
                                    <div><span class="text-gray-500 text-xs">Code:</span><br><span class="font-medium">${code}</span></div>
                                    <div><span class="text-gray-500 text-xs">GST:</span><br><span class="font-mono text-xs">${supplier?.ID_GST_PAN_ADHAR || supplier?.GST_CODE || 'N/A'}</span></div>
                                    <div><span class="text-gray-500 text-xs">Phone:</span><br>${supplier?.MOBILE_NUMBER || 'N/A'}</div>
                                    <div><span class="text-gray-500 text-xs">Email:</span><br>${supplier?.EMAIL || supplier?.B2B_EMAIL || 'N/A'}</div>
                                    <div><span class="text-gray-500 text-xs">State Code:</span><br>${supplier?.CODE_STATE || supplier?.STATE_CODE || 'N/A'}</div>
                                    <div><span class="text-gray-500 text-xs">PIN:</span><br>${supplier?.PIN_CODE || supplier?.B2B_PIN || 'N/A'}</div>
                                    <div><span class="text-gray-500 text-xs">Branch:</span><br>${supplier?.BRANCH || 'N/A'}</div>
                                    <div><span class="text-gray-500 text-xs">Type:</span><br><span class="font-medium">${supplier?._isCarrier ? 'CARRIER' : supplier?.B2B_TYPE || 'VENDOR'}</span></div>
                                </div>
                            </div>
                            <!-- Right: Address & Terms -->
                            <div class="space-y-3">
                                <div class="bg-yellow-50/50 rounded-lg p-3 border border-yellow-100">
                                    <div class="text-xs font-semibold text-yellow-600 uppercase tracking-wider mb-2">Address</div>
                                    <div class="text-sm text-gray-700">${supplier?.B2B_ADDRESS || 'N/A'}</div>
                                    <div class="text-sm text-gray-500">${[supplier?.B2B_CITY, supplier?.B2B_STATE, supplier?.B2B_PIN].filter(Boolean).join(', ') || ''}</div>
                                </div>
                                <div class="bg-purple-50/50 rounded-lg p-3 border border-purple-100">
                                    <div class="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">Terms</div>
                                    <div class="grid grid-cols-2 gap-2 text-xs">
                                        <div><span class="text-gray-500">Payment Terms:</span><br><span class="font-medium">${supplier?.PAYMENT_TERMS || supplier?.CREDIT_TERMS || 'Standard'}</span></div>
                                        <div><span class="text-gray-500">Credit Limit:</span><br><span class="font-medium">${supplier?.CREDIT_LIMIT ? '₹' + (+supplier.CREDIT_LIMIT).toFixed(2) : 'Unlimited'}</span></div>
                                        <div><span class="text-gray-500">Status:</span><br><span class="font-medium ${supplier?.ACTIVE_STATUS === 'ACTIVE' ? 'text-green-600' : 'text-red-600'}">${supplier?.ACTIVE_STATUS || 'ACTIVE'}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="mt-3 text-xs text-gray-400">
                            Last transaction: ${summary.lastDate ? fmtDate(summary.lastDate) : 'N/A'}
                            · Total billed: ₹${summary.totalBilled.toFixed(2)}
                            · Total paid: ₹${summary.totalPaid.toFixed(2)}
                        </div>
                    </div>
                </div>

                <!-- Statement Card -->
                <div class="detail-card">
                    <div class="detail-card-header flex justify-between items-center">
                        <h3 class="font-semibold text-gray-700">Statement (${entries.length} entries)</h3>
                        <div class="flex gap-1 text-xs">
                            <button class="stmt-filter px-2 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-orange-50 hover:border-orange-300 font-medium" data-range="30">30d</button>
                            <button class="stmt-filter px-2 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-orange-50 hover:border-orange-300 font-medium" data-range="90">90d</button>
                            <button class="stmt-filter px-2 py-1 rounded border border-orange-500 bg-orange-500 text-white font-medium" data-range="all">All</button>
                        </div>
                    </div>
                    <div class="detail-card-body p-0">
                        <div id="suppStatementBody">
                            ${_renderStatementTable(code, 'all')}
                        </div>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();

        // Wire statement filters
        view.querySelectorAll('.stmt-filter').forEach(btn =>
            btn.addEventListener('click', () => {
                view.querySelectorAll('.stmt-filter').forEach(b => {
                    b.className = 'stmt-filter px-2 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-orange-50 hover:border-orange-300 font-medium';
                });
                btn.className = 'stmt-filter px-2 py-1 rounded border border-orange-500 bg-orange-500 text-white font-medium';
                const range = btn.dataset.range;
                document.getElementById('suppStatementBody').innerHTML = _renderStatementTable(code, range);
            })
        );
    }

    function _renderStatementTable(code, dateRange) {
        const entries = _getStatementEntries(code, dateRange);
        const balance = _getLatestBalance(code);

        // Compute opening balance
        let openingBalance = 0;
        if (dateRange && dateRange !== 'all') {
            const now = Date.now();
            const cutoff = dateRange === '30' ? now - 30 * 86400000 :
                           dateRange === '90' ? now - 90 * 86400000 : 0;
            if (cutoff) {
                const priorActive = _allLedger.filter(e =>
                    e.CODE === code &&
                    e.DIRECTION === 'INWARD' &&
                    (e.STATUS === 'ACTIVE' || e.STATUS === 'PENDING') &&
                    (e.ENTRY_DATE || 0) < cutoff
                );
                const prior = priorActive;
                prior.sort((a, b) => (a.ENTRY_DATE || 0) - (a.ENTRY_DATE || 0) ||
                                       (a.TIME_STAMP || 0) - (b.TIME_STAMP || 0));
                if (prior.length) openingBalance = +prior[prior.length - 1].BALANCE || 0;
            }
        }

        if (!entries.length) {
            return `<div class="text-center py-8 text-gray-400 text-sm">No inward ledger entries found.</div>`;
        }

        return `
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
                        ${openingBalance !== 0 ? `
                        <tr class="bg-gray-50 text-gray-500">
                            <td class="px-3 py-2" colspan="4"></td>
                            <td class="px-3 py-2 text-right font-medium">Opening</td>
                            <td class="px-3 py-2 text-right font-medium">₹${openingBalance.toFixed(2)}</td>
                            <td class="px-3 py-2"></td>
                        </tr>` : ''}
                        ${entries.map(e => {
                            const typeLabel = e.ENTRY_TYPE === 'INVOICE' ? (e.B2B_TYPE === 'CARRIER' ? 'CAR-INV' : 'PUR-INV') :
                                              e.ENTRY_TYPE === 'PAYMENT' ? (e.B2B_TYPE === 'CARRIER' ? 'CAR-PMT' : 'PUR-PMT') :
                                              e.ENTRY_TYPE === 'JOURNAL' ? (e.JOURNAL_TYPE === 'CREDIT_NOTE' ? 'CN' : e.JOURNAL_TYPE === 'DEBIT_NOTE' ? 'DN' : 'JR') :
                                              e.ENTRY_TYPE || '—';
                            const ref = e.INV_NUMBER || e.INVOICE_ID || '';
                            const parsed = _parseNarration(e);
                            const showCharges = parsed && parsed.grand_total !== undefined;
                            const isVoidRow = e.STATUS === 'VOID';
                            return `<tr class="${e.STATUS === 'PENDING' ? 'bg-yellow-50' : ''} ${isVoidRow ? 'opacity-50 line-through text-gray-400' : 'hover:bg-gray-50'}">
                                <td class="px-3 py-2 whitespace-nowrap">${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''}</td>
                                <td class="px-3 py-2">
                                    <span class="font-medium">${typeLabel}</span>
                                    ${isVoidRow ? '<span class="ml-1 px-1 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : ''}
                                    ${showCharges && !isVoidRow ? `<button onclick="this.nextElementSibling.classList.toggle('hidden')" class="ml-1 text-orange-500 hover:text-orange-700"><svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>` : ''}
                                    ${showCharges && !isVoidRow ? `<div class="hidden">${_renderChargePopup(e)}</div>` : ''}
                                </td>
                                <td class="px-3 py-2 text-gray-500">${ref}</td>
                                <td class="px-3 py-2 text-right ${isVoidRow ? 'text-gray-400' : 'text-red-600'}">${+e.DEBIT > 0 ? '₹' + (+e.DEBIT).toFixed(2) : ''}</td>
                                <td class="px-3 py-2 text-right ${isVoidRow ? 'text-gray-400' : 'text-green-600'}">${+e.CREDIT > 0 ? '₹' + (+e.CREDIT).toFixed(2) : ''}</td>
                                <td class="px-3 py-2 text-right font-medium ${isVoidRow ? 'text-gray-400' : ''}">₹${(+e.BALANCE||0).toFixed(2)}</td>
                                <td class="px-3 py-2"><span class="${e.STATUS === 'ACTIVE' ? 'text-green-600' : e.STATUS === 'PENDING' ? 'text-yellow-600' : 'text-red-400'}">${e.STATUS || ''}</span></td>
                            </tr>`;
                        }).join('')}
                        <tr class="bg-gray-50 font-semibold">
                            <td class="px-3 py-2" colspan="4"></td>
                            <td class="px-3 py-2 text-right">Closing</td>
                            <td class="px-3 py-2 text-right ${balance > 0 ? 'text-red-600' : 'text-green-600'}">₹${balance.toFixed(2)}</td>
                            <td class="px-3 py-2"></td>
                        </tr>
                    </tbody>
                </table>
            </div>`;
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

    return { load, search, _printStatement };
})();

window.VaultSuppliers = VaultSuppliers;
