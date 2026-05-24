// ============================================================================
// ADMIN.JS — Tiles first, click → Shipments-style split view
// ============================================================================

const AdminPage = (() => {

    const SUDO_KEY = 'admin_sudo_token';
    let _sudoUsername = '';
    let _addUserPrefill = null;
    let _sudoCallback = null;
    let _activeTile = null;
    let _allUsers = [];

    // ── Sudo token ────────────────────────────────────────────────────────────
    function getSudo()   { return sessionStorage.getItem(SUDO_KEY); }
    function setSudo(t)  { sessionStorage.setItem(SUDO_KEY, t); }
    function clearSudo() { sessionStorage.removeItem(SUDO_KEY); }

    function requireSudo(cb) {
        if (getSudo()) { cb(getSudo()); return; }
        _sudoCallback = cb;
        document.getElementById('sudoModal').classList.remove('hidden');
    }

    // ── Mobile helpers (matches Shipments pattern) ───────────────────────────
    const _isMobile = () => window.innerWidth < 768;

    function _showListPane() {
        document.getElementById('adminListPane').classList.remove('hidden');
        document.getElementById('adminDetailPane').classList.add('hidden');
    }

    function _showDetailPane() {
        if (_isMobile()) {
            document.getElementById('adminListPane').classList.add('hidden');
            document.getElementById('adminDetailPane').classList.remove('hidden');
        } else {
            document.getElementById('adminListPane').classList.remove('hidden');
            document.getElementById('adminDetailPane').classList.remove('hidden');
        }
    }

    // ── View switching ────────────────────────────────────────────────────────
    function _showTiles() {
        document.getElementById('tilesView').style.display = 'flex';
        document.getElementById('splitView').classList.remove('active');
        document.getElementById('adminDetailPane').classList.add('hidden');
        document.getElementById('adminListPane').classList.remove('hidden');
        _activeTile = null;
    }

    function _showSplit(title) {
        document.getElementById('tilesView').style.display = 'none';
        document.getElementById('splitView').classList.add('active');
        document.getElementById('splitTitle').textContent = title;
        _showDetail(false);
        document.getElementById('adminList').innerHTML = '';
        document.getElementById('listMsg').textContent = 'Loading…';
        document.getElementById('listSearch').value = '';
        document.getElementById('deleteCarrierBtn').classList.add('hidden');
        document.getElementById('detailView').innerHTML = '';
        document.getElementById('adminListPane').classList.remove('hidden');
        if (_isMobile()) {
            document.getElementById('adminDetailPane').classList.add('hidden');
        } else {
            document.getElementById('adminDetailPane').classList.remove('hidden');
        }
    }

    // ── Role helpers ──────────────────────────────────────────────────────────
    function _userLevel() { return ROLE_LEVELS[getUser().ROLE] || 0; }
    function _can(role)   { return _userLevel() >= ROLE_LEVELS[role]; }

    // Minimum role required to see each tile
    const TILE_MIN_ROLE = {
        users:         'ADMIN',
        registrations: 'ADMIN',
        services:      'ADMIN',
        branches:      'CLIENT',
        staff:         'ADMIN',
        attendance:    'STAFF',
        pincodes:      'STAFF',
        clients:       'CLIENT',
        b2b2c:         'CLIENT',
        holidays:      'STAFF',
        shifts:        'MANAGER',
        modes:         'MASTER',
        carriers:      'MASTER',
    };

    function _hideTilesByRole() {
        document.querySelectorAll('[data-tile]').forEach(tile => {
            const minRole = TILE_MIN_ROLE[tile.dataset.tile];
            if (minRole && !_can(minRole)) tile.classList.add('hidden');
        });
    }

    // ── Tile counts ───────────────────────────────────────────────────────────
    function _setCount(tile, val) {
        const el = document.getElementById(`cnt-${tile}`);
        if (el) el.textContent = val;
    }

    function _loadCountsFromData(data) {
        _setCount('branches',   Object.keys(data?.BRANCHES  || {}).length);
        _setCount('staff',      Object.keys(data?.STAFF     || {}).length);
        _setCount('attendance', Object.keys(data?.ATTENDANCE|| {}).length);
        _setCount('clients',    Object.keys(data?.B2B       || {}).length);
        _setCount('b2b2c',      Object.keys(data?.B2B2C     || {}).length);
        _setCount('holidays',   Object.keys(data?.HOLIDAYS  || {}).length);
        _setCount('shifts',     Object.values(data?.ATTENDANCE || {}).filter(r => r.SHIFT).length);
        _setCount('modes',      Object.keys(data?.MODES    || {}).length);
        _setCount('carriers',   Object.keys(data?.CARRIERS || {}).length);
        try {
            if (typeof window.getPincodeCount === 'function')
                _setCount('pincodes', window.getPincodeCount().toLocaleString('en-IN'));
        } catch (_) { _setCount('pincodes', '—'); }
    }

    async function _loadCounts() {
        // Users & Registrations — only if ADMIN+
        if (_can('ADMIN')) {
            try {
                const [uRes, rRes] = await Promise.all([
                    AdminAPI.listUsers(),
                    AdminAPI.fetchRegistrations(),
                ]);
                _allUsers = uRes.data || [];
                _setCount('users', _allUsers.length);
                _setCount('registrations', (rRes.data || []).length);
            } catch (_) { _setCount('users', '!'); _setCount('registrations', '!'); }
        }

        // IDB collections
        try {
            const data = await getAppData();
            _loadCountsFromData(data);
        } catch (_) {}
    }

    // ── Tile click ────────────────────────────────────────────────────────────
    const TILE_LABELS = {
        users:'Users', registrations:'Registrations', services:'Services', branches:'Branches',
        staff:'Staff', attendance:'Attendance', pincodes:'Pincodes', clients:'Clients (B2B)', b2b2c:'B2B2C', holidays:'Holidays', shifts:'Shifts & Leaves',
        modes:'Modes', carriers:'Carriers'
    };

    function _initTiles() {
        document.querySelectorAll('[data-tile]').forEach(tile =>
            tile.addEventListener('click', () => _activateTile(tile.dataset.tile))
        );
        document.getElementById('backToTilesBtn').addEventListener('click', _showTiles);
        document.getElementById('backToListBtn')?.addEventListener('click', () => {
            if (_isMobile()) _showListPane();
        });
    }

    async function _activateTile(name) {
        const minRole = TILE_MIN_ROLE[name];
        if (minRole && !_can(minRole)) return;
        _activeTile = name;
        _showSplit(TILE_LABELS[name] || name);
        const showAdd = (name === 'users' && _can('ADMIN')) || (name === 'branches' && _can('ADMIN')) || (name === 'b2b2c' && _can('CLIENT')) || (name === 'staff' && _can('ADMIN')) || (name === 'holidays' && _can('ADMIN')) || (name === 'clients' && _can('MANAGER')) || (name === 'modes' && _can('MASTER')) || (name === 'carriers' && _can('MASTER'));
        document.getElementById('addUserBtn').classList.toggle('hidden', !showAdd);

        try {
            if (name === 'users') {
                const res = await AdminAPI.listUsers();
                _allUsers = res.data || [];
                AdminUsers.setUsers(_allUsers);
                AdminUsers.renderList(_allUsers);
            } else if (name === 'registrations') {
                await AdminRegistrations.load();
            } else if (name === 'services') {
                await AdminServices.load();
            } else if (name === 'branches') {
                await AdminBranches.load();
            } else if (name === 'staff') {
                await AdminStaff.load();
            } else if (name === 'attendance') {
                await AdminAttendance.load();
            } else if (name === 'b2b2c') {
                await AdminB2B2C.load();
            } else if (name === 'holidays') {
                await AdminHolidays.load();
            } else if (name === 'shifts') {
                await AdminShifts.load();
            } else if (name === 'pincodes') {
                await AdminPincodes.load();
            } else if (name === 'clients') {
                await AdminClients.load();
            } else if (name === 'modes') {
                await AdminModes.load();
            } else if (name === 'carriers') {
                await AdminCarriers.load();
            }
        } catch (e) {
            document.getElementById('listMsg').textContent = 'Failed to load.';
            showNotification('❌ ' + e.message, 'error');
        }
    }

    // ── Generic list/detail for non-user collections ──────────────────────────
    const _META = {
        BRANCHES: { key:'BRANCH_CODE', sub:'BRANCH_NAME' },
        STAFF:    { key:'STAFF_CODE',  sub:'NAME' },
        B2B:      { key:'CODE',        sub:'NAME' },
        B2B2C:    { key:'UID',         sub:'NAME' },
    };

    function _renderGenericList(items, coll) {
        const ul  = document.getElementById('adminList');
        const msg = document.getElementById('listMsg');
        const { key, sub } = _META[coll] || { key:'id', sub:null };
        msg.textContent = '';
        ul.innerHTML = items.map(item => `
            <li data-key="${item[key] || item.id}">
                <strong>${item[key] || item.id}</strong>
                ${sub && item[sub] ? `<span class="client-info">${item[sub]}</span>` : ''}
            </li>`).join('');
        ul.querySelectorAll('li').forEach(li => li.addEventListener('click', () => {
            ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
            li.classList.add('selected');
            const item = items.find(i => String(i[key] || i.id) === li.dataset.key);
            if (item) _renderGenericDetail(item);
        }));
    }

    function _renderGenericDetail(item) {
        _showDetail(true);
        _showDetailPane();
        const rows = Object.entries(item)
            .filter(([k]) => !['id','created','updated'].includes(k))
            .map(([k,v]) => `<tr>
                <td class="py-1.5 pr-4 text-xs font-medium text-gray-500 whitespace-nowrap align-top">${k}</td>
                <td class="py-1.5 text-sm text-gray-800 break-all">${v ?? '—'}</td>
            </tr>`).join('');
        document.getElementById('detailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header"><h3 class="font-semibold text-gray-700 text-sm">Details</h3></div>
                <div class="detail-card-body"><table class="w-full">${rows}</table></div>
            </div>`;
    }

    // ── Search ────────────────────────────────────────────────────────────────
    function _initSearch() {
        document.getElementById('listSearch').addEventListener('input', e => {
            if (_activeTile === 'users') AdminUsers.search(e.target.value);
            else if (_activeTile === 'services') AdminServices.search(e.target.value);
            else if (_activeTile === 'branches') AdminBranches.search(e.target.value);
            else if (_activeTile === 'staff') AdminStaff.search(e.target.value);
            else if (_activeTile === 'pincodes') AdminPincodes.search(e.target.value);
            else if (_activeTile === 'holidays') AdminHolidays.search(e.target.value);
            else if (_activeTile === 'clients') AdminClients.search(e.target.value);
            else if (_activeTile === 'modes') AdminModes.search(e.target.value);
            else if (_activeTile === 'carriers') AdminCarriers.search(e.target.value);
            else if (_activeTile === 'shifts') AdminShifts.search(e.target.value);
            else if (_activeTile === 'b2b2c') {
                const mirror = document.getElementById('b2b2cSearchClient');
                if (mirror) { mirror.value = e.target.value; mirror.dispatchEvent(new Event('input')); }
            }
        });
    }

    // ── Show/hide detail pane ─────────────────────────────────────────────────
    function _showDetail(show) {
        document.getElementById('detailEmpty').classList.toggle('hidden', show);
        document.getElementById('detailView').classList.toggle('hidden', !show);
    }

    // ── Sudo form ─────────────────────────────────────────────────────────────
    function _initSudoForm() {
        document.getElementById('sudoCancelBtn').addEventListener('click', () => {
            document.getElementById('sudoModal').classList.add('hidden');
            _sudoCallback = null;
        });
        document.getElementById('sudoForm').addEventListener('submit', async e => {
            e.preventDefault();
            const username = e.target.sudoUsername.value.trim();
            const password = e.target.sudoPassword.value;
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Sending…';
            try {
                await AdminAPI.initiateAdminAccess(username, password);
                _sudoUsername = username;
                document.getElementById('sudoModal').classList.add('hidden');
                document.getElementById('sudoOtpModal').classList.remove('hidden');
                document.getElementById('sudoOtpHint').textContent = `OTP sent to ${username}`;
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            } finally { btn.disabled = false; btn.textContent = 'Send OTP'; }
        });
        document.getElementById('sudoOtpForm').addEventListener('submit', async e => {
            e.preventDefault();
            const otp = e.target.sudoOtp.value.trim();
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Verifying…';
            try {
                const res = await AdminAPI.verifyAdminAccess(_sudoUsername, otp);
                setSudo(res.sudo_token);
                document.getElementById('sudoOtpModal').classList.add('hidden');
                showNotification('✅ Identity verified', 'success');
                if (_sudoCallback) { _sudoCallback(res.sudo_token); _sudoCallback = null; }
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            } finally { btn.disabled = false; btn.textContent = 'Verify'; }
        });
    }

    // ── Add User — renders in right pane ─────────────────────────────────────
    function openAddUserModal(prefill = {}) {
        _addUserPrefill = prefill;
        AdminPage.showDetail(true);
        _showDetailPane();

        const ROLES = ['CLIENT','STAFF','MANAGER','ACCOUNTANT','AUDITOR','ADMIN','MASTER'];
        const cc  = (prefill.MOBILE || '').includes('-') ? prefill.MOBILE.split('-')[0] : '91';
        const num = (prefill.MOBILE || '').includes('-') ? prefill.MOBILE.split('-')[1] : (prefill.MOBILE || '');

        document.getElementById('detailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <h2 class="text-base font-bold text-gray-800">Add User</h2>
                    <button id="cancelAddUserBtn" class="text-xs text-gray-400 hover:text-gray-600">✕ Cancel</button>
                </div>
                <div class="detail-card-body">
                    <form id="addUserForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Username *</label><input name="USER" required value="${prefill.USER||''}" class="form-input text-sm"></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Name *</label><input name="NAME" required value="${prefill.NAME||''}" class="form-input text-sm"></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Email</label><input name="EMAIL" type="email" value="${prefill.EMAIL||''}" class="form-input text-sm"></div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Mobile</label>
                            <div class="flex gap-2">
                                <input name="MOBILE_CC"  value="${cc}"  class="form-input text-sm" style="width:5rem;flex-shrink:0" placeholder="CC">
                                <input name="MOBILE_NUM" value="${num}" class="form-input text-sm flex-1" placeholder="Number">
                            </div>
                        </div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Branch</label><input name="BRANCH" value="${prefill.BRANCH||''}" class="form-input text-sm"></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Role *</label>
                            <select name="ROLE" required class="form-input text-sm">
                                ${ROLES.map(r => `<option ${(prefill.ROLE||'CLIENT')===r?'selected':''}>${r}</option>`).join('')}
                            </select>
                        </div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Code</label><input name="CODE" value="${prefill.CODE||''}" class="form-input text-sm"></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
                            <select name="STATUS" class="form-input text-sm">
                                <option>ACTIVE</option><option>INACTIVE</option><option>SUSPENDED</option>
                            </select>
                        </div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Col Filter</label><input name="COL_FILTER" value="${prefill.COL_FILTER||''}" class="form-input text-sm"></div>
                        <div><label class="block text-xs font-medium text-gray-600 mb-1">Filter Value</label><input name="FILTER_VALUE" value="${prefill.FILTER_VALUE||''}" class="form-input text-sm"></div>
                        <div class="sm:col-span-2 flex justify-end">
                            <button type="submit" class="btn-otp btn-sm">Send OTP</button>
                        </div>
                    </form>
                </div>
            </div>`;

        document.getElementById('cancelAddUserBtn').addEventListener('click', () => {
            AdminPage.showDetail(false);
            _addUserPrefill = null;
        });

        document.getElementById('addUserForm').addEventListener('submit', async e => {
            e.preventDefault();
            const f = e.target;
            const cc  = f.MOBILE_CC?.value.trim()  || '91';
            const num = f.MOBILE_NUM?.value.trim()  || '';
            const payload = {
                USER: f.USER.value.trim(), NAME: f.NAME.value.trim(),
                EMAIL: f.EMAIL.value.trim(),
                MOBILE: num ? `${cc}-${num}` : '',
                BRANCH: f.BRANCH.value.trim(), ROLE: f.ROLE.value,
                CODE: f.CODE.value.trim(), STATUS: f.STATUS.value,
                COL_FILTER: f.COL_FILTER.value.trim(), FILTER_VALUE: f.FILTER_VALUE.value.trim(),
                PASS: '',
            };
            const btn = f.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Sending OTP…';
            try {
                await AdminAPI.initiateAddUser(payload);
                document.getElementById('addUserOtpModal').classList.remove('hidden');
                document.getElementById('addUserOtpHint').textContent = `OTP sent to admin for: ${payload.USER}`;
                document.getElementById('addUserOtpModal').dataset.username = payload.USER;
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            } finally { btn.disabled = false; btn.textContent = 'Send OTP'; }
        });
    }

    function _initAddUserFlow() {
        document.getElementById('addUserBtn').addEventListener('click', () => {
            if (_activeTile === 'branches') { AdminBranches.openAddPane(); return; }
            if (_activeTile === 'staff') { AdminStaff.openAddPane(); return; }
            if (_activeTile === 'holidays') { AdminHolidays.openAddPane(); return; }
            if (_activeTile === 'clients') { AdminClients.openAddPane(); return; }
            if (_activeTile === 'modes') { AdminModes.openAddPane(); return; }
            if (_activeTile === 'carriers') { AdminCarriers.openAddPane(); return; }
            if (_activeTile === 'b2b2c') {
                const newBtn = document.getElementById('b2b2cNewClientBtn');
                if (newBtn) newBtn.click();
                return;
            }
            openAddUserModal();
        });

        document.getElementById('addUserOtpForm').addEventListener('submit', async e => {
            e.preventDefault();
            const username = document.getElementById('addUserOtpModal').dataset.username;
            const otp = e.target.addUserOtp.value.trim();
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Confirming…';
            try {
                await AdminAPI.confirmAddUser(username, otp);
                document.getElementById('addUserOtpModal').classList.add('hidden');
                showNotification('✅ User added', 'success');
                const res = await AdminAPI.listUsers();
                _allUsers = res.data || [];
                _setCount('users', _allUsers.length);
                AdminUsers.setUsers(_allUsers);
                AdminUsers.renderList(_allUsers);
                if (_addUserPrefill?.id) AdminRegistrations.removeById(_addUserPrefill.id);
                _addUserPrefill = null;
                AdminPage.showDetail(false);
            } catch (err) {
                showNotification('❌ ' + err.message, 'error');
            } finally { btn.disabled = false; btn.textContent = 'Confirm'; }
        });
    }

    // ── Close buttons ─────────────────────────────────────────────────────────
    function _initCloseButtons() {
        document.querySelectorAll('[data-close-modal]').forEach(btn =>
            btn.addEventListener('click', () =>
                document.getElementById(btn.dataset.closeModal)?.classList.add('hidden')
            )
        );
    }
    // ── Entry point ───────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        _hideTilesByRole();
        _initTiles();
        _initSudoForm();
        _initAddUserFlow();
        _initCloseButtons();
        _initSearch();

        // IDB counts — fire immediately from data events (same pattern as other pages)
        window.addEventListener('appDataLoaded',    e => _loadCountsFromData(e.detail.data));
        window.addEventListener('appDataRefreshed', e => _loadCountsFromData(e.detail.data));

        // API counts (users/registrations) — wait for OPERATIONS_URL
        const _tryLoad = () => {
            if (CONSTANTS.OPERATIONS_URL && CONSTANTS.OPERATIONS_URL !== '__API_URL__') {
                _loadCounts();
            } else {
                setTimeout(_tryLoad, 200);
            }
        };
        _tryLoad();
    });

    return { openAddUserModal, getSudo, requireSudo, showDetail: _showDetail, showDetailPane: _showDetailPane, can: _can };
})();

window.AdminPage = AdminPage;
