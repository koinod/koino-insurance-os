/* page-vault.jsx — File Vault: agency-scoped file storage + compliance artifact log.
   Reads from vault_files + vault_artifacts tables (RLS-scoped to agency).
   Actions: download (signed URL, 5-min TTL), share (24h signed link), delete (owner/mgr only).
   Upload: drag-drop or browse → Supabase vault storage bucket + vault_files row. */

(function () {
  const { useState, useEffect, useRef } = React;

  function useVaultData() {
    const [files,     setFiles]     = useState([]);
    const [artifacts, setArtifacts] = useState([]);
    const [loading,   setLoading]   = useState(true);

    const load = async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) { setLoading(false); return; }
      try {
        const [fr, ar] = await Promise.all([
          sb.from("vault_files").select("*").order("uploaded_at", { ascending: false }).limit(200),
          sb.from("vault_artifacts").select("*").order("created_at", { ascending: false }).limit(200),
        ]);
        setFiles(fr.data || []);
        setArtifacts(ar.data || []);
      } catch (_e) {}
      setLoading(false);
    };

    useEffect(() => {
      load();
      const fn = () => load();
      window.addEventListener("data:hydrated", fn);
      window.addEventListener("data:mutated",  fn);
      return () => {
        window.removeEventListener("data:hydrated", fn);
        window.removeEventListener("data:mutated",  fn);
      };
    }, []);

    return { files, setFiles, artifacts, loading, reload: load };
  }

  const fmtBytes = (b) => {
    if (b == null) return "—";
    if (b < 1024)           return `${b} B`;
    if (b < 1024 * 1024)    return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fmtDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  function PageVaultFiles({ role = "owner" }) {
    const { files, setFiles, artifacts, loading, reload } = useVaultData();
    const [uploads,    setUploads]    = useState([]);
    const [dragActive, setDragActive] = useState(false);
    const [shareUrl,   setShareUrl]   = useState(null);
    const fileInputRef = useRef(null);
    const canDelete = role === "owner" || role === "manager";

    const uploadFile = async (file) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return { ok: false, error: "no supabase" };
      const ext  = (file.name.split(".").pop() || "").toLowerCase();
      const path = `vault/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      try {
        const { error: upErr } = await sb.storage
          .from("vault").upload(path, file, { upsert: false, cacheControl: "3600" });
        if (upErr) throw upErr;
      } catch (e) { return { ok: false, error: e?.message || "upload failed" }; }
      try {
        await sb.from("vault_files").insert({
          name:         file.name,
          kind:         ext,
          size_bytes:   file.size,
          storage_path: path,
          uploaded_at:  new Date().toISOString(),
        });
      } catch (e) { return { ok: false, error: e?.message || "db write failed" }; }
      return { ok: true };
    };

    const handleFiles = async (fileList) => {
      const arr = Array.from(fileList || []);
      if (!arr.length) return;
      setUploads(arr.map(f => ({ name: f.name, status: "uploading" })));
      for (const f of arr) {
        const res = await uploadFile(f);
        setUploads(us => us.map(u =>
          u.name === f.name ? { ...u, status: res.ok ? "done" : "error", error: res.error } : u
        ));
      }
      await reload();
      window.toast && window.toast(`Uploaded ${arr.length} file${arr.length > 1 ? "s" : ""}`, "success");
      setTimeout(() => setUploads([]), 2500);
    };

    const downloadFile = async (f) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !f.storage_path) return;
      try {
        const { data } = await sb.storage.from("vault").createSignedUrl(f.storage_path, 300);
        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      } catch (_e) { window.toast && window.toast("Download failed", "danger"); }
    };

    const shareFile = async (f) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb || !f.storage_path) return;
      try {
        const { data } = await sb.storage.from("vault").createSignedUrl(f.storage_path, 86400);
        if (!data?.signedUrl) throw new Error("no url");
        setShareUrl(data.signedUrl);
        try {
          await navigator.clipboard.writeText(data.signedUrl);
          window.toast && window.toast("Share link copied (24h)", "success");
        } catch (_e) {
          window.toast && window.toast("Link generated — copy it below", "info");
        }
      } catch (_e) { window.toast && window.toast("Share failed", "danger"); }
    };

    const deleteFile = async (f) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      try {
        if (f.storage_path) await sb.storage.from("vault").remove([f.storage_path]);
        await sb.from("vault_files").delete().eq("id", f.id);
        setFiles(prev => prev.filter(x => x.id !== f.id));
        window.toast && window.toast("File deleted", "info");
      } catch (_e) { window.toast && window.toast("Delete failed", "danger"); }
    };

    const onDrop = (e) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
    };

    return (
      <div className="page-pad">
        <div className="page-h">
          <div>
            <div className="page-title">Vault</div>
            <div className="page-sub">Agency files · compliance artifacts · signed download links</div>
          </div>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            <Icons.Plus size={13}/> Upload files
          </button>
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}/>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: 22, marginBottom: 14,
            border: `1px dashed ${dragActive ? "var(--accent-money)" : "var(--border-subtle)"}`,
            borderRadius: 8, background: dragActive ? "var(--bg-overlay)" : "var(--bg-raised)",
            textAlign: "center", cursor: "pointer", transition: "all 0.15s",
          }}
        >
          <Icons.ArrowUp size={20} style={{ color: dragActive ? "var(--accent-money)" : "var(--text-tertiary)", marginBottom: 6 }}/>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {dragActive ? "Drop to upload" : "Drag files here, or click to browse"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
            PDFs, spreadsheets, recordings, rate sheets — stored in Supabase vault bucket
          </div>
        </div>

        {/* In-flight upload status */}
        {uploads.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {uploads.map(u => (
              <div key={u.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "var(--bg-raised)", borderRadius: 5, fontSize: 11.5 }}>
                <span className={`dot dot-${u.status === "done" ? "live" : u.status === "error" ? "danger" : "warn"}`}/>
                <span style={{ flex: 1 }} className="cell-truncate">{u.name}</span>
                <span style={{ color: "var(--text-tertiary)" }}>
                  {u.status === "uploading" ? "uploading…" : u.status === "done" ? "done" : (u.error || "error")}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Active share URL */}
        {shareUrl && (
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "var(--bg-raised)", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.ArrowUpRight size={12} style={{ color: "var(--accent-money)", flex: "0 0 auto" }}/>
            <input className="text-input" value={shareUrl} readOnly
              style={{ flex: 1, fontFamily: "var(--font-mono, monospace)", fontSize: 10.5 }}/>
            <button className="icon-btn" onClick={() => setShareUrl(null)}><Icons.X size={11}/></button>
          </div>
        )}

        {/* Files list */}
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-h">
            <Icons.Folder size={13}/>
            <h3>Files</h3>
            <span className="meta">{files.length} file{files.length !== 1 ? "s" : ""}</span>
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>
          ) : files.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>// vault · empty</code>
              <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                Upload files above or drag them in.
              </div>
            </div>
          ) : (
            <div className="list">
              <div className="list-h" style={{ gridTemplateColumns: "2fr 80px 90px 160px 120px 100px" }}>
                <div>Name</div>
                <div>Kind</div>
                <div className="tabular" style={{ textAlign: "right" }}>Size</div>
                <div>Uploaded</div>
                <div>By</div>
                <div></div>
              </div>
              {files.map(f => (
                <div key={f.id} className="row" style={{ gridTemplateColumns: "2fr 80px 90px 160px 120px 100px", height: 40 }}>
                  <div style={{ fontWeight: 500, minWidth: 0 }} className="cell-truncate">{f.name || "—"}</div>
                  <div><span className="chip" style={{ fontSize: 9.5 }}>{f.kind || "—"}</span></div>
                  <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{fmtBytes(f.size_bytes)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{fmtDate(f.uploaded_at)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }} className="cell-truncate">{f.uploaded_by || "—"}</div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="icon-btn" onClick={() => downloadFile(f)} title="Download (5-min link)">
                      <Icons.ArrowDown size={11}/>
                    </button>
                    <button className="icon-btn" onClick={() => shareFile(f)} title="Share (24h link)">
                      <Icons.Copy size={11}/>
                    </button>
                    {canDelete && (
                      <button className="icon-btn" onClick={() => deleteFile(f)} title="Delete"
                        style={{ color: "var(--state-danger)" }}>
                        <Icons.X size={11}/>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Compliance artifacts */}
        {(artifacts.length > 0 || !loading) && (
          <div className="panel">
            <div className="panel-h">
              <Icons.Shield size={13}/>
              <h3>Compliance artifacts</h3>
              <span className="meta">{artifacts.length}</span>
            </div>
            {artifacts.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center" }}>
                <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>// artifacts · empty</code>
              </div>
            ) : (
              <div className="list">
                <div className="list-h" style={{ gridTemplateColumns: "2fr 100px 160px 100px" }}>
                  <div>Lead / description</div>
                  <div>Kind</div>
                  <div>Captured</div>
                  <div>Status</div>
                </div>
                {artifacts.map(a => (
                  <div key={a.id} className="row" style={{ gridTemplateColumns: "2fr 100px 160px 100px", height: 38 }}>
                    <div style={{ fontWeight: 500 }} className="cell-truncate">{a.lead_name || a.description || "—"}</div>
                    <div><span className="chip" style={{ fontSize: 9.5 }}>{a.kind || "—"}</span></div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{fmtDate(a.created_at)}</div>
                    <div>
                      <span className={`chip ${a.status === "captured" ? "chip-money" : ""}`} style={{ fontSize: 9.5 }}>
                        {a.status || "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  window.PageVaultFiles = PageVaultFiles;
})();
