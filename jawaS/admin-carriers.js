// ============================================================================
// ADMIN-CARRIERS.JS — Carriers & Logistics Vendors Tile
// Aligned with Master Ledger Implant Plan (Section 9.4 & 11.2)
// Accounts Payable COA #2010 Subledger Binding & 6-Section Clean Architecture
// ============================================================================

const AdminCarriers = (() => {

    let _allCarriers     = [];
    let _selectedCarrier = null;
    let _isUpdate        = false;
    let _pinTimer        = null;
    let _deleteAbort     = null;   // AbortController for deleteCarrierBtn listener

    function _can(role) { return window.AdminPage?.can(role); }

    function _formatTimestamp(ts) {
        if (!ts) return '—';
        try {
            const num = Number(ts);
            const d = !isNaN(num) ? new Date(num) : new Date(ts);
            if (isNaN(d.getTime())) return String(ts);
            return d.toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true
            });
        } catch {
            return String(ts);
        }
    }

    // ── List pane ─────────────────────────────────────────────────────────────
    function _injectListPane() {
        const listMsg = document.getElementById('listMsg');
        if (listMsg) listMsg.classList.add('hidden');
        const adminList = document.getElementById('adminList');
        if (adminList) {
            adminList.innerHTML = `<ul id="carriersList" class="p-4 space-y-2"></ul>`;
        }
        const searchInput = document.getElementById('listSearch');
        if (searchInput) {
            searchInput.placeholder = 'Search by code, name, transporter ID…';
        }
    }

    function _renderList(carriers) {
        const ul = document.getElementById('carriersList');
        if (!ul) return;
        ul.innerHTML = '';
        if (!carriers || !carriers.length) {
            ul.innerHTML = '<li class="text-center text-gray-500 py-6 text-sm">No matching carriers found.</li>';
            return;
        }

        carriers.forEach(carrier => {
            const li = document.createElement('li');
            const isSelected = _selectedCarrier?.COMPANY_CODE === carrier.COMPANY_CODE;
            li.className = `p-3 rounded-lg cursor-pointer transition-colors border ${
                isSelected 
                    ? 'bg-indigo-50 border-indigo-300 shadow-xs' 
                    : 'border-gray-200 hover:bg-indigo-50/60 bg-white'
            }`;
            li.dataset.companyCode = carrier.COMPANY_CODE;

            const isRcm = carrier.IS_RCM === 'Y' || carrier.IS_RCM === true;
            const vendorType = carrier.VENDOR_TYPE || 'CARRIER';

            li.innerHTML = `
                <div class="flex items-center justify-between">
                    <strong class="text-indigo-700 text-sm font-bold font-mono">${carrier.COMPANY_CODE}</strong>
                    <div class="flex items-center gap-1.5">
                        ${isRcm ? '<span class="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded font-semibold">RCM</span>' : ''}
                        <span class="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] px-1.5 py-0.5 rounded font-medium">${vendorType}</span>
                    </div>
                </div>
                <div class="text-xs text-gray-700 mt-1 font-medium truncate">${carrier.COMPANY_NAME || 'Unnamed Carrier'}</div>
                <div class="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                    <span>${[carrier.COMPANY_CITY, carrier.COMPANY_STATE].filter(Boolean).join(', ') || 'No location'}</span>
                    ${carrier.TRANSPORT_ID ? `<span class="font-mono text-gray-500">${carrier.TRANSPORT_ID}</span>` : ''}
                </div>
            `;

            li.addEventListener('click', () => {
                _selectedCarrier = carrier;
                _renderDetail(carrier);
            });
            ul.appendChild(li);
        });
    }

    function search(term) {
        const t = (term || '').toLowerCase().trim();
        if (!t) {
            _renderList(_allCarriers);
            return;
        }
        _renderList(_allCarriers.filter(c =>
            (c.COMPANY_CODE || '').toLowerCase().includes(t) ||
            (c.COMPANY_NAME || '').toLowerCase().includes(t) ||
            (c.TRANSPORT_ID || '').toLowerCase().includes(t) ||
            (c.VENDOR_TYPE || '').toLowerCase().includes(t) ||
            (c.GSTIN || '').toLowerCase().includes(t)
        ));
    }

    // ── Detail Pane (View & Edit Modes) ───────────────────────────────────────
    function _renderDetail(carrier) {
        AdminPage.showDetail(true);
        const view = document.getElementById('detailView');
        if (!view) return;

        const isEdit        = !!carrier;
        const canEdit       = _can('ADMIN');
        const canDelete     = _can('MASTER');
        const canSeeBalance = _can('ADMIN');

        // Highlight selected in sidebar
        document.querySelectorAll('#carriersList li').forEach(li => {
            const isMatch = li.dataset.companyCode === carrier?.COMPANY_CODE;
            li.classList.toggle('bg-indigo-50', isMatch);
            li.classList.toggle('border-indigo-300', isMatch);
            li.classList.toggle('shadow-xs', isMatch);
        });

        // Header delete button in admin.html
        const headerDelBtn = document.getElementById('deleteCarrierBtn');
        if (headerDelBtn) {
            if (isEdit && canDelete) headerDelBtn.classList.remove('hidden');
            else headerDelBtn.classList.add('hidden');
        }

        const isRcm = carrier?.IS_RCM === 'Y' || carrier?.IS_RCM === true;
        const vendorType = carrier?.VENDOR_TYPE || 'CARRIER';
        const gstType = carrier?.GST_TYPE || 'REGULAR';
        const address = carrier?.ADDRESS || carrier?.COMPANY_ADDRESS || '';

        // Dynamic accounting metrics from SQLite ledger (Section 9.4 C)
        const apBalance = parseFloat(carrier?.OUTSTANDING_AP || carrier?.BALANCE || 0);
        const unbilledCost = parseFloat(carrier?.UNBILLED_CARRIER_COST || 0);
        const activeAwbs = parseInt(carrier?.ACTIVE_AWBS_COUNT || 0, 10);

        const topCardHtml = canSeeBalance ? `
                <!-- Top Card: Accounts Payable (AP) & Live Carrier Exposure -->
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mb-3 shadow-xs">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <h4 class="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Accounts Payable (AP) &amp; Live Carrier Exposure
                        </h4>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700 font-medium">Type: <strong class="text-gray-900">${vendorType}</strong></span>
                            ${isRcm 
                                ? '<span class="text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-amber-800 font-semibold">GTA RCM Sec 9(3)</span>'
                                : '<span class="text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-emerald-800 font-semibold">Forward Charge</span>'
                            }
                        </div>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Live Vendor Payable</span>
                            <span class="text-base font-bold font-mono ${apBalance > 0 ? 'text-red-700' : 'text-gray-800'}">₹${apBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                            <span class="text-[10px] text-gray-400 block mt-0.5">COA #2010 Cr - Dr (POSTED)</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Unbilled Freight Cost</span>
                            <span class="text-base font-bold font-mono text-amber-700">₹${unbilledCost.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                            <span class="text-[10px] text-gray-400 block mt-0.5">In-Transit Shipments</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Active In-Transit AWBs</span>
                            <span class="text-base font-bold text-indigo-700">${activeAwbs.toLocaleString('en-IN')} AWBs</span>
                            <span class="text-[10px] text-gray-400 block mt-0.5">Live Packets with Carrier</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Govt Transporter ID</span>
                            <span class="text-sm font-mono font-bold text-gray-900 block truncate">${carrier.TRANSPORT_ID || '—'}</span>
                            <span class="text-[10px] text-gray-400 block mt-0.5">E-Way Bill Generation</span>
                        </div>
                    </div>
                    <div class="mt-2.5 pt-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600 flex-wrap gap-2">
                        <div class="flex items-center gap-2">
                            <span class="font-medium">Subledger Binding:</span>
                            <span class="font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">COA #2010 Accounts Payable (Carriers)</span>
                            <span class="text-[11px] text-gray-500 font-mono">entity_code: '${carrier.COMPANY_CODE}'</span>
                        </div>
                        <div class="text-[11px] text-gray-500">
                            TDS Section: <strong class="text-gray-700 font-mono">${carrier.TDS_SECTION || '194C'}</strong> &bull; GST: <strong class="text-gray-700">${gstType}</strong>
                        </div>
                    </div>
                </div>` : `
                <!-- Top Card: Carrier Operational Profile (Non-Admin View: Balances Hidden) -->
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mb-3 shadow-xs">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <h4 class="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Carrier Operational Summary
                        </h4>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700 font-medium">Type: <strong class="text-gray-900">${vendorType}</strong></span>
                            ${isRcm 
                                ? '<span class="text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-amber-800 font-semibold">GTA RCM Sec 9(3)</span>'
                                : '<span class="text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-emerald-800 font-semibold">Forward Charge</span>'
                            }
                        </div>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-2 gap-3 text-sm">
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Active In-Transit AWBs</span>
                            <span class="text-base font-bold text-indigo-700">${activeAwbs.toLocaleString('en-IN')} AWBs</span>
                            <span class="text-[10px] text-gray-400 block mt-0.5">Live Packets with Carrier</span>
                        </div>
                        <div class="bg-white p-2.5 rounded border border-gray-200 shadow-xs">
                            <span class="font-semibold text-gray-500 block text-[11px] uppercase tracking-wide">Govt Transporter ID</span>
                            <span class="text-sm font-mono font-bold text-gray-900 block truncate">${carrier.TRANSPORT_ID || '—'}</span>
                            <span class="text-[10px] text-gray-400 block mt-0.5">E-Way Bill Generation</span>
                        </div>
                    </div>
                </div>`;

        // ── View Mode HTML ────────────────────────────────────────────────────
        const viewHtml = isEdit ? `
            <div class="space-y-4">
                ${topCardHtml}

                <!-- Section 1: Carrier & Vendor Logistics Identity -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                        1. Carrier &amp; Vendor Logistics Identity
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Carrier / Company Code</span>
                            <span class="font-mono font-bold text-indigo-700 text-sm">${carrier.COMPANY_CODE || '—'}</span>
                        </div>
                        <div class="col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">Company Legal Name</span>
                            <span class="font-medium text-gray-900">${carrier.COMPANY_NAME || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Vendor Type</span>
                            <span class="font-medium text-gray-800">${vendorType}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Transporter ID</span>
                            <span class="font-mono text-gray-800">${carrier.TRANSPORT_ID || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Registration ID / CIN</span>
                            <span class="font-mono text-gray-800">${carrier.REGISTRATION_ID || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Logo (G-Drive)</span>
                            <span class="text-xs truncate block">${carrier.LOGO_URL_GDRIVE ? `<a href="${carrier.LOGO_URL_GDRIVE}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline inline-flex items-center gap-1">Open Link <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>` : '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Logo (PostIMG)</span>
                            <span class="text-xs truncate block">${carrier.LOGO_URL_POSTIMG ? `<a href="${carrier.LOGO_URL_POSTIMG}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline inline-flex items-center gap-1">Open Link <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>` : '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Registered Office Address & Geotag Routing -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        2. Registered Office Address &amp; Geotag Routing
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div class="col-span-2">
                            <span class="block text-xs font-semibold text-gray-500">Office Address</span>
                            <span class="text-gray-800">${address || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Pincode</span>
                            <span class="font-mono text-gray-800 font-semibold">${carrier.COMPANY_PINCODE || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">City / State</span>
                            <span class="text-gray-800">${[carrier.COMPANY_CITY, carrier.COMPANY_STATE].filter(Boolean).join(', ') || '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Contact & Communication -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        3. Contact &amp; Communication
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Official Email</span>
                            <span class="text-gray-800 truncate block">${carrier.EMAIL ? `<a href="mailto:${carrier.EMAIL}" class="text-indigo-600 hover:underline">${carrier.EMAIL}</a>` : '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Company Mobile</span>
                            <span class="font-mono text-gray-800">${carrier.MOBILE ? `<a href="tel:${carrier.MOBILE}" class="text-indigo-600 hover:underline">${carrier.MOBILE}</a>` : '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Contact Person</span>
                            <span class="text-gray-800">${carrier.CONTACT_PERSON || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Contact Mobile</span>
                            <span class="font-mono text-gray-800">${carrier.CONTACT_MOBILE ? `<a href="tel:${carrier.CONTACT_MOBILE}" class="text-indigo-600 hover:underline">${carrier.CONTACT_MOBILE}</a>` : '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 4: Banking & Payout (Vendor Payments / PAY) -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                        4. Banking &amp; Payout (Vendor Payments / PAY)
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Bank Name</span>
                            <span class="text-gray-800 font-medium">${carrier.BANK_NAME || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Account Number</span>
                            <span class="font-mono text-gray-800 font-medium">${carrier.BANK_AC || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">IFSC Code</span>
                            <span class="font-mono font-bold text-gray-900">${carrier.IFSC || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">Beneficiary Name</span>
                            <span class="text-gray-800">${carrier.BENEFICIARY_NAME || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">UPI ID</span>
                            <span class="font-mono text-gray-800">${carrier.UPI || '—'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 5: Statutory Compliance & Taxation (TDS & RCM) -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        5. Statutory Compliance &amp; Taxation (TDS &amp; RCM)
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">GSTIN</span>
                            <span class="font-mono font-bold text-gray-900">${carrier.GSTIN || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">PAN</span>
                            <span class="font-mono font-bold text-gray-900">${carrier.PAN || '—'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">GST Type</span>
                            <span class="text-gray-800">${gstType}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">GTA Reverse Charge (RCM)</span>
                            <span class="font-medium ${isRcm ? 'text-amber-700' : 'text-gray-800'}">${isRcm ? 'Yes (GTA Sec 9(3))' : 'No (Forward Charge)'}</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-gray-500">TDS Section</span>
                            <span class="font-mono font-bold text-indigo-700">${carrier.TDS_SECTION || '194C'}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 6: Double-Entry Ledger Mechanics & Audit Trail -->
                <div class="border-t pt-3.5">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        6. Double-Entry Ledger Mechanics &amp; Audit Trail
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div class="bg-gray-50 p-2.5 rounded border border-gray-200">
                            <span class="block text-xs font-bold text-gray-700 mb-1">Inward Freight Bill (BIL)</span>
                            <p class="text-[11px] text-gray-600 font-mono">
                                Dr 5000 Linehaul Expense<br>
                                ${isRcm ? 'RCM: Dr 1044 / Cr 2034' : 'Dr 1041-1043 Input Tax'}<br>
                                Cr 2040 TDS (${carrier.TDS_SECTION || '194C'})<br>
                                Cr 2010 AP (${carrier.COMPANY_CODE})
                            </p>
                        </div>
                        <div class="bg-gray-50 p-2.5 rounded border border-gray-200">
                            <span class="block text-xs font-bold text-gray-700 mb-1">Vendor Payment (PAY)</span>
                            <p class="text-[11px] text-gray-600 font-mono">
                                Dr 2010 AP (${carrier.COMPANY_CODE})<br>
                                Cr 1021 Bank Operating Account<br>
                                (Liability clearance &amp; bank outflow)
                            </p>
                        </div>
                        <div class="bg-gray-50 p-2.5 rounded border border-gray-200">
                            <span class="block text-xs font-bold text-gray-700 mb-1">Audit Record Timestamp</span>
                            <p class="text-xs text-gray-700 font-medium">${_formatTimestamp(carrier.TIME_STAMP)}</p>
                            <span class="text-[10px] text-gray-400 block mt-1">Raw Timestamp: ${carrier.TIME_STAMP || '—'}</span>
                        </div>
                    </div>
                </div>
            </div>` : '';

        // ── Edit Mode Form HTML ───────────────────────────────────────────────
        const editFields = `
            <div class="space-y-6">
                <!-- Section 1: Carrier & Vendor Logistics Identity -->
                <div class="border border-indigo-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center gap-2 border-b border-indigo-50 pb-2">
                        <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                        <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 1: Carrier &amp; Vendor Logistics Identity</h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Company / Carrier Code*</label>
                            <input type="text" id="carriersCode" name="COMPANY_CODE" required placeholder="e.g. DELHIVERY"
                                value="${carrier?.COMPANY_CODE || ''}" ${isEdit ? 'readonly' : ''}
                                class="border text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 uppercase font-mono ${isEdit ? 'bg-gray-100 cursor-not-allowed text-gray-500 font-bold' : 'bg-gray-50 border-gray-300 text-gray-900'}">
                            <span class="text-[10px] text-gray-400 block mt-0.5">${isEdit ? 'Immutable Subledger AP entity code' : 'Unique identifier for double-entry subledger binding'}</span>
                        </div>
                        <div class="md:col-span-4">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Company Legal Name*</label>
                            <input type="text" name="COMPANY_NAME" required placeholder="e.g. Delhivery Limited"
                                value="${carrier?.COMPANY_NAME || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Vendor Type</label>
                            <select name="VENDOR_TYPE" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                                ${['CARRIER', 'FLEET', 'SUPPLIER', 'VENDOR'].map(vt => 
                                    `<option value="${vt}" ${vendorType === vt ? 'selected' : ''}>${vt}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Government Transporter ID</label>
                            <input type="text" name="TRANSPORT_ID" placeholder="e.g. 07AAAAA0000A1Z5"
                                value="${carrier?.TRANSPORT_ID || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 font-mono">
                            <span class="text-[10px] text-gray-400 block mt-0.5">Mandatory for E-Way Bill generation</span>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Registration ID / CIN</label>
                            <input type="text" name="REGISTRATION_ID" placeholder="CIN / Govt Registration"
                                value="${carrier?.REGISTRATION_ID || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 font-mono">
                        </div>
                        <div class="md:col-span-3">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Logo URL (Google Drive)</label>
                            <input type="url" name="LOGO_URL_GDRIVE" placeholder="https://drive.google.com/..."
                                value="${carrier?.LOGO_URL_GDRIVE || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-3">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Logo URL (PostIMG / CDN)</label>
                            <input type="url" name="LOGO_URL_POSTIMG" placeholder="https://i.postimg.cc/..."
                                value="${carrier?.LOGO_URL_POSTIMG || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                    </div>
                </div>

                <!-- Section 2: Registered Office Address & Geotag Routing -->
                <div class="border border-indigo-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center gap-2 border-b border-indigo-50 pb-2">
                        <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                        <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 2: Registered Office Address &amp; Geotag Routing</h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
                        <div class="md:col-span-6">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Registered Office Address</label>
                            <input type="text" name="COMPANY_ADDRESS" placeholder="Premises, Street, Industrial Area"
                                value="${address}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Pincode</label>
                            <div class="relative">
                                <input type="text" id="carriersPincode" name="COMPANY_PINCODE" placeholder="6-digit PIN" maxlength="6"
                                    value="${carrier?.COMPANY_PINCODE || ''}"
                                    class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 pr-10 font-mono">
                                <div id="carriersPincodeStatus" class="absolute inset-y-0 right-0 flex items-center pr-3 text-sm pointer-events-none"></div>
                            </div>
                            <span class="text-[10px] text-gray-400 block mt-0.5">Auto-populates city &amp; state via Post4ex engine</span>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">City</label>
                            <input type="text" id="carriersCity" name="COMPANY_CITY" placeholder="City" readonly
                                value="${carrier?.COMPANY_CITY || ''}"
                                class="bg-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5 cursor-not-allowed">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">State</label>
                            <input type="text" id="carriersState" name="COMPANY_STATE" placeholder="State" readonly
                                value="${carrier?.COMPANY_STATE || ''}"
                                class="bg-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5 cursor-not-allowed">
                        </div>
                    </div>
                </div>

                <!-- Section 3: Contact & Communication -->
                <div class="border border-indigo-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center gap-2 border-b border-indigo-50 pb-2">
                        <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                        <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 3: Contact &amp; Communication</h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Official Email</label>
                            <input type="email" name="EMAIL" placeholder="billing@carrier.com"
                                value="${carrier?.EMAIL || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div>
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Company Mobile</label>
                            <input type="text" name="MOBILE" placeholder="91XXXXXXXXXX" maxlength="12"
                                value="${carrier?.MOBILE || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 font-mono">
                        </div>
                        <div>
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Contact Person Name</label>
                            <input type="text" name="CONTACT_PERSON" placeholder="Nodal / Account Manager"
                                value="${carrier?.CONTACT_PERSON || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div>
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Contact Person Mobile</label>
                            <input type="text" name="CONTACT_MOBILE" placeholder="91XXXXXXXXXX" maxlength="12"
                                value="${carrier?.CONTACT_MOBILE || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 font-mono">
                        </div>
                    </div>
                </div>

                <!-- Section 4: Banking & Payout Details -->
                <div class="border border-indigo-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center gap-2 border-b border-indigo-50 pb-2">
                        <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">4</span>
                        <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 4: Banking &amp; Payout Details (Vendor Payments / PAY)</h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
                        <div class="md:col-span-3">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Bank Name</label>
                            <input type="text" name="BANK_NAME" placeholder="e.g. HDFC Bank, ICICI Bank"
                                value="${carrier?.BANK_NAME || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-3">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Bank Account No.</label>
                            <input type="text" name="BANK_AC" placeholder="Account Number"
                                value="${carrier?.BANK_AC || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 font-mono">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">IFSC Code</label>
                            <input type="text" name="IFSC" placeholder="11-character IFSC" maxlength="11"
                                value="${carrier?.IFSC || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 uppercase font-mono">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Beneficiary / A/C Name</label>
                            <input type="text" name="BENEFICIARY_NAME" placeholder="Name as per Bank records"
                                value="${carrier?.BENEFICIARY_NAME || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">UPI ID / VPA</label>
                            <input type="text" name="UPI" placeholder="carrier@upi"
                                value="${carrier?.UPI || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 font-mono">
                        </div>
                    </div>
                </div>

                <!-- Section 5: Statutory Compliance & Taxation -->
                <div class="border border-indigo-100 rounded-xl p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center gap-2 border-b border-indigo-50 pb-2">
                        <span class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">5</span>
                        <h3 class="text-sm font-bold text-gray-900 tracking-wide uppercase">Section 5: Statutory Compliance &amp; Taxation (TDS &amp; RCM)</h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">GSTIN</label>
                            <input type="text" name="GSTIN" placeholder="15-character GSTIN" maxlength="15"
                                value="${carrier?.GSTIN || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 uppercase font-mono">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">PAN Number</label>
                            <input type="text" name="PAN" placeholder="10-digit PAN" maxlength="10"
                                value="${carrier?.PAN || ''}"
                                class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 uppercase font-mono">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">GST Registration Type</label>
                            <select name="GST_TYPE" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                                ${['REGULAR', 'COMPOSITE', 'UNREGISTERED'].map(gt =>
                                    `<option value="${gt}" ${gstType === gt ? 'selected' : ''}>${gt}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="md:col-span-3">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">Reverse Charge Mechanism (IS_RCM)</label>
                            <select name="IS_RCM" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                                <option value="N" ${!isRcm ? 'selected' : ''}>No (Standard ITC / Forward Charge)</option>
                                <option value="Y" ${isRcm ? 'selected' : ''}>Yes (GTA Courier RCM under Sec 9(3))</option>
                            </select>
                            <span class="text-[10px] text-gray-400 block mt-0.5">GTA courier billing under Section 9(3) of CGST Act</span>
                        </div>
                        <div class="md:col-span-3">
                            <label class="block mb-1 text-xs font-semibold text-gray-700">TDS Section (Withholding Tax)</label>
                            <select name="TDS_SECTION" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5">
                                ${[
                                    { sec: '194C', label: '194C — Contractor / Transporter (1% Indiv / 2% Corp)' },
                                    { sec: '194I', label: '194I — Rent of Land / Building / Equipment' },
                                    { sec: '194J', label: '194J — Professional / Technical Services' },
                                    { sec: '194Q', label: '194Q — Purchase of Goods' },
                                    { sec: 'NONE', label: 'NONE — Exempt / No TDS deduction' },
                                ].map(o => `<option value="${o.sec}" ${(carrier?.TDS_SECTION || '194C') === o.sec ? 'selected' : ''}>${o.label}</option>`).join('')}
                            </select>
                            <span class="text-[10px] text-gray-400 block mt-0.5">Transporter TDS is auto-withheld into COA #2040</span>
                        </div>
                    </div>
                </div>

                <!-- Section 6: Double-Entry Subledger Automation Notice -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 flex items-center gap-3">
                    <svg class="w-5 h-5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <div>
                        <span class="font-bold text-slate-900 block mb-0.5">Double-Entry Ledger Subledger Binding:</span>
                        <span>Saving this carrier creates an immutable subledger entity bound to <code>COA #2010 Accounts Payable (Carriers)</code>. When carrier freight bills (<code>BIL</code>) or outward payouts (<code>PAY</code>) are posted, journal entries balance automatically against <code>COA #5000 Linehaul Expense</code>, <code>COA #1021 Bank Operating</code>, and <code>COA #2040 TDS Payable</code>.</span>
                    </div>
                </div>

                <!-- Form Controls -->
                <div class="flex justify-end items-center gap-3 pt-3 border-t">
                    <button type="button" id="carriersCancelBtn" class="btn-ghost btn-sm">Cancel</button>
                    <button type="submit" id="carriersSubmitBtn" class="btn px-6 py-2.5 flex items-center gap-2">
                        <span id="carriersSubmitText">${isEdit ? `Update Carrier ${carrier.COMPANY_CODE}` : 'Submit New Carrier'}</span>
                        <div id="carriersSpinner" class="hidden w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </button>
                </div>
            </div>`;

        // ── Render Container Card ─────────────────────────────────────────────
        view.innerHTML = `
            <div class="detail-card ${isEdit ? 'mode-view' : 'mode-edit'}" id="carrierDetailCard">
                <div class="detail-card-header flex justify-between items-center">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h2 class="text-base font-bold text-gray-800">${isEdit ? carrier.COMPANY_CODE : 'New Carrier / Logistics Vendor'}</h2>
                            ${isEdit ? `<span class="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded font-semibold font-mono">COA #2010 AP</span>` : ''}
                            ${isRcm ? `<span class="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded font-semibold">GTA RCM</span>` : ''}
                            ${isEdit ? `<span class="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-semibold">${vendorType}</span>` : ''}
                        </div>
                        <p class="text-xs text-gray-500 mt-0.5">${isEdit ? (carrier.COMPANY_NAME || 'Logistics Carrier Profile') : 'Configure carrier identity, logistics routes, banking payout, and statutory taxation'}</p>
                    </div>
                    ${isEdit ? `
                    <div class="flex gap-2">
                        ${canEdit ? `<button id="carrierEditBtn" class="view-only btn btn-sm">Edit Carrier</button>` : ''}
                        ${canDelete ? `<button id="carrierDeleteBtn" class="view-only btn-danger btn-sm">Delete</button>` : ''}
                        <button id="carrierCancelEditBtn" class="edit-only btn-ghost btn-sm">Cancel</button>
                    </div>` : ''}
                </div>
                <div class="detail-card-body">
                    <!-- Inline Delete Confirm Box -->
                    ${isEdit && canDelete ? `
                    <div id="carrierDeleteConfirm" class="hidden mb-4 border border-red-200 bg-red-50 rounded-lg p-4">
                        <p class="text-sm text-red-700 font-medium mb-3">
                            Delete carrier <strong>${carrier.COMPANY_CODE}</strong> (${carrier.COMPANY_NAME || ''})?<br>
                            <span class="text-xs text-gray-500">This action cannot be undone. Carriers with active shipments or ledger entries cannot be removed. OTP verification is required.</span>
                        </p>
                        <div class="flex gap-3 items-center flex-wrap">
                            <button id="carrierConfirmDeleteBtn" type="button" class="btn-danger btn-sm flex items-center gap-1">
                                <span>Confirm Delete</span>
                                <div id="carrierDeleteSpinner" class="hidden ml-2 w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            </button>
                            <button id="carrierCancelDeleteBtn" type="button" class="btn-ghost btn-sm">Cancel</button>
                        </div>
                    </div>` : ''}

                    <!-- View Mode Content -->
                    <div class="view-only">
                        ${isEdit ? viewHtml : `<p class="text-gray-500 text-sm">Select a carrier from the sidebar${canEdit ? ' or click + Add to register a new vendor' : ''}.</p>`}
                    </div>

                    <!-- Edit Mode Form -->
                    ${canEdit ? `
                    <form id="carriersForm" class="edit-only" autocomplete="off">
                        ${editFields}
                    </form>` : '<div class="edit-only p-4 text-center text-sm text-gray-500">Only Admin can add or edit carriers.</div>'}
                    <div id="carriersResponseMsg" class="mt-4 text-center p-3 rounded-lg text-sm hidden"></div>
                </div>
            </div>

            <!-- Legacy Delete Confirmation Modal Fallback (for deleteCarrierBtn in header) -->
            <div id="carriersDeleteModal" class="modal-overlay hidden">
                <div class="modal-content">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">Confirm Deletion</h2>
                    <p class="text-gray-600 mb-6">Are you sure you want to delete carrier <strong id="carriersDeleteName"></strong>? This action requires OTP and cannot be undone.</p>
                    <div class="flex justify-end space-x-4">
                        <button id="carriersCancelModalDeleteBtn" type="button" class="btn-ghost px-4 py-2">Cancel</button>
                        <button id="carriersConfirmModalDeleteBtn" type="button" class="btn-danger px-4 py-2">Yes, Delete</button>
                    </div>
                </div>
            </div>
        `;

        _isUpdate = isEdit;
        _bindDetailEvents(carrier);
    }

    // ── Pincode Lookup (Post4ex engine + Postal API fallback) ─────────────────
    function _initPincode() {
        const pinInput = document.getElementById('carriersPincode');
        const cityInput = document.getElementById('carriersCity');
        const stateInput = document.getElementById('carriersState');
        const statusEl = document.getElementById('carriersPincodeStatus');
        if (!pinInput) return;

        pinInput.addEventListener('input', () => {
            clearTimeout(_pinTimer);
            if (statusEl) statusEl.innerHTML = '';
            const v = pinInput.value.trim();

            if (v.length < 6) {
                if (cityInput) cityInput.value = '';
                if (stateInput) stateInput.value = '';
                return;
            }

            if (v.length === 6) {
                if (statusEl) {
                    statusEl.innerHTML = '<div class="spinner field-spinner" style="width:16px;height:16px;border-top-color:#6d28d9;"></div>';
                }

                _pinTimer = setTimeout(async () => {
                    // Try Post4ex built-in searchPin first
                    if (typeof window.searchPin === 'function') {
                        try {
                            const res = await window.searchPin(v);
                            if (res && res.found) {
                                if (cityInput) cityInput.value = res.CITY || '';
                                if (stateInput) stateInput.value = res.STATE_NAME || res.STATE || '';
                                if (statusEl) statusEl.innerHTML = '<span class="text-green-500 font-bold">✔</span>';
                                return;
                            }
                        } catch (err) {
                            console.warn('searchPin error, falling back to postal API:', err);
                        }
                    }

                    // External API fallback
                    try {
                        const res = await fetch(`https://api.postalpincode.in/pincode/${v}`);
                        const json = await res.json();
                        if (json?.[0]?.Status === 'Success') {
                            const po = json[0].PostOffice[0];
                            if (cityInput) cityInput.value = po.District || '';
                            if (stateInput) stateInput.value = po.State || '';
                            if (statusEl) statusEl.innerHTML = '<span class="text-green-500 font-bold">✔</span>';
                        } else {
                            if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold">✖</span>';
                        }
                    } catch {
                        if (statusEl) statusEl.innerHTML = '<span class="text-red-500 font-bold">!</span>';
                    }
                }, 400);
            }
        });
    }

    // ── Bind Events ───────────────────────────────────────────────────────────
    function _bindDetailEvents(carrier) {
        const view = document.getElementById('detailView');
        if (!view) return;
        const card = document.getElementById('carrierDetailCard');

        _initPincode();

        // Switch to edit mode
        view.querySelector('#carrierEditBtn')?.addEventListener('click', () => {
            if (card) {
                card.classList.remove('mode-view');
                card.classList.add('mode-edit');
            }
        });

        // Cancel editing
        const cancelHandler = () => {
            if (carrier) {
                if (card) {
                    card.classList.remove('mode-edit');
                    card.classList.add('mode-view');
                }
                _renderDetail(carrier);
            } else {
                AdminPage.showDetail(false);
            }
        };

        view.querySelector('#carrierCancelEditBtn')?.addEventListener('click', cancelHandler);
        view.querySelector('#carriersCancelBtn')?.addEventListener('click', cancelHandler);

        // Inline delete toggle
        view.querySelector('#carrierDeleteBtn')?.addEventListener('click', () => {
            const confirmBox = document.getElementById('carrierDeleteConfirm');
            if (confirmBox) confirmBox.classList.remove('hidden');
        });

        view.querySelector('#carrierCancelDeleteBtn')?.addEventListener('click', () => {
            const confirmBox = document.getElementById('carrierDeleteConfirm');
            if (confirmBox) confirmBox.classList.add('hidden');
        });

        view.querySelector('#carrierConfirmDeleteBtn')?.addEventListener('click', () => {
            _handleRequest('delete', carrier?.COMPANY_CODE);
        });

        // Modal delete triggers
        document.getElementById('carriersCancelModalDeleteBtn')?.addEventListener('click', () => {
            document.getElementById('carriersDeleteModal')?.classList.add('hidden');
        });

        document.getElementById('carriersConfirmModalDeleteBtn')?.addEventListener('click', () => {
            const code = document.getElementById('carriersDeleteName')?.textContent;
            _handleRequest('delete', code);
        });

        // Form submit
        const form = document.getElementById('carriersForm');
        form?.addEventListener('submit', e => {
            e.preventDefault();
            _handleRequest('submit');
        });
    }

    // ── Handle Request (Write / Delete) ───────────────────────────────────────
    async function _handleRequest(action, targetCode = null) {
        if (action === 'submit' && !_can('ADMIN')) {
            showNotification('Access denied. Admin role required to create or edit carrier.', 'error');
            return;
        }
        if (action === 'delete' && !_can('MASTER')) {
            showNotification('Access denied. Master role required to delete carrier.', 'error');
            return;
        }
        _setLoading(true);
        const data = {};

        if (action === 'submit') {
            const form = document.getElementById('carriersForm');
            new FormData(form).forEach((v, k) => { data[k] = v; });
        } else {
            data.COMPANY_CODE = targetCode || document.getElementById('carriersCode')?.value;
        }

        try {
            // Carrier write/delete is OTP-gated — callApi handles OTP prompt
            const result = await callApi(
                action === 'delete' ? '/api/deleteCarrier' : '/api/writeCarrier',
                action === 'delete'
                    ? { COMPANY_CODE: data.COMPANY_CODE }
                    : { data, record_id: _isUpdate ? data.COMPANY_CODE : null },
                'POST'
            );

            // Hide any delete confirm UI
            document.getElementById('carriersDeleteModal')?.classList.add('hidden');
            document.getElementById('carrierDeleteConfirm')?.classList.add('hidden');

            _showResponseMsg(result.message || 'Carrier saved successfully.', 'success', result.data);

            // Refresh appData & re-render
            const appData = await getAppData();
            _allCarriers = Object.values(appData?.CARRIERS || {});
            _renderList(_allCarriers);

            if (action === 'delete') {
                _selectedCarrier = null;
                setTimeout(() => {
                    if (_allCarriers.length) {
                        _selectedCarrier = _allCarriers[0];
                        _renderDetail(_selectedCarrier);
                    } else {
                        AdminPage.showDetail(false);
                    }
                }, 800);
            } else {
                const updated = _allCarriers.find(c => c.COMPANY_CODE === data.COMPANY_CODE);
                if (updated) {
                    _selectedCarrier = updated;
                    setTimeout(() => _renderDetail(updated), 800);
                }
            }

        } catch (err) {
            if (err.message !== 'OTP action cancelled') {
                _showResponseMsg(err.message || 'Operation failed.', 'error');
            }
        } finally {
            _setLoading(false);
        }
    }

    function _setLoading(isLoading) {
        const spinner = document.getElementById('carriersSpinner');
        const submitBtn = document.getElementById('carriersSubmitBtn');
        const delSpinner = document.getElementById('carrierDeleteSpinner');
        const confDelBtn = document.getElementById('carrierConfirmDeleteBtn');
        const modalDelBtn = document.getElementById('carriersConfirmModalDeleteBtn');

        if (spinner) spinner.classList.toggle('hidden', !isLoading);
        if (submitBtn) submitBtn.disabled = isLoading;
        if (delSpinner) delSpinner.classList.toggle('hidden', !isLoading);
        if (confDelBtn) confDelBtn.disabled = isLoading;
        if (modalDelBtn) modalDelBtn.disabled = isLoading;

        const submitText = document.getElementById('carriersSubmitText');
        if (submitText) {
            const codeVal = document.getElementById('carriersCode')?.value || '';
            submitText.textContent = isLoading
                ? (_isUpdate ? 'Updating Carrier…' : 'Submitting Carrier…')
                : (_isUpdate ? `Update Carrier ${codeVal}` : 'Submit New Carrier');
        }
    }

    function _showResponseMsg(message, type, data = null) {
        const el = document.getElementById('carriersResponseMsg');
        if (!el) return;
        let content = `<p class="font-semibold">${message}</p>`;
        if (data && typeof data === 'object') {
            content += '<div class="mt-2 text-left text-xs bg-gray-50 p-2.5 rounded border border-gray-200 max-w-md mx-auto space-y-0.5">';
            for (const [k, v] of Object.entries(data)) {
                if (v && typeof v !== 'object') {
                    content += `<p><strong class="font-medium text-gray-600">${k}:</strong> <span class="text-gray-800 font-mono">${v}</span></p>`;
                }
            }
            content += '</div>';
        }
        el.innerHTML = content;
        el.className = `mt-4 text-center p-3 rounded-lg text-sm ${
            type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
        }`;
        el.classList.remove('hidden');
    }

    // ── Open Add Pane ─────────────────────────────────────────────────────────
    function openAddPane() {
        if (!_can('ADMIN')) {
            showNotification('Access denied. Only Admin can add carriers.', 'error');
            return;
        }
        _selectedCarrier = null;
        _renderList(_allCarriers);
        _renderDetail(null);
        AdminPage.showDetail(true);
        AdminPage.showDetailPane();
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function load() {
        _injectListPane();

        // Wire top delete button in admin.html header with AbortController
        if (_deleteAbort) _deleteAbort.abort();
        _deleteAbort = new AbortController();

        document.getElementById('deleteCarrierBtn')?.addEventListener('click', () => {
            const code = _selectedCarrier?.COMPANY_CODE || document.getElementById('carriersCode')?.value;
            if (!code) return;
            const nameEl = document.getElementById('carriersDeleteName');
            if (nameEl) nameEl.textContent = code;
            document.getElementById('carriersDeleteModal')?.classList.remove('hidden');
        }, { signal: _deleteAbort.signal });

        const appData = await getAppData();
        _allCarriers = Object.values(appData?.CARRIERS || {});
        _renderList(_allCarriers);

        if (_allCarriers.length > 0) {
            _selectedCarrier = _allCarriers[0];
            _renderDetail(_selectedCarrier);
        } else {
            _renderDetail(null);
        }
    }

    return { load, search, openAddPane };

})();

window.AdminCarriers = AdminCarriers;
