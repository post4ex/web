// ============================================================================
// VAULT-CLOSE-FY.JS — Close a Financial Year
// Shows closing balances per client code, allows sealing FY and carrying
// forward opening balances to the next FY.
// API: GET /api/ledger/fy-summary, POST /api/ledger/close-fy
// ============================================================================

const VaultCloseFY = (() => {

    let _fyData = [];
    let _currentFY = '';
    let _allBranches = [];
    let _selectedBranch = '';

    function _can(role) { return window.VaultPage?.can(role); }

    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    // ── Determine current FY from today's date ──────────────────────────────
    function _getCurrentFY() {
        const now = new Date();
        const m = now.getMonth() + 1; // 1-12
        const y = now.getFullYear();
        if (m >= 4) return `${y}-${String(y + 1).slice(2)}`;
        return `${y - 1}-${String(y).slice(2)}`;
    }

    function _nextFY(fy) {
        const parts = fy.split('-');
        const start = parseInt(parts[0]);
        return `${start + 1}-${String(start + 2).slice(2)}`;
    }

    // ── List pane ────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = 'Search by code or name…';
    }

    function _renderFYSelector() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const currentFY = _getCurrentFY();

        // Generate previous 5 FYs + current
        const fys = [];
        for (let i = 4; i >= 0; i--) {
            const start = parseInt(currentFY.split('-')[0]) - i;
            fys.push(`${start}-${String(start + 1).slice(2)}`);
        }
        fys.push(currentFY);

        ul.innerHTML = `
            <li class="p-3 mb-3">
                <label class="block text-xs font-medium text-gray-600 mb-1">Financial Year</label>
                <select id="fySelect" class="form-input text-sm">
                    ${fys.map(fy => `<option value="${fy}" ${fy === currentFY ? 'selected' : ''}>${fy}</option>`).join('')}
                </select>
                <div class="mt-2">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Branch <span class="text-gray-400">(optional)</span></label>
                    <select id="fyBranchSelect" class="form-input text-sm">
                        <option value="">All Branches</option>
                        ${_allBranches.map(b => `<option value="${b.BRANCH_CODE}">${b.BRANCH_NAME || b.BRANCH_CODE}</option>`).join('')}
                    </select>
                </div>
                <button id="fyLoadBtn" class="mt-3 w-full px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
                    Load Summary
                </button>
            </li>
            <li class="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b">Closing Balances</li>
        `;

        document.getElementById('fyLoadBtn').addEventListener('click', () => {
            _currentFY = document.getElementById('fySelect').value;
            _selectedBranch = document.getElementById('fyBranchSelect').value;
            _loadFYSummary();
        });
    }

    function _renderList(data) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        // Remove the prompt, keep selector, add results
        const selectorHtml = ul.querySelector('li:first-child')?.outerHTML || '';
        ul.innerHTML = selectorHtml;

        if (!data || !data.length) {
            ul.innerHTML += `<li class="text-center text-gray-400 text-sm py-6">No entries for this FY.</li>`;
            return;
        }

        const total = data.reduce((s, d) => s + d.balance, 0);
        const items = data.slice(0, 100);
        ul.innerHTML += items.map(d => `
            <li data-code="${d.code}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <strong class="text-indigo-700 block text-sm">${d.code} — ${d.client_name || ''}</strong>
                <span class="text-xs text-gray-500">${d.entry_count} entries</span>
                <div class="text-sm font-semibold mt-1 ${d.balance >= 0 ? 'text-green-600' : 'text-red-600'}">
                    ₹${Math.abs(d.balance).toFixed(2)} ${d.balance >= 0 ? 'Dr' : 'Cr'}
                </div>
            </li>
        `).join('');

        ul.querySelectorAll('li[data-code]').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li[data-code]').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderDetail(_fyData.find(d => d.code === li.dataset.code));
            })
        );
    }

    function search(q) {
        const lq = q.toLowerCase();
        _renderList(_fyData.filter(d =>
            (d.code || '').toLowerCase().includes(lq) ||
            (d.client_name || '').toLowerCase().includes(lq)
        ));
    }

    // ── Detail pane ──────────────────────────────────────────────────────────
    function _renderDetail(codeData) {
        if (!codeData) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header">
                    <div class="flex justify-between items-center">
                        <h3 class="font-semibold text-gray-700">${codeData.code} — ${codeData.client_name || 'Unknown'}</h3>
                        <span class="text-xs font-mono text-gray-400">${codeData.entry_count} entries</span>
                    </div>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="p-4 bg-white rounded-lg border border-gray-200 text-center">
                            <div class="text-xs text-gray-500 uppercase font-medium">Closing Balance</div>
                            <div class="text-2xl font-bold ${codeData.balance >= 0 ? 'text-green-700' : 'text-red-700'}">
                                ₹${Math.abs(codeData.balance).toFixed(2)}
                            </div>
                            <div class="text-xs text-gray-400 mt-1">${codeData.balance >= 0 ? 'Dr (Debit)' : 'Cr (Credit)'}</div>
                        </div>
                        <div class="p-4 bg-white rounded-lg border border-gray-200 text-center">
                            <div class="text-xs text-gray-500 uppercase font-medium">Branch</div>
                            <div class="text-lg font-semibold text-gray-700 mt-1">${codeData.branch || 'N/A'}</div>
                            <div class="text-xs text-gray-400 mt-1">Financial Year ${_currentFY}</div>
                        </div>
                    </div>
                    <div class="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-sm text-yellow-800">
                        <strong>➡️ On Close FY:</strong> An opening balance entry of
                        ₹${Math.abs(codeData.balance).toFixed(2)} (${codeData.balance >= 0 ? 'Dr' : 'Cr'})
                        will be created for <strong>FY ${_nextFY(_currentFY)}</strong>.
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ── Overview / Summary detail ───────────────────────────────────────────
    function _renderSummary(data) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const total = data.reduce((s, d) => s + d.balance, 0);
        const drEntries = data.filter(d => d.balance > 0);
        const crEntries = data.filter(d => d.balance < 0);
        const zeroEntries = data.filter(d => d.balance === 0);

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header">
                    <div class="flex justify-between items-center">
                        <h3 class="font-semibold text-gray-700">FY ${_currentFY} Summary</h3>
                        <span class="text-xs text-gray-500">${_selectedBranch || 'All Branches'}</span>
                    </div>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-3 gap-4 mb-6">
                        <div class="p-4 bg-green-50 rounded-lg border border-green-200 text-center">
                            <div class="text-xs text-gray-500 uppercase font-medium">Total Clients</div>
                            <div class="text-2xl font-bold text-gray-800">${data.length}</div>
                        </div>
                        <div class="p-4 bg-indigo-50 rounded-lg border border-indigo-200 text-center">
                            <div class="text-xs text-gray-500 uppercase font-medium">With Balance</div>
                            <div class="text-2xl font-bold text-indigo-700">${drEntries.length + crEntries.length}</div>
                        </div>
                        <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
                            <div class="text-xs text-gray-500 uppercase font-medium">Zero Balance</div>
                            <div class="text-2xl font-bold text-gray-500">${zeroEntries.length}</div>
                        </div>
                    </div>
                    <div class="p-4 bg-white rounded-lg border border-gray-200 text-center mb-4">
                        <div class="text-xs text-gray-500 uppercase font-medium">Net Closing Balance (Sum of All Codes)</div>
                        <div class="text-3xl font-bold ${total >= 0 ? 'text-green-700' : 'text-red-700'}">
                            ₹${Math.abs(total).toFixed(2)} ${total >= 0 ? 'Dr' : 'Cr'}
                        </div>
                    </div>
                    <div class="flex justify-end gap-3 pt-4 border-t">
                        <button id="closeFYBtn" class="px-5 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            Close FY ${_currentFY} → ${_nextFY(_currentFY)}
                        </button>
                    </div>
                    <div id="closeFYResult" class="hidden mt-3 p-3 rounded text-sm"></div>
                </div>
            </div>`;

        document.getElementById('closeFYBtn').addEventListener('click', () => _handleCloseFY());

        VaultPage.showDetailPane();
    }

    // ── Close FY action ─────────────────────────────────────────────────────
    async function _handleCloseFY() {
        if (!confirm(`⚠️ This will create opening balance entries for ALL codes in FY ${_nextFY(_currentFY)} based on their closing balance as of FY ${_currentFY}. This cannot be undone by undo. Continue?`)) return;

        const btn = document.getElementById('closeFYBtn');
        const result = document.getElementById('closeFYResult');
        btn.disabled = true;
        btn.innerHTML = '<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Processing…';

        try {
            const res = await callApi('/api/ledger/close-fy', {
                from_fy: _currentFY,
                to_fy: _nextFY(_currentFY),
                branch: _selectedBranch,
            }, 'POST');

            result.className = 'mt-3 p-3 rounded text-sm bg-green-100 text-green-800';
            result.innerHTML = `
                ✅ FY Closed Successfully!
                <div class="mt-2 text-xs">
                    Created ${res.total_codes} opening balance entries for FY ${res.to_fy}
                    <br>Total balance carried forward: ₹${Math.abs(res.total_balance).toFixed(2)}
                </div>
                ${res.data?.length > 0 ? `
                <details class="mt-2">
                    <summary class="cursor-pointer text-xs font-medium">View detail</summary>
                    <div class="mt-1 max-h-40 overflow-y-auto text-xs space-y-1">
                        ${res.data.map(d => `<div>${d.code} — ${d.client_name || ''}: ₹${Math.abs(d.balance).toFixed(2)}</div>`).join('')}
                    </div>
                </details>` : ''}`;
            result.classList.remove('hidden');

            // Refresh the list to show the state
            _loadFYSummary();
        } catch (err) {
            result.className = 'mt-3 p-3 rounded text-sm bg-red-100 text-red-800';
            result.textContent = '❌ ' + (err.message || 'Failed to close FY');
            result.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                Close FY ${_currentFY} → ${_nextFY(_currentFY)}`;
        }
    }

    // ── Load FY summary ─────────────────────────────────────────────────────
    async function _loadFYSummary() {
        const view = document.getElementById('vaultDetailView');
        view.innerHTML = '<div class="text-center text-gray-400 py-8">Loading FY summary…</div>';
        VaultPage.showDetail(false);

        try {
            const res = await callApi(`/api/ledger/fy-summary?fy=${_currentFY}${_selectedBranch ? `&branch=${_selectedBranch}` : ''}`, {}, 'GET');
            _fyData = res.data || [];

            // Select first item if any
            if (_fyData.length) {
                _renderList(_fyData);
                _renderSummary(_fyData);
                // Highlight first in list
                const firstLi = document.querySelector('#vaultList li[data-code]');
                if (firstLi) {
                    firstLi.classList.add('selected');
                    firstLi.click();
                }
            } else {
                _renderList([]);
                view.innerHTML = `<div class="detail-card"><div class="detail-card-body text-center py-12">
                    <div class="text-4xl mb-3">📭</div>
                    <p class="text-gray-500 text-sm">No entries found for FY ${_currentFY}.</p>
                    <p class="text-gray-400 text-xs mt-2">Try selecting a different Financial Year or branch.</p>
                </div></div>`;
                VaultPage.showDetail(true);
                VaultPage.showDetailPane();
            }
        } catch (err) {
            _renderList([]);
            view.innerHTML = `<div class="text-center text-red-500 py-8">❌ ${err.message || 'Failed to load'}</div>`;
            VaultPage.showDetail(true);
            VaultPage.showDetailPane();
        }
    }

    // ── Load ─────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        _currentFY = _getCurrentFY();

        const data = await getAppData();
        if (data?.BRANCHES) {
            _allBranches = Object.values(data.BRANCHES).filter(b => b.BRANCH_CODE);
        }

        _renderFYSelector();
        // Auto-load current FY
        _loadFYSummary();
    }

    return { load, search };
})();

window.VaultCloseFY = VaultCloseFY;
