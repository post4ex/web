// track-tile.js — Track tile: list from /api/activeShipments, detail from trackShipmentLive

const _stateColors = {
    delivered:      'bg-green-100 text-green-800',
    outfordelivery: 'bg-blue-100 text-blue-800',
    intransit:      'bg-yellow-100 text-yellow-800',
    exception:      'bg-red-100 text-red-800',
    no_trace:       'bg-gray-200 text-gray-600',
    pending:        'bg-gray-100 text-gray-500',
};
const _stateLabel = {
    delivered:'Delivered', outfordelivery:'Out for Delivery', intransit:'In Transit',
    exception:'Exception', no_trace:'No Trace', pending:'Pending',
};

function _stateBadge(state) {
    const cls = _stateColors[state] || _stateColors.pending;
    const lbl = _stateLabel[state]  || state || 'Pending';
    return `<span class="sv-status-badge ${cls}">${lbl}</span>`;
}

async function openTrackTile() {
    showSplitView('Track');

    const list   = document.getElementById('shipmentList');
    const status = document.getElementById('status-message');
    const detailView     = document.getElementById('detailView');
    const trackDetailView = document.getElementById('trackDetailView');
    const emptyView      = document.getElementById('emptyView');

    list.innerHTML = '';
    status.textContent = 'Loading active shipments…';
    detailView.classList.add('hidden');
    trackDetailView.classList.add('hidden');
    emptyView.classList.remove('hidden');

    let shipments;
    try {
        const res = await callApi('/api/trackShipments', {}, 'GET');
        shipments = res.data || [];
    } catch (e) {
        status.textContent = `Failed to load: ${e.message}`;
        return;
    }

    status.textContent = `${shipments.length} active shipments`;
    list.innerHTML = '';

    if (!shipments.length) {
        list.innerHTML = `<li class="text-center text-gray-500 border-none cursor-default">No active shipments.</li>`;
        return;
    }

    shipments.forEach(s => {
        const li = document.createElement('li');
        li.dataset.ref = s.REFERENCE;
        // enrich names from IDB if available
        const idbOrder = allOrders.find(o => o.REFERENCE === (s.REFERENCE || s.reference)) || {};
        const cnor = b2b2cDataMap.get(idbOrder.CONSIGNOR)?.NAME || idbOrder.CONSIGNOR || s.origin || '—';
        const cnee = b2b2cDataMap.get(idbOrder.CONSIGNEE)?.NAME || idbOrder.CONSIGNEE || s.destination || '—';
        li.innerHTML = `
            <strong>${s.AWB_NUMBER || s.awb || 'No AWB'}</strong>
            <span class="sv-item-sub">${cnor} &rarr; ${cnee}</span>
            <div class="sv-item-meta">
                <span>Ref: ${s.REFERENCE || s.reference} | ${fmtDate(s.ORDER_DATE || s.order_date)}</span>
                ${_stateBadge(s.state || 'pending')}
            </div>`;
        li.addEventListener('click', () => _selectTrackShipment(s, li, shipments));
        list.appendChild(li);
    });
}

async function _selectTrackShipment(trackShipment, li, allShipments) {
    document.querySelectorAll('#shipmentList li.selected').forEach(el => el.classList.remove('selected'));
    li.classList.add('selected');

    // show track detail, hide normal detail
    document.getElementById('detailView').classList.add('hidden');
    document.getElementById('emptyView').classList.add('hidden');
    document.getElementById('trackDetailView').classList.remove('hidden');

    if (isMobileView()) {
        document.getElementById('shipmentListPane').classList.add('hidden');
        document.getElementById('shipmentDetailPane').classList.remove('hidden');
    }

    const ref = trackShipment.reference || trackShipment.REFERENCE;
    const idbOrder = allOrders.find(o => o.REFERENCE === ref) || {};
    const cnor = b2b2cDataMap.get(idbOrder.CONSIGNOR) || {};
    const cnee = b2b2cDataMap.get(idbOrder.CONSIGNEE) || {};

    document.getElementById('t-shipmentDetailsContainer').innerHTML  = _shipmentCard(trackShipment, idbOrder);
    document.getElementById('t-consignorDetailsContainer').innerHTML = _partyCard('Consignor', cnor.NAME || idbOrder.CONSIGNOR || '—', idbOrder.ORIGIN_CITY, cnor.MOBILE || '');
    document.getElementById('t-consigneeDetailsContainer').innerHTML = _partyCard('Consignee', cnee.NAME || idbOrder.CONSIGNEE || '—', idbOrder.DEST_CITY,   cnee.MOBILE || '');
    document.getElementById('t-trackingStatusContainer').innerHTML   = `<div class="detail-card-header"><h3 class="font-semibold text-gray-700">Tracking Status</h3></div><div class="detail-card-body"><p class="text-xs text-gray-400 animate-pulse">Fetching live status…</p></div>`;
    document.getElementById('t-trackingHistoryContainer').innerHTML  = `<div class="detail-card-header"><h3 class="font-semibold text-gray-700">Tracking History</h3></div><div class="detail-card-body"><p class="text-xs text-gray-400 animate-pulse">Loading…</p></div>`;

    try {
        const result = await trackShipmentLive(ref);
        _renderTrackStatus(result, trackShipment);
        _renderTrackHistory(result.movements || []);
    } catch (e) {
        document.getElementById('t-trackingStatusContainer').innerHTML =
            `<div class="detail-card-header"><h3 class="font-semibold text-gray-700">Tracking Status</h3></div><div class="detail-card-body"><p class="text-xs text-red-500">${e.message}</p></div>`;
        document.getElementById('t-trackingHistoryContainer').innerHTML = '';
    }
}

function _partyCard(label, name, city, mobile) {
    return `<div class="detail-card-header"><h3 class="font-semibold text-gray-700">${label}</h3></div>
    <div class="detail-card-body text-sm space-y-1">
        ${name   ? `<div class="flex justify-between"><span class="text-gray-500">Name:</span><span class="font-medium">${name}</span></div>` : ''}
        ${city   ? `<div class="flex justify-between"><span class="text-gray-500">City:</span><span class="font-medium">${city}</span></div>` : ''}
        ${mobile ? `<div class="flex justify-between"><span class="text-gray-500">Mobile:</span><span class="font-medium">${mobile}</span></div>` : ''}
    </div>`;
}

function _shipmentCard(ts, idb) {
    const rows = [
        ['AWB',     ts.awb    || idb.AWB_NUMBER || '—'],
        ['Carrier', ts.carrier|| idb.CARRIER    || '—'],
        ['Weight',  ts.weight || idb.WEIGHT     || '—'],
        ['Pieces',  ts.pieces || idb.PIECS      || '—'],
        ['Code',    ts.code   || idb.CODE        || '—'],
        ['Branch',  ts.branch || idb.BRANCH      || '—'],
        ['State',   _stateLabel[ts.state] || ts.state || '—'],
        ['Last Updated', ts.last_updated ? new Date(ts.last_updated * 1000).toLocaleString() : '—'],
    ].filter(([,v]) => v && v !== '—');
    const cells = rows.map(([l,v]) =>
        `<tr><td class="border border-gray-200 px-2 py-1 text-gray-500 bg-gray-50 w-1/2">${l}</td><td class="border border-gray-200 px-2 py-1 font-semibold text-gray-800">${v}</td></tr>`
    ).join('');
    return `<div class="detail-card-header"><h3 class="font-semibold text-gray-700">Shipment Details</h3></div>
    <div class="detail-card-body"><table class="w-full text-xs border-collapse border border-gray-200">${cells}</table></div>`;
}

function _renderTrackStatus(result, ts) {
    const s    = result.shipment || {};
    const mvs  = result.movements || [];
    const state = s.state || ts.state || 'pending';
    const badge = _stateBadge(state);
    const latest = mvs[0] ? `<span class="text-xs font-normal text-gray-400 ml-1">${[mvs[0].date, mvs[0].time].filter(Boolean).join(' ')}</span>` : '';

    const rows = [
        s.status_raw          ? `<div class="sm:col-span-2"><div class="text-gray-500 text-xs">Status</div><div class="font-semibold text-gray-800">${s.status_raw}</div></div>` : '',
        s.carrier_origin      ? `<div><div class="text-gray-500 text-xs">Origin</div><div class="font-semibold">${s.carrier_origin}</div></div>` : '',
        s.carrier_destination ? `<div><div class="text-gray-500 text-xs">Destination</div><div class="font-semibold">${s.carrier_destination}</div></div>` : '',
        s.booked_date         ? `<div><div class="text-gray-500 text-xs">Booked</div><div class="font-semibold">${s.booked_date}</div></div>` : '',
        s.additional_info     ? `<div class="sm:col-span-2"><div class="text-gray-500 text-xs">Info</div><div class="text-gray-700 text-xs">${s.additional_info}</div></div>` : '',
    ].filter(Boolean).join('');

    document.getElementById('t-trackingStatusContainer').innerHTML =
        `<div class="detail-card-header flex justify-between items-center">
            <h3 class="font-semibold text-gray-700">Tracking Status &nbsp;${badge}${latest}</h3>
        </div>
        <div class="detail-card-body"><div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">${rows}</div></div>`;
}

function _renderTrackHistory(movements) {
    const el = document.getElementById('t-trackingHistoryContainer');
    if (!movements.length) {
        el.innerHTML = `<div class="detail-card-header"><h3 class="font-semibold text-gray-700">Tracking History</h3></div><div class="detail-card-body"><p class="text-sm text-gray-400">No movement history.</p></div>`;
        return;
    }
    const rows = movements.map(m =>
        `<tr><td class="px-3 py-2 whitespace-nowrap">${m.date||''}</td><td class="px-3 py-2 whitespace-nowrap">${m.time||''}</td><td class="px-3 py-2">${m.location||''}</td><td class="px-3 py-2">${m.activity||''}</td></tr>`
    ).join('');
    el.innerHTML = `<div class="detail-card-header"><h3 class="font-semibold text-gray-700">Tracking History</h3></div>
    <div class="detail-card-body overflow-x-auto">
        <table class="min-w-full text-xs divide-y divide-gray-200 border rounded-md">
            <thead class="bg-gray-50"><tr>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Date</th>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Time</th>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Location</th>
                <th class="px-3 py-2 text-left font-medium text-gray-500 uppercase">Activity</th>
            </tr></thead>
            <tbody class="bg-white divide-y divide-gray-200">${rows}</tbody>
        </table>
    </div>`;
}
