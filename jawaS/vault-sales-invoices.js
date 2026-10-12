// ============================================================================
// VAULT-SALES-INVOICES.JS — Sales Invoices & Double-Entry Ledger Management
// Tile: sales-invoices (Native Double-Entry Ledger Engine)
// Primary Endpoint: /api/ledger/invoices & /api/ledger/transactions/{doc_no}
// Fallback: /api/accounting/invoices
// ============================================================================

const VaultSalesInvoices = (() => {

    let _allInvoices = [];
    let _selectedInvoice = null;
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterStatus = "";
    let _filterBranch = "";

    const _escapeHtml = (str) => {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    const _userLevel = () => {
        if (typeof getUserLevel === "function") return getUserLevel();
        const role = (typeof getUserRole === "function" ? getUserRole() : "") || "GUEST";
        return (typeof ROLE_LEVELS !== "undefined" && ROLE_LEVELS[role]) ? ROLE_LEVELS[role] : 0;
    };

    const _canManage = () => {
        const minLevel = (typeof ROLE_LEVELS !== "undefined" && ROLE_LEVELS["ACCOUNTANT"]) ? ROLE_LEVELS["ACCOUNTANT"] : 60;
        return _userLevel() >= minLevel;
    };

    function _getStatusBadge(inv) {
        const status = (inv.status || "POSTED").toUpperCase();
        if (status === "VOID" || status === "CANCELLED") {
            return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-800 border border-red-200 line-through">VOID</span>`;
        }
        if (status === "DRAFT") {
            return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">DRAFT</span>`;
        }
        return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">POSTED</span>`;
    }

    // ── List Pane & Filter Modal ───────────────────────────────────────────────
    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search invoice #, client, ref, batch...";
            search.oninput = () => _renderList();
        }

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => document.getElementById("siFilterModal")?.classList.remove("hidden");
        }

        // Inject Filter Modal if not already present
        if (!document.getElementById("siFilterModal")) {
            const modal = document.createElement("div");
            modal.id = "siFilterModal";
            modal.className = "modal-overlay hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-150">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h2 class="text-base font-bold text-gray-900 flex items-center gap-2">
                            <span>🔍</span> Filter Sales Invoices
                        </h2>
                        <button onclick="document.getElementById('siFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>

                    <!-- Quick FY Presets -->
                    <div>
                        <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="siPresetCfy" class="btn btn-sm text-xs">Current FY</button>
                            <button type="button" id="siPresetPfy" class="btn btn-sm text-xs">Previous FY</button>
                            <button type="button" id="siPresetAll" class="btn btn-sm text-xs">All Records</button>
                        </div>
                    </div>

                    <!-- Date Inputs -->
                    <div class="grid grid-cols-2 gap-3 pt-1">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="siFilterStart" class="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="siFilterEnd" class="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>

                    <!-- Status Filter -->
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Voucher Status</label>
                        <select id="siFilterStatusSelect" class="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                            <option value="">All Statuses</option>
                            <option value="POSTED">Posted (Active)</option>
                            <option value="VOID">Void / Cancelled</option>
                        </select>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end gap-2 pt-3 border-t border-gray-100">
                        <button id="siFilterResetBtn" type="button" class="btn-danger btn-sm text-xs">Reset</button>
                        <button id="siFilterApplyBtn" type="button" class="btn-ghost btn-sm text-xs">Apply Filter</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Wire Preset buttons
            const now = new Date();
            const year = now.getFullYear();
            const startYear = now.getMonth() < 3 ? year - 1 : year;

            document.getElementById("siPresetCfy").onclick = () => {
                document.getElementById("siFilterStart").value = `${startYear}-04-01`;
                document.getElementById("siFilterEnd").value = `${startYear + 1}-03-31`;
            };
            document.getElementById("siPresetPfy").onclick = () => {
                document.getElementById("siFilterStart").value = `${startYear - 1}-04-01`;
                document.getElementById("siFilterEnd").value = `${startYear}-03-31`;
            };
            document.getElementById("siPresetAll").onclick = () => {
                document.getElementById("siFilterStart").value = "";
                document.getElementById("siFilterEnd").value = "";
            };

            // Wire Apply and Reset
            document.getElementById("siFilterApplyBtn").onclick = () => {
                _filterStart = document.getElementById("siFilterStart").value;
                _filterEnd = document.getElementById("siFilterEnd").value;
                _filterStatus = document.getElementById("siFilterStatusSelect").value;
                modal.classList.add("hidden");
                load(_filterStart, _filterEnd);
            };

            document.getElementById("siFilterResetBtn").onclick = () => {
                document.getElementById("siFilterStart").value = "";
                document.getElementById("siFilterEnd").value = "";
                document.getElementById("siFilterStatusSelect").value = "";
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

    function _renderList() {
        const ul = document.getElementById("vaultList");
        if (!ul) return;

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _allInvoices.filter(e => {
            const isVoid = (e.status || "").toUpperCase() === "VOID";
            if (isVoid && (_filterStatus || "").toUpperCase() !== "VOID") {
                return false;
            }
            if (_filterStatus && (e.status || "").toUpperCase() !== _filterStatus.toUpperCase()) {
                return false;
            }
            if (!q) return true;
            const docNo = (e.doc_no || e.invoice_number || "").toLowerCase();
            const refNo = (e.ref_no || "").toLowerCase();
            const narration = (e.narration || "").toLowerCase();
            const clientName = (e.client?.name || e.metadata?.client_name || "").toLowerCase();
            const clientCode = (e.client?.code || e.metadata?.client_code || "").toLowerCase();
            const dt = (e.doc_date || e.date || "").toLowerCase();
            return docNo.includes(q) || refNo.includes(q) || narration.includes(q) || clientName.includes(q) || clientCode.includes(q) || dt.includes(q);
        });

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            if (_filterStart || _filterEnd || _filterStatus) {
                filterBtn.classList.add("bg-indigo-100", "text-indigo-700");
            } else {
                filterBtn.classList.remove("bg-indigo-100", "text-indigo-700");
            }
        }

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-xs py-8">No matching sales invoices found.</li>`;
            return;
        }

        ul.innerHTML = filtered.map(e => {
            const docNo = e.doc_no || e.invoice_number || "INV-???";
            const client = e.client || {};
            const clientCode = client.code || e.metadata?.client_code || e.ref_no || "B2B Client";
            const clientName = client.name || e.metadata?.client_name || "";
            const displayClient = (clientName && clientName.toUpperCase() !== clientCode.toUpperCase())
                ? `${_escapeHtml(clientName)} <span class="text-indigo-600 text-[10px] font-mono">(${_escapeHtml(clientCode)})</span>`
                : _escapeHtml(clientCode);
            const dateStr = e.doc_date || e.date || "—";
            const amount = parseFloat(e.total_amount || e.amount || 0);
            const branch = e.branch_code || "DDN";
            const badge = _getStatusBadge(e);
            const isVoid = (e.status || "").toUpperCase() === "VOID";

            return `
                <li data-id="${e.doc_no || e.id}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50/60 border border-gray-200 transition-colors ${isVoid ? "opacity-70 bg-gray-50/50" : ""}">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-indigo-800 text-xs font-bold font-mono tracking-tight truncate ${isVoid ? 'line-through' : ''}">${_escapeHtml(docNo)}</strong>
                        ${badge}
                    </div>
                    <div class="flex items-center justify-between text-xs font-semibold text-gray-800 mt-1 truncate">
                        <span class="truncate">${displayClient}</span>
                        <span class="font-bold text-gray-900 ${isVoid ? 'text-gray-500 line-through' : ''}">₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                        <span>📅 ${dateStr}</span>
                        <span class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">${_escapeHtml(branch)}</span>
                    </div>
                </li>
            `;
        }).join("");

        const items = Array.from(ul.querySelectorAll("li"));
        items.forEach((li, idx) => {
            li.setAttribute("tabindex", "0");
            const selectItem = () => {
                items.forEach(x => x.classList.remove("selected"));
                li.classList.add("selected");
                li.focus({ preventScroll: true });
                li.scrollIntoView({ block: "nearest", behavior: "smooth" });
                const inv = _allInvoices.find(item => (item.doc_no || String(item.id)) === li.dataset.id);
                if (inv) _loadAndRenderDetail(inv);
            };

            li.addEventListener("click", selectItem);
            li.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectItem();
                } else if (e.key === "ArrowDown" && idx < items.length - 1) {
                    e.preventDefault();
                    items[idx + 1].click();
                } else if (e.key === "ArrowUp" && idx > 0) {
                    e.preventDefault();
                    items[idx - 1].click();
                }
            });
        });
    }

    async function _loadAndRenderDetail(invSummary) {
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        view.innerHTML = `
            <div class="detail-card p-8 flex flex-col items-center justify-center text-gray-400 space-y-2">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <div class="text-xs">Loading ledger transaction entries...</div>
            </div>
        `;

        try {
            const docNo = invSummary.doc_no || invSummary.invoice_number;
            const fullTxn = await callApi(`/api/ledger/transactions/${encodeURIComponent(docNo)}`, {}, "GET");
            _selectedInvoice = fullTxn;
            _renderDetailView(fullTxn);
        } catch (err) {
            console.warn("[VaultSalesInvoices] Failed to fetch transaction entries, using summary:", err);
            _selectedInvoice = invSummary;
            _renderDetailView(invSummary);
        }
    }

    function _renderDetailView(inv) {
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const docNo = inv.doc_no || inv.invoice_number || "N/A";
        const meta = inv.metadata || {};
        const client = inv.client || {};
        const clientCode = client.code || meta.client_code || inv.ref_no || "B2B Client";
        const clientName = client.name || meta.client_name || clientCode;
        const clientAddress = client.address || meta.client_address || "";
        const clientCity = client.city || meta.client_city || "";
        const clientState = client.state || meta.client_state || "";
        const clientPincode = client.pincode || meta.client_pincode || "";
        const fullAddress = [clientAddress, clientCity, clientState, clientPincode].filter(Boolean).join(", ");
        const clientGstin = client.gstin || meta.client_gstin || "";
        const clientMobile = client.mobile || meta.client_mobile || "";
        const clientEmail = client.email || meta.client_email || "";
        const batchId = meta.batch_id || "";
        const ordersCount = meta.orders_count || 0;
        const dateStr = inv.doc_date || inv.date || "—";
        const amount = parseFloat(inv.total_amount || inv.amount || 0);
        const branchObj = inv.branch || {};
        const branchCode = branchObj.code || inv.branch_code || "DDN";
        const branchName = branchObj.name || `Logistics Hub (${branchCode})`;
        const branchAddress = branchObj.address || "";
        const branchCity = branchObj.city || "";
        const branchState = branchObj.state || "";
        const branchPincode = branchObj.pincode || "";
        const fullBranchAddress = [branchAddress, branchCity, branchState, branchPincode].filter(Boolean).join(", ");
        const branchGstin = branchObj.gstin || "";
        const branchMobile = branchObj.mobile || "";
        const branchEmail = branchObj.email || "";
        const branchBankName = branchObj.bank_name || "";
        const branchBankAc = branchObj.bank_account || "";
        const branchBankIfsc = branchObj.bank_ifsc || "";
        const branchUpi = branchObj.upi || "";
        const branchUpiName = branchObj.upi_name || "";

        const narration = inv.narration || "";
        const isVoid = (inv.status || "").toUpperCase() === "VOID";
        const badge = _getStatusBadge(inv);

        const entries = Array.isArray(inv.entries) ? inv.entries : [];
        let totalDebit = 0;
        let totalCredit = 0;

        const rowsHtml = entries.map((e, idx) => {
            const dr = parseFloat(e.debit || 0);
            const cr = parseFloat(e.credit || 0);
            totalDebit += dr;
            totalCredit += cr;

            return `
                <tr class="hover:bg-gray-50/60 transition-colors border-b border-gray-100">
                    <td class="px-3 py-2 text-center text-gray-400 font-mono text-[11px]">${idx + 1}</td>
                    <td class="px-3 py-2 font-mono font-bold text-indigo-700 text-xs">${_escapeHtml(e.account_code)}</td>
                    <td class="px-3 py-2 text-xs font-semibold text-gray-800">${_escapeHtml(e.account_name || e.account_code)}</td>
                    <td class="px-3 py-2 text-xs text-gray-600">${_escapeHtml(e.memo || narration || "—")}</td>
                    <td class="px-3 py-2 text-center font-mono text-xs text-gray-500">${_escapeHtml(e.entity_code || "—")}</td>
                    <td class="px-3 py-2 text-right font-mono text-xs font-semibold ${dr > 0 ? 'text-gray-900' : 'text-gray-300'}">
                        ${dr > 0 ? `₹${dr.toFixed(2)}` : '—'}
                    </td>
                    <td class="px-3 py-2 text-right font-mono text-xs font-semibold ${cr > 0 ? 'text-gray-900' : 'text-gray-300'}">
                        ${cr > 0 ? `₹${cr.toFixed(2)}` : '—'}
                    </td>
                </tr>
            `;
        }).join("");

        // Financial tax breakdown calculations
        const taxableAmt = parseFloat(meta.taxable_amount || 0);
        const cgst = parseFloat(meta.cgst || 0);
        const sgst = parseFloat(meta.sgst || 0);
        const igst = parseFloat(meta.igst || 0);
        const totalTax = parseFloat(meta.total_tax || (cgst + sgst + igst));

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <!-- Header Bar -->
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-4">
                        <div>
                            <div class="flex items-center gap-2">
                                <h1 class="text-xl font-bold font-mono text-indigo-900">${_escapeHtml(docNo)}</h1>
                                ${badge}
                            </div>
                            <p class="text-xs text-gray-500 mt-1">
                                Issuer: <strong class="text-gray-800">${_escapeHtml(branchName)}</strong> (<span class="font-mono font-bold text-indigo-800">${_escapeHtml(branchCode)}</span>) · 
                                SAC: <span class="font-mono font-semibold text-gray-700">996812</span> (Courier & Cargo Services)
                            </p>
                        </div>
                        <div class="flex items-center gap-2 flex-wrap justify-end">
                            <button onclick="window.print()" class="btn btn-sm text-xs flex items-center gap-1.5">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                <span>Print</span>
                            </button>

                            ${!isVoid && _canManage() ? `
                                <button onclick="VaultSalesInvoices.promptVoid('${_escapeHtml(docNo)}', '${_escapeHtml(batchId)}')" class="btn btn-sm bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 flex items-center gap-1.5 font-bold">
                                    <span>🔒 Void / Reverse</span>
                                </button>
                            ` : ""}
                        </div>
                    </div>

                    <!-- Batch Origin Notification Banner -->
                    ${batchId ? `
                        <div class="p-3 bg-purple-50 rounded-lg border border-purple-200 text-xs text-purple-900 flex items-center justify-between">
                            <span class="flex items-center gap-2 font-medium">
                                <span class="text-base">📦</span>
                                <span>Generated from Courier Billing Batch: <strong class="font-mono text-purple-800">${_escapeHtml(batchId)}</strong> ${ordersCount ? `(${ordersCount} shipments)` : ""}</span>
                            </span>
                            <span class="text-[11px] text-purple-700 italic">Reversal updates shipment billed status</span>
                        </div>
                    ` : ""}

                    <!-- Voucher Overview Quick Bar -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                        <div>
                            <span class="text-[10px] text-gray-400 font-semibold uppercase block">Invoice Date</span>
                            <span class="text-xs font-bold text-gray-800">📅 ${dateStr}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-gray-400 font-semibold uppercase block">Voucher Status</span>
                            <span class="text-xs font-bold ${isVoid ? 'text-red-600' : 'text-emerald-700'}">${isVoid ? 'VOID / REVERSED' : 'POSTED TO LEDGER'}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-gray-400 font-semibold uppercase block">Invoice Grand Total</span>
                            <span class="text-sm font-bold text-indigo-700 font-mono">₹${amount.toFixed(2)}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-gray-400 font-semibold uppercase block">Created By</span>
                            <span class="text-xs font-mono text-gray-600 truncate block">${_escapeHtml(inv.created_by || "SYSTEM")}</span>
                        </div>
                    </div>

                    <!-- Side-by-Side Symmetrical Parties: Billed From (Branch Hub) vs Billed To (Client) -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Billed From: Issuing Logistics Hub / Branch -->
                        <div class="p-4 bg-emerald-50/40 rounded-xl border border-emerald-100 space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="text-[10px] text-emerald-800 font-bold uppercase tracking-wider block">Billed From (Logistics Hub / Branch)</span>
                                <span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-emerald-100 text-emerald-800">${_escapeHtml(branchCode)}</span>
                            </div>
                            <div class="text-base font-bold text-gray-900">${_escapeHtml(branchName)}</div>
                            ${fullBranchAddress ? `<div class="text-xs text-gray-600 flex items-start gap-1"><span>📍</span><span>${_escapeHtml(fullBranchAddress)}</span></div>` : ""}
                            <div class="flex items-center gap-3 text-xs text-gray-600 flex-wrap pt-0.5">
                                ${branchGstin ? `<div class="font-mono font-semibold text-gray-800">GSTIN: <span class="text-emerald-900 font-bold">${_escapeHtml(branchGstin)}</span></div>` : `<div class="text-gray-400 italic">State Code: ${branchObj.gst_code || '05'} (${branchObj.state || 'Uttarakhand'})</div>`}
                                ${branchMobile ? `<div>📞 ${_escapeHtml(branchMobile)}</div>` : ""}
                                ${branchEmail ? `<div>✉️ ${_escapeHtml(branchEmail)}</div>` : ""}
                            </div>
                        </div>

                        <!-- Billed To: Customer / Client -->
                        <div class="p-4 bg-indigo-50/40 rounded-xl border border-indigo-100 space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="text-[10px] text-indigo-700 font-bold uppercase tracking-wider block">Billed To (Customer / Client)</span>
                                <span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-indigo-100 text-indigo-800">${_escapeHtml(clientCode)}</span>
                            </div>
                            <div class="text-base font-bold text-gray-900">${_escapeHtml(clientName)}</div>
                            ${fullAddress ? `<div class="text-xs text-gray-600 flex items-start gap-1"><span>📍</span><span>${_escapeHtml(fullAddress)}</span></div>` : ""}
                            <div class="flex items-center gap-3 text-xs text-gray-600 flex-wrap pt-0.5">
                                ${clientGstin ? `<div class="font-mono font-semibold text-gray-800">GSTIN: <span class="text-indigo-900 font-bold">${_escapeHtml(clientGstin)}</span></div>` : `<div class="text-gray-400 italic">Unregistered / No GSTIN</div>`}
                                ${clientMobile ? `<div>📞 ${_escapeHtml(clientMobile)}</div>` : ""}
                                ${clientEmail ? `<div>✉️ ${_escapeHtml(clientEmail)}</div>` : ""}
                            </div>
                            ${narration ? `<div class="text-[11px] text-gray-500 mt-1 italic border-t border-indigo-100/60 pt-1">"${_escapeHtml(narration)}"</div>` : ""}
                        </div>
                    </div>

                    <!-- Double-Entry Ledger Lines Table -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                <span>⚖️</span> Double-Entry Ledger Breakdown
                            </h3>
                            <span class="text-[11px] font-mono text-gray-500">${entries.length} Balanced Line(s)</span>
                        </div>
                        <div class="overflow-x-auto rounded-lg border border-gray-200">
                            <table class="w-full text-left text-xs border-collapse">
                                <thead class="bg-gray-100 text-gray-600 font-bold uppercase border-b border-gray-200">
                                    <tr>
                                        <th class="px-3 py-2 text-center" style="width:36px;">#</th>
                                        <th class="px-3 py-2" style="width:70px;">Account</th>
                                        <th class="px-3 py-2">Account Name</th>
                                        <th class="px-3 py-2">Memo / Description</th>
                                        <th class="px-3 py-2 text-center" style="width:80px;">Entity</th>
                                        <th class="px-3 py-2 text-right" style="width:110px;">Debit</th>
                                        <th class="px-3 py-2 text-right" style="width:110px;">Credit</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 bg-white">
                                    ${rowsHtml.length ? rowsHtml : `<tr><td colspan="7" class="p-6 text-center text-gray-400">No ledger entries loaded</td></tr>`}
                                </tbody>
                                <tfoot class="bg-gray-50 font-bold border-t border-gray-200 text-xs">
                                    <tr>
                                        <td colspan="5" class="px-3 py-2 text-right text-gray-600 uppercase">Total Balanced:</td>
                                        <td class="px-3 py-2 text-right font-mono text-indigo-900">₹${totalDebit.toFixed(2)}</td>
                                        <td class="px-3 py-2 text-right font-mono text-indigo-900">₹${totalCredit.toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <!-- Financial Summary & Tax Breakdown Box -->
                    <div class="flex justify-end">
                        <div class="w-full sm:w-80 space-y-1.5 p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                            <div class="flex justify-between text-gray-600">
                                <span>Taxable Subtotal:</span>
                                <span class="font-medium font-mono">₹${(taxableAmt > 0 ? taxableAmt : (amount - totalTax)).toFixed(2)}</span>
                            </div>
                            ${cgst > 0 ? `
                                <div class="flex justify-between text-gray-600">
                                    <span>CGST (9%):</span>
                                    <span class="font-medium font-mono">₹${cgst.toFixed(2)}</span>
                                </div>
                            ` : ""}
                            ${sgst > 0 ? `
                                <div class="flex justify-between text-gray-600">
                                    <span>SGST (9%):</span>
                                    <span class="font-medium font-mono">₹${sgst.toFixed(2)}</span>
                                </div>
                            ` : ""}
                            ${igst > 0 ? `
                                <div class="flex justify-between text-gray-600">
                                    <span>IGST (18%):</span>
                                    <span class="font-medium font-mono">₹${igst.toFixed(2)}</span>
                                </div>
                            ` : ""}
                            <div class="flex justify-between text-gray-600 font-semibold border-t border-gray-200 pt-1">
                                <span>Total Tax (GST):</span>
                                <span class="font-mono">₹${totalTax.toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between text-gray-900 font-bold text-sm border-t border-gray-200 pt-1.5">
                                <span>Invoice Grand Total:</span>
                                <span class="text-indigo-800 font-mono">₹${amount.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Payment Remittance Details (Branch Bank & UPI) -->
                    ${(branchBankAc || branchUpi) ? `
                        <div class="p-4 bg-amber-50/50 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-2">
                            <div class="font-bold uppercase tracking-wider text-[11px] text-amber-900 flex items-center gap-1.5">
                                <span>🏦</span> Payment Remittance Details (Pay to Branch)
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                ${branchBankAc ? `
                                    <div class="bg-white p-3 rounded-lg border border-amber-100 space-y-1">
                                        <div class="text-[10px] text-gray-400 uppercase font-semibold">Direct Bank Transfer (NEFT / RTGS / IMPS)</div>
                                        <div class="font-bold text-gray-800 text-xs">${_escapeHtml(branchBankName || "Bank Account")}</div>
                                        <div class="font-mono text-xs font-bold text-gray-900">A/C: <span class="text-amber-900">${_escapeHtml(branchBankAc)}</span></div>
                                        <div class="font-mono text-xs text-gray-600">IFSC: <span class="font-bold text-gray-800">${_escapeHtml(branchBankIfsc)}</span></div>
                                    </div>
                                ` : ""}
                                ${branchUpi ? `
                                    <div class="bg-white p-3 rounded-lg border border-amber-100 space-y-1">
                                        <div class="text-[10px] text-gray-400 uppercase font-semibold">Instant UPI Payment</div>
                                        <div class="font-mono font-bold text-indigo-900 text-sm">${_escapeHtml(branchUpi)}</div>
                                        ${branchUpiName ? `<div class="text-gray-600 text-xs">Beneficiary: <span class="font-semibold text-gray-800">${_escapeHtml(branchUpiName)}</span></div>` : ""}
                                        <div class="text-[11px] text-emerald-700 font-medium">Scan & Pay via GPay / PhonePe / Paytm / BHIM</div>
                                    </div>
                                ` : ""}
                            </div>
                        </div>
                    ` : ""}
                </div>
            </div>
        `;

        VaultPage.showDetailPane();
    }

    // ── Void / Reverse Invoice Execution ──────────────────────────────────────
    async function promptVoid(docNo, batchId) {
        if (!_canManage()) {
            alert("Permission denied. Only Accountant or above can void posted sales invoices.");
            return;
        }

        const isBatch = Boolean(batchId && batchId.trim());
        const msg = isBatch
            ? `Invoice ${docNo} was created from Courier Billing batch '${batchId}'.\n\nVoiding it will:\n1. Revert double-entry general ledger transactions.\n2. Restore all shipments in this batch to UNBILLED status in Billing Desk.\n\nProceed with 2FA / OTP verification?`
            : `Are you sure you want to void invoice ${docNo}?\n\nThis will post an automatic reversing journal entry in the ledger with balanced debit and credit entries.\n\nProceed with 2FA / OTP verification?`;

        if (!confirm(msg)) return;

        const reason = prompt("Enter mandatory reason for voiding this invoice:", isBatch ? "Courier batch billing correction" : "Invoice error / cancellation");
        if (!reason || !reason.trim()) {
            alert("Cancellation aborted: a void reason is strictly mandatory for the ledger audit trail.");
            return;
        }

        window.setLoading?.(true, "Verifying 2FA & Voiding Invoice...", "detail");
        try {
            if (isBatch) {
                // Route through /api/unbillInvoice which resets orders and voids ledger
                await callApi("/api/unbillInvoice", {
                    invoice_id: docNo,
                    reason: reason.trim()
                }, "POST");
            } else {
                // Route through double-entry ledger transaction void
                await callApi(`/api/ledger/transactions/${encodeURIComponent(docNo)}/void?reason=${encodeURIComponent(reason.trim())}`, {}, "POST");
            }

            alert(`Invoice ${docNo} has been successfully VOIDED and reversed in the general ledger.`);
            await load(_filterStart, _filterEnd);
        } catch (err) {
            if (err && err.message === 'cancelled') {
                console.info('[VaultSalesInvoices] 2FA cancelled by user');
                return;
            }
            console.error("[VaultSalesInvoices void error]", err);
            alert("Failed to void invoice: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── New In-Pane Invoice Creation (View Pane, No Popups) ────────────────────
    let _paneClients = [];
    let _paneBranches = [];
    let _paneRevAccounts = [];
    let _paneTaxList = [];

    async function openNewInvoicePane() {
        if (!_canManage()) {
            alert("Permission denied. Only Accountant or above can create sales invoices.");
            return;
        }

        VaultPage.showDetail(true);
        if (typeof VaultPage.showDetailPane === "function") {
            VaultPage.showDetailPane();
        }

        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        view.innerHTML = `
            <div class="detail-card p-12 flex flex-col items-center justify-center text-gray-500 space-y-3">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <div class="text-xs font-medium">Resolving Master Clients & Chart of Accounts...</div>
            </div>
        `;

        try {
            // 1. Fetch Clients from IndexedDB (B2B)
            let clients = [];
            try {
                if (typeof getAppData === "function") {
                    const rawB2B = await getAppData("B2B");
                    clients = Object.values(rawB2B || {}).filter(c => c && (c.CODE || c.CLIENT_CODE));
                }
            } catch (e) {
                console.warn("[VaultSalesInvoices] Failed to get B2B from IDB:", e);
            }

            // Fallback clients if IDB is empty
            if (!clients.length) {
                try {
                    const token = (typeof getSessionId === "function" ? getSessionId() : "") || localStorage.getItem("token") || "";
                    const headers = token ? { "Authorization": `Bearer ${token}` } : {};
                    const r = await fetch("/api/accounting/clients", { headers });
                    if (r.ok) {
                        const data = await r.json();
                        clients = Array.isArray(data) ? data : (data.clients || []);
                    }
                } catch (_) {}
            }

            clients.sort((a, b) => {
                const nameA = (a.B2B_NAME || a.NAME || a.CODE || "").toLowerCase();
                const nameB = (b.B2B_NAME || b.NAME || b.CODE || "").toLowerCase();
                return nameA.localeCompare(nameB);
            });

            // 2. Fetch Branches from IndexedDB (BRANCHES)
            let branches = [];
            try {
                if (typeof getAppData === "function") {
                    const rawBr = await getAppData("BRANCHES");
                    branches = Object.values(rawBr || {}).filter(b => b && b.BRANCH_CODE && (!b.STATUS || b.STATUS.toLowerCase() === "active"));
                }
            } catch (e) {
                console.warn("[VaultSalesInvoices] Failed to get BRANCHES from IDB:", e);
            }
            if (!branches.length) {
                branches = [
                    { BRANCH_CODE: "DDN", BRANCH_NAME: "Dehradun Hub", GSTIN: "05AAACP1234A1Z5", STATE_CODE: "05", CITY: "Dehradun", STATE: "Uttarakhand" },
                    { BRANCH_CODE: "DEL", BRANCH_NAME: "Delhi Central Hub", GSTIN: "07AAACP1234A1Z1", STATE_CODE: "07", CITY: "New Delhi", STATE: "Delhi" }
                ];
            }
            branches.sort((a, b) => (a.BRANCH_CODE || "").localeCompare(b.BRANCH_CODE || ""));

            // 3. Fetch COA Accounts (Revenue)
            let coaList = (typeof VaultPage.getCOA === "function" ? VaultPage.getCOA() : []) || [];
            if (!coaList.length) {
                try {
                    const token = (typeof getSessionId === "function" ? getSessionId() : "") || localStorage.getItem("token") || "";
                    const headers = token ? { "Authorization": `Bearer ${token}` } : {};
                    const cr = await fetch("/api/ledger/accounts", { headers });
                    if (cr.ok) {
                        const cdata = await cr.json();
                        coaList = Array.isArray(cdata) ? cdata : (cdata.accounts || []);
                    }
                } catch (_) {}
            }

            let revAccounts = coaList.filter(a => {
                const cat = (a.category || "").toUpperCase();
                const code = String(a.code || a.account_code || "");
                return cat === "REVENUE" || code.startsWith("3");
            });

            if (!revAccounts.length) {
                revAccounts = [
                    { code: "3000", name: "Freight Logistics Revenue - Air & Express", mode: "AIR" },
                    { code: "3010", name: "Freight Logistics Revenue - Surface & Cargo", mode: "SURFACE" },
                    { code: "3020", name: "Express Cargo Logistics Revenue", mode: "EXP" },
                    { code: "3030", name: "Packaging & Material Handling Revenue", mode: "PACK" },
                    { code: "3040", name: "Value Added Services (VAS) & Handling", mode: "VAS" },
                    { code: "3090", name: "Other Operating Logistics Revenue", mode: "AIR" }
                ];
            }

            // 4. Tax Rates
            const taxRates = [
                { id: "GST_18", label: "18% GST (9% CGST + 9% SGST / 18% IGST)", rate: 0.18, sac: "996812" },
                { id: "GST_12", label: "12% GST (6% CGST + 6% SGST / 12% IGST)", rate: 0.12, sac: "996812" },
                { id: "GST_5", label: "5% GST (2.5% CGST + 2.5% SGST / 5% IGST)", rate: 0.05, sac: "996511" },
                { id: "GST_0", label: "0% GST (Exempt Services)", rate: 0.0, sac: "996812" }
            ];

            _paneClients = clients;
            _paneBranches = branches;
            _paneRevAccounts = revAccounts;
            _paneTaxList = taxRates;

            _renderNewInvoicePaneLayout();

        } catch (err) {
            console.error("[VaultSalesInvoices openNewInvoicePane error]", err);
            view.innerHTML = `
                <div class="detail-card p-8 text-center text-red-600 text-xs">
                    Failed to initialize New Invoice form: ${_escapeHtml(err.message || err)}
                </div>
            `;
        }
    }

    function _renderNewInvoicePaneLayout() {
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const todayStr = new Date().toISOString().split("T")[0];
        const activeBranchCode = (typeof VaultPage.getActiveBranch === "function" ? VaultPage.getActiveBranch() : "") || (typeof getActiveBranch === "function" ? getActiveBranch() : "") || localStorage.getItem("vault_selected_branch") || "DDN";

        // Resolve active branch object from _paneBranches
        const branchObj = _paneBranches.find(b => (b.BRANCH_CODE || b.CODE || "").toUpperCase() === activeBranchCode.toUpperCase()) || {
            BRANCH_CODE: activeBranchCode,
            BRANCH_NAME: `Logistics Hub (${activeBranchCode})`,
            GSTIN: "05AAACP1234A1Z5",
            STATE_CODE: "05",
            CITY: "Dehradun",
            STATE: "Uttarakhand"
        };
        const branchName = branchObj.BRANCH_NAME || branchObj.NAME || `Logistics Hub (${activeBranchCode})`;
        const branchGstin = (branchObj.GSTIN || "05AAACP1234A1Z5").trim().toUpperCase();
        let branchState = (branchObj.STATE_CODE || "").trim();
        if (!branchState && branchGstin.length >= 2 && !isNaN(branchGstin.substring(0, 2))) {
            branchState = branchGstin.substring(0, 2);
        }
        if (!branchState) branchState = "05";
        const branchStateName = branchObj.STATE || branchObj.CITY || "Uttarakhand";

        // Build Client options
        const clientOptions = _paneClients.map(c => {
            const code = (c.CODE || c.CLIENT_CODE || "").trim().toUpperCase();
            const name = c.B2B_NAME || c.NAME || c.COMPANY_NAME || code;
            const city = c.B2B_CITY || c.CITY || "";
            const gstin = (c.GSTIN || c.GST_NO || "").trim().toUpperCase();
            let stateCode = (c.GST_CODE || "").trim();
            if (!stateCode && gstin.length >= 2 && !isNaN(gstin.substring(0, 2))) {
                stateCode = gstin.substring(0, 2);
            }
            if (!stateCode) {
                const st = (c.B2B_STATE || c.STATE || "").toLowerCase();
                if (st.includes("uttarakhand") || st.includes("uttaranchal")) stateCode = "05";
                else if (st.includes("delhi")) stateCode = "07";
                else if (st.includes("uttar pradesh")) stateCode = "09";
                else stateCode = "05";
            }
            const label = city ? `${name} - ${city} (${code})` : `${name} (${code})`;
            return `<option value="${_escapeHtml(code)}" data-name="${_escapeHtml(name)}" data-city="${_escapeHtml(city)}" data-gstin="${_escapeHtml(gstin)}" data-state="${_escapeHtml(stateCode)}">${_escapeHtml(label)}</option>`;
        }).join("");

        view.innerHTML = `
            <div class="detail-card bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden font-sans">
                <!-- Action Header Bar -->
                <div class="p-5 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/80">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                NEW INVOICE
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-900 border border-blue-300">
                                Dispatch Hub: ${_escapeHtml(activeBranchCode)}
                            </span>
                        </div>
                        <h2 class="text-base font-bold text-gray-950">Create B2B Sales Invoice</h2>
                        <p class="text-xs text-gray-600">Manual sales bill with automated real-time double-entry posting to General Ledger</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" id="siCancelNewBtn" class="btn btn-sm btn-danger text-xs font-bold">✕ Cancel</button>
                        <button type="button" id="siSubmitNewBtn" class="btn btn-sm btn-green text-xs font-bold">✓ Create & Post Invoice</button>
                    </div>
                </div>

                <form id="siCreatePaneForm" class="p-6 space-y-6">
                    <!-- Top Form Grid: Customer, Date, PO Ref -->
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/80 p-4 rounded-lg border border-slate-200">
                        <!-- Customer Dropdown -->
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-gray-900 mb-1.5">
                                Customer / B2B Client <span class="text-red-600">*</span>
                            </label>
                            <select id="siNewClientSelect" required class="w-full px-3 py-2 text-xs font-semibold text-gray-950 bg-white border border-gray-300 rounded shadow-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600">
                                <option value="">— Select Customer / B2B Client (${_paneClients.length} available) —</option>
                                ${clientOptions}
                            </select>
                        </div>

                        <!-- Invoice Date -->
                        <div>
                            <label class="block text-xs font-bold text-gray-900 mb-1.5">
                                Invoice Date <span class="text-red-600">*</span>
                            </label>
                            <input type="date" id="siNewInvoiceDate" required value="${todayStr}" class="w-full px-3 py-2 text-xs font-semibold text-gray-950 bg-white border border-gray-300 rounded shadow-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600">
                        </div>

                        <!-- Client PO / Ref -->
                        <div>
                            <label class="block text-xs font-bold text-gray-900 mb-1.5">
                                Client PO / Reference #
                            </label>
                            <input type="text" id="siNewPoRef" placeholder="e.g. PO/2026/001" class="w-full px-3 py-2 text-xs font-medium text-gray-950 bg-white border border-gray-300 rounded shadow-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600">
                        </div>
                    </div>

                    <!-- Symmetrical Party Preview Card (Billed From Active Branch vs Billed To Client) -->
                    <div id="siPartyPreviewCard" class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                        <!-- Left: Billed From (Active Branch) -->
                        <div class="space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">🏢 Billed From (Active Hub)</span>
                                <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-200 text-slate-900 rounded border border-slate-300">${_escapeHtml(activeBranchCode)}</span>
                            </div>
                            <div id="siPreviewBranchName" class="font-bold text-gray-950 text-sm">${_escapeHtml(branchName)}</div>
                            <div id="siPreviewBranchGstin" class="font-mono text-gray-800 text-xs">GSTIN: ${_escapeHtml(branchGstin)}</div>
                            <div id="siPreviewBranchState" class="text-gray-700 text-xs">State: ${_escapeHtml(branchStateName)} (${_escapeHtml(branchState)})</div>
                        </div>
                        <!-- Right: Billed To (Client) -->
                        <div class="space-y-1.5 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-4">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">👤 Billed To (Customer)</span>
                                <span id="siPosBadge" class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300">Select Customer Above</span>
                            </div>
                            <div id="siPreviewClientName" class="font-bold text-gray-950 text-sm">Please select a customer above</div>
                            <div id="siPreviewClientGstin" class="font-mono text-gray-800 text-xs">GSTIN: —</div>
                            <div id="siPreviewClientState" class="text-gray-700 text-xs">Place of Supply: —</div>
                        </div>
                    </div>

                    <!-- Narration Row -->
                    <div>
                        <label class="block text-xs font-bold text-gray-900 mb-1">
                            Narration / Memo (Optional)
                        </label>
                        <input type="text" id="siNewNarration" placeholder="e.g. Courier & freight charges for monthly sales billing" class="w-full px-3 py-2 text-xs text-gray-950 bg-white border border-gray-300 rounded shadow-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600">
                    </div>

                    <!-- Line Items Section -->
                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xs font-bold text-gray-950 uppercase tracking-wider flex items-center gap-1.5">
                                <span>📦</span> Line Items & Accounting Allocation
                            </h3>
                            <button type="button" id="siPaneAddLineBtn" class="btn btn-sm btn-blue text-xs font-bold">
                                + Add Line Item
                            </button>
                        </div>
                        <div class="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                            <table class="min-w-full divide-y divide-gray-200 text-xs" id="siPaneLinesTable">
                                <thead class="bg-slate-100 text-slate-900 font-bold uppercase text-[11px]">
                                    <tr>
                                        <th class="px-3 py-2.5 text-left" style="min-width: 150px;">Description</th>
                                        <th class="px-3 py-2.5 text-left" style="min-width: 190px;">COA Revenue Account</th>
                                        <th class="px-2 py-2.5 text-center" style="width: 80px;">SAC</th>
                                        <th class="px-2 py-2.5 text-right" style="width: 70px;">Qty/Wt</th>
                                        <th class="px-2 py-2.5 text-right" style="width: 90px;">Rate (₹)</th>
                                        <th class="px-2 py-2.5 text-right" style="width: 95px;">Taxable (₹)</th>
                                        <th class="px-2 py-2.5 text-left" style="width: 120px;">GST Rate</th>
                                        <th class="px-3 py-2.5 text-right" style="width: 100px;">Total (₹)</th>
                                        <th class="px-2 py-2.5 text-center" style="width: 35px;"></th>
                                    </tr>
                                </thead>
                                <tbody id="siPaneLinesBody" class="divide-y divide-gray-200 bg-white">
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Summary & Ledger Posting Preview Card -->
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 p-4 rounded-lg border border-slate-200 gap-4">
                        <div class="text-xs text-gray-700 space-y-1.5">
                            <div class="font-bold text-gray-900">Double-Entry Ledger Impact:</div>
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-emerald-600"></span>
                                <span>Debit: <strong class="font-mono text-gray-950">1010 (Accounts Receivable - Trade Debtors)</strong></span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-blue-600"></span>
                                <span>Credit: <strong class="font-mono text-gray-950">3000 Series (Revenue)</strong> + <strong class="font-mono text-gray-950">2030 (Output GST)</strong></span>
                            </div>
                        </div>
                        <div class="w-full md:w-72 space-y-1.5 text-xs">
                            <div class="flex justify-between text-gray-800">
                                <span class="font-semibold">Taxable Subtotal:</span>
                                <span id="siPaneSubtotal" class="font-mono font-bold text-gray-950">₹0.00</span>
                            </div>
                            <div id="siPaneCgstRow" class="flex justify-between text-gray-800">
                                <span class="font-semibold">CGST:</span>
                                <span id="siPaneCgst" class="font-mono font-bold text-gray-950">₹0.00</span>
                            </div>
                            <div id="siPaneSgstRow" class="flex justify-between text-gray-800">
                                <span class="font-semibold">SGST:</span>
                                <span id="siPaneSgst" class="font-mono font-bold text-gray-950">₹0.00</span>
                            </div>
                            <div id="siPaneIgstRow" class="flex justify-between text-gray-800 hidden">
                                <span class="font-semibold">IGST:</span>
                                <span id="siPaneIgst" class="font-mono font-bold text-blue-900">₹0.00</span>
                            </div>
                            <div class="flex justify-between text-gray-700">
                                <span class="font-semibold">Round Off:</span>
                                <span id="siPaneRoundOff" class="font-mono text-gray-600">₹0.00</span>
                            </div>
                            <div class="flex justify-between text-sm font-bold text-gray-950 border-t border-gray-300 pt-2">
                                <span>Grand Total:</span>
                                <span id="siPaneGrandTotal" class="font-mono text-indigo-950 font-extrabold text-base">₹0.00</span>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        `;

        // Wire Event Listeners
        const clientSel = document.getElementById("siNewClientSelect");

        const updatePartyPreview = () => {
            const cOpt = clientSel.selectedOptions[0];
            const cCode = clientSel.value;
            const cName = cOpt?.dataset?.name || "";
            const cGstin = cOpt?.dataset?.gstin || "—";
            const cState = cOpt?.dataset?.state || "";

            const posBadge = document.getElementById("siPosBadge");
            if (!cCode) {
                document.getElementById("siPreviewClientName").textContent = "Please select a customer above";
                document.getElementById("siPreviewClientGstin").textContent = "GSTIN: —";
                document.getElementById("siPreviewClientState").textContent = "Place of Supply: —";
                if (posBadge) {
                    posBadge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300";
                    posBadge.textContent = "Select Customer Above";
                }
            } else {
                document.getElementById("siPreviewClientName").textContent = `${cName} (${cCode})`;
                document.getElementById("siPreviewClientGstin").textContent = `GSTIN: ${cGstin}`;
                document.getElementById("siPreviewClientState").textContent = `Place of Supply (State): ${cState}`;

                const isInterstate = Boolean(cState && branchState && cState !== branchState);
                if (posBadge) {
                    if (isInterstate) {
                        posBadge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300";
                        posBadge.textContent = "🌐 Inter-State Supply (IGST)";
                    } else {
                        posBadge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300";
                        posBadge.textContent = "📍 Intra-State Supply (CGST + SGST)";
                    }
                }
            }

            _recalcPaneTotals();
        };

        clientSel.addEventListener("change", updatePartyPreview);
        updatePartyPreview();

        // Line Addition
        document.getElementById("siPaneAddLineBtn").onclick = () => _addPaneLineRow();

        // Cancel Button
        document.getElementById("siCancelNewBtn").onclick = () => {
            if (_selectedInvoice) {
                _renderDetailView(_selectedInvoice);
            } else {
                VaultPage.showDetail(false);
            }
        };

        // Submit Button
        document.getElementById("siSubmitNewBtn").onclick = async () => {
            await _submitPaneInvoice();
        };

        // Add 1 default row
        _addPaneLineRow("Air Cargo Courier Services", 1, 0, "3000");
    }

    function _addPaneLineRow(desc = "Courier Services", qty = 1, rate = 0, defaultRev = "3000") {
        const tbody = document.getElementById("siPaneLinesBody");
        if (!tbody) return;

        // Build Account options
        const accOptions = _paneRevAccounts.map(a => {
            const code = a.code || a.account_code;
            const name = a.name || "";
            const mode = a.mode || "AIR";
            const isSel = (code === defaultRev) ? "selected" : "";
            return `<option value="${_escapeHtml(code)}" data-mode="${_escapeHtml(mode)}" ${isSel}>${_escapeHtml(code)} - ${_escapeHtml(name)}</option>`;
        }).join("");

        // Build Tax options
        const taxOptions = _paneTaxList.map(t => {
            const isSel = (t.id === "GST_18") ? "selected" : "";
            return `<option value="${_escapeHtml(t.id)}" data-rate="${t.rate}" data-sac="${_escapeHtml(t.sac)}" ${isSel}>${_escapeHtml(t.label)}</option>`;
        }).join("");

        const tr = document.createElement("tr");
        tr.className = "hover:bg-gray-50/80 transition";
        tr.innerHTML = `
            <td class="p-2"><input type="text" class="si-pane-desc w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded text-gray-950 font-medium bg-white focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600" value="${_escapeHtml(desc)}" placeholder="Item / Service description" required></td>
            <td class="p-2">
                <select class="si-pane-acc w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-950 font-medium focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600">
                    ${accOptions}
                </select>
            </td>
            <td class="p-2"><input type="text" class="si-pane-sac w-full px-1.5 py-1.5 text-xs font-mono border border-gray-300 rounded text-center text-gray-950 font-bold bg-white focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600" value="996812"></td>
            <td class="p-2"><input type="number" step="any" min="0.001" class="si-pane-qty w-full px-2 py-1.5 text-xs text-right border border-gray-300 rounded text-gray-950 font-semibold bg-white focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600" value="${qty}" required></td>
            <td class="p-2"><input type="number" step="any" min="0" class="si-pane-rate w-full px-2 py-1.5 text-xs text-right border border-gray-300 rounded text-gray-950 font-semibold bg-white focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600" value="${rate}" required></td>
            <td class="p-2 text-right font-mono text-xs font-bold text-gray-950 si-pane-taxable">₹0.00</td>
            <td class="p-2">
                <select class="si-pane-tax w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-950 font-medium focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600">
                    ${taxOptions}
                </select>
            </td>
            <td class="p-2 text-right font-mono text-xs font-extrabold text-gray-950 si-pane-linetot">₹0.00</td>
            <td class="p-2 text-center">
                <button type="button" class="btn btn-sm btn-danger px-2 py-0.5 text-xs font-bold" title="Remove line item">✕</button>
            </td>
        `;
        tbody.appendChild(tr);

        // Auto update SAC when changing tax option or account
        const taxSelect = tr.querySelector(".si-pane-tax");
        const sacInput = tr.querySelector(".si-pane-sac");
        taxSelect.addEventListener("change", () => {
            const opt = taxSelect.selectedOptions[0];
            if (opt?.dataset?.sac) {
                sacInput.value = opt.dataset.sac;
            }
            _recalcPaneTotals();
        });

        // Wire inputs
        tr.querySelectorAll("input, select").forEach(inp => {
            inp.addEventListener("input", _recalcPaneTotals);
        });

        // Delete button
        tr.querySelector("button").onclick = () => {
            const allRows = document.querySelectorAll("#siPaneLinesBody tr");
            if (allRows.length <= 1) {
                alert("An invoice must contain at least one line item.");
                return;
            }
            tr.remove();
            _recalcPaneTotals();
        };

        _recalcPaneTotals();
    }

    function _recalcPaneTotals() {
        const clientSel = document.getElementById("siNewClientSelect");
        const cState = clientSel?.selectedOptions[0]?.dataset?.state || "";

        const activeBranchCode = (typeof VaultPage.getActiveBranch === "function" ? VaultPage.getActiveBranch() : "") || (typeof getActiveBranch === "function" ? getActiveBranch() : "") || localStorage.getItem("vault_selected_branch") || "DDN";
        const branchObj = _paneBranches.find(b => (b.BRANCH_CODE || b.CODE || "").toUpperCase() === activeBranchCode.toUpperCase()) || {};
        let bState = (branchObj.STATE_CODE || "").trim();
        if (!bState && branchObj.GSTIN && branchObj.GSTIN.length >= 2 && !isNaN(branchObj.GSTIN.substring(0, 2))) {
            bState = branchObj.GSTIN.substring(0, 2);
        }
        if (!bState) bState = "05";

        const isInterstate = Boolean(cState && bState && cState !== bState);

        const rows = document.querySelectorAll("#siPaneLinesBody tr");
        let totalTaxable = 0;
        let totalTax = 0;

        rows.forEach(tr => {
            const qty = parseFloat(tr.querySelector(".si-pane-qty")?.value || 0);
            const rate = parseFloat(tr.querySelector(".si-pane-rate")?.value || 0);
            const taxSelect = tr.querySelector(".si-pane-tax");
            const taxRate = parseFloat(taxSelect?.selectedOptions[0]?.dataset?.rate || 0.18);

            const lineTaxable = Math.round(qty * rate * 100) / 100;
            const lineTax = Math.round(lineTaxable * taxRate * 100) / 100;
            const lineTotal = lineTaxable + lineTax;

            totalTaxable += lineTaxable;
            totalTax += lineTax;

            const taxableEl = tr.querySelector(".si-pane-taxable");
            if (taxableEl) taxableEl.textContent = `₹${lineTaxable.toFixed(2)}`;

            const totEl = tr.querySelector(".si-pane-linetot");
            if (totEl) totEl.textContent = `₹${lineTotal.toFixed(2)}`;
        });

        totalTaxable = Math.round(totalTaxable * 100) / 100;
        totalTax = Math.round(totalTax * 100) / 100;

        const subtotalEl = document.getElementById("siPaneSubtotal");
        const cgstRow = document.getElementById("siPaneCgstRow");
        const sgstRow = document.getElementById("siPaneSgstRow");
        const igstRow = document.getElementById("siPaneIgstRow");
        const cgstEl = document.getElementById("siPaneCgst");
        const sgstEl = document.getElementById("siPaneSgst");
        const igstEl = document.getElementById("siPaneIgst");
        const roundEl = document.getElementById("siPaneRoundOff");
        const grandEl = document.getElementById("siPaneGrandTotal");

        if (subtotalEl) subtotalEl.textContent = `₹${totalTaxable.toFixed(2)}`;

        if (isInterstate) {
            cgstRow?.classList.add("hidden");
            sgstRow?.classList.add("hidden");
            igstRow?.classList.remove("hidden");
            if (igstEl) igstEl.textContent = `₹${totalTax.toFixed(2)}`;
        } else {
            cgstRow?.classList.remove("hidden");
            sgstRow?.classList.remove("hidden");
            igstRow?.classList.add("hidden");
            const halfTax = Math.round(totalTax / 2 * 100) / 100;
            const remainingTax = Math.round((totalTax - halfTax) * 100) / 100;
            if (cgstEl) cgstEl.textContent = `₹${halfTax.toFixed(2)}`;
            if (sgstEl) sgstEl.textContent = `₹${remainingTax.toFixed(2)}`;
        }

        const rawGrand = totalTaxable + totalTax;
        const grandTotal = Math.round(rawGrand);
        const roundOff = Math.round((grandTotal - rawGrand) * 100) / 100;

        if (roundEl) roundEl.textContent = `${roundOff >= 0 ? "+" : ""}₹${roundOff.toFixed(2)}`;
        if (grandEl) grandEl.textContent = `₹${grandTotal.toFixed(2)}`;
    }

    async function _submitPaneInvoice() {
        const clientSel = document.getElementById("siNewClientSelect");

        const clientCode = (clientSel?.value || "").trim().toUpperCase();
        if (!clientCode) {
            alert("Please select a Customer / B2B Client from the dropdown.");
            clientSel?.focus();
            return;
        }

        const cOpt = clientSel.selectedOptions[0];
        const clientName = cOpt?.dataset?.name || clientCode;
        const clientGstin = cOpt?.dataset?.gstin || "";
        const clientState = cOpt?.dataset?.state || "05";

        const activeBranchCode = (typeof VaultPage.getActiveBranch === "function" ? VaultPage.getActiveBranch() : "") || (typeof getActiveBranch === "function" ? getActiveBranch() : "") || localStorage.getItem("vault_selected_branch") || "DDN";
        const branchObj = _paneBranches.find(b => (b.BRANCH_CODE || b.CODE || "").toUpperCase() === activeBranchCode.toUpperCase()) || {};
        const branchCode = (branchObj.BRANCH_CODE || activeBranchCode).toUpperCase();
        const branchName = branchObj.BRANCH_NAME || branchObj.NAME || `Logistics Hub (${branchCode})`;
        const branchGstin = (branchObj.GSTIN || "").trim().toUpperCase();
        let branchState = (branchObj.STATE_CODE || "").trim();
        if (!branchState && branchGstin.length >= 2 && !isNaN(branchGstin.substring(0, 2))) {
            branchState = branchGstin.substring(0, 2);
        }
        if (!branchState) branchState = "05";

        const invDate = document.getElementById("siNewInvoiceDate")?.value;
        if (!invDate) {
            alert("Please select an Invoice Date.");
            return;
        }

        const poRef = (document.getElementById("siNewPoRef")?.value || "").trim();
        const narration = (document.getElementById("siNewNarration")?.value || "").trim();

        const rows = document.querySelectorAll("#siPaneLinesBody tr");
        if (!rows.length) {
            alert("Please add at least one line item.");
            return;
        }

        const items = [];
        for (const tr of rows) {
            const desc = (tr.querySelector(".si-pane-desc")?.value || "").trim();
            if (!desc) {
                alert("Please provide a description for all line items.");
                return;
            }
            const accSel = tr.querySelector(".si-pane-acc");
            const accCode = accSel?.value || "3000";
            const mode = accSel?.selectedOptions[0]?.dataset?.mode || "AIR";
            const sac = (tr.querySelector(".si-pane-sac")?.value || "996812").trim();
            const qty = parseFloat(tr.querySelector(".si-pane-qty")?.value || 0);
            const rate = parseFloat(tr.querySelector(".si-pane-rate")?.value || 0);
            const taxRateId = tr.querySelector(".si-pane-tax")?.value || "GST_18";

            if (qty <= 0) {
                alert("Quantity must be greater than 0.");
                return;
            }

            items.push({
                description: desc,
                mode: mode,
                account_code: accCode,
                sac_code: sac,
                quantity: qty,
                rate: rate,
                tax_rate_id: taxRateId
            });
        }

        const isInterstate = Boolean(clientState && branchState && clientState !== branchState);

        const payload = {
            client_code: clientCode,
            client_gstin: clientGstin || null,
            client_state_code: clientState,
            company_state_code: branchState,
            invoice_date: invDate,
            branch_code: branchCode,
            ref_no: poRef || null,
            narration: narration || `Sales Invoice for ${clientName} (${clientCode})`,
            items: items,
            metadata: {
                client_code: clientCode,
                client_name: clientName,
                client_gstin: clientGstin,
                branch_code: branchCode,
                branch_name: branchName,
                is_interstate: isInterstate
            }
        };

        window.setLoading?.(true, "Posting Sales Invoice to Double-Entry Ledger...", "detail");
        try {
            const res = await callApi("/api/ledger/invoices", payload, "POST");
            if (res.status === "error") {
                throw new Error(res.message || "Failed to post invoice");
            }

            alert(`✅ Sales Invoice ${res.doc_no || ""} successfully created and posted to General Ledger!`);

            // Refresh invoice list in background
            await load(_filterStart, _filterEnd);

            // Automatically open the newly created invoice in the detail pane
            await _loadAndRenderDetail(res);

        } catch (err) {
            console.error("[VaultSalesInvoices submitPaneInvoice error]", err);
            alert("Failed to create invoice: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // Modal alias for backward compatibility
    function openNewInvoiceModal() {
        openNewInvoicePane();
    }

    // ── Main Data Loading ──────────────────────────────────────────────────────
    async function load(startDate = null, endDate = null) {
        _injectListPane();
        window.setLoading?.(true, "Loading sales invoices...", "list");

        try {
            const queryParts = ["limit=100"];
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);
            if (_filterStatus) queryParts.push(`status=${encodeURIComponent(_filterStatus)}`);

            const branch = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "";
            if (branch && branch.toUpperCase() !== "ALL") {
                queryParts.push(`branch_code=${encodeURIComponent(branch)}`);
            }

            const qs = queryParts.length ? `?${queryParts.join("&")}` : "";
            let res = null;

            // Primary endpoint: /api/ledger/invoices
            try {
                res = await callApi(`/api/ledger/invoices${qs}`, {}, "GET");
            } catch (ledgerErr) {
                console.warn("[VaultSalesInvoices] Primary /api/ledger/invoices failed, trying fallback:", ledgerErr);
                res = await callApi(`/api/accounting/invoices${qs}`, {}, "GET");
            }

            _allInvoices = Array.isArray(res) ? res : (res?.transactions || res?.invoices || res?.data || []);
            _renderList();

            // Do not auto-select on load — show empty placeholder until user selects
            _selectedInvoice = null;
            VaultPage.showDetail(false);
        } catch (err) {
            console.error("[VaultSalesInvoices load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) {
                msg.textContent = "Failed to load invoices: " + (err.message || err);
                msg.classList.remove("hidden");
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    return { 
        load, 
        search: _renderList,
        promptVoid,
        openNewInvoicePane,
        openNewInvoiceModal,
        recalcNewInvoice: _recalcPaneTotals
    };
})();

window.VaultSalesInvoices = VaultSalesInvoices;
