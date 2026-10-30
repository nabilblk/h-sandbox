import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { check, origins, until } from "../acceptance/context.mjs";

export const compatibility = JSON.parse(fs.readFileSync(new URL("../../integrations/openwebui/compatibility.json", import.meta.url)));
export const model = compatibility.model;
export const webOrigin = "http://127.0.0.1:28580";
export const adapterOrigin = "http://127.0.0.1:28581";
const postgres = "postgres:16.15-bookworm@sha256:e8a07d2c7579b038938cdba6c539e580e5001caf9ea203d397b5cc83e76bd938";
const registry = "registry:2.8.3@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373";
export const label = "harakiri.openwebui.acceptance";
const nameFor = (ctx, service) => `harakiri-openwebui-${service}-${ctx.identity.id}`;

export function ownedDocker(ctx, service, args, command = []) {
  ctx.guard();
  check(["registry", "bindings", "adapter", "model", "webui"].includes(service), "Unknown owned container");
  const name = nameFor(ctx, service);
  const inspected = JSON.parse(ctx.execute("docker", ["inspect", name], "Inspect owned container"))[0];
  check(inspected.Config?.Labels?.[label] === ctx.identity.id, "Refuse unrelated Docker container");
  return ctx.execute("docker", [...args, name, ...command], `Owned ${service} operation`);
}

function run(ctx, service, image, args, env = {}) {
  ctx.guard();
  const file = `${service}.env`;
  for (const value of Object.values(env)) check(!String(value).includes("\n"), "Invalid environment value");
  ctx.save(file, Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n"));
  return ctx.execute("docker", ["run", "--detach", "--name", nameFor(ctx, service), "--label", `${label}=${ctx.identity.id}`,
    "--network=host", "--env-file", ctx.file(file), ...args, image], `Start owned ${service}`).trim();
}

async function healthy(url, timeout = 180000) {
  await until("Owned service readiness", async () => {
    try { return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok; }
    catch { return false; }
  }, timeout);
}

export async function assertPortsFree() {
  for (const port of [28532, 28580, 28581, 11434, 30500]) {
    await new Promise((resolve, reject) => {
      const socket = net.createServer();
      socket.once("error", () => reject(new Error("OpenWebUI acceptance port already occupied")));
      socket.listen(port, "0.0.0.0", () => socket.close(resolve));
    });
  }
}

export async function buildImages(ctx) {
  const images = {};
  for (const [name, dockerfile, directory] of [
    ["adapter", "integrations/openwebui/Dockerfile", "."],
    ["terminal", "examples/templates/open-terminal/Dockerfile", "examples/templates/open-terminal"]
  ]) {
    ctx.guard();
    const reference = `localhost/harakiri/openwebui-${name}:${ctx.identity.id}`;
    ctx.execute("docker", ["build", "--platform=linux/amd64", "--label", `org.opencontainers.image.revision=${process.env.GITHUB_SHA}`,
      "-f", dockerfile, "-t", reference, directory], `Build candidate ${name}`);
    const imageConfigDigest = ctx.execute("docker", ["image", "inspect", "--format={{.Id}}", reference], "Identify candidate").trim();
    check(/^sha256:[a-f0-9]{64}$/.test(imageConfigDigest), "Invalid image identity");
    images[name] = { reference, imageConfigDigest };
  }
  ctx.execute("docker", ["run", "--rm", "--network=none", images.terminal.reference, "/usr/local/bin/harakiri-open-terminal-smoke"], "Native template smoke");
  ctx.save("openwebui-images.json", images);
  return images;
}

export async function installPrivateRegistry(ctx, candidate, images) {
  ctx.guard();
  const nodes = JSON.parse(ctx.k(["get", "nodes", "-o", "json"])).items;
  check(nodes.length === 1, "Expected one owned node");
  const ip = nodes[0].status.addresses.find(item => item.type === "InternalIP")?.address;
  check(net.isIPv4(ip) && !ip.startsWith("127."), "Invalid owned node address");
  const host = `${ip}:30500`;
  // Trust this run's CA, never disable TLS verification or alter a lab registry.
  ctx.execute("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-subj", "/CN=Harakiri isolated acceptance",
    "-addext", `subjectAltName=IP:${ip},IP:127.0.0.1`, "-addext", "basicConstraints=critical,CA:TRUE",
    "-keyout", ctx.file("registry.key"), "-out", ctx.file("registry.crt")], "Create disposable registry CA");
  run(ctx, "registry", registry, ["--memory=128m", "--cpus=0.5", "--mount", `type=bind,src=${ctx.file("registry.crt")},dst=/certs/registry.crt,readonly`,
    "--mount", `type=bind,src=${ctx.file("registry.key")},dst=/certs/registry.key,readonly`], {
    REGISTRY_HTTP_ADDR: `${ip}:30500`, REGISTRY_HTTP_TLS_CERTIFICATE: "/certs/registry.crt", REGISTRY_HTTP_TLS_KEY: "/certs/registry.key"
  });
  ctx.save("registry-hosts.toml", `server = "https://${host}"\n[host."https://${host}"]\ncapabilities = ["pull", "resolve"]\nca = "ca.crt"\n`);
  ctx.save("registry-cri.toml", 'version = 3\n[plugins."io.containerd.cri.v1.images".registry]\nconfig_path = "/etc/k0s/containerd.d/certs.d"\n');
  for (const directory of [`/etc/docker/certs.d/${host}`, `/etc/k0s/containerd.d/certs.d/${host}`]) {
    ctx.execute("sudo", ["install", "-d", "-m", "0755", directory], "Create owned registry trust directory");
    ctx.execute("sudo", ["install", "-m", "0644", ctx.file("registry.crt"), `${directory}/ca.crt`], "Install owned registry CA");
  }
  ctx.execute("sudo", ["install", "-m", "0644", ctx.file("registry-hosts.toml"), `/etc/k0s/containerd.d/certs.d/${host}/hosts.toml`], "Trust owned registry in CRI");
  ctx.execute("sudo", ["install", "-m", "0644", ctx.file("registry-cri.toml"), "/etc/k0s/containerd.d/openwebui-registry.toml"], "Configure isolated registry trust");
  await until("Owned TLS registry", () => {
    try { ctx.execute("curl", ["--fail", "--silent", "--cacert", ctx.file("registry.crt"), `https://${host}/v2/`], "Verify registry TLS"); return true; }
    catch { return false; }
  });
  const image = `${host}/acceptance/open-terminal:${ctx.identity.id}`;
  ctx.execute("docker", ["tag", images.terminal.reference, image], "Tag runner-local template");
  ctx.execute("docker", ["push", image], "Transfer template only to owned ephemeral registry");

  // The application is unchanged; the derived test image adds only a public CA.
  const caContext = ctx.file("registry-ca-context");
  fs.mkdirSync(caContext);
  fs.copyFileSync(ctx.file("registry.crt"), path.join(caContext, "registry.crt"));
  fs.writeFileSync(path.join(caContext, "Dockerfile"), `FROM ${candidate.images.api.reference}\nCOPY registry.crt /etc/harakiri-acceptance-registry.crt\nENV NODE_EXTRA_CA_CERTS=/etc/harakiri-acceptance-registry.crt\n`);
  const tag = `openwebui-ca-${ctx.identity.id}`;
  const apiImage = `localhost/harakiri/harakiri-api:${tag}`;
  ctx.execute("docker", ["build", "-t", apiImage, caContext], "Add isolated registry public CA");
  images.apiWithRegistryCa = { imageConfigDigest: ctx.execute("docker", ["image", "inspect", "--format={{.Id}}", apiImage], "Identify CA-equipped candidate").trim() };
  const archive = ctx.file("openwebui-api-ca.tar");
  try {
    ctx.execute("docker", ["save", "-o", archive, apiImage], "Export CA-equipped candidate");
    ctx.guard();
    ctx.execute("sudo", ["/usr/local/bin/k0s", "ctr", "--namespace", "k8s.io", "images", "import", archive], "Import CA-equipped candidate");
  } finally { fs.rmSync(archive, { force: true }); }
  const values = ctx.read("workbench-values.json");
  values.image.api.tag = tag;
  values.config.TEMPLATE_BUILDER_JOB_IMAGE = apiImage;
  values.config.TEMPLATE_IMAGE_ALLOW_REGISTRIES += `,${host}`;
  ctx.save("openwebui-values.json", values);
  const manifest = ctx.read("artifact-manifest.json");
  ctx.helm(["upgrade", "harakiri", ctx.file(manifest.charts.harakiri.archive), "-n", "harakiri-preview", "-f", ctx.file("openwebui-values.json"), "--wait", "--timeout", "10m"]);
  await ctx.forwardAll();
  return image;
}

export async function startApplications(ctx, images, template) {
  const secret = () => randomBytes(32).toString("hex");
  const credentials = { adapterKey: secret(), encryptionKey: secret(), databasePassword: secret(), webuiSecret: secret(), password: secret() };
  ctx.save("openwebui-secrets.json", credentials);
  run(ctx, "bindings", postgres, ["--memory=384m", "--cpus=0.5"], {
    POSTGRES_DB: "adapter", POSTGRES_USER: "adapter", POSTGRES_PASSWORD: credentials.databasePassword, PGPORT: "28532"
  });
  await until("Adapter database", () => {
    try { ctx.execute("docker", ["exec", nameFor(ctx, "bindings"), "pg_isready", "-U", "adapter", "-p", "28532"], "Adapter database health"); return true; }
    catch { return false; }
  });
  run(ctx, "adapter", images.adapter.reference, ["--memory=512m", "--cpus=1", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true"], {
    HARAKIRI_API_URL: origins.api, HARAKIRI_API_KEY: ctx.read("client-key.json").token, HARAKIRI_TEMPLATE: template,
    ADAPTER_INSTANCE_ID: `acceptance-${ctx.identity.id}`, ADAPTER_DATABASE_URL: `postgresql://adapter:${credentials.databasePassword}@127.0.0.1:28532/adapter`,
    ADAPTER_ENCRYPTION_KEY: credentials.encryptionKey, OPENWEBUI_ADAPTER_KEY: credentials.adapterKey, ADAPTER_PORT: "28581", ADAPTER_MAX_CONNECTIONS: "8",
    ADAPTER_READY_TIMEOUT_MS: "240000", ADAPTER_TTL_SECONDS: "900"
  });
  await healthy(`${adapterOrigin}/health`);
  run(ctx, "model", model.image, ["--memory=6g", "--cpus=3"], { OLLAMA_NO_CLOUD: "1", OLLAMA_CONTEXT_LENGTH: "16384", OLLAMA_NUM_PARALLEL: "1" });
  await healthy("http://127.0.0.1:11434/api/version");
  ctx.execute("docker", ["exec", nameFor(ctx, "model"), "ollama", "pull", model.name], "Pull pinned local model");
  const inventory = await (await fetch("http://127.0.0.1:11434/api/tags")).json();
  check(inventory.models.some(item => item.name === model.name && item.digest === model.digest), "Model digest mismatch");
  run(ctx, "webui", compatibility.openwebui.image, ["--memory=2g", "--cpus=1"], {
    PORT: "28580", WEBUI_SECRET_KEY: credentials.webuiSecret, ENABLE_COMMUNITY_SHARING: "false", ENABLE_SIGNUP: "true",
    DEFAULT_USER_ROLE: "user", DEFAULT_MODELS: model.name, OLLAMA_BASE_URL: "http://127.0.0.1:11434", ENABLE_OPENAI_API: "false",
    DEFAULT_MODEL_PARAMS: JSON.stringify(model.parameters),
    DEFAULT_MODEL_METADATA: JSON.stringify({ capabilities: { builtin_tools: false, terminal: true } }),
    ENABLE_VERSION_UPDATE_CHECK: "false", ENABLE_AUTOMATIONS: "false", ENABLE_TITLE_GENERATION: "false", ENABLE_TAGS_GENERATION: "false",
    ENABLE_FOLLOW_UP_GENERATION: "false",
    TERMINAL_PROXY_HEADERS: JSON.stringify({ "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-downloads", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" })
  });
  await healthy(`${webOrigin}/health`, 300000);
  return credentials;
}

export function cleanupDocker(ctx) {
  ctx.guard();
  const ids = ctx.execute("docker", ["ps", "-aq", "--filter", `label=${label}=${ctx.identity.id}`], "List owned acceptance containers").trim().split(/\s+/).filter(Boolean);
  for (const id of ids) {
    check(/^[a-f0-9]{12,64}$/.test(id), "Invalid owned container identity");
    const item = JSON.parse(ctx.execute("docker", ["inspect", id], "Verify container cleanup ownership"))[0];
    check(item.Config?.Labels?.[label] === ctx.identity.id, "Container cleanup ownership changed");
    ctx.execute("docker", ["rm", "--force", "--volumes", id], "Clean owned acceptance container");
  }
}
