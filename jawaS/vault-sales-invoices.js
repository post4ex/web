// ============================================================================
// VAULT-SALES-INVOICES.JS — Sales Invoices via Invoice Ninja API
// Tile: sales-invoices
// ============================================================================

const VaultSalesInvoices = (() => {

    let _allInvoices = [];
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterStatus = "";

    const _escapeHtml = (str) => {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    function _getStatusBadge(inv) {
        const amt = parseFloat(inv.amount || 0);
        const bal = parseFloat(inv.balance || 0);

        if (bal === 0 && amt > 0) {
            return `<span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-green-100 text-green-800 border border-green-200">PAID</span>`;
        } else if (bal > 0 && bal < amt) {
            return `<span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">PARTIAL (₹${bal.toFixed(2)})</span>`;
        } else if (bal >= amt && amt > 0) {
            return `<span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-red-100 text-red-800 border border-red-200">UNPAID</span>`;
        }
        return `<span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-gray-100 text-gray-700">DRAFT</span>`;
    }

    // ── List Pane & Filter Modal ───────────────────────────────────────────────
    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search invoice #, customer, date...";
            search.oninput = () => _renderList();
        }

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => document.getElementById("siFilterModal")?.classList.remove("hidden");
        }

        // Inject Filter Modal into body if not already present
        if (!document.getElementById("siFilterModal")) {
            const modal = document.createElement("div");
            modal.id = "siFilterModal";
            modal.className = "modal-overlay hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-150">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <span>🔍</span> Filter Invoices
                        </h2>
                        <button onclick="document.getElementById('siFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>

                    <!-- Quick FY Presets -->
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="siPresetCfy" class="btn btn-sm">Current FY</button>
                            <button type="button" id="siPresetPfy" class="btn btn-sm">Previous FY</button>
                            <button type="button" id="siPresetAll" class="btn btn-sm">All Records</button>
                        </div>
                    </div>

                    <!-- Date Inputs -->
                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="siFilterStart" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="siFilterEnd" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>

                    <!-- Status Filter -->
                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Payment Status</label>
                        <select id="siFilterStatusSelect" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                            <option value="">All Statuses</option>
                            <option value="paid">Paid</option>
                            <option value="unpaid">Unpaid / Outstanding</option>
                            <option value="partial">Partial</option>
                        </select>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button id="siFilterResetBtn" type="button" class="btn-danger btn-sm">Reset</button>
                        <button id="siFilterApplyBtn" type="button" class="btn-ghost btn-sm">Apply Filter</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Wire Preset buttons
            const now = new Date();
            const year = now.getFullYear();
            const startYear = now.getMonth() < 3 ? year - 1 : year;

            document.getElementById("siPresetCfy").onclick = () => {
                document.getElementById("siFilterStart").value = `${startYear}-04-01`;
                document.getElementById("siFilterEnd").value = `${startYear + 1}-03-31`;
            };
            document.getElementById("siPresetPfy").onclick = () => {
                document.getElementById("siFilterStart").value = `${startYear - 1}-04-01`;
                document.getElementById("siFilterEnd").value = `${startYear}-03-31`;
            };
            document.getElementById("siPresetAll").onclick = () => {
                document.getElementById("siFilterStart").value = "";
                document.getElementById("siFilterEnd").value = "";
            };

            // Wire Apply and Reset
            document.getElementById("siFilterApplyBtn").onclick = () => {
                _filterStart = document.getElementById("siFilterStart").value;
                _filterEnd = document.getElementById("siFilterEnd").value;
                _filterStatus = document.getElementById("siFilterStatusSelect").value;
                modal.classList.add("hidden");
                load(_filterStart, _filterEnd);
            };

            document.getElementById("siFilterResetBtn").onclick = () => {
                document.getElementById("siFilterStart").value = "";
                document.getElementById("siFilterEnd").value = "";
                document.getElementById("siFilterStatusSelect").value = "";
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

    function _renderList() {
        const ul = document.getElementById("vaultList");
        if (!ul) return;

        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _allInvoices.filter(e => {
            if (_filterStatus) {
                const amt = parseFloat(e.amount || 0);
                const bal = parseFloat(e.balance || 0);
                if (_filterStatus === "paid" && bal !== 0) return false;
                if (_filterStatus === "unpaid" && bal < amt) return false;
                if (_filterStatus === "partial" && (bal === 0 || bal >= amt)) return false;
            }
            if (!q) return true;
            const num = (e.number || "").toLowerCase();
            const clientName = (e.client?.name || "").toLowerCase();
            const note = (e.custom_value1 || "").toLowerCase();
            const dt = (e.date || "").toLowerCase();
            return num.includes(q) || clientName.includes(q) || note.includes(q) || dt.includes(q);
        });

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            if (_filterStart || _filterEnd || _filterStatus) {
                filterBtn.classList.add("bg-indigo-100", "text-indigo-700");
            } else {
                filterBtn.classList.remove("bg-indigo-100", "text-indigo-700");
            }
        }

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No matching invoices found.</li>`;
            return;
        }

        ul.innerHTML = filtered.map(e => {
            const num = e.number || "N/A";
            const clientName = e.client?.name || "Cash Customer";
            const dateStr = e.date || "N/A";
            const amount = parseFloat(e.amount || 0);
            const note = e.custom_value1 || "";
            const badge = _getStatusBadge(e);

            return `
                <li data-id="${e.id}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-indigo-700 text-sm font-bold truncate">${_escapeHtml(num)}</strong>
                        ${badge}
                    </div>
                    <div class="text-xs font-semibold text-gray-800 truncate mt-0.5">${_escapeHtml(clientName)}</div>
                    ${note ? `<div class="text-[11px] text-gray-500 truncate">${_escapeHtml(note)}</div>` : ""}
                    <div class="flex items-center justify-between text-xs text-gray-500 mt-1">
                        <span>📅 ${dateStr}</span>
                        <span class="font-bold text-gray-800">₹${amount.toFixed(2)}</span>
                    </div>
                </li>
            `;
        }).join("");

        const items = Array.from(ul.querySelectorAll("li"));
        items.forEach((li, idx) => {
            li.setAttribute("tabindex", "0");
            const selectItem = () => {
                items.forEach(x => x.classList.remove("selected"));
                li.classList.add("selected");
                li.focus({ preventScroll: true });
                li.scrollIntoView({ block: "nearest", behavior: "smooth" });
                const inv = _allInvoices.find(item => item.id === li.dataset.id);
                if (inv) _renderDetail(inv);
            };

            li.addEventListener("click", selectItem);
            li.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectItem();
                } else if (e.key === "ArrowDown" && idx < items.length - 1) {
                    e.preventDefault();
                    items[idx + 1].click();
                } else if (e.key === "ArrowUp" && idx > 0) {
                    e.preventDefault();
                    items[idx - 1].click();
                }
            });
        });
    }

    function _renderDetail(inv) {
        if (!inv) return;
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const num = inv.number || "N/A";
        const client = inv.client || {};
        const clientName = client.name || "Cash Customer";
        const clientAddress = client.address1 || client.city || "";
        const clientGstin = client.vat_number || client.custom_value1 || "";

        const dateStr = inv.date || "N/A";
        const dueDate = inv.due_date || dateStr;
        const amount = parseFloat(inv.amount || 0);
        const balance = parseFloat(inv.balance || 0);
        const paid = amount - balance;
        const badge = _getStatusBadge(inv);
        const note = inv.custom_value1 || "";
        const branch = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "DDN";

        const rawItems = inv.line_items;
        const lineItems = Array.isArray(rawItems)
            ? rawItems
            : (rawItems && typeof rawItems === "object" ? Object.values(rawItems) : []);
        let taxableSubtotal = 0;
        let totalTax = 0;

        const rowsHtml = lineItems.map((it, idx) => {
            const cost = parseFloat(it.cost || 0);
            const qty = parseFloat(it.quantity || 1);
            const lineAmt = cost * qty;
            taxableSubtotal += lineAmt;
            const taxRate = parseFloat(it.tax_rate1 || 18);
            totalTax += lineAmt * (taxRate / 100);

            const label = it.notes || it.product_key || "Courier Service";
            const taxLabel = it.tax_name1 || `IGST ${taxRate}%`;

            return `
                <tr class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-4 py-2.5 text-xs text-gray-500 text-center">${idx + 1}</td>
                    <td class="px-4 py-2.5 text-sm text-gray-800 font-medium">${_escapeHtml(label)}</td>
                    <td class="px-4 py-2.5 text-sm text-gray-700 text-right">${qty}</td>
                    <td class="px-4 py-2.5 text-sm text-gray-700 text-right">₹${cost.toFixed(2)}</td>
                    <td class="px-4 py-2.5 text-xs text-gray-500 text-right">${_escapeHtml(taxLabel)}</td>
                    <td class="px-4 py-2.5 text-sm text-gray-900 font-bold text-right">₹${lineAmt.toFixed(2)}</td>
                </tr>
            `;
        }).join("");

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-4">
                        <div>
                            <div class="flex items-center gap-2">
                                <h1 class="text-xl font-bold text-indigo-900">${_escapeHtml(num)}</h1>
                                ${badge}
                            </div>
                            <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-bold text-gray-700">${branch}</span> · SAC: <span class="font-mono text-gray-700">996812</span></p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="window.print()" class="btn btn-sm">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                <span>Print</span>
                            </button>
                            <a href="https://gen4u-io.hf.space/#/invoices/${inv.id}/view" target="_blank" class="btn btn-sm bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
                                <span>View PDF ↗</span>
                            </a>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="p-4 bg-indigo-50/40 rounded-lg border border-indigo-100 space-y-1">
                            <span class="text-[11px] text-indigo-700 font-bold uppercase tracking-wider block">Billed To (Customer)</span>
                            <div class="text-base font-bold text-gray-900">${_escapeHtml(clientName)}</div>
                            ${clientAddress ? `<div class="text-xs text-gray-600">${_escapeHtml(clientAddress)}</div>` : ""}
                            ${clientGstin ? `<div class="text-xs font-mono text-gray-700 font-semibold">GSTIN: ${_escapeHtml(clientGstin)}</div>` : ""}
                        </div>
                        <div class="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <div>
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Invoice Date</span>
                                <span class="text-xs font-bold text-gray-800">📅 ${dateStr}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Due Date</span>
                                <span class="text-xs font-bold text-gray-800">⏳ ${dueDate}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Grand Total</span>
                                <span class="text-sm font-bold text-indigo-700">₹${amount.toFixed(2)}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Balance Due</span>
                                <span class="text-sm font-bold ${balance > 0 ? "text-red-600" : "text-green-600"}">₹${balance.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    ${note ? `
                        <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 font-medium">
                            📌 ${_escapeHtml(note)}
                        </div>
                    ` : ""}

                    <div class="overflow-x-auto rounded-lg border border-gray-200">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead class="bg-gray-100 text-gray-600 font-bold uppercase border-b border-gray-200">
                                <tr>
                                    <th class="px-4 py-2.5 text-center" style="width:40px;">#</th>
                                    <th class="px-4 py-2.5">Item Description</th>
                                    <th class="px-4 py-2.5 text-right" style="width:60px;">Qty</th>
                                    <th class="px-4 py-2.5 text-right" style="width:100px;">Rate</th>
                                    <th class="px-4 py-2.5 text-right" style="width:110px;">Tax</th>
                                    <th class="px-4 py-2.5 text-right" style="width:110px;">Total</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 bg-white">
                                ${rowsHtml.length ? rowsHtml : `<tr><td colspan="6" class="p-4 text-center text-gray-400">No line items</td></tr>`}
                            </tbody>
                        </table>
                    </div>

                    <div class="flex justify-end">
                        <div class="w-full sm:w-80 space-y-1.5 p-4 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                            <div class="flex justify-between text-gray-600">
                                <span>Taxable Subtotal:</span>
                                <span class="font-medium">₹${taxableSubtotal.toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between text-gray-600">
                                <span>GST (18%):</span>
                                <span class="font-medium">₹${totalTax.toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between text-gray-900 font-bold text-sm border-t border-gray-200 pt-1.5">
                                <span>Invoice Total:</span>
                                <span class="text-indigo-700">₹${amount.toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between text-gray-600">
                                <span>Paid to Date:</span>
                                <span class="text-green-700 font-medium">₹${paid.toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between font-bold text-sm border-t border-gray-200 pt-1.5 ${balance > 0 ? "text-red-600" : "text-green-700"}">
                                <span>Balance Due:</span>
                                <span>₹${balance.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        VaultPage.showDetailPane();
    }

    async function load(startDate = null, endDate = null) {
        _injectListPane();
        window.setLoading?.(true, "Loading invoices...", "list");

        try {
            let url = "/api/ninja/invoices";
            const queryParts = [];
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);
            if (queryParts.length) url += `?${queryParts.join("&")}`;

            const res = await callApi(url, {}, "GET");
            _allInvoices = Array.isArray(res) ? res : (res?.data || []);
            _renderList();

            if (_allInvoices.length > 0) {
                _renderDetail(_allInvoices[0]);
                const firstLi = document.querySelector("#vaultList li");
                if (firstLi) firstLi.classList.add("selected");
            }
        } catch (err) {
            console.error("[VaultSalesInvoices load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) { msg.textContent = "Failed to load invoices: " + (err.message || err); msg.classList.remove("hidden"); }
        } finally {
            window.setLoading?.(false);
        }
    }

    return { load, search: _renderList };
})();

window.VaultSalesInvoices = VaultSalesInvoices;
