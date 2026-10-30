import { check, until } from "../acceptance/context.mjs";

const terminalPath = "/api/v1/terminals/harakiri/api/terminals";

export async function observeCreatedTerminal(page, open) {
  const requests = new Set();
  const connections = new Map();
  const disposers = [];
  const onRequest = request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === terminalPath) requests.add(request);
  };
  const onSocket = socket => {
    const path = new URL(socket.url()).pathname;
    if (!path.startsWith(`${terminalPath}/`)) return;
    const state = { socket, connected: false, closed: false, output: "" };
    const received = ({ payload }) => { state.output = (state.output + payload.toString()).slice(-8192); };
    const sent = ({ payload }) => {
      try { state.connected ||= JSON.parse(String(payload)).type === "resize"; } catch { /* Binary PTY input. */ }
    };
    const closed = () => { state.closed = true; };
    socket.on("framereceived", received);
    socket.on("framesent", sent);
    socket.on("close", closed);
    connections.set(path, state);
    disposers.push(() => {
      socket.off("framereceived", received);
      socket.off("framesent", sent);
      socket.off("close", closed);
    });
  };
  const dispose = () => { for (const off of disposers) off(); };
  page.on("request", onRequest);
  page.on("websocket", onSocket);
  try {
    // A previous shell's response/socket can arrive after it was dismissed.
    // Match a newly initiated POST, then its exact returned session, not first WS.
    const [response] = await Promise.all([
      page.waitForResponse(response => requests.has(response.request()), { timeout: 45000 }),
      open()
    ]);
    check(response.ok(), "Native terminal creation failed");
    const { id } = await response.json();
    check(typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id), "Native terminal identity missing");
    const state = await until("Created native terminal connected", () => {
      const current = connections.get(`${terminalPath}/${encodeURIComponent(id)}`);
      check(!current?.closed, "Created native terminal closed before readiness");
      return current?.connected ? current : null;
    }, 45000);
    return { state, dispose };
  } catch (error) {
    dispose();
    throw error;
  } finally {
    page.off("request", onRequest);
    page.off("websocket", onSocket);
  }
}
