# Template Security

Custom templates execute code supplied by users or automation. The control plane
must treat template builds and generated images as untrusted until policy,
provenance, and digest checks pass.

## Isolation Boundaries

- Authentication: browser users authenticate with Keycloak; automation uses
  Harakiri API keys.
- Authorization: template rows are scoped by `organization_id`; seed templates
  have `organization_id IS NULL`.
- Runtime: OpenSandbox owns sandbox isolation and process execution.
- Control plane: PostgreSQL stores metadata, API keys, builds, routes, audit
  events, and immutable version selection.

## Registry Credentials

`template_registry_credentials` exists in the schema as the future org-level
registry credential table. Secret material should never be stored directly in
PostgreSQL. Store only a `secret_ref` that points to a Kubernetes Secret or
external secret manager entry.

Minimum requirements:

- Separate push and pull credentials where possible.
- Scope credentials to one registry namespace per organization.
- Rotate credentials without changing template IDs.
- Redact usernames, passwords, tokens, and bearer credentials from logs.
- Never return secret material through API, CLI, or UI responses.

## Digest Pinning

Mutable image tags are acceptable as user input, but they are not a safe runtime
contract. Before a version is marked ready:

1. Push or pull the image.
2. Resolve the manifest digest.
3. Store `template_versions.image_digest`.
4. Store the digest on sandbox creation as `sandboxes.template_image_digest`.
5. Prefer a digest-pinned image reference when calling OpenSandbox.

If digest resolution fails, keep the build non-ready and surface the failure.

## Build Args And Env

Build args and env metadata can contain secrets. The API currently stores
`build_args` as JSONB for build reproducibility. The builder phase must add:

- Denylist and allowlist based redaction before log writes.
- Size limits for build args and env schema values.
- Audit events that record key names without values.
- Separate secret injection from normal build args.

## Base Image Policy

The first version can allow arbitrary image references for development. A
production policy should support:

- Allowed registries and base image prefixes.
- Denied registries, tags, and known-bad image digests.
- Optional internal mirror enforcement.
- Warning or blocking on `latest` base tags.
- Optional vulnerability scan gate before promotion.

## SBOM, Scanning, And Provenance

The schema should keep room for:

- SBOM object reference.
- Vulnerability scan status and summary.
- Builder identity.
- Source repository and commit.
- Build context hash.
- Image digest and registry.
- Promotion actor and timestamp.

Scanning/signing can be deferred, but the version metadata should not make those
fields impossible to add later.

## Visibility

Template visibility is product metadata, not a substitute for authorization:

- `private`: visible to the owning organization.
- `internal`: intended for platform-owned defaults and shared internal runtime
  templates.
- `public`: visible as a shared catalog template.

Every read and write path must still check organization scope and avoid exposing
private build logs across tenants.

## Audit Events

The plan requires audit events for template create, build, cancel, promote,
archive, and sandbox creation from a template version. Current code records
create, build create, cancel, retry, promote, and sandbox create. Archive and
builder-completion audit events still need to be added with the builder phase.
