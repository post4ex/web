// ============================================================================
// VAULT-GST.JS — All GST tiles: gstr1, gstr3b, gstr2b, gst-filing,
//                 purchase-register, tds, tcs, tds-certs
// API: GET /api/gst/gstr1, /api/gst/gstr3b, /api/gst/gstr2b,
//      GET/POST/PATCH /api/gst/filings, /api/gst/purchase-register,
//      GET/POST /api/gst/tds, /api/gst/tcs, /api/gst/tds-certs
// ============================================================================

const VaultGst = (() => {

    let _allBranches = [];
    let _activeTile  = 'gstr1';
    let _activePeriod = '';
    let _activeBranch = '';
    let _trackerCache = null;
    let _allB2B = [];

    // ── Helpers ─────────────────────────────────────────────────────────────
    function _can(role) { return window.VaultPage?.can(role); }
    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }
    function _toMs(d) { return d ? new Date(d + 'T00:00:00Z').getTime() : 0; }
    function _today() { return new Date().toISOString().split('T')[0]; }
    function _currentYM() {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
    }

    // ── Tile info ───────────────────────────────────────────────────────────
    const TILE_CONFIG = {
        'gstr1':             { label: 'GSTR-1',    type: 'report', period: true },
        'gstr3b':            { label: 'GSTR-3B',   type: 'report', period: true },
        'gstr2b':            { label: 'GSTR-2B Recon', type: 'report', period: true },
        'purchase-register': { label: 'Purchase Register', type: 'report', period: true },
        'gst-filing':        { label: 'GST Filing', type: 'list',   period: false },
        'tds':               { label: 'TDS',        type: 'list',   period: true },
        'tcs':               { label: 'TCS',        type: 'list',   period: true },
        'tds-certs':         { label: 'TDS Certs',  type: 'list',   period: false },
    };

    // ── Inject list pane ────────────────────────────────────────────────────
    function _injectListPane(placeholder) {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = placeholder || 'Search…';
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => _onSearch();
    }

    // ── Shared report period/branch selector ────────────────────────────────
    function _periodSelector() {
        const ym = _currentYM();
        return `
            <div class="flex flex-wrap items-end gap-3 mb-4">
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                    <select id="gstBranchSelect" class="form-input text-sm">
                        <option value="">Select branch</option>
                        ${_allBranches.map(b => `<option value="${b.BRANCH_CODE}"${_activeBranch === b.BRANCH_CODE ? ' selected' : ''}>${b.BRANCH_NAME || b.BRANCH_CODE}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Period</label>
                    <input id="gstPeriodInput" type="month" class="form-input text-sm" value="${_activePeriod || ym}">
                </div>
                <div>
                    <button id="gstLoadBtn" class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">Load Report</button>
                </div>
            </div>`;
    }

    // ── Error ───────────────────────────────────────────────────────────────
    function _showError(msg) {
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `<div class="text-center text-red-500 py-8">❌ ${msg}</div>`;
        VaultPage.showDetailPane();
    }

    // ── Search ──────────────────────────────────────────────────────────────
    function _onSearch() {
        const tile = TILE_CONFIG[_activeTile];
        if (!tile || tile.type !== 'list') return;
        if (_activeTile === 'gst-filing') _renderFilingsList();
        else if (_activeTile === 'tds') _renderTdsList();
        else if (_activeTile === 'tcs') _renderTcsList();
        else if (_activeTile === 'tds-certs') _renderTdsCertsList();
    }

    // ========================================================================
    // GSTR-1
    // ========================================================================
    async function _loadGstr1() {
        const branch = document.getElementById('gstBranchSelect')?.value;
        const period = document.getElementById('gstPeriodInput')?.value;
        if (!branch || !period) { _showError('Please select both branch and period.'); return; }
        _activeBranch = branch; _activePeriod = period;
        document.getElementById('vaultDetailView').innerHTML = '<div class="text-center text-gray-400 py-8">Loading GSTR-1…</div>';
        try {
            const res = await callApi(`/api/gst/gstr1?branch=${branch}&period=${period}`, {}, 'GET');
            _renderGstr1(res);
        } catch (err) { _showError('Failed: ' + (err.message || err)); }
    }

    function _renderGstr1(data) {
        const b2b = data.b2b || [], b2cs = data.b2cs || [], cdn = data.cdn || [], hsn = data.hsn_summary || [];
        VaultPage.showDetail(true);

        function _table(hdr, rows, cols) {
            if (!rows.length) return '<p class="text-gray-400 text-sm">No data.</p>';
            return `<table class="min-w-full text-xs"><thead class="bg-gray-50"><tr>${cols.map(c => `<th class="px-2 py-2 text-${c.align||'left'}">${c.label}</th>`).join('')}</tr></thead>
                <tbody>${rows.map(r => `<tr class="border-b">${cols.map(c => `<td class="px-2 py-2 ${c.align==='right'?'text-right':''}">${c.fn ? c.fn(r) : r[c.key]||'-'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        }

        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">GSTR-1 — ${data.branch} / ${data.period}</h3>
                <span class="text-xs text-gray-500">GSTIN: ${data.gstin||'N/A'}</span></div>
            </div>
            <div class="detail-card mb-4"><div class="detail-card-header"><h3 class="font-semibold text-gray-700">B2B Invoices (Table 4) — ${b2b.length}</h3></div>
                <div class="detail-card-body overflow-x-auto">${_table('B2B', b2b, [
                    {label:'GSTIN', key:'recipient_gstin', fn:r=>`<span class="font-mono">${r.recipient_gstin}</span>`},
                    {label:'Name', key:'recipient_name'}, {label:'Inv#', key:'inv_number'},
                    {label:'Date', fn:r=>_fmt(r.inv_date,'date')}, {label:'Taxable', key:'taxable', align:'right', fn:r=>r.taxable.toFixed(2)},
                    {label:'CGST', key:'cgst', align:'right', fn:r=>r.cgst.toFixed(2)}, {label:'SGST', key:'sgst', align:'right', fn:r=>r.sgst.toFixed(2)},
                    {label:'IGST', key:'igst', align:'right', fn:r=>r.igst.toFixed(2)}, {label:'Total', key:'total', align:'right', fn:r=>r.total.toFixed(2)},
                ])}</div></div>
            <div class="detail-card mb-4"><div class="detail-card-header"><h3 class="font-semibold text-gray-700">B2CS (Table 7) — Unregistered</h3></div>
                <div class="detail-card-body overflow-x-auto">${_table('B2CS', b2cs, [
                    {label:'POS', key:'pos'}, {label:'Taxable', key:'taxable', align:'right', fn:r=>r.taxable.toFixed(2)},
                    {label:'CGST', key:'cgst', align:'right', fn:r=>r.cgst.toFixed(2)},{label:'SGST', key:'sgst', align:'right', fn:r=>r.sgst.toFixed(2)},{label:'IGST', key:'igst', align:'right', fn:r=>r.igst.toFixed(2)},
                ])}</div></div>
            <div class="detail-card mb-4"><div class="detail-card-header"><h3 class="font-semibold text-gray-700">Credit/Debit Notes (Table 9) — ${cdn.length}</h3></div>
                <div class="detail-card-body overflow-x-auto">${_table('CDN', cdn, [
                    {label:'Type', fn:r=>`<span class="px-2 py-0.5 rounded text-xs ${r.type==='CREDIT_NOTE'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${r.type==='CREDIT_NOTE'?'CN':'DN'}</span>`},
                    {label:'Date', fn:r=>_fmt(r.entry_date,'date')}, {label:'Name', key:'recipient_name'}, {label:'GSTIN', key:'recipient_gstin'},
                    {label:'Debit', key:'debit', align:'right', fn:r=>r.debit.toFixed(2)}, {label:'Credit', key:'credit', align:'right', fn:r=>r.credit.toFixed(2)},
                ])}</div></div>
            <div class="detail-card"><div class="detail-card-header"><h3 class="font-semibold text-gray-700">HSN Summary (Table 12)</h3></div>
                <div class="detail-card-body overflow-x-auto">${_table('HSN', hsn, [
                    {label:'SAC', key:'sac'},{label:'Description', key:'description'},
                    {label:'Taxable', key:'taxable', align:'right', fn:r=>r.taxable.toFixed(2)},
                    {label:'CGST', key:'cgst', align:'right', fn:r=>r.cgst.toFixed(2)},{label:'SGST', key:'sgst', align:'right', fn:r=>r.sgst.toFixed(2)},{label:'IGST', key:'igst', align:'right', fn:r=>r.igst.toFixed(2)},
                ])}</div></div>`;
        VaultPage.showDetailPane();
    }

    // ========================================================================
    // GSTR-3B
    // ========================================================================
    async function _loadGstr3b() {
        const branch = document.getElementById('gstBranchSelect')?.value;
        const period = document.getElementById('gstPeriodInput')?.value;
        if (!branch || !period) { _showError('Please select both branch and period.'); return; }
        _activeBranch = branch; _activePeriod = period;
        document.getElementById('vaultDetailView').innerHTML = '<div class="text-center text-gray-400 py-8">Loading GSTR-3B…</div>';
        try {
            const res = await callApi(`/api/gst/gstr3b?branch=${branch}&period=${period}`, {}, 'GET');
            _renderGstr3b(res);
        } catch (err) { _showError('Failed: ' + (err.message || err)); }
    }

    function _renderGstr3b(data) {
        VaultPage.showDetail(true);
        const o = data.outward || {}, itc = data.itc || {}, net = data.net_payable || {};
        const inter = data.inter_state_breakdown || [];
        const totalPayable = (+net.cgst||0) + (+net.sgst||0) + (+net.igst||0);

        function _kpi(label, val, color, sub) {
            return `<div class="p-4 rounded-lg border text-center ${color}">
                <div class="text-xs uppercase font-medium opacity-70">${label}</div>
                <div class="text-xl font-bold">₹${(+val).toFixed(2)}</div>
                ${sub ? `<div class="text-xs opacity-60">${sub}</div>` : ''}
            </div>`;
        }

        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">GSTR-3B — ${data.branch} / ${data.period}</h3>
                <span class="text-xs text-gray-500">GSTIN: ${data.gstin||'N/A'}</span></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                ${_kpi('Taxable Supply', o.taxable, 'bg-white border-gray-200')}
                ${_kpi('CGST', o.cgst, 'bg-green-50 border-green-200')}
                ${_kpi('SGST', o.sgst, 'bg-blue-50 border-blue-200')}
                ${_kpi('IGST', o.igst, 'bg-purple-50 border-purple-200')}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                ${inter.length ? `<div class="detail-card"><div class="detail-card-header"><h3 class="font-semibold text-gray-700">3.2 — Inter-State</h3></div>
                    <div class="detail-card-body overflow-x-auto"><table class="min-w-full text-xs"><thead class="bg-gray-50"><tr><th class="px-2 py-2">POS</th><th class="px-2 py-2 text-right">Taxable</th><th class="px-2 py-2 text-right">IGST</th></tr></thead>
                    <tbody>${inter.map(i=>`<tr class="border-b"><td class="px-2 py-2">${i.pos}</td><td class="px-2 py-2 text-right">${(+i.taxable).toFixed(2)}</td><td class="px-2 py-2 text-right">${(+i.igst).toFixed(2)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
                <div class="detail-card"><div class="detail-card-header"><h3 class="font-semibold text-gray-700">4 — ITC (${itc.entries||0} entries)</h3></div>
                    <div class="detail-card-body text-sm space-y-1">${_kpi('Taxable', itc.taxable, 'bg-white border-gray-200')}${_kpi('CGST', itc.cgst, 'bg-green-50 border-green-200')}${_kpi('SGST', itc.sgst, 'bg-blue-50 border-blue-200')}${_kpi('IGST', itc.igst, 'bg-purple-50 border-purple-200')}</div></div>
            </div>
            <div class="detail-card"><div class="detail-card-header"><h3 class="font-semibold text-gray-700">Net Tax Payable</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-3 gap-4 mb-3">${_kpi('CGST', net.cgst, 'bg-green-50 border-green-200')}${_kpi('SGST', net.sgst, 'bg-blue-50 border-blue-200')}${_kpi('IGST', net.igst, 'bg-purple-50 border-purple-200')}</div>
                    <div class="text-right text-lg font-bold text-gray-800 border-t pt-3">Total Payable: ₹${totalPayable.toFixed(2)}</div>
                </div></div>`;
        VaultPage.showDetailPane();
    }

    // ========================================================================
    // GSTR-2B Recon
    // ========================================================================
    async function _loadGstr2b() {
        const branch = document.getElementById('gstBranchSelect')?.value;
        const period = document.getElementById('gstPeriodInput')?.value;
        if (!branch || !period) { _showError('Please select both branch and period.'); return; }
        _activeBranch = branch; _activePeriod = period;
        document.getElementById('vaultDetailView').innerHTML = '<div class="text-center text-gray-400 py-8">Loading GSTR-2B…</div>';
        try {
            const res = await callApi(`/api/gst/gstr2b?branch=${branch}&period=${period}`, {}, 'GET');
            _renderGstr2b(res);
        } catch (err) { _showError('Failed: ' + (err.message || err)); }
    }

    function _renderGstr2b(data) {
        VaultPage.showDetail(true);
        const s = data.summary || {};
        const rows = data.data || [];

        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card mb-4"><div class="detail-card-header"><h3 class="font-semibold text-gray-700">GSTR-2B Recon — ${data.branch} / ${data.period}</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                        <div class="p-3 bg-white border rounded-lg text-center"><div class="text-xs text-gray-500">Total</div><div class="text-lg font-bold">${s.total||0}</div></div>
                        <div class="p-3 bg-green-50 border border-green-200 rounded-lg text-center"><div class="text-xs text-green-600">Matched</div><div class="text-lg font-bold text-green-700">${s.matched||0}</div></div>
                        <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-center"><div class="text-xs text-yellow-600">Unmatched</div><div class="text-lg font-bold text-yellow-700">${s.unmatched||0}</div></div>
                        <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-center"><div class="text-xs text-red-600">Mismatch</div><div class="text-lg font-bold text-red-700">${s.mismatch||0}</div></div>
                        <div class="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-center"><div class="text-xs text-indigo-600">Taxable</div><div class="text-lg font-bold text-indigo-700">₹${(+s.taxable||0).toFixed(2)}</div></div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-xs"><thead class="bg-gray-50"><tr>
                            <th class="px-2 py-2">Date</th><th class="px-2 py-2">Vendor</th><th class="px-2 py-2">GSTIN</th><th class="px-2 py-2">Inv#</th>
                            <th class="px-2 py-2 text-right">Amount</th><th class="px-2 py-2 text-right">Taxable</th><th class="px-2 py-2 text-right">CGST</th>
                            <th class="px-2 py-2 text-right">SGST</th><th class="px-2 py-2 text-right">IGST</th><th class="px-2 py-2">Match</th><th class="px-2 py-2">Action</th>
                        </tr></thead>
                        <tbody>${rows.length ? rows.map(r => {
                            const ms = r.match_status || 'UNMATCHED';
                            const badge = ms === 'MATCHED' ? 'bg-green-100 text-green-700' : ms === 'MISMATCH' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';
                            return `<tr class="border-b">
                                <td class="px-2 py-2">${_fmt(r.entry_date,'date')}</td>
                                <td class="px-2 py-2">${r.vendor_name||'-'}</td>
                                <td class="px-2 py-2 font-mono">${r.vendor_gstin||'-'}</td>
                                <td class="px-2 py-2">${r.inv_number||'-'}</td>
                                <td class="px-2 py-2 text-right">${(+r.amount).toFixed(2)}</td>
                                <td class="px-2 py-2 text-right">${(+r.taxable).toFixed(2)}</td>
                                <td class="px-2 py-2 text-right">${(+r.cgst).toFixed(2)}</td>
                                <td class="px-2 py-2 text-right">${(+r.sgst).toFixed(2)}</td>
                                <td class="px-2 py-2 text-right">${(+r.igst).toFixed(2)}</td>
                                <td class="px-2 py-2"><span class="px-1.5 py-0.5 rounded text-xs ${badge}">${ms}</span></td>
                                <td class="px-2 py-2">
                                    <select class="match-status-select text-xs border rounded px-1 py-0.5" data-entry="${r.entry_id}" onchange="VaultGst._updateMatchStatus('${r.entry_id}', this.value)">
                                        <option value="UNMATCHED" ${ms==='UNMATCHED'?'selected':''}>⏳ Unmatched</option>
                                        <option value="MATCHED" ${ms==='MATCHED'?'selected':''}>✅ Matched</option>
                                        <option value="MISMATCH" ${ms==='MISMATCH'?'selected':''}>❌ Mismatch</option>
                                    </select>
                                </td>
                            </tr>`;
                        }).join('') : '<tr><td colspan="11" class="text-center py-4 text-gray-400">No entries.</td></tr>'}</tbody></table>
                    </div>
                </div></div>`;
        VaultPage.showDetailPane();
    }

    async function _updateMatchStatus(entryId, status) {
        try {
            await callApi('/api/gst/gstr2b/match-status', { entry_id: entryId, match_status: status }, 'PATCH');
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    // ========================================================================
    // Purchase Register
    // ========================================================================
    async function _loadPurchaseRegister() {
        const branch = document.getElementById('gstBranchSelect')?.value;
        const period = document.getElementById('gstPeriodInput')?.value;
        if (!branch || !period) { _showError('Please select both branch and period.'); return; }
        _activeBranch = branch; _activePeriod = period;
        document.getElementById('vaultDetailView').innerHTML = '<div class="text-center text-gray-400 py-8">Loading Purchase Register…</div>';
        try {
            const res = await callApi(`/api/gst/purchase-register?branch=${branch}&period=${period}`, {}, 'GET');
            _renderPurchaseRegister(res);
        } catch (err) { _showError('Failed: ' + (err.message || err)); }
    }

    function _renderPurchaseRegister(data) {
        const rows = data.data || [];
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card mb-4"><div class="detail-card-header"><h3 class="font-semibold text-gray-700">Purchase Register — ${data.branch} / ${data.period} (${data.count} entries)</h3></div>
                <div class="detail-card-body overflow-x-auto">
                    ${rows.length ? `<table class="min-w-full text-xs"><thead class="bg-gray-50"><tr>
                        <th class="px-2 py-2">Date</th><th class="px-2 py-2">Vendor</th><th class="px-2 py-2 font-mono">GSTIN</th>
                        <th class="px-2 py-2">Type</th><th class="px-2 py-2">Inv#</th><th class="px-2 py-2 text-right">Amount</th>
                        <th class="px-2 py-2 text-right">Taxable</th><th class="px-2 py-2 text-right">CGST</th><th class="px-2 py-2 text-right">SGST</th>
                        <th class="px-2 py-2 text-right">IGST</th><th class="px-2 py-2">ITC</th>
                    </tr></thead>
                    <tbody>${rows.map(r => `<tr class="border-b">
                        <td class="px-2 py-2">${_fmt(r.entry_date,'date')}</td>
                        <td class="px-2 py-2">${r.vendor_name||r.vendor_type}</td>
                        <td class="px-2 py-2 font-mono">${r.vendor_gstin||'-'}</td>
                        <td class="px-2 py-2">${r.vendor_type||'-'}</td>
                        <td class="px-2 py-2">${r.inv_number||'-'}</td>
                        <td class="px-2 py-2 text-right">${(+r.amount).toFixed(2)}</td>
                        <td class="px-2 py-2 text-right">${(+r.taxable).toFixed(2)}</td>
                        <td class="px-2 py-2 text-right">${(+r.cgst).toFixed(2)}</td>
                        <td class="px-2 py-2 text-right">${(+r.sgst).toFixed(2)}</td>
                        <td class="px-2 py-2 text-right">${(+r.igst).toFixed(2)}</td>
                        <td class="px-2 py-2"><span class="px-1.5 py-0.5 rounded text-xs ${r.itc_eligible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${r.itc_eligible ? '✅' : '❌'}</span></td>
                    </tr>`).join('')}</tbody></table>` : '<p class="text-gray-400 text-sm">No purchase entries found.</p>'}
                </div></div>`;
        VaultPage.showDetailPane();
    }

    // ========================================================================
    // GST Filing Tracker
    // ========================================================================
    async function _loadFilings() {
        _injectListPane('Search period, ARN, return type…');
        document.getElementById('vaultSearch').oninput = () => _renderFilingsList();
        const ul = document.getElementById('vaultList');
        ul.innerHTML = '<li class="text-center text-gray-400 py-6">Loading…</li>';
        try {
            const res = await callApi('/api/gst/filings', {}, 'GET');
            _trackerCache = res.data || [];
            _renderFilingsList();
        } catch (err) { ul.innerHTML = `<li class="text-center text-red-500 py-6">❌ ${err.message}</li>`; }
    }

    function _renderFilingsList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        let items = _trackerCache || [];
        if (q) items = items.filter(f =>
            (f.period||'').includes(q) || (f.return_type||'').toLowerCase().includes(q) ||
            (f.arn||'').toLowerCase().includes(q) || (f.status||'').toLowerCase().includes(q)
        );
        ul.innerHTML = items.length ? items.map(f => {
            const sc = { 'FILED': 'bg-green-100 text-green-700', 'PENDING': 'bg-yellow-100 text-yellow-700', 'LATE': 'bg-red-100 text-red-700', 'NIL': 'bg-gray-100 text-gray-600' };
            return `<li data-entry="${f.entry_id}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors mb-2">
                <div class="flex justify-between items-center">
                    <div><strong class="text-indigo-700 text-sm">${f.return_type} — ${f.period}</strong>
                    <span class="text-xs text-gray-500 ml-2">${f.branch||''}</span></div>
                    <span class="px-2 py-0.5 rounded text-xs font-medium ${sc[f.status]||'bg-gray-100'}">${f.status}</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">${f.arn ? 'ARN: '+f.arn : ''} ${f.filed_date ? '· '+_fmt(f.filed_date,'date') : ''}</div>
            </li>`;
        }).join('') : '<li class="text-center text-gray-400 text-sm py-6">No filings found.</li>';
        ul.querySelectorAll('li[data-entry]').forEach(li => li.addEventListener('click', () => {
            ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
            li.classList.add('selected');
            _renderFilingDetail(li.dataset.entry);
        }));
        if (items.length && !document.querySelector('#vaultList li.selected')) {
            ul.querySelector('li')?.classList.add('selected');
            _renderFilingDetail(items[0].entry_id);
        }
    }

    function _renderFilingDetail(entryId) {
        VaultPage.showDetail(true);
        const f = (_trackerCache||[]).find(x => x.entry_id === entryId);
        if (!f) return;
        const sc = { 'FILED': 'bg-green-100 text-green-700', 'PENDING': 'bg-yellow-100 text-yellow-700', 'LATE': 'bg-red-100 text-red-700', 'NIL': 'bg-gray-100 text-gray-600' };
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">${f.return_type} — ${f.period}</h3>
                    <span class="flex gap-2">
                        <span class="px-3 py-1 rounded text-xs font-medium ${sc[f.status]||'bg-gray-100'}">${f.status}</span>
                        <button onclick="VaultGst._openFilingForm('${f.entry_id}')" class="px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">Edit</button>
                    </span>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div><span class="text-gray-500">Branch:</span> ${f.branch||'N/A'}</div>
                        <div><span class="text-gray-500">GSTIN:</span> <span class="font-mono">${f.gstin||'N/A'}</span></div>
                        <div><span class="text-gray-500">Period:</span> ${f.period}</div>
                        <div><span class="text-gray-500">Return:</span> ${f.return_type}</div>
                        <div><span class="text-gray-500">Filed Date:</span> ${f.filed_date ? _fmt(f.filed_date,'date') : '-'}</div>
                        <div><span class="text-gray-500">ARN:</span> <span class="font-mono">${f.arn||'-'}</span></div>
                        <div><span class="text-gray-500">FY:</span> ${f.fy||'N/A'}</div>
                        ${f.notes ? `<div class="col-span-2"><span class="text-gray-500">Notes:</span> ${f.notes}</div>` : ''}
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function _openFilingForm(existingEntryId) {
        const existing = existingEntryId ? (_trackerCache||[]).find(x => x.entry_id === existingEntryId) : null;
        const isEdit = !!existing;
        VaultPage.showDetail(true);
        const ym = _currentYM();
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card max-w-lg mx-auto">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${isEdit ? 'Edit' : 'New'} GST Filing</h3></div>
                <div class="detail-card-body">
                    <form id="filForm" class="space-y-4">
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Branch *</label>
                                <select name="branch" required class="form-input text-sm" ${isEdit?'disabled':''}>
                                    <option value="">Select</option>${_allBranches.map(b => `<option value="${b.BRANCH_CODE}" ${isEdit&&b.BRANCH_CODE===existing?.branch?'selected':''}>${b.BRANCH_NAME||b.BRANCH_CODE}</option>`).join('')}
                                </select></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Period *</label>
                                <input name="period" type="month" required class="form-input text-sm" value="${isEdit?existing.period:ym}" ${isEdit?'disabled':''}></div>
                        </div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Return Type *</label>
                            <select name="return_type" required class="form-input text-sm">${['GSTR1','GSTR3B','GSTR2B'].map(rt => `<option value="${rt}" ${isEdit&&existing?.return_type===rt?'selected':''}>${rt}</option>`).join('')}</select></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Status *</label>
                            <select name="status" required class="form-input text-sm">${['PENDING','FILED','LATE','NIL'].map(s => `<option value="${s}" ${isEdit&&existing?.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Filed Date</label>
                            <input name="filed_date" type="date" class="form-input text-sm" value="${isEdit&&existing?.filed_date?_fmt(existing.filed_date,'input'):''}"></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">ARN</label>
                            <input name="arn" class="form-input text-sm" placeholder="Acknowledgment Ref No" value="${isEdit?existing?.arn||'':''}"></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                            <textarea name="notes" class="form-input text-sm" rows="2">${isEdit?existing?.notes||'':''}</textarea></div>
                        <div class="flex justify-end gap-2 pt-2 border-t">
                            <button type="button" onclick="VaultGst._loadFilings()" class="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm flex items-center gap-2"><span>${isEdit?'Update':'Save'} Filing</span></button>
                        </div>
                    </form>
                    <div id="filResp" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;
        document.getElementById('filForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const resp = document.getElementById('filResp');
            btn.disabled = true;
            try {
                if (isEdit) {
                    await callApi(`/api/gst/filings/${existing.entry_id}`, { status: data.status, filed_date: _toMs(data.filed_date), arn: data.arn||'', notes: data.notes||'' }, 'PATCH');
                } else {
                    await callApi('/api/gst/filings', { branch: data.branch, period: data.period, return_type: data.return_type, status: data.status, filed_date: _toMs(data.filed_date), arn: data.arn||'', notes: data.notes||'' }, 'POST');
                }
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800'; resp.textContent = '✅ Done.';
                resp.classList.remove('hidden');
                setTimeout(() => _loadFilings(), 1200);
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800'; resp.textContent = '❌ ' + (err.message||'Failed');
                resp.classList.remove('hidden');
            } finally { btn.disabled = false; }
        });
        VaultPage.showDetailPane();
    }

    // ========================================================================
    // TDS
    // ========================================================================
    let _tdsCache = [];
    async function _loadTds() {
        _tdsCache = [];
        _injectListPane('Search code, vendor…');
        document.getElementById('vaultSearch').oninput = () => _renderTdsList();
        document.getElementById('vaultAddBtn').classList.remove('hidden');
        document.getElementById('vaultAddBtn').onclick = () => _openTdsForm();
        document.getElementById('vaultListMsg').innerHTML = '<div class="flex items-center gap-2 mb-2"><input id="tdsPeriodInput" type="month" class="form-input text-sm flex-1" value="'+_currentYM()+'"><button id="tdsLoadBtn" class="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">Load</button></div>';
        document.getElementById('vaultList').innerHTML = '<li class="text-center text-gray-400 py-6">Select period and click Load.</li>';
        document.getElementById('tdsLoadBtn')?.addEventListener('click', async () => {
            const period = document.getElementById('tdsPeriodInput')?.value;
            if (!period) return;
            document.getElementById('vaultList').innerHTML = '<li class="text-center text-gray-400 py-6">Loading…</li>';
            try {
                const res = await callApi(`/api/gst/tds?period=${period}`, {}, 'GET');
                _tdsCache = res.data || [];
                _renderTdsList();
            } catch (err) { document.getElementById('vaultList').innerHTML = `<li class="text-center text-red-500 py-6">❌ ${err.message}</li>`; }
        });
    }

    function _renderTdsList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        let items = _tdsCache;
        if (q) items = items.filter(t => (t.code||'').includes(q.toUpperCase()) || (t.vendor_name||'').toLowerCase().includes(q));
        if (!items.length) { ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No TDS entries.</li>'; return; }
        ul.innerHTML = items.map(t => `<li data-entry="${t.entry_id}" class="p-3 rounded-lg cursor-pointer hover:bg-yellow-50 border border-gray-200 transition-colors mb-2">
            <div class="flex justify-between items-center">
                <div><strong class="text-yellow-800 text-sm">${t.code||'-'}</strong>
                <span class="text-xs text-gray-500 ml-2">${t.vendor_name||''}</span></div>
                <span class="text-sm font-semibold text-red-600">₹${(+t.amount).toFixed(2)}</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">${_fmt(t.entry_date,'date')} · Sec ${t.section||'194Q'} @ ${t.tds_rate}% ${t.cert_no ? '· 🏅 Cert: '+t.cert_no : ''}</div>
        </li>`).join('');
        ul.querySelectorAll('li[data-entry]').forEach(li => li.addEventListener('click', () => {
            ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
            li.classList.add('selected');
            _renderTdsDetail(li.dataset.entry);
        }));
        if (items.length && !document.querySelector('#vaultList li.selected')) {
            ul.querySelector('li')?.classList.add('selected');
            _renderTdsDetail(items[0].entry_id);
        }
    }

    function _renderTdsDetail(entryId) {
        VaultPage.showDetail(true);
        const t = (_tdsCache||[]).find(x => x.entry_id === entryId);
        if (!t) return;
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">TDS — ${t.code||''}</h3>
                    <span class="px-3 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-700">₹${(+t.amount).toFixed(2)}</span>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-3 text-sm mb-4">
                        <div><span class="text-gray-500">Code:</span> ${t.code||'N/A'}</div>
                        <div><span class="text-gray-500">Vendor:</span> ${t.vendor_name||'N/A'}</div>
                        <div><span class="text-gray-500">Date:</span> ${_fmt(t.entry_date,'date')}</div>
                        <div><span class="text-gray-500">Section:</span> ${t.section||'194Q'}</div>
                        <div><span class="text-gray-500">Payment Amount:</span> ₹${(+t.payment_amount||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">TDS Rate:</span> ${t.tds_rate||2}%</div>
                        <div><span class="text-gray-500">TDS Amount:</span> <span class="font-semibold text-red-600">₹${(+t.amount).toFixed(2)}</span></div>
                        ${t.cert_no ? `<div><span class="text-gray-500">Cert No:</span> ${t.cert_no}</div>
                                      <div><span class="text-gray-500">Cert Date:</span> ${t.cert_date ? _fmt(t.cert_date,'date') : '-'}</div>` : ''}
                        ${t.notes ? `<div class="col-span-2"><span class="text-gray-500">Notes:</span> ${t.notes}</div>` : ''}
                    </div>
                    ${!t.cert_no ? `<button onclick="VaultGst._openTdsCertForm('${t.entry_id}')" class="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">🏅 Add Certificate</button>` : ''}
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function _openTdsCertForm(entryId) {
        const t = (_tdsCache||[]).find(x => x.entry_id === entryId);
        if (!t) return;
        const certNo = prompt('TDS Certificate Number:');
        if (!certNo) return;
        const certDate = prompt('Certificate Date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
        const notes = prompt('Notes (optional):', '') || '';
        if (!certNo) return;
        callApi(`/api/gst/tds/${entryId}`, { cert_no: certNo, cert_date: _toMs(certDate), notes }, 'PATCH')
            .then(() => _loadTds())
            .catch(err => alert('Failed: ' + (err.message||err)));
    }

    function _openTdsForm() {
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card max-w-lg mx-auto">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">New TDS Entry</h3></div>
                <div class="detail-card-body">
                    <form id="tdsForm" class="space-y-4">
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Code *</label>
                                <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="tdsCodeList" autocomplete="off">
                                <datalist id="tdsCodeList"></datalist>
                            </div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Vendor Type</label>
                                <select name="vendor_type" class="form-input text-sm"><option value="B2B">B2B</option><option value="CARRIER">Carrier</option><option value="SUPPLIER">Supplier</option></select></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                <input name="entry_date" type="date" required class="form-input text-sm"></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Payment Amount (₹) *</label>
                                <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm"></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">TDS Rate (%)</label>
                                <select name="tds_rate" class="form-input text-sm"><option value="2">2% (GST TDS)</option><option value="1">1%</option><option value="0.5">0.5%</option><option value="10">10% (Income Tax)</option></select></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Section</label>
                                <select name="section" class="form-input text-sm"><option value="194Q">194Q</option><option value="194C">194C</option><option value="194H">194H</option><option value="194I">194I</option></select></div>
                        </div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Narration</label>
                            <textarea name="narration" class="form-input text-sm" rows="2" placeholder="Optional description"></textarea></div>
                        <div class="flex justify-end gap-2 pt-2 border-t">
                            <button type="button" onclick="VaultGst._loadTds()" class="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm flex items-center gap-2"><span>Save TDS</span></button>
                        </div>
                    </form>
                    <div id="tdsResp" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;
        // Populate code datalist
        _allB2B.forEach(c => { if (c.CODE) { const o = document.createElement('option'); o.value = c.CODE; o.label = `${c.CODE} - ${c.B2B_NAME||''}`; document.getElementById('tdsCodeList').appendChild(o); } });
        document.querySelector('[name="entry_date"]').value = _today();
        document.getElementById('tdsForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const resp = document.getElementById('tdsResp');
            btn.disabled = true;
            try {
                await callApi('/api/gst/tds', { code: data.code, vendor_type: data.vendor_type, entry_date: _toMs(data.entry_date), amount: parseFloat(data.amount), tds_rate: parseFloat(data.tds_rate), narration: data.narration||'', section: data.section }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = '✅ TDS entry saved.'; resp.classList.remove('hidden');
                setTimeout(() => _loadTds(), 1200);
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message||'Failed'); resp.classList.remove('hidden');
            } finally { btn.disabled = false; }
        });
        VaultPage.showDetailPane();
    }

    // ========================================================================
    // TCS
    // ========================================================================
    let _tcsCache = [];
    async function _loadTcs() {
        _tcsCache = [];
        _injectListPane('Search code…');
        document.getElementById('vaultSearch').oninput = () => _renderTcsList();
        document.getElementById('vaultAddBtn').classList.remove('hidden');
        document.getElementById('vaultAddBtn').onclick = () => _openTcsForm();
        document.getElementById('vaultListMsg').innerHTML = '<div class="flex items-center gap-2 mb-2"><input id="tcsPeriodInput" type="month" class="form-input text-sm flex-1" value="'+_currentYM()+'"><button id="tcsLoadBtn" class="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">Load</button></div>';
        document.getElementById('vaultList').innerHTML = '<li class="text-center text-gray-400 py-6">Select period and click Load.</li>';
        document.getElementById('tcsLoadBtn')?.addEventListener('click', async () => {
            const period = document.getElementById('tcsPeriodInput')?.value;
            if (!period) return;
            document.getElementById('vaultList').innerHTML = '<li class="text-center text-gray-400 py-6">Loading…</li>';
            try {
                const res = await callApi(`/api/gst/tcs?period=${period}`, {}, 'GET');
                _tcsCache = res.data || [];
                _renderTcsList();
            } catch (err) { document.getElementById('vaultList').innerHTML = `<li class="text-center text-red-500 py-6">❌ ${err.message}</li>`; }
        });
    }

    function _renderTcsList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        let items = _tcsCache;
        if (q) items = items.filter(t => (t.code||'').includes(q.toUpperCase()) || (t.vendor_name||'').toLowerCase().includes(q));
        if (!items.length) { ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No TCS entries.</li>'; return; }
        ul.innerHTML = items.map(t => `<li data-entry="${t.entry_id}" class="p-3 rounded-lg cursor-pointer hover:bg-blue-50 border border-gray-200 transition-colors mb-2">
            <div class="flex justify-between items-center">
                <div><strong class="text-blue-800 text-sm">${t.code||'-'}</strong>
                <span class="text-xs text-gray-500 ml-2">${t.vendor_name||''}</span></div>
                <span class="text-sm font-semibold text-green-600">₹${(+t.amount).toFixed(2)}</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">${_fmt(t.entry_date,'date')} · @ ${t.tcs_rate}%</div>
        </li>`).join('');
        ul.querySelectorAll('li[data-entry]').forEach(li => li.addEventListener('click', () => {
            ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
            li.classList.add('selected');
            _renderTcsDetail(li.dataset.entry);
        }));
        if (items.length && !document.querySelector('#vaultList li.selected')) {
            ul.querySelector('li')?.classList.add('selected');
            _renderTcsDetail(items[0].entry_id);
        }
    }

    function _renderTcsDetail(entryId) {
        VaultPage.showDetail(true);
        const t = (_tcsCache||[]).find(x => x.entry_id === entryId);
        if (!t) return;
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">TCS — ${t.code||''}</h3>
                    <span class="px-3 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">₹${(+t.amount).toFixed(2)}</span>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div><span class="text-gray-500">Code:</span> ${t.code||'N/A'}</div>
                        <div><span class="text-gray-500">Vendor:</span> ${t.vendor_name||'N/A'}</div>
                        <div><span class="text-gray-500">Date:</span> ${_fmt(t.entry_date,'date')}</div>
                        <div><span class="text-gray-500">Collection Amount:</span> ₹${(+t.collection_amount||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">TCS Rate:</span> ${t.tcs_rate||2}%</div>
                        <div><span class="text-gray-500">TCS Amount:</span> <span class="font-semibold text-blue-600">₹${(+t.amount).toFixed(2)}</span></div>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function _openTcsForm() {
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card max-w-lg mx-auto">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">New TCS Entry</h3></div>
                <div class="detail-card-body">
                    <form id="tcsForm" class="space-y-4">
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Code *</label>
                                <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="tcsCodeList" autocomplete="off">
                                <datalist id="tcsCodeList"></datalist>
                            </div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                <input name="entry_date" type="date" required class="form-input text-sm"></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">Collection Amount (₹) *</label>
                                <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm"></div>
                            <div><label class="block text-xs font-medium text-gray-600 mb-1">TCS Rate (%)</label>
                                <select name="tcs_rate" class="form-input text-sm"><option value="2">2% (GST TCS)</option><option value="1">1%</option><option value="0.5">0.5%</option></select></div>
                        </div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Narration</label>
                            <textarea name="narration" class="form-input text-sm" rows="2" placeholder="Optional description"></textarea></div>
                        <div class="flex justify-end gap-2 pt-2 border-t">
                            <button type="button" onclick="VaultGst._loadTcs()" class="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm flex items-center gap-2"><span>Save TCS</span></button>
                        </div>
                    </form>
                    <div id="tcsResp" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;
        _allB2B.forEach(c => { if (c.CODE) { const o = document.createElement('option'); o.value = c.CODE; o.label = `${c.CODE} - ${c.B2B_NAME||''}`; document.getElementById('tcsCodeList').appendChild(o); } });
        document.querySelector('[name="entry_date"]').value = _today();
        document.getElementById('tcsForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const resp = document.getElementById('tcsResp');
            btn.disabled = true;
            try {
                await callApi('/api/gst/tcs', { code: data.code, entry_date: _toMs(data.entry_date), amount: parseFloat(data.amount), tcs_rate: parseFloat(data.tcs_rate), narration: data.narration||'' }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = '✅ TCS entry saved.'; resp.classList.remove('hidden');
                setTimeout(() => _loadTcs(), 1200);
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message||'Failed'); resp.classList.remove('hidden');
            } finally { btn.disabled = false; }
        });
        VaultPage.showDetailPane();
    }

    // ========================================================================
    // TDS Certs
    // ========================================================================
    let _tdsCertsCache = [];
    async function _loadTdsCerts() {
        _tdsCertsCache = [];
        _injectListPane('Search code, cert no…');
        document.getElementById('vaultSearch').oninput = () => _renderTdsCertsList();
        document.getElementById('vaultAddBtn').classList.add('hidden');
        document.getElementById('vaultList').innerHTML = '<li class="text-center text-gray-400 py-6">Loading TDS certificates…</li>';
        try {
            const res = await callApi('/api/gst/tds-certs', {}, 'GET');
            _tdsCertsCache = res.data || [];
            _renderTdsCertsList();
        } catch (err) { document.getElementById('vaultList').innerHTML = `<li class="text-center text-red-500 py-6">❌ ${err.message}</li>`; }
    }

    function _renderTdsCertDetail(t) {
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">🏅 TDS Certificate — ${t.cert_no||''}</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div><span class="text-gray-500">Code:</span> ${t.code||'N/A'}</div>
                        <div><span class="text-gray-500">Vendor:</span> ${t.vendor_name||'N/A'}</div>
                        <div><span class="text-gray-500">Section:</span> ${t.section||'194Q'}</div>
                        <div><span class="text-gray-500">TDS Amount:</span> ₹${(+t.amount).toFixed(2)}</div>
                        <div><span class="text-gray-500">Rate:</span> ${t.tds_rate}%</div>
                        <div><span class="text-gray-500">Cert Date:</span> ${t.cert_date ? _fmt(t.cert_date,'date') : 'N/A'}</div>
                        <div><span class="text-gray-500">Entry Date:</span> ${_fmt(t.entry_date,'date')}</div>
                        ${t.notes ? `<div class="col-span-2"><span class="text-gray-500">Notes:</span> ${t.notes}</div>` : ''}
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function _renderTdsCertsList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        let items = _tdsCertsCache;
        if (q) items = items.filter(t =>
            (t.code||'').includes(q.toUpperCase()) || (t.cert_no||'').toLowerCase().includes(q) || (t.vendor_name||'').toLowerCase().includes(q)
        );
        if (!items.length) { ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No certificates found.</li>'; return; }
        ul.innerHTML = items.map(t => `<li data-entry="${t.entry_id}" class="p-3 rounded-lg cursor-pointer hover:bg-green-50 border border-gray-200 transition-colors mb-2">
            <div class="flex justify-between items-center">
                <div><strong class="text-green-800 text-sm">🏅 ${t.cert_no}</strong>
                <span class="text-xs text-gray-500 ml-2">${t.code}${t.vendor_name ? ' — '+t.vendor_name : ''}</span></div>
                <span class="text-sm font-semibold text-red-600">₹${(+t.amount).toFixed(2)}</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">Sec ${t.section||'194Q'} @ ${t.tds_rate}% · ${t.cert_date ? _fmt(t.cert_date,'date') : ''} · ${_fmt(t.entry_date,'date')}</div>
        </li>`).join('');
        ul.querySelectorAll('li[data-entry]').forEach(li => li.addEventListener('click', () => {
            ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
            li.classList.add('selected');
            const t = (_tdsCertsCache||[]).find(x => x.entry_id === li.dataset.entry);
            if (t) _renderTdsCertDetail(t);
        }));
        if (items.length && !document.querySelector('#vaultList li.selected')) {
            ul.querySelector('li')?.classList.add('selected');
            _renderTdsCertDetail(items[0]);
        }
    }

    // ========================================================================
    // LOAD — Main dispatcher
    // ========================================================================
    async function load() {
        const data = await getAppData();
        if (data?.BRANCHES) _allBranches = Object.values(data.BRANCHES).filter(b => b.BRANCH_CODE);
        if (data?.B2B) _allB2B = Object.values(data.B2B).filter(c => c.CODE);

        const tile = TILE_CONFIG[_activeTile];
        if (!tile) { _showError('Unknown tile: ' + _activeTile); return; }

        // Show/hide add button for list-type tiles
        document.getElementById('vaultAddBtn').classList.add('hidden');

        if (tile.type === 'report') {
            _injectListPane('Search not available for report views');
            const view = document.getElementById('vaultDetailView');
            view.innerHTML = `
                <div class="detail-card mb-4">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${tile.label}</h3></div>
                    <div class="detail-card-body">
                        ${_periodSelector()}
                        <p class="text-gray-400 text-sm">Select a branch and period, then load the report.</p>
                    </div>
                </div>`;
            document.getElementById('gstLoadBtn')?.addEventListener('click', () => {
                if (_activeTile === 'gstr1') _loadGstr1();
                else if (_activeTile === 'gstr3b') _loadGstr3b();
                else if (_activeTile === 'gstr2b') _loadGstr2b();
                else if (_activeTile === 'purchase-register') _loadPurchaseRegister();
            });
            VaultPage.showDetail(true);
            VaultPage.showDetailPane();
        } else if (_activeTile === 'gst-filing') {
            _loadFilings();
        } else if (_activeTile === 'tds') {
            await _loadTds();
        } else if (_activeTile === 'tcs') {
            await _loadTcs();
        } else if (_activeTile === 'tds-certs') {
            await _loadTdsCerts();
        }

        document.getElementById('vaultListMsg').textContent = '';
    }

    function setTile(tile) { _activeTile = tile; }

    return { load, setTile, _updateMatchStatus, _openFilingForm, _loadFilings, _loadTds, _loadTcs, _loadTdsCerts, _openTdsCertForm };
})();

window.VaultGst = VaultGst;
