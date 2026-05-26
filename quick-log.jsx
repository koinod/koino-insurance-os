/* quick-log.jsx
 * QuickLogDeal     — foolproof deal entry for reps (≤ 5 fields, mobile-first)
 * QuickLogExpense  — foolproof expense entry (6 chip categories)
 * RepflowFAB       — persistent FAB rendered app-wide; 2 clicks to log anything
 *
 * Exposes: window.QuickLogDeal, window.QuickLogExpense, window.RepflowFAB
 */
(function () {
  const { useState, useEffect, useRef } = React;

  const fmt$ = Shared.fmtMoneyCents;

  /* ── Product chips ──────────────────────────────────────────────────────── */
  const PRODUCTS = [
    "Final Expense", "IUL", "Term", "MAPD", "PDP", "Med Supp", "Annuity", "Other",
  ];

  /* ── QuickLogDeal ─────────────────────────────────────────────────────── */
  // 2026-05-24: retired. The topbar "Deal" button now opens DealWriteModal
  // (from page-deal-write.jsx) so there is ONE canonical deal-entry surface.
  // The previous stripped 5-field form caused two real bugs:
  //   - comp_pct defaulted to "100" (Quick Log) vs product.compPct (Deal
  //     Write), so deals logged from the topbar were ~2× overstated on
  //     expected commission.
  //   - no lead picker / carrier-appointment validation / state-license
  //     gate, so logged policies bypassed the same data-quality checks
  //     that Deal Write enforced.
  // The Override comp default + product/carrier validation now apply
  // everywhere, regardless of entry surface.
  function QuickLogDeal({ onClose }) {
    const DealModal = window.DealWriteModal;
    if (DealModal) return <DealModal onClose={onClose}/>;
    // Defensive fallback if page-deal-write.js failed to load — render the
    // legacy stripped form so the operator isn't blocked. This branch
    // mirrors the old surface (5 fields, 100% comp default warning) so the
    // operator can still log a deal in the worst case.
    return <LegacyQuickLogDeal onClose={onClose}/>;
  }

  // Legacy fallback only. Do not extend this; extend DealWriteForm instead.
  function LegacyQuickLogDeal({ onClose }) {
    const me = (window.me && window.me()) || null;
    const agencyId = me?.agency_id || null;
    const repId    = me?.rep_id    || null;

    const [form, setForm] = useState({
      client_name: "",
      carrier:     "",
      product:     "",
      ap:          "",
      comp_pct:    "100",
    });
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const projComm = form.ap && form.comp_pct
      ? Math.round(Number(form.ap) * Number(form.comp_pct) / 100 * 100)
      : 0;

    const submit = async () => {
      if (!form.product)              { setErr("Select a product first."); return; }
      if (!form.ap || Number(form.ap) <= 0) { setErr("Annual premium is required."); return; }
      if (!agencyId || !repId)        { setErr("You must be signed in with a rep account."); return; }

      setErr(null);
      setBusy(true);
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb) throw new Error("Supabase not connected");

        const ap_cents                  = Math.round(Number(form.ap) * 100);
        const comp_rate_pct             = Number(form.comp_pct) || 100;
        const expected_commission_cents = Math.round(ap_cents * comp_rate_pct / 100);
        const today                     = new Date().toISOString().slice(0, 10);

        const { error } = await sb.from("policies").insert({
          agency_id:                  agencyId,
          owner_rep_id:               repId,
          carrier_id:                 form.carrier  || null,
          product_text:               form.product,
          ap_cents,
          comp_rate_pct,
          expected_commission_cents,
          status:                     "submitted",
          submission_date:            today,
          metadata: {
            client_name: form.client_name || null,
            logged_via:  "quick_log",
          },
        });
        if (error) throw error;

        window.toast && window.toast(
          `✓ Logged. ${fmt$(expected_commission_cents)} projected commission.`,
          "success"
        );
        window.dispatchEvent(new CustomEvent("pnl:refresh"));
        onClose();
      } catch (e) {
        setErr(e.message || "Save failed — try again or check your connection.");
      } finally {
        setBusy(false);
      }
    };

    const onKey = (e) => { if (e.key === "Enter" && !busy) { e.preventDefault(); submit(); } };

    return (
      <Shared.Modal title="Log a deal" width={440} onClose={onClose} actions={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ minWidth: 110 }}>
            {busy ? "Logging…" : "Log deal"}
          </button>
        </>
      }>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Inline error */}
          {err && (
            <div style={{
              background:   "color-mix(in oklch, var(--state-danger) 10%, transparent)",
              border:       "1px solid color-mix(in oklch, var(--state-danger) 30%, transparent)",
              borderRadius: 6, padding: "9px 13px", fontSize: 12.5,
              color:        "var(--state-danger)",
            }}>
              {err}
            </div>
          )}

          {/* 1. Client name */}
          <Shared.Field label="Client name">
            <input className="text-input" style={{ fontSize: "1.05rem" }}
              autoFocus
              value={form.client_name}
              onChange={(e) => set("client_name", e.target.value)}
              placeholder="Jane Doe"
              onKeyDown={onKey}
            />
          </Shared.Field>

          {/* 2. Carrier */}
          <Shared.Field label="Carrier">
            <input className="text-input" style={{ fontSize: "1.05rem" }}
              value={form.carrier}
              onChange={(e) => set("carrier", e.target.value)}
              placeholder="e.g. Mutual of Omaha, Cigna…"
              onKeyDown={onKey}
            />
          </Shared.Field>

          {/* 3. Product chips */}
          <div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>Product *</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PRODUCTS.map((p) => (
                <button key={p} type="button"
                  onClick={() => set("product", p)}
                  style={{
                    padding:      "7px 13px",
                    borderRadius: 6,
                    fontSize:     13,
                    fontWeight:   500,
                    border:       "1px solid",
                    cursor:       "pointer",
                    transition:   "all 110ms",
                    borderColor:  form.product === p ? "var(--accent-money)" : "var(--border-subtle)",
                    background:   form.product === p
                      ? "color-mix(in oklch, var(--accent-money) 14%, transparent)"
                      : "var(--bg-raised)",
                    color: form.product === p ? "var(--accent-money)" : "var(--text-secondary)",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Annual premium — big input */}
          <Shared.Field label="Annual premium *" hint="Yearly premium, not monthly">
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                fontSize: "1.4rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono, monospace)",
                pointerEvents: "none",
              }}>$</span>
              <input className="text-input" type="number" min="0"
                style={{
                  fontSize:   "2rem",
                  fontFamily: "var(--font-mono, monospace)",
                  fontWeight: 700,
                  paddingLeft: 30,
                }}
                value={form.ap}
                onChange={(e) => set("ap", e.target.value)}
                placeholder="0"
                onKeyDown={onKey}
              />
            </div>
          </Shared.Field>

          {/* 5. Comp % */}
          <Shared.Field label="Comp %" hint="Leave at 100 if you don't know — your manager can adjust.">
            <input className="text-input" type="number" min="0" max="300"
              style={{ fontSize: "1.05rem" }}
              value={form.comp_pct}
              onChange={(e) => set("comp_pct", e.target.value)}
              onKeyDown={onKey}
            />
          </Shared.Field>

          {/* Projection preview */}
          {projComm > 0 && (
            <div style={{
              background:   "color-mix(in oklch, var(--accent-money) 8%, transparent)",
              border:       "1px solid color-mix(in oklch, var(--accent-money) 25%, transparent)",
              borderRadius: 7,
              padding:      "11px 15px",
              display:      "flex",
              justifyContent: "space-between",
              alignItems:   "center",
            }}>
              <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Projected commission</span>
              <span className="tabular" style={{
                fontSize:   "1.4rem",
                fontWeight: 700,
                color:      "var(--accent-money)",
                fontFamily: "var(--font-mono, monospace)",
              }}>
                {fmt$(projComm)}
              </span>
            </div>
          )}
        </div>
      </Shared.Modal>
    );
  }

  /* ── QuickLogExpense ──────────────────────────────────────────────────── */
  const EXP_CATS = [
    { label: "Leads",       kind: "lead_spend", icon: "Users",    subcat: null },
    { label: "Phone / SMS", kind: "saas",       icon: "Phone",    subcat: "phone" },
    { label: "Mileage",     kind: "travel",     icon: "ArrowRight", subcat: "mileage" },
    { label: "Software",    kind: "saas",       icon: "Server",   subcat: null },
    { label: "Training",    kind: "training",   icon: "Book",     subcat: null },
    { label: "Other",       kind: "other",      icon: "Dots",     subcat: null },
  ];

  function QuickLogExpense({ onClose }) {
    const me = (window.me && window.me()) || null;
    const agencyId = me?.agency_id || null;
    const repId    = me?.rep_id    || null;

    const today = new Date().toISOString().slice(0, 10);
    const [form, setForm] = useState({ amount: "", cat: null, date: today, note: "", leadSourceId: "" });
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);

    // Lead-source catalog — loaded once when the user picks the "Leads"
    // category. Without a lead_source_id on the insert, lead_spend rows
    // land in agency_expenses but never roll into v_lead_source_spend, so
    // they're invisible on the Attribution page. This picker closes that
    // gap without forcing the rep to context-switch to Settings.
    const [sources, setSources]   = useState([]);
    const [srcLoading, setSrcLoading] = useState(false);
    const [addingNew, setAddingNew]   = useState(false);
    const [newName, setNewName]   = useState("");
    const [newVendor, setNewVendor] = useState("");
    // Webhook provisioning — when ON, "Add vendor" also generates an
    // inbound_slug + hmac_secret so the rep can paste a webhook URL into
    // their lead-vendor's portal and start receiving leads immediately.
    // Default ON because the typical reason a rep adds a vendor is they're
    // about to start paying for leads from it.
    const [provisionWebhook, setProvisionWebhook] = useState(true);
    const [justCreated, setJustCreated] = useState(null); // { name, url, secret }

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    // Hydrate sources lazily — only when the rep selects Leads.
    React.useEffect(() => {
      if (form.cat !== "Leads" || !agencyId || sources.length > 0 || srcLoading) return;
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      setSrcLoading(true);
      sb.from("agency_lead_sources")
        .select("id,name,vendor")
        .eq("agency_id", agencyId)
        .eq("active", true)
        .order("name")
        .then(({ data }) => {
          setSources(data || []);
          setSrcLoading(false);
        });
    }, [form.cat, agencyId]);

    // Browser-safe random hex (matches the page-leaddrip provisioning
    // pattern so webhook secrets look identical across surfaces).
    const randHex = (len) => {
      const a = new Uint8Array(len);
      crypto.getRandomValues(a);
      return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
    };
    const slugify = (s) => String(s || "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

    const createNewSource = async () => {
      if (!newName.trim()) { setErr("Name the vendor."); return; }
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !agencyId) { setErr("Supabase not connected."); return; }

      const row = {
        agency_id: agencyId,
        name: newName.trim(),
        vendor: newVendor.trim() || null,
        active: true,
      };
      // One-shot webhook provisioning so the rep doesn't have to come
      // back later to wire intake. Keeps a single agency_lead_sources
      // row — slug + secret + kind all stamped at create time.
      if (provisionWebhook) {
        row.inbound_slug = `${slugify(newName)}-${randHex(3)}`;
        row.inbound_hmac_secret = randHex(32);
        row.kind = "webhook";
      }

      const { data, error } = await sb.from("agency_lead_sources")
        .insert(row)
        .select("id,name,vendor,inbound_slug,inbound_hmac_secret,kind")
        .single();
      if (error) { setErr(`Couldn't add vendor: ${error.message}`); return; }

      setSources(s => [...s, data].sort((a, b) => a.name.localeCompare(b.name)));
      set("leadSourceId", data.id);
      setAddingNew(false);
      setNewName(""); setNewVendor("");

      if (provisionWebhook && data.inbound_slug) {
        const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
        setJustCreated({
          name: data.name,
          url: `${baseUrl}/api/leads/inbound-source?source=${data.inbound_slug}`,
          secret: data.inbound_hmac_secret,
        });
      } else {
        window.toast && window.toast(`Added vendor: ${data.name}`, "success");
      }
    };

    const copyToClipboard = (text, label) => {
      try {
        navigator.clipboard.writeText(text);
        window.toast && window.toast(`Copied ${label}`, "success");
      } catch {
        window.toast && window.toast(`Couldn't copy ${label}`, "error");
      }
    };

    const submit = async () => {
      if (!form.amount || Number(form.amount) <= 0) { setErr("Enter an amount."); return; }
      if (!form.cat)                                { setErr("Select a category."); return; }
      if (!agencyId)                                { setErr("You must be signed in to an agency."); return; }

      setErr(null);
      setBusy(true);
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb) throw new Error("Supabase not connected");

        const cat          = EXP_CATS.find((c) => c.label === form.cat);
        const amount_cents = Math.round(Number(form.amount) * 100);

        const { error } = await sb.from("agency_expenses").insert({
          agency_id:      agencyId,
          paid_by_rep_id: repId    || null,
          amount_cents,
          kind:           cat.kind,
          paid_by:        "rep_oop",
          paid_at:        form.date || today,
          notes:          form.note || null,
          // Only stamp lead_source_id on lead_spend rows. Pre-checked: the
          // view v_lead_source_spend filters to kind='lead_spend', so a
          // non-leads expense with a source_id would be ignored anyway —
          // but keeping it clean prevents accidental cross-attribution.
          lead_source_id: (cat.kind === "lead_spend" && form.leadSourceId) ? form.leadSourceId : null,
        });
        if (error) throw error;

        const attribMsg = (cat.kind === "lead_spend" && !form.leadSourceId)
          ? " (untagged — won't show on Attribution)"
          : "";
        window.toast && window.toast(
          `✓ Logged $${Number(form.amount).toLocaleString()} for ${form.cat}.${attribMsg}`,
          "success"
        );
        window.dispatchEvent(new CustomEvent("pnl:refresh"));
        onClose();
      } catch (e) {
        setErr(e.message || "Save failed — try again or check your connection.");
      } finally {
        setBusy(false);
      }
    };

    const onKey = (e) => { if (e.key === "Enter" && !busy) { e.preventDefault(); submit(); } };

    return (
      <Shared.Modal title="Log an expense" width={420} onClose={onClose} actions={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ minWidth: 130 }}>
            {busy ? "Logging…" : "Log expense"}
          </button>
        </>
      }>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Inline error */}
          {err && (
            <div style={{
              background:   "color-mix(in oklch, var(--state-danger) 10%, transparent)",
              border:       "1px solid color-mix(in oklch, var(--state-danger) 30%, transparent)",
              borderRadius: 6, padding: "9px 13px", fontSize: 12.5,
              color:        "var(--state-danger)",
            }}>
              {err}
              <details style={{ marginTop: 4 }}>
                <summary style={{ fontSize: 11, cursor: "pointer", color: "var(--text-tertiary)" }}>Debug</summary>
                <pre style={{ fontSize: 10, marginTop: 4, whiteSpace: "pre-wrap" }}>{err}</pre>
              </details>
            </div>
          )}

          {/* 1. Amount — big */}
          <Shared.Field label="Amount *">
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                fontSize: "1.5rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono, monospace)",
                pointerEvents: "none",
              }}>$</span>
              <input className="text-input" type="number" min="0" autoFocus
                style={{
                  fontSize:    "2rem",
                  fontFamily:  "var(--font-mono, monospace)",
                  fontWeight:  700,
                  paddingLeft: 32,
                }}
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="0"
                onKeyDown={onKey}
              />
            </div>
          </Shared.Field>

          {/* 2. Category chips — 3-column grid */}
          <div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>Category *</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {EXP_CATS.map((c) => {
                const Ico    = Icons[c.icon] || Icons.Circle;
                const active = form.cat === c.label;
                return (
                  <button key={c.label} type="button" onClick={() => set("cat", c.label)}
                    style={{
                      display:        "flex",
                      flexDirection:  "column",
                      alignItems:     "center",
                      gap:            5,
                      padding:        "10px 6px",
                      borderRadius:   8,
                      border:         "1px solid",
                      cursor:         "pointer",
                      fontSize:       12,
                      fontWeight:     500,
                      transition:     "all 110ms",
                      borderColor:    active ? "var(--accent-money)" : "var(--border-subtle)",
                      background:     active
                        ? "color-mix(in oklch, var(--accent-money) 12%, transparent)"
                        : "var(--bg-raised)",
                      color: active ? "var(--accent-money)" : "var(--text-secondary)",
                    }}
                  >
                    <Ico size={17}/>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2b. Lead source — only when category is "Leads". Without this,
              the row inserts with lead_source_id=NULL and never appears on
              the Attribution page's per-vendor ROAS table. */}
          {form.cat === "Leads" && (
            <Shared.Field label={
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>Lead vendor</span>
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", fontWeight: 400 }}>
                  · attributes spend on the Lead Vendors page
                </span>
              </span>
            }>
              {!addingNew ? (
                <>
                  <select
                    className="text-input"
                    style={{ fontSize: "1rem" }}
                    value={form.leadSourceId}
                    onChange={(e) => {
                      if (e.target.value === "__new__") { setAddingNew(true); return; }
                      set("leadSourceId", e.target.value);
                    }}
                    disabled={srcLoading}
                  >
                    <option value="">
                      {srcLoading ? "Loading vendors…"
                        : sources.length === 0 ? "— No vendors yet · add one below —"
                        : "— Untagged (won't show on Attribution) —"}
                    </option>
                    {sources.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.vendor ? ` · ${s.vendor}` : ""}
                      </option>
                    ))}
                    <option value="__new__">＋ Add new vendor…</option>
                  </select>
                  {!form.leadSourceId && sources.length > 0 && (
                    <div style={{ fontSize: 11, color: "var(--state-warning)", marginTop: 4 }}>
                      Pick a vendor so this spend rolls into Lead Vendors → Attribution.
                    </div>
                  )}
                </>
              ) : justCreated ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "color-mix(in oklch, var(--accent-money) 8%, transparent)", borderRadius: 6, border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent-money)" }}>
                    ✓ {justCreated.name} added — webhook ready
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                    Paste these into your vendor's portal so leads land in your queue. The signature header is{" "}
                    <code className="mono" style={{ fontSize: 10.5 }}>x-webhook-signature: sha256=&lt;hex&gt;</code>.
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Webhook URL</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        className="text-input mono"
                        style={{ fontSize: 11, flex: 1, padding: "5px 8px" }}
                        value={justCreated.url}
                        readOnly
                        onClick={(e) => e.target.select()}
                      />
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => copyToClipboard(justCreated.url, "URL")}>
                        Copy
                      </button>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>HMAC secret</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="password"
                        className="text-input mono"
                        style={{ fontSize: 11, flex: 1, padding: "5px 8px" }}
                        value={justCreated.secret}
                        readOnly
                        onClick={(e) => e.target.select()}
                      />
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => copyToClipboard(justCreated.secret, "secret")}>
                        Copy
                      </button>
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 11, alignSelf: "flex-start" }} onClick={() => setJustCreated(null)}>
                    Done — log the expense
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, background: "var(--bg-raised)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                  <input
                    className="text-input"
                    style={{ fontSize: "0.95rem" }}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Name (e.g. Facebook · T65 v3)"
                    autoFocus
                  />
                  <input
                    className="text-input"
                    style={{ fontSize: "0.95rem" }}
                    value={newVendor}
                    onChange={(e) => setNewVendor(e.target.value)}
                    placeholder="Vendor (optional, e.g. Convoso)"
                  />
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={provisionWebhook}
                      onChange={(e) => setProvisionWebhook(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      Generate inbound-webhook URL + secret
                      <span style={{ color: "var(--text-tertiary)" }}> · so leads from this vendor land in your queue automatically</span>
                    </span>
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} onClick={createNewSource}>
                      Add vendor
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setAddingNew(false); setNewName(""); setNewVendor(""); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Shared.Field>
          )}

          {/* 3. Date */}
          <Shared.Field label="Date">
            <input className="text-input" type="date"
              style={{ fontSize: "1rem" }}
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Shared.Field>

          {/* 4. Note */}
          <Shared.Field label="Note (optional)">
            <input className="text-input"
              style={{ fontSize: "1rem" }}
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="What's this for?"
              onKeyDown={onKey}
            />
          </Shared.Field>
        </div>
      </Shared.Modal>
    );
  }

  /* ── RepflowFAB ──────────────────────────────────────────────────────── */
  // FAB removed — Deal / Expense buttons now live in the topbar (shared.jsx
  // Topbar). This component is kept as a headless modal host so the existing
  // `quicklog:deal` / `quicklog:expense` window events still surface the
  // QuickLogDeal / QuickLogExpense modals (fired by topbar buttons + CmdK).
  function RepflowFAB() {
    const [showDeal, setShowDeal] = useState(false);
    const [showExp,  setShowExp]  = useState(false);

    useEffect(() => {
      const onDeal = () => setShowDeal(true);
      const onExp  = () => setShowExp(true);
      window.addEventListener("quicklog:deal",    onDeal);
      window.addEventListener("quicklog:expense", onExp);
      return () => {
        window.removeEventListener("quicklog:deal",    onDeal);
        window.removeEventListener("quicklog:expense", onExp);
      };
    }, []);

    const me = window.me && window.me();
    if (!me || !me.authenticated) return null;

    return (
      <>
        {showDeal && <QuickLogDeal onClose={() => setShowDeal(false)}/>}
        {showExp  && <QuickLogExpense onClose={() => setShowExp(false)}/>}
      </>
    );
  }

  window.QuickLogDeal    = QuickLogDeal;
  window.QuickLogExpense = QuickLogExpense;
  window.RepflowFAB      = RepflowFAB;
})();
