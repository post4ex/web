// ============================================================================
// VAULT-ACCOUNTS.JS — Cheque tracking + Bank account reference
// Tiles: cheques, bank-accounts
// API: GET /api/ledger/payment (via cache), POST /api/ledger/payment
// ============================================================================

const VaultAccounts = (() => {

    let _allLedger = [];
    let _allBranches = [];
    let _allCarriers = [];
    let _b2bMap = new Map();
    let _activeTile = 'cheques';

    function _can(role) { return window.VaultPage?.can(role); }
    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    // ── Common list injection ─────────────────────────────────────────────────
    function _injectListPane(placeholder) {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = placeholder || 'Search…';
    }

    // ========================================================================
    // CHEQUES TILE
    // ========================================================================

    function _renderChequesList(entries) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const filtered = entries.filter(e => e.PAYMENT_MODE === 'CHEQUE' && e.ENTRY_TYPE === 'PAYMENT');
        filtered.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!filtered.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No cheque entries found.</li>';
            return;
        }
        ul.innerHTML = filtered.slice(0, 100).map(e => {
            const dir = e.DIRECTION === 'INWARD' ? '📤' : '📥';
            const amt = (+e.CREDIT || +e.DEBIT || 0);
            const statusColor = e.STATUS === 'ACTIVE' ? 'text-green-600' : e.STATUS === 'PENDING' ? 'text-yellow-600' : 'text-gray-400';
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 border border-gray-200 transition-colors">
                <strong class="text-blue-700 block text-sm">${dir} ${e.CHEQUE_NUMBER || 'N/A'} — ₹${amt.toFixed(2)}</strong>
                <span class="text-xs text-gray-500">${e.BANK_NAME || 'N/A'} · ${e.CODE || ''}</span>
                <div class="flex gap-2 text-xs mt-1">
                    <span class="text-gray-400">${e.CHEQUE_DATE ? _fmt(e.CHEQUE_DATE, 'date') : ''}</span>
                    <span class="${statusColor} font-medium">${e.STATUS || ''}</span>
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderChequeDetail(_allLedger.find(e => e.ENTRY_ID === li.dataset.entry));
            })
        );
    }

    async function _updateChequeStatus(entryId, newStatus) {
        const note = newStatus === 'BOUNCED' ? (prompt('Reason for bounce:') || '') : '';
        try {
            const res = await callApi('/api/ledger/cheque-status', { entry_id: entryId, cheque_status: newStatus, note }, 'PATCH');
            if (res.status === 'success') {
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderChequesList(_allLedger);
                _renderChequeDetail(_allLedger.find(e => e.ENTRY_ID === entryId));
            }
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    function _renderChequeDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const amt = (+entry.CREDIT || +entry.DEBIT || 0);
        const dir = entry.DIRECTION === 'INWARD' ? 'Payment to vendor' : 'Receipt from client';
        const isActive = entry.STATUS === 'ACTIVE';
        const chqStatus = entry.CHEQUE_STATUS || 'PENDING';
        const chqStatusBadge = chqStatus === 'CLEARED' ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">✅ CLEARED</span>' :
            chqStatus === 'BOUNCED' ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">💥 BOUNCED</span>' :
            '<span class="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">⏳ PENDING</span>';
        const actionBtns = isActive && chqStatus === 'PENDING' ? `
            <span class="flex gap-2 mt-3">
                <button onclick="VaultAccounts._updateChequeStatus('${entry.ENTRY_ID}', 'CLEARED')" class="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">✅ Mark Cleared</button>
                <button onclick="VaultAccounts._updateChequeStatus('${entry.ENTRY_ID}', 'BOUNCED')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200">💥 Mark Bounced</button>
            </span>` : '';
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">🏦 Cheque Detail</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div class="sm:col-span-2 bg-blue-50 rounded-lg p-4 border border-blue-200">
                            <div class="flex items-center justify-between">
                                <div><div class="text-lg font-bold text-blue-800">₹${amt.toFixed(2)}</div><div class="text-xs text-blue-600">${dir}</div></div>
                                <div>${chqStatusBadge}</div>
                            </div>
                            ${actionBtns}
                        </div>
                        <div><span class="text-gray-500">Cheque No:</span> <span class="font-semibold">${entry.CHEQUE_NUMBER || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Cheque Date:</span> ${entry.CHEQUE_DATE ? _fmt(entry.CHEQUE_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Bank:</span> ${entry.BANK_NAME || 'N/A'}</div>
                        <div><span class="text-gray-500">Client/Vendor:</span> ${entry.CODE || 'N/A'}</div>
                        <div><span class="text-gray-500">Direction:</span> ${entry.DIRECTION || 'N/A'}</div>
                        <div><span class="text-gray-500">Ledger Status:</span> ${entry.STATUS || 'N/A'}</div>
                        <div><span class="text-gray-500">Entry ID:</span> <span class="font-mono text-xs">${entry.ENTRY_ID || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Entry Date:</span> ${entry.ENTRY_DATE ? _fmt(entry.ENTRY_DATE) : 'N/A'}</div>
                        ${entry.AGAINST_ENTRY ? `<div><span class="text-gray-500">Against:</span> ${entry.AGAINST_ENTRY}</div>` : ''}
                        ${entry.NARRATION ? `<div class="sm:col-span-2"><span class="text-gray-500">Narration:</span> ${entry.NARRATION}</div>` : ''}
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function _openChequeAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">🏦 Record Cheque Payment</h3></div>
                <div class="detail-card-body">
                    <form id="chequeForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Direction *</label>
                            <select name="direction" required class="form-input text-sm">
                                <option value="OUTWARD">Receipt (client pays us)</option>
                                <option value="INWARD">Payment (we pay vendor)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Client/Vendor Code *</label>
                            <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="chqCodeList">
                            <datalist id="chqCodeList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Entry Date *</label>
                            <input name="entry_date" type="date" required class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Cheque Number *</label>
                            <input name="cheque_number" required class="form-input text-sm" placeholder="e.g. 000123">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Cheque Date *</label>
                            <input name="cheque_date" type="date" required class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Bank Name *</label>
                            <input name="bank_name" required class="form-input text-sm" placeholder="e.g. HDFC Bank" list="bankNameList">
                            <datalist id="bankNameList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Vendor Type <span class="text-gray-400">(for payments)</span></label>
                            <select name="vendor_type" class="form-input text-sm">
                                <option value="">N/A</option>
                                <option value="B2B">B2B Vendor</option>
                                <option value="CARRIER">Carrier</option>
                            </select>
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration</label>
                            <input name="narration" class="form-input text-sm" placeholder="Optional description">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="chqBtnText">Save Cheque</span>
                                <div id="chqSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="chqResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate code datalist
        const dl = document.getElementById('chqCodeList');
        _b2bMap.forEach((v, k) => {
            const opt = document.createElement('option');
            opt.value = k; opt.label = `${k} - ${v.B2B_NAME || ''}`;
            dl.appendChild(opt);
        });

        // Bank name suggestions
        const bankDl = document.getElementById('bankNameList');
        const knownBanks = ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak Mahindra', 'Yes Bank', 'PNB', 'BOB', 'Canara Bank', 'Union Bank'];
        knownBanks.forEach(b => { const o = document.createElement('option'); o.value = b; bankDl.appendChild(o); });

        document.getElementById('chequeForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('chqSpinner');
            const resp = document.getElementById('chqResponse');
            btn.disabled = true; sp.classList.remove('hidden');

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                const isOutward = data.direction === 'OUTWARD';
                const endpoint = isOutward ? '/api/ledger/payment' : '/api/ledger/inward/payment';
                const body = {
                    code: data.code,
                    entry_date: toMs(data.entry_date),
                    credit: parseFloat(data.amount),
                    payment_mode: 'CHEQUE',
                    cheque_number: data.cheque_number,
                    cheque_date: toMs(data.cheque_date),
                    bank_name: data.bank_name,
                    narration: data.narration || '',
                    branch: '',
                    ...(isOutward ? {} : { vendor_type: data.vendor_type || 'B2B' }),
                };
                const res = await callApi(endpoint, body, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Cheque recorded. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderChequesList(_allLedger);
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });

        const d = document.querySelector('[name="entry_date"]');
        if (d) d.value = new Date().toISOString().split('T')[0];

        VaultPage.showDetailPane();
    }

    function _searchCheques(q) {
        const lq = q.toLowerCase();
        _renderChequesList(_allLedger.filter(e =>
            (e.CHEQUE_NUMBER || '').toLowerCase().includes(lq) ||
            (e.BANK_NAME || '').toLowerCase().includes(lq) ||
            (e.CODE || '').toLowerCase().includes(lq) ||
            (e.NARRATION || '').toLowerCase().includes(lq)
        ));
    }

    // ========================================================================
    // BANK ACCOUNTS TILE
    // ========================================================================

    function _computeBankBalance(code) {
        let balance = 0;
        const entries = _allLedger.filter(e => e.STATUS === 'ACTIVE' && e.CODE === code);
        entries.forEach(e => {
            if (e.DIRECTION === 'OUTWARD') balance += (+e.DEBIT||0) - (+e.CREDIT||0);
            else balance += (+e.CREDIT||0) - (+e.DEBIT||0);
        });
        return balance;
    }

    function _renderBankAccounts() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        // Collect bank accounts from branches
        const branchAccounts = (_allBranches || []).filter(b => b.BRANCH_BANK_NAME || b.BRANCH_UPI).map(b => ({
            type: 'Branch',
            name: b.BRANCH_NAME || b.BRANCH_CODE || '',
            code: b.BRANCH_CODE || '',
            bank: b.BRANCH_BANK_NAME || '',
            account: b.BRANCH_BANK_AC || '',
            ifsc: b.BRANCH_IFSC || '',
            upi: b.BRANCH_UPI || '',
            upiName: b.BRANCH_UPI_NAME || '',
            balance: _computeBankBalance(b.BRANCH_CODE),
        }));

        // Collect bank accounts from carriers
        const carrierAccounts = (_allCarriers || []).filter(c => c.BANK_NAME || c.UPI).map(c => ({
            type: 'Carrier',
            name: c.COMPANY_NAME || c.COMPANY_CODE || '',
            code: c.COMPANY_CODE || '',
            bank: c.BANK_NAME || '',
            account: c.BANK_AC || '',
            ifsc: c.IFSC || '',
            upi: c.UPI || '',
            upiName: '',
            balance: _computeBankBalance(c.COMPANY_CODE),
        }));

        const allAccounts = [...branchAccounts, ...carrierAccounts];
        const total = allAccounts.length;
        const totalBalance = allAccounts.reduce((s, a) => s + a.balance, 0);

        view.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">🏛️ Bank Accounts</h3>
                    <p class="text-xs text-gray-500">${total} accounts · Total: ₹${totalBalance.toFixed(2)}</p>
                </div>
            </div>
            ${total ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                ${allAccounts.map(a => {
                    const balClass = a.balance >= 0 ? 'text-green-600' : 'text-red-600';
                    return `<div class="detail-card hover:shadow-md transition-shadow">
                        <div class="detail-card-header flex items-center justify-between">
                            <h3 class="font-semibold text-gray-700 text-sm">${a.bank || 'N/A'}</h3>
                            <span class="text-xs px-2 py-0.5 rounded-full ${a.type === 'Branch' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">${a.type}</span>
                        </div>
                        <div class="detail-card-body space-y-2 text-sm">
                            <div class="flex justify-between items-center"><span class="text-gray-500">Entity:</span><span class="font-medium">${a.name}</span></div>
                            <div class="flex justify-between items-center"><span class="text-gray-500">Ledger Balance:</span><span class="font-semibold ${balClass}">₹${a.balance.toFixed(2)}</span></div>
                            ${a.account ? `<div class="flex justify-between"><span class="text-gray-500">A/C No:</span><span class="font-mono text-xs">${a.account}</span></div>` : ''}
                            ${a.ifsc ? `<div class="flex justify-between"><span class="text-gray-500">IFSC:</span><span class="font-mono text-xs">${a.ifsc}</span></div>` : ''}
                            ${a.upi ? `<div class="flex justify-between"><span class="text-gray-500">UPI:</span><span class="font-mono text-xs">${a.upi}</span></div>` : ''}
                        </div>
                    </div>`;
                }).join('')}
            </div>` : '<div class="detail-card"><div class="detail-card-body text-center text-gray-400 py-8">No bank accounts found.</div></div>'}`;

        VaultPage.showDetailPane();
    }

    // ========================================================================
    // LOAD & ROUTING
    // ========================================================================

    function search(q) {
        if (_activeTile === 'cheques') _searchCheques(q);
    }

    async function load() {
        const data = await getAppData();
        if (!data) return;

        _allLedger = Object.values(data.LEDGER || {});
        _allBranches = Object.values(data.BRANCHES || {});
        _allCarriers = Object.values(data.CARRIERS || {});
        _b2bMap.clear();
        if (data.B2B) Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));

        _injectListPane('Search cheque number, bank…');

        if (_activeTile === 'cheques') {
            _renderChequesList(_allLedger);
        } else if (_activeTile === 'bank-accounts') {
            document.getElementById('vaultListPane').style.display = 'none';
            document.getElementById('vaultAddBtn').classList.add('hidden');
            _renderBankAccounts();
        }
    }

    function setTile(tile) { _activeTile = tile; }

    return { load, search, setTile, _openChequeAddPane, _updateChequeStatus };
})();

window.VaultAccounts = VaultAccounts;
