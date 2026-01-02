/**
 * ============================================================================
 * LAYOUT.JS - PLATINUM NARRATIVE EDITION (FINAL CERTIFIED)
 * ============================================================================
 * * PRINCIPLE: "The Silent Guardian"
 * This script is the central nervous system of your application. It acts as
 * the bridge between the chaotic Frontend and the secure Google Apps Script
 * Backend. It manages Life, Data, Security, and Aesthetics.
 *
 * * ARCHITECTURAL PILLARS:
 * 1. COMPONENT ENGINE (UPGRADED): Injects HTML and waits for scripts to fully
 * load before allowing the UI to render. Eliminates race conditions.
 * 2. DATA ENGINE (THE COURIER): Uses a "Silent Delta Sync" protocol to fetch
 * only what has changed, merging it surgically into the local database.
 * 3. SECURITY CORE: Enforces Role-Based Access Control (RBAC), monitors
 * user heartbeat, and injects IP/User-Agent fingerprints into every call.
 * 4. VISUAL CORE: Automatically scans/formats dates and highlights active nav.
 * 5. DATA SCHEMA (THE MAP): Provides a precise map for extracting data from
 * complex, nested structures like Multibox or Uploads.
 * ============================================================================
 */

// --- GLOBAL UI HELPERS ---
/**
 * Injects the application favicon dynamically if not present.
 */
(function() {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        document.head.appendChild(link);
    }
    link.href = 'assets/images/laxmi-logo.png';
})();

// ============================================================================
// SECTION 1: GLOBAL CONFIGURATION & MAPS
// ============================================================================

const CONSTANTS = {
    // THE GATEWAY: The single URL for your Google Apps Script Backend.
    OPERATIONS_URL: 'https://script.google.com/macros/s/AKfycbxnNBUDarbTzKZuWmVHPObUZ1-jUoDFZy4d9YHkVohlVLtHPw0v28O3TazzvH6XFYYcYA/exec',
    
    // SYSTEM HEARTBEAT TIMERS
    SYNC_INTERVAL:      12 * 60 * 1000, // 12 Minutes: Refreshes business data.
    PING_INTERVAL:      5 * 60 * 1000,  // 5 Minutes: Tells server "I am here".
    IDLE_TIMEOUT:       30 * 60 * 1000, // 30 Minutes: Kills session if user sleeps.
    ACTIVITY_THROTTLE:  30 * 1000,      // 30 Seconds: Prevents event listener spam.
    
    // SECURITY CONFIGURATION
    ALLOWED_DOMAINS:    ["lcsrrk.github.io"],

    // STORAGE KEYS
    KEYS: {
        LOGIN:          'loginData',    // Credentials & Session ID.
        DATA:           'appData',      // The Offline Database.
        LAST_SYNC:      'lastSyncTime', // Timestamp of the last successful fetch.
        IP:             'clientIP',     // The user's public IP address.
        SESSION_ACTIVE: 'SESSION_ACTIVE', // Flag to detect tab crashes.
        NOTIFICATIONS:  'sys_notifications' // Persistent Notification History
    }
};

/**
 * DATE TRANSFORMATION CONFIGURATION (DATABASE LEVEL)
 */
const DATE_FIELDS = [
    'TIME_STAMP', 'REQ_TIME', 'IN_TIME', 'OUT_TIME', 'SCAN_TIME', 
    'DATE_TIME', 'ORDER_DATE', 'PICKUP_DATE', 'DELIVERY_DATE', 
    'INVOICE_DATE', 'TRANSIT_DATE', 'BOOKING_DATE', 'EDD',
    'ATTEN_DATE', 'DATE_BIRTH', 'DATE_JOIN', 'DATE_LEAVE'
];

/**
 * DATA SCHEMA MAP (THE SOURCE OF TRUTH)
 * Used by Search & Reporting tools to know exactly where lists are stored.
 * format: { "Display Name": ["Module", "Collection"] }
 */
const DATA_SCHEMA = {
    "All Orders":       ["SHIPMENTS", "ORDERS"],
    "Products":         ["SHIPMENTS", "PRODUCT"],
    "Multi-Box Items":  ["SHIPMENTS", "MULTIBOX"],
    "Uploaded Docs":    ["SHIPMENTS", "UPLOADS"],
    "Staff List":       ["HRM", "STAFF"],
    "Attendance Logs":  ["HRM", "ATTENDANCE"],
    "Branches":         ["HRM", "BRANCHES"],
    "B2B Clients":      ["CHANNEL", "B2B"],
    "Retail Clients":   ["CHANNEL", "B2B2C"],
    "Rate Cards":       ["CHANNEL", "RATES"],
    "Service Pincodes": ["NETWORK", "PINCODE"],
    "Transport Modes":  ["SERVICES", "MODE"],
    "Carriers":         ["SERVICES", "CARRIER"]
};
// Expose for global use (e.g. by search.html)
window.DATA_SCHEMA = DATA_SCHEMA;

/**
 * DATA INSTRUCTION MAP (THE DATABASE MANUAL)
 * This guide tells developers exactly where to find specific data within
 * the local 'appData' object. Always use these paths.
 * * * HOW TO USE:
 * const appData = JSON.parse(localStorage.getItem('appData'));
 * const orders = appData.SHIPMENTS.ORDERS;
 */
const DATA_INSTRUCTIONS = {
    // --- OPERATIONS & LOGISTICS ---
    ORDERS:     'appData.SHIPMENTS.ORDERS',   // Main Order Database
    PRODUCTS:   'appData.SHIPMENTS.PRODUCT',  // Product Catalog
    MULTIBOX:   'appData.SHIPMENTS.MULTIBOX', // Multi-piece shipments
    UPLOADS:    'appData.SHIPMENTS.UPLOADS',  // Uploaded Proofs/Docs
    
    // --- HUMAN RESOURCES ---
    STAFF:      'appData.HRM.STAFF',          // Employee Directory
    ATTENDANCE: 'appData.HRM.ATTENDANCE',     // Daily Logs
    BRANCHES:   'appData.HRM.BRANCHES',       // Office Locations
    
    // --- COMMERCIAL & CLIENTS ---
    CLIENTS:    'appData.CHANNEL.B2B',        // Corporate Clients
    RETAIL:     'appData.CHANNEL.B2B2C',      // Individual Customers
    RATES:      'appData.CHANNEL.RATES',      // Pricing Sheets
    
    // --- INFRASTRUCTURE ---
    PINCODES:   'appData.NETWORK.PINCODE',    // Serviceable Areas
    MODES:      'appData.SERVICES.MODE',      // Air, Surface, Train
    CARRIERS:   'appData.SERVICES.CARRIER',   // 3rd Party Logistics
    
    // --- FINANCE & CRM ---
    LEDGER:     'appData.LEDGER',             // Financial Records (Restricted)
    CRM:        'appData.CRM',                // Support Tickets
    LOGS:       'appData.LOGS.LOGS'           // System Audit Trail
};

/**
 * PAGE ACCESS CONFIGURATION
 * Defines which role is required to access a specific page.
 * If a page is not listed here, it is considered PUBLIC (or GUEST access).
 */
const PAGE_CONFIG = {
    // --- CLIENT ACCESS ---
    'dashboard.html':   'CLIENT', 
    'tracking.html':    'CLIENT', 
    'Calculator.html':  'CLIENT',
    'BookOrder.html':   'CLIENT', 
    'CreateOrder.html': 'CLIENT', 
    'PickupRequest.html':'CLIENT',
    'ticket.html':      'CLIENT', 
    'wallet.html':      'CLIENT', 
    'search.html':      'CLIENT',
    'task.html':        'CLIENT',

    // --- STAFF OPERATIONS ---
    'Shipments.html':   'STAFF', 
    'AssignCarrier.html':'STAFF',
    'EditOrder.html':   'STAFF',
    'OutMenifest.html': 'STAFF', 
    'InMenifest.html':  'STAFF',
    'RunSheet.html':    'STAFF', 
    'Update.html':      'STAFF', 
    'POD.html':         'STAFF',
    'uploader.html':    'STAFF', 
    'CRM.html':         'STAFF',

    // --- STAFF REPORTS ---
    'ReportBooking.html': 'STAFF',
    'ReportMenifest.html':'STAFF',
    'ReportUpdate.html':  'STAFF',
    'ReportRunsheet.html':'STAFF',
    'ReportCRM.html':     'STAFF',

    // --- ACCOUNTING ---
    'Billing.html':            'ACCOUNTANT', 
    'LedgerSummary.html':      'ACCOUNTANT', 
    'LedgerReports.html':      'ACCOUNTANT',
    'LedgerAccounts.html':     'ACCOUNTANT',
    'LedgerReceipts.html':     'ACCOUNTANT',
    'LedgerPayments.html':     'ACCOUNTANT',
    'LedgerExpenseClaims.html':'ACCOUNTANT',
    'LedgerCustomers.html':    'ACCOUNTANT',
    'LedgerSalesInvoices.html':'ACCOUNTANT',
    'LedgerCreditNotes.html':  'ACCOUNTANT',
    'LedgerDeliveryNotes.html':'ACCOUNTANT',
    'LedgerSuppliers.html':    'ACCOUNTANT',
    'LedgerPurchaseInvoices.html':'ACCOUNTANT',
    'LedgerDebitNotes.html':   'ACCOUNTANT',
    'LedgerEmployees.html':    'ACCOUNTANT',
    'LedgerJournalEntries.html':'ACCOUNTANT',

    // --- MASTER DATA ---
    'Masters.html':     'MASTER', 
    'PincodeMaster.html':'MASTER',
    'Branches.html':    'MASTER',
    'Mode.html':        'MASTER',
    'Carrier.html':     'MASTER',
    'Customer.html':    'MASTER',
    'Clients.html':     'MASTER',
    'Suppliers.html':   'MASTER',
    'Vendors.html':     'MASTER',
    'Staff.html':       'MASTER',
    'Stock.html':       'MASTER',

    // --- ADMIN ---
    'Agent.html':       'ADMIN'
};

const ROLE_LEVELS = {
    'MASTER':     100, 
    'ADMIN':      90,  
    'AUDITOR':    70,  
    'ACCOUNTANT': 60,  
    'MANAGER':    50,  
    'STAFF':      10,  
    'CLIENT':     1,   
    'GUEST':      0    
};
// Expose ROLE_LEVELS globally so header.html can use it safely
window.ROLE_LEVELS = ROLE_LEVELS;

// ============================================================================
// SECTION 2: THE COMPONENT ENGINE (UPGRADED)
// ============================================================================

async function loadComponent(componentUrl, placeholderId) {
    try {
        const response = await fetch(componentUrl);
        if (!response.ok) throw new Error(`Failed to load ${componentUrl}`);
        
        const text = await response.text();
        const placeholder = document.getElementById(placeholderId);
        if (!placeholder) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        
        const scripts = Array.from(doc.querySelectorAll('script'));
        const scriptLoadPromises = scripts.map(script => {
            return new Promise((resolve, reject) => {
                const newScript = document.createElement('script');
                Array.from(script.attributes).forEach(attr => 
                    newScript.setAttribute(attr.name, attr.value)
                );
                newScript.textContent = script.textContent;
                
                if (script.src) {
                    newScript.onload = resolve;
                    newScript.onerror = resolve; 
                } else {
                    resolve();
                }
                document.head.appendChild(newScript);
            });
        });

        await Promise.all(scriptLoadPromises);
        scripts.forEach(s => s.remove()); 
        while (doc.body.firstChild) {
            placeholder.appendChild(doc.body.firstChild);
        }

    } catch (error) {
        console.warn(`[Component Engine] Critical Failure loading ${componentUrl}:`, error);
    }
}

async function loadDynamicContent(url, targetElementId) {
    const el = document.getElementById(targetElementId);
    if (!el) return;
    try {
        el.innerHTML = `<div class="text-center p-4 text-gray-500">Loading Content...</div>`;
        // Add cache-busting timestamp to ensure fresh content
        const cacheBuster = url.includes('?') ? '&' : '?';
        const res = await fetch(`${url}${cacheBuster}v=${Date.now()}`);
        if(!res.ok) throw new Error("Load failed");
        
        const txt = await res.text();
        const doc = new DOMParser().parseFromString(txt, 'text/html');
        const content = doc.querySelector('main .container');
        
        if(content) {
            el.innerHTML = content.innerHTML;
            const scripts = content.querySelectorAll('script');
            scripts.forEach(s => {
                const ns = document.createElement('script');
                ns.textContent = s.textContent;
                document.body.appendChild(ns).remove();
            });
        }
    } catch(e) {
        el.innerHTML = `<div class="text-red-500 text-center">Content unavailable.</div>`;
    }
}

// ============================================================================
// SECTION 3: THE DATA ENGINE ("THE COURIER")
// ============================================================================

async function fetchClientIP() {
    if (sessionStorage.getItem(CONSTANTS.KEYS.IP)) return; 
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const json = await res.json();
        sessionStorage.setItem(CONSTANTS.KEYS.IP, json.ip);
    } catch (e) {
        sessionStorage.setItem(CONSTANTS.KEYS.IP, '0.0.0.0');
    }
}

async function callApi(action, params = {}) {
    const loginData = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.LOGIN) || '{}');
    const url = new URL(CONSTANTS.OPERATIONS_URL);
    
    // SECURITY UPGRADE: Use POST for everything to hide params from URL logs
    const clientIP = sessionStorage.getItem(CONSTANTS.KEYS.IP) || '0.0.0.0';
    
    // Prepare payload
    const payload = {
        action: action,
        sessionID: loginData.sessionId || '',
        ip: clientIP,
        userAgent: navigator.userAgent,
        ...params
    };

    // FIXED: Use URLSearchParams for POST body (application/x-www-form-urlencoded)
    // Ensures Google Apps Script correctly parses 'e.parameter'
    const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams(payload)
    });
    
    // ERROR HANDLING: Check if response is actually JSON
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[API] Critical Error - Expected JSON but got HTML/Text:", text.substring(0, 150));
        console.warn("[API] This usually means: 1. GAS 'Who has access' is not 'Anyone'. 2. The script crashed.");
        throw new Error("Invalid Server Response (Not JSON)");
    }

    const json = await res.json();
    
    if (json.status === 'error') {
        if (json.message.includes("Session expired")) {
            console.warn("[API] Session Expired. Logging out.");
            handleLogout();
        }
    }
    return json;
}

const istFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
});

function formatToIST(val) {
    if (!val) return val;
    if (typeof val === 'number' || (typeof val === 'string' && !val.includes('/'))) {
        const date = new Date(val);
        if (isNaN(date.getTime())) return val;
        return istFormatter.format(date).replace(',', '');
    }
    return val;
}

function applyDateFormatting(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const key in obj) {
        if (DATE_FIELDS.includes(key)) {
            obj[key] = formatToIST(obj[key]);
        } else if (typeof obj[key] === 'object') {
            applyDateFormatting(obj[key]);
        }
    }
}

function deepMerge(target, source) {
    for (const key in source) {
        if (source[key] instanceof Object && key in target) {
            Object.assign(source[key], deepMerge(target[key], source[key]));
        }
    }
    Object.assign(target || {}, source);
    return target;
}

async function verifyAndFetchAppData(force = false) {
    const loginData = localStorage.getItem(CONSTANTS.KEYS.LOGIN);
    if (!loginData) return;

    if (!force) {
        const lastSync = localStorage.getItem(CONSTANTS.KEYS.LAST_SYNC);
        if (lastSync && (Date.now() - parseInt(lastSync) < CONSTANTS.SYNC_INTERVAL)) return; 
    }

    const lastSyncTime = force ? '' : (localStorage.getItem(CONSTANTS.KEYS.LAST_SYNC) || '');
    console.log(`[Data Engine] Syncing... Delta Mode: ${!!lastSyncTime}, Force: ${force}`);
    
    showNotification("Connecting to Server...", "info");

    try {
        const result = await callApi('verifyAndFetchAppData', { lastSyncTime: lastSyncTime });

        if (result.status === 'success' || result.success) {
            let currentData = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.DATA) || '{}');
            const incomingData = result.updates || result.data;

            applyDateFormatting(incomingData);

            if (Object.keys(currentData).length === 0 || force || result.meta?.type === 'FULL') {
                currentData = incomingData; 
            } else {
                currentData = deepMerge(currentData, incomingData); 
            }

            try {
                localStorage.setItem(CONSTANTS.KEYS.DATA, JSON.stringify(currentData));
                localStorage.setItem(CONSTANTS.KEYS.LAST_SYNC, Date.now().toString());
            } catch (e) {
                showNotification("Storage Full! Clear Cache.", "error");
                console.error("LocalStorage Quota Exceeded");
                return;
            }

            const eventType = force ? 'appDataRefreshed' : 'appDataLoaded';
            window.dispatchEvent(new CustomEvent(eventType, { detail: { data: currentData } }));
            
            showNotification(`Data Synced (${result.meta?.type || 'DELTA'})`, "success");
            console.log("[Data Engine] Sync Complete.");
        } else {
             showNotification("Sync Error: " + (result.message || "Unknown"), "error");
        }
    } catch (error) {
        console.error("[Data Engine] Sync Error:", error);
        showNotification("Network Connection Failed", "error");
    }
}

// ============================================================================
// SECTION 4: SECURITY & HEARTBEAT
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
        callApi('ping').catch(e => console.warn("[Session] Ping failed", e));
    }, CONSTANTS.PING_INTERVAL);
}

function handleLogout() {
    callApi('logout').catch(() => {});
    localStorage.removeItem(CONSTANTS.KEYS.LOGIN);
    localStorage.removeItem(CONSTANTS.KEYS.DATA);
    localStorage.removeItem(CONSTANTS.KEYS.LAST_SYNC);
    localStorage.removeItem(CONSTANTS.KEYS.NOTIFICATIONS); // Clear notifications on logout
    sessionStorage.clear();
    window.location.href = 'login.html';
}

// ============================================================================
// SECTION 5: UI & INITIALIZATION
// ============================================================================

/**
 * VISUAL: ACTIVE NAV HIGHLIGHTER
 */
const setActiveNavOnLoad = () => {
    const path = window.location.pathname;
    let pageId = 'home';
    if (path.includes('dashboard.html')) pageId = 'home';
    else if (path.includes('Pincode.html')) pageId = 'pincode';
    else if (path.includes('complaint.html')) pageId = 'complaint';
    else if (path.includes('BookOrder.html')) pageId = 'bookorder';
    else if (path.includes('tracking.html')) pageId = 'tracking';
    else if (path.includes('Calculator.html')) pageId = 'calculator';
    else if (path.includes('ticket.html')) pageId = 'ticket';
    else if (path.includes('task.html')) pageId = 'task';
    else if (path.includes('wallet.html')) pageId = 'wallet';
    else if (path.includes('search.html')) pageId = 'search';
    
    setTimeout(() => {
        document.querySelectorAll('a[id^="nav-"], a[id^="dropdown-"]').forEach(link => {
            const linkId = link.id || '';
            const linkPage = linkId.split('-')[1]; 
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

// --- DYNAMIC NOTIFICATION MODAL ---
function createNotificationModal() {
    if (document.getElementById('notification-modal')) return;

    const modalHTML = `
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
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('notification-modal');
    const closeActions = () => {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    document.getElementById('notif-modal-close').addEventListener('click', closeActions);
    document.getElementById('notif-modal-close-btn').addEventListener('click', closeActions);
    modal.addEventListener('click', (e) => { if(e.target === modal) closeActions(); });
}

function openNotificationModal(message, type, timestamp) {
    const modal = document.getElementById('notification-modal');
    if (!modal) return;

    const iconMap = { 'success': '✅', 'error': '⚠️', 'info': 'ℹ️' };
    const titleMap = { 'success': 'Success', 'error': 'Error Alert', 'info': 'Information' };

    document.getElementById('notif-modal-title').textContent = titleMap[type] || 'Notification';
    document.getElementById('notif-modal-content').textContent = message;
    document.getElementById('notif-modal-icon').textContent = iconMap[type] || 'ℹ️';
    document.getElementById('notif-modal-time').textContent = timestamp || new Date().toLocaleString();

    modal.classList.remove('hidden');
    // Small delay to allow display block to render before opacity transition
    setTimeout(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
}

// --- NOTIFICATION LOGIC WITH PERSISTENCE ---

// 1. Core Render Function (Used by both Show & Load)
function renderNotificationItem(id, message, type, timestamp, showToast = false) {
    // UPDATED: Use the unified global ID
    const badgeGlobal = document.getElementById('notification-badge-global');
    const listGlobal = document.getElementById('notification-list-global');
    // REMOVED: mobileContainer and feed creation since we use global bell now.

    const updateBadge = (badge) => {
        if(badge) {
            // Recalculate based on current list length roughly, or simply increment
            let count = parseInt(badge.innerText || '0') + 1;
            badge.innerText = count;
            badge.classList.remove('hidden');
        }
    };

    // Update global badge
    if (showToast) {
        updateBadge(badgeGlobal);
    }

    const icon = type === 'error' ? '⚠️' : (type === 'success' ? '✅' : 'ℹ️');
    const colorClass = type === 'error' ? 'text-red-600' : (type === 'success' ? 'text-green-600' : 'text-gray-700');

    // UNIFIED DROPDOWN ITEM (Desktop & Mobile Dropdown)
    if(listGlobal) {
        if(listGlobal.children.length === 1 && listGlobal.children[0].innerText.includes('No new notifications')) {
            listGlobal.innerHTML = '';
        }
        
        const item = document.createElement('div');
        item.className = `group p-3 border-b text-sm hover:bg-gray-50 flex items-start gap-3 transition-colors ${colorClass} relative`;
        item.setAttribute('data-id', id);
        
        const contentArea = document.createElement('div');
        contentArea.className = "flex-1 cursor-pointer";
        contentArea.innerHTML = `
            <div class="flex items-center gap-2 mb-1">
                <span class="text-base">${icon}</span>
                <span class="font-semibold text-xs opacity-75">${timestamp}</span>
            </div>
            <p class="leading-snug line-clamp-2 text-gray-800">${message}</p>
        `;
        contentArea.addEventListener('click', () => openNotificationModal(message, type, timestamp));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = "text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition opacity-0 group-hover:opacity-100";
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>`;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeNotification(id, item, badgeGlobal);
        });

        item.appendChild(contentArea);
        item.appendChild(deleteBtn);
        listGlobal.prepend(item);
    }
}

// 2. Remove Helper
function removeNotification(id, element, badge) {
    // Visual removal
    if (element) element.remove();
    
    // Storage removal
    const stored = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.NOTIFICATIONS) || '[]');
    const updated = stored.filter(n => n.id !== id);
    localStorage.setItem(CONSTANTS.KEYS.NOTIFICATIONS, JSON.stringify(updated));

    // Badge update
    if (badge && parseInt(badge.innerText) > 0) {
        badge.innerText = updated.length;
        if (updated.length === 0) {
            badge.classList.add('hidden');
            const list = document.getElementById('notification-list-global');
            if(list) list.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No new notifications</p>';
        }
    }
}

// 3. Load from Storage (Runs on footerLoaded)
function loadNotificationsFromStorage() {
    const stored = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.NOTIFICATIONS) || '[]');
    // Iterate in reverse (oldest first) so when we prepend, newest ends up on top
    stored.slice().reverse().forEach(n => {
        renderNotificationItem(n.id, n.message, n.type, n.timestamp, false); // false = Don't show toast on load
    });
    
    // Update badges
    const badgeGlobal = document.getElementById('notification-badge-global');
    if (stored.length > 0) {
        if(badgeGlobal) { badgeGlobal.innerText = stored.length; badgeGlobal.classList.remove('hidden'); }
    }
}

// 4. Global Show Function
window.showNotification = function(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const id = Date.now().toString();
    
    const notifObj = { id, message, type, timestamp };
    
    // Save
    const stored = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.NOTIFICATIONS) || '[]');
    stored.push(notifObj);
    // Limit history to 20
    if (stored.length > 20) stored.shift();
    localStorage.setItem(CONSTANTS.KEYS.NOTIFICATIONS, JSON.stringify(stored));

    // Render
    renderNotificationItem(id, message, type, timestamp, true); // true = Show toast
};

function scanAndFormatDates() {
    const dateElements = document.querySelectorAll('.format-date');
    if (dateElements.length === 0) return;
    dateElements.forEach(el => {
        const rawValue = el.textContent.trim();
        if (rawValue && !isNaN(new Date(rawValue).getTime())) {
            el.textContent = formatToIST(rawValue);
        }
    });
}

function checkLoginStatus() {
    const loginDataStr = localStorage.getItem(CONSTANTS.KEYS.LOGIN);
    let allData = {};
    if(loginDataStr) { 
        try { 
            const parsed = JSON.parse(loginDataStr);
            allData = { ...parsed, ...(parsed.userData || {}) };
        } catch(e){} 
    }

    const isLoggedIn = !!(allData.ROLE);
    const userRole = isLoggedIn ? allData.ROLE : 'GUEST';

    const show = (ids) => ids.forEach(id => { const el = document.getElementById(id); if(el) el.classList.remove('hidden'); });
    const hide = (ids) => ids.forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });

    if (isLoggedIn) {
        hide(['login-button', 'login-button-mobile', 'main-nav-public']);
        show(['profile-section', 'profile-section-mobile', 'main-nav-private', 'sidebar-toggle-container', 'manual-refresh-button']);
        // Unhide the unified notification container
        show(['notification-container-global', 'mobile-tools-section']);

        const excludedFields = [
            'sessionid', 'session_id', 'token', 'expires', 'userdata', 
            'pass', 'password', 'reset_token', 'code', 
            'status', 'message', 'success', 
            'filter_value', 'col_filter'
        ];
        
        const populateDetails = (container, isMobile = false) => {
            if (container) {
                container.innerHTML = ''; 
                Object.keys(allData).sort().forEach(key => {
                    if (excludedFields.includes(key.toLowerCase())) return;
                    const value = allData[key];
                    if (value === null || value === undefined || value === '') return;
                    const displayKey = key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                    const detailEl = document.createElement('div');
                    if (isMobile) {
                        detailEl.innerHTML = `<p class="text-xs text-white"><strong class="font-semibold text-gray-300">${displayKey}:</strong> <span>${value}</span></p>`;
                    } else {
                        detailEl.innerHTML = `<p class="text-sm"><strong class="font-semibold text-gray-600">${displayKey}:</strong> <span class="text-gray-800">${value}</span></p>`;
                    }
                    container.appendChild(detailEl);
                });
            }
        };
        populateDetails(document.getElementById('profile-details-container'), false);
        populateDetails(document.getElementById('mobile-profile-details-container'), true);
        const copyright = document.getElementById('copyright-text');
        if (copyright) copyright.innerHTML = 'Designed & Hardcoded by Arun Tomar.';
    } else {
        show(['login-button', 'login-button-mobile', 'main-nav-public']);
        // Hide the notification container on logout
        hide(['profile-section', 'profile-section-mobile', 'main-nav-private', 'sidebar-toggle-container', 'manual-refresh-button', 'notification-container-global', 'mobile-tools-section']);
    }

    const page = window.location.pathname.split('/').pop();
    const reqRole = PAGE_CONFIG[page];
    if (reqRole) {
        const uLevel = ROLE_LEVELS[userRole] || 0;
        const rLevel = ROLE_LEVELS[reqRole] || 0;
        if (uLevel < rLevel) window.location.href = isLoggedIn ? 'dashboard.html' : 'login.html';
    }
}

function initializeUI() {
    ['menuButton', 'profile-button'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn) {
            const menu = document.getElementById(id === 'menuButton' ? 'dropdownMenu' : 'profile-dropdown');
            btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
            document.addEventListener('click', (e) => { if(!menu.contains(e.target) && !btn.contains(e.target)) menu.classList.add('hidden'); });
        }
    });

    const sb = document.getElementById('sidebar');
    const tg = document.getElementById('sidebar-toggle');
    const ov = document.getElementById('sidebar-overlay');
    if(sb && tg) {
        const toggleFn = () => { sb.classList.toggle('-translate-x-full'); ov.classList.toggle('hidden'); };
        tg.addEventListener('click', toggleFn);
        if(ov) ov.addEventListener('click', toggleFn);
    }

    const refBtn = document.getElementById('manual-refresh-button');
    if(refBtn) {
        refBtn.addEventListener('click', async () => {
            const spin = document.getElementById('refresh-icon-spinning');
            if(spin) spin.classList.remove('hidden'); 
            refBtn.disabled = true; 
            await verifyAndFetchAppData(true); 
            refBtn.disabled = false; 
            if(spin) spin.classList.add('hidden'); 
        });
    }

    // --- MARK ALL READ LOGIC ---
    const setupClearAll = () => {
        const clearBtn = document.querySelector('#notification-dropdown button');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const list = document.getElementById('notification-list-global');
                const badgeGlobal = document.getElementById('notification-badge-global');
                // Removed mobileFeed reference

                if (list) list.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No new notifications</p>';
                if (badgeGlobal) { badgeGlobal.innerText = '0'; badgeGlobal.classList.add('hidden'); }
                
                // Clear Storage
                localStorage.removeItem(CONSTANTS.KEYS.NOTIFICATIONS);
            });
        }
    };
    
    // Initial Setup
    setupClearAll();
    // Re-run on footerLoaded (because header injection happens then)
    window.addEventListener('footerLoaded', () => {
        setupClearAll();
        loadNotificationsFromStorage(); // Load history when UI is ready
    });

    document.querySelectorAll('[id*="logout"]').forEach(b => b.addEventListener('click', handleLogout));
    scanAndFormatDates();

    window.checkAppData = () => {
        const data = JSON.parse(localStorage.getItem(CONSTANTS.KEYS.DATA) || '{}');
        console.group("APP DATA INSPECTOR");
        console.table(Object.keys(data).map(k => ({ Module: k, Records: Object.keys(data[k]).length })));
        console.groupEnd();
        return data;
    };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    
    // Inject the Modal HTML immediately
    createNotificationModal();

    fetchClientIP();
    
    if (localStorage.getItem(CONSTANTS.KEYS.DATA)) {
        console.log("%c[SYSTEM] Data is Loaded & Ready", "color: green; font-weight: bold;");
    } else {
        console.log("%c[SYSTEM] No Data Found - Waiting for Sync", "color: orange; font-weight: bold;");
    }

    checkLoginStatus();

    await Promise.all([
        loadComponent('header.html', 'header-placeholder'),
        loadComponent('footer.html', 'footer-placeholder')
    ]);

    window.dispatchEvent(new CustomEvent('footerLoaded'));
    
    // RE-RUN CHECK AFTER HEADER INJECTION
    checkLoginStatus(); 
    
    // RESTORED: HIGHLIGHT ACTIVE NAV
    setActiveNavOnLoad();

    initializeUI();
    
    const loginData = localStorage.getItem(CONSTANTS.KEYS.LOGIN);
    if (loginData) {
        verifyAndFetchAppData(); 
        initHeartbeat(); 
        setInterval(() => verifyAndFetchAppData(false), CONSTANTS.SYNC_INTERVAL); 
    }

    if (window.location.pathname.includes('main.html') || window.location.pathname.endsWith('/')) {
        loadDynamicContent('tracking.html', 'tracking-content-area');
        loadDynamicContent('services.html', 'services-content-area');

        const trackingArea = document.getElementById('tracking-content-area');
        const servicesArea = document.getElementById('services-content-area');
        if (trackingArea && servicesArea) {
            const observer = new MutationObserver(() => {
                const resultsContainer = trackingArea.querySelector('#results-container');
                const searchButton = trackingArea.querySelector('#tracking-search-button');
                
                if (resultsContainer && resultsContainer.innerHTML.trim() !== '' && !resultsContainer.classList.contains('hidden')) {
                    servicesArea.classList.add('hidden');
                }
                
                if (searchButton && !searchButton.hasAttribute('data-listener-added')) {
                    searchButton.addEventListener('click', () => { 
                        if (servicesArea) servicesArea.classList.remove('hidden'); 
                    });
                    searchButton.setAttribute('data-listener-added', 'true');
                }
            });
            observer.observe(trackingArea, { childList: true, subtree: true });
        }
    }
});
