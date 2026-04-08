import { PINCODE } from '../assets/Network/network-data.map.min.js';

/**
 * Look up a 6-digit pincode from the local network map.
 *
 * Returns an object on hit:
 *   { found: true, CITY, STATE, ZONE, ODA, EXPRESS_TAT, AIRLINE_TAT, SURFACE_TAT, PREMIUM_TAT }
 *
 * TAT values are numbers when serviceable, or "N" when not.
 * Returns { found: false } when pincode is not in the map.
 */
export function searchPin(pincode) {
    const entry = PINCODE.get(String(pincode).trim());
    if (!entry) return { found: false };

    const [CITY, STATE, ZONE, ODA, EXPRESS_TAT, AIRLINE_TAT, SURFACE_TAT, PREMIUM_TAT] = entry;
    return { found: true, CITY, STATE, ZONE, ODA, EXPRESS_TAT, AIRLINE_TAT, SURFACE_TAT, PREMIUM_TAT };
}
