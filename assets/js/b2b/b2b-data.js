// B2B Data Management
const B2BData = {
    allCustomers: {},
    allModes: [],
    allRates: {},
    currentCustomerCode: null,
    isUpdateMode: false,

    async loadFromIndexedDB() {
        console.log('[Customer] Starting loadFromIndexedDB...');
        
        let attempts = 0;
        while ((!window.appDB || !window.appDB.db) && attempts < 100) {
            console.log(`[Customer] Waiting for IndexedDB... attempt ${attempts + 1}`);
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.appDB || !window.appDB.db) {
            console.error('[Customer] IndexedDB not ready after 10 seconds');
            B2BUI.ui.customerLoader.textContent = 'Database not ready. Please refresh.';
            return;
        }
        
        console.log('[Customer] IndexedDB ready, calling getAppData...');
        try {
            const data = await window.getAppData();
            console.log('[Customer] getAppData returned:', data);
            if (data) {
                console.log('[Customer] Loaded from global IndexedDB:', data);
                this.handleDataLoaded({ detail: { data } });
            } else {
                console.warn('[Customer] No data returned from getAppData');
                B2BUI.ui.customerLoader.textContent = 'No data available.';
            }
        } catch (error) {
            console.error('[Customer] Error loading data:', error);
            B2BUI.ui.customerLoader.textContent = 'Error loading customer data.';
        }
    },

    handleDataLoaded(event) {
        const appData = event.detail.data;
        console.log('handleDataLoaded received appData:', appData);

        if (appData && appData.B2B) {
            this.allCustomers = appData.B2B;
            console.log('Found B2B data:', Object.keys(this.allCustomers).length, 'customers');
            this.renderCustomerList(this.allCustomers);
        } else {
            B2BUI.ui.customerLoader.textContent = 'No B2B customers found.';
        }

        if (appData && appData.MODE) {
            this.allModes = appData.MODE;
        }

        if (appData && appData.RATELIST) {
            this.allRates = appData.RATELIST;
            console.log('Found RATELIST data:', Object.keys(this.allRates).length, 'rates');
        } else {
            this.allRates = {};
        }

        if (this.currentCustomerCode && !B2BUI.ui.contentRateList.classList.contains('hidden')) {
            B2BRates.generateRateForm(this.currentCustomerCode);
        }
    },

    renderCustomerList(customers) {
        B2BUI.ui.customerList.innerHTML = '';
        B2BUI.ui.customerLoader.classList.remove('hidden');
        console.log('Rendering customer list with:', customers);

        if (!customers || Object.keys(customers).length === 0) {
            B2BUI.ui.customerLoader.textContent = 'No matching customers.';
            return;
        }
        
        const customerArray = Object.values(customers)
            .filter(c => c.STATUS !== 'DELETED')
            .sort((a, b) => (a.CODE || '').localeCompare(b.CODE || ''));

        customerArray.forEach(cust => {
            if(!cust.CODE) {
                console.warn('Skipping customer render due to missing CODE:', cust);
                return;
            }

            const li = document.createElement('li');
            li.className = 'p-3 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors border border-gray-200';
            li.innerHTML = `<strong class="text-indigo-700 block text-sm">${cust.B2B_NAME || 'Unnamed'}</strong><span class="text-xs text-gray-600">${cust.CODE}</span>`;
            li.dataset.code = cust.CODE;
            li.addEventListener('click', () => B2BForm.populateFormForEdit(cust.CODE));
            B2BUI.ui.customerList.appendChild(li);
        });
        B2BUI.ui.customerLoader.classList.add('hidden');
    }
};
