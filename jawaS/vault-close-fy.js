// ============================================================================
// VAULT-CLOSE-FY.JS — Financial Year (FY) Lock & Period Sealing
// Tile: close-fy (🔒 / 📅)
// Connects to /api/ledger/fy/locks, /api/ledger/fy/lock, /api/ledger/fy/unlock
// ============================================================================

const VaultCloseFY = (() => {

    let _fyLocks = [];
    let _currentFY = '';
    let _allBranches = [];
    let _selectedBranch = '';
    let _activeLockRecord = null;
    let _tbData = null;

    function _can(role) { return window.VaultPage?.can ? window.VaultPage.can(role) : true; }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function _fmtMoney(n) {
        const num = Number(n) || 0;
        return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function _getAuthToken() {
        if (typeof getSessionId === 'function') {
            const s = getSessionId();
            if (s) return s;
        }
        try {
            const raw = localStorage.getItem('loginData') || localStorage.getItem('post4ex_session') || localStorage.getItem('session') || '';
            if (raw) {
                const parsed = JSON.parse(raw);
                return parsed.sessionId || parsed.token || parsed.jwt || parsed.access_token || raw;
            }
        } catch (_) {}
        return localStorage.getItem('token') || '';
    }

    function _getHeaders() {
        const token = _getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    // Determine current FY from date (e.g. 25-26)
    function _getCurrentFY() {
        const now = new Date();
        const m = now.getMonth() + 1;
        const y = now.getFullYear();
        const startY = m >= 4 ? y : y - 1;
        return `${String(startY).slice(2)}-${String(startY + 1).slice(2)}`;
    }

    function _nextFY(fy) {
        const parts = String(fy).split('-');
        if (parts.length === 2) {
            const start = parseInt(parts[0], 10);
            return `${String(start + 1).padStart(2, '0')}-${String(start + 2).padStart(2, '0')}`;
        }
        return fy;
    }

    // ── List Pane Setup ───────────────────────────────────────────────────────
    function _injectListPane() {
        const msg = document.getElementById('vaultListMsg');
        if (msg) { msg.textContent = ''; msg.classList.add('hidden'); }
        const list = document.getElementById('vaultList');
        if (list) list.innerHTML = '';
        const search = document.getElementById('vaultSearch');
        if (search) {
            search.placeholder = 'Search financial year or status…';
            search.oninput = () => _onSearch();
        }
    }

    async function _fetchLocks() {
        try {
            const res = await fetch('/api/ledger/fy/locks', { headers: _getHeaders() });
            if (res.ok) {
                const data = await res.json();
                _fyLocks = data.locks || [];
            }
        } catch (err) {
            console.warn('[VaultCloseFY] Failed to fetch /api/ledger/fy/locks:', err);
        }
    }

    function _renderFYSelector() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        // If locks exist, use those; else generate default FYs
        let fys = _fyLocks.map(l => l.fy);
        if (!fys.length) {
            const curr = _getCurrentFY();
            const currStart = parseInt(curr.split('-')[0], 10);
            for (let i = 3; i >= -1; i--) {
                const s = currStart - i;
                fys.push(`${String(s).padStart(2, '0')}-${String(s + 1).padStart(2, '0')}`);
            }
        }

        const selectorHtml = `
            <li class="p-3 mb-2 bg-gray-50 border border-gray-200 rounded-lg">
                <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Financial Year</label>
                <select id="fySelect" class="form-input text-xs font-mono font-bold bg-white">
                    ${fys.map(fy => {
                        const l = _fyLocks.find(x => x.fy === fy);
                        const statusLabel = l ? (l.status === 'LOCKED' ? '🔒 LOCKED' : '🟢 OPEN') : '';
                        return `<option value="${fy}" ${fy === _currentFY ? 'selected' : ''}>FY 20${fy} ${statusLabel}</option>`;
                    }).join('')}
                </select>
                <div class="mt-2">
                    <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Branch <span class="text-gray-400 font-normal">(optional)</span></label>
                    <select id="fyBranchSelect" class="form-input text-xs bg-white">
                        <option value="">All Branches</option>
                        ${_allBranches.map(b => `<option value="${b.BRANCH_CODE}" ${_selectedBranch === b.BRANCH_CODE ? 'selected' : ''}>${b.BRANCH_NAME || b.BRANCH_CODE}</option>`).join('')}
                    </select>
                </div>
                <button id="fyLoadBtn" class="mt-3 w-full btn-ghost btn-sm text-xs justify-center flex items-center gap-2">
                    <i class="fa-solid fa-arrows-rotate"></i>
                    <span>Inspect Financial Year</span>
                </button>
            </li>
            <li class="px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-200">
                FY Lock Records
            </li>
        `;

        const lockListHtml = _fyLocks.map(l => {
            const isLocked = (l.status || '').toUpperCase() === 'LOCKED';
            const badge = isLocked
                ? `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-800 border border-red-200 font-mono">🔒 LOCKED</span>`
                : `<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono">🟢 OPEN</span>`;
            
            return `
                <li data-fy="${l.fy}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50/60 border border-gray-200 transition-colors ${l.fy === _currentFY ? 'selected bg-indigo-50 border-indigo-300' : ''}">
                    <div class="flex items-center justify-between">
                        <strong class="text-xs font-bold text-gray-900 font-mono">FY 20${l.fy}</strong>
                        ${badge}
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-gray-500 mt-1 font-mono">
                        <span>${l.start_date} to ${l.end_date}</span>
                    </div>
                    ${l.locked_at ? `<div class="text-[10px] text-gray-400 mt-0.5 truncate">Locked: ${l.locked_at} (${l.locked_by || 'SYSTEM'})</div>` : ''}
                </li>
            `;
        }).join('');

        ul.innerHTML = selectorHtml + lockListHtml;

        document.getElementById('fyLoadBtn')?.addEventListener('click', () => {
            _currentFY = document.getElementById('fySelect').value;
            _selectedBranch = document.getElementById('fyBranchSelect').value;
            _loadFYSummary();
        });

        ul.querySelectorAll('li[data-fy]').forEach(li => {
            li.addEventListener('click', () => {
                _currentFY = li.dataset.fy;
                const sel = document.getElementById('fySelect');
                if (sel) sel.value = _currentFY;
                ul.querySelectorAll('li[data-fy]').forEach(x => x.classList.remove('selected', 'bg-indigo-50', 'border-indigo-300'));
                li.classList.add('selected', 'bg-indigo-50', 'border-indigo-300');
                _loadFYSummary();
            });
        });
    }

    function _onSearch() {
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase().trim();
        const lis = document.querySelectorAll('#vaultList li[data-fy]');
        lis.forEach(li => {
            const txt = li.textContent.toLowerCase();
            li.style.display = txt.includes(q) ? '' : 'none';
        });
    }

    // ── Detail Pane Render ────────────────────────────────────────────────────
    function _renderSummaryCard() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        if (!view) return;

        const l = _activeLockRecord || _fyLocks.find(x => x.fy === _currentFY) || {
            fy: _currentFY,
            status: 'OPEN',
            start_date: `20${_currentFY.split('-')[0]}-04-01`,
            end_date: `20${_currentFY.split('-')[1]}-03-31`
        };

        const isLocked = (l.status || '').toUpperCase() === 'LOCKED';
        const user = (typeof getUser === 'function') ? getUser() : null;
        const role = user?.ROLE || 'STAFF';
        const isAdmin = ['ADMIN', 'MASTER'].includes(role.toUpperCase());
        const canLock = ['ACCOUNTANT', 'ADMIN', 'MASTER'].includes(role.toUpperCase());

        const statusBadge = isLocked
            ? `<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 font-mono">
                 <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                 <span>🔒 LOCKED (Read-Only)</span>
               </div>`
            : `<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono">
                 <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                 <span>🟢 ACTIVE (Open for Transactions)</span>
               </div>`;

        let actionButtonHtml = '';
        if (isLocked) {
            if (isAdmin) {
                actionButtonHtml = `
                    <button id="unlockFYBtn" class="btn-danger btn-sm text-xs font-bold flex items-center gap-2">
                        <i class="fa-solid fa-lock-open"></i>
                        <span>Unlock FY 20${l.fy} (Admin Emergency Override)</span>
                    </button>
                `;
            } else {
                actionButtonHtml = `
                    <div class="text-xs text-gray-500 italic flex items-center gap-1.5 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                        <i class="fa-solid fa-shield-halved text-gray-400"></i>
                        <span>This period is locked. Modifications, unbilling, and voiding are blocked by system invariants.</span>
                    </div>
                `;
            }
        } else {
            if (canLock) {
                actionButtonHtml = `
                    <button id="lockFYBtn" class="btn-danger btn-sm text-xs font-bold flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white border-amber-700">
                        <i class="fa-solid fa-lock"></i>
                        <span>Lock &amp; Seal Financial Year 20${l.fy}</span>
                    </button>
                `;
            }
        }

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-gray-900 text-sm flex items-center gap-2">
                            <span>📅 Financial Year 20${l.fy} (1-Apr to 31-Mar)</span>
                        </h3>
                        <p class="text-[11px] text-gray-500 mt-0.5">Statutory ledger period status and mutation lock enforcement</p>
                    </div>
                    <div>${statusBadge}</div>
                </div>

                <div class="detail-card-body space-y-5">
                    <!-- Period Info Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div class="p-3.5 bg-gray-50 rounded-lg border border-gray-200">
                            <span class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Start Date</span>
                            <span class="text-sm font-bold text-gray-800 font-mono mt-0.5 block">${l.start_date || '—'}</span>
                        </div>
                        <div class="p-3.5 bg-gray-50 rounded-lg border border-gray-200">
                            <span class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">End Date</span>
                            <span class="text-sm font-bold text-gray-800 font-mono mt-0.5 block">${l.end_date || '—'}</span>
                        </div>
                        <div class="p-3.5 bg-gray-50 rounded-lg border border-gray-200">
                            <span class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Locked By / Timestamp</span>
                            <span class="text-xs font-semibold text-gray-800 font-mono mt-0.5 block truncate">
                                ${l.locked_at ? `${l.locked_by || 'SYSTEM'} (${l.locked_at.slice(0, 10)})` : 'Not locked'}
                            </span>
                        </div>
                    </div>

                    <!-- Explanatory Banner -->
                    <div class="p-4 rounded-lg border ${isLocked ? 'bg-red-50/60 border-red-200 text-red-950' : 'bg-blue-50/60 border-blue-200 text-blue-950'} text-xs leading-relaxed space-y-1.5">
                        <div class="font-bold flex items-center gap-1.5">
                            <i class="fa-solid fa-circle-info"></i>
                            <span>${isLocked ? 'Financial Period Lock Active' : 'Period Is Unlocked (Mutations Permitted)'}</span>
                        </div>
                        <p class="text-[11px] opacity-90">
                            ${isLocked 
                                ? `All transaction postings (Invoices, Receipts, Carrier Bills, Contra, Journals) and voiding for dates between <strong>${l.start_date}</strong> and <strong>${l.end_date}</strong> are strictly blocked in backend database checks with HTTP 403.`
                                : `Transactions falling between <strong>${l.start_date}</strong> and <strong>${l.end_date}</strong> can be posted and modified by authorized accountants and managers. When you seal this FY, backdated entries will be forbidden.`
                            }
                        </p>
                    </div>

                    <!-- Action Section -->
                    <div class="pt-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
                        <div class="text-[11px] text-gray-500">
                            ${l.notes ? `<span>Notes: ${_escapeHtml(l.notes)}</span>` : ''}
                        </div>
                        <div>${actionButtonHtml}</div>
                    </div>

                    <div id="fyActionNotice" class="hidden p-3 rounded-lg text-xs font-semibold"></div>
                </div>
            </div>
        `;

        // Wire Lock Button
        document.getElementById('lockFYBtn')?.addEventListener('click', () => _handleLockAction(l.fy, 'LOCKED'));
        // Wire Unlock Button
        document.getElementById('unlockFYBtn')?.addEventListener('click', () => _handleLockAction(l.fy, 'OPEN'));

        VaultPage.showDetailPane();
    }

    async function _handleLockAction(fyCode, targetStatus) {
        const isLocking = targetStatus === 'LOCKED';
        const actionVerb = isLocking ? 'LOCK & SEAL' : 'UNLOCK';
        const promptMsg = isLocking
            ? `⚠️ Are you sure you want to LOCK Financial Year 20${fyCode}?\n\nOnce locked, NO ONE can post backdated vouchers, bills, or void invoices for this period.`
            : `⚠️ Are you sure you want to UNLOCK Financial Year 20${fyCode}?\n\nThis will temporarily re-open historical dates for modifications. Only Admins should execute this override.`;

        if (!confirm(promptMsg)) return;

        const notice = document.getElementById('fyActionNotice');
        if (notice) {
            notice.className = 'p-3 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 block';
            notice.textContent = `Processing ${actionVerb} request...`;
        }

        try {
            const endpoint = isLocking ? '/api/ledger/fy/lock' : '/api/ledger/fy/unlock';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: _getHeaders(),
                body: JSON.stringify({ fy: fyCode, notes: `Status changed to ${targetStatus} via Vault UI` })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || data.message || `Failed to ${actionVerb} FY`);
            }

            if (notice) {
                notice.className = 'p-3 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 block';
                notice.textContent = `✅ Successfully ${actionVerb}ED Financial Year 20${fyCode}!`;
            }

            // Refresh locks list and re-render
            await _fetchLocks();
            _activeLockRecord = _fyLocks.find(x => x.fy === fyCode);
            _renderFYSelector();
            _renderSummaryCard();
        } catch (err) {
            if (notice) {
                notice.className = 'p-3 rounded-lg text-xs font-semibold bg-red-100 text-red-800 border border-red-200 block';
                notice.textContent = `❌ ${err.message || 'Action failed'}`;
            }
        }
    }

    async function _loadFYSummary() {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        if (view) {
            view.innerHTML = `
                <div class="flex items-center justify-center py-12">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <span class="ml-3 text-xs font-bold text-gray-600">Inspecting FY 20${_currentFY} status...</span>
                </div>
            `;
        }
        VaultPage.showDetailPane();

        await _fetchLocks();
        _activeLockRecord = _fyLocks.find(x => x.fy === _currentFY);
        _renderSummaryCard();
    }

    async function load() {
        _injectListPane();
        _currentFY = _getCurrentFY();

        const data = (typeof getAppData === 'function') ? await getAppData() : null;
        if (data?.BRANCHES) {
            _allBranches = Object.values(data.BRANCHES).filter(b => b.BRANCH_CODE);
        }

        await _fetchLocks();
        _renderFYSelector();
        _loadFYSummary();
    }

    return { load, search: _onSearch };
})();

window.VaultCloseFY = VaultCloseFY;
