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

    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Credit Note Detail</h3></div>
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

    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            _renderList();
        }
    }

    return { load, search };
})();

window.VaultCreditNotes = VaultCreditNotes;
