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
  const fmt$ = (n) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function isIULProduct(p) {
    if (!p) return false;
    const cat = (p.category || "").toLowerCase();
    const name = (p.name || "").toLowerCase();
    return cat.includes("iul") || name.includes("iul") || name.includes("indexed universal");
  }

  // --------------------------------------------------------------------------
  // <DealWriteForm/> — the form itself
  // --------------------------------------------------------------------------
  function DealWriteForm({ defaultLeadId, onWritten }) {
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
    const [carrierId, setCarrierId]     = useState("");
    const [productId, setProductId]     = useState("");
    const [ap, setAp]                   = useState("");
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

    // Cascade: when carrier changes, narrow product list & clear product
    useEffect(() => {
      if (productId && product && product.carrierId !== carrierId) {
        setProductId("");
      }
    }, [carrierId]);

    // When product changes, default comp rate from product.compPct
    useEffect(() => {
      if (product && product.compPct != null && !compRate) {
        setCompRate(String(product.compPct));
      }
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
      // GAP-D1 — resolve the signed-in producer instead of REPS[0]=Marcus.
      const meIdent = (typeof window !== "undefined" && window.me && window.me()) || null;
      const me = (meIdent?.rep_id && AppData.REPS?.find(r => r.id === meIdent.rep_id))
              || (AppData.REPS && AppData.REPS[0]);
      if (!leadId)     return setError("Pick a linked lead");
      if (!carrierId)  return setError("Pick a carrier");
      if (!productId)  return setError("Pick a product");
      if (!ap || Number(ap) <= 0) return setError("Enter AP");
      if (!compRate || Number(compRate) <= 0) return setError("Enter a comp rate");

      setBusy(true);
      const sb = window.getSupabase && window.getSupabase();
      const lead = pipeline.find(l => String(l.id) === String(leadId));

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
        setLeadId(""); setCarrierId(""); setProductId(""); setAp(""); setTarget("");
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

    return (
      <div className="panel" style={{ padding: 18, maxWidth: 720 }}>
        <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: 16 }}>Write deal</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Linked Lead — full width */}
          <div style={{ gridColumn: "1 / -1" }}>
            <Lbl required>👤 Linked Lead</Lbl>
            <select style={inp} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">— pick a lead —</option>
              {eligibleLeads.map(l => (
                <option key={l.id} value={l.id}>
                  {l.lead} · {l.state} · {l.stage} · {l.product || "(no product)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Lbl required>Carrier</Lbl>
            <select style={inp} value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
              <option value="">— pick a carrier —</option>
              {carriers.filter(c => c.status !== "inactive").map(c => (
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
            setLeadId(""); setCarrierId(""); setProductId(""); setAp(""); setTarget("");
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
    const mine = policies
      .filter(p => !repId || p.owner === repId)
      .slice(0, limit);

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
          <span className="meta">{mine.length} of {policies.length}</span>
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

  window.DealWriteForm = DealWriteForm;
  window.RecentDeals   = RecentDeals;
})();
