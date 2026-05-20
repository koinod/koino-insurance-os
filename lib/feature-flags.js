/* lib/feature-flags.js — minimal flag consumer for runtime gates.
 *
 * Pairs with migration 0020. Reads (in priority order):
 *   1. Per-agency override   — agencies.config.feature_flags.<name>
 *   2. Global default        — org_settings.feature_flag.<name>.value
 *   3. Caller-provided default
 *
 * Loaded BEFORE every page-*.jsx (see index.html) so pages can call
 * `window.featureFlag("predictive_cards", false)` synchronously after
 * boot. First call kicks off an async hydrate; subsequent calls hit the
 * in-memory cache.
 *
 * Hot reload: `feature-flags:changed` event fires after a successful
 * `refresh()` so components can `useEffect(() => ..., [])` listen and
 * re-render without a page reload.
 */

(function () {
  const STORAGE_KEY = "repflow.feature_flags.v1";

  let _global  = {};   // name -> value (from org_settings)
  let _agency  = {};   // name -> value (from agencies.config.feature_flags)
  let _hydrated = false;
  let _hydrating = null;

  function loadCached() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        _global = parsed.global || {};
        _agency = parsed.agency || {};
      }
    } catch {}
  }

  function saveCached() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ global: _global, agency: _agency })); } catch {}
  }

  async function hydrate() {
    if (_hydrating) return _hydrating;
    _hydrating = (async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) { _hydrated = true; _hydrating = null; return; }
      try {
        // Global flags — anyone can read org_settings.
        const { data: rows } = await sb
          .from("org_settings")
          .select("key, value")
          .like("key", "feature_flag.%");
        const next = {};
        (rows || []).forEach(r => {
          next[r.key.replace(/^feature_flag\./, "")] = r.value;
        });
        _global = next;
      } catch {}
      // Per-agency overrides — pull from agencies.config of the active agency.
      try {
        const me = window.me && window.me();
        const activeAgency = (window.getActiveAgencyId && window.getActiveAgencyId()) || (me && me.agency_id);
        if (activeAgency) {
          const { data } = await sb.from("agencies").select("config").eq("id", activeAgency).maybeSingle();
          const ff = (data && data.config && data.config.feature_flags) || {};
          _agency = ff;
        } else {
          _agency = {};
        }
      } catch {}
      saveCached();
      _hydrated = true;
      _hydrating = null;
      try { window.dispatchEvent(new CustomEvent("feature-flags:changed", { detail: { global: _global, agency: _agency } })); } catch {}
    })();
    return _hydrating;
  }

  function value(name, fallback) {
    if (Object.prototype.hasOwnProperty.call(_agency, name)) return _agency[name];
    if (Object.prototype.hasOwnProperty.call(_global, name)) return _global[name];
    return fallback;
  }

  // Public API. Synchronous after first hydrate; returns the fallback (or
  // cached value from a previous page load) before hydrate finishes.
  window.featureFlag = function (name, fallback) {
    if (!_hydrated && !_hydrating) hydrate();
    return value(name, fallback);
  };

  // Boolean coercion convenience — common case ("is X on?").
  window.featureFlagOn = function (name, fallback) {
    const v = window.featureFlag(name, fallback);
    if (typeof v === "boolean") return v;
    if (typeof v === "string")  return v === "true" || v === "1" || v === "on";
    if (typeof v === "number")  return v !== 0;
    return !!v;
  };

  window.refreshFeatureFlags = hydrate;
  window.__featureFlagState = () => ({ global: { ..._global }, agency: { ..._agency }, hydrated: _hydrated });

  // Boot: hydrate cache from localStorage immediately (sync), then kick off
  // a network hydrate. me:loaded re-triggers so per-agency overrides apply
  // after sign-in / act-as.
  loadCached();
  if (typeof window !== "undefined") {
    setTimeout(hydrate, 0);
    window.addEventListener("me:loaded", () => hydrate(), { passive: true });
    window.addEventListener("admin:impersonate", () => hydrate(), { passive: true });
  }
})();
