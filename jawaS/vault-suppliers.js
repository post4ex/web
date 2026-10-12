// ============================================================================
// VAULT-SUPPLIERS.JS — Suppliers & Vendors (Accounts Payable / Trade Creditors 2000)
// Tile: suppliers (Suppliers & Vendors 🚚)
// Architecture:
// 1. Instant List: Loads Carrier/Vendor master records from IndexedDB (0ms latency).
// 2. Background Sync: Overlays live AP balances from /api/accounting/vendors.
// 3. Selection Detail: Fetches authoritative chronological Ledger Statement
//    via /api/accounting/vendors/{code}/statement (Accounts Payable Dr/Cr ledger).
// 4. Quick Actions: Direct "+ New Bill" and "+ Issue Debit Note" shortcuts.
// Global button standards (.btn, .btn-sm, .btn-blue, .btn-secondary) applied.
// ============================================================================

const VaultSuppliers = (() => {

    let _suppliers = [];
    let _balancesMap = {};
    let _activeSupplier = null;
    let _activeStatement = null;
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterBranch = "";
    let _statementLoading = false;

    // ── Filter State & Badge ──────────────────────────────────────────────────
    function _hasActiveFilters() {
        return !!_filterStart || !!_filterEnd || !!_filterBranch;
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
            btn.title = "Filter Vendors & Statements";
        }
    }

    function _setupFilterModal() {
        let modal = document.getElementById("suppFilterModal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "suppFilterModal";
            modal.className = "modal-overlay hidden";
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-lg">
                    <div class="flex justify-between items-center border-b pb-3">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                                <i class="fa-solid fa-truck-moving text-sm"></i>
                            </div>
                            <div>
                                <h2 class="text-base font-bold text-gray-900">Filter Vendors &amp; Ledger Statements</h2>
                                <p class="text-[11px] text-gray-500">Filter vendor master list and ledger statement period</p>
                            </div>
                        </div>
                        <button id="close-supp-filter-modal" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1 leading-none" aria-label="Close">✕</button>
                    </div>

                    <!-- Date Presets for Statement -->
                    <div>
                        <span class="block font-semibold text-gray-700 text-xs mb-1.5">Statement Period Presets</span>
                        <div class="flex flex-wrap gap-1.5">
                            <button type="button" class="supp-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-orange-50 hover:text-orange-700 font-medium transition" data-preset="all">All Time</button>
                            <button type="button" class="supp-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-orange-50 hover:text-orange-700 font-medium transition" data-preset="month">This Month</button>
                            <button type="button" class="supp-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-orange-50 hover:text-orange-700 font-medium transition" data-preset="cfy">Current FY</button>
                            <button type="button" class="supp-preset-btn px-2.5 py-1 text-[11px] rounded bg-gray-100 text-gray-700 hover:bg-orange-50 hover:text-orange-700 font-medium transition" data-preset="pfy">Previous FY</button>
                        </div>
                    </div>

                    <!-- Date Range -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label for="supp-filter-start-date" class="block font-semibold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="supp-filter-start-date" class="form-input text-xs w-full">
                        </div>
                        <div>
                            <label for="supp-filter-end-date" class="block font-semibold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="supp-filter-end-date" class="form-input text-xs w-full">
                        </div>
                        <div class="sm:col-span-2">
                            <label for="supp-filter-branch" class="block font-semibold text-gray-700 mb-1">Branch</label>
                            <select id="supp-filter-branch" class="form-input text-xs w-full">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-3 border-t">
                        <button id="supp-reset-filters" type="button" class="btn-ghost btn-sm">Reset</button>
                        <button id="supp-apply-filters" type="button" class="btn btn-sm bg-orange-600 text-white hover:bg-orange-700 shadow-xs font-semibold">Apply Filters</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById("close-supp-filter-modal").onclick = closeFilterModal;
            modal.onclick = (e) => { if (e.target === modal) closeFilterModal(); };
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && !modal.classList.contains("hidden")) closeFilterModal();
            });

            // Preset handlers
            modal.querySelectorAll(".supp-preset-btn").forEach(btn => {
                btn.onclick = () => {
                    const preset = btn.dataset.preset;
                    const now = new Date();
                    const year = now.getFullYear();
                    const startYear = now.getMonth() < 3 ? year - 1 : year;
                    const startEl = document.getElementById("supp-filter-start-date");
                    const endEl = document.getElementById("supp-filter-end-date");

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

            document.getElementById("supp-apply-filters").onclick = () => {
                _filterStart = document.getElementById("supp-filter-start-date")?.value || "";
                _filterEnd = document.getElementById("supp-filter-end-date")?.value || "";
                _filterBranch = document.getElementById("supp-filter-branch")?.value || "";

                closeFilterModal();
                _updateFilterButtonState();
                _renderList();

                if (_activeSupplier) {
                    _renderSupplierDetail(_activeSupplier, _filterStart, _filterEnd);
                }
            };

            document.getElementById("supp-reset-filters").onclick = () => {
                _filterStart = "";
                _filterEnd = "";
                _filterBranch = "";

                const sEl = document.getElementById("supp-filter-start-date");
                const eEl = document.getElementById("supp-filter-end-date");
                const bEl = document.getElementById("supp-filter-branch");
                if (sEl) sEl.value = "";
                if (eEl) eEl.value = "";
                if (bEl) bEl.value = "";

                closeFilterModal();
                _updateFilterButtonState();
                _renderList();

                if (_activeSupplier) {
                    _renderSupplierDetail(_activeSupplier, "", "");
                }
            };
        }

        _populateBranchFilterOptions();
    }

    async function _populateBranchFilterOptions() {
        const branchSelect = document.getElementById("supp-filter-branch");
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
        const modal = document.getElementById("suppFilterModal");
        if (!modal) return;
        const sEl = document.getElementById("supp-filter-start-date");
        const eEl = document.getElementById("supp-filter-end-date");
        const bEl = document.getElementById("supp-filter-branch");
        if (sEl) sEl.value = _filterStart;
        if (eEl) eEl.value = _filterEnd;
        if (bEl) bEl.value = _filterBranch;
        modal.classList.remove("hidden");
    }

    function closeFilterModal() {
        document.getElementById("suppFilterModal")?.classList.add("hidden");
    }

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

    function _getDocTypeBadge(type) {
        const t = (type || "").toUpperCase();
        if (t === "BIL") {
            return '<span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-orange-100 text-orange-800 border border-orange-200">BILL</span>';
        }
        if (t === "PAY") {
            return '<span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">PAYMENT</span>';
        }
        if (t === "DN") {
            return '<span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-purple-100 text-purple-800 border border-purple-200">DEBIT NOTE</span>';
        }
        if (t === "JRN") {
            return '<span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-100 text-indigo-800 border border-indigo-200">JOURNAL</span>';
        }
        return `<span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-gray-100 text-gray-700 border border-gray-200">${_escapeHtml(t || 'TXN')}</span>`;
    }

    // ── Setup Left List Pane ────────────────────────────────────────────────
    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search suppliers by name, code, city, GSTIN...";
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

    // ── Load Suppliers (IDB First + Background AP Balance Sync) ─────────────
    async function load() {
        _injectListPane();
        window.setLoading?.(true, "Loading suppliers & vendors...", "list");

        const listEl = document.getElementById("vaultList");
        if (listEl) {
            listEl.innerHTML = `
                <li class="p-6 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Loading Carrier / Vendor Master...</p>
                </li>
            `;
        }

        try {
            let carrierList = [];

            // 1. Fetch Master from IndexedDB (CARRIERS)
            if (typeof getAppData === 'function') {
                try {
                    const rawCarriers = await getAppData("CARRIERS");
                    carrierList = Object.values(rawCarriers || {}).filter(c => c && (c.CODE || c.COMPANY_CODE));
                } catch (e) {
                    console.warn("[VaultSuppliers] IDB CARRIERS read failed:", e);
                }
            }

            // 2. Fallback to API if IDB empty
            if (!carrierList || carrierList.length === 0) {
                const token = _getAuthToken();
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                try {
                    const r = await fetch('/api/accounting/vendors', { headers });
                    if (r.ok) {
                        const json = await r.json();
                        carrierList = Array.isArray(json) ? json : (json?.vendors || json?.data || []);
                    }
                } catch (e) {
                    console.warn("[VaultSuppliers] API fallback failed:", e);
                }
            }

            // Normalize records
            _suppliers = (carrierList || []).map(c => {
                const code = String(c.CODE || c.COMPANY_CODE || c.vendor_code || c.supplier_code || "").trim();
                const name = c.COMPANY_NAME || c.NAME || c.full_name || c.name || code;
                return {
                    id: c.id || code,
                    code: code,
                    supplier_code: code,
                    vendor_code: code,
                    account_code: c.account_code || '2000',
                    name: name,
                    full_name: name,
                    gstin: c.GSTIN || c.gstin || '',
                    pan: c.PAN || c.pan || '',
                    address: c.COMPANY_ADDRESS || c.ADDRESS || c.address || '',
                    city: c.COMPANY_CITY || c.CITY || c.city || '',
                    state: c.COMPANY_STATE || c.STATE || c.state || '',
                    pincode: c.COMPANY_PINCODE || c.PINCODE || c.pincode || '',
                    phone: c.COMPANY_PHONE || c.PHONE || c.phone || '',
                    email: c.COMPANY_EMAIL || c.EMAIL || c.email || '',
                    mode: c.MODE || c.mode || 'SURFACE',
                    status: (c.STATUS || 'ACTIVE').toUpperCase(),
                    balance: 0,
                    total_billed: 0,
                    total_paid: 0,
                };
            }).sort((a, b) => a.name.localeCompare(b.name));

            // Instant render from IDB
            _renderList();

            // Do not auto-select on load — show empty placeholder until user selects
            _activeSupplier = null;
            VaultPage?.showDetail?.(false);

            // 3. Background Sync: Fetch live AP balances from double-entry ledger
            _syncLiveBalances();

        } catch (err) {
            console.error("[VaultSuppliers.load error]", err);
            if (listEl) {
                listEl.innerHTML = `<li class="p-4 text-center text-red-600 text-xs">Failed to load suppliers: ${_escapeHtml(err.message)}</li>`;
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    // ── Background AP Balance Sync ──────────────────────────────────────────
    async function _syncLiveBalances() {
        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const r = await fetch('/api/accounting/vendors', { headers });
            if (!r.ok) return;
            const resData = await r.json();
            const liveVendors = Array.isArray(resData) ? resData : (resData?.vendors || resData?.suppliers || resData?.data || []);

            _balancesMap = {};
            liveVendors.forEach(v => {
                const code = String(v.supplier_code || v.vendor_code || v.code || "").toUpperCase().trim();
                if (code) {
                    _balancesMap[code] = {
                        balance: Number(v.outstanding_payable || v.balance || v.payable || 0),
                        total_billed: Number(v.total_billed || 0),
                        total_paid: Number(v.total_paid || 0),
                        account_code: v.account_code || '2000'
                    };
                }
            });

            // Update local records
            _suppliers.forEach(supp => {
                const upperCode = supp.code.toUpperCase();
                if (_balancesMap[upperCode]) {
                    supp.balance = _balancesMap[upperCode].balance;
                    supp.total_billed = _balancesMap[upperCode].total_billed;
                    supp.total_paid = _balancesMap[upperCode].total_paid;
                    if (_balancesMap[upperCode].account_code) {
                        supp.account_code = _balancesMap[upperCode].account_code;
                    }
                }
            });

            // Update badges in list without full re-render
            const ul = document.getElementById("vaultList");
            if (ul) {
                ul.querySelectorAll("li[data-code]").forEach(li => {
                    const code = (li.dataset.code || "").toUpperCase();
                    const balBadge = li.querySelector(".supp-bal-badge");
                    if (balBadge && _balancesMap[code]) {
                        const bal = _balancesMap[code].balance;
                        balBadge.textContent = bal !== 0 ? (_fmtMoney(Math.abs(bal)) + (bal > 0 ? " Cr" : " Dr")) : "₹0.00";
                        balBadge.className = `supp-bal-badge font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            bal > 0 ? 'bg-orange-50 text-orange-900 border border-orange-200' :
                            bal < 0 ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                            'bg-slate-100 text-slate-600'
                        }`;
                    }
                });
            }

            // If active supplier is open, update top balance summary
            if (_activeSupplier) {
                const upperActive = _activeSupplier.code.toUpperCase();
                if (_balancesMap[upperActive]) {
                    _activeSupplier.balance = _balancesMap[upperActive].balance;
                    const headerBalEl = document.getElementById("suppHeaderBal");
                    if (headerBalEl) {
                        const b = _activeSupplier.balance;
                        headerBalEl.textContent = _fmtMoney(Math.abs(b)) + (b > 0 ? " Cr" : b < 0 ? " Dr" : "");
                        headerBalEl.className = `text-2xl font-mono font-extrabold ${b > 0 ? 'text-orange-950' : b < 0 ? 'text-blue-700' : 'text-gray-900'}`;
                    }
                }
            }

        } catch (e) {
            console.warn("[VaultSuppliers] Live balance sync warning:", e);
        }
    }

    // ── Render Left List ────────────────────────────────────────────────────
    function _renderList() {
        const ul = document.getElementById("vaultList");
        const msgEl = document.getElementById("vaultListMsg");
        if (!ul) return;
        ul.innerHTML = "";

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _suppliers.filter(s => {
            if (!q) return true;
            const code = (s.code || "").toLowerCase();
            const name = (s.name || "").toLowerCase();
            const city = (s.city || "").toLowerCase();
            const gstin = (s.gstin || "").toLowerCase();
            const pan = (s.pan || "").toLowerCase();
            return code.includes(q) || name.includes(q) || city.includes(q) || gstin.includes(q) || pan.includes(q);
        });

        if (!filtered.length) {
            if (msgEl) {
                msgEl.textContent = q ? "No matching suppliers found." : "No carrier or vendor accounts found.";
                msgEl.classList.remove("hidden");
            }
            return;
        }
        if (msgEl) msgEl.classList.add("hidden");

        ul.innerHTML = filtered.map(s => {
            const isSelected = _activeSupplier && _activeSupplier.code === s.code;
            const bal = s.balance || 0;
            return `
                <li data-code="${_escapeHtml(s.code)}" class="p-3 bg-white rounded-xl border ${isSelected ? 'border-orange-500 bg-orange-50/40 shadow-sm ring-1 ring-orange-500' : 'border-gray-200'} hover:border-orange-400 cursor-pointer transition shadow-sm space-y-1.5">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-gray-950 text-xs font-bold truncate">${_escapeHtml(s.name)}</strong>
                        <span class="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-slate-100 text-slate-700 border border-slate-200 flex-shrink-0">
                            ${_escapeHtml(s.code)}
                        </span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500">
                        <span class="truncate max-w-[130px] text-gray-600">
                            ${_escapeHtml(s.city || s.state || 'Carrier')} ${s.gstin ? `· <span class="font-mono text-[9px]">${_escapeHtml(s.gstin.slice(0, 5))}…</span>` : ''}
                        </span>
                        <span class="supp-bal-badge font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            bal > 0 ? 'bg-orange-50 text-orange-900 border border-orange-200' :
                            bal < 0 ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                            'bg-slate-100 text-slate-600'
                        }">
                            ${bal !== 0 ? (_fmtMoney(Math.abs(bal)) + (bal > 0 ? ' Cr' : ' Dr')) : '₹0.00'}
                        </span>
                    </div>
                </li>
            `;
        }).join("");

        const items = Array.from(ul.querySelectorAll("li[data-code]"));
        items.forEach((li) => {
            li.addEventListener("click", () => {
                items.forEach(x => {
                    x.classList.remove("border-orange-500", "bg-orange-50/40", "shadow-sm", "ring-1", "ring-orange-500");
                    x.classList.add("border-gray-200");
                });
                li.classList.remove("border-gray-200");
                li.classList.add("border-orange-500", "bg-orange-50/40", "shadow-sm", "ring-1", "ring-orange-500");
                const code = li.dataset.code;
                const s = _suppliers.find(item => item.code === code);
                if (s) _selectSupplier(s);
            });
        });
    }

    function _selectSupplier(supp) {
        _activeSupplier = supp;
        VaultPage?.showDetail?.(true);
        VaultPage?.showDetailPane?.();
        _renderSupplierDetail(supp, _filterStart, _filterEnd);
    }

    // ── Render Supplier Detail Pane ─────────────────────────────────────────
    async function _renderSupplierDetail(supp, startDate = "", endDate = "") {
        _activeSupplier = supp;
        VaultPage?.showDetail?.(true);
        VaultPage?.showDetailPane?.();
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const code = supp.code || "";
        const name = supp.name || supp.full_name || code;
        const bal = supp.balance || 0;
        const accCode = supp.account_code || "2000";

        view.innerHTML = `
            <div class="space-y-5 animate-in fade-in duration-150" id="suppPrintContainer">
                <!-- Top Header Card -->
                <div class="p-5 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center flex-wrap gap-2">
                            <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-orange-100 text-orange-900 rounded border border-orange-200">
                                CARRIER / VENDOR (AP)
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">
                                CODE: ${_escapeHtml(code)}
                            </span>
                            <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-purple-50 text-purple-700 rounded border border-purple-200">
                                GL ACC: #${_escapeHtml(accCode)}
                            </span>
                            ${supp.gstin ? `<span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-50 text-amber-800 rounded border border-amber-200">GSTIN: ${_escapeHtml(supp.gstin)}</span>` : ''}
                        </div>
                        <h1 class="text-xl font-black text-gray-950">${_escapeHtml(name)}</h1>
                        <p class="text-xs text-gray-500 font-mono">Accounts Payable / Trade Creditors Sub-Ledger</p>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="text-right border-l md:border-l border-gray-200 pl-4">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Net Payable to Vendor</span>
                            <span id="suppHeaderBal" class="text-2xl font-mono font-extrabold ${bal > 0 ? 'text-orange-950' : bal < 0 ? 'text-blue-700' : 'text-gray-900'}">
                                ${_fmtMoney(Math.abs(bal))}${bal > 0 ? ' Cr' : bal < 0 ? ' Dr' : ''}
                            </span>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            <button id="suppNewBillBtn" type="button" class="btn btn-sm btn-blue flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-plus"></i> New Bill
                            </button>
                            <button id="suppNewPaymentBtn" type="button" class="btn btn-sm btn-rose bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-money-bill-transfer"></i> Record Payout
                            </button>
                            <button id="suppNewDnBtn" type="button" class="btn btn-sm btn-secondary flex items-center justify-center gap-1.5">
                                <i class="fa-solid fa-file-circle-minus"></i> Debit Note
                            </button>
                            <button id="suppPrintStmtBtn" type="button" class="btn btn-sm btn-secondary flex items-center justify-center gap-1.5">
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
                            <span><i class="fa-solid fa-location-dot text-orange-600 mr-1.5"></i> Operational Hub / Address</span>
                            <span class="text-[10px] font-mono text-gray-500">${_escapeHtml(supp.city || 'Hub')}</span>
                        </div>
                        <p class="text-xs text-gray-800 leading-relaxed font-medium">
                            ${_escapeHtml(supp.address) || 'No street address recorded'}<br>
                            ${_escapeHtml(supp.city ? supp.city + ', ' : '')}${_escapeHtml(supp.state || '')} ${_escapeHtml(supp.pincode ? '— ' + supp.pincode : '')}
                        </p>
                    </div>

                    <!-- Contact & Tax Profile -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-2">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid fa-id-card text-emerald-600 mr-1.5"></i> Tax & Registrations</span>
                            <span class="text-[10px] text-gray-500 font-mono">${_escapeHtml(supp.status)}</span>
                        </div>
                        <div class="text-xs text-gray-800 space-y-1 font-medium">
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500 text-[10px] font-bold">GSTIN:</span>
                                <span class="font-mono font-bold text-gray-950">${_escapeHtml(supp.gstin || 'Unregistered')}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500 text-[10px] font-bold">PAN:</span>
                                <span class="font-mono text-gray-950">${_escapeHtml(supp.pan || '—')}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500 text-[10px] font-bold">PHONE / EMAIL:</span>
                                <span class="text-gray-950 truncate max-w-[150px]">${_escapeHtml(supp.phone || supp.email || '—')}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Ledger & Terms -->
                    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-2">
                        <div class="flex items-center justify-between text-xs font-bold text-gray-950 uppercase border-b border-gray-100 pb-2">
                            <span><i class="fa-solid fa-book text-purple-600 mr-1.5"></i> Ledger Mapping</span>
                            <span class="text-[10px] text-purple-800 font-bold">SUB-LEDGER</span>
                        </div>
                        <div class="text-xs text-gray-800 space-y-1 font-medium">
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500 text-[10px] font-bold">AP ACCOUNT:</span>
                                <span class="font-mono font-bold text-purple-900">#${_escapeHtml(accCode)} Trade Creditors</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500 text-[10px] font-bold">NORMAL BALANCE:</span>
                                <span class="font-mono font-bold text-emerald-800">Credit (Cr)</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500 text-[10px] font-bold">TRANSIT MODE:</span>
                                <span class="font-mono font-bold text-gray-950">${_escapeHtml(supp.mode || 'SURFACE / AIR')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Statement Section -->
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" id="suppStatementPrintArea">
                    <!-- Statement Header Toolbar with Global Filter trigger -->
                    <div class="p-4 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2">
                            <h2 class="text-xs font-extrabold uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                                <i class="fa-solid fa-file-invoice text-orange-600"></i> Vendor Running Ledger Statement
                            </h2>
                            ${(startDate || endDate) ? `
                                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-100 text-orange-800 border border-orange-200">
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
                            <span class="block text-[10px] font-bold uppercase text-blue-700">Payments & Claims / Dr</span>
                            <span id="kpiTotalDr" class="text-sm font-mono font-bold text-blue-900">Calculating...</span>
                        </div>
                        <div class="p-3 bg-orange-50 rounded-lg border border-orange-200">
                            <span class="block text-[10px] font-bold uppercase text-orange-800">Incurred Bills / Cr</span>
                            <span id="kpiTotalCr" class="text-sm font-mono font-bold text-orange-950">Calculating...</span>
                        </div>
                        <div class="p-3 bg-amber-50/70 rounded-lg border border-amber-300">
                            <span class="block text-[10px] font-bold uppercase text-amber-900">Closing Balance (Payable)</span>
                            <span id="kpiClosingBal" class="text-sm font-mono font-extrabold text-amber-950">Calculating...</span>
                        </div>
                    </div>

                    <!-- Ledger Table -->
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 text-xs" id="suppStatementTable">
                            <thead class="bg-gray-100 text-gray-950 font-bold uppercase text-[10px] tracking-wider">
                                <tr>
                                    <th class="px-3 py-2.5 text-left" style="width: 105px;">Date</th>
                                    <th class="px-3 py-2.5 text-left" style="width: 140px;">Doc #</th>
                                    <th class="px-3 py-2.5 text-center" style="width: 75px;">Type</th>
                                    <th class="px-3 py-2.5 text-left" style="width: 130px;">Ref / Bill #</th>
                                    <th class="px-3 py-2.5 text-left">Narration / Particulars</th>
                                    <th class="px-3 py-2.5 text-right text-blue-900" style="width: 120px;">Debit (Dr ₹)</th>
                                    <th class="px-3 py-2.5 text-right text-orange-950" style="width: 120px;">Credit (Cr ₹)</th>
                                    <th class="px-3 py-2.5 text-right text-gray-950" style="width: 130px;">Balance (₹)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 bg-white font-medium" id="suppStatementTbody">
                                <tr>
                                    <td colspan="8" class="p-8 text-center text-gray-500 text-xs">
                                        <div class="w-5 h-5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                        Fetching chronological ledger statement...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Wire Action Buttons
        document.getElementById("suppNewBillBtn").onclick = () => {
            if (typeof VaultPurchases !== 'undefined' && typeof VaultPurchases.openAddPane === 'function') {
                VaultPurchases.openAddPane(code);
            } else if (typeof VaultPage !== 'undefined' && typeof VaultPage.loadTile === 'function') {
                VaultPage.loadTile('purchase-bills');
            }
        };

        document.getElementById("suppNewPaymentBtn").onclick = () => {
            if (typeof VaultPayments !== 'undefined' && typeof VaultPayments.openAddPane === 'function') {
                if (typeof VaultPage !== 'undefined' && typeof VaultPage.selectTile === 'function') {
                    VaultPage.selectTile('payments').then(() => {
                        setTimeout(() => VaultPayments.openAddPane(code), 100);
                    });
                } else {
                    VaultPayments.openAddPane(code);
                }
            } else {
                VaultPage?.selectTile?.('payments');
            }
        };

        document.getElementById("suppNewDnBtn").onclick = () => {
            if (typeof VaultDebitNotes !== 'undefined' && typeof VaultDebitNotes.openAddPane === 'function') {
                VaultDebitNotes.openAddPane(code);
            } else if (typeof VaultPage !== 'undefined' && typeof VaultPage.loadTile === 'function') {
                VaultPage.loadTile('debit-notes');
            }
        };

        document.getElementById("suppPrintStmtBtn").onclick = async () => {
            let activeBranchCode = (typeof VaultPage !== 'undefined' && typeof VaultPage.getActiveBranch === 'function')
                ? VaultPage.getActiveBranch()
                : (typeof getActiveBranch === 'function' ? getActiveBranch() : '');
            
            if (!activeBranchCode && supp && supp.branch) {
                activeBranchCode = supp.branch;
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
                    console.warn("[VaultSuppliers] Branch resolution error:", e);
                }
            }

            if (typeof VaultPrint !== 'undefined' && typeof VaultPrint.printStatement === 'function') {
                const stmtData = _activeStatement || {
                    supp: supp,
                    entries: [],
                    openingBalance: 0,
                    totalDebit: 0,
                    totalCredit: 0,
                    closingBalance: supp.balance || 0,
                    startDate: _filterStart,
                    endDate: _filterEnd
                };

                VaultPrint.printStatement(
                    supp,
                    code,
                    stmtData.entries || [],
                    stmtData.closingBalance !== undefined ? stmtData.closingBalance : (supp.balance || 0),
                    'Vendor Ledger Statement',
                    {
                        branch: branchObj,
                        startDate: stmtData.startDate,
                        endDate: stmtData.endDate,
                        openingBalance: stmtData.openingBalance || 0,
                        totalDebit: stmtData.totalDebit || 0,
                        totalCredit: stmtData.totalCredit || 0,
                        closingBalance: stmtData.closingBalance !== undefined ? stmtData.closingBalance : (supp.balance || 0)
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
                const sEl = document.getElementById("supp-filter-start-date");
                const eEl = document.getElementById("supp-filter-end-date");
                if (sEl) sEl.value = "";
                if (eEl) eEl.value = "";
                _updateFilterButtonState();
                _renderSupplierDetail(supp, "", "");
            };
        }

        // Fetch Statement Lines
        _fetchStatement(code, startDate, endDate);
    }

    // ── Fetch & Render Statement ────────────────────────────────────────────
    async function _fetchStatement(code, startDate, endDate) {
        if (_statementLoading) return;
        _statementLoading = true;

        const tbody = document.getElementById("suppStatementTbody");
        const kpiOpening = document.getElementById("kpiOpeningBal");
        const kpiDr = document.getElementById("kpiTotalDr");
        const kpiCr = document.getElementById("kpiTotalCr");
        const kpiClosing = document.getElementById("kpiClosingBal");

        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            let url = `/api/accounting/vendors/${encodeURIComponent(code)}/statement`;
            const q = [];
            if (startDate) q.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) q.push(`end_date=${encodeURIComponent(endDate)}`);
            if (q.length) url += `?${q.join("&")}`;

            const r = await fetch(url, { headers });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();

            const openingBal = Number(data.opening_balance || 0);
            const totalDr = Number(data.total_debit || 0);
            const totalCr = Number(data.total_credit || 0);
            const closingBal = Number(data.closing_balance || (openingBal + totalCr - totalDr));
            const lines = Array.isArray(data.lines) ? data.lines : (data.entries || []);

            // Cache statement for Tally printing
            _activeStatement = {
                supp: _activeSupplier,
                entries: lines,
                openingBalance: openingBal,
                totalDebit: totalDr,
                totalCredit: totalCr,
                closingBalance: closingBal,
                startDate: startDate,
                endDate: endDate
            };

            // Update KPIs
            if (kpiOpening) kpiOpening.textContent = _fmtMoney(Math.abs(openingBal)) + (openingBal !== 0 ? (openingBal > 0 ? " Cr" : " Dr") : "");
            if (kpiDr) kpiDr.textContent = _fmtMoney(totalDr);
            if (kpiCr) kpiCr.textContent = _fmtMoney(totalCr);
            if (kpiClosing) {
                kpiClosing.textContent = _fmtMoney(Math.abs(closingBal)) + (closingBal !== 0 ? (closingBal > 0 ? " Cr" : " Dr") : "");
                kpiClosing.className = `text-sm font-mono font-extrabold ${closingBal > 0 ? 'text-orange-950' : closingBal < 0 ? 'text-blue-800' : 'text-gray-900'}`;
            }

            if (!tbody) return;

            if (!lines.length) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="p-8 text-center text-gray-400 text-xs">
                            <i class="fa-solid fa-receipt text-gray-300 text-3xl mb-2 block"></i>
                            No ledger transactions recorded for this supplier in the selected period.
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = lines.map(l => {
                const dt = _fmtDate(l.doc_date);
                const docNo = l.doc_no || "—";
                const docType = l.doc_type || "TXN";
                const ref = l.ref_no || "—";
                const narr = l.narration || l.memo || "Carrier Transaction";
                const dr = Number(l.debit || 0);
                const cr = Number(l.credit || 0);
                const bal = Number(l.running_balance || 0);

                return `
                    <tr class="hover:bg-orange-50/20 transition">
                        <td class="px-3 py-2 whitespace-nowrap font-mono text-gray-700 text-[11px]">${_escapeHtml(dt)}</td>
                        <td class="px-3 py-2 whitespace-nowrap font-mono font-bold text-gray-950 text-xs">${_escapeHtml(docNo)}</td>
                        <td class="px-3 py-2 whitespace-nowrap text-center">${_getDocTypeBadge(docType)}</td>
                        <td class="px-3 py-2 whitespace-nowrap font-mono text-gray-800 text-[11px]">${_escapeHtml(ref)}</td>
                        <td class="px-3 py-2 text-gray-800 text-xs leading-snug">${_escapeHtml(narr)}</td>
                        <td class="px-3 py-2 whitespace-nowrap text-right font-mono font-bold ${dr > 0 ? 'text-blue-900' : 'text-gray-400'}">
                            ${dr > 0 ? _fmtMoney(dr) : '—'}
                        </td>
                        <td class="px-3 py-2 whitespace-nowrap text-right font-mono font-bold ${cr > 0 ? 'text-orange-950' : 'text-gray-400'}">
                            ${cr > 0 ? _fmtMoney(cr) : '—'}
                        </td>
                        <td class="px-3 py-2 whitespace-nowrap text-right font-mono font-bold ${bal > 0 ? 'text-orange-950' : bal < 0 ? 'text-blue-800' : 'text-gray-700'}">
                            ${_fmtMoney(Math.abs(bal))}${bal !== 0 ? (bal > 0 ? ' Cr' : ' Dr') : ''}
                        </td>
                    </tr>
                `;
            }).join("");

        } catch (err) {
            console.error("[VaultSuppliers fetchStatement error]", err);
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="p-6 text-center text-red-600 text-xs">
                            Failed to load supplier statement: ${_escapeHtml(err.message)}
                        </td>
                    </tr>
                `;
            }
        } finally {
            _statementLoading = false;
        }
    }

    return {
        load,
        search: _renderList,
        openFilterModal,
        closeFilterModal
    };
})();

window.VaultSuppliers = VaultSuppliers;
