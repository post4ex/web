// ============================================================================
// VAULT-GST.JS — GSTR-1/3B reports, purchase register, filing tracker
// Tiles: gstr1, gstr3b, gst-filing, purchase-register
// API: GET /api/gst/gstr1, GET /api/gst/gstr3b, GET/POST/PATCH /api/gst/filings
// ============================================================================

const VaultGst = (() => {

    let _allBranches = [];
    let _activeTile = 'gstr1';

    function _can(role) { return window.VaultPage?.can(role); }

    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    // ── Period selector shared UI ────────────────────────────────────────────
    function _periodSelector() {
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return `
            <div class="flex flex-wrap items-end gap-3 mb-4">
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                    <select id="gstBranchSelect" class="form-input text-sm">
                        <option value="">Select branch</option>
                        ${_allBranches.map(b => `<option value="${b.BRANCH_CODE}">${b.BRANCH_NAME || b.BRANCH_CODE}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Period</label>
                    <input id="gstPeriodInput" type="month" class="form-input text-sm" value="${ym}">
                </div>
                <div>
                    <button id="gstLoadBtn" class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">Load Report</button>
                </div>
            </div>`;
    }

    // ── GSTR-1 ───────────────────────────────────────────────────────────────
    async function _loadGstr1() {
        const branch = document.getElementById('gstBranchSelect')?.value;
        const period = document.getElementById('gstPeriodInput')?.value;
        if (!branch || !period) {
            _showError('Please select both branch and period.');
            return;
        }
        document.getElementById('vaultDetailView').innerHTML = '<div class="text-center text-gray-400 py-8">Loading GSTR-1…</div>';
        try {
            const res = await callApi(`/api/gst/gstr1?branch=${branch}&period=${period}`, {}, 'GET');
            _renderGstr1(res);
        } catch (err) {
            _showError('Failed to load GSTR-1: ' + (err.message || err));
        }
    }

    function _renderGstr1(data) {
        const b2b = data.b2b || [];
        const b2cs = data.b2cs || [];
        const cdn = data.cdn || [];
        const hsn = data.hsn_summary || [];

        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header">
                    <h3 class="font-semibold text-gray-700">GSTR-1 — ${data.branch} / ${data.period}</h3>
                    <span class="text-xs text-gray-500">GSTIN: ${data.gstin || 'N/A'}</span>
                </div>
            </div>

            <!-- B2B Invoices -->
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">B2B Invoices (Table 4) — ${b2b.length} invoices</h3></div>
                <div class="detail-card-body overflow-x-auto">
                    ${b2b.length ? `<table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-2 text-left">GSTIN</th><th class="px-2 py-2 text-left">Name</th>
                            <th class="px-2 py-2 text-left">Inv#</th><th class="px-2 py-2 text-left">Date</th>
                            <th class="px-2 py-2 text-right">Taxable</th><th class="px-2 py-2 text-right">CGST</th>
                            <th class="px-2 py-2 text-right">SGST</th><th class="px-2 py-2 text-right">IGST</th>
                            <th class="px-2 py-2 text-right">Total</th><th class="px-2 py-2">Type</th>
                        </tr></thead>
                        <tbody>${b2b.map(i => `<tr class="border-b">
                            <td class="px-2 py-2 font-mono">${i.recipient_gstin}</td>
                            <td class="px-2 py-2">${i.recipient_name}</td>
                            <td class="px-2 py-2">${i.inv_number}</td>
                            <td class="px-2 py-2">${_fmt(i.inv_date, 'date')}</td>
                            <td class="px-2 py-2 text-right">${(+i.taxable).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+i.cgst).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+i.sgst).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+i.igst).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right font-semibold">${(+i.total).toFixed(2)}</td>
                            <td class="px-2 py-2"><span class="px-2 py-0.5 rounded text-xs ${i.supply_type === 'intra' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">${i.supply_type}</span></td>
                        </tr>`).join('')}</tbody>
                    </table>` : '<p class="text-gray-400 text-sm">No B2B invoices found.</p>'}
                </div>
            </div>

            <!-- B2CS -->
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">B2CS (Table 7) — Unregistered</h3></div>
                <div class="detail-card-body overflow-x-auto">
                    ${b2cs.length ? `<table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-2">POS</th><th class="px-2 py-2 text-right">Taxable</th>
                            <th class="px-2 py-2 text-right">CGST</th><th class="px-2 py-2 text-right">SGST</th><th class="px-2 py-2 text-right">IGST</th>
                        </tr></thead>
                        <tbody>${b2cs.map(i => `<tr class="border-b">
                            <td class="px-2 py-2">${i.pos || 'N/A'}</td>
                            <td class="px-2 py-2 text-right">${(+i.taxable).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+i.cgst).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+i.sgst).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+i.igst).toFixed(2)}</td>
                        </tr>`).join('')}</tbody>
                    </table>` : '<p class="text-gray-400 text-sm">No B2CS data.</p>'}
                </div>
            </div>

            <!-- CDN -->
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Credit/Debit Notes (Table 9) — ${cdn.length}</h3></div>
                <div class="detail-card-body overflow-x-auto">
                    ${cdn.length ? `<table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-2">Type</th><th class="px-2 py-2">Date</th>
                            <th class="px-2 py-2">Name</th><th class="px-2 py-2">GSTIN</th>
                            <th class="px-2 py-2 text-right">Credit</th><th class="px-2 py-2 text-right">Debit</th>
                        </tr></thead>
                        <tbody>${cdn.map(i => `<tr class="border-b">
                            <td class="px-2 py-2"><span class="px-2 py-0.5 rounded text-xs ${i.type === 'CREDIT_NOTE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${i.type === 'CREDIT_NOTE' ? 'CN' : 'DN'}</span></td>
                            <td class="px-2 py-2">${_fmt(i.entry_date, 'date')}</td>
                            <td class="px-2 py-2">${i.recipient_name}</td>
                            <td class="px-2 py-2 font-mono">${i.recipient_gstin}</td>
                            <td class="px-2 py-2 text-right">${(+i.credit).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+i.debit).toFixed(2)}</td>
                        </tr>`).join('')}</tbody>
                    </table>` : '<p class="text-gray-400 text-sm">No credit/debit notes.</p>'}
                </div>
            </div>

            <!-- HSN -->
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">HSN Summary (Table 12)</h3></div>
                <div class="detail-card-body overflow-x-auto">
                    <table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-2">SAC</th><th class="px-2 py-2">Description</th>
                            <th class="px-2 py-2 text-right">Taxable</th><th class="px-2 py-2 text-right">CGST</th>
                            <th class="px-2 py-2 text-right">SGST</th><th class="px-2 py-2 text-right">IGST</th>
                        </tr></thead>
                        <tbody>${hsn.map(i => `<tr class="border-b">
                            <td class="px-2 py-2">${i.sac}</td><td class="px-2 py-2">${i.description}</td>
                            <td class="px-2 py-2 text-right">${(+i.taxable).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+i.cgst).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+i.sgst).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+i.igst).toFixed(2)}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── GSTR-3B ───────────────────────────────────────────────────────────────
    async function _loadGstr3b() {
        const branch = document.getElementById('gstBranchSelect')?.value;
        const period = document.getElementById('gstPeriodInput')?.value;
        if (!branch || !period) { _showError('Please select branch and period.'); return; }
        document.getElementById('vaultDetailView').innerHTML = '<div class="text-center text-gray-400 py-8">Loading GSTR-3B…</div>';
        try {
            const res = await callApi(`/api/gst/gstr3b?branch=${branch}&period=${period}`, {}, 'GET');
            _renderGstr3b(res);
        } catch (err) {
            _showError('Failed to load GSTR-3B: ' + (err.message || err));
        }
    }

    function _renderGstr3b(data) {
        VaultPage.showDetail(true);
        const o = data.outward || {};
        const itc = data.itc || {};
        const net = data.net_payable || {};
        const inter = data.inter_state_breakdown || [];

        function _row(label, taxable, cgst, sgst, igst, total, bold) {
            return `<tr class="${bold ? 'bg-indigo-50 font-bold border-t-2 border-indigo-200' : 'border-b'}">
                <td class="px-3 py-2">${label}</td>
                <td class="px-3 py-2 text-right">${taxable.toFixed(2)}</td>
                <td class="px-3 py-2 text-right">${cgst.toFixed(2)}</td>
                <td class="px-3 py-2 text-right">${sgst.toFixed(2)}</td>
                <td class="px-3 py-2 text-right">${igst.toFixed(2)}</td>
                <td class="px-3 py-2 text-right font-semibold">${total.toFixed(2)}</td>
            </tr>`;
        }

        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header">
                    <h3 class="font-semibold text-gray-700">GSTR-3B — ${data.branch} / ${data.period}</h3>
                    <span class="text-xs text-gray-500">GSTIN: ${data.gstin || 'N/A'}</span>
                </div>
            </div>

            <!-- 3.1 Outward -->
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">3.1 — Outward Taxable Supplies</h3></div>
                <div class="detail-card-body overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr>
                            <th class="px-3 py-2 text-left">Nature</th>
                            <th class="px-3 py-2 text-right">Taxable</th>
                            <th class="px-3 py-2 text-right">CGST</th>
                            <th class="px-3 py-2 text-right">SGST</th>
                            <th class="px-3 py-2 text-right">IGST</th>
                            <th class="px-3 py-2 text-right">Total</th>
                        </tr></thead>
                        <tbody>${_row('Taxable Supplies', o.taxable, o.cgst, o.sgst, o.igst, o.total)}</tbody>
                    </table>
                </div>
            </div>

            <!-- 3.2 Inter-state -->
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">3.2 — Inter-State Supplies</h3></div>
                <div class="detail-card-body overflow-x-auto">
                    ${inter.length ? `<table class="min-w-full text-sm">
                        <thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr>
                            <th class="px-3 py-2">POS</th><th class="px-3 py-2 text-right">Taxable</th><th class="px-3 py-2 text-right">IGST</th>
                        </tr></thead>
                        <tbody>${inter.map(i => `<tr class="border-b">
                            <td class="px-3 py-2">${i.pos || 'N/A'}</td>
                            <td class="px-3 py-2 text-right">${(+i.taxable).toFixed(2)}</td>
                            <td class="px-3 py-2 text-right">${(+i.igst).toFixed(2)}</td>
                        </tr>`).join('')}</tbody>
                    </table>` : '<p class="text-gray-400 text-sm">No inter-state supplies.</p>'}
                </div>
            </div>

            <!-- ITC -->
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">4 — ITC Available (${itc.entries} inward entries)</h3></div>
                <div class="detail-card-body overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr>
                            <th class="px-3 py-2 text-left">Category</th>
                            <th class="px-3 py-2 text-right">Taxable</th>
                            <th class="px-3 py-2 text-right">CGST</th>
                            <th class="px-3 py-2 text-right">SGST</th>
                            <th class="px-3 py-2 text-right">IGST</th>
                            <th class="px-3 py-2 text-right">Total</th>
                        </tr></thead>
                        <tbody>${_row('Input Services', itc.taxable, itc.cgst, itc.sgst, itc.igst, itc.taxable + itc.cgst + itc.sgst + itc.igst)}</tbody>
                    </table>
                </div>
            </div>

            <!-- Net Payable -->
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Net Tax Payable</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-3 gap-4">
                        <div class="p-4 bg-green-50 rounded-lg border border-green-200 text-center">
                            <div class="text-xs text-gray-500 uppercase font-medium">CGST</div>
                            <div class="text-xl font-bold text-green-700">₹${(+net.cgst).toFixed(2)}</div>
                        </div>
                        <div class="p-4 bg-blue-50 rounded-lg border border-blue-200 text-center">
                            <div class="text-xs text-gray-500 uppercase font-medium">SGST</div>
                            <div class="text-xl font-bold text-blue-700">₹${(+net.sgst).toFixed(2)}</div>
                        </div>
                        <div class="p-4 bg-purple-50 rounded-lg border border-purple-200 text-center">
                            <div class="text-xs text-gray-500 uppercase font-medium">IGST</div>
                            <div class="text-xl font-bold text-purple-700">₹${(+net.igst).toFixed(2)}</div>
                        </div>
                    </div>
                    <div class="mt-3 text-right text-lg font-bold text-gray-800">
                        Total Payable: ₹${(+net.cgst + +net.sgst + +net.igst).toFixed(2)}
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Purchase Register ────────────────────────────────────────────────────
    async function _loadPurchaseRegister() {
        const branch = document.getElementById('gstBranchSelect')?.value;
        const period = document.getElementById('gstPeriodInput')?.value;
        if (!branch || !period) { _showError('Please select branch and period.'); return; }
        document.getElementById('vaultDetailView').innerHTML = '<div class="text-center text-gray-400 py-8">Loading Purchase Register…</div>';
        try {
            const res = await callApi(`/api/gst/purchase-register?branch=${branch}&period=${period}`, {}, 'GET');
            _renderPurchaseRegister(res);
        } catch (err) {
            _showError('Failed: ' + (err.message || err));
        }
    }

    function _renderPurchaseRegister(data) {
        const rows = data.data || [];
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header">
                    <h3 class="font-semibold text-gray-700">Purchase Register — ${data.branch} / ${data.period}</h3>
                    <span class="text-xs text-gray-500">${data.count} entries</span>
                </div>
                <div class="detail-card-body overflow-x-auto">
                    ${rows.length ? `<table class="min-w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-2 py-2">Date</th><th class="px-2 py-2">Vendor</th>
                            <th class="px-2 py-2 font-mono">GSTIN</th><th class="px-2 py-2">Inv#</th>
                            <th class="px-2 py-2 text-right">Amount</th><th class="px-2 py-2 text-right">Taxable</th>
                            <th class="px-2 py-2 text-right">CGST</th><th class="px-2 py-2 text-right">SGST</th>
                            <th class="px-2 py-2 text-right">IGST</th><th class="px-2 py-2">ITC</th>
                        </tr></thead>
                        <tbody>${rows.map(r => `<tr class="border-b">
                            <td class="px-2 py-2">${_fmt(r.entry_date, 'date')}</td>
                            <td class="px-2 py-2">${r.vendor_name || r.vendor_type}</td>
                            <td class="px-2 py-2 font-mono">${r.vendor_gstin || '-'}</td>
                            <td class="px-2 py-2">${r.inv_number || '-'}</td>
                            <td class="px-2 py-2 text-right">${(+r.amount).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+r.taxable).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+r.cgst).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+r.sgst).toFixed(2)}</td>
                            <td class="px-2 py-2 text-right">${(+r.igst).toFixed(2)}</td>
                            <td class="px-2 py-2"><span class="px-1.5 py-0.5 rounded text-xs ${r.itc_eligible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${r.itc_eligible ? '✅' : '❌'}</span></td>
                        </tr>`).join('')}</tbody>
                    </table>` : '<p class="text-gray-400 text-sm">No purchase entries found.</p>'}
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── GST Filing Tracker ────────────────────────────────────────────────────
    async function _loadFilings() {
        VaultPage.showDetail(true);
        const branch = document.getElementById('gstBranchSelect')?.value || '';
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">Loading filing records…</div>';

        try {
            const res = await callApi(`/api/gst/filings?branch=${branch}`, {}, 'GET');
            const filings = res.data || [];

            view.innerHTML = `
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-semibold text-gray-700">GST Filing Records</h3>
                    <button onclick="VaultGst._openFilingForm();" class="btn btn-sm">+ New Filing</button>
                </div>
                <div class="detail-card">
                    <div class="detail-card-body overflow-x-auto">
                        ${filings.length ? `<table class="min-w-full text-xs">
                            <thead class="bg-gray-50"><tr>
                                <th class="px-2 py-2">Period</th><th class="px-2 py-2">Return</th>
                                <th class="px-2 py-2">Status</th><th class="px-2 py-2">Filed Date</th>
                                <th class="px-2 py-2 font-mono">ARN</th><th class="px-2 py-2">Notes</th>
                                <th class="px-2 py-2">Actions</th>
                            </tr></thead>
                            <tbody>${filings.map(f => {
                                const statusColors = { 'FILED': 'bg-green-100 text-green-700', 'PENDING': 'bg-yellow-100 text-yellow-700',
                                    'LATE': 'bg-red-100 text-red-700', 'NIL': 'bg-gray-100 text-gray-600' };
                                return `<tr class="border-b">
                                    <td class="px-2 py-2 font-medium">${f.period}</td>
                                    <td class="px-2 py-2">${f.return_type}</td>
                                    <td class="px-2 py-2"><span class="px-2 py-0.5 rounded text-xs ${statusColors[f.status] || 'bg-gray-100'}">${f.status}</span></td>
                                    <td class="px-2 py-2">${f.filed_date ? _fmt(f.filed_date, 'date') : '-'}</td>
                                    <td class="px-2 py-2 font-mono text-xs">${f.arn || '-'}</td>
                                    <td class="px-2 py-2">${f.notes || '-'}</td>
                                    <td class="px-2 py-2">
                                        <button onclick="VaultGst._editFiling('${f.entry_id}')" class="text-indigo-600 hover:text-indigo-800 text-xs">Edit</button>
                                    </td>
                                </tr>`;
                            }).join('')}</tbody>
                        </table>` : '<p class="text-gray-400 text-sm">No filing records yet.</p>'}
                    </div>
                </div>`;
            VaultPage.showDetailPane();
        } catch (err) {
            _showError('Failed: ' + (err.message || err));
        }
    }

    function _openFilingForm(existing) {
        const isEdit = !!existing;
        VaultPage.showDetail(true);
        const date = new Date();
        const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card max-w-lg mx-auto">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${isEdit ? 'Edit' : 'New'} GST Filing</h3></div>
                <div class="detail-card-body">
                    <form id="filingForm" class="space-y-4">
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch *</label>
                                <select name="branch" required class="form-input text-sm" ${isEdit ? 'disabled' : ''}>
                                    <option value="">Select</option>
                                    ${_allBranches.map(b => `<option value="${b.BRANCH_CODE}" ${isEdit && b.BRANCH_CODE === existing?.branch ? 'selected' : ''}>${b.BRANCH_NAME || b.BRANCH_CODE}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Period *</label>
                                <input name="period" type="month" required class="form-input text-sm" value="${isEdit ? existing.period : ym}" ${isEdit ? 'disabled' : ''}>
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Return Type *</label>
                            <select name="return_type" required class="form-input text-sm">
                                ${['GSTR1', 'GSTR3B', 'GSTR2B'].map(rt =>
                                    `<option value="${rt}" ${isEdit && existing?.return_type === rt ? 'selected' : ''}>${rt}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Status *</label>
                            <select name="status" required class="form-input text-sm">
                                ${['PENDING', 'FILED', 'LATE', 'NIL'].map(s =>
                                    `<option value="${s}" ${isEdit && existing?.status === s ? 'selected' : ''}>${s}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Filed Date</label>
                            <input name="filed_date" type="date" class="form-input text-sm" value="${isEdit && existing?.filed_date ? _fmt(existing.filed_date, 'input') : ''}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">ARN</label>
                            <input name="arn" class="form-input text-sm" placeholder="Acknowledgment Reference Number" value="${isEdit ? existing?.arn || '' : ''}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                            <textarea name="notes" class="form-input text-sm" rows="2">${isEdit ? existing?.notes || '' : ''}</textarea>
                        </div>
                        <div class="flex justify-end gap-2 pt-2 border-t">
                            <button type="button" onclick="VaultGst._loadFilings();" class="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="filBtnText">${isEdit ? 'Update' : 'Save'} Filing</span>
                                <div id="filSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="filResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        document.getElementById('filingForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('filSpinner');
            const resp = document.getElementById('filResponse');
            btn.disabled = true; sp.classList.remove('hidden');
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                if (isEdit) {
                    await callApi(`/api/gst/filings/${existing.entry_id}`, {
                        status: data.status, filed_date: data.filed_date ? toMs(data.filed_date) : 0,
                        arn: data.arn || '', notes: data.notes || '',
                    }, 'PATCH');
                } else {
                    await callApi('/api/gst/filings', {
                        branch: data.branch, period: data.period, return_type: data.return_type,
                        status: data.status, filed_date: data.filed_date ? toMs(data.filed_date) : 0,
                        arn: data.arn || '', notes: data.notes || '',
                    }, 'POST');
                }
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Filing ${isEdit ? 'updated' : 'saved'}.`;
                resp.classList.remove('hidden');
                setTimeout(() => _loadFilings(), 1500);
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });
        VaultPage.showDetailPane();
    }

    function _editFiling(entryId) {
        const existing = null; // fetch from API — simplified: we'll call the list again
        callApi(`/api/gst/filings?branch=`, {}, 'GET').then(res => {
            const filing = (res.data || []).find(f => f.entry_id === entryId);
            if (filing) _openFilingForm(filing);
            else _showError('Filing not found');
        }).catch(err => _showError(err.message));
    }

    // ── Shared ───────────────────────────────────────────────────────────────
    function _showError(msg) {
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `<div class="text-center text-red-500 py-8">❌ ${msg}</div>`;
        VaultPage.showDetailPane();
    }

    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data?.BRANCHES) _allBranches = Object.values(data.BRANCHES).filter(b => b.BRANCH_CODE);

        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">GST Reports</h3></div>
                <div class="detail-card-body">
                    ${_periodSelector()}
                    <p class="text-gray-400 text-sm">Select a branch and period, then load the report.</p>
                </div>
            </div>`;

        document.getElementById('gstLoadBtn').addEventListener('click', () => {
            if (_activeTile === 'gstr1') _loadGstr1();
            else if (_activeTile === 'gstr3b') _loadGstr3b();
            else if (_activeTile === 'gst-filing') _loadFilings();
            else if (_activeTile === 'purchase-register') _loadPurchaseRegister();
        });

        // If visiting purchase-register directly, show the purchase register header
        if (_activeTile === 'purchase-register') {
            document.querySelector('.detail-card .detail-card-header h3').textContent = 'Purchase Register';
        }

        VaultPage.showDetail(true);
        VaultPage.showDetailPane();
    }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search not available for GST views';
    }

    function search(q) {
        // no list search for GST — detail-driven views
    }

    function setTile(tile) { _activeTile = tile; }

    return { load, search, setTile, _openFilingForm, _loadFilings, _editFiling };
})();

window.VaultGst = VaultGst;
