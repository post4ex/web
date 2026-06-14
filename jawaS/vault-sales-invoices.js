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
            (e.ENTRY_TYPE || '').toUpperCase() === 'INVOICE' &&
            (e.DIRECTION || '').toUpperCase() === 'OUTWARD'
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

    // ── GST filing check ────────────────────────────────────────────────────
    let _gstFiledCache = null;

    async function _ensureGstFiledCache() {
        if (_gstFiledCache) return _gstFiledCache;
        try {
            const res = await callApi('/api/gst/filings', {}, 'GET');
            _gstFiledCache = (res.data || []).filter(f =>
                f.return_type === 'GSTR1' && f.status === 'FILED'
            );
        } catch {
            _gstFiledCache = [];
        }
        return _gstFiledCache;
    }

    function _isGstFiled(branch, entryDate) {
        if (!branch || !entryDate) return false;
        const d = new Date(entryDate);
        if (isNaN(d.getTime())) return false;
        const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        return (_gstFiledCache || []).some(f =>
            f.branch === branch && f.period === period
        );
    }

    // ── Delete (void) ─────────────────────────────────────────────────────────
    async function _handleDelete(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry) return;
        if (!confirm(`Delete invoice ${entry.INV_NUMBER || entry.INVOICE_ID || ''}?\n\nThis will void the entry and recalculate balances.`)) return;
        const reason = prompt('Reason for deletion (optional):', '') || '';
        try {
            await callApi('/api/ledger/void', { entry_id: entry.ENTRY_ID, void_reason: reason }, 'POST');
            const appData = await getAppData();
            if (appData?.LEDGER) {
                _allLedger = Object.values(appData.LEDGER);
                _renderList();
            }
            document.getElementById('vaultDetailView').innerHTML = `
                <div class="detail-card"><div class="detail-card-body text-center py-8">
                    <div class="text-4xl mb-3">🗑️</div>
                    <p class="text-gray-500 text-sm">Invoice has been deleted (voided).</p>
                </div></div>`;
        } catch (err) {
            alert('Failed to delete: ' + (err.message || err));
        }
    }

    function _renderDetailById(entryId) {
        _renderDetail(_allLedger.find(e => e.ENTRY_ID === entryId));
    }

    function _printEntry(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (entry) VaultPrint.printSalesInvoice(entry);
    }

    // ── Edit (void old → create new) ──────────────────────────────────────────
    function _openEditForm(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const entryDate = entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE, 'input') : new Date().toISOString().split('T')[0];
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">✏️ Edit Invoice — ${entry.INV_NUMBER || 'N/A'}</h3></div>
                <div class="detail-card-body">
                    <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
                        ⚠️ Editing will void the current invoice and create a replacement.
                    </p>
                    <form id="siEditForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                            <input name="code" id="siEditCode" required class="form-input text-sm uppercase" value="${entry.CODE || ''}" list="siEditCodeList" autocomplete="off">
                            <datalist id="siEditCodeList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                            <input name="branch" id="siEditBranch" class="form-input text-sm uppercase" value="${entry.BRANCH || ''}" list="siEditBranchList">
                            <datalist id="siEditBranchList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Number</label>
                            <input name="inv_number" class="form-input text-sm" value="${entry.INV_NUMBER || ''}" placeholder="Auto-generate if blank">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Date *</label>
                            <input name="inv_date" type="date" required class="form-input text-sm" value="${entryDate}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" value="${(+entry.DEBIT||0).toFixed(2)}" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">POS (State Code)</label>
                            <input name="pos" id="siEditPos" class="form-input text-sm" value="${entry.POS || ''}" maxlength="2">
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration</label>
                            <input name="narration" class="form-input text-sm" value="${entry.NARRATION || ''}" placeholder="Invoice description">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t gap-2">
                            <button type="button" onclick="VaultSalesInvoices._renderDetailById('${entry.ENTRY_ID}')" class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="siEditBtnText">Save Changes</span>
                                <div id="siEditSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="siEditResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate datalists
        getAppData().then(data => {
            const dl = document.getElementById('siEditCodeList');
            if (data?.B2B) Object.values(data.B2B).forEach(c => {
                if (c.CODE) { const o = document.createElement('option'); o.value = c.CODE; o.label = `${c.CODE} - ${c.B2B_NAME || ''}`; dl.appendChild(o); }
            });
            const bdl = document.getElementById('siEditBranchList');
            if (data?.BRANCHES) Object.values(data.BRANCHES).forEach(b => {
                if (b.BRANCH_CODE) { const o = document.createElement('option'); o.value = b.BRANCH_CODE; bdl.appendChild(o); }
            });
        });

        // Auto-fill branch/POS on code change
        document.getElementById('siEditCode').addEventListener('input', function() {
            const code = this.value.trim().toUpperCase();
            const b2b = _b2bMap.get(code);
            if (b2b) {
                const bi = document.getElementById('siEditBranch');
                if (b2b.BRANCH && !bi.value) bi.value = b2b.BRANCH;
                const pi = document.getElementById('siEditPos');
                if (b2b.CODE_STATE && !pi.value) pi.value = b2b.CODE_STATE;
            }
        });

        document.getElementById('siEditForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('siEditSpinner');
            const resp = document.getElementById('siEditResponse');
            btn.disabled = true; sp.classList.remove('hidden');
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;

            try {
                // Step 1: Void the current entry
                await callApi('/api/ledger/void', {
                    entry_id: entry.ENTRY_ID,
                    void_reason: `Replaced by edit`,
                }, 'POST');

                // Step 2: Create new entry
                const res = await callApi('/api/ledger/invoice', {
                    code: data.code,
                    branch: data.branch || '',
                    inv_number: data.inv_number || '',
                    inv_date: toMs(data.inv_date),
                    amount: parseFloat(data.amount),
                    pos: data.pos || '',
                    narration: data.narration || `Invoice ${data.inv_number || ''}`,
                    service_code: '',
                }, 'POST');

                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Updated — old voided, new invoice ${res.inv_number} created. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');

                const appData = await getAppData();
                if (appData?.LEDGER) {
                    _allLedger = Object.values(appData.LEDGER);
                    _renderList();
                }
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed to edit invoice');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });
        VaultPage.showDetailPane();
    }

    // ── Detail pane (with charge breakdown) ────────────────────────────────────
    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const isStandalone = (entry.INVOICE_ID || '').startsWith('SI-');
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';

        // Async check GST filing
        _ensureGstFiledCache().then(() => {
            const gstFiled = _isGstFiled(entry.BRANCH || entry.BRANCH_NAME, entry.ENTRY_DATE);
            const showActions = isStandalone && isActive && !gstFiled && !isVoid;
            const actionsEl = document.getElementById('siDetailActions');
            if (actionsEl) {
                actionsEl.style.display = showActions ? '' : 'none';
                if (gstFiled && !actionsEl.dataset.gstNote) {
                    actionsEl.dataset.gstNote = '1';
                    const note = document.createElement('p');
                    note.className = 'text-xs text-gray-400 mt-1';
                    note.textContent = 'GST already filed — editing locked.';
                    actionsEl.appendChild(note);
                }
            }
        });

        const actionBtns = isStandalone && !isVoid ? `
            <div id="siDetailActions" class="flex gap-2" style="display:none">
                <button onclick="VaultSalesInvoices._printEntry('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                    Print
                </button>
                <button onclick="VaultSalesInvoices._openEditForm('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 flex items-center gap-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    Edit
                </button>
                <button onclick="VaultSalesInvoices._handleDelete('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    Delete
                </button>
            </div>` : '';

        // Parse breakdown from NARRATION
        const parsed = _parseNarration(entry);
        const charges = parsed?.charges || {};
        const chgNames = {fright:'Freight',fuel_chg:'Fuel Surcharge',cod_chg:'COD Charges',topay_chg:'ToPay Charges',
                         fov_chg:'Insurance',eway_chg:'E-Way Charges',awb_chg:'AWB Charges',pack_chg:'Packaging',dev_chg:'Development'};
        const chargeRows = Object.keys(chgNames)
            .filter(k => (charges[k]||0) > 0)
            .map(k => `<div class="flex justify-between text-sm"><span class="text-gray-600">${chgNames[k]}</span><span>₹${(+charges[k]).toFixed(2)}</span></div>`)
            .join('');
        const subtotal = (parsed?.charges_subtotal || 0);
        const taxable = (parsed?.taxable || 0);
        const sgst = (parsed?.sgst || 0);
        const cgst = (parsed?.cgst || 0);
        const igst = (parsed?.igst || 0);
        const totalTax = sgst + cgst + igst;
        const grandTotal = (parsed?.grand_total || +entry.DEBIT || 0);
        const taxRate = (parsed?.tax_percent || 0);
        const isInter = parsed?.is_inter_state || false;
        const description = parsed?.description || '';

        const taxPart = isInter
            ? (taxable>0 ? `<div class="flex justify-between text-sm"><span class="text-gray-600">IGST @ ${taxRate}%</span><span>₹${igst.toFixed(2)}</span></div>` : '')
            : (taxable>0 ? `<div class="flex justify-between text-sm"><span class="text-gray-600">SGST @ ${taxRate/2}%</span><span>₹${sgst.toFixed(2)}</span></div>
                           <div class="flex justify-between text-sm"><span class="text-gray-600">CGST @ ${taxRate/2}%</span><span>₹${cgst.toFixed(2)}</span></div>` : '');

        const breakdownHtml = chargeRows ? `
            <div class="border rounded-lg p-3 space-y-1.5 bg-white mt-3">
                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Operating Charges</div>
                ${chargeRows}
                <hr class="border-gray-200 my-1.5">
                <div class="flex justify-between text-sm font-semibold"><span>Charges Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
            </div>
            ${taxPart ? `<div class="border rounded-lg p-3 space-y-1.5 bg-white mt-2">
                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tax Details</div>
                <div class="flex justify-between text-sm"><span class="text-gray-600">Taxable Value</span><span>₹${taxable.toFixed(2)}</span></div>
                ${taxPart}
                <hr class="border-gray-200 my-1.5">
                <div class="flex justify-between text-sm font-semibold"><span>Total Tax</span><span>₹${totalTax.toFixed(2)}</span></div>
            </div>` : ''}
            <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex justify-between items-center mt-2">
                <span class="text-sm font-bold text-indigo-800">GRAND TOTAL</span>
                <span class="text-lg font-bold text-indigo-700">₹${grandTotal.toFixed(2)}</span>
            </div>` : '';

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">Sales Invoice — ${entry.INV_NUMBER || 'N/A'}</h3>
                    ${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : actionBtns}
                </div>
                <div class="detail-card-body">
                    <!-- Header info grid -->
                    <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-3 rounded-lg">
                        <div><span class="text-gray-500">Invoice:</span> <span class="font-semibold">${entry.INV_NUMBER || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Client:</span> ${entry.CLIENT_NAME || entry.CODE || 'N/A'}</div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Status:</span> <span class="font-medium">${entry.STATUS || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Branch:</span> ${entry.BRANCH_NAME || entry.BRANCH || 'N/A'}</div>
                        <div><span class="text-gray-500">GST:</span> ${entry.CLIENT_GST || 'N/A'}</div>
                        <div><span class="text-gray-500">POS:</span> ${entry.POS || 'N/A'}</div>
                        <div><span class="text-gray-500">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                    </div>

                    ${description ? `<div class="text-sm text-gray-700 mt-2">📝 ${description}</div>` : ''}

                    <!-- Breakdown -->
                    ${breakdownHtml}

                    <!-- Audit info -->
                    <details class="mt-4">
                        <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Audit Info</summary>
                        <div class="grid grid-cols-2 gap-3 text-xs text-gray-500 mt-2 p-3 border rounded-lg">
                            <div>ID: ${entry.ENTRY_ID}</div>
                            <div>FY: ${entry.FY || 'N/A'}</div>
                            <div>Created: ${entry.USER_NAME || 'N/A'}</div>
                            <div>Staff: ${entry.STAFF_NAME || ''}</div>
                            ${entry.APPROVED_BY ? `<div>Approved: ${entry.APPROVED_BY}</div>` : ''}
                            ${entry.VOID_REASON ? `<div class="col-span-2 text-red-600">Void: ${entry.VOID_REASON}</div>` : ''}
                        </div>
                    </details>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Parse breakdown from NARRATION ────────────────────────────────────────
    function _parseNarration(entry) {
        try {
            const p = JSON.parse(entry.NARRATION || '{}');
            if (p.charges || p.grand_total !== undefined) return p;
        } catch (_) {}
        return null;
    }

    // ── Charge recalc ─────────────────────────────────────────────────────────
    function _recalc() {
        function get(id) { return parseFloat(document.getElementById(id)?.value || 0); }
        const fright = get('si_fright'), fuel = get('si_fuel'), cod = get('si_cod'),
              topay = get('si_topay'), fov = get('si_fov'), eway = get('si_eway'),
              awb = get('si_awb'), pack = get('si_pack'), dev = get('si_dev');
        const subtotal = fright + fuel + cod + topay + fov + eway + awb + pack + dev;
        const taxable = subtotal;
        const taxRate = parseFloat(document.getElementById('si_tax_rate')?.value || 18);
        const isInter = document.getElementById('si_is_inter')?.checked || false;
        let sgst = 0, cgst = 0, igst = 0;
        if (isInter) {
            igst = taxable * (taxRate / 100);
        } else {
            sgst = taxable * (taxRate / 200);
            cgst = taxable * (taxRate / 200);
        }
        const totalTax = sgst + cgst + igst;
        const grandTotal = taxable + totalTax;

        document.getElementById('si_subtotal').textContent = subtotal.toFixed(2);
        document.getElementById('si_taxable').textContent = taxable.toFixed(2);
        document.getElementById('si_sgst_val').textContent = sgst.toFixed(2);
        document.getElementById('si_cgst_val').textContent = cgst.toFixed(2);
        document.getElementById('si_igst_val').textContent = igst.toFixed(2);
        document.getElementById('si_grand_total').textContent = grandTotal.toFixed(2);

        const cd = document.getElementById('si_computed');
        cd.dataset.subtotal = subtotal;
        cd.dataset.taxable = taxable;
        cd.dataset.sgst = sgst;
        cd.dataset.cgst = cgst;
        cd.dataset.igst = igst;
        cd.dataset.taxPercent = taxRate;
        cd.dataset.isInter = isInter;
        cd.dataset.grandTotal = grandTotal;

        document.getElementById('si_sgst_row').classList.toggle('hidden', isInter);
        document.getElementById('si_cgst_row').classList.toggle('hidden', isInter);
        document.getElementById('si_igst_row').classList.toggle('hidden', !isInter);
    }

    function _buildNarrationJson(d) {
        return JSON.stringify({
            description: d.description || '',
            charges: {
                fright: +d.fright||0, fuel_chg: +d.fuel_chg||0, cod_chg: +d.cod_chg||0,
                topay_chg: +d.topay_chg||0, fov_chg: +d.fov_chg||0, eway_chg: +d.eway_chg||0,
                awb_chg: +d.awb_chg||0, pack_chg: +d.pack_chg||0, dev_chg: +d.dev_chg||0,
            },
            charges_subtotal: +d.charges_subtotal||0,
            taxable: +d.taxable||0,
            sgst: +d.sgst||0, cgst: +d.cgst||0, igst: +d.igst||0,
            tax_percent: +d.tax_percent||0,
            is_inter_state: d.is_inter_state === 'true',
            grand_total: +d.grand_total||0,
        });
    }

    // ── New Invoice Form (full breakdown) ─────────────────────────────────────
    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">➕ New Sales Invoice</h3></div>
                <div class="detail-card-body space-y-4">
                    <form id="siForm" class="space-y-4">
                        <!-- Row 1: Client + Dates -->
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                <input name="code" id="siCode" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="siCodeList" autocomplete="off">
                                <datalist id="siCodeList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                <input name="branch" id="siBranch" class="form-input text-sm uppercase" placeholder="Auto from client" list="siBranchList">
                                <datalist id="siBranchList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">POS (State Code)</label>
                                <input name="pos" id="siPos" class="form-input text-sm" placeholder="Auto from client" maxlength="2">
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Number <span class="text-gray-400">(optional)</span></label>
                                <input name="inv_number" class="form-input text-sm" placeholder="Auto-generate">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Invoice Date *</label>
                                <input name="inv_date" type="date" required class="form-input text-sm">
                            </div>
                        </div>

                        <!-- Charges -->
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Operating Charges</div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <div><label class="block text-xs text-gray-500">Freight</label><input id="si_fright" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultSalesInvoices._recalc()" placeholder="0"></div>
                                <div><label class="block text-xs text-gray-500">Fuel Surcharge</label><input id="si_fuel" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultSalesInvoices._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">COD Charges</label><input id="si_cod" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultSalesInvoices._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">ToPay Charges</label><input id="si_topay" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultSalesInvoices._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">Insurance (FOV)</label><input id="si_fov" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultSalesInvoices._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">E-Way Charges</label><input id="si_eway" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultSalesInvoices._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">AWB Charges</label><input id="si_awb" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultSalesInvoices._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">Packaging</label><input id="si_pack" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultSalesInvoices._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">Development</label><input id="si_dev" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultSalesInvoices._recalc()"></div>
                            </div>
                            <div class="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200">
                                <span>Charges Subtotal</span>
                                <span id="si_subtotal" class="text-indigo-700">0.00</span>
                            </div>
                        </div>

                        <!-- Tax -->
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tax Details</div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
                                <div>
                                    <label class="block text-xs text-gray-500">GST Rate</label>
                                    <select id="si_tax_rate" class="form-input text-sm" onchange="VaultSalesInvoices._recalc()">
                                        <option value="0">0% (No Tax)</option>
                                        <option value="5">5%</option>
                                        <option value="12">12%</option>
                                        <option value="18" selected>18%</option>
                                        <option value="28">28%</option>
                                    </select>
                                </div>
                                <div class="flex items-center gap-2 pt-5">
                                    <input id="si_is_inter" type="checkbox" class="rounded border-gray-300" onchange="VaultSalesInvoices._recalc()">
                                    <label for="si_is_inter" class="text-xs text-gray-600">Inter-State (IGST)</label>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-200 text-sm">
                                <div><span class="text-gray-500">Taxable:</span> <span id="si_taxable" class="font-semibold">0.00</span></div>
                                <div id="si_sgst_row"><span class="text-gray-500">SGST:</span> <span id="si_sgst_val" class="font-semibold">0.00</span></div>
                                <div id="si_cgst_row"><span class="text-gray-500">CGST:</span> <span id="si_cgst_val" class="font-semibold">0.00</span></div>
                                <div id="si_igst_row" class="hidden"><span class="text-gray-500">IGST:</span> <span id="si_igst_val" class="font-semibold">0.00</span></div>
                            </div>
                        </div>

                        <!-- Grand Total -->
                        <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex justify-between items-center">
                            <span class="font-bold text-indigo-800">GRAND TOTAL</span>
                            <span id="si_grand_total" class="text-xl font-bold text-indigo-700">0.00</span>
                        </div>

                        <!-- Narration -->
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration</label>
                            <input name="narration" class="form-input text-sm" placeholder="Invoice description (optional)">
                        </div>

                        <!-- Submit -->
                        <div class="flex justify-between items-center pt-2 border-t">
                            <div id="siResponse" class="hidden text-sm"></div>
                            <button type="submit" class="btn btn-sm flex items-center gap-2 ml-auto">
                                <span id="siBtnText">Create Invoice</span>
                                <div id="siSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="si_computed" data-subtotal="0" data-taxable="0" data-sgst="0" data-cgst="0" data-igst="0" data-taxPercent="18" data-isInter="false" data-grandTotal="0"></div>
                </div>
            </div>`;

        // Populate client + branch datalists
        getAppData().then(data => {
            const dl = document.getElementById('siCodeList');
            if (data?.B2B) Object.values(data.B2B).forEach(c => {
                if (c.CODE) { const o = document.createElement('option'); o.value = c.CODE; o.label = `${c.CODE} - ${c.B2B_NAME || ''}`; dl.appendChild(o); }
            });
            const bdl = document.getElementById('siBranchList');
            if (data?.BRANCHES) Object.values(data.BRANCHES).forEach(b => {
                if (b.BRANCH_CODE) { const o = document.createElement('option'); o.value = b.BRANCH_CODE; bdl.appendChild(o); }
            });
        });

        // Auto-fill branch/POS on code change
        document.getElementById('siCode').addEventListener('input', function() {
            const code = this.value.trim().toUpperCase();
            const b2b = _b2bMap.get(code);
            if (b2b) {
                const bi = document.getElementById('siBranch');
                if (b2b.BRANCH && !bi.value) bi.value = b2b.BRANCH;
                const pi = document.getElementById('siPos');
                if (b2b.CODE_STATE && !pi.value) pi.value = b2b.CODE_STATE;
            }
        });

        // Default date
        const d = document.querySelector('[name="inv_date"]');
        if (d) d.value = new Date().toISOString().split('T')[0];

        _recalc();

        // Submit
        document.getElementById('siForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const raw = Object.fromEntries(fd);
            const comp = document.getElementById('si_computed').dataset;
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('siSpinner');
            const resp = document.getElementById('siResponse');
            btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            const grandTotal = parseFloat(comp.grandTotal);

            const getQ = (id) => parseFloat(document.getElementById('si_'+id)?.value || 0);
            const chargeData = {
                fright: getQ('fright'), fuel_chg: getQ('fuel'), cod_chg: getQ('cod'),
                topay_chg: getQ('topay'), fov_chg: getQ('fov'), eway_chg: getQ('eway'),
                awb_chg: getQ('awb'), pack_chg: getQ('pack'), dev_chg: getQ('dev'),
            };

            try {
                const res = await callApi('/api/ledger/invoice', {
                    code: raw.code,
                    branch: raw.branch || '',
                    inv_number: raw.inv_number || '',
                    inv_date: toMs(raw.inv_date),
                    amount: grandTotal,
                    pos: raw.pos || '',
                    narration: _buildNarrationJson({
                        description: raw.narration || '',
                        ...chargeData,
                        charges_subtotal: parseFloat(comp.subtotal),
                        taxable: parseFloat(comp.taxable),
                        sgst: parseFloat(comp.sgst),
                        cgst: parseFloat(comp.cgst),
                        igst: parseFloat(comp.igst),
                        tax_percent: parseFloat(comp.taxPercent),
                        is_inter_state: comp.isInter,
                        grand_total: grandTotal,
                    }),
                    taxable_amt: parseFloat(comp.taxable),
                    cgst: parseFloat(comp.cgst),
                    sgst: parseFloat(comp.sgst),
                    igst: parseFloat(comp.igst),
                    total_amount: grandTotal,
                    tax_type: 'GST',
                    tax_schema: comp.isInter === 'true' ? 'REVERSE' : 'FORWARD',
                    tax_percent: parseFloat(comp.taxPercent),
                    service_code: '',
                }, 'POST');
                resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                resp.textContent = `✅ Invoice ${res.inv_number} created. Balance: ₹${(+res.balance||0).toFixed(2)}`;
                resp.classList.remove('hidden');
                e.target.reset();
                if (d) d.value = new Date().toISOString().split('T')[0];
                _recalc();
                const appData = await getAppData();
                if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _renderList(); }
            } catch (err) {
                resp.className = 'mt-2 text-sm bg-red-100 text-red-800 px-3 py-2 rounded';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });
        VaultPage.showDetailPane();
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        // Wire search input
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();
        const data = await getAppData();
        if (data) {
            _allLedger = Object.values(data.LEDGER || {});
            _b2bMap.clear();
            if (data.B2B) Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
            _renderList(_allLedger);
        }
    }

    return { load, search, openAddPane, _handleDelete, _openEditForm, _renderDetailById, _recalc, _printEntry };
})();

window.VaultSalesInvoices = VaultSalesInvoices;
