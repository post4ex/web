// ============================================================================
// VAULT-PURCHASES.JS — Purchase Bills (Carrier / Vendor Freight Bills)
// Tile: purchase-bills (📦)
// Architecture:
// 1. Sourcing: Carriers from IDB ('CARRIERS') + COA/Taxes from VaultPage cache.
// 2. Auto-binds Active Branch (no branch selector in form).
// 3. In-Pane Creation: Renders directly in view pane (no modal popups).
// 4. Double-Entry Posting:
//    - Dr Direct Freight/Operating Cost (5000)
//    - Dr Input Tax Credit ITC (1030)
//    - Cr TDS Payable Section 194C (2040) [optional]
//    - Cr Carrier Accounts Payable (2000 / 2010)
// 5. Global buttons (.btn, .btn-sm, .btn-blue, .btn-secondary, .btn-danger).
// ============================================================================

const VaultPurchases = (() => {

    let _allBills = [];
    let _activeBill = null;
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterStatus = "";

    // In-Pane Form State
    let _paneCarriers = [];
    let _paneCOA = [];
    let _paneTaxes = [];
    let _paneItems = [];

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

    function _getStatusBadge(bill) {
        const status = (bill.status || "POSTED").toUpperCase();
        if (status === "VOID") {
            return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-800 border border-red-200">VOIDED</span>';
        }
        if (status === "PAID") {
            return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">PAID</span>';
        }
        if (status === "PARTIAL") {
            return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">PARTIAL</span>';
        }
        return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">POSTED</span>';
    }

    // ── Setup Left List Pane ────────────────────────────────────────────────
    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search by bill #, carrier, ref, narration...";
            search.oninput = () => _renderList();
        }

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => document.getElementById("pbFilterModal")?.classList.remove("hidden");
        }

        if (!document.getElementById("pbFilterModal")) {
            const modal = document.createElement("div");
            modal.id = "pbFilterModal";
            modal.className = "modal-overlay hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-150">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h2 class="text-base font-bold text-gray-950 flex items-center gap-2">
                            <span>🔍</span> Filter Purchase Bills
                        </h2>
                        <button onclick="document.getElementById('pbFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="pbPresetCfy" class="btn btn-sm btn-secondary">Current FY</button>
                            <button type="button" id="pbPresetPfy" class="btn btn-sm btn-secondary">Previous FY</button>
                            <button type="button" id="pbPresetAll" class="btn btn-sm btn-secondary">All Time</button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="pbFilterStart" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 font-mono">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="pbFilterEnd" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 font-mono">
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button id="pbFilterResetBtn" type="button" class="btn btn-sm btn-danger">Reset</button>
                        <button id="pbFilterApplyBtn" type="button" class="btn btn-sm btn-blue">Apply Filter</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const now = new Date();
            const year = now.getFullYear();
            const startYear = now.getMonth() < 3 ? year - 1 : year;

            document.getElementById("pbPresetCfy").onclick = () => {
                document.getElementById("pbFilterStart").value = `${startYear}-04-01`;
                document.getElementById("pbFilterEnd").value = `${startYear + 1}-03-31`;
            };
            document.getElementById("pbPresetPfy").onclick = () => {
                document.getElementById("pbFilterStart").value = `${startYear - 1}-04-01`;
                document.getElementById("pbFilterEnd").value = `${startYear}-03-31`;
            };
            document.getElementById("pbPresetAll").onclick = () => {
                document.getElementById("pbFilterStart").value = "";
                document.getElementById("pbFilterEnd").value = "";
            };

            document.getElementById("pbFilterApplyBtn").onclick = () => {
                _filterStart = document.getElementById("pbFilterStart").value;
                _filterEnd = document.getElementById("pbFilterEnd").value;
                modal.classList.add("hidden");
                load(_filterStart, _filterEnd);
            };

            document.getElementById("pbFilterResetBtn").onclick = () => {
                document.getElementById("pbFilterStart").value = "";
                document.getElementById("pbFilterEnd").value = "";
                _filterStart = "";
                _filterEnd = "";
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

        const filtered = _allBills.filter(e => {
            const isVoid = (e.status || "").toUpperCase() === "VOID";
            if (isVoid && (_filterStatus || "").toUpperCase() !== "VOID") {
                return false;
            }

            if (!q) return true;
            const docNo = (e.doc_no || e.bill_number || "").toLowerCase();
            const refNo = (e.ref_no || e.vendor_bill_no || "").toLowerCase();
            const narration = (e.narration || "").toLowerCase();
            const suppName = (e.supplier?.name || e.metadata?.supplier_name || "").toLowerCase();
            const suppCode = (e.supplier?.code || e.metadata?.supplier_code || "").toLowerCase();
            const dt = (e.doc_date || e.date || "").toLowerCase();
            return docNo.includes(q) || refNo.includes(q) || narration.includes(q) || suppName.includes(q) || suppCode.includes(q) || dt.includes(q);
        });

        if (!filtered.length) {
            if (msgEl) {
                msgEl.textContent = q ? "No matching purchase bills found." : "No purchase bills recorded.";
                msgEl.classList.remove("hidden");
            }
            return;
        }
        if (msgEl) msgEl.classList.add("hidden");

        ul.innerHTML = filtered.map(e => {
            const docNo = e.doc_no || e.bill_number || "BIL-???";
            const supp = e.supplier || {};
            const suppCode = supp.code || e.metadata?.supplier_code || e.ref_no || "Carrier";
            const suppName = supp.name || e.metadata?.supplier_name || suppCode;
            const dateStr = _fmtDate(e.doc_date || e.date);
            const amount = parseFloat(e.total_amount || e.amount || 0);
            const branch = e.branch_code || "MAIN";
            const isSelected = _activeBill && _activeBill.doc_no === e.doc_no;

            return `
                <li data-id="${_escapeHtml(docNo)}" class="p-3 bg-white rounded-xl border ${isSelected ? 'border-blue-600 bg-blue-50/40 shadow-sm ring-1 ring-blue-500' : 'border-gray-200'} hover:border-blue-400 cursor-pointer transition shadow-sm space-y-1.5">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-gray-950 text-xs font-mono font-bold truncate">${_escapeHtml(docNo)}</strong>
                        ${_getStatusBadge(e)}
                    </div>
                    <div class="flex items-center justify-between text-xs font-semibold text-gray-900 truncate">
                        <span class="truncate">${_escapeHtml(suppName)}</span>
                        <span class="font-bold font-mono text-gray-950">${_fmtMoney(amount)}</span>
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
                    x.classList.remove("border-blue-600", "bg-blue-50/40", "shadow-sm", "ring-1", "ring-blue-500");
                    x.classList.add("border-gray-200");
                });
                li.classList.remove("border-gray-200");
                li.classList.add("border-blue-600", "bg-blue-50/40", "shadow-sm", "ring-1", "ring-blue-500");
                const docNo = li.dataset.id;
                const bill = _allBills.find(item => (item.doc_no || item.bill_number) === docNo);
                if (bill) _loadAndRenderDetail(bill);
            });
        });
    }

    // ── Render Detail View Pane ─────────────────────────────────────────────
    async function _loadAndRenderDetail(billSummary) {
        _activeBill = billSummary;
        VaultPage?.showDetail?.(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const docNo = billSummary.doc_no || billSummary.bill_number;
        view.innerHTML = `
            <div class="p-8 text-center text-gray-500 text-xs space-y-2">
                <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p>Loading Purchase Bill & Journal Entries...</p>
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
            console.warn("[VaultPurchases] Error loading full transaction:", e);
        }

        const bill = fullTxn || billSummary;
        const meta = bill.metadata || {};
        const supp = billSummary.supplier || {};
        const suppCode = meta.supplier_code || billSummary.ref_no || supp.code || "CARRIER";
        const suppName = supp.name || meta.supplier_name || suppCode;
        const suppGstin = meta.supplier_gstin || supp.gstin || "—";
        const vendorInvoice = meta.vendor_bill_no || bill.ref_no || "—";
        const totalAmount = parseFloat(bill.total_amount || bill.amount || 0);
        const taxableAmount = parseFloat(meta.taxable_amount || totalAmount);
        const gstAmount = parseFloat(meta.gst_amount || 0);
        const tdsAmount = parseFloat(meta.tds_amount || 0);
        const dateStr = _fmtDate(bill.doc_date || bill.date);
        const branch = bill.branch_code || "MAIN";
        const isVoid = (bill.status || "").toUpperCase() === "VOID";

        const entries = Array.isArray(bill.entries) ? bill.entries : [];
        let totalDr = 0;
        let totalCr = 0;
        entries.forEach(e => {
            totalDr += Number(e.debit || 0);
            totalCr += Number(e.credit || 0);
        });

        view.innerHTML = `
            <div class="space-y-5 animate-in fade-in duration-150" id="pbPrintContainer">
                <!-- Header Card -->
                <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center flex-wrap gap-2">
                            <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-orange-100 text-orange-800 rounded border border-orange-200">
                                PURCHASE BILL (FREIGHT AP)
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">
                                #${_escapeHtml(docNo)}
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
                                BRANCH: ${_escapeHtml(branch)}
                            </span>
                            ${_getStatusBadge(bill)}
                        </div>
                        <h1 class="text-xl font-black text-gray-950">${_escapeHtml(suppName)}</h1>
                        <p class="text-xs text-gray-500 font-mono">
                            Vendor Inv #: <strong class="text-gray-800">${_escapeHtml(vendorInvoice)}</strong> · Date: ${_escapeHtml(dateStr)}
                        </p>
                    </div>

                    <div class="flex items-center gap-4">
                        <div class="text-right border-l md:border-l border-gray-200 pl-4">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Net Payable Amount</span>
                            <span class="text-2xl font-mono font-extrabold text-gray-950">${_fmtMoney(totalAmount)}</span>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            <button id="pbNewBillBtn" type="button" class="btn btn-sm btn-blue flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-plus"></i> New Bill
                            </button>
                            ${!isVoid ? `
                                <button id="pbVoidBtn" type="button" class="btn btn-sm btn-danger flex items-center justify-center gap-1.5">
                                    <i class="fa-solid fa-ban"></i> Void Bill
                                </button>
                            ` : ''}
                            <button id="pbPrintBtn" type="button" class="btn btn-sm btn-secondary flex items-center justify-center gap-1.5">
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
                            <span><i class="fa-solid fa-truck text-blue-600 mr-1.5"></i> Carrier / Vendor</span>
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

                    <!-- Tax & ITC Breakdown -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-2">
                        <div class="text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2 flex items-center justify-between">
                            <span><i class="fa-solid fa-calculator text-emerald-600 mr-1.5"></i> Tax & ITC Breakdown</span>
                            <span class="text-[10px] font-mono text-emerald-700 font-bold">ITC INPUT 1030</span>
                        </div>
                        <div class="text-xs text-gray-800 space-y-1 font-medium">
                            <div class="flex justify-between">
                                <span class="text-gray-500">Taxable Freight / Cost:</span>
                                <span class="font-mono font-bold text-gray-950">${_fmtMoney(taxableAmount)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-500">Input GST (ITC):</span>
                                <span class="font-mono font-bold text-emerald-700">${_fmtMoney(gstAmount)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-500">TDS 194C Deducted:</span>
                                <span class="font-mono font-bold text-amber-700">${tdsAmount > 0 ? ('- ' + _fmtMoney(tdsAmount)) : 'Nil'}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Accounting & Terms -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-2">
                        <div class="text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2 flex items-center justify-between">
                            <span><i class="fa-solid fa-book text-purple-600 mr-1.5"></i> Ledger Accounts</span>
                            <span class="text-[10px] font-mono text-purple-700 font-bold">AP 2000 / 2010</span>
                        </div>
                        <div class="text-xs text-gray-800 space-y-1 font-medium">
                            <div class="flex justify-between">
                                <span class="text-gray-500">Expense Account:</span>
                                <span class="font-mono font-bold text-gray-950">#5000 Freight Expense</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-500">Accounts Payable:</span>
                                <span class="font-mono font-bold text-purple-800">#2000 Trade Creditors</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-500">Narration:</span>
                                <span class="text-gray-700 truncate max-w-[150px]" title="${_escapeHtml(bill.narration)}">${_escapeHtml(bill.narration || 'Freight bill')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Double-Entry Postings (Audit Trail) -->
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div class="p-4 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
                        <h2 class="text-xs font-extrabold uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                            <i class="fa-solid fa-scale-balanced text-blue-600"></i> Double-Entry General Ledger Postings
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
                                    <th class="px-3 py-2.5 text-right text-blue-900">Debit (Dr)</th>
                                    <th class="px-3 py-2.5 text-right text-emerald-900">Credit (Cr)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 bg-white font-medium">
                                ${entries.map(e => `
                                    <tr class="hover:bg-blue-50/30 transition">
                                        <td class="px-3 py-2 whitespace-nowrap font-mono font-bold text-gray-950">
                                            #${_escapeHtml(e.account_code)}
                                        </td>
                                        <td class="px-3 py-2 text-gray-800">
                                            ${_escapeHtml(e.memo || e.narration || e.description || 'Posting line')}
                                        </td>
                                        <td class="px-3 py-2 whitespace-nowrap font-mono text-[11px] text-gray-600">
                                            ${_escapeHtml(e.entity_code || '—')}
                                        </td>
                                        <td class="px-3 py-2 text-right font-mono font-bold ${Number(e.debit) > 0 ? 'text-blue-900' : 'text-gray-400'}">
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
                                    <td class="px-3 py-2 text-right font-mono text-blue-900">${_fmtMoney(totalDr)}</td>
                                    <td class="px-3 py-2 text-right font-mono text-emerald-900">${_fmtMoney(totalCr)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Wire Action Buttons
        document.getElementById("pbNewBillBtn").onclick = () => openAddPane();
        document.getElementById("pbPrintBtn").onclick = () => window.print();

        const voidBtn = document.getElementById("pbVoidBtn");
        if (voidBtn) {
            voidBtn.onclick = () => promptVoidBill(docNo);
        }
    }

    // ── Void Bill Dialog ────────────────────────────────────────────────────
    async function promptVoidBill(docNo) {
        const reason = prompt(`Enter mandatory reason for voiding purchase bill ${docNo}:`, "Incorrect vendor invoice details / freight revised");
        if (!reason || !reason.trim()) return;

        if (!confirm(`Are you sure you want to void ${docNo}? A balanced reversal journal entry will be automatically posted.`)) return;

        window.setLoading?.(true, "Voiding purchase bill...", "detail");
        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const r = await fetch(`/api/ledger/transactions/${encodeURIComponent(docNo)}/void?reason=${encodeURIComponent(reason)}`, {
                method: "POST",
                headers
            });

            if (!r.ok) {
                const errData = await r.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to void purchase bill");
            }

            alert(`Purchase bill ${docNo} has been successfully voided.`);
            await load(_filterStart, _filterEnd);
        } catch (err) {
            console.error("[VaultPurchases promptVoidBill error]", err);
            alert("Error: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Open In-Pane Bill Creation Form ─────────────────────────────────────
    async function openAddPane(presetCarrierCode = "") {
        VaultPage?.showDetail?.(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        window.setLoading?.(true, "Loading carriers and accounts...", "detail");

        try {
            // 1. Fetch Carriers from IndexedDB
            let carriers = [];
            if (typeof getAppData === "function") {
                try {
                    const rawCarriers = await getAppData("CARRIERS");
                    carriers = Object.values(rawCarriers || {}).filter(c => c && (c.COMPANY_CODE || c.CODE));
                } catch (e) {
                    console.warn("[VaultPurchases] Failed to get CARRIERS from IDB:", e);
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

            // 2. Fetch Chart of Accounts & Taxes
            _paneCOA = (typeof VaultPage !== 'undefined' && typeof VaultPage.getCOA === "function" ? VaultPage.getCOA() : []) || [];
            _paneTaxes = (typeof VaultPage !== 'undefined' && typeof VaultPage.getTaxes === "function" ? VaultPage.getTaxes() : []) || [];

            // If empty, fetch from API
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            if (!_paneCOA.length) {
                try {
                    const r = await fetch('/api/ledger/accounts', { headers });
                    if (r.ok) {
                        const json = await r.json();
                        _paneCOA = json.accounts || json || [];
                    }
                } catch (_) {}
            }
            if (!_paneTaxes.length) {
                try {
                    const r = await fetch('/api/accounting/taxes', { headers });
                    if (r.ok) {
                        const json = await r.json();
                        _paneTaxes = json.taxes || json.tax_rates || json || [];
                    }
                } catch (_) {}
            }

            // Filter expense accounts (5000-5999 or category=EXPENSE)
            const expenseAccounts = _paneCOA.filter(a => {
                const cat = (a.category || "").toUpperCase();
                const code = String(a.code || "");
                return cat === "EXPENSE" || code.startsWith("5");
            });

            // Active branch
            const activeBranchCode = (typeof VaultPage !== 'undefined' && typeof VaultPage.getActiveBranch === "function" ? VaultPage.getActiveBranch() : "") || (typeof getActiveBranch === "function" ? getActiveBranch() : "") || localStorage.getItem("vault_selected_branch") || "DDN";

            const todayStr = new Date().toISOString().split("T")[0];

            // Initial line item
            _paneItems = [
                {
                    expense_account_code: "5000",
                    description: "Linehaul / Transport Freight Charges",
                    sac_code: "996511",
                    amount: 5000.0,
                    tax_rate_id: "GST_18"
                }
            ];

            view.innerHTML = `
                <div class="space-y-5 animate-in fade-in duration-150">
                    <!-- Form Header -->
                    <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-orange-100 text-orange-800 rounded border border-orange-200">
                                    NEW VENDOR BILL
                                </span>
                                <span class="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
                                    BRANCH: ${_escapeHtml(activeBranchCode)}
                                </span>
                            </div>
                            <h2 class="text-base font-bold text-gray-950">Record Carrier / Vendor Purchase Bill</h2>
                            <p class="text-xs text-gray-500">Posts double-entry Dr Expense (5000) & Dr ITC (1030), Cr Vendor AP (2000).</p>
                        </div>
                        <button type="button" onclick="VaultPurchases.load()" class="btn btn-sm btn-secondary">
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
                                <select id="newPbCarrierSelect" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white text-gray-950 font-medium">
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
                                <div id="newPbCarrierInfo" class="text-[11px] text-gray-500 mt-1 font-mono"></div>
                            </div>

                            <!-- Vendor Original Invoice No -->
                            <div>
                                <label class="block text-xs font-bold text-gray-950 mb-1">
                                    Vendor Bill / Invoice # <span class="text-red-600">*</span>
                                </label>
                                <input type="text" id="newPbBillNo" placeholder="e.g. DEL-OCT-2026-9901" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white text-gray-950 font-mono font-bold">
                            </div>

                            <!-- Bill Date -->
                            <div>
                                <label class="block text-xs font-bold text-gray-950 mb-1">
                                    Bill Date <span class="text-red-600">*</span>
                                </label>
                                <input type="date" id="newPbBillDate" value="${todayStr}" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white text-gray-950 font-mono">
                            </div>
                        </div>

                        <!-- General Narration -->
                        <div>
                            <label class="block text-xs font-bold text-gray-950 mb-1">
                                Narration / General Description
                            </label>
                            <input type="text" id="newPbNarration" placeholder="Line-haul carrier freight for September 2026 billing cycle" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white text-gray-950">
                        </div>
                    </div>

                    <!-- Line Items Section -->
                    <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div class="flex items-center justify-between border-b border-gray-100 pb-2">
                            <h3 class="text-xs font-extrabold uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                                <i class="fa-solid fa-list-check text-blue-600"></i> Expense Line Items & Taxes
                            </h3>
                            <button type="button" id="newPbAddLineBtn" class="btn btn-sm btn-secondary flex items-center gap-1">
                                <i class="fa-solid fa-plus text-blue-600"></i> Add Line
                            </button>
                        </div>

                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200 text-xs" id="newPbItemsTable">
                                <thead class="bg-gray-100 text-gray-950 font-bold uppercase text-[10px] tracking-wider">
                                    <tr>
                                        <th class="px-2 py-2 text-left" style="width: 25%;">Expense Account</th>
                                        <th class="px-2 py-2 text-left" style="width: 25%;">Description</th>
                                        <th class="px-2 py-2 text-left" style="width: 12%;">SAC / HSN</th>
                                        <th class="px-2 py-2 text-right" style="width: 14%;">Taxable Amount (₹)</th>
                                        <th class="px-2 py-2 text-left" style="width: 14%;">GST Slab</th>
                                        <th class="px-2 py-2 text-right" style="width: 10%;">Line Total (₹)</th>
                                        <th class="px-2 py-2 text-center" style="width: 40px;"></th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 bg-white" id="newPbItemsTbody">
                                    <!-- Rendered dynamically -->
                                </tbody>
                            </table>
                        </div>

                        <!-- TDS Section 194C Option -->
                        <div class="mt-4 p-3 bg-amber-50/60 rounded-lg border border-amber-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div class="flex items-center gap-2">
                                <input type="checkbox" id="newPbApplyTds" class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
                                <label for="newPbApplyTds" class="text-xs font-bold text-gray-900 cursor-pointer">
                                    Apply TDS Deduction under Section 194C (Transport Contractor)
                                </label>
                            </div>
                            <div id="newPbTdsRateContainer" class="hidden flex items-center gap-2">
                                <label class="text-xs font-bold text-gray-700">TDS Rate:</label>
                                <select id="newPbTdsRate" class="px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-900 font-bold">
                                    <option value="1.0">1.0% — Individual / HUF</option>
                                    <option value="2.0">2.0% — Company / Partnership / Firm</option>
                                </select>
                            </div>
                        </div>

                        <!-- Total Computation Box -->
                        <div class="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div class="p-3 bg-white rounded-lg border border-gray-200">
                                <span class="block text-[10px] font-bold uppercase text-gray-500">Total Taxable Value</span>
                                <span id="newPbTotalTaxable" class="text-sm font-mono font-bold text-blue-900">₹0.00</span>
                            </div>
                            <div class="p-3 bg-white rounded-lg border border-gray-200">
                                <span class="block text-[10px] font-bold uppercase text-gray-500">Input GST ITC (Dr 1030)</span>
                                <span id="newPbTotalGst" class="text-sm font-mono font-bold text-emerald-700">₹0.00</span>
                            </div>
                            <div class="p-3 bg-white rounded-lg border border-gray-200">
                                <span class="block text-[10px] font-bold uppercase text-gray-500">TDS Deducted (Cr 2040)</span>
                                <span id="newPbTotalTds" class="text-sm font-mono font-bold text-amber-700">₹0.00</span>
                            </div>
                            <div class="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <span class="block text-[10px] font-bold uppercase text-blue-800">Net Payable to Vendor (Cr 2000)</span>
                                <span id="newPbTotalPayable" class="text-base font-mono font-black text-gray-950">₹0.00</span>
                            </div>
                        </div>
                    </div>

                    <!-- Footer Action Buttons -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm flex items-center justify-end gap-3">
                        <button type="button" onclick="VaultPurchases.load()" class="btn btn-sm btn-secondary">
                            Cancel
                        </button>
                        <button type="button" id="newPbSubmitBtn" class="btn btn-sm btn-blue flex items-center gap-1.5">
                            <i class="fa-solid fa-check"></i> Post Purchase Bill
                        </button>
                    </div>
                </div>
            `;

            // Wire Carrier Change to auto-fill GST & info
            const carrierSelect = document.getElementById("newPbCarrierSelect");
            const carrierInfo = document.getElementById("newPbCarrierInfo");
            carrierSelect.onchange = () => {
                const code = carrierSelect.value;
                const c = _paneCarriers.find(item => (item.COMPANY_CODE || item.CODE) === code);
                if (c && carrierInfo) {
                    carrierInfo.innerHTML = `GSTIN: <strong>${_escapeHtml(c.GSTIN || 'Not Registered')}</strong> · State: ${_escapeHtml(c.COMPANY_STATE || c.STATE || '—')}`;
                } else if (carrierInfo) {
                    carrierInfo.innerHTML = "";
                }
                _recalcItems();
            };

            // Wire TDS Checkbox toggle
            const tdsCheck = document.getElementById("newPbApplyTds");
            const tdsRateContainer = document.getElementById("newPbTdsRateContainer");
            const tdsRateSelect = document.getElementById("newPbTdsRate");
            tdsCheck.onchange = () => {
                if (tdsCheck.checked) {
                    tdsRateContainer.classList.remove("hidden");
                } else {
                    tdsRateContainer.classList.add("hidden");
                }
                _recalcItems();
            };
            tdsRateSelect.onchange = () => _recalcItems();

            // Wire Add Line Item button
            document.getElementById("newPbAddLineBtn").onclick = () => {
                _paneItems.push({
                    expense_account_code: "5000",
                    description: "Freight / Handling Charges",
                    sac_code: "996511",
                    amount: 1000.0,
                    tax_rate_id: "GST_18"
                });
                _renderItemsTable();
            };

            // Wire Submit Button
            document.getElementById("newPbSubmitBtn").onclick = () => _submitPurchaseBill(activeBranchCode);

            // Initial render of items table
            _renderItemsTable();

        } catch (err) {
            console.error("[VaultPurchases openAddPane error]", err);
            alert("Failed to load bill creation pane: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Render Items Table in Form ──────────────────────────────────────────
    function _renderItemsTable() {
        const tbody = document.getElementById("newPbItemsTbody");
        if (!tbody) return;

        const expenseAccounts = (_paneCOA || []).filter(a => {
            const cat = (a.category || "").toUpperCase();
            const code = String(a.code || "");
            return cat === "EXPENSE" || code.startsWith("5");
        });

        tbody.innerHTML = _paneItems.map((item, idx) => {
            return `
                <tr data-idx="${idx}" class="hover:bg-slate-50 transition">
                    <td class="px-2 py-1.5">
                        <select class="item-exp-acc w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-900 font-medium">
                            ${expenseAccounts.map(a => `
                                <option value="${_escapeHtml(a.code)}" ${a.code === item.expense_account_code ? 'selected' : ''}>
                                    #${_escapeHtml(a.code)} · ${_escapeHtml(a.name)}
                                </option>
                            `).join("")}
                            ${!expenseAccounts.some(a => a.code === item.expense_account_code) ? `<option value="${_escapeHtml(item.expense_account_code)}" selected>#${_escapeHtml(item.expense_account_code)}</option>` : ''}
                        </select>
                    </td>
                    <td class="px-2 py-1.5">
                        <input type="text" class="item-desc w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-900 font-medium" value="${_escapeHtml(item.description)}">
                    </td>
                    <td class="px-2 py-1.5">
                        <input type="text" class="item-sac w-full px-2 py-1 text-xs font-mono border border-gray-300 rounded bg-white text-gray-900" value="${_escapeHtml(item.sac_code || '996511')}">
                    </td>
                    <td class="px-2 py-1.5 text-right">
                        <input type="number" step="0.01" min="0" class="item-amt w-full px-2 py-1 text-xs font-mono font-bold border border-gray-300 rounded text-right bg-white text-gray-950" value="${Number(item.amount || 0).toFixed(2)}">
                    </td>
                    <td class="px-2 py-1.5">
                        <select class="item-tax w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-900 font-medium">
                            <option value="GST_18" ${item.tax_rate_id === 'GST_18' ? 'selected' : ''}>GST 18%</option>
                            <option value="GST_5" ${item.tax_rate_id === 'GST_5' ? 'selected' : ''}>GST 5%</option>
                            <option value="RCM_5" ${item.tax_rate_id === 'RCM_5' ? 'selected' : ''}>RCM 5%</option>
                            <option value="GST_0" ${item.tax_rate_id === 'GST_0' ? 'selected' : ''}>Nil / Exempt (0%)</option>
                            <option value="GST_12" ${item.tax_rate_id === 'GST_12' ? 'selected' : ''}>GST 12%</option>
                            <option value="GST_28" ${item.tax_rate_id === 'GST_28' ? 'selected' : ''}>GST 28%</option>
                        </select>
                    </td>
                    <td class="px-2 py-1.5 text-right font-mono font-bold text-gray-950 item-line-total">
                        ₹0.00
                    </td>
                    <td class="px-2 py-1.5 text-center">
                        ${_paneItems.length > 1 ? `
                            <button type="button" class="btn-del-line text-red-600 hover:text-red-800 font-bold p-1">✕</button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join("");

        // Wire inputs inside tbody
        tbody.querySelectorAll("tr").forEach(tr => {
            const idx = parseInt(tr.dataset.idx, 10);
            const accSelect = tr.querySelector(".item-exp-acc");
            const descInput = tr.querySelector(".item-desc");
            const sacInput  = tr.querySelector(".item-sac");
            const amtInput  = tr.querySelector(".item-amt");
            const taxSelect = tr.querySelector(".item-tax");
            const delBtn    = tr.querySelector(".btn-del-line");

            accSelect.onchange = () => { _paneItems[idx].expense_account_code = accSelect.value; };
            descInput.oninput  = () => { _paneItems[idx].description = descInput.value; };
            sacInput.oninput   = () => { _paneItems[idx].sac_code = sacInput.value; };
            amtInput.oninput   = () => { 
                _paneItems[idx].amount = parseFloat(amtInput.value) || 0; 
                _recalcItems(); 
            };
            taxSelect.onchange = () => { 
                _paneItems[idx].tax_rate_id = taxSelect.value; 
                _recalcItems(); 
            };
            if (delBtn) {
                delBtn.onclick = () => {
                    _paneItems.splice(idx, 1);
                    _renderItemsTable();
                };
            }
        });

        _recalcItems();
    }

    // ── Live Computation of Line Totals & Summary ───────────────────────────
    function _recalcItems() {
        let totalTaxable = 0;
        let totalGst = 0;

        const tbody = document.getElementById("newPbItemsTbody");
        const rows = tbody ? Array.from(tbody.querySelectorAll("tr")) : [];

        _paneItems.forEach((item, idx) => {
            const amt = Number(item.amount || 0);
            totalTaxable += amt;

            let ratePct = 18;
            if (item.tax_rate_id === "GST_5" || item.tax_rate_id === "RCM_5") ratePct = 5;
            else if (item.tax_rate_id === "GST_12") ratePct = 12;
            else if (item.tax_rate_id === "GST_28") ratePct = 28;
            else if (item.tax_rate_id === "GST_0" || item.tax_rate_id === "EXEMPT") ratePct = 0;

            const taxAmt = Math.round(amt * ratePct) / 100;
            totalGst += taxAmt;

            const lineTotal = amt + taxAmt;
            if (rows[idx]) {
                const totalCell = rows[idx].querySelector(".item-line-total");
                if (totalCell) totalCell.textContent = _fmtMoney(lineTotal);
            }
        });

        totalTaxable = Math.round(totalTaxable * 100) / 100;
        totalGst = Math.round(totalGst * 100) / 100;

        let totalTds = 0;
        const applyTds = document.getElementById("newPbApplyTds")?.checked || false;
        if (applyTds) {
            const tdsRate = parseFloat(document.getElementById("newPbTdsRate")?.value || "1.0");
            totalTds = Math.round(totalTaxable * tdsRate) / 100;
        }

        const netPayable = Math.round((totalTaxable + totalGst - totalTds) * 100) / 100;

        // Update Summary Box
        const taxableEl = document.getElementById("newPbTotalTaxable");
        const gstEl     = document.getElementById("newPbTotalGst");
        const tdsEl     = document.getElementById("newPbTotalTds");
        const payableEl = document.getElementById("newPbTotalPayable");

        if (taxableEl) taxableEl.textContent = _fmtMoney(totalTaxable);
        if (gstEl)     gstEl.textContent = _fmtMoney(totalGst);
        if (tdsEl)     tdsEl.textContent = totalTds > 0 ? ('- ' + _fmtMoney(totalTds)) : 'Nil';
        if (payableEl) payableEl.textContent = _fmtMoney(netPayable);
    }

    // ── Submit Purchase Bill to Backend ─────────────────────────────────────
    async function _submitPurchaseBill(branchCode) {
        const carrierCode = document.getElementById("newPbCarrierSelect")?.value;
        const billNo = document.getElementById("newPbBillNo")?.value?.trim();
        const billDate = document.getElementById("newPbBillDate")?.value;
        const narration = document.getElementById("newPbNarration")?.value?.trim();
        const applyTds = document.getElementById("newPbApplyTds")?.checked || false;
        const tdsRate = applyTds ? parseFloat(document.getElementById("newPbTdsRate")?.value || "1.0") : null;

        if (!carrierCode) {
            alert("Please select a Carrier / Vendor from the dropdown.");
            return;
        }
        if (!billNo) {
            alert("Please enter the vendor original bill / invoice number.");
            document.getElementById("newPbBillNo")?.focus();
            return;
        }
        if (!_paneItems.length) {
            alert("Please add at least one expense line item.");
            return;
        }

        // Validate items
        for (let i = 0; i < _paneItems.length; i++) {
            if (!_paneItems[i].amount || _paneItems[i].amount <= 0) {
                alert(`Please enter a valid amount for line item #${i + 1}.`);
                return;
            }
            if (!_paneItems[i].description) {
                alert(`Please enter a description for line item #${i + 1}.`);
                return;
            }
        }

        const selectedCarrier = _paneCarriers.find(c => (c.COMPANY_CODE || c.CODE) === carrierCode);

        const payload = {
            supplier_code: carrierCode,
            supplier_type: selectedCarrier?.VENDOR_TYPE || "CARRIER",
            supplier_gstin: selectedCarrier?.GSTIN || null,
            supplier_pan: selectedCarrier?.PAN || null,
            bill_no: billNo,
            bill_date: billDate || new Date().toISOString().split("T")[0],
            branch_code: branchCode || "MAIN",
            narration: narration || `Bill #${billNo} from ${carrierCode}`,
            apply_tds: applyTds,
            tds_rate_pct: tdsRate,
            items: _paneItems.map(item => ({
                expense_account_code: item.expense_account_code || "5000",
                description: item.description || "Freight charges",
                amount: parseFloat(item.amount),
                sac_code: item.sac_code || "996511",
                tax_rate_id: item.tax_rate_id || "GST_18"
            })),
            metadata: {
                carrier_name: selectedCarrier?.COMPANY_NAME || selectedCarrier?.NAME || carrierCode,
                source: "vault_purchases_ui"
            }
        };

        window.setLoading?.(true, "Posting vendor purchase bill to ledger...", "detail");

        try {
            const token = _getAuthToken();
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };

            const r = await fetch('/api/accounting/vendor-bills', {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });

            if (!r.ok) {
                const errData = await r.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to create vendor bill.");
            }

            const resData = await r.json();
            const createdDocNo = resData.doc_no || resData.transaction_no || "Bill";

            alert(`Vendor Purchase Bill ${createdDocNo} posted successfully!`);
            await load();

        } catch (err) {
            console.error("[VaultPurchases submit error]", err);
            alert("Failed to create vendor bill: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Main Load Function ──────────────────────────────────────────────────
    async function load(startDate = null, endDate = null) {
        _injectListPane();
        window.setLoading?.(true, "Loading purchase bills...", "list");

        try {
            const queryParts = ["limit=200"];
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);

            const branch = (typeof VaultPage !== 'undefined' && typeof VaultPage.getActiveBranch === "function" ? VaultPage.getActiveBranch() : "") || (typeof getActiveBranch === "function" ? getActiveBranch() : "") || localStorage.getItem("vault_selected_branch") || "";
            if (branch && branch.toUpperCase() !== "ALL") {
                queryParts.push(`branch=${encodeURIComponent(branch)}`);
            }

            const qs = queryParts.length ? `?${queryParts.join("&")}` : "";
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            let res = null;
            try {
                const r = await fetch(`/api/accounting/vendor-bills${qs}`, { headers });
                if (r.ok) res = await r.json();
            } catch (_) {}

            if (!res) {
                // Fallback to /api/ledger/bills
                try {
                    const r = await fetch(`/api/ledger/bills${qs}`, { headers });
                    if (r.ok) res = await r.json();
                } catch (_) {}
            }

            _allBills = Array.isArray(res) ? res : (res?.bills || res?.vendor_bills || res?.data || res?.transactions || []);
            _renderList();

            // Do not auto-select on load — show empty placeholder until user selects
            _selectedBill = null;
            VaultPage?.showDetail?.(false);

        } catch (err) {
            console.error("[VaultPurchases load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) {
                msg.textContent = "Failed to load purchase bills: " + (err.message || err);
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
        promptVoidBill
    };
})();

window.VaultPurchases = VaultPurchases;
