// B2B UI Management
const B2BUI = {
    ui: {},

    initializeElements() {
        this.ui = {
            customerListContainer: document.getElementById('customerListContainer'),
            customerFormContainer: document.getElementById('customerFormContainer'),
            customerViewContainer: document.getElementById('customerViewContainer'),
            customerEditContainer: document.getElementById('customerEditContainer'),
            customerViewContent: document.getElementById('customerViewContent'),
            contentCustomerDetails: document.getElementById('contentCustomerDetails'),
            contentRateList: document.getElementById('contentRateList'),
            rateTableContainer: document.getElementById('rateTableContainer'),
            customerForm: document.getElementById('customerForm'),
            rateForm: document.getElementById('rateForm'),
            customerLoader: document.getElementById('customerLoader'),
            rateLoader: document.getElementById('rateLoader'),
            customerList: document.getElementById('customerList'),
            searchCustomerInput: document.getElementById('searchCustomer'),
            newCustomerBtn: document.getElementById('newCustomerBtn'),
            backToListBtn: document.getElementById('backToListBtn'),
            formTitle: document.getElementById('formTitle'),
            codeInput: document.getElementById('code'),
            clientNameInput: document.getElementById('b2b_name'),
            gstIncCheck: document.getElementById('gst_inc_check'),
            gstIncHidden: document.getElementById('gst_inc'),
            tabCustomerDetails: document.getElementById('tabCustomerDetails'),
            tabRateList: document.getElementById('tabRateList'),
            rateListCustomerCodeSpan: document.getElementById('rateListCustomerCode'),
            submitCustomerButton: document.getElementById('submitCustomerButton'),
            customerButtonText: document.getElementById('customerButtonText'),
            customerSpinner: document.getElementById('customerSpinner'),
            deleteCustomerButton: document.getElementById('deleteCustomerButton'),
            setDefaultRatesBtn: document.getElementById('setDefaultRatesBtn'),
            modeCheckboxes: document.getElementById('modeCheckboxes'),
            printCustomerBtn: document.getElementById('printCustomerBtn'),
            emailCustomerBtn: document.getElementById('emailCustomerBtn'),
            editCustomerBtn: document.getElementById('editCustomerBtn'),
            softDeleteCustomerBtn: document.getElementById('softDeleteCustomerBtn'),
            sendOtpBtn: document.getElementById('sendOtpBtn'),
            deleteOtpInput: document.getElementById('deleteOtpInput'),
            submitRatesButton: document.getElementById('submitRatesButton'),
            ratesButtonText: document.getElementById('ratesButtonText'),
            ratesSpinner: document.getElementById('ratesSpinner'),
            deleteModal: document.getElementById('deleteModal'),
            customerToDeleteSpan: document.getElementById('customerToDelete'),
            cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
            confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
            deleteSpinner: document.getElementById('deleteSpinner'),
            responseMessage: document.getElementById('responseMessage')
        };
    },

    isMobileView() { 
        return window.innerWidth < 768; 
    },

    showFormView() {
        if (this.isMobileView()) {
            this.ui.customerListContainer.classList.add('hidden');
            this.ui.customerFormContainer.classList.remove('hidden', 'md:block');
            this.ui.customerFormContainer.classList.add('block');
        }
        this.ui.customerFormContainer.classList.remove('hidden');
    },

    showListView() {
        B2BForm.resetFormsAndTabs();
        if (this.isMobileView()) {
            this.ui.customerListContainer.classList.remove('hidden');
            this.ui.customerFormContainer.classList.add('hidden');
            this.ui.customerFormContainer.classList.remove('block');
        } else {
            this.ui.customerListContainer.classList.remove('hidden');
            this.ui.customerFormContainer.classList.remove('hidden');
        }
    },

    handleResize() {
        if (!this.isMobileView()) {
            this.ui.customerListContainer.classList.remove('hidden');
            this.ui.customerFormContainer.classList.remove('hidden');
            this.ui.customerFormContainer.classList.add('md:block');
        } else {
            if (!this.ui.customerFormContainer.classList.contains('hidden')) {
                this.ui.customerListContainer.classList.add('hidden');
                this.ui.customerFormContainer.classList.add('block');
                this.ui.customerFormContainer.classList.remove('md:block');
            } else {
                this.ui.customerListContainer.classList.remove('hidden');
                this.ui.customerFormContainer.classList.add('hidden');
                this.ui.customerFormContainer.classList.remove('block');
            }
        }
    },

    switchTab(activeTab) {
        const isDetailsActive = activeTab === 'details';
        this.ui.tabCustomerDetails.classList.toggle('active', isDetailsActive);
        this.ui.tabRateList.classList.toggle('active', !isDetailsActive);
        this.ui.contentCustomerDetails.classList.toggle('hidden', !isDetailsActive);
        this.ui.contentRateList.classList.toggle('hidden', isDetailsActive);

        if (!isDetailsActive && B2BData.currentCustomerCode && !this.ui.tabRateList.disabled) {
            B2BRates.generateRateForm(B2BData.currentCustomerCode);
        }
    },

    showResponseMessage(message, type, data = null) {
        let content = `<p class="font-semibold">${message}</p>`;
        this.ui.responseMessage.innerHTML = content;
        this.ui.responseMessage.className = `my-4 text-center p-3 rounded-lg text-sm ${type === 'success' ? 'bg-green-100 text-green-800' : type === 'error' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`;
        this.ui.responseMessage.classList.remove('hidden');
    }
};
