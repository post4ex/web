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

    const el = document.createElement('div');
    el.id = 'sm-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Track Shipment');
    el.tabIndex = -1;
    el.innerHTML = `
<div id="sm-overlay" role="dialog" aria-modal="true" aria-label="Track Shipment" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);backdrop-filter:blur(4px);justify-content:center;align-items:flex-start;padding-top:5vh;" tabindex="-1">
    <div id="sm-box" style="background:#fff;border-radius:1rem;box-shadow:0 24px 64px rgba(0,0,0,0.18);width:100%;max-width:960px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;margin:0 1rem;">
        <!-- Header -->
        <div style="padding:1rem 1.25rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:0.75rem;flex-shrink:0;background:linear-gradient(to right,#f8fafc,#fff);">
            <i class="fa-solid fa-magnifying-glass" style="color:#9C2007;font-size:0.9rem;"></i>
            <span style="font-size:0.85rem;font-weight:800;color:#1e293b;flex:1;">Track Shipment</span>
            <button id="sm-close" aria-label="Close" style="background:none;border:none;cursor:pointer;padding:0.25rem;color:#94a3b8;font-size:1.1rem;line-height:1;" tabindex="0">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <!-- Controls -->
        <div style="padding:1rem 1.25rem;border-bottom:1px solid #f1f5f9;flex-shrink:0;">
            <!-- Mode Tabs -->
            <div style="display:flex;gap:0.5rem;margin-bottom:0.875rem;" role="group" aria-label="Tracking mode">
                <button class="sm-tab" data-mode="default" style="flex:1;padding:0.45rem 0.5rem;border-radius:0.5rem;border:1px solid #e2e8f0;font-size:0.72rem;font-weight:700;cursor:pointer;transition:all 0.15s;background:#eff6ff;color:#2563eb;border-color:#bfdbfe;">Default</button>
                <button class="sm-tab" data-mode="live"    style="flex:1;padding:0.45rem 0.5rem;border-radius:0.5rem;border:1px solid #e2e8f0;font-size:0.72rem;font-weight:600;cursor:pointer;transition:all 0.15s;background:#fff;color:#64748b;">Live</button>
                <button class="sm-tab" data-mode="custom"  style="flex:1;padding:0.45rem 0.5rem;border-radius:0.5rem;border:1px solid #e2e8f0;font-size:0.72rem;font-weight:600;cursor:pointer;transition:all 0.15s;background:#fff;color:#64748b;">Custom</button>
            </div>

            <!-- Input row -->
            <div style="display:flex;gap:0.5rem;align-items:flex-start;flex-wrap:wrap;">
                <!-- Custom: carrier select -->
                <div id="sm-carrier-wrap" style="display:none;flex-shrink:0;">
                    <select id="sm-carrier-sel" aria-label="Select carrier" style="padding:0.55rem 0.75rem;border:1px solid #e2e8f0;border-radius:0.5rem;font-size:0.78rem;color:#374151;background:#fff;outline:none;min-width:130px;">
                        <option value="">— Carrier —</option>
                        ${CUSTOM_CARRIERS.map(c => `<option value="${c.value}" data-type="${c.type}">${c.label}</option>`).join('')}
                    </select>
                </div>
                <!-- Custom: sub-carrier (tc / 17track) -->
                <div id="sm-subcarrier-wrap" style="display:none;flex-shrink:0;">
                    <select id="sm-subcarrier-sel" aria-label="Select sub-carrier" style="padding:0.55rem 0.75rem;border:1px solid #e2e8f0;border-radius:0.5rem;font-size:0.78rem;color:#374151;background:#fff;outline:none;min-width:130px;"></select>
                </div>
                <!-- AWB / Ref input -->
                <input id="sm-input" type="text" placeholder="AWB or Reference number" aria-label="AWB or Reference number"
                    style="flex:1;min-width:140px;padding:0.55rem 0.875rem;border:1px solid #e2e8f0;border-radius:0.5rem;font-size:0.82rem;outline:none;color:#1e293b;" />
                <button id="sm-search-btn" style="padding:0.55rem 1.1rem;background:#9C2007;color:#fff;border:none;border-radius:0.5rem;font-size:0.8rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:background 0.15s;">
                    <i class="fa-solid fa-magnifying-glass" style="margin-right:0.3rem;"></i>Track
                </button>
            </div>
            <p id="sm-mode-hint" style="font-size:0.68rem;color:#94a3b8;margin-top:0.4rem;">Reads from cache. Fast.</p>
        </div>

        <!-- Result area -->
        <div id="sm-result-wrap" style="overflow-y:auto;flex:1;padding:1rem 1.25rem;">
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

    // Search
    searchBtn.addEventListener('click', _doSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') _doSearch(); });
}

let _currentMode = 'default';
let _smResizeHandler = null;

function _setMode(mode) {
    _currentMode = mode;
    const hints = { default: 'Reads from cache. Fast.', live: 'Live carrier scrape. Slower.', custom: 'Route directly to a specific carrier.' };
    document.getElementById('sm-mode-hint').textContent = hints[mode] || '';
    document.querySelectorAll('.sm-tab').forEach(t => {
        const active = t.dataset.mode === mode;
        t.style.background = active ? '#eff6ff' : '#fff';
        t.style.color = active ? '#2563eb' : '#64748b';
        t.style.borderColor = active ? '#bfdbfe' : '#e2e8f0';
        t.style.fontWeight = active ? '700' : '600';
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
    const query = document.getElementById('sm-input').value.trim();
    if (!query) { _showMsg('Enter an AWB or Reference number.', 'error'); return; }

    const token = typeof getSessionId === 'function' ? getSessionId() : '';
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
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            _showMsg(body.detail || 'Something went wrong.', 'error');
            return;
        }
        const data = await res.json();
        _renderResult(data);
    } catch {
        _hideLoader();
        _showMsg('Network error. Please try again.', 'error');
    }
}

function _refOrAwb(q) {
    return q.match(/^\d{14}$/) ? `ref=${encodeURIComponent(q)}` : `awb=${encodeURIComponent(q)}`;
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
    const movRows = movements.map((m, i) => `
        <tr style="background:${i===0?'rgba(37,99,235,0.06)':i%2===0?'#fff':'#f9fafb'};">
            <td style="padding:0.6rem 0.875rem;border-bottom:1px solid #f1f5f9;white-space:nowrap;font-size:0.72rem;font-weight:700;color:#374151;">${m.date||''}</td>
            <td style="padding:0.6rem 0.875rem;border-bottom:1px solid #f1f5f9;white-space:nowrap;font-size:0.72rem;color:#9ca3af;">${m.time||''}</td>
            <td style="padding:0.6rem 0.875rem;border-bottom:1px solid #f1f5f9;font-size:0.72rem;color:#6b7280;">${m.location||''}</td>
            <td style="padding:0.6rem 0.875rem;border-bottom:1px solid #f1f5f9;font-size:0.75rem;color:#374151;font-weight:${i===0?700:500};">${m.activity||''}</td>
        </tr>`).join('');

    // Mobile movement cards
    const movCards = movements.map((m, i) => `
        <div style="border-radius:0.625rem;padding:0.65rem 0.875rem;border:1px solid ${i===0?'#bfdbfe':'#e2e8f0'};background:${i===0?'#eff6ff':'#f8fafc'};margin-bottom:0.4rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.2rem;">
                <span style="font-size:0.75rem;font-weight:700;color:${i===0?'#1d4ed8':'#374151'};">${m.activity||''}</span>
                <span style="font-size:0.65rem;color:#94a3b8;white-space:nowrap;flex-shrink:0;">${m.date||''} ${m.time||''}</span>
            </div>
            ${m.location?`<p style="font-size:0.65rem;color:#6b7280;margin:0;">${m.location}</p>`:''}
        </div>`).join('');

    const noMov = '<p style="text-align:center;color:#94a3b8;font-size:0.78rem;padding:1.5rem;">No movements recorded yet.</p>';
    const isMobile = window.innerWidth <= 640;

    rc.innerHTML = `
        <div style="font-family:'Inter',sans-serif;">
            <!-- Shipment info + status hero -->
            <div style="display:flex;gap:0.875rem;margin-bottom:0.875rem;flex-wrap:wrap;">
                ${infoItems.length ? `
                <div style="flex:1;min-width:150px;display:flex;flex-direction:column;gap:0.5rem;">
                    ${infoItems.map(item => `
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.625rem;padding:0.6rem 0.75rem;">
                        <p style="font-size:0.6rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:0.2rem;">
                            <i class="fa-solid ${item.icon}" style="margin-right:0.3rem;"></i>${item.label}
                        </p>
                        <p style="font-size:0.78rem;font-weight:700;color:#1e293b;">${item.value}</p>
                    </div>`).join('')}
                </div>` : ''}
                <!-- Status hero -->
                <div style="flex:1;min-width:150px;background:${ss.bg};border-radius:0.875rem;padding:1rem 1.25rem;box-shadow:0 6px 24px ${ss.glow};display:flex;flex-direction:column;justify-content:center;gap:0.6rem;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <div style="width:2.5rem;height:2.5rem;background:rgba(255,255,255,0.18);border-radius:0.625rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fa-solid ${st.icon}" style="color:white;font-size:1rem;"></i>
                        </div>
                        <div>
                            <p style="color:rgba(255,255,255,0.65);font-size:0.6rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Status</p>
                            <p style="color:white;font-size:1rem;font-weight:800;">${st.label}</p>
                        </div>
                    </div>
                    ${shipment.carrier_name||shipment.carrier ? `<span style="background:rgba(255,255,255,0.18);color:white;font-size:0.68rem;font-weight:700;padding:0.25rem 0.65rem;border-radius:2rem;align-self:flex-start;">${shipment.carrier_name||shipment.carrier}</span>` : ''}
                    ${shipment.status_raw ? `<p style="background:rgba(0,0,0,0.15);color:rgba(255,255,255,0.85);font-size:0.7rem;padding:0.4rem 0.75rem;border-radius:0.4rem;">${shipment.status_raw}</p>` : ''}
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
                <div id="sm-mov-desktop" style="display:${isMobile?'none':'block'};max-height:240px;overflow-y:auto;">
                    ${movRows ? `<table style="width:100%;border-collapse:collapse;">
                        <thead><tr style="background:#f8fafc;position:sticky;top:0;">
                            <th style="text-align:left;padding:0.5rem 0.875rem;font-size:0.62rem;font-weight:700;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Date</th>
                            <th style="text-align:left;padding:0.5rem 0.875rem;font-size:0.62rem;font-weight:700;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Time</th>
                            <th style="text-align:left;padding:0.5rem 0.875rem;font-size:0.62rem;font-weight:700;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Location</th>
                            <th style="text-align:left;padding:0.5rem 0.875rem;font-size:0.62rem;font-weight:700;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Activity</th>
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

    // Responsive toggle on resize
    const desktop = rc.querySelector('#sm-mov-desktop');
    const mobile  = rc.querySelector('#sm-mov-mobile');
    const _resize = () => {
        const mob = window.innerWidth <= 640;
        if (desktop) desktop.style.display = mob ? 'none' : 'block';
        if (mobile)  mobile.style.display  = mob ? 'block' : 'none';
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
}

function _showLoader() {
    document.getElementById('sm-msg')?.classList.add('hidden');
    document.getElementById('sm-result')?.classList.add('hidden');
    document.getElementById('sm-loader')?.classList.remove('hidden');
}

function _hideLoader() {
    document.getElementById('sm-loader')?.classList.add('hidden');
}

function _clearResult() {
    document.getElementById('sm-msg')?.classList.add('hidden');
    document.getElementById('sm-result')?.classList.add('hidden');
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
