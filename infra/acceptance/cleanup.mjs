import fs from "node:fs";
import path from "node:path";
import { context, check } from "./context.mjs";
import { assertOwnedNamespace, assertPrivateDirectory, namespaces, runnerIdentity } from "./safety.mjs";

process.umask(0o077);
const identity = runnerIdentity();
if (fs.existsSync(identity.directory)) {
  assertPrivateDirectory(identity.directory);
  const owner = JSON.parse(fs.readFileSync(path.join(identity.directory, "owner.json")));
  check(owner.id === identity.id && owner.kubeconfig === identity.kubeconfig, "Acceptance cleanup owner mismatch");
  let status = "refused";
  try {
    if (fs.existsSync(path.join(identity.directory, "cluster.json"))) {
      const ctx = context();
      ctx.guard();
      const available = JSON.parse(ctx.k(["get", "namespaces", "-o", "json"]));
      // Keep provider controllers alive until their runtime resources are gone.
      for (const name of [...namespaces].reverse()) {
        const namespace = available.items.find(item => item.metadata.name === name);
        if (!namespace) continue;
        assertOwnedNamespace(namespace, identity);
        ctx.k(["delete", "namespace", name, "--wait=true", "--timeout=180s"]);
      }
      ctx.guard();
      ctx.execute("sudo", ["systemctl", "stop", "k0scontroller"], "Stop test-owned k0s");
      status = "passed";
      console.log("Test-owned namespaces and k0s stopped.");
    } else {
      console.log("Bootstrap did not record a cluster identity; cluster mutation refused. The hosted VM must be discarded.");
    }
  } finally {
    assertPrivateDirectory(identity.directory);
    fs.rmSync(identity.directory, { recursive: true, force: false });
    if (fs.existsSync("standalone-acceptance-report.json")) {
      const receipt = JSON.parse(fs.readFileSync("standalone-acceptance-report.json"));
      receipt.cleanup = { status, privateMaterialRemoved: true };
      fs.writeFileSync("standalone-acceptance-report.json", `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    }
    console.log("Private acceptance material removed. No backups, tokens or kubeconfig were uploaded.");
  }
}
