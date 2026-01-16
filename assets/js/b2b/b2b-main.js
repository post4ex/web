// B2B Main Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements
    B2BUI.initializeElements();

    // Setup event listeners
    B2BUI.ui.searchCustomerInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = {};
        Object.keys(B2BData.allCustomers).forEach(key => {
            const c = B2BData.allCustomers[key];
            if (c.STATUS !== 'DELETED' &&
                ((c.B2B_NAME || '').toLowerCase().includes(searchTerm) ||
                (c.CODE || '').toLowerCase().includes(searchTerm))) {
                filtered[key] = c;
            }
        });
        B2BData.renderCustomerList(filtered);
    });

    B2BUI.ui.newCustomerBtn.addEventListener('click', () => {
        B2BForm.resetFormsAndTabs();
        B2BData.isUpdateMode = false;
        B2BUI.showFormView();
    });

    B2BUI.ui.backToListBtn.addEventListener('click', () => B2BUI.showListView());
    
    B2BUI.ui.editCustomerBtn.addEventListener('click', () => {
        if (!B2BData.currentCustomerCode) return;
        B2BForm.switchToEditMode();
    });
    
    B2BUI.ui.printCustomerBtn.addEventListener('click', () => {
        B2BUI.showResponseMessage('Print template coming soon', 'info');
    });
    
    B2BUI.ui.emailCustomerBtn.addEventListener('click', () => {
        B2BUI.showResponseMessage('Email template coming soon', 'info');
    });
    
    B2BUI.ui.softDeleteCustomerBtn.addEventListener('click', () => {
        if (!B2BData.currentCustomerCode) return;
        const customer = B2BData.allCustomers[B2BData.currentCustomerCode];
        const name = customer?.B2B_NAME || B2BData.currentCustomerCode;
        B2BUI.ui.customerToDeleteSpan.textContent = `${name} (${B2BData.currentCustomerCode})`;
        B2BUI.ui.deleteOtpInput.value = '';
        B2BUI.ui.deleteModal.classList.remove('hidden');
    });
    
    B2BUI.ui.sendOtpBtn.addEventListener('click', () => {
        if (!B2BData.currentCustomerCode) return;
        B2BApi.sendDeleteOtp(B2BData.currentCustomerCode);
    });

    B2BUI.ui.deleteCustomerButton.addEventListener('click', () => {
        if (!B2BData.currentCustomerCode) return;
        const name = B2BUI.ui.clientNameInput.value || B2BData.currentCustomerCode;
        B2BUI.ui.customerToDeleteSpan.textContent = `${name} (${B2BData.currentCustomerCode})`;
        B2BUI.ui.deleteModal.classList.remove('hidden');
    });

    B2BUI.ui.cancelDeleteBtn.addEventListener('click', () => {
        B2BUI.ui.deleteModal.classList.add('hidden');
    });

    B2BUI.ui.confirmDeleteBtn.addEventListener('click', () => {
        B2BApi.confirmDelete();
    });

    B2BUI.ui.gstIncCheck.addEventListener('change', () => {
        B2BUI.ui.gstIncHidden.value = B2BUI.ui.gstIncCheck.checked ? 'Y' : 'N';
    });

    B2BUI.ui.tabCustomerDetails.addEventListener('click', () => B2BUI.switchTab('details'));
    B2BUI.ui.tabRateList.addEventListener('click', () => {
        if (!B2BUI.ui.tabRateList.disabled) B2BUI.switchTab('rates');
    });

    B2BUI.ui.setDefaultRatesBtn.addEventListener('click', () => B2BRates.setDefaultRates());

    B2BUI.ui.customerForm.addEventListener('submit', (e) => B2BForm.handleCustomerSubmit(e));
    B2BUI.ui.rateForm.addEventListener('submit', (e) => B2BRates.handleRateSubmit(e));

    window.addEventListener('resize', () => B2BUI.handleResize());

    // Listen for data updates
    window.addEventListener('appDataLoaded', (e) => B2BData.handleDataLoaded(e));
    window.addEventListener('appDataRefreshed', (e) => B2BData.handleDataLoaded(e));

    // Initialize
    B2BForm.resetFormsAndTabs();
    B2BUI.handleResize();
    B2BData.loadFromIndexedDB();
});
