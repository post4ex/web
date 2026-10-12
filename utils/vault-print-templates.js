// ============================================================================
// utils/vault-print-templates.js — Print template generators for Vault tiles
// Every function opens a print-friendly popup window for the given entry data
// ============================================================================

const VaultPrint = (() => {

    // ── Helpers ──────────────────────────────────────────────────────────────
    function _esc(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _fmtDate(v, t) {
        if (!v) return 'N/A';
        try { return (typeof fmtDate === 'function') ? fmtDate(v, t || 'date') : new Date(v).toLocaleDateString(); }
        catch { return String(v); }
    }

    function _coaName(code) {
        if (!code) return '';
        // Try global COA map if available
        // In vault tiles, _coaName is usually local — here we do a best-effort lookup
        return code;
    }

    function _parseNarration(entry) {
        try {
            const p = JSON.parse(entry.NARRATION || '{}');
            if (p.charges || p.grand_total !== undefined) return p;
        } catch (_) {}
        return null;
    }

    function _openPrintWindow(title, bodyHtml) {
        const css = `
        @import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;500;600;700&display=swap');
        body{font-family:'Comfortaa',sans-serif;font-size:12px;color:#0f172a;margin:0;padding:20px;background:#f8fafc;-webkit-font-smoothing:antialiased}
        .box{max-width:800px;margin:auto;background:#fff;padding:30px;border:1px solid #eee;box-shadow:0 0 10px rgba(0,0,0,.15);position:relative}
        h1,h2,h3{color:#1a1a2e}
        table{width:100%;border-collapse:collapse;margin-bottom:15px}th,td{padding:7px 10px;border:1px solid #ccc;text-align:left}
        th{background:#1a1a2e;color:#fff;font-size:11px;text-transform:uppercase}
        .tr{text-align:right}.tc{text-align:center}.tl{text-align:left}
        .sub{color:#666;font-size:11px}.b{font-weight:bold}
        .hdr{border-bottom:2px solid #1a1a2e;padding-bottom:12px;margin-bottom:20px}
        .hdr-l{font-size:22px;font-weight:bold;color:#1a1a2e}
        .hdr-r{text-align:right;font-size:12px;color:#555}
        .info-row{display:flex;justify-content:space-between;gap:20px;margin-bottom:20px}
        .info-box{width:48%;padding:12px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px}
        .info-box h3{margin:0 0 6px;font-size:12px;color:#1a1a2e;text-transform:uppercase;border-bottom:1px solid #ddd;padding-bottom:4px}
        .info-box p{margin:2px 0;font-size:11px;color:#333}
        .info-box .lbl{color:#888;font-size:10px}
        .total-row{background:#e8eaf6;font-weight:bold}
        .totals{display:flex;justify-content:space-between;margin:15px 0}
        .totals-box{width:48%}
        .footer{margin-top:30px;padding-top:15px;border-top:2px solid #1a1a2e;font-size:10px;color:#888;text-align:center}
        .sig{float:right;text-align:center;margin-top:40px;min-width:200px}
        .sig-line{width:180px;border-top:1px solid #000;margin:0 auto 5px;padding-top:50px}
        .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:120px;color:rgba(0,0,0,0.03);font-weight:bold;pointer-events:none;z-index:0}
        .content{position:relative;z-index:1}
        .no-print{text-align:center;margin-bottom:15px}
        .no-print button{padding:8px 20px;margin:3px;border:none;border-radius:4px;cursor:pointer;font-weight:600}
        .no-print .print-btn{background:#1a1a2e;color:#fff}
        .no-print .close-btn{background:#6b7280;color:#fff}
        @media print{@page{size:A4;margin:10mm}body{background:#fff;padding:0}.box{box-shadow:none;border:none}.no-print{display:none}}
        `;
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${css}</style></head><body>
        <div class="no-print"><button class="print-btn" onclick="window.print()">🖨️ Print</button><button class="close-btn" onclick="window.close()">✕ Close</button></div>
        <div class="box"><div class="watermark">${title}</div><div class="content">${bodyHtml}</div></div>
        <script>window.onload=function(){setTimeout(function(){document.querySelectorAll('.no-print').forEach(function(e){e.style.display='block'})},500)}<\\/script>
        </body></html>`;
        const w = window.open('', title.replace(/[^a-zA-Z0-9]/g, '_'));
        if (!w) { alert('Pop-up blocked! Please allow pop-ups.'); return; }
        w.document.write(html);
        w.document.close();
    }

    // ── Global Generic Print Engine ──────────────────────────────────────────
    function printDocument(config) {
        if (!config) return;

        // Title and Meta header
        const metaHtml = Object.entries(config.meta || {})
            .map(([k, v]) => `<div><strong>${_esc(k)}:</strong> ${_esc(v)}</div>`)
            .join('');

        const headerHtml = `
            <div class="hdr">
                <div class="hdr-l">${_esc(config.title || 'DOCUMENT')}</div>
                <div class="hdr-r">
                    ${metaHtml}
                </div>
            </div>`;

        // Info boxes
        let infoRowHtml = '';
        if (config.leftBox || config.rightBox) {
            infoRowHtml += '<div class="info-row">';
            if (config.leftBox) {
                const linesHtml = (config.leftBox.lines || [])
                    .map(line => {
                        if (line.includes(':')) {
                            const pivot = line.indexOf(':');
                            const label = line.substring(0, pivot);
                            const val = line.substring(pivot + 1);
                            return `<p><span class="lbl">${_esc(label)}:</span>${_esc(val)}</p>`;
                        }
                        return `<p><strong>${_esc(line)}</strong></p>`;
                    })
                    .join('');
                infoRowHtml += `
                    <div class="info-box">
                        <h3>${_esc(config.leftBox.title || '')}</h3>
                        ${linesHtml}
                    </div>`;
            }
            if (config.rightBox) {
                const linesHtml = (config.rightBox.lines || [])
                    .map(line => {
                        if (line.includes(':')) {
                            const pivot = line.indexOf(':');
                            const label = line.substring(0, pivot);
                            const val = line.substring(pivot + 1);
                            return `<p><span class="lbl">${_esc(label)}:</span>${_esc(val)}</p>`;
                        }
                        return `<p><strong>${_esc(line)}</strong></p>`;
                    })
                    .join('');
                infoRowHtml += `
                    <div class="info-box">
                        <h3>${_esc(config.rightBox.title || '')}</h3>
                        ${linesHtml}
                    </div>`;
            }
            infoRowHtml += '</div>';
        }

        // Table
        let tableHtml = '';
        if (config.table) {
            const ths = (config.table.headers || [])
                .map(h => {
                    const low = h.toLowerCase();
                    const isNum = low.includes('amount') || low.includes('debit') || low.includes('credit') || low.includes('₹') || low.includes('rate') || low.includes('price') || low.includes('total');
                    return `<th class="${isNum ? 'tr' : ''}">${_esc(h)}</th>`;
                })
                .join('');
            
            const rowsHtml = (config.table.rows || [])
                .map(row => {
                    const tds = row.map((cell, idx) => {
                        const lowH = (config.table.headers && config.table.headers[idx]) ? config.table.headers[idx].toLowerCase() : '';
                        const isNumericHeader = lowH.includes('amount') || lowH.includes('debit') || lowH.includes('credit') || lowH.includes('₹') || lowH.includes('rate') || lowH.includes('price') || lowH.includes('total');
                        const isNumericCell = typeof cell === 'number' || String(cell).startsWith('₹') || (!isNaN(parseFloat(cell)) && isNumericHeader);
                        return `<td class="${isNumericCell ? 'tr' : ''}">${_esc(cell)}</td>`;
                    }).join('');
                    return `<tr>${tds}</tr>`;
                }).join('');

            let tfootsHtml = '';
            if (config.table.totals) {
                tfootsHtml = config.table.totals.map((totalRow, idx) => {
                    const isLast = idx === config.table.totals.length - 1;
                    const style = isLast ? 'style="background:#1a1a2e;color:#fff;font-weight:bold"' : 'class="total-row"';
                    const tds = totalRow.map((cell, cellIdx) => {
                        const isNumeric = typeof cell === 'number' || String(cell).startsWith('₹') || (cellIdx > 0 && !isNaN(parseFloat(cell)));
                        return `<td class="${isNumeric ? 'tr' : ''}">${_esc(cell)}</td>`;
                    }).join('');
                    return `<tr ${style}>${tds}</tr>`;
                }).join('');
            }

            tableHtml = `
                <table>
                    <thead><tr>${ths}</tr></thead>
                    <tbody>${rowsHtml}</tbody>
                    ${tfootsHtml ? `<tfoot>${tfootsHtml}</tfoot>` : ''}
                </table>`;
        }

        // Notes / Narration
        let notesHtml = '';
        if (config.notes) {
            notesHtml = `<div style="padding:12px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:15px"><strong>📝 Narration/Notes:</strong> ${_esc(config.notes)}</div>`;
        }

        // Signatory
        let sigHtml = '';
        if (config.signatory) {
            sigHtml = `
                <div class="sig">
                    <div class="sig-line"></div>
                    <div><strong>${_esc(config.signatory)}</strong></div>
                    ${config.signatorySub ? `<div class="sub">${_esc(config.signatorySub)}</div>` : ''}
                </div>`;
        }

        // Footer
        const footerHtml = `
            <div class="footer">
                This is a computer-generated document. Valid without signature.<br>
                Generated on: ${new Date().toLocaleString()}
            </div>`;

        const bodyHtml = `
            ${headerHtml}
            ${infoRowHtml}
            ${tableHtml}
            ${notesHtml}
            ${sigHtml}
            <div style="clear:both"></div>
            ${footerHtml}`;

        _openPrintWindow(config.title || 'Document', bodyHtml);
    }

    // ── Charge breakdown table builder (used by invoices, credit/debit notes) ─
    function _chargeTable(parsed, grandTotal) {
        if (!parsed) return '';
        const charges = parsed.charges || {};
        const chgNames = {fright:'Freight', fuel_chg:'Fuel Surcharge', cod_chg:'COD Charges', topay_chg:'ToPay Charges',
                          fov_chg:'Insurance (FOV)', eway_chg:'E-Way Charges', awb_chg:'AWB Charges', pack_chg:'Packaging', dev_chg:'Development'};
        const chargeRows = Object.keys(chgNames)
            .filter(k => (charges[k]||0) > 0)
            .map(k => `<tr><td>${chgNames[k]}</td><td class="tr">${(+charges[k]).toFixed(2)}</td></tr>`)
            .join('');
        const subtotal = parsed.charges_subtotal || 0;
        const taxable = parsed.taxable || 0;
        const sgst = parsed.sgst || 0;
        const cgst = parsed.cgst || 0;
        const igst = parsed.igst || 0;
        const taxRate = parsed.tax_percent || 0;
        const isInter = parsed.is_inter_state || false;
        const totalTax = sgst + cgst + igst;
        const description = parsed.description || '';

        let rows = '';
        if (description) rows += `<tr><td colspan="2" class="sub" style="padding:8px;background:#f9f9f9"><strong>📝 ${_esc(description)}</strong></td></tr>`;
        if (chargeRows) {
            rows += `<tr><th colspan="2" style="background:#e8eaf6;color:#1a1a2e">Operating Charges</th></tr>`;
            rows += chargeRows;
            rows += `<tr class="total-row"><td>Charges Subtotal</td><td class="tr">${subtotal.toFixed(2)}</td></tr>`;
        }
        if (taxable > 0) {
            rows += `<tr><th colspan="2" style="background:#e8eaf6;color:#1a1a2e">Tax Details</th></tr>`;
            rows += `<tr><td>Taxable Value</td><td class="tr">${taxable.toFixed(2)}</td></tr>`;
            if (!isInter) {
                if (sgst > 0) rows += `<tr><td>SGST @ ${taxRate/2}%</td><td class="tr">${sgst.toFixed(2)}</td></tr>`;
                if (cgst > 0) rows += `<tr><td>CGST @ ${taxRate/2}%</td><td class="tr">${cgst.toFixed(2)}</td></tr>`;
            } else {
                if (igst > 0) rows += `<tr><td>IGST @ ${taxRate}%</td><td class="tr">${igst.toFixed(2)}</td></tr>`;
            }
            if (totalTax > 0) rows += `<tr class="total-row"><td>Total Tax</td><td class="tr">${totalTax.toFixed(2)}</td></tr>`;
        }
        rows += `<tr style="background:#1a1a2e;color:#fff;font-weight:bold"><td style="font-size:14px">GRAND TOTAL</td><td class="tr" style="font-size:16px">₹${(grandTotal||0).toFixed(2)}</td></tr>`;
        return `<table>${rows}</table>`;
    }

    // ── 1. SALES INVOICE ─────────────────────────────────────────────────────
    function printSalesInvoice(entry) {
        const parsed = _parseNarration(entry);
        const charges = parsed?.charges || {};
        const grandTotal = parsed?.grand_total || +entry.DEBIT || 0;
        const invNum = entry.INV_NUMBER || entry.INVOICE_ID || 'N/A';
        const clientName = entry.CLIENT_NAME || entry.CODE || 'N/A';

        const body = `
            <div class="hdr">
                <div class="hdr-l">TAX INVOICE</div>
                <div class="hdr-r">
                    <div><strong>Invoice #:</strong> ${invNum}</div>
                    <div><strong>Date:</strong> ${_fmtDate(entry.ENTRY_DATE)}</div>
                    <div><strong>Status:</strong> ${entry.STATUS || ''}</div>
                </div>
            </div>
            <div class="info-row">
                <div class="info-box">
                    <h3>Bill To</h3>
                    <p><strong>${_esc(clientName)}</strong></p>
                    <p><span class="lbl">Code:</span> ${entry.CODE || 'N/A'}</p>
                    <p><span class="lbl">GST:</span> ${entry.CLIENT_GST || 'N/A'}</p>
                    <p><span class="lbl">Branch:</span> ${entry.BRANCH_NAME || entry.BRANCH || 'N/A'}</p>
                    <p><span class="lbl">POS:</span> ${entry.POS || 'N/A'}</p>
                </div>
                <div class="info-box">
                    <h3>Invoice Details</h3>
                    <p><span class="lbl">Invoice Number:</span> ${invNum}</p>
                    <p><span class="lbl">Invoice Date:</span> ${_fmtDate(entry.ENTRY_DATE)}</p>
                    <p><span class="lbl">Due Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</p>
                    <p><span class="lbl">Status:</span> ${entry.STATUS || 'N/A'}</p>
                </div>
            </div>
            ${_chargeTable(parsed, grandTotal)}
            <div style="clear:both"></div>
            <div class="sig">
                <div class="sig-line"></div>
                <div><strong>Authorized Signatory</strong></div>
                <div class="sub">for ${_esc(clientName)}</div>
            </div>
            <div class="footer">
                This is a computer-generated document. Valid without signature.<br>
                Generated on: ${new Date().toLocaleString()}
            </div>`;
        _openPrintWindow(`Sales Invoice - ${invNum}`, body);
    }

    // ── 2. PAYMENT RECEIPT ──────────────────────────────────────────────────
    function printReceipt(entry, isReceipt) {
        const label = isReceipt ? 'PAYMENT RECEIPT' : 'PAYMENT VOUCHER';
        const amount = +entry.CREDIT || +entry.DEBIT || 0;
        const clientName = entry.CLIENT_NAME || entry.CODE || 'N/A';

        const body = `
            <div class="hdr">
                <div class="hdr-l">${label}</div>
                <div class="hdr-r">
                    <div><strong>Receipt #:</strong> ${entry.ENTRY_ID ? entry.ENTRY_ID.substring(0, 10) : 'N/A'}</div>
                    <div><strong>Date:</strong> ${_fmtDate(entry.ENTRY_DATE)}</div>
                </div>
            </div>
            <div class="info-row">
                <div class="info-box">
                    <h3>${isReceipt ? 'Received From' : 'Paid To'}</h3>
                    <p><strong>${_esc(clientName)}</strong></p>
                    <p><span class="lbl">Code:</span> ${entry.CODE || 'N/A'}</p>
                </div>
                <div class="info-box">
                    <h3>Payment Details</h3>
                    <p><span class="lbl">Amount:</span> <strong style="font-size:18px">₹${amount.toFixed(2)}</strong></p>
                    <p><span class="lbl">Mode:</span> ${entry.PAYMENT_MODE || 'N/A'}</p>
                    <p><span class="lbl">Direction:</span> ${isReceipt ? 'OUTWARD (Receipt)' : 'INWARD (Payment)'}</p>
                </div>
            </div>
            ${entry.NARRATION ? `<div style="padding:12px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:15px"><strong>📝 Narration:</strong> ${_esc(entry.NARRATION)}</div>` : ''}
            <table>
                <tr><th>Account</th><th>Debit (₹)</th><th>Credit (₹)</th></tr>
                <tr><td>${_coaName(entry.COA_DR) || 'N/A'}</td><td class="tr">${(+entry.DEBIT||0).toFixed(2)}</td><td class="tr">—</td></tr>
                <tr><td>${_coaName(entry.COA_CR) || 'N/A'}</td><td class="tr">—</td><td class="tr">${(+entry.CREDIT||0).toFixed(2)}</td></tr>
                <tr class="total-row"><td><strong>Net Amount</strong></td><td class="tr"><strong>${(+entry.DEBIT||0).toFixed(2)}</strong></td><td class="tr"><strong>${(+entry.CREDIT||0).toFixed(2)}</strong></td></tr>
            </table>
            <div style="clear:both"></div>
            <div class="sig">
                <div class="sig-line"></div>
                <div><strong>Authorized Signatory</strong></div>
            </div>
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`${label} - ${entry.ENTRY_ID ? entry.ENTRY_ID.substring(0, 10) : 'N/A'}`, body);
    }

    // ── 3. PURCHASE BILL ────────────────────────────────────────────────────
    function printPurchaseBill(entry) {
        const parsed = _parseNarration(entry);
        const grandTotal = parsed?.grand_total || +entry.CREDIT || 0;
        const vendorName = entry.CLIENT_NAME || entry.CODE || 'N/A';

        const body = `
            <div class="hdr">
                <div class="hdr-l">PURCHASE BILL</div>
                <div class="hdr-r">
                    <div><strong>Inv #:</strong> ${entry.INV_NUMBER || 'N/A'}</div>
                    <div><strong>Date:</strong> ${_fmtDate(entry.ENTRY_DATE)}</div>
                </div>
            </div>
            <div class="info-row">
                <div class="info-box">
                    <h3>Vendor</h3>
                    <p><strong>${_esc(vendorName)}</strong></p>
                    <p><span class="lbl">Code:</span> ${entry.CODE || 'N/A'}</p>
                    <p><span class="lbl">Type:</span> ${entry.B2B_TYPE || entry.VENDOR_TYPE || 'N/A'}</p>
                </div>
                <div class="info-box">
                    <h3>Bill Details</h3>
                    <p><span class="lbl">Invoice #:</span> ${entry.INV_NUMBER || 'N/A'}</p>
                    <p><span class="lbl">Date:</span> ${_fmtDate(entry.ENTRY_DATE)}</p>
                    <p><span class="lbl">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</p>
                    <p><span class="lbl">Branch:</span> ${entry.BRANCH_NAME || entry.BRANCH || 'N/A'}</p>
                </div>
            </div>
            ${entry.PRODUCT_CODE ? `<div style="padding:8px;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:6px;margin-bottom:15px"><strong>Product:</strong> ${_esc(entry.PRODUCT_CODE)}</div>` : ''}
            ${_chargeTable(parsed, grandTotal)}
            <div style="clear:both"></div>
            <div class="sig">
                <div class="sig-line"></div>
                <div><strong>Authorized Signatory</strong></div>
            </div>
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`Purchase Bill - ${entry.INV_NUMBER || entry.ENTRY_ID?.substring(0, 8) || ''}`, body);
    }

    // ── 4. CREDIT NOTE ───────────────────────────────────────────────────────
    function printCreditNote(entry) {
        const parsed = _parseNarration(entry);
        const grandTotal = parsed?.grand_total || +entry.CREDIT || 0;
        const clientName = entry.CLIENT_NAME || entry.CODE || 'N/A';

        const body = `
            <div class="hdr">
                <div class="hdr-l">CREDIT NOTE</div>
                <div class="hdr-r">
                    <div><strong>Ref #:</strong> ${entry.ENTRY_ID ? entry.ENTRY_ID.substring(0, 10) : 'N/A'}</div>
                    <div><strong>Date:</strong> ${_fmtDate(entry.ENTRY_DATE)}</div>
                </div>
            </div>
            <div class="info-row">
                <div class="info-box">
                    <h3>Issued To</h3>
                    <p><strong>${_esc(clientName)}</strong></p>
                    <p><span class="lbl">Code:</span> ${entry.CODE || 'N/A'}</p>
                    <p><span class="lbl">Branch:</span> ${entry.BRANCH_NAME || entry.BRANCH || 'N/A'}</p>
                </div>
                <div class="info-box">
                    <h3>Note Details</h3>
                    <p><span class="lbl">Amount:</span> <strong style="font-size:16px;color:#e53935">₹${grandTotal.toFixed(2)}</strong></p>
                    <p><span class="lbl">Status:</span> ${entry.STATUS || 'N/A'}</p>
                    <p><span class="lbl">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</p>
                </div>
            </div>
            ${_chargeTable(parsed, grandTotal)}
            <div style="clear:both"></div>
            <div class="sig">
                <div class="sig-line"></div>
                <div><strong>Authorized Signatory</strong></div>
            </div>
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`Credit Note - ${entry.ENTRY_ID?.substring(0, 8) || ''}`, body);
    }

    // ── 5. DEBIT NOTE ────────────────────────────────────────────────────────
    function printDebitNote(entry) {
        const parsed = _parseNarration(entry);
        const grandTotal = parsed?.grand_total || +entry.DEBIT || 0;
        const vendorName = entry.CLIENT_NAME || entry.CODE || 'N/A';

        const body = `
            <div class="hdr">
                <div class="hdr-l">DEBIT NOTE</div>
                <div class="hdr-r">
                    <div><strong>Ref #:</strong> ${entry.ENTRY_ID ? entry.ENTRY_ID.substring(0, 10) : 'N/A'}</div>
                    <div><strong>Date:</strong> ${_fmtDate(entry.ENTRY_DATE)}</div>
                </div>
            </div>
            <div class="info-row">
                <div class="info-box">
                    <h3>Issued To</h3>
                    <p><strong>${_esc(vendorName)}</strong></p>
                    <p><span class="lbl">Code:</span> ${entry.CODE || 'N/A'}</p>
                    <p><span class="lbl">Type:</span> ${entry.B2B_TYPE || entry.VENDOR_TYPE || 'N/A'}</p>
                </div>
                <div class="info-box">
                    <h3>Note Details</h3>
                    <p><span class="lbl">Amount:</span> <strong style="font-size:16px;color:#e53935">₹${grandTotal.toFixed(2)}</strong></p>
                    <p><span class="lbl">Status:</span> ${entry.STATUS || 'N/A'}</p>
                    <p><span class="lbl">Balance:</span> ₹${(+entry.BALANCE||0).toFixed(2)}</p>
                </div>
            </div>
            ${_chargeTable(parsed, grandTotal)}
            <div style="clear:both"></div>
            <div class="sig">
                <div class="sig-line"></div>
                <div><strong>Authorized Signatory</strong></div>
            </div>
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`Debit Note - ${entry.ENTRY_ID?.substring(0, 8) || ''}`, body);
    }

    // ── 6. JOURNAL VOUCHER ───────────────────────────────────────────────────
    function printJournal(rows) {
        if (!rows || !rows.length) return;
        const entry = rows[0];
        const totalDr = rows.reduce((s, r) => s + (+r.DEBIT || 0), 0);
        const totalCr = rows.reduce((s, r) => s + (+r.CREDIT || 0), 0);
        const isMulti = rows.length > 2;

        const lineRows = rows.map((r, i) => {
            const coa = r.COA_DR || r.COA_CR;
            return `<tr>
                <td class="tc">${i + 1}</td>
                <td>${_coaName(coa) || '(auto)'}</td>
                <td class="tr">${(+r.DEBIT||0) > 0 ? '₹' + (+r.DEBIT).toFixed(2) : '—'}</td>
                <td class="tr">${(+r.CREDIT||0) > 0 ? '₹' + (+r.CREDIT).toFixed(2) : '—'}</td>
            </tr>`;
        }).join('');

        const body = `
            <div class="hdr">
                <div class="hdr-l">JOURNAL VOUCHER</div>
                <div class="hdr-r">
                    <div><strong>TXN #:</strong> ${entry.TXN_ID || entry.ENTRY_ID?.substring(0, 10) || 'N/A'}</div>
                    <div><strong>Date:</strong> ${_fmtDate(entry.ENTRY_DATE)}</div>
                    <div><strong>Type:</strong> ${entry.JOURNAL_TYPE || 'JOURNAL'} ${isMulti ? '(Multi-line)' : ''}</div>
                </div>
            </div>
            <div class="info-row">
                <div class="info-box">
                    <h3>Client</h3>
                    <p><strong>${_esc(entry.CODE || 'N/A')}</strong></p>
                    <p><span class="lbl">Branch:</span> ${entry.BRANCH || 'N/A'}</p>
                </div>
                <div class="info-box">
                    <h3>Summary</h3>
                    <p><span class="lbl">Lines:</span> ${rows.length}</p>
                    <p><span class="lbl">Total Dr:</span> <strong>₹${totalDr.toFixed(2)}</strong></p>
                    <p><span class="lbl">Total Cr:</span> <strong>₹${totalCr.toFixed(2)}</strong></p>
                </div>
            </div>
            <h3>Line Items</h3>
            <table>
                <thead><tr><th class="tc">#</th><th>Account</th><th class="tr">Debit (₹)</th><th class="tr">Credit (₹)</th></tr></thead>
                <tbody>${lineRows}</tbody>
                <tfoot><tr class="total-row"><td colspan="2" class="tr"><strong>Total</strong></td><td class="tr"><strong>₹${totalDr.toFixed(2)}</strong></td><td class="tr"><strong>₹${totalCr.toFixed(2)}</strong></td></tr></tfoot>
            </table>
            ${entry.NARRATION ? `<div style="padding:12px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;margin:15px 0"><strong>📝 Narration:</strong> ${_esc(entry.NARRATION)}</div>` : ''}
            <div style="clear:both"></div>
            <div class="sig">
                <div class="sig-line"></div>
                <div><strong>Authorized Signatory</strong></div>
            </div>
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`Journal Voucher - ${entry.TXN_ID || entry.ENTRY_ID?.substring(0, 8) || ''}`, body);
    }

    // ── 7. EXPENSE VOUCHER ──────────────────────────────────────────────────
    function printExpense(entry) {
        const amount = +entry.DEBIT || 0;

        const body = `
            <div class="hdr">
                <div class="hdr-l">EXPENSE VOUCHER</div>
                <div class="hdr-r">
                    <div><strong>ID:</strong> ${entry.ENTRY_ID?.substring(0, 10) || 'N/A'}</div>
                    <div><strong>Date:</strong> ${_fmtDate(entry.ENTRY_DATE)}</div>
                </div>
            </div>
            <div class="info-row">
                <div class="info-box">
                    <h3>Expense Details</h3>
                    <p><span class="lbl">Branch:</span> ${entry.BRANCH || 'N/A'}</p>
                    <p><span class="lbl">Type:</span> ${entry.EXPENSE_TYPE || 'N/A'}</p>
                </div>
                <div class="info-box">
                    <h3>Amount</h3>
                    <p><strong style="font-size:20px;color:#e53935">₹${amount.toFixed(2)}</strong></p>
                    <p><span class="lbl">Status:</span> ${entry.STATUS || 'N/A'}</p>
                </div>
            </div>
            <table>
                <tr><th>Account</th><th>Debit (₹)</th><th>Credit (₹)</th></tr>
                <tr><td>${_coaName(entry.COA_DR) || 'N/A'}</td><td class="tr">${(+entry.DEBIT||0).toFixed(2)}</td><td class="tr">—</td></tr>
                <tr><td>${_coaName(entry.COA_CR) || 'N/A'}</td><td class="tr">—</td><td class="tr">${(+entry.CREDIT||0).toFixed(2)}</td></tr>
                <tr class="total-row"><td><strong>Total</strong></td><td class="tr"><strong>${amount.toFixed(2)}</strong></td><td class="tr"><strong>—</strong></td></tr>
            </table>
            ${entry.NARRATION ? `<div style="padding:12px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;margin:15px 0"><strong>📝 Narration:</strong> ${_esc(entry.NARRATION)}</div>` : ''}
            <div style="clear:both"></div>
            <div class="sig">
                <div class="sig-line"></div>
                <div><strong>Approved By</strong></div>
            </div>
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`Expense Voucher - ${entry.ENTRY_ID?.substring(0, 8) || ''}`, body);
    }

    // ── 8. CASH MOVEMENT VOUCHER ────────────────────────────────────────────
    function printCashMovement(entry) {
        const amount = +entry.CASH_AMOUNT || 0;

        const body = `
            <div class="hdr">
                <div class="hdr-l">CASH MOVEMENT VOUCHER</div>
                <div class="hdr-r">
                    <div><strong>ID:</strong> ${entry.ENTRY_ID?.substring(0, 10) || 'N/A'}</div>
                    <div><strong>Date:</strong> ${_fmtDate(entry.ENTRY_DATE)}</div>
                </div>
            </div>
            <div class="info-row">
                <div class="info-box">
                    <h3>Transfer Details</h3>
                    <p><span class="lbl">From:</span> <strong>${_esc(entry.CASH_FROM || 'N/A')}</strong></p>
                    <p><span class="lbl">To:</span> <strong>${_esc(entry.CASH_TO || 'N/A')}</strong></p>
                </div>
                <div class="info-box">
                    <h3>Amount</h3>
                    <p><strong style="font-size:20px;color:#e65100">₹${amount.toFixed(2)}</strong></p>
                    <p><span class="lbl">Status:</span> ${entry.STATUS || 'N/A'}</p>
                </div>
            </div>
            ${entry.NARRATION ? `<div style="padding:12px;background:#fff3e0;border:1px solid #ffe0b2;border-radius:6px;margin:15px 0"><strong>📝 Narration:</strong> ${_esc(entry.NARRATION)}</div>` : ''}
            <table>
                <tr><th>Account</th><th>Debit (₹)</th><th>Credit (₹)</th></tr>
                <tr><td>${_coaName(entry.COA_DR) || 'N/A'}</td><td class="tr">${(+entry.DEBIT||0).toFixed(2)}</td><td class="tr">—</td></tr>
                <tr><td>${_coaName(entry.COA_CR) || 'N/A'}</td><td class="tr">—</td><td class="tr">${(+entry.CREDIT||0).toFixed(2)}</td></tr>
                <tr class="total-row"><td><strong>Cash Amount</strong></td><td class="tr" colspan="2"><strong>₹${amount.toFixed(2)}</strong></td></tr>
            </table>
            <div style="clear:both"></div>
            <div class="sig">
                <div class="sig-line"></div>
                <div><strong>Authorized Signatory</strong></div>
            </div>
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`Cash Movement - ${entry.ENTRY_ID?.substring(0, 8) || ''}`, body);
    }

    // ── 9. DELIVERY CHALLAN ──────────────────────────────────────────────────
    function printDeliveryNote(entry) {
        const parsed = _parseNarration(entry);
        const grandTotal = parsed?.grand_total || 0;
        const description = parsed?.description || entry.NARRATION || '';

        const body = `
            <div class="hdr">
                <div class="hdr-l" style="color:#e65100">DELIVERY CHALLAN</div>
                <div class="hdr-r">
                    <div><strong>DC #:</strong> DC-${entry.ENTRY_ID ? entry.ENTRY_ID.substring(0, 8) : 'N/A'}</div>
                    <div><strong>Date:</strong> ${_fmtDate(entry.ENTRY_DATE)}</div>
                </div>
            </div>
            <div class="info-row">
                <div class="info-box">
                    <h3>Client</h3>
                    <p><strong>${_esc(entry.CLIENT_NAME || entry.CODE || 'N/A')}</strong></p>
                    <p><span class="lbl">Code:</span> ${entry.CODE || 'N/A'}</p>
                    <p><span class="lbl">Branch:</span> ${entry.BRANCH_NAME || entry.BRANCH || 'N/A'}</p>
                </div>
                <div class="info-box">
                    <h3>Challan Details</h3>
                    <p><span class="lbl">Total Value:</span> <strong style="font-size:16px">₹${grandTotal.toFixed(2)}</strong></p>
                    <p><span class="lbl">Status:</span> ${entry.STATUS || 'N/A'}</p>
                </div>
            </div>
            ${description ? `<div style="padding:12px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;margin:15px 0"><strong>📝 Details:</strong> ${_esc(description)}</div>` : ''}
            ${_chargeTable(parsed, grandTotal)}
            <div style="clear:both"></div>
            <div style="margin-top:40px;display:flex;justify-content:space-between">
                <div style="text-align:center;width:45%">
                    <div class="sig-line" style="width:100%"></div>
                    <div><strong>Received By</strong></div>
                </div>
                <div style="text-align:center;width:45%">
                    <div class="sig-line" style="width:100%"></div>
                    <div><strong>Authorized Signatory</strong></div>
                </div>
            </div>
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`Delivery Challan - DC${entry.ENTRY_ID?.substring(0, 8) || ''}`, body);
    }

    // ── 10. EMPLOYEE RECORD ────────────────────────────────────────────────
    function printEmployee(staff) {
        if (!staff) return;
        const branch = (typeof _allBranches !== 'undefined') ? _allBranches.find(b => b.BRANCH_CODE === staff.BRANCH) : null;

        const fields = [
            ['Staff Code', staff.STAFF_CODE],
            ['Name', staff.STAFF_NAME],
            ['Role', staff.ROLE],
            ['Status', staff.STATUS],
            ['Mobile', staff.MOBILE],
            ['Email', staff.EMAIL],
            ['Branch', `${staff.BRANCH || ''}${branch ? ' - ' + branch.BRANCH_NAME : ''}`],
            ['Department', staff.DEPARTMENT],
            ['Date of Birth', _fmtDate(staff.DATE_BIRTH)],
            ['Date of Join', _fmtDate(staff.DATE_JOIN)],
            ['Date of Leave', staff.DATE_LEAVE ? _fmtDate(staff.DATE_LEAVE) : 'N/A'],
            ['Gender', staff.GENDER],
            ['Blood Group', staff.BLOOD_GROUP],
            ['PAN', staff.PAN_NUM],
            ['Aadhaar', staff.ADHAR_NUM],
            ['EPF UID', staff.EPF_UID],
            ['ESI UID', staff.ESI_UID],
            ['UAN', staff.UAN],
            ['Emergency Contact', staff.EMERGENCY_CONTACT],
            ['Bank Name', staff.BANK_NAME],
            ['Bank A/C', staff.BANK_AC],
            ['IFSC', staff.BANK_IFSC],
            ['Address', `${staff.ADDRESS || ''}, ${staff.CITY || ''}, ${staff.STATE || ''} - ${staff.PINCODE || ''}`],
        ].filter(([, v]) => v && v !== 'N/A' && v !== '');

        const rows = fields.map(([l, v]) => `<tr><td style="width:180px;font-weight:bold;color:#555">${l}</td><td>${_esc(v)}</td></tr>`).join('');

        const body = `
            <div class="hdr">
                <div class="hdr-l">EMPLOYEE RECORD</div>
                <div class="hdr-r">
                    <div><strong>Staff Code:</strong> ${staff.STAFF_CODE || 'N/A'}</div>
                </div>
            </div>
            <div style="padding:15px;background:#e8eaf6;border:1px solid #c5cae9;border-radius:8px;margin-bottom:20px;text-align:center">
                <div style="font-size:22px;font-weight:bold;color:#283593">${_esc(staff.STAFF_NAME || 'N/A')}</div>
                <div style="font-size:13px;color:#5c6bc0">${staff.STAFF_CODE || ''} · ${staff.ROLE || ''} · ${staff.BRANCH || ''}</div>
            </div>
            <table>${rows}</table>
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`Employee - ${staff.STAFF_NAME || staff.STAFF_CODE || ''}`, body);
    }

    // ── 11. SALARY SLIP ────────────────────────────────────────────────────
    function printSalarySlip(staff, salaryData) {
        const earn = salaryData?.earnings || {};
        const ded = salaryData?.deductions || {};
        const net = salaryData?.net || 0;
        const totalEarnings = Object.values(earn).reduce((a, b) => a + b, 0);
        const totalDeductions = Object.values(ded).reduce((a, b) => a + b, 0);

        const earnRows = Object.entries(earn).filter(([, v]) => v > 0).map(([k, v]) =>
            `<tr><td style="text-transform:capitalize">${k}</td><td class="tr">${(+v).toFixed(2)}</td></tr>`
        ).join('');
        const dedRows = Object.entries(ded).filter(([, v]) => v > 0).map(([k, v]) =>
            `<tr><td style="text-transform:capitalize">${k}</td><td class="tr">${(+v).toFixed(2)}</td></tr>`
        ).join('');

        const body = `
            <div class="hdr">
                <div class="hdr-l">SALARY SLIP</div>
                <div class="hdr-r">
                    <div><strong>Month:</strong> ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
                </div>
            </div>
            <div style="padding:12px;background:#e8eaf6;border:1px solid #c5cae9;border-radius:6px;margin-bottom:15px">
                <div style="font-size:18px;font-weight:bold;color:#283593">${_esc(staff?.STAFF_NAME || 'N/A')}</div>
                <div style="font-size:12px;color:#5c6bc0">${staff?.STAFF_CODE || ''} · ${staff?.BRANCH || ''}</div>
            </div>
            <div class="totals">
                <div class="totals-box">
                    <h3>Earnings</h3>
                    <table>${earnRows || '<tr><td class="sub">No earnings data</td></tr>'}
                        <tr class="total-row"><td><strong>Total Earnings</strong></td><td class="tr"><strong>${totalEarnings.toFixed(2)}</strong></td></tr>
                    </table>
                </div>
                <div class="totals-box">
                    <h3>Deductions</h3>
                    <table>${dedRows || '<tr><td class="sub">No deductions</td></tr>'}
                        <tr class="total-row"><td><strong>Total Deductions</strong></td><td class="tr"><strong>${totalDeductions.toFixed(2)}</strong></td></tr>
                    </table>
                </div>
            </div>
            <div style="padding:15px;background:#e8eaf6;border:1px solid #c5cae9;border-radius:8px;text-align:center;margin:15px 0">
                <div style="font-size:12px;color:#5c6bc0">NET SALARY</div>
                <div style="font-size:28px;font-weight:bold;color:#1a1a2e">₹${net.toFixed(2)}</div>
            </div>
            <div style="clear:both"></div>
            <div class="sig">
                <div class="sig-line"></div>
                <div><strong>Authorized Signatory</strong></div>
            </div>
            <div class="footer">This is a computer-generated document. Valid without signature.<br>Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`Salary Slip - ${staff?.STAFF_NAME || ''}`, body);
    }

    // ── 12. CLIENT/SUPPLIER STATEMENT (TALLY ERP / PRIME FORMAT) ───────────
    function printStatement(party, code, entries, balance, title, opts = {}) {
        const clientName    = party?.B2B_NAME || party?.NAME || party?.name || party?.COMPANY_NAME || party?.CODE || code || 'Customer';
        const clientAddress = party?.B2B_ADDRESS || party?.ADDRESS || party?.address || '';
        const clientCity    = party?.B2B_CITY || party?.CITY || party?.city || '';
        const clientState   = party?.B2B_STATE || party?.STATE || party?.state || '';
        const clientGstin   = party?.GSTIN || party?.ID_GST_PAN_ADHAR || party?.gstin || '';
        const clientPhone   = party?.MOBILE_NUMBER || party?.PHONE || party?.phone || '';
        const clientEmail   = party?.EMAIL || party?.email || '';
        const clientGstCode = party?.GST_CODE || '';

        // Parent Branch / Company details
        const branch = opts.branch || {};
        const compName      = branch.BRANCH_NAME || branch.name || party?.BRANCH || 'POST4EX LOGISTICS';
        const compAddress   = branch.BRANCH_ADDRESS || branch.address || '';
        const compCity      = branch.BRANCH_CITY || branch.city || '';
        const compState     = branch.BRANCH_STATE || branch.state || '';
        const compGstCode   = branch.GST_CODE || branch.CODE_STATE || '';
        const compGstin     = branch.BRANCH_GSTIN || branch.gstin || '';
        const compPan       = branch.BRANCH_PAN || branch.pan || '';
        const compPhone     = branch.BRANCH_MOBILE || branch.phone || '';
        const compEmail     = branch.BRANCH_EMAIL || branch.email || '';

        const startDate     = opts.startDate || '';
        const endDate       = opts.endDate || '';
        const periodStr     = (startDate || endDate) 
            ? `${startDate ? _fmtDate(startDate) : 'Start'} to ${endDate ? _fmtDate(endDate) : 'Present'}`
            : 'All Time';

        const openingBal    = Number(opts.openingBalance !== undefined ? opts.openingBalance : 0);
        const totalDr       = Number(opts.totalDebit !== undefined ? opts.totalDebit : entries.reduce((s, e) => s + (Number(e.debit || e.DEBIT || 0)), 0));
        const totalCr       = Number(opts.totalCredit !== undefined ? opts.totalCredit : entries.reduce((s, e) => s + (Number(e.credit || e.CREDIT || 0)), 0));
        const closingBal    = Number(opts.closingBalance !== undefined ? opts.closingBalance : (openingBal + totalDr - totalCr));

        function _fmtInr(num) {
            const n = Math.abs(Number(num) || 0);
            return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function numToWords(n) {
            const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
            const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
            n=Math.round(Math.abs(n)); if(!n) return 'Zero';
            if(n<20) return a[n]; if(n<100) return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');
            if(n<1000) return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+numToWords(n%100):'');
            if(n<100000) return numToWords(Math.floor(n/1000))+' Thousand'+(n%1000?' '+numToWords(n%1000):'');
            if(n<10000000) return numToWords(Math.floor(n/100000))+' Lakh'+(n%100000?' '+numToWords(n%100000):'');
            return numToWords(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+numToWords(n%10000000):'');
        }

        // Build Table Rows
        let runningBal = openingBal;
        let rowsHtml = '';

        // 1. Opening Balance Row (if date filter applied or opening != 0)
        if (startDate || openingBal !== 0) {
            rowsHtml += `
            <tr class="tally-item-row" style="background:#fcfcfc;">
                <td class="tc border-r font-mono">${startDate ? _fmtDate(startDate) : '—'}</td>
                <td class="border-r font-bold" style="padding-left:8px;">Opening Balance</td>
                <td class="tc border-r">Opening</td>
                <td class="tc border-r">—</td>
                <td class="border-r tc text-muted">—</td>
                <td class="tr border-r font-mono">${openingBal > 0 ? _fmtInr(openingBal) : ''}</td>
                <td class="tr border-r font-mono">${openingBal < 0 ? _fmtInr(Math.abs(openingBal)) : ''}</td>
                <td class="tr font-mono font-bold">${_fmtInr(Math.abs(openingBal))} ${openingBal > 0 ? 'Dr' : openingBal < 0 ? 'Cr' : ''}</td>
            </tr>`;
        }

        // 2. Transaction Lines
        entries.forEach((e, idx) => {
            const dateStr = _fmtDate(e.doc_date || e.ENTRY_DATE || e.date);
            const docNo   = _esc(e.doc_no || e.INV_NUMBER || e.transaction_no || e.ref_no || `TXN-${idx+1}`);
            const rawType = (e.doc_type || e.ENTRY_TYPE || '').toUpperCase();
            const docType = rawType.includes('INV') ? 'Sales' :
                            rawType.includes('REC') ? 'Receipt' :
                            rawType.includes('PAY') ? 'Payment' :
                            rawType.includes('CR') ? 'Credit Note' :
                            rawType.includes('DN') ? 'Debit Note' :
                            rawType.includes('JRN') ? 'Journal' : (rawType || 'Voucher');

            const vchNo   = _esc(e.ref_no || docNo);
            const narr    = _esc(e.narration || e.memo || e.description || '');
            const dr      = Number(e.debit || e.DEBIT || 0);
            const cr      = Number(e.credit || e.CREDIT || 0);
            runningBal   += (dr - cr);

            rowsHtml += `
            <tr class="tally-item-row">
                <td class="tc border-r font-mono">${dateStr}</td>
                <td class="border-r" style="padding-left:8px;">
                    <span class="font-bold">${docNo}</span>
                    ${narr ? `<div class="sub-narr" style="color:#555;font-size:9.5px;margin-top:1.5px;">${narr}</div>` : ''}
                </td>
                <td class="tc border-r">${docType}</td>
                <td class="tc border-r font-mono">${vchNo}</td>
                <td class="tc border-r font-mono text-muted">—</td>
                <td class="tr border-r font-mono">${dr > 0 ? _fmtInr(dr) : ''}</td>
                <td class="tr border-r font-mono">${cr > 0 ? _fmtInr(cr) : ''}</td>
                <td class="tr font-mono font-bold">${_fmtInr(Math.abs(runningBal))} ${runningBal > 0 ? 'Dr' : runningBal < 0 ? 'Cr' : ''}</td>
            </tr>`;
        });

        const css = `
            * { box-sizing: border-box; }
            body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; font-size: 11px; line-height: 1.35; color: #000; margin: 0; padding: 15px; background: #f5f5f5; }
            .tally-wrap { max-width: 900px; margin: auto; background: #fff; border: 1.5px solid #000; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .tally-header { text-align: center; border-bottom: 1.5px solid #000; padding: 6px 12px; position: relative; }
            .tally-title { font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
            .tally-subtitle { font-size: 11px; font-weight: bold; margin-top: 2px; }
            .tally-period { font-size: 10px; color: #333; margin-top: 2px; }
            
            .tally-grid { display: grid; grid-template-columns: 55% 45%; border-bottom: 1.5px solid #000; }
            .border-r { border-right: 1px solid #000; }
            .border-b { border-bottom: 1px solid #000; }
            .p-6 { padding: 6px 10px; }
            .tc { text-align: center; }
            .tr { text-align: right; }
            .tl { text-align: left; }
            .font-bold { font-weight: bold; }
            
            .meta-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
            .meta-table td { padding: 3px 6px; vertical-align: top; border-bottom: 1px solid #000; }
            .meta-table tr:last-child td { border-bottom: none; }
            .meta-table .meta-cell { border-right: 1px solid #000; width: 45%; }

            .items-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
            .items-table th { background: #f2f2f2; border-bottom: 1.5px solid #000; padding: 5px 4px; font-weight: bold; }
            .items-table td { padding: 4.5px 5px; vertical-align: top; }
            .items-table .tally-item-row td { border-bottom: 1px solid #e5e7eb; }
            .tot-row td { border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; font-weight: bold; padding: 6px 4px; background: #fafafa; }
            
            .bottom-summary { display: grid; grid-template-columns: 55% 45%; border-bottom: 1.5px solid #000; }
            .words-box { padding: 8px 10px; font-size: 10.5px; border-right: 1px solid #000; display: flex; flex-direction: column; justify-content: space-between; }
            .stat-summary-box { padding: 8px 10px; font-size: 10.5px; }
            .stat-row { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dashed #ccc; }
            .stat-row.final { border-bottom: none; border-top: 1.5px solid #000; font-weight: bold; font-size: 11.5px; padding-top: 4px; margin-top: 4px; background: #fafafa; }

            .sig-section { display: grid; grid-template-columns: 55% 45%; }
            .decl-box { padding: 8px 10px; font-size: 9.5px; border-right: 1px solid #000; }
            .signatory-box { padding: 8px 10px; text-align: right; display: flex; flex-direction: column; justify-content: space-between; min-height: 80px; }
            .computer-note { text-align: center; font-size: 9px; padding: 4px; font-weight: bold; background: #fafafa; border-top: 1px solid #000; }

            @media print {
                @page { size: A4 portrait; margin: 8mm; }
                body { background: #fff; padding: 0; }
                .tally-wrap { box-shadow: none; width: 100% !important; max-width: 100% !important; border: 1.5px solid #000 !important; }
            }
        `;

        const html = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Ledger Statement - ${_esc(clientName)}</title>
            <style>${css}</style>
        </head>
        <body>
            <div class="tally-wrap">
                <!-- Header Title -->
                <div class="tally-header">
                    <div class="tally-title">${_esc(compName)}</div>
                    <div class="tally-subtitle">${_esc(title || 'Party Ledger Statement')}</div>
                    <div class="tally-period"><b>Period:</b> ${periodStr}</div>
                </div>

                <!-- Parties & Company Meta -->
                <div class="tally-grid">
                    <div class="border-r" style="display: flex; flex-direction: column; justify-content: space-between;">
                        <div class="p-6">
                            <div style="font-size: 12.5px; font-weight: bold; line-height: 1.2; margin-bottom: 2px;">Company: ${_esc(compName)}</div>
                            ${compAddress ? `<div><b>Address:</b> ${_esc(compAddress)}</div>` : ''}
                            ${(compCity || compState) ? `<div><b>City / State:</b> ${_esc(compCity)}${compCity && compState ? ', ' : ''}${_esc(compState)}${compGstCode ? ` (Code: ${_esc(compGstCode)})` : ''}</div>` : ''}
                            ${compGstin ? `<div><b>GSTIN/UIN:</b> <span class="font-bold">${compGstin}</span></div>` : ''}
                            ${compPan ? `<div><b>PAN:</b> ${_esc(compPan)}</div>` : ''}
                            ${(compPhone || compEmail) ? `<div><b>Contact:</b> ${_esc(compPhone)}${compPhone && compEmail ? ' | ' : ''}${_esc(compEmail)}</div>` : ''}
                        </div>
                        <div class="p-6" style="border-top: 1px solid #000; background: #fafafa;">
                            <div class="font-bold" style="text-decoration: underline; font-size: 11.5px; margin-bottom: 3px;">Account of: ${_esc(clientName)}</div>
                            <div><b>Customer Code:</b> <span class="font-mono font-bold">${_esc(code)}</span></div>
                            ${clientAddress ? `<div><b>Address:</b> ${_esc(clientAddress)}</div>` : ''}
                            <div><b>City / State:</b> ${_esc(clientCity || '—')}, ${_esc(clientState || '—')} ${clientGstCode ? `(Code: ${clientGstCode})` : ''}</div>
                            <div><b>GSTIN/UIN:</b> <span class="font-bold">${clientGstin || 'Unregistered'}</span></div>
                            ${clientPhone ? `<div><b>Mobile:</b> ${_esc(clientPhone)} ${clientEmail ? '| ' + _esc(clientEmail) : ''}</div>` : ''}
                        </div>
                    </div>
                    <div>
                        <table class="meta-table" style="height: 100%;">
                            <tr>
                                <td class="meta-cell"><b>Account Type</b><br>Trade Debtors (1010)</td>
                                <td><b>Date of Print:</b><br><span class="font-bold">${new Date().toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}</span></td>
                            </tr>
                            <tr>
                                <td class="meta-cell"><b>Statement Period</b><br>${periodStr}</td>
                                <td><b>Time:</b><br>${new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}</td>
                            </tr>
                            <tr>
                                <td class="meta-cell"><b>Total Vouchers</b><br>${entries.length} Transaction(s)</td>
                                <td><b>Currency:</b><br>INR (₹)</td>
                            </tr>
                            <tr>
                                <td class="meta-cell"><b>Opening Balance</b><br><span class="font-mono font-bold">${_fmtInr(Math.abs(openingBal))} ${openingBal > 0 ? 'Dr' : openingBal < 0 ? 'Cr' : ''}</span></td>
                                <td><b>Closing Balance</b><br><span class="font-mono font-bold ${closingBal > 0 ? 'text-red-700' : ''}">${_fmtInr(Math.abs(closingBal))} ${closingBal > 0 ? 'Dr' : closingBal < 0 ? 'Cr' : ''}</span></td>
                            </tr>
                        </table>
                    </div>
                </div>

                <!-- Ledger Chronological Items Table -->
                <table class="items-table">
                    <thead>
                        <tr>
                            <th class="tc border-r" style="width: 80px;">Date</th>
                            <th class="tl border-r">Particulars / Document #</th>
                            <th class="tc border-r" style="width: 90px;">Vch Type</th>
                            <th class="tc border-r" style="width: 100px;">Vch No.</th>
                            <th class="tc border-r" style="width: 45px;">Ref</th>
                            <th class="tr border-r" style="width: 100px;">Debit (Dr ₹)</th>
                            <th class="tr border-r" style="width: 100px;">Credit (Cr ₹)</th>
                            <th class="tr" style="width: 110px;">Balance (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || `<tr><td colspan="8" class="tc p-6" style="padding:20px;color:#777;">No transactions recorded in this period</td></tr>`}
                    </tbody>
                    <tfoot>
                        <tr class="tot-row">
                            <td colspan="5" class="tr border-r font-bold" style="padding-right:10px;">Total Current Period Movement</td>
                            <td class="tr border-r font-bold font-mono">₹${_fmtInr(totalDr)}</td>
                            <td class="tr border-r font-bold font-mono">₹${_fmtInr(totalCr)}</td>
                            <td class="tr font-bold font-mono">₹${_fmtInr(Math.abs(closingBal))} ${closingBal > 0 ? 'Dr' : closingBal < 0 ? 'Cr' : ''}</td>
                        </tr>
                    </tfoot>
                </table>

                <!-- Summary & Word Balance -->
                <div class="bottom-summary">
                    <div class="words-box">
                        <div>
                            <div><b>Net Closing Balance (in words):</b></div>
                            <div class="font-bold" style="font-size: 11px; margin-top: 3px;">
                                INR Indian Rupees ${numToWords(Math.round(Math.abs(closingBal)))} Only ${closingBal > 0 ? '(Debit / Receivable)' : closingBal < 0 ? '(Credit / Advance)' : ''}
                            </div>
                        </div>
                        <div style="margin-top:10px;font-size:10px;color:#444;">
                            Note: All discrepancies or unadjusted credits must be reported within 7 days of statement issuance.
                        </div>
                    </div>
                    <div class="stat-summary-box">
                        <div class="stat-row">
                            <span>Opening Balance:</span>
                            <span class="font-mono">₹${_fmtInr(Math.abs(openingBal))} ${openingBal > 0 ? 'Dr' : openingBal < 0 ? 'Cr' : ''}</span>
                        </div>
                        <div class="stat-row">
                            <span>Total Debits (Billed / Invoiced):</span>
                            <span class="font-mono font-bold">₹${_fmtInr(totalDr)}</span>
                        </div>
                        <div class="stat-row">
                            <span>Total Credits (Receipts / Adjustments):</span>
                            <span class="font-mono font-bold">₹${_fmtInr(totalCr)}</span>
                        </div>
                        <div class="stat-row final">
                            <span>Closing Net Balance:</span>
                            <span class="font-mono">₹${_fmtInr(Math.abs(closingBal))} ${closingBal > 0 ? 'Dr' : closingBal < 0 ? 'Cr' : ''}</span>
                        </div>
                    </div>
                </div>

                <!-- Signatures -->
                <div class="sig-section">
                    <div class="decl-box">
                        <div class="font-bold" style="text-decoration: underline;">Confirmation / Acceptance:</div>
                        <div style="font-size: 9px; margin-top: 4px; color: #333; line-height: 1.4;">
                            We confirm that the ledger balance of <b>₹${_fmtInr(Math.abs(closingBal))} ${closingBal > 0 ? 'Dr' : closingBal < 0 ? 'Cr' : ''}</b> shown as of <b>${endDate ? _fmtDate(endDate) : _fmtDate(new Date())}</b> represents the true and accurate outstanding ledger balance.
                        </div>
                        <div style="margin-top: 25px; border-top: 1px dashed #999; width: 160px; font-size: 9px;">Customer's Sign &amp; Stamp</div>
                    </div>
                    <div class="signatory-box">
                        <div style="font-size: 10px;">for <b>${_esc(compName)}</b></div>
                        <div class="font-bold" style="font-size: 10.5px;">Authorised Signatory</div>
                    </div>
                </div>

                <div class="computer-note">
                    SUBJECT TO ${_esc(compCity.toUpperCase())} JURISDICTION · This is a Computer Generated Statement
                </div>
            </div>
            <script>window.onload = () => window.print();<\/script>
        </body>
        </html>`;

        const w = window.open('', `Statement-${code || 'Party'}`);
        w.document.write(html);
        w.document.close();
    }

    // ── 13. CASH HOLDER STATEMENT ──────────────────────────────────────────
    function printCashHolderStatement(holder, txns, balance) {
        const totalReceived = txns.filter(e => e.CASH_TO === holder).reduce((s, e) => s + (+e.CASH_AMOUNT || 0), 0);
        const totalSent = txns.filter(e => e.CASH_FROM === holder).reduce((s, e) => s + (+e.CASH_AMOUNT || 0), 0);

        const txnRows = txns.slice(0, 50).map(e => {
            const isInflow = e.CASH_TO === holder;
            const counterparty = isInflow ? e.CASH_FROM : e.CASH_TO;
            const amt = +e.CASH_AMOUNT || 0;
            return `<tr>
                <td>${_fmtDate(e.ENTRY_DATE)}</td>
                <td>${isInflow ? '⬇ IN' : '⬆ OUT'}</td>
                <td>${_esc(counterparty || '')}</td>
                <td class="tr" style="color:${isInflow ? '#2e7d32' : '#e53935'}">${isInflow ? '+' : '-'}₹${amt.toFixed(2)}</td>
                <td>${_esc(e.NARRATION || '')}</td>
            </tr>`;
        }).join('');

        const body = `
            <div class="hdr">
                <div class="hdr-l">CASH HOLDER STATEMENT</div>
                <div class="hdr-r">
                    <div><strong>Holder:</strong> ${_esc(holder)}</div>
                    <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap">
                <div style="padding:10px;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:6px;flex:1;text-align:center">
                    <div class="sub">Current Balance</div>
                    <div style="font-size:22px;font-weight:bold;color:${balance >= 0 ? '#2e7d32' : '#e53935'}">₹${balance.toFixed(2)}</div>
                </div>
                <div style="padding:10px;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:6px;flex:1;text-align:center">
                    <div class="sub">Total Received</div>
                    <div style="font-size:18px;font-weight:bold;color:#2e7d32">₹${totalReceived.toFixed(2)}</div>
                </div>
                <div style="padding:10px;background:#fce4ec;border:1px solid #f8bbd0;border-radius:6px;flex:1;text-align:center">
                    <div class="sub">Total Sent</div>
                    <div style="font-size:18px;font-weight:bold;color:#e53935">₹${totalSent.toFixed(2)}</div>
                </div>
            </div>
            <h3>Transaction History (${txns.length})</h3>
            <table>
                <thead><tr><th>Date</th><th>Direction</th><th>Counterparty</th><th class="tr">Amount (₹)</th><th>Narration</th></tr></thead>
                <tbody>${txnRows || '<tr><td colspan="5" class="sub tc">No transactions</td></tr>'}</tbody>
            </table>
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow(`Cash Statement - ${holder}`, body);
    }

    // ── 14. PAYROLL DASHBOARD ──────────────────────────────────────────────
    function printPayrollSummary(staffCount, activeCount, withSalary, totalPayroll, salaryHistory) {
        const monthRows = Object.entries(salaryHistory || {}).sort().reverse().slice(0, 12).map(([month, data]) =>
            `<tr><td>${month}</td><td class="tr">${data.count}</td><td class="tr">₹${data.total.toFixed(2)}</td></tr>`
        ).join('');

        const body = `
            <div class="hdr">
                <div class="hdr-l">PAYROLL SUMMARY</div>
                <div class="hdr-r">
                    <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap">
                <div style="padding:10px;background:#e8eaf6;border:1px solid #c5cae9;border-radius:6px;flex:1;text-align:center">
                    <div class="sub">Total Employees</div><div style="font-size:20px;font-weight:bold">${staffCount}</div>
                </div>
                <div style="padding:10px;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:6px;flex:1;text-align:center">
                    <div class="sub">Active</div><div style="font-size:20px;font-weight:bold;color:#2e7d32">${activeCount}</div>
                </div>
                <div style="padding:10px;background:#fff3e0;border:1px solid #ffe0b2;border-radius:6px;flex:1;text-align:center">
                    <div class="sub">Salaries Set</div><div style="font-size:20px;font-weight:bold;color:#e65100">${withSalary}</div>
                </div>
                <div style="padding:10px;background:#fce4ec;border:1px solid #f8bbd0;border-radius:6px;flex:1;text-align:center">
                    <div class="sub">Monthly Payroll</div><div style="font-size:20px;font-weight:bold;color:#c62828">₹${totalPayroll.toFixed(2)}</div>
                </div>
            </div>
            ${monthRows ? `<h3>Monthly Salary History</h3><table><thead><tr><th>Month</th><th class="tr">Employees</th><th class="tr">Total (₹)</th></tr></thead><tbody>${monthRows}</tbody></table>` : ''}
            <div class="footer">Generated on: ${new Date().toLocaleString()}</div>`;
        _openPrintWindow('Payroll Summary', body);
    }

    function printCustomerSummary(client, code, summary, balance, title) {
        const body = `
            <div class="hdr">
                <div class="hdr-l">${title.toUpperCase()} SUMMARY</div>
                <div class="hdr-r">
                    <div><strong>Code:</strong> ${code || 'N/A'}</div>
                    <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
                </div>
            </div>
            <div style="padding:12px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:20px">
                <div style="font-size:16px;font-weight:bold;color:#1a1a2e">${_esc(client?.B2B_NAME || client?.CODE || code)}</div>
                <div style="font-size:11px;color:#666">${client?.B2B_ADDRESS || ''} ${client?.B2B_CITY ? ', ' + client.B2B_CITY : ''} ${client?.MOBILE_NUMBER ? '· ' + client.MOBILE_NUMBER : ''}</div>
            </div>
            
            <h3 style="margin-bottom:15px;color:#333;border-b:1px solid #eee;padding-bottom:5px">Financial Summary</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:25px">
                <tbody>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:500">Total Charged (Invoiced)</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;color:#1e3a8a">₹${summary.totalInvoiced.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:500">Total Received (Receipts)</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;color:#15803d">₹${summary.totalPaid.toFixed(2)}</td>
                    </tr>
                    <tr style="background:#f8fafc">
                        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:bold">Net Outstanding Balance</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;font-size:14px;color:${balance > 0 ? '#b91c1c' : '#15803d'}">₹${balance.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="font-size:11px;color:#888;text-align:center;margin-top:40px">
                This is a system-generated customer summary report as of ${new Date().toLocaleDateString()}.
            </div>
        `;
        _openPrintWindow(`${title} Summary - ${code || ''}`, body);
    }

    function printSupplierSummary(client, code, summary, balance, title) {
        const body = `
            <div class="hdr">
                <div class="hdr-l">${title.toUpperCase()} SUMMARY</div>
                <div class="hdr-r">
                    <div><strong>Code:</strong> ${code || 'N/A'}</div>
                    <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
                </div>
            </div>
            <div style="padding:12px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:20px">
                <div style="font-size:16px;font-weight:bold;color:#1a1a2e">${_esc(client?.B2B_NAME || client?.CODE || code)}</div>
                <div style="font-size:11px;color:#666">${client?.B2B_ADDRESS || ''} ${client?.B2B_CITY ? ', ' + client.B2B_CITY : ''} ${client?.MOBILE_NUMBER ? '· ' + client.MOBILE_NUMBER : ''}</div>
            </div>
            
            <h3 style="margin-bottom:15px;color:#333;border-b:1px solid #eee;padding-bottom:5px">Financial Summary</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:25px">
                <tbody>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:500">Total Owed (Purchases)</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;color:#b91c1c">₹${summary.totalInvoiced.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:500">Total Paid (Payments)</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;color:#15803d">₹${summary.totalPaid.toFixed(2)}</td>
                    </tr>
                    <tr style="background:#f8fafc">
                        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:bold">Net Outstanding Balance</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;font-size:14px;color:${balance > 0 ? '#b91c1c' : '#15803d'}">₹${balance.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="font-size:11px;color:#888;text-align:center;margin-top:40px">
                This is a system-generated supplier summary report as of ${new Date().toLocaleDateString()}.
            </div>
        `;
        _openPrintWindow(`${title} Summary - ${code || ''}`, body);
    }

    function printAgedReceivables(client, code, aging, title) {
        const body = `
            <div class="hdr">
                <div class="hdr-l">${title.toUpperCase()}</div>
                <div class="hdr-r">
                    <div><strong>Code:</strong> ${code || 'N/A'}</div>
                    <div><strong>As of Date:</strong> ${new Date().toLocaleDateString()}</div>
                </div>
            </div>
            <div style="padding:12px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:20px">
                <div style="font-size:16px;font-weight:bold;color:#1a1a2e">${_esc(client?.B2B_NAME || client?.CODE || code)}</div>
                <div style="font-size:11px;color:#666">${client?.B2B_ADDRESS || ''} ${client?.B2B_CITY ? ', ' + client.B2B_CITY : ''} ${client?.MOBILE_NUMBER ? '· ' + client.MOBILE_NUMBER : ''}</div>
            </div>
            
            <h3 style="margin-bottom:15px;color:#333;border-b:1px solid #eee;padding-bottom:5px">Aging Breakdown</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:25px">
                <thead>
                    <tr style="background:#f1f5f9;text-align:left">
                        <th style="padding:10px;font-size:11px;color:#475569">Period</th>
                        <th class="tr" style="padding:10px;font-size:11px;color:#475569">Outstanding Amount</th>
                        <th class="tr" style="padding:10px;font-size:11px;color:#475569">% of Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee">0 - 30 Days</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:500">₹${aging.current.toFixed(2)}</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;color:#64748b">${aging.total > 0 ? ((aging.current / aging.total) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee">31 - 60 Days</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:500">₹${aging.thirty.toFixed(2)}</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;color:#64748b">${aging.total > 0 ? ((aging.thirty / aging.total) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee">61 - 90 Days</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:500">₹${aging.sixty.toFixed(2)}</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;color:#64748b">${aging.total > 0 ? ((aging.sixty / aging.total) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee">Over 90 Days</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:500;color:#b91c1c">₹${aging.ninety.toFixed(2)}</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;color:#64748b">${aging.total > 0 ? ((aging.ninety / aging.total) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                    <tr style="background:#f8fafc;font-weight:bold">
                        <td style="padding:10px">Total Outstanding</td>
                        <td class="tr" style="padding:10px;font-size:14px;color:#b91c1c">₹${aging.total.toFixed(2)}</td>
                        <td class="tr" style="padding:10px">100.0%</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="font-size:11px;color:#888;text-align:center;margin-top:40px">
                Aged receivables are calculated on a FIFO allocation basis as of ${new Date().toLocaleDateString()}.
            </div>
        `;
        _openPrintWindow(`${title} - ${code || ''}`, body);
    }

    function printAgedPayables(client, code, aging, title) {
        const body = `
            <div class="hdr">
                <div class="hdr-l">${title.toUpperCase()}</div>
                <div class="hdr-r">
                    <div><strong>Code:</strong> ${code || 'N/A'}</div>
                    <div><strong>As of Date:</strong> ${new Date().toLocaleDateString()}</div>
                </div>
            </div>
            <div style="padding:12px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:20px">
                <div style="font-size:16px;font-weight:bold;color:#1a1a2e">${_esc(client?.B2B_NAME || client?.CODE || code)}</div>
                <div style="font-size:11px;color:#666">${client?.B2B_ADDRESS || ''} ${client?.B2B_CITY ? ', ' + client.B2B_CITY : ''} ${client?.MOBILE_NUMBER ? '· ' + client.MOBILE_NUMBER : ''}</div>
            </div>
            
            <h3 style="margin-bottom:15px;color:#333;border-b:1px solid #eee;padding-bottom:5px">Aging Breakdown</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:25px">
                <thead>
                    <tr style="background:#f1f5f9;text-align:left">
                        <th style="padding:10px;font-size:11px;color:#475569">Period</th>
                        <th class="tr" style="padding:10px;font-size:11px;color:#475569">Outstanding Amount</th>
                        <th class="tr" style="padding:10px;font-size:11px;color:#475569">% of Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee">0 - 30 Days</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:500">₹${aging.current.toFixed(2)}</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;color:#64748b">${aging.total > 0 ? ((aging.current / aging.total) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee">31 - 60 Days</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:500">₹${aging.thirty.toFixed(2)}</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;color:#64748b">${aging.total > 0 ? ((aging.thirty / aging.total) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee">61 - 90 Days</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:500">₹${aging.sixty.toFixed(2)}</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;color:#64748b">${aging.total > 0 ? ((aging.sixty / aging.total) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                    <tr>
                        <td style="padding:10px;border-bottom:1px solid #eee">Over 90 Days</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;font-weight:500;color:#b91c1c">₹${aging.ninety.toFixed(2)}</td>
                        <td class="tr" style="padding:10px;border-bottom:1px solid #eee;color:#64748b">${aging.total > 0 ? ((aging.ninety / aging.total) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                    <tr style="background:#f8fafc;font-weight:bold">
                        <td style="padding:10px">Total Outstanding</td>
                        <td class="tr" style="padding:10px;font-size:14px;color:#b91c1c">₹${aging.total.toFixed(2)}</td>
                        <td class="tr" style="padding:10px">100.0%</td>
                    </tr>
                </tbody>
            </table>
            
            <div style="font-size:11px;color:#888;text-align:center;margin-top:40px">
                Aged payables are calculated on a FIFO allocation basis as of ${new Date().toLocaleDateString()}.
            </div>
        `;
        _openPrintWindow(`${title} - ${code || ''}`, body);
    }

    // ── Public API ──────────────────────────────────────────────────────────
    return {
        printDocument,
        printSalesInvoice,
        printReceipt,
        printPurchaseBill,
        printCreditNote,
        printDebitNote,
        printJournal,
        printExpense,
        printCashMovement,
        printDeliveryNote,
        printEmployee,
        printSalarySlip,
        printStatement,
        printCashHolderStatement,
        printPayrollSummary,
        printCustomerSummary,
        printSupplierSummary,
        printAgedReceivables,
        printAgedPayables,
    };
})();

window.VaultPrint = VaultPrint;
