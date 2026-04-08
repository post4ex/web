// This is the FAB "Engine" file. You should not need to edit it.

(() => {
    let fabContainer;

    function initializeFAB() {
        // THIS IS THE FIX: Check for login data before doing anything.
        const loginDataJSON = localStorage.getItem('loginData');
        if (!loginDataJSON) {
            return; // Do not initialize the FAB if the user is not logged in.
        }

        fabContainer = document.getElementById('fab-container');
        const fabMain = document.getElementById('fab-main');
        const fabActions = document.getElementById('fab-actions');

        if (!fabContainer || !fabMain || !fabActions) {
            console.error('FAB HTML structure not found.');
            return;
        }

        const path = window.location.pathname;
        const currentPage = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

        if (typeof fabPageActions === 'undefined') {
            console.error('fabPageActions configuration is not loaded.');
            return;
        }

        const globalActions = fabPageActions.global || [];
        const pageSpecificActions = fabPageActions[currentPage] || [];
        const actionsToShow = [...pageSpecificActions, ...globalActions];

        if (actionsToShow.length === 0) {
            fabContainer.classList.add('hidden');
            return;
        }

        fabContainer.classList.remove('hidden');
        fabActions.innerHTML = '';

        actionsToShow.forEach(action => {
            const actionElement = document.createElement('div');
            actionElement.className = 'fab-action';
            
            const label = document.createElement('span');
            label.className = 'fab-action-label';
            label.textContent = action.label;
            
            const iconContainer = document.createElement('div');
            iconContainer.className = 'fab-action-icon';
            iconContainer.innerHTML = action.icon;
            
            actionElement.appendChild(label);
            actionElement.appendChild(iconContainer);

            actionElement.addEventListener('click', () => {
                if (action.action.startsWith('navigate_')) {
                    const url = action.action.split('_')[1];
                    if (url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('https:')) {
                        window.open(url, '_blank');
                    } else {
                        window.location.href = url;
                    }
                } else {
                    window.dispatchEvent(new CustomEvent('fabAction', { detail: { action: action.action } }));
                }
                fabContainer.classList.remove('active');
            });
            
            fabActions.appendChild(actionElement);
        });

        fabMain.addEventListener('click', (e) => {
            e.stopPropagation();
            fabContainer.classList.toggle('active');
        });
    }

    window.addEventListener('footerLoaded', initializeFAB);

    document.addEventListener('click', () => {
        if (fabContainer && fabContainer.classList.contains('active')) {
            fabContainer.classList.remove('active');
        }
    });

})();

