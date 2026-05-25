#!/usr/bin/env node
// Provision a Twilio Elastic SIP Trunk pointed at our self-hosted LiveKit
// SIP service, and create the matching LiveKit inbound + outbound trunks.
//
// One-time setup that the worker depends on. Idempotent — re-runs detect
// existing trunks and reuse.
//
// Required env:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN     — paid account
//   LIVEKIT_URL                                — wss://... (or ws://localhost)
//   LIVEKIT_API_KEY, LIVEKIT_API_SECRET
//   LIVEKIT_SIP_PUBLIC_HOST                    — the FQDN Twilio dials into
//     (e.g. mac-mini.example.com via Cloudflare Tunnel, or sip.example.fly.dev)
//
// Usage: node scripts/provision-sip-trunk.js [--dry-run]

import twilio from 'twilio';
import { config } from '../src/config.js';
import { sip } from '../src/livekit.js';

const DRY_RUN = process.argv.includes('--dry-run');
const SIP_HOST = process.env.LIVEKIT_SIP_PUBLIC_HOST;
const TRUNK_NAME = 'koino-power-dialer';

async function main() {
  if (!SIP_HOST && !DRY_RUN) {
    console.error('LIVEKIT_SIP_PUBLIC_HOST not set; cannot point Twilio at our LiveKit');
    console.error('Set up Cloudflare Tunnel: brew install cloudflared && cloudflared tunnel --url localhost:5060');
    process.exit(1);
  }
  const client = twilio(config.twilioSid, config.twilioToken);

  // 1. Twilio side: create elastic SIP trunk
  console.log('# 1. Twilio Elastic SIP Trunk');
  let trunk;
  try {
    const list = await client.trunking.v1.trunks.list({ pageSize: 50 });
    trunk = list.find((t) => t.friendlyName === TRUNK_NAME);
  } catch (e) { console.error(' list failed:', e.message); }

  if (trunk) {
    console.log(` ✓ exists: ${trunk.sid}  domain=${trunk.domainName}`);
  } else if (DRY_RUN) {
    console.log(' [dry-run] would CREATE trunks.create({friendlyName})');
  } else {
    trunk = await client.trunking.v1.trunks.create({ friendlyName: TRUNK_NAME });
    console.log(` ✓ created: ${trunk.sid}  domain=${trunk.domainName}`);
  }

  // 2. Twilio side: add origination URL → LiveKit SIP host
  console.log('# 2. Origination URL (Twilio → LiveKit)');
  if (DRY_RUN) {
    console.log(` [dry-run] would CREATE origination url=sip:${SIP_HOST || 'YOUR_HOST'}`);
  } else if (trunk) {
    const existing = await client.trunking.v1.trunks(trunk.sid).originationUrls.list();
    const sipUri = `sip:${SIP_HOST}`;
    if (existing.find((u) => u.sipUrl === sipUri)) {
      console.log(' ✓ origination URL already set');
    } else {
      await client.trunking.v1.trunks(trunk.sid).originationUrls.create({
        friendlyName: 'livekit-primary',
        sipUrl: sipUri, weight: 10, priority: 10, enabled: true,
      });
      console.log(` ✓ added: ${sipUri}`);
    }
  }

  // 3. LiveKit side: inbound trunk (receives from Twilio)
  console.log('# 3. LiveKit Inbound SIP Trunk');
  if (DRY_RUN) {
    console.log(' [dry-run] would CREATE livekit inbound trunk');
  } else {
    try {
      const trunks = await sip.listSipInboundTrunk();
      let lkIn = trunks.items?.find((t) => t.name === TRUNK_NAME);
      if (!lkIn) {
        lkIn = await sip.createSipInboundTrunk({
          name: TRUNK_NAME,
          numbers: [],
          allowedAddresses: [], // populate with Twilio SIP region IPs in prod
        });
        console.log(` ✓ created: ${lkIn.sipTrunkId}`);
      } else {
        console.log(` ✓ exists: ${lkIn.sipTrunkId}`);
      }
      console.log(`   Add to .env.local: LIVEKIT_SIP_TRUNK_SID=${lkIn.sipTrunkId}`);
    } catch (e) {
      console.error(' livekit inbound trunk failed:', e.message);
    }
  }

  // 4. LiveKit side: dispatch rule (route incoming to a room based on SIP header)
  console.log('# 4. LiveKit SIP Dispatch Rule (route by x-livekit-room header)');
  if (DRY_RUN) {
    console.log(' [dry-run] would CREATE dispatch rule routing by x-livekit-room header');
  } else {
    try {
      const rules = await sip.listSipDispatchRule();
      const existing = rules.items?.find((r) => r.name === 'koino-room-by-header');
      if (!existing) {
        await sip.createSipDispatchRule({
          name: 'koino-room-by-header',
          rule: { type: 'individual', roomPrefix: '' }, // room from header
          attributes: {},
        });
        console.log(' ✓ created');
      } else {
        console.log(` ✓ exists: ${existing.sipDispatchRuleId}`);
      }
    } catch (e) {
      console.error(' dispatch rule failed:', e.message);
    }
  }

  console.log('\nNext steps:');
  console.log(' • Add the LIVEKIT_SIP_TRUNK_SID line printed above to .env.local');
  console.log(' • Add LIVEKIT_SIP_DOMAIN=<trunk-domain>.sip.livekit.cloud (or self-host equivalent)');
  console.log(' • Buy outbound numbers + assign to trunk: scripts/warm-number-pool.js');
}

main().catch((e) => { console.error(e); process.exit(1); });
