// ============================================================================
// barcode.js — Live barcode scanner utility
// Uses native BarcodeDetector if available, falls back to ZXing (lazy loaded)
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

async function _loadZXing() {
    if (window.ZXing) return window.ZXing;
    await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = new URL('zxing-browser.min.js', import.meta.url).href;
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

async function _scanZXing(video, canvas, onResult, onError) {
    let reader;
    try {
        const ZXing = await _loadZXing();
        reader = new ZXing.MultiFormatReader();
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
            ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
            ZXing.BarcodeFormat.QR_CODE,  ZXing.BarcodeFormat.EAN_13,
            ZXing.BarcodeFormat.EAN_8,    ZXing.BarcodeFormat.ITF,
            ZXing.BarcodeFormat.PDF_417,  ZXing.BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        reader.setHints(hints);
        const ctx = canvas.getContext('2d');
        let last = 0;

        const tick = (ts) => {
            if (!_stream) return;
            if (ts - last < 150) { _rafId = requestAnimationFrame(tick); return; }
            last = ts;
            if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
                // decode center 60% of frame — barcode is usually centered
                const sw = Math.floor(video.videoWidth  * 0.6);
                const sh = Math.floor(video.videoHeight * 0.6);
                const sx = Math.floor((video.videoWidth  - sw) / 2);
                const sy = Math.floor((video.videoHeight - sh) / 2);
                canvas.width  = sw;
                canvas.height = sh;
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
                try {
                    const lum = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
                    // try fast binarizer first, fall back to hybrid
                    for (const Bin of [ZXing.GlobalHistogramBinarizer, ZXing.HybridBinarizer]) {
                        try {
                            const result = reader.decode(new ZXing.BinaryBitmap(new Bin(lum)));
                            if (result) { stopBarcode(); onResult(result.getText()); return; }
                        } catch(_) {}
                    }
                } catch(_) {}
            }
            _rafId = requestAnimationFrame(tick);
        };
        _rafId = requestAnimationFrame(tick);
    } catch(e) {
        console.error('[barcode] ZXing init failed:', e);
        onError('Scanner error: ' + (e?.message || String(e)));
    }
}

export async function scanBarcode(videoEl, onResult, onError = console.error) {
    stopBarcode();
    try {
        _stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width:  { ideal: 1920 },
                height: { ideal: 1080 },
                focusMode:        { ideal: 'continuous' },
                focusDistance:    { ideal: 0 },
                zoom:             { ideal: 1 },
            }
        });
        videoEl.srcObject = _stream;
        await videoEl.play();
        // apply advanced constraints if supported (Android Chrome)
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
        _scanZXing(videoEl, canvas, onResult, onError);
    }
}
