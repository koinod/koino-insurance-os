# Error-swallowing sweep — 2026-05-15

Goal: stop silent failures hiding broken mutators and dead hydrate paths. Map
every empty `catch (_e) {}` to one of three intents, replace with the matching
handler, leave clipboard + hot-loop catches alone (those are deliberate).

## Strategy

- **Mutator** (user-visible action — save / delete / dial / route / assign):
  `catch (e) { window.toast?.(\`<action> failed: ${e.message || e}\`, "error"); console.error("[<scope>]", e); }`.
  Surfaces failure to the user *and* leaves a console trail for triage.
- **Hydrate / passive read** (effect fetch, polling, audit log, storage probe,
  feature-probe): `catch (e) { console.warn("[<scope>]", e); }`. No toast spam,
  but the failure is no longer invisible.
- **Hot loop** (per-iteration probe inside `.forEach` / `for…of` / 5s chunk
  loop): leave alone. Toasting per-iteration is worse than the silence.
- **Clipboard**: leave alone. `navigator.clipboard.writeText` legitimately
  rejects when the browser blocks paste — that's not an error worth surfacing.

## Before / after counts

Empty catches in the repo before / after this sweep:

| File | Before | After | Touched | Notes |
|---|---|---|---|---|
| page-extras.jsx | 19 | 2 | 17 | 2 remaining = clipboard copies (lines 267, 355) |
| data.jsx | 10 | 0 | 10 | all passive storage / dispatch / fire-and-forget mutate paths |
| page-resources.jsx | 9 | 0 | 9 | localStorage helpers + vault mutators |
| page-transcriber.jsx | 8 | 3 | 5 | 3 remaining = per-iteration mime probes + per-stream cleanup loop |
| page-first-run.jsx | 7 | 0 | 7 | all passive `sb.from()` / `sb.rpc()` hydrate reads |
| page-queue.jsx | 4 | 1 | 3 | 1 remaining = clipboard (script copy) |
| page-pipeline.jsx | 4 | 0 | 4 | all mutators (contact save, coaching, sequence enroll) |
| page-today.jsx | 3 | 0 | 3 | onboarding verify, NIGO update, DM-manager thread ensure |
| page-recruiting.jsx | 3 | 1 | 2 | 1 remaining = clipboard (invite link) |
| page-owner.jsx | 3 | 0 | 3 | queue assignment (batch + DnD), coaching session resolve |
| page-floor-actions.jsx | 3 | 1 | 2 | 1 remaining = clipboard (Calendly link) |
| shared.jsx | 2 | 0 | 2 | sessionStorage clear + localStorage write |
| page-messages.jsx | 2 | 0 | 2 | DM send + threadEnsure |
| api/twilio-recording.js | 2 | 0 | 2 | server-side PostgREST writes |
| page-tenant.jsx | 1 | 0 | 1 | Twilio disconnect |
| page-quote.jsx | 1 | 0 | 1 | rate-engine polling |
| page-performance.jsx | 1 | 0 | 1 | tier override mutator |
| page-ops-depth.jsx | 1 | 0 | 1 | NIGO status mutator |
| page-onboarding.jsx | 1 | 0 | 1 | connector config save |
| page-crm.jsx | 1 | 0 | 1 | DnD dataTransfer probe |
| page-billing.jsx | 1 | 0 | 1 | audit log fire-and-forget |
| page-autodialer.jsx | 1 | 0 | 1 | pipeline stage update |
| lib/rate-engine.js | 1 | 0 | 1 | CDN guides load (try-wrapped fetch) |
| lib/call-recorder.js | 1 | 1 | 0 | hot loop — left alone |
| app.jsx | 1 | 0 | 1 | role-sync from server |
| api/cron/manager-inactivity.js | 1 | 0 | 1 | passive manager-name lookup inside cron loop |
| **Total** | **91** | **9** | **82** | 6 clipboard + 3 hot-loop survivors |

## Examples

### Mutator → toast + console.error (page-pipeline.jsx)

Before:
```js
try { await AppData.mutate.pipelineContact(lead.id, { phone: next });
      window.toast && window.toast(next ? "Phone saved" : "Phone cleared", "success"); }
catch (_e) {}
```
After:
```js
try { await AppData.mutate.pipelineContact(lead.id, { phone: next });
      window.toast && window.toast(next ? "Phone saved" : "Phone cleared", "success"); }
catch (e) { window.toast?.(`Phone save failed: ${e?.message || e}`, "error");
            console.error("[pipeline.contactPhone]", e); }
```

### Hydrate → console.warn (page-first-run.jsx)

Before:
```js
try {
  const r = await sb.from("carriers").select("id, name, category").order("name");
  if (Array.isArray(r.data)) setCarriers(r.data);
} catch (_e) {}
```
After:
```js
try {
  const r = await sb.from("carriers").select("id, name, category").order("name");
  if (Array.isArray(r.data)) setCarriers(r.data);
} catch (e) { console.warn("[firstRun.carriersLoad]", e); }
```

### Hot loop → left alone (page-transcriber.jsx)

```js
for (const m of cands) {
  try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; } catch (_e) {}
}
```
Reasoning: this is a mime-type capability probe, runs once per candidate at
recorder start. Toasting "MIME probe failed" three times is worse than silence.

### Clipboard → left alone (page-recruiting.jsx)

```js
try { await navigator.clipboard.writeText(link); } catch (_e) {}
```
Reasoning: the browser blocks `writeText` from non-user-gesture contexts and
inside some iframes. The follow-up `window.toast(...)` already gives the user
the link verbatim if copy fails. Per instructions, clipboard catches are
deliberately silent.

### Storage probe → console.warn (page-resources.jsx)

Before:
```js
try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (_e) {}
```
After:
```js
try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); }
catch (e) { console.warn("[resources.useLocalArray.read]", key, e); }
```
Reasoning: localStorage can throw in private-browsing mode or when quota is
exhausted. Caller has a `seed` fallback, so don't toast — but don't pretend
nothing happened either.

## Survivors (9 deliberate)

| Path | Line | Reason |
|---|---|---|
| page-extras.jsx | 267 | clipboard (script copy) |
| page-extras.jsx | 355 | clipboard (script copy) |
| page-queue.jsx | 1111 | clipboard (script copy) |
| page-recruiting.jsx | 294 | clipboard (invite link) |
| page-floor-actions.jsx | 239 | clipboard (Calendly link) |
| page-transcriber.jsx | 52 | hot loop — per-stream MediaStreamSource create |
| page-transcriber.jsx | 65 | hot loop — per-mime `isTypeSupported` probe |
| page-transcriber.jsx | 144 | hot loop — per-stream track stop on cleanup |
| lib/call-recorder.js | 95 | hot loop — per-mime `isTypeSupported` probe |

## Scope notes

- Did **not** touch existing non-empty catches that already log/toast.
- Did **not** introduce a new toast helper or error-reporting library — kept
  the pattern dependency-free with `window.toast?.(...)` + `console.error`.
- Did **not** convert hot-loop catches into "collect + toast once at the end"
  variants — the loops in question are micro-probes (mime support, track
  cleanup) where any failure is benign, not bulk mutator batches.
- API routes (`api/twilio-recording.js`, `api/cron/manager-inactivity.js`)
  use `console.warn` only — no `window.toast` available server-side.
