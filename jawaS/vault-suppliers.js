// ============================================================================
// VAULT-SUPPLIERS.JS — Suppliers & Vendors (Accounts Payable)
// Tile: suppliers (Suppliers & Vendors)
// ARCHITECTURAL RULE: Only the 'billing' tile has access to IndexedDB data.
// All other Vault tiles (including this one) sync PURELY & DIRECTLY with pyacc.
// Data source: /api/accounting/vendors (pyacc) with 15-min incremental ETag cache
// ============================================================================

const VaultSuppliers = (() => {

    let _vendors = [];
    let _activeVendor = null;

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
            search.placeholder = "Search suppliers & vendors by name, code, account #...";
            search.oninput = () => _renderList();
        }
    }

    async function load() {
        _injectListPane();
        window.setLoading?.(true, "Loading suppliers & vendors directly from pyacc...", "list");

        const listEl = document.getElementById("vaultList");
        if (listEl) {
            listEl.innerHTML = `
                <li class="p-6 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Fetching Vendor/Carrier Accounts Payable from pyacc engine...</p>
                </li>
            `;
        }

        try {
            let raw = [];

            // ── VaultStream (NDJSON x-ndjson stream) ─────────────────────────
            if (window.VaultStream) {
                raw = await window.VaultStream.syncAndGet('VENDORS');
            } else {
                // Fallback: direct REST
                const token = _getAuthToken();
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                let resData = null;
                if (window.VaultCache) {
                    const res = await window.VaultCache.fetchWithEtag('/api/accounting/vendors', { headers });
                    resData = res.data;
                } else {
                    const r = await fetch('/api/accounting/vendors', { headers });
                    resData = await r.json();
                }
                raw = Array.isArray(resData) ? resData : (resData?.vendors || resData?.data || []);
            }
            // raw = array of vendor records

            _vendors = raw.map(v => ({
                id: v.id,
                account_code: v.account_code || v.code || '',
                code: v.vendor_code || v.code || v.company_code || '',
                name: v.name || v.full_name || '',
                full_name: v.full_name || v.name || '',
                balance: Number(v.balance || v.payable || 0),
                payable: Number(v.payable || v.balance || 0),
                description: v.description || '',
                account_type: 'PAYABLE'
            })).sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));

            _renderList();

            if (_vendors.length > 0 && window.innerWidth >= 768) {
                _renderVendorDetail(_vendors[0]);
            } else {
                VaultPage?.showDetail?.(false);
            }
        } catch (err) {
            console.error("[VaultSuppliers.load error]", err);
            if (listEl) {
                listEl.innerHTML = `<li class="p-4 text-center text-red-600 text-xs">Failed to load suppliers from pyacc: ${_escapeHtml(err.message)}</li>`;
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

        const filtered = _vendors.filter(v => {
            if (!q) return true;
            const code = (v.code || "").toLowerCase();
            const name = (v.name || v.full_name || "").toLowerCase();
            const accCode = String(v.account_code || "").toLowerCase();
            return code.includes(q) || name.includes(q) || accCode.includes(q);
        });

        if (!filtered.length) {
            if (msgEl) {
                msgEl.textContent = q ? "No matching suppliers found." : "No vendor accounts in pyacc ledger.";
                msgEl.classList.remove("hidden");
            }
            return;
        }
        if (msgEl) msgEl.classList.add("hidden");

        ul.innerHTML = filtered.map(v => {
            const isSelected = _activeVendor && _activeVendor.code === v.code;
            return `
                <li data-code="${_escapeHtml(v.code)}" class="p-3 bg-white rounded-lg border ${isSelected ? 'border-amber-500 bg-amber-50/50' : 'border-gray-200'} hover:border-amber-400 cursor-pointer transition shadow-sm space-y-1">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-gray-900 text-xs font-bold truncate">${_escapeHtml(v.name)}</strong>
                        <span class="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0">
                            #${_escapeHtml(v.account_code || v.code)}
                        </span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                        <span class="text-[10px] text-slate-500 font-mono">Carrier: <strong>${_escapeHtml(v.code)}</strong></span>
                        <span class="font-mono text-[10px] font-bold ${v.balance > 0 ? 'text-orange-700' : 'text-emerald-700'}">
                            Payable: ${_fmtMoney(v.balance)}
                        </span>
                    </div>
                </li>
            `;
        }).join("");

        const items = Array.from(ul.querySelectorAll("li"));
        items.forEach((li) => {
            li.addEventListener("click", () => {
                items.forEach(x => {
                    x.classList.remove("border-amber-500", "bg-amber-50/50");
                    x.classList.add("border-gray-200");
                });
                li.classList.remove("border-gray-200");
                li.classList.add("border-amber-500", "bg-amber-50/50");
                const code = li.dataset.code;
                const v = _vendors.find(item => (item.code || "").toUpperCase() === code.toUpperCase());
                if (v) _renderVendorDetail(v);
            });
        });
    }

    function _renderVendorDetail(vendor) {
        _activeVendor = vendor;
        VaultPage?.showDetail?.(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const code = vendor.code || "";
        const name = vendor.name || vendor.full_name || code;
        const balance = vendor.balance || 0;

        view.innerHTML = `
            <div class="space-y-6">
                <!-- Header Card -->
                <div class="p-5 bg-gradient-to-r from-amber-900 via-orange-900 to-slate-900 text-white rounded-xl shadow-sm">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/30 text-amber-200 rounded border border-amber-400/30">SUPPLIER & VENDOR</span>
                                <span class="px-2 py-0.5 text-[10px] font-bold bg-white/10 text-white rounded">CARRIER: ${_escapeHtml(code)}</span>
                            </div>
                            <h1 class="text-xl font-black text-white">${_escapeHtml(name)}</h1>
                            <p class="text-xs text-amber-200 mt-1">${_escapeHtml(vendor.description || 'PyAcc Carrier / Vendor Payable Account')}</p>
                        </div>
                        <div class="text-right">
                            <span class="text-[11px] text-amber-300 block">Payable Balance</span>
                            <span class="text-2xl font-mono font-bold ${balance > 0 ? 'text-amber-300' : 'text-emerald-300'}">${_fmtMoney(balance)}</span>
                        </div>
                    </div>
                </div>

                <!-- Parameters Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Carrier / Vendor Code</span>
                        <span class="text-xs font-mono font-bold text-gray-900">${_escapeHtml(code)}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Account Code</span>
                        <span class="text-xs font-mono font-bold text-amber-700">#${_escapeHtml(vendor.account_code || '—')}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Classification</span>
                        <span class="text-xs font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200 inline-block mt-0.5">ACCOUNTS PAYABLE</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Normal Balance</span>
                        <span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block mt-0.5">Credit (Cr)</span>
                    </div>
                </div>

                <!-- Audit Ledger Scope -->
                <div class="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
                    <div class="flex items-center justify-between">
                        <h3 class="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                            <i class="fa-solid fa-truck-ramp-box text-amber-600"></i> PyAcc Vendor Payable Scope
                        </h3>
                        <span class="text-[11px] text-gray-500 font-mono">Sync: Pure pyacc engine</span>
                    </div>
                    <div class="text-xs text-gray-700 space-y-2">
                        <p>All purchase bills, carrier manifests, outward payments, and debit notes for <strong>${_escapeHtml(name)}</strong> post to ledger account <strong>#${_escapeHtml(vendor.account_code)}</strong>.</p>
                        ${vendor.id ? `<p class="text-slate-500 text-[11px]">Account ID: <span class="font-mono select-all">${_escapeHtml(vendor.id)}</span></p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    return { load, search: _renderList };
})();

window.VaultSuppliers = VaultSuppliers;
