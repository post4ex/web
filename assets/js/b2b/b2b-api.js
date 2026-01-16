// B2B API Management
const B2BApi = {
    async handleRequest(type, action, dataOrForm, spinner, button, buttonTextSpan, successCallback, errorCallback) {
        let submitData;
        if (dataOrForm instanceof HTMLFormElement) {
            submitData = {};
            new FormData(dataOrForm).forEach((value, key) => { 
                submitData[key] = value || ''; 
            });
            console.log('[Customer] Form data collected:', submitData);
        } else {
            submitData = dataOrForm;
        }

        if(spinner) spinner.classList.remove('hidden');
        if(button) button.disabled = true;
        const originalButtonText = buttonTextSpan ? buttonTextSpan.textContent : '';
        if(buttonTextSpan) buttonTextSpan.textContent = 'Processing...';

        try {
            let apiAction, params;
            
            if (type === 'customer') {
                if (action === 'delete') {
                    apiAction = 'deleteB2B';
                    params = { code: submitData.CODE };
                } else {
                    apiAction = 'writeB2B';
                    params = { 
                        data: submitData, 
                        isUpdate: B2BData.isUpdateMode,
                        code: B2BData.currentCustomerCode 
                    };
                }
            } else if (type === 'ratelist') {
                if (action === 'delete') {
                    apiAction = 'deleteRateList';
                    params = { code: submitData.code, rateUIDs: submitData.rateUIDs };
                } else {
                    apiAction = 'writeRateList';
                    params = { 
                        code: submitData.code,
                        branch: submitData.branch,
                        rates: submitData.rates,
                        isUpdate: true
                    };
                }
            }
            
            console.log(`[Customer] Sending to API:`, { action: apiAction, params });
            
            const result = await window.callApi(apiAction, params);

            if (result.status === 'error') throw new Error(result.message);

            B2BUI.showResponseMessage(result.message || 'Operation successful.', 'success');

            if (window.verifyAndFetchAppData) {
                await window.verifyAndFetchAppData(true);
            }

            if (successCallback) successCallback(result.data);

        } catch (error) {
            B2BUI.showResponseMessage(error.message, 'error');
            if(errorCallback) errorCallback(error);
        } finally {
            if(spinner) spinner.classList.add('hidden');
            if(button) button.disabled = false;
            if(buttonTextSpan) buttonTextSpan.textContent = originalButtonText;
        }
    },

    async sendDeleteOtp(code) {
        try {
            B2BUI.ui.sendOtpBtn.disabled = true;
            B2BUI.ui.sendOtpBtn.textContent = 'Sending...';
            const result = await window.callApi('sendDeleteOtp', { code });
            if (result.status === 'success') {
                B2BUI.showResponseMessage('OTP sent to your email', 'success');
            } else {
                B2BUI.showResponseMessage(result.message || 'Failed to send OTP', 'error');
            }
        } catch (error) {
            B2BUI.showResponseMessage(error.message, 'error');
        } finally {
            B2BUI.ui.sendOtpBtn.disabled = false;
            B2BUI.ui.sendOtpBtn.textContent = 'Send OTP';
        }
    },

    confirmDelete() {
        if (!B2BData.currentCustomerCode) return;
        const otp = B2BUI.ui.deleteOtpInput.value.trim();
        if (!otp) {
            B2BUI.showResponseMessage('Please enter OTP', 'error');
            return;
        }
        this.handleRequest(
            'customer',
            'delete',
            { CODE: B2BData.currentCustomerCode, otp: otp },
            B2BUI.ui.deleteSpinner,
            B2BUI.ui.confirmDeleteBtn,
            null,
            () => {
                B2BUI.ui.deleteModal.classList.add('hidden');
                B2BUI.showListView();
            },
            () => {
                B2BUI.ui.deleteModal.classList.add('hidden');
            }
        );
    }
};
