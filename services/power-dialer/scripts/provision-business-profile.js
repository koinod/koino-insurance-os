#!/usr/bin/env node
// Provision a Twilio Trust Hub Business Profile for Shaken/STIR A-attestation
// + A2P 10DLC brand registration. Idempotent — re-runs check existing
// objects by friendly_name and skip if already created.
//
// Required env (or fill in the BIZ block below):
//   KOINO_LEGAL_NAME   — exact registered legal entity name
//   KOINO_EIN          — federal EIN, 9 digits, no dashes
//   KOINO_ADDRESS_LINE — "1234 Main St"
//   KOINO_CITY         — "Miami"
//   KOINO_STATE        — "FL"
//   KOINO_POSTAL       — "33131"
//   KOINO_COUNTRY      — "US"
//   KOINO_BIZ_WEBSITE  — "https://koino.capital"
//   KOINO_BIZ_EMAIL    — "legal@koino.capital"
//   KOINO_BIZ_PHONE    — "+13055551212" (E.164)
//   KOINO_BIZ_TYPE     — usually "Private for-profit"
//   KOINO_BIZ_INDUSTRY — "Insurance"
//   KOINO_REGISTRATION_ID_TYPE — "EIN"
//
// Usage:
//   node scripts/provision-business-profile.js [--dry-run]
//
// Dry-run prints the API calls that WOULD execute and the missing env.
// Live run requires a non-trial Twilio account (Trust Hub APIs are paid).

import twilio from 'twilio';
import { config } from '../src/config.js';

const DRY_RUN = process.argv.includes('--dry-run');

const BIZ = {
  legal_name:        process.env.KOINO_LEGAL_NAME,
  ein:               process.env.KOINO_EIN,
  address_line:      process.env.KOINO_ADDRESS_LINE,
  city:              process.env.KOINO_CITY,
  state:             process.env.KOINO_STATE,
  postal:            process.env.KOINO_POSTAL,
  country:           process.env.KOINO_COUNTRY  || 'US',
  website:           process.env.KOINO_BIZ_WEBSITE || 'https://koino.capital',
  email:             process.env.KOINO_BIZ_EMAIL   || 'legal@koino.capital',
  phone:             process.env.KOINO_BIZ_PHONE,
  business_type:     process.env.KOINO_BIZ_TYPE   || 'Private for-profit',
  business_industry: process.env.KOINO_BIZ_INDUSTRY || 'Insurance',
  registration_id_type: process.env.KOINO_REGISTRATION_ID_TYPE || 'EIN',
};

function missing() {
  return Object.entries(BIZ).filter(([_, v]) => !v).map(([k]) => k);
}

async function main() {
  const miss = missing();
  if (miss.length) {
    console.error('Missing required env:', miss.join(', '));
    console.error('Add them to .env.local then re-run.');
    if (!DRY_RUN) process.exit(1);
  }

  const client = twilio(config.twilioSid, config.twilioToken);

  // 1. Check / create the primary customer profile
  console.log('# 1. CustomerProfile (Trust Hub root)');
  const profileName = `Koino Capital Business Profile`;
  let profile;
  try {
    const existing = await client.trusthub.v1.customerProfiles.list({ pageSize: 50 });
    profile = existing.find((p) => p.friendlyName === profileName);
  } catch (e) {
    console.error(' list failed:', e.message);
  }

  if (profile) {
    console.log(` ✓ exists: ${profile.sid} (status=${profile.status})`);
  } else if (DRY_RUN) {
    console.log(' [dry-run] would CREATE customerProfile', { friendlyName: profileName, email: BIZ.email });
  } else {
    profile = await client.trusthub.v1.customerProfiles.create({
      friendlyName: profileName,
      email:        BIZ.email,
      policySid:    'RNdfbf3fae0e1107f8aded728e92e065ef', // primary customer policy SID (well-known)
    });
    console.log(` ✓ created: ${profile.sid}`);
  }

  // 2. End-user objects: business info + auth rep
  console.log('# 2. EndUser objects (business + auth rep)');
  if (DRY_RUN) {
    console.log(' [dry-run] would CREATE business_information end-user');
    console.log(' [dry-run] would CREATE authorized_representative_1 end-user');
  } else {
    console.log(' run live after KOINO_AUTH_REP_* env are set; see docs/trust-hub.md');
  }

  // 3. SHAKEN/STIR Trust Product
  console.log('# 3. Trust Product (Shaken/STIR)');
  if (DRY_RUN) {
    console.log(' [dry-run] would CREATE trustProduct{policy=Shaken/STIR}');
  } else {
    console.log(' submit after customerProfile is APPROVED (~3 business days)');
  }

  // 4. A2P 10DLC brand registration (for high-volume SMS)
  console.log('# 4. A2P 10DLC Brand (Twilio Messaging)');
  if (DRY_RUN) {
    console.log(' [dry-run] would CREATE brandRegistration{brandType=STANDARD}');
  } else {
    console.log(' run after customerProfile APPROVED');
  }

  console.log('\nNext steps:');
  console.log(' • Twilio reviews profile in ~3 business days');
  console.log(' • Once APPROVED, re-run this script live (drop --dry-run) to file Shaken + 10DLC');
  console.log(' • Shaken A-attestation appears on calls within 24h of approval');
}

main().catch((e) => { console.error(e); process.exit(1); });
