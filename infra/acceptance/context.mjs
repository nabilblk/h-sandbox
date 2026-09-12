import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { assertClusterOwnership, assertKubeconfig, assertPrivateDirectory, runnerIdentity } from "./safety.mjs";

export const pinned = JSON.parse(fs.readFileSync(new URL("./versions.json", import.meta.url)));
export const origins = { web: "http://127.0.0.1:28480", api: "http://127.0.0.1:28482", auth: "http://127.0.0.1:28484" };
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export class AcceptanceCheckError extends Error {}
export const check = (condition, label) => { if (!condition) throw new AcceptanceCheckError(label); };

export async function until(label, observe, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await observe();
    if (value) return value;
    await delay(500);
  }
  throw new AcceptanceCheckError(`${label}: deadline exceeded`);
}

export async function download(url, digest) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  check(response.ok, `Artifact download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest) check(sha256(bytes) === digest, "Artifact checksum mismatch");
  return bytes;
}

export async function stopOwnedForward(child, signal = process.kill, wait = until) {
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  if (exited()) return;
  check(Number.isSafeInteger(child.pid) && child.pid > 1, "Invalid owned forward process group");
  const stop = name => {
    try { signal(-child.pid, name); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  // k0s runs kubectl as a child: signal the dedicated group, never an ambient PID.
  stop("SIGTERM");
  try { await wait("Owned forward stopped", exited, 3000); }
  catch {
    if (exited()) return;
    stop("SIGKILL");
    await wait("Owned forward forced cleanup", exited, 10000);
  }
}

export function context() {
  const identity = runnerIdentity();
  assertPrivateDirectory(identity.directory);
  const file = name => {
    assert.equal(path.basename(name), name, "Private evidence names cannot traverse directories");
    return path.join(identity.directory, name);
  };
  const save = (name, value) => fs.writeFileSync(file(name), typeof value === "string" || Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  const read = name => JSON.parse(fs.readFileSync(file(name)));
  let sequence = 0;
  const execute = (command, args, label, options = {}) => {
    try {
      return execFileSync(command, args, { encoding: options.binary ? undefined : "utf8", timeout: 900000, maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...options });
    } catch (error) {
      const name = `command-${++sequence}-failure.json`;
      save(name, { label, status: error.status, stdout: error.stdout?.toString(), stderr: error.stderr?.toString() });
      throw new AcceptanceCheckError(`${label} failed; private command evidence retained`);
    }
  };
  const raw = args => execute("/usr/local/bin/k0s", ["kubectl", "--kubeconfig", identity.kubeconfig, "--request-timeout=10s", ...args], "kubectl", { timeout: 15000 });
  const guard = () => {
    assertKubeconfig(JSON.parse(raw(["config", "view", "--raw", "-o", "json"])), identity);
    assertClusterOwnership(JSON.parse(raw(["get", "namespace", "kube-system", "-o", "json"])), identity, read("cluster.json").uid);
  };
  const k = (args, options = {}) => {
    guard();
    return execute("/usr/local/bin/k0s", ["kubectl", "--kubeconfig", identity.kubeconfig, ...args], options.label ?? "Isolated kubectl operation", options);
  };
  const helm = args => {
    guard();
    return execute("helm", [...args, "--kubeconfig", identity.kubeconfig], "Isolated Helm operation");
  };
  const consumer = path.join(identity.directory, "consumer");
  const loadClients = async () => import(pathToFileURL(path.join(consumer, "acceptance-client.mjs")).href);
  const children = new Map();
  const forward = async (name, port, remote) => {
    guard();
    if (children.has(name)) {
      await stopOwnedForward(children.get(name));
    }
    const descriptor = fs.openSync(file(`forward-${name}.log`), "a", 0o600);
    const child = spawn("/usr/local/bin/k0s", ["kubectl", "--kubeconfig", identity.kubeconfig, "-n", "harakiri-preview", "port-forward", "--address=127.0.0.1", `service/${name}`, `${port}:${remote}`], { detached: true, stdio: ["ignore", descriptor, descriptor] });
    fs.closeSync(descriptor);
    children.set(name, child);
    await until("Owned forward listening", async () => {
      check(child.exitCode === null, "Owned forward exited");
      try {
        const response = await fetch(`http://127.0.0.1:${port}${name === "harakiri-api" ? "/health" : "/"}`, { signal: AbortSignal.timeout(2000) });
        return response.status < 500;
      } catch { return false; }
    });
  };
  const forwardAll = async () => {
    await forward("harakiri-api", 28482, 8080);
    await forward("harakiri-web", 28480, 80);
    await forward("preview-keycloak", 28484, 8080);
  };
  const stopForwards = async () => {
    for (const child of children.values()) await stopOwnedForward(child);
    children.clear();
  };
  return { identity, file, save, read, execute, k, helm, guard, consumer, loadClients, forward, forwardAll, stopForwards };
}
