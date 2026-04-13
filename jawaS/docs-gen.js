/**
 * docs-gen.js
 * The "Brain" of the Document Center.
 * Handles form schemas, validation logic, and dynamic rendering for docs.html.
 */

// ============================================================================
// DOCUMENT SEARCH MAPPING
// ============================================================================
const DOCUMENT_SEARCH_MAP = {
    'COM_INV': {
        keywords: ['commercial', 'invoice', 'export', 'customs', 'value', 'goods', 'payment', 'buyer', 'seller', 'price', 'amount', 'currency', 'incoterms'],
        why: 'Required for customs clearance and payment collection',
        when: 'For all export shipments to declare commercial value',
        usage: 'Export customs clearance, payment terms, goods valuation'
    },
    'PKL': {
        keywords: ['packing', 'list', 'contents', 'weight', 'dimensions', 'cartons', 'packages', 'shipping', 'freight', 'cargo'],
        why: 'Details package contents and weights for shipping',
        when: 'For all shipments to specify packaging details',
        usage: 'Freight booking, customs inspection, cargo handling'
    },
    'KYC': {
        keywords: ['kyc', 'customer', 'verification', 'identity', 'compliance', 'aml', 'due diligence', 'background'],
        why: 'Customer identity verification and compliance',
        when: 'For new customers or high-value transactions',
        usage: 'Customer onboarding, compliance verification, risk assessment'
    },
    'SLI': {
        keywords: ['shipper', 'instructions', 'freight', 'forwarder', 'booking', 'transport', 'logistics', 'carrier'],
        why: 'Instructions to freight forwarder for shipment handling',
        when: 'When booking freight services',
        usage: 'Freight booking, transport arrangements, logistics coordination'
    },
    'BL_AWB': {
        keywords: ['bill', 'lading', 'awb', 'airway', 'transport', 'receipt', 'cargo', 'carrier', 'consignment'],
        why: 'Transport document and receipt of goods',
        when: 'For sea freight (BL) or air freight (AWB)',
        usage: 'Proof of shipment, cargo receipt, transport contract'
    },
    'INS_CERT': {
        keywords: ['insurance', 'certificate', 'coverage', 'marine', 'cargo', 'protection', 'risk', 'claim'],
        why: 'Cargo insurance coverage certificate',
        when: 'When cargo insurance is required or requested',
        usage: 'Insurance claims, risk coverage, buyer assurance'
    },
    'LOA': {
        keywords: ['letter', 'authority', 'authorization', 'cha', 'customs', 'agent', 'clearance', 'power'],
        why: 'Authorizes customs house agent for clearance',
        when: 'When appointing CHA for customs clearance',
        usage: 'Customs clearance authorization, agent appointment'
    },
    'COO': {
        keywords: ['certificate', 'origin', 'country', 'manufacture', 'preferential', 'duty', 'trade', 'agreement'],
        why: 'Certifies country of origin for preferential duty',
        when: 'For preferential trade agreements or buyer requirement',
        usage: 'Duty reduction, trade preferences, origin verification'
    },
    'NON_DG': {
        keywords: ['non', 'dangerous', 'goods', 'declaration', 'air', 'freight', 'safety', 'hazardous', 'iata'],
        why: 'Declares goods are not dangerous for air transport',
        when: 'For all air freight shipments',
        usage: 'Air freight safety, IATA compliance, cargo acceptance'
    },
    'TAX_CHALLAN': {
        keywords: ['tax', 'invoice', 'challan', 'gst', 'domestic', 'supply', 'billing', 'vat'],
        why: 'GST compliant domestic tax invoice',
        when: 'For domestic supplies within India',
        usage: 'GST compliance, domestic billing, tax documentation'
    },
    'DELIVERY_CHALLAN': {
        keywords: ['delivery', 'challan', 'dispatch', 'goods', 'transport', 'domestic', 'receipt'],
        why: 'Goods dispatch document for domestic delivery',
        when: 'For domestic goods movement without sale',
        usage: 'Goods dispatch, domestic transport, delivery proof'
    },
    'ANN_D': {
        keywords: ['annexure', 'depb', 'duty', 'entitlement', 'pass', 'book', 'export', 'incentive'],
        why: 'DEPB duty entitlement pass book declaration',
        when: 'When claiming DEPB export incentives',
        usage: 'Export incentives, duty benefits, DEPB claims'
    },
    'ARE1': {
        keywords: ['are1', 'excise', 'rebate', 'duty', 'refund', 'export', 'incentive'],
        why: 'Excise duty rebate claim form',
        when: 'When claiming excise duty rebate on exports',
        usage: 'Duty rebate, export incentives, excise refund'
    },
    'SDF': {
        keywords: ['sdf', 'rbi', 'foreign', 'exchange', 'declaration', 'forex', 'export', 'proceeds'],
        why: 'RBI foreign exchange declaration form',
        when: 'For export proceeds realization',
        usage: 'Forex compliance, RBI reporting, export proceeds'
    },
    'ANN_1': {
        keywords: ['annexure', 'drawback', 'garments', 'textile', 'duty', 'refund', 'export'],
        why: 'Drawback claim for garment exports',
        when: 'When claiming drawback on garment exports',
        usage: 'Duty drawback, garment exports, duty refund'
    },
    'ANN_2': {
        keywords: ['annexure', 'drawback', 'manufacturer', 'duty', 'refund', 'export', 'production'],
        why: 'Drawback claim for manufacturer exports',
        when: 'When claiming drawback as manufacturer',
        usage: 'Duty drawback, manufacturing exports, duty refund'
    },
    'APP_3': {
        keywords: ['appendix', 'drawback', 'declaration', 'duty', 'refund', 'export'],
        why: 'Drawback declaration form',
        when: 'When claiming duty drawback on exports',
        usage: 'Duty drawback, export incentives, duty refund'
    },
    'APP_4': {
        keywords: ['appendix', 'drawback', 'cenvat', 'duty', 'refund', 'export'],
        why: 'CENVAT drawback declaration',
        when: 'When claiming CENVAT drawback',
        usage: 'CENVAT drawback, duty refund, export incentives'
    },
    'APP_2': {
        keywords: ['appendix', 'deec', 'duty', 'exemption', 'entitlement', 'certificate'],
        why: 'DEEC duty exemption declaration',
        when: 'When using DEEC for duty exemption',
        usage: 'Duty exemption, DEEC benefits, import duty savings'
    },
    'ANN_C1': {
        keywords: ['annexure', 'eou', 'export', 'oriented', 'unit', 'certificate'],
        why: 'EOU export certificate',
        when: 'For EOU unit exports',
        usage: 'EOU compliance, export obligations, unit certification'
    },
    'SCD': {
        keywords: ['single', 'country', 'declaration', 'origin', 'textile', 'quota'],
        why: 'Single country origin declaration for textiles',
        when: 'For textile exports to quota countries',
        usage: 'Textile quota, origin declaration, trade compliance'
    },
    'MCD': {
        keywords: ['multiple', 'country', 'declaration', 'origin', 'textile', 'manufacturing'],
        why: 'Multiple country declaration for textile manufacturing',
        when: 'For textiles with multi-country processing',
        usage: 'Complex textile supply chain, multi-origin goods'
    },
    'NEG_DEC': {
        keywords: ['negative', 'declaration', 'silk', 'usa', 'america', 'textile'],
        why: 'Negative declaration for silk products to USA',
        when: 'For silk exports to United States',
        usage: 'US silk imports, negative declaration, trade compliance'
    },
    'QUOTA': {
        keywords: ['quota', 'charge', 'statement', 'textile', 'allocation', 'fee'],
        why: 'Textile quota charge statement',
        when: 'When paying textile quota charges',
        usage: 'Quota management, textile exports, charge documentation'
    },
    'TSCA': {
        keywords: ['tsca', 'chemical', 'usa', 'america', 'toxic', 'substances', 'control'],
        why: 'TSCA certificate for chemical exports to USA',
        when: 'For chemical exports to United States',
        usage: 'US chemical imports, TSCA compliance, chemical safety'
    },
    'GR_SAMPLE': {
        keywords: ['gr', 'waiver', 'sample', 'free', 'no', 'value', 'promotional'],
        why: 'GR waiver for free samples',
        when: 'For free sample exports with no commercial value',
        usage: 'Sample exports, promotional goods, no-value shipments'
    },
    'GR_REPAIR': {
        keywords: ['gr', 'waiver', 'repair', 'return', 'warranty', 'service'],
        why: 'GR waiver for repair and return goods',
        when: 'For goods sent for repair and return',
        usage: 'Repair services, warranty claims, temporary exports'
    },
    'MSDS': {
        keywords: ['msds', 'material', 'safety', 'data', 'sheet', 'chemical', 'hazard', 'safety'],
        why: 'Material safety data sheet for chemicals',
        when: 'For chemical or hazardous material exports',
        usage: 'Chemical safety, hazard communication, regulatory compliance'
    }
};

// ============================================================================
// DOCUMENT SEARCH FUNCTIONALITY
// ============================================================================
function filterDocuments(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const docLinks = document.querySelectorAll('.doc-link');
    const categories = document.querySelectorAll('nav > div');
    
    if (!term) {
        // Show all documents and categories
        docLinks.forEach(link => {
            link.style.display = 'block';
            link.classList.remove('bg-yellow-50', 'border-yellow-300');
        });
        categories.forEach(cat => cat.style.display = 'block');
        return;
    }
    
    let hasVisibleDocs = false;
    
    categories.forEach(category => {
        const categoryLinks = category.querySelectorAll('.doc-link');
        let categoryHasVisible = false;
        
        categoryLinks.forEach(link => {
            const docCode = link.dataset.docCode;
            const docTitle = link.dataset.docTitle?.toLowerCase() || '';
            const docDesc = link.dataset.docDesc?.toLowerCase() || '';
            const searchData = DOCUMENT_SEARCH_MAP[docCode];
            
            let isMatch = false;
            
            // Search in title and description
            if (docTitle.includes(term) || docDesc.includes(term)) {
                isMatch = true;
            }
            
            // Search in keywords, why, when, usage
            if (searchData && !isMatch) {
                const searchableText = [
                    ...searchData.keywords,
                    searchData.why,
                    searchData.when,
                    searchData.usage
                ].join(' ').toLowerCase();
                
                if (searchableText.includes(term)) {
                    isMatch = true;
                }
            }
            
            if (isMatch) {
                link.style.display = 'block';
                link.classList.add('bg-yellow-50', 'border-yellow-300');
                categoryHasVisible = true;
                hasVisibleDocs = true;
            } else {
                link.style.display = 'none';
                link.classList.remove('bg-yellow-50', 'border-yellow-300');
            }
        });
        
        category.style.display = categoryHasVisible ? 'block' : 'none';
    });
    
    // Show "no results" message if needed
    const existingNoResults = document.getElementById('no-search-results');
    if (existingNoResults) existingNoResults.remove();
    
    if (!hasVisibleDocs && term) {
        const noResultsDiv = document.createElement('div');
        noResultsDiv.id = 'no-search-results';
        noResultsDiv.className = 'p-4 text-center text-gray-500 text-sm';
        noResultsDiv.innerHTML = `
            <i class="fa-solid fa-search text-2xl mb-2 block"></i>
            No documents found for "${term}"
        `;
        document.querySelector('nav').appendChild(noResultsDiv);
    }
}

window.filterDocuments = filterDocuments;

// ============================================================================
// SECURITY: HTML SANITIZATION
// ============================================================================
/**
 * Sanitizes user input to prevent XSS attacks
 * @param {string} str - Input string to sanitize
 * @returns {string} - Sanitized string safe for HTML insertion
 */
function sanitizeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

// ============================================================================
// MOBILE VIEW FUNCTIONS
// ============================================================================
const isMobileView = () => window.innerWidth < 768;

const showDocumentView = () => {
    if (isMobileView()) {
        document.getElementById('documentListContainer').classList.add('hidden');
        document.getElementById('mainContentContainer').classList.remove('hidden', 'md:block');
        document.getElementById('mainContentContainer').classList.add('block');
    }
};

const showListView = () => {
    if (isMobileView()) {
        document.getElementById('documentListContainer').classList.remove('hidden');
        document.getElementById('mainContentContainer').classList.add('hidden');
        document.getElementById('mainContentContainer').classList.remove('block');
    }
};

// ============================================================================
// TABLE ROW MANAGEMENT FUNCTIONS
// ============================================================================
function addDocItemRow() {
    const tbody = document.getElementById('doc-items-body');
    if (!tbody) return;
    
    const template = document.getElementById('doc-item-row-template');
    if (!template) return;
    
    const clone = template.content.cloneNode(true);
    const rowNumber = tbody.children.length + 1;
    clone.querySelector('.row-number').textContent = rowNumber;
    
    // Add event listeners
    const removeBtn = clone.querySelector('.remove-row-btn');
    removeBtn.addEventListener('click', function() {
        this.closest('tr').remove();
        updateRowNumbers();
    });
    
    // Add calculation listeners
    const qtyInput = clone.querySelector('input[name="item_qty[]"]');
    const rateInput = clone.querySelector('input[name="item_rate[]"]');
    const amountInput = clone.querySelector('input[name="item_amount[]"]');
    
    [qtyInput, rateInput].forEach(input => {
        input.addEventListener('input', () => {
            const qty = parseFloat(qtyInput.value) || 0;
            const rate = parseFloat(rateInput.value) || 0;
            amountInput.value = (qty * rate).toFixed(2);
        });
    });
    
    tbody.appendChild(clone);
}

function addNonDGRow() {
    const tbody = document.getElementById('nondg-items-body');
    if (!tbody) return;
    
    const template = document.getElementById('nondg-row-template');
    if (!template) return;
    
    const clone = template.content.cloneNode(true);
    
    const removeBtn = clone.querySelector('.remove-row-btn');
    removeBtn.addEventListener('click', function() {
        this.closest('tr').remove();
    });
    
    tbody.appendChild(clone);
}

function addNegRow() {
    const tbody = document.getElementById('neg-items-body');
    if (!tbody) return;
    
    const template = document.getElementById('neg-row-template');
    if (!template) return;
    
    const clone = template.content.cloneNode(true);
    
    const removeBtn = clone.querySelector('.remove-row-btn');
    removeBtn.addEventListener('click', function() {
        this.closest('tr').remove();
    });
    
    tbody.appendChild(clone);
}

function addMCDRow() {
    const tbody = document.getElementById('mcd-items-body');
    if (!tbody) return;
    
    const template = document.getElementById('mcd-row-template');
    if (!template) return;
    
    const clone = template.content.cloneNode(true);
    
    const removeBtn = clone.querySelector('.remove-row-btn');
    removeBtn.addEventListener('click', function() {
        this.closest('tr').remove();
    });
    
    tbody.appendChild(clone);
}

function addPackingRow() {
    const tbody = document.getElementById('pkl-items-body');
    if (!tbody) return;
    
    const template = document.getElementById('packing-row-template');
    if (!template) return;
    
    const clone = template.content.cloneNode(true);
    
    const removeBtn = clone.querySelector('.remove-row-btn');
    removeBtn.addEventListener('click', function() {
        this.closest('tr').remove();
    });
    
    // Add dimension calculation
    const lInput = clone.querySelector('input[name="pkl_l[]"]');
    const bInput = clone.querySelector('input[name="pkl_b[]"]');
    const hInput = clone.querySelector('input[name="pkl_h[]"]');
    const volInput = clone.querySelector('input[name="pkl_vol[]"]');
    
    [lInput, bInput, hInput].forEach(input => {
        input.addEventListener('input', () => {
            const l = parseFloat(lInput.value) || 0;
            const b = parseFloat(bInput.value) || 0;
            const h = parseFloat(hInput.value) || 0;
            volInput.value = (l * b * h / 1000000).toFixed(3); // Convert to cubic meters
        });
    });
    
    tbody.appendChild(clone);
}

function updateRowNumbers() {
    const tbody = document.getElementById('doc-items-body');
    if (!tbody) return;
    
    Array.from(tbody.children).forEach((row, index) => {
        const numberCell = row.querySelector('.row-number');
        if (numberCell) {
            numberCell.textContent = index + 1;
        }
    });
}

// ============================================================================
// VALIDATION TOGGLE FUNCTIONS
// ============================================================================
let validationEnabled = true;

function toggleValidation() {
    validationEnabled = !validationEnabled;
    const button = document.getElementById('validation-toggle');
    const checklist = document.getElementById('integrity-checklist');
    
    if (validationEnabled) {
        button.classList.remove('bg-gray-500');
        button.classList.add('bg-amber-600');
        button.title = 'Validation ON - Click to disable';
        if (checklist) checklist.style.display = 'block';
    } else {
        button.classList.remove('bg-amber-600');
        button.classList.add('bg-gray-500');
        button.title = 'Validation OFF - Click to enable';
        if (checklist) checklist.style.display = 'none';
    }
}
let isPreviewOpen = false;
let currentDocId = null;
let savedDocsVisible = false;

// ============================================================================
// INDEXEDDB SETUP FOR DOCUMENT STORAGE
// ============================================================================
// Using docs-db.js for IndexedDB operations

// ============================================================================
// MOBILE RESPONSIVE FUNCTIONS (LEFTOVERS - CAN BE REMOVED)
// ============================================================================

// ============================================================================
// SAVED DOCUMENTS FUNCTIONS
// ============================================================================
function toggleSavedDocs() {
    // Show saved documents in main content area instead of right pane
    renderSavedDocumentsView();
}

async function renderSavedDocumentsView() {
    const contentArea = document.getElementById('app-content');
    const userId = getCurrentUserId();
    
    // Clear active selection in sidebar
    document.querySelectorAll('.doc-link').forEach(link => {
        link.classList.remove('bg-blue-50', 'border-blue-500', 'text-blue-700');
        link.querySelector('span').classList.remove('text-blue-700');
        link.classList.add('border-transparent');
    });
    
    try {
        const docs = await DocumentDB.getByUser(userId);
        
        let docsHtml = '';
        if (docs.length === 0) {
            docsHtml = `
                <div class="text-center py-12">
                    <i class="fa-solid fa-folder-open text-6xl text-gray-300 mb-4"></i>
                    <h3 class="text-lg font-semibold text-gray-600 mb-2">No Saved Documents</h3>
                    <p class="text-gray-500">Start creating documents and save them to see them here.</p>
                </div>
            `;
        } else {
            docsHtml = `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${docs.map(doc => `
                        <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div class="flex items-start justify-between mb-3">
                                <div class="flex-1">
                                    <h3 class="font-semibold text-gray-900 mb-1">${sanitizeHTML(doc.title)}</h3>
                                    <p class="text-sm text-gray-500 font-mono">${doc.docId}</p>
                                    <p class="text-xs text-gray-400 mt-1">${new Date(doc.timestamp).toLocaleString()}</p>
                                </div>
                                <div class="flex gap-1">
                                    <button onclick="copySavedDocument('${doc.id}')" class="text-blue-500 hover:text-blue-700 p-1 rounded" title="Copy to clipboard">
                                        <i class="fa-solid fa-copy text-sm"></i>
                                    </button>
                                    <button onclick="deleteSavedDocument('${doc.id}')" class="text-red-500 hover:text-red-700 p-1 rounded" title="Delete">
                                        <i class="fa-solid fa-trash text-sm"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <div class="border-t pt-3">
                                <div class="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                                    <div><strong>Fields:</strong> ${Object.keys(doc.data).length}</div>
                                    <div><strong>Size:</strong> ${(JSON.stringify(doc.data).length / 1024).toFixed(1)}KB</div>
                                </div>
                                
                                <button onclick="loadSavedDocument('${doc.id}')" class="w-full bg-blue-600 text-white py-2 px-3 rounded text-sm font-medium hover:bg-blue-700 transition-colors">
                                    <i class="fa-solid fa-folder-open mr-1"></i> Load Document
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        contentArea.innerHTML = `
            <div class="max-w-6xl mx-auto animate-fade-in">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h1 class="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                            <i class="fa-solid fa-save text-blue-600"></i>
                            Saved Documents
                        </h1>
                        <p class="text-gray-600">Your saved document drafts (${docs.length} total)</p>
                    </div>
                    <button onclick="renderDecisionGuide()" class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors">
                        <i class="fa-solid fa-arrow-left mr-2"></i> Back to Guide
                    </button>
                </div>
                
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    ${docsHtml}
                </div>
            </div>
        `;
        
        showDocumentView();
        
    } catch (error) {
        contentArea.innerHTML = `
            <div class="max-w-4xl mx-auto animate-fade-in">
                <div class="text-center py-12">
                    <i class="fa-solid fa-exclamation-triangle text-6xl text-red-300 mb-4"></i>
                    <h3 class="text-lg font-semibold text-red-600 mb-2">Error Loading Documents</h3>
                    <p class="text-gray-500">Unable to load saved documents. Please try again.</p>
                </div>
            </div>
        `;
    }
}

async function loadSavedDocument(docId) {
    try {
        const doc = await DocumentDB.getById(parseInt(docId));
        if (doc) {
            selectDoc(null, doc.docId, doc.title, '');
            
            setTimeout(() => {
                const form = document.getElementById('doc-form');
                if (form) {
                    // Load basic form fields
                    Object.entries(doc.data).forEach(([key, value]) => {
                        const input = form.querySelector(`[name="${key}"]`);
                        if (input && typeof value === 'string') {
                            input.value = value;
                        }
                    });
                    
                    // Restore dynamic table data
                    
                    // 1. Items table
                    if (doc.data.items && Array.isArray(doc.data.items)) {
                        const itemsBody = document.getElementById('doc-items-body');
                        if (itemsBody) {
                            // Clear existing rows
                            itemsBody.innerHTML = '';
                            
                            // Add saved items
                            doc.data.items.forEach(item => {
                                addDocItemRow();
                                const lastRow = itemsBody.lastElementChild;
                                if (lastRow) {
                                    const inputs = lastRow.querySelectorAll('input');
                                    if (inputs[0]) inputs[0].value = item.marks || '';
                                    if (inputs[1]) inputs[1].value = item.desc || '';
                                    if (inputs[2]) inputs[2].value = item.hsn || '';
                                    if (inputs[3]) inputs[3].value = item.qty || '';
                                    if (inputs[4]) inputs[4].value = item.unit || '';
                                    if (inputs[5]) inputs[5].value = item.rate || '';
                                    if (inputs[6]) inputs[6].value = item.amount || '';
                                }
                            });
                        }
                    }
                    
                    // 2. Packages table
                    if (doc.data.packages && Array.isArray(doc.data.packages)) {
                        const packingBody = document.getElementById('pkl-items-body');
                        if (packingBody) {
                            // Clear existing rows
                            packingBody.innerHTML = '';
                            
                            // Add saved packages
                            doc.data.packages.forEach(pkg => {
                                addPackingRow();
                                const lastRow = packingBody.lastElementChild;
                                if (lastRow) {
                                    const inputs = lastRow.querySelectorAll('input');
                                    if (inputs[0]) inputs[0].value = pkg.carton || '';
                                    if (inputs[1]) inputs[1].value = pkg.desc || '';
                                    if (inputs[2]) inputs[2].value = pkg.qty || '';
                                    if (inputs[3]) inputs[3].value = pkg.net || '';
                                    if (inputs[4]) inputs[4].value = pkg.gross || '';
                                    if (inputs[5]) inputs[5].value = pkg.l || '';
                                    if (inputs[6]) inputs[6].value = pkg.b || '';
                                    if (inputs[7]) inputs[7].value = pkg.h || '';
                                    if (inputs[8]) inputs[8].value = pkg.vol || '';
                                }
                            });
                        }
                    }
                    
                    // 3. Non-DG items
                    if (doc.data.nondgItems && Array.isArray(doc.data.nondgItems)) {
                        const nondgBody = document.getElementById('nondg-items-body');
                        if (nondgBody) {
                            nondgBody.innerHTML = '';
                            doc.data.nondgItems.forEach(item => {
                                addNonDGRow();
                                const lastRow = nondgBody.lastElementChild;
                                if (lastRow) {
                                    const inputs = lastRow.querySelectorAll('input');
                                    if (inputs[0]) inputs[0].value = item.marks || '';
                                    if (inputs[1]) inputs[1].value = item.description || '';
                                    if (inputs[2]) inputs[2].value = item.quantity || '';
                                }
                            });
                        }
                    }
                    
                    // 4. Negative Declaration items
                    if (doc.data.negItems && Array.isArray(doc.data.negItems)) {
                        const negBody = document.getElementById('neg-items-body');
                        if (negBody) {
                            negBody.innerHTML = '';
                            doc.data.negItems.forEach(item => {
                                addNegRow();
                                const lastRow = negBody.lastElementChild;
                                if (lastRow) {
                                    const inputs = lastRow.querySelectorAll('input');
                                    if (inputs[0]) inputs[0].value = item.marks || '';
                                    if (inputs[1]) inputs[1].value = item.description || '';
                                    if (inputs[2]) inputs[2].value = item.country || '';
                                }
                            });
                        }
                    }
                    
                    // 5. MCD items
                    if (doc.data.mcdItems && Array.isArray(doc.data.mcdItems)) {
                        const mcdBody = document.getElementById('mcd-items-body');
                        if (mcdBody) {
                            mcdBody.innerHTML = '';
                            doc.data.mcdItems.forEach(item => {
                                addMCDRow();
                                const lastRow = mcdBody.lastElementChild;
                                if (lastRow) {
                                    const inputs = lastRow.querySelectorAll('input');
                                    if (inputs[0]) inputs[0].value = item.marks || '';
                                    if (inputs[1]) inputs[1].value = item.description || '';
                                    if (inputs[2]) inputs[2].value = item.mfgOps || '';
                                    if (inputs[3]) inputs[3].value = item.mfgDate || '';
                                    if (inputs[4]) inputs[4].value = item.mfgCountry || '';
                                    if (inputs[5]) inputs[5].value = item.material || '';
                                    if (inputs[6]) inputs[6].value = item.materialDate || '';
                                    if (inputs[7]) inputs[7].value = item.prodCountry || '';
                                    if (inputs[8]) inputs[8].value = item.exportDate || '';
                                }
                            });
                        }
                    }
                }
            }, 100);
            
            if (window.showNotification) {
                window.showNotification('Document loaded successfully!', 'success');
            }
        }
    } catch (error) {
        if (window.showNotification) {
            window.showNotification('Error loading document.', 'error');
        }
    }
}

async function copySavedDocument(docId) {
    try {
        const doc = await DocumentDB.getById(parseInt(docId));
        if (doc) {
            const copyText = JSON.stringify(doc.data, null, 2);
            await navigator.clipboard.writeText(copyText);
            if (window.showNotification) {
                window.showNotification('Document data copied to clipboard!', 'success');
            }
        }
    } catch (error) {
        if (window.showNotification) {
            window.showNotification('Failed to copy document.', 'error');
        }
    }
}

async function deleteSavedDocument(docId) {
    if (!confirm('Delete this saved document?')) return;
    
    try {
        await DocumentDB.delete(parseInt(docId));
        if (window.showNotification) {
            window.showNotification('Document deleted!', 'success');
        }
        // Refresh the saved documents view
        renderSavedDocumentsView();
    } catch (error) {
        if (window.showNotification) {
            window.showNotification('Error deleting document.', 'error');
        }
    }
}

function getCurrentUserId() {
    return getUser().CODE || 'guest';
}

// ============================================================================
// REAL-TIME VALIDATION FUNCTIONS
// ============================================================================

/**
 * Real-time field validation as user types
 * @param {HTMLElement} input - The input element
 * @param {string} fieldKey - The field key
 */
function validateFieldRealTime(input, fieldKey) {
    // Use document-specific validation if available
    const validation = validateFieldForDoc ? 
        validateFieldForDoc(fieldKey, input.value, currentDocId) : 
        validateField(fieldKey, input.value);
    
    // Remove existing validation classes
    input.classList.remove('border-red-500', 'border-green-500', 'bg-red-50', 'bg-green-50');
    
    // Remove existing error message
    const existingError = input.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
    
    if (!validation.isValid && input.value.trim()) {
        // Show error state
        input.classList.add('border-red-500', 'bg-red-50');
        
        // Add error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error text-red-600 text-xs mt-1';
        errorDiv.textContent = validation.error;
        input.parentNode.appendChild(errorDiv);
    } else if (validation.isValid && input.value.trim()) {
        // Show success state
        input.classList.add('border-green-500', 'bg-green-50');
    }
    
    // Update integrity checklist if visible
    const currentSchema = DOC_SCHEMAS[currentDocId];
    if (currentSchema) {
        updateIntegrityChecks(currentSchema);
    }
}

// ============================================================================
// DOCUMENT INTEGRITY CHECK
// ============================================================================
/**
 * Enhanced integrity checklist using validation scheme
 * @param {object} schema - Document schema
 * @returns {string} - HTML for integrity checklist
 */
function createIntegrityChecklist(schema) {
    // Use document-specific required fields if available
    const getRequiredFieldsFunc = getRequiredFieldsForDoc || getRequiredFields;
    const requiredFieldKeys = getRequiredFieldsFunc(schema.id);
    
    const requiredFields = schema.fields.filter(f => 
        requiredFieldKeys.includes(f.key)
    );
    
    if (requiredFields.length === 0) {
        return '';
    }
    
    return `
        <div id="integrity-checklist" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4" style="display: none;">
            <h4 class="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                <i class="fa-solid fa-clipboard-check"></i>
                Required Fields Checklist:
            </h4>
            <div class="space-y-1">
                ${requiredFields.map(field => {
                    const validation = getFieldValidation(field.key);
                    const errorMsg = validation ? validation.errorMessage : '';
                    return `
                        <div class="flex items-center gap-2 text-sm">
                            <input type="checkbox" id="check-${field.key}" class="integrity-check" data-field="${field.key}">
                            <label for="check-${field.key}" class="text-yellow-700 flex-1" title="${errorMsg}">${field.label}</label>
                            <span class="validation-error text-red-600 text-xs hidden" id="error-${field.key}"></span>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="mt-3 text-xs text-yellow-600">
                <i class="fa-solid fa-info-circle mr-1"></i>
                Hover over field names to see validation requirements
            </div>
        </div>
    `;
}

/**
 * Enhanced validation using the centralized validation scheme
 * @param {object} schema - Document schema
 * @returns {object} - {valid: boolean, missing: array, errors: object}
 */
function validateRequiredFields(schema) {
    const form = document.getElementById('doc-form');
    if (!form) return { valid: true, missing: [], errors: {} };
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Use document-specific validation by default
    const validation = validateDocumentWithProfile ? 
        validateDocumentWithProfile(data, schema.id) : 
        validateDocument(data, schema.id);
    
    // Convert to legacy format for compatibility
    const missing = [];
    Object.keys(validation.errors).forEach(fieldKey => {
        const field = schema.fields.find(f => f.key === fieldKey);
        if (field) {
            missing.push(field.label);
        }
    });
    
    return {
        valid: validation.isValid,
        missing: missing,
        errors: validation.errors
    };
}

// ============================================================================
// SECTION 0: DATA DICTIONARY (COMMON MUTUAL FIELDS)
// ============================================================================
// These keys are used across multiple documents to ensure data consistency.
// - invoice_no:       Used in Invoice, Packing List, SDF
// - invoice_date:     Used in Invoice, Packing List
// - exporter_details: Used in Invoice, SLI, LOA, COO (Consignor/Shipper)
// - consignee_details:Used in Invoice, COO (Buyer/Receiver)
// - awb_number:       Used in SLI, AWB, Tracking
// - country_dest:     Used in Invoice, COO
// ============================================================================

// ============================================================================
// SECTION 0.5: FIELD MAPPINGS (SOURCE DATA -> DOC FIELDS)
// ============================================================================
// Maps document schema keys (left) to potential source data keys (right).
// Used when "Importing from Shipment" to pre-fill data.
/**
 * Main function called when a user clicks a sidebar item.
 * @param {HTMLElement} element - The clicked button element.
 * @param {string} docId - The ID of the document (e.g., 'COM_INV').
 * @param {string} docTitle - Fallback title.
 * @param {string} docDesc - Fallback description.
 */
function selectDoc(element, docId, docTitle, docDesc) {
    currentDocId = docId;
    
    // 1. Visual Selection Logic
    document.querySelectorAll('.doc-link').forEach(link => {
        link.classList.remove('bg-blue-50', 'border-blue-500', 'text-blue-700');
        link.querySelector('span').classList.remove('text-blue-700');
        link.classList.add('border-transparent');
    });

    if (element) {
        element.classList.remove('border-transparent');
        element.classList.add('bg-blue-50', 'border-blue-500', 'text-blue-700');
        element.querySelector('span').classList.add('text-blue-700');
    }

    // 2. Fetch Schema
    const schema = DOC_SCHEMAS[docId] || { 
        id: docId, 
        title: docTitle, 
        desc: docDesc, 
        fields: [] // Empty fields means "Work in Progress"
    };

    // 3. Render Content
    renderDocumentWorkspace(schema);
    
    // 4. Show document view on mobile
    showDocumentView();
}

/**
 * Renders the initial decision guide table.
 */
function renderDecisionGuide() {
    const contentArea = document.getElementById('app-content');
    if (!contentArea) return;

    // Clear active selection in sidebar
    document.querySelectorAll('.doc-link').forEach(link => {
        link.classList.remove('bg-blue-50', 'border-blue-500', 'text-blue-700');
        link.querySelector('span').classList.remove('text-blue-700');
        link.classList.add('border-transparent');
    });

    let guideHtml = `
        <div class="max-w-5xl mx-auto animate-fade-in">
            <div class="flex items-center gap-4 mb-6">
                <div>
                    <h1 class="text-3xl font-bold text-gray-900 mb-2">Document Decision Guide</h1>
                    <p class="text-gray-600">Use this table to quickly identify the documents you need for your shipment.</p>
                </div>
            </div>
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table class="w-full text-left">
                    <thead class="border-b-2 border-gray-200 bg-gray-50">
                        <tr>
                            <th class="p-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">If your shipment is...</th>
                            <th class="p-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Provide these documents</th>
                        </tr>
                    </thead>
                    <tbody id="decision-guide-body">
    `;

    DECISION_GUIDE.forEach(rule => {
        guideHtml += `
            <tr class="border-b border-gray-100 last:border-b-0">
                <td class="p-4 align-top font-medium text-gray-800">${rule.condition}</td>
                <td class="p-4 align-top">
                    <div class="flex flex-wrap gap-2">
        `;
        rule.documents.forEach(doc => {
            const schema = DOC_SCHEMAS[doc.id];
            if (schema) {
                guideHtml += `<button data-doc-id="${doc.id}" data-doc-title="${schema.title.replace(/"/g, '&quot;')}" data-doc-desc="${schema.desc.replace(/"/g, '&quot;')}" class="doc-guide-btn text-xs bg-blue-100 text-blue-800 font-semibold px-2 py-1 rounded-full hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400">${doc.name}</button>`;
            } else {
                guideHtml += `<span class="text-xs bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded-full cursor-not-allowed" title="Schema not defined yet">${doc.name}</span>`;
            }
        });
        guideHtml += `</div></td></tr>`;
    });

    guideHtml += `</tbody></table></div></div>`;
    contentArea.innerHTML = guideHtml;
    
    // Add event delegation for document buttons
    const tbody = document.getElementById('decision-guide-body');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            if (e.target.classList.contains('doc-guide-btn')) {
                const docId = e.target.dataset.docId;
                const docTitle = e.target.dataset.docTitle;
                const docDesc = e.target.dataset.docDesc;
                const sidebarLink = document.querySelector(`.doc-link[onclick*="'${docId}'"]`);
                selectDoc(sidebarLink, docId, docTitle, docDesc);
            }
        });
    }
}

/**
 * Renders the main content area with the form and preview sections.
 */
function renderDocumentWorkspace(schema) {
    const contentArea = document.getElementById('app-content');
    
    // Generate Form HTML
    let formHtml = '';
    if (schema.fields && schema.fields.length > 0) {
        formHtml = `<form id="doc-form" class="flex flex-wrap gap-y-4 -mx-2">`;

        schema.fields.forEach(field => {
            const widthClass = field.width || 'w-full';
            const requiredMark = field.required ? '<span class="text-red-500">*</span>' : '';

            let inputHtml = '';
            let fieldWrapper;

            if (field.type === 'heading') {
                fieldWrapper = `
                    <div class="w-full px-2 mt-4">
                        <h3 class="text-md font-bold text-gray-800 border-b-2 border-gray-200 pb-2 mb-2">${field.label}</h3>
                    </div>
                `;
            } else {
                const readonlyAttr = field.readonly ? 'readonly' : '';
                const readonlyClasses = field.readonly ? 'bg-gray-100 cursor-not-allowed' : 'bg-white';
                const placeholderAttr = field.placeholder ? `placeholder="${field.placeholder}"` : '';

                if (field.type === 'select') {
                    const onChangeAttr = field.key === 'currency' ? 'onchange="fetchExchangeRate(this.value)"' : '';
                    const options = field.options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
                    inputHtml = `<select name="${field.key}" ${onChangeAttr} class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white">${options}</select>`;
                } else if (field.type === 'items_table') {
                    inputHtml = `
                        <div class="w-full overflow-x-auto border border-gray-200 rounded-lg">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
                                    <tr>
                                        <th class="px-2 py-2 w-10 text-center">#</th>
                                        <th class="px-2 py-2 w-24">Marks & No.</th>
                                        <th class="px-2 py-2 min-w-[150px]">Description</th>
                                        <th class="px-2 py-2 w-24">HSN</th>
                                        <th class="px-2 py-2 w-20">Qty</th>
                                        <th class="px-2 py-2 w-20">Unit</th>
                                        <th class="px-2 py-2 w-28">Rate (INR)</th>
                                        <th class="px-2 py-2 w-28">Amt (INR)</th>
                                        <th class="px-2 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody id="doc-items-body"></tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="8" class="px-2 py-2 bg-gray-50 border-t"><button type="button" onclick="addDocItemRow()" class="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase tracking-wide flex items-center gap-1"><i class="fa-solid fa-plus"></i> Add Item</button></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
                } else if (field.type === 'nondg_table') {
                    inputHtml = `
                        <div class="w-full overflow-x-auto border border-gray-200 rounded-lg">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
                                    <tr>
                                        <th class="px-2 py-2 w-32">Marks & Numbers</th>
                                        <th class="px-2 py-2 min-w-[200px]">Description of Goods</th>
                                        <th class="px-2 py-2 w-24">Net Quantity</th>
                                        <th class="px-2 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody id="nondg-items-body"></tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="4" class="px-2 py-2 bg-gray-50 border-t"><button type="button" onclick="addNonDGRow()" class="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase tracking-wide flex items-center gap-1"><i class="fa-solid fa-plus"></i> Add Item</button></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
                } else if (field.type === 'neg_table') {
                    inputHtml = `
                        <div class="w-full overflow-x-auto border border-gray-200 rounded-lg">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
                                    <tr>
                                        <th class="px-2 py-2 w-32">Marks & Numbers</th>
                                        <th class="px-2 py-2 min-w-[200px]">Description & Quantity</th>
                                        <th class="px-2 py-2 w-32">Country of Origin</th>
                                        <th class="px-2 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody id="neg-items-body"></tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="4" class="px-2 py-2 bg-gray-50 border-t"><button type="button" onclick="addNegRow()" class="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase tracking-wide flex items-center gap-1"><i class="fa-solid fa-plus"></i> Add Silk Item</button></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
                } else if (field.type === 'mcd_table') {
                    inputHtml = `
                        <div class="w-full overflow-x-auto border border-gray-200 rounded-lg">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
                                    <tr>
                                        <th class="px-2 py-2 w-20">Marks</th>
                                        <th class="px-2 py-2 min-w-[120px]">Description</th>
                                        <th class="px-2 py-2 min-w-[120px]">Manufacturing Ops</th>
                                        <th class="px-2 py-2 w-24">Mfg Date</th>
                                        <th class="px-2 py-2 w-20">Mfg Country</th>
                                        <th class="px-2 py-2 min-w-[100px]">Material Desc</th>
                                        <th class="px-2 py-2 w-24">Material Date</th>
                                        <th class="px-2 py-2 w-20">Production Country</th>
                                        <th class="px-2 py-2 w-24">Export Date</th>
                                        <th class="px-2 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody id="mcd-items-body"></tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="10" class="px-2 py-2 bg-gray-50 border-t"><button type="button" onclick="addMCDRow()" class="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase tracking-wide flex items-center gap-1"><i class="fa-solid fa-plus"></i> Add Item</button></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
                } else if (field.type === 'packing_table') {
                    inputHtml = `
                        <div class="w-full overflow-x-auto border border-gray-200 rounded-lg">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
                                    <tr>
                                        <th class="px-2 py-2 w-16">Carton#</th>
                                        <th class="px-2 py-2 min-w-[150px]">Description</th>
                                        <th class="px-2 py-2 w-20">Qty</th>
                                        <th class="px-2 py-2 w-20">N.W.</th>
                                        <th class="px-2 py-2 w-20">G.W.</th>
                                        <th class="px-2 py-2 w-32">Dims (LxBxH)</th>
                                        <th class="px-2 py-2 w-20">Vol.Wt</th>
                                        <th class="px-2 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody id="pkl-items-body"></tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="8" class="px-2 py-2 bg-gray-50 border-t"><button type="button" onclick="addPackingRow()" class="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase tracking-wide flex items-center gap-1"><i class="fa-solid fa-plus"></i> Add Package</button></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
                } else if (field.type === 'textarea') {
                    const validation = getFieldValidation(field.key);
                    const validationAttrs = validation ? {
                        minlength: validation.minLength || '',
                        maxlength: validation.maxLength || ''
                    } : {};
                    
                    const validationAttrStr = Object.entries(validationAttrs)
                        .filter(([key, value]) => value !== '')
                        .map(([key, value]) => `${key}="${value}"`)
                        .join(' ');
                        
                    inputHtml = `<textarea name="${field.key}" rows="4" class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${readonlyClasses}" ${readonlyAttr} ${placeholderAttr} oninput="validateFieldRealTime(this, '${field.key}')" ${validationAttrStr}>${field.value || ''}</textarea>`;
                } else {
                    const stepAttr = field.type === 'number' ? 'step="any"' : '';
                    const validation = getFieldValidation(field.key);
                    const validationAttrs = validation ? {
                        minlength: validation.minLength || '',
                        maxlength: validation.maxLength || '',
                        min: validation.min || '',
                        max: validation.max || '',
                        pattern: validation.pattern ? validation.pattern.source : ''
                    } : {};
                    
                    const validationAttrStr = Object.entries(validationAttrs)
                        .filter(([key, value]) => value !== '')
                        .map(([key, value]) => `${key}="${value}"`)
                        .join(' ');
                    
                    // Add API trigger attributes for pincode/zipcode fields
                    const apiTriggerAttr = field.api_trigger ? 'data-api-trigger="true"' : '';
                    const apiPopulateAttr = field.api_populate ? 'data-api-populate="true"' : '';
                    const patternAttr = field.pattern ? `pattern="${field.pattern}"` : '';
                    
                    if (field.key === 'reference_id') {
                        // SPECIAL CASE: Attach the auto-fill trigger to Reference ID
                        inputHtml = `<input type="${field.type}" name="${field.key}" value="${field.value || ''}" class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${readonlyClasses}" ${readonlyAttr} placeholder="Enter Ref/AWB to Auto-fill" onblur="autoFillFromReference(this.value, '${schema.id}')" oninput="validateFieldRealTime(this, '${field.key}')" ${stepAttr} ${validationAttrStr}>`;
                    } else {
                        inputHtml = `<input type="${field.type}" name="${field.key}" id="${field.key}" value="${field.value || ''}" class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all ${readonlyClasses}" ${readonlyAttr} ${placeholderAttr} oninput="validateFieldRealTime(this, '${field.key}')" ${stepAttr} ${validationAttrStr} ${apiTriggerAttr} ${apiPopulateAttr} ${patternAttr}>`;
                    }
                }

                fieldWrapper = `
                    <div class="${widthClass} px-2">
                        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">${field.label} ${requiredMark}</label>
                        ${inputHtml}
                    </div>
                `;
            }
            formHtml += fieldWrapper;
        });
        
        // Add design selector for TAX_CHALLAN and DELIVERY_CHALLAN
        if (schema.id === 'TAX_CHALLAN' || schema.id === 'DELIVERY_CHALLAN') {
            formHtml += `
                <div class="w-full px-2 mt-4">
                    <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">🎨 Design Template <span class="text-red-500">*</span></label>
                    <select name="designId" class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white">
                        ${Array.from({length: 10}, (_, i) => `<option value="${i + 1}">Design ${i + 1} ${i === 0 ? '(Default)' : ''}</option>`).join('')}
                    </select>
                    <p class="text-xs text-gray-500 mt-1">Choose from 10 different design variations for your document</p>
                </div>
            `;
        }

        formHtml += `</form>`;
    } else {
        formHtml = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400 bg-gray-50 rounded border border-dashed border-gray-300">
                <i class="fa-solid fa-person-digging text-4xl mb-3"></i>
                <p>Template configuration for <strong>${schema.title}</strong> is under development.</p>
            </div>
        `;
    }

    // Common Header with Toolbar
    const headerHtml = `
        <div class="mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fade-in">
            <div class="flex items-center gap-3">
                <div class="p-3 bg-blue-50 text-blue-600 rounded-lg">
                    <i class="fa-solid fa-file-contract text-xl"></i>
                </div>
                <div>
                    <h1 class="text-xl font-bold text-gray-900 leading-tight">${schema.title}</h1>
                    <p class="text-xs text-gray-500 font-mono">${schema.id}</p>
                </div>
            </div>
            
            <div class="flex flex-wrap justify-center items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                <button type="button" id="validation-toggle" onclick="toggleValidation()" class="px-3 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors text-sm font-medium" title="Toggle field validation">
                    <i class="fa-solid fa-check-circle"></i>
                </button>
                <button onclick="document.getElementById('doc-form').reset()" class="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm font-medium" title="Reset Form">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
                <button onclick="handleGenerate('${schema.id}')" class="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium" title="Generate Document">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                </button>
                <button onclick="handleBlankPrint('${schema.id}')" class="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm font-medium" title="Print Blank Template">
                    <i class="fa-solid fa-file-lines"></i>
                </button>
                <button onclick="togglePreview()" class="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium" title="Toggle Preview">
                    <i class="fa-regular fa-eye" id="preview-toggle-icon"></i>
                </button>
                <button onclick="handleDownloadPDF('${schema.id}')" class="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium" title="Download PDF">
                    <i class="fa-solid fa-file-pdf"></i>
                </button>
                <button onclick="handleDownloadDOCX('${schema.id}')" class="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm font-medium" title="Download DOCX">
                    <i class="fa-solid fa-file-word"></i>
                </button>
                <button onclick="showDocInfo('${schema.title}', '${schema.desc}')" class="px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors text-sm font-medium" title="Document Info">
                    <i class="fa-solid fa-info-circle"></i>
                </button>
                <button onclick="saveLocalDraft('${schema.id}')" class="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors text-sm font-medium" title="Save Locally">
                    <i class="fa-solid fa-save"></i>
                </button>
                <button onclick="saveCloudDraft('${schema.id}')" class="px-3 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors text-sm font-medium" title="Save to Cloud">
                    <i class="fa-solid fa-cloud"></i>
                </button>
                <button onclick="renderDecisionGuide()" class="px-3 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors text-sm font-medium" title="Close Document">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
        </div>
    `;

    const formColClass = isPreviewOpen ? 'lg:col-span-2' : 'lg:col-span-3';
    const previewColClass = isPreviewOpen ? 'lg:col-span-1 space-y-6' : 'hidden lg:col-span-1 space-y-6';

    // Inject HTML
    contentArea.innerHTML = `
        <div class="max-w-5xl mx-auto animate-fade-in">
            ${headerHtml}
            
            ${createIntegrityChecklist(schema)}
            
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- Left: Input Form -->
                <div id="doc-form-container" class="${formColClass} bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <div class="flex items-center justify-between mb-4 border-b pb-2">
                        <h2 class="text-lg font-semibold text-gray-800">Document Details</h2>
                        <span class="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">ID: ${schema.id}</span>
                    </div>
                    ${formHtml}
                </div>

                <!-- Right: Preview / Actions -->
                <div id="doc-preview-container" class="${previewColClass}">
                    <!-- Preview Card -->
                    <div class="bg-gray-800 text-white p-6 rounded-lg shadow-lg">
                        <h3 class="font-semibold mb-2 flex items-center gap-2">
                            <i class="fa-regular fa-eye"></i> Live Preview
                        </h3>
                        <div id="mini-preview" class="bg-white text-gray-800 h-64 rounded opacity-90 flex items-center justify-center text-sm">
                            <span class="text-gray-400 italic">Fill form to see preview</span>
                        </div>
                    </div>

                    <!-- Quick Actions -->
                    <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <h3 class="text-sm font-bold text-gray-700 uppercase mb-3">Quick Actions</h3>
                        <div class="space-y-2">
                            <button onclick="loadLocalDraft('${schema.id}')" class="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors flex items-center">
                                <i class="fa-solid fa-clock-rotate-left w-6"></i> Load Last Draft
                            </button>
                            <button onclick="handleImportData('${schema.id}')" class="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors flex items-center">
                                <i class="fa-solid fa-upload w-6"></i> Import from Shipment
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <style>
            .animate-fade-in { animation: fadeIn 0.3s ease-in-out; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        </style>
    `;
    
    // Setup integrity check listeners
    setupIntegrityCheckListeners(schema);
}

/**
 * Toggles the visibility of the live preview column.
 */
function togglePreview() {
    isPreviewOpen = !isPreviewOpen;
    const formContainer = document.getElementById('doc-form-container');
    const previewContainer = document.getElementById('doc-preview-container');
    const icon = document.getElementById('preview-toggle-icon');

    if (isPreviewOpen) {
        formContainer.classList.remove('lg:col-span-3');
        formContainer.classList.add('lg:col-span-2');
        previewContainer.classList.remove('hidden');
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    } else {
        formContainer.classList.remove('lg:col-span-2');
        formContainer.classList.add('lg:col-span-3');
        previewContainer.classList.add('hidden');
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    }
}

/**
 * Handles blank printing - generates document with empty/default values
 */
function handleBlankPrint(docId) {
    const data = { designId: '1' }; // Default design for blank printing
    generatePrintView(docId, data);
    
    if (window.showNotification) {
        window.showNotification(`Blank ${docId} template generated!`, 'success');
    }
}

/**
 * Handles the generation logic.
 */
function handleGenerate(docId) {
    const form = document.getElementById('doc-form');
    if (!form) return;

    // Check if validation is enabled
    if (validationEnabled) {
        const schema = DOC_SCHEMAS[docId];
        const validation = validateRequiredFields(schema);
        
        if (!validation.valid) {
            // Show detailed validation errors
            const errorMessages = Object.entries(validation.errors).map(([field, error]) => {
                const fieldDef = schema.fields.find(f => f.key === field);
                const fieldLabel = fieldDef ? fieldDef.label : field;
                return `${fieldLabel}: ${error}`;
            }).join('\n');
            
            if (window.showNotification) {
                window.showNotification(`Validation failed:\n${errorMessages}`, 'error');
            } else {
                alert(`Validation failed:\n${errorMessages}`);
            }
            return;
        }
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Collect ALL form fields including empty ones
    const allInputs = form.querySelectorAll('input, textarea, select');
    allInputs.forEach(input => {
        if (input.name && !data.hasOwnProperty(input.name)) {
            data[input.name] = input.value || ''; // Include empty fields
        }
    });

    // --- Enhanced Dynamic Table Collection ---
    
    // 1. Items table (COM_INV, TAX_CHALLAN, DELIVERY_CHALLAN)
    const itemsBody = document.getElementById('doc-items-body');
    if (itemsBody && itemsBody.children.length > 0) {
        const items = [];
        Array.from(itemsBody.children).forEach((row, index) => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length > 0) {
                const item = {
                    sno: index + 1,
                    marks: inputs[0]?.value || '',
                    desc: inputs[1]?.value || '',
                    hsn: inputs[2]?.value || '',
                    qty: parseFloat(inputs[3]?.value) || 0,
                    unit: inputs[4]?.value || '',
                    rate: parseFloat(inputs[5]?.value) || 0,
                    amount: parseFloat(inputs[6]?.value) || (parseFloat(inputs[3]?.value || 0) * parseFloat(inputs[5]?.value || 0))
                };
                items.push(item);
            }
        });
        if (items.length > 0) data.products = items; // Use 'products' for template compatibility
    }

    // 2. Packing table (PKL, DELIVERY_CHALLAN)
    const packingBody = document.getElementById('pkl-items-body');
    if (packingBody && packingBody.children.length > 0) {
        const packages = [];
        Array.from(packingBody.children).forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length > 0) {
                packages.push({
                    carton: inputs[0]?.value || '',
                    desc: inputs[1]?.value || '',
                    qty: inputs[2]?.value || '',
                    net: parseFloat(inputs[3]?.value) || 0,
                    gross: parseFloat(inputs[4]?.value) || 0,
                    dims: `${inputs[5]?.value || ''}x${inputs[6]?.value || ''}x${inputs[7]?.value || ''}`,
                    vol: parseFloat(inputs[8]?.value) || 0
                });
            }
        });
        if (packages.length > 0) data.packages = packages;
    }

    // 3. Non-DG table
    const nondgBody = document.getElementById('nondg-items-body');
    if (nondgBody && nondgBody.children.length > 0) {
        const nondgItems = [];
        Array.from(nondgBody.children).forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length > 0) {
                nondgItems.push({
                    marks: inputs[0]?.value || '',
                    description: inputs[1]?.value || '',
                    quantity: inputs[2]?.value || ''
                });
            }
        });
        if (nondgItems.length > 0) data.nondgItems = nondgItems;
    }

    // 4. Negative Declaration table
    const negBody = document.getElementById('neg-items-body');
    if (negBody && negBody.children.length > 0) {
        const negItems = [];
        Array.from(negBody.children).forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length > 0) {
                negItems.push({
                    marks: inputs[0]?.value || '',
                    description: inputs[1]?.value || '',
                    country: inputs[2]?.value || ''
                });
            }
        });
        if (negItems.length > 0) data.negItems = negItems;
    }

    // 5. MCD table
    const mcdBody = document.getElementById('mcd-items-body');
    if (mcdBody && mcdBody.children.length > 0) {
        const mcdItems = [];
        Array.from(mcdBody.children).forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length > 0) {
                mcdItems.push({
                    marks: inputs[0]?.value || '',
                    description: inputs[1]?.value || '',
                    mfgOps: inputs[2]?.value || '',
                    mfgDate: inputs[3]?.value || '',
                    mfgCountry: inputs[4]?.value || '',
                    material: inputs[5]?.value || '',
                    materialDate: inputs[6]?.value || '',
                    prodCountry: inputs[7]?.value || '',
                    exportDate: inputs[8]?.value || ''
                });
            }
        });
        if (mcdItems.length > 0) data.mcdItems = mcdItems;
    }

    // Visual Feedback
    const btn = document.querySelector(`button[onclick*="handleGenerate('${docId}')"]`);
    if (!btn) return;
    
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>`;

    // Generate Print View immediately
    generatePrintView(docId, data);
    
    // Update Preview Area
    const previewBox = document.getElementById('mini-preview');
    if (previewBox) {
        previewBox.innerHTML = `
            <div class="text-center p-4">
                <i class="fa-solid fa-check-circle text-green-500 text-4xl mb-2"></i>
                <p class="font-bold text-gray-800">Generated Successfully!</p>
                <p class="text-xs text-gray-500 mb-3">Document opened in new tab.</p>
                <button onclick='generatePrintView("${docId}", ${JSON.stringify(data)})' class="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs rounded font-semibold transition-colors">
                    <i class="fa-solid fa-print mr-1"></i> Re-print
                </button>
            </div>
        `;
    }
    
    // Reset button state
    btn.disabled = false;
    btn.innerHTML = originalText;
    
    // Use global notification if available (from layout.js)
    if (window.showNotification) {
        window.showNotification(`${docId} generated successfully!`, 'success');
    }
}

/**
 * Generates and downloads a PDF of the document using jsPDF and html2canvas.
 * @param {string} docId
 */
async function handleDownloadPDF(docId) {
    const { jsPDF } = window.jspdf;
    const schema = DOC_SCHEMAS[docId];
    const form = document.getElementById('doc-form');
    if (!schema || !form || !window.html2canvas || !window.jspdf) {
        alert('Required libraries (jsPDF, html2canvas) not found.');
        return;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (window.showNotification) window.showNotification('Generating PDF...', 'info');

    // Create a temporary, off-screen element to render the printable content
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.width = '800px'; // Standard A4-ish width for rendering

    const formatValue = (key, val) => {
        if (!val) return '-';
        const fieldDef = schema.fields.find(f => f.key === key);
        if (fieldDef && fieldDef.type === 'date') {
            const date = new Date(val);
            return isNaN(date.getTime()) ? val : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        return sanitizeHTML(String(val)).replace(/\n/g, '<br>');
    };

    const rows = schema.fields.map(field => `
        <tr>
            <td class="label">${field.label}</td>
            <td class="value">${formatValue(field.key, data[field.key] || field.value || '')}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div id="pdf-content" style="background: white; padding: 40px;">
            <style>
                #pdf-content { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; }
                .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #333; padding-bottom: 20px; }
                .header h1 { margin: 0; text-transform: uppercase; font-size: 24px; letter-spacing: 1px; }
                .header p { margin: 5px 0 0; color: #666; font-style: italic; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; border: 1px solid #eee; }
                td { padding: 12px 15px; border-bottom: 1px solid #eee; vertical-align: top; }
                td.label { width: 35%; font-weight: 600; color: #555; background: #f9fafb; border-right: 1px solid #eee; }
                td.value { width: 65%; word-break: break-word; }
                tr:last-child td { border-bottom: none; }
                .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
            </style>
            <div class="header">
                <h1>${sanitizeHTML(schema.title)}</h1>
                <p>${sanitizeHTML(schema.desc)}</p>
            </div>
            <table><tbody>${rows}</tbody></table>
            <div class="footer">
                Generated via Document Center • ${new Date().toLocaleString('en-IN')}
            </div>
        </div>
    `;
    document.body.appendChild(container);

    try {
        const content = document.getElementById('pdf-content');
        const canvas = await html2canvas(content, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const imgProps = pdf.getImageProperties(imgData);
        const imgHeight = (imgProps.height * (pdfWidth - 20)) / imgProps.width;

        pdf.addImage(imgData, 'PNG', 10, 10, pdfWidth - 20, imgHeight);
        pdf.save(`${docId}_${Date.now()}.pdf`);

        if (window.showNotification) window.showNotification('PDF downloaded!', 'success');
    } catch (error) {
        console.error("PDF Generation Error:", error);
        if (window.showNotification) window.showNotification('Failed to generate PDF.', 'error');
    } finally {
        document.body.removeChild(container);
    }
}

/**
 * Generates and downloads a DOCX file of the document using docx.
 * @param {string} docId
 */
function handleDownloadDOCX(docId) {
    const schema = DOC_SCHEMAS[docId];
    const form = document.getElementById('doc-form');
    if (!schema || !form || !window.docx) {
        alert('Required library (docx) not found.');
        return;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (window.showNotification) window.showNotification('Generating DOCX...', 'info');

    try {
        const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, AlignmentType, WidthType } = docx;

        const tableRows = schema.fields.map(field => {
            const value = data[field.key] || field.value || '';
            return new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: field.label, bold: true })] })],
                        width: { size: 35, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        children: [new Paragraph(String(value))],
                        width: { size: 65, type: WidthType.PERCENTAGE },
                    }),
                ],
            });
        });

        const doc = new Document({
            sections: [{
                children: [
                    new Paragraph({ text: schema.title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
                    new Paragraph({ text: schema.desc, alignment: AlignmentType.CENTER, style: "Quote" }),
                    new Paragraph(" "), // Spacer
                    new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
                ],
            }],
        });

        Packer.toBlob(doc).then(blob => {
            if (window.saveAs) {
                window.saveAs(blob, `${docId}_${Date.now()}.docx`);
            } else { // Fallback for browsers that don't support FileSaver.js
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${docId}_${Date.now()}.docx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
            if (window.showNotification) window.showNotification('DOCX downloaded!', 'success');
        });

    } catch (error) {
        console.error("DOCX Generation Error:", error);
        if (window.showNotification) window.showNotification('Failed to generate DOCX.', 'error');
    }
}

/**
 * Displays document information using the global notification modal if available.
 * @param {string} title 
 * @param {string} desc 
 */
function showDocInfo(title, desc) {
    if (typeof openNotificationModal === 'function') {
        openNotificationModal(desc, 'info');
        // Override the default title "Information" with the specific Doc Title
        const titleEl = document.getElementById('notif-modal-title');
        if (titleEl) titleEl.textContent = title;
    } else {
        alert(desc);
    }
}



/**
 * Generates the specific Packing List print view.
/**
 * Generates a print view for any document schema by routing to specific templates.
 * @param {string} docId 
 * @param {object} data 
 */
function generatePrintView(docId, data) {
    // Route to specific print view functions in docs-templates.js
    const printFunctions = {
        'KYC': generateKYCPrintView,
        'COM_INV': generateCommercialInvoicePrintView,
        'PKL': generatePackingListPrintView,
        'SDF': generateSDFPrintView,
        'ANN_1': generateAnnexure1PrintView,
        'SLI': generateSLIPrintView,
        'ANN_2': generateAnnexure2PrintView,
        'APP_3': generateAppendix3PrintView,
        'APP_4': generateAppendix4PrintView,
        'APP_2': generateAppendix2PrintView,
        'ANN_C1': generateAnnexureC1PrintView,
        'SCD': generateSingleCountryDeclarationPrintView,
        'MCD': generateMultipleCountryDeclarationPrintView,
        'NEG_DEC': generateNegativeDeclarationPrintView,
        'QUOTA': generateQuotaChargeStatementPrintView,
        'NON_DG': generateNonDGPrintView,
        'TSCA': generateTSCAPrintView,
        'GR_SAMPLE': generateGRSamplePrintView,
        'GR_REPAIR': generateGRRepairPrintView,
        'MSDS': generateMSDSPrintView,
        'TAX_CHALLAN': generateTaxChallanPrintView,
        'LOA': generateLOAPrintView,
        'COO': generateCOOPrintView,
        'ANN_D': generateAnnexureDPrintView,
        'DELIVERY_CHALLAN': generateDeliveryChallanPrintView,
        'DOM_INV': generateDomesticInvoicePrintView,
        'BL_AWB': generateBLAWBPrintView,
        'INS_CERT': generateInsuranceCertPrintView,
        'ARE1': generateARE1PrintView
    };

    const printFunction = printFunctions[docId];
    if (printFunction) {
        printFunction(data);
    } else {
        generateGenericPrintView(docId, data);
    }
}

async function saveLocalDraft(docId) {
    const form = document.getElementById('doc-form');
    if (!form) {
        if (window.showNotification) window.showNotification('No form to save.', 'error');
        return;
    }
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const schema = DOC_SCHEMAS[docId];
    const userId = getCurrentUserId();
    
    // Collect dynamic table data - CRITICAL FOR SAVING ALL FIELDS
    
    // 1. Items table (for COM_INV, TAX_CHALLAN, DELIVERY_CHALLAN)
    const itemsBody = document.getElementById('doc-items-body');
    if (itemsBody && itemsBody.children.length > 0) {
        const items = [];
        Array.from(itemsBody.children).forEach((row, index) => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length > 0) {
                items.push({
                    sno: index + 1,
                    marks: inputs[0]?.value || '',
                    desc: inputs[1]?.value || '',
                    hsn: inputs[2]?.value || '',
                    qty: inputs[3]?.value || '',
                    unit: inputs[4]?.value || '',
                    rate: inputs[5]?.value || '',
                    amount: inputs[6]?.value || ''
                });
            }
        });
        if (items.length > 0) data.items = items;
    }
    
    // 2. Packing table (for PKL, DELIVERY_CHALLAN)
    const packingBody = document.getElementById('pkl-items-body');
    if (packingBody && packingBody.children.length > 0) {
        const packages = [];
        Array.from(packingBody.children).forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length > 0) {
                packages.push({
                    carton: inputs[0]?.value || '',
                    desc: inputs[1]?.value || '',
                    qty: inputs[2]?.value || '',
                    net: inputs[3]?.value || '',
                    gross: inputs[4]?.value || '',
                    l: inputs[5]?.value || '',
                    b: inputs[6]?.value || '',
                    h: inputs[7]?.value || '',
                    vol: inputs[8]?.value || ''
                });
            }
        });
        if (packages.length > 0) data.packages = packages;
    }
    
    // 3. Non-DG table
    const nondgBody = document.getElementById('nondg-items-body');
    if (nondgBody && nondgBody.children.length > 0) {
        const nondgItems = [];
        Array.from(nondgBody.children).forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length > 0) {
                nondgItems.push({
                    marks: inputs[0]?.value || '',
                    description: inputs[1]?.value || '',
                    quantity: inputs[2]?.value || ''
                });
            }
        });
        if (nondgItems.length > 0) data.nondgItems = nondgItems;
    }
    
    // 4. Negative Declaration table
    const negBody = document.getElementById('neg-items-body');
    if (negBody && negBody.children.length > 0) {
        const negItems = [];
        Array.from(negBody.children).forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length > 0) {
                negItems.push({
                    marks: inputs[0]?.value || '',
                    description: inputs[1]?.value || '',
                    country: inputs[2]?.value || ''
                });
            }
        });
        if (negItems.length > 0) data.negItems = negItems;
    }
    
    // 5. MCD table
    const mcdBody = document.getElementById('mcd-items-body');
    if (mcdBody && mcdBody.children.length > 0) {
        const mcdItems = [];
        Array.from(mcdBody.children).forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length > 0) {
                mcdItems.push({
                    marks: inputs[0]?.value || '',
                    description: inputs[1]?.value || '',
                    mfgOps: inputs[2]?.value || '',
                    mfgDate: inputs[3]?.value || '',
                    mfgCountry: inputs[4]?.value || '',
                    material: inputs[5]?.value || '',
                    materialDate: inputs[6]?.value || '',
                    prodCountry: inputs[7]?.value || '',
                    exportDate: inputs[8]?.value || ''
                });
            }
        });
        if (mcdItems.length > 0) data.mcdItems = mcdItems;
    }
    
    // 6. Collect ALL form fields including empty ones
    const allInputs = form.querySelectorAll('input, textarea, select');
    allInputs.forEach(input => {
        if (input.name && !data.hasOwnProperty(input.name)) {
            data[input.name] = input.value || ''; // Save empty fields as empty strings
        }
    });
    
    console.log('Complete data being saved:', { docId, title: schema.title, data, userId });
    
    try {
        const result = await DocumentDB.save(docId, schema.title, data, userId);
        console.log('Document saved with ID:', result);
        
        if (window.showNotification) window.showNotification('Document saved locally!', 'success');
        
        // Refresh saved docs if visible
        if (savedDocsVisible) {
            loadSavedDocuments();
        }
    } catch (error) {
        console.error('Error saving document:', error);
        if (window.showNotification) window.showNotification('Error saving document.', 'error');
    }
}

function saveCloudDraft(docId) {
    // Placeholder for cloud saving - would integrate with backend
    if (window.showNotification) window.showNotification('Cloud save feature coming soon!', 'info');
}

function loadLocalDraft(docId) {
    // Show saved documents pane
    if (!savedDocsVisible) {
        toggleSavedDocs();
    }
}

// ============================================================================
// INTEGRITY CHECK SETUP
// ============================================================================
function setupIntegrityCheckListeners(schema) {
    // Update checkboxes when form fields change
    const form = document.getElementById('doc-form');
    if (!form) return;
    
    form.addEventListener('input', () => {
        updateIntegrityChecks(schema);
    });
    
    // Set initial checklist visibility based on validation state
    const checklist = document.getElementById('integrity-checklist');
    if (checklist) {
        checklist.style.display = validationEnabled ? 'block' : 'none';
    }
    
    // Initial check
    setTimeout(() => updateIntegrityChecks(schema), 100);
}

/**
 * Enhanced integrity check updates using validation scheme
 * @param {object} schema - Document schema
 */
function updateIntegrityChecks(schema) {
    const form = document.getElementById('doc-form');
    if (!form) return;
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    schema.fields.forEach(field => {
        const checkbox = document.getElementById(`check-${field.key}`);
        const errorSpan = document.getElementById(`error-${field.key}`);
        
        if (checkbox) {
            // Use document-specific validation if available
            const validation = validateFieldForDoc ? 
                validateFieldForDoc(field.key, data[field.key], schema.id) : 
                validateField(field.key, data[field.key], schema.id);
            
            if (validation.isValid) {
                checkbox.checked = true;
                checkbox.classList.remove('text-red-500');
                checkbox.classList.add('text-green-500');
                if (errorSpan) {
                    errorSpan.textContent = '';
                    errorSpan.classList.add('hidden');
                }
            } else {
                checkbox.checked = false;
                checkbox.classList.remove('text-green-500');
                checkbox.classList.add('text-red-500');
                if (errorSpan && validation.error) {
                    errorSpan.textContent = validation.error;
                    errorSpan.classList.remove('hidden');
                }
            }
        }
    });
}

function handleImportData(docId) {
    // Placeholder for data import
    if (window.showNotification) window.showNotification('Data import feature coming soon!', 'info');
}

/**
 * Automatically fetches data when Reference ID is typed.
 * @param {string} ref - The value typed by the user.
 * @param {string} docId - The current document ID (e.g., 'COM_INV').
 */
window.autoFillFromReference = function(ref, docId) {
    if (!ref) return; // Do nothing if empty

    // 1. Get Data (Support both Window object or LocalStorage)
    let appData = window.appData; 
    if (!appData) {
        try {
            appData = JSON.parse(localStorage.getItem('appData'));
        } catch (e) {
            console.error("No AppData found");
            return;
        }
    }
    
    if (!appData || !appData.SHIPMENTS) return;

    const orders = appData.SHIPMENTS.ORDERS || {};
    const products = appData.SHIPMENTS.PRODUCT || {};
    const b2bData = appData.CHANNEL?.B2B || {};

    // 2. Find the Shipment (Search by Reference OR AWB)
    const searchRef = ref.toUpperCase().trim();
    
    let order = Object.values(orders).find(o => 
        (o.REFERENCE && o.REFERENCE.toUpperCase() === searchRef) || 
        (o.AWB_NUMBER && o.AWB_NUMBER.toUpperCase() === searchRef)
    );

    if (!order) {
        // Optional: Visual feedback if not found (e.g., red border)
        const refInput = document.querySelector('input[name="reference_id"]');
        if(refInput) refInput.classList.add('border-red-500');
        if(window.showNotification) window.showNotification("Reference not found in database.", "warning");
        return;
    }

    // 3. Success! Visual Feedback
    const refInput = document.querySelector('input[name="reference_id"]');
    if(refInput) {
        refInput.classList.remove('border-red-500');
        refInput.classList.add('border-green-500', 'bg-green-50');
    }
    if(window.showNotification) window.showNotification("Shipment data found! Filling form...", "success");

    // 4. Merge Data Sources (Order + Product + B2B)
    const mergedData = { ...order };
    
    // Merge Product Data
    const productInfo = Object.values(products).find(p => p.RERERANCE === order.REFERENCE);
    if (productInfo) Object.assign(mergedData, productInfo);

    // Merge B2B/Client Data
    if (order.CODE) {
        const clientInfo = Object.values(b2bData).find(c => c.CODE === order.CODE);
        if (clientInfo) Object.assign(mergedData, clientInfo);
    }

    // 5. Execute the Bindup (Map Data -> Inputs)
    const mapping = FIELD_MAPPINGS[docId] || {};
    const commonMapping = FIELD_MAPPINGS['_COMMON'] || {};
    const form = document.getElementById('doc-form');

    // Helper to find data case-insensitively
    const getDataValue = (keys) => {
        if (!Array.isArray(keys)) keys = [keys];
        for (const k of keys) {
            // Find key in mergedData ignoring case
            const dataKey = Object.keys(mergedData).find(dk => dk.toUpperCase() === k.toUpperCase());
            if (dataKey && mergedData[dataKey]) return mergedData[dataKey];
        }
        return null;
    };

    // Loop through form fields and fill them
    const schema = DOC_SCHEMAS[docId];
    if (!schema) return;

    let filledCount = 0;
    schema.fields.forEach(field => {
        // Skip reference_id itself to avoid loops
        if (field.key === 'reference_id') return;

        const input = form.elements[field.key];
        if (!input) return;

        // Check specific doc mapping, then fallback to common mapping
        const sourceKeys = mapping[field.key] || commonMapping[field.key];
        
        if (sourceKeys) {
            const val = getDataValue(sourceKeys);
            if (val) {
                // Handle different input types
                if (input.type === 'date' && val) {
                    // Try to format date if needed, otherwise just set it
                    input.value = val.split('T')[0]; // Simple ISO fix if needed
                } else {
                    input.value = val;
                }
                
                // Visual flash effect for filled fields
                input.style.backgroundColor = "#f0fdf4"; // Light green
                setTimeout(() => input.style.backgroundColor = "", 1000);
                filledCount++;
                
                // Trigger API population for pincode fields
                if (field.api_trigger && (field.key.includes('pincode') || field.key.includes('zipcode'))) {
                    // Trigger the API population
                    input.dispatchEvent(new Event('input'));
                }
            }
        }
    });
    
    console.log(`Auto-filled ${filledCount} fields for ${docId}`);
};

// ============================================================================
// EXPOSE FUNCTIONS GLOBALLY FOR HTML ONCLICK HANDLERS
// ============================================================================
window.addDocItemRow = addDocItemRow;
window.addNonDGRow = addNonDGRow;
window.addNegRow = addNegRow;
window.addMCDRow = addMCDRow;
window.addPackingRow = addPackingRow;
window.handleGenerate = handleGenerate;
window.handleBlankPrint = handleBlankPrint;
window.handleDownloadPDF = handleDownloadPDF;
window.handleDownloadDOCX = handleDownloadDOCX;
window.showDocInfo = showDocInfo;
window.saveLocalDraft = saveLocalDraft;
window.saveCloudDraft = saveCloudDraft;
window.loadLocalDraft = loadLocalDraft;
window.handleImportData = handleImportData;
window.togglePreview = togglePreview;
window.renderDecisionGuide = renderDecisionGuide;
window.initDocCenter = initDocCenter;
window.renderSavedDocumentsView = renderSavedDocumentsView;
window.deleteSavedDocument = deleteSavedDocument;
window.copySavedDocument = copySavedDocument;
window.generatePrintView = generatePrintView;
window.selectDoc = selectDoc;
window.toggleSavedDocs = toggleSavedDocs;
window.validateFieldRealTime = validateFieldRealTime;
window.toggleValidation = toggleValidation;

// Initialize the document center
function initDocCenter() {
    renderDecisionGuide();
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initDocCenter();
    
    // Setup document click handlers
    document.addEventListener('click', (e) => {
        if (e.target.closest('.doc-link')) {
            const link = e.target.closest('.doc-link');
            const docCode = link.dataset.docCode;
            const docTitle = link.dataset.docTitle;
            const docDesc = link.dataset.docDesc;
            
            if (docCode) {
                selectDoc(link, docCode, docTitle, docDesc);
            }
        }
    });
    
    // Setup back button for mobile
    const backBtn = document.getElementById('backToListBtn');
    if (backBtn) {
        backBtn.addEventListener('click', showListView);
    }
});