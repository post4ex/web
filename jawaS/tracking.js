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

    const movHtml = mvs.length ? `
        <div class="hidden sm:block overflow-x-auto rounded-lg border border-gray-100 mt-3">
            <table class="w-full text-xs border-collapse">
                <thead>
                    <tr class="bg-gray-50 text-gray-500 uppercase">
                        <th class="text-left py-2 px-3 border-b font-semibold w-28">Date</th>
                        <th class="text-left py-2 px-3 border-b font-semibold">Activity</th>
                        <th class="text-left py-2 px-3 border-b font-semibold">Location</th>
                    </tr>
                </thead>
                <tbody>
                    ${mvs.map((m, i) => `
                    <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50">
                        <td class="py-2 px-3 border-b text-gray-500 whitespace-nowrap align-top">${m.date || ''} ${m.time || ''}</td>
                        <td class="py-2 px-3 border-b font-medium text-gray-700 align-top">${m.activity || ''}</td>
                        <td class="py-2 px-3 border-b text-gray-400 align-top text-[11px]">${m.location || ''}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div class="sm:hidden space-y-2 mt-3">
            ${mvs.map((m, i) => `
            <div class="border rounded-lg p-3 ${i === 0 ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100'}">
                <div class="flex justify-between items-start gap-2">
                    <p class="text-xs font-semibold text-gray-700">${m.activity || ''}</p>
                    <span class="text-[10px] text-gray-400 whitespace-nowrap">${m.date || ''}</span>
                </div>
                ${m.location ? `<p class="text-[10px] text-gray-400 mt-1 leading-tight">${m.location}</p>` : ''}
            </div>`).join('')}
        </div>` : '<p class="text-xs text-gray-400 mt-3">No movements yet.</p>';

    const html = `
        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${st.bg} ${st.text}">
                    <i class="fa-solid ${st.icon}"></i> ${st.label}
                </span>
                <span class="text-xs text-gray-400 font-medium">${s.carrier_name || s.carrier || ''}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs">
                ${s.status_raw   ? `<div class="col-span-2 bg-gray-50 rounded p-2"><p class="text-gray-400">Status</p><p class="font-semibold text-gray-700 mt-0.5">${s.status_raw}</p></div>` : ''}
                ${s.origin       ? `<div class="bg-gray-50 rounded p-2"><p class="text-gray-400">Origin</p><p class="font-semibold text-gray-700 mt-0.5">${s.carrier_origin || s.origin}</p></div>` : ''}
                ${s.destination  ? `<div class="bg-gray-50 rounded p-2"><p class="text-gray-400">Destination</p><p class="font-semibold text-gray-700 mt-0.5">${s.carrier_destination || s.destination}</p></div>` : ''}
                ${s.booked_date  ? `<div class="bg-gray-50 rounded p-2"><p class="text-gray-400">Booked</p><p class="font-semibold text-gray-700 mt-0.5">${s.booked_date}</p></div>` : ''}
                ${s.weight       ? `<div class="bg-gray-50 rounded p-2"><p class="text-gray-400">Weight</p><p class="font-semibold text-gray-700 mt-0.5">${s.weight} kg · ${s.pieces || 1} pcs</p></div>` : ''}
            </div>
            <div>
                <p class="text-xs font-bold text-gray-500 uppercase">Movement History</p>
                <div class="max-h-96 overflow-y-auto">${movHtml}</div>
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
