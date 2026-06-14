// ============================================================================
// VAULT-QUOTATIONS.JS — Quotations (LEDGER-based, single-row proposal records)
// Tile: quotations
// API: POST /api/ledger/journal with journal_type='QUOTATION'
// Data: LEDGER entries with ENTRY_TYPE='JOURNAL' && JOURNAL_TYPE='QUOTATION'
// Full charge + tax breakdown stored as JSON in NARRATION field.
// ============================================================================

const VaultQuotations = (() => {

    let _allLedger = [];
    let _allB2B = [];

    // ── Parse breakdown from NARRATION JSON ───────────────────────────────────
    function _parseNarration(entry) {
        try {
            const p = JSON.parse(entry.NARRATION || '{}');
            if (p.charges || p.grand_total !== undefined) return p;
        } catch (_) {}
        return null;
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
            const parsed = _parseNarration(e);
            const desc = parsed?.description || (e.NARRATION ? e.NARRATION.substring(0, 60) : '');
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-cyan-50 border border-gray-200 transition-colors">
                <strong class="text-cyan-700 block text-sm">📋 ${e.CLIENT_NAME || e.CODE || '—'} — ₹${amt}</strong>
                <span class="text-xs text-gray-500">${desc}</span>
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
                (e.CLIENT_NAME || '').toLowerCase().includes(lq) ||
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

    // ── Detail view with full breakdown ───────────────────────────────────────
    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';
        const delBtn = isActive ? `<button onclick="VaultQuotations._handleDelete('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Delete</button>` : '';

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
        const validUntil = parsed?.valid_until ? fmtDate(parsed.valid_until) : '';
        const description = parsed?.description || '';

        const taxRows = isInter
            ? (taxable>0 ? `<div class="flex justify-between text-sm"><span class="text-gray-600">IGST @ ${taxRate}%</span><span>₹${igst.toFixed(2)}</span></div>` : '')
            : (taxable>0 ? `<div class="flex justify-between text-sm"><span class="text-gray-600">SGST @ ${taxRate/2}%</span><span>₹${sgst.toFixed(2)}</span></div>
                           <div class="flex justify-between text-sm"><span class="text-gray-600">CGST @ ${taxRate/2}%</span><span>₹${cgst.toFixed(2)}</span></div>` : '');

        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">📋 Quotation</h3>
                    <div class="flex gap-2 items-center">
                        ${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : ''}
                        <span class="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">₹${grandTotal.toFixed(2)}</span>
                        ${delBtn}
                    </div>
                </div>
                <div class="detail-card-body space-y-3">
                    <!-- Header info -->
                    <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-3 rounded-lg">
                        <div><span class="text-gray-500">Client:</span> <span class="font-semibold">${entry.CLIENT_NAME || entry.CODE || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Code:</span> ${entry.CODE || 'N/A'}</div>
                        <div><span class="text-gray-500">Status:</span> ${entry.STATUS || 'N/A'}</div>
                        ${validUntil ? `<div><span class="text-gray-500">Valid Until:</span> ${validUntil}</div>` : ''}
                        <div><span class="text-gray-500">GST:</span> ${entry.CLIENT_GST || 'N/A'}</div>
                    </div>

                    ${description ? `<div class="text-sm text-gray-700 bg-white border rounded-lg p-3">📝 ${description}</div>` : ''}

                    <!-- Charge breakdown -->
                    ${chargeRows ? `<div class="border rounded-lg p-3 space-y-1.5 bg-white">
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Operating Charges</div>
                        ${chargeRows}
                        <hr class="border-gray-200 my-1.5">
                        <div class="flex justify-between text-sm font-semibold"><span>Charges Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
                    </div>` : ''}

                    <!-- Tax breakdown -->
                    ${taxRows ? `<div class="border rounded-lg p-3 space-y-1.5 bg-white">
                        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tax Details</div>
                        <div class="flex justify-between text-sm"><span class="text-gray-600">Taxable Value</span><span>₹${taxable.toFixed(2)}</span></div>
                        ${taxRows}
                        <hr class="border-gray-200 my-1.5">
                        <div class="flex justify-between text-sm font-semibold"><span>Total Tax</span><span>₹${totalTax.toFixed(2)}</span></div>
                    </div>` : ''}

                    <!-- Grand Total -->
                    <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex justify-between items-center">
                        <span class="text-sm font-bold text-indigo-800">GRAND TOTAL</span>
                        <span class="text-lg font-bold text-indigo-700">₹${grandTotal.toFixed(2)}</span>
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── New Quotation Form ─────────────────────────────────────────────────────
    function _buildNarrationJson(d) {
        return JSON.stringify({
            description: d.description || '',
            valid_until: d.valid_until ? new Date(d.valid_until + 'T00:00:00Z').getTime() : 0,
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

    function _recalc() {
        const get = (id) => parseFloat(document.getElementById(id)?.value || 0);
        const fright = get('quot_fright');
        const fuel = get('quot_fuel');
        const cod = get('quot_cod');
        const topay = get('quot_topay');
        const fov = get('quot_fov');
        const eway = get('quot_eway');
        const awb = get('quot_awb');
        const pack = get('quot_pack');
        const dev = get('quot_dev');

        const subtotal = fright + fuel + cod + topay + fov + eway + awb + pack + dev;
        const taxable = subtotal;
        const taxRate = parseFloat(document.getElementById('quot_tax_rate')?.value || 18);
        const isInter = document.getElementById('quot_is_inter')?.checked || false;

        let sgst = 0, cgst = 0, igst = 0;
        if (isInter) {
            igst = taxable * (taxRate / 100);
        } else {
            sgst = taxable * (taxRate / 200);
            cgst = taxable * (taxRate / 200);
        }
        const totalTax = sgst + cgst + igst;
        const grandTotal = taxable + totalTax;

        document.getElementById('quot_subtotal').textContent = subtotal.toFixed(2);
        document.getElementById('quot_taxable').textContent = taxable.toFixed(2);
        document.getElementById('quot_sgst_val').textContent = sgst.toFixed(2);
        document.getElementById('quot_cgst_val').textContent = cgst.toFixed(2);
        document.getElementById('quot_igst_val').textContent = igst.toFixed(2);
        document.getElementById('quot_grand_total').textContent = grandTotal.toFixed(2);

        // Store computed values for submit
        document.getElementById('quot_computed').dataset.subtotal = subtotal;
        document.getElementById('quot_computed').dataset.taxable = taxable;
        document.getElementById('quot_computed').dataset.sgst = sgst;
        document.getElementById('quot_computed').dataset.cgst = cgst;
        document.getElementById('quot_computed').dataset.igst = igst;
        document.getElementById('quot_computed').dataset.taxPercent = taxRate;
        document.getElementById('quot_computed').dataset.isInter = isInter;
        document.getElementById('quot_computed').dataset.grandTotal = grandTotal;

        // Toggle tax label visibility
        document.getElementById('quot_sgst_row').classList.toggle('hidden', isInter);
        document.getElementById('quot_cgst_row').classList.toggle('hidden', isInter);
        document.getElementById('quot_igst_row').classList.toggle('hidden', !isInter);
    }

    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📋 New Quotation</h3></div>
                <div class="detail-card-body">
                    <form id="quotForm" class="space-y-4">
                        <!-- Row 1: Client + Dates -->
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                                <label class="block text-xs font-medium text-gray-600 mb-1">Valid Until</label>
                                <input name="valid_until" type="date" class="form-input text-sm">
                            </div>
                        </div>

                        <!-- Charges Breakdown -->
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Operating Charges</div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <div><label class="block text-xs text-gray-500">Freight</label><input id="quot_fright" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultQuotations._recalc()" placeholder="0"></div>
                                <div><label class="block text-xs text-gray-500">Fuel Surcharge</label><input id="quot_fuel" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultQuotations._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">COD Charges</label><input id="quot_cod" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultQuotations._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">ToPay Charges</label><input id="quot_topay" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultQuotations._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">Insurance (FOV)</label><input id="quot_fov" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultQuotations._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">E-Way Charges</label><input id="quot_eway" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultQuotations._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">AWB Charges</label><input id="quot_awb" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultQuotations._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">Packaging</label><input id="quot_pack" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultQuotations._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">Development</label><input id="quot_dev" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultQuotations._recalc()"></div>
                            </div>
                            <div class="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200">
                                <span>Charges Subtotal</span>
                                <span id="quot_subtotal" class="text-indigo-700">0.00</span>
                            </div>
                        </div>

                        <!-- Tax Section -->
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tax Details</div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
                                <div>
                                    <label class="block text-xs text-gray-500">GST Rate</label>
                                    <select id="quot_tax_rate" class="form-input text-sm" onchange="VaultQuotations._recalc()">
                                        <option value="0">0% (No Tax)</option>
                                        <option value="5">5%</option>
                                        <option value="12">12%</option>
                                        <option value="18" selected>18%</option>
                                        <option value="28">28%</option>
                                    </select>
                                </div>
                                <div class="flex items-center gap-2 pt-5">
                                    <input id="quot_is_inter" type="checkbox" class="rounded border-gray-300" onchange="VaultQuotations._recalc()">
                                    <label for="quot_is_inter" class="text-xs text-gray-600">Inter-State (IGST)</label>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-200 text-sm">
                                <div><span class="text-gray-500">Taxable Value:</span> <span id="quot_taxable" class="font-semibold">0.00</span></div>
                                <div id="quot_sgst_row"><span class="text-gray-500">SGST:</span> <span id="quot_sgst_val" class="font-semibold">0.00</span></div>
                                <div id="quot_cgst_row"><span class="text-gray-500">CGST:</span> <span id="quot_cgst_val" class="font-semibold">0.00</span></div>
                                <div id="quot_igst_row" class="hidden"><span class="text-gray-500">IGST:</span> <span id="quot_igst_val" class="font-semibold">0.00</span></div>
                            </div>
                        </div>

                        <!-- Grand Total Display -->
                        <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex justify-between items-center">
                            <span class="font-bold text-indigo-800">GRAND TOTAL</span>
                            <span id="quot_grand_total" class="text-xl font-bold text-indigo-700">0.00</span>
                        </div>

                        <!-- Description + Submit -->
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Description / Notes</label>
                            <textarea name="description" class="form-input text-sm" rows="2" placeholder="Items, services, terms…"></textarea>
                        </div>

                        <div class="flex justify-between items-center pt-2 border-t">
                            <div id="quotResponse" class="hidden text-sm"></div>
                            <button type="submit" class="btn btn-sm flex items-center gap-2 ml-auto">
                                <span id="quotBtnText">Save Quotation</span>
                                <div id="quotSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="quot_computed" data-subtotal="0" data-taxable="0" data-sgst="0" data-cgst="0" data-igst="0" data-taxPercent="18" data-isInter="false" data-grandTotal="0"></div>
                </div>
            </div>`;

        // Populate code datalist
        const dl = document.getElementById('quotCodeList');
        _allB2B.forEach(c => {
            if (c.CODE) { const o = document.createElement('option'); o.value = c.CODE; o.label = `${c.CODE} - ${c.B2B_NAME || ''}`; dl.appendChild(o); }
        });

        // Default dates
        const d = document.querySelector('[name="entry_date"]');
        if (d) d.value = new Date().toISOString().split('T')[0];
        const vu = document.querySelector('[name="valid_until"]');
        if (vu) { const dt = new Date(); dt.setDate(dt.getDate() + 30); vu.value = dt.toISOString().split('T')[0]; }

        _recalc();

        // ── Submit ──
        document.getElementById('quotForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const raw = Object.fromEntries(fd);
            const comp = document.getElementById('quot_computed').dataset;
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('quotSpinner');
            const resp = document.getElementById('quotResponse');
            btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            const chargesSubtotal = parseFloat(comp.subtotal);
            const grandTotal = parseFloat(comp.grandTotal);

            const getQ = (id) => parseFloat(document.getElementById('quot_'+id)?.value || 0);
            const payload = {
                code: raw.code,
                entry_date: toMs(raw.entry_date),
                journal_type: 'QUOTATION',
                narration: _buildNarrationJson({
                    description: raw.description,
                    valid_until: raw.valid_until,
                    fright: getQ('fright'),
                    fuel_chg: getQ('fuel'),
                    cod_chg: getQ('cod'),
                    topay_chg: getQ('topay'),
                    fov_chg: getQ('fov'),
                    eway_chg: getQ('eway'),
                    awb_chg: getQ('awb'),
                    pack_chg: getQ('pack'),
                    dev_chg: getQ('dev'),
                    charges_subtotal: chargesSubtotal,
                    taxable: parseFloat(comp.taxable),
                    sgst: parseFloat(comp.sgst),
                    cgst: parseFloat(comp.cgst),
                    igst: parseFloat(comp.igst),
                    tax_percent: parseFloat(comp.taxPercent),
                    is_inter_state: comp.isInter,
                    grand_total: grandTotal,
                }),
                branch: '',
                debit: grandTotal,
                credit: 0,
                taxable_amt: parseFloat(comp.taxable),
                cgst: parseFloat(comp.cgst),
                sgst: parseFloat(comp.sgst),
                igst: parseFloat(comp.igst),
                total_amount: grandTotal,
                tax_type: 'GST',
                tax_schema: comp.isInter === 'true' ? 'REVERSE' : 'FORWARD',
                tax_percent: parseFloat(comp.taxPercent),
                service_code: '',
            };

            try {
                const res = await callApi('/api/ledger/journal', payload, 'POST');
                resp.className = 'mt-2 text-sm bg-green-100 text-green-800 px-3 py-2 rounded';
                resp.textContent = '✅ Quotation saved!';
                resp.classList.remove('hidden');
                e.target.reset();
                _recalc();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderList(_allLedger);
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

    // ── Load ───────────────────────────────────────────────────────────────────
    async function load() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, client, description…';
        document.getElementById('vaultSearch').oninput = (e) => search(e.target ? e.target.value : '');
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            _allB2B = data.B2B ? Object.values(data.B2B) : [];
            _renderList(_allLedger);
        }
    }

    return { load, search, openAddPane, _handleDelete, _recalc };
})();

window.VaultQuotations = VaultQuotations;
