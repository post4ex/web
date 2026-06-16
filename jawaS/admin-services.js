// ============================================================================
// admin-services.js — Services tile: status badges + per-service log panels
// ============================================================================

const AdminServices = (() => {

    // ── Service definitions ──────────────────────────────────────────────────
    const SERVICES = [
        { id: 'app',        name: 'App',         icon: '🖥️',  desc: 'Genie backend (FastAPI)' },
        { id: 'pocketbase', name: 'PocketBase',  icon: '🗄️',  desc: 'Primary database' },
        { id: 'tracking',   name: 'Tracking',    icon: '📦',  desc: 'Carrier tracking service' },
        { id: 'whatsapp',   name: 'WhatsApp',    icon: '💬',  desc: 'WA messaging (Render)' },
        { id: 'captcha',    name: 'Captcha',     icon: '🔒',  desc: 'Captcha service (HF)' },
        { id: 'mailjet',    name: 'Mailjet',     icon: '📧',  desc: 'Transactional email' },
        { id: 'brevo',      name: 'Brevo',       icon: '📨',  desc: 'Email / SMS' },
        { id: 'render',     name: 'Render',      icon: '☁️',  desc: 'WA service host' },
        { id: 'turso',      name: 'Turso',       icon: '🗃️',  desc: 'Turso DB (tracking/WA/mail logs)' },
        { id: 'ds-objects',  name: 'HF Objects',  icon: '🗂️',  desc: 'HF dataset: media files (POD/KYC/receipts)' },
        { id: 'ds-track-db', name: 'HF Track DB', icon: '💾',  desc: 'HF dataset: tracking SQLite DB' },
        { id: 'ds-pb',       name: 'HF PocketBase',icon: '💽', desc: 'HF dataset: PocketBase data' },
        { id: 'ds-todo',     name: 'HF Todo',     icon: '📋',  desc: 'HF dataset: todo/docs' },
        { id: 'r2',          name: 'R2 Bucket',   icon: '🪣',  desc: 'Cloudflare R2: post4ex-objects' },
        { id: 'hfbucket',    name: 'HF Bucket',   icon: '🗑️',  desc: 'HF S3 bucket: post4ex/Objects-bucket' },
    ];

    // Log tab definitions per service
    const SERVICE_TABS = {
        app:        ['app_logs', 'notifications', 'hf_logs'],
        pocketbase: ['app_logs', 'hf_logs'],
        tracking:   ['tracking_logs', 'shipments', 'movements', 'hf_logs'],
        whatsapp:   ['wa_logs', 'render_logs'],
        captcha:    ['hf_logs'],
        mailjet:    ['mail_logs'],
        brevo:      ['mail_logs'],
        render:     ['render_logs'],
        turso:      ['turso_tracking', 'turso_wa', 'turso_mail'],
        'ds-objects':  ['ds_files'],
        'ds-track-db': ['ds_files'],
        'ds-pb':       ['ds_files'],
        'ds-todo':     ['ds_files'],
        r2:            ['bucket_files'],
        hfbucket:      ['hfbucket_files'],
    };

    const TAB_LABELS = {
        app_logs:       'App Logs',
        notifications:  'Notifications',
        tracking_logs:  'Track Logs',
        shipments:      'Shipments',
        movements:      'Movements',
        wa_logs:        'WA Logs',
        mail_logs:      'Mail Logs',
        hf_logs:        'HF Container',
        render_logs:    'Render Logs',
        turso_tracking: 'Tracking',
        turso_wa:       'WhatsApp',
        turso_mail:     'Mail',
        ds_files:       'Files',
        bucket_files:   'Files',
        hfbucket_files: 'Files',
    };

    let _statuses = {};       // { serviceId: { status, latency_ms, checked_at } }
    let _activeService = null;
    let _activeTab = null;
    let _autoRefreshTimer = null;

    // ── Status badge ─────────────────────────────────────────────────────────
    function _badge(status) {
        const map = { online: ['🟢', 'text-green-600'], offline: ['🔴', 'text-red-500'], degraded: ['🟡', 'text-yellow-500'] };
        const [dot, cls] = map[status] || ['⚪', 'text-gray-400'];
        return `<span class="${cls} font-semibold text-xs">${dot} ${status || 'unknown'}</span>`;
    }

    function _latency(ms) {
        if (ms == null) return '';
        return `<span class="text-xs text-gray-400 ml-1">${ms}ms</span>`;
    }

    // ── Render service list ──────────────────────────────────────────────────
    function _renderList() {
        const ul  = document.getElementById('adminList');
        const msg = document.getElementById('listMsg');
        msg.textContent = '';
        ul.innerHTML = SERVICES.map(s => {
            const st = _statuses[s.id];
            return `<li data-key="${s.id}" class="flex flex-col gap-0.5">
                <div class="flex items-center gap-2">
                    <span>${s.icon}</span>
                    <strong class="text-sm">${s.name}</strong>
                    ${st ? _badge(st.status) + _latency(st.latency_ms) : '<span class="text-xs text-gray-400">—</span>'}
                </div>
                <span class="text-xs text-gray-400 pl-6">${s.desc}</span>
            </li>`;
        }).join('');
        ul.querySelectorAll('li').forEach(li => li.addEventListener('click', () => {
            ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
            li.classList.add('selected');
            _showDetail(li.dataset.key);
        }));
        // update online count
        const online = Object.values(_statuses).filter(s => s.status === 'online').length;
        const cnt = document.getElementById('cnt-services');
        if (cnt) cnt.textContent = Object.keys(_statuses).length ? online + '/' + SERVICES.length : '…';
    }

    // ── Ping all ─────────────────────────────────────────────────────────────
    async function _pingAll() {
        try {
            const res = await ServicesAPI.pingAll();
            _statuses = res.data || {};
            _renderList();
            if (_activeService) _refreshStatusCard(_activeService);
        } catch (e) {
            document.getElementById('listMsg').textContent = 'Status fetch failed: ' + e.message;
        }
    }

    // ── Detail pane ──────────────────────────────────────────────────────────
    function _showDetail(serviceId) {
        _activeService = serviceId;
        const svc  = SERVICES.find(s => s.id === serviceId);
        const st   = _statuses[serviceId] || {};
        const tabs = SERVICE_TABS[serviceId] || [];

        AdminPage.showDetail(true);
        AdminPage.showDetailPane();

        const tabBar = tabs.map(t =>
            `<button class="svc-tab px-3 py-1.5 text-xs font-medium border-b-2 ${_activeTab === t ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
                data-tab="${t}">${TAB_LABELS[t]}</button>`
        ).join('');

        document.getElementById('detailView').innerHTML = `
            <div class="detail-card">
                <div class="detail-card-header flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${svc.icon}</span>
                        <h3 class="font-semibold text-gray-700 text-sm">${svc.name}</h3>
                        <span id="svc-status-badge">${st.status ? _badge(st.status) : ''}</span>
                        <span id="svc-latency" class="text-xs text-gray-400">${st.latency_ms != null ? st.latency_ms + 'ms' : ''}</span>
                    </div>
                    <div class="flex gap-1 flex-wrap" id="svc-actions">
                        <button id="svc-ping-btn" class="btn btn-sm text-xs">Ping</button>
                        ${serviceId === 'whatsapp' ? `
                            <button id="svc-wa-status-btn"  class="btn btn-sm text-xs">Status</button>
                            <button id="svc-wa-logout-btn"  class="btn btn-sm text-xs bg-red-50 text-red-600">Logout</button>
                            <button id="svc-wa-qr-btn"      class="btn btn-sm text-xs bg-indigo-50 text-indigo-600">Show QR</button>
                            <button id="svc-render-restart-btn" class="btn btn-sm text-xs bg-orange-50 text-orange-600">Restart</button>
                        ` : ''}
                        ${serviceId === 'render' ? `
                            <button id="svc-render-restart-btn" class="btn btn-sm text-xs bg-orange-50 text-orange-600">Restart WA</button>
                        ` : ''}
                    </div>
                </div>
                <div class="detail-card-body space-y-3">
                    <p class="text-xs text-gray-500">${svc.desc}</p>
                    ${st.checked_at ? `<p class="text-xs text-gray-400">Last checked: ${new Date(st.checked_at * 1000).toLocaleTimeString()}</p>` : ''}
                    ${serviceId === 'whatsapp' ? `<p class="text-xs font-medium">WA connection: <span id="svc-wa-state" class="text-gray-400">—</span></p>
                    <p class="text-xs font-medium">Pending queue: <span id="svc-wa-queue" class="text-gray-400">—</span></p>` : ''}
                    ${tabs.length ? `
                    <div class="border-b border-gray-200 flex gap-1 flex-wrap" id="svc-tab-bar">${tabBar}</div>
                    <div id="svc-tab-content" class="pt-2"></div>` : '<p class="text-xs text-gray-400 italic">No log panels for this service.</p>'}
                </div>
            </div>`;

        document.getElementById('svc-ping-btn').addEventListener('click', async () => {
            const btn = document.getElementById('svc-ping-btn');
            btn.disabled = true; btn.textContent = '…';
            try {
                const r = await ServicesAPI.ping(serviceId);
                _statuses[serviceId] = r;
                _renderList();
                _refreshStatusCard(serviceId);
            } catch (e) {
                showNotification('Ping failed: ' + e.message, 'error');
            } finally { btn.disabled = false; btn.textContent = 'Ping'; }
        });

        // WA / Render action buttons
        const restartBtn = document.getElementById('svc-render-restart-btn');
        if (restartBtn) restartBtn.addEventListener('click', async () => {
            if (!confirm('Restart the WhatsApp Render service?')) return;
            restartBtn.disabled = true; restartBtn.textContent = '…';
            try {
                await ServicesAPI.renderRestart();
                showNotification('Render restart triggered.', 'success');
            } catch (e) {
                showNotification('Restart failed: ' + e.message, 'error');
            } finally { restartBtn.disabled = false; restartBtn.textContent = serviceId === 'render' ? 'Restart WA' : 'Restart'; }
        });

        const logoutBtn = document.getElementById('svc-wa-logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', async () => {
            if (!confirm('Logout WhatsApp session?')) return;
            logoutBtn.disabled = true; logoutBtn.textContent = '…';
            try {
                await ServicesAPI.waLogout();
                showNotification('WhatsApp logged out.', 'success');
            } catch (e) {
                showNotification('Logout failed: ' + e.message, 'error');
            } finally { logoutBtn.disabled = false; logoutBtn.textContent = 'Logout'; }
        });

        const statusBtn = document.getElementById('svc-wa-status-btn');
        if (statusBtn) statusBtn.addEventListener('click', async () => {
            statusBtn.disabled = true; statusBtn.textContent = '…';
            try {
                const r = await ServicesAPI.waStatus();
                _setWAState(r.wa_state || 'unknown');
                const qEl = document.getElementById('svc-wa-queue');
                if (qEl) {
                    const n = r.pending ?? 0;
                    qEl.textContent = n === 0 ? '0 (clear)' : `${n} message${n > 1 ? 's' : ''} pending`;
                    qEl.className = n > 0 ? 'text-orange-500 font-semibold' : 'text-green-600';
                }
            } catch (e) {
                showNotification('Status failed: ' + e.message, 'error');
            } finally { statusBtn.disabled = false; statusBtn.textContent = 'Status'; }
        });

        const qrBtn = document.getElementById('svc-wa-qr-btn');
        if (qrBtn) qrBtn.addEventListener('click', _openQRModal);

        // auto-fetch WA connection state on open
        if (serviceId === 'whatsapp') {
            _fetchWAMeta();
        }

        if (tabs.length) {
            document.getElementById('svc-tab-bar').addEventListener('click', e => {
                const btn = e.target.closest('[data-tab]');
                if (!btn) return;
                _activeTab = btn.dataset.tab;
                _showDetail(serviceId);   // re-render with new active tab
                _loadTab(_activeTab);
            });
            // auto-load first tab
            if (!_activeTab || !tabs.includes(_activeTab)) _activeTab = tabs[0];
            _loadTab(_activeTab);
        }
    }

    function _refreshStatusCard(serviceId) {
        const st = _statuses[serviceId] || {};
        const badge = document.getElementById('svc-status-badge');
        const lat   = document.getElementById('svc-latency');
        if (badge) badge.innerHTML = st.status ? _badge(st.status) : '';
        if (lat)   lat.textContent = st.latency_ms != null ? st.latency_ms + 'ms' : '';
    }

    // ── Tab content loader ───────────────────────────────────────────────────
    async function _loadTab(tab) {
        const el = document.getElementById('svc-tab-content');
        if (!el) return;
        el.innerHTML = '<p class="text-xs text-gray-400">Loading…</p>';
        try {
            switch (tab) {
                case 'app_logs':        await _renderAppLogs(el);        break;
                case 'notifications':   await _renderNotifications(el);  break;
                case 'tracking_logs':   await _renderTrackingLogs(el);   break;
                case 'shipments':       await _renderShipments(el);      break;
                case 'movements':       await _renderMovements(el);      break;
                case 'wa_logs':         await _renderWALogs(el);         break;
                case 'mail_logs':       await _renderMailLogs(el);       break;
                case 'hf_logs':         await _renderHFLogs(el);         break;
                case 'render_logs':     await _renderRenderLogs(el);     break;
                case 'turso_tracking':  await _renderTrackingLogs(el);   break;
                case 'turso_wa':        await _renderWALogs(el);         break;
                case 'turso_mail':      await _renderMailLogs(el);       break;
                default: el.innerHTML = '';
            }
        } catch (e) {
            el.innerHTML = `<p class="text-xs text-red-500">Failed: ${e.message}</p>`;
        }
        // re-populate WA meta after tab re-render only if detail is still showing
        if (_activeService === 'whatsapp' && document.getElementById('svc-wa-state')) _fetchWAMeta();
    }

    // ── Generic table renderer ───────────────────────────────────────────────
    function _table(cols, rows, emptyMsg = 'No records.') {
        if (!rows.length) return `<p class="text-xs text-gray-400 italic">${emptyMsg}</p>`;
        const ths = cols.map(c => `<th>${c.label}</th>`).join('');
        const trs = rows.map((r, i) =>
            `<tr class="svc-row-click" data-idx="${i}" style="cursor:pointer">${cols.map(c => `<td data-label="${c.label}"${c.wrap ? ' class="wrap"' : ''} title="${String(r[c.key] ?? '')}">${_cell(c, r)}</td>`).join('')}</tr>`
        ).join('');
        const html = `<div class="overflow-x-auto"><table class="svc-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        wrap.querySelectorAll('.svc-row-click').forEach(tr => {
            tr.addEventListener('click', () => _showRowDetail(rows[+tr.dataset.idx]));
        });
        return wrap;
    }

    function _cell(col, row) {
        const v = row[col.key];
        if (v == null || v === '') return '—';
        if (col.badge) return _statusDot(v);
        if (col.ts)    return _fmtTs(v);
        if (col.trunc) return `<span style="max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(String(v))}</span>`;
        return _esc(String(v));
    }

    function _esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function _statusDot(v) {
        const map = { ok: '#16a34a', error: '#dc2626', fail: '#dc2626', skip: '#d97706',
                      online: '#16a34a', offline: '#dc2626', degraded: '#d97706',
                      delivered: '#16a34a', intransit: '#d97706', outfordelivery: '#2563eb',
                      exception: '#dc2626', pending: '#6b7280' };
        const c = map[String(v).toLowerCase()] || '#6b7280';
        return `<span style="background:${c};color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600">${_esc(String(v))}</span>`;
    }

    function _fmtTs(v) {
        if (!v) return '—';
        try {
            const n = typeof v === 'string' && v.includes('-') ? new Date(v) : new Date(Number(v) * 1000);
            return n.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        } catch { return String(v); }
    }

    // ── Filter bar helper ────────────────────────────────────────────────────
    function _filterBar(fields, onFilter) {
        const inputs = fields.map(f =>
            f.type === 'select'
                ? `<select data-f="${f.key}" class="svc-filter-input">${['', ...f.opts].map(o => `<option value="${o}">${o || f.label}</option>`).join('')}</select>`
                : `<input data-f="${f.key}" placeholder="${f.label}" class="svc-filter-input">`
        ).join('');
        const bar = document.createElement('div');
        bar.className = 'flex gap-2 flex-wrap mb-2';
        bar.innerHTML = inputs + `<button class="btn btn-sm text-xs svc-filter-btn">Filter</button>`;
        bar.querySelector('.svc-filter-btn').addEventListener('click', () => {
            const params = {};
            bar.querySelectorAll('[data-f]').forEach(el => { if (el.value) params[el.dataset.f] = el.value; });
            onFilter(params);
        });
        return bar;
    }

    // ── App Logs ─────────────────────────────────────────────────────────────
    async function _renderAppLogs(el, params = {}) {
        const bar = _filterBar([
            { key: 'status',   label: 'Status',   type: 'select', opts: ['success','error','denied','blocked','login','logout'] },
            { key: 'user',     label: 'User' },
            { key: 'endpoint', label: 'Endpoint' },
        ], p => _renderAppLogs(el, p));
        const res  = await ServicesAPI.getLogsApp({ limit: 100, ...params });
        const cols = [
            { key: 'TIMESTAMP',   label: 'Time',     ts: true },
            { key: 'USER',        label: 'User',     trunc: true },
            { key: 'ROLE',        label: 'Role' },
            { key: 'ENDPOINT',    label: 'Endpoint', trunc: true },
            { key: 'METHOD',      label: 'Method' },
            { key: 'STATUS',      label: 'Status',   badge: true },
            { key: 'DURATION_MS', label: 'ms' },
            { key: 'IP',          label: 'IP' },
        ];
        el.innerHTML = '';
        el.appendChild(bar);
        el.appendChild(_table(cols, res.data || []));
    }

    // ── Notifications ─────────────────────────────────────────────────────────
    async function _renderNotifications(el, params = {}) {
        const bar = _filterBar([
            { key: 'level', label: 'Level', type: 'select', opts: ['INFO','WARNING','CRITICAL'] },
        ], p => _renderNotifications(el, p));
        const res  = await ServicesAPI.getLogsNotif({ limit: 50, ...params });
        const cols = [
            { key: 'TIMESTAMP', label: 'Time',    ts: true },
            { key: 'LEVEL',     label: 'Level',   badge: true },
            { key: 'MESSAGE',   label: 'Message', trunc: true },
            { key: 'SENDER',    label: 'Sender' },
            { key: 'BRANCH',    label: 'Branch' },
        ];
        el.innerHTML = '';
        el.appendChild(bar);
        el.appendChild(_table(cols, res.data || []));
    }

    // ── Tracking Turso Logs ───────────────────────────────────────────────────
    async function _renderTrackingLogs(el, params = {}) {
        const bar = _filterBar([
            { key: 'event',  label: 'Event',  type: 'select', opts: ['startup','sync','worker_cycle','state_change','shipment_add','shipment_update','tracking_patch','live_track','notify','error'] },
            { key: 'status', label: 'Status', type: 'select', opts: ['ok','fail','error'] },
        ], p => _renderTrackingLogs(el, p));
        const res  = await ServicesAPI.getLogsTrack({ limit: 100, ...params });
        const cols = [
            { key: 'created_at', label: 'Time',      trunc: true },
            { key: 'event',      label: 'Event',      badge: true },
            { key: 'reference',  label: 'Reference' },
            { key: 'status',     label: 'Status',     badge: true },
            { key: 'detail',     label: 'Detail',     trunc: true },
        ];
        el.innerHTML = '';
        el.appendChild(bar);
        el.appendChild(_table(cols, res.data || []));
    }

    // ── Tracking Shipments ────────────────────────────────────────────────────
    async function _renderShipments(el, params = {}) {
        const bar = _filterBar([
            { key: 'state',   label: 'State',   type: 'select', opts: ['pending','intransit','outfordelivery','delivered','exception','no_trace'] },
            { key: 'carrier', label: 'Carrier' },
        ], p => _renderShipments(el, p));
        const res  = await ServicesAPI.getShipments({ limit: 100, ...params });
        const cols = [
            { key: 'reference',   label: 'Ref' },
            { key: 'awb',         label: 'AWB' },
            { key: 'carrier',     label: 'Carrier' },
            { key: 'state',       label: 'State',       badge: true },
            { key: 'status_raw',  label: 'Status',      trunc: true },
            { key: 'origin',      label: 'Origin' },
            { key: 'destination', label: 'Dest' },
            { key: 'last_updated',label: 'Updated',     ts: true },
        ];
        el.innerHTML = '';
        el.appendChild(bar);
        el.appendChild(_table(cols, res.data || []));
    }

    // ── Tracking Movements ────────────────────────────────────────────────────
    async function _renderMovements(el, params = {}) {
        const bar = _filterBar([
            { key: 'state',   label: 'State',   type: 'select', opts: ['pending','intransit','outfordelivery','delivered','exception'] },
            { key: 'carrier', label: 'Carrier' },
        ], p => _renderMovements(el, p));
        const res  = await ServicesAPI.getMovements({ limit: 100, ...params });
        const cols = [
            { key: 'reference',      label: 'Ref' },
            { key: 'awb',            label: 'AWB' },
            { key: 'date',           label: 'Date' },
            { key: 'time',           label: 'Time' },
            { key: 'location',       label: 'Location',  trunc: true },
            { key: 'activity',       label: 'Activity',  trunc: true },
            { key: 'activity_state', label: 'State',     badge: true },
        ];
        el.innerHTML = '';
        el.appendChild(bar);
        el.appendChild(_table(cols, res.data || []));
    }

    // ── WA Logs ───────────────────────────────────────────────────────────────
    async function _renderWALogs(el, params = {}) {
        const bar = _filterBar([
            { key: 'event',  label: 'Event' },
            { key: 'status', label: 'Status', type: 'select', opts: ['ok','fail','error'] },
        ], p => _renderWALogs(el, p));
        const res  = await ServicesAPI.getLogsWA({ limit: 100, ...params });
        const cols = [
            { key: 'created_at', label: 'Time',      trunc: true },
            { key: 'event',      label: 'Event',      badge: true },
            { key: 'reference',  label: 'Reference' },
            { key: 'status',     label: 'Status',     badge: true },
            { key: 'detail',     label: 'Detail',     trunc: true },
        ];
        el.innerHTML = '';
        el.appendChild(bar);
        el.appendChild(_table(cols, res.data || []));
    }

    // ── Mail Logs ─────────────────────────────────────────────────────────────
    async function _renderMailLogs(el, params = {}) {
        const bar = _filterBar([
            { key: 'event',  label: 'Event' },
            { key: 'status', label: 'Status', type: 'select', opts: ['ok','fail','error'] },
        ], p => _renderMailLogs(el, p));
        const res  = await ServicesAPI.getLogsMail({ limit: 100, ...params });
        const cols = [
            { key: 'created_at', label: 'Time',      trunc: true },
            { key: 'event',      label: 'Event',      badge: true },
            { key: 'reference',  label: 'Reference' },
            { key: 'status',     label: 'Status',     badge: true },
            { key: 'detail',     label: 'Detail',     trunc: true },
        ];
        el.innerHTML = '';
        el.appendChild(bar);
        el.appendChild(_table(cols, res.data || []));
    }

    // ── HF Container Logs ─────────────────────────────────────────────────────
    async function _renderHFLogs(el) {
        const spaceMap = { app: 'app', tracking: 'tracking', pocketbase: 'pocketbase', captcha: 'captcha' };
        const space = spaceMap[_activeService];
        if (!space) { el.innerHTML = '<p class="text-xs text-gray-400 italic">Not available for this service.</p>'; return; }
        const res = await ServicesAPI.getHFLogs(space, 100);
        const runtime = res.runtime || {};
        const lines   = res.logs   || [];
        const hw = runtime.hardware?.current || runtime.hardware || '—';
        const info = runtime.stage
            ? `<p class="text-xs text-gray-500 mb-2">Stage: <strong>${runtime.stage}</strong> · Hardware: ${hw} · Replicas: ${runtime.replicas?.current ?? '—'}</p>`
            : '';
        const cols = [
            { key: 'ts',  label: 'Time',    trunc: true },
            { key: 'msg', label: 'Message', wrap: true },
        ];
        el.innerHTML = info;
        el.appendChild(_table(cols, [...lines].reverse()));
    }

    // ── Render Logs ───────────────────────────────────────────────────────────
    async function _renderRenderLogs(el) {
        const res  = await ServicesAPI.getRenderLogs(100);
        const cols = [
            { key: 'ts',  label: 'Time',    trunc: true },
            { key: 'msg', label: 'Message', wrap: true },
        ];
        el.innerHTML = '';
        el.appendChild(_table(cols, res.data || []));
    }

    // ── WA connection state ───────────────────────────────────────────────────
    function _fetchWAMeta() {
        ServicesAPI.waStatus().then(r => {
            _setWAState(r.wa_state || 'unknown');
            const qEl = document.getElementById('svc-wa-queue');
            if (qEl) {
                const n = r.pending ?? 0;
                qEl.textContent = n === 0 ? '0 (clear)' : `${n} message${n > 1 ? 's' : ''} pending`;
                qEl.className = n > 0 ? 'text-orange-500 font-semibold' : 'text-green-600';
            }
        }).catch(() => _setWAState('offline'));
    }

    function _setWAState(state) {
        const el = document.getElementById('svc-wa-state');
        if (!el) return;
        const map = { connected: 'text-green-600', qr: 'text-yellow-500', disconnected: 'text-red-500' };
        el.className = map[state] || 'text-gray-400';
        el.textContent = state;
    }

    // ── Row detail modal ──────────────────────────────────────────────────────
    function _showRowDetail(row) {
        let modal = document.getElementById('svc-row-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'svc-row-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:36rem">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="font-semibold text-gray-700 text-sm">Row Detail</h3>
                        <button id="svc-row-modal-close" class="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                    </div>
                    <div id="svc-row-modal-body"></div>
                </div>`;
            document.body.appendChild(modal);
            document.getElementById('svc-row-modal-close').onclick = () => modal.classList.add('hidden');
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
        }
        const body = document.getElementById('svc-row-modal-body');
        body.innerHTML = Object.entries(row).map(([k, v]) => {
            const val = typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? '—');
            const isLong = val.length > 60 || val.includes('\n');
            return `<div class="mb-2">
                <div class="text-xs font-semibold text-gray-500 uppercase mb-0.5">${_esc(k)}</div>
                ${isLong
                    ? `<pre class="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap break-all">${_esc(val)}</pre>`
                    : `<div class="text-xs text-gray-800 break-all">${_esc(val)}</div>`}
            </div>`;
        }).join('');
        modal.classList.remove('hidden');
    }

    // ── QR Modal ──────────────────────────────────────────────────────────────
    let _qrPollTimer = null;

    function _openQRModal() {
        let modal = document.getElementById('svc-qr-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'svc-qr-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content text-center" style="max-width:22rem">
                    <h3 class="font-semibold text-gray-700 mb-3">WhatsApp QR</h3>
                    <div id="svc-qr-body" class="min-h-32 flex items-center justify-center">
                        <p class="text-xs text-gray-400">Loading…</p>
                    </div>
                    <p id="svc-qr-status" class="text-xs text-gray-500 mt-2"></p>
                    <button id="svc-qr-close" class="btn btn-sm text-xs mt-3">Close</button>
                </div>`;
            document.body.appendChild(modal);
        }
        modal.classList.remove('hidden');
        document.getElementById('svc-qr-close').onclick = _closeQRModal;
        modal.onclick = e => { if (e.target === modal) _closeQRModal(); };
        _pollQR();
    }

    function _closeQRModal() {
        clearInterval(_qrPollTimer);
        const modal = document.getElementById('svc-qr-modal');
        if (modal) modal.classList.add('hidden');
    }

    async function _pollQR() {
        clearInterval(_qrPollTimer);
        await _fetchQR();
        _qrPollTimer = setInterval(async () => {
            const modal = document.getElementById('svc-qr-modal');
            if (!modal || modal.classList.contains('hidden')) { clearInterval(_qrPollTimer); return; }
            await _fetchQR();
        }, 5000);
    }

    async function _fetchQR() {
        const body   = document.getElementById('svc-qr-body');
        const status = document.getElementById('svc-qr-status');
        if (!body) return;
        try {
            const res  = document.getElementById('svc-qr-modal');
            const data = (await ServicesAPI.waQR()).data || {};
            let qrSrc = data.qr || null;
            if (!qrSrc && data.raw) {
                const m = data.raw.match(/src="(data:image[^"]+)"/);
                if (m) qrSrc = m[1];
                else if (data.raw.startsWith('data:image')) qrSrc = data.raw;
            }
            if (qrSrc) {
                body.innerHTML = `<img src="${qrSrc}" alt="QR" style="max-width:220px;max-height:220px">`;
            } else if (data.connected || data.status === 'connected') {
                body.innerHTML = '<p class="text-green-600 font-semibold text-sm">✅ Connected</p>';
                _setWAState('connected');
                clearInterval(_qrPollTimer);
            } else {
                body.innerHTML = `<pre class="text-xs text-gray-500 text-left overflow-auto max-h-40">${_esc(JSON.stringify(data, null, 2))}</pre>`;
            }
            if (status) status.textContent = data.status || '';
        } catch (e) {
            if (body) body.innerHTML = `<p class="text-xs text-red-500">${e.message}</p>`;
        }
    }

    // ── HF Dataset file browser ───────────────────────────────────────────────
    async function _renderDatasetFiles(el) {
        const dsMap = {
            'ds-objects':  'objects',
            'ds-track-db': 'track-db',
            'ds-pb':       'pocketbase',
            'ds-todo':     'todo',
        };
        const name = dsMap[_activeService];
        if (!name) { el.innerHTML = '<p class="text-xs text-gray-400 italic">Unknown dataset.</p>'; return; }
        el.innerHTML = '<p class="text-xs text-gray-400">Loading…</p>';
        const res = await ServicesAPI.datasetFiles(name);
        const files = (res.data || []).filter(f => f.type === 'file');
        const total = res.total_bytes || 0;
        const fmt = b => b > 1e6 ? (b/1e6).toFixed(1)+'MB' : b > 1e3 ? (b/1e3).toFixed(1)+'KB' : b+'B';
        el.innerHTML = `<p class="text-xs text-gray-500 mb-2">${files.length} files · ${fmt(total)} · <a href="https://huggingface.co/datasets/${_esc(res.repo || '')}" target="_blank" class="text-indigo-500 underline">${_esc(res.repo || '')}</a></p>`;
        if (!files.length) { el.insertAdjacentHTML('beforeend', '<p class="text-xs text-gray-400 italic">No files.</p>'); return; }
        const table = document.createElement('div');
        table.className = 'overflow-x-auto';
        table.innerHTML = `<table class="svc-table"><thead><tr><th>Path</th><th>Size</th><th></th></tr></thead><tbody>` +
            files.map(f => `<tr>
                <td class="font-mono text-xs" title="${_esc(f.path)}">${_esc(f.path)}</td>
                <td class="text-xs text-gray-500">${fmt(f.size)}</td>
                <td><button class="text-red-500 text-xs hover:underline ds-del-btn" data-path="${_esc(f.path)}">Delete</button></td>
            </tr>`).join('') +
            `</tbody></table>`;
        el.appendChild(table);
        table.querySelectorAll('.ds-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete ' + btn.dataset.path + '?')) return;
                btn.disabled = true; btn.textContent = '…';
                try {
                    await ServicesAPI.datasetDelete(name, btn.dataset.path);
                    btn.closest('tr').remove();
                    showNotification('Deleted: ' + btn.dataset.path, 'success');
                } catch (e) {
                    showNotification('Delete failed: ' + e.message, 'error');
                    btn.disabled = false; btn.textContent = 'Delete';
                }
            });
        });
    }

    // ── R2 Bucket file browser ────────────────────────────────────────────────
    async function _renderBucketFiles(el, prefix = '') {
        el.innerHTML = '<p class="text-xs text-gray-400">Loading…</p>';
        const res = await ServicesAPI.bucketFiles(prefix);
        const files = res.data || [];
        const total = res.total_bytes || 0;
        const fmt = b => b > 1e6 ? (b/1e6).toFixed(1)+'MB' : b > 1e3 ? (b/1e3).toFixed(1)+'KB' : b+'B';
        const bar = document.createElement('div');
        bar.className = 'flex gap-2 mb-2 items-center';
        bar.innerHTML = `<input id="r2-prefix" placeholder="Prefix filter" value="${_esc(prefix)}" class="svc-filter-input flex-1">
            <button class="btn btn-sm text-xs" id="r2-filter-btn">Filter</button>
            <span class="text-xs text-gray-500">${files.length} objects · ${fmt(total)}</span>`;
        el.innerHTML = '';
        el.appendChild(bar);
        document.getElementById('r2-filter-btn').addEventListener('click', () => {
            _renderBucketFiles(el, document.getElementById('r2-prefix').value.trim());
        });
        if (!files.length) { el.insertAdjacentHTML('beforeend', '<p class="text-xs text-gray-400 italic">No objects.</p>'); return; }
        const table = document.createElement('div');
        table.className = 'overflow-x-auto';
        table.innerHTML = `<table class="svc-table"><thead><tr><th>Key</th><th>Size</th><th>Modified</th><th></th></tr></thead><tbody>` +
            files.map(f => `<tr>
                <td class="font-mono text-xs" title="${_esc(f.key)}">${_esc(f.key)}</td>
                <td class="text-xs text-gray-500">${fmt(f.size)}</td>
                <td class="text-xs text-gray-400">${f.last_modified ? f.last_modified.slice(0,16).replace('T',' ') : '—'}</td>
                <td><button class="text-red-500 text-xs hover:underline r2-del-btn" data-key="${_esc(f.key)}">Delete</button></td>
            </tr>`).join('') +
            `</tbody></table>`;
        el.appendChild(table);
        table.querySelectorAll('.r2-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete ' + btn.dataset.key + '?')) return;
                btn.disabled = true; btn.textContent = '…';
                try {
                    await ServicesAPI.bucketDelete(btn.dataset.key);
                    btn.closest('tr').remove();
                    showNotification('Deleted: ' + btn.dataset.key, 'success');
                } catch (e) {
                    showNotification('Delete failed: ' + e.message, 'error');
                    btn.disabled = false; btn.textContent = 'Delete';
                }
            });
        });
    }

    // ── HF Bucket file browser ───────────────────────────────────────────────
    async function _renderHFBucketFiles(el, prefix = '') {
        el.innerHTML = '<p class="text-xs text-gray-400">Loading…</p>';
        const res = await ServicesAPI.hfBucketFiles(prefix);
        const files = res.data || [];
        const total = res.total_bytes || 0;
        const fmt = b => b > 1e6 ? (b/1e6).toFixed(1)+'MB' : b > 1e3 ? (b/1e3).toFixed(1)+'KB' : b+'B';
        const bar = document.createElement('div');
        bar.className = 'flex gap-2 mb-2 items-center';
        bar.innerHTML = `<input id="hfb-prefix" placeholder="Prefix filter" value="${_esc(prefix)}" class="svc-filter-input flex-1">
            <button class="btn btn-sm text-xs" id="hfb-filter-btn">Filter</button>
            <span class="text-xs text-gray-500">${files.length} objects · ${fmt(total)}</span>`;
        el.innerHTML = '';
        el.appendChild(bar);
        document.getElementById('hfb-filter-btn').addEventListener('click', () => {
            _renderHFBucketFiles(el, document.getElementById('hfb-prefix').value.trim());
        });
        if (!files.length) { el.insertAdjacentHTML('beforeend', '<p class="text-xs text-gray-400 italic">No objects.</p>'); return; }
        const table = document.createElement('div');
        table.className = 'overflow-x-auto';
        table.innerHTML = `<table class="svc-table"><thead><tr><th>Key</th><th>Size</th><th>Modified</th><th></th></tr></thead><tbody>` +
            files.map(f => `<tr>
                <td class="font-mono text-xs" title="${_esc(f.key)}">${_esc(f.key)}</td>
                <td class="text-xs text-gray-500">${fmt(f.size)}</td>
                <td class="text-xs text-gray-400">${f.last_modified ? f.last_modified.slice(0,16).replace('T',' ') : '—'}</td>
                <td><button class="text-red-500 text-xs hover:underline hfb-del-btn" data-key="${_esc(f.key)}">Delete</button></td>
            </tr>`).join('') +
            `</tbody></table>`;
        el.appendChild(table);
        table.querySelectorAll('.hfb-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete ' + btn.dataset.key + '?')) return;
                btn.disabled = true; btn.textContent = '…';
                try {
                    await ServicesAPI.hfBucketDelete(btn.dataset.key);
                    btn.closest('tr').remove();
                    showNotification('Deleted: ' + btn.dataset.key, 'success');
                } catch (e) {
                    showNotification('Delete failed: ' + e.message, 'error');
                    btn.disabled = false; btn.textContent = 'Delete';
                }
            });
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────
    async function load() {
        document.getElementById('listMsg').textContent = 'Pinging services…';
        _renderList();
        await _pingAll();
        // auto-refresh every 60s
        clearInterval(_autoRefreshTimer);
        _autoRefreshTimer = setInterval(_pingAll, 60000);
    }

    function search(q) {
        const lq = q.toLowerCase();
        const ul = document.getElementById('adminList');
        ul.querySelectorAll('li').forEach(li => {
            li.style.display = li.textContent.toLowerCase().includes(lq) ? '' : 'none';
        });
    }

    // hide add button — services are fixed, not user-added
    function openAddPane() {}

    return { load, search, openAddPane };
})();

window.AdminServices = AdminServices;
