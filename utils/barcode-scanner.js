// ============================================================================
// utils/barcode-scanner.js — Barcode scanning Web Components
//
// Provides two custom HTML elements:
//
//   <scan-barcode>
//     Auto-detects device type:
//       • Mobile  → opens inline camera stream, scans in real-time
//       • Desktop → opens file picker, decodes barcode from selected image
//     Attributes:
//       label="…"   — button text (default: "Scan Barcode")
//       icon-only   — show camera icon only, no label
//
//   <read-barcode>
//     Always opens a file/image picker regardless of device.
//     Use when you explicitly want image-based decoding on any device.
//     Attributes: same as <scan-barcode> (default label: "Read from Image")
//
// Both elements fire the same events (bubbles up the DOM):
//   scanned    → e.detail.value   — the decoded barcode string
//   scan-error → e.detail.message — human-readable error description
//
// Usage:
//   <script type="module" src="utils/barcode-scanner.js"></script>
//
//   <scan-barcode id="s"></scan-barcode>
//   <script>
//     document.getElementById('s').addEventListener('scanned', e => {
//       console.log(e.detail.value);
//     });
//   </script>
// ============================================================================

import { scanBarcode, stopBarcode, readBarcodeFromImage } from './barcode.js';

const _isMobile = () => ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const _SCAN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3 9V6a1 1 0 011-1h3M3 15v3a1 1 0 001 1h3m11-4v3a1 1 0 01-1 1h-3m4-11h-3a1 1 0 00-1 1v3M7 8h10M7 12h10M7 16h4"/>
</svg>`;

const _IMG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4-4 4 4 4-6 4 6M4 6h16"/>
</svg>`;

const _INLINE_SCANNER = `
<div class="scan-wrap" style="display:none;position:relative;border-radius:0.75rem;overflow:hidden;background:#000;margin-top:0.5rem;">
    <video muted playsinline style="width:100%;max-height:220px;object-fit:cover;display:block;"></video>
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;height:60%;border:2px solid rgba(255,255,255,0.6);border-radius:4px;pointer-events:none;">
        <div style="position:absolute;top:0;left:0;width:14px;height:14px;border-top:3px solid #3b82f6;border-left:3px solid #3b82f6;border-radius:2px 0 0 0;"></div>
        <div style="position:absolute;top:0;right:0;width:14px;height:14px;border-top:3px solid #3b82f6;border-right:3px solid #3b82f6;border-radius:0 2px 0 0;"></div>
        <div style="position:absolute;bottom:0;left:0;width:14px;height:14px;border-bottom:3px solid #3b82f6;border-left:3px solid #3b82f6;border-radius:0 0 0 2px;"></div>
        <div style="position:absolute;bottom:0;right:0;width:14px;height:14px;border-bottom:3px solid #3b82f6;border-right:3px solid #3b82f6;border-radius:0 0 2px 0;"></div>
    </div>
    <button class="scan-cancel" type="button" style="position:absolute;top:0.5rem;right:0.5rem;background:rgba(0,0,0,0.55);border:none;border-radius:0.5rem;color:#fff;padding:0.3rem 0.7rem;font-size:0.75rem;font-weight:700;cursor:pointer;">✕ Cancel</button>
    <div style="position:absolute;bottom:0.5rem;left:0;right:0;text-align:center;color:rgba(255,255,255,0.65);font-size:0.7rem;">Align barcode within the box</div>
</div>`;

function _filePickerMode(host, icon, label) {
    host.innerHTML = `
        <label class="btn" style="cursor:pointer;gap:0.4rem;display:inline-flex;align-items:center;">
            ${icon}${label ? `<span>${label}</span>` : ''}
            <input type="file" accept="image/*" style="display:none;">
        </label>
        <span class="rb-status" style="display:none;font-size:0.75rem;color:#6b7280;margin-left:0.5rem;"></span>`;

    const input  = host.querySelector('input');
    const status = host.querySelector('.rb-status');

    host.querySelector('label').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        input.value = '';
        status.textContent = 'Reading…'; status.style.display = 'inline';
        try {
            const value = await readBarcodeFromImage(file);
            status.style.display = 'none';
            host.dispatchEvent(new CustomEvent('scanned',    { bubbles: true, detail: { value } }));
        } catch (e) {
            status.style.display = 'none';
            host.dispatchEvent(new CustomEvent('scan-error', { bubbles: true, detail: { message: e.message } }));
        }
    });
}

// ── <scan-barcode> ────────────────────────────────────────────────────────────
class ScanBarcode extends HTMLElement {
    connectedCallback() {
        const iconOnly = this.hasAttribute('icon-only');
        const label    = iconOnly ? '' : (this.getAttribute('label') || 'Scan Barcode');

        if (_isMobile()) {
            this.innerHTML = `
                <button class="scan-trigger btn" type="button" style="gap:0.4rem;">
                    ${_SCAN_ICON}${label ? `<span>${label}</span>` : ''}
                </button>
                ${_INLINE_SCANNER}`;

            const wrap   = this.querySelector('.scan-wrap');
            const video  = this.querySelector('video');
            const cancel = this.querySelector('.scan-cancel');
            const close  = () => { stopBarcode(); wrap.style.display = 'none'; };

            this.querySelector('.scan-trigger').addEventListener('click', () => {
                wrap.style.display = 'block';
                scanBarcode(
                    video,
                    val => { close(); this.dispatchEvent(new CustomEvent('scanned',    { bubbles: true, detail: { value: val } })); },
                    msg => { close(); this.dispatchEvent(new CustomEvent('scan-error', { bubbles: true, detail: { message: msg } })); }
                );
            });
            cancel.addEventListener('click', close);
        } else {
            _filePickerMode(this, _SCAN_ICON, label);
        }
    }
}

customElements.define('scan-barcode', ScanBarcode);

// ── <read-barcode> ────────────────────────────────────────────────────────────
class ReadBarcode extends HTMLElement {
    connectedCallback() {
        const iconOnly = this.hasAttribute('icon-only');
        const label    = iconOnly ? '' : (this.getAttribute('label') || 'Read from Image');
        _filePickerMode(this, _IMG_ICON, label);
    }
}

customElements.define('read-barcode', ReadBarcode);
