// ============================================================================
// VAULT-PAYROLL.JS — Staff/Employee management + Payroll processing
// Tiles: employees, payroll
// API: staff data from cache, /api/write for STAFF
// ============================================================================

const VaultPayroll = (() => {

    let _allStaff = [];
    let _allAttendance = [];
    let _allBranches = [];
    let _activeTile = 'employees';

    function _can(role) { return window.VaultPage?.can(role); }
    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    function _injectListPane(placeholder) {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        document.getElementById('vaultSearch').placeholder = placeholder || 'Search…';
    }

    // ── Role display helper ──────────────────────────────────────────────────
    function _roleBadge(role) {
        const colors = { 'MASTER': 'bg-red-100 text-red-700', 'ADMIN': 'bg-purple-100 text-purple-700',
            'AUDITOR': 'bg-orange-100 text-orange-700', 'ACCOUNTANT': 'bg-blue-100 text-blue-700',
            'MANAGER': 'bg-green-100 text-green-700', 'STAFF': 'bg-gray-100 text-gray-700',
            'CLIENT': 'bg-yellow-100 text-yellow-700' };
        return `<span class="text-xs px-2 py-0.5 rounded-full ${colors[role] || 'bg-gray-100 text-gray-600'}">${role || 'N/A'}</span>`;
    }

    function _statusBadge(status) {
        const colors = { 'Active': 'bg-green-100 text-green-700', 'Inactive': 'bg-red-100 text-red-700',
            'Resigned': 'bg-yellow-100 text-yellow-700', 'On Leave': 'bg-blue-100 text-blue-700' };
        return `<span class="text-xs px-2 py-0.5 rounded-full ${colors[status] || 'bg-gray-100 text-gray-600'}">${status || 'N/A'}</span>`;
    }

    // ========================================================================
    // EMPLOYEES TILE
    // ========================================================================

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = q
            ? _allStaff.filter(s =>
                (s.STAFF_NAME || '').toLowerCase().includes(q) ||
                (s.STAFF_CODE || '').toLowerCase().includes(q) ||
                (s.BRANCH || '').toLowerCase().includes(q) ||
                (s.DEPARTMENT || '').toLowerCase().includes(q) ||
                (s.MOBILE || '').includes(q)
              )
            : _allStaff;
        const sorted = [...filtered].sort((a, b) => (a.STAFF_NAME || '').localeCompare(b.STAFF_NAME || ''));
        if (!sorted.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No employees found.</li>';
            return;
        }
        ul.innerHTML = sorted.map(s => `
            <li data-code="${s.STAFF_CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <div>
                        <strong class="text-gray-800 block text-sm">${s.STAFF_NAME || 'N/A'}</strong>
                        <span class="text-xs text-gray-500">${s.STAFF_CODE || ''} · ${s.BRANCH || ''} · ${s.DEPARTMENT || ''}</span>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        ${_statusBadge(s.STATUS)}
                    </div>
                </div>
                <div class="mt-1">${_roleBadge(s.ROLE)}</div>
                ${s.MOBILE ? `<div class="text-xs text-gray-400 mt-1">📞 ${s.MOBILE}</div>` : ''}
            </li>`).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderEmployeeDetail(_allStaff.find(s => s.STAFF_CODE === li.dataset.code));
            })
        );
    }

    function _renderEmployeeDetail(staff) {
        if (!staff) return;
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const branch = _allBranches.find(b => b.BRANCH_CODE === staff.BRANCH);
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">👤 Employee Detail</h3>
                    <div class="flex gap-2 items-center">
                        ${_statusBadge(staff.STATUS)}
                        <button onclick="VaultPayroll._printEmployee('${staff.STAFF_CODE}')" class="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> Print</button>
                    </div>
                </div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div class="sm:col-span-2 bg-indigo-50 rounded-lg p-4 border border-indigo-200">
                            <div class="text-xl font-bold text-indigo-800">${staff.STAFF_NAME || 'N/A'}</div>
                            <div class="text-xs text-indigo-600">${staff.STAFF_CODE || ''} · ${_roleBadge(staff.ROLE)}</div>
                        </div>
                        <div><span class="text-gray-500">Mobile:</span> ${staff.MOBILE || 'N/A'}</div>
                        <div><span class="text-gray-500">Email:</span> ${staff.EMAIL || 'N/A'}</div>
                        <div><span class="text-gray-500">Branch:</span> ${staff.BRANCH || 'N/A'} ${branch ? '- ' + branch.BRANCH_NAME : ''}</div>
                        <div><span class="text-gray-500">Department:</span> ${staff.DEPARTMENT || 'N/A'}</div>
                        <div><span class="text-gray-500">Date of Birth:</span> ${staff.DATE_BIRTH ? _fmt(staff.DATE_BIRTH, 'date') : 'N/A'}</div>
                        <div><span class="text-gray-500">Date of Join:</span> ${staff.DATE_JOIN ? _fmt(staff.DATE_JOIN, 'date') : 'N/A'}</div>
                        ${staff.DATE_LEAVE ? `<div><span class="text-gray-500">Date of Leave:</span> ${_fmt(staff.DATE_LEAVE, 'date')}</div>` : ''}
                        <div><span class="text-gray-500">Gender:</span> ${staff.GENDER || 'N/A'}</div>
                        <div><span class="text-gray-500">Blood Group:</span> ${staff.BLOOD_GROUP || 'N/A'}</div>
                        <div><span class="text-gray-500">PAN:</span> ${staff.PAN_NUM || 'N/A'}</div>
                        <div><span class="text-gray-500">Aadhaar:</span> ${staff.ADHAR_NUM || 'N/A'}</div>
                        <div><span class="text-gray-500">EPF UID:</span> ${staff.EPF_UID || 'N/A'}</div>
                        <div><span class="text-gray-500">ESI UID:</span> ${staff.ESI_UID || 'N/A'}</div>
                        <div><span class="text-gray-500">UAN:</span> ${staff.UAN || 'N/A'}</div>
                        <div><span class="text-gray-500">Emergency Contact:</span> ${staff.EMERGENCY_CONTACT || 'N/A'}</div>
                        ${staff.BANK_NAME ? `<div class="sm:col-span-2 border-t pt-2 mt-2">
                            <div class="text-xs font-semibold text-gray-400 uppercase mb-2">Bank Details</div>
                            <div class="grid grid-cols-2 gap-3">
                                <div><span class="text-gray-500">Bank:</span> ${staff.BANK_NAME}</div>
                                <div><span class="text-gray-500">A/C:</span> ${staff.BANK_AC || 'N/A'}</div>
                                <div><span class="text-gray-500">IFSC:</span> ${staff.BANK_IFSC || 'N/A'}</div>
                            </div>
                        </div>` : ''}
                        ${staff.ADDRESS ? `<div class="sm:col-span-2"><span class="text-gray-500">Address:</span> ${staff.ADDRESS}, ${staff.CITY || ''}, ${staff.STATE || ''} - ${staff.PINCODE || ''}</div>` : ''}
                    </div>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }



    // ========================================================================
    // SALARY STRUCTURE (stored in LEDGER as JOURNAL entries with JOURNAL_TYPE='SALARY_STRUCTURE')
    // NARRATION contains JSON: { net: 25000, earnings: {basic:12000,...}, deductions: {pf:1800,...} }
    // ========================================================================

    let _allLedger = [];
    let _salaryStructures = [];

    function _loadSalaryStructures() {
        _salaryStructures = _allLedger.filter(e => e.ENTRY_TYPE === 'JOURNAL' && e.JOURNAL_TYPE === 'SALARY_STRUCTURE' && e.STATUS === 'ACTIVE');
    }

    function _getSalaryForStaff(code) {
        return _salaryStructures.find(s => s.CODE === code);
    }

    function _renderSalaryForm(staffCode, existingData) {
        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');
        const staff = _allStaff.find(s => s.STAFF_CODE === staffCode);
        const d = existingData || {};
        const earn = d.earnings || {};
        const ded = d.deductions || {};
        const net = d.net || 0;
        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">💰 Set Salary: ${staff?.STAFF_NAME || staffCode}</h3></div>
                <div class="detail-card-body">
                    <form id="salForm" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div class="sm:col-span-3 text-xs text-gray-500 bg-indigo-50 rounded p-2 border border-indigo-200">
                            Enter monthly amounts. Net = Earnings - Deductions (auto-calculated)
                        </div>
                        <div class="sm:col-span-3 font-semibold text-gray-600 text-sm border-b pb-1">💰 Earnings</div>
                        <div><label class="block text-xs font-medium text-gray-600">Basic</label><input name="basic" type="number" class="form-input text-sm" value="${earn.basic || 0}" oninput="VaultPayroll._calcNet()"></div>
                        <div><label class="block text-xs font-medium text-gray-600">HRA</label><input name="hra" type="number" class="form-input text-sm" value="${earn.hra || 0}" oninput="VaultPayroll._calcNet()"></div>
                        <div><label class="block text-xs font-medium text-gray-600">Conveyance</label><input name="conveyance" type="number" class="form-input text-sm" value="${earn.conveyance || 0}" oninput="VaultPayroll._calcNet()"></div>
                        <div><label class="block text-xs font-medium text-gray-600">Medical</label><input name="medical" type="number" class="form-input text-sm" value="${earn.medical || 0}" oninput="VaultPayroll._calcNet()"></div>
                        <div><label class="block text-xs font-medium text-gray-600">Special</label><input name="special" type="number" class="form-input text-sm" value="${earn.special || 0}" oninput="VaultPayroll._calcNet()"></div>
                        <div class="sm:col-span-3 font-semibold text-gray-600 text-sm border-b pb-1 mt-2">✂️ Deductions</div>
                        <div><label class="block text-xs font-medium text-gray-600">PF</label><input name="pf" type="number" class="form-input text-sm" value="${ded.pf || 0}" oninput="VaultPayroll._calcNet()"></div>
                        <div><label class="block text-xs font-medium text-gray-600">ESI</label><input name="esi" type="number" class="form-input text-sm" value="${ded.esi || 0}" oninput="VaultPayroll._calcNet()"></div>
                        <div><label class="block text-xs font-medium text-gray-600">TDS</label><input name="tds" type="number" class="form-input text-sm" value="${ded.tds || 0}" oninput="VaultPayroll._calcNet()"></div>
                        <div class="sm:col-span-3 border-t pt-3 mt-2">
                            <div class="flex items-center justify-between">
                                <span class="font-semibold text-gray-700">Net Salary (auto):</span>
                                <span id="salNetDisplay" class="text-xl font-bold text-indigo-700">₹${Number(net).toFixed(2)}</span>
                            </div>
                        </div>
                        <div class="sm:col-span-3 flex justify-end pt-2 gap-2">
                            <button type="button" onclick="VaultPayroll.setTile('payroll');VaultPayroll.load();" class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn btn-sm">💾 Save Salary</button>
                        </div>
                    </form>
                    <div id="salResponse" class="hidden mt-3 p-3 rounded text-sm text-center"></div>
                </div>
            </div>`;
        document.getElementById('salForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const vals = Object.fromEntries(fd);
            const earnings = {
                basic: parseFloat(vals.basic) || 0,
                hra: parseFloat(vals.hra) || 0,
                conveyance: parseFloat(vals.conveyance) || 0,
                medical: parseFloat(vals.medical) || 0,
                special: parseFloat(vals.special) || 0,
            };
            const deductions = {
                pf: parseFloat(vals.pf) || 0,
                esi: parseFloat(vals.esi) || 0,
                tds: parseFloat(vals.tds) || 0,
            };
            const totalEarnings = Object.values(earnings).reduce((a, b) => a + b, 0);
            const totalDeductions = Object.values(deductions).reduce((a, b) => a + b, 0);
            const net = totalEarnings - totalDeductions;
            if (net <= 0) { alert('Net salary must be > 0'); return; }
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true;
            const resp = document.getElementById('salResponse');
            try {
                // Void existing structure if editing
                if (existingData && existingData.entry_id) {
                    await callApi('/api/ledger/void', { entry_id: existingData.entry_id, void_reason: 'Replaced by update' }, 'POST');
                } else {
                    const oldEntry = _allLedger.find(x => x.ENTRY_TYPE === 'JOURNAL' && x.JOURNAL_TYPE === 'SALARY_STRUCTURE' && x.CODE === staffCode && x.STATUS === 'ACTIVE');
                    if (oldEntry) {
                        await callApi('/api/ledger/void', { entry_id: oldEntry.ENTRY_ID, void_reason: 'Replaced by update' }, 'POST');
                    }
                }
                const templateData = JSON.stringify({ earnings, deductions, net });
                await callApi('/api/ledger/journal', {
                    code: staffCode,
                    entry_date: Date.now(),
                    journal_type: 'SALARY_STRUCTURE',
                    narration: templateData,
                    branch: staff?.BRANCH || '',
                    debit: net,
                    credit: 0,
                }, 'POST');
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Salary structure saved for ${staff?.STAFF_NAME || staffCode}: ₹${net.toFixed(2)}`;
                resp.classList.remove('hidden');
                const data = await getAppData();
                if (data?.LEDGER) _allLedger = Object.values(data.LEDGER);
                _loadSalaryStructures();
            } catch (err) {
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-red-100 text-red-800';
                resp.textContent = '❌ ' + (err.message || 'Failed');
                resp.classList.remove('hidden');
            } finally { btn.disabled = false; }
        });
        VaultPage.showDetailPane();
    }

    function _openSalaryForm(staffCode) {
        const existing = _getSalaryForStaff(staffCode);
        if (existing) {
            try {
                const data = JSON.parse(existing.NARRATION || '{}');
                data.entry_id = existing.ENTRY_ID;
                _renderSalaryForm(staffCode, data);
            } catch { _renderSalaryForm(staffCode, null); }
        } else {
            _renderSalaryForm(staffCode, null);
        }
    }

    // ── Process Monthly Salary ────────────────────────────────────────────────
    async function _processMonthlySalary() {
        const activeStaff = _allStaff.filter(s => s.STATUS === 'Active');
        const withSalary = activeStaff.filter(s => _getSalaryForStaff(s.STAFF_CODE));
        if (!withSalary.length) {
            alert('No active employees have salary structure defined. Set salaries first.');
            return;
        }
        const month = new Date().toISOString().substring(0, 7); // YYYY-MM
        if (!confirm(`Process salary for ${month}? This will create ledger entries for ${withSalary.length} employees.`)) return;
        let success = 0, failed = 0;
        for (const staff of withSalary) {
            const structure = _getSalaryForStaff(staff.STAFF_CODE);
            try {
                const data = JSON.parse(structure.NARRATION || '{}');
                await callApi('/api/ledger/journal', {
                    code: staff.STAFF_CODE,
                    entry_date: Date.now(),
                    journal_type: 'SALARY',
                    narration: `Salary ${month} - ${staff.STAFF_NAME || ''} - ₹${(data.net || 0).toFixed(2)}`,
                    branch: staff.BRANCH || '',
                    debit: data.net || 0,
                    credit: 0,
                }, 'POST');
                success++;
            } catch { failed++; }
        }
        alert(`✅ ${month}: Processed ${success} salaries${failed ? ', failed: ' + failed : ''}`);
        const freshData = await getAppData();
        if (freshData?.LEDGER) _allLedger = Object.values(freshData.LEDGER);
        _loadSalaryStructures();
        _renderPayrollDashboard();
    }

    // ── Net auto-calc ─────────────────────────────────────────────────────────
    function _calcNet() {
        const ids = ['basic', 'hra', 'conveyance', 'medical', 'special', 'pf', 'esi', 'tds'];
        const vals = {};
        ids.forEach(id => {
            const el = document.querySelector(`[name="${id}"]`);
            vals[id] = parseFloat(el?.value || 0);
        });
        const earnings = vals.basic + vals.hra + vals.conveyance + vals.medical + vals.special;
        const deductions = vals.pf + vals.esi + vals.tds;
        const net = Math.max(0, earnings - deductions);
        const display = document.getElementById('salNetDisplay');
        if (display) display.textContent = '₹' + net.toFixed(2);
    }

    // ── Salary structures list ────────────────────────────────────────────────
    function _renderSalaryList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const activeStaff = _allStaff.filter(s => s.STATUS === 'Active').sort((a, b) => (a.STAFF_NAME || '').localeCompare(b.STAFF_NAME || ''));
        if (!activeStaff.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No active employees.</li>';
            return;
        }
        ul.innerHTML = activeStaff.map(s => {
            const sal = _getSalaryForStaff(s.STAFF_CODE);
            let salInfo = '';
            if (sal) {
                try {
                    const d = JSON.parse(sal.NARRATION || '{}');
                    salInfo = `<span class="text-green-600 font-medium">✅ ₹${(d.net || 0).toFixed(2)}</span>`;
                } catch { salInfo = '<span class="text-yellow-600">⚠️ Invalid data</span>'; }
            } else {
                salInfo = '<span class="text-gray-400">Not set</span>';
            }
            return `<li data-code="${s.STAFF_CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <strong class="text-gray-800 block text-sm">${s.STAFF_NAME || 'N/A'}</strong>
                <span class="text-xs text-gray-500">${s.STAFF_CODE} · ${s.BRANCH || ''}</span>
                <div class="text-xs mt-1">${salInfo} · <button onclick="event.stopPropagation();VaultPayroll._openSalaryForm('${s.STAFF_CODE}')" class="text-indigo-600 hover:text-indigo-800 underline">${sal ? 'Edit' : 'Set'} Salary</button></div>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _showSalaryDetail(li.dataset.code);
            })
        );
    }

    function _showSalaryDetail(code) {
        VaultPage.showDetail(true);
        const staff = _allStaff.find(s => s.STAFF_CODE === code);
        const sal = _getSalaryForStaff(code);
        const view = document.getElementById('vaultDetailView');
        if (!sal) {
            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">💰 ${staff?.STAFF_NAME || code}</h3></div>
                    <div class="detail-card-body text-center py-8">
                        <div class="text-4xl mb-3">💰</div>
                        <p class="text-gray-500 text-sm mb-4">No salary structure defined.</p>
                        <button onclick="VaultPayroll._openSalaryForm('${code}')" class="btn btn-sm">Set Salary</button>
                    </div>
                </div>`;
            VaultPage.showDetailPane();
            return;
        }
        try {
            const d = JSON.parse(sal.NARRATION || '{}');
            const earn = d.earnings || {};
            const ded = d.deductions || {};
            view.innerHTML = `
                <div class="detail-card">
                    <div class="detail-card-header flex justify-between items-center">
                        <h3 class="font-semibold text-gray-700">💰 ${staff?.STAFF_NAME || code}</h3>
                        <button onclick="VaultPayroll._openSalaryForm('${code}')" class="px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">✏️ Edit</button>
                    </div>
                    <div class="detail-card-body">
                        <div class="text-center mb-4">
                            <div class="text-3xl font-bold text-indigo-700">₹${(d.net || 0).toFixed(2)}</div>
                            <div class="text-xs text-gray-500">Net Monthly Salary</div>
                        </div>
                        <div class="grid grid-cols-2 gap-3 text-sm mb-4">
                            <div class="col-span-2 font-semibold text-gray-600 border-b">Earnings</div>
                            ${Object.entries(earn).map(([k, v]) => `<div class="flex justify-between"><span class="text-gray-500 capitalize">${k}</span><span>₹${(+v).toFixed(2)}</span></div>`).join('')}
                            <div class="col-span-2 font-semibold text-gray-600 border-b mt-2">Deductions</div>
                            ${Object.entries(ded).map(([k, v]) => `<div class="flex justify-between"><span class="text-gray-500 capitalize">${k}</span><span class="text-red-600">-₹${(+v).toFixed(2)}</span></div>`).join('')}
                        </div>
                    </div>
                </div>`;
        } catch {
            view.innerHTML = '<div class="detail-card"><div class="detail-card-body"><p class="text-red-500">Invalid salary data</p></div></div>';
        }
        VaultPage.showDetailPane();
    }

    // ========================================================================
    // PAYROLL TILE
    // ========================================================================

    function _renderSalaryHistory() {
        const salaryEntries = _allLedger
            .filter(e => e.ENTRY_TYPE === 'JOURNAL' && e.JOURNAL_TYPE === 'SALARY' && e.STATUS === 'ACTIVE')
            .sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));

        if (!salaryEntries.length) {
            return `
                <div class="detail-card mb-4">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📤 Salary Payment History</h3></div>
                    <div class="detail-card-body text-center text-gray-400 text-sm py-6">No salary payments processed yet.</div>
                </div>`;
        }

        // Group by month for summary
        const monthMap = {};
        salaryEntries.forEach(e => {
            const d = e.ENTRY_DATE ? new Date(e.ENTRY_DATE) : new Date();
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthMap[key]) monthMap[key] = { total: 0, count: 0 };
            monthMap[key].total += (+e.DEBIT || 0);
            monthMap[key].count += 1;
        });

        const recentMonths = Object.entries(monthMap).sort().reverse().slice(0, 6);

        // Extract staff name from narration (format: "Salary YYYY-MM - Name - ₹amount")
        function _extractName(narration) {
            const m = (narration || '').match(/Salary \d{4}-\d{2} - (.+?) - ₹/);
            return m ? m[1] : narration;
        }

        return `
            <div class="detail-card mb-4">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">📤 Salary Payment History</h3>
                    <span class="text-xs text-gray-500">${salaryEntries.length} payments</span>
                </div>
                <div class="detail-card-body">
                    <!-- Monthly summary -->
                    <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                        ${recentMonths.map(([month, data]) => `
                            <div class="border rounded-lg p-2 text-center bg-green-50">
                                <div class="text-xs text-gray-500">${month}</div>
                                <div class="text-sm font-bold text-green-700">₹${data.total.toFixed(2)}</div>
                                <div class="text-xs text-gray-400">${data.count} emp</div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Recent payments list -->
                    <div class="text-xs">
                        <div class="font-semibold text-gray-600 mb-2">Recent Payments</div>
                        <div class="space-y-1 max-h-64 overflow-y-auto">
                            ${salaryEntries.slice(0, 20).map(e => {
                                const staffName = _extractName(e.NARRATION);
                                return `<div class="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                                    <div>
                                        <span class="font-medium text-gray-700">${staffName}</span>
                                        <span class="text-gray-400 ml-1">${e.CODE || ''}</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="font-medium text-green-700">₹${(+e.DEBIT||0).toFixed(2)}</span>
                                        <span class="text-gray-400 ml-2">${e.ENTRY_DATE ? _fmt(e.ENTRY_DATE, 'date') : ''}</span>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    function _renderPayrollDashboard() {
        const view = document.getElementById('vaultDetailView');
        const activeStaff = _allStaff.filter(s => s.STATUS === 'Active');
        const totalStaff = _allStaff.length;
        const onLeave = _allStaff.filter(s => s.STATUS === 'On Leave').length;
        const branches = [...new Set(_allStaff.map(s => s.BRANCH).filter(Boolean))];
        const withSalary = activeStaff.filter(s => _getSalaryForStaff(s.STAFF_CODE));
        const totalPayroll = withSalary.reduce((sum, s) => {
            const sal = _getSalaryForStaff(s.STAFF_CODE);
            try { const d = JSON.parse(sal.NARRATION || '{}'); return sum + (d.net || 0); }
            catch { return sum; }
        }, 0);

        // Last 30 days attendance summary
        const now = Date.now();
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        const recentAttendance = _allAttendance.filter(a =>
            a.ATTEN_DATE && a.ATTEN_DATE >= thirtyDaysAgo
        );
        const presentCount = recentAttendance.filter(a => a.STATUS === 'Present' || !a.STATUS).length;

        view.innerHTML = `
            <!-- KPI Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-6">
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div class="text-xs text-gray-500 uppercase font-semibold">Total Employees</div>
                    <div class="text-2xl font-bold text-gray-800 mt-1">${totalStaff}</div>
                </div>
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div class="text-xs text-gray-500 uppercase font-semibold">Active</div>
                    <div class="text-2xl font-bold text-green-600 mt-1">${activeStaff.length}</div>
                </div>
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div class="text-xs text-gray-500 uppercase font-semibold">Salaries Set</div>
                    <div class="text-2xl font-bold text-indigo-600 mt-1">${withSalary.length}/${activeStaff.length}</div>
                </div>
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div class="text-xs text-gray-500 uppercase font-semibold">Monthly Payroll</div>
                    <div class="text-2xl font-bold text-orange-600 mt-1">₹${totalPayroll.toFixed(2)}</div>
                </div>
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div class="text-xs text-gray-500 uppercase font-semibold">Attendance (30d)</div>
                    <div class="text-2xl font-bold text-blue-600 mt-1">${presentCount}</div>
                </div>
            </div>

            <!-- Salary Actions -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div class="detail-card">
                    <div class="detail-card-header flex justify-between items-center">
                        <h3 class="font-semibold text-gray-700">💰 Salary Structures</h3>
                        <span class="text-xs text-gray-500">${withSalary.length} defined</span>
                    </div>
                    <div class="detail-card-body">
                        ${withSalary.length ? `
                        <div class="space-y-2 text-sm">${withSalary.slice(0, 8).map(s => {
                            const sal = _getSalaryForStaff(s.STAFF_CODE);
                            try { const d = JSON.parse(sal.NARRATION || '{}'); return `<div class="flex justify-between items-center py-1 border-b last:border-0"><span>${s.STAFF_NAME}</span><span class="font-medium text-indigo-700">₹${(d.net || 0).toFixed(2)}</span></div>`; }
                            catch { return ''; }
                        }).join('')}</div>
                        ${withSalary.length > 8 ? `<p class="text-xs text-indigo-600 pt-2">+${withSalary.length - 8} more</p>` : ''}
                        ` : '<p class="text-sm text-gray-400 text-center py-4">No salaries defined yet.</p>'}
                        <button onclick="VaultPayroll._showSalaryListView()" class="mt-3 w-full px-3 py-2 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200">📋 Manage Salaries</button>
                    </div>
                </div>
                <div class="detail-card">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">⚙️ Payroll Actions</h3></div>
                    <div class="detail-card-body space-y-3">
                        <button onclick="VaultPayroll._processMonthlySalary()" class="w-full p-3 bg-green-50 border border-green-200 rounded-lg text-left hover:bg-green-100 transition-colors">
                            <div class="font-semibold text-green-700">📤 Process Monthly Salary</div>
                            <div class="text-xs text-gray-500 mt-1">Creates salary entries for all employees with defined salaries</div>
                        </button>
                        <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div class="font-semibold text-blue-700 text-sm">ℹ️ How it works</div>
                            <div class="text-xs text-gray-500 mt-1 space-y-1">
                                <p>1. Set each employee's monthly salary (earnings - deductions)</p>
                                <p>2. Click "Process Monthly Salary" at month end</p>
                                <p>3. System creates one ledger entry per employee recording the expense</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Recent Salary Payments -->
            ${_renderSalaryHistory()}

            <!-- Branch-wise Staff Count -->
            <div class="detail-card mb-4">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">Branch-wise Strength</h3></div>
                <div class="detail-card-body">
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        ${branches.map(b => {
                            const count = _allStaff.filter(s => s.BRANCH === b).length;
                            const active = _allStaff.filter(s => s.BRANCH === b && s.STATUS === 'Active').length;
                            return `<div class="border rounded-lg p-3 text-center">
                                <div class="text-xs text-gray-500">${b}</div>
                                <div class="text-lg font-bold text-gray-800">${count}</div>
                                <div class="text-xs text-green-600">${active} active</div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>`;
    }

    function _showSalaryListView() {
        _injectListPane('Search employee name or code…');
        document.getElementById('vaultSearch').oninput = (e) => {
            const q = (e.target?.value || '').toLowerCase();
            const ul = document.getElementById('vaultList');
            if (!ul) return;
            const filtered = _allStaff.filter(s => s.STATUS === 'Active' && (
                (s.STAFF_NAME || '').toLowerCase().includes(q) ||
                (s.STAFF_CODE || '').toLowerCase().includes(q)
            ));
            if (!filtered.length) {
                ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No matching employees.</li>';
                return;
            }
            ul.innerHTML = filtered.map(s => {
                const sal = _getSalaryForStaff(s.STAFF_CODE);
                const status = sal ? `<span class="text-green-600">✅ Set</span>` : `<span class="text-gray-400">Not set</span>`;
                return `<li data-code="${s.STAFF_CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors" onclick="VaultPayroll._openSalaryForm('${s.STAFF_CODE}')">
                    <strong class="text-gray-800 block text-sm">${s.STAFF_NAME}</strong>
                    <span class="text-xs text-gray-500">${s.STAFF_CODE} · ${s.BRANCH || ''} · ${status}</span>
                </li>`;
            }).join('');
        };
        _renderSalaryList();
        // Show detail with instructions
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">💰 Salary Setup</h3></div>
                <div class="detail-card-body text-sm text-gray-600 space-y-2">
                    <p>Select an employee from the list to set their monthly salary.</p>
                    <p>Enter their earnings (Basic, HRA, etc.) and deductions (PF, ESI, TDS). The net amount is auto-calculated.</p>
                </div>
            </div>`;
        VaultPage.showDetailPane();
        document.getElementById('vaultListPane').style.display = 'flex';
    }

    // ========================================================================
    // LOAD
    // ========================================================================

    function _printEmployee(staffCode) {
        const staff = _allStaff.find(s => s.STAFF_CODE === staffCode);
        if (staff) VaultPrint.printEmployee(staff);
    }

    function search() {
        if (_activeTile === 'employees') _renderList();
    }

    async function load() {
        const data = await getAppData();
        if (!data) return;

        _allStaff = Object.values(data.STAFF || {});
        _allAttendance = Object.values(data.ATTENDANCE || {});
        _allBranches = Object.values(data.BRANCHES || {});
        _allLedger = Object.values(data.LEDGER || {});
        _loadSalaryStructures();

        _injectListPane('Search name, code, department…');

        // Wire search input
        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();

        if (_activeTile === 'employees') {
            _renderList();
            document.getElementById('vaultAddBtn').classList.add('hidden');
        } else if (_activeTile === 'payroll') {
            document.getElementById('vaultListPane').style.display = 'none';
            document.getElementById('vaultAddBtn').classList.add('hidden');
            document.getElementById('vaultDetailPane').style.display = 'block';
            VaultPage.showDetail(true);
            _renderPayrollDashboard();
            VaultPage.showDetailPane();
        }
    }

    function setTile(tile) { _activeTile = tile; }

    return { load, search, setTile, _openSalaryForm, _calcNet, _processMonthlySalary, _showSalaryListView, _printEmployee };
})();

window.VaultPayroll = VaultPayroll;
