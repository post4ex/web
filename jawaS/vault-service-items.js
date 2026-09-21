// ============================================================================
// VAULT-SERVICE-ITEMS.JS — Core Logistics Services Catalog (Transit Modes)
// Tile: service-items
// Data source: /api/accounting/catalog/services (pyacc with ETag support)
// ============================================================================

const VaultServiceItems = (() => {

    let _services = [];
    let _activeItem = null;

    const _escapeHtml = (str) => {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    function _getAuthToken() {
        try {
            const raw = localStorage.getItem('post4ex_session') || localStorage.getItem('session') || '';
            if (raw) {
                const parsed = JSON.parse(raw);
                return parsed.token || parsed.jwt || parsed.access_token || raw;
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
            search.placeholder = "Search services by name, mode, SAC...";
            search.oninput = () => _renderList();
        }
    }

    async function load() {
        _injectListPane();
        window.setLoading?.(true, "Loading Logistics Services Catalog...", "list");

        const listEl = document.getElementById("vaultList");
        if (listEl) {
            listEl.innerHTML = `
                <li class="p-6 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Fetching services from pyacc engine...</p>
                </li>
            `;
        }

        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            let resData = null;
            if (window.VaultCache) {
                const res = await window.VaultCache.fetchWithEtag('/api/accounting/catalog/services', { headers });
                resData = res.data;
            } else {
                const r = await fetch('/api/accounting/catalog/services', { headers });
                resData = await r.json();
            }

            const raw = Array.isArray(resData) ? resData : (resData?.services || []);
            _services = raw;
            _renderList();

            // Auto-select first item on desktop
            if (_services.length > 0 && window.innerWidth >= 768) {
                _showDetailView(_services[0]);
            } else {
                VaultPage.showDetail(false);
            }
        } catch (err) {
            console.error("[VaultServiceItems.load error]", err);
            if (listEl) {
                listEl.innerHTML = `<li class="p-4 text-center text-red-600 text-xs">Failed to load services: ${_escapeHtml(err.message)}</li>`;
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    function _renderList() {
        const ul = document.getElementById("vaultList");
        if (!ul) return;

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _services.filter(s => {
            if (!q) return true;
            const code = (s.code || "").toLowerCase();
            const name = (s.name || "").toLowerCase();
            const mode = (s.mode_name || s.mode_code || "").toLowerCase();
            const sac = (s.sac_code || "").toLowerCase();
            return code.includes(q) || name.includes(q) || mode.includes(q) || sac.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-xs py-6">No matching services found.</li>`;
            return;
        }

        ul.innerHTML = filtered.map(s => {
            const isSelected = _activeItem && _activeItem.code === s.code;
            return `
                <li data-code="${_escapeHtml(s.code)}" class="p-2.5 rounded-lg cursor-pointer hover:bg-indigo-50/80 border border-gray-200 transition-colors ${isSelected ? 'bg-indigo-50 border-indigo-300' : ''}">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-indigo-950 text-xs font-bold truncate">${_escapeHtml(s.name)}</strong>
                        <span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-100 text-indigo-800 border border-indigo-200 flex-shrink-0">MODE: ${_escapeHtml(s.mode_code || '')}</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                        <span class="font-mono text-[10px]">SAC: <strong>${_escapeHtml(s.sac_code || '996812')}</strong></span>
                        <span class="text-emerald-700 font-semibold text-[10px]">GST ${s.tax_rate || 18}% • UOM: ${_escapeHtml(s.uom || 'KG')}</span>
                    </div>
                </li>
            `;
        }).join("");

        const items = Array.from(ul.querySelectorAll("li"));
        items.forEach((li) => {
            li.addEventListener("click", () => {
                items.forEach(x => x.classList.remove("bg-indigo-50", "border-indigo-300"));
                li.classList.add("bg-indigo-50", "border-indigo-300");
                const code = li.dataset.code;
                const found = _services.find(item => item.code === code);
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
                <div class="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-xl shadow-sm">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 rounded border border-indigo-400/30">LOGISTICS SERVICE</span>
                                <span class="px-2 py-0.5 text-[10px] font-bold bg-white/10 text-white rounded">MODE: ${_escapeHtml(item.mode_name || item.mode_code)}</span>
                            </div>
                            <h1 class="text-xl font-black text-white">${_escapeHtml(item.name)}</h1>
                            <p class="text-xs text-indigo-200 mt-1">${_escapeHtml(item.description || 'Core freight logistics service')}</p>
                        </div>
                        <div class="text-right">
                            <span class="text-[11px] text-indigo-300 block">GST SAC Heading</span>
                            <span class="text-lg font-mono font-bold text-amber-300">${_escapeHtml(item.sac_code || '996812')}</span>
                        </div>
                    </div>
                </div>

                <!-- Parameters Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Service Code</span>
                        <span class="text-xs font-mono font-bold text-gray-900">${_escapeHtml(item.code)}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Default Tax</span>
                        <span class="text-xs font-bold text-emerald-700">${item.tax_rate || 18.0}% (Forward Charge)</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Billing UOM</span>
                        <span class="text-xs font-bold text-indigo-700">${_escapeHtml(item.uom || 'KG')}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Min Weight</span>
                        <span class="text-xs font-bold text-gray-900">${item.min_weight_kg != null ? item.min_weight_kg + ' KG' : '0.0 KG'}</span>
                    </div>
                </div>

                <!-- Technical & Accounting Details -->
                <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <h3 class="text-xs font-bold uppercase text-gray-700 tracking-wider">Accounting & Billing Rules</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div class="space-y-2">
                            <div class="flex justify-between py-1.5 border-b border-gray-100">
                                <span class="text-gray-500">Volumetric Divisor:</span>
                                <span class="font-mono font-bold text-gray-800">${item.volumetric_divisor || 5000}</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-gray-100">
                                <span class="text-gray-500">Revenue Ledger Pattern:</span>
                                <span class="font-mono font-semibold text-indigo-700">${_escapeHtml(item.revenue_account_pattern || '%Operating Revenue%')}</span>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <div class="flex justify-between py-1.5 border-b border-gray-100">
                                <span class="text-gray-500">Classification:</span>
                                <span class="font-semibold text-gray-800">GST Services (SAC 99)</span>
                            </div>
                            <div class="flex justify-between py-1.5 border-b border-gray-100">
                                <span class="text-gray-500">Inventory Tracking:</span>
                                <span class="font-semibold text-gray-600">None (Service Transit)</span>
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

window.VaultServiceItems = VaultServiceItems;
