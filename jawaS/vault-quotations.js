// ============================================================================
// VAULT-QUOTATIONS.JS — Quotations (LEDGER-based)
// Tile: quotations
// API: POST /api/ledger/journal with journal_type='QUOTATION'
// Data: LEDGER entries with ENTRY_TYPE='JOURNAL' && JOURNAL_TYPE='QUOTATION'
// ============================================================================

const VaultQuotations = (() => {

    let _allLedger = [];
    let _allB2B = [];

    function _can(role) { return window.VaultPage?.can(role); }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, narration…';
    }

    function _renderList(entries) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const filtered = entries.filter(e => e.JOURNAL_TYPE === 'QUOTATION');
        filtered.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!filtered.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No quotations found.</li>';
            return;
        }
        ul.innerHTML = filtered.slice(0, 50).map(e => {
            const amt = (+e.DEBIT||0).toFixed(2);
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-cyan-50 border border-gray-200 transition-colors">
                <strong class="text-cyan-700 block text-sm">📋 ${e.CODE || '—'} — ₹${amt}</strong>
                <span class="text-xs text-gray-500">${e.NARRATION ? e.NARRATION.substring(0, 60) : ''}</span>
                <div class="text-xs text-gray-400 mt-1">${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''} · ${e.STATUS || ''}</div>
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

    function search(q) {
        const lq = q.toLowerCase();
        _renderList(_allLedger.filter(e =>
            e.JOURNAL_TYPE === 'QUOTATION' && (
                (e.CODE || '').toLowerCase().includes(lq) ||
                (e.NARRATION || '').toLowerCase().includes(lq)
            )
        ));
    }

    async function _handleDelete(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry || entry.STATUS === 'VOID') return;
        if (!confirm('Delete this quotation?')) return;
        const reason = prompt('Reason (optional):', '') || '';
        try {
            await callApi('/api/ledger/void', { entry_id: entryId, void_reason: reason }, 'POST');
            const appData = await getAppData();
            if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _renderList(_allLedger); }
            document.getElementById('vaultDetailView').innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8"><div class="text-4xl mb-3">🗑️</div><p class="text-gray-500 text-sm">Quotation deleted (voided).</p></div></div>`;
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';
        const delBtn = isActive ? `<button onclick="VaultQuotations._handleDelete('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Delete</button>` : '';
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">Quotation Detail</h3>
                    <div class="flex gap-2">${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : delBtn}</div>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-500">Entry ID:</span> ${entry.ENTRY_ID}</div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Client Code:</span> ${entry.CODE || 'N/A'}</div>
                        <div><span class="text-gray-500">Amount:</span> ₹${(+entry.DEBIT||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">Status:</span> ${entry.STATUS || 'N/A'}</div>
                        ${entry.NARRATION ? `<div class="col-span-2"><span class="text-gray-500">Description:</span> ${entry.NARRATION}</div>` : ''}
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📋 New Quotation</h3></div>
                <div class="detail-card-body">
                    <form id="quotForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                            <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="quotCodeList">
                            <datalist id="quotCodeList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                            <input name="entry_date" type="date" required class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" placeholder="0.00">
                        </div>
                        <div></div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Description *</label>
                            <textarea name="narration" required class="form-input text-sm" rows="3" placeholder="Describe the quotation items / services"></textarea>
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="quotBtnText">Save Quotation</span>
                                <div id="quotSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="quotResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate code datalist
        const dl = document.getElementById('quotCodeList');
        _allB2B.forEach(c => {
            if (c.CODE) { const o = document.createElement('option'); o.value = c.CODE; o.label = `${c.CODE} - ${c.B2B_NAME || ''}`; dl.appendChild(o); }
        });

        document.getElementById('quotForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('quotSpinner');
            const resp = document.getElementById('quotResponse');
            btn.disabled = true; sp.classList.remove('hidden');
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                const res = await callApi('/api/ledger/journal', {
                    code: data.code,
                    entry_date: toMs(data.entry_date),
                    journal_type: 'QUOTATION',
                    narration: data.narration,
                    branch: '',
                    debit: parseFloat(data.amount),
                    credit: 0,
                }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = '✅ Quotation saved.';
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderList(_allLedger);
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
        document.getElementById('vaultSearch').oninput = (e) => search(e.target ? e.target.value : '');
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            _allB2B = data.B2B ? Object.values(data.B2B) : [];
            _renderList(_allLedger);
        }
    }

    return { load, search, openAddPane, _handleDelete };
})();

window.VaultQuotations = VaultQuotations;
