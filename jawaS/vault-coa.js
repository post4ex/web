// ============================================================================
// VAULT-COA.JS — Chart of Accounts & Live Account Ledgers
// Tile: chart-of-accounts / accounts (🏛️)
// Connected to pyacc Double-Entry Accounting Engine
// ============================================================================

const VaultCOA = (() => {

    let _coaList = [];
    let _activeItem = null;
    let _activeCategory = "ALL";
    let _statementStartDate = "";
    let _statementEndDate = "";

    const _escapeHtml = (str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    const _getAuthToken = () => {
        if (typeof getSessionId === 'function') {
            const s = getSessionId();
            if (s) return s;
        }
        try {
            const raw = localStorage.getItem('loginData') || localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '';
            if (raw) {
                const parsed = JSON.parse(raw);
                return parsed.sessionId || parsed.token || parsed.jwt || parsed.access_token || raw;
            }
        } catch { /* fallback */ }
        return localStorage.getItem('token') || '';
    };

    const TYPE_COLORS = {
        'BANK': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'CASH': 'bg-emerald-50 text-emerald-700 border-emerald-200',
        'RECEIVABLE': 'bg-blue-50 text-blue-700 border-blue-200',
        'CURRENT_ASSET': 'bg-indigo-50 text-indigo-700 border-indigo-200',
        'NON_CURRENT_ASSET': 'bg-purple-50 text-purple-700 border-purple-200',
        'INVENTORY': 'bg-cyan-50 text-cyan-700 border-cyan-200',
        'PAYABLE': 'bg-orange-50 text-orange-700 border-orange-200',
        'CURRENT_LIABILITY': 'bg-amber-50 text-amber-700 border-amber-200',
        'NON_CURRENT_LIABILITY': 'bg-red-50 text-red-700 border-red-200',
        'EQUITY': 'bg-rose-50 text-rose-700 border-rose-200',
        'OPERATING_REVENUE': 'bg-teal-50 text-teal-700 border-teal-200',
        'NON_OPERATING_REVENUE': 'bg-teal-50 text-teal-700 border-teal-200',
        'OPERATING_EXPENSE': 'bg-red-50 text-red-700 border-red-200',
        'DIRECT_EXPENSE': 'bg-red-50 text-red-700 border-red-200',
        'OVERHEAD_EXPENSE': 'bg-rose-50 text-rose-700 border-rose-200',
        'OTHER_EXPENSE': 'bg-red-50 text-red-700 border-red-200',
        'CONTROL': 'bg-slate-50 text-slate-700 border-slate-200'
    };

    function _injectFilterBar() {
        const header = document.querySelector('#vaultListMsg')?.parentElement;
        if (!header) return;

        let chipsContainer = document.getElementById('coaCategoryChips');
        if (!chipsContainer) {
            chipsContainer = document.createElement('div');
            chipsContainer.id = 'coaCategoryChips';
            chipsContainer.className = 'flex flex-wrap gap-1 p-2 border-b border-gray-100 bg-gray-50/70';
            
            const categories = ['ALL', 'Asset', 'Liability', 'Equity', 'Revenue', 'Expense', 'Control'];
            chipsContainer.innerHTML = categories.map(cat => `
                <button type="button" data-category="${cat.toUpperCase()}" 
                    class="coa-chip px-2 py-1 text-[11px] font-semibold rounded-md border transition ${cat === 'ALL' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}">
                    ${cat}
                </button>
            `).join('');

            const searchInput = document.getElementById('vaultSearch');
            if (searchInput && searchInput.parentElement) {
                searchInput.parentElement.after(chipsContainer);
            }

            chipsContainer.querySelectorAll('.coa-chip').forEach(btn => {
                btn.addEventListener('click', () => {
                    chipsContainer.querySelectorAll('.coa-chip').forEach(b => {
                        b.className = 'coa-chip px-2 py-1 text-[11px] font-semibold rounded-md border transition bg-white text-gray-600 border-gray-200 hover:bg-gray-100';
                    });
                    btn.className = 'coa-chip px-2 py-1 text-[11px] font-semibold rounded-md border transition bg-indigo-600 text-white border-indigo-600 shadow-sm';
                    _activeCategory = btn.dataset.category;
                    _renderList();
                });
            });
        }
    }

    async function load() {
        const listEl = document.getElementById('vaultList');
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) {
            searchInput.placeholder = 'Search by name, #code, type...';
            searchInput.oninput = () => search();
        }

        _injectFilterBar();

        if (listEl) {
            listEl.innerHTML = `
                <li class="p-6 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Fetching Chart of Accounts from pyacc engine...</p>
                </li>
            `;
        }

        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            let resData = null;
            if (window.VaultCache) {
                const res = await window.VaultCache.fetchWithEtag('/api/accounting/accounts', { headers });
                resData = res.data;
            } else {
                const r = await fetch('/api/accounting/accounts', { headers });
                resData = await r.json();
            }

            const raw = Array.isArray(resData) ? resData : (resData?.accounts || resData?.data || []);
            if (Array.isArray(raw) && raw.length > 0) {
                _coaList = raw.map(acc => ({
                    id: acc.id,
                    name: acc.name,
                    code: acc.account_code || acc.code || '',
                    type: (acc.account_type || '').toUpperCase(),
                    category: acc.category || 'Asset',
                    normal_balance: acc.normal_balance || 'DEBIT',
                    balance: parseFloat(acc.balance || 0),
                    transaction_count: parseInt(acc.transaction_count || 0),
                    description: acc.description || '',
                    key: String(acc.id)
                })).sort((a, b) => (Number(a.code) || 0) - (Number(b.code) || 0) || a.name.localeCompare(b.name));
            } else {
                _coaList = [];
            }

            _renderList();

            // Auto-select first item or preserve active
            if (_coaList.length > 0) {
                const selected = _activeItem ? _coaList.find(a => a.id === _activeItem.id) : _coaList[0];
                _showDetailView(selected || _coaList[0]);
            } else {
                VaultPage?.showDetail?.(false);
            }
        } catch (err) {
            console.error('[VaultCOA.load error]', err);
            if (listEl) {
                listEl.innerHTML = `<li class="p-4 text-center text-red-600 text-xs">Failed to load Chart of Accounts: ${_escapeHtml(err.message)}</li>`;
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

        const filtered = _coaList.filter(item => {
            if (_activeCategory !== 'ALL') {
                if ((item.category || '').toUpperCase() !== _activeCategory) return false;
            }
            if (!q) return true;
            return item.name.toLowerCase().includes(q) ||
                   String(item.code || '').toLowerCase().includes(q) ||
                   String(item.type || '').toLowerCase().includes(q) ||
                   String(item.description || '').toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
            if (msgEl) {
                msgEl.textContent = q ? 'No matching accounts found.' : 'No accounts available in category.';
                msgEl.classList.remove('hidden');
            }
            return;
        }
        if (msgEl) msgEl.classList.add('hidden');

        ul.innerHTML = filtered.map(item => {
            const badgeClass = TYPE_COLORS[item.type] || 'bg-slate-100 text-slate-600 border-slate-200';
            const formattedType = (item.type || 'GENERAL').replace(/_/g, ' ');
            const isSelected = _activeItem && String(_activeItem.id) === String(item.id);
            const balSuffix = item.normal_balance === 'CREDIT' ? 'Cr' : 'Dr';
            const hasBal = item.balance !== 0;

            return `
                <li data-id="${item.id}" class="p-3 bg-white rounded-lg border ${isSelected ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200'} hover:border-indigo-400 cursor-pointer transition shadow-sm space-y-1">
                    <div class="flex justify-between items-start gap-2">
                        <span class="font-bold text-gray-900 text-xs truncate flex-1">${_escapeHtml(item.name)}</span>
                        ${item.code ? `<span class="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200 shrink-0">#${_escapeHtml(item.code)}</span>` : ''}
                    </div>
                    <div class="flex items-center justify-between text-[11px] mt-1">
                        <span class="px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wider ${badgeClass}">
                            ${_escapeHtml(formattedType)}
                        </span>
                        <span class="font-bold text-xs ${hasBal ? 'text-gray-900' : 'text-gray-400'}">
                            ₹${Math.abs(item.balance).toFixed(2)} <span class="text-[10px] text-gray-500 font-normal">${balSuffix}</span>
                        </span>
                    </div>
                </li>
            `;
        }).join('');

        ul.querySelectorAll('li').forEach((li) => {
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => {
                    x.classList.remove('border-indigo-500', 'bg-indigo-50/50');
                    x.classList.add('border-gray-200');
                });
                li.classList.remove('border-gray-200');
                li.classList.add('border-indigo-500', 'bg-indigo-50/50');
                const id = li.dataset.id;
                const found = _coaList.find(item => String(item.id) === String(id));
                if (found) _showDetailView(found);
            });
        });
    }

    async function _showDetailView(item) {
        _activeItem = item;
        VaultPage?.showDetail?.(true);
        const view = document.getElementById('vaultDetailView');
        if (!view) return;

        const badgeClass = TYPE_COLORS[item.type] || 'bg-slate-100 text-slate-600 border-slate-200';
        const formattedType = (item.type || 'GENERAL').replace(/_/g, ' ');
        const isDebitNormal = item.normal_balance === 'DEBIT';
        const normalBalanceText = isDebitNormal ? 'Debit (Dr)' : 'Credit (Cr)';
        const normalBalanceColor = isDebitNormal ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200';
        const balSuffix = isDebitNormal ? 'Dr' : 'Cr';

        view.innerHTML = `
            <div class="space-y-6">
                <!-- Header Card -->
                <div class="p-5 bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-950 text-white rounded-xl shadow-sm">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div class="space-y-1">
                            <div class="flex items-center gap-2">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 rounded border border-indigo-400/30">CHART OF ACCOUNTS</span>
                                <span class="px-2 py-0.5 text-[10px] font-bold uppercase ${badgeClass} rounded">${_escapeHtml(formattedType)}</span>
                            </div>
                            <h1 class="text-xl font-black text-white">${_escapeHtml(item.name)}</h1>
                            <p class="text-xs text-indigo-200">${_escapeHtml(item.description || 'General ledger account')}</p>
                        </div>
                        <div class="text-left sm:text-right bg-white/5 p-3 rounded-lg border border-white/10 sm:bg-transparent sm:border-0 sm:p-0">
                            <span class="text-[11px] text-indigo-300 uppercase block font-semibold">Live Closing Balance</span>
                            <span class="text-2xl font-black text-amber-300">₹${Math.abs(item.balance).toFixed(2)}</span>
                            <span class="text-xs font-bold text-indigo-200 ml-1 font-mono">${balSuffix}</span>
                        </div>
                    </div>
                    
                    <!-- Action Buttons Bar -->
                    <div class="flex flex-wrap items-center gap-2 pt-4 mt-4 border-t border-white/10">
                        <button onclick="VaultCOA.openAddAccountModal()" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-500 border-0">
                            <span>+ New Account</span>
                        </button>
                        <button onclick="VaultCOA.openEditAccountModal(${item.id})" class="btn btn-sm bg-white/10 text-white hover:bg-white/20 border-white/20">
                            <span>✏️ Edit</span>
                        </button>
                        <button onclick="VaultCOA.handleDeleteAccount(${item.id})" class="btn btn-sm bg-red-500/20 text-red-200 hover:bg-red-500/30 border-red-400/30">
                            <span>🗑️ Delete</span>
                        </button>
                        <button onclick="window.print()" class="btn btn-sm bg-white/10 text-white hover:bg-white/20 border-white/20 ml-auto">
                            <span>🖨️ Print Statement</span>
                        </button>
                    </div>
                </div>

                <!-- Parameters Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Account Code</span>
                        <span class="text-xs font-mono font-bold text-gray-900">#${_escapeHtml(item.code || '—')}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Category</span>
                        <span class="text-xs font-bold text-gray-900">${_escapeHtml(item.category)}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Normal Balance</span>
                        <span class="text-xs font-bold px-1.5 py-0.5 rounded border inline-block mt-0.5 ${normalBalanceColor}">${normalBalanceText}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Postings Count</span>
                        <span class="text-xs font-bold text-gray-900 block mt-0.5">${item.transaction_count} transactions</span>
                    </div>
                </div>

                <!-- Live Ledger Statement Table Container -->
                <div class="p-4 bg-white border border-gray-200 rounded-xl space-y-4">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-3">
                        <h3 class="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                            <span>📖</span> Live Account Ledger &amp; Running Balance
                        </h3>
                        <div class="flex items-center gap-2 text-xs">
                            <input type="date" id="coaStmtStart" class="px-2 py-1 border border-gray-300 rounded text-xs">
                            <span class="text-gray-400">to</span>
                            <input type="date" id="coaStmtEnd" class="px-2 py-1 border border-gray-300 rounded text-xs">
                            <button onclick="VaultCOA.refreshStatement(${item.id})" class="btn btn-sm">Filter</button>
                        </div>
                    </div>

                    <div id="coaStatementContent" class="overflow-x-auto">
                        <p class="text-xs text-gray-400 italic text-center py-4">Loading ledger statement entries...</p>
                    </div>
                </div>
            </div>
        `;

        _loadStatement(item.id);
    }

    async function _loadStatement(accountId, startDate = '', endDate = '') {
        const container = document.getElementById('coaStatementContent');
        if (!container) return;

        try {
            let url = `/api/accounting/accounts/${accountId}/statement`;
            const q = [];
            if (startDate) q.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) q.push(`end_date=${encodeURIComponent(endDate)}`);
            if (q.length) url += `?${q.join('&')}`;

            const res = await callApi(url, {}, 'GET');
            const entries = res.entries || [];
            const openBal = parseFloat(res.opening_balance || 0);
            const closeBal = parseFloat(res.closing_balance || 0);
            const totDr = parseFloat(res.total_debit || 0);
            const totCr = parseFloat(res.total_credit || 0);

            const rowsHtml = entries.map((e, idx) => `
                <tr class="hover:bg-gray-50/60 transition-colors border-b border-gray-100">
                    <td class="px-3 py-2 text-center text-gray-400">${idx + 1}</td>
                    <td class="px-3 py-2 font-mono text-gray-600">${_escapeHtml(e.transaction_date)}</td>
                    <td class="px-3 py-2 font-bold text-indigo-700 font-mono">${_escapeHtml(e.transaction_no)}</td>
                    <td class="px-3 py-2 text-gray-700">${_escapeHtml(e.narration || e.transaction_type)}</td>
                    <td class="px-3 py-2 text-gray-500 font-mono text-[11px]">${_escapeHtml(e.reference || '')}</td>
                    <td class="px-3 py-2 text-right font-semibold ${e.debit > 0 ? 'text-gray-900' : 'text-gray-400'}">${e.debit > 0 ? '₹' + e.debit.toFixed(2) : '—'}</td>
                    <td class="px-3 py-2 text-right font-semibold ${e.credit > 0 ? 'text-gray-900' : 'text-gray-400'}">${e.credit > 0 ? '₹' + e.credit.toFixed(2) : '—'}</td>
                    <td class="px-3 py-2 text-right font-bold text-gray-900">₹${e.running_balance.toFixed(2)}</td>
                </tr>
            `).join('');

            container.innerHTML = `
                <table class="w-full text-left text-xs border-collapse">
                    <thead class="bg-gray-100 text-gray-600 font-bold uppercase border-b border-gray-200">
                        <tr>
                            <th class="px-3 py-2 text-center" style="width:40px;">#</th>
                            <th class="px-3 py-2" style="width:90px;">Date</th>
                            <th class="px-3 py-2" style="width:130px;">Doc #</th>
                            <th class="px-3 py-2">Narration</th>
                            <th class="px-3 py-2" style="width:110px;">Reference</th>
                            <th class="px-3 py-2 text-right" style="width:100px;">Debit</th>
                            <th class="px-3 py-2 text-right" style="width:100px;">Credit</th>
                            <th class="px-3 py-2 text-right" style="width:120px;">Balance</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 bg-white">
                        <tr class="bg-slate-50 font-semibold text-gray-600 italic">
                            <td class="px-3 py-2 text-center">—</td>
                            <td class="px-3 py-2 font-mono">${_escapeHtml(res.period?.start_date || 'Initial')}</td>
                            <td class="px-3 py-2">OPENING</td>
                            <td class="px-3 py-2" colspan="4">Opening Balance Brought Forward</td>
                            <td class="px-3 py-2 text-right font-bold text-indigo-900">₹${openBal.toFixed(2)}</td>
                        </tr>
                        ${rowsHtml}
                        <tr class="bg-gray-50 font-bold border-t-2 border-gray-300 text-gray-900">
                            <td class="px-3 py-2" colspan="5">Period Totals &amp; Closing Balance</td>
                            <td class="px-3 py-2 text-right text-indigo-900">₹${totDr.toFixed(2)}</td>
                            <td class="px-3 py-2 text-right text-emerald-900">₹${totCr.toFixed(2)}</td>
                            <td class="px-3 py-2 text-right text-amber-800 text-sm font-black">₹${closeBal.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            `;
        } catch (err) {
            console.error('[_loadStatement error]', err);
            container.innerHTML = `<p class="text-xs text-red-600 py-4 text-center">Failed to load statement: ${_escapeHtml(err.message)}</p>`;
        }
    }

    function refreshStatement(accountId) {
        const s = document.getElementById('coaStmtStart')?.value || '';
        const e = document.getElementById('coaStmtEnd')?.value || '';
        _loadStatement(accountId, s, e);
    }

    function openAddAccountModal() {
        const accountTypes = [
            'OPERATING_EXPENSE',
            'DIRECT_EXPENSE',
            'OVERHEAD_EXPENSE',
            'OPERATING_REVENUE',
            'BANK',
            'CURRENT_ASSET',
            'NON_CURRENT_ASSET',
            'CURRENT_LIABILITY',
            'NON_CURRENT_LIABILITY',
            'EQUITY',
            'CONTROL'
        ];

        const modal = document.createElement('div');
        modal.id = 'coaAddModal';
        modal.className = 'modal-overlay fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100">
                <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                    <h2 class="text-lg font-bold text-gray-900">Create New Account</h2>
                    <button onclick="document.getElementById('coaAddModal').remove()" class="text-gray-400 hover:text-gray-700 text-lg">✕</button>
                </div>
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Account Name *</label>
                        <input type="text" id="newAccName" placeholder="e.g. Dehradun Hub Utilities" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Account Classification Type *</label>
                        <select id="newAccType" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg">
                            ${accountTypes.map(t => `<option value="${t}">${t.replace(/_/g, ' ')}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Description / Notes</label>
                        <input type="text" id="newAccDesc" placeholder="Operating expense account for local branch" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg">
                    </div>
                </div>
                <div class="flex justify-end gap-2 pt-3 border-t border-gray-100">
                    <button onclick="document.getElementById('coaAddModal').remove()" class="btn btn-sm">Cancel</button>
                    <button onclick="VaultCOA.saveNewAccount()" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700">Save Account</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    async function saveNewAccount() {
        const name = document.getElementById('newAccName')?.value?.trim();
        const type = document.getElementById('newAccType')?.value;
        const desc = document.getElementById('newAccDesc')?.value?.trim();

        if (!name) {
            alert('Please enter an account name.');
            return;
        }

        try {
            await callApi('/api/accounting/accounts', { name, account_type: type, description: desc }, 'POST');
            document.getElementById('coaAddModal')?.remove();
            alert(`Account '${name}' created successfully.`);
            await load();
        } catch (err) {
            alert('Failed to create account: ' + (err.message || err));
        }
    }

    function openEditAccountModal(accountId) {
        const acc = _coaList.find(a => a.id === accountId);
        if (!acc) return;

        const modal = document.createElement('div');
        modal.id = 'coaEditModal';
        modal.className = 'modal-overlay fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100">
                <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                    <h2 class="text-lg font-bold text-gray-900">Edit Account #${_escapeHtml(acc.code)}</h2>
                    <button onclick="document.getElementById('coaEditModal').remove()" class="text-gray-400 hover:text-gray-700 text-lg">✕</button>
                </div>
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Account Name *</label>
                        <input type="text" id="editAccName" value="${_escapeHtml(acc.name)}" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Description / Notes</label>
                        <input type="text" id="editAccDesc" value="${_escapeHtml(acc.description)}" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg">
                    </div>
                    <p class="text-[11px] text-gray-400 italic">Note: Account code #${_escapeHtml(acc.code)} and classification type are locked by double-entry governance rules.</p>
                </div>
                <div class="flex justify-end gap-2 pt-3 border-t border-gray-100">
                    <button onclick="document.getElementById('coaEditModal').remove()" class="btn btn-sm">Cancel</button>
                    <button onclick="VaultCOA.saveEditAccount(${acc.id})" class="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700">Save Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    async function saveEditAccount(accountId) {
        const name = document.getElementById('editAccName')?.value?.trim();
        const desc = document.getElementById('editAccDesc')?.value?.trim();

        if (!name) {
            alert('Please enter an account name.');
            return;
        }

        try {
            await callApi(`/api/accounting/accounts/${accountId}`, { name, description: desc }, 'PUT');
            document.getElementById('coaEditModal')?.remove();
            alert('Account updated successfully.');
            await load();
        } catch (err) {
            alert('Failed to update account: ' + (err.message || err));
        }
    }

    async function handleDeleteAccount(accountId) {
        const acc = _coaList.find(a => a.id === accountId);
        const name = acc ? acc.name : `ID ${accountId}`;

        if (!confirm(`Are you sure you want to permanently delete account '${name}'?\n\nNote: Deletion will be rejected if any ledger postings exist.`)) return;

        try {
            await callApi(`/api/accounting/accounts/${accountId}`, {}, 'DELETE');
            alert(`Account '${name}' deleted successfully.`);
            await load();
        } catch (err) {
            alert('Cannot delete account: ' + (err.message || err));
        }
    }

    function search() {
        _renderList();
    }

    return { 
        load, 
        search, 
        refreshStatement,
        openAddAccountModal,
        saveNewAccount,
        openEditAccountModal,
        saveEditAccount,
        handleDeleteAccount
    };
})();

window.VaultCOA = VaultCOA;
window.VaultCoa = VaultCOA;
