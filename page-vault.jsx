/* page-vault.jsx — Unified Vault: storage files + library resources in one surface.
   Sources merged:
     · vault_files   (Supabase storage bucket — drag-drop upload, signed download/share)
     · AppData.DOCS  (agency_docs — all library docs, including vault uploads cross-registered)
     · AppData.SCRIPTS_LIB (agency_scripts — call scripts)
     · AppData.VIDEOS (agency_videos — training videos with inline player)

   Viewing: any file type opens inline — images, PDFs, video, text/code, Google Docs.
   Editing: scripts + docs editable for owner/manager; inline modal editor.
   Upload: drag-drop or browse → vault bucket + agency_docs row (so it appears in library). */

(function () {
  const { useState, useEffect, useRef, useMemo } = React;

  // ─── AppData live subscription ────────────────────────────────────────────
  function useAppData() {
    const [, force] = useState(0);
    useEffect(() => {
      const fn = () => force(n => n + 1);
      window.addEventListener("data:hydrated", fn);
      window.addEventListener("data:mutated",  fn);
      window.addEventListener("data:realtime", fn);
      return () => {
        window.removeEventListener("data:hydrated", fn);
        window.removeEventListener("data:mutated",  fn);
        window.removeEventListener("data:realtime", fn);
      };
    }, []);
  }

  // ─── vault_files direct Supabase load ────────────────────────────────────
  function useVaultFiles() {
    const [files,   setFiles]   = useState([]);
    const [loading, setLoading] = useState(true);
    const reload = async () => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) { setLoading(false); return; }
      try {
        const { data } = await sb.from("vault_files")
          .select("*").order("uploaded_at", { ascending: false }).limit(300);
        setFiles(data || []);
      } catch (_e) {}
      setLoading(false);
    };
    useEffect(() => {
      reload();
      const fn = () => reload();
      window.addEventListener("data:hydrated", fn);
      window.addEventListener("data:mutated",  fn);
      return () => {
        window.removeEventListener("data:hydrated", fn);
        window.removeEventListener("data:mutated",  fn);
      };
    }, []);
    return { files, setFiles, loading, reload };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────
  const fmtBytes = (b) => {
    if (b == null) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };
  const fmtDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };
  const extOf = (item) =>
    (item.kind || item.ext || (item.name || "").split(".").pop() || "").toLowerCase().replace(/^\./, "");

  const SCRIPT_CATS  = ["Open", "Discovery", "Cross-sell", "Compliance"];
  const DOC_CATS     = ["Compliance", "Carrier", "Training", "Internal"];
  const VIDEO_CATS   = ["Med Supp", "Final Expense", "Compliance", "Sales", "Training"];

  // ─── Signed-URL resolver ─────────────────────────────────────────────────
  async function resolveUrl(item) {
    const sb = window.getSupabase && window.getSupabase();
    // Already have a usable URL
    if (item.url && !item.storagePath) return item.url;
    // Need signed URL from storage
    const path = item.storage_path || item.storagePath;
    if (path && sb) {
      const bucket = item._bucket || "vault";
      const { data } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
      return data?.signedUrl || item.url || null;
    }
    return item.url || null;
  }

  // ─── File Viewer modal ────────────────────────────────────────────────────
  function FileViewer({ item, onClose }) {
    const [url,  setUrl]  = useState(item.url || null);
    const [text, setText] = useState(null);
    const ext = extOf(item);

    const isImage = ["png","jpg","jpeg","gif","svg","webp","avif"].includes(ext);
    const isPDF   = ext === "pdf";
    const isVideo = ["mp4","webm","mov","avi","mkv"].includes(ext) || !!item.src;
    const isAudio = ["mp3","wav","ogg","m4a","aac"].includes(ext);
    const isText  = ["txt","md","json","csv","xml","js","jsx","ts","tsx","html","css","yaml","yml","sh","py"].includes(ext);
    const isGdoc  = item.kind === "gdoc" || (item.url && /docs\.google\.com/.test(item.url || ""));

    useEffect(() => {
      let alive = true;
      resolveUrl(item).then(u => { if (alive) setUrl(u); });
      return () => { alive = false; };
    }, [item.id]);

    useEffect(() => {
      if (!isText || !url) return;
      let alive = true;
      fetch(url).then(r => r.text()).then(t => { if (alive) setText(t); }).catch(() => { if (alive) setText(null); });
      return () => { alive = false; };
    }, [isText, url]);

    const renderBody = () => {
      if (!url && !item.src) {
        return <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>No URL available — upload may still be processing.</div>;
      }
      const src = item.src || url;
      if (isVideo) {
        // YouTube / Vimeo embed
        const ytMatch = src && src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
        const viMatch = src && src.match(/vimeo\.com\/(\d+)/);
        if (ytMatch) return <iframe src={`https://www.youtube.com/embed/${ytMatch[1]}`} style={{ width: "100%", height: "56vh", border: 0 }} allowFullScreen title="Video"/>;
        if (viMatch) return <iframe src={`https://player.vimeo.com/video/${viMatch[1]}`} style={{ width: "100%", height: "56vh", border: 0 }} allowFullScreen title="Video"/>;
        return <video src={src} controls style={{ width: "100%", maxHeight: "56vh" }}/>;
      }
      if (isAudio) return <audio src={src} controls style={{ width: "100%", marginTop: 20 }}/>;
      if (isImage) return <img src={src} alt={item.title || item.name} style={{ maxWidth: "100%", maxHeight: "70vh", display: "block", margin: "0 auto", borderRadius: 4 }}/>;
      if (isPDF) return (
        <iframe src={src} title={item.title || item.name} style={{ width: "100%", height: "72vh", border: 0, borderRadius: 4 }}/>
      );
      if (isGdoc) {
        const embedSrc = (url || "").replace(/\/(edit|view)(\?.*)?$/, "/preview");
        return <iframe src={embedSrc} title={item.title} style={{ width: "100%", height: "70vh", border: 0, borderRadius: 4 }}/>;
      }
      if (isText && text !== null) {
        return (
          <pre style={{ margin: 0, padding: 16, maxHeight: "60vh", overflow: "auto", fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--bg-overlay)", borderRadius: 6, color: "var(--text-secondary)" }}>
            {text}
          </pre>
        );
      }
      if (isText) {
        return <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12.5 }}>Loading…</div>;
      }
      // Unknown type — offer download
      return (
        <div style={{ padding: 50, textAlign: "center" }}>
          <Icons.FileText size={28} style={{ color: "var(--text-quaternary)", marginBottom: 12 }}/>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16 }}>
            No inline preview for <strong style={{ color: "var(--text-secondary)" }}>.{ext || "this file type"}</strong>
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            <Icons.ArrowDown size={13}/> Download to view
          </a>
        </div>
      );
    };

    return (
      <Shared.Modal title={item.title || item.name || "File"} width={960} onClose={onClose}>
        <div style={{ marginTop: -4 }}>{renderBody()}</div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", fontSize: 11.5, color: "var(--text-tertiary)" }}>
          {item.cat && <span className="chip">{item.cat}</span>}
          {ext && <span className="chip" style={{ fontSize: 9.5 }}>{ext}</span>}
          {item.sizeBytes && <span>{fmtBytes(item.sizeBytes)}</span>}
          {item.durMin > 0 && <span><Icons.Clock size={10}/> {item.durMin} min</span>}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 11 }}>
              <Icons.ArrowUpRight size={11}/> Open in new tab
            </a>
          )}
        </div>
      </Shared.Modal>
    );
  }

  // ─── Script Editor modal ──────────────────────────────────────────────────
  function ScriptEditor({ script, onClose }) {
    const isNew = !script.id;
    const [title,   setTitle]   = useState(script.title   || "");
    const [cat,     setCat]     = useState(script.cat     || "Open");
    const [version, setVersion] = useState(script.version || "v1.0");
    const [body,    setBody]    = useState(script.body    || "");
    const [saving,  setSaving]  = useState(false);

    const save = async () => {
      if (!title.trim() || !body.trim()) return;
      setSaving(true);
      try {
        await window.AppData.mutate.scriptUpsert({ id: script.id, title: title.trim(), cat, version: version.trim(), body: body.trim() });
        window.toast && window.toast(isNew ? "Script added" : "Script saved", "success");
        onClose();
      } catch (_e) {
        window.toast && window.toast("Save failed", "danger");
      } finally { setSaving(false); }
    };

    return (
      <Shared.Modal title={isNew ? "New script" : "Edit script"} width={740} onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 100px", gap: 8 }}>
            <Shared.Field label="Title">
              <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Med Supp Plan G open" autoFocus/>
            </Shared.Field>
            <Shared.Field label="Category">
              <Shared.Select value={cat} onChange={setCat} options={SCRIPT_CATS.map(c => ({ v: c, l: c }))}/>
            </Shared.Field>
            <Shared.Field label="Version">
              <input className="text-input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.0"/>
            </Shared.Field>
          </div>
          <Shared.Field label="Script body">
            <textarea className="text-input" value={body} onChange={(e) => setBody(e.target.value)}
              style={{ height: 260, resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: 12, lineHeight: 1.6 }}
              placeholder="Write your script here. Use {{lead_name}}, {{rep_first}}, {{agency}} as substitution tokens."/>
          </Shared.Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim() || !body.trim()}>
              {saving ? "Saving…" : isNew ? "Add script" : "Save changes"}
            </button>
          </div>
        </div>
      </Shared.Modal>
    );
  }

  // ─── Doc Editor modal ─────────────────────────────────────────────────────
  function DocEditor({ doc, onClose }) {
    const isNew = !doc.id;
    const [title, setTitle] = useState(doc.title || "");
    const [cat,   setCat]   = useState(doc.cat   || "Internal");
    const [url,   setUrl]   = useState(doc.url   || "");
    const [saving, setSaving] = useState(false);

    const save = async () => {
      if (!title.trim()) return;
      setSaving(true);
      try {
        const safeUrl = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : "";
        await window.AppData.mutate.docUpsert({ id: doc.id, title: title.trim(), cat, url: safeUrl, kind: doc.kind || "link" });
        window.toast && window.toast(isNew ? "Doc added" : "Doc saved", "success");
        onClose();
      } catch (_e) {
        window.toast && window.toast("Save failed", "danger");
      } finally { setSaving(false); }
    };

    return (
      <Shared.Modal title={isNew ? "New document" : "Edit document"} width={600} onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 8 }}>
            <Shared.Field label="Title">
              <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scope of Appointment (CMS)" autoFocus/>
            </Shared.Field>
            <Shared.Field label="Category">
              <Shared.Select value={cat} onChange={setCat} options={DOC_CATS.map(c => ({ v: c, l: c }))}/>
            </Shared.Field>
          </div>
          <Shared.Field label="URL (leave blank for uploaded files)">
            <input className="text-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/… or any URL"
              disabled={doc.kind === "upload"}/>
          </Shared.Field>
          {doc.kind === "upload" && (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Uploaded files — URL managed by storage. Edit title and category only.</div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim()}>
              {saving ? "Saving…" : isNew ? "Add document" : "Save changes"}
            </button>
          </div>
        </div>
      </Shared.Modal>
    );
  }

  // ─── Video Editor modal ───────────────────────────────────────────────────
  function VideoEditor({ video, onClose }) {
    const isNew = !video.id;
    const [title,  setTitle]  = useState(video.title  || "");
    const [cat,    setCat]    = useState(video.cat    || "Training");
    const [src,    setSrc]    = useState(video.src    || "");
    const [durMin, setDurMin] = useState(video.durMin || "");
    const [saving, setSaving] = useState(false);

    const save = async () => {
      if (!title.trim() || !src.trim()) return;
      setSaving(true);
      try {
        // Auto-derive YouTube thumb
        const ytMatch = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
        const thumb = ytMatch ? `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg` : "";
        await window.AppData.mutate.videoUpsert({ id: video.id, title: title.trim(), cat, src: src.trim(), thumb, durMin: +durMin || 0 });
        window.toast && window.toast(isNew ? "Video added" : "Video saved", "success");
        onClose();
      } catch (_e) {
        window.toast && window.toast("Save failed", "danger");
      } finally { setSaving(false); }
    };

    return (
      <Shared.Modal title={isNew ? "Add training video" : "Edit video"} width={600} onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Shared.Field label="Title">
            <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Plan G open pitch — UHC" autoFocus/>
          </Shared.Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 8 }}>
            <Shared.Field label="Video URL (YouTube, Vimeo, or direct MP4)">
              <input className="text-input" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="https://youtube.com/watch?v=…"/>
            </Shared.Field>
            <Shared.Field label="Category">
              <Shared.Select value={cat} onChange={setCat} options={VIDEO_CATS.map(c => ({ v: c, l: c }))}/>
            </Shared.Field>
            <Shared.Field label="Minutes">
              <input className="text-input" type="number" value={durMin} onChange={(e) => setDurMin(e.target.value)} placeholder="12"/>
            </Shared.Field>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim() || !src.trim()}>
              {saving ? "Saving…" : isNew ? "Add video" : "Save changes"}
            </button>
          </div>
        </div>
      </Shared.Modal>
    );
  }

  // ─── Upload handler ───────────────────────────────────────────────────────
  async function uploadFileToVault(file) {
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) return { ok: false, error: "no supabase" };
    const ext  = (file.name.split(".").pop() || "").toLowerCase();
    const path = `vault/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    try {
      const { error: upErr } = await sb.storage.from("vault").upload(path, file, { upsert: false, cacheControl: "3600" });
      if (upErr) throw upErr;
    } catch (e) { return { ok: false, error: e?.message || "upload failed" }; }
    // Cross-register in agency_docs so it shows up in library
    const { data: urlData } = sb.storage.from("vault").getPublicUrl(path);
    const catGuess = (() => {
      const lc = file.name.toLowerCase();
      if (/soa|tpmo|cms|hipaa|compliance/.test(lc)) return "Compliance";
      if (/rate|carrier|plan/.test(lc))             return "Carrier";
      if (/script|training|ahip|guide/.test(lc))    return "Training";
      return "Internal";
    })();
    try {
      await window.AppData.mutate.docUpsert({
        title: file.name, cat: catGuess, url: urlData?.publicUrl || "",
        kind: "upload", ext, sizeBytes: file.size, storagePath: path,
      });
    } catch (_e) {}
    // Also insert into vault_files for the storage tab
    try {
      await sb.from("vault_files").insert({
        name: file.name, kind: ext, size_bytes: file.size,
        storage_path: path, uploaded_at: new Date().toISOString(),
      });
    } catch (_e) {}
    return { ok: true };
  }

  // ─── TABS ─────────────────────────────────────────────────────────────────
  const VAULT_TABS = [
    { k: "all",     l: "All",     icon: "Search"   },
    { k: "files",   l: "Files",   icon: "Folder"   },
    { k: "scripts", l: "Scripts", icon: "FileText" },
    { k: "videos",  l: "Videos",  icon: "Video"    },
    { k: "docs",    l: "Docs",    icon: "Book"     },
  ];

  // ─── Main component ───────────────────────────────────────────────────────
  function PageVaultFiles({ role = "owner" }) {
    useAppData();
    const { files, setFiles, loading: filesLoading, reload: reloadFiles } = useVaultFiles();
    const [tab,        setTab]        = useState("all");
    const [q,          setQ]          = useState("");
    const [uploads,    setUploads]    = useState([]);
    const [dragActive, setDragActive] = useState(false);
    const [viewing,    setViewing]    = useState(null);  // item to view
    const [editScript, setEditScript] = useState(null);  // script to edit
    const [editDoc,    setEditDoc]    = useState(null);  // doc to edit
    const [editVideo,  setEditVideo]  = useState(null);  // video to edit
    const [shareUrl,   setShareUrl]   = useState(null);
    const fileInputRef = useRef(null);

    const canEdit = role === "owner" || role === "manager";

    // AppData sources
    const scripts  = (window.AppData && window.AppData.SCRIPTS_LIB) || [];
    const videos   = (window.AppData && window.AppData.VIDEOS)      || [];
    const docs     = (window.AppData && window.AppData.DOCS)        || [];

    // Search filter
    const ql = q.trim().toLowerCase();
    const match = (s) => !ql || (s || "").toLowerCase().includes(ql);
    const fScripts = scripts.filter(s => match(s.title) || match(s.cat) || match(s.body));
    const fVideos  = videos.filter(v  => match(v.title) || match(v.cat));
    const fDocs    = docs.filter(d    => match(d.title) || match(d.cat) || match(d.text));
    const fFiles   = files.filter(f   => match(f.name)  || match(f.kind));

    const tabCounts = {
      all:     fScripts.length + fVideos.length + fDocs.length + fFiles.length,
      files:   fFiles.length,
      scripts: fScripts.length,
      videos:  fVideos.length,
      docs:    fDocs.length,
    };

    // Upload files
    const handleFiles = async (fileList) => {
      const arr = Array.from(fileList || []);
      if (!arr.length) return;
      setUploads(arr.map(f => ({ name: f.name, status: "uploading" })));
      for (const f of arr) {
        const res = await uploadFileToVault(f);
        setUploads(us => us.map(u =>
          u.name === f.name ? { ...u, status: res.ok ? "done" : "error", error: res.error } : u
        ));
      }
      await reloadFiles();
      window.toast && window.toast(`Uploaded ${arr.length} file${arr.length > 1 ? "s" : ""}`, "success");
      setTimeout(() => setUploads([]), 3000);
    };

    // Delete vault_file + its agency_docs cross-registration
    const deleteVaultFile = async (f) => {
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      try {
        if (f.storage_path) await sb.storage.from("vault").remove([f.storage_path]);
        await sb.from("vault_files").delete().eq("id", f.id);
        setFiles(prev => prev.filter(x => x.id !== f.id));
        // Also remove matching agency_docs entry
        const match = docs.find(d => d.storagePath === f.storage_path);
        if (match?.id) {
          try { await window.AppData.mutate.docDelete(match.id); } catch (_e) {}
        }
        window.toast && window.toast("File deleted", "info");
      } catch (_e) { window.toast && window.toast("Delete failed", "danger"); }
    };

    // Share via signed URL
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
        } catch (_e) {}
      } catch (_e) { window.toast && window.toast("Share failed", "danger"); }
    };

    const onDrop = (e) => {
      e.preventDefault(); setDragActive(false);
      if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
    };

    return (
      <div className="page-pad">
        {/* Header */}
        <div className="page-h">
          <div>
            <div className="page-title">Vault</div>
            <div className="page-sub">
              Files · scripts · training videos · docs — unified view, inline previews
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <input className="text-input" style={{ width: 240 }}
              placeholder="Search everything…"
              value={q} onChange={(e) => setQ(e.target.value)}/>
            {q && <button className="btn btn-ghost" onClick={() => setQ("")} style={{ padding: "4px 8px" }}>Clear</button>}
            {canEdit && (
              <>
                <button className="btn btn-ghost" onClick={() => setEditScript({})}>
                  <Icons.Plus size={12}/> Script
                </button>
                <button className="btn btn-ghost" onClick={() => setEditVideo({})}>
                  <Icons.Plus size={12}/> Video
                </button>
                <button className="btn btn-ghost" onClick={() => setEditDoc({})}>
                  <Icons.Plus size={12}/> Doc
                </button>
              </>
            )}
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
              <Icons.ArrowUp size={12}/> Upload
            </button>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }}
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}/>
          </div>
        </div>

        {/* Dropzone — always visible, no border unless dragging */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={dragActive ? undefined : () => fileInputRef.current?.click()}
          style={{
            padding: dragActive ? 22 : 12, marginBottom: 12,
            border: `1px dashed ${dragActive ? "var(--accent-money)" : "var(--border-subtle)"}`,
            borderRadius: 8,
            background: dragActive ? "color-mix(in oklch, var(--accent-money) 6%, var(--bg-raised))" : "transparent",
            textAlign: "center", cursor: "pointer", transition: "all 0.12s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            color: dragActive ? "var(--accent-money)" : "var(--text-quaternary)",
          }}
        >
          <Icons.ArrowUp size={dragActive ? 18 : 14} style={{ flexShrink: 0 }}/>
          <span style={{ fontSize: dragActive ? 13 : 12 }}>
            {dragActive ? "Drop files to upload" : "Drag & drop any file to upload — PDFs, images, spreadsheets, recordings"}
          </span>
        </div>

        {/* Upload in-flight status */}
        {uploads.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
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

        {/* Shared URL strip */}
        {shareUrl && (
          <div style={{ marginBottom: 10, padding: "8px 12px", background: "var(--bg-raised)", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.Copy size={11} style={{ color: "var(--accent-money)", flex: "0 0 auto" }}/>
            <input className="text-input" value={shareUrl} readOnly style={{ flex: 1, fontFamily: "var(--font-mono,monospace)", fontSize: 10.5 }}/>
            <button className="icon-btn" onClick={() => setShareUrl(null)}><Icons.X size={11}/></button>
          </div>
        )}

        {/* Tab strip */}
        <Shared.SectionPill
          items={VAULT_TABS.map(t => ({ ...t, badge: tabCounts[t.k] }))}
          value={tab} onChange={setTab}/>

        {/* Content */}
        {tab === "all" && (
          <AllView fScripts={fScripts} fVideos={fVideos} fDocs={fDocs} fFiles={fFiles}
            q={q} canEdit={canEdit}
            onView={setViewing} onEditScript={setEditScript} onEditDoc={setEditDoc} onEditVideo={setEditVideo}
            onDeleteFile={deleteVaultFile} onShareFile={shareFile}/>
        )}
        {tab === "files" && (
          <FilesView files={fFiles} loading={filesLoading} canDelete={canEdit}
            onView={(f) => setViewing({ ...f, title: f.name, storagePath: f.storage_path })}
            onShare={shareFile} onDelete={deleteVaultFile}/>
        )}
        {tab === "scripts" && (
          <ScriptsView scripts={fScripts} canEdit={canEdit}
            onView={(s) => setViewing({ ...s, kind: "text", body: s.body })}
            onEdit={setEditScript}/>
        )}
        {tab === "videos" && (
          <VideosView videos={fVideos} canEdit={canEdit}
            onView={setViewing} onEdit={setEditVideo}/>
        )}
        {tab === "docs" && (
          <DocsView docs={fDocs} canEdit={canEdit}
            onView={setViewing} onEdit={setEditDoc}/>
        )}

        {/* Modals */}
        {viewing    && <FileViewer  item={viewing}    onClose={() => setViewing(null)}/>}
        {editScript && <ScriptEditor script={editScript} onClose={() => setEditScript(null)}/>}
        {editDoc    && <DocEditor    doc={editDoc}    onClose={() => setEditDoc(null)}/>}
        {editVideo  && <VideoEditor  video={editVideo} onClose={() => setEditVideo(null)}/>}
      </div>
    );
  }

  // ─── All view ─────────────────────────────────────────────────────────────
  function AllView({ fScripts, fVideos, fDocs, fFiles, q, canEdit, onView, onEditScript, onEditDoc, onEditVideo, onDeleteFile, onShareFile }) {
    const total = fScripts.length + fVideos.length + fDocs.length + fFiles.length;
    if (total === 0) {
      return (
        <div className="panel" style={{ padding: 40, textAlign: "center" }}>
          {q ? (
            <>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>No results for "{q}"</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>Try searching scripts, docs, video titles, or file names.</div>
            </>
          ) : (
            <>
              <Icons.Folder size={22} style={{ color: "var(--text-quaternary)", marginBottom: 10 }}/>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>// vault · empty</div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 6 }}>Upload files, add scripts, or link training videos to build your agency library.</div>
            </>
          )}
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {fFiles.length   > 0 && <FilesView   files={fFiles}   canDelete={canEdit} compact onView={(f) => onView({ ...f, title: f.name, storagePath: f.storage_path })} onShare={onShareFile} onDelete={onDeleteFile}/>}
        {fScripts.length > 0 && <ScriptsView scripts={fScripts} canEdit={canEdit} onView={(s) => onView({ ...s, kind: "text" })} onEdit={onEditScript}/>}
        {fVideos.length  > 0 && <VideosView  videos={fVideos}  canEdit={canEdit} onView={onView} onEdit={onEditVideo}/>}
        {fDocs.length    > 0 && <DocsView    docs={fDocs}     canEdit={canEdit} onView={onView} onEdit={onEditDoc}/>}
      </div>
    );
  }

  // ─── Files view ───────────────────────────────────────────────────────────
  function FilesView({ files, loading, canDelete, compact, onView, onShare, onDelete }) {
    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.Folder size={13}/>
          <h3>Uploaded files</h3>
          <span className="meta">{files.length}</span>
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>Loading…</div>
        ) : files.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center" }}>
            <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>// vault · empty</code>
          </div>
        ) : (
          <div className="list">
            <div className="list-h" style={{ gridTemplateColumns: "2fr 80px 90px 150px 110px" }}>
              <div>Name</div><div>Type</div>
              <div className="tabular" style={{ textAlign: "right" }}>Size</div>
              <div>Uploaded</div><div></div>
            </div>
            {files.map(f => (
              <div key={f.id} className="row" style={{ gridTemplateColumns: "2fr 80px 90px 150px 110px", height: 38 }}>
                <button onClick={() => onView(f)}
                  style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 500, fontSize: 12.5, color: "var(--accent-money)", minWidth: 0 }}
                  className="cell-truncate">
                  {f.name || "—"}
                </button>
                <div><span className="chip" style={{ fontSize: 9.5 }}>{f.kind || "—"}</span></div>
                <div className="tabular" style={{ textAlign: "right", color: "var(--text-tertiary)" }}>{fmtBytes(f.size_bytes)}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{fmtDate(f.uploaded_at)}</div>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button className="icon-btn" title="Preview" onClick={() => onView(f)}><Icons.Play size={11}/></button>
                  <button className="icon-btn" title="Share (24h link)" onClick={() => onShare(f)}><Icons.Copy size={11}/></button>
                  {canDelete && <button className="icon-btn" title="Delete" style={{ color: "var(--state-danger)" }} onClick={() => onDelete(f)}><Icons.X size={11}/></button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Scripts view ─────────────────────────────────────────────────────────
  function ScriptsView({ scripts, canEdit, onView, onEdit }) {
    const [openId, setOpenId] = useState(null);
    const [cat,    setCat]    = useState("All");
    const cats = useMemo(() => ["All", ...Array.from(new Set(scripts.map(s => s.cat).filter(Boolean)))], [scripts]);

    const filtered = cat === "All" ? scripts : scripts.filter(s => s.cat === cat);

    const copy = (s) => {
      try { navigator.clipboard.writeText(s.body || ""); window.toast && window.toast("Script copied", "success"); }
      catch (_e) {}
    };

    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.FileText size={13}/>
          <h3>Scripts</h3>
          <span className="meta">{scripts.length}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, flexWrap: "wrap" }}>
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)} className="btn btn-ghost"
                style={{ padding: "3px 8px", fontSize: 11, background: cat === c ? "var(--bg-raised)" : "transparent", color: cat === c ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                {c}
              </button>
            ))}
          </div>
          {canEdit && (
            <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={() => onEdit({})}>
              <Icons.Plus size={12}/> Add
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>// scripts · empty</code>
          </div>
        ) : (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 5 }}>
            {filtered.map(s => {
              const open = openId === s.id;
              const Chev = open ? Icons.ChevronDown : Icons.ChevronRight;
              return (
                <div key={s.id} style={{ background: "var(--bg-raised)", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer" }}
                    onClick={() => setOpenId(open ? null : s.id)}>
                    <Chev size={11} style={{ color: "var(--text-tertiary)", flexShrink: 0 }}/>
                    <span style={{ flex: 1, fontWeight: 500, fontSize: 12.5 }} className="cell-truncate">{s.title}</span>
                    <span className="chip" style={{ fontSize: 9.5 }}>{s.cat}</span>
                    {s.version && <span style={{ fontSize: 10, color: "var(--text-quaternary)" }}>{s.version}</span>}
                    <button className="icon-btn" title="Copy script" onClick={(e) => { e.stopPropagation(); copy(s); }}><Icons.Copy size={11}/></button>
                    {canEdit && <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(s); }}><Icons.Edit size={11}/></button>}
                  </div>
                  {open && (
                    <div style={{ padding: "10px 14px 14px 32px", borderTop: "1px solid var(--border-subtle)", fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                      {s.body}
                      <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => copy(s)}>
                          <Icons.Copy size={11}/> Copy
                        </button>
                        {canEdit && (
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => onEdit(s)}>
                            <Icons.Edit size={11}/> Edit
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── Videos view ─────────────────────────────────────────────────────────
  function VideosView({ videos, canEdit, onView, onEdit }) {
    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.Video size={13}/>
          <h3>Training videos</h3>
          <span className="meta">{videos.length}</span>
          {canEdit && (
            <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => onEdit({})}>
              <Icons.Plus size={12}/> Add
            </button>
          )}
        </div>
        {videos.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>// videos · empty</code>
          </div>
        ) : (
          <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
            {videos.map(v => (
              <div key={v.id} style={{ background: "var(--bg-raised)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
                <div onClick={() => onView(v)}
                  style={{ position: "relative", paddingTop: "56.25%", background: "var(--bg-overlay)", cursor: "pointer" }}>
                  {v.thumb && <img src={v.thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/>}
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.22)" }}>
                    <div style={{ width: 34, height: 34, borderRadius: 999, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icons.Play size={13} style={{ color: "white", marginLeft: 2 }}/>
                    </div>
                  </div>
                  {v.durMin > 0 && (
                    <div style={{ position: "absolute", bottom: 6, right: 6, padding: "2px 6px", background: "rgba(0,0,0,0.7)", borderRadius: 3, fontSize: 10, color: "white" }}>{v.durMin}m</div>
                  )}
                </div>
                <div style={{ padding: "8px 10px", display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }} className="cell-truncate">{v.title}</div>
                    <span className="chip" style={{ fontSize: 9.5, marginTop: 4 }}>{v.cat}</span>
                  </div>
                  {canEdit && (
                    <button className="icon-btn" title="Edit" onClick={() => onEdit(v)}><Icons.Edit size={11}/></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Docs view ────────────────────────────────────────────────────────────
  function DocsView({ docs, canEdit, onView, onEdit }) {
    const groups = useMemo(() => {
      const g = {};
      for (const d of docs) { (g[d.cat || "Internal"] ||= []).push(d); }
      return g;
    }, [docs]);

    const docIcon = (d) => {
      if (d.kind === "gdoc") return Icons.ArrowUpRight;
      if (d.kind === "upload") return Icons.Folder;
      return Icons.FileText;
    };

    const canPreview = (d) => {
      const ext = extOf(d);
      return d.kind === "gdoc" || !!d.storagePath || ["png","jpg","jpeg","gif","svg","webp","pdf","mp4","webm","txt","md","json","csv"].includes(ext);
    };

    return (
      <div className="panel">
        <div className="panel-h">
          <Icons.Folder size={13}/>
          <h3>Documents</h3>
          <span className="meta">{docs.length}</span>
          {canEdit && (
            <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => onEdit({})}>
              <Icons.Plus size={12}/> Add
            </button>
          )}
        </div>
        {docs.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <code className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>// docs · empty</code>
          </div>
        ) : (
          <div style={{ padding: 14 }}>
            {Object.entries(groups).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{cat}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {items.map(d => {
                    const Ico = docIcon(d);
                    return (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-raised)", borderRadius: 5 }}>
                        <Ico size={11} style={{ color: "var(--text-tertiary)", flex: "0 0 auto" }}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500 }} className="cell-truncate">{d.title}</div>
                          {d.sizeBytes && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{fmtBytes(d.sizeBytes)}</span>}
                        </div>
                        {d.ext && <span className="chip" style={{ fontSize: 9.5 }}>{d.ext}</span>}
                        {d.kind === "gdoc" && <span className="chip" style={{ fontSize: 9.5 }}>gdoc</span>}
                        {/* Preview button — only for previewable types */}
                        {canPreview(d) && (
                          <button className="icon-btn" title="Preview" onClick={() => onView(d)}>
                            <Icons.Play size={11}/>
                          </button>
                        )}
                        {/* Open externally if URL available */}
                        {d.url && (
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Open in new tab">
                            <Icons.ArrowUpRight size={11}/>
                          </a>
                        )}
                        {canEdit && (
                          <button className="icon-btn" title="Edit" onClick={() => onEdit(d)}><Icons.Edit size={11}/></button>
                        )}
                        {canEdit && (
                          <button className="icon-btn" title="Delete" style={{ color: "var(--state-danger)" }}
                            onClick={() => { window.AppData.mutate.docDelete(d.id); window.toast && window.toast("Deleted", "info"); }}>
                            <Icons.X size={11}/>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  window.PageVaultFiles = PageVaultFiles;
})();
