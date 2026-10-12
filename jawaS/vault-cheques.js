// ============================================================================
// VAULT-CHEQUES.JS — Cheques & Post-Dated Cheques (PDC) Register
// Tile: cheques (💳 / 🏦)
// Architecture:
// 1. Sourcing: Customers from IDB 'B2B', Vendors from IDB 'CARRIERS' + 'B2B'.
// 2. Auto-binds Active Branch: getActiveBranch() (no branch selector in form).
// 3. In-Pane Creation: Renders directly in view pane (no modal popups).
// 4. Cheque Lifecycle:
//    - RECEIVED / ISSUED: Instrument registered, PDC held in custody.
//    - DEPOSITED: Handed over to bank for clearing.
//    - CLEARED: Realized in bank &rarr; Auto-posts double-entry transaction:
//        * Inward: Dr Bank (1020) & Cr Customer AR (1010)
//        * Outward: Dr Vendor AP (2000) & Cr Bank (1020)
//    - BOUNCED / DISHONOURED: Marked bounced & reverses ledger entry.
//    - CANCELLED: Voided instrument.
// 5. Global button standards: .btn, .btn-sm, .btn-blue, .btn-secondary, .btn-danger.
// 6. High-contrast typography: text-gray-950, font-mono.
// ============================================================================

const VaultCheques = (() => {

    let _allCheques = [];
    let _activeCheque = null;
    let _directionFilter = "ALL"; // 'ALL', 'INWARD', 'OUTWARD', 'PDC'
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterStatus = "";

    // In-Pane Form Sourced State
    let _paneClients = [];
    let _paneSuppliers = [];

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

    function _getAuthHeaders() {
        const token = _getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    function _getStatusBadge(status) {
        const s = (status || "RECEIVED").toUpperCase();
        const badges = {
            "RECEIVED": '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">RECEIVED</span>',
            "ISSUED": '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-200">ISSUED</span>',
            "DEPOSITED": '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">DEPOSITED</span>',
            "CLEARED": '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">CLEARED</span>',
            "BOUNCED": '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-800 border border-red-200">BOUNCED</span>',
            "CANCELLED": '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-200">CANCELLED</span>'
        };
        return badges[s] || `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-800">${s}</span>`;
    }

    // ── Setup Left List Pane ────────────────────────────────────────────────
    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";

        if (search) {
            search.placeholder = "Search cheque #, party, bank, ref...";
            search.oninput = () => _renderList();
        }

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => document.getElementById("chqFilterModal")?.classList.remove("hidden");
        }

        // Direction / PDC Filter Toolbar
        let filterBar = document.getElementById("chqDirectionFilterBar");
        if (!filterBar) {
            filterBar = document.createElement("div");
            filterBar.id = "chqDirectionFilterBar";
            filterBar.className = "p-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-1 text-[11px] font-bold";
            filterBar.innerHTML = `
                <button type="button" data-dir="ALL" class="chq-tab px-2 py-1 rounded text-blue-700 bg-blue-100 border border-blue-200">All</button>
                <button type="button" data-dir="INWARD" class="chq-tab px-2 py-1 rounded text-gray-600 hover:bg-gray-200">📥 Inward</button>
                <button type="button" data-dir="OUTWARD" class="chq-tab px-2 py-1 rounded text-gray-600 hover:bg-gray-200">📤 Outward</button>
                <button type="button" data-dir="PDC" class="chq-tab px-2 py-1 rounded text-gray-600 hover:bg-gray-200">⏳ PDC</button>
            `;
            const listParent = list?.parentElement;
            if (listParent && list) {
                listParent.insertBefore(filterBar, list);
            }

            filterBar.querySelectorAll(".chq-tab").forEach(tab => {
                tab.onclick = () => {
                    filterBar.querySelectorAll(".chq-tab").forEach(t => {
                        t.className = "chq-tab px-2 py-1 rounded text-gray-600 hover:bg-gray-200";
                    });
                    tab.className = "chq-tab px-2 py-1 rounded text-blue-700 bg-blue-100 border border-blue-200";
                    _directionFilter = tab.dataset.dir;
                    _renderList();
                };
            });
        }

        if (!document.getElementById("chqFilterModal")) {
            const modal = document.createElement("div");
            modal.id = "chqFilterModal";
            modal.className = "modal-overlay hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-150">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h2 class="text-base font-bold text-gray-950 flex items-center gap-2">
                            <span>🔍</span> Filter Cheques &amp; PDC
                        </h2>
                        <button onclick="document.getElementById('chqFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="chqPresetCfy" class="btn btn-sm btn-secondary">Current FY</button>
                            <button type="button" id="chqPresetPfy" class="btn btn-sm btn-secondary">Previous FY</button>
                            <button type="button" id="chqPresetAll" class="btn btn-sm btn-secondary">All Records</button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="chqFilterStart" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-mono">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="chqFilterEnd" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-mono">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Status</label>
                        <select id="chqFilterStatus" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900">
                            <option value="">All Statuses</option>
                            <option value="RECEIVED">Received / Issued (PDC Hold)</option>
                            <option value="DEPOSITED">Deposited in Bank</option>
                            <option value="CLEARED">Cleared / Honoured</option>
                            <option value="BOUNCED">Bounced / Dishonoured</option>
                            <option value="CANCELLED">Cancelled</option>
                        </select>
                    </div>
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button id="chqFilterResetBtn" type="button" class="btn btn-sm btn-danger">Reset</button>
                        <button id="chqFilterApplyBtn" type="button" class="btn btn-sm btn-blue">Apply Filter</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const now = new Date();
            const year = now.getFullYear();
            const startYear = now.getMonth() < 3 ? year - 1 : year;

            document.getElementById("chqPresetCfy").onclick = () => {
                document.getElementById("chqFilterStart").value = `${startYear}-04-01`;
                document.getElementById("chqFilterEnd").value = `${startYear + 1}-03-31`;
            };
            document.getElementById("chqPresetPfy").onclick = () => {
                document.getElementById("chqFilterStart").value = `${startYear - 1}-04-01`;
                document.getElementById("chqFilterEnd").value = `${startYear}-03-31`;
            };
            document.getElementById("chqPresetAll").onclick = () => {
                document.getElementById("chqFilterStart").value = "";
                document.getElementById("chqFilterEnd").value = "";
            };

            document.getElementById("chqFilterApplyBtn").onclick = () => {
                _filterStart = document.getElementById("chqFilterStart").value;
                _filterEnd = document.getElementById("chqFilterEnd").value;
                _filterStatus = document.getElementById("chqFilterStatus").value;
                modal.classList.add("hidden");
                load(_filterStart, _filterEnd);
            };

            document.getElementById("chqFilterResetBtn").onclick = () => {
                document.getElementById("chqFilterStart").value = "";
                document.getElementById("chqFilterEnd").value = "";
                document.getElementById("chqFilterStatus").value = "";
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

    // ── Render List Items ───────────────────────────────────────────────────
    function _renderList() {
        const ul = document.getElementById("vaultList");
        if (!ul) return;

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _allCheques.filter(chq => {
            // Direction / PDC Filter Tab
            if (_directionFilter === "INWARD" && chq.cheque_type !== "INWARD") return false;
            if (_directionFilter === "OUTWARD" && chq.cheque_type !== "OUTWARD") return false;
            if (_directionFilter === "PDC" && !chq.is_pdc) return false;

            // Status Filter Modal
            if (_filterStatus) {
                const s = (chq.status || "").toUpperCase();
                if (s !== _filterStatus) return false;
            }

            if (!q) return true;
            const chqNo = (chq.cheque_no || "").toLowerCase();
            const party = (chq.party_name || chq.party_code || "").toLowerCase();
            const bank = (chq.bank_name || "").toLowerCase();
            const narr = (chq.narration || "").toLowerCase();
            const dt = (chq.cheque_date || "").toLowerCase();
            const doc = (chq.linked_doc_no || "").toLowerCase();

            return chqNo.includes(q) || party.includes(q) || bank.includes(q) || narr.includes(q) || dt.includes(q) || doc.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `
                <li class="text-center text-gray-500 text-xs py-8">
                    <i class="fa-solid fa-money-check-dollar text-gray-300 text-3xl mb-2 block"></i>
                    No cheque instruments found matching criteria.
                </li>
            `;
            return;
        }

        ul.innerHTML = filtered.map(chq => {
            const chqNo = chq.cheque_no || "N/A";
            const partyName = chq.party_name || chq.party_code || "Party";
            const dateStr = _fmtDate(chq.cheque_date);
            const amount = parseFloat(chq.amount || 0);
            const badge = _getStatusBadge(chq.status);
            const isInward = (chq.cheque_type || "INWARD").toUpperCase() === "INWARD";
            const isPdc = chq.is_pdc === 1 || chq.is_pdc === true;
            const isSelected = _activeCheque && _activeCheque.id === chq.id;

            return `
                <li data-id="${chq.id}" 
                    class="p-3.5 rounded-xl cursor-pointer border transition-all duration-150 ${isSelected ? 'bg-indigo-50/80 border-indigo-400 shadow-sm' : 'bg-white hover:bg-gray-50 border-gray-200'}">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="font-mono font-bold text-xs text-gray-950 flex items-center gap-1.5">
                            <i class="fa-solid fa-money-check-dollar ${isInward ? 'text-blue-600' : 'text-purple-600'}"></i>
                            CHQ #${_escapeHtml(chqNo)}
                        </span>
                        <div class="flex items-center gap-1">
                            ${isPdc ? '<span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-900 border border-amber-200 font-mono">PDC</span>' : ''}
                            ${badge}
                        </div>
                    </div>
                    <div class="text-xs font-bold text-gray-900 truncate mb-1">
                        ${_escapeHtml(partyName)}
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 font-mono mb-1.5">
                        <span class="text-gray-600 truncate max-w-[140px]">${_escapeHtml(chq.bank_name || 'Bank')}</span>
                        <span class="text-[10px] font-bold ${isInward ? 'text-blue-700' : 'text-purple-700'}">${isInward ? '📥 INWARD' : '📤 OUTWARD'}</span>
                    </div>
                    <div class="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                        <span class="text-gray-500 text-[11px]">📅 ${dateStr}</span>
                        <span class="font-mono font-extrabold text-indigo-900 text-sm">${_fmtMoney(amount)}</span>
                    </div>
                </li>
            `;
        }).join("");

        ul.querySelectorAll("li").forEach(li => {
            li.addEventListener("click", () => {
                ul.querySelectorAll("li").forEach(x => {
                    x.classList.remove("bg-indigo-50/80", "border-indigo-400", "shadow-sm");
                    x.classList.add("bg-white", "border-gray-200");
                });
                li.classList.add("bg-indigo-50/80", "border-indigo-400", "shadow-sm");
                li.classList.remove("bg-white", "border-gray-200");

                const id = parseInt(li.dataset.id, 10);
                const chq = _allCheques.find(c => c.id === id);
                if (chq) {
                    _activeCheque = chq;
                    _renderDetail(chq);
                }
            });
        });
    }

    // ── Render Detail View Pane ─────────────────────────────────────────────
    async function _renderDetail(chq) {
        if (!chq) return;
        _activeCheque = chq;
        VaultPage.showDetail(true);

        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const chqNo = chq.cheque_no || "N/A";
        const dateStr = _fmtDate(chq.cheque_date);
        const amount = parseFloat(chq.amount || 0);
        const status = (chq.status || "RECEIVED").toUpperCase();
        const isInward = (chq.cheque_type || "INWARD").toUpperCase() === "INWARD";
        const isPdc = chq.is_pdc === 1 || chq.is_pdc === true;
        const branchCode = chq.branch_code || "DDN";
        const bankName = chq.bank_name || "Bank";
        const depositAccount = chq.deposit_account || "PUNB0410";
        const linkedDocNo = chq.linked_doc_no || "";

        const partyName = chq.party_name || chq.party_code || "Party";
        const partyCode = chq.party_code || "";
        const partyType = chq.party_type || (isInward ? "CLIENT" : "VENDOR");
        const partyGstin = chq.party?.gstin || "";
        const partyCity = chq.party?.city || "";
        const partyState = chq.party?.state || "";

        // Calculate Days Until Maturity for PDC
        let pdcNoticeHtml = "";
        if (isPdc && status !== "CLEARED" && status !== "BOUNCED" && status !== "CANCELLED") {
            const chqDateObj = new Date(chq.cheque_date);
            const now = new Date();
            const diffDays = Math.ceil((chqDateObj - now) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
                pdcNoticeHtml = `
                    <div class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs flex items-center justify-between">
                        <span class="font-bold text-amber-950 flex items-center gap-1.5">
                            <i class="fa-solid fa-clock text-amber-600"></i>
                            Post-Dated Instrument (PDC) — Maturing in ${diffDays} day(s) on ${dateStr}
                        </span>
                        <span class="text-[10px] font-mono font-bold bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded">
                            VAULT CUSTODY
                        </span>
                    </div>
                `;
            } else {
                pdcNoticeHtml = `
                    <div class="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs flex items-center justify-between">
                        <span class="font-bold text-blue-950 flex items-center gap-1.5">
                            <i class="fa-solid fa-bell text-blue-600 animate-bounce"></i>
                            PDC Matured! Cheque is due for deposit &amp; clearing today.
                        </span>
                        <button onclick="VaultCheques.clearCheque(${chq.id})" class="btn btn-sm btn-blue">
                            Clear Now
                        </button>
                    </div>
                `;
            }
        }

        view.innerHTML = `
            <div class="space-y-5 animate-in fade-in duration-150">
                <!-- Header Action Bar -->
                <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center flex-wrap gap-2">
                            <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${isInward ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-purple-100 text-purple-800 border-purple-200'} rounded border">
                                <i class="fa-solid ${isInward ? 'fa-arrow-down' : 'fa-arrow-up'} mr-1"></i>
                                ${isInward ? "CUSTOMER CHEQUE (INWARD)" : "VENDOR CHEQUE (OUTWARD)"}
                            </span>
                            ${_getStatusBadge(status)}
                            ${isPdc ? '<span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-100 text-amber-900 rounded border border-amber-200">PDC</span>' : ''}
                            <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">
                                BRANCH: ${_escapeHtml(branchCode)}
                            </span>
                        </div>
                        <h1 class="text-xl font-black text-gray-950 font-mono">CHQ #${_escapeHtml(chqNo)}</h1>
                        <p class="text-xs text-gray-500 font-mono">
                            Cheque Date: <span class="font-bold text-gray-800">${dateStr}</span> · 
                            Drawer Bank: <span class="font-bold text-indigo-900">${_escapeHtml(bankName)}</span>
                        </p>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                        <button type="button" id="chqNewBtn" class="btn btn-sm btn-blue flex items-center gap-1.5">
                            <i class="fa-solid fa-plus"></i> Record Cheque
                        </button>
                        <button type="button" onclick="window.print()" class="btn btn-sm btn-secondary flex items-center gap-1.5">
                            <i class="fa-solid fa-print"></i> Print Slip
                        </button>

                        <!-- State Transitions -->
                        ${(status === "RECEIVED" || status === "ISSUED") ? `
                            <button type="button" onclick="VaultCheques.depositCheque(${chq.id})" class="btn btn-sm btn-secondary text-amber-700 hover:bg-amber-50">
                                📥 Mark Deposited
                            </button>
                            <button type="button" onclick="VaultCheques.clearCheque(${chq.id})" class="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white">
                                ✓ Mark Cleared
                            </button>
                            <button type="button" onclick="VaultCheques.bounceCheque(${chq.id})" class="btn btn-sm btn-danger">
                                ✕ Mark Bounced
                            </button>
                        ` : ''}

                        ${status === "DEPOSITED" ? `
                            <button type="button" onclick="VaultCheques.clearCheque(${chq.id})" class="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white">
                                ✓ Mark Cleared
                            </button>
                            <button type="button" onclick="VaultCheques.bounceCheque(${chq.id})" class="btn btn-sm btn-danger">
                                ✕ Mark Bounced
                            </button>
                        ` : ''}

                        ${status === "CLEARED" ? `
                            <button type="button" onclick="VaultCheques.bounceCheque(${chq.id})" class="btn btn-sm btn-danger">
                                ⚠️ Mark Bounced &amp; Reverse
                            </button>
                        ` : ''}
                    </div>
                </div>

                ${pdcNoticeHtml}

                <!-- 2-Column Master Information Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Party Information Card -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid ${isInward ? 'fa-user' : 'fa-truck-ramp-box'} text-blue-600 mr-1.5"></i> ${isInward ? "Drawer (Customer)" : "Payee (Vendor / Supplier)"}</span>
                            ${partyCode ? `<span class="font-mono text-blue-700 font-bold">CODE: ${_escapeHtml(partyCode)}</span>` : ''}
                        </div>
                        <div class="space-y-1.5">
                            <h3 class="text-base font-extrabold text-gray-950">${_escapeHtml(partyName)}</h3>
                            ${partyGstin ? `<p class="text-xs font-mono text-gray-600"><span class="text-gray-400 font-bold">GSTIN:</span> ${_escapeHtml(partyGstin)}</p>` : ''}
                            ${(partyCity || partyState) ? `<p class="text-xs text-gray-600"><span class="text-gray-400 font-bold">Location:</span> ${_escapeHtml([partyCity, partyState].filter(Boolean).join(", "))}</p>` : ''}
                        </div>
                        <div class="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                            <span class="text-gray-500">GL Sub-Ledger:</span>
                            <span class="font-mono font-bold text-gray-800">${isInward ? "#1010 (Accounts Receivable)" : "#2000 (Accounts Payable)"}</span>
                        </div>
                    </div>

                    <!-- Cheque Instrument & Banking Card -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid fa-landmark text-indigo-600 mr-1.5"></i> Banking &amp; Clearing Details</span>
                            <span class="font-mono font-bold text-indigo-900">${_escapeHtml(bankName)}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block">Cheque Number</span>
                                <span class="font-mono font-bold text-gray-950">${_escapeHtml(chqNo)}</span>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block">${isInward ? "Deposit Bank Account" : "Drawn From Account"}</span>
                                <span class="font-mono font-bold text-gray-950">${_escapeHtml(depositAccount)} (Bank Sub-Ledger)</span>
                            </div>
                        </div>
                        ${linkedDocNo ? `
                            <div class="p-2 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center justify-between text-xs">
                                <span class="font-bold text-emerald-900"><i class="fa-solid fa-file-invoice text-emerald-600 mr-1"></i> Linked GL Posting:</span>
                                <span class="font-mono font-bold text-emerald-800">${_escapeHtml(linkedDocNo)}</span>
                            </div>
                        ` : ''}
                        ${chq.bounce_reason ? `
                            <div class="p-2 bg-red-50 rounded-lg border border-red-200 text-xs text-red-800 space-y-0.5">
                                <span class="font-bold block"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Dishonour / Bounce Reason:</span>
                                <p class="font-mono">${_escapeHtml(chq.bounce_reason)}</p>
                            </div>
                        ` : ''}
                        <div class="pt-2 border-t border-gray-100 flex items-center justify-between">
                            <span class="text-xs font-bold text-gray-600 uppercase">Instrument Amount:</span>
                            <span class="text-xl font-mono font-black text-indigo-950">${_fmtMoney(amount)}</span>
                        </div>
                    </div>
                </div>

                ${chq.narration ? `
                    <div class="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs flex items-start gap-2">
                        <i class="fa-solid fa-message text-gray-400 mt-0.5"></i>
                        <div>
                            <span class="font-bold text-gray-700">Narration / Memo:</span>
                            <p class="text-gray-800 mt-0.5 font-medium">${_escapeHtml(chq.narration)}</p>
                        </div>
                    </div>
                ` : ''}

                <!-- Double-Entry General Ledger Status Card -->
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div class="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                        <h2 class="text-xs font-extrabold uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                            <i class="fa-solid fa-scale-balanced text-indigo-600"></i> Double-Entry General Ledger Status
                        </h2>
                        <span class="text-[11px] font-mono text-gray-500">${linkedDocNo ? `Doc: ${_escapeHtml(linkedDocNo)}` : 'Custody Float'}</span>
                    </div>

                    <div id="chqAuditContainer" class="p-4">
                        ${linkedDocNo ? `
                            <div class="p-6 text-center text-gray-400 text-xs">
                                <div class="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                Loading posted general ledger entries from ${linkedDocNo}...
                            </div>
                        ` : `
                            <div class="p-6 text-center text-gray-500 text-xs space-y-1">
                                <i class="fa-solid fa-shield-halved text-indigo-500 text-2xl mb-1 block"></i>
                                <p class="font-bold text-gray-800">Instrument Held in Vault Custody</p>
                                <p class="text-gray-500">General Ledger entries (${isInward ? 'Dr Bank 3001:' + _escapeHtml(depositAccount) + ' / Cr AR 1010' : 'Dr AP 2000 / Cr Bank 3001:' + _escapeHtml(depositAccount)}) will be automatically posted upon bank clearing.</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;

        document.getElementById("chqNewBtn").onclick = () => openAddPane();

        // If cleared and linked to a doc_no, fetch and display the GL lines
        if (linkedDocNo) {
            _fetchAndRenderGlAudit(linkedDocNo);
        }
    }

    // ── Fetch & Render Double-Entry GL Audit Lines ──────────────────────────
    async function _fetchAndRenderGlAudit(docNo) {
        const container = document.getElementById("chqAuditContainer");
        if (!container) return;

        try {
            const res = await fetch(`/api/ledger/transactions/${encodeURIComponent(docNo)}`, {
                headers: _getAuthHeaders()
            });

            if (res.ok) {
                const data = await res.json();
                const entries = data.entries || [];
                if (entries.length > 0) {
                    let totalDr = 0;
                    let totalCr = 0;

                    const rowsHtml = entries.map((e, idx) => {
                        const dr = Number(e.debit || 0);
                        const cr = Number(e.credit || 0);
                        totalDr += dr;
                        totalCr += cr;

                        return `
                            <tr class="hover:bg-gray-50/60 transition-colors">
                                <td class="px-4 py-2.5 text-center text-xs text-gray-400 font-mono">${idx + 1}</td>
                                <td class="px-4 py-2.5 text-xs font-mono font-bold text-gray-900">${_escapeHtml(e.account_code)}</td>
                                <td class="px-4 py-2.5 text-xs font-semibold text-gray-900">${_escapeHtml(e.account_name || '—')}</td>
                                <td class="px-4 py-2.5 text-xs text-gray-600 font-mono">${_escapeHtml(e.memo || '—')}</td>
                                <td class="px-4 py-2.5 text-xs text-right font-mono font-bold ${dr > 0 ? 'text-gray-950' : 'text-gray-400'}">
                                    ${dr > 0 ? _fmtMoney(dr) : '—'}
                                </td>
                                <td class="px-4 py-2.5 text-xs text-right font-mono font-bold ${cr > 0 ? 'text-gray-950' : 'text-gray-400'}">
                                    ${cr > 0 ? _fmtMoney(cr) : '—'}
                                </td>
                            </tr>
                        `;
                    }).join("");

                    container.innerHTML = `
                        <div class="overflow-x-auto rounded-lg border border-gray-200">
                            <table class="w-full text-left text-xs border-collapse">
                                <thead class="bg-gray-100 text-gray-700 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                                    <tr>
                                        <th class="px-4 py-2 text-center w-12">#</th>
                                        <th class="px-4 py-2 w-28">GL Code</th>
                                        <th class="px-4 py-2">Account Title</th>
                                        <th class="px-4 py-2">Narration / Memo</th>
                                        <th class="px-4 py-2 text-right w-32">Debit (Dr)</th>
                                        <th class="px-4 py-2 text-right w-32">Credit (Cr)</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 bg-white">
                                    ${rowsHtml}
                                </tbody>
                                <tfoot class="bg-gray-50 border-t-2 border-gray-300 font-mono font-bold text-xs">
                                    <tr>
                                        <td colspan="4" class="px-4 py-2.5 text-right uppercase text-gray-600 font-sans">
                                            Total Cleared Balance:
                                        </td>
                                        <td class="px-4 py-2.5 text-right text-gray-950">${_fmtMoney(totalDr)}</td>
                                        <td class="px-4 py-2.5 text-right text-gray-950">${_fmtMoney(totalCr)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
                    return;
                }
            }
        } catch (e) {
            console.warn("[VaultCheques] Could not load GL audit:", e);
        }

        container.innerHTML = `<p class="text-xs text-gray-500 italic p-4 text-center">Posted to ledger under document ${docNo}.</p>`;
    }

    // ── In-Pane Creation Form ───────────────────────────────────────────────
    async function openAddPane(presetType = "INWARD", presetPartyCode = "") {
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const branchCode = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "DDN";
        const today = new Date().toISOString().split("T")[0];

        view.innerHTML = `
            <div class="p-8 text-center text-gray-500 text-xs space-y-2">
                <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p>Loading parties and banking master...</p>
            </div>
        `;

        try {
            // 1. Load Clients (IDB B2B)
            let clients = [];
            try {
                if (typeof getAppData === "function") {
                    const rawB2B = await getAppData("B2B");
                    clients = Object.values(rawB2B || {}).filter(c => c && (c.CODE || c.CLIENT_CODE));
                }
            } catch (_) {}
            if (!clients.length) {
                try {
                    const r = await fetch("/api/accounting/clients", { headers: _getAuthHeaders() });
                    if (r.ok) {
                        const data = await r.json();
                        clients = Array.isArray(data) ? data : (data.clients || []);
                    }
                } catch (_) {}
            }
            clients.sort((a, b) => (a.B2B_NAME || a.NAME || a.CODE || "").localeCompare(b.B2B_NAME || b.NAME || b.CODE || ""));
            _paneClients = clients;

            // 2. Load Suppliers (IDB CARRIERS + B2B)
            let suppliers = [];
            try {
                if (typeof getAppData === "function") {
                    const rawCarriers = await getAppData("CARRIERS");
                    const carriersList = Object.values(rawCarriers || {}).filter(c => c && (c.CARRIER_CODE || c.CODE));
                    carriersList.forEach(c => {
                        suppliers.push({
                            code: c.CARRIER_CODE || c.CODE,
                            name: c.CARRIER_NAME || c.NAME || c.CARRIER_CODE || c.CODE,
                            type: "CARRIER"
                        });
                    });
                }
            } catch (_) {}
            if (!suppliers.length) {
                try {
                    const r = await fetch("/api/accounting/vendors", { headers: _getAuthHeaders() });
                    if (r.ok) {
                        const data = await r.json();
                        const vList = Array.isArray(data) ? data : (data.vendors || data.suppliers || []);
                        vList.forEach(v => suppliers.push({ code: v.code, name: v.name || v.code, type: "CARRIER" }));
                    }
                } catch (_) {}
            }
            suppliers.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            _paneSuppliers = suppliers;

            // Sourcing Branch Bank Accounts dynamically
            let branchBanks = [];
            try {
                const bRes = await fetch(`/api/accounting/bank-accounts?branch_code=${encodeURIComponent(branchCode)}`, { headers: _getAuthHeaders() });
                if (bRes.ok) {
                    const bData = await bRes.json();
                    branchBanks = bData.bank_accounts || [];
                }
            } catch (_) {}
            if (!branchBanks.length) {
                branchBanks = [
                    { bank_code: "PUNB0410", bank_name: "Punjab National Bank", account_no: "...0410", is_primary: true },
                    { bank_code: "UTGB8849", bank_name: "Uttarakhand Gramin Bank", account_no: "...8849", is_primary: false }
                ];
            }

            // Render Form
            view.innerHTML = `
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in duration-150">
                    <!-- Form Header Bar -->
                    <div class="p-5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded border border-indigo-200">
                                    INSTRUMENT REGISTER
                                </span>
                                <h2 class="text-base font-bold text-gray-950">Record Cheque / PDC</h2>
                            </div>
                            <p class="text-xs text-gray-500 mt-0.5 font-mono">
                                Auto-binds Active Branch: <span class="font-bold text-gray-800">${branchCode}</span> · Custody Vault &amp; Clearing
                            </p>
                        </div>
                        <button type="button" id="chqFormCancelTopBtn" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>

                    <!-- Form Body -->
                    <form id="chqCreateForm" class="p-6 space-y-6">
                        <!-- Direction Selector -->
                        <div class="grid grid-cols-2 gap-3 p-1.5 bg-gray-100 rounded-xl border border-gray-200">
                            <label class="flex items-center justify-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all ${presetType === 'INWARD' ? 'bg-white shadow text-blue-900 font-bold' : 'text-gray-600 hover:bg-gray-200'}">
                                <input type="radio" name="chequeDirection" value="INWARD" ${presetType === 'INWARD' ? 'checked' : ''} class="sr-only">
                                <span>📥 Inward Cheque (From Customer)</span>
                            </label>
                            <label class="flex items-center justify-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all ${presetType === 'OUTWARD' ? 'bg-white shadow text-purple-900 font-bold' : 'text-gray-600 hover:bg-gray-200'}">
                                <input type="radio" name="chequeDirection" value="OUTWARD" ${presetType === 'OUTWARD' ? 'checked' : ''} class="sr-only">
                                <span>📤 Outward Cheque (To Vendor / Supplier)</span>
                            </label>
                        </div>

                        <!-- Party Selection Section -->
                        <div class="p-4 bg-gray-50/80 rounded-xl border border-gray-200 space-y-3">
                            <label id="chqPartyLabel" class="block text-xs font-bold text-gray-900 uppercase tracking-wider">
                                Customer / Drawer <span class="text-red-600">*</span>
                            </label>
                            <select id="chqPartySelect" required class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 font-semibold">
                                <!-- Populated dynamically based on direction -->
                            </select>
                        </div>

                        <!-- Cheque Details Grid -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">
                                    Cheque Number <span class="text-red-600">*</span>
                                </label>
                                <input type="text" id="chqNoInput" required placeholder="e.g. 001245" 
                                       class="w-full px-3 py-2 text-xs font-mono font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900">
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">
                                    Cheque Date <span class="text-red-600">*</span>
                                </label>
                                <input type="date" id="chqDateInput" value="${today}" required 
                                       class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 font-mono">
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">
                                    Drawer Bank Name <span class="text-red-600">*</span>
                                </label>
                                <input type="text" id="chqBankInput" required list="chqBankList" placeholder="e.g. HDFC Bank, ICICI Bank" 
                                       class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 font-semibold">
                                <datalist id="chqBankList">
                                    <option value="HDFC Bank">
                                    <option value="State Bank of India (SBI)">
                                    <option value="ICICI Bank">
                                    <option value="Axis Bank">
                                    <option value="Punjab National Bank (PNB)">
                                    <option value="Bank of Baroda">
                                    <option value="Kotak Mahindra Bank">
                                    <option value="Uttarakhand Gramin Bank">
                                </datalist>
                            </div>
                        </div>

                        <!-- Amount & Deposit Bank Account -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">
                                    Cheque Amount (₹) <span class="text-red-600">*</span>
                                </label>
                                <div class="relative">
                                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 font-bold text-sm">₹</span>
                                    <input type="number" step="0.01" min="0.01" id="chqAmountInput" required placeholder="0.00" 
                                           class="w-full pl-8 pr-3 py-2 text-sm font-mono font-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-indigo-950">
                                </div>
                            </div>

                            <div>
                                <label id="chqDepositAccountLabel" class="block text-xs font-bold text-gray-700 mb-1 uppercase">
                                    Deposit Into Account <span class="text-red-600">*</span>
                                </label>
                                <select id="chqDepositAccount" required class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 font-mono font-semibold">
                                    ${branchBanks.map(b => `
                                        <option value="${_escapeHtml(b.bank_code)}" ${b.is_primary ? 'selected' : ''}>
                                            ${_escapeHtml(b.bank_code)} — ${_escapeHtml(b.bank_name)} ${b.account_no ? '(A/c *' + _escapeHtml(String(b.account_no).slice(-4)) + ')' : ''} ${b.is_primary ? '[PRIMARY]' : ''}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>

                        <!-- Live PDC / CDC Status Banner -->
                        <div id="chqPdcNotice" class="p-3.5 rounded-xl border text-xs font-medium bg-blue-50/70 border-blue-200 text-blue-900 flex items-center gap-2">
                            <i class="fa-solid fa-bolt text-blue-600 text-sm"></i>
                            <span>Current-Dated Cheque (CDC) — Ready for immediate bank deposit &amp; clearing.</span>
                        </div>

                        <!-- Narration -->
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">Narration / Remarks</label>
                            <input type="text" id="chqNarration" placeholder="Freight settlement advance cheque" 
                                   class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900">
                        </div>

                        <!-- Action Toolbar -->
                        <div class="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                            <button type="button" id="chqFormCancelBtn" class="btn btn-secondary">
                                Cancel
                            </button>
                            <button type="submit" id="chqSubmitBtn" class="btn btn-blue flex items-center gap-2">
                                <i class="fa-solid fa-check"></i>
                                <span>Save Cheque to Register</span>
                            </button>
                        </div>
                    </form>
                </div>
            `;

            _setupFormHandlers(branchCode, presetType, presetPartyCode);

        } catch (err) {
            console.error("[VaultCheques openAddPane error]", err);
            view.innerHTML = `
                <div class="p-6 text-center text-red-600 text-xs">
                    Failed to initialize cheque form: ${_escapeHtml(err.message || err)}
                </div>
            `;
        }
    }

    // ── Form Handlers ───────────────────────────────────────────────────────
    function _setupFormHandlers(branchCode, currentType, presetPartyCode) {
        const partySelect = document.getElementById("chqPartySelect");
        const partyLabel = document.getElementById("chqPartyLabel");
        const depositLabel = document.getElementById("chqDepositAccountLabel");
        const dateInput = document.getElementById("chqDateInput");
        const pdcNotice = document.getElementById("chqPdcNotice");
        const dirRadios = document.querySelectorAll('input[name="chequeDirection"]');

        function populateParties(type) {
            if (type === "INWARD") {
                partyLabel.innerHTML = 'Customer / B2B Client <span class="text-red-600">*</span>';
                depositLabel.innerHTML = 'Deposit Into Bank Account <span class="text-red-600">*</span>';
                partySelect.innerHTML = '<option value="">— Select Customer / B2B Client —</option>' +
                    _paneClients.map(c => {
                        const code = c.CODE || c.CLIENT_CODE;
                        const name = c.B2B_NAME || c.NAME || code;
                        const isSel = presetPartyCode && presetPartyCode.toUpperCase() === code.toUpperCase();
                        return `<option value="${_escapeHtml(code)}" ${isSel ? 'selected' : ''}>${_escapeHtml(code)} — ${_escapeHtml(name)}</option>`;
                    }).join("");
            } else {
                partyLabel.innerHTML = 'Vendor / Supplier / Payee <span class="text-red-600">*</span>';
                depositLabel.innerHTML = 'Disburse From Bank Account <span class="text-red-600">*</span>';
                partySelect.innerHTML = '<option value="">— Select Vendor / Carrier —</option>' +
                    _paneSuppliers.map(s => {
                        const isSel = presetPartyCode && presetPartyCode.toUpperCase() === s.code.toUpperCase();
                        return `<option value="${_escapeHtml(s.code)}" ${isSel ? 'selected' : ''}>${_escapeHtml(s.code)} — ${_escapeHtml(s.name)}</option>`;
                    }).join("");
            }
        }

        populateParties(currentType);

        dirRadios.forEach(radio => {
            radio.addEventListener("change", (e) => {
                dirRadios.forEach(r => {
                    r.parentElement.className = "flex items-center justify-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all text-gray-600 hover:bg-gray-200";
                });
                radio.parentElement.className = `flex items-center justify-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all bg-white shadow ${radio.value === 'INWARD' ? 'text-blue-900' : 'text-purple-900'} font-bold`;
                populateParties(radio.value);
            });
        });

        // Date Change: Update PDC Notice
        dateInput?.addEventListener("change", () => {
            const today = new Date().toISOString().split("T")[0];
            const chqDate = dateInput.value;
            if (chqDate > today) {
                pdcNotice.className = "p-3.5 rounded-xl border text-xs font-medium bg-amber-50 border-amber-200 text-amber-950 flex items-center gap-2";
                pdcNotice.innerHTML = `
                    <i class="fa-solid fa-clock text-amber-600 text-sm"></i>
                    <span>⏳ <strong>Post-Dated Cheque (PDC):</strong> Dated in the future. Instrument will be held in custody until ${chqDate} before deposit.</span>
                `;
            } else {
                pdcNotice.className = "p-3.5 rounded-xl border text-xs font-medium bg-blue-50/70 border-blue-200 text-blue-900 flex items-center gap-2";
                pdcNotice.innerHTML = `
                    <i class="fa-solid fa-bolt text-blue-600 text-sm"></i>
                    <span>⚡ <strong>Current-Dated Cheque (CDC):</strong> Ready for immediate bank deposit &amp; clearing.</span>
                `;
            }
        });

        // Cancel
        const cancelFn = () => {
            if (_activeCheque) {
                _renderDetail(_activeCheque);
            } else if (_allCheques.length > 0) {
                _renderDetail(_allCheques[0]);
            } else {
                VaultPage.showDetail(false);
            }
        };
        document.getElementById("chqFormCancelBtn")?.addEventListener("click", cancelFn);
        document.getElementById("chqFormCancelTopBtn")?.addEventListener("click", cancelFn);

        // Submit
        document.getElementById("chqCreateForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            _submitChequeForm(branchCode);
        });
    }

    // ── Form Submit Handler ─────────────────────────────────────────────────
    async function _submitChequeForm(branchCode) {
        const direction = document.querySelector('input[name="chequeDirection"]:checked')?.value || "INWARD";
        const partySelect = document.getElementById("chqPartySelect");
        const partyCode = partySelect?.value?.trim();
        const partyName = partySelect?.options[partySelect.selectedIndex]?.text?.split("—")[1]?.trim() || partyCode;
        const chequeNo = document.getElementById("chqNoInput")?.value?.trim();
        const chequeDate = document.getElementById("chqDateInput")?.value;
        const bankName = document.getElementById("chqBankInput")?.value?.trim();
        const amount = parseFloat(document.getElementById("chqAmountInput")?.value || 0);
        const depositAccount = document.getElementById("chqDepositAccount")?.value;
        const narration = document.getElementById("chqNarration")?.value?.trim();

        if (!partyCode) {
            alert("Please select a party from the dropdown.");
            return;
        }

        if (!chequeNo) {
            alert("Please specify a cheque number.");
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            alert("Please enter a valid cheque amount greater than 0.");
            return;
        }

        if (!chequeDate) {
            alert("Please specify the cheque date.");
            return;
        }

        const submitBtn = document.getElementById("chqSubmitBtn");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...`;
        }

        const payload = {
            cheque_no: chequeNo,
            cheque_type: direction,
            cheque_date: chequeDate,
            party_type: direction === "INWARD" ? "CLIENT" : "VENDOR",
            party_code: partyCode,
            party_name: partyName,
            amount: amount,
            bank_name: bankName,
            branch_code: branchCode,
            deposit_account: depositAccount,
            narration: narration || undefined
        };

        try {
            const res = await fetch("/api/accounting/cheques", {
                method: "POST",
                headers: _getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.message || `Server returned ${res.status}`);
            }

            const result = await res.json();
            const createdChq = result.cheque || result.data;

            if (typeof window.showToast === "function") {
                window.showToast(`Cheque #${chequeNo} registered successfully!`, "success");
            } else {
                alert(`Cheque #${chequeNo} registered successfully!`);
            }

            await load(_filterStart, _filterEnd);

            if (createdChq) {
                const found = _allCheques.find(c => c.id === createdChq.id);
                if (found) _renderDetail(found);
            }

        } catch (err) {
            console.error("[VaultCheques submit error]", err);
            alert("Failed to save cheque: " + (err.message || err));
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Save Cheque to Register</span>`;
            }
        }
    }

    // ── Cheque Lifecycle State Transitions ──────────────────────────────────
    async function depositCheque(chqId) {
        if (!confirm("Mark this cheque instrument as deposited into bank?")) return;
        window.setLoading?.(true, "Marking cheque as deposited...", "detail");

        try {
            const res = await fetch(`/api/accounting/cheques/${chqId}/deposit`, {
                method: "POST",
                headers: _getAuthHeaders()
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.message || `Server returned ${res.status}`);
            }
            await load(_filterStart, _filterEnd);
            const updated = _allCheques.find(c => c.id === chqId);
            if (updated) _renderDetail(updated);
        } catch (err) {
            console.error("[VaultCheques deposit error]", err);
            alert("Failed to mark deposited: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function clearCheque(chqId) {
        if (!confirm("Are you sure you want to mark this cheque as CLEARED?\nThis will automatically post the double-entry transaction to the General Ledger!")) return;
        window.setLoading?.(true, "Clearing cheque & posting to General Ledger...", "detail");

        try {
            const res = await fetch(`/api/accounting/cheques/${chqId}/clear`, {
                method: "POST",
                headers: _getAuthHeaders()
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.message || `Server returned ${res.status}`);
            }

            const data = await res.json();
            alert(`Cheque cleared successfully!\nPosted to General Ledger via ${data.linked_doc_no || 'Receipt/Payment'}.`);
            await load(_filterStart, _filterEnd);
            const updated = _allCheques.find(c => c.id === chqId);
            if (updated) _renderDetail(updated);
        } catch (err) {
            console.error("[VaultCheques clear error]", err);
            alert("Failed to clear cheque: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function bounceCheque(chqId) {
        const reason = prompt("Enter mandatory reason for cheque bounce / dishonour:", "Insufficient funds / signature mismatch");
        if (!reason || !reason.trim()) return;

        window.setLoading?.(true, "Marking cheque as bounced...", "detail");
        try {
            const res = await fetch(`/api/accounting/cheques/${chqId}/bounce`, {
                method: "POST",
                headers: _getAuthHeaders(),
                body: JSON.stringify({ reason: reason.trim() })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.message || `Server returned ${res.status}`);
            }

            alert("Cheque marked as bounced. Any linked ledger posting has been automatically reversed.");
            await load(_filterStart, _filterEnd);
            const updated = _allCheques.find(c => c.id === chqId);
            if (updated) _renderDetail(updated);
        } catch (err) {
            console.error("[VaultCheques bounce error]", err);
            alert("Failed to mark bounced: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function cancelCheque(chqId) {
        if (!confirm("Are you sure you want to cancel / void this cheque instrument?")) return;
        window.setLoading?.(true, "Cancelling cheque...", "detail");

        try {
            const res = await fetch(`/api/accounting/cheques/${chqId}/cancel`, {
                method: "POST",
                headers: _getAuthHeaders()
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.message || `Server returned ${res.status}`);
            }
            await load(_filterStart, _filterEnd);
            const updated = _allCheques.find(c => c.id === chqId);
            if (updated) _renderDetail(updated);
        } catch (err) {
            console.error("[VaultCheques cancel error]", err);
            alert("Failed to cancel cheque: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Main Load ───────────────────────────────────────────────────────────
    async function load(startDate = null, endDate = null) {
        _injectListPane();
        window.setLoading?.(true, "Loading cheques & PDC register...", "list");

        try {
            let url = "/api/accounting/cheques";
            const queryParts = [];
            const activeBranch = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "";
            if (activeBranch && activeBranch.toUpperCase() !== "ALL") {
                queryParts.push(`branch=${encodeURIComponent(activeBranch)}`);
            }
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);
            if (queryParts.length) url += `?${queryParts.join("&")}`;

            const res = await fetch(url, { headers: _getAuthHeaders() });
            if (!res.ok) {
                throw new Error(`Failed to load cheques (HTTP ${res.status})`);
            }

            const data = await res.json();
            _allCheques = Array.isArray(data) ? data : (data.cheques || data.data || []);
            _renderList();

            // Do not auto-select on load — show empty placeholder until user selects
            _activeCheque = null;
            VaultPage.showDetail(false);
        } catch (err) {
            console.error("[VaultCheques load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) {
                msg.textContent = "Failed to load cheques: " + (err.message || err);
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
        openNewChequePane: openAddPane,
        depositCheque,
        clearCheque,
        bounceCheque,
        cancelCheque
    };
})();

window.VaultCheques = VaultCheques;
