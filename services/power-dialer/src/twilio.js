// Backward-compat shim. Existing imports (`./twilio.js`) keep working;
// the real provider selection happens in telephony.js.
//
// Do NOT add new code here — use telephony.js for the abstraction.

export {
  twimlUrl,
  statusCallbackUrl,
  amdCallbackUrl,
  placeOutbound,
  hangup,
  redirect,
} from './telephony.js';
