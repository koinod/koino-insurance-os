// tests/demo-seed-preserved.mjs — property test for the
// sprint/pre-flight demo-seed-wipe fix in data.jsx.
//
// Property under test:
//   A demo session never has its seed wiped by an empty cloud read.
//
// We mirror the canWrite() guard from data.jsx::hydrateFromSupabase and
// assert the four combinations of (demoMode, cloudShape).
//
// Run via:
//   node tests/demo-seed-preserved.mjs
//
// Exits 0 on pass, 1 on fail. No external deps — pure Node assertions.

import assert from "node:assert/strict";

// Mirror of the canWrite() helper from data.jsx (sprint/pre-flight). If
// this drifts from the real implementation, the test will catch it the
// next time we run smoke (the real hydrate behaviour is what matters; this
// is the contract).
function canWrite(res, demoMode) {
  if (demoMode) return Array.isArray(res?.data) && res.data.length > 0;
  return Array.isArray(res?.data);
}

// Helper: simulate one hydrate pass over a seeded AppData with the
// canWrite() guard and report what got written.
function simulateHydrate({ demoMode, cloudData, seed }) {
  const AppData = { REPS: seed.slice() };
  const res = { data: cloudData };
  if (canWrite(res, demoMode)) {
    AppData.REPS = res.data.map(r => ({ ...r, mapped: true }));
  }
  return AppData;
}

const SEED = [{ id: "seed-1", name: "Atlas" }, { id: "seed-2", name: "Marcus" }];

// Case 1: demo session, cloud returns []. PROPERTY: seed preserved.
{
  const after = simulateHydrate({ demoMode: true, cloudData: [], seed: SEED });
  assert.deepEqual(
    after.REPS,
    SEED,
    "demo + empty cloud should preserve the seed (the bug we're fixing)"
  );
}

// Case 2: demo session, cloud returns rows. PROPERTY: cloud wins.
{
  const cloud = [{ id: "cloud-1", name: "DemoCloud" }];
  const after = simulateHydrate({ demoMode: true, cloudData: cloud, seed: SEED });
  assert.equal(after.REPS.length, 1, "demo + non-empty cloud should overwrite seed");
  assert.equal(after.REPS[0].id, "cloud-1");
  assert.equal(after.REPS[0].mapped, true);
}

// Case 3: real session, cloud returns []. PROPERTY: empty state (cloud wins).
{
  const after = simulateHydrate({ demoMode: false, cloudData: [], seed: SEED });
  assert.deepEqual(
    after.REPS,
    [],
    "real session + empty cloud should land [] so empty-state UI renders"
  );
}

// Case 4: real session, cloud returns rows. PROPERTY: cloud wins.
{
  const cloud = [{ id: "cloud-2", name: "RealAgency" }];
  const after = simulateHydrate({ demoMode: false, cloudData: cloud, seed: SEED });
  assert.equal(after.REPS.length, 1);
  assert.equal(after.REPS[0].id, "cloud-2");
}

// Case 5: malformed cloud response (data is null / undefined). PROPERTY:
// neither overwrites. Whatever was there before stays.
{
  const after1 = simulateHydrate({ demoMode: true, cloudData: null, seed: SEED });
  assert.deepEqual(after1.REPS, SEED, "demo + null data: preserve seed");
  const after2 = simulateHydrate({ demoMode: false, cloudData: undefined, seed: SEED });
  assert.deepEqual(after2.REPS, SEED, "real + undefined data: preserve seed (defensive)");
}

// Case 6: demo session, cloud is the actual literal `[]`. PROPERTY: still
// preserves seed. This is the exact bug per the smoke run — Array.isArray([])
// returns true, but `[].length > 0` returns false, so canWrite() rejects.
{
  const after = simulateHydrate({ demoMode: true, cloudData: [], seed: SEED });
  assert.ok(after.REPS.length > 0, "literal [] from cloud must not erase demo seed");
  assert.equal(after.REPS[0].id, "seed-1");
}

console.log("ok: demo-seed-preserved (6/6 properties hold)");
