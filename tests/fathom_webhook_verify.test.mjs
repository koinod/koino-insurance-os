// Smoke test for the Standard-Webhooks (Svix) signature verification in
// api/connector/fathom-webhook.js. Run: node tests/fathom_webhook_verify.test.mjs
// Proves: (1) unset secret fails open, (2) a correctly-signed delivery passes,
// (3) a tampered signature is rejected, (4) a stale timestamp is rejected,
// (5) missing headers are rejected. No network — verifies crypto only.
import { verifyFathom } from "../api/connector/fathom-webhook.js";

const SECRET_RAW = "supersecret-fathom-signing-key-1234567890";        // arbitrary key bytes
const SECRET = "whsec_" + Buffer.from(SECRET_RAW).toString("base64");  // Fathom whsec_ form
const body = JSON.stringify({ meeting: { id: "evt_123", attendees: [{ email: "a@b.com" }] } });

function H(obj) { return new Headers(obj); }

// Sign exactly as the spec dictates: HMAC-SHA256 over `${id}.${ts}.${body}`,
// keyed by the base64-decoded secret, base64-encoded result, `v1,` prefix.
async function sign(id, ts, payload, secretWhsec) {
  const keyB64 = secretWhsec.slice(6);
  const keyBytes = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${payload}`));
  return "v1," + btoa(String.fromCharCode(...new Uint8Array(mac)));
}

const now = Math.floor(Date.now() / 1000);
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

const goodSig = await sign("evt_123", String(now), body, SECRET);

check("unset secret fails open", await verifyFathom(body, H({}), "") === true);
check("undefined secret fails open", await verifyFathom(body, H({}), undefined) === true);
check("valid signature passes", await verifyFathom(body, H({
  "webhook-id": "evt_123", "webhook-timestamp": String(now), "webhook-signature": goodSig }), SECRET) === true);
check("valid sig among multiple passes", await verifyFathom(body, H({
  "webhook-id": "evt_123", "webhook-timestamp": String(now), "webhook-signature": "v1,AAAA " + goodSig }), SECRET) === true);
check("tampered signature rejected", await verifyFathom(body, H({
  "webhook-id": "evt_123", "webhook-timestamp": String(now), "webhook-signature": "v1," + btoa("notarealsignature!!") }), SECRET) === false);
check("tampered body rejected", await verifyFathom(body + "x", H({
  "webhook-id": "evt_123", "webhook-timestamp": String(now), "webhook-signature": goodSig }), SECRET) === false);
check("stale timestamp rejected", await verifyFathom(body, H({
  "webhook-id": "evt_123", "webhook-timestamp": String(now - 600), "webhook-signature": goodSig }), SECRET) === false);
check("missing headers rejected", await verifyFathom(body, H({}), SECRET) === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
