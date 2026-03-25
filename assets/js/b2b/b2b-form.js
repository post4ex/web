// B2B Form Management
const B2BForm = {
    showCustomerView(customer) {
        B2BUI.ui.customerViewContainer.classList.remove('hidden');
        B2BUI.ui.customerEditContainer.classList.add('hidden');
        
        const customerRates = Object.values(B2BData.allRates).filter(rate => rate.CODE === customer.CODE);
        
        let html = `
            <div class="space-y-6">
                <div class="border-b pb-4">
                    <h3 class="text-md font-semibold text-indigo-600 mb-3">Basic Information</h3>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><span class="font-semibold text-gray-600">Code:</span> <span class="text-gray-900">${customer.CODE || '-'}</span></div>
                        <div class="col-span-3"><span class="font-semibold text-gray-600">Name:</span> <span class="text-gray-900">${customer.B2B_NAME || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">Branch:</span> <span class="text-gray-900">${customer.BRANCH || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">Type:</span> <span class="text-gray-900">${customer.B2B_TYPE || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">Status:</span> <span class="px-2 py-1 rounded text-xs font-semibold ${customer.STATUS === 'ACTIVE' ? 'bg-green-100 text-green-800' : customer.STATUS === 'BLOCKED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}">${customer.STATUS || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">Rate List:</span> <span class="text-gray-900">${customer.RATE_LIST || '-'}</span></div>
                    </div>
                </div>
                
                <div class="border-b pb-4">
                    <h3 class="text-md font-semibold text-indigo-600 mb-3">Contact Details</h3>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div><span class="font-semibold text-gray-600">Mobile:</span> <span class="text-gray-900">${customer.MOBILE_NUMBER || '-'}</span></div>
                        <div class="col-span-2"><span class="font-semibold text-gray-600">Email:</span> <span class="text-gray-900">${customer.EMAIL || '-'}</span></div>
                        <div class="col-span-3"><span class="font-semibold text-gray-600">Address:</span> <span class="text-gray-900">${customer.B2B_ADDRESS || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">Landmark:</span> <span class="text-gray-900">${customer.B2B_LANDMARK || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">City:</span> <span class="text-gray-900">${customer.B2B_CITY || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">State:</span> <span class="text-gray-900">${customer.B2B_STATE || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">Pincode:</span> <span class="text-gray-900">${customer.B2B_PINCODE || '-'}</span></div>
                        <div class="col-span-2"><span class="font-semibold text-gray-600">GST/PAN/Adhar:</span> <span class="text-gray-900">${customer.ID_GST_PAN_ADHAR || '-'}</span></div>
                    </div>
                </div>
                
                <div class="border-b pb-4">
                    <h3 class="text-md font-semibold text-indigo-600 mb-3">Charges & Settings</h3>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><span class="font-semibold text-gray-600">Clearing Charge:</span> <span class="text-gray-900">${customer.CLEARING_CHG || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">Weight Change:</span> <span class="text-gray-900">${customer.WEIGHT_CHANGE || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">% TO-PAY:</span> <span class="text-gray-900">${customer['%_TOPAY_IF'] || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">% COD:</span> <span class="text-gray-900">${customer['%_COD_IF'] || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">% FOV:</span> <span class="text-gray-900">${customer['%_FOV_IF'] || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">E-Way Charge:</span> <span class="text-gray-900">${customer.EWAY_IF || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">AWB Charge:</span> <span class="text-gray-900">${customer.AWB_CHARGES || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">Packing Charge:</span> <span class="text-gray-900">${customer.PACKING_CHARGES || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">Fuel Charge %:</span> <span class="text-gray-900">${customer.FUEL_CHARGES || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">Dev. Charge %:</span> <span class="text-gray-900">${customer.DEV_CHARGES || '-'}</span></div>
                        <div><span class="font-semibold text-gray-600">GST Included:</span> <span class="text-gray-900">${customer.GST_INC === 'Y' ? 'Yes' : 'No'}</span></div>
                        <div><span class="font-semibold text-gray-600">Bill Cycle:</span> <span class="text-gray-900">${customer.BILL_CYCLE || '-'}</span></div>
                    </div>
                </div>
                
                <div>
                    <h3 class="text-md font-semibold text-indigo-600 mb-3">Rate List (${customerRates.length} rates)</h3>
        `;
        
        if (customerRates.length > 0) {
            html += '<div class="overflow-x-auto"><table class="w-full text-xs border-collapse"><thead><tr class="bg-gray-100">';
            html += '<th class="border p-2">Mode</th><th class="border p-2">Weight</th>';
            for (let i = 1; i <= 14; i++) html += `<th class="border p-2">Z${i}</th>`;
            html += '</tr></thead><tbody>';
            
            customerRates.forEach(rate => {
                html += `<tr><td class="border p-2">${rate.MODE || '-'}</td><td class="border p-2">${rate.WEIGHT || '-'}</td>`;
                for (let i = 1; i <= 14; i++) html += `<td class="border p-2 text-right">${rate[`Z${i}`] || '-'}</td>`;
                html += '</tr>';
            });
            html += '</tbody></table></div>';
        } else {
            html += '<p class="text-gray-500 text-center py-4">No rates defined.</p>';
        }
        
        html += '</div></div>';
        B2BUI.ui.customerViewContent.innerHTML = html;
    },
    
    populateFormForEdit(code) {
        const customer = B2BData.allCustomers[code];
        if (!customer) {
            B2BUI.showResponseMessage(`Customer with code ${code} not found.`, 'error');
            return;
        }
        this.resetFormsAndTabs();

        B2BData.currentCustomerCode = code;
        B2BData.isUpdateMode = true;

        this.showCustomerView(customer);
        B2BUI.showFormView();
    },
    
    switchToEditMode() {
        const customer = B2BData.allCustomers[B2BData.currentCustomerCode];
        if (!customer) return;
        
        B2BUI.ui.customerViewContainer.classList.add('hidden');
        B2BUI.ui.customerEditContainer.classList.remove('hidden');

        for (const key in customer) {
            const input = B2BUI.ui.customerForm.querySelector(`[name="${key}"]`);
            if (input) {
                if (key === 'GST_INC') {
                    B2BUI.ui.gstIncCheck.checked = (customer[key] === 'Y');
                    B2BUI.ui.gstIncHidden.value = customer[key] || 'N';
                }
                else if ((key === 'TIMESTAMP' || key === 'TIME_STAMP') && customer[key]) {
                    input.value = fmtDate(customer[key], 'full');
                }
                else {
                    input.value = customer[key] || '';
                }
            }
        }

        B2BUI.ui.codeInput.value = B2BData.currentCustomerCode;
        B2BUI.ui.codeInput.readOnly = true;
        B2BUI.ui.codeInput.classList.add('readonly-input');
        B2BUI.ui.formTitle.textContent = `Edit Customer: ${B2BData.currentCustomerCode}`;
        B2BUI.ui.customerButtonText.textContent = `Update Customer`;
        B2BUI.ui.deleteCustomerButton.classList.remove('hidden');
        B2BUI.ui.tabRateList.disabled = false;
        B2BUI.ui.rateListCustomerCodeSpan.textContent = B2BData.currentCustomerCode;

        B2BUI.showFormView();
        B2BUI.switchTab('details');
    },

    resetFormsAndTabs() {
        B2BUI.ui.customerForm.reset();
        B2BUI.ui.rateForm.reset();
        B2BUI.ui.rateTableContainer.innerHTML = `<p id="rateLoader" class="text-center p-4 text-gray-500">Select or save a customer to view/edit rates.</p>`;
        B2BUI.ui.modeCheckboxes.innerHTML = '';
        B2BUI.ui.customerViewContainer.classList.add('hidden');
        B2BUI.ui.customerEditContainer.classList.remove('hidden');

        B2BData.currentCustomerCode = null;
        B2BData.isUpdateMode = false;

        B2BUI.ui.codeInput.readOnly = false;
        B2BUI.ui.codeInput.classList.remove('readonly-input');
        B2BUI.ui.formTitle.textContent = 'Create New Customer';
        B2BUI.ui.customerButtonText.textContent = 'Submit New Customer';
        B2BUI.ui.deleteCustomerButton.classList.add('hidden');
        B2BUI.ui.tabRateList.disabled = true;
        B2BUI.ui.responseMessage.classList.add('hidden');
        B2BUI.ui.gstIncCheck.checked = false;
        B2BUI.ui.gstIncHidden.value = 'N';
        B2BUI.ui.rateListCustomerCodeSpan.textContent = '';

        B2BUI.switchTab('details');
    },

    handleCustomerSubmit(e) {
        e.preventDefault();
        
        const codeInput = B2BUI.ui.customerForm.querySelector('[name="CODE"]');
        if (codeInput && codeInput.value) {
            codeInput.value = codeInput.value.toUpperCase();
        }
        
        const branchInput = B2BUI.ui.customerForm.querySelector('[name="BRANCH"]');
        if (branchInput && branchInput.value) {
            branchInput.value = branchInput.value.toUpperCase();
        }
        
        B2B_CONSTANTS.textFieldsToUppercase.forEach(fieldName => {
            const input = B2BUI.ui.customerForm.querySelector(`[name="${fieldName}"]`);
            if (input && input.value) {
                input.value = input.value.toUpperCase();
            }
        });
        
        const formData = new FormData(B2BUI.ui.customerForm);
        const submitData = {};
        formData.forEach((value, key) => {
            if (B2B_CONSTANTS.percentFields.includes(key) && value !== '') {
                submitData[key] = parseFloat(value) / 100;
            } else {
                submitData[key] = value || '';
            }
        });
        
        B2BApi.handleRequest(
            'customer',
            'submit',
            submitData,
            B2BUI.ui.customerSpinner,
            B2BUI.ui.submitCustomerButton,
            B2BUI.ui.customerButtonText,
            (responseData) => {
                if (!B2BData.isUpdateMode && responseData && responseData.CODE) {
                    B2BData.currentCustomerCode = responseData.CODE;
                    B2BUI.ui.codeInput.value = B2BData.currentCustomerCode;
                    B2BUI.ui.codeInput.readOnly = true;
                    B2BUI.ui.codeInput.classList.add('readonly-input');
                    B2BUI.ui.formTitle.textContent = `Edit Customer: ${B2BData.currentCustomerCode}`;
                    B2BUI.ui.customerButtonText.textContent = `Update Customer`;
                    B2BUI.ui.deleteCustomerButton.classList.remove('hidden');
                    B2BUI.ui.tabRateList.disabled = false;
                    B2BUI.ui.rateListCustomerCodeSpan.textContent = B2BData.currentCustomerCode;
                    B2BData.isUpdateMode = true;
                } else if (B2BData.isUpdateMode && responseData && responseData.CODE) {
                    B2BData.currentCustomerCode = responseData.CODE;
                    B2BUI.ui.tabRateList.disabled = false;
                    B2BUI.ui.rateListCustomerCodeSpan.textContent = B2BData.currentCustomerCode;
                }
            }
        );
    }
};
