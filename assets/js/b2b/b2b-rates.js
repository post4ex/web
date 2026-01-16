// B2B Rates Management
const B2BRates = {
    generateRateForm(customerCode) {
        if (!customerCode) return;
        B2BUI.ui.rateListCustomerCodeSpan.textContent = customerCode;
        B2BUI.ui.rateLoader.textContent = "Generating rate table...";
        B2BUI.ui.rateLoader.classList.remove('hidden');
        B2BUI.ui.rateTableContainer.innerHTML = '';

        if (!B2BData.allModes || B2BData.allModes.length === 0) {
            B2BUI.ui.rateTableContainer.innerHTML = '<p class="text-center p-4 text-red-500">Error: Mode list not available.</p>';
            B2BUI.ui.rateLoader.classList.add('hidden');
            return;
        }

        const currentCustomer = B2BData.allCustomers[customerCode];
        const rateListType = currentCustomer?.RATE_LIST || 'DYNAMIC';
        const isSimplified = rateListType === 'SIMPLIFIED';

        const customerRates = Object.values(B2BData.allRates).filter(rate => rate.CODE === customerCode);
        
        const rateMap = customerRates.reduce((acc, rate) => {
            if(rate.RATE_UID) acc[rate.RATE_UID.trim()] = rate;
            return acc;
        }, {});

        if (customerRates.length === 0) {
            B2BUI.ui.setDefaultRatesBtn.classList.remove('hidden');
        } else {
            B2BUI.ui.setDefaultRatesBtn.classList.add('hidden');
        }
        
        if (B2BUI.ui.modeCheckboxes.children.length === 0) {
            this.generateModeCheckboxes();
        }

        const table = document.createElement('table');
        table.className = 'w-full text-xs border-collapse table-fixed';

        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        
        const headersInfo = [
            { text: 'Mode', width: 'w-24' },
            { text: 'Wt', width: 'w-16' },
        ];

        headersInfo.forEach((info, index) => {
            const th = document.createElement('th');
            th.textContent = info.text;
            th.className = `rate-header sticky top-0 ${info.width}`;
            let leftOffset = 0;
            if (index === 1) leftOffset = 96;
            
            th.style.left = `${leftOffset}px`;
            th.style.zIndex = '6';
            headerRow.appendChild(th);
        });

        if (isSimplified) {
            B2B_CONSTANTS.simplifiedZones.forEach(zone => {
                const th = document.createElement('th');
                th.textContent = zone.label;
                th.className = 'rate-header w-20';
                headerRow.appendChild(th);
            });
        } else {
            for (let i = 1; i <= 14; i++) {
                const th = document.createElement('th');
                th.textContent = `Z${i}`;
                th.className = 'rate-header w-16';
                headerRow.appendChild(th);
            }
        }

        const tbody = table.createTBody();

        const addRateRow = (modeName, modeShortCode, weight, branchCode, weightsArray, weightIndex) => {
            const row = tbody.insertRow();
            row.className = 'rate-row';
            row.dataset.uid = `${customerCode}${modeShortCode}${weight}`;
            row.dataset.mode = modeName;
            row.dataset.weight = weight;
            
            const uid = `${customerCode}${modeShortCode}${weight}`;
            const existingRate = rateMap[uid];
            
            let hasData = false;
            if (existingRate) {
                for (let i = 1; i <= 14; i++) {
                    if (existingRate[`Z${i}`] !== null && existingRate[`Z${i}`] !== undefined && existingRate[`Z${i}`] !== '') {
                        hasData = true;
                        break;
                    }
                }
            }

            const labelsInfo = [
                { value: modeName, width: headersInfo[0].width },
                { value: weight, width: headersInfo[1].width, isWeight: true },
            ];

            labelsInfo.forEach((info, index) => {
                const cell = row.insertCell();
                cell.className = `rate-label-col sticky ${info.width}`;
                
                if (info.isWeight && weightIndex < weightsArray.length - 1) {
                    const expandBtn = document.createElement('span');
                    expandBtn.className = 'add-row-btn';
                    expandBtn.textContent = '+';
                    expandBtn.title = 'Show next weight row';
                    expandBtn.style.marginRight = '0.25rem';
                    expandBtn.onclick = () => {
                        const nextWeight = weightsArray[weightIndex + 1];
                        const nextUid = `${customerCode}${modeShortCode}${nextWeight}`;
                        const nextRow = tbody.querySelector(`tr[data-uid="${nextUid}"]`);
                        if (nextRow) {
                            nextRow.classList.add('visible');
                            expandBtn.style.display = 'none';
                            
                            const nextPlusBtn = nextRow.querySelector('.add-row-btn');
                            if (nextPlusBtn) {
                                nextPlusBtn.style.display = 'inline';
                            }
                        }
                    };
                    cell.appendChild(expandBtn);
                }
                
                const textSpan = document.createElement('span');
                textSpan.textContent = info.value;
                cell.appendChild(textSpan);
                
                let leftOffset = 0;
                if (index === 1) leftOffset = 96;
                
                cell.style.left = `${leftOffset}px`;
                cell.style.zIndex = '1';
                
                if (info.isWeight) { 
                    cell.classList.add('text-gray-600');
                    
                    const hiddenUid = document.createElement('input'); 
                    hiddenUid.type='hidden'; 
                    hiddenUid.name=`rate_${uid}_UID`; 
                    hiddenUid.value=uid; 
                    cell.appendChild(hiddenUid);
                    
                    const hiddenService = document.createElement('input'); 
                    hiddenService.type='hidden'; 
                    hiddenService.name=`rate_${uid}_Service`; 
                    hiddenService.value=modeName; 
                    cell.appendChild(hiddenService);
                    
                    const hiddenWeight = document.createElement('input'); 
                    hiddenWeight.type='hidden'; 
                    hiddenWeight.name=`rate_${uid}_Weight`; 
                    hiddenWeight.value=weight; 
                    cell.appendChild(hiddenWeight);
                    
                    const hiddenBranch = document.createElement('input'); 
                    hiddenBranch.type='hidden'; 
                    hiddenBranch.name=`rate_${uid}_Branch`; 
                    hiddenBranch.value = branchCode || ''; 
                    cell.appendChild(hiddenBranch);
                    
                    const hiddenShortCode = document.createElement('input'); 
                    hiddenShortCode.type='hidden'; 
                    hiddenShortCode.name=`rate_${uid}_ServiceShortCode`; 
                    hiddenShortCode.value = modeShortCode || ''; 
                    cell.appendChild(hiddenShortCode);
                    
                    const hiddenType = document.createElement('input'); 
                    hiddenType.type='hidden'; 
                    hiddenType.name=`rate_${uid}_TYPE`; 
                    hiddenType.value = 'CLIENT'; 
                    cell.appendChild(hiddenType);
                }
            });
            
            if (hasData) {
                row.classList.add('visible');
                row.dataset.hasData = 'true';
            } else {
                row.dataset.hasData = 'false';
            }

            if (isSimplified) {
                B2B_CONSTANTS.simplifiedZones.forEach(zone => {
                    const cell = row.insertCell();
                    cell.className = 'rate-data-cell';
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.step = 'any';
                    input.className = 'form-input rate-input w-full';
                    
                    const firstZone = zone.zones[0];
                    input.value = existingRate && existingRate[`Z${firstZone}`] !== undefined ? existingRate[`Z${firstZone}`] : '';
                    input.placeholder = zone.label;
                    
                    input.dataset.zones = JSON.stringify(zone.zones);
                    input.dataset.uid = uid;
                    input.classList.add('simplified-zone-input');
                    
                    cell.appendChild(input);
                });
            } else {
                for (let i = 1; i <= 14; i++) {
                    const cell = row.insertCell();
                    cell.className = 'rate-data-cell';
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.step = 'any';
                    input.name = `rate_${uid}_Z${i}`;
                    input.className = 'form-input rate-input w-full';
                    input.value = existingRate && existingRate[`Z${i}`] !== undefined ? existingRate[`Z${i}`] : '';
                    input.placeholder = `Z${i}`;
                    cell.appendChild(input);
                }
            }
        };

        const customerBranch = currentCustomer ? currentCustomer.BRANCH : '';

        Object.values(B2BData.allModes).forEach(mode => {
            const modeName = mode.MODE;
            const shortCode = mode.SHORT;
            const modeLower = modeName.toLowerCase();
            if (!shortCode) return;
            
            const isStandardMode = B2B_CONSTANTS.standardModes.includes(modeLower);
            const isChecked = document.querySelector(`input[data-mode="${modeName}"]`)?.checked;
            const hasModeData = customerRates.some(r => r.MODE === modeName);
            
            if (!isStandardMode && !isChecked && !hasModeData) return;

            const weightsToUse = (modeLower === 'express' || modeLower === 'premium')
                                ? B2B_CONSTANTS.staticWeights
                                : B2B_CONSTANTS.dynamicWeights;

            const uidShortCode = (modeLower === 'express') ? 'E' : (modeLower === 'premium') ? 'P' : shortCode;

            weightsToUse.forEach((weight, idx) => {
                addRateRow(modeName, uidShortCode, weight, customerBranch, weightsToUse, idx);
            });
        });

        B2BUI.ui.rateTableContainer.appendChild(table);
        
        const allRows = tbody.querySelectorAll('.rate-row');
        allRows.forEach(row => {
            const mode = row.dataset.mode.toLowerCase();
            const weight = row.dataset.weight;
            const hasData = row.dataset.hasData === 'true';
            
            let shouldShow = false;
            
            if (hasData) {
                shouldShow = true;
            } else if (mode === 'premium' || mode === 'express') {
                shouldShow = true;
            } else if (mode === 'airline') {
                shouldShow = ['3', '10', '25'].includes(weight);
            } else if (mode === 'surface') {
                shouldShow = ['3', '10', '25', '50'].includes(weight);
            } else {
                shouldShow = ['3', '10', '25', '50'].includes(weight);
            }
            
            if (shouldShow) {
                row.classList.add('visible');
            }
        });
        
        allRows.forEach(row => {
            if (!row.classList.contains('visible')) return;
            
            const plusBtn = row.querySelector('.add-row-btn');
            if (plusBtn) {
                const uid = row.dataset.uid;
                const mode = row.dataset.mode;
                const modeShortCode = uid.replace(customerCode, '').match(/^[A-Z]+/)?.[0] || '';
                const weightsArray = (mode.toLowerCase() === 'express' || mode.toLowerCase() === 'premium') ? B2B_CONSTANTS.staticWeights : B2B_CONSTANTS.dynamicWeights;
                const currentWeight = row.dataset.weight;
                const currentIdx = weightsArray.indexOf(currentWeight);
                
                if (currentIdx >= 0 && currentIdx < weightsArray.length - 1) {
                    const nextWeight = weightsArray[currentIdx + 1];
                    const nextUid = `${customerCode}${modeShortCode}${nextWeight}`;
                    const nextRow = tbody.querySelector(`tr[data-uid="${nextUid}"]`);
                    
                    if (nextRow && nextRow.classList.contains('visible')) {
                        plusBtn.style.display = 'none';
                    }
                }
            }
        });
        
        const modeGroups = {};
        allRows.forEach(row => {
            if (!row.classList.contains('visible')) return;
            const mode = row.dataset.mode;
            if (!modeGroups[mode]) modeGroups[mode] = [];
            modeGroups[mode].push(row);
        });
        
        Object.values(modeGroups).forEach(rows => {
            for (let i = 0; i < rows.length - 1; i++) {
                const plusBtn = rows[i].querySelector('.add-row-btn');
                if (plusBtn) plusBtn.style.display = 'none';
            }
        });
        
        B2BUI.ui.rateLoader.classList.add('hidden');
    },

    generateModeCheckboxes() {
        Object.values(B2BData.allModes).forEach(mode => {
            const modeName = mode.MODE;
            const modeLower = modeName.toLowerCase();
            
            if (B2B_CONSTANTS.standardModes.includes(modeLower)) return;
            
            const label = document.createElement('label');
            label.className = 'flex items-center space-x-2 text-sm cursor-pointer';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'h-4 w-4 text-indigo-600 border-gray-300 rounded';
            checkbox.dataset.mode = modeName;
            checkbox.addEventListener('change', () => {
                if (B2BData.currentCustomerCode) {
                    this.generateRateForm(B2BData.currentCustomerCode);
                }
            });
            
            const span = document.createElement('span');
            span.textContent = modeName;
            
            label.appendChild(checkbox);
            label.appendChild(span);
            B2BUI.ui.modeCheckboxes.appendChild(label);
        });
    },

    setDefaultRates() {
        if (!B2BData.currentCustomerCode) return;
        
        const currentCustomer = B2BData.allCustomers[B2BData.currentCustomerCode];
        const customerBranch = currentCustomer?.BRANCH || 'RRK';
        
        const defaultRates = Object.values(B2BData.allRates).filter(rate => 
            rate.CODE === 'DFLT' && rate.BRANCH === customerBranch && rate.TYPE === 'CLIENT'
        );
        
        if (defaultRates.length === 0) {
            B2BUI.showResponseMessage(`No default rates found for branch ${customerBranch}`, 'error');
            return;
        }
        
        const isSimplified = currentCustomer?.RATE_LIST === 'SIMPLIFIED';
        
        defaultRates.forEach(defaultRate => {
            const uid = `${B2BData.currentCustomerCode}${defaultRate.RATE_UID.replace('DFLT', '')}`;
            
            if (isSimplified) {
                const simplifiedInputs = B2BUI.ui.rateForm.querySelectorAll('.simplified-zone-input');
                simplifiedInputs.forEach(input => {
                    if (input.dataset.uid === uid) {
                        const zones = JSON.parse(input.dataset.zones);
                        const firstZone = zones[0];
                        input.value = defaultRate[`Z${firstZone}`] || '';
                    }
                });
            } else {
                for (let i = 1; i <= 14; i++) {
                    const input = B2BUI.ui.rateForm.querySelector(`input[name="rate_${uid}_Z${i}"]`);
                    if (input && defaultRate[`Z${i}`] !== null && defaultRate[`Z${i}`] !== undefined) {
                        input.value = defaultRate[`Z${i}`];
                    }
                }
            }
        });
        
        B2BUI.showResponseMessage(`Default rates loaded. Click "Save All Rates" to save them.`, 'success');
    },

    handleRateSubmit(e) {
        e.preventDefault();
        if (!B2BData.currentCustomerCode) {
            B2BUI.showResponseMessage("No customer selected.", "error");
            return;
        }

        const currentCustomer = B2BData.allCustomers[B2BData.currentCustomerCode];
        const isSimplified = currentCustomer?.RATE_LIST === 'SIMPLIFIED';

        const ratesPayload = [];
        const rateInputs = B2BUI.ui.rateForm.querySelectorAll('input[type="number"], input[type="hidden"]');
        const ratesGroupedByUID = {};

        rateInputs.forEach(input => {
            if (input.type === 'hidden') {
                const nameParts = input.name.split('_');
                if (nameParts.length < 3 || nameParts[0] !== 'rate') return;
                const uid = nameParts[1];
                const field = nameParts.slice(2).join('_');
                if (!ratesGroupedByUID[uid]) ratesGroupedByUID[uid] = { UID: uid };
                ratesGroupedByUID[uid][field] = input.value || '';
            }
        });

        if (isSimplified) {
            const simplifiedInputs = B2BUI.ui.rateForm.querySelectorAll('.simplified-zone-input');
            simplifiedInputs.forEach(input => {
                const uid = input.dataset.uid;
                const zones = JSON.parse(input.dataset.zones);
                const value = parseFloat(input.value);
                
                if (!ratesGroupedByUID[uid]) ratesGroupedByUID[uid] = { UID: uid };
                
                zones.forEach(zoneNum => {
                    ratesGroupedByUID[uid][`Z${zoneNum}`] = isNaN(value) || input.value === '' ? null : value;
                });
            });
        } else {
            rateInputs.forEach(input => {
                if (input.type === 'number' && !input.classList.contains('simplified-zone-input')) {
                    const nameParts = input.name.split('_');
                    if (nameParts.length < 3 || nameParts[0] !== 'rate') return;
                    const uid = nameParts[1];
                    const field = nameParts.slice(2).join('_');
                    if (!ratesGroupedByUID[uid]) ratesGroupedByUID[uid] = { UID: uid };

                    if (field.startsWith('Z') && !isNaN(parseInt(field.substring(1)))) {
                        const numValue = parseFloat(input.value);
                        ratesGroupedByUID[uid][field] = (isNaN(numValue) || input.value === '') ? null : numValue;
                    }
                }
            });
        }

        for (const uid in ratesGroupedByUID) {
            const rateData = ratesGroupedByUID[uid];
            let hasValue = false;
            for (let i = 1; i <= 14; i++) {
                if (rateData[`Z${i}`] !== null && rateData[`Z${i}`] !== undefined) {
                    hasValue = true;
                    break;
                }
            }
            
            if (hasValue) {
                ratesPayload.push(rateData);
            }
        }

        if (ratesPayload.length === 0) {
            B2BUI.showResponseMessage("No rate data entered. Nothing to save.", "warning");
            return;
        }

        const submitData = {
            code: B2BData.currentCustomerCode,
            branch: B2BUI.ui.customerForm.querySelector('[name="BRANCH"]').value || '',
            rates: ratesPayload
        };

        B2BApi.handleRequest(
            'ratelist',
            'submit',
            submitData,
            B2BUI.ui.ratesSpinner,
            B2BUI.ui.submitRatesButton,
            B2BUI.ui.ratesButtonText
        );
    }
};
