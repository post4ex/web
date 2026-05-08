// ============================================================================
// barcode.js — Live barcode scanner utility
// Uses native BarcodeDetector if available, falls back to ZXing (lazy loaded)
// Usage: scanBarcode(videoEl, onResult, onError)
//        stopBarcode() — call to stop scanning
// ============================================================================

const BARCODE_FORMATS = ['code_128', 'code_39', 'qr_code', 'ean_13', 'ean_8', 'itf', 'pdf417', 'data_matrix'];
const ZXING_CDN = '/utils/zxing-browser.min.js';

let _rafId = null;
let _stream = null;
let _zxingReader = null;

export function stopBarcode() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_zxingReader) { try { _zxingReader.reset(); } catch(_) {} _zxingReader = null; }
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
}

async function _loadZXing() {
    if (window.ZXing) return window.ZXing;
    await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = ZXING_CDN;
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
    });
    return window.ZXing;
}

async function _scanNative(video, canvas, onResult) {
    const detector = new BarcodeDetector({ formats: BARCODE_FORMATS });
    const ctx = canvas.getContext('2d');

    const tick = async () => {
        if (!_stream) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            try {
                const results = await detector.detect(canvas);
                if (results.length) { stopBarcode(); onResult(results[0].rawValue); return; }
            } catch(_) {}
        }
        _rafId = requestAnimationFrame(tick);
    };
    _rafId = requestAnimationFrame(tick);
}

async function _scanZXing(video, onResult, onError) {
    try {
        const ZXing = await _loadZXing();
        _zxingReader = new ZXing.BrowserMultiFormatReader();
        await _zxingReader.decodeFromVideoElement(video, (result, err) => {
            if (result) { stopBarcode(); onResult(result.getText()); }
            // err here is just "not found yet" on each frame — not a fatal error
        });
    } catch(e) {
        onError('Camera access denied or scanner unavailable.');
    }
}

export async function scanBarcode(videoEl, onResult, onError = console.error) {
    stopBarcode();
    try {
        _stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        videoEl.srcObject = _stream;
        await videoEl.play();
    } catch(e) {
        onError('Camera access denied.');
        return;
    }

    const canvas = document.createElement('canvas');

    if ('BarcodeDetector' in window) {
        _scanNative(videoEl, canvas, onResult);
    } else {
        _scanZXing(videoEl, onResult, onError);
    }
}
