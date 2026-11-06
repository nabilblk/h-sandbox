import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createConfiguration } from "./configuration.mjs";
import { inspectPrerequisites } from "./preflight.mjs";

const root = new URL("../../", import.meta.url).pathname;
const example = JSON.parse(readFileSync(new URL("operator-input.example.json", import.meta.url), "utf8"));
const digest = `sha256:${"a".repeat(64)}`;
const fixture = () => ({ ...example, apiDigest: digest, webDigest: digest,
  ...Object.fromEntries(["serverImage", "controllerImage", "gatewayImage", "execdImage"].map((key) => [key, example[key].replace("REPLACE_WITH_DIGEST", digest)])) });
const render = (chart, values, ...args) => spawnSync("helm", ["template", "harakiri", `${root}/charts/${chart}`, "-n", "harakiri",
  "--api-versions", "route.openshift.io/v1/Route", "-f", "-", ...args], { input: JSON.stringify(values), encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });

test("configuration is deterministic, secret-free and explicitly unqualified", () => {
  const generated = createConfiguration(fixture());
  assert.deepEqual(generated, createConfiguration(fixture()));
  assert.equal(generated["qualification.json"].status, "native-validation-pending");
  assert.equal(generated["qualification.json"].evidence.scc, null);
  const data = JSON.stringify(generated);
  assert.doesNotMatch(data, /kind":"Secret"|SecurityContextConstraints|runAsUser|runAsGroup|fsGroup|hostPath|hostNetwork|NET_ADMIN|Unconfined|127\.0\.0\.1|localhost/);
  assert.match(data, /"automountServiceAccountToken":false/);
  const policy = generated["network-policies.json"].items[0];
  assert.deepEqual(policy.spec.podSelector.matchLabels, { "harakiri.io/role": "sandbox" });
  assert.equal(policy.spec.egress.length, 1, "default sandbox egress is DNS only");
  assert.deepEqual(policy.spec.ingress[0].from.map((p) => p.podSelector.matchLabels["harakiri.io/role"]), ["control-plane", "runtime-control"]);
});

test("invalid inputs fail before generating files", () => {
  assert.throws(() => createConfiguration(example), /digest/);
  for (const override of [
    { password: "never-accepted" }, { webOrigin: "http://sandbox.test" }, { apiOrigin: "https://127.0.0.1" },
    { authOrigin: "https://user:secret@auth.test" }, { realm: "x\nport=80" }, { project: "../bad" },
    { namespace: "-system" }, { webOrigin: fixture().apiOrigin }, { trustBundle: 42 },
    { namespace: "kube-system" }, { namespace: "default" }, { project: "team/../private" },
    { apiDigest: [digest] }, { registry: 123 }, { webOrigin: "https://bad..test" },
    { sandboxEgressCIDRs: ["0.0.0.0/0"] }, { sandboxEgressCIDRs: ["10.0.0.0/900"] },
    { serverImage: "registry.test/runtime:latest" }, { apiDigest: `sha256:${"0".repeat(64)}` }
  ]) assert.throws(() => createConfiguration({ ...fixture(), ...override }), JSON.stringify(override));
});

test("control-plane render has two TLS Routes, four restricted pods and no Kubernetes privileges", () => {
  const config = createConfiguration({ ...fixture(), trustBundle: "private-ca" });
  const result = render("harakiri", config["harakiri-values.json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/^kind: Route$/gm) ?? []).length, 2);
  assert.equal((result.stdout.match(/automountServiceAccountToken: false/g) ?? []).length, 4);
  assert.equal((result.stdout.match(/harakiri.io\/role: control-plane/g) ?? []).length, 4);
  assert.equal((result.stdout.match(/readOnlyRootFilesystem: true/g) ?? []).length, 4);
  assert.match(result.stdout, /NODE_EXTRA_CA_CERTS: "\/var\/run\/harakiri-trust\/ca-bundle.crt"/);
  assert.match(result.stdout, /mountPath: \/tmp/);
  assert.match(result.stdout, /host: "?sandbox-api.apps.example.test"?/);
  assert.match(result.stdout, /RUNTIME_DISABLED_FEATURES: "egress,credential-vault,snapshots,pause-resume"/);
  assert.doesNotMatch(result.stdout, /^kind: (?:Secret|ClusterRole|Role|RoleBinding|ClusterRoleBinding|Ingress|SecurityContextConstraints)$/m);
  assert.doesNotMatch(result.stdout, /https?:\/\/(?:localhost|127\.)|runAsUser:|runAsGroup:|fsGroup:|hostNetwork:|hostPath:/);
  assert.match(result.stdout, new RegExp(`harakiri-api@${digest}`));
});

test("restricted Helm values reject unsafe overrides, not only generator mistakes", () => {
  const values = createConfiguration(fixture())["harakiri-values.json"];
  for (const override of [
    "registry.enabled=true", "rbac.create=true", "serviceAccount.automountServiceAccountToken=true", "secret.create=true",
    "securityContext.runAsUser=1000", "securityContext.readOnlyRootFilesystem=false", "temporaryStorage.enabled=false",
    "securityContext.seccompProfile.type=Unconfined", "securityContext.procMount=Unmasked", "image.api.digest=",
    "podSecurityContext.seccompProfile.type=Unconfined", "config.TEMPLATE_DOCKERFILE_BUILDER=buildkit",
    "config.OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY=1", "config.RUNTIME_DISABLED_FEATURES=egress",
    "config.PUBLIC_API_URL=http://localhost:8080", "extraConfig.PUBLIC_WEB_URL=http://localhost:8080",
    "config.KEYCLOAK_ISSUER=https://wrong.test/realms/harakiri", "config.PERSISTENT_WORKSPACES_ENABLED=1",
    "config.HARAKIRI_RUNTIME_PROVIDER=dev", "extraConfig.EXTERNAL_SECRET_KUBERNETES_ENABLED=1",
    "ingress.enabled=true", "image.api.digest=invalid"
  ]) assert.notEqual(render("harakiri", values, "--set", override).status, 0, override);
});

test("ordinary Helm releases preserve service-account token inheritance", () => {
  const result = render("harakiri", {});
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /automountServiceAccountToken:/);
  const restricted = createConfiguration(fixture())["harakiri-values.json"];
  assert.notEqual(render("harakiri", restricted, "--set", "serviceAccount.automountServiceAccountToken=null").status, 0);
});

test("runtime render pins images and non-root ports while retaining explicit cluster prerequisites", () => {
  const config = createConfiguration(fixture());
  const result = render("opensandbox", config["runtime-values.json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /port = 8080/);
  assert.match(result.stdout, /containerPort: 8080/);
  assert.match(result.stdout, /OPENSANDBOX_SERVER_API_KEY/);
  assert.match(result.stdout, /OPENSANDBOX_SECURE_ACCESS_KEYS/);
  assert.match(result.stdout, /kind: CustomResourceDefinition/);
  assert.match(result.stdout, /kind: ClusterRole/);
  assert.doesNotMatch(result.stdout, /kind: (?:Secret|Route|SecurityContextConstraints)|hostPath:|hostNetwork:|Unconfined|NET_ADMIN|runAsUser:|fsGroup:/);
  const images = [...result.stdout.matchAll(/^\s+image:\s*(.+)$/gm)].map((match) => match[1]);
  assert.equal(images.length, 3);
  for (const image of images) assert.ok(image.includes(digest), image);
  const template = JSON.parse(config["runtime-resources.json"].items[1].data["batchsandbox-template.json"]);
  assert.equal(template.spec.template.spec.automountServiceAccountToken, false);
  assert.equal(template.spec.template.spec.containers[0].securityContext.allowPrivilegeEscalation, false);
});

test("CLI refuses overwrite and produces private, reviewable files without cluster access", () => {
  const dir = mkdtempSync(join(tmpdir(), "harakiri-ocp-"));
  try {
    const path = join(dir, "generated");
    writeFileSync(join(dir, "input.json"), JSON.stringify(fixture()), { mode: 0o600 });
    const run = () => spawnSync(process.execPath, [new URL("configure.mjs", import.meta.url).pathname, join(dir, "input.json"), path], { encoding: "utf8" });
    const first = run(); assert.equal(first.status, 0, first.stderr);
    assert.equal(statSync(join(path, "harakiri-values.json")).mode & 0o777, 0o600);
    assert.notEqual(run().status, 0);
    assert.equal(JSON.parse(readFileSync(join(path, "qualification.json"))).status, "native-validation-pending");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("preflight is explicit, bounded and redacts command output", () => {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    const stdout = args.includes("can-i") ? "yes" : args.includes("api-resources") ? "routes.route.openshift.io" :
      args.includes("secret") ? "DATABASE_URL\nOPEN_SANDBOX_API_KEY\nCONTROL_PLANE_SECRET_KEY\nTEMPLATE_REGISTRY_CREDENTIAL_KEY\napi-key\nkeys\nactive-key\n.dockerconfigjson" : "private-user-data";
    return { status: 0, stdout };
  };
  const report = inspectPrerequisites(fixture(), { kubeconfig: "/reviewed/kubeconfig", context: "isolated-ocp" }, run);
  assert.equal(report.readyForPlatformReview, true);
  assert.doesNotMatch(JSON.stringify(report), /private-user-data|reviewed\/kubeconfig/);
  assert.equal(report.qualification, "native-validation-pending");
  for (const { command, args, options } of calls) {
    assert.equal(command, "oc"); assert.ok(args.includes("isolated-ocp")); assert.equal(options.timeout, 20000);
    assert.ok(["whoami", "get", "api-resources", "auth"].includes(args[7]));
    assert.ok(!args.includes("apply") && !args.includes("delete") && !args.includes("patch"));
  }
  assert.throws(() => inspectPrerequisites(fixture(), { kubeconfig: "relative", context: "x" }, run));
  assert.equal(inspectPrerequisites(fixture(), { kubeconfig: "/k", context: "x" }, () => ({ status: 1, stderr: "sensitive failure" })).readyForPlatformReview, false);
});
