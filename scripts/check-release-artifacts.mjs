import assert from "node:assert/strict";

export async function assertUnpublished({ registry, project, version, component, imageTag }, request = fetch) {
  assert.match(registry, /^[a-z0-9.-]+(?::\d+)?$/);
  assert.match(project, /^[a-z0-9_-]+$/);
  const repositories = component === "all" ? ["harakiri-api", "harakiri-web", "charts/harakiri"] : [`harakiri-${component}`];
  for (const repository of repositories) {
    const tag = repository.startsWith("charts/") ? version : imageTag || version;
    // Harbor's repository path parameter requires a double-encoded slash.
    const url = `https://${registry}/api/v2.0/projects/${project}/repositories/${encodeURIComponent(encodeURIComponent(repository))}/artifacts/${encodeURIComponent(tag)}`;
    const response = await request(url, { signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 404, response.ok
      ? `${repository}:${tag} already exists; published versions are immutable`
      : `Could not establish artifact absence for ${repository}:${tag} (HTTP ${response.status})`);
  }
}

if (process.env.RELEASE_CHECK_ARTIFACTS === "1") {
  try {
    await assertUnpublished({ registry: process.env.HARBOR_REGISTRY, project: process.env.HARBOR_PROJECT,
      version: process.env.RELEASE_VERSION, component: process.env.RELEASE_COMPONENT || "all", imageTag: process.env.RELEASE_IMAGE_TAG });
    console.log("Candidate artifacts do not exist; publication may proceed.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
