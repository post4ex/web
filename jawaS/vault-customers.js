// ============================================================================
// VAULT-CUSTOMERS.JS — Customers (Accounts Receivable / Trade Debtors 1010)
// Tile: customers
// Architecture:
// 1. Instant List: Loads B2B master records from IndexedDB (0ms latency).
// 2. Background Sync: Overlays live AR balances from /api/accounting/clients.
// 3. Selection Detail: Fetches authoritative chronological Ledger Statement
//    via /api/accounting/clients/{code}/statement (Account 1010 Dr/Cr ledger).
// Global button standards (.btn, .btn-sm, .btn-blue, .btn-secondary) applied.
// ============================================================================

const VaultCustomers = (() => {

    let _customers = [];
    let _balancesMap = {};
    let _activeCustomer = null;
    let _activeStatement = null;
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterBranch = "";
    let _filterStatus = "ALL";
    let _statementLoading = false;

    const _escapeHtml = (str) => {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

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

    // ── Filter State & Badge ──────────────────────────────────────────────────
    function _hasActiveFilters() {
        return !!_filterStart || !!_filterEnd || !!_filterBranch || (_filterStatus && _filterStatus !== "ALL");
    }

    function _updateFilterButtonState() {
        const btn = document.getElementById("vaultFilterBtn");
        if (!btn) return;
        const active = _hasActiveFilters();
        btn.classList.toggle("filter-active", active);
        if (active) {
            btn.classList.add("bg-red-100", "text-red-700");
            btn.classList.remove("text-gray-500");
            btn.title = "Filters Active (Click to modify)";
        } else {
            btn.classList.remove("bg-red-100", "text-red-700", "filter-active");
            btn.classList.add("text-gray-500");
            btn.title = "Filter Customers & Statements";
        }
    }

    function _setupFilterModal() {
        let modal = document.getElementById("custFilterModal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "custFilterModal";
            modal.className = "modal-overlay hidden";
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-lg">
                    <div class="flex justify-between items-center border-b pb-3">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                                <i class="fa-solid fa-users text-sm"></i>
                            </div>
                            <div>
                                <h2 class="text-base font-bold text-gray-900">Filter Customers &amp; Ledger Statements</h2>
                                <p class="text-[11px] text-gray-500">Filter customer master list and ledger statement period</p>
                            </div>
                        </div>
                        <button id="close-cust-filter-modal" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1 leading-none" aria-label="Close">✕</button>
                    </div>

                    <!-- Date Presets for Statement -->
                    <div>
                        <span class="block font-semibold text-gray-700 text-xs mb-1.5">Statement Period Presets</span>
                        <div class="flex flex-wrap gap-1.5">
                            <button type="button" class="cust-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition" data-preset="all">All Time</button>
                            <button type="button" class="cust-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition" data-preset="month">This Month</button>
                            <button type="button" class="cust-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition" data-preset="cfy">Current FY</button>
                            <button type="button" class="cust-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition" data-preset="pfy">Previous FY</button>
                        </div>
                    </div>

                    <!-- Date Range -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label for="cust-filter-start-date" class="block font-semibold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="cust-filter-start-date" class="form-input text-xs w-full">
                        </div>
                        <div>
                            <label for="cust-filter-end-date" class="block font-semibold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="cust-filter-end-date" class="form-input text-xs w-full">
                        </div>
                        <div>
                            <label for="cust-filter-branch" class="block font-semibold text-gray-700 mb-1">Branch</label>
                            <select id="cust-filter-branch" class="form-input text-xs w-full">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                        <div>
                            <label for="cust-filter-status" class="block font-semibold text-gray-700 mb-1">Customer Status</label>
                            <select id="cust-filter-status" class="form-input text-xs w-full">
                                <option value="ALL">All Statuses</option>
                                <option value="ACTIVE">Active Only</option>
                                <option value="INACTIVE">Inactive Only</option>
                            </select>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-3 border-t">
                        <button id="cust-reset-filters" type="button" class="btn-ghost btn-sm">Reset</button>
                        <button id="cust-apply-filters" type="button" class="btn btn-sm bg-blue-600 text-white hover:bg-blue-700 shadow-xs font-semibold">Apply Filters</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById("close-cust-filter-modal").onclick = closeFilterModal;
            modal.onclick = (e) => { if (e.target === modal) closeFilterModal(); };
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && !modal.classList.contains("hidden")) closeFilterModal();
            });

            // Preset handlers
            modal.querySelectorAll(".cust-preset-btn").forEach(btn => {
                btn.onclick = () => {
                    const preset = btn.dataset.preset;
                    const now = new Date();
                    const year = now.getFullYear();
                    const startYear = now.getMonth() < 3 ? year - 1 : year;
                    const startEl = document.getElementById("cust-filter-start-date");
                    const endEl = document.getElementById("cust-filter-end-date");

                    if (preset === "all") {
                        if (startEl) startEl.value = "";
                        if (endEl) endEl.value = "";
                    } else if (preset === "month") {
                        const m = String(now.getMonth() + 1).padStart(2, '0');
                        const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
                        if (startEl) startEl.value = `${year}-${m}-01`;
                        if (endEl) endEl.value = `${year}-${m}-${lastDay}`;
                    } else if (preset === "cfy") {
                        if (startEl) startEl.value = `${startYear}-04-01`;
                        if (endEl) endEl.value = `${startYear + 1}-03-31`;
                    } else if (preset === "pfy") {
                        if (startEl) startEl.value = `${startYear - 1}-04-01`;
                        if (endEl) endEl.value = `${startYear}-03-31`;
                    }
                };
            });

            document.getElementById("cust-apply-filters").onclick = () => {
                _filterStart = document.getElementById("cust-filter-start-date")?.value || "";
                _filterEnd = document.getElementById("cust-filter-end-date")?.value || "";
                _filterBranch = document.getElementById("cust-filter-branch")?.value || "";
                _filterStatus = document.getElementById("cust-filter-status")?.value || "ALL";

                closeFilterModal();
                _updateFilterButtonState();
                _renderList();

                if (_activeCustomer) {
                    _renderCustomerDetail(_activeCustomer, _filterStart, _filterEnd);
                }
            };

            document.getElementById("cust-reset-filters").onclick = () => {
                _filterStart = "";
                _filterEnd = "";
                _filterBranch = "";
                _filterStatus = "ALL";

                const sEl = document.getElementById("cust-filter-start-date");
                const eEl = document.getElementById("cust-filter-end-date");
                const bEl = document.getElementById("cust-filter-branch");
                const stEl = document.getElementById("cust-filter-status");
                if (sEl) sEl.value = "";
                if (eEl) eEl.value = "";
                if (bEl) bEl.value = "";
                if (stEl) stEl.value = "ALL";

                closeFilterModal();
                _updateFilterButtonState();
                _renderList();

                if (_activeCustomer) {
                    _renderCustomerDetail(_activeCustomer, "", "");
                }
            };
        }

        // Populate branches into dropdown if available
        _populateBranchFilterOptions();
    }

    async function _populateBranchFilterOptions() {
        const branchSelect = document.getElementById("cust-filter-branch");
        if (!branchSelect) return;
        try {
            if (typeof getAppData === "function") {
                const bData = await getAppData("BRANCHES");
                if (bData) {
                    const branches = Array.isArray(bData) ? bData : Object.values(bData);
                    const currentVal = branchSelect.value;
                    branchSelect.innerHTML = `<option value="">All Branches</option>` + branches.map(b => {
                        const code = String(b.BRANCH_CODE || '').toUpperCase();
                        const name = b.BRANCH_NAME || code;
                        return `<option value="${_escapeHtml(code)}">${_escapeHtml(name)} (${_escapeHtml(code)})</option>`;
                    }).join("");
                    if (currentVal) branchSelect.value = currentVal;
                }
            }
        } catch (_) {}
    }

    function openFilterModal() {
        _setupFilterModal();
        const modal = document.getElementById("custFilterModal");
        if (!modal) return;
        const sEl = document.getElementById("cust-filter-start-date");
        const eEl = document.getElementById("cust-filter-end-date");
        const bEl = document.getElementById("cust-filter-branch");
        const stEl = document.getElementById("cust-filter-status");
        if (sEl) sEl.value = _filterStart;
        if (eEl) eEl.value = _filterEnd;
        if (bEl) bEl.value = _filterBranch;
        if (stEl) stEl.value = _filterStatus || "ALL";
        modal.classList.remove("hidden");
    }

    function closeFilterModal() {
        document.getElementById("custFilterModal")?.classList.add("hidden");
    }

    // ── Setup Left List Pane ────────────────────────────────────────────────
    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search customers by name, code, city, GSTIN...";
            search.oninput = () => _renderList();
        }

        const addBtn = document.getElementById("vaultAddBtn");
        if (addBtn) addBtn.classList.add("hidden");

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => openFilterModal();
            _updateFilterButtonState();
        }
    }

    // ── Load Customers (IDB First + Background AR Balance Sync) ─────────────
    async function load() {
        _injectListPane();
        window.setLoading?.(true, "Loading customers...", "list");

        const listEl = document.getElementById("vaultList");
        if (listEl) {
            listEl.innerHTML = `
                <li class="p-6 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Loading Customer Master...</p>
                </li>
            `;
        }

        try {
            let b2bList = [];

            // 1. Fetch Master from IndexedDB (B2B)
            if (typeof getAppData === 'function') {
                try {
                    const rawB2B = await getAppData("B2B");
                    b2bList = Object.values(rawB2B || {}).filter(c => c && (c.CODE || c.CLIENT_CODE));
                } catch (e) {
                    console.warn("[VaultCustomers] IDB B2B read failed:", e);
                }
            }

            // 2. Fallback to API if IDB empty
            if (!b2bList || b2bList.length === 0) {
                const token = _getAuthToken();
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                try {
                    const r = await fetch('/api/b2b', { headers });
                    if (r.ok) {
                        const json = await r.json();
                        b2bList = Array.isArray(json) ? json : (json?.data || json?.clients || []);
                    }
                } catch (e) {
                    console.warn("[VaultCustomers] API fallback failed:", e);
                }
            }

            // Normalize records
            _customers = (b2bList || []).map(c => {
                const code = String(c.CODE || c.CLIENT_CODE || c.code || "").toUpperCase().trim();
                const name = c.B2B_NAME || c.NAME || c.COMPANY_NAME || c.full_name || code;
                return {
                    id: c.id || code,
                    code: code,
                    client_code: code,
                    account_code: '1010', // Standard COA Trade Debtors
                    name: name,
                    full_name: name,
                    gstin: c.GSTIN || c.gstin || '',
                    gst_code: c.GST_CODE || '',
                    address: c.B2B_ADDRESS || c.ADDRESS || '',
                    city: c.B2B_CITY || c.CITY || '',
                    state: c.B2B_STATE || c.STATE || '',
                    pincode: c.B2B_PINCODE || c.PINCODE || '',
                    phone: c.MOBILE_NUMBER || c.PHONE || '',
                    email: c.EMAIL || c.email || '',
                    credit_limit: Number(c.CREDIT_LIMIT || 0),
                    credit_days: c.CREDIT_DAYS || 30,
                    bill_cycle: c.BILL_CYCLE || 'M',
                    branch: c.BRANCH || '',
                    status: (c.STATUS || 'ACTIVE').toUpperCase(),
                    balance: 0,
                    total_invoiced: 0,
                    total_received: 0,
                };
            }).sort((a, b) => a.name.localeCompare(b.name));

            // Instant render from IDB
            _renderList();

            // Do not auto-select on load — show empty placeholder until user selects
            _activeCustomer = null;
            VaultPage?.showDetail?.(false);

            // 3. Background Sync: Fetch live AR balances from double-entry ledger
            _syncLiveBalances();

        } catch (err) {
            console.error("[VaultCustomers.load error]", err);
            if (listEl) {
                listEl.innerHTML = `<li class="p-4 text-center text-red-600 text-xs">Failed to load customers: ${_escapeHtml(err.message)}</li>`;
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Background Balance Sync ─────────────────────────────────────────────
    async function _syncLiveBalances() {
        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const r = await fetch('/api/accounting/clients', { headers });
            if (!r.ok) return;
            const resData = await r.json();
            const liveClients = Array.isArray(resData) ? resData : (resData?.clients || resData?.data || []);

            _balancesMap = {};
            liveClients.forEach(c => {
                const code = String(c.client_code || c.code || "").toUpperCase().trim();
                if (code) {
                    _balancesMap[code] = {
                        balance: Number(c.balance || c.outstanding || 0),
                        total_invoiced: Number(c.total_invoiced || 0),
                        total_received: Number(c.total_received || 0)
                    };
                }
            });

            // Update local records
            _customers.forEach(cust => {
                if (_balancesMap[cust.code]) {
                    cust.balance = _balancesMap[cust.code].balance;
                    cust.total_invoiced = _balancesMap[cust.code].total_invoiced;
                    cust.total_received = _balancesMap[cust.code].total_received;
                }
            });

            // Update badges in list without full re-render
            const ul = document.getElementById("vaultList");
            if (ul) {
                ul.querySelectorAll("li[data-code]").forEach(li => {
                    const code = li.dataset.code;
                    const balBadge = li.querySelector(".cust-bal-badge");
                    if (balBadge && _balancesMap[code]) {
                        const bal = _balancesMap[code].balance;
                        balBadge.textContent = bal !== 0 ? (_fmtMoney(Math.abs(bal)) + (bal > 0 ? " Dr" : " Cr")) : "₹0.00";
                        balBadge.className = `cust-bal-badge font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            bal > 0 ? 'bg-red-50 text-red-700 border border-red-200' :
                            bal < 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            'bg-slate-100 text-slate-600'
                        }`;
                    }
                });
            }

            // If active customer is open, update top balance summary
            if (_activeCustomer && _balancesMap[_activeCustomer.code]) {
                _activeCustomer.balance = _balancesMap[_activeCustomer.code].balance;
                const headerBalEl = document.getElementById("custHeaderBal");
                if (headerBalEl) {
                    const b = _activeCustomer.balance;
                    headerBalEl.textContent = _fmtMoney(Math.abs(b)) + (b > 0 ? " Dr" : b < 0 ? " Cr" : "");
                    headerBalEl.className = `text-2xl font-mono font-extrabold ${b > 0 ? 'text-red-600' : b < 0 ? 'text-emerald-600' : 'text-gray-900'}`;
                }
            }

        } catch (e) {
            console.warn("[VaultCustomers] Live balance sync warning:", e);
        }
    }

    // ── Render Left List ────────────────────────────────────────────────────
    function _renderList() {
        const ul = document.getElementById("vaultList");
        const msgEl = document.getElementById("vaultListMsg");
        if (!ul) return;
        ul.innerHTML = "";

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _customers.filter(c => {
            if (_filterBranch && String(c.branch || '').toUpperCase() !== String(_filterBranch).toUpperCase()) {
                return false;
            }
            if (_filterStatus && _filterStatus !== "ALL" && String(c.status || 'ACTIVE').toUpperCase() !== String(_filterStatus).toUpperCase()) {
                return false;
            }
            if (!q) return true;
            const code = (c.code || "").toLowerCase();
            const name = (c.name || "").toLowerCase();
            const city = (c.city || "").toLowerCase();
            const gstin = (c.gstin || "").toLowerCase();
            const phone = (c.phone || "").toLowerCase();
            return code.includes(q) || name.includes(q) || city.includes(q) || gstin.includes(q) || phone.includes(q);
        });

        if (!filtered.length) {
            if (msgEl) {
                msgEl.textContent = q ? "No matching customers found." : "No customers available in B2B master.";
                msgEl.classList.remove("hidden");
            }
            return;
        }
        if (msgEl) msgEl.classList.add("hidden");

        ul.innerHTML = filtered.map(c => {
            const isSelected = _activeCustomer && _activeCustomer.code === c.code;
            const bal = c.balance || 0;
            return `
                <li data-code="${_escapeHtml(c.code)}" class="p-3 bg-white rounded-xl border ${isSelected ? 'border-blue-600 bg-blue-50/40 shadow-sm ring-1 ring-blue-500' : 'border-gray-200'} hover:border-blue-400 cursor-pointer transition shadow-sm space-y-1.5">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-gray-950 text-xs font-bold truncate">${_escapeHtml(c.name)}</strong>
                        <span class="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-slate-100 text-slate-700 border border-slate-200 flex-shrink-0">
                            ${_escapeHtml(c.code)}
                        </span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500">
                        <span class="truncate max-w-[130px] text-gray-600">
                            ${_escapeHtml(c.city || c.branch || 'Direct')} ${c.gstin ? `· <span class="font-mono text-[9px]">${_escapeHtml(c.gstin.slice(0, 5))}…</span>` : ''}
                        </span>
                        <span class="cust-bal-badge font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            bal > 0 ? 'bg-red-50 text-red-700 border border-red-200' :
                            bal < 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            'bg-slate-100 text-slate-600'
                        }">
                            ${bal !== 0 ? (_fmtMoney(Math.abs(bal)) + (bal > 0 ? ' Dr' : ' Cr')) : '₹0.00'}
                        </span>
                    </div>
                </li>
            `;
        }).join("");

        const items = Array.from(ul.querySelectorAll("li[data-code]"));
        items.forEach((li) => {
            li.addEventListener("click", () => {
                items.forEach(x => {
                    x.classList.remove("border-blue-600", "bg-blue-50/40", "shadow-sm", "ring-1", "ring-blue-500");
                    x.classList.add("border-gray-200");
                });
                li.classList.remove("border-gray-200");
                li.classList.add("border-blue-600", "bg-blue-50/40", "shadow-sm", "ring-1", "ring-blue-500");
                const code = li.dataset.code;
                const c = _customers.find(item => item.code === code);
                if (c) _selectCustomer(c);
            });
        });
    }

    function _selectCustomer(cust) {
        _activeCustomer = cust;
        VaultPage?.showDetail?.(true);
        VaultPage?.showDetailPane?.();
        _renderCustomerDetail(cust, _filterStart, _filterEnd);
    }

    // ── Render Customer Detail Pane ─────────────────────────────────────────
    async function _renderCustomerDetail(cust, startDate = "", endDate = "") {
        _activeCustomer = cust;
        VaultPage?.showDetail?.(true);
        VaultPage?.showDetailPane?.();
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const code = cust.code || "";
        const name = cust.name || cust.full_name || code;
        const bal = cust.balance || 0;

        view.innerHTML = `
            <div class="space-y-5 animate-in fade-in duration-150">
                <!-- Top Header Card -->
                <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center flex-wrap gap-2">
                            <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-800 rounded border border-blue-200">
                                B2B CUSTOMER
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">
                                CODE: ${_escapeHtml(code)}
                            </span>
                            ${cust.branch ? `<span class="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-200">BRANCH: ${_escapeHtml(cust.branch)}</span>` : ''}
                            ${cust.gstin ? `<span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-50 text-amber-800 rounded border border-amber-200">GSTIN: ${_escapeHtml(cust.gstin)}</span>` : ''}
                        </div>
                        <h1 class="text-xl font-black text-gray-950">${_escapeHtml(name)}</h1>
                        <p class="text-xs text-gray-500 font-mono">GL Account: #1010 (Accounts Receivable / Trade Debtors)</p>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="text-right border-l md:border-l border-gray-200 pl-4">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Outstanding AR Balance</span>
                            <span id="custHeaderBal" class="text-2xl font-mono font-extrabold ${bal > 0 ? 'text-red-600' : bal < 0 ? 'text-emerald-600' : 'text-gray-900'}">
                                ${_fmtMoney(Math.abs(bal))}${bal > 0 ? ' Dr' : bal < 0 ? ' Cr' : ''}
                            </span>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            <button id="custNewInvBtn" type="button" class="btn btn-sm btn-blue flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-plus"></i> New Invoice
                            </button>
                            <button id="custNewReceiptBtn" type="button" class="btn btn-sm btn-emerald bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-hand-holding-dollar"></i> Record Receipt
                            </button>
                            <button id="custPrintStmtBtn" type="button" class="btn btn-sm btn-secondary flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-print"></i> Print Statement
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Master Profile Card -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <!-- Billing & Address -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-2">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid fa-location-dot text-blue-600 mr-1.5"></i> Billing Address</span>
                            <span class="text-[10px] font-mono text-gray-500">${_escapeHtml(cust.gst_code ? `State Code: ${cust.gst_code}` : '')}</span>
                        </div>
                        <p class="text-xs text-gray-800 leading-relaxed font-medium">
                            ${_escapeHtml(cust.address) || '—'}<br>
                            ${_escapeHtml(cust.city ? cust.city + ', ' : '')}${_escapeHtml(cust.state || '')} ${_escapeHtml(cust.pincode ? '— ' + cust.pincode : '')}
                        </p>
                    </div>

                    <!-- Contact Details -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-2">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid fa-address-book text-emerald-600 mr-1.5"></i> Contact & Alert</span>
                            <span class="text-[10px] text-gray-500 font-mono">${_escapeHtml(cust.status)}</span>
                        </div>
                        <div class="text-xs text-gray-800 space-y-1 font-medium">
                            <div class="flex items-center gap-2">
                                <span class="text-gray-500 w-12 text-[10px] font-bold">PHONE:</span>
                                <span class="font-mono text-gray-950">${_escapeHtml(cust.phone || '—')}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-gray-500 w-12 text-[10px] font-bold">EMAIL:</span>
                                <span class="text-gray-950 truncate">${_escapeHtml(cust.email || '—')}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Financial & Credit Limits -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-2">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid fa-credit-card text-purple-600 mr-1.5"></i> Credit & Terms</span>
                            <span class="text-[10px] text-blue-700 font-bold">CYCLE: ${_escapeHtml(cust.bill_cycle)}</span>
                        </div>
                        <div class="text-xs text-gray-800 space-y-1 font-medium">
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500 text-[10px] font-bold">CREDIT LIMIT:</span>
                                <span class="font-mono font-bold text-gray-950">${cust.credit_limit > 0 ? _fmtMoney(cust.credit_limit) : 'No Limit'}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500 text-[10px] font-bold">CREDIT PERIOD:</span>
                                <span class="font-mono font-bold text-gray-950">${_escapeHtml(cust.credit_days)} Days</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Statement Section -->
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" id="custStatementPrintArea">
                    <!-- Statement Header Toolbar with Global Filter trigger -->
                    <div class="p-4 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2">
                            <h2 class="text-xs font-extrabold uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                                <i class="fa-solid fa-file-invoice text-blue-600"></i> Running Ledger Statement
                            </h2>
                            ${(startDate || endDate) ? `
                                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                    ${startDate ? _fmtDate(startDate) : 'Start'} → ${endDate ? _fmtDate(endDate) : 'Present'}
                                </span>
                            ` : `
                                <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-700">
                                    All Time
                                </span>
                            `}
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" id="stmtFilterModalBtn" class="btn btn-sm ${_hasActiveFilters() ? 'bg-red-100 text-red-700 border-red-300' : 'btn-secondary'} flex items-center gap-1.5">
                                <i class="fa-solid fa-filter text-xs"></i>
                                <span>Filter Period</span>
                            </button>
                            ${(startDate || endDate) ? `
                                <button type="button" id="stmtResetFilterBtn" class="btn btn-sm btn-ghost text-red-600">Clear</button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Statement KPI Summary Box -->
                    <div id="stmtKpiContainer" class="p-4 border-b border-gray-200 bg-white grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span class="block text-[10px] font-bold uppercase text-slate-500">Opening Balance</span>
                            <span id="kpiOpeningBal" class="text-sm font-mono font-bold text-slate-800">Calculating...</span>
                        </div>
                        <div class="p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <span class="block text-[10px] font-bold uppercase text-blue-700">Total Billed / Debit (Dr)</span>
                            <span id="kpiTotalDr" class="text-sm font-mono font-bold text-blue-900">Calculating...</span>
                        </div>
                        <div class="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                            <span class="block text-[10px] font-bold uppercase text-emerald-700">Total Received / Credit (Cr)</span>
                            <span id="kpiTotalCr" class="text-sm font-mono font-bold text-emerald-900">Calculating...</span>
                        </div>
                        <div class="p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <span class="block text-[10px] font-bold uppercase text-purple-700">Closing Balance (Net AR)</span>
                            <span id="kpiClosingBal" class="text-sm font-mono font-bold text-purple-900">Calculating...</span>
                        </div>
                    </div>

                    <!-- Statement Table Area -->
                    <div id="stmtTableContainer" class="p-4">
                        <div class="p-8 text-center text-gray-500 text-xs space-y-2">
                            <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <p>Loading live ledger entries from Accounts Engine...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Wire Action Buttons
        document.getElementById("custNewInvBtn").onclick = () => {
            if (typeof VaultSalesInvoices !== 'undefined' && typeof VaultSalesInvoices.openNewInvoicePane === 'function') {
                if (typeof VaultPage !== 'undefined' && typeof VaultPage.selectTile === 'function') {
                    VaultPage.selectTile('sales-invoices').then(() => {
                        setTimeout(() => VaultSalesInvoices.openNewInvoicePane(cust.code), 100);
                    });
                } else {
                    VaultSalesInvoices.openNewInvoicePane(cust.code);
                }
            } else {
                alert(`Please open Sales Invoices tile to create an invoice for ${cust.name}.`);
            }
        };

        document.getElementById("custNewReceiptBtn").onclick = () => {
            if (typeof VaultReceipts !== 'undefined' && typeof VaultReceipts.openAddPane === 'function') {
                if (typeof VaultPage !== 'undefined' && typeof VaultPage.selectTile === 'function') {
                    VaultPage.selectTile('receipts').then(() => {
                        setTimeout(() => VaultReceipts.openAddPane(cust.code), 100);
                    });
                } else {
                    VaultReceipts.openAddPane(cust.code);
                }
            } else {
                VaultPage?.selectTile?.('receipts');
            }
        };

        document.getElementById("custPrintStmtBtn").onclick = async () => {
            let activeBranchCode = (typeof VaultPage !== 'undefined' && typeof VaultPage.getActiveBranch === 'function')
                ? VaultPage.getActiveBranch()
                : (typeof getActiveBranch === 'function' ? getActiveBranch() : '');
            
            if (!activeBranchCode && cust && cust.branch) {
                activeBranchCode = cust.branch;
            }

            let branchObj = {};
            if (typeof getAppData === 'function') {
                try {
                    const branchesData = await getAppData('BRANCHES');
                    if (branchesData) {
                        const allBranches = Array.isArray(branchesData) ? branchesData : Object.values(branchesData);
                        if (activeBranchCode) {
                            branchObj = allBranches.find(b => String(b.BRANCH_CODE || '').toUpperCase() === String(activeBranchCode).toUpperCase()) || {};
                        }
                        if (!branchObj.BRANCH_NAME && allBranches.length > 0) {
                            branchObj = allBranches[0];
                        }
                    }
                } catch (e) {
                    console.warn("[VaultCustomers] Branch resolution error:", e);
                }
            }

            if (typeof VaultPrint !== 'undefined' && typeof VaultPrint.printStatement === 'function') {
                const stmtData = _activeStatement || {
                    cust: cust,
                    entries: [],
                    openingBalance: 0,
                    totalDebit: 0,
                    totalCredit: 0,
                    closingBalance: cust.balance || 0,
                    startDate: _filterStart,
                    endDate: _filterEnd
                };

                VaultPrint.printStatement(
                    cust,
                    cust.code,
                    stmtData.entries || [],
                    stmtData.closingBalance !== undefined ? stmtData.closingBalance : (cust.balance || 0),
                    'Party Ledger Statement',
                    {
                        branch: branchObj,
                        startDate: stmtData.startDate,
                        endDate: stmtData.endDate,
                        openingBalance: stmtData.openingBalance || 0,
                        totalDebit: stmtData.totalDebit || 0,
                        totalCredit: stmtData.totalCredit || 0,
                        closingBalance: stmtData.closingBalance !== undefined ? stmtData.closingBalance : (cust.balance || 0)
                    }
                );
            } else {
                window.print();
            }
        };

        const stmtFilterBtn = document.getElementById("stmtFilterModalBtn");
        if (stmtFilterBtn) {
            stmtFilterBtn.onclick = () => openFilterModal();
        }

        const resetBtn = document.getElementById("stmtResetFilterBtn");
        if (resetBtn) {
            resetBtn.onclick = () => {
                _filterStart = "";
                _filterEnd = "";
                const sEl = document.getElementById("cust-filter-start-date");
                const eEl = document.getElementById("cust-filter-end-date");
                if (sEl) sEl.value = "";
                if (eEl) eEl.value = "";
                _updateFilterButtonState();
                _renderCustomerDetail(cust, "", "");
            };
        }

        // Fetch Live Statement from Backend
        await _fetchAndRenderStatement(cust, startDate, endDate);
    }

    // ── Fetch & Render Live Statement Table ──────────────────────────────────
    async function _fetchAndRenderStatement(cust, startDate, endDate) {
        const tableContainer = document.getElementById("stmtTableContainer");
        const kpiOpening = document.getElementById("kpiOpeningBal");
        const kpiDr = document.getElementById("kpiTotalDr");
        const kpiCr = document.getElementById("kpiTotalCr");
        const kpiClosing = document.getElementById("kpiClosingBal");
        if (!tableContainer) return;

        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            let url = `/api/accounting/clients/${encodeURIComponent(cust.code)}/statement?`;
            const params = new URLSearchParams();
            if (startDate) params.append("start_date", startDate);
            if (endDate) params.append("end_date", endDate);
            url += params.toString();

            let stmt = null;
            try {
                const r = await fetch(url, { headers });
                if (r.ok) {
                    stmt = await r.json();
                } else {
                    // Fallback to accounts 1010 statement
                    const fbUrl = `/api/accounting/accounts/1010/statement?entity_code=${encodeURIComponent(cust.code)}&${params.toString()}`;
                    const fb = await fetch(fbUrl, { headers });
                    if (fb.ok) stmt = await fb.json();
                }
            } catch (err) {
                console.warn("[VaultCustomers] Statement fetch error:", err);
            }

            if (!stmt) {
                tableContainer.innerHTML = `
                    <div class="p-6 text-center text-gray-500 text-xs">
                        Unable to fetch statement from backend. Please check network connection.
                    </div>
                `;
                return;
            }

            const openingBal = Number(stmt.opening_balance || 0);
            const totalDr    = Number(stmt.total_debit || 0);
            const totalCr    = Number(stmt.total_credit || 0);
            const closingBal = Number(stmt.closing_balance !== undefined ? stmt.closing_balance : (openingBal + totalDr - totalCr));
            const rawEntries = Array.isArray(stmt.entries) ? stmt.entries : (stmt.lines || stmt.data || []);
            const entries = rawEntries.filter(e => {
                const status = (e.status || e.header_status || "").toUpperCase();
                const narr = (e.narration || e.memo || "").toLowerCase();
                if (status === "VOID") return false;
                if (narr.includes("reversal of voided document") || narr.includes("[voided:")) return false;
                return true;
            });

            // Cache statement for Tally printing
            _activeStatement = {
                cust: cust,
                entries: entries,
                openingBalance: openingBal,
                totalDebit: totalDr,
                totalCredit: totalCr,
                closingBalance: closingBal,
                startDate: startDate,
                endDate: endDate
            };

            // Update KPIs
            if (kpiOpening) kpiOpening.textContent = _fmtMoney(Math.abs(openingBal)) + (openingBal > 0 ? " Dr" : openingBal < 0 ? " Cr" : "");
            if (kpiDr) kpiDr.textContent = _fmtMoney(totalDr);
            if (kpiCr) kpiCr.textContent = _fmtMoney(totalCr);
            if (kpiClosing) {
                kpiClosing.textContent = _fmtMoney(Math.abs(closingBal)) + (closingBal > 0 ? " Dr" : closingBal < 0 ? " Cr" : "");
                kpiClosing.className = `text-sm font-mono font-bold ${closingBal > 0 ? 'text-red-700' : closingBal < 0 ? 'text-emerald-700' : 'text-gray-900'}`;
            }

            // Update active customer balance in memory
            cust.balance = closingBal;
            const headerBalEl = document.getElementById("custHeaderBal");
            if (headerBalEl) {
                headerBalEl.textContent = _fmtMoney(Math.abs(closingBal)) + (closingBal > 0 ? ' Dr' : closingBal < 0 ? ' Cr' : '');
                headerBalEl.className = `text-2xl font-mono font-extrabold ${closingBal > 0 ? 'text-red-600' : closingBal < 0 ? 'text-emerald-600' : 'text-gray-900'}`;
            }

            if (!entries.length) {
                tableContainer.innerHTML = `
                    <div class="p-12 text-center text-gray-400 space-y-2">
                        <div class="text-3xl">📄</div>
                        <div class="text-sm font-semibold text-gray-700">No Ledger Transactions Found</div>
                        <div class="text-xs text-gray-500">There are no posted invoices, receipts, or credit notes for this customer in the selected date range.</div>
                    </div>
                `;
                return;
            }

            // Render Chronological Statement Table
            tableContainer.innerHTML = `
                <div class="overflow-x-auto rounded-lg border border-gray-200">
                    <table class="min-w-full divide-y divide-gray-200 text-xs">
                        <thead class="bg-gray-100 text-gray-950 font-bold uppercase text-[10px] tracking-wider">
                            <tr>
                                <th class="px-3 py-2.5 text-left">Date</th>
                                <th class="px-3 py-2.5 text-left">Voucher / Ref</th>
                                <th class="px-3 py-2.5 text-left">Type</th>
                                <th class="px-3 py-2.5 text-left">Branch</th>
                                <th class="px-3 py-2.5 text-left">Narration / Particulars</th>
                                <th class="px-3 py-2.5 text-right text-blue-900">Debit (Dr)</th>
                                <th class="px-3 py-2.5 text-right text-emerald-900">Credit (Cr)</th>
                                <th class="px-3 py-2.5 text-right text-gray-950">Running Balance</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 bg-white">
                            <!-- Opening Balance Row -->
                            ${startDate ? `
                            <tr class="bg-slate-50 font-semibold text-slate-800">
                                <td class="px-3 py-2 whitespace-nowrap font-mono text-[11px]">${_escapeHtml(_fmtDate(startDate))}</td>
                                <td class="px-3 py-2 whitespace-nowrap font-mono text-[11px] text-gray-400">—</td>
                                <td class="px-3 py-2 whitespace-nowrap"><span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-700">OPENING</span></td>
                                <td class="px-3 py-2 whitespace-nowrap text-gray-400">—</td>
                                <td class="px-3 py-2 text-slate-700">Opening Balance Brought Forward</td>
                                <td class="px-3 py-2 text-right font-mono text-gray-400">—</td>
                                <td class="px-3 py-2 text-right font-mono text-gray-400">—</td>
                                <td class="px-3 py-2 text-right font-mono font-bold ${openingBal > 0 ? 'text-red-700' : openingBal < 0 ? 'text-emerald-700' : 'text-gray-900'}">
                                    ${_fmtMoney(Math.abs(openingBal))}${openingBal > 0 ? ' Dr' : openingBal < 0 ? ' Cr' : ''}
                                </td>
                            </tr>
                            ` : ''}

                            ${entries.map(e => {
                                const dr = Number(e.debit || 0);
                                const cr = Number(e.credit || 0);
                                const runBal = Number(e.running_balance || 0);
                                const docType = String(e.doc_type || 'TXN').toUpperCase();
                                
                                const typeBadge = 
                                    docType.includes('INV') ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                    docType.includes('CR') || docType.includes('CREDIT') ? 'bg-purple-100 text-purple-800 border-purple-200' :
                                    docType.includes('REC') || docType.includes('PAY') ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                    'bg-gray-100 text-gray-700 border-gray-200';

                                return `
                                    <tr class="hover:bg-blue-50/30 transition">
                                        <td class="px-3 py-2 whitespace-nowrap font-mono text-[11px] text-gray-800">
                                            ${_escapeHtml(_fmtDate(e.doc_date || e.date))}
                                        </td>
                                        <td class="px-3 py-2 whitespace-nowrap font-mono font-bold text-[11px] text-gray-950">
                                            ${_escapeHtml(e.ref_no || e.doc_number || `#${e.id || '—'}`)}
                                        </td>
                                        <td class="px-3 py-2 whitespace-nowrap">
                                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold border ${typeBadge}">
                                                ${_escapeHtml(docType)}
                                            </span>
                                        </td>
                                        <td class="px-3 py-2 whitespace-nowrap font-mono text-[10px] text-gray-600">
                                            ${_escapeHtml(e.branch_code || '—')}
                                        </td>
                                        <td class="px-3 py-2 text-gray-800 max-w-xs truncate" title="${_escapeHtml(e.narration || e.description || '')}">
                                            ${_escapeHtml(e.narration || e.description || '—')}
                                        </td>
                                        <td class="px-3 py-2 text-right font-mono font-bold ${dr > 0 ? 'text-blue-900' : 'text-gray-400'}">
                                            ${dr > 0 ? _fmtMoney(dr) : '—'}
                                        </td>
                                        <td class="px-3 py-2 text-right font-mono font-bold ${cr > 0 ? 'text-emerald-900' : 'text-gray-400'}">
                                            ${cr > 0 ? _fmtMoney(cr) : '—'}
                                        </td>
                                        <td class="px-3 py-2 text-right font-mono font-bold ${runBal > 0 ? 'text-red-700' : runBal < 0 ? 'text-emerald-700' : 'text-gray-900'}">
                                            ${_fmtMoney(Math.abs(runBal))}${runBal > 0 ? ' Dr' : runBal < 0 ? ' Cr' : ''}
                                        </td>
                                    </tr>
                                `;
                            }).join("")}
                        </tbody>
                        <tfoot class="bg-gray-100 font-bold text-gray-950 border-t-2 border-gray-300">
                            <tr>
                                <td colspan="5" class="px-3 py-2 text-left uppercase text-[10px] tracking-wider text-gray-700">Period Total / Closing Balance</td>
                                <td class="px-3 py-2 text-right font-mono text-blue-900">${_fmtMoney(totalDr)}</td>
                                <td class="px-3 py-2 text-right font-mono text-emerald-900">${_fmtMoney(totalCr)}</td>
                                <td class="px-3 py-2 text-right font-mono font-extrabold ${closingBal > 0 ? 'text-red-700' : closingBal < 0 ? 'text-emerald-700' : 'text-gray-900'}">
                                    ${_fmtMoney(Math.abs(closingBal))}${closingBal > 0 ? ' Dr' : closingBal < 0 ? ' Cr' : ''}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;

        } catch (err) {
            console.error("[VaultCustomers._fetchAndRenderStatement error]", err);
            tableContainer.innerHTML = `
                <div class="p-6 text-center text-red-600 text-xs">
                    Failed to render statement: ${_escapeHtml(err.message)}
                </div>
            `;
        }
    }

    return { 
        load, 
        search: _renderList,
        selectCustomer: _selectCustomer,
        openFilterModal,
        closeFilterModal
    };
})();

window.VaultCustomers = VaultCustomers;
