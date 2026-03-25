// ============================================================================
// APP-AUTH.JS — Session, Heartbeat & RBAC
// ============================================================================

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
        callApi('/api/ping', {}, 'GET').catch(e => console.warn('[Session] Ping failed', e));
    }, CONSTANTS.PING_INTERVAL);
}

function handleLogout() {
    callApi('/api/logout').catch(() => {});
    localStorage.removeItem(CONSTANTS.KEYS.LOGIN);
    localStorage.removeItem(CONSTANTS.KEYS.NOTIFICATIONS);
    sessionStorage.clear();
    if (window.appDB) {
        window.appDB.clearAll().catch(e => console.warn('Failed to clear IndexedDB:', e));
    }
    window.location.href = 'login.html';
}

function checkLoginStatus() {
    const loginDataStr = localStorage.getItem(CONSTANTS.KEYS.LOGIN);
    let allData = {};
    if (loginDataStr) {
        try {
            const parsed = JSON.parse(loginDataStr);
            allData = { ...parsed, ...(parsed.userData || {}) };
        } catch (e) {}
    }

    const isLoggedIn = !!(allData.ROLE);
    const userRole   = isLoggedIn ? allData.ROLE : 'GUEST';

    const show = (ids) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); });
    const hide = (ids) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });

    if (isLoggedIn) {
        hide(['login-button', 'login-button-mobile', 'main-nav-public']);
        show(['profile-section', 'profile-section-mobile', 'main-nav-private', 'sidebar-toggle-container', 'manual-refresh-button', 'mobile-menu-toggle', 'notification-container-global', 'mobile-tools-section']);

        const excludedFields = [
            'token', 'expires', 'userdata', 'pass', 'password', 'reset_token',
            'status', 'message', 'success', 'filter_value', 'col_filter', 'logintime'
        ];

        const populateDetails = (container, isMobile = false) => {
            if (!container) return;
            container.innerHTML = '';
            Object.keys(allData).sort().forEach(key => {
                if (excludedFields.includes(key.toLowerCase())) return;
                const value = allData[key];
                if (value === null || value === undefined || value === '') return;

                const existingKeys = Array.from(container.children).map(el =>
                    el.textContent.split(':')[0].toLowerCase().replace(/\s+/g, '')
                );
                if (existingKeys.includes(key.toLowerCase().replace(/_/g, ''))) return;

                const displayKey = key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

                if (key.toLowerCase().includes('session')) {
                    const sessionId = `session-${isMobile ? 'mobile' : 'desktop'}`;
                    const detailEl  = document.createElement('div');
                    detailEl.innerHTML = isMobile
                        ? `<div class="flex items-center justify-between">
                               <p class="text-xs text-white flex-1"><strong class="font-semibold text-gray-300">${displayKey}:</strong> <span id="${sessionId}-value" class="font-mono">****</span></p>
                               <button id="${sessionId}-toggle" class="ml-2 px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors" data-visible="false" data-value="${value}">Show</button>
                           </div>`
                        : `<div class="flex items-center justify-between">
                               <p class="text-sm flex-1"><strong class="font-semibold text-gray-600">${displayKey}:</strong> <span id="${sessionId}-value" class="text-gray-800 font-mono">****</span></p>
                               <button id="${sessionId}-toggle" class="ml-2 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" data-visible="false" data-value="${value}">Show</button>
                           </div>`;
                    container.appendChild(detailEl);

                    setTimeout(() => {
                        const toggleBtn = document.getElementById(`${sessionId}-toggle`);
                        const valueSpan = document.getElementById(`${sessionId}-value`);
                        if (toggleBtn && valueSpan) {
                            toggleBtn.addEventListener('click', () => {
                                const isVisible   = toggleBtn.getAttribute('data-visible') === 'true';
                                const actualValue = toggleBtn.getAttribute('data-value');
                                valueSpan.textContent          = isVisible ? '****' : actualValue;
                                toggleBtn.textContent          = isVisible ? 'Show' : 'Hide';
                                toggleBtn.setAttribute('data-visible', String(!isVisible));
                            });
                        }
                    }, 100);
                } else {
                    const detailEl = document.createElement('div');
                    detailEl.innerHTML = isMobile
                        ? `<p class="text-xs text-white"><strong class="font-semibold text-gray-300">${displayKey}:</strong> <span>${value}</span></p>`
                        : `<p class="text-sm"><strong class="font-semibold text-gray-600">${displayKey}:</strong> <span class="text-gray-800">${value}</span></p>`;
                    container.appendChild(detailEl);
                }
            });
        };

        populateDetails(document.getElementById('profile-details-container'),        false);
        populateDetails(document.getElementById('mobile-profile-details-container'), true);
    } else {
        show(['login-button', 'login-button-mobile', 'main-nav-public']);
        hide(['profile-section', 'profile-section-mobile', 'main-nav-private', 'sidebar-toggle-container', 'manual-refresh-button', 'notification-container-global', 'mobile-tools-section', 'mobile-menu-toggle']);
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
        if (uLevel < rLevel) window.location.href = isLoggedIn ? 'dashboard.html' : 'login.html';
    }
}
