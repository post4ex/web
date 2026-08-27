// ============================================================================
// DASHBOARD.JS — React Native Matched Graph Cards, SLA Smooth Charts, Coordinates & Recent Orders
// ============================================================================

{
const CHART_PALETTE = [
  ['#6366f1', '#8b5cf6'],   // indigo → violet
  ['#0ea5e9', '#2563eb'],   // sky → blue
  ['#10b981', '#0d9488'],   // emerald → teal
  ['#f59e0b', '#f97316'],   // amber → orange
  ['#f43f5e', '#ec4899'],   // rose → pink
  ['#14b8a6', '#22c55e'],   // teal → green
  ['#8b5cf6', '#6366f1'],   // violet → indigo
];

const SLA_SERIES = [
  { key: 'booked', label: 'Ordered', stroke: '#2563eb', fill: '#0ea5e9', fillOpacity: 0.28 },
  { key: 'delivered', label: 'Delivered', stroke: '#059669', fill: '#10b981', fillOpacity: 0.28 },
  { key: 'inTransit', label: 'In Transit', stroke: '#f59e0b', fill: '#f59e0b', fillOpacity: 0.16 },
  { key: 'outForDelivery', label: 'Out for Delivery', stroke: '#8b5cf6', fill: '#8b5cf6', fillOpacity: 0.16 },
];

const SLA_START_OFFSET = 13;
const SLA_END_OFFSET = 7;
const BAR_TRACK_H = 64;

let _lastData = null;
let _building = false;
let _refreshTimer = null;

// ── Date & Smoothing Geometry ────────────────────────────────────────────────
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const smoothPath = (pts) => {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

const areaPath = (pts, bottom) => {
  const line = smoothPath(pts);
  if (!line) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${line} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`;
};

function getShipmentState(o, shipmentsMap = {}) {
  const ref = o.REFERENCE || o.id;
  const s = shipmentsMap[ref] || {};
  return (s.state || s.STATE || o.STATE || o.STATUS || o.DELIVERY_STATUS || '').toString().toLowerCase();
}

// ── Main Render Pipeline ─────────────────────────────────────────────────────

function renderDashboard(appData) {
  if (!appData) return;
  _lastData = appData;

  const orders = Object.values(appData.ORDERS || {});
  const shipmentsMap = appData.SHIPMENTS || {};
  const b2b2cMap = appData.B2B2C || {};
  const modesMap = appData.MODES || {};

  // 1. Overall Stats
  const totalOrders = orders.length;
  const inTransitCount = orders.filter(o => {
    const st = getShipmentState(o, shipmentsMap);
    return st === 'intransit' || st.includes('transit') || st.includes('dispatch') || st.includes('shipped') || st.includes('way') || st === 'outfordelivery' || st.includes('out for delivery');
  }).length;

  const deliveredCount = orders.filter(o => {
    const st = getShipmentState(o, shipmentsMap);
    return st === 'delivered' || st.includes('deliver') || st.includes('complete') || st.includes('success');
  }).length;

  const elTotal = document.getElementById('stat-total-orders');
  const elTransit = document.getElementById('stat-in-transit');
  const elDelivered = document.getElementById('stat-delivered');
  if (elTotal) elTotal.textContent = totalOrders;
  if (elTransit) elTransit.textContent = inTransitCount;
  if (elDelivered) elDelivered.textContent = deliveredCount;

  // 2. Tray 1: Bookings Last 7 Days
  renderBookingsBarChart(orders);

  // 3. Tray 2: Service Level Smooth Area Chart
  renderServiceLevelChart(orders, shipmentsMap);

  // 4. Tray 3: Top Destinations Coordinate Graph
  renderDestinationsChart(orders);

  // 5. Tray 4: Recent Orders List
  renderRecentOrders(orders, shipmentsMap, b2b2cMap, modesMap);
}

// ── 1. Bookings — Auto-Adjust Days (15 Desktop / 10 Tablet / 7 Mobile) ────────

function renderBookingsBarChart(orders) {
  const container = document.getElementById('bookings-bar-container');
  if (!container) return;

  const width = container.clientWidth || 500;
  let numDays = 7;
  if (width >= 480) {
    numDays = 15;
  } else if (width >= 320) {
    numDays = 10;
  } else {
    numDays = 7;
  }

  const titleEl = document.getElementById('bookings-tray-title');
  if (titleEl) {
    titleEl.textContent = `Bookings — Last ${numDays} Days`;
  }

  const today = new Date();
  const dayBuckets = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    
    let dayLabel = '';
    if (numDays === 15) {
      dayLabel = `${d.getDate()}`;
    } else if (numDays === 10) {
      dayLabel = d.toLocaleDateString('en-IN', { weekday: 'narrow' }) + d.getDate();
    } else {
      dayLabel = d.toLocaleDateString('en-IN', { weekday: 'short' });
    }

    const fullDateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });
    const isoDate = localISO(d);

    const count = orders.filter(o => {
      const ts = o.ORDER_DATE || o.TIME_STAMP || o.REQ_TIME;
      if (!ts) return false;
      try {
        const num = Number(ts);
        const validTs = Number.isFinite(num) ? (num < 1e11 ? num * 1000 : num) : ts;
        return localISO(new Date(validTs)) === isoDate;
      } catch {
        return false;
      }
    }).length;

    dayBuckets.push({ label: dayLabel, fullDate: fullDateLabel, count });
  }

  const maxCount = Math.max(...dayBuckets.map(d => d.count), 1);
  const barWidth = numDays === 15 ? 12 : (numDays === 10 ? 15 : 18);

  container.innerHTML = dayBuckets.map((d, idx) => {
    const palette = CHART_PALETTE[idx % CHART_PALETTE.length];
    const heightPercent = Math.max((d.count / maxCount) * 100, 8);
    const targetH = Math.max(((heightPercent / 100) * BAR_TRACK_H), 5);
    return `
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; padding: 0 1px;" title="${d.fullDate}: ${d.count} bookings">
        <span style="color: #64748b; font-size: ${numDays === 15 ? '0.62rem' : '0.68rem'}; font-weight: 700; margin-bottom: 4px; line-height: 1;">${d.count}</span>
        <div style="width: ${barWidth}px; max-width: 80%; height: ${BAR_TRACK_H}px; background: #f1f5f9; border-radius: 8px; position: relative; overflow: hidden; display: flex; align-items: flex-end;">
          <div style="width: 100%; height: ${targetH}px; border-radius: 8px; background: linear-gradient(180deg, ${palette[0]} 0%, ${palette[1]} 100%); transition: height 0.5s ease;"></div>
        </div>
        <span style="color: #475569; font-size: ${numDays === 15 ? '0.62rem' : '0.68rem'}; font-weight: 700; margin-top: 6px; white-space: nowrap; line-height: 1;">${d.label}</span>
      </div>
    `;
  }).join('');
}

// ── 2. Service Level (Silky SVG Area Chart) ──────────────────────────────────

function renderServiceLevelChart(orders, shipmentsMap) {
  const container = document.getElementById('sla-chart-container');
  if (!container) return;

  const today = new Date();
  const serviceLevelDays = [];
  for (let i = SLA_START_OFFSET; i >= SLA_END_OFFSET; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const isoDate = localISO(d);
    let booked = 0;
    let delivered = 0;
    let inTransit = 0;
    let outForDelivery = 0;

    orders.forEach(o => {
      const ts = o.ORDER_DATE || o.TIME_STAMP || o.REQ_TIME;
      if (!ts) return;
      try {
        const num = Number(ts);
        const validTs = Number.isFinite(num) ? (num < 1e11 ? num * 1000 : num) : ts;
        if (localISO(new Date(validTs)) !== isoDate) return;
      } catch {
        return;
      }
      booked += 1;
      const st = getShipmentState(o, shipmentsMap);
      if (st === 'delivered' || st.includes('deliver') || st.includes('complete') || st.includes('success')) delivered += 1;
      else if (st === 'outfordelivery' || st.includes('out for delivery')) outForDelivery += 1;
      else if (st === 'intransit' || st.includes('transit') || st.includes('dispatch') || st.includes('shipped') || st.includes('way')) inTransit += 1;
    });

    serviceLevelDays.push({
      dateLabel: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      booked,
      delivered,
      inTransit,
      outForDelivery,
    });
  }

  const totalBooked = serviceLevelDays.reduce((acc, d) => acc + d.booked, 0);
  const totalDelivered = serviceLevelDays.reduce((acc, d) => acc + d.delivered, 0);
  const avgServiceLevel = totalBooked > 0 ? Math.round((totalDelivered / totalBooked) * 100) : 0;

  const badge = document.getElementById('sla-avg-badge');
  if (badge) badge.textContent = `Avg ${avgServiceLevel}%`;

  const width = container.clientWidth || 450;
  const height = 140;
  const padT = 14, padR = 10, padB = 22, padL = 30;
  const plotW = Math.max(width - padL - padR, 0);
  const plotH = height - padT - padB;
  const maxY = Math.max(...serviceLevelDays.map(d => Math.max(...SLA_SERIES.map(s => d[s.key]))), 1);
  const n = serviceLevelDays.length;
  const bottom = padT + plotH;

  const seriesPts = SLA_SERIES.map(s => ({
    ...s,
    pts: serviceLevelDays.map((d, i) => ({
      x: n > 1 ? padL + (i * plotW) / (n - 1) : padL + plotW / 2,
      y: padT + plotH - (d[s.key] / maxY) * plotH,
    })),
  }));

  const ticks = [...new Set([0, Math.round(maxY / 2), maxY])];

  container.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
      <defs>
        ${SLA_SERIES.map((s, i) => `
          <linearGradient id="slaArea${i}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${s.fill}" stop-opacity="${s.fillOpacity}" />
            <stop offset="100%" stop-color="${s.fill}" stop-opacity="0" />
          </linearGradient>
        `).join('')}
      </defs>

      <!-- Gridlines & Y-Axis Ticks -->
      ${ticks.map(t => {
        const y = padT + plotH - (t / maxY) * plotH;
        return `
          <g>
            <line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#eef2f7" stroke-width="1" />
            <text x="${padL - 7}" y="${y + 3}" font-size="8.5" fill="#94a3b8" text-anchor="end" font-weight="600">${t}</text>
          </g>
        `;
      }).join('')}

      <!-- Soft Gradient Area Fills -->
      ${seriesPts.map((s, i) => `<path d="${areaPath(s.pts, bottom)}" fill="url(#slaArea${i})" />`).join('')}

      <!-- Silky Smooth Curves -->
      ${seriesPts.map(s => `<path d="${smoothPath(s.pts)}" fill="none" stroke="${s.stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`).join('')}

      <!-- Data Dots -->
      ${seriesPts.map(s => s.pts.map(p => `
        <circle cx="${p.x}" cy="${p.y}" r="3.2" fill="#ffffff" stroke="${s.stroke}" stroke-width="2" />
      `).join('')).join('')}

      <!-- X-Axis Date Labels -->
      ${serviceLevelDays.map((d, i) => {
        const x = n > 1 ? padL + (i * plotW) / (n - 1) : padL + plotW / 2;
        return `<text x="${x}" y="${height - 6}" font-size="8.5" font-weight="600" fill="#64748b" text-anchor="middle">${d.dateLabel}</text>`;
      }).join('')}
    </svg>
  `;
}

// ── 3. Top Destinations Coordinate Graph ─────────────────────────────────────

function renderDestinationsChart(orders) {
  const container = document.getElementById('destinations-chart-container');
  if (!container) return;

  const pinMap = {};
  orders.forEach(o => {
    const pin = String(o.DEST_PINCODE || o.CONSIGNEE_PINCODE || '').trim();
    const city = String(o.DEST_CITY || 'DEHRADUN').trim().toUpperCase();
    const key = pin || city || '—';
    if (!pinMap[key]) pinMap[key] = { pin, city, count: 0 };
    pinMap[key].count += 1;
  });

  const topDestinations = Object.values(pinMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  if (!topDestinations.length) {
    container.innerHTML = '<div class="text-slate-400 text-xs text-center py-10">No destination data yet</div>';
    return;
  }

  const width = container.clientWidth || 450;
  const height = 155;
  const padT = 16, padR = 14, padB = 24, padL = 30;
  const plotW = Math.max(width - padL - padR, 0);
  const plotH = height - padT - padB;
  const maxY = Math.max(...topDestinations.map(d => d.count), 1);
  const n = topDestinations.length;

  const points = topDestinations.map((d, i) => {
    const x = n > 1 ? padL + (i * plotW) / (n - 1) : padL + plotW / 2;
    const y = padT + plotH - (d.count / maxY) * plotH;
    return { ...d, x, y };
  });

  const ticks = [0, 10, 50, 100];

  container.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
      <defs>
        <linearGradient id="destLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#8b5cf6" />
          <stop offset="100%" stop-color="#f59e0b" />
        </linearGradient>
        ${points.map((p, i) => {
          const pal = CHART_PALETTE[i % CHART_PALETTE.length];
          return `
            <linearGradient id="dotGrad${i}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="${pal[0]}" />
              <stop offset="100%" stop-color="${pal[1]}" />
            </linearGradient>
          `;
        }).join('')}
      </defs>

      <!-- Horizontal gridlines & Y-Axis labels -->
      ${ticks.map(t => {
        const y = padT + plotH - (t / 100) * plotH;
        return `
          <g>
            <line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#eef2f7" stroke-width="1" />
            <text x="${padL - 7}" y="${y + 3}" font-size="8.5" fill="#94a3b8" text-anchor="end" font-weight="600">${t}</text>
          </g>
        `;
      }).join('')}

      <!-- Vertical guide lines -->
      ${points.map(p => `
        <line x1="${p.x}" y1="${padT}" x2="${p.x}" y2="${padT + plotH}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="2 3" />
      `).join('')}

      <!-- Continuous Gradient Connection Line -->
      <polyline
        points="${points.map(p => `${p.x},${p.y}`).join(' ')}"
        fill="none"
        stroke="url(#destLine)"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- Destination Coordinate Dots -->
      ${points.map((p, i) => {
        const pal = CHART_PALETTE[i % CHART_PALETTE.length];
        return `
          <g class="cursor-pointer group" style="transition: transform 0.2s ease;">
            <circle cx="${p.x}" cy="${p.y}" r="10" fill="${pal[0]}" opacity="0.22" />
            <circle cx="${p.x}" cy="${p.y}" r="5.5" fill="url(#dotGrad${i})" stroke="#ffffff" stroke-width="2" />
            <text x="${p.x}" y="${Math.max(p.y - 12, 10)}" font-size="9" font-weight="700" fill="#475569" text-anchor="middle">${p.count}</text>
            <title>${p.city} (${p.pin}): ${p.count} orders</title>
          </g>
        `;
      }).join('')}

      <!-- X-Axis Labels -->
      ${points.map(p => `
        <text x="${p.x}" y="${height - 7}" font-size="9" font-weight="700" fill="#64748b" text-anchor="middle">
          ${p.pin || (p.city.length > 8 ? `${p.city.slice(0, 7)}…` : p.city)}
        </text>
      `).join('')}
    </svg>
  `;
}

// ── 4. Recent Orders List (Matching React Native ListItem.js) ────────────────

const STATUS_COLORS = {
  delivered: ['#10b981', '#22c55e'],
  intransit: ['#f59e0b', '#f97316'],
  outfordelivery: ['#0ea5e9', '#2563eb'],
  shipped: ['#0ea5e9', '#3b82f6'],
  dispatch: ['#8b5cf6', '#6366f1'],
  booked: ['#6366f1', '#4f46e5'],
  pending: ['#f59e0b', '#d97706'],
  cancelled: ['#ef4444', '#dc2626'],
  rto: ['#e11d48', '#be123c'],
};
const DEFAULT_STATUS = ['#9C2007', '#ef4444'];
const SUBTITLE_COLORS = ['#0284c7', '#7c3aed', '#059669'];

function getOrderTimestamp(o) {
  if (!o) return 0;
  const raw = o.ORDER_DATE || o.TIME_STAMP || o.REQ_TIME || o.CREATED_AT || o.DATE;
  if (!raw) return 0;
  if (typeof raw === 'number') return raw < 1e11 ? raw * 1000 : raw;
  const num = Number(raw);
  if (!isNaN(num) && num > 0) return num < 1e11 ? num * 1000 : num;
  if (typeof raw === 'string') {
    const parts = raw.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const parsed = Date.parse(raw);
        if (!isNaN(parsed)) return parsed;
      } else if (parts[2].length === 4) {
        const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        return d.getTime();
      }
    }
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

function renderRecentOrders(orders, shipmentsMap, b2b2cMap, modesMap) {
  const container = document.getElementById('recent-orders-container');
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = '<div class="text-slate-400 text-xs text-center py-6">No orders yet</div>';
    return;
  }

  // Sort orders descending (newest first)
  const sorted = [...orders].sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a));
  const recent = sorted.slice(0, 10);
  container.innerHTML = recent.map(ord => {
    const rawState = getShipmentState(ord, shipmentsMap);
    const stateKey = (rawState || '').toLowerCase().replace(/\s+/g, '');
    const stateStr = (rawState || 'BOOKED').toUpperCase();
    const chipPair = STATUS_COLORS[stateKey] || DEFAULT_STATUS;

    const consignee = (b2b2cMap[ord.CONSIGNEE]?.NAME || ord.CONSIGNEE || 'Unknown');
    const modeRec = modesMap[ord.MODE];
    const modeName = (typeof modeRec === 'string' ? modeRec : (modeRec?.MODE || modeRec?.NAME)) || ord.MODE || '';
    const hasCod = ord.COD && parseFloat(ord.COD) > 0;
    const meta = [
      ord.CODE || '',
      ord.WEIGHT ? `${ord.WEIGHT}kg` : '',
      ord.PIECS ? `${ord.PIECS} pcs` : '',
      modeName,
      ord.TOPAY === 'Yes' ? 'ToPay' : '',
      hasCod ? `COD ₹${ord.COD}` : '',
    ].filter(Boolean).join(' | ');

    const sub1 = `AWB: ${ord.AWB_NUMBER || 'Pending'} | Carrier: ${ord.CARRIER || 'JetLine'} | Ref: ${ord.REFERENCE || '—'}`;
    const sub2 = meta;
    const sub3 = `📍 ${ord.ORIGIN_CITY || 'DDN'} → 🏁 ${ord.DEST_CITY || 'DEST'}`;
    const subs = [sub1, sub2, sub3].filter(Boolean);

    return `
      <div onclick="window.location.href='orders.html'" class="rn-list-item">
        <div class="rn-list-body">
          <div class="rn-list-title">${consignee}</div>
          ${subs.map((line, i) => `
            <div class="rn-list-sub" style="color: ${SUBTITLE_COLORS[i % SUBTITLE_COLORS.length]};">${line}</div>
          `).join('')}
        </div>
        <div class="rn-list-chip" style="background: linear-gradient(135deg, ${chipPair[0]} 0%, ${chipPair[1]} 100%);">
          ${stateStr}
        </div>
      </div>
    `;
  }).join('');
}

// ── Smooth Refresh & Resize Handling ─────────────────────────────────────────

function _debouncedRefresh(data) {
  if (_building) return;
  clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(() => {
    _building = true;
    requestAnimationFrame(() => {
      renderDashboard(data);
      _building = false;
    });
  }, 200);
}

function _populateBranchContact(appData) {
  const contactModal = document.getElementById('contactModal');
  if (!contactModal) return;
  try {
    const loginData = JSON.parse(localStorage.getItem('loginData') || '{}');
    const userBranch = (loginData.userData || {}).BRANCH;
    const branches = appData?.BRANCHES || {};
    const branch = userBranch ? Object.values(branches).find(b => b.BRANCH_CODE === userBranch) : null;
    const addressEl = contactModal.querySelector('[data-branch-address]');
    const emailEl = contactModal.querySelector('[data-branch-email]');
    if (branch && addressEl && emailEl) {
      const addr = [branch.BRANCH_ADDRESS, branch.BRANCH_CITY, branch.BRANCH_STATE].filter(Boolean).join(', ');
      addressEl.textContent = addr ? `${addr} - ${branch.BRANCH_PINCODE || ''}` : 'Shivlok Colony, Haripur, Dehradun - 248001';
      emailEl.textContent = branch.BRANCH_EMAIL || 'support@post4ex.in';
    }
  } catch {}
}

function syncDashboardHeight() {
  const leftCol = document.querySelector('.dashboard-left-graphs');
  const rightTray = document.querySelector('.dashboard-right-orders .rn-tray');
  const recentContainer = document.getElementById('recent-orders-container');
  if (!leftCol || !rightTray) return;

  if (window.innerWidth >= 900) {
    const leftHeight = leftCol.offsetHeight;
    if (leftHeight > 100) {
      rightTray.style.height = `${leftHeight}px`;
      rightTray.style.maxHeight = `${leftHeight}px`;
      const header = rightTray.querySelector('.rn-tray-header');
      const headerHeight = header ? header.offsetHeight + 12 : 36;
      if (recentContainer) {
        recentContainer.style.maxHeight = `${leftHeight - headerHeight - 28}px`;
      }
    }
  } else {
    rightTray.style.height = '';
    rightTray.style.maxHeight = '';
    if (recentContainer) {
      recentContainer.style.maxHeight = '420px';
    }
  }
}

function _initDashboard() {
  window.addEventListener('appDataLoaded', (e) => {
    const data = e.detail?.data;
    if (data) {
      _populateBranchContact(data);
      _debouncedRefresh(data);
    }
  });

  window.addEventListener('appDataRefreshed', (e) => {
    const data = e.detail?.data;
    if (data) {
      _populateBranchContact(data);
      _debouncedRefresh(data);
    }
  });

  window.addEventListener('indexedDBReady', async () => {
    if (typeof getAppData !== 'function') return;
    const data = await getAppData();
    if (data && Object.keys(data.ORDERS || {}).length) {
      _populateBranchContact(data);
      renderDashboard(data);
      requestAnimationFrame(syncDashboardHeight);
    }
  }, { once: true });

  setTimeout(async () => {
    if (_lastData) return;
    if (typeof getAppData !== 'function') return;
    const data = await getAppData();
    if (data) {
      _populateBranchContact(data);
      renderDashboard(data);
      requestAnimationFrame(syncDashboardHeight);
    }
  }, 1000);

  // ResizeObserver for redrawing charts & auto-adjusting days & locking height crisply
  const resizeObserver = new ResizeObserver(() => {
    if (_lastData) {
      renderBookingsBarChart(Object.values(_lastData.ORDERS || {}));
      renderServiceLevelChart(Object.values(_lastData.ORDERS || {}), _lastData.SHIPMENTS || {});
      renderDestinationsChart(Object.values(_lastData.ORDERS || {}));
      requestAnimationFrame(syncDashboardHeight);
    }
  });

  const leftGraphs = document.querySelector('.dashboard-left-graphs');
  const barContainer = document.getElementById('bookings-bar-container');
  const slaContainer = document.getElementById('sla-chart-container');
  const destContainer = document.getElementById('destinations-chart-container');
  if (leftGraphs) resizeObserver.observe(leftGraphs);
  if (barContainer) resizeObserver.observe(barContainer);
  if (slaContainer) resizeObserver.observe(slaContainer);
  if (destContainer) resizeObserver.observe(destContainer);

  window.addEventListener('resize', () => requestAnimationFrame(syncDashboardHeight));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initDashboard);
} else {
  _initDashboard();
}
}

