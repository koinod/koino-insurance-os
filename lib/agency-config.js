/* lib/agency-config.js — single source of truth for agency-level config
 * (tier thresholds, daily targets, dial caps) that used to be hardcoded in
 * multiple page-*.jsx files.
 *
 * Read pattern:
 *   const cfg = window.AgencyConfig.get();
 *   const target = cfg.tier_targets[rep.tier];
 *
 * Write pattern (owner-only): owners set values via an Owner Settings UI,
 * which calls window.AgencyConfig.update({...}). The update is persisted to
 * agencies.config jsonb on Supabase, and broadcast to listeners via
 * "agency-config:changed".
 *
 * This module deliberately does NOT depend on shared.jsx or data.jsx so it
 * can be loaded early (before any page-*.jsx) and read synchronously by
 * pages that previously redeclared their own constants.
 */

(function () {
  const STORAGE_KEY = "repflow.agency.config.v1";

  // Defaults — the values that used to be hardcoded across page-manager.jsx,
  // page-performance.jsx, page-floor.jsx. Real agencies override per-agency.
  const DEFAULTS = {
    tier_targets: {
      bronze: 12000, silver: 20000, gold: 35000, platinum: 50000, diamond: 80000,
    },
    tier_thresholds: {
      // mtd $ and persistency % required to enter each tier
      bronze:   { mtd: 0,     persistency: 0  },
      silver:   { mtd: 15000, persistency: 70 },
      gold:     { mtd: 25000, persistency: 80 },
      platinum: { mtd: 35000, persistency: 85 },
      diamond:  { mtd: 50000, persistency: 90 },
    },
    daily_target_default: 1800,    // $/day per rep when tier-target/22 unavailable
    autodial_rate_per_hr: 87,      // dial cap target for autodialer
    // Industry defaults; owner can recalibrate or wait for the system to learn
    // them once enough policies are issued (PageForecast uses live cohort math
    // when available, fallback to these).
    stage_close_probabilities: {
      "New": 0.04, "Contacted": 0.12, "Quoted": 0.32, "App In": 0.78, "Issued": 1.0,
    },
    fallback_ap_by_product: {
      "Plan G": 1800, "Plan N": 1500, "Final Expense": 1300, "Annuity": 4000,
    },
  };

  function loadCached() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return mergeWithDefaults(parsed);
      }
    } catch {}
    return { ...DEFAULTS };
  }

  function mergeWithDefaults(partial) {
    return {
      tier_targets: { ...DEFAULTS.tier_targets, ...(partial.tier_targets || {}) },
      tier_thresholds: { ...DEFAULTS.tier_thresholds, ...(partial.tier_thresholds || {}) },
      daily_target_default: partial.daily_target_default || DEFAULTS.daily_target_default,
      autodial_rate_per_hr: partial.autodial_rate_per_hr || DEFAULTS.autodial_rate_per_hr,
      stage_close_probabilities: { ...DEFAULTS.stage_close_probabilities, ...(partial.stage_close_probabilities || {}) },
      fallback_ap_by_product: { ...DEFAULTS.fallback_ap_by_product, ...(partial.fallback_ap_by_product || {}) },
    };
  }

  function saveCached(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
  }

  let _state = loadCached();

  // Async: pull the agency.config jsonb from Supabase on first call. Cached
  // in localStorage so subsequent reads are sync.
  async function refresh() {
    const sb = window.getSupabase && window.getSupabase();
    const me = window.me && window.me();
    if (!sb || !me || !me.agency_id) return _state;
    try {
      const { data, error } = await sb
        .from("agencies")
        .select("config")
        .eq("id", me.agency_id)
        .maybeSingle();
      if (error || !data) return _state;
      _state = mergeWithDefaults(data.config || {});
      saveCached(_state);
      window.dispatchEvent(new CustomEvent("agency-config:changed", { detail: _state }));
      return _state;
    } catch {
      return _state;
    }
  }

  // Owner-only: persist a partial update to agencies.config. RLS on the
  // agencies table will reject non-owner writes server-side.
  async function update(partial) {
    _state = mergeWithDefaults({ ..._state, ...partial });
    saveCached(_state);
    window.dispatchEvent(new CustomEvent("agency-config:changed", { detail: _state }));
    const sb = window.getSupabase && window.getSupabase();
    const me = window.me && window.me();
    if (!sb || !me || !me.agency_id) return _state;
    try {
      await sb.from("agencies").update({ config: _state }).eq("id", me.agency_id);
    } catch {}
    return _state;
  }

  window.AgencyConfig = {
    get:     () => _state,
    refresh,
    update,
    DEFAULTS,
  };

  // Bootstrap: kick off a refresh once me() is available.
  if (typeof window !== "undefined") {
    if (window.me && window.me()) {
      refresh();
    } else {
      window.addEventListener("me:loaded", refresh, { once: true });
    }
  }
})();
