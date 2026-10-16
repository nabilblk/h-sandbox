import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { SandboxSummary } from "@harakiri/shared";
import { api } from "../api";
import { Icon } from "../components/icon";
import { errorMessage, runtimeAvailable, terminalInput, terminalOutput } from "../workbench";
import "@xterm/xterm/css/xterm.css";

type Connection = "connecting" | "attached" | "disconnected" | "error";
const maxPendingBytes = 2 * 1024 * 1024;

export default function SandboxTerminalPane({ sandbox }: { sandbox: SandboxSummary }) {
  const container = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [attempt, reconnect] = useState(0);
  const [status, setStatus] = useState<Connection>("connecting");
  const [error, setError] = useState("");
  const available = ["running", "idle"].includes(sandbox.status) && runtimeAvailable(sandbox.runtimeMetadata, "terminalAttach") !== "unavailable";

  useEffect(() => {
    if (!container.current || !available) return;
    let disposed = false;
    let failed = false;
    let attached = false;
    let pendingBytes = 0;
    let resizeFrame = 0;
    let socket: WebSocket | null = null;
    const controller = new AbortController();
    const term = new Terminal({
      cursorBlink: true, scrollback: 3000, fontSize: 13, fontFamily: "monospace",
      screenReaderMode: true, disableStdin: true,
      theme: { background: "#171b1c", foreground: "#e4e8e7", cursor: "#e4e8e7", selectionBackground: "#48615b" }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Remote output must not control the clipboard or create clickable escape-sequence links.
    term.parser.registerOscHandler(52, () => true);
    term.parser.registerOscHandler(8, () => true);
    term.open(container.current);
    term.textarea?.setAttribute("aria-label", "Sandbox terminal input");
    terminalRef.current = term;
    setStatus("connecting");
    setError("");
    const fail = (message: string) => {
      if (disposed || failed) return;
      failed = true;
      window.clearTimeout(timeout);
      controller.abort();
      attached = false;
      term.options.disableStdin = true;
      setStatus("error"); setError(message);
      socket?.close(1000, "terminal unavailable");
    };
    const timeout = window.setTimeout(() => fail("Terminal connection timed out. Reconnect to try again."), 20_000);
    const send = (bytes: Uint8Array) => {
      if (!attached || socket?.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount + bytes.length > maxPendingBytes) { fail("Terminal input is congested. Reconnect before continuing."); return; }
      socket.send(terminalInput(bytes));
    };
    const input = term.onData((data) => send(new TextEncoder().encode(data)));
    const binary = term.onBinary((data) => {
      const bytes = new Uint8Array(data.length);
      for (let index = 0; index < data.length; index++) bytes[index] = data.charCodeAt(index) & 255;
      send(bytes);
    });
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (disposed || !container.current?.clientWidth || !container.current.clientHeight) return;
        fit.fit();
        if (attached && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container.current);
    resize();
    void api.terminalAttachTicket(sandbox.id, controller.signal).then((ticket) => {
      if (disposed || controller.signal.aborted) return;
      socket = new WebSocket(ticket.attachUrl);
      socketRef.current = socket;
      socket.binaryType = "arraybuffer";
      socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
        if (disposed || failed) return;
        if (typeof event.data === "string") {
          try {
            const frame = JSON.parse(event.data) as { type?: string; message?: string; error?: string };
            if (frame.type === "connected") {
              window.clearTimeout(timeout); attached = true; term.options.disableStdin = false;
              setStatus("attached"); resize(); term.focus();
            } else if (frame.type === "error" || frame.error) fail(frame.message ?? "Terminal connection rejected.");
          } catch { fail("Invalid terminal control frame."); }
          return;
        }
        const output = terminalOutput(new Uint8Array(event.data));
        if (!output) return;
        pendingBytes += output.length;
        if (pendingBytes > maxPendingBytes) { fail("Terminal output exceeded the display buffer. Reconnect to continue."); return; }
        term.write(output, () => { pendingBytes -= output.length; });
      };
      socket.onerror = () => fail("Terminal connection failed. Check runtime availability before reconnecting.");
      socket.onclose = () => {
        window.clearTimeout(timeout);
        if (disposed) return;
        attached = false; term.options.disableStdin = true;
        setStatus((current) => current === "error" ? current : "disconnected");
      };
    }).catch((cause) => { if (!controller.signal.aborted) fail(errorMessage(cause, "Terminal attach failed.")); });
    return () => {
      disposed = true; controller.abort(); window.clearTimeout(timeout); cancelAnimationFrame(resizeFrame);
      observer.disconnect(); input.dispose(); binary.dispose();
      socket?.close(1000, "terminal pane closed");
      if (socketRef.current === socket) socketRef.current = null;
      terminalRef.current = null; term.dispose();
    };
  }, [sandbox.id, available, attempt]);

  return <section className="workbench-terminal" aria-label="Interactive terminal">
    <header className="workbench-toolbar">
      <span className={`pill ${status === "attached" && available ? "live" : ""}`} role="status"><span className="dot" />{available ? status : "unavailable"}</span>
      <code className="workbench-path">{sandbox.runtimeMetadata?.workdir ?? "/"}</code>
      <div className="workbench-actions">
        <button className="btn btn-sm" disabled={!available} onClick={() => reconnect((value) => value + 1)} title="Open a new terminal connection"><Icon name="refresh" /> Reconnect</button>
        <button className="btn btn-sm" disabled={status !== "attached" || !available} onClick={() => socketRef.current?.send(terminalInput(new Uint8Array([3])))} title="Interrupt the foreground process"><Icon name="stop" /> Interrupt</button>
        <button className="btn btn-sm" disabled={status !== "attached" || !available} onClick={() => socketRef.current?.close(1000, "user disconnected")}>Disconnect</button>
        <button className="btn btn-ghost btn-sm" onClick={() => terminalRef.current?.clear()} title="Clear terminal display" aria-label="Clear terminal display"><Icon name="x" /></button>
      </div>
    </header>
    {error ? <p className="workbench-notice" role="alert">{error}</p> : null}
    {!available ? <p className="workbench-notice" role="status">Terminal unavailable for this sandbox state or runtime.</p> : null}
    <div className="workbench-terminal-screen" ref={container} />
  </section>;
}
