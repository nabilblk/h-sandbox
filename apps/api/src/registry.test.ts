import assert from "node:assert/strict";
import test from "node:test";
import { parseImageReference, resolveImageDigest } from "./registry.js";

test("parseImageReference normalizes Docker Hub shorthand", () => {
  assert.deepEqual(parseImageReference("ubuntu:24.04"), {
    original: "ubuntu:24.04",
    registry: "registry-1.docker.io",
    displayRegistry: "docker.io",
    repository: "library/ubuntu",
    reference: "24.04",
    referenceType: "tag"
  });
});

test("parseImageReference preserves explicit registry and digest", () => {
  assert.deepEqual(parseImageReference("registry.example.com/team/open-agents@sha256:abc"), {
    original: "registry.example.com/team/open-agents@sha256:abc",
    registry: "registry.example.com",
    displayRegistry: "registry.example.com",
    repository: "team/open-agents",
    reference: "sha256:abc",
    referenceType: "digest"
  });
});

test("resolveImageDigest follows registry bearer auth challenge", async () => {
  const requests: Array<{ url: string; authorization?: string | null }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    if (url.includes("/token")) {
      return Response.json({ token: "registry-token" });
    }
    if (!new Headers(init?.headers).get("authorization")) {
      return new Response(null, {
        status: 401,
        headers: {
          "www-authenticate": 'Bearer realm="https://auth.example.com/token",service="registry.example.com",scope="repository:team/open-agents:pull"'
        }
      });
    }
    return new Response(null, {
      status: 200,
      headers: { "docker-content-digest": "sha256:1234" }
    });
  };

  const resolved = await resolveImageDigest("registry.example.com/team/open-agents:dev", fetchImpl as typeof fetch);

  assert.equal(resolved.digest, "sha256:1234");
  assert.equal(resolved.digestPinnedRef, "registry.example.com/team/open-agents@sha256:1234");
  assert.equal(requests.length, 3);
  assert.equal(requests[2].authorization, "Bearer registry-token");
});
