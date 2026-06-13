// ============================================================================
// VAULT-JOURNAL.JS — Journal entries, credit/debit notes, opening balances, recurring
// Tiles: journal-entries, credit-notes, debit-notes, opening-balances, recurring
// API: POST /api/ledger/journal
// ============================================================================

const VaultJournal = (() => {

    let _allLedger = [];
    let _allB2B = [];
    let _activeJournalType = 'JOURNAL';

    // ── Local recurring templates (stored in localStorage) ────────────────────
    let _recurringTemplates = [];

    function _loadRecurringTemplates() {
        try {
            _recurringTemplates = JSON.parse(localStorage.getItem('vault_recurring') || '[]');
        } catch { _recurringTemplates = []; }
    }

    function _saveRecurringTemplates() {
        localStorage.setItem('vault_recurring', JSON.stringify(_recurringTemplates));
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

    function _renderDetail(entry) {
        if (!entry) return;
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Journal Detail</h3></div>
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
                    _renderRecurringList();
                }
            } catch (err) {
                alert('❌ ' + (err.message || 'Failed'));
            }
        });

        document.getElementById('recEditBtn').addEventListener('click', () => _openRecurringForm(index));
        document.getElementById('recDeleteBtn').addEventListener('click', () => {
            if (confirm('Delete this recurring template?')) {
                _recurringTemplates.splice(index, 1);
                _saveRecurringTemplates();
                _renderRecurringList();
            }
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

        document.getElementById('recFormCancel').onclick = () => _renderRecurringList();
        document.getElementById('recurringForm').addEventListener('submit', e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = Object.fromEntries(fd);
            _loadRecurringTemplates();

            if (editIndex !== undefined) {
                _recurringTemplates[editIndex] = { ..._recurringTemplates[editIndex], ...data };
            } else {
                _recurringTemplates.push({ ...data, created_at: new Date().toISOString() });
            }
            _saveRecurringTemplates();
            _renderRecurringList();
        });
    }

    // ── Recurring load ────────────────────────────────────────────────────────
    function _loadRecurring() {
        document.getElementById('vaultListPane').style.display = 'none';
        document.getElementById('vaultAddBtn').classList.add('hidden');
        document.getElementById('vaultDetailPane').style.display = 'block';
        VaultPage.showDetail(true);
        _renderRecurringList();
        VaultPage.showDetailPane();
    }

    function setType(type) { _activeJournalType = type; }

    return { load, search, openAddPane, setType, _showRecurringDetail, _loadRecurring };
})();

window.VaultJournal = VaultJournal;
