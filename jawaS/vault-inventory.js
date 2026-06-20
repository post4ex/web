// ============================================================================
// VAULT-INVENTORY.JS — Inventory Overview Dashboard (Manager.io)
// Tile: inventory
// API: /api/manager/all-inventory-items, /api/manager/inventory-item-details/{branch}/{key}
// ============================================================================

const VaultInventory = (() => {

    let _allItems = [];

    // ── Helpers ──────────────────────────────────────────────────────────────
    function fmt(n) {
        if (n === null || n === undefined || n === '') return '—';
        const v = typeof n === 'string' ? parseFloat(n) : n;
        return isNaN(v) ? '—' : '₹ ' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtInt(n) {
        if (n === null || n === undefined || n === '') return '—';
        const v = typeof n === 'string' ? parseInt(n, 10) : n;
        return isNaN(v) ? '—' : v.toLocaleString('en-IN');
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Filter state ────────────────────────────────────────────────────────────
    let _filterBranch = '';
    let _filterStatus = '';  // '', 'instock', 'lowstock', 'outofstock'

    function _clean() {
        document.getElementById('vaultListMsg').textContent = '';
        document.getElementById('vaultList').innerHTML = '';
        VaultPage.showDetail(false);
        document.getElementById('vaultSearch').placeholder = 'Search items…';
        // Remove any existing filter UI
        document.getElementById('invFilterBtn')?.remove();
        document.getElementById('invStatus')?.remove();
        document.getElementById('invFilterModal')?.remove();
    }

    // ── Load ─────────────────────────────────────────────────────────────────
    async function load() {
        _clean();

        const searchInput = document.getElementById('vaultSearch');
        if (searchInput) searchInput.oninput = () => search();

        const listEl = document.getElementById('vaultList');
        listEl.innerHTML = '<li class="text-center text-gray-400 text-sm py-6"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading inventory…</li>';

        window.setLoading?.(true, 'Loading inventory...', 'list');
        try {
            const branch = VaultPage.getActiveBranch();
            const url = branch ? `/api/manager/all-inventory-items?branch=${encodeURIComponent(branch)}` : '/api/manager/all-inventory-items';
            const res = await callApi(url, {}, 'GET');
            _allItems = res.inventoryItems || [];
        } catch (err) {
            console.error('[VaultInventory] load error:', err);
            _allItems = [];
        } finally {
            window.setLoading?.(false);
        }

        // Add filter button + status
        _injectFilterUI();

        _renderList();
    }

    function search(q) {
        _renderList(q);
    }

    // ── Filter UI ────────────────────────────────────────────────────────────
    function _injectFilterUI() {
        const listPane = document.getElementById('vaultListPane');
        const header   = listPane?.querySelector('.sv-pane-header');
        if (!header) return;
        document.getElementById('invFilterBtn')?.remove();
        document.getElementById('invStatus')?.remove();

        // Filter button in search row
        const searchInput = document.getElementById('vaultSearch');
        let searchRow = searchInput?.parentElement;
        if (searchInput && searchRow && !searchRow.classList.contains('flex')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'flex gap-2 w-full mt-2';
            searchRow.insertBefore(wrapper, searchInput);
            wrapper.appendChild(searchInput);
            searchInput.classList.remove('mt-2');
            searchRow = wrapper;
        }

        const filterBtn = document.createElement('button');
        filterBtn.id = 'invFilterBtn';
        filterBtn.className = 'btn-ghost btn-sm flex-shrink-0';
        filterBtn.title = 'Filter Inventory';
        filterBtn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>`;
        filterBtn.onclick = () => document.getElementById('invFilterModal')?.classList.remove('hidden');
        searchRow?.appendChild(filterBtn);

        // Status label
        const statusEl = document.createElement('div');
        statusEl.id = 'invStatus';
        statusEl.className = 'flex items-center gap-2 flex-wrap';
        statusEl.innerHTML = `
            <span class="text-xs text-gray-500 font-medium bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200 whitespace-nowrap">
                <i class="fa-solid fa-boxes-stacked text-indigo-500 mr-1"></i>
                <span id="invCount">${_allItems.length}</span> items
            </span>
        `;
        header.appendChild(statusEl);

        // Filter modal
        if (!document.getElementById('invFilterModal')) {
            const modal = document.createElement('div');
            modal.id = 'invFilterModal';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-content space-y-4 max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-5">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h2 class="text-lg font-bold text-gray-800">Filter Inventory</h2>
                        <button onclick="document.getElementById('invFilterModal').classList.add('hidden')" class="p-1 text-gray-400 hover:text-gray-700 transition-colors">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Branch</label>
                            <select id="invFilterBranch" class="form-input text-xs">
                                <option value="">All Branches</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold text-gray-600 mb-1">Stock Status</label>
                            <select id="invFilterStatus" class="form-input text-xs">
                                <option value="">All Items</option>
                                <option value="instock">In Stock (>0)</option>
                                <option value="lowstock">Low Stock (1-5)</option>
                                <option value="outofstock">Out of Stock (=0)</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button id="invResetBtn" class="btn-ghost btn-sm">Reset</button>
                        <button id="invApplyBtn" class="btn btn-sm">Apply Filters</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

            document.getElementById('invApplyBtn').onclick = async () => {
                _filterBranch = document.getElementById('invFilterBranch').value;
                _filterStatus = document.getElementById('invFilterStatus').value;
                modal.classList.add('hidden');
                _renderList();
            };

            document.getElementById('invResetBtn').onclick = async () => {
                document.getElementById('invFilterBranch').value = '';
                document.getElementById('invFilterStatus').value = '';
                _filterBranch = '';
                _filterStatus = '';
                _renderList();
            };

            // Populate branches in filter dropdown
            getAppData().then(data => {
                const select = document.getElementById('invFilterBranch');
                if (select && data?.BRANCHES) {
                    Object.values(data.BRANCHES).forEach(b => {
                        if (b.BRANCH_CODE) {
                            const opt = document.createElement('option');
                            opt.value = b.BRANCH_CODE;
                            opt.textContent = b.BRANCH_CODE.toUpperCase();
                            select.appendChild(opt);
                        }
                    });
                }
            });
        }
    }

    // ── Render List ──────────────────────────────────────────────────────────
    function _renderList(searchTerm) {
        const listEl = document.getElementById('vaultList');
        listEl.innerHTML = '';

        let filtered = [..._allItems];
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            filtered = filtered.filter(it =>
                (it.itemName || '').toLowerCase().includes(q) ||
                (it.itemCode || '').toLowerCase().includes(q) ||
                (it.description || '').toLowerCase().includes(q)
            );
        }

        // Apply branch filter
        if (_filterBranch) {
            filtered = filtered.filter(it =>
                (it.branch || '').toLowerCase() === _filterBranch.toLowerCase()
            );
        }

        // Apply stock status filter
        if (_filterStatus) {
            filtered = filtered.filter(it => {
                const qoh = parseFloat(it.qtyOnHand) || 0;
                if (_filterStatus === 'instock') return qoh > 5;
                if (_filterStatus === 'lowstock') return qoh > 0 && qoh <= 5;
                if (_filterStatus === 'outofstock') return qoh <= 0;
                return true;
            });
        }

        // Update count with filter badge
        const countEl = document.getElementById('invCount');
        if (countEl) {
            const total = _allItems.length;
            const shown = filtered.length;
            countEl.textContent = shown;
            const statusEl = document.getElementById('invStatus');
            if (statusEl && shown !== total) {
                if (!document.getElementById('invFilterBadge')) {
                    const badge = document.createElement('span');
                    badge.id = 'invFilterBadge';
                    badge.className = 'text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 whitespace-nowrap';
                    statusEl.appendChild(badge);
                }
                document.getElementById('invFilterBadge').textContent = `filtered (${total} total)`;
            } else {
                document.getElementById('invFilterBadge')?.remove();
            }
        }

        if (filtered.length === 0) {
            listEl.innerHTML = `<li class="text-center text-gray-400 text-sm py-6">${_allItems.length === 0 ? 'No inventory items found.' : 'No items match your search.'}</li>`;
            return;
        }

        // Summary cards
        const totalQty = filtered.reduce((s, it) => s + (parseFloat(it.qtyOnHand) || 0), 0);
        const totalCost = filtered.reduce((s, it) => s + (parseFloat(it.totalCost) || 0), 0);
        const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
        const lowStock = filtered.filter(it => (parseFloat(it.qtyOnHand) || 0) <= 0).length;

        const summaryHtml = `
            <li class="px-3 py-2.5 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="bg-white rounded-lg p-2.5 shadow-sm border border-indigo-100">
                        <div class="text-[9px] uppercase tracking-wider text-indigo-600 font-semibold">Total Items</div>
                        <div class="text-lg font-bold text-gray-800 mt-0.5">${fmtInt(filtered.length)}</div>
                    </div>
                    <div class="bg-white rounded-lg p-2.5 shadow-sm border border-green-100">
                        <div class="text-[9px] uppercase tracking-wider text-green-600 font-semibold">Qty On Hand</div>
                        <div class="text-lg font-bold text-gray-800 mt-0.5">${fmtInt(totalQty)}</div>
                    </div>
                    <div class="bg-white rounded-lg p-2.5 shadow-sm border border-amber-100">
                        <div class="text-[9px] uppercase tracking-wider text-amber-600 font-semibold">Stock Value</div>
                        <div class="text-lg font-bold text-gray-800 mt-0.5">${fmt(totalCost)}</div>
                    </div>
                    <div class="bg-white rounded-lg p-2.5 shadow-sm border border-rose-100">
                        <div class="text-[9px] uppercase tracking-wider text-rose-600 font-semibold">Out of Stock</div>
                        <div class="text-lg font-bold text-gray-800 mt-0.5">${fmtInt(lowStock)}</div>
                    </div>
                </div>
            </li>
        `;
        listEl.innerHTML += summaryHtml;

        // Item rows
        filtered.forEach(it => {
            const qoh = parseFloat(it.qtyOnHand) || 0;
            const avail = parseFloat(it.qtyAvailable) || 0;
            const reserved = parseFloat(it.qtyReserved) || 0;
            const avgC = parseFloat(it.averageCost) || 0;

            const stockColor = qoh <= 0 ? 'text-red-600' : qoh <= 5 ? 'text-amber-600' : 'text-green-600';
            const stockBg = qoh <= 0 ? 'bg-red-50' : qoh <= 5 ? 'bg-amber-50' : 'bg-green-50';

            const li = document.createElement('li');
            li.className = `px-3 py-2.5 border-b border-gray-100 cursor-pointer hover:bg-indigo-50 transition-colors`;
            li.dataset.key = it.key;
            li.dataset.branch = it.branch || '';

            li.innerHTML = `
                <div class="flex items-center justify-between gap-3">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${qoh > 0 ? 'bg-green-400' : 'bg-red-400'} shrink-0"></span>
                            <div>
                                <span class="font-semibold text-sm text-gray-800">${_escapeHtml(it.itemName || 'Unnamed Item')}</span>
                                ${it.itemCode ? `<span class="text-[10px] text-gray-400 font-mono ml-1">(${_escapeHtml(it.itemCode)})</span>` : ''}
                            </div>
                        </div>
                        ${it.description ? `<div class="text-[11px] text-gray-400 truncate mt-0.5 ml-4">${_escapeHtml(it.description)}</div>` : ''}
                    </div>
                    <div class="flex items-center gap-4 shrink-0">
                        <div class="text-right">
                            <div class="text-xs text-gray-400">Stock</div>
                            <div class="text-sm font-bold ${stockColor}">${fmtInt(qoh)}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-xs text-gray-400">Available</div>
                            <div class="text-sm font-semibold text-gray-700">${fmtInt(avail)}</div>
                        </div>
                        <div class="text-right hidden sm:block">
                            <div class="text-xs text-gray-400">Avg Cost</div>
                            <div class="text-sm font-semibold text-gray-700">${fmt(avgC)}</div>
                        </div>
                        <div class="text-right hidden md:block">
                            <div class="text-xs text-gray-400">Total Value</div>
                            <div class="text-sm font-semibold text-gray-700">${fmt(it.totalCost)}</div>
                        </div>
                    </div>
                </div>
            `;

            li.addEventListener('click', () => _showDetail(it));
            listEl.appendChild(li);
        });
    }

    // ── Detail View ──────────────────────────────────────────────────────────
    async function _showDetail(item) {
        VaultPage.showDetail(true);
        const detailEl = document.getElementById('vaultDetailView');
        detailEl.innerHTML = '<div class="text-center text-gray-400 text-sm py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading details…</div>';

        let formData = {};
        if (item.key && item.branch) {
            try {
                formData = await callApi(`/api/manager/inventory-item-details/${item.branch}/${item.key}`, {}, 'GET');
            } catch (err) {
                console.error('[VaultInventory] detail error:', err);
            }
        }

        const qoh = parseFloat(item.qtyOnHand) || 0;
        const avail = parseFloat(item.qtyAvailable) || 0;
        const reserved = parseFloat(item.qtyReserved) || 0;
        const onOrder = parseFloat(item.qtyOnOrder) || 0;
        const avgC = parseFloat(item.averageCost) || 0;
        const totalC = parseFloat(item.totalCost) || 0;
        const saleP = parseFloat(item.salePrice) || 0;
        const purchaseP = parseFloat(item.purchasePrice) || 0;

        detailEl.innerHTML = `
            <div class="p-3 sm:p-4 space-y-3">
                <!-- Back button (mobile) -->
                <button onclick="VaultPage.showDetailPane(); VaultPage._showListPane()" class="sm:hidden flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
                    <i class="fa-solid fa-arrow-left text-xs"></i> Back
                </button>

                <!-- Header -->
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                    <div class="flex-1 min-w-0">
                        <h2 class="text-lg font-bold text-gray-800 truncate">${formData.ItemName || item.itemName || 'Unnamed Item'}</h2>
                        ${item.itemCode ? `<div class="text-xs text-gray-400 font-mono">Code: ${item.itemCode}</div>` : ''}
                        <div class="text-xs text-gray-400 mt-0.5">Branch: ${item.branch || '—'}</div>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button onclick="VaultInventory._printItem('${item.key}', '${item.branch || ''}')" class="flex-1 sm:flex-none min-w-0 justify-center inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                            <i class="fa-solid fa-print shrink-0"></i>
                            <span class="truncate">Print</span>
                        </button>
                    </div>
                </div>

                <!-- Stock cards -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                        <div class="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Qty On Hand</div>
                        <div class="text-xl font-bold ${qoh <= 0 ? 'text-red-600' : qoh <= 5 ? 'text-amber-600' : 'text-green-600'}">${fmtInt(qoh)}</div>
                    </div>
                    <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                        <div class="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Available</div>
                        <div class="text-xl font-bold text-gray-800">${fmtInt(avail)}</div>
                    </div>
                    <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                        <div class="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Reserved</div>
                        <div class="text-xl font-bold text-gray-800">${fmtInt(reserved)}</div>
                    </div>
                    <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                        <div class="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">On Order</div>
                        <div class="text-xl font-bold text-gray-800">${fmtInt(onOrder)}</div>
                    </div>
                </div>

                <!-- Pricing & Value -->
                <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div class="px-3 py-2 bg-gray-50 border-b border-gray-200">
                        <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-wider">Pricing & Valuation</h3>
                    </div>
                    <div class="p-3">
                        <table class="w-full text-sm">
                            <tbody>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 text-gray-500">Sale Price</td>
                                    <td class="py-2 text-right font-semibold">${fmt(saleP)}</td>
                                </tr>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 text-gray-500">Purchase Price</td>
                                    <td class="py-2 text-right font-semibold">${fmt(purchaseP)}</td>
                                </tr>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 text-gray-500">Average Cost</td>
                                    <td class="py-2 text-right font-semibold">${fmt(avgC)}</td>
                                </tr>
                                <tr>
                                    <td class="py-2 text-gray-700 font-semibold">Total Stock Value</td>
                                    <td class="py-2 text-right font-bold text-indigo-600 text-base">${fmt(totalC)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Details -->
                <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div class="px-3 py-2 bg-gray-50 border-b border-gray-200">
                        <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-wider">Details</h3>
                    </div>
                    <div class="p-3">
                        <table class="w-full text-sm">
                            <tbody>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 text-gray-500 w-1/3">Valuation Method</td>
                                    <td class="py-2 text-right font-medium">${item.valuationMethod || '—'}</td>
                                </tr>
                                <tr class="border-b border-gray-100">
                                    <td class="py-2 text-gray-500">Unit Name</td>
                                    <td class="py-2 text-right font-medium">${item.unitName || '—'}</td>
                                </tr>
                                ${formData.Description ? `<tr class="border-b border-gray-100">
                                    <td class="py-2 text-gray-500">Description</td>
                                    <td class="py-2 text-right font-medium">${formData.Description}</td>
                                </tr>` : ''}
                                ${formData.ControlAccount ? `<tr>
                                    <td class="py-2 text-gray-500">Control Account</td>
                                    <td class="py-2 text-right font-medium">${formData.ControlAccount}</td>
                                </tr>` : ''}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Low stock warning -->
                ${qoh <= 0 ? `
                <div class="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2.5">
                    <i class="fa-solid fa-triangle-exclamation text-red-500"></i>
                    <span class="text-sm text-red-700 font-medium">This item is out of stock.</span>
                </div>
                ` : qoh <= 5 ? `
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2.5">
                    <i class="fa-solid fa-circle-exclamation text-amber-500"></i>
                    <span class="text-sm text-amber-700 font-medium">Low stock — only ${fmtInt(qoh)} units remaining.</span>
                </div>
                ` : ''}
            </div>
        `;
    }

    // ── Print ────────────────────────────────────────────────────────────────
    function _printItem(key, branch) {
        const item = _allItems.find(it => it.key === key);
        if (!item) return;

        const itemName = _escapeHtml(item.itemName || 'Item');
        const itemCode = _escapeHtml(item.itemCode || '');
        const itemDesc = _escapeHtml(item.description || '');
        const itemBranch = _escapeHtml(item.branch || '—');

        const qoh = parseFloat(item.qtyOnHand) || 0;
        const avail = parseFloat(item.qtyAvailable) || 0;
        const reserved = parseFloat(item.qtyReserved) || 0;
        const avgC = parseFloat(item.averageCost) || 0;
        const totalC = parseFloat(item.totalCost) || 0;

        const w = window.open('', '_blank', 'width=550,height=700,scrollbars=yes');
        w.document.write(`<!DOCTYPE html>
<html>
<head><title>Inventory Card — ${itemName}</title>
<style>
    @page { size: A4; margin: 15mm; }
    @media print { body { margin: 0; padding: 0; } .no-print { display: none !important; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 12px; color: #333; padding: 20px; }
    .hdr { text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 16px; }
    .hdr h1 { font-size: 18px; color: #4338ca; margin-bottom: 2px; }
    .hdr .sub { font-size: 10px; color: #888; }
    .div { border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
    .divb { background: #f9fafb; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.5px; }
    .info { padding: 8px 12px; }
    .table { width: 100%; border-collapse: collapse; }
    .table td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
    .table td:first-child { color: #888; width: 40%; }
    .table td:last-child { text-align: right; font-weight: 600; }
    .stock { font-size: 24px; font-weight: 800; color: ${qoh <= 0 ? '#dc2626' : qoh <= 5 ? '#d97706' : '#16a34a'}; text-align: center; padding: 10px 0; }
    .stock-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; text-align: center; margin-bottom: 2px; }
    .sig { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 10px; color: #888; }
    .no-print { position: fixed; top: 10px; right: 10px; display: flex; gap: 6px; }
    .print-btn, .close-btn { padding: 6px 14px; border: none; border-radius: 4px; font-size: 11px; cursor: pointer; }
    .print-btn { background: #6366f1; color: #fff; }
    .print-btn:hover { background: #4f46e5; }
    .close-btn { background: #e5e7eb; color: #555; }
    .close-btn:hover { background: #d1d5db; }
</style></head>
<body>
    <div class="no-print">
        <button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Print</button>
        <button class="close-btn" onclick="window.close()">Close</button>
    </div>

    <div class="hdr">
        <h1>Inventory Card</h1>
        <div class="sub">${itemName} ${itemCode ? `(${itemCode})` : ''}</div>
        <div class="sub">Branch: ${itemBranch}</div>
    </div>

    <div class="stock-label">Quantity On Hand</div>
    <div class="stock">${qoh.toLocaleString('en-IN')}</div>

    <div class="div">
        <div class="divb">Stock Levels</div>
        <div class="info">
            <table class="table">
                <tr><td>Qty Available</td><td>${avail.toLocaleString('en-IN')}</td></tr>
                <tr><td>Qty Reserved</td><td>${reserved.toLocaleString('en-IN')}</td></tr>
                <tr><td>Qty On Order</td><td>${(parseFloat(item.qtyOnOrder) || 0).toLocaleString('en-IN')}</td></tr>
                <tr><td>Qty To Deliver</td><td>${(parseFloat(item.qtyToDeliver) || 0).toLocaleString('en-IN')}</td></tr>
                <tr><td>Qty To Receive</td><td>${(parseFloat(item.qtyToReceive) || 0).toLocaleString('en-IN')}</td></tr>
            </table>
        </div>
    </div>

    <div class="div">
        <div class="divb">Pricing & Valuation</div>
        <div class="info">
            <table class="table">
                <tr><td>Sale Price</td><td>${fmt(parseFloat(item.salePrice) || 0)}</td></tr>
                <tr><td>Purchase Price</td><td>${fmt(parseFloat(item.purchasePrice) || 0)}</td></tr>
                <tr><td>Average Cost</td><td>${fmt(avgC)}</td></tr>
                <tr><td>Total Stock Value</td><td style="font-size:13px; font-weight:800; color:#4338ca;">${fmt(totalC)}</td></tr>
            </table>
        </div>
    </div>

    <div class="div">
        <div class="divb">Details</div>
        <div class="info">
            <table class="table">
                <tr><td>Valuation Method</td><td>${item.valuationMethod || '—'}</td></tr>
                <tr><td>Unit Name</td><td>${item.unitName || '—'}</td></tr>
                ${itemDesc ? `<tr><td>Description</td><td>${itemDesc}</td></tr>` : ''}
                <tr><td>Last Updated</td><td>${_escapeHtml(item.timestamp || '—')}</td></tr>
            </table>
        </div>
    </div>

    <div class="sig">
        <span>Generated: ${new Date().toLocaleDateString('en-IN')}</span>
        <span>Authorized Signatory</span>
    </div>

    <script>
        window.onload = function() { setTimeout(() => { window.print(); }, 500); };
    <\/script>
</body>
</html>`);
        w.document.close();
    }

    return { load, search, _printItem };
})();

window.VaultInventory = VaultInventory;
