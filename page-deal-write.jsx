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
  const withTimeout = (promise, ms = 15000) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Deal save timed out. Check your connection and try again.")), ms)),
  ]);

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
  function DealWriteForm({ defaultLeadId, defaultCarrierId, defaultAp, defaultNewLead, prefillSource, onWritten, policyId }) {
    // policyId truthy → edit mode. Loads the existing row on mount and
    // switches submit() to UPDATE. Delete button surfaces too.
    const isEdit = !!policyId;
    const carriers = AppData.CARRIERS || [];
    const products = AppData.PRODUCTS || [];
    const pipeline = AppData.PIPELINE || [];
    const dealCarrierAccess = useMemo(
      () => window.repflowCarrierAccess ? window.repflowCarrierAccess("deals", { carriers }) : null,
      [carriers]
    );
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
    // 2026-06-05: fully manual — rep types comp rate AND expected commission $
    // directly. No more AP×rate auto-derivation. Rates vary too much by rep /
    // product / state to project reliably.
    const [compRate, setCompRate]       = useState("");
    const [expectedComm, setExpectedComm] = useState("");
    const [submissionDate, setSubDate]  = useState(today());
    const [draftDate, setDraftDate]     = useState("");
    const [status, setStatus]           = useState("submitted");
    const [policyNumber, setPolNum]     = useState("");
    const [busy, setBusy]               = useState(false);
    const [error, setError]             = useState(null);
    const [loadedEdit, setLoadedEdit]   = useState(false);

    // Edit-mode hydration — pull the policy row + populate all the state
    // setters. Runs once when policyId becomes available.
    useEffect(() => {
      if (!isEdit || loadedEdit) return;
      (async () => {
        try {
          const sb = window.getSupabase && window.getSupabase();
          if (!sb) { setLoadedEdit(true); return; }
          const { data, error } = await sb.from("policies").select("*").eq("id", policyId).single();
          if (error) throw error;
          if (data) {
            setLeadId(data.lead_pipeline_id || "");
            setCarrierId(data.carrier_id || "");
            setProductId(data.product_id || "");
            setAp(data.ap_cents != null ? String(dollars(data.ap_cents)) : "");
            setTarget(data.target_premium_cents != null ? String(dollars(data.target_premium_cents)) : "");
            setCompRate(data.comp_rate_pct != null ? String(data.comp_rate_pct) : "");
            setExpectedComm(data.expected_commission_cents != null ? String(dollars(data.expected_commission_cents)) : "");
            setSubDate(data.submission_date || "");
            setDraftDate(data.initial_draft_date || "");
            setStatus(data.status || "submitted");
            setPolNum(data.policy_number || "");
            setLeadSourceId(data.lead_source_id || "");
          }
        } catch (e) {
          setError("Couldn't load deal for editing: " + (e.message || e));
        } finally {
          setLoadedEdit(true);
        }
      })();
    }, [isEdit, policyId, loadedEdit]);

    // Lead vendor — attribute this deal to the source that produced the
    // lead, so the Attribution page can roll AP / ROAS up per vendor.
    // Catalog is public.agency_lead_sources (same table the lead-spend
    // expense flow writes to), so spend and revenue meet on one id.
    const [leadSourceId, setLeadSourceId] = useState("");
    const [sources, setSources]           = useState([]);
    const [srcLoading, setSrcLoading]     = useState(false);
    const [addingVendor, setAddingVendor] = useState(false);
    const [newVendorName, setNewVendorName] = useState("");
    const [vendorBusy, setVendorBusy]     = useState(false);

    const product = products.find(p => p.id === productId);
    const carrier = carriers.find(c => c.id === carrierId);
    const showTarget = isIULProduct(product);

    // Resolve the signed-in agency once — used for vendor catalog + create.
    const agencyId = (() => {
      const m = (typeof window !== "undefined" && window.me && window.me()) || null;
      return m?.agency_id || null;
    })();

    // Hydrate the active lead-vendor catalog for this agency.
    useEffect(() => {
      if (!agencyId) return;
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      setSrcLoading(true);
      sb.from("agency_lead_sources")
        .select("id,name,vendor")
        .eq("agency_id", agencyId)
        .eq("active", true)
        .order("name")
        .then(({ data }) => { setSources(data || []); setSrcLoading(false); },
              () => setSrcLoading(false));
    }, [agencyId]);

    // Inline "+ Add vendor" — minimal row (name + optional vendor label).
    // Mirrors quick-log.jsx::createNewSource minus webhook provisioning;
    // reps wire intake from Settings → Lead sources when they need it.
    async function createVendor() {
      if (!newVendorName.trim()) { setError("Name the vendor."); return; }
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !agencyId) { setError("Supabase not connected."); return; }
      setVendorBusy(true);
      try {
        const { data, error } = await sb.from("agency_lead_sources")
          .insert({ agency_id: agencyId, name: newVendorName.trim(), active: true })
          .select("id,name,vendor")
          .single();
        if (error) throw error;
        setSources(s => [...s, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
        setLeadSourceId(data.id);
        setAddingVendor(false);
        setNewVendorName("");
        setError(null);
        window.toast && window.toast(`Added vendor: ${data.name}`, "success");
      } catch (e) {
        setError(`Couldn't add vendor: ${e?.message || e}`);
      } finally {
        setVendorBusy(false);
      }
    }

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

    // No comp-rate auto-seed (removed 2026-06-05): rep types it as a note
    // alongside the actual expected $ amount, so we don't pretend to know
    // the rate when it varies per rep / product / state. Both fields are
    // optional and informational only — nothing in the system derives money
    // from them anymore.

    // Auto-fill carrier/AP if lead has hints (lead.product matches a product name)
    useEffect(() => {
      if (!leadId) return;
      const lead = pipeline.find(l => String(l.id) === String(leadId));
      if (!lead) return;
      // Inherit the lead's vendor so AP/ROAS auto-attributes without the rep
      // re-picking. The lead carries lead_source_id from intake (CSV/manual).
      if (lead.leadSourceId) setLeadSourceId(lead.leadSourceId);
      if (!ap && lead.ap) setAp(String(lead.ap));
      if (!productId && lead.product) {
        const guess = products.find(p => lead.product.toLowerCase().includes((p.name || "").toLowerCase()));
        if (guess) {
          setCarrierId(guess.carrierId);
          setProductId(guess.id);
        }
      }
    }, [leadId]);

    // expectedCommission is just whatever the rep typed — no math.
    const expectedCommission = useMemo(() => Number(expectedComm) || 0, [expectedComm]);

    // Expected advance = 9 months on the AP (i.e. 75% of full commission).
    //   advance = expected_commission × 0.75
    // Fallback when the rep hasn't typed expectedComm but did type AP+comp:
    //   advance = base × (comp_rate / 100) × 0.75   where base = target_premium ?? ap
    // Display-only and fully derivable — not persisted to DB (per migration
    // 0088 Ian dropped DB-side comp math; rep-typed values are ground truth).
    const expectedAdvance = useMemo(() => {
      if (expectedCommission > 0) return expectedCommission * 0.75;
      const base = (showTarget && Number(targetPremium)) ? Number(targetPremium) : Number(ap);
      const rate = Number(compRate);
      if (base > 0 && rate > 0) return base * (rate / 100) * 0.75;
      return 0;
    }, [expectedCommission, ap, targetPremium, compRate, showTarget]);

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
      // Comp rate + expected commission are optional now — rep can leave blank
      // and log the actual commission later via Book → Deposits.
      if (!meIdent?.agency_id) return setError("Couldn't load your agency. Reload and try again.");

      setBusy(true);
      const sb = window.getSupabase && window.getSupabase();
      // CRM v2 owns the multi-table write when its RPC is available. Keep the
      // legacy path as a temporary compatibility fallback for agencies whose
      // migration has not landed yet; real RPC errors must surface instead of
      // silently splitting a deal across tables.
      if (sb && typeof sb.rpc === "function") {
        const displayName = newLead
          ? [newLead.firstName.trim(), newLead.lastName.trim()].filter(Boolean).join(" ")
          : (leadId ? pipeline.find(l => String(l.id) === String(leadId))?.lead : null);
        const crmPayload = {
          agency_id: meIdent.agency_id,
          policy_id: isEdit ? policyId : null,
          lead_pipeline_id: leadId || null,
          lead_name: displayName || null,
          phone: newLead?.phone || (leadId ? pipeline.find(l => String(l.id) === String(leadId))?.phone : null),
          email: newLead?.email || (leadId ? pipeline.find(l => String(l.id) === String(leadId))?.email : null),
          state: newLead?.state || (leadId ? pipeline.find(l => String(l.id) === String(leadId))?.state : null),
          carrier_id: carrierId, product_id: productId, product: product?.name || null,
          policy_number: policyNumber || null, ap_cents: cents(ap),
          expected_commission_cents: expectedComm ? cents(expectedComm) : null,
          comp_rate_pct: compRate ? Number(compRate) : null,
          status, stage: status === "submitted" ? "App In" : "New",
          owner_rep_id: meIdent.rep_id || (me ? me.id : null),
        };
        try {
          const { data: crmData, error: crmError } = await withTimeout(sb.rpc("crm_write_deal", { p_payload: crmPayload }));
          const missingRpc = crmError && /function .*crm_write_deal|does not exist|could not find/i.test(crmError.message || "");
          if (crmError && !missingRpc) throw crmError;
          if (!crmError && crmData) {
            window.toast && window.toast(`${isEdit ? "Deal updated" : "Deal written"} · ${product?.name || "policy"}`, "success");
            window.dispatchEvent(new CustomEvent("data:hydrated"));
            onWritten && onWritten(crmData);
            setBusy(false);
            return;
          }
        } catch (rpcError) {
          setBusy(false);
          setError(rpcError?.message || "Deal could not be saved.");
          return;
        }
      }
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
        agency_id: meIdent.agency_id,
        lead_pipeline_id: lead && lead.id && typeof lead.id === "string" ? lead.id : null,
        carrier_id: carrierId,
        product_id: productId,
        product_text: product ? product.name : null,
        ap_cents: cents(ap),
        target_premium_cents: showTarget && targetPremium ? cents(targetPremium) : null,
        // Both optional / informational now — DB auto-derive triggers were
        // dropped in migration 0088 (2026-06-05). Whatever the rep typed is
        // exactly what gets stored; nulls stay null.
        comp_rate_pct: compRate ? Number(compRate) : null,
        expected_commission_cents: expectedComm ? cents(expectedComm) : null,
        submission_date: submissionDate || null,
        initial_draft_date: draftDate || null,
        status,
        policy_number: policyNumber || null,
        owner_rep_id: meIdent.rep_id || (me ? me.id : null),
        state: lead ? lead.state : null,
        // Lead-vendor attribution — links this deal's AP to the source that
        // produced it, so Attribution can compute per-vendor ROAS.
        lead_source_id: leadSourceId || null,
      };

      try {
        if (sb && isEdit) {
          // UPDATE existing policy. agency_id stays — never reparent.
          const { agency_id, ...patch } = row;
          const { data, error } = await sb.from("policies").update(patch).eq("id", policyId).select().single();
          if (error) throw error;
          // Backfill the client link for legacy deals edited after this fix
          // shipped (idempotent — no-op when a client already exists).
          if (row.lead_pipeline_id) {
            try {
              await AppData.mutate.ensureClientForLead({
                leadId: row.lead_pipeline_id,
                name:   lead ? lead.lead : null,
                phone:  lead ? lead.phone : null,
                email:  lead ? lead.email : null,
              });
            } catch (_e) { /* book linkage is best-effort */ }
          }
          window.toast && window.toast(`Deal updated · ${product?.name || "policy"}`, "success");
          window.dispatchEvent(new CustomEvent("data:hydrated"));
          onWritten && onWritten();
          setBusy(false);
          return;
        }
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
            { id: data.id, leadId: row.lead_pipeline_id, carrierId, productId, policyNumber: row.policy_number, product: row.product_text, ap: dollars(row.ap_cents), issuedAt: row.submission_date, status, owner: row.owner_rep_id, state: row.state, leadSourceId: row.lead_source_id },
            ...(AppData.POLICIES || []),
          ];
          // Connect the deal to the client book: ensure a clients row exists
          // for this lead (clients ↔ policies are siblings on lead_pipeline_id).
          // Idempotent + best-effort — a failure here never blocks the write.
          if (row.lead_pipeline_id) {
            try {
              await AppData.mutate.ensureClientForLead({
                leadId: row.lead_pipeline_id,
                name:   lead ? lead.lead : null,
                phone:  lead ? lead.phone : null,
                email:  lead ? lead.email : null,
              });
            } catch (_e) { /* book linkage is best-effort */ }
          }
          window.dispatchEvent(new CustomEvent("data:hydrated"));
        } else {
          // No Supabase yet — push into local state for demo continuity
          AppData.POLICIES = [
            { id: "local-" + Date.now(), leadId, carrierId, productId, policyNumber: row.policy_number, product: row.product_text, ap: dollars(row.ap_cents), issuedAt: row.submission_date, status, owner: row.owner_rep_id, state: row.state, leadSourceId: row.lead_source_id },
            ...(AppData.POLICIES || []),
          ];
          window.dispatchEvent(new CustomEvent("data:hydrated"));
          window.toast && window.toast("Deal written locally (Supabase offline)", "info");
        }
        // Reset form
        setLeadId(""); setNewLead(null); setQuery(""); setPickerOpen(false);
        setCarrierId(""); setProductId(""); setAp(""); setTarget("");
        setCompRate(""); setDraftDate(""); setPolNum(""); setStatus("submitted");
        setLeadSourceId(""); setAddingVendor(false); setNewVendorName("");
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
      <div className="crm-deal-form">
        <div className="crm-deal-intro">
          <div>
            <div className="crm-eyebrow">{isEdit ? "Policy record" : "New policy record"}</div>
            <h3>{isEdit ? "Edit deal" : "Write deal"}</h3>
          </div>
          <div className="crm-deal-intro-meta">{isEdit ? `ID ${String(policyId).slice(0, 8)}` : "Lead → policy → cash"}</div>
        </div>

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

        <div className="crm-deal-grid">
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
            <div className="crm-deal-new-lead">
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

          {/* Lead vendor — optional attribution. Tagging here is what lets
              the Attribution page roll realized AP up per source (ROAS). */}
          <div className="crm-deal-full">
            <Lbl>🏷️ Lead vendor <span style={{ color: "var(--text-quaternary)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional · powers per-vendor ROAS)</span></Lbl>
            {addingVendor ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={inp}
                  type="text"
                  autoFocus
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); createVendor(); }
                    else if (e.key === "Escape") { setAddingVendor(false); setNewVendorName(""); }
                  }}
                  placeholder="e.g. SmartFinancial, Datalot, Facebook"
                />
                <button type="button" className="btn btn-primary" disabled={vendorBusy} onClick={createVendor} style={{ whiteSpace: "nowrap" }}>
                  {vendorBusy ? "Adding…" : "Add"}
                </button>
                <button type="button" className="btn" disabled={vendorBusy} onClick={() => { setAddingVendor(false); setNewVendorName(""); }}>Cancel</button>
              </div>
            ) : (
              <select
                style={inp}
                value={leadSourceId}
                onChange={(e) => {
                  if (e.target.value === "__new__") { setAddingVendor(true); setLeadSourceId(""); }
                  else setLeadSourceId(e.target.value);
                }}
              >
                <option value="">
                  {srcLoading ? "Loading vendors…"
                    : sources.length === 0 ? "— No vendors yet · add one below —"
                    : "— No vendor / unattributed —"}
                </option>
                {sources.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.vendor ? ` · ${s.vendor}` : ""}</option>
                ))}
                <option value="__new__">＋ Add new vendor…</option>
              </select>
            )}
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>
              Tag the source that produced this lead so its AP and ROAS appear on Attribution → By vendor.
            </div>
          </div>

          <div>
            <Lbl required>Carrier</Lbl>
            <select style={inp} value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
              <option value="">— pick a carrier —</option>
              {carriers.filter(c => {
                if (c.status === "inactive") return false;
                if (dealCarrierAccess?.ready) return dealCarrierAccess.catalogIds.has(c.id);
                // Pre-hydrate fallback: honor per-rep carrier_prefs until the
                // agency appointment roster is available.
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
            <Lbl>Comp Rate <span style={{ color: "var(--text-quaternary)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional note)</span></Lbl>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input style={inp} type="number" min="0" max="200" step="0.5" value={compRate} onChange={(e) => setCompRate(e.target.value)} placeholder="110"/>
              <span style={{ color: "var(--text-tertiary)" }}>%</span>
            </div>
          </div>

          <div>
            <Lbl>Expected Commission <span style={{ color: "var(--text-quaternary)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(you know your rate — type the $ amount)</span></Lbl>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--text-tertiary)" }}>$</span>
              <input style={inp} type="number" min="0" step="50" value={expectedComm} onChange={(e) => setExpectedComm(e.target.value)} placeholder="2640"/>
            </div>
          </div>

          <div>
            <Lbl>Expected Advance <span style={{ color: "var(--text-quaternary)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(9-mo advance · 75%)</span></Lbl>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 10px",
                background: expectedAdvance > 0 ? "color-mix(in oklch, var(--accent-money) 8%, transparent)" : "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 6,
                fontSize: 13,
                fontVariantNumeric: "tabular-nums",
                color: expectedAdvance > 0 ? "var(--accent-money)" : "var(--text-tertiary)",
                fontWeight: expectedAdvance > 0 ? 600 : 400,
              }}
              title="AP × comp rate × 0.75 — the 9-month advance that hits before as-earned starts"
            >
              {expectedAdvance > 0 ? `$${expectedAdvance.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
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

        <div className="crm-deal-actions">
          {isEdit && (
            <button className="btn" style={{ marginRight: "auto", color: "var(--state-danger)" }} disabled={busy}
              onClick={async () => {
                if (!window.confirm("Delete this deal? This removes the policy row and any allocations attached to it.")) return;
                setBusy(true);
                try {
                  const sb = window.getSupabase && window.getSupabase();
                  if (sb) {
                    const { error } = await sb.from("policies").delete().eq("id", policyId);
                    if (error) throw error;
                  }
                  window.toast && window.toast("Deal deleted", "info");
                  onWritten && onWritten();
                } catch (e) {
                  setError(e.message || "Delete failed");
                } finally { setBusy(false); }
              }}>Delete</button>
          )}
          <button className="btn" onClick={() => {
            setLeadId(""); setNewLead(null); setQuery(""); setPickerOpen(false);
            setCarrierId(""); setProductId(""); setAp(""); setTarget("");
            setCompRate(""); setExpectedComm(""); setDraftDate(""); setPolNum(""); setStatus("submitted"); setError(null);
            setLeadSourceId(""); setAddingVendor(false); setNewVendorName("");
          }} disabled={busy}>Clear</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : (isEdit ? "Save changes" : "Write deal")}
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
    // 2026-06-06: every deal row gets an Edit action → opens DealEditModal
    // with the full form prefilled. Save updates the policies row; Delete
    // removes it. Fully editable per Ian's mandate.
    const [editingId, setEditingId] = useState(null);
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
            <div className="list-h" style={{ gridTemplateColumns: "1.3fr 1fr 1.1fr 80px 90px 90px 70px" }}>
              <div>Lead / policy</div>
              <div>Carrier</div>
              <div>Product</div>
              <div className="tabular" style={{ textAlign: "right" }}>AP</div>
              <div className="tabular" style={{ textAlign: "right" }}>Submitted</div>
              <div>Status</div>
              <div></div>
            </div>
            {mine.map(p => {
              const c = carrierById.get(p.carrierId);
              return (
                <div key={p.id} className="row" style={{ gridTemplateColumns: "1.3fr 1fr 1.1fr 80px 90px 90px 70px" }}>
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
                  <div>
                    <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }}
                      onClick={() => setEditingId(p.id)}>Edit</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {editingId && (
          <DealEditModal policyId={editingId} onClose={() => setEditingId(null)}/>
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
      <Modal title="Write deal" width={860} onClose={onClose}>
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

  // ──────────────────────────────────────────────────────────────────────
  // <DealEditModal/> — same form, edit mode. Mounts inside Shared.Modal
  // and forwards onClose to the form's onWritten so save/delete dismisses.
  // ──────────────────────────────────────────────────────────────────────
  function DealEditModal({ policyId, onClose }) {
    const Modal = (window.Shared && window.Shared.Modal) || null;
    const form = <DealWriteForm policyId={policyId} onWritten={onClose}/>;
    if (!Modal) return form;
    return (
      <Modal title="Edit deal" width={860} onClose={onClose}>{form}</Modal>
    );
  }

  window.DealWriteForm  = DealWriteForm;
  window.DealWriteModal = DealWriteModal;
  window.DealEditModal  = DealEditModal;
  window.RecentDeals    = RecentDeals;
  window.dispatchEvent(new Event("deal-write:ready"));
})();
