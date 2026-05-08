// ============================================================================
// LOGIN.JS — Auth Page Logic (login, register, forgot password)
// ============================================================================

let currentView = 'login', regState = 'init', forgotState = 'send', resetToken = '';

// ── Captcha ──────────────────────────────────────────────────────────────────
let _captchaResolve = null;

function _showCaptcha(imgSrc, isWrong = false) {
    document.getElementById('captcha-img').src = imgSrc;
    document.getElementById('captcha-answer').value = '';
    document.getElementById('captcha-msg').classList.toggle('hidden', !isWrong);
    document.getElementById('captcha-modal').classList.remove('hidden');
    document.getElementById('captcha-answer').focus();
}

function _hideCaptcha() {
    document.getElementById('captcha-modal').classList.add('hidden');
}

function _waitForCaptcha(imgSrc, isWrong = false) {
    _showCaptcha(imgSrc, isWrong);
    return new Promise(resolve => { _captchaResolve = resolve; });
}

async function callApi(endpoint, payload = {}) {
    setLoading(true, 'Connecting...');
    let captchaId = null;
    try {
        // Step 1 — initial request (no captcha)
        let res = await fetch(`${CONSTANTS.OPERATIONS_URL}${endpoint}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        let json = await res.json();
        setLoading(false);

        // Captcha challenge loop
        while (json.id && json.image) {
            captchaId = json.id;
            const answer = await _waitForCaptcha(json.image, res.status === 403);
            _hideCaptcha();
            setLoading(true, 'Verifying...');
            res = await fetch(`${CONSTANTS.OPERATIONS_URL}${endpoint}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, captcha_id: captchaId, answer })
            });
            json = await res.json();
            setLoading(false);
        }

        if (json.status === 'error') throw new Error(json.message);
        return json;
    } catch (err) {
        setLoading(false);
        _hideCaptcha();
        let msg = err.message;
        if (msg.includes('Blocked')) msg = '⚠️ Account Blocked (Suspicious Activity)';
        showMessage(msg, 'error');
        throw err;
    }
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeInput(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function showMessage(msg, type) {
    const el = document.getElementById('status-area');
    el.textContent = msg;
    el.className   = 'mt-2 p-2 rounded text-center text-xs font-semibold';

    if      (type === 'error')   el.classList.add('bg-red-100',   'text-red-700');
    else if (type === 'success') el.classList.add('bg-green-100', 'text-green-700');
    else {
        if (!msg) { el.classList.add('hidden'); return; }
        el.classList.add('bg-gray-100', 'text-gray-700');
    }
    el.classList.remove('hidden');
}

function setLoading(state, text) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !state);
    if (state) document.getElementById('loading-text').textContent = text;
}

function switchView(viewName) {
    ['view-login', 'view-register', 'view-forgot', 'view-kyc'].forEach(id => {
        const el = document.getElementById(id);
        el.classList.add('hidden-view', 'hidden');
    });
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.remove('hidden');
        setTimeout(() => target.classList.remove('hidden-view'), 10);
        currentView = viewName;
        showMessage('', 'neutral');
    }
    if (viewName === 'forgot') {
        forgotState  = 'send';
        resetToken   = '';
        document.getElementById('forgot-step-1').classList.remove('hidden');
        document.getElementById('forgot-step-2').classList.add('hidden');
        document.getElementById('forgot-step-3').classList.add('hidden');
        document.getElementById('forgot-btn').textContent = 'Request OTP';
        document.getElementById('forgot-btn').className   = 'w-full py-2 bg-orange-600 text-white font-bold rounded hover:bg-orange-700 transition-all shadow text-sm mt-2';
    }
    if (viewName === 'register') {
        regState = 'init';
        document.getElementById('reg-step-1').classList.remove('hidden');
        document.getElementById('reg-step-2').classList.add('hidden');
        document.getElementById('reg-btn').textContent = 'Send OTP';
        document.getElementById('form-register').reset();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();

    if (!user) return showMessage('Please enter username.', 'error');
    if (!pass) return showMessage('Please enter password.', 'error');
    if (pass.length < 4) return showMessage('Password is too short.', 'error');

    try {
        const res = await callApi('/api/public/login', { username: user, password: pass });
        if (res.status === 'success' && res.sessionId) {
            localStorage.setItem('loginData', JSON.stringify({
                sessionId: res.sessionId,
                userData:  res.userData,
                loginTime: Date.now(),
                expires:   Date.now() + 8 * 60 * 60 * 1000
            }));

            // check if same user — wipe IndexedDB if different user logging in
            if (window.appDB && window.appDB.db) {
                const lastUser = await window.appDB.getMetadata('lastUser').catch(() => null);
                const newUser  = user.trim().toLowerCase();
                if (lastUser && lastUser !== newUser) {
                    await window.appDB.clearAll().catch(() => {});
                }
                await window.appDB.setMetadata('lastUser', newUser).catch(() => {});
            }

            showMessage('Login successful! Redirecting...', 'success');
            setTimeout(() => { location.href = 'dashboard.html'; }, 1000);
        }
    } catch (err) {}
}

async function handleRegister(e) {
    e.preventDefault();
    if (regState === 'init') {
        const data = {
            USER:   sanitizeInput(document.getElementById('reg-user').value.trim()),
            EMAIL:  document.getElementById('reg-email').value.trim().toLowerCase(),
            MOBILE: document.getElementById('reg-mobile').value.trim(),
            NAME:   sanitizeInput(document.getElementById('reg-name').value.trim()),
            PASS:   document.getElementById('reg-pass').value.trim(),
            ROLE:   'CLIENT',
            STATUS: 'PENDING'
        };
        const confirmPass = document.getElementById('reg-confirm-pass').value.trim();

        if (!data.USER || !data.EMAIL || !data.PASS || !confirmPass) return showMessage('Fill all fields.', 'error');
        if (!validateEmail(data.EMAIL))    return showMessage('Invalid Email format.', 'error');
        if (data.PASS.length < 8)          return showMessage('Password must be at least 8 characters.', 'error');
        if (!/[A-Z]/.test(data.PASS))      return showMessage('Password must contain at least one uppercase letter.', 'error');
        if (data.PASS !== confirmPass)      return showMessage('Passwords do not match.', 'error');

        try {
            await callApi('/api/public/initiateRegistration', { ...data });
            document.getElementById('reg-step-1').classList.add('hidden');
            document.getElementById('reg-step-2').classList.remove('hidden');
            document.getElementById('reg-btn').textContent = 'Confirm OTP';
            regState = 'confirm';
        } catch (err) {}
    } else {
        try {
            const otp   = document.getElementById('reg-otp').value.trim();
            const email = document.getElementById('reg-email').value.trim().toLowerCase();
            if (!otp) return showMessage('Enter OTP.', 'error');
            await callApi('/api/public/confirmRegistration', { email, otp });
            showMessage('Registration submitted! Awaiting admin approval.', 'success');
            setTimeout(() => switchView('login'), 3000);
        } catch (err) {}
    }
}

async function handleKYCSubmit(e) {
    e.preventDefault();
    showMessage('Registration submitted! Awaiting admin approval.', 'success');
    setTimeout(() => switchView('login'), 2000);
}

async function handleForgot(e) {
    e.preventDefault();
    const id = document.getElementById('forgot-id').value.trim();

    if (forgotState === 'send') {
        if (!id) return showMessage('Enter Username or Email', 'error');
        try {
            await callApi('/api/public/sendResetOtp', { identifier: id, mobile: document.getElementById('forgot-mobile').value.trim() });
            document.getElementById('forgot-step-1').classList.add('hidden');
            document.getElementById('forgot-step-2').classList.remove('hidden');
            document.getElementById('forgot-btn').textContent = 'Verify OTP';
            forgotState = 'verify';
        } catch (err) {}

    } else if (forgotState === 'verify') {
        try {
            const otp = document.getElementById('forgot-otp').value.trim();
            setLoading(true, 'Verifying...');
            const res = await callApi('/api/public/verifyResetOtp', { identifier: id, otp });
            setLoading(false);
            if (res.detail) { showMessage(res.detail, 'error'); return; }
            resetToken = res.token;
            document.getElementById('forgot-step-2').classList.add('hidden');
            document.getElementById('forgot-step-3').classList.remove('hidden');
            document.getElementById('forgot-btn').textContent = 'Set New Password';
            document.getElementById('forgot-btn').className   = 'w-full py-2 bg-green-600 text-white font-bold rounded shadow text-sm mt-2';
            forgotState = 'reset';
        } catch (err) { setLoading(false); showMessage('Verification failed.', 'error'); }

    } else {
        try {
            const newPass = document.getElementById('forgot-newpass').value.trim();
            if (newPass.length < 8)     return showMessage('Password must be at least 8 characters.', 'error');
            if (!/[A-Z]/.test(newPass)) return showMessage('Password must contain at least one uppercase letter.', 'error');
            await callApi('/api/public/resetPass', { identifier: id, token: resetToken, newPassword: newPass });
            showMessage('Password Reset!', 'success');
            setTimeout(() => switchView('login'), 2000);
        } catch (err) {}
    }
}

async function loadComponent(componentUrl, placeholderId) {
    try {
        const placeholder = document.getElementById(placeholderId);
        if (!placeholder) return;
        const isHeader = placeholderId === 'header-placeholder';
        placeholder.innerHTML = isHeader
            ? '<div class="animate-pulse bg-gray-200 h-14 w-full rounded"></div>'
            : '<div class="animate-pulse bg-gray-200 h-10 w-full rounded"></div>';
        placeholder.style.minHeight = isHeader ? '56px' : '36px';
        const response = await fetch(componentUrl, { cache: 'default' });
        if (!response.ok) throw new Error(`Failed to load ${componentUrl}`);
        const text = await response.text();
        const doc  = new DOMParser().parseFromString(text, 'text/html');
        Array.from(doc.querySelectorAll('script')).forEach(script => {
            const newScript = document.createElement('script');
            if (script.src) { newScript.src = script.src; } else { newScript.textContent = script.textContent; }
            document.head.appendChild(newScript);
            script.remove();
        });
        placeholder.innerHTML = '';
        while (doc.body.firstChild) placeholder.appendChild(doc.body.firstChild);
    } catch (error) {
        console.warn(`[Login] Failed loading ${componentUrl}:`, error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Resolve API URL
    try {
        const res = await fetch('dev_url.json', { cache: 'no-store' });
        if (res.ok) {
            const { url } = await res.json();
            if (url) CONSTANTS.OPERATIONS_URL = url;
        }
    } catch (_) {}

    await loadComponent('header.html', 'header-placeholder');
    await loadComponent('footer.html', 'footer-placeholder');
    window.dispatchEvent(new CustomEvent('footerLoaded'));

    document.getElementById('form-login').addEventListener('submit',    handleLogin);
    document.getElementById('form-register').addEventListener('submit', handleRegister);
    document.getElementById('form-forgot').addEventListener('submit',   handleForgot);
    document.getElementById('form-kyc').addEventListener('submit',      handleKYCSubmit);

    // Captcha modal
    document.getElementById('captcha-submit').addEventListener('click', () => {
        const answer = document.getElementById('captcha-answer').value.trim();
        if (!answer) return;
        if (_captchaResolve) { _captchaResolve(answer); _captchaResolve = null; }
    });
    document.getElementById('captcha-answer').addEventListener('keypress', e => {
        if (e.key === 'Enter') document.getElementById('captcha-submit').click();
    });
    document.getElementById('captcha-refresh').addEventListener('click', async () => {
        // re-trigger by resolving with empty — callApi will get a fresh captcha on next request
        // instead, fetch a fresh captcha from the same endpoint with no payload
        try {
            const res  = await fetch(`${CONSTANTS.OPERATIONS_URL}/api/public/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const data = await res.json();
            if (data.id && data.image) { document.getElementById('captcha-img').src = data.image; document.getElementById('captcha-answer').value = ''; }
        } catch (_) {}
    });

    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', function () {
            const input = document.getElementById(this.getAttribute('data-target'));
            const icon  = this.querySelector('i');
            input.type  = input.type === 'password' ? 'text' : 'password';
            if (input.type === 'password') {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-regular', 'fa-eye');
            } else {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-regular', 'fa-eye-slash');
            }
            this.classList.toggle('text-blue-800');
            this.classList.toggle('text-gray-400');
        });
    });
});
