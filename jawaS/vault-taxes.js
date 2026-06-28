// ============================================================================
// VAULT-TAXES.JS — Tax summary from IDB HEADER
// Tile: taxes
// Data source: IDB HEADER (filtered by SGST/CGST/IGST > 0)
// Detail: IDB LEDGER (GL Postings by DOX_KEY)
// ============================================================================

const VaultTaxes = (() => {

    let _allHeaders  = [];
    let _allLedger   = [];
    let _allB2B      = [];
    let _activePeriod = '';
    let _allBranches = [];

    // ── Helpers ─────────────────────────────────────────────────────────────
    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }
    function _currentYM() {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
    }
    function _fmtAmt(v) { return `₹${(+v||0).toFixed(2)}`; }

    // ── Get tax documents from HEADER ───────────────────────────────────────
    function _getTaxDocs(branch) {
        return Object.values(_allHeaders).filter(h => {
            const hasTax = (+h.SGST||0) > 0 || (+h.CGST||0) > 0 || (+h.IGST||0) > 0;
            if (!hasTax) return false;
            if (branch && (h.BRANCH||'').toLowerCase() !== branch.toLowerCase()) return false;
            return true;
        });
    }

    // ── Period grouping ─────────────────────────────────────────────────────
    function _periodKey(ts) {
        if (!ts) return 'Unknown';
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    }

    function _groupByPeriod(docs) {
        const groups = {};
        docs.forEach(d => {
            const pk = _periodKey(d.IO_TIMESTAMP);
            if (!groups[pk]) groups[pk] = { period: pk, docs: [], sgst: 0, cgst: 0, igst: 0, taxable: 0, count: 0 };
            groups[pk].docs.push(d);
            groups[pk].sgst += +d.SGST || 0;
            groups[pk].cgst += +d.CGST || 0;
            groups[pk].igst += +d.IGST || 0;
            groups[pk].taxable += +d.TAXABLE || 0;
            groups[pk].count++;
        });
        return Object.values(groups).sort((a, b) => b.period.localeCompare(a.period));
    }

    // ── Inject list pane ────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by ref, code, type…';
    }

    // ── Period/branch selector ──────────────────────────────────────────────
    function _renderSelector() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const ym = _currentYM();
        ul.innerHTML = `
            <li class="p-3 mb-3 border border-gray-200 rounded-lg">
                <label class="block text-xs font-medium text-gray-600 mb-1">Branch <span class="text-gray-400">(optional)</span></label>
                <select id="txBranchSelect" class="form-input text-sm">
                    <option value="">All Branches</option>
                    ${_allBranches.map(b => `<option value="${b.BRANCH_CODE}">${b.BRANCH_NAME || b.BRANCH_CODE}</option>`).join('')}
                </select>
                <button id="txLoadBtn" class="mt-3 w-full px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
                    Load Tax Summary
                </button>
            </li>
            <li class="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Tax Periods</li>
        `;
        document.getElementById('txLoadBtn').addEventListener('click', () => {
            const branch = document.getElementById('txBranchSelect')?.value || '';
            _loadTaxSummary(branch);
        });
    }

    // ── Render period list ──────────────────────────────────────────────────
    function _renderPeriodList(groups) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        // Keep selector, remove old list items
        const selectorHtml = ul.querySelector('li:first-child')?.outerHTML || '';
        const headerHtml = ul.querySelector('li:nth-child(2)')?.outerHTML || '';
        ul.innerHTML = selectorHtml + headerHtml;

        if (!groups.length) {
            ul.innerHTML += '<li class="text-center text-gray-400 text-sm py-6">No tax documents found.</li>';
            return;
        }

        ul.innerHTML += groups.map(g => `
            <li data-period="${g.period}" class="p-3 rounded-lg cursor-pointer hover:bg-emerald-50 border border-gray-200 transition-colors mb-2">
                <div class="flex justify-between items-center mb-1">
                    <strong class="text-emerald-700 text-sm">${g.period}</strong>
                    <span class="text-xs text-gray-500">${g.count} docs</span>
                </div>
                <div class="flex flex-wrap gap-2 text-xs">
                    <span class="px-2 py-0.5 rounded bg-green-50 text-green-700 font-medium">CGST: ${_fmtAmt(g.cgst)}</span>
                    <span class="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">SGST: ${_fmtAmt(g.sgst)}</span>
                    <span class="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">IGST: ${_fmtAmt(g.igst)}</span>
                </div>
                <div class="text-xs text-gray-400 mt-1">Taxable: ${_fmtAmt(g.taxable)} · Total GST: ${_fmtAmt(g.cgst + g.sgst + g.igst)}</div>
            </li>
        `).join('');

        ul.querySelectorAll('li[data-period]').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                const period = li.dataset.period;
                const branch = document.getElementById('txBranchSelect')?.value || '';
                const docs = _getTaxDocs(branch).filter(d => _periodKey(d.IO_TIMESTAMP) === period);
                _renderPeriodDetail(period, docs);
            })
        );
    }

    // ── Period detail ───────────────────────────────────────────────────────
    function _renderPeriodDetail(period, docs) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const totalSgst = docs.reduce((s, d) => s + (+d.SGST||0), 0);
        const totalCgst = docs.reduce((s, d) => s + (+d.CGST||0), 0);
        const totalIgst = docs.reduce((s, d) => s + (+d.IGST||0), 0);
        const totalTaxable = docs.reduce((s, d) => s + (+d.TAXABLE||0), 0);

        view.innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Tax Summary — ${period}</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div class="p-3 bg-white border rounded-lg text-center">
                            <div class="text-xs text-gray-500">Documents</div>
                            <div class="text-xl font-bold">${docs.length}</div>
                        </div>
                        <div class="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                            <div class="text-xs text-green-600">CGST</div>
                            <div class="text-lg font-bold text-green-700">${_fmtAmt(totalCgst)}</div>
                        </div>
                        <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                            <div class="text-xs text-blue-600">SGST</div>
                            <div class="text-lg font-bold text-blue-700">${_fmtAmt(totalSgst)}</div>
                        </div>
                        <div class="p-3 bg-purple-50 border border-purple-200 rounded-lg text-center">
                            <div class="text-xs text-purple-600">IGST</div>
                            <div class="text-lg font-bold text-purple-700">${_fmtAmt(totalIgst)}</div>
                        </div>
                    </div>
                    <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center mb-4">
                        <div class="text-xs text-amber-600 uppercase font-medium">Total GST Liability</div>
                        <div class="text-2xl font-bold text-amber-700">${_fmtAmt(totalCgst + totalSgst + totalIgst)}</div>
                        <div class="text-xs text-amber-500">on taxable value ${_fmtAmt(totalTaxable)}</div>
                    </div>

                    <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Documents (${docs.length})</h4>
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-xs">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-2 py-1.5 text-left">Date</th>
                                    <th class="px-2 py-1.5 text-left">Type</th>
                                    <th class="px-2 py-1.5 text-left">Ref</th>
                                    <th class="px-2 py-1.5 text-left">Party</th>
                                    <th class="px-2 py-1.5 text-right">Taxable</th>
                                    <th class="px-2 py-1.5 text-right">CGST</th>
                                    <th class="px-2 py-1.5 text-right">SGST</th>
                                    <th class="px-2 py-1.5 text-right">IGST</th>
                                    <th class="px-2 py-1.5 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${docs.sort((a,b) => (b.IO_TIMESTAMP||0) - (a.IO_TIMESTAMP||0)).map(d => {
                                    const gst = (+d.CGST||0) + (+d.SGST||0) + (+d.IGST||0);
                                    const b2b = _allB2B.find(b => b.CODE === d.B2B);
                                    const party = b2b ? `${d.B2B} — ${b2b.B2B_NAME||''}` : (d.B2B || '-');
                                    return `<tr class="border-b hover:bg-gray-50 cursor-pointer" data-key="${d.DOX_KEY}" onclick="VaultTaxes._showDocDetail('${d.DOX_KEY}')">
                                        <td class="px-2 py-1.5 whitespace-nowrap">${d.IO_TIMESTAMP ? _fmt(d.IO_TIMESTAMP, 'date') : '-'}</td>
                                        <td class="px-2 py-1.5">${d.DOX_TYPE || '-'}</td>
                                        <td class="px-2 py-1.5 font-medium">${d.DOX_REF || '-'}</td>
                                        <td class="px-2 py-1.5 max-w-[150px] truncate">${party}</td>
                                        <td class="px-2 py-1.5 text-right">${_fmtAmt(d.TAXABLE)}</td>
                                        <td class="px-2 py-1.5 text-right text-green-600">${_fmtAmt(d.CGST)}</td>
                                        <td class="px-2 py-1.5 text-right text-blue-600">${_fmtAmt(d.SGST)}</td>
                                        <td class="px-2 py-1.5 text-right text-purple-600">${_fmtAmt(d.IGST)}</td>
                                        <td class="px-2 py-1.5 text-right font-semibold">${_fmtAmt(gst)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Document detail (GL Postings) ──────────────────────────────────────
    function _showDocDetail(doxKey) {
        if (!doxKey) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const entry = _allHeaders.find(h => h.DOX_KEY === doxKey);
        if (!entry) {
            view.innerHTML = '<div class="text-center text-gray-400 py-8">Document not found.</div>';
            VaultPage.showDetailPane();
            return;
        }
        const rows = _allLedger.filter(e => e.DOX_KEY === doxKey);
        const totalDr = rows.reduce((s, r) => s + (+r.DEBIT || 0), 0);
        const totalCr = rows.reduce((s, r) => s + (+r.CREDIT || 0), 0);
        const gst = (+entry.CGST||0) + (+entry.SGST||0) + (+entry.IGST||0);
        const b2b = _allB2B.find(b => b.CODE === entry.B2B);
        const party = b2b ? `${entry.B2B} — ${b2b.B2B_NAME || ''}` : (entry.B2B || 'N/A');

        view.innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">${entry.DOX_TYPE || 'Document'} — ${entry.DOX_REF || ''}</h3>
                    <span class="text-xs text-gray-400">${entry.BRANCH || ''}</span>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-4 text-sm mb-4">
                        <div><span class="text-gray-500">Party:</span> <span class="font-medium">${party}</span></div>
                        <div><span class="text-gray-500">Date:</span> ${entry.IO_TIMESTAMP ? _fmt(entry.IO_TIMESTAMP) : 'N/A'}</div>
                        <div><span class="text-gray-500">DOX_KEY:</span> <span class="font-mono text-xs">${entry.DOX_KEY || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Amount:</span> <span class="font-semibold">${_fmtAmt(entry.AMOUNT)}</span></div>
                        <div><span class="text-gray-500">Taxable:</span> ${_fmtAmt(entry.TAXABLE)}</div>
                        <div><span class="text-gray-500">Total GST:</span> <span class="font-semibold">${_fmtAmt(gst)}</span></div>
                    </div>
                    <div class="flex flex-wrap gap-2 mb-4">
                        <span class="px-3 py-1 rounded text-xs font-medium bg-green-100 text-green-700">CGST: ${_fmtAmt(entry.CGST)}</span>
                        <span class="px-3 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">SGST: ${_fmtAmt(entry.SGST)}</span>
                        <span class="px-3 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">IGST: ${_fmtAmt(entry.IGST)}</span>
                    </div>
                    ${rows.length ? `
                        <div class="text-xs mb-3">
                            <div class="font-semibold text-gray-600 mb-2">GL Postings (${rows.length})</div>
                            <div class="overflow-x-auto">
                                <table class="min-w-full text-xs divide-y divide-gray-200">
                                    <thead class="bg-gray-50">
                                        <tr>
                                            <th class="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">#</th>
                                            <th class="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Account</th>
                                            <th class="px-3 py-1.5 text-right font-medium text-gray-500 uppercase">Debit</th>
                                            <th class="px-3 py-1.5 text-right font-medium text-gray-500 uppercase">Credit</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-100">
                                        ${rows.map((r, i) => {
                                            const coa = r.COA_DR || r.COA_CR || '';
                                            return `<tr>
                                                <td class="px-3 py-1.5 text-gray-400">${i + 1}</td>
                                                <td class="px-3 py-1.5 font-medium text-gray-700">${coa || '(auto)'}</td>
                                                <td class="px-3 py-1.5 text-right font-medium text-red-600">${(+r.DEBIT||0) > 0 ? '₹' + (+r.DEBIT).toFixed(2) : ''}</td>
                                                <td class="px-3 py-1.5 text-right font-medium text-green-600">${(+r.CREDIT||0) > 0 ? '₹' + (+r.CREDIT).toFixed(2) : ''}</td>
                                            </tr>`;
                                        }).join('')}
                                    </tbody>
                                    <tfoot class="bg-gray-50 font-semibold">
                                        <tr>
                                            <td colspan="2" class="px-3 py-1.5 text-right text-gray-700">Total</td>
                                            <td class="px-3 py-1.5 text-right text-red-700">₹${totalDr.toFixed(2)}</td>
                                            <td class="px-3 py-1.5 text-right text-green-700">₹${totalCr.toFixed(2)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>` : ''}
                    <details class="mt-2">
                        <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Audit Info</summary>
                        <div class="grid grid-cols-2 gap-3 text-xs text-gray-500 mt-2 p-3 border rounded-lg">
                            <div>DOX_KEY: <span class="font-mono">${entry.DOX_KEY || 'N/A'}</span></div>
                            <div>Branch: ${entry.BRANCH || 'N/A'}</div>
                            <div>Type: ${entry.DOX_TYPE || 'N/A'}</div>
                            <div>Rows: ${rows.length}</div>
                        </div>
                    </details>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Load tax summary ───────────────────────────────────────────────────
    async function _loadTaxSummary(branch) {
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">Loading tax summary…</div>';
        VaultPage.showDetail(true);

        const docs = _getTaxDocs(branch);
        const groups = _groupByPeriod(docs);
        _renderPeriodList(groups);

        // Show first period by default
        if (groups.length) {
            const firstPeriod = groups[0].period;
            const periodDocs = docs.filter(d => _periodKey(d.IO_TIMESTAMP) === firstPeriod);
            _renderPeriodDetail(firstPeriod, periodDocs);
            const firstLi = document.querySelector('#vaultList li[data-period]');
            if (firstLi) firstLi.classList.add('selected');
        } else {
            view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-12">
                <div class="text-4xl mb-3">🏷️</div>
                <p class="text-gray-500 text-sm">No tax documents found.</p>
            </div></div>`;
            VaultPage.showDetailPane();
        }
    }

    // ── Search ─────────────────────────────────────────────────────────────
    function search(q) {
        if (!q) { _loadTaxSummary(document.getElementById('txBranchSelect')?.value || ''); return; }
        const lq = q.toLowerCase();
        const docs = _getTaxDocs(document.getElementById('txBranchSelect')?.value || '');
        const filtered = docs.filter(d =>
            (d.DOX_REF||'').toLowerCase().includes(lq) ||
            (d.DOX_TYPE||'').toLowerCase().includes(lq) ||
            (d.B2B||'').toLowerCase().includes(lq) ||
            (d.BRANCH||'').toLowerCase().includes(lq)
        );
        const groups = _groupByPeriod(filtered);
        _renderPeriodList(groups);
    }

    // ── Load ───────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data?.HEADER) _allHeaders = data.HEADER;
        if (data?.LEDGER) _allLedger = Object.values(data.LEDGER);
        if (data?.B2B) _allB2B = Object.values(data.B2B);
        if (data?.BRANCHES) _allBranches = Object.values(data.BRANCHES).filter(b => b.BRANCH_CODE);

        // Initial render with all branches
        const branch = VaultPage.getActiveBranch() || '';
        _renderSelector();
        // Auto-load
        setTimeout(() => _loadTaxSummary(branch), 100);
    }

    return { load, search, _showDocDetail };
})();

window.VaultTaxes = VaultTaxes;
