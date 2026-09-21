// ============================================================================
// VAULT-PRODUCT-ITEMS.JS — Secondary Products Catalog (Stationery & Consumables)
// Tile: product-items
// Data source: /api/accounting/catalog/products (pyacc with ETag support)
// ============================================================================

const VaultProductItems = (() => {

    let _products = [];
    let _activeItem = null;

    const _escapeHtml = (str) => {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search products by name, HSN, code...";
            search.oninput = () => _renderList();
        }
    }

    async function load() {
        _injectListPane();
        window.setLoading?.(true, "Loading Products Catalog...", "list");

        const listEl = document.getElementById("vaultList");
        if (listEl) {
            listEl.innerHTML = `
                <li class="p-6 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Fetching stationery products from pyacc engine...</p>
                </li>
            `;
        }

        try {
            let raw = [];

            // ── VaultStream (NDJSON x-ndjson stream) ─────────────────────────
            if (window.VaultStream) {
                raw = await window.VaultStream.syncAndGet('PRODUCTS');
            } else {
                // Fallback: direct REST
                const token = _getAuthToken();
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                let resData = null;
                if (window.VaultCache) {
                    const res = await window.VaultCache.fetchWithEtag('/api/accounting/catalog/products', { headers });
                    resData = res.data;
                } else {
                    const r = await fetch('/api/accounting/catalog/products', { headers });
                    resData = await r.json();
                }
                raw = Array.isArray(resData) ? resData : (resData?.products || []);
            }
            _products = raw;
            _renderList();

            if (_products.length > 0 && window.innerWidth >= 768) {
                _showDetailView(_products[0]);
            } else {
                VaultPage.showDetail(false);
            }
        } catch (err) {
            console.error("[VaultProductItems.load error]", err);
            if (listEl) {
                listEl.innerHTML = `<li class="p-4 text-center text-red-600 text-xs">Failed to load products: ${_escapeHtml(err.message)}</li>`;
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    function _renderList() {
        const ul = document.getElementById("vaultList");
        if (!ul) return;

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _products.filter(p => {
            if (!q) return true;
            const code = (p.code || "").toLowerCase();
            const name = (p.name || "").toLowerCase();
            const hsn = (p.hsn_code || "").toLowerCase();
            return code.includes(q) || name.includes(q) || hsn.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-xs py-6">No matching products found.</li>`;
            return;
        }

        ul.innerHTML = filtered.map(p => {
            const isSelected = _activeItem && _activeItem.code === p.code;
            return `
                <li data-code="${_escapeHtml(p.code)}" class="p-2.5 rounded-lg cursor-pointer hover:bg-cyan-50/80 border border-gray-200 transition-colors ${isSelected ? 'bg-cyan-50 border-cyan-300' : ''}">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-slate-950 text-xs font-bold truncate">${_escapeHtml(p.name)}</strong>
                        <span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-cyan-100 text-cyan-800 border border-cyan-200 flex-shrink-0">${_escapeHtml(p.uom || 'PCS')}</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                        <span class="font-mono text-[10px]">HSN: <strong>${_escapeHtml(p.hsn_code || '')}</strong></span>
                        <span class="text-emerald-700 font-semibold text-[10px]">GST ${p.tax_rate || 18}% • ${p.units_per_pack || 1} units/pack</span>
                    </div>
                </li>
            `;
        }).join("");

        const items = Array.from(ul.querySelectorAll("li"));
        items.forEach((li) => {
            li.addEventListener("click", () => {
                items.forEach(x => x.classList.remove("bg-cyan-50", "border-cyan-300"));
                li.classList.add("bg-cyan-50", "border-cyan-300");
                const code = li.dataset.code;
                const found = _products.find(item => item.code === code);
                if (found) _showDetailView(found);
            });
        });
    }

    function _showDetailView(item) {
        _activeItem = item;
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        view.innerHTML = `
            <div class="space-y-6">
                <!-- Header Card -->
                <div class="p-5 bg-gradient-to-r from-teal-900 to-slate-900 text-white rounded-xl shadow-sm">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-teal-500/30 text-teal-200 rounded border border-teal-400/30">STATIONERY & PACKAGING PRODUCT</span>
                                <span class="px-2 py-0.5 text-[10px] font-bold bg-white/10 text-white rounded">${_escapeHtml(item.uom || 'PACK')}</span>
                            </div>
                            <h1 class="text-xl font-black text-white">${_escapeHtml(item.name)}</h1>
                            <p class="text-xs text-teal-200 mt-1">${_escapeHtml(item.description || 'Physical packaging & branding item')}</p>
                        </div>
                        <div class="text-right">
                            <span class="text-[11px] text-teal-300 block">GST HSN Code</span>
                            <span class="text-lg font-mono font-bold text-amber-300">${_escapeHtml(item.hsn_code || '3923')}</span>
                        </div>
                    </div>
                </div>

                <!-- Parameters Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Product Code</span>
                        <span class="text-xs font-mono font-bold text-gray-900">${_escapeHtml(item.code)}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">GST Rate</span>
                        <span class="text-xs font-bold text-emerald-700">${item.tax_rate || 18.0}%</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Packaging Unit</span>
                        <span class="text-xs font-bold text-teal-700">${_escapeHtml(item.uom || 'PACK')}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Units / Pack</span>
                        <span class="text-xs font-bold text-gray-900">${item.units_per_pack || 1} Pcs</span>
                    </div>
                </div>

                <!-- Inventory & Accounting Details -->
                <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <h3 class="text-xs font-bold uppercase text-gray-700 tracking-wider">Inventory & General Ledger Mapping</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div class="space-y-2">
                            <div class="flex justify-between py-1.5 border-b border-gray-100">
                                <span class="text-gray-500">Revenue Ledger Pattern:</span>
                                <span class="font-mono font-semibold text-teal-700">${_escapeHtml(item.revenue_account_pattern || '%Stationery Sales%')}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-gray-100">
                                <span class="text-gray-500">Tax Accounting Code:</span>
                                <span class="font-mono font-semibold text-gray-800">${_escapeHtml(item.default_tax_code || 'I18O')}</span>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <div class="flex justify-between py-1.5 border-b border-gray-100">
                                <span class="text-gray-500">Inventory Asset Series:</span>
                                <span class="font-semibold text-gray-800">1300 Series (Inventory)</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-gray-100">
                                <span class="text-gray-500">Physical Stock Valuation:</span>
                                <span class="font-semibold text-emerald-700">Tracked (COGS 5100 Series)</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function search() {
        _renderList();
    }

    return { load, search };
})();

window.VaultProductItems = VaultProductItems;
