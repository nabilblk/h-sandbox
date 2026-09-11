import { check, sha256 } from "./context.mjs";
import { get, platformNamespace } from "./operator.mjs";
import { assertRetained, createRuntime, released } from "./workload.mjs";
import { probeCredential } from "./credential-fixture.mjs";

export async function configurationUpgrade(ctx, operator) {
  const { client } = operator;
  const state = ctx.read("recovered-workload.json");
  const sandbox = await createRuntime(client, state, "configuration-upgrade-survivor");
  await client.credentials.attachSecret(sandbox, state.secretId);
  const secretHash = () => sha256(JSON.stringify(get(ctx, "secret", "preview-api").data));
  const expectedSecretHash = secretHash();
  const history = JSON.parse(ctx.helm(["history", "harakiri", "-n", platformNamespace, "-o", "json"]));
  const revision = history.at(-1).revision;
  const resources = () => get(ctx, "deployment", "harakiri-api").spec.template.spec.containers.find(item => item.name === "api").resources;
  const originalResources = JSON.stringify(resources());
  const cpu = resources().requests.cpu === "150m" ? "160m" : "150m";
  const values = ctx.read("harakiri-values.json");
  values.api = { ...values.api, resources: { requests: { cpu, memory: "256Mi" }, limits: { cpu: "1", memory: "1Gi" } } };
  ctx.save("configuration-upgrade-values.json", values);
  ctx.helm(["upgrade", "harakiri", ctx.file(ctx.read("artifact-manifest.json").charts.harakiri.archive), "-n", platformNamespace, "-f", ctx.file("configuration-upgrade-values.json"), "--wait", "--timeout", "10m"]);
  await ctx.forward("harakiri-api", 28482, 8080);
  check(resources().requests.cpu === cpu, "Helm configuration upgrade did not apply the new resource request");
  await assertRetained(client, sandbox, state);
  await probeCredential(client, sandbox, true);
  check(secretHash() === expectedSecretHash && (await client.capacity()).capacity.inUse === 1, "Configuration upgrade changed secrets or execution admission");
  ctx.helm(["rollback", "harakiri", String(revision), "-n", platformNamespace, "--wait", "--timeout", "10m"]);
  await ctx.forward("harakiri-api", 28482, 8080);
  check(JSON.stringify(resources()) === originalResources, "Helm rollback did not restore the original resource requests");
  await assertRetained(client, sandbox, state);
  await probeCredential(client, sandbox, true);
  check(secretHash() === expectedSecretHash && (await client.capacity()).capacity.inUse === 1, "Configuration rollback changed secrets or execution admission");
  await released(client, sandbox, state.workspaceId);
  // Both revisions use the same published images. This is not a release/schema rollback proof.
  return { configurationUpgrade: true, configurationRollback: true, preservedKeys: true, preservedWorkspace: true };
}
