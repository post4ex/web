// ============================================================================
// OTP-WRITE.JS — Generic OTP confirmation for write actions
// Flow: send (email+WhatsApp to requester) → modal → verify → write_token
// The write_token is single-use, 5 min TTL — pass it in the write request.
//
// Usage:
//   const token = await otpRequest('order_write', ref, 'Edit order');
//   await submitEditOrder(payload, token);
//
// Conventions (must match FASTAPI/core/handlers/otp_router.py):
//   identifier = "<REFERENCE|UID|id|code>" — server appends your username
//   otp_types: order_write, b2b2c_write, charges_write, branch_write,
//              mode_write, carrier_write, rates_delete, upload_delete,
//              invoice_revert
//
// Also provides:
//   otpAskCode(title, msg) → Promise<code string>  (no send — code already
//   delivered, e.g. consignee delivery OTP auto-sent on Out for Delivery)
// ============================================================================

(() => {

    async function _otpFetch(endpoint, payload) {
        const headers = { 'Content-Type': 'application/json' };
        const token = window.getSessionId ? getSessionId() : '';
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
        let json = {};
        try { json = await res.json(); } catch { /* empty body */ }
        if (!res.ok) throw new Error(json.detail || json.message || `Request failed (${res.status})`);
        if (json.status === 'error') throw new Error(json.message || 'OTP request failed');
        return json;
    }

    // ── Modal skeleton ──────────────────────────────────────────────────────
    function _ensureModal(id, titleText, bodyHtml) {
        let modal = document.getElementById(id);
        if (modal) { modal.remove(); }   // fresh state every time
        modal = document.createElement('div');
        modal.id = id;
        modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/50';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-[92%] max-w-sm p-5">
                <h3 class="text-base font-semibold text-gray-800 mb-1">${titleText}</h3>
                <div class="text-xs text-gray-500 mb-4">${bodyHtml}</div>
                <div id="${id}Msg" class="hidden mb-3 p-2 rounded text-xs text-center"></div>
                <input id="${id}Input" type="text" inputmode="numeric" maxlength="10" autocomplete="one-time-code"
                       placeholder="Enter OTP" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-lg tracking-[0.4em] font-mono focus:outline-none focus:border-indigo-500 mb-4">
                <div class="flex gap-2">
                    <button id="${id}Verify" class="btn flex-1 flex items-center justify-center gap-2">
                        <span>Verify</span>
                        <div id="${id}Spinner" class="spinner hidden"></div>
                    </button>
                    <button id="${id}Cancel" class="btn-ghost btn-sm">Cancel</button>
                </div>
                <button id="${id}Resend" class="mt-3 w-full text-xs text-indigo-600 hover:underline">Resend OTP</button>
            </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    function _showMsg(modal, id, text, kind) {
        const el = modal.querySelector(`#${id}Msg`);
        if (!el) return;
        el.textContent = text;
        el.className = `mb-3 p-2 rounded text-xs text-center ${kind === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`;
    }

    // ── Full flow: send + verify → write_token ──────────────────────────────
    window.otpRequest = function (otpType, identifier, title = 'Confirm with OTP') {
        const user = window.getUser ? getUser() : {};
        if (!user.USER) return Promise.reject(new Error('Not logged in'));

        const modalId = 'otpWriteModal';
        const modal = _ensureModal(
            modalId,
            title,
            'An OTP has been sent to your email &amp; WhatsApp. Enter it to continue.'
        );
        const input    = modal.querySelector(`#${modalId}Input`);
        const verifyB  = modal.querySelector(`#${modalId}Verify`);
        const cancelB  = modal.querySelector(`#${modalId}Cancel`);
        const resendB  = modal.querySelector(`#${modalId}Resend`);
        const spinner  = modal.querySelector(`#${modalId}Spinner`);

        return new Promise((resolve, reject) => {
            let settled = false;
            const close = (fn, val) => {
                if (settled) return;
                settled = true;
                modal.remove();
                fn(val);
            };

            const send = async (isResend) => {
                resendB.disabled = true;
                if (!isResend) verifyB.disabled = true;
                try {
                    await _otpFetch('/api/otp/send', { otp_type: otpType, identifier });
                    _showMsg(modal, modalId, 'OTP sent to your email & WhatsApp.', 'success');
                } catch (e) {
                    _showMsg(modal, modalId, e.message, 'error');
                } finally {
                    resendB.disabled = false;
                    resendB.textContent = 'Resend OTP';
                    verifyB.disabled = false;
                }
            };

            verifyB.addEventListener('click', async () => {
                const code = input.value.trim();
                if (!code) { _showMsg(modal, modalId, 'Enter the OTP.', 'error'); return; }
                verifyB.disabled = true;
                spinner.classList.remove('hidden');
                try {
                    const res = await _otpFetch('/api/otp/verify', { otp_type: otpType, identifier, code });
                    close(resolve, res.write_token);
                } catch (e) {
                    _showMsg(modal, modalId, e.message, 'error');
                    input.value = '';
                    input.focus();
                } finally {
                    spinner.classList.add('hidden');
                    verifyB.disabled = false;
                }
            });
            input.addEventListener('keydown', e => { if (e.key === 'Enter') verifyB.click(); });

            cancelB.addEventListener('click', () => close(reject, new Error('OTP confirmation cancelled')));
            resendB.addEventListener('click', () => send(true));
            modal.addEventListener('click', e => { if (e.target === modal) close(reject, new Error('OTP confirmation cancelled')); });

            send(false);
            setTimeout(() => input.focus(), 50);
        });
    };

    // ── Enter-only dialog: code already delivered elsewhere (e.g. delivery OTP) ──
    window.otpAskCode = function (title = 'Enter OTP', msg = 'An OTP has been sent. Enter it to continue.') {
        const modalId = 'otpAskModal';
        const modal = _ensureModal(modalId, title, msg);
        const resendB = modal.querySelector(`#${modalId}Resend`);
        if (resendB) resendB.remove();   // nothing to resend from here
        const input   = modal.querySelector(`#${modalId}Input`);
        const verifyB = modal.querySelector(`#${modalId}Verify`);
        const cancelB = modal.querySelector(`#${modalId}Cancel`);
        modal.querySelector(`#${modalId}Spinner`)?.classList.add('hidden');

        return new Promise((resolve, reject) => {
            let settled = false;
            const close = (fn, val) => {
                if (settled) return;
                settled = true;
                modal.remove();
                fn(val);
            };
            verifyB.addEventListener('click', () => {
                const code = input.value.trim();
                if (!code) { _showMsg(modal, modalId, 'Enter the OTP.', 'error'); return; }
                close(resolve, code);
            });
            input.addEventListener('keydown', e => { if (e.key === 'Enter') verifyB.click(); });
            cancelB.addEventListener('click', () => close(reject, new Error('Cancelled')));
            modal.addEventListener('click', e => { if (e.target === modal) close(reject, new Error('Cancelled')); });
            setTimeout(() => input.focus(), 50);
        });
    };

})();
