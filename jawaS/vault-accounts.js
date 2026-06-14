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
    let _coaMap      = {};
    let _activeTile = 'cheques';

    function _can(role) { return window.VaultPage?.can(role); }

    // ── COA cache ─────────────────────────────────────────────────────────────
    async function _loadCoaCache() {
        try {
            const res = await callApi('/api/coa', {}, 'GET');
            if (res?.data) { res.data.forEach(a => _coaMap[a.code] = a); }
        } catch {}
    }

    function _coaName(code) {
        if (!code) return '';
        const a = _coaMap[code];
        return a ? `${a.code} — ${a.name}` : code;
    }

    // ── Parse NARRATION ───────────────────────────────────────────────────────
    function _parseNarration(entry) {
        try {
            const p = JSON.parse(entry.NARRATION || '{}');
            if (p.charges || p.grand_total !== undefined) return p;
        } catch (_) {}
        return null;
    }

    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    // ── Render charge popup ────────────────────────────────────────────────────
    function _renderChargePopup(entry) {
        const parsed = _parseNarration(entry);
        if (!parsed) return '';
        const charges = parsed.charges || {};
        const chargeKeys = Object.keys(charges).filter(k => charges[k]);
        if (!chargeKeys.length) return '';
        return `<div class="mt-3 bg-gray-50 border rounded-lg p-3 text-xs">
            <div class="font-semibold text-gray-700 mb-2">🧾 Charge Breakdown</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                ${chargeKeys.map(k => `<div class="flex justify-between"><span class="text-gray-500 capitalize">${k.replace(/_/g, ' ')}</span><span>₹${(+charges[k]).toFixed(2)}</span></div>`).join('')}
                ${parsed.subtotal !== undefined ? `<div class="flex justify-between border-t pt-1 mt-1 col-span-2"><span class="font-medium">Subtotal</span><span>₹${(+parsed.subtotal).toFixed(2)}</span></div>` : ''}
                ${parsed.taxable !== undefined ? `<div class="flex justify-between col-span-2"><span class="text-gray-500">Taxable</span><span>₹${(+parsed.taxable).toFixed(2)}</span></div>` : ''}
                ${parsed.sgst !== undefined && parsed.cgst !== undefined ? `<div class="flex justify-between col-span-2"><span class="text-gray-500">SGST @${parsed.gst_rate || ''}%</span><span>₹${(+parsed.sgst).toFixed(2)}</span></div><div class="flex justify-between col-span-2"><span class="text-gray-500">CGST @${parsed.gst_rate || ''}%</span><span>₹${(+parsed.cgst).toFixed(2)}</span></div>` : ''}
                ${parsed.igst !== undefined ? `<div class="flex justify-between col-span-2"><span class="text-gray-500">IGST @${parsed.gst_rate || ''}%</span><span>₹${(+parsed.igst).toFixed(2)}</span></div>` : ''}
                ${parsed.grand_total !== undefined ? `<div class="flex justify-between border-t pt-1 mt-1 col-span-2 font-semibold text-gray-800"><span>Grand Total</span><span>₹${(+parsed.grand_total).toFixed(2)}</span></div>` : ''}
            </div>
        </div>`;
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

    function _getEntries() {
        return _allLedger.filter(e => e.PAYMENT_MODE === 'CHEQUE' && e.ENTRY_TYPE === 'PAYMENT');
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const entries = _getEntries();
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? entries.filter(e =>
                (e.CHEQUE_NUMBER || '').toLowerCase().includes(q) ||
                (e.BANK_NAME || '').toLowerCase().includes(q) ||
                (e.CODE || '').toLowerCase().includes(q) ||
                (e.CLIENT_NAME || '').toLowerCase().includes(q) ||
                (e.NARRATION || '').toLowerCase().includes(q)
              )
            : entries;
        filtered.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!filtered.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No cheque entries found.</li>';
            return;
        }
        ul.innerHTML = filtered.slice(0, 100).map(e => {
            const dir = e.DIRECTION === 'INWARD' ? '📤' : '📥';
            const amt = (+e.CREDIT || +e.DEBIT || 0);
            const statusColor = e.STATUS === 'ACTIVE' ? 'text-green-700' :
                                e.STATUS === 'PENDING' ? 'text-yellow-700' :
                                e.STATUS === 'VOID' ? 'text-red-700' : 'text-gray-700';
            const chqBadge = (e.CHEQUE_STATUS || 'PENDING') === 'CLEARED' ? '<span class="text-green-600">✅</span>' :
                             (e.CHEQUE_STATUS || 'PENDING') === 'BOUNCED' ? '<span class="text-red-600">💥</span>' :
                             '<span class="text-yellow-600">⏳</span>';
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <div>
                        <strong class="text-blue-700 block text-sm">${chqBadge} ${e.CHEQUE_NUMBER || 'N/A'} — ₹${amt.toFixed(2)}</strong>
                        <span class="text-xs text-gray-500">${e.BANK_NAME || 'N/A'} · ${e.CLIENT_NAME || e.CODE || ''}</span>
                    </div>
                    <span class="${statusColor} text-xs font-medium">${e.STATUS || ''}</span>
                </div>
                <div class="flex gap-3 text-xs mt-1">
                    <span class="text-gray-400">${e.CHEQUE_DATE ? _fmt(e.CHEQUE_DATE, 'date') : ''}</span>
                    <span class="text-gray-400">Bal: ₹${(+e.BALANCE||0).toFixed(2)}</span>
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
                _renderList();
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
        const isVoid = entry.STATUS === 'VOID';
        const chqStatus = entry.CHEQUE_STATUS || 'PENDING';
        const chqStatusBadge = chqStatus === 'CLEARED' ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">✅ CLEARED</span>' :
            chqStatus === 'BOUNCED' ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">💥 BOUNCED</span>' :
            '<span class="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">⏳ PENDING</span>';
        const actionBtns = isActive && chqStatus === 'PENDING' ? `
            <span class="flex gap-2 mt-3">
                <button onclick="VaultAccounts._updateChequeStatus('${entry.ENTRY_ID}', 'CLEARED')" class="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">✅ Mark Cleared</button>
                <button onclick="VaultAccounts._updateChequeStatus('${entry.ENTRY_ID}', 'BOUNCED')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200">💥 Mark Bounced</button>
            </span>` : '';

        const coaDr = _coaName(entry.COA_DR);
        const coaCr = _coaName(entry.COA_CR);
        const chargePopup = isActive ? _renderChargePopup(entry) : '';

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">🏦 Cheque Detail</h3>
                    <div class="flex gap-2 items-center">
                        ${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : ''}
                        <span class="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">₹${amt.toFixed(2)}</span>
                    </div>
                </div>
                <div class="detail-card-body">
                    <!-- Amount & Status -->
                    <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="text-lg font-bold text-blue-800">₹${amt.toFixed(2)}</div>
                                <div class="text-xs text-blue-600">${dir}</div>
                            </div>
                            <div class="text-right">
                                <div>${chqStatusBadge}</div>
                                <div class="text-xs text-gray-500 mt-1">Ledger: ${entry.STATUS || 'N/A'}</div>
                            </div>
                        </div>
                        ${actionBtns}
                    </div>

                    <!-- Cheque Details -->
                    <div class="grid grid-cols-2 gap-3 text-sm mt-3 bg-white border rounded-lg p-3">
                        <div><span class="text-gray-500">Cheque No:</span> <span class="font-semibold">${entry.CHEQUE_NUMBER || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Cheque Date:</span> ${entry.CHEQUE_DATE ? _fmt(entry.CHEQUE_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Bank:</span> ${entry.BANK_NAME || 'N/A'}</div>
                        <div><span class="text-gray-500">Client/Vendor:</span> ${entry.CLIENT_NAME || entry.CODE || 'N/A'}</div>
                        <div><span class="text-gray-500">Direction:</span> ${entry.DIRECTION || 'N/A'}</div>
                        <div><span class="text-gray-500">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                    </div>

                    <!-- Charge breakdown popup -->
                    ${chargePopup}

                    <!-- COA -->
                    <div class="text-xs text-gray-400 mt-2 flex gap-4">
                        <span>Dr: ${coaDr}</span>
                        <span>Cr: ${coaCr}</span>
                    </div>

                    <!-- Narration -->
                    ${entry.NARRATION ? `<div class="text-sm text-gray-700 mt-2 bg-white border rounded-lg p-3">📝 ${entry.NARRATION}</div>` : ''}

                    <!-- Audit info -->
                    <details class="mt-4">
                        <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Audit Info</summary>
                        <div class="grid grid-cols-2 gap-3 text-xs text-gray-500 mt-2 p-3 border rounded-lg">
                            <div>Entry ID: <span class="font-mono">${entry.ENTRY_ID}</span></div>
                            <div>FY: ${entry.FY || 'N/A'}</div>
                            <div>Entry Date: ${entry.ENTRY_DATE ? _fmt(entry.ENTRY_DATE) : 'N/A'}</div>
                            <div>Created: ${entry.USER_NAME || 'N/A'}</div>
                            ${entry.AGAINST_ENTRY ? `<div>Against: ${entry.AGAINST_ENTRY}</div>` : ''}
                            ${entry.VOID_REASON ? `<div class="col-span-2 text-red-600">Void: ${entry.VOID_REASON}</div>` : ''}
                        </div>
                    </details>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function _openChequeAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">🏦 Record Cheque / PDC</h3></div>
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
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                            <select name="branch" class="form-input text-sm">
                                <option value="">All Branches</option>
                            </select>
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

        // Populate branch dropdown
        getAppData().then(data => {
            const branchSelect = document.querySelector('select[name="branch"]');
            if (branchSelect && data?.BRANCHES) {
                Object.values(data.BRANCHES).forEach(b => {
                    if (b.BRANCH_CODE) {
                        const opt = document.createElement('option');
                        opt.value = b.BRANCH_CODE;
                        opt.textContent = b.BRANCH_NAME || b.BRANCH_CODE;
                        branchSelect.appendChild(opt);
                    }
                });
            }
        });

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
                    branch: data.branch || '',
                    ...(isOutward ? {} : { vendor_type: data.vendor_type || 'B2B' }),
                };
                const res = await callApi(endpoint, body, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Cheque recorded. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderList();
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

    function _getBankAccounts() {
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
            raw: b,
        }));

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
            raw: c,
        }));

        return [...branchAccounts, ...carrierAccounts];
    }

    function _renderBankAccountStatement(code, name) {
        const entries = _allLedger.filter(e => e.CODE === code && e.STATUS === 'ACTIVE')
            .sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!entries.length) return '<div class="text-xs text-gray-400 text-center py-4">No transactions for this account.</div>';
        return `<div class="text-xs mt-1">
            <div class="font-semibold text-gray-600 mb-2">Recent Transactions</div>
            <div class="space-y-1 max-h-64 overflow-y-auto">
                ${entries.slice(0, 25).map(e => {
                    const amt = (+e.DEBIT||0) - (+e.CREDIT||0);
                    const dirLabel = amt >= 0 ? 'Dr' : 'Cr';
                    const absAmt = Math.abs(amt);
                    return `<div class="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                        <div>
                            <span class="${amt >= 0 ? 'text-red-600' : 'text-green-600'} font-medium">${dirLabel} ₹${absAmt.toFixed(2)}</span>
                            <span class="text-gray-400 ml-2">${e.ENTRY_DATE ? _fmt(e.ENTRY_DATE, 'date') : ''}</span>
                        </div>
                        <span class="text-gray-500 text-xs">${e.NARRATION ? (e.NARRATION.length > 30 ? e.NARRATION.slice(0, 30) + '…' : e.NARRATION) : e.ENTRY_TYPE || ''}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    function _copyToClipboard(text, label) {
        navigator.clipboard?.writeText(text).then(() => {
            const toast = document.getElementById('vaultToast') || (() => {
                const t = document.createElement('div');
                t.id = 'vaultToast';
                t.className = 'fixed bottom-4 right-4 bg-green-700 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50 transition-opacity duration-300';
                document.body.appendChild(t);
                return t;
            })();
            toast.textContent = `✅ ${label} copied!`;
            toast.classList.remove('opacity-0');
            setTimeout(() => toast.classList.add('opacity-0'), 2000);
        }).catch(() => {});
    }

    function _renderBankAccountDetail(acct) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const balClass = acct.balance >= 0 ? 'text-green-600' : 'text-red-600';
        const upiLink = acct.upi ? `upi://pay?pa=${encodeURIComponent(acct.upi)}${acct.upiName ? '&pn=' + encodeURIComponent(acct.upiName) : ''}` : '';
        const qrUrl = upiLink ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}` : '';

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h3 class="font-semibold text-gray-700">🏛️ ${acct.bank}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full ${acct.type === 'Branch' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">${acct.type}</span>
                    </div>
                    <span class="font-semibold ${balClass} text-lg">₹${acct.balance.toFixed(2)}</span>
                </div>
                <div class="detail-card-body">
                    <!-- Entity info -->
                    <div class="grid grid-cols-1 gap-3 text-sm mb-4 bg-gray-50 p-3 rounded-lg">
                        <div><span class="text-gray-500">Entity:</span> <span class="font-semibold">${acct.name}</span></div>
                        <div><span class="text-gray-500">Code:</span> <span class="font-mono text-xs">${acct.code}</span></div>
                    </div>

                    <!-- Bank Details with Copy buttons -->
                    <div class="grid grid-cols-1 gap-3 mb-4">
                        <div class="bg-white border rounded-lg p-3">
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="text-xs text-gray-500 mb-1">Account Number</div>
                                    <div class="font-mono text-sm font-semibold">${acct.account || 'N/A'}</div>
                                </div>
                                ${acct.account ? `<button onclick="VaultAccounts._copyToClipboard('${acct.account.replace(/'/g, "\\'")}', 'A/C No')" class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">📋 Copy</button>` : ''}
                            </div>
                        </div>
                        <div class="bg-white border rounded-lg p-3">
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="text-xs text-gray-500 mb-1">IFSC Code</div>
                                    <div class="font-mono text-sm font-semibold">${acct.ifsc || 'N/A'}</div>
                                </div>
                                ${acct.ifsc ? `<button onclick="VaultAccounts._copyToClipboard('${acct.ifsc.replace(/'/g, "\\'")}', 'IFSC')" class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">📋 Copy</button>` : ''}
                            </div>
                        </div>
                        ${acct.upi ? `<div class="bg-white border rounded-lg p-3">
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="text-xs text-gray-500 mb-1">UPI ID</div>
                                    <div class="font-mono text-sm font-semibold">${acct.upi}</div>
                                    ${acct.upiName ? `<div class="text-xs text-gray-400 mt-1">${acct.upiName}</div>` : ''}
                                </div>
                                <button onclick="VaultAccounts._copyToClipboard('${acct.upi.replace(/'/g, "\\'")}', 'UPI ID')" class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">📋 Copy</button>
                            </div>
                            ${qrUrl ? `<div class="mt-3 flex justify-center"><img src="${qrUrl}" alt="UPI QR" class="w-32 h-32 border rounded-lg" crossorigin="anonymous" onerror="this.style.display='none'"></div>` : ''}
                            ${qrUrl ? `<div class="text-center mt-2"><a href="${upiLink}" target="_blank" class="text-xs text-blue-600 underline">Open in UPI app</a></div>` : ''}
                        </div>` : ''}
                    </div>

                    <!-- Balance & Summary -->
                    <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3 mb-4">
                        <div><span class="text-gray-500">Ledger Balance:</span> <span class="font-semibold ${balClass}">₹${acct.balance.toFixed(2)}</span></div>
                        <div><span class="text-gray-500">Bank:</span> ${acct.bank}</div>
                    </div>

                    <!-- Statement -->
                    ${_renderBankAccountStatement(acct.code, acct.name)}
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function _renderBankAccounts() {
        _injectListPane('Search bank, entity, account…');
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        const allAccounts = _getBankAccounts();
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? allAccounts.filter(a =>
                (a.bank || '').toLowerCase().includes(q) ||
                (a.name || '').toLowerCase().includes(q) ||
                (a.code || '').toLowerCase().includes(q) ||
                (a.account || '').toLowerCase().includes(q) ||
                (a.ifsc || '').toLowerCase().includes(q) ||
                (a.upi || '').toLowerCase().includes(q)
              )
            : allAccounts;
        const total = allAccounts.length;
        const totalBalance = allAccounts.reduce((s, a) => s + a.balance, 0);

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">${q ? 'No matching accounts.' : 'No bank accounts found.'}</li>`;
            return;
        }

        // Summary bar
        document.getElementById('vaultListMsg').innerHTML = `<div class="flex items-center justify-between text-xs text-gray-500 px-1 mb-2">
            <span>${total} accounts · ₹${totalBalance.toFixed(2)} total</span>
            <span class="text-gray-400">${filtered.length} shown</span>
        </div>`;

        ul.innerHTML = filtered.map(a => {
            const balClass = a.balance >= 0 ? 'text-green-600' : 'text-red-600';
            return `<li data-code="${a.code}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <div>
                        <strong class="text-gray-800 block text-sm">${a.bank || 'N/A'}</strong>
                        <span class="text-xs text-gray-500">${a.name} · ${a.type}</span>
                    </div>
                    <span class="font-semibold ${balClass} text-sm">₹${a.balance.toFixed(2)}</span>
                </div>
                <div class="flex gap-2 text-xs mt-1">
                    ${a.account ? `<span class="font-mono text-gray-400">${a.account}</span>` : ''}
                    ${a.ifsc ? `<span class="font-mono text-gray-400">${a.ifsc}</span>` : ''}
                    ${a.upi ? `<span class="text-gray-400">UPI ✓</span>` : ''}
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                const acct = allAccounts.find(a => a.code === li.dataset.code);
                if (acct) _renderBankAccountDetail(acct);
            })
        );
        VaultPage.showDetail(false);
    }

    // ========================================================================
    // LOAD & ROUTING
    // ========================================================================

    function search() {
        if (_activeTile === 'cheques') _renderList();
        else if (_activeTile === 'bank-accounts') _renderBankAccounts();
    }

    async function load() {
        const data = await getAppData();
        if (!data) return;

        _allLedger = Object.values(data.LEDGER || {});
        _allBranches = Object.values(data.BRANCHES || {});
        _allCarriers = Object.values(data.CARRIERS || {});
        _b2bMap.clear();
        if (data.B2B) Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));

        _injectListPane('Search cheque number, bank, party…');
        await _loadCoaCache();

        // Wire search input
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();

        if (_activeTile === 'cheques') {
            _renderList();
        } else if (_activeTile === 'bank-accounts') {
            document.getElementById('vaultAddBtn').classList.add('hidden');
            _renderBankAccounts();
        }
    }

    function setTile(tile) { _activeTile = tile; }

    return { load, search, setTile, _openChequeAddPane, _updateChequeStatus, _copyToClipboard };
})();

window.VaultAccounts = VaultAccounts;
