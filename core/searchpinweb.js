// core/searchpinweb.js
// Fetches pincode data from the India Post public API.
// Returns the same shape as searchpin.js where possible.
// NOTE: ZONE, ODA, and TAT fields are not available from this API — returned as null.

const PINCODE_API     = 'https://api.postalpincode.in/pincode/';
const POSTOFFICE_API  = 'https://api.postalpincode.in/postoffice/';

/**
 * Fetch pincode data from the Post Office public API.
 *
 * Returns on success:
 *   { found: true, CITY, STATE, DISTRICT, POST_OFFICES[], ZONE: null, ODA: null,
 *     EXPRESS_TAT: null, AIRLINE_TAT: null, SURFACE_TAT: null, PREMIUM_TAT: null }
 *
 * CITY  = District of the first delivery post office
 * STATE = state name from API
 *
 * Returns { found: false, error } on failure or invalid pincode.
 */
async function searchPinWeb(pincode) {
    const pin = String(pincode).trim();
    if (!/^\d{6}$/.test(pin)) return { found: false, error: 'Invalid pincode format.' };

    try {
        const res = await fetch(`${PINCODE_API}${pin}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const data = json?.[0];

        if (!data || data.Status !== 'Success' || !data.PostOffice?.length) {
            return { found: false, error: 'Pincode not found.' };
        }

        const offices = data.PostOffice;
        const deliveryOffice = offices.find(o => o.DeliveryStatus === 'Delivery') || offices[0];

        return {
            found:        true,
            CITY:         deliveryOffice.District || deliveryOffice.Name,
            STATE:        deliveryOffice.State,
            DISTRICT:     deliveryOffice.District,
            POST_OFFICES: offices.map(o => o.Name),
            ZONE:         null,
            ODA:          null,
            EXPRESS_TAT:  null,
            AIRLINE_TAT:  null,
            SURFACE_TAT:  null,
            PREMIUM_TAT:  null,
        };

    } catch (err) {
        return { found: false, error: err.message };
    }
}

/**
 * Search post offices by city / area / locality name.
 *
 * Returns an array of unique results:
 *   [{ NAME, PINCODE, DISTRICT, STATE, BRANCH_TYPE, DELIVERY_STATUS }, ...]
 *
 * Results are sorted: delivery offices first, then by name.
 * Returns [] on no match or error.
 *
 * Usage:
 *   const results = await searchDestination('dehradun');
 *   // results[0] => { NAME: 'Dehradun HO', PINCODE: '248001', DISTRICT: 'Dehradun', STATE: 'Uttarakhand', ... }
 */
async function searchDestination(query) {
    const q = String(query).trim();
    if (q.length < 3) return [];

    try {
        const res = await fetch(`${POSTOFFICE_API}${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const data = json?.[0];

        if (!data || data.Status !== 'Success' || !data.PostOffice?.length) return [];

        // Deduplicate by PINCODE — keep one entry per pincode (prefer delivery office)
        const byPincode = new Map();
        data.PostOffice.forEach(o => {
            const existing = byPincode.get(o.Pincode);
            if (!existing || o.DeliveryStatus === 'Delivery') {
                byPincode.set(o.Pincode, o);
            }
        });

        return Array.from(byPincode.values())
            .sort((a, b) => {
                // Delivery offices first
                if (a.DeliveryStatus === 'Delivery' && b.DeliveryStatus !== 'Delivery') return -1;
                if (b.DeliveryStatus === 'Delivery' && a.DeliveryStatus !== 'Delivery') return 1;
                return a.Name.localeCompare(b.Name);
            })
            .map(o => ({
                NAME:            o.Name,
                PINCODE:         o.Pincode,
                DISTRICT:        o.District,
                STATE:           o.State,
                BRANCH_TYPE:     o.BranchType,
                DELIVERY_STATUS: o.DeliveryStatus,
            }));

    } catch (err) {
        return [];
    }
}
