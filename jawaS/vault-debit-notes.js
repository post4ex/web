// ============================================================================
// VAULT-DEBIT-NOTES.JS — Purchase Debit Notes (Carrier & Vendor Claims / Adjustments)
// Tile: debit-notes (📝)
// Architecture:
// 1. Sourcing: Carriers from IDB ('CARRIERS') + COA/Taxes from VaultPage cache.
// 2. Auto-binds Active Branch (no branch selector in form).
// 3. In-Pane Creation: Renders directly in view pane (no modal popups).
// 4. Double-Entry Posting:
//    - Dr Carrier / Vendor Accounts Payable (2000 / 2010) [Reduces liability]
//    - Cr Purchase Returns / Cost Recovery (5090) [Recovers operating cost]
//    - Cr Input Tax Credit (ITC) Reversal (1030) [Reverses claim per GST law]
// 5. Global buttons (.btn, .btn-sm, .btn-blue, .btn-secondary, .btn-danger).
// 6. High-contrast typography (text-gray-950, font-mono).
// ============================================================================

const VaultDebitNotes = (() => {

    let _allDebitNotes = [];
    let _activeDebitNote = null;
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterStatus = "";

    // In-Pane Form State
    let _paneCarriers = [];
    let _paneTaxes = [];

    const _escapeHtml = (str) => {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    function _fmtMoney(n) {
        const num = Number(n) || 0;
        return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function _fmtDate(dStr) {
        if (!dStr) return "—";
        try {
            const d = new Date(dStr);
            if (isNaN(d.getTime())) return dStr;
            return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        } catch (_) {
            return dStr;
        }
    }

    function _getAuthToken() {
        if (typeof getSessionId === 'function') {
            const s = getSessionId();
            if (s) return s;
        }
        try {
            const raw = localStorage.getItem('loginData') || localStorage.getItem('post4ex_session') || localStorage.getItem('session') || '';
            if (raw) {
                const parsed = JSON.parse(raw);
                return parsed.sessionId || parsed.token || parsed.jwt || parsed.access_token || raw;
            }
        } catch { /* fallback */ }
        return localStorage.getItem('token') || '';
    }

    function _getStatusBadge(note) {
        const status = (note.status || "POSTED").toUpperCase();
        if (status === "VOID" || status === "CANCELLED") {
            return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-800 border border-red-200">VOIDED</span>';
        }
        return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-orange-100 text-orange-900 border border-orange-200">DEBIT NOTE</span>';
    }

    // ── Setup Left List Pane ────────────────────────────────────────────────
    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search debit notes by #, carrier, ref...";
            search.oninput = () => _renderList();
        }

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => document.getElementById("dnFilterModal")?.classList.remove("hidden");
        }

        if (!document.getElementById("dnFilterModal")) {
            const modal = document.createElement("div");
            modal.id = "dnFilterModal";
            modal.className = "modal-overlay hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-150">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h2 class="text-base font-bold text-gray-950 flex items-center gap-2">
                            <span>🔍</span> Filter Debit Notes
                        </h2>
                        <button onclick="document.getElementById('dnFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="dnPresetCfy" class="btn btn-sm btn-secondary">Current FY</button>
                            <button type="button" id="dnPresetPfy" class="btn btn-sm btn-secondary">Previous FY</button>
                            <button type="button" id="dnPresetAll" class="btn btn-sm btn-secondary">All Time</button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="dnFilterStart" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 bg-white text-gray-900 font-mono">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="dnFilterEnd" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 bg-white text-gray-900 font-mono">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Status</label>
                        <select id="dnFilterStatusSelect" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 bg-white text-gray-900 font-medium">
                            <option value="">Active (Exclude Voided)</option>
                            <option value="ALL">All Notes (Including Voided)</option>
                            <option value="VOID">Voided Only</option>
                        </select>
                    </div>
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button id="dnFilterResetBtn" type="button" class="btn btn-sm btn-danger">Reset</button>
                        <button id="dnFilterApplyBtn" type="button" class="btn btn-sm btn-blue">Apply Filter</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const now = new Date();
            const year = now.getFullYear();
            const startYear = now.getMonth() < 3 ? year - 1 : year;

            document.getElementById("dnPresetCfy").onclick = () => {
                document.getElementById("dnFilterStart").value = `${startYear}-04-01`;
                document.getElementById("dnFilterEnd").value = `${startYear + 1}-03-31`;
            };
            document.getElementById("dnPresetPfy").onclick = () => {
                document.getElementById("dnFilterStart").value = `${startYear - 1}-04-01`;
                document.getElementById("dnFilterEnd").value = `${startYear}-03-31`;
            };
            document.getElementById("dnPresetAll").onclick = () => {
                document.getElementById("dnFilterStart").value = "";
                document.getElementById("dnFilterEnd").value = "";
            };

            document.getElementById("dnFilterApplyBtn").onclick = () => {
                _filterStart = document.getElementById("dnFilterStart").value;
                _filterEnd = document.getElementById("dnFilterEnd").value;
                _filterStatus = document.getElementById("dnFilterStatusSelect").value;
                modal.classList.add("hidden");
                load(_filterStart, _filterEnd, _filterStatus);
            };

            document.getElementById("dnFilterResetBtn").onclick = () => {
                document.getElementById("dnFilterStart").value = "";
                document.getElementById("dnFilterEnd").value = "";
                document.getElementById("dnFilterStatusSelect").value = "";
                _filterStart = "";
                _filterEnd = "";
                _filterStatus = "";
                modal.classList.add("hidden");
                load();
            };

            modal.onclick = (e) => {
                if (e.target === modal) modal.classList.add("hidden");
            };
        }
    }

    // ── Render Left List ────────────────────────────────────────────────────
    function _renderList() {
        const ul = document.getElementById("vaultList");
        const msgEl = document.getElementById("vaultListMsg");
        if (!ul) return;
        ul.innerHTML = "";

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _allDebitNotes.filter(e => {
            const isVoid = (e.status || "").toUpperCase() === "VOID";
            if (isVoid && _filterStatus !== "VOID" && _filterStatus !== "ALL") {
                return false;
            }

            if (!q) return true;
            const docNo = (e.doc_no || e.number || "").toLowerCase();
            const refNo = (e.ref_no || e.original_bill_no || "").toLowerCase();
            const narration = (e.narration || "").toLowerCase();
            const suppName = (e.supplier?.name || e.vendor?.name || e.metadata?.carrier_name || e.metadata?.supplier_name || "").toLowerCase();
            const suppCode = (e.supplier?.code || e.vendor?.code || e.metadata?.supplier_code || "").toLowerCase();
            const reason = (e.metadata?.reason || "").toLowerCase();
            const dt = (e.doc_date || e.date || "").toLowerCase();
            return docNo.includes(q) || refNo.includes(q) || narration.includes(q) || suppName.includes(q) || suppCode.includes(q) || reason.includes(q) || dt.includes(q);
        });

        if (!filtered.length) {
            if (msgEl) {
                msgEl.textContent = q ? "No matching debit notes found." : "No debit notes recorded.";
                msgEl.classList.remove("hidden");
            }
            return;
        }
        if (msgEl) msgEl.classList.add("hidden");

        ul.innerHTML = filtered.map(e => {
            const docNo = e.doc_no || e.number || "DN-???";
            const supp = e.supplier || e.vendor || {};
            const suppCode = supp.code || e.metadata?.supplier_code || e.ref_no || "Carrier";
            const suppName = supp.name || e.metadata?.carrier_name || e.metadata?.supplier_name || suppCode;
            const dateStr = _fmtDate(e.doc_date || e.date);
            const amount = parseFloat(e.total_amount || e.amount || 0);
            const branch = e.branch_code || "DDN";
            const isSelected = _activeDebitNote && (_activeDebitNote.doc_no === e.doc_no || _activeDebitNote.number === e.number);

            return `
                <li data-id="${_escapeHtml(docNo)}" class="p-3 bg-white rounded-xl border ${isSelected ? 'border-orange-500 bg-orange-50/40 shadow-sm ring-1 ring-orange-500' : 'border-gray-200'} hover:border-orange-400 cursor-pointer transition shadow-sm space-y-1.5">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-gray-950 text-xs font-mono font-bold truncate">${_escapeHtml(docNo)}</strong>
                        ${_getStatusBadge(e)}
                    </div>
                    <div class="flex items-center justify-between text-xs font-semibold text-gray-900 truncate">
                        <span class="truncate">${_escapeHtml(suppName)}</span>
                        <span class="font-bold font-mono text-orange-950">${_fmtMoney(amount)}</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 pt-0.5">
                        <span>📅 ${_escapeHtml(dateStr)}</span>
                        <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200">${_escapeHtml(branch)}</span>
                    </div>
                </li>
            `;
        }).join("");

        const items = Array.from(ul.querySelectorAll("li[data-id]"));
        items.forEach(li => {
            li.addEventListener("click", () => {
                items.forEach(x => {
                    x.classList.remove("border-orange-500", "bg-orange-50/40", "shadow-sm", "ring-1", "ring-orange-500");
                    x.classList.add("border-gray-200");
                });
                li.classList.remove("border-gray-200");
                li.classList.add("border-orange-500", "bg-orange-50/40", "shadow-sm", "ring-1", "ring-orange-500");
                const docNo = li.dataset.id;
                const note = _allDebitNotes.find(item => (item.doc_no || item.number) === docNo);
                if (note) _loadAndRenderDetail(note);
            });
        });
    }

    // ── Render Detail View Pane ─────────────────────────────────────────────
    async function _loadAndRenderDetail(noteSummary) {
        _activeDebitNote = noteSummary;
        VaultPage?.showDetail?.(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const docNo = noteSummary.doc_no || noteSummary.number;
        view.innerHTML = `
            <div class="p-8 text-center text-gray-500 text-xs space-y-2">
                <div class="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p>Loading Debit Note & General Ledger Postings...</p>
            </div>
        `;

        let fullTxn = null;
        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const r = await fetch(`/api/ledger/transactions/${encodeURIComponent(docNo)}`, { headers });
            if (r.ok) {
                fullTxn = await r.json();
            }
        } catch (e) {
            console.warn("[VaultDebitNotes] Error loading full transaction:", e);
        }

        const note = fullTxn || noteSummary;
        const meta = note.metadata || {};
        const supp = noteSummary.supplier || noteSummary.vendor || {};
        const suppCode = meta.supplier_code || noteSummary.ref_no || supp.code || "CARRIER";
        const suppName = supp.name || meta.carrier_name || meta.supplier_name || suppCode;
        const suppGstin = meta.carrier_gstin || meta.supplier_gstin || supp.gstin || "—";
        const origBill = meta.original_bill_no || note.ref_no || "—";
        const reasonText = meta.reason || note.narration || "Purchase Adjustment";
        const totalAmount = parseFloat(note.total_amount || note.amount || 0);
        const taxableAmount = parseFloat(meta.taxable_amount || totalAmount);
        const taxAmount = parseFloat(meta.tax_amount || (totalAmount - taxableAmount));
        const dateStr = _fmtDate(note.doc_date || note.date);
        const branch = note.branch_code || "DDN";
        const isVoid = (note.status || "").toUpperCase() === "VOID";

        const entries = Array.isArray(note.entries) ? note.entries : [];
        let totalDr = 0;
        let totalCr = 0;
        entries.forEach(e => {
            totalDr += Number(e.debit || 0);
            totalCr += Number(e.credit || 0);
        });

        view.innerHTML = `
            <div class="space-y-5 animate-in fade-in duration-150" id="dnPrintContainer">
                <!-- Header Card -->
                <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center flex-wrap gap-2">
                            <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-orange-100 text-orange-900 rounded border border-orange-200">
                                DEBIT NOTE (VENDOR CLAIM)
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">
                                #${_escapeHtml(docNo)}
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
                                BRANCH: ${_escapeHtml(branch)}
                            </span>
                            ${_getStatusBadge(note)}
                        </div>
                        <h1 class="text-xl font-black text-gray-950">${_escapeHtml(suppName)}</h1>
                        <p class="text-xs text-gray-500 font-mono">
                            Ref Bill #: <strong class="text-gray-800">${_escapeHtml(origBill)}</strong> · Date: ${_escapeHtml(dateStr)}
                        </p>
                    </div>

                    <div class="flex items-center gap-4">
                        <div class="text-right border-l md:border-l border-gray-200 pl-4">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Total Deduction Amount</span>
                            <span class="text-2xl font-mono font-extrabold text-orange-950">${_fmtMoney(totalAmount)}</span>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            <button id="dnNewNoteBtn" type="button" class="btn btn-sm btn-blue flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-plus"></i> New Debit Note
                            </button>
                            ${!isVoid ? `
                                <button id="dnVoidBtn" type="button" class="btn btn-sm btn-danger flex items-center justify-center gap-1.5">
                                    <i class="fa-solid fa-ban"></i> Void Note
                                </button>
                            ` : ''}
                            <button id="dnPrintBtn" type="button" class="btn btn-sm btn-secondary flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-print"></i> Print
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Info Cards Grid -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <!-- Vendor Details -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-2">
                        <div class="text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2 flex items-center justify-between">
                            <span><i class="fa-solid fa-truck text-orange-600 mr-1.5"></i> Carrier / Vendor</span>
                            <span class="font-mono text-[10px] text-gray-500">${_escapeHtml(suppCode)}</span>
                        </div>
                        <div class="text-xs text-gray-800 space-y-1 font-medium">
                            <p class="font-bold text-gray-950">${_escapeHtml(suppName)}</p>
                            <div class="flex items-center gap-2">
                                <span class="text-gray-500 text-[10px] font-bold">GSTIN:</span>
                                <span class="font-mono font-bold text-gray-950">${_escapeHtml(suppGstin)}</span>
                            </div>
                            ${supp.city ? `<p class="text-gray-600">${_escapeHtml(supp.city)}${supp.state ? ', ' + _escapeHtml(supp.state) : ''}</p>` : ''}
                        </div>
                    </div>

                    <!-- Tax & ITC Reversal Breakdown -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-2">
                        <div class="text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2 flex items-center justify-between">
                            <span><i class="fa-solid fa-calculator text-emerald-600 mr-1.5"></i> Financial Breakdown</span>
                            <span class="text-[10px] font-mono text-red-700 font-bold">ITC REVERSAL 1030</span>
                        </div>
                        <div class="text-xs text-gray-800 space-y-1 font-medium">
                            <div class="flex justify-between">
                                <span class="text-gray-500">Taxable Recovery:</span>
                                <span class="font-mono font-bold text-gray-950">${_fmtMoney(taxableAmount)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-500">ITC Reversal (GST):</span>
                                <span class="font-mono font-bold text-red-700">${_fmtMoney(taxAmount)}</span>
                            </div>
                            <div class="flex justify-between border-t border-gray-100 pt-1">
                                <span class="text-gray-700 font-bold">Gross Debit to Vendor:</span>
                                <span class="font-mono font-black text-orange-950">${_fmtMoney(totalAmount)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Accounting & Reason -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-2">
                        <div class="text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2 flex items-center justify-between">
                            <span><i class="fa-solid fa-book text-purple-600 mr-1.5"></i> Adjustment Reason</span>
                            <span class="text-[10px] font-mono text-purple-700 font-bold">POSTED</span>
                        </div>
                        <div class="text-xs text-gray-800 space-y-1 font-medium">
                            <div>
                                <span class="text-gray-500 block text-[10px]">Reason for Claim:</span>
                                <p class="font-bold text-gray-950 mt-0.5 leading-snug">${_escapeHtml(reasonText)}</p>
                            </div>
                            <div class="flex justify-between pt-1">
                                <span class="text-gray-500">Vendor AP Code:</span>
                                <span class="font-mono font-bold text-purple-800">#2000 Trade Creditors</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Double-Entry Postings (Audit Trail) -->
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div class="p-4 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
                        <h2 class="text-xs font-extrabold uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                            <i class="fa-solid fa-scale-balanced text-orange-600"></i> Double-Entry General Ledger Postings
                        </h2>
                        <span class="text-[10px] font-mono font-bold ${Math.abs(totalDr - totalCr) < 0.01 ? 'text-emerald-700' : 'text-red-700'}">
                            ${Math.abs(totalDr - totalCr) < 0.01 ? '✓ Balanced (Debits == Credits)' : '⚠ Imbalanced'}
                        </span>
                    </div>

                    <div class="overflow-x-auto p-4">
                        <table class="min-w-full divide-y divide-gray-200 text-xs">
                            <thead class="bg-gray-100 text-gray-950 font-bold uppercase text-[10px] tracking-wider">
                                <tr>
                                    <th class="px-3 py-2.5 text-left">Account Code</th>
                                    <th class="px-3 py-2.5 text-left">Account Description / Narration</th>
                                    <th class="px-3 py-2.5 text-left">Entity</th>
                                    <th class="px-3 py-2.5 text-right text-orange-950">Debit (Dr)</th>
                                    <th class="px-3 py-2.5 text-right text-emerald-900">Credit (Cr)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 bg-white font-medium">
                                ${entries.map(e => `
                                    <tr class="hover:bg-orange-50/30 transition">
                                        <td class="px-3 py-2 whitespace-nowrap font-mono font-bold text-gray-950">
                                            #${_escapeHtml(e.account_code)}
                                        </td>
                                        <td class="px-3 py-2 text-gray-800">
                                            ${_escapeHtml(e.memo || e.narration || e.description || 'Posting line')}
                                        </td>
                                        <td class="px-3 py-2 whitespace-nowrap font-mono text-[11px] text-gray-600">
                                            ${_escapeHtml(e.entity_code || '—')}
                                        </td>
                                        <td class="px-3 py-2 text-right font-mono font-bold ${Number(e.debit) > 0 ? 'text-orange-950' : 'text-gray-400'}">
                                            ${Number(e.debit) > 0 ? _fmtMoney(e.debit) : '—'}
                                        </td>
                                        <td class="px-3 py-2 text-right font-mono font-bold ${Number(e.credit) > 0 ? 'text-emerald-900' : 'text-gray-400'}">
                                            ${Number(e.credit) > 0 ? _fmtMoney(e.credit) : '—'}
                                        </td>
                                    </tr>
                                `).join("")}
                            </tbody>
                            <tfoot class="bg-gray-100 font-bold text-gray-950 border-t-2 border-gray-300">
                                <tr>
                                    <td colspan="3" class="px-3 py-2 text-left uppercase text-[10px] tracking-wider text-gray-700">Total Postings</td>
                                    <td class="px-3 py-2 text-right font-mono text-orange-950">${_fmtMoney(totalDr)}</td>
                                    <td class="px-3 py-2 text-right font-mono text-emerald-900">${_fmtMoney(totalCr)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Wire Action Buttons
        document.getElementById("dnNewNoteBtn").onclick = () => openAddPane();
        document.getElementById("dnPrintBtn").onclick = () => window.print();

        const voidBtn = document.getElementById("dnVoidBtn");
        if (voidBtn) {
            voidBtn.onclick = () => promptVoidDebitNote(docNo);
        }
    }

    // ── Void Debit Note Dialog ──────────────────────────────────────────────
    async function promptVoidDebitNote(docNo) {
        const reason = prompt(`Enter mandatory reason for voiding debit note ${docNo}:`, "Debit note claim cancelled / settlement reversed");
        if (!reason || !reason.trim()) return;

        if (!confirm(`Are you sure you want to void ${docNo}? A balanced reversal journal entry will be automatically posted to restore the Carrier AP balance.`)) return;

        window.setLoading?.(true, "Voiding debit note...", "detail");
        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const r = await fetch(`/api/ledger/transactions/${encodeURIComponent(docNo)}/void?reason=${encodeURIComponent(reason)}`, {
                method: "POST",
                headers
            });

            if (!r.ok) {
                const errData = await r.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to void debit note");
            }

            alert(`Debit note ${docNo} has been successfully voided.`);
            await load(_filterStart, _filterEnd, _filterStatus);
        } catch (err) {
            console.error("[VaultDebitNotes promptVoidDebitNote error]", err);
            alert("Error: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Open In-Pane Debit Note Creation Form ────────────────────────────────
    async function openAddPane(presetCarrierCode = "") {
        VaultPage?.showDetail?.(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        window.setLoading?.(true, "Loading carriers and tax slabs...", "detail");

        try {
            // 1. Fetch Carriers from IndexedDB
            let carriers = [];
            if (typeof getAppData === "function") {
                try {
                    const rawCarriers = await getAppData("CARRIERS");
                    carriers = Object.values(rawCarriers || {}).filter(c => c && (c.COMPANY_CODE || c.CODE));
                } catch (e) {
                    console.warn("[VaultDebitNotes] Failed to get CARRIERS from IDB:", e);
                }
            }

            // Fallback to API if IDB empty
            if (!carriers || !carriers.length) {
                const token = _getAuthToken();
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                try {
                    const r = await fetch('/api/accounting/vendors', { headers });
                    if (r.ok) {
                        const json = await r.json();
                        carriers = Array.isArray(json) ? json : (json?.vendors || json?.data || []);
                    }
                } catch (_) {}
            }

            _paneCarriers = carriers.sort((a, b) => {
                const nameA = a.COMPANY_NAME || a.NAME || a.COMPANY_CODE || a.CODE || "";
                const nameB = b.COMPANY_NAME || b.NAME || b.COMPANY_CODE || b.CODE || "";
                return nameA.localeCompare(nameB);
            });

            // 2. Fetch Taxes
            _paneTaxes = (typeof VaultPage !== 'undefined' && typeof VaultPage.getTaxes === "function" ? VaultPage.getTaxes() : []) || [];
            if (!_paneTaxes.length) {
                const token = _getAuthToken();
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                try {
                    const r = await fetch('/api/accounting/taxes', { headers });
                    if (r.ok) {
                        const json = await r.json();
                        _paneTaxes = json.taxes || json.tax_rates || json || [];
                    }
                } catch (_) {}
            }

            if (!_paneTaxes.length) {
                _paneTaxes = [
                    { id: "GST_18", name: "GST 18% (Standard Rate)", rate: 18.0 },
                    { id: "GST_5", name: "GST 5% (Concessional Freight)", rate: 5.0 },
                    { id: "GST_0", name: "GST 0% (Nil Rated)", rate: 0.0 },
                    { id: "EXEMPT", name: "Exempt Services", rate: 0.0 }
                ];
            }

            // Active branch
            const activeBranchCode = (typeof VaultPage !== 'undefined' && typeof VaultPage.getActiveBranch === "function" ? VaultPage.getActiveBranch() : "") || (typeof getActiveBranch === "function" ? getActiveBranch() : "") || localStorage.getItem("vault_selected_branch") || "DDN";

            const todayStr = new Date().toISOString().split("T")[0];

            view.innerHTML = `
                <div class="space-y-5 animate-in fade-in duration-150">
                    <!-- Form Header -->
                    <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-orange-100 text-orange-900 rounded border border-orange-200">
                                    NEW DEBIT NOTE
                                </span>
                                <span class="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
                                    BRANCH: ${_escapeHtml(activeBranchCode)}
                                </span>
                            </div>
                            <h2 class="text-base font-bold text-gray-950">Issue Debit Note to Carrier / Vendor</h2>
                            <p class="text-xs text-gray-500">Debits Vendor AP (#2000), Credits Purchase Returns (#5090) & ITC Reversal (#1030).</p>
                        </div>
                        <button type="button" onclick="VaultDebitNotes.load()" class="btn btn-sm btn-secondary">
                            ✕ Cancel
                        </button>
                    </div>

                    <!-- Header Inputs -->
                    <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <!-- Carrier Dropdown -->
                            <div>
                                <label class="block text-xs font-bold text-gray-950 mb-1">
                                    Carrier / Vendor <span class="text-red-600">*</span>
                                </label>
                                <select id="newDnCarrierSelect" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 bg-white text-gray-950 font-medium">
                                    <option value="">— Select Carrier / Vendor (${_paneCarriers.length} available) —</option>
                                    ${_paneCarriers.map(c => {
                                        const code = c.COMPANY_CODE || c.CODE || "";
                                        const name = c.COMPANY_NAME || c.NAME || code;
                                        const city = c.COMPANY_CITY || c.CITY || "";
                                        const gstin = c.GSTIN || "";
                                        const isSel = presetCarrierCode && presetCarrierCode.toUpperCase() === code.toUpperCase();
                                        return `<option value="${_escapeHtml(code)}" ${isSel ? 'selected' : ''}>${_escapeHtml(name)} (${_escapeHtml(code)})${city ? ` · ${_escapeHtml(city)}` : ''}${gstin ? ` · GST: ${_escapeHtml(gstin)}` : ''}</option>`;
                                    }).join("")}
                                </select>
                                <div id="newDnCarrierInfo" class="text-[11px] text-gray-500 mt-1 font-mono"></div>
                            </div>

                            <!-- Original Vendor Bill No -->
                            <div>
                                <label class="block text-xs font-bold text-gray-950 mb-1">
                                    Original Bill / Invoice # <span class="text-gray-400 font-normal">(Optional)</span>
                                </label>
                                <input type="text" id="newDnOriginalBill" placeholder="e.g. AIR-OCT-9901 or BIL-1002-26-27" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 bg-white text-gray-950 font-mono">
                            </div>

                            <!-- Debit Note Date -->
                            <div>
                                <label class="block text-xs font-bold text-gray-950 mb-1">
                                    Debit Note Date <span class="text-red-600">*</span>
                                </label>
                                <input type="date" id="newDnDate" value="${todayStr}" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 bg-white text-gray-950 font-mono">
                            </div>
                        </div>

                        <!-- Reason / Adjustment Description -->
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="text-xs font-bold text-gray-950">
                                    Reason for Debit Note / Claim <span class="text-red-600">*</span>
                                </label>
                                <span class="text-[11px] text-gray-400">Select standard reason chip or write description</span>
                            </div>
                            <input type="text" id="newDnReason" placeholder="e.g. Cargo damage penalty, SLA breach deduction, freight rate difference" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 bg-white text-gray-950">
                            
                            <!-- Quick Reason Chips -->
                            <div class="flex flex-wrap gap-1.5 mt-2">
                                <button type="button" class="dn-reason-chip px-2 py-1 text-[11px] rounded bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-900 border border-gray-200 transition">Cargo Damage Claim</button>
                                <button type="button" class="dn-reason-chip px-2 py-1 text-[11px] rounded bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-900 border border-gray-200 transition">SLA Delivery Delay Penalty</button>
                                <button type="button" class="dn-reason-chip px-2 py-1 text-[11px] rounded bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-900 border border-gray-200 transition">Freight Rate Discrepancy</button>
                                <button type="button" class="dn-reason-chip px-2 py-1 text-[11px] rounded bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-900 border border-gray-200 transition">Weight / Volumetric Difference</button>
                                <button type="button" class="dn-reason-chip px-2 py-1 text-[11px] rounded bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-900 border border-gray-200 transition">Purchase Return / Freight Rebate</button>
                            </div>
                        </div>
                    </div>

                    <!-- Financial & Tax Computation Section -->
                    <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <h3 class="text-xs font-extrabold uppercase tracking-wider text-gray-950 flex items-center gap-1.5 border-b border-gray-100 pb-2">
                            <i class="fa-solid fa-calculator text-orange-600"></i> Financial Valuation & GST Reversal
                        </h3>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <!-- Taxable Amount -->
                            <div>
                                <label class="block text-xs font-bold text-gray-950 mb-1">
                                    Taxable Cost Recovery Amount (₹) <span class="text-red-600">*</span>
                                </label>
                                <div class="relative">
                                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 font-bold">₹</span>
                                    <input type="number" id="newDnTaxableAmount" step="0.01" min="0" placeholder="0.00" class="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 bg-white text-gray-950 font-mono font-bold">
                                </div>
                                <span class="text-[11px] text-gray-500 mt-1 block">Credited to #5090 Purchase Returns / Cost Recovery</span>
                            </div>

                            <!-- GST Tax Slab -->
                            <div>
                                <label class="block text-xs font-bold text-gray-950 mb-1">
                                    GST Tax Slab (ITC Reversal Rate) <span class="text-red-600">*</span>
                                </label>
                                <select id="newDnTaxSelect" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-orange-500 bg-white text-gray-950 font-medium">
                                    ${_paneTaxes.map(t => {
                                        const tid = t.id || t.code || `GST_${t.rate}`;
                                        const rate = parseFloat(t.rate ?? (tid.includes("18") ? 18 : (tid.includes("5") ? 5 : 0)));
                                        const isSel = tid === "GST_18" || rate === 18;
                                        return `<option value="${_escapeHtml(tid)}" data-rate="${rate}" ${isSel ? 'selected' : ''}>${_escapeHtml(t.name || tid)} (${rate}%)</option>`;
                                    }).join("")}
                                </select>
                                <span class="text-[11px] text-gray-500 mt-1 block">Credited to #1030 Input Tax Credit (ITC) Reversal</span>
                            </div>
                        </div>

                        <!-- Real-time Live Calculation Box -->
                        <div class="mt-4 p-4 bg-orange-50/50 rounded-xl border border-orange-200 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="p-3 bg-white rounded-lg border border-orange-100">
                                <span class="block text-[10px] font-bold uppercase text-gray-500">Taxable Recovery (Cr 5090)</span>
                                <span id="newDnCalcTaxable" class="text-sm font-mono font-bold text-gray-950">₹0.00</span>
                            </div>
                            <div class="p-3 bg-white rounded-lg border border-orange-100">
                                <span class="block text-[10px] font-bold uppercase text-red-700">ITC Reversal (Cr 1030)</span>
                                <span id="newDnCalcGst" class="text-sm font-mono font-bold text-red-700">₹0.00</span>
                            </div>
                            <div class="p-3 bg-orange-100/70 rounded-lg border border-orange-300">
                                <span class="block text-[10px] font-bold uppercase text-orange-950">Total Vendor Deduction (Dr 2000)</span>
                                <span id="newDnCalcTotal" class="text-base font-mono font-black text-orange-950">₹0.00</span>
                            </div>
                        </div>
                    </div>

                    <!-- Footer Action Buttons -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm flex items-center justify-end gap-3">
                        <button type="button" onclick="VaultDebitNotes.load()" class="btn btn-sm btn-secondary">
                            Cancel
                        </button>
                        <button type="button" id="newDnSubmitBtn" class="btn btn-sm btn-blue flex items-center gap-1.5">
                            <i class="fa-solid fa-check"></i> Post Debit Note
                        </button>
                    </div>
                </div>
            `;

            // Wire Carrier Change to auto-fill GST & info
            const carrierSelect = document.getElementById("newDnCarrierSelect");
            const carrierInfo = document.getElementById("newDnCarrierInfo");
            const updateCarrierDisplay = () => {
                const code = carrierSelect.value;
                const c = _paneCarriers.find(x => (x.COMPANY_CODE || x.CODE) === code);
                if (c && carrierInfo) {
                    const gstin = c.GSTIN || "Unregistered";
                    const pan = c.PAN || "N/A";
                    carrierInfo.textContent = `GSTIN: ${gstin} · PAN: ${pan}`;
                } else if (carrierInfo) {
                    carrierInfo.textContent = "";
                }
            };
            carrierSelect.onchange = updateCarrierDisplay;
            updateCarrierDisplay();

            // Wire Reason Chips
            const reasonInput = document.getElementById("newDnReason");
            document.querySelectorAll(".dn-reason-chip").forEach(btn => {
                btn.onclick = () => {
                    reasonInput.value = btn.textContent.trim();
                    reasonInput.focus();
                };
            });

            // Wire live computation
            const taxableInput = document.getElementById("newDnTaxableAmount");
            const taxSelect = document.getElementById("newDnTaxSelect");
            const calcTaxableEl = document.getElementById("newDnCalcTaxable");
            const calcGstEl = document.getElementById("newDnCalcGst");
            const calcTotalEl = document.getElementById("newDnCalcTotal");

            const recalculate = () => {
                const taxable = parseFloat(taxableInput.value) || 0;
                const opt = taxSelect.options[taxSelect.selectedIndex];
                const rate = opt ? parseFloat(opt.getAttribute("data-rate") || 0) : 0;
                const tax = Math.round((taxable * rate / 100) * 100) / 100;
                const total = Math.round((taxable + tax) * 100) / 100;

                calcTaxableEl.textContent = _fmtMoney(taxable);
                calcGstEl.textContent = _fmtMoney(tax);
                calcTotalEl.textContent = _fmtMoney(total);
            };

            taxableInput.oninput = recalculate;
            taxSelect.onchange = recalculate;
            recalculate();

            // Wire Submit
            document.getElementById("newDnSubmitBtn").onclick = async () => {
                const carrierCode = carrierSelect.value.trim();
                if (!carrierCode) {
                    alert("Please select a Carrier / Vendor.");
                    carrierSelect.focus();
                    return;
                }

                const docDate = document.getElementById("newDnDate").value;
                if (!docDate) {
                    alert("Please select a valid date.");
                    return;
                }

                const reason = reasonInput.value.trim();
                if (!reason) {
                    alert("Please specify the reason for this debit note.");
                    reasonInput.focus();
                    return;
                }

                const taxableVal = parseFloat(taxableInput.value);
                if (isNaN(taxableVal) || taxableVal <= 0) {
                    alert("Please enter a valid positive taxable recovery amount.");
                    taxableInput.focus();
                    return;
                }

                const origBillNo = document.getElementById("newDnOriginalBill").value.trim();
                const taxRateId = taxSelect.value;
                const opt = taxSelect.options[taxSelect.selectedIndex];
                const taxRate = opt ? parseFloat(opt.getAttribute("data-rate") || 0) : 0;
                const taxAmount = Math.round((taxableVal * taxRate / 100) * 100) / 100;
                const grandTotal = Math.round((taxableVal + taxAmount) * 100) / 100;

                const carrierObj = _paneCarriers.find(x => (x.COMPANY_CODE || x.CODE) === carrierCode);
                const carrierName = carrierObj ? (carrierObj.COMPANY_NAME || carrierObj.NAME || carrierCode) : carrierCode;
                const carrierGstin = carrierObj ? (carrierObj.GSTIN || "") : "";

                const payload = {
                    supplier_code: carrierCode,
                    supplier_type: "CARRIER",
                    original_bill_no: origBillNo || null,
                    taxable_amount: taxableVal,
                    tax_rate_id: taxRateId,
                    doc_date: docDate,
                    branch_code: activeBranchCode,
                    reason: reason,
                    metadata: {
                        carrier_name: carrierName,
                        supplier_name: carrierName,
                        carrier_gstin: carrierGstin,
                        supplier_gstin: carrierGstin,
                        original_bill_no: origBillNo || null,
                        tax_amount: taxAmount,
                        grand_total: grandTotal
                    }
                };

                window.setLoading?.(true, "Posting debit note to ledger...", "detail");
                try {
                    const token = _getAuthToken();
                    const headers = {
                        "Content-Type": "application/json",
                        ...(token ? { "Authorization": `Bearer ${token}` } : {})
                    };

                    const r = await fetch('/api/accounting/debit-notes', {
                        method: "POST",
                        headers,
                        body: JSON.stringify(payload)
                    });

                    if (!r.ok) {
                        const errData = await r.json().catch(() => ({}));
                        throw new Error(errData.detail || "Failed to post debit note");
                    }

                    const res = await r.json();
                    const createdDocNo = res.doc_no || res.id || "DN";
                    alert(`Debit note ${createdDocNo} posted successfully!`);
                    await load();
                } catch (err) {
                    console.error("[VaultDebitNotes openAddPane submit error]", err);
                    alert("Error posting debit note: " + (err.message || err));
                } finally {
                    window.setLoading?.(false);
                }
            };

        } catch (err) {
            console.error("[VaultDebitNotes openAddPane error]", err);
            alert("Failed to load debit note form: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Main Load Function ──────────────────────────────────────────────────
    async function load(startDate = null, endDate = null, status = null) {
        _injectListPane();
        window.setLoading?.(true, "Loading debit notes...", "list");

        try {
            let url = "/api/accounting/debit-notes";
            const queryParts = [];
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);
            if (status) queryParts.push(`status=${encodeURIComponent(status)}`);
            if (queryParts.length) url += `?${queryParts.join("&")}`;

            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const r = await fetch(url, { headers });
            if (!r.ok) {
                throw new Error(`HTTP ${r.status}`);
            }
            const res = await r.json();
            _allDebitNotes = Array.isArray(res) ? res : (res?.debit_notes || res?.data || []);
            _renderList();

            // Do not auto-select on load — show empty placeholder until user selects
            _selectedDebitNote = null;
            VaultPage?.showDetail?.(false);
        } catch (err) {
            console.error("[VaultDebitNotes load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) {
                msg.textContent = "Failed to load debit notes: " + (err.message || err);
                msg.classList.remove("hidden");
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    return {
        load,
        search: _renderList,
        openAddPane,
        openNewDebitNotePane: openAddPane
    };
})();

window.VaultDebitNotes = VaultDebitNotes;
