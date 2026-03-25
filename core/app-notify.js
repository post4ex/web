// ============================================================================
// APP-NOTIFY.JS — Notification System
// ============================================================================

function createNotificationModal() {
    if (document.getElementById('notification-modal')) return;

    document.body.insertAdjacentHTML('beforeend', `
    <div id="notification-modal" class="fixed inset-0 bg-black bg-opacity-50 z-[60] hidden flex items-center justify-center p-4 transition-opacity duration-300 opacity-0 pointer-events-none">
        <div class="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden transform scale-95 transition-transform duration-300">
            <div class="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 class="font-bold text-gray-800" id="notif-modal-title">System Notification</h3>
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

function openNotificationModal(message, type, timestamp) {
    const modal = document.getElementById('notification-modal');
    if (!modal) return;

    const iconMap  = { success: '✅', error: '⚠️', info: 'ℹ️' };
    const titleMap = { success: 'Success', error: 'Error Alert', info: 'Information' };

    document.getElementById('notif-modal-title').textContent   = titleMap[type] || 'Notification';
    document.getElementById('notif-modal-content').textContent = message;
    document.getElementById('notif-modal-icon').textContent    = iconMap[type]  || 'ℹ️';
    document.getElementById('notif-modal-time').textContent    = timestamp || fmtDate(new Date(), 'full');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
}

function renderNotificationItem(id, message, type, timestamp, showToast = false) {
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

    const icon       = type === 'error' ? '⚠️' : (type === 'success' ? '✅' : 'ℹ️');
    const colorClass = type === 'error' ? 'text-red-600' : (type === 'success' ? 'text-green-600' : 'text-gray-700');

    const item = document.createElement('div');
    item.className = `group p-3 border-b text-sm hover:bg-gray-50 flex items-start gap-3 transition-colors ${colorClass} relative`;
    item.setAttribute('data-id', id);

    const contentArea = document.createElement('div');
    contentArea.className = 'flex-1 cursor-pointer';
    contentArea.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <span class="text-base">${icon}</span>
            <span class="font-semibold text-xs opacity-75">${timestamp}</span>
        </div>
        <p class="leading-snug line-clamp-2 text-gray-800">${message}</p>`;
    contentArea.addEventListener('click', () => openNotificationModal(message, type, timestamp));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition opacity-0 group-hover:opacity-100';
    deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>`;
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeNotification(id, item, badgeGlobal);
    });

    item.appendChild(contentArea);
    item.appendChild(deleteBtn);
    listGlobal.prepend(item);
}

function removeNotification(id, element, badge) {
    if (element) element.remove();

    const stored  = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.NOTIFICATIONS) || '[]');
    const updated = stored.filter(n => n.id !== id);
    localStorage.setItem(CONSTANTS.KEYS.NOTIFICATIONS, JSON.stringify(updated));

    if (badge && parseInt(badge.innerText) > 0) {
        badge.innerText = updated.length;
        if (updated.length === 0) {
            badge.classList.add('hidden');
            const list = document.getElementById('notification-list-global');
            if (list) list.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No new notifications</p>';
        }
    }
}

function loadNotificationsFromStorage() {
    const stored      = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.NOTIFICATIONS) || '[]');
    const listGlobal  = document.getElementById('notification-list-global');
    const badgeGlobal = document.getElementById('notification-badge-global');

    if (!listGlobal) return;

    listGlobal.innerHTML = '';

    if (stored.length === 0) {
        listGlobal.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No new notifications</p>';
        if (badgeGlobal) badgeGlobal.classList.add('hidden');
        return;
    }

    stored.slice().reverse().forEach(n => renderNotificationItem(n.id, n.message, n.type, n.timestamp, false));

    if (badgeGlobal) {
        badgeGlobal.innerText = stored.length;
        badgeGlobal.classList.remove('hidden');
    }
}

window.showNotification = function (message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const id        = Date.now().toString();
    const notifObj  = { id, message, type, timestamp };

    const stored = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.NOTIFICATIONS) || '[]');
    stored.push(notifObj);
    if (stored.length > 20) stored.shift();
    localStorage.setItem(CONSTANTS.KEYS.NOTIFICATIONS, JSON.stringify(stored));

    renderNotificationItem(id, message, type, timestamp, true);
};
