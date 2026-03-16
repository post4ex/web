# LCS Project Documentation

## Section 1: Theme and Styling

### Brand Identity
- **Primary Brand Color**: `#9C2007` (Maroon/Red)
  - Used throughout the application for primary actions, headers, and branding
  - Hover state: `#8C1C06` (darker shade)
  - Referenced in: [header.html](header.html), [style.css](style.css)

### Styling Framework

#### Tailwind CSS
- **Version**: 3.4.19
- **Configuration**: [tailwind.config.js](tailwind.config.js)
- **Content Sources**: All HTML files in root (`*.html`)
- **Output**: [style.css](style.css) - Compiled Tailwind CSS with custom utilities
- **Features**:
  - Responsive breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px), 2xl (1536px)
  - Custom container classes with responsive max-widths
  - Utility-first approach for rapid UI development

#### Custom CSS
- **Main Stylesheet**: [style.css](style.css)
- **Size**: Comprehensive utility classes (Tailwind base + custom)
- **Key Custom Components**:
  - **FAB (Floating Action Button)**: Fixed bottom-right positioned action menu
    - Main button: 56x56px circle with brand color
    - Expandable action items with labels
    - Smooth animations and transitions
  - **Dropdown Menus**: High z-index (60) for proper layering
  - **B2B Management Styles**: Custom form inputs, rate tables, tab navigation
  - **Animations**: Sparkle, spin, pulse effects

### Typography

#### Primary Font: Inter
- **Source**: [assets/css/inter-font.css](assets/css/inter-font.css)
- **Weights Available**:
  - 400 (Regular)
  - 500 (Medium)
  - 600 (Semi-bold)
  - 700 (Bold)
- **Loading**: Google Fonts CDN with `font-display: swap` for performance
- **Usage**: Default sans-serif font across the application

#### Monospace Font
- **System Stack**: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
- **Usage**: Code blocks, technical data display

### Icons

#### Font Awesome
- **Version**: 6.5.2 (Free)
- **Source**: [assets/css/fontawesome.css](assets/css/fontawesome.css)
- **Font Files**: [assets/webfonts/](assets/webfonts/)
  - `fa-brands-400.woff2` - Brand icons
  - `fa-regular-400.woff2` - Regular style icons
  - `fa-solid-900.woff2` - Solid style icons
- **License**: Icons (CC BY 4.0), Fonts (SIL OFL 1.1), Code (MIT)
- **Usage**: Navigation icons, status indicators, action buttons throughout the UI

### Images & Logos

#### Logo Files
- **Primary Logo**: [assets/images/pm-logo-2.png](assets/images/pm-logo-2.png) - 124KB (original)
- **Optimized Logo**: [assets/images/pm-logo-200.png](assets/images/pm-logo-200.png) - 16KB (200px, for navbar/header)
- **Alternative Logos**:
  - [assets/images/pm-logo.png](assets/images/pm-logo.png)
  - [assets/images/laxmi-logo.png](assets/images/laxmi-logo.png)

#### Background Images
- [assets/images/office-bg.jpg](assets/images/office-bg.jpg) - Office background
- [assets/images/quote-greeting-img-001.png](assets/images/quote-greeting-img-001.png) - Quote/greeting graphic

### Color Palette

#### Primary Colors (Brand)
- **Blue/Red Variants** (Custom brand color `#9C2007`):
  - `bg-blue-500`, `bg-blue-600`, `bg-blue-800`, `bg-blue-900`
  - `text-blue-600`, `text-blue-700`, `text-blue-800`, `text-blue-900`
  - `border-blue-600`, `border-blue-800`, `border-blue-900`

#### Background Colors
- **Body Background**: Linear gradient `#fef3c7` (amber-100) - Warm, light background
- **Card/Container Backgrounds**: White, gray-50, slate-50
- **Hover States**: Various shades of gray, blue, and contextual colors

#### Status Colors
- **Success**: Green variants (green-50 to green-900)
- **Warning**: Amber/Yellow variants
- **Error**: Red variants (red-50 to red-900)
- **Info**: Cyan/Indigo variants

### Layout Components

#### Header Navigation
- **File**: [header.html](header.html) (24KB)
- **Features**:
  - Role-based navigation (MASTER, ADMIN, AUDITOR, ACCOUNTANT, MANAGER, STAFF, CLIENT, GUEST)
  - Responsive design (desktop + mobile sidebar)
  - Notification system
  - Profile dropdown
  - Dynamic menu rendering based on user permissions
- **Styling**: Brand color header with white text, shadow effects

#### Footer
- **File**: [footer.html](footer.html)
- **Styling**: Consistent with header theme

### Responsive Design
- **Mobile-First Approach**: Base styles for mobile, enhanced for larger screens
- **Breakpoint Strategy**:
  - Mobile: < 640px
  - Tablet: 640px - 1024px
  - Desktop: > 1024px
- **Navigation**: Hamburger menu on mobile, full navigation on desktop

### Performance Optimizations
- **Font Loading**: `font-display: swap` for FOIT prevention
- **Icon Fonts**: Subset loading with unicode-range for Font Awesome
- **Image Optimization**: Resized logo from 124KB to 16KB (87% reduction)
- **CSS**: Single compiled stylesheet with purged unused classes

### Accessibility
- **Screen Reader Support**: `.sr-only` utility class
- **Focus States**: Visible focus rings on interactive elements
- **Color Contrast**: WCAG compliant color combinations
- **Semantic HTML**: Proper heading hierarchy and landmark regions

---

## Section 2: External JavaScript Dependencies and Libraries

### Core Application Scripts (Local)

#### 1. layout.js
- **Location**: [layout.js](layout.js)
- **Size**: ~50KB
- **Purpose**: Central nervous system of the application
- **Key Functions**:
  - Component injection engine (header/footer loading)
  - Data synchronization with Google Apps Script backend
  - Role-Based Access Control (RBAC) enforcement
  - Session management and heartbeat monitoring
  - IndexedDB integration for offline storage
  - Notification system with persistence
  - Theme management (Maroon/Blue)
  - Date formatting (IST timezone)
- **Dependencies**: Requires [indexeddb.js](indexeddb.js)
- **Global Objects Exposed**:
  - `CONSTANTS` - Application configuration
  - `ROLE_LEVELS` - User role hierarchy
  - `DATA_SCHEMA` - Database structure map
  - `showNotification()` - Global notification function
  - `callApi()` - Backend communication
  - `getAppData()` - Data retrieval from IndexedDB
- **Referenced In**: All HTML pages via header/footer injection

#### 2. indexeddb.js
- **Location**: [indexeddb.js](indexeddb.js)
- **Size**: ~15KB
- **Purpose**: High-performance offline data storage wrapper
- **Key Classes**:
  - `AppDatabase` - Main database controller
  - `IndexedDBManager` - Search and query interface
- **Features**:
  - Automatic database initialization
  - Promise-based API
  - Delta sync support (only fetch changed data)
  - Bulk operations for performance
  - Sheet-based organization (RECORD, B2B, STAFF, etc.)
- **Global Objects**:
  - `window.appDB` - Database instance
  - `window.IndexedDBManager` - Query manager
- **Events**: Dispatches `indexedDBReady` when initialized
- **Referenced In**: [layout.js](layout.js), [search.html](search.html)

#### 3. fab.js
- **Location**: [fab.js](fab.js)
- **Size**: ~3KB
- **Purpose**: Floating Action Button (FAB) engine
- **Features**:
  - Page-specific action menus
  - Login-aware (only shows when authenticated)
  - Expandable action items with labels
  - Custom event dispatching
- **Configuration**: [fab-config.js](fab-config.js)
- **Referenced In**: [footer.html](footer.html)

#### 4. fab-config.js
- **Location**: [fab-config.js](fab-config.js)
- **Purpose**: FAB action definitions per page
- **Structure**: `fabPageActions` object with page-specific and global actions
- **Referenced In**: [fab.js](fab.js)

#### 5. calculations.js
- **Location**: [calculations.js](calculations.js)
- **Purpose**: Shipping rate calculations and pricing logic
- **Referenced In**: [Calculator.html](Calculator.html), [BookOrder.html](BookOrder.html)

#### 6. Document Generation Suite
- **docgen.js** - Main document generation controller
- **docs-api.js** - API communication layer
- **docs-config.js** - Document templates configuration
- **docs-db.js** - Database queries for documents
- **docs-gen.js** - PDF/Print generation logic
- **docs-templates.js** - HTML templates for documents
- **docs-validation.js** - Form validation rules
- **Referenced In**: [docs.html](docs.html)

### External CDN Libraries

#### 1. Tailwind CSS
- **Version**: 3.4.19 (via CDN in some pages)
- **CDN URL**: `https://cdn.tailwindcss.com`
- **Purpose**: Utility-first CSS framework
- **Usage**: Dynamic styling in [B2B2C.html](B2B2C.html)
- **Note**: Most pages use compiled [style.css](style.css) instead

#### 2. Google Fonts - Inter
- **CDN URL**: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap`
- **Purpose**: Primary application font
- **Weights**: 400, 500, 600, 700, 800
- **Local Copy**: [assets/css/inter-font.css](assets/css/inter-font.css)
- **Referenced In**: Most HTML pages

### Local JavaScript Libraries (Vendored)

#### 1. Chart.js
- **Location**: [assets/js/chart.js](assets/js/chart.js)
- **Version**: ~3.x
- **Purpose**: Data visualization and charts
- **Features**: Line, bar, doughnut, pie charts
- **Referenced In**: [dashboard.html](dashboard.html)
- **Usage**: Revenue charts, booking trends, shipment status visualization

#### 2. jsPDF
- **Location**: [assets/js/jspdf.umd.min.js](assets/js/jspdf.umd.min.js)
- **CDN Fallback**: `https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js`
- **Purpose**: Client-side PDF generation
- **Referenced In**: [print-template-test.html](print-template-test.html), document generation modules
- **Usage**: Invoice generation, shipping labels, reports

#### 3. html2canvas
- **CDN URL**: `https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js`
- **Version**: 1.4.1
- **Purpose**: HTML to canvas conversion for PDF generation
- **Referenced In**: [print-template-test.html](print-template-test.html)
- **Usage**: Converting HTML templates to images for PDF embedding

#### 4. QRCode.js
- **Location**: [assets/js/qrcode.min.js](assets/js/qrcode.min.js)
- **Purpose**: QR code generation
- **Referenced In**: Document generation, tracking pages
- **Usage**: Generating QR codes for AWB numbers, tracking URLs

#### 5. JsBarcode
- **Location**: [assets/js/JsBarcode.all.min.js](assets/js/JsBarcode.all.min.js)
- **Purpose**: Barcode generation (multiple formats)
- **Formats**: CODE128, EAN, UPC, ITF, MSI, Pharmacode
- **Referenced In**: Shipping label generation, inventory management
- **Usage**: AWB barcode generation for scanning

#### 6. PDF.js
- **Location**: [assets/js/pdf.min.js](assets/js/pdf.min.js), [assets/js/pdf.worker.min.js](assets/js/pdf.worker.min.js)
- **Purpose**: PDF rendering and viewing in browser
- **Referenced In**: Document viewer pages
- **Usage**: Displaying uploaded PDFs, proof of delivery documents

#### 7. Tesseract.js
- **Location**: [assets/js/tesseract.min.js](assets/js/tesseract.min.js)
- **Purpose**: OCR (Optical Character Recognition)
- **Referenced In**: Document upload/processing pages
- **Usage**: Extracting text from scanned documents, automated data entry

#### 8. Cropper.js
- **Location**: [assets/js/cropper.min.js](assets/js/cropper.min.js)
- **CSS**: [assets/css/cropper.min.css](assets/css/cropper.min.css)
- **Purpose**: Image cropping and manipulation
- **Referenced In**: Image upload pages, profile management
- **Usage**: Cropping uploaded images, document scanning

#### 9. CamanJS
- **Location**: [assets/js/caman.full.min.js](assets/js/caman.full.min.js)
- **Purpose**: Canvas-based image manipulation
- **Features**: Filters, adjustments, effects
- **Referenced In**: Image processing workflows
- **Usage**: Enhancing scanned documents, image quality improvement

### B2B Management Module

#### B2B JavaScript Suite
- **Location**: [assets/js/b2b/](assets/js/b2b/)
- **Files**:
  - `b2b-main.js` - Main controller
  - `b2b-api.js` - API communication
  - `b2b-constants.js` - Configuration constants
  - `b2b-data.js` - Data management
  - `b2b-form.js` - Form handling
  - `b2b-rates.js` - Rate calculation logic
  - `b2b-ui.js` - UI components
- **Purpose**: B2B client management system
- **Referenced In**: [B2B.html](B2B.html), [B2B2C.html](B2B2C.html)
- **Features**:
  - Client onboarding
  - Rate card management
  - Contract management
  - Billing integration

### Google Apps Script Backend

#### Primary Deployment
- **URL**: `https://script.google.com/macros/s/AKfycbwQpFOm5EPYPKWpImEHRowtjoCKAgs5AgyAuqVQoOAcze8SzDgXeqzV1UCRz0bRadu5zQ/exec`
- **Purpose**: Main operations backend
- **Actions**:
  - `verifyAndFetchAppData` - Data synchronization
  - `login` / `logout` - Authentication
  - `ping` - Session heartbeat
  - `getData` - Query operations
  - `updateData` - CRUD operations
- **Referenced In**: [layout.js](layout.js) as `CONSTANTS.OPERATIONS_URL`
- **Backend Files**: [gas-backend/](gas-backend/) directory

#### Secondary Endpoints
- **Pincode API**: `AKfycbzZOoT6tp9XVgXiOdiiUL9wWchgGqdBPoTI9BiuT2HyKBIuFzPKPZI4z3kF1IAYBgpn`
- **Order Management**: `AKfycbx5PZJRnnDmyDtYbWctF6d0428h1haJnDfVA4HKQR4hcsdAolcmkhLG9MgntAhPSQyi`
- **Complaint System**: `AKfycbwdEPTko2RsIDO4T3-11nwsCUcVR3jtzC8Xpya5FTqZo13aNWfn1uNhZQ9Zfw_r7hk4aQ`
- **Upload Handler**: `AKfycbwkC3OXNACPPH-LLPJyhkZKaDh6VtNgGbp8lMQbzz1XF327IN_OhFEEapOzNm3REbn5`

### External Service APIs

#### IP Detection
- **Service**: ipify
- **URL**: `https://api.ipify.org?format=json`
- **Purpose**: Client IP address detection for security logging
- **Referenced In**: [layout.js](layout.js) `fetchClientIP()`
- **Timeout**: 2 seconds
- **Fallback**: `0.0.0.0` on failure

### Legacy/External References

#### Post4Ex Integration
- **CSS**: `https://post4ex.github.io/postman/style.css`
- **JS**: `https://post4ex.github.io/postman/layout.js`
- **Referenced In**: [tracking.html](tracking.html), [complaint.html](complaint.html)
- **Status**: Legacy integration, consider migrating to local assets

### Dependency Loading Strategy

#### Critical Path (Blocking)
1. [indexeddb.js](indexeddb.js) - Database initialization
2. [layout.js](layout.js) - Core application logic
3. [header.html](header.html) - Navigation and auth UI
4. [footer.html](footer.html) - FAB and contact modals

#### Deferred Loading (Non-blocking)
1. Chart.js - Only on dashboard
2. PDF libraries - Only on document pages
3. Image processing - Only on upload pages
4. OCR - Only when scanning documents

#### Preload Hints
- **main.html** uses `<link rel="preload">` for:
  - `layout.js`
  - `indexeddb.js`

### Performance Considerations

#### Bundle Sizes
- **Total Vendored JS**: ~2.5MB (minified)
- **Core Application JS**: ~70KB
- **Critical Path JS**: ~65KB (layout + indexeddb)
- **Chart.js**: ~250KB
- **PDF Suite**: ~800KB (jsPDF + html2canvas + PDF.js)
- **Image Processing**: ~1.2MB (Tesseract + Caman + Cropper)

#### Optimization Strategies
1. **Lazy Loading**: Heavy libraries loaded only when needed
2. **CDN Fallbacks**: Local copies for offline functionality
3. **Code Splitting**: B2B module separated from core
4. **Caching**: `force-cache` strategy for components
5. **IndexedDB**: Reduces API calls by 90%+

### Security Features

#### Client-Side Security
- **Session Validation**: Every API call includes sessionID
- **IP Fingerprinting**: Client IP logged with each request
- **User-Agent Tracking**: Browser fingerprinting
- **Idle Timeout**: 30 minutes of inactivity triggers logout
- **Heartbeat**: 5-minute ping to maintain session

#### Data Protection
- **No Sensitive Data in localStorage**: Only session tokens
- **IndexedDB Encryption**: Browser-level encryption
- **HTTPS Only**: All external APIs use HTTPS
- **CORS Protection**: Backend validates origins

---

*Last Updated: 2025*
*Next Section: [Section 3 - Coming Soon]*
