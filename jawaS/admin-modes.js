// ============================================================================
// ADMIN-MODES.JS — Transport Modes & Freight Revenue Management (List, View, Edit, Add, Delete)
// Fully matches Master Ledger Plan Section 9.6: Revenue mapping to COA #4000 & SAC compliance
// ============================================================================

const AdminModes = (() => {

    let _allModes = [];
    let _selectedMode = null;
    let _isUpdate = false;
    let _initialized = false;

    function _can(role) { return window.AdminPage?.can(role); }

    function _getSacDescription(sac) {
        const s = String(sac || '').trim();
        if (s === '996812') return 'Courier Services (Express / Premium / Next Day)';
        if (s === '996813') return 'Air Transport of Mail & Cargo';
        if (s === '996511') return 'Road Transport of Goods by GTA / Truck';
        if (s === '996512') return 'Railway Transport of Goods';
        if (s === '996719') return 'Cold Chain & Special Cargo Logistics';
        return s ? `SAC Code ${s}` : 'Courier Services (996812)';
    }

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        document.getElementById('listMsg')?.classList.add('hidden');
        const listPane = document.getElementById('adminList');
        if (listPane) {
            listPane.innerHTML = `<ul id="modesList" class="p-2 space-y-2"></ul>`;
        }
        const searchEl = document.getElementById('listSearch');
        if (searchEl) searchEl.placeholder = 'Search by Mode name or code…';
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
            const isSel = _selectedMode && _selectedMode.MODE === mode.MODE;
            li.className = `p-3 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors border border-gray-200 text-sm ${isSel ? 'bg-indigo-100 border-indigo-300' : ''}`;
            li.dataset.mode = mode.MODE;
            li.innerHTML = `
                <div class="flex items-center justify-between">
                    <strong class="text-indigo-700 block text-sm font-mono">${mode.MODE}</strong>
                    <span class="text-xs bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-200">${mode.SHORT || '—'}</span>
                </div>
                <div class="text-xs text-gray-500 flex justify-between mt-1">
                    <span>Divisor: ${mode.VOL_INGR ? mode.VOL_INGR.toLocaleString('en-IN') : '5,000'}</span>
                    <span>SAC: ${mode.SAC_CODE || '996812'}</span>
                </div>`;
            li.addEventListener('click', () => _selectMode(mode.MODE));
            ul.appendChild(li);
        });
    }

    function search(term) {
        const t = (term || '').toLowerCase();
        _renderList(_allModes.filter(m =>
            (m.MODE || '').toLowerCase().includes(t) || (m.SHORT || '').toLowerCase().includes(t) || (m.SAC_CODE || '').toLowerCase().includes(t)
        ));
    }

    // ── Selection & View/Edit Management ──────────────────────────────────────
    function _selectMode(modeId) {
        const mode = _allModes.find(m => m.MODE === modeId);
        if (!mode) return;
        _selectedMode = mode;
        _renderList(_allModes);
        _renderDetail(mode);
        AdminPage.showDetail(true);
        AdminPage.showDetailPane?.();
    }

    function openAddPane() {
        if (!_can('ADMIN')) {
            showNotification('Access denied. Only Admin can add transport modes.', 'error');
            return;
        }
        _selectedMode = null;
        _renderList(_allModes);
        _renderDetail(null);
        AdminPage.showDetail(true);
        AdminPage.showDetailPane?.();
    }

    // ── Render Detail (View & Edit) ───────────────────────────────────────────
    function _renderDetail(mode) {
        AdminPage.showDetail(true);
        const view = document.getElementById('detailView');
        if (!view) return;

        const isEdit    = !!mode;
        _isUpdate       = isEdit;
        const canEdit   = _can('ADMIN');
        const canDelete = _can('MASTER');

        // Zone counts
        let activeZonesCount = 0;
        let viewZonesHtml = '';
        let editZonesHtml = '';

        for (let i = 1; i <= 14; i++) {
            const zKey = `Z${i}`;
            const val = mode ? (mode[zKey] || 'N').toUpperCase() : 'Y';
            const isActive = val === 'Y';
            if (isActive) activeZonesCount++;

            // View mode card
            viewZonesHtml += `
                <div class="p-2.5 rounded-lg border text-center transition-all ${isActive ? 'bg-emerald-50 border-emerald-200 text-emerald-900 shadow-xs' : 'bg-gray-50 border-gray-200 text-gray-400 opacity-60'}">
                    <span class="block text-xs font-bold font-mono">Z${i}</span>
                    <span class="text-[11px] font-semibold">${isActive ? '✔ Active' : '✖ Inactive'}</span>
                </div>`;

            // Edit mode interactive card
            editZonesHtml += `
                <div class="zone-toggle-card p-2 rounded-lg border text-center cursor-pointer select-none transition-all ${isActive ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-gray-50 border-gray-300 text-gray-400'}"
                     data-zone="${zKey}">
                    <input type="hidden" name="${zKey}" id="modesInput_${zKey}" value="${val}">
                    <span class="block text-xs font-mono mb-1 font-bold">Z${i}</span>
                    <span class="zone-status-text text-[11px] px-1.5 py-0.5 rounded ${isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}">${isActive ? 'Active' : 'Off'}</span>
                </div>`;
        }

        const volIngr = mode?.VOL_INGR ? parseFloat(mode.VOL_INGR) : 5000;
        const minWt   = mode?.MIN_WT != null && mode.MIN_WT !== '' ? parseFloat(mode.MIN_WT) : 0;
        const taxRate = mode?.TAX_RATE != null && mode.TAX_RATE !== '' ? parseFloat(mode.TAX_RATE) : 18.0;
        const sacCode = mode?.SAC_CODE || '996812';
        const sacDesc = _getSacDescription(sacCode);

        // ── View Mode HTML ────────────────────────────────────────────────────
        const viewHtml = isEdit ? `
            <div class="space-y-4">
                <!-- Top Revenue & Double-Entry Accounting Exposure Card -->
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mb-3">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <h4 class="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Freight Revenue Policy &amp; Double-Entry Mapping
                        </h4>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700 font-medium">UOM: <strong class="text-gray-900">${mode.UOM || 'KG'}</strong></span>
                            <span class="text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-emerald-800 font-semibold">${activeZonesCount} of 14 Zones Active</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Volumetric Divisor</span>
                            <span class="text-base font-bold text-gray-800">${volIngr.toLocaleString('en-IN')}</span>
                            <span class="text-[10px] text-gray-400 block mt-0.5">L &times; W &times; H / ${volIngr}</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Min Billable Weight</span>
                            <span class="text-base font-bold text-indigo-700">${minWt} Kg</span>
                            <span class="text-[10px] text-gray-400 block mt-0.5">Minimum Chargeable Threshold</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">GST SAC Code</span>
                            <span class="text-base font-mono font-bold text-gray-900">${sacCode}</span>
                            <span class="text-[10px] text-gray-500 block truncate mt-0.5">${sacDesc}</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">GST Tax Rate</span>
                            <span class="text-base font-bold text-emerald-700">${taxRate}%</span>
                            <span class="text-[10px] text-emerald-600 block mt-0.5">Standard Rate (CGST+SGST/IGST)</span>
                        </div>
                    </div>
                    <div class="mt-2.5 pt-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600 flex-wrap gap-2">
                        <div class="flex items-center gap-2">
                            <span class="font-medium">Revenue Account:</span>
                            <span class="font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">COA #4000 Courier &amp; Cargo Freight Revenue</span>
                        </div>
                        <div class="text-[11px] text-gray-500">
                            Auto-posted on INV: Dr 1010 AR &bull; Cr 4000 Revenue &bull; Cr 2031/2032/2033 Tax
                        </div>
                    </div>
                </div>

                <!-- Section 1: Mode Identity & Volumetric Calculation Rules -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                        1. Mode Identity &amp; Volumetric Calculation Rules
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Mode Name</span>
                            <span class="font-mono font-bold text-indigo-700 text-base">${mode.MODE}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Short Code</span>
                            <span class="px-2 py-0.5 text-xs rounded bg-indigo-50 text-indigo-700 font-bold font-mono inline-block">${mode.SHORT || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Billing UOM</span>
                            <span class="px-2 py-0.5 text-xs rounded bg-gray-100 font-semibold text-gray-800 inline-block">${mode.UOM || 'KG'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Min Chargeable Weight</span>
                            <span class="font-bold text-gray-800">${minWt} Kg</span>
                        </div>
                        <div class="col-span-2 md:col-span-4">
                            <span class="block text-xs font-semibold text-gray-500">Operational Description</span>
                            <span class="text-gray-700">${mode.DESCRIPTION || 'Standard commercial freight &amp; cargo transport mode.'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Statutory GST & Service Accounting (SAC) -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        2. Statutory GST &amp; Service Accounting (SAC)
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">SAC Code</span>
                            <span class="font-mono font-bold text-gray-900">${sacCode}</span>
                        </div>
                        <div class="col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">Service Classification</span>
                            <span class="text-gray-800 font-medium">${sacDesc}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Standard GST Tax Rate</span>
                            <span class="font-bold text-emerald-700">${taxRate}%</span>
                        </div>
                        <div class="col-span-2 md:col-span-4">
                            <span class="block text-xs font-semibold text-gray-500">Output Tax Ledger Accounts</span>
                            <span class="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded border border-gray-200 inline-block">
                                Intra-State: COA #2031 (CGST @ 9%) + COA #2032 (SGST @ 9%) &bull; Inter-State: COA #2033 (IGST @ 18%)
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Pan-India Delivery Zone Coverage -->
                <div class="border-t pt-3.5">
                    <div class="flex items-center justify-between mb-2.5">
                        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                            3. Pan-India Delivery Zone Coverage (Z1 to Z14)
                        </h4>
                        <span class="text-xs text-gray-500">${activeZonesCount} of 14 Available</span>
                    </div>
                    <div class="grid grid-cols-4 md:grid-cols-7 lg:grid-cols-14 gap-2">
                        ${viewZonesHtml}
                    </div>
                </div>

                <!-- Section 4: Double-Entry Revenue Accounting & Audit Trail -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        4. Double-Entry Revenue Accounting &amp; Audit Trail
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Revenue Ledger Key</span>
                            <span class="font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">COA #4000 Freight Revenue</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Line Item Classification</span>
                            <span class="text-gray-800 font-medium">Auto-derived from SAC Code on INV booking</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Record Timestamp</span>
                            <span class="font-mono text-xs text-gray-600">${mode.TIME_STAMP ? (typeof fmtDate === 'function' ? fmtDate(mode.TIME_STAMP, 'full') : mode.TIME_STAMP) : '—'}</span>
                        </div>
                    </div>
                </div>
            </div>
        ` : '';

        // ── Edit Mode HTML ────────────────────────────────────────────────────
        const editFields = `
            <div class="space-y-4">
                <!-- Section 1: Mode Identity & Volumetric Rules -->
                <div class="border border-indigo-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between border-b border-indigo-50 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                            <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 1: Mode Identity &amp; Volumetric Rules</h3>
                        </div>
                        <span class="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">Core Setup</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Mode Identifier *</label>
                            <input type="text" id="modesMode" name="MODE" value="${mode?.MODE || ''}" required ${isEdit ? 'readonly' : ''}
                                class="form-input text-sm uppercase font-mono ${isEdit ? 'readonly-input' : ''}" placeholder="e.g. SURFACE, AIRLINE">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Short Code *</label>
                            <input type="text" name="SHORT" value="${mode?.SHORT || ''}" required maxlength="2"
                                class="form-input text-sm uppercase font-mono" placeholder="e.g. S, E, A, R">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Volumetric Divisor</label>
                            <input type="number" step="any" name="VOL_INGR" value="${mode?.VOL_INGR ?? 5000}"
                                class="form-input text-sm font-mono" placeholder="5000">
                            <p class="text-[11px] text-gray-400 mt-1">L &times; W &times; H (cm) / Divisor</p>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Min Weight (Kg)</label>
                            <input type="number" step="any" name="MIN_WT" value="${mode?.MIN_WT ?? 0.0}"
                                class="form-input text-sm font-mono" placeholder="0.0">
                            <p class="text-[11px] text-gray-400 mt-1">Minimum chargeable threshold</p>
                        </div>
                        <div class="md:col-span-1">
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Billing UOM</label>
                            <select name="UOM" class="form-input text-sm">
                                <option value="KG" ${mode?.UOM === 'KG' ? 'selected' : ''}>KG (Weight Based)</option>
                                <option value="AWB" ${mode?.UOM === 'AWB' ? 'selected' : ''}>AWB (Per Consignment)</option>
                                <option value="SHIPMENT" ${mode?.UOM === 'SHIPMENT' ? 'selected' : ''}>SHIPMENT (E-Commerce)</option>
                                <option value="TRIP" ${mode?.UOM === 'TRIP' ? 'selected' : ''}>TRIP (FTL / Vehicle)</option>
                                <option value="BOX" ${mode?.UOM === 'BOX' ? 'selected' : ''}>BOX (Temperature Container)</option>
                            </select>
                        </div>
                        <div class="md:col-span-3">
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Operational Description</label>
                            <input type="text" name="DESCRIPTION" value="${mode?.DESCRIPTION || ''}"
                                class="form-input text-sm" placeholder="e.g. Standard road freight service across regional hubs">
                        </div>
                    </div>
                </div>

                <!-- Section 2: Statutory GST & Service Accounting (SAC) -->
                <div class="border border-blue-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between border-b border-blue-50 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                            <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 2: Statutory GST &amp; Service Accounting (SAC)</h3>
                        </div>
                        <span class="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">Invoice Compliance</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">GST SAC Code</label>
                            <input type="text" name="SAC_CODE" id="modesSacCode" value="${mode?.SAC_CODE || '996812'}"
                                class="form-input text-sm font-mono" placeholder="996812" maxlength="8">
                            <p class="text-[11px] text-gray-400 mt-1">996812 (Courier), 996511 (Road GTA), 996813 (Air)</p>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">GST Rate (%)</label>
                            <input type="number" step="any" name="TAX_RATE" value="${mode?.TAX_RATE ?? 18.0}"
                                class="form-input text-sm font-mono" placeholder="18.0">
                            <p class="text-[11px] text-gray-400 mt-1">Standard rate (usually 18%)</p>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Revenue Ledger Account</label>
                            <input type="text" value="COA #4000 (Courier &amp; Cargo Freight Revenue)" readonly
                                class="form-input text-sm readonly-input font-mono text-purple-700">
                            <p class="text-[11px] text-gray-400 mt-1">Automatic double-entry revenue credit</p>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Pan-India Delivery Zone Coverage -->
                <div class="border border-emerald-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between border-b border-emerald-50 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                            <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 3: Pan-India Delivery Zone Coverage</h3>
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" id="modesEnableAllZones" class="btn-ghost btn-sm text-xs text-emerald-700 font-semibold">Enable All</button>
                            <span class="text-gray-300">|</span>
                            <button type="button" id="modesDisableAllZones" class="btn-ghost btn-sm text-xs text-gray-500">Disable All</button>
                        </div>
                    </div>
                    <p class="text-xs text-gray-500">Click any zone tile to toggle service availability on or off:</p>
                    <div class="grid grid-cols-4 md:grid-cols-7 lg:grid-cols-14 gap-2" id="modesZoneInputs">
                        ${editZonesHtml}
                    </div>
                </div>

                <!-- Section 4: Double-Entry Revenue Accounting Notice -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 flex items-center gap-3">
                    <svg class="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <div>
                        <span class="font-bold text-slate-900 block mb-0.5">Double-Entry Freight Revenue Automation:</span>
                        <span>When booking shipments on this mode, invoice generation debits <code>COA #1010 Accounts Receivable</code>, credits <code>COA #4000 Courier &amp; Cargo Freight Revenue</code> for taxable freight, and credits output tax accounts (<code>COA #2031 CGST / #2032 SGST / #2033 IGST</code>) per SAC rate.</span>
                    </div>
                </div>

                <!-- Action Controls -->
                <div class="flex justify-end items-center gap-3 pt-3 border-t">
                    <button type="button" id="modesCancelBtn" class="btn-ghost btn-sm">Cancel</button>
                    <button type="submit" id="modesSubmitBtn" class="btn px-6 py-2.5 flex items-center gap-2">
                        <span id="modesSubmitText">${isEdit ? `Update Mode ${mode.MODE}` : 'Submit New Mode'}</span>
                        <div id="modesSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </button>
                </div>
            </div>`;

        // Render container
        view.innerHTML = `
            <div class="detail-card ${isEdit ? 'mode-view' : 'mode-edit'}" id="modeDetailCard">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <h2 class="text-base font-bold text-gray-800">${isEdit ? mode.MODE : 'New Transport Mode'}</h2>
                        <p class="text-xs text-gray-500">${isEdit ? (mode.SHORT ? `Code: ${mode.SHORT} • SAC: ${sacCode}` : '') : 'Configure transport mode, volumetric rules, and zone availability'}</p>
                    </div>
                    ${isEdit ? `
                    <div class="flex gap-2">
                        ${canEdit ? `<button id="modeEditBtn" class="view-only btn btn-sm">Edit Mode</button>` : ''}
                        ${canDelete ? `<button id="modeDeleteBtn" class="view-only btn-danger btn-sm">Delete</button>` : ''}
                        <button id="modeCancelEditBtn" class="edit-only btn-ghost btn-sm">Cancel</button>
                    </div>` : ''}
                </div>
                <div class="detail-card-body">
                    <!-- Inline Delete Confirm Box -->
                    ${isEdit && canDelete ? `
                    <div id="modesDeleteConfirm" class="hidden mb-4 border border-red-200 bg-red-50 rounded-lg p-4">
                        <p class="text-sm text-red-700 font-medium mb-3">
                            Delete mode <strong>${mode.MODE}</strong>?<br>
                            <span class="text-xs text-gray-500">This will remove the mode. Modes with existing orders or rates cannot be deleted.</span>
                        </p>
                        <div class="flex gap-3 items-center flex-wrap">
                            <button id="modesConfirmDeleteBtn" type="button" class="btn-danger btn-sm flex items-center gap-1">
                                <span>Confirm Delete</span>
                                <div id="modesDeleteSpinner" class="hidden ml-2 w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                            <button id="modesCancelDeleteBtn" type="button" class="btn-ghost btn-sm">Cancel</button>
                        </div>
                    </div>` : ''}

                    <!-- View Mode Read-only Content -->
                    <div class="view-only">
                        ${isEdit ? viewHtml : `<p class="text-gray-500 text-sm">Select a transport mode from the list${canEdit ? ' or click + Add to create a new one' : ''}.</p>`}
                    </div>

                    <!-- Edit Mode Form -->
                    ${canEdit ? `
                    <form id="modesForm" class="edit-only">
                        ${editFields}
                    </form>` : '<div class="edit-only p-4 text-center text-sm text-gray-500">Only Admin can add or edit transport modes.</div>'}
                    <div id="modesResponseMsg" class="mt-4 text-center p-3 rounded-lg text-sm hidden"></div>
                </div>
            </div>`;

        // Wire Event Listeners
        _bindDetailEvents(mode);
    }

    // ── Bind Detail Events ────────────────────────────────────────────────────
    function _bindDetailEvents(mode) {
        const view = document.getElementById('detailView');
        if (!view) return;

        // View/Edit mode switching
        const card = document.getElementById('modeDetailCard');
        view.querySelector('#modeEditBtn')?.addEventListener('click', () => {
            if (card) card.className = 'detail-card mode-edit';
        });

        const cancelHandler = () => {
            if (mode) {
                if (card) card.className = 'detail-card mode-view';
                _renderDetail(mode);
            } else {
                AdminPage.showDetail(false);
            }
        };

        view.querySelector('#modeCancelEditBtn')?.addEventListener('click', cancelHandler);
        view.querySelector('#modesCancelBtn')?.addEventListener('click', cancelHandler);

        // Delete flow
        view.querySelector('#modeDeleteBtn')?.addEventListener('click', () => {
            document.getElementById('modesDeleteConfirm')?.classList.remove('hidden');
        });

        view.querySelector('#modesCancelDeleteBtn')?.addEventListener('click', () => {
            document.getElementById('modesDeleteConfirm')?.classList.add('hidden');
        });

        view.querySelector('#modesConfirmDeleteBtn')?.addEventListener('click', () => {
            _handleRequest('delete');
        });

        // Interactive Zone Toggles
        view.querySelectorAll('.zone-toggle-card').forEach(zc => {
            zc.addEventListener('click', () => {
                const zKey = zc.dataset.zone;
                const input = zc.querySelector(`input[name="${zKey}"]`);
                const statusSpan = zc.querySelector('.zone-status-text');
                if (!input) return;

                const cur = input.value === 'Y';
                const next = !cur;
                input.value = next ? 'Y' : 'N';

                if (next) {
                    zc.className = 'zone-toggle-card p-2 rounded-lg border text-center cursor-pointer select-none transition-all bg-emerald-50 border-emerald-300 text-emerald-900 font-bold';
                    if (statusSpan) {
                        statusSpan.className = 'zone-status-text text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800';
                        statusSpan.textContent = 'Active';
                    }
                } else {
                    zc.className = 'zone-toggle-card p-2 rounded-lg border text-center cursor-pointer select-none transition-all bg-gray-50 border-gray-300 text-gray-400';
                    if (statusSpan) {
                        statusSpan.className = 'zone-status-text text-[11px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600';
                        statusSpan.textContent = 'Off';
                    }
                }
            });
        });

        // Enable All / Disable All Zones
        view.querySelector('#modesEnableAllZones')?.addEventListener('click', () => {
            view.querySelectorAll('.zone-toggle-card').forEach(zc => {
                const zKey = zc.dataset.zone;
                const input = zc.querySelector(`input[name="${zKey}"]`);
                const statusSpan = zc.querySelector('.zone-status-text');
                if (input) input.value = 'Y';
                zc.className = 'zone-toggle-card p-2 rounded-lg border text-center cursor-pointer select-none transition-all bg-emerald-50 border-emerald-300 text-emerald-900 font-bold';
                if (statusSpan) {
                    statusSpan.className = 'zone-status-text text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800';
                    statusSpan.textContent = 'Active';
                }
            });
        });

        view.querySelector('#modesDisableAllZones')?.addEventListener('click', () => {
            view.querySelectorAll('.zone-toggle-card').forEach(zc => {
                const zKey = zc.dataset.zone;
                const input = zc.querySelector(`input[name="${zKey}"]`);
                const statusSpan = zc.querySelector('.zone-status-text');
                if (input) input.value = 'N';
                zc.className = 'zone-toggle-card p-2 rounded-lg border text-center cursor-pointer select-none transition-all bg-gray-50 border-gray-300 text-gray-400';
                if (statusSpan) {
                    statusSpan.className = 'zone-status-text text-[11px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600';
                    statusSpan.textContent = 'Off';
                }
            });
        });

        // Form Submit
        view.querySelector('#modesForm')?.addEventListener('submit', e => {
            e.preventDefault();
            _handleRequest('submit');
        });
    }

    // ── Loading & Messaging ───────────────────────────────────────────────────
    function _setLoading(isLoading, type) {
        if (type === 'delete') {
            const sp = document.getElementById('modesDeleteSpinner');
            const btn = document.getElementById('modesConfirmDeleteBtn');
            const cbtn = document.getElementById('modesCancelDeleteBtn');
            if (sp) sp.classList.toggle('hidden', !isLoading);
            if (btn) btn.disabled = isLoading;
            if (cbtn) cbtn.disabled = isLoading;
        } else {
            const sp = document.getElementById('modesSpinner');
            const btn = document.getElementById('modesSubmitBtn');
            const txt = document.getElementById('modesSubmitText');
            if (sp) sp.classList.toggle('hidden', !isLoading);
            if (btn) btn.disabled = isLoading;
            const modeVal = document.getElementById('modesMode')?.value || '';
            if (txt) {
                txt.textContent = isLoading
                    ? (_isUpdate ? 'Updating…' : 'Submitting…')
                    : (_isUpdate ? `Update Mode ${modeVal}` : 'Submit New Mode');
            }
        }
    }

    function _showResponseMsg(message, type) {
        const el = document.getElementById('modesResponseMsg');
        if (!el) return;
        el.innerHTML = `<p class="font-semibold">${message}</p>`;
        el.className = `mt-4 text-center p-3 rounded-lg text-sm ${
            type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
            type === 'info'    ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                 'bg-red-100 text-red-800 border border-red-200'
        }`;
        el.classList.remove('hidden');
    }

    // ── API Operations ────────────────────────────────────────────────────────
    async function _handleRequest(action) {
        const isDel = action === 'delete';
        if (isDel && !_can('MASTER')) {
            showNotification('Access denied. Master role required to delete mode.', 'error');
            return;
        }
        if (!isDel && !_can('ADMIN')) {
            showNotification('Access denied. Admin role required to create or edit mode.', 'error');
            return;
        }
        _setLoading(true, isDel ? 'delete' : 'submit');
        let data = {};
        if (isDel) {
            data.MODE = document.getElementById('modesMode')?.value || _selectedMode?.MODE || '';
        } else {
            new FormData(document.getElementById('modesForm')).forEach((v, k) => { data[k] = v; });
        }

        try {
            // Write/Delete is OTP gated in backend
            const result = await callApi(
                isDel ? '/api/deleteMode' : '/api/writeMode',
                isDel ? { MODE: data.MODE } : { data, record_id: _isUpdate ? data.MODE : null },
                'POST'
            );

            _showResponseMsg(result.message || (isDel ? 'Mode deleted successfully.' : 'Mode saved successfully.'), 'success');

            // Refresh local cache and list
            const appData = await getAppData();
            _allModes = Object.values(appData?.MODES || {});
            _renderList(_allModes);

            if (isDel) {
                _selectedMode = null;
                setTimeout(() => {
                    AdminPage.showDetail(false);
                }, 500);
            } else {
                const savedMode = _allModes.find(m => m.MODE === (data.MODE || '').toUpperCase());
                if (savedMode) {
                    _selectedMode = savedMode;
                    setTimeout(() => {
                        _renderDetail(savedMode);
                    }, 200);
                }
            }
        } catch (err) {
            if (err.message !== 'OTP action cancelled') {
                _showResponseMsg(err.message, 'error');
            }
        } finally {
            _setLoading(false, isDel ? 'delete' : 'submit');
            if (isDel) {
                document.getElementById('modesDeleteConfirm')?.classList.add('hidden');
            }
        }
    }

    // ── Public Load ───────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();
        const data = await getAppData();
        if (data?.MODES) {
            _allModes = Object.values(data.MODES);
            _renderList(_allModes);
        }
        if (!_selectedMode && _allModes.length > 0) {
            _selectMode(_allModes[0].MODE);
        } else if (_selectedMode) {
            _renderDetail(_selectedMode);
        }
    }

    return { load, search, openAddPane };
})();

window.AdminModes = AdminModes;
