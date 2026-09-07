import test from "node:test";
import assert from "node:assert/strict";
import { HarakiriClient, CommandStreamError, readCommandEvents } from "./index.js";

const output = { type: "output", commandId: "cmd_test", cursor: "v1:cmd_test:p:1", stdout: "first\n", stderr: "" };
const complete = { type: "complete", commandId: "cmd_test", cursor: output.cursor, status: "succeeded", exitCode: 0 };
const frame = (event: { type: string; cursor: string } & Record<string, unknown>) => `id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
const response = (data: string) => new Response(data, { headers: { "content-type": "text/event-stream" } });

test("SDK reconnect uses authenticated GET and the last consumed cursor, never POST", async () => {
  const urls: string[] = [];
  const client = new HarakiriClient({ apiUrl: "https://api.example.test", apiKey: "hk_test", fetch: async (url, init) => {
    urls.push(String(url)); assert.equal(init?.method ?? "GET", "GET");
    assert.equal(new Headers(init?.headers).get("x-api-key"), "hk_test");
    return response(urls.length === 1 ? frame(output) : frame(complete));
  } });
  const events = [];
  for await (const event of client.commands.stream("sbx_test", "cmd_test", { reconnectDelayMs: 0 })) events.push(event);
  assert.equal(events.filter((event) => event.type === "output").length, 1);
  assert.equal(new URL(urls[1]).searchParams.get("cursor"), output.cursor);
});
test("SSE parser handles byte-split UTF-8 and multiline strings", async () => {
  const bytes = new TextEncoder().encode(frame({ ...output, stdout: "caf\u00e9\nsecond" }));
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  const events = [];
  for await (const event of readCommandEvents(new Response(stream, { headers: { "content-type": "text/event-stream" } }))) events.push(event);
  assert.equal((events[0] as typeof output).stdout, "caf\u00e9\nsecond");
});
test("explicit API errors are not retried", async () => {
  let requests = 0;
  const client = new HarakiriClient({ apiUrl: "https://api.example.test", apiKey: "hk_test", fetch: async () => { requests++; return response(frame({ ...output, type: "error", code: "unauthorized", message: "Revoked" })); } });
  await assert.rejects(async () => { for await (const _ of client.commands.stream("sbx_test", "cmd_test")) {} }, CommandStreamError);
  assert.equal(requests, 1);
});

test("invalid and cross-command event payloads fail without retry", async () => {
  const invalid = [
    frame({ ...output, commandId: "cmd_other", cursor: "v1:cmd_other:p:1" }),
    frame({ ...complete, status: "running" }),
    frame({ ...output, stdout: 123 }),
    frame({ ...output, cursor: "not-a-cursor" }),
    'id: v1:cmd_test:p:1\nevent: output\ndata: {broken\n\n',
    frame(output).replace('event: output', 'event: complete'),
  ];
  for (const data of invalid) {
    let requests = 0;
    const client = new HarakiriClient({ apiUrl: "https://api.example.test", apiKey: "hk_test", fetch: async () => { requests++; return response(data); } });
    await assert.rejects(async () => { for await (const _ of client.commands.stream("sbx_test", "cmd_test")) {} }, CommandStreamError);
    assert.equal(requests, 1);
  }
});

test("SDK workspace attachment is included in the create body", async () => {
  const bodies: unknown[] = [];
  const client = new HarakiriClient({ apiUrl: "https://api.example.test", apiKey: "hk_test", fetch: async (_url, init) => {
    bodies.push(JSON.parse(init?.body as string));
    return Response.json({ sandbox: { id: "sbx_test", workspaceId: "wsp_test" } });
  } });
  await client.createSandbox({ template: "python-3.12", workspaceId: "wsp_test" });
  assert.equal((bodies[0] as { workspaceId: string }).workspaceId, "wsp_test");
});
test("abort and early iterator return cancel the HTTP body", async () => {
  let cancelled = false;
  const client = new HarakiriClient({ apiUrl: "https://api.example.test", apiKey: "hk_test", fetch: async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frame(output)));
      init?.signal?.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
    }, cancel() { cancelled = true; }
  }), { headers: { "content-type": "text/event-stream" } }) });
  for await (const _ of client.commands.stream("sbx_test", "cmd_test")) break;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cancelled, true);
});
