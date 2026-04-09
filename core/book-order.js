// ============================================================================
// BOOK-ORDER.JS (core) — Booking API: payload builder + API call
// ============================================================================

function buildBookingPayload(consignmentBoxes, consignmentProducts, summaryTotals, orderDateInput) {
    const orderData = {
        CODE:           document.getElementById('display_code').textContent || '',
        BRANCH:         document.getElementById('display_branch').textContent || '',
        ORDER_DATE:     toUnix(orderDateInput.value),
        CARRIER:        document.getElementById('display_carrier').textContent,
        AWB_NUMBER:     document.getElementById('awb').value.trim(),
        TRANSIT_DATE:   toUnix(orderDateInput.value),
        CONSIGNOR:      document.getElementById('display_consignor').textContent,
        ORIGIN_CITY:    document.getElementById('display_origin_city').textContent,
        ORIGIN_PINCODE: document.getElementById('display_origin_pincode').textContent,
        CONSIGNEE:      document.getElementById('display_consignee').textContent,
        DEST_CITY:      document.getElementById('display_dest_city').textContent,
        DEST_PINCODE:   document.getElementById('display_dest_pincode').textContent,
        TAT:            document.getElementById('display_tat').textContent,
        ZONE:           document.getElementById('display_zone').textContent,
        MODE:           document.getElementById('display_mode').textContent,
        GLOBAL:         document.getElementById('display_global').textContent,
        COD:            document.getElementById('display_cod').textContent,
        TOPAY:          document.getElementById('display_topay').textContent,
        FOV:            document.getElementById('display_fov').textContent,
        WEIGHT:         document.getElementById('display_weight').textContent,
        CHG_WT:         document.getElementById('display_chg_wt').textContent,
        PIECS:          document.getElementById('display_pieces').textContent,
        VALUE:          summaryTotals.totalAmount,
        FRIGHT:         document.getElementById('display_fright').textContent,
        FUEL_CHG:       document.getElementById('display_fuel_chg').textContent,
        COD_CHG:        document.getElementById('display_cod_chg').textContent,
        TOPAY_CHG:      document.getElementById('display_topay_chg').textContent,
        FOV_CHG:        document.getElementById('display_fov_chg').textContent,
        EWAY_CHG:       document.getElementById('display_eway_chg').textContent,
        AWB_CHG:        document.getElementById('display_awb_chg').textContent,
        PACK_CHG:       document.getElementById('display_pack_chg').textContent,
        DEV_CHG:        document.getElementById('display_dev_chg').textContent,
        TAXABLE:        document.getElementById('display_taxable').textContent,
        SGST:           document.getElementById('display_sgst').textContent,
        CGST:           document.getElementById('display_cgst').textContent,
        IGST:           document.getElementById('display_igst').textContent,
        TOTAL:          document.getElementById('display_total').textContent,
    };

    return {
        order: orderData,
        multibox: consignmentBoxes.map(box => ({
            WEIGHT:  box.actualWeight,
            LENGTH:  box.length,
            BREADTH: box.breadth,
            HIGHT:   box.height,
            VOLUME:  box.volWeight,
            CHG_WT:  box.chargeWeight
        })),
        products: [
            ...consignmentProducts.map(p => ({
                DOC_NUMBER: p.docNo,
                DOC_TYPE:   p.type,
                PRODUCT:    p.name,
                AMOUNT:     p.amount || 0
            })),
            ...consignmentProducts
                .filter(p => p.ewayBill)
                .map(p => ({
                    DOC_NUMBER: p.ewayBill,
                    DOC_TYPE:   'EWB',
                    PRODUCT:    p.name,
                    AMOUNT:     0
                }))
        ]
    };
}

async function submitBookOrder(payload) {
    return await callApi('/api/bookOrder', payload);
}

function buildEditPayload(consignmentBoxes, consignmentProducts, summaryTotals, orderDateInput, reference) {
    const payload = buildBookingPayload(consignmentBoxes, consignmentProducts, summaryTotals, orderDateInput);
    payload.order.REFERENCE    = reference;
    payload.deleteMultibox     = true;
    payload.deleteProducts     = true;
    return payload;
}

async function submitEditOrder(payload) {
    return await callApi('/api/editOrder', payload, 'PUT');
}

async function deleteOrder(reference) {
    return await callApi('/api/deleteOrder', { reference }, 'DELETE');
}
