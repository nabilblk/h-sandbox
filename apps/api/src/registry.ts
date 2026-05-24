const manifestAccept = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.docker.distribution.manifest.v1+json"
].join(", ");

export type ParsedImageReference = {
  original: string;
  registry: string;
  displayRegistry: string;
  repository: string;
  reference: string;
  referenceType: "tag" | "digest";
};

export type ResolvedImageDigest = ParsedImageReference & {
  digest: string;
  digestPinnedRef: string;
};

const hasRegistry = (firstPart: string) => firstPart.includes(".") || firstPart.includes(":") || firstPart === "localhost";

export const parseImageReference = (input: string): ParsedImageReference => {
  const original = input.trim();
  if (!original) throw new Error("image reference is required");
  const atIndex = original.lastIndexOf("@");
  const beforeDigest = atIndex >= 0 ? original.slice(0, atIndex) : original;
  const digest = atIndex >= 0 ? original.slice(atIndex + 1) : "";
  const slashIndex = beforeDigest.indexOf("/");
  const firstPart = slashIndex >= 0 ? beforeDigest.slice(0, slashIndex) : beforeDigest;
  const explicitRegistry = slashIndex >= 0 && hasRegistry(firstPart);
  const registry = explicitRegistry ? firstPart : "registry-1.docker.io";
  const displayRegistry = registry === "registry-1.docker.io" ? "docker.io" : registry;
  const repositoryWithMaybeTag = explicitRegistry ? beforeDigest.slice(slashIndex + 1) : beforeDigest;
  const lastSlash = repositoryWithMaybeTag.lastIndexOf("/");
  const tagIndex = repositoryWithMaybeTag.lastIndexOf(":");
  const hasTag = tagIndex > lastSlash;
  const repository = (hasTag ? repositoryWithMaybeTag.slice(0, tagIndex) : repositoryWithMaybeTag).trim();
  const normalizedRepository = registry === "registry-1.docker.io" && !repository.includes("/") ? `library/${repository}` : repository;
  const reference = digest || (hasTag ? repositoryWithMaybeTag.slice(tagIndex + 1) : "latest");
  if (!normalizedRepository || !reference) throw new Error(`invalid image reference: ${input}`);
  return {
    original,
    registry,
    displayRegistry,
    repository: normalizedRepository,
    reference,
    referenceType: digest ? "digest" : "tag"
  };
};

const parseAuthenticateHeader = (header: string) => {
  const [, scheme, rest] = header.match(/^(\w+)\s+(.+)$/) ?? [];
  if (!scheme || scheme.toLowerCase() !== "bearer" || !rest) return null;
  const params = new Map<string, string>();
  for (const match of rest.matchAll(/(\w+)="([^"]*)"/g)) params.set(match[1], match[2]);
  const realm = params.get("realm");
  if (!realm) return null;
  return { realm, service: params.get("service"), scope: params.get("scope") };
};

const authToken = async (header: string, fetchImpl: typeof fetch) => {
  const auth = parseAuthenticateHeader(header);
  if (!auth) return null;
  const url = new URL(auth.realm);
  if (auth.service) url.searchParams.set("service", auth.service);
  if (auth.scope) url.searchParams.set("scope", auth.scope);
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`registry auth failed: ${response.status}`);
  const payload = (await response.json()) as { token?: string; access_token?: string };
  return payload.token ?? payload.access_token ?? null;
};

const registryRequest = async (image: ParsedImageReference, fetchImpl: typeof fetch, token?: string, method = "HEAD") =>
  fetchImpl(`https://${image.registry}/v2/${image.repository}/manifests/${image.reference}`, {
    method,
    headers: {
      accept: manifestAccept,
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  });

export const resolveImageDigest = async (input: string, fetchImpl: typeof fetch = fetch): Promise<ResolvedImageDigest> => {
  const image = parseImageReference(input);
  let response = await registryRequest(image, fetchImpl);
  if (response.status === 401) {
    const token = await authToken(response.headers.get("www-authenticate") ?? "", fetchImpl);
    response = await registryRequest(image, fetchImpl, token ?? undefined);
    if (!response.ok && response.status !== 405) throw new Error(`registry manifest lookup failed: ${response.status}`);
    if (response.status === 405) response = await registryRequest(image, fetchImpl, token ?? undefined, "GET");
  } else if (response.status === 405) {
    response = await registryRequest(image, fetchImpl, undefined, "GET");
  }
  if (!response.ok) throw new Error(`registry manifest lookup failed: ${response.status}`);
  const digest = response.headers.get("docker-content-digest") ?? (image.referenceType === "digest" ? image.reference : "");
  if (!digest.startsWith("sha256:")) throw new Error(`registry did not return a sha256 digest for ${input}`);
  return {
    ...image,
    digest,
    digestPinnedRef: `${image.displayRegistry}/${image.repository}@${digest}`
  };
};
