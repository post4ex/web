/**
 * updatestatus.js — Self-creating UI Modal for Updating Shipment Status.
 * Color schema and design architecture matched with GENIE_WEB UI standards.
 */

(function () {
    let currentReference = '';

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
                <form id="updateStatusForm" onsubmit="UpdateStatusModal.submit(event)" class="p-4 sm:p-5 space-y-4">
                    <!-- Status Select -->
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Status Activity <span class="text-red-500">*</span></label>
                        <select id="usm-status-select" required class="w-full text-sm bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors outline-none">
                            <option value="In Transit">In Transit</option>
                            <option value="Out for Delivery">Out for Delivery</option>
                            <option value="Delivered">Delivered</option>
                            <option value="Delivery Exception">Delivery Exception</option>
                            <option value="RTO Initiated">RTO Initiated</option>
                            <option value="Order Booked">Order Booked</option>
                            <option value="Order Pickup">Order Pickup</option>
                        </select>
                    </div>

                    <!-- Custom Remark -->
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Status Remark <span class="text-gray-400 font-normal normal-case">(Optional)</span></label>
                        <input type="text" id="usm-remark-input" placeholder="e.g. Arrived at hub / Consignee unavailable" class="w-full text-sm bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors outline-none" />
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
        open: function (reference, currentStatus = '', currentRemark = '') {
            injectModalHTML();
            currentReference = reference || '';

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

            if (currentStatus) {
                const matchedOption = Array.from(statusSelect.options).find(opt => 
                    opt.value.toLowerCase() === currentStatus.toLowerCase()
                );
                if (matchedOption) {
                    statusSelect.value = matchedOption.value;
                }
            }

            remarkInput.value = currentRemark || '';

            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            datetimeInput.value = now.toISOString().slice(0, 16);

            modal.classList.remove('hidden');
        },

        close: function () {
            const modal = document.getElementById('updateStatusModal');
            if (modal) modal.classList.add('hidden');
        },

        submit: async function (event) {
            if (event) event.preventDefault();

            const statusSelect = document.getElementById('usm-status-select');
            const remarkInput = document.getElementById('usm-remark-input');
            const datetimeInput = document.getElementById('usm-datetime-input');
            const submitBtn = document.getElementById('usm-submit-btn');
            const btnText = document.getElementById('usm-btn-text');
            const btnSpinner = document.getElementById('usm-btn-spinner');
            const errorMsg = document.getElementById('usm-error-msg');

            const statusRaw = statusSelect.value;
            const statusRemark = remarkInput.value.trim();

            let statusTimeMs = null;
            if (datetimeInput.value) {
                const dt = new Date(datetimeInput.value);
                if (!isNaN(dt.getTime())) {
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
                    status_remark: statusRemark
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
