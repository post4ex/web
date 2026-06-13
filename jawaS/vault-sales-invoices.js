// ============================================================================
// VAULT-SALES-INVOICES.JS — Sales Invoices from LEDGER collection
// Tile: sales-invoices
// Data source: appData.LEDGER (filtered by ENTRY_TYPE === 'INVOICE', DIRECTION === 'OUTWARD')
// ============================================================================

const VaultSalesInvoices = (() => {

    let _allLedger = [];
    let _b2bMap    = new Map();

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, client, invoice no…';
    }

    function _getInvoices() {
        return _allLedger.filter(e =>
            e.ENTRY_TYPE === 'INVOICE' && e.DIRECTION === 'OUTWARD'
        );
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const invoices = _getInvoices();
        // Apply search filter
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? invoices.filter(e =>
                (e.CODE || '').toLowerCase().includes(q) ||
                (e.CLIENT_NAME || '').toLowerCase().includes(q) ||
                (e.INV_NUMBER || '').toLowerCase().includes(q) ||
                (e.INVOICE_ID || '').toLowerCase().includes(q) ||
                (e.NARRATION || '').toLowerCase().includes(q)
              )
            : invoices;
        filtered.sort((a, b) => (b.ENTRY_DATE || 0) - (a.ENTRY_DATE || 0));

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No sales invoices found.</li>`;
            return;
        }
        ul.innerHTML = filtered.map(e => {
            const statusColor = e.STATUS === 'ACTIVE' ? 'text-green-700' :
                                e.STATUS === 'PENDING' ? 'text-yellow-700' :
                                e.STATUS === 'VOID' ? 'text-red-700' : 'text-gray-700';
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <strong class="text-indigo-700 block text-sm">${e.INV_NUMBER || 'N/A'} — ${e.CLIENT_NAME || e.CODE || 'N/A'}</strong>
                <span class="text-xs text-gray-500">₹${(+e.DEBIT||0).toFixed(2)} · ${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''}</span>
                <div class="text-xs mt-1">
                    <span class="${statusColor} font-medium">${e.STATUS || ''}</span>
                    <span class="text-gray-400"> · Balance: ₹${(+e.BALANCE||0).toFixed(2)}</span>
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

    function search() {
        _renderList();
    }

    // ── Detail pane ───────────────────────────────────────────────────────────
    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Sales Invoice — ${entry.INV_NUMBER || 'N/A'}</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-500">Invoice No:</span> ${entry.INV_NUMBER || 'N/A'}</div>
                        <div><span class="text-gray-500">Invoice ID:</span> ${entry.INVOICE_ID || 'N/A'}</div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Status:</span> <span class="font-medium">${entry.STATUS || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Client:</span> ${entry.CLIENT_NAME || 'N/A'} (${entry.CODE || ''})</div>
                        <div><span class="text-gray-500">Branch:</span> ${entry.BRANCH_NAME || entry.BRANCH || 'N/A'}</div>
                        <div><span class="text-gray-500">Client GST:</span> ${entry.CLIENT_GST || 'N/A'}</div>
                        <div><span class="text-gray-500">POS:</span> ${entry.POS || 'N/A'}</div>
                        <div><span class="text-gray-500">Amount (₹):</span> <strong class="text-indigo-700">₹${(+entry.DEBIT||0).toFixed(2)}</strong></div>
                        <div><span class="text-gray-500">Running Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">FY:</span> ${entry.FY || 'N/A'}</div>
                        <div><span class="text-gray-500">Direction:</span> ${entry.DIRECTION || 'N/A'}</div>
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

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data) {
            _allLedger = Object.values(data.LEDGER || {});
            _b2bMap.clear();
            if (data.B2B) Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
            _renderList(_allLedger);
        }
    }

    return { load, search };
})();

window.VaultSalesInvoices = VaultSalesInvoices;
