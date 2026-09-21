// ============================================================================
// VAULT-CUSTOMERS.JS — Customers (Accounts Receivable)
// Tile: customers
// ARCHITECTURAL RULE: Only the 'billing' tile has access to IndexedDB data.
// All other Vault tiles (including this one) sync with backend accounts.
// Data source: /api/accounting/clients with 15-min incremental ETag cache
// ============================================================================

const VaultCustomers = (() => {

    let _customers = [];
    let _activeCustomer = null;
    let _filterStart = "";
    let _filterEnd   = "";

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

    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search customers by name, code, account #...";
            search.oninput = () => _renderList();
        }

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => document.getElementById("custFilterModal")?.classList.remove("hidden");
        }

        if (!document.getElementById("custFilterModal")) {
            const modal = document.createElement("div");
            modal.id = "custFilterModal";
            modal.className = "modal-overlay hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-150">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <span>🔍</span> Filter Statement Period
                        </h2>
                        <button onclick="document.getElementById('custFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="custPresetCfy" class="btn btn-sm">Current FY</button>
                            <button type="button" id="custPresetPfy" class="btn btn-sm">Previous FY</button>
                            <button type="button" id="custPresetAll" class="btn btn-sm">All Records</button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="custFilterStart" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="custFilterEnd" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button id="custFilterResetBtn" type="button" class="btn-danger btn-sm">Reset</button>
                        <button id="custFilterApplyBtn" type="button" class="btn-ghost btn-sm">Apply Filter</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const now = new Date();
            const year = now.getFullYear();
            const startYear = now.getMonth() < 3 ? year - 1 : year;

            document.getElementById("custPresetCfy").onclick = () => {
                document.getElementById("custFilterStart").value = `${startYear}-04-01`;
                document.getElementById("custFilterEnd").value = `${startYear + 1}-03-31`;
            };
            document.getElementById("custPresetPfy").onclick = () => {
                document.getElementById("custFilterStart").value = `${startYear - 1}-04-01`;
                document.getElementById("custFilterEnd").value = `${startYear}-03-31`;
            };
            document.getElementById("custPresetAll").onclick = () => {
                document.getElementById("custFilterStart").value = "";
                document.getElementById("custFilterEnd").value = "";
            };

            document.getElementById("custFilterApplyBtn").onclick = () => {
                _filterStart = document.getElementById("custFilterStart").value;
                _filterEnd = document.getElementById("custFilterEnd").value;
                modal.classList.add("hidden");
                if (_activeCustomer) _renderCustomerDetail(_activeCustomer, _filterStart, _filterEnd);
            };

            document.getElementById("custFilterResetBtn").onclick = () => {
                document.getElementById("custFilterStart").value = "";
                document.getElementById("custFilterEnd").value = "";
                _filterStart = "";
                _filterEnd = "";
                modal.classList.add("hidden");
                if (_activeCustomer) _renderCustomerDetail(_activeCustomer);
            };

            modal.onclick = (e) => {
                if (e.target === modal) modal.classList.add("hidden");
            };
        }
    }

    async function load() {
        _injectListPane();
        window.setLoading?.(true, "Loading customers...", "list");

        const listEl = document.getElementById("vaultList");
        if (listEl) {
            listEl.innerHTML = `
                <li class="p-6 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Fetching Client Accounts Receivable...</p>
                </li>
            `;
        }

        try {
            let raw = [];
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            let resData = null;
            try {
                const r = await fetch('/api/accounting/clients', { headers });
                if (r.ok) resData = await r.json();
            } catch (_) {}
            raw = Array.isArray(resData) ? resData : (resData?.clients || resData?.data || []);
            // raw = array of account/client records

            _customers = raw.map(c => ({
                id: c.id,
                account_code: c.account_code || c.code || '',
                code: c.client_code || c.code || '',
                name: c.name || c.full_name || '',
                full_name: c.full_name || c.name || '',
                balance: Number(c.balance || c.outstanding || 0),
                outstanding: Number(c.outstanding || c.balance || 0),
                description: c.description || '',
                account_type: 'RECEIVABLE'
            })).sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));

            _renderList();

            if (_customers.length > 0 && window.innerWidth >= 768) {
                _renderCustomerDetail(_customers[0]);
            } else {
                VaultPage?.showDetail?.(false);
            }
        } catch (err) {
            console.error("[VaultCustomers.load error]", err);
            if (listEl) {
                listEl.innerHTML = `<li class="p-4 text-center text-red-600 text-xs">Failed to load customers: ${_escapeHtml(err.message)}</li>`;
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    function _renderList() {
        const ul = document.getElementById("vaultList");
        const msgEl = document.getElementById("vaultListMsg");
        if (!ul) return;
        ul.innerHTML = "";

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _customers.filter(c => {
            if (!q) return true;
            const code = (c.code || "").toLowerCase();
            const name = (c.name || c.full_name || "").toLowerCase();
            const accCode = String(c.account_code || "").toLowerCase();
            return code.includes(q) || name.includes(q) || accCode.includes(q);
        });

        if (!filtered.length) {
            if (msgEl) {
                msgEl.textContent = q ? "No matching customers found." : "No client accounts in ledger.";
                msgEl.classList.remove("hidden");
            }
            return;
        }
        if (msgEl) msgEl.classList.add("hidden");

        ul.innerHTML = filtered.map(c => {
            const isSelected = _activeCustomer && _activeCustomer.code === c.code;
            return `
                <li data-code="${_escapeHtml(c.code)}" class="p-3 bg-white rounded-lg border ${isSelected ? 'border-purple-500 bg-purple-50/50' : 'border-gray-200'} hover:border-purple-400 cursor-pointer transition shadow-sm space-y-1">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-gray-900 text-xs font-bold truncate">${_escapeHtml(c.name)}</strong>
                        <span class="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-purple-100 text-purple-800 border border-purple-200 flex-shrink-0">
                            #${_escapeHtml(c.account_code || c.code)}
                        </span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                        <span class="text-[10px] text-slate-500 font-mono">Code: <strong>${_escapeHtml(c.code)}</strong></span>
                        <span class="font-mono text-[10px] font-bold ${c.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}">
                            ${_fmtMoney(c.balance)}
                        </span>
                    </div>
                </li>
            `;
        }).join("");

        const items = Array.from(ul.querySelectorAll("li"));
        items.forEach((li) => {
            li.addEventListener("click", () => {
                items.forEach(x => {
                    x.classList.remove("border-purple-500", "bg-purple-50/50");
                    x.classList.add("border-gray-200");
                });
                li.classList.remove("border-gray-200");
                li.classList.add("border-purple-500", "bg-purple-50/50");
                const code = li.dataset.code;
                const c = _customers.find(item => (item.code || "").toUpperCase() === code.toUpperCase());
                if (c) _renderCustomerDetail(c, _filterStart, _filterEnd);
            });
        });
    }

    async function _renderCustomerDetail(cust, startDate = null, endDate = null) {
        _activeCustomer = cust;
        VaultPage?.showDetail?.(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const code = cust.code || "";
        const name = cust.name || cust.full_name || code;
        const balance = cust.balance || 0;

        view.innerHTML = `
            <div class="space-y-6">
                <!-- Header Card -->
                <div class="p-5 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-xl shadow-sm">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/30 text-purple-200 rounded border border-purple-400/30">CLIENT RECEIVABLE</span>
                                <span class="px-2 py-0.5 text-[10px] font-bold bg-white/10 text-white rounded">CODE: ${_escapeHtml(code)}</span>
                            </div>
                            <h1 class="text-xl font-black text-white">${_escapeHtml(name)}</h1>
                            <p class="text-xs text-purple-200 mt-1">${_escapeHtml(cust.description || 'Client Ledger Master')}</p>
                        </div>
                        <div class="text-right">
                            <span class="text-[11px] text-purple-300 block">Ledger Balance</span>
                            <span class="text-2xl font-mono font-bold ${balance > 0 ? 'text-amber-300' : 'text-emerald-300'}">${_fmtMoney(balance)}</span>
                        </div>
                    </div>
                </div>

                <!-- Parameters Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Client Code</span>
                        <span class="text-xs font-mono font-bold text-gray-900">${_escapeHtml(code)}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Account Code</span>
                        <span class="text-xs font-mono font-bold text-purple-700">#${_escapeHtml(cust.account_code || '—')}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Classification</span>
                        <span class="text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 inline-block mt-0.5">ACCOUNTS RECEIVABLE</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Normal Balance</span>
                        <span class="text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 inline-block mt-0.5">Debit (Dr)</span>
                    </div>
                </div>

                <!-- Live Statement / Ledger Scope -->
                <div class="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
                    <div class="flex items-center justify-between">
                        <h3 class="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                            <i class="fa-solid fa-receipt text-purple-600"></i> Client Ledger Summary
                        </h3>
                        <span class="text-[11px] text-gray-500 font-mono">Sync: Accounts Engine</span>
                    </div>
                    <div class="text-xs text-gray-700 space-y-2">
                        <p>All sales invoices, receipts, and journal postings for <strong>${_escapeHtml(name)}</strong> are linked to account <strong>#${_escapeHtml(cust.account_code)}</strong>.</p>
                        ${cust.id ? `<p class="text-slate-500 text-[11px]">Account ID: <span class="font-mono select-all">${_escapeHtml(cust.id)}</span></p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    return { load, search: _renderList };
})();

window.VaultCustomers = VaultCustomers;
