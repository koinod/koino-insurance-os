/* lib/dial-rules.js — TCPA window check + cooldown + retry-cadence helpers.
 *
 * TCPA Section 227 + state add-ons restrict telemarketing calls to 8am-9pm
 * local time at the called party's location. Some states tighten further
 * (e.g., FL Sundays, MS no Sundays, etc.). This file is the single source
 * of truth for "is it OK to dial this lead right now" across:
 *   - queue rows (DialQueueView)
 *   - pipeline lead detail
 *   - autodialer (skips out-of-window leads automatically)
 *
 * window.canDialNow(lead) -> { ok: bool, reason?: string, until?: Date }
 * window.dialCooldown(leadId) -> ms remaining (0 if not on cooldown)
 * window.markDialAttempt(leadId) -> sets cooldown timestamp
 * window.dispositionCadence(outcome) -> { retryAfterMs, terminal }
 */

(function () {
  // Rough state -> IANA timezone map. Most insurance leads are US-only, so
  // we just need the dominant timezone per state. Multi-zone states default
  // to the most populated one.
  const STATE_TZ = {
    AL: "America/Chicago",     AK: "America/Anchorage",   AZ: "America/Phoenix",
    AR: "America/Chicago",     CA: "America/Los_Angeles", CO: "America/Denver",
    CT: "America/New_York",    DE: "America/New_York",    FL: "America/New_York",
    GA: "America/New_York",    HI: "Pacific/Honolulu",    ID: "America/Boise",
    IL: "America/Chicago",     IN: "America/Indiana/Indianapolis",
    IA: "America/Chicago",     KS: "America/Chicago",     KY: "America/New_York",
    LA: "America/Chicago",     ME: "America/New_York",    MD: "America/New_York",
    MA: "America/New_York",    MI: "America/Detroit",     MN: "America/Chicago",
    MS: "America/Chicago",     MO: "America/Chicago",     MT: "America/Denver",
    NE: "America/Chicago",     NV: "America/Los_Angeles", NH: "America/New_York",
    NJ: "America/New_York",    NM: "America/Denver",      NY: "America/New_York",
    NC: "America/New_York",    ND: "America/Chicago",     OH: "America/New_York",
    OK: "America/Chicago",     OR: "America/Los_Angeles", PA: "America/New_York",
    RI: "America/New_York",    SC: "America/New_York",    SD: "America/Chicago",
    TN: "America/Chicago",     TX: "America/Chicago",     UT: "America/Denver",
    VT: "America/New_York",    VA: "America/New_York",    WA: "America/Los_Angeles",
    WV: "America/New_York",    WI: "America/Chicago",     WY: "America/Denver",
    DC: "America/New_York",
  };

  // State-specific overrides (departures from federal 8am-9pm). Empty {} = federal default.
  // FL: Sundays not before 9am; MS: no Sundays. Where ambiguous, defer to caller.
  const STATE_OVERRIDES = {
    FL: { sundayStartHour: 9 },
    MS: { noSunday: true },
    AR: { noSunday: true },
    LA: { noSunday: true },
    OK: { noSunday: true },
  };

  function localHourFor(tz) {
    try {
      const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", weekday: "short", hour12: false });
      const parts = f.formatToParts(new Date());
      const h = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
      const m = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
      const wkd = parts.find(p => p.type === "weekday")?.value;  // Sun, Mon, ...
      return { hour: h, minute: m, weekday: wkd };
    } catch { return null; }
  }

  /** Is it ok to dial this lead right now under TCPA + state rules? */
  window.canDialNow = function (lead) {
    if (!lead) return { ok: true };
    const state = (lead.state || "").toUpperCase();
    const tz = STATE_TZ[state];
    if (!tz) return { ok: true };  // unknown state — let it through, don't block
    const t = localHourFor(tz);
    if (!t) return { ok: true };
    const ov = STATE_OVERRIDES[state] || {};
    const isSun = t.weekday === "Sun";

    // Federal floor: 8am, ceiling: 9pm (21:00) at lead's local time
    let startHour = 8;
    let endHour = 21;  // exclusive
    if (isSun && ov.sundayStartHour) startHour = ov.sundayStartHour;
    if (isSun && ov.noSunday) {
      return { ok: false, reason: `${state} no-Sunday rule`, restartTomorrow: true };
    }

    if (t.hour < startHour) {
      const until = new Date();
      // Pretty-format the local resume time for the user's display
      return { ok: false, reason: `Before ${startHour}am ${state} time`, untilLocalHour: startHour, tz };
    }
    if (t.hour >= endHour) {
      return { ok: false, reason: `After ${endHour - 12}pm ${state} time`, untilLocalHour: startHour, tz, restartTomorrow: true };
    }
    return { ok: true };
  };

  /** Cooldown between dials to the same lead. Default 5 minutes — prevents
   *  accidental redial spam if a rep hammers the dial button. */
  const COOLDOWN_MS = 5 * 60 * 1000;
  function getAttempts() {
    try { return JSON.parse(sessionStorage.getItem("repflow.dial_attempts") || "{}"); }
    catch { return {}; }
  }
  function setAttempts(map) {
    try { sessionStorage.setItem("repflow.dial_attempts", JSON.stringify(map)); }
    catch {}
  }
  window.dialCooldown = function (leadId) {
    const map = getAttempts();
    const last = map[leadId];
    if (!last) return 0;
    return Math.max(0, COOLDOWN_MS - (Date.now() - last));
  };
  window.markDialAttempt = function (leadId) {
    const map = getAttempts();
    map[leadId] = Date.now();
    setAttempts(map);
  };

  /** Disposition cadence — what to do after an autodial outcome. */
  window.dispositionCadence = function (outcome) {
    switch (outcome) {
      case "no_answer":      return { retryAfterMs: 2 * 60 * 60 * 1000, terminal: false, label: "retry in 2h" };
      case "voicemail":      return { retryAfterMs: 24 * 60 * 60 * 1000, terminal: false, label: "retry tomorrow" };
      case "callback":       return { retryAfterMs: null, terminal: false, label: "schedule callback" };
      case "appointment":    return { retryAfterMs: null, terminal: true,  label: "appointment booked" };
      case "not_interested": return { retryAfterMs: null, terminal: true,  label: "marked dead" };
      case "no_contact_info":return { retryAfterMs: null, terminal: true,  label: "missing phone" };
      default:               return { retryAfterMs: null, terminal: true,  label: outcome };
    }
  };

  /** Retry queue — leads scheduled to come back into the autodial pool.
   *
   *  Persistence (2026-05-24): scheduledRedials follow the rep across
   *  devices via user_prefs.key='redial_queue'. localStorage stays as the
   *  synchronous cache (UI never blocks on the network). Pattern mirrors
   *  AutodialQueue in shared.jsx: debounced upsert, hydrate on me:loaded,
   *  server-newer-wins on conflict.
   *
   *  Money-leak bug this closes: rep dials lead on laptop, hits "voicemail"
   *  outcome → 24h redial scheduled in localStorage only. Rep opens phone
   *  next day, redial doesn't exist there, missed callback. */
  const LS_REDIAL  = "repflow.redial_queue";
  const LS_META    = "repflow.redial_queue.meta.v1";  // { updated_at: ISO }
  const PREF_KEY   = "redial_queue";

  const _read     = () => { try { return JSON.parse(localStorage.getItem(LS_REDIAL) || "[]"); } catch { return []; } };
  const _readMeta = () => { try { return JSON.parse(localStorage.getItem(LS_META)   || "{}"); } catch { return {}; } };
  const _writeMeta = (m) => { try { localStorage.setItem(LS_META, JSON.stringify(m)); } catch {} };
  const _repId = () => {
    const me = (typeof window !== "undefined" && window.me && window.me()) || null;
    return me?.rep_id || null;
  };

  let _pushTimer = null;
  const _schedulePush = () => {
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(_pushNow, 600);
  };
  const _pushNow = async () => {
    _pushTimer = null;
    const sb  = window.getSupabase && window.getSupabase();
    const rid = _repId();
    if (!sb || !rid) return;
    const value = _read();
    const updated_at = new Date().toISOString();
    _writeMeta({ updated_at });
    try {
      const { error } = await sb.from("user_prefs").upsert(
        { rep_id: rid, key: PREF_KEY, value, updated_at },
        { onConflict: "rep_id,key" }
      );
      if (error && !/relation .* does not exist/i.test(error.message || "")) {
        console.warn("[redial.push]", error.message || error);
      }
    } catch (e) { console.warn("[redial.push]", e?.message || e); }
  };
  const _write = (rows, { push = true } = {}) => {
    try { localStorage.setItem(LS_REDIAL, JSON.stringify(rows)); } catch {}
    _writeMeta({ updated_at: new Date().toISOString() });
    if (push) _schedulePush();
  };

  window.scheduleRedial = function (lead, outcome) {
    const cadence = window.dispositionCadence(outcome);
    if (cadence.terminal || cadence.retryAfterMs == null) return null;
    const at = Date.now() + cadence.retryAfterMs;
    const queue = _read();
    const filtered = queue.filter(q => q.leadId !== lead.id);
    filtered.push({ leadId: lead.id, leadName: lead.lead, phone: lead.phone, at, outcome });
    _write(filtered);
    window.dispatchEvent(new CustomEvent("redial:queued", { detail: { lead, at, outcome }}));
    return at;
  };

  window.dueRedials = function () {
    const now = Date.now();
    return _read().filter(q => q.at <= now);
  };

  window.clearRedial = function (leadId) {
    _write(_read().filter(q => q.leadId !== leadId));
  };

  /** Hydrate the redial queue from user_prefs on sign-in. Server wins iff
   *  its updated_at is strictly newer than local. Fires redial:hydrated
   *  so any open UI re-renders. Safe to call multiple times. */
  window.hydrateRedialQueue = async function () {
    const sb  = window.getSupabase && window.getSupabase();
    const rid = _repId();
    if (!sb || !rid) return _read();
    try {
      const { data, error } = await sb.from("user_prefs")
        .select("value, updated_at")
        .eq("rep_id", rid)
        .eq("key", PREF_KEY)
        .maybeSingle();
      if (error) {
        if (!/relation .* does not exist/i.test(error.message || "")) {
          console.warn("[redial.hydrate]", error.message || error);
        }
        return _read();
      }
      if (!data) {
        if (_read().length > 0) _schedulePush();
        return _read();
      }
      const localMeta = _readMeta();
      const serverNewer = !localMeta.updated_at
        || new Date(data.updated_at) > new Date(localMeta.updated_at);
      if (serverNewer) {
        const serverList = Array.isArray(data.value) ? data.value : [];
        const prevJSON = JSON.stringify(_read());
        const nextJSON = JSON.stringify(serverList);
        if (prevJSON !== nextJSON) {
          _write(serverList, { push: false });
          _writeMeta({ updated_at: data.updated_at });
          window.dispatchEvent(new CustomEvent("redial:hydrated", { detail: { count: serverList.length } }));
        } else {
          _writeMeta({ updated_at: data.updated_at });
        }
        return serverList;
      }
      _schedulePush();
      return _read();
    } catch (e) { console.warn("[redial.hydrate]", e?.message || e); return _read(); }
  };

  // Run hydrate when me() is resolved; fire-and-forget.
  if (typeof window !== "undefined") {
    const _tryHydrate = () => {
      if (window.me && window.me() && typeof window.hydrateRedialQueue === "function") {
        window.hydrateRedialQueue().catch(() => {});
      }
    };
    if (window.me && window.me()) _tryHydrate();
    window.addEventListener("me:loaded", _tryHydrate);
  }

  // Background: every 60s, fire a "redial:due" event for any pending entries
  // so the autodialer can pull them in. Cheap; no network.
  setInterval(() => {
    const due = window.dueRedials();
    if (due.length) window.dispatchEvent(new CustomEvent("redial:due", { detail: { due }}));
  }, 60_000);
})();
