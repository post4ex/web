// ============================================================================
// SEARCH-MODAL.JS — Header search/track modal (default, live, custom carrier)
// ============================================================================

const CUSTOM_CARRIERS = [
    { value: 'jetline',    label: 'Jetline',         type: 'slug' },
    { value: 'trackon',    label: 'Trackon',         type: 'slug' },
    { value: 'delhivery',  label: 'Delhivery',       type: 'slug' },
    { value: 'shiprocket', label: 'Shiprocket',      type: 'slug' },
    { value: 'bigship',    label: 'Bigship',         type: 'slug' },
    { value: 'airways',    label: 'Airways Courier', type: 'slug' },
    { value: 'tc',         label: 'TrackCourier',    type: 'tc'   },
    { value: '17track',    label: '17Track',         type: '17t'  },
];

// Carriers that need a sub-carrier param for tc/17track
const TC_CARRIERS = ['DTDC','BLUEDART','INDIAPOST','SPEEDPOST','XPRESSBEES','ECOM','SHADOWFAX','SPOTON','GATI','PROFESSIONAL','SAFEXPRESS','TCI','VXPRESS','MARUTI','VRL'];
const T17_CARRIERS = ['INDIAPOST','SPEEDPOST','DTDC','BLUEDART','XPRESSBEES','ECOM','SHADOWFAX','SPOTON','GATI','PROFESSIONAL','SAFEXPRESS','TCI','MARUTI','DHL','DHLEXPRESS','FEDEX','UPS','ARAMEX'];

const STATE_BADGE = {
    delivered:      { icon: 'fa-circle-check',         label: 'Delivered',        bg: 'linear-gradient(135deg,#9C2007,#7a1805)', glow: 'rgba(156,32,7,0.3)'    },
    outfordelivery: { icon: 'fa-truck',                label: 'Out for Delivery', bg: 'linear-gradient(135deg,#2563eb,#1d4ed8)', glow: 'rgba(37,99,235,0.3)'   },
    intransit:      { icon: 'fa-route',                label: 'In Transit',       bg: 'linear-gradient(135deg,#d97706,#b45309)', glow: 'rgba(217,119,6,0.3)'   },
    exception:      { icon: 'fa-triangle-exclamation', label: 'Exception',        bg: 'linear-gradient(135deg,#dc2626,#b91c1c)', glow: 'rgba(220,38,38,0.3)'   },
    pending:        { icon: 'fa-clock',                label: 'Pending',          bg: 'linear-gradient(135deg,#6b7280,#4b5563)', glow: 'rgba(107,114,128,0.2)' },
};

// ============================================================================
// DOM injection (once)
// ============================================================================
function _injectModal() {
    if (document.getElementById('sm-overlay')) return;

    if (!document.getElementById('sm-style')) {
        const s = document.createElement('style');
        s.id = 'sm-style';
        s.textContent = `
            .sm-tabs-group { display:flex; gap:0.25rem; flex-shrink:0; }
            @media (max-width:640px) {
                .sm-tabs-group { width:100%; }
                .sm-tabs-group .sm-tab { flex:1; }
                #sm-carrier-wrap, #sm-subcarrier-wrap { flex:1; width:auto !important; }
                .sm-input-group { width:100%; flex-basis:100%; min-width:0; }
            }
        `;
        document.head.appendChild(s);
    }

    const el = document.createElement('div');
    el.id = 'sm-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Track Shipment');
    el.tabIndex = -1;
    el.innerHTML = `
<div id="sm-overlay" role="dialog" aria-modal="true" aria-label="Track Shipment" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);backdrop-filter:blur(4px);justify-content:center;align-items:center;" tabindex="-1">
    <div id="sm-box" style="background:#fff;border-radius:1rem;box-shadow:0 24px 64px rgba(0,0,0,0.18);width:100%;max-width:1200px;max-height:90vh;overflow-y:auto;display:flex;flex-direction:column;margin:0 1rem;">
        <!-- Header -->
        <div style="padding:1rem 1.25rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:0.75rem;flex-shrink:0;background:linear-gradient(to right,#f8fafc,#fff);position:sticky;top:0;z-index:1;">
            <i class="fa-solid fa-magnifying-glass" style="color:#9C2007;font-size:0.9rem;"></i>
            <span style="font-size:0.85rem;font-weight:800;color:#1e293b;flex:1;">Track Shipment</span>
            <button id="sm-close" aria-label="Close" tabindex="0" style="display:flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:50%;border:none;background:#f1f5f9;cursor:pointer;color:#374151;font-size:1.1rem;flex-shrink:0;transition:background 0.15s,color 0.15s;" onmouseover="this.style.background='#e2e8f0';this.style.color='#1e293b'" onmouseout="this.style.background='#f1f5f9';this.style.color='#374151'">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <!-- Controls -->
        <div style="padding:1rem 1.25rem;border-bottom:1px solid #f1f5f9;">
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
                <!-- Row 1: tabs + dropdowns -->
                <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
                    <div class="sm-tabs-group" role="group" aria-label="Tracking mode">
                        <button class="btn btn-sm sm-tab btn-active" data-mode="default">Default</button>
                        <button class="btn btn-sm sm-tab" data-mode="live">Live</button>
                        <button class="btn btn-sm sm-tab" data-mode="custom">Custom</button>
                    </div>
                    <!-- Custom: carrier select -->
                    <div id="sm-carrier-wrap" style="display:none;width:140px;flex-shrink:0;">
                        <select id="sm-carrier-sel" aria-label="Select carrier" style="width:100%;padding:0.55rem 0.75rem;border:1px solid #e2e8f0;border-radius:0.5rem;font-size:0.78rem;color:#374151;background:#fff;outline:none;">
                            <option value="">— Carrier —</option>
                            ${CUSTOM_CARRIERS.map(c => `<option value="${c.value}" data-type="${c.type}">${c.label}</option>`).join('')}
                        </select>
                    </div>
                    <!-- Custom: sub-carrier (tc / 17track) -->
                    <div id="sm-subcarrier-wrap" style="display:none;width:140px;flex-shrink:0;">
                        <select id="sm-subcarrier-sel" aria-label="Select sub-carrier" style="width:100%;padding:0.55rem 0.75rem;border:1px solid #e2e8f0;border-radius:0.5rem;font-size:0.78rem;color:#374151;background:#fff;outline:none;"></select>
                    </div>
                    <!-- input group: flex:1 so it fills remaining space on desktop; breaks to new row on mobile via CSS -->
                    <div class="sm-input-group" style="display:flex;gap:0.5rem;align-items:center;flex:1;min-width:200px;">
                        <input id="sm-input" type="text" placeholder="AWB or Reference number" aria-label="AWB or Reference number"
                            style="flex:1;padding:0.55rem 0.875rem;border:1px solid #e2e8f0;border-radius:0.5rem;font-size:0.82rem;outline:none;color:#1e293b;" />
                        <button id="sm-scan-btn" type="button" title="Scan barcode" aria-label="Scan barcode" style="display:flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;padding:0;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:0.5rem;cursor:pointer;color:#374151;flex-shrink:0;transition:background 0.15s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                            <i class="fa-solid fa-barcode" style="font-size:0.9rem;"></i>
                        </button>
                        <button id="sm-search-btn" style="padding:0.55rem 1.1rem;background:#9C2007;color:#fff;border:none;border-radius:0.5rem;font-size:0.8rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:background 0.15s;flex-shrink:0;">
                            <i class="fa-solid fa-magnifying-glass" style="margin-right:0.3rem;"></i>Track
                        </button>
                    </div>
                </div>
        </div>
        <!-- Result area -->
        <div id="sm-result-wrap" style="padding:1rem 1.25rem;display:none;">
            <div id="sm-msg"    class="hidden" style="padding:0.6rem 0.875rem;border-radius:0.5rem;font-size:0.78rem;font-weight:600;text-align:center;margin-bottom:0.75rem;"></div>
            <div id="sm-loader" class="hidden" style="text-align:center;padding:2rem;color:#94a3b8;font-size:0.8rem;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:1.4rem;margin-bottom:0.5rem;display:block;"></i>Fetching tracking data…
            </div>
            <div id="sm-result" class="hidden"></div>
        </div>
    </div>
</div>`;

    // Replace el with its inner div
    document.body.insertAdjacentHTML('beforeend', el.innerHTML);
    _bindModalEvents();
}

// ============================================================================
// Events
// ============================================================================
function _bindModalEvents() {
    const overlay = document.getElementById('sm-overlay');
    const box     = document.getElementById('sm-box');
    const closeBtn = document.getElementById('sm-close');
    const searchBtn = document.getElementById('sm-search-btn');
    const input   = document.getElementById('sm-input');
    const carrierSel = document.getElementById('sm-carrier-sel');
    const subSel  = document.getElementById('sm-subcarrier-sel');

    // Close
    closeBtn.addEventListener('click', closeSearchModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSearchModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearchModal(); });

    // Mode tabs
    document.querySelectorAll('.sm-tab').forEach(tab => {
        tab.addEventListener('click', () => _setMode(tab.dataset.mode));
    });

    // Carrier select → show sub-carrier if needed
    carrierSel.addEventListener('change', () => _onCarrierChange());

    // Scan button — uses <scan-barcode> web component if available, else file picker fallback
    const scanBtn = document.getElementById('sm-scan-btn');
    if (scanBtn) {
        scanBtn.addEventListener('click', () => {
            // Dynamically inject <scan-barcode> component on first use
            if (!document.querySelector('script[src*="barcode-scanner"]')) {
                const sc = document.createElement('script');
                sc.type = 'module';
                sc.src = (window.location.pathname.includes('/core/') ? '../' : '') + 'utils/barcode-scanner.js';
                document.head.appendChild(sc);
            }
            // Create a hidden <scan-barcode> element, trigger it
            let el = document.getElementById('sm-scanner-el');
            if (!el) {
                el = document.createElement('scan-barcode');
                el.id = 'sm-scanner-el';
                el.setAttribute('icon-only', '');
                el.style.cssText = 'position:absolute;opacity:0;pointer-events:none;';
                document.getElementById('sm-box').appendChild(el);
                el.addEventListener('scanned', e => {
                    const inp = document.getElementById('sm-input');
                    if (inp) { inp.value = e.detail.value; inp.focus(); }
                });
            }
            el.querySelector('.scan-trigger, button')?.click();
        });
    }

    // Search
    searchBtn.addEventListener('click', _doSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') _doSearch(); });
}

let _currentMode = 'default';
let _smResizeHandler = null;

function _setMode(mode) {
    _currentMode = mode;
    document.querySelectorAll('.sm-tab').forEach(t => {
        if (t.dataset.mode === mode) {
            t.classList.add('btn-active');
        } else {
            t.classList.remove('btn-active');
        }
    });
    const carrierWrap = document.getElementById('sm-carrier-wrap');
    const subWrap     = document.getElementById('sm-subcarrier-wrap');
    if (mode === 'custom') {
        carrierWrap.style.display = 'block';
        _onCarrierChange();
    } else {
        carrierWrap.style.display = 'none';
        subWrap.style.display = 'none';
    }
    _clearResult();
}

function _onCarrierChange() {
    const sel    = document.getElementById('sm-carrier-sel');
    const subWrap = document.getElementById('sm-subcarrier-wrap');
    const subSel  = document.getElementById('sm-subcarrier-sel');
    const opt     = sel.options[sel.selectedIndex];
    const type    = opt ? opt.dataset.type : '';

    if (type === 'tc') {
        subWrap.style.display = 'block';
        subSel.innerHTML = '<option value="">— Sub-Carrier —</option>' + TC_CARRIERS.map(c => `<option value="${c}">${c}</option>`).join('');
    } else if (type === '17t') {
        subWrap.style.display = 'block';
        subSel.innerHTML = '<option value="">— Sub-Carrier —</option>' + T17_CARRIERS.map(c => `<option value="${c}">${c}</option>`).join('');
    } else {
        subWrap.style.display = 'none';
        subSel.innerHTML = '';
    }
}

// ============================================================================
// API call
// ============================================================================
async function _doSearch() {
    const raw   = document.getElementById('sm-input').value.trim();
    const query = raw.replace(/[^a-zA-Z0-9\-\/]/g, '');  // strip special chars
    if (!query || query.length < 4) {
        _showMsg('Enter at least 4 characters (letters and digits only).', 'error');
        return;
    }

    const token = typeof getSessionId === 'function' ? getSessionId() : '';
    if (!token) { _showMsg('Session expired. Please log in again.', 'error'); return; }

    const base  = (window.CONSTANTS || {}).OPERATIONS_URL || '';

    let url;

    if (_currentMode === 'custom') {
        const carrier = document.getElementById('sm-carrier-sel').value;
        if (!carrier) { _showMsg('Select a carrier.', 'error'); return; }

        const opt    = document.getElementById('sm-carrier-sel').options[document.getElementById('sm-carrier-sel').selectedIndex];
        const type   = opt ? opt.dataset.type : '';
        const subSel = document.getElementById('sm-subcarrier-sel');
        const sub    = subSel ? subSel.value : '';

        if ((type === 'tc' || type === '17t') && !sub) {
            _showMsg('Select a sub-carrier.', 'error'); return;
        }

        if (type === 'tc') {
            url = `${base}/api/track/custom/tc?carrier=${encodeURIComponent(sub)}&awb=${encodeURIComponent(query)}`;
        } else if (type === '17t') {
            url = `${base}/api/track/custom/17track?carrier=${encodeURIComponent(sub)}&awb=${encodeURIComponent(query)}`;
        } else {
            url = `${base}/api/track/custom/${carrier}?awb=${encodeURIComponent(query)}`;
        }
    } else if (_currentMode === 'live') {
        url = `${base}/api/track/live?${_refOrAwb(query)}`;
    } else {
        // Default: local cache, no outbound HF call
        url = `${base}/api/movements?${_refOrAwb(query)}`;
    }

    _showLoader();
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        _hideLoader();
        if (res.status === 401) { typeof handleLogout === 'function' && handleLogout(); return; }
        if (res.status === 404) { _showMsg('Shipment not found.', 'error'); return; }
        if (res.status === 400) { _showMsg('Invalid AWB or reference number.', 'error'); return; }
        if (res.status >= 500)  { _showMsg('Server error. Please try again shortly.', 'error'); return; }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            _showMsg(body.detail || `Request failed (${res.status}).`, 'error');
            return;
        }
        const data = await res.json();
        if (!data || (Array.isArray(data) && !data.length)) {
            _showMsg('No tracking data found.', 'error'); return;
        }
        _renderResult(data);
    } catch {
        _hideLoader();
        _showMsg('Network error. Please check your connection.', 'error');
    }
}

function _refOrAwb(q) {
    return q.match(/^\d{14}$/) ? `ref=${encodeURIComponent(q)}` : `awb=${encodeURIComponent(q)}`;
}

// ============================================================================
// Sort movements — newest first
// ============================================================================
function _sortMovements(movements) {
    if (!movements || !movements.length) return [];
    return movements.map((m, i) => ({ m, i })).sort((a, b) => {
        const aStamp = a.m.activity_stamp || a.m.ACTIVITY_STAMP || 0;
        const bStamp = b.m.activity_stamp || b.m.ACTIVITY_STAMP || 0;
        if (aStamp !== bStamp) return bStamp - aStamp;

        // Tiebreaker: TIME_STAMP (insertion/discovery time — already sorted correctly by backend)
        const aTs = a.m.time_stamp || a.m.TIME_STAMP || 0;
        const bTs = b.m.time_stamp || b.m.TIME_STAMP || 0;
        if (aTs !== bTs) return bTs - aTs;

        return a.i - b.i; // preserve backend order on full tie
    }).map(x => x.m);
}

// ============================================================================
// Render result — self-contained, no external dependency
// ============================================================================
function _renderResult(data) {
    _clearResult();
    const rc = document.getElementById('sm-result');
    if (!rc) return;

    // Normalise: proxy /tracking → {status,shipment,movements}
    //            proxy /track/{carrier} → {status,data:{movements,...}}
    let shipment, movements;
    if (data.shipment !== undefined) {
        shipment  = data.shipment  || {};
        movements = data.movements || [];
    } else {
        const inner = data.data || data;
        shipment  = inner.shipment  || {};
        movements = inner.movements || [];
    }

    movements = _sortMovements(movements);

    const st = STATE_BADGE[shipment.state] || STATE_BADGE.pending;
    const stateStyles = {
        delivered:      { bg: 'linear-gradient(135deg,#9C2007,#7a1805)', glow: 'rgba(156,32,7,0.3)'    },
        outfordelivery: { bg: 'linear-gradient(135deg,#2563eb,#1d4ed8)', glow: 'rgba(37,99,235,0.3)'   },
        intransit:      { bg: 'linear-gradient(135deg,#d97706,#b45309)', glow: 'rgba(217,119,6,0.3)'   },
        exception:      { bg: 'linear-gradient(135deg,#dc2626,#b91c1c)', glow: 'rgba(220,38,38,0.3)'   },
        pending:        { bg: 'linear-gradient(135deg,#6b7280,#4b5563)', glow: 'rgba(107,114,128,0.2)' },
    };
    const ss = stateStyles[shipment.state] || stateStyles.pending;

    const infoItems = [
        { label: 'Reference',   value: shipment.reference,                                      icon: 'fa-fingerprint'     },
        { label: 'AWB No.',     value: shipment.awb || shipment.carrier_awb,                    icon: 'fa-hashtag'         },
        { label: 'Origin',      value: shipment.carrier_origin || shipment.origin,              icon: 'fa-circle-dot'      },
        { label: 'Destination', value: shipment.carrier_destination || shipment.destination,    icon: 'fa-location-dot'    },
        { label: 'Booked On',   value: shipment.booked_date || shipment.order_date,             icon: 'fa-calendar-days'   },
        { label: 'Weight',      value: shipment.weight ? `${shipment.weight} kg · ${shipment.pieces||1} pcs` : null, icon: 'fa-weight-hanging' },
    ].filter(i => i.value);

    // Desktop movement table
    const movRows = movements.map((m, i) => {
        const sysTs = m.activity_stamp || m.time_stamp || 0;
        const sysTime = sysTs ? (typeof fmtDate === 'function' ? fmtDate(sysTs, 'full') : sysTs) : '—';
        return `
        <tr style="background:${i===0?'rgba(37,99,235,0.06)':i%2===0?'#fff':'#f9fafb'};">
            <td style="padding:0.6rem 0.875rem;border-bottom:1px solid #f1f5f9;white-space:nowrap;font-size:0.72rem;font-weight:700;color:#374151;">${m.date||m.DATE||''}</td>
            <td style="padding:0.6rem 0.875rem;border-bottom:1px solid #f1f5f9;white-space:nowrap;font-size:0.72rem;color:#9ca3af;">${m.time||m.TIME||''}</td>
            <td style="padding:0.6rem 0.875rem;border-bottom:1px solid #f1f5f9;font-size:0.72rem;color:#6b7280;">${m.location||m.LOCATION||''}</td>
            <td style="padding:0.6rem 0.875rem;border-bottom:1px solid #f1f5f9;font-size:0.75rem;color:#374151;font-weight:${i===0?700:500};">${m.activity||m.ACTIVITY||''}</td>
            <td style="padding:0.6rem 0.875rem;border-bottom:1px solid #f1f5f9;white-space:nowrap;font-size:0.68rem;color:#94a3b8;">${sysTime}</td>
        </tr>`;
    }).join('');

    // Mobile movement cards
    const movCards = movements.map((m, i) => `
        <div style="border-radius:0.625rem;padding:0.65rem 0.875rem;border:1px solid ${i===0?'#bfdbfe':'#e2e8f0'};background:${i===0?'#eff6ff':'#f8fafc'};margin-bottom:0.4rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.2rem;">
                <span style="font-size:0.75rem;font-weight:700;color:${i===0?'#1d4ed8':'#374151'};">${m.activity||m.ACTIVITY||''}</span>
                <span style="font-size:0.65rem;color:#94a3b8;white-space:nowrap;flex-shrink:0;">${m.date||m.DATE||''} ${m.time||m.TIME||''}</span>
            </div>
            ${(m.location||m.LOCATION)?`<p style="font-size:0.65rem;color:#6b7280;margin:0;">${m.location||m.LOCATION}</p>`:''}
        </div>`).join('');

    const noMov = '<p style="text-align:center;color:#94a3b8;font-size:0.78rem;padding:1.5rem;">No movements recorded yet.</p>';
    const isMobile = window.innerWidth <= 640;

    rc.innerHTML = `
        <div style="font-family:'Inter',sans-serif;">
            <!-- Shipment summary: 2-row table (desktop) / 2 cards (mobile) -->
            <div style="margin-bottom:0.875rem;border:1px solid #e2e8f0;border-radius:0.875rem;overflow:hidden;">

                <!-- DESKTOP: 2-row table -->
                <table id="sm-info-desktop" style="display:${isMobile?'none':'table'};width:100%;border-collapse:collapse;">
                    <tbody>
                        <tr>
                            ${infoItems.map((item, i) => `
                            <td style="padding:0.55rem 0.875rem;border-bottom:1px solid #f1f5f9;${i>0?'border-left:1px solid #f1f5f9;':''}vertical-align:top;background:#f8fafc;">
                                <p style="font-size:0.58rem;color:#9C2007;opacity:0.8;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;margin:0 0 0.15rem;">
                                    <i class="fa-solid ${item.icon}" style="margin-right:0.25rem;"></i>${item.label}
                                </p>
                            </td>`).join('')}
                            <td style="padding:0.55rem 0.875rem;border-bottom:1px solid #f1f5f9;border-left:1px solid #f1f5f9;vertical-align:top;background:${ss.bg};">
                                <p style="font-size:0.58rem;color:rgba(255,255,255,0.7);font-weight:700;text-transform:uppercase;letter-spacing:0.07em;margin:0 0 0.15rem;">
                                    <i class="fa-solid fa-circle-dot" style="margin-right:0.25rem;"></i>Status
                                </p>
                            </td>
                        </tr>
                        <tr>
                            ${infoItems.map((item, i) => `
                            <td style="padding:0.55rem 0.875rem;${i>0?'border-left:1px solid #f1f5f9;':''}vertical-align:top;">
                                <p style="font-size:0.82rem;font-weight:700;color:#1e293b;margin:0;">${item.value}</p>
                            </td>`).join('')}
                            <td style="padding:0.55rem 0.875rem;border-left:1px solid #f1f5f9;vertical-align:middle;background:${ss.bg};">
                                <div style="display:flex;align-items:center;gap:0.5rem;">
                                    <i class="fa-solid ${st.icon}" style="color:white;font-size:0.9rem;"></i>
                                    <span style="color:white;font-size:0.85rem;font-weight:800;">${st.label}</span>
                                </div>
                                ${shipment.carrier_name||shipment.carrier ? `<p style="color:rgba(255,255,255,0.75);font-size:0.68rem;font-weight:600;margin:0.2rem 0 0;">${shipment.carrier_name||shipment.carrier}</p>` : ''}
                                ${shipment.status_raw ? `<p style="color:rgba(255,255,255,0.65);font-size:0.65rem;margin:0.15rem 0 0;">${shipment.status_raw}</p>` : ''}
                            </td>
                        </tr>
                    </tbody>
                </table>

                <!-- MOBILE: 2 cards -->
                <div id="sm-info-mobile" style="display:${isMobile?'flex':'none'};flex-direction:column;gap:0.5rem;padding:0.75rem;">
                    <!-- Card 1: info fields in grid -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;">
                        ${infoItems.map(item => `
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.5rem;padding:0.5rem 0.65rem;">
                            <p style="font-size:0.58rem;color:#9C2007;opacity:0.8;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 0.15rem;">
                                <i class="fa-solid ${item.icon}" style="margin-right:0.2rem;"></i>${item.label}
                            </p>
                            <p style="font-size:0.78rem;font-weight:700;color:#1e293b;margin:0;">${item.value}</p>
                        </div>`).join('')}
                    </div>
                    <!-- Card 2: status -->
                    <div style="background:${ss.bg};border-radius:0.5rem;padding:0.75rem 0.875rem;display:flex;align-items:center;gap:0.75rem;">
                        <i class="fa-solid ${st.icon}" style="color:white;font-size:1.1rem;flex-shrink:0;"></i>
                        <div>
                            <p style="color:white;font-size:0.9rem;font-weight:800;margin:0;">${st.label}</p>
                            ${shipment.carrier_name||shipment.carrier ? `<p style="color:rgba(255,255,255,0.75);font-size:0.7rem;margin:0.1rem 0 0;">${shipment.carrier_name||shipment.carrier}</p>` : ''}
                            ${shipment.status_raw ? `<p style="color:rgba(255,255,255,0.65);font-size:0.65rem;margin:0.1rem 0 0;">${shipment.status_raw}</p>` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Movement history -->
            <div style="background:white;border:1px solid #e2e8f0;border-radius:0.875rem;overflow:hidden;">
                <div style="padding:0.75rem 0.875rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
                    <span style="font-size:0.7rem;font-weight:800;color:#1e293b;text-transform:uppercase;letter-spacing:0.07em;">
                        <i class="fa-solid fa-timeline" style="color:#2563eb;margin-right:0.4rem;"></i>Movement History
                    </span>
                    ${movements.length ? `<span style="background:#eff6ff;color:#2563eb;font-size:0.62rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:2rem;">${movements.length} events</span>` : ''}
                </div>
                <!-- Desktop table -->
                <div id="sm-mov-desktop" style="display:${isMobile?'none':'block'};">
                    ${movRows ? `<table style="width:100%;border-collapse:collapse;">
                        <thead><tr style="background:#f8fafc;position:sticky;top:0;">
                            <th style="text-align:left;padding:0.5rem 0.875rem;font-size:0.62rem;font-weight:700;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Date</th>
                            <th style="text-align:left;padding:0.5rem 0.875rem;font-size:0.62rem;font-weight:700;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Time</th>
                            <th style="text-align:left;padding:0.5rem 0.875rem;font-size:0.62rem;font-weight:700;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Location</th>
                            <th style="text-align:left;padding:0.5rem 0.875rem;font-size:0.62rem;font-weight:700;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Activity</th>
                            <th style="text-align:left;padding:0.5rem 0.875rem;font-size:0.62rem;font-weight:700;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Sys Time</th>
                        </tr></thead>
                        <tbody>${movRows}</tbody>
                    </table>` : noMov}
                </div>
                <!-- Mobile cards -->
                <div id="sm-mov-mobile" style="display:${isMobile?'block':'none'};padding:0.75rem;">
                    ${movCards || noMov}
                </div>
            </div>
        </div>`;

    rc.classList.remove('hidden');
    document.getElementById('sm-result-wrap').style.display = 'block';

    // Responsive toggle on resize
    const desktop   = rc.querySelector('#sm-mov-desktop');
    const mobile    = rc.querySelector('#sm-mov-mobile');
    const infoDesk  = rc.querySelector('#sm-info-desktop');
    const infoMob   = rc.querySelector('#sm-info-mobile');
    const _resize = () => {
        const mob = window.innerWidth <= 640;
        if (desktop)  desktop.style.display  = mob ? 'none'  : 'table';
        if (mobile)   mobile.style.display   = mob ? 'block' : 'none';
        if (infoDesk) infoDesk.style.display = mob ? 'none'  : 'table';
        if (infoMob)  infoMob.style.display  = mob ? 'flex'  : 'none';
    };
    window.removeEventListener('resize', _smResizeHandler);
    _smResizeHandler = _resize;
    window.addEventListener('resize', _resize);
}

// ============================================================================
// Helpers
// ============================================================================
function _showMsg(text, type) {
    _hideLoader();
    const el = document.getElementById('sm-msg');
    if (!el) return;
    el.textContent = text;
    el.style.background = type === 'error' ? '#fef2f2' : '#eff6ff';
    el.style.color       = type === 'error' ? '#b91c1c'  : '#1d4ed8';
    el.classList.remove('hidden');
    document.getElementById('sm-result-wrap').style.display = 'block';
}

function _showLoader() {
    document.getElementById('sm-msg')?.classList.add('hidden');
    document.getElementById('sm-result')?.classList.add('hidden');
    document.getElementById('sm-loader')?.classList.remove('hidden');
    document.getElementById('sm-result-wrap').style.display = 'block';
}

function _hideLoader() {
    document.getElementById('sm-loader')?.classList.add('hidden');
}

function _clearResult() {
    document.getElementById('sm-msg')?.classList.add('hidden');
    document.getElementById('sm-result')?.classList.add('hidden');
    document.getElementById('sm-result-wrap').style.display = 'none';
    const rc = document.getElementById('sm-result');
    if (rc) rc.innerHTML = '';
}

// ============================================================================
// Public API
// ============================================================================
function openSearchModal() {
    _injectModal();
    const overlay = document.getElementById('sm-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    // reset
    _setMode('default');
    document.getElementById('sm-input').value = '';
    _clearResult();
    document.getElementById('sm-input').focus();
}

function closeSearchModal() {
    const overlay = document.getElementById('sm-overlay');
    if (overlay) overlay.style.display = 'none';
}

window.openSearchModal  = openSearchModal;
window.closeSearchModal = closeSearchModal;
