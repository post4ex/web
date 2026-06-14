// ============================================================================
// VAULT-CREDIT-NOTES.JS — Credit Notes from LEDGER collection
// Tile: credit-notes
// Data source: appData.LEDGER (ENTRY_TYPE === 'JOURNAL', JOURNAL_TYPE === 'CREDIT_NOTE', DIRECTION === 'OUTWARD')
// ============================================================================

const VaultCreditNotes = (() => {

    let _allLedger = [];

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, client, narration…';
    }

    function _getEntries() {
        return _allLedger.filter(e =>
            e.ENTRY_TYPE === 'JOURNAL' &&
            e.JOURNAL_TYPE === 'CREDIT_NOTE' &&
            e.DIRECTION === 'OUTWARD'
        );
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const entries = _getEntries();
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? entries.filter(e =>
                (e.CODE || '').toLowerCase().includes(q) ||
                (e.CLIENT_NAME || '').toLowerCase().includes(q) ||
                (e.NARRATION || '').toLowerCase().includes(q) ||
                (e.INV_NUMBER || '').toLowerCase().includes(q)
              )
            : entries;
        filtered.sort((a, b) => (b.ENTRY_DATE || 0) - (a.ENTRY_DATE || 0));

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No credit notes found.</li>`;
            return;
        }
        ul.innerHTML = filtered.map(e => {
            const amt = (+e.CREDIT || 0).toFixed(2);
            const statusColor = e.STATUS === 'ACTIVE' ? 'text-green-700' :
                                e.STATUS === 'PENDING' ? 'text-yellow-700' :
                                e.STATUS === 'VOID' ? 'text-red-700' : 'text-gray-700';
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-pink-50 border border-gray-200 transition-colors">
                <strong class="text-pink-700 block text-sm">📝 ${e.CLIENT_NAME || e.CODE || 'N/A'} — Cr ₹${amt}</strong>
                <span class="text-xs text-gray-500">${e.NARRATION || ''}</span>
                <div class="text-xs mt-1">
                    <span class="${statusColor} font-medium">${e.STATUS || ''}</span>
                    <span class="text-gray-400"> · ${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''}</span>
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(_allLedger.find(e => e.ENTRY_ID === li.dataset.entry));
            })
        );
    }

    function search() { _renderList(); }

    async function _handleDelete(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry || entry.STATUS === 'VOID') return;
        if (!confirm(`Delete this credit note? Amount: ₹${(+entry.CREDIT||0).toFixed(2)}. This will void and recalculate balances.`)) return;
        const reason = prompt('Reason for deletion (optional):', '') || '';
        try {
            await callApi('/api/ledger/void', { entry_id: entryId, void_reason: reason }, 'POST');
            const appData = await getAppData();
            if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _renderList(); }
            document.getElementById('vaultDetailView').innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8"><div class="text-4xl mb-3">🗑️</div><p class="text-gray-500 text-sm">Credit note deleted (voided).</p></div></div>`;
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';
        const delBtn = isActive ? `<button onclick="VaultCreditNotes._handleDelete('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Delete</button>` : '';
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">Credit Note Detail</h3>
                    <div class="flex gap-2">${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : delBtn}</div>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-500">Entry ID:</span> ${entry.ENTRY_ID}</div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Client:</span> ${entry.CLIENT_NAME || 'N/A'} (${entry.CODE || ''})</div>
                        <div><span class="text-gray-500">Status:</span> <span class="font-medium">${entry.STATUS || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Credit Amount:</span> <strong class="text-green-700">₹${(+entry.CREDIT||0).toFixed(2)}</strong></div>
                        <div><span class="text-gray-500">Running Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">Branch:</span> ${entry.BRANCH_NAME || entry.BRANCH || 'N/A'}</div>
                        <div><span class="text-gray-500">FY:</span> ${entry.FY || 'N/A'}</div>
                        <div class="col-span-2"><span class="text-gray-500">Narration:</span> ${entry.NARRATION || '—'}</div>
                        <div class="col-span-2 border-t pt-2 mt-1 grid grid-cols-2 gap-4">
                            <div><span class="text-gray-500">Created by:</span> ${entry.USER_NAME || 'N/A'}</div>
                            <div><span class="text-gray-500">Staff:</span> ${entry.STAFF_NAME || ''} ${entry.STAFF_CODE ? '('+entry.STAFF_CODE+')' : ''}</div>
                            ${entry.APPROVED_BY ? `<div><span class="text-gray-500">Approved by:</span> ${entry.APPROVED_BY}</div>` : ''}
                            ${entry.APPROVED_AT ? `<div><span class="text-gray-500">Approved at:</span> ${fmtDate(entry.APPROVED_AT)}</div>` : ''}
                            ${entry.VOID_REASON ? `<div class="col-span-2 text-red-600"><span class="text-gray-500">Void reason:</span> ${entry.VOID_REASON}</div>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── New Credit Note Form ─────────────────────────────────────────────────
    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">➕ New Credit Note</h3></div>
                <div class="detail-card-body">
                    <form id="cnForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                            <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="cnCodeList" autocomplete="off">
                            <datalist id="cnCodeList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                            <input name="branch" class="form-input text-sm uppercase" placeholder="Optional" list="cnBranchList">
                            <datalist id="cnBranchList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                            <input name="entry_date" type="date" required class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Credit Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" placeholder="0.00">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration *</label>
                            <input name="narration" required class="form-input text-sm" placeholder="Reason for credit note">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="cnBtnText">Create Credit Note</span>
                                <div id="cnSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="cnResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate datalists from app data
        getAppData().then(data => {
            if (data?.B2B) Object.values(data.B2B).forEach(c => {
                if (c.CODE) {
                    const dl = document.getElementById('cnCodeList');
                    const o = document.createElement('option');
                    o.value = c.CODE; o.textContent = `${c.CODE} - ${c.B2B_NAME || ''}`;
                    dl.appendChild(o);
                }
            });
            if (data?.BRANCHES) Object.values(data.BRANCHES).forEach(b => {
                if (b.BRANCH_CODE) {
                    const dl = document.getElementById('cnBranchList');
                    const o = document.createElement('option');
                    o.value = b.BRANCH_CODE; o.textContent = b.BRANCH_NAME || b.BRANCH_CODE;
                    dl.appendChild(o);
                }
            });
        });

        document.getElementById('cnForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('cnSpinner');
            const resp = document.getElementById('cnResponse');
            btn.disabled = true; sp.classList.remove('hidden');

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            const amount = parseFloat(data.amount);
            try {
                const res = await callApi('/api/ledger/journal', {
                    code: data.code,
                    entry_date: toMs(data.entry_date),
                    journal_type: 'CREDIT_NOTE',
                    narration: data.narration,
                    branch: data.branch || '',
                    debit: 0,
                    credit: amount,
                }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Credit Note created. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) {
                    _allLedger = Object.values(appData.LEDGER);
                    _renderList();
                }
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

    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            _renderList();
        }
    }

    return { load, search, openAddPane, _handleDelete };
})();

window.VaultCreditNotes = VaultCreditNotes;
