// ============================================================================
// ADMIN-PINCODES.JS — Pincode lookup tile (read-only, no CRUD)
// Uses searchPin (local map + API fallback) and searchDestination (city search)
// ============================================================================

const AdminPincodes = (() => {

    let _debounce = null;

    function _injectListPane() {
        const listMsg = document.getElementById('listMsg');
        if (listMsg) listMsg.classList.add('hidden');
        document.getElementById('adminList').innerHTML = `<div id="pinListContent" class="p-2 text-xs text-gray-400 text-center">Enter a pincode or city name to search.</div>`;
        const searchEl = document.getElementById('listSearch');
        if (searchEl) searchEl.placeholder = 'Pincode or city name…';
    }

    // ── Search input handler ──────────────────────────────────────────────────
    function search(q) {
        clearTimeout(_debounce);
        const val = q.trim();
        if (!val) {
            document.getElementById('pinListContent').innerHTML = '<p class="text-xs text-gray-400 text-center">Enter a pincode or city name to search.</p>';
            AdminPage.showDetail(false);
            return;
        }
        _debounce = setTimeout(() => _doSearch(val), 350);
    }

    async function _doSearch(val) {
        const el = document.getElementById('pinListContent');
        if (!el) return;
        el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Searching…</p>';

        // 6-digit number → pincode lookup
        if (/^\d{6}$/.test(val)) {
            const res = await window.searchPin(val);
            if (res.found) {
                _renderList([{ PINCODE: val, CITY: res.CITY, STATE: res.STATE_NAME || res.STATE }]);
                _renderDetail(val, res);
            } else {
                el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Pincode not found.</p>';
                AdminPage.showDetail(false);
            }
            return;
        }

        // City/area name → list matching pincodes via searchDestination
        if (typeof searchDestination !== 'function') {
            el.innerHTML = '<p class="text-xs text-red-400 text-center py-4">City search not available.</p>';
            return;
        }
        const results = await searchDestination(val);
        if (!results.length) {
            el.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">No results found.</p>';
            AdminPage.showDetail(false);
            return;
        }
        _renderList(results.map(r => ({ PINCODE: r.PINCODE, CITY: r.DISTRICT, STATE: r.STATE, NAME: r.NAME })));
    }

    // ── List ──────────────────────────────────────────────────────────────────
    function _renderList(items) {
        const el = document.getElementById('pinListContent');
        if (!el) return;
        el.innerHTML = `<ul class="space-y-2">${items.map(r => `
            <li data-pin="${r.PINCODE}" class="p-3 rounded-lg cursor-pointer hover:bg-indigo-50 border border-gray-200 transition-colors">
                <strong class="text-indigo-700 block text-sm">${r.PINCODE}</strong>
                <span class="text-xs text-gray-600">${r.NAME || r.CITY || ''}</span>
                <span class="text-xs text-gray-400 block">${r.STATE || ''}</span>
            </li>`).join('')}
        </ul>`;
        el.querySelectorAll('li').forEach(li =>
            li.addEventListener('click', async () => {
                el.querySelectorAll('li').forEach(x => x.classList.remove('bg-indigo-100', 'border-indigo-300'));
                li.classList.add('bg-indigo-100', 'border-indigo-300');
                const res = await window.searchPin(li.dataset.pin);
                if (res.found) _renderDetail(li.dataset.pin, res);
                AdminPage.showDetailPane();
            })
        );
    }

    // ── Detail ────────────────────────────────────────────────────────────────
    function _renderDetail(pin, res) {
        AdminPage.showDetail(true);
        const view = document.getElementById('detailView');
        if (!view) return;

        const tat = (val) => val === null ? '—' : val === 'N' ? '✗ Not serviceable' : `${val} day${val !== 1 ? 's' : ''}`;
        const badge = (val) => {
            if (val === null) return '<span class="text-gray-400">—</span>';
            if (val === 'N' || val === false) return '<span class="text-red-500 font-medium">✗ No</span>';
            return '<span class="text-green-600 font-medium">✓ Yes</span>';
        };

        view.innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header">
                    <h2 class="text-base font-bold text-gray-800">📍 ${pin}</h2>
                </div>
                <div class="detail-card-body space-y-4">
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-gray-50 rounded p-3">
                            <p class="text-xs text-gray-500 mb-0.5">City / District</p>
                            <p class="text-sm font-semibold text-gray-800">${res.CITY || '—'}</p>
                        </div>
                        <div class="bg-gray-50 rounded p-3">
                            <p class="text-xs text-gray-500 mb-0.5">State</p>
                            <p class="text-sm font-semibold text-gray-800">${res.STATE_NAME || res.STATE || '—'}</p>
                        </div>
                        <div class="bg-gray-50 rounded p-3">
                            <p class="text-xs text-gray-500 mb-0.5">State Code</p>
                            <p class="text-sm font-semibold text-gray-800">${res.STATE_CODE || '—'}</p>
                        </div>
                        <div class="bg-gray-50 rounded p-3">
                            <p class="text-xs text-gray-500 mb-0.5">GST Code</p>
                            <p class="text-sm font-semibold text-gray-800">${res.GST_CODE || '—'}</p>
                        </div>
                        <div class="bg-gray-50 rounded p-3">
                            <p class="text-xs text-gray-500 mb-0.5">Zone</p>
                            <p class="text-sm font-semibold text-gray-800">${res.ZONE || '—'}</p>
                        </div>
                        <div class="bg-gray-50 rounded p-3">
                            <p class="text-xs text-gray-500 mb-0.5">ODA</p>
                            <p class="text-sm font-semibold">${badge(res.ODA)}</p>
                        </div>
                    </div>
                    <div class="detail-card border border-gray-100">
                        <div class="detail-card-header"><h3 class="text-xs font-semibold text-gray-600">TAT (Transit Time)</h3></div>
                        <div class="detail-card-body grid grid-cols-2 gap-2 text-xs">
                            <div><span class="text-gray-500">Express:</span> <span class="font-medium">${tat(res.EXPRESS_TAT)}</span></div>
                            <div><span class="text-gray-500">Airline:</span> <span class="font-medium">${tat(res.AIRLINE_TAT)}</span></div>
                            <div><span class="text-gray-500">Surface:</span> <span class="font-medium">${tat(res.SURFACE_TAT)}</span></div>
                            <div><span class="text-gray-500">Premium:</span> <span class="font-medium">${tat(res.PREMIUM_TAT)}</span></div>
                        </div>
                    </div>
                </div>
            </div>`;

        AdminPage.showDetailPane();
    }

    // ── Entry ─────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        AdminPage.showDetail(false);
    }

    return { load, search };
})();

window.AdminPincodes = AdminPincodes;
