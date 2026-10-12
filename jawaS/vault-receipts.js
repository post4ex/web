// ============================================================================
// VAULT-RECEIPTS.JS — Customer Receipts & Money-In Settlements
// Tiles: receipts (💰), payments (💸)
// Architecture:
// 1. Sourcing: B2B Customers from IndexedDB ('B2B') + /api/accounting/clients fallback.
// 2. Auto-binds Active Branch: getActiveBranch() (no branch selector in form).
// 3. In-Pane Creation: Renders directly in view pane (no modal popups).
// 4. Double-Entry Posting:
//    - Dr Bank Account (1020) or Cash in Hand (1000) [Increases liquid assets]
//    - Cr Customer Accounts Receivable (1010 Trade Debtors) [Clears customer debt]
// 5. Audit Trail: Full general ledger line entries inspection for every receipt.
// 6. Void / Reversal: Strict 2-way reversal with mandatory reason prompt.
// 7. Global button standards: .btn, .btn-sm, .btn-blue, .btn-secondary, .btn-danger.
// 8. High-contrast typography: text-gray-950, font-mono.
// ============================================================================

const VaultReceipts = (() => {

    let _activeMode = "receipts"; // 'receipts' or 'payments'
    let _allReceipts = [];
    let _activeReceipt = null;
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterStatus = "";

    // In-Pane Form State
    let _paneClients = [];
    let _paneInvoices = [];
    let _paneBankAccounts = [];
    let _paneCashAccounts = [];

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

    function _getStatusBadge(r) {
        const status = (r.status || "POSTED").toUpperCase();
        if (status === "VOID" || status === "CANCELLED") {
            return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-800 border border-red-200">VOIDED</span>';
        }
        return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">POSTED</span>';
    }

    function _getPaymentModeLabel(mode) {
        const m = (mode || "BANK").toUpperCase();
        const labels = {
            "BANK": "Bank Transfer (NEFT/RTGS)",
            "UPI": "UPI / QR Code",
            "CASH": "Petty Cash",
            "CHEQUE": "Cheque / DD",
            "CARD": "Debit / Credit Card"
        };
        return labels[m] || m;
    }

    async function _fetchBranchAccounts(branchCode) {
        try {
            const res = await fetch(`/api/accounting/bank-accounts?branch_code=${encodeURIComponent(branchCode || '')}`, { headers: _getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                _paneBankAccounts = data.bank_accounts || [];
                _paneCashAccounts = data.cash_accounts || [];
                return;
            }
        } catch (e) {
            console.warn("[VaultReceipts] Failed to fetch bank accounts:", e);
        }
        if (!_paneBankAccounts.length) {
            _paneBankAccounts = [
                { bank_code: "UTGB8849", bank_name: "Uttarakhand Gramin Bank", account_no: "76023889849", is_primary: true },
                { bank_code: "PUNB0410", bank_name: "Punjab National Bank", account_no: "0410002100012345", is_primary: false }
            ];
        }
        if (!_paneCashAccounts.length) {
            _paneCashAccounts = [
                { code: "3003", gl_account_code: "3003", account_name: "Cash in Hand (Counter Collections)", is_cash: true },
                { code: "3002", gl_account_code: "3002", account_name: "Petty Cash Imprest", is_cash: true }
            ];
        }
    }

    function _resolveAccountDisplay(r) {
        const entCode = r.metadata?.bank_entity_code || r.bank_entity_code || "";
        const rawCode = r.bank_account_code || r.metadata?.bank_account || "";
        const mode = (r.payment_mode || r.metadata?.payment_mode || "").toUpperCase();

        if (entCode) {
            const bank = _paneBankAccounts.find(b => b.bank_code === entCode);
            if (bank) return `${bank.bank_name} (${bank.bank_code})`;
            if (entCode === "DDN" || entCode === "MAIN" || mode === "CASH") {
                return rawCode === "3002" ? "Petty Cash Imprest (#3002)" : "Cash in Hand (#3003)";
            }
            return `${entCode} (#3001)`;
        }

        if (rawCode === "3003" || rawCode === "1000" || mode === "CASH") {
            return "Cash in Hand (#3003)";
        }
        if (rawCode === "3002") {
            return "Petty Cash Imprest (#3002)";
        }
        const bank = _paneBankAccounts.find(b => b.bank_code === rawCode);
        if (bank) return `${bank.bank_name} (${bank.bank_code})`;

        return rawCode ? `Operating Account (#${rawCode})` : "Operating Bank (#3001)";
    }

    function _populateAccountDropdown(selectEl, mode, currentVal) {
        if (!selectEl) return;
        const isCash = (mode || "").toUpperCase() === "CASH";
        let html = "";

        if (isCash) {
            const cashList = _paneCashAccounts.length ? _paneCashAccounts : [
                { code: "3003", gl_account_code: "3003", account_name: "Cash in Hand (Counter Collections)" },
                { code: "3002", gl_account_code: "3002", account_name: "Petty Cash Imprest" }
            ];
            html += `<optgroup label="Cash Desks">`;
            cashList.forEach(c => {
                const val = c.gl_account_code || c.code || "3003";
                const isSel = (currentVal === val || (!currentVal && val === "3003"));
                html += `<option value="${_escapeHtml(val)}" ${isSel ? "selected" : ""}>#${_escapeHtml(val)} — ${_escapeHtml(c.account_name || "Cash")}</option>`;
            });
            html += `</optgroup>`;

            if (_paneBankAccounts.length) {
                html += `<optgroup label="Bank Accounts (Other)">`;
                _paneBankAccounts.forEach(b => {
                    const isSel = currentVal === b.bank_code;
                    html += `<option value="${_escapeHtml(b.bank_code)}" ${isSel ? "selected" : ""}>${_escapeHtml(b.bank_code)} — ${_escapeHtml(b.bank_name)} ${b.account_no ? `(*${_escapeHtml(String(b.account_no).slice(-4))})` : ""}</option>`;
                });
                html += `</optgroup>`;
            }
        } else {
            html += `<optgroup label="Bank Accounts">`;
            let hasPrimary = false;
            _paneBankAccounts.forEach(b => {
                const isPrim = !!b.is_primary;
                if (isPrim) hasPrimary = true;
                const isSel = (currentVal === b.bank_code || (!currentVal && isPrim));
                html += `<option value="${_escapeHtml(b.bank_code)}" ${isSel ? "selected" : ""}>${_escapeHtml(b.bank_code)} — ${_escapeHtml(b.bank_name)} ${b.account_no ? `(A/c *${_escapeHtml(String(b.account_no).slice(-4))})` : ""} ${isPrim ? "[PRIMARY]" : ""}</option>`;
            });
            html += `</optgroup>`;

            const cashList = _paneCashAccounts.length ? _paneCashAccounts : [
                { code: "3003", gl_account_code: "3003", account_name: "Cash in Hand" }
            ];
            html += `<optgroup label="Cash Desks (Other)">`;
            cashList.forEach(c => {
                const val = c.gl_account_code || c.code || "3003";
                const isSel = currentVal === val;
                html += `<option value="${_escapeHtml(val)}" ${isSel ? "selected" : ""}>#${_escapeHtml(val)} — ${_escapeHtml(c.account_name || "Cash")}</option>`;
            });
            html += `</optgroup>`;
        }

        selectEl.innerHTML = html;
    }

    // ── Setup Left List Pane ────────────────────────────────────────────────
    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        
        const isPayments = _activeMode === "payments";
        if (search) {
            search.placeholder = isPayments 
                ? "Search payments by #, vendor, UTR, ref..." 
                : "Search receipts by #, customer, UTR, ref...";
            search.oninput = () => _renderList();
        }

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => document.getElementById("recFilterModal")?.classList.remove("hidden");
        }

        if (!document.getElementById("recFilterModal")) {
            const modal = document.createElement("div");
            modal.id = "recFilterModal";
            modal.className = "modal-overlay hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-150">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h2 class="text-base font-bold text-gray-950 flex items-center gap-2">
                            <span>🔍</span> Filter ${isPayments ? "Vendor Payments" : "Customer Receipts"}
                        </h2>
                        <button onclick="document.getElementById('recFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="recPresetCfy" class="btn btn-sm btn-secondary">Current FY</button>
                            <button type="button" id="recPresetPfy" class="btn btn-sm btn-secondary">Previous FY</button>
                            <button type="button" id="recPresetAll" class="btn btn-sm btn-secondary">All Records</button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="recFilterStart" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 font-mono">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="recFilterEnd" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 font-mono">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Status</label>
                        <select id="recFilterStatus" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900">
                            <option value="">All Statuses (Active & Voided)</option>
                            <option value="POSTED">Posted Only</option>
                            <option value="VOID">Voided Only</option>
                        </select>
                    </div>
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button id="recFilterResetBtn" type="button" class="btn btn-sm btn-danger">Reset</button>
                        <button id="recFilterApplyBtn" type="button" class="btn btn-sm btn-blue">Apply Filter</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const now = new Date();
            const year = now.getFullYear();
            const startYear = now.getMonth() < 3 ? year - 1 : year;

            document.getElementById("recPresetCfy").onclick = () => {
                document.getElementById("recFilterStart").value = `${startYear}-04-01`;
                document.getElementById("recFilterEnd").value = `${startYear + 1}-03-31`;
            };
            document.getElementById("recPresetPfy").onclick = () => {
                document.getElementById("recFilterStart").value = `${startYear - 1}-04-01`;
                document.getElementById("recFilterEnd").value = `${startYear}-03-31`;
            };
            document.getElementById("recPresetAll").onclick = () => {
                document.getElementById("recFilterStart").value = "";
                document.getElementById("recFilterEnd").value = "";
            };

            document.getElementById("recFilterApplyBtn").onclick = () => {
                _filterStart = document.getElementById("recFilterStart").value;
                _filterEnd = document.getElementById("recFilterEnd").value;
                _filterStatus = document.getElementById("recFilterStatus").value;
                modal.classList.add("hidden");
                load(_filterStart, _filterEnd);
            };

            document.getElementById("recFilterResetBtn").onclick = () => {
                document.getElementById("recFilterStart").value = "";
                document.getElementById("recFilterEnd").value = "";
                document.getElementById("recFilterStatus").value = "";
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

        const isPayments = _activeMode === "payments";
        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _allReceipts.filter(r => {
            if (_filterStatus) {
                const s = (r.status || "POSTED").toUpperCase();
                if (_filterStatus === "VOID" && s !== "VOID") return false;
                if (_filterStatus === "POSTED" && s === "VOID") return false;
            }

            if (!q) return true;
            const docNo = (r.doc_no || r.receipt_no || r.payment_no || "").toLowerCase();
            const party = (r.client_name || r.client_code || r.client?.name || r.vendor?.name || r.vendor?.carrier_code || "").toLowerCase();
            const refNo = (r.ref_no || r.reference || "").toLowerCase();
            const narr = (r.narration || "").toLowerCase();
            const dt = (r.doc_date || r.date || "").toLowerCase();
            const inv = (r.invoice_doc_no || r.metadata?.invoice_doc_no || "").toLowerCase();

            return docNo.includes(q) || party.includes(q) || refNo.includes(q) || narr.includes(q) || dt.includes(q) || inv.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `
                <li class="text-center text-gray-500 text-xs py-8">
                    <i class="fa-solid fa-folder-open text-gray-300 text-3xl mb-2 block"></i>
                    No ${isPayments ? "payment" : "receipt"} records found matching criteria.
                </li>
            `;
            return;
        }

        ul.innerHTML = filtered.map(r => {
            const docNo = r.doc_no || r.receipt_no || (isPayments ? `PAY-${r.id}` : `REC-${r.id}`);
            const partyName = r.client_name || r.client?.name || r.client_code || (isPayments ? (r.vendor?.name || r.vendor?.carrier_code || "Vendor") : "B2B Customer");
            const dateStr = _fmtDate(r.doc_date || r.date);
            const amount = parseFloat(r.total_amount || r.amount || 0);
            const badge = _getStatusBadge(r);
            const mode = (r.payment_mode || r.metadata?.payment_mode || "BANK").toUpperCase();
            const isSelected = _activeReceipt && (_activeReceipt.doc_no === docNo || _activeReceipt.id === r.id);

            return `
                <li data-doc-no="${_escapeHtml(docNo)}" data-id="${r.id}" 
                    class="p-3.5 rounded-xl cursor-pointer border transition-all duration-150 ${isSelected ? 'bg-emerald-50/80 border-emerald-400 shadow-sm' : 'bg-white hover:bg-gray-50 border-gray-200'}">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="font-mono font-bold text-xs text-gray-950 flex items-center gap-1.5">
                            <i class="fa-solid ${isPayments ? 'fa-money-bill-transfer text-rose-600' : 'fa-receipt text-emerald-600'}"></i>
                            ${_escapeHtml(docNo)}
                        </span>
                        ${badge}
                    </div>
                    <div class="text-xs font-bold text-gray-900 truncate mb-1">
                        ${_escapeHtml(partyName)}
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 font-mono mb-1.5">
                        <span class="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">${_escapeHtml(mode)}</span>
                        ${r.ref_no ? `<span class="truncate max-w-[120px] text-gray-600" title="${_escapeHtml(r.ref_no)}">Ref: ${_escapeHtml(r.ref_no)}</span>` : ''}
                    </div>
                    <div class="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                        <span class="text-gray-500 text-[11px]">📅 ${dateStr}</span>
                        <span class="font-mono font-extrabold text-emerald-800 text-sm">${_fmtMoney(amount)}</span>
                    </div>
                </li>
            `;
        }).join("");

        ul.querySelectorAll("li").forEach(li => {
            li.addEventListener("click", () => {
                ul.querySelectorAll("li").forEach(x => {
                    x.classList.remove("bg-emerald-50/80", "border-emerald-400", "shadow-sm");
                    x.classList.add("bg-white", "border-gray-200");
                });
                li.classList.add("bg-emerald-50/80", "border-emerald-400", "shadow-sm");
                li.classList.remove("bg-white", "border-gray-200");

                const docNo = li.dataset.docNo;
                const rec = _allReceipts.find(p => p.doc_no === docNo || String(p.id) === String(li.dataset.id));
                if (rec) {
                    _activeReceipt = rec;
                    _renderDetail(rec);
                }
            });
        });
    }

    // ── Render Detail View Pane ─────────────────────────────────────────────
    async function _renderDetail(r) {
        if (!r) return;
        _activeReceipt = r;
        VaultPage.showDetail(true);
        VaultPage?.showDetailPane?.();

        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const isPayments = _activeMode === "payments";
        const docNo = r.doc_no || r.receipt_no || (isPayments ? `PAY-${r.id}` : `REC-${r.id}`);
        const dateStr = _fmtDate(r.doc_date || r.date);
        const amount = parseFloat(r.total_amount || r.amount || 0);
        const isVoid = (r.status || "").toUpperCase() === "VOID";
        const branchCode = r.branch_code || (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "DDN";
        const mode = (r.payment_mode || r.metadata?.payment_mode || "BANK").toUpperCase();
        const bankAccount = r.bank_account_code || r.metadata?.bank_account || "1020";
        const invoiceDocNo = r.invoice_doc_no || r.metadata?.invoice_doc_no || "";

        const partyName = r.client_name || r.client?.name || r.client_code || (isPayments ? (r.vendor?.name || r.vendor?.carrier_code || "Vendor") : "B2B Customer");
        const partyCode = r.client_code || r.client?.code || (isPayments ? (r.vendor?.carrier_code || r.vendor?.code || "") : "");
        const partyGstin = r.client?.gstin || r.metadata?.client_gstin || "";
        const partyCity = r.client?.city || "";
        const partyState = r.client?.state || "";

        view.innerHTML = `
            <div class="space-y-5 animate-in fade-in duration-150">
                <!-- Header Action Bar -->
                <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center flex-wrap gap-2">
                            <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${isPayments ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'} rounded border">
                                <i class="fa-solid ${isPayments ? 'fa-money-bill-transfer' : 'fa-hand-holding-dollar'} mr-1"></i>
                                ${isPayments ? "VENDOR PAYMENT" : "CUSTOMER RECEIPT"}
                            </span>
                            ${_getStatusBadge(r)}
                            <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">
                                BRANCH: ${_escapeHtml(branchCode)}
                            </span>
                        </div>
                        <h1 class="text-xl font-black text-gray-950 font-mono">${_escapeHtml(docNo)}</h1>
                        <p class="text-xs text-gray-500 font-mono">
                            Date: <span class="font-bold text-gray-800">${dateStr}</span> · 
                            Deposit: <span class="font-bold text-emerald-800">${_escapeHtml(_resolveAccountDisplay(r))}</span>
                        </p>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                        <button type="button" id="recNewBtn" class="btn btn-sm btn-blue flex items-center gap-1.5">
                            <i class="fa-solid fa-plus"></i> ${isPayments ? "Record Payment" : "Record Receipt"}
                        </button>
                        <button type="button" onclick="window.print()" class="btn btn-sm btn-secondary flex items-center gap-1.5">
                            <i class="fa-solid fa-print"></i> Print
                        </button>
                        ${!isVoid ? `
                            <button type="button" id="recVoidBtn" class="btn btn-sm btn-danger flex items-center gap-1.5">
                                <i class="fa-solid fa-ban"></i> Void Receipt
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- 2-Column Master Information Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Customer Information Card -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid fa-building text-blue-600 mr-1.5"></i> ${isPayments ? "Paid To (Vendor)" : "Received From (Customer)"}</span>
                            ${partyCode ? `<span class="font-mono text-blue-700 font-bold">CODE: ${_escapeHtml(partyCode)}</span>` : ''}
                        </div>
                        <div class="space-y-1.5">
                            <h3 class="text-base font-extrabold text-gray-950">${_escapeHtml(partyName)}</h3>
                            ${partyGstin ? `<p class="text-xs font-mono text-gray-600"><span class="text-gray-400 font-bold">GSTIN:</span> ${_escapeHtml(partyGstin)}</p>` : ''}
                            ${(partyCity || partyState) ? `<p class="text-xs text-gray-600"><span class="text-gray-400 font-bold">Location:</span> ${_escapeHtml([partyCity, partyState].filter(Boolean).join(", "))}</p>` : ''}
                        </div>
                        <div class="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                            <span class="text-gray-500">Customer GL Control:</span>
                            <span class="font-mono font-bold text-gray-800">#1010 (Trade Debtors)</span>
                        </div>
                    </div>

                    <!-- Payment & Settlement Details Card -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid fa-money-check-dollar text-emerald-600 mr-1.5"></i> Settlement Details</span>
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                ${_escapeHtml(_getPaymentModeLabel(mode))}
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block">Transaction Reference / UTR</span>
                                <span class="font-mono font-bold text-gray-950">${_escapeHtml(r.ref_no || r.reference || "—")}</span>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block">Bank Account</span>
                                <span class="font-mono font-bold text-gray-950">${_escapeHtml(_resolveAccountDisplay(r))}</span>
                            </div>
                        </div>
                        ${invoiceDocNo ? `
                            <div class="p-2 bg-blue-50/70 rounded-lg border border-blue-200 flex items-center justify-between text-xs">
                                <span class="font-bold text-blue-900"><i class="fa-solid fa-file-invoice text-blue-600 mr-1"></i> Allocated to Invoice:</span>
                                <span class="font-mono font-bold text-blue-800">${_escapeHtml(invoiceDocNo)}</span>
                            </div>
                        ` : ''}
                        <div class="pt-2 border-t border-gray-100 flex items-center justify-between">
                            <span class="text-xs font-bold text-gray-600 uppercase">Total Received:</span>
                            <span class="text-xl font-mono font-black text-emerald-800">${_fmtMoney(amount)}</span>
                        </div>
                    </div>
                </div>

                ${r.narration ? `
                    <div class="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs flex items-start gap-2">
                        <i class="fa-solid fa-message text-gray-400 mt-0.5"></i>
                        <div>
                            <span class="font-bold text-gray-700">Narration / Memo:</span>
                            <p class="text-gray-800 mt-0.5 font-medium">${_escapeHtml(r.narration)}</p>
                        </div>
                    </div>
                ` : ''}

                <!-- Double-Entry General Ledger Audit Table -->
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div class="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                        <h2 class="text-xs font-extrabold uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                            <i class="fa-solid fa-scale-balanced text-emerald-600"></i> Double-Entry General Ledger Postings
                        </h2>
                        <span class="text-[11px] font-mono text-gray-500">Document: ${_escapeHtml(docNo)}</span>
                    </div>

                    <div id="recAuditLinesContainer" class="p-4">
                        <div class="p-6 text-center text-gray-400 text-xs">
                            <div class="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            Loading general ledger audit lines...
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Wire Action Buttons
        document.getElementById("recNewBtn").onclick = () => openAddPane();
        const voidBtn = document.getElementById("recVoidBtn");
        if (voidBtn) {
            voidBtn.onclick = () => voidReceipt(docNo);
        }

        // Fetch Live GL Audit Entries
        _fetchAndRenderGlAudit(docNo, amount, bankAccount, partyCode, partyName, mode, r.ref_no);
    }

    // ── Fetch & Render Double-Entry GL Audit Lines ──────────────────────────
    async function _fetchAndRenderGlAudit(docNo, totalAmount, bankAccount, partyCode, partyName, mode, refNo) {
        const container = document.getElementById("recAuditLinesContainer");
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
                                            Total Double-Entry Balance:
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
            console.warn("[VaultReceipts] Could not load GL audit from server, rendering inferred lines:", e);
        }

        // Fallback: Inferred double-entry rows based on standard invariant
        const isCash = bankAccount === "1000";
        const bankName = isCash ? "Petty Cash in Hand" : "Operating Bank Account";
        const bankCode = isCash ? "1000" : (bankAccount || "1020");

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
                    <tbody class="divide-y divide-gray-100 bg-white font-mono">
                        <tr class="hover:bg-gray-50/60">
                            <td class="px-4 py-2.5 text-center text-gray-400">1</td>
                            <td class="px-4 py-2.5 font-bold text-gray-950">${bankCode}</td>
                            <td class="px-4 py-2.5 font-sans font-bold text-gray-900">${bankName}</td>
                            <td class="px-4 py-2.5 text-gray-600 font-sans">Receipt via ${mode} ref ${refNo || 'N/A'}</td>
                            <td class="px-4 py-2.5 text-right font-bold text-gray-950">${_fmtMoney(totalAmount)}</td>
                            <td class="px-4 py-2.5 text-right text-gray-400">—</td>
                        </tr>
                        <tr class="hover:bg-gray-50/60">
                            <td class="px-4 py-2.5 text-center text-gray-400">2</td>
                            <td class="px-4 py-2.5 font-bold text-gray-950">1010</td>
                            <td class="px-4 py-2.5 font-sans font-bold text-gray-900">Trade Debtors Control (${_escapeHtml(partyName)})</td>
                            <td class="px-4 py-2.5 text-gray-600 font-sans">Settlement from client ${partyCode || partyName}</td>
                            <td class="px-4 py-2.5 text-right text-gray-400">—</td>
                            <td class="px-4 py-2.5 text-right font-bold text-gray-950">${_fmtMoney(totalAmount)}</td>
                        </tr>
                    </tbody>
                    <tfoot class="bg-gray-50 border-t-2 border-gray-300 font-mono font-bold text-xs">
                        <tr>
                            <td colspan="4" class="px-4 py-2.5 text-right uppercase text-gray-600 font-sans">
                                Total Double-Entry Balance:
                            </td>
                            <td class="px-4 py-2.5 text-right text-gray-950">${_fmtMoney(totalAmount)}</td>
                            <td class="px-4 py-2.5 text-right text-gray-950">${_fmtMoney(totalAmount)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }

    // ── In-Pane Creation Form ───────────────────────────────────────────────
    async function openAddPane(presetClientCode = "") {
        VaultPage.showDetail(true);
        VaultPage?.showDetailPane?.();
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const isPayments = _activeMode === "payments";
        const branchCode = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "DDN";
        const today = new Date().toISOString().split("T")[0];

        view.innerHTML = `
            <div class="p-8 text-center text-gray-500 text-xs space-y-2">
                <div class="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p>Loading clients and accounting configurations...</p>
            </div>
        `;

        try {
            await _fetchBranchAccounts(branchCode);

            // 1. Fetch Customers from IndexedDB (B2B)
            let clients = [];
            try {
                if (typeof getAppData === "function") {
                    const rawB2B = await getAppData("B2B");
                    clients = Object.values(rawB2B || {}).filter(c => c && (c.CODE || c.CLIENT_CODE));
                }
            } catch (e) {
                console.warn("[VaultReceipts] Failed to get B2B from IDB:", e);
            }

            if (!clients.length) {
                try {
                    const r = await fetch("/api/accounting/clients", { headers: _getAuthHeaders() });
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
            _paneClients = clients;

            // Render Form HTML
            view.innerHTML = `
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in duration-150">
                    <!-- Form Header Bar -->
                    <div class="p-5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded border border-emerald-200">
                                    MONEY IN
                                </span>
                                <h2 class="text-base font-bold text-gray-950">Record Customer Receipt</h2>
                            </div>
                            <p class="text-xs text-gray-500 mt-0.5 font-mono">
                                Auto-binds Active Branch: <span class="font-bold text-gray-800">${branchCode}</span> · GL Post: #1020 / #1000 &rarr; #1010
                            </p>
                        </div>
                        <button type="button" id="recFormCancelTopBtn" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>

                    <!-- Form Body -->
                    <form id="recCreateForm" class="p-6 space-y-6">
                        <!-- Customer Selection Section -->
                        <div class="p-4 bg-gray-50/80 rounded-xl border border-gray-200 space-y-3">
                            <label class="block text-xs font-bold text-gray-900 uppercase tracking-wider">
                                Customer / B2B Client <span class="text-red-600">*</span>
                            </label>
                            <select id="recClientSelect" required class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 font-semibold">
                                <option value="">— Select Customer / B2B Client (${_paneClients.length} available) —</option>
                                ${_paneClients.map(c => {
                                    const code = c.CODE || c.CLIENT_CODE;
                                    const name = c.B2B_NAME || c.NAME || c.COMPANY_NAME || code;
                                    const city = c.B2B_CITY || c.CITY || "";
                                    const isSel = presetClientCode && presetClientCode.toUpperCase() === code.toUpperCase();
                                    return `<option value="${_escapeHtml(code)}" ${isSel ? 'selected' : ''}>${_escapeHtml(code)} — ${_escapeHtml(name)} ${city ? `(${city})` : ''}</option>`;
                                }).join("")}
                            </select>

                            <!-- Client Details Banner (shown dynamically on selection) -->
                            <div id="recClientInfoBanner" class="hidden p-3 bg-white rounded-lg border border-gray-200 text-xs grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div><span class="text-[10px] uppercase font-bold text-gray-400 block">GSTIN</span><span id="recClientGstin" class="font-mono font-bold text-gray-800">—</span></div>
                                <div><span class="text-[10px] uppercase font-bold text-gray-400 block">Location</span><span id="recClientLocation" class="text-gray-800 font-medium">—</span></div>
                                <div><span class="text-[10px] uppercase font-bold text-gray-400 block">AR Account</span><span class="font-mono font-bold text-blue-700">#1010 Trade Debtors</span></div>
                            </div>
                        </div>

                        <!-- Payment & Settlement Settings -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">Payment Mode <span class="text-red-600">*</span></label>
                                <select id="recPaymentMode" required class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 font-bold">
                                    <option value="BANK" selected>Bank Transfer (NEFT/RTGS/IMPS)</option>
                                    <option value="UPI">UPI / QR Code</option>
                                    <option value="CASH">Cash in Hand</option>
                                    <option value="CHEQUE">Cheque / Demand Draft</option>
                                    <option value="CARD">Debit / Credit Card</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">Deposit Account <span class="text-red-600">*</span></label>
                                <select id="recBankAccount" required class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 font-mono font-semibold">
                                </select>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">Receipt Date <span class="text-red-600">*</span></label>
                                <input type="date" id="recDate" value="${today}" required class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 font-mono">
                            </div>
                        </div>

                        <!-- Amount & Reference -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">
                                    Settlement Amount (₹) <span class="text-red-600">*</span>
                                </label>
                                <div class="relative">
                                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 font-bold text-sm">₹</span>
                                    <input type="number" step="0.01" min="0.01" id="recAmount" required placeholder="0.00" 
                                           class="w-full pl-8 pr-3 py-2 text-sm font-mono font-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-emerald-900">
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">
                                    Transaction Ref / UTR / Cheque # <span class="text-gray-400 font-normal">(Optional)</span>
                                </label>
                                <input type="text" id="recRefNo" placeholder="e.g. UTR-982182746 or CHQ-001294" 
                                       class="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900">
                            </div>
                        </div>

                        <!-- Optional Sales Invoice Allocation -->
                        <div class="p-4 bg-blue-50/50 rounded-xl border border-blue-200/70 space-y-2">
                            <div class="flex items-center justify-between">
                                <label class="block text-xs font-bold text-blue-950 uppercase tracking-wider">
                                    Allocate to Sales Invoice <span class="text-gray-400 font-normal">(Optional)</span>
                                </label>
                                <span id="recInvoiceCount" class="text-[10px] font-mono text-blue-700">Select customer to view unpaid invoices</span>
                            </div>
                            <select id="recInvoiceSelect" class="w-full px-3 py-2 text-xs border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-mono">
                                <option value="">— No Specific Invoice Allocation (General Settlement Float) —</option>
                            </select>
                        </div>

                        <!-- Narration -->
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">Narration / Memo</label>
                            <input type="text" id="recNarration" placeholder="Settlement from client via bank transfer" 
                                   class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900">
                        </div>

                        <!-- Live Double-Entry Invariant Preview Box -->
                        <div class="p-4 bg-slate-900 text-white rounded-xl space-y-3 shadow-md">
                            <div class="flex items-center justify-between border-b border-slate-700 pb-2">
                                <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                    <i class="fa-solid fa-scale-balanced"></i> Double-Entry Journal Preview
                                </span>
                                <span id="recPreviewBadge" class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-800 text-slate-300 rounded border border-slate-700">
                                    Balanced (Dr = Cr)
                                </span>
                            </div>
                            <div class="grid grid-cols-2 gap-4 font-mono text-xs">
                                <div class="space-y-1">
                                    <span class="text-[10px] text-slate-400 uppercase block font-sans">Debit (Dr) Entry</span>
                                    <p id="recPreviewDrAccount" class="text-emerald-300 font-bold text-xs truncate">#1020 Operating Bank</p>
                                    <p id="recPreviewDrAmount" class="text-lg font-black text-white">₹0.00</p>
                                </div>
                                <div class="space-y-1 text-right">
                                    <span class="text-[10px] text-slate-400 uppercase block font-sans">Credit (Cr) Entry</span>
                                    <p id="recPreviewCrAccount" class="text-blue-300 font-bold text-xs truncate">#1010 Trade Debtors</p>
                                    <p id="recPreviewCrAmount" class="text-lg font-black text-white">₹0.00</p>
                                </div>
                            </div>
                        </div>

                        <!-- Action Toolbar -->
                        <div class="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                            <button type="button" id="recFormCancelBtn" class="btn btn-secondary">
                                Cancel
                            </button>
                            <button type="submit" id="recSubmitBtn" class="btn btn-blue flex items-center gap-2">
                                <i class="fa-solid fa-check"></i>
                                <span>Post Receipt to Ledger</span>
                            </button>
                        </div>
                    </form>
                </div>
            `;

            // Populate account dropdown initially
            _populateAccountDropdown(document.getElementById("recBankAccount"), "BANK");

            // Setup Form Dynamic Handlers
            _setupFormHandlers(branchCode);

            if (presetClientCode) {
                const sel = document.getElementById("recClientSelect");
                if (sel) {
                    sel.value = presetClientCode;
                    sel.dispatchEvent(new Event("change"));
                }
            }

        } catch (err) {
            console.error("[VaultReceipts openAddPane error]", err);
            view.innerHTML = `
                <div class="p-6 text-center text-red-600 text-xs">
                    Failed to initialize receipt form: ${_escapeHtml(err.message || err)}
                </div>
            `;
        }
    }

    // ── Dynamic Form Event Listeners ────────────────────────────────────────
    function _setupFormHandlers(branchCode) {
        const clientSelect = document.getElementById("recClientSelect");
        const clientInfoBanner = document.getElementById("recClientInfoBanner");
        const clientGstin = document.getElementById("recClientGstin");
        const clientLocation = document.getElementById("recClientLocation");
        const invoiceSelect = document.getElementById("recInvoiceSelect");
        const invoiceCount = document.getElementById("recInvoiceCount");
        const paymentMode = document.getElementById("recPaymentMode");
        const bankAccount = document.getElementById("recBankAccount");
        const amountInput = document.getElementById("recAmount");
        const narrationInput = document.getElementById("recNarration");
        const refNoInput = document.getElementById("recRefNo");

        const previewDrAccount = document.getElementById("recPreviewDrAccount");
        const previewDrAmount = document.getElementById("recPreviewDrAmount");
        const previewCrAccount = document.getElementById("recPreviewCrAccount");
        const previewCrAmount = document.getElementById("recPreviewCrAmount");

        function updatePreview() {
            const amt = parseFloat(amountInput?.value || 0);
            const selAcc = bankAccount?.value || "";
            let bankLabel = "";
            if (selAcc === "3003" || selAcc === "1000") {
                bankLabel = "#3003 Cash in Hand (Counter)";
            } else if (selAcc === "3002") {
                bankLabel = "#3002 Petty Cash Imprest";
            } else {
                const bObj = _paneBankAccounts.find(b => b.bank_code === selAcc);
                bankLabel = bObj ? `#3001 Bank: ${bObj.bank_name} (${bObj.bank_code})` : (selAcc ? `#3001 Operating Bank (${selAcc})` : "#3001 Operating Bank Account");
            }

            const clientCode = clientSelect?.value || "";
            const clientObj = _paneClients.find(c => (c.CODE || c.CLIENT_CODE) === clientCode);
            const clientName = clientObj ? (clientObj.B2B_NAME || clientObj.NAME || clientCode) : "Customer AR";

            if (previewDrAccount) previewDrAccount.textContent = bankLabel;
            if (previewDrAmount) previewDrAmount.textContent = _fmtMoney(amt);
            if (previewCrAccount) previewCrAccount.textContent = `#1010 ${clientName}`;
            if (previewCrAmount) previewCrAmount.textContent = _fmtMoney(amt);
        }

        // On Mode Change -> Switch Bank / Cash Accounts in dropdown
        paymentMode?.addEventListener("change", () => {
            _populateAccountDropdown(bankAccount, paymentMode.value, bankAccount.value);
            updatePreview();
        });

        bankAccount?.addEventListener("change", updatePreview);
        amountInput?.addEventListener("input", updatePreview);

        // On Client Select &rarr; Load Open Invoices
        clientSelect?.addEventListener("change", async () => {
            const code = clientSelect.value;
            updatePreview();

            if (!code) {
                if (clientInfoBanner) clientInfoBanner.classList.add("hidden");
                if (invoiceSelect) invoiceSelect.innerHTML = '<option value="">— No Specific Invoice Allocation —</option>';
                if (invoiceCount) invoiceCount.textContent = "Select customer to view unpaid invoices";
                return;
            }

            const c = _paneClients.find(x => (x.CODE || x.CLIENT_CODE) === code);
            if (c && clientInfoBanner) {
                clientInfoBanner.classList.remove("hidden");
                if (clientGstin) clientGstin.textContent = c.GSTIN || c.B2B_GST || "Unregistered / None";
                if (clientLocation) clientLocation.textContent = [c.B2B_CITY || c.CITY, c.B2B_STATE || c.STATE].filter(Boolean).join(", ") || "—";
            }

            // Auto-fill narration default
            if (c && narrationInput && !narrationInput.value) {
                const name = c.B2B_NAME || c.NAME || code;
                narrationInput.value = `Payment received from ${name} via ${paymentMode.value}`;
            }

            // Fetch open invoices for this customer
            if (invoiceCount) invoiceCount.textContent = "Checking open invoices...";
            try {
                const invRes = await fetch(`/api/accounting/invoices?branch=${encodeURIComponent(branchCode)}&limit=100`, {
                    headers: _getAuthHeaders()
                });
                if (invRes.ok) {
                    const invData = await invRes.json();
                    const allInv = Array.isArray(invData) ? invData : (invData.invoices || []);
                    const custInvoices = allInv.filter(i => {
                        const iCode = i.client_code || i.client?.code || i.metadata?.client_code || "";
                        const isNotVoid = (i.status || "").toUpperCase() !== "VOID";
                        return isNotVoid && iCode.toUpperCase() === code.toUpperCase();
                    });

                    _paneInvoices = custInvoices;
                    if (invoiceCount) invoiceCount.textContent = `${custInvoices.length} open/posted invoice(s) available`;

                    if (invoiceSelect) {
                        invoiceSelect.innerHTML = '<option value="">— No Specific Invoice Allocation (General Settlement Float) —</option>' +
                            custInvoices.map(i => {
                                const iNum = i.doc_no || i.invoice_number || i.number;
                                const iAmt = parseFloat(i.total_amount || i.amount || 0);
                                const iDt = _fmtDate(i.doc_date || i.date);
                                return `<option value="${_escapeHtml(iNum)}" data-amount="${iAmt}">Invoice ${_escapeHtml(iNum)} — ${_fmtMoney(iAmt)} (${iDt})</option>`;
                            }).join("");
                    }
                }
            } catch (e) {
                console.warn("[VaultReceipts] Failed to load customer invoices:", e);
                if (invoiceCount) invoiceCount.textContent = "Could not load open invoices";
            }
        });

        // On Invoice Select &rarr; Auto-fill Amount if empty
        invoiceSelect?.addEventListener("change", () => {
            const opt = invoiceSelect.options[invoiceSelect.selectedIndex];
            if (opt && opt.dataset.amount && (!amountInput.value || parseFloat(amountInput.value) === 0)) {
                amountInput.value = parseFloat(opt.dataset.amount).toFixed(2);
                updatePreview();
            }
        });

        // Cancel Buttons
        const cancelFn = () => {
            if (_activeReceipt) {
                _renderDetail(_activeReceipt);
            } else {
                VaultPage.showDetail(false);
            }
        };
        document.getElementById("recFormCancelBtn")?.addEventListener("click", cancelFn);
        document.getElementById("recFormCancelTopBtn")?.addEventListener("click", cancelFn);

        // Form Submit
        document.getElementById("recCreateForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            _submitReceiptForm(branchCode);
        });
    }

    // ── Form Submission Handler ─────────────────────────────────────────────
    async function _submitReceiptForm(branchCode) {
        const clientCode = document.getElementById("recClientSelect")?.value?.trim();
        const paymentMode = document.getElementById("recPaymentMode")?.value;
        const bankAccountCode = document.getElementById("recBankAccount")?.value;
        const receiptDate = document.getElementById("recDate")?.value;
        const amount = parseFloat(document.getElementById("recAmount")?.value || 0);
        const refNo = document.getElementById("recRefNo")?.value?.trim() || "";
        const invoiceDocNo = document.getElementById("recInvoiceSelect")?.value?.trim() || "";
        const narration = document.getElementById("recNarration")?.value?.trim() || "";

        if (!clientCode) {
            alert("Please select a Customer / B2B Client from the dropdown.");
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            alert("Please enter a valid settlement amount greater than 0.");
            return;
        }

        if (!receiptDate) {
            alert("Please specify a receipt date.");
            return;
        }

        const submitBtn = document.getElementById("recSubmitBtn");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Posting...`;
        }

        const payload = {
            client_code: clientCode,
            amount: amount,
            payment_mode: paymentMode,
            bank_account_code: bankAccountCode,
            receipt_date: receiptDate,
            branch_code: branchCode,
            ref_no: refNo || undefined,
            narration: narration || undefined,
            invoice_doc_no: invoiceDocNo || undefined
        };

        try {
            const res = await fetch("/api/accounting/receipts", {
                method: "POST",
                headers: _getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.message || `Server returned ${res.status}`);
            }

            const result = await res.json();
            const newDocNo = result.doc_no || result.data?.doc_no || "REC";

            // Success feedback
            if (typeof window.showToast === "function") {
                window.showToast(`Customer receipt ${newDocNo} posted successfully!`, "success");
            } else {
                alert(`Receipt ${newDocNo} successfully posted to General Ledger!`);
            }

            // Reload list and show the newly posted receipt
            await load(_filterStart, _filterEnd);

            const newlyCreated = _allReceipts.find(r => r.doc_no === newDocNo);
            if (newlyCreated) {
                _renderDetail(newlyCreated);
            }

        } catch (err) {
            console.error("[VaultReceipts submit error]", err);
            alert("Failed to post receipt: " + (err.message || err));
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Post Receipt to Ledger</span>`;
            }
        }
    }

    // ── Void / Reversal Workflow ────────────────────────────────────────────
    async function voidReceipt(docNo) {
        if (!docNo) return;

        const reason = prompt(
            `Enter mandatory reason for voiding customer receipt ${docNo}:\n(This will post a balanced reversal Journal Entry in the General Ledger)`,
            "Customer payment reversal / cheque bounce"
        );
        if (!reason || !reason.trim()) return;

        window.setLoading?.(true, "Voiding & reversing receipt in General Ledger...", "detail");

        try {
            const res = await fetch(`/api/accounting/receipts/${encodeURIComponent(docNo)}/void`, {
                method: "POST",
                headers: _getAuthHeaders(),
                body: JSON.stringify({ reason: reason.trim(), narration: reason.trim() })
            });

            if (!res.ok) {
                // Try fallback to ledger transaction void endpoint
                const fbRes = await fetch(`/api/ledger/transactions/${encodeURIComponent(docNo)}/void?reason=${encodeURIComponent(reason.trim())}`, {
                    method: "POST",
                    headers: _getAuthHeaders()
                });
                if (!fbRes.ok) {
                    const errData = await fbRes.json().catch(() => ({}));
                    throw new Error(errData.detail || errData.message || `Server returned ${fbRes.status}`);
                }
            }

            alert(`Receipt ${docNo} has been successfully voided and reversed via General Ledger Journal Entry.`);
            await load(_filterStart, _filterEnd);

            const updated = _allReceipts.find(r => r.doc_no === docNo);
            if (updated) {
                _renderDetail(updated);
            } else {
                _activeReceipt = null;
                VaultPage.showDetail(false);
            }

        } catch (err) {
            console.error("[VaultReceipts void error]", err);
            alert("Failed to void receipt: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Main Load ───────────────────────────────────────────────────────────
    async function load(startDate = null, endDate = null) {
        _injectListPane();
        const isPayments = _activeMode === "payments";
        window.setLoading?.(true, `Loading ${isPayments ? "vendor payments" : "customer receipts"}...`, "list");

        try {
            const activeBranch = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "";
            await _fetchBranchAccounts(activeBranch);

            let url = isPayments ? "/api/accounting/vendor-payments" : "/api/accounting/receipts";
            const queryParts = [];
            if (activeBranch && activeBranch.toUpperCase() !== "ALL") {
                queryParts.push(`branch=${encodeURIComponent(activeBranch)}`);
            }
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);
            if (queryParts.length) url += `?${queryParts.join("&")}`;

            const res = await fetch(url, { headers: _getAuthHeaders() });
            if (!res.ok) {
                throw new Error(`Failed to load receipts (HTTP ${res.status})`);
            }

            const data = await res.json();
            _allReceipts = Array.isArray(data) ? data : (data.receipts || data.payments || data.data || []);
            _renderList();

            // Do not auto-select on load — show empty placeholder until user selects
            _activeReceipt = null;
            VaultPage.showDetail(false);
        } catch (err) {
            console.error("[VaultReceipts load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) {
                msg.textContent = `Failed to load ${isPayments ? "payments" : "receipts"}: ` + (err.message || err);
                msg.classList.remove("hidden");
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    function setMode(mode) {
        _activeMode = mode;
    }

    return { 
        load, 
        setMode, 
        search: _renderList,
        openAddPane,
        openNewReceiptPane: openAddPane,
        voidReceipt
    };
})();

window.VaultReceipts = VaultReceipts;
