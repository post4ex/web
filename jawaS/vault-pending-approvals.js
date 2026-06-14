// ============================================================================
// VAULT-PENDING-APPROVALS.JS — Pending approvals with TXN-group handling
// Tiles: pending-approvals
// API: GET /api/ledger/pending, POST /api/ledger/approve, POST /api/ledger/batch-approve
// ============================================================================

const VaultPendingApprovals = (() => {

    let _pendingEntries = [];
    let _selectedForBulk = new Set();
    let _activeFilter = 'ALL';
    let _searchQuery = '';

    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code, type, user, or narration…';
    }

    function _getTypeIcon(type, journalType) {
        const icons = {
            'INVOICE':      '🧾',
            'PAYMENT':      '💰',
            'JOURNAL':      '✏️',
            'EXPENSE':      '💸',
            'CASH_MOVEMENT':'🪙',
        };
        const jtIcons = {
            'CREDIT_NOTE': '📝',
            'DEBIT_NOTE':  '📄',
            'ADJUSTMENT':  '⚖️',
        };
        if (journalType && jtIcons[journalType]) return jtIcons[journalType];
        return icons[type] || '📋';
    }

    function _getTypeLabel(entry) {
        const et = entry.ENTRY_TYPE || '';
        const jt = entry.JOURNAL_TYPE || '';
        if (jt) return `${et} (${jt})`;
        return et;
    }

    // ── Filter chips ──────────────────────────────────────────────────────────
    function _renderFilterChips() {
        const container = document.getElementById('filterChips');
        if (!container) return;

        const counts = {};
        _pendingEntries.forEach(e => {
            const et = e.ENTRY_TYPE || 'OTHER';
            counts[et] = (counts[et] || 0) + 1;
        });

        const chips = [
            { key: 'ALL', label: `All`, count: _pendingEntries.length },
            { key: 'INVOICE', label: `Invoices`, count: counts['INVOICE'] || 0 },
            { key: 'PAYMENT', label: `Payments`, count: counts['PAYMENT'] || 0 },
            { key: 'JOURNAL', label: `Journals`, count: counts['JOURNAL'] || 0 },
            { key: 'EXPENSE', label: `Expenses`, count: counts['EXPENSE'] || 0 },
        ];

        container.innerHTML = chips.map(c => `
            <button class="filter-chip px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
                ${_activeFilter === c.key
                    ? 'bg-red-100 text-red-700 border-red-300'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}"
                onclick="VaultPendingApprovals._setFilter('${c.key}')">
                ${c.label}
                <span class="ml-1 ${_activeFilter === c.key ? 'text-red-400' : 'text-gray-400'}">${c.count}</span>
            </button>
        `).join('');
    }

    function _setFilter(key) {
        _activeFilter = key;
        _renderFilterChips();
        _renderList();
    }

    function _getFilteredEntries() {
        let entries = _pendingEntries;
        if (_activeFilter !== 'ALL') {
            entries = entries.filter(e => e.ENTRY_TYPE === _activeFilter);
        }
        if (_searchQuery) {
            const q = _searchQuery.toLowerCase();
            entries = entries.filter(e =>
                (e.CODE || '').toLowerCase().includes(q) ||
                (e.ENTRY_TYPE || '').toLowerCase().includes(q) ||
                (e.JOURNAL_TYPE || '').toLowerCase().includes(q) ||
                (e.NARRATION || '').toLowerCase().includes(q) ||
                (e.ENTRY_ID || '').toLowerCase().includes(q) ||
                (e.USER_NAME || '').toLowerCase().includes(q) ||
                (e.STAFF_NAME || '').toLowerCase().includes(q)
            );
        }
        return entries;
    }

    // ── Group entries by TXN_ID ──────────────────────────────────────────────
    function _groupByTxn(entries) {
        const groups = {};
        entries.forEach(e => {
            const key = e.TXN_ID || e.ENTRY_ID;
            if (!groups[key]) groups[key] = { txn_id: e.TXN_ID || null, rows: [], primary: null };
            groups[key].rows.push(e);
            // First row (or lowest ENTRY_SQNSE) is the primary
            const sqnse = parseInt(e.ENTRY_SQNSE) || 1;
            if (!groups[key].primary || sqnse < (parseInt(groups[key].primary.ENTRY_SQNSE) || 99)) {
                groups[key].primary = e;
            }
        });
        return Object.values(groups).sort((a, b) =>
            (parseInt(b.primary?.TIME_STAMP) || 0) - (parseInt(a.primary?.TIME_STAMP) || 0)
        );
    }

    // ── List rendering ────────────────────────────────────────────────────────
    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        const filtered = _getFilteredEntries();
        if (!filtered.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">' +
                (_pendingEntries.length ? 'No matching entries. 🔍' : 'No pending entries. 🎉') +
                '</li>';
            return;
        }

        const groups = _groupByTxn(filtered);

        // Build bulk action bar
        if (!document.getElementById('bulkActionBar')) {
            const bulkBar = document.createElement('div');
            bulkBar.id = 'bulkActionBar';
            bulkBar.className = 'hidden flex items-center justify-between px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg mb-3';
            bulkBar.innerHTML = `
                <span class="text-sm text-yellow-800"><span class="bulk-count font-bold">0</span> selected</span>
                <span class="flex gap-2">
                    <button onclick="VaultPendingApprovals._bulkAction('APPROVE')" class="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">✅ Approve All</button>
                    <button onclick="VaultPendingApprovals._bulkAction('REJECT')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200">❌ Reject All</button>
                </span>`;
            ul.parentElement.insertBefore(bulkBar, ul);
        }

        const totalAmount = groups.reduce((s, g) => {
            const e = g.primary;
            return s + Math.max(parseFloat(e.DEBIT) || 0, parseFloat(e.CREDIT) || 0);
        }, 0);

        // Summary bar
        if (!document.getElementById('pendingSummaryBar')) {
            const summaryBar = document.createElement('div');
            summaryBar.id = 'pendingSummaryBar';
            summaryBar.className = 'flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg mb-3 text-xs text-gray-600';
            ul.parentElement.insertBefore(summaryBar, ul.parentElement.querySelector('#bulkActionBar') || ul);
        }
        document.getElementById('pendingSummaryBar').innerHTML = `
            <span>${groups.length} transaction${groups.length !== 1 ? 's' : ''} pending</span>
            <span class="font-semibold">₹${totalAmount.toFixed(2)} total</span>
        `;

        ul.innerHTML = groups.map(g => {
            const e = g.primary;
            const icon = _getTypeIcon(e.ENTRY_TYPE, e.JOURNAL_TYPE);
            const label = _getTypeLabel(e);
            const amount = Math.max(parseFloat(e.DEBIT) || 0, parseFloat(e.CREDIT) || 0);
            const rowCount = g.rows.length;
            const checked = _selectedForBulk.has(g.txn_id || e.ENTRY_ID) ? 'checked' : '';
            const typeEt = e.ENTRY_TYPE || '';

            // Color coding by type
            const borderColor = typeEt === 'INVOICE' ? 'border-l-green-400' :
                typeEt === 'PAYMENT' ? 'border-l-blue-400' :
                typeEt === 'JOURNAL' ? 'border-l-purple-400' :
                typeEt === 'EXPENSE' ? 'border-l-orange-400' :
                'border-l-gray-400';

            return `<li data-key="${g.txn_id || e.ENTRY_ID}" class="rounded-lg border border-gray-200 border-l-4 ${borderColor} mb-2 overflow-hidden hover:shadow-sm transition-shadow">
                <div class="flex items-start">
                    <label class="p-3 pr-0 flex-shrink-0 cursor-pointer" onclick="event.stopPropagation()">
                        <input type="checkbox" class="bulk-cb" ${checked} onchange="VaultPendingApprovals._toggleSelect('${g.txn_id || e.ENTRY_ID}')">
                    </label>
                    <div class="flex-1 p-3 cursor-pointer" onclick="VaultPendingApprovals._showDetail('${g.txn_id || e.ENTRY_ID}')">
                        <div class="flex items-center justify-between">
                            <strong class="text-sm text-gray-800">${icon} ${e.CODE || '-'}</strong>
                            <span class="text-sm font-semibold ${typeEt === 'PAYMENT' || typeEt === 'EXPENSE' ? 'text-green-600' : 'text-red-600'}">
                                ₹${amount.toFixed(2)}
                            </span>
                        </div>
                        <div class="flex items-center gap-2 mt-0.5">
                            <span class="text-xs text-gray-500">${label}</span>
                            <span class="text-xs text-gray-400">·</span>
                            <span class="text-xs text-gray-500">${_fmt(e.ENTRY_DATE, 'date')}</span>
                            <span class="text-xs text-gray-400">·</span>
                            <span class="text-xs text-gray-500">${e.USER_NAME || e.STAFF_NAME || '?'}</span>
                        </div>
                        ${rowCount > 1 ? `<div class="text-xs text-gray-400 mt-1">${rowCount} rows in transaction</div>` : ''}
                        ${e.NARRATION ? `<div class="text-xs text-gray-400 mt-0.5 truncate max-w-[400px]">${e.NARRATION}</div>` : ''}
                    </div>
                </div>
            </li>`;
        }).join('');
    }

    // ── Detail view ───────────────────────────────────────────────────────────
    function _showDetail(key) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        // Find the TXN group or single entry
        let rows = _pendingEntries.filter(e => (e.TXN_ID || e.ENTRY_ID) === key);
        if (!rows.length) {
            view.innerHTML = '<div class="text-center text-red-500 py-8">Entry not found.</div>';
            VaultPage.showDetailPane();
            return;
        }

        const primary = rows.sort((a, b) => (parseInt(a.ENTRY_SQNSE) || 1) - (parseInt(b.ENTRY_SQNSE) || 1))[0];
        const icon = _getTypeIcon(primary.ENTRY_TYPE, primary.JOURNAL_TYPE);
        const amount = Math.max(parseFloat(primary.DEBIT) || 0, parseFloat(primary.CREDIT) || 0);
        const isTxn = rows.length > 1;

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">${icon} ⏳ Pending — ${isTxn ? key.substring(0, 20) + '…' : primary.ENTRY_ID}</h3>
                    <span class="flex gap-2">
                        <button onclick="VaultPendingApprovals._approve('${key}','APPROVE')" class="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">✅ Approve</button>
                        <button onclick="VaultPendingApprovals._approve('${key}','REJECT')" class="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200">❌ Reject</button>
                    </span>
                </div>
                <div class="detail-card-body">
                    <!-- Primary entry fields -->
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-4">
                        <div><span class="text-gray-500">Code:</span> <span class="font-medium">${primary.CODE || 'N/A'}</span></div>
                        <div><span class="text-gray-500">Type:</span> ${icon} ${_getTypeLabel(primary)}</div>
                        <div><span class="text-gray-500">Status:</span> <span class="text-yellow-600 font-medium">PENDING</span></div>
                        <div><span class="text-gray-500">Amount:</span> <span class="font-semibold ${primary.ENTRY_TYPE === 'PAYMENT' || primary.ENTRY_TYPE === 'EXPENSE' ? 'text-green-600' : 'text-red-600'}">₹${amount.toFixed(2)}</span></div>
                        <div><span class="text-gray-500">Date:</span> ${_fmt(primary.ENTRY_DATE)}</div>
                        <div><span class="text-gray-500">Branch:</span> ${primary.BRANCH || 'N/A'}</div>
                        <div><span class="text-gray-500">Direction:</span> ${primary.DIRECTION || 'N/A'}</div>
                        <div><span class="text-gray-500">Created by:</span> ${primary.USER_NAME || primary.STAFF_NAME || 'N/A'}</div>
                        ${primary.PAYMENT_MODE ? `<div><span class="text-gray-500">Mode:</span> ${primary.PAYMENT_MODE}</div>` : ''}
                        ${primary.INV_NUMBER ? `<div><span class="text-gray-500">Invoice #:</span> ${primary.INV_NUMBER}</div>` : ''}
                        ${primary.EXPENSE_TYPE ? `<div><span class="text-gray-500">Expense Type:</span> ${primary.EXPENSE_TYPE}</div>` : ''}
                        ${primary.SERVICE_CODE ? `<div><span class="text-gray-500">Service:</span> ${primary.SERVICE_CODE}</div>` : ''}
                        ${primary.CASH_ACCOUNT ? `<div><span class="text-gray-500">Cash Account:</span> ${primary.CASH_ACCOUNT}</div>` : ''}
                    </div>
                    ${primary.NARRATION ? `<div class="text-sm mb-4 p-3 bg-gray-50 rounded-lg"><span class="text-gray-500">Narration:</span> <span class="text-gray-700">${primary.NARRATION}</span></div>` : ''}

                    ${isTxn ? `
                        <div class="border-t border-gray-200 pt-4">
                            <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Transaction Rows (${rows.length})</h4>
                            <div class="overflow-x-auto">
                                <table class="min-w-full text-xs">
                                    <thead class="bg-gray-50">
                                        <tr>
                                            <th class="px-2 py-1.5 text-left">#</th>
                                            <th class="px-2 py-1.5 text-left">COA</th>
                                            <th class="px-2 py-1.5 text-right">Debit</th>
                                            <th class="px-2 py-1.5 text-right">Credit</th>
                                            <th class="px-2 py-1.5 text-left">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${rows.map((r, i) => {
                                            const dr = parseFloat(r.DEBIT) || 0;
                                            const cr = parseFloat(r.CREDIT) || 0;
                                            const coa = r.COA_DR && dr > 0 ? r.COA_DR : (r.COA_CR && cr > 0 ? r.COA_CR : '-');
                                            return `<tr class="border-b hover:bg-gray-50">
                                                <td class="px-2 py-1.5">${r.ENTRY_SQNSE || i + 1}</td>
                                                <td class="px-2 py-1.5 font-mono">${coa}</td>
                                                <td class="px-2 py-1.5 text-right text-red-600">${dr > 0 ? '₹' + dr.toFixed(2) : '-'}</td>
                                                <td class="px-2 py-1.5 text-right text-green-600">${cr > 0 ? '₹' + cr.toFixed(2) : '-'}</td>
                                                <td class="px-2 py-1.5"><span class="text-yellow-600">⏳</span></td>
                                            </tr>`;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}

                    <div class="border-t border-gray-200 pt-4 mt-4 text-xs text-gray-400">
                        <span>Entry ID: </span><span class="font-mono">${primary.ENTRY_ID}</span>
                        ${primary.TXN_ID ? `<span class="ml-3">TXN: </span><span class="font-mono">${primary.TXN_ID}</span>` : ''}
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Approve/Reject single ────────────────────────────────────────────────
    async function _approve(key, action) {
        const reason = action === 'REJECT' ? prompt('Rejection reason (optional):') || '' : '';

        // Find the primary entry for this TXN group
        const rows = _pendingEntries.filter(e => (e.TXN_ID || e.ENTRY_ID) === key);
        if (!rows.length) return;
        const primary = rows.sort((a, b) => (parseInt(a.ENTRY_SQNSE) || 1) - (parseInt(b.ENTRY_SQNSE) || 1))[0];

        try {
            const res = await callApi('/api/ledger/approve', {
                entry_id: primary.ENTRY_ID,
                action,
                reason,
            }, 'POST');
            if (res.status === 'success') {
                await load();
            }
        } catch (err) {
            alert('Failed: ' + (err.message || err));
        }
    }

    // ── Bulk select ──────────────────────────────────────────────────────────
    function _toggleSelect(key) {
        if (_selectedForBulk.has(key)) _selectedForBulk.delete(key);
        else _selectedForBulk.add(key);

        // Update checkbox visuals
        document.querySelectorAll('#vaultList li[data-key]').forEach(li => {
            const cb = li.querySelector('.bulk-cb');
            if (cb) cb.checked = _selectedForBulk.has(li.dataset.key);
        });

        const count = _selectedForBulk.size;
        const bulkBar = document.getElementById('bulkActionBar');
        if (bulkBar) {
            bulkBar.classList.toggle('hidden', count === 0);
            bulkBar.querySelector('.bulk-count').textContent = count;
        }
    }

    async function _bulkAction(action) {
        if (!_selectedForBulk.size) return;
        const reason = action === 'REJECT' ? prompt('Rejection reason (optional):') || '' : '';
        if (!confirm(`${action === 'APPROVE' ? 'Approve' : 'Reject'} ${_selectedForBulk.size} transaction(s)?`)) return;

        // Collect primary entry IDs for each selected TXN group
        const entryIds = [];
        for (const key of _selectedForBulk) {
            const rows = _pendingEntries.filter(e => (e.TXN_ID || e.ENTRY_ID) === key);
            const primary = rows.sort((a, b) => (parseInt(a.ENTRY_SQNSE) || 1) - (parseInt(b.ENTRY_SQNSE) || 1))[0];
            if (primary) entryIds.push(primary.ENTRY_ID);
        }

        try {
            const res = await callApi('/api/ledger/batch-approve', {
                entry_ids: entryIds,
                action,
                reason,
            }, 'POST');
            const msg = `${action === 'APPROVE' ? 'Approved' : 'Rejected'} ${res.approved} transaction(s)`;
            if (res.failed > 0) alert(msg + `, ${res.failed} failed. Check console for details.`);
            else alert(msg);
            _selectedForBulk.clear();
            await load();
        } catch (err) {
            alert('Failed: ' + (err.message || err));
        }
    }

    // ── Search ────────────────────────────────────────────────────────────────
    function _onSearch() {
        _searchQuery = (document.getElementById('vaultSearch')?.value || '').trim();
        _renderList();
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        document.getElementById('vaultSearch').oninput = _onSearch;

        // Inject filter chips bar
        const listContainer = document.getElementById('vaultListContainer');
        const existingChips = document.getElementById('filterChips');
        if (existingChips) existingChips.remove();
        const chipsBar = document.createElement('div');
        chipsBar.id = 'filterChips';
        chipsBar.className = 'flex flex-wrap gap-1.5 mb-3';
        listContainer.insertBefore(chipsBar, listContainer.querySelector('#vaultListMsg'));

        // Remove old summary/bulk bars
        document.getElementById('pendingSummaryBar')?.remove();
        document.getElementById('bulkActionBar')?.remove();

        _selectedForBulk.clear();

        try {
            const res = await callApi('/api/ledger/pending', {}, 'GET');
            _pendingEntries = res.data || [];
            _renderFilterChips();
            _renderList();
            // Auto-select first entry's detail
            const filtered = _getFilteredEntries();
            if (filtered.length) {
                const groups = _groupByTxn(filtered);
                if (groups.length) {
                    _showDetail(groups[0].txn_id || groups[0].primary.ENTRY_ID);
                }
            }
        } catch (err) {
            document.getElementById('vaultList').innerHTML = `<li class="text-center text-red-500 py-6">❌ ${err.message}</li>`;
        }
    }

    return { load, _setFilter, _showDetail, _approve, _toggleSelect, _bulkAction };
})();

window.VaultPendingApprovals = VaultPendingApprovals;
