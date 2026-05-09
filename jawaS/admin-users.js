// ============================================================================
// ADMIN-USERS.JS — Users list, detail pane, edit, delete, add-user flow
// ============================================================================

const AdminUsers = (() => {

    let _users = [];
    let _selected = null;
    let _sudoToken = null;

    const ROLES = ['MASTER','ADMIN','AUDITOR','ACCOUNTANT','MANAGER','STAFF','CLIENT'];
    const STATUSES = ['ACTIVE','INACTIVE','SUSPENDED'];
    const EDITABLE = ['NAME','EMAIL','MOBILE','ROLE','BRANCH','STATUS','COL_FILTER','FILTER_VALUE'];

    const ROLE_COLORS = {
        MASTER:'bg-red-100 text-red-700', ADMIN:'bg-orange-100 text-orange-700',
        AUDITOR:'bg-yellow-100 text-yellow-700', ACCOUNTANT:'bg-blue-100 text-blue-700',
        MANAGER:'bg-purple-100 text-purple-700', STAFF:'bg-green-100 text-green-700',
        CLIENT:'bg-gray-100 text-gray-700'
    };

    function init(sudoToken, users) {
        _sudoToken = sudoToken;
        _users = users;
        _render();
    }

    function _render() {
        _renderList(_users);
        _showEmpty();
    }

    function _renderList(users) {
        const ul = document.getElementById('userList');
        const msg = document.getElementById('user-status-msg');
        if (!ul) return;
        if (!users.length) {
            ul.innerHTML = '';
            if (msg) msg.textContent = 'No users found.';
            return;
        }
        if (msg) msg.textContent = '';
        ul.innerHTML = users.map(u => `
            <li data-user="${u.USER}" class="p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-indigo-50 transition ${_selected === u.USER ? 'bg-indigo-100 border-indigo-300' : ''}">
                <strong class="block text-sm font-semibold text-indigo-700">${u.USER}</strong>
                <span class="text-xs text-gray-500">${u.NAME || ''}</span>
                <div class="flex justify-between items-center mt-1">
                    <span class="text-xs px-2 py-0.5 rounded font-semibold ${ROLE_COLORS[u.ROLE] || 'bg-gray-100 text-gray-600'}">${u.ROLE}</span>
                    <span class="text-xs ${u.STATUS === 'ACTIVE' ? 'text-green-600' : 'text-red-500'}">${u.STATUS || ''}</span>
                </div>
            </li>`).join('');

        ul.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', () => _selectUser(li.dataset.user))
        );
    }

    function _selectUser(username) {
        _selected = username;
        const u = _users.find(x => x.USER === username);
        if (!u) return;
        _renderList(_users); // re-render to update selected highlight
        _renderDetail(u);
    }

    function _showEmpty() {
        document.getElementById('userDetailView')?.classList.add('hidden');
        document.getElementById('userEmptyView')?.classList.remove('hidden');
    }

    function _renderDetail(u) {
        document.getElementById('userEmptyView')?.classList.add('hidden');
        const view = document.getElementById('userDetailView');
        if (!view) return;
        view.classList.remove('hidden');
        view.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h2 class="text-lg font-bold text-gray-800">${u.USER}</h2>
                    <p class="text-sm text-gray-500">${u.NAME || ''}</p>
                </div>
                <button id="deleteUserBtn" class="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700">Delete</button>
            </div>
            <form id="editUserForm" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                ${EDITABLE.map(f => `
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">${f}</label>
                    ${f === 'ROLE' ? `<select name="${f}" class="form-input text-sm">${ROLES.map(r => `<option ${u[f]===r?'selected':''}>${r}</option>`).join('')}</select>`
                    : f === 'STATUS' ? `<select name="${f}" class="form-input text-sm">${STATUSES.map(s => `<option ${u[f]===s?'selected':''}>${s}</option>`).join('')}</select>`
                    : `<input name="${f}" value="${u[f]||''}" class="form-input text-sm">`}
                </div>`).join('')}
                <div class="sm:col-span-2 flex justify-end">
                    <button type="submit" class="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">Save Changes</button>
                </div>
            </form>`;

        view.querySelector('#editUserForm').addEventListener('submit', async e => {
            e.preventDefault();
            const fields = {};
            EDITABLE.forEach(f => {
                const el = e.target.elements[f];
                if (el && el.value !== (u[f] || '')) fields[f] = el.value;
            });
            if (!Object.keys(fields).length) return showNotification('No changes', 'info');
            try {
                await AdminAPI.updateUser(u.USER, _sudoToken, fields);
                Object.assign(u, fields);
                showNotification('✅ User updated', 'success');
                _renderDetail(u);
                _renderList(_users);
            } catch (err) { showNotification('❌ ' + err.message, 'error'); }
        });

        view.querySelector('#deleteUserBtn').addEventListener('click', async () => {
            if (!confirm(`Delete user "${u.USER}"? This cannot be undone.`)) return;
            try {
                await AdminAPI.deleteUser(u.USER, _sudoToken);
                _users = _users.filter(x => x.USER !== u.USER);
                _selected = null;
                _renderList(_users);
                _showEmpty();
                showNotification('✅ User deleted', 'success');
            } catch (err) { showNotification('❌ ' + err.message, 'error'); }
        });
    }

    function search(q) {
        const lq = q.toLowerCase();
        _renderList(_users.filter(u =>
            u.USER.toLowerCase().includes(lq) ||
            (u.NAME||'').toLowerCase().includes(lq) ||
            (u.ROLE||'').toLowerCase().includes(lq)
        ));
    }

    // Add user — called from admin.js after OTP confirmed
    function addUserToList(user) {
        _users.push(user);
        _renderList(_users);
    }

    return { init, search, addUserToList };
})();

window.AdminUsers = AdminUsers;
