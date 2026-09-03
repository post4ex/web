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
    function _ensureModal(id, titleText, bodyHtml, inputLabel) {
        let modal = document.getElementById(id);
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = id;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);font-family:inherit;';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:14px;width:92%;max-width:360px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
                <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:4px;">${titleText}</div>
                <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">${bodyHtml}</div>
                <div id="${id}Msg" style="display:none;margin-bottom:10px;padding:8px;border-radius:6px;font-size:12px;text-align:center;"></div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
                    <label style="font-size:12px;font-weight:600;color:#374151;white-space:nowrap;">${inputLabel || 'OTP'}</label>
                    <input id="${id}Input" type="text" inputmode="numeric" maxlength="10" autocomplete="one-time-code"
                           placeholder="Enter OTP"
                           style="flex:1;border:1px solid #d1d5db;border-radius:8px;padding:9px 10px;font-size:16px;letter-spacing:6px;text-align:center;font-family:monospace;outline:none;min-width:0;">
                </div>
                <div style="display:flex;gap:8px;">
                    <button id="${id}Verify" style="flex:1;background:#dc2626;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">Verify</button>
                    <button id="${id}Cancel" style="background:#f3f4f6;color:#374151;border:none;border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer;">Cancel</button>
                </div>
                <button id="${id}Resend" style="margin-top:12px;width:100%;background:none;border:none;color:#4f46e5;font-size:12px;cursor:pointer;text-decoration:underline;">Resend OTP</button>
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

    // ── Core ask flow: popup → send OTP → verify → write_token ──────────────
    function _askModal(otpType, identifier, title, bodyHtml) {
        const modalId = 'otpWriteModal';
        const modal = _ensureModal(modalId, title, bodyHtml || 'An OTP has been sent to your email &amp; WhatsApp.');
        const input    = modal.querySelector(`#${modalId}Input`);
        const verifyB  = modal.querySelector(`#${modalId}Verify`);
        const cancelB  = modal.querySelector(`#${modalId}Cancel`);
        const resendB  = modal.querySelector(`#${modalId}Resend`);
        const msgEl    = modal.querySelector(`#${modalId}Msg`);
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
                    _msg(modal, modalId, 'OTP sent to your email & WhatsApp.', 'ok');
                } catch (e) {
                    _msg(modal, modalId, e.message, 'error');
                } finally {
                    resendB.disabled = false;
                }
            };

            verifyB.addEventListener('click', async () => {
                const code = input.value.trim();
                if (!code) { _msg(modal, modalId, 'Enter the OTP.', 'error'); return; }
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
            input.addEventListener('keydown', e => { if (e.key === 'Enter') verifyB.click(); });
            cancelB.addEventListener('click', () => close(reject, new Error('OTP action cancelled')));
            modal.addEventListener('click', e => { if (e.target === modal) close(reject, new Error('OTP action cancelled')); });

            send(false);
            setTimeout(() => input.focus(), 60);
        });
    }

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
        branchScope:  (p) => p.record_id || 'new',
        modeWrite:    (p) => p.record_id || 'new',
        modeDelete:   (p) => p.MODE || (p.data && p.data.MODE),
        carrierWrite: (p) => p.record_id || 'new',
        carrierDel:   (p) => p.COMPANY_CODE || (p.data && p.data.COMPANY_CODE),
        rateCode:     (p) => p.CODE,
        uploadUid:    (p, ep) => (ep.match(/\/api\/upload\/([^/?#]+)/) || [])[1] || p.upload_uid || p.UPLOAD_UID,
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
    };

    // [method, pathPrefix, otp_type, identifierFn, actionLabel]
    const RULES = [
        ['PUT',    '/api/editOrder',        'order_write',   _ident.orderWrite,   'Edit order'],
        ['DELETE', '/api/deleteOrder',      'order_write',   _ident.orderWrite,   'Delete order'],
        ['PATCH',  '/api/updateB2B2C',      'b2b2c_write',   _ident.b2b2cUid,     'Update contact'],
        ['DELETE', '/api/deleteB2B2C',      'b2b2c_write',   _ident.b2b2cUid,     'Delete contact'],
        ['POST',   '/api/writeBranch',      'branch_write',  _ident.branchScope,  'Save branch'],
        ['POST',   '/api/deleteBranch',     'branch_write',  _ident.branchScope,  'Delete branch'],
        ['POST',   '/api/writeMode',        'mode_write',    _ident.modeWrite,    'Save mode'],
        ['POST',   '/api/deleteMode',       'mode_write',    _ident.modeDelete,   'Delete mode'],
        ['POST',   '/api/writeCarrier',     'carrier_write', _ident.carrierWrite, 'Save carrier'],
        ['POST',   '/api/deleteCarrier',    'carrier_write', _ident.carrierDel,   'Delete carrier'],
        ['DELETE', '/api/upload/',          'upload_delete', _ident.uploadUid,    'Delete upload'],
        ['PATCH',  '/api/patchCharges',     'charges_write', _ident.orderWrite,   'Update charges'],
        ['DELETE', '/api/deleteRateList',   'rates_delete',  _ident.rateCode,     'Delete rate list'],
    ];

    window.OtpGate = {
        rules: RULES,
        ruleFor(endpoint, method) {
            const m = (method || 'GET').toUpperCase();
            for (const [rm, prefix, type, fn, label] of RULES) {
                if (rm === m && endpoint && endpoint.startsWith(prefix)) {
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
