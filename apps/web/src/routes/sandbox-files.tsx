import { useCallback, useEffect, useRef, useState } from "react";
import type { SandboxFileEntry, SandboxSummary } from "@harakiri/shared";
import { api } from "../api";
import { ApiResponseError } from "../api-client/request";
import { Dialog } from "../components/dialog";
import { Icon } from "../components/icon";
import { formatBytes, formatDateTime } from "../format";
import { useWorkbenchQuery } from "../use-workbench-query";
import { errorMessage } from "../workbench";
import { artifactChecksum, browserArtifactLimit, decodeArtifact, encodeArtifact, previewLimit, previewText, saveArtifact, uploadPath } from "../workbench-files";

type Upload = { file: File; path: string };

export function SandboxFilesPane({ sandbox }: { sandbox: SandboxSummary }) {
  const [path, setPath] = useState(sandbox.runtimeMetadata?.workdir ?? "/");
  return <Directory key={`${sandbox.id}:${path}`} sandbox={sandbox} path={path} onNavigate={setPath} />;
}

function Directory({ sandbox, path, onNavigate }: { sandbox: SandboxSummary; path: string; onNavigate: (path: string) => void }) {
  const load = useCallback((signal: AbortSignal) => api.files(sandbox.id, path, signal), [sandbox.id, path]);
  const listing = useWorkbenchQuery(load);
  const cwd = listing.data?.cwd ?? path;
  const [address, setAddress] = useState(path);
  const [selectedPath, selectPath] = useState<string>();
  const selected = listing.loading || listing.error ? undefined : listing.data?.files.find((file) => file.path === selectedPath);
  const [overwrite, confirmOverwrite] = useState<Upload>();
  const [stage, setStage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const limit = Math.min(browserArtifactLimit, sandbox.runtimeMetadata?.limits?.fileArtifactMaxBytes ?? browserArtifactLimit);
  const writable = ["running", "idle"].includes(sandbox.status);
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort(); }; }, []);

  const operation = async (action: (signal: AbortSignal) => Promise<void>, uploading = false) => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 120_000);
    setError(""); setNotice("");
    try { await action(controller.signal); }
    catch (cause) {
      if (alive.current) setError(controller.signal.aborted
        ? uploading ? "Upload interrupted. The server may have written the file; refresh and inspect it before retrying." : "Transfer cancelled or timed out."
        : `${errorMessage(cause, "File operation failed.")}${uploading ? " Inspect the destination before retrying; the upload may have reached the server." : ""}`);
    } finally {
      clearTimeout(timeout); active.current = null;
      if (alive.current) setStage("");
    }
  };

  const upload = (input: Upload) => void operation(async (signal) => {
    setStage("Preparing upload");
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    signal.throwIfAborted();
    if (bytes.length > limit) throw new Error(`Upload limit: ${formatBytes(limit)}.`);
    const sha256 = await artifactChecksum(bytes);
    signal.throwIfAborted(); setStage("Uploading");
    const result = await api.uploadFile(sandbox.id, { path: input.path, contentBase64: encodeArtifact(bytes), sizeBytes: bytes.length, sha256 }, signal);
    signal.throwIfAborted(); setStage("Verifying upload");
    if (result.sizeBytes !== bytes.length || result.sha256 !== sha256) throw new Error("Upload verification failed. Inspect the remote file before retrying.");
    if (alive.current) { setNotice(`Uploaded ${input.file.name}.`); selectPath(undefined); listing.refresh(); }
  }, true);

  const prepareUpload = (file: File) => void operation(async (signal) => {
    if (file.size > limit) throw new Error(`Upload limit: ${formatBytes(limit)}.`);
    const input = { file, path: uploadPath(cwd, file.name) };
    setStage("Checking destination");
    try {
      const result = await api.fileStat(sandbox.id, input.path, signal);
      if (result.file.type !== "file") throw new Error("The destination is not a regular file. Choose another filename.");
      if (alive.current) confirmOverwrite(input);
    } catch (cause) {
      if (!(cause instanceof ApiResponseError) || cause.status !== 404) throw cause;
      signal.throwIfAborted();
      // The confirmation also makes the destination explicit; the API does not provide atomic create-only writes.
      if (alive.current) confirmOverwrite(input);
    }
  });

  const download = (file: SandboxFileEntry) => void operation(async (signal) => {
    if (file.size > limit) throw new Error(`Download limit: ${formatBytes(limit)}.`);
    setStage("Downloading");
    const result = await api.downloadFile(sandbox.id, file.path, limit, signal);
    setStage("Verifying download");
    const bytes = await decodeArtifact(result, limit, signal);
    if (alive.current) { saveArtifact(bytes, file.path); setNotice(`Downloaded ${file.name}.`); }
  });

  const busy = Boolean(stage);
  const files = listing.data?.files ?? [];
  const parent = cwd.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
  return <section className="workbench-files" aria-label="Sandbox files">
    <form className="workbench-toolbar" onSubmit={(event) => { event.preventDefault(); if (address.trim()) onNavigate(address.trim()); }}>
      <button type="button" className="btn btn-sm" disabled={cwd === "/" || busy} onClick={() => onNavigate(parent)} title="Parent directory" aria-label="Parent directory"><Icon name="chevron" style={{ transform: "rotate(180deg)" }} /></button>
      <input className="input mono workbench-address" aria-label="Directory path" value={address} onChange={(event) => setAddress(event.target.value)} disabled={busy} />
      <button className="btn btn-sm" disabled={busy} title="Open directory" aria-label="Open directory"><Icon name="arrowR" /></button>
      <button type="button" className="btn btn-sm" disabled={listing.loading || busy} onClick={listing.refresh} title="Refresh files" aria-label="Refresh files"><Icon name="refresh" /></button>
      <button type="button" className="btn btn-sm" disabled={!writable || busy || !listing.data || Boolean(listing.error)} onClick={() => uploadInput.current?.click()}><Icon name="plus" /> Upload</button>
      <input ref={uploadInput} type="file" aria-label="Upload file" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) prepareUpload(file); }} />
    </form>
    <div className="workbench-file-status"><span>{files.length} entries</span><span>{formatBytes(limit)} transfer limit</span>{listing.loading ? <span role="status">Loading files...</span> : null}</div>
    {listing.error || error ? <p className="workbench-notice" role="alert">{error || listing.error}</p> : null}
    {listing.data?.warnings?.map((warning) => <p className="workbench-notice" key={warning}>{warning}</p>)}
    {notice ? <p className="workbench-notice" role="status">{notice}</p> : null}
    {busy ? <div className="workbench-transfer" role="status"><span>{stage}</span><progress aria-label={stage} /><button className="btn btn-sm" onClick={() => active.current?.abort()}>Cancel transfer</button></div> : null}
    <div className={`workbench-file-layout ${selected ? "has-preview" : ""}`}>
      <div className="workbench-file-list" aria-label="Directory entries">
        {files.slice(0, 300).map((file) => <button key={file.path} className={`workbench-file-row ${selected?.path === file.path ? "selected" : ""}`} disabled={busy || listing.loading || Boolean(listing.error)} onClick={() => file.type === "directory" ? onNavigate(file.path) : selectPath(file.path)}>
          <Icon name={file.type === "directory" ? "folder" : "file"} /><span className="workbench-file-name">{file.name}<small>{file.type}</small></span><span className="mono">{file.type === "directory" ? "" : formatBytes(file.size)}</span><time>{formatDateTime(file.modifiedAt)}</time>
        </button>)}
        {files.length > 300 ? <p className="workbench-notice">Showing the first 300 entries.</p> : null}
        {!files.length && !listing.loading && !listing.error ? <p className="empty-state">This directory is empty.</p> : null}
      </div>
      {selected ? <aside className="workbench-file-preview" aria-label="File preview">
        <header className="workbench-toolbar"><strong className="workbench-path">{selected.name}</strong><button className="btn btn-sm" disabled={busy || selected.type !== "file"} onClick={() => download(selected)}>Download</button><button className="btn btn-sm btn-ghost" title="Close preview" aria-label="Close preview" onClick={() => selectPath(undefined)}><Icon name="x" /></button></header>
        <FilePreview key={`${selected.path}:${listing.observedAt}`} id={sandbox.id} file={selected} />
      </aside> : null}
    </div>
    {overwrite ? <Dialog title="Upload file?" onClose={() => confirmOverwrite(undefined)}><div className="modal-body"><p className="workbench-path">{overwrite.path}</p><p>Any file at this path will be replaced. Existing writes cannot be undone by cancelling the request.</p></div><div className="modal-foot"><button className="btn" onClick={() => confirmOverwrite(undefined)}>Cancel</button><button className="btn btn-primary" onClick={() => { const input = overwrite; confirmOverwrite(undefined); upload(input); }}>Upload file</button></div></Dialog> : null}
  </section>;
}

function FilePreview({ id, file }: { id: string; file: SandboxFileEntry }) {
  const [text, setText] = useState<string | null>();
  const [error, setError] = useState("");
  const supported = file.type === "file" && file.size <= previewLimit;
  useEffect(() => {
    if (!supported) return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => { controller.abort(); if (!disposed) setError("Preview timed out. Close and reopen the file to retry."); }, 20_000);
    void api.downloadFile(id, file.path, previewLimit, controller.signal)
      .then((result) => decodeArtifact(result, previewLimit, controller.signal))
      .then((bytes) => { if (!controller.signal.aborted) setText(previewText(bytes)); })
      .catch((cause) => { if (!controller.signal.aborted) setError(errorMessage(cause, "Preview unavailable.")); })
      .finally(() => clearTimeout(timeout));
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); };
  }, [id, file.path, supported]);
  if (!supported) return <p className="workbench-notice">Preview unavailable. Text previews support regular files up to {formatBytes(previewLimit)}.</p>;
  if (error) return <p className="workbench-notice" role="alert">{error}</p>;
  if (text === undefined) return <p className="workbench-notice" role="status">Loading preview...</p>;
  if (text === null) return <p className="workbench-notice">Binary file. Download to inspect.</p>;
  return <pre tabIndex={0} className="workbench-file-content">{text || "(empty file)"}</pre>;
}
