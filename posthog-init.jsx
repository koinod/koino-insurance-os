/* posthog-init.jsx — PostHog bootstrap for insurance-os.
 *
 * Fetches /api/config for the public project key, loads PostHog SDK,
 * identifies the user when window dispatches `me:loaded`. Dormant if
 * the POSTHOG_KEY env var isn't set on Vercel (no-op, no errors).
 *
 * Tracking:
 *   - capture_pageview: true   → auto-fires on every full page load
 *   - capture_pageleave: true  → auto-fires on tab close
 *   - person_profiles: "identified_only" → no anon profiles (cheaper)
 *
 * Custom events are captured by callers via window.posthog?.capture(...).
 * Identity propagation: when me() resolves, we call posthog.identify(rep_id)
 * with role/agency_id/agency_name props so reports can filter per-tenant.
 *
 * Why fetch a config endpoint instead of inlining the key at build time:
 *   This codebase has no bundler that supports env-var inlining (every JSX
 *   transpiles standalone via esbuild). A /api/config edge function keeps
 *   the key in Vercel env vars only — easy to rotate without rebuild.
 */
(function () {
  if (typeof window === "undefined") return;
  if (window.posthog && window.posthog.__loaded) return;

  // Standard PostHog stub — defers method calls until SDK loads async.
  // Source: posthog.com/docs/libraries/js#snippet
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  // Fetch config + initialize. If POSTHOG_KEY is unset, skip entirely.
  fetch("/api/config", { credentials: "omit" })
    .then((r) => r.ok ? r.json() : null)
    .then((cfg) => {
      if (!cfg || !cfg.posthog_key) {
        // Dormant: no key yet. Replace stub with a no-op so capture() calls don't queue forever.
        window.posthog = { capture: () => {}, identify: () => {}, reset: () => {}, group: () => {}, __loaded: false, __dormant: true };
        return;
      }
      window.posthog.init(cfg.posthog_key, {
        api_host: cfg.posthog_host || "https://us.i.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: true,
        capture_pageleave: true,
        // Skip in development environments so we don't pollute prod analytics.
        loaded: (ph) => {
          if (cfg.env === "development" || /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
            ph.opt_out_capturing();
          }
        },
      });

      // Identify when me() resolves. data.jsx dispatches `me:loaded` after the
      // /api/me call settles.
      const onMe = () => {
        try {
          const me = (window.me && window.me()) || null;
          if (!me || !me.user_id || me.is_demo) return;
          window.posthog.identify(me.user_id, {
            email:        me.handle,
            name:         me.full_name,
            role:         me.role,
            tier:         me.tier,
            agency_id:    me.agency_id,
            agency_name:  me.agency_name,
          });
          if (me.agency_id) {
            window.posthog.group("agency", me.agency_id, { name: me.agency_name });
          }
        } catch (e) { /* swallow */ }
      };
      window.addEventListener("me:loaded", onMe);
      // Also try once on load in case me:loaded already fired.
      if (window.me && window.me()) onMe();
    })
    .catch(() => {
      window.posthog = { capture: () => {}, identify: () => {}, reset: () => {}, group: () => {}, __loaded: false, __dormant: true };
    });
})();
