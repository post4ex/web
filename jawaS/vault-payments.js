// ============================================================================
// VAULT-PAYMENTS.JS — Vendor Payments & Supplier Disbursements (Money Out)
// Tile: payments (💸)
// Architecture:
// 1. Sourcing: Carriers & Vendors from IndexedDB ('CARRIERS', 'B2B') + /api/accounting/vendors fallback.
// 2. Auto-binds Active Branch: getActiveBranch() (no branch selector in form).
// 3. In-Pane Creation: Renders directly in view pane (no modal popups).
// 4. Double-Entry Posting:
//    - Dr Supplier Accounts Payable (2000 Trade Creditors) [Reduces liability]
//    - Cr Bank Account (1020) or Cash in Hand (1000) [Disburses liquid funds]
// 5. Audit Trail: Full general ledger line entries inspection for every payout.
// 6. Void / Reversal: Strict 2-way reversal with mandatory reason prompt.
// 7. Global button standards: .btn, .btn-sm, .btn-blue, .btn-secondary, .btn-danger.
// 8. High-contrast typography: text-gray-950, font-mono.
// ============================================================================

const VaultPayments = (() => {

    let _allPayments = [];
    let _activePayment = null;
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterStatus = "";

    // In-Pane Form State
    let _paneSuppliers = [];
    let _paneBills = [];
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

    function _getStatusBadge(p) {
        const status = (p.status || "POSTED").toUpperCase();
        if (status === "VOID" || status === "CANCELLED") {
            return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-800 border border-red-200">VOIDED</span>';
        }
        return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200">DISBURSED</span>';
    }

    function _getPaymentModeLabel(mode) {
        const m = (mode || "BANK").toUpperCase();
        const labels = {
            "BANK": "Bank Transfer (NEFT/RTGS/IMPS)",
            "UPI": "UPI / QR Payout",
            "CASH": "Petty Cash Payout",
            "CHEQUE": "Cheque / DD",
            "CARD": "Corporate Debit/Credit Card"
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
            console.warn("[VaultPayments] Failed to fetch bank accounts:", e);
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

    function _resolveAccountDisplay(p) {
        const entCode = p.metadata?.bank_entity_code || p.bank_entity_code || "";
        const rawCode = p.bank_account_code || p.metadata?.bank_account || "";
        const mode = (p.payment_mode || p.metadata?.payment_mode || "").toUpperCase();

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

        if (search) {
            search.placeholder = "Search payments by #, vendor, UTR, ref...";
            search.oninput = () => _renderList();
        }

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => document.getElementById("payFilterModal")?.classList.remove("hidden");
        }

        if (!document.getElementById("payFilterModal")) {
            const modal = document.createElement("div");
            modal.id = "payFilterModal";
            modal.className = "modal-overlay hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-150">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h2 class="text-base font-bold text-gray-950 flex items-center gap-2">
                            <span>🔍</span> Filter Vendor Payments
                        </h2>
                        <button onclick="document.getElementById('payFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="payPresetCfy" class="btn btn-sm btn-secondary">Current FY</button>
                            <button type="button" id="payPresetPfy" class="btn btn-sm btn-secondary">Previous FY</button>
                            <button type="button" id="payPresetAll" class="btn btn-sm btn-secondary">All Records</button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="payFilterStart" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white text-gray-900 font-mono">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="payFilterEnd" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white text-gray-900 font-mono">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Status</label>
                        <select id="payFilterStatus" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white text-gray-900">
                            <option value="">All Statuses (Active & Voided)</option>
                            <option value="POSTED">Disbursed Only</option>
                            <option value="VOID">Voided Only</option>
                        </select>
                    </div>
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button id="payFilterResetBtn" type="button" class="btn btn-sm btn-danger">Reset</button>
                        <button id="payFilterApplyBtn" type="button" class="btn btn-sm btn-blue">Apply Filter</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const now = new Date();
            const year = now.getFullYear();
            const startYear = now.getMonth() < 3 ? year - 1 : year;

            document.getElementById("payPresetCfy").onclick = () => {
                document.getElementById("payFilterStart").value = `${startYear}-04-01`;
                document.getElementById("payFilterEnd").value = `${startYear + 1}-03-31`;
            };
            document.getElementById("payPresetPfy").onclick = () => {
                document.getElementById("payFilterStart").value = `${startYear - 1}-04-01`;
                document.getElementById("payFilterEnd").value = `${startYear}-03-31`;
            };
            document.getElementById("payPresetAll").onclick = () => {
                document.getElementById("payFilterStart").value = "";
                document.getElementById("payFilterEnd").value = "";
            };

            document.getElementById("payFilterApplyBtn").onclick = () => {
                _filterStart = document.getElementById("payFilterStart").value;
                _filterEnd = document.getElementById("payFilterEnd").value;
                _filterStatus = document.getElementById("payFilterStatus").value;
                modal.classList.add("hidden");
                load(_filterStart, _filterEnd);
            };

            document.getElementById("payFilterResetBtn").onclick = () => {
                document.getElementById("payFilterStart").value = "";
                document.getElementById("payFilterEnd").value = "";
                document.getElementById("payFilterStatus").value = "";
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

        const filtered = _allPayments.filter(p => {
            if (_filterStatus) {
                const s = (p.status || "POSTED").toUpperCase();
                if (_filterStatus === "VOID" && s !== "VOID") return false;
                if (_filterStatus === "POSTED" && s === "VOID") return false;
            }

            if (!q) return true;
            const docNo = (p.doc_no || p.payment_no || "").toLowerCase();
            const party = (p.supplier_name || p.supplier_code || p.vendor?.name || p.vendor?.carrier_code || "").toLowerCase();
            const refNo = (p.ref_no || p.reference || "").toLowerCase();
            const narr = (p.narration || "").toLowerCase();
            const dt = (p.doc_date || p.date || "").toLowerCase();
            const bill = (p.bill_doc_no || p.metadata?.bill_doc_no || "").toLowerCase();

            return docNo.includes(q) || party.includes(q) || refNo.includes(q) || narr.includes(q) || dt.includes(q) || bill.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `
                <li class="text-center text-gray-500 text-xs py-8">
                    <i class="fa-solid fa-folder-open text-gray-300 text-3xl mb-2 block"></i>
                    No vendor payment records found matching criteria.
                </li>
            `;
            return;
        }

        ul.innerHTML = filtered.map(p => {
            const docNo = p.doc_no || p.payment_no || `PAY-${p.id}`;
            const partyName = p.supplier_name || p.vendor?.name || p.vendor?.carrier_code || p.supplier_code || "Carrier / Vendor";
            const dateStr = _fmtDate(p.doc_date || p.date);
            const amount = parseFloat(p.total_amount || p.amount || 0);
            const badge = _getStatusBadge(p);
            const mode = (p.payment_mode || p.metadata?.payment_mode || "BANK").toUpperCase();
            const isSelected = _activePayment && (_activePayment.doc_no === docNo || _activePayment.id === p.id);

            return `
                <li data-doc-no="${_escapeHtml(docNo)}" data-id="${p.id}" 
                    class="p-3.5 rounded-xl cursor-pointer border transition-all duration-150 ${isSelected ? 'bg-rose-50/80 border-rose-400 shadow-sm' : 'bg-white hover:bg-gray-50 border-gray-200'}">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="font-mono font-bold text-xs text-gray-950 flex items-center gap-1.5">
                            <i class="fa-solid fa-money-bill-transfer text-rose-600"></i>
                            ${_escapeHtml(docNo)}
                        </span>
                        ${badge}
                    </div>
                    <div class="text-xs font-bold text-gray-900 truncate mb-1">
                        ${_escapeHtml(partyName)}
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 font-mono mb-1.5">
                        <span class="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">${_escapeHtml(mode)}</span>
                        ${p.ref_no ? `<span class="truncate max-w-[120px] text-gray-600" title="${_escapeHtml(p.ref_no)}">Ref: ${_escapeHtml(p.ref_no)}</span>` : ''}
                    </div>
                    <div class="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                        <span class="text-gray-500 text-[11px]">📅 ${dateStr}</span>
                        <span class="font-mono font-extrabold text-rose-800 text-sm">${_fmtMoney(amount)}</span>
                    </div>
                </li>
            `;
        }).join("");

        ul.querySelectorAll("li").forEach(li => {
            li.addEventListener("click", () => {
                ul.querySelectorAll("li").forEach(x => {
                    x.classList.remove("bg-rose-50/80", "border-rose-400", "shadow-sm");
                    x.classList.add("bg-white", "border-gray-200");
                });
                li.classList.add("bg-rose-50/80", "border-rose-400", "shadow-sm");
                li.classList.remove("bg-white", "border-gray-200");

                const docNo = li.dataset.docNo;
                const pay = _allPayments.find(p => p.doc_no === docNo || String(p.id) === String(li.dataset.id));
                if (pay) {
                    _activePayment = pay;
                    _renderDetail(pay);
                }
            });
        });
    }

    // ── Render Detail View Pane ─────────────────────────────────────────────
    async function _renderDetail(p) {
        if (!p) return;
        _activePayment = p;
        VaultPage.showDetail(true);
        VaultPage?.showDetailPane?.();

        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const docNo = p.doc_no || p.payment_no || `PAY-${p.id}`;
        const dateStr = _fmtDate(p.doc_date || p.date);
        const amount = parseFloat(p.total_amount || p.amount || 0);
        const isVoid = (p.status || "").toUpperCase() === "VOID";
        const branchCode = p.branch_code || (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "DDN";
        const mode = (p.payment_mode || p.metadata?.payment_mode || "BANK").toUpperCase();
        const bankAccount = p.bank_account_code || p.metadata?.bank_account || "1020";
        const billDocNo = p.bill_doc_no || p.metadata?.bill_doc_no || "";

        const partyName = p.supplier_name || p.vendor?.name || p.vendor?.carrier_code || p.supplier_code || "Carrier / Vendor";
        const partyCode = p.supplier_code || p.vendor?.carrier_code || p.vendor?.code || "";
        const partyGstin = p.vendor?.gstin || p.metadata?.supplier_gstin || "";
        const partyCity = p.vendor?.city || "";
        const partyState = p.vendor?.state || "";

        view.innerHTML = `
            <div class="space-y-5 animate-in fade-in duration-150">
                <!-- Header Action Bar -->
                <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center flex-wrap gap-2">
                            <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-rose-100 text-rose-800 border-rose-200 rounded border">
                                <i class="fa-solid fa-money-bill-transfer mr-1"></i>
                                VENDOR DISBURSEMENT (MONEY OUT)
                            </span>
                            ${_getStatusBadge(p)}
                            <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">
                                BRANCH: ${_escapeHtml(branchCode)}
                            </span>
                        </div>
                        <h1 class="text-xl font-black text-gray-950 font-mono">${_escapeHtml(docNo)}</h1>
                        <p class="text-xs text-gray-500 font-mono">
                            Date: <span class="font-bold text-gray-800">${dateStr}</span> · 
                            Disbursed From: <span class="font-bold text-rose-800">${_escapeHtml(_resolveAccountDisplay(p))}</span>
                        </p>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                        <button type="button" id="payNewBtn" class="btn btn-sm btn-blue flex items-center gap-1.5">
                            <i class="fa-solid fa-plus"></i> Record Payment
                        </button>
                        <button type="button" onclick="window.print()" class="btn btn-sm btn-secondary flex items-center gap-1.5">
                            <i class="fa-solid fa-print"></i> Print
                        </button>
                        ${!isVoid ? `
                            <button type="button" id="payVoidBtn" class="btn btn-sm btn-danger flex items-center gap-1.5">
                                <i class="fa-solid fa-ban"></i> Void Payment
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- 2-Column Master Information Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Supplier Information Card -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid fa-truck-ramp-box text-blue-600 mr-1.5"></i> Paid To (Vendor / Carrier)</span>
                            ${partyCode ? `<span class="font-mono text-blue-700 font-bold">CODE: ${_escapeHtml(partyCode)}</span>` : ''}
                        </div>
                        <div class="space-y-1.5">
                            <h3 class="text-base font-extrabold text-gray-950">${_escapeHtml(partyName)}</h3>
                            ${partyGstin ? `<p class="text-xs font-mono text-gray-600"><span class="text-gray-400 font-bold">GSTIN:</span> ${_escapeHtml(partyGstin)}</p>` : ''}
                            ${(partyCity || partyState) ? `<p class="text-xs text-gray-600"><span class="text-gray-400 font-bold">Location:</span> ${_escapeHtml([partyCity, partyState].filter(Boolean).join(", "))}</p>` : ''}
                        </div>
                        <div class="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                            <span class="text-gray-500">Supplier GL Control:</span>
                            <span class="font-mono font-bold text-gray-800">#2000 (Accounts Payable)</span>
                        </div>
                    </div>

                    <!-- Payment & Settlement Details Card -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid fa-money-check-dollar text-rose-600 mr-1.5"></i> Payout Details</span>
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                ${_escapeHtml(_getPaymentModeLabel(mode))}
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block">Transaction Reference / UTR</span>
                                <span class="font-mono font-bold text-gray-950">${_escapeHtml(p.ref_no || p.reference || "—")}</span>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block">Paid From Account</span>
                                <span class="font-mono font-bold text-gray-950">${_escapeHtml(_resolveAccountDisplay(p))}</span>
                            </div>
                        </div>
                        ${billDocNo ? `
                            <div class="p-2 bg-blue-50/70 rounded-lg border border-blue-200 flex items-center justify-between text-xs">
                                <span class="font-bold text-blue-900"><i class="fa-solid fa-file-invoice text-blue-600 mr-1"></i> Allocated to Bill:</span>
                                <span class="font-mono font-bold text-blue-800">${_escapeHtml(billDocNo)}</span>
                            </div>
                        ` : ''}
                        <div class="pt-2 border-t border-gray-100 flex items-center justify-between">
                            <span class="text-xs font-bold text-gray-600 uppercase">Total Disbursed:</span>
                            <span class="text-xl font-mono font-black text-rose-800">${_fmtMoney(amount)}</span>
                        </div>
                    </div>
                </div>

                ${p.narration ? `
                    <div class="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs flex items-start gap-2">
                        <i class="fa-solid fa-message text-gray-400 mt-0.5"></i>
                        <div>
                            <span class="font-bold text-gray-700">Narration / Memo:</span>
                            <p class="text-gray-800 mt-0.5 font-medium">${_escapeHtml(p.narration)}</p>
                        </div>
                    </div>
                ` : ''}

                <!-- Double-Entry General Ledger Audit Table -->
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div class="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                        <h2 class="text-xs font-extrabold uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                            <i class="fa-solid fa-scale-balanced text-rose-600"></i> Double-Entry General Ledger Postings
                        </h2>
                        <span class="text-[11px] font-mono text-gray-500">Document: ${_escapeHtml(docNo)}</span>
                    </div>

                    <div id="payAuditLinesContainer" class="p-4">
                        <div class="p-6 text-center text-gray-400 text-xs">
                            <div class="w-5 h-5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            Loading general ledger audit lines...
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Wire Action Buttons
        document.getElementById("payNewBtn").onclick = () => openAddPane();
        const voidBtn = document.getElementById("payVoidBtn");
        if (voidBtn) {
            voidBtn.onclick = () => voidPayment(docNo);
        }

        // Fetch Live GL Audit Entries
        _fetchAndRenderGlAudit(docNo, amount, bankAccount, partyCode, partyName, mode, p.ref_no);
    }

    // ── Fetch & Render Double-Entry GL Audit Lines ──────────────────────────
    async function _fetchAndRenderGlAudit(docNo, totalAmount, bankAccount, partyCode, partyName, mode, refNo) {
        const container = document.getElementById("payAuditLinesContainer");
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
            console.warn("[VaultPayments] Could not load GL audit from server, rendering inferred lines:", e);
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
                            <td class="px-4 py-2.5 font-bold text-gray-950">2000</td>
                            <td class="px-4 py-2.5 font-sans font-bold text-gray-900">Accounts Payable (${_escapeHtml(partyName)})</td>
                            <td class="px-4 py-2.5 text-gray-600 font-sans">Payment to ${partyCode || partyName}</td>
                            <td class="px-4 py-2.5 text-right font-bold text-gray-950">${_fmtMoney(totalAmount)}</td>
                            <td class="px-4 py-2.5 text-right text-gray-400">—</td>
                        </tr>
                        <tr class="hover:bg-gray-50/60">
                            <td class="px-4 py-2.5 text-center text-gray-400">2</td>
                            <td class="px-4 py-2.5 font-bold text-gray-950">${bankCode}</td>
                            <td class="px-4 py-2.5 font-sans font-bold text-gray-900">${bankName}</td>
                            <td class="px-4 py-2.5 text-gray-600 font-sans">Payment via ${mode} ref ${refNo || 'N/A'}</td>
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
    async function openAddPane(presetSupplierCode = "") {
        VaultPage.showDetail(true);
        VaultPage?.showDetailPane?.();
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const branchCode = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "DDN";
        const today = new Date().toISOString().split("T")[0];

        view.innerHTML = `
            <div class="p-8 text-center text-gray-500 text-xs space-y-2">
                <div class="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p>Loading vendors and accounting configurations...</p>
            </div>
        `;

        try {
            await _fetchBranchAccounts(branchCode);

            // 1. Fetch Carriers & Suppliers from IndexedDB ('CARRIERS', 'B2B')
            let suppliers = [];
            try {
                if (typeof getAppData === "function") {
                    const rawCarriers = await getAppData("CARRIERS");
                    const carriersList = Object.values(rawCarriers || {}).filter(c => c && (c.CARRIER_CODE || c.CODE));
                    carriersList.forEach(c => {
                        suppliers.push({
                            code: c.CARRIER_CODE || c.CODE,
                            name: c.CARRIER_NAME || c.NAME || c.CARRIER_CODE || c.CODE,
                            type: "CARRIER",
                            gstin: c.GSTIN || "",
                            city: c.CITY || "",
                            state: c.STATE || ""
                        });
                    });

                    const rawB2B = await getAppData("B2B");
                    const b2bSuppliers = Object.values(rawB2B || {}).filter(c => c && (c.B2B_TYPE === "SUPPLIER" || c.B2B_TYPE === "CARRIER") && (c.CODE || c.CLIENT_CODE));
                    b2bSuppliers.forEach(c => {
                        const code = c.CODE || c.CLIENT_CODE;
                        if (!suppliers.some(s => s.code.toUpperCase() === code.toUpperCase())) {
                            suppliers.push({
                                code: code,
                                name: c.B2B_NAME || c.NAME || c.COMPANY_NAME || code,
                                type: "VENDOR",
                                gstin: c.GSTIN || c.B2B_GST || "",
                                city: c.B2B_CITY || c.CITY || "",
                                state: c.B2B_STATE || c.STATE || ""
                            });
                        }
                    });
                }
            } catch (e) {
                console.warn("[VaultPayments] Failed to get suppliers from IDB:", e);
            }

            if (!suppliers.length) {
                try {
                    const r = await fetch("/api/accounting/vendors", { headers: _getAuthHeaders() });
                    if (r.ok) {
                        const data = await r.json();
                        const vList = Array.isArray(data) ? data : (data.vendors || data.suppliers || []);
                        vList.forEach(v => {
                            suppliers.push({
                                code: v.code || v.vendor_code || v.carrier_code,
                                name: v.name || v.vendor_name || v.code,
                                type: v.type || "CARRIER",
                                gstin: v.gstin || "",
                                city: v.city || "",
                                state: v.state || ""
                            });
                        });
                    }
                } catch (_) {}
            }

            suppliers.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            _paneSuppliers = suppliers;

            // Render Form HTML
            view.innerHTML = `
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in duration-150">
                    <!-- Form Header Bar -->
                    <div class="p-5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-rose-100 text-rose-800 rounded border border-rose-200">
                                    MONEY OUT
                                </span>
                                <h2 class="text-base font-bold text-gray-950">Record Vendor Payout</h2>
                            </div>
                            <p class="text-xs text-gray-500 mt-0.5 font-mono">
                                Auto-binds Active Branch: <span class="font-bold text-gray-800">${branchCode}</span> · GL Post: #2000 &rarr; #1020 / #1000
                            </p>
                        </div>
                        <button type="button" id="payFormCancelTopBtn" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>

                    <!-- Form Body -->
                    <form id="payCreateForm" class="p-6 space-y-6">
                        <!-- Supplier Selection Section -->
                        <div class="p-4 bg-gray-50/80 rounded-xl border border-gray-200 space-y-3">
                            <label class="block text-xs font-bold text-gray-900 uppercase tracking-wider">
                                Vendor / Carrier <span class="text-red-600">*</span>
                            </label>
                            <select id="paySupplierSelect" required class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white text-gray-900 font-semibold">
                                <option value="">— Select Vendor / Carrier (${_paneSuppliers.length} available) —</option>
                                ${_paneSuppliers.map(s => {
                                    const isSel = presetSupplierCode && presetSupplierCode.toUpperCase() === s.code.toUpperCase();
                                    return `<option value="${_escapeHtml(s.code)}" data-type="${_escapeHtml(s.type)}" ${isSel ? 'selected' : ''}>[${_escapeHtml(s.type)}] ${_escapeHtml(s.code)} — ${_escapeHtml(s.name)} ${s.city ? `(${s.city})` : ''}</option>`;
                                }).join("")}
                            </select>

                            <!-- Supplier Details Banner -->
                            <div id="paySupplierInfoBanner" class="hidden p-3 bg-white rounded-lg border border-gray-200 text-xs grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div><span class="text-[10px] uppercase font-bold text-gray-400 block">GSTIN</span><span id="paySupplierGstin" class="font-mono font-bold text-gray-800">—</span></div>
                                <div><span class="text-[10px] uppercase font-bold text-gray-400 block">Location</span><span id="paySupplierLocation" class="text-gray-800 font-medium">—</span></div>
                                <div><span class="text-[10px] uppercase font-bold text-gray-400 block">AP Account</span><span class="font-mono font-bold text-rose-700">#2000 Trade Creditors</span></div>
                            </div>
                        </div>

                        <!-- Payment & Settlement Settings -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">Payment Mode <span class="text-red-600">*</span></label>
                                <select id="payPaymentMode" required class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white text-gray-900 font-bold">
                                    <option value="BANK" selected>Bank Transfer (NEFT/RTGS/IMPS)</option>
                                    <option value="UPI">UPI / QR Payout</option>
                                    <option value="CASH">Petty Cash Payout</option>
                                    <option value="CHEQUE">Cheque / Demand Draft</option>
                                    <option value="CARD">Corporate Card</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">Disbursed From Account <span class="text-red-600">*</span></label>
                                <select id="payBankAccount" required class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white text-gray-900 font-mono font-semibold">
                                </select>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">Disbursement Date <span class="text-red-600">*</span></label>
                                <input type="date" id="payDate" value="${today}" required class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white text-gray-900 font-mono">
                            </div>
                        </div>

                        <!-- Amount & Reference -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">
                                    Disbursement Amount (₹) <span class="text-red-600">*</span>
                                </label>
                                <div class="relative">
                                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 font-bold text-sm">₹</span>
                                    <input type="number" step="0.01" min="0.01" id="payAmount" required placeholder="0.00" 
                                           class="w-full pl-8 pr-3 py-2 text-sm font-mono font-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white text-rose-900">
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">
                                    Transaction Ref / UTR / Cheque # <span class="text-gray-400 font-normal">(Optional)</span>
                                </label>
                                <input type="text" id="payRefNo" placeholder="e.g. UTR-982182746 or CHQ-001294" 
                                       class="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white text-gray-900">
                            </div>
                        </div>

                        <!-- Optional Purchase Bill Allocation -->
                        <div class="p-4 bg-purple-50/50 rounded-xl border border-purple-200/70 space-y-2">
                            <div class="flex items-center justify-between">
                                <label class="block text-xs font-bold text-purple-950 uppercase tracking-wider">
                                    Allocate to Carrier / Vendor Bill <span class="text-gray-400 font-normal">(Optional)</span>
                                </label>
                                <span id="payBillCount" class="text-[10px] font-mono text-purple-700">Select vendor to view unpaid bills</span>
                            </div>
                            <select id="payBillSelect" class="w-full px-3 py-2 text-xs border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-gray-900 font-mono">
                                <option value="">— No Specific Bill Allocation (General AP Payment) —</option>
                            </select>
                        </div>

                        <!-- Narration -->
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1 uppercase">Narration / Memo</label>
                            <input type="text" id="payNarration" placeholder="Payment to vendor via bank transfer" 
                                   class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 bg-white text-gray-900">
                        </div>

                        <!-- Live Double-Entry Invariant Preview Box -->
                        <div class="p-4 bg-slate-900 text-white rounded-xl space-y-3 shadow-md">
                            <div class="flex items-center justify-between border-b border-slate-700 pb-2">
                                <span class="text-[11px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                                    <i class="fa-solid fa-scale-balanced"></i> Double-Entry Journal Preview
                                </span>
                                <span id="payPreviewBadge" class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-800 text-slate-300 rounded border border-slate-700">
                                    Balanced (Dr = Cr)
                                </span>
                            </div>
                            <div class="grid grid-cols-2 gap-4 font-mono text-xs">
                                <div class="space-y-1">
                                    <span class="text-[10px] text-slate-400 uppercase block font-sans">Debit (Dr) Entry</span>
                                    <p id="payPreviewDrAccount" class="text-rose-300 font-bold text-xs truncate">#2000 Accounts Payable</p>
                                    <p id="payPreviewDrAmount" class="text-lg font-black text-white">₹0.00</p>
                                </div>
                                <div class="space-y-1 text-right">
                                    <span class="text-[10px] text-slate-400 uppercase block font-sans">Credit (Cr) Entry</span>
                                    <p id="payPreviewCrAccount" class="text-emerald-300 font-bold text-xs truncate">#1020 Operating Bank</p>
                                    <p id="payPreviewCrAmount" class="text-lg font-black text-white">₹0.00</p>
                                </div>
                            </div>
                        </div>

                        <!-- Action Toolbar -->
                        <div class="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                            <button type="button" id="payFormCancelBtn" class="btn btn-secondary">
                                Cancel
                            </button>
                            <button type="submit" id="paySubmitBtn" class="btn btn-blue flex items-center gap-2">
                                <i class="fa-solid fa-check"></i>
                                <span>Post Payment to Ledger</span>
                            </button>
                        </div>
                    </form>
                </div>
            `;

            // Populate account dropdown initially
            _populateAccountDropdown(document.getElementById("payBankAccount"), "BANK");

            // Setup Form Dynamic Handlers
            _setupFormHandlers(branchCode);

            if (presetSupplierCode) {
                const sel = document.getElementById("paySupplierSelect");
                if (sel) {
                    sel.value = presetSupplierCode;
                    sel.dispatchEvent(new Event("change"));
                }
            }

        } catch (err) {
            console.error("[VaultPayments openAddPane error]", err);
            view.innerHTML = `
                <div class="p-6 text-center text-red-600 text-xs">
                    Failed to initialize payment form: ${_escapeHtml(err.message || err)}
                </div>
            `;
        }
    }

    // ── Dynamic Form Event Listeners ────────────────────────────────────────
    function _setupFormHandlers(branchCode) {
        const supplierSelect = document.getElementById("paySupplierSelect");
        const supplierInfoBanner = document.getElementById("paySupplierInfoBanner");
        const supplierGstin = document.getElementById("paySupplierGstin");
        const supplierLocation = document.getElementById("paySupplierLocation");
        const billSelect = document.getElementById("payBillSelect");
        const billCount = document.getElementById("payBillCount");
        const paymentMode = document.getElementById("payPaymentMode");
        const bankAccount = document.getElementById("payBankAccount");
        const amountInput = document.getElementById("payAmount");
        const narrationInput = document.getElementById("payNarration");
        const refNoInput = document.getElementById("payRefNo");

        const previewDrAccount = document.getElementById("payPreviewDrAccount");
        const previewDrAmount = document.getElementById("payPreviewDrAmount");
        const previewCrAccount = document.getElementById("payPreviewCrAccount");
        const previewCrAmount = document.getElementById("payPreviewCrAmount");

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

            const suppCode = supplierSelect?.value || "";
            const suppObj = _paneSuppliers.find(s => s.code === suppCode);
            const suppName = suppObj ? suppObj.name : "Accounts Payable";

            if (previewDrAccount) previewDrAccount.textContent = `#2000 ${suppName}`;
            if (previewDrAmount) previewDrAmount.textContent = _fmtMoney(amt);
            if (previewCrAccount) previewCrAccount.textContent = bankLabel;
            if (previewCrAmount) previewCrAmount.textContent = _fmtMoney(amt);
        }

        // On Mode Change -> Switch Bank / Cash Accounts in dropdown
        paymentMode?.addEventListener("change", () => {
            _populateAccountDropdown(bankAccount, paymentMode.value, bankAccount.value);
            updatePreview();
        });

        bankAccount?.addEventListener("change", updatePreview);
        amountInput?.addEventListener("input", updatePreview);

        // On Supplier Select &rarr; Load Open Bills
        supplierSelect?.addEventListener("change", async () => {
            const code = supplierSelect.value;
            updatePreview();

            if (!code) {
                if (supplierInfoBanner) supplierInfoBanner.classList.add("hidden");
                if (billSelect) billSelect.innerHTML = '<option value="">— No Specific Bill Allocation —</option>';
                if (billCount) billCount.textContent = "Select vendor to view unpaid bills";
                return;
            }

            const s = _paneSuppliers.find(x => x.code === code);
            if (s && supplierInfoBanner) {
                supplierInfoBanner.classList.remove("hidden");
                if (supplierGstin) supplierGstin.textContent = s.gstin || "Unregistered / None";
                if (supplierLocation) supplierLocation.textContent = [s.city, s.state].filter(Boolean).join(", ") || "—";
            }

            // Auto-fill narration default
            if (s && narrationInput && !narrationInput.value) {
                narrationInput.value = `Payment to ${s.name} via ${paymentMode.value}`;
            }

            // Fetch open bills for this vendor
            if (billCount) billCount.textContent = "Checking open bills...";
            try {
                const billRes = await fetch(`/api/accounting/vendor-bills?branch=${encodeURIComponent(branchCode)}&limit=100`, {
                    headers: _getAuthHeaders()
                });
                if (billRes.ok) {
                    const billData = await billRes.json();
                    const allBills = Array.isArray(billData) ? billData : (billData.bills || billData.vendor_bills || []);
                    const suppBills = allBills.filter(b => {
                        const bCode = b.supplier_code || b.vendor?.carrier_code || b.metadata?.supplier_code || b.ref_no || "";
                        const isNotVoid = (b.status || "").toUpperCase() !== "VOID";
                        return isNotVoid && bCode.toUpperCase() === code.toUpperCase();
                    });

                    _paneBills = suppBills;
                    if (billCount) billCount.textContent = `${suppBills.length} open/posted bill(s) available`;

                    if (billSelect) {
                        billSelect.innerHTML = '<option value="">— No Specific Bill Allocation (General AP Payment) —</option>' +
                            suppBills.map(b => {
                                const bNum = b.doc_no || b.bill_number || b.number;
                                const bAmt = parseFloat(b.total_amount || b.amount || 0);
                                const bDt = _fmtDate(b.doc_date || b.date);
                                return `<option value="${_escapeHtml(bNum)}" data-amount="${bAmt}">Bill ${_escapeHtml(bNum)} — ${_fmtMoney(bAmt)} (${bDt})</option>`;
                            }).join("");
                    }
                }
            } catch (e) {
                console.warn("[VaultPayments] Failed to load vendor bills:", e);
                if (billCount) billCount.textContent = "Could not load open bills";
            }
        });

        // On Bill Select &rarr; Auto-fill Amount if empty
        billSelect?.addEventListener("change", () => {
            const opt = billSelect.options[billSelect.selectedIndex];
            if (opt && opt.dataset.amount && (!amountInput.value || parseFloat(amountInput.value) === 0)) {
                amountInput.value = parseFloat(opt.dataset.amount).toFixed(2);
                updatePreview();
            }
        });

        // Cancel Buttons
        const cancelFn = () => {
            if (_activePayment) {
                _renderDetail(_activePayment);
            } else {
                VaultPage.showDetail(false);
            }
        };
        document.getElementById("payFormCancelBtn")?.addEventListener("click", cancelFn);
        document.getElementById("payFormCancelTopBtn")?.addEventListener("click", cancelFn);

        // Form Submit
        document.getElementById("payCreateForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            _submitPaymentForm(branchCode);
        });
    }

    // ── Form Submission Handler ─────────────────────────────────────────────
    async function _submitPaymentForm(branchCode) {
        const supplierSelect = document.getElementById("paySupplierSelect");
        const supplierCode = supplierSelect?.value?.trim();
        const selectedOpt = supplierSelect?.options[supplierSelect.selectedIndex];
        const supplierType = selectedOpt?.dataset.type || "CARRIER";

        const paymentMode = document.getElementById("payPaymentMode")?.value;
        const bankAccountCode = document.getElementById("payBankAccount")?.value;
        const paymentDate = document.getElementById("payDate")?.value;
        const amount = parseFloat(document.getElementById("payAmount")?.value || 0);
        const refNo = document.getElementById("payRefNo")?.value?.trim() || "";
        const billDocNo = document.getElementById("payBillSelect")?.value?.trim() || "";
        const narration = document.getElementById("payNarration")?.value?.trim() || "";

        if (!supplierCode) {
            alert("Please select a Vendor / Carrier from the dropdown.");
            return;
        }

        if (isNaN(amount) || amount <= 0) {
            alert("Please enter a valid disbursement amount greater than 0.");
            return;
        }

        if (!paymentDate) {
            alert("Please specify a payment date.");
            return;
        }

        const submitBtn = document.getElementById("paySubmitBtn");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Posting...`;
        }

        const payload = {
            supplier_code: supplierCode,
            supplier_type: supplierType,
            amount: amount,
            payment_mode: paymentMode,
            bank_account_code: bankAccountCode,
            payment_date: paymentDate,
            branch_code: branchCode,
            ref_no: refNo || undefined,
            narration: narration || undefined,
            bill_doc_no: billDocNo || undefined
        };

        try {
            const res = await fetch("/api/accounting/vendor-payments", {
                method: "POST",
                headers: _getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || errData.message || `Server returned ${res.status}`);
            }

            const result = await res.json();
            const newDocNo = result.doc_no || result.data?.doc_no || "PAY";

            // Success feedback
            if (typeof window.showToast === "function") {
                window.showToast(`Vendor payment ${newDocNo} posted successfully!`, "success");
            } else {
                alert(`Vendor payment ${newDocNo} successfully posted to General Ledger!`);
            }

            // Reload list and show the newly posted payment
            await load(_filterStart, _filterEnd);

            const newlyCreated = _allPayments.find(p => p.doc_no === newDocNo);
            if (newlyCreated) {
                _renderDetail(newlyCreated);
            }

        } catch (err) {
            console.error("[VaultPayments submit error]", err);
            alert("Failed to post vendor payment: " + (err.message || err));
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Post Payment to Ledger</span>`;
            }
        }
    }

    // ── Void / Reversal Workflow ────────────────────────────────────────────
    async function voidPayment(docNo) {
        if (!docNo) return;

        const reason = prompt(
            `Enter mandatory reason for voiding vendor payment ${docNo}:\n(This will post a balanced reversal Journal Entry in the General Ledger)`,
            "Vendor payment cancellation / wrong UTR"
        );
        if (!reason || !reason.trim()) return;

        window.setLoading?.(true, "Voiding & reversing vendor payout in General Ledger...", "detail");

        try {
            const res = await fetch(`/api/accounting/vendor-payments/${encodeURIComponent(docNo)}/void`, {
                method: "POST",
                headers: _getAuthHeaders(),
                body: JSON.stringify({ reason: reason.trim(), narration: reason.trim() })
            });

            if (!res.ok) {
                // Fallback to ledger transaction void endpoint
                const fbRes = await fetch(`/api/ledger/transactions/${encodeURIComponent(docNo)}/void?reason=${encodeURIComponent(reason.trim())}`, {
                    method: "POST",
                    headers: _getAuthHeaders()
                });
                if (!fbRes.ok) {
                    const errData = await fbRes.json().catch(() => ({}));
                    throw new Error(errData.detail || errData.message || `Server returned ${fbRes.status}`);
                }
            }

            alert(`Vendor payment ${docNo} has been successfully voided and reversed via General Ledger Journal Entry.`);
            await load(_filterStart, _filterEnd);

            const updated = _allPayments.find(p => p.doc_no === docNo);
            if (updated) {
                _renderDetail(updated);
            } else {
                _activePayment = null;
                VaultPage.showDetail(false);
            }

        } catch (err) {
            console.error("[VaultPayments void error]", err);
            alert("Failed to void vendor payment: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Main Load ───────────────────────────────────────────────────────────
    async function load(startDate = null, endDate = null) {
        _injectListPane();
        window.setLoading?.(true, "Loading vendor payments...", "list");

        try {
            const activeBranch = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "";
            await _fetchBranchAccounts(activeBranch);

            let url = "/api/accounting/vendor-payments";
            const queryParts = [];
            if (activeBranch && activeBranch.toUpperCase() !== "ALL") {
                queryParts.push(`branch=${encodeURIComponent(activeBranch)}`);
            }
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);
            if (queryParts.length) url += `?${queryParts.join("&")}`;

            const res = await fetch(url, { headers: _getAuthHeaders() });
            if (!res.ok) {
                throw new Error(`Failed to load vendor payments (HTTP ${res.status})`);
            }

            const data = await res.json();
            _allPayments = Array.isArray(data) ? data : (data.payments || data.vendor_payments || data.data || []);
            _renderList();

            // Do not auto-select on load — show empty placeholder until user selects
            _activePayment = null;
            VaultPage.showDetail(false);
        } catch (err) {
            console.error("[VaultPayments load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) {
                msg.textContent = "Failed to load vendor payments: " + (err.message || err);
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
        openNewPaymentPane: openAddPane,
        voidPayment
    };
})();

window.VaultPayments = VaultPayments;
