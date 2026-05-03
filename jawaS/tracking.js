// ============================================================================
// TRACKING.JS — Authenticated tracking page logic
// ============================================================================

const STATE_BADGE = {
    delivered:      { bg: 'bg-green-100',  text: 'text-green-700',  icon: 'fa-circle-check',         label: 'Delivered'        },
    outfordelivery: { bg: 'bg-blue-100',   text: 'text-blue-700',   icon: 'fa-truck',                label: 'Out for Delivery' },
    intransit:      { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: 'fa-route',                label: 'In Transit'       },
    exception:      { bg: 'bg-red-100',    text: 'text-red-700',    icon: 'fa-triangle-exclamation', label: 'Exception'        },
    pending:        { bg: 'bg-gray-100',   text: 'text-gray-600',   icon: 'fa-clock',                label: 'Pending'          },
};

function renderTrackingResult(data, containerId) {
    const s   = data.shipment || {};
    const mvs = data.movements || [];
    const st  = STATE_BADGE[s.state] || STATE_BADGE.pending;

    const stateStyle = {
        delivered:      { bg: '#059669', glow: 'rgba(5,150,105,0.25)'  },
        outfordelivery: { bg: '#2563eb', glow: 'rgba(37,99,235,0.25)'  },
        intransit:      { bg: '#d97706', glow: 'rgba(217,119,6,0.25)'  },
        exception:      { bg: '#dc2626', glow: 'rgba(220,38,38,0.25)'  },
        pending:        { bg: '#6b7280', glow: 'rgba(107,114,128,0.2)' },
    };
    const ss = stateStyle[s.state] || stateStyle.pending;

    const infoItems = [
        { label: 'AWB No.',     value: s.awb || s.carrier_awb,                    icon: 'fa-hashtag'         },
        { label: 'Reference',   value: s.ref,                                      icon: 'fa-fingerprint'     },
        { label: 'Origin',      value: s.carrier_origin || s.origin,               icon: 'fa-circle-dot'      },
        { label: 'Destination', value: s.carrier_destination || s.destination,     icon: 'fa-location-dot'    },
        { label: 'Booked On',   value: s.booked_date,                              icon: 'fa-calendar-days'   },
        { label: 'Weight',      value: s.weight ? `${s.weight} kg · ${s.pieces||1} pcs` : null, icon: 'fa-weight-hanging' },
    ].filter(i => i.value);

    const movRows = mvs.map((m, i) => `
        <tr style="background:${i===0?'rgba(37,99,235,0.06)':i%2===0?'#fff':'#f9fafb'};transition:background 0.15s;" onmouseover="this.style.background='rgba(37,99,235,0.08)'" onmouseout="this.style.background='${i===0?'rgba(37,99,235,0.06)':i%2===0?'#fff':'#f9fafb'}'">
            <td style="padding:0.65rem 0.875rem;border-bottom:1px solid #f1f5f9;vertical-align:top;white-space:nowrap;font-size:0.72rem;font-weight:700;color:#374151;">${m.date||''}</td>
            <td style="padding:0.65rem 0.875rem;border-bottom:1px solid #f1f5f9;vertical-align:top;white-space:nowrap;font-size:0.72rem;color:#9ca3af;">${m.time||''}</td>
            <td style="padding:0.65rem 0.875rem;border-bottom:1px solid #f1f5f9;vertical-align:top;font-size:0.72rem;color:#6b7280;">${m.location||''}</td>
            <td style="padding:0.65rem 0.875rem;border-bottom:1px solid #f1f5f9;vertical-align:top;">
                ${i===0
                    ? `<span style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.75rem;font-weight:700;color:#1d4ed8;"><span style="width:6px;height:6px;background:#2563eb;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 3px rgba(37,99,235,0.2);"></span>${m.activity||''}</span>`
                    : `<span style="font-size:0.75rem;color:#374151;font-weight:500;">${m.activity||''}</span>`
                }
            </td>
        </tr>`).join('');

    const html = `
        <div style="font-family:'Inter',sans-serif;">
            <!-- Status Hero -->
            <div style="background:${ss.bg};border-radius:1rem;padding:1.25rem 1.5rem;margin-bottom:1rem;box-shadow:0 8px 32px ${ss.glow},0 2px 8px rgba(0,0,0,0.1);position:relative;overflow:hidden;">
                <div style="position:relative;display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:0.875rem;">
                        <div style="width:2.75rem;height:2.75rem;background:rgba(255,255,255,0.18);border-radius:0.75rem;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
                            <i class="fa-solid ${st.icon}" style="color:white;font-size:1.1rem;"></i>
                        </div>
                        <div>
                            <p style="color:rgba(255,255,255,0.65);font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:2px;">Shipment Status</p>
                            <p style="color:white;font-size:1.1rem;font-weight:800;letter-spacing:-0.01em;">${st.label}</p>
                        </div>
                    </div>
                    ${s.carrier_name||s.carrier ? `<span style="background:rgba(255,255,255,0.18);color:white;font-size:0.7rem;font-weight:700;padding:0.3rem 0.75rem;border-radius:2rem;backdrop-filter:blur(4px);letter-spacing:0.03em;">${s.carrier_name||s.carrier}</span>` : ''}
                </div>
                ${s.status_raw ? `<p style="margin-top:0.75rem;background:rgba(0,0,0,0.15);color:rgba(255,255,255,0.85);font-size:0.72rem;font-weight:500;padding:0.5rem 0.875rem;border-radius:0.5rem;position:relative;">${s.status_raw}</p>` : ''}
            </div>

            <!-- Info Grid -->
            ${infoItems.length ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.625rem;margin-bottom:1rem;">
                ${infoItems.map(item => `
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:0.75rem 0.875rem;transition:box-shadow 0.15s;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow=''">
                    <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;">
                        <i class="fa-solid ${item.icon}" style="color:#94a3b8;font-size:0.65rem;"></i>
                        <p style="font-size:0.62rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">${item.label}</p>
                    </div>
                    <p style="font-size:0.8rem;font-weight:700;color:#1e293b;line-height:1.3;">${item.value}</p>
                </div>`).join('')}
            </div>` : ''}

            <!-- Movement History -->
            <div style="background:white;border:1px solid #e2e8f0;border-radius:1rem;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.05);">
                <div style="padding:0.875rem 1rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(to right,#f8fafc,#fff);">
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <i class="fa-solid fa-timeline" style="color:#2563eb;font-size:0.8rem;"></i>
                        <p style="font-size:0.72rem;font-weight:800;color:#1e293b;text-transform:uppercase;letter-spacing:0.08em;">Movement History</p>
                    </div>
                    ${mvs.length ? `<span style="background:#eff6ff;color:#2563eb;font-size:0.65rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:2rem;">${mvs.length} events</span>` : ''}
                </div>
                ${mvs.length ? `
                <div style="max-height:280px;overflow-y:auto;">
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>
                            <tr style="background:linear-gradient(to right,#f8fafc,#f1f5f9);position:sticky;top:0;">
                                <th style="text-align:left;padding:0.6rem 0.875rem;border-bottom:1px solid #e2e8f0;font-size:0.65rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">Date</th>
                                <th style="text-align:left;padding:0.6rem 0.875rem;border-bottom:1px solid #e2e8f0;font-size:0.65rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">Time</th>
                                <th style="text-align:left;padding:0.6rem 0.875rem;border-bottom:1px solid #e2e8f0;font-size:0.65rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Location</th>
                                <th style="text-align:left;padding:0.6rem 0.875rem;border-bottom:1px solid #e2e8f0;font-size:0.65rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Activity</th>
                            </tr>
                        </thead>
                        <tbody>${movRows}</tbody>
                    </table>
                </div>` : `<p style="text-align:center;color:#94a3b8;font-size:0.78rem;padding:2rem;">No movements recorded yet.</p>`}
            </div>
        </div>`;

    const rc = document.getElementById(containerId);
    if (rc) { rc.innerHTML = html; rc.classList.remove('hidden'); }
}

function showTrackMsg(text, type, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.textContent = text;
    el.className = 'p-3 rounded-lg text-sm font-semibold text-center mb-4';
    if (type === 'error')        el.classList.add('bg-red-100',   'text-red-700');
    else if (type === 'success') el.classList.add('bg-green-100', 'text-green-700');
    else                         el.classList.add('bg-blue-50',   'text-blue-700');
    el.classList.remove('hidden');
}

async function doAuthTrack(query, msgId, loadingId, resultId) {
    const loading = document.getElementById(loadingId);
    const msg     = document.getElementById(msgId);
    const rc      = document.getElementById(resultId);
    if (msg)     msg.classList.add('hidden');
    if (rc)      { rc.classList.add('hidden'); rc.innerHTML = ''; }
    if (loading) loading.classList.remove('hidden');

    try {
        const token = getSessionId();
        const param = query.match(/^\d{14}$/) ? 'ref' : 'awb';
        const res   = await fetch(`${CONSTANTS.OPERATIONS_URL}/api/track?${param}=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (loading) loading.classList.add('hidden');
        if (res.status === 401) { handleLogout(); return; }
        if (res.status === 404) { showTrackMsg('Shipment not found.', 'error', msgId); return; }
        if (!res.ok)            { showTrackMsg('Something went wrong.', 'error', msgId); return; }
        renderTrackingResult(await res.json(), resultId);
    } catch (e) {
        if (loading) loading.classList.add('hidden');
        showTrackMsg('Network error. Please try again.', 'error', msgId);
    }
}

window.renderTrackingResult = renderTrackingResult;
window.showTrackMsg = showTrackMsg;
window.doAuthTrack = doAuthTrack;

document.addEventListener('DOMContentLoaded', () => {
    const btn   = document.getElementById('searchButton');
    const input = document.getElementById('searchInput');
    if (!btn || !input) return;

    const track = () => {
        const q = input.value.trim();
        if (!q) { showTrackMsg('Please enter an AWB or Reference number.', 'error', 'messageBox'); return; }
        doAuthTrack(q, 'messageBox', 'loadingIndicator', 'resultsContainer');
    };

    btn.addEventListener('click', track);
    input.addEventListener('keypress', e => { if (e.key === 'Enter') track(); });
});
