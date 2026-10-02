import { check, origins, sha256, until } from "../acceptance/context.mjs";
import { platformNamespace } from "../acceptance/operator.mjs";

const repository = "core.campus.clusterdiali.me/harakiri/harakiri-api";
const registry = "https://core.campus.clusterdiali.me";
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export async function verifyPublishedApi(pin, request = fetch) {
  check(/^api-\d{4}-\d{2}-\d{2}\.\d+$/.test(pin.release), "Invalid API maintenance release");
  check(/^[a-f0-9]{40}$/.test(pin.source), "API maintenance source must be immutable");
  check(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(pin.version), "Invalid API source version");
  check(digestPattern.test(pin.digest), "API maintenance image must be digest-pinned");
  check(/^[a-f0-9]{64}$/.test(pin.manifestSha256), "API maintenance receipt must be checksum-pinned");
  check(/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(pin.tag), "Invalid API maintenance tag");
  const image = `${repository}:${pin.tag}@${pin.digest}`;
  const document = async (url, digest, headers = {}) => {
    const response = await request(url, { headers, signal: AbortSignal.timeout(30000) });
    check(response.ok, "Published API identity document unavailable");
    const bytes = Buffer.from(await response.arrayBuffer());
    check(sha256(bytes) === digest, "Published API identity checksum mismatch");
    return JSON.parse(bytes);
  };
  const evidence = await document(
    `https://github.com/nabilblk/h-sandbox/releases/download/${pin.release}/api-image.json`,
    pin.manifestSha256
  );
  check(evidence.kind === "harakiri-api-maintenance" && evidence.release === pin.release,
    "Unexpected API release receipt");
  check(evidence.source === pin.source && evidence.version === pin.version && evidence.image === image,
    "Published API release identity mismatch");
  const auth = await request(`${registry}/service/token?service=harbor-registry&scope=repository:harakiri/harakiri-api:pull`,
    { signal: AbortSignal.timeout(15000) });
  check(auth.ok, "Anonymous API registry authentication failed");
  const { token } = await auth.json();
  check(typeof token === "string" && token.length > 0, "Anonymous API registry token unavailable");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json" };
  const registryDocument = (kind, digest) => {
    check(digestPattern.test(digest), "Invalid API registry document digest");
    return document(`${registry}/v2/harakiri/harakiri-api/${kind}/${digest}`, digest.slice(7), headers);
  };
  const index = await registryDocument("manifests", pin.digest);
  const platforms = [];
  for (const architecture of ["amd64", "arm64"]) {
    const descriptors = index.manifests?.filter(item => item.platform?.os === "linux" && item.platform?.architecture === architecture);
    check(descriptors?.length === 1, `Published API needs exactly one linux/${architecture} manifest`);
    const manifest = await registryDocument("manifests", descriptors[0].digest);
    const config = await registryDocument("blobs", manifest.config?.digest);
    check(config.os === "linux" && config.architecture === architecture, "API image architecture mismatch");
    check(config.config?.Labels?.["org.opencontainers.image.revision"] === pin.source &&
      config.config?.Labels?.["org.opencontainers.image.version"] === pin.version, "API image source/version mismatch");
    platforms.push({ architecture, digest: descriptors[0].digest, configDigest: manifest.config.digest });
  }
  return { image, source: pin.source, version: pin.version, release: pin.release, digest: pin.digest, published: true, platforms };
}

export async function installPublishedApi(ctx, pin) {
  ctx.guard();
  const identity = await verifyPublishedApi(pin);
  // Override only the API image in the owned fixture; do not weaken baseline verification.
  const values = ctx.read("harakiri-values.json");
  values.image.api.tag = `${pin.tag}@${pin.digest}`;
  values.config.TEMPLATE_BUILDER_JOB_IMAGE = identity.image;
  ctx.save("published-api-values.json", values);
  const manifest = ctx.read("artifact-manifest.json");
  ctx.helm(["upgrade", "harakiri", ctx.file(manifest.charts.harakiri.archive), "-n", platformNamespace,
    "-f", ctx.file("published-api-values.json"), "--wait", "--timeout", "10m"]);
  await ctx.forwardAll();
  const response = await fetch(`${origins.api}/health`, { signal: AbortSignal.timeout(10000) });
  check(response.ok, "Published API did not become healthy");
  const expectedIds = [pin.digest, identity.platforms.find(item => item.architecture === "amd64").digest];
  await until("Published API running identity", () => {
    const pods = JSON.parse(ctx.k(["-n", platformNamespace, "get", "pods", "-l",
      "app.kubernetes.io/instance=harakiri,app.kubernetes.io/component=api", "-o", "json"]));
    return pods.items.some(pod => !pod.metadata.deletionTimestamp &&
      pod.spec.containers.some(container => container.name === "api" && container.image === identity.image) &&
      pod.status.containerStatuses?.some(container => container.name === "api" && container.ready &&
        expectedIds.some(digest => container.imageID.endsWith(digest))));
  });
  return { ...identity, runningImageVerified: true };
}
