# GENIE_WEB Uploader — Complete Reference

Two uploaders live in GENIE_WEB:

| Uploader | File | Where it's used |
|---|---|---|
| **Full-page uploader** | `uploader.html` + `jawaS/uploader.js` | Standalone page with its own order list (right panel) |
| **Mini uploader (modal)** | `jawaS/mini-uploader.js` | Self-contained modal injected into any page; the reference/order is passed in via `window.miniUploader.setReference()`. No order list. |

Both share the same engine files:

| File | Contents |
|---|---|
| `core/uploader-image.js` | `compressImage`, `getRotatedImage`, `dataURLtoFile`, `createPdfFromImages` |
| `core/upload-api.js` | `buildUploadPayload`, `submitUpload` (POST `/api/upload`) |
| `utils/uploader-camera.js` | `updateStatus`, `setInterfaceState`, `stopCamera`, `handleVideoStreamClick`, `handlePdfFile`, `renderScroller`, `displayImage`, `initCropper`, `drawPreview`, `scanBarcodeFromPreview`, `onSelectionStart/Move/Up`, `applyEnhancements`, `resetEnhancements`, `runOcrExtraction`, `resetUploader` |

Third-party libraries: **pdf.js 2.16.105**, **Cropper.js** (`utils/cropper.min.js`), **Tesseract.js** (`utils/tesseract.min.js`), **jsPDF 2.5.1**.

---

## 1. Global State

```js
// Data (keyed objects + lookup Maps)
ordersData = {}            // REFERENCE → order record
b2b2cMap   = new Map()     // UID → B2B2C customer record
productMap = new Map()     // REFERENCE → [products]
uploadsMap = new Map()     // REFERENCE → [existing uploads]
allOrdersList = []         // sorted by ORDER_DATE (ascending)
displayedOrders = []       // currently rendered slice
displayDays = 90           // lookback window; "Load More" adds +90
selectedOrder = null       // currently selected order
currentUploadType = null   // null = "All" mode; else POD/Reciept/KYC/Product/MultiBox

// Capture / image state
stream = null              // live camera MediaStream
currentRotation = 0        // preview rotation (0/90/180/270)
isImageLocked = false      // Lock button state
cropper = null             // Cropper.js instance
imageQueue = []            // File[] of captured/uploaded/PDF-page images
currentImageIndex = -1     // active image in the queue
MAX_FILES = 50
isSelecting / selectionRect / isProcessingOCR   // OCR area selection
isProcessingImage = false  // global race-condition lock
selectedPickupRow = null   // highlighted pickup-table row
currentEnhancements = { brightness:0, contrast:0, sharpen:false, greyscale:false, bw:false }
```

---

## 2. Page Layout / Design

### Full-page uploader (`uploader.html`)
- **Tailwind CSS** + custom `<style>` block. Body `bg-gray-100 flex flex-col min-h-screen`.
- **Header/footer** injected from `component-header.html` / `component-footer.html` placeholders (cached in `sessionStorage` to prevent flicker; `core/layout.js` does the loading).
- **Main**: `flex flex-col lg:flex-row`.
  - **Left panel** `w-full lg:w-4/5` (white) — all uploader controls.
  - **Right panel** `w-full lg:w-1/5 lg:max-w-[20%]` (`#f7fafc`) — order list.
- **Desktop (≥1024px):** right panel is `position: sticky; top:0; height:100vh; overflow:hidden`; the list inside scrolls.
- **Mobile (<1024px):** JS physically **moves** the right panel DOM node into `#mobile-order-list-placeholder` (below the status bar), caps it at `max-height:50vh` with internal scroll, and adds a collapse toggle (`#toggleOrderListBtn`, chevron rotates 180° when collapsed; collapsed = `max-height:56px`). Moving back restores the original parent and clears inline styles.
- **Tables → cards on mobile** (`@media max-width:1023px`): `thead` hidden; each `tr` becomes a card with shadow; each `td` becomes a flex row `label : value` using `content: attr(data-label)` as the label. Cells flagged `data-label="N/A"` are hidden. Action cells have no label.
- **Colors:** primary accent `#1E3A8A` (indigo-900), highlights `#4338ca`/`#c7d2fe`, success green `#d4edda`, error red `#f8d7da` / `#dc3545`, banner gray `#e9ecef`.
- **Buttons:** `.v1-btn` (white, gray border, hover `#f0f0f0`), `.btn` (primary), `.btn-danger` (red-tinted), `.btn-danger.active` (inverted navy).

### Mini uploader (`mini-uploader.js`)
- On `DOMContentLoaded` it **injects its own modal HTML** (`_buildUploaderModalHTML()`) into `document.body` — no page HTML needed.
- Modal: fixed overlay `z-50`, dark backdrop, white card `max-w-6xl`, header "Document Uploader" with an SVG close button; clicking the backdrop also closes.
- Same control strip, cropper, preview, status bar, pickup table, staging table, existing-uploads section — all with **inline styles** instead of the stylesheet.

---

## 3. Buttons (full-page uploader)

### Top control strip (`#main-controls-strip`, sticky at top, z-20)
| Button | Behavior |
|---|---|
| **POD / Reciept / KYC / Product / MultiBox** (`data-type`) | Type filters. Click = select, click again = deselect (back to "All"). Active gets `.active`. Re-renders the pickup table if an order is selected. |
| **Camera** | Starts live camera (or captures a frame if already streaming). Label changes to "Capture". |
| **Upload** | Opens `#file-input` (`accept="image/*,application/pdf"`, `multiple`). |
| **Rotate** | Rotates the preview canvas +90° (only visible in preview state). Also re-scans barcode in full-page version. |
| **Lock** | Toggles `isImageLocked`. Locked ⇒ image survives the Pick flow (not cleared). Label toggles Lock/Unlock, background turns green. |
| **Cancel** | Context-sensitive: streaming = "Done" (stop camera, go to cropper) or cancel; preview = remove current image from queue; locked = full reset. |
| **Cancel All** | `resetUploader()` — clears everything. |

### Cropper area
| Button | Behavior |
|---|---|
| **Rotate** | `cropper.rotate(90)` (built-in). |
| **Enhance** | Toggles the enhancement panel. |
| **Crop** | Bakes crop + filters into the final image (see §5). |
| **Cancel** | Destroys cropper, back to preview or full reset. |

### Enhancement panel
| Button | Behavior |
|---|---|
| **Auto** | sharpen=true, brightness=10, contrast=10 (greyscale/bw off); updates sliders + buttons; applies filters. |
| **Greyscale** | `grayscale(100%)`; mutually exclusive with B&W. |
| **B&W Doc** | `grayscale(100%) contrast(170%) brightness(105%)`; mutually exclusive with Greyscale. |
| **Sharpen** | Toggles `currentEnhancements.sharpen` and button highlight only — **no CSS filter is actually applied to the image** (flag is stored but not used in `filterStr`). |
| **Reset** | Zeroes everything. |
| **Brightness / Contrast sliders** | Range −50..+50, mapped to CSS `brightness(100+2b%)` / `contrast(100+2c%)`. |
| **Extract Data (OCR)** | Injected dynamically into the panel 200 ms after an image loads. Runs full-canvas OCR, regex-extracts mobiles / GSTs / PINs, shows an `alert()` with results. |

### Pickup table (dynamic input area) — per selected order
- One row per task with **Pick** button + input(s):
  - **POD**: text input "Status" (default `Delivered`)
  - **Reciept**: text input (default `Booked`)
  - **KYC**: two rows (Consignor + Consignee), each with KYC number input + type `<select>` (Individual: Aadhaar/PAN/Passport/Voter ID/Driving License/NREGA; Business: Partnership Deed/CoI/GST/MoA & AoA/Board Resolution). KYC number is **required**.
  - **Product**: one row per product in `productMap`, doc number + type pre-filled, remark input (default `PAPERS UPLOADED`).
  - **MultiBox**: child AWB input (default = parent AWB).
- Clicking a row (not the button) selects it (`.selected-pickup-row`) so OCR/barcode fills its input.

### Staging table (`#data-table-body`) + actions
| Button | Behavior |
|---|---|
| **Preview** (per row) | `previewFile(url, type)` opens the staged image. |
| **Delete Last** | Removes last staged row, re-renders pickup table, resets image state. |
| **Clear All** | Empties staging table. |
| **Submit** | Uploads each row to `/api/upload` (see §7). |

### Right panel
- **Search input** — live filter on REFERENCE, AWB, consignor/consignee name, DEST_CITY, order date.
- **Order list items** — show AWB/REF (bold indigo), `consignor → consignee`, destination city, date. Click selects the order.
- **Load More (Older)** — adds +90 days to the lookback window.
- **Toggle button** (mobile only) — collapses/expands the order list.

### Existing uploads table
- Shown per selected order (uploads matching REFERENCE). Each row: **Preview** (opens `FILE_URL`), and **Delete** — only for users with `ROLE_LEVELS['MANAGER']` or higher (`deleteUploadRecord(UPLOAD_UID, btn)`).
- Default statuses when remark empty: POD → "Delivered", Reciept → "Booked".

### Mini-uploader differences
- Type strip buttons use `btn-danger`; **KYC is hidden by default** (`hiddenTypes=['KYC']`), enable via `miniUploader.hiddenTypes`.
- **RBAC**: users below `STAFF` (i.e., CLIENT) get `rbacRestrictedTypes = ['Reciept','POD']` — non-overridable.
- `setReferenceWithDefaultType(ref, type)` temporarily hides all types except the given one (auto-clicks it after 200 ms) and restores `hiddenTypes` on `close()`.
- No order list, no search, no markDirty/markClean guard. `close()`/`clear()` wipe staging + selected order.
- Compression is stricter: `compressImage(src, 100, 1024)` (100 KB / 1024 px) vs `200 KB / 2048 px` in the full-page version.

---

## 4. Flows

### 4.1 Page load
1. `navigation-guard.js` → `NavigationGuard.enable()` (dirty/clean tracking; `markDirty()` on capture/pick, `markClean()` on reset/submit/empty).
2. `initializeData()` — binds search, order-list click, load-more, mobile toggle.
3. `initializeV1DataListeners()` — listens for `appDataLoaded` / `appDataRefreshed` events (fired by `layout.js` after sync).
4. All left-panel elements grabbed; canvas contexts set.
5. `resetUploader()` → idle state.
6. **Data load**: waits for IndexedDB (`window.appDB.db` or `indexedDBReady` event, 5 s fallback) → `getAppData()` → `processAppData(data)`; if empty, status "Waiting for app data..." until a sync event arrives.
7. Responsive layout handler runs on load + `resize`.
8. Barcode detector instantiated if supported (`code_128, code_39, ean_13, qr_code, upc_a, itf`).

### 4.2 Data → processAppData(detail)
- Stores `ordersData`; rebuilds `b2b2cMap` (by UID), `productMap` (by REFERENCE), `uploadsMap` (by REFERENCE).
- `allOrdersList` = orders sorted ascending by `ORDER_DATE` (parsed via `parseDate`).
- Re-renders list (`filterAndRenderOrders`) and re-renders pickup table if an order is selected; `updateStatus('App data loaded. Ready.')`.

### 4.3 Order selection
Click `li[data-order-ref]` → `selectedOrder = ordersData[ref]` → re-render list (highlight `.selected`) → `renderDynamicInputs()`. On mobile (<1024px) auto-collapses the panel and smooth-scrolls to the tasks.

### 4.4 renderDynamicInputs() — builds the pickup table
1. Clears `#dynamic-input-area`, clears row selection, hides existing uploads.
2. No order ⇒ placeholder "Select an order from the list...".
3. Resolves consignor/consignee names from `b2b2cMap` (fallback `UID: x`).
4. **`checkUploadStatus(ref, awb)`**: scans staged rows **and** existing uploads.
   - POD already staged/exists ⇒ show green message "POD already uploaded…" + existing uploads, **stop** (no other tasks).
   - Reciept already uploaded ⇒ skip Reciept row.
5. Renders rows for the active type (or all types when `currentUploadType === null`).
6. Renders the **Existing Uploads** table for this order.

### 4.5 Camera flow
- **Chrome / others:** `navigator.mediaDevices.getUserMedia` with a fallback chain of constraints — `exact:environment` @4096 → @1920 → `exact` no size → `ideal` environment. On success: continuous autofocus via `applyConstraints({advanced:[{focusMode:'continuous'}]})`; Firefox gets an `ImageCapture(track).grabFrame()` poke after 600 ms to trigger hardware autofocus. UI → `setInterfaceState('streaming')`; tapping the video (`handleVideoStreamClick`) captures another frame.
- **Firefox fallback:** native `<input type="file" accept="image/*" capture="environment">`; the chosen photo is center-cropped to a square on a canvas and loaded straight into the cropper.
- **Capture frame** (button or tap): draw the **center square crop** of the video (`size = min(vw,vh)`, offset `(vw-size)/2`), `canvas.toBlob('image/jpeg', 0.95)`, wrap in `File('capture-<timestamp>.jpg')`. In the full-page uploader the button capture stops the camera and enters single-capture cropper mode; tapping the video keeps the stream open and appends to the queue (Cancel becomes green "Done" once >0 images).

### 4.6 Upload flow (files)
`fileInput` change → for each file:
- `application/pdf` → `handlePdfFile(file)` → array of JPEG page-files pushed in.
- `image/*` → pushed as-is.
- Truncated to `MAX_FILES` (50) with a warning if exceeded.
- `imageQueue = processedFiles`; scroller shown if >1; `displayImage(0)` → cropper for the first image. Status: "N image(s) loaded."

### 4.7 PDF processing — exact steps (`handlePdfFile`)
1. Ensure `pdfjsLib.GlobalWorkerOptions.workerSrc` (pdf.worker.min.js CDN).
2. `FileReader.readAsArrayBuffer` → `pdfjsLib.getDocument(typedarray).promise`.
3. For each page (stopping at `MAX_FILES` total): `page.getViewport({scale:2.0})` → render onto a canvas at 2× resolution → `canvas.toBlob('image/jpeg', 0.9)` → `File('<name>-page-<i>.jpg')`.
4. **Result: one JPEG image per PDF page**, all pushed into `imageQueue` — each page is handled like a normal image (scroller, cropper, pick).
5. A single PDF yields multiple queue items; **multi-PDF selection** just concatenates all their page-images into the queue (each capped by the global 50 limit).

---

## 5. Image processing pipeline

```
capture/upload/PDF-page
   │  File in imageQueue
   ▼
displayImage(i) → initCropper(URL.createObjectURL(file))
   │  Cropper.js: viewMode 1, autoCropArea 0.95, zoomable/movable/scalable
   │  +200ms auto "Auto" enhance + OCR button injected
   ▼
Crop (Confirm)
   │  cropper.getCroppedCanvas(min 256, max 4096, fill #fff, smoothing high)
   │  bake CSS filter into canvas (fCtx.filter = filterStr, redraw)
   │  toDataURL('image/jpeg', 0.95)
   │  → hidden <img id="image-preview"> (source only, never displayed)
   │  → dataURLtoFile() replaces the File in imageQueue
   ▼
Preview state (visible <canvas id="preview-canvas">)
   │  drawPreview(): DPR-aware; contain-fit; rotation applied at center
   │  Rotate → currentRotation+90 → redraw → rescan barcode
   ▼
Pick (row button)
   │  getRotatedImage(imagePreview.src, currentRotation)   → PNG (lossless)
   │  compressImage(rotated, 200 KB, 2048 px)              → JPEG quality loop
   │  (mini-uploader: 100 KB / 1024 px)
   ▼
staged row (dataset.submitData + dataset.images)  → Submit
```

### Details
- **drawPreview**: canvas sized to container × `devicePixelRatio`; image contain-fitted (`imgAspect` vs `contAspect`); translated to center, rotated by `currentRotation`, drawn.
- **getRotatedImage**: canvas dims swap for 90/270; `ctx.translate/rotate/drawImage`; returns **PNG** to avoid quality loss before compression.
- **compressImage**: loads image, downscales longest side to ≤2048 (or 1024), draws, then a quality loop — start `0.9`, re-encode at `quality -= 0.1` while size > target and quality > 0.1. Returns final JPEG dataURL. Logs size in KB.
- **Rotate before pick** is why preview rotation is stored in `currentRotation` and applied again in `getRotatedImage` (the hidden img stays unrotated).
- OCR region selection un-rotates the drawn selection box back to image coordinates before cropping from the hidden image.

### Cropping (`initCropper` / confirm)
- Cropper options: `viewMode:1`, `background:false`, `autoCrop:true`, `autoCropArea:0.95`, zoomable/movable/scalable.
- Crop uses `minWidth/minHeight 256`, `maxWidth/maxHeight 4096`, white fill.
- Enhancement filters are **baked in** at crop time (filter applied to a copy canvas), so the staged image has the filters.
- After crop the file in the queue is replaced (file name becomes `.png`-suffixed, type still image/jpeg) and the scroller thumbnail refreshes.

### Enhancements
- `currentEnhancements` → `filterStr`:
  - `bw` → `grayscale(100%) contrast(170%) brightness(105%)`
  - `greyscale` → `grayscale(100%)`
  - else → `brightness(100+2b%) contrast(100+2c%)`
- Applied **live** to `.cropper-canvas img` and `.cropper-view-box img` (hardware-accelerated CSS, replacing old CamanJS).
- Auto-enhance fires 200 ms after each image loads in the cropper.

### OCR / barcode
- **Barcode** (`scanBarcodeFromPreview`): `BarcodeDetector.detect(hiddenImg)`; if a pickup row is selected, fill its first text input; else match order by REFERENCE or AWB; else put value in the search box and filter.
- **Selection OCR** (`onSelectionStart/Move/Up`): drag a red rectangle on the overlay canvas → coords un-rotated → crop from hidden image → `Tesseract.recognize(cropCanvas, 'eng')` → whitespace-stripped text → same three targets (selected row → order match → search box).
- **Extract Data (OCR)**: full cropped canvas → Tesseract → regex: mobiles `(?:\+91|91)?\s*[6-9]\d{9}`, GSTIN `\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d][Z][A-Z\d]`, PIN `\b\d{6}\b` → deduped → `alert()`.

---

## 6. Pick flow — staging, bundling, rules

1. Click **Pick** (guarded by `isProcessingImage` lock; button shows "Picking...").
2. **Image check**: `imagePreview.src` must start with `data:` (cropped image loaded), else error status.
3. **Gather row data** from the pickup row inputs:
   - POD/Reciept → status remark (`Delivered`/`Booked` defaults)
   - KYC → required KYC number + type (focuses input if empty)
   - Product → doc number/type + remark (default `PAPERS UPLOADED`)
   - MultiBox → child AWB (default parent AWB)
4. **Process image**: `getRotatedImage` → `compressImage`.
5. **Bundle key** (`groupKey`) — same key ⇒ merge into the existing staged row:
   - KYC → `KYC_<ref>_<customerUid>`
   - Product → `PROD_<ref>_<docNumber>`
   - MultiBox → `MULTI_<awbNumber>`
   - POD / Reciept → **no key** ⇒ always a new row.
   - Merging: image appended to `dataset.images`; status cell → `"<Type> (N images)"`; thumbnail updated.
6. **New row**: `dataset.keyRef`, `keyType`, `imageData`, `images` (JSON array), `submitData` (JSON), optional `groupKey`; cells: Status / Reference-AWB / Customer-KYC / Doc-Info / Action (Preview) / hidden Branch-Code. `markDirty()`.
7. **Cleanup**: clear pickup-row inputs, deselect row, `renderDynamicInputs()` (hides the just-picked task; triggers the POD-complete check).
8. **Image reset**: unless locked — remove current image from queue, advance to next (or reset if queue empty).

---

## 7. Submit flow — single image vs multi-image bundle

`Submit` → guard checks (processing lock, rows exist, logged in) → disable button → loop rows:

- Row already green (submitted) → skip.
- `rowData = JSON.parse(dataset.submitData)`, `images = JSON.parse(dataset.images)`.
- **1 image** → `fileData = dataUrl.split(',')[1]` (base64), `contentType = 'image/jpeg'`.
- **>1 image** → `createPdfFromImages(images)`:
  - jsPDF **A4 portrait**, 10 mm margins, image width = 190 mm.
  - Load each image to get aspect ratio; height = 190 × ratio; if taller than 277 mm, scale to fit height.
  - `doc.addImage(imgData, 'JPEG', 10, 10, w, h)`; **one page per image**.
  - Returns `datauristring` → base64 stripped → `contentType = 'application/pdf'`.
- `buildUploadPayload(rowData, fileData, contentType)`:
  ```
  upload_type, content_type, data(base64),
  reference, awb_number, branch, code, status_remark,
  child_awb, customer_uid, kyc_number, kyc_type,
  doc_number, doc_type
  ```
- `submitUpload(payload)` → `callApi('/api/upload', payload)`.
- Success → row green (`#d4edda`), `dataset.fileUrl = result.url`; failure → row red (`#f8d7da`), row number added to failed list.
- Finish: green "All N row(s) submitted successfully" → `markClean()` → auto `clearAllBtn.click()` after 2 s. Red: "Failed rows: … Fix and retry."

**So:** multi-**image** uploads (repeated KYC/Product/MultiBox picks, or any groupKey merge) become a **single PDF**; a multi-**page PDF** input becomes multiple **independent JPEGs** (one per page) that can be picked separately.

---

## 8. Reset / interface states

- `setInterfaceState(state)` — `streaming` (Camera→"Capture", hide Upload/type-strip, show Cancel), `preview` (show Rotate/Lock/Cancel/Cancel-All, selectable area), `idle`.
- `resetUploader()` — stops camera, clears queue/scroller/cropper, hides preview & cropper, resets rotation/lock, `markClean()`, status "Select an order or start capture". Called by Cancel All, Delete Last, Clear All, and when queues empty out.
