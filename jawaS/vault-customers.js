// ============================================================================
// VAULT-CUSTOMERS.JS — Customers List from IDB B2B + Clean Statement of Account
// Tile: customers
// ============================================================================

const VaultCustomers = (() => {

    let _customers = [];
    let _activeCustomer = null;
    let _filterStart = "";
    let _filterEnd   = "";

    const _escapeHtml = (str) => {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search customer by name, code, GST...";
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
                if (_activeCustomer) _loadLiveLedger(_activeCustomer, _filterStart, _filterEnd);
            };

            document.getElementById("custFilterResetBtn").onclick = () => {
                document.getElementById("custFilterStart").value = "";
                document.getElementById("custFilterEnd").value = "";
                _filterStart = "";
                _filterEnd = "";
                modal.classList.add("hidden");
                if (_activeCustomer) _loadLiveLedger(_activeCustomer);
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

        const filtered = _customers.filter(c => {
            if (!q) return true;
            const code = (c.CODE || "").toLowerCase();
            const name = (c.B2B_NAME || c.NAME || "").toLowerCase();
            const gstin = (c.GSTIN || c.GST || "").toLowerCase();
            const phone = (c.PHONE || c.MOBILE || "").toLowerCase();
            return code.includes(q) || name.includes(q) || gstin.includes(q) || phone.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-xs py-6">No matching customers found.</li>`;
            return;
        }

        ul.innerHTML = filtered.map(c => {
            const code = c.CODE || "N/A";
            const name = c.B2B_NAME || c.NAME || code;
            const branch = c.BRANCH || "";
            const gstin = c.GSTIN || c.GST || "";

            return `
                <li data-code="${_escapeHtml(code)}" class="p-2.5 rounded-lg cursor-pointer hover:bg-blue-50/80 border border-gray-200 transition-colors">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-blue-950 text-xs font-bold truncate">${_escapeHtml(name)}</strong>
                        <span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-100 text-blue-800 border border-blue-200 flex-shrink-0">${_escapeHtml(code)}</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                        <span>Branch: <strong class="text-gray-700">${_escapeHtml(branch)}</strong></span>
                        ${gstin ? `<span class="font-mono text-[9px] text-gray-400">GST: ${_escapeHtml(gstin)}</span>` : ""}
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
                const code = li.dataset.code;
                const c = _customers.find(item => (item.CODE || "").toUpperCase() === code.toUpperCase());
                if (c) _loadLiveLedger(c, _filterStart, _filterEnd);
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

    async function _loadLiveLedger(cust, startDate = null, endDate = null) {
        _activeCustomer = cust;
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const code = cust.CODE || "";
        const name = cust.B2B_NAME || cust.NAME || code;

        view.innerHTML = `
            <div class="p-12 text-center space-y-3">
                <div class="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p class="text-xs font-medium text-gray-600">Generating Statement of Account for <strong class="text-blue-800">${_escapeHtml(name)}</strong>...</p>
            </div>
        `;

        try {
            let url = `/api/ninja/clients/${encodeURIComponent(code)}/ledger`;
            const queryParts = [];
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);
            if (queryParts.length) url += `?${queryParts.join("&")}`;

            const data = await callApi(url, {}, "GET");
            _renderStatement(cust, data);
        } catch (err) {
            console.error("[_loadLiveLedger error]", err);
            view.innerHTML = `
                <div class="p-6 bg-red-50 rounded-xl border border-red-200 text-center space-y-2">
                    <p class="text-xs font-bold text-red-700">Unable to load Statement of Account</p>
                    <p class="text-[11px] text-red-600">${_escapeHtml(err.message || err)}</p>
                </div>
            `;
        }
    }

    function _renderStatement(cust, data) {
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const code = cust.CODE || data.client_code || "";
        const name = cust.B2B_NAME || cust.NAME || data.name || code;
        const branch = cust.BRANCH || (typeof getActiveBranch === "function" ? getActiveBranch() : "DDN");
        const gstin = cust.GSTIN || cust.GST || "";
        const phone = cust.PHONE || cust.MOBILE || "";
        const address = cust.ADDRESS || cust.CITY || "";

        const totalInvoiced = parseFloat(data.total_invoiced || 0);
        const totalPaid     = parseFloat(data.total_paid || 0);
        const totalCredit   = parseFloat(data.total_credit || 0);
        const netBalance    = parseFloat(data.net_outstanding || (totalInvoiced - totalPaid - totalCredit));

        const transactions = data.transactions || [];

        const txnRows = transactions.map((t, idx) => {
            const isPay = t.type === "PAYMENT";
            const isCred = t.type === "CREDIT";

            let typeBadge = `<span class="px-2 py-0.5 text-[9px] font-bold rounded bg-indigo-50 text-indigo-700 border border-indigo-200">INVOICE</span>`;
            if (isPay) {
                typeBadge = `<span class="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">PAYMENT</span>`;
            } else if (isCred) {
                typeBadge = `<span class="px-2 py-0.5 text-[9px] font-bold rounded bg-purple-50 text-purple-700 border border-purple-200">CREDIT NOTE</span>`;
            }

            const debitStr = t.debit > 0 ? `₹${t.debit.toFixed(2)}` : "-";
            const creditStr = t.credit > 0 ? `₹${t.credit.toFixed(2)}` : "-";
            const balClass = t.running_balance > 0 ? "text-red-700 font-bold" : (t.running_balance < 0 ? "text-purple-700 font-bold" : "text-green-700 font-bold");

            return `
                <tr class="hover:bg-gray-50/60 transition-colors">
                    <td class="px-4 py-2.5 text-center text-xs text-gray-400">${idx + 1}</td>
                    <td class="px-4 py-2.5 text-xs text-gray-700 font-medium whitespace-nowrap">📅 ${t.date || "N/A"}</td>
                    <td class="px-4 py-2.5 text-center">${typeBadge}</td>
                    <td class="px-4 py-2.5 text-xs font-bold text-gray-900">${_escapeHtml(t.ref)}</td>
                    <td class="px-4 py-2.5 text-xs text-gray-600 truncate" style="max-width: 220px;" title="${_escapeHtml(t.description)}">${_escapeHtml(t.description)}</td>
                    <td class="px-4 py-2.5 text-xs text-right font-bold text-gray-900">${debitStr}</td>
                    <td class="px-4 py-2.5 text-xs text-right font-bold text-emerald-700">${creditStr}</td>
                    <td class="px-4 py-2.5 text-xs text-right ${balClass}">₹${t.running_balance.toFixed(2)}</td>
                </tr>
            `;
        }).join("");

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-4">
                        <div>
                            <div class="flex items-center gap-2">
                                <h1 class="text-xl font-bold text-gray-900">${_escapeHtml(name)}</h1>
                                <span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">${_escapeHtml(code)}</span>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-bold text-gray-700">${_escapeHtml(branch)}</span> · Statement of Account (Running Ledger)</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="window.print()" class="btn btn-sm">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                <span>Print Statement</span>
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                            <span class="text-[10px] text-gray-400 font-bold uppercase block tracking-wider">Account Details</span>
                            <div class="text-sm font-bold text-gray-900">${_escapeHtml(name)}</div>
                            ${gstin ? `<div class="text-xs font-mono text-gray-700 font-semibold">GSTIN: ${_escapeHtml(gstin)}</div>` : ""}
                            ${phone ? `<div class="text-xs text-gray-600">📞 ${_escapeHtml(phone)}</div>` : ""}
                            ${address ? `<div class="text-xs text-gray-600">📍 ${_escapeHtml(address)}</div>` : ""}
                        </div>

                        <div class="grid grid-cols-3 gap-2">
                            <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-col justify-center">
                                <span class="text-[9px] text-gray-500 font-bold uppercase block">Total Invoiced</span>
                                <span class="text-sm font-bold text-gray-900 mt-1">₹${totalInvoiced.toFixed(2)}</span>
                            </div>
                            <div class="p-3 bg-emerald-50 rounded-lg border border-emerald-100 flex flex-col justify-center">
                                <span class="text-[9px] text-emerald-600 font-bold uppercase block">Total Paid</span>
                                <span class="text-sm font-bold text-emerald-700 mt-1">₹${totalPaid.toFixed(2)}</span>
                            </div>
                            <div class="p-3 ${netBalance > 0 ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"} rounded-lg border flex flex-col justify-center">
                                <span class="text-[9px] ${netBalance > 0 ? "text-red-600" : "text-green-600"} font-bold uppercase block">Net Balance</span>
                                <span class="text-base font-bold ${netBalance > 0 ? "text-red-700" : "text-green-700"} mt-1">₹${netBalance.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wider">Statement of Account (${transactions.length} Transactions)</h3>
                        </div>
                        <div class="overflow-x-auto rounded-lg border border-gray-200">
                            <table class="w-full text-left text-xs border-collapse">
                                <thead class="bg-gray-100 text-gray-600 font-bold uppercase border-b border-gray-200">
                                    <tr>
                                        <th class="px-4 py-2.5 text-center" style="width:35px;">#</th>
                                        <th class="px-4 py-2.5" style="width:95px;">Date</th>
                                        <th class="px-4 py-2.5 text-center" style="width:105px;">Type</th>
                                        <th class="px-4 py-2.5" style="width:140px;">Reference #</th>
                                        <th class="px-4 py-2.5">Description</th>
                                        <th class="px-4 py-2.5 text-right" style="width:110px;">Debit (Dr)</th>
                                        <th class="px-4 py-2.5 text-right" style="width:110px;">Credit (Cr)</th>
                                        <th class="px-4 py-2.5 text-right" style="width:120px;">Running Balance</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 bg-white">
                                    ${txnRows.length ? txnRows : `<tr><td colspan="8" class="p-8 text-center text-gray-400">No transactions recorded for this customer in Invoice Ninja.</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        VaultPage.showDetailPane();
    }

    async function load() {
        _injectListPane();
        window.setLoading?.(true, "Loading customer list...", "list");

        try {
            const b2bRaw = await getAppData("B2B");
            _customers = Object.values(b2bRaw || {}).filter(c => c && c.CODE);
            _customers.sort((a, b) => (a.B2B_NAME || a.CODE || "").localeCompare(b.B2B_NAME || b.CODE || ""));
            _renderList();

            if (_customers.length > 0) {
                _loadLiveLedger(_customers[0]);
                const firstLi = document.querySelector("#vaultList li");
                if (firstLi) firstLi.classList.add("selected");
            }
        } catch (err) {
            console.error("[VaultCustomers load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) { msg.textContent = "Failed to load customers: " + (err.message || err); msg.classList.remove("hidden"); }
        } finally {
            window.setLoading?.(false);
        }
    }

    return { load, search: _renderList };
})();

window.VaultCustomers = VaultCustomers;
