// ============================================================================
// APP-AUTH.JS — Session, Heartbeat & RBAC
// ============================================================================

// ── Auth helpers ─────────────────────────────────────────────────────────────
// Single canonical way to read user data anywhere in the app.
// Never read localStorage directly — always use these.

window.getUser = function () {
    try {
        const d = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.LOGIN) || '{}');
        return d.userData || {};
    } catch { return {}; }
};

window.getSessionId = function () {
    try {
        const d = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.LOGIN) || '{}');
        return d.sessionId || '';
    } catch { return ''; }
};

window.isLoggedIn = function () {
    return !!getUser().ROLE;
};

window.getSessionExpiry = function () {
    try {
        const d = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.LOGIN) || '{}');
        return d.expires || 0;
    } catch { return 0; }
};

window.getActiveBranch = function () {
    try {
        const user = getUser();
        if (!user || !user.ROLE) return '';

        const roleLevels = (typeof ROLE_LEVELS !== 'undefined') ? ROLE_LEVELS : {
            CLIENT: 10, STAFF: 20, MANAGER: 40, ADMIN: 80, MASTER: 100
        };

        const userLevel = roleLevels[user.ROLE] || 0;
        const managerLevel = roleLevels['MANAGER'] || 40;

        // MANAGER or below (Staff, Manager, Client) always auto-select their single assigned branch
        if (userLevel <= managerLevel) {
            return (user.BRANCH || '').trim().toUpperCase();
        }

        // Above Manager (ADMIN, MASTER) can switch or use saved branch
        const selected = localStorage.getItem('active_selected_branch') || localStorage.getItem('vault_selected_branch') || user.BRANCH || '';
        return (selected || '').trim().toUpperCase();
    } catch {
        return '';
    }
};

window.setActiveBranch = function (branch) {
    if (!branch) return;
    const b = branch.trim().toUpperCase();
    localStorage.setItem('active_selected_branch', b);
    localStorage.setItem('vault_selected_branch', b);
    window.dispatchEvent(new CustomEvent('branchChanged', { detail: { branch: b } }));
};
// ─────────────────────────────────────────────────────────────────────────────

let lastActivity = Date.now();
let _isRefreshing = false;

async function silentRefreshSession() {
    if (_isRefreshing) return false;
    _isRefreshing = true;
    try {
        const raw = localStorage.getItem(CONSTANTS.KEYS.LOGIN);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data.refreshToken) return false;
        const res = await fetch('/api/refreshSession', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: data.refreshToken })
        });
        if (!res.ok) return false;
        const json = await res.json();
        if (json.status === 'success' && json.sessionId) {
            data.sessionId = json.sessionId;
            data.refreshToken = json.refreshToken || data.refreshToken;
            data.expires = Date.now() + ((json.expiresIn || 28800) * 1000);
            localStorage.setItem(CONSTANTS.KEYS.LOGIN, JSON.stringify(data));
            console.log('[Auth] Active session renewed silently in background');
            return true;
        }
    } catch (_) {
    } finally {
        _isRefreshing = false;
    }
    return false;
}
window.silentRefreshSession = silentRefreshSession;

function initHeartbeat() {
    const resetTimer = () => {
        const now = Date.now();
        if (now - lastActivity > CONSTANTS.ACTIVITY_THROTTLE) lastActivity = now;
    };

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(e => window.addEventListener(e, resetTimer));

    setInterval(async () => {
        const now = Date.now();
        // If inactive beyond idle timeout, log out
        if (now - lastActivity > CONSTANTS.IDLE_TIMEOUT) {
            handleLogout();
            return;
        }
        
        const expiry = getSessionExpiry();
        if (!expiry) return;

        // If user is actively working and token expires within 15 minutes, auto-renew silently
        if (now - lastActivity < CONSTANTS.IDLE_TIMEOUT && (expiry - now) < 15 * 60 * 1000 && (expiry - now) > 0) {
            const renewed = await silentRefreshSession();
            if (renewed) return;
        }

        // Only logout if token expired and could not be renewed
        if (expiry < now) {
            handleLogout();
        }
    }, CONSTANTS.PING_INTERVAL);
}

async function handleLogout() {
    callApi('/api/logout').catch(() => {});
    localStorage.removeItem(CONSTANTS.KEYS.LOGIN);
    sessionStorage.clear();
    if (window._sseWorker) {
        try { window._sseWorker.port.postMessage({ type: 'logout' }); } catch (_) {}
    }
    if (window.appDB) {
        await window.appDB.clearAll().catch(e => console.warn('Failed to clear IndexedDB:', e));
    }
    if (window.NavigationGuard) window.NavigationGuard.cleanBeforeNav();
    window.location.href = 'login.html';
}

function checkLoginStatus() {
    const user       = getUser();
    const loggedIn   = isLoggedIn();
    const userRole   = loggedIn ? user.ROLE : 'GUEST';

    const show = (ids) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); });
    const hide = (ids) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });

    if (loggedIn) {
        hide(['login-button', 'main-nav-public', 'container-desktop-public']);
        show(['main-nav-private', 'container-desktop-private', 'sidebar-toggle-container', 'notification-container-global', 'mobile-tools-section', 'desktop-logout-button', 'nav-search-private', 'nav-refresh-private']);

        const excludedFields = [
            'token', 'expires', 'userdata', 'pass', 'password', 'reset_token',
            'status', 'message', 'success', 'filter_value', 'col_filter', 'logintime'
        ];

        const populateDetails = (container) => {
            if (!container) return;
            container.innerHTML = '';
            // profile panel shows userData fields only — sessionId intentionally excluded
            const profileData = { ...user };
            Object.keys(profileData).sort().forEach(key => {
                if (excludedFields.includes(key.toLowerCase())) return;
                const value = profileData[key];
                if (value === null || value === undefined || value === '') return;

                const existingKeys = Array.from(container.children).map(el =>
                    el.textContent.split(':')[0].toLowerCase().replace(/\s+/g, '')
                );
                if (existingKeys.includes(key.toLowerCase().replace(/_/g, ''))) return;

                const displayKey = key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

                const detailEl = document.createElement('div');
                detailEl.innerHTML = `<p class="text-xs text-gray-700"><strong class="font-semibold text-gray-900">${displayKey}:</strong> <span>${value}</span></p>`;
                container.appendChild(detailEl);
            });
        };

        populateDetails(document.getElementById('profile-details-container'));
    } else {
        show(['login-button', 'main-nav-public', 'container-desktop-public']);
        hide(['main-nav-private', 'container-desktop-private', 'sidebar-toggle-container', 'notification-container-global', 'mobile-tools-section', 'desktop-logout-button', 'nav-search-private', 'nav-refresh-private']);
    }

    if (typeof updateHeaderBranding === 'function') {
        updateHeaderBranding();
    }

    setTimeout(() => {
        const copyright = document.getElementById('copyright-text');
        if (copyright) copyright.textContent = CONSTANTS.COPYRIGHT_TEXT;
    }, 500);

    const page    = window.location.pathname.split('/').pop();
    const reqRole = PAGE_CONFIG[page];
    if (reqRole) {
        const uLevel = ROLE_LEVELS[userRole] || 0;
        const rLevel = ROLE_LEVELS[reqRole]  || 0;
        if (uLevel < rLevel) window.location.href = loggedIn ? 'dashboard.html' : 'login.html';
    }
}
