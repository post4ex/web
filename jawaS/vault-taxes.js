// ============================================================================
// VAULT-TAXES.JS — Tax Ledger & GST SAC/HSN Rates from pyacc Engine
// Tile: taxes
// Data source: /api/accounting/taxes & /api/accounting/reports/gst-summary (with ETag support)
// ============================================================================

const VaultTaxes = (() => {

    let _taxes = [];
    let _gstSummary = null;
    let _activeTax = null;

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
            search.placeholder = "Search taxes by code, name, rate...";
            search.oninput = () => _renderList();
        }
    }

    async function load() {
        _injectListPane();
        window.setLoading?.(true, "Loading Taxes & GST Rates...", "list");

        const listEl = document.getElementById("vaultList");
        if (listEl) {
            listEl.innerHTML = `
                <li class="p-6 text-center text-gray-500 text-xs space-y-2">
                    <div class="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Fetching tax ledgers from pyacc engine...</p>
                </li>
            `;
        }

        try {
            const token = _getAuthToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            let taxRes = null;
            let gstRes = null;

            if (window.VaultCache) {
                const r1 = await window.VaultCache.fetchWithEtag('/api/accounting/taxes', { headers });
                taxRes = r1.data;
                try {
                    const r2 = await window.VaultCache.fetchWithEtag('/api/accounting/reports/gst-summary', { headers });
                    gstRes = r2.data;
                } catch (_) {}
            } else {
                const r1 = await fetch('/api/accounting/taxes', { headers });
                taxRes = await r1.json();
                try {
                    const r2 = await fetch('/api/accounting/reports/gst-summary', { headers });
                    gstRes = await r2.json();
                } catch (_) {}
            }

            const rawTaxes = Array.isArray(taxRes) ? taxRes : (taxRes?.taxes || []);
            _taxes = rawTaxes;
            _gstSummary = gstRes || null;

            _renderList();

            if (_taxes.length > 0 && window.innerWidth >= 768) {
                _showDetailView(_taxes[0]);
            } else {
                VaultPage.showDetail(false);
            }
        } catch (err) {
            console.error("[VaultTaxes.load error]", err);
            if (listEl) {
                listEl.innerHTML = `<li class="p-4 text-center text-red-600 text-xs">Failed to load taxes: ${_escapeHtml(err.message)}</li>`;
            }
        } finally {
            window.setLoading?.(false);
        }
    }

    function _renderList() {
        const ul = document.getElementById("vaultList");
        if (!ul) return;

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _taxes.filter(t => {
            if (!q) return true;
            const code = (t.code || "").toLowerCase();
            const name = (t.name || "").toLowerCase();
            const rate = String(t.rate || "");
            const desc = (t.description || "").toLowerCase();
            return code.includes(q) || name.includes(q) || rate.includes(q) || desc.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-xs py-6">No matching taxes found.</li>`;
            return;
        }

        ul.innerHTML = filtered.map(t => {
            const isSelected = _activeTax && _activeTax.code === t.code;
            return `
                <li data-code="${_escapeHtml(t.code)}" class="p-2.5 rounded-lg cursor-pointer hover:bg-amber-50/80 border border-gray-200 transition-colors ${isSelected ? 'bg-amber-50 border-amber-300' : ''}">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-amber-950 text-xs font-bold truncate">${_escapeHtml(t.name)}</strong>
                        <span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-900 border border-amber-200 flex-shrink-0">${_escapeHtml(t.code)}</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                        <span class="text-gray-600 text-[10px] truncate max-w-[160px]">${_escapeHtml(t.description || '')}</span>
                        <span class="text-amber-700 font-bold text-xs">${t.rate != null ? t.rate + '%' : '0%'}</span>
                    </div>
                </li>
            `;
        }).join("");

        const items = Array.from(ul.querySelectorAll("li"));
        items.forEach((li) => {
            li.addEventListener("click", () => {
                items.forEach(x => x.classList.remove("bg-amber-50", "border-amber-300"));
                li.classList.add("bg-amber-50", "border-amber-300");
                const code = li.dataset.code;
                const found = _taxes.find(item => item.code === code);
                if (found) _showDetailView(found);
            });
        });
    }

    function _showDetailView(tax) {
        _activeTax = tax;
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const summaryHtml = _gstSummary ? `
            <div class="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-xl p-4 space-y-3">
                <div class="flex justify-between items-center border-b border-white/10 pb-2">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-amber-300">GST 3B Return Control Summary</h3>
                    <span class="text-[10px] text-gray-300">pyacc Live Ledgers</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div class="p-2 bg-white/5 rounded border border-white/10">
                        <span class="text-[10px] text-gray-400 block">Total Output GST</span>
                        <strong class="text-xs text-rose-300">₹${(+_gstSummary.total_output_tax || 0).toFixed(2)}</strong>
                    </div>
                    <div class="p-2 bg-white/5 rounded border border-white/10">
                        <span class="text-[10px] text-gray-400 block">Eligible Input ITC</span>
                        <strong class="text-xs text-emerald-300">₹${(+_gstSummary.total_input_itc || 0).toFixed(2)}</strong>
                    </div>
                    <div class="p-2 bg-white/5 rounded border border-white/10">
                        <span class="text-[10px] text-gray-400 block">Net Payable Tax</span>
                        <strong class="text-xs text-amber-300">₹${(+_gstSummary.net_gst_payable || 0).toFixed(2)}</strong>
                    </div>
                    <div class="p-2 bg-white/5 rounded border border-white/10">
                        <span class="text-[10px] text-gray-400 block">GTA RCM Liability</span>
                        <strong class="text-xs text-purple-300">₹${(+_gstSummary.total_rcm_liability || 0).toFixed(2)}</strong>
                    </div>
                </div>
            </div>
        ` : '';

        view.innerHTML = `
            <div class="space-y-6">
                <!-- Header Card -->
                <div class="p-5 bg-gradient-to-r from-amber-700 to-amber-950 text-white rounded-xl shadow-sm">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-white/20 text-white rounded">GST TAX HEAD</span>
                                <span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-black/30 text-amber-200 rounded">${_escapeHtml(tax.code)}</span>
                            </div>
                            <h1 class="text-xl font-black text-white">${_escapeHtml(tax.name)}</h1>
                            <p class="text-xs text-amber-100 mt-1">${_escapeHtml(tax.description || 'GST Statutory Tax Head')}</p>
                        </div>
                        <div class="text-right">
                            <span class="text-[11px] text-amber-200 block">Statutory Rate</span>
                            <span class="text-2xl font-black text-white">${tax.rate != null ? tax.rate + '%' : '0%'}</span>
                        </div>
                    </div>
                </div>

                ${summaryHtml}

                <!-- Tax Details Grid -->
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Tax Identifier</span>
                        <span class="text-xs font-mono font-bold text-gray-900">${_escapeHtml(tax.code)}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Control Account</span>
                        <span class="text-xs font-bold text-amber-800">Account #${tax.account_id || 'Auto'}</span>
                    </div>
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <span class="block text-[10px] font-bold uppercase text-gray-500">Applicable Basis</span>
                        <span class="text-xs font-bold text-gray-900">${tax.rate === 0 ? 'Exempt / Nil-Rated' : 'Taxable Supply (SAC/HSN)'}</span>
                    </div>
                </div>

                <!-- GST Compliance Reference -->
                <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <h3 class="text-xs font-bold uppercase text-gray-700 tracking-wider">GST Compliance Architecture</h3>
                    <div class="space-y-2 text-xs text-gray-600">
                        <p>• <strong>Core Courier & Cargo Services:</strong> Default forward charge GST 18% (SAC 996812 / 996813).</p>
                        <p>• <strong>Road Transport / GTA:</strong> SAC 996511 with RCM applicability for registered recipients.</p>
                        <p>• <strong>Physical Consumables:</strong> Flyer polybags (HSN 3923) and Barcode stickers (HSN 4821) taxed at 18%.</p>
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

window.VaultTaxes = VaultTaxes;
