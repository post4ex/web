// ADMIN-MODES.JS — Modes tile: exact match to Mode.html flow & design
// Depends on: core/app-api.js (callApi, getAppData)
// ============================================================================

const AdminModes = (() => {

    let _allModes   = [];   // array, same as Mode.html allModes
    let _isUpdate   = false;

    function _can(role) { return window.AdminPage?.can(role); }

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('listMsg')?.classList.add('hidden');
        document.getElementById('adminList').innerHTML = `<ul id="modesList" class="p-2 space-y-2"></ul>`;
        document.getElementById('listSearch').placeholder = 'Search modes...';
    }

    function _renderList(modes) {
        const ul = document.getElementById('modesList');
        if (!ul) return;
        if (!modes || !modes.length) {
            ul.innerHTML = '<li class="text-center text-gray-500 text-sm py-4">No matching modes.</li>';
            return;
        }
        ul.innerHTML = '';
        modes.forEach(mode => {
            const li = document.createElement('li');
            li.className = 'p-3 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors border border-gray-200 text-sm';
            li.textContent = `${mode.MODE} - ${mode.SHORT || ''}`;
            li.dataset.mode = mode.MODE;
            li.addEventListener('click', () => _populateFormForEdit(mode.MODE));
            ul.appendChild(li);
        });
    }

    function search(term) {
        const t = (term || '').toLowerCase();
        _renderList(_allModes.filter(m =>
            (m.MODE || '').toLowerCase().includes(t) || (m.SHORT || '').toLowerCase().includes(t)
        ));
    }

    // ── Detail pane ───────────────────────────────────────────────────────────
    function _injectDetailPane() {
        document.getElementById('detailView').innerHTML = `
            <div class="w-full">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold text-gray-900">Mode Management</h1>
                    <p class="text-gray-600 mt-2">Select a mode to edit, or create a new one.</p>
                </div>
                <form id="modesForm">
                    <div>
                        <h2 class="text-xl font-semibold mb-6 text-indigo-600">Mode Details</h2>
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div class="md:col-span-2">
                                <label class="block mb-2 text-sm font-medium text-gray-700">Mode*</label>
                                <input type="text" id="modesMode" name="MODE" required
                                    class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg w-full p-2.5">
                            </div>
                            <div class="md:col-span-2">
                                <label class="block mb-2 text-sm font-medium text-gray-700">Short Name</label>
                                <input type="text" name="SHORT"
                                    class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg w-full p-2.5">
                            </div>
                            <div class="md:col-span-2">
                                <label class="block mb-2 text-sm font-medium text-gray-700">VOL INGR</label>
                                <input type="number" step="any" name="VOL_INGR"
                                    class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg w-full p-2.5">
                            </div>
                            <div class="md:col-span-2">
                                <label class="block mb-2 text-sm font-medium text-gray-700">MIN WT</label>
                                <input type="number" step="any" name="MIN_WT"
                                    class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg w-full p-2.5">
                            </div>
                        </div>
                    </div>
                    <div class="mt-8">
                        <h2 class="text-xl font-semibold mb-6 text-indigo-600">Zone Service Availability</h2>
                        <div class="grid grid-cols-4 md:grid-cols-7 lg:grid-cols-14 gap-4" id="modesZoneInputs"></div>
                    </div>
                    <div class="mt-8 flex justify-center items-center gap-4 flex-wrap">
                        <button type="submit" id="modesSubmitBtn"
                            class="btn px-8 py-3 flex items-center justify-center disabled:opacity-45">
                            <span id="modesSubmitText">Submit New Mode</span>
                            <div id="modesSpinner" class="hidden ml-3 w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                        </button>
                        <button type="button" id="modesDeleteBtn"
                            class="hidden btn-danger px-8 py-3 flex items-center justify-center disabled:opacity-45">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            <span>Delete</span>
                        </button>
                    </div>
                </form>
                <div id="modesResponseMsg" class="mt-6 text-center p-4 rounded-lg text-sm hidden"></div>
            </div>

            <!-- Delete Modal -->
            <div id="modesDeleteModal" class="modal-overlay hidden">
                <div class="modal-content text-center">
                    <h2 class="text-xl font-semibold text-gray-800 mb-4">Confirm Deletion</h2>
                    <p class="text-gray-600 mb-6">Are you sure you want to delete mode <strong id="modesDeleteName"></strong>? This action cannot be undone.</p>
                    <div class="flex justify-center gap-4">
                        <button id="modesCancelDeleteBtn" class="btn-ghost px-6 py-2">Cancel</button>
                        <button id="modesConfirmDeleteBtn" class="btn-danger px-6 py-2 flex items-center disabled:opacity-45">
                            <span>Confirm Delete</span>
                            <div id="modesDeleteSpinner" class="hidden ml-3 w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                        </button>
                    </div>
                </div>
            </div>`;

        _buildZoneInputs();
        AdminPage.showDetail(true);
        _bindEvents();
    }

    function _buildZoneInputs() {
        const wrap = document.getElementById('modesZoneInputs');
        if (!wrap) return;
        let html = '';
        for (let i = 1; i <= 14; i++) {
            html += `<div>
                <label class="block mb-2 text-sm font-medium text-gray-700 text-center">Z${i}</label>
                <input type="text" maxlength="1" placeholder="Y/N" name="Z${i}"
                    class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg w-full p-2.5 text-center uppercase">
            </div>`;
        }
        wrap.innerHTML = html;
    }

    function _showResponseMsg(message, type, data = null) {
        const el = document.getElementById('modesResponseMsg');
        if (!el) return;
        let content = `<p class="font-semibold">${message}</p>`;
        if (data && typeof data === 'object') {
            content += '<div class="mt-2 text-left text-xs bg-gray-50 p-3 rounded border border-gray-200 max-w-md mx-auto">';
            for (const [k, v] of Object.entries(data)) {
                if (v) content += `<p><strong class="font-medium text-gray-600">${k.replace(/_/g, ' ')}:</strong> <span class="text-gray-800">${v}</span></p>`;
            }
            content += '</div>';
        }
        el.innerHTML = content;
        el.className = `mt-6 text-center p-4 rounded-lg text-sm ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
        el.classList.remove('hidden');
    }

    // ── Reset form (exact match to Mode.html resetForm) ───────────────────────
    function _resetForm() {
        document.getElementById('modesForm').reset();
        _isUpdate = false;
        const modeInput = document.getElementById('modesMode');
        modeInput.readOnly = false;
        modeInput.classList.remove('bg-gray-200', 'cursor-not-allowed');
        document.getElementById('modesSubmitText').textContent = 'Submit New Mode';
        document.getElementById('modesDeleteBtn').classList.add('hidden');
        document.getElementById('modesResponseMsg').classList.add('hidden');
    }

    // ── Populate form for edit (exact match to Mode.html populateFormForEdit) ─
    function _populateFormForEdit(modeId) {
        const mode = _allModes.find(m => m.MODE === modeId);
        if (!mode) return;
        _resetForm();
        const form = document.getElementById('modesForm');
        for (const key in mode) {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) input.value = mode[key] || '';
        }
        _isUpdate = true;
        const modeInput = document.getElementById('modesMode');
        modeInput.readOnly = true;
        modeInput.classList.add('bg-gray-200', 'cursor-not-allowed');
        document.getElementById('modesSubmitText').textContent = `Update Mode ${modeId}`;
        document.getElementById('modesDeleteBtn').classList.toggle('hidden', !_can('MASTER'));

        // highlight list item
        document.querySelectorAll('#modesList li').forEach(li =>
            li.classList.toggle('bg-indigo-50', li.dataset.mode === modeId)
        );

        AdminPage.showDetail(true);
        AdminPage.showDetailPane();
    }

    // ── Open add (New button) ─────────────────────────────────────────────────
    function openAddPane() {
        _resetForm();
        AdminPage.showDetail(true);
        AdminPage.showDetailPane();
    }

    // ── setLoading (exact match to Mode.html setLoading) ─────────────────────
    function _setLoading(isLoading, type) {
        if (type === 'delete') {
            document.getElementById('modesDeleteSpinner').classList.toggle('hidden', !isLoading);
            document.getElementById('modesConfirmDeleteBtn').disabled = isLoading;
            document.getElementById('modesCancelDeleteBtn').disabled = isLoading;
        } else {
            document.getElementById('modesSpinner').classList.toggle('hidden', !isLoading);
            document.getElementById('modesSubmitBtn').disabled = isLoading;
            const modeVal = document.getElementById('modesMode').value;
            document.getElementById('modesSubmitText').textContent = isLoading
                ? (_isUpdate ? 'Updating...' : 'Submitting...')
                : (_isUpdate ? `Update Mode ${modeVal}` : 'Submit New Mode');
        }
    }

    // ── handleRequest (exact match to Mode.html handleRequest) ───────────────
    async function _handleRequest(action) {
        _setLoading(true, action === 'delete' ? 'delete' : 'submit');
        let data = {};
        if (action === 'submit') {
            new FormData(document.getElementById('modesForm')).forEach((v, k) => { data[k] = v; });
        } else {
            data.MODE = document.getElementById('modesMode').value;
        }
        try {
            const result = await callApi(
                action === 'delete' ? '/api/deleteMode' : '/api/writeMode',
                { data, record_id: action !== 'delete' && _isUpdate ? data.MODE : null },
                'POST'
            );
            _showResponseMsg(result.message || 'Done.', 'success', result.data);
            _resetForm();
            // refresh list
            const appData = await getAppData();
            _allModes = Object.values(appData?.MODES || {});
            _renderList(_allModes);
        } catch (err) {
            _showResponseMsg(err.message, 'error');
        } finally {
            _setLoading(false, action === 'delete' ? 'delete' : 'submit');
            if (action === 'delete') document.getElementById('modesDeleteModal').classList.add('hidden');
        }
    }

    // ── Bind events ───────────────────────────────────────────────────────────
    function _bindEvents() {
        document.getElementById('modesForm').addEventListener('submit', e => {
            e.preventDefault();
            _handleRequest('submit');
        });
        document.getElementById('modesDeleteBtn').addEventListener('click', () => {
            const modeId = document.getElementById('modesMode').value;
            if (!modeId) return;
            document.getElementById('modesDeleteName').textContent = modeId;
            document.getElementById('modesDeleteModal').classList.remove('hidden');
        });
        document.getElementById('modesCancelDeleteBtn').addEventListener('click', () =>
            document.getElementById('modesDeleteModal').classList.add('hidden')
        );
        document.getElementById('modesConfirmDeleteBtn').addEventListener('click', () =>
            _handleRequest('delete')
        );
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    function load() {
        _injectListPane();
        _injectDetailPane();
        getAppData().then(data => {
            _allModes = Object.values(data?.MODES || {});
            _renderList(_allModes);
        });
    }

    return { load, search, openAddPane };

})();

window.AdminModes = AdminModes;
