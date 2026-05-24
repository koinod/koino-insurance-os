/* page-deal-write.jsx — Deal write form + recent-deals list for Floor → Deals tab.
 *
 * Flow: lead → autodialer → call → mark client (stage moves to App In/Issued) →
 *       open Floor > Deals → "Write deal" form pre-fills from selected lead →
 *       submit → INSERT into public.policies → list refreshes + toast.
 *
 * Form fields (per Ian's spec):
 *   - Linked Lead   (autocomplete from pipeline rows, prefer Quoted/AppIn/Issued)
 *   - Carrier        (dropdown from AppData.CARRIERS)
 *   - Product        (dropdown from AppData.PRODUCTS, filtered by carrier)
 *   - AP             ($ input)
 *   - Target Premium ($ input — only shown when product is IUL; helper text matches Ian's wording)
 *   - Comp Rate %    (defaults to product.compPct from AppData.PRODUCTS)
 *   - Expected Commission (auto-calculated, read-only)
 *   - Submission Date (defaults today)
 *   - Initial Draft Date (optional)
 *   - Status         (Submitted | Underwriting | Approved | Issued | Declined | Withdrawn)
 *   - Policy Number  (optional)
 */

(function () {
  const { useState, useEffect, useMemo } = React;

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  const today = () => new Date().toISOString().slice(0, 10);
  const cents = (n) => Math.round((Number(n) || 0) * 100);
  const dollars = (c) => (Number(c) || 0) / 100;
  const fmt$ = Shared.fmtMoneyExact;

  function isIULProduct(p) {
    if (!p) return false;
    const cat = (p.category || "").toLowerCase();
    const name = (p.name || "").toLowerCase();
    return cat.includes("iul") || name.includes("iul") || name.includes("indexed universal");
  }

  function splitName(q) {
    const parts = String(q || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: "", lastName: "" };
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
  }

  const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];

  // --------------------------------------------------------------------------
  // <DealWriteForm/> — the form itself
  // --------------------------------------------------------------------------
  function DealWriteForm({ defaultLeadId, defaultCarrierId, defaultAp, defaultNewLead, prefillSource, onWritten }) {
    const carriers = AppData.CARRIERS || [];
    const products = AppData.PRODUCTS || [];
    const pipeline = AppData.PIPELINE || [];
    // Eligible leads: anything past first contact (don't write deals for raw News)
    const eligibleLeads = useMemo(() =>
      pipeline.filter(l => l.stage !== "Lost").sort((a,b) =>
        (a.lead || "").localeCompare(b.lead || "")
      )
    , [pipeline]);

    const [leadId, setLeadId]           = useState(defaultLeadId || "");
    // New-lead capture: when set, submit() inserts a pipeline row first, then
    // writes the policy against the returned id. Null means "use leadId".
    const [newLead, setNewLead]         = useState(defaultNewLead || null);
    // Typeahead state for the lead combobox. When prefilled from quote, show
    // the captured name so the picker doesn't look empty.
    const [query, setQuery]             = useState(
      defaultNewLead ? `${defaultNewLead.firstName || ""} ${defaultNewLead.lastName || ""}`.trim() : ""
    );
    const [pickerOpen, setPickerOpen]   = useState(false);
    const pickerRef                     = React.useRef(null);
    const [carrierId, setCarrierId]     = useState(defaultCarrierId || "");
    const [productId, setProductId]     = useState("");
    const [ap, setAp]                   = useState(defaultAp ? String(defaultAp) : "");
    const [targetPremium, setTarget]    = useState("");
    const [compRate, setCompRate]       = useState("");
    const [submissionDate, setSubDate]  = useState(today());
    const [draftDate, setDraftDate]     = useState("");
    const [status, setStatus]           = useState("submitted");
    const [policyNumber, setPolNum]     = useState("");
    const [busy, setBusy]               = useState(false);
    const [error, setError]             = useState(null);

    const product = products.find(p => p.id === productId);
    const carrier = carriers.find(c => c.id === carrierId);
    const showTarget = isIULProduct(product);

    const selectedLead = leadId ? pipeline.find(l => String(l.id) === String(leadId)) : null;
    const isCommitted  = !!selectedLead || !!newLead;

    useEffect(() => {
      if (!pickerOpen) return;
      const onDown = (e) => {
        if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
      };
      window.addEventListener("mousedown", onDown);
      return () => window.removeEventListener("mousedown", onDown);
    }, [pickerOpen]);

    const filteredLeads = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return eligibleLeads.slice(0, 8);
      return eligibleLeads.filter(l =>
        (l.lead || "").toLowerCase().includes(q) ||
        (l.state || "").toLowerCase().includes(q) ||
        (l.product || "").toLowerCase().includes(q)
      ).slice(0, 8);
    }, [query, eligibleLeads]);

    const exactExistingMatch = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return false;
      return eligibleLeads.some(l => (l.lead || "").toLowerCase() === q);
    }, [query, eligibleLeads]);

    const pickExisting = (l) => {
      setLeadId(l.id);
      setNewLead(null);
      setQuery(l.lead || "");
      setPickerOpen(false);
      setError(null);
    };

    const pickNewFromQuery = () => {
      const { firstName, lastName } = splitName(query);
      setLeadId("");
      setNewLead({ firstName, lastName, state: "", phone: "", email: "" });
      setPickerOpen(false);
      setError(null);
    };

    const clearLead = () => {
      setLeadId("");
      setNewLead(null);
      setQuery("");
    };

    // Cascade: when carrier changes, narrow product list & clear product
    useEffect(() => {
      if (productId && product && product.carrierId !== carrierId) {
        setProductId("");
      }
    }, [carrierId]);

    // Default comp rate — Override model (decided 2026-05-23):
    //   1. rep.base_comp_pct (manager-set per-rep effective rate, edited at
    //      Pay → Producers → Base %; backfilled by migration 0027).
    //   2. fall back to product.compPct (carrier preset on the selected
    //      product) when the rep has no base set.
    //   3. fall back to 50 if neither is available.
    // The rep is the signed-in producer; we resolve via window.me() at mount.
    // The user can override the default by typing a value before submit.
    useEffect(() => {
      if (compRate) return;
      const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
      const meRep = meIdent?.rep_id ? (AppData.REPS || []).find(r => r.id === meIdent.rep_id) : null;
      const repBase = meRep && meRep.baseCompPct != null ? meRep.baseCompPct : null;
      const productBase = product && product.compPct != null ? product.compPct : null;
      const seed = repBase != null ? repBase : (productBase != null ? productBase : 50);
      setCompRate(String(seed));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productId]);

    // Auto-fill carrier/AP if lead has hints (lead.product matches a product name)
    useEffect(() => {
      if (!leadId) return;
      const lead = pipeline.find(l => String(l.id) === String(leadId));
      if (!lead) return;
      if (!ap && lead.ap) setAp(String(lead.ap));
      if (!productId && lead.product) {
        const guess = products.find(p => lead.product.toLowerCase().includes((p.name || "").toLowerCase()));
        if (guess) {
          setCarrierId(guess.carrierId);
          setProductId(guess.id);
        }
      }
    }, [leadId]);

    const expectedCommission = useMemo(() => {
      const base = showTarget && targetPremium ? Number(targetPremium) : Number(ap);
      const rate = Number(compRate);
      if (!base || !rate) return 0;
      return base * rate / 100;
    }, [ap, targetPremium, compRate, showTarget]);

    const productOptions = products.filter(p => !carrierId || p.carrierId === carrierId);

    async function submit() {
      setError(null);
      // Resolve the signed-in producer instead of REPS[0]=Marcus.
      const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
      const me = (meIdent?.rep_id && AppData.REPS?.find(r => r.id === meIdent.rep_id))
              || (window.isDemoAgency && window.isDemoAgency() ? (AppData.REPS && AppData.REPS[0]) : null);
      if (!leadId && !newLead) return setError("Add a new lead or pick one from your pipeline");
      if (newLead) {
        const fn = newLead.firstName.trim(), ln = newLead.lastName.trim();
        if (!fn && !ln) return setError("Enter the lead's first and last name");
        if (!newLead.state) return setError("Pick the lead's state");
      }
      if (!carrierId)  return setError("Pick a carrier");
      if (!productId)  return setError("Pick a product");
      if (!ap || Number(ap) <= 0) return setError("Enter AP");
      if (!compRate || Number(compRate) <= 0) return setError("Enter a comp rate");

      setBusy(true);
      const sb = window.getSupabase && window.getSupabase();
      // New-lead path: materialize the pipeline row first so the policy can
      // reference a real id. Pre-fill product + AP from this deal so the
      // kanban row matches what the producer just sold.
      let lead = pipeline.find(l => String(l.id) === String(leadId));
      if (!lead && newLead) {
        try {
          const display = [newLead.firstName.trim(), newLead.lastName.trim()].filter(Boolean).join(" ");
          const newRow = {
            id: "tmp-" + Date.now(),
            lead: display,
            age: null,
            state: newLead.state,
            stage: "App In",
            product: product ? product.name : null,
            ap: Number(ap) || 0,
            days: 0,
            last: "Deal written from Floor",
            next: "Track to issue",
            source: "Deal-write",
            owner: me ? me.id : null,
            consent: "verified",
            heat: "hot",
            phone: (newLead.phone || "").trim() || null,
            email: (newLead.email || "").trim() || null,
          };
          await AppData.mutate.pipelineInsert(newRow);
          lead = newRow;
          setLeadId(newRow.id);
          setNewLead(null);
        } catch (e) {
          setBusy(false);
          return setError(`Couldn't save the new lead: ${e?.message || e}`);
        }
      }

      const row = {
        lead_pipeline_id: lead && lead.id && typeof lead.id === "string" ? lead.id : null,
        carrier_id: carrierId,
        product_id: productId,
        product_text: product ? product.name : null,
        ap_cents: cents(ap),
        target_premium_cents: showTarget && targetPremium ? cents(targetPremium) : null,
        comp_rate_pct: Number(compRate),
        // expected_commission_cents auto-populated by DB trigger if omitted
        expected_commission_cents: cents(expectedCommission),
        submission_date: submissionDate || null,
        initial_draft_date: draftDate || null,
        status,
        policy_number: policyNumber || null,
        owner_rep_id: me ? me.id : null,
        state: lead ? lead.state : null,
      };

      try {
        if (sb) {
          const { data, error } = await sb.from("policies").insert(row).select().single();
          if (error) throw error;
          // Analytics: capture for PostHog cohort + funnel analysis.
          // No-op until POSTHOG_KEY env activates.
          try {
            window.posthog && window.posthog.capture && window.posthog.capture("deal_written", {
              policy_id:           data.id,
              ap_dollars:          Math.round(row.ap_cents / 100),
              expected_commission: expectedCommission,
              carrier_id:          carrierId,
              product_id:          productId,
              product_name:        product?.name || null,
              status:              row.status,
              has_lead:            !!lead,
              state:               row.state,
            });
          } catch (_e) { /* analytics never blocks the write */ }
          // If status === 'submitted' and lead.stage isn't past, advance the pipeline row.
          if (lead && (lead.stage === "New" || lead.stage === "Contacted" || lead.stage === "Quoted") && typeof lead.id === "string") {
            await sb.from("pipeline").update({ stage: "App In", updated_at: new Date().toISOString(), last_activity_text: "Deal written" }).eq("id", lead.id);
          }
          window.toast && window.toast(`Deal written · ${product?.name || "policy"} · ${fmt$(expectedCommission)} expected`, "success");
          // Optimistic local update
          AppData.POLICIES = [
            { id: data.id, leadId: row.lead_pipeline_id, carrierId, productId, policyNumber: row.policy_number, product: row.product_text, ap: dollars(row.ap_cents), issuedAt: row.submission_date, status, owner: row.owner_rep_id, state: row.state },
            ...(AppData.POLICIES || []),
          ];
          window.dispatchEvent(new CustomEvent("data:hydrated"));
        } else {
          // No Supabase yet — push into local state for demo continuity
          AppData.POLICIES = [
            { id: "local-" + Date.now(), leadId, carrierId, productId, policyNumber: row.policy_number, product: row.product_text, ap: dollars(row.ap_cents), issuedAt: row.submission_date, status, owner: row.owner_rep_id, state: row.state },
            ...(AppData.POLICIES || []),
          ];
          window.dispatchEvent(new CustomEvent("data:hydrated"));
          window.toast && window.toast("Deal written locally (Supabase offline)", "info");
        }
        // Reset form
        setLeadId(""); setNewLead(null); setQuery(""); setPickerOpen(false);
        setCarrierId(""); setProductId(""); setAp(""); setTarget("");
        setCompRate(""); setDraftDate(""); setPolNum(""); setStatus("submitted");
        onWritten && onWritten();
      } catch (e) {
        setError(e.message || "Save failed");
      } finally {
        setBusy(false);
      }
    }

    const Lbl = ({ children, required }) => (
      <span style={{ display: "block", fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
        {children}{required && <span style={{ color: "var(--state-danger)" }}> *</span>}
      </span>
    );
    const inp = { width: "100%", padding: "8px 10px", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6, fontSize: 13, color: "var(--text-primary)" };

    const noCarriers = (carriers || []).length === 0;
    const noProducts = (products || []).length === 0;

    return (
      <div className="panel" style={{ padding: 18, maxWidth: 720 }}>
        <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: 16 }}>Write deal</h3>

        {prefillSource && (
          <div style={{ padding: "8px 12px", marginBottom: 12, background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>📋</span>
            <span>Prefilled from <strong style={{ color: "var(--accent-money)" }}>{prefillSource}</strong> — confirm <em>product</em> and AP, then submit.</span>
          </div>
        )}

        {(noCarriers || noProducts) && (
          <div style={{ padding: 12, marginBottom: 14, background: "color-mix(in oklch, var(--state-warning) 12%, transparent)", border: "1px solid color-mix(in oklch, var(--state-warning) 35%, transparent)", borderRadius: 6, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
            <strong style={{ color: "var(--state-warning)" }}>{noCarriers ? "No carriers" : "No products"} on file.</strong>{" "}
            Add them in <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("nav:goto", { detail: { page: "resources" }})); }} style={{ color: "var(--accent-money)" }}>Resources → Carriers</a> before writing a deal.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Linked Lead — typeahead. Type a name → existing matches +
              "Add new" inline. New leads get materialized into the pipeline
              on submit so the producer doesn't have to go through CRM first. */}
          <div style={{ gridColumn: "1 / -1" }}>
            <Lbl required>👤 Lead</Lbl>
            {isCommitted ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "color-mix(in oklch, var(--accent-money) 8%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)", borderRadius: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                  {selectedLead
                    ? <>{selectedLead.lead} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {selectedLead.state} · {selectedLead.stage}{selectedLead.product ? " · " + selectedLead.product : ""}</span></>
                    : <>+ New: {(newLead.firstName || newLead.lastName) ? `${newLead.firstName} ${newLead.lastName}`.trim() : "(name below)"} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· will be added to pipeline</span></>}
                </span>
                <button type="button" onClick={clearLead} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 12, padding: "2px 6px" }} aria-label="Change lead">✕ change</button>
              </div>
            ) : (
              <div ref={pickerRef} style={{ position: "relative" }}>
                <input
                  style={inp}
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPickerOpen(true); }}
                  onFocus={() => setPickerOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (exactExistingMatch) {
                        const hit = eligibleLeads.find(l => (l.lead || "").toLowerCase() === query.trim().toLowerCase());
                        if (hit) return pickExisting(hit);
                      }
                      if (query.trim()) pickNewFromQuery();
                    } else if (e.key === "Escape") {
                      setPickerOpen(false);
                    }
                  }}
                  placeholder="Type a name — new or from pipeline"
                  autoComplete="off"
                />
                {pickerOpen && (query.trim() || filteredLeads.length > 0) && (
                  <div style={{ position: "absolute", zIndex: 5, top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", maxHeight: 280, overflowY: "auto" }}>
                    {query.trim() && !exactExistingMatch && (
                      <div role="option" onClick={pickNewFromQuery}
                        style={{ padding: "10px 12px", cursor: "pointer", fontSize: 13, color: "var(--accent-money)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
                        <span><strong>Add new lead:</strong> {query.trim()}</span>
                      </div>
                    )}
                    {filteredLeads.length === 0 && !query.trim() && (
                      <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-tertiary)" }}>Type a name to add a new lead, or start typing to filter your pipeline.</div>
                    )}
                    {filteredLeads.map(l => (
                      <div key={l.id} role="option" onClick={() => pickExisting(l)}
                        style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }}>
                        <div style={{ fontWeight: 500 }}>{l.lead}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 1 }}>
                          {l.state || "—"} · {l.stage}{l.product ? " · " + l.product : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
                  No need to add the lead in CRM first — type their name and we'll create the pipeline row on submit.
                </div>
              </div>
            )}
          </div>

          {/* Inline new-lead fields — only shown when "Add new" was picked. */}
          {newLead && (
            <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr 90px 1fr", gap: 10, padding: 12, background: "color-mix(in oklch, var(--accent-status) 5%, transparent)", border: "1px solid var(--border-subtle)", borderRadius: 6 }}>
              <div>
                <Lbl required>First name</Lbl>
                <input style={inp} type="text" value={newLead.firstName} autoFocus
                  onChange={(e) => setNewLead({ ...newLead, firstName: e.target.value })}
                  placeholder="Jane"/>
              </div>
              <div>
                <Lbl required>Last name</Lbl>
                <input style={inp} type="text" value={newLead.lastName}
                  onChange={(e) => setNewLead({ ...newLead, lastName: e.target.value })}
                  placeholder="Doe"/>
              </div>
              <div>
                <Lbl required>State</Lbl>
                <select style={inp} value={newLead.state}
                  onChange={(e) => setNewLead({ ...newLead, state: e.target.value })}>
                  <option value="">—</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Phone <span style={{ color: "var(--text-quaternary)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></Lbl>
                <input style={inp} type="tel" value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  placeholder="555-123-4567"/>
              </div>
            </div>
          )}

          <div>
            <Lbl required>Carrier</Lbl>
            <select style={inp} value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
              <option value="">— pick a carrier —</option>
              {carriers.filter(c => {
                if (c.status === "inactive") return false;
                // Honor per-rep carrier_prefs.deals — only explicit `false` hides.
                const prefs = (window.repflowCarrierPrefs && window.repflowCarrierPrefs("deals")) || {};
                return prefs[c.id] !== false;
              }).map(c => (
                <option key={c.id} value={c.id}>{c.name} · {c.category}</option>
              ))}
            </select>
          </div>

          <div>
            <Lbl required>Product</Lbl>
            <select style={inp} value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!carrierId}>
              <option value="">{carrierId ? "— pick a product —" : "(pick carrier first)"}</option>
              {productOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.compPct ? ` · ${p.compPct}%` : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <Lbl required>AP (Annualized Premium)</Lbl>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--text-tertiary)" }}>$</span>
              <input style={inp} type="number" min="0" step="100" value={ap} onChange={(e) => setAp(e.target.value)} placeholder="2400"/>
            </div>
          </div>

          {showTarget && (
            <div>
              <Lbl>Target Premium</Lbl>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "var(--text-tertiary)" }}>$</span>
                <input style={inp} type="number" min="0" step="100" value={targetPremium} onChange={(e) => setTarget(e.target.value)} placeholder="2000"/>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, fontStyle: "italic" }}>
                This is an IUL policy with target premium lower than annual premium
              </div>
            </div>
          )}

          {!showTarget && <div/>}

          <div>
            <Lbl required>Comp Rate</Lbl>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input style={inp} type="number" min="0" max="200" step="0.5" value={compRate} onChange={(e) => setCompRate(e.target.value)} placeholder="110"/>
              <span style={{ color: "var(--text-tertiary)" }}>%</span>
            </div>
          </div>

          <div>
            <Lbl>Expected Commission</Lbl>
            <div style={{ ...inp, background: "color-mix(in oklch, var(--accent-money) 8%, transparent)", borderColor: "color-mix(in oklch, var(--accent-money) 30%, transparent)", color: "var(--accent-money)", fontWeight: 600, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
              {fmt$(expectedCommission)}
            </div>
          </div>

          <div>
            <Lbl required>Submission Date</Lbl>
            <input style={inp} type="date" value={submissionDate} onChange={(e) => setSubDate(e.target.value)}/>
          </div>

          <div>
            <Lbl>Initial Draft Date</Lbl>
            <input style={inp} type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)}/>
          </div>

          <div>
            <Lbl required>Status</Lbl>
            <select style={inp} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="submitted">Submitted</option>
              <option value="app_in">App In</option>
              <option value="issued">Issued</option>
              <option value="active">Active</option>
              <option value="declined">Declined</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>

          <div>
            <Lbl>Policy Number <span style={{ color: "var(--text-quaternary)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></Lbl>
            <input style={inp} type="text" value={policyNumber} onChange={(e) => setPolNum(e.target.value)} placeholder="POL-12345"/>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: "8px 12px", background: "color-mix(in oklch, var(--state-danger) 12%, transparent)", color: "var(--state-danger)", borderRadius: 6, fontSize: 12.5 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={() => {
            setLeadId(""); setNewLead(null); setQuery(""); setPickerOpen(false);
            setCarrierId(""); setProductId(""); setAp(""); setTarget("");
            setCompRate(""); setDraftDate(""); setPolNum(""); setStatus("submitted"); setError(null);
          }} disabled={busy}>Clear</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Write deal"}
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // <RecentDeals/> — list for the right rail / below the form
  // --------------------------------------------------------------------------
  function RecentDeals({ repId, limit = 12 }) {
    const policies = AppData.POLICIES || [];
    const carriers = AppData.CARRIERS || [];
    const carrierById = new Map(carriers.map(c => [c.id, c]));
    // All my policies, for the totals; only the top `limit` get rendered.
    const allMine = policies.filter(p => !repId || p.owner === repId);
    const mine = allMine.slice(0, limit);
    const expectedTotal = allMine.reduce((a, p) => a + (Number(p.expectedCommission) || 0), 0);
    const pendingCount  = allMine.filter(p => p.status === "submitted" || p.status === "app_in" || p.status === "active" || p.status === "issued").length;

    const statusChip = (s) => {
      const style = s === "issued" || s === "active" ? "chip-money"
                   : s === "submitted" || s === "app_in" ? "chip-info"
                   : s === "declined" || s === "withdrawn" ? "chip-danger"
                   : "chip-status";
      return <span className={`chip ${style}`}>{s}</span>;
    };

    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.Wallet size={14}/>
          <h3>My recent deals</h3>
          <span className="meta">{allMine.length} total · {pendingCount} pending payout · ${Math.round(expectedTotal).toLocaleString()} expected</span>
        </div>
        {mine.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            No deals written yet. Use the form to write your first.
          </div>
        ) : (
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 1.2fr 90px 100px 100px" }}>
              <div>Lead / policy</div>
              <div>Carrier</div>
              <div>Product</div>
              <div className="tabular" style={{ textAlign: "right" }}>AP</div>
              <div className="tabular" style={{ textAlign: "right" }}>Submitted</div>
              <div>Status</div>
            </div>
            {mine.map(p => {
              const c = carrierById.get(p.carrierId);
              return (
                <div key={p.id} className="row" style={{ gridTemplateColumns: "1.4fr 1fr 1.2fr 90px 100px 100px" }}>
                  <div className="cell-truncate" style={{ fontWeight: 500 }}>
                    {p.policyNumber || (p.id ? String(p.id).slice(0, 8) : "—")}
                  </div>
                  <div className="cell-truncate" style={{ color: "var(--text-tertiary)" }}>{c?.name || p.carrierId || "—"}</div>
                  <div className="cell-truncate" style={{ color: "var(--text-secondary)" }}>{p.product || "—"}</div>
                  <div className="tabular" style={{ textAlign: "right" }}>{p.ap ? "$" + p.ap.toLocaleString() : "—"}</div>
                  <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)", fontSize: 11.5 }}>
                    {p.issuedAt ? p.issuedAt.slice(5) : "—"}
                  </div>
                  <div>{statusChip(p.status)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // <DealWriteModal/> — floating shell for the topbar Deal button. Mounts
  // the SAME DealWriteForm used inside Floor → Deals so the carrier-/state-
  // /comp-rate logic stays single-sourced. Replaces the deprecated
  // QuickLogDeal modal (2026-05-24) whose 5-field stripped UX caused
  // divergent comp defaults (100% vs product-base) and missed lead/carrier
  // validation.
  // ──────────────────────────────────────────────────────────────────────
  function DealWriteModal({ defaultLeadId, defaultCarrierId, defaultAp, defaultNewLead, prefillSource, onClose }) {
    const Modal = (window.Shared && window.Shared.Modal) || null;
    if (!Modal) {
      // Should never happen post-hydrate; render the form bare as a
      // last-ditch fallback.
      return <DealWriteForm
        defaultLeadId={defaultLeadId}
        defaultCarrierId={defaultCarrierId}
        defaultAp={defaultAp}
        defaultNewLead={defaultNewLead}
        prefillSource={prefillSource}
        onWritten={onClose}
      />;
    }
    return (
      <Modal title="Write deal" width={780} onClose={onClose}>
        <DealWriteForm
          defaultLeadId={defaultLeadId}
          defaultCarrierId={defaultCarrierId}
          defaultAp={defaultAp}
          defaultNewLead={defaultNewLead}
          prefillSource={prefillSource}
          onWritten={onClose}
        />
      </Modal>
    );
  }

  window.DealWriteForm  = DealWriteForm;
  window.DealWriteModal = DealWriteModal;
  window.RecentDeals    = RecentDeals;
})();
