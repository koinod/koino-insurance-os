/* lib/demo.js — single source of truth for the seeded "Atlas Insurance Group"
 * demo agency. Importable from BOTH frontend (window.Shared also exposes the
 * same value) and edge-runtime API handlers.
 *
 * Override at deploy time by setting DEMO_AGENCY_ID in the Vercel env so we
 * can rotate the seeded tenant without a code push.
 */

export const DEMO_AGENCY_ID =
  (typeof process !== "undefined" && process.env && process.env.DEMO_AGENCY_ID) ||
  "e0a68c9f-cf48-47b0-bef7-dba3f27db0b9";

/** True when an agency_id matches the seeded demo tenant. */
export function isDemoAgencyId(id) {
  return !!id && id === DEMO_AGENCY_ID;
}
