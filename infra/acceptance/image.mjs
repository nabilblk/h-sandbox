import { check, sha256 } from "./context.mjs";

// This fixture consumes one public catalog image, never operator registry credentials.
export async function verifyNativeTemplate(image, request = fetch) {
  const prefix = "core.campus.clusterdiali.me/harakiri/templates/opencode@";
  check(image.startsWith(prefix), "Acceptance template must use the public catalog repository");
  const digest = image.slice(prefix.length);
  check(/^sha256:[a-f0-9]{64}$/.test(digest), "Acceptance template needs an immutable digest");
  const origin = "https://core.campus.clusterdiali.me";
  const auth = await request(`${origin}/service/token?service=harbor-registry&scope=repository:harakiri/templates/opencode:pull`, { signal: AbortSignal.timeout(15000) });
  check(auth.ok, "Anonymous template registry authentication failed");
  const { token } = await auth.json();
  check(typeof token === "string" && token.length > 0, "Anonymous template registry token unavailable");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json" };
  const document = async (kind, expected) => {
    check(/^sha256:[a-f0-9]{64}$/.test(expected), "Invalid template document digest");
    const response = await request(`${origin}/v2/harakiri/templates/opencode/${kind}/${expected}`, { headers, signal: AbortSignal.timeout(15000) });
    check(response.ok, "Template registry document unavailable");
    const bytes = Buffer.from(await response.arrayBuffer());
    check(`sha256:${sha256(bytes)}` === expected, "Template registry document checksum mismatch");
    return JSON.parse(bytes);
  };
  const manifest = await document("manifests", digest);
  check(manifest.config?.digest && !manifest.manifests, "Pin the concrete native template manifest, not an image index");
  const config = await document("blobs", manifest.config.digest);
  check(config.os === "linux" && config.architecture === "amd64", "Template image is not native linux/amd64");
  return { nativeTemplateImage: true, templateManifestSha256: digest.slice(7) };
}
