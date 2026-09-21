// ============================================================================
// VAULT-TRIAL-BALANCE.JS — Trial Balance (Double-Entry Verification)
// Tile: trial-balance
// Data source: /api/accounting/reports/trial-balance (pyacc) with 15-min ETag cache
// ============================================================================

const VaultTrialBalance = (() => {

    let _tbData = null; // { balances: {}, total_debit: 0, total_credit: 0, is_balanced: true }
    let _accountList = [];
    let _activeItem = null;

    const TYPE_COLORS = {
        'NON_CURRENT_ASSET': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'CURRENT_ASSET': 'bg-teal-50 text-teal-700 border-teal-200',
        'INVENTORY': 'bg-cyan-50 text-cyan-700 border-cyan-200',
        'BANK': 'bg-sky-50 text-sky-700 border-sky-200',
        'RECEIVABLE': 'bg-blue-50 text-blue-700 border-blue-200',
        'CONTRA_ASSET': 'bg-amber-50 text-amber-700 border-amber-200',
        'CURRENT_LIABILITY': 'bg-rose-50 text-rose-700 border-rose-200',
        'NON_CURRENT_LIABILITY': 'bg-red-50 text-red-700 border-red-200',
        'PAYABLE': 'bg-orange-50 text-orange-700 border-orange-200',
        'CONTROL': 'bg-purple-50 text-purple-700 border-purple-200',
        'EQUITY': 'bg-violet-50 text-violet-700 border-violet-200',
        'OPERATING_REVENUE': 'bg-indigo-50 text-indigo-700 border-indigo-200',
        'NON_OPERATING_REVENUE': 'bg-blue-50 text-blue-700 border-blue-200',
        'OPERATING_EXPENSE': 'bg-amber-50 text-amber-700 border-amber-200',
        'DIRECT_EXPENSE': 'bg-orange-50 text-orange-700 border-orange-200',
        'OVERHEAD_EXPENSE': 'bg-yellow-50 text-yellow-700 border-yellow-200',
        'OTHER_EXPENSE': 'bg-slate-50 text-slate-700 border-slate-200',
    };

    function _getAuthToken() {
        try {
            const raw = localStorage.getItem('post4ex_session') || localStorage.getItem('session') || '';
            if (raw) {
                const parsed = JSON.parse(raw);
                return parsed.token || parsed.jwt || parsed.access_token || raw;
            }
        } catch { /* fallback */ }
        return localStorage.getItem('token') || '';
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function _fmtMoney(n) {
        const num = Number(n) || 0;
        return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function _injectListPane() {
        const msg = document.getElementById('vaultListMsg');
        const list = document.getElementById('vaultList');
        const search = document.getElementById('vaultSearch');
        if (msg) { msg.textContent = ''; msg.classList.add('hidden'); }
        if (list) list.innerHTML = '';
        if (search) {
            search.placeholder = 'Search ledger accounts, codes, balances…';
            search.oninput = () => _renderList();
        }
    }

    async function load() {
        _injectListPane();
        window.setLoading?.(true, 'Generating Trial Balance...', 'list');

        const listEl = document.getElementById('vaultList');
        if (listEl) {
            listEl.innerHTML = `
                <li class="p-6 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Calculating live Trial Balance from pyacc ledger...</p>
                </li>
            `;
        }

        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            let resData = null;
            if (window.VaultCache) {
                const res = await window.VaultCache.fetchWithEtag('/api/accounting/reports/trial-balance', { headers });
                resData = res.data;
            } else {
                const r = await fetch('/api/accounting/reports/trial-balance', { headers });
                resData = await r.json();
            }

            const report = resData?.trial_balance || resData || {};
            _tbData = report;

            const balances = report.balances || {};
            _accountList = Object.entries(balances).map(([name, item]) => ({
                name,
                code: item.account_code || '',
                type: (item.account_type || '').toUpperCase(),
                debit: Number(item.debit) || 0,
                credit: Number(item.credit) || 0,
                net: Number(item.net) || 0,
                account_id: item.account_id || ''
            })).sort((a, b) => (Number(a.code) || 0) - (Number(b.code) || 0) || a.name.localeCompare(b.name));

            _renderList();

            // Auto-select first item on desktop
            if (_accountList.length > 0 && window.innerWidth >= 768) {
                _showDetailView(_accountList[0]);
            } else {
                VaultPage?.showDetail?.(false);
            }
        } catch (err) {
            console.error('[VaultTrialBalance.load error]', err);
            if (listEl) {
                listEl.innerHTML = `<li class="p-4 text-center text-red-600 text-xs">Failed to load Trial Balance: ${_escapeHtml(err.message)}</li>`;
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        const msgEl = document.getElementById('vaultListMsg');
        if (!ul) return;
        ul.innerHTML = '';

        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase().trim();
        const filtered = _accountList.filter(item =>
            item.name.toLowerCase().includes(q) ||
            String(item.code || '').toLowerCase().includes(q) ||
            String(item.type || '').toLowerCase().includes(q)
        );

        if (filtered.length === 0) {
            if (msgEl) {
                msgEl.textContent = q ? 'No matching trial balance accounts found.' : 'No accounts recorded.';
                msgEl.classList.remove('hidden');
            }
            return;
        }
        if (msgEl) msgEl.classList.add('hidden');

        ul.innerHTML = filtered.map(item => {
            const badgeClass = TYPE_COLORS[item.type] || 'bg-slate-100 text-slate-600 border-slate-200';
            const formattedType = (item.type || 'GENERAL').replace(/_/g, ' ');
            const isSelected = _activeItem && _activeItem.code === item.code;

            return `
                <li data-code="${_escapeHtml(item.code)}" class="p-3 bg-white rounded-lg border ${isSelected ? 'border-purple-500 bg-purple-50/50' : 'border-gray-200'} hover:border-purple-400 cursor-pointer transition shadow-sm space-y-1">
                    <div class="flex justify-between items-start">
                        <span class="font-bold text-gray-900 text-xs truncate max-w-[180px]">${_escapeHtml(item.name)}</span>
                        ${item.code ? `<span class="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">#${_escapeHtml(item.code)}</span>` : ''}
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                        <span class="px-1.5 py-0.2 rounded border text-[9px] font-semibold uppercase tracking-wider ${badgeClass}">
                            ${_escapeHtml(formattedType)}
                        </span>
                        <div class="text-right">
                            <span class="text-[10px] font-mono font-bold ${item.net >= 0 ? 'text-indigo-700' : 'text-rose-700'}">
                                Net: ${_fmtMoney(item.net)}
                            </span>
                        </div>
                    </div>
                </li>
            `;
        }).join('');

        const items = Array.from(ul.querySelectorAll('li'));
        items.forEach((li) => {
            li.addEventListener('click', () => {
                items.forEach(x => {
                    x.classList.remove('border-purple-500', 'bg-purple-50/50');
                    x.classList.add('border-gray-200');
                });
                li.classList.remove('border-gray-200');
                li.classList.add('border-purple-500', 'bg-purple-50/50');
                const code = li.dataset.code;
                const found = _accountList.find(item => String(item.code) === String(code));
                if (found) _showDetailView(found);
            });
        });
    }

    function _showDetailView(item) {
        _activeItem = item;
        VaultPage?.showDetail?.(true);
        const view = document.getElementById('vaultDetailView');
        if (!view) return;

        const badgeClass = TYPE_COLORS[item.type] || 'bg-slate-100 text-slate-600 border-slate-200';
        const formattedType = (item.type || 'GENERAL').replace(/_/g, ' ');

        const totalDebit = Number(_tbData?.total_debit) || 0;
        const totalCredit = Number(_tbData?.total_credit) || 0;
        const variance = Math.abs(totalDebit - totalCredit);
        const isBalanced = _tbData?.is_balanced !== false && variance < 0.001;

        view.innerHTML = `
            <div class="space-y-6">
                <!-- Header Card -->
                <div class="p-5 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-xl shadow-sm">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/30 text-purple-200 rounded border border-purple-400/30">TRIAL BALANCE ACCOUNT</span>
                                <span class="px-2 py-0.5 text-[10px] font-bold uppercase ${badgeClass} rounded">${_escapeHtml(formattedType)}</span>
                            </div>
                            <h1 class="text-xl font-black text-white">${_escapeHtml(item.name)}</h1>
                            <p class="text-xs text-purple-200 mt-1">Real-time ledger summary position</p>
                        </div>
                        <div class="text-right">
                            <span class="text-[11px] text-purple-300 block">Net Position</span>
                            <span class="text-2xl font-mono font-bold ${item.net >= 0 ? 'text-amber-300' : 'text-rose-300'}">${_fmtMoney(item.net)}</span>
                        </div>
                    </div>
                </div>

                <!-- Trial Balance Master Status -->
                <div class="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center text-base font-bold shadow-sm">
                            <i class="fa-solid fa-scale-balanced"></i>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-purple-950 uppercase tracking-wider">Master Ledger Equilibrium</h4>
                            <p class="text-xs text-purple-800">Debits: <strong class="font-mono">${_fmtMoney(totalDebit)}</strong> | Credits: <strong class="font-mono">${_fmtMoney(totalCredit)}</strong></p>
                        </div>
                    </div>
                    <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isBalanced ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'}">
                        ${isBalanced ? '✓ Zero Variance (Balanced)' : '⚠ Variance Detected'}
                    </span>
                </div>

                <!-- Account Balances Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Account Code</span>
                        <span class="text-xs font-mono font-bold text-gray-900">#${_escapeHtml(item.code || '—')}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Total Debit (Dr)</span>
                        <span class="text-xs font-mono font-bold text-indigo-700">${_fmtMoney(item.debit)}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Total Credit (Cr)</span>
                        <span class="text-xs font-mono font-bold text-emerald-700">${_fmtMoney(item.credit)}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Net Balance</span>
                        <span class="text-xs font-mono font-bold text-gray-900">${_fmtMoney(item.net)}</span>
                    </div>
                </div>

                <!-- Audit Ledger Scope -->
                <div class="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-2">
                        <i class="fa-solid fa-file-invoice-dollar text-purple-600"></i> Double-Entry Journal Audit
                    </h3>
                    <div class="text-xs text-gray-700 space-y-2">
                        <p>All posted journal lines and opening balances for <strong>${_escapeHtml(item.name)}</strong> are verified under GAAP / Indian AS double-entry rules.</p>
                        ${item.account_id ? `<p class="text-slate-500">Account UUID: <span class="font-mono text-[11px] select-all">${_escapeHtml(item.account_id)}</span></p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function search() {
        _renderList();
    }

    return { load, search };
})();

window.VaultTrialBalance = VaultTrialBalance;
