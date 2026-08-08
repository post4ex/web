/**
 * updatestatus.js — Self-creating UI Modal for Updating Shipment Status.
 * Color schema and design architecture matched with GENIE_WEB UI standards.
 * Features dependent Sub-Status dropdowns, Concerned Person contact capture (in-box placeholders only),
 * To-Pay/COD Payment mode capture (only shown for COD/To-Pay shipments), Weekly Service Area Next Attempt Day,
 * and structured remarks logging.
 */

(function () {
    let currentReference = '';
    let currentShipmentRecord = null;

    const SUBSTATUS_OPTIONS = {
        'In Transit': [
            'Arrived at Hub',
            'Departed Hub',
            'Air Cargo Dispatched',
            'Arrived at Destination Hub',
            'Transit Delay'
        ],
        'Out for Delivery': [
            'Loaded on Delivery Vehicle',
            'Out for Delivery (Attempt 1)',
            'Out for Delivery (Re-attempt)',
            'OTP Verification Pending'
        ],
        'Delivered': [
            'Delivered to Recipient',
            'Delivered — Signed',
            'Delivered — Signature & Stamp',
            'Delivered — OTP Verified',
            'Delivered — E-Signature Captured',
            'Delivered to Security / Neighbor',
            'Digital POD Uploaded'
        ],
        'Delivery Exception': [
            'No Service Area',
            'Out of Delivery Area (ODA)',
            'Weekly Service Area',
            'Weekly Coloading Area',
            'Customer has to Collect from Office',
            'Customer informed to Collect from office',
            'Informed customer to collect from office',
            'COD Payment Not Ready',
            'COD Amount Dispute',
            'COD / Cash Refused by Recipient',
            'To-Pay Freight Charges Refused',
            'To-Pay Payment Not Ready',
            'Customer Unavailable',
            'Phone Unreachable',
            'Call Not Picked Up',
            'Invalid Phone Number',
            'Consignee Shifted Address',
            'Premises Closed',
            'Address Incomplete',
            'Address Untraceable',
            'Incorrect Pincode',
            'Gate / Security Entry Denied',
            'Delivery OTP Not Shared',
            'Refused by Recipient',
            'Order Cancelled by Customer',
            'Refused — Outer Package Damaged',
            'Refused — Seal Tampered / Opened',
            'Refused — Wrong Product Expected',
            'Climate Exception',
            'Heavy Rain / Monsoon Waterlogging',
            'Time Over / Window Expired',
            'Lift / Elevator Unavailable',
            'Road Damaged',
            'Road Sinkhole / Cave-In',
            'Severe Traffic Gridlock',
            'E-Way Bill Expired in Transit',
            'E-Way Bill / Invoice Mismatch',
            'State Entry Tax / Octroi Hold',
            'Customs Inspection Hold',
            'Delivery Vehicle Breakdown',
            'Cargo Damaged in Transit'
        ],
        'RTO Initiated': [
            'RTO — Max Delivery Attempts Failed',
            'RTO — Customer Refused Receipt',
            'RTO — Unresolvable Address',
            'RTO — Recall Requested by Shipper',
            'RTO — Damaged Beyond Delivery',
            'RTO Initiated',
            'RTO In Transit',
            'Arrived at Origin Hub',
            'RTO Out for Return Delivery',
            'RTO Delivered to Shipper'
        ],
        'Order Booked': [
            'Manifest Generated',
            'AWB Assigned',
            'Space Confirmed',
            'Awaiting Handover to Hub'
        ],
        'Order Pickup': [
            'Pickup Scheduled',
            'En Route to Pickup',
            'Pickup Rescheduled',
            'Pickup Attempted (Failed)',
            'Picked Up / Received'
        ]
    };

    function isCodOrTopayShipment(ref, shipData) {
        if (shipData) {
            const str = JSON.stringify(shipData).toUpperCase();
            if (str.includes('"COD"') || str.includes('"C.O.D"') || str.includes('TOPAY') || str.includes('TO PAY') || str.includes('TO-PAY')) return true;
            if (parseFloat(shipData.COD_AMOUNT || shipData.cod_amount || shipData.COD || 0) > 0) return true;
        }
        if (window._lastTrackingResult && window._lastTrackingResult.shipment) {
            const str = JSON.stringify(window._lastTrackingResult.shipment).toUpperCase();
            if (str.includes('"COD"') || str.includes('"C.O.D"') || str.includes('TOPAY') || str.includes('TO PAY') || str.includes('TO-PAY')) return true;
        }
        if (Array.isArray(window.ordersData)) {
            const match = window.ordersData.find(o => o.REFERENCE === ref || o.AWB_NUMBER === ref || o.AWB === ref);
            if (match) {
                const str = JSON.stringify(match).toUpperCase();
                if (str.includes('"COD"') || str.includes('"C.O.D"') || str.includes('TOPAY') || str.includes('TO PAY') || str.includes('TO-PAY')) return true;
                if (parseFloat(match.COD_AMOUNT || match.cod_amount || match.COD || 0) > 0) return true;
            }
        }
        if (Array.isArray(window.shipmentsData)) {
            const match = window.shipmentsData.find(s => s.REFERENCE === ref || s.AWB === ref);
            if (match) {
                const str = JSON.stringify(match).toUpperCase();
                if (str.includes('"COD"') || str.includes('"C.O.D"') || str.includes('TOPAY') || str.includes('TO PAY') || str.includes('TO-PAY')) return true;
            }
        }
        return false;
    }

    function updateSubStatusOptions(selectedPrimary, selectedSub = '') {
        const subSelect = document.getElementById('usm-substatus-select');
        if (!subSelect) return;

        const options = SUBSTATUS_OPTIONS[selectedPrimary] || [];
        subSelect.innerHTML = '<option value="" disabled selected>-- Select Sub-Status Reason (Required) --</option>' +
            options.map(opt => `<option value="${opt}">${opt}</option>`).join('');

        if (selectedSub) {
            subSelect.value = selectedSub;
        }

        UpdateStatusModal.onSubStatusChange(subSelect.value);
    }

    function injectModalHTML() {
        if (document.getElementById('updateStatusModal')) return;

        const modalHTML = `
        <div id="updateStatusModal" class="fixed inset-0 z-50 hidden bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-md overflow-hidden transform transition-all">
                <!-- Modal Header -->
                <div class="flex justify-between items-center px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <div class="flex items-center gap-2">
                        <h3 class="font-bold text-gray-800 text-sm sm:text-base">Update Shipment Status</h3>
                        <span class="text-xs font-mono text-gray-500 bg-gray-200/70 px-2 py-0.5 rounded" id="usm-ref-display">REF: ---</span>
                    </div>
                    <button type="button" onclick="UpdateStatusModal.close()" class="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-100 transition-colors" title="Close">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                <!-- Modal Body -->
                <form id="updateStatusForm" onsubmit="UpdateStatusModal.submit(event)" class="p-4 sm:p-5 space-y-3.5 max-h-[85vh] overflow-y-auto">
                    <!-- Primary Status Select -->
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Primary Status <span class="text-red-500">*</span></label>
                        <select id="usm-status-select" required onchange="UpdateStatusModal.onPrimaryChange(this.value)" class="w-full text-sm bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors outline-none">
                            <option value="In Transit">In Transit</option>
                            <option value="Out for Delivery">Out for Delivery</option>
                            <option value="Delivered">Delivered</option>
                            <option value="Delivery Exception">Delivery Exception</option>
                            <option value="RTO Initiated">RTO Initiated</option>
                            <option value="Order Booked">Order Booked</option>
                            <option value="Order Pickup">Order Pickup</option>
                        </select>
                    </div>

                    <!-- Sub-Status Select (Dependent & Required) -->
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Sub-Status Reason <span class="text-red-500">*</span></label>
                        <select id="usm-substatus-select" required onchange="UpdateStatusModal.onSubStatusChange(this.value)" class="w-full text-sm bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors outline-none">
                            <option value="" disabled selected>-- Select Sub-Status Reason (Required) --</option>
                        </select>
                    </div>

                    <!-- Concerned Person Contact Info (No headers — in-box placeholders only) -->
                    <div id="usm-person-container" class="hidden p-3 bg-purple-50/70 border border-purple-200 rounded-md space-y-2">
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <input type="text" id="usm-person-name" placeholder="Person Name (Optional)" class="w-full text-xs bg-white border border-gray-300 rounded px-2.5 py-1.5 text-gray-800 focus:ring-2 focus:ring-purple-500 outline-none" />
                            </div>
                            <div>
                                <input type="tel" id="usm-person-phone" placeholder="Phone Number (Optional)" class="w-full text-xs bg-white border border-gray-300 rounded px-2.5 py-1.5 text-gray-800 focus:ring-2 focus:ring-purple-500 outline-none" />
                            </div>
                        </div>
                        <div>
                            <select id="usm-person-relation" class="w-full text-xs bg-white border border-gray-300 rounded px-2.5 py-1.5 text-gray-800 focus:ring-2 focus:ring-purple-500 outline-none">
                                <option value="">-- Select Relation / Role (Optional) --</option>
                                <option value="Self">Self (Consignee)</option>
                                <option value="Family / Relative">Family / Relative</option>
                                <option value="Brother / Sister">Brother / Sister</option>
                                <option value="Parent / Spouse">Parent / Spouse</option>
                                <option value="Security Guard">Security Guard</option>
                                <option value="Receptionist">Receptionist</option>
                                <option value="Office Staff / Manager">Office Staff / Manager</option>
                                <option value="Colleague">Colleague</option>
                                <option value="Neighbor">Neighbor</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                    </div>
                    <!-- Next Attempt Delivery Day (Visible for Weekly Service Area / Coloading) -->
                    <div id="usm-attempt-day-container" class="hidden">
                        <select id="usm-attempt-day-select" class="w-full text-xs bg-amber-50 border border-amber-300 rounded px-2.5 py-1.5 text-gray-800 focus:ring-2 focus:ring-amber-500 outline-none">
                            <option value="" disabled selected>-- Select Next Delivery Attempt Day (Required) --</option>
                            <option value="Monday">Monday</option>
                            <option value="Tuesday">Tuesday</option>
                            <option value="Wednesday">Wednesday</option>
                            <option value="Thursday">Thursday</option>
                            <option value="Friday">Friday</option>
                            <option value="Saturday">Saturday</option>
                            <option value="Sunday">Sunday</option>
                        </select>
                    </div>

                    <!-- Payment Collection (Only shown for COD / To-Pay shipments when Delivered) -->
                    <div id="usm-payment-container" class="hidden p-3 bg-blue-50/70 border border-blue-200 rounded-md space-y-2">
                        <div>
                            <select id="usm-paymode-select" onchange="UpdateStatusModal.onPayModeChange(this.value)" class="w-full text-xs bg-white border border-gray-300 rounded px-2.5 py-1.5 text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">-- Select Payment Method (COD / To-Pay) --</option>
                                <option value="Cash">Cash</option>
                                <option value="UPI - Self">UPI - Self</option>
                                <option value="UPI - Company">UPI - Company</option>
                                <option value="Cheque">Cheque</option>
                                <option value="UTR">UTR / Online Transfer</option>
                            </select>
                        </div>
                        <div id="usm-utr-container" class="hidden">
                            <input type="text" id="usm-utr-input" placeholder="UTR / Transaction Ref / Cheque No. (Required)" class="w-full text-xs bg-white border border-gray-300 rounded px-2.5 py-1.5 text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                    </div>

                    <!-- Custom Remark -->
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Custom Remark <span class="text-gray-400 font-normal normal-case">(Optional)</span></label>
                        <input type="text" id="usm-remark-input" placeholder="e.g. Received by reception / Next attempt scheduled" class="w-full text-sm bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors outline-none" />
                    </div>

                    <!-- Event Time (Date-Time Picker) -->
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Event Date & Time <span class="text-gray-400 font-normal normal-case">(Optional)</span></label>
                        <input type="datetime-local" id="usm-datetime-input" class="w-full text-sm bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors outline-none" />
                        <p class="text-[11px] text-gray-400 mt-1">Defaults to current time if left empty.</p>
                    </div>

                    <!-- Error Alert -->
                    <div id="usm-error-msg" class="hidden text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-md"></div>

                    <!-- Actions -->
                    <div class="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                        <button type="button" onclick="UpdateStatusModal.close()" class="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">
                            Cancel
                        </button>
                        <button type="submit" id="usm-submit-btn" class="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-md shadow-sm transition-colors flex items-center gap-1.5">
                            <span id="usm-btn-text">Save Status</span>
                            <svg id="usm-btn-spinner" class="hidden w-3.5 h-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </button>
                    </div>
                </form>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    window.UpdateStatusModal = {
        onPrimaryChange: function (primaryVal) {
            updateSubStatusOptions(primaryVal);
            const payContainer = document.getElementById('usm-payment-container');
            const personContainer = document.getElementById('usm-person-container');

            if (payContainer) {
                const isCodTopay = isCodOrTopayShipment(currentReference, currentShipmentRecord);
                if (primaryVal === 'Delivered' && isCodTopay) {
                    payContainer.classList.remove('hidden');
                } else {
                    payContainer.classList.add('hidden');
                    const paySelect = document.getElementById('usm-paymode-select');
                    if (paySelect) paySelect.value = '';
                    const utrCont = document.getElementById('usm-utr-container');
                    if (utrCont) utrCont.classList.add('hidden');
                }
            }

            if (personContainer) {
                if (primaryVal === 'Delivered' || primaryVal === 'Delivery Exception') {
                    personContainer.classList.remove('hidden');
                } else {
                    personContainer.classList.add('hidden');
                    const pName = document.getElementById('usm-person-name');
                    const pPhone = document.getElementById('usm-person-phone');
                    const pRel = document.getElementById('usm-person-relation');
                    if (pName) pName.value = '';
                    if (pPhone) pPhone.value = '';
                    if (pRel) pRel.value = '';
                }
            }
        },

        onSubStatusChange: function (subVal) {
            const dayContainer = document.getElementById('usm-attempt-day-container');
            if (dayContainer) {
                if (subVal === 'Weekly Service Area' || subVal === 'Weekly Coloading Area') {
                    dayContainer.classList.remove('hidden');
                } else {
                    dayContainer.classList.add('hidden');
                    const daySel = document.getElementById('usm-attempt-day-select');
                    if (daySel) daySel.value = '';
                }
            }
        },

        onPayModeChange: function (payVal) {
            const utrContainer = document.getElementById('usm-utr-container');
            if (utrContainer) {
                if (['UPI - Self', 'UPI - Company', 'Cheque', 'UTR'].includes(payVal)) {
                    utrContainer.classList.remove('hidden');
                } else {
                    utrContainer.classList.add('hidden');
                    const utrInp = document.getElementById('usm-utr-input');
                    if (utrInp) utrInp.value = '';
                }
            }
        },

        open: function (reference, currentStatus = '', currentRemark = '', shipmentData = null) {
            injectModalHTML();
            currentReference = reference || '';
            currentShipmentRecord = shipmentData || null;

            const modal = document.getElementById('updateStatusModal');
            const refDisplay = document.getElementById('usm-ref-display');
            const statusSelect = document.getElementById('usm-status-select');
            const remarkInput = document.getElementById('usm-remark-input');
            const datetimeInput = document.getElementById('usm-datetime-input');
            const errorMsg = document.getElementById('usm-error-msg');

            if (!modal) return;

            refDisplay.textContent = `REF: ${currentReference}`;
            errorMsg.classList.add('hidden');
            errorMsg.textContent = '';

            // Role check: CLIENT role can ONLY update status to Delivered; staff/above can update all active statuses
            const userRole = (localStorage.getItem('role') || sessionStorage.getItem('role') || (window.currentUser && window.currentUser.role) || '').toUpperCase();
            if (userRole === 'CLIENT') {
                statusSelect.innerHTML = '<option value="Delivered">Delivered</option>';
            } else {
                statusSelect.innerHTML = `
                    <option value="In Transit">In Transit</option>
                    <option value="Out for Delivery">Out for Delivery</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Delivery Exception">Delivery Exception</option>
                    <option value="RTO Initiated">RTO Initiated</option>
                    <option value="Order Booked">Order Booked</option>
                    <option value="Order Pickup">Order Pickup</option>
                `;
            }

            let matchedPrimary = statusSelect.options[0] ? statusSelect.options[0].value : 'Delivered';
            if (currentStatus) {
                const matchedOption = Array.from(statusSelect.options).find(opt => 
                    opt.value.toLowerCase() === currentStatus.toLowerCase()
                );
                if (matchedOption) {
                    matchedPrimary = matchedOption.value;
                    statusSelect.value = matchedPrimary;
                }
            }

            updateSubStatusOptions(matchedPrimary);
            UpdateStatusModal.onPrimaryChange(matchedPrimary);

            remarkInput.value = currentRemark || '';

            // Set datetime picker using formatIST helpers if present
            if (typeof fmtDate === 'function') {
                const now = new Date();
                datetimeInput.value = `${fmtDate(now, 'input')}T${fmtDate(now, 'time')}`;
            } else {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                datetimeInput.value = now.toISOString().slice(0, 16);
            }

            modal.classList.remove('hidden');
        },

        close: function () {
            const modal = document.getElementById('updateStatusModal');
            if (modal) modal.classList.add('hidden');
        },

        submit: async function (event) {
            if (event) event.preventDefault();

            const statusSelect = document.getElementById('usm-status-select');
            const substatusSelect = document.getElementById('usm-substatus-select');
            const daySelect = document.getElementById('usm-attempt-day-select');
            const paymodeSelect = document.getElementById('usm-paymode-select');
            const utrInput = document.getElementById('usm-utr-input');
            const personNameInput = document.getElementById('usm-person-name');
            const personPhoneInput = document.getElementById('usm-person-phone');
            const personRelationSelect = document.getElementById('usm-person-relation');
            const remarkInput = document.getElementById('usm-remark-input');
            const datetimeInput = document.getElementById('usm-datetime-input');
            const submitBtn = document.getElementById('usm-submit-btn');
            const btnText = document.getElementById('usm-btn-text');
            const btnSpinner = document.getElementById('usm-btn-spinner');
            const errorMsg = document.getElementById('usm-error-msg');

            const statusRaw = statusSelect.value;
            const subStatus = substatusSelect ? substatusSelect.value.trim() : '';
            const attemptDay = daySelect ? daySelect.value : '';
            const payMode = paymodeSelect ? paymodeSelect.value : '';
            const utrNo = utrInput ? utrInput.value.trim() : '';

            const personName = personNameInput ? personNameInput.value.trim() : '';
            const personPhone = personPhoneInput ? personPhoneInput.value.trim() : '';
            const personRelation = personRelationSelect ? personRelationSelect.value : '';
            const customRemark = remarkInput.value.trim();

            if (!subStatus) {
                errorMsg.textContent = 'Please select a Sub-Status Reason.';
                errorMsg.classList.remove('hidden');
                return;
            }

            if (subStatus === 'Weekly Service Area' && !attemptDay) {
                errorMsg.textContent = 'Please select the Next Delivery Attempt Day for Weekly Service Area.';
                errorMsg.classList.remove('hidden');
                return;
            }

            if (['UPI - Self', 'UPI - Company', 'Cheque', 'UTR'].includes(payMode) && !utrNo) {
                errorMsg.textContent = `Please enter the UTR / Transaction Ref / Cheque number for ${payMode}.`;
                errorMsg.classList.remove('hidden');
                return;
            }

            let extraParts = [];
            if (attemptDay) {
                extraParts.push(`Next Attempt Day: ${attemptDay}`);
            }

            if (personName || personPhone || personRelation) {
                let pTokens = [];
                if (personName) pTokens.push(personName);
                if (personRelation) pTokens.push(`Role: ${personRelation}`);
                if (personPhone) pTokens.push(`Ph: ${personPhone}`);
                
                const label = (statusRaw === 'Delivered') ? 'Recipient' : 'Contact Person';
                extraParts.push(`${label}: ${pTokens.join(' - ')}`);
            }

            if (payMode) {
                let payStr = `Payment: ${payMode}`;
                if (utrNo) {
                    payStr += ` (Ref/UTR: ${utrNo})`;
                }
                extraParts.push(payStr);
            }

            let remarkTokens = [subStatus];
            if (extraParts.length > 0) {
                remarkTokens.push(extraParts.join(' | '));
            }
            if (customRemark) {
                remarkTokens.push(customRemark);
            }
            const finalRemark = remarkTokens.join(' - ');

            let statusTimeMs = null;
            if (datetimeInput.value) {
                const dt = typeof parseDate === 'function' ? parseDate(datetimeInput.value) : new Date(datetimeInput.value);
                if (dt && !isNaN(dt.getTime())) {
                    statusTimeMs = dt.getTime();
                }
            }

            submitBtn.disabled = true;
            btnText.textContent = 'Updating...';
            btnSpinner.classList.remove('hidden');
            errorMsg.classList.add('hidden');

            try {
                const payload = {
                    reference: currentReference,
                    status_raw: statusRaw,
                    status_remark: finalRemark
                };

                if (statusTimeMs) {
                    payload.status_time = statusTimeMs;
                }

                let data;
                if (typeof callApi === 'function') {
                    data = await callApi('/api/updateShipmentStatus', payload, 'POST');
                } else {
                    const baseUrl = (window.CONSTANTS && window.CONSTANTS.OPERATIONS_URL) ? window.CONSTANTS.OPERATIONS_URL : '';
                    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
                    const res = await fetch(`${baseUrl}/api/updateShipmentStatus`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        },
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.detail || errData.message || 'Failed to update shipment status');
                    }
                    data = await res.json();
                }

                if (typeof showNotification === 'function') {
                    showNotification('Shipment status updated successfully!', 'success', 2500);
                }

                UpdateStatusModal.close();

                if (typeof window.onShipmentStatusUpdated === 'function') {
                    window.onShipmentStatusUpdated(currentReference, statusRaw);
                } else if (typeof window.loadFromIndexedDB === 'function') {
                    window.loadFromIndexedDB();
                }

            } catch (err) {
                console.error('[UpdateStatusModal error]', err);
                errorMsg.textContent = err.message || 'An error occurred while updating status.';
                errorMsg.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
                btnText.textContent = 'Save Status';
                btnSpinner.classList.add('hidden');
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectModalHTML);
    } else {
        injectModalHTML();
    }
})();
