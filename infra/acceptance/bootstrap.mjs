import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFileSync } from "node:child_process";
import { check, download, pinned, until } from "./context.mjs";
import { assertKubeconfig, localizeGeneratedKubeconfig, ownershipLabel, runnerIdentity } from "./safety.mjs";

process.umask(0o077);
const identity = runnerIdentity();
check(!process.env.KUBECONFIG, "Inherited KUBECONFIG is forbidden");
for (const location of [identity.directory, "/var/lib/k0s", "/etc/k0s", "/etc/systemd/system/k0scontroller.service", path.join(os.homedir(), ".kube/config")]) {
  check(!fs.existsSync(location), "Existing cluster or acceptance state: refusing bootstrap");
}
check(os.totalmem() >= 12 * 1024 ** 3, "Runner memory is insufficient");
check(os.cpus().length >= 4, "Runner CPU allocation is insufficient");
const disk = fs.statfsSync(process.env.RUNNER_TEMP);
check(disk.bavail * disk.bsize >= 10 * 1024 ** 3, "Runner disk headroom below 10 GiB");
for (const port of [6443, 28480, 28482, 28484, 28486, 28488]) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`Acceptance port ${port} is occupied`)));
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
fs.mkdirSync(identity.directory, { mode: 0o700 });
const save = (name, bytes) => fs.writeFileSync(path.join(identity.directory, name), bytes, { mode: 0o600 });
const command = (cmd, args) => {
  try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600000 }); }
  catch (error) {
    save("bootstrap-command-failure.json", JSON.stringify({ status: error.status, stdout: error.stdout?.toString(), stderr: error.stderr?.toString() }));
    throw new Error("Native bootstrap command failed; raw output withheld");
  }
};
save("owner.json", JSON.stringify({ ...identity, startedAt: new Date().toISOString(), initialFreeBytes: disk.bavail * disk.bsize }));
save("k0s", await download(pinned.k0s.url, pinned.k0s.sha256));
command("sudo", ["install", "-m", "0755", path.join(identity.directory, "k0s"), "/usr/local/bin/k0s"]);
command("sudo", ["modprobe", "br_netfilter"]);
command("sudo", ["modprobe", "overlay"]);
command("sudo", ["sysctl", "-w", "net.bridge.bridge-nf-call-iptables=1", "net.ipv4.ip_forward=1"]);
command("sudo", ["k0s", "install", "controller", "--single"]);
command("sudo", ["systemctl", "start", "k0scontroller"]);
await until("k0s admin kubeconfig", () => {
  try { save("kubeconfig", command("sudo", ["k0s", "kubeconfig", "admin"])); return true; }
  catch { return false; }
}, 180000);
const k = args => command("/usr/local/bin/k0s", ["kubectl", "--kubeconfig", identity.kubeconfig, ...args]);
// k0s advertises a host interface by default. Localize only this freshly generated config.
const generated = JSON.parse(k(["config", "view", "--raw", "-o", "json"]));
const addresses = Object.values(os.networkInterfaces()).flat().filter(Boolean).map(item => item.address);
save("kubeconfig", JSON.stringify(localizeGeneratedKubeconfig(generated, identity, addresses)));
assertKubeconfig(JSON.parse(k(["config", "view", "--raw", "-o", "json"])), identity);
await until("Native node exists", () => {
  try { return JSON.parse(k(["get", "nodes", "-o", "json"])).items.length === 1; }
  catch { return false; }
}, 300000);
k(["wait", "--for=condition=Ready", "node", "--all", "--timeout=300s"]);
const node = JSON.parse(k(["get", "nodes", "-o", "json"])).items[0];
check(node.status.nodeInfo.architecture === "amd64", "Native node architecture mismatch");
const cluster = JSON.parse(k(["get", "namespace", "kube-system", "-o", "json"]));
check(!cluster.metadata.labels?.[ownershipLabel], "Existing ownership marker");
save("cluster.json", JSON.stringify({ uid: cluster.metadata.uid, architecture: node.status.nodeInfo.architecture, version: node.status.nodeInfo.kubeletVersion }));
k(["label", "namespace", "kube-system", `${ownershipLabel}=${identity.id}`]);
save("local-path.yaml", await download(pinned.storage.url, pinned.storage.sha256));
k(["apply", "-f", path.join(identity.directory, "local-path.yaml")]);
k(["annotate", "storageclass", "local-path", "storageclass.kubernetes.io/is-default-class=true", "--overwrite"]);
k(["-n", "local-path-storage", "rollout", "status", "deployment/local-path-provisioner", "--timeout=180s"]);
console.log(JSON.stringify({ phase: "bootstrap", status: "passed", architecture: "amd64", clusterUid: cluster.metadata.uid, k0s: pinned.k0s.version }));
