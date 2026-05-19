// web/components/barcode-scanner.js

import { scanBarcode, stopBarcode } from '../utils/barcode.js';

class BarcodeScanner extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.videoEl = null;
        this.scanWrap = null;
        this.scanCancelBtn = null;
        this.scanButton = null;
    }

    connectedCallback() {
        this.shadowRoot.innerHTML = `
            <style>
                /* Host styles */
                :host {
                    display: block; /* Custom elements are inline by default */
                }

                /* --- SCANNER STYLES --- */
                .barcode-scan-btn {
                    display: none; /* Hidden by default, shown if camera available */
                    position: absolute;
                    right: 0.75rem;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0.25rem;
                    color: rgba(0,0,0,0.45);
                }
                .barcode-scanner-wrap {
                    display: none;
                    position: relative;
                    margin-bottom: 0.875rem;
                    border-radius: 0.875rem;
                    overflow: hidden;
                    background: #000;
                }
                .barcode-video {
                    width: 100%;
                    max-height: 220px;
                    object-fit: cover;
                    display: block;
                }
                /* scan region indicator */
                .scan-region {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%,-50%);
                    width: 60%;
                    height: 60%;
                    border: 2px solid rgba(255,255,255,0.7);
                    border-radius: 4px;
                    pointer-events: none;
                }
                .scan-corner.top-left {
                    position: absolute;
                    top: 0; left: 0;
                    width: 16px; height: 16px;
                    border-top: 3px solid #3b82f6;
                    border-left: 3px solid #3b82f6;
                    border-radius: 2px 0 0 0;
                }
                .scan-corner.top-right {
                    position: absolute;
                    top: 0; right: 0;
                    width: 16px; height: 16px;
                    border-top: 3px solid #3b82f6;
                    border-right: 3px solid #3b82f6;
                    border-radius: 0 2px 0 0;
                }
                .scan-corner.bottom-left {
                    position: absolute;
                    bottom: 0; left: 0;
                    width: 16px; height: 16px;
                    border-bottom: 3px solid #3b82f6;
                    border-left: 3px solid #3b82f6;
                    border-radius: 0 0 0 2px;
                }
                .scan-corner.bottom-right {
                    position: absolute;
                    bottom: 0; right: 0;
                    width: 16px; height: 16px;
                    border-bottom: 3px solid #3b82f6;
                    border-right: 3px solid #3b82f6;
                    border-radius: 0 0 2px 0;
                }
                .barcode-cancel-btn {
                    position: absolute;
                    top: 0.5rem;
                    right: 0.5rem;
                    background: rgba(0,0,0,0.55);
                    border: none;
                    border-radius: 0.5rem;
                    color: #fff;
                    padding: 0.3rem 0.7rem;
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: pointer;
                }
                .scan-msg {
                    position: absolute;
                    bottom: 0.5rem;
                    left: 0; right: 0;
                    text-align: center;
                    color: rgba(255,255,255,0.7);
                    font-size: 0.7rem;
                }
                .track-input-wrap {
                    position: relative;
                    margin-bottom: 0.875rem;
                }
            </style>
            <div class="track-input-wrap">
                <slot name="input-icon"></slot>
                <slot name="track-input"></slot>
                <button id="barcode-scan-btn" title="Scan barcode" class="barcode-scan-btn">
                    <i class="fa-solid fa-camera" style="font-size:1rem;"></i>
                </button>
            </div>
            <div id="barcode-scanner-wrap" class="barcode-scanner-wrap">
                <video id="barcode-video" muted playsinline class="barcode-video"></video>
                <div class="scan-region">
                    <div class="scan-corner top-left"></div>
                    <div class="scan-corner top-right"></div>
                    <div class="scan-corner bottom-left"></div>
                    <div class="scan-corner bottom-right"></div>
                </div>
                <button id="barcode-cancel" class="barcode-cancel-btn">✕ Cancel</button>
                <div class="scan-msg">Align barcode within the box</div>
            </div>
            <slot name="track-button"></slot>
        `;
        this.videoEl = this.shadowRoot.getElementById('barcode-video');
        this.scanWrap = this.shadowRoot.getElementById('barcode-scanner-wrap');
        this.scanCancelBtn = this.shadowRoot.getElementById('barcode-cancel');
        this.scanButton = this.shadowRoot.getElementById('barcode-scan-btn');

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            this.scanButton.style.display = 'block';
        }

        this.scanButton.addEventListener('click', this.openScanner.bind(this));
        this.scanCancelBtn.addEventListener('click', this.closeScanner.bind(this));
    }

    async openScanner() {
        this.scanWrap.style.display = 'block';
        scanBarcode(
            this.videoEl,
            (val) => {
                this.closeScanner();
                this.dispatchEvent(new CustomEvent('barcode-scanned', { detail: val }));
            },
            (err) => {
                this.closeScanner();
                console.error('Barcode scan error:', err);
                this.dispatchEvent(new CustomEvent('barcode-error', { detail: err }));
            }
        );
    }

    closeScanner() {
        stopBarcode();
        this.scanWrap.style.display = 'none';
    }
}

customElements.define('barcode-scanner', BarcodeScanner);
