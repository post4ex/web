// ============================================================================
// VAULT-PURCHASES.JS — Purchase Bills (Vendor Bills)
// Tile: purchase-bills (📦)
// Connected to pyacc Double-Entry Accounting Engine (/api/accounting/vendor-bills)
// ============================================================================

const VaultPurchases = (() => {

    let _allBills = [];
    let _filterStart = "";
    let _filterEnd   = "";
    let _filterStatus = "";

    const _escapeHtml = (str) => {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    function _getStatusBadge(bill) {
        const isPosted = bill.is_posted !== false;
        const status = (bill.status || "").toUpperCase();

        if (!isPosted || status === "DRAFT") {
            return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-700 border border-gray-300">DRAFT</span>';
        }
        if (status === "PAID" || bill.balance <= 0) {
            return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">PAID</span>';
        }
        if (status === "PARTIAL" || (bill.cleared_amount > 0 && bill.balance > 0)) {
            return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">PARTIAL</span>';
        }
        return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-orange-100 text-orange-800 border border-orange-200">UNPAID</span>';
    }

    function _injectListPane() {
        const msg = document.getElementById("vaultListMsg");
        const list = document.getElementById("vaultList");
        const search = document.getElementById("vaultSearch");
        if (msg) { msg.textContent = ""; msg.classList.add("hidden"); }
        if (list) list.innerHTML = "";
        if (search) {
            search.placeholder = "Search by bill#, vendor, reference...";
            search.oninput = () => _renderList();
        }

        const filterBtn = document.getElementById("vaultFilterBtn");
        if (filterBtn) {
            filterBtn.classList.remove("hidden");
            filterBtn.onclick = () => document.getElementById("pbFilterModal")?.classList.remove("hidden");
        }

        if (!document.getElementById("pbFilterModal")) {
            const modal = document.createElement("div");
            modal.id = "pbFilterModal";
            modal.className = "modal-overlay hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-150">
                    <div class="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <span>🔍</span> Filter Purchase Bills
                        </h2>
                        <button onclick="document.getElementById('pbFilterModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700 text-lg font-bold p-1">✕</button>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quick Date Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button type="button" id="pbPresetCfy" class="btn btn-sm">Current FY</button>
                            <button type="button" id="pbPresetPfy" class="btn btn-sm">Previous FY</button>
                            <button type="button" id="pbPresetAll" class="btn btn-sm">All Records</button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                            <input type="date" id="pbFilterStart" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">End Date</label>
                            <input type="date" id="pbFilterEnd" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 mb-1">Payment Status</label>
                        <select id="pbFilterStatusSelect" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
                            <option value="">All Statuses</option>
                            <option value="unpaid">Unpaid / Outstanding</option>
                            <option value="partial">Partial</option>
                            <option value="paid">Paid</option>
                            <option value="draft">Draft</option>
                        </select>
                    </div>

                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
                        <button id="pbFilterResetBtn" type="button" class="btn-danger btn-sm">Reset</button>
                        <button id="pbFilterApplyBtn" type="button" class="btn-ghost btn-sm">Apply Filter</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const now = new Date();
            const year = now.getFullYear();
            const startYear = now.getMonth() < 3 ? year - 1 : year;

            document.getElementById("pbPresetCfy").onclick = () => {
                document.getElementById("pbFilterStart").value = `${startYear}-04-01`;
                document.getElementById("pbFilterEnd").value = `${startYear + 1}-03-31`;
            };
            document.getElementById("pbPresetPfy").onclick = () => {
                document.getElementById("pbFilterStart").value = `${startYear - 1}-04-01`;
                document.getElementById("pbFilterEnd").value = `${startYear}-03-31`;
            };
            document.getElementById("pbPresetAll").onclick = () => {
                document.getElementById("pbFilterStart").value = "";
                document.getElementById("pbFilterEnd").value = "";
            };

            document.getElementById("pbFilterApplyBtn").onclick = () => {
                _filterStart = document.getElementById("pbFilterStart").value;
                _filterEnd = document.getElementById("pbFilterEnd").value;
                _filterStatus = document.getElementById("pbFilterStatusSelect").value;
                modal.classList.add("hidden");
                load(_filterStart, _filterEnd);
            };

            document.getElementById("pbFilterResetBtn").onclick = () => {
                document.getElementById("pbFilterStart").value = "";
                document.getElementById("pbFilterEnd").value = "";
                document.getElementById("pbFilterStatusSelect").value = "";
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

        const filtered = _allBills.filter(e => {
            if (_filterStatus) {
                const amt = parseFloat(e.amount || 0);
                const bal = parseFloat(e.balance ?? e.balance_due ?? 0);
                const isDraft = !e.is_posted;
                if (_filterStatus === "draft" && !isDraft) return false;
                if (_filterStatus === "paid" && (bal !== 0 || isDraft)) return false;
                if (_filterStatus === "unpaid" && (bal < amt || isDraft)) return false;
                if (_filterStatus === "partial" && (bal === 0 || bal >= amt || isDraft)) return false;
            }
            if (!q) return true;
            const num = (e.bill_no || e.number || "").toLowerCase();
            const vendorName = (e.vendor?.name || e.vendor?.carrier_code || "").toLowerCase();
            const ref = (e.reference || e.external_ref || "").toLowerCase();
            const dt = (e.date || "").toLowerCase();
            return num.includes(q) || vendorName.includes(q) || ref.includes(q) || dt.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No matching purchase bills found.</li>`;
            return;
        }

        ul.innerHTML = filtered.map(e => {
            const num = e.bill_no || e.number || `BILL-${e.id}`;
            const vendorName = e.vendor?.name || e.vendor?.carrier_code || "Carrier / Vendor";
            const dateStr = e.date || "N/A";
            const amount = parseFloat(e.amount || 0);
            const badge = _getStatusBadge(e);

            return `
                <li data-id="${e.id}" class="p-3 rounded-lg cursor-pointer hover:bg-orange-50 border border-gray-200 transition-colors">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-orange-800 text-sm font-bold truncate">${_escapeHtml(num)}</strong>
                        ${badge}
                    </div>
                    <div class="text-xs font-semibold text-gray-800 truncate mt-0.5">${_escapeHtml(vendorName)}</div>
                    ${e.reference ? `<div class="text-[11px] text-gray-500 truncate font-mono">Ref: ${_escapeHtml(e.reference)}</div>` : ""}
                    <div class="flex items-center justify-between text-xs text-gray-500 mt-1">
                        <span>📅 ${dateStr}</span>
                        <span class="font-bold text-gray-900">₹${amount.toFixed(2)}</span>
                    </div>
                </li>
            `;
        }).join("");

        ul.querySelectorAll("li").forEach(li =>
            li.addEventListener("click", () => {
                ul.querySelectorAll("li").forEach(x => x.classList.remove("selected"));
                li.classList.add("selected");
                const bill = _allBills.find(item => String(item.id) === String(li.dataset.id));
                if (bill) _renderDetail(bill);
            })
        );
    }

    function _renderDetail(bill) {
        if (!bill) return;
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const billNo = bill.bill_no || bill.number || `BILL-${bill.id}`;
        const vendor = bill.vendor || {};
        const vendorName = vendor.name || vendor.carrier_code || "Vendor";
        const dateStr = bill.date || "N/A";
        const dueDate = bill.due_date || dateStr;
        const amount = parseFloat(bill.amount || 0);
        const clearedAmt = parseFloat(bill.cleared_amount || 0);
        const balDue = parseFloat(bill.balance ?? bill.balance_due ?? 0);
        const isPosted = bill.is_posted !== false;
        const branch = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "DDN";

        // Line items rows
        const items = bill.line_items || [];
        const itemRows = items.map((it, idx) => {
            const desc = it.description || it.narration || "Freight / Service Charge";
            const qty = parseFloat(it.quantity || 1);
            const price = parseFloat(it.unit_price || it.amount || 0);
            const lineTot = parseFloat(it.line_total || (qty * price));
            return `
                <tr class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-4 py-2.5 text-center text-xs text-gray-500">${idx + 1}</td>
                    <td class="px-4 py-2.5 text-xs font-semibold text-gray-800">${_escapeHtml(desc)}</td>
                    <td class="px-4 py-2.5 text-xs text-right text-gray-600">${qty}</td>
                    <td class="px-4 py-2.5 text-xs text-right text-gray-600">₹${price.toFixed(2)}</td>
                    <td class="px-4 py-2.5 text-xs text-right font-bold text-gray-900">₹${lineTot.toFixed(2)}</td>
                </tr>
            `;
        }).join("");

        // Clearances / Payment history rows
        const clearances = bill.clearances || [];
        const clearanceRows = clearances.map((cl, idx) => {
            const num = cl.payment_no || cl.debit_note_no || cl.assigned_no || "Clearance";
            const clDate = cl.date || "N/A";
            const clAmt = parseFloat(cl.amount || 0);
            const clType = cl.type || (cl.debit_note_no ? "Debit Note" : "Vendor Payout");
            return `
                <tr class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-4 py-2 text-center text-xs text-gray-500">${idx + 1}</td>
                    <td class="px-4 py-2 text-xs font-bold text-orange-700">${_escapeHtml(num)}</td>
                    <td class="px-4 py-2 text-xs text-gray-600">${_escapeHtml(clType)}</td>
                    <td class="px-4 py-2 text-xs text-gray-600">📅 ${clDate}</td>
                    <td class="px-4 py-2 text-xs text-right font-bold text-emerald-700">₹${clAmt.toFixed(2)}</td>
                </tr>
            `;
        }).join("");

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-4">
                        <div>
                            <div class="flex items-center gap-2">
                                <h1 class="text-xl font-bold text-orange-950">${_escapeHtml(billNo)}</h1>
                                ${_getStatusBadge(bill)}
                            </div>
                            <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-bold text-gray-700">${branch}</span> · Vendor: <span class="font-bold text-orange-800">${_escapeHtml(vendorName)}</span></p>
                        </div>
                        <div class="flex items-center gap-2 flex-wrap justify-end">
                            <button onclick="window.print()" class="btn btn-sm">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                <span>Print</span>
                            </button>

                            ${!isPosted ? `
                                <button onclick="VaultPurchases.postDraft('${bill.id}')" class="btn btn-sm bg-orange-600 text-white hover:bg-orange-700">
                                    <span>✓ Post to Ledger</span>
                                </button>
                                <button onclick="VaultPurchases.deleteDraft('${bill.id}')" class="btn btn-sm bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
                                    <span>🗑 Delete Draft</span>
                                </button>
                            ` : `
                                ${balDue > 0 ? `
                                    <button onclick="VaultPurchases.openDebitNote('${bill.id}')" class="btn btn-sm bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100">
                                        <span>↩ Issue Debit Note</span>
                                    </button>
                                ` : ''}
                            `}
                        </div>
                    </div>

                    <!-- Cards: Vendor Info & Bill Summary -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="p-4 bg-orange-50/40 rounded-lg border border-orange-100 space-y-1">
                            <span class="text-[11px] text-orange-700 font-bold uppercase block">Supplier / Vendor</span>
                            <div class="text-base font-bold text-gray-900">${_escapeHtml(vendorName)}</div>
                            ${vendor.carrier_code ? `<div class="text-xs text-gray-600 font-mono">Carrier Code: ${_escapeHtml(vendor.carrier_code)}</div>` : ""}
                            ${vendor.vat_number ? `<div class="text-xs text-gray-600">GSTIN: ${_escapeHtml(vendor.vat_number)}</div>` : ""}
                            ${vendor.address ? `<div class="text-xs text-gray-500">${_escapeHtml(vendor.address)}</div>` : ""}
                        </div>
                        <div class="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <div>
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Bill Date</span>
                                <span class="text-xs font-bold text-gray-800">📅 ${dateStr}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Due Date</span>
                                <span class="text-xs font-bold text-gray-800">📅 ${dueDate}</span>
                            </div>
                            <div class="col-span-2">
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Reference / Memo</span>
                                <span class="text-xs font-bold text-orange-800 font-mono">${_escapeHtml(bill.reference || bill.external_ref || "N/A")}</span>
                            </div>
                            <div class="col-span-2 pt-1 border-t border-gray-200 flex justify-between items-center">
                                <span class="text-xs font-semibold text-gray-600">Total Bill Amount:</span>
                                <span class="text-base font-bold text-gray-900">₹${amount.toFixed(2)}</span>
                            </div>
                            <div class="col-span-2 flex justify-between items-center text-xs">
                                <span class="text-gray-500">Cleared: ₹${clearedAmt.toFixed(2)}</span>
                                <span class="font-bold ${balDue > 0 ? 'text-orange-700' : 'text-emerald-700'}">Balance Due: ₹${balDue.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Line Items Table -->
                    <div class="space-y-2">
                        <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wider">Line Items (Direct / Operating Expenses)</h3>
                        <div class="overflow-x-auto rounded-lg border border-gray-200">
                            <table class="w-full text-left text-xs border-collapse">
                                <thead class="bg-gray-100 text-gray-600 font-bold uppercase border-b border-gray-200">
                                    <tr>
                                        <th class="px-4 py-2.5 text-center" style="width:40px;">#</th>
                                        <th class="px-4 py-2.5">Description</th>
                                        <th class="px-4 py-2.5 text-right" style="width:70px;">Qty</th>
                                        <th class="px-4 py-2.5 text-right" style="width:100px;">Rate</th>
                                        <th class="px-4 py-2.5 text-right" style="width:110px;">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 bg-white">
                                    ${itemRows.length ? itemRows : '<tr><td colspan="5" class="px-4 py-3 text-center text-gray-400">No line items</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Clearances Section -->
                    ${clearances.length ? `
                        <div class="space-y-2 pt-2">
                            <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wider">Payment & Debit Note Clearances</h3>
                            <div class="overflow-x-auto rounded-lg border border-gray-200">
                                <table class="w-full text-left text-xs border-collapse">
                                    <thead class="bg-gray-100 text-gray-600 font-bold uppercase border-b border-gray-200">
                                        <tr>
                                            <th class="px-4 py-2 text-center" style="width:40px;">#</th>
                                            <th class="px-4 py-2">Document #</th>
                                            <th class="px-4 py-2">Type</th>
                                            <th class="px-4 py-2">Date</th>
                                            <th class="px-4 py-2 text-right" style="width:110px;">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-100 bg-white">
                                        ${clearanceRows}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        VaultPage.showDetailPane();
    }

    async function postDraft(billId) {
        if (!confirm("Are you sure you want to post this vendor bill to the general ledger?")) return;
        window.setLoading?.(true, "Posting bill...", "detail");
        try {
            await callApi(`/api/accounting/vendor-bills/${billId}`, { post: true }, "PUT");
            alert("Vendor bill successfully posted to ledger.");
            await load(_filterStart, _filterEnd);
        } catch (err) {
            console.error("[postDraft error]", err);
            alert("Failed to post bill: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function deleteDraft(billId) {
        if (!confirm("Are you sure you want to delete this draft vendor bill?")) return;
        window.setLoading?.(true, "Deleting draft bill...", "detail");
        try {
            await callApi(`/api/accounting/vendor-bills/${billId}`, {}, "DELETE");
            alert("Draft vendor bill deleted.");
            await load(_filterStart, _filterEnd);
        } catch (err) {
            console.error("[deleteDraft error]", err);
            alert("Failed to delete draft: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function openDebitNote(billId) {
        const reason = prompt("Enter narration / reason for issuing this Debit Note:", "Carrier SLA breach / freight adjustment");
        if (!reason) return;

        window.setLoading?.(true, "Issuing Debit Note...", "detail");
        try {
            const res = await callApi(`/api/accounting/vendor-bills/${billId}/debit-note`, { narration: reason }, "POST");
            const dnNo = res?.debit_note?.transaction_no || "Debit Note";
            alert(`Successfully issued ${dnNo} and assigned clearance to bill.`);
            await load(_filterStart, _filterEnd);
        } catch (err) {
            console.error("[openDebitNote error]", err);
            alert("Failed to issue debit note: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const carriers = [
            { code: "DELHIVERY", name: "Delhivery Express" },
            { code: "BLUEDART", name: "Blue Dart Express" },
            { code: "DTDC", name: "DTDC Courier & Cargo" },
            { code: "POSTOFFICE", name: "India Post Speed Post" },
            { code: "TRACKON", name: "Trackon Courier" }
        ];

        const todayStr = new Date().toISOString().split("T")[0];

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-5">
                    <div class="border-b border-gray-100 pb-3 flex justify-between items-center">
                        <h2 class="text-lg font-bold text-gray-900">New Purchase Bill</h2>
                        <button onclick="VaultPurchases.load()" class="text-gray-400 hover:text-gray-700 text-sm">Cancel</button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Carrier / Vendor *</label>
                            <select id="newPbCarrier" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
                                ${carriers.map(c => `<option value="${c.code}">${c.name} (${c.code})</option>`).join("")}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Vendor Invoice / Reference Ref</label>
                            <input type="text" id="newPbRef" placeholder="e.g. DEL-OCT-09912" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Bill Date *</label>
                            <input type="date" id="newPbDate" value="${todayStr}" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">Narration / Description</label>
                            <input type="text" id="newPbNarration" placeholder="Line-haul freight charges" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500">
                        </div>
                    </div>

                    <div class="space-y-2 pt-2">
                        <label class="block text-xs font-bold text-gray-700 uppercase">Bill Line Items</label>
                        <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                            <div class="md:col-span-6">
                                <label class="block text-[10px] text-gray-500 mb-0.5">Description</label>
                                <input type="text" id="newPbLineDesc" value="Freight / Transit charges" class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded">
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-[10px] text-gray-500 mb-0.5">Qty</label>
                                <input type="number" id="newPbLineQty" value="1" step="1" min="1" class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded text-right">
                            </div>
                            <div class="md:col-span-4">
                                <label class="block text-[10px] text-gray-500 mb-0.5">Amount (₹)</label>
                                <input type="number" id="newPbLineAmt" value="1000.00" step="0.01" min="0" class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded text-right font-bold text-orange-800">
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button onclick="VaultPurchases.saveNewBill(false)" class="btn btn-sm">
                            <span>Save as Draft</span>
                        </button>
                        <button onclick="VaultPurchases.saveNewBill(true)" class="btn btn-sm bg-orange-600 text-white hover:bg-orange-700">
                            <span>✓ Post to Ledger</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async function saveNewBill(autoPost) {
        const carrier = document.getElementById("newPbCarrier")?.value;
        const ref = document.getElementById("newPbRef")?.value;
        const bDate = document.getElementById("newPbDate")?.value;
        const narration = document.getElementById("newPbNarration")?.value;
        const lineDesc = document.getElementById("newPbLineDesc")?.value || "Freight charges";
        const qty = parseFloat(document.getElementById("newPbLineQty")?.value || 1);
        const amt = parseFloat(document.getElementById("newPbLineAmt")?.value || 0);

        if (!carrier) {
            alert("Please select a carrier / vendor.");
            return;
        }
        if (amt <= 0) {
            alert("Please enter a valid bill amount.");
            return;
        }

        window.setLoading?.(true, autoPost ? "Posting bill..." : "Saving draft bill...", "detail");
        try {
            const payload = {
                carrier_code: carrier,
                reference: ref,
                narration: narration || `Bill from ${carrier}`,
                bill_date: bDate ? `${bDate}T00:00:00` : null,
                auto_post: autoPost,
                line_items_data: [
                    {
                        narration: lineDesc,
                        quantity: qty,
                        amount: amt,
                        expense_account_code: 5000
                    }
                ]
            };

            await callApi("/api/accounting/vendor-bills", payload, "POST");
            alert(`Vendor bill successfully ${autoPost ? "posted" : "saved as draft"}.`);
            await load();
        } catch (err) {
            console.error("[saveNewBill error]", err);
            alert("Failed to create vendor bill: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function load(startDate = null, endDate = null) {
        _injectListPane();
        window.setLoading?.(true, "Loading purchase bills...", "list");

        try {
            let url = "/api/accounting/vendor-bills";
            const queryParts = [];
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);
            if (queryParts.length) url += `?${queryParts.join("&")}`;

            const res = await callApi(url, {}, "GET");
            _allBills = Array.isArray(res) ? res : (res?.data || res?.bills || []);
            _renderList();

            if (_allBills.length > 0) {
                _renderDetail(_allBills[0]);
                const firstLi = document.querySelector("#vaultList li");
                if (firstLi) firstLi.classList.add("selected");
            }
        } catch (err) {
            console.error("[VaultPurchases load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) { msg.textContent = "Failed to load purchase bills: " + (err.message || err); msg.classList.remove("hidden"); }
        } finally {
            window.setLoading?.(false);
        }
    }

    return { 
        load, 
        search: _renderList,
        postDraft,
        deleteDraft,
        openDebitNote,
        openAddPane,
        saveNewBill
    };
})();

window.VaultPurchases = VaultPurchases;
