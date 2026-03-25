// ============================================================================
// LAYOUT.JS — Dispatcher / Orchestrator
// ============================================================================

async function loadComponent(componentUrl, placeholderId) {
    try {
        const placeholder = document.getElementById(placeholderId);
        if (!placeholder) return;

        const isHeader = placeholderId === 'header-placeholder';
        placeholder.innerHTML = isHeader
            ? '<div class="animate-pulse bg-gray-200 h-14 w-full rounded"></div>'
            : '<div class="animate-pulse bg-gray-200 h-10 w-full rounded"></div>';
        placeholder.style.minHeight = isHeader ? '56px' : '36px';

        const response = await fetch(componentUrl, { cache: 'default' });
        if (!response.ok) throw new Error(`Failed to load ${componentUrl}`);

        const text = await response.text();
        const doc  = new DOMParser().parseFromString(text, 'text/html');

        Array.from(doc.querySelectorAll('script')).forEach(script => {
            const newScript = document.createElement('script');
            if (script.src) {
                newScript.src = script.src;
            } else {
                newScript.textContent = script.textContent;
            }
            document.head.appendChild(newScript);
            script.remove();
        });

        placeholder.innerHTML = '';
        while (doc.body.firstChild) {
            placeholder.appendChild(doc.body.firstChild);
        }
    } catch (error) {
        console.warn(`[Component Engine] Failed loading ${componentUrl}:`, error);
        const placeholder = document.getElementById(placeholderId);
        if (placeholder) {
            placeholder.innerHTML = `<div class="text-red-500 text-sm p-2">Failed to load ${componentUrl}</div>`;
        }
    }
}

async function loadDynamicContent(url, targetElementId) {
    const el = document.getElementById(targetElementId);
    if (!el) return;
    try {
        el.innerHTML = `<div class="text-center p-4 text-gray-500">Loading Content...</div>`;
        const cacheBuster = url.includes('?') ? '&' : '?';
        const res = await fetch(`${url}${cacheBuster}v=${Date.now()}`);
        if (!res.ok) throw new Error('Load failed');

        const txt = await res.text();
        const doc = new DOMParser().parseFromString(txt, 'text/html');
        const content = doc.querySelector('main .container');

        if (content) {
            el.innerHTML = content.innerHTML;
            content.querySelectorAll('script').forEach(s => {
                const ns = document.createElement('script');
                ns.textContent = s.textContent;
                document.body.appendChild(ns).remove();
            });
        }
    } catch (e) {
        el.innerHTML = `<div class="text-red-500 text-center">Content unavailable.</div>`;
    }
}

const setActiveNavOnLoad = () => {
    const path = window.location.pathname;
    let pageId = 'home';
    if      (path.includes('dashboard.html'))  pageId = 'home';
    else if (path.includes('Pincode.html'))    pageId = 'pincode';
    else if (path.includes('complaint.html'))  pageId = 'complaint';
    else if (path.includes('BookOrder.html'))  pageId = 'bookorder';
    else if (path.includes('tracking.html'))   pageId = 'tracking';
    else if (path.includes('Calculator.html')) pageId = 'calculator';
    else if (path.includes('ticket.html'))     pageId = 'ticket';
    else if (path.includes('task.html'))       pageId = 'task';
    else if (path.includes('wallet.html'))     pageId = 'wallet';
    else if (path.includes('search.html'))     pageId = 'search';

    setTimeout(() => {
        document.querySelectorAll('a[id^="nav-"], a[id^="dropdown-"]').forEach(link => {
            const linkPage = (link.id || '').split('-')[1];
            link.classList.remove('bg-gray-600', 'font-bold');
            if (!link.id.includes('search')) {
                link.classList.add('text-white');
                link.style.backgroundColor = '#9C2007';
            }
            if (linkPage === pageId) {
                link.style.backgroundColor = '';
                link.classList.remove('text-white');
                link.classList.add('bg-gray-600', 'font-bold');
            }
        });
    }, 150);
};

function initializeUI() {
    ['menuButton', 'profile-button'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            const menu = document.getElementById(id === 'menuButton' ? 'dropdownMenu' : 'profile-dropdown');
            btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && !btn.contains(e.target)) menu.classList.add('hidden');
            });
        }
    });

    const sb = document.getElementById('sidebar');
    const tg = document.getElementById('sidebar-toggle');
    const ov = document.getElementById('sidebar-overlay');
    if (sb && tg) {
        const toggleFn = () => { sb.classList.toggle('-translate-x-full'); ov.classList.toggle('hidden'); };
        tg.addEventListener('click', toggleFn);
        if (ov) ov.addEventListener('click', toggleFn);
    }

    const refBtn = document.getElementById('manual-refresh-button');
    if (refBtn) {
        refBtn.addEventListener('click', async () => {
            const spin = document.getElementById('refresh-icon-spinning');
            if (spin) spin.classList.remove('hidden');
            refBtn.disabled = true;
            await verifyAndFetchAppData(true);
            refBtn.disabled = false;
            if (spin) spin.classList.add('hidden');
        });
    }

    const setupClearAll = () => {
        const clearBtn = document.querySelector('#notification-dropdown button');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const list        = document.getElementById('notification-list-global');
                const badgeGlobal = document.getElementById('notification-badge-global');
                if (list)        list.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No new notifications</p>';
                if (badgeGlobal) { badgeGlobal.innerText = '0'; badgeGlobal.classList.add('hidden'); }
                localStorage.removeItem(CONSTANTS.KEYS.NOTIFICATIONS);
            });
        }
    };

    setupClearAll();
    window.addEventListener('footerLoaded', () => {
        setupClearAll();
        setTimeout(() => loadNotificationsFromStorage(), 100);
    });

    document.querySelectorAll('[id*="logout"]').forEach(b => b.addEventListener('click', handleLogout));
    scanAndFormatDates();

    window.checkAppData = async () => {
        if (!window.appDB) { console.warn('IndexedDB not available'); return null; }
        const data = await getAppData();
        console.group('APP DATA INSPECTOR (IndexedDB)');
        Object.keys(data).forEach(sheet => console.log(`${sheet}: ${Object.keys(data[sheet] || {}).length} records`));
        console.groupEnd();
        return data;
    };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {

    // Resolve API URL
    try {
        const res = await fetch('dev_url.json', { cache: 'no-store' });
        if (res.ok) {
            const { url } = await res.json();
            if (url) CONSTANTS.OPERATIONS_URL = url;
        }
    } catch (_) {}

    createNotificationModal();
    fetchClientIP();

    await loadComponent('header.html', 'header-placeholder');
    await loadComponent('footer.html', 'footer-placeholder');
    window.dispatchEvent(new CustomEvent('footerLoaded'));

    checkLoginStatus();
    setActiveNavOnLoad();
    initializeUI();

    // IndexedDB init in background
    if (!window.appDB) {
        await new Promise((resolve) => {
            let resolved = false;
            const timeout = setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 5000);
            window.addEventListener('indexedDBReady', () => {
                if (!resolved) { resolved = true; clearTimeout(timeout); resolve(); }
            }, { once: true });
            if (window.appDB && window.appDB.db) { resolved = true; clearTimeout(timeout); resolve(); }
        });
    }

    const loginData = localStorage.getItem(CONSTANTS.KEYS.LOGIN);
    if (loginData) {
        verifyAndFetchAppData();
        initHeartbeat();
        setInterval(() => verifyAndFetchAppData(false), CONSTANTS.SYNC_INTERVAL);
    }

    if (window.location.pathname.includes('main.html') || window.location.pathname.endsWith('/')) {
        loadDynamicContent('tracking.html', 'tracking-content-area');
        if (window.innerWidth >= 1024) {
            loadDynamicContent('services.html', 'services-content-area');
        } else {
            if (typeof window.loadMobileServicesSlideshow === 'function') window.loadMobileServicesSlideshow();
        }

        const trackingArea = document.getElementById('tracking-content-area');
        const servicesArea = document.getElementById('services-content-area');
        if (trackingArea && servicesArea) {
            const observer = new MutationObserver(() => {
                const resultsContainer = trackingArea.querySelector('#results-container');
                const searchButton     = trackingArea.querySelector('#tracking-search-button');
                if (resultsContainer && resultsContainer.innerHTML.trim() !== '' && !resultsContainer.classList.contains('hidden')) {
                    servicesArea.classList.add('hidden');
                }
                if (searchButton && !searchButton.hasAttribute('data-listener-added')) {
                    searchButton.addEventListener('click', () => { if (servicesArea) servicesArea.classList.remove('hidden'); });
                    searchButton.setAttribute('data-listener-added', 'true');
                }
            });
            observer.observe(trackingArea, { childList: true, subtree: true });
        }
    }
});
