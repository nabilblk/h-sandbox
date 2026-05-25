# Image Builders

Harakiri builds immutable template images through an `ImageBuilder` contract.
The API, CLI, SDK, and UI should talk about template builds, image imports,
logs, digests, provenance, and scan results without depending on one concrete
builder implementation.

## Builder Contract

The source contract is `apps/api/src/builders/image-builder.ts`.

Every builder returns:

- `imageUri`: digest-pinned image reference used by runtime templates.
- `imageDigest`: immutable digest selected or produced by the builder.
- `provenance`: generic builder metadata with provider details nested under
  `provenance.details`.
- Optional logs, cache metadata, SBOM references, and cleanup hooks.

## Implementations

### Image Import

`ImageImportBuilder` resolves an existing image tag or digest to an immutable
digest-pinned reference. It does not run containers or Kubernetes Jobs. The
template builder worker now uses this implementation for `sourceType=image`.

### Rootless BuildKit

Rootless BuildKit is the default Dockerfile builder for the OSS project. The
Kubernetes implementation is `BuildKitKubernetesBuilder` in
`apps/api/src/builders/buildkit-kubernetes-builder.ts`.

It creates one short-lived Kubernetes Job per Dockerfile build. The Job uses
the existing context-exporter init container to materialize the uploaded
context, then runs `moby/buildkit:rootless` through
`buildctl-daemonless.sh`. The build pushes the generated image to the
configured registry, exports a registry cache, emits deterministic plain
BuildKit progress output, and Harakiri parses the pushed manifest digest from
that output.

The implementation:

1. Runs a per-build Job in rootless mode.
2. Upload build contexts through the storage interface instead of direct SQL
   reads from builder code.
3. Execute Dockerfile builds through BuildKit with registry cache support.
4. Push generated images to the configured registry namespace.
5. Resolve and persist the pushed image digest.
6. Emit generic build logs through `BuildLogStore`.
7. Return generic provenance with BuildKit-specific details under
   `provenance.details`.
8. Keep runtime pull preflight, optional pre-pull, scanning, promotion, and
   retention behavior in Harakiri's template orchestration layer.

The BuildKit provider should not require Docker-in-Docker or privileged
containers for the default local/k0s path.

Key configuration:

- `TEMPLATE_DOCKERFILE_BUILDER=buildkit` selects the default provider.
- `TEMPLATE_BUILDKIT_IMAGE=moby/buildkit:rootless` selects the BuildKit image.
- `TEMPLATE_BUILDKITD_FLAGS=--oci-worker-no-process-sandbox` sets rootless
  daemon flags for the per-build Job.
- `TEMPLATE_BUILDKIT_REGISTRY_INSECURE=1` allows the local k0s HTTP registry.
  The default is enabled only for local/service-style registry hosts.
- `TEMPLATE_DOCKERFILE_BUILDER=kaniko-legacy` opts back into the compatibility
  provider.

### Kaniko Legacy

`KanikoLegacyBuilder` lives in `apps/api/src/builders/kaniko-builder.ts`.
It preserves the current Dockerfile behavior by creating a Kubernetes Job that
runs the existing context-exporter init container and Kaniko build container.
The template worker calls it through the `ImageBuilder` contract and stores
`builder: "kaniko-legacy"` with provider-specific details nested under
`builderDetails`.

The neutral selector is `TEMPLATE_DOCKERFILE_BUILDER=kaniko-legacy`.
`TEMPLATE_LEGACY_DOCKERFILE_BUILDER_IMAGE` selects the legacy container image;
the older `TEMPLATE_BUILDER_KANIKO_IMAGE` name remains a compatibility alias.
The older `TEMPLATE_BUILDER_PROVIDER` selector is also accepted as an alias for
`TEMPLATE_DOCKERFILE_BUILDER`. Both compatibility aliases emit startup
warnings and will not be removed before `0.3.0`.

This provider exists only to keep the prototype path working while the default
Dockerfile builder moves to rootless BuildKit. Generic build state, API
responses, CLI output, SDK types, and website docs should not require Kaniko
terminology for the default flow.

## Migration Order

1. Keep `ImageImportBuilder` as the first contract-backed implementation.
2. Move the current Kaniko Job creation and digest collection behind
   `ImageBuilder`. Done for the legacy provider.
3. Add rootless BuildKit as the default Dockerfile implementation. Done.
4. Rename builder-neutral config keys while keeping compatibility aliases for
   old Kaniko-specific names. Started with `TEMPLATE_DOCKERFILE_BUILDER` and
   `TEMPLATE_LEGACY_DOCKERFILE_BUILDER_IMAGE`; BuildKit-specific knobs now use
   `TEMPLATE_BUILDKIT_*`.
5. Update docs and tests so generic builder behavior is asserted separately
   from provider-specific details.
