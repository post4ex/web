// ============================================================================
// VAULT-RECEIPTS.JS — Client Receipts & Vendor Payments
// Tiles: receipts (💰), payments (💸)
// Connected to Double-Entry Accounting Engine
// ============================================================================

const VaultReceipts = (() => {

    let _activeMode = "receipts"; // 'receipts' or 'payments'
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
        
        const isPayments = _activeMode === "payments";
        if (search) {
            search.placeholder = isPayments 
                ? "Search by ref, vendor, UTR, date..." 
                : "Search by ref, customer, date...";
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
                            <span>🔍</span> Filter ${isPayments ? "Vendor Payments" : "Customer Receipts"}
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

        const isPayments = _activeMode === "payments";
        const q = (document.getElementById("vaultSearch")?.value || "").toLowerCase().trim();

        const filtered = _allItems.filter(e => {
            if (!q) return true;
            const ref = (e.payment_no || e.receipt_no || e.transaction_reference || e.number || "").toLowerCase();
            const party = (e.vendor?.name || e.vendor?.carrier_code || e.client?.name || "").toLowerCase();
            const extRef = (e.reference || "").toLowerCase();
            const dt = (e.date || "").toLowerCase();
            return ref.includes(q) || party.includes(q) || extRef.includes(q) || dt.includes(q);
        });

        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No ${isPayments ? "vendor payment" : "receipt"} records found.</li>`;
            return;
        }

        ul.innerHTML = filtered.map(e => {
            const ref = isPayments 
                ? (e.payment_no || e.number || `PAY-${e.id}`)
                : (e.receipt_no || e.number || e.transaction_reference || `REC-${e.id}`);
            const partyName = isPayments
                ? (e.vendor?.name || e.vendor?.carrier_code || "Vendor")
                : (e.client?.name || "Customer");
            const dateStr = e.date || "N/A";
            const amount = parseFloat(e.amount || 0);
            const isPosted = e.is_posted !== false;
            const badgeClass = isPosted ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200";
            const badgeLabel = isPosted ? (isPayments ? "POSTED" : "POSTED") : "DRAFT";

            return `
                <li data-id="${e.id}" class="p-3 rounded-lg cursor-pointer hover:bg-emerald-50 border border-gray-200 transition-colors">
                    <div class="flex items-center justify-between gap-2">
                        <strong class="text-emerald-800 text-sm font-bold truncate">${_escapeHtml(ref)}</strong>
                        <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border ${badgeClass}">${badgeLabel}</span>
                    </div>
                    <div class="text-xs font-semibold text-gray-800 truncate mt-0.5">${_escapeHtml(partyName)}</div>
                    ${e.reference ? `<div class="text-[11px] text-gray-500 truncate font-mono">Ref: ${_escapeHtml(e.reference)}</div>` : ""}
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
                const item = _allItems.find(p => String(p.id) === String(li.dataset.id));
                if (item) _renderDetail(item);
            })
        );
    }

    function _renderDetail(p) {
        if (!p) return;
        VaultPage.showDetail(true);
        const view = document.getElementById("vaultDetailView");
        if (!view) return;

        const isPayments = _activeMode === "payments";
        const ref = isPayments 
            ? (p.payment_no || p.number || `PAY-${p.id}`)
            : (p.receipt_no || p.number || p.transaction_reference || `REC-${p.id}`);
        const dateStr = p.date || "N/A";
        const amount = parseFloat(p.amount || 0);
        const assignedAmt = parseFloat(p.assigned_amount || 0);
        const unassignedAmt = parseFloat(p.unassigned_amount || 0);
        const isPosted = p.is_posted !== false;
        const branch = (typeof getActiveBranch === "function" ? getActiveBranch() : "") || "DDN";
        const appliedItems = p.assignments || p.invoices || [];

        const partyLabel = isPayments ? "Paid To (Vendor / Carrier)" : "Received From (Customer)";
        const partyName = isPayments 
            ? (p.vendor?.name || p.vendor?.carrier_code || "Vendor")
            : (p.client?.name || "Customer");
        const partySub = isPayments 
            ? (p.vendor?.carrier_code ? `Carrier Code: ${p.vendor.carrier_code} · Account: ${p.vendor.account_code || ''}` : '')
            : (p.client?.client_code ? `Client Code: ${p.client.client_code}` : '');

        const rowsHtml = appliedItems.map((asgn, idx) => {
            const num = isPayments 
                ? (asgn.bill_no || asgn.assigned_no || "Bill")
                : (asgn.invoice_no || asgn.assigned_no || asgn.number || "Invoice");
            const amt = parseFloat(asgn.amount || 0);
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
                                <span class="px-2.5 py-0.5 text-xs font-bold rounded-full ${isPosted ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-amber-100 text-amber-800 border border-amber-200"}">
                                    ${isPosted ? (isPayments ? "POSTED PAYOUT" : "POSTED RECEIPT") : "DRAFT"}
                                </span>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-bold text-gray-700">${branch}</span> · Bank: <span class="font-bold text-emerald-700">${_escapeHtml(p.bank_account?.name || "HDFC Bank Operating")}</span></p>
                        </div>
                        <div class="flex items-center gap-2 flex-wrap justify-end">
                            <button onclick="window.print()" class="btn btn-sm">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                <span>Print</span>
                            </button>

                            ${!isPosted ? `
                                <button onclick="VaultReceipts.postDraft('${p.id}')" class="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700">
                                    <span>✓ Post to Ledger</span>
                                </button>
                                <button onclick="VaultReceipts.deleteDraft('${p.id}')" class="btn btn-sm bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
                                    <span>🗑 Delete Draft</span>
                                </button>
                            ` : `
                                <button onclick="VaultReceipts.voidReceipt('${p.id}')" class="btn btn-sm bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
                                    <span>✕ Void & Reverse</span>
                                </button>
                            `}
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="p-4 bg-emerald-50/40 rounded-lg border border-emerald-100 space-y-1">
                            <span class="text-[11px] text-emerald-700 font-bold uppercase block">${partyLabel}</span>
                            <div class="text-base font-bold text-gray-900">${_escapeHtml(partyName)}</div>
                            ${partySub ? `<div class="text-xs text-gray-600 font-mono">${_escapeHtml(partySub)}</div>` : ""}
                        </div>
                        <div class="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <div>
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Transaction Date</span>
                                <span class="text-xs font-bold text-gray-800">📅 ${dateStr}</span>
                            </div>
                            <div>
                                <span class="text-[10px] text-gray-400 font-semibold uppercase block">Reference / UTR</span>
                                <span class="text-xs font-bold text-emerald-700 font-mono">${_escapeHtml(p.reference || "N/A")}</span>
                            </div>
                            <div class="col-span-2 pt-1 border-t border-gray-200 flex justify-between items-center">
                                <span class="text-xs font-semibold text-gray-600">Total Settlement Amount:</span>
                                <span class="text-base font-bold text-emerald-700">₹${amount.toFixed(2)}</span>
                            </div>
                            <div class="col-span-2 flex justify-between items-center text-xs text-gray-500">
                                <span>Reconciled to ${isPayments ? "Bills" : "Invoices"}: ₹${assignedAmt.toFixed(2)}</span>
                                <span class="${unassignedAmt > 0 ? 'text-amber-700 font-bold' : ''}">Unallocated Float: ₹${unassignedAmt.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    ${rowsHtml.length ? `
                        <div class="space-y-2">
                            <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wider">Applied ${isPayments ? "Bills" : "Invoices"} (Cleared via FIFO)</h3>
                            <div class="overflow-x-auto rounded-lg border border-gray-200">
                                <table class="w-full text-left text-xs border-collapse">
                                    <thead class="bg-gray-100 text-gray-600 font-bold uppercase border-b border-gray-200">
                                        <tr>
                                            <th class="px-4 py-2 text-center" style="width:40px;">#</th>
                                            <th class="px-4 py-2">${isPayments ? "Bill Number" : "Invoice Number"}</th>
                                            <th class="px-4 py-2 text-right" style="width:120px;">Amount Applied</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-100 bg-white">
                                        ${rowsHtml}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : `<p class="text-xs text-gray-400 italic">No bill/invoice clearances attached to this transaction.</p>`}
                </div>
            </div>
        `;

        VaultPage.showDetailPane();
    }

    async function postDraft(itemId) {
        if (!confirm("Are you sure you want to post this draft transaction to the general ledger?")) return;
        const isPayments = _activeMode === "payments";
        window.setLoading?.(true, `Posting ${isPayments ? "payout" : "receipt"}...`, "detail");
        try {
            const url = isPayments ? `/api/accounting/vendor-payments/${itemId}` : `/api/accounting/receipts/${itemId}`;
            const payload = isPayments ? { post: true } : { auto_post: true };
            await callApi(url, payload, "PUT");
            alert(`${isPayments ? "Vendor payment" : "Receipt"} successfully posted.`);
            await load(_filterStart, _filterEnd);
        } catch (err) {
            console.error("[postDraft error]", err);
            alert("Failed to post: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function deleteDraft(itemId) {
        if (!confirm("Are you sure you want to delete this draft transaction?")) return;
        const isPayments = _activeMode === "payments";
        window.setLoading?.(true, `Deleting draft...`, "detail");
        try {
            const url = isPayments ? `/api/accounting/vendor-payments/${itemId}` : `/api/accounting/receipts/${itemId}`;
            await callApi(url, {}, "DELETE");
            alert("Draft transaction deleted.");
            await load(_filterStart, _filterEnd);
        } catch (err) {
            console.error("[deleteDraft error]", err);
            alert("Failed to delete draft: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function voidReceipt(itemId) {
        const isPayments = _activeMode === "payments";
        const promptMsg = isPayments 
            ? "Enter narration/reason for voiding and reversing this vendor payout:" 
            : "Enter narration/reason for voiding and reversing this payment receipt:";
        const defaultReason = isPayments ? "Payout cancellation / wrong UTR" : "Customer payment reversal / bounced cheque";
        
        const reason = prompt(promptMsg, defaultReason);
        if (!reason) return;

        window.setLoading?.(true, "Voiding and reversing transaction...", "detail");
        try {
            const url = isPayments ? `/api/accounting/vendor-payments/${itemId}/void` : `/api/accounting/receipts/${itemId}/void`;
            const res = await callApi(url, { narration: reason, reason }, "POST");
            const jv = res.reversing_journal_no || res.reversal_journal_no || "JV";
            alert(`Transaction successfully voided and reversed via Journal Entry: ${jv}`);
            await load(_filterStart, _filterEnd);
        } catch (err) {
            console.error("[voidReceipt error]", err);
            alert("Failed to void: " + (err.message || err));
        } finally {
            window.setLoading?.(false);
        }
    }

    async function load(startDate = null, endDate = null) {
        _injectListPane();
        const isPayments = _activeMode === "payments";
        window.setLoading?.(true, `Loading ${isPayments ? "vendor payments" : "receipts"}...`, "list");

        try {
            let url = isPayments ? "/api/accounting/vendor-payments" : "/api/accounting/receipts";
            const queryParts = [];
            if (startDate) queryParts.push(`start_date=${encodeURIComponent(startDate)}`);
            if (endDate) queryParts.push(`end_date=${encodeURIComponent(endDate)}`);
            if (queryParts.length) url += `?${queryParts.join("&")}`;

            const res = await callApi(url, {}, "GET");
            _allItems = Array.isArray(res) ? res : (res?.data || res?.payments || res?.receipts || []);
            _renderList();

            if (_allItems.length > 0) {
                _renderDetail(_allItems[0]);
                const firstLi = document.querySelector("#vaultList li");
                if (firstLi) firstLi.classList.add("selected");
            }
        } catch (err) {
            console.error("[VaultReceipts load error]", err);
            const msg = document.getElementById("vaultListMsg");
            if (msg) { msg.textContent = `Failed to load ${isPayments ? "payments" : "receipts"}: ` + (err.message || err); msg.classList.remove("hidden"); }
        } finally {
            window.setLoading?.(false);
        }
    }

    function setMode(mode) {
        _activeMode = mode;
    }

    return { 
        load, 
        setMode, 
        search: _renderList,
        postDraft,
        deleteDraft,
        voidReceipt
    };
})();

window.VaultReceipts = VaultReceipts;
