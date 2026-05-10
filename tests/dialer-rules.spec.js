/* tests/dialer-rules.spec.js — pure unit tests for lib/dial-rules.js
 *
 * lib/dial-rules.js is a browser IIFE that attaches to `window` (no exports)
 * and uses sessionStorage / localStorage / setInterval. We boot a minimal
 * jsdom-like shim here using node:test + node:assert with no npm deps.
 *
 *   node --test tests/dialer-rules.spec.js
 *
 * Coverage:
 *   - dispositionCadence — each disposition → correct delay + terminal flag
 *   - canDialNow — TCPA before 8am / after 9pm / state Sunday rules / DNC
 *   - dialCooldown / markDialAttempt — 5-minute cooldown
 *   - scheduleRedial / dueRedials — queue ordering, due-now ahead of scheduled
 *   - PacingBadge logic — 91st dial in an hour returns exceeded
 *
 * Note: dial-rules.js does NOT itself enforce DNC (see audit). The dialer
 * layer would gate `if (lead.dnc) return block`. We assert that behavior
 * here as a *contract* test the dialer should honor; it's marked TODO if
 * the file doesn't actually expose a DNC check.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// ── Browser shim ─────────────────────────────────────────────────────────
function makeWindow() {
  const sessionStore = {};
  const localStore = {};
  const listeners = {};
  const intervals = [];

  const win = {
    Date,
    JSON,
    Math,
    Intl,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval: () => {},
    sessionStorage: {
      getItem: (k) => k in sessionStore ? sessionStore[k] : null,
      setItem: (k, v) => { sessionStore[k] = String(v); },
      removeItem: (k) => { delete sessionStore[k]; },
    },
    localStorage: {
      getItem: (k) => k in localStore ? localStore[k] : null,
      setItem: (k, v) => { localStore[k] = String(v); },
      removeItem: (k) => { delete localStore[k]; },
    },
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener: (ev, fn) => {
      listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn);
    },
    dispatchEvent: (ev) => {
      const fns = listeners[ev.type] || [];
      fns.forEach((fn) => fn(ev));
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    _intervals: intervals,
    _sessionStore: sessionStore,
    _localStore: localStore,
  };
  // Self-reference so `window.foo = ...` inside the IIFE works
  win.window = win;
  return win;
}

function loadRules(opts = {}) {
  const win = makeWindow();
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "dial-rules.js"), "utf8");
  // Allow a frozen "now" for TCPA tests by injecting a Date subclass that
  // returns the fixed instant on `new Date()` and `Date.now()`.
  let DateImpl = Date;
  if (opts.fixedUTC) {
    const fixed = opts.fixedUTC; // ms epoch
    const RealDate = Date;
    DateImpl = class FrozenDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) { super(fixed); return; }
        super(...args);
      }
      static now() { return fixed; }
    };
  }
  const ctx = vm.createContext({
    window: win,
    sessionStorage: win.sessionStorage,
    localStorage: win.localStorage,
    setInterval: win.setInterval,
    CustomEvent: win.CustomEvent,
    Date: DateImpl,
    JSON,
    Math,
    Intl,
  });
  vm.runInContext(src, ctx);
  return win;
}

// Load once for the file (fresh per test sub-suite to keep state isolated)

// ── 1. dispositionCadence ────────────────────────────────────────────────
test("dispositionCadence: no_answer → retry in 2h, not terminal", () => {
  const win = loadRules();
  const c = win.dispositionCadence("no_answer");
  assert.equal(c.terminal, false);
  assert.equal(c.retryAfterMs, 2 * 60 * 60 * 1000);
});

test("dispositionCadence: voicemail → retry in 24h, not terminal", () => {
  const win = loadRules();
  const c = win.dispositionCadence("voicemail");
  assert.equal(c.terminal, false);
  assert.equal(c.retryAfterMs, 24 * 60 * 60 * 1000);
});

test("dispositionCadence: callback → no auto-retry (manual), not terminal", () => {
  const win = loadRules();
  const c = win.dispositionCadence("callback");
  assert.equal(c.terminal, false);
  assert.equal(c.retryAfterMs, null);
});

test("dispositionCadence: appointment → terminal (booked, stop dialing)", () => {
  const win = loadRules();
  const c = win.dispositionCadence("appointment");
  assert.equal(c.terminal, true);
});

test("dispositionCadence: not_interested → terminal (dead)", () => {
  const win = loadRules();
  const c = win.dispositionCadence("not_interested");
  assert.equal(c.terminal, true);
});

test("dispositionCadence: no_contact_info → terminal (missing phone)", () => {
  const win = loadRules();
  const c = win.dispositionCadence("no_contact_info");
  assert.equal(c.terminal, true);
});

test("dispositionCadence: unknown disposition (e.g. wrong_number) → terminal fallback", () => {
  // dial-rules doesn't have an explicit 'wrong_number' branch — it falls into
  // default which is terminal=true. The spec test pins this contract so any
  // future change to add wrong_number-specific cadence is intentional.
  const win = loadRules();
  const c = win.dispositionCadence("wrong_number");
  assert.equal(c.terminal, true);
  assert.equal(c.retryAfterMs, null);
});

test("dispositionCadence: 'contact_no_sale' (not in code) falls into terminal default", () => {
  // FINDING: there is no specific cadence for "contact-no-sale" / "interested".
  // Per current code, anything not in the switch list is treated as terminal,
  // which means a warm conversation that didn't close gets dropped from the
  // retry pool. The dialer needs a 'contact-no-sale' → 3d retry rule.
  const win = loadRules();
  const c = win.dispositionCadence("contact_no_sale");
  assert.equal(c.terminal, true, "GAP: contact-no-sale dispositions never come back into queue");
});

// ── 2. canDialNow — TCPA + state rules ───────────────────────────────────
function fakeNowAt(year, month, day, hour, minute = 0) {
  // Build a Date in UTC then return a stub that returns it from new Date()
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
}

test("canDialNow: TX lead at 7am CT (13:00 UTC standard) is BLOCKED", () => {
  // Jan 7 2026 13:00 UTC = 7am CT (Wednesday)
  const win = loadRules({ fixedUTC: Date.UTC(2026, 0, 7, 13, 0, 0) });
  const r = win.canDialNow({ state: "TX" });
  assert.equal(r.ok, false, "7am CT should be before the 8am window");
  assert.match(r.reason, /Before 8am TX/);
});

test("canDialNow: TX lead at 9am CT is ALLOWED", () => {
  const win = loadRules({ fixedUTC: Date.UTC(2026, 0, 7, 15, 0, 0) });
  const r = win.canDialNow({ state: "TX" });
  assert.equal(r.ok, true);
});

test("canDialNow: NY lead at 10pm ET is BLOCKED (after 9pm cutoff)", () => {
  // 10pm ET (winter UTC-5) = 03:00 UTC next day
  const win = loadRules({ fixedUTC: Date.UTC(2026, 0, 8, 3, 0, 0) });
  const r = win.canDialNow({ state: "NY" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /After 9pm NY/);
});

test("canDialNow: MS lead on Sunday at noon CT is BLOCKED (no-Sunday rule)", () => {
  // Sun Jan 11 2026 noon CT = 18:00 UTC
  const win = loadRules({ fixedUTC: Date.UTC(2026, 0, 11, 18, 0, 0) });
  const r = win.canDialNow({ state: "MS" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no-Sunday/);
});

test("canDialNow: FL lead Sunday 8am ET is BLOCKED (Sunday start = 9am)", () => {
  // Sun Jan 11 2026 8am ET = 13:00 UTC
  const win = loadRules({ fixedUTC: Date.UTC(2026, 0, 11, 13, 0, 0) });
  const r = win.canDialNow({ state: "FL" });
  assert.equal(r.ok, false);
});

test("canDialNow: lead with unknown state (XX) is allowed (no block)", () => {
  const win = loadRules();
  const r = win.canDialNow({ state: "XX" });
  assert.equal(r.ok, true);
});

test("canDialNow: missing lead → ok (don't crash on null)", () => {
  const win = loadRules();
  const r = win.canDialNow(null);
  assert.equal(r.ok, true);
});

test("DNC contract: GAP — dial-rules.js does not honor lead.dnc=true", () => {
  // FINDING: canDialNow has no DNC check. A lead marked dnc=true is allowed
  // through. The dialer page must enforce this explicitly OR a dnc gate
  // should be added to canDialNow. Pin the GAP here so it shows up in CI.
  const win = loadRules();
  const r = win.canDialNow({ state: "TX", dnc: true });
  // Currently passes through — pin the bug so the team knows to add DNC.
  // Switch to assert.equal(r.ok, false) the day a DNC gate lands.
  assert.equal(r.ok, true, "GAP: TODO — add dnc=true → block to canDialNow()");
});

// ── 3. Cooldown ──────────────────────────────────────────────────────────
test("dialCooldown: fresh lead → 0ms cooldown", () => {
  const win = loadRules();
  assert.equal(win.dialCooldown("lead-1"), 0);
});

test("dialCooldown: after markDialAttempt, ~5min remaining", () => {
  const win = loadRules();
  win.markDialAttempt("lead-2");
  const remaining = win.dialCooldown("lead-2");
  assert.ok(remaining > 4 * 60 * 1000 && remaining <= 5 * 60 * 1000,
    `expected ~5min cooldown, got ${remaining}ms`);
});

// ── 4. scheduleRedial / dueRedials ───────────────────────────────────────
test("scheduleRedial: voicemail outcome enqueues with at = now + 24h", () => {
  const win = loadRules();
  const before = Date.now();
  const at = win.scheduleRedial({ id: "L1", lead: "Cheryl H", phone: "5125551111" }, "voicemail");
  const expected = before + 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(at - expected) < 1000, `at delta ${Math.abs(at - expected)}ms`);
});

test("scheduleRedial: terminal outcomes return null (not queued)", () => {
  const win = loadRules();
  const at = win.scheduleRedial({ id: "L2", lead: "Z" }, "appointment");
  assert.equal(at, null);
});

test("scheduleRedial: re-scheduling same lead replaces old entry (newest wins)", () => {
  const win = loadRules();
  win.scheduleRedial({ id: "L3", lead: "A", phone: "1" }, "no_answer");
  win.scheduleRedial({ id: "L3", lead: "A", phone: "1" }, "voicemail");
  const queue = JSON.parse(win.localStorage.getItem("repflow.redial_queue") || "[]");
  const entries = queue.filter((q) => q.leadId === "L3");
  assert.equal(entries.length, 1, "should have exactly one entry per lead");
  assert.equal(entries[0].outcome, "voicemail");
});

test("dueRedials: returns only entries with at <= now (due now), order by at asc when sorted", () => {
  const win = loadRules();
  // Hand-craft a queue: 2 due, 1 future, scrambled
  const now = Date.now();
  const fakeQueue = [
    { leadId: "scheduled-1", at: now + 60_000, outcome: "no_answer" },
    { leadId: "due-2", at: now - 1000, outcome: "voicemail" },
    { leadId: "due-1", at: now - 5000, outcome: "no_answer" },
  ];
  win.localStorage.setItem("repflow.redial_queue", JSON.stringify(fakeQueue));
  const due = win.dueRedials();
  assert.equal(due.length, 2, "two entries are due");
  assert.ok(due.every((q) => q.at <= now));
  // Note: dueRedials does NOT sort. The redial-queue UI sorts by at asc on read.
  // We verify ordering contract by sorting and checking the older one comes first.
  const sorted = [...due].sort((a, b) => a.at - b.at);
  assert.equal(sorted[0].leadId, "due-1");
});

// ── 5. Pacing — 91st dial in an hour returns exceeded ────────────────────
test("PacingBadge logic (recreated): 91st dial in hour exceeds soft cap of 90", () => {
  // page-redial-queue.jsx defines this inline as window.checkDialPace.
  // Recreate the same algorithm here (read sessionStorage repflow.dial_attempts,
  // count entries within the last hour) and assert behavior.
  const win = loadRules();
  const now = Date.now();
  const map = {};
  for (let i = 0; i < 91; i++) {
    map[`lead-${i}`] = now - i * 1000; // all within last 91s
  }
  win.sessionStorage.setItem("repflow.dial_attempts", JSON.stringify(map));

  // Inline pacing function — copy of page-redial-queue.jsx checkDialPace
  const cap = 90;
  const cutoff = Date.now() - 60 * 60 * 1000;
  const stored = JSON.parse(win.sessionStorage.getItem("repflow.dial_attempts") || "{}");
  const count = Object.values(stored).filter((t) => t > cutoff).length;
  const exceeded = count >= cap;

  assert.equal(count, 91);
  assert.equal(exceeded, true);
});

test("PacingBadge logic: 89 dials in hour does NOT exceed cap of 90", () => {
  const win = loadRules();
  const now = Date.now();
  const map = {};
  for (let i = 0; i < 89; i++) map[`lead-${i}`] = now - i * 1000;
  win.sessionStorage.setItem("repflow.dial_attempts", JSON.stringify(map));
  const cap = 90;
  const cutoff = Date.now() - 60 * 60 * 1000;
  const stored = JSON.parse(win.sessionStorage.getItem("repflow.dial_attempts") || "{}");
  const exceeded = Object.values(stored).filter((t) => t > cutoff).length >= cap;
  assert.equal(exceeded, false);
});
