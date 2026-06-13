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

    function _renderEmployeesList(staff) {
        const ul = document.getElementById('vaultList');
        if (!ul) return;
        const sorted = [...staff].sort((a, b) => (a.STAFF_NAME || '').localeCompare(b.STAFF_NAME || ''));
        if (!sorted.length) {
            ul.innerHTML = '<li class="text-center text-gray-400 text-sm py-6">No employees found.</li>';
            return;
        }
        ul.innerHTML = sorted.map(s => `
            <li data-code="${s.STAFF_CODE}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <strong class="text-gray-800 block text-sm">${s.STAFF_NAME || 'N/A'}</strong>
                <span class="text-xs text-gray-500">${s.STAFF_CODE || ''} · ${s.BRANCH || ''} · ${s.DEPARTMENT || ''}</span>
                <div class="flex gap-1 mt-1">${_statusBadge(s.STATUS)} ${_roleBadge(s.ROLE)}</div>
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
                    ${_statusBadge(staff.STATUS)}
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

    function _searchEmployees(q) {
        const lq = q.toLowerCase();
        _renderEmployeesList(_allStaff.filter(s =>
            (s.STAFF_NAME || '').toLowerCase().includes(lq) ||
            (s.STAFF_CODE || '').toLowerCase().includes(lq) ||
            (s.BRANCH || '').toLowerCase().includes(lq) ||
            (s.DEPARTMENT || '').toLowerCase().includes(lq) ||
            (s.MOBILE || '').includes(lq)
        ));
    }

    // ========================================================================
    // PAYROLL TILE
    // ========================================================================

    function _renderPayrollDashboard() {
        const view = document.getElementById('vaultDetailView');
        const activeStaff = _allStaff.filter(s => s.STATUS === 'Active');
        const totalStaff = _allStaff.length;
        const onLeave = _allStaff.filter(s => s.STATUS === 'On Leave').length;
        const branches = [...new Set(_allStaff.map(s => s.BRANCH).filter(Boolean))];

        // Last 30 days attendance summary
        const now = Date.now();
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        const recentAttendance = _allAttendance.filter(a =>
            a.ATTEN_DATE && a.ATTEN_DATE >= thirtyDaysAgo
        );
        const presentCount = recentAttendance.filter(a => a.STATUS === 'Present' || !a.STATUS).length;

        view.innerHTML = `
            <!-- KPI Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div class="text-xs text-gray-500 uppercase font-semibold">Total Employees</div>
                    <div class="text-2xl font-bold text-gray-800 mt-1">${totalStaff}</div>
                </div>
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div class="text-xs text-gray-500 uppercase font-semibold">Active</div>
                    <div class="text-2xl font-bold text-green-600 mt-1">${activeStaff.length}</div>
                </div>
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div class="text-xs text-gray-500 uppercase font-semibold">On Leave</div>
                    <div class="text-2xl font-bold text-yellow-600 mt-1">${onLeave}</div>
                </div>
                <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div class="text-xs text-gray-500 uppercase font-semibold">Attendance (30d)</div>
                    <div class="text-2xl font-bold text-blue-600 mt-1">${presentCount}</div>
                </div>
            </div>

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
            </div>

            <!-- Payroll Actions -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="detail-card">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">📋 Active Employees</h3></div>
                    <div class="detail-card-body">
                        <div class="text-xs text-gray-500 space-y-2">
                            ${activeStaff.length ? activeStaff.slice(0, 10).map(s => `
                                <div class="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                                    <span class="font-medium text-gray-800">${s.STAFF_NAME}</span>
                                    <span class="text-gray-500">${s.STAFF_CODE}</span>
                                </div>`).join('')
                            : '<p class="text-center py-4">No active staff</p>'}
                            ${activeStaff.length > 10 ? `<p class="text-center text-indigo-600 text-xs pt-2">+${activeStaff.length - 10} more</p>` : ''}
                        </div>
                    </div>
                </div>
                <div class="detail-card">
                    <div class="detail-card-header"><h3 class="font-semibold text-gray-700">⚙️ Payroll Actions</h3></div>
                    <div class="detail-card-body space-y-3">
                        <p class="text-sm text-gray-600">Payroll processing features coming soon:</p>
                        <div class="space-y-2">
                            <div class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-default">
                                <span class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">1</span>
                                <div><div class="text-sm font-medium text-gray-700">Monthly Salary Processing</div><div class="text-xs text-gray-400">Calculate and process salaries</div></div>
                            </div>
                            <div class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-default">
                                <span class="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-bold">2</span>
                                <div><div class="text-sm font-medium text-gray-700">Payslip Generation</div><div class="text-xs text-gray-400">Generate monthly payslips</div></div>
                            </div>
                            <div class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-default">
                                <span class="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold">3</span>
                                <div><div class="text-sm font-medium text-gray-700">Attendance Integration</div><div class="text-xs text-gray-400">Link attendance to salary</div></div>
                            </div>
                            <div class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-default">
                                <span class="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-bold">4</span>
                                <div><div class="text-sm font-medium text-gray-700">TDS / PF / ESI Reports</div><div class="text-xs text-gray-400">Statutory reports</div></div>
                            </div>
                        </div>
                        <p class="text-xs text-gray-400 text-center pt-2">More features coming soon.</p>
                    </div>
                </div>
            </div>`;
    }

    // ========================================================================
    // LOAD
    // ========================================================================

    function search(q) {
        if (_activeTile === 'employees') _searchEmployees(q);
    }

    async function load() {
        const data = await getAppData();
        if (!data) return;

        _allStaff = Object.values(data.STAFF || {});
        _allAttendance = Object.values(data.ATTENDANCE || {});
        _allBranches = Object.values(data.BRANCHES || {});

        _injectListPane('Search name, code, department…');

        if (_activeTile === 'employees') {
            _renderEmployeesList(_allStaff);
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

    return { load, search, setTile };
})();

window.VaultPayroll = VaultPayroll;
