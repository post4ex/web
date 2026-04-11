// ============================================================================
// APP-CONFIG.JS — Global Configuration & Maps
// ============================================================================

(function () {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        document.head.appendChild(link);
    }
    link.href = 'assets/images/favicon.svg';
})();

(function () {
    const updateTitle = () => {
        if (window.CONSTANTS && window.CONSTANTS.APP_NAME) {
            const titleEl = document.querySelector('title');
            if (titleEl) {
                const currentTitle = titleEl.textContent.trim();
                if (!currentTitle.includes(window.CONSTANTS.APP_NAME)) {
                    titleEl.textContent = `${currentTitle} - ${window.CONSTANTS.APP_NAME}`;
                }
            }
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateTitle);
    } else {
        updateTitle();
    }
})();

const CONSTANTS = {
    APP_NAME:       'Post4Ex',
    SUPPORT_EMAIL:  'post4ex@gmail.com',
    COMPANY_NAME:   'Post4Ex',
    COPYRIGHT_YEAR: '2025',
    APP_THEME:      'maroon',

    get COPYRIGHT_TEXT() {
        return `© ${this.COPYRIGHT_YEAR} ${this.COMPANY_NAME}. All rights reserved.`;
    },

    THEMES: {
        maroon: { primary: '#9C2007', primaryHover: '#8C1C06', primaryLight: '#FEF2F2', name: 'Maroon' },
        blue:   { primary: '#1e3a8a', primaryHover: '#1e40af', primaryLight: '#eff6ff',  name: 'Blue'   }
    },
    DEFAULT_THEME: 'maroon',

    OPERATIONS_URL: '__API_URL__',

    SYNC_INTERVAL:     5 * 60 * 1000,
    PING_INTERVAL:      2 * 60 * 1000,
    IDLE_TIMEOUT:       2 * 60 * 60 * 1000,
    ACTIVITY_THROTTLE: 30 * 1000,
    SSE_RECONNECT_DELAY: 3000,

    ALLOWED_DOMAINS: ['post4ex.github.io'],

    KEYS: {
        LOGIN:          'loginData',
        DATA:           'appData',
        LAST_SYNC:      'lastSyncTime',
        IP:             'clientIP',
        SESSION_ACTIVE: 'SESSION_ACTIVE',
        NOTIFICATIONS:  'sys_notifications'
    }
};
window.CONSTANTS = CONSTANTS;

const ROLE_LEVELS = {
    'MASTER':     100,
    'ADMIN':       90,
    'AUDITOR':     70,
    'ACCOUNTANT':  60,
    'MANAGER':     50,
    'STAFF':       10,
    'CLIENT':       1,
    'GUEST':        0
};
window.ROLE_LEVELS = ROLE_LEVELS;

const PAGE_CONFIG = {
    'dashboard.html':    'CLIENT',
    'tracking.html':     'CLIENT',
    'Calculator.html':   'CLIENT',
    'PickupRequest.html':'CLIENT',

    'ticket.html':       'CLIENT',
    'wallet.html':       'CLIENT',
    'search.html':       'CLIENT',
    'task.html':         'CLIENT',

    'Shipments.html':    'CLIENT',
    'AssignCarrier.html':'STAFF',
    'OutMenifest.html':  'CLIENT',
    'InMenifest.html':   'CLIENT',
    'RunSheet.html':     'CLIENT',
    'Update.html':       'CLIENT',
    'POD.html':          'CLIENT',
    'uploader.html':     'CLIENT',
    'CRM.html':          'CLIENT',

    'ReportBooking.html':  'CLIENT',
    'ReportMenifest.html': 'CLIENT',
    'ReportUpdate.html':   'CLIENT',
    'ReportRunsheet.html': 'CLIENT',
    'ReportCRM.html':      'CLIENT',

    'Billing.html':               'ACCOUNTANT',
    'LedgerSummary.html':         'ACCOUNTANT',
    'LedgerReports.html':         'ACCOUNTANT',
    'LedgerAccounts.html':        'ACCOUNTANT',
    'LedgerReceipts.html':        'ACCOUNTANT',
    'LedgerPayments.html':        'ACCOUNTANT',
    'LedgerExpenseClaims.html':   'ACCOUNTANT',
    'LedgerCustomers.html':       'ACCOUNTANT',
    'LedgerSalesInvoices.html':   'ACCOUNTANT',
    'LedgerCreditNotes.html':     'ACCOUNTANT',
    'LedgerDeliveryNotes.html':   'ACCOUNTANT',
    'LedgerSuppliers.html':       'ACCOUNTANT',
    'LedgerPurchaseInvoices.html':'ACCOUNTANT',
    'LedgerDebitNotes.html':      'ACCOUNTANT',
    'LedgerEmployees.html':       'ACCOUNTANT',
    'LedgerJournalEntries.html':  'ACCOUNTANT',

    'Masters.html':      'MASTER',
    'PincodeMaster.html':'MASTER',
    'Branches.html':     'MASTER',
    'Mode.html':         'MASTER',
    'Carrier.html':      'MASTER',
    'B2B.html':          'MASTER',
    'B2B2C.html':        'MASTER',
    'Staff.html':        'MASTER',
    'Stock.html':        'MASTER',
};

const DATA_SCHEMA = {
    'All Orders':      'ORDERS',
    'Multi-Box Items': 'MULTIBOX',
    'Uploaded Docs':   'UPLOADS',
    'Products':        'PRODUCTS',
    'Staff List':      'STAFF',
    'Attendance Logs': 'ATTENDANCE',
    'Branches':        'BRANCHES',
    'B2B Clients':     'B2B',
    'Retail Clients':  'B2B2C',
    'Rate Cards':      'RATES',
    'Transport Modes': 'MODES',
    'Carriers':        'CARRIERS'
};
window.DATA_SCHEMA = DATA_SCHEMA;

const DATA_INSTRUCTIONS = {
    ORDERS:     'getAppData("ORDERS")',
    MULTIBOX:   'getAppData("MULTIBOX")',
    UPLOADS:    'getAppData("UPLOADS")',
    PRODUCTS:   'getAppData("PRODUCTS")',
    STAFF:      'getAppData("STAFF")',
    ATTENDANCE: 'getAppData("ATTENDANCE")',
    BRANCHES:   'getAppData("BRANCHES")',
    CLIENTS:    'getAppData("B2B")',
    RETAIL:     'getAppData("B2B2C")',
    RATES:      'getAppData("RATES")',
    MODES:      'getAppData("MODES")',
    CARRIERS:   'getAppData("CARRIERS")',
};

const DATE_FIELDS = [
    'TIME_STAMP', 'REQ_TIME', 'IN_TIME', 'OUT_TIME', 'SCAN_TIME',
    'DATE_TIME', 'ORDER_DATE', 'PICKUP_DATE', 'DELIVERY_DATE',
    'INVOICE_DATE', 'TRANSIT_DATE', 'BOOKING_DATE', 'EDD',
    'ATTEN_DATE', 'DATE_BIRTH', 'DATE_JOIN', 'DATE_LEAVE'
];

(function () {
    window.setTheme = function (themeName) {
        const theme = window.CONSTANTS.THEMES[themeName];
        if (!theme) return;
        document.documentElement.style.setProperty('--theme-primary',       theme.primary);
        document.documentElement.style.setProperty('--theme-primary-hover', theme.primaryHover);
        document.documentElement.style.setProperty('--theme-primary-light', theme.primaryLight);

        document.querySelectorAll('[style*="#9C2007"]').forEach(el => {
            if (el.style.backgroundColor) el.style.backgroundColor = theme.primary;
            if (el.style.color)           el.style.color           = theme.primary;
        });
        document.querySelectorAll('[style*="#8C1C06"]').forEach(el => {
            const oh = el.getAttribute('onmouseover');
            const oo = el.getAttribute('onmouseout');
            if (oh) el.setAttribute('onmouseover', oh.replace(/#8C1C06/g, theme.primaryHover).replace(/#9C2007/g, theme.primary));
            if (oo) el.setAttribute('onmouseout',  oo.replace(/#9C2007/g, theme.primary).replace(/#8C1C06/g, theme.primaryHover));
        });
        document.querySelectorAll('[style*="#FEF2F2"]').forEach(el => {
            const oh = el.getAttribute('onmouseover');
            const oo = el.getAttribute('onmouseout');
            if (oh) el.setAttribute('onmouseover', oh.replace(/#FEF2F2/g, theme.primaryLight));
            if (oo) el.setAttribute('onmouseout',  oo.replace(/#FEF2F2/g, theme.primaryLight));
        });
    };

    const appTheme = CONSTANTS.APP_THEME || CONSTANTS.DEFAULT_THEME;
    const theme    = CONSTANTS.THEMES[appTheme];
    document.documentElement.style.setProperty('--theme-primary',       theme.primary);
    document.documentElement.style.setProperty('--theme-primary-hover', theme.primaryHover);
    document.documentElement.style.setProperty('--theme-primary-light', theme.primaryLight);

    window.addEventListener('footerLoaded', () => window.setTheme(appTheme));
})();
