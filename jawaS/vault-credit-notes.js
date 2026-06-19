// ============================================================================
// VAULT-CREDIT-NOTES.JS — Credit Notes (LEDGER-based, full charge breakdown)
// Tile: credit-notes
// Data source: appData.LEDGER (ENTRY_TYPE='JOURNAL', JOURNAL_TYPE='CREDIT_NOTE', DIRECTION='OUTWARD')
// API: POST /api/ledger/journal with journal_type='CREDIT_NOTE', credit=amount
// Breakdown stored as JSON in NARRATION field.
// ============================================================================

const VaultCreditNotes = (() => {

    let _allLedger = [];
    let _b2bMap    = new Map();

    // ── Parse NARRATION ───────────────────────────────────────────────────────
    function _parseNarration(entry) {
        try {
            const p = JSON.parse(entry.NARRATION || '{}');
            if (p.charges || p.grand_total !== undefined) return p;
        } catch (_) {}
        return null;
    }

    // ── Charge recalc ─────────────────────────────────────────────────────────
    function _recalc() {
        function get(id) { return parseFloat(document.getElementById('cn_'+id)?.value || 0); }
        const fright = get('fright'), fuel = get('fuel'), cod = get('cod'),
              topay = get('topay'), fov = get('fov'), eway = get('eway'),
              awb = get('awb'), pack = get('pack'), dev = get('dev');
        const subtotal = fright + fuel + cod + topay + fov + eway + awb + pack + dev;
        const taxable = subtotal;
        const taxRate = parseFloat(document.getElementById('cn_tax_rate')?.value || 18);
        const isInter = document.getElementById('cn_is_inter')?.checked || false;
        let sgst = 0, cgst = 0, igst = 0;
        if (isInter) { igst = taxable * (taxRate / 100); }
        else { sgst = taxable * (taxRate / 200); cgst = taxable * (taxRate / 200); }
        const grandTotal = taxable + sgst + cgst + igst;

        document.getElementById('cn_subtotal').textContent = subtotal.toFixed(2);
        document.getElementById('cn_taxable').textContent = taxable.toFixed(2);
        document.getElementById('cn_sgst_val').textContent = sgst.toFixed(2);
        document.getElementById('cn_cgst_val').textContent = cgst.toFixed(2);
        document.getElementById('cn_igst_val').textContent = igst.toFixed(2);
        document.getElementById('cn_grand_total').textContent = grandTotal.toFixed(2);

        const cd = document.getElementById('cn_computed');
        cd.dataset.subtotal = subtotal;
        cd.dataset.taxable = taxable;
        cd.dataset.sgst = sgst;
        cd.dataset.cgst = cgst;
        cd.dataset.igst = igst;
        cd.dataset.taxPercent = taxRate;
        cd.dataset.isInter = isInter;
        cd.dataset.grandTotal = grandTotal;

        document.getElementById('cn_sgst_row').classList.toggle('hidden', isInter);
        document.getElementById('cn_cgst_row').classList.toggle('hidden', isInter);
        document.getElementById('cn_igst_row').classList.toggle('hidden', !isInter);
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

    // ── List ──────────────────────────────────────────────────────────────────
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
                <span class="text-xs text-gray-500">${_parseNarration(e)?.description || e.NARRATION || ''}</span>
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

    function _printEntry(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (entry) VaultPrint.printCreditNote(entry);
    }

    function search() { _renderList(); }

    // ── Delete ────────────────────────────────────────────────────────────────
    async function _handleDelete(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry || entry.STATUS === 'VOID') return;
        if (!confirm(`Delete this credit note? Amount: ₹${(+entry.CREDIT||0).toFixed(2)}.`)) return;
        const reason = prompt('Reason for deletion (optional):', '') || '';
        try {
            // TODO: migrate void to Manager.io
            alert('Coming soon — voiding credit notes through Manager.io');
            return;
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    // ── Detail view ────────────────────────────────────────────────────────────
    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';
        const printBtn = isActive ? `<button onclick="VaultCreditNotes._printEntry('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> Print</button>` : '';
        const delBtn = isActive ? `<button onclick="VaultCreditNotes._handleDelete('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Delete</button>` : '';

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
        const grandTotal = (parsed?.grand_total || +entry.CREDIT || 0);
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
            <div class="bg-pink-50 border border-pink-200 rounded-lg p-3 flex justify-between items-center mt-2">
                <span class="text-sm font-bold text-pink-800">CREDIT AMOUNT</span>
                <span class="text-lg font-bold text-pink-700">₹${grandTotal.toFixed(2)}</span>
            </div>` : '';

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">Credit Note</h3>
                    <div class="flex gap-2 items-center">
                        ${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : ''}
                        <span class="px-2 py-0.5 rounded text-xs font-medium bg-pink-100 text-pink-700">Cr ₹${grandTotal.toFixed(2)}</span>
                        ${printBtn}${delBtn}
                    </div>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-3 rounded-lg">
                        <div><span class="text-gray-500">Client:</span> ${entry.CLIENT_NAME || entry.CODE || 'N/A'}</div>
                        <div><span class="text-gray-500">Status:</span> <span class="font-medium">${entry.STATUS || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Branch:</span> ${entry.BRANCH_NAME || entry.BRANCH || 'N/A'}</div>
                        <div><span class="text-gray-500">GST:</span> ${entry.CLIENT_GST || 'N/A'}</div>
                        <div><span class="text-gray-500">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                    </div>
                    ${description ? `<div class="text-sm text-gray-700 mt-2">📝 ${description}</div>` : ''}
                    ${breakdownHtml}
                    <details class="mt-4">
                        <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Audit Info</summary>
                        <div class="grid grid-cols-2 gap-3 text-xs text-gray-500 mt-2 p-3 border rounded-lg">
                            <div>ID: ${entry.ENTRY_ID}</div><div>FY: ${entry.FY || 'N/A'}</div>
                            <div>Created: ${entry.USER_NAME || 'N/A'}</div>
                            ${entry.VOID_REASON ? `<div class="col-span-2 text-red-600">Void: ${entry.VOID_REASON}</div>` : ''}
                        </div>
                    </details>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── New Credit Note Form (full breakdown) ────────────────────────────────
    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">➕ New Credit Note</h3></div>
                <div class="detail-card-body space-y-4">
                    <form id="cnForm" class="space-y-4">
                        <!-- Row 1: Client + Branch -->
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                        </div>

                        <!-- Charges -->
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Operating Charges (Credit)</div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <div><label class="block text-xs text-gray-500">Freight</label><input id="cn_fright" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultCreditNotes._recalc()" placeholder="0"></div>
                                <div><label class="block text-xs text-gray-500">Fuel Surcharge</label><input id="cn_fuel" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultCreditNotes._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">COD Charges</label><input id="cn_cod" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultCreditNotes._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">ToPay Charges</label><input id="cn_topay" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultCreditNotes._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">Insurance (FOV)</label><input id="cn_fov" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultCreditNotes._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">E-Way Charges</label><input id="cn_eway" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultCreditNotes._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">AWB Charges</label><input id="cn_awb" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultCreditNotes._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">Packaging</label><input id="cn_pack" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultCreditNotes._recalc()"></div>
                                <div><label class="block text-xs text-gray-500">Development</label><input id="cn_dev" type="number" step="0.01" min="0" class="form-input text-sm" oninput="VaultCreditNotes._recalc()"></div>
                            </div>
                            <div class="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200">
                                <span>Charges Subtotal</span>
                                <span id="cn_subtotal" class="text-pink-700">0.00</span>
                            </div>
                        </div>

                        <!-- Tax -->
                        <div class="border rounded-lg p-3 bg-gray-50">
                            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tax Details</div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
                                <div>
                                    <label class="block text-xs text-gray-500">GST Rate</label>
                                    <select id="cn_tax_rate" class="form-input text-sm" onchange="VaultCreditNotes._recalc()">
                                        <option value="0">0% (No Tax)</option>
                                        <option value="5">5%</option>
                                        <option value="12">12%</option>
                                        <option value="18" selected>18%</option>
                                        <option value="28">28%</option>
                                    </select>
                                </div>
                                <div class="flex items-center gap-2 pt-5">
                                    <input id="cn_is_inter" type="checkbox" class="rounded border-gray-300" onchange="VaultCreditNotes._recalc()">
                                    <label for="cn_is_inter" class="text-xs text-gray-600">Inter-State (IGST)</label>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-200 text-sm">
                                <div><span class="text-gray-500">Taxable:</span> <span id="cn_taxable" class="font-semibold">0.00</span></div>
                                <div id="cn_sgst_row"><span class="text-gray-500">SGST:</span> <span id="cn_sgst_val" class="font-semibold">0.00</span></div>
                                <div id="cn_cgst_row"><span class="text-gray-500">CGST:</span> <span id="cn_cgst_val" class="font-semibold">0.00</span></div>
                                <div id="cn_igst_row" class="hidden"><span class="text-gray-500">IGST:</span> <span id="cn_igst_val" class="font-semibold">0.00</span></div>
                            </div>
                        </div>

                        <!-- Total -->
                        <div class="bg-pink-50 border border-pink-200 rounded-lg p-3 flex justify-between items-center">
                            <span class="font-bold text-pink-800">CREDIT AMOUNT</span>
                            <span id="cn_grand_total" class="text-xl font-bold text-pink-700">0.00</span>
                        </div>

                        <!-- Narration -->
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
                            <textarea name="narration" required class="form-input text-sm" rows="2" placeholder="Reason for credit note"></textarea>
                        </div>

                        <div class="flex justify-between items-center pt-2 border-t">
                            <div id="cnResponse" class="hidden text-sm"></div>
                            <button type="submit" class="btn btn-sm flex items-center gap-2 ml-auto">
                                <span id="cnBtnText">Create Credit Note</span>
                                <div id="cnSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="cn_computed" data-subtotal="0" data-taxable="0" data-sgst="0" data-cgst="0" data-igst="0" data-taxPercent="18" data-isInter="false" data-grandTotal="0"></div>
                </div>
            </div>`;

        // Populate datalists
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
            // Build b2bMap for code auto-fill
            if (data?.B2B) Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
        });

        _recalc();

        const d = document.querySelector('[name="entry_date"]');
        if (d) d.value = new Date().toISOString().split('T')[0];

        // Submit
        document.getElementById('cnForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const raw = Object.fromEntries(fd);
            const comp = document.getElementById('cn_computed').dataset;
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('cnSpinner');
            const resp = document.getElementById('cnResponse');
            btn.disabled = true; sp.classList.remove('hidden'); resp.className = 'hidden text-sm';

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            const grandTotal = parseFloat(comp.grandTotal);

            const getQ = (id) => parseFloat(document.getElementById('cn_'+id)?.value || 0);
            const chargeData = {
                fright: getQ('fright'), fuel_chg: getQ('fuel'), cod_chg: getQ('cod'),
                topay_chg: getQ('topay'), fov_chg: getQ('fov'), eway_chg: getQ('eway'),
                awb_chg: getQ('awb'), pack_chg: getQ('pack'), dev_chg: getQ('dev'),
            };

            try {
                // TODO: migrate credit note creation to Manager.io
                alert('Coming soon — creating credit notes through Manager.io');
                return;
                const res = await callApi('/api/ledger/journal', {
                    code: raw.code,
                    entry_date: toMs(raw.entry_date),
                    journal_type: 'CREDIT_NOTE',
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
                    branch: raw.branch || '',
                    debit: 0,
                    credit: grandTotal,
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
                resp.textContent = `✅ Credit Note created. Cr ₹${grandTotal.toFixed(2)}`;
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

    async function load() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, client, narration…';
        document.getElementById('vaultSearch').oninput = () => _renderList();
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            _b2bMap.clear();
            if (data.B2B) Object.values(data.B2B).forEach(c => c.CODE && _b2bMap.set(c.CODE, c));
            _renderList();
        }
    }

    return { load, search, openAddPane, _handleDelete, _recalc, _printEntry };
})();

window.VaultCreditNotes = VaultCreditNotes;
