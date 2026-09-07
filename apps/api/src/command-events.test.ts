import assert from "node:assert/strict";
import test from "node:test";
import { commandCursor, commandEvents, encodeCommandEvent, parseCommandCursor } from "./services/command-events.js";
import type { SandboxCommandSummary, SandboxCommandEvent } from "@harakiri/shared";

const summary = (status = "succeeded") => ({ id: "cmd_test", detached: true, providerCommandId: "native", status, exitCode: status === "succeeded" ? 0 : null }) as SandboxCommandSummary;
const collect = async (generator: AsyncIterable<SandboxCommandEvent | "heartbeat">) => { const result: Array<SandboxCommandEvent | "heartbeat"> = []; for await (const value of generator) result.push(value); return result; };
const base = () => ({ commandId: "cmd_test", signal: new AbortController().signal, authorize: async () => true,
  readCommand: async () => summary(), readLogs: async () => ({ commandId: "cmd_test", stdout: "done\n", stderr: "", cursor: 1 }) });

test("cursors are bounded and bound to one command and storage source", () => {
  assert.deepEqual(parseCommandCursor("cmd_test", commandCursor("cmd_test", 4)), { offset: 4, stored: false });
  for (const cursor of ["v1:cmd_other:p:0", "v1:cmd_test:p:-1", "v1:cmd_test:p:1e8", "v1:cmd_test:p:9007199254740993", "v1:cmd_test:s:2"]) assert.throws(() => parseCommandCursor("cmd_test", cursor));
});
test("stream emits final output before completion and encodes multiline text safely", async () => {
  const events = await collect(commandEvents(base()));
  assert.deepEqual(events.map((event) => typeof event === "string" ? event : event.type), ["output", "status", "complete"]);
  const frame = encodeCommandEvent(events[0]);
  assert.ok(frame.includes('"stdout":"done\\n"'));
  assert.ok(frame.endsWith("\n\n"));
});
test("reconnect reads from cursor without restarting execution", async () => {
  const offsets: number[] = [];
  await collect(commandEvents({ ...base(), cursor: commandCursor("cmd_test", 4), readLogs: async (cursor) => { offsets.push(cursor); return { commandId: "cmd_test", stdout: "", stderr: "", cursor }; } }));
  assert.deepEqual(offsets, [4]);
});
test("lost log history and auth revocation never become successful completion", async () => {
  const lost = await collect(commandEvents({ ...base(), cursor: commandCursor("cmd_test", 4) }));
  assert.equal((lost.at(-1) as SandboxCommandEvent).type, "error");
  let reads = 0;
  const revoked = await collect(commandEvents({ ...base(), authorize: async () => false, readCommand: async () => { reads++; return summary(); } }));
  assert.equal(reads, 0);
  assert.equal((revoked[0] as { code: string }).code, "unauthorized");
});
test("disconnect aborts the viewer, not the command; server rotation retains cursor", async () => {
  const controller = new AbortController();
  const iterator = commandEvents({ ...base(), signal: controller.signal, readCommand: async () => summary("running") });
  await iterator.next(); controller.abort();
  const rest = await collect(iterator);
  assert.ok(!rest.some((event) => typeof event !== "string" && event.type === "complete"));
  const rotated = await collect(commandEvents({ ...base(), maxDurationMs: 0 }));
  assert.equal((rotated[0] as SandboxCommandEvent).type, "reconnect");
});
test("foreground stored output is replayed once, and provider failure is sanitized", async () => {
  const foreground = await collect(commandEvents({ ...base(), cursor: commandCursor("cmd_test", 1, true), readCommand: async () => ({ ...summary(), detached: false }), readLogs: async () => { throw new Error("must not replay"); } }));
  assert.deepEqual(foreground.map((event) => typeof event === "string" ? event : event.type), ["status", "complete"]);
  const failed = await collect(commandEvents({ ...base(), readCommand: async () => { throw new Error("private provider credential"); } }));
  assert.ok(!JSON.stringify(failed).includes("private provider credential"));
});

test("failed and killed commands report their terminal state without pretending success", async () => {
  for (const status of ["failed", "killed"]) {
    const events = await collect(commandEvents({ ...base(), readCommand: async () => ({ ...summary(status), exitCode: 137 }) }));
    assert.deepEqual(events.at(-1), { type: "complete", commandId: "cmd_test", cursor: "v1:cmd_test:p:1", status, exitCode: 137 });
  }
});

test("authorization is rechecked on the next poll and missing commands end with an error", async () => {
  let checks = 0;
  const events = await collect(commandEvents({ ...base(), authorize: async () => ++checks === 1, readCommand: async () => summary("running"), pollMs: 0 }));
  assert.equal((events.at(-1) as { code: string }).code, "unauthorized");
  const missing = await collect(commandEvents({ ...base(), readCommand: async () => null }));
  assert.equal((missing.at(-1) as { code: string }).code, "command_not_found");
});

test("slow consumers do not trigger eager polling and oversized frames fail closed", async () => {
  let reads = 0;
  const iterator = commandEvents({ ...base(), readCommand: async () => { reads++; return summary("running"); }, pollMs: 0 });
  await iterator.next();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(reads, 1);
  await iterator.return(undefined);
  const oversized = await collect(commandEvents({ ...base(), readLogs: async () => ({ commandId: "cmd_test", stdout: "x".repeat(1024 * 1024 + 1), stderr: "", cursor: 1 }) }));
  assert.equal((oversized[0] as { code: string }).code, "command_stream_unavailable");
  assert.ok(JSON.stringify(oversized).length < 1000);
});
