// ============================================================================
// VAULT-SUMMARY.JS — Dashboard, Reports, Bank Recon, Bulk Import
// Tiles: summary, reports, bank-recon, bulk-import
// API: GET /api/ledger/summary, /profit-loss, /balance-sheet, /aging
//      POST /api/ledger/bulk-import
// ============================================================================

const VaultSummary = (() => {

    let _allLEDGER = [];
    let _allB2B    = [];
    let _activeView = 'summary';

    function _can(role) { return window.VaultPage?.can(role); }

    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    function _injectListPane(placeholder = 'Search client code or name…') {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = placeholder;
    }

    function _renderSummaryList(entries) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const latest = {};
        const sorted = [...(entries || [])].sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        sorted.forEach(e => {
            if (e.DIRECTION === 'OUTWARD' && e.STATUS === 'ACTIVE' && e.CODE) {
                if (!latest[e.CODE]) latest[e.CODE] = e;
            }
        });
        const codes = Object.values(latest).sort((a, b) => (b.BALANCE || 0) - (a.BALANCE || 0));
        if (!codes.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No outstanding balances.</li>';
            return;
        }
        ul.innerHTML = codes.map(e => {
            const bal = (+e.BALANCE || 0);
            const name = e.CLIENT_NAME || '';
            return `<li data-code="${e.CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 border border-gray-200 transition-colors">
                <strong class="text-gray-800 block text-sm">${e.CODE}</strong>
                <span class="text-xs text-gray-500">${name}</span>
                <div class="text-xs font-semibold mt-1 ${bal >= 0 ? 'text-red-600' : 'text-green-600'}">₹${Math.abs(bal).toFixed(2)} ${bal >= 0 ? 'Dr' : 'Cr'}</div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _showStatement(li.dataset.code);
            })
        );
    }

    function search(q) {
        const lq = q.toLowerCase();
        _renderSummaryList(_allLEDGER.filter(e =>
            (e.CODE || '').toLowerCase().includes(lq) ||
            (e.CLIENT_NAME || '').toLowerCase().includes(lq)
        ));
    }

    // ── Statement View ────────────────────────────────────────────────────────
    async function _showStatement(code) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">Loading statement…</div>';
        try {
            const res = await callApi(`/api/ledger/statement?code=${code}`, {}, 'GET');
            _renderStatement(res);
        } catch (err) {
            view.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed'}</div>`;
        }
        VaultPage.showDetailPane();
    }

    function _renderStatement(data) {
        const entries = data.entries || [];
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">${data.code}</h3>
                    <p class="text-sm text-gray-500">${data.client_name || ''}</p>
                </div>
                <div class="text-right">
                    <div class="text-xs text-gray-500">Opening Balance</div>
                    <div class="text-sm font-semibold">₹${(+data.opening_balance).toFixed(2)}</div>
                    <div class="text-xs text-gray-500 mt-1">Closing Balance</div>
                    <div class="text-lg font-bold ${(+data.closing_balance) >= 0 ? 'text-red-600' : 'text-green-600'}">₹${(+data.closing_balance).toFixed(2)}</div>
                </div>
            </div>
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Ledger Entries (${entries.length})</h3></div>
                <div class="detail-card-body overflow-x-auto">
                    ${entries.length ? `<table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-2">Date</th><th class="px-2 py-2">Type</th>
                            <th class="px-2 py-2">Inv#</th><th class="px-2 py-2 text-right">Debit</th>
                            <th class="px-2 py-2 text-right">Credit</th><th class="px-2 py-2 text-right">Balance</th>
                            <th class="px-2 py-2">Narration</th>
                        </tr></thead>
                        <tbody>${entries.map(e => {
                            const typeIcons = { 'INVOICE': '🧾', 'PAYMENT': '💰', 'JOURNAL': '✏️', 'EXPENSE': '💸' };
                            return `<tr class="border-b hover:bg-gray-50">
                                <td class="px-2 py-2 whitespace-nowrap">${_fmt(e.ENTRY_DATE, 'date')}</td>
                                <td class="px-2 py-2">${typeIcons[e.ENTRY_TYPE] || ''} ${e.ENTRY_TYPE}</td>
                                <td class="px-2 py-2">${e.INV_NUMBER || e.JOURNAL_TYPE || '-'}</td>
                                <td class="px-2 py-2 text-right">${(+e.DEBIT||0).toFixed(2)}</td>
                                <td class="px-2 py-2 text-right">${(+e.CREDIT||0).toFixed(2)}</td>
                                <td class="px-2 py-2 text-right font-semibold">${(+e.BALANCE||0).toFixed(2)}</td>
                                <td class="px-2 py-2 text-gray-500 max-w-[200px] truncate">${e.NARRATION || ''}</td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table>` : '<p class="text-gray-400 text-sm text-center py-4">No entries found.</p>'}
                </div>
            </div>`;

        if (window.innerWidth < 768 && entries.length) {
            const cards = entries.map(e => `
                <div class="border border-gray-200 rounded-lg p-3 text-xs space-y-1">
                    <div class="flex justify-between font-semibold">
                        <span>${_fmt(e.ENTRY_DATE, 'date')}</span>
                        <span class="${(+e.BALANCE||0) >= 0 ? 'text-red-600' : 'text-green-600'}">₹${(+e.BALANCE||0).toFixed(2)}</span>
                    </div>
                    <div class="text-gray-600">${e.ENTRY_TYPE} ${e.INV_NUMBER ? '- ' + e.INV_NUMBER : ''}</div>
                    <div class="flex gap-3 text-gray-500">
                        <span>Dr: ₹${(+e.DEBIT||0).toFixed(2)}</span>
                        <span>Cr: ₹${(+e.CREDIT||0).toFixed(2)}</span>
                    </div>
                    <div class="text-gray-400 truncate">${e.NARRATION || ''}</div>
                </div>`).join('');
            view.innerHTML += `<div class="md:hidden space-y-2 mt-4">${cards}</div>`;
        }
        VaultPage.showDetailPane();
    }

    // ── Period picker helper ──────────────────────────────────────────────────
    function _periodOptions(currentFY, selectedPeriod) {
        const months = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
        const [fyStart] = currentFY.split('-');
        const startYear = parseInt(fyStart);
        const options = [];
        // Quarterly
        options.push({ value: `Q1-${currentFY}`, label: `Q1 (Apr-Jun ${currentFY})` });
        options.push({ value: `Q2-${currentFY}`, label: `Q2 (Jul-Sep ${currentFY})` });
        options.push({ value: `Q3-${currentFY}`, label: `Q3 (Oct-Dec ${currentFY})` });
        options.push({ value: `Q4-${currentFY}`, label: `Q4 (Jan-Mar ${startYear + 1})` });
        // Monthly
        for (let i = 0; i < 12; i++) {
            const m = (3 + i) % 12; // Apr=index 3 in calendar, index 0 here
            const year = m < 3 ? startYear + 1 : startYear;
            options.push({ value: `${m + 1}-${year}`, label: `${months[m]} ${year}` });
        }
        return options.map(o =>
            `<option value="${o.value}" ${o.value === selectedPeriod ? 'selected' : ''}>${o.label}</option>`
        ).join('');
    }

    function _periodToDates(period) {
        // Q1-2025-26 or 4-2025 (month-year)
        const now = new Date();
        if (period && period.startsWith('Q')) {
            const parts = period.split('-');
            const q = parseInt(parts[0][1]);
            const fy = parts.slice(1).join('-');
            const [fyStart] = fy.split('-');
            const sy = parseInt(fyStart);
            const qMonths = { 1: [4, 6], 2: [7, 9], 3: [10, 12], 4: [1, 3] };
            const [sm, em] = qMonths[q] || [4, 6];
            const syr = q === 4 ? sy + 1 : sy;
            const eyr = q === 4 ? sy + 1 : sy;
            return {
                from: new Date(syr, sm - 1, 1).getTime(),
                to: new Date(eyr, em, 0, 23, 59, 59).getTime()
            };
        }
        if (period) {
            const [m, y] = period.split('-');
            return {
                from: new Date(parseInt(y), parseInt(m) - 1, 1).getTime(),
                to: new Date(parseInt(y), parseInt(m), 0, 23, 59, 59).getTime()
            };
        }
        // Default: current month
        return {
            from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
            to: now.getTime()
        };
    }

    // ── TILE: Summary Dashboard ──────────────────────────────────────────────
    async function showDashboard() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">Loading summary…</div>';

        try {
            const [outRes, inRes, cashRes, agingRes] = await Promise.all([
                callApi('/api/ledger/summary', {}, 'GET').catch(() => ({ data: [] })),
                callApi('/api/ledger/inward/summary', {}, 'GET').catch(() => ({ data: [] })),
                callApi('/api/ledger/cash', {}, 'GET').catch(() => ({ data: [] })),
                callApi('/api/ledger/aging', {}, 'GET').catch(() => ({ buckets: {}, total_outstanding: 0 })),
            ]);

            const outData = outRes.data || [];
            const inData = inRes.data || [];
            const cashData = cashRes.data || [];
            const aging = agingRes.buckets || {};
            const agingKeys = ['0-30', '31-60', '61-90', '91+'];

            const totalOutstanding = outData.reduce((s, d) => s + (+d.balance || 0), 0);
            const totalInward = inData.reduce((s, d) => s + (+d.balance || 0), 0);
            const totalCash = cashData.reduce((s, d) => s + Math.max(0, +d.balance || 0), 0);
            const topDebtors = [...outData].sort((a, b) => (+b.balance || 0) - (+a.balance || 0)).slice(0, 5);
            const agingTotal = agingKeys.reduce((s, k) => s + (aging[k]?.total || 0), 0);

            view.innerHTML = `
                <!-- KPI Cards -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Total Outstanding</div>
                        <div class="text-xl font-bold text-red-600 mt-1">₹${totalOutstanding.toFixed(2)}</div>
                        <div class="text-xs text-gray-400 mt-1">${outData.length} clients</div>
                    </div>
                    <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Vendor Dues</div>
                        <div class="text-xl font-bold text-orange-600 mt-1">₹${totalInward.toFixed(2)}</div>
                        <div class="text-xs text-gray-400 mt-1">${inData.length} vendors</div>
                    </div>
                    <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Cash in Hand</div>
                        <div class="text-xl font-bold text-green-600 mt-1">₹${totalCash.toFixed(2)}</div>
                        <div class="text-xs text-gray-400 mt-1">${cashData.length} holders</div>
                    </div>
                    <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div class="text-xs text-gray-500 uppercase font-semibold tracking-wide">Overdue Total</div>
                        <div class="text-xl font-bold text-purple-600 mt-1">₹${agingTotal.toFixed(2)}</div>
                        <div class="text-xs text-gray-400 mt-1">Aging report</div>
                    </div>
                </div>

                <!-- Aging Summary -->
                <div class="detail-card mb-4">
                    <div class="detail-card-header">
                        <div class="flex justify-between items-center">
                            <h3 class="font-semibold text-gray-700">📅 Aging Summary</h3>
                            <span class="text-xs text-gray-500">Total overdue: ₹${agingTotal.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="detail-card-body">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            ${agingKeys.map(k => {
                                const bucket = aging[k] || { total: 0, count: 0 };
                                const colors = { '0-30': 'bg-green-50 border-green-200 text-green-700', '31-60': 'bg-yellow-50 border-yellow-200 text-yellow-700', '61-90': 'bg-orange-50 border-orange-200 text-orange-700', '91+': 'bg-red-50 border-red-200 text-red-700' };
                                return `<div class="rounded-lg border p-3 ${colors[k] || ''}">
                                    <div class="text-xs font-semibold uppercase">${k} days</div>
                                    <div class="text-lg font-bold mt-1">₹${bucket.total.toFixed(2)}</div>
                                    <div class="text-xs opacity-75">${bucket.count} codes</div>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>

                <!-- Top Debtors -->
                <div class="detail-card mb-4">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Top Outstanding Clients</h3></div>
                    <div class="detail-card-body overflow-x-auto">
                        ${topDebtors.length ? `<table class="min-w-full text-sm">
                            <thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr>
                                <th class="px-3 py-2">Client</th><th class="px-3 py-2">Name</th><th class="px-3 py-2 text-right">Outstanding</th>
                            </tr></thead>
                            <tbody>${topDebtors.map(d => `<tr class="border-b cursor-pointer hover:bg-gray-50" onclick="VaultSummary._showStatement('${d.code}')">
                                <td class="px-3 py-2 font-medium">${d.code}</td>
                                <td class="px-3 py-2 text-gray-600">${d.client_name || ''}</td>
                                <td class="px-3 py-2 text-right font-semibold text-red-600">₹${(+d.balance).toFixed(2)}</td>
                            </tr>`).join('')}</tbody>
                        </table>` : '<p class="text-gray-400 text-sm">No data</p>'}
                    </div>
                </div>

                <!-- Cash Holders -->
                <div class="detail-card">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Cash Holders</h3></div>
                    <div class="detail-card-body overflow-x-auto">
                        ${cashData.length ? `<table class="min-w-full text-sm">
                            <thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr>
                                <th class="px-3 py-2">Holder</th><th class="px-3 py-2 text-right">Balance</th>
                            </tr></thead>
                            <tbody>${cashData.map(d => `<tr class="border-b">
                                <td class="px-3 py-2">${d.holder}</td>
                                <td class="px-3 py-2 text-right font-semibold ${d.balance >= 0 ? 'text-green-700' : 'text-red-700'}">₹${(+d.balance).toFixed(2)}</td>
                            </tr>`).join('')}</tbody>
                        </table>` : '<p class="text-gray-400 text-sm">No cash data</p>'}
                    </div>
                </div>`;
            VaultPage.showDetailPane();
        } catch (err) {
            view.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed to load summary'}</div>`;
            VaultPage.showDetailPane();
        }
    }

    // ── TILE: Reports Hub (P&L, Balance Sheet, Aging) ────────────────────────
    function showReports() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const now = new Date();
        const currentFY = now.getMonth() >= 3 ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}` : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`;

        view.innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📊 Reports</h3></div>
                <div class="detail-card-body">
                    <div class="flex gap-2 mb-4 flex-wrap">
                        <button data-report="pl" class="report-tab px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">📈 P&L</button>
                        <button data-report="bs" class="report-tab px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors">📋 Balance Sheet</button>
                        <button data-report="aging" class="report-tab px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors">📅 Aging</button>
                    </div>
                    <div id="reportContent">
                        <p class="text-gray-400 text-sm text-center py-8">Select a report above to generate.</p>
                    </div>
                </div>
            </div>`;

        // Period selector for P&L
        view.querySelectorAll('.report-tab').forEach(btn => {
            btn.addEventListener('click', async () => {
                view.querySelectorAll('.report-tab').forEach(b => {
                    b.className = b.className.replace('bg-indigo-600 text-white', 'bg-gray-200 text-gray-700');
                });
                btn.className = btn.className.replace('bg-gray-200 text-gray-700', 'bg-indigo-600 text-white');
                const report = btn.dataset.report;
                if (report === 'pl') await _showPL(currentFY);
                else if (report === 'bs') await _showBalanceSheet();
                else if (report === 'aging') await _showAgingReport();
            });
        });
        VaultPage.showDetailPane();
    }

    async function _showPL(currentFY) {
        const rc = document.getElementById('reportContent');
        const now = new Date();
        const currentPeriod = `${now.getMonth() + 1}-${now.getFullYear()}`;
        rc.innerHTML = `
            <div class="flex items-center gap-3 mb-4">
                <select id="plPeriod" class="form-input text-sm w-auto">${_periodOptions(currentFY, currentPeriod)}</select>
                <button id="plLoadBtn" class="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors">Load</button>
            </div>
            <div id="plResult"><p class="text-gray-400 text-sm text-center py-8">Select a period and click Load.</p></div>`;
        document.getElementById('plLoadBtn').addEventListener('click', async () => {
            const period = document.getElementById('plPeriod').value;
            const dates = _periodToDates(period);
            const result = document.getElementById('plResult');
            result.innerHTML = '<div class="text-center text-gray-400 py-8">Loading…</div>';
            try {
                const res = await callApi(`/api/ledger/profit-loss?from_date=${dates.from}&to_date=${dates.to}`, {}, 'GET');
                result.innerHTML = `
                    <div class="grid grid-cols-3 gap-3 mb-4">
                        <div class="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
                            <div class="text-xs text-gray-500 uppercase">Income</div>
                            <div class="text-lg font-bold text-green-700">₹${res.income_total.toFixed(2)}</div>
                        </div>
                        <div class="p-3 bg-red-50 rounded-lg border border-red-200 text-center">
                            <div class="text-xs text-gray-500 uppercase">Expenses</div>
                            <div class="text-lg font-bold text-red-700">₹${res.expense_total.toFixed(2)}</div>
                        </div>
                        <div class="p-3 ${res.net_profit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} rounded-lg border text-center">
                            <div class="text-xs text-gray-500 uppercase">Net ${res.net_profit >= 0 ? 'Profit' : 'Loss'}</div>
                            <div class="text-lg font-bold ${res.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}">₹${Math.abs(res.net_profit).toFixed(2)}</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="detail-card">
                            <div class="detail-card-header"><h4 class="font-semibold text-green-700 text-sm">Income</h4></div>
                            <div class="detail-card-body max-h-60 overflow-y-auto">
                                ${res.income_lines.length ? res.income_lines.map(l =>
                                    `<div class="flex justify-between py-1 border-b border-gray-100 text-sm">
                                        <span><span class="text-gray-500 font-mono text-xs">${l.code}</span> ${l.name}</span>
                                        <span class="font-semibold text-green-700">₹${l.amount.toFixed(2)}</span>
                                    </div>`
                                ).join('') : '<p class="text-gray-400 text-sm text-center py-4">No income entries</p>'}
                            </div>
                        </div>
                        <div class="detail-card">
                            <div class="detail-card-header"><h4 class="font-semibold text-red-700 text-sm">Expenses</h4></div>
                            <div class="detail-card-body max-h-60 overflow-y-auto">
                                ${res.expense_lines.length ? res.expense_lines.map(l =>
                                    `<div class="flex justify-between py-1 border-b border-gray-100 text-sm">
                                        <span><span class="text-gray-500 font-mono text-xs">${l.code}</span> ${l.name}</span>
                                        <span class="font-semibold text-red-700">₹${l.amount.toFixed(2)}</span>
                                    </div>`
                                ).join('') : '<p class="text-gray-400 text-sm text-center py-4">No expense entries</p>'}
                            </div>
                        </div>
                    </div>`;
            } catch (err) {
                result.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed to load P&L'}</div>`;
            }
        });
    }

    async function _showBalanceSheet() {
        const rc = document.getElementById('reportContent');
        rc.innerHTML = '<div class="text-center text-gray-400 py-8">Loading…</div>';
        try {
            const res = await callApi('/api/ledger/balance-sheet', {}, 'GET');
            rc.innerHTML = `
                <div class="grid grid-cols-3 gap-3 mb-4">
                    <div class="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
                        <div class="text-xs text-gray-500 uppercase">Total Assets</div>
                        <div class="text-lg font-bold text-blue-700">₹${res.total_assets.toFixed(2)}</div>
                    </div>
                    <div class="p-3 bg-orange-50 rounded-lg border border-orange-200 text-center">
                        <div class="text-xs text-gray-500 uppercase">Liabilities</div>
                        <div class="text-lg font-bold text-orange-700">₹${res.total_liabilities.toFixed(2)}</div>
                    </div>
                    <div class="p-3 bg-purple-50 rounded-lg border border-purple-200 text-center">
                        <div class="text-xs text-gray-500 uppercase">Equity</div>
                        <div class="text-lg font-bold text-purple-700">₹${res.total_equity.toFixed(2)}</div>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-4">
                    <div class="detail-card">
                        <div class="detail-card-header"><h4 class="font-semibold text-blue-700 text-sm">Assets</h4></div>
                        <div class="detail-card-body max-h-80 overflow-y-auto">
                            ${res.assets.length ? res.assets.map(a =>
                                `<div class="flex justify-between py-1 border-b border-gray-100 text-sm">
                                    <span class="text-gray-700">${a.code ? `<span class="font-mono text-xs text-gray-500">${a.code}</span> ` : ''}${a.name || a.code}</span>
                                    <span class="font-semibold">₹${a.balance.toFixed(2)}</span>
                                </div>`
                            ).join('') : '<p class="text-gray-400 text-sm text-center py-4">No assets</p>'}
                        </div>
                    </div>
                    <div class="detail-card">
                        <div class="detail-card-header"><h4 class="font-semibold text-orange-700 text-sm">Liabilities</h4></div>
                        <div class="detail-card-body max-h-80 overflow-y-auto">
                            ${res.liabilities.length ? res.liabilities.map(l =>
                                `<div class="flex justify-between py-1 border-b border-gray-100 text-sm">
                                    <span class="text-gray-700">${l.code ? `<span class="font-mono text-xs text-gray-500">${l.code}</span> ` : ''}${l.name || l.code}</span>
                                    <span class="font-semibold">₹${l.balance.toFixed(2)}</span>
                                </div>`
                            ).join('') : '<p class="text-gray-400 text-sm text-center py-4">No liabilities</p>'}
                        </div>
                    </div>
                    <div class="detail-card">
                        <div class="detail-card-header"><h4 class="font-semibold text-purple-700 text-sm">Equity</h4></div>
                        <div class="detail-card-body max-h-80 overflow-y-auto">
                            ${res.equity.length ? res.equity.map(e =>
                                `<div class="flex justify-between py-1 border-b border-gray-100 text-sm">
                                    <span class="text-gray-700">${e.code ? `<span class="font-mono text-xs text-gray-500">${e.code}</span> ` : ''}${e.name || e.code}</span>
                                    <span class="font-semibold">₹${e.balance.toFixed(2)}</span>
                                </div>`
                            ).join('') : '<p class="text-gray-400 text-sm text-center py-4">No equity</p>'}
                        </div>
                    </div>
                </div>`;
        } catch (err) {
            rc.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed to load balance sheet'}</div>`;
        }
    }

    async function _showAgingReport() {
        const rc = document.getElementById('reportContent');
        rc.innerHTML = '<div class="text-center text-gray-400 py-8">Loading…</div>';
        try {
            const res = await callApi('/api/ledger/aging', {}, 'GET');
            const buckets = res.buckets || {};
            const colors = ['green', 'yellow', 'orange', 'red'];
            const bucketKeys = ['0-30', '31-60', '61-90', '91+'];
            rc.innerHTML = `
                <div class="grid grid-cols-4 gap-3 mb-4">
                    ${bucketKeys.map((k, i) => {
                        const b = buckets[k] || { total: 0, count: 0 };
                        const color = colors[i];
                        return `<div class="p-3 bg-${color}-50 rounded-lg border border-${color}-200 text-center">
                            <div class="text-xs text-gray-500 uppercase">${k} days</div>
                            <div class="text-lg font-bold text-${color}-700">₹${b.total.toFixed(2)}</div>
                            <div class="text-xs text-gray-400">${b.count} clients</div>
                        </div>`;
                    }).join('')}
                </div>
                ${bucketKeys.filter(k => (buckets[k]?.items || []).length).map(k => {
                    const color = colors[bucketKeys.indexOf(k)];
                    const items = buckets[k].items || [];
                    return `<div class="detail-card mb-3">
                        <div class="detail-card-header"><h4 class="font-semibold text-${color}-700 text-sm">${k} Days — ₹${buckets[k].total.toFixed(2)}</h4></div>
                        <div class="detail-card-body overflow-x-auto">
                            <table class="min-w-full text-sm">
                                <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                                    <tr><th class="px-3 py-2">Code</th><th class="px-3 py-2">Name</th><th class="px-3 py-2 text-right">Balance</th><th class="px-3 py-2 text-right">Days</th></tr>
                                </thead>
                                <tbody>${items.map(item => `<tr class="border-b cursor-pointer hover:bg-gray-50" onclick="VaultSummary._showStatement('${item.code}')">
                                    <td class="px-3 py-2 font-medium">${item.code}</td>
                                    <td class="px-3 py-2 text-gray-600">${item.client_name || ''}</td>
                                    <td class="px-3 py-2 text-right font-semibold text-red-600">₹${item.balance.toFixed(2)}</td>
                                    <td class="px-3 py-2 text-right">${item.days_overdue}d</td>
                                </tr>`).join('')}</tbody>
                            </table>
                        </div>
                    </div>`;
                }).join('') || '<p class="text-center text-gray-400 py-8">No outstanding entries.</p>'}`;
        } catch (err) {
            rc.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed to load aging'}</div>`;
        }
    }

    // ── TILE: Bank Reconciliation ─────────────────────────────────────────────
    function _showBankRecon() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">🏦 Bank Reconciliation</h3></div>
                <div class="detail-card-body">
                    <p class="text-sm text-gray-600 mb-4">Paste bank statement transactions (TSV format: <code>date\\tref\\tdebit\\tcredit\\tnarration</code> per line, or JSON array).</p>
                    <textarea id="bankStmtInput" rows="8" class="form-input text-xs font-mono mb-3" placeholder="2026-04-01\tNEFT123\t0\t50000\tPayment received&#10;2026-04-02\tCHQ001\t25000\t0\tCheque payment"></textarea>
                    <div class="flex gap-2 mb-4">
                        <button id="bankParseBtn" class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">Parse & Match</button>
                    </div>
                    <div id="bankReconResult"></div>
                </div>
            </div>`;

        document.getElementById('bankParseBtn').addEventListener('click', () => _parseBankStmt());
        VaultPage.showDetailPane();
    }

    async function _parseBankStmt() {
        const result = document.getElementById('bankReconResult');
        const raw = document.getElementById('bankStmtInput').value.trim();
        if (!raw) { result.innerHTML = '<p class="text-red-500 text-sm">Paste bank statement data first.</p>'; return; }

        let transactions = [];
        // Try parsing as JSON first
        try {
            transactions = JSON.parse(raw);
            if (!Array.isArray(transactions)) throw new Error('Not an array');
        } catch {
            // Parse as TSV
            transactions = raw.split('\n').filter(l => l.trim()).map((line, i) => {
                const parts = line.split('\t');
                return {
                    date: parts[0]?.trim() || '',
                    ref: parts[1]?.trim() || '',
                    debit: parseFloat(parts[2]) || 0,
                    credit: parseFloat(parts[3]) || 0,
                    narration: parts.slice(4).join(' ').trim() || ''
                };
            });
        }

        if (!transactions.length) {
            result.innerHTML = '<p class="text-red-500 text-sm">No transactions parsed.</p>';
            return;
        }

        // Fetch all ACTIVE PAYMENT entries from LEDGER to match against
        const allLedger = await getAppData().then(d => d?.LEDGER ? Object.values(d.LEDGER) : []);
        const payments = allLedger.filter(e =>
            e.STATUS === 'ACTIVE' &&
            e.ENTRY_TYPE === 'PAYMENT' &&
            (e.PAYMENT_MODE === 'CHEQUE' || e.PAYMENT_MODE === 'NEFT' || e.PAYMENT_MODE === 'UPI')
        );

        // Match by amount + date proximity
        const matched = [];
        const unmatched = [];

        for (const txn of transactions) {
            const txnDate = new Date(txn.date).getTime();
            const txnAmount = txn.credit || txn.debit;
            const isCredit = txn.credit > 0;

            // Find matching ledger entry
            const match = payments.find(p => {
                const pAmount = isCredit ? (+p.CREDIT || 0) : (+p.DEBIT || 0);
                const pDate = +p.ENTRY_DATE || 0;
                const dateDiff = Math.abs(pDate - txnDate);
                const amountDiff = Math.abs(pAmount - txnAmount);
                return amountDiff < 1 && (dateDiff < 7 * 24 * 60 * 60 * 1000); // 7 days window
            });

            if (match) {
                matched.push({ txn, entry: match });
            } else {
                unmatched.push(txn);
            }
        }

        result.innerHTML = `
            <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
                    <div class="text-xs text-gray-500 uppercase">Total Transactions</div>
                    <div class="text-lg font-bold">${transactions.length}</div>
                </div>
                <div class="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
                    <div class="text-xs text-gray-500 uppercase">Matched</div>
                    <div class="text-lg font-bold text-blue-700">${matched.length}</div>
                </div>
                <div class="p-3 bg-red-50 rounded-lg border border-red-200 text-center">
                    <div class="text-xs text-gray-500 uppercase">Unmatched</div>
                    <div class="text-lg font-bold text-red-700">${unmatched.length}</div>
                </div>
            </div>
            ${matched.length ? `<div class="detail-card mb-3">
                <div class="detail-card-header"><h4 class="text-sm font-semibold text-blue-700">✅ Matched (${matched.length})</h4></div>
                <div class="detail-card-body overflow-x-auto max-h-48 overflow-y-auto">
                    <table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-1">Date</th><th class="px-2 py-1">Ref</th><th class="px-2 py-1 text-right">Amount</th>
                            <th class="px-2 py-1">Ledger</th><th class="px-2 py-1">Code</th>
                        </tr></thead>
                        <tbody>${matched.map(m => `<tr class="border-b">
                            <td class="px-2 py-1">${m.txn.date}</td>
                            <td class="px-2 py-1">${m.txn.ref}</td>
                            <td class="px-2 py-1 text-right">₹${(m.txn.credit || m.txn.debit).toFixed(2)}</td>
                            <td class="px-2 py-1">${m.entry.PAYMENT_MODE} ${m.entry.CHEQUE_NUMBER || m.entry.TXN_REF || ''}</td>
                            <td class="px-2 py-1">${m.entry.CODE || ''}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>` : ''}
            ${unmatched.length ? `<div class="detail-card">
                <div class="detail-card-header"><h4 class="text-sm font-semibold text-red-700">❌ Unmatched (${unmatched.length})</h4></div>
                <div class="detail-card-body overflow-x-auto max-h-48 overflow-y-auto">
                    <table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-1">Date</th><th class="px-2 py-1">Ref</th><th class="px-2 py-1 text-right">Amount</th>
                            <th class="px-2 py-1">Narration</th>
                        </tr></thead>
                        <tbody>${unmatched.map(u => `<tr class="border-b">
                            <td class="px-2 py-1">${u.date}</td>
                            <td class="px-2 py-1">${u.ref}</td>
                            <td class="px-2 py-1 text-right">₹${(u.credit || u.debit).toFixed(2)}</td>
                            <td class="px-2 py-1 text-gray-500 truncate max-w-[200px]">${u.narration}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>` : ''}`;
    }

    // ── TILE: Bulk Import ────────────────────────────────────────────────────
    function showBulkImport() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📥 Bulk Import</h3></div>
                <div class="detail-card-body">
                    <div class="mb-3">
                        <label class="block text-xs font-medium text-gray-600 mb-1">Import Data (JSON array)</label>
                        <textarea id="bulkImportInput" rows="10" class="form-input text-xs font-mono" placeholder='[
        {"entry_type": "INVOICE", "entry_date": 1743465600000, "code": "ACME01", "amount": 50000, "direction": "OUTWARD", "branch": "DEL", "narration": "Bulk import invoice"}
    ]'></textarea>
                    </div>
                    <div class="flex gap-2 mb-4">
                        <button id="bulkImportBtn" class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                            Import
                        </button>
                        <button id="bulkImportSample" class="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors">Load Sample</button>
                    </div>
                    <div id="bulkImportResult"></div>
                </div>
            </div>`;

        document.getElementById('bulkImportBtn').addEventListener('click', async () => {
            const result = document.getElementById('bulkImportResult');
            const raw = document.getElementById('bulkImportInput').value.trim();
            if (!raw) { result.innerHTML = '<p class="text-red-500 text-sm">Enter data first.</p>'; return; }
            let rows;
            try { rows = JSON.parse(raw); if (!Array.isArray(rows)) throw new Error('Not an array'); }
            catch (e) { result.innerHTML = `<p class="text-red-500 text-sm">Invalid JSON: ${e.message}</p>`; return; }
            if (!rows.length) { result.innerHTML = '<p class="text-red-500 text-sm">Empty array.</p>'; return; }

            result.innerHTML = '<div class="text-center text-gray-400 py-4">Importing…</div>';
            try {
                const res = await callApi('/api/ledger/bulk-import', { rows }, 'POST');
                result.innerHTML = `
                    <div class="p-3 ${res.failed > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'} rounded-lg border text-sm">
                        <strong>${res.created} entries created</strong>
                        ${res.failed > 0 ? `, <span class="text-red-600">${res.failed} failed</span>` : ''}
                        ${res.entries?.length ? `<details class="mt-2"><summary class="cursor-pointer text-xs font-medium text-gray-600">View detail</summary>
                            <div class="mt-1 max-h-40 overflow-y-auto text-xs space-y-1">
                                ${res.entries.map(e => `<div>#${e.row}: ${e.type} ${e.code} — ₹${e.amount.toFixed(2)} → ${e.entry_id}</div>`).join('')}
                            </div>
                        </details>` : ''}
                        ${res.errors?.length ? `<div class="mt-2 text-xs text-red-600">${res.errors.map(e => `<div>#${e.row}: ${e.error}</div>`).join('')}</div>` : ''}
                    </div>`;
            } catch (err) {
                result.innerHTML = `<div class="text-red-500 text-sm">❌ ${err.message || 'Import failed'}</div>`;
            }
        });

        document.getElementById('bulkImportSample').addEventListener('click', () => {
            const now = Date.now();
            document.getElementById('bulkImportInput').value = JSON.stringify([
                { entry_type: 'INVOICE', entry_date: now, code: 'SMPL01', amount: 25000, direction: 'OUTWARD', branch: 'DEL', narration: 'Sample bulk invoice', service_code: 'FRT' },
                { entry_type: 'PAYMENT', entry_date: now, code: 'SMPL01', amount: 10000, direction: 'OUTWARD', branch: 'DEL', narration: 'Sample payment', payment_mode: 'NEFT', txn_ref: 'BULK001' },
            ], null, 2);
        });
        VaultPage.showDetailPane();
    }

    // ── Chart of Accounts — hardcoded reference ──────────────────────────────
    async function showChartOfAccounts() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">Loading Chart of Accounts…</div>';

        try {
            const res = await callApi('/api/coa', {}, 'GET');
            const accounts = res.data || [];
            const groups = {};
            accounts.forEach(a => {
                if (!groups[a.group]) groups[a.group] = [];
                groups[a.group].push(a);
            });
            const groupOrder = ['Current Assets', 'Fixed Assets', 'Current Liabilities', 'Equity',
                'Direct Income', 'Operating Income', 'Other Income',
                'Direct Expenses', 'Employee Costs', 'Office Expenses',
                'Vehicle Expenses', 'Administrative', 'Financial', 'Tax Expenses',
                'Non-Cash Expenses', 'Other Expenses'];
            const total = accounts.length;

            function _renderAccounts(groups, groupOrder) {
                return groupOrder.map(grp => {
                    const accs = groups[grp];
                    if (!accs || !accs.length) return '';
                    const isAsset = accs[0].type === 'Asset';
                    const isLiability = accs[0].type === 'Liability';
                    const isIncome = accs[0].type === 'Income';
                    const isExpense = accs[0].type === 'Expense';
                    const bgColor = isAsset ? 'bg-blue-50 border-blue-200' :
                                    isLiability ? 'bg-orange-50 border-orange-200' :
                                    isIncome ? 'bg-green-50 border-green-200' : 'bg-rose-50 border-rose-200';
                    const headerColor = isAsset ? 'text-blue-800' :
                                        isLiability ? 'text-orange-800' :
                                        isIncome ? 'text-green-800' : 'text-rose-800';
                    return `<div class="${bgColor} rounded-lg border p-3 mb-3">
                        <h4 class="${headerColor} text-xs font-bold uppercase tracking-wider mb-2">${grp}</h4>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                            ${accs.map(a => `<div class="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/60 transition-colors">
                                <span class="font-mono text-xs font-medium text-gray-500 w-12">${a.code}</span>
                                <span class="text-sm text-gray-800">${a.name}</span>
                                <span class="text-xs text-gray-400 ml-auto">${a.normal_balance}</span>
                            </div>`).join('')}
                        </div>
                    </div>`;
                }).join('');
            }

            view.innerHTML = `
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">📒 Chart of Accounts</h3>
                        <p class="text-xs text-gray-500">${total} accounts — hardcoded reference list</p>
                    </div>
                    <div class="relative">
                        <input id="coaSearch" type="text" placeholder="Search code, name, group…" class="form-input text-sm w-64 pl-8">
                        <svg class="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </div>
                </div>
                <div id="coaContainer">${_renderAccounts(groups, groupOrder)}</div>`;
            VaultPage.showDetailPane();

            document.getElementById('coaSearch').addEventListener('input', e => {
                const q = e.target.value.toLowerCase();
                const filtered = accounts.filter(a =>
                    a.code.includes(q) || a.name.toLowerCase().includes(q) || a.group.toLowerCase().includes(q)
                );
                const fGroups = {};
                filtered.forEach(a => {
                    if (!fGroups[a.group]) fGroups[a.group] = [];
                    fGroups[a.group].push(a);
                });
                document.getElementById('coaContainer').innerHTML =
                    filtered.length ? _renderAccounts(fGroups, groupOrder) : '<p class="text-center text-gray-400 py-8">No matching accounts.</p>';
            });
        } catch (err) {
            view.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed to load'}</div>`;
            VaultPage.showDetailPane();
        }
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLEDGER = Object.values(data.LEDGER);
            _allB2B = data.B2B ? Object.values(data.B2B) : [];
        }
        if (_activeView === 'summary') {
            _renderSummaryList(_allLEDGER);
            showDashboard();
        } else if (_activeView === 'reports') {
            showReports();
        } else if (_activeView === 'bank-recon') {
            _showBankRecon();
        } else if (_activeView === 'bulk-import') {
            showBulkImport();
        }
    }

    function setView(view) { _activeView = view; }

    return { load, search, showDashboard, showReports, showChartOfAccounts, showBulkImport, _showStatement, _showBankRecon, setView };
})();

window.VaultSummary = VaultSummary;
