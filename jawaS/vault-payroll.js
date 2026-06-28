// ============================================================================
// VAULT-PAYROLL.JS — Employee management + Payroll dashboard + Payslips
// Tiles: employees, payroll
// Data sources:
//   Employees:      IDB STAFF (list) + IDB LEDGER (balances by STAFF_CODE)
//   Payslips:       IDB HEADER (DOX_TYPE === 'Payslip')
//   Salary structs: IDB LEDGER (legacy JOURNAL + JOURNAL_TYPE='SALARY_STRUCTURE')
//   Payroll dashbd: Computed from STAFF + LEDGER
// ============================================================================

const VaultPayroll = (() => {

    let _allStaff = [];
    let _allAttendance = [];
    let _allBranches = [];
    let _allLedger = [];
    let _allPayslips = [];
    let _balanceCache = {};
    let _activeTile = 'employees';

    function _can(role) { return window.VaultPage?.can(role); }
    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    function _toDateStr(ts) {
        if (!ts) return '—';
        try {
            const d = new Date(ts);
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (_) { return '—'; }
    }

    function _fmtAmt(v) {
        return '₹' + (parseFloat(v) || 0).toFixed(2);
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

    // ══════════════════════════════════════════════════════════════════════════
    // EMPLOYEE BALANCE COMPUTATION (from LEDGER + BAL_LAST_FY)
    // ══════════════════════════════════════════════════════════════════════════

    function _computeEmployeeBalances() {
        _balanceCache = {};
        (_allLedger || []).forEach(e => {
            if (!e.STAFF_CODE) return;
            const debit = +(e.DEBIT || 0);
            const credit = +(e.CREDIT || 0);
            if (!_balanceCache[e.STAFF_CODE]) _balanceCache[e.STAFF_CODE] = 0;
            _balanceCache[e.STAFF_CODE] += (debit - credit);
        });
    }

    function _getDisplayBalance(staffEntry) {
        const opening = +(staffEntry?.BAL_LAST_FY || 0);
        const running = _balanceCache[staffEntry?.STAFF_CODE] || 0;
        return opening + running;
    }

    function _getStaffLedgerEntries(staffCode) {
        return (_allLedger || []).filter(e => e.STAFF_CODE === staffCode)
            .sort((a, b) => ((a.IO_TIMESTAMP || '') > (b.IO_TIMESTAMP || '') ? 1 : -1));
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
        ul.innerHTML = sorted.map(s => {
            const bal = _getDisplayBalance(s);
            const balClass = bal >= 0 ? 'text-red-600' : 'text-green-600'; // positive = owes money (Dr)
            const balStr = bal !== 0 ? `<span class="${balClass} text-xs font-medium">${_fmtAmt(Math.abs(bal))} ${bal >= 0 ? 'Dr' : 'Cr'}</span>` : '';
            return `<li data-code="${s.STAFF_CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <div>
                        <strong class="text-gray-800 block text-sm">${s.STAFF_NAME || 'N/A'}</strong>
                        <span class="text-xs text-gray-500">${s.STAFF_CODE || ''} · ${s.BRANCH || ''} · ${s.DEPARTMENT || ''}</span>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        ${_statusBadge(s.STATUS)}
                        ${balStr}
                    </div>
                </div>
                <div class="mt-1">${_roleBadge(s.ROLE)}</div>
                ${s.MOBILE ? `<div class="text-xs text-gray-400 mt-1">📞 ${s.MOBILE}</div>` : ''}
            </li>`;
        }).join('');
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
        const bal = _getDisplayBalance(staff);
        const balClass = bal >= 0 ? 'text-red-600' : 'text-green-600';
        const ledgerEntries = _getStaffLedgerEntries(staff.STAFF_CODE);

        const statementRows = ledgerEntries.slice(-20).map(e => {
            const debit = +(e.DEBIT || 0);
            const credit = +(e.CREDIT || 0);
            return `<tr class="border-b border-gray-100 hover:bg-gray-50/50">
                <td class="py-1.5 px-2 text-xs text-gray-500">${_toDateStr(e.IO_TIMESTAMP)}</td>
                <td class="py-1.5 px-2 text-xs text-gray-600">${_escapeHtml(e.NARRATION || '')}</td>
                <td class="py-1.5 px-2 text-right text-xs text-green-700">${debit ? _fmtAmt(debit) : '—'}</td>
                <td class="py-1.5 px-2 text-right text-xs text-red-700">${credit ? _fmtAmt(credit) : '—'}</td>
            </tr>`;
        }).join('');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h3 class="font-semibold text-gray-700">👤 Employee Detail</h3>
                    <div class="flex gap-2 items-center">
                        ${_statusBadge(staff.STATUS)}
                        <span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-${bal >= 0 ? 'red' : 'green'}-100 text-${bal >= 0 ? 'red' : 'green'}-700">${_fmtAmt(Math.abs(bal))} ${bal >= 0 ? 'Dr' : 'Cr'}</span>
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
                        <div><span class="text-gray-500">DOB:</span> ${staff.DATE_BIRTH ? _fmt(staff.DATE_BIRTH, 'date') : 'N/A'}</div>
                        <div><span class="text-gray-500">DOJ:</span> ${staff.DATE_JOIN ? _fmt(staff.DATE_JOIN, 'date') : 'N/A'}</div>
                        ${staff.DATE_LEAVE ? `<div><span class="text-gray-500">DOL:</span> ${_fmt(staff.DATE_LEAVE, 'date')}</div>` : ''}
                        <div><span class="text-gray-500">Gender:</span> ${staff.GENDER || 'N/A'}</div>
                        <div><span class="text-gray-500">Blood Group:</span> ${staff.BLOOD_GROUP || 'N/A'}</div>
                        <div><span class="text-gray-500">PAN:</span> ${staff.PAN_NUM || 'N/A'}</div>
                        <div><span class="text-gray-500">Aadhaar:</span> ${staff.ADHAR_NUM || 'N/A'}</div>
                        <div><span class="text-gray-500">EPF:</span> ${staff.EPF_UID || 'N/A'}</div>
                        <div><span class="text-gray-500">ESI:</span> ${staff.ESI_UID || 'N/A'}</div>
                        <div><span class="text-gray-500">UAN:</span> ${staff.UAN || 'N/A'}</div>
                        <div><span class="text-gray-500">Emergency:</span> ${staff.EMERGENCY_CONTACT || 'N/A'}</div>
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

                    <!-- Balance & Recent Transactions -->
                    ${ledgerEntries.length ? `
                    <div class="mt-6 border-t pt-4">
                        <h4 class="text-sm font-semibold text-gray-700 mb-3">📊 Recent Transactions</h4>
                        <div class="overflow-hidden border border-gray-100 rounded-lg">
                            <table class="min-w-full text-xs">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="py-2 px-2 text-left font-bold text-gray-500 uppercase">Date</th>
                                        <th class="py-2 px-2 text-left font-bold text-gray-500 uppercase">Narration</th>
                                        <th class="py-2 px-2 text-right font-bold text-green-600 uppercase">Debit</th>
                                        <th class="py-2 px-2 text-right font-bold text-red-600 uppercase">Credit</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white">${statementRows}</tbody>
                            </table>
                        </div>
                        ${ledgerEntries.length > 20 ? `<p class="text-xs text-gray-400 mt-2">Showing last 20 of ${ledgerEntries.length} entries</p>` : ''}
                    </div>` : ''}
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    // ========================================================================
    // SALARY STRUCTURE (stored in LEDGER — legacy, keep until Manager.io)
    // ========================================================================

    let _salaryStructures = [];

    function _loadSalaryStructures() {
        _salaryStructures = (_allLedger || []).filter(e => e.ENTRY_TYPE === 'JOURNAL' && e.JOURNAL_TYPE === 'SALARY_STRUCTURE' && e.STATUS === 'ACTIVE');
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
                if (existingData && existingData.entry_id) {
                    alert('Coming soon — managing salary structures through Manager.io');
                    return;
                }
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
        const month = new Date().toISOString().substring(0, 7);
        if (!confirm(`Process salary for ${month}? This will create ledger entries for ${withSalary.length} employees.`)) return;
        alert('Coming soon — processing payroll through Manager.io');
    }

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
    // PAYROLL TILE — Dashboard + Payslip List
    // ========================================================================

    // ── Payslip list from HEADER ──────────────────────────────────────────────
    function _renderPayslipList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;

        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase();
        const filtered = _allPayslips.filter(e => {
            if (!q) return true;
            return (e.DOX_REF || '').toLowerCase().includes(q) ||
                   (e.B2B || '').toLowerCase().includes(q);
        }).sort((a, b) => ((b.IO_TIMESTAMP || '') > (a.IO_TIMESTAMP || '') ? 1 : -1));

        if (!filtered.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No payslips found.</li>';
            return;
        }

        ul.innerHTML = filtered.map(e => `
            <li data-key="${e.DOX_KEY}" class="p-3 rounded-lg cursor-pointer hover:bg-green-50 border border-gray-200 transition-colors">
                <div class="flex items-start justify-between">
                    <strong class="text-green-700 block text-sm flex-1 min-w-0 truncate">🧾 ${e.DOX_REF || 'N/A'} — ${e.B2B || 'N/A'}</strong>
                    <span class="text-xs font-semibold text-green-700 shrink-0 ml-2">${_fmtAmt(e.AMOUNT)}</span>
                </div>
                <div class="flex justify-between mt-1">
                    <span class="text-xs text-gray-500">${_toDateStr(e.IO_TIMESTAMP)} · ${e.BRANCH || ''}</span>
                </div>
            </li>
        `).join('');

        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
                li.classList.add('selected');
                _renderPayslipDetail(li.dataset.key);
            })
        );
    }

    function _renderPayslipDetail(key) {
        const entry = _allPayslips.find(e => e.DOX_KEY === key);
        if (!entry) return;

        VaultPage.showDetail(true);
        const view = document.getElementById('vaultDetailView');

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-body p-6 space-y-6">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b border-gray-100 pb-5">
                        <div>
                            <h1 class="text-xl font-bold text-green-800 tracking-tight">Payslip</h1>
                            <p class="text-xs text-gray-500 mt-1">Branch: <span class="font-semibold text-gray-700">${entry.BRANCH || 'N/A'}</span></p>
                        </div>
                        <div class="flex flex-col items-start sm:items-end gap-2">
                            <span class="text-xl font-bold text-green-700">${_fmtAmt(entry.AMOUNT)}</span>
                            <p class="text-sm text-gray-500">Ref #: <span class="font-bold text-gray-800">${entry.DOX_REF || 'N/A'}</span></p>
                            <p class="text-xs text-gray-400">Date: ${_toDateStr(entry.IO_TIMESTAMP)}</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm">
                        <div>
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Employee</h3>
                            <p class="font-semibold text-gray-800">${entry.B2B || 'N/A'}</p>
                        </div>
                        <div>
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Details</h3>
                            <p class="text-gray-600">Net Pay: <span class="font-bold text-green-700">${_fmtAmt(entry.AMOUNT)}</span></p>
                        </div>
                    </div>

                    <!-- General Ledger Postings -->
                    <details class="text-xs border border-slate-100 rounded-xl overflow-hidden" id="glPostingsDetails">
                        <summary class="cursor-pointer font-semibold text-gray-600 bg-slate-50 px-4 py-3 hover:bg-slate-100 transition-colors select-none">
                            📒 General Ledger Postings
                        </summary>
                        <div id="glPostingsContent" class="p-3 text-gray-400 text-xs">Loading…</div>
                    </details>

                    <script>(async function() {
                        try {
                            const ledgerRaw = await window.appDB?.getSheet('LEDGER');
                            const glEntries = Object.values(ledgerRaw || {}).filter(e => e.DOX_KEY === '${key}');
                            if (!glEntries.length) {
                                document.getElementById('glPostingsContent').innerHTML = '<p class="text-gray-400">No ledger entries found.</p>';
                                return;
                            }
                            glEntries.sort((a,b) => (a.IO_TIMESTAMP || '').localeCompare(b.IO_TIMESTAMP || ''));
                            const rows = glEntries.map(e => '<tr class=\"border-b border-slate-50\">' +
                                '<td class=\"py-1.5 px-2 text-gray-700\">' + (e.ACCOUNT || '—') + '</td>' +
                                '<td class=\"py-1.5 px-2 text-right text-green-700 font-medium\">' + ((+e.DEBIT||0) ? '₹'+(+e.DEBIT).toFixed(2) : '—') + '</td>' +
                                '<td class=\"py-1.5 px-2 text-right text-red-700 font-medium\">' + ((+e.CREDIT||0) ? '₹'+(+e.CREDIT).toFixed(2) : '—') + '</td>' +
                                '<td class=\"py-1.5 px-2 text-gray-500 text-[10px]\">' + (e.NARRATION || '') + '</td>' +
                                '</tr>').join('');
                            document.getElementById('glPostingsContent').innerHTML =
                                '<table class=\"w-full text-[11px]\"><thead><tr class=\"bg-slate-100 text-gray-500 font-semibold uppercase tracking-wider\">' +
                                '<th class=\"py-2 px-2 text-left\">Account</th><th class=\"py-2 px-2 text-right\">Debit</th>' +
                                '<th class=\"py-2 px-2 text-right\">Credit</th><th class=\"py-2 px-2 text-left\">Narration</th>' +
                                '</tr></thead><tbody>' + rows + '</tbody></table>';
                        } catch(glErr) {
                            document.getElementById('glPostingsContent').innerHTML = '<p class=\"text-red-500\">Failed to load GL postings.</p>';
                            console.error('GL postings error:', glErr);
                        }
                    })();</script>
                </div>
            </div>`;
        VaultPage.showDetailPane();
    }

    function _showPayslipListView() {
        _injectListPane('Search payslip ref, employee…');
        document.getElementById('vaultSearch').oninput = () => _renderPayslipList();
        _renderPayslipList();
    }

    // ── Salary history (from legacy LEDGER) ──────────────────────────────────
    function _renderSalaryHistory() {
        const salaryEntries = (_allLedger || [])
            .filter(e => e.ENTRY_TYPE === 'JOURNAL' && e.JOURNAL_TYPE === 'SALARY' && e.STATUS === 'ACTIVE')
            .sort((a, b) => (b.TIME_STAMP || 0) - (a.TIME_STAMP || 0));

        if (!salaryEntries.length) {
            return `
                <div class="detail-card mb-4">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📤 Salary Payment History</h3></div>
                    <div class="detail-card-body text-center text-gray-400 text-sm py-6">No salary payments processed yet.</div>
                </div>`;
        }

        const monthMap = {};
        salaryEntries.forEach(e => {
            const d = e.ENTRY_DATE ? new Date(e.ENTRY_DATE) : new Date();
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthMap[key]) monthMap[key] = { total: 0, count: 0 };
            monthMap[key].total += (+e.DEBIT || 0);
            monthMap[key].count += 1;
        });

        const recentMonths = Object.entries(monthMap).sort().reverse().slice(0, 6);

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
                    <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                        ${recentMonths.map(([month, data]) => `
                            <div class="border rounded-lg p-2 text-center bg-green-50">
                                <div class="text-xs text-gray-500">${month}</div>
                                <div class="text-sm font-bold text-green-700">₹${data.total.toFixed(2)}</div>
                                <div class="text-xs text-gray-400">${data.count} emp</div>
                            </div>`).join('')}
                    </div>
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

    // ── Payroll Dashboard ────────────────────────────────────────────────────
    function _renderPayrollDashboard() {
        const view = document.getElementById('vaultDetailView');
        const activeStaff = _allStaff.filter(s => s.STATUS === 'Active');
        const totalStaff = _allStaff.length;
        const branches = [...new Set(_allStaff.map(s => s.BRANCH).filter(Boolean))];
        const withSalary = activeStaff.filter(s => _getSalaryForStaff(s.STAFF_CODE));
        const totalPayroll = withSalary.reduce((sum, s) => {
            const sal = _getSalaryForStaff(s.STAFF_CODE);
            try { const d = JSON.parse(sal.NARRATION || '{}'); return sum + (d.net || 0); }
            catch { return sum; }
        }, 0);

        const payslipCount = _allPayslips.length;

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
                    <div class="text-xs text-gray-500 uppercase font-semibold">Payslips</div>
                    <div class="text-2xl font-bold text-green-600 mt-1">${payslipCount}</div>
                </div>
            </div>

            <!-- Actions -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div class="detail-card col-span-2">
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
                            <div class="text-xs text-gray-500 mt-1">Creates salary entries</div>
                        </button>
                        <button onclick="VaultPayroll._showPayslipListView()" class="w-full p-3 bg-blue-50 border border-blue-200 rounded-lg text-left hover:bg-blue-100 transition-colors">
                            <div class="font-semibold text-blue-700">🧾 View Payslips</div>
                            <div class="text-xs text-gray-500 mt-1">${payslipCount} payslips found</div>
                        </button>
                        <div class="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <div class="font-semibold text-gray-700 text-sm">ℹ️ How it works</div>
                            <div class="text-xs text-gray-500 mt-1 space-y-1">
                                <p>1. Set each employee's monthly salary</p>
                                <p>2. Click "Process Monthly Salary" at month end</p>
                                <p>3. System creates one ledger entry per employee</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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
        VaultPage.showDetail(true);
        document.getElementById('vaultDetailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700">💰 Salary Setup</h3></div>
                <div class="detail-card-body text-sm text-gray-600 space-y-2">
                    <p>Select an employee from the list to set their monthly salary.</p>
                    <p>Enter earnings (Basic, HRA, etc.) and deductions (PF, ESI, TDS). Net is auto-calculated.</p>
                </div>
            </div>`;
        VaultPage.showDetailPane();
        document.getElementById('vaultListPane').style.display = 'flex';
    }

    // ========================================================================
    // LOAD
    // ========================================================================

    function search() {
        if (_activeTile === 'employees') _renderList();
    }

    async function load() {
        const data = await getAppData();
        if (!data) return;

        const activeBranch = VaultPage.getActiveBranch();
        const rawStaff = Object.values(data.STAFF || {});
        _allStaff = rawStaff.filter(s =>
            !activeBranch || (s.BRANCH || '').toLowerCase() === activeBranch.toLowerCase()
        );
        _allAttendance = Object.values(data.ATTENDANCE || {});
        _allBranches = Object.values(data.BRANCHES || {});
        _allLedger = Object.values(data.LEDGER || {});
        _loadSalaryStructures();
        _computeEmployeeBalances();

        // Load payslips from HEADER
        try {
            if (window.appDB) {
                const raw = await window.appDB.getSheet('HEADER');
                const activeBranch = VaultPage.getActiveBranch();
                _allPayslips = Object.values(raw || {}).filter(h =>
                    h.DOX_TYPE === 'Payslip' &&
                    (!activeBranch || (h.BRANCH || '').toLowerCase() === activeBranch.toLowerCase())
                );
            } else {
                _allPayslips = [];
            }
        } catch (err) {
            console.error('[VaultPayroll] Failed to load payslips:', err);
            _allPayslips = [];
        }

        if (_activeTile === 'employees') {
            _injectListPane('Search name, code, department…');
            const searchInput = document.getElementById('vaultSearch');
            if (searchInput) searchInput.oninput = () => search();
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

    return { load, search, setTile, _openSalaryForm, _calcNet, _processMonthlySalary, _showSalaryListView };
})();

window.VaultPayroll = VaultPayroll;
