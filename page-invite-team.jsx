/* page-invite-team.jsx — full team invite + hierarchy management panel.
 *
 * Features:
 *   - Mint invite links with role, upline, label, expiry, max-use count
 *   - Permanent (no-expiry) links — one URL for an entire recruiting event
 *   - Multi-use links — e.g. "use up to 10 times"
 *   - Load existing agency invites from Supabase (persisted, not just session)
 *   - Revoke any invite in one click
 *   - Team hierarchy view — see producers, their uplines, move them
 */

(function () {

  function copyToClipboard(text) {
    try {
      navigator.clipboard.writeText(text);
      window.toast && window.toast("Invite link copied", "success");
    } catch {
      try { window.prompt("Copy this invite link:", text); } catch {}
    }
  }

  async function getJwt() {
    try {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  }

  /* ─── Status badge helper ─────────────────────────────────────────────── */
  function InviteStatus({ inv }) {
    const isRevoked  = !!inv.revoked_at;
    const isExpired  = !isRevoked && inv.expires_at && new Date(inv.expires_at) <= new Date();
    const isExhausted = !isRevoked && !isExpired && inv.max_uses != null && inv.use_count >= inv.max_uses;
    const isPending  = !isRevoked && !isExpired && !isExhausted;

    const label = isRevoked ? "revoked" : isExpired ? "expired" : isExhausted ? "used up" : "active";
    const cls   = isRevoked ? "chip chip-danger" : isExpired ? "chip" : isExhausted ? "chip" : "chip chip-money";
    return <span className={cls} style={{ fontSize: 10 }}>{label}</span>;
  }

  /* ─── Single invite row ────────────────────────────────────────────────── */
  function InviteRow({ inv, onRevoke, onCopy }) {
    const isActive = !inv.revoked_at && (!inv.expires_at || new Date(inv.expires_at) > new Date()) &&
                     (inv.max_uses == null || inv.use_count < inv.max_uses);
    const [revoking, setRevoking] = React.useState(false);

    const doRevoke = async () => {
      if (!window.confirm("Revoke this invite link? It will stop working immediately.")) return;
      setRevoking(true);
      await onRevoke(inv.token);
      setRevoking(false);
    };

    return (
      <div className="row" style={{
        gridTemplateColumns: "1.8fr 90px 80px 80px 100px 110px 80px",
        fontSize: 11.5, alignItems: "center"
      }}>
        {/* label / url */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {inv.label && <span style={{ fontWeight: 600, fontSize: 12 }}>{inv.label}</span>}
          <code style={{
            fontSize: 10, color: "var(--text-tertiary)",
            wordBreak: "break-all", lineHeight: 1.3
          }}>{inv.invite_url || `/?invite=${inv.token}`}</code>
        </div>
        {/* role */}
        <div><span className="chip" style={{ fontSize: 10 }}>{inv.role}</span></div>
        {/* status */}
        <div><InviteStatus inv={inv}/></div>
        {/* uses */}
        <div style={{ color: "var(--text-secondary)", textAlign: "center" }}>
          {inv.use_count ?? 0} / {inv.max_uses == null ? "∞" : inv.max_uses}
        </div>
        {/* expiry */}
        <div style={{ color: "var(--text-tertiary)" }}>
          {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "Never"}
        </div>
        {/* email hint */}
        <div style={{ color: "var(--text-tertiary)" }}>{inv.email_hint || "—"}</div>
        {/* actions */}
        <div style={{ display: "flex", gap: 4 }}>
          {isActive && (
            <button className="btn btn-ghost" style={{ padding: "2px 7px", fontSize: 10 }} onClick={() => onCopy(inv.invite_url || `/?invite=${inv.token}`)}>
              <Icons.Copy size={9}/> Copy
            </button>
          )}
          {isActive && (
            <button className="btn btn-ghost" style={{ padding: "2px 7px", fontSize: 10, color: "var(--state-danger)" }} disabled={revoking} onClick={doRevoke}>
              {revoking ? "…" : <Icons.X size={9}/>}
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ─── Hierarchy member row ────────────────────────────────────────────── */
  function HierarchyRow({ rep, uplineOptions, onMove }) {
    const [editing, setEditing] = React.useState(false);
    const [newUpline, setNewUpline] = React.useState(rep.upline_id || "");
    const [saving, setSaving]   = React.useState(false);

    const doMove = async () => {
      setSaving(true);
      await onMove(rep.id, newUpline);
      setSaving(false);
      setEditing(false);
    };

    return (
      <div className="row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr 90px", fontSize: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 500 }}>{rep.name}</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
          {uplineOptions.find(u => u.id === rep.upline_id)?.name || rep.upline_id || "— top level"}
        </div>
        <div>
          {editing ? (
            <select
              value={newUpline}
              onChange={e => setNewUpline(e.target.value)}
              style={{ fontSize: 11, padding: "3px 6px", background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", borderRadius: 4, color: "var(--text-primary)", width: "100%" }}
            >
              <option value="">— No upline (top level)</option>
              {uplineOptions.filter(u => u.id !== rep.id).map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          ) : (
            <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 10 }} onClick={() => { setNewUpline(rep.upline_id || ""); setEditing(true); }}>
              <Icons.Edit size={9}/> Move
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {editing && (
            <>
              <button className="btn btn-primary" style={{ padding: "2px 8px", fontSize: 10 }} disabled={saving} onClick={doMove}>
                {saving ? "…" : <><Icons.Check size={9}/> Save</>}
              </button>
              <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: 10 }} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ─── Main panel ─────────────────────────────────────────────────────── */
  function InviteTeamPanel() {
    const me = (window.me && window.me()) || null;

    // Form state
    const [role,        setRole]        = React.useState("rep");
    const [emailHint,   setEmailHint]   = React.useState("");
    const [uplineRepId, setUplineRepId] = React.useState(me?.rep_id || "");
    const [label,       setLabel]       = React.useState("");
    const [maxUses,     setMaxUses]     = React.useState("1");
    const [expiry,      setExpiry]      = React.useState("14d");
    const [busy,        setBusy]        = React.useState(false);
    const [errMsg,      setErrMsg]      = React.useState("");
    const [newLink,     setNewLink]     = React.useState(null);

    // Data
    const [invites,       setInvites]       = React.useState([]);
    const [invLoading,    setInvLoading]    = React.useState(true);
    const [allReps,       setAllReps]       = React.useState([]);
    const [tab,           setTab]           = React.useState("mint"); // "mint" | "manage" | "team"
    const [authedJwt,     setAuthedJwt]     = React.useState(null);

    const origin = window.location.origin;

    const perma = expiry === "perma";

    // Load JWT + invites + all reps
    React.useEffect(() => {
      if (!me?.agency_id) return;
      let cancelled = false;
      (async () => {
        const j = await getJwt();
        if (cancelled) return;
        setAuthedJwt(j);

        const sb = window.getSupabase && window.getSupabase();
        if (!sb) return;

        // Load all reps for hierarchy + dropdown
        const { data: repsData } = await sb
          .from("reps")
          .select("id, name, upline_id")
          .eq("agency_id", me.agency_id);
        if (!cancelled) setAllReps(repsData || []);

        // Load existing invites
        await loadInvites(sb, me.agency_id, cancelled, setInvites, setInvLoading);
      })();
      return () => { cancelled = true; };
    }, [me?.agency_id]);

    // Compute eligible uplines recursively if manager, or return all reps if owner
    const eligibleUplines = React.useMemo(() => {
      if (!me?.rep_id || !allReps || allReps.length === 0) return [];
      
      const isOwnerLike = ["owner", "super_admin", "admin", "imo_owner"].includes(me.role);
      if (isOwnerLike) {
        return allReps.map(r => ({ id: r.id, name: r.name || r.id }));
      }
      
      // If manager, compute downline recursively
      const downline = new Set();
      function visit(id) {
        if (downline.has(id)) return;
        downline.add(id);
        const children = allReps.filter(r => r.upline_id === id);
        for (const child of children) {
          visit(child.id);
        }
      }
      visit(me.rep_id);
      
      return allReps
        .filter(r => downline.has(r.id))
        .map(r => ({ id: r.id, name: r.name || r.id }));
    }, [me?.rep_id, me?.role, allReps]);

    const uplineOptions = React.useMemo(() => {
      const isOwnerLike = ["owner", "super_admin", "admin", "imo_owner"].includes(me?.role);
      const opts = [];
      if (isOwnerLike) {
        opts.push({ v: "none", l: "— No upline (top level)" });
      }
      opts.push({ v: me?.rep_id || "", l: `${me?.full_name || "You"} (you)` });
      
      for (const r of eligibleUplines) {
        if (r.id !== me?.rep_id) {
          opts.push({ v: r.id, l: r.name });
        }
      }
      return opts;
    }, [me, eligibleUplines]);

    // Reset upline when role changes
    React.useEffect(() => {
      setUplineRepId(me?.rep_id || "");
    }, [role, me?.rep_id]);

    if (!me) {
      return <div className="panel" style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading…</div>;
    }

    const ALLOWED = new Set(["owner","manager","super_admin","admin","imo_owner"]);
    if (!ALLOWED.has(me.role)) return null;
    const isDemoViewer = !!me.is_demo;

    /* ─── Load invites helper ─────────────────────────────────────────── */
    async function loadInvites(sb, agencyId, cancelled, setFn, setLoadingFn) {
      try {
        if (!sb) sb = window.getSupabase && window.getSupabase();
        if (!sb) return;
        setLoadingFn && setLoadingFn(true);
        const { data, error } = await sb
          .from("agency_invites")
          .select("token, role, email_hint, expires_at, used_at, use_count, max_uses, label, revoked_at, invited_by")
          .eq("agency_id", agencyId || me.agency_id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (!cancelled && !error) {
          setFn(data.map(inv => ({ ...inv, invite_url: `${origin}/?invite=${inv.token}` })));
        }
      } catch {} finally {
        setLoadingFn && setLoadingFn(false);
      }
    }

    /* ─── Generate link ───────────────────────────────────────────────── */
    const generate = async () => {
      if (emailHint && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailHint.trim())) {
        setErrMsg("Email hint looks malformed — fix it or leave it blank.");
        return;
      }
      setBusy(true); setErrMsg(""); setNewLink(null);
      try {
        const jwt = await getJwt();
        if (!jwt) throw new Error("Not signed in. Sign in as a manager first.");
        const parsedMax = parseInt(maxUses, 10);
        
        let expires_at = null;
        if (expiry !== "perma") {
          let durationMs = 14 * 24 * 60 * 60 * 1000;
          if (expiry === "1h") durationMs = 1 * 60 * 60 * 1000;
          else if (expiry === "1d") durationMs = 24 * 60 * 60 * 1000;
          else if (expiry === "7d") durationMs = 7 * 24 * 60 * 60 * 1000;
          else if (expiry === "14d") durationMs = 14 * 24 * 60 * 60 * 1000;
          else if (expiry === "30d") durationMs = 30 * 24 * 60 * 60 * 1000;
          expires_at = new Date(Date.now() + durationMs).toISOString();
        }

        const body = {
          agency_id:     me.agency_id,
          role,
          email_hint:    emailHint || null,
          upline_rep_id: (uplineRepId === "none" || !uplineRepId) ? null : uplineRepId,
          label:         label || null,
          max_uses:      perma ? null : (isNaN(parsedMax) || parsedMax < 1 ? 1 : parsedMax),
          perma,
          expires_at,
        };
        const r = await fetch("/api/invites/create", {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": `Bearer ${jwt}` },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
        setNewLink(data);
        window.toast && window.toast(`Invite link minted · ${role}`, "success");
        // Refresh list
        const sb = window.getSupabase && window.getSupabase();
        await loadInvites(sb, me.agency_id, false, setInvites, () => {});
      } catch (e) {
        setErrMsg(e.message || String(e));
      } finally {
        setBusy(false);
      }
    };

    /* ─── Revoke invite ───────────────────────────────────────────────── */
    const revokeInvite = async (token) => {
      try {
        const jwt = await getJwt();
        if (!jwt) throw new Error("Not signed in");
        const r = await fetch("/api/invites/revoke", {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": `Bearer ${jwt}` },
          body: JSON.stringify({ token }),
        });
        if (!r.ok) {
          const d = await r.json();
          throw new Error(d.detail || d.error || `HTTP ${r.status}`);
        }
        window.toast && window.toast("Invite revoked", "success");
        const sb = window.getSupabase && window.getSupabase();
        await loadInvites(sb, me.agency_id, false, setInvites, () => {});
      } catch (e) {
        window.toast && window.toast(e.message || "Revoke failed", "error");
      }
    };

    /* ─── Move rep in hierarchy ───────────────────────────────────────── */
    const moveRep = async (repId, newUplineId) => {
      try {
        const sb = window.getSupabase && window.getSupabase();
        if (!sb) throw new Error("No Supabase");
        const { error } = await sb
          .from("reps")
          .update({ upline_id: newUplineId || null })
          .eq("id", repId)
          .eq("agency_id", me.agency_id);
        if (error) throw new Error(error.message);
        setAllReps(prev => prev.map(r => r.id === repId ? { ...r, upline_id: newUplineId || null } : r));
        window.toast && window.toast("Upline updated", "success");
      } catch (e) {
        window.toast && window.toast(e.message || "Move failed", "error");
      }
    };

    /* ─── Counts ──────────────────────────────────────────────────────── */
    const activeCount  = invites.filter(i => !i.revoked_at && (!i.expires_at || new Date(i.expires_at) > new Date()) && (i.max_uses == null || i.use_count < i.max_uses)).length;
    const permaCount   = invites.filter(i => !i.revoked_at && !i.expires_at).length;
    const revokedCount = invites.filter(i => !!i.revoked_at).length;

    const tabStyle = (k) => ({
      padding: "5px 12px",
      fontSize: 12,
      fontWeight: tab === k ? 600 : 400,
      color: tab === k ? "var(--text-primary)" : "var(--text-tertiary)",
      background: tab === k ? "var(--bg-raised)" : "transparent",
      border: "none",
      borderRadius: 5,
      cursor: "pointer",
    });

    return (
      <div className="panel" style={{ marginBottom: 14 }}>
        {/* Header */}
        <div className="panel-h">
          <Icons.UserPlus size={13} style={{ color: "var(--accent-money)" }}/>
          <h3>Team Invites & Hierarchy</h3>
          <span className="meta">{activeCount} active · {permaCount} permanent · {invites.length} total</span>
        </div>

        {/* Demo warning */}
        {isDemoViewer && (
          <div style={{ margin: "12px 14px 0", padding: 10, background: "color-mix(in oklch, var(--state-warning) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--state-warning) 30%, transparent)", borderRadius: 6, color: "var(--state-warning)", fontSize: 12, lineHeight: 1.5 }}>
            <Icons.Shield size={12}/> You're in demo mode — invites won't persist. Sign in with your real account.
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, padding: "10px 14px 0", borderBottom: "1px solid var(--border-subtle)", paddingBottom: 10 }}>
          <button style={tabStyle("mint")} onClick={() => setTab("mint")}>Mint Link</button>
          <button style={tabStyle("manage")} onClick={() => { setTab("manage"); }}>
            Manage Links {activeCount > 0 && <span className="chip chip-money" style={{ fontSize: 9, marginLeft: 4 }}>{activeCount}</span>}
          </button>
          <button style={tabStyle("team")} onClick={() => setTab("team")}>Team Hierarchy</button>
        </div>

        {/* ── Mint tab ─────────────────────────────────────────────────── */}
        {tab === "mint" && (
          <div style={{ padding: 14 }}>
            {/* Row 1: role + upline + label */}
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Shared.Field label="Role">
                <Shared.Select
                  value={role}
                  onChange={setRole}
                  options={[
                    { v: "rep",     l: "Producer (Rep)" },
                    { v: "manager", l: "Manager" },
                  ]}
                />
              </Shared.Field>
              <Shared.Field label="Upline (reports to)">
                <Shared.Select
                  value={uplineRepId}
                  onChange={setUplineRepId}
                  options={uplineOptions}
                />
              </Shared.Field>
              <Shared.Field label="Link label (optional)">
                <input className="text-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. June Recruiting Event"/>
              </Shared.Field>
            </div>

            {/* Row 2: email hint + max uses + perma toggle */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", gap: 10, marginBottom: 12, alignItems: "end" }}>
              <Shared.Field label="Email (optional — pre-fill hint)">
                <input className="text-input" value={emailHint} onChange={e => setEmailHint(e.target.value)} placeholder="john@example.com"/>
              </Shared.Field>
              <Shared.Field label="Max uses">
                <Shared.Select
                  value={maxUses}
                  onChange={setMaxUses}
                  options={[
                    { v: "1",         l: "1 — single use" },
                    { v: "5",         l: "5 uses" },
                    { v: "10",        l: "10 uses" },
                    { v: "25",        l: "25 uses" },
                    { v: "unlimited", l: "Unlimited" },
                  ]}
                />
              </Shared.Field>
              <Shared.Field label="Expiry">
                <Shared.Select
                  value={expiry}
                  onChange={setExpiry}
                  options={[
                    { v: "1h",    l: "1 hour" },
                    { v: "1d",    l: "1 day" },
                    { v: "7d",    l: "7 days" },
                    { v: "14d",   l: "14 days (default)" },
                    { v: "30d",   l: "30 days" },
                    { v: "perma", l: "Never expires" },
                  ]}
                />
              </Shared.Field>
            </div>

            {/* Permanent link callout */}
            {perma && (
              <div style={{ marginBottom: 10, padding: 10, background: "color-mix(in oklch, var(--accent-money) 8%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 25%, transparent)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <Icons.Network size={11} style={{ marginRight: 4 }}/> <strong>Permanent link</strong> — this URL will work forever until you revoke it. Great for QR codes on recruiting materials or your recruiting website.
              </div>
            )}

            {errMsg && (
              <div style={{ marginBottom: 10, padding: 10, background: "color-mix(in oklch, var(--state-danger) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--state-danger) 30%, transparent)", borderRadius: 6, color: "var(--state-danger)", fontSize: 12 }}>
                {errMsg}
              </div>
            )}

            <button className="btn btn-primary" disabled={busy || (isDemoViewer)} onClick={generate} style={{ minWidth: 140 }}>
              {busy ? "Generating…" : <><Icons.UserPlus size={11}/> Generate invite link</>}
            </button>

            {/* New link result */}
            {newLink && (
              <div style={{ marginTop: 14, padding: 12, background: "color-mix(in oklch, var(--accent-money) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent-money) 30%, transparent)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                  Invite link minted · {newLink.role} · {newLink.perma ? "permanent" : `expires ${new Date(newLink.expires_at).toLocaleDateString()}`}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <code style={{ flex: 1, fontSize: 11, padding: "6px 10px", background: "var(--bg-raised)", borderRadius: 4, wordBreak: "break-all" }}>{newLink.invite_url}</code>
                  <button className="btn btn-primary" onClick={() => copyToClipboard(newLink.invite_url)}>
                    <Icons.Copy size={11}/> Copy
                  </button>
                </div>
                {newLink.label && (
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>Label: {newLink.label}</div>
                )}
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  Share this link. They click → sign in → land in your agency as <strong>{newLink.role}</strong> automatically.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Manage tab ───────────────────────────────────────────────── */}
        {tab === "manage" && (
          <div>
            {invLoading ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading invites…</div>
            ) : invites.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>No invites yet — mint one in the "Mint Link" tab.</div>
            ) : (
              <div className="list">
                <div className="list-h" style={{ gridTemplateColumns: "1.8fr 90px 80px 80px 100px 110px 80px", fontSize: 10.5 }}>
                  <div>Link / Label</div>
                  <div>Role</div>
                  <div>Status</div>
                  <div style={{ textAlign: "center" }}>Uses</div>
                  <div>Expires</div>
                  <div>Email hint</div>
                  <div>Actions</div>
                </div>
                {invites.map(inv => (
                  <InviteRow
                    key={inv.token}
                    inv={inv}
                    onRevoke={revokeInvite}
                    onCopy={copyToClipboard}
                  />
                ))}
              </div>
            )}

            {revokedCount > 0 && (
              <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}>
                {revokedCount} revoked link{revokedCount !== 1 ? "s" : ""} hidden from the active view.
              </div>
            )}
          </div>
        )}

        {/* ── Team hierarchy tab ───────────────────────────────────────── */}
        {tab === "team" && (
          <div>
            {allReps.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>No producers in this agency yet.</div>
            ) : (
              <>
                <div style={{ padding: "10px 14px 4px", fontSize: 11, color: "var(--text-tertiary)" }}>
                  Move producers between uplines. Changes take effect immediately.
                </div>
                <div className="list">
                  <div className="list-h" style={{ gridTemplateColumns: "1.4fr 1fr 1fr 90px", fontSize: 10.5 }}>
                    <div>Producer</div>
                    <div>Current upline</div>
                    <div>Change upline</div>
                    <div>Actions</div>
                  </div>
                  {allReps.map(rep => (
                    <HierarchyRow
                      key={rep.id}
                      rep={rep}
                      uplineOptions={allReps}
                      onMove={moveRep}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  window.InviteTeamPanel = InviteTeamPanel;
})();
