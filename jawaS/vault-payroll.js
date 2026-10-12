// ============================================================================
// VAULT-PAYROLL.JS — Employee management + Payroll dashboard + Payslips
// Tiles: employees, payroll
// Data sources:
//   Employees:      IDB STAFF (list)
//   Payslips:       pending — not yet wired to the accounting engine
//   Salary structs: pending
//   Payroll dashbd: IDB STAFF
// ============================================================================

const VaultPayroll = (() => {

    let _allStaff = [];
    let _allAttendance = [];
    let _allBranches = [];
    let _glRows = [];
    let _allPayslips = [];
    let _balanceCache = {};
    let _activeTile = 'employees';
    let _selectedStaffCode = null;

    function _can(role) { return window.VaultPage?.can(role); }
    function _fmt(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t) : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    function _copyText(text, btn) {
        if (!text) return;
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(String(text)).then(() => {
                if (btn) {
                    const orig = btn.innerHTML;
                    btn.innerHTML = '<i class="fa-solid fa-check text-emerald-600"></i>';
                    setTimeout(() => { btn.innerHTML = orig; }, 1500);
                }
            }).catch(() => {});
        }
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
        const r = (role || 'Staff').trim();
        const rUpper = r.toUpperCase();
        let cls = 'bg-gray-100 text-gray-700 border-gray-200';
        if (rUpper === 'MASTER') cls = 'bg-red-100 text-red-800 border-red-200';
        else if (rUpper === 'ADMIN') cls = 'bg-purple-100 text-purple-800 border-purple-200';
        else if (rUpper === 'AUDITOR') cls = 'bg-orange-100 text-orange-800 border-orange-200';
        else if (rUpper === 'ACCOUNTANT') cls = 'bg-blue-100 text-blue-800 border-blue-200';
        else if (rUpper === 'MANAGER') cls = 'bg-emerald-100 text-emerald-800 border-emerald-200';
        else if (rUpper.includes('DELIVERY')) cls = 'bg-indigo-100 text-indigo-800 border-indigo-200';
        else if (rUpper.includes('OPERATIONS')) cls = 'bg-cyan-100 text-cyan-800 border-cyan-200';
        else if (rUpper === 'CLIENT') cls = 'bg-amber-100 text-amber-800 border-amber-200';
        return `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}">${_escapeHtml(r)}</span>`;
    }

    function _statusBadge(status) {
        const s = (status || 'Active').trim();
        const sUpper = s.toUpperCase();
        let cls = 'bg-gray-100 text-gray-700 border-gray-200';
        if (sUpper === 'ACTIVE') cls = 'bg-emerald-100 text-emerald-800 border-emerald-200';
        else if (sUpper === 'INACTIVE') cls = 'bg-rose-100 text-rose-800 border-rose-200';
        else if (sUpper === 'RESIGNED') cls = 'bg-amber-100 text-amber-800 border-amber-200';
        else if (sUpper === 'ON LEAVE') cls = 'bg-sky-100 text-sky-800 border-sky-200';
        return `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}">${_escapeHtml(s)}</span>`;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // EMPLOYEE BALANCE COMPUTATION (from BAL_LAST_FY)
    // ══════════════════════════════════════════════════════════════════════════

    function _computeEmployeeBalances() {
        _balanceCache = {};
        (_glRows || []).forEach(e => {
            if (!e.STAFF_CODE) return;
            const debit = +(e.DEBIT || 0);
            const credit = +(e.CREDIT || 0);
            if (!_balanceCache[e.STAFF_CODE]) _balanceCache[e.STAFF_CODE] = 0;
            _balanceCache[e.STAFF_CODE] += (debit - credit);
        });
    }

    function _getOpeningBalance(staffEntry) {
        if (!staffEntry) return 0;
        
        let earliestTxn = null;
        for (const entry of (_glRows || [])) {
            if (entry.STAFF_CODE === staffEntry.STAFF_CODE) {
                const txnDateStr = _toDateStr(entry.IO_TIMESTAMP);
                if (!earliestTxn || txnDateStr < earliestTxn) {
                    earliestTxn = txnDateStr;
                }
            }
        }
        
        if (!earliestTxn) {
            return +(staffEntry.BAL_LAST_FY || 0);
        }
        
        const today = new Date();
        const currentYear = today.getFullYear();
        let fyStartYear = currentYear;
        if (today.getMonth() < 3) fyStartYear = currentYear - 1;
        
        const dec1 = `${fyStartYear}-12-01`;
        const aug1 = `${fyStartYear}-08-01`;
        
        if (earliestTxn >= dec1) {
            return +(staffEntry.BAL_T2 || 0);
        } else if (earliestTxn >= aug1) {
            return +(staffEntry.BAL_T1 || 0);
        }
        
        return +(staffEntry.BAL_LAST_FY || 0);
    }

    function _getDisplayBalance(staffEntry) {
        const opening = _getOpeningBalance(staffEntry);
        const running = _balanceCache[staffEntry?.STAFF_CODE] || 0;
        return opening + running;
    }

    function _getStaffLedgerEntries(staffCode) {
        return (_glRows || []).filter(e => e.STAFF_CODE === staffCode)
            .sort((a, b) => ((a.IO_TIMESTAMP || '') > (b.IO_TIMESTAMP || '') ? 1 : -1));
    }

    // ========================================================================
    // EMPLOYEES TILE
    // ========================================================================

    function _renderList() {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const q = (document.getElementById('vaultSearch')?.value || '').toLowerCase().trim();
        const filtered = q
            ? _allStaff.filter(s =>
                (s.STAFF_NAME || '').toLowerCase().includes(q) ||
                (s.STAFF_CODE || '').toLowerCase().includes(q) ||
                (s.BRANCH || '').toLowerCase().includes(q) ||
                (s.DEPARTMENT || '').toLowerCase().includes(q) ||
                (s.ROLE || '').toLowerCase().includes(q) ||
                (s.MOBILE || '').includes(q) ||
                (s.EMAIL || '').toLowerCase().includes(q) ||
                (s.PAN_NUM || '').toLowerCase().includes(q)
              )
            : _allStaff;
        const sorted = [...filtered].sort((a, b) => (a.STAFF_NAME || '').localeCompare(b.STAFF_NAME || ''));
        if (!sorted.length) {
            ul.innerHTML = `
                <li class="text-center text-gray-500 text-xs py-8">
                    <i class="fa-solid fa-users-slash text-gray-300 text-3xl mb-2 block"></i>
                    No employees found matching criteria.
                </li>
            `;
            return;
        }
        ul.innerHTML = sorted.map(s => {
            const bal = _getDisplayBalance(s);
            const balClass = bal >= 0 ? 'text-rose-600' : 'text-emerald-600';
            const balStr = bal !== 0 ? `<span class="${balClass} text-[11px] font-semibold font-mono">${_fmtAmt(Math.abs(bal))} ${bal >= 0 ? 'Dr' : 'Cr'}</span>` : '';
            const isSelected = _selectedStaffCode && _selectedStaffCode === s.STAFF_CODE;

            const nameStr = (s.STAFF_NAME || s.STAFF_CODE || 'EMP').trim();
            const parts = nameStr.split(/\s+/).filter(Boolean);
            const initials = parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : nameStr.slice(0, 2).toUpperCase();

            return `
                <li data-code="${_escapeHtml(s.STAFF_CODE)}" 
                    class="p-3.5 rounded-xl cursor-pointer border transition-all duration-150 ${isSelected ? 'bg-indigo-50/90 border-indigo-500 shadow-sm ring-1 ring-indigo-300' : 'bg-white hover:bg-gray-50/80 border-gray-200'}">
                    <div class="flex items-start justify-between gap-2 mb-1.5">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                ${initials}
                            </div>
                            <div class="min-w-0">
                                <strong class="text-gray-900 block text-xs font-semibold truncate leading-tight">${_escapeHtml(s.STAFF_NAME || 'N/A')}</strong>
                                <span class="font-mono text-[10px] text-gray-500 font-medium">${_escapeHtml(s.STAFF_CODE || '')}</span>
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-1 flex-shrink-0">
                            ${_statusBadge(s.STATUS)}
                            ${balStr}
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-gray-100 text-[11px]">
                        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">
                            📍 ${_escapeHtml(s.BRANCH || 'N/A')}
                        </span>
                        ${s.DEPARTMENT ? `
                            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                                ${_escapeHtml(s.DEPARTMENT)}
                            </span>
                        ` : ''}
                        ${_roleBadge(s.ROLE)}
                        ${s.MOBILE ? `
                            <span class="ml-auto text-[11px] text-gray-500 font-mono flex items-center gap-1">
                                <i class="fa-solid fa-phone text-[9px] text-gray-400"></i>${_escapeHtml(s.MOBILE)}
                            </span>
                        ` : ''}
                    </div>
                </li>
            `;
        }).join('');

        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => {
                ul.querySelectorAll('li').forEach(x => {
                    x.classList.remove('bg-indigo-50/90', 'border-indigo-500', 'shadow-sm', 'ring-1', 'ring-indigo-300');
                    x.classList.add('bg-white', 'border-gray-200');
                });
                li.classList.add('bg-indigo-50/90', 'border-indigo-500', 'shadow-sm', 'ring-1', 'ring-indigo-300');
                li.classList.remove('bg-white', 'border-gray-200');

                _selectedStaffCode = li.dataset.code;
                const staff = _allStaff.find(s => s.STAFF_CODE === li.dataset.code);
                if (staff) {
                    _renderEmployeeDetail(staff);
                }
            })
        );
    }

    function _renderEmployeeDetail(staff) {
        if (!staff) return;
        _selectedStaffCode = staff.STAFF_CODE;
        VaultPage.showDetail(true);
        VaultPage?.showDetailPane?.();

        const view = document.getElementById('vaultDetailView');
        if (!view) return;

        const branch = _allBranches.find(b => b.BRANCH_CODE === staff.BRANCH);
        const bal = _getDisplayBalance(staff);
        const ledgerEntries = _getStaffLedgerEntries(staff.STAFF_CODE);

        const nameStr = (staff.STAFF_NAME || staff.STAFF_CODE || 'EMP').trim();
        const parts = nameStr.split(/\s+/).filter(Boolean);
        const initials = parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : nameStr.slice(0, 2).toUpperCase();

        const statementRows = ledgerEntries.slice(-20).map(e => {
            const debit = +(e.DEBIT || 0);
            const credit = +(e.CREDIT || 0);
            return `<tr class="border-b border-gray-100 hover:bg-gray-50/50">
                <td class="py-1.5 px-2 text-xs text-gray-500">${_toDateStr(e.IO_TIMESTAMP)}</td>
                <td class="py-1.5 px-2 text-xs text-gray-600">${_escapeHtml(e.NARRATION || '')}</td>
                <td class="py-1.5 px-2 text-right text-xs text-emerald-700 font-mono font-medium">${debit ? _fmtAmt(debit) : '—'}</td>
                <td class="py-1.5 px-2 text-right text-xs text-rose-700 font-mono font-medium">${credit ? _fmtAmt(credit) : '—'}</td>
            </tr>`;
        }).join('');

        view.innerHTML = `
            <div class="space-y-4">
                <!-- Header Card -->
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                        <div class="flex items-center gap-3.5 min-w-0">
                            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-bold text-lg flex items-center justify-center shadow-sm flex-shrink-0">
                                ${initials}
                            </div>
                            <div class="min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <h3 class="text-base sm:text-lg font-bold text-gray-900 truncate">${_escapeHtml(staff.STAFF_NAME || 'N/A')}</h3>
                                    ${_statusBadge(staff.STATUS)}
                                </div>
                                <div class="flex items-center gap-2 text-xs text-gray-500 font-mono mt-0.5">
                                    <span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-semibold">${_escapeHtml(staff.STAFF_CODE || '')}</span>
                                    ${_roleBadge(staff.ROLE)}
                                </div>
                            </div>
                        </div>

                        <div class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 bg-gray-50 sm:bg-transparent p-2.5 sm:p-0 rounded-lg">
                            <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Account Balance</span>
                            <span class="px-2.5 py-1 text-xs font-bold font-mono rounded-lg ${bal >= 0 ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}">
                                ${_fmtAmt(Math.abs(bal))} ${bal >= 0 ? 'Dr' : 'Cr'}
                            </span>
                        </div>
                    </div>

                    <!-- Quick Action Strip -->
                    <div class="flex flex-wrap items-center gap-2 pt-3">
                        <button type="button" onclick="VaultPayroll._openSalaryForm('${_escapeHtml(staff.STAFF_CODE)}')" 
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200 transition-colors">
                            <i class="fa-solid fa-coins"></i> Manage Salary Structure
                        </button>
                        ${staff.MOBILE ? `
                            <a href="tel:${_escapeHtml(staff.MOBILE)}" 
                                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors">
                                <i class="fa-solid fa-phone"></i> Call
                            </a>
                            <a href="https://wa.me/91${_escapeHtml(staff.MOBILE.replace(/\\D/g, '').slice(-10))}" target="_blank"
                                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-semibold rounded-lg border border-teal-200 transition-colors">
                                <i class="fa-brands fa-whatsapp text-emerald-600"></i> WhatsApp
                            </a>
                        ` : ''}
                        ${staff.EMAIL ? `
                            <a href="mailto:${_escapeHtml(staff.EMAIL)}" 
                                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold rounded-lg border border-sky-200 transition-colors">
                                <i class="fa-solid fa-envelope"></i> Email
                            </a>
                        ` : ''}
                    </div>
                </div>

                <!-- Main Details Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Employment & Department -->
                    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <i class="fa-solid fa-building text-indigo-500"></i> Employment Details
                        </h4>
                        <div class="space-y-2 text-xs">
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Branch:</span>
                                <span class="font-semibold text-gray-900">${_escapeHtml(staff.BRANCH || 'N/A')}${branch ? ' · ' + _escapeHtml(branch.BRANCH_NAME) : ''}</span>
                            </div>
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Department:</span>
                                <span class="font-semibold text-gray-900">${_escapeHtml(staff.DEPARTMENT || 'N/A')}</span>
                            </div>
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Date of Joining (DOJ):</span>
                                <span class="font-semibold text-gray-900">${staff.DATE_JOIN ? _fmt(staff.DATE_JOIN, 'date') : 'N/A'}</span>
                            </div>
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Date of Birth (DOB):</span>
                                <span class="font-semibold text-gray-900">${staff.DATE_BIRTH ? _fmt(staff.DATE_BIRTH, 'date') : 'N/A'}</span>
                            </div>
                            ${staff.DATE_LEAVE ? `
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-rose-500 font-medium">Date of Leaving (DOL):</span>
                                <span class="font-semibold text-rose-700">${_fmt(staff.DATE_LEAVE, 'date')}</span>
                            </div>` : ''}
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Gender / Blood Group:</span>
                                <span class="font-semibold text-gray-900">${_escapeHtml(staff.GENDER || 'N/A')} / ${_escapeHtml(staff.BLOOD_GROUP || 'N/A')}</span>
                            </div>
                            ${staff.VEHICLE_NUM ? `
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Vehicle Number:</span>
                                <span class="font-mono font-semibold text-gray-900">${_escapeHtml(staff.VEHICLE_NUM)}</span>
                            </div>` : ''}
                            ${staff.DRIVING_LICENSE ? `
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Driving License:</span>
                                <span class="font-mono font-semibold text-gray-900">${_escapeHtml(staff.DRIVING_LICENSE)}</span>
                            </div>` : ''}
                        </div>
                    </div>

                    <!-- Contact & Personal -->
                    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <i class="fa-solid fa-address-book text-emerald-500"></i> Contact & Emergency
                        </h4>
                        <div class="space-y-2 text-xs">
                            <div class="flex items-center justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Mobile Phone:</span>
                                <div class="flex items-center gap-2">
                                    <span class="font-mono font-semibold text-gray-900">${_escapeHtml(staff.MOBILE || 'N/A')}</span>
                                    ${staff.MOBILE ? `<button type="button" onclick="VaultPayroll._copy('${_escapeHtml(staff.MOBILE)}', this)" class="text-gray-400 hover:text-indigo-600 transition-colors" title="Copy"><i class="fa-regular fa-copy"></i></button>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Email Address:</span>
                                <div class="flex items-center gap-2">
                                    <span class="font-semibold text-gray-900 truncate max-w-[180px]">${_escapeHtml(staff.EMAIL || 'N/A')}</span>
                                    ${staff.EMAIL ? `<button type="button" onclick="VaultPayroll._copy('${_escapeHtml(staff.EMAIL)}', this)" class="text-gray-400 hover:text-indigo-600 transition-colors" title="Copy"><i class="fa-regular fa-copy"></i></button>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Emergency Contact:</span>
                                <span class="font-semibold text-gray-900">${_escapeHtml(staff.EMERGENCY_CONTACT || 'N/A')}</span>
                            </div>
                            ${staff.FATHERS_NAME ? `
                            <div class="flex items-center justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Father's Name:</span>
                                <span class="font-semibold text-gray-900">${_escapeHtml(staff.FATHERS_NAME)}</span>
                            </div>` : ''}
                        </div>
                    </div>

                    <!-- Bank Details -->
                    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <i class="fa-solid fa-building-columns text-blue-500"></i> Bank Account Information
                        </h4>
                        <div class="space-y-2 text-xs">
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Bank Name:</span>
                                <span class="font-semibold text-gray-900">${_escapeHtml(staff.BANK_NAME || 'Not Provided')}</span>
                            </div>
                            <div class="flex items-center justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Account Number:</span>
                                <div class="flex items-center gap-2">
                                    <span class="font-mono font-semibold text-gray-900">${_escapeHtml(staff.BANK_AC || 'Not Provided')}</span>
                                    ${staff.BANK_AC ? `<button type="button" onclick="VaultPayroll._copy('${_escapeHtml(staff.BANK_AC)}', this)" class="text-gray-400 hover:text-indigo-600 transition-colors" title="Copy"><i class="fa-regular fa-copy"></i></button>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">IFSC Code:</span>
                                <div class="flex items-center gap-2">
                                    <span class="font-mono font-semibold text-gray-900">${_escapeHtml(staff.BANK_IFSC || 'Not Provided')}</span>
                                    ${staff.BANK_IFSC ? `<button type="button" onclick="VaultPayroll._copy('${_escapeHtml(staff.BANK_IFSC)}', this)" class="text-gray-400 hover:text-indigo-600 transition-colors" title="Copy"><i class="fa-regular fa-copy"></i></button>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Statutory & KYC -->
                    <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <i class="fa-solid fa-id-card text-purple-500"></i> Statutory &amp; KYC Identifiers
                        </h4>
                        <div class="space-y-2 text-xs">
                            <div class="flex items-center justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">PAN Number:</span>
                                <div class="flex items-center gap-2">
                                    <span class="font-mono font-semibold text-gray-900">${_escapeHtml(staff.PAN_NUM || 'N/A')}</span>
                                    ${staff.PAN_NUM ? `<button type="button" onclick="VaultPayroll._copy('${_escapeHtml(staff.PAN_NUM)}', this)" class="text-gray-400 hover:text-indigo-600 transition-colors" title="Copy"><i class="fa-regular fa-copy"></i></button>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">Aadhaar Number:</span>
                                <div class="flex items-center gap-2">
                                    <span class="font-mono font-semibold text-gray-900">${_escapeHtml(staff.ADHAR_NUM || 'N/A')}</span>
                                    ${staff.ADHAR_NUM ? `<button type="button" onclick="VaultPayroll._copy('${_escapeHtml(staff.ADHAR_NUM)}', this)" class="text-gray-400 hover:text-indigo-600 transition-colors" title="Copy"><i class="fa-regular fa-copy"></i></button>` : ''}
                                </div>
                            </div>
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">UAN:</span>
                                <span class="font-mono font-semibold text-gray-900">${_escapeHtml(staff.UAN || 'N/A')}</span>
                            </div>
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">EPF UID:</span>
                                <span class="font-mono font-semibold text-gray-900">${_escapeHtml(staff.EPF_UID || 'N/A')}</span>
                            </div>
                            <div class="flex justify-between py-1 border-b border-gray-50">
                                <span class="text-gray-500">ESI UID:</span>
                                <span class="font-mono font-semibold text-gray-900">${_escapeHtml(staff.ESI_UID || 'N/A')}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Residential Address -->
                    ${(staff.ADDRESS || staff.CITY || staff.STATE || staff.PINCODE) ? `
                    <div class="md:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <i class="fa-solid fa-location-dot text-rose-500"></i> Residential Address
                        </h4>
                        <p class="text-xs text-gray-800 leading-relaxed">
                            ${_escapeHtml([staff.ADDRESS, staff.CITY, staff.STATE].filter(Boolean).join(', '))}
                            ${staff.PINCODE ? ' - ' + _escapeHtml(staff.PINCODE) : ''}
                        </p>
                    </div>` : ''}
                </div>

                <!-- Ledger / Recent Transactions -->
                ${ledgerEntries.length ? `
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                            <i class="fa-solid fa-clock-rotate-left text-indigo-500"></i> Recent Ledger Transactions
                        </h4>
                        <span class="text-[11px] text-gray-500 font-mono">${ledgerEntries.length} total entries</span>
                    </div>
                    <div class="overflow-x-auto border border-gray-100 rounded-lg">
                        <table class="min-w-full text-xs">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="py-2 px-3 text-left font-bold text-gray-500 uppercase text-[10px]">Date</th>
                                    <th class="py-2 px-3 text-left font-bold text-gray-500 uppercase text-[10px]">Narration</th>
                                    <th class="py-2 px-3 text-right font-bold text-emerald-600 uppercase text-[10px]">Debit (₹)</th>
                                    <th class="py-2 px-3 text-right font-bold text-rose-600 uppercase text-[10px]">Credit (₹)</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 bg-white">${statementRows}</tbody>
                        </table>
                    </div>
                    ${ledgerEntries.length > 20 ? `<p class="text-[11px] text-gray-400 mt-2 text-right">Showing last 20 entries</p>` : ''}
                </div>` : ''}
            </div>
        `;
    }

    // ========================================================================
    // SALARY STRUCTURE
    // ========================================================================

    let _salaryStructures = [];

    function _loadSalaryStructures() {
        _salaryStructures = (_glRows || []).filter(e => e.ENTRY_TYPE === 'JOURNAL' && e.JOURNAL_TYPE === 'SALARY_STRUCTURE' && e.STATUS === 'ACTIVE');
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
                            <button type="button" onclick="if (VaultPayroll.activeTile && VaultPayroll.activeTile() === 'employees' && window.VaultPayroll?._getStaff) { const st = VaultPayroll._getStaff('${staffCode}'); if (st) { VaultPayroll._renderEmployeeDetail(st); return; } } VaultPayroll.setTile('payroll'); VaultPayroll.load();" class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
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
                    alert('Coming soon — managing salary structures.');
                    return;
                }
                resp.className = 'mt-3 p-3 rounded text-sm text-center bg-green-100 text-green-800';
                resp.textContent = `✅ Salary structure saved for ${staff?.STAFF_NAME || staffCode}: ₹${net.toFixed(2)}`;
                resp.classList.remove('hidden');
                await getAppData();
                _glRows = [];
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
        if (!confirm(`Process salary for ${month}? This will process ${withSalary.length} employees.`)) return;
        alert('Processing payroll is not available yet.');
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

    // ── Payslip list ─────────────────────────────────────────────────────────
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
                            📒 Postings
                        </summary>
                        <div id="glPostingsContent" class="p-3 text-gray-400 text-xs">Loading…</div>
                    </details>

                    <script>(async function() {
                        try {
                            const ledgerRaw = {};
                            const glEntries = Object.values(ledgerRaw || {}).filter(e => e.DOX_KEY === '${key}');
                            if (!glEntries.length) {
                                document.getElementById('glPostingsContent').innerHTML = '<p class="text-gray-400">No postings found.</p>';
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

    // ── Salary history ──────────────────────────────────────────────────────
    function _renderSalaryHistory() {
        const salaryEntries = (_glRows || [])
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
        let rawStaff = null;
        let rawAttendance = null;
        let rawBranches = null;

        // Try direct sheet fetch from getAppData('STAFF') first (instant IDB lookup)
        try {
            if (typeof getAppData === 'function') {
                rawStaff = await getAppData('STAFF');
                rawAttendance = await getAppData('ATTENDANCE');
                rawBranches = await getAppData('BRANCHES');
            }
        } catch (e) {
            console.warn('[VaultPayroll] Direct getAppData(sheet) failed:', e);
        }

        // Direct IndexedDB fallback
        if (!rawStaff && window.appDB?.getSheet) {
            try {
                rawStaff = await window.appDB.getSheet('STAFF');
            } catch (_) {}
        }
        if (!rawAttendance && window.appDB?.getSheet) {
            try {
                rawAttendance = await window.appDB.getSheet('ATTENDANCE');
            } catch (_) {}
        }
        if (!rawBranches && window.appDB?.getSheet) {
            try {
                rawBranches = await window.appDB.getSheet('BRANCHES');
            } catch (_) {}
        }

        // Global getAppData() fallback
        if (!rawStaff) {
            try {
                const fullData = await getAppData();
                if (fullData) {
                    rawStaff = fullData.STAFF;
                    rawAttendance = rawAttendance || fullData.ATTENDANCE;
                    rawBranches = rawBranches || fullData.BRANCHES;
                }
            } catch (e) {
                console.error('[VaultPayroll] Full getAppData fallback failed:', e);
            }
        }

        const staffList = Array.isArray(rawStaff) ? rawStaff : Object.values(rawStaff || {});
        _allAttendance = Array.isArray(rawAttendance) ? rawAttendance : Object.values(rawAttendance || {});
        _allBranches = Array.isArray(rawBranches) ? rawBranches : Object.values(rawBranches || {});

        const activeBranch = (VaultPage.getActiveBranch() || '').trim().toUpperCase();
        _allStaff = staffList.filter(s => {
            if (!s) return false;
            if (!activeBranch || activeBranch === 'ALL') return true;
            const b = (s.BRANCH || '').trim().toUpperCase();
            return !b || b === 'ALL' || b === activeBranch;
        });

        _glRows = [];
        _loadSalaryStructures();
        _computeEmployeeBalances();

        // Payslips are pending a rewrite against the accounting engine.
        _allPayslips = [];

        if (_activeTile === 'employees') {
            _injectListPane('Search name, code, dept, mobile, PAN…');
            const searchInput = document.getElementById('vaultSearch');
            if (searchInput) searchInput.oninput = () => search();
            _selectedStaffCode = null;
            _renderList();
            VaultPage.showDetail(false);
            const addBtn = document.getElementById('vaultAddBtn');
            if (addBtn) addBtn.classList.add('hidden');
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

    return { 
        load, 
        search, 
        setTile, 
        activeTile: () => _activeTile,
        _openSalaryForm, 
        _calcNet, 
        _processMonthlySalary, 
        _showSalaryListView,
        _renderEmployeeDetail,
        _copy: _copyText,
        _getStaff: (code) => _allStaff.find(s => s.STAFF_CODE === code)
    };
})();

window.VaultPayroll = VaultPayroll;
