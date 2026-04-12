// ============================================================================
// APP-NOTIFY.JS — Notification System (IndexedDB backed)
// ============================================================================

function createNotificationModal() {
    if (document.getElementById('notification-modal')) return;

    document.body.insertAdjacentHTML('beforeend', `
    <div id="notification-modal" class="fixed inset-0 bg-black bg-opacity-50 z-[60] hidden flex items-center justify-center p-4 transition-opacity duration-300 opacity-0 pointer-events-none">
        <div class="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden transform scale-95 transition-transform duration-300">
            <div class="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 class="font-bold text-gray-800" id="notif-modal-title">Notification</h3>
                <button id="notif-modal-close" class="text-gray-500 hover:text-red-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="p-6">
                <div id="notif-modal-icon" class="text-3xl mb-3">ℹ️</div>
                <p id="notif-modal-content" class="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap"></p>
                <div class="mt-4 text-xs text-gray-400 text-right font-mono" id="notif-modal-time"></div>
            </div>
            <div class="p-3 border-t bg-gray-50 flex justify-end">
                <button id="notif-modal-close-btn" class="px-4 py-2 bg-blue-900 text-white rounded hover:bg-blue-800 text-sm font-semibold transition-colors shadow">Close</button>
            </div>
        </div>
    </div>`);

    const modal = document.getElementById('notification-modal');
    const closeActions = () => {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    };
    document.getElementById('notif-modal-close').addEventListener('click', closeActions);
    document.getElementById('notif-modal-close-btn').addEventListener('click', closeActions);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeActions(); });
}

function openNotificationModal(message, level, timestamp) {
    const modal = document.getElementById('notification-modal');
    if (!modal) return;

    const iconMap  = { INFO: 'ℹ️', WARNING: '⚠️', ERROR: '❌', CRITICAL: '🚨', success: '✅', error: '⚠️', info: 'ℹ️' };
    const titleMap = { INFO: 'Information', WARNING: 'Warning', ERROR: 'Error', CRITICAL: 'Critical Alert', success: 'Success', error: 'Error', info: 'Information' };

    document.getElementById('notif-modal-title').textContent   = titleMap[level] || 'Notification';
    document.getElementById('notif-modal-content').textContent = message;
    document.getElementById('notif-modal-icon').textContent    = iconMap[level]  || 'ℹ️';
    document.getElementById('notif-modal-time').textContent    = timestamp || fmtDate(new Date(), 'full');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
}

function _levelColor(level) {
    if (level === 'ERROR' || level === 'error')    return 'text-red-600';
    if (level === 'CRITICAL')                       return 'text-red-800';
    if (level === 'WARNING' || level === 'warning') return 'text-yellow-600';
    if (level === 'success')                        return 'text-green-600';
    return 'text-gray-700';
}

function _levelIcon(level) {
    if (level === 'ERROR' || level === 'error')    return '❌';
    if (level === 'CRITICAL')                       return '🚨';
    if (level === 'WARNING' || level === 'warning') return '⚠️';
    if (level === 'success')                        return '✅';
    return 'ℹ️';
}

function renderNotificationItem(notif, showToast = false) {
    const { NOTIF_ID, MESSAGE, LEVEL, TIMESTAMP, IS_READ } = notif;
    const id         = NOTIF_ID || notif.id || Date.now().toString();
    const message    = MESSAGE  || notif.message || '';
    const level      = LEVEL    || notif.type    || 'INFO';
    const timestamp  = TIMESTAMP ? fmtDate(TIMESTAMP, 'full') : (notif.timestamp || '');
    const isCritical = level === 'CRITICAL';
    const isRead     = IS_READ === true;

    const badgeGlobal = document.getElementById('notification-badge-global');
    const listGlobal  = document.getElementById('notification-list-global');

    if (showToast && badgeGlobal) {
        let count = parseInt(badgeGlobal.innerText || '0') + 1;
        badgeGlobal.innerText = count;
        badgeGlobal.classList.remove('hidden');
    }

    if (!listGlobal) return;

    if (listGlobal.children.length === 1 && listGlobal.children[0].innerText.includes('No new notifications')) {
        listGlobal.innerHTML = '';
    }

    const item = document.createElement('div');
    item.className = `group p-3 border-b text-sm hover:bg-gray-50 flex items-start gap-3 transition-colors relative`;
    item.setAttribute('data-id', id);
    if (!isRead) item.style.background = '#fafafa';

    const contentArea = document.createElement('div');
    contentArea.className = 'flex-1 cursor-pointer min-w-0';
    contentArea.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <span class="text-base flex-shrink-0">${_levelIcon(level)}</span>
            <span class="font-semibold text-xs ${_levelColor(level)} truncate">${timestamp}</span>
            ${isCritical ? '<span class="text-xs bg-red-100 text-red-700 px-1 rounded flex-shrink-0">CRITICAL</span>' : ''}
            ${!isRead ? '<span class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 ml-auto"></span>' : ''}
        </div>
        <p class="leading-snug line-clamp-2 text-gray-700">${message}</p>`;
    contentArea.addEventListener('click', async () => {
        openNotificationModal(message, level, timestamp);
        if (!isRead) {
            await callApi('/api/notifread', { notif_ids: [id] }).catch(() => {});
            if (window.appDB) await window.appDB.mergeSheet('NOTIFICATIONS', { [id]: { ...notif, IS_READ: true } });
        }
    });

    const loginData  = JSON.parse(localStorage.getItem('loginData') || '{}');
    const userRole   = loginData?.userData?.ROLE || 'GUEST';
    const userLevel  = (window.ROLE_LEVELS || {})[userRole] || 0;
    const isAdmin    = userLevel >= ((window.ROLE_LEVELS || {})['ADMIN'] || 90);
    const canDismiss = !isCritical || isAdmin;
    const btnWrap    = document.createElement('div');
    btnWrap.className = 'flex flex-col gap-1 flex-shrink-0';

    if (!isRead) {
        const readBtn = document.createElement('button');
        readBtn.className = 'text-blue-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition';
        readBtn.title = 'Mark as read';
        readBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>`;
        readBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await callApi('/api/notifread', { notif_ids: [id] }).catch(() => {});
            if (window.appDB) await window.appDB.mergeSheet('NOTIFICATIONS', { [id]: { ...notif, IS_READ: true } });
            readBtn.remove();
            item.style.background = '';
            const dot = contentArea.querySelector('.bg-blue-500');
            if (dot) dot.remove();
            _updateBadge();
        });
        btnWrap.appendChild(readBtn);
    }

    if (canDismiss) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition';
        deleteBtn.title = 'Dismiss';
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>`;
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await callApi('/api/notifclear', { notif_ids: [id] }).catch(() => {});
            if (window.appDB) await window.appDB.deleteRecord('NOTIFICATIONS', id);
            item.remove();
            _updateBadge();
        });
        btnWrap.appendChild(deleteBtn);
    }

    item.appendChild(btnWrap);
    listGlobal.prepend(item);
}

function _updateBadge() {
    const listGlobal  = document.getElementById('notification-list-global');
    const badgeGlobal = document.getElementById('notification-badge-global');
    if (!listGlobal || !badgeGlobal) return;
    const count = listGlobal.children.length;
    if (count === 0) {
        listGlobal.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No new notifications</p>';
        badgeGlobal.classList.add('hidden');
    } else {
        badgeGlobal.innerText = count;
    }
}

async function loadNotificationsFromStorage() {
    const listGlobal  = document.getElementById('notification-list-global');
    const badgeGlobal = document.getElementById('notification-badge-global');
    if (!listGlobal) return;

    if (!window.appDB || !window.appDB.db) return;

    try {
        const all     = await window.appDB.getSheet('NOTIFICATIONS');
        const notifs  = Object.values(all).sort((a, b) => (b.TIMESTAMP || 0) - (a.TIMESTAMP || 0));

        if (!notifs.length) return;

        listGlobal.innerHTML = '';
        notifs.forEach(n => renderNotificationItem(n, false));

        const unread = notifs.filter(n => !n.IS_READ).length;
        if (badgeGlobal) {
            if (unread > 0) { badgeGlobal.innerText = unread; badgeGlobal.classList.remove('hidden'); }
            else badgeGlobal.classList.add('hidden');
        }
    } catch (e) {
        console.warn('[Notif] Failed to load from storage:', e);
    }
}

// showNotification — UI toast only, NOT saved to PB or IndexedDB, does NOT touch the bell
window.showNotification = function (message, type = 'info', duration = 3000) {
    const existing = document.getElementById('ui-toast');
    if (existing) existing.remove();

    const colors = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#2563eb' };
    const toast  = document.createElement('div');
    toast.id     = 'ui-toast';
    Object.assign(toast.style, {
        position:        'fixed',
        top:             '72px',
        right:           '16px',
        zIndex:          '99999',
        padding:         '10px 18px',
        borderRadius:    '8px',
        color:           '#fff',
        fontSize:        '14px',
        fontWeight:      '500',
        boxShadow:       '0 4px 12px rgba(0,0,0,0.25)',
        opacity:         '1',
        transition:      'opacity 0.3s',
        backgroundColor: colors[type] || '#374151',
        pointerEvents:   'none',
    });
    toast.textContent = message;
    const anchor = document.getElementById('header-placeholder') || document.body;
    anchor.insertAdjacentElement('afterend', toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, duration);
};
