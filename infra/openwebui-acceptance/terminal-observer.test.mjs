import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { observeCreatedTerminal } from "./terminal-observer.mjs";

const path = "http://127.0.0.1:28580/api/v1/terminals/harakiri/api/terminals";
const request = () => ({ method: () => "POST", url: () => path });
const response = (request, id, ok = true) => ({ request: () => request, ok: () => ok, json: async () => ({ id }) });
const socket = id => Object.assign(new EventEmitter(), { url: () => `${path.replace("http:", "ws:")}/${id}` });
function browser() {
  const page = new EventEmitter();
  page.waitForResponse = predicate => new Promise(resolve => {
    const accept = value => {
      if (!predicate(value)) return;
      page.off("response", accept);
      resolve(value);
    };
    page.on("response", accept);
  });
  return page;
}

test("revocation observes the created session despite an older response and socket arriving first", async () => {
  const page = browser();
  const oldRequest = request(), currentRequest = request();
  const oldSocket = socket("previous"), currentSocket = socket("current");
  // The old creation started before the test dismissed that shell.
  page.emit("request", oldRequest);
  const observed = await observeCreatedTerminal(page, async () => {
    page.emit("request", currentRequest);
    page.emit("response", response(oldRequest, "previous"));
    page.emit("websocket", oldSocket);
    oldSocket.emit("framesent", { payload: JSON.stringify({ type: "resize" }) });
    oldSocket.emit("close");
    page.emit("response", response(currentRequest, "current"));
    page.emit("websocket", currentSocket);
    currentSocket.emit("framesent", { payload: JSON.stringify({ type: "resize" }) });
    currentSocket.emit("framereceived", { payload: Buffer.from("REVOCATION_") });
    currentSocket.emit("framereceived", { payload: "READY" });
  });
  assert.equal(observed.state.socket, currentSocket);
  assert.equal(observed.state.output, "REVOCATION_READY");
  assert.equal(observed.state.closed, false);
  currentSocket.emit("close");
  assert.equal(observed.state.closed, true);
  observed.dispose();
  for (const emitter of [page, oldSocket, currentSocket]) assert.deepEqual(emitter.eventNames(), []);
});

test("a rejected terminal creation removes discovery and socket listeners", async () => {
  const page = browser();
  const pending = socket("pending"), created = request();
  await assert.rejects(observeCreatedTerminal(page, async () => {
    page.emit("request", created);
    page.emit("websocket", pending);
    page.emit("response", response(created, "pending", false));
  }), /Native terminal creation failed/);
  assert.deepEqual(page.eventNames(), []);
  assert.deepEqual(pending.eventNames(), []);
});
