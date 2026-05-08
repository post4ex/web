// ============================================================================
// barcode.js — Live barcode scanner utility
// Uses native BarcodeDetector if available, falls back to zbar-wasm
// Usage: scanBarcode(videoEl, onResult, onError)
//        stopBarcode() — call to stop scanning
// ============================================================================

const BARCODE_FORMATS = ['code_128', 'code_39', 'qr_code', 'ean_13', 'ean_8', 'itf', 'pdf417', 'data_matrix'];

let _rafId = null;
let _stream = null;

export function stopBarcode() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
}

async function _loadZBar() {
    if (window._zbarScan) return window._zbarScan;
    const zbarUrl = new URL('zbar.js', import.meta.url).href;
    await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.type = 'module';
        s.textContent = `
            import { scanImageData } from '${zbarUrl}';
            window._zbarScan = scanImageData;
            window.dispatchEvent(new Event('zbar-ready'));
        `;
        window.addEventListener('zbar-ready', res, { once: true });
        s.onerror = rej;
        document.head.appendChild(s);
    });
    return window._zbarScan;
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

async function _scanZBar(video, canvas, onResult, onError) {
    let scan;
    try {
        scan = await _loadZBar();
    } catch(e) {
        onError('Barcode scanner unavailable.');
        return;
    }
    const ctx = canvas.getContext('2d');
    let last = 0;
    const tick = async (ts) => {
        if (!_stream) return;
        if (ts - last < 100) { _rafId = requestAnimationFrame(tick); return; }
        last = ts;
        if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
            const sw = Math.floor(video.videoWidth  * 0.6);
            const sh = Math.floor(video.videoHeight * 0.6);
            const sx = Math.floor((video.videoWidth  - sw) / 2);
            const sy = Math.floor((video.videoHeight - sh) / 2);
            canvas.width  = sw;
            canvas.height = sh;
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
            try {
                const results = await scan(ctx.getImageData(0, 0, sw, sh));
                if (results.length) { stopBarcode(); onResult(results[0].decode()); return; }
            } catch(_) {}
        }
        _rafId = requestAnimationFrame(tick);
    };
    _rafId = requestAnimationFrame(tick);
}

export async function scanBarcode(videoEl, onResult, onError = console.error) {
    stopBarcode();
    try {
        _stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width:  { ideal: 1920 },
                height: { ideal: 1080 },
            }
        });
        videoEl.srcObject = _stream;
        await videoEl.play();
        const track = _stream.getVideoTracks()[0];
        if (track?.applyConstraints) {
            track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
    } catch(e) {
        onError('Camera access denied.');
        return;
    }

    const canvas = document.createElement('canvas');
    if ('BarcodeDetector' in window) {
        _scanNative(videoEl, canvas, onResult);
    } else {
        _scanZBar(videoEl, canvas, onResult, onError);
    }
}
