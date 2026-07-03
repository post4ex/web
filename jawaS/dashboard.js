// ============================================================================
// DASHBOARD.JS — Charts, Branch Contact & Smooth Data Refresh
// ============================================================================

{
let _charts = {};
let _lastDataHash = '';
let _refreshTimer = null;
let _building = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

function _quickHash(data) {
    const orders = Object.values(data?.ORDERS || {});
    const n = orders.length;
    if (!n) return '0';
    // Sample first 50 orders for a fingerprint
    let s = n + '|';
    for (let i = 0; i < Math.min(50, orders.length); i++) {
        const o = orders[i];
        s += (o.ORDER_DATE || '') + '|' + (o.STATUS || '') + '|' + (o.CARRIER || '') + '|';
    }
    return s;
}

// ── Chart Builder ────────────────────────────────────────────────────────────

function buildCharts(appData) {
    const orders = Object.values(appData?.ORDERS || {});
    if (!orders.length) return;

    // 1. Bookings last 7 days
    const today = new Date();
    const labels7 = [];
    const counts7 = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        labels7.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }));
        counts7[key] = 0;
    }
    orders.forEach(o => {
        const d = parseDate(o.ORDER_DATE);
        if (!d) return;
        const k = d.toISOString().split('T')[0];
        if (k in counts7) counts7[k]++;
    });

    // 2. Top destinations (by DEST_CITY)
    const cityMap = {};
    orders.forEach(o => {
        const c = (o.DEST_CITY || 'Unknown').trim();
        cityMap[c] = (cityMap[c] || 0) + 1;
    });
    const cityEntries = Object.entries(cityMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const cityLabels  = cityEntries.map(e => e[0]);
    const cityData    = cityEntries.map(e => e[1]);

    // 3. Orders by CARRIER
    const carrierMap = {};
    orders.forEach(o => {
        const c = o.CARRIER || 'Unknown';
        carrierMap[c] = (carrierMap[c] || 0) + 1;
    });
    const carrierLabels = Object.keys(carrierMap);
    const carrierData   = Object.values(carrierMap);

    // Destroy old charts before re-render
    Object.values(_charts).forEach(c => c.destroy());
    _charts = {};

    const bookingsCtx = document.getElementById('bookingsChart')?.getContext('2d');
    if (bookingsCtx) {
        _charts.bookings = new Chart(bookingsCtx, {
            type: 'line',
            data: {
                labels: labels7,
                datasets: [{
                    label: 'Bookings',
                    data: Object.values(counts7),
                    backgroundColor: 'rgba(156,32,7,0.1)',
                    borderColor: '#9C2007',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false } }
            }
        });
    }

    const shipmentsCtx = document.getElementById('shipmentsChart')?.getContext('2d');
    if (shipmentsCtx) {
        _charts.shipments = new Chart(shipmentsCtx, {
            type: 'bar',
            data: {
                labels: cityLabels,
                datasets: [{
                    label: 'Bookings',
                    data: cityData,
                    backgroundColor: '#9C2007',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false } }
            }
        });
    }

    const revenueCtx = document.getElementById('revenueChart')?.getContext('2d');
    if (revenueCtx) {
        _charts.revenue = new Chart(revenueCtx, {
            type: 'bar',
            data: {
                labels: carrierLabels,
                datasets: [{
                    label: 'Orders',
                    data: carrierData,
                    backgroundColor: '#9C2007',
                    borderRadius: 4
                }]
            },
            options: {
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false } }
            }
        });
    }
}

// ── Smooth Refresh (debounce + change detection + hide/flash guard) ─────────

let _pendingRefresh = null;

function _debouncedRefresh(data) {
    if (_building) {
        // Queue latest data for rebuild once current one finishes
        _pendingRefresh = data;
        return;
    }

    const hash = _quickHash(data);
    if (hash === _lastDataHash && Object.keys(_charts).length > 0) {
        // Data unchanged and charts exist — skip rebuild entirely
        return;
    }
    _lastDataHash = hash;

    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(() => {
        _building = true;

        // Fade out canvases to prevent visual flicker
        const canvases = document.querySelectorAll('canvas');
        canvases.forEach(c => { c.style.transition = 'opacity 0.15s ease'; c.style.opacity = '0'; });

        requestAnimationFrame(() => {
            buildCharts(data);
            // Fade canvases back in
            requestAnimationFrame(() => {
                canvases.forEach(c => { c.style.opacity = '1'; });
                setTimeout(() => {
                    canvases.forEach(c => { c.style.transition = ''; });
                    _building = false;
                    // Drain any pending refresh that queued while we were building
                    if (_pendingRefresh) {
                        const nextData = _pendingRefresh;
                        _pendingRefresh = null;
                        _debouncedRefresh(nextData);
                    }
                }, 200);
            });
        });
    }, 350); // 350ms debounce — coalesces rapid events
}

// ── Branch Contact Details ───────────────────────────────────────────────────

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
            const addr = [branch.BRANCH_ADDRESS, branch.BRANCH_CITY, branch.BRANCH_STATE]
                .filter(Boolean).join(', ');
            addressEl.textContent = addr ? `${addr} - ${branch.BRANCH_PINCODE || ''}` : 'Shivlok Colony, Haripur, Dehradun - 248001';
            emailEl.textContent = branch.BRANCH_EMAIL || 'genieassists@gmail.com';
            // Optionally add mobile
            const mobileEl = contactModal.querySelector('[data-branch-mobile]');
            if (mobileEl) mobileEl.textContent = branch.BRANCH_MOBILE || '';
        }
    } catch (_) {
        // Fallback — keep hardcoded values in HTML
    }
}

// ── Initialization ───────────────────────────────────────────────────────────

function _initDashboard() {
    // Listen for both events — debouncedRefresh handles dedup
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

    // Fallback: if IndexedDB already has data before events fire
    window.addEventListener('indexedDBReady', async () => {
        if (Object.keys(_charts).length) return; // already rendered
        if (typeof getAppData !== 'function') return;
        const data = await getAppData();
        if (data && Object.keys(data.ORDERS || {}).length) {
            _populateBranchContact(data);
            buildCharts(data);
        }
    }, { once: true });

    // Safety timeout — render if nothing has rendered after 3s
    setTimeout(async () => {
        if (Object.keys(_charts).length) return;
        if (typeof getAppData !== 'function') return;
        const data = await getAppData();
        if (data) {
            _populateBranchContact(data);
            buildCharts(data);
        }
    }, 3000);

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        Object.values(_charts).forEach(c => c.destroy());
        _charts = {};
    });
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initDashboard);
} else {
    _initDashboard();
}
}
