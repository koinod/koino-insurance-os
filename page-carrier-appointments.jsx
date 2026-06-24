/* page-carrier-appointments.jsx — Carrier Appointment Tracker
 *
 * Per-agency roster of carrier appointments. For each carrier in
 * public.carriers, shows whether the operator is:
 *   - self:         contracted directly (own NPN appointment)
 *   - bridge:       writing under another producer's NPN (Zay → Ian arrangement)
 *   - pending:      contract submitted, awaiting carrier approval
 *   - not_pursuing: explicitly skipped
 *
 * For bridge rows, captures bridge_under_npn + bridge_under_name so it's
 * traceable which paper the policy bound on. When status flips bridge → self,
 * prompts for transferred_at (when the bridge book of business got rolled
 * over to the operator's own appointment).
 *
 * Data source: public.carriers LEFT JOINed with public.agency_carrier_appointments
 * scoped to the active agency. Carriers without an appt row render as
 * status="pending" (default for net-new). Upsert on (agency_id, carrier_id).
 *
 * Permissions: owner / admin / imo_owner / manager (per existing RLS on
 * agency_carrier_appointments). super_admin sees everything.
 *
 * Schema additions live in 0068_carrier_appointments_bridge_tracking.sql.
 */

(function () {
  const { useState, useEffect, useMemo, useCallback } = React;

  /* ───── shared hooks ─────────────────────────────────────────────────── */
  function useAgencyReady() {
    const [, force] = useState(0);
    useEffect(() => {
      const fn = () => force(n => n + 1);
      window.addEventListener("me:loaded",      fn);
      window.addEventListener("data:hydrated",  fn);
      window.addEventListener("data:mutated",   fn);
      return () => {
        window.removeEventListener("me:loaded",     fn);
        window.removeEventListener("data:hydrated", fn);
        window.removeEventListener("data:mutated",  fn);
      };
    }, []);
  }

  /* ───── status presentation ──────────────────────────────────────────── */
  // Labels + chip colors. Legacy statuses (active/paused/terminated) collapse
  // onto the new vocabulary for display so old rows don't render as raw.
  const STATUS_META = {
    self:         { label: "Self · direct",   tone: "money",  hint: "Contracted directly on your NPN" },
    bridge:       { label: "Bridge",          tone: "warn",   hint: "Writing under another producer's appointment" },
    pending:      { label: "Pending",         tone: "info",   hint: "Contract submitted, awaiting carrier" },
    not_pursuing: { label: "Not pursuing",    tone: "muted",  hint: "Explicitly skipped" },
    unassigned:   { label: "Unassigned",      tone: "muted",  hint: "No appointment row yet" },
    active:       { label: "Self · direct",   tone: "money",  hint: "Legacy active appointment" },
    paused:       { label: "Paused",          tone: "muted",  hint: "Legacy paused" },
    terminated:   { label: "Terminated",      tone: "muted",  hint: "Legacy terminated" },
  };

  const STATUS_OPTIONS = ["unassigned", "self", "bridge", "pending", "not_pursuing"];

  function carrierLoginProvider(carrier) {
    const base = String(carrier?.carrier_id || carrier?.id || carrier?.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return `carrier_${base}`;
  }

  function statusPillStyle(tone) {
    const palette = {
      money: { bg: "rgba(46, 204, 113, 0.12)", fg: "#2ecc71", bd: "rgba(46, 204, 113, 0.32)" },
      warn:  { bg: "rgba(255, 165, 0, 0.12)",  fg: "#ffa500", bd: "rgba(255, 165, 0, 0.32)" },
      info:  { bg: "rgba(64, 156, 255, 0.12)", fg: "#409cff", bd: "rgba(64, 156, 255, 0.32)" },
      muted: { bg: "var(--bg-raised)",         fg: "var(--text-tertiary)", bd: "var(--border-default)" },
    };
    const p = palette[tone] || palette.muted;
    return {
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500,
      background: p.bg, color: p.fg, border: `1px solid ${p.bd}`,
      whiteSpace: "nowrap",
    };
  }

  /* ───── carriers + appointments loaders ──────────────────────────────── */
  function useCarriers() {
    const [carriers, setCarriers] = useState(null);
    useEffect(() => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) { setCarriers([]); return; }
      sb.from("carriers")
        .select("id, name, category, status")
        .order("name")
        .then(({ data, error }) => {
          if (error) { console.warn("[carriers]", error); setCarriers([]); return; }
          setCarriers(Array.isArray(data) ? data : []);
        })
        .catch(() => setCarriers([]));
    }, []);
    return carriers;
  }

  function useAppointments() {
    const [appts, setAppts] = useState(null);
    const reload = useCallback(() => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) { setAppts([]); return; }
      const agencyId = window.getActiveAgencyId && window.getActiveAgencyId();
      // Refuse to fetch unscoped: super_admin RLS would return every agency's
      // rows, causing N-agency × M-carrier ghost duplicates in the UI. me() may
      // still be loading on first mount — the me:loaded listener below retries.
      if (!agencyId) { setAppts([]); return; }
      sb.from("agency_carrier_appointments")
        .select("id, agency_id, carrier_id, carrier_name, status, bridge_under_npn, bridge_under_name, contracted_at, transferred_at, notes, appointed_states, npn, updated_at, created_at")
        .eq("agency_id", agencyId)
        .then(({ data, error }) => {
          if (error) { console.warn("[appts]", error); setAppts([]); return; }
          setAppts(Array.isArray(data) ? data : []);
        })
        .catch(() => setAppts([]));
    }, []);
    useEffect(() => {
      reload();
      const onMeLoaded = () => reload();
      window.addEventListener("me:loaded", onMeLoaded);
      return () => window.removeEventListener("me:loaded", onMeLoaded);
    }, [reload]);
    return [appts, reload];
  }

  /* ───── upsert helper ────────────────────────────────────────────────── */
  // Always upsert on (agency_id, carrier_id). If no row exists yet, we create
  // one with sensible defaults. carrier_name is copied off the global catalog
  // because agency_carrier_appointments has it NOT NULL.
  async function upsertAppointment(carrier, agencyId, patch) {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !agencyId) throw new Error("supabase or agency not ready");

    // Try to find the existing row first so we can do a precise update.
    const { data: existing, error: selErr } = await sb
      .from("agency_carrier_appointments")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("carrier_id", carrier.id)
      .maybeSingle();
    if (selErr && selErr.code !== "PGRST116") throw selErr;

    if (existing?.id) {
      const { error } = await sb
        .from("agency_carrier_appointments")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw error;
      return existing.id;
    }
    const insertRow = {
      agency_id:    agencyId,
      carrier_id:   carrier.id,
      carrier_name: carrier.name,
      status:       patch.status || "pending",
      ...patch,
    };
    const { data, error } = await sb
      .from("agency_carrier_appointments")
      .insert(insertRow)
      .select("id")
      .single();
    if (error) throw error;
    return data?.id;
  }

  /* ───── transfer-prompt modal ────────────────────────────────────────── */
  function TransferModal({ carrier, appt, onClose, onSaved }) {
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [saving, setSaving] = useState(false);
    const save = async () => {
      setSaving(true);
      try {
        const agencyId = window.getActiveAgencyId && window.getActiveAgencyId();
        await upsertAppointment(carrier, agencyId, {
          status: "self",
          contracted_at: appt?.contracted_at || date,
          transferred_at: date,
        });
        window.toast && window.toast(`${carrier.name}: marked transferred`, "success");
        onSaved && onSaved();
        onClose();
      } catch (e) {
        window.toast && window.toast(`Save failed: ${e.message || e}`, "danger");
      } finally { setSaving(false); }
    };
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
          borderRadius: 8, padding: 20, width: 420, maxWidth: "90vw",
        }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            Mark transferred · {carrier.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14 }}>
            Status flips bridge → self. Record the date the in-force book
            was transferred off the bridge appointment onto your direct one.
          </div>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
            Transferred date
          </label>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{
              width: "100%", padding: "6px 8px", borderRadius: 4,
              background: "var(--bg-raised)", border: "1px solid var(--border-default)",
              color: "var(--text-primary)", fontSize: 13, marginBottom: 16,
            }}/>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !date}>
              {saving ? "Saving…" : "Mark transferred → self"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ───── per-row component ────────────────────────────────────────────── */
  function CarrierRow({ carrier, appt, canEdit, agencyId, onMutate, loginVault = {}, onEditLogin }) {
    const status = appt?.status || "unassigned";
    const meta = STATUS_META[status] || STATUS_META.pending;
    const login = loginVault[carrierLoginProvider(carrier)] || null;

    const [editingBridge, setEditingBridge] = useState(false);
    const [bridgeNpn, setBridgeNpn] = useState(appt?.bridge_under_npn || "");
    const [bridgeName, setBridgeName] = useState(appt?.bridge_under_name || "");
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesDraft, setNotesDraft] = useState(appt?.notes || "");
    const [contractedDraft, setContractedDraft] = useState(appt?.contracted_at || "");
    const [transferredDraft, setTransferredDraft] = useState(appt?.transferred_at || "");
    const [transferPrompt, setTransferPrompt] = useState(false);
    const [savingField, setSavingField] = useState(null);

    // Re-sync local drafts when remote `appt` changes (e.g. after reload).
    useEffect(() => {
      setBridgeNpn(appt?.bridge_under_npn || "");
      setBridgeName(appt?.bridge_under_name || "");
      setNotesDraft(appt?.notes || "");
      setContractedDraft(appt?.contracted_at || "");
      setTransferredDraft(appt?.transferred_at || "");
    }, [appt?.id, appt?.updated_at]);

    const isBridge  = status === "bridge";
    const isSelf    = status === "self" || status === "active";

    const saveStatus = async (newStatus) => {
      if (newStatus === "unassigned") return;
      if (newStatus === status) return;
      // bridge → self transition: prompt for transferred_at if there was a
      // bridge appointment previously (so we capture when the book rolled).
      if (newStatus === "self" && isBridge) {
        setTransferPrompt(true);
        return;
      }
      setSavingField("status");
      try {
        const patch = { status: newStatus };
        if (newStatus === "self" && !appt?.contracted_at) {
          patch.contracted_at = new Date().toISOString().slice(0, 10);
        }
        if (newStatus !== "bridge") {
          // Don't clear bridge metadata — useful as history. UI just hides it.
        }
        await upsertAppointment(carrier, agencyId, patch);
        window.toast && window.toast(`${carrier.name}: ${STATUS_META[newStatus].label}`, "success");
        onMutate && onMutate();
      } catch (e) {
        window.toast && window.toast(`Save failed: ${e.message || e}`, "danger");
      } finally { setSavingField(null); }
    };

    const saveBridge = async () => {
      setSavingField("bridge");
      try {
        await upsertAppointment(carrier, agencyId, {
          status: "bridge",
          bridge_under_npn:  bridgeNpn || null,
          bridge_under_name: bridgeName || null,
        });
        window.toast && window.toast(`${carrier.name}: bridge updated`, "success");
        setEditingBridge(false);
        onMutate && onMutate();
      } catch (e) {
        window.toast && window.toast(`Save failed: ${e.message || e}`, "danger");
      } finally { setSavingField(null); }
    };

    const saveNotes = async () => {
      setSavingField("notes");
      try {
        await upsertAppointment(carrier, agencyId, { notes: notesDraft || null });
        setEditingNotes(false);
        onMutate && onMutate();
      } catch (e) {
        window.toast && window.toast(`Save failed: ${e.message || e}`, "danger");
      } finally { setSavingField(null); }
    };

    const saveDate = async (field, val) => {
      setSavingField(field);
      try {
        await upsertAppointment(carrier, agencyId, { [field]: val || null });
        onMutate && onMutate();
      } catch (e) {
        window.toast && window.toast(`Save failed: ${e.message || e}`, "danger");
      } finally { setSavingField(null); }
    };

    return (
      <>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 150px 1.4fr 110px 110px 1fr 80px",
          gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)",
          alignItems: "center", fontSize: 13,
        }}>
          {/* Carrier name + category */}
          <div>
            <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{carrier.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {carrier.id}{carrier.category ? ` · ${carrier.category}` : ""}
            </div>
          </div>

          {/* Status pill / dropdown */}
          <div>
            {canEdit ? (
              <select
                value={STATUS_OPTIONS.includes(status) ? status : "unassigned"}
                onChange={e => saveStatus(e.target.value)}
                disabled={savingField === "status"}
                title={meta.hint}
                style={{
                  ...statusPillStyle(meta.tone),
                  paddingRight: 20, cursor: "pointer", appearance: "auto",
                  border: `1px solid var(--border-default)`,
                }}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            ) : (
              <span style={statusPillStyle(meta.tone)} title={meta.hint}>{meta.label}</span>
            )}
          </div>

          {/* Bridge info */}
          <div>
            {isBridge ? (
              editingBridge ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    placeholder="Producer name"
                    value={bridgeName}
                    onChange={e => setBridgeName(e.target.value)}
                    style={{ flex: 1, minWidth: 0, padding: "4px 6px", fontSize: 12,
                      background: "var(--bg-raised)", border: "1px solid var(--border-default)",
                      borderRadius: 4, color: "var(--text-primary)" }}/>
                  <input
                    placeholder="NPN"
                    value={bridgeNpn}
                    onChange={e => setBridgeNpn(e.target.value)}
                    style={{ width: 100, padding: "4px 6px", fontSize: 12,
                      background: "var(--bg-raised)", border: "1px solid var(--border-default)",
                      borderRadius: 4, color: "var(--text-primary)" }}/>
                  <button className="btn btn-primary" onClick={saveBridge}
                    disabled={savingField === "bridge"} style={{ padding: "4px 8px", fontSize: 11 }}>
                    {savingField === "bridge" ? "…" : "Save"}
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => canEdit && setEditingBridge(true)}
                  style={{ cursor: canEdit ? "pointer" : "default", fontSize: 12,
                    color: appt?.bridge_under_name ? "var(--text-secondary)" : "var(--text-tertiary)" }}
                  title={canEdit ? "Click to edit bridge" : ""}>
                  {appt?.bridge_under_name || appt?.bridge_under_npn
                    ? <>Under: <span style={{ color: "var(--text-primary)" }}>{appt.bridge_under_name || "—"}</span>
                        {appt.bridge_under_npn ? ` (NPN ${appt.bridge_under_npn})` : ""}</>
                    : <span style={{ fontStyle: "italic" }}>+ add producer</span>}
                </div>
              )
            ) : (
              <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>—</span>
            )}
          </div>

          {/* Contracted-at */}
          <div>
            {canEdit ? (
              <input
                type="date" value={contractedDraft}
                onChange={e => { setContractedDraft(e.target.value); saveDate("contracted_at", e.target.value); }}
                disabled={savingField === "contracted_at"}
                style={{ width: "100%", padding: "4px 6px", fontSize: 11,
                  background: "var(--bg-raised)", border: "1px solid var(--border-default)",
                  borderRadius: 4, color: isSelf ? "var(--text-primary)" : "var(--text-tertiary)" }}/>
            ) : (
              <span className="mono" style={{ fontSize: 11 }}>{appt?.contracted_at || "—"}</span>
            )}
          </div>

          {/* Transferred-at */}
          <div>
            {canEdit ? (
              <input
                type="date" value={transferredDraft}
                onChange={e => { setTransferredDraft(e.target.value); saveDate("transferred_at", e.target.value); }}
                disabled={savingField === "transferred_at"}
                style={{ width: "100%", padding: "4px 6px", fontSize: 11,
                  background: "var(--bg-raised)", border: "1px solid var(--border-default)",
                  borderRadius: 4, color: appt?.transferred_at ? "var(--text-primary)" : "var(--text-tertiary)" }}/>
            ) : (
              <span className="mono" style={{ fontSize: 11 }}>{appt?.transferred_at || "—"}</span>
            )}
          </div>

          {/* Notes */}
          <div>
            {editingNotes ? (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={notesDraft}
                  onChange={e => setNotesDraft(e.target.value)}
                  placeholder="e.g. pending E&O"
                  style={{ flex: 1, minWidth: 0, padding: "4px 6px", fontSize: 12,
                    background: "var(--bg-raised)", border: "1px solid var(--border-default)",
                    borderRadius: 4, color: "var(--text-primary)" }}/>
                <button className="btn btn-primary" onClick={saveNotes}
                  disabled={savingField === "notes"} style={{ padding: "4px 8px", fontSize: 11 }}>
                  {savingField === "notes" ? "…" : "Save"}
                </button>
              </div>
            ) : (
              <div
                onClick={() => canEdit && setEditingNotes(true)}
                style={{ cursor: canEdit ? "pointer" : "default", fontSize: 12,
                  color: appt?.notes ? "var(--text-secondary)" : "var(--text-tertiary)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                title={canEdit ? (appt?.notes || "Click to add notes") : appt?.notes}>
                {appt?.notes || (canEdit ? <span style={{ fontStyle: "italic" }}>+ note</span> : "—")}
              </div>
            )}
          </div>

          {/* Action: Mark transferred */}
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, alignItems: "center" }}>
              <button
                className="icon-btn"
                title={login ? `Edit login — saved ${login._saved_at ? new Date(login._saved_at).toLocaleDateString() : ""}` : "Add producer-portal login"}
                onClick={() => onEditLogin?.(carrier)}
                style={{ color: login ? "var(--accent-money)" : "var(--text-tertiary)" }}
              >
                <Icons.Lock size={11}/>
              </button>
              {canEdit && isBridge && (
                <button
                  className="btn btn-ghost"
                  onClick={() => setTransferPrompt(true)}
                  title="Bridge complete: book transferred to your own appointment"
                  style={{ fontSize: 11, padding: "4px 8px" }}>
                  → self
                </button>
              )}
            </div>
          </div>
        </div>

        {transferPrompt && (
          <TransferModal
            carrier={carrier} appt={appt}
            onClose={() => setTransferPrompt(false)}
            onSaved={onMutate}/>
        )}
      </>
    );
  }

  /* ───── carrier_requests hook + modal ────────────────────────────────── */
  // Managers file a request when the carrier they want isn't in the global
  // catalog. Super-admin reviews and materializes the carriers row (so the
  // underwriting rules + narrative get added before reps can quote it —
  // CLAUDE.md guiding principle 5: no data without a source).
  function useCarrierRequests(agencyId) {
    const [requests, setRequests] = useState([]);
    const reload = useCallback(() => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !agencyId) { setRequests([]); return; }
      sb.from("carrier_requests")
        .select("id, carrier_name, carrier_url, category, status, notes, created_at, reviewer_notes, resolved_carrier_id")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data, error }) => {
          if (error) { console.warn("[carrier_requests]", error); setRequests([]); return; }
          setRequests(Array.isArray(data) ? data : []);
        });
    }, [agencyId]);
    useEffect(() => { reload(); }, [reload]);
    return [requests, reload];
  }

  function RequestCarrierModal({ agencyId, onClose, onSaved }) {
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [category, setCategory] = useState("life");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const save = async () => {
      if (!name.trim()) {
        window.toast && window.toast("Carrier name required", "warn");
        return;
      }
      setSaving(true);
      try {
        const sb = window.getSupabase && window.getSupabase();
        const { error } = await sb.from("carrier_requests").insert({
          agency_id: agencyId,
          carrier_name: name.trim(),
          carrier_url: url.trim() || null,
          category,
          notes: notes.trim() || null,
        });
        if (error) throw error;
        window.toast && window.toast(`Requested ${name.trim()} — pending review`, "success");
        onSaved && onSaved();
        onClose();
      } catch (e) {
        window.toast && window.toast(`Request failed: ${e.message || e}`, "error");
        console.warn("[carrier_request.insert]", e);
      } finally { setSaving(false); }
    };
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
          borderRadius: 8, padding: 20, width: 480, maxWidth: "90vw",
        }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            Request a new carrier
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14 }}>
            Not in the catalog? File a request. Super-admin reviews and adds
            the carrier with its underwriting rules so the quoter can score
            it correctly. You'll see <em>pending</em> until it's approved.
          </div>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
            Carrier name *
          </label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Liberty Bankers Life"
            style={{
              width: "100%", padding: "6px 8px", borderRadius: 4,
              background: "var(--bg-raised)", border: "1px solid var(--border-default)",
              color: "var(--text-primary)", fontSize: 13, marginBottom: 12,
            }}/>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
            Producer / quoter URL (optional)
          </label>
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://producer.libertybankerslife.com"
            style={{
              width: "100%", padding: "6px 8px", borderRadius: 4,
              background: "var(--bg-raised)", border: "1px solid var(--border-default)",
              color: "var(--text-primary)", fontSize: 13, marginBottom: 12,
            }}/>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
            Category
          </label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={{
              width: "100%", padding: "6px 8px", borderRadius: 4,
              background: "var(--bg-raised)", border: "1px solid var(--border-default)",
              color: "var(--text-primary)", fontSize: 13, marginBottom: 12,
            }}>
            <option value="life">Life</option>
            <option value="final_expense">Final Expense</option>
            <option value="med_supp">Med Supp</option>
            <option value="mapd">MAPD</option>
            <option value="annuity">Annuity</option>
            <option value="other">Other</option>
          </select>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
            Notes (which products / why)
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Need their GTL term — competitive in TX, ages 50-75"
            rows={3}
            style={{
              width: "100%", padding: "6px 8px", borderRadius: 4,
              background: "var(--bg-raised)", border: "1px solid var(--border-default)",
              color: "var(--text-primary)", fontSize: 13, marginBottom: 16,
              fontFamily: "inherit", resize: "vertical",
            }}/>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>
              {saving ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function CarrierRequestStrip({ requests }) {
    const pending = requests.filter(r => r.status === "pending");
    const recent  = requests.filter(r => r.status !== "pending").slice(0, 3);
    if (pending.length === 0 && recent.length === 0) return null;
    return (
      <div style={{
        margin: "0 0 12px", padding: 10, borderRadius: 4,
        background: "color-mix(in oklch, var(--accent-primary, #409cff) 6%, transparent)",
        border: "1px solid color-mix(in oklch, var(--accent-primary, #409cff) 28%, transparent)",
      }}>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Carrier requests
        </div>
        {pending.map(r => (
          <div key={r.id} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.carrier_name}</span>
            {" — "}
            <span style={{ color: "#ffa500" }}>pending review</span>
            {r.category ? ` · ${r.category}` : ""}
          </div>
        ))}
        {recent.map(r => (
          <div key={r.id} style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 2 }}>
            <span style={{ color: "var(--text-secondary)" }}>{r.carrier_name}</span>
            {" — "}
            <span style={{ color: r.status === "approved" ? "#2ecc71" : "var(--text-tertiary)" }}>
              {r.status}
            </span>
            {r.reviewer_notes ? ` · ${r.reviewer_notes}` : ""}
          </div>
        ))}
      </div>
    );
  }

  /* ───── main page ────────────────────────────────────────────────────── */
  function PageCarrierAppointments({ role }) {
    useAgencyReady();
    const carriers = useCarriers();
    const [appts, reload] = useAppointments();
    const me = (typeof window !== "undefined" && window.me && window.me()) || null;
    const agencyId = me?.agency_id || (window.getActiveAgencyId && window.getActiveAgencyId());
    const canEdit = ["owner", "admin", "imo_owner", "manager", "super_admin"].includes(role) ||
                    ["owner", "admin", "imo_owner", "manager", "super_admin"].includes(me?.role);

    const [filter, setFilter] = useState("all"); // all | self | bridge | pending | not_pursuing
    const [search, setSearch] = useState("");
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requests, reloadRequests] = useCarrierRequests(agencyId);
    const [loginVault, setLoginVault] = useState({});
    const [loginEditing, setLoginEditing] = useState(null);
    const [loginForm, setLoginForm] = useState({ username: "", password: "" });
    const [loginSaving, setLoginSaving] = useState(false);

    const reloadVault = useCallback(async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const r = await fetch("/api/agent/connector-list", {
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (!r.ok) return;
        const { connectors = [] } = await r.json();
        const next = {};
        for (const c of connectors) {
          if (!c.provider || !c.provider.startsWith("carrier_")) continue;
          const slug = c.provider.slice("carrier_".length);
          next[slug] = {
            username: c.account_metadata?.username || "",
            _has_password: true,
            _saved_at: c.connected_at,
          };
        }
        setLoginVault(next);
      } catch {}
    }, []);

    useEffect(() => { reloadVault(); }, [reloadVault]);

    // Map carrier_id → appt for fast lookup.
    const apptByCarrier = useMemo(() => {
      const m = {};
      (appts || []).forEach(a => { if (a.carrier_id) m[a.carrier_id] = a; });
      return m;
    }, [appts]);

    // Rollup counts for the filter chips.
    const counts = useMemo(() => {
      const out = { all: (carriers || []).length, self: 0, bridge: 0, pending: 0, not_pursuing: 0 };
      (carriers || []).forEach(c => {
        const s = apptByCarrier[c.id]?.status;
        if (!s) return;
        const k = s === "active" ? "self" : (out[s] != null ? s : null);
        if (!k) return;
        out[k] = (out[k] || 0) + 1;
      });
      return out;
    }, [carriers, apptByCarrier]);

    const rows = useMemo(() => {
      const list = carriers || [];
      const q = search.trim().toLowerCase();
      return list.filter(c => {
        if (q && !(c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))) return false;
        if (filter === "all") return true;
        const s = apptByCarrier[c.id]?.status;
        if (!s) return false;
        const norm = s === "active" ? "self" : s;
        return norm === filter;
      });
    }, [carriers, apptByCarrier, search, filter]);

    const openLoginEditor = (carrier) => {
      const slug = carrierLoginProvider(carrier);
      const existing = loginVault[slug] || {};
      setLoginForm({ username: existing.username || "", password: "" });
      setLoginEditing(carrier.id);
    };
    const closeLoginEditor = () => {
      setLoginEditing(null);
      setLoginForm({ username: "", password: "" });
    };
    const saveLogin = async (carrier) => {
      const slug = carrierLoginProvider(carrier);
      if (!loginForm.username.trim()) {
        window.toast && window.toast("Enter a username", "warn");
        return;
      }
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      setLoginSaving(true);
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { window.toast && window.toast("Sign in to save logins", "error"); return; }
        const existing = loginVault[slug] || {};
        const username = loginForm.username.trim();
        const password = loginForm.password.trim();
        if (!password && !existing._has_password) {
          window.toast && window.toast("Enter a password (or leave blank only if one is already saved)", "warn");
          return;
        }
        if (!password && existing._has_password) {
          if ((existing.username || "") !== username) {
            window.toast && window.toast("Enter the password to update the saved username", "warn");
            return;
          }
          window.toast && window.toast(`${carrier.name} login unchanged`, "success");
          closeLoginEditor();
          return;
        }
        if (password) {
          const r = await fetch("/api/agent/connector-upsert", {
            method: "POST",
            headers: {
              authorization: `Bearer ${session.access_token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              provider: `carrier_${slug}`,
              account_label: `Carrier portal · ${carrier.name}`,
              api_key: JSON.stringify({
                username,
                password,
                extra: {},
              }),
              metadata: { username },
            }),
          });
          if (!r.ok) throw new Error(await r.text().catch(() => "") || `HTTP ${r.status}`);
        }
        window.toast && window.toast(`${carrier.name} login saved`, "success");
        await reloadVault();
        closeLoginEditor();
      } catch (e) {
        window.toast && window.toast(`Save failed: ${e.message || e}`, "error");
      } finally {
        setLoginSaving(false);
      }
    };
    const clearLogin = async (carrier) => {
      const slug = carrierLoginProvider(carrier);
      if (!confirm(`Clear saved login for ${carrier.name}? Deletes the server-side credential row too.`)) return;
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      setLoginSaving(true);
      try {
        const { error } = await sb.from("connector_vault").delete().eq("provider", `carrier_${slug}`);
        if (error) throw error;
        window.toast && window.toast(`${carrier.name} login cleared`, "success");
        await reloadVault();
        closeLoginEditor();
      } catch (e) {
        window.toast && window.toast(`Clear failed: ${e.message || e}`, "error");
      } finally {
        setLoginSaving(false);
      }
    };

    if (!carriers || !appts) {
      return (
        <div className="panel" style={{ margin: 20 }}>
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            Loading carriers…
          </div>
        </div>
      );
    }

    return (
      <div style={{ padding: 20, maxWidth: 1280 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Carrier Appointments</h2>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {agencyId ? `Agency · ${me?.agency_name || agencyId.slice(0, 8)}` : "—"}
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, marginBottom: 16, maxWidth: 760 }}>
          Track which carriers you're contracted on directly and which you're writing under
          another producer's appointment (bridge). When a bridge contract converts to your own,
          flip the row to <em>Self</em> and record the transfer date so the book-of-business history is intact.
        </p>

        {/* Filter chips + search */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            ["all", "All"], ["self", "Self"], ["bridge", "Bridge"],
            ["pending", "Pending"], ["not_pursuing", "Not pursuing"],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{
                padding: "4px 10px", fontSize: 12, borderRadius: 999,
                border: `1px solid ${filter === k ? "var(--accent-primary, #409cff)" : "var(--border-default)"}`,
                background: filter === k ? "rgba(64,156,255,0.12)" : "transparent",
                color: filter === k ? "var(--accent-primary, #409cff)" : "var(--text-secondary)",
                cursor: "pointer",
              }}>
              {l} <span style={{ opacity: 0.6, marginLeft: 4 }}>{counts[k] ?? 0}</span>
            </button>
          ))}
          <div style={{ flex: 1 }}/>
          <input
            placeholder="Search carriers…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 220, padding: "5px 10px", fontSize: 12,
              background: "var(--bg-raised)", border: "1px solid var(--border-default)",
              borderRadius: 4, color: "var(--text-primary)" }}/>
          <button className="btn btn-ghost" onClick={reload}
            title="Refresh from database" style={{ fontSize: 11, padding: "4px 10px" }}>
            Refresh
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowRequestModal(true)}
              title="Request a carrier that isn't in the catalog yet"
              style={{ fontSize: 11, padding: "4px 10px" }}>
              + Request carrier
            </button>
          )}
        </div>

        <CarrierRequestStrip requests={requests}/>

        {!canEdit && (
          <div style={{ padding: 10, marginBottom: 12,
            background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.32)",
            borderRadius: 4, fontSize: 12, color: "var(--text-secondary)" }}>
            Read-only view. Ask an agency owner or admin to update carrier status.
          </div>
        )}

        {/* Table */}
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 150px 1.4fr 110px 110px 1fr 80px",
            gap: 10, padding: "8px 14px", background: "var(--bg-raised)",
            borderBottom: "1px solid var(--border-default)",
            fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
            textTransform: "uppercase", letterSpacing: 0.4,
          }}>
            <div>Carrier</div>
            <div>Status</div>
            <div>Bridge under</div>
            <div>Contracted</div>
            <div>Transferred</div>
            <div>Notes</div>
            <div></div>
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              {(carriers || []).length === 0
                ? "No carriers in catalog yet."
                : "No carriers match this filter."}
            </div>
          ) : (
            rows.map(c => (
              <React.Fragment key={c.id}>
                <CarrierRow
                  carrier={c}
                  appt={apptByCarrier[c.id]}
                  canEdit={canEdit}
                  agencyId={agencyId}
                  onMutate={reload}
                  loginVault={loginVault}
                  onEditLogin={openLoginEditor}/>
                {loginEditing === c.id && (
                  <div style={{
                    margin: "0 4px 8px",
                    padding: "12px 14px",
                    background: "color-mix(in oklch, var(--accent-money) 5%, var(--bg-raised))",
                    border: "1px solid color-mix(in oklch, var(--accent-money) 25%, transparent)",
                    borderRadius: 6,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Icons.Lock size={12} style={{ color: "var(--accent-money)" }}/>
                      <strong style={{ fontSize: 12.5 }}>Carrier portal login</strong>
                      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                        stored encrypted · per-user · used by live quote runs
                      </span>
                      <button className="icon-btn" style={{ marginLeft: "auto" }} title="Close" onClick={closeLoginEditor}>
                        <Icons.X size={11}/>
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
                      <Shared.Field label="Username">
                        <input
                          className="text-input"
                          value={loginForm.username}
                          onChange={(e) => setLoginForm(f => ({ ...f, username: e.target.value }))}
                          placeholder="producer.email@agency.com"
                          autoComplete="off"
                          autoFocus
                        />
                      </Shared.Field>
                      <Shared.Field label="Password">
                        <input
                          className="text-input"
                          type="password"
                          value={loginForm.password}
                          onChange={(e) => setLoginForm(f => ({ ...f, password: e.target.value }))}
                          placeholder={(loginVault[carrierLoginProvider(c)]?._has_password) ? "•••••••• (saved · type to replace)" : "password"}
                          autoComplete="new-password"
                          onKeyDown={(e) => { if (e.key === "Enter") saveLogin(c); if (e.key === "Escape") closeLoginEditor(); }}
                        />
                      </Shared.Field>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-primary" onClick={() => saveLogin(c)} disabled={loginSaving || !loginForm.username.trim()}>
                          <Icons.Check size={11}/> {loginSaving ? "Saving…" : "Save login"}
                        </button>
                        {loginVault[carrierLoginProvider(c)] && (
                          <button className="btn btn-ghost" onClick={() => clearLogin(c)} disabled={loginSaving} title="Delete saved login for this carrier">
                            <Icons.X size={10}/> Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                      Saved as <code style={{ fontSize: 10 }}>connector_vault.provider="carrier_{carrierLoginProvider(c).replace(/^carrier_/, "")}"</code>.
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))
          )}
        </div>

        {/* Footer helper */}
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-tertiary)" }}>
          Schema: <code>public.agency_carrier_appointments</code> · upsert by
          (agency_id, carrier_id) · RLS scoped via <code>viewer_agency_ids()</code>.
          Carrier missing? Use <strong>+ Request carrier</strong> — adds to
          <code> public.carrier_requests</code> for super-admin review.
        </div>

        {showRequestModal && (
          <RequestCarrierModal
            agencyId={agencyId}
            onClose={() => setShowRequestModal(false)}
            onSaved={reloadRequests}/>
        )}
      </div>
    );
  }

  window.PageCarrierAppointments = PageCarrierAppointments;
})();
