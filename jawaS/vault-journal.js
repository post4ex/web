// ============================================================================
// VAULT-JOURNAL.JS — Journal entries with multi-line Dr/Cr support
// Tiles: journal-entries, opening-balances, recurring
// API: POST /api/ledger/journal, POST /api/ledger/journal/multi
// ============================================================================

const VaultJournal = (() => {

    let _allLedger  = [];
    let _allB2B     = [];
    let _allCOA     = [];
    let _activeJournalType = 'JOURNAL';
    let _coaMap     = {};

    // ── Recurring templates ───────────────────────────────────────────────
    let _recurringTemplates = [];

    function _loadRecurringTemplates() {
        const templates = _allLedger.filter(e => e.ENTRY_TYPE === 'JOURNAL' && e.JOURNAL_TYPE === 'RECURRING' && e.STATUS === 'ACTIVE');
        _recurringTemplates = templates.map(t => {
            try { return { ...JSON.parse(t.NARRATION || '{}'), entry_id: t.ENTRY_ID, code: t.CODE }; }
            catch { return null; }
        }).filter(Boolean);
    }

    // ── COA cache ─────────────────────────────────────────────────────────
    async function _loadCoaCache() {
        // TODO: load COA from Manager.io cache keys
    }

    function _coaName(code) {
        if (!code) return '';
        const a = _coaMap[code];
        return a ? `${a.code} — ${a.name}` : code;
    }



    function _label() {
        const map = { 'JOURNAL': 'Journal Entries', 'OPENING_BALANCE': 'Opening Balances', 'RECURRING': 'Recurring Entries' };
        return map[_activeJournalType] || 'Journal';
    }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, narration…';
    }

    // ── List ──────────────────────────────────────────────────────────────
    function _getEntries() {
        return _allLedger.filter(e => {
            if (_activeJournalType === 'JOURNAL') return e.ENTRY_TYPE === 'JOURNAL' && (!e.JOURNAL_TYPE || e.JOURNAL_TYPE === 'JOURNAL' || e.JOURNAL_TYPE === 'ADJUSTMENT');
            if (_activeJournalType === 'OPENING_BALANCE') return e.ENTRY_TYPE === 'JOURNAL' && e.JOURNAL_TYPE === 'OPENING_BALANCE';
            if (_activeJournalType === 'RECURRING') return e.ENTRY_TYPE === 'JOURNAL' && e.JOURNAL_TYPE === 'RECURRING';
            return false;
        });
    }

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const entries = _getEntries();
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? entries.filter(e =>
                (e.CODE || '').toLowerCase().includes(q) ||
                (e.NARRATION || '').toLowerCase().includes(q) ||
                (e.JOURNAL_TYPE || '').toLowerCase().includes(q)
              )
            : entries;
        filtered.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No ${_label()} found.</li>`;
            return;
        }
        // De-duplicate by TXN_ID — show only the first row per transaction
        const seenTxn = new Set();
        const unique = filtered.filter(e => {
            const txn = e.TXN_ID || e.ENTRY_ID;
            if (seenTxn.has(txn)) return false;
            seenTxn.add(txn);
            return true;
        });
        const typeIcons = { 'OPENING_BALANCE': '🗂️', 'ADJUSTMENT': '✏️', 'JOURNAL': '✏️', 'RECURRING': '🔄' };
        ul.innerHTML = unique.slice(0, 50).map(e => {
            const icon = typeIcons[e.JOURNAL_TYPE] || '✏️';
            const statusColor = e.STATUS === 'ACTIVE' ? 'text-green-700' :
                                e.STATUS === 'PENDING' ? 'text-yellow-700' :
                                e.STATUS === 'VOID' ? 'text-red-700' : 'text-gray-700';
            const balance = (+e.DEBIT || 0) - (+e.CREDIT || 0);
            const balClass = balance >= 0 ? 'text-green-600' : 'text-red-600';
            return `<li data-txn="${e.TXN_ID || e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-purple-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <div>
                        <strong class="text-purple-700 block text-sm">${icon} ${e.CODE || ''}</strong>
                        <span class="text-xs text-gray-500">${e.NARRATION ? (e.NARRATION.length > 60 ? e.NARRATION.slice(0, 60) + '…' : e.NARRATION) : ''}</span>
                    </div>
                    <span class="${statusColor} text-xs font-medium">${e.STATUS || ''}</span>
                </div>
                <div class="text-xs text-gray-400 mt-1 flex justify-between">
                    <span>${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''} · ${e.JOURNAL_TYPE || 'JOURNAL'}</span>
                    ${e.JOURNAL_TYPE === 'OPENING_BALANCE' ? `<span class="${balClass} font-medium">₹${Math.abs(balance).toFixed(2)} ${balance >= 0 ? 'Dr' : 'Cr'}</span>` : ''}
                </div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(li.dataset.txn);
            })
        );
    }

    function _printEntry(txnId) {
        const rows = _allLedger.filter(e => (e.TXN_ID || e.ENTRY_ID) === txnId);
        if (rows.length) VaultPrint.printJournal(rows);
    }

    function search() { _renderList(); }

    // ── Detail (multi-line aware) ──────────────────────────────────────────
    function _renderDetail(txnId) {
        if (!txnId) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const rows = _allLedger.filter(e => (e.TXN_ID || e.ENTRY_ID) === txnId);
        const entry = rows[0];
        if (!entry) return;
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';
        const isMulti = rows.length > 2;
        const totalDr = rows.reduce((s, r) => s + (+r.DEBIT || 0), 0);
        const totalCr = rows.reduce((s, r) => s + (+r.CREDIT || 0), 0);
        const printBtn = isActive ? `<button onclick="VaultJournal._printEntry('${txnId}')" class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> Print</button>` : '';

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">Journal Detail ${isMulti ? '(Multi-line)' : ''}</h3>
                    <div class="flex gap-2 items-center">
                        ${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : ''}
                        ${printBtn}
                        <span class="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">₹${totalDr.toFixed(2)}</span>
                    </div>
                </div>
                <div class="detail-card-body">
                    <!-- Header info -->
                    <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 p-3 rounded-lg mb-3">
                        <div><span class="text-gray-500">Code:</span> <span class="font-semibold">${entry.CODE || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Type:</span> ${entry.JOURNAL_TYPE || 'JOURNAL'}</div>
                        <div><span class="text-gray-500">Status:</span> <span class="font-medium">${entry.STATUS || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Total Dr:</span> ₹${totalDr.toFixed(2)}</div>
                        <div><span class="text-gray-500">Total Cr:</span> ₹${totalCr.toFixed(2)}</div>
                        ${entry.BALANCE ? `<div><span class="text-gray-500">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>` : ''}
                        <div><span class="text-gray-500">Branch:</span> ${entry.BRANCH || 'N/A'}</div>
                    </div>

                    <!-- Line items table -->
                    <div class="text-xs mb-3">
                        <div class="font-semibold text-gray-600 mb-2">Line Items (${rows.length})</div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-xs divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">#</th>
                                        <th class="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Account</th>
                                        <th class="px-3 py-1.5 text-right font-medium text-gray-500 uppercase">Debit</th>
                                        <th class="px-3 py-1.5 text-right font-medium text-gray-500 uppercase">Credit</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-100">
                                    ${rows.map((r, i) => {
                                        const coa = r.COA_DR || r.COA_CR;
                                        const coaName = coa ? _coaName(coa) : '';
                                        return `<tr class="${r.STATUS === 'VOID' ? 'line-through text-gray-400' : ''}">
                                            <td class="px-3 py-1.5 text-gray-400">${i + 1}</td>
                                            <td class="px-3 py-1.5 font-medium text-gray-700">${coaName || '(auto)'}</td>
                                            <td class="px-3 py-1.5 text-right font-medium text-red-600">${(+r.DEBIT||0) > 0 ? '₹' + (+r.DEBIT).toFixed(2) : ''}</td>
                                            <td class="px-3 py-1.5 text-right font-medium text-green-600">${(+r.CREDIT||0) > 0 ? '₹' + (+r.CREDIT).toFixed(2) : ''}</td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                                <tfoot class="bg-gray-50 font-semibold">
                                    <tr>
                                        <td colspan="2" class="px-3 py-1.5 text-right text-gray-700">Total</td>
                                        <td class="px-3 py-1.5 text-right text-red-700">₹${totalDr.toFixed(2)}</td>
                                        <td class="px-3 py-1.5 text-right text-green-700">₹${totalCr.toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <!-- Narration -->
                    ${entry.NARRATION ? `<div class="text-sm text-gray-700 bg-white border rounded-lg p-3 mb-3">📝 ${entry.NARRATION}</div>` : ''}

                    <!-- Audit info -->
                    <details class="mt-2">
                        <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Audit Info</summary>
                        <div class="grid grid-cols-2 gap-3 text-xs text-gray-500 mt-2 p-3 border rounded-lg">
                            <div>TXN ID: <span class="font-mono">${entry.TXN_ID || 'N/A'}</span></div>
                            <div>FY: ${entry.FY || 'N/A'}</div>
                            <div>Created: ${entry.USER_NAME || 'N/A'}</div>
                            <div>Rows: ${rows.length}</div>
                            ${entry.APPROVED_BY ? `<div>Approved: ${entry.APPROVED_BY}</div>` : ''}
                            ${entry.VOID_REASON ? `<div class="col-span-2 text-red-600">Void: ${entry.VOID_REASON}</div>` : ''}
                        </div>
                    </details>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Multi-line form ───────────────────────────────────────────────────
    function openAddPane() {
        // Route to dedicated form for opening balances
        if (_activeJournalType === 'OPENING_BALANCE') {
            _openOpeningBalanceForm();
            return;
        }
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">New ${_label()} — Multi-Line</h3></div>
                <div class="detail-card-body">
                    <form id="jrForm" class="space-y-4">
                        <!-- Header fields -->
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="jrCodeList">
                                <datalist id="jrCodeList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                <input name="entry_date" type="date" required class="form-input text-sm">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                <input name="branch" class="form-input text-sm uppercase" placeholder="Optional" list="jrBranchList">
                                <datalist id="jrBranchList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Type</label>
                                <input class="form-input text-sm bg-gray-100" value="${_activeJournalType}" readonly>
                            </div>
                        </div>

                        <!-- Line items grid -->
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <label class="block text-xs font-medium text-gray-600">Line Items</label>
                                <div class="flex gap-2">
                                    <span id="jrBalanceMsg" class="text-xs font-medium text-gray-500 self-center">Dr: ₹0.00 / Cr: ₹0.00</span>
                                    <button type="button" id="jrAddLine" class="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">+ Add Line</button>
                                </div>
                            </div>
                            <div class="overflow-x-auto border rounded-lg">
                                <table class="min-w-full text-xs divide-y divide-gray-200" id="jrLinesTable">
                                    <thead class="bg-gray-50">
                                        <tr>
                                            <th class="px-3 py-1.5 text-left font-medium text-gray-500 uppercase w-10">#</th>
                                            <th class="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Account (COA Code)</th>
                                            <th class="px-3 py-1.5 text-right font-medium text-gray-500 uppercase w-32">Debit (₹)</th>
                                            <th class="px-3 py-1.5 text-right font-medium text-gray-500 uppercase w-32">Credit (₹)</th>
                                            <th class="px-3 py-1.5 text-center w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-gray-100" id="jrLinesBody">
                                        <!-- Rows added dynamically -->
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Narration -->
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration *</label>
                            <textarea name="narration" required rows="2" class="form-input text-sm w-full" placeholder="Description of journal entry"></textarea>
                        </div>

                        <!-- Submit -->
                        <div class="flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="jrBtnText">Save ${_label()}</span>
                                <div id="jrSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="jrResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate code datalist
        const dl = document.getElementById('jrCodeList');
        _allB2B.forEach(c => {
            if (c.CODE) {
                const opt = document.createElement('option');
                opt.value = c.CODE; opt.label = `${c.CODE} - ${c.B2B_NAME || ''}`;
                dl.appendChild(opt);
            }
        });

        // Add first two default lines (Dr + Cr)
        const tbody = document.getElementById('jrLinesBody');
        _addLineRow(tbody);
        _addLineRow(tbody);
        _recalcLines();

        // Add line button
        document.getElementById('jrAddLine').addEventListener('click', () => {
            _addLineRow(tbody);
            _recalcLines();
        });

        // Submit
        document.getElementById('jrForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const lines = _collectLines();

            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('jrSpinner');
            const resp = document.getElementById('jrResponse');
            btn.disabled = true; sp.classList.remove('hidden');

            // Validate
            if (lines.length < 2) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ At least 2 lines required.';
                resp.classList.remove('hidden');
                btn.disabled = false; sp.classList.add('hidden');
                return;
            }
            const totalDr = lines.reduce((s, l) => s + l.debit, 0);
            const totalCr = lines.reduce((s, l) => s + l.credit, 0);
            if (Math.abs(totalDr - totalCr) > 0.001) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = `❌ Debit/Credit mismatch: Dr ₹${totalDr.toFixed(2)} ≠ Cr ₹${totalCr.toFixed(2)}`;
                resp.classList.remove('hidden');
                btn.disabled = false; sp.classList.add('hidden');
                return;
            }
            if (lines.some(l => !l.coa_code)) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ All lines must have a COA account selected.';
                resp.classList.remove('hidden');
                btn.disabled = false; sp.classList.add('hidden');
                return;
            }
            if (lines.some(l => l.debit > 0 && l.credit > 0)) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ Each line must be either Dr or Cr, not both.';
                resp.classList.remove('hidden');
                btn.disabled = false; sp.classList.add('hidden');
                return;
            }

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            try {
                // TODO: migrate journal creation to Manager.io
                alert('Coming soon — creating journal entries through Manager.io');
                return;
                const res = await callApi('/api/ledger/journal/multi', {
                    code: data.code,
                    entry_date: toMs(data.entry_date),
                    narration: data.narration,
                    branch: data.branch || '',
                    lines: lines.map(l => ({ coa_code: l.coa_code, debit: l.debit, credit: l.credit })),
                }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ ${_label()} saved (${res.line_count} lines). Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');
                e.target.reset();
                tbody.innerHTML = '';
                _addLineRow(tbody);
                _addLineRow(tbody);
                _recalcLines();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderList();
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });

        document.querySelector('[name="entry_date"]').value = new Date().toISOString().split('T')[0];
        VaultPage.showDetailPane();
    }

    // ── Opening Balance form (single-amount, auto Dr/Cr mapping) ──────────
    function _openOpeningBalanceForm() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">New Opening Balance</h3></div>
                <div class="detail-card-body">
                    <!-- COA mapping info -->
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-800">
                        <strong>📒 Auto COA Mapping</strong>
                        <div class="mt-1 grid grid-cols-2 gap-2">
                            <div>Dr: <span class="font-mono font-semibold">1010</span> Accounts Receivable</div>
                            <div>Cr: <span class="font-mono font-semibold">2095</span> Opening Bal Reserve</div>
                        </div>
                    </div>

                    <!-- Existing balance warning -->
                    <div id="obExistingWarning" class="hidden bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-xs text-yellow-800">
                        ⚠️ <span id="obExistingMsg"></span>
                    </div>

                    <form id="jrForm" class="space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                <input name="code" id="obCodeInput" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="obCodeList">
                                <datalist id="obCodeList"></datalist>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                                <input name="entry_date" type="date" required class="form-input text-sm">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Opening Balance ₹ *</label>
                                <input name="amount" type="number" step="0.01" required class="form-input text-sm" placeholder="e.g. 50000.00">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Balance Type</label>
                                <select name="balance_type" class="form-input text-xs">
                                    <option value="DR">Dr (Receivable — client owes us)</option>
                                    <option value="CR">Cr (Payable — we owe client)</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                <input name="branch" class="form-input text-sm uppercase" placeholder="e.g. DDN" list="obBranchList">
                                <datalist id="obBranchList"></datalist>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration *</label>
                            <textarea name="narration" required rows="2" class="form-input text-sm w-full" placeholder="e.g. Opening balance brought forward"></textarea>
                        </div>

                        <div class="flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="jrBtnText">Save Opening Balance</span>
                                <div id="jrSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="jrResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate code datalist
        const dl = document.getElementById('obCodeList');
        _allB2B.forEach(c => {
            if (c.CODE) {
                const opt = document.createElement('option');
                opt.value = c.CODE; opt.label = `${c.CODE} - ${c.B2B_NAME || ''}`;
                dl.appendChild(opt);
            }
        });

        // Populate branch datalist
        getAppData().then(data => {
            const dl = document.getElementById('obBranchList');
            if (data?.BRANCHES) Object.values(data.BRANCHES).forEach(b => {
                if (b.BRANCH_CODE) { const o = document.createElement('option'); o.value = b.BRANCH_CODE; dl.appendChild(o); }
            });
        });

        // Check for existing OB when code changes
        document.getElementById('obCodeInput').addEventListener('change', function() {
            const code = this.value.trim().toUpperCase();
            this.value = code;
            if (!code) return;
            const existingOB = _allLedger.filter(e =>
                e.CODE === code && e.JOURNAL_TYPE === 'OPENING_BALANCE' && e.STATUS === 'ACTIVE'
            );
            const warn = document.getElementById('obExistingWarning');
            const msg = document.getElementById('obExistingMsg');
            if (existingOB.length > 0) {
                const e = existingOB[0];
                const bal = (+e.DEBIT || 0) - (+e.CREDIT || 0);
                warn.classList.remove('hidden');
                msg.textContent = `An opening balance (₹${Math.abs(bal).toFixed(2)} ${bal >= 0 ? 'Dr' : 'Cr'}) already exists for "${code}". Saving will replace it (old entry will be voided).`;
            } else {
                warn.classList.add('hidden');
            }
        });

        // Date default
        document.querySelector('[name="entry_date"]').value = new Date().toISOString().split('T')[0];

        // Submit
        document.getElementById('jrForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);

            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('jrSpinner');
            const resp = document.getElementById('jrResponse');
            btn.disabled = true; sp.classList.remove('hidden');

            const amount = parseFloat(data.amount) || 0;
            if (amount <= 0) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ Amount must be greater than 0.';
                resp.classList.remove('hidden');
                btn.disabled = false; sp.classList.add('hidden');
                return;
            }

            const isCr = data.balance_type === 'CR';
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;

            try {
                // Use replace-ob endpoint (atomically voids old OB + creates new one)
                // TODO: migrate opening balance to Manager.io
                alert('Coming soon — setting opening balances through Manager.io');
                return;
                const res = await callApi('/api/ledger/journal/replace-ob', {
                    code: data.code,
                    entry_date: toMs(data.entry_date),
                    amount: amount,
                    is_credit: isCr,
                    narration: data.narration || `Opening balance for ${data.code}`,
                    branch: data.branch || '',
                }, 'POST');

                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Opening balance saved. Balance: ₹${(+res.balance).toFixed(2)}${res.voided_count > 0 ? ` (replaced ${res.voided_count} existing OB)` : ''}`;
                resp.classList.remove('hidden');
                e.target.reset();
                document.querySelector('[name="entry_date"]').value = new Date().toISOString().split('T')[0];
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderList();
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });

        VaultPage.showDetailPane();
    }

    function _addLineRow(tbody, lineData) {
        const idx = tbody.children.length + 1;
        const coaOptions = _allCOA.map(a =>
            `<option value="${a.code}">${a.code} — ${a.name}</option>`
        ).join('');

        const tr = document.createElement('tr');
        tr.className = 'line-row';
        tr.innerHTML = `
            <td class="px-3 py-1.5 text-gray-400 line-num text-center">${idx}</td>
            <td class="px-3 py-1.5">
                <select class="coa-select form-input text-xs w-full" required>
                    <option value="">— Select COA —</option>
                    ${coaOptions}
                </select>
            </td>
            <td class="px-3 py-1.5">
                <input type="number" step="0.01" min="0" class="line-dr form-input text-xs w-full text-right" placeholder="0.00" value="">
            </td>
            <td class="px-3 py-1.5">
                <input type="number" step="0.01" min="0" class="line-cr form-input text-xs w-full text-right" placeholder="0.00" value="">
            </td>
            <td class="px-3 py-1.5 text-center">
                <button type="button" class="line-remove px-1.5 py-0.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded" title="Remove line">&times;</button>
            </td>`;

        // Pre-fill if lineData provided (edit mode)
        if (lineData) {
            const sel = tr.querySelector('.coa-select');
            if (sel) sel.value = lineData.coa_code || '';
            const dr = tr.querySelector('.line-dr');
            if (dr) dr.value = lineData.debit || '';
            const cr = tr.querySelector('.line-cr');
            if (cr) cr.value = lineData.credit || '';
        }

        // Wire events
        tr.querySelector('.line-dr').addEventListener('input', _recalcLines);
        tr.querySelector('.line-cr').addEventListener('input', _recalcLines);
        tr.querySelector('.line-remove').addEventListener('click', () => {
            const rows = tbody.querySelectorAll('.line-row');
            if (rows.length <= 2) return; // Keep at least 2
            tr.remove();
            _renumberLines(tbody);
            _recalcLines();
        });

        tbody.appendChild(tr);
    }

    function _renumberLines(tbody) {
        tbody.querySelectorAll('.line-row').forEach((tr, i) => {
            tr.querySelector('.line-num').textContent = i + 1;
        });
    }

    function _recalcLines() {
        const drInputs = document.querySelectorAll('.line-dr');
        const crInputs = document.querySelectorAll('.line-cr');
        let totalDr = 0, totalCr = 0;
        drInputs.forEach(inp => totalDr += parseFloat(inp.value || 0));
        crInputs.forEach(inp => totalCr += parseFloat(inp.value || 0));
        const msg = document.getElementById('jrBalanceMsg');
        if (msg) {
            const balanced = Math.abs(totalDr - totalCr) < 0.001;
            const balClass = totalDr > 0 || totalCr > 0 ? (balanced ? 'text-green-600' : 'text-red-600') : 'text-gray-500';
            msg.textContent = `Dr: ₹${totalDr.toFixed(2)} / Cr: ₹${totalCr.toFixed(2)}${totalDr > 0 || totalCr > 0 ? (balanced ? ' ✅' : ' ⚠️') : ''}`;
            msg.className = `text-xs font-medium ${balClass} self-center`;
        }
    }

    function _collectLines() {
        const lines = [];
        document.querySelectorAll('.line-row').forEach(tr => {
            const coaCode = tr.querySelector('.coa-select')?.value;
            const debit = parseFloat(tr.querySelector('.line-dr')?.value || 0);
            const credit = parseFloat(tr.querySelector('.line-cr')?.value || 0);
            if (coaCode && (debit > 0 || credit > 0)) {
                lines.push({ coa_code: coaCode, debit, credit });
            }
        });
        return lines;
    }

    // ── Delete (void) ─────────────────────────────────────────────────────
    async function _handleDelete(txnId) {
        const rows = _allLedger.filter(e => (e.TXN_ID || e.ENTRY_ID) === txnId);
        const entry = rows[0];
        if (!entry || entry.STATUS === 'VOID') return;
        if (!confirm(`Delete this ${entry.JOURNAL_TYPE || 'journal'} entry? This will void all ${rows.length} rows.`)) return;
        const reason = prompt('Reason (optional):', '') || '';
        try {
            // Void all rows in the transaction
            // TODO: migrate void to Manager.io
            alert('Coming soon — voiding journal entries through Manager.io');
            return;
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    // ── Recurring form (with schedule config) ──────────────────────────
    function _openRecurringForm(editTxnId) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const isEdit = !!editTxnId;

        // Find existing config if editing
        let existingConfig = null;
        let existingLines = [];
        let existingCode = '';
        if (isEdit) {
            const rows = _allLedger.filter(e => (e.TXN_ID || e.ENTRY_ID) === editTxnId);
            const entry = rows[0];
            if (entry) {
                try { existingConfig = JSON.parse(entry.NARRATION || '{}'); } catch {}
                existingCode = entry.CODE || '';
                existingLines = rows.map(r => ({
                    coa_code: r.COA_DR || r.COA_CR || '',
                    debit: +r.DEBIT || 0,
                    credit: +r.CREDIT || 0,
                })).filter(l => l.coa_code && (l.debit > 0 || l.credit > 0));
            }
        }

        const sch = existingConfig || {};

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${isEdit ? 'Edit' : 'New'} Recurring Template</h3></div>
                <div class="detail-card-body">
                    <form id="jrForm" class="space-y-4">
                        <!-- Header fields -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                                <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" list="jrCodeList" value="${isEdit ? existingCode : ''}">
                                <datalist id="jrCodeList"></datalist>
                            </div>
                                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Schedule Name</label>
                                <input name="schedule_name" class="form-input text-sm" placeholder="e.g. Monthly Rent" value="${sch.schedule_name || ''}">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                                <input name="branch" class="form-input text-sm uppercase" placeholder="e.g. DDN" list="rcrBranchList">
                                <datalist id="rcrBranchList"></datalist>
                            </div>
                        </div>

                        <!-- Schedule config -->
                        <div class="bg-gray-50 p-3 rounded-lg border">
                            <div class="font-semibold text-gray-700 text-xs mb-2">⏰ Schedule</div>
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                                    <select name="frequency" class="form-input text-xs">
                                        ${['daily','weekly','monthly','yearly'].map(f =>
                                            `<option value="${f}" ${(sch.frequency||'monthly') === f ? 'selected' : ''}>${f.charAt(0).toUpperCase() + f.slice(1)}</option>`
                                        ).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Every</label>
                                    <input name="interval" type="number" min="1" class="form-input text-xs" value="${sch.interval || 1}">
                                </div>
                                <div id="rcrDayOfMonth">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Day of Month</label>
                                    <input name="day_of_month" type="number" min="1" max="28" class="form-input text-xs" value="${sch.day_of_month || 1}">
                                </div>
                                <div id="rcrDayOfWeek" class="hidden">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Day of Week</label>
                                    <select name="day_of_week" class="form-input text-xs">
                                        ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d, i) =>
                                            `<option value="${i}" ${(sch.day_of_week||0) === i ? 'selected' : ''}>${d}</option>`
                                        ).join('')}
                                    </select>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-3 mt-3">
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Next Run</label>
                                    <input name="next_run_date" type="date" class="form-input text-xs" value="${sch.next_run ? new Date(sch.next_run).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">End Date (optional)</label>
                                    <input name="end_date" type="date" class="form-input text-xs" value="${sch.end_date ? new Date(sch.end_date).toISOString().split('T')[0] : ''}">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium text-gray-600 mb-1">Max Executions (0=unlimited)</label>
                                    <input name="max_executions" type="number" min="0" class="form-input text-xs" value="${sch.max_executions || 0}">
                                </div>
                            </div>
                        </div>

                        <!-- Line items grid -->
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <label class="block text-xs font-medium text-gray-600">Line Items</label>
                                <div class="flex gap-2">
                                    <span id="jrBalanceMsg" class="text-xs font-medium text-gray-500 self-center">Dr: ₹0.00 / Cr: ₹0.00</span>
                                    <button type="button" id="jrAddLine" class="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">+ Add Line</button>
                                </div>
                            </div>
                            <div class="overflow-x-auto border rounded-lg">
                                <table class="min-w-full text-xs divide-y divide-gray-200">
                                    <thead class="bg-gray-50">
                                        <tr>
                                            <th class="px-3 py-1.5 text-left font-medium text-gray-500 uppercase w-10">#</th>
                                            <th class="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Account (COA Code)</th>
                                            <th class="px-3 py-1.5 text-right font-medium text-gray-500 uppercase w-32">Debit (₹)</th>
                                            <th class="px-3 py-1.5 text-right font-medium text-gray-500 uppercase w-32">Credit (₹)</th>
                                            <th class="px-3 py-1.5 text-center w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="jrLinesBody" class="bg-white divide-y divide-gray-100">
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Narration template -->
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration Template</label>
                            <textarea name="narration_template" rows="2" class="form-input text-sm w-full" placeholder="Rent for {period}">${(sch.narration_template || '')}</textarea>
                            <p class="text-xs text-gray-400 mt-1">Use {period} for month/year, {date} for full date</p>
                        </div>

                        <!-- Submit -->
                        <div class="flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="jrBtnText">${isEdit ? 'Update' : 'Create'} Template</span>
                                <div id="jrSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="jrResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate code datalist
        const dl = document.getElementById('jrCodeList');
        _allB2B.forEach(c => {
            if (c.CODE) {
                const opt = document.createElement('option');
                opt.value = c.CODE; opt.label = `${c.CODE} - ${c.B2B_NAME || ''}`;
                dl.appendChild(opt);
            }
        });

        // Populate branch datalist
        getAppData().then(data => {
            const dl = document.getElementById('rcrBranchList');
            if (data?.BRANCHES) Object.values(data.BRANCHES).forEach(b => {
                if (b.BRANCH_CODE) { const o = document.createElement('option'); o.value = b.BRANCH_CODE; dl.appendChild(o); }
            });
        });

        // Frequency toggle (day_of_month vs day_of_week)
        document.querySelector('[name="frequency"]')?.addEventListener('change', function() {
            const isWeekly = this.value === 'weekly';
            document.getElementById('rcrDayOfMonth')?.classList.toggle('hidden', isWeekly);
            document.getElementById('rcrDayOfWeek')?.classList.toggle('hidden', !isWeekly);
        });
        // Set initial state
        const initFreq = document.querySelector('[name="frequency"]')?.value;
        if (initFreq === 'weekly') {
            document.getElementById('rcrDayOfMonth')?.classList.add('hidden');
            document.getElementById('rcrDayOfWeek')?.classList.remove('hidden');
        }

        // Add line rows (from existing or defaults)
        const tbody = document.getElementById('jrLinesBody');
        if (existingLines.length >= 2) {
            existingLines.forEach(l => _addLineRow(tbody, l));
        } else {
            _addLineRow(tbody);
            _addLineRow(tbody);
        }
        _recalcLines();

        // Add line button
        document.getElementById('jrAddLine').addEventListener('click', () => {
            _addLineRow(tbody);
            _recalcLines();
        });

        // Submit
        document.getElementById('jrForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const lines = _collectLines();

            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('jrSpinner');
            const resp = document.getElementById('jrResponse');
            btn.disabled = true; sp.classList.remove('hidden');

            if (lines.length < 2 || lines.some(l => !l.coa_code)) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ At least 2 lines with COA accounts required.';
                resp.classList.remove('hidden');
                btn.disabled = false; sp.classList.add('hidden');
                return;
            }

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            const nextRunMs = toMs(data.next_run_date);
            const endMs = data.end_date ? toMs(data.end_date) : 0;

            try {
                if (isEdit) {
                    // TODO: migrate recurring entry update to Manager.io
                    alert('Coming soon — managing recurring entries through Manager.io');
                    return;
                    await callApi(`/api/ledger/journal/recurring/${editTxnId}`, {
                        schedule_name: data.schedule_name || '',
                        narration: '',
                        narration_template: data.narration_template || '',
                        lines: lines.map(l => ({ coa_code: l.coa_code, debit: l.debit, credit: l.credit })),
                        frequency: data.frequency || 'monthly',
                        interval: parseInt(data.interval) || 1,
                        day_of_month: parseInt(data.day_of_month) || 1,
                        day_of_week: parseInt(data.day_of_week) || 0,
                        next_run: nextRunMs,
                        end_date: endMs,
                        max_executions: parseInt(data.max_executions) || 0,
                        status: 'ACTIVE',
                    }, 'PUT');
                    resp.textContent = '✅ Template updated.';
                } else {
                    // TODO: migrate recurring entry creation to Manager.io
                    alert('Coming soon — creating recurring entries through Manager.io');
                    return;
                    await callApi('/api/ledger/journal/recurring', {
                        code: data.code,
                        branch: data.branch || '',
                        schedule_name: data.schedule_name || '',
                        narration: '',
                        narration_template: data.narration_template || '',
                        lines: lines.map(l => ({ coa_code: l.coa_code, debit: l.debit, credit: l.credit })),
                        frequency: data.frequency || 'monthly',
                        interval: parseInt(data.interval) || 1,
                        day_of_month: parseInt(data.day_of_month) || 1,
                        day_of_week: parseInt(data.day_of_week) || 0,
                        next_run: nextRunMs,
                        end_date: endMs,
                        max_executions: parseInt(data.max_executions) || 0,
                    }, 'POST');
                    resp.textContent = '✅ Template created.';
                }
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderList();
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });

        VaultPage.showDetailPane();
    }

    // ── Recurring ─────────────────────────────────────────────────────────
    async function _loadRecurring() {
        _activeJournalType = 'RECURRING';
        _injectListPane();
        await _loadCoaCache();
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            if (data.B2B) _allB2B = Object.values(data.B2B);
            _renderList();
        }
        document.getElementById('vaultSearch').placeholder = 'Search recurring entries…';
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();
    }

    // ── Load ──────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        await _loadCoaCache();
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            if (data.B2B) _allB2B = Object.values(data.B2B);
            _renderList();
        }
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();
    }

    function setType(type) { _activeJournalType = type; }

    return { load, search, openAddPane, setType, _handleDelete, _loadRecurring, _openRecurringForm, _renderDetailById: (txnId) => _renderDetail(txnId), _printEntry };
})();

window.VaultJournal = VaultJournal;
