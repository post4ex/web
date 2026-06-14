// ============================================================================
// VAULT-JOURNAL.JS — Journal entries, credit/debit notes, opening balances, recurring
// Tiles: journal-entries, credit-notes, debit-notes, opening-balances, recurring
// API: POST /api/ledger/journal
// ============================================================================

const VaultJournal = (() => {

    let _allLedger = [];
    let _allB2B = [];
    let _activeJournalType = 'JOURNAL';

    // ── Recurring templates (stored in LEDGER collection with ENTRY_TYPE='RECURRING') ─
    let _recurringTemplates = [];

    function _loadRecurringTemplates() {
        // Load from LEDGER entries where ENTRY_TYPE='JOURNAL' and JOURNAL_TYPE='RECURRING'
        // (Backend ledger_journal hardcodes ENTRY_TYPE as 'JOURNAL')
        const templates = _allLedger.filter(e => e.ENTRY_TYPE === 'JOURNAL' && e.JOURNAL_TYPE === 'RECURRING' && e.STATUS === 'ACTIVE');
        _recurringTemplates = templates.map(t => {
            try { return { ...JSON.parse(t.NARRATION || '{}'), entry_id: t.ENTRY_ID, code: t.CODE }; }
            catch { return null; }
        }).filter(Boolean);
    }

    async function _saveRecurringTemplates() {
        // Templates are already saved to LEDGER via API calls
        // Reload from LEDGER
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            _loadRecurringTemplates();
        }
    }

    function _can(role) { return window.VaultPage?.can(role); }

    function _label() {
        const map = { 'JOURNAL': 'Journal Entries', 'CREDIT_NOTE': 'Credit Notes', 'DEBIT_NOTE': 'Debit Notes', 'OPENING_BALANCE': 'Opening Balances', 'RECURRING': 'Recurring Entries' };
        return map[_activeJournalType] || 'Journal';
    }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, narration…';
    }

    function _renderList(entries) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const jtMap = { 'CREDIT_NOTE': 'credit-notes', 'DEBIT_NOTE': 'debit-notes', 'OPENING_BALANCE': 'opening-balances' };
        const target = jtMap[_activeJournalType] || 'journal-entries';
        const filtered = entries.filter(e => {
            if (_activeJournalType === 'JOURNAL') return e.ENTRY_TYPE === 'JOURNAL';
            return e.ENTRY_TYPE === 'JOURNAL' && e.JOURNAL_TYPE === _activeJournalType;
        });
        filtered.sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));
        if (!filtered.length) {
            ul.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">No ${_label()} found.</li>`;
            return;
        }
        const typeIcons = { 'CREDIT_NOTE': '📝', 'DEBIT_NOTE': '📄', 'OPENING_BALANCE': '🗂️', 'ADJUSTMENT': '✏️' };
        ul.innerHTML = filtered.slice(0, 50).map(e => {
            const icon = typeIcons[e.JOURNAL_TYPE] || '✏️';
            const amt = (+e.DEBIT||0) > 0 ? `Dr ₹${(+e.DEBIT).toFixed(2)}` : `Cr ₹${(+e.CREDIT).toFixed(2)}`;
            return `<li data-entry="${e.ENTRY_ID}" class="p-3 rounded-lg cursor-pointer hover:bg-purple-50 border border-gray-200 transition-colors">
                <strong class="text-purple-700 block text-sm">${icon} ${e.CODE || ''} — ${amt}</strong>
                <span class="text-xs text-gray-500">${e.JOURNAL_TYPE || e.ENTRY_TYPE} · ${e.NARRATION || ''}</span>
                <div class="text-xs text-gray-400 mt-1">${e.ENTRY_DATE ? fmtDate(e.ENTRY_DATE, 'date') : ''} · Status: ${e.STATUS || ''}</div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(_allLedger.find(e => e.ENTRY_ID === li.dataset.entry));
            })
        );
    }

    function search(q) {
        const lq = q.toLowerCase();
        _renderList(_allLedger.filter(e =>
            (e.CODE || '').toLowerCase().includes(lq) ||
            (e.NARRATION || '').toLowerCase().includes(lq) ||
            (e.JOURNAL_TYPE || '').toLowerCase().includes(lq)
        ));
    }

    async function _handleDelete(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry || entry.STATUS === 'VOID') return;
        if (!confirm(`Delete this ${entry.JOURNAL_TYPE || 'journal'} entry? This will void and recalculate balances.`)) return;
        const reason = prompt('Reason (optional):', '') || '';
        try {
            await callApi('/api/ledger/void', { entry_id: entryId, void_reason: reason }, 'POST');
            const appData = await getAppData();
            if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _renderList(_allLedger); }
            document.getElementById('vaultDetailView').innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-8"><div class="text-4xl mb-3">🗑️</div><p class="text-gray-500 text-sm">Entry deleted (voided).</p></div></div>`;
        } catch (err) { alert('Failed: ' + (err.message || err)); }
    }

    function _openEditForm(entryId) {
        const entry = _allLedger.find(e => e.ENTRY_ID === entryId);
        if (!entry) return;
        const isDN = entry.JOURNAL_TYPE === 'DEBIT_NOTE';
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const entryDate = entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE, 'input') : new Date().toISOString().split('T')[0];
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">✏️ Edit ${entry.JOURNAL_TYPE || 'Journal'} Entry</h3></div>
                <div class="detail-card-body">
                    <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
                        ⚠️ Editing will void the current entry and create a replacement.
                    </p>
                    <form id="jrEditForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                            <input name="code" required class="form-input text-sm uppercase" value="${entry.CODE || ''}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                            <input name="entry_date" type="date" required class="form-input text-sm" value="${entryDate}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" value="${(+entry.DEBIT||+entry.CREDIT||0).toFixed(2)}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Side</label>
                            <select name="side" class="form-input text-sm">
                                <option value="debit" ${+entry.DEBIT > 0 ? 'selected' : ''}>Debit (client owes)</option>
                                <option value="credit" ${+entry.CREDIT > 0 ? 'selected' : ''}>Credit (client credited)</option>
                            </select>
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration *</label>
                            <input name="narration" required class="form-input text-sm" value="${entry.NARRATION || ''}">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t gap-2">
                            <button type="button" onclick="VaultJournal._renderDetailById('${entry.ENTRY_ID}')" class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm">Save Changes</button>
                        </div>
                    </form>
                    <div id="jrEditResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;
        document.getElementById('jrEditForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const resp = document.getElementById('jrEditResponse');
            btn.disabled = true;
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            const amount = parseFloat(data.amount);
            try {
                await callApi('/api/ledger/void', { entry_id: entry.ENTRY_ID, void_reason: 'Replaced by edit' }, 'POST');
                const res = await callApi('/api/ledger/journal', {
                    code: data.code,
                    entry_date: toMs(data.entry_date),
                    journal_type: entry.JOURNAL_TYPE || 'ADJUSTMENT',
                    narration: data.narration,
                    branch: entry.BRANCH || '',
                    ...(data.side === 'debit' ? { debit: amount, credit: 0 } : { debit: 0, credit: amount }),
                }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = '✅ Updated successfully.';
                resp.classList.remove('hidden');
                const appData = await getAppData();
                if (appData?.LEDGER) { _allLedger = Object.values(appData.LEDGER); _renderList(_allLedger); }
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally { btn.disabled = false; }
        });
        VaultPage.showDetailPane();
    }

    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        const isActive = entry.STATUS === 'ACTIVE' || entry.STATUS === 'PENDING';
        const isVoid = entry.STATUS === 'VOID';
        const isDN = entry.JOURNAL_TYPE === 'DEBIT_NOTE';
        const editBtn = isActive && isDN ? `<button onclick="VaultJournal._openEditForm('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Edit</button>` : '';
        const delBtn = isActive ? `<button onclick="VaultJournal._handleDelete('${entry.ENTRY_ID}')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Delete</button>` : '';
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">Journal Detail</h3>
                    <div class="flex gap-2">${isVoid ? '<span class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">VOID</span>' : editBtn + delBtn}</div>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-500">Entry ID:</span> ${entry.ENTRY_ID}</div>
                        <div><span class="text-gray-500">Date:</span> ${entry.ENTRY_DATE ? fmtDate(entry.ENTRY_DATE) : 'N/A'}</div>
                        <div><span class="text-gray-500">Code:</span> ${entry.CODE || 'N/A'}</div>
                        <div><span class="text-gray-500">Type:</span> ${entry.JOURNAL_TYPE || entry.ENTRY_TYPE}</div>
                        <div><span class="text-gray-500">Debit:</span> ₹${(+entry.DEBIT||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">Credit:</span> ₹${(+entry.CREDIT||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">Status:</span> ${entry.STATUS || 'N/A'}</div>
                        ${entry.NARRATION ? `<div class="col-span-2"><span class="text-gray-500">Narration:</span> ${entry.NARRATION}</div>` : ''}
                        ${entry.APPROVED_BY ? `<div><span class="text-gray-500">Approved By:</span> ${entry.APPROVED_BY}</div>` : ''}
                        ${entry.APPROVED_AT ? `<div><span class="text-gray-500">Approved At:</span> ${fmtDate(entry.APPROVED_AT)}</div>` : ''}
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function openAddPane() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const isOpening = _activeJournalType === 'OPENING_BALANCE';
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">New ${_label()}</h3></div>
                <div class="detail-card-body">
                    <form id="journalForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                            <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. AGWL">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                            <input name="entry_date" type="date" required class="form-input text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Type</label>
                            <input name="journal_type" class="form-input text-sm bg-gray-100" value="${_activeJournalType}" readonly>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Side</label>
                            <select name="side" class="form-input text-sm">
                                <option value="debit" ${isOpening ? 'selected' : ''}>Debit (client owes)</option>
                                <option value="credit" ${!isOpening ? 'selected' : ''}>Credit (client credited)</option>
                            </select>
                        </div>
                        <div></div>
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration *</label>
                            <input name="narration" required class="form-input text-sm" placeholder="Required description">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t">
                            <button type="submit" class="btn btn-sm flex items-center gap-2">
                                <span id="jrBtnText">Save Journal</span>
                                <div id="jrSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                    </form>
                    <div id="jrResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        document.getElementById('journalForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            const sp = document.getElementById('jrSpinner');
            const resp = document.getElementById('jrResponse');
            btn.disabled = true; sp.classList.remove('hidden');

            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : 0;
            const amount = parseFloat(data.amount);
            try {
                const body = {
                    code: data.code,
                    entry_date: toMs(data.entry_date),
                    journal_type: _activeJournalType,
                    narration: data.narration,
                    branch: '',
                    ...(data.side === 'debit' ? { debit: amount, credit: 0 } : { debit: 0, credit: amount }),
                };
                const res = await callApi('/api/ledger/journal', body, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ ${_label()} saved. Balance: ₹${(+res.balance).toFixed(2)}`;
                resp.classList.remove('hidden');
                e.target.reset();
                const appData = await getAppData();
                if (appData?.LEDGER) _allLedger = Object.values(appData.LEDGER);
                _renderList(_allLedger);
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally {
                btn.disabled = false; sp.classList.add('hidden');
            }
        });
        const d = document.querySelector('[name="entry_date"]');
        if (d) d.value = new Date().toISOString().split('T')[0];
        VaultPage.showDetailPane();
    }

    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
            _renderList(_allLedger);
        }
    }

    // ========================================================================
    // RECURRING TILE
    // ========================================================================

    function _renderRecurringList() {
        _loadRecurringTemplates();
        const view = document.getElementById('vaultDetailView');
        const now = Date.now();

        function _nextDate(template) {
            if (!template.start_date) return 'N/A';
            const start = new Date(template.start_date);
            const freq = template.frequency || 'MONTHLY';
            const interval = parseInt(template.interval) || 1;
            // Simple: if start + interval < now, it's overdue
            let next = new Date(start);
            if (freq === 'MONTHLY') {
                while (next.getTime() < now) next.setMonth(next.getMonth() + interval);
            } else if (freq === 'WEEKLY') {
                while (next.getTime() < now) next.setDate(next.getDate() + 7 * interval);
            } else if (freq === 'DAILY') {
                while (next.getTime() < now) next.setDate(next.getDate() + interval);
            } else if (freq === 'QUARTERLY') {
                while (next.getTime() < now) next.setMonth(next.getMonth() + 3 * interval);
            } else if (freq === 'YEARLY') {
                while (next.getTime() < now) next.setFullYear(next.getFullYear() + interval);
            }
            return next;
        }

        view.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">🔄 Recurring Entries</h3>
                    <p class="text-xs text-gray-500">${_recurringTemplates.length} templates</p>
                </div>
                <button id="recurringAddBtn" class="btn btn-sm">+ New Template</button>
            </div>

            ${_recurringTemplates.length ? `
            <div class="space-y-3">
                ${_recurringTemplates.map((t, i) => {
                    const next = _nextDate(t);
                    const overdue = next !== 'N/A' && next.getTime() < now;
                    const dueStr = overdue ? `<span class="text-red-600 font-medium">OVERDUE</span>` :
                        (next !== 'N/A' ? fmtDate(next.getTime()) : 'N/A');
                    const sideLabel = t.side === 'debit' ? 'Dr' : 'Cr';
                    return `<div class="detail-card hover:shadow-md transition-shadow cursor-pointer" onclick="VaultJournal._showRecurringDetail(${i})">
                        <div class="detail-card-body flex items-center justify-between">
                            <div>
                                <strong class="text-gray-800 block text-sm">${t.narration || 'Untitled'}</strong>
                                <span class="text-xs text-gray-500">${t.code || ''} · ${t.frequency || 'MONTHLY'} · ${sideLabel} ₹${(+t.amount||0).toFixed(2)}</span>
                            </div>
                            <div class="text-right">
                                <div class="text-xs text-gray-400">Next Due</div>
                                <div class="text-sm font-semibold ${overdue ? 'text-red-600' : 'text-gray-700'}">${dueStr}</div>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>` : `
            <div class="detail-card">
                <div class="detail-card-body text-center py-12">
                    <div class="text-4xl mb-3">🔄</div>
                    <p class="text-gray-500 text-sm mb-4">No recurring entry templates yet.</p>
                    <p class="text-xs text-gray-400">Create a template for entries that repeat — rent, subscriptions, etc.</p>
                </div>
            </div>`}

            <div class="detail-card mt-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">ℹ️ About Recurring Entries</h3></div>
                <div class="detail-card-body text-xs text-gray-500 space-y-2">
                    <p>Recurring entry templates are stored locally in your browser. When a recurring entry is due, you can create a journal entry from the template with one click.</p>
                    <p><strong>Supported frequencies:</strong> Daily, Weekly, Monthly, Quarterly, Yearly</p>
                </div>
            </div>`;

        document.getElementById('recurringAddBtn').addEventListener('click', _openRecurringForm);
    }

    function _showRecurringDetail(index) {
        _loadRecurringTemplates();
        const t = _recurringTemplates[index];
        if (!t) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const sideLabel = t.side === 'debit' ? 'Debit (client owes)' : 'Credit (client credited)';
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">🔄 Recurring Template</h3>
                    <div class="flex gap-2">
                        <button id="recPostNow" class="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700">📤 Post Now</button>
                        <button id="recEditBtn" class="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200">✏️ Edit</button>
                        <button id="recDeleteBtn" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200">🗑️ Delete</button>
                    </div>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div><span class="text-gray-500">Narration:</span> <span class="font-medium">${t.narration || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Client Code:</span> ${t.code || 'N/A'}</div>
                        <div><span class="text-gray-500">Amount:</span> ₹${(+t.amount||0).toFixed(2)}</div>
                        <div><span class="text-gray-500">Side:</span> ${sideLabel}</div>
                        <div><span class="text-gray-500">Frequency:</span> ${t.frequency || 'MONTHLY'}</div>
                        <div><span class="text-gray-500">Interval:</span> Every ${t.interval || 1}</div>
                        <div><span class="text-gray-500">Start Date:</span> ${t.start_date || 'N/A'}</div>
                        <div><span class="text-gray-500">Journal Type:</span> ${t.journal_type || 'ADJUSTMENT'}</div>
                    </div>
                </div>
            </div>`;

        document.getElementById('recPostNow').addEventListener('click', async () => {
            const toMs = (d) => d ? new Date(d + 'T00:00:00Z').getTime() : Date.now();
            try {
                const body = {
                    code: t.code,
                    entry_date: Date.now(),
                    journal_type: t.journal_type || 'ADJUSTMENT',
                    narration: t.narration + ' (Recurring)',
                    branch: '',
                    ...(t.side === 'debit' ? { debit: +t.amount, credit: 0 } : { debit: 0, credit: +t.amount }),
                };
                const res = await callApi('/api/ledger/journal', body, 'POST');
                if (res.status === 'success') {
                    alert('✅ Entry posted successfully! Balance: ₹' + (+res.balance).toFixed(2));
                    _loadRecurring();
                }
            } catch (err) {
                alert('❌ ' + (err.message || 'Failed'));
            }
        });

        document.getElementById('recEditBtn').addEventListener('click', () => _openRecurringForm(index));
        document.getElementById('recDeleteBtn').addEventListener('click', async () => {
            if (!confirm('Delete this recurring template?')) return;
            try {
                const oldEntry = _allLedger.find(x => x.ENTRY_TYPE === 'JOURNAL' && x.JOURNAL_TYPE === 'RECURRING' && x.CODE === t.code && x.STATUS === 'ACTIVE');
                if (oldEntry) {
                    await callApi('/api/ledger/void', { entry_id: oldEntry.ENTRY_ID, void_reason: 'Recurring template deleted' }, 'POST');
                }
                await _saveRecurringTemplates();
                _loadRecurring();
            } catch (err) { alert('Failed: ' + (err.message || err)); }
        });
    }

    function _openRecurringForm(editIndex) {
        _loadRecurringTemplates();
        const edit = editIndex !== undefined ? _recurringTemplates[editIndex] : null;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">${edit ? '✏️ Edit' : '➕ New'} Recurring Template</h3></div>
                <div class="detail-card-body">
                    <form id="recurringForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">Narration *</label>
                            <input name="narration" required class="form-input text-sm" placeholder="e.g. Monthly Rent" value="${edit ? (edit.narration || '') : ''}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Client Code *</label>
                            <input name="code" required class="form-input text-sm uppercase" placeholder="e.g. AGWL" value="${edit ? (edit.code || '') : ''}" list="recCodeList">
                            <datalist id="recCodeList"></datalist>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                            <input name="amount" type="number" step="0.01" min="0.01" required class="form-input text-sm" value="${edit ? edit.amount : ''}" placeholder="0.00">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Side</label>
                            <select name="side" class="form-input text-sm">
                                <option value="debit" ${edit && edit.side === 'debit' ? 'selected' : ''}>Debit (client owes)</option>
                                <option value="credit" ${edit && edit.side === 'credit' ? 'selected' : ''}>Credit (client credited)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                            <select name="frequency" class="form-input text-sm">
                                <option value="DAILY" ${edit && edit.frequency === 'DAILY' ? 'selected' : ''}>Daily</option>
                                <option value="WEEKLY" ${edit && edit.frequency === 'WEEKLY' ? 'selected' : ''}>Weekly</option>
                                <option value="MONTHLY" ${!edit || edit.frequency === 'MONTHLY' ? 'selected' : ''}>Monthly</option>
                                <option value="QUARTERLY" ${edit && edit.frequency === 'QUARTERLY' ? 'selected' : ''}>Quarterly</option>
                                <option value="YEARLY" ${edit && edit.frequency === 'YEARLY' ? 'selected' : ''}>Yearly</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Journal Type</label>
                            <select name="journal_type" class="form-input text-sm">
                                <option value="ADJUSTMENT" ${!edit || edit.journal_type === 'ADJUSTMENT' ? 'selected' : ''}>Adjustment</option>
                                <option value="CREDIT_NOTE" ${edit && edit.journal_type === 'CREDIT_NOTE' ? 'selected' : ''}>Credit Note</option>
                                <option value="DEBIT_NOTE" ${edit && edit.journal_type === 'DEBIT_NOTE' ? 'selected' : ''}>Debit Note</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Interval</label>
                            <select name="interval" class="form-input text-sm">
                                ${[1,2,3,6].map(i => `<option value="${i}" ${edit && edit.interval == i ? 'selected' : ''}>Every ${i}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
                            <input name="start_date" type="date" required class="form-input text-sm" value="${edit ? (edit.start_date || '') : new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="sm:col-span-2 flex justify-end pt-2 border-t gap-2">
                            <button type="button" id="recFormCancel" class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm">${edit ? 'Update' : 'Create'} Template</button>
                        </div>
                    </form>
                    <div id="recFormResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;

        // Populate code datalist
        const dl = document.getElementById('recCodeList');
        _allB2B.forEach(c => {
            if (c.CODE) {
                const opt = document.createElement('option');
                opt.value = c.CODE; opt.label = `${c.CODE} - ${c.B2B_NAME || ''}`;
                dl.appendChild(opt);
            }
        });

        document.getElementById('recFormCancel').onclick = () => _loadRecurring();
        document.getElementById('recurringForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true;
            try {
                if (editIndex !== undefined) {
                    // Void the old LEDGER entry and create a new one
                    const oldEntry = _allLedger.find(x => x.ENTRY_TYPE === 'JOURNAL' && x.JOURNAL_TYPE === 'RECURRING' && x.CODE === edit.code && x.STATUS === 'ACTIVE');
                    if (oldEntry) {
                        await callApi('/api/ledger/void', { entry_id: oldEntry.ENTRY_ID, void_reason: 'Replaced by edit' }, 'POST');
                    }
                }
                // Create/update the template in LEDGER as a RECURRING entry
                const templateData = JSON.stringify({ frequency: data.frequency, interval: data.interval, side: data.side, amount: data.amount, journal_type: data.journal_type, start_date: data.start_date, narration: data.narration });
                await callApi('/api/ledger/journal', {
                    code: data.code,
                    entry_date: Date.now(),
                    journal_type: 'RECURRING',
                    narration: templateData,
                    branch: '',
                    debit: 0.01,
                    credit: 0,
                }, 'POST');
                await _saveRecurringTemplates();
                _loadRecurring();
            } catch (err) {
                alert('Failed: ' + (err.message || err));
            } finally { btn.disabled = false; }
        });
    }

    // ── Recurring load (list pane + detail) ───────────────────────────────────
    async function _loadRecurring() {
        document.getElementById('vaultAddBtn').classList.add('hidden');
        document.getElementById('vaultListMsg').textContent = '';

        // Populate _allLedger from appData
        const data = await getAppData();
        if (data?.LEDGER) {
            _allLedger = Object.values(data.LEDGER);
        }
        _loadRecurringTemplates();

        // Render list pane
        const ul = document.getElementById('vaultList');
        ul.innerHTML = '';
        if (!_recurringTemplates.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No recurring templates. Create one!</li>';
            document.getElementById('vaultDetailView').innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-body text-center py-12">
                        <div class="text-4xl mb-3">🔄</div>
                        <p class="text-gray-500 text-sm mb-4">No recurring entry templates yet.</p>
                        <p class="text-xs text-gray-400">Create a template for entries that repeat.</p>
                    </div>
                </div>`;
            VaultPage.showDetail(true);
            VaultPage.showDetailPane();
            return;
        }
        const now = Date.now();
        function _nextDate(template) {
            if (!template.start_date) return 'N/A';
            const start = new Date(template.start_date);
            const freq = template.frequency || 'MONTHLY';
            const interval = parseInt(template.interval) || 1;
            let next = new Date(start);
            if (freq === 'MONTHLY') { while (next.getTime() < now) next.setMonth(next.getMonth() + interval); }
            else if (freq === 'WEEKLY') { while (next.getTime() < now) next.setDate(next.getDate() + 7 * interval); }
            else if (freq === 'DAILY') { while (next.getTime() < now) next.setDate(next.getDate() + interval); }
            else if (freq === 'QUARTERLY') { while (next.getTime() < now) next.setMonth(next.getMonth() + 3 * interval); }
            else if (freq === 'YEARLY') { while (next.getTime() < now) next.setFullYear(next.getFullYear() + interval); }
            return next;
        }
        ul.innerHTML = _recurringTemplates.map((t, i) => {
            const next = _nextDate(t);
            const overdue = next !== 'N/A' && next.getTime() < now;
            const sideLabel = t.side === 'debit' ? 'Dr' : 'Cr';
            return `<li data-index="${i}" class="p-3 rounded-lg cursor-pointer hover:bg-purple-50 border border-gray-200 transition-colors">
                <strong class="text-purple-800 block text-sm">🔄 ${t.narration || 'Untitled'}</strong>
                <span class="text-xs text-gray-500">${t.code || ''} · ${t.frequency || 'MONTHLY'} · ${sideLabel} ₹${(+t.amount||0).toFixed(2)}</span>
                <div class="text-xs mt-1 ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}">${overdue ? '⚠️ OVERDUE' : (next !== 'N/A' ? 'Next: ' + fmtDate(next.getTime(), 'date') : '')}</div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _showRecurringDetail(parseInt(li.dataset.index));
            })
        );

        // Auto-select first
        if (_recurringTemplates.length) {
            ul.querySelector('li')?.classList.add('selected');
            _showRecurringDetail(0);
        }
    }

    function setType(type) { _activeJournalType = type; }

    return { load, search, openAddPane, setType, _showRecurringDetail, _loadRecurring, _handleDelete };
})();

window.VaultJournal = VaultJournal;
