// ============================================================================
// VAULT-CREDIT-NOTES.JS — Sales Credit Notes & Double-Entry Ledger Management
// Tile: credit-notes (Native Double-Entry Ledger Engine)
// Primary Endpoint: /api/ledger/credit-notes & /api/ledger/transactions/{doc_no}
// Fallback: /api/accounting/credit-notes
// ============================================================================

const VaultCreditNotes = (() => {

    let _allCredits = [];
    let _selectedCredit = null;
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterStatus = "";

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

    function _getStatusBadge(cn) {
        const status = (cn.status || "POSTED").toUpperCase();
        if (status === "VOID" || status === "CANCELLED") {
            return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-800 border border-red-200 line-through">VOID</span>`;
        }
        if (status === "DRAFT") {
            return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">DRAFT</span>`;
        }
        return `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-900 border border-purple-200">CREDIT NOTE</span>`;
    }

    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search credit #, customer, ref, date...";
            search.oninput = () => _renderList();
        }

        // Filter button setup
        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => document.getElementById("cnFilterModal")?.classList.remove("hidden");
        }

        // Inject Filter Modal if not already present
        if (!document.getElementById("cnFilterModal")) {
            const modal = document.createElement("div");
            modal.id = "cnFilterModal";
            modal.className = "modal-overlay hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-150">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h2 class="text-base font-bold text-gray-900 flex items-center gap-2">
                            <span>🔍</span> Filter Credit Notes
                        </h2>
                        <button onclick="document.getElementById('cnFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="cnPresetCfy" class="btn btn-sm text-xs">Current FY</button>
                            <button type="button" id="cnPresetPfy" class="btn btn-sm text-xs">Previous FY</button>
                            <button type="button" id="cnPresetAll" class="btn btn-sm text-xs">All Records</button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="cnFilterStart" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="cnFilterEnd" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Status</label>
                        <select id="cnFilterStatusSelect" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                            <option value="">All Statuses (Posted & Void)</option>
                            <option value="POSTED">POSTED (Active)</option>
                            <option value="VOID">VOID (Reversed)</option>
                        </select>
                    </div>
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button id="cnFilterResetBtn" type="button" class="btn btn-sm btn-danger text-xs">Reset</button>
                        <button id="cnFilterApplyBtn" type="button" class="btn btn-sm btn-green text-xs font-bold">Apply Filter</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const now = new Date();
            const year = now.getFullYear();
            const startYear = now.getMonth() < 3 ? year - 1 : year;

            document.getElementById("cnPresetCfy").onclick = () => {
                document.getElementById("cnFilterStart").value = `${startYear}-04-01`;
                document.getElementById("cnFilterEnd").value = `${startYear + 1}-03-31`;
            };
            document.getElementById("cnPresetPfy").onclick = () => {
                document.getElementById("cnFilterStart").value = `${startYear - 1}-04-01`;
                document.getElementById("cnFilterEnd").value = `${startYear}-03-31`;
            };
            document.getElementById("cnPresetAll").onclick = () => {
                document.getElementById("cnFilterStart").value = "";
                document.getElementById("cnFilterEnd").value = "";
            };

            document.getElementById("cnFilterApplyBtn").onclick = () => {
                _filterStart = document.getElementById("cnFilterStart").value;
                _filterEnd = document.getElementById("cnFilterEnd").value;
                _filterStatus = document.getElementById("cnFilterStatusSelect").value;
                modal.classList.add("hidden");
                load(_filterStart, _filterEnd);
            };

            document.getElementById("cnFilterResetBtn").onclick = () => {
                document.getElementById("cnFilterStart").value = "";
                document.getElementById("cnFilterEnd").value = "";
                document.getElementById("cnFilterStatusSelect").value = "";
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

        const filtered = _allCredits.filter(e => {
            const num = (e.doc_no || e.number || "").toLowerCase();
            const clientName = (e.client?.name || e.metadata?.client_name || "").toLowerCase();
            const clientCode = (e.client?.code || e.metadata?.client_code || "").toLowerCase();
            const refNo = (e.ref_no || e.metadata?.original_invoice_no || "").toLowerCase();
            const dt = (e.doc_date || e.date || "").toLowerCase();
            const reason = (e.metadata?.reason || e.narration || "").toLowerCase();

            const isVoid = (e.status || "").toUpperCase() === "VOID";
            if (isVoid && (_filterStatus || "").toUpperCase() !== "VOID") {
                return false;
            }

            if (_filterStatus && (e.status || "").toUpperCase() !== _filterStatus.toUpperCase()) {
                return false;
            }

            if (!q) return true;
            return num.includes(q) || clientName.includes(q) || clientCode.includes(q) || refNo.includes(q) || dt.includes(q) || reason.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-xs py-8">No credit notes found.</li>`;
            return;
        }

        ul.innerHTML = filtered.map(e => {
            const docNo = e.doc_no || e.number || "Credit Note";
            const clientObj = e.client || {};
            const clientCode = clientObj.code || e.metadata?.client_code || "";
            const clientName = clientObj.name || e.metadata?.client_name || "Customer";
            const displayClient = clientCode ? `${clientName} (${clientCode})` : clientName;
            const dateStr = e.doc_date || e.date || "—";
            const amount = parseFloat(e.total_amount || e.amount || 0);
            const isVoid = (e.status || "").toUpperCase() === "VOID";

            return `
                <li data-docno="${_escapeHtml(docNo)}" class="p-3.5 rounded-xl cursor-pointer hover:bg-purple-50/60 border border-gray-200/80 transition-all space-y-1.5 ${isVoid ? "opacity-60 bg-gray-50/50" : ""}">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-purple-900 text-xs font-mono font-bold truncate ${isVoid ? "line-through text-red-600" : ""}">${_escapeHtml(docNo)}</strong>
                        ${_getStatusBadge(e)}
                    </div>
                    <div class="text-xs font-semibold text-gray-900 truncate">${_escapeHtml(displayClient)}</div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 pt-0.5">
                        <span>📅 ${_escapeHtml(dateStr)}</span>
                        <span class="font-bold text-purple-950 font-mono text-xs">₹${amount.toFixed(2)}</span>
                    </div>
                </li>
            `;
        }).join("");

        ul.querySelectorAll("li").forEach(li => {
            li.addEventListener("click", () => {
                ul.querySelectorAll("li").forEach(x => x.classList.remove("selected", "ring-2", "ring-purple-500"));
                li.classList.add("selected", "ring-2", "ring-purple-500");
                const docNo = li.dataset.docno;
                const item = _allCredits.find(c => (c.doc_no || c.number) === docNo);
                if (item) _loadAndRenderDetail(item);
            });
        });
    }

    async function _loadAndRenderDetail(cnSummary) {
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        view.innerHTML = `
            <div class="detail-card p-8 flex flex-col items-center justify-center text-gray-500 space-y-2">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                <div class="text-xs font-medium">Loading credit note transaction entries...</div>
            </div>
        `;

        try {
            const docNo = cnSummary.doc_no || cnSummary.number;
            const fullTxn = await callApi(`/api/ledger/transactions/${encodeURIComponent(docNo)}`, {}, "GET");
            _selectedCredit = fullTxn;
            _renderDetailView(fullTxn);
        } catch (err) {
            console.warn("[VaultCreditNotes] Failed to fetch transaction entries, using summary:", err);
            _selectedCredit = cnSummary;
            _renderDetailView(cnSummary);
        }
    }

    function _renderDetailView(cn) {
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const docNo = cn.doc_no || cn.number || "Credit Note";
        const meta = cn.metadata || {};
        const client = cn.client || {};
        const clientCode = client.code || meta.client_code || cn.ref_no || "B2B Client";
        const clientName = client.name || meta.client_name || clientCode;
        const clientAddress = client.address || meta.client_address || "";
        const clientCity = client.city || meta.client_city || "";
        const clientState = client.state || meta.client_state || "";
        const clientPincode = client.pincode || meta.client_pincode || "";
        const fullAddress = [clientAddress, clientCity, clientState, clientPincode].filter(Boolean).join(", ");
        const clientGstin = client.gstin || meta.client_gstin || "";

        const dateStr = cn.doc_date || cn.date || "—";
        const amount = parseFloat(cn.total_amount || cn.amount || 0);

        const branchObj = cn.branch || {};
        const branchCode = branchObj.code || cn.branch_code || "DDN";
        const branchName = branchObj.name || `Logistics Hub (${branchCode})`;
        const branchAddress = branchObj.address || "";
        const branchCity = branchObj.city || "";
        const branchState = branchObj.state || "";
        const branchPincode = branchObj.pincode || "";
        const fullBranchAddress = [branchAddress, branchCity, branchState, branchPincode].filter(Boolean).join(", ");
        const branchGstin = branchObj.gstin || "";
        const branchBankName = branchObj.bank_name || "";
        const branchBankAc = branchObj.bank_account || "";
        const branchBankIfsc = branchObj.bank_ifsc || "";
        const branchUpi = branchObj.upi || "";

        const origInv = meta.original_invoice_no || cn.ref_no || "—";
        const reason = meta.reason || cn.narration || "Credit Adjustment";
        const isVoid = (cn.status || "").toUpperCase() === "VOID";
        const badge = _getStatusBadge(cn);

        // Render Ledger Entries
        const entries = cn.entries || [];
        const entriesRows = entries.map(e => {
            const dr = parseFloat(e.debit || 0);
            const cr = parseFloat(e.credit || 0);
            return `
                <tr class="hover:bg-gray-50/70 border-b border-gray-100 text-xs">
                    <td class="p-2 font-mono font-bold text-gray-900">${_escapeHtml(e.account_code || "")}</td>
                    <td class="p-2 font-medium text-gray-900">${_escapeHtml(e.account_name || e.account || "")}</td>
                    <td class="p-2 text-gray-600 truncate max-w-[200px]">${_escapeHtml(e.memo || e.narration || "—")}</td>
                    <td class="p-2 text-right font-mono font-semibold text-gray-900">${dr > 0 ? "₹" + dr.toFixed(2) : "—"}</td>
                    <td class="p-2 text-right font-mono font-semibold text-gray-900">${cr > 0 ? "₹" + cr.toFixed(2) : "—"}</td>
                </tr>
            `;
        }).join("");

        view.innerHTML = `
            <div class="detail-card bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden font-sans">
                <!-- Header Card -->
                <div class="p-5 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/80">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-xs font-mono font-bold text-purple-900 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded">
                                ${_escapeHtml(docNo)}
                            </span>
                            ${badge}
                        </div>
                        <h2 class="text-base font-bold text-gray-950">${_escapeHtml(clientName)}</h2>
                        <div class="text-xs text-gray-600 flex items-center gap-3 mt-1">
                            <span>📅 Date: <strong class="text-gray-900 font-semibold">${_escapeHtml(dateStr)}</strong></span>
                            <span>🏢 Hub: <strong class="text-gray-900 font-semibold">${_escapeHtml(branchCode)}</strong></span>
                            <span>📄 Orig Invoice: <strong class="text-gray-900 font-semibold">${_escapeHtml(origInv)}</strong></span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="window.print()" class="btn btn-sm text-xs flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                            <span>Print</span>
                        </button>
                        ${!isVoid && _canManage() ? `
                            <button onclick="VaultCreditNotes.promptVoid('${_escapeHtml(docNo)}')" class="btn btn-sm btn-danger text-xs font-bold flex items-center gap-1">
                                <span>⚠️ Void Credit Note</span>
                            </button>
                        ` : ""}
                    </div>
                </div>

                <div class="p-6 space-y-6">
                    <!-- Symmetrical Party Details: Hub vs Client -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                        <!-- Dispatch Hub -->
                        <div class="space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">🏢 Dispatch Hub (Billed From)</span>
                                <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-200 text-slate-900 rounded border border-slate-300">${_escapeHtml(branchCode)}</span>
                            </div>
                            <div class="font-bold text-gray-950 text-sm">${_escapeHtml(branchName)}</div>
                            <div class="text-gray-700 text-xs">${_escapeHtml(fullBranchAddress || "Primary Logistics Hub")}</div>
                            <div class="font-mono text-gray-800 text-xs">GSTIN: ${_escapeHtml(branchGstin || "05AAACP1234A1Z5")}</div>
                            ${branchBankAc ? `
                                <div class="text-[11px] text-gray-600 border-t border-slate-200 pt-1 mt-1">
                                    <span>Bank: <strong>${_escapeHtml(branchBankName)}</strong> | A/C: <strong>${_escapeHtml(branchBankAc)}</strong> | IFSC: <strong>${_escapeHtml(branchBankIfsc)}</strong></span>
                                </div>
                            ` : ""}
                        </div>

                        <!-- Customer / Credited To -->
                        <div class="space-y-1.5 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-4">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">👤 Customer (Credited To)</span>
                                <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-purple-100 text-purple-900 rounded border border-purple-300">${_escapeHtml(clientCode)}</span>
                            </div>
                            <div class="font-bold text-gray-950 text-sm">${_escapeHtml(clientName)}</div>
                            <div class="text-gray-700 text-xs">${_escapeHtml(fullAddress || "Registered B2B Customer Address")}</div>
                            <div class="font-mono text-gray-800 text-xs">GSTIN: ${_escapeHtml(clientGstin || "Unregistered / Consumer")}</div>
                        </div>
                    </div>

                    <!-- Credit Note Details Banner -->
                    <div class="p-3.5 rounded-lg bg-purple-50/70 border border-purple-200 text-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                        <div>
                            <span class="text-[10px] font-bold uppercase tracking-wider text-purple-800 block">Credit Reason / Commercial Justification</span>
                            <span class="font-semibold text-gray-950 text-xs">${_escapeHtml(reason)}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-purple-800 block">Total Credit Amount</span>
                            <span class="font-mono font-extrabold text-purple-950 text-base">₹${amount.toFixed(2)}</span>
                        </div>
                    </div>

                    <!-- Double-Entry Transaction Ledger Entries -->
                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xs font-bold text-gray-950 uppercase tracking-wider">
                                General Ledger Financial Voucher (Double-Entry Impact)
                            </h3>
                            <span class="text-[11px] text-gray-500 font-mono">Balanced Double-Entry</span>
                        </div>
                        <div class="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                            <table class="min-w-full divide-y divide-gray-200 text-xs">
                                <thead class="bg-slate-100 text-slate-900 font-bold uppercase text-[11px]">
                                    <tr>
                                        <th class="px-3 py-2 text-left" style="width: 80px;">Account</th>
                                        <th class="px-3 py-2 text-left" style="min-width: 180px;">Account Head</th>
                                        <th class="px-3 py-2 text-left">Narration / Memo</th>
                                        <th class="px-3 py-2 text-right" style="width: 100px;">Debit (₹)</th>
                                        <th class="px-3 py-2 text-right" style="width: 100px;">Credit (₹)</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200 bg-white">
                                    ${entriesRows || `
                                        <tr>
                                            <td colspan="5" class="p-4 text-center text-gray-400">Standard posting: Dr 3080 (Sales Returns) + Dr 2030 (Output GST) | Cr 1010 (Accounts Receivable)</td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        VaultPage.showDetailPane();
    }

    // ── Void Credit Note (with 2FA Protection) ──────────────────────────────────
    async function promptVoid(docNo) {
        if (!_canManage()) {
            alert("Permission denied. Only Accountant or above can void credit notes.");
            return;
        }

        const reason = prompt(`⚠️ VOID CREDIT NOTE\n\nPlease provide a mandatory accounting audit reason for voiding ${docNo}:`);
        if (!reason || !reason.trim()) {
            if (reason !== null) alert("Void cancelled: Reason is mandatory.");
            return;
        }

        const confirmWord = prompt(`Type "VOID" to permanently void credit note ${docNo} and post reversing journal entry:`);
        if ((confirmWord || "").trim().toUpperCase() !== "VOID") {
            alert("Confirmation mismatched. Void cancelled.");
            return;
        }

        window.setLoading?.(true, "Voiding credit note & posting ledger reversal...", "detail");
        try {
            const res = await callApi(`/api/ledger/transactions/${encodeURIComponent(docNo)}/void`, { reason: reason.trim() }, "POST");
            alert(`✅ Credit note ${docNo} successfully marked VOID and balanced journal entry posted.`);
            await load(_filterStart, _filterEnd);
            if (_selectedCredit && (_selectedCredit.doc_no === docNo || _selectedCredit.number === docNo)) {
                await _loadAndRenderDetail(_selectedCredit);
            }
        } catch (err) {
            console.error("[VaultCreditNotes void error]", err);
            alert("Failed to void credit note: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── In-Pane New Credit Note Creation (View Pane, No Popups) ────────────────
    let _paneClients = [];
    let _paneBranches = [];
    let _paneRevAccounts = [];
    let _paneTaxList = [];

    async function openNewCreditNotePane() {
        if (!_canManage()) {
            alert("Permission denied. Only Accountant or above can issue credit notes.");
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
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
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
                console.warn("[VaultCreditNotes] Failed to get B2B from IDB:", e);
            }

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
                console.warn("[VaultCreditNotes] Failed to get BRANCHES from IDB:", e);
            }
            if (!branches.length) {
                branches = [
                    { BRANCH_CODE: "DDN", BRANCH_NAME: "Dehradun Hub", GSTIN: "05AAACP1234A1Z5", STATE_CODE: "05", CITY: "Dehradun", STATE: "Uttarakhand" },
                    { BRANCH_CODE: "DEL", BRANCH_NAME: "Delhi Central Hub", GSTIN: "07AAACP1234A1Z1", STATE_CODE: "07", CITY: "New Delhi", STATE: "Delhi" }
                ];
            }

            // 3. Fetch COA Accounts (Sales Returns & Revenue)
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

            if (!revAccounts.some(a => (a.code || a.account_code) === "3080")) {
                revAccounts.unshift({
                    code: "3080",
                    name: "Sales Returns and Allowances",
                    mode: "AIR"
                });
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

            _renderNewCreditNotePaneLayout();

        } catch (err) {
            console.error("[VaultCreditNotes openNewCreditNotePane error]", err);
            view.innerHTML = `
                <div class="detail-card p-8 text-center text-red-600 text-xs">
                    Failed to initialize New Credit Note form: ${_escapeHtml(err.message || err)}
                </div>
            `;
        }
    }

    function _renderNewCreditNotePaneLayout() {
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const todayStr = new Date().toISOString().split("T")[0];
        const activeBranchCode = (typeof VaultPage.getActiveBranch === "function" ? VaultPage.getActiveBranch() : "") || (typeof getActiveBranch === "function" ? getActiveBranch() : "") || localStorage.getItem("vault_selected_branch") || "DDN";

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
                            <span class="text-xs font-mono font-bold text-purple-900 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded">
                                NEW CREDIT NOTE
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-900 border border-blue-300">
                                Dispatch Hub: ${_escapeHtml(activeBranchCode)}
                            </span>
                        </div>
                        <h2 class="text-base font-bold text-gray-950">Issue Customer Credit Note</h2>
                        <p class="text-xs text-gray-600">Reverses sales revenue & Output GST with real-time AR credit reduction</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" id="cnCancelNewBtn" class="btn btn-sm btn-danger text-xs font-bold">✕ Cancel</button>
                        <button type="button" id="cnSubmitNewBtn" class="btn btn-sm btn-green text-xs font-bold">✓ Create & Post Credit Note</button>
                    </div>
                </div>

                <form id="cnCreatePaneForm" class="p-6 space-y-6">
                    <!-- Top Form Grid: Customer, Date, Original Invoice Ref -->
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/80 p-4 rounded-lg border border-slate-200">
                        <!-- Customer Dropdown -->
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-gray-900 mb-1.5">
                                Customer / B2B Client <span class="text-red-600">*</span>
                            </label>
                            <select id="cnNewClientSelect" required class="w-full px-3 py-2 text-xs font-semibold text-gray-950 bg-white border border-gray-300 rounded shadow-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600">
                                <option value="">— Select Customer / B2B Client (${_paneClients.length} available) —</option>
                                ${clientOptions}
                            </select>
                        </div>

                        <!-- Credit Note Date -->
                        <div>
                            <label class="block text-xs font-bold text-gray-900 mb-1.5">
                                Credit Note Date <span class="text-red-600">*</span>
                            </label>
                            <input type="date" id="cnNewDate" required value="${todayStr}" class="w-full px-3 py-2 text-xs font-semibold text-gray-950 bg-white border border-gray-300 rounded shadow-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600">
                        </div>

                        <!-- Original Invoice # -->
                        <div>
                            <label class="block text-xs font-bold text-gray-900 mb-1.5">
                                Original Invoice # (Ref)
                            </label>
                            <input type="text" id="cnNewOrigInv" placeholder="e.g. INV-2627-0001" class="w-full px-3 py-2 text-xs font-medium text-gray-950 bg-white border border-gray-300 rounded shadow-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600">
                        </div>
                    </div>

                    <!-- Symmetrical Party Preview Card (Active Hub vs Customer) -->
                    <div id="cnPartyPreviewCard" class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                        <!-- Left: Billed From (Active Branch) -->
                        <div class="space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">🏢 Dispatch Hub (Billed From)</span>
                                <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-200 text-slate-900 rounded border border-slate-300">${_escapeHtml(activeBranchCode)}</span>
                            </div>
                            <div id="cnPreviewBranchName" class="font-bold text-gray-950 text-sm">${_escapeHtml(branchName)}</div>
                            <div id="cnPreviewBranchGstin" class="font-mono text-gray-800 text-xs">GSTIN: ${_escapeHtml(branchGstin)}</div>
                            <div id="cnPreviewBranchState" class="text-gray-700 text-xs">State: ${_escapeHtml(branchStateName)} (${_escapeHtml(branchState)})</div>
                        </div>
                        <!-- Right: Credited To (Client) -->
                        <div class="space-y-1.5 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-4">
                            <div class="flex items-center justify-between">
                                <span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">👤 Customer (Credited To)</span>
                                <span id="cnPosBadge" class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300">Select Customer Above</span>
                            </div>
                            <div id="cnPreviewClientName" class="font-bold text-gray-950 text-sm">Please select a customer above</div>
                            <div id="cnPreviewClientGstin" class="font-mono text-gray-800 text-xs">GSTIN: —</div>
                            <div id="cnPreviewClientState" class="text-gray-700 text-xs">Place of Supply: —</div>
                        </div>
                    </div>

                    <!-- Reason Selection Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-900 mb-1.5">
                                Reason Category <span class="text-red-600">*</span>
                            </label>
                            <select id="cnNewReasonCategory" required class="w-full px-3 py-2 text-xs font-semibold text-gray-950 bg-white border border-gray-300 rounded shadow-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600">
                                <option value="Damaged Cargo / Transit Loss Claim">Damaged Cargo / Transit Loss Claim</option>
                                <option value="Rate Discrepancy / Overbilling Adjustment">Rate Discrepancy / Overbilling Adjustment</option>
                                <option value="Volume Rebate / Commercial Discount">Volume Rebate / Commercial Discount</option>
                                <option value="Service SLA Penalty / Delay Compensation">Service SLA Penalty / Delay Compensation</option>
                                <option value="Invoice Cancellation / Booking Reversal">Invoice Cancellation / Booking Reversal</option>
                                <option value="Other Commercial Adjustment">Other Commercial Adjustment</option>
                            </select>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-xs font-bold text-gray-900 mb-1.5">
                                Detailed Remarks / Audit Reason <span class="text-red-600">*</span>
                            </label>
                            <input type="text" id="cnNewReasonDetails" required placeholder="Specific explanation for this credit adjustment..." class="w-full px-3 py-2 text-xs text-gray-950 bg-white border border-gray-300 rounded shadow-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" value="Rate discrepancy and billing adjustment">
                        </div>
                    </div>

                    <!-- Line Items Section -->
                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xs font-bold text-gray-950 uppercase tracking-wider flex items-center gap-1.5">
                                <span>📦</span> Credit Note Line Items & Accounting Allocation
                            </h3>
                            <button type="button" id="cnPaneAddLineBtn" class="btn btn-sm btn-blue text-xs font-bold">
                                + Add Line Item
                            </button>
                        </div>
                        <div class="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                            <table class="min-w-full divide-y divide-gray-200 text-xs" id="cnPaneLinesTable">
                                <thead class="bg-slate-100 text-slate-900 font-bold uppercase text-[11px]">
                                    <tr>
                                        <th class="px-3 py-2.5 text-left" style="min-width: 150px;">Description</th>
                                        <th class="px-3 py-2.5 text-left" style="min-width: 190px;">COA Account Head</th>
                                        <th class="px-2 py-2.5 text-center" style="width: 80px;">SAC</th>
                                        <th class="px-2 py-2.5 text-right" style="width: 70px;">Qty</th>
                                        <th class="px-2 py-2.5 text-right" style="width: 90px;">Rate (₹)</th>
                                        <th class="px-2 py-2.5 text-right" style="width: 95px;">Taxable (₹)</th>
                                        <th class="px-2 py-2.5 text-left" style="width: 120px;">GST Rate</th>
                                        <th class="px-3 py-2.5 text-right" style="width: 100px;">Total (₹)</th>
                                        <th class="px-2 py-2.5 text-center" style="width: 35px;"></th>
                                    </tr>
                                </thead>
                                <tbody id="cnPaneLinesBody" class="divide-y divide-gray-200 bg-white">
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Summary & Ledger Posting Preview Card -->
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 p-4 rounded-lg border border-slate-200 gap-4">
                        <div class="text-xs text-gray-700 space-y-1.5">
                            <div class="font-bold text-gray-900">Double-Entry Ledger Impact:</div>
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-purple-600"></span>
                                <span>Debit: <strong class="font-mono text-gray-950">3080 (Sales Returns)</strong> + <strong class="font-mono text-gray-950">2030 (Output GST Reversal)</strong></span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-emerald-600"></span>
                                <span>Credit: <strong class="font-mono text-gray-950">1010 (Accounts Receivable - Trade Debtors)</strong></span>
                            </div>
                        </div>
                        <div class="w-full md:w-72 space-y-1.5 text-xs">
                            <div class="flex justify-between text-gray-800">
                                <span class="font-semibold">Taxable Credit:</span>
                                <span id="cnPaneSubtotal" class="font-mono font-bold text-gray-950">₹0.00</span>
                            </div>
                            <div id="cnPaneCgstRow" class="flex justify-between text-gray-800">
                                <span class="font-semibold">CGST Reversal:</span>
                                <span id="cnPaneCgst" class="font-mono font-bold text-gray-950">₹0.00</span>
                            </div>
                            <div id="cnPaneSgstRow" class="flex justify-between text-gray-800">
                                <span class="font-semibold">SGST Reversal:</span>
                                <span id="cnPaneSgst" class="font-mono font-bold text-gray-950">₹0.00</span>
                            </div>
                            <div id="cnPaneIgstRow" class="flex justify-between text-gray-800 hidden">
                                <span class="font-semibold">IGST Reversal:</span>
                                <span id="cnPaneIgst" class="font-mono font-bold text-blue-900">₹0.00</span>
                            </div>
                            <div class="flex justify-between text-gray-700">
                                <span class="font-semibold">Round Off:</span>
                                <span id="cnPaneRoundOff" class="font-mono text-gray-600">₹0.00</span>
                            </div>
                            <div class="flex justify-between text-sm font-bold text-gray-950 border-t border-gray-300 pt-2">
                                <span>Grand Credit Total:</span>
                                <span id="cnPaneGrandTotal" class="font-mono text-purple-950 font-extrabold text-base">₹0.00</span>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        `;

        // Wire Event Listeners
        const clientSel = document.getElementById("cnNewClientSelect");

        const updatePartyPreview = () => {
            const cOpt = clientSel.selectedOptions[0];
            const cCode = clientSel.value;
            const cName = cOpt?.dataset?.name || "";
            const cGstin = cOpt?.dataset?.gstin || "—";
            const cState = cOpt?.dataset?.state || "";

            const posBadge = document.getElementById("cnPosBadge");
            if (!cCode) {
                document.getElementById("cnPreviewClientName").textContent = "Please select a customer above";
                document.getElementById("cnPreviewClientGstin").textContent = "GSTIN: —";
                document.getElementById("cnPreviewClientState").textContent = "Place of Supply: —";
                if (posBadge) {
                    posBadge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300";
                    posBadge.textContent = "Select Customer Above";
                }
            } else {
                document.getElementById("cnPreviewClientName").textContent = `${cName} (${cCode})`;
                document.getElementById("cnPreviewClientGstin").textContent = `GSTIN: ${cGstin}`;
                document.getElementById("cnPreviewClientState").textContent = `Place of Supply (State): ${cState}`;

                const isInterstate = Boolean(cState && branchState && cState !== branchState);
                if (posBadge) {
                    if (isInterstate) {
                        posBadge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300";
                        posBadge.textContent = "🌐 Inter-State Supply (IGST Reversal)";
                    } else {
                        posBadge.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300";
                        posBadge.textContent = "📍 Intra-State Supply (CGST + SGST Reversal)";
                    }
                }
            }

            _recalcPaneTotals();
        };

        clientSel.addEventListener("change", updatePartyPreview);
        updatePartyPreview();

        // Line Addition
        document.getElementById("cnPaneAddLineBtn").onclick = () => _addPaneLineRow();

        // Cancel Button
        document.getElementById("cnCancelNewBtn").onclick = () => {
            if (_selectedCredit) {
                _renderDetailView(_selectedCredit);
            } else {
                VaultPage.showDetail(false);
            }
        };

        // Submit Button
        document.getElementById("cnSubmitNewBtn").onclick = async () => {
            await _submitPaneCreditNote();
        };

        // Add 1 default row
        _addPaneLineRow("Billing Adjustment / Rate Difference", 1, 0, "3080");
    }

    function _addPaneLineRow(desc = "Credit Adjustment", qty = 1, rate = 0, defaultRev = "3080") {
        const tbody = document.getElementById("cnPaneLinesBody");
        if (!tbody) return;

        // Build Account options
        const accOptions = _paneRevAccounts.map(a => {
            const code = a.code || a.account_code;
            const name = a.name || "";
            const isSel = (code === defaultRev) ? "selected" : "";
            return `<option value="${_escapeHtml(code)}" ${isSel}>${_escapeHtml(code)} - ${_escapeHtml(name)}</option>`;
        }).join("");

        // Build Tax options
        const taxOptions = _paneTaxList.map(t => {
            const isSel = (t.id === "GST_18") ? "selected" : "";
            return `<option value="${_escapeHtml(t.id)}" data-rate="${t.rate}" data-sac="${_escapeHtml(t.sac)}" ${isSel}>${_escapeHtml(t.label)}</option>`;
        }).join("");

        const tr = document.createElement("tr");
        tr.className = "hover:bg-gray-50/80 transition";
        tr.innerHTML = `
            <td class="p-2"><input type="text" class="cn-pane-desc w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded text-gray-950 font-medium bg-white focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600" value="${_escapeHtml(desc)}" placeholder="Item / Service description" required></td>
            <td class="p-2">
                <select class="cn-pane-acc w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-950 font-medium focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600">
                    ${accOptions}
                </select>
            </td>
            <td class="p-2"><input type="text" class="cn-pane-sac w-full px-1.5 py-1.5 text-xs font-mono border border-gray-300 rounded text-center text-gray-950 font-bold bg-white focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600" value="996812"></td>
            <td class="p-2"><input type="number" step="any" min="0.001" class="cn-pane-qty w-full px-1.5 py-1.5 text-xs text-right border border-gray-300 rounded text-gray-950 font-semibold bg-white focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600" value="${qty}" required></td>
            <td class="p-2"><input type="number" step="any" min="0" class="cn-pane-rate w-full px-1.5 py-1.5 text-xs text-right border border-gray-300 rounded text-gray-950 font-semibold bg-white focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600" value="${rate}" required></td>
            <td class="p-2 text-right font-mono text-xs font-bold text-gray-950 cn-pane-taxable">₹0.00</td>
            <td class="p-2">
                <select class="cn-pane-tax w-full px-1.5 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-950 font-medium focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600">
                    ${taxOptions}
                </select>
            </td>
            <td class="p-2 text-right font-mono text-xs font-extrabold text-gray-950 cn-pane-linetot">₹0.00</td>
            <td class="p-2 text-center">
                <button type="button" class="btn btn-sm btn-danger px-2 py-0.5 text-xs font-bold" title="Remove line item">✕</button>
            </td>
        `;
        tbody.appendChild(tr);

        // Auto update SAC when changing tax option
        const taxSelect = tr.querySelector(".cn-pane-tax");
        const sacInput = tr.querySelector(".cn-pane-sac");
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
            const allRows = document.querySelectorAll("#cnPaneLinesBody tr");
            if (allRows.length <= 1) {
                alert("A credit note must contain at least one line item.");
                return;
            }
            tr.remove();
            _recalcPaneTotals();
        };

        _recalcPaneTotals();
    }

    function _recalcPaneTotals() {
        const clientSel = document.getElementById("cnNewClientSelect");
        const cState = clientSel?.selectedOptions[0]?.dataset?.state || "";

        const activeBranchCode = (typeof VaultPage.getActiveBranch === "function" ? VaultPage.getActiveBranch() : "") || (typeof getActiveBranch === "function" ? getActiveBranch() : "") || localStorage.getItem("vault_selected_branch") || "DDN";
        const branchObj = _paneBranches.find(b => (b.BRANCH_CODE || b.CODE || "").toUpperCase() === activeBranchCode.toUpperCase()) || {};
        let bState = (branchObj.STATE_CODE || "").trim();
        if (!bState && branchObj.GSTIN && branchObj.GSTIN.length >= 2 && !isNaN(branchObj.GSTIN.substring(0, 2))) {
            bState = branchObj.GSTIN.substring(0, 2);
        }
        if (!bState) bState = "05";

        const isInterstate = Boolean(cState && bState && cState !== bState);

        const rows = document.querySelectorAll("#cnPaneLinesBody tr");
        let totalTaxable = 0;
        let totalTax = 0;

        rows.forEach(tr => {
            const qty = parseFloat(tr.querySelector(".cn-pane-qty")?.value || 0);
            const rate = parseFloat(tr.querySelector(".cn-pane-rate")?.value || 0);
            const taxSelect = tr.querySelector(".cn-pane-tax");
            const taxRate = parseFloat(taxSelect?.selectedOptions[0]?.dataset?.rate || 0.18);

            const lineTaxable = Math.round(qty * rate * 100) / 100;
            const lineTax = Math.round(lineTaxable * taxRate * 100) / 100;
            const lineTotal = lineTaxable + lineTax;

            totalTaxable += lineTaxable;
            totalTax += lineTax;

            const taxableEl = tr.querySelector(".cn-pane-taxable");
            if (taxableEl) taxableEl.textContent = `₹${lineTaxable.toFixed(2)}`;

            const totEl = tr.querySelector(".cn-pane-linetot");
            if (totEl) totEl.textContent = `₹${lineTotal.toFixed(2)}`;
        });

        totalTaxable = Math.round(totalTaxable * 100) / 100;
        totalTax = Math.round(totalTax * 100) / 100;

        const subtotalEl = document.getElementById("cnPaneSubtotal");
        const cgstRow = document.getElementById("cnPaneCgstRow");
        const sgstRow = document.getElementById("cnPaneSgstRow");
        const igstRow = document.getElementById("cnPaneIgstRow");
        const cgstEl = document.getElementById("cnPaneCgst");
        const sgstEl = document.getElementById("cnPaneSgst");
        const igstEl = document.getElementById("cnPaneIgst");
        const roundEl = document.getElementById("cnPaneRoundOff");
        const grandEl = document.getElementById("cnPaneGrandTotal");

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

    async function _submitPaneCreditNote() {
        const clientSel = document.getElementById("cnNewClientSelect");

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

        const docDate = document.getElementById("cnNewDate")?.value;
        if (!docDate) {
            alert("Please select a Credit Note Date.");
            return;
        }

        const origInv = (document.getElementById("cnNewOrigInv")?.value || "").trim();
        const reasonCategory = document.getElementById("cnNewReasonCategory")?.value || "Commercial Adjustment";
        const reasonDetails = (document.getElementById("cnNewReasonDetails")?.value || "").trim();
        const fullReason = reasonDetails ? `${reasonCategory} — ${reasonDetails}` : reasonCategory;

        const rows = document.querySelectorAll("#cnPaneLinesBody tr");
        if (!rows.length) {
            alert("Please add at least one line item.");
            return;
        }

        let totalTaxable = 0;
        let primaryTaxRateId = "GST_18";
        const items = [];

        for (const tr of rows) {
            const desc = (tr.querySelector(".cn-pane-desc")?.value || "").trim();
            if (!desc) {
                alert("Please provide a description for all line items.");
                return;
            }
            const accSel = tr.querySelector(".cn-pane-acc");
            const accCode = accSel?.value || "3080";
            const sac = (tr.querySelector(".cn-pane-sac")?.value || "996812").trim();
            const qty = parseFloat(tr.querySelector(".cn-pane-qty")?.value || 0);
            const rate = parseFloat(tr.querySelector(".cn-pane-rate")?.value || 0);
            const taxRateId = tr.querySelector(".cn-pane-tax")?.value || "GST_18";

            if (qty <= 0) {
                alert("Quantity must be greater than 0.");
                return;
            }

            const lineTaxable = Math.round(qty * rate * 100) / 100;
            totalTaxable += lineTaxable;
            primaryTaxRateId = taxRateId;

            items.push({
                description: desc,
                account_code: accCode,
                sac_code: sac,
                quantity: qty,
                rate: rate,
                taxable: lineTaxable,
                tax_rate_id: taxRateId
            });
        }

        if (totalTaxable <= 0) {
            alert("Credit Note taxable amount must be greater than 0.");
            return;
        }

        const isInterstate = Boolean(clientState && branchState && clientState !== branchState);

        const payload = {
            client_code: clientCode,
            original_invoice_no: origInv || null,
            taxable_amount: totalTaxable,
            tax_rate_id: primaryTaxRateId,
            client_state_code: clientState,
            company_state_code: branchState,
            doc_date: docDate,
            branch_code: branchCode,
            reason: fullReason,
            metadata: {
                client_code: clientCode,
                client_name: clientName,
                client_gstin: clientGstin,
                branch_code: branchCode,
                branch_name: branchName,
                original_invoice_no: origInv || "",
                is_interstate: isInterstate,
                items: items
            }
        };

        window.setLoading?.(true, "Posting Credit Note to Double-Entry Ledger...", "detail");
        try {
            const res = await callApi("/api/ledger/credit-notes", payload, "POST");
            if (res.status === "error") {
                throw new Error(res.message || "Failed to post credit note");
            }

            alert(`✅ Credit Note ${res.doc_no || ""} successfully created and posted to General Ledger!`);

            // Refresh credit notes list
            await load(_filterStart, _filterEnd);

            // Automatically open newly created credit note in detail pane
            await _loadAndRenderDetail(res);

        } catch (err) {
            console.error("[VaultCreditNotes submitPaneCreditNote error]", err);
            alert("Failed to create credit note: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // Modal alias for backward compatibility
    function openNewCreditNoteModal() {
        openNewCreditNotePane();
    }

    // ── Main Data Loading ──────────────────────────────────────────────────────
    async function load(startDate = null, endDate = null) {
        _injectListPane();
        window.setLoading?.(true, "Loading credit notes...", "list");

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

            // Primary endpoint: /api/ledger/credit-notes
            try {
                res = await callApi(`/api/ledger/credit-notes${qs}`, {}, "GET");
            } catch (ledgerErr) {
                console.warn("[VaultCreditNotes] Primary endpoint failed, falling back to shim:", ledgerErr);
                res = await callApi(`/api/accounting/credit-notes${qs}`, {}, "GET");
            }

            _allCredits = Array.isArray(res) ? res : (res?.credit_notes || res?.transactions || res?.data || []);
            _renderList();

            // Do not auto-select on load — show empty placeholder until user selects
            _selectedCredit = null;
            VaultPage.showDetail(false);
        } catch (err) {
            console.error("[VaultCreditNotes load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) {
                msg.textContent = "Failed to load credit notes: " + (err.message || err);
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
        openNewCreditNotePane,
        openNewCreditNoteModal,
        recalcNewCreditNote: _recalcPaneTotals
    };
})();

window.VaultCreditNotes = VaultCreditNotes;
