// ============================================================================
// VAULT-STREAM.JS — Shared NDJSON x-ndjson stream consumer for pyacc
// Mirrors exactly how Genie /api/sync/stream works on the WEBAPP side.
// All vault modules use VaultStream.get(sheet) after VaultStream.sync() resolves.
// ============================================================================

window.VaultStream = (() => {

    // ── Internal state ────────────────────────────────────────────────────────
    const _cache = {};               // { SHEET_NAME: [records...] }
    const _meta  = {};               // syncTimestamp, role, entity_id, etc.
    let _syncing = null;             // Promise (deduplicate concurrent calls)
    let _syncedAt = 0;               // epoch ms of last successful sync
    const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes — re-sync if stale

    // ── Auth token (same pattern as all other vault modules) ──────────────────
    function _getToken() {
        if (typeof getSessionId === 'function') {
            const s = getSessionId();
            if (s) return s;
        }
        try {
            const raw = localStorage.getItem('loginData') || '';
            if (raw) {
                const parsed = JSON.parse(raw);
                return parsed.sessionId || '';
            }
        } catch { /* ignore */ }
        return '';
    }

    // ── Parse NDJSON from a ReadableStream ────────────────────────────────────
    // Each line is a JSON object. We accumulate per-sheet into _cache.
    async function _consumeStream(response, onProgress) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let leftover = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const text = leftover + chunk;
            const lines = text.split('\n');
            leftover = lines.pop();            // last item may be incomplete

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const obj = JSON.parse(trimmed);
                    _handleObject(obj, onProgress);
                } catch (e) {
                    console.warn('[VaultStream] parse error on line:', trimmed.slice(0, 80), e);
                }
            }
        }

        // Handle any remaining bytes
        if (leftover.trim()) {
            try {
                const obj = JSON.parse(leftover.trim());
                _handleObject(obj, onProgress);
            } catch { /* ignore incomplete final line */ }
        }
    }

    // ── Route each parsed NDJSON object ──────────────────────────────────────
    function _handleObject(obj, onProgress) {
        switch (obj.type) {
            case 'meta':
                Object.assign(_meta, obj);
                break;
            case 'data': {
                const sheet = obj.sheet;
                if (!_cache[sheet]) _cache[sheet] = [];
                _cache[sheet].push(obj.record);
                break;
            }
            case 'sheet_done':
                if (typeof onProgress === 'function') {
                    onProgress({ sheet: obj.sheet, count: obj.count });
                }
                break;
            case 'done':
                _syncedAt = Date.now();
                Object.assign(_meta, { done: true, total: obj.total_records });
                break;
            default:
                break;
        }
    }

    // ── Clear cache for specific sheets (or all) ──────────────────────────────
    function _clearSheets(sheets) {
        if (!sheets || sheets.length === 0) {
            Object.keys(_cache).forEach(k => delete _cache[k]);
        } else {
            sheets.forEach(s => delete _cache[s]);
        }
    }

    // ── Public: sync from server ───────────────────────────────────────────────
    // sheets: optional array like ['ACCOUNTS','VENDORS'] to fetch subset
    // force:  true → bypass TTL cache and re-sync
    // onProgress: optional callback called after each sheet completes
    async function sync({ sheets = null, force = false, onProgress = null } = {}) {
        // If already syncing (dedup concurrent calls)
        if (_syncing) return _syncing;

        // If cache is fresh and sheets already loaded, skip
        if (!force && (Date.now() - _syncedAt) < CACHE_TTL_MS) {
            const needSheets = sheets || [];
            const allLoaded = needSheets.length === 0 || needSheets.every(s => _cache[s] !== undefined);
            if (allLoaded) return _cache;
        }

        _syncing = _doSync(sheets, onProgress).finally(() => { _syncing = null; });
        return _syncing;
    }

    async function _doSync(sheets, onProgress) {
        const token = _getToken();
        if (!token) throw new Error('[VaultStream] No auth token — user not logged in');

        // Clear only the sheets we're re-fetching
        _clearSheets(sheets);

        const url  = '/api/accounting/sync/stream';
        const body = sheets ? JSON.stringify({ sheets }) : null;
        const init = {
            method: body ? 'POST' : 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/x-ndjson',
            }
        };
        if (body) {
            init.headers['Content-Type'] = 'application/json';
            init.body = body;
        }

        let response;
        try {
            response = await fetch(url, init);
        } catch (err) {
            throw new Error(`[VaultStream] Network error: ${err.message}`);
        }

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`[VaultStream] HTTP ${response.status}: ${text.slice(0, 200)}`);
        }

        // Consume the NDJSON stream
        if (response.body && typeof response.body.getReader === 'function') {
            await _consumeStream(response, onProgress);
        } else {
            // Fallback: full-text parse (older browsers / no ReadableStream)
            const text = await response.text();
            for (const line of text.split('\n')) {
                const t = line.trim();
                if (!t) continue;
                try { _handleObject(JSON.parse(t), onProgress); } catch { /* skip */ }
            }
            _syncedAt = Date.now();
        }

        return _cache;
    }

    // ── Public: get a sheet's records (after sync) ────────────────────────────
    // Returns [] if sheet not loaded yet.
    function get(sheet) {
        return _cache[sheet] || [];
    }

    // ── Public: check if a sheet is loaded ────────────────────────────────────
    function has(sheet) {
        return Array.isArray(_cache[sheet]);
    }

    // ── Public: get meta info ─────────────────────────────────────────────────
    function getMeta() {
        return { ..._meta };
    }

    // ── Public: invalidate cache (force re-sync on next load) ─────────────────
    function invalidate(sheets = null) {
        _clearSheets(sheets);
        _syncedAt = 0;
    }

    // ── Public: syncAndGet — convenience one-liner ────────────────────────────
    // Usage: const accounts = await VaultStream.syncAndGet('ACCOUNTS');
    async function syncAndGet(sheet, opts = {}) {
        await sync({ sheets: [sheet], ...opts });
        return get(sheet);
    }

    return { sync, get, has, getMeta, invalidate, syncAndGet };

})();
