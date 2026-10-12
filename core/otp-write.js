// ============================================================================
// OTP-WRITE.JS — Self-contained OTP gate for write actions
// ----------------------------------------------------------------------------
// Isko bas import/include karo (kisi bhi page pe) — kaam khud ho jata hai:
//   • callApi() ke through OTP-gated endpoint par click karte hi apna popup
//     banata hai (koi HTML/page-change nahi chahiye)
//   • OTP → verify → write_token → op proceed
//
// Exposed API:
//   OtpGate.ruleFor(endpoint, method)  → { otp_type, identifier } | null
//   OtpGate.ask(rule)                  → Promise<write_token>  (cancel = reject)
//   otpRequest(otpType, identifier, title)  → Promise<write_token>  (manual)
//   otpAskCode(title, msg)             → Promise<code>  (enter-only dialog,
//                                          code already delivered elsewhere —
//                                          e.g. consignee delivery OTP)
//
// Har rule ka identifier backend scope se EXACT match karna chahiye:
//   otp_router scope = "<identifier>:<requester-username>" (server builds it)
// ============================================================================

(() => {

    // ── Auth fetch (same contract as callApi, self-contained) ────────────────
    async function _api(endpoint, payload, method = 'POST') {
        const headers = { 'Content-Type': 'application/json' };
        const token = window.getSessionId ? getSessionId() : '';
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const options = { method, headers, cache: 'no-store' };
        if (method !== 'GET') options.body = JSON.stringify(payload);
        const res = await fetch(endpoint, options);
        let json = {};
        try { json = await res.json(); } catch { /* empty body */ }
        if (!res.ok) throw new Error(json.detail || json.message || `Request failed (${res.status})`);
        if (json.status === 'error') throw new Error(json.message || 'Request failed');
        return json;
    }

    // ── Modal skeleton — FULLY self-constructed, inline styles (no page CSS
    //    dependency). Isliye ye file kisi bhi page pe kaam karti hai. ─────────
    function _ensureModal(id, titleText, bodyHtml, inputLabel, isGAuth) {
        let modal = document.getElementById(id);
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = id;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);font-family:inherit;';
        const resendLabel = isGAuth ? 'Send OTP to WhatsApp instead' : 'Resend OTP';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:14px;width:92%;max-width:360px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
                <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:4px;">${titleText}</div>
                <div id="${id}Subtitle" style="font-size:12px;color:#6b7280;margin-bottom:12px;">${bodyHtml}</div>
                <div id="${id}Msg" style="display:none;margin-bottom:10px;padding:8px;border-radius:6px;font-size:12px;text-align:center;"></div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
                    <label style="font-size:12px;font-weight:600;color:#374151;white-space:nowrap;">${inputLabel || 'Code'}</label>
                    <input id="${id}Input" type="text" inputmode="numeric" maxlength="10" autocomplete="one-time-code"
                           placeholder="000000"
                           style="flex:1;border:1px solid #d1d5db;border-radius:8px;padding:9px 10px;font-size:16px;letter-spacing:6px;text-align:center;font-family:monospace;outline:none;min-width:0;">
                </div>
                <div style="display:flex;gap:8px;">
                    <button id="${id}Verify" style="flex:1;background:#dc2626;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">Verify</button>
                    <button id="${id}Cancel" style="background:#f3f4f6;color:#374151;border:none;border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer;">Cancel</button>
                </div>
                <button id="${id}Resend" style="margin-top:12px;width:100%;background:none;border:none;color:#4f46e5;font-size:12px;cursor:pointer;text-decoration:underline;">${resendLabel}</button>
            </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    function _msg(modal, id, text, kind) {
        const el = modal.querySelector(`#${id}Msg`);
        if (!el) return;
        el.textContent = text;
        el.style.display = 'block';
        el.style.color = kind === 'error' ? '#b91c1c' : '#047857';
        el.style.background = kind === 'error' ? '#fef2f2' : '#ecfdf5';
    }

    function _spinnerHtml() {
        const s = document.createElement('span');
        s.style.cssText = 'width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;display:inline-block;animation:otpSpin 0.7s linear infinite;';
        if (!document.getElementById('otpSpinKey')) {
            const st = document.createElement('style');
            st.id = 'otpSpinKey';
            st.textContent = '@keyframes otpSpin{to{transform:rotate(360deg)}}';
            document.head.appendChild(st);
        }
        return s;
    }

    // ── Core ask flow: popup → send OTP / GAuth → verify → write_token ───────
    function _askModal(otpType, identifier, title, bodyHtml) {
        const currentUser = (typeof window.getUser === 'function' ? window.getUser() : {}) || {};
        const isGAuth = currentUser.IS_TOTP_ENABLED === true || currentUser.IS_TOTP_ENABLED === 1 || currentUser.IS_TOTP_ENABLED === 'true' || currentUser.IS_TOTP_ENABLED === '1';
        const modalId = 'otpWriteModal';
        const defaultTitle = title || (isGAuth ? 'Confirm with Authenticator App' : 'Confirm with OTP');
        const defaultSubtitle = isGAuth
            ? 'Enter the 6-digit code from Google Authenticator.'
            : (bodyHtml || 'An OTP has been sent to your email &amp; WhatsApp.');
        const inputLabel = isGAuth ? 'Code' : 'OTP';

        const modal = _ensureModal(modalId, defaultTitle, defaultSubtitle, inputLabel, isGAuth);
        const input    = modal.querySelector(`#${modalId}Input`);
        const verifyB  = modal.querySelector(`#${modalId}Verify`);
        const cancelB  = modal.querySelector(`#${modalId}Cancel`);
        const resendB  = modal.querySelector(`#${modalId}Resend`);
        const msgEl    = modal.querySelector(`#${modalId}Msg`);
        const subEl    = modal.querySelector(`#${modalId}Subtitle`);
        const originalBtnText = verifyB.textContent;

        return new Promise((resolve, reject) => {
            let settled = false;
            const close = (fn, val) => {
                if (settled) return;
                settled = true;
                modal.remove();
                fn(val);
            };
            const setBusy = (busy) => {
                verifyB.disabled = busy;
                verifyB.style.opacity = busy ? '0.7' : '1';
                const sp = modal.querySelector(`#${modalId}Spin`);
                if (busy && !sp) verifyB.appendChild(_spinnerHtml());
                if (!busy) { const x = modal.querySelector(`#${modalId}Spin`); if (x) x.remove(); }
                if (!busy) verifyB.textContent = originalBtnText;
            };

            const send = async (isResend) => {
                resendB.disabled = true;
                try {
                    await _api('/api/otp/send', { otp_type: otpType, identifier });
                    if (subEl) subEl.textContent = 'An OTP has been sent to your email & WhatsApp.';
                    _msg(modal, modalId, 'OTP sent to your email & WhatsApp.', 'ok');
                    resendB.textContent = 'Resend WhatsApp OTP';
                } catch (e) {
                    _msg(modal, modalId, e.message, 'error');
                } finally {
                    resendB.disabled = false;
                }
            };

            resendB.addEventListener('click', () => send(true));

            verifyB.addEventListener('click', async () => {
                const code = input.value.replace(/\s+/g, '').trim();
                if (!code) { _msg(modal, modalId, 'Enter the code.', 'error'); return; }
                setBusy(true);
                msgEl.style.display = 'none';
                try {
                    const res = await _api('/api/otp/verify', { otp_type: otpType, identifier, code });
                    close(resolve, res.write_token);
                } catch (e) {
                    _msg(modal, modalId, e.message, 'error');
                    input.value = '';
                    input.focus();
                } finally {
                    setBusy(false);
                }
            });
            input.addEventListener('input', () => {
                const val = input.value.replace(/\s+/g, '').trim();
                if (val.length === 6 && !verifyB.disabled) {
                    verifyB.click();
                }
            });
            input.addEventListener('keydown', e => { if (e.key === 'Enter') verifyB.click(); });
            cancelB.addEventListener('click', () => close(reject, new Error('OTP action cancelled')));
            modal.addEventListener('click', e => { if (e.target === modal) close(reject, new Error('OTP action cancelled')); });

            if (!isGAuth) {
                send(false);
            }
            setTimeout(() => input.focus(), 60);
        });
    }

    // ── Google Authenticator Setup & Management Modal ───────────────────────
    window.openTotpModal = async function () {
        const modalId = 'totpConfigModal';
        let existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const user = (typeof window.getUser === 'function' ? window.getUser() : {}) || {};
        const isCurrentlyEnabled = !!user.IS_TOTP_ENABLED;

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);font-family:inherit;';

        modal.innerHTML = `
            <div style="background:#fff;border-radius:14px;width:92%;max-width:390px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.35);max-height:90vh;overflow-y:auto;box-sizing:border-box;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div style="font-size:15px;font-weight:700;color:#111827;">Google Authenticator (2FA)</div>
                    <button id="${modalId}Close" style="background:none;border:none;font-size:22px;color:#9ca3af;cursor:pointer;line-height:1;">&times;</button>
                </div>
                <div id="${modalId}Body">
                    <div style="text-align:center;padding:20px;color:#6b7280;font-size:13px;">Loading setup...</div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.querySelector(`#${modalId}Close`).addEventListener('click', close);
        modal.addEventListener('click', e => { if (e.target === modal) close(); });

        const bodyContainer = modal.querySelector(`#${modalId}Body`);

        if (isCurrentlyEnabled) {
            bodyContainer.innerHTML = `
                <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px;margin-bottom:16px;text-align:center;">
                    <div style="font-size:14px;font-weight:700;color:#065f46;margin-bottom:4px;">&#10003; 2FA is Active</div>
                    <div style="font-size:12px;color:#047857;line-height:1.4;">Your account is secured with Google Authenticator (TOTP). Sensitive write operations verify via your authenticator app.</div>
                </div>
                <div style="border-top:1px solid #e5e7eb;padding-top:14px;">
                    <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">Disable Authenticator</div>
                    <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">Enter current 6-digit code from app to disable:</div>
                    <div id="${modalId}Error" style="display:none;margin-bottom:10px;padding:8px;border-radius:6px;font-size:12px;background:#fef2f2;color:#b91c1c;text-align:center;"></div>
                    <div style="display:flex;gap:8px;">
                        <input id="${modalId}DisableCode" type="text" inputmode="numeric" maxlength="6" placeholder="000000" style="flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;font-size:16px;letter-spacing:4px;text-align:center;font-family:monospace;outline:none;">
                        <button id="${modalId}DisableBtn" style="background:#dc2626;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;">Disable 2FA</button>
                    </div>
                </div>
            `;

            const disBtn = modal.querySelector(`#${modalId}DisableBtn`);
            const disInput = modal.querySelector(`#${modalId}DisableCode`);
            const errEl = modal.querySelector(`#${modalId}Error`);

            disBtn.addEventListener('click', async () => {
                const code = disInput.value.replace(/\s+/g, '').trim();
                if (!code) return;
                disBtn.disabled = true;
                try {
                    await _api('/api/auth/totp/disable', { code });
                    const ld = JSON.parse(localStorage.getItem('loginData') || '{}');
                    if (ld.userData) ld.userData.IS_TOTP_ENABLED = false;
                    localStorage.setItem('loginData', JSON.stringify(ld));
                    close();
                    if (typeof window.showToast === 'function') window.showToast('Google Authenticator disabled');
                    else alert('Google Authenticator disabled');
                    if (typeof window.renderUserProfileDetails === 'function') window.renderUserProfileDetails();
                } catch (err) {
                    errEl.textContent = err.message;
                    errEl.style.display = 'block';
                    disBtn.disabled = false;
                }
            });
            disInput.addEventListener('input', () => {
                const val = disInput.value.replace(/\s+/g, '').trim();
                if (val.length === 6 && !disBtn.disabled) disBtn.click();
            });
            disInput.addEventListener('keydown', e => { if (e.key === 'Enter') disBtn.click(); });
            setTimeout(() => disInput.focus(), 60);

        } else {
            try {
                const setupData = await _api('/api/auth/totp/setup', null, 'GET');
                bodyContainer.innerHTML = `
                    <div style="font-size:12px;color:#4b5563;margin-bottom:12px;line-height:1.5;">
                        1. Open <b>Google Authenticator</b> on your mobile phone.<br>
                        2. Tap <b>+</b> and choose <b>Scan a QR code</b>.
                    </div>
                    <div style="text-align:center;margin-bottom:14px;">
                        <img src="${setupData.qr_code}" alt="TOTP QR Code" style="width:170px;height:170px;margin:0 auto;border-radius:8px;border:1px solid #e5e7eb;display:block;">
                    </div>
                    <div id="${modalId}Error" style="display:none;margin-bottom:10px;padding:8px;border-radius:6px;font-size:12px;background:#fef2f2;color:#b91c1c;text-align:center;"></div>
                    <div style="margin-bottom:14px;">
                        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">3. Enter 6-digit code from app:</label>
                        <input id="${modalId}VerifyCode" type="text" inputmode="numeric" maxlength="6" placeholder="000000" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:9px 10px;font-size:16px;letter-spacing:6px;text-align:center;font-family:monospace;outline:none;box-sizing:border-box;">
                    </div>
                    <button id="${modalId}EnableBtn" style="width:100%;background:#10b981;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">Enable 2FA</button>
                `;

                const enableBtn = modal.querySelector(`#${modalId}EnableBtn`);
                const verifyInput = modal.querySelector(`#${modalId}VerifyCode`);
                const errEl = modal.querySelector(`#${modalId}Error`);

                enableBtn.addEventListener('click', async () => {
                    const code = verifyInput.value.replace(/\s+/g, '').trim();
                    if (!code) {
                        errEl.textContent = 'Enter the 6-digit code from app';
                        errEl.style.display = 'block';
                        return;
                    }
                    enableBtn.disabled = true;
                    enableBtn.textContent = 'Activating...';
                    try {
                        await _api('/api/auth/totp/verify-setup', { code });
                        const ld = JSON.parse(localStorage.getItem('loginData') || '{}');
                        if (ld.userData) ld.userData.IS_TOTP_ENABLED = true;
                        localStorage.setItem('loginData', JSON.stringify(ld));
                        close();
                        if (typeof window.showToast === 'function') window.showToast('Google Authenticator activated!');
                        else alert('Google Authenticator activated!');
                        if (typeof window.renderUserProfileDetails === 'function') window.renderUserProfileDetails();
                    } catch (err) {
                        errEl.textContent = err.message;
                        errEl.style.display = 'block';
                        enableBtn.disabled = false;
                        enableBtn.textContent = 'Verify & Activate Authenticator';
                    }
                });
                verifyInput.addEventListener('input', () => {
                    const val = verifyInput.value.replace(/\s+/g, '').trim();
                    if (val.length === 6 && !enableBtn.disabled) enableBtn.click();
                });
                verifyInput.addEventListener('keydown', e => { if (e.key === 'Enter') enableBtn.click(); });
                setTimeout(() => verifyInput.focus(), 60);

            } catch (err) {
                bodyContainer.innerHTML = `<div style="color:#b91c1c;font-size:13px;text-align:center;padding:16px;">Failed to initialize setup: ${err.message}</div>`;
            }
        }
    };

    // ── Manual helpers (used by delivery-OTP + legacy call sites) ────────────
    window.otpRequest = function (otpType, identifier, title = 'Confirm with OTP') {
        return _askModal(otpType, identifier, title);
    };

    window.otpAskCode = function (title = 'Enter OTP', msg = 'An OTP has been sent. Enter it to continue.') {
        const modalId = 'otpAskModal';
        const modal = _ensureModal(modalId, title, msg);
        const resendB = modal.querySelector(`#${modalId}Resend`);
        if (resendB) resendB.remove();
        const input   = modal.querySelector(`#${modalId}Input`);
        const verifyB = modal.querySelector(`#${modalId}Verify`);
        const cancelB = modal.querySelector(`#${modalId}Cancel`);
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
                if (!code) { _msg(modal, modalId, 'Enter the OTP.', 'error'); return; }
                close(resolve, code);
            });
            input.addEventListener('keydown', e => { if (e.key === 'Enter') verifyB.click(); });
            cancelB.addEventListener('click', () => close(reject, new Error('OTP action cancelled')));
            modal.addEventListener('click', e => { if (e.target === modal) close(reject, new Error('OTP action cancelled')); });
            setTimeout(() => input.focus(), 60);
        });
    };

    // ── RULES: endpoint → otp_type + identifier extractor (must mirror the
    //    scope each backend write endpoint consumes — see otp_router.py). ─────
    const _ident = {
        orderWrite:   (p) => p.reference || p.REFERENCE || p.order?.REFERENCE,
        b2b2cUid:     (p) => p.UID || p.uid,
        branchScope:  (p) => p.record_id || null,
        modeWrite:    (p) => p.record_id || 'new',
        modeDelete:   (p) => p.MODE || (p.data && p.data.MODE),
        carrierWrite: (p) => p.record_id || 'new',
        carrierDel:   (p) => p.COMPANY_CODE || (p.data && p.data.COMPANY_CODE),
        rateCode:     (p) => p.CODE,
        uploadUid:    (p, ep) => (ep.match(/\/api\/upload\/([^/?#]+)/) || [])[1] || p.upload_uid || p.UPLOAD_UID,
        shipmentRef:   (p) => p.reference || p.REFERENCE,
        invoiceId:     (p) => p.inv_number || p.invoice_id || p.INV_NUMBER || p.INVOICE_ID,
        docNoVoid:     (p, ep) => (ep.match(/\/api\/ledger\/transactions\/([^/?#]+)\/void/) || [])[1] || p.doc_no || p.invoice_id,
    };

    const _titles = {
        order_write:    'Confirm with OTP',
        b2b2c_write:    'Confirm with OTP',
        branch_write:   'Confirm with OTP',
        mode_write:     'Confirm with OTP',
        carrier_write:  'Confirm with OTP',
        rates_delete:   'Confirm with OTP',
        upload_delete:  'Confirm with OTP',
        charges_write:  'Confirm with OTP',
        movements_write:'Confirm with OTP',
        invoice_revert: 'Confirm Invoice Reversal (2FA / OTP)',
    };

    // [method, pathPrefix, otp_type, identifierFn, actionLabel]
    const RULES = [
        ['PUT',    '/api/editOrder',        'order_write',    _ident.orderWrite,    'Edit order'],
        ['DELETE', '/api/deleteOrder',      'order_write',    _ident.orderWrite,    'Delete order'],
        ['PATCH',  '/api/updateB2B2C',      'b2b2c_write',    _ident.b2b2cUid,      'Update contact'],
        ['DELETE', '/api/deleteB2B2C',      'b2b2c_write',    _ident.b2b2cUid,      'Delete contact'],
        ['POST',   '/api/writeBranch',      'branch_write',   _ident.branchScope,   'Save branch'],
        ['POST',   '/api/deleteBranch',     'branch_write',   _ident.branchScope,   'Delete branch'],
        ['POST',   '/api/writeMode',        'mode_write',     _ident.modeWrite,     'Save mode'],
        ['POST',   '/api/deleteMode',       'mode_write',     _ident.modeDelete,    'Delete mode'],
        ['POST',   '/api/writeCarrier',     'carrier_write',  _ident.carrierWrite,  'Save carrier'],
        ['POST',   '/api/deleteCarrier',    'carrier_write',  _ident.carrierDel,    'Delete carrier'],
        ['DELETE', '/api/upload/',          'upload_delete',  _ident.uploadUid,     'Delete upload'],
        ['PATCH',  '/api/patchCharges',     'charges_write',  _ident.orderWrite,    'Update charges'],
        ['DELETE', '/api/deleteRateList',   'rates_delete',   _ident.rateCode,      'Delete rate list'],
        ['POST',   '/api/deleteShipmentMovements', 'movements_write', _ident.shipmentRef, 'Reset shipment tracking'],
        ['POST',   '/api/unbillInvoice',    'invoice_revert', _ident.invoiceId,     'Unbill / Reverse Invoice'],
        ['POST',   '/api/ledger/transactions/', 'invoice_revert', _ident.docNoVoid, 'Void Transaction / Invoice'],
    ];

    window.OtpGate = {
        rules: RULES,
        ruleFor(endpoint, method, payload) {
            const m = (method || 'GET').toUpperCase();
            // Branch creation is free; edit is OTP gated
            if (endpoint === '/api/writeBranch' && m === 'POST') {
                if (!payload || !payload.record_id) return null; // free creation
                return { otp_type: 'branch_write', identifierFn: _ident.branchScope, title: 'Confirm Branch Edit' };
            }
            for (const [rm, prefix, type, fn, label] of RULES) {
                if (rm === m && endpoint && endpoint.startsWith(prefix)) {
                    if (prefix === '/api/ledger/transactions/' && !endpoint.includes('/void')) continue;
                    return { otp_type: type, identifierFn: fn, title: label || 'Confirm with OTP' };
                }
            }
            return null;
        },
        identifier(rule, payload, endpoint) {
            return rule.identifierFn(payload, endpoint);
        },
        async ask(rule, identifier) {
            if (!identifier) {
                throw new Error('Could not identify the record for OTP confirmation — refresh and try again.');
            }
            return _askModal(rule.otp_type, identifier, rule.title);
        },
    };

})();
