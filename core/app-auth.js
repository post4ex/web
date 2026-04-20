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
// ─────────────────────────────────────────────────────────────────────────────

let lastActivity = Date.now();

function initHeartbeat() {
    const resetTimer = () => {
        const now = Date.now();
        if (now - lastActivity > CONSTANTS.ACTIVITY_THROTTLE) lastActivity = now;
    };

    ['mousemove', 'keydown', 'click', 'scroll'].forEach(e => window.addEventListener(e, resetTimer));

    setInterval(() => {
        const now = Date.now();
        if (now - lastActivity > CONSTANTS.IDLE_TIMEOUT) {
            handleLogout();
            return;
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
    window.location.href = 'login.html';
}

function checkLoginStatus() {
    const user       = getUser();
    const loggedIn   = isLoggedIn();
    const userRole   = loggedIn ? user.ROLE : 'GUEST';

    const show = (ids) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); });
    const hide = (ids) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });

    if (loggedIn) {
        hide(['login-button', 'login-button-mobile', 'main-nav-public']);
        show(['profile-section', 'profile-section-mobile', 'main-nav-private', 'sidebar-toggle-container', 'mobile-menu-toggle', 'notification-container-global', 'mobile-tools-section']);

        const excludedFields = [
            'token', 'expires', 'userdata', 'pass', 'password', 'reset_token',
            'status', 'message', 'success', 'filter_value', 'col_filter', 'logintime'
        ];

        const populateDetails = (container, isMobile = false) => {
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
                detailEl.innerHTML = isMobile
                    ? `<p class="text-xs text-white"><strong class="font-semibold text-gray-300">${displayKey}:</strong> <span>${value}</span></p>`
                    : `<p class="text-sm"><strong class="font-semibold text-gray-600">${displayKey}:</strong> <span class="text-gray-800">${value}</span></p>`;
                container.appendChild(detailEl);
            });
        };

        populateDetails(document.getElementById('profile-details-container'),        false);
        populateDetails(document.getElementById('mobile-profile-details-container'), true);
    } else {
        show(['login-button', 'login-button-mobile', 'main-nav-public']);
        hide(['profile-section', 'profile-section-mobile', 'main-nav-private', 'sidebar-toggle-container', 'notification-container-global', 'mobile-tools-section', 'mobile-menu-toggle']);
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
