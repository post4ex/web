// ============================================================================
// VAULT-RECEIPTS.JS — Receipts & Payments via Invoice Ninja API
// Tiles: receipts (💰), payments (💸)
// ============================================================================

const VaultReceipts = (() => {

    let _activeMode = "receipts";
    let _allItems   = [];

    const _escapeHtml = (str) => {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    function _getPaymentTypeLabel(typeId) {
        const types = {
            "1": "Bank Transfer",
            "29": "UPI",
            "4": "Cash",
            "2": "Credit Card",
            "3": "Debit Card",
            "5": "Cheque",
            "6": "Net Banking"
        };
        return types[String(typeId)] || "Bank / Electronic";
    }

    let _filterStart = "";
    let _filterEnd   = "";

    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search by ref, customer, date...";
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
                        <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <span>🔍</span> Filter Payments
                        </h2>
                        <button onclick="document.getElementById('recFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="recPresetCfy" class="btn btn-sm">Current FY</button>
                            <button type="button" id="recPresetPfy" class="btn btn-sm">Previous FY</button>
                            <button type="button" id="recPresetAll" class="btn btn-sm">All Records</button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="recFilterStart" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="recFilterEnd" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500">
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button id="recFilterResetBtn" type="button" class="btn-danger btn-sm">Reset</button>
                        <button id="recFilterApplyBtn" type="button" class="btn-ghost btn-sm">Apply Filter</button>
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
                modal.classList.add("hidden");
                load(_filterStart, _filterEnd);
            };

            document.getElementById("recFilterResetBtn").onclick = () => {
                document.getElementById("recFilterStart").value = "";
                document.getElementById("recFilterEnd").value = "";
                _filterStart = "";
                _filterEnd = "";
                modal.classList.add("hidden");
                load();
            };

            modal.onclick = (e) => {
                if (e.target === modal) modal.classList.add("hidden");
            };
        }
    }

    function _renderList() {
        const ul = document.getElementById("vaultList");
        if (!ul) return;

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _allItems.filter(e => {
            if (!q) return true;
            const ref = (e.transaction_reference || e.number || "").toLowerCase();
            const client = (e.client?.name || "").toLowerCase();
            const dt = (e.date || "").toLowerCase();
            return ref.includes(q) || client.includes(q) || dt.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No payment records found.</li>`;
            return;
        }

        ul.innerHTML = filtered.map(e => {
            const ref = e.transaction_reference || e.number || `PAY-${e.id.slice(0, 6)}`;
            const clientName = e.client?.name || "Customer";
            const dateStr = e.date || "N/A";
            const amount = parseFloat(e.amount || 0);
            const modeLabel = _getPaymentTypeLabel(e.type_id);

            return `
                <li data-id="${e.id}" class="p-3 rounded-lg cursor-pointer hover:bg-emerald-50 border border-gray-200 transition-colors">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-emerald-700 text-sm font-bold truncate">${_escapeHtml(ref)}</strong>
                        <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">${_escapeHtml(modeLabel)}</span>
                    </div>
                    <div class="text-xs font-semibold text-gray-800 truncate mt-0.5">${_escapeHtml(clientName)}</div>
                    <div class="flex items-center justify-between text-xs text-gray-500 mt-1">
                        <span>📅 ${dateStr}</span>
                        <span class="font-bold text-emerald-700 text-sm">₹${amount.toFixed(2)}</span>
                    </div>
                </li>
            `;
        }).join("");

        ul.querySelectorAll("li").forEach(li =>
            li.addEventListener("click", () => {
                ul.querySelectorAll("li").forEach(x => x.classList.remove("selected"));
                li.classList.add("selected");
                const item = _allItems.find(p => p.id === li.dataset.id);
                if (item) _renderDetail(item);
            })
        );
    }

    function _renderDetail(p) {
        if (!p) return;
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const ref = p.transaction_reference || p.number || `PAY-${p.id}`;
        const client = p.client || {};
        const clientName = client.name || "Customer";
        const dateStr = p.date || "N/A";
        const amount = parseFloat(p.amount || 0);
        const modeLabel = _getPaymentTypeLabel(p.type_id);
        const branch = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "DDN";
        const appliedInvoices = p.invoices || [];

        const invRows = appliedInvoices.map((inv, idx) => {
            const num = inv.number || inv.invoice_number || "Invoice";
            const amt = parseFloat(inv.amount || inv.pivot?.amount || 0);
            return `
                <tr class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-4 py-2 text-center text-xs text-gray-500">${idx + 1}</td>
                    <td class="px-4 py-2 text-xs font-bold text-indigo-700">${_escapeHtml(num)}</td>
                    <td class="px-4 py-2 text-xs text-right font-bold text-emerald-700">₹${amt.toFixed(2)}</td>
                </tr>
            `;
        }).join("");

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-4">
                        <div>
                            <div class="flex items-center gap-2">
                                <h1 class="text-xl font-bold text-emerald-900">${_escapeHtml(ref)}</h1>
                                <span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">PAYMENT RECEIPT</span>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-bold text-gray-700">${branch}</span> · Mode: <span class="font-bold text-emerald-700">${_escapeHtml(modeLabel)}</span></p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="window.print()" class="btn btn-sm">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                <span>Print Receipt</span>
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="p-4 bg-emerald-50/40 rounded-lg border border-emerald-100 space-y-1">
                            <span class="text-[11px] text-emerald-700 font-bold uppercase block">Received From (Customer)</span>
                            <div class="text-base font-bold text-gray-900">${_escapeHtml(clientName)}</div>
                            ${client.address1 ? `<div class="text-xs text-gray-600">${_escapeHtml(client.address1)}</div>` : ""}
                        </div>
                        <div class="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <div>
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Payment Date</span>
                                <span class="text-xs font-bold text-gray-800">📅 ${dateStr}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Payment Mode</span>
                                <span class="text-xs font-bold text-emerald-700">${_escapeHtml(modeLabel)}</span>
                            </div>
                            <div class="col-span-2 pt-1 border-t border-gray-200 flex justify-between items-center">
                                <span class="text-xs font-semibold text-gray-600">Amount Received:</span>
                                <span class="text-base font-bold text-emerald-700">₹${amount.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    ${invRows.length ? `
                        <div class="space-y-2">
                            <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wider">Applied Invoices</h3>
                            <div class="overflow-x-auto rounded-lg border border-gray-200">
                                <table class="w-full text-left text-xs border-collapse">
                                    <thead class="bg-gray-100 text-gray-600 font-bold uppercase border-b border-gray-200">
                                        <tr>
                                            <th class="px-4 py-2 text-center" style="width:40px;">#</th>
                                            <th class="px-4 py-2">Invoice Number</th>
                                            <th class="px-4 py-2 text-right" style="width:120px;">Amount Applied</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-100 bg-white">
                                        ${invRows}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ""}
                </div>
            </div>
        `;

        VaultPage.showDetailPane();
    }

    async function load(startDate = null, endDate = null) {
        _injectListPane();
        window.setLoading?.(true, "Loading payments...", "list");

        try {
            let url = "/api/ninja/payments";
            const queryParts = [];
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);
            if (queryParts.length) url += `?${queryParts.join("&")}`;

            const res = await callApi(url, {}, "GET");
            _allItems = Array.isArray(res) ? res : (res?.data || []);
            _renderList();

            if (_allItems.length > 0) {
                _renderDetail(_allItems[0]);
                const firstLi = document.querySelector("#vaultList li");
                if (firstLi) firstLi.classList.add("selected");
            }
        } catch (err) {
            console.error("[VaultReceipts load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) { msg.textContent = "Failed to load payments: " + (err.message || err); msg.classList.remove("hidden"); }
        } finally {
            window.setLoading?.(false);
        }
    }

    function setMode(mode) {
        _activeMode = mode;
    }

    return { load, setMode, search: _renderList };
})();

window.VaultReceipts = VaultReceipts;
