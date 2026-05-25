import assert from "node:assert/strict";
import test from "node:test";
import { ImageImportBuilder } from "./builders/image-import-builder.js";

test("ImageImportBuilder resolves an image to an immutable digest", async () => {
  const builder = new ImageImportBuilder({
    now: () => new Date("2026-05-24T12:00:00.000Z"),
    resolveImageDigest: async (imageRef) => ({
      original: imageRef,
      registry: "registry.example.com",
      displayRegistry: "registry.example.com",
      repository: "team/app",
      reference: "latest",
      referenceType: "tag",
      digest: "sha256:abc123",
      digestPinnedRef: "registry.example.com/team/app@sha256:abc123"
    })
  });

  const result = await builder.build({
    buildId: "bld_image",
    organizationId: "org_image",
    templateId: "tpl_image",
    source: { type: "image", imageUri: "registry.example.com/team/app:latest" }
  });

  assert.equal(result.imageUri, "registry.example.com/team/app@sha256:abc123");
  assert.equal(result.imageDigest, "sha256:abc123");
  assert.equal(result.provenance.builder, "image-import");
  assert.equal(result.provenance.startedAt, "2026-05-24T12:00:00.000Z");
  assert.deepEqual(result.provenance.details, {
    source: "image-import",
    requestedImage: "registry.example.com/team/app:latest",
    resolvedImage: "registry.example.com/team/app@sha256:abc123",
    buildId: "bld_image",
    templateId: "tpl_image",
    organizationId: "org_image"
  });
});

test("ImageImportBuilder rejects non-image sources", async () => {
  const builder = new ImageImportBuilder();

  await assert.rejects(
    builder.build({
      buildId: "bld_dockerfile",
      organizationId: "org_image",
      templateId: "tpl_image",
      source: {
        type: "dockerfile",
        contextRef: "blob://context",
        dockerfilePath: "Dockerfile",
        buildArgs: {}
      }
    }),
    /cannot build source type dockerfile/
  );
});
